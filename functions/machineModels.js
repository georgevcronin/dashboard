// Named gym-equipment product models per (exercise, brand) — e.g. "Life
// Fitness — Insignia Series Chest Press", "Hammer Strength — MTS Iso-Lateral
// Row". Real named products only, matched against this codebase's own
// exerciseDb.js and machineBrands.js.
//
// ⚠️ SAME "DO NOT REPEAT THE BOOTY BUILDER MISTAKE" WARNING AS
// resistanceCurves.js. An earlier pass in this codebase (see
// resistanceCurves.js's own header/BOOTY_BUILDER_EXERCISES comment)
// fabricated 25 of 28 entries for a specialist brand by assuming its catalog
// covered every exercise uniformly. This file was built the other way:
// researched per brand (WebSearch against manufacturer sites, spec sheets,
// and dealer listings — see "Sourcing" below), and an exercise/brand pair is
// only included when a genuine named product was actually found for it.
// Absence is the expected, correct default for most brand/exercise
// combinations — it does NOT mean "not researched," it means "no confirmed
// named model for that pair." Nothing here is invented or extrapolated from
// a brand's general reputation.
//
// One deliberate, documented exception to "one exercise, one specific
// model": general-purpose cable/functional-trainer stations (Life Fitness
// Signature Series Dual Adjustable Pulley, Hammer Strength Dual Adjustable
// Pulley, Matrix Versa Dual Pulley, Technogym Kinesis Personal, FreeMotion
// Genesis Dual Cable Cross, Force USA G20, Bolt Fitness Supply Freedom
// Functional Trainer, Altas Strength AL-3073 Functional Trainer) are, by
// design and by their own manufacturer's marketing copy, a single physical
// product that performs the large majority of cable exercises in this app's
// catalog (sources explicitly claim "75+ cable exercises" / "90%+ exercise
// coverage" for these specific products) — unlike Booty Builder's narrow
// hip-thrust-specialist catalog, this breadth is the actual sourced claim,
// not an assumption. Every cable-equipment exercise for these 8 brands maps
// to that one named product for that reason. Cybex, Precor, and Panatta are
// also CABLE_BRANDS but are deliberately absent here — this research pass
// did not turn up a specific, confidently-named freestanding cable-crossover
// product for any of them (Panatta's "Freeweight One Lat Pulldown Circular"
// is a real named product but is a dedicated pulldown machine, not a general
// cable station, so it's filed under the "machine" section below instead,
// against the closest matching exercise).
//
// Budget/home-gym brands (Body-Solid, BodyCraft, Promaxima, TKO, RitFit,
// Major Fitness, MAXUM Fitness) genuinely do market named model lines
// (unlike what might be assumed) — their product pages use real model
// numbers/names (e.g. Body-Solid GLPH1100, TKO 700CP) same as premium
// commercial brands, just smaller catalogs. Coverage for these brands is
// narrower here only because their catalogs are narrower, not because they
// were researched less rigorously.
//
// Known confirmed gaps (researched, no genuine named model found — NOT an
// oversight):
//   - Life Fitness / Technogym / Cybex: no confirmed named Smith-machine
//     product distinct enough to include (Life Fitness and Technogym's
//     product pages don't surface one; Cybex's own material just says
//     "Cybex manufactures a Smith Machine" with no product name attached).
//   - Atlantis Strength: Precision Series plate-loaded leg press is real
//     (referenced in this codebase's own resistanceCurves.js research) but
//     this pass could not re-confirm its exact printed model name, so it's
//     left out rather than guessed.
//   - Keiser A300 Squat: a real product, but it's a standing pneumatic squat
//     trainer, not a hack-squat-sled machine — judged too different a
//     movement pattern from "Hack Squat (Machine)" to count as a match.
//   - Star Trac Leg Press is on their Impact Strength line, not Instinct —
//     included, but flagged here since it's a cross-line match rather than
//     everything coming from one series.
//   - RitFit / Major Fitness / MAXUM Fitness Smith machines are genuinely
//     marketed as multi-function home-gym combo units (rack + Smith + cable
//     pulley all in one) rather than single-purpose Smith machines — the
//     model name is still real and correct, just describes a combo product.
//
// Sourcing (manufacturer sites / spec sheets / dealer listings actually
// read during this research pass): lifefitness.com (Insignia Series, Eagle
// NX, Hammer Strength MTS/DAP, Signature Series), technogym.com (Pure
// Strength, Kinesis), matrixfitness.com + performancehealth.com (Magnum,
// Versa), precor.com + topfitness.com (Discovery Series), panattasport.com
// (Smith Machine Selectorized, Super/Freeweight One lines), ardentfitness.com
// (Nautilus One Series), fhplanet.com/fitkituk.com (Star Trac Instinct/
// Impact), showmeweights.com (Atlantis Strength Precision Series), gym80.us
// + gym80.co.uk (Sygnum), hoistfitness.com + gympart.com (ROC-IT),
// gosportsart.com + ironcompany.com (SportsArt A-series), keiser.com (A300),
// bodysolid.com (GLPH1100, GCEC-STK), bodycraft.com (F760, EXP Series),
// totalbodyexperts.com + powersystems.com (Promaxima Raptor), tkostrength.com
// (Signature 700CP, 712LP), bootybuilder.com (V8, Standing Adductor/
// Abductor), home.freemotionfitness.com (Genesis Dual Cable Cross),
// forceusa.com (G20), boltfitnesssupply.com (Freedom Functional Trainer),
// altasstrength.com (AL-3073), watsongym.co.uk (Counter-Balanced Smith
// Machine), primalstrength.com (Performance Series Olympic 5 Degree Smith
// Machine), blkboxfitness.com (Smith Machine), majorfitness.com (Spirit
// B52), ritfitsports.com (M1 PRO).
//
// Keying matches resistanceCurves.js exactly: `${normalize(exerciseName)}|
// ${brandLowercase}` -> model name string. normalize() is imported from
// resistanceCurves.js rather than reimplemented, so keys are guaranteed
// compatible between the two files.

