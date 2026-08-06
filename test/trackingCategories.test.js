const test = require('node:test');
const assert = require('node:assert');

const { TRACKING_CATEGORY_KEYS, validateTrackingCategories, resolveTrackingCategories: trackingCategoriesFor } = require('../functions/trackingCategories');

test('validateTrackingCategories: valid object with both keys passes', () => {
  assert.strictEqual(validateTrackingCategories({ sleep: true, nutrition: false }), null);
});

test('validateTrackingCategories: valid object with one key passes', () => {
  assert.strictEqual(validateTrackingCategories({ sleep: true }), null);
  assert.strictEqual(validateTrackingCategories({}), null, 'empty object is valid — no keys to reject');
});

test('validateTrackingCategories: rejects non-boolean values', () => {
  assert.match(validateTrackingCategories({ sleep: 'yes' }), /boolean/);
  assert.match(validateTrackingCategories({ nutrition: 1 }), /boolean/);
  assert.match(validateTrackingCategories({ sleep: null }), /boolean/);
});

test('validateTrackingCategories: rejects unknown keys', () => {
  assert.match(validateTrackingCategories({ workout: true }), /object/);
  assert.match(validateTrackingCategories({ sleep: true, extra: true }), /object/);
});

test('validateTrackingCategories: rejects non-object shapes', () => {
  assert.match(validateTrackingCategories(null), /object/);
  assert.match(validateTrackingCategories('full'), /object/);
  assert.match(validateTrackingCategories(['sleep']), /object/);
  assert.match(validateTrackingCategories(42), /object/);
});

test('TRACKING_CATEGORY_KEYS: exactly sleep and nutrition', () => {
  assert.deepStrictEqual([...TRACKING_CATEGORY_KEYS].sort(), ['nutrition', 'sleep']);
});

// #14: src/app.jsx imports this exact function (esbuild bundles functions/*
// into the frontend build) rather than keeping its own copy, so testing it
// here covers both the backend briefing/newscast generators and the
// dashboard's own render gate with one implementation, not two to drift.
test('trackingCategoriesFor: a saved trackingCategories object always wins over a legacy trackingLevel string', () => {
  const profile = { trackingLevel: 'workout', trackingCategories: { sleep: true, nutrition: true } };
  assert.deepStrictEqual(trackingCategoriesFor(profile), { sleep: true, nutrition: true });
});

test('trackingCategoriesFor: migrates each legacy trackingLevel value correctly', () => {
  assert.deepStrictEqual(trackingCategoriesFor({ trackingLevel: 'workout' }), { sleep: false, nutrition: false });
  assert.deepStrictEqual(trackingCategoriesFor({ trackingLevel: 'workout_sleep' }), { sleep: true, nutrition: false });
  assert.deepStrictEqual(trackingCategoriesFor({ trackingLevel: 'full' }), { sleep: true, nutrition: true });
});

test('trackingCategoriesFor: defaults to full (everything on) for a profile with neither field', () => {
  assert.deepStrictEqual(trackingCategoriesFor({}), { sleep: true, nutrition: true });
  assert.deepStrictEqual(trackingCategoriesFor(null), { sleep: true, nutrition: true });
  assert.deepStrictEqual(trackingCategoriesFor(undefined), { sleep: true, nutrition: true });
});

test('trackingCategoriesFor: an unrecognized legacy trackingLevel string falls back to full', () => {
  assert.deepStrictEqual(trackingCategoriesFor({ trackingLevel: 'nonsense' }), { sleep: true, nutrition: true });
});
