const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpolateStandards, thresholdsForMuscle, MUSCLE_EXERCISE_MAP, MUSCLE_STANDARDS } = require('../functions/muscleStandards');

test('interpolateStandards linearly interpolates between the two nearest rows', () => {
  const table = [[50, 10, 20, 30, 40, 50], [60, 20, 30, 40, 50, 60]];
  assert.deepEqual(interpolateStandards(table, 55), [15, 25, 35, 45, 55]);
});

test('interpolateStandards returns the exact row when bodyweight matches one exactly', () => {
  const table = [[50, 10, 20, 30, 40, 50], [60, 20, 30, 40, 50, 60]];
  assert.deepEqual(interpolateStandards(table, 60), [20, 30, 40, 50, 60]);
});

test('interpolateStandards clamps to the boundary row outside the table range', () => {
  const table = [[50, 10, 20, 30, 40, 50], [60, 20, 30, 40, 50, 60]];
  assert.deepEqual(interpolateStandards(table, 20), [10, 20, 30, 40, 50], 'below range clamps to first row');
  assert.deepEqual(interpolateStandards(table, 200), [20, 30, 40, 50, 60], 'above range clamps to last row');
});

test('interpolateStandards returns null for missing table or bodyweight', () => {
  assert.equal(interpolateStandards(null, 70), null);
  assert.equal(interpolateStandards([], 70), null);
  assert.equal(interpolateStandards([[50, 1, 2, 3, 4, 5]], 0), null);
});

test('thresholdsForMuscle returns null for a muscle with no mapped exercise', () => {
  assert.equal(thresholdsForMuscle('tibialis', 'male', 80), null);
  assert.equal(thresholdsForMuscle('hip-flexors', 'male', 80), null);
});

test('thresholdsForMuscle returns interpolated real thresholds for a mapped muscle', () => {
  const found = thresholdsForMuscle('biceps', 'male', 80);
  assert.equal(found.exerciseName, 'Barbell Curl');
  assert.equal(found.thresholds.length, 5);
  assert.ok(found.thresholds[0] < found.thresholds[4], 'Beginner threshold should be below Elite');
});

test('every MUSCLE_EXERCISE_MAP entry has a corresponding MUSCLE_STANDARDS table for both sexes', () => {
  for (const [muscle, exerciseName] of Object.entries(MUSCLE_EXERCISE_MAP)) {
    const table = MUSCLE_STANDARDS[exerciseName];
    assert.ok(table, `${muscle} -> ${exerciseName} has no MUSCLE_STANDARDS entry at all`);
    assert.ok(table.male?.length, `${muscle} -> ${exerciseName} missing male table`);
    assert.ok(table.female?.length, `${muscle} -> ${exerciseName} missing female table`);
  }
});
