const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildObservations, solveMuscleCapacities, predictExerciseE1RM, suggestedWeightForReps, MIN_OBSERVATIONS,
  FULL_CONFIDENCE_OBSERVATIONS, RIDGE_CANDIDATES, chooseRidge, personalizedPriorRatios, EQUIPMENT_LOAD_FACTOR,
  personalizedEquipmentFactors, EQUIPMENT_FACTOR_SHRINKAGE_K,
} = require('../functions/muscleCapacity');
const { estimate1RM } = require('../functions/strengthStandards');
const { emgForAngle } = require('../functions/emgActivation');

test('buildObservations skips exercises with no known angle mapping', () => {
  const lifts = [{ date: '2026-01-01', exercise: 'Some Exercise Never Logged Before', kg: 100, reps: 5 }];
  assert.deepEqual(buildObservations(lifts), []);
});

test('buildObservations picks the single best (highest) e1RM per exercise, not every set', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-02-01', exercise: 'Bent Over Row (Barbell)', kg: 100, reps: 5 }, // higher e1RM
    { date: '2026-03-01', exercise: 'Bent Over Row (Barbell)', kg: 60, reps: 10 },
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].e1rm, estimate1RM(100, 5));
});

test('buildObservations excludes lifts over the 12-rep reliability cutoff (estimate1RM returns null)', () => {
  const lifts = [{ date: '2026-01-01', exercise: 'Dumbbell Row', kg: 40, reps: 20 }];
  assert.deepEqual(buildObservations(lifts), []);
});

test('buildObservations resolves the exercise\'s pattern+angle to a real EMG weight vector', () => {
  const lifts = [{ date: '2026-01-01', exercise: 'T Bar Row', kg: 80, reps: 8 }];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 1);
  assert.deepEqual(obs[0].weights, emgForAngle('row', 75));
});

test('buildObservations keeps distinct angles logged under a SHARED family exercise name as distinct observations, not collapsed by name', () => {
  // No EXERCISE_ANGLES entry exists for "cable fly" (a PressRowBuilder
  // family name) -- angle/pattern must come from the lift's own fields.
  const lifts = [
    { date: '2026-01-01', exercise: 'Cable Fly', kg: 40, reps: 8, angle: 30, pattern: 'fly' },
    { date: '2026-01-02', exercise: 'Cable Fly', kg: 25, reps: 8, angle: 150, pattern: 'fly' },
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 2, 'two distinct angles under one shared name should be two observations, not one');
  const byAngle = Object.fromEntries(obs.map(o => [o.angle, o]));
  assert.deepEqual(byAngle[30].weights, emgForAngle('fly', 30));
  assert.deepEqual(byAngle[150].weights, emgForAngle('fly', 150));
});

test('buildObservations with 3+ distinct angles under a shared family name gives solveMuscleCapacities enough signal to succeed', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Cable Fly', kg: 40, reps: 8, angle: 0, pattern: 'fly' },
    { date: '2026-01-02', exercise: 'Cable Fly', kg: 35, reps: 8, angle: 90, pattern: 'fly' },
    { date: '2026-01-03', exercise: 'Cable Fly', kg: 20, reps: 8, angle: 180, pattern: 'fly' },
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 3);
  assert.ok(obs.length >= MIN_OBSERVATIONS);
  assert.ok(solveMuscleCapacities(obs) != null, 'three distinct angles should be enough signal to solve, even collapsed to one name each set was logged under');
});

test('buildObservations still dedupes to the single best e1RM WITHIN the same (name, angle) pair', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Cable Fly', kg: 30, reps: 8, angle: 90, pattern: 'fly' },
    { date: '2026-02-01', exercise: 'Cable Fly', kg: 40, reps: 8, angle: 90, pattern: 'fly' }, // higher e1RM, same angle
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 1, 'same name AND same angle should still collapse to one observation');
  assert.equal(obs[0].e1rm, estimate1RM(40, 8));
});

