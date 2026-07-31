// Estimated EMG muscle activation (% of each muscle's own MVIC/peak) across
// pressing arm-angles and rowing pull-directions, at 15° steps from 0-180°.
// Interpolated from published EMG literature by the athlete, not measured
// continuously by a single study — see the athlete's own methodology notes:
// anchored to real data at three zones for press (90-160° isometric shoulder
// elevation; 0-90° shoulder-flexion/incline-bench; >120° scapular-rotation
// studies), and to the general lats-favor-low-pull /
// upper-back-favors-overhead-pull relationship reported in cable-row and
// lat-pulldown-direction studies for row. Real EMG is noisier than these
// smooth curves; treat the shapes as directional patterns, not universal
// constants. Values can exceed 100 (dynamic contraction can exceed a static
// MVIC reference) — this is expected, not a data error.
//
// Press: 0° = arm at your side, 90° = arm horizontal in front, 180° = arm
// straight overhead. `chest` here is the average of the lower/mid/upper
// pec regions the source data tracked separately -- this taxonomy has a
// single `chest` muscle, not three.
//
// Row: 0° = a low pull (e.g. straight-arm pulldown), 90° = a pull from in
// front (e.g. seated cable row), 180° = an overhead pull (e.g. pull-up).
// This is pull DIRECTION (which row variation), not phase through one rep.

const ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

const PRESS_EMG = {
  0:   { 'front-delt': 15, 'mid-delt': 5,   chest: 15,   biceps: 40, triceps: 30, serratus: 8,  'lower-traps': 5 },
  15:  { 'front-delt': 35, 'mid-delt': 15,  chest: 31.7, biceps: 50, triceps: 38, serratus: 10, 'lower-traps': 7 },
  30:  { 'front-delt': 55, 'mid-delt': 28,  chest: 49,   biceps: 60, triceps: 45, serratus: 14, 'lower-traps': 10 },
  45:  { 'front-delt': 72, 'mid-delt': 42,  chest: 61.7, biceps: 68, triceps: 52, serratus: 18, 'lower-traps': 14 },
  60:  { 'front-delt': 85, 'mid-delt': 58,  chest: 68.7, biceps: 73, triceps: 58, serratus: 24, 'lower-traps': 19 },
  75:  { 'front-delt': 92, 'mid-delt': 73,  chest: 70,   biceps: 76, triceps: 63, serratus: 32, 'lower-traps': 26 },
  90:  { 'front-delt': 97, 'mid-delt': 87,  chest: 66.7, biceps: 78, triceps: 67, serratus: 42, 'lower-traps': 35 },
  105: { 'front-delt': 99, 'mid-delt': 93,  chest: 56,   biceps: 80, triceps: 70, serratus: 55, 'lower-traps': 47 },
  120: { 'front-delt': 100,'mid-delt': 98,  chest: 43.3, biceps: 81, triceps: 73, serratus: 70, 'lower-traps': 60 },
  135: { 'front-delt': 100,'mid-delt': 103, chest: 31.3, biceps: 80, triceps: 76, serratus: 82, 'lower-traps': 72 },
  150: { 'front-delt': 99, 'mid-delt': 109, chest: 21.7, biceps: 78, triceps: 80, serratus: 90, 'lower-traps': 82 },
  165: { 'front-delt': 97, 'mid-delt': 107, chest: 14.3, biceps: 75, triceps: 85, serratus: 95, 'lower-traps': 90 },
  180: { 'front-delt': 95, 'mid-delt': 102, chest: 9.3,  biceps: 72, triceps: 90, serratus: 98, 'lower-traps': 95 },
};

