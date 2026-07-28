const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_EMG_PROFILES, emgProfileForExercise } = require('../functions/exerciseEmgProfiles');
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
  assert.equal(emgProfileForExercise('Barbell Bench Press'), null, 'bench press is press-pattern, not yet curated in phase 1');
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
