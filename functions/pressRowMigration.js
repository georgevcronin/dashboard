// Press/Row migration — PURE LOGIC ONLY, no Firestore access here. Computes
// what rewriting a historical lift logged under one of the now-superseded
// Overhead/Shoulder Press, pull-up/lat-pulldown, or (a later pass) the
// broader named Row family names would look like under the unified
// 'Bench Press' (§14) / 'Row' (§15) entities. Same safety pattern as
// functions/benchPressMigration.js — see that file's own header for why
// this is split from the CLI that actually touches Firestore
// (functions/scripts/migratePressRow.js).
//
// ⚠️ NOT WIRED INTO ANYTHING. Nothing in index.js, app startup, or any
// request path calls this file. See functions/scripts/migratePressRow.js
// for the standalone CLI a human must run explicitly (dry-run by default).
//
// ── Angle sourcing — deliberately NOT functions/exerciseAngles.js ──────────
// Phase 2's task notes call for using exerciseAngles.js's existing curated
// values where they apply. For Row's pull-up/lat-pulldown cluster (§15)
// there's nothing to reconcile — exerciseAngles.js doesn't map that cluster
// at all (its "press"/"row" keys are named-lift entries the athlete
// individually angle-mapped via the Angle Mapper tool, none of which are
// pull-up/pulldown names); the angles below come directly from §15's own
// table, cross-checked numerically against ROW_EMG in
// functions/exerciseLabelMatching.test.js.
//
// For Press's Overhead/Shoulder Press cluster, exerciseAngles.js's own
// "press" entries (e.g. 'overhead press (barbell)': 15, 'seated shoulder
// press (machine)': 45) were deliberately NOT used as a source here, despite
// superficially matching by name. Checked concretely: those keys are
// miscellaneous Hevy-import name variants (parenthetical gym-specific
// suffixes like "(TF)"/"(Verde)"/"(NU)" throughout that file confirm this),
// distinct from exerciseDb.js's own canonical entries this migration
// targets, AND converting them into the new Bench-Press-pilot sign
// convention (native 0-180, 90=flat -> pilot 0=flat, i.e. pilot = native-90)
// produces implausible results for this specific cluster — e.g. 'seated
// shoulder press (machine)' at native 45 would convert to pilot -45
// ("Decline Press"), and §16 explicitly describes that same cluster as
// sometimes "closer to Hybrid/incline territory" (positive, not negative).
// Using it anyway would have produced a migration that visibly contradicts
// the design doc's own qualitative description of these exact exercises.
// Instead, the angles below come from functions/exerciseEmgProfiles.js's
// OWN already-curated static profiles for these exact canonical names
// (checked to exactly match a PRESS_EMG native-scale row), converted via
// the same pilot = native-90 formula — which DOES produce sensible results
// for that path (e.g. 'barbell overhead press' matches PRESS_EMG[165]
// exactly -> pilot 75, squarely in Overhead Press territory). See each
// mapping's own inline note for its source.
const { benchPressEmgProfileForAngle } = require('./exerciseEmgProfiles');
const { emgForAngle, applyGripRotationModifier } = require('./emgActivation');

const CANONICAL_PRESS_NAME = 'Bench Press';
const CANONICAL_ROW_NAME = 'Row';

// §4's migration convention already gives Shoulder Press -> 75° directly in
// pilot-convention units (confirmed by §14: 75° sits inside "+60° and
// above" alongside the rest of this cluster) — the values below aren't a
// fresh derivation, they're that same convention applied per exact legacy
// name, plus exerciseEmgProfiles.js cross-checks for the ones that have a
// curated static profile.
const LEGACY_PRESS_NAME_MAP = {
  // profile matches PRESS_EMG[165] (native) -> pilot 75.
  'barbell overhead press': { equipment: 'Barbell', angle: 75, stance: 'standing' },
  // profile matches PRESS_EMG[165] (native) -> pilot 75. Form cue explicitly
  // allows either stance ("Seated or standing — both effective") — no
  // single correct stance to infer, so this is NOT auto-migrated (see
  // NEEDS_CLARIFICATION_PRESS_NAMES below), matching the design doc's own
  // stated policy for genuinely ambiguous historical entries.
  'machine shoulder press': { equipment: 'Machine', angle: 75, stance: 'seated' }, // form cue: "Adjust seat"
  'seated dumbbell overhead press': { equipment: 'Dumbbell', angle: 75, stance: 'seated' }, // profile matches PRESS_EMG[165] -> 75; name says seated
  'smith machine overhead press': { equipment: 'Machine', angle: 75, stance: 'seated' }, // profile matches PRESS_EMG[165] -> 75; id says seated
  'behind-neck press (smith machine)': { equipment: 'Machine', angle: 90, stance: 'seated' }, // profile matches PRESS_EMG[180] -> 90
};

