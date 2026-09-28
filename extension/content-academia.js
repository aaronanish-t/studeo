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

/**
 * Find the course-registration table in a document, or return null.
 *
 * Matches on a table whose FIRST ROW carries all three headers the server's
 * parser needs. Testing instead whether the words appear anywhere — which is
 * what this used to do — passes on Academia's empty page shell, because Zoho
 * ships those strings as template field names. The cost of that was not a
 * missed table but a false positive: the fetch below reported success on a
 * shell, so this script returned 8KB of nothing and never tried the rendered
 * DOM, which is the only place the table actually exists.
 */
const COURSE_TABLE_HEADERS = ["course code", "course title", "slot"];

function findCourseTable(doc) {
  return (
    [...doc.querySelectorAll("table")].find((table) => {
      const header = [...(table.querySelector("tr")?.querySelectorAll("th, td") ?? [])]
        .map((cell) => cell.textContent.replace(/\s+/g, " ").trim().toLowerCase())
        .join(" | ");

      return COURSE_TABLE_HEADERS.every((needle) => header.includes(needle));
    }) ?? null
  );
}

function looksLikeCourseTable(html) {
  return findCourseTable(new DOMParser().parseFromString(html, "text/html")) !== null;
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

  // The rendered DOM first, deliberately.
  //
  // Academia is a Zoho Creator SPA: fetching a page URL returns a shell that
  // the client then fills in. So the copy sitting in front of the student is
  // the ONLY one with a course table in it, and every fetch below is a
  // fallback for the case where they're on some other page. Trying the
  // fetches first is what made this script post 8KB of empty shell.
  const rendered = findCourseTable(document);
  if (rendered) {
    step("rendered DOM", true, {
      bytes: rendered.outerHTML.length,
      rows: rendered.querySelectorAll("tr").length,
      found: true,
    });
    return { payload: { coursesHtml: rendered.outerHTML }, trace };
  }

  step("rendered DOM", false, {
    tablesOnPage: document.querySelectorAll("table").length,
    hash: location.hash.slice(0, 60),
    why: "no table here has Course Code, Course Title and Slot in its first row — open My Time Table in Academia",
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

  // The DOM was already checked at the top — by the time we get here, neither
  // the rendered page nor any fetched one had a course table.
  throw new Error("NO_TIMETABLE_PAGE");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_COLLECT_ACADEMIA") return false;

  collect()
    .then(({ payload, trace: steps }) => sendResponse({ ok: true, payload, trace: steps }))
    .catch((error) => sendResponse({ ok: false, error: error.message, trace }));

  return true;
});
