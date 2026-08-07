const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeMusclePriority, scoreBucket, generateWeeklyGuidance,
  pickBackboneExercises, weightedCoverage, planLiftSessionsTarget, planCardioSessionsTarget,
  stalenessBoost, MUSCLE_GROUPS, FATIGUE_CEILING, FOCUS_MUSCLE_BONUS, DEPRIORITISE_PENALTY,
} = require('../functions/weeklyPlanner');
const { EXERCISE_DB } = require('../functions/exerciseDb');

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

test('computeMusclePriority gives a self-declared "focus" muscle a flat priority bonus', () => {
  const priority = computeMusclePriority({ quads: 40, chest: 40 }, [], null, { quads: 'focus' });
  assert.equal(priority.quads, 60 + FOCUS_MUSCLE_BONUS);
  assert.equal(priority.chest, 60, 'a muscle not marked focus should be unaffected');
});

test('a "focus" bonus cannot rescue a muscle that is still over the fatigue ceiling', () => {
  const priority = computeMusclePriority({ quads: FATIGUE_CEILING }, [], null, { quads: 'focus' });
  assert.equal(priority.quads, -1, 'hard exclusion wins over an additive bonus');
});

test('computeMusclePriority does not itself special-case "ignore" — that is the caller\'s job via offlineMuscles', () => {
  // Confirms the documented split of responsibility: computeMusclePriority
  // only ever sees an 'ignore' value through the muscleFocus param for the
  // (irrelevant) focus-bonus check; ignoring a muscle happens by the caller
  // folding it into offlineMuscles instead, so passing 'ignore' here alone
  // should NOT exclude the muscle.
  const priority = computeMusclePriority({ quads: 40 }, [], null, { quads: 'ignore' });
  assert.equal(priority.quads, 60, 'muscleFocus:"ignore" alone (without also being in offlineMuscles) should not exclude');
});

test('scoreBucket returns null when every muscle in the bucket is unavailable', () => {
  const priority = computeMusclePriority({ chest: 100, 'front-delt': 100, 'mid-delt': 100, triceps: 100, serratus: 100 }, []);
  assert.equal(scoreBucket(MUSCLE_GROUPS.push, priority), null);
});

test('bucket weighting: a genuinely fatigued major-muscle bucket does not read as falsely fresh off assistor muscles alone', () => {
  // lats/rhomboids/traps/rear-delt over the ceiling (excluded outright);
  // biceps/forearms fatigued but still just under it, so they stay in the
  // average at reduced priority and keep dragging the score down even once
  // the fully-capped majors drop out — otherwise only the fresh assistors
  // (rotator-cuff/brachialis/etc.) would be left to represent the bucket.
  const fatigue = { lats: 80, rhomboids: 75, traps: 70, 'rear-delt': 70, biceps: FATIGUE_CEILING - 1, forearms: FATIGUE_CEILING - 5 };
  const priority = computeMusclePriority(fatigue, []);
  const pull = scoreBucket(MUSCLE_GROUPS.pull, priority);
  const push = scoreBucket(MUSCLE_GROUPS.push, priority);
  assert.ok(pull.score < push.score, 'a fried-back pull bucket should score well below an untouched push bucket');
  assert.ok(pull.score < 75, `pull score too close to fresh: ${pull.score}`);
});

test('scoreBucket reads 100 when every muscle in the bucket is fully fresh', () => {
  const priority = computeMusclePriority({}, []);
  // Math.round, not a raw equality check -- a 5-muscle weighted average
  // (push now includes serratus alongside chest/front-delt/mid-delt/
  // triceps) can land at 99.99999999999999 from floating-point division,
  // not exactly 100, even though every muscle's own priority is 100.
  assert.equal(Math.round(scoreBucket(MUSCLE_GROUPS.push, priority).score), 100);
});

test('pickBackboneExercises prefers compounds covering more target muscles, excludes lesserKnown', () => {
  const picks = pickBackboneExercises(MUSCLE_GROUPS.push, { count: 2 });
  assert.equal(picks.length, 2);
  for (const p of picks) assert.equal(p.lesserKnown, false);
});