test('buildObservations falls back to EXERCISE_ANGLES when angle is present but pattern is missing (or vice versa), rather than treating it as a family lift with an undefined pattern', () => {
  // "T Bar Row" IS in EXERCISE_ANGLES (row, 75) -- an incomplete per-lift
  // angle/pattern pair should not shadow that real, working fallback.
  const angleOnly = buildObservations([{ date: '2026-01-01', exercise: 'T Bar Row', kg: 80, reps: 8, angle: 999 }]);
  assert.equal(angleOnly.length, 1);
  assert.equal(angleOnly[0].angle, 75, 'pattern missing -- should fall through to EXERCISE_ANGLES, ignoring the stray angle field');

  const patternOnly = buildObservations([{ date: '2026-01-01', exercise: 'T Bar Row', kg: 80, reps: 8, pattern: 'fly' }]);
  assert.equal(patternOnly.length, 1);
  assert.equal(patternOnly[0].pattern, 'row', 'angle missing -- should fall through to EXERCISE_ANGLES, ignoring the stray pattern field');
});

test('buildObservations behavior for non-family (EXERCISE_ANGLES-mapped) exercises is unchanged: one observation per name, best e1RM wins', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-02-01', exercise: 'Bent Over Row (Barbell)', kg: 100, reps: 5 },
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].e1rm, estimate1RM(100, 5));
});

test('chooseRidge picks a weak ridge for well-spread, low-noise data and a strong one for sparse/collinear data', () => {
  const { ANGLES, PRESS_EMG } = require('../functions/emgActivation');
  const trueCapacities = { 'front-delt': 55, 'mid-delt': 45, chest: 90, biceps: 35, triceps: 60, serratus: 40, 'lower-traps': 30 };
  const genE1RM = angle => Object.entries(PRESS_EMG[angle]).reduce((s, [m, pct]) => s + (pct / 100) * trueCapacities[m], 0);

  // Rich, well-spread signal: barely any regularization needed.
  const richLifts = ANGLES.map((a, i) => ({ date: '2026-01-01', exercise: 'P' + i, kg: genE1RM(a), reps: 1, angle: a, pattern: 'press' }));
  const richRidge = chooseRidge(buildObservations(richLifts));
  assert.ok(richRidge <= RIDGE_CANDIDATES[1], `well-covered data should pick a weak ridge, got ${richRidge}`);

  // Only 3 closely-spaced angles: minimal, highly collinear signal, should
  // pick strong regularization rather than trust a near-singular fit.
  const sparseLifts = [30, 45, 60].map((a, i) => ({ date: '2026-01-01', exercise: 'Q' + i, kg: genE1RM(a), reps: 1, angle: a, pattern: 'press' }));
  const sparseRidge = chooseRidge(buildObservations(sparseLifts));
  assert.ok(sparseRidge >= RIDGE_CANDIDATES[RIDGE_CANDIDATES.length - 2], `sparse/collinear data should pick a strong ridge, got ${sparseRidge}`);
});

test('personalizedPriorRatios derives ratios from the athlete\'s own MUSCLE_EXERCISE_MAP reference lifts', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 120, reps: 5 }, // chest ref
    { date: '2026-01-01', exercise: 'Cable Tricep Pushdown (Bar)', kg: 60, reps: 5 }, // triceps ref
  ];
  const ratios = personalizedPriorRatios(lifts, ['chest', 'triceps']);
  const chestEst = require('../functions/strengthStandards').estimate1RM(120, 5);
  const tricepsEst = require('../functions/strengthStandards').estimate1RM(60, 5);
  const mean = (chestEst + tricepsEst) / 2;
  assert.ok(Math.abs(ratios.chest - chestEst / mean) < 1e-9);
  assert.ok(Math.abs(ratios.triceps - tricepsEst / mean) < 1e-9);
});

test('personalizedPriorRatios defaults to 1 (no personalization) for muscles MUSCLE_EXERCISE_MAP does not cover, and when lifts is missing/insufficient', () => {
  const lifts = [{ date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 120, reps: 5 }];
  // serratus/lower-traps have no MUSCLE_EXERCISE_MAP entry at all.
  const ratios = personalizedPriorRatios(lifts, ['chest', 'serratus', 'lower-traps']);
  assert.equal(ratios.serratus, 1);
  assert.equal(ratios['lower-traps'], 1);
  // Only 1 muscle covered (chest) -- "relative to what?" -- stays neutral too.
  assert.equal(ratios.chest, 1);

  assert.deepEqual(personalizedPriorRatios(undefined, ['chest', 'triceps']), { chest: 1, triceps: 1 });
  assert.deepEqual(personalizedPriorRatios([], ['chest', 'triceps']), { chest: 1, triceps: 1 });
});

