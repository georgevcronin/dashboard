const { test } = require('node:test');
const assert = require('node:assert/strict');
const { haversineMeters, findNearbyGyms, normalizeExerciseKey, GYM_NEARBY_RADIUS_M } = require('../functions/gyms');

test('haversineMeters: same point is zero distance', () => {
  assert.equal(haversineMeters(53.4808, -2.2426, 53.4808, -2.2426), 0);
});

test('haversineMeters: known distance is roughly correct (London to Manchester, ~262km)', () => {
  const d = haversineMeters(51.5074, -0.1278, 53.4808, -2.2426);
  assert.ok(d > 260000 && d < 265000, `expected ~262km, got ${d / 1000}km`);
});

test('findNearbyGyms: filters by radius and sorts closest-first', () => {
  const gyms = [
    { id: 'far', lat: 53.5, lng: -2.5 },
    { id: 'near', lat: 53.4809, lng: -2.2427 },
    { id: 'exact', lat: 53.4808, lng: -2.2426 },
  ];
  const result = findNearbyGyms(gyms, 53.4808, -2.2426, GYM_NEARBY_RADIUS_M);
  assert.deepEqual(result.map(g => g.id), ['exact', 'near']);
  assert.equal(result[0].distanceMeters, 0);
});

test('findNearbyGyms: empty when nothing in radius', () => {
  const gyms = [{ id: 'far', lat: 53.5, lng: -2.5 }];
  assert.deepEqual(findNearbyGyms(gyms, 53.4808, -2.2426, GYM_NEARBY_RADIUS_M), []);
});

test('normalizeExerciseKey: lowercases and trims', () => {
  assert.equal(normalizeExerciseKey('  Shoulder Press '), 'shoulder press');
});

test('normalizeExerciseKey: handles missing input', () => {
  assert.equal(normalizeExerciseKey(undefined), '');
});
