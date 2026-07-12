const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeStructuralFatigue, musclePeaksFromLifts, applyInjuryTaper,
  injuryFatiguePenalty, computeACWR, computePerformanceTrend, computeCNSFatigue,
} = require('../functions/fatigue');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('computeStructuralFatigue decays toward 0 as time passes', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const peaks = { quads: 2000 };
  const fresh = computeStructuralFatigue(lifts, peaks, [], {});
  const old = computeStructuralFatigue(
    [{ date: daysAgo(10), exercise: 'Back Squat', kg: 100, reps: 8 }], peaks, [], {},
  );
  assert.ok(fresh.quads > (old.quads || 0), 'fatigue should decay significantly after 10 days');
  assert.ok((old.quads || 0) < 5, 'fatigue should be nearly fully decayed after 10 days');
});

test('computeStructuralFatigue excludes lifts older than the 336h (14-day) window entirely', () => {
  const lifts = [{ date: daysAgo(20), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const out = computeStructuralFatigue(lifts, { quads: 2000 }, [], {});
  assert.equal(out.quads, undefined, 'lifts older than 336h should not contribute at all');
});

test('computeStructuralFatigue accepts a recoveryHours override (personalization hook)', () => {
  const lifts = [{ date: daysAgo(2), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const peaks = { quads: 2000 };
  const fastRecovery = computeStructuralFatigue(lifts, peaks, [], {}, { quads: 24 });
  const slowRecovery = computeStructuralFatigue(lifts, peaks, [], {}, { quads: 200 });
  assert.ok(fastRecovery.quads < slowRecovery.quads, 'shorter half-life should decay faster');
});

test('computeStructuralFatigue does not misattribute Cable exercises to abs', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Cable Crossover', kg: 20, reps: 12 }];
  const out = computeStructuralFatigue(lifts, { chest: 500 }, [], {});
  assert.equal(out.abs, undefined, 'Cable Crossover should not produce an abs fatigue score');
});

test('musclePeaksFromLifts finds the single highest-volume day per muscle', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Back Squat', kg: 100, reps: 5 }, // 500
    { date: '2026-01-01', exercise: 'Back Squat', kg: 100, reps: 5 }, // 500 (same day, sums)
    { date: '2026-01-08', exercise: 'Back Squat', kg: 80, reps: 5 },  // 400
  ];
  const peaks = musclePeaksFromLifts(lifts);
  assert.equal(peaks.quads, 1000);
});

test('injuryFatiguePenalty tapers linearly from 100 to 0 over the healing window', () => {
  const now = Date.now();
  const freshInjury = { severity: 'mild', ts: now };
  const halfHealed = { severity: 'mild', ts: now - 5 * 86400000 }; // 5 of 10 days
  const fullyHealed = { severity: 'mild', ts: now - 20 * 86400000 };
  assert.equal(injuryFatiguePenalty(freshInjury, now), 100);
  assert.equal(injuryFatiguePenalty(halfHealed, now), 50);
  assert.equal(injuryFatiguePenalty(fullyHealed, now), 0);
});

test('applyInjuryTaper raises fatigue for injured muscles without lowering it', () => {
  const fatigue = { quads: 20 };
  const injuries = [{ severity: 'severe', ts: Date.now(), muscles: ['quads'], resolved: false }];
  const out = applyInjuryTaper(fatigue, injuries);
  assert.equal(out.quads, 100, 'fresh severe injury should push fatigue to 100 regardless of prior value');
});

test('applyInjuryTaper ignores resolved injuries', () => {
  const fatigue = { quads: 20 };
  const injuries = [{ severity: 'severe', ts: Date.now(), muscles: ['quads'], resolved: true }];
  const out = applyInjuryTaper(fatigue, injuries);
  assert.equal(out.quads, 20);
});

test('computeACWR returns null with insufficient history', () => {
  assert.equal(computeACWR([]), null);
});

test('computeACWR flags overreach when acute load exceeds chronic baseline', () => {
  const lifts = [];
  // 4 weeks of steady 1000/week baseline load
  for (let w = 1; w <= 4; w++) lifts.push({ date: daysAgo(w * 7), exercise: 'Back Squat', kg: 100, reps: 10 });
  // huge spike this week
  lifts.push({ date: daysAgo(1), exercise: 'Back Squat', kg: 500, reps: 10 });
  const acwr = computeACWR(lifts);
  assert.ok(acwr > 1.5, `expected overreach signal, got ${acwr}`);
});

test('computePerformanceTrend groups the same exercise across differently-cased log entries', () => {
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'barbell bench press', kg: 80, reps: 5 },
    { date: daysAgo(1), exercise: 'barbell bench press', kg: 80, reps: 5 },
  ];
  const trend = computePerformanceTrend(lifts);
  assert.ok(trend != null, 'differently-cased logs of the same exercise should merge into one trend bucket');
  assert.ok(trend > 0, 'weight dropped from 100kg to 80kg, should register as a positive decrement (declining performance)');
});

test('computeCNSFatigue counts Power Clean as CNS-taxing', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Power Clean', kg: 80, reps: 3 }];
  const out = computeCNSFatigue(lifts);
  assert.ok(out > 0, 'Power Clean should register CNS fatigue');
});

test('computeCNSFatigue does not count isolation exercises', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Hammer Curl', kg: 15, reps: 10 }];
  const out = computeCNSFatigue(lifts);
  assert.equal(out, 0);
});
