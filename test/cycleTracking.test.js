const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  averageCycleLengthDays, averagePeriodLengthDays, currentCycleDay,
  heavinessStats, confidence, cyclePhaseFactor,
  avgVolumePerDay, observedHeaviness, nudgeLearnedHeaviness, periodsOverlap, predictedNextPeriod, parseDateOnly,
} = require('../functions/cycleTracking');

const DAY_MS = 86_400_000;
const daysAgo = n => Date.now() - n * DAY_MS;

test('averageCycleLengthDays returns the default with 0 or 1 logged starts', () => {
  assert.equal(averageCycleLengthDays([]), 28);
  assert.equal(averageCycleLengthDays([{ startTs: Date.now() }]), 28);
});

test('averageCycleLengthDays computes the mean start-to-start gap and clamps outliers', () => {
  const log = [
    { startTs: daysAgo(84) }, { startTs: daysAgo(56) }, { startTs: daysAgo(28) }, { startTs: daysAgo(0) },
  ];
  assert.ok(Math.abs(averageCycleLengthDays(log) - 28) < 0.1);

  const outlier = [{ startTs: daysAgo(200) }, { startTs: daysAgo(0) }]; // 200-day gap
  assert.equal(averageCycleLengthDays(outlier), 40, 'a wildly-off gap should clamp to the max');
});

test('averagePeriodLengthDays defaults with no closed entries, else averages endTs-startTs', () => {
  assert.equal(averagePeriodLengthDays([]), 5);
  const log = [{ startTs: daysAgo(10), endTs: daysAgo(6) }, { startTs: daysAgo(40), endTs: daysAgo(37) }];
  assert.ok(Math.abs(averagePeriodLengthDays(log) - 3.5) < 0.1);
});

test('currentCycleDay with an open entry returns onPeriod true and the right day count', () => {
  const log = [{ startTs: daysAgo(2), endTs: null }];
  const out = currentCycleDay(log, Date.now());
  assert.equal(out.onPeriod, true);
  assert.equal(out.cycleDay, 3);
});

test('currentCycleDay with no open entry estimates forward and wraps via modulo', () => {
  // Two starts 28 days apart establish avgLen=28; 30 days since the last
  // start should wrap to day 3 of the next cycle (30 % 28 + 1 = 3). Periods
  // are logged 2 days long here, so day 3 correctly falls outside the
  // estimated period window (onPeriod: false).
  const log = [{ startTs: daysAgo(58), endTs: daysAgo(56) }, { startTs: daysAgo(30), endTs: daysAgo(28) }];
  const out = currentCycleDay(log, Date.now());
  assert.equal(out.onPeriod, false);
  assert.equal(out.cycleDay, 3);
});

test('currentCycleDay with no entries at all returns null/false', () => {
  const out = currentCycleDay([], Date.now());
  assert.equal(out.cycleDay, null);
  assert.equal(out.onPeriod, false);
});

test('currentCycleDay with irregular=true skips estimation when no entry is open', () => {
  const log = [{ startTs: daysAgo(58), endTs: daysAgo(55) }, { startTs: daysAgo(30), endTs: daysAgo(27) }];
  const out = currentCycleDay(log, Date.now(), true);
  assert.equal(out.cycleDay, null);
  assert.equal(out.onPeriod, false);
});

test('currentCycleDay with irregular=true still returns real data when a period is actually open', () => {
  const log = [{ startTs: daysAgo(2), endTs: null }];
  const out = currentCycleDay(log, Date.now(), true);
  assert.equal(out.onPeriod, true);
  assert.equal(out.cycleDay, 3);
});

test('heavinessStats returns the neutral default with no ratings', () => {
  assert.deepEqual(heavinessStats([]), { avgHeaviness: 3, variation: 0, n: 0 });
  assert.deepEqual(heavinessStats([{ heaviness: null }]), { avgHeaviness: 3, variation: 0, n: 0 });
});

test('heavinessStats returns variation 0 with exactly one rating', () => {
  const out = heavinessStats([{ heaviness: 4 }]);
  assert.equal(out.avgHeaviness, 4);
  assert.equal(out.variation, 0);
  assert.equal(out.n, 1);
});

test('heavinessStats computes population stdev correctly for a known set', () => {
  const out = heavinessStats([{ heaviness: 2 }, { heaviness: 4 }]);
  assert.equal(out.avgHeaviness, 3);
  assert.equal(out.variation, 1);
  assert.equal(out.n, 2);
});