const { normalize } = require('./resistanceCurves');

const MACHINE_MODELS = {};

function add(exerciseName, brand, model) {
  MACHINE_MODELS[`${normalize(exerciseName)}|${brand.toLowerCase()}`] = model;
}

// ---------------------------------------------------------------------------
// Selectorized / plate-loaded "machine" equipment
// ---------------------------------------------------------------------------

// Life Fitness — Insignia Series
add('Pec Deck / Machine Fly', 'Life Fitness', 'Insignia Series Pectoral Fly/Rear Deltoid');
add('Reverse Pec Deck', 'Life Fitness', 'Insignia Series Pectoral Fly/Rear Deltoid');
add('Machine Chest Press', 'Life Fitness', 'Insignia Series Chest Press');
add('Lat Pulldown (Wide Grip)', 'Life Fitness', 'Insignia Series Pulldown');
add('Close-Grip Lat Pulldown', 'Life Fitness', 'Insignia Series Pulldown');
add('Behind-Neck Lat Pulldown', 'Life Fitness', 'Insignia Series Pulldown');
add('Machine Row (Seated)', 'Life Fitness', 'Insignia Series Row');
add('Machine Shoulder Press', 'Life Fitness', 'Insignia Series Shoulder Press');
add('Lateral Raise (Machine)', 'Life Fitness', 'Insignia Series Lateral Raise');
add('Leg Press', 'Life Fitness', 'Insignia Series Arc Leg Press');
add('Leg Extension', 'Life Fitness', 'Insignia Series Leg Extension');
add('Seated Leg Curl', 'Life Fitness', 'Insignia Series Seated Leg Curl');
add('Lying Leg Curl', 'Life Fitness', 'Insignia Series Leg Curl');
add('Adductor Machine', 'Life Fitness', 'Insignia Series Hip Abduction / Adduction');
add('Abductor Machine', 'Life Fitness', 'Insignia Series Hip Abduction / Adduction');
add('Machine Curl', 'Life Fitness', 'Insignia Series Biceps Curl');
add('Hip Thrust (Machine)', 'Life Fitness', 'Insignia Series Glute Bridge');
add('Standing Calf Raise (Machine)', 'Life Fitness', 'Insignia Series Calf Extension');

// Hammer Strength — MTS / Plate-Loaded Iso-Lateral
add('Machine Chest Press', 'Hammer Strength', 'MTS Iso-Lateral Chest Press');
add('Machine Row (Seated)', 'Hammer Strength', 'MTS Iso-Lateral Row');
add('Leg Press', 'Hammer Strength', 'Plate-Loaded Iso-Lateral Leg Press');
add('Lat Pulldown (Wide Grip)', 'Hammer Strength', 'MTS Iso-Lateral Front Pulldown');
add('Close-Grip Lat Pulldown', 'Hammer Strength', 'MTS Iso-Lateral Front Pulldown');