const ROW_EMG = {
  0:   { lats: 95, biceps: 40, 'rear-delt': 10,  'mid-delt': 12, 'mid-traps': 15, rhomboids: 12, 'teres-major': 82, brachioradialis: 55 },
  15:  { lats: 93, biceps: 48, 'rear-delt': 16,  'mid-delt': 20, 'mid-traps': 22, rhomboids: 19, 'teres-major': 78, brachioradialis: 57 },
  30:  { lats: 90, biceps: 56, 'rear-delt': 24,  'mid-delt': 30, 'mid-traps': 31, rhomboids: 28, 'teres-major': 73, brachioradialis: 58 },
  45:  { lats: 85, biceps: 64, 'rear-delt': 34,  'mid-delt': 42, 'mid-traps': 41, rhomboids: 38, 'teres-major': 67, brachioradialis: 60 },
  60:  { lats: 78, biceps: 70, 'rear-delt': 46,  'mid-delt': 55, 'mid-traps': 52, rhomboids: 50, 'teres-major': 61, brachioradialis: 61 },
  75:  { lats: 70, biceps: 76, 'rear-delt': 58,  'mid-delt': 67, 'mid-traps': 63, rhomboids: 62, 'teres-major': 56, brachioradialis: 62 },
  90:  { lats: 62, biceps: 80, 'rear-delt': 68,  'mid-delt': 77, 'mid-traps': 73, rhomboids: 73, 'teres-major': 52, brachioradialis: 63 },
  105: { lats: 54, biceps: 78, 'rear-delt': 77,  'mid-delt': 85, 'mid-traps': 81, rhomboids: 82, 'teres-major': 49, brachioradialis: 62 },
  120: { lats: 46, biceps: 73, 'rear-delt': 85,  'mid-delt': 90, 'mid-traps': 88, rhomboids: 89, 'teres-major': 46, brachioradialis: 61 },
  135: { lats: 38, biceps: 66, 'rear-delt': 91,  'mid-delt': 92, 'mid-traps': 93, rhomboids: 93, 'teres-major': 43, brachioradialis: 60 },
  150: { lats: 32, biceps: 58, 'rear-delt': 95,  'mid-delt': 91, 'mid-traps': 96, rhomboids: 95, 'teres-major': 40, brachioradialis: 58 },
  165: { lats: 27, biceps: 50, 'rear-delt': 98,  'mid-delt': 88, 'mid-traps': 98, rhomboids: 94, 'teres-major': 37, brachioradialis: 57 },
  180: { lats: 23, biceps: 42, 'rear-delt': 100, 'mid-delt': 84, 'mid-traps': 100, rhomboids: 91, 'teres-major': 34, brachioradialis: 55 },
};

const PRESS_ANGLE_DESC = '0° = arm at your side · 90° = arm horizontal, straight out in front · 180° = arm straight overhead';
const ROW_ANGLE_DESC = '0° = a low pull (e.g. straight-arm pulldown) · 90° = a pull from in front (e.g. seated cable row) · 180° = an overhead pull (e.g. pull-up)';

