// When each muscle and the CNS come back, assuming no further training.
//
// This is an exact inversion of the decay the app already runs, not a new
// model. computeStructuralFatigue sums one exponential per lift:
//
//   score(m) = Σ load·ratio·exp(-ln2·hoursAgo/hl(m))
//
// Every term for a given muscle shares the same half-life — hl is per-muscle,
// not per-lift — so the whole sum decays at that one rate:
//
//   score(m, t+Δ) = exp(-ln2·Δ/hl(m)) · score(m, t)
//
// which inverts to Δ = hl·log2(current/target). computeCNSFatigue is the same
// shape with a fixed 36-hour half-life. So every number here is the shipped
// model read forwards; nothing is fitted or guessed.
//
// Three things genuinely limit it, all reported rather than hidden:
//   - `assumesNoTraining`: training again resets the clock. This is a decay
//     projection, not a prediction of what you'll do.
//   - `clamped`: computeStructuralFatigue caps its output at 100, so a muscle
//     reading exactly 100 may really be far above it. The forecast for those
//     is a floor — recovery takes at least this long, possibly longer.
//   - soreness inflates a muscle's score for 5 days and then stops. Where that
//     is active the projection is conservative: real recovery arrives sooner.
//
// One inherited quirk worth knowing. fatigue.js's liftTime is
// `new Date(l.start || l.date)`, and nothing in the app ever writes `start` —
// every lift carries a date only. So a session is modelled as having happened
// at 00:00 on its date, whatever time it actually finished. Decay from *now*
// is still continuous and exact (verified against computeStructuralFatigue at
// whole-day offsets), but the clock it decays from is midnight. An evening
// session therefore reads as ~18 hours older than it is, and this forecast is
// optimistic by the same margin on the day of training. Fixing that means
// recording a real timestamp at log time, not adjusting anything here.

const { RECOVERY_H } = require('./muscleTaxonomy');
const { FATIGUE_CEILING } = require('./weeklyPlanner');

// computeCNSFatigue's decay constant. Quoted rather than imported because it's
// a literal inside that function; if it moves, this is wrong.
const CNS_HALF_LIFE_H = 36;

// The two CNS thresholds the engine actually acts on — above 70 it swaps
// barbell compounds out and caps the week at 2 sessions, above 40 it caps at 3.
// See limitingFactor.js's header for the full threshold map.
const CNS_HEAVY_THRESHOLD = 70;
const CNS_CLEAR_THRESHOLD = 40;

const DEFAULT_HALF_LIFE_H = 72;

// Hours for an exponentially decaying value to fall from `current` to
// `target`, given a half-life. Returns 0 if it's already there.
function hoursToDecayTo(current, target, halfLifeH) {
  // Guard the non-numeric case explicitly. Falling through to the comparison
  // below would send NaN down the `already there` branch and report 0 hours —
  // "ready now" is the one answer a missing value must never produce.
  if (typeof current !== 'number' || Number.isNaN(current)) return null;
  if (!(target > 0) || !(halfLifeH > 0)) return null;
  if (current <= target) return 0;
  return (halfLifeH * Math.log(current / target)) / Math.LN2;
}

// Per-muscle projection back to a trainable level. `target` defaults to the
// planner's own fatigue ceiling, since that is the number that decides whether
// a muscle can be selected at all.
function forecastMuscleRecovery(currentFatigue = {}, {
  recoveryHours = RECOVERY_H, target = FATIGUE_CEILING,
} = {}) {
  return Object.entries(currentFatigue)
    .map(([muscle, fatigue]) => {
      const halfLifeH = recoveryHours[muscle] || RECOVERY_H[muscle] || DEFAULT_HALF_LIFE_H;
      // Decay from the uncapped score where one exists. A muscle whose real
      // load is 250% of its peak takes far longer to fall under the ceiling
      // than the 100 it displays as, and forecasting from the capped number
      // under-reports that wait by exactly the amount that matters most.
      // `_raw` is non-enumerable, so it never appears as a muscle here.
      const effective = currentFatigue._raw?.[muscle] ?? fatigue;
      const hoursUntilReady = hoursToDecayTo(effective, target, halfLifeH);
      return {
        muscle,
        fatigue,
        halfLifeH,
        target,
        // Kept consistent with hoursUntilReady: a value that can't be read is
        // neither ready nor on a clock, rather than quietly counting as ready.
        ready: typeof effective === 'number' && !Number.isNaN(effective) && effective <= target,
        hoursUntilReady,
        // The displayed `fatigue` is still capped; hoursUntilReady no longer is.
        clamped: fatigue >= 100,
      };
    })
    .sort((a, b) => (b.hoursUntilReady ?? 0) - (a.hoursUntilReady ?? 0));
}

// CNS returns to each of the two levels the engine changes behaviour at.
function forecastCNS(cnsFatigue) {
  if (typeof cnsFatigue !== 'number' || Number.isNaN(cnsFatigue)) return null;
  return {
    fatigue: cnsFatigue,
    halfLifeH: CNS_HALF_LIFE_H,
    // Below this, heavy barbell compounds stop being substituted out.
    hoursUntilHeavyTrainingAvailable: hoursToDecayTo(cnsFatigue, CNS_HEAVY_THRESHOLD, CNS_HALF_LIFE_H),
    // Below this, the week stops being capped at 3 lifting sessions.
    hoursUntilFullyClear: hoursToDecayTo(cnsFatigue, CNS_CLEAR_THRESHOLD, CNS_HALF_LIFE_H),
    clamped: cnsFatigue >= 100,
  };
}

// The whole picture, plus the soonest moment anything currently unavailable
// becomes trainable — which is the one figure worth putting on a dashboard.
function buildRecoveryForecast({ currentFatigue = {}, cnsFatigue = null, recoveryHours = RECOVERY_H } = {}) {
  const muscles = forecastMuscleRecovery(currentFatigue, { recoveryHours });
  const waiting = muscles.filter(m => !m.ready && m.hoursUntilReady != null);
  const nextReady = waiting.length
    ? waiting.reduce((soonest, m) => (m.hoursUntilReady < soonest.hoursUntilReady ? m : soonest))
    : null;

  return {
    muscles,
    cns: forecastCNS(cnsFatigue),
    // Named so a reader can't mistake this for a prediction of their week.
    assumesNoTraining: true,
    readyNow: muscles.filter(m => m.ready).map(m => m.muscle),
    nextReady: nextReady && { muscle: nextReady.muscle, hoursUntilReady: nextReady.hoursUntilReady },
    fullyRecoveredInH: waiting.length ? Math.max(...waiting.map(m => m.hoursUntilReady)) : 0,
  };
}

module.exports = {
  hoursToDecayTo, forecastMuscleRecovery, forecastCNS, buildRecoveryForecast,
  CNS_HALF_LIFE_H, CNS_HEAVY_THRESHOLD, CNS_CLEAR_THRESHOLD,
};
