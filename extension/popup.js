const button = document.getElementById("sync");
const status = document.getElementById("status");
const endpointInput = document.getElementById("endpoint");

function show(message, kind) {
  status.hidden = false;
  status.textContent = message;
  status.className = kind ?? "";
}

/** "3 courses, 7 attendance rows" — say what actually landed, not just "done". */
function describe(wrote, hadTimetable) {
  const parts = [];
  if (wrote?.courses) parts.push(`${wrote.courses} courses`);
  if (wrote?.attendance) parts.push(`${wrote.attendance} attendance rows`);
  if (wrote?.marks) parts.push(`${wrote.marks} marks`);
  if (wrote?.calendarDays) parts.push(`${wrote.calendarDays} calendar days`);

  const summary = parts.length > 0 ? parts.join(", ") : "nothing new";
  return hadTimetable
    ? `Synced ${summary}.`
    : `Synced ${summary}. Open Academia too to get your timetable.`;
}

async function init() {
  const { studeoEndpoint, lastSync } = await chrome.storage.local.get([
    "studeoEndpoint",
    "lastSync",
  ]);

  endpointInput.value = studeoEndpoint ?? "";

  if (lastSync) {
    const minutes = Math.round((Date.now() - lastSync) / 60000);
    show(
      minutes < 1
        ? "Last synced just now."
        : minutes < 60
          ? `Last synced ${minutes} min ago.`
          : `Last synced ${Math.round(minutes / 60)}h ago.`
    );
  }
}

endpointInput.addEventListener("change", () => {
  const value = endpointInput.value.trim();
  chrome.storage.local.set({ studeoEndpoint: value });
});

button.addEventListener("click", () => {
  button.disabled = true;
  show("Reading your portal pages…");

  chrome.runtime.sendMessage({ type: "STUDEO_SYNC" }, (result) => {
    button.disabled = false;

    if (chrome.runtime.lastError) {
      show(chrome.runtime.lastError.message, "error");
      return;
    }

    if (!result?.ok) {
      show(result?.error ?? "Sync failed.", "error");
      return;
    }

    show(describe(result.wrote, result.hadTimetable !== false), "ok");

    // Land the student in Studeo, signed in. The claim token is good for five
    // minutes, so opening it now is the point.
    if (result.claimUrl) chrome.tabs.create({ url: result.claimUrl });
  });
});

init();
