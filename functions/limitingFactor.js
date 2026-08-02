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

const { FATIGUE_CEILING } = require('./weeklyPlanner');

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
// ranks by how directly the factor constrains the session — an avoid-list
// exclusion is absolute, an injury floors specific muscles, CNS and metabolic
// fatigue change what gets selected and how many sets it gets, and
// recovery/sleep act indirectly by scaling CNS.
const CODE_ORDER = ['excluded', 'injury', 'cns-high', 'metabolic-high', 'structural', 'cns-moderate', 'metabolic-moderate', 'recovery', 'sleep'];

const pct = n => Math.round(n);

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
} = {}) {
  const factors = [];

  // Two genuinely different mechanisms, kept apart because they behave
  // differently in the engine and conflating them would misstate both.
  //
  // offlineMuscles is the avoid list (profile.muscleFocus 'ignore'), which
  // index.js passes to computeMusclePriority as a hard -1 exclusion.
  if (offlineMuscles.length) {
    factors.push({
      code: 'excluded',
      severity: 'high',
      headline: 'Muscles set to avoid',
      detail: `${nameList(offlineMuscles)} ${offlineMuscles.length === 1 ? 'is' : 'are'} set to avoid in your muscle priorities.`,
      effect: 'They are excluded from exercise selection outright, and any exercise that loads them as a prime mover is skipped.',
      mitigation: 'Change them from Avoid in Settings → Muscle Priorities to bring them back in.',
      magnitude: offlineMuscles.length,
    });
  }

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
    });
  }

  return factors.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
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
  };
}

module.exports = {
  identifyLimitingFactors, todaysLimitingFactor, recoveryFactorFor,
  CNS_HALF_LIFE_HOURS, RECOVERY_BASELINE,
};
