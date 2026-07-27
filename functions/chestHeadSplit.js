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

module.exports = { CHEST_SPLIT_BY_ANGLE, CHEST_EXERCISE_ANGLES, chestSplitForExercise };
