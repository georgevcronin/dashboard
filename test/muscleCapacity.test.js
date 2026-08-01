const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildObservations, solveMuscleCapacities, predictExerciseE1RM, suggestedWeightForReps, MIN_OBSERVATIONS,
  EQUIPMENT_MIN_OBSERVATIONS,
} = require('../functions/muscleCapacity');
const { estimate1RM } = require('../functions/strengthStandards');
const { emgForAngle } = require('../functions/emgActivation');

// Shared synthetic ground truth for the adaptive-lambda and equipment-ALS
// tests below -- a plausible per-muscle capacity vector spanning both press
// and row patterns, same idea as the existing recovery test's trueCapacities.
const GROUND_TRUTH_CAPACITIES = {
  'front-delt': 80, 'mid-delt': 40, chest: 90, biceps: 20, triceps: 70, serratus: 10, 'lower-traps': 8,
  lats: 100, 'rear-delt': 40, 'mid-traps': 50, rhomboids: 50, 'teres-major': 70, brachioradialis: 35,
};
function trueE1RM(pattern, angle) {
  const w = emgForAngle(pattern, angle);
  return Object.entries(w).reduce((sum, [m, pct]) => sum + (pct / 100) * (GROUND_TRUTH_CAPACITIES[m] || 0), 0);
}
// Non-machine (barbell/dumbbell/cable) exercises spanning a wide angle
// range on both patterns -- used as "clean" reference data so machine-tagged
// observations layered on top don't dominate the regression and mask their
// own miscalibration (see the ALS tests below).
const REFERENCE_EXERCISES = [
  ['Arnold Press (Dumbbell)', 'press', 15],
  ['Overhead Press (Barbell)', 'press', 15],
  ['Seated Overhead Press (Barbell)', 'press', 15],
  ['Shoulder Press (Dumbbell)', 'press', 30],
  ['Standing Military Press (Barbell)', 'press', 0],
  ['Bent Over Row (Barbell)', 'row', 15],
  ['Chest Supported Incline Row (Dumbbell)', 'row', 120],
  ['Chest-Supported Barbell Row', 'row', 105],
  ['Dumbbell Row', 'row', 90],
  ['Pendlay Row (Barbell)', 'row', 105],
  ['T Bar Row', 'row', 75],
  ['Rear Delt Row', 'row', 90],
  ['Seated Cable Row - Bar Grip', 'row', 105],
];
function referenceLifts() {
  return REFERENCE_EXERCISES.map(([name, pattern, angle]) => ({
    date: '2026-01-01', exercise: name, kg: trueE1RM(pattern, angle), reps: 1,
  }));
}
// Real machine-equipment exercises (exerciseDb.js equipment: 'machine') that
// have an angle mapping -- the only pool ALS can ever calibrate a factor
// against, since barbell/dumbbell/cable exercises never get tagged.
const MACHINE_EXERCISES = [
  ['machine shoulder press', 'press', 30],
  ['seated shoulder press (machine)', 'press', 45],
  ['shoulder press (machine plates)', 'press', 30],
  ['shoulder press incline (machine plates)', 'press', 45],
  ['seated shoulder press (machine) (tf)', 'press', 45],
  ['shoulder press (hard machine)', 'press', 45],
  ['iso-lateral row (machine)', 'row', 90],
  ['seated iso-lateral row', 'row', 105],
  ['seated row (machine)', 'row', 90],
  ['seated upper back iso-row cable machine (nu)', 'row', 90],
];
// `ratio` < 1 simulates a machine that systematically under-reads relative
// to true output (e.g. a favorable cam/pulley ratio) -- ALS should solve a
// load factor > 1 to compensate, scaling the machine's logged numbers up
// before they inform muscle capacities.
function machineLifts(n, brand, model, ratio) {
  return MACHINE_EXERCISES.slice(0, n).map(([name, pattern, angle]) => ({
    date: '2026-02-01', exercise: name, kg: trueE1RM(pattern, angle) * ratio, reps: 1, machine: brand, model,
  }));
}

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

test('solveMuscleCapacities returns null with fewer than MIN_OBSERVATIONS exercises', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
  ];
  assert.ok(buildObservations(lifts).length < MIN_OBSERVATIONS);
  assert.equal(solveMuscleCapacities(buildObservations(lifts)), null);
});

