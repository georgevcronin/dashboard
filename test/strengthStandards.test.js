const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreForRatio, classifyLift, estimate1RM, computeMuscleLevels, STANDARDS } = require('../functions/strengthStandards');

function mkLift(date, exercise, kg, reps) {
  return { date, exercise, kg, reps };
}

test('scoreForRatio is monotonically non-decreasing across the Advanced -> Elite tier boundary', () => {
  const t = STANDARDS.male.squat; // [0.50, 0.75, 1.25, 1.75, 2.25]
  const belowElite = scoreForRatio(2.24, t);
  const atElite = scoreForRatio(2.25, t);
  const deepElite = scoreForRatio(3.00, t);
  assert.ok(atElite.score >= belowElite.score, `score dropped crossing into Elite: ${belowElite.score} -> ${atElite.score}`);
  assert.equal(atElite.tier, 'Elite');
  assert.equal(deepElite.score, 100);
});

test('scoreForRatio scales 0-20 below the Beginner threshold', () => {
  const t = STANDARDS.male.squat;
  const half = scoreForRatio(t[0] / 2, t);
  assert.equal(half.tier, 'Untrained');
  assert.equal(half.score, 10);
});

test('scoreForRatio never exceeds 100 or goes below 0', () => {
  const t = STANDARDS.male.squat;
  assert.ok(scoreForRatio(0, t).score >= 0);
  assert.ok(scoreForRatio(100, t).score <= 100);
});

test('classifyLift is an allowlist — only the exact canonical exercise per category matches', () => {
  assert.equal(classifyLift('Barbell Bench Press'), 'bench');
  assert.equal(classifyLift('barbell bench press'), 'bench', 'case-insensitive');
  assert.equal(classifyLift('Dumbbell Bench Press (Flat)'), null, 'dumbbell press should not be ranked against barbell standards');
  assert.equal(classifyLift('Seated Cable Row'), null, 'cable row should not be ranked against barbell standards');
  assert.equal(classifyLift('Bent-Over Dumbbell Row (Bilateral)'), null, 'dumbbell row should not be ranked against barbell standards');
});

test('classifyLift correctly categorizes each canonical lift, including both allowed deadlift/row variants', () => {
  assert.equal(classifyLift('Back Squat'), 'squat');
  assert.equal(classifyLift('Conventional Deadlift'), 'deadlift');
  assert.equal(classifyLift('Sumo Deadlift'), 'deadlift');
  assert.equal(classifyLift('Barbell Row (Overhand / Pendlay)'), 'row');
  assert.equal(classifyLift('Barbell Row (Underhand / Yates)'), 'row');
  assert.equal(classifyLift('Barbell Overhead Press'), 'overheadPress');
});

// Regression test for a real reported bug: a user's squat tier showed an
// e1RM they'd never actually lifted. Root cause was the old keyword-based
// classifyLift matching ANY "squat"-named exercise (16 exist in
// exerciseDb.js — Box Squat, Pin Squat, Zercher Squat, Sumo Squat
// (Dumbbell), ...), each with a different real loading profile, none of
// them actually comparable to back-squat-calibrated published standards.
test('classifyLift excludes same-equipment squat/deadlift/press/row variants that are not the canonical lift', () => {
  const nonCanonical = [
    'Front Squat', 'Box Squat', 'Pause Squat', 'Pin Squat', 'Zercher Squat',
    'Landmine Squat', 'Safety Bar Squat', 'Romanian Deadlift', 'Deficit Deadlift',
    'Snatch-Grip Deadlift', 'Push Press', 'Z-Press', 'T-Bar Row', 'Meadows Row',
  ];
  for (const name of nonCanonical) assert.equal(classifyLift(name), null, `${name} should not be ranked`);
});

test('classifyLift excludes non-comparable variants for unrecognized custom exercises (allowlist, not keyword match, so these never matched anyway)', () => {
  assert.equal(classifyLift('My Custom Hack Squat'), null);
  assert.equal(classifyLift('My Custom Romanian Deadlift'), null);
  assert.equal(classifyLift('My Custom Machine Bench'), null);
});

test('estimate1RM excludes high-rep sets where the 1RM estimate is unreliable', () => {
  assert.equal(estimate1RM(100, 13), null);
  assert.ok(estimate1RM(100, 5) > 100);
  assert.equal(estimate1RM(0, 5), null);
});

