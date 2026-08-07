const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateSessionExercises, progressionFor, suggestedWorkingSetCount, suggestedRirSequence, isLowRepPattern, LOW_REP_THRESHOLD, isStapleExercise, STAPLE_SESSION_THRESHOLD, estimateSessionDurationMin, capSessionDuration, fillSessionToDuration, fatigueCeilingFor, stimulusSimilarity } = require('../functions/sessionPlanner');
const { EXERCISE_DB } = require('../functions/exerciseDb');
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

test('suggestedRirSequence(setCount) with no offset is unchanged (default is a no-op)', () => {
  assert.deepEqual(suggestedRirSequence(3), suggestedRirSequence(3, 0));
});

test('suggestedRirSequence offset shifts every value and floors at 0', () => {
  assert.deepEqual(suggestedRirSequence(3, 1), [3, 2, 1], 'a positive offset (cycle dip) should push every value up by that amount');
  assert.deepEqual(suggestedRirSequence(3, -1), [1, 0, 0], 'a negative offset (cycle peak) should pull values down, floored at 0, never negative');
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

test('sessionExcludeNames keeps an exercise already used for another muscle this session from being picked again as an accessory', () => {
  const baseline = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
  });
  const firstAccessory = baseline[1]?.name;
  assert.ok(firstAccessory, 'sanity check: this target set has at least one accessory pick available');

  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
    sessionExcludeNames: new Set([firstAccessory]),
  });
  assert.ok(!out.some(e => e.name === firstAccessory), 'an exercise already used elsewhere in the session should not be picked again as an accessory');
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

test('stimulusSimilarity scores an identical EMG profile at the sum of its own activations', () => {
  const bench = EXERCISE_DB.find(e => e.name === 'Barbell Bench Press');
  const machinePress = EXERCISE_DB.find(e => e.name === 'Machine Chest Press');
  // Both curated at front-delt 85 / chest 68.7 / triceps 58 — an identical
  // profile, so min(a,b) per muscle is just that muscle's own value.
  assert.equal(stimulusSimilarity(bench, machinePress), 85 + 68.7 + 58);
});

test('stimulusSimilarity falls back to primary-muscle overlap count when either exercise has no curated EMG profile', () => {
  const bench = EXERCISE_DB.find(e => e.name === 'Barbell Bench Press');
  const cablePress = EXERCISE_DB.find(e => e.name === 'Cable Press');
  assert.equal(stimulusSimilarity(bench, cablePress), 3, 'same 3 primary muscles, no EMG profile for Cable Press');
});

test('excludes exercises hitting an offline (injured) muscle entirely', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], offlineMuscles: ['chest'],
  });
  for (const e of out) assert.ok(!e.name.match(/bench/i), `${e.name} should have been excluded (hits offline chest)`);
});

test('avoidMusclesSecondary excludes an exercise whose secondary (not primary) muscle is over the looser secondary ceiling', () => {
  // Weighted Pull-Up: primary [lats, biceps], secondary [rear-delt, rhomboids]
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['lats', 'biceps'],
    backboneExerciseNames: ['Weighted Pull-Up'], lifts: [], avoidMusclesSecondary: ['rear-delt'],
  });
  assert.ok(!out.some(e => e.name === 'Weighted Pull-Up'), 'a secondary-muscle overlap with the (looser) secondary ceiling should still exclude the exercise');
});

test('avoidMuscles (primary list) does not exclude on a secondary-only overlap', () => {
  // Same exercise/muscle as above, but rear-delt is only ever a secondary
  // muscle here — avoidMuscles checks e.primary exclusively, so it should
  // have no effect regardless of what's in the list.
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['lats', 'biceps'],
    backboneExerciseNames: ['Weighted Pull-Up'], lifts: [], avoidMuscles: ['rear-delt'],
  });
  assert.ok(out.some(e => e.name === 'Weighted Pull-Up'), 'avoidMuscles should only ever match primary muscles, not secondary');
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

test('estimateSessionDurationMin counts execution + rest but skips rest after the very last set', () => {
  const oneSet = [{ name: 'X', sets: [{ type: 'N' }] }];
  assert.equal(estimateSessionDurationMin(oneSet), 1, '45s execution, no rest after the only set — rounds to 1 min');

  const twoWorkingSets = [{ name: 'X', sets: [{ type: 'N' }, { type: 'N' }] }];
  // 2*45s execution + 1*180s rest (after set 1, not after the last set) = 270s = 4.5min -> 5
  assert.equal(estimateSessionDurationMin(twoWorkingSets), 5);
});

