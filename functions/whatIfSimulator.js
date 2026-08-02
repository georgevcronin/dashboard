// What a session would do to you, before you do it.
//
// Same rule as sessionVariants.js and recommendation.js, one step further: this
// module runs no model of its own. A candidate session is converted into the
// same lift records the logger would have written, appended to a copy of the
// history, and the shipped fatigue functions are re-run over it. Every number
// this returns is a difference between two readings taken with
// computeStructuralFatigue / computeCNSFatigue / computeMetabolicFatigue —
// the ones already on the dashboard — and every recovery hour comes from
// recoveryForecast.js, which is an exact inversion of that same decay.
//
// So the honest description of the output is "the dashboard, as it would read
// afterwards", not "a prediction". The distinction matters for what is
// deliberately absent: there is no predicted e1RM change, no percentage
// strength cost, no stimulus score. Press has never compared a prediction of
// that kind against a measured outcome, so those numbers would be decoration
// with a decimal point on them (see recommendation.js's header). Fatigue and
// recovery hours are different in kind — they are the model's own state read
// forwards, and a reader can check them tomorrow.
//
// Two things that took a wrong answer to find:
//
//   1. Peaks must be frozen at the baseline. computeStructuralFatigue divides
//      by musclePeaksFromLifts, which is the largest single-day load a muscle
//      has ever taken. A hard candidate session can BE that new peak, which
//      grows the denominator and drops the *baseline* fatigue reading too —
//      the comparison then quietly measures two states on two different
//      scales, and a heavier session can come out looking easier. Both sides
//      are scored against the same frozen peaks for this reason.
//
//   2. The candidate is simulated at `now`, not at midnight. fatigue.js's
//      liftTime reads `start || date`, and a lift carrying only a date is
//      modelled as having happened at 00:00 (see recoveryForecast.js's header
//      on this inherited quirk). Stamping `start` means "if I trained now"
//      really means now, instead of up to 24 hours ago.

const {
  computeStructuralFatigue, computeCNSFatigue, computeMetabolicFatigue,
  musclePeaksFromLifts,
} = require('./fatigue');
const { forecastMuscleRecovery, forecastCNS } = require('./recoveryForecast');
const { RECOVERY_H } = require('./muscleTaxonomy');
const { FATIGUE_CEILING } = require('./weeklyPlanner');

// A planned session (sessionPlanner.js's shape: [{ name, sets: [{type, kg,
// reps}] }]) as the lift rows the logger would write for it. Warmup sets are
// included and tagged 'W' exactly as the Hevy/manual ingest paths do — they
// carry real load, and computeStructuralFatigue counts them, so dropping them
// here would make every simulated session lighter than the same session
// actually logged.
function sessionToLifts(exercises, { at = Date.now() } = {}) {
  const start = new Date(at).toISOString();
  const date = start.slice(0, 10);
  const lifts = [];

  for (const ex of (exercises || [])) {
    const name = (ex.name || '').toLowerCase();
    if (!name) continue;
    for (const set of (ex.sets || [])) {
      const kg = +set.kg || 0;
      const reps = +set.reps || 0;
      if (kg <= 0 && reps <= 0) continue;
      const lift = { date, start, exercise: name, kg, reps, source: 'simulated' };
      if (set.type && set.type !== 'N') lift.type = set.type;
      // The planner attaches emgWeights to angle-family picks; creditedShares
      // prefers them over the curated lookup, so carrying them through is what
      // makes a 135-degree press attribute differently from a flat one.
      if (ex.emgWeights) lift.emgWeights = ex.emgWeights;
      lifts.push(lift);
    }
  }
  return lifts;
}

// One reading of every fatigue axis the dashboard shows, at fixed peaks.
function readState(lifts, { musclePeaks, soreness, sensitivity, recoveryHours, cnsSensitivity, recoveryScore, carbsToday }) {
  return {
    structural: computeStructuralFatigue(lifts, musclePeaks, soreness, sensitivity, recoveryHours),
    cns: computeCNSFatigue(lifts, cnsSensitivity, recoveryScore),
    metabolic: computeMetabolicFatigue(lifts, carbsToday),
  };
}

// Hours until a muscle is back under the planner's selection ceiling, keyed by
// muscle so the two states can be subtracted muscle by muscle.
function recoveryHoursByMuscle(structural, recoveryHours) {
  const out = {};
  for (const m of forecastMuscleRecovery(structural, { recoveryHours })) {
    out[m.muscle] = m.hoursUntilReady;
  }
  return out;
}

