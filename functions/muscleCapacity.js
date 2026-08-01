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
// produces wildly unstable, overfit capacity values (confirmed empirically:
// 3 closely-spaced logged angles + a little noise pushed an unregularized
// solve to a "chest capacity" of 1000+kg against a true value of ~90kg).
//
// Regularized toward the MEAN implied capacity across muscles, not toward
// zero. Plain ridge (penalize ||capacity||^2) shrinks every capacity toward
// 0 -- since every real capacity is positive, that shrinkage is a
// one-directional bias, and it's a large one: at RIDGE=4 with angles spread
// across the full range, predicted e1RM came in ~35% low on average versus
// synthetic ground truth (confirmed by generating exact e1RM values from a
// known capacity set and checking the regression's recovery). Regularizing
// toward the shared average implied capacity instead removes almost all of
// that bias (~6% average error at the same RIDGE, vs ~35%) while keeping
// the exact same protection against the close-angle/noisy blowup case above
// -- verified across both the well-spread and adversarial-collinear angle
// scenarios before landing this. The "mean" prior is a crude one (average
// observed e1RM divided by the average total EMG weight-mass per
// observation, replicated across every muscle) -- it doesn't know anything
// about any specific muscle, it just stops assuming the answer is 0 for a
// quantity that's never actually 0.
//
// The ridge STRENGTH itself (how hard to shrink toward that prior) is
// chosen per request via leave-one-out cross-validation over
// RIDGE_CANDIDATES, not a fixed constant -- see chooseRidge below for why
// a single fixed value forces an unnecessary compromise between accounts
// with rich vs. sparse angle coverage.
//
// Caveat this doesn't fix: the model's own form -- summing several muscles'
// %MVIC-weighted "capacity" to predict one compound exercise's 1RM -- has
// no direct precedent in published research (checked). Normalizing EMG to
// %MVIC for cross-muscle comparison is standard practice, but the
// EMG-to-force relationship is muscle-specific (roughly linear for some
// muscles, more curvilinear for others), so this linear additive model is a
// reasonable engineering heuristic, not a validated biomechanical law. This
// file's regularization can be (and was) checked against synthetic
// ground-truth data; the model FORM can't be validated the same way without
// real measured strength data to compare against, which isn't available
// here.

const { EXERCISE_ANGLES } = require('./exerciseAngles');
const { emgForAngle } = require('./emgActivation');
const { estimate1RM } = require('./strengthStandards');
const { findExercise } = require('./muscleTaxonomy');
const { MUSCLE_EXERCISE_MAP } = require('./muscleStandards');
const { EXERCISE_DB } = require('./exerciseDb');

// The EMG tables (functions/emgActivation.js) only vary by joint angle --
// they have no idea a Smith machine, a selectorized machine, or a set of
// dumbbells impose genuinely different achievable load for the same
// underlying muscular effort (fixed bar path / no balance demand lets you
// move more weight; independent dumbbells and free-weight balance demand
// let you move less). Without correcting for that, capacities fit purely
// from e.g. machine-press history would OVERSTATE what's achievable on a
// barbell -- confirmed against a real account: three machine-only press
// observations predicted a barbell overhead press at LESS than the
// athlete's own easiest machine PR, which is backwards (a barbell press
// should come in lower than an assisted machine one, not lower than an
// already-suspicious flat-prior guess built entirely from machine data).
//
// Values are relative to barbell = 1.0 (the reference every other factor is
// expressed against): smith and dumbbell are grounded in published ranges
// (Smith machine bench allows ~10-20% more load than free barbell --
// stabilization demand is the cited mechanism; dumbbell press totals
// ~75-85% of equivalent barbell load, same mechanism in the other
// direction). machine and cable have no equivalent published figure found
// -- extrapolated from the same "how much does this equipment ask you to
// stabilize" logic (a fully selectorized machine removes even more balance
// demand than a Smith's fixed path; cable provides constant tension but
// still needs some stabilization, placed between barbell and machine) and
// should be treated as a rougher estimate than the smith/dumbbell values.
const EQUIPMENT_LOAD_FACTOR = {
  barbell: 1.0,
  smith: 1.15,
  machine: 1.20,
  cable: 1.05,
  dumbbell: 0.80,
  bodyweight: 1.0,
};
function loadFactorForExercise(name, personalFactors) {
  const equipment = findExercise(name)?.equipment;
  if (!equipment) return 1.0;
  return personalFactors?.[equipment] ?? EQUIPMENT_LOAD_FACTOR[equipment] ?? 1.0;
}

