// Core scheduling/sending logic. Runs as an event page: Thunderbird can terminate it
// when idle, so we never rely on setTimeout/setInterval state surviving — everything
// that matters (queue, progress, settings) lives in storage.local, and the alarms API
// is what wakes this script back up.

// (Re-)register the recurring wake-up alarm. Safe to call on every load: creating an
// alarm with the same name replaces the existing schedule rather than duplicating it.
messenger.alarms.create(TICK_ALARM_NAME, { periodInMinutes: 1 });

messenger.runtime.onInstalled.addListener(async () => {
  const existing = await messenger.storage.local.get(["settings", "queue", "progress", "paused"]);
  const toSet = {};
  if (!existing.settings) toSet.settings = DEFAULT_SETTINGS;
  if (!existing.queue) toSet.queue = DEFAULT_QUEUE;
  if (!existing.progress) toSet.progress = DEFAULT_PROGRESS;
  if (existing.paused === undefined) toSet.paused = false;
  if (Object.keys(toSet).length) await messenger.storage.local.set(toSet);
});

messenger.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK_ALARM_NAME) return;
  checkAndSend();
});

// Also run once when the background script wakes up (e.g. Thunderbird just started),
// in case the alarm that should have fired while it was closed never got a chance to.
checkAndSend();

async function checkAndSend() {
  const { settings, queue, progress, paused } = await getState();

  if (paused) return;
  if (!queue.draftIds || queue.draftIds.length === 0) return;

  const now = new Date();

  // Re-check the window from scratch every time: covers a late-firing alarm, a
  // just-reloaded extension, or a Thunderbird restart mid-schedule.
  const slot = getLatestPassedSlot(settings, now);
  if (!slot) return;

  const slotKey = `${dateKey(now)}T${slot}`;
  if (progress.lastSentSlotKey === slotKey) return; // already handled this slot

  const nextId = queue.draftIds[0];
  const remainingIds = queue.draftIds.slice(1);

  let sent = false;
  let logMessage;
  try {
    const tab = await messenger.compose.beginNew(nextId);
    await messenger.compose.sendMessage(tab.id, { mode: "sendNow" });
    sent = true;
    logMessage = `Sent draft ${nextId} in slot ${slotKey}.`;
  } catch (err) {
    // Message might have been deleted/edited/sent elsewhere, or the send itself failed.
    // Either way: log it and move on to the next draft rather than getting stuck.
    logMessage = `Skipped draft ${nextId} in slot ${slotKey} (${err && err.message ? err.message : err}).`;
  }

  await messenger.storage.local.set({
    queue: { draftIds: remainingIds, createdAt: queue.createdAt },
    progress: {
      sentCount: progress.sentCount + (sent ? 1 : 0),
      lastSentSlotKey: slotKey,
      lastSentAt: Date.now(),
    },
  });
  await logEvent(logMessage);
}

// Folder-pane context menu entry, per the spec's "toolbar button or context menu on
// the Drafts folder" requirement. Always (re-)snapshots every account's Drafts folder,
// regardless of which folder was right-clicked.
messenger.menus.create({
  id: "drip-sender-queue-drafts",
  title: "Queue Drafts for Drip Sending",
  contexts: ["folder_pane"],
});

messenger.menus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "drip-sender-queue-drafts") {
    await queueDraftsFromFolder();
  }
});
