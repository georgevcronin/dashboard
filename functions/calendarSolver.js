// Phase 5 "Plan Ahead" — day-by-day calendar solver.
//
// No new fatigue math. Each day reuses exactly what /plan/session-exercises
// already uses for "what's my next session" (autoPickFullBodySession.js,
// which is itself the no-bucket branch of that endpoint pulled out so both
// places share one implementation), then simulateSession (whatIfSimulator.js)
// for the before/after reading. The only genuinely new piece is the loop
// that chains these across a window, plus applying calendar constraints and
// the day-of-week split anchor.
//
// TIME-SHIFT TRICK, not a new `now` parameter threaded through fatigue.js:
// computeStructuralFatigue/computeCNSFatigue/computeMetabolicFatigue/
// musclePeaksFromLifts/computeMuscleLastTrainedDays/applyInjuryTaper all read
// `Date.now()` internally (verified — none accept a reference-time override),
// and computeStructuralFatigue explicitly SKIPS any lift with negative
// hoursAgo (`if (hoursAgo > 336 || hoursAgo < 0) continue`), so a future-
// dated candidate lift would silently contribute zero fatigue if evaluated
// against the real wall clock. Rather than touch that canonical, exhaustively
// tested module (CLAUDE.md/ARCHITECTURE.md both flag it as deliberately
// fragile to "fix" naively), every lift/soreness/injury timestamp is shifted
// by a fixed offset before being handed to these functions, so that
// evaluating "as of target day T" against the shifted data is mathematically
// identical to evaluating "as of real now" — same trick test frameworks use
// for fake clocks, done here by shifting the data instead of the clock.
//
// Stored plan vs. live: nothing here is persisted. TRAINING_ETHOS.md is
// explicit that this is autoregulated session-to-session, never a locked
// program — the calendar is recomputed fresh from real fatigue on every
// request, same as /plan/recommendation already does for a single day. Only
// durable *preferences* (calendarWindows, unavailableDaysOfWeek,
// availableDaysOfWeek, splitDayAnchors, weeklySessionTarget) are ever stored.
const {
  computeStructuralFatigue, computeMetabolicFatigue, computeCNSFatigue,
  musclePeaksFromLifts, applyInjuryTaper, computeMuscleLastTrainedDays,
  computeCompoundIsolationSplit,
} = require('./fatigue');
const { autoPickFullBodySession } = require('./autoPick');
const { simulateSession, sessionToLifts } = require('./whatIfSimulator');
const { FATIGUE_CEILING, SECONDARY_FATIGUE_CEILING, generateWeeklyGuidance } = require('./weeklyPlanner');
const { computeDataMaturity } = require('./analytics');

const DAY_MS = 86_400_000;

function shiftLifts(lifts, shiftMs) {
  if (!shiftMs) return lifts || [];
  return (lifts || []).map(l => {
    const shifted = { ...l };
    if (l.start) shifted.start = new Date(new Date(l.start).getTime() + shiftMs).toISOString();
    if (l.date) shifted.date = new Date(new Date(l.date).getTime() + shiftMs).toISOString().slice(0, 10);
    return shifted;
  });
}
function shiftTs(entries, shiftMs) {
  if (!shiftMs) return entries || [];
  return (entries || []).map(e => ({ ...e, ts: (e.ts || 0) + shiftMs }));
}

function ymd(date) { return date.toISOString().slice(0, 10); }

