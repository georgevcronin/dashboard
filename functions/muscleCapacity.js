// Cross-exercise 1RM prediction for PressRowBuilder exercises: solves for
// each involved muscle's own underlying "capacity" (a latent value, same kg
// units as an exercise's e1RM) from the athlete's REAL historical press/row
// performance, then predicts a never-before-logged angle's expected e1RM
// from those capacities. This is what lets "first time trying 90° cable
// row" get a real, personalized target weight instead of a guess or a
// generic default.
//
// Model: e1RM_i ≈ Σ_m (EMG%_m / 100) × capacity_m, for every historical
// exercise i whose angle is known (functions/exerciseAngles.js). With
// enough distinct angles logged (different EMG mixes), that's an
// overdetermined linear system solvable by least squares. A muscle that
// never appears with enough weight across ANY logged exercise simply has no
// estimate — see coverage in predictExerciseE1RM below, which is what lets
// callers show "rough estimate" instead of a false-confidence number.
//
// Ridge regularization (a small penalty added to the diagonal before
// solving) is used because this system is very likely underdetermined for
// most real accounts (13 possible muscles, rarely 13+ distinct angles
// logged) — without it, plain least squares on a near-singular matrix
// produces wildly unstable, overfit capacity values. The ridge strength and
// the per-muscle 0-floor are both precision-sensitive enough that they get
// their own reasoning below rather than a single fixed constant.

const { EXERCISE_ANGLES } = require('./exerciseAngles');
const { emgForAngle } = require('./emgActivation');
const { estimate1RM } = require('./strengthStandards');
const { findExercise } = require('./muscleTaxonomy');

// Candidate ridge penalties, log-spaced around the old fixed RIDGE=4.0.
// Picked per-account by leave-one-out CV (chooseRidge) rather than fixed,
// because a flat 4.0 was wrong at both ends: too weak once an account has
// 10+ distinct logged angles (needlessly shrinks an already well-determined
// system), too strong at the 3-4 observation floor (not enough penalty to
// tame a near-singular matrix). See chooseRidge for the selection procedure.
const RIDGE_CANDIDATES = [1, 2, 4, 8, 16];

// Used instead of running CV when there's only barely enough data to run
// the regression at all (see MIN_OBSERVATIONS_FOR_LOOCV) — the old fixed
// value, kept as a sane mid-range default rather than picked arbitrarily.
const DEFAULT_RIDGE = 4;

const MIN_OBSERVATIONS = 3;

// Leave-one-out CV needs at least one extra observation beyond the
// regression floor to mean anything: at exactly MIN_OBSERVATIONS (3), every
// fold trains on only 2 points against up to a dozen-plus muscle columns —
// each held-out error is close to an arbitrary extrapolation, so "best" λ
// there would be fitting CV noise, not signal. One extra observation of
// slack is enough for the held-out comparisons to start reflecting real
// generalization rather than pure noise.
const MIN_OBSERVATIONS_FOR_LOOCV = MIN_OBSERVATIONS + 1;

// A muscle's solved value only counts as a trustworthy anchor for the
// mean-prior (see applyMeanPriorShrinkage) if it's backed by at least two
// distinct observations — a muscle appearing in only one logged exercise is
// collinear with whatever else that single equation contains, and its
// solved value on its own doesn't mean much.
const WELL_SUPPORTED_MIN_COVERAGE = 2;

// Only MACHINE-equipment exercises get a brand+model load factor — same
// minimum as MIN_OBSERVATIONS, per design: barbell/dumbbell/cable
// exercises generalize across manufacturers well enough not to need one,
// but two machines of the same nominal lift (e.g. a Life Fitness vs. a
// Hammer Strength chest press) can load very differently for the same true
// output, so those get their own per-(brand,model) correction once there's
// enough data to trust it.
const EQUIPMENT_MIN_OBSERVATIONS = 3;