// Genuinely ambiguous — no single stance can be honestly inferred from the
// name/form-cues, and the design doc's own policy for this exact situation
// ("existing custom-named logs: prompt the athlete to clarify... rather
// than guessing") means these are surfaced for manual review, not silently
// defaulted. angle/equipment are still known (from the curated profile) —
// only stance is unresolved, so planMigration reports these separately
// rather than rewriting them.
const NEEDS_CLARIFICATION_PRESS_NAMES = {
  'dumbbell overhead press': { equipment: 'Dumbbell', angle: 75, reason: 'form cue explicitly allows either seated or standing — no single stance to infer' },
};

// §15's exact table (angle confirmed against every entry's own lats value
// in exerciseEmgProfiles.js matching ROW_EMG at that angle — see
// test/exerciseLabelMatching.test.js and the design doc §15 for the table).
const LEGACY_ROW_NAME_MAP = {
  'close-grip lat pulldown': { equipment: 'Machine', angle: 120 },
  'chin-up': { equipment: 'Bodyweight', angle: 135 },
  'pull-up (neutral grip)': { equipment: 'Bodyweight', angle: 135 },
  'lat pulldown (neutral grip)': { equipment: 'Machine', angle: 135 },
  'lat pulldown (reverse / underhand)': { equipment: 'Machine', angle: 135 },
  // Per §9/§15: Neutral-Grip Lat Pulldown + the single-limb flag, at a
  // slightly adjusted angle reflecting the real stability/mechanics shift
  // unilateral loading causes.
  'single-arm lat pulldown': { equipment: 'Cable', angle: 150, limb: 'single' },
  'pull-up (wide grip)': { equipment: 'Bodyweight', angle: 165 },
  'weighted pull-up': { equipment: 'Bodyweight', angle: 165 },
  'lat pulldown (wide grip)': { equipment: 'Machine', angle: 165 },
  'behind-neck lat pulldown': { equipment: 'Machine', angle: 180 },
  // Cable Straight-Arm Pulldown is deliberately NOT in this map — it keeps
  // its own separate, non-parameterized identity (see exerciseDb.js's own
  // comment on that entry).

  // ── Row-family fold-in, picking up the scope §15 explicitly deferred ──────
  // ("only the pull-up/pulldown cluster, not the whole ~15-entry Row family").
  // Angles below are sourced primarily by cross-referencing each exact
  // canonical name's own already-curated static profile in
  // functions/exerciseEmgProfiles.js against ROW_EMG's own angle table (same
  // methodology as the Overhead Press cluster above) — NOT re-deriving from
  // curveNotes alone. Three corrections were made to that bulk-curated data
  // where it conflicted with the exercise's own curveNote, an existing
  // functions/exerciseAngles.js entry, or this project's own label-matching
  // boundary — each flagged inline below, same convention as §16.
  //
  // Barbell Row Overhand/Underhand: exerciseEmgProfiles.js currently profiles
  // these at two DIFFERENT angles (60 / 45) to approximate the grip-driven
  // difference, but that produces LOWER biceps for the Underhand/Yates
  // variant than Overhand — backwards from its own curveNote ("Supinated
  // grip maximises bicep involvement... lats strongly activated"). Now that
  // grip rotation is a real, stored parameter (§11) rather than an
  // angle-table approximation, the correct fix is to put both at the SAME
  // pull angle (60, the rest of the free-weight bent-over cluster) and let
  // rotation (0=pronated/overhand, 180=supinated/underhand — the only two
  // values a straight barbell allows, per GRIP_ANGLES_BY_EQUIPMENT.barbell)
  // carry the grip difference via applyGripRotationModifier, which correctly
  // gives Underhand higher biceps AND higher lats than Overhand (centered on
  // ROW_GRIP_EMG's own mean) — reusing the real mechanism instead of
  // preserving an angle-table workaround that predates it.
  'barbell row (overhand / pendlay)': { equipment: 'Barbell', angle: 60, rotation: 0 },
  'barbell row (underhand / yates)': { equipment: 'Barbell', angle: 60, rotation: 180 },
  // Meadows Row / Single-Arm Landmine Row: both a fixed-pivot landmine
  // setup — per §13's own resolution for T-Bar Row ("the lateral freedom... a
  // T-bar/landmine setup allows doesn't meaningfully change its stability
  // category... classify as Plate-Loaded Machine"), extended here to every
  // other landmine-anchored row for the same reason, not re-litigated per
  // entry. Both entries' own form cues ("grip end of bar" / "Brace
  // contralateral knee and hand") describe a one-arm pull despite neither
  // being named "Single-Arm" — limb:'single' follows the exercise's own
  // description, not its name.
  'meadows row': { equipment: 'Machine', angle: 60, limb: 'single' },
  'single-arm landmine row': { equipment: 'Machine', angle: 60, limb: 'single' },
  // Dumbbell Row (Three-Point): the "three-point" stance (two feet + one
  // supporting hand on a bench) IS the single-arm setup — the working arm
  // rows alone.
  'dumbbell row (three-point)': { equipment: 'Dumbbell', angle: 60, limb: 'single' },
  'bent-over dumbbell row (bilateral)': { equipment: 'Dumbbell', angle: 60 },
  // Dumbbell Row (Pronated): exerciseEmgProfiles.js's bulk pass bucketed this
  // at angle 75 (tied with Rack Row/Inverted Row), but its own curveNote is
  // entirely about grip rotation ("Pronated grip shifts emphasis from biceps
  // to brachioradialis"), not pull direction — no reason given to place it
  // at a different ANGLE than the plain bent-over dumbbell row cluster
  // above. Corrected to angle 60 (matching that cluster) plus rotation 0
  // (pronated/overhand), same reasoning as the Barbell Row pair above.
  'dumbbell row (pronated)': { equipment: 'Dumbbell', angle: 60, rotation: 0 },
  'seated cable row': { equipment: 'Cable', angle: 90 },
  'single-arm cable row': { equipment: 'Cable', angle: 90, limb: 'single' },
  'standing single-arm cable row': { equipment: 'Cable', angle: 90, limb: 'single' },
  'machine row (seated)': { equipment: 'Machine', angle: 90 },
  // High Cable Row / Wide-Grip Cable Row: exerciseEmgProfiles.js's bulk pass
  // put both at exactly angle 120 (matching ROW_EMG[120] exactly) — but 120
  // is ROW_PULLDOWN_ANGLE_THRESHOLD (functions/exerciseLabelMatching.js), so
  // migrating either at that exact value would make matchRowLabel display it
  // as "Lat Pulldown", not "Row" — wrong for two exercises whose own
  // curveNotes describe pulling elbows back to the torso (a row), not
  // pulling a bar down to a fixed low point (a pulldown). Corrected to 105 —
  // one step below the threshold, still solidly upper-back/rear-delt-
  // dominant (ROW_EMG[105]) — so both resolve to "Row", matching what they
  // actually are.
  'high cable row': { equipment: 'Cable', angle: 105 },
  'wide-grip cable row': { equipment: 'Cable', angle: 105 },
  // T-Bar Row: exerciseEmgProfiles.js's bulk profile matches ROW_EMG[60], but
  // functions/exerciseAngles.js has a dedicated, individually hand-picked
  // entry for this exact name ('t bar row': 75) predating this pass — per
  // this project's own precedent (the Overhead Press cluster comment above,
  // and §16's "corrected default" methodology), a specific curated value
  // takes precedence over the generic bulk default it would otherwise be
  // shadowed by. 75 is also consistent with this entry's own curveNote
  // ("arc between horizontal and vertical pull" — more vertical than a flat
  // bent-over row). Equipment is Machine, not Barbell, per §13's own T-Bar
  // Row resolution ("closer to Plate-Loaded Machine than free Barbell").
  't-bar row': { equipment: 'Machine', angle: 75 },
  // Rack Row / Inverted Row: both bodyweight-loaded (a barbell or TRX/rings
  // is the anchor, not the load source) — same classification the pull-up/
  // chin-up cluster above already uses despite a barbell/bar being
  // physically involved. Angle 75 (ROW_EMG[75]) matches both exact profiles
  // and sits sensibly between the free bent-over cluster (60) and the
  // upright seated-row cluster (90), consistent with an inclined-body,
  // chest-to-bar pulling pattern.
  'rack row (barbell inverted)': { equipment: 'Bodyweight', angle: 75 },
  'inverted row (trx/rings)': { equipment: 'Bodyweight', angle: 75 },
  // Chest-Supported Barbell Row: functions/exerciseAngles.js has a dedicated
  // curated entry for this exact name ('chest-supported barbell row': 105),
  // used here for the same reason as T-Bar Row above rather than
  // re-deriving from exerciseEmgProfiles.js (which doesn't curate this name
  // at all — see that file's own header note listing Chest-Supported
  // Barbell Row as deliberately left out so this exact mapping isn't
  // shadowed).
  'chest-supported barbell row': { equipment: 'Barbell', angle: 105, stance: 'chest-supported' },
};