// Frontal-plane companion tables (arm abduction, viewed from behind: 0° =
// elbow tucked at your side, 90° = elbow flared out to horizontal) —
// distinct from PRESS_EMG/ROW_EMG above, which are both sagittal-plane
// (arm moving forward/up in front of the body). These are what actually
// drive the elbow-flare form cue: sections 1-4 pick WHICH exercise/angle
// you're doing, sections 5-6 describe HOW to position your elbows during
// it to hit what that choice already targets. Capped at 90° -- past that
// point the movement stops being pure glenohumeral abduction and becomes
// increasingly scapular, a different mechanism.
// front-delt previously rose in lockstep with mid-delt, peaking at the same
// 90° (fully flared to horizontal) as mid-delt -- biomechanically backwards.
// Anterior deltoid is a flexor/horizontal-adductor; its primary driver is the
// SAGITTAL angle (PRESS_EMG above), not this frontal/abduction axis, which is
// specifically middle deltoid's own governing plane. That means front-delt's
// row here shouldn't just be mid-delt's shape flipped and re-maxed toward a
// new peak either -- each muscle's value is a ratio to THAT muscle's own
// reference (%MVIC, per this file's header), not a shared 0-100 scale being
// competed for, so a value only needs to be as high as genuinely reflects its
// own real sensitivity to this axis. front-delt is a much weaker function of
// elbow flare than mid-delt is (flare isn't its movement), so its range here
// is deliberately modest (~30 points, peak 58 at 30° down to 28 at 90°) --
// comparable to chest's own low-sensitivity range on this same axis (8-18) --
// rather than an inflated near-max peak invented just to win the argmax
// against mid-delt. It still correctly favors a moderate elbow position over
// a full 90° flare, which is what matters for the cue.
const PRESS_FRONTAL_EMG = {
  0:  { 'front-delt': 40, 'mid-delt': 8,   chest: 8,  biceps: 20, triceps: 15, serratus: 5,  'lower-traps': 3 },
  15: { 'front-delt': 52, 'mid-delt': 35,  chest: 12, biceps: 25, triceps: 22, serratus: 6,  'lower-traps': 4 },
  30: { 'front-delt': 58, 'mid-delt': 58,  chest: 15, biceps: 30, triceps: 30, serratus: 8,  'lower-traps': 6 },
  45: { 'front-delt': 52, 'mid-delt': 75,  chest: 17, biceps: 34, triceps: 38, serratus: 11, 'lower-traps': 9 },
  60: { 'front-delt': 44, 'mid-delt': 87,  chest: 18, biceps: 37, triceps: 46, serratus: 15, 'lower-traps': 13 },
  75: { 'front-delt': 35, 'mid-delt': 95,  chest: 18, biceps: 39, triceps: 54, serratus: 22, 'lower-traps': 19 },
  90: { 'front-delt': 28, 'mid-delt': 100, chest: 17, biceps: 40, triceps: 60, serratus: 32, 'lower-traps': 28 },
};

const ROW_FRONTAL_EMG = {
  0:  { lats: 45, biceps: 35, 'rear-delt': 8,  'mid-delt': 10,  'mid-traps': 20, rhomboids: 18, 'teres-major': 40, brachioradialis: 30 },
  15: { lats: 38, biceps: 42, 'rear-delt': 20, 'mid-delt': 35,  'mid-traps': 30, rhomboids: 28, 'teres-major': 35, brachioradialis: 34 },
  30: { lats: 32, biceps: 48, 'rear-delt': 35, 'mid-delt': 58,  'mid-traps': 42, rhomboids: 40, 'teres-major': 30, brachioradialis: 38 },
  45: { lats: 27, biceps: 53, 'rear-delt': 50, 'mid-delt': 75,  'mid-traps': 54, rhomboids: 52, 'teres-major': 26, brachioradialis: 41 },
  60: { lats: 23, biceps: 57, 'rear-delt': 63, 'mid-delt': 87,  'mid-traps': 65, rhomboids: 63, 'teres-major': 22, brachioradialis: 44 },
  75: { lats: 20, biceps: 60, 'rear-delt': 75, 'mid-delt': 95,  'mid-traps': 75, rhomboids: 73, 'teres-major': 19, brachioradialis: 46 },
  90: { lats: 18, biceps: 62, 'rear-delt': 85, 'mid-delt': 100, 'mid-traps': 83, rhomboids: 81, 'teres-major': 17, brachioradialis: 48 },
};

const FRONTAL_ANGLES = [0, 15, 30, 45, 60, 75, 90];