// Which constraint (if any) applies to this calendar date. busyDates:
// ['YYYY-MM-DD', ...] — one-off, quick-marked straight from the Plan Ahead
// panel itself (a single busy day, no equipment/reason detail). calendarWindows:
// [{ start, end, level: 'rest'|'bodyweight'|'restricted', equipment, reason }]
// (inclusive YYYY-MM-DD range) — one-off, e.g. a holiday, set from Settings.
// unavailableDaysOfWeek: [0-6] (Date#getDay convention, 0=Sunday) — recurring,
// indefinite blackout. availableDaysOfWeek: [0-6], the inverse shape — an
// allow-list ("I only ever train Mon/Wed/Fri"); empty means no allow-list is
// set, i.e. no restriction.
function constraintForDate(date, { busyDates = [], calendarWindows = [], unavailableDaysOfWeek = [], availableDaysOfWeek = [] } = {}) {
  const dstr = ymd(date);
  if ((busyDates || []).includes(dstr)) return { level: 'rest', equipment: null, reason: 'Marked busy' };
  const window = (calendarWindows || []).find(w => dstr >= w.start && dstr <= w.end);
  if (window) return { level: window.level, equipment: window.equipment || null, reason: window.reason || null };
  if ((unavailableDaysOfWeek || []).includes(date.getDay())) return { level: 'rest', equipment: null, reason: 'Recurring day off' };
  if ((availableDaysOfWeek || []).length && !availableDaysOfWeek.includes(date.getDay())) return { level: 'rest', equipment: null, reason: 'Not a training day' };
  return null;
}

// Monday-aligned, matching analytics.js's weekLiftSessionsCompleted — so a
// week target/count computed here agrees with the "sessions this week"
// figure MicroWidgets.jsx's VolumePaceWidget already shows for real history.
function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Real signal from simulateSession's own output, not a fabricated score —
// crossing FATIGUE_CEILING is the exact state change the planner itself acts
// on tomorrow (see whatIfSimulator.js's newlyOverCeiling).
function readinessFor(sim) {
  if (!sim) return 'red';
  return sim.newlyOverCeiling.length > 0 ? 'amber' : 'green';
}