test('confidence is 0 with no ratings, increases with n, and drops toward 0 as variation approaches 2', () => {
  assert.equal(confidence([]), 0);
  const few = confidence([{ heaviness: 5 }, { heaviness: 5 }]);
  const many = confidence([{ heaviness: 5 }, { heaviness: 5 }, { heaviness: 5 }, { heaviness: 5 }, { heaviness: 5 }, { heaviness: 5 }]);
  assert.ok(many > few, 'more consistent data points should raise confidence');
  const inconsistent = confidence([{ heaviness: 1 }, { heaviness: 5 }, { heaviness: 1 }, { heaviness: 5 }, { heaviness: 1 }, { heaviness: 5 }]);
  assert.ok(inconsistent < 0.05, 'max-variation heaviness history should collapse confidence near 0');
});

test('cyclePhaseFactor is a no-op with no cycle data at all', () => {
  const out = cyclePhaseFactor([], Date.now());
  assert.deepEqual(out, { factor: 1, rirOffset: 0, cycleDay: null, onPeriod: false, confidence: 0, avgHeaviness: null, variation: null });
});

test('cyclePhaseFactor is a no-op when heaviness is always rated 1 (no training impact)', () => {
  const log = [
    { startTs: daysAgo(58), endTs: daysAgo(55), heaviness: 1 },
    { startTs: daysAgo(30), endTs: daysAgo(27), heaviness: 1 },
    { startTs: daysAgo(2), endTs: null, heaviness: null },
  ];
  const out = cyclePhaseFactor(log, Date.now());
  assert.equal(out.factor, 1);
  assert.equal(out.rirOffset, 0);
});

test('cyclePhaseFactor is a no-op when irregular and no period is currently open, regardless of history', () => {
  const log = [
    { startTs: daysAgo(58), endTs: daysAgo(55), heaviness: 5 },
    { startTs: daysAgo(30), endTs: daysAgo(27), heaviness: 5 },
    { startTs: daysAgo(2), endTs: daysAgo(0), heaviness: 5 },
  ];
  const out = cyclePhaseFactor(log, Date.now(), true);
  assert.equal(out.factor, 1);
  assert.equal(out.rirOffset, 0);
  assert.equal(out.cycleDay, null);
});

test('cyclePhaseFactor dips (factor > 1, rirOffset > 0) at period start and peaks (factor < 1, rirOffset < 0) at the midpoint, given confident data', () => {
  // Six consistent 28-day cycles all rated max heaviness -> high confidence, max amplitude.
  const log = [];
  for (let i = 6; i >= 1; i--) log.push({ startTs: daysAgo(i * 28), endTs: daysAgo(i * 28 - 3), heaviness: 5 });

  const atStart = cyclePhaseFactor([...log, { startTs: daysAgo(0), endTs: null }], Date.now());
  assert.ok(atStart.factor > 1, `expected factor > 1 at period start, got ${atStart.factor}`);
  assert.ok(atStart.rirOffset > 0, `expected rirOffset > 0 at period start, got ${atStart.rirOffset}`);

  const midpointNow = log[log.length - 1].startTs + 14 * DAY_MS;
  const atMidpoint = cyclePhaseFactor(log, midpointNow);
  assert.ok(atMidpoint.factor < 1, `expected factor < 1 at midpoint, got ${atMidpoint.factor}`);
  assert.ok(atMidpoint.rirOffset < 0, `expected rirOffset < 0 at midpoint, got ${atMidpoint.rirOffset}`);
});

test('cyclePhaseFactor stays within [0.7, 1.3] for factor and [-1, 1] for rirOffset across a full cycle sweep', () => {
  const log = [];
  for (let i = 6; i >= 1; i--) log.push({ startTs: daysAgo(i * 28), endTs: daysAgo(i * 28 - 3), heaviness: 5 });
  const anchor = log[log.length - 1].startTs;
  for (let d = 1; d <= 40; d++) {
    const out = cyclePhaseFactor(log, anchor + d * DAY_MS);
    assert.ok(out.factor >= 0.7 && out.factor <= 1.3, `factor out of range at day ${d}: ${out.factor}`);
    assert.ok(out.rirOffset >= -1 && out.rirOffset <= 1, `rirOffset out of range at day ${d}: ${out.rirOffset}`);
  }
});

