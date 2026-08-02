const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  explainMusclePriority, explainBucket, compareOptions,
  recommendationConfidence, buildRecommendation,
  NEAR_TIE_MARGIN, CONFIDENT_SESSION_COUNT,
} = require('../functions/recommendation');
const {
  computeMusclePriority, generateWeeklyGuidance, stalenessBoost,
  FATIGUE_CEILING, FOCUS_MUSCLE_BONUS,
} = require('../functions/weeklyPlanner');

// ---------------------------------------------------------------------------
// The invariant the whole module exists to hold: an explanation must never
// disagree with the decision it explains. If computeMusclePriority changes,
// these fail rather than the interface quietly narrating an old formula.
// ---------------------------------------------------------------------------

test('explained terms sum to exactly what computeMusclePriority scored', () => {
  const currentFatigue = { chest: 12, lats: 40, quads: 0, biceps: 33 };
  const muscleLastTrainedDays = { chest: 10, lats: 2, quads: 30, biceps: 16 };
  const muscleFocus = { chest: 'focus' };
  const inputs = { currentFatigue, offlineMuscles: [], muscleLastTrainedDays, muscleFocus };

  const engine = computeMusclePriority(currentFatigue, [], muscleLastTrainedDays, muscleFocus);

  for (const muscle of ['chest', 'lats', 'quads', 'biceps']) {
    const explained = explainMusclePriority(muscle, inputs);
    const summed = explained.terms.reduce((total, t) => total + t.value, 0);
    // Each term is rounded to 1dp for display, so up to three terms can drift
    // 0.15 from the engine's unrounded score. Anything beyond that is a real
    // formula disagreement rather than presentation.
    assert.ok(Math.abs(summed - engine[muscle]) <= 0.2,
      `${muscle}: explanation summed to ${summed}, engine scored ${engine[muscle]}`);
  }
});

test('explanation agrees with the engine about which muscles are unavailable', () => {
  const currentFatigue = { quads: FATIGUE_CEILING, hamstrings: FATIGUE_CEILING - 1, glutes: 90 };
  const offlineMuscles = ['erectors'];
  const engine = computeMusclePriority(currentFatigue, offlineMuscles, null, {});

  for (const muscle of ['quads', 'hamstrings', 'glutes', 'erectors']) {
    const explained = explainMusclePriority(muscle, { currentFatigue, offlineMuscles });
    assert.equal(explained.available, engine[muscle] >= 0, `disagreed about ${muscle}`);
  }
});

test('an injured muscle is excluded as offline, not blamed on fatigue', () => {
  const e = explainMusclePriority('erectors', { currentFatigue: { erectors: 0 }, offlineMuscles: ['erectors'] });
  assert.equal(e.available, false);
  assert.equal(e.exclusion, 'offline');
  assert.deepEqual(e.terms, []);
});

test('the fatigue ceiling is exclusive at the boundary, matching the engine', () => {
  const below = explainMusclePriority('quads', { currentFatigue: { quads: FATIGUE_CEILING - 1 } });
  const at = explainMusclePriority('quads', { currentFatigue: { quads: FATIGUE_CEILING } });
  assert.equal(below.available, true);
  assert.equal(at.available, false);
  assert.equal(at.exclusion, 'fatigue-ceiling');
});

test('the focus bonus is reported as its own named term, not folded into recovery', () => {
  const withFocus = explainMusclePriority('chest', { currentFatigue: { chest: 20 }, muscleFocus: { chest: 'focus' } });
  const without = explainMusclePriority('chest', { currentFatigue: { chest: 20 } });
  const focusTerm = withFocus.terms.find(t => t.key === 'focus');
  assert.equal(focusTerm.value, FOCUS_MUSCLE_BONUS);
  assert.equal(withFocus.priority - without.priority, FOCUS_MUSCLE_BONUS);
});

// computeMusclePriority skips the staleness term entirely when the caller has
// no history to give it. Inventing a zero would misreport why a muscle ranked.
test('no staleness term at all when last-trained dates were not supplied', () => {
  const e = explainMusclePriority('chest', { currentFatigue: { chest: 10 }, muscleLastTrainedDays: null });
  assert.equal(e.terms.find(t => t.key === 'staleness'), undefined);
  assert.deepEqual(e.terms.map(t => t.key), ['recovery']);
});

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

