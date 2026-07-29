// Single-limb / bilateral parameterization — see
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §9 for the design
// this implements. For each exercise where doing it single-arm/single-leg
// is genuinely just "the same movement, less load, one side at a time" (a
// real parameter of that one exercise), this records that plus whether the
// equipment is shared-load (switching modes suggests roughly halving/
// doubling the weight to keep per-limb effort equivalent) or
// independent-per-side (no suggested change — each side's number already
// means the same thing regardless of using one side or both).
//
// Deliberately NOT included: exercises where going single-limb is a
// genuinely different, harder exercise because of an added balance/
// stability/coordination demand that's the actual point of choosing that
// variant (Single-Leg RDL, Single-Leg Hip Thrust, Bulgarian Split Squat,
// etc.) — collapsing those into "the bilateral version + a limb flag" would
// misrepresent them as a load-only choice, which they aren't. Also excluded:
// exercises that are already inherently single-limb by design with no real
// bilateral counterpart in normal practice (Pallof Press, external/internal
// rotation, landmine lateral raise, three-point dumbbell row, concentration
// curl, etc.), and exercises that need both limbs simultaneously by design
// with no sensible single-limb form (face pulls, Y-raises, shrugs, most
// barbell bar-grip lifts, all squat/deadlift/hinge patterns, all bodyweight
// and Smith machine exercises).
//
// Weight-adjustment basis by equipment:
//   - dumbbell: ALWAYS independent-per-side. Two dumbbells are already two
//     independent loads by construction — using one arm's dumbbell instead
//     of both is not a different number, it's the same dumbbell either way.
//   - cable: shared-load by default (a standard single-stack cable tower),
//     but genuinely depends on pulleyType (functions/index.js's existing
//     single/double-pulley tag on logged sets) — a double-pulley cable rig
//     is independent-per-side like a dumbbell. Recorded here as
//     'shared-default' to flag that dependency rather than asserting one
//     answer that isn't always true.
//   - machine: shared-load by default (a standard single-stack selectorized
//     machine), but genuinely depends on brand — iso-lateral machines
//     (Hammer Strength's press/row lines are the clearest example already
//     documented in this codebase, see functions/resistanceCurves.js) are
//     independent-per-side. Recorded here as 'shared-default' for the same
//     reason as cable.
//
// Known open conflict, not resolved here (scope guardrail — this task does
// not modify resistanceCurves.js): "single-leg press" already exists as its
// own separate key in functions/resistanceCurves.js's PLATE_LOADED_BASE_RESISTANCE_KG
// and RESISTANCE_CURVES data (from an earlier pass, before this field
// existed). This file recommends collapsing "Single-Leg Press" into "Leg
// Press" + a limb flag (see COLLAPSE_MAPPING below) — reconciling that
// with the already-shipped resistanceCurves.js data is a follow-up, not
// done as part of this task.

const SHARED_DEFAULT = 'shared-default'; // cable/machine: shared-load unless pulleyType/brand says otherwise
const INDEPENDENT = 'independent-per-side'; // dumbbell always; double-pulley cable, iso-lateral machine brands