// Genuinely ambiguous, same policy as NEEDS_CLARIFICATION_PRESS_NAMES above:
// Chest-Supported Dumbbell Row's own form cue explicitly allows EITHER
// "Both arms simultaneously or alternating" — bilateral vs. single-limb is a
// real fork this project's policy says to surface, not silently default to
// bilateral. angle/equipment are still confidently known (from its own
// exerciseEmgProfiles.js profile, matching ROW_EMG[90] — the same seated/
// chest-supported bucket as Seated Cable Row) — only limb is unresolved.
const NEEDS_CLARIFICATION_ROW_NAMES = {
  'chest-supported dumbbell row': { equipment: 'Dumbbell', angle: 90, reason: 'form cue explicitly allows either bilateral ("both arms simultaneously") or alternating single-arm reps — no single limb count to infer' },
};

function legacyPressMappingFor(exerciseName) {
  return LEGACY_PRESS_NAME_MAP[(exerciseName || '').toLowerCase().trim()] || null;
}

function pressNeedsClarification(exerciseName) {
  return NEEDS_CLARIFICATION_PRESS_NAMES[(exerciseName || '').toLowerCase().trim()] || null;
}

function legacyRowMappingFor(exerciseName) {
  return LEGACY_ROW_NAME_MAP[(exerciseName || '').toLowerCase().trim()] || null;
}

