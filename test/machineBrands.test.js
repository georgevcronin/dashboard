const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultMachineBrands, SELECTORIZED_BRANDS, CABLE_BRANDS, SMITH_BRANDS } = require('../functions/machineBrands');
const { EXERCISE_DB } = require('../functions/exerciseDb');

test('defaultMachineBrands returns the right roster per equipment type', () => {
  assert.deepEqual(defaultMachineBrands('machine'), SELECTORIZED_BRANDS);
  assert.deepEqual(defaultMachineBrands('cable'), CABLE_BRANDS);
  assert.deepEqual(defaultMachineBrands('smith'), SMITH_BRANDS);
});

test('defaultMachineBrands returns no suggestions for free-weight/bodyweight equipment', () => {
  assert.deepEqual(defaultMachineBrands('barbell'), []);
  assert.deepEqual(defaultMachineBrands('dumbbell'), []);
  assert.deepEqual(defaultMachineBrands('bodyweight'), []);
  assert.deepEqual(defaultMachineBrands('kettlebell'), []);
  assert.deepEqual(defaultMachineBrands(undefined), []);
});

test('every machine/cable/smith exercise in exerciseDb.js resolves to a non-empty brand list', () => {
  const taggable = EXERCISE_DB.filter(e => ['machine', 'cable', 'smith'].includes(e.equipment));
  assert.ok(taggable.length > 60, 'sanity check: expected 60+ machine/cable/smith exercises in the DB');
  for (const e of taggable) {
    assert.ok(defaultMachineBrands(e.equipment).length > 0, `${e.name} (${e.equipment}) should have brand suggestions`);
  }
});

test('brand rosters contain no duplicate entries', () => {
  for (const list of [SELECTORIZED_BRANDS, CABLE_BRANDS, SMITH_BRANDS]) {
    assert.equal(new Set(list).size, list.length);
  }
});
