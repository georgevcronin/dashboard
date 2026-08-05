const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HARD_LIMIT_DEFICIT_PCT, WARNING_DEFICIT_PCT,
  estimateBMR, activityMultiplierFor, estimateMaintenanceCalories, applyDeficitLimit,
} = require('../functions/nutritionLimits');

test('estimateBMR returns null without enough profile data', () => {
  assert.equal(estimateBMR({}), null);
  assert.equal(estimateBMR({ weightKg: 80 }), null);
  assert.equal(estimateBMR({ weightKg: 80, heightCm: 180 }), null);
});

test('estimateBMR applies the Mifflin-St Jeor sex offset', () => {
  const male = estimateBMR({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 });
  const female = estimateBMR({ sex: 'female', weightKg: 80, heightCm: 180, age: 30 });
  const unspecified = estimateBMR({ weightKg: 80, heightCm: 180, age: 30 });
  assert.ok(male > female);
  // unspecified sits at the midpoint of the two sex offsets
  assert.equal(unspecified, Math.round((male + female) / 2));
});

test('estimateBMR rises with more bodyweight and height, falls with age', () => {
  const base = estimateBMR({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 });
  assert.ok(estimateBMR({ sex: 'male', weightKg: 90, heightCm: 180, age: 30 }) > base);
  assert.ok(estimateBMR({ sex: 'male', weightKg: 80, heightCm: 190, age: 30 }) > base);
  assert.ok(estimateBMR({ sex: 'male', weightKg: 80, heightCm: 180, age: 50 }) < base);
});

test('activityMultiplierFor climbs in bands from sedentary to very active', () => {
  assert.equal(activityMultiplierFor(0), 1.2);
  assert.equal(activityMultiplierFor(1), 1.2);
  assert.equal(activityMultiplierFor(2), 1.375);
  assert.equal(activityMultiplierFor(3), 1.375);
  assert.equal(activityMultiplierFor(4), 1.55);
  assert.equal(activityMultiplierFor(5), 1.55);
  assert.equal(activityMultiplierFor(6), 1.725);
  assert.equal(activityMultiplierFor(7), 1.725);
});

test('activityMultiplierFor defaults to the moderate 4-day band when unset', () => {
  assert.equal(activityMultiplierFor(undefined), activityMultiplierFor(4));
});

test('estimateMaintenanceCalories returns null without enough profile data', () => {
  assert.equal(estimateMaintenanceCalories({ weightKg: 80 }), null);
});

test('estimateMaintenanceCalories rises with training frequency for the same body stats', () => {
  const stats = { sex: 'male', weightKg: 80, heightCm: 180, age: 30 };
  const sedentary = estimateMaintenanceCalories({ ...stats, trainingDaysPerWeek: 0 });
  const veryActive = estimateMaintenanceCalories({ ...stats, trainingDaysPerWeek: 7 });
  assert.ok(veryActive > sedentary);
});

test('applyDeficitLimit passes a mild deficit through untouched', () => {
  const result = applyDeficitLimit(2200, 2500); // 12% deficit
  assert.equal(result.status, 'ok');
  assert.equal(result.calories, 2200);
  assert.equal(result.message, null);
});

test('applyDeficitLimit warns between the warning and hard-limit thresholds', () => {
  const result = applyDeficitLimit(1900, 2500); // 24% deficit
  assert.equal(result.status, 'warning');
  assert.equal(result.calories, 1900, 'warning does not alter the calorie target');
  assert.ok(result.deficitPct > WARNING_DEFICIT_PCT && result.deficitPct <= HARD_LIMIT_DEFICIT_PCT);
  assert.match(result.message, /24%/);
});

test('applyDeficitLimit clamps a deficit past the hard limit to exactly 30% off maintenance', () => {
  const result = applyDeficitLimit(1000, 2500); // 60% deficit, well past the limit
  assert.equal(result.status, 'hard-limit');
  assert.equal(result.calories, Math.round(2500 * 0.7));
  assert.match(result.message, /isn't attainable/);
  assert.match(result.message, /30%/);
});

test('applyDeficitLimit treats exactly the threshold percentages as not yet over the line', () => {
  const atWarning = applyDeficitLimit(2000, 2500); // exactly 20%
  assert.equal(atWarning.status, 'ok');
  const atHardLimit = applyDeficitLimit(1750, 2500); // exactly 30%
  assert.equal(atHardLimit.status, 'warning');
});

test('applyDeficitLimit is a no-op without a maintenance estimate to check against', () => {
  const result = applyDeficitLimit(1000, null);
  assert.equal(result.status, 'ok');
  assert.equal(result.calories, 1000);
});
