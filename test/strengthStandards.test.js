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

test('classifyLift only accepts barbell-equipment lifts for DB-recognized exercise names', () => {
  assert.equal(classifyLift('Barbell Bench Press'), 'bench');
  assert.equal(classifyLift('Dumbbell Bench Press (Flat)'), null, 'dumbbell press should not be ranked against barbell standards');
  assert.equal(classifyLift('Seated Cable Row'), null, 'cable row should not be ranked against barbell standards');
  assert.equal(classifyLift('Bent-Over Dumbbell Row (Bilateral)'), null, 'dumbbell row should not be ranked against barbell standards');
});

test('classifyLift correctly categorizes all five barbell compounds', () => {
  assert.equal(classifyLift('Back Squat'), 'squat');
  assert.equal(classifyLift('Conventional Deadlift'), 'deadlift');
  assert.equal(classifyLift('Barbell Row (Overhand / Pendlay)'), 'row');
  assert.equal(classifyLift('Barbell Overhead Press'), 'overheadPress');
});

test('classifyLift excludes non-comparable variants by name for unrecognized custom exercises', () => {
  assert.equal(classifyLift('My Custom Hack Squat'), null);
  assert.equal(classifyLift('My Custom Romanian Deadlift'), null);
  assert.equal(classifyLift('My Custom Machine Bench'), null);
});

test('estimate1RM excludes high-rep sets where the Epley formula degrades', () => {
  assert.equal(estimate1RM(100, 13), null);
  assert.ok(estimate1RM(100, 5) > 100);
  assert.equal(estimate1RM(0, 5), null);
});
