const test = require('node:test');
const assert = require('node:assert');

const {
  estimateMaxHeartRate,
  calculateHRReserve,
  karvonen5Zones,
  karvonen3Zones,
  zonesWithPaces,
  prescribeWorkout,
} = require('../functions/runningPrescription');

test('Max HR estimation: uses measured if provided', () => {
  const measured = estimateMaxHeartRate(35, 195);
  assert.strictEqual(measured, 195, 'should use measured max HR');
});

test('Max HR estimation: estimates from age if not measured', () => {
  const estimated = estimateMaxHeartRate(35);
  // Astrand: 205 - (35/2) = 205 - 17.5 = 187.5 ≈ 188
  assert(estimated > 180 && estimated < 195, 'age-based estimate should be 180-195 for 35yo');
});

test('Max HR estimation: ages 50, 60 produce lower estimates', () => {
  const age50 = estimateMaxHeartRate(50);
  const age60 = estimateMaxHeartRate(60);
  assert(age50 > age60, 'older age should produce lower max HR estimate');
});

test('HR reserve: calculated correctly', () => {
  const reserve = calculateHRReserve(190, 60);
  assert.strictEqual(reserve, 130, 'reserve = max - resting');
});

test('Karvonen 5-zone: generates all 5 zones', () => {
  const zones = karvonen5Zones(190, 60);
  assert(zones.z1, 'should have z1');
  assert(zones.z2, 'should have z2');
  assert(zones.z3, 'should have z3');
  assert(zones.z4, 'should have z4');
  assert(zones.z5, 'should have z5');
});

test('Karvonen 5-zone: progressive HR increases', () => {
  const zones = karvonen5Zones(190, 60);
  assert(zones.z1.maxHR <= zones.z2.minHR, 'z1 max <= z2 min');
  assert(zones.z2.maxHR <= zones.z3.minHR, 'z2 max <= z3 min');
  assert(zones.z3.maxHR <= zones.z4.minHR, 'z3 max <= z4 min');
  assert(zones.z4.maxHR <= zones.z5.minHR, 'z4 max <= z5 min');
});

test('Karvonen 5-zone: realistic ranges', () => {
  const zones = karvonen5Zones(190, 60);
  // Z1 (50-60% of reserve): 60 + (130 × 0.5) to 60 + (130 × 0.6) = 125-138
  assert(zones.z1.minHR > 120 && zones.z1.minHR < 130, 'z1 min should be ~125');
  assert(zones.z1.maxHR > 135 && zones.z1.maxHR < 145, 'z1 max should be ~138');
});

test('Karvonen 5-zone: null when no max HR', () => {
  const zones = karvonen5Zones(null, 60);
  assert.strictEqual(zones, null, 'null max HR should return null');
});

test('Karvonen 3-zone: generates 3 zones', () => {
  const zones = karvonen3Zones(190, 60);
  assert(zones.z1, 'should have z1');
  assert(zones.z2, 'should have z2');
  assert(zones.z3, 'should have z3');
});

test('Karvonen 3-zone: progressive ranges', () => {
  const zones = karvonen3Zones(190, 60);
  assert(zones.z1.maxHR <= zones.z2.minHR, 'z1 max <= z2 min');
  assert(zones.z2.maxHR <= zones.z3.minHR, 'z2 max <= z3 min');
});

test('Zones with paces: includes HR ranges and pace info', () => {
  const paces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zones = zonesWithPaces(190, 50, paces, 60);
  assert(zones.z1, 'should have z1');
  assert(zones.z1.minHR, 'z1 should have minHR');
  assert(zones.z1.pace, 'z1 should have pace');
  assert(zones.z1.pace.includes('6.5'), 'z1 pace should be easy pace');
});

test('Zones with paces: null when missing data', () => {
  const zones = zonesWithPaces(null, 50, {}, 60);
  assert.strictEqual(zones, null, 'null max HR should return null');
});

test('Prescribe workout: easy session', () => {
  const workout = prescribeWorkout({
    sessionType: 'easy',
    maxHR: 190,
    vo2max: 50,
    vdotPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
    durationMin: 45,
    restingHR: 60,
  });

  assert(workout, 'should return workout prescription');
  assert.strictEqual(workout.sessionType, 'easy');
  assert.strictEqual(workout.zone, 'z1');
  assert(workout.minHR < workout.maxHR, 'min HR should be < max HR');
  assert(workout.pace, 'should include pace');
  assert.strictEqual(workout.duration, 45);
});

test('Prescribe workout: tempo session maps to z3', () => {
  const workout = prescribeWorkout({
    sessionType: 'tempo',
    maxHR: 190,
    vo2max: 50,
    vdotPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
    durationMin: 40,
    restingHR: 60,
  });

  assert.strictEqual(workout.zone, 'z3', 'tempo should map to z3');
  assert(workout.minHR > 150, 'z3 should have elevated HR');
});

test('Prescribe workout: interval session maps to z4', () => {
  const workout = prescribeWorkout({
    sessionType: 'interval',
    maxHR: 190,
    vo2max: 50,
    vdotPaces: {
      ePace: 6.5,
      mPace: 5.3,
      tPace: 4.0,
      iPace: 3.2,
      rPace: 2.8,
    },
    durationMin: 35,
    restingHR: 60,
  });

  assert.strictEqual(workout.zone, 'z4', 'interval should map to z4');
  assert(workout.minHR > 160, 'z4 should have high HR');
});

test('Prescribe workout: duration range includes min/target/max', () => {
  const workout = prescribeWorkout({
    sessionType: 'easy',
    maxHR: 190,
    vo2max: 50,
    vdotPaces: { ePace: 6.5, mPace: 5.3, tPace: 4.0, iPace: 3.2, rPace: 2.8 },
    durationMin: 50,
    restingHR: 60,
  });

  assert(workout.durationRange.min < workout.durationRange.target, 'min < target');
  assert(workout.durationRange.target < workout.durationRange.max, 'target < max');
  assert.strictEqual(workout.durationRange.target, 50);
});

test('Prescribe workout: null for invalid session type', () => {
  const workout = prescribeWorkout({
    sessionType: 'invalid',
    maxHR: 190,
    vo2max: 50,
    vdotPaces: { ePace: 6.5, mPace: 5.3, tPace: 4.0, iPace: 3.2, rPace: 2.8 },
    durationMin: 45,
    restingHR: 60,
  });

  assert.strictEqual(workout, null, 'invalid session type should return null');
});

test('Prescribe workout: null when missing max HR', () => {
  const workout = prescribeWorkout({
    sessionType: 'easy',
    maxHR: null,
    vo2max: 50,
    vdotPaces: { ePace: 6.5 },
    durationMin: 45,
  });

  assert.strictEqual(workout, null, 'missing max HR should return null');
});

test('HR zones account for resting HR', () => {
  const lowResting = karvonen5Zones(190, 50);
  const highResting = karvonen5Zones(190, 70);

  // Same zone, higher resting HR should shift all zones up
  assert(highResting.z1.minHR > lowResting.z1.minHR, 'higher RHR should increase zone HR minimums');
});
