// What is actually constraining today's session, ranked.
//
// The rule this module follows, and the reason it's worth having rather than
// writing prose in the UI: a factor is only reported when a threshold the
// engine genuinely acts on has been crossed, and its stated effect is the
// thing the engine actually does at that threshold. Every number below is
// imported or quoted from the code that consumes it —
//   sessionPlanner.js  cnsFatigue > 70      -> CNS-substitute compounds, avoid HIGH_CNS_EQUIPMENT
//   sessionPlanner.js  metabolicFatigue > 60 -> fatigueCeilingFor 2 sets, 1 accessory
//   sessionPlanner.js  metabolicFatigue > 30 -> fatigueCeilingFor 3 sets
//   weeklyPlanner.js   weekCNS/Metabolic > 70 -> lift sessions capped at 2
//   weeklyPlanner.js   weekCNS/Metabolic > 40 -> lift sessions capped at 3
//   weeklyPlanner.js   fatigue >= FATIGUE_CEILING -> muscle excluded from selection
//   fatigue.js         recoveryScore centred on 55 -> scales CNS fatigue 0.7x-1.4x
//
// So "poor sleep is limiting you today" is never a vibe: it means the recovery
// score is below 55 and is therefore multiplying CNS fatigue by a factor this
// module can state exactly. Nothing here predicts a performance drop — see
// recommendation.js's header for why Press doesn't put numbers on that yet.
//
// Two things ride on top of that rule.
//
// `session` weights the ranking by relevance to what is actually planned (see
// the relevance block below). Optional, and absent it the ordering is
// unchanged — a caller that doesn't know today's plan gets the unweighted
// answer rather than an assumption about it.
//
// `explanations` carries the same factor at three depths (beginner /
// intermediate / scientist). This module never reads a detail level and must
// not start: it emits all three unconditionally and the interface picks. That
// keeps the display-only contract in expertise.js's header intact — the factor
// selected, its severity and its rank are identical at every level, and only
// the prose around them changes. Wiring a level in here would make the
// dashboard's headline constraint depend on a display setting, which is the
// one thing that contract exists to prevent.

const { FATIGUE_CEILING } = require('./weeklyPlanner');
const { musclesForExercise, isCompoundExercise } = require('./muscleTaxonomy');

// fatigue.js's computeCNSFatigue decays compound load with a 36-hour
// half-life. Quoted rather than imported because it's a literal inside that
// function; if it moves, the mitigation copy below is wrong.
const CNS_HALF_LIFE_HOURS = 36;

// The centre of computeCNSFatigue's recoveryFactor, and the app's existing
// "steady" recovery threshold. Below this, recovery is inflating CNS fatigue.
const RECOVERY_BASELINE = 55;

const SEVERITY_RANK = { high: 3, moderate: 2, low: 1 };

// Tie-break within a severity tier. Deliberately not `magnitude`: those values
// are in different units (a count of injured muscles, a 0-100 fatigue score,
// hours of sleep debt) and ordering across them would be meaningless. This
// ranks by how directly the factor constrains the session — an injury floors
// specific muscles, CNS and metabolic fatigue change what gets selected and
// how many sets it gets, and recovery/sleep act indirectly by scaling CNS.
const CODE_ORDER = ['injury', 'cns-high', 'metabolic-high', 'structural', 'cns-moderate', 'metabolic-moderate', 'recovery', 'sleep'];

const pct = n => Math.round(n);

// ---------- Relevance to the session actually planned ----------
//
// Severity alone answers "how spent is this", not "does it matter today". High
// lat fatigue is the headline before a pull session and a footnote before a
// leg session, and ranking without that puts the same factor top on both days.
//
// Relevance is a 0-1 multiplier on severity, and every input is measured off
// the planned exercise list — which muscles it trains (musclesForExercise, the
// same attribution fatigue.js credits with) and how much of it is compound
// work (isCompoundExercise, the same predicate computeCNSFatigue selects on).
// Nothing here estimates how a session will feel.
//
// It is opt-in. With no session supplied, every factor scores relevance 1 and
// the ranking is exactly what it was before — a caller that doesn't know
// today's plan gets the unweighted answer rather than a guess about it.
const NO_SESSION_RELEVANCE = 1;

