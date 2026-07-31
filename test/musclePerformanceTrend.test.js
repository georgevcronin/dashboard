const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeMusclePerformanceTrends } = require('../functions/musclePerformanceTrend');
const { computePerformanceTrend } = require('../functions/fatigue');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('computeMusclePerformanceTrends returns nothing for a muscle with fewer than 4 distinct session dates', () => {
  const lifts = [
    { date: daysAgo(3), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
  ];
  const out = computeMusclePerformanceTrends(lifts);
  assert.equal(out.chest, undefined, 'only 2 distinct dates — below the 4-date floor, so no trend, not a false 0');
});

test('computeMusclePerformanceTrends is positive (declining) for a muscle whose e1RM dropped session-to-session', () => {
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 80, reps: 5 },
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 80, reps: 5 },
  ];
  const out = computeMusclePerformanceTrends(lifts);
  assert.ok(out.chest > 0, 'weight dropped 100kg -> 80kg, chest should read as declining');
});

test('computeMusclePerformanceTrends averages decrements across multiple exercises that share a primary muscle', () => {
  // Barbell Bench Press and Dumbbell Incline Bench Press both primary-target
  // chest. Bench declines hard, Incline Press holds steady -> chest's
  // combined trend should sit between "fully declining" and "flat", not
  // equal either alone.
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 50, reps: 5 },
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 50, reps: 5 },
    { date: daysAgo(20), exercise: 'Dumbbell Incline Bench Press', kg: 30, reps: 8 },
    { date: daysAgo(19), exercise: 'Dumbbell Incline Bench Press', kg: 30, reps: 8 },
    { date: daysAgo(2), exercise: 'Dumbbell Incline Bench Press', kg: 30, reps: 8 },
    { date: daysAgo(1), exercise: 'Dumbbell Incline Bench Press', kg: 30, reps: 8 },
  ];
  const out = computeMusclePerformanceTrends(lifts);
  assert.ok(out.chest > 0 && out.chest < 0.5, `expected a blended, partial decline, got ${out.chest}`);
});

test('computeMusclePerformanceTrends only credits a muscle via its DB primary array, not secondary', () => {
  // Barbell Bench Press: primary chest/triceps/front-delt, secondary serratus/core.
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 80, reps: 5 },
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 80, reps: 5 },
  ];
  const out = computeMusclePerformanceTrends(lifts);
  assert.ok('chest' in out);
  assert.ok(!('serratus' in out), 'serratus is only ever secondary on Barbell Bench Press, should not get a trend entry from it');
});

test('computeMusclePerformanceTrends ignores exercise names that only resolve via the keyword fallback (no primary array to group by)', () => {
  const lifts = [
    { date: daysAgo(20), exercise: 'squat', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'squat', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'squat', kg: 80, reps: 5 },
    { date: daysAgo(1), exercise: 'squat', kg: 80, reps: 5 },
  ];
  const out = computeMusclePerformanceTrends(lifts);
  assert.deepEqual(out, {}, 'a name outside EXERCISE_DB has no primary array to group by, so it should contribute nothing');
});

test('computeMusclePerformanceTrends and computePerformanceTrend agree on a single-exercise, single-muscle-family case', () => {
  // Barbell Curl: primary biceps/brachialis/brachioradialis, all credited the same
  // decrement -- so the per-muscle trend for biceps should equal the whole-body
  // trend computePerformanceTrend produces when it's the only logged exercise.
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Curl', kg: 40, reps: 8 },
    { date: daysAgo(19), exercise: 'Barbell Curl', kg: 40, reps: 8 },
    { date: daysAgo(2), exercise: 'Barbell Curl', kg: 30, reps: 8 },
    { date: daysAgo(1), exercise: 'Barbell Curl', kg: 30, reps: 8 },
  ];
  const whole = computePerformanceTrend(lifts);
  const perMuscle = computeMusclePerformanceTrends(lifts);
  assert.ok(Math.abs(perMuscle.biceps - whole) < 1e-9);
});
