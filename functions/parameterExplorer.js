// Reads the EMG tables in emgActivation.js to answer the three questions the
// parameter sliders need: what does this movement activate at this angle, what
// angle would be best for a given muscle, and how far from that is the current
// setting.
//
// One thing to be careful about when displaying any of this. The EMG values
// are "% of each muscle's own MVIC/peak" — they are NOT shares of the exercise
// and do not sum to 100, and they can exceed 100 (a dynamic contraction can
// beat a static MVIC reference; see emgActivation.js's header). So front-delt
// 100 and chest 43 at the same angle means "front-delt is near its own
// ceiling, chest is at 43% of its own" — it does not mean the movement is 70%
// front-delt. Rendering these as a pie, or normalising them to sum to 100,
// turns a real measurement into a fabricated distribution. `activationAt`
// returns them unnormalised for exactly this reason, with `scale` supplied so
// a bar chart can be drawn against a real ceiling instead of inventing one.
//
// Everything here is a table lookup. Nothing is modelled, fitted or predicted.

const {
  ANGLES, emgForAngle, idealAngleForMuscle, muscleEnvelope, classifyMuscles,
  PRESS_FRONTAL_EMG, ROW_FRONTAL_EMG, FRONTAL_ANGLES,
  PRESS_GRIP_EMG, ROW_GRIP_EMG, GRIP_ANGLES, GRIP_LABELS, GRIP_ANGLES_BY_EQUIPMENT,
} = require('./emgActivation');

// Every pattern with an angle table. Kept here rather than inferred so the
// Target Muscle Planner sweeps a known list instead of guessing names.
const ANGLE_PATTERNS = ['press', 'row', 'fly', 'curl', 'extension', 'leg-curl', 'hyperextension'];

// Hyperextension is deliberately not a continuous range: only two real device
// types exist (a 45° bench and a 90° Roman chair), so its table has two
// entries and the slider must offer exactly those. Derived from the table
// rather than hardcoded, so adding an angle upstream is picked up here.
function angleOptionsFor(pattern) {
  return ANGLES.filter(angle => emgForAngle(pattern, angle) != null);
}

// Muscles this movement touches at this angle, strongest first. `scale` is the
// highest activation this pattern reaches at any angle, so a bar can be drawn
// against the movement's own real ceiling — using 100 would clip the values
// that legitimately exceed it.
function activationAt(pattern, angle) {
  const weights = emgForAngle(pattern, angle);
  if (!weights) return null;

  let scale = 0;
  for (const a of angleOptionsFor(pattern)) {
    for (const value of Object.values(emgForAngle(pattern, a) || {})) {
      if (value > scale) scale = value;
    }
  }

  // Roles come from classifyMuscles rather than a second comparison against
  // the same thresholds — the builder already stamps primary/secondary onto
  // the logged exercise with it, and two copies of that cutoff would let the
  // slider's labels drift from what actually gets recorded.
  const { primary, secondary } = classifyMuscles(weights);
  const primarySet = new Set(primary);
  const secondarySet = new Set(secondary);

  const muscles = Object.entries(weights)
    .map(([muscle, activation]) => ({
      muscle,
      activation,
      role: primarySet.has(muscle) ? 'primary' : secondarySet.has(muscle) ? 'secondary' : 'minor',
    }))
    .sort((a, b) => b.activation - a.activation);

  return { pattern, angle, scale: scale || 100, muscles };
}

// The angle in this pattern that puts the most activation on one muscle.
function optimalAngleFor(pattern, muscle) {
  const angle = idealAngleForMuscle(pattern, muscle);
  if (angle == null) return null;
  const activation = emgForAngle(pattern, angle)?.[muscle];
  if (activation == null) return null;
  return { pattern, angle, activation };
}

// How far the current setting is from the best one for a target muscle. The
// point of this is to let someone choose a non-optimal angle knowingly, so it
// reports the real gap and never blocks anything.
function compareAngle(pattern, angle, muscle) {
  const best = optimalAngleFor(pattern, muscle);
  if (!best) return null;
  const current = emgForAngle(pattern, angle)?.[muscle] ?? 0;
  const deficit = best.activation - current;
  return {
    muscle,
    current,
    peak: best.activation,
    peakAngle: best.angle,
    // Rounded to a whole percentage point of the muscle's own peak. Not a
    // predicted strength or hypertrophy difference — this is the activation
    // gap the table shows, nothing more.
    deficitPct: best.activation > 0 ? Math.round((deficit / best.activation) * 100) : 0,
    atOptimum: angle === best.angle,
  };
}

