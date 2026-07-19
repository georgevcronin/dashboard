// Deterministic single-session exercise generator — the counterpart to
// weeklyPlanner.js's day structure, but for filling in one lift day's actual
// exercise list and set/rep/weight scheme. No LLM: exercise selection is
// muscle-coverage scoring over EXERCISE_DB, and every number comes straight
// out of computeProgression's double-progression math.

const { EXERCISE_DB } = require('./exerciseDb');
const { computeProgression } = require('./progression');
const { isCompoundExercise, loggedExerciseNames } = require('./muscleTaxonomy');

// Same reasoning/magnitude as weeklyPlanner.js's LOGGED_EXERCISE_BONUS — a
// heavy preference for whatever the athlete has actually done before,
// dominating the small (0-8 point) muscle-coverage score below rather than
// just nudging it.
const LOGGED_EXERCISE_BONUS = 40;
// Same reasoning as weeklyPlanner.js's FAVORITE_EXERCISE_BONUS — a
// self-reported favorite is a real anchor for a brand-new account, smaller
// than a demonstrated logged-history bonus.
const FAVORITE_EXERCISE_BONUS = 15;
// Disincentives, not hard exclusions — obscure/isometric exercises can still
// win if they're genuinely the only thing covering a required muscle, but
// lose to almost anything else. ISOMETRIC_PENALTY is the larger of the two:
// mechanical tension through a full, progressively-loadable ROM is the
// primary driver of strength stimulus, so a static hold (Plank, Pallof
// Press, ...) is disincentivized harder than a merely-novel exercise.
const OBSCURE_PENALTY = 8;
const ISOMETRIC_PENALTY = 15;

// Free-weight/barbell-style compounds carry the highest CNS demand — when CNS
// fatigue is high, swap them for a machine/cable exercise hitting the same
// primary muscles, since those let effort go high without technical
// breakdown becoming the limiter (the same reasoning the training ethos gives
// for preferring stable movements generally, just triggered here by fatigue).
const HIGH_CNS_EQUIPMENT = ['barbell', 'smith', 'dumbbell'];
const LOW_CNS_EQUIPMENT = ['machine', 'cable'];