// Elbow-flare form cue: given the sagittal (which-exercise-and-angle)
// weighted profile an exercise already carries, finds the frontal-plane
// angle that best serves the muscle THAT profile already emphasizes most —
// a "how to execute this correctly" cue, not a suggestion to target a
// different muscle. Returns null if nothing in the sagittal profile overlaps
// what the frontal table tracks, OR if the dominant muscle's own row barely
// moves across this axis (chest, for instance, only ranges 8-18 here — real,
// but not a meaningful axis to hang a cue on). That "does this axis actually
// matter for this muscle" range check mirrors gripCueForProfile's identical
// guard below (min range 10) — previously missing here, which meant a
// flat-for-this-axis muscle could still win an argmax comparison and produce
// a confident-sounding cue the underlying ratio didn't actually support.
// Elbow-flexion/grip synergists present in both patterns -- present in
// every press and row regardless of angle, so letting one of these "win"
// the dominant-muscle pick would produce a technically-true but useless cue
// (row EMG peaks for biceps at the same angle as its back muscles do, but
// "flare your elbows for biceps" isn't what a row's elbow position is for).
const ACCESSORY_MUSCLES = ['biceps', 'triceps', 'brachioradialis'];
const FRONTAL_CUE_MIN_RANGE = 11; // chest's own row here ranges exactly 10 (8-18) -- the smallest real case this guard needs to catch

function frontalCueForProfile(pattern, sagittalWeights) {
  const frontalTable = pattern === 'press' ? PRESS_FRONTAL_EMG : pattern === 'row' ? ROW_FRONTAL_EMG : null;
  if (!frontalTable || !sagittalWeights) return null;
  const tracked = Object.keys(frontalTable[0]);
  const candidates = Object.entries(sagittalWeights).filter(([m]) => tracked.includes(m) && !ACCESSORY_MUSCLES.includes(m));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b[1] - a[1]);
  const [muscle] = candidates[0];
  let bestAngle = FRONTAL_ANGLES[0], bestVal = -Infinity, worstVal = Infinity;
  for (const a of FRONTAL_ANGLES) {
    const v = frontalTable[a][muscle];
    if (v > bestVal) { bestVal = v; bestAngle = a; }
    if (v < worstVal) worstVal = v;
  }
  if (bestVal - worstVal < FRONTAL_CUE_MIN_RANGE) return null;
  return { muscle, angle: bestAngle };
}

// Grip-rotation companion tables (rotation of the hand/forearm about its
// own long axis, independent of shoulder angle): 0° = fully pronated
// (overhand), 90° = neutral (thumb up), 180° = fully supinated (underhand).
// A third, independent axis from the sagittal (which exercise/angle) and
// frontal (elbow flare) ones above -- matters far more for the elbow-flexor
// synergists (biceps, brachioradialis) and, for rows, lower-traps, than for
// the actual prime movers, which barely move across grip rotation.
const GRIP_ANGLES = [0, 45, 90, 135, 180];

const PRESS_GRIP_EMG = {
  0:   { biceps: 55, brachioradialis: 60, brachialis: 60, 'front-delt': 70, triceps: 65 },
  45:  { biceps: 65, brachioradialis: 63, brachialis: 60, 'front-delt': 68, triceps: 65 },
  90:  { biceps: 72, brachioradialis: 65, brachialis: 60, 'front-delt': 71, triceps: 64 },
  135: { biceps: 80, brachioradialis: 68, brachialis: 60, 'front-delt': 65, triceps: 64 },
  180: { biceps: 85, brachioradialis: 72, brachialis: 60, 'front-delt': 60, triceps: 63 },
};

const ROW_GRIP_EMG = {
  0:   { biceps: 45, brachioradialis: 55, lats: 70, 'lower-traps': 80, 'rear-delt': 60 },
  45:  { biceps: 58, brachioradialis: 60, lats: 74, 'lower-traps': 70, 'rear-delt': 60 },
  90:  { biceps: 68, brachioradialis: 63, lats: 76, 'lower-traps': 60, 'rear-delt': 61 },
  135: { biceps: 80, brachioradialis: 68, lats: 80, 'lower-traps': 50, 'rear-delt': 61 },
  180: { biceps: 90, brachioradialis: 72, lats: 85, 'lower-traps': 40, 'rear-delt': 62 },
};

const GRIP_LABELS = { 0: 'pronated (overhand)', 45: 'lightly pronated', 90: 'neutral (thumb up)', 135: 'lightly supinated', 180: 'supinated (underhand)' };

