/**
 * The coordinator.
 *
 * Content scripts do the fetching, because only they are same-origin with the
 * portals and therefore carry the session cookie. This worker does the posting,
 * because it holds the host permission for Studeo and so isn't subject to CORS
 * preflight games from a page context.
 *
 * Nothing here ever sees a password or a session token. It moves HTML the
 * student is already looking at.
 */

// Production. Local development overrides this from the popup's settings —
// the default has to be the deployed site, because a student installing this
// from campus can't reach a database at all except through Vercel.
const DEFAULT_ENDPOINT = "https://studeo-eight.vercel.app";

async function endpoint() {
  const { studeoEndpoint } = await chrome.storage.local.get("studeoEndpoint");
  return (studeoEndpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

/** Find a tab on a host, so we have somewhere to run a content script. */
async function findTab(pattern) {
  const tabs = await chrome.tabs.query({ url: pattern });
  return tabs[0] ?? null;
}

function sendMessage(tabId, type) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "NO_RESPONSE" });
    });
  });
}

/**
 * Ask a tab's content script to do something, injecting it first if it isn't
 * there.
 *
 * Chrome only auto-injects declared content scripts into pages loaded AFTER the
 * extension was installed. Anyone who installs Studeo with the portal already
 * open — which is everyone, since you have to be signed in to install it
 * usefully — has a tab with no receiver, and sendMessage fails with "Could not
 * establish connection". Telling them to reload the tab works but is a poor
 * first impression, so inject on demand and retry instead.
 */
async function ask(tabId, type, file) {
  const first = await sendMessage(tabId, type);
  if (
    first.ok ||
    !/receiving end does not exist|could not establish connection/i.test(first.error ?? "")
  ) {
    return first;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
  } catch (error) {
    return { ok: false, error: `INJECT_FAILED: ${error.message}` };
  }

  return sendMessage(tabId, type);
}

/**
 * One report per sync, whether it worked or not.
 *
 * The whole point is that a student can press one button, copy one block of
 * text, and have it name the actual failure. Everything in here is structural —
 * URLs, HTTP statuses, byte counts, table counts — so it stays safe to paste
 * into a chat or an issue.
 */
function report({ base, sp, academia, ingest }) {
  return {
    at: new Date().toISOString(),
    studeo: base,
    steps: [
      ...(sp?.trace ?? []).map((entry) => ({ where: "student portal", ...entry })),
      ...(academia?.trace ?? []).map((entry) => ({ where: "academia", ...entry })),
      ...(ingest ? [{ where: "studeo", ...ingest }] : []),
    ],
  };
}

async function sync() {
  const base = await endpoint();

  const spTab = await findTab("https://sp.srmist.edu.in/*");
  if (!spTab) {
    return {
      ok: false,
      error: "Open the SRM Student Portal in a tab and sign in, then run this again.",
      report: report({
        base,
        sp: { trace: [{ step: "find tab", ok: false, why: "no sp.srmist.edu.in tab is open" }] },
      }),
    };
  }

  const sp = await ask(spTab.id, "STUDEO_COLLECT_SP", "content-student-portal.js");

  // Academia is optional: without it there are no course slots and therefore no
  // timetable, but attendance and marks are still worth syncing on their own.
  // Collected even when the Student Portal failed, so one report covers both.
  const academiaTab = await findTab("https://academia.srmist.edu.in/*");
  const academia = academiaTab
    ? await ask(academiaTab.id, "STUDEO_COLLECT_ACADEMIA", "content-academia.js")
    : { ok: false, error: "NO_TAB", trace: [{ step: "find tab", ok: false, why: "no academia.srmist.edu.in tab is open" }] };

  if (!sp.ok) {
    return {
      ok: false,
      error:
        sp.error === "SIGNED_OUT"
          ? "Your Student Portal session has expired. Sign in again, then run this."
          : `Couldn't read the Student Portal (${sp.error}).`,
      report: report({ base, sp, academia }),
    };
  }

  const payload = { ...sp.payload, ...(academia.ok ? academia.payload : {}) };

  let response;
  try {
    response = await fetch(`${base}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Distinguished from every other failure because the fix is completely
    // different: nothing is wrong with the portal or the parsing, Studeo just
    // isn't answering at the address the popup is pointed at.
    return {
      ok: false,
      error: `Couldn't reach Studeo at ${base}. Is it running, and is the address in this popup right?`,
      report: report({
        base,
        sp,
        academia,
        ingest: { step: "POST /api/ingest", ok: false, error: error.message },
      }),
    };
  }

  const result = await response.json().catch(() => ({}));

  const ingestStep = {
    step: "POST /api/ingest",
    ok: response.ok,
    status: response.status,
    sent: Object.keys(payload).filter((key) => payload[key]),
    ...(response.ok ? { wrote: result.wrote } : { error: result.error }),
  };

  if (!response.ok) {
    return {
      ok: false,
      error: result.error ?? `Studeo returned ${response.status}.`,
      report: report({ base, sp, academia, ingest: ingestStep }),
    };
  }

  await chrome.storage.local.set({
    lastSync: Date.now(),
    lastNetId: result.netId,
    lastWrote: result.wrote,
    hadTimetable: Boolean(payload.coursesHtml),
  });

  return {
    ok: true,
    ...result,
    hadTimetable: Boolean(payload.coursesHtml),
    report: report({ base, sp, academia, ingest: ingestStep }),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_SYNC") return false;

  sync()
    .then(async (result) => {
      // Kept even on success: "it synced but my marks are missing" is answered
      // by the same report, and by then the moment has passed.
      await chrome.storage.local.set({ lastReport: result.report });
      sendResponse(result);
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
