const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_EMG_PROFILES, emgProfileForExercise, benchPressEmgProfileForAngle } = require('../functions/exerciseEmgProfiles');
const { EXERCISE_DB } = require('../functions/exerciseDb');
const { ALL_MUSCLES } = require('../functions/muscleTaxonomy');

test('every curated profile key matches a real exerciseDb.js name exactly', () => {
  const dbNames = new Set(EXERCISE_DB.map(e => e.name.toLowerCase()));
  const missing = Object.keys(EXERCISE_EMG_PROFILES).filter(n => !dbNames.has(n));
  assert.deepEqual(missing, [], 'every profile key should be a real, exact exerciseDb.js name');
});

test('every muscle referenced in a curated profile is a real taxonomy muscle', () => {
  const known = new Set(ALL_MUSCLES);
  const unknown = [];
  for (const [name, weights] of Object.entries(EXERCISE_EMG_PROFILES)) {
    for (const m of Object.keys(weights)) {
      if (!known.has(m)) unknown.push(`${name}: ${m}`);
    }
  }
  assert.deepEqual(unknown, [], 'no curated profile should reference a muscle outside the real 31-muscle taxonomy');
});

test('emgProfileForExercise is case-insensitive and returns null for anything uncurated', () => {
  assert.deepEqual(emgProfileForExercise('Back Squat'), emgProfileForExercise('back squat'));
  assert.equal(emgProfileForExercise('Tibialis Raise (Wall Sit)'), null, 'no dorsiflexion axis exists in the source literature at all');
  assert.equal(emgProfileForExercise(''), null);
});

test('a deeper squat variant credits glutes/adductors more than a shallower one (Leg Press vs Jump Squat)', () => {
  const deep = emgProfileForExercise('Leg Press');
  const shallow = emgProfileForExercise('Jump Squat');
  assert.ok(deep.glutes > shallow.glutes, 'deeper squat-pattern exercises should credit glutes more, matching the real hip-angle relationship');
});

test('curl-pattern exercises credit biceps/brachialis/brachioradialis identically (same-shape proxy, documented)', () => {
  const curl = emgProfileForExercise('Barbell Curl');
  assert.equal(curl.biceps, curl.brachialis);
  assert.equal(curl.biceps, curl.brachioradialis);
});

test('extension-pattern (tricep) exercises only credit triceps, not biceps', () => {
  const pushdown = emgProfileForExercise('Cable Tricep Pushdown (Bar)');
  assert.ok('triceps' in pushdown);
  assert.ok(!('biceps' in pushdown));
});

test('leg curl exercises credit hamstrings only, from the knee-flexion table', () => {
  const legCurl = emgProfileForExercise('Seated Leg Curl');
  assert.deepEqual(Object.keys(legCurl), ['hamstrings']);
});

test('incline bench press credits front-delt/mid-delt higher and chest lower than flat bench press (phase 4)', () => {
  const flat = emgProfileForExercise('Barbell Bench Press');
  const incline = emgProfileForExercise('Incline Barbell Bench Press');
  assert.ok(incline['front-delt'] > flat['front-delt']);
  assert.ok(incline.chest < flat.chest);
});

test('a wide/high-pull row credits rear-delt/rhomboids over lats, unlike a bent-over row (phase 4)', () => {
  const wide = emgProfileForExercise('Wide-Grip Cable Row');
  const bentOver = emgProfileForExercise('Barbell Row (Overhand / Pendlay)');
  assert.ok(wide['rear-delt'] > wide.lats);
  assert.ok(bentOver.lats > bentOver['rear-delt']);
});

test('exercises already covered by the athlete\'s own exerciseAngles.js mapping are not shadowed by a phase 4 default', () => {
  assert.equal(emgProfileForExercise('Machine Shoulder Press'), null);
  assert.equal(emgProfileForExercise('JM Press'), null);
  assert.equal(emgProfileForExercise('Chest-Supported Barbell Row'), null);
});

test('Tibialis Raise (Wall Sit) remains uncurated -- no dorsiflexion literature axis exists at all', () => {
  assert.equal(emgProfileForExercise('Tibialis Raise (Wall Sit)'), null);
});

test('phase 6: shrugs are curated from movementEmg.js\'s real scapular-elevation table (section 21), and all three read numerically identical since none of exerciseDb.js\'s variants differ in bar path', () => {
  const barbell = emgProfileForExercise('Barbell Shrug');
  const dumbbell = emgProfileForExercise('Dumbbell Shrug');
  const cable = emgProfileForExercise('Cable Shrug');
  assert.ok(barbell.traps > barbell['mid-traps'], 'a vertical shrug should be traps-dominant, not retraction-dominant');
  assert.ok(!('levator-scapulae' in barbell), 'levator scapulae has no taxonomy home and must not be invented as a new key');
  assert.deepEqual(barbell, dumbbell);
  assert.deepEqual(barbell, cable);
});

test('loaded carries and Tibialis Raise (ATG Sled Push) were removed entirely, not just left uncurated', () => {
  const { EXERCISE_DB } = require('../functions/exerciseDb');
  const names = new Set(EXERCISE_DB.map(e => e.name));
  for (const name of ['Farmer\'s Carry', 'Suitcase Carry', 'Goblet Carry', 'Tibialis Raise (ATG Sled Push)']) {
    assert.ok(!names.has(name), `${name} should no longer be in exerciseDb.js`);
  }
});

test('phase 5: fly-pattern exercises credit chest only, from PRESS_EMG\'s own peak chest value', () => {
  const fly = emgProfileForExercise('Cable Crossover');
  assert.deepEqual(Object.keys(fly), ['chest']);
});

