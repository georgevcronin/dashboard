const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSessionVariants, VARIANTS, SHORT_SESSION_MIN,
  measure, compareToBase, dedicatedMuscles, equipmentUsed, workingSetCount,
} = require('../functions/sessionVariants');
const { generateSessionExercises, estimateSessionDurationMin } = require('../functions/sessionPlanner');
const { EXERCISE_DB } = require('../functions/exerciseDb');

const INPUTS = {
  type: 'lift',
  targetMuscles: ['chest', 'triceps', 'front-delt'],
  backboneExerciseNames: ['Barbell Bench Press'],
  lifts: [],
};

const build = (extra = {}) => buildSessionVariants({ inputs: INPUTS, ...extra });
const byKey = (variants, key) => variants.find(v => v.key === key);

// ---------------------------------------------------------------------------
// The generator is the only source of exercises
// ---------------------------------------------------------------------------

test('every variant contains only real EXERCISE_DB exercises', () => {
  for (const variant of build()) {
    for (const ex of variant.exercises) {
      assert.ok(EXERCISE_DB.some(e => e.name === ex.name),
        `${variant.key} produced an exercise not in EXERCISE_DB: ${ex.name}`);
    }
  }
});

test('every variant carries a full set scheme, not a bare exercise name', () => {
  for (const variant of build()) {
    for (const ex of variant.exercises) {
      assert.ok(Array.isArray(ex.sets) && ex.sets.length,
        `${variant.key}/${ex.name} has no sets`);
    }
  }
});

test('the recommended variant is exactly what the planner returns unconstrained', () => {
  const direct = generateSessionExercises(INPUTS);
  const rec = byKey(build(), 'recommended');
  assert.deepEqual(rec.exercises.map(e => e.name), direct.map(e => e.name));
});

test('a caller-supplied base session is used verbatim rather than regenerated', () => {
  const baseExercises = [{ name: 'Barbell Bench Press', sets: [{ reps: 8 }, { reps: 8 }], role: 'primary' }];
  const rec = byKey(build({ baseExercises }), 'recommended');
  assert.deepEqual(rec.exercises, baseExercises);
});

test('no variants at all without target muscles', () => {
  assert.deepEqual(buildSessionVariants({ inputs: { type: 'lift', targetMuscles: [] } }), []);
  assert.deepEqual(buildSessionVariants({}), []);
});

// ---------------------------------------------------------------------------
// Each constraint actually binds
// ---------------------------------------------------------------------------

// A full-length session, the way functions/index.js actually requests one:
// enough target muscles that the planner fills real time, and the 90-minute
// ceiling the Max Length slider sends.
const LONG = {
  inputs: {
    ...INPUTS,
    targetMuscles: ['chest', 'triceps', 'front-delt', 'lats', 'biceps', 'quads', 'hamstrings'],
    maxDurationMin: 90,
  },
};

test('the short variant fits inside its own ceiling', () => {
  const short = byKey(buildSessionVariants(LONG), 'short');
  assert.ok(short, 'expected a short-session variant');
  assert.ok(short.durationMin <= SHORT_SESSION_MIN,
    `short session ran to ${short.durationMin} min, over the ${SHORT_SESSION_MIN} ceiling`);
});

test('the short variant is genuinely shorter than the session it trims', () => {
  const variants = buildSessionVariants(LONG);
  const short = byKey(variants, 'short');
  assert.ok(short.durationMin < byKey(variants, 'recommended').durationMin);
});

// Otherwise a "short session" that runs the same length as the recommended
// one gets offered as a choice that saves nothing.
test('a short variant that would not actually save time is dropped', () => {
  const variants = build(); // no duration cap, so the base is already brief
  const short = byKey(variants, 'short');
  const rec = byKey(variants, 'recommended');
  if (short) assert.ok(short.durationMin < rec.durationMin);
});

