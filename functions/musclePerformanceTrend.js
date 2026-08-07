// Per-muscle strength-trend signal, factored into its own module rather than
// living in fatigue.js or sessionPlanner.js: fatigue.js already imports
// STABLE_EQUIPMENT/UNSTABLE_EQUIPMENT from sessionPlanner.js, so a function
// needed by BOTH fatigue.js's computePerformanceTrend (as a shared helper) and
// sessionPlanner.js's overshoot-cap logic (as a consumer) would create a real
// require cycle either way. This module depends on neither, so both can import
// from it safely — same reasoning as adaptation.js being split out for being a
// genuinely separate concern, just driven here by module-graph necessity too.

const { findExercise } = require('./muscleTaxonomy');
const { e1rm: calcE1RM } = require('./strengthStandards');

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const liftTime = (l) => new Date(l.start || l.date).getTime();

// Session-to-session e1RM decrement per exercise, most recent 2 sessions vs.
// the 2 before that, 21-day lookback -- the exact computation
// fatigue.js's computePerformanceTrend blends into one whole-body number via
// avg(Object.values(...)). Factored out here so computeMusclePerformanceTrends
// below can re-group the same per-exercise signal by target muscle instead.
// Keyed by lowercased exercise name (Hevy imports lowercase on ingest; other
// sources don't, so casing can't be trusted as a natural key).
function exercisePerformanceDecrements(lifts) {
  const byEx = {};
  for (const l of (lifts || [])) {
    if (!l.exercise || !l.kg || !l.reps) continue;
    const daysAgo = (Date.now() - liftTime(l)) / 86_400_000;
    if (daysAgo < 0 || daysAgo > 21) continue;
    const date = l.date || l.start;
    const e1rmVal = calcE1RM(l.kg, l.reps);
    const key = l.exercise.toLowerCase();
    (byEx[key] = byEx[key] || {})[date] = Math.max((byEx[key] || {})[date] || 0, e1rmVal);
  }
  const decrements = {};
  for (const [key, byDate] of Object.entries(byEx)) {
    const dates = Object.keys(byDate).sort();
    if (dates.length < 4) continue;
    const recentAvg = avg(dates.slice(-2).map(d => byDate[d]));
    const priorAvg = avg(dates.slice(-4, -2).map(d => byDate[d]));
    if (priorAvg > 0) decrements[key] = (priorAvg - recentAvg) / priorAvg;
  }
  return decrements;
}

// Per-muscle counterpart to computePerformanceTrend: same per-exercise
// recent-vs-prior e1RM decrement (exercisePerformanceDecrements above), grouped
// by which muscle each exercise PRIMARILY trains -- exerciseDb.js's own
// `primary` array, resolved via muscleTaxonomy's findExercise (DB-exact-or-alias
// only; an exercise that only resolves through the KEYWORD_FALLBACK table has no
// primary/secondary distinction to group by, so it's silently excluded here,
// same as it would be from anything else that needs a real primary array) --
// instead of averaged into one whole-body number. A muscle trained by several
// exercises averages their decrements equally; positive = declining performance
// (least-improving/most-stalled), same sign convention as computePerformanceTrend.
//
// Used by sessionPlanner.js's session-level overshoot cap to prioritize which
// stalled muscle most deserves the extra-volume probe when more exercises want
// one than the cap allows. A muscle absent from the returned object has no
// exercise with enough logged history (exercisePerformanceDecrements' own
// 4-distinct-dates floor) to say anything about its trend -- callers must treat
// that as neutral/lowest-priority for this specific experiment, not as "most in
// need" (that's a distinct, already-handled concern -- see weeklyPlanner.js's
// stalenessBoost).
function computeMusclePerformanceTrends(lifts) {
  const decrements = exercisePerformanceDecrements(lifts);
  const byMuscle = {};
  for (const [key, decrement] of Object.entries(decrements)) {
    const primary = findExercise(key)?.primary || [];
    for (const m of primary) (byMuscle[m] = byMuscle[m] || []).push(decrement);
  }
  const out = {};
  for (const [m, values] of Object.entries(byMuscle)) out[m] = avg(values);
  return out;
}

module.exports = { exercisePerformanceDecrements, computeMusclePerformanceTrends };
