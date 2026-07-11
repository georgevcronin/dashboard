// Deterministic weekly training guidance — advisory, not a locked schedule.
//
// Earlier versions of this pinned a specific muscle group to a specific
// calendar day (Monday = legs, Tuesday = push, ...). That's exactly the kind
// of rigid periodized template the training ethos argues against: "no rigid
// periodized templates — adjust load, sets, and exercise choice session to
// session based on real fatigue and performance." So this module no longer
// assigns days at all. It answers two questions only: how many strength
// sessions can this week's systemic fatigue productively absorb, and which
// muscle groups are freshest right now — both recomputed live, never locked
// in. Which specific day you actually train, and in what order, is entirely
// up to the athlete; functions/sessionPlanner.js picks the freshest bucket
// (or whichever one the athlete picks instead) live, every time a session is
// started, rather than reading back a pre-committed slot.

const { EXERCISE_DB } = require('./exerciseDb');

const ALL_MUSCLES = [
  'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'erectors',
  'chest', 'abs', 'obliques', 'biceps', 'triceps', 'forearms', 'traps',
  'front-delt', 'rear-delt', 'lats', 'rhomboids', 'neck',
];

const MUSCLE_GROUPS = {
  push: ['chest', 'front-delt', 'triceps'],
  pull: ['lats', 'rhomboids', 'traps', 'rear-delt', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
  core: ['abs', 'obliques', 'erectors', 'neck'],
};

const FATIGUE_CEILING = 65; // ethos: don't load a muscle already this fatigued

// Compound-first exercise selection: excludes lesserKnown (novel/accessory)
// variations, which the ethos treats as a "final 5%" addition, not a starting
// strategy. Picks the exercises whose primary muscles best cover the target set.
function pickBackboneExercises(targetMuscles, { travelMode, count = 2 } = {}) {
  const pool = EXERCISE_DB.filter(e =>
    !e.lesserKnown &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    e.primary.some(m => targetMuscles.includes(m))
  );
  const scored = pool
    .map(e => ({ e, score: e.primary.filter(m => targetMuscles.includes(m)).length }))
    .sort((a, b) => b.score - a.score);
  const out = [];
  for (const { e } of scored) {
    if (out.some(o => o.name === e.name)) continue;
    out.push(e);
    if (out.length >= count) break;
  }
  return out;
}

// Per-muscle priority: -1 means "do not load right now" (injured or already
// at/over the fatigue ceiling); otherwise higher = fresher = more deserving
// of stimulus. Called live at guidance time and again at session-start time —
// never cached against a specific day, since fatigue moves session to session.
function computeMusclePriority(currentFatigue, offlineMuscles) {
  const priority = {};
  for (const m of ALL_MUSCLES) {
    if (offlineMuscles.includes(m)) { priority[m] = -1; continue; }
    const fatigue = currentFatigue[m] || 0;
    priority[m] = fatigue >= FATIGUE_CEILING ? -1 : (100 - fatigue);
  }
  return priority;
}

function scoreBucket(muscles, priority) {
  const avail = muscles.filter(m => priority[m] >= 0);
  if (!avail.length) return null;
  return { muscles: avail, score: avail.reduce((s, m) => s + priority[m], 0) / avail.length };
}

// How many genuine lifting sessions this week's systemic fatigue can
// absorb — a target to hit whenever suits, not a count of locked slots.
// Systemic (CNS/metabolic) fatigue pulls it down; low systemic fatigue with
// several fresh muscle groups pulls it up toward higher frequency.
function planLiftSessionsTarget(weekCNS, weekMetabolic, availableBucketCount) {
  let sessions = 4;
  if (weekCNS > 70 || weekMetabolic > 70) sessions = 2;
  else if (weekCNS > 40 || weekMetabolic > 40) sessions = 3;
  return Math.max(0, Math.min(sessions, availableBucketCount === 0 ? 0 : availableBucketCount + 1));
}

function guidanceRationale(liftSessionsTarget, weekCNS, weekMetabolic) {
  if (liftSessionsTarget === 0) return 'No muscle group is fresh enough to load productively right now — prioritise recovery before the next session.';
  const fatigueNote = weekCNS > 70 || weekMetabolic > 70
    ? 'Systemic fatigue is high, so this is intentionally light.'
    : weekCNS > 40 || weekMetabolic > 40
    ? 'Moderate fatigue carried in, so this is a touch below max.'
    : 'Fatigue is low across the board.';
  return `${fatigueNote} ${liftSessionsTarget} strength session${liftSessionsTarget > 1 ? 's' : ''} is what your current recovery can productively absorb this week — train them whenever suits, in whatever order, on top of whatever you've already done.`;
}

// Returns advisory guidance only — no days, no locked exercises. muscleFocus
// is ranked freshest-first; restingMuscleGroups lists groups with nothing
// available to load right now (fully fatigued or fully offline). Both are
// meant to be recomputed on demand, since either can shift after a single
// session.
function generateWeeklyGuidance({ currentFatigue, weekMetabolic, weekCNS, offlineMuscles, dataMature }) {
  const priority = computeMusclePriority(currentFatigue || {}, offlineMuscles || []);

  const buckets = Object.entries(MUSCLE_GROUPS)
    .map(([name, muscles]) => {
      const scored = scoreBucket(muscles, priority);
      return scored ? { name, ...scored } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const liftSessionsTarget = planLiftSessionsTarget(weekCNS, weekMetabolic, buckets.length);
  const activeNames = new Set(buckets.map(b => b.name));
  const restingMuscleGroups = Object.keys(MUSCLE_GROUPS).filter(n => !activeNames.has(n));

  return {
    liftSessionsTarget,
    hiitRecommended: weekCNS < 60,
    muscleFocus: buckets.map(b => ({ name: b.name, muscles: b.muscles, freshness: Math.round(b.score) })),
    restingMuscleGroups,
    rationale: guidanceRationale(liftSessionsTarget, weekCNS, weekMetabolic),
    dataMature,
  };
}

module.exports = {
  generateWeeklyGuidance, pickBackboneExercises, computeMusclePriority, scoreBucket, planLiftSessionsTarget,
  ALL_MUSCLES, MUSCLE_GROUPS, FATIGUE_CEILING,
};
