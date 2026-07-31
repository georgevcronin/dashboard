const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_DB, EXERCISE_MAP, EXERCISE_MUSCLE_GROUPS, EXERCISE_PATTERNS } = require('../functions/exerciseDb');
const { MUSCLE_GROUPS, PRIMARY_MUSCLES } = require('../functions/muscleTaxonomy');

test('every exercise has a unique id', () => {
  const ids = EXERCISE_DB.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found in EXERCISE_DB');
});

test('every exercise has a unique name (case-insensitive)', () => {
  const names = EXERCISE_DB.map(e => e.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'duplicate name found in EXERCISE_DB');
});

test('every exercise has at least one primary muscle', () => {
  const missing = EXERCISE_DB.filter(e => !e.primary || e.primary.length === 0);
  assert.deepEqual(missing.map(e => e.id), [], 'exercises with empty primary array');
});

test('every exercise has required fields', () => {
  const REQUIRED = ['id', 'name', 'category', 'equipment', 'primary', 'secondary', 'curve', 'form'];
  for (const e of EXERCISE_DB) {
    for (const field of REQUIRED) {
      assert.ok(field in e, `${e.id} is missing field "${field}"`);
    }
  }
});

test('EXERCISE_MAP is keyed by id and matches EXERCISE_DB', () => {
  assert.equal(Object.keys(EXERCISE_MAP).length, EXERCISE_DB.length);
  for (const e of EXERCISE_DB) assert.equal(EXERCISE_MAP[e.id], e);
});

test('every primary muscle used anywhere is covered by exactly one MUSCLE_GROUPS bucket', () => {
  const bucketed = new Set(Object.values(MUSCLE_GROUPS).flat());
  const missing = PRIMARY_MUSCLES.filter(m => !bucketed.has(m));
  assert.deepEqual(missing, [], `primary muscles missing from MUSCLE_GROUPS: ${missing.join(', ')}`);

  const seenTwice = [];
  const seen = new Set();
  for (const [, muscles] of Object.entries(MUSCLE_GROUPS)) {
    for (const m of muscles) {
      if (seen.has(m)) seenTwice.push(m);
      seen.add(m);
    }
  }
  assert.deepEqual(seenTwice, [], `muscles appearing in more than one bucket: ${seenTwice.join(', ')}`);
});

test('equipment field is one of the known categories', () => {
  const KNOWN = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'smith']);
  const bad = EXERCISE_DB.filter(e => !KNOWN.has(e.equipment));
  assert.deepEqual(bad.map(e => ({ id: e.id, equipment: e.equipment })), []);
});

test('every exercise has the taxonomy fields (muscleGroup/pattern/movementId/movementName)', () => {
  const REQUIRED = ['muscleGroup', 'pattern', 'movementId', 'movementName'];
  for (const e of EXERCISE_DB) {
    for (const field of REQUIRED) {
      assert.ok(e[field], `${e.id} is missing or has an empty "${field}"`);
    }
  }
});

test('muscleGroup is always one of EXERCISE_MUSCLE_GROUPS', () => {
  const known = new Set(EXERCISE_MUSCLE_GROUPS);
  const bad = EXERCISE_DB.filter(e => !known.has(e.muscleGroup));
  assert.deepEqual(bad.map(e => ({ id: e.id, muscleGroup: e.muscleGroup })), []);
});

test('pattern is always one of EXERCISE_PATTERNS', () => {
  const known = new Set(EXERCISE_PATTERNS);
  const bad = EXERCISE_DB.filter(e => !known.has(e.pattern));
  assert.deepEqual(bad.map(e => ({ id: e.id, pattern: e.pattern })), []);
});

test('every exercise sharing a movementId shares the same movementName (family names are internally consistent)', () => {
  const names = {};
  for (const e of EXERCISE_DB) {
    if (names[e.movementId] && names[e.movementId] !== e.movementName) {
      assert.fail(`movementId "${e.movementId}" has inconsistent movementName: "${names[e.movementId]}" vs "${e.movementName}" (${e.id})`);
    }
    names[e.movementId] = e.movementName;
  }
});

// Bench Press pilot — see .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md.
// Widened per §14 (Phase 2) to the unified Press angle scale (Dip through
// Overhead/Shoulder Press) — see test/exerciseLabelMatching.test.js for the
// label-matching table this range feeds.
test('Bench Press is a real, parameterized EXERCISE_DB entry with equipment/angle/stance picker config', () => {
  const bench = EXERCISE_DB.find(e => e.id === 'bench-press');
  assert.ok(bench, 'expected a bench-press entry');
  assert.equal(bench.name, 'Bench Press');
  assert.equal(bench.parameterized, true);
  assert.deepEqual(bench.equipmentChoices, ['Barbell', 'Dumbbell', 'Machine', 'Bodyweight']);
  assert.deepEqual(bench.angleRange, { min: -90, max: 90, step: 15 }, '§14\'s full unified scale, 15° step');
  assert.deepEqual(bench.stanceOptions, ['Standing', 'Seated']);
  assert.deepEqual(bench.primary, ['chest', 'triceps', 'front-delt']);
});

