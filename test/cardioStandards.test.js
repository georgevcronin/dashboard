const { test } = require('node:test');
const assert = require('node:assert/strict');
const { thresholdsForAge, computeCardioScore } = require('../functions/cardioStandards');

test('thresholdsForAge returns null with no age, sex, or unknown sex', () => {
  assert.equal(thresholdsForAge(null, 'male'), null);
  assert.equal(thresholdsForAge(30, null), null);
  assert.equal(thresholdsForAge(30, 'nonbinary'), null);
});

test('thresholdsForAge clamps below the youngest and above the oldest bracket', () => {
  const under20 = thresholdsForAge(15, 'male');
  const bracket20 = thresholdsForAge(20, 'male');
  assert.deepEqual(under20, bracket20);

  const over60 = thresholdsForAge(80, 'female');
  const bracket60 = thresholdsForAge(60, 'female');
  assert.deepEqual(over60, bracket60);
});

test('thresholdsForAge interpolates between adjacent brackets', () => {
  // Halfway between the 20 and 30 male brackets
  const t20 = thresholdsForAge(20, 'male');
  const t30 = thresholdsForAge(30, 'male');
  const t25 = thresholdsForAge(25, 'male');
  for (let i = 0; i < t20.length; i++) {
    assert.ok(Math.abs(t25[i] - (t20[i] + t30[i]) / 2) < 0.01);
  }
});

test('computeCardioScore returns null with no vo2max or unresolvable thresholds', () => {
  assert.equal(computeCardioScore(null, 30, 'male'), null);
  assert.equal(computeCardioScore(45, null, 'male'), null);
  assert.equal(computeCardioScore(45, 30, null), null);
});

test('computeCardioScore returns a Beginner->Elite tier with band info', () => {
  // 35-year-old male, thresholds interpolated between the 30 and 40 brackets
  const result = computeCardioScore(45, 35, 'male');
  assert.equal(result.vo2max, 45);
  assert.ok(['Beginner 1', 'Beginner 2', 'Beginner 3', 'Novice 1', 'Novice 2', 'Novice 3',
    'Intermediate 1', 'Intermediate 2', 'Intermediate 3', 'Advanced 1', 'Advanced 2', 'Advanced 3',
    'Elite 1', 'Elite 2', 'Elite 3'].includes(result.tier), `unexpected tier: ${result.tier}`);
  assert.ok(result.score > 0);
  assert.ok(result.bandFloor <= result.score);
  assert.ok(result.bandCeiling === null || result.bandCeiling > result.score);
});

test('computeCardioScore: a very low VO2max for the age/sex scores near the bottom', () => {
  const result = computeCardioScore(15, 30, 'male');
  assert.ok(result.score < 20);
});

test('computeCardioScore: an elite-level VO2max for the age/sex scores at the top', () => {
  const result = computeCardioScore(70, 30, 'male');
  assert.ok(result.score >= 100);
  assert.equal(result.bandCeiling, null); // past the last named checkpoint
});