test('estimateSessionDurationMin adds a transition between exercises but not after the last one', () => {
  const twoExercises = [{ name: 'X', sets: [{ type: 'N' }] }, { name: 'Y', sets: [{ type: 'N' }] }];
  // X: 45s exec + 180s rest (more exercises follow) = 225s
  // transition: 90s
  // Y: 45s exec, no rest (last set of the session) = 45s
  // total = 360s = 6min exactly
  assert.equal(estimateSessionDurationMin(twoExercises), 6);
});

test('estimateSessionDurationMin gives warmup sets shorter rest than working sets', () => {
  const withWarmup = [{ name: 'X', sets: [{ type: 'W' }, { type: 'N' }, { type: 'N' }] }];
  // 3*45s exec + 60s (after warmup) + 180s (after set 2, not the last) = 375s = 6.25min -> 6
  assert.equal(estimateSessionDurationMin(withWarmup), 6);
});

test('capSessionDuration is a no-op when maxDurationMin is unset', () => {
  const exercises = [{ name: 'Barbell Bench Press', sets: [{ type: 'N' }, { type: 'N' }, { type: 'N' }] }];
  assert.deepEqual(capSessionDuration(exercises, {}, null), exercises);
  assert.deepEqual(capSessionDuration(exercises, {}, 0), exercises);
});

test('capSessionDuration drops the exercise targeting the highest-fatigue ("most adapted") muscle first', () => {
  const exercises = [
    { name: 'Barbell Bench Press', sets: [{ type: 'N' }, { type: 'N' }, { type: 'N' }] }, // primary: chest, triceps, front-delt
    { name: 'Weighted Pull-Up', sets: [{ type: 'N' }, { type: 'N' }, { type: 'N' }] }, // primary: lats, biceps
  ];
  const currentFatigue = { chest: 80, lats: 10 };
  const out = capSessionDuration(exercises, currentFatigue, 10);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Weighted Pull-Up', 'chest is far more fatigued (already-adapted) than lats, so the bench press should be cut first');
});

test('capSessionDuration never trims below one exercise, even under an unreachable cap', () => {
  const exercises = [{ name: 'Barbell Bench Press', sets: [{ type: 'N' }, { type: 'N' }, { type: 'N' }] }];
  const out = capSessionDuration(exercises, { chest: 90 }, 1);
  assert.equal(out.length, 1, 'a cap too tight for even one exercise should still leave that one exercise, not return empty');
});

test('fatigueCeilingFor mirrors generateSessionExercises\' own internal thresholds', () => {
  assert.equal(fatigueCeilingFor(0), 4);
  assert.equal(fatigueCeilingFor(40), 3);
  assert.equal(fatigueCeilingFor(70), 2);
});

// A session that came in well under the requested length (e.g. backbone
// happened to fully cover every target muscle with just 2-3 exercises)
// previously just... stayed short, even against a 90-min slider. This adds
// working sets to what's already there instead of leaving requested time
// on the table -- the counterpart to capSessionDuration's trim-down.
test('fillSessionToDuration adds working sets, round-robin, until the session reaches maxDurationMin', () => {
  const exercises = [
    { name: 'A', sets: [{ type: 'N', kg: 100, reps: 5 }] },
    { name: 'B', sets: [{ type: 'N', kg: 50, reps: 8 }] },
  ];
  const before = estimateSessionDurationMin(exercises);
  const out = fillSessionToDuration(exercises, before + 10, 4);
  assert.ok(estimateSessionDurationMin(out) > before, 'should have added volume to close the gap toward maxDurationMin');
  assert.ok(estimateSessionDurationMin(out) <= before + 10 + 4, 'should not wildly overshoot the target (allowing for one set worth of granularity)');
});

test('fillSessionToDuration never pushes any exercise past fatigueCeiling working sets', () => {
  const exercises = [{ name: 'A', sets: [{ type: 'N', kg: 100, reps: 5 }] }];
  const out = fillSessionToDuration(exercises, 999, 3);
  assert.equal(out[0].sets.filter(s => s.type !== 'W').length, 3, 'should stop adding sets once fatigueCeiling is hit, even with a huge target length left unfilled');
});

test('fillSessionToDuration is a no-op when maxDurationMin is unset or the session already meets it', () => {
  const exercises = [{ name: 'A', sets: [{ type: 'N', kg: 100, reps: 5 }] }];
  assert.deepEqual(fillSessionToDuration(exercises, null, 4), exercises);
  assert.deepEqual(fillSessionToDuration(exercises, 0, 4), exercises);
  const alreadyLong = estimateSessionDurationMin(exercises);
  assert.deepEqual(fillSessionToDuration(exercises, alreadyLong, 4), exercises);
});

test('fillSessionToDuration never invents a new exercise, only adds sets to what\'s already chosen', () => {
  const exercises = [{ name: 'A', sets: [{ type: 'N', kg: 100, reps: 5 }] }];
  const out = fillSessionToDuration(exercises, 999, 10);
  assert.equal(out.length, 1, 'should still be exactly one exercise, no matter how much target length is left unfilled');
});

