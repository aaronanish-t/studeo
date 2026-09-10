const button = document.getElementById("sync");
const status = document.getElementById("status");
const endpointInput = document.getElementById("endpoint");
const diagnostics = document.getElementById("diagnostics");
const reportBox = document.getElementById("report");
const copyButton = document.getElementById("copy");

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

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * One line per step: where it ran, whether it worked, and every detail the step
 * recorded, as key=value.
 *
 * Plain text rather than JSON because the destination is a chat message or an
 * issue, and a wall of braces buries the one line that matters.
 */
function asText(report) {
  if (!report) return "";

  const lines = [
    `Studeo sync report · ${report.at}`,
    `Studeo address: ${report.studeo}`,
    "",
  ];

  for (const { where, step, ok, ...detail } of report.steps) {
    const pairs = Object.entries(detail)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");

    lines.push(`${ok ? "OK  " : "FAIL"}  [${where}] ${step}${pairs ? `  ${pairs}` : ""}`);
  }

  return lines.join("\n");
}

function render(report) {
  if (!report) {
    diagnostics.hidden = true;
    return;
  }

  diagnostics.hidden = false;
  reportBox.textContent = asText(report);

  // A failed step is why anyone opens this, so mark them rather than making
  // someone scan a monospace block for the word FAIL. Reading back innerHTML
  // after setting textContent means we're rewriting already-escaped markup —
  // portal page titles end up in here, and they are not ours to trust.
  reportBox.innerHTML = reportBox.innerHTML.replace(
    /^FAIL.*$/gm,
    (line) => `<b class="bad">${line}</b>`
  );
}

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(reportBox.textContent);
  copyButton.textContent = "Copied";
  setTimeout(() => (copyButton.textContent = "Copy report"), 1500);
});

// ---------------------------------------------------------------------------

async function init() {
  const { studeoEndpoint, lastSync, lastReport } = await chrome.storage.local.get([
    "studeoEndpoint",
    "lastSync",
    "lastReport",
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

  // The last report survives the popup closing, which matters: the popup shuts
  // the moment the claim tab opens, taking the only copy of what happened with
  // it unless we put it back.
  render(lastReport);
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

    render(result?.report);

    if (!result?.ok) {
      show(result?.error ?? "Sync failed.", "error");
      // Open it: a failure the student has to click twice to understand is a
      // failure they'll report as "it just doesn't work".
      diagnostics.open = true;
      return;
    }

    show(describe(result.wrote, result.hadTimetable !== false), "ok");

    // Land the student in Studeo, signed in. The claim token is good for five
    // minutes, so opening it now is the point.
    if (result.claimUrl) chrome.tabs.create({ url: result.claimUrl });
  });
});

init();
