// Strength-level ranking, in the spirit of sites like strengthlevel.com: rank a
// lift by bodyweight-adjusted 1RM against published Beginner→Elite standards.
//
// There's no public API for strengthlevel.com's live data, so this uses static
// bodyweight-ratio tables built from widely-published strength-standards
// methodology (the same shape Lon Kilgore's tables and similar sites use) —
// approximate reference points, not a scrape of any specific site's numbers.
//
// Scope is deliberately limited to five barbell-style compounds that have a
// legitimate public standard to compare against. Machine/cable variants are
// tracked elsewhere in the app but not ranked here — there's no honest
// standard for e.g. a leg press machine's absolute load.

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

const { findExercise } = require('./muscleTaxonomy');

const TIERS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

// Matches the "big lift" a logged exercise name belongs to, if any. Excludes
// machine/isolation variants and non-comparable hinge variations (RDL etc.)
// so the ranking stays honest about what it's actually comparing. For a name
// found in EXERCISE_DB, the equipment field itself gates this — barbell only,
// since that's the actual scope this file documents (a dumbbell or cable row
// isn't honestly comparable to a barbell-row standard, even though the name
// contains "row"). Unrecognized/custom names fall back to keyword matching,
// with the same equipment-style exclusions applied by hand.
function classifyLift(name) {
  const n = name.toLowerCase();
  const entry = findExercise(name);
  if (entry && entry.equipment !== 'barbell') return null;
  if (n.includes('squat') && !n.includes('hack') && !n.includes('leg press') && !n.includes('split') && !n.includes('goblet')) return 'squat';
  if (n.includes('bench') && !n.includes('machine') && !n.includes('dumbbell') && !n.includes('cable')) return 'bench';
  if (n.includes('deadlift') && !n.includes('romanian') && !n.includes('rdl') && !n.includes('stiff') && !n.includes('dumbbell')) return 'deadlift';
  if ((n.includes('overhead press') || n.includes('military press') || n.includes('shoulder press')) && !n.includes('machine') && !n.includes('dumbbell')) return 'overheadPress';
  if (n.includes('row') && !n.includes('machine') && !n.includes('dumbbell') && !n.includes('cable')) return 'row';
  return null;
}

// Epley estimate, most reliable in the ~1-12 rep range; higher-rep sets are
// excluded from the 1RM estimate since the formula degrades badly past that.
function estimate1RM(kg, reps) {
  if (!kg || !reps || reps > 12) return null;
  return kg * (1 + reps / 30);
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

// lifts: db.lifts array (all-time — no date window, so this always ranks each
// lift's all-time best). weightHistory: db.weight (date -> kg), used to find
// the bodyweight in effect when each PR was actually set. currentBodyweightKg:
// fallback when no weigh-in history is available at all. sex: 'male'|'female'.
// Returns per-lift ranks plus a per-muscle-group rollup (chest/shoulders/back/legs),
// matching the app's existing push/pull/legs muscle grouping. Deadlift counts
// toward both back and legs since it's genuinely a hybrid posterior-chain lift.
function computeStrengthLevels(lifts, weightHistory, currentBodyweightKg, sex) {
  if ((!currentBodyweightKg && !Object.keys(weightHistory || {}).length) || (sex !== 'male' && sex !== 'female')) return null;
  const table = STANDARDS[sex];

  const bestByCategory = {};
  for (const l of lifts || []) {
    const cat = classifyLift(l.exercise || '');
    if (!cat) continue;
    const e1RM = estimate1RM(l.kg, l.reps);
    if (e1RM == null) continue;
    if (!bestByCategory[cat] || e1RM > bestByCategory[cat].e1RM) {
      bestByCategory[cat] = { e1RM: Math.round(e1RM * 10) / 10, exercise: l.exercise, date: l.date };
    }
  }

  const lifts_ = {};
  for (const cat of Object.keys(table)) {
    const best = bestByCategory[cat];
    if (!best) { lifts_[cat] = null; continue; }
    const bw = bodyweightNear(weightHistory, best.date) ?? currentBodyweightKg;
    if (!bw) { lifts_[cat] = null; continue; }
    const ratio = best.e1RM / bw;
    const { tier, score } = scoreForRatio(ratio, table[cat]);
    lifts_[cat] = { ...best, bodyweightKg: bw, ratio: Math.round(ratio * 100) / 100, tier, score };
  }

  const avgScore = (cats) => {
    const vals = cats.map(c => lifts_[c]?.score).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const muscleGroups = {
    chest: lifts_.bench ? { score: lifts_.bench.score, tier: lifts_.bench.tier } : null,
    shoulders: lifts_.overheadPress ? { score: lifts_.overheadPress.score, tier: lifts_.overheadPress.tier } : null,
    back: avgScore(['row', 'deadlift']) != null ? { score: avgScore(['row', 'deadlift']), tier: TIERS[Math.min(4, Math.floor(avgScore(['row', 'deadlift']) / 20))] } : null,
    legs: avgScore(['squat', 'deadlift']) != null ? { score: avgScore(['squat', 'deadlift']), tier: TIERS[Math.min(4, Math.floor(avgScore(['squat', 'deadlift']) / 20))] } : null,
  };

  return { lifts: lifts_, muscleGroups };
}

module.exports = { computeStrengthLevels, classifyLift, estimate1RM, bodyweightNear, scoreForRatio, STANDARDS, TIERS };
