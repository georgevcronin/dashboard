const { isLowerBodyExercise, findExercise } = require('./muscleTaxonomy');
const { e1rm: calcE1RM } = require('./strengthStandards');
const { computeBrandCalibration, calibratedE1RM } = require('./brandCalibration');

// Deterministic double-progression calculator: given an exercise's session
// history, decide whether to add weight, add a rep, deload, or hold — no LLM
// involved. Shared by /coach, the deterministic session generator, and the
// weekly plan's per-exercise pre-computed targets.

const PLATE_LOADED_EQUIPMENT = new Set(['barbell', 'smith']);
const STACK_LOADED_EQUIPMENT = new Set(['machine', 'cable']);
// Selectorized weight-stack machines standardly step in 10lb increments
// (Life Fitness/Cybex/etc. spec sheets); some step finer (5lb) but 10lb is
// the common baseline across brands.
const STACK_INCREMENT_KG = 4.5;

// The weight jump this exercise's equipment can actually realize: barbell/
// smith are plate-loaded (2.5kg per side is the standard small-plate jump,
// bumped to 5kg for lower-body compounds since they're strong enough
// movements that 2.5kg is imperceptible progress); machine/cable are
// stack-loaded, limited to whatever increment the pin/stack offers;
// dumbbell/kettlebell/bodyweight are finely adjustable (fixed dumbbells
// aside, most commercial gyms have close-enough increments, and bodyweight
// progress comes from reps, not load). Unknown equipment (exercise not in
// the DB, e.g. a manually-logged custom name) falls back to the old 2.5kg
// default rather than guessing.
function weightIncrementKg(equipment, isLowerBody) {
  if (PLATE_LOADED_EQUIPMENT.has(equipment)) return isLowerBody ? 5 : 2.5;
  if (STACK_LOADED_EQUIPMENT.has(equipment)) return STACK_INCREMENT_KG;
  if (equipment) return 0.1;
  return 2.5;
}

function computeProgression(lifts, name) {
  // Warmup sets (type: 'W', tagged on ingest — see functions/index.js's
  // hevySetType/ingestWorkout) never carried real progression signal; they
  // were previously just incidentally excluded because Math.max always
  // picked the heavier working set anyway. Now that some entries actually
  // carry the tag, exclude them explicitly rather than relying on that
  // coincidence — untagged (older) history is unaffected since undefined
  // !== 'W'.
  const ex = lifts.filter(l => l.exercise === name && l.type !== 'W');
  if (!ex.length) return null;
  // Rescales e1RM onto whichever brand this exercise is most often logged on
  // (brandCalibration.js), so a session-to-session trend comparison below
  // doesn't read a gym/brand switch as a strength change — a no-op when the
  // exercise has never been logged on 2+ brands close enough in time to
  // calibrate (no data means no guessing, e1rm stays as computed).
  const calibration = computeBrandCalibration(ex);
  const byDate = {};
  for (const l of ex) { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); }
  const sessions = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([date, sets]) => {
    const topKg = Math.max(...sets.map(s => s.kg || 0));
    const topSet = sets.find(s => s.kg === topKg) || sets[0];
    const rawE1rm = topSet.kg > 0 && topSet.reps > 0 ? calcE1RM(topSet.kg, topSet.reps) : 0;
    const e1rm = rawE1rm ? Math.round(calibratedE1RM(rawE1rm, name, topSet.machine, calibration)) : 0;
    return { date, kg: topSet.kg, reps: topSet.reps, e1rm, setCount: sets.length };
  });
  const last = sessions.at(-1);
  const prev = sessions.at(-2);
  const equipment = findExercise(name)?.equipment;
  const inc = weightIncrementKg(equipment, isLowerBodyExercise(name));
  let suggestKg = last.kg, suggestReps = last.reps, trend, note;
  if (!prev) {
    trend = 'baseline'; note = `baseline — ${last.kg}kg×${last.reps}`;
  } else if (last.e1rm > prev.e1rm && last.reps >= 5) {
    suggestKg = last.kg + inc; trend = 'progressing';
    note = `progressing — try ${suggestKg}kg×${last.reps} (+${inc}kg)`;
  } else if (last.e1rm >= prev.e1rm) {
    suggestReps = last.reps + 1; trend = 'steady';
    note = `steady — target ${last.kg}kg×${suggestReps} (+1 rep)`;
  } else if (sessions.slice(-3).every((s, i, a) => i === 0 || s.e1rm <= a[i-1].e1rm)) {
    suggestKg = Math.max(0, last.kg - inc * 2); trend = 'stalled';
    note = `stalled — reset to ${suggestKg}kg and rebuild`;
  } else {
    trend = 'recovering'; note = `recovering — hold ${last.kg}kg×${last.reps}`;
  }
  // Rounded to 1 decimal (the finest increment in use, weightIncrementKg's
  // 0.1kg for non-plate/stack equipment) — kg + 0.1 isn't exact in
  // floating point, and this compounds session over session since
  // suggestKg becomes next session's last.kg, producing e.g.
  // 9.600000000000001kg after enough progression cycles.
  suggestKg = Math.round(suggestKg * 10) / 10;
  const warmup1kg = Math.round(suggestKg * 0.6 / inc) * inc;
  const warmup2kg = Math.round(suggestKg * 0.85 / inc) * inc;
  const recentStr = sessions.slice(-3).map(s => `${s.date}: ${s.kg}kg×${s.reps} (e1RM ${s.e1rm})`).join(', ');
  return { name, trend, note, suggestKg, suggestReps, warmup1kg, warmup2kg, setCount: last.setCount, recentStr };
}

module.exports = { computeProgression };