test('computeMuscleLevels returns null with no bodyweight data or an unrecognized sex', () => {
  const lifts = [mkLift('2026-01-01', 'Barbell Curl', 40, 6)];
  assert.equal(computeMuscleLevels(lifts, {}, null, 'male'), null, 'no bodyweight anywhere');
  assert.equal(computeMuscleLevels(lifts, { '2026-01-01': 80 }, null, 'nonbinary'), null, 'unrecognized sex value');
});

test('computeMuscleLevels is case-insensitive on sex, matching profile.sex\'s stored display casing', () => {
  const lifts = [mkLift('2026-01-01', 'Barbell Curl', 40, 6)];
  const weights = { '2026-01-01': 80 };
  const result = computeMuscleLevels(lifts, weights, null, 'Male');
  assert.ok(result.biceps, 'should score biceps despite capitalized "Male"');
});

test('computeMuscleLevels resolves real Hevy-import exercise names via MUSCLE_EXERCISE_ALIASES', () => {
  const lifts = [mkLift('2026-01-01', 'bicep curl (barbell)', 40, 6)];
  const result = computeMuscleLevels(lifts, { '2026-01-01': 80 }, null, 'male');
  assert.equal(result.biceps.exercise, 'Barbell Curl');
});

test('computeMuscleLevels leaves a muscle null when it has no logged data, while others score normally', () => {
  const lifts = [mkLift('2026-01-01', 'Barbell Curl', 40, 6)];
  const result = computeMuscleLevels(lifts, { '2026-01-01': 80 }, null, 'male');
  assert.ok(result.biceps, 'biceps has data');
  assert.equal(result.triceps, null, 'triceps has no logged data');
});

test('computeMuscleLevels does not blend a secondary contributor until MIN_SESSIONS_FOR_AGGREGATION is met in both exercises', () => {
  const weights = { '2026-01-01': 80 };
  // Only one Hammer Curl session (biceps secondary) — below the 2-session bar.
  const lifts = [
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
    mkLift('2026-01-01', 'Hammer Curl', 60, 6),
  ];
  const result = computeMuscleLevels(lifts, weights, null, 'male');
  assert.equal(result.biceps.blendedFrom, undefined, 'single-session contributor should not enter the blend');
});

test('computeMuscleLevels never lets a blend pull a muscle\'s score below its canonical lift\'s own verified best', () => {
  const weights = { '2026-01-01': 80 };
  const canonicalOnly = computeMuscleLevels([
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
  ], weights, null, 'male');

  const withContributor = computeMuscleLevels([
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
    // Hammer Curl: biceps is secondary here (primary is brachialis/brachioradialis).
    // Identical weight both sessions -> ratio-normalized equivalent lands at
    // the canonical exercise's AVERAGE (below its best) -- exactly the real
    // account scenario that dragged biceps from a verified 45kg PR to 39kg.
    mkLift('2026-01-01', 'Hammer Curl', 100, 6),
    mkLift('2026-01-08', 'Hammer Curl', 100, 6),
  ], weights, null, 'male');

  assert.deepEqual(withContributor.biceps.blendedFrom, ['Hammer Curl']);
  assert.equal(withContributor.biceps.e1RM, canonicalOnly.biceps.e1RM, 'a contributor that would drag the score down must be floored at the canonical best instead');
});

test('computeMuscleLevels still lets a strong secondary contributor pull a muscle\'s score up above the canonical lift alone', () => {
  const weights = { '2026-01-01': 80 };
  const canonicalOnly = computeMuscleLevels([
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
  ], weights, null, 'male');

  const withContributor = computeMuscleLevels([
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
    // Hammer Curl's peak session (90kg) is well above its own average
    // (65kg midpoint of 40/90) -- a genuine upward trend, not just noise,
    // so its ratio-normalized equivalent should land above the canonical
    // exercise's own average and can legitimately push the blend up.
    mkLift('2026-01-01', 'Hammer Curl', 40, 6),
    mkLift('2026-01-08', 'Hammer Curl', 90, 6),
  ], weights, null, 'male');

  assert.deepEqual(withContributor.biceps.blendedFrom, ['Hammer Curl']);
  assert.ok(withContributor.biceps.e1RM > canonicalOnly.biceps.e1RM, 'a contributor showing genuine extra capability should still be able to raise the score');
  // Secondary budget is capped at 0.5 vs the canonical lift's own weight of
  // 1.0, so the blend can move at most 1/3 of the way toward the
  // contributor's equivalent value -- it can shift the score, but never
  // swing it wildly.
  const shift = withContributor.biceps.e1RM - canonicalOnly.biceps.e1RM;
  assert.ok(shift < canonicalOnly.biceps.e1RM / 2, `shift of ${shift} should be well bounded relative to canonical e1RM ${canonicalOnly.biceps.e1RM}`);
});

