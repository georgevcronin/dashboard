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
  PRIMARY_THRESHOLD, SECONDARY_THRESHOLD, classifyMuscles, emgForAngle,
};