test('solveMuscleCapacities(observations, lifts) with a personalized prior improves a held-out prediction over the flat prior, when broader history reflects the true imbalance', () => {
  const { PRESS_EMG } = require('../functions/emgActivation');
  const trueCapacities = { 'front-delt': 55, 'mid-delt': 45, chest: 90, biceps: 35, triceps: 60, serratus: 40, 'lower-traps': 30 };
  const genE1RM = angle => Object.entries(PRESS_EMG[angle]).reduce((s, [m, pct]) => s + (pct / 100) * trueCapacities[m], 0);

  const broaderLifts = [
    { date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 140, reps: 3 },
    { date: '2026-01-01', exercise: 'Dumbbell Front Raise', kg: 12, reps: 8 },
    { date: '2026-01-01', exercise: 'Barbell Curl', kg: 25, reps: 8 },
    { date: '2026-01-01', exercise: 'Cable Tricep Pushdown (Bar)', kg: 45, reps: 8 },
  ];
  // Degenerate case: 3 same-angle press observations, matching the real
  // account scenario this whole feature was built from.
  const pressLifts = [30, 30, 30].map((a, i) => ({ date: '2026-01-01', exercise: 'PressObs' + i, kg: genE1RM(a) * (0.9 + 0.1 * i), reps: 1, angle: a, pattern: 'press' }));
  const allLifts = [...broaderLifts, ...pressLifts];
  const obs = buildObservations(allLifts);

  const flatResult = solveMuscleCapacities(obs);
  const personalResult = solveMuscleCapacities(obs, allLifts);

  const truth90 = genE1RM(90); // a genuinely different, never-logged angle
  const flatErr = Math.abs(predictExerciseE1RM('press', 90, flatResult).e1rm - truth90) / truth90;
  const personalErr = Math.abs(predictExerciseE1RM('press', 90, personalResult).e1rm - truth90) / truth90;
  assert.ok(personalErr < flatErr, `personalized prior (${(personalErr * 100).toFixed(1)}%) should beat the flat prior (${(flatErr * 100).toFixed(1)}%) here`);
});

test('solveMuscleCapacities without a lifts argument is unaffected (backward compatible) -- identical to omitting personalization entirely', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
    { date: '2026-01-03', exercise: 'Pendlay Row (Barbell)', kg: 75, reps: 8 },
  ];
  const obs = buildObservations(lifts);
  const withoutLifts = solveMuscleCapacities(obs);
  const withUndefined = solveMuscleCapacities(obs, undefined);
  assert.deepEqual(withoutLifts, withUndefined);
});

test('solveMuscleCapacities returns null only with ZERO observations -- below FULL_CONFIDENCE_OBSERVATIONS it still returns a real, honestly-labeled rough result', () => {
  assert.equal(solveMuscleCapacities([]), null, 'no data at all -- nothing to compute');

  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
  ];
  const obs = buildObservations(lifts);
  assert.ok(obs.length < FULL_CONFIDENCE_OBSERVATIONS, 'sanity check: this is the sparse case, not the well-covered one');
  const result = solveMuscleCapacities(obs);
  assert.ok(result != null, 'a rough ballpark from real (if sparse) data should not be withheld entirely');
  assert.equal(result.sampleSize, obs.length);
  const pred = predictExerciseE1RM('row', 90, result);
  assert.equal(pred.confidence, 'rough', 'a prediction built on fewer than FULL_CONFIDENCE_OBSERVATIONS should say so, not claim full/partial confidence');
});

test('solveMuscleCapacities with a single observation leans on the strongest ridge candidate (no leave-one-out possible) and still produces a labeled-rough result', () => {
  const lifts = [{ date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 }];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, 1);
  const result = solveMuscleCapacities(obs);
  assert.ok(result != null);
  assert.equal(result.sampleSize, 1);
  const pred = predictExerciseE1RM('row', 90, result);
  assert.ok(pred != null);
  assert.equal(pred.confidence, 'rough');
});