// Target Muscle Planner: pick a muscle, get the movement and angle that
// activate it hardest, ranked. A sweep of every angle table, so the answer is
// as good as the tables and no better.
function bestConfigurationsFor(muscle, patterns = ANGLE_PATTERNS) {
  return patterns
    .map(pattern => optimalAngleFor(pattern, muscle))
    .filter(Boolean)
    .sort((a, b) => b.activation - a.activation);
}

// Every muscle any angle table touches, for populating a target-muscle picker
// without offering muscles no slider can affect.
function targetableMuscles(patterns = ANGLE_PATTERNS) {
  const seen = new Set();
  for (const pattern of patterns) {
    const { primary, secondary } = muscleEnvelope(pattern);
    for (const muscle of [...primary, ...secondary]) seen.add(muscle);
  }
  return [...seen].sort();
}

// ---------- Multi-axis exploration ----------
//
// Three physically independent things you can change about a press or a row,
// each with its own table in emgActivation.js:
//
//   sagittal  which exercise/angle      0-180   every angle pattern
//   frontal   elbow flare               0-90    press and row only
//   grip      forearm rotation          0-180   press and row only, equipment-gated
//
// They are kept apart here, and that is the whole design. The tempting move is
// to multiply them into one combined profile — one number per muscle for the
// current setting of all three. Two reasons not to, both already settled
// elsewhere in this codebase:
//
//   - Nothing measured these axes in combination. Each table was interpolated
//     from studies varying ONE of them, so a product is an extrapolation into
//     a space no source covers. movementEmg.js makes the same call for the
//     same reason and says so at ELBOW_SHOULDER_MODIFIER: it keeps the
//     shoulder-position modifier as reference data rather than folding it in.
//   - The values are % of each muscle's own MVIC, so multiplying two of them
//     is not a meaningful operation on the unit. test/parameterModelComparison
//     .test.js has the worked example: a multiplicative model puts front delt
//     at 213% during an overhead press, because a multiplier ignores that the
//     quantity is already defined against that muscle's ceiling.
//
// So the explorer shows three readings side by side, each answering "what does
// this axis do, holding the others where they are", which is what the tables
// can actually support.

const AXES = ['sagittal', 'frontal', 'grip'];

const AXIS_META = {
  sagittal: {
    label: 'Angle',
    // Filled per-pattern by axisOptions — a pattern's real angle grid, which
    // is not the same for all of them (hyperextension has exactly two).
    describe: angle => `${angle}°`,
  },
  frontal: {
    label: 'Elbow flare',
    describe: angle => (angle === 0 ? 'tucked to the body'
      : angle === 90 ? 'fully flared' : `${angle}° from the torso`),
  },
  grip: {
    label: 'Grip rotation',
    describe: angle => GRIP_LABELS[angle] || `${angle}°`,
  },
};

function tableFor(pattern, axis) {
  if (axis === 'sagittal') return null; // handled by emgForAngle's own dispatch
  if (axis === 'frontal') return pattern === 'press' ? PRESS_FRONTAL_EMG : pattern === 'row' ? ROW_FRONTAL_EMG : null;
  if (axis === 'grip') return pattern === 'press' ? PRESS_GRIP_EMG : pattern === 'row' ? ROW_GRIP_EMG : null;
  return null;
}

// What this axis can be set to for this pattern on this equipment. Empty means
// the axis genuinely doesn't apply — a fixed-handle machine offers no grip
// choice at all, and GRIP_ANGLES_BY_EQUIPMENT says so rather than pretending
// it has one (see its comment). An empty list is a real answer.
function axisOptions(pattern, axis, { equipment = null } = {}) {
  if (axis === 'sagittal') return angleOptionsFor(pattern);
  const table = tableFor(pattern, axis);
  if (!table) return [];
  if (axis === 'frontal') return [...FRONTAL_ANGLES];
  const allowed = equipment ? GRIP_ANGLES_BY_EQUIPMENT[equipment] : GRIP_ANGLES;
  return [...(allowed || GRIP_ANGLES)];
}

