// Parsing for the raw Apple Health payload sent by the Shortcuts automation
// (Settings -> Connected Services -> Apple Health -> Setup). Health Sample
// lists don't serialize as JSON arrays in Shortcuts -- they come through as
// plain text, one value per line, in Dictionary fields named
// {metric}_values/{metric}_dates (sleep uses sleep_start/sleep_end/
// sleep_types instead, since it needs durations by stage rather than a
// single quantity). This shape was reverse-engineered from real device
// output during setup, not from any Apple/Shortcuts documentation (none
// exists for this), so it's exactly the kind of fragile format-guessing
// that deserves real test coverage rather than being inlined into index.js.

// Recovers the real fields object from a known Shortcuts quirk: the
// Dictionary action can end up stringified into a single object key instead
// of being sent as the body directly -- e.g. {"{\"hr_values\":...}":{}}, or
// with garbled/duplicated trailing content if a stray Text step doubles it
// up (observed both shapes from real device testing). If the body already
// looks like real fields, it's returned unchanged -- this only kicks in for
// the malformed shape, so a correctly-configured Shortcut is unaffected.
const EXPECTED_KEYS = ['hr_values', 'rhr_values', 'hrv_values', 'bloodoxygen_values', 'steps_values', 'wrist_values', 'sleep_start'];
function unwrapShortcutBody(rawBody) {
  const d = rawBody || {};
  if (EXPECTED_KEYS.some(k => k in d)) return d;
  const keys = Object.keys(d);
  if (keys.length !== 1) return d;
  // Non-greedy: every value in this payload is a flat string (no nested
  // braces), so this isolates just the first complete JSON object even
  // when the key contains a duplicated second copy appended after it.
  const match = keys[0].match(/\{.*?\}/s);
  if (!match) return d;
  try {
    const parsed = JSON.parse(match[0]);
    return EXPECTED_KEYS.some(k => k in parsed) ? parsed : d;
  } catch {
    return d;
  }
}

// Shortcuts' "Start Date"/"End Date" magic variables serialize as
// "19 Jul 2026 at 20:18", not ISO 8601 -- not reliably parseable by
// `new Date(...)` across engines, so parsed explicitly instead.
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseShortcutDate(str) {
  const m = (str || '').trim().match(/^(\d{1,2}) (\w{3}) (\d{4}) at (\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, dayStr, mon, year, hour, min] = m;
  if (!(mon in MONTHS)) return null;
  return new Date(+year, MONTHS[mon], +dayStr, +hour, +min).getTime();
}

// Health Sample lists come through as one value per line -- filters out
// blank lines (an empty field, or a trailing newline) and unparseable ones.
function parseNumberList(str) {
  return (str || '').split('\n').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
}

function average(str) {
  const nums = parseNumberList(str);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function sum(str) {
  const nums = parseNumberList(str);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

// Apple's sleep-stage naming varies (Watch vs. third-party trackers, iOS
// version), so this matches broadly rather than against one exact string.
function isInBedType(type) { return (type || '').toLowerCase().includes('bed'); }
function isAwakeType(type) { return (type || '').toLowerCase().includes('awake'); }
function isAsleepType(type) {
  const t = (type || '').toLowerCase();
  return t.length > 0 && !isInBedType(t) && !isAwakeType(t);
}

// Sums the total time actually covered by a list of [start, end] ranges,
// merging overlaps first rather than adding raw durations. HealthKit often
// reports a single night as multiple overlapping samples for the same
// category -- e.g. a Watch can emit granular AsleepCore/AsleepDeep/AsleepREM
// stage samples *and* a coarse rolled-up AsleepUnspecified sample covering
// that same span -- and naively summing durations double-counts the overlap
// (a real ~8h night has been observed coming through as ~16h this way).
function unionDurationMs(ranges) {
  if (!ranges.length) return 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0, curStart = sorted[0][0], curEnd = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curEnd) { curEnd = Math.max(curEnd, e); }
    else { total += curEnd - curStart; curStart = s; curEnd = e; }
  }
  total += curEnd - curStart;
  return total;
}

// A real night has samples packed close together; the gap to the next
// distinct sleep session is always much larger than any in-night gap
// (awake stretches, sensor dropouts). The Shortcut's "Find Health Samples"
// query has no reliable "since last sync" scoping, so a single sync can
// legitimately bundle more than one calendar night's samples together --
// observed in production sending two full nights (~16h) in one payload
// instead of one (~8h). Splits all entries (regardless of asleep/awake/
// in-bed type -- a session boundary applies to the whole night) into
// contiguous sessions wherever the gap since the latest end-so-far exceeds
// this threshold, keeping only the most recent session.
const SESSION_GAP_MS = 4 * 3_600_000;
function latestSession(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.s - b.s);
  let session = [sorted[0]], maxEnd = sorted[0].e;
  for (let i = 1; i < sorted.length; i++) {
    const entry = sorted[i];
    if (entry.s - maxEnd > SESSION_GAP_MS) session = [];
    session.push(entry);
    maxEnd = Math.max(maxEnd, entry.e);
  }
  return session;
}

// Zips sleep_start/sleep_end/sleep_types (parallel newline-joined lists)
// into total asleep hours, WASO minutes, and sleep efficiency (asleep ÷ in
// bed) for the most recent sleep session only. Mismatched-length lists
// degrade gracefully (an index past the end of a shorter list reads as
// undefined -> excluded, not a crash). Returns null fields where there's
// genuinely no matching data, rather than 0 -- e.g. no Watch means no sleep
// data at all, not zero hours of sleep.
function computeSleepMetrics(startsStr, endsStr, typesStr) {
  const starts = (startsStr || '').split('\n');
  const ends = (endsStr || '').split('\n');
  const types = (typesStr || '').split('\n');

  const entries = [];
  for (let i = 0; i < starts.length; i++) {
    const s = parseShortcutDate(starts[i]);
    const e = parseShortcutDate(ends[i]);
    if (s == null || e == null || e <= s) continue;
    entries.push({ s, e, type: types[i] });
  }

  const session = latestSession(entries);
  const asleepRanges = [], awakeRanges = [], inBedRanges = [];
  for (const { s, e, type } of session) {
    if (isAsleepType(type)) asleepRanges.push([s, e]);
    else if (isAwakeType(type)) awakeRanges.push([s, e]);
    else if (isInBedType(type)) inBedRanges.push([s, e]);
  }

  const asleepMs = unionDurationMs(asleepRanges);
  const awakeMs = unionDurationMs(awakeRanges);
  const inBedMs = unionDurationMs(inBedRanges);

  const asleepHours = asleepRanges.length ? asleepMs / 3_600_000 : null;
  const wasoMin = awakeRanges.length ? Math.round(awakeMs / 60_000) : null;
  const sleepEff = (asleepRanges.length && inBedRanges.length && inBedMs > 0) ? Math.round((asleepMs / inBedMs) * 100) : null;

  return { asleepHours, wasoMin, sleepEff };
}

module.exports = {
  unwrapShortcutBody, parseShortcutDate, parseNumberList, average, sum,
  isAsleepType, isAwakeType, isInBedType, unionDurationMs, computeSleepMetrics,
};
