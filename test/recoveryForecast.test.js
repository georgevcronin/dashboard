const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hoursToDecayTo, forecastMuscleRecovery, forecastCNS, buildRecoveryForecast,
  CNS_HALF_LIFE_H, CNS_HEAVY_THRESHOLD, CNS_CLEAR_THRESHOLD,
} = require('../functions/recoveryForecast');
const { computeStructuralFatigue, musclePeaksFromLifts } = require('../functions/fatigue');
const { RECOVERY_H } = require('../functions/muscleTaxonomy');
const { FATIGUE_CEILING } = require('../functions/weeklyPlanner');

// ---------------------------------------------------------------------------
// The claim the module rests on: this is an inversion of the decay the app
// already runs, so projecting forward must agree with what
// computeStructuralFatigue actually returns once that time has passed.
//
// Shifts are whole days because fatigue.js's liftTime resolves a lift to
// midnight on its date (nothing ever writes `start`). A sub-day shift collapses
// onto the same calendar day and doesn't move the model at all.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const isoOf = ms => new Date(ms).toISOString().slice(0, 10);

function sessionAgedBy(days, now) {
  const t = now - days * DAY_MS;
  return Array.from({ length: 10 }, () => ({
    date: isoOf(t), exercise: 'Barbell Squat', kg: 210, reps: 5,
  }));
}

test('projecting forward matches computeStructuralFatigue at whole-day offsets', () => {
  const now = Date.now();
  const peaks = musclePeaksFromLifts(sessionAgedBy(0, now));
  const base = computeStructuralFatigue(sessionAgedBy(0, now), peaks, [], {});
  assert.ok(Object.keys(base).length > 0, 'expected the fixture to produce fatigue');

  for (const days of [1, 2, 3]) {
    const actual = computeStructuralFatigue(sessionAgedBy(days, now), peaks, [], {});
    for (const [muscle, startValue] of Object.entries(base)) {
      const halfLifeH = RECOVERY_H[muscle] || 72;
      const predicted = Math.round(startValue * Math.pow(2, -(days * 24) / halfLifeH));
      assert.ok(Math.abs(actual[muscle] - predicted) <= 1,
        `${muscle} at +${days}d: model says ${actual[muscle]}, projection says ${predicted}`);
    }
  }
});

test('hoursToDecayTo inverts the half-life exactly', () => {
  assert.equal(hoursToDecayTo(100, 50, 48), 48);   // one half-life
  assert.equal(hoursToDecayTo(100, 25, 48), 96);   // two
  assert.equal(Math.round(hoursToDecayTo(80, 40, 24)), 24);
});

test('a value already at or below target needs no time', () => {
  assert.equal(hoursToDecayTo(50, 50, 48), 0);
  assert.equal(hoursToDecayTo(10, 50, 48), 0);
});

// A missing or unreadable fatigue value must never come back as "ready now" —
// that is the one answer that would send someone to train on no information.
test('a non-numeric fatigue yields null rather than zero hours', () => {
  assert.equal(hoursToDecayTo(undefined, 50, 48), null);
  assert.equal(hoursToDecayTo(null, 50, 48), null);
  assert.equal(hoursToDecayTo(NaN, 50, 48), null);
  const row = forecastMuscleRecovery({ quads: NaN })[0];
  assert.equal(row.ready, false);
  assert.equal(row.hoursUntilReady, null);
});

test('a nonsensical target or half-life yields null rather than Infinity', () => {
  assert.equal(hoursToDecayTo(80, 0, 48), null);
  assert.equal(hoursToDecayTo(80, 50, 0), null);
});

// ---------------------------------------------------------------------------
// Per-muscle
// ---------------------------------------------------------------------------

test('the target is the planner fatigue ceiling, the number that gates selection', () => {
  const row = forecastMuscleRecovery({ quads: 80 })[0];
  assert.equal(row.target, FATIGUE_CEILING);
});

test('each muscle is projected on its own half-life, not a shared one', () => {
  const rows = forecastMuscleRecovery({ quads: 80, erectors: 80 });
  const quads = rows.find(r => r.muscle === 'quads');
  const erectors = rows.find(r => r.muscle === 'erectors');
  assert.equal(quads.halfLifeH, RECOVERY_H.quads);
  assert.equal(erectors.halfLifeH, RECOVERY_H.erectors);
  if (RECOVERY_H.quads !== RECOVERY_H.erectors) {
    assert.notEqual(quads.hoursUntilReady, erectors.hoursUntilReady);
  }
});