function rowNeedsClarification(exerciseName) {
  return NEEDS_CLARIFICATION_ROW_NAMES[(exerciseName || '').toLowerCase().trim()] || null;
}

// Returns the rewritten lift, or null if `lift` doesn't match a known
// legacy name (nothing to do, OR it needs manual clarification first — see
// planMigration's separate `needsClarification` bucket for those). Preserves
// every other field on the lift untouched, same convention as
// benchPressMigration.js's migratedLiftFor.
function migratedLiftFor(lift) {
  const name = lift?.exercise;
  const press = legacyPressMappingFor(name);
  if (press) {
    return {
      ...lift,
      exercise: CANONICAL_PRESS_NAME,
      equipment: press.equipment,
      angle: press.angle,
      stance: press.stance,
      emgWeights: benchPressEmgProfileForAngle(press.angle),
    };
  }
  const row = legacyRowMappingFor(name);
  if (row) {
    const baseWeights = emgForAngle('row', row.angle);
    return {
      ...lift,
      exercise: CANONICAL_ROW_NAME,
      equipment: row.equipment,
      angle: row.angle,
      ...(row.limb ? { limb: row.limb } : {}),
      ...(row.rotation != null ? { rotation: row.rotation } : {}),
      ...(row.stance ? { stance: row.stance } : {}),
      emgWeights: row.rotation != null
        ? applyGripRotationModifier('row', baseWeights, row.rotation)
        : baseWeights,
    };
  }
  return null;
}

// Dry-run planner: given a flat list of lifts, returns a summary of what
// WOULD change without mutating anything, plus a separate bucket for lifts
// matching a name this migration deliberately declines to guess for. Both
// the CLI's preview output and its real write path call this same function.
function planMigration(lifts) {
  const countsByLegacyName = {};
  const rewrites = [];
  const needsClarification = [];
  for (const lift of (lifts || [])) {
    const clarify = pressNeedsClarification(lift?.exercise) || rowNeedsClarification(lift?.exercise);
    if (clarify) {
      needsClarification.push({ lift, reason: clarify.reason });
      continue;
    }
    const migrated = migratedLiftFor(lift);
    if (!migrated) continue;
    countsByLegacyName[lift.exercise] = (countsByLegacyName[lift.exercise] || 0) + 1;
    rewrites.push({ before: lift, after: migrated });
  }
  return { totalMatched: rewrites.length, countsByLegacyName, rewrites, needsClarification };
}

module.exports = {
  CANONICAL_PRESS_NAME, CANONICAL_ROW_NAME,
  LEGACY_PRESS_NAME_MAP, LEGACY_ROW_NAME_MAP,
  NEEDS_CLARIFICATION_PRESS_NAMES, NEEDS_CLARIFICATION_ROW_NAMES,
  legacyPressMappingFor, legacyRowMappingFor, pressNeedsClarification, rowNeedsClarification,
  migratedLiftFor, planMigration,
};
