// The full-body auto-generator's actual picking logic, extracted from
// /plan/session-exercises' no-bucket branch so the calendar solver
// (calendarSolver.js) can run the exact same "what would this athlete's
// next session be" logic against a simulated future day instead of only
// against live `db` state — see MASTER_IMPLEMENTATION_PLAN.md's Phase 5
// ground rule against parallel implementations. Pure: every input is a
// parameter, nothing here reads `db` or the wall clock directly, so a
// caller can feed it today's real numbers or a time-shifted future day's.
const { SPLIT_GROUPS, rankMusclesByFreshness, typicalSessionMuscleCount, mostOverdueGroup, neglectedMuscles } = require('./splitPlanner');
const { computeMusclePriority, pickBackboneExercises, deprioritisedMusclesFrom } = require('./weeklyPlanner');
const { generateSessionExercises, capSessionDuration, fillSessionToDuration, fatigueCeilingFor, estimateSessionDurationMin } = require('./sessionPlanner');

function autoPickFullBodySession({
  lifts, currentFatigue, offlineMuscles, muscleFocus, muscleLastTrainedDays,
  preferredSplit, travelMode, favoriteExercises, avoidMuscles, avoidMusclesSecondary,
  cnsFatigue, metabolicFatigue, trainingMonths, preferStable, maxDurationMin = null,
  warmupScheme, compoundIsolationSplit, compoundIsolationPreference = null,
  equipmentAvailable = null,
  // Soft preference only (calendarSolver.js's day-of-week split anchor) —
  // honored when the named bucket actually has something fresh enough to
  // train, otherwise falls back to the normal most-overdue-group pick and
  // reports the conflict rather than forcing a fatigued muscle through
  // (TRAINING_ETHOS.md: autoregulated, never a rigid template).
  preferredBucket = null,
}) {
  const priority = computeMusclePriority(currentFatigue, offlineMuscles, muscleLastTrainedDays, muscleFocus);
  // Derived here (not threaded in as its own param) so both callers of this
  // function -- functions/index.js's full-body auto-pick and
  // calendarSolver.js's Plan Ahead, which already pass muscleFocus through
  // for computeMusclePriority above -- get the secondary-only exclusion for
  // Low muscles for free, with no separate wiring needed at either call site.
  const deprioritisedMuscles = deprioritisedMusclesFrom(muscleFocus);

  let musclePicks, splitBucket = null, bucketConflict = null;
  if (preferredSplit === 'Full Body' || !SPLIT_GROUPS[preferredSplit]) {
    musclePicks = rankMusclesByFreshness(priority).slice(0, typicalSessionMuscleCount(lifts));
  } else {
    const groups = SPLIT_GROUPS[preferredSplit];
    const anchoredAvail = preferredBucket && groups[preferredBucket]
      ? groups[preferredBucket].filter(m => priority[m] >= 0)
      : [];
    if (anchoredAvail.length) {
      musclePicks = anchoredAvail;
      splitBucket = preferredBucket;
    } else {
      const group = mostOverdueGroup(groups, muscleLastTrainedDays);
      musclePicks = group.muscles.filter(m => priority[m] >= 0);
      splitBucket = group.name;
      if (preferredBucket && preferredBucket !== group.name) bucketConflict = preferredBucket;
    }
  }

  const neglected = neglectedMuscles(preferredSplit, muscleLastTrainedDays);
  if (!musclePicks.length) {
    return { exercises: [], targetMuscles: [], bucket: null, splitBucket, bucketConflict, preferredSplit, neglectedMuscles: neglected, estimatedDurationMin: 0, fatigueCeiling: fatigueCeilingFor(metabolicFatigue) };
  }

  const autoIsolationLeaning = compoundIsolationSplit.isolation > compoundIsolationSplit.compound;
  const isolationLeaning = compoundIsolationPreference
    ? compoundIsolationPreference === 'isolation'
    : autoIsolationLeaning;
  const backboneCount = isolationLeaning ? 0 : Math.max(2, Math.ceil(musclePicks.length / 2));
  const backbone = pickBackboneExercises(musclePicks, { travelMode, lifts, favoriteExercises, count: backboneCount, preferStable, equipmentAvailable, deprioritisedMuscles });
  const coveredMuscles = new Set(backbone.flatMap(e => e.primary));
  const uncoveredCount = musclePicks.filter(m => !coveredMuscles.has(m)).length;

  const exercises = fillSessionToDuration(capSessionDuration(generateSessionExercises({
    type: 'lift', targetMuscles: musclePicks, backboneExerciseNames: backbone.map(e => e.name), lifts, travelMode,
    avoidMuscles, avoidMusclesSecondary, offlineMuscles, cnsFatigue, metabolicFatigue, trainingMonths, favoriteExercises,
    accessoryCountOverride: uncoveredCount, isolationOnly: isolationLeaning, warmupScheme,
    maxDurationMin, preferStable, equipmentAvailable, deprioritisedMuscles,
  }), currentFatigue, maxDurationMin), maxDurationMin, fatigueCeilingFor(metabolicFatigue));

  return {
    exercises, targetMuscles: musclePicks, bucket: 'full body', splitBucket, bucketConflict, preferredSplit,
    neglectedMuscles: neglected,
    estimatedDurationMin: estimateSessionDurationMin(exercises),
    fatigueCeiling: fatigueCeilingFor(metabolicFatigue),
  };
}

module.exports = { autoPickFullBodySession };
