const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeBrandCalibration, calibratedE1RM } = require('../functions/brandCalibration');

const d = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('computeBrandCalibration returns nothing for an exercise logged on only one brand', () => {
  const lifts = [
    { date: d(10), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    { date: d(3), exercise: 'Lat Pulldown (Wide Grip)', kg: 62.5, reps: 8, machine: 'Life Fitness' },
  ];
  assert.deepEqual(computeBrandCalibration(lifts), {});
});

test('computeBrandCalibration ignores unbranded lifts entirely', () => {
  const lifts = [{ date: d(5), exercise: 'Barbell Bench Press', kg: 80, reps: 5 }];
  assert.deepEqual(computeBrandCalibration(lifts), {});
});

test('computeBrandCalibration finds a ratio between two brands logged close in time', () => {
  const lifts = [
    // Reference brand (more sessions): Life Fitness
    { date: d(30), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    { date: d(20), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    { date: d(10), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    // Technogym, one session close in time to a Life Fitness one, reading heavier for the same output
    { date: d(9), exercise: 'Lat Pulldown (Wide Grip)', kg: 70, reps: 8, machine: 'Technogym' },
  ];
  const table = computeBrandCalibration(lifts);
  const entry = table['Lat Pulldown (Wide Grip)'];
  assert.ok(entry, 'should produce a calibration entry for this exercise');
  assert.equal(entry.referenceBrand, 'Life Fitness', 'the more-logged brand should be the reference');
  assert.ok(entry.multipliers['Technogym'] < 1, 'Technogym reads heavier for the same output, so its multiplier should scale down toward reference');
});

test('computeBrandCalibration does not pair sessions further apart than the close window', () => {
  const lifts = [
    { date: d(200), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    { date: d(199), exercise: 'Lat Pulldown (Wide Grip)', kg: 60, reps: 8, machine: 'Life Fitness' },
    { date: d(1), exercise: 'Lat Pulldown (Wide Grip)', kg: 70, reps: 8, machine: 'Technogym' },
  ];
  const table = computeBrandCalibration(lifts);
  assert.equal(table['Lat Pulldown (Wide Grip)'], undefined, 'no pair within the close window, so no calibration should be produced');
});

test('calibratedE1RM returns the raw value unchanged with no calibration data', () => {
  assert.equal(calibratedE1RM(100, 'Some Exercise', 'Technogym', {}), 100);
  assert.equal(calibratedE1RM(100, 'Some Exercise', null, { 'Some Exercise': { referenceBrand: 'X', multipliers: {} } }), 100);
});

test('calibratedE1RM applies the multiplier for a non-reference brand', () => {
  const table = { 'Lat Pulldown (Wide Grip)': { referenceBrand: 'Life Fitness', multipliers: { Technogym: 0.85 } } };
  assert.equal(calibratedE1RM(100, 'Lat Pulldown (Wide Grip)', 'Technogym', table), 85);
  assert.equal(calibratedE1RM(100, 'Lat Pulldown (Wide Grip)', 'Life Fitness', table), 100, 'reference brand should never be rescaled');
});
