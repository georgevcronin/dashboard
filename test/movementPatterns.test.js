const test = require('node:test');
const assert = require('node:assert');
const { computePatternFatigue } = require('../functions/movementPatterns');

const NOW = Date.parse('2026-08-03T12:00:00Z');
const hoursAgo = h => new Date(NOW - h * 3_600_000).toISOString();

test('groups lifts by movement pattern, not by muscle', () => {
  const out = computePatternFatigue([
    { exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-08-03', start: hoursAgo(2) },
    { exercise: 'Incline Barbell Bench Press', kg: 80, reps: 5, date: '2026-08-03', start: hoursAgo(2) },
    { exercise: 'Back Squat', kg: 140, reps: 5, date: '2026-08-03', start: hoursAgo(2) },
  ], undefined, NOW);

  const press = out.find(p => p.pattern === 'press');
  assert.strictEqual(press.sets, 2);
  assert.strictEqual(press.volume, 100 * 5 + 80 * 5);
  assert.ok(out.some(p => p.pattern === 'squat'));
});

test('fatigue decays with time since the pattern was trained', () => {
  const fresh = computePatternFatigue(
    [{ exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-08-03', start: hoursAgo(1) }],
    undefined, NOW)[0];
  const stale = computePatternFatigue(
    [{ exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-07-27', start: hoursAgo(168) }],
    undefined, NOW)[0];

  assert.ok(fresh.fatigue > stale.fatigue, `${fresh.fatigue} should exceed ${stale.fatigue}`);
  assert.ok(fresh.fatigue <= 100 && stale.fatigue >= 0);
});

test('lifts outside the 14-day window are ignored', () => {
  const out = computePatternFatigue(
    [{ exercise: 'Back Squat', kg: 140, reps: 5, date: '2026-07-01', start: hoursAgo(400) }],
    undefined, NOW);
  assert.deepStrictEqual(out, []);
});

test('unknown exercise names are skipped rather than bucketed as "other"', () => {
  const out = computePatternFatigue(
    [{ exercise: 'Nonsense Machine Thing', kg: 50, reps: 10, date: '2026-08-03', start: hoursAgo(2) }],
    undefined, NOW);
  assert.deepStrictEqual(out, []);
});

test('empty and undefined inputs do not throw', () => {
  assert.deepStrictEqual(computePatternFatigue([], undefined, NOW), []);
  assert.deepStrictEqual(computePatternFatigue(undefined, undefined, NOW), []);
});

test('hoursSince reports the most recent session for the pattern', () => {
  const out = computePatternFatigue([
    { exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-07-29', start: hoursAgo(120) },
    { exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-08-02', start: hoursAgo(24) },
  ], undefined, NOW);
  assert.strictEqual(out[0].hoursSince, 24);
});
