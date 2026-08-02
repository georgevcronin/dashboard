const { isLowerBodyExercise, findExercise } = require('./muscleTaxonomy');
const { e1rm: calcE1RM } = require('./strengthStandards');
const { excludeNonCapabilitySets } = require('./missedTarget');
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

// Default warmup ramp, matching this function's previous hardcoded behavior
// exactly (10 reps @ 60%, 5 reps @ 85%) — the fallback whenever a caller
// doesn't pass their own profile.warmupScheme. A few named presets are
// offered in Settings alongside the free-form editor; this is the one used
// when an athlete has never customized it.
const DEFAULT_WARMUP_SCHEME = [{ reps: 10, pct: 60 }, { reps: 5, pct: 85 }];

// Other common warmup-ramp conventions, offered as one-tap presets in
// Settings — not defaults, just starting points an athlete can pick then
// still edit freely. Percentages are of the session's suggested working
// weight (prog.suggestKg), same basis DEFAULT_WARMUP_SCHEME uses.
const WARMUP_SCHEME_PRESETS = [
  { label: 'Standard (10@60%, 5@85%)', scheme: DEFAULT_WARMUP_SCHEME },
  { label: 'Fewer, harder (6@60%, 3@90%)', scheme: [{ reps: 6, pct: 60 }, { reps: 3, pct: 90 }] },
  { label: 'Three-step ramp (8@40%, 5@60%, 2@80%)', scheme: [{ reps: 8, pct: 40 }, { reps: 5, pct: 60 }, { reps: 2, pct: 80 }] },
  { label: 'Minimal (5@50%)', scheme: [{ reps: 5, pct: 50 }] },
];

function computeProgression(lifts, name, warmupScheme) {
  // Warmup sets (type: 'W', tagged on ingest — see functions/index.js's
  // hevySetType/ingestWorkout) never carried real progression signal; they
  // were previously just incidentally excluded because Math.max always
  // picked the heavier working set anyway. Now that some entries actually
  // carry the tag, exclude them explicitly rather than relying on that
  // coincidence — untagged (older) history is unaffected since undefined
  // !== 'W'.
  // Sets whose miss was flagged as non-physiological (grip, pain, an
  // interruption) are not evidence about strength and are dropped before the
  // trend is computed. Without this, one slipped grip on a top set drops that
  // session's e1RM below the previous one and, on a flat run, turns the trend
  // 'stalled' — which resets the working weight by two increments. Measured:
  // a 65kg cable row logged at 3 reps instead of 8 suggested "reset to 56kg".
  // Untagged history is unaffected: no reason means an ordinary set.
  const ex = excludeNonCapabilitySets(lifts)
    .filter(l => l.exercise === name && l.type !== 'W');
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
  // Configurable warmup ramp — an athlete's own scheme (profile.warmupScheme,
  // an array of {reps, pct}) if they've set one, else DEFAULT_WARMUP_SCHEME.
  // Each step's weight is rounded to this exercise's own real equipment
  // increment (inc), same as the old fixed warmup1kg/warmup2kg were.
  const scheme = (warmupScheme && warmupScheme.length) ? warmupScheme : DEFAULT_WARMUP_SCHEME;
  const warmupSets = scheme.map(step => ({
    kg: Math.round(suggestKg * (step.pct / 100) / inc) * inc,
    reps: step.reps,
  }));
  const recentStr = sessions.slice(-3).map(s => `${s.date}: ${s.kg}kg×${s.reps} (e1RM ${s.e1rm})`).join(', ');
  return { name, trend, note, suggestKg, suggestReps, warmupSets, setCount: last.setCount, recentStr };
}

module.exports = { computeProgression, DEFAULT_WARMUP_SCHEME, WARMUP_SCHEME_PRESETS };