// Virtual-sample-size prior for a machine's load factor: shrinkage weight
// is EQUIPMENT_FACTOR_PRIOR_WEIGHT / (EQUIPMENT_FACTOR_PRIOR_WEIGHT + n),
// same shape as a Bayesian pseudo-count prior. Chosen as roughly double the
// EQUIPMENT_MIN_OBSERVATIONS gate: right at the gate (n=3) a machine's own
// factor is still weighted a minority (3/8 ≈ 38%) against the safe generic
// 1.0 default, since 3 observations is barely past "don't guess at all";
// by n=15 (a machine used across many logged sessions/exercises) the
// weight has faded to 5/20=25% and the machine's own signal dominates. A
// smaller prior would let a marginal 3-observation machine swing its own
// factor too far from 1.0 on noise; a much larger one would make the fade
// too slow to ever matter for a sole-user account's realistic data volume.
const EQUIPMENT_FACTOR_PRIOR_WEIGHT = 5;

// ALS (alternating least squares, see runALS) iteration cap and
// convergence threshold. 10 iterations is far more than this ever needs in
// practice (factors on this small a system tend to settle in 2-4 passes);
// the epsilon just lets it exit early once the largest per-machine factor
// change between iterations is negligible rather than always spending the
// full budget.
const ALS_MAX_ITERATIONS = 10;
const ALS_CONVERGENCE_EPS = 1e-4;

function liftTime(l) { return new Date(l.start || l.date).getTime(); }

// True only for exercises exerciseDb.js itself tags as `equipment:
// 'machine'` (selectorized/plate-loaded machines) — deliberately excludes
// 'smith' (a fixed-track barbell: same free-weight physics as a barbell,
// not a cammed/pulleyed system that can legitimately load differently
// brand to brand) and 'cable' (per the design brief, cable stations
// generalize across manufacturers same as barbell/dumbbell). Exercises not
// found in EXERCISE_DB at all (a few EXERCISE_ANGLES entries predate
// current canonical naming) conservatively return false rather than guess.
function isMachineExercise(name) {
  const entry = findExercise(name);
  return !!entry && entry.equipment === 'machine';
}

// One observation per exercise the athlete has an angle for AND has
// actually logged, using their single best (highest) reliable e1RM for it —
// simplest reasonable choice; not fatigue-corrected or recency-weighted
// like computeMuscleLevels, since this only needs a stable target value per
// exercise, not a live-fatigue-aware one.
//
// For MACHINE-equipment exercises that also carry a logged brand+model
// (`l.machine`/`l.model`), the "best per X" grouping key includes the
// machine so the same exercise logged on two different named machines
// yields two separate observations instead of one collapsing the other —
// each is real signal about that specific machine's own load factor (see
// runALS). Non-machine equipment, and machine exercises with no
// brand/model logged, keep the original exercise-name-only grouping —
// identical output to before whenever there's no machine data to key on.
function buildObservations(lifts) {
  const byKey = {};
  for (const l of (lifts || [])) {
    const name = (l.exercise || '').toLowerCase().trim();
    const angleInfo = EXERCISE_ANGLES[name];
    if (!angleInfo) continue;
    const est = estimate1RM(l.kg, l.reps);
    if (est == null) continue;
    const hasMachineTag = isMachineExercise(name) && !!l.machine;
    const key = hasMachineTag ? `${name}::${l.machine}::${l.model || ''}` : name;
    if (!byKey[key] || est > byKey[key].e1rm) {
      byKey[key] = {
        name, pattern: angleInfo.pattern, angle: angleInfo.angle, e1rm: est,
        ...(hasMachineTag ? { machine: l.machine, model: l.model || null } : {}),
      };
    }
  }
  return Object.values(byKey).map(o => ({ ...o, weights: emgForAngle(o.pattern, o.angle) })).filter(o => o.weights);
}

function transpose(X) { return X[0].map((_, c) => X.map(row => row[c])); }
function matMul(A, B) {
  const out = A.map(() => new Array(B[0].length).fill(0));
  for (let i = 0; i < A.length; i++) {
    for (let k = 0; k < B.length; k++) {
      if (A[i][k] === 0) continue;
      for (let j = 0; j < B[0].length; j++) out[i][j] += A[i][k] * B[k][j];
    }
  }
  return out;
}

