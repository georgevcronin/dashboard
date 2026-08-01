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
//
// Fly: the angle the arms make with the torso at full contraction (finish
// position), NOT shoulder flexion through the rep like press. 0° = a
// high-to-low cable fly finishing with arms pinned near the hips (lower-pec
// line of pull); 90° = a flat/mid fly finishing with arms extended forward
// at chest height; 180° = a low-to-high cable fly finishing with arms
// raised high, near overhead (upper-pec line of pull). Grounded in Lauver
// et al. 2020 (steeper incline shifts load toward front-delt and upper
// pec) and the directional lower/upper-pec findings behind functions/
// chestHeadSplit.js's own bench-angle split; front-delt dumbbell-fly
// baseline (~18.8% MVIC at the flat/mid position) from EMG literature on
// shoulder-exercise comparisons. No single study tracked mid-delt/biceps/
// serratus continuously across this exact axis -- directional estimates,
// same caveat as press/row above. mid-delt rises sharply toward 180°
// because a low-to-high finish approaches a lateral-raise-like overhead
// reach, a real abduction component press/row's own axes don't have.
// biceps stays low and roughly flat -- a fly holds a fixed elbow bend
// isometrically rather than actively curling.
//
// Curl: like fly, an interpretive arm-position axis rather than a literal
// single joint angle, since curl variants differ by SHOULDER position, not
// elbow angle through the rep (the elbow does the same flexion motion at
// every variant). 0° = incline curl (shoulder extended, arm hangs behind
// the torso -- stretches biceps' long head at the bottom of each rep); 90°
// = standing curl (arm at your side, neutral shoulder); 180° = preacher
// curl (shoulder flexed, arm braced in front of the torso, elbow "locked"
// against a pad). Grounded in EMG/hypertrophy literature comparing these
// three variants: preacher curl biases the short head and brachialis (the
// locked-elbow position isolates brachialis's pure elbow-flexion role more
// than a free-swinging variant); incline curl biases the long head via the
// behind-torso stretch. This taxonomy has a single `biceps` muscle, not a
// long/short-head split, so `biceps` here reflects overall biceps
// engagement (found to be broadly comparable in total amplitude across
// variants in the literature -- the real differences are head-specific,
// which this table can't represent) while `brachialis` is genuinely
// direction-sensitive to this axis on its own.
//
// Extension: same directional convention as press (0° = arm at your side,
// 180° = arm overhead) since a tricep extension's arm-position axis is
// literally the same physical range press's axis already describes. `front-
// delt` climbs toward 180° because holding an overhead extension position
// genuinely engages the shoulder isometrically, not because it's a major
// contributor at 0°. `triceps` stays high and fairly flat throughout --
// any solid extension angle trains it well; the real head-specific
// tradeoff (long head favors overhead, per Maeo et al. 2023's stretch-
// mediated hypertrophy finding -- it's biarticular, crossing the shoulder
// as well as the elbow, so shoulder position lengthens it more; lateral/
// medial are monoarticular and not meaningfully affected by arm position)
// is informational-only, see functions/tricepsHeadSplit.js -- this table
// can't represent it either, same reasoning as press/fly's single `chest`.
//
// NOTE on pattern-name overload: functions/exerciseDb.js already tags leg
// curl exercises with pattern "curl" and hyperextension/back-extension
// exercises with pattern "extension" (a coarse, body-part-agnostic
// movement-SHAPE taxonomy, pre-dating this file's per-pattern EMG tables).
// Leg Curl and Hyperextension below deliberately use their OWN distinct
// pattern strings ("leg-curl", "hyperextension") for THIS file's dispatch,
// specifically so emgForAngle('curl', angle) can never accidentally return
// leg-curl muscles for a bicep-curl lookup or vice versa. This means the
// new isAngleFamily leg-curl/hyperextension entries won't share
// sessionPlanner.js's same-pattern redundancy guard with the EXISTING
// static leg-curl/hyperextension exercises (which still use exerciseDb.js's
// original coarser "curl"/"extension" tags) -- a pre-existing overload in
// that taxonomy, not something introduced here, and out of scope to fix.
//
// Leg Curl: 0° = lying/prone leg curl (hip extended, ~30°) through 180° =
// seated leg curl (hip flexed, ~90°). Grounded in Maeo et al. 2020: the
// biarticular hamstrings (semimembranosus, semitendinosus, long head of
// biceps femoris -- the majority of hamstring mass) are lengthened more in
// the hip-flexed seated position, and significantly outgrew the lying
// position over a 12-week trial. `calves` (gastrocnemius, itself
// biarticular at the knee) stays modest and roughly flat -- no literature
// found suggesting real angle-sensitivity there specifically.
//
// Hyperextension: unlike every other table here, this is NOT an
// interpretive 0-180 axis -- there is no continuously-adjustable real
// equipment for this movement, only two distinct fixed device types (a
// ~45° pad and a ~90° "Roman chair"/GHD). Keyed directly by the REAL pad
// angle (45 and 90 only, not the usual 15°-step 0-180 grid) rather than
// inventing interpolated values with no equipment to check them against.
// Grounded in EMG comparison of 45° vs. 90° back-extension devices: 90°
// shifts emphasis toward glutes/erectors with less biceps-femoris
// (hamstring) involvement; 45° opens up hamstring involvement more.
// `erectors` stays dominant and fairly flat at both -- it's the namesake
// mover of "back extension" regardless of device.

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

