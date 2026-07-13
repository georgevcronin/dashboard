const { MUSCLE_EXERCISE_MAP, MUSCLE_EXERCISE_ALIASES, thresholdsForMuscle } = require('./muscleStandards');
const { findExercise, musclesForExercise } = require('./muscleTaxonomy');
const { EXERCISE_NAME_ALIASES } = require('./exerciseNameAliases');

// Strength math shared across the app: e1RM estimation, and the "5 classic
// lifts" (squat/bench/deadlift/OHP/row) classification used by the /trends
// chart and the weekly-review PR banner. The actual per-muscle strength-level
// RANKING display has moved to computeMuscleLevels/muscleStandards.js (28
// muscles, real strengthlevel.com per-bodyweight data) — this file's flat
// bodyweight-ratio STANDARDS table below is legacy in the sense that nothing
// user-facing shows it directly anymore, but /trends and the PR banner still
// need classifyLift's "which of the 5 classic lifts is this" classification,
// so it stays.
//
// There's no public API for strengthlevel.com's live data, so STANDARDS uses
// static bodyweight-ratio tables built from widely-published strength-
// standards methodology (the same shape Lon Kilgore's tables and similar
// sites use) — approximate reference points, not a scrape of any specific
// site's numbers.
//
// Scope is deliberately limited to five barbell-style compounds that have a
// legitimate public standard to compare against — and, within each, to the
// single canonical exercise the standard is actually calibrated on (see
// CLASSIFY_ALLOWLIST below). Every other variant — machine/cable, or a
// same-equipment variant with a genuinely different loading profile like a
// partial-ROM squat — is tracked elsewhere in the app but not classified here.

// [Beginner, Novice, Intermediate, Advanced, Elite] as a multiple of bodyweight.
const STANDARDS = {
  male: {
    squat:         [0.50, 0.75, 1.25, 1.75, 2.25],
    bench:         [0.50, 0.75, 1.00, 1.50, 2.00],
    deadlift:      [0.75, 1.00, 1.50, 2.00, 2.50],
    overheadPress: [0.35, 0.50, 0.70, 1.00, 1.30],
    row:           [0.50, 0.75, 1.00, 1.40, 1.80],
  },
  female: {
    squat:         [0.50, 0.65, 1.00, 1.50, 1.90],
    bench:         [0.25, 0.40, 0.60, 0.90, 1.20],
    deadlift:      [0.60, 0.80, 1.20, 1.60, 2.00],
    overheadPress: [0.20, 0.30, 0.45, 0.65, 0.85],
    row:           [0.30, 0.50, 0.75, 1.05, 1.40],
  },
};

const TIERS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

// Which exact EXERCISE_DB entries count toward each ranked category — an
// explicit allowlist rather than keyword matching. A keyword match on
// "squat" (excluding a hand-maintained list of known-not-comparable
// variants like hack/leg-press/goblet) let genuinely different lifts slip
// through: e.g. exerciseDb.js has 16 different "squat"-named exercises
// (Box Squat, Pin Squat, Zercher Squat, Sumo Squat (Dumbbell), ...), each
// with a real, different loading profile — some meaningfully lighter, some
// heavier, none of them actually the back squat these published standards
// are calibrated against. Comparing any of them against back-squat
// standards silently produced a wrong tier/score. An allowlist of the
// single canonical lift per category (plus sumo deadlift, a genuinely
// comparable full pull, not a partial-ROM variant) has no such failure
// mode — anything not in the list simply isn't ranked, which matches this
// file's own stated principle better than guessing at "close enough."
const CLASSIFY_ALLOWLIST = {
  squat: ['Back Squat'],
  bench: ['Barbell Bench Press'],
  deadlift: ['Conventional Deadlift', 'Sumo Deadlift'],
  overheadPress: ['Barbell Overhead Press'],
  row: ['Barbell Row (Overhand / Pendlay)', 'Barbell Row (Underhand / Yates)'],
};
// Real logged history (Hevy imports/backfill) never uses EXERCISE_DB's own
// canonical names — it's Hevy's own "<name> (<equipment>)" convention, all
// lowercase. Without this, classifyLift silently matched none of a real
// account's 8000+ lifts despite obvious squat/bench/deadlift/press/row
// entries being present (caught by checking live data directly). Same
// exact-string-allowlist discipline as CLASSIFY_ALLOWLIST above, not a
// keyword match — e.g. 'squat (machine)'/'hack squat (machine)'/'split
// squat' deliberately have no entry here, for the same reason the machine/
// partial-ROM variants aren't in CLASSIFY_ALLOWLIST itself.
const CLASSIFY_ALIASES = {
  'squat (barbell)': 'squat',
  'bench press (barbell)': 'bench',
  'deadlift (barbell)': 'deadlift',
  'sumo deadlift (barbell)': 'deadlift',
  'overhead press (barbell)': 'overheadPress',
  'standing military press (barbell)': 'overheadPress', // "Military Press" is the standing barbell overhead press by another name
  'bent over row (barbell)': 'row',
  'pendlay row (barbell)': 'row', // Pendlay row is the overhand-grip bent-over row CLASSIFY_ALLOWLIST already lists by its full name
};
const CLASSIFY_BY_NAME = new Map();
for (const [cat, names] of Object.entries(CLASSIFY_ALLOWLIST)) {
  for (const name of names) CLASSIFY_BY_NAME.set(name.toLowerCase(), cat);
}
for (const [name, cat] of Object.entries(CLASSIFY_ALIASES)) {
  CLASSIFY_BY_NAME.set(name, cat);
}

