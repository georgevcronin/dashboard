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
const { PRIMARY_MUSCLES, MUSCLE_GROUPS, loggedExerciseNames, isBodyweightOnlyExercise, redundancyPattern } = require('./muscleTaxonomy');
const { SPLIT_GROUPS } = require('./splitPlanner');
const { stabilityScore } = require('./sessionPlanner');
const { idealAngleForMuscle } = require('./emgActivation');
const { emgProfileForExercise } = require('./exerciseEmgProfiles');

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

// Primary-muscle fatigue ceiling: don't target or load a muscle already
// this fatigued as the main mover. SECONDARY_FATIGUE_CEILING is deliberately
// higher — a muscle merely assisting (e.g. lats as a secondary on a
// tricep-primary press) tolerates more residual fatigue than one being
// directly trained, so it gets a looser bar rather than the same one.
const FATIGUE_CEILING = 50;
const SECONDARY_FATIGUE_CEILING = 65;

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
//
// Weight by real EMG activation relative to the exercise's own hardest-hit
// primary muscle, when exerciseEmgProfiles.js has curated data for it — not a
// flat count of target muscles touched, which structurally favors any
// exercise that spreads thin across many muscles over one that's a dedicated
// main-mover for a single muscle, regardless of how adequately either
// actually trains what it touches. This was the actual root cause of a whole
// family of reported issues — Sumo Deadlift/Box Squat, Bench Press/Weighted
// Dips, three lat exercises — all won on the old flat-count formula purely
// for covering more muscles at once, not for training any of them especially
// well.
//
// Falls back to the previous fix for that same bug (diminishing weight by
// primary-array position, 1, 1/2, 1/3, ... — exerciseDb.js's primary array is
// ordered main-mover-first, the same convention "row" and the Sumo
// Deadlift/Box Squat fix elsewhere in this file rely on) for the majority of
// EXERCISE_DB that has no curated EMG profile — a real number beats an
// ordinal proxy when it exists, but the ordinal proxy is still real signal
// where EMG data doesn't reach.
function positionalCoverage(e, targetMuscles) {
  return e.primary.reduce((sum, m, i) => targetMuscles.includes(m) ? sum + 1 / (i + 1) : sum, 0);
}
function weightedCoverage(e, targetMuscles) {
  const profile = emgProfileForExercise(e.name);
  const peak = profile ? Math.max(0, ...e.primary.map(m => profile[m] || 0)) : 0;
  if (!peak) return positionalCoverage(e, targetMuscles);
  return e.primary.reduce((sum, m) => targetMuscles.includes(m) ? sum + (profile[m] || 0) / peak : sum, 0);
}