// How many real paired barbell-vs-X comparisons it takes for the athlete's
// own empirical ratio to weigh as much as the population default -- a
// smaller number trusts personal data faster, a larger one stays closer to
// the sourced default longer. 2 was chosen so a single paired movement
// already meaningfully shifts the estimate (not swamped 10-to-1 by the
// default) while still requiring at least a couple of real comparisons
// before personal data dominates outright -- same shrinkage-toward-a-prior
// principle as this file's ridge regularization, just applied to a
// different quantity.
const EQUIPMENT_FACTOR_SHRINKAGE_K = 2;

// Learns a per-athlete override of EQUIPMENT_LOAD_FACTOR from their own
// logged history, instead of trusting the population-sourced default
// forever. Uses functions/exerciseDb.js's `movementId` field (the existing
// "these are variants of the same underlying movement" grouping, e.g.
// Barbell Bench Press and Dumbbell Bench Press (Flat) both share
// movementId "bench-press") to find pairs where the athlete has logged the
// SAME movement on two different equipment types -- their own best e1RM on
// each side of that pair is a real, direct measurement of how much more or
// less they personally move on one vs. the other, no modeling assumptions
// needed.
//
// Compares every pair within a movement group, not just "vs. barbell"
// specifically -- some movements have no barbell variant at all (e.g.
// rear-delt-fly only has dumbbell/cable/machine; there's no such thing as
// a barbell rear-delt fly), which would give a naive barbell-only
// comparison nothing to work with even when the athlete has real
// dumbbell-vs-cable data sitting right there. When neither side of a pair
// IS barbell, the population default bridges the gap: a personal
// dumbbell-vs-cable ratio, combined with cable's own default-vs-barbell
// factor, still implies a real (if slightly less direct) dumbbell-vs-
// barbell estimate. Every pair found (across every movement, every
// combination within each) contributes one ratio; averaged, then shrunk
// toward the population default via EQUIPMENT_FACTOR_SHRINKAGE_K so a
// single lucky/unlucky comparison can't swing the estimate wildly -- more
// real paired data moves the estimate further from the default and closer
// to what this specific athlete actually does. Movements only ever logged
// on ONE equipment type contribute nothing (there's no comparison to
// make); equipment the athlete has never logged alongside anything else
// keeps the untouched population default entirely.
function personalizedEquipmentFactors(lifts) {
  if (!lifts?.length) return {};
  // movementId -> equipment -> best raw e1RM logged under that pairing.
  const bestByMovementEquip = {};
  for (const l of lifts) {
    const entry = findExercise(l.exercise);
    if (!entry?.movementId || !entry.equipment) continue;
    const est = estimate1RM(l.kg, l.reps);
    if (est == null) continue;
    const byEquip = (bestByMovementEquip[entry.movementId] ??= {});
    if (!byEquip[entry.equipment] || est > byEquip[entry.equipment]) byEquip[entry.equipment] = est;
  }

  const ratiosByEquipment = {};
  for (const byEquip of Object.values(bestByMovementEquip)) {
    const equipments = Object.keys(byEquip);
    for (const target of equipments) {
      for (const reference of equipments) {
        if (target === reference) continue;
        // How much MORE/LESS this athlete moves on `target` vs `reference`,
        // converted to a barbell-relative estimate via `reference`'s own
        // default-vs-barbell factor -- when reference IS barbell, that
        // factor is exactly 1.0 and this is a direct comparison; otherwise
        // it's a one-hop bridge through the population default.
        const referenceDefault = EQUIPMENT_LOAD_FACTOR[reference] ?? 1.0;
        const impliedRatio = (byEquip[target] / byEquip[reference]) * referenceDefault;
        (ratiosByEquipment[target] ??= []).push(impliedRatio);
      }
    }
  }

  const factors = {};
  for (const [equipment, ratios] of Object.entries(ratiosByEquipment)) {
    const empiricalMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const defaultFactor = EQUIPMENT_LOAD_FACTOR[equipment] ?? 1.0;
    const n = ratios.length;
    factors[equipment] = (n * empiricalMean + EQUIPMENT_FACTOR_SHRINKAGE_K * defaultFactor) / (n + EQUIPMENT_FACTOR_SHRINKAGE_K);
  }
  // Barbell stays the fixed 1.0 reference always -- if it participated in
  // any comparison above (as a target, via reciprocal pairs), that value
  // would be noisy sample-dependent drift around 1.0, not a real signal
  // worth keeping (every OTHER factor is already expressed relative to
  // barbell; letting barbell itself float undermines that anchor).
  if ('barbell' in factors) factors.barbell = 1.0;
  return factors;
}