test('the no-equipment variant uses nothing but bodyweight', () => {
  const bw = byKey(build(), 'bodyweight');
  assert.ok(bw, 'expected a bodyweight variant');
  assert.deepEqual(bw.equipment, ['bodyweight']);
});

test('the low-CNS variant contains no barbell or dumbbell work', () => {
  const low = byKey(build(), 'lowCns');
  assert.ok(low, 'expected a low-CNS variant');
  for (const equip of low.equipment) {
    assert.ok(!['barbell', 'dumbbell'].includes(equip),
      `low-CNS session still requires ${equip}`);
  }
});

// This is the property that makes the variant honest rather than a relabelling:
// it has to differ from the recommended session by more than its name.
test('every offered variant differs from the recommended session in its exercises', () => {
  const variants = build();
  const rec = byKey(variants, 'recommended').exercises.map(e => e.name).sort().join('|');
  for (const variant of variants.slice(1)) {
    assert.notEqual(variant.exercises.map(e => e.name).sort().join('|'), rec,
      `${variant.key} is identical to the recommended session and should have been dropped`);
  }
});

test('a variant whose constraint changes nothing is dropped rather than shown', () => {
  // Bodyweight target muscles, generated bodyweight-only from the start: the
  // no-equipment constraint is already satisfied, so it is not a real choice.
  const variants = buildSessionVariants({
    inputs: { ...INPUTS, travelMode: true, backboneExerciseNames: [] },
  });
  assert.equal(byKey(variants, 'bodyweight'), undefined);
});

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

test('reported duration matches the planner\'s own estimate for that exercise list', () => {
  for (const variant of build()) {
    assert.equal(variant.durationMin, estimateSessionDurationMin(variant.exercises),
      `${variant.key} reported a duration its own exercise list does not produce`);
  }
});

test('working sets are counted without warmups', () => {
  const exercises = [{ name: 'X', sets: [{ type: 'W' }, {}, {}] }, { name: 'Y', sets: [{ type: 'W' }, {}] }];
  assert.equal(workingSetCount(exercises), 3);
  assert.equal(workingSetCount([]), 0);
  assert.equal(workingSetCount(undefined), 0);
});

// A muscle sitting third in a compound's primary list gets real but thin
// stimulus. Counting it as covered would let a variant claim work it doesn't do.
test('a muscle counts as trained only when some exercise\'s own main mover', () => {
  const bench = EXERCISE_DB.find(e => e.name === 'Barbell Bench Press');
  const covered = dedicatedMuscles([{ name: 'Barbell Bench Press' }]);
  assert.ok(covered.has(bench.primary[0]));
  for (const secondary of bench.primary.slice(1)) {
    assert.ok(!covered.has(secondary),
      `${secondary} is only an incidental primary on the bench press and should not read as trained`);
  }
});

test('measurement ignores exercises that are not in the database', () => {
  const stats = measure([{ name: 'Not A Real Exercise', sets: [{}, {}] }]);
  assert.deepEqual(stats.muscles, []);
  assert.deepEqual(stats.equipment, []);
  assert.equal(stats.workingSets, 2, 'sets still count — only the muscle lookup fails');
});

test('equipment is reported deduplicated and sorted', () => {
  assert.deepEqual(equipmentUsed([]), []);
  const equip = equipmentUsed([{ name: 'Barbell Bench Press' }, { name: 'Barbell Bench Press' }]);
  assert.deepEqual(equip, ['barbell']);
});

// ---------------------------------------------------------------------------
// Trade-offs are measured differences, never claims
// ---------------------------------------------------------------------------

const STATS = { exerciseCount: 4, workingSets: 12, durationMin: 60, muscles: ['chest', 'triceps'], equipment: ['barbell'] };

test('an identical session produces no trade-offs at all', () => {
  assert.deepEqual(compareToBase(STATS, STATS), []);
});

