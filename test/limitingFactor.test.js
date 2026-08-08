const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  identifyLimitingFactors, todaysLimitingFactor, recoveryFactorFor, RECOVERY_BASELINE,
} = require('../functions/limitingFactor');
const { FATIGUE_CEILING } = require('../functions/weeklyPlanner');
const { fatigueCeilingFor } = require('../functions/sessionPlanner');
const { planLiftSessionsTarget } = require('../functions/weeklyPlanner');

const FRESH = { cnsFatigue: 10, metabolicFatigue: 5, currentFatigue: { chest: 10 }, recoveryScore: 70 };
const codes = inputs => identifyLimitingFactors(inputs).map(f => f.code);

// ---------------------------------------------------------------------------
// Nothing is reported unless a threshold the engine acts on has been crossed.
// ---------------------------------------------------------------------------

test('a recovered athlete has no limiting factor at all', () => {
  const result = todaysLimitingFactor(FRESH);
  assert.equal(result.clear, true);
  assert.equal(result.primary, null);
  assert.deepEqual(result.others, []);
});

test('missing inputs produce no factors rather than guesses', () => {
  const result = todaysLimitingFactor({});
  assert.equal(result.clear, true);
});

test('a recovery score above baseline is not reported — it is helping, not limiting', () => {
  assert.ok(!codes({ ...FRESH, recoveryScore: RECOVERY_BASELINE + 10 }).includes('recovery'));
  assert.ok(!codes({ ...FRESH, recoveryScore: RECOVERY_BASELINE }).includes('recovery'));
  assert.ok(codes({ ...FRESH, recoveryScore: RECOVERY_BASELINE - 1 }).includes('recovery'));
});

// Ordinary night-to-night variation is not a finding.
test('sleep is only flagged when more than an hour short of target', () => {
  assert.ok(!codes({ ...FRESH, sleepHours: 7.5, sleepTarget: 8 }).includes('sleep'));
  assert.ok(!codes({ ...FRESH, sleepHours: 7.0, sleepTarget: 8 }).includes('sleep'));
  assert.ok(codes({ ...FRESH, sleepHours: 6.5, sleepTarget: 8 }).includes('sleep'));
});

// ---------------------------------------------------------------------------
// Thresholds must be the engine's own. These fail if either side moves.
// ---------------------------------------------------------------------------

test('the CNS threshold matches where weeklyPlanner actually caps the week at 2 sessions', () => {
  assert.ok(codes({ ...FRESH, cnsFatigue: 71 }).includes('cns-high'));
  assert.ok(!codes({ ...FRESH, cnsFatigue: 70 }).includes('cns-high'));
  // The engine's own behaviour at that boundary, which the copy describes.
  assert.equal(planLiftSessionsTarget(71, 0, 4), 2);
  assert.notEqual(planLiftSessionsTarget(70, 0, 4), 2);
});

test('the moderate CNS threshold matches the 3-session cap', () => {
  assert.ok(codes({ ...FRESH, cnsFatigue: 41 }).includes('cns-moderate'));
  assert.ok(!codes({ ...FRESH, cnsFatigue: 40 }).includes('cns-moderate'));
  assert.equal(planLiftSessionsTarget(41, 0, 4), 3);
});

test('metabolic thresholds match sessionPlanner fatigueCeilingFor exactly', () => {
  assert.ok(codes({ ...FRESH, metabolicFatigue: 61 }).includes('metabolic-high'));
  assert.equal(fatigueCeilingFor(61), 2, 'copy claims 2 working sets');

  assert.ok(codes({ ...FRESH, metabolicFatigue: 31 }).includes('metabolic-moderate'));
  assert.equal(fatigueCeilingFor(31), 3, 'copy claims 3 working sets');

  assert.ok(!codes({ ...FRESH, metabolicFatigue: 30 }).includes('metabolic-moderate'));
  assert.equal(fatigueCeilingFor(30), 4, 'below the threshold the usual 4 applies');
});

test('the structural threshold is weeklyPlanner FATIGUE_CEILING, not a local copy', () => {
  const at = { ...FRESH, currentFatigue: { quads: FATIGUE_CEILING } };
  const below = { ...FRESH, currentFatigue: { quads: FATIGUE_CEILING - 1 } };
  assert.ok(codes(at).includes('structural'));
  assert.ok(!codes(below).includes('structural'));
});

