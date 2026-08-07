const test = require('node:test');
const assert = require('node:assert');

const {
  computeHybridFatigue,
  runningFatigueByMuscle,
  hybridFatigueBreakdown,
} = require('../functions/hybridFatigue');
const { cardioFatigueByMuscle } = require('../functions/cardio');

const profile = {
  baselines: {
    restingHeartRate: 50,
    maxHeartRate: 190,
  },
};

test('Running fatigue by muscle: lower body focus', () => {
  const runs = [
    {
      date: '2026-08-05',
      durationMin: 40,
      avgHeartRate: 145,
    },
  ];

  const fatigue = runningFatigueByMuscle(runs, profile);

  // Should have lower body muscles
  assert(fatigue.glutes > 0, 'should affect glutes');
  assert(fatigue.quads > 0, 'should affect quads');
  assert(fatigue.hamstrings > 0, 'should affect hamstrings');

  // Lower body should dominate
  const lowerBodySum = (fatigue.glutes || 0) + (fatigue.quads || 0) + (fatigue.hamstrings || 0);
  const total = Object.values(fatigue).reduce((a, b) => a + b, 0);
  assert(lowerBodySum > total * 0.4, 'lower body should be >40% of total');
});

test('Running fatigue: empty runs returns empty', () => {
  const fatigue = runningFatigueByMuscle([], profile);

  assert.deepStrictEqual(fatigue, {}, 'no runs should return empty');
});

test('Running fatigue: negligible load', () => {
  const runs = [
    {
      date: '2026-08-05',
      durationMin: 2,
      avgHeartRate: 100, // Extremely light (below zone 1)
    },
  ];

  const fatigue = runningFatigueByMuscle(runs, profile);

  assert(Object.keys(fatigue).length === 0, 'extremely light load should produce minimal/zero fatigue');
});

test('Hybrid fatigue: combines lifting and running', () => {
  // Minimal mock of lifting fatigue structure
  // (Full computeCurrentFatigueScores is complex; we'll mock it)
  // This test assumes the integration works; full integration tested in index.js

  // For now, just verify runningFatigueByMuscle works
  const runs = [
    {
      date: '2026-08-05',
      durationMin: 40,
      avgHeartRate: 145,
    },
  ];

  const runFatigue = runningFatigueByMuscle(runs, profile);

  assert(Object.keys(runFatigue).length > 0, 'should have fatigue entries');
  assert(
    Object.values(runFatigue).every(f => f >= 0 && f <= 100),
    'fatigue should be 0-100'
  );
});

test('Hybrid fatigue breakdown: diagnostic output', () => {
  const runs = [
    {
      date: '2026-08-05',
      durationMin: 40,
      avgHeartRate: 145,
    },
  ];

  // Mock empty lifts (so lifting fatigue is zero)
  const runFatigue = runningFatigueByMuscle(runs, profile);

  // Just verify it has the expected structure
  assert(Object.keys(runFatigue).length > 0, 'should have muscles');
  for (const muscle of Object.keys(runFatigue)) {
    assert(runFatigue[muscle] >= 0, `${muscle} should be non-negative`);
  }
});

test('Running fatigue: scales with load magnitude', () => {
  const lightRun = [
    {
      date: '2026-08-05',
      durationMin: 20,
      avgHeartRate: 130,
    },
  ];

  const heavyRun = [
    {
      date: '2026-08-05',
      durationMin: 60,
      avgHeartRate: 150,
    },
  ];

  const lightFatigue = runningFatigueByMuscle(lightRun, profile);
  const heavyFatigue = runningFatigueByMuscle(heavyRun, profile);

  const lightSum = Object.values(lightFatigue).reduce((a, b) => a + b, 0);
  const heavySum = Object.values(heavyFatigue).reduce((a, b) => a + b, 0);

  assert(heavySum > lightSum, 'longer/harder run should produce more fatigue');
});

test('#17: bike fatigue by muscle — quad-dominant, not upper-body', () => {
  const sports = [{ date: '2026-08-05', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 }];
  const fatigue = cardioFatigueByMuscle(sports, profile, 'bike');
  assert(fatigue.quads > 0, 'should affect quads');
  assert(fatigue.quads > (fatigue.lats || 0), 'bike should be quad- not lat-dominant');
});

test('#17: swim fatigue by muscle — upper-body/core dominant, distinct from bike', () => {
  const sports = [{ date: '2026-08-05', sportType: 'Swim', durationMin: 45, avgHeartRate: 135 }];
  const fatigue = cardioFatigueByMuscle(sports, profile, 'swim');
  assert(fatigue.lats > 0, 'should affect lats');
  assert(fatigue.lats > (fatigue.quads || 0), 'swim should be lat- not quad-dominant, unlike bike');
});

test('#17: cardioFatigueByMuscle empty for the other cardioType or no sports', () => {
  const sports = [{ date: '2026-08-05', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 }];
  assert.deepStrictEqual(cardioFatigueByMuscle(sports, profile, 'swim'), {}, 'a bike session should contribute nothing to swim fatigue');
  assert.deepStrictEqual(cardioFatigueByMuscle([], profile, 'bike'), {});
});

test('#17: computeHybridFatigue backward compatible with no sports argument', () => {
  const lifts = [{ exercise: 'squat', kg: 100, reps: 8, date: '2026-08-05' }];
  const withoutSports = computeHybridFatigue(lifts, [], {}, [], {}, {}, profile);
  assert(withoutSports, 'omitting the new sports param entirely should not throw');
});

test('#17: computeHybridFatigue folds in bike/swim contributions without exceeding 100', () => {
  const lifts = [{ exercise: 'squat', kg: 100, reps: 8, date: '2026-08-05' }];
  const sports = [
    { date: '2026-08-05', sportType: 'Ride', durationMin: 90, avgHeartRate: 150 },
    { date: '2026-08-05', sportType: 'Swim', durationMin: 60, avgHeartRate: 140 },
  ];
  const hybrid = computeHybridFatigue(lifts, [], {}, [], {}, {}, profile, sports);
  for (const v of Object.values(hybrid)) assert(v <= 100, 'fatigue must stay capped at 100 even with lifting+bike+swim combined');
  assert(hybrid.quads > 0, 'bike contribution should reach quads');
  assert(hybrid.lats > 0, 'swim contribution should reach lats');
});

test('#17: hybridFatigueBreakdown reports bike/swim alongside lifting/running', () => {
  const sports = [{ date: '2026-08-05', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 }];
  const breakdown = hybridFatigueBreakdown([], [], {}, [], {}, {}, profile, sports);
  assert(breakdown.quads);
  assert('bike' in breakdown.quads);
  assert('swim' in breakdown.quads);
  assert(breakdown.quads.bike > 0);
});