// A single fixed RIDGE value forces one compromise on every account: strong
// enough to survive someone who's only ever logged 3 similar angles (see
// header), but that same strength is far more regularization than someone
// with 8+ distinct logged angles actually needs -- confirmed empirically,
// a fixed RIDGE=4 cost ~4-5x more prediction error than necessary on
// well-covered synthetic accounts, with zero benefit on the sparse ones
// (leave-one-out cross-validation, below, picked ridge=4-8 for those
// automatically anyway). RIDGE_CANDIDATES is the grid solveMuscleCapacities
// actually searches over per request instead of using one fixed constant.
const RIDGE_CANDIDATES = [0.1, 0.25, 0.5, 1, 2, 4, 8];
// MIN_OBSERVATIONS: the absolute floor to attempt anything at all -- below
// this there is genuinely nothing to compute (0 observations has no
// average to regularize toward). Above this floor, the ridge/prior math
// already degrades gracefully with very little data (a single observation
// just leans almost entirely on the prior, see chooseRidge) -- there's no
// reason to withhold a rough, honestly-labeled ballpark just because it's
// not confident, when the alternative is showing nothing at all.
// FULL_CONFIDENCE_OBSERVATIONS is the separate, higher bar
// predictExerciseE1RM uses to decide whether a prediction is trustworthy
// enough to present without a "rough estimate" caveat -- see its
// `confidence` field.
const MIN_OBSERVATIONS = 1;
const FULL_CONFIDENCE_OBSERVATIONS = 3;

function liftTime(l) { return new Date(l.start || l.date).getTime(); }

