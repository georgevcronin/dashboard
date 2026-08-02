// Deterministic single-session exercise generator — the counterpart to
// weeklyPlanner.js's day structure, but for filling in one lift day's actual
// exercise list and set/rep/weight scheme. No LLM: exercise selection is
// muscle-coverage scoring over EXERCISE_DB, and every number comes straight
// out of computeProgression's double-progression math.

const { EXERCISE_DB } = require('./exerciseDb');
const { computeProgression } = require('./progression');
const { isCompoundExercise, loggedExerciseNames, isBodyweightOnlyExercise, redundancyPattern } = require('./muscleTaxonomy');
const { idealAngleForMuscle } = require('./emgActivation');

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
// pickDedicatedAccessory only: soft per-extra-primary-muscle penalty biasing
// toward a genuinely focused exercise over another diffuse compound that
// happens to rank the target muscle first — see its own comment. Smaller
// than LOGGED_EXERCISE_BONUS on purpose, so real training history can still
// win out over this default preference.
const FOCUS_PENALTY = 6;

// Free-weight/barbell-style compounds carry the highest CNS demand — when CNS
// fatigue is high, swap them for a machine/cable/Smith exercise hitting the
// same primary muscles, since those let effort go high without technical
// breakdown becoming the limiter (the same reasoning the training ethos gives
// for preferring stable movements generally, just triggered here by fatigue).
// Smith stays in HIGH_CNS_EQUIPMENT too (a heavy Smith lift can still
// trigger substitution the same as barbell/dumbbell — this axis is about
// load/effort, not balance) but is ALSO a valid swap TARGET here: its fixed
// bar path removes the same balance/coordination demand a machine or cable
// does, matching the stability-preference reasoning (STABLE_EQUIPMENT
// below) rather than the older, narrower machine/cable-only substitute pool.
const HIGH_CNS_EQUIPMENT = ['barbell', 'smith', 'dumbbell'];
const LOW_CNS_EQUIPMENT = ['machine', 'cable', 'smith'];

// Deliberately a SEPARATE grouping from HIGH/LOW_CNS_EQUIPMENT above, not a
// reuse -- that split is about load/effort (why Smith sits with barbell/
// dumbbell there), this one is about balance/stabilizer demand, where a
// Smith machine's fixed bar path makes it genuinely stable, arguably more
// so than some cable setups. Used by the stability preference below
// (functions/index.js's stableLeaning, mirroring compoundIsolationPreference's
// explicit-setting-else-auto-detected-from-history pattern) — a soft
// scoring bias, not an equipment filter, so a free-weight exercise can
// still win when it's clearly the better/only real option.
const STABLE_EQUIPMENT = ['machine', 'cable', 'smith'];
const UNSTABLE_EQUIPMENT = ['barbell', 'dumbbell'];
const STABILITY_BONUS = 10;
function stabilityScore(e, preferStable) {
  if (!preferStable) return 0;
  if (STABLE_EQUIPMENT.includes(e.equipment)) return STABILITY_BONUS;
  if (UNSTABLE_EQUIPMENT.includes(e.equipment)) return -STABILITY_BONUS;
  return 0;
}

