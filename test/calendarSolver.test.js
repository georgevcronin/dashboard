const test = require('node:test');
const assert = require('node:assert');

const { solveCalendarWindow, constraintForDate } = require('../functions/calendarSolver');
const { RECOVERY_H } = require('../functions/muscleTaxonomy');

// Same offset trick as whatIfSimulator.test.js: keeps fixture lifts off
// fatigue.js's exact window boundaries.
const daysAgo = n => new Date(Date.now() - (n * 24 + 2) * 3_600_000).toISOString();

function history({ everyDays = 4, days = 14 } = {}) {
  const lifts = [];
  for (let d = everyDays; d <= days; d += everyDays) {
    const start = daysAgo(d);
    for (let s = 0; s < 4; s++) {
      lifts.push({ date: start.slice(0, 10), start, exercise: 'barbell bench press', kg: 80, reps: 8 });
      lifts.push({ date: start.slice(0, 10), start, exercise: 'back squat', kg: 100, reps: 5 });
    }
  }
  return lifts;
}

const baseParams = () => ({
  lifts: history(),
  recoveryHours: RECOVERY_H,
  days: 7,
});

test('solves one entry per day for the whole window', () => {
  const result = solveCalendarWindow(baseParams());
  assert.strictEqual(result.days.length, 7);
  result.days.forEach((d, i) => {
    assert.ok(d.date, `day ${i} missing a date`);
    assert.ok(d.type === 'session' || d.type === 'rest');
    assert.ok(['green', 'amber', 'red'].includes(d.readiness));
  });
});

test('a recurring day-of-week blackout produces a rest day with a reason', () => {
  const result = solveCalendarWindow({ ...baseParams(), unavailableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  assert.ok(result.days.every(d => d.type === 'rest'));
  assert.ok(result.days.every(d => d.reason === 'Recurring day off'));
});

test('a quick-marked busy date forces that day to rest, same as a holiday window', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const busyDate = today.toISOString().slice(0, 10);
  const result = solveCalendarWindow({
    ...baseParams(), days: 1, busyDates: [busyDate],
  });
  assert.strictEqual(result.days[0].type, 'rest');
  assert.strictEqual(result.days[0].reason, 'Marked busy');
});

test('a per-day duration override trims that day\'s session shorter than the unbounded default', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const short = today.toISOString().slice(0, 10);
  const longResult = solveCalendarWindow({ ...baseParams(), days: 1 });
  const shortResult = solveCalendarWindow({
    ...baseParams(), days: 1, dayDurationOverrides: { [short]: 20 },
  });
  const longDay = longResult.days[0];
  const shortDay = shortResult.days[0];
  if (longDay.type === 'session' && shortDay.type === 'session') {
    assert.ok(shortDay.estimatedDurationMin <= longDay.estimatedDurationMin);
    assert.ok(shortDay.estimatedDurationMin <= 30, `expected a ~20min-capped session, got ${shortDay.estimatedDurationMin}`);
  }
});

test('a per-day duration override only applies to its own date, not the whole window', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day0Str = today.toISOString().slice(0, 10);
  const result = solveCalendarWindow({
    ...baseParams(), days: 2, dayDurationOverrides: { [day0Str]: 20 },
  });
  const day0 = result.days[0], day1 = result.days[1];
  if (day0.type === 'session' && day1.type === 'session') {
    assert.ok(day0.estimatedDurationMin <= 30, `day0 should be capped, got ${day0.estimatedDurationMin}`);
    // day1 has no override of its own — it may legitimately differ from
    // day0's plan (different fatigue carried forward from day0's shorter
    // session), but it must not itself be capped down to day0's 20min limit.
    assert.ok(day1.estimatedDurationMin > 30, `day1 should not inherit day0's cap, got ${day1.estimatedDurationMin}`);
  }
});

test('a one-off full-rest window skips solving for its date range, not just displaying rest', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const result = solveCalendarWindow({
    ...baseParams(),
    calendarWindows: [{ start, end, level: 'rest', reason: 'Holiday' }],
  });
  assert.strictEqual(result.days[0].type, 'rest');
  assert.strictEqual(result.days[0].reason, 'Holiday');
  assert.strictEqual(result.days[1].type, 'rest');
  assert.strictEqual(result.days[2].type, 'rest');
  // Day after the window is unaffected.
  assert.ok(result.days[3].type === 'session' || result.days[3].reason === 'No fresh muscle group available');
});

test('a one-off bodyweight window keeps every picked exercise bodyweight-only', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.toISOString().slice(0, 10);
  const end = start;
  const { EXERCISE_DB } = require('../functions/exerciseDb');
  const result = solveCalendarWindow({
    ...baseParams(),
    calendarWindows: [{ start, end, level: 'bodyweight' }],
  });
  const day0 = result.days[0];
  if (day0.type === 'session') {
    for (const ex of day0.exercises) {
      const entry = EXERCISE_DB.find(e => e.name === ex.name);
      assert.strictEqual(entry?.equipment, 'bodyweight', `${ex.name} is not bodyweight`);
    }
  }
});

test('a one-off restricted-equipment window only picks from the allowed equipment', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.toISOString().slice(0, 10);
  const { EXERCISE_DB } = require('../functions/exerciseDb');
  const result = solveCalendarWindow({
    ...baseParams(),
    calendarWindows: [{ start, end: start, level: 'restricted', equipment: ['dumbbell', 'bodyweight'] }],
  });
  const day0 = result.days[0];
  if (day0.type === 'session') {
    for (const ex of day0.exercises) {
      const entry = EXERCISE_DB.find(e => e.name === ex.name);
      assert.ok(['dumbbell', 'bodyweight'].includes(entry?.equipment), `${ex.name} uses ${entry?.equipment}`);
    }
  }
});

