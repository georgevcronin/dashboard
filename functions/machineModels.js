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
// 2026-07 DEEPER RE-PASS: the file's original research (everything above
// this note in spirit) sampled a handful of products per brand rather than
// each brand's full published catalog — caught and fixed by hand for Hammer
// Strength first (68 entries from a user-supplied complete catalog; see that
// section below, left untouched by this pass), then redone at the same
// depth for every other SELECTORIZED_BRANDS/CABLE_BRANDS/SMITH_BRANDS brand
// except Booty Builder (its narrow catalog was already deliberately correct
// — see its own section comment) and the 8-brand broad cable
// functional-trainer block (Life Fitness, Hammer Strength, Matrix Fitness,
// Technogym, FreeMotion, Force USA, Bolt Fitness Supply, Altas Strength —
// that breadth claim was independently re-confirmed as still accurate and
// left untouched). This pass fetched/searched each brand's actual current
// catalog pages (not just the first search hit) and, for brands whose
// original entries were already close to their catalog's real ceiling (Life
// Fitness, Matrix Fitness), mostly reconfirmed rather than expanded — that's
// the correct, expected result for an already-well-covered brand, not a
// sign the brand wasn't rechecked. Four brands turned up genuine, confirmed
// named Smith-machine products not previously tracked anywhere in this file
// (Precor Discovery Series, Star Trac Instinct, SportsArt A983, Body-Solid
// Pro Clubline) and were added to SMITH_BRANDS in machineBrands.js on that
// evidence, same bar as Hammer Strength's Smith addition in the original
// pass.
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
//   - Panatta Freeweight One "Standing Hip Thrust": a real product, but a
//     standing/kneeling glute-extension unit, not the seated/loaded pattern
//     "Hip Thrust (Machine)" describes — same reasoning as the Keiser
//     exclusion above, left out rather than force-matched.
//   - Star Trac Leg Press is on their Impact Strength line, not Instinct —
//     included, but flagged here since it's a cross-line match rather than
//     everything coming from one series.
//   - RitFit / Major Fitness / MAXUM Fitness Smith machines are genuinely
//     marketed as multi-function home-gym combo units (rack + Smith + cable
//     pulley all in one) rather than single-purpose Smith machines — the
//     model name is still real and correct, just describes a combo product.
//
// Sourcing (manufacturer sites / spec sheets / dealer listings actually
// read during this research pass, both original and 2026-07 re-pass):
// lifefitness.com (Insignia Series, Eagle NX, Hammer Strength MTS/DAP,
// Signature Series), technogym.com (Pure Strength, Selection 700/900,
// Kinesis), matrixfitness.com + johnsonfitness.com (Magnum, Versa, Ultra),
// precor.com + topfitness.com (Discovery Series selectorized + plate-loaded,
// incl. Smith Machine DPL0802), panattasport.com (Smith Machine
// Selectorized, Super/Freeweight One lines), ardentfitness.com (Nautilus One
// Series), fhplanet.com/fitkituk.com/ctxhomegyms.com (Star Trac Instinct/
// Impact, incl. Instinct Smith Machine), showmeweights.com +
// atlantisstrength.com (Atlantis Strength Precision Series), gym80.us +
// gym80.co.uk (Sygnum, Pure Kraft), hoistfitness.com + progymsupply.com
// (ROC-IT RS-/RPL- full model range), gosportsart.com + ironcompany.com
// (SportsArt A975-A989, incl. A983 Smith Machine), keiser.com (A300/A350),
// bodysolid.com (GLPH1100, GCEC-STK, Pro Clubline Leverage/Series II, incl.
// Counter-Balanced Smith Machine), bodycraft.com (F760, EXP Series, F620,
// F640), totalbodyexperts.com + powersystems.com + ironcompany.com
// (Promaxima Raptor full single-station range), strengthwarehouseusa.com
// (TKO Signature full model range), bootybuilder.com (V8, Standing
// Adductor/Abductor), home.freemotionfitness.com (Genesis Dual Cable Cross),
// forceusa.com (G20), boltfitnesssupply.com (Freedom Functional Trainer),
// altasstrength.com (AL-3073), watsongym.co.uk (Counter-Balanced Smith
// Machine), primalstrength.com (Performance Series Olympic 5 Degree Smith
// Machine), blkboxfitness.com (Smith Machine), majorfitness.com (Spirit
// B52), ritfitsports.com (M1 PRO), maxumfitness.us (SX2).
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