// Not every piece of equipment actually lets you choose your grip. A
// straight barbell only offers pronated or supinated (true neutral needs a
// specialty bar, not assumed available); a fixed-handle machine offers
// whatever single grip its handles were built with, not a choice at all;
// dumbbells and cable attachments genuinely rotate/swap freely, so the full
// range is fair game. Conservative on purpose -- no per-exercise handle
// data exists, so 'machine' gets no recommendable grip at all rather than
// guessing it has one.
const GRIP_ANGLES_BY_EQUIPMENT = {
  barbell: [0, 180],
  dumbbell: GRIP_ANGLES,
  cable: GRIP_ANGLES,
  machine: [],
};

// Grip form cue: unlike frontalCueForProfile, doesn't exclude the
// elbow-flexor synergists -- they're the whole point of this table. Picks
// whichever muscle this exercise meaningfully trains (>=SECONDARY_THRESHOLD
// in its sagittal profile) swings the MOST across grip rotation, since a
// muscle grip barely affects (front-delt, triceps, rear-delt all move <15
// points across the whole table) isn't worth a cue even if it's the
// exercise's dominant target. Returns null if nothing meaningfully swings.
// `availableAngles` restricts both the "does grip matter" check and the
// recommendation itself to what's actually achievable on this equipment --
// defaults to the full range for callers that don't know/care about
// equipment (e.g. tests exercising the pure EMG logic).
function gripCueForProfile(pattern, sagittalWeights, availableAngles = GRIP_ANGLES) {
  const gripTable = pattern === 'press' ? PRESS_GRIP_EMG : pattern === 'row' ? ROW_GRIP_EMG : null;
  if (!gripTable || !sagittalWeights || !availableAngles.length) return null;
  const tracked = Object.keys(gripTable[0]);
  const relevant = tracked.filter(m => (sagittalWeights[m] || 0) >= SECONDARY_THRESHOLD);
  if (!relevant.length) return null;

  let muscle = null, bestRange = -Infinity;
  for (const m of relevant) {
    const vals = availableAngles.map(a => gripTable[a][m]);
    const range = Math.max(...vals) - Math.min(...vals);
    if (range > bestRange) { bestRange = range; muscle = m; }
  }
  // Also covers the single-grip case (only one achievable angle -- range is
  // always 0 -- so there's genuinely nothing to recommend between).
  if (bestRange < 10) return null;

  let angle = availableAngles[0], bestVal = -Infinity;
  for (const a of availableAngles) {
    const v = gripTable[a][muscle];
    if (v > bestVal) { bestVal = v; angle = a; }
  }
  return { muscle, angle, grip: GRIP_LABELS[angle] };
}