function substituteForCNS(entry, avoidMuscles, avoidMusclesSecondary = []) {
  if (!HIGH_CNS_EQUIPMENT.includes(entry.equipment)) return entry;
  const candidates = EXERCISE_DB
    .filter(e => LOW_CNS_EQUIPMENT.includes(e.equipment)
      && !e.primary.some(m => avoidMuscles.includes(m))
      && !(e.secondary || []).some(m => avoidMusclesSecondary.includes(m)))
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
function pickAccessories(targetMuscles, alreadySelected, excludeNames, avoidMuscles, { travelMode, avoidEquipment = [], avoidNames = [], count, isolationOnly = false, lifts, favoriteExercises = [], avoidMusclesSecondary = [], preferStable = false }) {
  const coveredMuscles = new Set(alreadySelected.flatMap(e => e.primary));
  const remainingMuscles = targetMuscles.filter(m => !coveredMuscles.has(m));
  // Same-function guard: skip anything sharing both pattern and an
  // overlapping primary muscle with something already selected (backbone or
  // an earlier accessory pick) — e.g. a press backbone plus a press
  // accessory for the same muscle is redundant, but a press backbone plus
  // an isolation raise accessory is genuinely different work and stays
  // allowed.
  const isRedundant = e => !isStapleExercise(lifts, e.name) &&
    alreadySelected.some(a => redundancyPattern(a.pattern) === redundancyPattern(e.pattern) && e.primary.some(m => a.primary.includes(m)));
  // Bodyweight exercises excluded from normal selection — see
  // isBodyweightOnlyExercise in muscleTaxonomy.js for the exceptions
  // (travelMode, "Weighted X" variants, Russian Twist).
  const basePool = EXERCISE_DB.filter(e =>
    !excludeNames.has(e.name) &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    !(isBodyweightOnlyExercise(e) && !travelMode) &&
    !avoidEquipment.includes(e.equipment) &&
    !e.primary.some(m => avoidMuscles.includes(m)) &&
    !(e.secondary || []).some(m => avoidMusclesSecondary.includes(m)) &&
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
  // Diminishing weight by primary-array position, not a flat count -- same
  // fix and same reasoning as pickBackboneExercises' identical change (see
  // its comment): a raw count of muscles touched structurally favors a
  // diffuse compound over a dedicated single-muscle accessory regardless of
  // how well either actually trains what it touches.
  const weightedCoverage = (e, muscleList) => e.primary.reduce((sum, m, i) => muscleList.includes(m) ? sum + 1 / (i + 1) : sum, 0);
  const scored = pool
    .map(e => ({
      e,
      score: weightedCoverage(e, remainingMuscles) * 2 + weightedCoverage(e, targetMuscles)
        + (logged.has(e.name.toLowerCase()) ? LOGGED_EXERCISE_BONUS : 0)
        + (favorites.has(e.name.toLowerCase()) ? FAVORITE_EXERCISE_BONUS : 0)
        - (e.lesserKnown ? OBSCURE_PENALTY : 0)
        - (e.isometric ? ISOMETRIC_PENALTY : 0)
        + stabilityScore(e, preferStable),
    }))
    .sort((a, b) => b.score - a.score);
  // Two passes, not a static top-N slice: nothing previously stopped two
  // or three accessory picks stacking on whichever single muscle scored
  // highest overall while another target muscle got skipped entirely (a
  // real case: rear-delt picked 3x while mid-delt and abs got nothing).
  // Pass 1 greedily covers every still-uncovered target muscle one at a
  // time with its best-scoring candidate; pass 2 only fills any leftover
  // `count` once every target muscle already has at least one accessory.
  // Same-pattern+overlapping-muscle guard now also applies WITHIN this
  // list (previously only checked against `alreadySelected`), so two
  // accessory picks can't be each other's redundant pair either.
  // isAngleFamily entries get a recommended angle attached for whichever
  // muscle they're actually being credited for -- always a shallow copy
  // (never mutate the shared EXERCISE_DB entry `e` itself, see
  // pickBackboneExercises' identical comment in weeklyPlanner.js).
  const withAngle = (e, creditedMuscle) => e.isAngleFamily ? { ...e, angle: idealAngleForMuscle(e.pattern, creditedMuscle) } : e;
  const out = [];
  const dynamicCovered = new Set(coveredMuscles);
  const isRedundantWithPicked = e => out.some(o => redundancyPattern(o.pattern) === redundancyPattern(e.pattern) && e.primary.some(m => o.primary.includes(m)));
  for (const { e } of scored) {
    if (out.length >= count) break;
    if (isRedundantWithPicked(e)) continue;
    const creditedMuscle = e.primary.find(m => targetMuscles.includes(m) && !dynamicCovered.has(m));
    if (!creditedMuscle) continue;
    out.push(withAngle(e, creditedMuscle));
    e.primary.forEach(m => dynamicCovered.add(m));
  }
  if (out.length < count) {
    for (const { e } of scored) {
      if (out.length >= count) break;
      if (out.some(o => o.name === e.name) || isRedundantWithPicked(e)) continue;
      const creditedMuscle = e.primary.find(m => targetMuscles.includes(m)) || e.primary[0];
      out.push(withAngle(e, creditedMuscle));
    }
  }
  return out;
}

// Finds one exercise that gives `muscle` genuinely dedicated treatment --
// its #1/main-mover primary, not incidental credit from being 2nd or 3rd on
// someone else's primary list -- for generateSessionExercises' variety-
// widening step below. Deliberately narrower than pickAccessories: no
// "already covered" concept at all (the whole point here is muscles that
// ARE somewhere in an already-picked exercise's primary list but not as the
// main mover), just the same redundancy guard (no same-pattern-and-
// overlapping-muscle pick as something already selected, e.g. never
// re-admits Box Squat after Sumo Deadlift) plus the same logged/favorite/
// obscure scoring used everywhere else in this file.
function pickDedicatedAccessory(muscle, alreadySelected, excludeNames, avoidMuscles, { travelMode, avoidEquipment = [], isolationOnly = false, lifts, favoriteExercises = [], avoidMusclesSecondary = [], preferStable = false }) {
  const isRedundant = e => !isStapleExercise(lifts, e.name) &&
    alreadySelected.some(a => redundancyPattern(a.pattern) === redundancyPattern(e.pattern) && e.primary.some(m => a.primary.includes(m)));
  const basePool = EXERCISE_DB.filter(e =>
    !excludeNames.has(e.name) &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    !(isBodyweightOnlyExercise(e) && !travelMode) &&
    !avoidEquipment.includes(e.equipment) &&
    !e.primary.some(m => avoidMuscles.includes(m)) &&
    !(e.secondary || []).some(m => avoidMusclesSecondary.includes(m)) &&
    e.primary[0] === muscle &&
    !isRedundant(e)
  );
  const typePool = isolationOnly ? basePool.filter(e => !isCompoundExercise(e.name)) : basePool;
  const pool = typePool.length ? typePool : basePool;
  const logged = loggedExerciseNames(lifts);
  const favorites = new Set(favoriteExercises.map(n => (n || '').toLowerCase()));
  const scored = pool
    .map(e => ({
      e,
      // FOCUS_PENALTY: without this, nothing here prefers a genuinely
      // focused exercise (Lying Leg Curl, primary=[hamstrings]) over
      // another diffuse compound that just happens to rank the target
      // muscle first (Conventional Deadlift, primary=[hamstrings,glutes,
      // erectors]) -- the real case this was found from, where hamstrings
      // needed dedicating after Box Squat already took quads, and this
      // function had no reason not to pick another heavy multi-muscle
      // lift right back. The whole point of "dedicated" is focused work,
      // not a second diffuse compound. Real logged history (40) or a
      // stated favorite (15) can still outweigh this soft preference —
      // it's a bias toward focus, not a hard ban on compounds here.
      score: (logged.has(e.name.toLowerCase()) ? LOGGED_EXERCISE_BONUS : 0)
        + (favorites.has(e.name.toLowerCase()) ? FAVORITE_EXERCISE_BONUS : 0)
        - (e.lesserKnown ? OBSCURE_PENALTY : 0)
        - (e.isometric ? ISOMETRIC_PENALTY : 0)
        - (e.primary.length - 1) * FOCUS_PENALTY
        + stabilityScore(e, preferStable),
    }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.e;
  if (!top) return null;
  // Shallow copy for an isAngleFamily pick -- see pickAccessories' identical
  // comment above; never mutate the shared EXERCISE_DB entry.
  return top.isAngleFamily ? { ...top, angle: idealAngleForMuscle(top.pattern, muscle) } : top;
}

// Case-insensitive wrapper around computeProgression: EXERCISE_DB uses Title
// Case canonical names, but logged history can be lowercase (Hevy imports
// lowercase on ingest) or otherwise differently cased. Normalizes matching
// history onto the canonical name so computeProgression's internal exact
// match still works, without changing its contract for other callers.
function progressionFor(lifts, canonicalName, warmupScheme) {
  const lower = canonicalName.toLowerCase();
  const matching = (lifts || [])
    .filter(l => (l.exercise || '').toLowerCase() === lower)
    .map(l => ({ ...l, exercise: canonicalName }));
  if (!matching.length) return null;
  return computeProgression(matching, canonicalName, warmupScheme);
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
    for (const w of prog.warmupSets) sets.push({ type: 'W', kg: w.kg, reps: w.reps });
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
function generateSessionExercises({ type, targetMuscles, backboneExerciseNames, lifts, travelMode, avoidMuscles = [], avoidMusclesSecondary = [], offlineMuscles = [], cnsFatigue = 0, metabolicFatigue = 0, trainingMonths = null, skipAccessories = false, accessoryCountOverride = null, isolationOnly = false, favoriteExercises = [], sessionExcludeNames = new Set(), warmupScheme = null, maxDurationMin = null, preferStable = false, lowCnsMode = false }) {
  if (type !== 'lift' || !targetMuscles?.length) return [];

  const excludeMuscles = [...new Set([...avoidMuscles, ...offlineMuscles])];
  // Looser bar for secondary involvement (SECONDARY_FATIGUE_CEILING in
  // weeklyPlanner.js, higher than the primary FATIGUE_CEILING) — a muscle
  // merely assisting tolerates more residual fatigue than one being
  // directly trained. offlineMuscles (injured) still hard-excludes either way.
  const excludeMusclesSecondary = [...new Set([...avoidMusclesSecondary, ...offlineMuscles])];

  // backboneExerciseNames accepts either bare name strings (the original,
  // still-supported contract) or {name, angle} objects -- weeklyPlanner.js's
  // pickBackboneExercises already attaches a recommended angle to any
  // isAngleFamily pick it makes, and that angle needs to survive this
  // name-based re-resolution, not get silently dropped back to a bare
  // EXERCISE_DB entry with no angle at all.
  let backboneEntries = (backboneExerciseNames || [])
    .map(n => (typeof n === 'string' ? { name: n } : n))
    .map(spec => {
      const entry = EXERCISE_DB.find(e => e.name.toLowerCase() === (spec.name || '').toLowerCase());
      if (!entry) return null;
      // Shallow copy, never mutate the shared EXERCISE_DB entry -- see
      // pickBackboneExercises' identical comment in weeklyPlanner.js.
      return spec.angle != null ? { ...entry, angle: spec.angle } : entry;
    })
    .filter(Boolean)
    .filter(e => !e.primary.some(m => excludeMuscles.includes(m)))
    .filter(e => !(e.secondary || []).some(m => excludeMusclesSecondary.includes(m)));
  const originalNames = new Set(backboneEntries.map(e => e.name));

  // lowCnsMode asks for the same treatment high measured CNS fatigue triggers,
  // without pretending the CNS reading is worse than it is — sessionVariants.js
  // uses it to build a spare-the-nervous-system alternative on a day when
  // cnsFatigue hasn't actually crossed the threshold.
  const spareCns = lowCnsMode || cnsFatigue > 70;
  if (spareCns) backboneEntries = backboneEntries.map(e => substituteForCNS(e, excludeMuscles, excludeMusclesSecondary));

  // Substitution can collapse two different backbone picks onto the same
  // machine/cable alternative — dedupe before it shows up twice in the session.
  const seen = new Set();
  backboneEntries = backboneEntries.filter(e => (seen.has(e.name) ? false : (seen.add(e.name), true)));

  const fatigueCeiling = fatigueCeilingFor(metabolicFatigue);
  // skipAccessories: used by the full-body auto-pick path (functions/index.js's
  // /plan/session-exercises), which calls this once per muscle bucket — each
  // bucket already contributes exactly one exercise, so adding accessories
  // per-bucket-call would stack extra volume onto whichever buckets happen to
  // score highest instead of keeping the session evenly spread, which is the
  // whole point of picking one exercise per bucket in the first place.
  const accessoryCount = accessoryCountOverride != null ? accessoryCountOverride
    : skipAccessories ? 0 : (metabolicFatigue > 60 ? 1 : 2);

  // sessionExcludeNames: names already used elsewhere in the same session
  // (functions/index.js's full-body generator calls this once per target
  // muscle — without threading this through, the same exercise could win
  // independently for two different muscles it covers, e.g. Farmer's Carry
  // for both forearms and traps, and show up twice in one session).
  const excludeNames = new Set([...originalNames, ...backboneEntries.map(e => e.name), ...sessionExcludeNames]);
  const avoidEquipment = spareCns ? HIGH_CNS_EQUIPMENT : [];
  const lastPick = accessoryCount > 0 ? lastAccessoryPick(lifts, targetMuscles, excludeNames) : null;
  const accessories = accessoryCount > 0 ? pickAccessories(targetMuscles, backboneEntries, excludeNames, excludeMuscles, {
    travelMode, avoidEquipment, avoidNames: lastPick ? [lastPick] : [], count: accessoryCount, isolationOnly, lifts, favoriteExercises,
    avoidMusclesSecondary: excludeMusclesSecondary, preferStable,
  }) : [];

  // Which exercises actually drive the session, taken from the selection that
  // already happened rather than re-derived from the name. A backbone pick is
  // what pickBackboneExercises chose to cover the target muscles; everything
  // else is support work, split by whether it's multi-joint. Surfaced so the
  // interface can rank them visually instead of showing a flat list where the
  // squat and a cable curl look equally important.
  const backboneNames = new Set(backboneEntries.map(e => e.name.toLowerCase()));
  const roleFor = e => (backboneNames.has(e.name.toLowerCase()) ? 'primary'
    : isCompoundExercise(e.name) ? 'secondary' : 'isolation');

  const buildEntry = e => {
    const prog = progressionFor(lifts, e.name, warmupScheme);
    const sessionCount = exerciseSessionCount(lifts, e.name);
    const nlCount = newLifterWorkingSetCount(trainingMonths, sessionCount, fatigueCeiling);
    const workingSetCount = nlCount != null ? nlCount : experimentalSetCount(fatigueCeiling, sessionCount);
    const newLifterPhase = trainingMonths != null && trainingMonths < 3;
    const { note, sets } = setsFor(prog, workingSetCount, {
      failureSolo: newLifterPhase && workingSetCount === 1,
      higherRirPair: newLifterPhase && workingSetCount >= 2,
    });
    // isAngleFamily entries surface a recommended angle in the response so
    // the frontend can pre-fill PressRowBuilder's confirm step with it.
    // Falls back to idealAngleForMuscle(e.pattern, e.primary[0]) if this
    // particular entry reached buildEntry without one already attached
    // (e.g. CNS substitution above can swap in a different EXERCISE_DB
    // entry that never went through pickAccessories/pickBackboneExercises'
    // own angle attachment) -- every family entry in the response should
    // always carry SOME angle, not just whichever ones took the normal path.
    return {
      name: e.name, note, sets, role: roleFor(e),
      ...(e.isAngleFamily ? { family: true, pattern: e.pattern, equipment: e.equipment, angle: e.angle ?? idealAngleForMuscle(e.pattern, e.primary[0]) } : {}),
    };
  };

  let finalDbEntries = [...backboneEntries, ...accessories];
  let finalList = finalDbEntries.map(buildEntry);

  // Widen for variety, not just volume: a target muscle can be "covered" on
  // paper (present in some pick's primary list) without being genuinely
  // trained -- e.g. triceps/front-delt on Barbell Bench Press, whose main
  // event is chest (exerciseDb.js's primary array is ordered main-mover-
  // first, same convention "row" and the Sumo Deadlift/Box Squat fix above
  // both rely on). Real stimulus, but thin, and stacking more SETS onto the
  // press (the caller's fillSessionToDuration, which only adds volume) does
  // nothing to fix that. If genuine session-length budget remains, add one
  // more non-redundant, genuinely-dedicated exercise per muscle that has no
  // #1-primary pick anywhere yet, via pickDedicatedAccessory (NOT
  // pickAccessories -- that function's own "already covered" concept is
  // any-primary, which would immediately consider triceps/front-delt/etc.
  // already covered by the press and refuse to add anything for them, the
  // exact gap being fixed here).
  if (maxDurationMin) {
    let guard = 0;
    while (guard++ < targetMuscles.length + 2) {
      const dedicatedMuscles = new Set(finalDbEntries.map(e => e.primary[0]));
      const needsDedicated = targetMuscles.filter(m => !dedicatedMuscles.has(m));
      if (!needsDedicated.length) break;
      const widenExcludeNames = new Set([...excludeNames, ...finalDbEntries.map(e => e.name)]);
      let pick = null;
      for (const muscle of needsDedicated) {
        pick = pickDedicatedAccessory(muscle, finalDbEntries, widenExcludeNames, excludeMuscles, {
          travelMode, avoidEquipment, isolationOnly, lifts, favoriteExercises, avoidMusclesSecondary: excludeMusclesSecondary, preferStable,
        });
        if (pick) break;
      }
      if (!pick) break;
      const projected = [...finalList, buildEntry(pick)];
      if (estimateSessionDurationMin(projected) > maxDurationMin) break;
      finalDbEntries = [...finalDbEntries, pick];
      finalList = projected;
    }

    // Post-widen cleanup: a diffuse multi-muscle pick (Sumo Deadlift: its
    // own main mover, glutes, isn't even a target muscle here -- quads and
    // hamstrings are, but only as incidental 2nd/3rd primary) can end up
    // contributing nothing the widen step above didn't already better-serve
    // with a real dedicated exercise. Removes any exercise whose own main
    // mover isn't a target muscle still needing dedication AND every target
    // muscle it does touch already has its own dedicated exercise
    // elsewhere -- pure overlap with nothing depending on it. Re-checked
    // after each removal since dropping one exercise can change whether
    // another's coverage is still uniquely needed.
    let removed = true;
    while (removed) {
      removed = false;
      for (const entry of finalDbEntries) {
        const others = finalDbEntries.filter(e => e !== entry);
        const dedicatedElsewhere = new Set(others.map(e => e.primary[0]));
        const ownMoverStillNeeded = targetMuscles.includes(entry.primary[0]) && !dedicatedElsewhere.has(entry.primary[0]);
        if (ownMoverStillNeeded) continue;
        const otherTargetMuscles = entry.primary.slice(1).filter(m => targetMuscles.includes(m));
        if (otherTargetMuscles.every(m => dedicatedElsewhere.has(m))) {
          finalDbEntries = others;
          removed = true;
          break;
        }
      }
    }
    finalList = finalDbEntries.map(buildEntry);
  }

  return finalList;
}

// Per-exercise working-set ceiling, driven by metabolic fatigue -- pulled
// out to a named function (rather than left inline in generateSessionExercises)
// so fillSessionToDuration below can use the exact same number rather than
// risking a second, driftable copy of the same formula at the call site.
function fatigueCeilingFor(metabolicFatigue) {
  return metabolicFatigue > 60 ? 2 : metabolicFatigue > 30 ? 3 : 4;
}

// Session-length estimate/cap, driven by the full-body auto-generator's
// duration slider (functions/index.js's /plan/session-exercises). Per-set
// timings are the app's own numbers, not generic guesses: 3 minutes rest
// between working sets matches TRAINING_ETHOS's stated "rest fully between
// working sets (about 3-4 minutes)" exactly; warmup rest is shorter since
// warmups are lighter and never pushed to real effort.
const SET_EXECUTION_S = 45;
const WORKING_REST_S = 180;
const WARMUP_REST_S = 60;
const EXERCISE_TRANSITION_S = 90;

function estimateSessionDurationSec(exercises) {
  const list = exercises || [];
  let total = 0;
  list.forEach((ex, i) => {
    if (i > 0) total += EXERCISE_TRANSITION_S;
    const sets = ex.sets || [];
    sets.forEach((set, j) => {
      total += SET_EXECUTION_S;
      const isLastSetOfSession = i === list.length - 1 && j === sets.length - 1;
      if (!isLastSetOfSession) total += (set.type === 'W' ? WARMUP_REST_S : WORKING_REST_S);
    });
  });
  return total;
}

function estimateSessionDurationMin(exercises) {
  return Math.round(estimateSessionDurationSec(exercises) / 60);
}

// Trims to fit maxDurationMin by dropping, one at a time, whichever
// exercise's primary muscle(s) currently carry the HIGHEST fatigue among
// what's left — i.e. already most recently/heavily stimulated ("highest
// adaptation right now"), so exercises for genuinely fresh, under-trained
// muscles are the last thing cut. Rescored after every cut, since removing
// one exercise can change which is now the worst offender. Never cuts below
// one exercise, even if that alone still exceeds the cap — a cap this tight
// is a user choice to respect, not a reason to return an empty session.
function capSessionDuration(exercises, currentFatigue, maxDurationMin) {
  if (!maxDurationMin) return exercises;
  let list = [...(exercises || [])];
  while (list.length > 1 && estimateSessionDurationMin(list) > maxDurationMin) {
    const scored = list.map(e => {
      const muscles = EXERCISE_DB.find(x => x.name === e.name)?.primary || [];
      const fatigue = muscles.length ? Math.max(...muscles.map(m => (currentFatigue || {})[m] || 0)) : 0;
      return { e, fatigue };
    });
    scored.sort((a, b) => b.fatigue - a.fatigue);
    list = list.filter(e => e.name !== scored[0].e.name);
  }
  return list;
}

// Adds working sets, round-robin across the already-chosen exercises, until
// the session reaches (or gets as close as possible without exceeding)
// maxDurationMin -- the counterpart to capSessionDuration's trim-down,
// for the opposite case: a session that came in well under a requested
// length (e.g. 23 min against a 90-min max) because backbone+accessory
// coverage happened to be satisfied with few exercises. Deliberately never
// invents a new exercise to burn the remaining time -- that would reopen
// the exact "extra exercise on a muscle without a specific reason" problem
// pickBackboneExercises/pickAccessories were just fixed for. Extra
// requested time becomes extra volume on exercises already chosen for a
// real reason instead, capped per exercise at fatigueCeiling (the same
// per-exercise working-set ceiling generateSessionExercises itself uses)
// so it spreads across the session rather than piling onto whichever
// exercise happens to be first.
function fillSessionToDuration(exercises, maxDurationMin, fatigueCeiling) {
  if (!maxDurationMin || !exercises?.length) return exercises;
  const list = exercises.map(e => ({ ...e, sets: [...e.sets] }));
  const workingSetCount = ex => ex.sets.filter(s => s.type !== 'W').length;
  let addedAny = true;
  while (estimateSessionDurationMin(list) < maxDurationMin && addedAny) {
    addedAny = false;
    for (const ex of list) {
      if (estimateSessionDurationMin(list) >= maxDurationMin) break;
      if (workingSetCount(ex) >= fatigueCeiling) continue;
      const lastWorking = [...ex.sets].reverse().find(s => s.type !== 'W');
      if (!lastWorking) continue;
      ex.sets.push({ ...lastWorking });
      addedAny = true;
    }
  }
  return list;
}

module.exports = {
  generateSessionExercises, progressionFor, suggestedWorkingSetCount, suggestedRirSequence,
  isLowRepPattern, LOW_REP_THRESHOLD, isStapleExercise, STAPLE_SESSION_THRESHOLD,
  estimateSessionDurationMin, capSessionDuration, fillSessionToDuration, fatigueCeilingFor,
  STABLE_EQUIPMENT, UNSTABLE_EQUIPMENT, stabilityScore,
};
