// Deterministic single-session exercise generator — the counterpart to
// weeklyPlanner.js's day structure, but for filling in one lift day's actual
// exercise list and set/rep/weight scheme. No LLM: exercise selection is
// muscle-coverage scoring over EXERCISE_DB, and every number comes straight
// out of computeProgression's double-progression math.

const { EXERCISE_DB } = require('./exerciseDb');
const { computeProgression } = require('./progression');

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

// Fills in exercises for muscles the backbone picks don't already cover.
// Unlike the weekly planner's backbone selection, this includes lesserKnown
// (novel/accessory) variations — appropriate here since the compound-first
// requirement was already satisfied by the backbone lifts passed in.
// excludeNames covers both the final (possibly CNS-substituted) backbone
// picks AND their pre-substitution originals — otherwise a barbell exercise
// swapped out for being too CNS-taxing can wander back in as an "accessory"
// since it's no longer in the final backbone list.
function pickAccessories(targetMuscles, alreadySelected, excludeNames, avoidMuscles, { travelMode, avoidEquipment = [], count }) {
  const coveredMuscles = new Set(alreadySelected.flatMap(e => e.primary));
  const remainingMuscles = targetMuscles.filter(m => !coveredMuscles.has(m));
  const pool = EXERCISE_DB.filter(e =>
    !excludeNames.has(e.name) &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    !avoidEquipment.includes(e.equipment) &&
    !e.primary.some(m => avoidMuscles.includes(m)) &&
    e.primary.some(m => targetMuscles.includes(m))
  );
  const scored = pool
    .map(e => ({ e, score: e.primary.filter(m => remainingMuscles.includes(m)).length * 2 + e.primary.filter(m => targetMuscles.includes(m)).length }))
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

function setsFor(prog, workingSetCount) {
  if (!prog) {
    return {
      note: 'no history yet — pick a comfortable weight and log it to start tracking progression',
      sets: Array.from({ length: workingSetCount }, () => ({ type: 'N', kg: 0, reps: 8 })),
    };
  }
  const sets = [];
  if (prog.suggestKg > 0) {
    sets.push({ type: 'W', kg: prog.warmup1kg, reps: 10 });
    sets.push({ type: 'W', kg: prog.warmup2kg, reps: 5 });
  }
  for (let i = 0; i < workingSetCount; i++) sets.push({ type: 'N', kg: prog.suggestKg, reps: prog.suggestReps });
  return { note: prog.note, sets };
}

// backboneExerciseNames: the 2 compound picks the weekly planner already made
// for this day (functions/weeklyPlanner.js's pickBackboneExercises). This
// function's job is narrower: resolve those to full DB entries, apply
// fatigue/injury/CNS adjustments, round out with accessories, and attach a
// concrete set/rep/weight scheme to each.
function generateSessionExercises({ type, targetMuscles, backboneExerciseNames, lifts, travelMode, avoidMuscles = [], offlineMuscles = [], cnsFatigue = 0, metabolicFatigue = 0 }) {
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

  const workingSetCount = metabolicFatigue > 60 ? 2 : metabolicFatigue > 30 ? 3 : 4;
  const accessoryCount = metabolicFatigue > 60 ? 1 : 2;

  const excludeNames = new Set([...originalNames, ...backboneEntries.map(e => e.name)]);
  const avoidEquipment = cnsFatigue > 70 ? HIGH_CNS_EQUIPMENT : [];
  const accessories = pickAccessories(targetMuscles, backboneEntries, excludeNames, excludeMuscles, { travelMode, avoidEquipment, count: accessoryCount });

  return [...backboneEntries, ...accessories].map(e => {
    const prog = progressionFor(lifts, e.name);
    const { note, sets } = setsFor(prog, workingSetCount);
    return { name: e.name, note, sets };
  });
}

module.exports = { generateSessionExercises, progressionFor };
