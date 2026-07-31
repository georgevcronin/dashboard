// Bench Press pilot migration — PURE LOGIC ONLY, no Firestore access here.
// Computes what rewriting a historical lift logged under one of the six
// now-superseded bench-press names would look like under the new
// parameterized 'Bench Press' model (canonical name + equipment + angle).
// See .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md ("Migration
// mechanics — RESOLVED, with standard angle conventions set") for the design
// this implements.
//
// ⚠️ NOT WIRED INTO ANYTHING. Nothing in index.js, app startup, or any
// request path calls this file. The only thing that actually mutates real
// data is functions/scripts/migrateBenchPress.js, a standalone CLI a human
// must run explicitly (dry-run by default). Keeping the logic here, separate
// from that I/O shell, means it's safe to import and unit-test freely
// (test/benchPressMigration.test.js) without ever touching Firestore, and
// means the CLI's dry-run preview and its real write path can never silently
// diverge — both call exactly this function.
//
// Angle conventions (no per-athlete signal exists to infer real degrees
// from — gyms don't record incline angle, so these are the design doc's
// stated standard conventions, not a measurement):
//   Flat -> 0°, Incline -> 30°, Decline -> -15°
// Equipment is read directly off which of the six legacy names was logged
// (Barbell vs. Dumbbell is literally what those names already encode — no
// inference needed).
//
// Close-Grip Bench Press is deliberately NOT in this map — see
// exerciseDb.js's own comment: it's a grip-width variant, not an angle
// variant, and the design doc explicitly keeps it a separate, non-
// parameterized entry.
const { benchPressEmgProfileForAngle } = require('./exerciseEmgProfiles');

const CANONICAL_NAME = 'Bench Press';

const LEGACY_NAME_MAP = {
  'barbell bench press': { equipment: 'Barbell', angle: 0 },
  'incline barbell bench press': { equipment: 'Barbell', angle: 30 },
  'decline barbell bench press': { equipment: 'Barbell', angle: -15 },
  'dumbbell bench press (flat)': { equipment: 'Dumbbell', angle: 0 },
  'dumbbell incline bench press': { equipment: 'Dumbbell', angle: 30 },
  'dumbbell decline bench press': { equipment: 'Dumbbell', angle: -15 },
};

function legacyMappingFor(exerciseName) {
  return LEGACY_NAME_MAP[(exerciseName || '').toLowerCase().trim()] || null;
}

function isLegacyBenchLift(lift) {
  return !!legacyMappingFor(lift?.exercise);
}

// Returns the rewritten lift, or null if `lift` doesn't match one of the six
// legacy names (nothing to do). Preserves every other field on the lift
// untouched (kg/reps/rpe/date/type/machine/whatever else it carries) — only
// exercise/equipment/angle/emgWeights change. emgWeights is stamped in too,
// not just angle, so historical fatigue attribution for incline/decline
// entries doesn't silently regress to the flat-only static fallback once the
// name changes (functions/fatigue.js checks a lift's own emgWeights before
// falling back to exerciseEmgProfiles.js's name-keyed table).
function migratedLiftFor(lift) {
  const mapping = legacyMappingFor(lift?.exercise);
  if (!mapping) return null;
  return {
    ...lift,
    exercise: CANONICAL_NAME,
    equipment: mapping.equipment,
    angle: mapping.angle,
    emgWeights: benchPressEmgProfileForAngle(mapping.angle),
  };
}

// Dry-run planner: given a flat list of lifts (agnostic to how they were
// loaded — doesn't know or care about Firestore's chunking), returns a
// summary of what WOULD change without mutating anything. Both the CLI's
// preview output and its real write path call this same function.
function planMigration(lifts) {
  const countsByLegacyName = {};
  const rewrites = [];
  for (const lift of (lifts || [])) {
    const mapping = legacyMappingFor(lift?.exercise);
    if (!mapping) continue;
    countsByLegacyName[lift.exercise] = (countsByLegacyName[lift.exercise] || 0) + 1;
    rewrites.push({ before: lift, after: migratedLiftFor(lift) });
  }
  return { totalMatched: rewrites.length, countsByLegacyName, rewrites };
}

module.exports = { CANONICAL_NAME, LEGACY_NAME_MAP, legacyMappingFor, isLegacyBenchLift, migratedLiftFor, planMigration };
