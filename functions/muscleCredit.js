// What one exercise gives each muscle, and what it costs them.
//
// Two bars per muscle, and the reason they are two bars rather than one number
// is that they are genuinely different claims in different units:
//
//   activation  % of that muscle's own MVIC, read straight out of
//               emgActivation.js. A measurement (interpolated from published
//               EMG), unnormalised, does not sum to 100 across muscles, and
//               can exceed 100. Answers "how hard is this muscle working".
//
//   fatigueCost points of structural fatigue this exercise would actually add,
//               obtained by running whatIfSimulator over it — so it is the
//               number the dashboard will show afterwards, not a parallel
//               estimate. Answers "what does that cost you tomorrow".
//
// Keeping them separate is the point. A muscle can be highly activated and
// cheap (it is fresh, or the movement gives it a small share of the load) or
// barely activated and expensive (it is already near its ceiling). Collapsing
// them into a single "score" would hide exactly the trade-off the visualiser
// exists to show.
//
// Note on the two normalisations, which look similar and are not:
// fatigue.js's creditedShares divides a fixed per-set stimulus pool by relative
// involvement, so its ratios do sum to 1. That is an allocation rule the
// fatigue model is built on, not a claim about measured activation — see its
// comment in fatigue.js. Renormalising the ACTIVATION values the same way is
// the thing this codebase refuses to do, because those are measurements and
// rescaling them fabricates a distribution (parameterExplorer.js's header,
// and test/parameterModelComparison.test.js's fourth case). The first bar is
// therefore never renormalised; the second is allocation and always was.

const { simulateSession } = require('./whatIfSimulator');
const { activationAt, activationOnAxis } = require('./parameterExplorer');

// Muscles ordered by activation, each carrying the fatigue the same exercise
// would add. `sets` and `kg`/`reps` describe the work being credited; without
// them there is no cost to report, only activation.
function muscleCredit({
  pattern,
  angle,
  axis = 'sagittal',
  equipment = null,
  exerciseName = null,
  emgWeights = null,
  sets = 3,
  kg = 0,
  reps = 8,
  lifts = [],
  soreness = [],
  sensitivity = {},
  recoveryHours = undefined,
} = {}) {
  const reading = axis === 'sagittal'
    ? activationAt(pattern, angle)
    : activationOnAxis(pattern, axis, angle, { equipment });
  if (!reading) return null;

  // No named exercise or no load means nothing to simulate. Returning
  // activation alone (with cost null) is honest; inventing a nominal load to
  // fill the second bar would make up the entire quantity being displayed.
  const costable = Boolean(exerciseName) && kg > 0 && reps > 0 && sets > 0;

  let costByMuscle = {};
  let simulated = null;
  if (costable) {
    simulated = simulateSession({
      lifts,
      soreness,
      sensitivity,
      ...(recoveryHours ? { recoveryHours } : {}),
      exercises: [{
        name: exerciseName,
        emgWeights: emgWeights || undefined,
        sets: Array.from({ length: sets }, () => ({ type: 'N', kg, reps })),
      }],
    });
    for (const m of simulated.muscles) costByMuscle[m.muscle] = m;
  }

  const muscles = reading.muscles.map(m => {
    const cost = costByMuscle[m.muscle] || null;
    return {
      muscle: m.muscle,
      role: m.role,
      activation: m.activation,
      // Both bars are drawn against a real ceiling rather than a notional 100:
      // activation against this movement's own peak across the axis, cost
      // against the fatigue ceiling the planner actually selects on.
      activationOfScale: reading.scale ? m.activation / reading.scale : null,
      fatigueCost: cost ? cost.fatigueDelta : null,
      fatigueBefore: cost ? cost.fatigueBefore : null,
      fatigueAfter: cost ? cost.fatigueAfter : null,
      crossesCeiling: cost ? cost.crossesCeiling : false,
      clamped: cost ? cost.clamped : false,
    };
  });

  return {
    pattern,
    axis,
    value: angle,
    scale: reading.scale,
    description: reading.description || null,
    muscles,
    // Explicitly flagged so the interface can render one bar instead of two
    // rather than drawing an empty second bar that reads as "zero cost".
    hasCost: costable,
    ceiling: simulated ? simulated.ceiling : null,
    recoveryDelayH: simulated ? simulated.recoveryDelayH : null,
  };
}

// The same credit at every setting of an axis — what the visualiser animates
// between as the slider moves, precomputed so dragging doesn't re-simulate.
function creditAcrossAxis(options, params) {
  return (options || [])
    .map(value => muscleCredit({ ...params, angle: value }))
    .filter(Boolean);
}

module.exports = { muscleCredit, creditAcrossAxis };