// One observation per (exercise, angle) the athlete has actually logged,
// using their single best (highest) reliable e1RM for that combination —
// simplest reasonable choice; not fatigue-corrected or recency-weighted
// like computeMuscleLevels, since this only needs a stable target value per
// exercise, not a live-fatigue-aware one.
//
// Two sources of angle/pattern, checked in order: (1) an explicit `angle`+
// `pattern` on the lift itself -- set for anything built via
// PressRowBuilder (src/app.jsx), whose exercise name is now a shared
// family identity (e.g. "Cable Fly") spanning every angle you've ever
// built it at, so the angle can no longer be inferred from the name alone;
// (2) EXERCISE_ANGLES, the athlete's own hand-mapped angle for a
// pre-existing named exercise (e.g. "seated shoulder press (machine)")
// that was never built through the angle picker and has no per-lift angle
// field. Keying observations by `${name}|${angle}` rather than by name
// alone is what keeps this correct for a shared family name: for every
// non-family exercise, angle is constant per name (from the static map),
// so the key degenerates back to exactly one observation per name, same as
// before. For a family name, distinct angles you've actually trained stay
// distinct observations -- without this, every angle you ever logged under
// a shared name would collapse into one, and the regression below would
// lose the very cross-angle signal it depends on to solve anything.
function buildObservations(lifts) {
  // Personalized per-athlete equipment factors (see
  // personalizedEquipmentFactors), derived from the FULL logged history
  // (not just the press/row/fly observations below) -- someone's real
  // barbell-vs-dumbbell bench press ratio is just as informative for
  // normalizing their press-family training data as it would be for
  // anything else, even though bench press itself never becomes one of
  // this function's own observations (excluded from EXERCISE_ANGLES, see
  // that file's header).
  const personalFactors = personalizedEquipmentFactors(lifts);
  const byKey = {};
  for (const l of (lifts || [])) {
    const name = (l.exercise || '').toLowerCase().trim();
    let pattern, angle;
    if (l.angle != null && l.pattern) {
      pattern = l.pattern; angle = l.angle;
    } else {
      const angleInfo = EXERCISE_ANGLES[name];
      if (!angleInfo) continue;
      pattern = angleInfo.pattern; angle = angleInfo.angle;
    }
    const est = estimate1RM(l.kg, l.reps);
    if (est == null) continue;
    const key = `${name}|${angle}`;
    if (!byKey[key] || est > byKey[key].e1rm) {
      byKey[key] = { name, pattern, angle, e1rm: est };
    }
  }
  return Object.values(byKey)
    .map(o => ({ ...o, weights: emgForAngle(o.pattern, o.angle), loadFactor: loadFactorForExercise(o.name, personalFactors) }))
    .filter(o => o.weights)
    // normalizedE1rm: this observation's e1RM re-expressed on a common
    // "barbell-equivalent effort" scale (divide out its own equipment's
    // load factor) -- this is what the regression actually fits against,
    // so a capacity means "how much barbell-equivalent load this muscle
    // can produce," not "how much THIS SPECIFIC machine let you move." raw
    // e1rm is kept alongside, unchanged, for anything that wants the real
    // logged number rather than the normalized one.
    .map(o => ({ ...o, normalizedE1rm: o.e1rm / o.loadFactor }));
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

// The flat prior (every muscle regularized toward the SAME shared value)
// is honest but naive -- it assumes front-delt and chest and triceps all
// have equal capacity, which isn't true for anyone. Where the athlete has
// real logged history for a muscle's own canonical reference exercise
// (MUSCLE_EXERCISE_MAP, functions/muscleStandards.js -- the same curated
// map the profile's per-muscle strength-level display already uses), that
// real relative strength is a much better-informed guess than "assume
// everyone's equal." Deliberately NOT importing MUSCLE_EXERCISE_MAP's
// absolute numbers directly -- a Leg Extension e1RM and a press-family
// "capacity" aren't the same unit (different lift, different resistance
// curve), so plugging a raw number in would trade one bias for a worse
// one. Instead this only borrows the RATIO between muscles (e.g. "this
// athlete's chest reference lift is 1.4x their front-delt reference
// lift"), then rescales that ratio to match the flat prior's own already-
// calibrated overall size -- real personalized SHAPE, same trusted overall
// SCALE. Muscles MUSCLE_EXERCISE_MAP doesn't cover at all (serratus,
// lower-traps, mid-traps, rhomboids, teres-major -- no curated single
// reference exercise exists for these) get ratio 1, i.e. no personalization,
// same as before this existed -- an honest "no data" rather than a guess.
function personalizedPriorRatios(lifts, muscles) {
  const ratios = {};
  muscles.forEach(m => { ratios[m] = 1; });
  if (!lifts?.length) return ratios;
  const personalBest = {};
  for (const m of muscles) {
    const refExercise = MUSCLE_EXERCISE_MAP[m];
    if (!refExercise) continue;
    const refLower = refExercise.toLowerCase();
    let best = null;
    for (const l of lifts) {
      if ((l.exercise || '').toLowerCase() !== refLower) continue;
      const est = estimate1RM(l.kg, l.reps);
      if (est != null && (best == null || est > best)) best = est;
    }
    if (best != null) personalBest[m] = best;
  }
  const covered = Object.keys(personalBest);
  if (covered.length < 2) return ratios; // one data point has no "relative" to express
  const mean = covered.reduce((s, m) => s + personalBest[m], 0) / covered.length;
  covered.forEach(m => { ratios[m] = personalBest[m] / mean; });
  return ratios;
}

// Solves the ridge system for one specific ridge value -- the shared core
// both solveMuscleCapacities (final fit) and chooseRidge (leave-one-out
// search below) call, so there's exactly one implementation of the actual
// math to keep correct. `lifts` (optional, the athlete's FULL logged
// history, not just the press/row/fly observations) enables the
// personalized prior above -- omitted entirely, this falls back to the
// original flat-prior behavior, so existing callers/tests that don't pass
// it are unaffected.
function solveWithRidge(observations, ridge, lifts) {
  const muscles = [...new Set(observations.flatMap(o => Object.keys(o.weights)))].sort();
  const X = observations.map(o => muscles.map(m => (o.weights[m] || 0) / 100));
  // Fit against normalizedE1rm (barbell-equivalent), not the raw logged
  // e1rm -- see buildObservations' comment. Falls back to o.e1rm for any
  // observation built by hand (e.g. in a test) without going through
  // buildObservations, so callers that don't care about the equipment
  // adjustment aren't forced to supply it.
  const y = observations.map(o => o.normalizedE1rm ?? o.e1rm);

  // Shared prior every muscle's capacity is regularized toward, instead of
  // 0 -- see the header comment for why. Crude on purpose: just "the
  // average e1RM divided by the average total EMG weight-mass per
  // observation," not a per-muscle estimate. avgWeightMass is never 0 here
  // (buildObservations already filters to observations with real weights).
  const avgWeightMass = X.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0) / X.length;
  const avgE1RM = y.reduce((a, b) => a + b, 0) / y.length;
  const priorCapacity = avgE1RM / avgWeightMass;
  const priorRatios = personalizedPriorRatios(lifts, muscles);

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  for (let i = 0; i < muscles.length; i++) XtX[i][i] += ridge;
  const Xty = matMul(Xt, y.map(v => [v])).map((row, i) => row[0] + ridge * priorCapacity * priorRatios[muscles[i]]);

  const solved = solveLinearSystem(XtX, Xty);
  const capacities = {};
  muscles.forEach((m, i) => { capacities[m] = Math.max(0, solved[i]); });
  // distinctDirections, not observations.length, is what actually bounds
  // how much this fit can be trusted: 3 observations at the SAME angle only
  // ever contribute 1 independent equation (their EMG-weight rows are
  // identical, differing only in which e1RM they report) -- confirmed
  // against a real account where exactly this happened, and a raw
  // observation count would have wrongly called it "full confidence." Each
  // genuinely distinct (pattern, angle) pair is one real independent
  // direction; repeating the same one adds data volume, not information.
  const distinctDirections = new Set(observations.map(o => `${o.pattern}|${o.angle}`)).size;
  // Carried on the result so predictExerciseE1RM can scale a later
  // prediction by this athlete's own learned equipment factors (falling
  // back to the population EQUIPMENT_LOAD_FACTOR for anything not
  // personalized) without needing `lifts` passed to it directly.
  const equipmentFactors = personalizedEquipmentFactors(lifts);
  return { capacities, muscles, sampleSize: observations.length, distinctDirections, equipmentFactors };
}