test('a personalised recovery-hours override is honoured over the defaults', () => {
  const slow = forecastMuscleRecovery({ quads: 80 }, { recoveryHours: { quads: 96 } })[0];
  const fast = forecastMuscleRecovery({ quads: 80 }, { recoveryHours: { quads: 24 } })[0];
  assert.ok(slow.hoursUntilReady > fast.hoursUntilReady);
  assert.equal(slow.halfLifeH, 96);
});

// computeStructuralFatigue caps at 100, so a muscle reading exactly 100 may be
// far above it. The projection is then a floor, and has to say so.
test('a muscle pinned at the 100 cap is flagged, because its estimate is a floor', () => {
  assert.equal(forecastMuscleRecovery({ quads: 100 })[0].clamped, true);
  assert.equal(forecastMuscleRecovery({ quads: 99 })[0].clamped, false);
});

test('muscles are ordered slowest-returning first', () => {
  const rows = forecastMuscleRecovery({ quads: 90, glutes: 60, chest: 55 });
  const hours = rows.map(r => r.hoursUntilReady ?? 0);
  assert.deepEqual(hours, [...hours].sort((a, b) => b - a));
});

// ---------------------------------------------------------------------------
// CNS
// ---------------------------------------------------------------------------

test('CNS projects to the two thresholds the engine actually acts on', () => {
  const cns = forecastCNS(90);
  assert.equal(cns.halfLifeH, CNS_HALF_LIFE_H);
  assert.equal(Math.round(cns.hoursUntilHeavyTrainingAvailable),
    Math.round(hoursToDecayTo(90, CNS_HEAVY_THRESHOLD, CNS_HALF_LIFE_H)));
  assert.equal(Math.round(cns.hoursUntilFullyClear),
    Math.round(hoursToDecayTo(90, CNS_CLEAR_THRESHOLD, CNS_HALF_LIFE_H)));
  assert.ok(cns.hoursUntilFullyClear > cns.hoursUntilHeavyTrainingAvailable);
});

test('CNS already under both thresholds reports no wait', () => {
  const cns = forecastCNS(20);
  assert.equal(cns.hoursUntilHeavyTrainingAvailable, 0);
  assert.equal(cns.hoursUntilFullyClear, 0);
});

test('a missing CNS value yields null rather than a fabricated forecast', () => {
  assert.equal(forecastCNS(null), null);
  assert.equal(forecastCNS(undefined), null);
  assert.equal(forecastCNS(NaN), null);
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

test('the forecast separates what is ready now from what is still waiting', () => {
  const f = buildRecoveryForecast({ currentFatigue: { quads: 90, glutes: 20, chest: 10 }, cnsFatigue: 30 });
  assert.deepEqual(f.readyNow.sort(), ['chest', 'glutes']);
  assert.equal(f.nextReady.muscle, 'quads');
  assert.ok(f.fullyRecoveredInH > 0);
});

test('nextReady is the soonest of the waiting muscles, not the worst', () => {
  const f = buildRecoveryForecast({ currentFatigue: { quads: 95, chest: 55 } });
  assert.equal(f.nextReady.muscle, 'chest');
});

// Training again resets the clock, so this must never read as a prediction of
// the athlete's actual week.
test('the forecast declares that it assumes no further training', () => {
  assert.equal(buildRecoveryForecast({ currentFatigue: { quads: 90 } }).assumesNoTraining, true);
});

test('everything ready means no wait and no nextReady', () => {
  const f = buildRecoveryForecast({ currentFatigue: { quads: 10, chest: 5 } });
  assert.equal(f.nextReady, null);
  assert.equal(f.fullyRecoveredInH, 0);
});

test('an empty or absent fatigue map degrades quietly', () => {
  for (const arg of [undefined, {}, { currentFatigue: {} }]) {
    const f = buildRecoveryForecast(arg);
    assert.deepEqual(f.muscles, []);
    assert.equal(f.nextReady, null);
    assert.equal(f.cns, null);
  }
});

test('the forecast survives JSON on its way to the frontend', () => {
  const f = buildRecoveryForecast({ currentFatigue: { quads: 90, chest: 20 }, cnsFatigue: 75 });
  assert.deepEqual(JSON.parse(JSON.stringify(f)), f);
});
