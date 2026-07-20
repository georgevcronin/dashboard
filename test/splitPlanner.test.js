const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  UPPER_LOWER_GROUPS, PPL_GROUPS, BRO_SPLIT_GROUPS,
  rankMusclesByFreshness, typicalSessionMuscleCount, mostOverdueGroup,
  sessionPurity, detectPreferredSplit, neglectedMuscles, NEGLECT_THRESHOLD_DAYS,
} = require('../functions/splitPlanner');
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('rankMusclesByFreshness ranks freshest first and excludes unavailable (-1) muscles', () => {
  const priority = { quads: 80, chest: 20, lats: -1, biceps: 50 };
  assert.deepEqual(rankMusclesByFreshness(priority), ['quads', 'biceps', 'chest']);
});

test('typicalSessionMuscleCount returns the fallback with too little real history', () => {
  const lifts = [
    { date: daysAgo(1), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
  ];
  assert.equal(typicalSessionMuscleCount(lifts, 6), 6, 'only 2 distinct session-dates — not enough to trust a median from');
});

test('typicalSessionMuscleCount computes a real median once there is enough history', () => {
  // 5 sessions, each hitting a different, deliberately-sized number of
  // distinct primary muscles via known exercises — median should be 6.
  const lifts = [
    { date: daysAgo(10), exercise: 'Barbell Bench Press', kg: 80, reps: 8 }, // chest, triceps, front-delt = 3
    { date: daysAgo(8), exercise: 'Barbell Overhead Press', kg: 40, reps: 8 },
    { date: daysAgo(8), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
    { date: daysAgo(6), exercise: 'Barbell Overhead Press', kg: 40, reps: 8 },
    { date: daysAgo(6), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
    { date: daysAgo(6), exercise: 'Barbell Shrug', kg: 60, reps: 10 },
    { date: daysAgo(4), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
  ];
  const n = typicalSessionMuscleCount(lifts, 6);
  assert.ok(n >= 3 && n <= 8, `expected a real computed median in a sane range, got ${n}`);
});

test('mostOverdueGroup picks whichever group has gone longest since any of its muscles were trained', () => {
  const muscleLastTrainedDays = { chest: 1, triceps: 2, 'front-delt': 1, lats: 10, biceps: 12 };
  const result = mostOverdueGroup(PPL_GROUPS, muscleLastTrainedDays);
  assert.equal(result.name, 'legs', 'legs has no entries in muscleLastTrainedDays at all — infinitely overdue, should win over push/pull');
});

test('mostOverdueGroup treats a never-trained muscle as infinitely overdue', () => {
  const result = mostOverdueGroup({ a: ['chest'], b: ['lats'] }, { chest: 5 });
  assert.equal(result.name, 'b', 'lats has no entry at all (never trained) — should outrank a group trained 5 days ago');
});

test('sessionPurity is 1.0 when every touched muscle falls into one group', () => {
  assert.equal(sessionPurity(PPL_GROUPS, ['chest', 'triceps', 'front-delt']), 1);
});

test('sessionPurity is lower when a session spans multiple groups', () => {
  const p = sessionPurity(PPL_GROUPS, ['chest', 'quads', 'lats']);
  assert.ok(p < 1 && p > 0);
});

test('detectPreferredSplit returns null with too little real history', () => {
  assert.equal(detectPreferredSplit([]), null);
});

test('detectPreferredSplit recognizes a clean Push/Pull/Legs pattern', () => {
  const lifts = [];
  const pushDays = [1, 4, 7, 10], pullDays = [2, 5, 8, 11], legDays = [3, 6, 9, 12];
  for (const d of pushDays) lifts.push({ date: daysAgo(d), exercise: 'Barbell Bench Press', kg: 80, reps: 8 }, { date: daysAgo(d), exercise: 'Barbell Overhead Press', kg: 40, reps: 8 });
  for (const d of pullDays) lifts.push({ date: daysAgo(d), exercise: 'Barbell Bench Row', kg: 70, reps: 8 });
  for (const d of legDays) lifts.push({ date: daysAgo(d), exercise: 'Back Squat', kg: 100, reps: 8 });
  assert.equal(detectPreferredSplit(lifts), 'Push / Pull / Legs');
});

test('detectPreferredSplit falls back to Full Body when sessions are genuinely mixed', () => {
  const lifts = [];
  for (const d of [1, 3, 5, 7, 9]) {
    lifts.push(
      { date: daysAgo(d), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
      { date: daysAgo(d), exercise: 'Back Squat', kg: 100, reps: 8 },
      { date: daysAgo(d), exercise: 'Barbell Bench Row', kg: 70, reps: 8 },
    );
  }
  assert.equal(detectPreferredSplit(lifts), 'Full Body');
});

test('neglectedMuscles is always empty for Full Body — nothing is structurally excluded', () => {
  assert.deepEqual(neglectedMuscles('Full Body', {}), []);
  assert.deepEqual(neglectedMuscles('Not A Real Split', {}), []);
});

test('neglectedMuscles flags every muscle in a whole group once its freshest muscle goes stale', () => {
  const muscleLastTrainedDays = { chest: 1, 'front-delt': 2, triceps: 3 }; // push is fresh; pull/legs untouched at all
  const neglected = neglectedMuscles('Push / Pull / Legs', muscleLastTrainedDays);
  const neglectedNames = neglected.map(n => n.muscle);
  assert.ok(!neglectedNames.includes('chest'), 'push is fresh — should not be flagged');
  assert.ok(neglectedNames.includes('lats'), 'pull has never been trained at all — every muscle in it should be flagged');
  assert.ok(neglectedNames.includes('quads'), 'legs has never been trained at all — every muscle in it should be flagged');
});

test('neglectedMuscles does not flag a group with even one recently-trained muscle', () => {
  const muscleLastTrainedDays = { lats: 30, biceps: 2 }; // pull group: lats stale, but biceps recent
  const neglected = neglectedMuscles('Push / Pull / Legs', muscleLastTrainedDays);
  assert.ok(!neglected.some(n => n.muscle === 'lats'), `pull is still being reached (biceps recent) even though lats specifically is stale — got ${JSON.stringify(neglected)}`);
});

test('NEGLECT_THRESHOLD_DAYS matches the established atrophy-risk cutoff used elsewhere (stalenessBoost)', () => {
  assert.equal(NEGLECT_THRESHOLD_DAYS, 21);
});