function classifyLift(name) {
  return CLASSIFY_BY_NAME.get((name || '').toLowerCase()) || null;
}

// Two-exponential 1RM model (replaces the earlier Epley formula everywhere
// in the app — this was previously hand-duplicated in progression.js,
// analytics.js, fatigue.js, and src/app.jsx; now those all import e1rm from
// here). Returns kg == W at reps == 1 by construction (the bracketed term
// is 1 there), scaling down from there as reps increase.
function e1rm(kg, reps) {
  if (!kg || !reps) return null;
  const decay = 0.12 * Math.exp(-0.35 * (reps - 1)) + 0.88 * Math.exp(-0.03 * (reps - 1));
  return kg / (0.30 + 0.70 * decay);
}

// e1rm, restricted to the ~1-12 rep range where a 1RM estimate is reliable
// enough to use for an absolute strength-standards comparison. Session-to-
// session trend tracking (progression.js, fatigue.js's performance trend)
// uses the uncapped e1rm directly since it only needs relative movement
// between two same-formula numbers, not an absolute reliability cutoff.
function estimate1RM(kg, reps) {
  if (!kg || !reps || reps > 12) return null;
  return e1rm(kg, reps);
}

// Continuous 0-100 score across the five-tier ladder: 20 points per tier,
// linearly interpolated between adjacent thresholds. Below Beginner scales
// 0-20; above Elite is capped at 100. The second-to-last tier's interpolation
// already asymptotically approaches 100 as ratio approaches the Elite
// threshold, so Elite itself is simply 100 flat — an earlier version instead
// restarted the Elite band's own 0-20 sub-scale at a base of 80, which made
// the score *drop* by up to 20 points the moment a lifter crossed into Elite.
function scoreForRatio(ratio, thresholds) {
  let tierIdx = -1;
  for (let i = 0; i < thresholds.length; i++) if (ratio >= thresholds[i]) tierIdx = i;
  const tier = tierIdx === -1 ? 'Untrained' : TIERS[tierIdx];
  let score;
  if (tierIdx === -1) score = (ratio / thresholds[0]) * 20;
  else if (tierIdx === thresholds.length - 1) score = 100;
  else score = 20 * (tierIdx + 1) + 20 * ((ratio - thresholds[tierIdx]) / (thresholds[tierIdx + 1] - thresholds[tierIdx]));
  return { tier, score: Math.round(Math.max(0, Math.min(100, score))) };
}

// Finds the bodyweight that was actually in effect on a given date: the most
// recent logged weight on or before that date, falling back to the earliest
// entry after it if the PR predates any weigh-in. Ranking an all-time-best
// lift against today's bodyweight would misrepresent it if bodyweight has
// shifted meaningfully since — a PR set at 90kg bodyweight should be scored
// against 90kg, not whatever the scale reads today.
function bodyweightNear(weightHistory, dateStr) {
  const dates = Object.keys(weightHistory || {}).sort();
  if (!dates.length) return null;
  let onOrBefore = null;
  for (const d of dates) {
    if (d <= dateStr) onOrBefore = d;
    else if (!onOrBefore) return weightHistory[d];
    else break;
  }
  return onOrBefore ? weightHistory[onOrBefore] : null;
}