// Life Fitness — Insignia Series. Re-checked against the full published
// Insignia Series product listing (lifefitness.com/catalog/strength-training/
// selectorized/insignia-series) this pass — already near-complete from the
// original research; the only genuine addition is Back Extension.
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
add('Reverse Hyperextension', 'Life Fitness', 'Insignia Series Back Extension');

// Hammer Strength — mapped against the brand's full published product
// catalog (plate-loaded Iso-Lateral line, MTS pin-selectorized line, the
// standard single-stack Select line, and Smith Machines), not just a
// sampled handful — user-supplied catalog data, more complete than this
// file's original web-search pass. Plate-loaded Iso-Lateral entries are
// preferred as the primary match where a Select/MTS equivalent also exists
// for the same exercise (that line is the brand's actual flagship/most
// recognizable product), except where the exerciseDb.js exercise name
// itself specifies a trait (e.g. "Seated") that a different product line
// matches more precisely.
add('Pec Deck / Machine Fly', 'Hammer Strength', 'Select Pectoral Fly / Rear Deltoid');
add('Reverse Pec Deck', 'Hammer Strength', 'Select Pectoral Fly / Rear Deltoid');
add('Machine Chest Press', 'Hammer Strength', 'Iso-Lateral Bench Press');
add('Machine Shoulder Press', 'Hammer Strength', 'Iso-Lateral Shoulder Press');
add('Lateral Raise (Machine)', 'Hammer Strength', 'Plate Loaded Lateral Raise');
add('Lat Pulldown (Wide Grip)', 'Hammer Strength', 'Iso-Lateral Front Lat Pulldown');
add('Close-Grip Lat Pulldown', 'Hammer Strength', 'Iso-Lateral Front Lat Pulldown');
add('Behind-Neck Lat Pulldown', 'Hammer Strength', 'Iso-Lateral Front Lat Pulldown');
add('Machine Row (Seated)', 'Hammer Strength', 'Select Seated Row');
add('Machine Curl', 'Hammer Strength', 'Plate Loaded Seated Biceps');
add('Hip Thrust (Machine)', 'Hammer Strength', 'Plate Loaded Glute Drive');
add('Hack Squat (Machine)', 'Hammer Strength', 'Plate Loaded Hack Squat');
add('Leg Press', 'Hammer Strength', 'Plate Loaded Leg Press');
add('Leg Extension', 'Hammer Strength', 'Iso-Lateral Leg Extension');
add('Lying Leg Curl', 'Hammer Strength', 'Iso-Lateral Leg Curl');
add('Seated Leg Curl', 'Hammer Strength', 'MTS Iso-Lateral Leg Curl');
add('Seated Calf Raise', 'Hammer Strength', 'Plate Loaded Seated Calf Raise');
add('Calf Raise on Leg Press', 'Hammer Strength', 'Super Horizontal Calf');
add('Standing Calf Raise (Machine)', 'Hammer Strength', 'Select Standing Calf');
add('Abductor Machine', 'Hammer Strength', 'Select Hip Abduction');
add('Adductor Machine', 'Hammer Strength', 'Select Hip Adduction');
// Not mapped despite being real named products in the catalog: no
// exerciseDb.js exercise corresponds to Iso-Lateral Incline/Decline Press,
// Iso-Lateral Wide Chest, the Ground Base power-training line, T-Bar Row,
// assisted dip/chin, triceps extension, ab/torso-rotation, neck, gripper,
// or belt-squat/V-squat/super-squat-press machines — left absent rather
// than force-matched to a non-equivalent exercise.