// Exercises with an existing "Single-Arm"/"Single-Leg" name in exerciseDb.js
// that are recommended to COLLAPSE into a bilateral canonical name + this
// limb flag, vs. ones recommended to STAY SEPARATE (a genuinely different
// exercise, not a load-only variant). Reported here, not applied —
// renaming/removing exerciseDb.js entries is a separate migration step.
const COLLAPSE_MAPPING = {
  // uk = "unilateral name (as it exists today)" -> canonical bilateral name it should collapse into
  collapse: {
    'Single-Arm Lat Pulldown': 'Lat Pulldown (Neutral Grip)', // ambiguous — closest single-handle-compatible grip; flagged, not certain
    'Single-Arm Cable Row': 'Seated Cable Row',
    'Single-Arm Cable Lateral Raise': 'Lateral Raise (Cable)',
    'Single-Arm Dumbbell Press': 'Dumbbell Bench Press (Flat)',
    'Single-Leg Press': 'Leg Press', // NOTE: conflicts with resistanceCurves.js's existing separate "single-leg press" key — see file header
    'Single-Arm Cable Pushdown': 'Cable Tricep Pushdown (Bar)', // ambiguous — bar vs. rope attachment already distinguishes the two bilateral entries; picked bar as the closer single-handle match, low confidence
  },
  // Named unilateral, but no clean bilateral counterpart currently exists in
  // EXERCISE_DB to collapse into — kept as their own entry until/unless a
  // matching bilateral entry gets added.
  noCleanTarget: {
    'Single-Arm Cable Press': 'no bilateral "Cable Chest Press" entry exists (only Machine Chest Press, a different equipment type)',
    'Standing Single-Arm Cable Row': 'no bilateral "Standing Cable Row" entry exists — DB already treats standing vs. seated as separate exercises elsewhere (Standing Calf Raise vs. Seated Calf Raise), so this shouldn\'t silently collapse into the seated version',
  },
  // Named unilateral, but recommended to stay separate — collapsing would
  // lose a real, deliberate training distinction (balance/stability, or
  // inherently single-limb by design with no real bilateral form).
  keepSeparate: {
    'Single-Leg RDL': 'real unilateral-balance movement, distinct from a two-leg RDL — not just "half the weight"',
    'Single-Leg Hip Thrust': 'same — balance/stability is the point of choosing it',
    'Single-Leg Calf Raise': 'same — balance/stability is the point of choosing it',
    'Single-Arm Landmine Row': 'landmine attachment exercises are inherently single-side by physical design (bar pivots from a fixed point) — there\'s no normal "bilateral landmine row" this collapses into',
  },
};