// Regression test for a real reported bug: a 95kg x10 Adductor Machine set
// logged at 100% fatigue corrected up to 163.7kg, beat a genuinely stronger,
// fresher 109kg x5 PR (125.7kg raw) for "best", and the floor then locked
// that fatigue-inflated number in as an unbreakable minimum. Fatigue
// correction must only ever influence the cross-exercise RATIO (comparing
// two different exercises fairly), never which single session counts as a
// muscle's own genuine best or its floor.
test('computeMuscleLevels never lets fatigue correction change which session counts as a canonical lift\'s own best', () => {
  const weights = { '2026-01-01': 80 };
  const lifts = [
    mkLift('2026-01-01', 'Barbell Curl', 40, 10), // raw ~103kg, would correct to ~137kg at fatigue=100
    mkLift('2026-01-08', 'Barbell Curl', 45, 5),  // raw ~54kg, genuinely the lower session
  ];
  const noFatigue = computeMuscleLevels(lifts, weights, null, 'male');
  const firstSessionFullyFatigued = computeMuscleLevels(lifts, weights, null, 'male', [{ biceps: 100 }, { biceps: 0 }]);
  assert.equal(noFatigue.biceps.e1RM, firstSessionFullyFatigued.biceps.e1RM,
    'the muscle\'s headline e1RM must be identical regardless of fatigue correction -- it is always picked from raw, uncorrected values');
});

test('computeMuscleLevels treats a missing fatigueTimeline exactly like fatigue=0 everywhere (backward compatible)', () => {
  const weights = { '2026-01-01': 80 };
  const lifts = [mkLift('2026-01-01', 'Barbell Curl', 40, 6)];
  const withoutTimeline = computeMuscleLevels(lifts, weights, null, 'male');
  const withZeroTimeline = computeMuscleLevels(lifts, weights, null, 'male', [{ biceps: 0 }]);
  assert.equal(withoutTimeline.biceps.e1RM, withZeroTimeline.biceps.e1RM);
});

test('computeMuscleLevels treats different machine/technique tags on the same exercise name as separate contributors', () => {
  const weights = { '2026-01-01': 80 };
  const lifts = [
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
    { ...mkLift('2026-01-01', 'Hammer Curl', 60, 6), machine: 'Precor' },
    { ...mkLift('2026-01-08', 'Hammer Curl', 60, 6), machine: 'Precor' },
    { ...mkLift('2026-01-01', 'Hammer Curl', 30, 6), machine: 'Life Fitness' },
    { ...mkLift('2026-01-08', 'Hammer Curl', 30, 6), machine: 'Life Fitness' },
  ];
  const result = computeMuscleLevels(lifts, weights, null, 'male');
  assert.ok(result.biceps.blendedFrom.includes('Hammer Curl (Precor)'), 'Precor-tagged sessions should form their own contributor');
  assert.ok(result.biceps.blendedFrom.includes('Hammer Curl (Life Fitness)'), 'Life Fitness-tagged sessions should form their own contributor');
});

test('computeMuscleLevels does not pool a machine-tagged session with an untagged one of the same exercise to reach the aggregation minimum', () => {
  const weights = { '2026-01-01': 80 };
  const lifts = [
    mkLift('2026-01-01', 'Barbell Curl', 40, 6),
    mkLift('2026-01-08', 'Barbell Curl', 42, 6),
    { ...mkLift('2026-01-01', 'Hammer Curl', 60, 6), machine: 'Precor' },
    mkLift('2026-01-08', 'Hammer Curl', 60, 6), // untagged -- separate pool, 1 session each
  ];
  const result = computeMuscleLevels(lifts, weights, null, 'male');
  assert.equal(result.biceps.blendedFrom, undefined, 'neither the tagged nor untagged pool alone has 2 sessions, so neither should qualify');
});
