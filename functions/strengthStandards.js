// Strength-level ranking, in the spirit of sites like strengthlevel.com: rank a
// lift by bodyweight-adjusted 1RM against published Beginner→Elite standards.
//
// There's no public API for strengthlevel.com's live data, so this uses static
// bodyweight-ratio tables built from widely-published strength-standards
// methodology (the same shape Lon Kilgore's tables and similar sites use) —
// approximate reference points, not a scrape of any specific site's numbers.
//
// Scope is deliberately limited to five barbell-style compounds that have a
// legitimate public standard to compare against — and, within each, to the
// single canonical exercise the standard is actually calibrated on (see
// CLASSIFY_ALLOWLIST below). Every other variant — machine/cable, or a
// same-equipment variant with a genuinely different loading profile like a
// partial-ROM squat — is tracked elsewhere in the app but not ranked here;
// there's no honest standard to compare it against.

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
// fallback when no weigh-in history is available at all. sex: 'male'|'female',
// case-insensitive — profile.sex is stored as the UI's display casing
// ('Male'/'Female'), not pre-normalized, so this must tolerate that rather
// than silently returning null for every real profile (see commit history:
// this was live-broken for exactly that reason before being caught).
// Returns per-lift ranks plus a per-muscle-group rollup (chest/shoulders/back/legs),
// matching the app's existing push/pull/legs muscle grouping. Deadlift counts
// toward both back and legs since it's genuinely a hybrid posterior-chain lift.
function computeStrengthLevels(lifts, weightHistory, currentBodyweightKg, sex) {
  sex = (sex || '').toLowerCase();
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
