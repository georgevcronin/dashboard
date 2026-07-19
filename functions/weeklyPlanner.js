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
const { PRIMARY_MUSCLES, MUSCLE_GROUPS, loggedExerciseNames } = require('./muscleTaxonomy');

// Dominates the small (0-4 point) muscle-coverage score below by design — "a
// heavy preference for exercises you've done before" means history should
// decide the pick over marginal coverage differences almost every time, not
// just nudge it. Raised from 20 after real-world testing (a 4-year Hevy
// import) still surfaced too many unfamiliar exercises — the bigger fix
// there was findExercise/loggedExerciseNames now resolving import-source
// aliases (exerciseNameAliases.js) so genuinely-logged names actually match
// their DB entry at all, but this is widened too for extra margin.
const LOGGED_EXERCISE_BONUS = 40;
// Smaller than LOGGED_EXERCISE_BONUS — a self-reported favorite from
// onboarding is a real anchor for a brand-new account with no lift history
// yet to weight against, but it's a stated preference, not demonstrated
// behavior, so real logged history (once it exists) should still win.
const FAVORITE_EXERCISE_BONUS = 15;

const FATIGUE_CEILING = 65; // ethos: don't load a muscle already this fatigued

// Major prime-mover muscles (the original tracked set) vs. small assistor/
// stabilizer muscles added later (rotator cuff, brachialis, mid/lower traps,
// etc.) for exercise-selection coverage. Assistors recover much faster and
// are rarely logged directly, so weighting them equally in a bucket's
// freshness average lets them dominate once the real prime movers cap out at
// the fatigue ceiling and drop out of the average — e.g. a genuinely fried
// back (lats/rhomboids/traps/rear-delt/biceps all capped) would otherwise
// still read as "fresh" off rotator-cuff/brachialis alone. Assistors keep a
// small non-zero weight rather than 0 so a bucket with zero available majors
// still shows *some* signal instead of vanishing outright.
const MAJOR_MUSCLES = new Set([
  'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'erectors',
  'chest', 'abs', 'obliques', 'biceps', 'triceps', 'forearms', 'traps',
  'front-delt', 'rear-delt', 'lats', 'rhomboids', 'neck', 'mid-delt',
]);
const ASSISTOR_WEIGHT = 0.15;
function muscleWeight(m) { return MAJOR_MUSCLES.has(m) ? 1 : ASSISTOR_WEIGHT; }

// Compound-first exercise selection: excludes lesserKnown (novel/accessory)
// variations, which the ethos treats as a "final 5%" addition, not a starting
// strategy, and isometric holds (Plank, Pallof Press, ...) — mechanical
// tension through a full, progressively-loadable ROM is the primary driver
// of strength stimulus, and a static hold doesn't give double-progression
// (the app's core mechanism) anything to work with the way a normal lift
// does. Picks the exercises whose primary muscles best cover the target set,
// heavily boosted (LOGGED_EXERCISE_BONUS) toward whatever the athlete has
// actually logged before over something novel.
function pickBackboneExercises(targetMuscles, { travelMode, lifts, favoriteExercises = [], count = 2 } = {}) {
  const logged = loggedExerciseNames(lifts);
  const favorites = new Set(favoriteExercises.map(n => (n || '').toLowerCase()));
  const pool = EXERCISE_DB.filter(e =>
    !e.lesserKnown && !e.isometric &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    e.primary.some(m => targetMuscles.includes(m))
  );
  const scored = pool
    .map(e => ({
      e,
      score: e.primary.filter(m => targetMuscles.includes(m)).length
        + (logged.has(e.name.toLowerCase()) ? LOGGED_EXERCISE_BONUS : 0)
        + (favorites.has(e.name.toLowerCase()) ? FAVORITE_EXERCISE_BONUS : 0),
    }))
    .sort((a, b) => b.score - a.score);
  // Skip anything that's the same function as something already picked —
  // same pattern (press/row/curl/...) hitting an overlapping primary muscle
  // is a redundant pick (e.g. Barbell Overhead Press + Machine Shoulder
  // Press), not real variety. A different pattern on the same muscle (a
  // press plus an isolation raise) is fine and stays allowed.
  const out = [];
  for (const { e } of scored) {
    if (out.some(o => o.name === e.name)) continue;
    if (out.some(o => o.pattern === e.pattern && e.primary.some(m => o.primary.includes(m)))) continue;
    out.push(e);
    if (out.length >= count) break;
  }
  return out;
}