test('cyclePhaseFactor uses learnedHeaviness over the plain self-report average when provided', () => {
  // Weak self-report (heaviness 1 everywhere) would normally produce a
  // no-op factor — a learned value overriding it should still swing.
  const log = [
    { startTs: daysAgo(58), endTs: daysAgo(55), heaviness: 1 },
    { startTs: daysAgo(30), endTs: daysAgo(27), heaviness: 1 },
    { startTs: daysAgo(2), endTs: null, heaviness: null },
  ];
  const withoutLearned = cyclePhaseFactor(log, Date.now());
  assert.equal(withoutLearned.factor, 1);
  const withLearned = cyclePhaseFactor(log, Date.now(), false, 5);
  assert.equal(withLearned.avgHeaviness, 5);
  assert.ok(withLearned.factor > 1, `expected the learned value to drive a real swing, got ${withLearned.factor}`);
});

// Fixed UTC-midnight anchor (not tied to Date.now()) so every offset below
// is an exact multiple of DAY_MS and every `.date` string round-trips back
// to the identical timestamp through avgVolumePerDay's `new Date(l.date)`
// parse — daysAgo()-relative timestamps carry today's arbitrary time-of-day
// and would drift by up to a day through that same round-trip.
const T0 = Date.UTC(2026, 0, 15);
const dateStr = ts => new Date(ts).toISOString().slice(0, 10);

test('avgVolumePerDay averages kg*reps per distinct training day within a window, null with none', () => {
  const lifts = [
    { date: dateStr(T0), kg: 100, reps: 10 },
    { date: dateStr(T0), kg: 50, reps: 10 },
    { date: dateStr(T0 + 2 * DAY_MS), kg: 200, reps: 5 },
  ];
  const avg = avgVolumePerDay(lifts, T0 - DAY_MS, T0 + 3 * DAY_MS);
  assert.equal(avg, 1250); // (1000+500 + 1000) / 2 days

  assert.equal(avgVolumePerDay([], T0, T0 + DAY_MS), null);
  assert.equal(avgVolumePerDay(lifts, T0 + 100 * DAY_MS, T0 + 101 * DAY_MS), null, 'no lifts in the window at all');
});

test('avgVolumePerDay excludes days that fall inside excludeWindows', () => {
  const dayA = dateStr(T0), dayB = dateStr(T0 + 2 * DAY_MS);
  const lifts = [{ date: dayA, kg: 100, reps: 10 }, { date: dayB, kg: 10, reps: 1 }];
  const withoutExclusion = avgVolumePerDay(lifts, T0 - DAY_MS, T0 + 3 * DAY_MS);
  assert.equal(withoutExclusion, 505); // (1000 + 10) / 2

  const withExclusion = avgVolumePerDay(lifts, T0 - DAY_MS, T0 + 3 * DAY_MS, [[T0 + 1.5 * DAY_MS, T0 + 2.5 * DAY_MS]]);
  assert.equal(withExclusion, 1000, 'the excluded day should be dropped entirely, not averaged in');
});

test('observedHeaviness returns null without an entry, without a closed window, or without enough logged training to compare', () => {
  assert.equal(observedHeaviness([], null, []), null);
  assert.equal(observedHeaviness([], { startTs: T0, endTs: null }, []), null, 'still-open entry');
  assert.equal(observedHeaviness([], { startTs: T0, endTs: T0 + 3 * DAY_MS }, []), null, 'no training logged anywhere');
});

test('observedHeaviness reads a real volume drop as high severity, matched to VOLUME_DROP_FOR_MAX_SEVERITY', () => {
  const periodStart = T0, periodEnd = T0 + 3 * DAY_MS;
  const entry = { id: 99, startTs: periodStart, endTs: periodEnd };
  const lifts = [];
  // Baseline: 1000 volume/day on 3 days well before the period.
  for (let i = 20; i <= 22; i++) lifts.push({ date: dateStr(periodStart - i * DAY_MS), kg: 100, reps: 10 });
  // Period: 500 volume/day (a 50% drop) on 2 days inside the window.
  for (let i = 1; i <= 2; i++) lifts.push({ date: dateStr(periodStart + i * DAY_MS), kg: 100, reps: 5 });
  const out = observedHeaviness(lifts, entry, [entry]);
  assert.equal(out, 5, 'a 50% volume drop should read as maximum severity');
});

