const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  unwrapShortcutBody, parseShortcutDate, parseNumberList, average, sum,
  isAsleepType, isAwakeType, isInBedType, isDeepType, isRemType, isLightType,
  unionDurationMs, computeSleepMetrics,
} = require('../functions/shortcutParsing');

test('unwrapShortcutBody returns a body unchanged when it already has real fields', () => {
  const body = { hr_values: '60\n62', hr_dates: '19 Jul 2026 at 08:00\n19 Jul 2026 at 09:00' };
  assert.deepEqual(unwrapShortcutBody(body), body);
});

test('unwrapShortcutBody recovers the real fields from the single-stringified-key shape', () => {
  const real = { hr_values: '60\n62', steps_values: '100', sleep_start: '' };
  const malformed = { [JSON.stringify(real)]: {} };
  assert.deepEqual(unwrapShortcutBody(malformed), real);
});

test('unwrapShortcutBody recovers real fields even with a duplicated/garbled trailing copy', () => {
  const real = { hr_values: '60\n62', steps_values: '100', sleep_start: '' };
  const duplicated = JSON.stringify(real) + JSON.stringify(real);
  const malformed = { ['sd' + duplicated]: [] };
  assert.deepEqual(unwrapShortcutBody(malformed), real);
});

test('unwrapShortcutBody falls back to the original body when nothing recoverable is found', () => {
  const body = { foo: 'bar' };
  assert.deepEqual(unwrapShortcutBody(body), body);
});

test('parseShortcutDate parses the "D Mon YYYY at HH:MM" format Shortcuts sends', () => {
  const ms = parseShortcutDate('19 Jul 2026 at 20:18');
  const d = new Date(ms);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6); // July, 0-indexed
  assert.equal(d.getDate(), 19);
  assert.equal(d.getHours(), 20);
  assert.equal(d.getMinutes(), 18);
});

test('parseShortcutDate returns null for empty or unparseable strings', () => {
  assert.equal(parseShortcutDate(''), null);
  assert.equal(parseShortcutDate('not a date'), null);
  assert.equal(parseShortcutDate(undefined), null);
});

test('parseNumberList splits on newlines and drops blank/unparseable lines', () => {
  assert.deepEqual(parseNumberList('60\n62\n\n64'), [60, 62, 64]);
  assert.deepEqual(parseNumberList(''), []);
  assert.deepEqual(parseNumberList(undefined), []);
});

test('average and sum match real observed Steps data shape', () => {
  const values = '132\n4\n13\n51\n161';
  assert.equal(sum(values), 361);
  assert.ok(Math.abs(average(values) - 72.2) < 0.01);
});

test('average and sum return null (not 0) for an empty field — no Watch means no data, not zero', () => {
  assert.equal(average(''), null);
  assert.equal(sum(''), null);
});

test('isAsleepType/isAwakeType/isInBedType match broadly, case-insensitively', () => {
  assert.ok(isAsleepType('Asleep'));
  assert.ok(isAsleepType('AsleepDeep'));
  assert.ok(isAsleepType('asleepREM'));
  assert.ok(!isAsleepType('Awake'));
  assert.ok(!isAsleepType('InBed'));
  assert.ok(!isAsleepType(''));
  assert.ok(isAwakeType('Awake'));
  assert.ok(isInBedType('In Bed'));
});

test('computeSleepMetrics sums genuine sleep-stage durations, excluding In Bed and Awake', () => {
  const starts = '19 Jul 2026 at 23:00\n20 Jul 2026 at 01:00\n20 Jul 2026 at 02:00\n19 Jul 2026 at 22:55';
  const ends = '20 Jul 2026 at 01:00\n20 Jul 2026 at 01:15\n20 Jul 2026 at 07:00\n20 Jul 2026 at 07:05';
  const types = 'AsleepCore\nAwake\nAsleepDeep\nInBed';
  const { asleepHours, wasoMin, sleepEff } = computeSleepMetrics(starts, ends, types);
  // Core: 2h, Deep: 5h -> 7h asleep. Awake: 15min. In Bed: 8h10m.
  assert.ok(Math.abs(asleepHours - 7) < 0.01);
  assert.equal(wasoMin, 15);
  assert.ok(sleepEff > 0 && sleepEff <= 100);
});

test('computeSleepMetrics returns nulls when there is no sleep data at all', () => {
  const { asleepHours, wasoMin, sleepEff } = computeSleepMetrics('', '', '');
  assert.equal(asleepHours, null);
  assert.equal(wasoMin, null);
  assert.equal(sleepEff, null);
});

test('computeSleepMetrics ignores entries with a bad or inverted time range', () => {
  const { asleepHours } = computeSleepMetrics('19 Jul 2026 at 23:00', '19 Jul 2026 at 22:00', 'Asleep');
  assert.equal(asleepHours, null, 'end before start should be dropped, not produce negative hours');
});

test('unionDurationMs merges overlapping ranges instead of summing raw durations', () => {
  const hour = 3_600_000;
  // Two ranges covering the same 8h span -- naive summing gives 16h, the
  // real elapsed time is 8h.
  assert.equal(unionDurationMs([[0, 8 * hour], [0, 8 * hour]]), 8 * hour);
  // Partial overlap: [0,8h) and [4h,10h) union to [0,10h).
  assert.equal(unionDurationMs([[0, 8 * hour], [4 * hour, 10 * hour]]), 10 * hour);
  // Disjoint ranges just add up.
  assert.equal(unionDurationMs([[0, 2 * hour], [4 * hour, 6 * hour]]), 4 * hour);
  assert.equal(unionDurationMs([]), 0);
});