function sessionMuscles(session) {
  const muscles = new Set();
  for (const ex of (session || [])) {
    const name = typeof ex === 'string' ? ex : ex?.name;
    if (!name) continue;
    for (const m of musclesForExercise(name)) muscles.add(m);
  }
  return muscles;
}

// Share of the session's exercises that are compound — what CNS fatigue
// actually acts on, since computeCNSFatigue only accumulates from compounds
// and sessionPlanner only substitutes compounds when CNS is high. A session of
// pure isolation work is genuinely not CNS-limited.
function compoundShare(session) {
  const names = (session || [])
    .map(ex => (typeof ex === 'string' ? ex : ex?.name))
    .filter(Boolean);
  if (!names.length) return NO_SESSION_RELEVANCE;
  return names.filter(isCompoundExercise).length / names.length;
}

// How much of today's work lands on the muscles this factor is about. A factor
// naming muscles the session never touches drops to 0 relevance and falls to
// the bottom, rather than being deleted — it is still true, just not today's
// problem, and "your lats are spent" is worth keeping visible on a leg day.
function muscleRelevance(session, muscles) {
  if (!session) return NO_SESSION_RELEVANCE;
  const affected = muscles || [];
  if (!affected.length) return 0;
  const trained = sessionMuscles(session);
  if (!trained.size) return NO_SESSION_RELEVANCE;
  return affected.filter(m => trained.has(m)).length / affected.length;
}

function relevanceFor(factor, session) {
  if (!session) return NO_SESSION_RELEVANCE;
  switch (factor.code) {
    case 'cns-high':
    case 'cns-moderate':
      return compoundShare(session);
    // Recovery and sleep act on the session only by scaling CNS fatigue (see
    // their own effect copy), so their relevance is CNS's relevance. Claiming
    // otherwise would give them an independent influence the engine doesn't
    // give them.
    case 'recovery':
    case 'sleep':
      return compoundShare(session);
    // Metabolic fatigue caps working sets on every exercise, so it applies to
    // any session at all — there is no subset of today's work it misses.
    case 'metabolic-high':
    case 'metabolic-moderate':
      return NO_SESSION_RELEVANCE;
    default:
      return muscleRelevance(session, factor.muscles);
  }
}

// A hard session can put a dozen muscles over the ceiling, and naming them all
// turns the one line that matters into a wall of text. The count keeps it
// honest about what's been elided instead of truncating silently.
const nameList = (names, cap = 4) => (names.length <= cap
  ? names.join(', ')
  : `${names.slice(0, cap).join(', ')} and ${names.length - cap} more`);

// Mirrors computeCNSFatigue's recoveryFactor exactly, so the interface can
// state the multiplier the engine actually applied rather than describing it
// qualitatively.
function recoveryFactorFor(recoveryScore) {
  return Math.max(0.7, Math.min(1.4, 1 + (RECOVERY_BASELINE - recoveryScore) / 110));
}

