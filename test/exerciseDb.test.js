const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_DB, EXERCISE_MAP } = require('../functions/exerciseDb');
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
