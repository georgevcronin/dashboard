const test = require('node:test');
const assert = require('node:assert');

const { sessionLoadScore, sessionLoadDelta } = require('../functions/sessionLoad');

test('sessionLoadScore: null for empty/missing input', () => {
  assert.strictEqual(sessionLoadScore([]), null);
  assert.strictEqual(sessionLoadScore(null), null);
  assert.strictEqual(sessionLoadScore(undefined), null);
});

test('sessionLoadScore: null when every lift is missing an exercise name', () => {
  assert.strictEqual(sessionLoadScore([{ kg: 60, reps: 8 }]), null);
});

test('sessionLoadScore: within 0-100 bounds', () => {
  const lifts = [
    { exercise: 'bench press', kg: 80, reps: 5, rir: 1 },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 1 },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 0 },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 0 },
  ];
  const score = sessionLoadScore(lifts);
  assert(score >= 0 && score <= 100, `score ${score} should be within 0-100`);
});

test('sessionLoadScore: more hard sets scores higher than fewer, same RIR', () => {
  const fewSets = [
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
  ];
  const manySets = [
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2 },
  ];
  assert(sessionLoadScore(manySets) > sessionLoadScore(fewSets), 'more hard sets should score higher');
});

test('sessionLoadScore: lower RIR (closer to failure) scores higher than higher RIR, same volume', () => {
  const nearFailure = [
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 0 },
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 0 },
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 0 },
  ];
  const farFromFailure = [
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 8 },
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 8 },
    { exercise: 'deadlift', kg: 140, reps: 5, rir: 8 },
  ];
  assert(sessionLoadScore(nearFailure) > sessionLoadScore(farFromFailure), 'closer to failure should score higher at equal volume');
});

test('sessionLoadScore: more exercises scores higher than one exercise, same per-exercise sets', () => {
  const oneExercise = [
    { exercise: 'bench press', kg: 80, reps: 5, rir: 2 },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 2 },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 2 },
  ];
  const fiveExercises = ['bench press', 'row', 'squat', 'overhead press', 'deadlift'].flatMap(exercise => [
    { exercise, kg: 80, reps: 5, rir: 2 },
    { exercise, kg: 80, reps: 5, rir: 2 },
    { exercise, kg: 80, reps: 5, rir: 2 },
  ]);
  assert(sessionLoadScore(fiveExercises) > sessionLoadScore(oneExercise), 'more exercises trained should score higher');
});

test('sessionLoadScore: missing rir falls back gracefully (does not throw, stays in range)', () => {
  const lifts = [
    { exercise: 'lat pulldown', kg: 50, reps: 10 },
    { exercise: 'lat pulldown', kg: 50, reps: 10 },
  ];
  const score = sessionLoadScore(lifts);
  assert(score >= 0 && score <= 100);
});

test('sessionLoadDelta: null when no current score or no history', () => {
  assert.strictEqual(sessionLoadDelta(null, [50, 60]), null);
  assert.strictEqual(sessionLoadDelta(70, []), null);
  assert.strictEqual(sessionLoadDelta(70, null), null);
});

test('sessionLoadDelta: positive delta when above trailing average', () => {
  const result = sessionLoadDelta(80, [50, 60, 70]);
  assert.strictEqual(result.avg, 60);
  assert.strictEqual(result.delta, 20);
});

test('sessionLoadDelta: negative delta when below trailing average', () => {
  const result = sessionLoadDelta(40, [50, 60, 70]);
  assert.strictEqual(result.avg, 60);
  assert.strictEqual(result.delta, -20);
});

test('sessionLoadDelta: ignores null entries in history', () => {
  const result = sessionLoadDelta(60, [50, null, 70, undefined]);
  assert.strictEqual(result.avg, 60);
  assert.strictEqual(result.delta, 0);
});