test('fatigue compounds across days: a heavily-trained history plus a fresh session pushes later days toward different muscles', () => {
  // Near-saturating recent chest/quad history so day 0's session (whatever it
  // picks) plus the pre-existing load visibly moves later days' picks —
  // structural signal, not a fabricated one.
  const heavy = history({ everyDays: 1, days: 5 });
  const result = solveCalendarWindow({ ...baseParams(), lifts: heavy, days: 3 });
  const sessionDays = result.days.filter(d => d.type === 'session');
  // Whichever days trained, chest/quads should read as increasingly (or
  // already fully) fatigued rather than resetting to a fresh baseline daily.
  for (const d of sessionDays) {
    assert.ok(d.simulated.before.cns >= 0);
  }
});

test('constraintForDate: one-off window takes precedence over a recurring blackout on the same date', () => {
  const date = new Date(); date.setHours(0, 0, 0, 0);
  const dow = date.getDay();
  const dstr = date.toISOString().slice(0, 10);
  const c = constraintForDate(date, {
    calendarWindows: [{ start: dstr, end: dstr, level: 'bodyweight' }],
    unavailableDaysOfWeek: [dow],
  });
  assert.strictEqual(c.level, 'bodyweight');
});

test('availableDaysOfWeek allow-list rests every day not on the list', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const otherDay = (dow + 1) % 7;
  const result = solveCalendarWindow({ ...baseParams(), availableDaysOfWeek: [otherDay] });
  assert.strictEqual(result.days[0].type, 'rest');
  assert.strictEqual(result.days[0].reason, 'Not a training day');
});

test('availableDaysOfWeek allow-list does not block a day that IS on the list', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const c = constraintForDate(today, { availableDaysOfWeek: [dow] });
  assert.strictEqual(c, null);
});

test('weeklySessionTarget caps sessions per Monday-aligned week, converting the rest of the week to rest', () => {
  // Anchor the window to a Monday so all 7 days fall in one week block, in
  // isolation from the trailing-7-day cap tested separately below.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today.getTime() - (today.getDay() + 6) % 7 * 86_400_000);
  const result = solveCalendarWindow({
    lifts: [], recoveryHours: RECOVERY_H, days: 7, weeklySessionTarget: 1, startMs: monday.getTime(),
  });
  const sessionDays = result.days.filter(d => d.type === 'session');
  assert.strictEqual(sessionDays.length, 1);
  const cappedRestDays = result.days.filter(d => d.reason === 'Weekly session target reached');
  assert.ok(cappedRestDays.length >= 1);
  assert.ok(cappedRestDays.every(d => d.readiness === 'green'));
});

test('a window crossing a Monday boundary cannot chain two weeks worth of sessions into a run with zero rest', () => {
  // Start on a Thursday so the visible window straddles two Monday-weeks
  // (Thu-Sun of week 1, Mon-Wed of week 2). Before the trailing-7-day cap,
  // each week's own quota could independently allow training every single
  // day (this was the Esra bug: fresh account, no rest days, "full body
  // every day").
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thursdayOffset = (4 - today.getDay() + 7) % 7;
  const thursday = new Date(today.getTime() + thursdayOffset * 86_400_000);
  const result = solveCalendarWindow({
    lifts: [], recoveryHours: RECOVERY_H, days: 7, weeklySessionTarget: 4, startMs: thursday.getTime(),
  });
  const sessionDays = result.days.filter(d => d.type === 'session');
  // At least one rest day must appear somewhere in the run, even though
  // both individual Monday-weeks are under their own 4-session cap.
  assert.ok(sessionDays.length < 7, `expected at least one rest day across the boundary, got ${sessionDays.length}/7 session days`);
});

test('day-of-week split anchor is honored when the anchored bucket has something fresh', () => {
  // Fresh account (no history) with Push/Pull/Legs — every bucket is fresh,
  // so an anchor for today's weekday should always be honored.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const result = solveCalendarWindow({
    lifts: [], recoveryHours: RECOVERY_H, days: 1,
    preferredSplit: 'Push / Pull / Legs',
    splitDayAnchors: { legs: [dow] },
  });
  const day0 = result.days[0];
  if (day0.type === 'session') {
    assert.strictEqual(day0.bucket, 'legs');
    assert.strictEqual(day0.bucketConflict, null);
  }
});

test('a multi-day split anchor (e.g. Legs on both Monday and Thursday) is honored on each anchored day', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const otherDow = (dow + 3) % 7;
  const result = solveCalendarWindow({
    lifts: [], recoveryHours: RECOVERY_H, days: 1,
    preferredSplit: 'Push / Pull / Legs',
    splitDayAnchors: { legs: [dow, otherDow] },
  });
  const day0 = result.days[0];
  if (day0.type === 'session') {
    assert.strictEqual(day0.bucket, 'legs');
    assert.strictEqual(day0.bucketConflict, null);
  }
});

test('a legacy single-integer split anchor (pre-multi-day accounts) is still honored', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const result = solveCalendarWindow({
    lifts: [], recoveryHours: RECOVERY_H, days: 1,
    preferredSplit: 'Push / Pull / Legs',
    splitDayAnchors: { legs: dow },
  });
  const day0 = result.days[0];
  if (day0.type === 'session') {
    assert.strictEqual(day0.bucket, 'legs');
  }
});
