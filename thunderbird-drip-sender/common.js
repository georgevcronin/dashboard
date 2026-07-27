// Shared constants and pure helper functions used by background.js, popup.js, and options.js.
// Loaded as a plain script (not a module) in all three contexts, so everything here
// becomes a global in whichever page/background script includes it.

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

const DEFAULT_SETTINGS = {
  days: { sun: false, mon: true, tue: true, wed: true, thu: true, fri: true, sat: false },
  startTime: "13:00",
  endTime: "15:00",
  intervalMinutes: 15,
};

const DEFAULT_QUEUE = { draftIds: [], createdAt: null };
const DEFAULT_PROGRESS = { sentCount: 0, lastSentSlotKey: null, lastSentAt: null };

const MAX_LOG_ENTRIES = 50;
const TICK_ALARM_NAME = "drip-sender-tick";

function timeStrToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Every send time for one day, e.g. ["13:00", "13:15", "13:30", ...], never exceeding endTime.
function computeSlotsForDay(settings) {
  const start = timeStrToMinutes(settings.startTime);
  const end = timeStrToMinutes(settings.endTime);
  const interval = Math.max(1, Number(settings.intervalMinutes) || 15);
  const slots = [];
  for (let t = start; t <= end; t += interval) {
    slots.push(minutesToTimeStr(t));
  }
  return slots;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDayAllowed(settings, date) {
  const key = DAY_KEYS[date.getDay()];
  return !!settings.days[key];
}

// The most recent slot time that has already arrived today, or null if the day isn't
// allowed, or "now" is before the first slot. Re-derived from the clock on every call,
// so a late-firing alarm or a reloaded extension always re-checks against the real window.
function getLatestPassedSlot(settings, date) {
  if (!isDayAllowed(settings, date)) return null;
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const slots = computeSlotsForDay(settings);
  let latest = null;
  for (const slot of slots) {
    if (timeStrToMinutes(slot) <= nowMinutes) {
      latest = slot;
    } else {
      break;
    }
  }
  return latest;
}

// Looks ahead up to 8 days (covers a full week even if only one weekday is enabled)
// to find the next slot that hasn't happened yet, for display purposes only.
function computeNextSlotDateTime(settings, paused, fromDate = new Date()) {
  if (paused) return null;
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const candidate = new Date(fromDate);
    candidate.setDate(candidate.getDate() + dayOffset);
    if (!isDayAllowed(settings, candidate)) continue;
    const slots = computeSlotsForDay(settings);
    const floorMinutes = dayOffset === 0 ? fromDate.getHours() * 60 + fromDate.getMinutes() : -1;
    for (const slot of slots) {
      if (timeStrToMinutes(slot) > floorMinutes) {
        return { date: dateKey(candidate), time: slot };
      }
    }
  }
  return null;
}

async function logEvent(message) {
  console.log("[Drip Sender]", message);
  const { log = [] } = await messenger.storage.local.get("log");
  const entry = { ts: Date.now(), message };
  const updated = [entry, ...log].slice(0, MAX_LOG_ENTRIES);
  await messenger.storage.local.set({ log: updated });
}

async function getState() {
  const data = await messenger.storage.local.get(["settings", "queue", "progress", "paused", "log"]);
  return {
    settings: data.settings || DEFAULT_SETTINGS,
    queue: data.queue || DEFAULT_QUEUE,
    progress: data.progress || DEFAULT_PROGRESS,
    paused: !!data.paused,
    log: data.log || [],
  };
}

// Finds every account's Drafts folder (messenger.folders.query requires accountsRead)
// and returns all messages in them, oldest first, so multi-account setups just work.
async function queueDraftsFromFolder() {
  const draftsFolders = await messenger.folders.query({ specialUse: ["drafts"] });
  if (!draftsFolders || draftsFolders.length === 0) {
    await logEvent("Queue Drafts: no Drafts folder found in any account.");
    return { queued: 0 };
  }

  let allHeaders = [];
  for (const folder of draftsFolders) {
    allHeaders = allHeaders.concat(await listAllMessagesInFolder(folder.id));
  }
  allHeaders.sort((a, b) => new Date(a.date) - new Date(b.date));

  const draftIds = allHeaders.map((h) => h.id);
  await messenger.storage.local.set({
    queue: { draftIds, createdAt: Date.now() },
    progress: { ...DEFAULT_PROGRESS },
  });
  await logEvent(`Queue Drafts: queued ${draftIds.length} draft(s) from ${draftsFolders.length} Drafts folder(s).`);
  return { queued: draftIds.length };
}

// messenger.messages.list() pages results (messagesRead permission); continueList()
// walks the rest of the pages until the list is exhausted.
async function listAllMessagesInFolder(folderId) {
  const headers = [];
  let page = await messenger.messages.list(folderId);
  headers.push(...page.messages);
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    headers.push(...page.messages);
  }
  return headers;
}