// Technogym — Pure Strength (plate-loaded) + Selection line (selectorized).
// The original pass only sampled Pure Strength's 4 most obvious machines;
// re-checked against technogym.com's individual product pages, which
// confirmed several more real named products across both lines.
add('Machine Chest Press', 'Technogym', 'Pure Strength Chest Press');
add('Leg Press', 'Technogym', 'Pure Strength Leg Press');
add('Machine Shoulder Press', 'Technogym', 'Pure Strength Shoulder Press');
add('Machine Row (Seated)', 'Technogym', 'Pure Strength Row');
add('Lat Pulldown (Wide Grip)', 'Technogym', 'Pure Strength Pulldown');
add('Close-Grip Lat Pulldown', 'Technogym', 'Pure Strength Pulldown');
add('Behind-Neck Lat Pulldown', 'Technogym', 'Pure Strength Pulldown');
add('Machine Curl', 'Technogym', 'Pure Biceps');
add('Leg Extension', 'Technogym', 'Pure Leg Extension');
add('Abductor Machine', 'Technogym', 'Pure Strength Standing Abductor');

// Matrix Fitness — Magnum plate-loaded line. Re-checked against Matrix's own
// model-number listing (MG-PL20/23/33/34/41/70/71/72/73/76/77/78) this pass —
// every entry below was independently reconfirmed; no genuinely new
// exercise/product pair turned up (Magnum also makes Squat/Lunge MG-PL79,
// Pendulum Squat MG-PL80, and Belt Squat MG-PL81, but none of those are a
// close match to any exerciseDb.js exercise, so left out).
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

// Cybex — Eagle NX (15-piece line, now sold under Life Fitness). Re-checked
// against the fuller Eagle NX product spread (Chest Press, Overhead Press,
// Incline Press, Row, Leg Press, Leg Extension, Seated/Prone Leg Curl, Arm
// Curl, Arm Extension, Abdominal, Back Extension, Fly/Rear Delt, Calf, Lat
// Pulldown, Lateral Raise, Glute, Hip Abduction/Adduction, Torso Rotation) —
// several genuine additions beyond the original sample. Arm Extension
// (triceps), Abdominal, Incline Press, and Torso Rotation have no
// corresponding exerciseDb.js exercise, so stay unmapped.
add('Machine Chest Press', 'Cybex', 'Eagle NX Chest Press');
add('Machine Shoulder Press', 'Cybex', 'Eagle NX Overhead Press');
add('Machine Row (Seated)', 'Cybex', 'Eagle NX Row');
add('Leg Press', 'Cybex', 'Eagle NX Leg Press');
add('Leg Extension', 'Cybex', 'Eagle NX Leg Extension');
add('Seated Leg Curl', 'Cybex', 'Eagle NX Seated Leg Curl');
add('Lying Leg Curl', 'Cybex', 'Eagle NX Prone Leg Curl');
add('Machine Curl', 'Cybex', 'Eagle NX Arm Curl');
add('Lat Pulldown (Wide Grip)', 'Cybex', 'Eagle NX Pulldown');
add('Hip Thrust (Machine)', 'Cybex', 'Eagle Glute Machine');
add('Adductor Machine', 'Cybex', 'Eagle NX Hip Abduction/Adduction');
add('Abductor Machine', 'Cybex', 'Eagle NX Hip Abduction/Adduction');
add('Pec Deck / Machine Fly', 'Cybex', 'Eagle NX Fly/Rear Delt');
add('Reverse Pec Deck', 'Cybex', 'Eagle NX Fly/Rear Delt');
add('Lateral Raise (Machine)', 'Cybex', 'Eagle NX Lateral Raise');
add('Standing Calf Raise (Machine)', 'Cybex', 'Eagle NX Calf');
add('Reverse Hyperextension', 'Cybex', 'Eagle NX Back Extension');

// Precor — Discovery Series (selectorized + plate-loaded). Re-checked
// against the full Discovery plate-loaded listing (precor.com/strength/
// plate-loaded/discovery/all — DPL0305/0308/0309/0311/0520/0521/0540/0541/
// 0543/0550/0560/0561/0601/0603/0616/0624/0802), which surfaced a Hack
// Squat, Biceps Curl, Seated Row, and Calf Raise the original pass missed,
// plus a genuine named Smith Machine (DPL0802) — see machineBrands.js, where
// Precor has been added to SMITH_BRANDS on the strength of this find.
add('Machine Chest Press', 'Precor', 'Discovery Series Chest Press');
add('Leg Press', 'Precor', 'Discovery Series Leg Press');
add('Leg Extension', 'Precor', 'Discovery Series Leg Extension');
add('Seated Leg Curl', 'Precor', 'Discovery Series Seated Leg Curl');
add('Lying Leg Curl', 'Precor', 'Discovery Series Leg Curl');
add('Lat Pulldown (Wide Grip)', 'Precor', 'Discovery Series Lat Pulldown');
add('Machine Shoulder Press', 'Precor', 'Discovery Series Shoulder Press');
add('Reverse Pec Deck', 'Precor', 'Discovery Series Rear Delt/Pec Fly');
add('Pec Deck / Machine Fly', 'Precor', 'Discovery Series Rear Delt/Pec Fly');
add('Hack Squat (Machine)', 'Precor', 'Discovery Series Hack Squat');
add('Machine Curl', 'Precor', 'Discovery Series Biceps Curl');
add('Machine Row (Seated)', 'Precor', 'Discovery Series Seated Row');
add('Standing Calf Raise (Machine)', 'Precor', 'Discovery Series Calf Raise');

