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
 */

const BASE = "/srm_university/academia-academic-services/page/";

/** Ask the SPA's own navigation which page is the timetable this semester. */
function discoverTimetablePage() {
  const anchors = [...document.querySelectorAll('a[href^="#"]')];

  const link = anchors.find((a) =>
    /time[_\s]?table/i.test(a.getAttribute("href") ?? "")
  );
  if (!link) return null;

  // "#My_Time_Table_Attendance" -> the hash IS the page key for most routes.
  return (link.getAttribute("href") ?? "").replace(/^#/, "") || null;
}

/**
 * Candidate page names, best guess first. The menu key and the actual page
 * name don't always match, so we try the discovered one and then the names
 * observed in the wild before giving up.
 */
function candidates() {
  const discovered = discoverTimetablePage();
  const known = [
    "My_Time_Table_2023_24",
    "My_Time_Table_2024_25",
    "My_Time_Table_",
    "My_Time_Table",
  ];

  return [discovered, ...known].filter(Boolean);
}

function looksLikeCourseTable(html) {
  // The real page has a course-registration table; a 403 or a login redirect
  // has neither of these headers.
  return /Course\s*Code/i.test(html) && /Slot/i.test(html);
}

async function collect() {
  for (const page of candidates()) {
    try {
      const response = await fetch(BASE + encodeURIComponent(page), {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) continue;

      const html = await response.text();
      if (looksLikeCourseTable(html)) return { coursesHtml: html };
    } catch {
      // Try the next candidate.
    }
  }

  // Last resort: the student may already be looking at the table, in which case
  // it's in the DOM in front of us.
  const rendered = [...document.querySelectorAll("table")].find((table) =>
    looksLikeCourseTable(table.outerHTML)
  );
  if (rendered) return { coursesHtml: rendered.outerHTML };

  throw new Error("NO_TIMETABLE_PAGE");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_COLLECT_ACADEMIA") return false;

  collect()
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