// Synthetic ground-truth check: generate exact e1RM values FROM known
// per-muscle capacities (no noise), across several different row angles,
// then confirm the regression recovers a held-out angle's prediction close
// to the true value. Tightened from an earlier 0.3x-1.8x tolerance after
// switching the ridge regularization's target from 0 to the mean implied
// capacity (see solveMuscleCapacities' comment) -- regularizing toward 0
// produced a consistent ~15-35% UNDER-prediction in this exact scenario
// (every real capacity is positive, so shrinking toward 0 can only ever
// bias predictions down); regularizing toward the mean cuts that to low
// single digits. This bound is a real regression guard against that bias
// coming back, not just a loose sanity check.
test('solveMuscleCapacities + predictExerciseE1RM recovers a sane prediction for a held-out angle from synthetic ground truth', () => {
  const trueCapacities = { lats: 100, biceps: 60, 'rear-delt': 40, 'mid-delt': 45, 'mid-traps': 50, rhomboids: 50, 'teres-major': 70, brachioradialis: 35 };
  const generateE1RM = (pattern, angle) => {
    const w = emgForAngle(pattern, angle);
    return Object.entries(w).reduce((sum, [m, pct]) => sum + (pct / 100) * trueCapacities[m], 0);
  };
  // Use 6 distinct logged (angle-mapped) row exercises spanning a wide
  // angle range, holding out angle 90 (iso-lateral row / dumbbell row /
  // seated row's mapped angle) as the prediction target.
  const trainingExercises = [
    ['Bent Over Row (Barbell)', 'row', 15],
    ['High Lat Row', 'row', 15],
    ['T Bar Row', 'row', 75],
    ['Chest-Supported Barbell Row', 'row', 105],
    ['Chest Supported Incline Row (Dumbbell)', 'row', 120],
    ['Pendlay Row (Barbell)', 'row', 105],
  ];
  const lifts = trainingExercises.map(([name, pattern, angle]) => ({
    date: '2026-01-01', exercise: name, kg: generateE1RM(pattern, angle), reps: 1,
  }));
  const obs = buildObservations(lifts);
  assert.equal(obs.length, trainingExercises.length);
  const result = solveMuscleCapacities(obs);
  assert.ok(result != null);

  const trueHeldOut = generateE1RM('row', 90);
  const prediction = predictExerciseE1RM('row', 90, result);
  assert.ok(prediction != null);
  assert.ok(prediction.e1rm > trueHeldOut * 0.7 && prediction.e1rm < trueHeldOut * 1.3,
    `prediction ${prediction.e1rm} should be within 30% of true value ${trueHeldOut}`);
});

// Direct regression guard for the bias itself, not just "roughly in range":
// regularizing toward 0 has no reason to ever push a prediction ABOVE the
// true value (it can only shrink toward 0, i.e. down) -- so if predictions
// across a wide spread of angles are consistently high as often as they're
// low, the fix is doing its job. A reintroduced zero-prior bug would show
// up here as every single one of these coming in low.
test('predictExerciseE1RM is not one-directionally biased across a full spread of angles (regression guard for the ridge-toward-zero bug)', () => {
  const { ANGLES, PRESS_EMG } = require('../functions/emgActivation');
  const trueCapacities = { 'front-delt': 55, 'mid-delt': 45, chest: 90, biceps: 35, triceps: 60, serratus: 40, 'lower-traps': 30 };
  const genE1RM = angle => Object.entries(PRESS_EMG[angle]).reduce((s, [m, pct]) => s + (pct / 100) * trueCapacities[m], 0);
  const lifts = ANGLES.map((a, i) => ({ date: '2026-01-01', exercise: 'PressAngle' + i, kg: genE1RM(a), reps: 1, angle: a, pattern: 'press' }));
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.ok(result != null);
  const diffs = ANGLES.map(a => predictExerciseE1RM('press', a, result).e1rm - genE1RM(a));
  const under = diffs.filter(d => d < 0).length;
  const over = diffs.filter(d => d > 0).length;
  assert.ok(under > 0 && over > 0, `predictions should land on both sides of true value, not all ${under ? 'under' : 'over'} (diffs: ${diffs.map(d => d.toFixed(1))})`);
  const meanAbsPctErr = diffs.reduce((s, d, i) => s + Math.abs(d / genE1RM(ANGLES[i])), 0) / diffs.length * 100;
  assert.ok(meanAbsPctErr < 10, `mean absolute error should be under 10% with all 13 angles logged, got ${meanAbsPctErr.toFixed(1)}%`);
});

