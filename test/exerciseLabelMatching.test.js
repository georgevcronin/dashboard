const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  matchExerciseName, matchPressLabel, matchRowLabel, ROW_PULLDOWN_ANGLE_THRESHOLD,
} = require('../functions/exerciseLabelMatching');

// §14's exact resolved table.
test('matchPressLabel reproduces §14\'s label table at every named grid point', () => {
  assert.equal(matchPressLabel({ angle: -90 }), 'Dip / Tricep Press');
  assert.equal(matchPressLabel({ angle: -75 }), 'Dip / Tricep Press');
  assert.equal(matchPressLabel({ angle: -60 }), 'Dip / Tricep Press');
  assert.equal(matchPressLabel({ angle: -45 }), 'Decline Press');
  assert.equal(matchPressLabel({ angle: -30 }), 'Decline Press');
  assert.equal(matchPressLabel({ angle: -15 }), 'Decline Press');
  assert.equal(matchPressLabel({ angle: 0 }), 'Bench Press');
  assert.equal(matchPressLabel({ angle: 15 }), 'Incline Press');
  assert.equal(matchPressLabel({ angle: 30 }), 'Incline Press');
  assert.equal(matchPressLabel({ angle: 45 }), 'Incline Shoulder Press');
});

test('matchPressLabel at +60 and above reads Stance/Support, not just angle', () => {
  assert.equal(matchPressLabel({ angle: 60, stance: 'standing' }), 'Overhead Press');
  assert.equal(matchPressLabel({ angle: 75, stance: 'standing' }), 'Overhead Press');
  assert.equal(matchPressLabel({ angle: 90, stance: 'standing' }), 'Overhead Press');
  assert.equal(matchPressLabel({ angle: 60, stance: 'seated' }), 'Shoulder Press');
  assert.equal(matchPressLabel({ angle: 90, stance: 'seated' }), 'Shoulder Press');
  // No stance given -> standing is the unmarked/default case.
  assert.equal(matchPressLabel({ angle: 75 }), 'Overhead Press');
});

test('matchPressLabel defaults to Bench Press for a missing/invalid angle', () => {
  assert.equal(matchPressLabel({}), 'Bench Press');
  assert.equal(matchPressLabel(), 'Bench Press');
  assert.equal(matchPressLabel({ angle: null }), 'Bench Press');
});

test('matchPressLabel resolves any continuous angle, not just 15° grid points, via the midpoint boundaries', () => {
  assert.equal(matchPressLabel({ angle: -53 }), 'Dip / Tricep Press');
  assert.equal(matchPressLabel({ angle: -52 }), 'Decline Press');
  assert.equal(matchPressLabel({ angle: -8 }), 'Decline Press');
  assert.equal(matchPressLabel({ angle: -7 }), 'Bench Press');
  assert.equal(matchPressLabel({ angle: 7 }), 'Bench Press');
  assert.equal(matchPressLabel({ angle: 8 }), 'Incline Press');
  assert.equal(matchPressLabel({ angle: 38 }), 'Incline Shoulder Press');
  assert.equal(matchPressLabel({ angle: 53, stance: 'standing' }), 'Overhead Press');
});

// §15: Row/Pulldown/Pull-up boundary.
test('matchRowLabel reads Row below the pulldown threshold regardless of equipment', () => {
  assert.equal(matchRowLabel({ angle: 0, equipment: 'Cable' }), 'Row');
  assert.equal(matchRowLabel({ angle: 90, equipment: 'Machine' }), 'Row');
  assert.equal(matchRowLabel({ angle: 105, equipment: 'Barbell' }), 'Row');
  assert.equal(matchRowLabel({ angle: 105, equipment: 'Bodyweight' }), 'Row');
});

test('matchRowLabel reads Lat Pulldown / Pull-up at and above the threshold, split by equipment', () => {
  assert.equal(ROW_PULLDOWN_ANGLE_THRESHOLD, 120);
  assert.equal(matchRowLabel({ angle: 120, equipment: 'Machine' }), 'Lat Pulldown');
  assert.equal(matchRowLabel({ angle: 135, equipment: 'Cable' }), 'Lat Pulldown');
  assert.equal(matchRowLabel({ angle: 135, equipment: 'Bodyweight' }), 'Pull-up');
  assert.equal(matchRowLabel({ angle: 165, equipment: 'Bodyweight' }), 'Pull-up');
  assert.equal(matchRowLabel({ angle: 180, equipment: 'Machine' }), 'Lat Pulldown');
});

test('matchRowLabel is case-insensitive on equipment and defaults sensibly for missing input', () => {
  assert.equal(matchRowLabel({ angle: 150, equipment: 'bodyweight' }), 'Pull-up');
  assert.equal(matchRowLabel({}), 'Row');
  assert.equal(matchRowLabel(), 'Row');
});

test('matchExerciseName dispatches on pattern', () => {
  assert.equal(matchExerciseName('press', { angle: 0 }), 'Bench Press');
  assert.equal(matchExerciseName('press', { angle: 75, stance: 'seated' }), 'Shoulder Press');
  assert.equal(matchExerciseName('row', { angle: 150, equipment: 'Cable' }), 'Lat Pulldown');
  assert.equal(matchExerciseName('curl', { angle: 0 }), null, 'no table for other patterns yet');
});
