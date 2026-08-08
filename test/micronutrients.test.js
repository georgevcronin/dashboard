const test = require('node:test');
const assert = require('node:assert');

const { extractMicronutrients, pctRDA, labelFor } = require('../functions/micronutrients');

test('extractMicronutrients: empty object for null/missing nutriments', () => {
  assert.deepStrictEqual(extractMicronutrients(null), {});
  assert.deepStrictEqual(extractMicronutrients(undefined), {});
  assert.deepStrictEqual(extractMicronutrients({}), {});
});

test('extractMicronutrients: only returns fields actually present, no fabricated zeros', () => {
  const result = extractMicronutrients({ 'fiber_100g': 2.4, 'energy-kcal_100g': 250 });
  assert.strictEqual(result.fiber, 2.4);
  assert.strictEqual('sodium' in result, false, 'a field OFF did not report should be absent, not 0');
  assert.strictEqual('calcium' in result, false);
});

test('extractMicronutrients: converts gram-scale OFF fields to mg for display', () => {
  // OFF reports sodium_100g in grams; 0.45g -> 450mg
  const result = extractMicronutrients({ 'sodium_100g': 0.45 });
  assert.strictEqual(result.sodium, 450);
});

test('extractMicronutrients: converts vitamin fields to µg', () => {
  const result = extractMicronutrients({ 'vitamin-c_100g': 0.006 });
  assert.strictEqual(result.vitaminC, 6, 'vitamin C is displayed in mg, and scaleToMg applies for it, not µg');
});

test('extractMicronutrients: ignores non-numeric or NaN values', () => {
  const result = extractMicronutrients({ 'fiber_100g': 'unknown', 'iron_100g': NaN, 'zinc_100g': 0.0012 });
  assert.strictEqual('fiber' in result, false);
  assert.strictEqual('iron' in result, false);
  assert.strictEqual(result.zinc, 1.2, 'zinc_100g 0.0012g -> 1.2mg via the mg scale factor');
});

test('pctRDA: computes percent of EU NRV for a defined reference', () => {
  assert.strictEqual(pctRDA('sodium', 1150), 50, '1150mg is 50% of the 2300mg sodium NRV');
});

test('pctRDA: null for a nutrient with no defined reference (sugar, cholesterol)', () => {
  assert.strictEqual(pctRDA('sugar', 20), null);
  assert.strictEqual(pctRDA('cholesterol', 100), null);
});

test('pctRDA: null for an unrecognized key or null value', () => {
  assert.strictEqual(pctRDA('notARealNutrient', 10), null);
  assert.strictEqual(pctRDA('sodium', null), null);
});

test('labelFor: returns label + unit for a known key, null otherwise', () => {
  assert.deepStrictEqual(labelFor('vitaminC'), { label: 'Vitamin C', unit: 'mg' });
  assert.strictEqual(labelFor('notReal'), null);
});
