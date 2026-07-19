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
