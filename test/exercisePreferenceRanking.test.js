const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RATING, K_EXPLICIT, K_IMPLICIT,
  eloUpdate, applyComparison, recencyWeightedFrequency, rawFrequency,
  exerciseE1rmTrend, resolveImplicitWinner, detectComparisonCandidates, rankExercises,
} = require('../functions/exercisePreferenceRanking');

test('eloUpdate: equal ratings split the K-factor evenly', () => {
  const { winner, loser } = eloUpdate(1500, 1500, K_EXPLICIT);
  assert.equal(winner, 1500 + K_EXPLICIT / 2);
  assert.equal(loser, 1500 - K_EXPLICIT / 2);
});

test('eloUpdate: beating a much higher-rated exercise gains close to the full K-factor', () => {
  const { winner, loser } = eloUpdate(1200, 1800, K_EXPLICIT);
  assert.ok(winner - 1200 > K_EXPLICIT * 0.9);
  assert.equal(winner - 1200, 1800 - loser); // zero-sum
});

test('eloUpdate: beating a much lower-rated exercise gains almost nothing', () => {
  const { winner } = eloUpdate(1800, 1200, K_EXPLICIT);
  assert.ok(winner - 1800 < K_EXPLICIT * 0.1);
});

test('applyComparison: unrated exercises default to DEFAULT_RATING, never mutates the input map', () => {
  const ratings = {};
  const next = applyComparison(ratings, 'Bench Press', 'Overhead Press');
  assert.deepEqual(ratings, {}); // untouched
  assert.equal(next['Bench Press'].rating, DEFAULT_RATING + K_EXPLICIT / 2);
  assert.equal(next['Overhead Press'].rating, DEFAULT_RATING - K_EXPLICIT / 2);
  assert.equal(next['Bench Press'].comparisons, 1);
});

test('applyComparison: an implicit comparison moves ratings by less than an explicit one', () => {
  const explicit = applyComparison({}, 'A', 'B', { implicit: false });
  const implicit = applyComparison({}, 'A', 'B', { implicit: true });
  assert.ok(implicit['A'].rating - DEFAULT_RATING < explicit['A'].rating - DEFAULT_RATING);
});

test('recencyWeightedFrequency: a set logged exactly one half-life ago counts half as much as today', () => {
  const now = new Date('2026-08-05').getTime();
  const todayScore = recencyWeightedFrequency([{ exercise: 'Squat', date: '2026-08-05' }], 'Squat', now);
  const monthAgoScore = recencyWeightedFrequency([{ exercise: 'Squat', date: '2026-07-06' }], 'Squat', now); // 30 days
  assert.ok(Math.abs(monthAgoScore - todayScore / 2) < 0.01);
});

test('recencyWeightedFrequency: counts distinct days, not sets — a 5-set day is not 5x a 1-set day', () => {
  const now = new Date('2026-08-05').getTime();
  const fiveSets = Array.from({ length: 5 }, () => ({ exercise: 'Squat', date: '2026-08-05' }));
  assert.equal(recencyWeightedFrequency(fiveSets, 'Squat', now), recencyWeightedFrequency([fiveSets[0]], 'Squat', now));
});

test('rawFrequency: counts distinct logged days for the named exercise only', () => {
  const lifts = [
    { exercise: 'Squat', date: '2026-08-01' }, { exercise: 'Squat', date: '2026-08-01' },
    { exercise: 'Squat', date: '2026-08-03' }, { exercise: 'Deadlift', date: '2026-08-02' },
  ];
  assert.equal(rawFrequency(lifts, 'Squat'), 2);
  assert.equal(rawFrequency(lifts, 'Deadlift'), 1);
  assert.equal(rawFrequency(lifts, 'Bench Press'), 0);
});

test('exerciseE1rmTrend: null with fewer than 4 distinct logged days (matches strengthStandards.js\'s own trust threshold)', () => {
  const lifts = [
    { exercise: 'Squat', date: '2026-07-01', kg: 100, reps: 5 },
    { exercise: 'Squat', date: '2026-07-08', kg: 105, reps: 5 },
  ];
  assert.equal(exerciseE1rmTrend(lifts, 'Squat'), null);
});

test('exerciseE1rmTrend: a real climbing trend over enough sessions/days returns a positive slope', () => {
  const lifts = [
    { exercise: 'Squat', date: '2026-06-01', kg: 100, reps: 5 },
    { exercise: 'Squat', date: '2026-06-08', kg: 102.5, reps: 5 },
    { exercise: 'Squat', date: '2026-06-15', kg: 105, reps: 5 },
    { exercise: 'Squat', date: '2026-06-22', kg: 107.5, reps: 5 },
    { exercise: 'Squat', date: '2026-06-29', kg: 110, reps: 5 },
  ];
  const trend = exerciseE1rmTrend(lifts, 'Squat');
  assert.ok(trend > 0);
});

test('resolveImplicitWinner: more recently/frequently trained exercise wins on frequency alone', () => {
  const now = new Date('2026-08-05').getTime();
  const lifts = [
    { exercise: 'Leg Press', date: '2026-08-04', kg: 200, reps: 8 },
    { exercise: 'Leg Press', date: '2026-08-01', kg: 200, reps: 8 },
    { exercise: 'Hack Squat', date: '2026-05-01', kg: 150, reps: 8 },
  ];
  assert.equal(resolveImplicitWinner(lifts, 'Leg Press', 'Hack Squat', now), 'Leg Press');
});

test('resolveImplicitWinner: an exercise never logged at all always loses to one that has been', () => {
  const now = new Date('2026-08-05').getTime();
  const lifts = [{ exercise: 'Leg Press', date: '2026-08-01', kg: 200, reps: 8 }];
  assert.equal(resolveImplicitWinner(lifts, 'Leg Press', 'Never Logged', now), 'Leg Press');
});