test('generateSessionExercises surfaces family/pattern/equipment/angle for an isAngleFamily backbone pick, preserving a caller-supplied angle through name re-resolution', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['serratus'], backboneExerciseNames: [{ name: 'Cable Fly', angle: 165 }],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].pattern, 'fly');
  assert.equal(result[0].equipment, 'cable');
  assert.equal(result[0].angle, 165, 'the angle passed in via {name, angle} should survive EXERCISE_DB re-resolution, not get dropped back to a bare name');
});

test('generateSessionExercises still accepts a plain backboneExerciseNames string array (today\'s contract), output unaffected for non-family exercises', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest'], backboneExerciseNames: ['Barbell Bench Press'],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Barbell Bench Press');
  assert.ok(!('family' in result[0]) && !('angle' in result[0]), 'a non-family exercise entry should be byte-identical to today, no new fields');
});

test('generateSessionExercises via the accessory picker (no backbone) also attaches family/angle for a muscle only a family entry serves well', () => {
  const { idealAngleForMuscle } = require('../functions/emgActivation');
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['serratus'], backboneExerciseNames: [], lifts: [], accessoryCountOverride: 1,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].angle, idealAngleForMuscle(result[0].pattern, 'serratus'));
});

test('generateSessionExercises surfaces family/pattern/equipment/angle for a curl-family backbone pick (brachialis)', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['brachialis'], backboneExerciseNames: [{ name: 'Cable Curl', angle: 180 }],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].pattern, 'curl');
  assert.equal(result[0].equipment, 'cable');
  assert.equal(result[0].angle, 180);
});

test('generateSessionExercises surfaces family/pattern/equipment/angle for an extension-family backbone pick (triceps)', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['triceps'], backboneExerciseNames: [{ name: 'Cable Extension', angle: 90 }],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].pattern, 'extension');
  assert.equal(result[0].equipment, 'cable');
  assert.equal(result[0].angle, 90);
});

test('generateSessionExercises surfaces family/pattern/equipment/angle for a leg-curl-family backbone pick (hamstrings)', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['hamstrings'], backboneExerciseNames: [{ name: 'Machine Leg Curl', angle: 180 }],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].pattern, 'leg-curl');
  assert.equal(result[0].equipment, 'machine');
  assert.equal(result[0].angle, 180);
});

test('generateSessionExercises surfaces family/pattern/equipment/angle for a hyperextension backbone pick, restricted to its 2 real device angles', () => {
  const result = generateSessionExercises({
    type: 'lift', targetMuscles: ['erectors'], backboneExerciseNames: [{ name: 'Hyperextension', angle: 90 }],
    lifts: [], skipAccessories: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].family, true);
  assert.equal(result[0].pattern, 'hyperextension');
  assert.equal(result[0].equipment, 'bodyweight');
  assert.equal(result[0].angle, 90);
});

// The exercise role drives visual hierarchy in the session view — the athlete
// should be able to tell at a glance which lift drives the session and which
// is support work. It has to come from the selection that actually happened,
// not from re-guessing the name, or the labelling and the plan can disagree.
test('generateSessionExercises labels the backbone pick primary and the rest support work', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [],
  });
  const bench = out.find(e => e.name === 'Barbell Bench Press');
  assert.equal(bench.role, 'primary');
  for (const e of out) {
    assert.ok(['primary', 'secondary', 'isolation'].includes(e.role), `${e.name} got role ${e.role}`);
    if (e.name !== 'Barbell Bench Press') assert.notEqual(e.role, 'primary');
  }
});

test('every generated exercise carries a role, including duration-filled dedicated accessories', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps', 'front-delt', 'mid-delt'],
    backboneExerciseNames: ['Barbell Bench Press'], lifts: [], maxDurationMin: 90,
  });
  assert.ok(out.length > 2);
  for (const e of out) assert.ok(e.role, `${e.name} has no role`);
});

test('role survives a case-mismatched backbone name rather than mislabelling it support work', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['chest', 'triceps'],
    backboneExerciseNames: ['barbell bench press'], lifts: [],
  });
  const bench = out.find(e => e.name.toLowerCase() === 'barbell bench press');
  assert.equal(bench.role, 'primary');
});

test('an isolation accessory is labelled isolation, not secondary compound', () => {
  const out = generateSessionExercises({
    type: 'lift', targetMuscles: ['biceps'],
    backboneExerciseNames: [], lifts: [], isolationOnly: true,
  });
  assert.ok(out.length > 0);
  for (const e of out) assert.equal(e.role, 'isolation', `${e.name} labelled ${e.role}`);
});
