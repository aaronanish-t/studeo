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
 *
 * Every step records what it did into a trace that comes back alongside the
 * payload, on success and on failure. The portal answers an expired session
 * with the login page and a 200, so several very different causes look
 * identical from outside — the trace is how we tell them apart without asking a
 * student to open devtools.
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

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

const trace = [];

function step(name, ok, detail) {
  trace.push({ step: name, ok, ...detail });
}

/**
 * The portal serves an expired session as the login page with a 200, so status
 * alone never tells us whether a request worked.
 */
function isLoginPage(html) {
  return (
    /LoginServlet/i.test(html) ||
    /name\s*=\s*["']?password/i.test(html) ||
    /fpPayload|fpToken/i.test(html) ||
    /captcha/i.test(html)
  );
}

/**
 * A fingerprint of a response, for the trace.
 *
 * Deliberately structural: byte count, table count, page title. No page content
 * comes back here — a student pastes this report to get help, and it has to be
 * safe to paste. The one judgement call is <title>, kept because "SRM Student
 * Portal - Login" versus "Attendance Details" is often the entire diagnosis,
 * and a JSP page title carries no personal data.
 */
function signature(html) {
  const title = html.match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i)?.[1] ?? "";

  return {
    bytes: html.length,
    tables: (html.match(/<table/gi) ?? []).length,
    title: title.replace(/\s+/g, " ").trim().slice(0, 80),
    looksLikeLogin: isLoginPage(html),
  };
}

// ---------------------------------------------------------------------------
// The per-session salt
// ---------------------------------------------------------------------------

/**
 * Find the CSRF salt in a document.
 *
 * Four strategies, because this is the least-verified assumption in the whole
 * extension: nothing in our fixtures is a navigation shell, so the shape of
 * this field is known only from watching the network tab. A single regex that
 * demanded double quotes and one attribute order would fail silently against
 * markup differing in either — and the failure surfaced as "your session
 * expired", which is both wrong and unactionable.
 */
