const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateSessionExercises, progressionFor, suggestedWorkingSetCount, suggestedRirSequence, isLowRepPattern, LOW_REP_THRESHOLD, isStapleExercise, STAPLE_SESSION_THRESHOLD } = require('../functions/sessionPlanner');
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const { isCompoundExercise } = require('../functions/muscleTaxonomy');

test('suggestedWorkingSetCount cycles 2/3/4 by how many times this exercise has been logged', () => {
  assert.equal(suggestedWorkingSetCount(0), 2);
  assert.equal(suggestedWorkingSetCount(1), 3);
  assert.equal(suggestedWorkingSetCount(2), 4);
  assert.equal(suggestedWorkingSetCount(3), 2, 'should wrap back around');
  assert.equal(suggestedWorkingSetCount(undefined), 2, 'missing session count defaults to the first slot in the cycle');
});

test('suggestedRirSequence descends to 0 on the last set and never repeats a value', () => {
  assert.deepEqual(suggestedRirSequence(1), [0]);
  assert.deepEqual(suggestedRirSequence(2), [1, 0]);
  assert.deepEqual(suggestedRirSequence(3), [2, 1, 0]);
  assert.deepEqual(suggestedRirSequence(4), [3, 2, 1, 0]);
  const seq = suggestedRirSequence(4);
  assert.equal(new Set(seq).size, seq.length, 'no RIR value should repeat across sets');
  assert.equal(seq.at(-1), 0, 'last set should always be true failure');
});

test('generateSessionExercises returns nothing for a non-lift session type', () => {
  assert.deepEqual(generateSessionExercises({ type: 'cardio', targetMuscles: ['chest'] }), []);
});

test('generateSessionExercises returns nothing with no target muscles', () => {
  assert.deepEqual(generateSessionExercises({ type: 'lift', targetMuscles: [] }), []);
});

test('generateSessionExercises resolves backbone names case-insensitively and includes accessories', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['barbell bench press'], lifts: [],
  });
  assert.ok(out.length > 1, 'should include at least the backbone plus accessories');
  assert.equal(out[0].name, 'Barbell Bench Press');
});

test('lastAccessoryPick case-sensitivity fix: a lowercased log of a backbone exercise does not defeat accessory rotation', () => {
  const lifts = [
    { date: '2026-07-01', exercise: 'Dumbbell Bench Press (Flat)', sets: [] },
    { date: '2026-07-01', exercise: 'dumbbell incline bench press', sets: [] },
    { date: '2026-06-24', exercise: 'dumbbell bench press (flat)', sets: [] }, // lowercased backbone log
    { date: '2026-06-24', exercise: 'Cable Crossover', sets: [] },
  ];
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Dumbbell Bench Press (Flat)'], lifts,
  });
  const names = out.map(e => e.name);
  assert.ok(!names.includes('Dumbbell Incline Bench Press'), 'should rotate away from the most recent real accessory pick');
});

test('isStapleExercise requires at least STAPLE_SESSION_THRESHOLD distinct logged dates', () => {
  const justBelow = Array.from({ length: STAPLE_SESSION_THRESHOLD - 1 }, (_, i) => ({ date: daysAgo(i), exercise: 'Dumbbell Incline Bench Press' }));
  const atThreshold = Array.from({ length: STAPLE_SESSION_THRESHOLD }, (_, i) => ({ date: daysAgo(i), exercise: 'Dumbbell Incline Bench Press' }));
  assert.equal(isStapleExercise(justBelow, 'Dumbbell Incline Bench Press'), false);
  assert.equal(isStapleExercise(atThreshold, 'Dumbbell Incline Bench Press'), true);
});

test('a staple exercise is not rotated away from as an accessory, unlike a non-staple', () => {
  const stapleLifts = Array.from({ length: STAPLE_SESSION_THRESHOLD }, (_, i) => ({ date: daysAgo(i), exercise: 'Dumbbell Incline Bench Press', sets: [] }));
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: stapleLifts,
  });
  const names = out.map(e => e.name);
  assert.ok(names.includes('Dumbbell Incline Bench Press'), 'a staple should stay eligible as an accessory instead of being rotated away from');
});

test('accessory selection skips a candidate sharing pattern and an overlapping muscle with the backbone', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], accessoryCountOverride: 2,
  });
  const accessories = out.slice(1);
  assert.ok(!accessories.some(a => a.pattern === 'press' && a.primary.includes('chest')),
    'a second press for the same muscle is redundant with the backbone press, not real accessory variety');
});

test('a staple exercise is exempt from the same-function redundancy guard', () => {
  const stapleLifts = Array.from({ length: STAPLE_SESSION_THRESHOLD }, (_, i) => ({ date: daysAgo(i), exercise: 'Dumbbell Incline Bench Press', sets: [] }));
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: stapleLifts, favoriteExercises: ['Dumbbell Incline Bench Press'],
  });
  const names = out.map(e => e.name);
  assert.ok(names.includes('Dumbbell Incline Bench Press'), 'a staple should still be pickable even though it shares a pattern/muscle with the backbone press');
});

test('CNS-fatigue substitution swaps a barbell/dumbbell backbone for a machine/cable alternative', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], cnsFatigue: 80,
  });
  const backbone = out[0];
  assert.notEqual(backbone.name, 'Barbell Bench Press', 'high CNS fatigue should substitute away from a barbell compound');
});

test('excludes exercises hitting an offline (injured) muscle entirely', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], offlineMuscles: ['chest'],
  });
  for (const e of out) assert.ok(!e.name.match(/bench/i), `${e.name} should have been excluded (hits offline chest)`);
});

