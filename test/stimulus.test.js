const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeSessionStimulus, OPTIMAL_HARD_SETS_PER_SESSION } = require('../functions/stimulus');

function mkSet(type, done) { return { type, done }; }

test('computeSessionStimulus reads 100 at exactly the optimal hard-set count', () => {
  const sets = Array.from({ length: OPTIMAL_HARD_SETS_PER_SESSION }, () => mkSet('N', true));
  const exercises = [{ name: 'Barbell Curl', sets }];
  const out = computeSessionStimulus(exercises);
  assert.equal(out.biceps, 100);
});

test('computeSessionStimulus scales linearly and goes above 100 past the optimal count', () => {
  const sets = Array.from({ length: OPTIMAL_HARD_SETS_PER_SESSION * 2 }, () => mkSet('N', true));
  const exercises = [{ name: 'Barbell Curl', sets }];
  const out = computeSessionStimulus(exercises);
  assert.equal(out.biceps, 200, 'double the optimal set count should read 200, not cap at 100');
});

test('computeSessionStimulus excludes warmup sets from the hard-set count', () => {
  const exercises = [{
    name: 'Barbell Curl',
    sets: [mkSet('W', true), mkSet('W', true), mkSet('N', true), mkSet('N', true)],
  }];
  const out = computeSessionStimulus(exercises);
  // Only 2 real working sets logged -- half of the 4-set target.
  assert.equal(out.biceps, 50);
});

test('computeSessionStimulus excludes sets not yet marked done', () => {
  const exercises = [{
    name: 'Barbell Curl',
    sets: [mkSet('N', true), mkSet('N', true), mkSet('N', false), mkSet('N', false)],
  }];
  const out = computeSessionStimulus(exercises);
  assert.equal(out.biceps, 50, 'undone sets should not count toward the dose yet');
});

test('computeSessionStimulus accumulates hard sets across multiple exercises hitting the same muscle', () => {
  const exercises = [
    { name: 'Barbell Curl', sets: [mkSet('N', true), mkSet('N', true)] },
    { name: 'Hammer Curl', sets: [mkSet('N', true), mkSet('N', true)] },
  ];
  const out = computeSessionStimulus(exercises);
  assert.equal(out.biceps, 100, 'sets from different exercises on the same muscle should sum toward one dose');
});

test('computeSessionStimulus returns an empty object for no exercises or no completed sets', () => {
  assert.deepEqual(computeSessionStimulus([]), {});
  assert.deepEqual(computeSessionStimulus([{ name: 'Barbell Curl', sets: [mkSet('N', false)] }]), {});
});