// count: 0 is how functions/index.js's full-body auto-generator skips
// backbone/compound picking entirely when the athlete's compound/isolation
// preference is set to isolation (routing every target muscle through the
// isolation-aware accessory picker instead) -- previously the loop's
// boundary check ran AFTER pushing, so count: 0 still returned exactly one
// exercise instead of none, silently defeating the isolation preference by
// always keeping one compound in the session (e.g. Back Squat).
test('pickBackboneExercises returns nothing for count: 0, not one exercise', () => {
  const picks = pickBackboneExercises(['quads', 'glutes', 'hamstrings'], { count: 0 });
  assert.deepEqual(picks, []);
});

test('pickBackboneExercises excludes isometric holds even when not lesserKnown', () => {
  const picks = pickBackboneExercises(['transverse-abs', 'obliques'], { count: 5 });
  assert.ok(!picks.some(p => p.isometric), 'no isometric exercise should ever be picked as a backbone lift');
});

test('pickBackboneExercises excludes core hold/rollout exercises with no real load progression, but not travelMode', () => {
  const picks = pickBackboneExercises(['abs', 'transverse-abs'], { count: 10 });
  assert.ok(!picks.some(p => p.name === 'Dead Bug'), 'Dead Bug has no external-load progression path and should never be picked outside travelMode');
  assert.ok(!picks.some(p => p.name === 'Ab Wheel Rollout'), 'Ab Wheel Rollout progresses via lever/ROM, not weight, and should never be picked outside travelMode');

  const travelPicks = pickBackboneExercises(['abs', 'transverse-abs'], { count: 10, travelMode: true });
  assert.ok(travelPicks.some(p => p.name === 'Dead Bug'), 'travelMode has no equipment access, so bodyweight-only core work is the best available option');
});

test('pickBackboneExercises does NOT exclude bodyweight-tagged core exercises that are routinely weighted in practice', () => {
  // favoriteExercises forces it to the top of the ranking among the other
  // same-pattern (rotation) oblique candidates the same-function guard
  // would otherwise dedupe against — this test is specifically checking
  // Russian Twist survives the hold/rollout filter, not that it wins a
  // ranking contest unassisted.
  const picks = pickBackboneExercises(['obliques'], { count: 1, favoriteExercises: ['Russian Twist'] });
  assert.equal(picks[0]?.name, 'Russian Twist', 'Russian Twist is tagged bodyweight but its own curveNote documents adding a plate/medicine ball — a rotation pattern, not hold/rollout, so it should stay eligible');
});

test('pickBackboneExercises excludes bodyweight exercises generally, not just core hold/rollout', () => {
  const picks = pickBackboneExercises(['chest', 'triceps', 'front-delt'], { count: 20 });
  assert.ok(!picks.some(p => p.name === 'Push-Up'), 'plain bodyweight Push-Up has no real load progression path outside travelMode');
});

test('pickBackboneExercises does NOT exclude "Weighted X" bodyweight-tagged exercises — they ARE the load-progression path', () => {
  const picks = pickBackboneExercises(['chest', 'triceps', 'front-delt'], { count: 20, favoriteExercises: ['Weighted Push-Up'] });
  assert.ok(picks.some(p => p.name === 'Weighted Push-Up'), 'Weighted Push-Up is tagged equipment bodyweight but progresses via real added load, unlike plain Push-Up');
});

test('pickBackboneExercises excludeNames keeps an exercise from being picked twice across separate calls', () => {
  const first = pickBackboneExercises(['forearms'], { count: 1 });
  assert.ok(first.length, 'sanity check: forearms has at least one real pick available');
  const excludeNames = new Set(first.map(e => e.name));
  const second = pickBackboneExercises(['forearms'], { count: 1, excludeNames });
  assert.ok(!second.some(e => excludeNames.has(e.name)), 'an exercise already used elsewhere in the session should not be picked again');
});