// Applies the grip-rotation axis (PRESS_GRIP_EMG/ROW_GRIP_EMG) on top of an
// already-resolved sagittal (angle) weight vector -- promotes rotation from
// an advisory cue (gripCueForProfile above) to a real modifier on what gets
// credited, once a rotation is actually chosen at log time (see
// PressRowBuilder in src/app.jsx). The grip tables track only a SUBSET of
// muscles the sagittal tables do (biceps/brachioradialis/brachialis/
// front-delt/triceps for press; biceps/brachioradialis/lats/lower-traps/
// rear-delt for row), not the full PRESS_EMG/ROW_EMG set (chest, mid-delt,
// serratus, rhomboids, mid-traps, teres-major, etc.) -- so this can only
// ever be a MODIFIER on the subset it tracks, never a full replacement
// vector. Same "secondary axis adjusts a subset of a primary table"
// architecture as movementEmg.js's CALF_SEATED_MODIFIER/
// SHRUG_BAR_PATH_MODIFIER/ROTATOR_CUFF_ELEVATION_MODIFIER, adapted to be
// applied programmatically here (those are all hand-baked into a fixed
// per-exercise static profile at curation time; rotation instead needs to
// combine with whichever angle a given exercise instance actually used,
// which isn't known until log time).
//
// The delta applied for a tracked muscle at a given rotation is that
// muscle's grip-table value AT that rotation minus its own MEAN across
// GRIP_ANGLES -- not the raw grip-table value itself. The grip table was
// curated purely as a function of rotation, with no sagittal angle held
// constant, so its numbers can't be read as "the muscle's true % at this
// rotation" the way PRESS_EMG/ROW_EMG's numbers can; centering on the
// table's own mean turns each entry into a directional nudge ("this
// rotation trains this muscle more/less than a typical rotation would")
// without asserting a false absolute reading. For a muscle the sagittal
// table doesn't track at all (brachioradialis/brachialis for press;
// lower-traps for row), there's no base value to nudge -- the grip table's
// own value is credited directly instead, since any credit here is
// strictly new information (that muscle wasn't part of the vector at all
// before an explicit rotation was chosen).
function applyGripRotationModifier(pattern, baseWeights, rotationAngle) {
  const gripTable = pattern === 'press' ? PRESS_GRIP_EMG : pattern === 'row' ? ROW_GRIP_EMG : null;
  if (!gripTable || !baseWeights || rotationAngle == null || !gripTable[rotationAngle]) return baseWeights;
  const tracked = Object.keys(gripTable[GRIP_ANGLES[0]]);
  const out = { ...baseWeights };
  for (const muscle of tracked) {
    const acrossRotation = GRIP_ANGLES.map(a => gripTable[a][muscle]);
    const mean = acrossRotation.reduce((a, b) => a + b, 0) / acrossRotation.length;
    const atRotation = gripTable[rotationAngle][muscle];
    out[muscle] = muscle in baseWeights ? Math.max(0, baseWeights[muscle] + (atRotation - mean)) : atRotation;
  }
  return out;
}

// ---------------------------------------------------------------------
// Row grip-WIDTH (hand spacing along the bar -- close/medium/wide) --
// physically distinct from grip ROTATION above (rotation is the hand
// turning about its own long axis; width is lateral hand spacing). Row
// only, per .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §10 --
// Bench Press's own grip-width work is separate, ongoing elsewhere in this
// codebase and not built here. Barbell and Machine equipment only --
// Dumbbell has no fixed "width" (each hand holds an independent implement,
// nothing to space along a shared bar), Cable's analogous choice is
// attachment type (rope/straight bar/V-handle), a related but distinct
// parameter, out of scope here.
//
// Sources:
// - Padovan, Cè, Longo, Tornatore, Trentin, Esposito & Coratella,
//   "High-Density Surface Electromyography Excitation of Prime Movers in
//   the Narrow vs. Wide Grip Seated Row Exercise," Journal of Human
//   Kinetics (Univ. of Milan biomechanics/exercise-physiology group) -- 14
//   resistance-trained men, 8RM narrow vs. wide seated cable row, HD-sEMG,
//   concentric+eccentric phases. Narrow grip showed greater latissimus
//   dorsi amplitude in both phases (large effect, ES≈1.08); wide grip
//   showed greater upper/middle/lower trapezius (ES 0.90-2.79 -- the
//   largest effects in the whole study) and lateral deltoid (ES 1.03/0.58)
//   amplitude. This directly grounds this table's lats (close > wide) and
//   rhomboids (wide > close -- proxy, see below) columns. Same research
//   group and HD-sEMG methodology as this codebase's existing close/wide
//   lat-pulldown grip numbers (functions/exerciseEmgProfiles.js) and their
//   companion lat-pulldown grip-variation replication (PMC12452428,
//   "Electromyographic Analysis of Back Muscle Activation During Lat
//   Pulldown Exercise: Effects of Grip Variations and Forearm
//   Orientation") -- converging support for the same close-favors-lats/
//   wide-favors-scapular-retractors pattern across this whole exercise
//   family, not a one-off finding.
// - The study itself is two-point (narrow vs. wide); this table's 'medium'
//   column is this codebase's own interpolated midpoint -- same convention
//   PRESS_EMG/ROW_EMG themselves already use (their own header notes
//   they're "anchored to real data at three zones," not raw continuous
//   study data).
//
// Approximations flagged honestly, not hidden:
// - rhomboids has no real surface-EMG measurement in the source study --
//   it's a deep muscle under trapezius, not reliably isolable by surface
//   electrodes. Its column here tracks the same direction and rough
//   magnitude as the study's measured mid-trapezius (a synergist in the
//   same scapular-retraction action) -- the same taxonomy-proxy principle
//   movementEmg.js already uses throughout for muscles this app's 31-
//   muscle taxonomy has no dedicated surface-measurable head for.
// - rear-delt's column is a smaller, lower-confidence swing than lats/
//   rhomboids -- the study's own significant-effect list names LATERAL
//   deltoid (this taxonomy's `mid-delt`), not posterior deltoid
//   specifically, as swinging with grip width. Posterior deltoid is
//   plausibly a smaller, same-direction synergist (recruited alongside the
//   trapezius/rhomboid retraction group), not a muscle this specific study
//   reported a confident number for -- kept modest rather than invented.
// - biceps' column is a modest, reasoned width-only estimate, deliberately
//   NOT copied from the larger close/wide lat-pulldown biceps swing already
//   in exerciseEmgProfiles.js (73 vs. 50) -- those numbers are confounded
//   with a simultaneous forearm-ROTATION change (close-grip pulldown is
//   typically neutral/underhand, wide-grip typically pronated), a confound
//   Signorile et al. (2002) -- the original source behind those numbers --
//   explicitly flagged in their own discussion as unresolved. This table's
//   biceps swing reflects width alone, rotation held constant, matching
//   the isolation the Padovan et al. row study's own two-grip design (same
//   handle, same orientation, width only) actually achieves.
const GRIP_WIDTHS = ['close', 'medium', 'wide'];
const GRIP_WIDTH_LABELS = { close: 'close grip', medium: 'medium (shoulder-width) grip', wide: 'wide grip' };