test('computeSleepMetrics merges a stage breakdown and a coarse rolled-up sample covering the same night instead of doubling it', () => {
  // Real observed HealthKit shape: granular Core/Deep/REM stage samples for
  // 23:00-07:00, plus a coarse AsleepUnspecified sample covering the same
  // 23:00-07:00 span from a rolled-up source -- a naive sum would report 16h
  // for one real 8h night.
  const starts = '19 Jul 2026 at 23:00\n20 Jul 2026 at 01:00\n20 Jul 2026 at 03:00\n19 Jul 2026 at 23:00';
  const ends = '20 Jul 2026 at 01:00\n20 Jul 2026 at 03:00\n20 Jul 2026 at 07:00\n20 Jul 2026 at 07:00';
  const types = 'AsleepCore\nAsleepDeep\nAsleepREM\nAsleepUnspecified';
  const { asleepHours } = computeSleepMetrics(starts, ends, types);
  assert.ok(Math.abs(asleepHours - 8) < 0.01, `expected ~8h, got ${asleepHours}`);
});

test('computeSleepMetrics keeps only the most recent night when a payload bundles two nights, instead of summing both', () => {
  // Real observed production shape: the Shortcut's Health Samples query
  // isn't scoped to "since last sync", so one payload contained an ~8h
  // session ending the morning before AND an ~8h session ending this
  // morning, separated by a ~15h waking gap -- summing both reported 16.2h
  // for a single day instead of the real ~8h last night.
  const starts = '21 Jul 2026 at 23:00\n22 Jul 2026 at 23:10';
  const ends = '22 Jul 2026 at 07:00\n23 Jul 2026 at 07:00';
  const types = 'Sleep\nSleep';
  const { asleepHours } = computeSleepMetrics(starts, ends, types);
  assert.ok(Math.abs(asleepHours - 7.833) < 0.01, `expected ~7.83h (last night only), got ${asleepHours}`);
});

test('computeSleepMetrics treats close-together entries (a normal night with brief wake-ups) as one session, not separate nights', () => {
  const starts = '19 Jul 2026 at 23:00\n20 Jul 2026 at 02:00\n20 Jul 2026 at 02:05';
  const ends = '20 Jul 2026 at 02:00\n20 Jul 2026 at 02:05\n20 Jul 2026 at 07:00';
  const types = 'Asleep\nAwake\nAsleep';
  const { asleepHours, wasoMin } = computeSleepMetrics(starts, ends, types);
  // 23:00-02:00 (3h) + 02:05-07:00 (4h55m) = 7h55m asleep, minus the 5min awake gap.
  assert.ok(Math.abs(asleepHours - 7.9167) < 0.01, `expected ~7h55m across the whole night, got ${asleepHours}`);
  assert.equal(wasoMin, 5);
});

test('isDeepType/isRemType/isLightType match broadly, and "Core" counts as light (Apple\'s name for the same stage)', () => {
  assert.ok(isDeepType('AsleepDeep'));
  assert.ok(!isDeepType('AsleepREM'));
  assert.ok(isRemType('AsleepREM'));
  assert.ok(isRemType('REM'));
  assert.ok(!isRemType('AsleepDeep'));
  assert.ok(isLightType('AsleepCore'));
  assert.ok(isLightType('Core'));
  assert.ok(isLightType('Light'));
  assert.ok(!isLightType('AsleepDeep'));
});

test('computeSleepMetrics breaks out deep/REM/light stage minutes from real Watch-reported stage values', () => {
  // Real observed shape once the Shortcut's Type/Value bug was fixed:
  // Core/REM/Deep/Awake instead of one flat "Sleep" value for everything.
  const starts = '22 Jul 2026 at 23:00\n23 Jul 2026 at 01:00\n23 Jul 2026 at 01:30\n23 Jul 2026 at 03:00\n23 Jul 2026 at 03:10';
  const ends = '23 Jul 2026 at 01:00\n23 Jul 2026 at 01:30\n23 Jul 2026 at 03:00\n23 Jul 2026 at 03:10\n23 Jul 2026 at 07:00';
  const types = 'Core\nDeep\nCore\nREM\nCore';
  const { asleepHours, deepMin, remMin, lightMin } = computeSleepMetrics(starts, ends, types);
  assert.ok(Math.abs(asleepHours - 8) < 0.01, `expected 8h total asleep, got ${asleepHours}`);
  assert.equal(deepMin, 30);
  assert.equal(remMin, 10);
  assert.equal(lightMin, 2 * 60 + 90 + 230); // 23:00-01:00 (120) + 01:30-03:00 (90) + 03:10-07:00 (230)
});

test('computeSleepMetrics returns null stage minutes when the source only reports a flat generic value, not 0', () => {
  const { deepMin, remMin, lightMin, asleepHours } = computeSleepMetrics(
    '22 Jul 2026 at 23:00', '23 Jul 2026 at 07:00', 'Sleep'
  );
  assert.equal(deepMin, null);
  assert.equal(remMin, null);
  assert.equal(lightMin, null);
  assert.ok(Math.abs(asleepHours - 8) < 0.01, 'total asleep hours should still be real even with no stage breakdown');
});
