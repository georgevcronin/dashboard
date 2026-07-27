async function render() {
  const { settings, queue, progress, paused, log } = await getState();

  document.getElementById("queued-count").textContent = String(queue.draftIds.length);
  document.getElementById("sent-count").textContent = String(progress.sentCount);

  const next = computeNextSlotDateTime(settings, paused);
  document.getElementById("next-send").textContent = next ? `${next.date} ${next.time}` : "—";

  document.getElementById("status-line").textContent = paused
    ? "Paused — no drafts will be sent."
    : queue.draftIds.length === 0
      ? "Idle — queue is empty."
      : "Active";

  document.getElementById("pause-btn").textContent = paused ? "Resume" : "Pause";

  const logEl = document.getElementById("log");
  logEl.innerHTML = "";
  for (const entry of log.slice(0, 20)) {
    const p = document.createElement("p");
    const time = new Date(entry.ts).toLocaleString();
    p.textContent = `${time} — ${entry.message}`;
    logEl.appendChild(p);
  }
}

document.getElementById("queue-btn").addEventListener("click", async () => {
  await queueDraftsFromFolder();
  await render();
});

document.getElementById("pause-btn").addEventListener("click", async () => {
  const { paused } = await getState();
  await messenger.storage.local.set({ paused: !paused });
  await logEvent(!paused ? "Paused." : "Resumed.");
  await render();
});

document.getElementById("clear-btn").addEventListener("click", async () => {
  await messenger.storage.local.set({ queue: { ...DEFAULT_QUEUE }, progress: { ...DEFAULT_PROGRESS } });
  await logEvent("Queue cleared.");
  await render();
});

// Keep the popup live while it's open, in case the background script sends in the background.
messenger.storage.onChanged.addListener(render);

render();