const ROW_GRIP_WIDTH_EMG = {
  close:  { lats: 88, 'rear-delt': 58, rhomboids: 62, biceps: 78 },
  medium: { lats: 74, 'rear-delt': 63, rhomboids: 73, biceps: 70 },
  wide:   { lats: 58, 'rear-delt': 68, rhomboids: 85, biceps: 62 },
};

// Machine reuse -- design doc §10 "approach 2" (best-effort), not the full
// per-model research pass "approach 1" would require. No per-exercise
// handle-position catalog exists (machineModels.js/machineBrands.js don't
// track handle configuration at all), but unlike grip rotation's 'machine'
// -> [] above -- where a fixed-handle machine genuinely offers no choice at
// all -- most plate-loaded/selectorized row machines DO offer multiple
// handle positions along a fixed bar/frame, structurally the same kind of
// choice a barbell offers. Applying the barbell-derived table here is an
// approximation flagged at functions/resistanceCurves.js's lower,
// best-effort rigor tier, not the full-citation confidence the barbell
// numbers above carry for barbell specifically.
const GRIP_WIDTH_BY_EQUIPMENT = {
  barbell: GRIP_WIDTHS,
  machine: GRIP_WIDTHS,
  dumbbell: [],
  cable: [],
};

// Pulldown/pull-up "handle style" -> angle, per
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §15: at/above
// ROW_PULLDOWN_ANGLE region (functions/exerciseLabelMatching.js), grip width
// stops being an independent delta-modifier (ROW_GRIP_WIDTH_EMG above) and
// starts DIRECTLY SELECTING the angle instead -- picking a handle style IS
// picking how close to true-overhead the pull is. Not a new EMG table: these
// are exactly the angles §15 confirmed against every existing named pull-up/
// pulldown entry's own lats value in exerciseEmgProfiles.js. 'close' here is
// a close/underhand-style grip (Close-Grip Lat Pulldown), distinct from the
// close/medium/wide row-width vocabulary below 120° -- offered as a
// convenience label over the same angle slider, not a second parallel axis.
const PULLDOWN_HANDLE_ANGLES = { close: 120, neutral: 135, wide: 165, 'behind-neck': 180 };
const PULLDOWN_HANDLE_LABELS = {
  close: 'Close-Grip Pulldown', neutral: 'Neutral / Chin-Up Grip', wide: 'Wide-Grip Pulldown / Pull-Up', 'behind-neck': 'Behind-Neck',
};