test('phase 5: leg raises now credit abs (the real primary mover) by layering CORE_ANTIEXT_EMG under HIP_FLEXION_EMG, and get harder in the expected order', () => {
  const lying = emgProfileForExercise('Lying Leg Raise');
  const incline = emgProfileForExercise('Incline Bench Leg Raise');
  const hanging = emgProfileForExercise('Hanging Leg Raise');
  assert.ok('abs' in lying && 'hip-flexors' in lying);
  assert.ok(lying.abs < incline.abs && incline.abs < hanging.abs);
});

test('phase 5: face pull credits rotator-cuff (exerciseDb.js\'s co-primary tag), unlike a plain high row', () => {
  const facePull = emgProfileForExercise('Face Pull');
  assert.ok('rotator-cuff' in facePull);
});

test('phase 5: hammer curl and close-grip bench press are curated but numerically identical to their standard-grip counterparts (documented axis limitation)', () => {
  assert.deepEqual(emgProfileForExercise('Hammer Curl'), emgProfileForExercise('Dumbbell Curl (Standing)'));
  assert.deepEqual(emgProfileForExercise('Close-Grip Bench Press'), emgProfileForExercise('Barbell Bench Press'));
});

test('Kelso Shrug variants shift from lat/teres-major-dominant (low pulley) to rear-delt/mid-traps-dominant (high pulley), and never carry biceps/brachioradialis (straight-arm)', () => {
  const low = emgProfileForExercise('Kelso Shrug (Low Pulley)');
  const high = emgProfileForExercise('Kelso Shrug (High Pulley)');
  assert.ok(low.lats > low['rear-delt'], 'low pulley should be lat/teres-major-dominant');
  assert.ok(high['rear-delt'] > high.lats, 'high pulley should be rear-delt/mid-traps-dominant');
  assert.ok(high['mid-traps'] > low['mid-traps'], 'mid-traps/rhomboid retraction emphasis should increase with pulley height');
  for (const variant of [low, emgProfileForExercise('Kelso Shrug (Mid Pulley)'), high]) {
    assert.ok(!('biceps' in variant) && !('brachioradialis' in variant), 'straight-arm retraction should not carry elbow-flexor synergist credit');
  }
});

// Bench Press pilot (EXERCISE_PARAMETERIZATION.md) — angle-aware lookup for
// the parameterized entry, reusing the three curated flat/incline/decline
// profiles above rather than duplicating their numbers.
test('benchPressEmgProfileForAngle snaps to the nearest curated position and matches the named-variant profiles exactly', () => {
  assert.deepEqual(benchPressEmgProfileForAngle(0), emgProfileForExercise('Barbell Bench Press'));
  assert.deepEqual(benchPressEmgProfileForAngle(30), emgProfileForExercise('Incline Barbell Bench Press'));
  assert.deepEqual(benchPressEmgProfileForAngle(-15), emgProfileForExercise('Decline Barbell Bench Press'));
});

test('benchPressEmgProfileForAngle snaps in-between angles to the nearest sampled position', () => {
  assert.deepEqual(benchPressEmgProfileForAngle(10), emgProfileForExercise('Incline Barbell Bench Press'), '10° is closer to the 15° incline anchor than flat (0°)');
  assert.deepEqual(benchPressEmgProfileForAngle(20), emgProfileForExercise('Incline Barbell Bench Press'), '20° is closer to the 15° incline anchor than 30°, but both share the same profile');
  assert.deepEqual(benchPressEmgProfileForAngle(-30), emgProfileForExercise('Decline Barbell Bench Press'));
});

test('benchPressEmgProfileForAngle returns null for a non-numeric angle', () => {
  assert.equal(benchPressEmgProfileForAngle(undefined), null);
  assert.equal(benchPressEmgProfileForAngle('not a number'), null);
});

// §14 (Phase 2) widened the picker's range from ±30/60° to the full unified
// -90..90 Press scale — these anchors are new; a steep incline no longer
// falsely snaps back to a 30° incline profile, it resolves to whatever
// region it's actually in.
test('benchPressEmgProfileForAngle covers the full §14 unified range, not just the original ±30/60° pilot span', () => {
  assert.deepEqual(benchPressEmgProfileForAngle(-90), emgProfileForExercise('Bench Dips'), 'deep Dip/Tricep Press territory');
  assert.deepEqual(benchPressEmgProfileForAngle(-60), emgProfileForExercise('Tricep Dips (Parallel Bars)'));
  assert.deepEqual(benchPressEmgProfileForAngle(45), emgProfileForExercise('Arnold Press'), 'Incline Shoulder Press hybrid point');
  assert.deepEqual(benchPressEmgProfileForAngle(75), emgProfileForExercise('Barbell Overhead Press'), 'Overhead/Shoulder Press territory');
  assert.deepEqual(benchPressEmgProfileForAngle(90), emgProfileForExercise('Z-Press'), 'deepest overhead extreme');
  // A genuine overhead-press angle should read as clearly front-delt/
  // triceps-dominant, not still chest-dominant like a flat/incline press.
  const overhead = benchPressEmgProfileForAngle(75);
  assert.ok(overhead['front-delt'] > overhead.chest, 'overhead territory should be front-delt dominant, not chest dominant');
});

test('the static "bench press" fallback profile (used when a logged instance has no per-angle emgWeights) matches the flat/0° profile', () => {
  assert.deepEqual(emgProfileForExercise('Bench Press'), emgProfileForExercise('Barbell Bench Press'));
});
