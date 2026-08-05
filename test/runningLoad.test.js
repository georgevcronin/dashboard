const test = require('node:test');
const assert = require('node:assert');

const {
  dailyLoadsFromRuns,
  computeRunTrimp,
  computeEfficiencyFactor,
  weeklyEfficiencyTrend,
  detectSessionDistanceSpike,
  computeLongRunPercentage,
} = require('../functions/runningLoad');

// Test data: a typical runner, aerobic base
const profile = {
  baselines: {
    restingHeartRate: 50,
    maxHeartRate: 190,
  },
  sex: 'M', // b factor = 1.92
};

test('TRIMP load: single session', () => {
  const run = {
    date: '2026-08-05',
    durationMin: 30,
    avgHeartRate: 140, // 70% of 190
  };

  const loads = dailyLoadsFromRuns([run], profile);

  assert(loads['2026-08-05'] > 0, 'should compute non-zero load');
  // Manual calc: 30 * (140-50)/(190-50) * exp(1.92 * (140-50)/(190-50))
  // = 30 * (90/140) * exp(1.92 * 90/140)
  // ≈ 30 * 0.6428 * exp(0.9818) ≈ 30 * 0.6428 * 2.669 ≈ 51.5
  assert(loads['2026-08-05'] > 40, 'TRIMP should be moderate (45-55 range)');
});

test('TRIMP: aggregates multiple runs on same day', () => {
  const runs = [
    { date: '2026-08-05', durationMin: 20, avgHeartRate: 130 },
    { date: '2026-08-05', durationMin: 10, avgHeartRate: 145 },
  ];

  const loads = dailyLoadsFromRuns(runs, profile);

  const singleDay1 = dailyLoadsFromRuns([runs[0]], profile)['2026-08-05'];
  const singleDay2 = dailyLoadsFromRuns([runs[1]], profile)['2026-08-05'];

  assert.strictEqual(
    loads['2026-08-05'],
    singleDay1 + singleDay2,
    'should sum TRIMP for multiple runs same day'
  );
});

test('TRIMP: elevation multiplier', () => {
  const flatRun = {
    date: '2026-08-05',
    durationMin: 30,
    avgHeartRate: 140,
    elevationGainM: 0,
  };

  const hillRun = {
    date: '2026-08-05',
    durationMin: 30,
    avgHeartRate: 140,
    elevationGainM: 300, // 10m per minute gain
  };

  const flatLoad = dailyLoadsFromRuns([flatRun], profile)['2026-08-05'];
  const hillLoad = dailyLoadsFromRuns([hillRun], profile)['2026-08-05'];

  assert(hillLoad > flatLoad, 'elevation should increase load');
  const elevationBoost = (hillLoad - flatLoad) / flatLoad;
  // 300m / 30min = 10m/min => 0.02 * 10 = 0.20 = 20% boost (capped at 30%)
  assert(elevationBoost > 0.15 && elevationBoost < 0.25, 'elevation should boost ~20%');
});

test('TRIMP: ignores bad HR readings', () => {
  const badRun = {
    date: '2026-08-05',
    durationMin: 30,
    avgHeartRate: 280, // Impossible HR (>max)
  };

  const loads = dailyLoadsFromRuns([badRun], profile);

  assert(!loads['2026-08-05'], 'should skip runs with HR > max');
});

test('efficiency factor: higher = better', () => {
  const slow = { paceMinPerKm: 7.0, avgHeartRate: 150 };
  const fast = { paceMinPerKm: 6.0, avgHeartRate: 140 };

  const efSlow = computeEfficiencyFactor(slow);
  const efFast = computeEfficiencyFactor(fast);

  assert(efFast > efSlow, 'faster pace + lower HR should have higher EF');
});

test('weekly efficiency trend requires minimum runs', () => {
  const today = new Date('2026-08-05');
  const runs = [
    { date: '2026-08-05', paceMinPerKm: 6.0, avgHeartRate: 140 },
    { date: '2026-08-04', paceMinPerKm: 6.1, avgHeartRate: 141 },
  ];

  // Only 2 runs; minimum is 3
  const trend = weeklyEfficiencyTrend(runs, today);

  assert(trend === null, 'should return null with <3 runs');
});

test('weekly efficiency trend: 3+ runs', () => {
  const today = new Date('2026-08-05');
  const runs = [
    { date: '2026-08-05', paceMinPerKm: 6.0, avgHeartRate: 140 },
    { date: '2026-08-04', paceMinPerKm: 6.0, avgHeartRate: 140 },
    { date: '2026-08-03', paceMinPerKm: 6.0, avgHeartRate: 140 },
  ];

  const trend = weeklyEfficiencyTrend(runs, today);

  assert(trend !== null && trend > 0, 'should compute trend average with 3+ runs');
});

test('distance spike detection: baseline ratio', () => {
  const prior = [
    { date: '2026-07-06', distanceKm: 10 },
    { date: '2026-07-15', distanceKm: 12 },
    { date: '2026-07-22', distanceKm: 11 },
  ];

  const normalRun = { date: '2026-08-05', distanceKm: 12 };
  const spikeRun = { date: '2026-08-05', distanceKm: 14 };

  const normalSpike = detectSessionDistanceSpike(normalRun, prior);
  const highSpike = detectSessionDistanceSpike(spikeRun, prior);

  assert(!normalSpike.isSpike, 'normal run should not flag as spike');
  assert(highSpike.isSpike, 'run 17% over recent max should flag');
  assert.strictEqual(highSpike.riskLevel, 'elevated', 'should be elevated risk');
});

test('distance spike: very high risk (>2x longest)', () => {
  const prior = [
    { date: '2026-07-22', distanceKm: 10 },
  ];

  const doubleRun = { date: '2026-08-05', distanceKm: 21 };

  const spike = detectSessionDistanceSpike(doubleRun, prior);

  assert.strictEqual(spike.riskLevel, 'very_high', 'should flag 2x+ as very_high');
});

test('distance spike: no prior history uses conservative baseline', () => {
  const emptyPrior = [];
  const run = { date: '2026-08-05', distanceKm: 10 };

  const spike = detectSessionDistanceSpike(run, emptyPrior);

  // Baseline = 10 * 0.5 = 5km, so 10km / 5km = 2.0 ratio
  assert(spike.ratio > 1.5, 'should use 50% of actual distance as conservative baseline');
});

test('long-run percentage: weekly calculation', () => {
  const today = new Date('2026-08-05');
  const runs = [
    { date: '2026-08-05', distanceKm: 5 },
    { date: '2026-08-04', distanceKm: 8 },
    { date: '2026-08-02', distanceKm: 6 },
    { date: '2026-07-30', distanceKm: 12 }, // Longest of week
  ];

  const pct = computeLongRunPercentage(runs, today);

  // Weekly total: 5+8+6+12 = 31; longest: 12; pct = 12/31 * 100 ≈ 38.7%
  assert(pct > 35 && pct < 42, 'long run should be ~38% of weekly total');
});

test('long-run percentage: caution range', () => {
  const today = new Date('2026-08-05');
  const runs = [
    { date: '2026-08-05', distanceKm: 2 },
    { date: '2026-08-04', distanceKm: 2 },
    { date: '2026-08-02', distanceKm: 20 }, // 20/24 = 83% ⚠️
  ];

  const pct = computeLongRunPercentage(runs, today);

  assert(pct > 75, 'should flag imbalanced long run (>75% of weekly)');
});
