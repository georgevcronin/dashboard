const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifySportType } = require('../functions/sportClassifier');

test('classifies standard cycling sport_types', () => {
  for (const t of ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide', 'Handcycle', 'Velomobile']) {
    assert.equal(classifySportType(t), 'cycling', t);
  }
});

test('classifies swimming sport_types', () => {
  for (const t of ['Swim', 'OpenWaterSwim']) {
    assert.equal(classifySportType(t), 'swimming', t);
  }
});

test('everything else falls to other', () => {
  for (const t of ['Hike', 'Yoga', 'WeightTraining', 'Run', 'TrailRun']) {
    assert.equal(classifySportType(t), 'other', t);
  }
});

test('is case-insensitive and handles null/undefined', () => {
  assert.equal(classifySportType('ride'), 'cycling');
  assert.equal(classifySportType('SWIM'), 'swimming');
  assert.equal(classifySportType(null), 'other');
  assert.equal(classifySportType(undefined), 'other');
  assert.equal(classifySportType(''), 'other');
});