// Row-only counterpart to applyGripRotationModifier -- identical "delta
// from the table's own mean, subset of a base vector" mechanism (see that
// function's comment for the full reasoning). All four tracked muscles
// (lats, rear-delt, rhomboids, biceps) already appear in ROW_EMG's own key
// set, so there's no "new muscle absent from the base vector" case here
// the way rotation has for brachioradialis/brachialis/lower-traps.
// Deliberately independent of applyGripRotationModifier -- both are
// additive nudges off the same base vector, not a combined interaction
// term, matching this file's general "each axis is estimated separately"
// approach rather than modeling how rotation and width might interact.
function applyGripWidthModifier(baseWeights, widthKey) {
  const widthProfile = ROW_GRIP_WIDTH_EMG[widthKey];
  if (!baseWeights || !widthProfile) return baseWeights;
  const out = { ...baseWeights };
  for (const muscle of Object.keys(widthProfile)) {
    const acrossWidths = GRIP_WIDTHS.map(w => ROW_GRIP_WIDTH_EMG[w][muscle]);
    const mean = acrossWidths.reduce((a, b) => a + b, 0) / acrossWidths.length;
    out[muscle] = muscle in baseWeights
      ? Math.max(0, baseWeights[muscle] + (widthProfile[muscle] - mean))
      : widthProfile[muscle];
  }
  return out;
}

// Threshold used to collapse a weighted EMG profile into a normal
// primary/secondary muscle split for every OTHER consumer of the shared
// exercise taxonomy (session generation, staleness tracking, PR/strength-
// level tracking) -- those all resolve muscles through a single shared,
// unweighted lookup (see ARCHITECTURE.md's "muscle-taxonomy architecture"),
// so a genuinely new exercise still needs a primary/secondary classification
// to be visible to them. Only functions/fatigue.js uses the raw weighted %
// directly (per-lift emgWeights), since it works from actual lift records
// rather than a static exercise database.
const PRIMARY_THRESHOLD = 60;
const SECONDARY_THRESHOLD = 25;

function classifyMuscles(weights) {
  const primary = [], secondary = [];
  for (const [muscle, pct] of Object.entries(weights)) {
    if (pct >= PRIMARY_THRESHOLD) primary.push(muscle);
    else if (pct >= SECONDARY_THRESHOLD) secondary.push(muscle);
  }
  return { primary, secondary };
}

function emgForAngle(pattern, angle) {
  const table = pattern === 'press' ? PRESS_EMG : pattern === 'row' ? ROW_EMG : null;
  return table ? (table[angle] || null) : null;
}

module.exports = {
  ANGLES, PRESS_EMG, ROW_EMG, PRESS_ANGLE_DESC, ROW_ANGLE_DESC,
  PRESS_FRONTAL_EMG, ROW_FRONTAL_EMG, FRONTAL_ANGLES,
  PRESS_GRIP_EMG, ROW_GRIP_EMG, GRIP_ANGLES, GRIP_LABELS, GRIP_ANGLES_BY_EQUIPMENT,
  GRIP_WIDTHS, GRIP_WIDTH_LABELS, ROW_GRIP_WIDTH_EMG, GRIP_WIDTH_BY_EQUIPMENT,
  PULLDOWN_HANDLE_ANGLES, PULLDOWN_HANDLE_LABELS,
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD, classifyMuscles, emgForAngle, frontalCueForProfile, gripCueForProfile,
  applyGripRotationModifier, applyGripWidthModifier,
};