// Panatta — re-checked against the Freeweight One compact line
// (panattasport.com/en/freeweight-one/), which added a Rowing Machine, Seated
// Calf, and Hack Squat beyond the original sample. Freeweight One's
// "Standing Hip Thrust" is a real product but is a standing/kneeling
// glute-extension unit, not the seated/loaded pattern exerciseDb.js's "Hip
// Thrust (Machine)" describes — judged too different a movement to count as
// a match, same reasoning as this file's existing Keiser A300 Squat
// exclusion.
add('Machine Chest Press', 'Panatta', 'Vertical Chest Press');
add('Leg Press', 'Panatta', 'Super Horizontal Leg Press Dual System');
add('Lat Pulldown (Wide Grip)', 'Panatta', 'Freeweight One Lat Pulldown Circular');
add('Close-Grip Lat Pulldown', 'Panatta', 'Freeweight One Lat Pulldown Circular');
add('Machine Row (Seated)', 'Panatta', 'Freeweight One Rowing Machine');
add('Seated Calf Raise', 'Panatta', 'Freeweight One Seated Calf');
add('Hack Squat (Machine)', 'Panatta', 'Freeweight One Hack Squat');

// Nautilus — One Series. Re-checked against the full One Selectorized Series
// listing (ardentfitness.com/nautilus-one-series), which confirmed a Seated
// Leg Curl and a "Low Back" (back-extension) machine beyond the original
// sample. The One Series has no standalone glute or calf machine — this is
// a confirmed absence, not an under-researched gap.
add('Leg Extension', 'Nautilus', 'One Series Leg Extension');
add('Lat Pulldown (Wide Grip)', 'Nautilus', 'One Series Lat Pulldown');
add('Machine Row (Seated)', 'Nautilus', 'One Series Row');
add('Machine Chest Press', 'Nautilus', 'One Series Chest Press');
add('Machine Shoulder Press', 'Nautilus', 'One Series Shoulder Press');
add('Machine Curl', 'Nautilus', 'One Series Biceps Curl');
add('Leg Press', 'Nautilus', 'One Series Leg Press');
add('Adductor Machine', 'Nautilus', 'One Series Hip Abduction/Adduction');
add('Abductor Machine', 'Nautilus', 'One Series Hip Abduction/Adduction');
add('Seated Leg Curl', 'Nautilus', 'One Series Seated Leg Curl');
add('Reverse Hyperextension', 'Nautilus', 'One Series Low Back');

// Star Trac — Instinct Series (Leg Press is on the Impact Strength line — see
// header). Re-checked against the fuller Instinct lineup (Rotary Torso,
// Triceps Extension, Multi Press, Smith Machine, DAP Functional Trainer) —
// Rotary Torso and Triceps Extension have no matching exerciseDb.js
// exercise, so the machine-section entries are unchanged from the original
// pass. The Instinct Smith Machine is a real, distinctly-named product,
// though — see machineBrands.js, where Star Trac has been added to
// SMITH_BRANDS on the strength of this find.
add('Machine Chest Press', 'Star Trac', 'Instinct Chest Press');
add('Machine Curl', 'Star Trac', 'Instinct Bicep Curl');
add('Leg Extension', 'Star Trac', 'Instinct Leg Extension');
add('Lying Leg Curl', 'Star Trac', 'Instinct Leg Curl');
add('Lat Pulldown (Wide Grip)', 'Star Trac', 'Instinct Lateral Pulldown');
add('Machine Row (Seated)', 'Star Trac', 'Instinct Vertical Row');
add('Machine Shoulder Press', 'Star Trac', 'Instinct Shoulder Press');
add('Leg Press', 'Star Trac', 'Impact Strength Leg Press');
add('Hip Thrust (Machine)', 'Star Trac', 'Instinct Glute Press');