test('new-lifter fatigue budget: under 3 months, a single working set alternates true-failure vs. two-set patterns', () => {
  const outSession0 = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], trainingMonths: 1,
  });
  const backboneSets = outSession0[0].sets.filter(s => s.type === 'N' || s.type === 'F');
  assert.equal(backboneSets.length, 1, 'a brand-new lifter (session 0) should get exactly 1 working set');
  assert.equal(backboneSets[0].type, 'F', 'first cycle of the new-lifter budget should be a true-failure set');
});

test('new-lifter fatigue budget: 3-6 months gets a flat 2-set cap regardless of session count', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], trainingMonths: 4,
  });
  const backboneSets = out[0].sets.filter(s => s.type === 'N' || s.type === 'F');
  assert.equal(backboneSets.length, 2);
});

test('new-lifter fatigue budget does not apply once trainingMonths is unknown (null)', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], trainingMonths: null,
  });
  const backboneSets = out[0].sets.filter(s => s.type === 'N' || s.type === 'F');
  assert.equal(backboneSets.length, 2, 'unknown experience should use the ordinary experiment-mode cycle (starts at 2), not the new-lifter cap');
});

test('progressionFor merges history logged under different casing into one progression', () => {
  const lifts = [
    { date: '2026-06-01', exercise: 'barbell bench press', kg: 60, reps: 8 },
    { date: '2026-06-08', exercise: 'Barbell Bench Press', kg: 62.5, reps: 8 },
  ];
  const prog = progressionFor(lifts, 'Barbell Bench Press');
  assert.ok(prog, 'differently-cased history should still merge into a progression');
  assert.equal(prog.trend, 'progressing');
});

test('progressionFor returns null with no matching history', () => {
  assert.equal(progressionFor([], 'Barbell Bench Press'), null);
});

test('skipAccessories produces exactly the backbone exercise(s), no accessories added', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], skipAccessories: true,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Barbell Bench Press');
});

test('without skipAccessories, the same call adds accessory exercises as before (unchanged default behavior)', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
  });
  assert.ok(out.length > 1, 'default behavior should still include accessories');
});

test('accessoryCountOverride pins the accessory count regardless of metabolicFatigue', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
    metabolicFatigue: 0, accessoryCountOverride: 1,
  });
  assert.equal(out.length, 2, '1 backbone + accessoryCountOverride of 1, not the usual metabolicFatigue-derived count of 2');
});

test('isolationOnly fills the accessory slot with a non-compound exercise', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
    accessoryCountOverride: 1, isolationOnly: true,
  });
  const accessory = out.find(e => e.name !== 'Barbell Bench Press');
  assert.ok(accessory, 'should still add an accessory');
  assert.ok(!isCompoundExercise(accessory.name), `${accessory.name} should be an isolation pick, not a compound one`);
});

test('accessory selection avoids isometric holds when a non-isometric alternative covers the same muscles', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['obliques', 'transverse-abs'],
    backboneExerciseNames: [], lifts: [], accessoryCountOverride: 3,
  });
  const names = out.map(e => e.name);
  assert.ok(!names.includes('Pallof Press') && !names.includes('Plank (Front)') && !names.includes('Side Plank'),
    `isometric holds should lose out to dynamic alternatives: got ${names}`);
});

test('accessory selection excludes core hold/rollout exercises with no real load progression', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['abs', 'transverse-abs'],
    backboneExerciseNames: [], lifts: [], accessoryCountOverride: 10,
  });
  const names = out.map(e => e.name);
  assert.ok(!names.includes('Dead Bug') && !names.includes('Ab Wheel Rollout'),
    `hold/rollout core exercises have no external-load progression path and shouldn't be picked as accessories: got ${names}`);
});

test('accessory selection heavily prefers a previously-logged exercise over an untried higher-coverage one', () => {
  // Two logged dates, not one: lastAccessoryPick's own rotation logic
  // excludes whichever oblique exercise was hit *most* recently (here,
  // Landmine Rotation) to avoid repeating it verbatim — that's a separate,
  // intentional mechanism, not what this test is checking. Russian Twist is
  // the older of the two, so it stays eligible and should win purely on the
  // logged-history bonus.
  const lifts = [
    { date: '2026-06-01', exercise: 'Russian Twist', kg: 10, reps: 15 },
    { date: '2026-07-01', exercise: 'Landmine Rotation', kg: 10, reps: 15 },
  ];
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['obliques'],
    backboneExerciseNames: [], lifts, accessoryCountOverride: 1,
  });
  assert.equal(out[0].name, 'Russian Twist', 'a logged exercise should outrank untried alternatives targeting the same muscle');
});

test('isLowRepPattern is false with too few hard sets to call it a pattern yet', () => {
  assert.equal(isLowRepPattern([{ reps: 2 }, { reps: 3 }]), false);
});

test('isLowRepPattern is false for a single deliberate low-rep set among otherwise normal sets', () => {
  const sets = [{ reps: 2 }, { reps: 8 }, { reps: 9 }, { reps: 8 }];
  assert.equal(isLowRepPattern(sets), false);
});

test(`isLowRepPattern is true once a majority of hard sets are at or under ${LOW_REP_THRESHOLD} reps`, () => {
  const sets = [{ reps: 2 }, { reps: 3 }, { reps: 3 }, { reps: 8 }];
  assert.equal(isLowRepPattern(sets), true);
});

test('isLowRepPattern ignores sets with no reps logged yet', () => {
  const sets = [{ reps: 2 }, { reps: 3 }, { reps: '' }, { reps: 0 }];
  assert.equal(isLowRepPattern(sets), false, 'only 2 real sets logged (2, 3) — below the minimum sample size');
});