function solveCalendarWindow({
  lifts = [], soreness = [], sensitivity = {}, recoveryHours, cnsSensitivity = 1.0,
  recoveryScore = null, carbsToday = 0, injuries = [], muscleFocus = {},
  preferredSplit = 'Full Body', travelMode = false, favoriteExercises = [],
  trainingMonths = null, preferStable = false, maxDurationMin = null, warmupScheme = null,
  compoundIsolationPreference = null, equipmentAvailable = null,
  calendarWindows = [], unavailableDaysOfWeek = [], availableDaysOfWeek = [], splitDayAnchors = {}, busyDates = [],
  // Per-day duration override — { 'YYYY-MM-DD': minutes }, quick-set from the
  // Plan Ahead panel ("only have 30 min Thursday"). Falls back to the global
  // maxDurationMin (profile.maxSessionDurationMin) for any date not listed.
  dayDurationOverrides = {},
  // Manual override for "how many lift sessions this week" — when null, each
  // Monday-aligned week auto-computes its own target the same way
  // generateWeeklyGuidance already does for the (now-retired) advisory block,
  // from that week's own simulated CNS/metabolic load. Without this, the
  // solver would greedily book a session every single day fatigue allowed,
  // which contradicts TRAINING_ETHOS.md's "2-4x/week" autoregulated stance.
  weeklySessionTarget = null, trainingDaysPerWeek = 4, activities = [],
  days = 7, startMs = null,
}) {
  const start = startMs != null ? new Date(startMs) : new Date();
  start.setHours(0, 0, 0, 0);
  const startStr = ymd(start);

  let history = [...lifts];
  const out = [];
  let weekMondayStr = null, weekTarget = null, weekSessionCount = 0, weekLastSessionDate = null;

  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    const constraint = constraintForDate(date, { busyDates, calendarWindows, unavailableDaysOfWeek, availableDaysOfWeek });

    if (constraint?.level === 'rest') {
      out.push({ date: ymd(date), type: 'rest', reason: constraint.reason || 'Marked unavailable', readiness: 'red' });
      continue;
    }

    const dayMondayStr = ymd(mondayOf(date));
    if (dayMondayStr !== weekMondayStr) {
      weekMondayStr = dayMondayStr;
      // Seed with real sessions already logged this week before the window
      // starts (e.g. window starts mid-week) — 0 for any week that starts
      // at/after the window itself, since there's no real history there yet.
      const priorDatesThisWeek = (lifts || []).filter(l => l.date >= dayMondayStr && l.date < startStr).map(l => l.date);
      weekSessionCount = new Set(priorDatesThisWeek).size;
      weekLastSessionDate = priorDatesThisWeek.length
        ? new Date(Math.max(...priorDatesThisWeek.map(d => new Date(d).getTime())))
        : null;
      weekTarget = null;
    }

    // shiftMs is negative for a future date — see header note.
    const shiftMs = Date.now() - date.getTime();
    const shiftedHistory = shiftLifts(history, shiftMs);
    const shiftedSoreness = shiftTs(soreness, shiftMs);
    const shiftedInjuries = shiftTs(injuries, shiftMs).filter(inj => !inj.resolved);

    const peaks = musclePeaksFromLifts(shiftedHistory);
    const structural = computeStructuralFatigue(shiftedHistory, peaks, shiftedSoreness, sensitivity, recoveryHours);
    const currentFatigue = applyInjuryTaper(structural, shiftedInjuries);
    const metabolicFatigue = computeMetabolicFatigue(shiftedHistory, carbsToday);
    const cnsFatigue = computeCNSFatigue(shiftedHistory, cnsSensitivity, recoveryScore);
    const muscleLastTrainedDays = computeMuscleLastTrainedDays(shiftedHistory);

    const avoidMuscles = Object.entries(currentFatigue).filter(([, v]) => v > FATIGUE_CEILING).map(([m]) => m);
    const avoidMusclesSecondary = Object.entries(currentFatigue).filter(([, v]) => v > SECONDARY_FATIGUE_CEILING).map(([m]) => m);
    // Same derivation as functions/index.js's sessionPlanContext(): an
    // injury-caused exclusion goes fully offline (never targeted, never a
    // primary muscle in any pick); a self-declared 'ignore' focus does too,
    // unconditionally. Plain fatigue alone does not — that's what
    // avoidMuscles/avoidMusclesSecondary are for.
    const ignoredMuscles = Object.entries(muscleFocus).filter(([, v]) => v === 'ignore').map(([m]) => m);
    const offlineMuscles = [...new Set([
      ...avoidMuscles.filter(m => shiftedInjuries.some(inj => (inj.muscles || []).includes(m))),
      ...ignoredMuscles,
    ])];

    if (weekTarget == null) {
      weekTarget = weeklySessionTarget != null ? weeklySessionTarget : generateWeeklyGuidance({
        currentFatigue, weekMetabolic: metabolicFatigue, weekCNS: cnsFatigue, offlineMuscles,
        dataMature: computeDataMaturity(shiftedHistory).hasEnoughData, trainingDaysPerWeek, activities,
        muscleLastTrainedDays, preferredSplit, muscleFocus,
      }).liftSessionsTarget;
    }
    // Rolling trailing-7-day cap alongside the Monday-week cap above — two
    // adjacent weeks' quotas can't stack into a run of training days with no
    // rest between them (e.g. window starts Thursday: cap for Thu-Sun plus a
    // fresh cap for the following Mon-Wed can otherwise cover all 7 visible
    // days). Reads `history`, not the raw `lifts` param, since it must also
    // see sessions the solver itself already scheduled earlier in this loop.
    const trailing7Start = date.getTime() - 7 * DAY_MS;
    const trailing7SessionCount = new Set(
      (history || []).filter(l => {
        const t = new Date(l.date).getTime();
        return t >= trailing7Start && t < date.getTime();
      }).map(l => l.date)
    ).size;
    if (weekSessionCount >= weekTarget || trailing7SessionCount >= weekTarget) {
      // A planned recovery day, not an unavailability — 'green' (not 'red',
      // which marks days the athlete can't train at all) since hitting the
      // weekly target is the goal working as intended.
      out.push({ date: ymd(date), type: 'rest', reason: 'Weekly session target reached', readiness: 'green' });
      continue;
    }

    // Even pacing: without this, every fresh day gets booked greedily, so
    // the week's sessions front-load into a Mon-Thu block and every rest day
    // gets pushed to the weekend. Space sessions ~(7 / weekTarget) days
    // apart instead — skip today only while enough of the week remains to
    // still hit weekTarget at that slower pace; once it can't
    // (sessionsNeeded >= daysRemainingInWeek), pacing yields to catch-up
    // training, same as the trailing-7 cap above already yields for it.
    const dowIndex = (date.getDay() + 6) % 7; // 0=Monday .. 6=Sunday
    const daysRemainingInWeek = 7 - dowIndex;
    const sessionsNeeded = weekTarget - weekSessionCount;
    if (weekLastSessionDate && weekTarget > 0 && sessionsNeeded < daysRemainingInWeek) {
      const minGapDays = Math.round(7 / weekTarget);
      const gapDays = Math.round((date.getTime() - weekLastSessionDate.getTime()) / DAY_MS);
      if (gapDays < minGapDays) {
        out.push({ date: ymd(date), type: 'rest', reason: 'Pacing sessions across the week', readiness: 'green' });
        continue;
      }
    }

    const dayTravelMode = constraint?.level === 'bodyweight' || travelMode;
    const dayEquipment = constraint?.level === 'restricted' ? constraint.equipment : equipmentAvailable;

    const dow = date.getDay();
    // Array.isArray guard: pre-multi-day accounts stored a single integer
    // per bucket, not an array — accept both shapes rather than migrating.
    const preferredBucket = Object.entries(splitDayAnchors)
      .find(([, days]) => (Array.isArray(days) ? days : [days]).includes(dow))?.[0] || null;

    const dayMaxDuration = dayDurationOverrides[ymd(date)] ?? maxDurationMin;

    const picked = autoPickFullBodySession({
      lifts: shiftedHistory, currentFatigue, offlineMuscles, muscleFocus, muscleLastTrainedDays,
      preferredSplit, travelMode: dayTravelMode, favoriteExercises, avoidMuscles, avoidMusclesSecondary,
      cnsFatigue, metabolicFatigue, trainingMonths, preferStable, maxDurationMin: dayMaxDuration, warmupScheme,
      compoundIsolationSplit: computeCompoundIsolationSplit(shiftedHistory),
      compoundIsolationPreference, equipmentAvailable: dayEquipment, preferredBucket,
    });

    if (!picked.exercises.length) {
      out.push({
        date: ymd(date), type: 'rest', reason: 'No fresh muscle group available', readiness: 'red',
        splitBucket: picked.splitBucket, bucketConflict: picked.bucketConflict,
      });
      continue;
    }

    const sim = simulateSession({
      lifts: shiftedHistory, exercises: picked.exercises, soreness: shiftedSoreness, sensitivity,
      recoveryHours, cnsSensitivity, recoveryScore, carbsToday,
    });

    out.push({
      date: ymd(date), type: 'session', readiness: readinessFor(sim),
      bucket: picked.splitBucket || picked.bucket, bucketConflict: picked.bucketConflict,
      targetMuscles: picked.targetMuscles, exercises: picked.exercises,
      estimatedDurationMin: picked.estimatedDurationMin,
      constraint: constraint?.level || null,
      simulated: sim,
    });
    weekSessionCount++;
    weekLastSessionDate = date;

    // Real future timestamps this time (unshifted) — the next iteration
    // re-derives its own shift relative to its own target day, so history
    // always stays in true wall-clock coordinates between iterations.
    history = [...history, ...sessionToLifts(picked.exercises, { at: date.getTime() })];
  }

  return {
    days: out,
    // Same caveat simulateSession/recoveryForecast already carry — every
    // day past the first assumes nothing unplanned happens in between.
    assumesNoTraining: true,
  };
}

module.exports = { solveCalendarWindow, constraintForDate };
