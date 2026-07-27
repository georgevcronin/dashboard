const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANGLES, PRESS_EMG, ROW_EMG, classifyMuscles, emgForAngle,
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD,
} = require('../functions/emgActivation');

test('ANGLES covers 0-180 in 15deg steps, matching every table key', () => {
  assert.deepEqual(ANGLES, [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]);
  for (const a of ANGLES) {
    assert.ok(a in PRESS_EMG, `PRESS_EMG missing angle ${a}`);
    assert.ok(a in ROW_EMG, `ROW_EMG missing angle ${a}`);
  }
});

test('emgForAngle returns the press table for pattern "press" and the row table for "row"', () => {
  assert.deepEqual(emgForAngle('press', 90), PRESS_EMG[90]);
  assert.deepEqual(emgForAngle('row', 90), ROW_EMG[90]);
});

test('emgForAngle returns null for an unknown pattern or angle', () => {
  assert.equal(emgForAngle('fly', 90), null);
  assert.equal(emgForAngle('press', 37), null, '37 is not one of the 15deg-step angles');
});

test('classifyMuscles sorts into primary (>=60), secondary (25-59), and excluded (<25)', () => {
  const { primary, secondary } = classifyMuscles({ a: 60, b: 59, c: 25, d: 24, e: 100 });
  assert.deepEqual(primary.sort(), ['a', 'e']);
  assert.deepEqual(secondary.sort(), ['b', 'c']);
  assert.ok(!primary.includes('d') && !secondary.includes('d'), 'below 25 should be excluded entirely');
});

test('classifyMuscles thresholds are exactly PRIMARY_THRESHOLD/SECONDARY_THRESHOLD, not hardcoded twice', () => {
  assert.equal(PRIMARY_THRESHOLD, 60);
  assert.equal(SECONDARY_THRESHOLD, 25);
});

test('a low-angle row (pull from below) classifies lats/teres-major as primary, rear-delt as excluded', () => {
  const { primary, secondary } = classifyMuscles(ROW_EMG[0]);
  assert.ok(primary.includes('lats') && primary.includes('teres-major'));
  assert.ok(!primary.includes('rear-delt') && !secondary.includes('rear-delt'), 'rear delt at 10% on a low pull should be excluded entirely');
});

test('an overhead row (pull from above) flips the primary muscles vs a low-angle row', () => {
  const low = classifyMuscles(ROW_EMG[0]).primary.sort();
  const overhead = classifyMuscles(ROW_EMG[180]).primary.sort();
  assert.notDeepEqual(low, overhead, 'the whole point of the angle picker is that different angles produce different primary muscles');
  assert.ok(overhead.includes('rear-delt') && overhead.includes('mid-traps'));
  assert.ok(!overhead.includes('lats'), 'lats drops out of primary by 180 (23%, well under the 60 threshold)');
});

test('a high-angle press (near overhead) classifies mid-delt/serratus as primary, chest as excluded', () => {
  const { primary, secondary } = classifyMuscles(PRESS_EMG[180]);
  assert.ok(primary.includes('mid-delt') && primary.includes('serratus'));
  assert.ok(!primary.includes('chest') && !secondary.includes('chest'), 'chest at ~9% overhead should be excluded entirely');
});

test('a low-angle press (arm at side) classifies biceps as secondary and excludes front-delt/chest entirely', () => {
  const { primary, secondary } = classifyMuscles(PRESS_EMG[0]);
  assert.ok(secondary.includes('biceps'), 'biceps at 40% with the arm at the side is real but not primary');
  assert.ok(!primary.includes('front-delt') && !secondary.includes('front-delt'), 'front delt at 15% with the arm at the side should be excluded entirely');
  assert.ok(!primary.includes('chest') && !secondary.includes('chest'), 'chest at 15% with the arm at the side should be excluded entirely');
});
