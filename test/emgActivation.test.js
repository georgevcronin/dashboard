const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANGLES, PRESS_EMG, ROW_EMG, classifyMuscles, emgForAngle,
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD,
  PRESS_FRONTAL_EMG, ROW_FRONTAL_EMG, FRONTAL_ANGLES, frontalCueForProfile,
  PRESS_GRIP_EMG, ROW_GRIP_EMG, GRIP_ANGLES, gripCueForProfile, GRIP_ANGLES_BY_EQUIPMENT,
  GRIP_WIDTHS, GRIP_WIDTH_LABELS, ROW_GRIP_WIDTH_EMG, GRIP_WIDTH_BY_EQUIPMENT,
  applyGripRotationModifier, applyGripWidthModifier,
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

test('FRONTAL_ANGLES covers 0-90 in 15deg steps, matching both frontal-plane tables', () => {
  assert.deepEqual(FRONTAL_ANGLES, [0, 15, 30, 45, 60, 75, 90]);
  for (const a of FRONTAL_ANGLES) {
    assert.ok(a in PRESS_FRONTAL_EMG, `PRESS_FRONTAL_EMG missing angle ${a}`);
    assert.ok(a in ROW_FRONTAL_EMG, `ROW_FRONTAL_EMG missing angle ${a}`);
  }
});

test('frontalCueForProfile picks the exercise\'s own dominant non-accessory muscle, ignoring biceps/triceps/brachioradialis', () => {
  // At row angle 90, biceps (80) actually outranks every back muscle in the
  // raw sagittal numbers -- the cue should still anchor on mid-delt (77),
  // the highest-ranked genuine back/shoulder muscle, not biceps.
  const cue = frontalCueForProfile('row', ROW_EMG[90]);
  assert.ok(cue != null);
  assert.equal(cue.muscle, 'mid-delt');
});

test('frontalCueForProfile returns the frontal angle where that muscle peaks', () => {
  const cue = frontalCueForProfile('row', ROW_EMG[90]);
  // mid-delt is monotonically increasing across ROW_FRONTAL_EMG, peaking at 90.
  assert.equal(cue.angle, 90);
});

test('frontalCueForProfile gives a different cue for a lats-dominant low row than a rear-delt-dominant overhead row', () => {
  const lowRow = frontalCueForProfile('row', ROW_EMG[0]); // lats-dominant
  const overheadRow = frontalCueForProfile('row', ROW_EMG[180]); // rear-delt-dominant
  assert.equal(lowRow.muscle, 'lats');
  assert.equal(overheadRow.muscle, 'rear-delt');
  assert.notEqual(lowRow.angle, overheadRow.angle, 'a lats-biased row and a rear-delt-biased row should recommend different elbow-flare angles');
});

test('frontalCueForProfile works for press too, anchoring on front-delt/mid-delt rather than triceps/biceps', () => {
  const cue = frontalCueForProfile('press', PRESS_EMG[150]); // mid-delt-dominant angle
  assert.ok(cue != null);
  assert.equal(cue.muscle, 'mid-delt');
});

test('frontalCueForProfile returns null for an unrecognized pattern', () => {
  assert.equal(frontalCueForProfile('fly', ROW_EMG[90]), null);
});

test('GRIP_ANGLES covers 0-180 in the 3 measured anchors + 2 interpolated midpoints, matching both grip tables', () => {
  assert.deepEqual(GRIP_ANGLES, [0, 45, 90, 135, 180]);
  for (const a of GRIP_ANGLES) {
    assert.ok(a in PRESS_GRIP_EMG, `PRESS_GRIP_EMG missing angle ${a}`);
    assert.ok(a in ROW_GRIP_EMG, `ROW_GRIP_EMG missing angle ${a}`);
  }
});