test('predictExerciseE1RM flags confidence "partial" when a significant contributing muscle has no regression data, given enough distinct directions to otherwise be "full"', () => {
  // 4 genuinely distinct press angles (0/15/60/90) -- enough directions for
  // 'full' on the muscles it DOES cover -- but predicting a ROW angle means
  // every row-specific muscle (lats, rhomboids, etc.) still has zero
  // coverage, which is the specific thing 'partial' is meant to flag.
  const lifts = [
    { date: '2026-01-01', exercise: 'Overhead Press (Barbell)', kg: 60, reps: 5 }, // 15°
    { date: '2026-01-02', exercise: 'Standing Military Press (Barbell)', kg: 55, reps: 5 }, // 0°
    { date: '2026-01-03', exercise: 'Underhand Smith Machine Press', kg: 65, reps: 5 }, // 75°
    { date: '2026-01-04', exercise: 'Supine Press', kg: 70, reps: 5 }, // 90°
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.ok(result.distinctDirections >= FULL_CONFIDENCE_OBSERVATIONS, 'sanity check: this scenario should have enough directions to not be "rough"');
  const prediction = predictExerciseE1RM('row', 90, result);
  assert.ok(prediction == null || prediction.confidence === 'partial');
});

test('predictExerciseE1RM flags confidence "rough" when distinct directions are too few, even with plenty of raw observations (same-angle collapse)', () => {
  // Real-account case this was built from: several observations, but all
  // the SAME angle -- only 1 genuinely independent equation regardless of
  // how many separate exercise names logged it.
  const lifts = [
    { date: '2026-01-01', exercise: 'Overhead Press (Smith Machine)', kg: 85, reps: 4 },
    { date: '2026-01-02', exercise: 'Machine Shoulder Press', kg: 73, reps: 4 },
    { date: '2026-01-03', exercise: 'Shoulder Press (Machine Plates)', kg: 55, reps: 5 },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.equal(result.sampleSize, 3);
  assert.equal(result.distinctDirections, 1, 'all 3 are angle 30 -- only 1 real independent direction');
  const prediction = predictExerciseE1RM('press', 15, result);
  assert.equal(prediction.confidence, 'rough', 'raw observation count (3) should NOT be enough to call this "full" -- diversity is what matters');
});

test('suggestedWeightForReps round-trips through estimate1RM (direct algebraic inverse, not an approximation)', () => {
  const e1rmTarget = 120;
  const weight = suggestedWeightForReps(e1rmTarget, 8);
  const roundTripped = estimate1RM(weight, 8);
  assert.ok(Math.abs(roundTripped - e1rmTarget) < 0.5, `round-trip should recover ~${e1rmTarget}, got ${roundTripped}`);
});

test('suggestedWeightForReps returns null for missing inputs', () => {
  assert.equal(suggestedWeightForReps(null, 8), null);
  assert.equal(suggestedWeightForReps(100, 0), null);
});

test('predictExerciseE1RM breakdown lists every contributing muscle, sums to the total, and sorts by contribution descending', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
    { date: '2026-01-03', exercise: 'Chest-Supported Barbell Row', kg: 70, reps: 8 },
    { date: '2026-01-04', exercise: 'Pendlay Row (Barbell)', kg: 75, reps: 8 },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  const prediction = predictExerciseE1RM('row', 90, result);
  assert.ok(prediction != null);
  assert.ok(Array.isArray(prediction.breakdown) && prediction.breakdown.length === Object.keys(emgForAngle('row', 90)).length);

  const summedContribution = prediction.breakdown.reduce((s, b) => s + b.contribution, 0);
  assert.ok(Math.abs(summedContribution - prediction.e1rm) < 0.5, `breakdown contributions (sum ${summedContribution}) should sum close to the total predicted e1RM (${prediction.e1rm}), modulo per-entry rounding`);

  for (let i = 1; i < prediction.breakdown.length; i++) {
    assert.ok(prediction.breakdown[i - 1].contribution >= prediction.breakdown[i].contribution, 'breakdown should be sorted highest contribution first');
  }
  for (const entry of prediction.breakdown) {
    assert.ok('muscle' in entry && 'pct' in entry && 'capacity' in entry && 'contribution' in entry && 'hasData' in entry);
    if (!entry.hasData) assert.equal(entry.capacity, null, 'a muscle with no regression data should report capacity as null, not a fabricated 0');
  }
});

test('personalizedEquipmentFactors returns {} with no paired barbell-vs-other-equipment data (defaults stand untouched)', () => {
  assert.deepEqual(personalizedEquipmentFactors([]), {});
  assert.deepEqual(personalizedEquipmentFactors(undefined), {});
  // Only ever logged on barbell -- nothing to compare against.
  const barbellOnly = [{ date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 100, reps: 1 }];
  assert.deepEqual(personalizedEquipmentFactors(barbellOnly), {});
  // Only ever logged on dumbbell, no barbell side of the same movementId to pair against.
  const dumbbellOnly = [{ date: '2026-01-01', exercise: 'Dumbbell Bench Press (Flat)', kg: 70, reps: 1 }];
  assert.deepEqual(personalizedEquipmentFactors(dumbbellOnly), {});
});

test('personalizedEquipmentFactors derives an empirical ratio from a real paired movement, shrunk toward the population default', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 100, reps: 1 },
    { date: '2026-01-01', exercise: 'Dumbbell Bench Press (Flat)', kg: 70, reps: 1 }, // this athlete's real ratio: 0.70
  ];
  const factors = personalizedEquipmentFactors(lifts);
  const expected = (1 * 0.70 + EQUIPMENT_FACTOR_SHRINKAGE_K * EQUIPMENT_LOAD_FACTOR.dumbbell) / (1 + EQUIPMENT_FACTOR_SHRINKAGE_K);
  assert.ok(Math.abs(factors.dumbbell - expected) < 1e-9);
  // Shrunk toward, not equal to, the raw empirical ratio -- one comparison alone shouldn't fully override the sourced default.
  assert.ok(factors.dumbbell > 0.70 && factors.dumbbell < EQUIPMENT_LOAD_FACTOR.dumbbell);
});

