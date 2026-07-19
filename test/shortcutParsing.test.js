const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  unwrapShortcutBody, parseShortcutDate, parseNumberList, average, sum,
  isAsleepType, isAwakeType, isInBedType, computeSleepMetrics,
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
