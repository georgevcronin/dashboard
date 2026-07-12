const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateSessionExercises, progressionFor } = require('../functions/sessionPlanner');

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
    { date: '2026-07-01', exercise: 'incline dumbbell press', sets: [] },
    { date: '2026-06-24', exercise: 'dumbbell bench press (flat)', sets: [] }, // lowercased backbone log
    { date: '2026-06-24', exercise: 'Cable Crossover', sets: [] },
  ];
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Dumbbell Bench Press (Flat)'], lifts,
  });
  const names = out.map(e => e.name);
  assert.ok(!names.includes('Incline Dumbbell Press'), 'should rotate away from the most recent real accessory pick');
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
