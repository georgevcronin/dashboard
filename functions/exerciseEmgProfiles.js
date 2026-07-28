// Curated, FIXED weighted EMG profiles for existing exerciseDb.js entries —
// "every exercise now works off this literature," phase 1 (squat/hinge/
// lunge/thrust pattern + curl/extension pattern). Unlike PressRowBuilder's
// exercises (where the athlete picks a live angle per exercise), these are
// a single representative angle/position chosen once per exercise based on
// how it's normally performed — see functions/movementEmg.js for the
// underlying tables and each pattern's real per-exercise angle assignment
// reasoning below. No per-set customization; that's a deliberate scope
// choice (see the "fixed default" decision this was built against), not an
// oversight.
//
// Consumed the same way as a PressRowBuilder exercise's own emgWeights:
// functions/fatigue.js checks this lookup (by exercise name) as a fallback
// when a lift doesn't carry its own emgWeights, before falling back further
// to the flat musclesForExercise() credit every other exercise still uses.
//
// Honest approximation flagged explicitly: for elbow-flexion (curl-pattern)
// exercises, brachialis and brachioradialis are given the SAME curve as
// biceps (functions/movementEmg.js's ELBOW_EMG only tracks biceps/triceps
// at this axis — the source document itself notes all elbow flexors/
// extensors "follow roughly the same inverted-U shape... a general feature
// of muscle length-tension mechanics rather than something specific to any
// one head", which is the basis for reusing the shape here) — this is a
// same-SHAPE proxy, not a directly-measured value for those two muscles.
// Everything else below is either a direct table value or a same-taxonomy-
// muscle average (see movementEmg.js's own comments for which).
const EXERCISE_EMG_PROFILES = {
  'back squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'front squat': { 'quads': 75, 'glutes': 78, 'hamstrings': 63, 'adductors': 72, 'erectors': 52 },
  'hack squat (machine)': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'leg press': { 'quads': 75, 'glutes': 78, 'hamstrings': 63, 'adductors': 72, 'erectors': 52 },
  'sissy squat': { 'quads': 46, 'glutes': 24, 'hamstrings': 27, 'adductors': 24, 'erectors': 32 },
  'goblet squat': { 'quads': 75, 'glutes': 78, 'hamstrings': 63, 'adductors': 72, 'erectors': 52 },
  'box squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'pause squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'safety bar squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'sumo squat (dumbbell)': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'jump squat': { 'quads': 52, 'glutes': 34, 'hamstrings': 34, 'adductors': 33, 'erectors': 36 },
  'pin squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'zercher squat': { 'quads': 75, 'glutes': 78, 'hamstrings': 63, 'adductors': 72, 'erectors': 52 },
  'landmine squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'single-leg press': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'adductor squeeze squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'bulgarian split squat': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'walking lunge': { 'quads': 70, 'glutes': 65, 'hamstrings': 57, 'adductors': 62, 'erectors': 48 },
  'reverse lunge': { 'quads': 64, 'glutes': 55, 'hamstrings': 50, 'adductors': 53, 'erectors': 44 },
  'atg split squat (knees over toes)': { 'quads': 80, 'glutes': 90, 'hamstrings': 68, 'adductors': 80, 'erectors': 55 },
  'step-up': { 'quads': 64, 'glutes': 55, 'hamstrings': 50, 'adductors': 53, 'erectors': 44 },
  'curtsy lunge': { 'quads': 64, 'glutes': 55, 'hamstrings': 50, 'adductors': 53, 'erectors': 44 },
  'conventional deadlift': { 'quads': 75, 'glutes': 90, 'hamstrings': 86.5, 'erectors': 83 },
  'sumo deadlift': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'romanian deadlift': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'single-leg rdl': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'stiff-leg deadlift': { 'quads': 75, 'glutes': 90, 'hamstrings': 86.5, 'erectors': 83 },
  'good morning': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'cable pull-through': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'kettlebell swing': { 'quads': 52, 'glutes': 68, 'hamstrings': 65.5, 'erectors': 78 },
  'trap bar deadlift': { 'quads': 75, 'glutes': 90, 'hamstrings': 86.5, 'erectors': 83 },
  'snatch-grip deadlift': { 'quads': 75, 'glutes': 90, 'hamstrings': 86.5, 'erectors': 83 },
  'deficit deadlift': { 'quads': 80, 'glutes': 95, 'hamstrings': 90, 'erectors': 85 },
  'jefferson curl': { 'quads': 80, 'glutes': 95, 'hamstrings': 90, 'erectors': 85 },
  'dumbbell deadlift': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'hip hinge (dowel/barbell drill)': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  // Thrust-family: glute-dominant hip extension via the hinge table at a
  // moderate angle. Real hip thrusts brace the torso against a bench and
  // spare the low back in a way this axis doesn't capture -- erectors here
  // are likely somewhat overstated for this specific pattern; flagged, not
  // fixed, since no dedicated hip-thrust EMG axis exists in the source.
  'barbell hip thrust': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'glute bridge': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'single-leg hip thrust': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'frog pump': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },
  'hip thrust (smith machine)': { 'quads': 65, 'glutes': 80, 'hamstrings': 77.5, 'erectors': 80 },

  'barbell curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'ez-bar curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'dumbbell curl (standing)': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'incline dumbbell curl': { 'biceps': 74.5, 'brachialis': 74.5, 'brachioradialis': 74.5 },
  'preacher curl (barbell)': { 'biceps': 74.5, 'brachialis': 74.5, 'brachioradialis': 74.5 },
  'spider curl': { 'biceps': 74.5, 'brachialis': 74.5, 'brachioradialis': 74.5 },
  'decline curl (carter curl)': { 'biceps': 74.5, 'brachialis': 74.5, 'brachioradialis': 74.5 },
  'low cable curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'drag curl': { 'biceps': 93, 'brachialis': 93, 'brachioradialis': 93 },
  'concentration curl': { 'biceps': 99.5, 'brachialis': 99.5, 'brachioradialis': 99.5 },
  'zottman curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'reverse curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'high cable curl': { 'biceps': 99.5, 'brachialis': 99.5, 'brachioradialis': 99.5 },
  'machine curl': { 'biceps': 95.5, 'brachialis': 95.5, 'brachioradialis': 95.5 },
  'incline bench curl (scott curl)': { 'biceps': 74.5, 'brachialis': 74.5, 'brachioradialis': 74.5 },
  'overhead cable curl (double bicep)': { 'biceps': 99.5, 'brachialis': 99.5, 'brachioradialis': 99.5 },

  'cable tricep pushdown (rope)': { 'triceps': 94.33 },
  'cable tricep pushdown (bar)': { 'triceps': 94.33 },
  'skullcrusher (barbell)': { 'triceps': 98 },
  'skullcrusher (ez-bar)': { 'triceps': 98 },
  'overhead tricep extension (cable)': { 'triceps': 96.33 },
  'overhead tricep extension (dumbbell)': { 'triceps': 96.33 },
  'carter extension': { 'triceps': 98 },
  'tate press': { 'triceps': 94.33 },
  'single-arm cable pushdown': { 'triceps': 94.33 },
  'reverse grip pushdown': { 'triceps': 94.33 },

  'lying leg curl': { 'hamstrings': 96 },
  'seated leg curl': { 'hamstrings': 90 },
  'nordic hamstring curl': { 'hamstrings': 96 },
  'standing leg curl (machine)': { 'hamstrings': 90 },
  'leg extension': { 'quads': 78.5 },

  'wrist curl (barbell)': { 'forearms': 68.5, 'brachioradialis': 31 },
  'reverse wrist curl': { 'forearms': 71, 'brachioradialis': 27 },

  'back extension / hyperextension': { 'erectors': 83, 'glutes': 90, 'hamstrings': 86.5 },
  'reverse hyperextension': { 'erectors': 80, 'glutes': 80, 'hamstrings': 77.5 },
  'cable glute kickback': { 'glutes': 68, 'hamstrings': 65.5 },

  // Phase 2: hip abduction/adduction, calf raise, core (anti-extension +
  // anti-rotation), rotator cuff rotation.
  'lateral band walk': { 'abductors': 53.33 },
  'clamshell': { 'abductors': 53.33 },
  'abductor machine': { 'abductors': 66.67 },
  'cable hip abduction': { 'abductors': 66.67 },
  'copenhagen adduction': { 'adductors': 72.8 },
  'adductor machine': { 'adductors': 72.8 },
  'cable hip adduction': { 'adductors': 72.8 },
  'standing calf raise (machine)': { 'calves': 84 },
  'single-leg calf raise': { 'calves': 84 },
  'donkey calf raise': { 'calves': 84 },
  'calf raise on leg press': { 'calves': 84 },
  'seated calf raise': { 'calves': 62 }, // CALF_SEATED_MODIFIER applied -- knee-flexed, gastroc contribution reduced
  'dead bug': { 'abs': 38, 'obliques': 38.5, 'transverse-abs': 52, 'erectors': 15, 'lats': 20 },
  'plank (front)': { 'abs': 47, 'obliques': 46.5, 'transverse-abs': 58, 'erectors': 18, 'lats': 27 },
  // Side Plank is mechanically a different plane (resisting lateral flexion,
  // not extension) -- no dedicated table exists for that pattern in the
  // source document, so this reuses the anti-extension lever-length table
  // as the closest available proxy rather than leaving it flat. Loosest fit
  // in this batch.
  'side plank': { 'abs': 47, 'obliques': 46.5, 'transverse-abs': 58, 'erectors': 18, 'lats': 27 },
  'hollow body hold': { 'abs': 66, 'obliques': 63.5, 'transverse-abs': 73, 'erectors': 27, 'lats': 44 },
  'plank shoulder tap': { 'abs': 56, 'obliques': 55, 'transverse-abs': 65, 'erectors': 22, 'lats': 35 },
  'stir the pot (ball plank)': { 'abs': 66, 'obliques': 63.5, 'transverse-abs': 73, 'erectors': 27, 'lats': 44 },
  'ab wheel rollout': { 'abs': 87, 'obliques': 82.5, 'transverse-abs': 91, 'erectors': 41, 'lats': 62 },
  'standing ab rollout': { 'abs': 95, 'obliques': 90, 'transverse-abs': 98, 'erectors': 48, 'lats': 70 },
  // Pallof-family + rotational core, all via CORE_ANTIROT_EMG. Russian Twist
  // and Pallof Press land on the same lever level (60) and so end up
  // identical here -- genuinely different exercises (dynamic/unstable vs.
  // static anti-rotation press), but no distinct axis separates them in the
  // source data.
  'pallof press': { 'obliques': 63.5, 'abs': 50, 'transverse-abs': 74, 'abductors': 44 },
  'landmine rotation': { 'obliques': 79, 'abs': 63, 'transverse-abs': 86, 'abductors': 58 },
  'russian twist': { 'obliques': 63.5, 'abs': 50, 'transverse-abs': 74, 'abductors': 44 },
  'cable woodchop': { 'obliques': 79, 'abs': 63, 'transverse-abs': 86, 'abductors': 58 },
  'half-kneeling pallof press': { 'obliques': 79, 'abs': 63, 'transverse-abs': 86, 'abductors': 58 },
  // Direct rotator-cuff rotation exercises via ROTATOR_CUFF_EMG.
  'cuban rotation': { 'rotator-cuff': 60, 'rear-delt': 70 },
  'external rotation (cable)': { 'rotator-cuff': 60, 'rear-delt': 70 },
  'internal rotation (cable)': { 'rotator-cuff': 41.67, 'front-delt': 55 },

  // Phase 3 (final batch): lateral raises, Y-raise/pull-apart, dragon flag,
  // pull-up/pulldown family, rear-delt fly, dips, Olympic-lift pulls, crunch
  // family. Deliberately SKIPPED and left on flat crediting where no table
  // in this system fits well enough to be worth forcing: tibialis raises
  // (no tibialis-posterior-equivalent data), hanging/lying/incline-bench leg
  // raises (curating from HIP_FLEXION_EMG alone would drop abs -- their
  // actual primary muscle -- which is a real regression from flat crediting,
  // not an improvement), chest-fly-pattern exercises (no dedicated
  // horizontal-adduction axis exists; PRESS_EMG models vertical pressing
  // arc, not a fly's arc, and chestHeadSplit.js's bench-incline angle scale
  // is a different axis entirely, not reusable here), loaded carries, shrugs
  // (NECK_EMG's traps column measures traps' role as a neck-extension
  // synergist, not scapular elevation during a shrug -- reusing it would be
  // a genuine misapplication, not just an imperfect proxy), and pullovers.
  'lateral raise (dumbbell)': { 'mid-delt': 100, 'front-delt': 95 },
  'lateral raise (cable)': { 'mid-delt': 100, 'front-delt': 95 },
  'lateral raise (machine)': { 'mid-delt': 100, 'front-delt': 95 },
  'single-arm cable lateral raise': { 'mid-delt': 100, 'front-delt': 95 },
  'landmine lateral raise': { 'mid-delt': 100, 'front-delt': 95 },
  'cable y-raise': { 'rear-delt': 100, 'mid-traps': 100, 'rhomboids': 91 },
  'incline y-raise (dumbbell)': { 'rear-delt': 100, 'mid-traps': 100, 'rhomboids': 91 },
  'band pull-apart': { 'rear-delt': 95, 'mid-traps': 96, 'rhomboids': 95 },
  'dragon flag': { 'abs': 95, 'transverse-abs': 98, 'erectors': 48, 'lats': 70 },
  // Pull-up/pulldown family, differentiated by grip width -- narrower/
  // underhand grips pull closer to the torso (less extreme on the
  // pull-direction axis, more lat-favorable per the low-pull-favors-lats
  // pattern), wide/behind-neck grips sit closer to the true overhead
  // extreme. Worth flagging plainly: even the most lat-favorable variant
  // here (close-grip, lats 46) reads below rear-delt/rhomboids (85-89) --
  // this is the source document's own explicit, stated pattern ("rear
  // delt... dominant on an overhead pull"), not a mapping mistake. That's
  // a real tension with how pull-ups are popularly understood as THE lat
  // exercise; trusting the cited literature over that prior rather than
  // quietly tuning angles until lats "win".
  'chin-up': { 'lats': 38, 'biceps': 66, 'rear-delt': 91, 'rhomboids': 93 },
  'pull-up (neutral grip)': { 'lats': 38, 'biceps': 66, 'rear-delt': 91, 'rhomboids': 93 },
  'lat pulldown (neutral grip)': { 'lats': 38, 'biceps': 66, 'rear-delt': 91, 'rhomboids': 93 },
  'lat pulldown (reverse / underhand)': { 'lats': 38, 'biceps': 66, 'rear-delt': 91, 'rhomboids': 93 },
  'single-arm lat pulldown': { 'lats': 32, 'biceps': 58, 'rear-delt': 95, 'rhomboids': 95 },
  'pull-up (wide grip)': { 'lats': 27, 'biceps': 50, 'rear-delt': 98, 'rhomboids': 94 },
  'weighted pull-up': { 'lats': 27, 'biceps': 50, 'rear-delt': 98, 'rhomboids': 94 },
  'lat pulldown (wide grip)': { 'lats': 27, 'biceps': 50, 'rear-delt': 98, 'rhomboids': 94 },
  'close-grip lat pulldown': { 'lats': 46, 'biceps': 73, 'rear-delt': 85, 'rhomboids': 89 },
  'behind-neck lat pulldown': { 'lats': 23, 'biceps': 42, 'rear-delt': 100, 'rhomboids': 91 },
  // Straight-arm pulldown: elbow stays extended, genuinely lat-isolated,
  // low-pull-direction mechanics -- correctly lat-dominant, unlike the
  // bent-arm family above.
  'cable straight-arm pulldown': { 'lats': 95, 'teres-major': 82 },
  'rear delt fly (dumbbell)': { 'rear-delt': 100, 'rhomboids': 91, 'mid-traps': 100 },
  'rear delt fly (cable)': { 'rear-delt': 100, 'rhomboids': 91, 'mid-traps': 100 },
  'reverse pec deck': { 'rear-delt': 100, 'rhomboids': 91, 'mid-traps': 100 },
  'chest dips': { 'chest': 31.7, 'front-delt': 35, 'triceps': 38 },
  'tricep dips (parallel bars)': { 'chest': 31.7, 'front-delt': 35, 'triceps': 38 },
  'weighted dips (chest)': { 'chest': 31.7, 'front-delt': 35, 'triceps': 38 },
  'bench dips': { 'triceps': 98 },
  'power clean': { 'glutes': 68, 'hamstrings': 65.5, 'quads': 52, 'erectors': 78 },
  'hang clean': { 'glutes': 68, 'hamstrings': 65.5, 'erectors': 78 },
  // Crunch family: the weakest-fit application in this whole system --
  // CORE_ANTIEXT_EMG measures isometric anti-extension holds, not dynamic
  // spinal flexion. Kept as a directional proxy (short lever = short ROM,
  // long lever = long ROM) rather than left entirely flat, but this is the
  // loosest mapping of everything curated here.
  'cable crunch': { 'abs': 56, 'obliques': 55 },
  'roman chair sit-up': { 'abs': 66, 'obliques': 63.5 },
  'weighted crunch': { 'abs': 47 },
  'bicycle crunch': { 'obliques': 55, 'abs': 56 },
  'v-up': { 'abs': 76, 'obliques': 72.5 },
  'ghd sit-up': { 'abs': 87, 'obliques': 82.5 },
};

function emgProfileForExercise(name) {
  return EXERCISE_EMG_PROFILES[(name || '').toLowerCase().trim()] || null;
}

module.exports = { EXERCISE_EMG_PROFILES, emgProfileForExercise };
