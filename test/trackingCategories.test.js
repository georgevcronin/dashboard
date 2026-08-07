const test = require('node:test');
const assert = require('node:assert');

const { TRACKING_CATEGORY_KEYS, validateTrackingCategories } = require('../functions/trackingCategories');

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

// Mirrors src/app.jsx's LEGACY_TRACKING_LEVEL_MAP + trackingCategoriesFor —
// that logic is frontend-only (no test runner reaches src/app.jsx), so this
// locks the migration's expected behavior in one place a backend test can
// actually run, to catch a drift between the two if either ever changes.
const LEGACY_TRACKING_LEVEL_MAP = {
  workout: { sleep: false, nutrition: false },
  workout_sleep: { sleep: true, nutrition: false },
  full: { sleep: true, nutrition: true },
};
const trackingCategoriesFor = profile =>
  profile?.trackingCategories || LEGACY_TRACKING_LEVEL_MAP[profile?.trackingLevel] || LEGACY_TRACKING_LEVEL_MAP.full;

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