test('pickBackboneExercises heavily prefers a previously-logged exercise over an equal-coverage untried one', () => {
  const unbiased = pickBackboneExercises(['chest', 'front-delt'], { count: 1 });
  assert.notEqual(unbiased[0].name, 'Dumbbell Incline Bench Press', 'sanity check: without history this should not already be the top pick');

  const lifts = [{ date: '2026-07-01', exercise: 'Dumbbell Incline Bench Press', kg: 30, reps: 8 }];
  const picks = pickBackboneExercises(['chest', 'front-delt'], { lifts, count: 1 });
  assert.equal(picks[0].name, 'Dumbbell Incline Bench Press', 'a logged exercise should outrank an equal-coverage exercise that has never been logged');
});

test('pickBackboneExercises prefers a self-reported favorite over an equal-coverage untried one, but real logged history still wins over a favorite', () => {
  const favoritePicks = pickBackboneExercises(['chest', 'front-delt'], { favoriteExercises: ['Dumbbell Incline Bench Press'], count: 1 });
  assert.equal(favoritePicks[0].name, 'Dumbbell Incline Bench Press', 'a self-reported favorite should outrank an equal-coverage exercise with neither history nor favorite status');

  const lifts = [{ date: '2026-07-01', exercise: 'Barbell Bench Press', kg: 80, reps: 5 }];
  const contestedPicks = pickBackboneExercises(['chest', 'front-delt'], { lifts, favoriteExercises: ['Dumbbell Incline Bench Press'], count: 1 });
  assert.equal(contestedPicks[0].name, 'Barbell Bench Press', 'demonstrated logged history should still outrank a merely self-reported favorite');
});

test('pickBackboneExercises never picks two exercises with the same pattern for an overlapping muscle', () => {
  // Two genuinely distinct muscle needs (chest vs. quads, no shared primary)
  // -- both get their own backbone pick, and they can't be a same-pattern
  // overlapping pair since nothing they cover overlaps at all.
  const picks = pickBackboneExercises(['chest', 'quads'], { count: 2 });
  assert.equal(picks.length, 2);
  const [a, b] = picks;
  const sameFunctionOverlap = a.pattern === b.pattern && a.primary.some(m => b.primary.includes(m));
  assert.ok(!sameFunctionOverlap, `expected genuinely different work, got two ${a.pattern} picks sharing a muscle: ${a.name} + ${b.name}`);
});

// Sumo Deadlift + Box Squat (both hinge/squat-pattern, both hitting
// glutes+hamstrings+quads) was the real case this covers: a compound
// scoring on raw target-muscle count will keep "winning" with near-
// identical lower-body lifts even though their patterns differ, unless
// something also checks whether the second pick adds any muscle the first
// one didn't already cover.
test('pickBackboneExercises does not pad to count with a second compound that adds no new muscle coverage', () => {
  const picks = pickBackboneExercises(['chest', 'triceps', 'front-delt'], { count: 2 });
  assert.equal(picks.length, 1, 'one compound (Barbell Bench Press) already covers every target muscle here -- a second pick would be pure overlap, not real variety');
  assert.equal(picks[0].name, 'Barbell Bench Press');
});

// travelMode is the intended exception: bodyweight-only equipment means real
// alternatives are scarce, so stacking two exercises on the same muscle (no
// meaningfully different option exists) is the "very specific reason" the
// no-new-coverage rule above is meant to require, not a violation of it.
test('pickBackboneExercises still allows overlapping-muscle picks in travelMode, where equipment is too scarce to diversify', () => {
  const picks = pickBackboneExercises(['abs', 'transverse-abs'], { count: 10, travelMode: true });
  assert.ok(picks.some(p => p.name === 'Dead Bug'));
  assert.ok(picks.some(p => p.name === 'Ab Wheel Rollout'));
});

