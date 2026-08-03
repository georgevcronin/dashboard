const test = require('node:test');
const assert = require('node:assert');
const { buildUnifiedTimeline } = require('../functions/analyticsEngine');

const db = {
  workouts: [{ date: '2026-08-01', name: 'Upper A', exercises: [{ name: 'Bench Press' }] }],
  lifts: [{ date: '2026-07-30', exercise: 'Bench Press', kg: 100, reps: 5 }],
  metrics: { '2026-08-02': { sleep_hours: 8, sleep_eff: 92 }, '2026-08-03': { steps: 4000 } },
  injuries: [{ ts: Date.parse('2026-07-28T09:00:00Z'), area: 'shoulder', severity: 'mild', resolved: false }],
  soreness: [{ ts: Date.parse('2026-08-01T20:00:00Z'), muscle: 'chest', score: 4 }],
  thoughts: [{ date: '2026-07-29', text: 'felt strong' }],
};

test('timeline is sorted newest first', () => {
  const t = buildUnifiedTimeline(db);
  for (let i = 0; i < t.length - 1; i++) assert.ok(t[i].ts >= t[i + 1].ts);
});

test('timeline includes every populated source once', () => {
  const types = buildUnifiedTimeline(db).map(e => e.type).sort();
  assert.deepStrictEqual(types, ['injury', 'lift', 'sleep', 'soreness', 'thought', 'workout']);
});

test('metrics days without sleep are skipped', () => {
  const sleep = buildUnifiedTimeline(db).filter(e => e.type === 'sleep');
  assert.strictEqual(sleep.length, 1);
  assert.strictEqual(sleep[0].date, '2026-08-02');
});

test('empty and undefined dbs do not throw', () => {
  assert.deepStrictEqual(buildUnifiedTimeline({}), []);
  assert.deepStrictEqual(buildUnifiedTimeline(), []);
});

test('ts-keyed entries get a date string', () => {
  const s = buildUnifiedTimeline(db).find(e => e.type === 'soreness');
  assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
});
