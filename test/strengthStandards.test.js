const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreForRatio, classifyLift, estimate1RM, STANDARDS } = require('../functions/strengthStandards');

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

test('estimate1RM excludes high-rep sets where the Epley formula degrades', () => {
  assert.equal(estimate1RM(100, 13), null);
  assert.ok(estimate1RM(100, 5) > 100);
  assert.equal(estimate1RM(0, 5), null);
});