test('explainBucket reports over-ceiling muscles as limiters even though the bucket still ranks', () => {
  const currentFatigue = { quads: 85, hamstrings: 80, glutes: 75, calves: 5, adductors: 5, abductors: 5, 'hip-flexors': 5, tibialis: 5 };
  const bucket = explainBucket('legs', { preferredSplit: 'Push / Pull / Legs', currentFatigue });
  const limited = bucket.limiters.map(l => l.muscle);
  for (const m of ['quads', 'hamstrings', 'glutes']) assert.ok(limited.includes(m), `${m} not reported as a limiter`);
  assert.ok(bucket.drivers.length > 0, 'bucket should still have available muscles');
});

test('drivers are ordered strongest-first so the lead reason is the real lead', () => {
  const currentFatigue = { chest: 45, 'front-delt': 5, triceps: 25, 'mid-delt': 35, serratus: 15 };
  const bucket = explainBucket('push', { preferredSplit: 'Push / Pull / Legs', currentFatigue });
  const priorities = bucket.drivers.map(d => d.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => b - a));
  assert.equal(bucket.drivers[0].muscle, 'front-delt');
});

// Under Full Body every muscle is its own bucket; the group lookup has to
// resolve rather than returning an empty membership.
test('explainBucket works under Full Body, where each muscle is its own bucket', () => {
  const bucket = explainBucket('chest', { preferredSplit: 'Full Body', currentFatigue: { chest: 10 } });
  assert.deepEqual(bucket.drivers.map(d => d.muscle), ['chest']);
});

// ---------------------------------------------------------------------------
// Comparing options. The clamping bug this guards against: muscleFocus
// .freshness is capped at 100, so buckets the planner separated clearly can
// all display 100 and every comparison collapses to "either is fine".
// ---------------------------------------------------------------------------

test('comparison ranks on the unclamped score, not the clamped display freshness', () => {
  const chosen = { name: 'push', freshness: 100, score: 140 };
  const alternative = { name: 'legs', freshness: 100, score: 105 };
  const cmp = compareOptions(chosen, alternative, { preferredSplit: 'Push / Pull / Legs', currentFatigue: {} });
  assert.equal(cmp.scoreDelta, 35);
  assert.equal(cmp.nearTie, false, 'two buckets 35 points apart are not a tie');
});

test('comparison falls back to freshness for guidance predating the score field', () => {
  const cmp = compareOptions({ name: 'push', freshness: 90 }, { name: 'legs', freshness: 70 },
    { preferredSplit: 'Push / Pull / Legs', currentFatigue: {} });
  assert.equal(cmp.scoreDelta, 20);
});

test('a genuine near-tie is admitted rather than presented as a clear winner', () => {
  const cmp = compareOptions({ name: 'push', score: 100 }, { name: 'legs', score: 100 - NEAR_TIE_MARGIN },
    { preferredSplit: 'Push / Pull / Legs', currentFatigue: {} });
  assert.equal(cmp.nearTie, true);
});

test('comparison spells out which muscles are traded away and which are picked up', () => {
  const inputs = { preferredSplit: 'Push / Pull / Legs', currentFatigue: {} };
  const cmp = compareOptions({ name: 'push', score: 100 }, { name: 'legs', score: 90 }, inputs);
  assert.ok(cmp.trades.losing.includes('chest'));
  assert.ok(cmp.trades.gaining.includes('quads'));
  assert.deepEqual(cmp.trades.shared, [], 'push and legs share no muscles');
});

test('overriding onto a bucket with unloadable muscles reports them as blocked', () => {
  const inputs = {
    preferredSplit: 'Push / Pull / Legs',
    currentFatigue: { quads: 90, hamstrings: 85 },
    offlineMuscles: ['glutes'],
  };
  const cmp = compareOptions({ name: 'push', score: 100 }, { name: 'legs', score: 90 }, inputs);
  const blocked = Object.fromEntries(cmp.blocked.map(b => [b.muscle, b.reason]));
  assert.equal(blocked.quads, 'fatigue-ceiling');
  assert.equal(blocked.glutes, 'offline');
});

