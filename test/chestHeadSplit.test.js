const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_DB } = require('../functions/exerciseDb');
const { CHEST_SPLIT_BY_ANGLE, chestSplitForExercise } = require('../functions/chestHeadSplit');

test('every angle in CHEST_SPLIT_BY_ANGLE sums to exactly 100 -- required so summing the split always reproduces flat 100% chest credit', () => {
  for (const [angle, split] of Object.entries(CHEST_SPLIT_BY_ANGLE)) {
    assert.equal(split.lower + split.mid + split.upper, 100, `angle ${angle} should sum to 100`);
  }
});

test('every exercise in exerciseDb.js that touches chest (primary or secondary) has a recognized split', () => {
  const chestExercises = EXERCISE_DB.filter(e => e.primary?.includes('chest') || e.secondary?.includes('chest'));
  assert.ok(chestExercises.length > 0, 'sanity check: exerciseDb.js should have chest exercises to test against');
  const missing = chestExercises.filter(e => !chestSplitForExercise(e.name)).map(e => e.name);
  assert.deepEqual(missing, [], 'every chest-touching exercise should resolve to a split');
});

test('chestSplitForExercise is case-insensitive and matches exact exerciseDb.js names', () => {
  const a = chestSplitForExercise('Barbell Bench Press');
  const b = chestSplitForExercise('barbell bench press');
  assert.deepEqual(a, b);
  assert.deepEqual(a, { lower: 38, mid: 42, upper: 20 });
});

test('chestSplitForExercise returns null for an unrecognized name, not a fabricated default', () => {
  assert.equal(chestSplitForExercise('Some Exercise Never Logged Before'), null);
  assert.equal(chestSplitForExercise(''), null);
  assert.equal(chestSplitForExercise(undefined), null);
});

test('incline exercises favor upper chest more than flat, decline exercises favor lower chest more than flat', () => {
  const decline = chestSplitForExercise('Decline Barbell Bench Press');
  const flat = chestSplitForExercise('Barbell Bench Press');
  const incline = chestSplitForExercise('Incline Barbell Bench Press');
  assert.ok(decline.lower > flat.lower, 'decline should favor lower chest more than flat');
  assert.ok(incline.upper > flat.upper, 'incline should favor upper chest more than flat');
  assert.ok(incline.upper > decline.upper, 'incline should favor upper chest more than decline');
  assert.ok(decline.lower > incline.lower, 'decline should favor lower chest more than incline');
});

test('cable fly direction mirrors the equivalent press angle (high-to-low ~ decline, low-to-high ~ incline)', () => {
  assert.deepEqual(chestSplitForExercise('Cable Fly (High to Low)'), chestSplitForExercise('Decline Barbell Bench Press'));
  assert.deepEqual(chestSplitForExercise('Cable Fly (Low to High)'), chestSplitForExercise('Incline Barbell Bench Press'));
});
