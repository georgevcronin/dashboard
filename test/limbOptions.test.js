const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LIMB_OPTIONS, COLLAPSE_MAPPING, SHARED_DEFAULT, INDEPENDENT } = require('../functions/limbOptions');
const { EXERCISE_DB } = require('../functions/exerciseDb');

// Structural sanity only — which exercises get a limb option, and why, is a
// domain judgment call (see the file's own header comment), not something
// this suite verifies.

test('every LIMB_OPTIONS key is a real, normalized (lowercase) exercise name', () => {
  const exerciseNames = new Set(EXERCISE_DB.map(e => e.name.toLowerCase()));
  for (const key of Object.keys(LIMB_OPTIONS)) {
    assert.equal(key, key.toLowerCase(), `${key} should be lowercase`);
    assert.ok(exerciseNames.has(key), `${key} is not a real exercise name in exerciseDb.js`);
  }
});

test('every marked-limb-capable entry has a valid basis', () => {
  for (const [key, val] of Object.entries(LIMB_OPTIONS)) {
    if (val.singleLimb) {
      assert.ok([SHARED_DEFAULT, INDEPENDENT].includes(val.basis), `${key}: singleLimb true but basis is "${val.basis}"`);
    }
  }
});

test('COLLAPSE_MAPPING.collapse keys are real exercise names, values are strings', () => {
  const exerciseNames = new Set(EXERCISE_DB.map(e => e.name));
  for (const [from, to] of Object.entries(COLLAPSE_MAPPING.collapse)) {
    assert.ok(exerciseNames.has(from), `${from} is not a real exercise name`);
    assert.equal(typeof to, 'string');
    assert.ok(to.length > 0);
  }
});

test('COLLAPSE_MAPPING.keepSeparate and noCleanTarget keys are real exercise names', () => {
  const exerciseNames = new Set(EXERCISE_DB.map(e => e.name));
  for (const key of [...Object.keys(COLLAPSE_MAPPING.keepSeparate), ...Object.keys(COLLAPSE_MAPPING.noCleanTarget)]) {
    assert.ok(exerciseNames.has(key), `${key} is not a real exercise name`);
  }
});

test('every named "Single-Arm"/"Single-Leg" exercise in exerciseDb.js is accounted for in COLLAPSE_MAPPING (collapse, keepSeparate, or noCleanTarget)', () => {
  const unilateralNamed = EXERCISE_DB.filter(e => /single-arm|single-leg/i.test(e.name)).map(e => e.name);
  const accountedFor = new Set([
    ...Object.keys(COLLAPSE_MAPPING.collapse),
    ...Object.keys(COLLAPSE_MAPPING.keepSeparate),
    ...Object.keys(COLLAPSE_MAPPING.noCleanTarget),
  ]);
  for (const name of unilateralNamed) {
    assert.ok(accountedFor.has(name), `${name} is a named unilateral exercise not accounted for in COLLAPSE_MAPPING`);
  }
});

test('a real dataset was produced, not a stub', () => {
  assert.ok(Object.keys(LIMB_OPTIONS).length > 20, 'expected a substantial number of limb-capable exercises');
});