const FLY_EMG = {
  0:   { chest: 55, 'front-delt': 8,  'mid-delt': 4,  biceps: 10, serratus: 10 },
  15:  { chest: 62, 'front-delt': 10, 'mid-delt': 4,  biceps: 10, serratus: 13 },
  30:  { chest: 68, 'front-delt': 12, 'mid-delt': 5,  biceps: 9,  serratus: 16 },
  45:  { chest: 72, 'front-delt': 14, 'mid-delt': 5,  biceps: 9,  serratus: 20 },
  60:  { chest: 74, 'front-delt': 16, 'mid-delt': 6,  biceps: 8,  serratus: 24 },
  75:  { chest: 75, 'front-delt': 18, 'mid-delt': 7,  biceps: 8,  serratus: 28 },
  90:  { chest: 74, 'front-delt': 19, 'mid-delt': 8,  biceps: 8,  serratus: 32 },
  105: { chest: 71, 'front-delt': 21, 'mid-delt': 10, biceps: 8,  serratus: 38 },
  120: { chest: 66, 'front-delt': 24, 'mid-delt': 13, biceps: 9,  serratus: 45 },
  135: { chest: 58, 'front-delt': 27, 'mid-delt': 17, biceps: 9,  serratus: 53 },
  150: { chest: 48, 'front-delt': 30, 'mid-delt': 22, biceps: 10, serratus: 60 },
  165: { chest: 38, 'front-delt': 32, 'mid-delt': 28, biceps: 11, serratus: 66 },
  180: { chest: 30, 'front-delt': 34, 'mid-delt': 35, biceps: 12, serratus: 70 },
};

const CURL_EMG = {
  0:   { biceps: 70, brachialis: 40, brachioradialis: 30 },
  15:  { biceps: 74, brachialis: 42, brachioradialis: 32 },
  30:  { biceps: 78, brachialis: 45, brachioradialis: 34 },
  45:  { biceps: 82, brachialis: 48, brachioradialis: 36 },
  60:  { biceps: 85, brachialis: 52, brachioradialis: 38 },
  75:  { biceps: 87, brachialis: 56, brachioradialis: 40 },
  90:  { biceps: 88, brachialis: 60, brachioradialis: 42 },
  105: { biceps: 86, brachialis: 65, brachioradialis: 40 },
  120: { biceps: 83, brachialis: 70, brachioradialis: 38 },
  135: { biceps: 78, brachialis: 76, brachioradialis: 35 },
  150: { biceps: 72, brachialis: 82, brachioradialis: 32 },
  165: { biceps: 65, brachialis: 88, brachioradialis: 28 },
  180: { biceps: 58, brachialis: 95, brachioradialis: 25 },
};

