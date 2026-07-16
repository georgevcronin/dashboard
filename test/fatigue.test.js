const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeStructuralFatigue, musclePeaksFromLifts, applyInjuryTaper,
  injuryFatiguePenalty, computeACWR, computePerformanceTrend, computeCNSFatigue,
  computeMuscleLastTrainedDays, fatigueTimeline,
} = require('../functions/fatigue');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('computeStructuralFatigue decays toward 0 as time passes', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const peaks = { quads: 2000 };
  const fresh = computeStructuralFatigue(lifts, peaks, [], {});
  const old = computeStructuralFatigue(
    [{ date: daysAgo(10), exercise: 'Back Squat', kg: 100, reps: 8 }], peaks, [], {},
  );
  assert.ok(fresh.quads > (old.quads || 0), 'fatigue should decay significantly after 10 days');
  assert.ok((old.quads || 0) < 5, 'fatigue should be nearly fully decayed after 10 days');
});

test('computeStructuralFatigue excludes lifts older than the 336h (14-day) window entirely', () => {
  const lifts = [{ date: daysAgo(20), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const out = computeStructuralFatigue(lifts, { quads: 2000 }, [], {});
  assert.equal(out.quads, undefined, 'lifts older than 336h should not contribute at all');
});

test('computeStructuralFatigue accepts a recoveryHours override (personalization hook)', () => {
  const lifts = [{ date: daysAgo(2), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const peaks = { quads: 2000 };
  const fastRecovery = computeStructuralFatigue(lifts, peaks, [], {}, { quads: 24 });
  const slowRecovery = computeStructuralFatigue(lifts, peaks, [], {}, { quads: 200 });
  assert.ok(fastRecovery.quads < slowRecovery.quads, 'shorter half-life should decay faster');
});

test('computeStructuralFatigue does not misattribute Cable exercises to abs', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Cable Crossover', kg: 20, reps: 12 }];
  const out = computeStructuralFatigue(lifts, { chest: 500 }, [], {});
  assert.equal(out.abs, undefined, 'Cable Crossover should not produce an abs fatigue score');
});

test('musclePeaksFromLifts finds the single highest-volume day per muscle', () => {
  const lifts = [
    { date: '2026-01-01', exercise: 'Back Squat', kg: 100, reps: 5 }, // 500
    { date: '2026-01-01', exercise: 'Back Squat', kg: 100, reps: 5 }, // 500 (same day, sums)
    { date: '2026-01-08', exercise: 'Back Squat', kg: 80, reps: 5 },  // 400
  ];
  const peaks = musclePeaksFromLifts(lifts);
  assert.equal(peaks.quads, 1000);
});

test('musclePeaksFromLifts prefers a recent (90-day) peak over a bigger old one, so an old specialization day cannot permanently suppress fatigue%', () => {
  // A dedicated leg day ~2 years ago stacked 4 quad exercises into one big
  // day; a recent full-body session's single quad exercise is much smaller
  // in isolation but should still register as meaningfully close to peak
  // for a lifter who now trains full-body, not against a 2-year-old outlier.
  const lifts = [
    { date: daysAgo(700), exercise: 'Back Squat', kg: 100, reps: 8 },       // 800
    { date: daysAgo(700), exercise: 'Leg Press', kg: 200, reps: 10 },       // 2000
    { date: daysAgo(700), exercise: 'Leg Extension', kg: 60, reps: 12 },    // 720
    { date: daysAgo(700), exercise: 'Hack Squat (Machine)', kg: 80, reps: 10 }, // 800
    { date: daysAgo(1), exercise: 'Back Squat', kg: 100, reps: 8 },         // 800
  ];
  const peaks = musclePeaksFromLifts(lifts);
  assert.equal(peaks.quads, 800, 'should use the recent 800 peak, not the 2-year-old 4320 total');

  const fatigue = computeStructuralFatigue(lifts, peaks, [], {});
  assert.ok(fatigue.quads > 50, `a full-body session done yesterday should read well above 50% fatigue, got ${fatigue.quads}%`);
});

test('musclePeaksFromLifts falls back to the all-time peak for a muscle with nothing in the last 90 days', () => {
  const lifts = [{ date: daysAgo(700), exercise: 'Barbell Curl', kg: 40, reps: 8 }]; // 320
  const peaks = musclePeaksFromLifts(lifts);
  assert.equal(peaks.biceps, 320, 'a muscle untouched recently should still get a usable (all-time) peak, not undefined/0');
});

test('injuryFatiguePenalty tapers linearly from 100 to 0 over the healing window', () => {
  const now = Date.now();
  const freshInjury = { severity: 'mild', ts: now };
  const halfHealed = { severity: 'mild', ts: now - 5 * 86400000 }; // 5 of 10 days
  const fullyHealed = { severity: 'mild', ts: now - 20 * 86400000 };
  assert.equal(injuryFatiguePenalty(freshInjury, now), 100);
  assert.equal(injuryFatiguePenalty(halfHealed, now), 50);
  assert.equal(injuryFatiguePenalty(fullyHealed, now), 0);
});

test('applyInjuryTaper raises fatigue for injured muscles without lowering it', () => {
  const fatigue = { quads: 20 };
  const injuries = [{ severity: 'severe', ts: Date.now(), muscles: ['quads'], resolved: false }];
  const out = applyInjuryTaper(fatigue, injuries);
  assert.equal(out.quads, 100, 'fresh severe injury should push fatigue to 100 regardless of prior value');
});

test('applyInjuryTaper ignores resolved injuries', () => {
  const fatigue = { quads: 20 };
  const injuries = [{ severity: 'severe', ts: Date.now(), muscles: ['quads'], resolved: true }];
  const out = applyInjuryTaper(fatigue, injuries);
  assert.equal(out.quads, 20);
});

test('computeACWR returns null with insufficient history', () => {
  assert.equal(computeACWR([]), null);
});

test('computeACWR flags overreach when acute load exceeds chronic baseline', () => {
  const lifts = [];
  // 4 weeks of steady 1000/week baseline load
  for (let w = 1; w <= 4; w++) lifts.push({ date: daysAgo(w * 7), exercise: 'Back Squat', kg: 100, reps: 10 });
  // huge spike this week
  lifts.push({ date: daysAgo(1), exercise: 'Back Squat', kg: 500, reps: 10 });
  const acwr = computeACWR(lifts);
  assert.ok(acwr > 1.5, `expected overreach signal, got ${acwr}`);
});

test('computePerformanceTrend groups the same exercise across differently-cased log entries', () => {
  const lifts = [
    { date: daysAgo(20), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(19), exercise: 'Barbell Bench Press', kg: 100, reps: 5 },
    { date: daysAgo(2), exercise: 'barbell bench press', kg: 80, reps: 5 },
    { date: daysAgo(1), exercise: 'barbell bench press', kg: 80, reps: 5 },
  ];
  const trend = computePerformanceTrend(lifts);
  assert.ok(trend != null, 'differently-cased logs of the same exercise should merge into one trend bucket');
  assert.ok(trend > 0, 'weight dropped from 100kg to 80kg, should register as a positive decrement (declining performance)');
});

test('computeCNSFatigue counts Power Clean as CNS-taxing', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Power Clean', kg: 80, reps: 3 }];
  const out = computeCNSFatigue(lifts);
  assert.ok(out > 0, 'Power Clean should register CNS fatigue');
});

test('computeCNSFatigue does not count isolation exercises', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Hammer Curl', kg: 15, reps: 10 }];
  const out = computeCNSFatigue(lifts);
  assert.equal(out, 0);
});

test('computeMuscleLastTrainedDays returns days since the most recent PRIMARY-target exercise per muscle', () => {
  const lifts = [
    { date: daysAgo(20), exercise: 'Back Squat', kg: 100, reps: 8 },
    { date: daysAgo(2), exercise: 'Barbell Bench Press', kg: 80, reps: 8 },
  ];
  const out = computeMuscleLastTrainedDays(lifts);
  assert.ok(Math.abs(out.quads - 20) < 1);
  assert.ok(Math.abs(out.chest - 2) < 1);
  assert.equal(out['mid-delt'], undefined, 'a muscle never hit as a primary target should have no entry');
});

test('computeMuscleLastTrainedDays takes the most recent occurrence, not the first', () => {
  const lifts = [
    { date: daysAgo(30), exercise: 'Back Squat', kg: 90, reps: 8 },
    { date: daysAgo(3), exercise: 'Back Squat', kg: 100, reps: 8 },
  ];
  const out = computeMuscleLastTrainedDays(lifts);
  assert.ok(Math.abs(out.quads - 3) < 1);
});

test('computeMuscleLastTrainedDays only counts PRIMARY targets, not secondary', () => {
  // Barbell Bench Press: primary chest/triceps/front-delt, secondary serratus/core.
  const lifts = [{ date: daysAgo(5), exercise: 'Barbell Bench Press', kg: 80, reps: 8 }];
  const out = computeMuscleLastTrainedDays(lifts);
  assert.ok('chest' in out);
  assert.ok(!('serratus' in out), 'secondary-only muscles should not count as a genuine training focus');
});

test('fatigueTimeline reports zero fatigue for the very first lift of a muscle', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'Back Squat', kg: 100, reps: 8 }];
  const out = fatigueTimeline(lifts, { quads: 2000 });
  assert.equal(out[0].quads, 0, 'no prior history means no fatigue going into the first lift');
});