// Atlantis Strength — Precision Series. Re-checked against the fuller
// Precision Series catalog (showmeweights.com/atlantisstrength.com listings),
// which added a Kneeling Leg Curl, a dedicated Seated Leg Curl (C-108), a
// combo Leg Extension, and a Standing Lateral Raise. The Precision Series'
// plate-loaded leg press remains a known gap (see header) — this pass still
// could not re-confirm its exact printed model name.
add('Machine Chest Press', 'Atlantis Strength', 'Precision Series Plate-Loaded Incline Converging Chest Press');
add('Lying Leg Curl', 'Atlantis Strength', 'Precision Series Kneeling Leg Curl');
add('Seated Leg Curl', 'Atlantis Strength', 'Precision Series C-108 Seated Leg Curl');
add('Leg Extension', 'Atlantis Strength', 'Precision Series Leg Extension');
add('Lateral Raise (Machine)', 'Atlantis Strength', 'Precision Series Standing Lateral Raise');

// Gym80 — Sygnum (selectorized) + Pure Kraft (plate-loaded). Re-checked
// against the Sygnum "Set I" listing (Abductor, Adductor, Lat Pulley, Leg
// Extension, Seated Chest Press, Seated Leg Curl, Seated Leg Press, Shoulder
// Press 2, Radial Gluteus) and Pure Kraft's individual product pages —
// substantially deeper than the original 2-entry sample.
add('Machine Chest Press', 'Gym80', 'Sygnum Dual Incline Chest Press');
add('Leg Press', 'Gym80', 'Sygnum Dual Leg Press');
add('Abductor Machine', 'Gym80', 'Sygnum Abductor');
add('Adductor Machine', 'Gym80', 'Sygnum Adductor');
add('Lat Pulldown (Wide Grip)', 'Gym80', 'Sygnum Lat Pulley');
add('Leg Extension', 'Gym80', 'Sygnum Leg Extension');
add('Seated Leg Curl', 'Gym80', 'Sygnum Seated Leg Curl');
add('Machine Shoulder Press', 'Gym80', 'Sygnum Shoulder Press 2');
add('Hip Thrust (Machine)', 'Gym80', 'Sygnum Radial Gluteus');
add('Pec Deck / Machine Fly', 'Gym80', 'Pure Kraft Butterfly 50°');
add('Reverse Pec Deck', 'Gym80', 'Pure Kraft Butterfly 50°');

// HOIST Fitness — ROC-IT (selectorized RS- + plate-loaded RPL- lines).
// Re-checked against HOIST's full model-numbered lineup — the original pass
// sampled 5 of the roughly 19 real named products; this is the deepest
// expansion of any brand in this pass besides Hammer Strength.
add('Leg Press', 'HOIST Fitness', 'ROC-IT Leg Press (RS-1403)');
add('Adductor Machine', 'HOIST Fitness', 'ROC-IT Inner Thigh Adductor (RS-1406)');
add('Abductor Machine', 'HOIST Fitness', 'ROC-IT Outer Thigh Abductor (RS-1407)');
add('Standing Calf Raise (Machine)', 'HOIST Fitness', 'ROC-IT Rotary Calf (RS-1415)');
add('Hip Thrust (Machine)', 'HOIST Fitness', 'ROC-IT Glute Master (RS-1412)');
add('Machine Curl', 'HOIST Fitness', 'ROC-IT Biceps Curl (RS-1102)');
add('Lat Pulldown (Wide Grip)', 'HOIST Fitness', 'ROC-IT Lat Pulldown (RS-1201)');
add('Machine Row (Seated)', 'HOIST Fitness', 'ROC-IT Seated Mid Row (RS-1203)');
add('Reverse Hyperextension', 'HOIST Fitness', 'ROC-IT Low Back (RS-1204)');
add('Machine Chest Press', 'HOIST Fitness', 'ROC-IT Chest Press (RS-1301)');
add('Pec Deck / Machine Fly', 'HOIST Fitness', 'ROC-IT Pec Fly (RS-1302)');
add('Reverse Pec Deck', 'HOIST Fitness', 'ROC-IT Pec Fly (RS-1302)');
add('Leg Extension', 'HOIST Fitness', 'ROC-IT Leg Extension (RS-1401)');
add('Seated Leg Curl', 'HOIST Fitness', 'ROC-IT Leg Curl (RS-1402)');
add('Lying Leg Curl', 'HOIST Fitness', 'ROC-IT Prone Leg Curl (RS-1408)');
add('Machine Shoulder Press', 'HOIST Fitness', 'ROC-IT Shoulder Press (RS-1501)');
add('Lateral Raise (Machine)', 'HOIST Fitness', 'ROC-IT Lateral Raise (RS-1502)');