test('gripCueForProfile picks biceps for a biceps-heavy row (largest swing across grip rotation) and recommends a supinated grip', () => {
  // Row at 90 sagittal: biceps=80 (>=25, tracked, and has the largest grip
  // swing of any muscle this row meaningfully trains -- lats/rear-delt are
  // also present but swing far less across GRIP_ANGLES).
  const cue = gripCueForProfile('row', ROW_EMG[90]);
  assert.ok(cue != null);
  assert.equal(cue.muscle, 'biceps');
  assert.equal(cue.angle, 180);
  assert.equal(cue.grip, 'supinated (underhand)');
});

test('gripCueForProfile picks lower-traps for a lower-trap-dominant row and recommends a pronated grip (opposite direction from biceps)', () => {
  // Row at 180 (overhead pull): lower-traps isn't in ROW_EMG's own key set
  // (it's called 'mid-traps' there), so use a synthetic profile isolating
  // lower-traps as the only grip-tracked, meaningfully-trained muscle.
  const cue = gripCueForProfile('row', { 'lower-traps': 80, biceps: 10 });
  assert.ok(cue != null);
  assert.equal(cue.muscle, 'lower-traps');
  assert.equal(cue.angle, 0);
  assert.equal(cue.grip, 'pronated (overhand)');
});

test('gripCueForProfile returns null when nothing meaningfully swings across grip rotation (e.g. a front-delt/triceps-only profile)', () => {
  // front-delt swings 70->60 (range 10, right at the cutoff) and triceps
  // swings 65->63 (range 2) -- neither should trigger since the function
  // requires range >= 10 AND front-delt's exact range sits at the boundary.
  const cue = gripCueForProfile('press', { triceps: 65 });
  assert.equal(cue, null, 'triceps alone barely moves across grip rotation, not worth a cue');
});

test('gripCueForProfile ignores a muscle the exercise barely trains (<SECONDARY_THRESHOLD), even if that muscle swings a lot elsewhere', () => {
  const cue = gripCueForProfile('row', { biceps: 10, lats: 90 });
  assert.ok(cue == null || cue.muscle !== 'biceps', 'biceps at only 10% should not be eligible to drive the cue');
});

test('gripCueForProfile returns null for an unrecognized pattern', () => {
  assert.equal(gripCueForProfile('fly', ROW_EMG[90]), null);
});

test('GRIP_ANGLES_BY_EQUIPMENT restricts barbell to pronated/supinated only, machine to none, dumbbell/cable to the full range', () => {
  assert.deepEqual(GRIP_ANGLES_BY_EQUIPMENT.barbell, [0, 180]);
  assert.deepEqual(GRIP_ANGLES_BY_EQUIPMENT.machine, []);
  assert.deepEqual(GRIP_ANGLES_BY_EQUIPMENT.dumbbell, GRIP_ANGLES);
  assert.deepEqual(GRIP_ANGLES_BY_EQUIPMENT.cable, GRIP_ANGLES);
});

test('gripCueForProfile with a barbell\'s restricted [0,180] range still recommends supinated for a biceps-dominant row', () => {
  const cue = gripCueForProfile('row', ROW_EMG[90], GRIP_ANGLES_BY_EQUIPMENT.barbell);
  assert.ok(cue != null);
  assert.equal(cue.muscle, 'biceps');
  assert.equal(cue.angle, 180); // biceps peaks at 180 among just [0, 180] too, same as the full range
});

test('gripCueForProfile returns null for machine equipment -- no grip choice exists to recommend', () => {
  const cue = gripCueForProfile('row', ROW_EMG[90], GRIP_ANGLES_BY_EQUIPMENT.machine);
  assert.equal(cue, null);
});