test('personalizedEquipmentFactors moves closer to the true ratio as more independent paired movements accumulate', () => {
  const onePair = [
    { date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 100, reps: 1 },
    { date: '2026-01-01', exercise: 'Dumbbell Bench Press (Flat)', kg: 70, reps: 1 },
  ];
  const twoPairs = [
    ...onePair,
    // A genuinely different movementId (overhead-press, not bench-press) --
    // incline/flat/decline bench all share ONE movementId by design (see
    // exerciseDb.js), so a second bench variant would NOT count as a second
    // independent pair; this does.
    { date: '2026-01-02', exercise: 'Standing Military Press (Barbell)', kg: 50, reps: 1 },
    { date: '2026-01-02', exercise: 'Shoulder Press (Dumbbell)', kg: 35, reps: 1 }, // also 0.70
  ];
  const oneRatio = personalizedEquipmentFactors(onePair).dumbbell;
  const twoRatio = personalizedEquipmentFactors(twoPairs).dumbbell;
  assert.ok(twoRatio < oneRatio, `2 consistent pairs (${twoRatio}) should shrink less than 1 pair (${oneRatio}) -- closer to the true 0.70`);
});

test('a personalized dumbbell factor improves a held-out barbell prediction over the population default, when the athlete\'s real ratio differs from it', () => {
  const { PRESS_EMG, ANGLES } = require('../functions/emgActivation');
  const trueCapacities = { 'front-delt': 55, 'mid-delt': 45, chest: 90, biceps: 35, triceps: 60, serratus: 40, 'lower-traps': 30 };
  const genBarbellE1RM = angle => Object.entries(PRESS_EMG[angle]).reduce((s, [m, pct]) => s + (pct / 100) * trueCapacities[m], 0);
  const TRUE_DB_FACTOR = 0.70; // lower than the 0.80 population default

  const pressLifts = ANGLES.map((a, i) => ({ date: '2026-01-01', exercise: 'Dumbbell Press', kg: genBarbellE1RM(a) * TRUE_DB_FACTOR, reps: 1, angle: a, pattern: 'press' }));
  const barbellBenchPair = [
    { date: '2026-01-01', exercise: 'Barbell Bench Press', kg: 100, reps: 1 },
    { date: '2026-01-01', exercise: 'Dumbbell Bench Press (Flat)', kg: 100 * TRUE_DB_FACTOR, reps: 1 },
  ];

  const withoutPersonalization = buildObservations(pressLifts);
  const withPersonalization = buildObservations([...pressLifts, ...barbellBenchPair]);
  const capNo = solveMuscleCapacities(withoutPersonalization, pressLifts);
  const capYes = solveMuscleCapacities(withPersonalization, [...pressLifts, ...barbellBenchPair]);

  const truth = genBarbellE1RM(90);
  const errNo = Math.abs(predictExerciseE1RM('press', 90, capNo, 'barbell').e1rm - truth);
  const errYes = Math.abs(predictExerciseE1RM('press', 90, capYes, 'barbell').e1rm - truth);
  assert.ok(errYes < errNo, `personalized (${errYes.toFixed(1)}) should beat unpersonalized (${errNo.toFixed(1)}) error against true barbell e1RM ${truth.toFixed(1)}`);
});