function pickBackboneExercises(targetMuscles, { travelMode, lifts, favoriteExercises = [], count = 2, excludeNames = new Set(), preferStable = false } = {}) {
  const logged = loggedExerciseNames(lifts);
  const favorites = new Set(favoriteExercises.map(n => (n || '').toLowerCase()));
  // Bodyweight exercises excluded from normal selection — see
  // isBodyweightOnlyExercise in muscleTaxonomy.js for the exceptions
  // (travelMode, "Weighted X" variants, Russian Twist).
  // excludeNames: names already used elsewhere in the same session — see
  // generateSessionExercises' sessionExcludeNames for why this matters.
  const pool = EXERCISE_DB.filter(e =>
    !e.lesserKnown && !e.isometric &&
    !excludeNames.has(e.name) &&
    !(isBodyweightOnlyExercise(e) && !travelMode) &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    e.primary.some(m => targetMuscles.includes(m))
  );
  const scored = pool
    .map(e => ({
      e,
      score: weightedCoverage(e, targetMuscles)
        + (logged.has(e.name.toLowerCase()) ? LOGGED_EXERCISE_BONUS : 0)
        + (favorites.has(e.name.toLowerCase()) ? FAVORITE_EXERCISE_BONUS : 0)
        + stabilityScore(e, preferStable),
    }))
    .sort((a, b) => b.score - a.score);
  // Skip anything that's the same function as something already picked —
  // same pattern (press/row/curl/...) hitting an overlapping primary muscle
  // is a redundant pick (e.g. Barbell Overhead Press + Machine Shoulder
  // Press), not real variety. A different pattern on the same muscle (a
  // press plus an isolation raise) is fine and stays allowed.
  // Boundary checked BEFORE pushing, not after -- with count === 0 (used
  // when the athlete's isolation-only preference should skip backbone/
  // compound picking entirely, see functions/index.js's isolationLeaning),
  // checking after push would still return exactly one exercise (push,
  // THEN see out.length >= 0 is already true) instead of the intended [].
  //
  // Also skips anything that covers NO still-uncovered target muscle,
  // regardless of pattern -- the same-pattern guard above only catches a
  // redundant pick when the pattern literally matches (Overhead Press +
  // Shoulder Press), but a compound scoring purely on "how many target
  // muscles does this hit" (the score above) will happily stack two
  // DIFFERENT-pattern lifts that are functionally just as redundant --
  // Sumo Deadlift (hinge) then Box Squat (squat) both covering
  // glutes+hamstrings+quads is the real case this was found from. Once
  // every target muscle already has a backbone pick, count naturally goes
  // unfilled rather than force-adding a second lift for muscles already
  // covered -- fewer, more specific exercises over padding to a count.
  //
  // travelMode is the one exception: equipment is so scarce there that a
  // second bodyweight exercise on the same muscle (no real alternative
  // exists) IS the "very specific reason" the no-new-coverage rule is
  // meant to require, not a violation of it -- see Dead Bug + Ab Wheel
  // Rollout both landing on abs/transverse-abs with nothing else on offer.
  const out = [];
  const covered = new Set();
  for (const { e } of scored) {
    if (out.length >= count) break;
    if (out.some(o => o.name === e.name)) continue;
    if (out.some(o => redundancyPattern(o.pattern) === redundancyPattern(e.pattern) && e.primary.some(m => o.primary.includes(m)))) continue;
    if (!travelMode && !e.primary.some(m => targetMuscles.includes(m) && !covered.has(m))) continue;
    // isAngleFamily entries (functions/exerciseDb.js, e.g. "Cable Fly") get
    // a recommended angle attached for whichever target muscle this pick is
    // actually being credited for -- a shallow copy, never a mutation of
    // the shared EXERCISE_DB entry itself (that array is required once per
    // Cloud Functions instance and reused across requests; assigning onto
    // `e` directly would leak one athlete's angle into every other
    // concurrent/later request on the same warm instance).
    if (e.isAngleFamily) {
      const creditedMuscle = e.primary.find(m => targetMuscles.includes(m) && !covered.has(m)) || e.primary.find(m => targetMuscles.includes(m)) || e.primary[0];
      out.push({ ...e, angle: idealAngleForMuscle(e.pattern, creditedMuscle) });
    } else {
      out.push(e);
    }
    e.primary.forEach(m => covered.add(m));
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

// Self-declared "focus" muscle (Onboarding step 5 / db.profile.muscleFocus,
// editable later) — an explicit "I want extra frequency/volume here" signal
// the athlete gives directly, additive on top of the fatigue-freshness
// score same as stalenessBoost, so it nudges ranking without overriding a
// muscle that's still genuinely too fatigued to load (that's a hard -1
// exclusion below, a flat bonus can't undo it). "Ignore" is not handled
// here at all — it's folded into offlineMuscles by the caller (same hard
// exclusion as an injury), not a priority adjustment.
const FOCUS_MUSCLE_BONUS = 25;

// The mirror of FOCUS_MUSCLE_BONUS, and deliberately the same magnitude:
// "deprioritise" should push a muscle down exactly as hard as "priority" lifts
// one, and like the bonus it cannot override a hard exclusion.
//
// This is the distinction that makes the setting worth having. 'ignore'/'avoid'
// is a hard -1 that drops a muscle out of selection entirely, which is right
// for an injury or a medical restriction and wrong for "I don't care much
// about calves" — the latter still needs the muscle fully modelled, because it
// still accumulates fatigue from squats and running and still has to recover.
// Deprioritise keeps every bit of that physiology and only reduces how often
// the muscle is chosen for direct work.
const DEPRIORITISE_PENALTY = 25;

// Per-muscle priority: -1 means "do not load right now" (injured, ignored,
// or already at/over the fatigue ceiling); otherwise higher = fresher/more-
// overdue = more deserving of stimulus. Called live at guidance time and
// again at session-start time — never cached against a specific day, since
// fatigue moves session to session. muscleLastTrainedDays is optional (null
// skips the staleness boost entirely, e.g. for callers that don't have lift
// history handy) — passing it blends in atrophy-risk prioritization from
// computeMuscleLastTrainedDays (functions/fatigue.js).
function computeMusclePriority(currentFatigue, offlineMuscles, muscleLastTrainedDays = null, muscleFocus = {}) {
  const priority = {};
  for (const m of PRIMARY_MUSCLES) {
    if (offlineMuscles.includes(m)) { priority[m] = -1; continue; }
    const fatigue = currentFatigue[m] || 0;
    if (fatigue >= FATIGUE_CEILING) { priority[m] = -1; continue; }
    const boost = muscleLastTrainedDays ? stalenessBoost(muscleLastTrainedDays[m]) : 0;
    const focusAdjust = muscleFocus[m] === 'focus' ? FOCUS_MUSCLE_BONUS
      : muscleFocus[m] === 'deprioritise' ? -DEPRIORITISE_PENALTY : 0;
    // Clamped at 0 so a deprioritised muscle can never reach -1, which is the
    // sentinel for "do not load at all". Deprioritise ranks a muscle last; it
    // does not remove it. With fatigue below the ceiling the base term is
    // already > 50, so this clamp never fires today — it's here so the two
    // concepts can't collide if either constant is retuned later.
    priority[m] = Math.max(0, (100 - fatigue) + boost + focusAdjust);
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

// Which groups muscleFocus is bucketed into mirrors exactly what
// /plan/session-exercises' full-body auto-pick would actually give you next
// (functions/splitPlanner.js's SPLIT_GROUPS) — 'Full Body' (the default) has
// no fixed categories at all, so each muscle is its own single-muscle
// "bucket"; a named split (Push/Pull/Legs, Upper/Lower, ...) groups muscles
// the same way that split's session generation does. Displaying different
// groupings here than session generation actually uses is exactly the "home
// screen visually reads as a PPL+Core split even though it was never meant
// to be one" problem the splitPlanner.js rewrite fixed for session
// generation but not, until now, for this display.
function focusGroups(preferredSplit) {
  const named = SPLIT_GROUPS[preferredSplit];
  if (named) return named;
  return Object.fromEntries(PRIMARY_MUSCLES.map(m => [m, [m]]));
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
function generateWeeklyGuidance({ currentFatigue, weekMetabolic, weekCNS, offlineMuscles, dataMature, trainingPriority = 'strength', muscleLastTrainedDays = null, preferredSplit = 'Full Body', muscleFocus = {} }) {
  const priority = computeMusclePriority(currentFatigue || {}, offlineMuscles || [], muscleLastTrainedDays, muscleFocus);
  const groups = focusGroups(preferredSplit);

  const buckets = Object.entries(groups)
    .map(([name, muscles]) => {
      const scored = scoreBucket(muscles, priority);
      return scored ? { name, ...scored } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const liftSessionsTarget = planLiftSessionsTarget(weekCNS, weekMetabolic, buckets.length, trainingPriority);
  const cardioSessionsTarget = planCardioSessionsTarget(weekCNS, trainingPriority);
  const activeNames = new Set(buckets.map(b => b.name));
  const restingMuscleGroups = Object.keys(groups).filter(n => !activeNames.has(n));

  return {
    trainingPriority,
    liftSessionsTarget,
    cardioSessionsTarget,
    hiitRecommended: cardioSessionsTarget > 0,
    // freshness is the display figure and is clamped to 100; score is the raw
    // ranking value and is not. They diverge whenever the staleness/focus
    // boosts push a bucket past 100, which is common — anything comparing two
    // buckets (recommendation.js) has to use score, or three genuinely
    // different buckets all read as a dead heat at 100.
    muscleFocus: buckets.map(b => ({
      name: b.name,
      muscles: b.muscles,
      freshness: Math.min(100, Math.round(b.score)),
      score: Math.round(b.score * 10) / 10,
    })),
    restingMuscleGroups,
    rationale: guidanceRationale(liftSessionsTarget, cardioSessionsTarget, weekCNS, weekMetabolic, trainingPriority),
    dataMature,
  };
}

module.exports = {
  generateWeeklyGuidance, pickBackboneExercises, weightedCoverage, computeMusclePriority, scoreBucket, planLiftSessionsTarget, planCardioSessionsTarget,
  stalenessBoost, MUSCLE_GROUPS, FATIGUE_CEILING, SECONDARY_FATIGUE_CEILING, FOCUS_MUSCLE_BONUS, DEPRIORITISE_PENALTY, TRAINING_PRIORITIES,
  // Exported for recommendation.js: a bucket in muscleFocus only carries the
  // muscles that were *available*, so explaining why one is missing needs the
  // full membership this resolves.
  focusGroups,
};
