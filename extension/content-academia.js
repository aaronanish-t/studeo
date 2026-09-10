/**
 * Runs inside academia.srmist.edu.in.
 *
 * Academia supplies exactly one thing the Student Portal cannot: course SLOTS.
 * Without them a timetable is impossible, because "21CSC201J is in slot B" is
 * the only link between a course and a place in the week.
 *
 * Two differences from the Student Portal script:
 *
 *  - Page names are versioned and go stale. The timetable lives at
 *    `My_Time_Table_2023_24` while serving 2026-27 content, so a hardcoded URL
 *    rots. We read the app's own menu to find the real one.
 *  - Those page URLs return HTML FRAGMENTS meant for XHR, not documents. That
 *    suits us: fetching one is exactly what the portal itself does.
 *
 * Like the Student Portal script, every attempt is recorded into a trace that
 * comes back either way. "NO_TIMETABLE_PAGE" on its own can't be acted on; a
 * list of the six URLs tried and what each returned can.
 */

const BASE = "/srm_university/academia-academic-services/page/";

const trace = [];

function step(name, ok, detail) {
  trace.push({ step: name, ok, ...detail });
}

/** Ask the SPA's own navigation which page is the timetable this semester. */
function discoverTimetablePages() {
  const anchors = [...document.querySelectorAll('a[href*="#"]')];

  const found = anchors
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => /time[_\s-]?table|course|academic/i.test(href))
    // "#My_Time_Table_Attendance" -> the hash IS the page key for most routes.
    .map((href) => href.replace(/^.*#/, "").trim())
    .filter(Boolean);

  return [...new Set(found)];
}

/**
 * Candidate page names, best guess first. The menu key and the actual page
 * name don't always match, so we try the discovered ones and then the names
 * observed in the wild before giving up.
 */
function candidates() {
  const known = [
    "My_Time_Table_2023_24",
    "My_Time_Table_2024_25",
    "My_Time_Table_2025_26",
    "My_Time_Table_2026_27",
    "My_Time_Table_",
    "My_Time_Table",
  ];

  return [...new Set([...discoverTimetablePages(), ...known])];
}

function looksLikeCourseTable(html) {
  // The real page has a course-registration table; a 403 or a login redirect
  // has neither of these headers.
  return /Course\s*Code/i.test(html) && /Slot/i.test(html);
}

/**
 * Why a candidate was rejected — the difference between "that URL 404s" and
 * "that URL returns a page with no course table" points at completely
 * different fixes, and both look like NO_TIMETABLE_PAGE from outside.
 */
function verdict(html) {
  if (/login|signin|Zoho Accounts/i.test(html) && html.length < 20000) return "login page";
  if (!/<table/i.test(html)) return "no table in the response";
  if (!/Course\s*Code/i.test(html)) return "table, but no Course Code header";
  if (!/Slot/i.test(html)) return "course table, but no Slot column";
  return "unknown";
}

async function collect() {
  step("page", true, {
    path: location.pathname,
    hash: location.hash.slice(0, 60),
    title: document.title.replace(/\s+/g, " ").trim().slice(0, 80),
  });

  const tried = candidates();
  step("candidates", tried.length > 0, { count: tried.length, pages: tried.slice(0, 8) });

  for (const page of tried) {
    try {
      const response = await fetch(BASE + encodeURIComponent(page), {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        step(page, false, { status: response.status });
        continue;
      }

      const html = await response.text();
      if (looksLikeCourseTable(html)) {
        step(page, true, { status: response.status, bytes: html.length, found: true });
        return { payload: { coursesHtml: html }, trace };
      }

      step(page, false, { status: response.status, bytes: html.length, why: verdict(html) });
    } catch (error) {
      step(page, false, { error: error.message });
    }
  }

  // Last resort: the student may already be looking at the table, in which case
  // it's in the DOM in front of us.
  const rendered = [...document.querySelectorAll("table")].find((table) =>
    looksLikeCourseTable(table.outerHTML)
  );

  if (rendered) {
    step("rendered DOM", true, { bytes: rendered.outerHTML.length, found: true });
    return { payload: { coursesHtml: rendered.outerHTML }, trace };
  }

  step("rendered DOM", false, {
    tablesOnPage: document.querySelectorAll("table").length,
    why: "no table on this page has both a Course Code header and a Slot column",
  });

  throw new Error("NO_TIMETABLE_PAGE");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_COLLECT_ACADEMIA") return false;

  collect()
    .then(({ payload, trace: steps }) => sendResponse({ ok: true, payload, trace: steps }))
    .catch((error) => sendResponse({ ok: false, error: error.message, trace }));

  return true;
});
