const { test } = require('node:test');
const assert = require('node:assert/strict');
const { musclesForExercise, isCompoundExercise, isLowerBodyExercise, findExercise } = require('../functions/muscleTaxonomy');

test('musclesForExercise resolves canonical DB exercises regardless of case', () => {
  assert.deepEqual(new Set(musclesForExercise('Push-Up')), new Set(['chest', 'triceps', 'front-delt', 'serratus', 'core']));
  assert.deepEqual(musclesForExercise('push-up'), musclesForExercise('Push-Up'));
  assert.deepEqual(musclesForExercise('PUSH-UP'), musclesForExercise('Push-Up'));
});

test('musclesForExercise does not misattribute "Cable X" exercises to abs (the old "ab"-substring bug)', () => {
  const muscles = musclesForExercise('Cable Crossover');
  assert.ok(!muscles.includes('abs'), 'Cable Crossover should not attribute to abs');
  assert.ok(muscles.includes('chest'));
});

test('musclesForExercise falls back to keyword matching for unknown exercise names', () => {
  const muscles = musclesForExercise('some totally made up bench press variant');
  assert.ok(muscles.includes('chest'));
});

test('musclesForExercise returns empty array for totally unattributable names', () => {
  assert.deepEqual(musclesForExercise('xyzzy plugh quux'), []);
});

test('musclesForExercise handles hyphenated names the keyword fallback would otherwise miss', () => {
  // Only relevant for names NOT in EXERCISE_DB (fallback path) -- Pull-Up/Chin-Up
  // are in the DB so they hit the exact-match path, but the fallback matcher
  // itself must still normalize hyphens for genuinely unknown names.
  const muscles = musclesForExercise('Some Random Pull-Up Variant');
  assert.ok(muscles.includes('lats'), 'hyphenated fallback name should still match "pull up" keyword');
});

test('isCompoundExercise recognizes Olympic-lift derivatives and push press', () => {
  assert.equal(isCompoundExercise('Power Clean'), true);
  assert.equal(isCompoundExercise('Hang Clean'), true);
  assert.equal(isCompoundExercise('Push Press'), true);
});

test('isCompoundExercise does not false-positive on isolation moves', () => {
  assert.equal(isCompoundExercise('Hammer Curl'), false);
  assert.equal(isCompoundExercise('Cable Crossover'), false);
});

test('isLowerBodyExercise is true for squat/deadlift/hip-thrust family, false for upper body', () => {
  assert.equal(isLowerBodyExercise('Back Squat'), true);
  assert.equal(isLowerBodyExercise('Conventional Deadlift'), true);
  assert.equal(isLowerBodyExercise('Barbell Bench Press'), false);
});

test('findExercise is case-insensitive and returns null for unknown names', () => {
  assert.equal(findExercise('barbell bench press').id, findExercise('Barbell Bench Press').id);
  assert.equal(findExercise('not a real exercise'), null);
});
