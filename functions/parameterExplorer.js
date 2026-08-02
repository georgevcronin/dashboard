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

module.exports = {
  ANGLE_PATTERNS, angleOptionsFor, activationAt,
  optimalAngleFor, compareAngle, bestConfigurationsFor, targetableMuscles,
};
