// Angle mapping for the athlete's own pre-existing (non-generated) press/row
// exercises, provided directly by the athlete via the Angle Mapper tool —
// not derived or guessed. This is what lets muscleCapacity.js's regression
// use real historical e1RM data (not just future PressRowBuilder-generated
// exercises) to solve for each muscle's underlying capacity: every entry
// here becomes one (EMG-weight-vector, real e1RM) training observation.
//
// Deliberately excludes anything that doesn't fit either EMG model
// (functions/emgActivation.js): horizontal bench-press-family exercises
// (bench press, incline bench press, chest press) have no equivalent to the
// vertical press table's 0-180 arm-at-side-to-overhead arc, and the athlete
// chose to leave 'upright row (barbell)' unmapped (mechanically closer to a
// shrug/lateral-raise hybrid than a standard row).
const EXERCISE_ANGLES = {
  'arnold press (dumbbell)': { pattern: 'press', angle: 15 },
  'machine shoulder press': { pattern: 'press', angle: 30 },
  'overhead press (barbell)': { pattern: 'press', angle: 15 },
  'overhead press (smith machine)': { pattern: 'press', angle: 30 },
  'overhead press (smith machine) (verde)': { pattern: 'press', angle: 30 },
  'seated overhead press (barbell)': { pattern: 'press', angle: 15 },
  'seated shoulder press (machine)': { pattern: 'press', angle: 45 },
  'seated shoulder press (machine) (tf)': { pattern: 'press', angle: 45 },
  'shoulder press (dumbbell)': { pattern: 'press', angle: 30 },
  'shoulder press (hard machine)': { pattern: 'press', angle: 45 },
  'shoulder press (machine plates)': { pattern: 'press', angle: 30 },
  'shoulder press incline (machine plates)': { pattern: 'press', angle: 45 },
  'standing military press (barbell)': { pattern: 'press', angle: 0 },
  // Matches Pendlay Row's angle -- same movement, the dead-stop reset doesn't
  // change which muscles do the work.
  'bent over row (barbell)': { pattern: 'row', angle: 105 },
  'chest supported incline row (dumbbell)': { pattern: 'row', angle: 120 },
  'chest-supported barbell row': { pattern: 'row', angle: 105 },
  'dumbbell row': { pattern: 'row', angle: 90 },
  'high lat row': { pattern: 'row', angle: 30 },
  'iso-lateral high cable row (machine) (verde)': { pattern: 'row', angle: 15 },
  'iso-lateral high row (machine)': { pattern: 'row', angle: 15 },
  'iso-lateral row (machine)': { pattern: 'row', angle: 90 },
  'pendlay row (barbell)': { pattern: 'row', angle: 105 },
  'rear delt row': { pattern: 'row', angle: 90 },
  'seated cable row - bar grip': { pattern: 'row', angle: 105 },
  'seated cable row - v grip (cable)': { pattern: 'row', angle: 105 },
  'seated iso-lateral row': { pattern: 'row', angle: 105 },
  'seated iso-low-row cable machine (nu)': { pattern: 'row', angle: 105 },
  'seated iso-row cable machine': { pattern: 'row', angle: 90 },
  'seated iso-row cable machine (verde)': { pattern: 'row', angle: 90 },
  'seated row (machine)': { pattern: 'row', angle: 90 },
  'seated upper back iso-row cable machine (nu)': { pattern: 'row', angle: 90 },
  't bar row': { pattern: 'row', angle: 75 },
  'underhand smith machine press': { pattern: 'press', angle: 75 },
  'supine press': { pattern: 'press', angle: 90 },
  'jm press': { pattern: 'press', angle: 90 },
};

module.exports = { EXERCISE_ANGLES };
