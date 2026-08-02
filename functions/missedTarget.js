// Why a set missed its target, and what each answer is allowed to change.
//
// Press infers strength from logged performance. A set that came in well under
// its target is read as evidence about capability — but only some misses are
// about capability. A grip that slipped, a spotter who took the bar early, a
// twinge in a joint and a phone call mid-set all produce the same row in the
// database as a genuine failure, and all of them currently feed the same
// inference.
//
// The measured consequence, and the reason this module exists:
// computeProgression reads the most recent session's top set. A single missed
// top set drops that session's e1RM below the one before it, and if the last
// three sessions are non-increasing the trend becomes 'stalled' and the
// suggestion RESETS the working weight by two increments. On a 65kg cable row
// logged at 3 reps instead of 8, that is a 9kg deload caused by a grip slip.
//
// What this module does NOT claim to fix:
//
//   - muscleCapacity.js is already immune. buildObservations keeps only the
//     best e1RM per exercise+angle (`est > byKey[key].e1rm`), so a low
//     observation loses to the athlete's own best and can never pull a fitted
//     capacity down. Worth knowing before "protecting" it.
//   - There is no Bayesian update anywhere in this codebase, and no stored
//     posterior to intercept. muscleCapacity.js is a ridge-regularised batch
//     least-squares fit re-solved from history on demand. The risk is real;
//     the mechanism is ordinary.
//
// The one deliberate departure from the obvious design: **fatigue counts the
// work regardless of the reason.** It is tempting to discard an
// externally-disrupted set entirely, but those reps physically happened and
// their load was real. Dropping them would understate structural fatigue and
// could have Press recommend training a muscle it had just watched you train.
// A reason changes what Press infers about your *capability*, never what it
// believes about the *work done*.

// Fraction below target that counts as a miss worth asking about. Set on
// volume rather than reps alone so that dropping the weight and completing the
// reps is caught too. Below this, normal session-to-session variation would
// make the prompt fire constantly and it would be trained away as noise.
const MISS_THRESHOLD = 0.15;

// `capability` is the single switch that matters: whether this set is evidence
// about how strong the athlete is. Everything that infers strength
// (progression trend, strength standards, capacity fitting) must respect it.
const MISS_REASONS = [
  {
    key: 'failure',
    label: 'Muscle failure',
    hint: 'The target muscle gave out. This is real evidence.',
    capability: true,
    routesToInjury: false,
  },
  {
    key: 'technical',
    label: 'Form or grip gave out',
    hint: 'Grip slipped, form broke, the bar drifted — the muscle had more left.',
    capability: false,
    routesToInjury: false,
  },
  {
    key: 'pain',
    label: 'Pain or a twinge',
    hint: 'Stopped because something hurt.',
    capability: false,
    routesToInjury: true,
  },
  {
    key: 'external',
    label: 'Something interrupted it',
    hint: 'Spotter took it early, equipment problem, distraction.',
    capability: false,
    routesToInjury: false,
  },
];

const REASON_KEYS = MISS_REASONS.map(r => r.key);
const BY_KEY = Object.fromEntries(MISS_REASONS.map(r => [r.key, r]));

function isMissReason(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BY_KEY, value);
}

// An unrecognised or absent reason means "no reason was given", which has to
// behave exactly like an ordinary logged set — the set counts as capability
// evidence. Silently dropping unlabelled sets would rewrite the meaning of
// every set logged before this feature existed.
function countsAsCapability(reason) {
  return !isMissReason(reason) || BY_KEY[reason].capability;
}

function routesToInjury(reason) {
  return isMissReason(reason) && BY_KEY[reason].routesToInjury;
}

const volumeOf = (kg, reps) => (Number(kg) || 0) * (Number(reps) || 0);

// How far under target a set landed, as a fraction of the target, on whichever
// axis fell furthest. Returns null when there is no usable target to compare
// against — a freestyle set has nothing to miss.
function missShortfall({ actualKg, actualReps, targetKg, targetReps } = {}) {
  const tKg = Number(targetKg) || 0;
  const tReps = Number(targetReps) || 0;
  if (tKg <= 0 || tReps <= 0) return null;

  const targetVolume = volumeOf(tKg, tReps);
  const actualVolume = volumeOf(actualKg, actualReps);
  if (targetVolume <= 0) return null;

  const volumeShort = (targetVolume - actualVolume) / targetVolume;
  const loadShort = (tKg - (Number(actualKg) || 0)) / tKg;
  // Exceeding the target is not a miss; clamp so an overshoot reads as 0
  // rather than a negative that could sort oddly.
  return Math.max(0, volumeShort, loadShort);
}

function isSignificantMiss(set, { threshold = MISS_THRESHOLD } = {}) {
  const shortfall = missShortfall(set);
  return shortfall != null && shortfall >= threshold;
}

// Sets whose reason says they are not capability evidence, removed. Used by
// anything inferring strength; NOT used by fatigue, which counts the work.
function excludeNonCapabilitySets(lifts) {
  return (lifts || []).filter(l => countsAsCapability(l?.missReason));
}

// Everything a caller needs to decide what to do with one logged set, in one
// place, so the prompt and the engine can't disagree about what a reason means.
function interpretMiss({ set, reason } = {}) {
  const shortfall = missShortfall(set);
  return {
    shortfall,
    significant: shortfall != null && shortfall >= MISS_THRESHOLD,
    reason: isMissReason(reason) ? reason : null,
    countsForCapability: countsAsCapability(reason),
    // Always true, for every reason. See this file's header — the reps
    // happened, so the load is real whatever caused the set to end.
    countsForFatigue: true,
    routesToInjury: routesToInjury(reason),
  };
}

module.exports = {
  MISS_THRESHOLD, MISS_REASONS, REASON_KEYS,
  isMissReason, countsAsCapability, routesToInjury,
  missShortfall, isSignificantMiss, excludeNonCapabilitySets, interpretMiss,
};