// The one figure worth putting at the top: when does everything currently over
// the ceiling come back. Null rather than 0 when nothing is over it, so "no
// wait" and "no data" stay distinguishable.
function fullyRecoveredInH(structural, recoveryHours) {
  const waiting = forecastMuscleRecovery(structural, { recoveryHours })
    .filter(m => !m.ready && m.hoursUntilReady != null);
  return waiting.length ? Math.max(...waiting.map(m => m.hoursUntilReady)) : 0;
}

const round1 = n => (typeof n === 'number' && !Number.isNaN(n) ? Math.round(n * 10) / 10 : null);

// Simulate one candidate session against the current history.
//
// `lifts` is never mutated — the candidate is appended to a new array, and
// nothing here writes to any object it was handed.
function simulateSession({
  lifts = [],
  exercises = [],
  soreness = [],
  sensitivity = {},
  recoveryHours = RECOVERY_H,
  cnsSensitivity = 1.0,
  recoveryScore = null,
  carbsToday = 0,
  at = Date.now(),
} = {}) {
  const history = [...(lifts || [])];
  const candidateLifts = sessionToLifts(exercises, { at });

  // Frozen for both readings — see note 1 in this file's header.
  const musclePeaks = musclePeaksFromLifts(history);
  const context = { musclePeaks, soreness, sensitivity, recoveryHours, cnsSensitivity, recoveryScore, carbsToday };

  const before = readState(history, context);
  const after = readState([...history, ...candidateLifts], context);

  const beforeHours = recoveryHoursByMuscle(before.structural, recoveryHours);
  const afterHours = recoveryHoursByMuscle(after.structural, recoveryHours);

  // Union: a muscle the session trains for the first time in two weeks has no
  // entry at all in the baseline, and is exactly the one worth reporting.
  const touched = [...new Set([
    ...Object.keys(before.structural),
    ...Object.keys(after.structural),
  ])];

  const muscles = touched
    .map(muscle => {
      const fatigueBefore = before.structural[muscle] || 0;
      const fatigueAfter = after.structural[muscle] || 0;
      const hoursBefore = beforeHours[muscle] ?? 0;
      const hoursAfter = afterHours[muscle] ?? 0;
      return {
        muscle,
        fatigueBefore,
        fatigueAfter,
        fatigueDelta: fatigueAfter - fatigueBefore,
        hoursBefore: round1(hoursBefore),
        hoursAfter: round1(hoursAfter),
        hoursDelta: round1(hoursAfter - hoursBefore),
        // Crossing the ceiling is the state change with a consequence: below
        // it the planner will select this muscle tomorrow, above it it won't.
        crossesCeiling: fatigueBefore < FATIGUE_CEILING && fatigueAfter >= FATIGUE_CEILING,
        // A muscle already pinned at the cap may be far above it, so its
        // "after" reading is a floor and its delta an understatement.
        clamped: fatigueAfter >= 100,
      };
    })
    .filter(m => m.fatigueDelta !== 0)
    .sort((a, b) => b.fatigueDelta - a.fatigueDelta);

  const recoveredBefore = fullyRecoveredInH(before.structural, recoveryHours);
  const recoveredAfter = fullyRecoveredInH(after.structural, recoveryHours);

  return {
    // Included so the interface can show what it is comparing against without
    // a second call that might read a different moment.
    before: {
      cns: before.cns,
      metabolic: before.metabolic,
      fullyRecoveredInH: round1(recoveredBefore),
      cnsForecast: forecastCNS(before.cns),
    },
    after: {
      cns: after.cns,
      metabolic: after.metabolic,
      fullyRecoveredInH: round1(recoveredAfter),
      cnsForecast: forecastCNS(after.cns),
    },
    cnsDelta: after.cns - before.cns,
    metabolicDelta: after.metabolic - before.metabolic,
    recoveryDelayH: round1(recoveredAfter - recoveredBefore),
    muscles,
    // Muscles this session pushes out of tomorrow's selection pool.
    newlyOverCeiling: muscles.filter(m => m.crossesCeiling).map(m => m.muscle),
    ceiling: FATIGUE_CEILING,
    // Same caveat recoveryForecast.js carries and for the same reason: these
    // hours assume nothing else is trained in the meantime.
    assumesNoTraining: true,
    setCount: candidateLifts.filter(l => l.type !== 'W').length,
    simulatedAt: new Date(at).toISOString(),
  };
}

// Compare several candidate sessions against one baseline — the sandbox's
// actual use, where the question is "which of these costs least".
function compareSessions({ lifts = [], candidates = [], ...context } = {}) {
  return (candidates || []).map(candidate => ({
    key: candidate.key,
    label: candidate.label,
    ...simulateSession({ lifts, exercises: candidate.exercises, ...context }),
  }));
}

module.exports = { simulateSession, compareSessions, sessionToLifts };