// Gauss-Jordan elimination with partial pivoting -- fine for the small
// (<=15x15) systems this module ever produces (one row/col per distinct
// muscle across press+row).
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-9) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivot;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-9 ? 0 : row[n] / row[i]));
}

function buildXy(observations, muscles) {
  const X = observations.map(o => muscles.map(m => (o.weights[m] || 0) / 100));
  const y = observations.map(o => o.e1rm);
  return { X, y };
}

// Plain ridge solve, no shrinkage/floor applied -- used by chooseRidge's CV
// loop, which needs the raw regression's own held-out error, not a
// post-hoc-adjusted one.
function ridgeSolve(observations, muscles, ridge) {
  const { X, y } = buildXy(observations, muscles);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  for (let i = 0; i < muscles.length; i++) XtX[i][i] += ridge;
  const Xty = matMul(Xt, y.map(v => [v])).map(row => row[0]);
  return solveLinearSystem(XtX, Xty);
}

// Picks a ridge penalty per-account via leave-one-out cross-validation:
// hold out one observation, solve on the rest, measure the held-out
// prediction's squared error, sum across every held-out fold, repeat per
// candidate, keep whichever candidate minimizes total error. Skipped (falls
// back to DEFAULT_RIDGE) below MIN_OBSERVATIONS_FOR_LOOCV -- see that
// constant's own reasoning.
function chooseRidge(observations, muscles) {
  if (observations.length < MIN_OBSERVATIONS_FOR_LOOCV) return DEFAULT_RIDGE;
  let best = DEFAULT_RIDGE;
  let bestError = Infinity;
  for (const candidate of RIDGE_CANDIDATES) {
    let sse = 0;
    for (let i = 0; i < observations.length; i++) {
      const train = observations.filter((_, j) => j !== i);
      const held = observations[i];
      const solved = ridgeSolve(train, muscles, candidate);
      const predicted = muscles.reduce((s, m, k) => s + ((held.weights[m] || 0) / 100) * solved[k], 0);
      sse += (predicted - held.e1rm) ** 2;
    }
    if (sse < bestError) { bestError = sse; best = candidate; }
  }
  return best;
}

// Replaces the old `Math.max(0, solved[i])` hard floor. A muscle that
// solves slightly negative is noise, not truth -- clamping it to exactly 0
// throws that away and (via predictExerciseE1RM) understates any predicted
// angle that leans on it. Instead, shrink every muscle's raw solved value
// toward the athlete's OWN prior mean -- their average capacity across
// muscles that have solid data (non-negative and backed by at least
// WELL_SUPPORTED_MIN_COVERAGE observations) -- with a per-muscle shrinkage
// weight of ridge / (ridge + info), where `info` is that muscle's own
// diagonal contribution to X'X (Σ of its squared EMG-weight fractions
// across observations). This is the same shape ridge regression itself
// already uses to shrink coefficients toward 0 (penalty / (penalty +
// eigenvalue)) -- reusing it here just retargets it at a sensible
// athlete-specific mean instead of a fixed constant, so a muscle with
// little/no supporting data (low info) gets pulled hard toward the prior,
// while a muscle with clearly positive, well-supported data (high info)
// is barely shrunk at all. The final Math.max(0, ...) is a last-resort
// physical floor (capacity can't be genuinely negative) that should rarely
// bind now that mildly-negative cases land on a positive shrunk value
// instead.
function applyMeanPriorShrinkage(muscles, solved, observations, ridge) {
  const solvedByMuscle = {};
  muscles.forEach((m, i) => { solvedByMuscle[m] = solved[i]; });

  const info = {};
  const coverage = {};
  muscles.forEach(m => {
    info[m] = observations.reduce((s, o) => s + ((o.weights[m] || 0) / 100) ** 2, 0);
    coverage[m] = observations.filter(o => (o.weights[m] || 0) > 0).length;
  });

  const solidValues = muscles
    .filter(m => solvedByMuscle[m] >= 0 && coverage[m] >= WELL_SUPPORTED_MIN_COVERAGE)
    .map(m => solvedByMuscle[m]);
  const priorMean = solidValues.length ? solidValues.reduce((a, b) => a + b, 0) / solidValues.length : 0;

  const capacities = {};
  muscles.forEach(m => {
    const weight = ridge / (ridge + info[m]);
    const blended = (1 - weight) * solvedByMuscle[m] + weight * priorMean;
    capacities[m] = Math.max(0, blended);
  });
  return capacities;
}