function findSalt(doc) {
  const named = doc.querySelector('input[name="csrfPreventionSalt"]');
  if (named?.value) return { value: named.value, how: "input[name=csrfPreventionSalt]" };

  // Any hidden field that reads like a CSRF token. A JSP app of this age often
  // has more than one spelling in circulation across its pages.
  for (const input of doc.querySelectorAll('input[type="hidden"]')) {
    if (/csrf|salt/i.test(input.name ?? "") && input.value) {
      return { value: input.value, how: `hidden input "${input.name}"` };
    }
  }

  // Some pages carry it only as a script variable, or on the links in their
  // own menu.
  const scripts = [...doc.querySelectorAll("script")]
    .map((element) => element.textContent ?? "")
    .join("\n");

  const inScript = scripts.match(/csrfPreventionSalt\s*[:=]\s*["']([^"']{4,})["']/i);
  if (inScript) return { value: inScript[1], how: "inline script" };

  const href = doc.querySelector('a[href*="csrfPreventionSalt="]')?.getAttribute("href");
  const inHref = href?.match(/csrfPreventionSalt=([^&"']+)/i);
  if (inHref) return { value: decodeURIComponent(inHref[1]), how: "menu link" };

  // Anywhere at all, in any attribute or script, under any of the spellings a
  // JSP app of this age might use.
  const anywhere = (doc.documentElement?.outerHTML ?? "").match(
    /(?:csrfPreventionSalt|csrf[_-]?token|_csrf|CSRFToken)["'\s:=]+([A-Za-z0-9._+/=-]{8,})/i
  );
  if (anywhere) return { value: anywhere[1], how: "loose match in page source" };

  return null;
}

/**
 * What a page that yielded no salt actually contains.
 *
 * Structural only — field NAMES, frame SRCs, form actions. No values, because
 * a value here would be the token itself, and this report is meant to be
 * pasted into a chat. Exists because "NO_SALT_FOUND" on its own cost a whole
 * round trip: it says the four places we looked came up empty without saying
 * what the page had instead.
 */
function describeShell(doc, html) {
  const names = [...doc.querySelectorAll("input")]
    .map((input) => input.name)
    .filter(Boolean);

  const frames = [...doc.querySelectorAll("frame, iframe")]
    .map((frame) => frame.getAttribute("src") ?? "(no src)")
    .slice(0, 6);

  const forms = [...doc.querySelectorAll("form")]
    .map((form) => `${form.getAttribute("method") ?? "get"} ${form.getAttribute("action") ?? "(self)"}`)
    .slice(0, 6);

  return {
    inputNames: names.slice(0, 20),
    inputCount: names.length,
    frames,
    forms,
    // The decisive one: if the string never appears, the salt isn't on this
    // page at all and we're fetching the wrong document.
    mentionsCsrf: /csrf/i.test(html),
    mentionsSalt: /salt/i.test(html),
    headings: [...doc.querySelectorAll("h1,h2,h3,h4,h5")]
      .map((h) => h.textContent.replace(/\s+/g, " ").trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 6),
  };
}

/**
 * The salt, from the page we're sitting in if it has one, otherwise from a
 * freshly fetched shell.
 *
 * Returns null rather than throwing when there is simply no salt to be found:
 * the portal may not require one on every route, and posting without it and
 * reading what comes back is more informative than refusing to try.
 */
async function csrfSalt() {
  const here = findSalt(document);
  if (here) {
    step("csrf-salt", true, { source: "current page", how: here.how });
    return here.value;
  }

  const response = await fetch(HRD, { credentials: "same-origin", cache: "no-store" });
  const html = await response.text();

  if (isLoginPage(html)) {
    step("csrf-salt", false, {
      reason: "SIGNED_OUT",
      status: response.status,
      ...signature(html),
    });
    throw new Error("SIGNED_OUT");
  }

  const fetched = findSalt(new DOMParser().parseFromString(html, "text/html"));
  if (fetched) {
    step("csrf-salt", true, { source: HRD, how: fetched.how, status: response.status });
    return fetched.value;
  }

  // No salt anywhere, but the session is clearly alive. Describe both
  // documents before carrying on: the page the student is looking at and the
  // one we fetched are often not the same thing, and which of them holds the
  // token decides where to look for it.
  step("csrf-salt", false, {
    reason: "NO_SALT_FOUND",
    note: "session looks alive; posting without a salt",
    status: response.status,
    ...signature(html),
    fetched: describeShell(new DOMParser().parseFromString(html, "text/html"), html),
    onScreen: describeShell(document, document.documentElement.outerHTML),
  });
  return null;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** POST a form id and return the rendered page. */
async function fetchForm(name, formId, salt) {
  const body = new URLSearchParams({ hdnFormId: String(formId) });
  if (salt) body.set("csrfPreventionSalt", salt);

  const response = await fetch(HRD, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // The portal is a frames-and-XHR JSP app; some routes vary on this and
      // answer with a bare fragment, which is the thing we want to parse.
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
  });

  if (!response.ok) {
    step(`form ${formId} · ${name}`, false, { status: response.status });
    throw new Error(`FORM_${formId}_HTTP_${response.status}`);
  }

  const html = await response.text();
  const sig = signature(html);

  if (sig.looksLikeLogin) {
    step(`form ${formId} · ${name}`, false, {
      reason: "SIGNED_OUT",
      status: response.status,
      ...sig,
    });
    throw new Error("SIGNED_OUT");
  }

  // A form post that comes back with no table at all is the portal declining
  // without saying so — most likely a rejected salt. Flag it as suspect here
  // rather than letting the parser fail later with something that reads like
  // our bug.
  step(`form ${formId} · ${name}`, true, {
    status: response.status,
    ...sig,
    // A report page with no table is the portal declining without saying so.
    // Describe what came back instead, so the next step is a fix rather than
    // another round trip: four near-identical table-less responses mean
    // hdnFormId was ignored and we were handed the landing page.
    ...(sig.tables === 0
      ? {
          suspect: "no <table> in the response",
          ...describeShell(new DOMParser().parseFromString(html, "text/html"), html),
        }
      : {}),
  });

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
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
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

// ---------------------------------------------------------------------------

/**
 * The headers each report is found by, mirrored from lib/sources/*. The server
 * locates tables by header text, so if a table with these headers is on screen,
 * handing over the whole rendered page is enough for it to find.
 */
const REPORT_HEADERS = {
  profile: ["student name", "register no"],
  attendance: ["code", "max. hours", "att. hours"],
  marks: ["code", "mark / max. mark"],
  calendar: ["date", "day order"],
};

/**
 * The rendered page, but only when it actually holds the report we want.
 *
 * Same lesson Academia taught: a fetch can return a shell while the real table
 * sits in front of the student. Returning the whole document is deliberate —
 * the server finds tables by header text, so it will pick the right one out,
 * and guessing at boundaries here would be a second place to get it wrong.
 * Gated on the headers actually being present so we never post a page that
 * only makes the parser fail somewhere else.
 */
function renderedReport(kind) {
  const needles = REPORT_HEADERS[kind];

  const match = [...document.querySelectorAll("table")].some((table) => {
    const header = [...(table.querySelector("tr")?.querySelectorAll("th, td") ?? [])]
      .map((cell) => cell.textContent.replace(/\s+/g, " ").trim().toLowerCase())
      .join(" | ");

    return needles.every((needle) => header.includes(needle));
  });

  return match ? document.documentElement.outerHTML : null;
}

async function collect() {
  step("page", true, {
    path: location.pathname,
    title: document.title.replace(/\s+/g, " ").trim().slice(0, 80),
  });

  const salt = await csrfSalt();

  // Sequential, not Promise.all. Seven parallel requests per student is how a
  // few hundred users turn into a load spike on a college server, and the whole
  // job takes under a second either way.
  /**
   * Fetch a report, preferring whichever copy actually contains a table.
   *
   * The fetch is still first — it reaches all four reports without the student
   * navigating anywhere, which is the whole point of a one-click sync. But when
   * it comes back without the table (the portal ignoring hdnFormId and serving
   * its landing page), the rendered document is the better answer if the
   * student happens to be looking at that very report.
   */
  const get = async (kind, formId) => {
    let fetched = null;

    try {
      fetched = await fetchForm(kind, formId, salt);
    } catch (error) {
      // A dead session fails every subsequent request the same way, so stop
      // and say so once. Anything else — a page this student isn't entitled
      // to, one SRM has disabled — shouldn't cost us the other reports.
      if (error.message === "SIGNED_OUT") throw error;
    }

    if (fetched && /<table/i.test(fetched)) return fetched;

    const onScreen = renderedReport(kind);
    if (onScreen) {
      step(`${kind} from rendered page`, true, {
        bytes: onScreen.length,
        why: "the fetched copy had no table; this one is on screen",
      });
      return onScreen;
    }

    return fetched;
  };

  const profileHtml = await get("profile", FORMS.profile);

  const optional = {};
  for (const [key, kind, formId] of [
    ["attendanceHtml", "attendance", FORMS.attendance],
    ["marksHtml", "marks", FORMS.marks],
    ["calendarHtml", "calendar", FORMS.calendar],
  ]) {
    const html = await get(kind, formId);
    if (html) optional[key] = html;
  }

  // One extra request per graded course, for the component breakdown the
  // summary page only links to. Sequential and bounded: a semester is under a
  // dozen courses, and firing them in parallel at a college server to save half
  // a second is not a trade worth making.
  const marksDetail = [];
  if (optional.marksHtml) {
    const targets = markTargets(optional.marksHtml);
    let failed = 0;

    for (const target of targets) {
      try {
        marksDetail.push({
          courseCode: target.courseCode,
          html: await fetchMarkDetail(target.subjectId, target.status),
        });
      } catch {
        // One course's breakdown failing shouldn't lose the others, nor the
        // summary totals we already have.
        failed++;
      }
    }

    step("marks detail", targets.length === 0 || marksDetail.length > 0, {
      graded: targets.length,
      fetched: marksDetail.length,
      failed,
      ...(targets.length === 0
        ? { suspect: "no View Details buttons found on the marks page" }
        : {}),
    });
  }

  return {
    payload: {
      profileHtml,
      ...optional,
      ...(marksDetail.length > 0 ? { marksDetail } : {}),
    },
    trace,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_COLLECT_SP") return false;

  collect()
    .then(({ payload, trace: steps }) => sendResponse({ ok: true, payload, trace: steps }))
    // The trace goes back on failure too — that is the case it exists for.
    .catch((error) => sendResponse({ ok: false, error: error.message, trace }));

  return true; // keep the channel open for the async reply
});
