// Feature-vector -> display-name matching, per
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §0 ("the UX stays
// name-first, the backend stays feature-first") and §14 (Press) / §15 (Row).
// A logged exercise instance's real identity is its feature vector
// (equipment/angle/stance/...), stored once per exercise-instance same as
// ex.machine/ex.pulleyType (§6); the display NAME shown to the athlete is
// derived from that vector, not the other way around. This is the shared,
// reusable mechanism §14 calls for explicitly ("worth building as the
// shared, reusable mechanism... rather than a one-off if-chain specific to
// Press, since Row's own labels... need the exact same kind of multi-field
// match") -- both matchPressLabel and matchRowLabel are real functions here,
// not duplicated inline logic in src/app.jsx.
//
// Boundaries are implemented as midpoints between the table's own anchor
// points (see PRESS_LABEL_TABLE) rather than exact-value switches, so the
// match stays well-defined for any angle, not just the picker's own 15° grid
// points -- e.g. a value snapped from a different (native 0-180) scale, or a
// future finer-grained picker, still resolves sensibly.

// §14's resolved table (unified Press angle scale: 0 = Flat, positive =
// toward incline/shoulder/overhead, negative = toward decline/dip --
// extends the sign convention the Bench Press pilot already shipped).
// Stance only matters at/above the Overhead/Shoulder boundary -- below that,
// every region has one label regardless of stance (§14 doesn't distinguish
// e.g. a seated vs standing Incline Press).
const PRESS_LABEL_TABLE = [
  { maxAngle: -52.5, label: 'Dip / Tricep Press' },
  { maxAngle: -7.5, label: 'Decline Press' },
  { maxAngle: 7.5, label: 'Bench Press' },
  { maxAngle: 37.5, label: 'Incline Press' },
  { maxAngle: 52.5, label: 'Incline Shoulder Press' },
  // No maxAngle -- the open-ended "+60° and above" region; stance decides
  // which of the two labels applies (see matchPressLabel).
];

const PRESS_STANCE_OPTIONS = ['standing', 'seated'];
const PRESS_STANCE_LABELS = { standing: 'Standing', seated: 'Seated' };

function matchPressLabel({ angle, stance } = {}) {
  const a = angle == null || Number.isNaN(+angle) ? 0 : +angle;
  for (const region of PRESS_LABEL_TABLE) {
    if (a < region.maxAngle) return region.label;
  }
  // +60° and above: same angle region, different label depending on
  // Stance/Support (§12) -- standing is the default per §4's "Shoulder
  // Press -> 75°" migration convention reading as the generic/unmarked case.
  return stance === 'seated' ? 'Shoulder Press' : 'Overhead Press';
}

// §15's resolved fold-in: Pull-up/Lat Pulldown are the Row axis's own upper
// (and one lower) anchor, not a separate pattern. The boundary is angle,
// not equipment -- roughly, angle >= 120 with cable/machine/bodyweight
// equipment reads as Pulldown/Pull-up, not generic Row (matches the six
// named entries §15 confirmed against ROW_EMG's own angle table: 120/135/
// 150/165/180 = pulldown/pull-up family; the one entry below that, Cable
// Straight-Arm Pulldown at 0°, keeps its own separate, non-parameterized
// identity -- see exerciseDb.js's own comment on why it's not folded in
// despite sharing the same angle axis).
const ROW_PULLDOWN_ANGLE_THRESHOLD = 120;

const ROW_STANCE_OPTIONS = ['standing', 'chest-supported'];
const ROW_STANCE_LABELS = { standing: 'Standing / Bent-Over', 'chest-supported': 'Chest-Supported' };

function matchRowLabel({ angle, equipment } = {}) {
  const a = angle == null || Number.isNaN(+angle) ? 90 : +angle;
  if (a < ROW_PULLDOWN_ANGLE_THRESHOLD) return 'Row';
  return (equipment || '').toLowerCase() === 'bodyweight' ? 'Pull-up' : 'Lat Pulldown';
}

// Single entry point per §14/§15 -- dispatches on pattern so callers (the
// picker UI, the migration script) don't need to know which table applies.
function matchExerciseName(pattern, features) {
  if (pattern === 'press') return matchPressLabel(features);
  if (pattern === 'row') return matchRowLabel(features);
  return null;
}

module.exports = {
  PRESS_LABEL_TABLE, PRESS_STANCE_OPTIONS, PRESS_STANCE_LABELS,
  ROW_PULLDOWN_ANGLE_THRESHOLD, ROW_STANCE_OPTIONS, ROW_STANCE_LABELS,
  matchPressLabel, matchRowLabel, matchExerciseName,
};