test('a shorter, lighter session reports both differences with the right sign', () => {
  const out = compareToBase({ ...STATS, durationMin: 45, workingSets: 8 }, STATS);
  const duration = out.find(t => t.key === 'duration');
  const volume = out.find(t => t.key === 'volume');
  assert.equal(duration.text, '15 minutes shorter');
  assert.equal(duration.direction, 'less');
  assert.equal(volume.text, '4 working sets fewer');
  assert.equal(volume.direction, 'less');
});

test('a longer session reports its differences in the other direction', () => {
  const out = compareToBase({ ...STATS, durationMin: 61, workingSets: 13 }, STATS);
  assert.equal(out.find(t => t.key === 'duration').text, '1 minute longer');
  assert.equal(out.find(t => t.key === 'volume').text, '1 working set more');
});

test('muscles the constraint costs are named', () => {
  const out = compareToBase({ ...STATS, muscles: ['chest'] }, STATS);
  const dropped = out.find(t => t.key === 'dropped');
  assert.deepEqual(dropped.muscles, ['triceps']);
  assert.ok(dropped.text.includes('triceps'));
});

test('muscles a constraint happens to add are named too', () => {
  const out = compareToBase({ ...STATS, muscles: ['chest', 'triceps', 'lats'] }, STATS);
  assert.deepEqual(out.find(t => t.key === 'added').muscles, ['lats']);
});

// The low-CNS variant can match the recommended session on length, volume and
// muscles — swapping the barbell for a machine is the entire trade-off, so
// omitting equipment would present it as costing nothing.
test('equipment dropped and newly required are both reported', () => {
  const out = compareToBase({ ...STATS, equipment: ['cable', 'machine'] }, STATS);
  assert.deepEqual(out.find(t => t.key === 'equipmentFreed').equipment, ['barbell']);
  assert.deepEqual(out.find(t => t.key === 'equipmentNeeded').equipment, ['cable', 'machine']);
});

// "needs bodyweight" is not a requirement anyone can fail to meet.
test('bodyweight is never reported as a piece of equipment the athlete needs', () => {
  const out = compareToBase({ ...STATS, equipment: ['bodyweight'] }, STATS);
  assert.equal(out.find(t => t.key === 'equipmentNeeded'), undefined);
  assert.deepEqual(out.find(t => t.key === 'equipmentFreed').equipment, ['barbell']);
  const text = JSON.stringify(build());
  assert.ok(!text.includes('needs bodyweight'));
});

test('a dropped-equipment list reads as "or", not "and"', () => {
  const out = compareToBase({ ...STATS, equipment: [] }, { ...STATS, equipment: ['barbell', 'cable'] });
  assert.equal(out.find(t => t.key === 'equipmentFreed').text, 'no barbell or cable needed');
});

test('an equipment-only variant still reports a trade-off', () => {
  const low = byKey(build(), 'lowCns');
  assert.ok(low.tradeoffs.length, 'a variant that changes the equipment required must say so');
});

test('three or more dropped muscles read as a list, not a run-on', () => {
  const out = compareToBase({ ...STATS, muscles: [] },
    { ...STATS, muscles: ['chest', 'triceps', 'front-delt'] });
  assert.ok(out.find(t => t.key === 'dropped').text.includes('chest, triceps and front-delt'));
});

// The temptation this module was written to resist: a confident-sounding
// number for something Press has never measured against an outcome.
test('no trade-off claims a stimulus, growth or performance figure', () => {
  const text = JSON.stringify(build());
  for (const forbidden of ['stimulus', 'hypertroph', 'predicted', '% less', '% more', 'growth']) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()),
      `variant payload contains an unearned claim: ${forbidden}`);
  }
});

test('every variant definition carries a label and a premise', () => {
  for (const variant of VARIANTS) {
    assert.ok(variant.key && variant.label && variant.premise, `incomplete variant: ${variant.key}`);
  }
  assert.equal(new Set(VARIANTS.map(v => v.key)).size, VARIANTS.length, 'duplicate variant key');
});