function weightsOn(pattern, axis, value) {
  if (axis === 'sagittal') return emgForAngle(pattern, value);
  return tableFor(pattern, axis)?.[value] || null;
}

// Same shape as activationAt, for any of the three axes: muscles strongest
// first, unnormalised, with the axis's own ceiling as `scale`.
function activationOnAxis(pattern, axis, value, { equipment = null } = {}) {
  const weights = weightsOn(pattern, axis, value);
  if (!weights) return null;

  const options = axisOptions(pattern, axis, { equipment });
  let scale = 0;
  for (const option of options) {
    for (const v of Object.values(weightsOn(pattern, axis, option) || {})) {
      if (v > scale) scale = v;
    }
  }

  const { primary, secondary } = classifyMuscles(weights);
  const primarySet = new Set(primary);
  const secondarySet = new Set(secondary);

  return {
    pattern,
    axis,
    value,
    label: AXIS_META[axis].label,
    description: AXIS_META[axis].describe(value),
    scale: scale || 100,
    muscles: Object.entries(weights)
      .map(([muscle, activation]) => ({
        muscle,
        activation,
        role: primarySet.has(muscle) ? 'primary' : secondarySet.has(muscle) ? 'secondary' : 'minor',
      }))
      .sort((a, b) => b.activation - a.activation),
  };
}

// The setting of this axis that puts the most on one muscle, restricted to
// what the equipment can actually do.
function bestValueOnAxis(pattern, axis, muscle, { equipment = null } = {}) {
  const options = axisOptions(pattern, axis, { equipment });
  let best = null, bestVal = -Infinity;
  for (const option of options) {
    const v = weightsOn(pattern, axis, option)?.[muscle];
    if (v != null && v > bestVal) { bestVal = v; best = option; }
  }
  return best == null ? null : { pattern, axis, value: best, activation: bestVal };
}

// How much this axis is worth moving for a given muscle. `swing` is the gap
// between its best and worst achievable setting: an axis a muscle barely
// responds to is a slider not worth dragging, and saying so is more useful
// than a recommendation with nothing behind it. Mirrors the range guard
// gripCueForProfile and frontalCueForProfile already apply before offering a
// cue at all.
function axisSensitivity(pattern, axis, muscle, { equipment = null } = {}) {
  const options = axisOptions(pattern, axis, { equipment });
  let best = null, bestVal = -Infinity, worstVal = Infinity;
  for (const option of options) {
    const v = weightsOn(pattern, axis, option)?.[muscle];
    if (v == null) continue;
    if (v > bestVal) { bestVal = v; best = option; }
    if (v < worstVal) worstVal = v;
  }
  if (best == null) return null;
  return {
    axis,
    muscle,
    bestValue: best,
    peak: bestVal,
    floor: worstVal,
    swing: Math.round((bestVal - worstVal) * 10) / 10,
  };
}

// Every axis available for this movement, each with its options, its current
// reading and — when a target muscle is given — where that muscle would prefer
// it. This is the ParameterExplorer's whole data contract.
function exploreParameters(pattern, current = {}, { equipment = null, targetMuscle = null } = {}) {
  const axes = [];
  for (const axis of AXES) {
    const options = axisOptions(pattern, axis, { equipment });
    if (!options.length) continue;

    const value = current[axis] != null && options.includes(current[axis])
      ? current[axis]
      : options[Math.floor(options.length / 2)];

    const reading = activationOnAxis(pattern, axis, value, { equipment });
    if (!reading) continue;

    axes.push({
      ...reading,
      options: options.map(option => ({ value: option, description: AXIS_META[axis].describe(option) })),
      recommended: targetMuscle ? bestValueOnAxis(pattern, axis, targetMuscle, { equipment }) : null,
      sensitivity: targetMuscle ? axisSensitivity(pattern, axis, targetMuscle, { equipment }) : null,
    });
  }
  return { pattern, equipment, targetMuscle, axes };
}

module.exports = {
  ANGLE_PATTERNS, angleOptionsFor, activationAt,
  optimalAngleFor, compareAngle, bestConfigurationsFor, targetableMuscles,
  AXES, AXIS_META, axisOptions, activationOnAxis, bestValueOnAxis,
  axisSensitivity, exploreParameters,
};
