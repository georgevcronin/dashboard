// Pick the muscles, get the movement — the inverse of the usual workflow.
//
// Sweeps every angle pattern against every setting on its own real grid,
// scores each configuration against the muscles you asked for, and penalises
// the ones that lean on something you have already spent. The sweep is a
// complete enumeration of the tables in emgActivation.js: seven patterns times
// at most thirteen angles, so a few dozen candidates. Nothing is sampled,
// approximated or searched heuristically, and the result is exactly as good as
// those tables and no better.
//
// Two things about the score are judgement calls rather than measurements, and
// are labelled as such in the output so the interface can be honest about it:
//
//   1. `stimulus` sums each target muscle's activation. Those are % of each
//      muscle's own MVIC, so a sum across two muscles is not a physical
//      quantity — front delt at 90 plus chest at 60 is not "150" of anything.
//      It is a monotone ordering: more of what you asked for ranks higher.
//      Fine as a comparator, meaningless as a number, so it is never shown as
//      a total. When one muscle is targeted, the ordering is exactly that
//      muscle's activation and the caveat disappears.
//
//   2. `lambda` is how much a fatigued synergist should count against a
//      configuration. There is no measured value for this — it is a preference
//      about training, not a fact about physiology. The default below is set
//      so the penalty is legible without being decisive; it is exposed as a
//      parameter because it is the kind of thing that should be arguable.
//
// What is NOT a judgement call: the fatigue ratios come from the same
// computeStructuralFatigue reading as the rest of the app, and the ceiling is
// weeklyPlanner's real FATIGUE_CEILING, so "avoid this, the synergist is
// spent" cashes out as the same threshold that governs exercise selection.

const { emgForAngle } = require('./emgActivation');
const { ANGLE_PATTERNS, angleOptionsFor } = require('./parameterExplorer');
const { EXERCISE_DB } = require('./exerciseDb');
const { FATIGUE_CEILING } = require('./weeklyPlanner');

// Weight on the limiting-fatigue penalty in Score = stimulus / (1 + lambda*L).
// At 1.5, a configuration whose most-spent muscle is at 100 fatigue scores 2.5x
// worse than an otherwise identical one whose muscles are all fresh — enough to
// reorder genuinely close candidates, not enough to bury a movement that is
// substantially better at the actual job.
const DEFAULT_LAMBDA = 1.5;

// The angle-family entries are the ones whose angle is chosen per set, so they
// are the movements a configuration can actually be built as. Grouped by
// pattern so a recommendation can name real equipment instead of an abstract
// "press at 135 degrees".
function familyExercisesByPattern() {
  const out = {};
  for (const entry of EXERCISE_DB) {
    if (!entry.isAngleFamily || !entry.pattern) continue;
    (out[entry.pattern] = out[entry.pattern] || []).push(entry);
  }
  return out;
}

// L_e: the most-fatigued muscle this configuration meaningfully involves,
// as a 0-1 ratio. Restricted to muscles above `involvementFloor` so a movement
// isn't penalised for a muscle it barely touches — without that, every press
// carries its incidental biceps involvement into the penalty and the ranking
// flattens out.
function limitingFatigue(weights, currentFatigue, involvementFloor) {
  let worst = 0;
  let worstMuscle = null;
  for (const [muscle, activation] of Object.entries(weights || {})) {
    if (activation < involvementFloor) continue;
    const ratio = (currentFatigue?.[muscle] || 0) / 100;
    if (ratio > worst) { worst = ratio; worstMuscle = muscle; }
  }
  return { ratio: worst, muscle: worstMuscle };
}

