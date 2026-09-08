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

const DEFAULT_ENDPOINT = "http://localhost:3000";

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
  if (first.ok || !/receiving end does not exist|could not establish connection/i.test(first.error ?? "")) {
    return first;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
  } catch (error) {
    return { ok: false, error: `INJECT_FAILED: ${error.message}` };
  }

  return sendMessage(tabId, type);
}

async function sync() {
  const spTab = await findTab("https://sp.srmist.edu.in/*");
  if (!spTab) {
    return {
      ok: false,
      error:
        "Open the SRM Student Portal in a tab and sign in, then run this again.",
    };
  }

  const sp = await ask(spTab.id, "STUDEO_COLLECT_SP", "content-student-portal.js");
  if (!sp.ok) {
    return {
      ok: false,
      error:
        sp.error === "SIGNED_OUT"
          ? "Your Student Portal session has expired. Sign in again, then run this."
          : `Couldn't read the Student Portal (${sp.error}).`,
    };
  }

  const payload = { ...sp.payload };

  // Academia is optional: without it there are no course slots and therefore no
  // timetable, but attendance and marks are still worth syncing on their own.
  const academiaTab = await findTab("https://academia.srmist.edu.in/*");
  if (academiaTab) {
    const academia = await ask(academiaTab.id, "STUDEO_COLLECT_ACADEMIA", "content-academia.js");
    if (academia.ok) Object.assign(payload, academia.payload);
  }

  const base = await endpoint();
  const response = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, error: result.error ?? `Studeo returned ${response.status}.` };
  }

  await chrome.storage.local.set({
    lastSync: Date.now(),
    lastNetId: result.netId,
    lastWrote: result.wrote,
    hadTimetable: Boolean(payload.coursesHtml),
  });

  return { ok: true, ...result };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STUDEO_SYNC") return false;

  sync()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
