// Session muscle-selection for the full-body auto-generator. Two modes:
//
// - 'Full Body' (the default): no fixed categories at all -- every muscle
//   is ranked by freshness directly and the top N are picked, where N is
//   derived from this athlete's own real session history (see
//   typicalSessionMuscleCount), not a fixed constant. A session can lean
//   push-heavy or pull-heavy on a given day if that's genuinely what's
//   freshest -- balance is expected to happen across the week, not forced
//   into every single session (see PRODUCT.md/TRAINING_ETHOS's "frequency
//   over volume, no rigid periodized templates").
//
// - Named splits ('Upper / Lower', 'Push / Pull / Legs', 'Arnold Split',
//   'PPL Arnold'): an
//   explicit, opt-in exception to that same "no rigid templates" stance --
//   fine for someone who genuinely wants that structure, as long as it's a
//   choice and not the forced default. Which part of the split comes next
//   is itself autoregulated rather than a fixed calendar assignment: it's
//   whichever named group has gone the longest since it was last trained
//   at all (mostOverdueGroup), not "day 3 of the week = legs" regardless
//   of what was actually done recently.
const { PRIMARY_MUSCLES, MUSCLE_GROUPS, findExercise } = require('./muscleTaxonomy');

const UPPER_LOWER_GROUPS = {
  upper: [...MUSCLE_GROUPS.push, ...MUSCLE_GROUPS.pull],
  lower: [...MUSCLE_GROUPS.legs, ...MUSCLE_GROUPS.core],
};

const PPL_GROUPS = {
  push: MUSCLE_GROUPS.push,
  pull: MUSCLE_GROUPS.pull,
  // Core folded into leg day -- common real-world PPL convention, and this
  // taxonomy has no more natural fourth home for it.
  legs: [...MUSCLE_GROUPS.legs, ...MUSCLE_GROUPS.core],
};

// Classic 6-day Arnold split: chest+back paired, shoulders+arms paired,
// legs on their own -- core folded into legs, same convention as PPL_GROUPS.
const ARNOLD_GROUPS = {
  chestBack: ['chest', 'lats', 'rhomboids', 'traps', 'lower-traps', 'mid-traps', 'rear-delt', 'rotator-cuff'],
  shouldersArms: ['front-delt', 'mid-delt', 'biceps', 'triceps', 'brachialis', 'brachioradialis', 'forearms'],
  legs: [...MUSCLE_GROUPS.legs, ...MUSCLE_GROUPS.core],
};

// PPL through once, then the Arnold split through once, rotating on
// recency same as every other named split here (no fixed day count) --
// a straight union of both groupings' buckets, deduped where they're
// literally identical (both fold core into the same 'legs' set).
const PPL_ARNOLD_GROUPS = {
  push: MUSCLE_GROUPS.push,
  pull: MUSCLE_GROUPS.pull,
  legs: [...MUSCLE_GROUPS.legs, ...MUSCLE_GROUPS.core],
  chestBack: ARNOLD_GROUPS.chestBack,
  shouldersArms: ARNOLD_GROUPS.shouldersArms,
};

const SPLIT_GROUPS = {
  'Upper / Lower': UPPER_LOWER_GROUPS,
  'Push / Pull / Legs': PPL_GROUPS,
  'Arnold Split': ARNOLD_GROUPS,
  'PPL Arnold': PPL_ARNOLD_GROUPS,
};

// Ranks every available muscle (priority >= 0 -- not offline/over-ceiling)
// by freshness, freshest first. No grouping/categorization at all.
function rankMusclesByFreshness(priority) {
  return Object.entries(priority)
    .filter(([, p]) => p >= 0)
    .sort(([, a], [, b]) => b - a)
    .map(([m]) => m);
}

// Median distinct-primary-muscles-touched across this athlete's own last
// real sessions (grouped by date) -- the actual size of a "full body
// session" for THEM, not a number picked out of thin air. Needs at least 3
// real sessions to trust a median from; a brand-new account (or one with
// only a couple of logged days) gets the fallback instead of a median
// computed from too little data to mean anything.
function typicalSessionMuscleCount(lifts, fallback = 6) {
  const byDate = {};
  for (const l of (lifts || [])) {
    const entry = findExercise(l.exercise);
    if (!entry || !l.date) continue;
    (byDate[l.date] ||= new Set());
    for (const m of entry.primary || []) byDate[l.date].add(m);
  }
  const counts = Object.values(byDate).map(s => s.size).filter(n => n > 0);
  if (counts.length < 3) return fallback;
  counts.sort((a, b) => a - b);
  const mid = Math.floor(counts.length / 2);
  return counts.length % 2 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
}

// Which named group of a split has gone longest without being trained at
// all -- a group's overdue-ness is measured from whichever of its muscles
// was MOST recently touched (i.e. when the group as a whole last got any
// attention), not its least-recently-touched muscle. Untrained-ever
// muscles count as infinitely overdue. Ties (e.g. brand-new account, all
// Infinity) resolve by object key order, which is fine -- there's no real
// history yet to prefer one over another anyway.
function mostOverdueGroup(groups, muscleLastTrainedDays) {
  const scored = Object.entries(groups).map(([name, muscles]) => {
    const daysAgo = Math.min(...muscles.map(m => muscleLastTrainedDays[m] ?? Infinity));
    return { name, muscles, daysAgo };
  });
  scored.sort((a, b) => b.daysAgo - a.daysAgo);
  return scored[0];
}