test('fatigueTimeline shows elevated fatigue for a second lift shortly after a heavy first one', () => {
  const lifts = [
    { date: daysAgo(2), exercise: 'Back Squat', kg: 150, reps: 8 },
    { date: daysAgo(1), exercise: 'Front Squat', kg: 80, reps: 8 },
  ];
  const out = fatigueTimeline(lifts, { quads: 2000 });
  assert.ok(out[1].quads > 0, 'quads fatigue from the prior squat session should carry into the next day');
});

test('fatigueTimeline is order-independent — results align with lifts regardless of input array order', () => {
  const early = { date: daysAgo(5), exercise: 'Back Squat', kg: 150, reps: 8 };
  const late = { date: daysAgo(1), exercise: 'Front Squat', kg: 80, reps: 8 };
  const forward = fatigueTimeline([early, late], { quads: 2000 });
  const reversed = fatigueTimeline([late, early], { quads: 2000 });
  assert.equal(forward[1].quads, reversed[0].quads, 'the later lift should see the same fatigue-before value regardless of array order');
});

test('fatigueTimeline decays fatigue toward 0 the further apart two sessions are', () => {
  const near = fatigueTimeline([
    { date: daysAgo(2), exercise: 'Back Squat', kg: 150, reps: 8 },
    { date: daysAgo(1), exercise: 'Front Squat', kg: 80, reps: 8 },
  ], { quads: 2000 });
  const far = fatigueTimeline([
    { date: daysAgo(20), exercise: 'Back Squat', kg: 150, reps: 8 },
    { date: daysAgo(1), exercise: 'Front Squat', kg: 80, reps: 8 },
  ], { quads: 2000 });
  assert.ok(near[1].quads > far[1].quads, 'a squat session 20 days prior should leave far less residual fatigue than one 1 day prior');
});

test('fatigueTimeline keeps muscles independent — an untouched muscle is not present in the fatigue map', () => {
  const lifts = [
    { date: daysAgo(1), exercise: 'Back Squat', kg: 150, reps: 8 },
    { date: daysAgo(0), exercise: 'Barbell Curl', kg: 40, reps: 6 },
  ];
  const out = fatigueTimeline(lifts, { quads: 2000, biceps: 500 });
  assert.equal(out[1].quads, undefined, 'a Barbell Curl session should not carry quads fatigue in its own entry');
});
