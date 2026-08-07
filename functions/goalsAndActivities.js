// FEATURES.md #21-24: the onboarding goal/activity system. Extracted from
// index.js per CLAUDE.md's rule for anything beyond trivial route glue —
// pure validation/blending logic here, unit-tested directly; index.js just
// calls in from the /profile handler.
const { DEFAULT_ATROPHY_RATE } = require('./adaptation');

// Goals and activities share one shape: any number of entries, each
// independently 'primary'/'secondary'/'minor' — not a single primary +
// single secondary slot (the old primaryActivity/secondaryActivity pair).
const GOAL_TYPES = ['fatLoss', 'muscle', 'cardio', 'flexibility', 'sport'];
const ACTIVITY_TYPES = ['strength', 'running', 'cycling', 'swimming', 'sport', 'aerobic', 'other'];
const PRIORITY_TIERS = ['primary', 'secondary', 'minor'];
const PRIORITY_WEIGHT = { primary: 1, secondary: 0.5, minor: 0.25 };
// Metrics available per concrete goal type — flexibility/sport only take
// free text (nothing in the app measures either one), so they skip the
// metric choice entirely rather than offering a single fake option.
const GOAL_METRICS = { fatLoss: ['weight', 'bodyFat'], muscle: ['lift', 'ffm', 'ffmi'], cardio: ['rhr', 'benchmark', 'vo2max'] };

function validateGoals(goals) {
  if (!Array.isArray(goals)) return 'goals must be an array';
  for (const g of goals) {
    if (!g || typeof g !== 'object') return 'invalid goal entry';
    if (!GOAL_TYPES.includes(g.type)) return `Invalid goal type: ${g.type}`;
    if (!PRIORITY_TIERS.includes(g.priority)) return `Invalid priority for goal ${g.type}: ${g.priority}`;
    if (!g.concrete) continue;
    if (!g.targetDate) return `Missing target date for goal ${g.type}`;
    // NaN slips past a plain null/'' check (the frontend parseFloat()s a
    // blank numeric-target input to NaN, not '') — catch it explicitly
    // rather than silently persisting an unrenderable target.
    if (g.target == null || g.target === '' || (typeof g.target === 'number' && Number.isNaN(g.target))) return `Missing target for goal ${g.type}`;
    const metrics = GOAL_METRICS[g.type];
    if (metrics) {
      if (!metrics.includes(g.metric)) return `Invalid metric for goal ${g.type}: ${g.metric}`;
      if (g.metric === 'lift' && !g.exercise) return `Missing exercise for a lift-target muscle goal`;
      if (g.metric === 'benchmark' && !g.benchmarkLabel) return `Missing benchmark label for a benchmark-target cardio goal`;
    }
  }
  return null;
}

function validateActivities(activities) {
  if (!Array.isArray(activities)) return 'activities must be an array';
  for (const a of activities) {
    if (!a || typeof a !== 'object') return 'invalid activity entry';
    if (!ACTIVITY_TYPES.includes(a.type)) return `Invalid activity type: ${a.type}`;
    if (!PRIORITY_TIERS.includes(a.priority)) return `Invalid priority for activity ${a.type}: ${a.priority}`;
    // Free-text label -- what sport/aerobic activity/catch-all this actually
    // is (e.g. "Basketball", "Hiking"), surfaced back as the Sport/Aerobic
    // panel's kicker. Only sport/aerobic/other take one in the UI, but
    // nothing downstream depends on that, so it's not enforced here either.
    if (a.label != null && (typeof a.label !== 'string' || a.label.length > 60)) return `Invalid label for activity ${a.type}`;
  }
  return null;
}

// Smart defaults (#22, extended to #24): blended across every selected
// activity weighted by its priority tier rather than picked from a single
// "primary" winner — nothing stops more than one activity being tagged
// Primary, so a winner-take-all pick would silently drop the others.
const ACTIVITY_DEFAULTS = {
  strength: { lifting: { sessionsPerWeek: 4, avgSessionScore: 2000 } },
  running: { running: { sessionsPerWeek: 4, avgSessionDistance: 25 } },
  cycling: { sports: { sessionsPerWeek: 3 } },
  swimming: { sports: { sessionsPerWeek: 3 } },
  sport: { sports: { sessionsPerWeek: 2 } },
  aerobic: { sports: { sessionsPerWeek: 4 } },
  other: {},
};

function applyActivityDefaults(body) {
  if (!body.activities?.length) return;
  const sums = {}, weightTotals = {};
  for (const { type, priority } of body.activities) {
    const w = PRIORITY_WEIGHT[priority];
    const def = ACTIVITY_DEFAULTS[type];
    if (!w || !def) continue;
    for (const [category, fields] of Object.entries(def)) {
      for (const [field, value] of Object.entries(fields)) {
        const k = `${category}.${field}`;
        sums[k] = (sums[k] || 0) + value * w;
        weightTotals[k] = (weightTotals[k] || 0) + w;
      }
    }
  }
  const blended = {};
  for (const k of Object.keys(sums)) {
    const [category, field] = k.split('.');
    blended[category] = blended[category] || {};
    blended[category][field] = Math.round(sums[k] / weightTotals[k]);
  }
  body.weeklyTargets = { ...body.weeklyTargets, ...blended };
}

// FEATURES.md #23: a returning athlete has no logged history yet for
// estimateAtrophyRate() (adaptation.js) to measure a real gap from, so the
// self-reported break length seeds an initial conservative estimate
// instead — same DEFAULT_ATROPHY_RATE constant, applied across the
// reported time off, capped at the same 90-day/2160h ceiling
// estimateAtrophyRate() gates a single real gap to. gapCount: 0 marks it as
// a seed, not a measurement (real gaps start at 1) — index.js's /summary
// prefers the real estimateAtrophyRate(lifts) result the moment one exists,
// falling back to this seed only until then.
function seedReturningAthleteAtrophy(breakWeeks) {
  if (!breakWeeks || breakWeeks <= 0) return null;
  const hoursOff = Math.min(breakWeeks * 7 * 24, 2160);
  return {
    rate: DEFAULT_ATROPHY_RATE,
    estimatedDeclinePct: Math.round(DEFAULT_ATROPHY_RATE * hoursOff * 1000) / 10,
    gapCount: 0,
  };
}

module.exports = {
  GOAL_TYPES, ACTIVITY_TYPES, PRIORITY_TIERS, PRIORITY_WEIGHT, GOAL_METRICS, ACTIVITY_DEFAULTS,
  validateGoals, validateActivities, applyActivityDefaults, seedReturningAthleteAtrophy,
};
