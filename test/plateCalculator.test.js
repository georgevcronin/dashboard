const { test } = require('node:test');
const assert = require('node:assert/strict');
const { platesForWeight, STANDARD_PLATES_KG } = require('../functions/plateCalculator');

test('platesForWeight splits an exact target evenly across both sides', () => {
  const out = platesForWeight(100, 20, STANDARD_PLATES_KG);
  assert.equal(out.perSide, 40);
  assert.deepEqual(out.plates, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
  assert.equal(out.leftover, 0);
});

test('platesForWeight handles a fractional target requiring the smallest plate', () => {
  const out = platesForWeight(101, 20, STANDARD_PLATES_KG);
  assert.equal(out.perSide, 40.5);
  assert.deepEqual(out.plates, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }, { plate: 0.5, count: 1 }]);
});

test('platesForWeight only uses plates marked available', () => {
  const out = platesForWeight(60, 20, [20, 15, 10]);
  assert.deepEqual(out.plates, [{ plate: 20, count: 1 }]);
  assert.equal(out.leftover, 0);
});

test('platesForWeight reports a leftover when the available set cannot reach the exact target', () => {
  const out = platesForWeight(65, 20, [20]);
  assert.equal(out.perSide, 22.5);
  assert.deepEqual(out.plates, [{ plate: 20, count: 1 }]);
  assert.equal(out.leftover, 2.5);
});

test('platesForWeight returns nothing for a target at or below the bar weight', () => {
  assert.deepEqual(platesForWeight(20, 20, STANDARD_PLATES_KG), { plates: [], leftover: 0, perSide: 0 });
  assert.deepEqual(platesForWeight(10, 20, STANDARD_PLATES_KG), { plates: [], leftover: 0, perSide: -5 });
});

test('platesForWeight uses multiple of the same plate when needed', () => {
  const out = platesForWeight(140, 20, STANDARD_PLATES_KG);
  assert.equal(out.perSide, 60);
  assert.deepEqual(out.plates, [{ plate: 25, count: 2 }, { plate: 10, count: 1 }]);
});