// Explicit judgment calls — every exercise not listed here defaults to
// "not limb-capable" (most exercises: squats, deadlifts, all bodyweight,
// all Smith machine, anything needing both limbs simultaneously by design).
const LIMB_OPTIONS = {
  // ---- Chest ----
  'cable fly (high to low)': { singleLimb: true, basis: SHARED_DEFAULT },
  'cable fly (low to high)': { singleLimb: true, basis: SHARED_DEFAULT },
  'cable crossover': { singleLimb: true, basis: SHARED_DEFAULT },
  'incline cable fly': { singleLimb: true, basis: SHARED_DEFAULT },
  'pec deck / machine fly': { singleLimb: true, basis: SHARED_DEFAULT },
  'machine chest press': { singleLimb: true, basis: SHARED_DEFAULT },
  'dumbbell bench press (flat)': { singleLimb: true, basis: INDEPENDENT, note: 'collapse target for Single-Arm Dumbbell Press' },
  'dumbbell incline bench press': { singleLimb: true, basis: INDEPENDENT },
  'dumbbell decline bench press': { singleLimb: true, basis: INDEPENDENT },

  // ---- Back ----
  'lat pulldown (neutral grip)': { singleLimb: true, basis: SHARED_DEFAULT, note: 'collapse target for Single-Arm Lat Pulldown' },
  'close-grip lat pulldown': { singleLimb: true, basis: SHARED_DEFAULT },
  'cable straight-arm pulldown': { singleLimb: true, basis: SHARED_DEFAULT },
  'cable pullover': { singleLimb: true, basis: SHARED_DEFAULT, note: 'less common single-arm but mechanically clean' },
  'seated cable row': { singleLimb: true, basis: SHARED_DEFAULT, note: 'collapse target for Single-Arm Cable Row' },
  'high cable row': { singleLimb: true, basis: SHARED_DEFAULT },
  'wide-grip cable row': { singleLimb: true, basis: SHARED_DEFAULT },
  'machine row (seated)': { singleLimb: true, basis: SHARED_DEFAULT, note: 'independent-per-side on iso-lateral brands e.g. Hammer Strength' },
  'chest-supported dumbbell row': { singleLimb: true, basis: INDEPENDENT },
  'dumbbell row (pronated)': { singleLimb: true, basis: INDEPENDENT },
  'bent-over dumbbell row (bilateral)': { singleLimb: true, basis: INDEPENDENT, note: 'name already signals this is the bilateral anchor' },
  'chest-supported barbell row': { singleLimb: false, note: 'barbell = shared bar, both hands, no normal single-arm form' },

  // ---- Shoulders ----
  'reverse pec deck': { singleLimb: true, basis: SHARED_DEFAULT },
  'machine shoulder press': { singleLimb: true, basis: SHARED_DEFAULT },
  'dumbbell overhead press': { singleLimb: true, basis: INDEPENDENT },
  'arnold press': { singleLimb: true, basis: INDEPENDENT },
  'seated dumbbell overhead press': { singleLimb: true, basis: INDEPENDENT },
  'half-kneeling dumbbell press': { singleLimb: true, basis: INDEPENDENT, note: 'often done single-arm by default already — low confidence this is a genuine bilateral<->unilateral choice rather than inherently unilateral' },
  'lateral raise (dumbbell)': { singleLimb: true, basis: INDEPENDENT },
  'lateral raise (cable)': { singleLimb: true, basis: SHARED_DEFAULT, note: 'collapse target for Single-Arm Cable Lateral Raise' },
  'lateral raise (machine)': { singleLimb: true, basis: SHARED_DEFAULT },
  'rear delt fly (dumbbell)': { singleLimb: true, basis: INDEPENDENT },
  'rear delt fly (cable)': { singleLimb: true, basis: SHARED_DEFAULT },

  // ---- Biceps ----
  'low cable curl': { singleLimb: true, basis: SHARED_DEFAULT },
  'high cable curl': { singleLimb: true, basis: SHARED_DEFAULT },
  'hammer curl': { singleLimb: true, basis: INDEPENDENT },
  'incline dumbbell curl': { singleLimb: true, basis: INDEPENDENT },
  'dumbbell curl (standing)': { singleLimb: true, basis: INDEPENDENT },
  'decline curl (carter curl)': { singleLimb: true, basis: INDEPENDENT },
  'cross-body hammer curl': { singleLimb: true, basis: INDEPENDENT },
  'zottman curl': { singleLimb: true, basis: INDEPENDENT },
  'incline bench curl (scott curl)': { singleLimb: true, basis: INDEPENDENT, note: 'lower confidence, plausible single-arm variant' },
  'machine curl': { singleLimb: true, basis: SHARED_DEFAULT },

  // ---- Triceps ----
  'cable tricep pushdown (bar)': { singleLimb: true, basis: SHARED_DEFAULT },
  'cable tricep pushdown (rope)': { singleLimb: true, basis: SHARED_DEFAULT, note: 'rope is usually pulled bilaterally by design, but single-arm rope pushdown does exist — lower confidence' },
  'reverse grip pushdown': { singleLimb: true, basis: SHARED_DEFAULT },
  'overhead tricep extension (cable)': { singleLimb: true, basis: SHARED_DEFAULT },
  'overhead tricep extension (dumbbell)': { singleLimb: true, basis: INDEPENDENT },

  // ---- Quads / legs ----
  'leg press': { singleLimb: true, basis: SHARED_DEFAULT, note: 'collapse target for Single-Leg Press — see COLLAPSE_MAPPING conflict note in file header' },
  'hack squat (machine)': { singleLimb: true, basis: SHARED_DEFAULT, note: 'less common, less stable than leg press, but a real known variation' },
  'leg extension': { singleLimb: true, basis: SHARED_DEFAULT },

  // ---- Hamstrings ----
  'lying leg curl': { singleLimb: true, basis: SHARED_DEFAULT },
  'seated leg curl': { singleLimb: true, basis: SHARED_DEFAULT },
  'standing leg curl (machine)': { singleLimb: true, basis: SHARED_DEFAULT },

  // ---- Calves ----
  'standing calf raise (machine)': { singleLimb: true, basis: SHARED_DEFAULT },
  'seated calf raise': { singleLimb: true, basis: SHARED_DEFAULT },
  'calf raise on leg press': { singleLimb: true, basis: SHARED_DEFAULT },
};

module.exports = { LIMB_OPTIONS, COLLAPSE_MAPPING, SHARED_DEFAULT, INDEPENDENT };