// Whether `name` targets `muscle` as a primary or secondary target, or not
// at all. Exact EXERCISE_DB entries distinguish primary/secondary directly;
// names only resolvable via muscleTaxonomy.js's KEYWORD_FALLBACK carry no
// such distinction, so they're treated as secondary (lower-confidence)
// rather than assumed primary.
function muscleRoleInExercise(name, muscle) {
  const canonicalName = EXERCISE_NAME_ALIASES[(name || '').toLowerCase()];
  const entry = findExercise(canonicalName || name);
  if (entry) {
    if ((entry.primary || []).includes(muscle)) return 'primary';
    if ((entry.secondary || []).includes(muscle)) return 'secondary';
    return null;
  }
  return musclesForExercise(name).includes(muscle) ? 'secondary' : null;
}

// Minimum distinct session-dates required in a contributing exercise before
// it's trusted enough to normalize against the canonical lift and enter the
// blend — matches the "not enough data yet, don't claim a pattern" precedent
// analytics.js's computeDataMaturity already uses elsewhere in this codebase,
// scaled down since this is a per-exercise-pair check, not a whole-account one.
const MIN_SESSIONS_FOR_AGGREGATION = 2;

// Per-muscle analogue of computeStrengthLevels, using muscleStandards.js's
// real per-bodyweight tables instead of a flat ratio (no allometric/age
// scaling needed — strengthlevel.com's own numbers are already bodyweight-
// specific). Each muscle's score is anchored on its canonical exercise
// (MUSCLE_EXERCISE_MAP), then blended with every other exercise that also
// trains it (via muscleRoleInExercise), each normalized into the canonical
// exercise's scale using this person's own historical average ratio between
// the two — never a fixed/invented cross-exercise conversion. A contributing
// exercise only enters the blend once MIN_SESSIONS_FOR_AGGREGATION is met in
// both it and the canonical lift; short of that, the muscle's score is just
// the canonical exercise alone (identical to having no aggregation at all).
// Invented heuristic, NOT sourced from published research — there is no
// validated conversion from this app's own structural-fatigue score (a
// training-load index, see fatigue.js) to an actual 1RM performance
// decrement. Chosen deliberately conservative and simple: a straight line
// from 0% correction at fatigue=0 to a 25% correction at fatigue=100. Exists
// specifically so that comparing two different exercises' sessions (e.g. a
// Preacher Curl done shortly after a hard Barbell Curl session) doesn't let
// residual fatigue in one exercise masquerade as genuine weakness in the
// other when computing their personal ratio. If this number ever needs
// tuning, there's no research to appeal to — it's a judgment call, made
// explicitly at the user's request despite the sourcing gap.
const MAX_FATIGUE_1RM_DECREMENT = 0.25;

