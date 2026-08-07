const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  estimateFTP, cogganPowerZones, computeRideTSS, dailyLoadsFromPower,
  computePowerEfficiencyFactor, weeklyPowerEfficiencyTrend,
  computeSpeedEfficiencyFactor, weeklySpeedEfficiencyTrend,
} = require('../functions/cyclingPower');

const maxHR = 190; // 85% threshold = 161.5

test('estimateFTP returns null with no rides or no maxHeartRate', () => {
  assert.equal(estimateFTP([], maxHR), null);
  assert.equal(estimateFTP(null, maxHR), null);
  assert.equal(estimateFTP([{ hasPowerMeter: true, avgWatts: 250, durationMin: 30, avgHeartRate: 170, date: '2026-08-01' }], null), null);
});

test('estimateFTP ignores rides without a real power meter', () => {
  const rides = [{ hasPowerMeter: false, avgWatts: 300, durationMin: 30, avgHeartRate: 175, date: '2026-08-01' }];
  assert.equal(estimateFTP(rides, maxHR), null);
});

test('estimateFTP ignores rides under 20 minutes or below 85% max HR', () => {
  const short = [{ hasPowerMeter: true, avgWatts: 250, durationMin: 15, avgHeartRate: 175, date: '2026-08-01' }];
  const easy = [{ hasPowerMeter: true, avgWatts: 250, durationMin: 30, avgHeartRate: 140, date: '2026-08-01' }];
  assert.equal(estimateFTP(short, maxHR), null);
  assert.equal(estimateFTP(easy, maxHR), null);
});

test('estimateFTP takes the single best qualifying ride, 95% of its watts', () => {
  const rides = [
    { hasPowerMeter: true, avgWatts: 200, durationMin: 25, avgHeartRate: 165, date: '2026-08-01' },
    { hasPowerMeter: true, avgWatts: 250, durationMin: 30, avgHeartRate: 175, date: '2026-08-03' },
  ];
  const result = estimateFTP(rides, maxHR);
  assert.equal(result.ftp, 238); // 250 * 0.95 = 237.5 -> round 238
  assert.equal(result.basedOnWatts, 250);
  assert.equal(result.sampleCount, 2);
});

test('estimateFTP ignores rides outside the lookback window', () => {
  const rides = [{ hasPowerMeter: true, avgWatts: 250, durationMin: 30, avgHeartRate: 175, date: '2020-01-01' }];
  assert.equal(estimateFTP(rides, maxHR, 90), null);
});

test('cogganPowerZones returns null with no FTP, real zone ranges otherwise', () => {
  assert.equal(cogganPowerZones(null), null);
  assert.equal(cogganPowerZones(0), null);
  const zones = cogganPowerZones(200);
  assert.equal(zones.z2.minWatts, 112); // 200*0.56
  assert.equal(zones.z2.maxWatts, 150); // 200*0.75
  assert.equal(zones.z7.maxWatts, null); // open-ended top zone
  assert.match(zones.z7.range, /302W\+/);
});

test('computeRideTSS matches the standard duration x IF^2 x 100 formula', () => {
  // 1 hour at FTP (IF=1.0) is defined as exactly 100 TSS
  assert.equal(computeRideTSS({ durationMin: 60, avgWatts: 200 }, 200), 100);
  // 30 min at 50% FTP: 0.5hr * 0.5^2 * 100 = 12.5
  assert.equal(computeRideTSS({ durationMin: 30, avgWatts: 100 }, 200), 12.5);
});

test('computeRideTSS returns null with missing inputs', () => {
  assert.equal(computeRideTSS({ durationMin: 60 }, 200), null);
  assert.equal(computeRideTSS({ durationMin: 60, avgWatts: 200 }, null), null);
});

test('dailyLoadsFromPower sums same-day rides and skips non-power-meter ones', () => {
  const rides = [
    { hasPowerMeter: true, avgWatts: 200, durationMin: 60, date: '2026-08-01' },
    { hasPowerMeter: true, avgWatts: 200, durationMin: 60, date: '2026-08-01' },
    { hasPowerMeter: false, avgWatts: 300, durationMin: 60, date: '2026-08-01' },
  ];
  const loads = dailyLoadsFromPower(rides, 200);
  assert.equal(loads['2026-08-01'], 200); // 100 + 100, the non-power ride excluded
});

test('dailyLoadsFromPower returns empty object with no FTP', () => {
  assert.deepEqual(dailyLoadsFromPower([{ hasPowerMeter: true, avgWatts: 200, durationMin: 60, date: '2026-08-01' }], null), {});
});

test('computePowerEfficiencyFactor requires a real power meter and both fields', () => {
  assert.equal(computePowerEfficiencyFactor({ hasPowerMeter: true, avgWatts: 200, avgHeartRate: 160 }), 1.25);
  assert.equal(computePowerEfficiencyFactor({ hasPowerMeter: false, avgWatts: 200, avgHeartRate: 160 }), null);
  assert.equal(computePowerEfficiencyFactor({ hasPowerMeter: true, avgHeartRate: 160 }), null);
});

test('weeklyPowerEfficiencyTrend needs data in both the recent and prior windows', () => {
  const rides = [{ hasPowerMeter: true, avgWatts: 200, avgHeartRate: 160, date: '2026-08-05' }];
  assert.equal(weeklyPowerEfficiencyTrend(rides, new Date('2026-08-07')), null);
});

test('weeklyPowerEfficiencyTrend reports a positive % change when EF improves', () => {
  const rides = [
    { hasPowerMeter: true, avgWatts: 180, avgHeartRate: 160, date: '2026-07-15' }, // EF 1.125, prior window
    { hasPowerMeter: true, avgWatts: 200, avgHeartRate: 160, date: '2026-08-05' }, // EF 1.25, recent window
  ];
  const trend = weeklyPowerEfficiencyTrend(rides, new Date('2026-08-07'));
  assert.ok(trend.trend4wk > 0);
});

test('computeSpeedEfficiencyFactor works without a power meter', () => {
  // 30km in 60min = 30km/h; EF = 30/150 = 0.2
  assert.equal(computeSpeedEfficiencyFactor({ distanceKm: 30, durationMin: 60, avgHeartRate: 150 }), 0.2);
  assert.equal(computeSpeedEfficiencyFactor({ durationMin: 60, avgHeartRate: 150 }), null);
});

test('weeklySpeedEfficiencyTrend reports % change the same way the power version does', () => {
  const rides = [
    { distanceKm: 25, durationMin: 60, avgHeartRate: 150, date: '2026-07-15' }, // slower, prior window
    { distanceKm: 30, durationMin: 60, avgHeartRate: 150, date: '2026-08-05' }, // faster, recent window
  ];
  const trend = weeklySpeedEfficiencyTrend(rides, new Date('2026-08-07'));
  assert.ok(trend.trend4wk > 0);
});