test('resolveImplicitWinner: no signal either way (both completely unlogged) returns null, not a coin flip', () => {
  const now = new Date('2026-08-05').getTime();
  assert.equal(resolveImplicitWinner([], 'A', 'B', now), null);
});

test('resolveImplicitWinner: a 1-1 split (frequency favors A, trend favors B) returns null', () => {
  const now = new Date('2026-08-05').getTime();
  const lifts = [
    // A: frequent lately, flat weight (no trend) — 5 sessions, same weight throughout
    { exercise: 'A', date: '2026-08-01', kg: 100, reps: 5 }, { exercise: 'A', date: '2026-07-25', kg: 100, reps: 5 },
    { exercise: 'A', date: '2026-07-18', kg: 100, reps: 5 }, { exercise: 'A', date: '2026-07-11', kg: 100, reps: 5 },
    // B: trained only once recently, but that's the same single data point — no trend either,
    // so give B a real climbing trend across an older, less-recent block instead.
    { exercise: 'B', date: '2026-01-01', kg: 100, reps: 5 }, { exercise: 'B', date: '2026-01-08', kg: 105, reps: 5 },
    { exercise: 'B', date: '2026-01-15', kg: 110, reps: 5 }, { exercise: 'B', date: '2026-01-22', kg: 115, reps: 5 },
  ];
  // A wins frequency (recent, half-life-weighted), B wins trend (real climbing slope vs A's flat/no-trend) — 1-1 tie.
  assert.equal(resolveImplicitWinner(lifts, 'A', 'B', new Date('2026-08-05').getTime()), null);
});

test('detectComparisonCandidates: pairs a new exercise with a different prior exercise sharing a primary muscle', () => {
  const newLiftEntries = [{ exercise: 'Leg Extension', date: '2026-08-05', kg: 60, reps: 12 }];
  const priorLifts = [{ exercise: 'Front Squat', date: '2026-08-01', kg: 80, reps: 6 }];
  const candidates = detectComparisonCandidates(newLiftEntries, priorLifts);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].a, 'Leg Extension');
  assert.equal(candidates[0].b, 'Front Squat');
  assert.equal(candidates[0].muscle, 'quads');
});

test('detectComparisonCandidates: a real multi-primary-muscle exercise gets one candidate per shared muscle', () => {
  // Barbell Bench Press and Incline Barbell Bench Press genuinely share all
  // three of their primary muscles (chest, triceps, front-delt) — that's
  // three real candidates, not a bug; "one per overlapping muscle" means
  // exactly that, not "one per exercise pair" (see the next test for the
  // actual collapse case: two DIFFERENT new exercises landing on the same
  // muscle only produce one candidate for that muscle).
  const newLiftEntries = [{ exercise: 'Barbell Bench Press', date: '2026-08-05', kg: 100, reps: 5 }];
  const priorLifts = [{ exercise: 'Incline Barbell Bench Press', date: '2026-08-01', kg: 60, reps: 8 }];
  const candidates = detectComparisonCandidates(newLiftEntries, priorLifts);
  assert.deepEqual(candidates.map(c => c.muscle).sort(), ['chest', 'front-delt', 'triceps']);
});

test('detectComparisonCandidates: one candidate per overlapping muscle, not one per exercise pair', () => {
  // Both new exercises are single-primary quads exercises; both would
  // independently pair with the one prior quads exercise — must collapse to
  // a single "quads" candidate, not fire once per new exercise.
  const newLiftEntries = [
    { exercise: 'Leg Extension', date: '2026-08-05', kg: 60, reps: 12 },
    { exercise: 'Sissy Squat', date: '2026-08-05', kg: 0, reps: 10 },
  ];
  const priorLifts = [{ exercise: 'Front Squat', date: '2026-08-01', kg: 80, reps: 6 }];
  const candidates = detectComparisonCandidates(newLiftEntries, priorLifts);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].muscle, 'quads');
});

test('detectComparisonCandidates: picks the most recently-logged prior exercise when more than one shares the muscle', () => {
  const newLiftEntries = [{ exercise: 'Barbell Bench Press', date: '2026-08-05', kg: 100, reps: 5 }];
  const priorLifts = [
    { exercise: 'Incline Barbell Bench Press', date: '2026-07-01', kg: 60, reps: 8 },
    { exercise: 'Close-Grip Bench Press', date: '2026-08-01', kg: 80, reps: 6 }, // more recent
  ];
  const candidates = detectComparisonCandidates(newLiftEntries, priorLifts);
  assert.equal(candidates[0].b, 'Close-Grip Bench Press');
});

test('detectComparisonCandidates: no candidate when there is no prior history at all', () => {
  const newLiftEntries = [{ exercise: 'Barbell Bench Press', date: '2026-08-05', kg: 100, reps: 5 }];
  assert.deepEqual(detectComparisonCandidates(newLiftEntries, []), []);
});

test('detectComparisonCandidates: no candidate when a muscle is only ever trained by the same exercise (self-pairing excluded)', () => {
  const newLiftEntries = [{ exercise: 'Barbell Bench Press', date: '2026-08-05', kg: 100, reps: 5 }];
  const priorLifts = [{ exercise: 'Barbell Bench Press', date: '2026-08-01', kg: 95, reps: 5 }];
  assert.deepEqual(detectComparisonCandidates(newLiftEntries, priorLifts), []);
});

test('rankExercises: sorts highest rating first and carries comparison counts through', () => {
  const ratings = { A: { rating: 1500, comparisons: 2 }, B: { rating: 1600, comparisons: 1 }, C: { rating: 1400, comparisons: 0 } };
  assert.deepEqual(rankExercises(ratings).map(r => r.name), ['B', 'A', 'C']);
});
