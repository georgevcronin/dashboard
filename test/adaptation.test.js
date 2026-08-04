const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  rirEffectiveness, volumeResponsePct, sessionStimulusScore, adaptationCurve, ADAPTATION_PEAK_H,
  computeStimulusContributions, computeAdaptationLevel, computeAdaptationSeries,
  estimateAtrophyRate, DEFAULT_ATROPHY_RATE, SECONDARY_MUSCLE_WEIGHT, secondaryMuscleRatio,
} = require('../functions/adaptation');
const { findExercise } = require('../functions/muscleTaxonomy');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('rirEffectiveness is highest near failure (RIR 0) and lower at RIR 10', () => {
  assert.ok(rirEffectiveness(0) > rirEffectiveness(10));
});

test('rirEffectiveness dips around RIR 5-6 relative to RIR 0', () => {
  assert.ok(rirEffectiveness(5) < rirEffectiveness(0));
});

test('volumeResponsePct rises with more sets then plateaus rather than climbing forever', () => {
  assert.ok(volumeResponsePct(1) < volumeResponsePct(4));
  assert.ok(volumeResponsePct(4) < volumeResponsePct(9));
  const at9 = volumeResponsePct(9), at20 = volumeResponsePct(20);
  assert.ok(Math.abs(at20 - at9) < at9, 'far past 9 sets should not keep climbing at the same rate');
});

test('sessionStimulusScore is bounded roughly 0-1', () => {
  const score = sessionStimulusScore(4, 1);
  assert.ok(score > 0 && score <= 1);
});

test('adaptationCurve is zero at or before the stimulus itself', () => {
  assert.equal(adaptationCurve(0, 1), 0);
  assert.equal(adaptationCurve(-5, 1), 0);
});

test('adaptationCurve peaks at ADAPTATION_PEAK_H and equals the input stimulus score there', () => {
  const score = 0.7;
  const atPeak = adaptationCurve(ADAPTATION_PEAK_H, score);
  const at10 = adaptationCurve(10, score);
  const at100 = adaptationCurve(100, score);
  assert.ok(ADAPTATION_PEAK_H > 40 && ADAPTATION_PEAK_H < 48, 'the fast + slow phases combined should peak a bit before the slow phase\'s own 48h peak');
  assert.ok(Math.abs(atPeak - score) < 1e-9, 'peak value should equal the stimulus score exactly at the true peak, by construction (normalized)');
  assert.ok(atPeak > at10, 'should still be rising well before the peak');
  assert.ok(atPeak > at100, 'should be decaying well after the peak');
  assert.ok(adaptationCurve(ADAPTATION_PEAK_H + 0.5, score) < atPeak, 'a point just after the peak should be lower');
  assert.ok(adaptationCurve(ADAPTATION_PEAK_H - 0.5, score) < atPeak, 'a point just before the peak should be lower');
});

test('computeStimulusContributions credits a secondary muscle by its real EMG ratio when curated data exists, not a flat weight', () => {
  // T-Bar Row: lats/rhomboids/mid-traps primary, biceps secondary — and
  // exerciseEmgProfiles.js curates this one, so biceps should get its real
  // (much higher than 0.5) relative share, not the flat fallback.
  const lifts = [
    { date: daysAgo(1), exercise: 'T-Bar Row', kg: 60, reps: 8, rpe: 9 },
  ];
  const contributions = computeStimulusContributions(lifts);
  const entry = findExercise('T-Bar Row');
  const expectedRatio = secondaryMuscleRatio(entry, 'biceps');
  assert.ok(contributions.lats?.length, 'primary muscle should have a contribution');
  assert.ok(contributions.biceps?.length, 'secondary muscle should have a contribution');
  assert.notEqual(expectedRatio, SECONDARY_MUSCLE_WEIGHT, 'T-Bar Row has a curated EMG profile, so the ratio should differ from the flat fallback');
  assert.ok(
    Math.abs(contributions.biceps[0].contrib - contributions.lats[0].contrib * expectedRatio) < 1e-9,
    'secondary contribution should be exactly the EMG-derived ratio of the primary contribution from the same session'
  );
});

test('computeStimulusContributions falls back to SECONDARY_MUSCLE_WEIGHT when the exercise has no curated EMG profile', () => {
  // Machine Shoulder Press: front-delt/mid-delt primary, triceps secondary,
  // no exerciseEmgProfiles.js entry.
  const lifts = [
    { date: daysAgo(1), exercise: 'Machine Shoulder Press', kg: 40, reps: 8, rpe: 9 },
  ];
  const contributions = computeStimulusContributions(lifts);
  assert.ok(contributions['front-delt']?.length, 'primary muscle should have a contribution');
  assert.ok(contributions.triceps?.length, 'secondary muscle should have a contribution');
  assert.ok(
    Math.abs(contributions.triceps[0].contrib - contributions['front-delt'][0].contrib * SECONDARY_MUSCLE_WEIGHT) < 1e-9,
    'without curated EMG data, secondary contribution should still be exactly SECONDARY_MUSCLE_WEIGHT of the primary'
  );
});

