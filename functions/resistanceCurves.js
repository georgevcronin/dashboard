// Best-effort resistance-curve ratings — see
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md ("Resistance
// curve — unified 1-5 ordinal scale, all equipment, best-effort") for the
// design this implements.
//
// ⚠️ DELIBERATELY LOWER RIGOR THAN THE OTHER CURATED TABLES IN THIS CODEBASE.
// functions/exerciseAngles.js and functions/emgActivation.js are grounded in
// real EMG literature — every value there is a claim backed by a source.
// This file is NOT that. It's a best-effort ordinal estimate (does this
// exercise get harder, easier, or stay roughly constant through the rep),
// reasoned from general biomechanics + this codebase's own existing
// exerciseDb.js `curve`/`curveNote` fields (which already describe, in
// plain English, where in the range of motion each free-weight/bodyweight
// exercise is hardest — a genuinely useful existing resource this file
// leans on heavily) + informed judgment about how machine/cable equipment
// changes that shape. Do not treat any single value here as verified. Where
// there was no reasonable basis to guess at all, the exercise is simply
// absent from this file rather than assigned a fabricated number — see the
// "known gaps" list at the bottom of this comment.
//
// Scale:
//   1 = strongly ascending  (hardest at the top/end of the range)
//   2 = mildly ascending
//   3 = flat                (roughly constant resistance through the range)
//   4 = mildly descending
//   5 = strongly descending (hardest at the bottom/start of the range)
//
// Methodology:
//   - Free weights / bodyweight / kettlebell: one rating per exercise, no
//     brand (a barbell has no brand-specific curve — it's a bar). Derived
//     from exerciseDb.js's own `curve`/`curveNote` fields plus standard
//     biomechanics reasoning about where gravity's moment arm is largest
//     through each movement's range of motion.
//   - Cable: cable tension is roughly constant (set by the weight stack);
//     what varies is the angle between cable and limb, which most cable
//     setups are specifically positioned to keep tension present through
//     more of the range than free weights manage. Modeled as the
//     free-weight-equivalent base rating pulled toward 3 (flat) — this
//     matches nearly every cable curveNote in exerciseDb.js, which
//     consistently describes cable's advantage as "maintains tension
//     throughout" / "matching" relative to the free-weight version of the
//     same movement.
//   - Selectorized/pin machines: cam-based, and cam engineering quality is
//     a genuine real-world differentiator between manufacturers (that's the
//     whole point of a cam — to reshape the resistance curve toward the
//     muscle's own strength curve). Modeled as the free-weight-equivalent
//     base rating pulled one step toward 3 (SELECTORIZED_TIER_PULL below)
//     for established commercial brands, unchanged for budget/home-gym-tier
//     brands (Body-Solid, BodyCraft, Promaxima, TKO) whose simpler cams are
//     assumed to retain more of the unmodified movement's natural curve.
//     Only two effective tiers, not three — on a 1-5 scale the maximum
//     possible pull toward center is 2 steps, and using the full 2-step
//     pull for a "premium" tier was tried and rejected: it collapsed every
//     single exercise on those brands to exactly 3, destroying all
//     per-exercise differentiation rather than genuinely differentiating
//     premium cam engineering from mid-tier. A 1-step pull preserves real
//     signal while still reflecting that better cams flatten curves more
//     than doing nothing at all.
//   - Smith machine: a fixed vertical bar path removes the balance/
//     stabilization component of a free-weight lift but does not
//     meaningfully reshape the resistance curve itself (gravity still acts
//     the same way through the same range of motion) — modeled as
//     identical to the free-weight-equivalent base rating, no brand pull.
//     No real per-brand signal exists for this (friction/counterbalance
//     differences aren't curve-shape differences), so Smith entries do not
//     vary by brand.
//
// Known limitation: a genuinely accurate model for several exercises is a
// bell curve (hardest in the MIDDLE of the range, easier at both ends —
// e.g. a standing barbell curl, where gravity's moment arm is near-zero at
// both full extension and full contraction and peaks around 90° elbow
// flexion) rather than a monotonic ascending/descending shape. This 5-point
// scale has no distinct "peaks in the middle" value. Bell-shaped exercises
// are rated by where their practical sticking region falls (usually
// bottom-to-mid for curl-pattern movements), not by pretending the curve is
// monotonic — this is a real simplification, not an oversight.
//
// Known gaps (equipment/exercise combinations skipped — no reasonable basis
// to guess a curve shape, not fabricated as a default 3):
//   - clean-pattern lifts (Power Clean, Hang Clean) on any equipment: these
//     are ballistic, multi-phase pulls (first pull / transition / second
//     pull / catch) with force profiles that don't reduce to a single
//     ascending/descending/flat judgment at all — rating one of these on
//     this scale would be actively misleading, not just imprecise.
//   - Any barbell/dumbbell exercise's "machine"/"cable"/"smith" entry: free
//     weights simply don't have those equipment variants in this DB.

const { EXERCISE_DB } = require('./exerciseDb');
const { SELECTORIZED_BRANDS, CABLE_BRANDS, SMITH_BRANDS } = require('./machineBrands');

// Base rating per (pattern, muscleGroup) — the free-weight/bodyweight
// default before any equipment transform. muscleGroup disambiguates
// patterns reused across genuinely different movements (e.g. 'curl' covers
// both elbow flexion and hamstring leg curls, which behave nothing alike).
const PATTERN_MUSCLE_DEFAULTS = {
  'press:chest': 4, 'press:shoulders': 4, 'press:triceps': 4,
  'fly:chest': 5, 'fly:shoulders': 5,
  'dip:chest': 4, 'dip:triceps': 4,
  'pulldown:back': 3,
  'pullover:back': 5,
  'row:back': 3, 'row:shoulders': 3,
  'hinge:hamstrings': 5, 'hinge:glutes': 5, 'hinge:quads': 5,
  'extension:triceps': 4, 'extension:quads': 2, 'extension:glutes': 2, 'extension:core': 3,
  'thrust:glutes': 2,
  'raise:shoulders': 1, 'raise:back': 2, 'raise:calves': 3, 'raise:core': 2,
  'rotation:shoulders': 3, 'rotation:core': 3, 'rotation:hips': 3,
  'curl:biceps': 4, 'curl:hamstrings': 3, 'curl:forearms': 3,
  'squat:quads': 5,
  'lunge:quads': 4, 'lunge:glutes': 4,
  'abduction:hips': 3,
  'calf-raise:calves': 3,
  'adduction:hips': 3,
  'rollout:core': 2,
  'crunch:core': 3,
  'hold:core': 3,
  'shrug:back': 4,
};

// Exercise-name overrides where the specific curveNote in exerciseDb.js
// clearly diverges from the pattern/muscle default — most importantly every
// `curve: 'opposing'` exercise (where resistance actively works against the
// muscle's own strength curve, which usually means the direction itself
// flips relative to the pattern default) plus a handful of others where the
// generic default would misrepresent a distinctly-worded curveNote.
const EXERCISE_OVERRIDES = {
  // opposing-curve exercises (direction flips vs. the pattern default)
  'rear delt fly (dumbbell)': 1,       // resistance drops exactly as rear delt peaks — ascending
  'lateral raise (dumbbell)': 1,       // zero at bottom, max at top of raise — strongly ascending
  'overhead tricep extension (dumbbell)': 2, // near-zero at stretch, max at lockout — ascending
  'leg extension': 1,                  // machine-only exercise but base rating captured here for reuse; peak resistance at full extension — strongly ascending
  'incline y-raise (dumbbell)': 2,     // same raise-family logic as lateral raise, moderate
  'dumbbell pullover': 5,              // max load overhead (start), decreasing toward chest — already matches pullover default, kept explicit for clarity

  // bell-shaped / clearly-worded exceptions
  'barbell curl': 4, 'ez-bar curl': 4, 'dumbbell curl (standing)': 4,
  'preacher curl (barbell)': 4, 'drag curl': 4, 'concentration curl': 4,
  'reverse curl': 4, 'incline dumbbell curl': 4, 'hammer curl': 4,
  'cross-body hammer curl': 4, 'zottman curl': 4, 'incline bench curl (scott curl)': 4,
  'spider curl': 2,        // gravity assists at peak contraction (top) per curveNote — genuinely different from standing curl
  'decline curl (carter curl)': 2, // gravity vector opposes at the top per curveNote — ascending, not the standing-curl default

  'skullcrusher (barbell)': 5, 'skullcrusher (ez-bar)': 5, 'jm press': 4, 'tate press': 5,
  'carter extension': 5, // "gravity peaks resistance at the most stretched position" — strongly descending

  'ab wheel rollout': 1, // "resistance increases as wheel rolls out, maximum load at full extension" — strongly ascending
  'standing ab rollout': 1,

  'roman chair sit-up': 5, 'ghd sit-up': 5, // hyperextended stretch start, gravity strong through flexion — descending
  'lying leg raise': 5, // maximum resistance at start (longest moment arm), decreasing as legs rise
  'incline bench leg raise': 2, // "adds resistance at the top of leg raise" — opposite of hanging/lying leg raise
  'weighted crunch': 3, // explicitly bell-shaped per curveNote ("less at top and bottom") — flat is the least-wrong single value

  'barbell hip thrust': 1, 'hip thrust (smith machine)': 1, 'glute bridge': 1, 'single-leg hip thrust': 1, 'frog pump': 1, // "resistance highest at peak contraction/top" — strongly ascending, more so than generic thrust default

  'leg press': 3, 'hack squat (machine)': 3, 'single-leg press': 3, // "resistance from sled weight consistent throughout ROM" — explicitly flat per curveNote, not the free-squat descending default

  'seated leg curl': 3, 'lying leg curl': 3, 'glute-ham raise (ghr)': 3, 'standing leg curl (machine)': 4, 'swiss ball leg curl': 4, 'nordic hamstring curl': 5,

  'sissy squat': 3, // "closely matches quad strength curve" per curveNote — flat

  'jump squat': 3, // explosive/ballistic, no clean monotonic direction — flat is least-wrong

  'push press': 3, // leg-drive-assisted ballistic press, not a clean gravity-only curve

  'donkey calf raise': 4, // hip-hinge loading adds a descending lean vs standard calf-raise default

  'landmine lateral raise': 2, // "increasing resistance through the raise" per curveNote but via landmine arc, not pure vertical gravity — less extreme than dumbbell lateral raise

  'kettlebell swing': 3, // ballistic hip hinge, momentum-driven — flat is the least-wrong single value for a scale built around static resistance
};

function normalize(name) {
  return name.toLowerCase().trim();
}

function baseRatingFor(exercise) {
  const key = normalize(exercise.name);
  if (key in EXERCISE_OVERRIDES) return EXERCISE_OVERRIDES[key];
  const patternKey = `${exercise.pattern}:${exercise.muscleGroup}`;
  return PATTERN_MUSCLE_DEFAULTS[patternKey] ?? null;
}

// Pulls a base rating toward 3 (flat) by `amount` steps, never overshooting
// past 3.
function pullToward3(base, amount) {
  if (base === 3) return 3;
  if (base > 3) return Math.max(3, base - amount);
  return Math.min(3, base + amount);
}

// Cam-engineering tiers for selectorized/pin machines — see the file header
// for reasoning. Smith machines deliberately have no tiers (see header).
//
// Pull amounts capped at 1, not 2: on a 1-5 scale, the maximum possible
// distance from center (3) is exactly 2 — a pull of 2 would therefore
// collapse EVERY exercise on that brand to precisely 3 regardless of its
// actual base rating, destroying all per-exercise differentiation and
// reading as a lazy uniform default rather than genuine per-exercise
// judgment (an earlier version of this file did exactly that for every
// Tier A brand and every cable exercise — caught and fixed before this
// file was finalized).
const SELECTORIZED_TIER_PULL = {
  'Life Fitness': 1, 'Hammer Strength': 1, 'Technogym': 1, 'Cybex': 1,
  'Nautilus': 1, 'Gym80': 1, 'Matrix Fitness': 1, 'Precor': 1,
  'Panatta': 1, 'Star Trac': 1, 'HOIST Fitness': 1, 'SportsArt': 1,
  'Atlantis Strength': 1, 'Keiser': 1,
  'Body-Solid': 0, 'BodyCraft': 0, 'Promaxima': 0, 'TKO': 0,
};

const NO_CABLE_CURVE_EXERCISES = new Set(['power clean', 'hang clean']);

const curves = {};
const skipped = [];

for (const ex of EXERCISE_DB) {
  if (ex.pattern === 'clean') { skipped.push(`${ex.name} (all equipment) — ballistic multi-phase lift, no single ascending/descending/flat judgment applies`); continue; }

  const base = baseRatingFor(ex);
  if (base == null) { skipped.push(`${ex.name} (${ex.equipment}) — no pattern/muscleGroup default and no override defined`); continue; }

  const nameKey = normalize(ex.name);

  if (ex.equipment === 'barbell' || ex.equipment === 'dumbbell' || ex.equipment === 'bodyweight' || ex.equipment === 'kettlebell') {
    curves[nameKey] = base;
  } else if (ex.equipment === 'cable') {
    if (NO_CABLE_CURVE_EXERCISES.has(nameKey)) { skipped.push(`${ex.name} (cable)`); continue; }
    // Keyed per-brand like machine/smith (per task scope), but the *value*
    // is deliberately identical across every cable brand: cable tension is
    // set by the weight stack and redirected losslessly by the pulley
    // regardless of manufacturer — unlike a selectorized machine's cam,
    // there's no real per-brand mechanism that would change a cable
    // exercise's curve shape. Documented here rather than silently varying
    // values that have no real basis to differ.
    const rating = pullToward3(base, 1); // capped at 1, not 2 — see SELECTORIZED_TIER_PULL's comment for why
    for (const brand of CABLE_BRANDS) {
      curves[`${nameKey}|${brand.toLowerCase()}`] = rating;
    }
  } else if (ex.equipment === 'machine') {
    for (const brand of SELECTORIZED_BRANDS) {
      const pull = SELECTORIZED_TIER_PULL[brand] ?? 1;
      curves[`${nameKey}|${brand.toLowerCase()}`] = pullToward3(base, pull);
    }
  } else if (ex.equipment === 'smith') {
    for (const brand of SMITH_BRANDS) {
      curves[`${nameKey}|${brand.toLowerCase()}`] = base;
    }
  }
}

// ---------------------------------------------------------------------------
// Plate-loaded machine base resistance (kg)
// ---------------------------------------------------------------------------
// Added after the main pass — see .design/feature-brainstorm/
// EXERCISE_PARAMETERIZATION.md §7. Plate-loaded machines (as opposed to
// pin/selectorized ones, which select an exact weight-stack number directly)
// have a lever/carriage mechanism, so the resistance actually felt isn't 1:1
// with the plates loaded — there's an effective starting resistance from the
// empty carriage/lever arm itself before any plates go on, analogous to a
// barbell's own 20kg bar weight. This section estimates that empty-carriage
// figure in kg. It does NOT estimate the lever ratio (how much a given kg of
// plates gets multiplied by) — that's a separate, harder number with much
// less confidence behind it, deliberately left out rather than guessed.
//
// Same best-effort, no-citation rigor as the rest of this file — if anything,
// lower confidence, since `machineBrands.js`'s SELECTORIZED_BRANDS list
// doesn't distinguish plate-loaded from pin-loaded at all (both bucket under
// 'machine' equipment today), so which brand/exercise pairs are genuinely
// plate-loaded is itself a judgment call here, not sourced data. Scoped
// deliberately narrow: only the exercise/brand combinations where a
// plate-loaded configuration is the well-known/dominant one for that
// exercise, not a guess extended to every machine exercise in the DB.
//
//   - Hammer Strength: plate-loaded is that brand's whole identity (their
//     iso-lateral chest press, row, and leg press lines are the textbook
//     example of plate-loaded machines) — included across every machine
//     exercise it's judged to plausibly manufacture a plate-loaded version
//     of.
//   - Leg Press / Single-Leg Press / Hack Squat (Machine) / Calf Raise on
//     Leg Press: these specific big-capacity lower-body movements are
//     commonly plate-loaded industry-wide (higher weight capacity than a
//     weight-stack design easily supports), regardless of brand — included
//     for the brands whose plate-loaded leg-press-family lines came up
//     directly in this feature's own brand research (Atlantis Strength,
//     SportsArt — both had their plate-loaded leg press specifically
//     mentioned) plus the other major brands known to offer a plate-loaded
//     line alongside their standard selectorized one (Life Fitness, Matrix
//     Fitness, Panatta, Gym80).
//   - Everything else (pulldowns, flyes, curls, raises, adductor/abductor,
//     etc.) is overwhelmingly pin/selectorized in commercial gyms and
//     deliberately excluded here rather than guessed.
const PLATE_LOADED_BASE_RESISTANCE_KG = {
  'machine chest press|hammer strength': 9,
  'machine row (seated)|hammer strength': 7,
  'leg press|hammer strength': 32,
  'single-leg press|hammer strength': 20,
  'hack squat (machine)|hammer strength': 18,
  'calf raise on leg press|hammer strength': 32, // same sled as leg press

  'leg press|atlantis strength': 30,
  'leg press|sportsart': 28,
  'leg press|life fitness': 25,
  'leg press|matrix fitness': 25,
  'leg press|panatta': 27,
  'leg press|gym80': 30,

  'single-leg press|atlantis strength': 18,
  'single-leg press|sportsart': 17,
  'single-leg press|life fitness': 15,
  'single-leg press|matrix fitness': 15,
  'single-leg press|panatta': 16,
  'single-leg press|gym80': 18,

  'hack squat (machine)|atlantis strength': 20,
  'hack squat (machine)|sportsart': 18,
  'hack squat (machine)|life fitness': 15,
  'hack squat (machine)|matrix fitness': 15,
  'hack squat (machine)|panatta': 17,
  'hack squat (machine)|gym80': 20,

  'calf raise on leg press|atlantis strength': 30,
  'calf raise on leg press|sportsart': 28,
  'calf raise on leg press|life fitness': 25,
  'calf raise on leg press|matrix fitness': 25,
  'calf raise on leg press|panatta': 27,
  'calf raise on leg press|gym80': 30,
};

module.exports = { RESISTANCE_CURVES: curves, SKIPPED: skipped, baseRatingFor, normalize, PLATE_LOADED_BASE_RESISTANCE_KG };