function solveRidgeWithShrinkage(observations, muscles, ridge) {
  const solved = ridgeSolve(observations, muscles, ridge);
  return applyMeanPriorShrinkage(muscles, solved, observations, ridge);
}

// Groups observations by (brand, model) -- only observations buildObservations
// already tagged as machine-equipment carry `.machine`/`.model`, so this is
// naturally empty for accounts with no machine data.
function groupByEquipment(observations) {
  const groups = {};
  for (const o of observations) {
    if (!o.machine) continue;
    const key = `${o.machine}::${o.model || ''}`;
    (groups[key] = groups[key] || []).push(o);
  }
  return groups;
}

// Solves one machine's load factor from its own logged observations, given
// currently-fixed muscle capacities: least squares through the origin for
// the scalar factor minimizing Σ(predicted_j - factor × rawE1RM_j)^2, i.e.
// factor = Σ(predicted×raw) / Σ(raw²). >1 means the machine reads lighter
// than a capacity-consistent true output (scale its logged numbers up to
// compare fairly); <1 means it reads heavier. Same "multiply raw by a
// ratio to get reference-equivalent terms" convention as
// brandCalibration.js's calibratedE1RM, for consistency within the
// codebase. Then applies the virtual-sample-size prior (see
// EQUIPMENT_FACTOR_PRIOR_WEIGHT) to fade the raw fit toward 1.0 for
// machines with only a little data.
function fitEquipmentFactor(groupObservations, muscles, capacities) {
  let num = 0;
  let den = 0;
  for (const o of groupObservations) {
    const predicted = muscles.reduce((s, m) => s + ((o.weights[m] || 0) / 100) * (capacities[m] || 0), 0);
    num += predicted * o.e1rm;
    den += o.e1rm * o.e1rm;
  }
  const rawFactor = den > 1e-9 ? num / den : 1;
  const n = groupObservations.length;
  return (n * rawFactor + EQUIPMENT_FACTOR_PRIOR_WEIGHT * 1.0) / (n + EQUIPMENT_FACTOR_PRIOR_WEIGHT);
}

// Joint muscle-capacity + equipment-load-factor solve via alternating least
// squares: hold factors fixed and re-solve capacities from factor-corrected
// observations, then hold capacities fixed and re-solve each eligible
// machine's factor, repeat until factors stop moving (or ALS_MAX_ITERATIONS
// is hit). Skips the ALS loop entirely -- one plain ridge solve, same as
// before this feature existed -- whenever no machine has reached
// EQUIPMENT_MIN_OBSERVATIONS, which is both the correct "nothing to
// calibrate" behavior for accounts with no machine data and a deliberate
// cap on the extra compute this feature would otherwise add for every
// request regardless of whether there's any equipment data to use it on.
function runALS(observations, muscles, ridge) {
  const groups = groupByEquipment(observations);
  const eligibleKeys = Object.keys(groups).filter(k => groups[k].length >= EQUIPMENT_MIN_OBSERVATIONS);

  if (!eligibleKeys.length) {
    return { capacities: solveRidgeWithShrinkage(observations, muscles, ridge), equipmentFactors: {} };
  }

  let factors = {};
  eligibleKeys.forEach(k => { factors[k] = 1.0; });
  let capacities = solveRidgeWithShrinkage(observations, muscles, ridge);

  for (let iter = 0; iter < ALS_MAX_ITERATIONS; iter++) {
    const nextFactors = {};
    for (const key of eligibleKeys) nextFactors[key] = fitEquipmentFactor(groups[key], muscles, capacities);
    const maxDelta = Math.max(...eligibleKeys.map(k => Math.abs(nextFactors[k] - factors[k])));
    factors = nextFactors;

    const corrected = observations.map(o => {
      if (!o.machine) return o;
      const factor = factors[`${o.machine}::${o.model || ''}`];
      return factor ? { ...o, e1rm: o.e1rm * factor } : o;
    });
    capacities = solveRidgeWithShrinkage(corrected, muscles, ridge);

    if (maxDelta < ALS_CONVERGENCE_EPS) break;
  }

  return { capacities, equipmentFactors: factors };
}

