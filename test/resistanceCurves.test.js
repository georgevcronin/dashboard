const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RESISTANCE_CURVES, SKIPPED, PLATE_LOADED_BASE_RESISTANCE_KG } = require('../functions/resistanceCurves');
const { EXERCISE_DB } = require('../functions/exerciseDb');

// Structural sanity only — the actual curve-shape *claims* aren't testable,
// they're a best-effort domain judgment call (see the file's own header
// comment on rigor). This test suite verifies the data is well-formed, not
// that any individual rating is "correct."

test('every value is an integer 1-5', () => {
  for (const [key, value] of Object.entries(RESISTANCE_CURVES)) {
    assert.ok(Number.isInteger(value), `${key}: expected an integer, got ${value}`);
    assert.ok(value >= 1 && value <= 5, `${key}: expected 1-5, got ${value}`);
  }
});

test('keys are well-formed: lowercase, no leading/trailing whitespace, at most one brand separator', () => {
  for (const key of Object.keys(RESISTANCE_CURVES)) {
    assert.equal(key, key.toLowerCase(), `${key} should be lowercase`);
    assert.equal(key, key.trim(), `${key} should have no leading/trailing whitespace`);
    const separators = key.split('|').length - 1;
    assert.ok(separators <= 1, `${key} should have at most one '|' brand separator`);
  }
});

test('no duplicate keys (object literal semantics already guarantee this, but confirm the generator never produced a collision)', () => {
  const keys = Object.keys(RESISTANCE_CURVES);
  assert.equal(new Set(keys).size, keys.length);
});

test('a substantial dataset was actually produced, not a stub', () => {
  assert.ok(Object.keys(RESISTANCE_CURVES).length > 900, 'expected 900+ entries given the per-brand expansion across machine/cable/smith');
});

// Free weights/bodyweight/kettlebell are deliberately NOT stored here (see
// the file header) — brand never applies to them, so every key is expected
// to be brand-keyed. baseRatingFor() (still exported) covers the free-weight
// case directly instead.
test('every entry is brand-keyed (machine/cable/smith) — free weights are computed via baseRatingFor(), not stored', () => {
  const keys = Object.keys(RESISTANCE_CURVES);
  assert.ok(keys.length > 0, 'expected at least some entries');
  for (const key of keys) {
    assert.ok(key.includes('|'), `${key}: expected a brand-keyed "exercise|brand" key, found a plain key`);
  }
});

test('SKIPPED is an array of strings, and every skip has a stated reason (not silently dropped)', () => {
  assert.ok(Array.isArray(SKIPPED));
  for (const entry of SKIPPED) {
    assert.equal(typeof entry, 'string');
    assert.ok(entry.length > 0);
  }
});

// Plate-loaded base resistance (kg) — deliberately narrower/lower-confidence
// than RESISTANCE_CURVES itself (see the file header on why). Same
// structural-sanity-only testing philosophy: verify it's well-formed, not
// that any individual kg figure is correct.

test('plate-loaded base resistance values are all positive numbers, keys reference real exercise+brand pairs', () => {
  const exerciseNames = new Set(EXERCISE_DB.map(e => e.name.toLowerCase()));
  for (const [key, value] of Object.entries(PLATE_LOADED_BASE_RESISTANCE_KG)) {
    assert.ok(typeof value === 'number' && value > 0, `${key}: expected a positive kg number, got ${value}`);
    const [exercise, brand] = key.split('|');
    assert.ok(exercise && brand, `${key}: expected an "exercise|brand" key`);
    assert.ok(exerciseNames.has(exercise), `${key}: "${exercise}" is not a real exercise name in exerciseDb.js`);
  }
});

test('plate-loaded base resistance is a strict subset of the main machine-equipment keys (never invents a brand/exercise pair the main pass never rated)', () => {
  for (const key of Object.keys(PLATE_LOADED_BASE_RESISTANCE_KG)) {
    assert.ok(key in RESISTANCE_CURVES, `${key} has a base-resistance figure but no corresponding curve-shape rating`);
  }
});
