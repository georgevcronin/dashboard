const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildObservations, solveMuscleCapacities, predictExerciseE1RM, suggestedWeightForReps, MIN_OBSERVATIONS,
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
  // angle range, holding out angle 90 (iso-lateral row / dumbbell row /
  // seated row's mapped angle) as the prediction target.
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
