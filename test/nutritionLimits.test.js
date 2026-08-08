const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HARD_LIMIT_DEFICIT_PCT, WARNING_DEFICIT_PCT, FLAT_FALLBACK_DEFICIT_PCT, KCAL_PER_KG_FAT,
  estimateBMR, activityMultiplierFor, estimateMaintenanceCalories, applyDeficitLimit,
  impliedTargetWeightKg, calorieTargetForFatLossGoal, inferDietGoal, computeAutoMacroTargets,
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

test('impliedTargetWeightKg passes a weight-metric goal target straight through', () => {
  assert.equal(impliedTargetWeightKg({ metric: 'weight', target: 75 }, 85, null), 75);
});

test('impliedTargetWeightKg derives a target bodyweight from a bodyFat-metric goal via lean-mass-constant', () => {
  // 90kg @ 25% bf -> 67.5kg lean mass. Solving for 15% bf at the same lean
  // mass: 67.5 / 0.85 = 79.41kg.
  const target = impliedTargetWeightKg({ metric: 'bodyFat', target: 15 }, 90, 25);
  assert.ok(Math.abs(target - 79.41) < 0.01, `expected ~79.41, got ${target}`);
});

test('impliedTargetWeightKg returns null for a bodyFat goal missing a current body-fat reading', () => {
  assert.equal(impliedTargetWeightKg({ metric: 'bodyFat', target: 15 }, 90, null), null);
});

test('calorieTargetForFatLossGoal falls back to a flat 15% deficit off maintenance without a concrete goal', () => {
  const result = calorieTargetForFatLossGoal({ maintenanceCalories: 2500, currentWeightKg: 90, currentBodyFatPct: null, goal: null, todayISO: '2026-08-07' });
  assert.equal(result.source, 'flat-fallback');
  assert.equal(result.calories, Math.round(2500 * (1 - FLAT_FALLBACK_DEFICIT_PCT / 100)));
});

test('calorieTargetForFatLossGoal falls back to flat 15% when the target date has already passed', () => {
  const goal = { concrete: true, metric: 'weight', target: 80, targetDate: '2026-01-01' };
  const result = calorieTargetForFatLossGoal({ maintenanceCalories: 2500, currentWeightKg: 90, currentBodyFatPct: null, goal, todayISO: '2026-08-07' });
  assert.equal(result.source, 'flat-fallback');
});

test('calorieTargetForFatLossGoal falls back to flat 15% when already at or past the target weight', () => {
  const goal = { concrete: true, metric: 'weight', target: 90, targetDate: '2026-12-01' };
  const result = calorieTargetForFatLossGoal({ maintenanceCalories: 2500, currentWeightKg: 88, currentBodyFatPct: null, goal, todayISO: '2026-08-07' });
  assert.equal(result.source, 'flat-fallback');
});

test('calorieTargetForFatLossGoal sizes the deficit to hit a concrete weight goal by its target date', () => {
  // 10kg to lose over 100 days: 10 * 7700 / 100 = 770kcal/day deficit.
  const goal = { concrete: true, metric: 'weight', target: 80, targetDate: '2026-11-15' };
  const result = calorieTargetForFatLossGoal({ maintenanceCalories: 2800, currentWeightKg: 90, currentBodyFatPct: null, goal, todayISO: '2026-08-07' });
  assert.equal(result.source, 'goal-timeframe');
  assert.equal(result.daysRemaining, 100);
  assert.equal(result.weightToLoseKg, 10);
  assert.equal(result.calories, Math.round(2800 - (10 * KCAL_PER_KG_FAT) / 100));
});

test('calorieTargetForFatLossGoal sizes a bodyFat-metric goal via the lean-mass-constant conversion', () => {
  const goal = { concrete: true, metric: 'bodyFat', target: 15, targetDate: '2026-11-15' };
  const result = calorieTargetForFatLossGoal({ maintenanceCalories: 2800, currentWeightKg: 90, currentBodyFatPct: 25, goal, todayISO: '2026-08-07' });
  assert.equal(result.source, 'goal-timeframe');
  assert.ok(result.weightToLoseKg > 0);
});