// Leave-one-out cross-validation over RIDGE_CANDIDATES: for each candidate,
// refit on every (n-1)-observation subset and sum the squared error
// predicting whichever observation was held out, then keep whichever
// candidate generalized best. Adapts the regularization strength to how
// much real signal THIS athlete's own logged angles actually contain,
// instead of one fixed constant compromising between someone with 3
// similar angles logged (needs strong regularization) and someone with 8+
// well-spread ones (needs almost none) -- confirmed empirically to cut
// prediction error several-fold on well-covered accounts with no downside
// on sparse ones (see RIDGE_CANDIDATES' comment). Cost is negligible: at
// most a handful of candidates times observations.length refits, each on a
// <=15x15 system.
function chooseRidge(observations, lifts) {
  // Leave-one-out needs at least 2 observations to leave one out AND still
  // have something to train on. With exactly 1, there's no cross-validation
  // question to answer -- fall back to the strongest (most conservative)
  // candidate, since a single observation should lean almost entirely on
  // the prior rather than pretend to have found a real fit.
  if (observations.length < 2) return RIDGE_CANDIDATES[RIDGE_CANDIDATES.length - 1];
  let best = RIDGE_CANDIDATES[0];
  let bestSSE = Infinity;
  for (const ridge of RIDGE_CANDIDATES) {
    let sse = 0;
    for (let i = 0; i < observations.length; i++) {
      const train = observations.filter((_, j) => j !== i);
      const { capacities } = solveWithRidge(train, ridge, lifts);
      const held = observations[i];
      let pred = 0;
      for (const [m, pct] of Object.entries(held.weights)) pred += (pct / 100) * (capacities[m] || 0);
      sse += (pred - (held.normalizedE1rm ?? held.e1rm)) ** 2;
    }
    if (sse < bestSSE) { bestSSE = sse; best = ridge; }
  }
  return best;
}

