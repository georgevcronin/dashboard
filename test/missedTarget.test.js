const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MISS_THRESHOLD, MISS_REASONS, REASON_KEYS,
  isMissReason, countsAsCapability, routesToInjury,
  missShortfall, isSignificantMiss, excludeNonCapabilitySets, interpretMiss,
} = require('../functions/missedTarget');
const { computeProgression } = require('../functions/progression');
const { computeStructuralFatigue, musclePeaksFromLifts } = require('../functions/fatigue');

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Detecting a miss
// ---------------------------------------------------------------------------

test('a set that meets or beats its target is not a miss', () => {
  assert.equal(missShortfall({ actualKg: 65, actualReps: 8, targetKg: 65, targetReps: 8 }), 0);
  assert.equal(missShortfall({ actualKg: 70, actualReps: 10, targetKg: 65, targetReps: 8 }), 0,
    'overshooting must clamp to 0, not report a negative shortfall');
});

test('shortfall is measured on volume, so dropping the weight counts too', () => {
  // Same reps, 20% less load.
  const s = missShortfall({ actualKg: 52, actualReps: 8, targetKg: 65, targetReps: 8 });
  assert.ok(Math.abs(s - 0.2) < 1e-9, `got ${s}`);
  assert.ok(isSignificantMiss({ actualKg: 52, actualReps: 8, targetKg: 65, targetReps: 8 }));
});

test('missing reps alone is caught', () => {
  const s = missShortfall({ actualKg: 65, actualReps: 4, targetKg: 65, targetReps: 8 });
  assert.ok(Math.abs(s - 0.5) < 1e-9, `got ${s}`);
});

test('a small shortfall stays below the threshold', () => {
  // 8 -> 7 reps is 12.5%, under the 15% bar.
  assert.equal(isSignificantMiss({ actualKg: 65, actualReps: 7, targetKg: 65, targetReps: 8 }), false);
  assert.equal(isSignificantMiss({ actualKg: 65, actualReps: 6, targetKg: 65, targetReps: 8 }), true);
});

test('the threshold is honoured exactly at the boundary', () => {
  const atBoundary = { actualKg: 85, actualReps: 10, targetKg: 100, targetReps: 10 };
  assert.equal(missShortfall(atBoundary), MISS_THRESHOLD);
  assert.equal(isSignificantMiss(atBoundary), true, 'a shortfall equal to the threshold is a miss');
});

test('a set with no target has nothing to miss', () => {
  assert.equal(missShortfall({ actualKg: 65, actualReps: 3 }), null);
  assert.equal(missShortfall({ actualKg: 65, actualReps: 3, targetKg: 0, targetReps: 8 }), null);
  assert.equal(missShortfall({}), null);
  assert.equal(missShortfall(), null);
  assert.equal(isSignificantMiss({ actualKg: 65, actualReps: 3 }), false,
    'freestyle sets must never trigger the prompt');
});

// ---------------------------------------------------------------------------
// What a reason is allowed to change
// ---------------------------------------------------------------------------

test('exactly one reason counts as capability evidence', () => {
  const capability = MISS_REASONS.filter(r => r.capability).map(r => r.key);
  assert.deepEqual(capability, ['failure']);
});

test('only pain routes to injury logging', () => {
  assert.deepEqual(MISS_REASONS.filter(r => r.routesToInjury).map(r => r.key), ['pain']);
  assert.equal(routesToInjury('pain'), true);
  assert.equal(routesToInjury('technical'), false);
  assert.equal(routesToInjury(undefined), false);
});

// Every set logged before this feature existed carries no reason. If absence
// were treated as "not capability evidence", the whole history would silently
// stop informing strength.
test('an absent or unrecognised reason behaves exactly like an ordinary set', () => {
  for (const value of [undefined, null, '', 'nonsense', 42, {}]) {
    assert.equal(countsAsCapability(value), true, `${JSON.stringify(value)} should count`);
    assert.equal(isMissReason(value), false);
  }
});

test('every reason has a key, label and hint, and keys are unique', () => {
  for (const r of MISS_REASONS) {
    assert.ok(r.key && r.label && r.hint, `incomplete reason: ${r.key}`);
    assert.equal(typeof r.capability, 'boolean');
  }
  assert.equal(new Set(REASON_KEYS).size, REASON_KEYS.length);
});