const EXTENSION_EMG = {
  0:   { triceps: 85, 'front-delt': 5 },
  15:  { triceps: 86, 'front-delt': 6 },
  30:  { triceps: 87, 'front-delt': 8 },
  45:  { triceps: 88, 'front-delt': 10 },
  60:  { triceps: 89, 'front-delt': 13 },
  75:  { triceps: 90, 'front-delt': 17 },
  90:  { triceps: 90, 'front-delt': 22 },
  105: { triceps: 89, 'front-delt': 28 },
  120: { triceps: 88, 'front-delt': 35 },
  135: { triceps: 87, 'front-delt': 43 },
  150: { triceps: 86, 'front-delt': 52 },
  165: { triceps: 85, 'front-delt': 60 },
  180: { triceps: 84, 'front-delt': 68 },
};

const LEG_CURL_EMG = {
  0:   { hamstrings: 75, calves: 20 },
  15:  { hamstrings: 77, calves: 19 },
  30:  { hamstrings: 79, calves: 19 },
  45:  { hamstrings: 81, calves: 18 },
  60:  { hamstrings: 83, calves: 17 },
  75:  { hamstrings: 85, calves: 16 },
  90:  { hamstrings: 87, calves: 15 },
  105: { hamstrings: 89, calves: 14 },
  120: { hamstrings: 91, calves: 13 },
  135: { hamstrings: 93, calves: 12 },
  150: { hamstrings: 95, calves: 11 },
  165: { hamstrings: 97, calves: 10 },
  180: { hamstrings: 99, calves: 9 },
};

// Only 2 keys, deliberately -- see the header note above. NOT part of the
// usual 0-180/15°-step ANGLES grid.
const HYPEREXTENSION_EMG = {
  45: { erectors: 78, glutes: 38, hamstrings: 61 },
  90: { erectors: 85, glutes: 58, hamstrings: 28 },
};

const PRESS_ANGLE_DESC = '0° = arm at your side · 90° = arm horizontal, straight out in front · 180° = arm straight overhead';
const ROW_ANGLE_DESC = '0° = a low pull (e.g. straight-arm pulldown) · 90° = a pull from in front (e.g. seated cable row) · 180° = an overhead pull (e.g. pull-up)';
const FLY_ANGLE_DESC = '0° = arms finish pinned near your hips (high-to-low cable fly) · 90° = arms finish extended forward at chest height (flat/mid fly) · 180° = arms finish raised high, near overhead (low-to-high cable fly)';
const CURL_ANGLE_DESC = '0° = shoulder extended, arm hangs behind your torso (incline curl) · 90° = arm at your side (standing curl) · 180° = shoulder flexed, arm braced in front of your torso (preacher curl)';
const EXTENSION_ANGLE_DESC = '0° = arm at your side (pushdown / lying extension) · 90° = arm horizontal in front · 180° = arm straight overhead (overhead extension)';
const LEG_CURL_ANGLE_DESC = '0° = hip extended (lying/prone leg curl) · 90° = hip at a right angle · 180° = hip flexed (seated leg curl)';
const HYPEREXTENSION_ANGLE_DESC = 'Only two real device types exist for this movement, not a continuous range: 45° = standard back-extension bench (more hamstring involvement) · 90° = Roman chair / GHD (steeper, more glute/erector-biased)';

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
  const table = pattern === 'press' ? PRESS_EMG : pattern === 'row' ? ROW_EMG : pattern === 'fly' ? FLY_EMG
    : pattern === 'curl' ? CURL_EMG : pattern === 'extension' ? EXTENSION_EMG
    : pattern === 'leg-curl' ? LEG_CURL_EMG : pattern === 'hyperextension' ? HYPEREXTENSION_EMG : null;
  return table ? (table[angle] || null) : null;
}