// Fraction of a session's touched muscles that fall into whichever single
// named group dominates that session (1.0 = every muscle belongs to one
// group -- a "clean" split day; lower = spread across multiple groups,
// more full-body in character).
function sessionPurity(groups, musclesTouched) {
  if (!musclesTouched.length) return 0;
  const counts = {};
  for (const m of musclesTouched) {
    for (const [name, groupMuscles] of Object.entries(groups)) {
      if (groupMuscles.includes(m)) counts[name] = (counts[name] || 0) + 1;
    }
  }
  const max = Math.max(0, ...Object.values(counts));
  return max / musclesTouched.length;
}

// Infers which split style an athlete's real recent sessions actually look
// like, so an account with real history defaults to what they're already
// doing instead of always defaulting to Full Body and making them
// re-select it in Settings. Compares each named split's average session
// "purity" (see sessionPurity) against a minimum-confidence threshold --
// 'Full Body' wins unless a named split's groups clearly explain the
// sessions (most of each session's muscles consistently falling into one
// group). Returns null with fewer than 4 real multi-muscle sessions to
// infer anything from, rather than guessing off too little data.
const SPLIT_DETECTION_THRESHOLD = 0.7;
function detectPreferredSplit(lifts) {
  const byDate = {};
  for (const l of (lifts || [])) {
    const entry = findExercise(l.exercise);
    if (!entry || !l.date) continue;
    (byDate[l.date] ||= new Set());
    for (const m of entry.primary || []) byDate[l.date].add(m);
  }
  const sessions = Object.values(byDate).map(s => [...s]).filter(arr => arr.length >= 2);
  if (sessions.length < 4) return null;

  const recent = sessions.slice(-12);
  // A dataset consistent with a finer-grained split (e.g. clean push-only
  // and pull-only days) is mathematically also consistent with a coarser
  // one that merges those same groups together (push ∪ pull = upper) --
  // real ambiguity, not a bug, so ties prefer the more specific/informative
  // classification (more groups) rather than whichever key happens to
  // iterate first. But a hybrid union like PPL Arnold duplicates muscles
  // across its buckets (chestBack/shouldersArms re-cover the same muscles
  // push/pull already do), which inflates its groupCount without adding
  // real partition granularity -- so ties are broken first by whichever
  // grouping is closer to a true non-overlapping partition (fewer total
  // muscle-slot entries across its groups), THEN by groupCount.
  let best = { name: 'Full Body', avgPurity: 0, totalEntries: Infinity, groupCount: 0 };
  for (const [splitName, groups] of Object.entries(SPLIT_GROUPS)) {
    const avgPurity = recent.reduce((sum, s) => sum + sessionPurity(groups, s), 0) / recent.length;
    const groupCount = Object.keys(groups).length;
    const totalEntries = Object.values(groups).reduce((sum, m) => sum + m.length, 0);
    const better = avgPurity > best.avgPurity
      || (avgPurity === best.avgPurity && totalEntries < best.totalEntries)
      || (avgPurity === best.avgPurity && totalEntries === best.totalEntries && groupCount > best.groupCount);
    if (better) {
      best = { name: splitName, avgPurity, totalEntries, groupCount };
    }
  }
  return best.avgPurity >= SPLIT_DETECTION_THRESHOLD ? best.name : 'Full Body';
}

// Matches weeklyPlanner.js's stalenessBoost atrophy-risk cutoff, rather
// than inventing a separate threshold — 3 weeks without training is
// already this codebase's established "genuinely overdue" line.
const NEGLECT_THRESHOLD_DAYS = 21;

// A named split's real cost, made visible: every group in a split (e.g.
// Upper/Lower's 'lower', or Arnold Split's 'legs') is exhaustive by
// construction — every muscle belongs to some group, so nothing is ever
// structurally excluded from all of them. The actual risk is a whole GROUP
// going stale because the rotation hasn't reached it in a long time (e.g.
// no Lower day in 3+ weeks) — every muscle in that group is then neglected
// as a direct, structural consequence of the split, not because it simply
// wasn't picked for today (which is normal and not a problem). A group
// counts as neglected only if its FRESHEST muscle is still beyond the
// threshold — if even one muscle in it has recent training, the rotation
// is still reaching that group, just not exhaustively. 'Full Body' has no
// groups to neglect and always returns [].
function neglectedMuscles(preferredSplit, muscleLastTrainedDays) {
  const groups = SPLIT_GROUPS[preferredSplit];
  if (!groups) return [];
  const neglected = [];
  for (const muscles of Object.values(groups)) {
    const freshestDaysAgo = Math.min(...muscles.map(m => muscleLastTrainedDays[m] ?? Infinity));
    if (freshestDaysAgo <= NEGLECT_THRESHOLD_DAYS) continue;
    for (const m of muscles) neglected.push({ muscle: m, daysSinceTrained: muscleLastTrainedDays[m] ?? null });
  }
  return neglected;
}

module.exports = {
  UPPER_LOWER_GROUPS, PPL_GROUPS, ARNOLD_GROUPS, PPL_ARNOLD_GROUPS, SPLIT_GROUPS,
  rankMusclesByFreshness, typicalSessionMuscleCount, mostOverdueGroup,
  sessionPurity, detectPreferredSplit, SPLIT_DETECTION_THRESHOLD,
  neglectedMuscles, NEGLECT_THRESHOLD_DAYS,
};
