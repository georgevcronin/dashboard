const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ELBOW_ANGLES, ELBOW_EMG, ELBOW_SHOULDER_MODIFIER, ELBOW_SHOULDER_MODIFIER_ANGLES,
  elbowEmgForShoulderAngle,
} = require('../functions/movementEmg');

// EXERCISE_PARAMETERIZATION.md §20/§21: signed -90..+90, 0 = neutral,
// mapped onto ELBOW_SHOULDER_MODIFIER's raw 0/45/90/135/180 keys via
// raw = signed + 90.
test('elbowEmgForShoulderAngle at 0 (neutral/standing) leaves biceps/triceps essentially unchanged from the base ELBOW_EMG value', () => {
  const base = ELBOW_EMG[90];
  const out = elbowEmgForShoulderAngle(90, 0);
  assert.equal(out.biceps, base.biceps, 'raw=90 modifier is exactly 0 for every muscle, so neutral shoulder should be a true no-op');
  assert.equal(out.triceps, base.triceps);
});

test('elbowEmgForShoulderAngle at -90 (max shoulder extension, e.g. Decline Curl) nudges biceps up slightly and triceps down, damped per movementEmg.js\'s own reasoning', () => {
  const base = ELBOW_EMG[90];
  const out = elbowEmgForShoulderAngle(90, -90);
  // raw=0: biceps-long=+10, biceps-short=-8 -> average +1 (near-cancel, per
  // the file's own header comment on why this was left dormant).
  assert.equal(out.biceps, base.biceps + 1);
  // raw=0: triceps-long=-8, damped across 3 heads (2 of which don't move).
  assert.ok(Math.abs(out.triceps - (base.triceps - 8 / 3)) < 1e-9);
});

test('elbowEmgForShoulderAngle at +90 (max shoulder flexion, e.g. Overhead Cable Curl) nudges biceps down slightly and triceps up', () => {
  const base = ELBOW_EMG[90];
  const out = elbowEmgForShoulderAngle(90, 90);
  // raw=180: biceps-long=-12, biceps-short=+10 -> average -1.
  assert.equal(out.biceps, base.biceps - 1);
  // raw=180: triceps-long=+12, damped across 3 heads.
  assert.ok(Math.abs(out.triceps - (base.triceps + 12 / 3)) < 1e-9);
});

test('elbowEmgForShoulderAngle at +45 (e.g. Preacher/Machine Curl) applies the raw=135 modifier', () => {
  const base = ELBOW_EMG[60];
  const out = elbowEmgForShoulderAngle(60, 45);
  const mod = ELBOW_SHOULDER_MODIFIER[135];
  assert.ok(Math.abs(out.biceps - (base.biceps + (mod['biceps-long'] + mod['biceps-short']) / 2)) < 1e-9);
  assert.ok(Math.abs(out.triceps - (base.triceps + mod['triceps-long'] / 3)) < 1e-9);
});

test('elbowEmgForShoulderAngle snaps a shoulder angle to the nearest of the modifier\'s 5 sampled positions rather than requiring an exact grid value', () => {
  const nearZero = elbowEmgForShoulderAngle(90, -5); // raw=85, nearest is 90 (no-op)
  assert.equal(nearZero.biceps, ELBOW_EMG[90].biceps);
  const nearNeg90 = elbowEmgForShoulderAngle(90, -80); // raw=10, nearest is 0
  const exactNeg90 = elbowEmgForShoulderAngle(90, -90);
  assert.deepEqual(nearNeg90, exactNeg90);
});

test('elbowEmgForShoulderAngle snaps a non-grid elbow angle to the nearest ELBOW_ANGLES sample too', () => {
  const snapped = elbowEmgForShoulderAngle(92, 0);
  const exact = elbowEmgForShoulderAngle(90, 0);
  assert.deepEqual(snapped, exact);
});

test('elbowEmgForShoulderAngle defaults a missing/invalid shoulder angle to neutral (0)', () => {
  const base = ELBOW_EMG[90];
  assert.deepEqual(elbowEmgForShoulderAngle(90, null), { ...base });
  assert.deepEqual(elbowEmgForShoulderAngle(90, undefined), { ...base });
});

test('elbowEmgForShoulderAngle returns null for a missing/invalid elbow angle', () => {
  assert.equal(elbowEmgForShoulderAngle(null, 0), null);
  assert.equal(elbowEmgForShoulderAngle(undefined, 0), null);
});

test('elbowEmgForShoulderAngle never returns a negative muscle value', () => {
  for (const shoulderAngle of [-90, -45, 0, 45, 90]) {
    for (const elbowAngle of ELBOW_ANGLES) {
      const out = elbowEmgForShoulderAngle(elbowAngle, shoulderAngle);
      assert.ok(out.biceps >= 0 && out.triceps >= 0, `negative value at elbow=${elbowAngle} shoulder=${shoulderAngle}`);
    }
  }
});

test('ELBOW_SHOULDER_MODIFIER_ANGLES matches the modifier table\'s own keys', () => {
  assert.deepEqual(ELBOW_SHOULDER_MODIFIER_ANGLES, [0, 45, 90, 135, 180]);
  for (const a of ELBOW_SHOULDER_MODIFIER_ANGLES) assert.ok(a in ELBOW_SHOULDER_MODIFIER);
});
