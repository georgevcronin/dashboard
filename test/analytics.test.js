const { test } = require('node:test');
const assert = require('node:assert/strict');
const { alcoholStats, computeDataMaturity, compVerdict, toCsv, weekLiftSessionsCompleted } = require('../functions/analytics');

test('alcoholStats sums the last 7 days and isolates last night separately', () => {
  const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const stats = alcoholStats([{ date: yday, units: 3 }]);
  assert.equal(stats.alcoholLastNight, 3);
  assert.equal(stats.alcoholLast7, 3);
});

test('computeDataMaturity reports "experiments" phase with no history', () => {
  assert.equal(computeDataMaturity([]).phase, 'experiments');
  assert.ok(!computeDataMaturity([]).hasEnoughData);
});

test('computeDataMaturity merges differently-cased logs of the same exercise for pattern detection', () => {
  const lifts = [];
  for (let w = 0; w < 6; w++) {
    const date = new Date(Date.now() - (5 - w) * 7 * 86400000).toISOString().slice(0, 10);
    lifts.push({ date, exercise: w % 2 === 0 ? 'Barbell Bench Press' : 'barbell bench press', kg: 60 + w * 2, reps: 5 });
  }
  const maturity = computeDataMaturity(lifts);
  assert.ok(maturity.exercisesWithPatterns >= 1, 'differently-cased logs should merge into one exercise pattern, not two partial ones');
});

test('compVerdict returns null with fewer than 5 weight entries', () => {
  assert.equal(compVerdict([{ value: 80 }], []), null);
});

test('compVerdict identifies recomping: steady weight, lifts climbing', () => {
  const weights = [80, 80.2, 79.9, 80.1, 80].map(value => ({ value }));
  const lifts = [
    { exercise: 'squat', kg: 100 }, { exercise: 'squat', kg: 110 },
  ];
  assert.equal(compVerdict(weights, lifts).word, 'Recomping');
});

test('compVerdict identifies cutting well: weight down, lifts up', () => {
  const weights = [85, 84, 83.5, 83, 82.8].map(value => ({ value }));
  const lifts = [{ exercise: 'squat', kg: 100 }, { exercise: 'squat', kg: 110 }];
  assert.equal(compVerdict(weights, lifts).word, 'Cutting well');
});

test('toCsv quotes values containing commas, quotes, or newlines', () => {
  const csv = toCsv([{ a: 'has, comma', b: 'has "quote"', c: 'plain' }], ['a', 'b', 'c']);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'a,b,c');
  assert.equal(lines[1], '"has, comma","has ""quote""",plain');
});

test('toCsv renders null/undefined values as empty strings', () => {
  const csv = toCsv([{ a: null, b: undefined }], ['a', 'b']);
  assert.equal(csv.split('\n')[1], ',');
});

test('weekLiftSessionsCompleted counts distinct days lifted since Monday', () => {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setDate(now.getDate() - mondayOffset);
  const mondayStr = monday.toISOString().slice(0, 10);
  const lifts = [{ date: mondayStr, exercise: 'x' }, { date: mondayStr, exercise: 'y' }];
  assert.equal(weekLiftSessionsCompleted(lifts), 1, 'same-day lifts should count as one session');
});

test('weekLiftSessionsCompleted excludes lifts from before this Monday', () => {
  const lastWeek = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  assert.equal(weekLiftSessionsCompleted([{ date: lastWeek, exercise: 'x' }]), 0);
});