// Returns { capacities: {muscle: kg}, muscles: [...], ridge, equipmentFactors }
// or null with fewer than MIN_OBSERVATIONS distinct exercises -- not enough
// signal to trust a regression over just not guessing at all. `ridge` and
// `equipmentFactors` are additive/informational: existing callers that only
// destructure `capacities`/`muscles` (predictExerciseE1RM does exactly
// this) are unaffected.
function solveMuscleCapacities(observations) {
  if (!observations || observations.length < MIN_OBSERVATIONS) return null;
  const muscles = [...new Set(observations.flatMap(o => Object.keys(o.weights)))].sort();
  // λ is chosen once from the raw (pre-equipment-correction) observations
  // and held fixed through ALS, rather than re-run per ALS iteration --
  // ALS's corrections are small per-machine rescalings of a subset of
  // observations, not a different regression problem, so re-running the
  // full CV search (already itself observations × candidates solves) on
  // every one of ALS_MAX_ITERATIONS passes would multiply this feature's
  // compute cost for no meaningful accuracy gain.
  const ridge = chooseRidge(observations, muscles);
  const { capacities, equipmentFactors } = runALS(observations, muscles, ridge);
  return { capacities, muscles, ridge, equipmentFactors };
}

// Predicts a target e1RM for a (possibly never-logged) pattern+angle from
// already-solved per-muscle capacities. `confidence` is 'full' only when
// every muscle contributing >=25% (SECONDARY_THRESHOLD) at this angle has
// real supporting data from the regression -- otherwise 'partial' (some
// muscles defaulted to 0, understating the true number) so callers can
// visibly flag a rough estimate instead of presenting false precision.
function predictExerciseE1RM(pattern, angle, capacityResult) {
  const weights = emgForAngle(pattern, angle);
  if (!weights || !capacityResult) return null;
  const { capacities, muscles: knownMuscles } = capacityResult;
  let e1rmTotal = 0;
  let missingSignificant = false;
  const breakdown = [];
  for (const [muscle, pct] of Object.entries(weights)) {
    const hasData = knownMuscles.includes(muscle);
    const capacity = hasData ? capacities[muscle] : null;
    const contribution = (pct / 100) * (capacity || 0);
    if (!hasData && pct >= 25) missingSignificant = true;
    e1rmTotal += contribution;
    breakdown.push({
      muscle, pct,
      capacity: capacity != null ? Math.round(capacity * 10) / 10 : null,
      contribution: Math.round(contribution * 10) / 10,
      hasData,
    });
  }
  breakdown.sort((a, b) => b.contribution - a.contribution);
  if (e1rmTotal <= 0) return null;
  return { e1rm: Math.round(e1rmTotal * 10) / 10, confidence: missingSignificant ? 'partial' : 'full', breakdown };
}

// Inverts functions/strengthStandards.js's e1rm() formula to convert a
// target e1RM into a suggested weight at a given rep count -- decay depends
// only on reps, not kg, so this is a direct algebraic inversion, not an
// approximation.
function suggestedWeightForReps(e1rmVal, reps) {
  if (!e1rmVal || !reps) return null;
  const decay = 0.12 * Math.exp(-0.35 * (reps - 1)) + 0.88 * Math.exp(-0.03 * (reps - 1));
  return Math.round(e1rmVal * (0.30 + 0.70 * decay) * 10) / 10;
}

module.exports = {
  buildObservations, solveMuscleCapacities, predictExerciseE1RM, suggestedWeightForReps,
  MIN_OBSERVATIONS, MIN_OBSERVATIONS_FOR_LOOCV, RIDGE_CANDIDATES, DEFAULT_RIDGE,
  EQUIPMENT_MIN_OBSERVATIONS, EQUIPMENT_FACTOR_PRIOR_WEIGHT, ALS_MAX_ITERATIONS, ALS_CONVERGENCE_EPS,
};