// Chest Dips: primary ['chest', 'triceps'], curated EMG {chest: 31.7,
// triceps: 38} — triceps is the exercise's real dominant mover despite chest
// being listed first. The old array-position formula would have scored
// triceps at only 1/(1+1)=0.5 (second in the array) and chest at 1/(0+1)=1
// (first) — exactly backwards from what the muscle actually experiences.
test('weightedCoverage uses real EMG data to outrank array position, not just follow it', () => {
  const chestDips = EXERCISE_DB.find(e => e.name === 'Chest Dips');
  const forTriceps = weightedCoverage(chestDips, ['triceps']);
  const forChest = weightedCoverage(chestDips, ['chest']);
  assert.ok(Math.abs(forTriceps - 1) < 1e-9, `triceps is Chest Dips' own peak primary muscle, should score 1.0, got ${forTriceps}`);
  assert.ok(Math.abs(forChest - 31.7 / 38) < 1e-9, `chest should score its real ratio to the peak (31.7/38), got ${forChest}`);
  assert.ok(forTriceps > forChest, 'the real dominant mover (triceps) should outscore the array-first muscle (chest) here, the opposite of the old ordinal formula');
});

test('weightedCoverage falls back to the old array-position formula when the exercise has no curated EMG profile', () => {
  const shoulderPress = EXERCISE_DB.find(e => e.name === 'Machine Shoulder Press'); // ['front-delt', 'mid-delt'], no profile
  assert.ok(Math.abs(weightedCoverage(shoulderPress, ['front-delt']) - 1) < 1e-9);
  assert.ok(Math.abs(weightedCoverage(shoulderPress, ['mid-delt']) - 0.5) < 1e-9);
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

test('planCardioSessionsTarget raises a strength-priority week to the fat-loss floor, but does not lower an already-higher cardio-priority week', () => {
  assert.equal(planCardioSessionsTarget(0, 'strength', 2), 2);
  assert.equal(planCardioSessionsTarget(0, 'cardio', 2), planCardioSessionsTarget(0, 'cardio'));
});

test('planCardioSessionsTarget still applies the high-CNS trim on top of the fat-loss floor', () => {
  assert.equal(planCardioSessionsTarget(90, 'strength', 2), 1);
});

test('generateWeeklyGuidance guarantees a cardio floor when a fatLoss goal is active, even under strength priority', () => {
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true,
    trainingPriority: 'strength', fatLossGoalActive: true,
  });
  assert.ok(guidance.cardioSessionsTarget >= 2, `expected a cardio floor, got ${guidance.cardioSessionsTarget}`);
});

test('generateWeeklyGuidance zeroes out lift sessions when every muscle bucket is offline', () => {
  const allMuscles = Object.values(MUSCLE_GROUPS).flat();
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: allMuscles, dataMature: true,
    preferredSplit: 'Push / Pull / Legs',
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
    preferredSplit: 'Push / Pull / Legs',
  });
  assert.equal(guidance.liftSessionsTarget, 0);
  assert.equal(guidance.cardioSessionsTarget, 0);
  assert.match(guidance.rationale, /recovery/i);
});

test('generateWeeklyGuidance ranks muscleFocus freshest-first', () => {
  const fatigue = { chest: 80, 'front-delt': 80, 'mid-delt': 80, triceps: 80, serratus: 80 }; // push fried, everything else fresh
  const guidance = generateWeeklyGuidance({
    currentFatigue: fatigue, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true,
    preferredSplit: 'Push / Pull / Legs',
  });
  const names = guidance.muscleFocus.map(b => b.name);
  assert.notEqual(names[0], 'push', 'push is fatigued, should not rank first');
});

test('generateWeeklyGuidance clamps displayed freshness to 100 even though the staleness boost can push internal priority above it', () => {
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true,
    preferredSplit: 'Push / Pull / Legs',
  });
  for (const b of guidance.muscleFocus) assert.ok(b.freshness <= 100, `${b.name} freshness ${b.freshness} exceeds 100`);
});