function substituteForCNS(entry, avoidMuscles) {
  if (!HIGH_CNS_EQUIPMENT.includes(entry.equipment)) return entry;
  const candidates = EXERCISE_DB
    .filter(e => LOW_CNS_EQUIPMENT.includes(e.equipment) && !e.primary.some(m => avoidMuscles.includes(m)))
    .map(e => ({ e, score: e.primary.filter(m => entry.primary.includes(m)).length }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.e || entry;
}

// A "staple" — logged often enough that it's clearly a standing fixture of
// the athlete's own routine, not a one-off — is protected from the variety
// rotation below. 10 distinct session dates is a deliberately high bar
// (~2-3 months of weekly use, or less for a higher-frequency muscle) so this
// only protects genuine long-term staples, not anything merely logged a
// handful of times recently.
const STAPLE_SESSION_THRESHOLD = 10;
function isStapleExercise(lifts, name) {
  return exerciseSessionCount(lifts, name) >= STAPLE_SESSION_THRESHOLD;
}

// Exercise rotation (experiment mode, axis 1): finds whichever exercise was
// logged most recently that primarily hits this muscle bucket, so the
// accessory picker below can avoid repeating it. Backbone exercises are
// deliberately excluded from consideration here (via excludeNames) — the
// ethos is to stick with a backbone lift as long as double progression keeps
// working, only rotating it out once progress stalls, so rotation only
// applies to the accessory slot, which exists precisely to add variety.
// Staples (isStapleExercise) are skipped here too — a genuinely regular
// fixture of the athlete's own routine shouldn't get rotated away from just
// because it was also what they did last time; it's supposed to keep
// showing up.
function lastAccessoryPick(lifts, targetMuscles, excludeNames) {
  const excludeLower = new Set([...excludeNames].map(n => n.toLowerCase()));
  const dates = [...new Set((lifts || []).map(l => l.date))].sort().reverse();
  for (const date of dates) {
    const dayExercises = [...new Set(lifts.filter(l => l.date === date).map(l => l.exercise).filter(Boolean))];
    const match = dayExercises.find(name => {
      if (excludeLower.has(name.toLowerCase())) return false;
      if (isStapleExercise(lifts, name)) return false;
      const entry = EXERCISE_DB.find(e => e.name.toLowerCase() === name.toLowerCase());
      return entry && entry.primary.some(m => targetMuscles.includes(m));
    });
    if (match) return match.toLowerCase();
  }
  return null;
}

// Fills in exercises for muscles the backbone picks don't already cover.
// Unlike the weekly planner's backbone selection, this includes lesserKnown
// (novel/accessory) variations and isometric holds as candidates — appropriate
// here since the compound-first requirement was already satisfied by the
// backbone lifts passed in — but both are heavily disincentivized in scoring
// (OBSCURE_PENALTY, ISOMETRIC_PENALTY) and previously-logged exercises are
// heavily preferred (LOGGED_EXERCISE_BONUS), so they only actually get picked
// when nothing better covers a required muscle.
// excludeNames covers both the final (possibly CNS-substituted) backbone
// picks AND their pre-substitution originals — otherwise a barbell exercise
// swapped out for being too CNS-taxing can wander back in as an "accessory"
// since it's no longer in the final backbone list. avoidNames is the
// rotation list from lastAccessoryPick — excluded unless doing so would
// leave zero candidates (a muscle with exactly one viable exercise shouldn't
// get artificially starved just to satisfy rotation).
function pickAccessories(targetMuscles, alreadySelected, excludeNames, avoidMuscles, { travelMode, avoidEquipment = [], avoidNames = [], count, isolationOnly = false, lifts, favoriteExercises = [] }) {
  const coveredMuscles = new Set(alreadySelected.flatMap(e => e.primary));
  const remainingMuscles = targetMuscles.filter(m => !coveredMuscles.has(m));
  // Same-function guard: skip anything sharing both pattern and an
  // overlapping primary muscle with something already selected (backbone or
  // an earlier accessory pick) — e.g. a press backbone plus a press
  // accessory for the same muscle is redundant, but a press backbone plus
  // an isolation raise accessory is genuinely different work and stays
  // allowed.
  const isRedundant = e => !isStapleExercise(lifts, e.name) &&
    alreadySelected.some(a => a.pattern === e.pattern && e.primary.some(m => a.primary.includes(m)));
  const basePool = EXERCISE_DB.filter(e =>
    !excludeNames.has(e.name) &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    !avoidEquipment.includes(e.equipment) &&
    !e.primary.some(m => avoidMuscles.includes(m)) &&
    e.primary.some(m => targetMuscles.includes(m)) &&
    !isRedundant(e)
  );
  // isolationOnly: used by the full-body auto-pick path when the athlete's
  // own 90-day history leans isolation (fatigue.js's
  // computeCompoundIsolationSplit) — falls back to the unfiltered pool
  // rather than returning nothing if a muscle genuinely has no isolation
  // exercise available.
  const typePool = isolationOnly ? basePool.filter(e => !isCompoundExercise(e.name)) : basePool;
  const scopedPool = typePool.length ? typePool : basePool;
  const rotatedPool = avoidNames.length ? scopedPool.filter(e => !avoidNames.includes(e.name.toLowerCase())) : scopedPool;
  const pool = rotatedPool.length ? rotatedPool : scopedPool;
  const logged = loggedExerciseNames(lifts);
  const favorites = new Set(favoriteExercises.map(n => (n || '').toLowerCase()));
  const scored = pool
    .map(e => ({
      e,
      score: e.primary.filter(m => remainingMuscles.includes(m)).length * 2 + e.primary.filter(m => targetMuscles.includes(m)).length
        + (logged.has(e.name.toLowerCase()) ? LOGGED_EXERCISE_BONUS : 0)
        + (favorites.has(e.name.toLowerCase()) ? FAVORITE_EXERCISE_BONUS : 0)
        - (e.lesserKnown ? OBSCURE_PENALTY : 0)
        - (e.isometric ? ISOMETRIC_PENALTY : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const out = [];
  for (const { e } of scored) {
    if (out.length >= count) break;
    out.push(e);
  }
  return out;
}

// Case-insensitive wrapper around computeProgression: EXERCISE_DB uses Title
// Case canonical names, but logged history can be lowercase (Hevy imports
// lowercase on ingest) or otherwise differently cased. Normalizes matching
// history onto the canonical name so computeProgression's internal exact
// match still works, without changing its contract for other callers.
function progressionFor(lifts, canonicalName) {
  const lower = canonicalName.toLowerCase();
  const matching = (lifts || [])
    .filter(l => (l.exercise || '').toLowerCase() === lower)
    .map(l => ({ ...l, exercise: canonicalName }));
  if (!matching.length) return null;
  return computeProgression(matching, canonicalName);
}

function exerciseSessionCount(lifts, name) {
  const lower = name.toLowerCase();
  return new Set((lifts || []).filter(l => (l.exercise || '').toLowerCase() === lower).map(l => l.date)).size;
}

// Exercise rotation (experiment mode, axis 1) picks *what*; this picks *how
// much* — cycling working-set count 2 -> 3 -> 4 -> 2... independently per
// exercise, based on how many times that specific exercise has been logged.
// Independent-per-exercise is deliberate: the goal is isolating one variable
// (volume) per movement, not changing the whole session's volume in
// lockstep, so two exercises in the same session can land on different
// counts. Bounded to ceiling+1 as a small, deliberate overshoot probe of
// whether the muscle tolerates more than the fatigue model currently
// predicts — the existing muscleSensitivity mechanism absorbs whatever that
// probe reveals via ordinary soreness logging afterward, so no separate
// calibration loop is needed here.
function experimentalSetCount(ceiling, sessionCount) {
  const cycle = [2, 3, 4];
  const raw = cycle[sessionCount % cycle.length];
  return Math.min(raw, ceiling + 1);
}

// Same 2/3/4 rotation experimentalSetCount uses for auto-generated
// sessions, without the fatigue-ceiling cap — freestyle logging (picking
// exercises manually, outside the planner entirely) doesn't have a live
// fatigue read easily available at the point an exercise gets added, so
// this is the same base autoregulation pattern minus that one input,
// rather than no set-count guidance at all in that flow.
function suggestedWorkingSetCount(exerciseSessionCount) {
  const cycle = [2, 3, 4];
  return cycle[(exerciseSessionCount || 0) % cycle.length];
}

// Descending RIR target per set, ending at true failure (RIR 0) on the
// last set and never repeating a value — exactly TRAINING_ETHOS's
// (index.js) stated rule: "the first working set leaves more in reserve,
// each subsequent set gets closer to true failure, with the last set at
// RIR 0-1; never repeat the same RIR across sets of the same exercise."
function suggestedRirSequence(setCount) {
  return Array.from({ length: setCount }, (_, i) => setCount - 1 - i);
}

// TRAINING_ETHOS (index.js): "Reps run 1-9, biased toward the higher end (up
// to 8-9), since 1-2 reps rarely deliver enough stimulus per set to be worth
// defaulting to." LOW_REP_THRESHOLD widens that check to <=3. Flags a real
// session-wide pattern, not any single low-rep set — a deliberate heavy
// single/double/triple (e.g. a top-set test) shouldn't trip this, so it
// requires both a real sample size and a genuine majority.
const LOW_REP_THRESHOLD = 3;
const MIN_HARD_SETS_FOR_PATTERN = 3;
function isLowRepPattern(hardSets) {
  const withReps = (hardSets || []).filter(s => (+s.reps || 0) > 0);
  if (withReps.length < MIN_HARD_SETS_FOR_PATTERN) return false;
  const lowCount = withReps.filter(s => +s.reps <= LOW_REP_THRESHOLD).length;
  return lowCount / withReps.length > 0.5;
}

// Fatigue budget for very new lifters, expressed as a working-set count
// rather than a numeric RIR the app doesn't track: under 3 months, the
// budget is one failure-equivalent set, spendable as a single true-failure
// set OR two sets held short of failure — cycled between the two so a solo
// failure set is a real, reachable outcome and not just a theoretical floor
// the general 2/3/4 cycle (which never lands on 1) would otherwise exclude.
// 3-6 months raises the ceiling to a flat 2 working sets with no failure-
// suppression behavior — as originally specified, no RIR nuance requested
// for this tier. 6+ months: no special handling, returns null so the
// ordinary fatigue/experiment system applies untouched. Deliberately more
// conservative than the general system — no +1 overshoot allowance, since
// this cap exists precisely to protect someone who hasn't built recovery
// capacity yet.
function newLifterWorkingSetCount(trainingMonths, sessionCount, fatigueCeiling) {
  if (trainingMonths == null) return null;
  if (trainingMonths < 3) return Math.min([1, 2][sessionCount % 2], fatigueCeiling);
  if (trainingMonths < 6) return Math.min(2, fatigueCeiling);
  return null;
}

function setsFor(prog, workingSetCount, { failureSolo = false, higherRirPair = false } = {}) {
  const workingType = failureSolo ? 'F' : 'N';
  if (!prog) {
    const note = failureSolo
      ? 'no history yet — new lifter: this one set should go to true failure'
      : higherRirPair
      ? 'no history yet — new lifter: stay a couple reps short of failure on these'
      : 'no history yet — pick a comfortable weight and log it to start tracking progression';
    return { note, sets: Array.from({ length: workingSetCount }, () => ({ type: workingType, kg: 0, reps: 8 })) };
  }
  const sets = [];
  if (prog.suggestKg > 0) {
    sets.push({ type: 'W', kg: prog.warmup1kg, reps: 10 });
    sets.push({ type: 'W', kg: prog.warmup2kg, reps: 5 });
  }
  for (let i = 0; i < workingSetCount; i++) sets.push({ type: workingType, kg: prog.suggestKg, reps: prog.suggestReps });
  let note = prog.note;
  if (failureSolo) note += ' — new lifter: take this set to true failure';
  else if (higherRirPair) note += ' — new lifter: keep these a couple reps short of failure';
  return { note, sets };
}

// backboneExerciseNames: the 2 compound picks the weekly planner already made
// for this day (functions/weeklyPlanner.js's pickBackboneExercises). This
// function's job is narrower: resolve those to full DB entries, apply
// fatigue/injury/CNS adjustments, round out with accessories (rotating away
// from last session's pick per bucket), and attach a concrete set/rep/weight
// scheme to each — including experiment-mode set-count cycling and the
// new-lifter fatigue budget. trainingMonths is null for an athlete who
// hasn't self-reported training experience, in which case the new-lifter
// budget is skipped entirely rather than assumed.
function generateSessionExercises({ type, targetMuscles, backboneExerciseNames, lifts, travelMode, avoidMuscles = [], offlineMuscles = [], cnsFatigue = 0, metabolicFatigue = 0, trainingMonths = null, skipAccessories = false, accessoryCountOverride = null, isolationOnly = false, favoriteExercises = [] }) {
  if (type !== 'lift' || !targetMuscles?.length) return [];

  const excludeMuscles = [...new Set([...avoidMuscles, ...offlineMuscles])];

  let backboneEntries = (backboneExerciseNames || [])
    .map(n => EXERCISE_DB.find(e => e.name.toLowerCase() === (n || '').toLowerCase()))
    .filter(Boolean)
    .filter(e => !e.primary.some(m => excludeMuscles.includes(m)));
  const originalNames = new Set(backboneEntries.map(e => e.name));

  if (cnsFatigue > 70) backboneEntries = backboneEntries.map(e => substituteForCNS(e, excludeMuscles));

  // Substitution can collapse two different backbone picks onto the same
  // machine/cable alternative — dedupe before it shows up twice in the session.
  const seen = new Set();
  backboneEntries = backboneEntries.filter(e => (seen.has(e.name) ? false : (seen.add(e.name), true)));

  const fatigueCeiling = metabolicFatigue > 60 ? 2 : metabolicFatigue > 30 ? 3 : 4;
  // skipAccessories: used by the full-body auto-pick path (functions/index.js's
  // /plan/session-exercises), which calls this once per muscle bucket — each
  // bucket already contributes exactly one exercise, so adding accessories
  // per-bucket-call would stack extra volume onto whichever buckets happen to
  // score highest instead of keeping the session evenly spread, which is the
  // whole point of picking one exercise per bucket in the first place.
  const accessoryCount = accessoryCountOverride != null ? accessoryCountOverride
    : skipAccessories ? 0 : (metabolicFatigue > 60 ? 1 : 2);

  const excludeNames = new Set([...originalNames, ...backboneEntries.map(e => e.name)]);
  const avoidEquipment = cnsFatigue > 70 ? HIGH_CNS_EQUIPMENT : [];
  const lastPick = accessoryCount > 0 ? lastAccessoryPick(lifts, targetMuscles, excludeNames) : null;
  const accessories = accessoryCount > 0 ? pickAccessories(targetMuscles, backboneEntries, excludeNames, excludeMuscles, {
    travelMode, avoidEquipment, avoidNames: lastPick ? [lastPick] : [], count: accessoryCount, isolationOnly, lifts, favoriteExercises,
  }) : [];

  return [...backboneEntries, ...accessories].map(e => {
    const prog = progressionFor(lifts, e.name);
    const sessionCount = exerciseSessionCount(lifts, e.name);
    const nlCount = newLifterWorkingSetCount(trainingMonths, sessionCount, fatigueCeiling);
    const workingSetCount = nlCount != null ? nlCount : experimentalSetCount(fatigueCeiling, sessionCount);
    const newLifterPhase = trainingMonths != null && trainingMonths < 3;
    const { note, sets } = setsFor(prog, workingSetCount, {
      failureSolo: newLifterPhase && workingSetCount === 1,
      higherRirPair: newLifterPhase && workingSetCount >= 2,
    });
    return { name: e.name, note, sets };
  });
}

module.exports = {
  generateSessionExercises, progressionFor, suggestedWorkingSetCount, suggestedRirSequence,
  isLowRepPattern, LOW_REP_THRESHOLD, isStapleExercise, STAPLE_SESSION_THRESHOLD,
};