// Additive priority boost for a muscle that hasn't been a genuine training
// focus in a while — distinct from (and additive on top of) the fatigue-
// freshness score, so a muscle that's fresh only because it was barely
// touched doesn't rank the same as one that's fresh AND overdue. Detraining
// research: negligible measurable muscle loss in the first 1-2 weeks off, no
// real urgency there; hypertrophy decline sets in around 3-4+ weeks, so this
// ramps from 0 through week 2, accelerates through week 3, and caps once
// solidly in the genuine atrophy-risk zone beyond 3 weeks. Never trained at
// all (muscleLastTrainedDays has no entry) gets the same treatment as "3
// weeks overdue" — worth introducing, not worth panicking over.
function stalenessBoost(daysSinceLastTrained) {
  const d = daysSinceLastTrained ?? 21;
  if (d <= 7) return 0;
  if (d <= 14) return (d - 7) * (15 / 7);
  if (d <= 21) return 15 + (d - 14) * (20 / 7);
  return Math.min(60, 35 + (d - 21) * 2);
}

// Per-muscle priority: -1 means "do not load right now" (injured or already
// at/over the fatigue ceiling); otherwise higher = fresher/more-overdue =
// more deserving of stimulus. Called live at guidance time and again at
// session-start time — never cached against a specific day, since fatigue
// moves session to session. muscleLastTrainedDays is optional (null skips
// the staleness boost entirely, e.g. for callers that don't have lift
// history handy) — passing it blends in atrophy-risk prioritization from
// computeMuscleLastTrainedDays (functions/fatigue.js).
function computeMusclePriority(currentFatigue, offlineMuscles, muscleLastTrainedDays = null) {
  const priority = {};
  for (const m of PRIMARY_MUSCLES) {
    if (offlineMuscles.includes(m)) { priority[m] = -1; continue; }
    const fatigue = currentFatigue[m] || 0;
    if (fatigue >= FATIGUE_CEILING) { priority[m] = -1; continue; }
    const boost = muscleLastTrainedDays ? stalenessBoost(muscleLastTrainedDays[m]) : 0;
    priority[m] = (100 - fatigue) + boost;
  }
  return priority;
}

function scoreBucket(muscles, priority) {
  const avail = muscles.filter(m => priority[m] >= 0);
  if (!avail.length) return null;
  const totalWeight = avail.reduce((s, m) => s + muscleWeight(m), 0);
  const score = avail.reduce((s, m) => s + priority[m] * muscleWeight(m), 0) / totalWeight;
  return { muscles: avail, score };
}

// A priority can't maximize every kind of training at once — the classic
// competing-demands trade-off. 'strength' is the default (lifting gets full
// frequency, cardio stays light so it doesn't dilute lifting stimulus, per
// the ethos). 'cardio' flips that: lifting is capped to maintenance level so
// recovery capacity goes to conditioning work instead. 'sport' caps both,
// treating whatever sport the athlete plays as the primary stimulus and
// general training as support work that shouldn't leave them too fatigued
// to perform.
const TRAINING_PRIORITIES = ['strength', 'cardio', 'sport'];
const LIFT_SESSION_CAP = { strength: 4, cardio: 2, sport: 2 };
const CARDIO_SESSION_BASE = { strength: 1, cardio: 4, sport: 1 };

// How many genuine lifting sessions this week's systemic fatigue can
// absorb — a target to hit whenever suits, not a count of locked slots.
// Systemic (CNS/metabolic) fatigue pulls it down; low systemic fatigue with
// several fresh muscle groups pulls it up toward the priority's cap.
function planLiftSessionsTarget(weekCNS, weekMetabolic, availableBucketCount, trainingPriority = 'strength') {
  let sessions = LIFT_SESSION_CAP[trainingPriority] ?? LIFT_SESSION_CAP.strength;
  if (weekCNS > 70 || weekMetabolic > 70) sessions = Math.min(sessions, 2);
  else if (weekCNS > 40 || weekMetabolic > 40) sessions = Math.min(sessions, 3);
  return Math.max(0, Math.min(sessions, availableBucketCount === 0 ? 0 : availableBucketCount + 1));
}

// Cardio doesn't compete for the same per-muscle fatigue buckets lifting
// does, but it's still CNS-taxing (HIIT especially), so heavy CNS fatigue
// trims it too.
function planCardioSessionsTarget(weekCNS, trainingPriority = 'strength') {
  const base = CARDIO_SESSION_BASE[trainingPriority] ?? CARDIO_SESSION_BASE.strength;
  return weekCNS > 80 ? Math.max(0, base - 1) : base;
}