// Union of a pattern's muscle involvement ACROSS every angle, not one fixed
// position -- for each muscle appearing anywhere in the table, takes its
// max % across ANGLES and classifies via the same PRIMARY_THRESHOLD/
// SECONDARY_THRESHOLD cutoffs as classifyMuscles. This is what gives a
// family exercise (functions/exerciseDb.js's isAngleFamily entries, e.g.
// "Cable Fly" spanning all 13 buildable angles) a primary/secondary array
// that doesn't make it invisible to session-picker scoring for a muscle it
// only serves well at a DIFFERENT angle than whichever one happened to be
// checked. Sorted by max % descending -- NOT a claim about anatomical
// dominance (this file's own header notes each muscle's % is relative to
// its own MVIC reference, not a shared scale), just a stable, deterministic
// order. functions/exerciseDb.js's actual isAngleFamily entries hand-curate
// their primary/secondary arrays for realistic session-picker weighting
// (e.g. chest first for a press, not whichever muscle's own peak % happens
// to be numerically largest) -- this function is the inclusion source of
// truth for which muscles belong in those arrays at all, not the literal
// order to paste in.
function muscleEnvelope(pattern) {
  const table = pattern === 'press' ? PRESS_EMG : pattern === 'row' ? ROW_EMG : pattern === 'fly' ? FLY_EMG
    : pattern === 'curl' ? CURL_EMG : pattern === 'extension' ? EXTENSION_EMG
    : pattern === 'leg-curl' ? LEG_CURL_EMG : pattern === 'hyperextension' ? HYPEREXTENSION_EMG : null;
  if (!table) return { primary: [], secondary: [] };
  const maxByMuscle = {};
  for (const angle of ANGLES) {
    for (const [muscle, pct] of Object.entries(table[angle] || {})) {
      if (!(muscle in maxByMuscle) || pct > maxByMuscle[muscle]) maxByMuscle[muscle] = pct;
    }
  }
  const primary = [], secondary = [];
  for (const [muscle, pct] of Object.entries(maxByMuscle)) {
    if (pct >= PRIMARY_THRESHOLD) primary.push(muscle);
    else if (pct >= SECONDARY_THRESHOLD) secondary.push(muscle);
  }
  primary.sort((a, b) => maxByMuscle[b] - maxByMuscle[a]);
  secondary.sort((a, b) => maxByMuscle[b] - maxByMuscle[a]);
  return { primary, secondary };
}

// Given a pattern and a target muscle, finds the angle (from the 13-step
// ANGLES grid) that maximizes that muscle's activation -- the "what angle
// should this family exercise be built at to best serve this goal" lookup
// Phase B's session-picker recommendation depends on. Returns null if the
// pattern's table never tracks that muscle at all (e.g. idealAngleForMuscle
// ('row', 'chest')), not a fabricated angle.
function idealAngleForMuscle(pattern, muscle) {
  const table = pattern === 'press' ? PRESS_EMG : pattern === 'row' ? ROW_EMG : pattern === 'fly' ? FLY_EMG
    : pattern === 'curl' ? CURL_EMG : pattern === 'extension' ? EXTENSION_EMG
    : pattern === 'leg-curl' ? LEG_CURL_EMG : pattern === 'hyperextension' ? HYPEREXTENSION_EMG : null;
  if (!table) return null;
  let best = null, bestPct = -1;
  for (const angle of ANGLES) {
    const pct = table[angle]?.[muscle];
    if (pct != null && pct > bestPct) { bestPct = pct; best = angle; }
  }
  return best;
}

module.exports = {
  ANGLES, PRESS_EMG, ROW_EMG, FLY_EMG, CURL_EMG, EXTENSION_EMG, LEG_CURL_EMG, HYPEREXTENSION_EMG,
  PRESS_ANGLE_DESC, ROW_ANGLE_DESC, FLY_ANGLE_DESC, CURL_ANGLE_DESC, EXTENSION_ANGLE_DESC,
  LEG_CURL_ANGLE_DESC, HYPEREXTENSION_ANGLE_DESC,
  PRESS_FRONTAL_EMG, ROW_FRONTAL_EMG, FRONTAL_ANGLES,
  PRESS_GRIP_EMG, ROW_GRIP_EMG, GRIP_ANGLES, GRIP_LABELS, GRIP_ANGLES_BY_EQUIPMENT,
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD, classifyMuscles, emgForAngle, frontalCueForProfile, gripCueForProfile,
  muscleEnvelope, idealAngleForMuscle,
};