// Technogym — Pure Strength
add('Machine Chest Press', 'Technogym', 'Pure Strength Chest Press');
add('Leg Press', 'Technogym', 'Pure Strength Leg Press');
add('Machine Shoulder Press', 'Technogym', 'Pure Strength Shoulder Press');
add('Machine Row (Seated)', 'Technogym', 'Pure Strength Row');

// Matrix Fitness — Magnum plate-loaded line
add('Machine Chest Press', 'Matrix Fitness', 'Magnum Vertical Bench Press');
add('Machine Shoulder Press', 'Matrix Fitness', 'Magnum Shoulder Press');
add('Lat Pulldown (Wide Grip)', 'Matrix Fitness', 'Magnum Lat Pulldown');
add('Machine Row (Seated)', 'Matrix Fitness', 'Magnum Seated Row');
add('Machine Curl', 'Matrix Fitness', 'Magnum Elevated Biceps Curl');
add('Leg Press', 'Matrix Fitness', 'Magnum 45-Degree Leg Press');
add('Hack Squat (Machine)', 'Matrix Fitness', 'Magnum Hack Squat');
add('Lying Leg Curl', 'Matrix Fitness', 'Magnum Kneeling Leg Curl');
add('Leg Extension', 'Matrix Fitness', 'Magnum Reclining Leg Extension');
add('Standing Calf Raise (Machine)', 'Matrix Fitness', 'Magnum Standing Calf');
add('Seated Calf Raise', 'Matrix Fitness', 'Magnum Seated Calf');
add('Hip Thrust (Machine)', 'Matrix Fitness', 'Magnum Glute Trainer');

// Cybex — Eagle NX
add('Machine Chest Press', 'Cybex', 'Eagle NX Chest Press');
add('Machine Shoulder Press', 'Cybex', 'Eagle NX Overhead Press');
add('Machine Row (Seated)', 'Cybex', 'Eagle NX Row');
add('Leg Press', 'Cybex', 'Eagle NX Leg Press');
add('Leg Extension', 'Cybex', 'Eagle NX Leg Extension');
add('Seated Leg Curl', 'Cybex', 'Eagle NX Seated Leg Curl');
add('Machine Curl', 'Cybex', 'Eagle NX Arm Curl');
add('Lat Pulldown (Wide Grip)', 'Cybex', 'Eagle NX Pulldown');
add('Hip Thrust (Machine)', 'Cybex', 'Eagle Glute Machine');
add('Adductor Machine', 'Cybex', 'Eagle NX Hip Abduction/Adduction');
add('Abductor Machine', 'Cybex', 'Eagle NX Hip Abduction/Adduction');

// Precor — Discovery Series
add('Machine Chest Press', 'Precor', 'Discovery Series Chest Press');
add('Leg Press', 'Precor', 'Discovery Series Leg Press');
add('Leg Extension', 'Precor', 'Discovery Series Leg Extension');
add('Seated Leg Curl', 'Precor', 'Discovery Series Seated Leg Curl');
add('Lat Pulldown (Wide Grip)', 'Precor', 'Discovery Series Lat Pulldown');
add('Machine Shoulder Press', 'Precor', 'Discovery Series Shoulder Press');
add('Reverse Pec Deck', 'Precor', 'Discovery Series Rear Delt/Pec Fly');
add('Pec Deck / Machine Fly', 'Precor', 'Discovery Series Rear Delt/Pec Fly');

// Panatta
add('Machine Chest Press', 'Panatta', 'Vertical Chest Press');
add('Leg Press', 'Panatta', 'Super Horizontal Leg Press Dual System');
add('Lat Pulldown (Wide Grip)', 'Panatta', 'Freeweight One Lat Pulldown Circular');
add('Close-Grip Lat Pulldown', 'Panatta', 'Freeweight One Lat Pulldown Circular');