test('compareOptions returns null rather than throwing when there is no alternative', () => {
  assert.equal(compareOptions({ name: 'push' }, null, {}), null);
  assert.equal(compareOptions(null, { name: 'legs' }, {}), null);
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

test('confidence is high only when nothing is known to weaken the pick', () => {
  const c = recommendationConfidence({
    buckets: [{ name: 'push', score: 120 }, { name: 'legs', score: 90 }],
    loggedSessionCount: CONFIDENT_SESSION_COUNT, dataMature: true,
    muscleLastTrainedDays: { chest: 4 },
  });
  assert.equal(c.level, 'high');
  assert.deepEqual(c.limitations, []);
});

test('each independent weakness is named, and two or more drop confidence to low', () => {
  const c = recommendationConfidence({
    buckets: [{ name: 'push', score: 100 }, { name: 'legs', score: 99 }],
    loggedSessionCount: 2, dataMature: false, muscleLastTrainedDays: null,
  });
  const codes = c.limitations.map(l => l.code);
  assert.deepEqual(codes.sort(), ['immature-data', 'near-tie', 'no-staleness', 'thin-history']);
  assert.equal(c.level, 'low');
});

test('a single weakness is moderate, not low', () => {
  const c = recommendationConfidence({
    buckets: [{ name: 'push', score: 120 }, { name: 'legs', score: 90 }],
    loggedSessionCount: CONFIDENT_SESSION_COUNT, dataMature: true, muscleLastTrainedDays: null,
  });
  assert.equal(c.limitations.length, 1);
  assert.equal(c.level, 'moderate');
});

test('no available bucket reports level none rather than a confident nothing', () => {
  const c = recommendationConfidence({ buckets: [], loggedSessionCount: 500, dataMature: true });
  assert.equal(c.level, 'none');
  assert.deepEqual(c.limitations.map(l => l.code), ['no-options']);
});

// Confidence must never be a percentage: Press has never compared a predicted
// session against the one that happened, so a number would imply calibration
// that does not exist.
test('confidence is a named level, never a numeric score', () => {
  const c = recommendationConfidence({ buckets: [{ name: 'push', score: 120 }], loggedSessionCount: 1 });
  assert.ok(['none', 'low', 'moderate', 'high'].includes(c.level));
  assert.equal(typeof c.level, 'string');
  assert.equal(c.score, undefined);
  assert.equal(c.percent, undefined);
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const REAL_INPUTS = () => {
  const currentFatigue = {
    chest: 5, 'front-delt': 10, 'mid-delt': 12, triceps: 8, serratus: 0,
    quads: 80, hamstrings: 75, glutes: 70, calves: 20, adductors: 30,
    abductors: 10, 'hip-flexors': 5, tibialis: 0,
    lats: 35, rhomboids: 30, traps: 25, biceps: 20, forearms: 15, 'rear-delt': 22,
    abs: 10, obliques: 8, erectors: 15,
  };
  const muscleLastTrainedDays = Object.fromEntries(Object.keys(currentFatigue).map(m => [m, 4]));
  return { currentFatigue, muscleLastTrainedDays, offlineMuscles: [], preferredSplit: 'Push / Pull / Legs' };
};

test('buildRecommendation explains the bucket the planner actually chose', () => {
  const inputs = REAL_INPUTS();
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: true });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  assert.equal(rec.chosen.name, guidance.muscleFocus[0].name);
  assert.deepEqual(rec.alternatives.map(a => a.name), guidance.muscleFocus.slice(1).map(b => b.name));
});

test('buildRecommendation gives one comparison per alternative', () => {
  const inputs = REAL_INPUTS();
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: true });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  assert.equal(rec.comparisons.length, rec.alternatives.length);
  rec.comparisons.forEach((c, i) => assert.equal(c.to, rec.alternatives[i].name));
});

// The object crosses the API boundary as JSON, so a callback-shaped field
// would silently vanish on the way to the frontend.
test('the whole recommendation survives a JSON round trip', () => {
  const inputs = REAL_INPUTS();
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: true });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec);
});