function guidanceRationale(liftSessionsTarget, cardioSessionsTarget, weekCNS, weekMetabolic, trainingPriority) {
  if (liftSessionsTarget === 0 && cardioSessionsTarget === 0) return 'Systemic fatigue is too high for productive loading of any kind right now — prioritise recovery.';
  const fatigueNote = weekCNS > 70 || weekMetabolic > 70
    ? 'Systemic fatigue is high, so this is intentionally light.'
    : weekCNS > 40 || weekMetabolic > 40
    ? 'Moderate fatigue carried in, so this is a touch below max.'
    : 'Fatigue is low across the board.';
  const s = n => n === 1 ? '' : 's';
  const priorityNote = {
    strength: `${liftSessionsTarget} strength session${s(liftSessionsTarget)} is the priority this week${cardioSessionsTarget > 0 ? `, with ${cardioSessionsTarget} conditioning session${s(cardioSessionsTarget)} kept light so it doesn't dilute lifting stimulus` : ''}.`,
    cardio: `Cardio is the priority this week — aim for ${cardioSessionsTarget} conditioning session${s(cardioSessionsTarget)}, with ${liftSessionsTarget} strength session${s(liftSessionsTarget)} kept to maintenance so lifting doesn't eat into cardio recovery.`,
    sport: `Training is deliberately capped to preserve freshness for your sport — ${liftSessionsTarget} maintenance strength session${s(liftSessionsTarget)} and minimal structured cardio; let sport practice be the primary conditioning stimulus.`,
  }[trainingPriority] || `${liftSessionsTarget} strength session${s(liftSessionsTarget)} this week.`;
  return `${fatigueNote} ${priorityNote} Train them whenever suits, in whatever order, on top of whatever you've already done.`;
}

// Returns advisory guidance only — no days, no locked exercises. muscleFocus
// is ranked freshest-first; restingMuscleGroups lists groups with nothing
// available to load right now (fully fatigued or fully offline). Both are
// meant to be recomputed on demand, since either can shift after a single
// session. trainingPriority ('strength'|'cardio'|'sport') shifts how much of
// the week's recovery capacity is earmarked for lifting vs. conditioning vs.
// held back for a separately-practiced sport. muscleLastTrainedDays is
// optional (functions/fatigue.js's computeMuscleLastTrainedDays) — passing
// it keeps the displayed "freshness" chips consistent with the same
// atrophy-risk prioritization that /plan/session-exercises's full-body
// auto-pick actually uses, rather than the display showing plain fatigue-
// freshness while session generation weighs staleness too.
function generateWeeklyGuidance({ currentFatigue, weekMetabolic, weekCNS, offlineMuscles, dataMature, trainingPriority = 'strength', muscleLastTrainedDays = null }) {
  const priority = computeMusclePriority(currentFatigue || {}, offlineMuscles || [], muscleLastTrainedDays);

  const buckets = Object.entries(MUSCLE_GROUPS)
    .map(([name, muscles]) => {
      const scored = scoreBucket(muscles, priority);
      return scored ? { name, ...scored } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const liftSessionsTarget = planLiftSessionsTarget(weekCNS, weekMetabolic, buckets.length, trainingPriority);
  const cardioSessionsTarget = planCardioSessionsTarget(weekCNS, trainingPriority);
  const activeNames = new Set(buckets.map(b => b.name));
  const restingMuscleGroups = Object.keys(MUSCLE_GROUPS).filter(n => !activeNames.has(n));

  return {
    trainingPriority,
    liftSessionsTarget,
    cardioSessionsTarget,
    hiitRecommended: cardioSessionsTarget > 0,
    muscleFocus: buckets.map(b => ({ name: b.name, muscles: b.muscles, freshness: Math.min(100, Math.round(b.score)) })),
    restingMuscleGroups,
    rationale: guidanceRationale(liftSessionsTarget, cardioSessionsTarget, weekCNS, weekMetabolic, trainingPriority),
    dataMature,
  };
}

module.exports = {
  generateWeeklyGuidance, pickBackboneExercises, computeMusclePriority, scoreBucket, planLiftSessionsTarget, planCardioSessionsTarget,
  stalenessBoost, MUSCLE_GROUPS, FATIGUE_CEILING, TRAINING_PRIORITIES,
};