// Nautilus — One Series
add('Leg Extension', 'Nautilus', 'One Series Leg Extension');
add('Lat Pulldown (Wide Grip)', 'Nautilus', 'One Series Lat Pulldown');
add('Machine Row (Seated)', 'Nautilus', 'One Series Row');
add('Machine Chest Press', 'Nautilus', 'One Series Chest Press');
add('Machine Shoulder Press', 'Nautilus', 'One Series Shoulder Press');
add('Machine Curl', 'Nautilus', 'One Series Biceps Curl');
add('Leg Press', 'Nautilus', 'One Series Leg Press');
add('Adductor Machine', 'Nautilus', 'One Series Hip Abduction/Adduction');
add('Abductor Machine', 'Nautilus', 'One Series Hip Abduction/Adduction');

// Star Trac — Instinct Series (Leg Press is on the Impact Strength line — see header)
add('Machine Chest Press', 'Star Trac', 'Instinct Chest Press');
add('Machine Curl', 'Star Trac', 'Instinct Bicep Curl');
add('Leg Extension', 'Star Trac', 'Instinct Leg Extension');
add('Lying Leg Curl', 'Star Trac', 'Instinct Leg Curl');
add('Lat Pulldown (Wide Grip)', 'Star Trac', 'Instinct Lateral Pulldown');
add('Machine Row (Seated)', 'Star Trac', 'Instinct Vertical Row');
add('Machine Shoulder Press', 'Star Trac', 'Instinct Shoulder Press');
add('Leg Press', 'Star Trac', 'Impact Strength Leg Press');
add('Hip Thrust (Machine)', 'Star Trac', 'Instinct Glute Press');

// Atlantis Strength — Precision Series
add('Machine Chest Press', 'Atlantis Strength', 'Precision Series Plate-Loaded Incline Converging Chest Press');

// Gym80 — Sygnum
add('Machine Chest Press', 'Gym80', 'Sygnum Dual Incline Chest Press');
add('Leg Press', 'Gym80', 'Sygnum Dual Leg Press');

// HOIST Fitness — ROC-IT
add('Leg Press', 'HOIST Fitness', 'ROC-IT Leg Press (RS-1403)');
add('Adductor Machine', 'HOIST Fitness', 'ROC-IT Inner Thigh Adductor (RS-1406)');
add('Abductor Machine', 'HOIST Fitness', 'ROC-IT Outer Thigh Abductor (RS-1407)');
add('Standing Calf Raise (Machine)', 'HOIST Fitness', 'ROC-IT Rotary Calf (RS-1415)');
add('Hip Thrust (Machine)', 'HOIST Fitness', 'ROC-IT Glute Master (RS-1412)');

// SportsArt — A-series plate-loaded
add('Machine Chest Press', 'SportsArt', 'A985 Chest Press');
add('Leg Press', 'SportsArt', 'A982 Angled Leg Press');

// Keiser — A300 (pneumatic resistance)
add('Machine Chest Press', 'Keiser', 'A300 Chest Press Pro');
add('Leg Press', 'Keiser', 'A300 Leg Press Heavy');

// Body-Solid — combo machines (same physical unit covers both listed exercises)
add('Leg Press', 'Body-Solid', 'GLPH1100 Leg Press & Hack Squat');
add('Hack Squat (Machine)', 'Body-Solid', 'GLPH1100 Leg Press & Hack Squat');
add('Leg Extension', 'Body-Solid', 'Pro Select GCEC-STK Leg Extension/Curl');
add('Lying Leg Curl', 'Body-Solid', 'Pro Select GCEC-STK Leg Extension/Curl');

// BodyCraft
add('Leg Press', 'BodyCraft', 'F760 Pro Linear Bearing Leg Press/Hack Squat');
add('Hack Squat (Machine)', 'BodyCraft', 'F760 Pro Linear Bearing Leg Press/Hack Squat');
add('Calf Raise on Leg Press', 'BodyCraft', 'EXP Series Seated Leg Press/Calf Raise');

// Promaxima
add('Leg Press', 'Promaxima', 'Raptor Seated Leg Press (P-5000)');
add('Pec Deck / Machine Fly', 'Promaxima', 'Raptor Chest-Fly Machine (P-1500)');

// TKO
add('Machine Chest Press', 'TKO', 'Signature Chest Press (700CP)');
add('Leg Press', 'TKO', 'Signature Linear Leg Press (712LP)');

