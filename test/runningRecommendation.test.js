const test = require('node:test');
const assert = require('node:assert');

const {
  buildRunningRecommendation,
  sessionTypeByReadiness,
  durationTargetMinutes,
  paceZonesFromVO2max,
  buildReasoningString,
} = require('../functions/runningRecommendation');

test('Session type: high readiness (85+) → interval or easy mix', () => {
  const rec = sessionTypeByReadiness(90, 'easy', 0);
  assert(rec.recommended === 'interval' || rec.recommended === 'easy', 'high readiness should allow hard work or easy');
  assert(rec.alternatives.includes('easy') || rec.alternatives.includes('tempo'), 'alternatives should include mixed intensities');
});

test('Session type: good readiness (70-84) → balanced easy/steady', () => {
  const rec = sessionTypeByReadiness(75, 'easy', 0);
  assert(rec.recommended === 'steady' || rec.recommended === 'easy', 'good readiness should allow moderate or easy');
});

test('Session type: moderate readiness (55-69) → prioritize easy', () => {
  const rec = sessionTypeByReadiness(60, 'easy', 0);
  assert.strictEqual(rec.recommended, 'easy', 'moderate readiness should recommend easy');
});

test('Session type: high fatigue (40-54) → recovery only', () => {
  const rec = sessionTypeByReadiness(45, 'easy', 0);
  assert.strictEqual(rec.recommended, 'recovery', 'high fatigue should recommend recovery');
});

test('Session type: severe fatigue (<40) → rest', () => {
  const rec = sessionTypeByReadiness(30, 'easy', 0);
  assert.strictEqual(rec.recommended, 'rest', 'severe fatigue should recommend rest');
});

test('Duration: scales with readiness', () => {
  const easy85 = durationTargetMinutes(85, null, 'easy');
  const easy40 = durationTargetMinutes(40, null, 'easy');

  assert(easy85.target > easy40.target, 'higher readiness should yield longer target duration');
});

test('Duration: easy run baseline around 45 min', () => {
  const rec = durationTargetMinutes(75, null, 'easy');
  assert(rec.target > 35 && rec.target < 55, 'easy run should target 35-55 min at normal readiness');
});

test('Duration: long run baseline around 75 min', () => {
  const rec = durationTargetMinutes(75, null, 'long');
  assert(rec.target > 60 && rec.target < 90, 'long run should target 60-90 min at normal readiness');
});

test('Duration: efficiency trend warning reduces duration', () => {
  const normal = durationTargetMinutes(75, null, 'easy');
  const declining = durationTargetMinutes(75, { trend4wk: -5 }, 'easy');

  assert(declining.target < normal.target, 'declining efficiency should reduce duration');
});

test('Pace zones: all zones present for valid VO₂max', () => {
  const paces = paceZonesFromVO2max(45, {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  });

  assert(paces.easy, 'should have easy pace');
  assert(paces.recovery, 'should have recovery pace');
  assert(paces.steady, 'should have steady pace');
  assert(paces.tempo, 'should have tempo pace');
  assert(paces.interval, 'should have interval pace');
  assert(paces.rep, 'should have rep pace');
});

test('Pace zones: null when no VO₂max data', () => {
  const paces = paceZonesFromVO2max(null, null);
  assert.strictEqual(paces, null, 'null input should return null');
});

test('Reasoning: rest day message included for rest recommendation', () => {
  const reason = buildReasoningString({
    readiness: 35,
    label: 'Recover',
    sessionType: 'rest',
    weekSessionCount: 3,
    cautions: [],
  });

  assert(reason.includes('recovery day'), 'rest day reasoning should mention recovery');
});

test('Reasoning: high week count warning', () => {
  const reason = buildReasoningString({
    readiness: 70,
    label: 'Ready',
    sessionType: 'easy',
    weekSessionCount: 6,
    cautions: [],
  });

  assert(reason.includes('already logged'), 'high run count should be noted');
});

test('Build recommendation: high readiness produces valid output', () => {
  const rec = buildRunningRecommendation({
    baseRecoveryScore: 75,
    runningACWR: 1.0,
    runs: [],
    profile: {},
    lastEfficiency: null,
    lastSpikeDetection: null,
    vo2maxResolution: { vo2max: 50, source: 'daniels-vdot' },
    vdotTrainingPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
  });

  assert(rec, 'recommendation should not be null');
  assert(rec.sessionType, 'should have session type');
  assert(rec.readiness >= 0 && rec.readiness <= 100, 'readiness should be 0-100');
  assert(rec.duration.target > 0, 'duration should be positive');
  assert(rec.paceZones, 'should include pace zones');
  assert(rec.reasoning, 'should include reasoning');
});

test('Build recommendation: null when invalid recovery score', () => {
  const rec = buildRunningRecommendation({
    baseRecoveryScore: -10, // Invalid
    runningACWR: 1.0,
    runs: [],
  });

  assert.strictEqual(rec, null, 'invalid recovery score should return null');
});

test('Build recommendation: caution for spike detection', () => {
  const rec = buildRunningRecommendation({
    baseRecoveryScore: 75,
    runningACWR: 1.0,
    runs: [
      { date: new Date().toISOString().split('T')[0], distanceKm: 15 },
    ],
    profile: {},
    lastEfficiency: null,
    lastSpikeDetection: { risk: 'very_high' },
    vo2maxResolution: { vo2max: 50 },
    vdotTrainingPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
  });

  assert(rec.cautions.some(c => c.includes('distance spike')), 'should caution on spike detection');
});

test('Build recommendation: caution for high ACWR', () => {
  const rec = buildRunningRecommendation({
    baseRecoveryScore: 75,
    runningACWR: 1.6, // High
    runs: [],
    profile: {},
    lastEfficiency: null,
    lastSpikeDetection: null,
    vo2maxResolution: { vo2max: 50 },
    vdotTrainingPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
  });

  assert(rec.cautions.some(c => c.includes('ACWR')), 'should caution on high ACWR');
});

test('Build recommendation: week session count tracking', () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

  const rec = buildRunningRecommendation({
    baseRecoveryScore: 70,
    runningACWR: 1.0,
    runs: [
      { date: twoDaysAgo, distanceKm: 10 },
      { date: yesterday, distanceKm: 12 },
    ],
    profile: {},
    lastEfficiency: null,
    lastSpikeDetection: null,
    vo2maxResolution: { vo2max: 50 },
    vdotTrainingPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
  });

  assert.strictEqual(rec.weekSessionCount, 2, 'should count runs from past 7 days');
});
