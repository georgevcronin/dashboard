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
const { PRIMARY_MUSCLES, MUSCLE_GROUPS } = require('./muscleTaxonomy');

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
  for (const m of PRIMARY_MUSCLES) {
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
// held back for a separately-practiced sport.
function generateWeeklyGuidance({ currentFatigue, weekMetabolic, weekCNS, offlineMuscles, dataMature, trainingPriority = 'strength' }) {
  const priority = computeMusclePriority(currentFatigue || {}, offlineMuscles || []);

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
    muscleFocus: buckets.map(b => ({ name: b.name, muscles: b.muscles, freshness: Math.round(b.score) })),
    restingMuscleGroups,
    rationale: guidanceRationale(liftSessionsTarget, cardioSessionsTarget, weekCNS, weekMetabolic, trainingPriority),
    dataMature,
  };
}

module.exports = {
  generateWeeklyGuidance, pickBackboneExercises, computeMusclePriority, scoreBucket, planLiftSessionsTarget, planCardioSessionsTarget,
  MUSCLE_GROUPS, FATIGUE_CEILING, TRAINING_PRIORITIES,
};