test('gripCueForProfile re-optimizes within the restricted range rather than snapping the full-range answer to the nearest achievable point', () => {
  // Front-delt genuinely peaks at 90 (neutral) across the FULL grip range,
  // but a barbell can't do neutral at all -- restricted to [0,180], the
  // right answer is whichever of THOSE two is actually higher for
  // front-delt (70 at 0 vs 60 at 180), not an arbitrary nearest-angle snap.
  const profile = { 'front-delt': 99, biceps: 10 }; // biceps kept below SECONDARY_THRESHOLD so it can't win the pick
  const fullRange = gripCueForProfile('press', profile);
  const barbellRange = gripCueForProfile('press', profile, GRIP_ANGLES_BY_EQUIPMENT.barbell);
  assert.equal(fullRange.angle, 90, 'full range should find front-delt\'s true peak at neutral');
  assert.equal(barbellRange.angle, 0, 'barbell-restricted should pick 0 (70) over 180 (60), not snap to the nearest of 90');
});

test('gripCueForProfile defaults to the full GRIP_ANGLES range when no availableAngles is passed (backward compatible)', () => {
  const withDefault = gripCueForProfile('row', ROW_EMG[90]);
  const withExplicitFull = gripCueForProfile('row', ROW_EMG[90], GRIP_ANGLES);
  assert.deepEqual(withDefault, withExplicitFull);
});

// ---------------------------------------------------------------------
// applyGripRotationModifier / applyGripWidthModifier -- rotation and width
// promoted from advisory-cue-only to real modifiers on a logged set's
// credited weight vector.

test('applyGripRotationModifier leaves muscles the grip table does not track completely untouched', () => {
  const base = PRESS_EMG[90]; // front-delt, mid-delt, chest, biceps, triceps, serratus, lower-traps
  const modified = applyGripRotationModifier('press', base, 180);
  assert.equal(modified['mid-delt'], base['mid-delt']);
  assert.equal(modified.chest, base.chest);
  assert.equal(modified.serratus, base.serratus);
});

test('applyGripRotationModifier nudges a tracked-and-in-base muscle up/down from its own grip-table mean, not to the raw grip-table value', () => {
  const base = { biceps: 50 }; // synthetic, isolates the delta math
  const meanAcrossGrip = GRIP_ANGLES.reduce((s, a) => s + PRESS_GRIP_EMG[a].biceps, 0) / GRIP_ANGLES.length;
  const atSupinated = applyGripRotationModifier('press', base, 180);
  assert.equal(atSupinated.biceps, Math.max(0, 50 + (PRESS_GRIP_EMG[180].biceps - meanAcrossGrip)));
  assert.notEqual(atSupinated.biceps, PRESS_GRIP_EMG[180].biceps, 'should not just overwrite with the raw grip-table value');
});

test('applyGripRotationModifier credits a muscle the sagittal table never tracked at all (brachioradialis for press) directly from the grip table', () => {
  const base = PRESS_EMG[90];
  assert.ok(!('brachioradialis' in base));
  const modified = applyGripRotationModifier('press', base, 90);
  assert.equal(modified.brachioradialis, PRESS_GRIP_EMG[90].brachioradialis);
});

test('applyGripRotationModifier is a no-op (returns baseWeights) for an unrecognized pattern, null rotation, or unknown angle', () => {
  const base = ROW_EMG[90];
  assert.equal(applyGripRotationModifier('fly', base, 90), base);
  assert.equal(applyGripRotationModifier('row', base, null), base);
  assert.equal(applyGripRotationModifier('row', base, 37), base);
});

test('applyGripRotationModifier never produces a negative credited weight', () => {
  const base = { biceps: 1 }; // small enough that a big downward nudge could go negative without the floor
  const modified = applyGripRotationModifier('row', base, 0); // pronated: biceps grip value is the lowest of the table
  assert.ok(modified.biceps >= 0);
});

test('GRIP_WIDTHS / GRIP_WIDTH_LABELS / ROW_GRIP_WIDTH_EMG all agree on the same three keys', () => {
  assert.deepEqual(GRIP_WIDTHS, ['close', 'medium', 'wide']);
  for (const w of GRIP_WIDTHS) {
    assert.ok(w in GRIP_WIDTH_LABELS, `GRIP_WIDTH_LABELS missing ${w}`);
    assert.ok(w in ROW_GRIP_WIDTH_EMG, `ROW_GRIP_WIDTH_EMG missing ${w}`);
  }
});