test('an over-ceiling muscle inside the chosen bucket is stated, not hidden', () => {
  const inputs = { ...REAL_INPUTS(), preferredSplit: 'Push / Pull / Legs' };
  inputs.currentFatigue = { ...inputs.currentFatigue, chest: 90, triceps: 85 };
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: true });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  if (rec.chosen.name === 'push') {
    const ceiling = rec.reasoning.find(r => r.code === 'at-ceiling');
    assert.ok(ceiling, 'no at-ceiling reason given despite two muscles over the ceiling');
    assert.ok(/chest/.test(ceiling.text));
  }
});

test('dataMature is taken from the guidance object when not passed separately', () => {
  const inputs = REAL_INPUTS();
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: false });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  assert.ok(rec.confidence.limitations.some(l => l.code === 'immature-data'));
});

test('buildRecommendation degrades to an empty recommendation instead of throwing', () => {
  for (const arg of [undefined, {}, { guidance: null }, { guidance: { muscleFocus: [] } }]) {
    const rec = buildRecommendation(arg);
    assert.equal(rec.chosen, null);
    assert.deepEqual(rec.reasoning, []);
    assert.equal(rec.confidence.level, 'none');
  }
});

// A muscle with no logged history gets stalenessBoost's ~21-day default, which
// is a large boost. Calling that "overdue by N days" would state a history the
// athlete never had.
test('a never-trained muscle is described as having no record, not as N days overdue', () => {
  const inputs = {
    preferredSplit: 'Full Body',
    currentFatigue: { tibialis: 0 },
    muscleLastTrainedDays: {},
    offlineMuscles: [],
  };
  const guidance = { muscleFocus: [{ name: 'tibialis', muscles: ['tibialis'], freshness: 100, score: 135 }], dataMature: true };
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  const lead = rec.reasoning.find(r => r.code === 'top-driver');
  assert.ok(/no training on record/.test(lead.text), `got: ${lead.text}`);
  assert.ok(!/\d+ days/.test(lead.text), `invented a day count: ${lead.text}`);
});

// Guards the module header's promise. These are the fields a reader would
// expect from the spec but which Press cannot yet compute honestly.
test('no predicted performance, recovery-hour or stimulus figures are fabricated', () => {
  const inputs = REAL_INPUTS();
  const guidance = generateWeeklyGuidance({ ...inputs, weekMetabolic: 30, weekCNS: 25, dataMature: true });
  const rec = buildRecommendation({ guidance, loggedSessionCount: 40, ...inputs });
  const serialized = JSON.stringify(rec);
  for (const banned of ['performanceDrop', 'recoveryHours', 'stimulusDelta', 'predictedE1rm', 'expectedAdaptation']) {
    assert.ok(!serialized.includes(banned), `${banned} present — that number has no model behind it`);
  }
});

// computeMuscleLastTrainedDays returns a fractional day count, and it reached
// the interface raw: "overdue — 59.480495983796295 days since it was last
// trained". The extra digits are not extra precision, just noise.
test('the days-overdue figure shown to a reader is a whole number', () => {
  const explained = explainMusclePriority('quads', {
    currentFatigue: { quads: 5 },
    muscleLastTrainedDays: { quads: 59.480495983796295 },
  });
  const staleness = explained.terms.find(t => t.key === 'staleness');
  assert.equal(staleness.days, 59);
  assert.equal(Number.isInteger(staleness.days), true);
});

test('rounding the displayed day count does not change the score it produced', () => {
  const raw = 59.480495983796295;
  const explained = explainMusclePriority('quads', {
    currentFatigue: { quads: 0 },
    muscleLastTrainedDays: { quads: raw },
  });
  const staleness = explained.terms.find(t => t.key === 'staleness');
  // stalenessBoost is still evaluated on the unrounded value.
  assert.equal(staleness.value, Math.round(stalenessBoost(raw) * 10) / 10);
});

test('a null last-trained date stays null rather than rounding to 0 days', () => {
  const explained = explainMusclePriority('quads', {
    currentFatigue: { quads: 0 }, muscleLastTrainedDays: {},
  });
  const staleness = explained.terms.find(t => t.key === 'staleness');
  assert.equal(staleness.days, null);
});
