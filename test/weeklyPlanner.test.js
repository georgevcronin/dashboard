const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeMusclePriority, scoreBucket, generateWeeklyGuidance,
  pickBackboneExercises, planLiftSessionsTarget, planCardioSessionsTarget,
  MUSCLE_GROUPS, FATIGUE_CEILING,
} = require('../functions/weeklyPlanner');

test('computeMusclePriority marks offline muscles as -1 regardless of fatigue', () => {
  const priority = computeMusclePriority({ quads: 0 }, ['quads']);
  assert.equal(priority.quads, -1);
});

test('computeMusclePriority marks muscles at/over the fatigue ceiling as -1', () => {
  const priority = computeMusclePriority({ quads: FATIGUE_CEILING }, []);
  assert.equal(priority.quads, -1);
  const priorityBelow = computeMusclePriority({ quads: FATIGUE_CEILING - 1 }, []);
  assert.ok(priorityBelow.quads >= 0);
});

test('scoreBucket returns null when every muscle in the bucket is unavailable', () => {
  const priority = computeMusclePriority({ chest: 100, 'front-delt': 100, 'mid-delt': 100, triceps: 100 }, []);
  assert.equal(scoreBucket(MUSCLE_GROUPS.push, priority), null);
});

test('bucket weighting: a genuinely fatigued major-muscle bucket does not read as falsely fresh off assistor muscles alone', () => {
  const fatigue = { lats: 80, rhomboids: 75, traps: 70, 'rear-delt': 70, biceps: 65, forearms: 60 };
  const priority = computeMusclePriority(fatigue, []);
  const pull = scoreBucket(MUSCLE_GROUPS.pull, priority);
  const push = scoreBucket(MUSCLE_GROUPS.push, priority);
  assert.ok(pull.score < push.score, 'a fried-back pull bucket should score well below an untouched push bucket');
  assert.ok(pull.score < 75, `pull score too close to fresh: ${pull.score}`);
});

test('scoreBucket reads 100 when every muscle in the bucket is fully fresh', () => {
  const priority = computeMusclePriority({}, []);
  assert.equal(scoreBucket(MUSCLE_GROUPS.push, priority).score, 100);
});

test('pickBackboneExercises prefers compounds covering more target muscles, excludes lesserKnown', () => {
  const picks = pickBackboneExercises(MUSCLE_GROUPS.push, { count: 2 });
  assert.equal(picks.length, 2);
  for (const p of picks) assert.equal(p.lesserKnown, false);
});

test('planLiftSessionsTarget caps sessions hard when systemic fatigue is very high', () => {
  assert.ok(planLiftSessionsTarget(90, 0, 4, 'strength') <= 2);
});

test('planLiftSessionsTarget respects the strength/cardio/sport priority cap', () => {
  assert.ok(planLiftSessionsTarget(0, 0, 4, 'cardio') <= 2);
  assert.ok(planLiftSessionsTarget(0, 0, 4, 'strength') <= 4);
});

test('planLiftSessionsTarget returns 0 when there are no available muscle buckets at all', () => {
  assert.equal(planLiftSessionsTarget(0, 0, 0, 'strength'), 0);
});

test('planCardioSessionsTarget is highest under the cardio priority', () => {
  assert.ok(planCardioSessionsTarget(0, 'cardio') > planCardioSessionsTarget(0, 'strength'));
});

test('generateWeeklyGuidance zeroes out lift sessions when every muscle bucket is offline', () => {
  const allMuscles = Object.values(MUSCLE_GROUPS).flat();
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: allMuscles, dataMature: true,
  });
  assert.equal(guidance.liftSessionsTarget, 0);
  assert.equal(guidance.muscleFocus.length, 0);
  // Cardio isn't gated by muscle-bucket availability (a shoulder injury
  // shouldn't block a legs-only cardio session), so it's still recommended.
  assert.ok(guidance.cardioSessionsTarget > 0);
});

test('generateWeeklyGuidance gives a recovery-only rationale only when BOTH lift and cardio bottom out', () => {
  const allMuscles = Object.values(MUSCLE_GROUPS).flat();
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 95, offlineMuscles: allMuscles, dataMature: true,
  });
  assert.equal(guidance.liftSessionsTarget, 0);
  assert.equal(guidance.cardioSessionsTarget, 0);
  assert.match(guidance.rationale, /recovery/i);
});

test('generateWeeklyGuidance ranks muscleFocus freshest-first', () => {
  const fatigue = { chest: 80, 'front-delt': 80, 'mid-delt': 80, triceps: 80 }; // push fried, everything else fresh
  const guidance = generateWeeklyGuidance({ currentFatigue: fatigue, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true });
  const names = guidance.muscleFocus.map(b => b.name);
  assert.notEqual(names[0], 'push', 'push is fatigued, should not rank first');
});