test('observedHeaviness excludes another logged period\'s own days from the baseline', () => {
  const periodStart = T0, periodEnd = T0 + 3 * DAY_MS;
  const entry = { id: 2, startTs: periodStart, endTs: periodEnd };
  const priorPeriod = { id: 1, startTs: periodStart - 20 * DAY_MS, endTs: periodStart - 18 * DAY_MS };
  const lifts = [
    // A low-volume day inside the prior period — should NOT drag the baseline down.
    { date: dateStr(priorPeriod.startTs + DAY_MS), kg: 10, reps: 1 },
    // Real (unaffected) baseline days at full volume.
    { date: dateStr(periodStart - 5 * DAY_MS), kg: 100, reps: 10 },
    { date: dateStr(periodStart - 4 * DAY_MS), kg: 100, reps: 10 },
    // Period days, same full volume — no real drop.
    { date: dateStr(periodStart + DAY_MS), kg: 100, reps: 10 },
  ];
  const out = observedHeaviness(lifts, entry, [entry, priorPeriod]);
  assert.equal(out, 1, 'no actual drop vs. the correctly-excluded baseline should read as minimal severity');
});

test('nudgeLearnedHeaviness is a no-op with no observation or no current seed', () => {
  assert.equal(nudgeLearnedHeaviness(3, null), 3);
  assert.equal(nudgeLearnedHeaviness(null, 5), null);
});

test('nudgeLearnedHeaviness moves gently (25%-in-ratio-terms) toward the observed value, not straight to it', () => {
  const updated = nudgeLearnedHeaviness(3, 5);
  assert.ok(updated > 3 && updated < 5, `expected a partial move, got ${updated}`);
  assert.equal(updated, 3.41);
});

test('nudgeLearnedHeaviness stays within [1, 5]', () => {
  assert.ok(nudgeLearnedHeaviness(1, 5) <= 5);
  assert.ok(nudgeLearnedHeaviness(5, 1) >= 1);
});

test('periodsOverlap catches a retro entry landing inside a closed period', () => {
  const log = [{ startTs: daysAgo(40), endTs: daysAgo(35) }];
  assert.equal(periodsOverlap(daysAgo(38), daysAgo(36), log), true);
});

test('periodsOverlap catches a retro entry overlapping the still-open period', () => {
  const log = [{ startTs: daysAgo(3), endTs: null }];
  assert.equal(periodsOverlap(daysAgo(10), daysAgo(2), log), true, 'an open entry should be treated as ongoing to now');
});

test('periodsOverlap is false for a retro entry that fits cleanly between logged periods', () => {
  const log = [{ startTs: daysAgo(70), endTs: daysAgo(65) }, { startTs: daysAgo(14), endTs: daysAgo(9) }];
  assert.equal(periodsOverlap(daysAgo(42), daysAgo(37), log), false);
});

test('predictedNextPeriod is null with no logged start, an open period, or an irregular cycle', () => {
  assert.equal(predictedNextPeriod([]), null);
  assert.equal(predictedNextPeriod([{ startTs: daysAgo(3), endTs: null }]), null, 'currently on a period — nothing to predict');
  const log = [{ startTs: daysAgo(56), endTs: daysAgo(51) }, { startTs: daysAgo(28), endTs: daysAgo(23) }];
  assert.equal(predictedNextPeriod(log, Date.now(), true), null, 'irregular disables extrapolation');
});

test('parseDateOnly reads back as the same calendar date regardless of local timezone', () => {
  const ts = parseDateOnly('2026-08-05');
  // Simulating "any real timezone" isn't feasible without mocking Intl, but
  // UTC getters are timezone-independent and pin down the actual moment:
  // noon UTC on the given date, not midnight.
  const d = new Date(ts);
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 7);
  assert.equal(d.getUTCDate(), 5);
  assert.equal(d.getUTCHours(), 12);
});

test('predictedNextPeriod extrapolates start+end from the average cycle/period length', () => {
  const lastStart = daysAgo(28);
  const log = [{ startTs: daysAgo(56), endTs: daysAgo(51) }, { startTs: lastStart, endTs: daysAgo(23) }];
  const out = predictedNextPeriod(log);
  // avg cycle length 28 days from the two starts, avg period length 5 days
  assert.equal(out.startTs, lastStart + 28 * DAY_MS);
  assert.equal(out.endTs, out.startTs + 5 * DAY_MS);
});