test('interpretMiss reports the same verdict the helpers do', () => {
  const set = { actualKg: 65, actualReps: 3, targetKg: 65, targetReps: 8 };
  const out = interpretMiss({ set, reason: 'technical' });
  assert.equal(out.significant, true);
  assert.equal(out.reason, 'technical');
  assert.equal(out.countsForCapability, false);
  assert.equal(out.routesToInjury, false);
  assert.equal(interpretMiss({ set, reason: 'pain' }).routesToInjury, true);
  assert.equal(interpretMiss({ set, reason: 'bogus' }).reason, null);
  assert.equal(interpretMiss({ set, reason: 'bogus' }).countsForCapability, true);
});

// The deliberate departure from the obvious design, pinned so it can't be
// "tidied up" later: the reps happened, so the load is real whatever ended the
// set. Discarding it would understate fatigue and could have Press recommend
// training a muscle it had just watched you train.
test('every reason still counts for fatigue', () => {
  for (const key of [...REASON_KEYS, undefined, 'nonsense']) {
    assert.equal(interpretMiss({ set: { actualKg: 65, actualReps: 3, targetKg: 65, targetReps: 8 }, reason: key }).countsForFatigue,
      true, `${key} must still count for fatigue`);
  }
});

test('excludeNonCapabilitySets drops only the non-capability reasons', () => {
  const lifts = [
    { exercise: 'a' },
    { exercise: 'b', missReason: 'failure' },
    { exercise: 'c', missReason: 'technical' },
    { exercise: 'd', missReason: 'pain' },
    { exercise: 'e', missReason: 'external' },
    { exercise: 'f', missReason: 'nonsense' },
  ];
  assert.deepEqual(excludeNonCapabilitySets(lifts).map(l => l.exercise), ['a', 'b', 'f']);
  assert.deepEqual(excludeNonCapabilitySets([]), []);
  assert.deepEqual(excludeNonCapabilitySets(undefined), []);
});

// ---------------------------------------------------------------------------
// The measured consequence this exists to prevent
// ---------------------------------------------------------------------------

const FLAT_HISTORY = [
  { date: daysAgo(28), exercise: 'cable row', kg: 65, reps: 8 },
  { date: daysAgo(21), exercise: 'cable row', kg: 65, reps: 8 },
  { date: daysAgo(14), exercise: 'cable row', kg: 65, reps: 8 },
];
const trendFor = last => computeProgression([...FLAT_HISTORY, last], 'cable row');

test('a missed top set with no reason still stalls, exactly as before', () => {
  const p = trendFor({ date: daysAgo(1), exercise: 'cable row', kg: 65, reps: 3 });
  assert.equal(p.trend, 'stalled');
  assert.ok(p.suggestKg < 65, 'the pre-existing deload behaviour must be unchanged for untagged history');
});

test('a genuine failure still stalls — the reason does not suppress real evidence', () => {
  const p = trendFor({ date: daysAgo(1), exercise: 'cable row', kg: 65, reps: 3, missReason: 'failure' });
  assert.equal(p.trend, 'stalled');
});

test('a grip slip no longer deloads the working weight', () => {
  const hit = trendFor({ date: daysAgo(1), exercise: 'cable row', kg: 65, reps: 8 });
  for (const reason of ['technical', 'pain', 'external']) {
    const p = trendFor({ date: daysAgo(1), exercise: 'cable row', kg: 65, reps: 3, missReason: reason });
    assert.equal(p.trend, hit.trend, `${reason} changed the trend`);
    assert.equal(p.suggestKg, hit.suggestKg, `${reason} changed the suggested weight`);
    assert.ok(p.suggestKg >= 65, `${reason} still caused a deload to ${p.suggestKg}`);
  }
});

// Fatigue is computed from the work done, so a flagged set must still register.
// This is the half of the contract that is easy to break by filtering too eagerly.
test('a flagged set still produces structural fatigue', () => {
  const lifts = [{ date: daysAgo(0), exercise: 'cable row', kg: 65, reps: 3, missReason: 'technical' }];
  const peaks = musclePeaksFromLifts(lifts);
  const fatigue = computeStructuralFatigue(lifts, peaks, [], {});
  const worked = Object.values(fatigue).filter(v => v > 0);
  assert.ok(worked.length > 0, 'the work was done, so it must still cost fatigue');
});
