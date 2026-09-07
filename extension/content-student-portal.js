/**
 * Runs inside sp.srmist.edu.in.
 *
 * Why a content script rather than the service worker: JSESSIONID is almost
 * certainly SameSite=Lax, which means a fetch issued from the extension's own
 * origin counts as cross-site and the cookie is NOT attached — the request
 * comes back as the login page and everything downstream silently sees nothing.
 * A content script's fetch is genuinely same-origin, so the browser attaches
 * the session exactly as it would for a click.
 *
 * This script never reads a cookie, a password, or a token. It asks the portal
 * for pages the student is already entitled to see, and hands back the HTML.
 */

const CONTEXT = "/srmiststudentportal";
const HRD = `${CONTEXT}/students/template/HRDSystem.jsp`;

/** Form ids, mirrored from lib/sources/student-portal.ts. */
const FORMS = {
  profile: 1,
  attendance: 9,
  marks: 13,
  calendar: 129,
};

/**
 * The portal guards its form posts with a per-session token. It's rendered into
 * every page, so read it from the document we're already sitting in, and fall
 * back to fetching a fresh page if this one doesn't carry it.
 */
async function csrfSalt() {
  const fromDom = document.querySelector('input[name="csrfPreventionSalt"]')?.value;
  if (fromDom) return fromDom;

  const response = await fetch(HRD, { credentials: "same-origin" });
  const html = await response.text();
  const match = html.match(/name="csrfPreventionSalt"\s+value="([^"]+)"/i);

  if (!match) throw new Error("SIGNED_OUT");
  return match[1];
}

/** POST a form id and return the rendered page. */
async function fetchForm(formId, salt) {
  const body = new URLSearchParams({
    hdnFormId: String(formId),
    csrfPreventionSalt: salt,
  });

  const response = await fetch(HRD, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) throw new Error(`FORM_${formId}_HTTP_${response.status}`);

  const html = await response.text();

  // The portal answers an expired session with the login page and a 200, so
  // status alone doesn't tell us whether this worked.
  if (/name="password"/i.test(html) && /LoginServlet/i.test(html)) {
    throw new Error("SIGNED_OUT");
  }

  return html;
}

/**
 * Fetch one course's component breakdown.
 *
 * Captured from the portal's own handler:
 *
 *   funViewComponentWiseMarks(id, code, title, status) {
 *     $.post("../../students/report/studentInternalMarkDetailsInner.jsp",
 *            [ {iden:1}, {hdnSubjectId:id}, {status:status} ])
 *   }
 *
 * Note it takes NO csrfPreventionSalt, unlike the HRDSystem form posts. That's
 * the portal's choice, not ours; we send exactly what it asks for.
 */
const MARK_DETAIL_URL = `${CONTEXT}/students/report/studentInternalMarkDetailsInner.jsp`;

async function fetchMarkDetail(subjectId, status) {
  const response = await fetch(MARK_DETAIL_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      iden: "1",
      hdnSubjectId: String(subjectId),
      status: String(status ?? 2),
    }),
  });

  if (!response.ok) throw new Error(`DETAIL_HTTP_${response.status}`);
  return response.text();
}

/**
 * Pull the (courseCode, subjectId, status) triples out of the summary page.
 *
 * Done here rather than server-side because the extension needs them to make
 * the follow-up requests, and re-parsing the same page in two places would be
 * two things to keep in step. The server parses the summary again for its own
 * purposes — that duplication is deliberate and cheap.
 */
function markTargets(summaryHtml) {
  const doc = new DOMParser().parseFromString(summaryHtml, "text/html");
  const targets = [];

  for (const row of doc.querySelectorAll("tbody tr")) {
    const code = row.querySelector("td")?.textContent?.trim();
    const onclick = row.querySelector("[onclick]")?.getAttribute("onclick") ?? "";

    const call = onclick.match(
      /funViewComponentWiseMarks\(\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(\d+)\s*\)/
    );

    if (code && call) {
      targets.push({ courseCode: code, subjectId: call[1], status: Number(call[2]) });
    }
  }

  return targets;
}

async function collect() {
  const salt = await csrfSalt();

  // Sequential, not Promise.all. Seven parallel requests per student is how a
  // few hundred users turn into a load spike on a college server, and the whole
  // job takes under a second either way.
  const profileHtml = await fetchForm(FORMS.profile, salt);

  const optional = {};
  for (const [key, formId] of [
    ["attendanceHtml", FORMS.attendance],
    ["marksHtml", FORMS.marks],
    ["calendarHtml", FORMS.calendar],
  ]) {
    try {
      optional[key] = await fetchForm(formId, salt);
    } catch (error) {
      // A page a student isn't entitled to, or one SRM has disabled, shouldn't
      // fail the whole sync — attendance is worth having without marks.
      console.warn(`[Studeo] skipped ${key}:`, error.message);
    }
  }

  // One extra request per graded course, for the component breakdown the
  // summary page only links to. Sequential and bounded: a semester is under a
  // dozen courses, and firing them in parallel at a college server to save half
  // a second is not a trade worth making.
  const marksDetail = [];
  if (optional.marksHtml) {
    for (const target of markTargets(optional.marksHtml)) {
      try {
        marksDetail.push({
          courseCode: target.courseCode,
          html: await fetchMarkDetail(target.subjectId, target.status),
        });
      } catch (error) {
        // One course's breakdown failing shouldn't lose the others, nor the
        // summary totals we already have.
        console.warn(`[Studeo] skipped marks detail for ${target.courseCode}:`, error.message);
      }
    }
  }

  return {
    profileHtml,
    ...optional,
    ...(marksDetail.length > 0 ? { marksDetail } : {}),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_COLLECT_SP") return false;

  collect()
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true; // keep the channel open for the async reply
});