function identifyLimitingFactors({
  cnsFatigue = 0,
  metabolicFatigue = 0,
  currentFatigue = {},
  offlineMuscles = [],
  injuries = [],
  recoveryScore = null,
  sleepHours = null,
  sleepTarget = null,
  // The exercises actually planned for today, if known. Null means "don't
  // weight by relevance" rather than "an empty session" — see the relevance
  // block above.
  session = null,
} = {}) {
  const factors = [];

  // Muscles set to ignore (profile.muscleFocus 'ignore') are a standing
  // preference the athlete set once, not something today's session is
  // fighting against, so they are never reported as a limiting factor here.
  // offlineMuscles still does one job below: the alreadyExplained filter
  // keeps these same muscles from resurfacing under structural fatigue,
  // where a permanently-avoided muscle sitting above the ceiling would read
  // as "not selected because it's fatigued" when it's really just excluded
  // outright, regardless of fatigue.

  // An injury is not an exclusion. applyInjuryTaper floors the affected
  // muscles' fatigue at a healing penalty, so they only drop out of selection
  // while that floor sits above the ceiling — and they return on their own as
  // it decays. Saying "excluded" here would be wrong in both directions.
  for (const injury of injuries) {
    const muscles = injury.muscles || [];
    if (!muscles.length) continue;
    const penalty = Math.round(injury.penalty ?? 0);
    factors.push({
      code: 'injury',
      severity: penalty >= FATIGUE_CEILING ? 'high' : 'moderate',
      headline: 'Active injury',
      detail: `${injury.area || 'Injury'} — ${nameList(muscles)} held at ${penalty} fatigue while it heals.`,
      effect: penalty >= FATIGUE_CEILING
        ? `That floor is above the ${FATIGUE_CEILING}-point ceiling, so those muscles are not selected for direct work.`
        : `That floor is below the ${FATIGUE_CEILING}-point ceiling, so they can still be trained — just ranked lower than their real freshness would suggest.`,
      mitigation: 'The floor decays as the injury ages; mark it resolved in Recovery → Injuries once it is symptom-free.',
      magnitude: penalty,
      muscles: [...muscles],
      explanations: {
        beginner: `${injury.area || 'An injury'} is still healing, so ${nameList(muscles)} ${muscles.length === 1 ? 'is' : 'are'} being held back${penalty >= FATIGUE_CEILING ? ' and left out of today\'s session' : ' rather than dropped entirely'}.`,
        intermediate: `${injury.area || 'Injury'} holds ${nameList(muscles)} at ${penalty} fatigue, ${penalty >= FATIGUE_CEILING ? `above the ${FATIGUE_CEILING}-point ceiling, so they are not selected for direct work` : `below the ${FATIGUE_CEILING}-point ceiling, so they are still trainable but ranked lower than their real freshness`}.`,
        scientist: `applyInjuryTaper floors R_m at ${penalty} for ${nameList(muscles)}; selection compares against FATIGUE_CEILING=${FATIGUE_CEILING}. The floor decays with injury age rather than being cleared by rest.`,
      },
    });
  }

  if (cnsFatigue > 70) {
    factors.push({
      code: 'cns-high',
      severity: 'high',
      headline: 'Central nervous system fatigue',
      detail: `CNS fatigue is at ${pct(cnsFatigue)} of 100, from recent heavy compound work.`,
      effect: 'Barbell and dumbbell compounds are being swapped for machine and cable equivalents, and the week is capped at 2 lifting sessions.',
      mitigation: `It decays with a ${CNS_HALF_LIFE_HOURS}-hour half-life, so a day away from heavy compounds roughly halves it.`,
      magnitude: cnsFatigue,
      explanations: {
        beginner: 'Recent heavy lifting has left your nervous system tired. Machine and cable work will feel better today than barbells, and still counts.',
        intermediate: `CNS fatigue is ${pct(cnsFatigue)} of 100. Barbell and dumbbell compounds are being substituted for machine and cable equivalents, and the week is capped at 2 lifting sessions.`,
        scientist: `CNS score ${pct(cnsFatigue)} > 70, the threshold at which sessionPlanner runs substituteForCNS and avoids HIGH_CNS_EQUIPMENT, and weeklyPlanner caps the week at 2. Accumulated from compound load with a ${CNS_HALF_LIFE_HOURS}h half-life.`,
      },
    });
  } else if (cnsFatigue > 40) {
    factors.push({
      code: 'cns-moderate',
      severity: 'moderate',
      headline: 'Central nervous system fatigue',
      detail: `CNS fatigue is at ${pct(cnsFatigue)} of 100.`,
      effect: 'The week is capped at 3 lifting sessions. Exercise selection is unaffected at this level.',
      mitigation: `Decays with a ${CNS_HALF_LIFE_HOURS}-hour half-life — it clears on its own between sessions.`,
      magnitude: cnsFatigue,
      explanations: {
        beginner: 'Your nervous system is carrying some fatigue from recent sessions. Nothing about today changes; it clears on its own.',
        intermediate: `CNS fatigue is ${pct(cnsFatigue)} of 100. The week is capped at 3 lifting sessions; exercise selection is unaffected at this level.`,
        scientist: `CNS score ${pct(cnsFatigue)} is in the 40-70 band: weeklyPlanner caps lift sessions at 3, but the substitution threshold (>70) has not been crossed. Half-life ${CNS_HALF_LIFE_HOURS}h.`,
      },
    });
  }

  if (metabolicFatigue > 60) {
    factors.push({
      code: 'metabolic-high',
      severity: 'high',
      headline: 'Metabolic fatigue',
      detail: `Metabolic fatigue is at ${pct(metabolicFatigue)} of 100 — high recent volume against available carbohydrate.`,
      effect: 'Working sets are capped at 2 per exercise and accessory work is cut to a single movement.',
      mitigation: 'Carbohydrate intake feeds this directly; logging a fuller day lowers it.',
      magnitude: metabolicFatigue,
      explanations: {
        beginner: "You've done a lot of volume recently relative to what you've eaten. Today's session is shorter on purpose.",
        intermediate: `Metabolic fatigue is ${pct(metabolicFatigue)} of 100. Working sets are capped at 2 per exercise and accessory work is cut to a single movement.`,
        scientist: `Metabolic score ${pct(metabolicFatigue)} > 60, so fatigueCeilingFor returns 2 working sets and accessory count drops to 1. Driven by 48h decayed volume against logged carbohydrate, blended with ACWR and performance trend.`,
      },
    });
  } else if (metabolicFatigue > 30) {
    factors.push({
      code: 'metabolic-moderate',
      severity: 'moderate',
      headline: 'Metabolic fatigue',
      detail: `Metabolic fatigue is at ${pct(metabolicFatigue)} of 100.`,
      effect: 'Working sets are capped at 3 per exercise rather than the usual 4.',
      mitigation: 'Carbohydrate intake feeds this directly.',
      magnitude: metabolicFatigue,
      explanations: {
        beginner: "Recent training volume is adding up. You'll get slightly fewer sets per exercise today.",
        intermediate: `Metabolic fatigue is ${pct(metabolicFatigue)} of 100. Working sets are capped at 3 per exercise rather than the usual 4.`,
        scientist: `Metabolic score ${pct(metabolicFatigue)} is in the 30-60 band, so fatigueCeilingFor returns 3 working sets. The 2-set cap begins above 60.`,
      },
    });
  }

  // Muscles already accounted for by an exclusion or an injury taper are left
  // out — reporting the same muscle twice under two headings reads as two
  // separate problems when it's one.
  const alreadyExplained = new Set([...offlineMuscles, ...injuries.flatMap(i => i.muscles || [])]);
  const spent = Object.entries(currentFatigue)
    .filter(([muscle, value]) => value >= FATIGUE_CEILING && !alreadyExplained.has(muscle))
    .sort(([, a], [, b]) => b - a);
  if (spent.length) {
    factors.push({
      code: 'structural',
      severity: spent.length >= 4 ? 'high' : 'moderate',
      headline: 'Local muscle fatigue',
      detail: `${nameList(spent.map(([m]) => m))} ${spent.length === 1 ? 'is' : 'are'} at or above the ${FATIGUE_CEILING}-point fatigue ceiling.`,
      effect: 'Those muscles are not selected for direct work until they drop back below the ceiling.',
      mitigation: 'Structural fatigue decays with time since the session that caused it — training around them is the intended behaviour, not a compromise.',
      magnitude: spent.length,
      muscles: spent.map(([m]) => m),
      explanations: {
        beginner: `${nameList(spent.map(([m]) => m))} ${spent.length === 1 ? 'has' : 'have'} had enough for now. Today's session trains something else instead — that's the plan working, not a setback.`,
        intermediate: `${nameList(spent.map(([m]) => m))} ${spent.length === 1 ? 'is' : 'are'} at or above the ${FATIGUE_CEILING}-point fatigue ceiling, so ${spent.length === 1 ? 'it is' : 'they are'} not selected for direct work until ${spent.length === 1 ? 'it drops' : 'they drop'} back below it.`,
        scientist: `R_m >= FATIGUE_CEILING (${FATIGUE_CEILING}) for ${spent.map(([m, v]) => `${m} ${v}`).join(', ')}. computeMusclePriority excludes these from selection; each decays on its own per-muscle half-life from RECOVERY_H.`,
      },
    });
  }

  // Only claimed when it's genuinely changing a number. Above the baseline the
  // recovery score is improving CNS fatigue, which is not a limiting factor.
  if (recoveryScore != null && recoveryScore < RECOVERY_BASELINE) {
    const factor = recoveryFactorFor(recoveryScore);
    factors.push({
      code: 'recovery',
      severity: recoveryScore < 35 ? 'high' : 'moderate',
      headline: 'Recovery markers below baseline',
      detail: `Recovery is ${pct(recoveryScore)} of 100, under the ${RECOVERY_BASELINE} baseline — HRV, resting heart rate and sleep feed this.`,
      effect: `CNS fatigue is being scaled up ${factor.toFixed(2)}x as a result, which tightens every threshold above.`,
      mitigation: 'Sleep is the largest single input. This resolves on its own once the markers return to baseline.',
      magnitude: (RECOVERY_BASELINE - recoveryScore) * 2,
      explanations: {
        beginner: 'Your overnight recovery numbers came in below your own normal. Everything still works today, it just leaves less room than usual.',
        intermediate: `Recovery is ${pct(recoveryScore)} of 100, under the ${RECOVERY_BASELINE} baseline. CNS fatigue is being scaled up ${factor.toFixed(2)}x as a result, which tightens every other threshold.`,
        scientist: `computeCNSFatigue applies recoveryFactor = clamp(1 + (${RECOVERY_BASELINE} - ${pct(recoveryScore)})/110, 0.7, 1.4) = ${factor.toFixed(2)}. Recovery enters the model only through this multiplier, not as an independent penalty.`,
      },
    });
  }

  // Reported separately from recovery because it's directly actionable, and
  // only when the shortfall is big enough to be a real signal rather than
  // ordinary night-to-night variation.
  if (sleepHours != null && sleepTarget != null && sleepHours < sleepTarget - 1) {
    const short = sleepTarget - sleepHours;
    factors.push({
      code: 'sleep',
      severity: short >= 2 ? 'high' : 'moderate',
      headline: 'Short sleep',
      detail: `${sleepHours.toFixed(1)}h against a ${sleepTarget.toFixed(1)}h target — ${short.toFixed(1)}h short.`,
      effect: 'Feeds the recovery score, which in turn scales CNS fatigue. Its influence is indirect rather than a separate penalty.',
      mitigation: 'A single normal night clears it; consecutive short nights compound through the recovery score.',
      magnitude: short * 10,
      explanations: {
        beginner: `You slept ${sleepHours.toFixed(1)} hours against your usual ${sleepTarget.toFixed(1)}. One normal night puts it back.`,
        intermediate: `${sleepHours.toFixed(1)}h against a ${sleepTarget.toFixed(1)}h target — ${short.toFixed(1)}h short. This feeds the recovery score, which scales CNS fatigue; it is not a separate penalty.`,
        scientist: `Sleep debt ${short.toFixed(1)}h enters the model only via recoveryScore's sleep factor, which then drives computeCNSFatigue's recoveryFactor. Flagged at >1h short to stay above ordinary night-to-night variance.`,
      },
    });
  }

  // Severity first, then relevance to what's actually planned, then the
  // directness ordering. Relevance sits below severity deliberately: a factor
  // that hard-excludes a muscle outranks a merely moderate one even on a day
  // that barely touches it, because the exclusion is still absolute. Within a
  // severity tier it decides, which is where "is this today's problem" belongs.
  return factors
    .map(f => {
      const relevance = relevanceFor(f, session);
      return { ...f, relevance, impact: (SEVERITY_RANK[f.severity] || 1) * relevance };
    })
    .sort((a, b) =>
      (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
      || (b.relevance - a.relevance)
      || (CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)));
}

// The single thing most worth knowing before training today, plus everything
// else that qualified. Returns null when nothing crossed a threshold — which
// is a real and reportable state ("nothing is holding you back"), not an
// absence of data.
function todaysLimitingFactor(inputs) {
  const factors = identifyLimitingFactors(inputs);
  return {
    primary: factors[0] || null,
    others: factors.slice(1),
    clear: factors.length === 0,
    // True when the ranking took today's plan into account, so the interface
    // can say "given today's session" only when that's actually what happened.
    sessionAware: Boolean(inputs?.session),
  };
}

module.exports = {
  identifyLimitingFactors, todaysLimitingFactor, recoveryFactorFor,
  relevanceFor, compoundShare, muscleRelevance,
  CNS_HALF_LIFE_HOURS, RECOVERY_BASELINE,
};