test('generateWeeklyGuidance defaults to per-muscle focus (no fixed push/pull/legs/core buckets) when no preferredSplit is given', () => {
  const guidance = generateWeeklyGuidance({ currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true });
  const names = guidance.muscleFocus.map(b => b.name);
  // 'push'/'pull'/'legs' are the fixed bucket names, not real individual
  // muscles -- 'core' isn't checked here since it's *also* a genuine
  // PRIMARY_MUSCLES entry in its own right (a generic core-only exercise
  // tag), so it legitimately appears as a real single-muscle bucket too.
  assert.ok(!names.includes('push') && !names.includes('pull') && !names.includes('legs'),
    'Full Body (the default) should never bucket into the fixed named groups');
  assert.ok(names.includes('quads'), 'should surface individual muscles instead');
  for (const b of guidance.muscleFocus) assert.equal(b.muscles.length, 1, `${b.name} should be a single-muscle bucket in Full Body mode`);
});

test('generateWeeklyGuidance with a named preferredSplit groups muscleFocus the same way session generation groups that split', () => {
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true,
    preferredSplit: 'Upper / Lower',
  });
  const names = guidance.muscleFocus.map(b => b.name).sort();
  assert.deepEqual(names, ['lower', 'upper']);
});

test('stalenessBoost stays at 0 within a normal week, then ramps up, capping in the atrophy-risk zone beyond 3 weeks', () => {
  assert.equal(stalenessBoost(0), 0);
  assert.equal(stalenessBoost(7), 0);
  assert.ok(stalenessBoost(10) > 0 && stalenessBoost(10) < stalenessBoost(14));
  assert.ok(stalenessBoost(21) > stalenessBoost(14));
  assert.ok(stalenessBoost(30) > stalenessBoost(21));
  assert.equal(stalenessBoost(40), stalenessBoost(90), 'boost should cap rather than grow unbounded');
});

test('stalenessBoost treats "never trained" the same as roughly 3 weeks overdue', () => {
  assert.equal(stalenessBoost(null), stalenessBoost(21));
  assert.equal(stalenessBoost(undefined), stalenessBoost(21));
});

test('computeMusclePriority without staleness data behaves exactly as before (backward compatible)', () => {
  const fatigue = { quads: 20 };
  const withoutStaleness = computeMusclePriority(fatigue, []);
  assert.equal(withoutStaleness.quads, 80, 'no staleness data passed should mean no boost applied at all');
});

test('computeMusclePriority with staleness data prioritizes a neglected-but-fresh muscle over a recently-hit-but-fresh one', () => {
  const fatigue = {}; // everything fully recovered
  const staleness = { quads: 25, chest: 2 }; // quads neglected 25 days, chest hit 2 days ago
  const priority = computeMusclePriority(fatigue, [], staleness);
  assert.ok(priority.quads > priority.chest, 'a muscle 25 days overdue should outrank one merely fresh from a recent light hit');
});

test('computeMusclePriority still excludes over-ceiling/offline muscles even with staleness data (staleness cannot override a hard exclusion)', () => {
  const fatigue = { quads: FATIGUE_CEILING };
  const staleness = { quads: 60 }; // very overdue, but also currently over the fatigue ceiling
  const priority = computeMusclePriority(fatigue, [], staleness);
  assert.equal(priority.quads, -1);
});

test('pickBackboneExercises attaches a recommended angle to an isAngleFamily pick, for the specific muscle it\'s being credited for', () => {
  // serratus has thin coverage among static (non-family) entries -- an
  // isAngleFamily fly should win and carry idealAngleForMuscle('fly','serratus').
  const { idealAngleForMuscle } = require('../functions/emgActivation');
  const picks = pickBackboneExercises(['serratus'], { count: 1 });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].isAngleFamily, true);
  assert.equal(picks[0].angle, idealAngleForMuscle(picks[0].pattern, 'serratus'));
});

test('pickBackboneExercises never mutates the shared EXERCISE_DB entry when attaching an angle', () => {
  const { EXERCISE_DB } = require('../functions/exerciseDb');
  pickBackboneExercises(['serratus'], { count: 1 });
  pickBackboneExercises(['lats'], { count: 2 }); // a second, different-muscle call
  const dbEntry = EXERCISE_DB.find(e => e.isAngleFamily && e.pattern === 'fly');
  assert.equal(dbEntry.angle, undefined, 'the underlying EXERCISE_DB entry must never carry an angle -- only shallow copies returned to callers should');
});