test('computeStimulusContributions ignores lifts far outside the negligible-contribution window', () => {
  const lifts = [{ date: daysAgo(60), exercise: 'Barbell Bench Press', kg: 80, reps: 5 }];
  const contributions = computeStimulusContributions(lifts);
  assert.deepEqual(contributions, {}, 'a lift 60 days old should not contribute — gamma is negligible by then');
});

test('computeAdaptationLevel sums multiple overlapping sessions rather than taking just one', () => {
  // Distinct calendar days -- lift dates are day-granularity throughout this
  // app, so two sessions on the same day merge into one session-instance
  // (correct: that's genuinely one contribution, not two).
  const lifts = [
    { date: daysAgo(3), exercise: 'Barbell Bench Press', kg: 80, reps: 5, rpe: 9 },
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 80, reps: 5, rpe: 9 },
  ];
  const contributions = computeStimulusContributions(lifts);
  const now = Date.now();
  const levelFromBoth = computeAdaptationLevel(contributions.chest, now);
  const levelFromOne = computeAdaptationLevel([contributions.chest[0]], now);
  assert.ok(levelFromBoth > levelFromOne, 'two recent sessions stacking should read higher than either alone');
});

test('computeAdaptationLevel can exceed 1 (100%) when several recent, near-optimal sessions overlap near their peaks', () => {
  // 4 sets/day at RIR 0 (near-max single-session score) on 3 consecutive
  // days: at "now" the middle session sits exactly at its own 48h peak
  // while its neighbors' still-substantial curves stack on top of it.
  const lifts = [];
  for (const d of [3, 2, 1]) {
    for (let i = 0; i < 4; i++) lifts.push({ date: daysAgo(d), exercise: 'Barbell Curl', kg: 30, reps: 8, rpe: 10 });
  }
  const contributions = computeStimulusContributions(lifts);
  const level = computeAdaptationLevel(contributions.biceps, Date.now());
  assert.ok(level > 1, 'stacked near-peak sessions should be allowed to exceed the single-session peak, same "can exceed 100%" convention used elsewhere');
});

test('computeAdaptationSeries returns a sample per muscle across the requested window', () => {
  const lifts = [{ date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 80, reps: 5, rpe: 9 }];
  const series = computeAdaptationSeries(lifts, { windowStartH: -48, windowEndH: 48, stepH: 24 });
  assert.ok(series.chest?.length > 0);
  for (const point of series.chest) assert.ok('h' in point && 'adapt' in point);
});

test('estimateAtrophyRate returns null with zero qualifying gaps', () => {
  assert.equal(estimateAtrophyRate([]), null);
  const lifts = [{ date: daysAgo(100), exercise: 'Back Squat', kg: 100, reps: 5 }];
  assert.equal(estimateAtrophyRate(lifts), null);
});

test('estimateAtrophyRate finds a positive rate given a clear detraining pattern across multiple gaps', () => {
  const lifts = [
    { date: daysAgo(120), exercise: 'Back Squat', kg: 140, reps: 5 },
    { date: daysAgo(90), exercise: 'Back Squat', kg: 120, reps: 5 }, // 30-day gap, real decline
    { date: daysAgo(200), exercise: 'Deadlift', kg: 160, reps: 5 },
    { date: daysAgo(170), exercise: 'Deadlift', kg: 140, reps: 5 }, // 30-day gap, real decline
  ];
  const result = estimateAtrophyRate(lifts);
  assert.ok(result != null && result.rate > 0, 'should find a positive median decline rate across the two gaps');
  assert.equal(result.gapCount, 2);
});

test('estimateAtrophyRate returns a lower-confidence single-gap estimate rather than falling back to null', () => {
  const lifts = [
    { date: daysAgo(120), exercise: 'Back Squat', kg: 140, reps: 5 },
    { date: daysAgo(90), exercise: 'Back Squat', kg: 120, reps: 5 }, // sole 30-day gap, real decline
  ];
  const result = estimateAtrophyRate(lifts);
  assert.ok(result != null && result.rate > 0, 'one real qualifying gap should still beat the flat default');
  assert.equal(result.gapCount, 1);
});

test('DEFAULT_ATROPHY_RATE is a sane positive fallback', () => {
  assert.ok(DEFAULT_ATROPHY_RATE > 0 && DEFAULT_ATROPHY_RATE < 1);
});
