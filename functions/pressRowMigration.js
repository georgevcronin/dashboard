// Press/Row Phase 2 migration — PURE LOGIC ONLY, no Firestore access here.
// Computes what rewriting a historical lift logged under one of the now-
// superseded Overhead/Shoulder Press or pull-up/lat-pulldown names would
// look like under the unified 'Bench Press' (§14) / 'Row' (§15) entities.
// Same safety pattern as functions/benchPressMigration.js — see that file's
// own header for why this is split from the CLI that actually touches
// Firestore (functions/scripts/migratePressRow.js).
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
const { emgForAngle } = require('./emgActivation');

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
    return {
      ...lift,
      exercise: CANONICAL_ROW_NAME,
      equipment: row.equipment,
      angle: row.angle,
      ...(row.limb ? { limb: row.limb } : {}),
      emgWeights: emgForAngle('row', row.angle),
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
    const clarify = pressNeedsClarification(lift?.exercise);
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
  LEGACY_PRESS_NAME_MAP, LEGACY_ROW_NAME_MAP, NEEDS_CLARIFICATION_PRESS_NAMES,
  legacyPressMappingFor, legacyRowMappingFor, pressNeedsClarification,
  migratedLiftFor, planMigration,
};