test('personalizedEquipmentFactors works for row via a real barbell-anchored movementId pair (chest-supported-row)', () => {
  const rowLifts = [
    { date: '2026-01-01', exercise: 'Chest-Supported Barbell Row', kg: 100, reps: 1 },
    { date: '2026-01-01', exercise: 'Chest-Supported Dumbbell Row', kg: 65, reps: 1 }, // true ratio 0.65
  ];
  const factors = personalizedEquipmentFactors(rowLifts);
  assert.equal(factors.barbell, 1.0);
  const expected = (1 * 0.65 + EQUIPMENT_FACTOR_SHRINKAGE_K * EQUIPMENT_LOAD_FACTOR.dumbbell) / (1 + EQUIPMENT_FACTOR_SHRINKAGE_K);
  assert.ok(Math.abs(factors.dumbbell - expected) < 1e-9);
});

test('personalizedEquipmentFactors handles fly correctly even though NO fly movement has a barbell variant at all -- bridges pairwise ratios through the population defaults', () => {
  // rear-delt-fly is the only multi-equipment fly-pattern movementId in
  // exerciseDb.js, and it's dumbbell/cable/machine ONLY (no barbell fly
  // exists as a real exercise) -- a naive "only compare against barbell"
  // implementation would produce nothing here even with real paired data.
  const { EXERCISE_DB } = require('../functions/exerciseDb');
  const flyGroup = EXERCISE_DB.filter(e => e.movementId === 'rear-delt-fly');
  assert.ok(!flyGroup.some(e => e.equipment === 'barbell'), 'sanity check: this movement genuinely has no barbell variant');
  assert.ok(new Set(flyGroup.map(e => e.equipment)).size >= 2, 'sanity check: still has real cross-equipment data to compare');

  const flyLifts = [
    { date: '2026-01-01', exercise: 'Rear Delt Fly (Dumbbell)', kg: 20, reps: 1 },
    { date: '2026-01-01', exercise: 'Rear Delt Fly (Cable)', kg: 24, reps: 1 },
    { date: '2026-01-01', exercise: 'Reverse Pec Deck', kg: 27, reps: 1 },
  ];
  const factors = personalizedEquipmentFactors(flyLifts);
  assert.ok('dumbbell' in factors && 'cable' in factors && 'machine' in factors, 'all three should be personalized despite no barbell anchor');
  // Direction should still be sane: this athlete's real numbers order
  // machine > cable > dumbbell, same relative order as the population
  // defaults (machine=1.20 > cable=1.05 > dumbbell=0.80).
  assert.ok(factors.machine > factors.cable && factors.cable > factors.dumbbell);
});