// Booty Builder — real, narrow glute/hip-thrust specialist catalog (same
// three confirmed matches used in resistanceCurves.js's
// BOOTY_BUILDER_EXERCISES, minus Hack Squat (Machine) — that resistanceCurves
// entry is explicitly flagged there as a plausible-pattern match, not a
// confirmed identical product name, so it's deliberately excluded from this
// stricter "genuine named model" file).
add('Hip Thrust (Machine)', 'Booty Builder', 'Booty Builder V8');
add('Adductor Machine', 'Booty Builder', 'Booty Builder Selectorized Standing Hip Adduction');
add('Abductor Machine', 'Booty Builder', 'Booty Builder Standing Abductor');

// ---------------------------------------------------------------------------
// Cable equipment
// ---------------------------------------------------------------------------

// Broad general-purpose functional-trainer/dual-pulley stations — see file
// header for why these map across (almost) the entire cable exercise list.
const CABLE_EXERCISE_NAMES = [
  'Cable Fly (High to Low)', 'Cable Fly (Low to High)', 'Cable Crossover',
  'Cable Straight-Arm Pulldown', 'Single-Arm Lat Pulldown', 'Cable Pullover',
  'Seated Cable Row', 'Single-Arm Cable Row', 'High Cable Row', 'Face Pull',
  'Rear Delt Fly (Cable)', 'Cable Pull-Through', 'Lateral Raise (Cable)',
  'Cable Y-Raise', 'Low Cable Curl', 'Cable Tricep Pushdown (Rope)',
  'Cable Tricep Pushdown (Bar)', 'Overhead Tricep Extension (Cable)',
  'Cable Glute Kickback', 'Cable Hip Adduction', 'Cable Crunch',
  'Pallof Press', 'Incline Cable Fly', 'Single-Arm Cable Press',
  'Standing Single-Arm Cable Row', 'Cable Shrug', 'Kelso Shrug (Low Pulley)',
  'Kelso Shrug (Mid Pulley)', 'Kelso Shrug (High Pulley)',
  'Single-Arm Cable Lateral Raise', 'External Rotation (Cable)',
  'Internal Rotation (Cable)', 'High Cable Curl', 'Single-Arm Cable Pushdown',
  'Reverse Grip Pushdown', 'Cable Hip Abduction', 'Cable Woodchop',
  'Half-Kneeling Pallof Press', 'Wide-Grip Cable Row',
  'Overhead Cable Curl (Double Bicep)', 'Overhead Cable Face Pull',
];

const FUNCTIONAL_TRAINER_BRAND_MODELS = {
  'Life Fitness': 'Signature Series Dual Adjustable Pulley',
  'Hammer Strength': 'Dual Adjustable Pulley (DAP)',
  'Matrix Fitness': 'Versa Dual Pulley',
  'Technogym': 'Kinesis Personal',
  'FreeMotion': 'Genesis Dual Cable Cross',
  'Force USA': 'G20 Functional Trainer',
  'Bolt Fitness Supply': 'Freedom Functional Trainer',
  'Altas Strength': 'AL-3073 Functional Trainer',
};

for (const [brand, model] of Object.entries(FUNCTIONAL_TRAINER_BRAND_MODELS)) {
  for (const exerciseName of CABLE_EXERCISE_NAMES) {
    add(exerciseName, brand, model);
  }
}

// ---------------------------------------------------------------------------
// Smith machine equipment
// ---------------------------------------------------------------------------

const SMITH_EXERCISE_NAMES = [
  'Behind-Neck Press (Smith Machine)', 'Hip Thrust (Smith Machine)',
  'Smith Machine Overhead Press',
];

const SMITH_BRAND_MODELS = {
  'Matrix Fitness': 'Versa Smith Machine',
  'Panatta': 'Smith Machine Selectorized',
  'Watson Gym Equipment': 'Counter-Balanced Plate-Loaded Smith Machine',
  'Primal Strength': 'Primal Performance Series Olympic 5 Degree Smith Machine',
  'BLK BOX': 'BLK BOX Smith Machine',
  'Major Fitness': 'Spirit B52 Smith Machine',
  'RitFit': 'M1 PRO Smith Machine',
  'MAXUM Fitness': 'MAXUM SX2 Smith Machine',
};

for (const [brand, model] of Object.entries(SMITH_BRAND_MODELS)) {
  for (const exerciseName of SMITH_EXERCISE_NAMES) {
    add(exerciseName, brand, model);
  }
}

module.exports = { MACHINE_MODELS };