test('generateWeeklyGuidance threads muscleLastTrainedDays through so the displayed freshness reflects atrophy-risk too', () => {
  // legs untouched a long time, everything else recently hit -- legs
  // bucket should rank ahead of a merely-fresh bucket once staleness counts.
  const staleness = { quads: 40, glutes: 40 };
  const guidance = generateWeeklyGuidance({
    currentFatigue: {}, weekMetabolic: 0, weekCNS: 0, offlineMuscles: [], dataMature: true,
    muscleLastTrainedDays: staleness, preferredSplit: 'Push / Pull / Legs',
  });
  const legs = guidance.muscleFocus.find(b => b.name === 'legs');
  const push = guidance.muscleFocus.find(b => b.name === 'push');
  assert.ok(legs.freshness >= push.freshness, 'a bucket with genuinely overdue muscles should not rank behind an unremarkable-freshness bucket');
});

// ---------------------------------------------------------------------------
// Deprioritise vs Avoid. These are two different things and the whole point of
// the setting is that they behave differently: Avoid removes a muscle from
// selection, Deprioritise only ranks it last while keeping it fully modelled.
// ---------------------------------------------------------------------------

test('deprioritise lowers a muscle by exactly the mirror of the focus bonus', () => {
  const fatigue = { chest: 10 };
  const normal = computeMusclePriority(fatigue, [], null, {});
  const down = computeMusclePriority(fatigue, [], null, { chest: 'deprioritise' });
  const up = computeMusclePriority(fatigue, [], null, { chest: 'focus' });
  assert.equal(normal.chest - down.chest, DEPRIORITISE_PENALTY);
  assert.equal(up.chest - normal.chest, FOCUS_MUSCLE_BONUS);
});

// The distinction that makes the setting worth having: a deprioritised muscle
// is still trainable, still accrues fatigue, still recovers. Only its ranking
// changes. An avoided muscle leaves selection entirely.
test('deprioritise keeps a muscle selectable, avoid does not', () => {
  const fatigue = { chest: 10 };
  const deprioritised = computeMusclePriority(fatigue, [], null, { chest: 'deprioritise' });
  assert.ok(deprioritised.chest >= 0, 'deprioritise must not exclude');

  // 'ignore' reaches computeMusclePriority as an offlineMuscles entry — that is
  // how functions/index.js folds it in.
  const avoided = computeMusclePriority(fatigue, ['chest'], null, { chest: 'ignore' });
  assert.equal(avoided.chest, -1);
});

test('a deprioritised muscle still appears in its bucket, just ranked lower', () => {
  const fatigue = { chest: 10, 'front-delt': 10, triceps: 10, 'mid-delt': 10, serratus: 10 };
  const priority = computeMusclePriority(fatigue, [], null, { chest: 'deprioritise' });
  const bucket = scoreBucket(MUSCLE_GROUPS.push, priority);
  assert.ok(bucket.muscles.includes('chest'), 'chest dropped out of the bucket entirely');
  assert.ok(priority.chest < priority['front-delt'], 'chest should rank below an unmodified peer');
});

// -1 is the sentinel for "do not load". A penalty must never reach it, or
// deprioritise silently becomes avoid.
test('deprioritise can never reach the exclusion sentinel', () => {
  const focus = {};
  const fatigue = {};
  for (const m of MUSCLE_GROUPS.push) { focus[m] = 'deprioritise'; fatigue[m] = FATIGUE_CEILING - 1; }
  const priority = computeMusclePriority(fatigue, [], null, focus);
  for (const m of MUSCLE_GROUPS.push) {
    assert.ok(priority[m] >= 0, `${m} fell to ${priority[m]}`);
    assert.notEqual(priority[m], -1);
  }
});

test('an unrecognised muscleFocus value is treated as normal, not as a penalty', () => {
  const fatigue = { chest: 10 };
  const normal = computeMusclePriority(fatigue, [], null, {});
  const odd = computeMusclePriority(fatigue, [], null, { chest: 'whatever' });
  assert.equal(odd.chest, normal.chest);
});
