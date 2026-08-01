// Chest-head split (lower/mid/upper pec) per exercise — informational only.
// Deliberately does NOT touch fatigue.js/adaptation.js's 'chest' computation
// at all: each exercise's three proportions sum to exactly 100, so summing
// them back together always reproduces today's flat 'chest' credit exactly.
// That's what keeps 'chest' outside a workout numerically comparable to
// every other unsplit muscle (see the discussion that led here — averaging
// or maxing three independently-normalized heads would make chest read
// systematically lower than muscles that aren't split at all). The 3-way
// breakdown below is surfaced only inside a workout (which head a given
// exercise actually emphasizes), never fed into the shared fatigue/stimulus
// pipeline as its own tracked muscle.
//
// Proportions are estimates interpolated from the general relative trend
// reported across published EMG literature comparing bench angles (Trebs et
// al. 2010; Rocha Jr. et al. 2007; Barnett et al. 1995; Solstad et al. 2020
// on incline-angle upper-pec activation) — decline favors lower/sternocostal
// fibers, ~30-45° incline meaningfully favors upper/clavicular fibers, flat
// sits relatively balanced with sternal (mid+lower) fibers dominant since
// that's the larger muscle mass. Same caveat as functions/emgActivation.js:
// no single study measured all three regions continuously across this full
// angle range — these are directional estimates, not raw study data.

const CHEST_SPLIT_BY_ANGLE = {
  '-30': { lower: 55, mid: 35, upper: 10 }, // decline
  '-15': { lower: 48, mid: 38, upper: 14 },
  '0':   { lower: 38, mid: 42, upper: 20 }, // flat
  '15':  { lower: 30, mid: 42, upper: 28 },
  '30':  { lower: 20, mid: 40, upper: 40 }, // standard incline
  '45':  { lower: 13, mid: 35, upper: 52 },
  '60':  { lower: 8,  mid: 28, upper: 64 }, // high incline
};

// Keyed by exerciseDb.js's exact name, lowercased -- angle is the bench
// incline this variant most closely represents, not a literal spec field.
const CHEST_EXERCISE_ANGLES = {
  'barbell bench press': 0,
  'incline barbell bench press': 30,
  'decline barbell bench press': -15,
  'close-grip bench press': 0,
  'dumbbell bench press (flat)': 0,
  'dumbbell incline bench press': 30,
  'dumbbell decline bench press': -15,
  'cable fly (high to low)': -15, // pulling high-to-low biases lower chest, same line of pull as a decline press
  'cable fly (low to high)': 30, // pulling low-to-high biases upper chest, same line of pull as an incline press
  'cable crossover': 0,
  'pec deck / machine fly': 0,
  'chest dips': -15, // forward-leaning dip bar path biases lower chest
  'push-up': 0,
  'weighted push-up': 0,
  'machine chest press': 0,
  'svend press': 0,
  'cable pullover': 0,
  'jm press': 0,
  'tricep dips (parallel bars)': -15,
  'diamond push-up': 0,
  'incline cable fly': 30,
  'weighted dips (chest)': -15,
  'ring push-up': 0,
  'single-arm cable press': 0,
  'dumbbell pullover': 0,
  'single-arm dumbbell press': 0,
  'hex press (floor)': 0,
};

// Returns { lower, mid, upper } (always summing to 100) for a recognized
// chest exercise, or null for anything else (including chest exercises not
// yet in the map above -- absence here is not a crash, just no breakdown).
function chestSplitForExercise(name) {
  const key = (name || '').toLowerCase().trim();
  const angle = CHEST_EXERCISE_ANGLES[key];
  if (angle == null) return null;
  return CHEST_SPLIT_BY_ANGLE[String(angle)] || null;
}

// Same informational-only lower/mid/upper split, but for PressRowBuilder's
// fly pattern -- keyed on functions/emgActivation.js's own fly axis (arm-
// to-torso angle at full contraction, 0-180° in 15° steps), NOT this file's
// bench-incline axis above. A fly's "angle" and a bench's "incline" aren't
// the same physical quantity even though both drive the same lower-vs-
// upper-pec bias, so keeping separate tables avoids conflating them. 0° (a
// high-to-low cable fly finishing near the hips) is more lower-pec-biased
// than the deepest decline bench above, since a fly's cable line of pull is
// a more direct lower-pec vector than a decline press's bar path.
const FLY_HEAD_SPLIT_BY_ANGLE = {
  0:   { lower: 60, mid: 32, upper: 8 },
  15:  { lower: 54, mid: 34, upper: 12 },
  30:  { lower: 47, mid: 37, upper: 16 },
  45:  { lower: 40, mid: 40, upper: 20 },
  60:  { lower: 33, mid: 42, upper: 25 },
  75:  { lower: 27, mid: 43, upper: 30 },
  90:  { lower: 22, mid: 43, upper: 35 },
  105: { lower: 18, mid: 41, upper: 41 },
  120: { lower: 14, mid: 38, upper: 48 },
  135: { lower: 11, mid: 34, upper: 55 },
  150: { lower: 9,  mid: 30, upper: 61 },
  165: { lower: 8,  mid: 26, upper: 66 },
  180: { lower: 8,  mid: 22, upper: 70 },
};

// Returns { lower, mid, upper } for a fly angle (0-180°, 15° steps), or
// null for an angle outside that grid.
function flyHeadSplitForAngle(angle) {
  return FLY_HEAD_SPLIT_BY_ANGLE[angle] || null;
}

module.exports = { CHEST_SPLIT_BY_ANGLE, CHEST_EXERCISE_ANGLES, chestSplitForExercise, FLY_HEAD_SPLIT_BY_ANGLE, flyHeadSplitForAngle };