// lifts: db.lifts. weightHistory/currentBodyweightKg/sex: see
// computeStrengthLevels. fatigueTimeline: optional, index-aligned with
// `lifts` (fatigueTimeline.js's fatigueTimeline() output) — each entry maps
// muscle -> fatigue (0-100) immediately before that lift. Omit it (or pass
// undefined) to skip fatigue correction entirely, e.g. in tests that don't
// need it — every e1RM is then treated as if fatigue were 0.
function computeMuscleLevels(lifts, weightHistory, currentBodyweightKg, sex, fatigueTimeline) {
  sex = (sex || '').toLowerCase();
  if ((!currentBodyweightKg && !Object.keys(weightHistory || {}).length) || (sex !== 'male' && sex !== 'female')) return null;

  const liftsByExercise = {};
  (lifts || []).forEach((l, i) => {
    const key = l.exercise || '';
    (liftsByExercise[key] = liftsByExercise[key] || []).push({ l, i });
  });

  // Capped estimate1RM, not raw e1rm — this whole function compares against
  // absolute strength-standard thresholds, same as computeStrengthLevels, so
  // it needs the same >12-rep reliability cutoff (uncapped e1rm is only for
  // session-to-session trend tracking elsewhere in the app). Fatigue
  // correction is muscle-specific (the same lift can carry different
  // fatigue levels for different muscles it touches), so this can't be
  // precomputed once per lift — it's computed fresh per (lift, muscle) pair.
  function correctedE1RM(l, liftIndex, muscle) {
    const raw = estimate1RM(l.kg, l.reps);
    if (raw == null) return null;
    const fatigueBefore = fatigueTimeline?.[liftIndex]?.[muscle] ?? 0;
    return raw / (1 - (fatigueBefore / 100) * MAX_FATIGUE_1RM_DECREMENT);
  }

  const muscles = {};
  for (const muscle of Object.keys(MUSCLE_EXERCISE_MAP)) {
    const exerciseName = MUSCLE_EXERCISE_MAP[muscle];
    const exerciseNameLower = exerciseName.toLowerCase();
    const canonicalEntries = Object.entries(liftsByExercise).filter(([name]) => {
      const n = name.toLowerCase();
      return n === exerciseNameLower || MUSCLE_EXERCISE_ALIASES[n] === exerciseName;
    }).flatMap(([, entries]) => entries
      .map(({ l, i }) => ({ e1RM: correctedE1RM(l, i, muscle), date: l.date }))
      .filter(e => e.e1RM != null));

    let best = null;
    for (const e of canonicalEntries) if (!best || e.e1RM > best.e1RM) best = e;
    if (!best) { muscles[muscle] = null; continue; }
    const bw = bodyweightNear(weightHistory, best.date) ?? currentBodyweightKg;
    if (!bw) { muscles[muscle] = null; continue; }
    const found = thresholdsForMuscle(muscle, sex, bw);
    if (!found || !found.thresholds) { muscles[muscle] = null; continue; }

    let weightedSum = best.e1RM * 1.0;
    let weightTotal = 1.0;
    const blendedFrom = [];
    if (canonicalEntries.length >= MIN_SESSIONS_FOR_AGGREGATION) {
      const avgCanonical = canonicalEntries.reduce((a, e) => a + e.e1RM, 0) / canonicalEntries.length;
      const primaryContribs = [];
      const secondaryContribs = [];
      for (const [name, rawEntries] of Object.entries(liftsByExercise)) {
        const nameLower = name.toLowerCase();
        if (nameLower === exerciseNameLower || MUSCLE_EXERCISE_ALIASES[nameLower] === exerciseName) continue;
        const role = muscleRoleInExercise(name, muscle);
        if (!role) continue;
        const entries = rawEntries
          .map(({ l, i }) => ({ e1RM: correctedE1RM(l, i, muscle), date: l.date }))
          .filter(e => e.e1RM != null);
        const dates = new Set(entries.map(e => e.date));
        if (dates.size < MIN_SESSIONS_FOR_AGGREGATION) continue;
        const avgContrib = entries.reduce((a, e) => a + e.e1RM, 0) / entries.length;
        if (!(avgContrib > 0)) continue;
        const ratio = avgCanonical / avgContrib;
        const bestContrib = Math.max(...entries.map(e => e.e1RM));
        (role === 'primary' ? primaryContribs : secondaryContribs).push({ name, equivalent: bestContrib * ratio });
      }
      for (const c of primaryContribs) {
        weightedSum += c.equivalent * 1.0;
        weightTotal += 1.0;
        blendedFrom.push(c.name);
      }
      // Secondary movers share a fixed total budget (0.5, half the canonical
      // lift's own weight) no matter how many qualify — a per-contributor
      // weight alone doesn't work: 48 secondary exercises at 0.15 each still
      // out-weighs the canonical lift 7:1 by sheer count. Caught via a real
      // account where unweighted/under-capped secondary contributors dragged
      // biceps from Novice to Beginner purely by diluting with ~48 row/
      // pulldown variants where biceps is incidental, not the limiting
      // factor — more logged history in tangentially-related lifts must not
      // be able to keep growing its pull on the score.
      const SECONDARY_WEIGHT_BUDGET = 0.5;
      if (secondaryContribs.length) {
        const perContribWeight = SECONDARY_WEIGHT_BUDGET / secondaryContribs.length;
        for (const c of secondaryContribs) {
          weightedSum += c.equivalent * perContribWeight;
          weightTotal += perContribWeight;
          blendedFrom.push(c.name);
        }
      }
    }
    // Floored at the canonical lift's own verified best — the ratio anchor
    // above uses this person's ALL-TIME AVERAGE for the canonical exercise
    // (needed to get a stable personal conversion factor), which is often
    // well below their peak. Blending can only pull a muscle's score UP by
    // showing extra capability elsewhere; it must never erode a real,
    // directly-observed PR down toward a historical average. Caught via a
    // real account: biceps showed 39kg despite a verified 45kg Barbell Curl
    // PR, entirely because 46 blended secondary exercises regressed the
    // value toward the ~29kg all-time average rather than the peak.
    const blendedE1RM = Math.max(weightedSum / weightTotal, best.e1RM);

    const { tier, score } = scoreForRatio(blendedE1RM, found.thresholds);
    muscles[muscle] = {
      e1RM: Math.round(blendedE1RM * 10) / 10,
      exercise: exerciseName,
      date: best.date,
      bodyweightKg: bw,
      tier, score,
      ...(blendedFrom.length ? { blendedFrom } : {}),
    };
  }

  return muscles;
}

module.exports = { computeMuscleLevels, classifyLift, estimate1RM, e1rm, bodyweightNear, scoreForRatio, STANDARDS, TIERS };
