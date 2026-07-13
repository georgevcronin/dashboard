// Maps real logged exercise names (Hevy's own naming convention, all
// lowercase) to their exerciseDb.js canonical name, so name-dependent
// lookups (findExercise, and by extension muscleRoleInExercise's primary/
// secondary classification) actually resolve instead of silently falling
// through to muscleTaxonomy.js's coarse KEYWORD_FALLBACK, which can't
// distinguish primary from secondary muscle involvement.
//
// Checked against a real account: 176 of 189 distinct logged exercise names
// (93%) failed the exact-match lookup entirely before this table existed,
// meaning almost nothing in that account's real training history was ever
// getting correctly weighted as a primary mover for muscle-score aggregation
// — everything fell to the conservative secondary-only treatment regardless
// of what it actually trained.
//
// Exact-string allowlist only, same discipline as every other alias table in
// this app (CLASSIFY_ALIASES, MUSCLE_EXERCISE_ALIASES) — verified against
// real logged names, not guessed keyword patterns. A meaningful number of
// real logged names are deliberately NOT included here: unilateral/single-leg
// variants (different loading profile), gym-specific location-tagged
// machines with no resolvable equivalent, joke/placeholder names, and a
// handful of genuinely ambiguous ones (e.g. "supine press") where no single
// exerciseDb.js entry is confidently the same movement. Missing from this
// table just means that name still falls to KEYWORD_FALLBACK, exactly as it
// did before — this table only ever adds precision, never removes it.
//
// Some entries here map across an equipment difference (e.g. dumbbell vs.
// barbell preacher curl) that would NOT be acceptable for the ranking-
// standards alias tables (CLASSIFY_ALIASES, MUSCLE_EXERCISE_ALIASES), since
// those compare an absolute kg number against a published standard where
// equipment changes the honest comparison. This table only feeds
// primary/secondary ROLE classification, where the muscle trained is the
// same regardless of which dumbbell/barbell/machine variant was used, so
// that stricter equipment-matching rule doesn't apply here.
const EXERCISE_NAME_ALIASES = {
  'ab wheel': 'Ab Wheel Rollout',
  'arnold press (dumbbell)': 'Arnold Press',
  'back extension (machine)': 'Back Extension / Hyperextension',
  'back extension (weighted hyperextension)': 'Back Extension / Hyperextension',
  'bench concentration curl': 'Concentration Curl',
  'bench press (barbell)': 'Barbell Bench Press',
  'bench press (dumbbell)': 'Dumbbell Bench Press (Flat)',
  'bent over fly (dumbbell)': 'Rear Delt Fly (Dumbbell)',
  'bent over row (barbell)': 'Barbell Row (Overhand / Pendlay)',
  'bicep curl (barbell)': 'Barbell Curl',
  'bicep curl (cable)': 'Low Cable Curl',
  'bicep curl (dumbbell)': 'Dumbbell Curl (Standing)',
  'butterfly (pec deck)': 'Pec Deck / Machine Fly',
  'cable fly crossovers': 'Cable Crossover',
  'cable tricep press (hartlepool)': 'Cable Tricep Pushdown (Bar)',
  'calf extension (machine)': 'Standing Calf Raise (Machine)',
  'calf press (machine)': 'Calf Raise on Leg Press',
  'calf raise (horizontal leg press)': 'Calf Raise on Leg Press',
  'carter extentions': 'Carter Extension',
  'chest fly (machine)': 'Pec Deck / Machine Fly',
  'chest press (machine)': 'Machine Chest Press',
  'chest press (plates)': 'Machine Chest Press',
  'chest supported incline row (dumbbell)': 'Chest-Supported Dumbbell Row',
  'chin up': 'Chin-Up',
  'chin up (assisted)': 'Chin-Up',
  'cross body hammer curl': 'Cross-Body Hammer Curl',
  'cross rear delt flyes (cable)': 'Rear Delt Fly (Cable)',
  'crunch (weighted)': 'Weighted Crunch',
  'deadlift (barbell)': 'Conventional Deadlift',
  'decline crunch (weighted)': 'Weighted Crunch',
  'decline curl': 'Decline Curl (Carter Curl)',
  'dumbbell row': 'Bent-Over Dumbbell Row (Bilateral)',
  'ez bar biceps curl': 'EZ-Bar Curl',
  'glute ham raise (copy)': 'Glute-Ham Raise (GHR)',
  'good morning (barbell)': 'Good Morning',
  'hack squat (hartlepool)': 'Hack Squat (Machine)',
  'hammer curl (dumbbell)': 'Hammer Curl',
  'hip abduction (machine)': 'Abductor Machine',
  'hip adduction (machine)': 'Adductor Machine',
  'hip thrust (barbell)': 'Barbell Hip Thrust',
  'incline bench press (barbell)': 'Incline Barbell Bench Press',
  'incline bench press (dumbbell)': 'Dumbbell Incline Bench Press',
  'iso-lateral high cable row (machine) (verde)': 'High Cable Row',
  'iso-lateral high row (machine)': 'High Cable Row',
  'iso-lateral row (machine)': 'Machine Row (Seated)',
  'kneeling pushdown': 'Cable Tricep Pushdown (Bar)',
  'lat pulldown (cable)': 'Lat Pulldown (Wide Grip)',
  'lat pulldown (hard machine)': 'Lat Pulldown (Wide Grip)',
  'lat pulldown (hartlepool)': 'Lat Pulldown (Wide Grip)',
  'lat pulldown (machine)': 'Lat Pulldown (Wide Grip)',
  'lat pulldown - close grip (cable)': 'Close-Grip Lat Pulldown',
  'lateral raise machine (easy)': 'Lateral Raise (Machine)',
  'leg extension (machine)': 'Leg Extension',
  'leg extension (machine) (verde)': 'Leg Extension',
  'leg press (machine)': 'Leg Press',
  'leg press horizontal (machine)': 'Leg Press',
  'leg raise parallel bars': 'Hanging Leg Raise',
  'leverage leg press': 'Leg Press',
  'low cable fly crossovers': 'Cable Fly (Low to High)',
  'lying leg curl (machine)': 'Lying Leg Curl',
  'overhead press (barbell)': 'Barbell Overhead Press',
  'overhead press (smith machine)': 'Smith Machine Overhead Press',
  'overhead press (smith machine) (verde)': 'Smith Machine Overhead Press',
  'overhead tricep extentions': 'Overhead Tricep Extension (Cable)',
  'pec deck elbows': 'Pec Deck / Machine Fly',
  'pendlay row (barbell)': 'Barbell Row (Overhand / Pendlay)',
  'preacher curl (dumbbell)': 'Preacher Curl (Barbell)',
  'preacher curl (machine)': 'Preacher Curl (Barbell)',
  'pull up': 'Pull-Up (Wide Grip)',
  'pull up (band)': 'Pull-Up (Wide Grip)',
  'pull up (weighted)': 'Weighted Pull-Up',
  'push up': 'Push-Up',
  'rear delt reverse fly (cable)': 'Rear Delt Fly (Cable)',
  'rear delt reverse fly (dumbbell)': 'Rear Delt Fly (Dumbbell)',
  'rear delt reverse fly (machine)': 'Reverse Pec Deck',
  'rear delt row': 'High Cable Row',
  'reverse curl (barbell)': 'Reverse Curl',
  'reverse ez bar curl': 'Reverse Curl',
  'reverse grip concentration curl': 'Concentration Curl',
  'romanian deadlift (barbell)': 'Romanian Deadlift',
  'romanian deadlift (dumbbell)': 'Romanian Deadlift',
  'seated cable row - bar grip': 'Seated Cable Row',
  'seated cable row - v grip (cable)': 'Seated Cable Row',
  'seated chest flys (cable)': 'Cable Fly (High to Low)',
  'seated chest flys (cable) (verde)': 'Cable Fly (High to Low)',
  'seated incline curl (dumbbell)': 'Incline Dumbbell Curl',
  'seated iso-lateral row': 'Machine Row (Seated)',
  'seated iso-low-row cable machine (nu)': 'Seated Cable Row',
  'seated iso-row cable machine': 'Seated Cable Row',
  'seated iso-row cable machine (verde)': 'Seated Cable Row',
  'seated lateral raise (dumbbell)': 'Lateral Raise (Dumbbell)',
  'seated leg curl (machine)': 'Seated Leg Curl',
  'seated overhead press (barbell)': 'Barbell Overhead Press',
  'seated palms up wrist curl': 'Wrist Curl (Barbell)',
  'seated pushdowns': 'Cable Tricep Pushdown (Bar)',
  'seated row (machine)': 'Machine Row (Seated)',
  'seated shoulder press (machine)': 'Machine Shoulder Press',
  'seated shoulder press (machine) (tf)': 'Machine Shoulder Press',
  'seated upper back iso-row cable machine (nu)': 'Machine Row (Seated)',
  'seated wrist extension (barbell)': 'Reverse Wrist Curl',
  'shoulder press (dumbbell)': 'Dumbbell Overhead Press',
  'shoulder press (hard machine)': 'Machine Shoulder Press',
  'shoulder press (machine plates)': 'Machine Shoulder Press',
  'shoulder press incline (machine plates)': 'Machine Shoulder Press',
  'shrug (barbell)': 'Barbell Shrug',
  'single arm lat pulldown': 'Single-Arm Lat Pulldown',
  'single arm lat pulldown (hard machine)': 'Single-Arm Lat Pulldown',
  'single arm lat pulldown (puregym)': 'Single-Arm Lat Pulldown',
  'single arm triceps pushdown (cable)': 'Single-Arm Cable Pushdown',
  'single arm triceps pushdown (cable) (double pulley)': 'Single-Arm Cable Pushdown',
  'single arm triceps pushdown (cable) (verde)': 'Single-Arm Cable Pushdown',
  'single leg hip thrust (smith machine)': 'Single-Leg Hip Thrust',
  'single leg press': 'Single-Leg Press',
  'single leg romanian deadlift (barbell)': 'Single-Leg RDL',
  'small incline chest press (plates)': 'Machine Chest Press',
  'spider curl (barbell)': 'Spider Curl',
  'split squat': 'Bulgarian Split Squat',
  'squat (barbell)': 'Back Squat',
  'squat (machine)': 'Hack Squat (Machine)',
  'stable face pulls': 'Face Pull',
  'standing cable glute kickbacks': 'Cable Glute Kickback',
  'standing calf raise (barbell)': 'Standing Calf Raise (Machine)',
  'standing military press (barbell)': 'Barbell Overhead Press',
  'straight arm lat pulldown (cable)': 'Cable Straight-Arm Pulldown',
  't bar row': 'T-Bar Row',
  'the maddest lateral raise ever': 'Lateral Raise (Dumbbell)',
  'tnf adductions': 'Adductor Machine',
  'tnf squat': 'Back Squat',
  'triceps dip': 'Tricep Dips (Parallel Bars)',
  'triceps dip (weighted)': 'Tricep Dips (Parallel Bars)',
  'triceps extension (barbell)': 'Skullcrusher (Barbell)',
  'triceps extension (cable)': 'Overhead Tricep Extension (Cable)',
  'triceps pressdown': 'Cable Tricep Pushdown (Bar)',
  'triceps pushdown': 'Cable Tricep Pushdown (Bar)',
  'triceps pushdown (one arm)': 'Single-Arm Cable Pushdown',
  'triceps rope pushdown': 'Cable Tricep Pushdown (Rope)',
  'upper chest flys': 'Incline Cable Fly',
  'upper chest flys (verde)': 'Incline Cable Fly',
  'upright row (barbell)': 'Upright Row',
  'vertical leg press': 'Leg Press',
};

module.exports = { EXERCISE_NAME_ALIASES };
