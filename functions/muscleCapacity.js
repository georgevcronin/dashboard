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
// produces wildly unstable, overfit capacity values.

const { EXERCISE_ANGLES } = require('./exerciseAngles');
const { emgForAngle } = require('./emgActivation');
const { estimate1RM } = require('./strengthStandards');

const RIDGE = 4.0;
const MIN_OBSERVATIONS = 3;

function liftTime(l) { return new Date(l.start || l.date).getTime(); }

// One observation per exercise the athlete has an angle for AND has
// actually logged, using their single best (highest) reliable e1RM for it —
// simplest reasonable choice; not fatigue-corrected or recency-weighted
// like computeMuscleLevels, since this only needs a stable target value per
// exercise, not a live-fatigue-aware one.
function buildObservations(lifts) {
  const byExercise = {};
  for (const l of (lifts || [])) {
    const name = (l.exercise || '').toLowerCase().trim();
    const angleInfo = EXERCISE_ANGLES[name];
    if (!angleInfo) continue;
    const est = estimate1RM(l.kg, l.reps);
    if (est == null) continue;
    if (!byExercise[name] || est > byExercise[name].e1rm) {
      byExercise[name] = { name, pattern: angleInfo.pattern, angle: angleInfo.angle, e1rm: est };
    }
  }
  return Object.values(byExercise).map(o => ({ ...o, weights: emgForAngle(o.pattern, o.angle) })).filter(o => o.weights);
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

// Returns { capacities: {muscle: kg}, muscles: [...] } or null with fewer
// than MIN_OBSERVATIONS distinct exercises -- not enough signal to trust a
// regression over just not guessing at all.
function solveMuscleCapacities(observations) {
  if (observations.length < MIN_OBSERVATIONS) return null;
  const muscles = [...new Set(observations.flatMap(o => Object.keys(o.weights)))].sort();
  const X = observations.map(o => muscles.map(m => (o.weights[m] || 0) / 100));
  const y = observations.map(o => o.e1rm);

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  for (let i = 0; i < muscles.length; i++) XtX[i][i] += RIDGE;
  const Xty = matMul(Xt, y.map(v => [v])).map(row => row[0]);

  const solved = solveLinearSystem(XtX, Xty);
  const capacities = {};
  muscles.forEach((m, i) => { capacities[m] = Math.max(0, solved[i]); });
  return { capacities, muscles };
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
  MIN_OBSERVATIONS, RIDGE,
};