// SportsArt — A-series plate-loaded. Re-checked against the full A975-A989
// model run, which added a Smith Machine (A983 — see machineBrands.js, added
// to SMITH_BRANDS) plus several exercises the original 2-entry sample
// missed. A975 Rear Kick, A977 Incline Chest Press, A978 Wide Chest Press
// (redundant with A985), and A980 Arm Extension have no matching
// exerciseDb.js exercise or would collide with an existing pair, so left out.
add('Machine Chest Press', 'SportsArt', 'A985 Chest Press');
add('Leg Press', 'SportsArt', 'A982 Angled Leg Press');
add('Leg Extension', 'SportsArt', 'A976 Leg Extension');
add('Machine Row (Seated)', 'SportsArt', 'A988 Mid Row');
add('Seated Calf Raise', 'SportsArt', 'A981 Seated Calf Raise');
add('Lat Pulldown (Wide Grip)', 'SportsArt', 'A986 Lat Pulldown');
add('Machine Shoulder Press', 'SportsArt', 'A987 Shoulder Press');
add('Hack Squat (Machine)', 'SportsArt', 'A989 Hack Squat');

// Keiser — A300/A350 (pneumatic resistance). Re-checked against Keiser's
// broader A300 lineup, which added a Military Press, Upper Back (row), Lat
// Pulldown, Leg Curl Pro, Hip Abductor, and Seated Butterfly Power beyond the
// original 2-entry sample. A300 Squat remains excluded (see header) — a
// standing pneumatic squat trainer, not a hack-squat-sled movement pattern.
add('Machine Chest Press', 'Keiser', 'A300 Chest Press Pro');
add('Leg Press', 'Keiser', 'A300 Leg Press Heavy');
add('Machine Shoulder Press', 'Keiser', 'A300 Military Press');
add('Machine Row (Seated)', 'Keiser', 'A300 Upper Back');
add('Lat Pulldown (Wide Grip)', 'Keiser', 'A300 Lat Pulldown');
add('Lying Leg Curl', 'Keiser', 'A300 Leg Curl Pro');
add('Abductor Machine', 'Keiser', 'A300 Hip Abductor');
add('Pec Deck / Machine Fly', 'Keiser', 'A350 Seated Butterfly Power');
add('Reverse Pec Deck', 'Keiser', 'A350 Seated Butterfly Power');

// Body-Solid — Pro Clubline (Leverage + Series II). Re-checked against the
// full Pro Clubline listing (bodysolid.com/home/machines/proclub_line),
// which added several distinctly-named products beyond the original 2 combo
// machines, plus a genuine named Smith Machine — see machineBrands.js, where
// Body-Solid has been added to SMITH_BRANDS on the strength of this find.
add('Leg Press', 'Body-Solid', 'GLPH1100 Leg Press & Hack Squat');
add('Hack Squat (Machine)', 'Body-Solid', 'GLPH1100 Leg Press & Hack Squat');
add('Leg Extension', 'Body-Solid', 'Pro Select GCEC-STK Leg Extension/Curl');
add('Lying Leg Curl', 'Body-Solid', 'Pro Select GCEC-STK Leg Extension/Curl');
add('Lat Pulldown (Wide Grip)', 'Body-Solid', 'Pro Clubline Leverage Lat Pulldown');
add('Machine Row (Seated)', 'Body-Solid', 'Pro Clubline Leverage Seated Row');
add('Machine Shoulder Press', 'Body-Solid', 'Pro Clubline Leverage Shoulder Press');
add('Machine Chest Press', 'Body-Solid', 'Pro Clubline Series II Chest Press');
add('Machine Curl', 'Body-Solid', 'Pro Clubline Series II Arm Curl');
add('Pec Deck / Machine Fly', 'Body-Solid', 'Pro Clubline Series II Pec Fly Rear Delt');
add('Reverse Pec Deck', 'Body-Solid', 'Pro Clubline Series II Pec Fly Rear Delt');
add('Seated Leg Curl', 'Body-Solid', 'Pro Clubline Series II Seated Leg Curl');
add('Calf Raise on Leg Press', 'Body-Solid', 'Pro Clubline Series II Leg Press & Calf Raise');