function scoreConfiguration(pattern, angle, targetMuscles, {
  currentFatigue = {}, lambda = DEFAULT_LAMBDA, involvementFloor = 20,
} = {}) {
  const weights = emgForAngle(pattern, angle);
  if (!weights) return null;

  const perTarget = targetMuscles
    .map(muscle => ({ muscle, activation: weights[muscle] ?? null }))
    .filter(t => t.activation != null);

  // A pattern that never tracks any target muscle is not a weak candidate, it
  // is not a candidate — dropped rather than scored 0, so it can't fill the
  // list when nothing good exists.
  if (!perTarget.length) return null;

  const stimulus = perTarget.reduce((sum, t) => sum + t.activation, 0);
  const limiting = limitingFatigue(weights, currentFatigue, involvementFloor);
  const score = stimulus / (1 + lambda * limiting.ratio);

  return {
    pattern,
    angle,
    perTarget: perTarget.sort((a, b) => b.activation - a.activation),
    stimulus,
    limitingFatigue: limiting.ratio,
    limitingMuscle: limiting.muscle,
    // Reported so the interface can say what the penalty actually did, rather
    // than presenting a score with an invisible adjustment inside it.
    penaltyFactor: 1 + lambda * limiting.ratio,
    score,
    // The muscles this configuration would put over the planner's ceiling are
    // a harder fact than the penalty and worth surfacing separately.
    spentMuscles: Object.entries(weights)
      .filter(([m, a]) => a >= involvementFloor && (currentFatigue?.[m] || 0) >= FATIGUE_CEILING)
      .map(([m]) => m),
  };
}

// Rank every buildable configuration for a set of target muscles.
function findOptimalConfigurations(targetMuscles, {
  currentFatigue = {},
  lambda = DEFAULT_LAMBDA,
  patterns = ANGLE_PATTERNS,
  involvementFloor = 20,
  limit = 5,
  equipment = null,
} = {}) {
  const targets = [...new Set((targetMuscles || []).filter(Boolean))];
  if (!targets.length) return { targets: [], results: [], lambda };

  const families = familyExercisesByPattern();
  const scored = [];

  for (const pattern of patterns) {
    for (const angle of angleOptionsFor(pattern)) {
      const result = scoreConfiguration(pattern, angle, targets, { currentFatigue, lambda, involvementFloor });
      if (!result) continue;

      const options = (families[pattern] || [])
        .filter(e => !equipment || e.equipment === equipment);
      if (!options.length) continue;

      scored.push({
        ...result,
        exercises: options.map(e => ({ name: e.name, equipment: e.equipment })),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score
    // Deterministic tie-break, so an unchanged athlete state can't reorder the
    // list between two renders.
    || b.stimulus - a.stimulus
    || a.pattern.localeCompare(b.pattern)
    || a.angle - b.angle);

  return {
    targets,
    lambda,
    involvementFloor,
    ceiling: FATIGUE_CEILING,
    // Present so the interface can explain a ranking that isn't purely by
    // stimulus, which otherwise looks like a bug.
    penaltyApplied: scored.some(s => s.limitingFatigue > 0),
    results: scored.slice(0, limit),
    // How many were considered, for "5 of 47" rather than an unqualified top 5.
    consideredCount: scored.length,
  };
}

// The same sweep with the fatigue penalty switched off — what you would have
// been told if nothing were tired. Used to explain a recommendation that
// changed because of your current state, which is the one case where the
// planner's answer is surprising.
function withoutFatiguePenalty(targetMuscles, options = {}) {
  return findOptimalConfigurations(targetMuscles, { ...options, currentFatigue: {}, lambda: 0 });
}

// Did current fatigue actually change the recommendation? Returns null when it
// didn't, so the interface can stay silent rather than announcing a
// counterfactual that matches what it already said.
function fatigueChangedTheAnswer(targetMuscles, options = {}) {
  const withPenalty = findOptimalConfigurations(targetMuscles, options);
  const without = withoutFatiguePenalty(targetMuscles, options);

  const top = withPenalty.results[0];
  const unpenalisedTop = without.results[0];
  if (!top || !unpenalisedTop) return null;
  if (top.pattern === unpenalisedTop.pattern && top.angle === unpenalisedTop.angle) return null;

  return {
    chosen: top,
    insteadOf: unpenalisedTop,
    because: unpenalisedTop.limitingMuscle,
    // The fatigue reading that caused the swap, so the claim is checkable.
    fatigue: Math.round(unpenalisedTop.limitingFatigue * 100),
  };
}

module.exports = {
  findOptimalConfigurations, scoreConfiguration, withoutFatiguePenalty,
  fatigueChangedTheAnswer, limitingFatigue, DEFAULT_LAMBDA,
};