// Synthetic ground-truth check: generate exact e1RM values FROM known
// per-muscle capacities (no noise), across several different row angles,
// then confirm the regression recovers a held-out angle's prediction in the
// right ballpark. Ridge regularization deliberately biases small/sparse
// systems toward the mean, so this checks direction and rough magnitude,
// not exact equality.
test('solveMuscleCapacities + predictExerciseE1RM recovers a sane prediction for a held-out angle from synthetic ground truth', () => {
  const trueCapacities = { lats: 100, biceps: 60, 'rear-delt': 40, 'mid-delt': 45, 'mid-traps': 50, rhomboids: 50, 'teres-major': 70, brachioradialis: 35 };
  const generateE1RM = (pattern, angle) => {
    const w = emgForAngle(pattern, angle);
    return Object.entries(w).reduce((sum, [m, pct]) => sum + (pct / 100) * trueCapacities[m], 0);
  };
  // Use 6 distinct logged (angle-mapped) row exercises spanning a wide
  // angle range, holding out angle 90 (iso-lateral row / seated row's
  // mapped angle) as the prediction target.
  const trainingExercises = [
    ['Bent Over Row (Barbell)', 'row', 105],
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
  // Ridge-regularized estimate on sparse data won't be exact, but should be
  // the same order of magnitude and clearly better than 0 or wildly off.
  assert.ok(prediction.e1rm > trueHeldOut * 0.3 && prediction.e1rm < trueHeldOut * 1.8,
    `prediction ${prediction.e1rm} should be roughly in range of true value ${trueHeldOut}`);
});

test('predictExerciseE1RM flags confidence "partial" when a significant contributing muscle has no regression data', () => {
  // Only ever logged press-family exercises -- predicting a ROW angle means
  // every row-specific muscle (lats, rhomboids, etc.) has zero coverage.
  const lifts = [
    { date: '2026-01-01', exercise: 'Overhead Press (Barbell)', kg: 60, reps: 5 },
    { date: '2026-01-02', exercise: 'Arnold Press (Dumbbell)', kg: 50, reps: 5 },
    { date: '2026-01-03', exercise: 'Standing Military Press (Barbell)', kg: 55, reps: 5 },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  const prediction = predictExerciseE1RM('row', 90, result);
  assert.ok(prediction == null || prediction.confidence === 'partial');
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

test('predictExerciseE1RM uses weightsOverride instead of emgForAngle when provided (grip rotation/width applied at log time)', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
    { date: '2026-01-03', exercise: 'Chest-Supported Barbell Row', kg: 70, reps: 8 },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  const plain = predictExerciseE1RM('row', 90, result);
  const override = { ...emgForAngle('row', 90), lats: emgForAngle('row', 90).lats + 20 };
  const modified = predictExerciseE1RM('row', 90, result, override);
  assert.ok(plain != null && modified != null);
  assert.notEqual(modified.e1rm, plain.e1rm, 'a heavier lats weight in the override should change the predicted e1RM');
  assert.deepEqual(modified.breakdown.find(b => b.muscle === 'lats').pct, override.lats);
});

test('predictExerciseE1RM falls back to emgForAngle(pattern, angle) when weightsOverride is omitted (backward compatible)', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
    { date: '2026-01-03', exercise: 'Chest-Supported Barbell Row', kg: 70, reps: 8 },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  const withUndefined = predictExerciseE1RM('row', 90, result, undefined);
  const withNothing = predictExerciseE1RM('row', 90, result);
  assert.deepEqual(withUndefined, withNothing);
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

// --- Mean-prior shrinkage (replaces the old Math.max(0, solved[i]) floor) ---

test('solveMuscleCapacities shrinks a mildly-negative-solving muscle toward the athlete\'s own prior mean instead of flooring it at exactly 0', () => {
  // A and B are each backed by two consistent, well-supported observations
  // (clearly positive, coverage >= 2) so they anchor a real prior mean
  // around ~55. The last observation drags in a third muscle, C, at only
  // 1% weight against a heavily-undershot e1RM -- enough to make C's raw
  // ridge solve mildly negative (verified independently: raw ridge=4 solve
  // for this exact data is [30.1, 29.3, -0.07], i.e. the OLD code would
  // clamp C to exactly 0). The fix should instead shrink C toward the A/B
  // prior mean, landing well above 0.
  const obs = [
    { weights: { A: 100, B: 0, C: 0 }, e1rm: 100 },
    { weights: { A: 100, B: 0, C: 0 }, e1rm: 95 },
    { weights: { A: 0, B: 100, C: 0 }, e1rm: 90 },
    { weights: { A: 0, B: 100, C: 0 }, e1rm: 100 },
    { weights: { A: 50, B: 50, C: 1 }, e1rm: 1 },
  ];
  const result = solveMuscleCapacities(obs);
  assert.ok(result != null);
  assert.notEqual(result.capacities.C, 0, 'a mildly-negative-solving muscle should not floor at exactly 0 anymore');
  assert.ok(result.capacities.C > 10, `expected C to be shrunk toward the A/B prior mean (~55), got ${result.capacities.C}`);
  // A and B themselves (well-supported, clearly positive) should be barely
  // disturbed by the fix -- they're the prior source, not its target.
  assert.ok(result.capacities.A > 0 && result.capacities.B > 0);
});

test('solveMuscleCapacities never returns a negative capacity even under the mean-prior shrinkage', () => {
  const obs = [
    { weights: { A: 100, B: 0, C: 0 }, e1rm: 100 },
    { weights: { A: 100, B: 0, C: 0 }, e1rm: 95 },
    { weights: { A: 0, B: 100, C: 0 }, e1rm: 90 },
    { weights: { A: 0, B: 100, C: 0 }, e1rm: 100 },
    { weights: { A: 50, B: 50, C: 1 }, e1rm: 1 },
  ];
  const result = solveMuscleCapacities(obs);
  for (const v of Object.values(result.capacities)) assert.ok(v >= 0, 'capacities are a physical latent kg value and must never be negative');
});

// --- Adaptive ridge (RIDGE_CANDIDATES + leave-one-out CV) ---

test('solveMuscleCapacities picks a different ridge for a well-determined, low-noise data shape than for a sparse, noisy one', () => {
  // Clean, noise-free ground truth across 6 well-spread angles (same shape
  // as the existing ground-truth recovery test) -- CV should favor minimal
  // regularization since the system already fits well.
  const cleanLifts = [
    ['Bent Over Row (Barbell)', 'row', 15],
    ['High Lat Row', 'row', 15],
    ['T Bar Row', 'row', 75],
    ['Chest-Supported Barbell Row', 'row', 105],
    ['Chest Supported Incline Row (Dumbbell)', 'row', 120],
    ['Pendlay Row (Barbell)', 'row', 105],
  ].map(([name, pattern, angle]) => ({ date: '2026-01-01', exercise: name, kg: trueE1RM(pattern, angle), reps: 1 }));
  const cleanResult = solveMuscleCapacities(buildObservations(cleanLifts));
  assert.ok(cleanResult != null);

  // Same angle range, but e1RM values alternate sharply (150/30/150/30...)
  // in a way that contradicts the EMG model's smooth trend across angle --
  // simulates a noisy/inconsistent real account. CV should favor more
  // regularization here since low-ridge overfits the inconsistency.
  const noisyAngles = [[0, 'press'], [15, 'press'], [30, 'press'], [45, 'press'], [75, 'row'], [90, 'row']];
  const noisyE1RMs = [152.3, 31.7, 148.9, 29.4, 151.2, 30.8];
  const noisyObs = noisyAngles.map(([angle, pattern], i) => ({ weights: emgForAngle(pattern, angle), e1rm: noisyE1RMs[i] }));
  const noisyResult = solveMuscleCapacities(noisyObs);
  assert.ok(noisyResult != null);

  assert.notEqual(cleanResult.ridge, noisyResult.ridge,
    `expected different data shapes to pick different ridge values, got ${cleanResult.ridge} for both`);
});

test('solveMuscleCapacities falls back to DEFAULT_RIDGE without running CV at exactly MIN_OBSERVATIONS (too few to leave one out meaningfully)', () => {
  const { DEFAULT_RIDGE } = require('../functions/muscleCapacity');
  const lifts = [
    { date: '2026-01-01', exercise: 'Bent Over Row (Barbell)', kg: 80, reps: 8 },
    { date: '2026-01-02', exercise: 'T Bar Row', kg: 80, reps: 8 },
    { date: '2026-01-03', exercise: 'Chest-Supported Barbell Row', kg: 70, reps: 8 },
  ];
  const obs = buildObservations(lifts);
  assert.equal(obs.length, MIN_OBSERVATIONS);
  const result = solveMuscleCapacities(obs);
  assert.equal(result.ridge, DEFAULT_RIDGE);
});

// --- Equipment (brand+model) ALS calibration ---

test('solveMuscleCapacities is a no-op for equipment calibration when no lift carries machine/model data', () => {
  const lifts = referenceLifts();
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.ok(result != null);
  assert.deepEqual(result.equipmentFactors, {}, 'accounts with no machine data should never produce equipment factors');
});

test('a machine below EQUIPMENT_MIN_OBSERVATIONS never gets its own load factor (hard gate)', () => {
  const lifts = [...referenceLifts(), ...machineLifts(EQUIPMENT_MIN_OBSERVATIONS - 1, 'TestBrand', 'BelowGate', 0.7)];
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.deepEqual(result.equipmentFactors, {}, 'a machine with fewer than EQUIPMENT_MIN_OBSERVATIONS observations should be left uncalibrated');
});

test('ALS solves a sensible, correctly-directed load factor for a machine with enough observations, and converges (no NaN/Infinity/wild divergence)', () => {
  // This machine's logged weight systematically under-reads true output by
  // 30% (ratio 0.7) -- ALS should solve a factor > 1 to compensate when
  // correcting its observations before they inform muscle capacities.
  const lifts = [...referenceLifts(), ...machineLifts(10, 'TestBrand', 'ModelBigN', 0.7)];
  const result = solveMuscleCapacities(buildObservations(lifts));
  const factor = result.equipmentFactors['TestBrand::ModelBigN'];
  assert.ok(Number.isFinite(factor), `expected a finite converged factor, got ${factor}`);
  assert.ok(factor > 1.05, `expected a meaningfully-above-1.0 factor correcting for the 30% under-read, got ${factor}`);
  assert.ok(factor < 1.43 * 1.2, `factor ${factor} should stay in a sane range, not wildly overshoot the true 1/0.7 ratio`);
});

test('the virtual-sample-size prior fades: a machine with only EQUIPMENT_MIN_OBSERVATIONS observations is shrunk closer to 1.0 than an otherwise-identical machine with many more', () => {
  const lowNLifts = machineLifts(EQUIPMENT_MIN_OBSERVATIONS, 'TestBrand', 'ModelSmallN', 0.7);
  const highNLifts = machineLifts(10, 'TestBrand', 'ModelBigN', 0.7);

  const lowResult = solveMuscleCapacities(buildObservations([...referenceLifts(), ...lowNLifts]));
  const highResult = solveMuscleCapacities(buildObservations([...referenceLifts(), ...highNLifts]));

  const lowFactor = lowResult.equipmentFactors['TestBrand::ModelSmallN'];
  const highFactor = highResult.equipmentFactors['TestBrand::ModelBigN'];
  assert.ok(Number.isFinite(lowFactor) && Number.isFinite(highFactor));
  assert.ok(Math.abs(lowFactor - 1.0) < Math.abs(highFactor - 1.0),
    `expected the low-observation machine's factor (${lowFactor}) to sit closer to 1.0 than the high-observation machine's (${highFactor})`);
});

test('a non-machine exercise (barbell/dumbbell/cable) never gets tagged into equipment calibration even when brand/model fields are present on the lift', () => {
  // Cable stations also carry a `machine` (brand) tag in this app's real
  // schema (see WorkoutLogger's needsBrand = equipment==='cable'||'machine'),
  // but only actual `equipment: 'machine'` exercises are eligible for a
  // load factor -- cable/barbell/dumbbell are confirmed to generalize
  // across manufacturers per the design brief.
  const lifts = [
    ...referenceLifts(),
    { date: '2026-02-01', exercise: 'Seated Cable Row - Bar Grip', kg: trueE1RM('row', 105) * 0.7, reps: 1, machine: 'SomeCableBrand', model: 'X' },
    { date: '2026-02-02', exercise: 'Rear Delt Row', kg: trueE1RM('row', 90) * 0.7, reps: 1, machine: 'SomeCableBrand', model: 'X' },
    { date: '2026-02-03', exercise: 'Seated Cable Row - V Grip (Cable)', kg: trueE1RM('row', 105) * 0.7, reps: 1, machine: 'SomeCableBrand', model: 'X' },
  ];
  const result = solveMuscleCapacities(buildObservations(lifts));
  assert.deepEqual(result.equipmentFactors, {}, 'cable equipment must never receive a load factor, regardless of brand/model tagging');
});