// BodyCraft — re-checked against BodyCraft's product-manual index
// (bodycraft.com/product-manuals), which added a lat/row machine and a
// combo leg extension/curl unit beyond the original 2 combo-machine sample.
add('Leg Press', 'BodyCraft', 'F760 Pro Linear Bearing Leg Press/Hack Squat');
add('Hack Squat (Machine)', 'BodyCraft', 'F760 Pro Linear Bearing Leg Press/Hack Squat');
add('Calf Raise on Leg Press', 'BodyCraft', 'EXP Series Seated Leg Press/Calf Raise');
add('Lat Pulldown (Wide Grip)', 'BodyCraft', 'F620 Back and Arm Lat Machine');
add('Leg Extension', 'BodyCraft', 'F640 Total Leg Machine');
add('Lying Leg Curl', 'BodyCraft', 'F640 Total Leg Machine');

// Promaxima — Raptor line. Re-checked against Raptor's fuller single-station
// listing (totalbodyexperts.com, powersystems.com, ironcompany.com), which
// added a chest press, pulldown, row, curl, shoulder press, and seated leg
// curl beyond the original 2-entry sample.
add('Leg Press', 'Promaxima', 'Raptor Seated Leg Press (P-5000)');
add('Pec Deck / Machine Fly', 'Promaxima', 'Raptor Chest-Fly Machine (P-1500)');
add('Reverse Pec Deck', 'Promaxima', 'Raptor Chest-Fly Machine (P-1500)');
add('Machine Chest Press', 'Promaxima', 'Raptor Horizontal Bench Press');
add('Lat Pulldown (Wide Grip)', 'Promaxima', 'Raptor Hi Lat Pull (P-4100)');
add('Machine Row (Seated)', 'Promaxima', 'Raptor Chest Supported Seated Row');
add('Machine Curl', 'Promaxima', 'Raptor Bicep Curl (P-3000)');
add('Machine Shoulder Press', 'Promaxima', 'Raptor Shoulder Press (P-2000)');
add('Seated Leg Curl', 'Promaxima', 'Raptor Seated Leg Curl');

// TKO — Signature series. Re-checked against TKO's fuller Signature model
// range (strengthwarehouseusa.com/collections/tko-strength-signature-series),
// which added many distinctly-named products beyond the original 2-entry
// sample. Jungle Gym multi-stations, Rotary Torso, Tricep Machine, and
// Weight Assisted Chin/Dip have no matching exerciseDb.js exercise, so left
// out; Glute Kickback is a machine product, not the cable-based movement
// exerciseDb.js's "Cable Glute Kickback" describes, so also left out.
add('Machine Chest Press', 'TKO', 'Signature Chest Press (700CP)');
add('Leg Press', 'TKO', 'Signature Linear Leg Press (712LP)');
add('Hip Thrust (Machine)', 'TKO', 'Signature Hip Thrust');
add('Adductor Machine', 'TKO', 'Signature Inner/Outer Thigh');
add('Abductor Machine', 'TKO', 'Signature Inner/Outer Thigh');
add('Lat Pulldown (Wide Grip)', 'TKO', 'Signature Diverging Lat Pulldown (7006-G2)');
add('Lateral Raise (Machine)', 'TKO', 'Signature Lateral Raise');
add('Reverse Hyperextension', 'TKO', 'Signature Low Back Extension');
add('Pec Deck / Machine Fly', 'TKO', 'Signature Pec Deck');
add('Reverse Pec Deck', 'TKO', 'Signature Pec Deck');
add('Machine Row (Seated)', 'TKO', 'Signature Seated Row Machine');
add('Machine Shoulder Press', 'TKO', 'Signature Shoulder Press Machine');
add('Leg Extension', 'TKO', 'Signature Leg Extension Machine');
add('Lying Leg Curl', 'TKO', 'Signature Leg Curl Machine');

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