test('ROW_GRIP_WIDTH_EMG tracks exactly lats/rear-delt/rhomboids/biceps at every width', () => {
  const expected = ['lats', 'rear-delt', 'rhomboids', 'biceps'].sort();
  for (const w of GRIP_WIDTHS) {
    assert.deepEqual(Object.keys(ROW_GRIP_WIDTH_EMG[w]).sort(), expected);
  }
});

test('ROW_GRIP_WIDTH_EMG: close grip favors lats over wide, wide favors rhomboids over close (Padovan et al. narrow-vs-wide seated row direction)', () => {
  assert.ok(ROW_GRIP_WIDTH_EMG.close.lats > ROW_GRIP_WIDTH_EMG.wide.lats);
  assert.ok(ROW_GRIP_WIDTH_EMG.wide.rhomboids > ROW_GRIP_WIDTH_EMG.close.rhomboids);
});

test('GRIP_WIDTH_BY_EQUIPMENT scopes width to barbell/machine only, not dumbbell/cable', () => {
  assert.deepEqual(GRIP_WIDTH_BY_EQUIPMENT.barbell, GRIP_WIDTHS);
  assert.deepEqual(GRIP_WIDTH_BY_EQUIPMENT.machine, GRIP_WIDTHS);
  assert.deepEqual(GRIP_WIDTH_BY_EQUIPMENT.dumbbell, []);
  assert.deepEqual(GRIP_WIDTH_BY_EQUIPMENT.cable, []);
});

test('applyGripWidthModifier leaves an untracked muscle (e.g. mid-traps) completely untouched', () => {
  const base = ROW_EMG[90];
  const modified = applyGripWidthModifier(base, 'wide');
  assert.equal(modified['mid-traps'], base['mid-traps']);
  assert.equal(modified['teres-major'], base['teres-major']);
});

test('applyGripWidthModifier nudges lats down for a wide grip and up for a close grip relative to a shared base', () => {
  const base = ROW_EMG[90];
  const close = applyGripWidthModifier(base, 'close');
  const wide = applyGripWidthModifier(base, 'wide');
  assert.ok(close.lats > base.lats, 'close grip should push lats above the plain sagittal baseline');
  assert.ok(wide.lats < base.lats, 'wide grip should push lats below the plain sagittal baseline');
  assert.ok(close.lats > wide.lats);
});

test('applyGripWidthModifier is a no-op for an unrecognized width key or missing base weights', () => {
  const base = ROW_EMG[90];
  assert.equal(applyGripWidthModifier(base, 'super-wide'), base);
  assert.equal(applyGripWidthModifier(null, 'wide'), null);
});

test('applyGripWidthModifier never produces a negative credited weight', () => {
  const base = { 'rear-delt': 1 };
  const modified = applyGripWidthModifier(base, 'close'); // close grip is rear-delt's lowest column
  assert.ok(modified['rear-delt'] >= 0);
});

test('rotation and width modifiers compose additively without interfering with each other', () => {
  const base = ROW_EMG[90];
  const rotationOnly = applyGripRotationModifier('row', base, 180); // touches biceps/brachioradialis/lats/lower-traps/rear-delt
  const both = applyGripWidthModifier(rotationOnly, 'wide'); // additionally touches lats/rear-delt/rhomboids/biceps
  // rhomboids is width-only (not in ROW_GRIP_EMG at all) -- rotation alone
  // must leave it untouched, width must still move it.
  assert.equal(rotationOnly.rhomboids, base.rhomboids);
  assert.notEqual(both.rhomboids, base.rhomboids);
  // lower-traps is rotation-only (not in ROW_GRIP_WIDTH_EMG at all) -- width
  // must leave whatever rotation already set it to untouched.
  assert.equal(both['lower-traps'], rotationOnly['lower-traps']);
  // lats is touched by both axes -- the combined value should differ from
  // applying rotation alone, since width layers its own additional nudge.
  assert.notEqual(both.lats, rotationOnly.lats);
});
