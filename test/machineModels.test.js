const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MACHINE_MODELS } = require('../functions/machineModels');
const { EXERCISE_DB } = require('../functions/exerciseDb');
const { SELECTORIZED_BRANDS, CABLE_BRANDS, SMITH_BRANDS } = require('../functions/machineBrands');

// Structural sanity only — the actual product-name claims aren't testable
// automatically, they're a best-effort research result (see the file's own
// header comment on rigor and sourcing). This suite verifies the data is
// well-formed and internally consistent, not that any individual model name
// is correct.

const ALL_BRANDS = new Set(
  [...SELECTORIZED_BRANDS, ...CABLE_BRANDS, ...SMITH_BRANDS].map(b => b.toLowerCase())
);
const EXERCISE_NAMES = new Set(EXERCISE_DB.map(e => e.name.toLowerCase().trim()));

test('every key has exactly one brand separator', () => {
  for (const key of Object.keys(MACHINE_MODELS)) {
    const separators = key.split('|').length - 1;
    assert.equal(separators, 1, `${key} should have exactly one '|' brand separator`);
  }
});

test('keys are well-formed: lowercase, no leading/trailing whitespace', () => {
  for (const key of Object.keys(MACHINE_MODELS)) {
    assert.equal(key, key.toLowerCase(), `${key} should be lowercase`);
    assert.equal(key, key.trim(), `${key} should have no leading/trailing whitespace`);
  }
});

test('every key\'s exercise-half is a real exercise name in EXERCISE_DB', () => {
  for (const key of Object.keys(MACHINE_MODELS)) {
    const [exercise] = key.split('|');
    assert.ok(EXERCISE_NAMES.has(exercise), `${key}: "${exercise}" is not a real exercise name in exerciseDb.js`);
  }
});

test('every key\'s brand-half is a real brand from machineBrands.js', () => {
  for (const key of Object.keys(MACHINE_MODELS)) {
    const [, brand] = key.split('|');
    assert.ok(ALL_BRANDS.has(brand), `${key}: "${brand}" is not a brand listed in machineBrands.js`);
  }
});

test('every key only pairs an exercise with a brand valid for that exercise\'s equipment type', () => {
  const exerciseByName = new Map(EXERCISE_DB.map(e => [e.name.toLowerCase().trim(), e]));
  const brandListsByEquipment = {
    machine: new Set(SELECTORIZED_BRANDS.map(b => b.toLowerCase())),
    cable: new Set(CABLE_BRANDS.map(b => b.toLowerCase())),
    smith: new Set(SMITH_BRANDS.map(b => b.toLowerCase())),
  };
  for (const key of Object.keys(MACHINE_MODELS)) {
    const [exercise, brand] = key.split('|');
    const ex = exerciseByName.get(exercise);
    assert.ok(ex, `${key}: exercise not found`);
    const validBrands = brandListsByEquipment[ex.equipment];
    assert.ok(validBrands, `${key}: "${ex.equipment}" is not a brand-scoped equipment type`);
    assert.ok(validBrands.has(brand), `${key}: "${brand}" is not a valid brand for ${ex.equipment} equipment`);
  }
});

test('every value is a non-empty string', () => {
  for (const [key, value] of Object.entries(MACHINE_MODELS)) {
    assert.equal(typeof value, 'string', `${key}: expected a string value`);
    assert.ok(value.trim().length > 0, `${key}: expected a non-empty model name`);
  }
});

test('no duplicate keys (object literal semantics already guarantee this, but confirm the generator never produced a collision)', () => {
  const keys = Object.keys(MACHINE_MODELS);
  assert.equal(new Set(keys).size, keys.length);
});

test('a real dataset was produced, not a stub', () => {
  assert.ok(Object.keys(MACHINE_MODELS).length > 100, 'expected a substantial number of researched entries');
});

test('covers a broad spread of brands, not just one or two', () => {
  const brandsUsed = new Set(Object.keys(MACHINE_MODELS).map(k => k.split('|')[1]));
  assert.ok(brandsUsed.size >= 10, `expected 10+ distinct brands represented, got ${brandsUsed.size}`);
});