test('the stated recovery multiplier is the one computeCNSFatigue applies', () => {
  // Same formula as fatigue.js: clamp(1 + (55 - score) / 110, 0.7, 1.4)
  assert.equal(recoveryFactorFor(55), 1);
  assert.ok(Math.abs(recoveryFactorFor(0) - 1.4) < 1e-9, 'clamped at 1.4');
  assert.ok(Math.abs(recoveryFactorFor(100) - 0.7) < 1e-9, 'clamped at 0.7');
  const f = identifyLimitingFactors({ ...FRESH, recoveryScore: 32 }).find(x => x.code === 'recovery');
  assert.ok(f.effect.includes(recoveryFactorFor(32).toFixed(2)));
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

test('muscles set to ignore are never reported as a limiting factor', () => {
  const inputs = {
    cnsFatigue: 95, metabolicFatigue: 95, offlineMuscles: ['erectors'],
    currentFatigue: { quads: 90, glutes: 90, hamstrings: 90, calves: 90 }, recoveryScore: 10,
  };
  assert.ok(!codes(inputs).includes('excluded'));
  // A real, time-varying factor should still win the ranking.
  assert.equal(todaysLimitingFactor(inputs).primary.code, 'cns-high');
});

test('a high-severity factor outranks a moderate one regardless of raw magnitude', () => {
  const result = todaysLimitingFactor({
    cnsFatigue: 41, metabolicFatigue: 95, currentFatigue: {}, recoveryScore: 70,
  });
  assert.equal(result.primary.code, 'metabolic-high');
  assert.equal(result.primary.severity, 'high');
  assert.ok(result.others.some(o => o.code === 'cns-moderate'));
});

test('an ignored muscle is reported neither as excluded nor as structurally fatigued', () => {
  const c = codes({ ...FRESH, offlineMuscles: ['quads'], currentFatigue: { quads: 95 } });
  assert.ok(!c.includes('excluded'));
  assert.ok(!c.includes('structural'), 'a permanently-ignored muscle should not read as fatigue-limited');
});

// applyInjuryTaper floors an injured muscle's fatigue rather than excluding
// it, so the injury already explains why that muscle is unavailable. Listing
// it again under structural fatigue reads as two problems when it's one.
test('an injured muscle is explained by the injury, not also by the fatigue ceiling', () => {
  const c = codes({
    ...FRESH, currentFatigue: { quads: 95 },
    injuries: [{ area: 'left knee', muscles: ['quads'], penalty: 95 }],
  });
  assert.ok(c.includes('injury'));
  assert.ok(!c.includes('structural'), 'quads counted twice');
});

// The distinction the engine actually makes: an injury is a fatigue floor, and
// only removes the muscle from selection while that floor clears the ceiling.
test('an injury below the ceiling says the muscle can still be trained', () => {
  const f = identifyLimitingFactors({
    ...FRESH, injuries: [{ area: 'wrist', muscles: ['forearms'], penalty: FATIGUE_CEILING - 10 }],
  }).find(x => x.code === 'injury');
  assert.equal(f.severity, 'moderate');
  assert.ok(/can still be trained/.test(f.effect), f.effect);
});

test('an injury at or above the ceiling says the muscle is not selected', () => {
  const f = identifyLimitingFactors({
    ...FRESH, injuries: [{ area: 'shoulder', muscles: ['front-delt'], penalty: FATIGUE_CEILING + 20 }],
  }).find(x => x.code === 'injury');
  assert.equal(f.severity, 'high');
  assert.ok(/not selected/.test(f.effect), f.effect);
});

// An injury row carries a free-text area and a resolved muscle list; only the
// muscle list is in the same namespace as everything else.
test('an injury with no resolved muscles is skipped rather than reported by area alone', () => {
  const c = codes({ ...FRESH, injuries: [{ area: 'lower back', muscles: [] }] });
  assert.ok(!c.includes('injury'));
});

test('CNS is reported at one level only, never both bands at once', () => {
  const c = codes({ ...FRESH, cnsFatigue: 85 });
  assert.ok(c.includes('cns-high'));
  assert.ok(!c.includes('cns-moderate'));
});

test('four or more spent muscles escalate structural fatigue to high severity', () => {
  const many = { quads: 60, glutes: 60, hamstrings: 60, calves: 60 };
  const few = { quads: 60, glutes: 60 };
  assert.equal(identifyLimitingFactors({ ...FRESH, currentFatigue: many })[0].severity, 'high');
  assert.equal(identifyLimitingFactors({ ...FRESH, currentFatigue: few })[0].severity, 'moderate');
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('every factor carries a cause, an effect and something to do about it', () => {
  const all = identifyLimitingFactors({
    cnsFatigue: 85, metabolicFatigue: 65, offlineMuscles: ['erectors'],
    currentFatigue: { quads: 90, glutes: 80 }, recoveryScore: 30,
    sleepHours: 5, sleepTarget: 8,
  });
  assert.ok(all.length >= 5, 'expected every branch to fire');
  for (const f of all) {
    for (const field of ['code', 'severity', 'headline', 'detail', 'effect', 'mitigation']) {
      assert.ok(f[field], `${f.code} missing ${field}`);
    }
    assert.ok(['high', 'moderate', 'low'].includes(f.severity));
  }
});

// Same discipline as recommendation.js: Press has never checked a prediction
// against an outcome, so no factor may claim a performance number.
test('no factor invents a predicted performance or recovery figure', () => {
  const all = identifyLimitingFactors({
    cnsFatigue: 85, metabolicFatigue: 65, currentFatigue: { quads: 90 },
    recoveryScore: 30, sleepHours: 5, sleepTarget: 8, offlineMuscles: ['erectors'],
  });
  const prose = all.map(f => `${f.detail} ${f.effect} ${f.mitigation}`).join(' ');
  assert.ok(!/\d+\s*%\s*(less|lower|weaker|reduction|drop)/i.test(prose), prose);
  assert.ok(!/lose \d/i.test(prose));
  assert.ok(!/\d+\s*(kg|lbs) (less|lighter)/i.test(prose));
});

test('the result survives JSON on its way to the frontend', () => {
  const r = todaysLimitingFactor({ cnsFatigue: 85, currentFatigue: { quads: 90 }, recoveryScore: 30 });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

// A hard session can spend a dozen muscles at once; the line has to stay
// readable without pretending the rest don't exist.
test('a long list of spent muscles is capped but says how many were elided', () => {
  const currentFatigue = {};
  for (const m of ['quads', 'glutes', 'hamstrings', 'calves', 'erectors', 'lats', 'chest']) currentFatigue[m] = 80;
  const f = identifyLimitingFactors({ ...FRESH, currentFatigue }).find(x => x.code === 'structural');
  assert.ok(/and 3 more/.test(f.detail), f.detail);
  assert.ok(f.detail.split(',').length <= 5, f.detail);
});

test('a short list is named in full, with no "and N more" tacked on', () => {
  const f = identifyLimitingFactors({ ...FRESH, currentFatigue: { quads: 80, glutes: 80 } })
    .find(x => x.code === 'structural');
  assert.ok(/quads, glutes/.test(f.detail), f.detail);
  assert.ok(!/more/.test(f.detail), f.detail);
});

// ---------- Relevance to today's session ----------

test('without a session the ranking is unchanged', () => {
  const inputs = {
    cnsFatigue: 85, metabolicFatigue: 65, currentFatigue: { quads: 90 },
    recoveryScore: 30, sleepHours: 5, sleepTarget: 8,
  };
  const bare = identifyLimitingFactors(inputs);
  for (const f of bare) assert.equal(f.relevance, 1);
  assert.equal(todaysLimitingFactor(inputs).sessionAware, false);
});

test('a factor about muscles today never trains falls behind one it does', () => {
  // Same fatigue on both, same severity band. Only the session differs.
  const currentFatigue = { lats: 90, quads: 90 };
  const pullDay = identifyLimitingFactors({
    ...FRESH, currentFatigue, session: [{ name: 'pull-up' }, { name: 'barbell row' }],
  });
  const legDay = identifyLimitingFactors({
    ...FRESH, currentFatigue, session: [{ name: 'back squat' }, { name: 'leg press' }],
  });

  const structural = list => list.find(f => f.code === 'structural');
  assert.ok(structural(pullDay).relevance > 0);
  assert.ok(structural(legDay).relevance > 0);
  // Both days flag it (both muscles are spent), but a day training neither
  // would score it 0 — that's the mechanism.
  const armDay = identifyLimitingFactors({
    ...FRESH, currentFatigue, session: [{ name: 'bicep curl (dumbbell)' }],
  });
  assert.equal(structural(armDay).relevance, 0);
});

test('CNS relevance follows how much of the session is actually compound', () => {
  const inputs = { ...FRESH, cnsFatigue: 85 };
  const cns = list => list.find(f => f.code === 'cns-high');

  const allCompound = cns(identifyLimitingFactors({
    ...inputs, session: [{ name: 'back squat' }, { name: 'conventional deadlift' }],
  }));
  const allIsolation = cns(identifyLimitingFactors({
    ...inputs, session: [{ name: 'lateral raise (dumbbell)' }, { name: 'bicep curl (dumbbell)' }],
  }));

  assert.equal(allCompound.relevance, 1);
  assert.equal(allIsolation.relevance, 0);
  assert.ok(allCompound.impact > allIsolation.impact);
});

test('metabolic fatigue is relevant to any session, since it caps every exercise', () => {
  const f = identifyLimitingFactors({
    ...FRESH, metabolicFatigue: 65, session: [{ name: 'bicep curl (dumbbell)' }],
  }).find(x => x.code === 'metabolic-high');
  assert.equal(f.relevance, 1);
});

test('severity still outranks relevance', () => {
  // A high-severity factor with zero relevance to today's session must still
  // beat a moderate one that's fully relevant — severity is the primary sort
  // key and relevance only breaks ties within a tier, never overrides it.
  const result = todaysLimitingFactor({
    cnsFatigue: 85,
    metabolicFatigue: 45,
    currentFatigue: { chest: 10 },
    recoveryScore: 70,
    session: [{ name: 'bicep curl (dumbbell)' }],
  });
  assert.equal(result.primary.severity, 'high');
  assert.equal(result.primary.code, 'cns-high');
  assert.equal(result.primary.relevance, 0);
  assert.equal(result.sessionAware, true);
});

// ---------- Explanation depths ----------

test('every factor explains itself at all three depths', () => {
  const all = identifyLimitingFactors({
    cnsFatigue: 85, metabolicFatigue: 65, offlineMuscles: ['erectors'],
    currentFatigue: { quads: 90, glutes: 80 }, recoveryScore: 30,
    sleepHours: 5, sleepTarget: 8,
    injuries: [{ area: 'shoulder', muscles: ['front-delt'], penalty: 60 }],
  });
  assert.ok(all.length >= 6, 'expected every branch to fire');
  for (const f of all) {
    for (const level of ['beginner', 'intermediate', 'scientist']) {
      assert.ok(f.explanations?.[level], `${f.code} missing ${level}`);
      assert.ok(f.explanations[level].length > 20, `${f.code} ${level} is too thin to be an explanation`);
    }
  }
});

test('the beginner depth carries no percentages', () => {
  const all = identifyLimitingFactors({
    cnsFatigue: 85, metabolicFatigue: 65, currentFatigue: { quads: 90 },
    recoveryScore: 30, sleepHours: 5, sleepTarget: 8,
  });
  for (const f of all) {
    assert.ok(!/\d+\s*(%|of 100)/.test(f.explanations.beginner),
      `${f.code}: ${f.explanations.beginner}`);
  }
});

test('the depths change the prose, never the factor or its rank', () => {
  // The contract expertise.js exists to protect. Nothing about which factor
  // wins may depend on the level, so the module emits all three every time.
  const inputs = { cnsFatigue: 85, currentFatigue: { quads: 90 }, recoveryScore: 30 };
  const a = todaysLimitingFactor(inputs);
  const b = todaysLimitingFactor(inputs);
  assert.equal(a.primary.code, b.primary.code);
  assert.deepEqual(a.others.map(f => f.code), b.others.map(f => f.code));
  assert.notEqual(a.primary.explanations.beginner, a.primary.explanations.scientist);
});

test('no explanation depth invents a predicted performance figure', () => {
  const all = identifyLimitingFactors({
    cnsFatigue: 85, metabolicFatigue: 65, currentFatigue: { quads: 90 },
    recoveryScore: 30, sleepHours: 5, sleepTarget: 8, offlineMuscles: ['erectors'],
  });
  const prose = all.flatMap(f => Object.values(f.explanations)).join(' ');
  assert.ok(!/\d+\s*%\s*(less|lower|weaker|reduction|drop)/i.test(prose), prose);
  assert.ok(!/lose \d/i.test(prose));
  assert.ok(!/expect(ed)? (to )?(be )?\d/i.test(prose));
});

test('the session-aware result still survives JSON', () => {
  const r = todaysLimitingFactor({
    cnsFatigue: 85, currentFatigue: { quads: 90 }, recoveryScore: 30,
    session: [{ name: 'back squat' }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});
