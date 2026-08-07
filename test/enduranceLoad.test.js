const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSwimEfficiencyFactor, formatSwimPacePer100m, weeklySwimEfficiencyTrend,
} = require('../functions/enduranceLoad');

test('computeSwimEfficiencyFactor requires distance, duration and HR', () => {
  // 2km in 40min = 50 m/min; EF = 50/125 = 0.4
  assert.equal(computeSwimEfficiencyFactor({ distanceKm: 2, durationMin: 40, avgHeartRate: 125 }), 0.4);
  assert.equal(computeSwimEfficiencyFactor({ durationMin: 40, avgHeartRate: 125 }), null);
  assert.equal(computeSwimEfficiencyFactor({ distanceKm: 2, avgHeartRate: 125 }), null);
  assert.equal(computeSwimEfficiencyFactor({ distanceKm: 2, durationMin: 40 }), null);
});

test('formatSwimPacePer100m renders min:sec/100m', () => {
  // 2km in 40min: 40*60=2400s over 20x100m = 120s/100m = 2:00/100m
  assert.equal(formatSwimPacePer100m({ distanceKm: 2, durationMin: 40 }), '2:00/100m');
  // 1km in 25min: 1500s over 10x100m = 150s/100m = 2:30/100m
  assert.equal(formatSwimPacePer100m({ distanceKm: 1, durationMin: 25 }), '2:30/100m');
});

test('formatSwimPacePer100m returns null with missing fields', () => {
  assert.equal(formatSwimPacePer100m({ durationMin: 40 }), null);
  assert.equal(formatSwimPacePer100m({ distanceKm: 0, durationMin: 40 }), null);
});

test('weeklySwimEfficiencyTrend needs data in both windows', () => {
  const sessions = [{ distanceKm: 2, durationMin: 40, avgHeartRate: 125, date: '2026-08-05' }];
  assert.equal(weeklySwimEfficiencyTrend(sessions, new Date('2026-08-07')), null);
});

test('weeklySwimEfficiencyTrend reports % change between recent and prior windows', () => {
  const sessions = [
    { distanceKm: 2, durationMin: 45, avgHeartRate: 125, date: '2026-07-15' }, // slower, prior window
    { distanceKm: 2, durationMin: 40, avgHeartRate: 125, date: '2026-08-05' }, // faster, recent window
  ];
  const trend = weeklySwimEfficiencyTrend(sessions, new Date('2026-08-07'));
  assert.ok(trend.trend4wk > 0); // got faster at same HR -> improving
});
