const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANGLES, PRESS_EMG, ROW_EMG, FLY_EMG, CURL_EMG, EXTENSION_EMG, LEG_CURL_EMG, HYPEREXTENSION_EMG, classifyMuscles, emgForAngle,
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD, muscleEnvelope, idealAngleForMuscle,
  PRESS_FRONTAL_EMG, ROW_FRONTAL_EMG, FRONTAL_ANGLES, frontalCueForProfile,
  PRESS_GRIP_EMG, ROW_GRIP_EMG, GRIP_ANGLES, gripCueForProfile, GRIP_ANGLES_BY_EQUIPMENT,
} = require('../functions/emgActivation');

// Full 0-180/15°-step tables only -- HYPEREXTENSION_EMG deliberately isn't
// one of these (see its own dedicated tests below): it only has 2 real
// keys (45, 90), not the usual 13, because only 2 real device types exist
// for that movement.
const ALL_PATTERN_TABLES = [['press', PRESS_EMG], ['row', ROW_EMG], ['fly', FLY_EMG], ['curl', CURL_EMG], ['extension', EXTENSION_EMG], ['leg-curl', LEG_CURL_EMG]];

function maxAcrossAngles(table, muscle) {
  return Math.max(...ANGLES.map(a => table[a]?.[muscle] ?? -Infinity));
}

test('muscleEnvelope: every muscle it includes actually crosses the right threshold at SOME angle in the pattern\'s table', () => {
  for (const [pattern, table] of ALL_PATTERN_TABLES) {
    const { primary, secondary } = muscleEnvelope(pattern);
    for (const m of primary) assert.ok(maxAcrossAngles(table, m) >= PRIMARY_THRESHOLD, `${pattern}/${m} in primary should peak >= ${PRIMARY_THRESHOLD}`);
    for (const m of secondary) assert.ok(maxAcrossAngles(table, m) >= SECONDARY_THRESHOLD && maxAcrossAngles(table, m) < PRIMARY_THRESHOLD, `${pattern}/${m} in secondary should peak in [${SECONDARY_THRESHOLD}, ${PRIMARY_THRESHOLD})`);
  }
});

test('muscleEnvelope: a muscle that never crosses SECONDARY_THRESHOLD anywhere in the table is excluded entirely', () => {
  // Fly's biceps peaks at 12% (see FLY_EMG) -- well under SECONDARY_THRESHOLD.
  const { primary, secondary } = muscleEnvelope('fly');
  assert.ok(!primary.includes('biceps') && !secondary.includes('biceps'), 'fly biceps never reaches 25% anywhere, should be excluded from both');
});

test('muscleEnvelope returns empty arrays for an unknown pattern', () => {
  assert.deepEqual(muscleEnvelope('squat'), { primary: [], secondary: [] });
});

test('idealAngleForMuscle finds the angle that maximizes a muscle\'s activation for a pattern', () => {
  for (const [pattern, table] of ALL_PATTERN_TABLES) {
    for (const muscle of new Set(ANGLES.flatMap(a => Object.keys(table[a])))) {
      const angle = idealAngleForMuscle(pattern, muscle);
      assert.equal(table[angle][muscle], maxAcrossAngles(table, muscle), `${pattern}/${muscle}: angle ${angle} should be the true argmax`);
    }
  }
});

test('idealAngleForMuscle returns null for a muscle the pattern never tracks, or an unknown pattern', () => {
  assert.equal(idealAngleForMuscle('row', 'chest'), null);
  assert.equal(idealAngleForMuscle('squat', 'chest'), null);
});

test('ANGLES covers 0-180 in 15deg steps, matching every table key', () => {
  assert.deepEqual(ANGLES, [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]);
  for (const a of ANGLES) {
    for (const [pattern, table] of ALL_PATTERN_TABLES) assert.ok(a in table, `${pattern} table missing angle ${a}`);
  }
});

test('emgForAngle returns the right table for every known pattern', () => {
  for (const [pattern, table] of ALL_PATTERN_TABLES) assert.deepEqual(emgForAngle(pattern, 90), table[90]);
});

test('emgForAngle returns null for an unknown pattern or angle', () => {
  assert.equal(emgForAngle('squat', 90), null);
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

test('HYPEREXTENSION_EMG has exactly 2 keys (45, 90) -- deliberately NOT the usual 15deg/0-180 grid, since only 2 real device types exist', () => {
  assert.deepEqual(Object.keys(HYPEREXTENSION_EMG).map(Number).sort((a, b) => a - b), [45, 90]);
});

test('emgForAngle("hyperextension", ...) only responds to the 2 real device angles, null for anything on the usual grid', () => {
  assert.deepEqual(emgForAngle('hyperextension', 45), HYPEREXTENSION_EMG[45]);
  assert.deepEqual(emgForAngle('hyperextension', 90), HYPEREXTENSION_EMG[90]);
  for (const a of ANGLES) {
    if (a === 45 || a === 90) continue;
    assert.equal(emgForAngle('hyperextension', a), null, `hyperextension has no real device at ${a}°`);
  }
});

test('muscleEnvelope/idealAngleForMuscle handle HYPEREXTENSION_EMG\'s sparse 2-key table correctly, without needing special-casing', () => {
  const { primary, secondary } = muscleEnvelope('hyperextension');
  assert.ok(primary.includes('erectors') && primary.includes('hamstrings'));
  assert.ok(secondary.includes('glutes'));
  assert.equal(idealAngleForMuscle('hyperextension', 'hamstrings'), 45, '45° has more hamstring involvement per HYPEREXTENSION_EMG');
  assert.equal(idealAngleForMuscle('hyperextension', 'glutes'), 90, '90° has more glute involvement per HYPEREXTENSION_EMG');
});
