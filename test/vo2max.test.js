const test = require('node:test');
const assert = require('node:assert');

const {
  computeVDOT,
  vdotCategory,
  vdotTrainingPaces,
  vdotTrend,
  voTwo_costAtPace,
  fractionVo2max,
  resolveVO2max,
} = require('../functions/vo2max');

test('VO₂ cost at pace: increases with speed', () => {
  const slow = voTwo_costAtPace(200); // 5 min/km
  const fast = voTwo_costAtPace(300); // 3.33 min/km

  assert(fast > slow, 'faster pace should cost more VO₂');
});

test('VO₂ cost at pace: realistic range', () => {
  const moderate = voTwo_costAtPace(250); // ~4 min/km

  // Should be between ~40-60 mL/kg/min for moderate aerobic pace
  assert(moderate > 30 && moderate < 70, 'moderate pace VO₂ should be 30-70');
});

test('Fraction VO₂max: decreases with duration', () => {
  const sprint = fractionVo2max(5);   // 5 min race
  const long = fractionVo2max(120);   // 2-hour run

  assert(sprint > long, 'shorter efforts use higher %VO₂max');
  assert(sprint > 0.9, 'short effort should be >90%');
  assert(long > 0.8 && long < 0.95, 'long effort should be 80-95%');
});

test('VDOT from 5k race', () => {
  // Sample 5k: 20 minutes at ~4 min/km pace
  const race = {
    distanceKm: 5,
    timeMinutes: 20,
  };

  const result = computeVDOT(race);

  assert(result !== null, 'should compute VDOT');
  assert(result.vdot > 45, 'sub-4-min/km should be >45 VDOT (competitive elite)');
  assert.strictEqual(result.category, 'competitive-elite');
});

test('VDOT from 10k race', () => {
  // Sample 10k: 45 minutes at 4.5 min/km pace
  const race = {
    distanceKm: 10,
    timeMinutes: 45,
  };

  const result = computeVDOT(race);

  assert(result !== null, 'should compute VDOT from 10k');
  assert(result.vdot > 35, 'should be reasonable for 45-min 10k');
});

test('VDOT from pace input', () => {
  const race = {
    paceMinPerKm: 4.0,
    timeMinutes: 20,
  };

  const result = computeVDOT(race);

  assert(result !== null, 'should accept direct pace input');
  assert(result.vdot > 0, 'should compute positive VDOT');
});

test('VDOT category labels', () => {
  assert.strictEqual(vdotCategory(24), 'beginner');
  assert.strictEqual(vdotCategory(30), 'recreational');
  assert.strictEqual(vdotCategory(40), 'competitive-amateur');
  assert.strictEqual(vdotCategory(50), 'competitive-elite');
  assert.strictEqual(vdotCategory(60), 'elite');
  assert.strictEqual(vdotCategory(70), 'elite-plus');
});

test('VDOT training paces', () => {
  const vdot = 45; // Competitive amateur
  const paces = vdotTrainingPaces(vdot);

  assert(paces !== null, 'should generate training paces');
  assert(paces.ePace > 0, 'should have easy pace');
  // In min/km: higher = slower. Easy should be slower (higher) than marathon
  assert(paces.ePace > paces.mPace, 'easy pace should be slower (higher min/km) than marathon pace');
  assert(paces.mPace > paces.tPace, 'marathon pace slower than threshold');
  assert(paces.tPace > paces.iPace, 'threshold slower than interval');
  assert(paces.iPace > paces.rPace, 'interval slower than repetition');
});

test('VDOT training paces realistic ranges', () => {
  const vdot = 50;
  const paces = vdotTrainingPaces(vdot);

  // Easy pace should be ~6-6.5 min/km for VDOT 50
  assert(paces.ePace > 5.5 && paces.ePace < 7, 'easy pace in range');

  // Threshold should be ~4-4.5 min/km for VDOT 50
  assert(paces.tPace > 3.5 && paces.tPace < 5, 'threshold pace in range');
});

test('VDOT trend: empty runs', () => {
  const trend = vdotTrend([], 30);

  assert(trend === null, 'empty runs should return null');
});

test('VDOT trend: filters for test runs', () => {
  // Mix of easy and hard runs
  const runs = [
    { date: '2026-08-05', avgHeartRate: 140, paceMinPerKm: 5.5, durationMin: 30 }, // Easy
    { date: '2026-08-04', avgHeartRate: 180, paceMinPerKm: 4.0, durationMin: 25 }, // Hard (test)
    { date: '2026-08-03', avgHeartRate: 175, paceMinPerKm: 4.2, durationMin: 22 }, // Hard (test)
  ];

  const trend = vdotTrend(runs, 30);

  // Should only use the hard runs (high HR + fast pace)
  assert(trend !== null, 'should find test runs');
  assert(trend.sampleCount >= 1, 'should have at least one test run');
});

test('VDOT: invalid inputs return null', () => {
  assert.strictEqual(computeVDOT(null), null);
  assert.strictEqual(computeVDOT({}), null);
  assert.strictEqual(computeVDOT({ paceMinPerKm: 0 }), null);
  assert.strictEqual(computeVDOT({ distanceKm: 5 }), null); // Missing time
});

test('VDOT consistency: same pace should give same VDOT', () => {
  const race1 = {
    paceMinPerKm: 4.5,
    timeMinutes: 22.5, // 5k
  };

  const race2 = {
    distanceKm: 10,
    timeMinutes: 45, // Same 4.5 min/km pace
  };

  const v1 = computeVDOT(race1)?.vdot;
  const v2 = computeVDOT(race2)?.vdot;

  // Should be very close (duration-dependent %VO₂max differs slightly for 5k vs 10k)
  assert(Math.abs(v1 - v2) < 2, 'same pace should give similar VDOT');
});

test('Resolve VO₂max: prefers Apple Watch over VDOT', () => {
  const appleWatchVO2 = {
    value: 48.5,
    dateMs: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
  };

  const vdot = {
    vdot: 45.0,
  };

  const result = resolveVO2max(appleWatchVO2, vdot);

  assert.strictEqual(result.source, 'apple-watch', 'should prefer Apple Watch');
  assert.strictEqual(result.vo2max, 48.5, 'should use Apple Watch value');
  assert.strictEqual(result.confidence, 'high', 'Apple Watch should be high confidence');
});

test('Resolve VO₂max: falls back to VDOT when Apple Watch is stale', () => {
  const staleAppleWatchVO2 = {
    value: 48.5,
    dateMs: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago (>30 day threshold)
  };

  const vdot = {
    vdot: 45.0,
  };

  const result = resolveVO2max(staleAppleWatchVO2, vdot);

  assert.strictEqual(result.source, 'daniels-vdot', 'should fall back to VDOT when watch is stale');
  assert.strictEqual(result.vo2max, 45.0);
});

test('Resolve VO₂max: null when no data', () => {
  const result = resolveVO2max(null, null);

  assert.strictEqual(result, null, 'should return null with no sources');
});

test('Resolve VO₂max: ignores invalid Apple Watch value', () => {
  const invalidAppleWatch = {
    value: -5, // Negative VO₂max is invalid
    dateMs: Date.now(),
  };

  const vdot = {
    vdot: 45.0,
  };

  const result = resolveVO2max(invalidAppleWatch, vdot);

  assert.strictEqual(result.source, 'daniels-vdot', 'should skip invalid Apple Watch value');
});