// Returns { capacities: {muscle: kg}, muscles: [...], sampleSize } or null
// with zero real observations at all -- literally nothing to compute from.
// Below FULL_CONFIDENCE_OBSERVATIONS this still returns a real result, just
// one predictExerciseE1RM will mark 'rough' -- a ballpark grounded in
// actual data beats no answer at all, as long as it's honestly labeled as
// rough rather than presented with false confidence. `lifts` (optional):
// the athlete's full logged history, passed through to enable the
// personalized prior in solveWithRidge -- pass the same `lifts` used to
// build `observations` via buildObservations(lifts).
function solveMuscleCapacities(observations, lifts) {
  if (observations.length < MIN_OBSERVATIONS) return null;
  return solveWithRidge(observations, chooseRidge(observations, lifts), lifts);
}

// Predicts a target e1RM for a (possibly never-logged) pattern+angle from
// already-solved per-muscle capacities. `confidence` is a 3-way signal
// checked in order:
// - 'rough': capacityResult.distinctDirections < FULL_CONFIDENCE_OBSERVATIONS
//   -- the fit itself is under-informed, independent of which specific
//   muscles it covers. Deliberately keyed on distinct (pattern, angle)
//   directions, NOT raw observation count -- 3 observations at the exact
//   same angle are only 1 real independent equation (see solveWithRidge's
//   comment), and would wrongly read as "enough data" under a raw count.
//   This is what lets a real ballpark be shown honestly-labeled instead of
//   nothing at all below the old hard MIN_OBSERVATIONS gate.
// - 'partial': enough distinct directions overall, but some muscle
//   contributing >=25% (SECONDARY_THRESHOLD) at THIS angle has no real
//   supporting data from the regression (defaulted to 0, understating the
//   true number).
// - 'full': neither of the above -- enough genuinely distinct data, and
//   this specific prediction's muscles are all covered.
// `equipment` (optional -- defaults to no adjustment, i.e. barbell-
// equivalent) scales the barbell-equivalent capacities back out to
// whatever equipment the TARGET angle/exercise will actually be performed
// on -- capacities themselves are fit on a common barbell-equivalent scale
// (see buildObservations), so predicting e.g. a Smith machine press from
// barbell-only history needs to scale back UP, and predicting a barbell
// press from machine-only history needs to scale back DOWN. `capacity` in
// the breakdown stays in barbell-equivalent terms either way (a muscle's
// underlying capacity doesn't change with equipment); `contribution` and
// the total are what get scaled, so breakdown still sums to e1rm.
function predictExerciseE1RM(pattern, angle, capacityResult, equipment) {
  const weights = emgForAngle(pattern, angle);
  if (!weights || !capacityResult) return null;
  const { capacities, muscles: knownMuscles } = capacityResult;
  // Prefer this athlete's own learned factor (capacityResult.equipmentFactors,
  // from personalizedEquipmentFactors) over the population default -- falls
  // through to the default for any equipment they haven't paired against a
  // barbell variant of the same movement yet.
  const loadFactor = capacityResult.equipmentFactors?.[equipment] ?? EQUIPMENT_LOAD_FACTOR[equipment] ?? 1.0;
  let e1rmTotal = 0;
  let missingSignificant = false;
  const breakdown = [];
  for (const [muscle, pct] of Object.entries(weights)) {
    const hasData = knownMuscles.includes(muscle);
    const capacity = hasData ? capacities[muscle] : null;
    const contribution = (pct / 100) * (capacity || 0) * loadFactor;
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
  const confidence = (capacityResult.distinctDirections ?? capacityResult.sampleSize) < FULL_CONFIDENCE_OBSERVATIONS ? 'rough' : missingSignificant ? 'partial' : 'full';
  return { e1rm: Math.round(e1rmTotal * 10) / 10, confidence, breakdown };
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
  MIN_OBSERVATIONS, FULL_CONFIDENCE_OBSERVATIONS, RIDGE_CANDIDATES, chooseRidge,
  EQUIPMENT_LOAD_FACTOR, loadFactorForExercise, solveWithRidge, personalizedPriorRatios,
  personalizedEquipmentFactors, EQUIPMENT_FACTOR_SHRINKAGE_K,
};
