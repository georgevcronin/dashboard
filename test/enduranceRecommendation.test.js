const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCyclingRecommendation, buildSwimmingRecommendation, buildGeneralRecommendation } = require('../functions/enduranceRecommendation');

const baseArgs = {
  baseRecoveryScore: 80,
  acwr: null,
  sessions: [],
  profile: {},
  age: 30, // estimateMaxHeartRate(30) = 205 - 15 = 190
};

test('buildCyclingRecommendation returns null with an invalid baseRecoveryScore', () => {
  assert.equal(buildCyclingRecommendation({ ...baseArgs, baseRecoveryScore: null }), null);
  assert.equal(buildCyclingRecommendation({ ...baseArgs, baseRecoveryScore: -1 }), null);
  assert.equal(buildCyclingRecommendation({ ...baseArgs, baseRecoveryScore: 101 }), null);
});

test('buildSwimmingRecommendation returns null with an invalid baseRecoveryScore', () => {
  assert.equal(buildSwimmingRecommendation({ ...baseArgs, baseRecoveryScore: 0 }), null);
});

test('buildCyclingRecommendation: basic shape with no power meter data (HR-only fallback)', () => {
  const result = buildCyclingRecommendation(baseArgs);
  assert.ok(result.sessionType);
  assert.ok(result.duration.target > 0);
  assert.ok(result.hrZones); // age-estimated maxHR fallback
  assert.equal(result.powerZones, null);
  assert.equal(result.ftp, null);
  assert.match(result.reasoning, /ridden/);
  assert.equal(result.lastSession, undefined); // internal field not leaked
});

test('buildCyclingRecommendation: with power meter data, powerZones and ftp are populated', () => {
  const result = buildCyclingRecommendation({ ...baseArgs, ftpResult: { ftp: 200, basedOnWatts: 210, basedOnDate: '2026-08-01', sampleCount: 2 } });
  assert.equal(result.ftp, 200);
  assert.ok(result.powerZones);
  assert.equal(result.powerZones.z2.minWatts, 112); // 200*0.56
  assert.ok(result.hrZones); // still shown alongside power zones
});

test('buildCyclingRecommendation: no power meter but a logged ride shows average speed instead', () => {
  const sessions = [{ date: '2026-08-01', distanceKm: 30, durationMin: 60 }];
  const result = buildCyclingRecommendation({ ...baseArgs, sessions });
  assert.equal(result.avgSpeedDisplay, '30 km/h');
});

test('buildCyclingRecommendation: power meter present means no avgSpeedDisplay fallback', () => {
  const sessions = [{ date: '2026-08-01', distanceKm: 30, durationMin: 60 }];
  const result = buildCyclingRecommendation({ ...baseArgs, sessions, ftpResult: { ftp: 200 } });
  assert.equal(result.avgSpeedDisplay, undefined);
});

test('buildSwimmingRecommendation: basic shape, HR zones use the ~10bpm swim offset', () => {
  const cycling = buildCyclingRecommendation(baseArgs); // maxHR=190, no offset
  const swim = buildSwimmingRecommendation(baseArgs); // maxHR=180 (190-10)
  assert.ok(swim.hrZones);
  assert.ok(cycling.hrZones.z1.maxHR > swim.hrZones.z1.maxHR, 'swim zones should sit lower than land-sport zones for the same age');
  assert.match(swim.reasoning, /swum/);
});

test('buildSwimmingRecommendation: avgPaceDisplay from the most recent logged swim', () => {
  const sessions = [{ date: '2026-08-01', distanceKm: 2, durationMin: 40 }]; // 2:00/100m
  const result = buildSwimmingRecommendation({ ...baseArgs, sessions });
  assert.equal(result.avgPaceDisplay, '2:00/100m');
});

test('weekSessionCount only counts sessions within the last 7 days', () => {
  const now = new Date();
  const recent = new Date(now); recent.setDate(recent.getDate() - 2);
  const old = new Date(now); old.setDate(old.getDate() - 20);
  const sessions = [
    { date: recent.toISOString().slice(0, 10), distanceKm: 10, durationMin: 30 },
    { date: old.toISOString().slice(0, 10), distanceKm: 10, durationMin: 30 },
  ];
  const result = buildCyclingRecommendation({ ...baseArgs, sessions });
  assert.equal(result.weekSessionCount, 1);
});

test('cautions: low readiness, elevated ACWR, distance spike, and declining efficiency all surface', () => {
  const result = buildCyclingRecommendation({
    ...baseArgs,
    baseRecoveryScore: 30, // pushes readiness below 50
    acwr: 1.8,
    lastSpikeDetection: { risk: 'very_high' },
    lastEfficiency: { trend4wk: -8 },
  });
  assert.ok(result.cautions.some(c => /Readiness is low/.test(c)));
  assert.ok(result.cautions.some(c => /ACWR elevated/.test(c)));
  assert.ok(result.cautions.some(c => /distance spike/.test(c) && /ride/.test(c)));
  assert.ok(result.cautions.some(c => /Efficiency declining/.test(c)));
});

test('vo2max fields pass through from vo2maxResolution', () => {
  const result = buildSwimmingRecommendation({ ...baseArgs, vo2maxResolution: { vo2max: 45.5, source: 'hr-ratio' } });
  assert.equal(result.vo2maxValue, 45.5);
  assert.equal(result.vo2maxSource, 'hr-ratio');
});

test('buildGeneralRecommendation: basic shape, HR-only, generic reasoning', () => {
  const result = buildGeneralRecommendation(baseArgs);
  assert.ok(result.sessionType);
  assert.ok(result.duration.target > 0);
  assert.ok(result.hrZones);
  assert.equal(result.powerZones, null);
  assert.equal(result.avgSpeedDisplay, undefined);
  assert.equal(result.avgPaceDisplay, undefined);
  assert.match(result.reasoning, /trained/);
  assert.equal(result.lastSession, undefined);
});

test('buildGeneralRecommendation: returns null with an invalid baseRecoveryScore', () => {
  assert.equal(buildGeneralRecommendation({ ...baseArgs, baseRecoveryScore: null }), null);
});

test('buildGeneralRecommendation: no swim-style ~10bpm offset applied (unlike swimming)', () => {
  const general = buildGeneralRecommendation(baseArgs);
  const swim = buildSwimmingRecommendation(baseArgs);
  assert.ok(general.hrZones.z1.maxHR > swim.hrZones.z1.maxHR);
});