test('inferDietGoal picks cut when a fatLoss goal is present, recomp otherwise', () => {
  assert.equal(inferDietGoal([{ type: 'fatLoss', concrete: false }]), 'cut');
  assert.equal(inferDietGoal([{ type: 'muscle', concrete: false }]), 'recomp');
  assert.equal(inferDietGoal([]), 'recomp');
  assert.equal(inferDietGoal(undefined), 'recomp');
});

test('computeAutoMacroTargets infers recomp and uses the flat bodyweight multiplier without a fatLoss goal', () => {
  const result = computeAutoMacroTargets({ weightKg: 80, goals: [{ type: 'muscle' }], todayISO: '2026-08-07' });
  assert.equal(result.goal, 'recomp');
  assert.equal(result.targets.calories, 80 * 26);
  assert.equal(result.targets.protein, 80 * 2.0);
  assert.equal(result.targets.fat, 80);
  assert.equal(result.deficitCheck, null);
});

test('computeAutoMacroTargets infers cut from a fatLoss goal and sizes off real TDEE + the goal timeframe', () => {
  const goals = [{ type: 'fatLoss', concrete: true, metric: 'weight', target: 80, targetDate: '2026-11-15' }];
  const result = computeAutoMacroTargets({
    sex: 'male', weightKg: 90, heightCm: 180, age: 30, trainingDaysPerWeek: 4,
    goals, todayISO: '2026-08-07',
  });
  assert.equal(result.goal, 'cut');
  assert.equal(result.deficitCheck.source, 'goal-timeframe');
  assert.ok(result.deficitCheck.maintenanceCalories > 0);
  // Sized to hit the goal, not the flat bw*22 guess.
  assert.notEqual(result.targets.calories, Math.round(90 * 22));
});

test('computeAutoMacroTargets cut falls back to the flat bodyweight guess without enough profile data for a BMR', () => {
  const goals = [{ type: 'fatLoss', concrete: true, metric: 'weight', target: 80, targetDate: '2026-11-15' }];
  const result = computeAutoMacroTargets({ weightKg: 90, goals, todayISO: '2026-08-07' }); // no sex/height/age
  assert.equal(result.goal, 'cut');
  assert.equal(result.targets.calories, Math.round(90 * 22));
  assert.equal(result.deficitCheck, null);
});

test('computeAutoMacroTargets still honors an explicit goal override (older cut/recomp/bulk callers)', () => {
  const result = computeAutoMacroTargets({ goal: 'bulk', weightKg: 80, todayISO: '2026-08-07' });
  assert.equal(result.goal, 'bulk');
  assert.equal(result.targets.calories, 80 * 30);
  assert.equal(result.targets.protein, 80 * 1.8);
});

test('computeAutoMacroTargets cut still clamps through applyDeficitLimit for an unreasonably tight goal timeframe', () => {
  // 15kg to lose in 60 days (a 1925kcal/day deficit) is far past the 30% hard
  // limit off this profile's ~2914kcal estimated maintenance.
  const goals = [{ type: 'fatLoss', concrete: true, metric: 'weight', target: 75, targetDate: '2026-10-06' }];
  const result = computeAutoMacroTargets({
    sex: 'male', weightKg: 90, heightCm: 180, age: 30, trainingDaysPerWeek: 4,
    goals, todayISO: '2026-08-07',
  });
  assert.equal(result.deficitCheck.status, 'hard-limit');
  assert.equal(result.targets.calories, Math.round(result.deficitCheck.maintenanceCalories * 0.7));
});

test('computeAutoMacroTargets defaults an unset/non-positive weight to 75kg, same as the old inline /macro-auto fallback', () => {
  const a = computeAutoMacroTargets({ goals: [], todayISO: '2026-08-07' });
  const b = computeAutoMacroTargets({ weightKg: 75, goals: [], todayISO: '2026-08-07' });
  assert.deepEqual(a.targets, b.targets);
  const withZero = computeAutoMacroTargets({ weightKg: 0, goals: [], todayISO: '2026-08-07' });
  assert.deepEqual(withZero.targets, b.targets);
});