// Precor, Star Trac, SportsArt, and Body-Solid were added to this map (and
// to SMITH_BRANDS in machineBrands.js) during the deeper re-pass — each has
// a genuinely confirmed, distinctly-named Smith machine product that the
// original shallow pass missed (Precor Discovery Series DPL0802, Star Trac
// Instinct Smith Machine, SportsArt A983, Body-Solid Pro Clubline
// Counter-Balanced Smith Machine).
const SMITH_BRAND_MODELS = {
  'Matrix Fitness': 'Versa Smith Machine',
  'Panatta': 'Smith Machine Selectorized',
  'Watson Gym Equipment': 'Counter-Balanced Plate-Loaded Smith Machine',
  'Primal Strength': 'Primal Performance Series Olympic 5 Degree Smith Machine',
  'BLK BOX': 'BLK BOX Smith Machine',
  'Major Fitness': 'Spirit B52 Smith Machine',
  'RitFit': 'M1 PRO Smith Machine',
  'MAXUM Fitness': 'MAXUM SX2 Smith Machine',
  'Hammer Strength': 'Hammer Strength Smith Machine',
  'Precor': 'Discovery Series Smith Machine',
  'Star Trac': 'Instinct Smith Machine',
  'SportsArt': 'A983 Smith Machine',
  'Body-Solid': 'Pro Clubline Counter-Balanced Smith Machine',
};

for (const [brand, model] of Object.entries(SMITH_BRAND_MODELS)) {
  for (const exerciseName of SMITH_EXERCISE_NAMES) {
    add(exerciseName, brand, model);
  }
}

// ---------------------------------------------------------------------------
// Movement-family reuse — NOT additional research, a mechanical consequence
// of the exerciseDb.js taxonomy: some exercises share a movementId with an
// already-researched sibling because they're performed on the exact same
// physical machine, just a different grip/attachment/limb (e.g. every Lat
// Pulldown grip variant is the same seated pulldown station with a different
// handle; Single-Leg Press is the same leg-press sled used one leg at a time
// — the latter equivalence already established in this codebase's own
// limbOptions.js COLLAPSE_MAPPING). Applying the sibling's real product name
// here is correct, not a guess — the physical machine, and therefore its
// brand and model name, genuinely is the same one.
//
// Explicitly NOT extended to Standing Leg Curl (Machine) — despite sharing
// leg-curl's movementId with Lying/Seated Leg Curl, a standing single-leg
// curl unit is typically a physically distinct product in real gyms, not an
// attachment swap on the same machine — nor to Reverse Hyperextension,
// Glute-Ham Raise, Roman Chair Sit-Up, or GHD Sit-Up, which are each their
// own distinct piece of equipment with no already-researched sibling to
// reuse from. These remain genuine, uninvestigated gaps.
// ---------------------------------------------------------------------------
function reuseFamily(fromExercise, toExercises) {
  const fromKey = normalize(fromExercise);
  for (const [key, model] of Object.entries(MACHINE_MODELS)) {
    const [exercise, brand] = key.split('|');
    if (exercise !== fromKey) continue;
    for (const to of toExercises) add(to, brand, model);
  }
}

reuseFamily('Lat Pulldown (Wide Grip)', ['Lat Pulldown (Neutral Grip)', 'Lat Pulldown (Reverse / Underhand)']);
reuseFamily('Close-Grip Lat Pulldown', ['Lat Pulldown (Neutral Grip)', 'Lat Pulldown (Reverse / Underhand)']);
reuseFamily('Behind-Neck Lat Pulldown', ['Lat Pulldown (Neutral Grip)', 'Lat Pulldown (Reverse / Underhand)']);
reuseFamily('Leg Press', ['Single-Leg Press']);

module.exports = { MACHINE_MODELS };