// §14: Overhead/Shoulder Press cluster folds into the unified Press entity.
test('the overhead/shoulder press cluster is superseded by Bench Press but still fully resolvable', () => {
  const LEGACY_IDS = [
    'barbell-overhead-press', 'dumbbell-overhead-press', 'machine-shoulder-press',
    'seated-dumbbell-press', 'seated-overhead-press-smith', 'seated-behind-neck-press',
  ];
  for (const id of LEGACY_IDS) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `expected legacy entry ${id} to still exist`);
    assert.equal(e.supersededBy, 'bench-press', `${id} should be marked supersededBy 'bench-press'`);
    assert.ok(e.name && e.primary?.length, `${id} should still be a fully-formed entry`);
  }
});

test('Arnold Press, Push Press, Z-Press, Half-Kneeling Press, and JM Press stay separate — distinct techniques, not angle points', () => {
  const DISTINCT_TECHNIQUE_IDS = ['arnold-press', 'push-press', 'z-press', 'half-kneeling-press', 'jm-press'];
  for (const id of DISTINCT_TECHNIQUE_IDS) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `expected ${id} to still exist`);
    assert.equal(e.supersededBy, undefined, `${id} should NOT be folded into Bench Press`);
  }
});

// §15: Row is the new canonical entity for the whole vertical-pull axis.
test('Row is a real, parameterized EXERCISE_DB entry spanning the full 0-180 axis', () => {
  const row = EXERCISE_DB.find(e => e.id === 'row');
  assert.ok(row, 'expected a row entry');
  assert.equal(row.name, 'Row');
  assert.equal(row.pattern, 'row');
  assert.equal(row.parameterized, true);
  assert.deepEqual(row.equipmentChoices, ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight']);
  assert.deepEqual(row.angleRange, { min: 0, max: 180, step: 15 });
  assert.deepEqual(row.stanceOptions, ['Standing', 'Chest-Supported']);
});

test('the pull-up/lat-pulldown cluster is superseded by Row but still fully resolvable (§15)', () => {
  const LEGACY_IDS = [
    'pull-up-wide', 'pull-up-neutral', 'chin-up', 'weighted-pull-up',
    'lat-pulldown-wide', 'lat-pulldown-neutral', 'lat-pulldown-reverse',
    'single-arm-pulldown', 'close-grip-lat-pulldown', 'lat-pulldown-behind-neck',
  ];
  for (const id of LEGACY_IDS) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `expected legacy entry ${id} to still exist`);
    assert.equal(e.supersededBy, 'row', `${id} should be marked supersededBy 'row'`);
    assert.ok(e.name && e.primary?.length, `${id} should still be a fully-formed entry`);
  }
});

test('Cable Straight-Arm Pulldown deliberately stays separate despite sharing the Row angle axis at 0°', () => {
  const e = EXERCISE_MAP['cable-straight-arm-pulldown'];
  assert.ok(e);
  assert.equal(e.supersededBy, undefined);
});

test('the six legacy bench-press-family entries are superseded by Bench Press but still fully resolvable', () => {
  const LEGACY_IDS = [
    'barbell-bench-press', 'incline-barbell-bench-press', 'decline-barbell-bench-press',
    'dumbbell-flat-bench-press', 'dumbbell-incline-bench-press', 'dumbbell-decline-bench-press',
  ];
  for (const id of LEGACY_IDS) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `expected legacy entry ${id} to still exist`);
    assert.equal(e.supersededBy, 'bench-press', `${id} should be marked supersededBy 'bench-press'`);
    // Untouched identity/taxonomy — historical logs under this exact name
    // must keep resolving exactly as before.
    assert.ok(e.name && e.primary?.length, `${id} should still be a fully-formed entry`);
  }
});

test('Close-Grip Bench Press is NOT superseded and has its own movementId, separate from the Bench Press family', () => {
  const closeGrip = EXERCISE_MAP['close-grip-bench-press'];
  assert.ok(closeGrip);
  assert.equal(closeGrip.supersededBy, undefined, 'a grip-width variant, not an angle variant — should stay independently selectable');
  assert.notEqual(closeGrip.movementId, 'bench-press');
});

test('EXERCISE_MUSCLE_GROUPS is a distinct list, not the same object as muscleTaxonomy.js\'s MUSCLE_GROUPS', () => {
  // Deliberate naming distinction (different concept, different shape) --
  // this app has been burned before by two same-named-but-different things
  // silently colliding. EXERCISE_MUSCLE_GROUPS is a flat array of 12
  // fine-grained groups; muscleTaxonomy.js's MUSCLE_GROUPS is an object of 4
  // coarse fatigue buckets (push/pull/legs/core).
  assert.ok(Array.isArray(EXERCISE_MUSCLE_GROUPS));
  assert.ok(!Array.isArray(MUSCLE_GROUPS));
  assert.notEqual(EXERCISE_MUSCLE_GROUPS.length, Object.keys(MUSCLE_GROUPS).length);
});
