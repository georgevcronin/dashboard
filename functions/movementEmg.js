// EMG activation data for every movement pattern beyond press/row (see
// functions/emgActivation.js for those) — squat/hinge, elbow flexion/
// extension, hip ab/adduction/flexion, knee flexion, core, calf raise,
// wrist curl, neck, rotator cuff. Same estimate/interpolation caveats as
// emgActivation.js: % of each muscle's own MVIC, directional patterns from
// published literature, not raw continuous study data.
//
// IMPORTANT taxonomy note: this app's real muscle taxonomy (functions/
// muscleTaxonomy.js's ALL_MUSCLES, 31 entries, itself derived from
// exerciseDb.js) has no separate entries for individual muscle HEADS the
// source literature tracks distinctly -- no vastus/rectus-femoris split
// (both are just `quads`), no gastrocnemius/soleus split (both `calves`),
// no biceps long/short head split (`biceps`), no wrist-flexor-group muscle
// at all (`forearms` is the only close taxonomy match), no neck muscle at
// all. Every table below is collapsed onto this app's REAL, existing 31
// muscles by averaging same-taxonomy-bucket heads together -- never by
// inventing a new muscle key. Where a column has no taxonomy home at all
// (tibialis posterior, neck muscles besides traps, wrist flexor/extensor
// group names), it's noted and dropped rather than misattributed to the
// nearest-sounding real muscle.

// ---------- Section 8: elbow flexion/extension (curl/pushdown pattern) ----------
// 0deg = elbow straight, 180deg = fully flexed. Baseline assumes a fixed,
// neutral shoulder position -- see ELBOW_SHOULDER_MODIFIER below, which
// this module deliberately does NOT fold into ELBOW_EMG (see its own
// comment for why).
const ELBOW_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
const ELBOW_EMG = {
  0:   { triceps: 25.67, biceps: 20 },
  15:  { triceps: 35.67, biceps: 30 },
  30:  { triceps: 50.67, biceps: 45 },
  45:  { triceps: 65.33, biceps: 59.5 },
  60:  { triceps: 78.33, biceps: 74.5 },
  75:  { triceps: 88.33, biceps: 88 },
  90:  { triceps: 94.33, biceps: 95.5 },
  105: { triceps: 98,    biceps: 99.5 },
  120: { triceps: 96.33, biceps: 93 },
  135: { triceps: 88,    biceps: 79 },
  150: { triceps: 73.33, biceps: 62 },
  165: { triceps: 53.33, biceps: 42.5 },
  180: { triceps: 30.67, biceps: 23 },
};

// Shoulder-position modifier for the biarticular heads (triceps long head,
// biceps long/short head) -- kept as reference data, NOT applied to
// ELBOW_EMG's curated profiles. Two reasons: (1) biceps long-head favors
// extended shoulder while short-head favors flexed shoulder in almost
// exactly opposite directions, so once collapsed into one `biceps` value
// the two nearly cancel out (net effect ~1 point); (2) a "fixed default
// per exercise" curated profile has no live shoulder-angle input to modify
// with anyway -- this only matters for the fraction of triceps that's the
// long head, further damped by averaging with the two heads that don't
// move at all. Not worth the complexity for what it would change.
const ELBOW_SHOULDER_MODIFIER = {
  0:   { 'triceps-long': -8,  'biceps-long': 10, 'biceps-short': -8 },
  45:  { 'triceps-long': -4,  'biceps-long': 5,  'biceps-short': -4 },
  90:  { 'triceps-long': 0,   'biceps-long': 0,  'biceps-short': 0 },
  135: { 'triceps-long': 6,   'biceps-long': -6, 'biceps-short': 5 },
  180: { 'triceps-long': 12,  'biceps-long': -12, 'biceps-short': 10 },
};
const ELBOW_SHOULDER_MODIFIER_ANGLES = [0, 45, 90, 135, 180];

// Wires the modifier above into a real per-exercise calculation, per
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §20/§21's Curl/
// Extension "Sagittal Angle" parameter -- shoulder position relative to the
// torso, a genuinely different axis from `elbowAngle` above (elbow flexion,
// which happens every rep regardless of shoulder position). The doc's
// scale is signed -90 (max shoulder extension, e.g. Decline Curl) to +90
// (max shoulder flexion, e.g. Overhead Cable Curl), 0 = neutral/standing --
// converted to this modifier's own raw 0/45/90/135/180 keys via
// raw = signed + 90, exactly as §20 specifies.
//
// Of the two reasons the comment above gives for leaving this dormant,
// only reason (1) still governs how it's applied now that a real per-
// exercise angle exists (reason 2, "no live shoulder-angle input to modify
// with," no longer holds): this taxonomy has no separate long/short-head
// keys, only single collapsed `biceps`/`triceps` muscles, so each raw
// per-head delta is folded into its real taxonomy muscle, damped by how
// much of that whole muscle the shifting head actually represents --
// - biceps has exactly two heads (long, short) that shift in opposite
//   directions -- the collapsed delta is their average, which is why the
//   comment above calls the net effect on `biceps` "~1 point" (they nearly
//   cancel).
// - triceps has three heads; only the long head is biarticular/shoulder-
//   sensitive. The collapsed delta is the long-head shift divided by 3,
//   damped by the two heads (lateral, medial) that don't move at all.
// Snaps both inputs to their own table's nearest sampled point (same
// "snap to nearest sampled anchor" convention chestHeadSplit.js's
// nearestAngleBucket already uses) rather than requiring an exact grid
// match, so a picker offering finer steps than either table's sampling
// still resolves sensibly.
function nearestKey(keys, value) {
  return keys.reduce((best, k) => Math.abs(k - value) < Math.abs(best - value) ? k : best);
}

function elbowEmgForShoulderAngle(elbowAngle, shoulderAngle) {
  if (elbowAngle == null || Number.isNaN(+elbowAngle)) return null;
  const base = ELBOW_EMG[nearestKey(ELBOW_ANGLES, +elbowAngle)];
  const raw = shoulderAngle == null || Number.isNaN(+shoulderAngle) ? 90 : +shoulderAngle + 90;
  const mod = ELBOW_SHOULDER_MODIFIER[nearestKey(ELBOW_SHOULDER_MODIFIER_ANGLES, raw)];
  const bicepsShift = (mod['biceps-long'] + mod['biceps-short']) / 2;
  const tricepsShift = mod['triceps-long'] / 3;
  return {
    ...base,
    biceps: Math.max(0, base.biceps + bicepsShift),
    triceps: Math.max(0, base.triceps + tricepsShift),
  };
}

// ---------- Section 9: squat / leg press, by hip angle ----------
// 0deg = standing, 120deg = deep squat (realistic depth cap).
const SQUAT_HIP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120];
const SQUAT_HIP_EMG = {
  0:   { quads: 35, glutes: 8,  hamstrings: 15, adductors: 10, erectors: 25 },
  15:  { quads: 40, glutes: 15, hamstrings: 20, adductors: 16, erectors: 28 },
  30:  { quads: 46, glutes: 24, hamstrings: 27, adductors: 24, erectors: 32 },
  45:  { quads: 52, glutes: 34, hamstrings: 34, adductors: 33, erectors: 36 },
  60:  { quads: 58, glutes: 45, hamstrings: 42, adductors: 43, erectors: 40 },
  75:  { quads: 64, glutes: 55, hamstrings: 50, adductors: 53, erectors: 44 },
  90:  { quads: 70, glutes: 65, hamstrings: 57, adductors: 62, erectors: 48 },
  105: { quads: 75, glutes: 78, hamstrings: 63, adductors: 72, erectors: 52 },
  120: { quads: 80, glutes: 90, hamstrings: 68, adductors: 80, erectors: 55 },
};

// ---------- Section 10: deadlift / hip hinge, by hip angle ----------
// 0deg = lockout, 90deg = bottom. hamstrings = avg(biceps femoris, semitendinosus).
const HINGE_HIP_ANGLES = [0, 15, 30, 45, 60, 75, 90];
const HINGE_HIP_EMG = {
  0:  { quads: 10, glutes: 15, hamstrings: 14.5, erectors: 65 },
  15: { quads: 24, glutes: 35, hamstrings: 34.5, erectors: 72 },
  30: { quads: 38, glutes: 52, hamstrings: 51,   erectors: 75 },
  45: { quads: 52, glutes: 68, hamstrings: 65.5, erectors: 78 },
  60: { quads: 65, glutes: 80, hamstrings: 77.5, erectors: 80 },
  75: { quads: 75, glutes: 90, hamstrings: 86.5, erectors: 83 },
  90: { quads: 80, glutes: 95, hamstrings: 90,   erectors: 85 },
};

// ---------- Section 11: hip abduction (frontal plane) ----------
// 0deg = leg at side, 90deg = raised to horizontal. abductors = avg(glute
// medius, glute minimus, TFL) -- all three are genuinely the taxonomy's
// `abductors` bucket. Adductor longus is the ANTAGONIST here (being
// stretched, not contributing) -- deliberately excluded, not averaged in.
const HIP_ABDUCTION_ANGLES = [0, 15, 30, 45, 60, 75, 90];
const HIP_ABDUCTION_EMG = {
  0:  { abductors: 11 },
  15: { abductors: 24.33 },
  30: { abductors: 39 },
  45: { abductors: 53.33 },
  60: { abductors: 66.67 },
  75: { abductors: 78.33 },
  90: { abductors: 87.67 },
};

// ---------- Section 12: knee flexion/extension, by knee angle ----------
// 0deg = straight, 180deg = fully flexed. quads = avg(vasti, rectus
// femoris) -- both are the taxonomy's single `quads` muscle.
const KNEE_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
const KNEE_EMG = {
  0:   { quads: 17.5, hamstrings: 20 },
  15:  { quads: 26.5, hamstrings: 30 },
  30:  { quads: 38,   hamstrings: 42 },
  45:  { quads: 50,   hamstrings: 55 },
  60:  { quads: 61.5, hamstrings: 68 },
  75:  { quads: 71.5, hamstrings: 80 },
  90:  { quads: 78.5, hamstrings: 90 },
  105: { quads: 80,   hamstrings: 96 },
  120: { quads: 79,   hamstrings: 98 },
  135: { quads: 74,   hamstrings: 90 },
  150: { quads: 66,   hamstrings: 75 },
  165: { quads: 56,   hamstrings: 55 },
  180: { quads: 45,   hamstrings: 35 },
};

// ---------- Section 13: core anti-extension (plank / ab-wheel spectrum) ----------
// Lever length 0-100% (isometric/near-isometric, not a joint angle).
// obliques = avg(external, internal oblique).
const CORE_ANTIEXT_LEVERS = [0, 15, 30, 45, 60, 75, 90, 100];
const CORE_ANTIEXT_EMG = {
  0:   { abs: 30, obliques: 31.5, 'transverse-abs': 45, erectors: 12, lats: 15 },
  15:  { abs: 38, obliques: 38.5, 'transverse-abs': 52, erectors: 15, lats: 20 },
  30:  { abs: 47, obliques: 46.5, 'transverse-abs': 58, erectors: 18, lats: 27 },
  45:  { abs: 56, obliques: 55,   'transverse-abs': 65, erectors: 22, lats: 35 },
  60:  { abs: 66, obliques: 63.5, 'transverse-abs': 73, erectors: 27, lats: 44 },
  75:  { abs: 76, obliques: 72.5, 'transverse-abs': 82, erectors: 34, lats: 53 },
  90:  { abs: 87, obliques: 82.5, 'transverse-abs': 91, erectors: 41, lats: 62 },
  100: { abs: 95, obliques: 90,   'transverse-abs': 98, erectors: 48, lats: 70 },
};

// ---------- Section 14: core anti-rotation (Pallof press spectrum) ----------
// Lever length 0-100%. abductors here = glute medius (stance leg) -- a
// genuine contributor stabilizing the pelvis, unlike section 11's antagonist.
const CORE_ANTIROT_LEVERS = [0, 20, 40, 60, 80, 100];
const CORE_ANTIROT_EMG = {
  0:   { obliques: 27.5, abs: 20, 'transverse-abs': 40, abductors: 15 },
  20:  { obliques: 37.5, abs: 28, 'transverse-abs': 50, abductors: 22 },
  40:  { obliques: 50,   abs: 38, 'transverse-abs': 62, abductors: 32 },
  60:  { obliques: 63.5, abs: 50, 'transverse-abs': 74, abductors: 44 },
  80:  { obliques: 79,   abs: 63, 'transverse-abs': 86, abductors: 58 },
  100: { obliques: 92.5, abs: 75, 'transverse-abs': 96, abductors: 70 },
};

// ---------- Section 15: hip adduction ----------
// 0deg = stretched/abducted start, 90deg = fully adducted. All five source
// columns (longus/brevis/magnus/gracilis/pectineus) collapse to the
// taxonomy's single `adductors` muscle.
const HIP_ADDUCTION_ANGLES = [0, 15, 30, 45, 60, 75, 90];
const HIP_ADDUCTION_EMG = {
  0:  { adductors: 40 },
  15: { adductors: 48 },
  30: { adductors: 56.6 },
  45: { adductors: 64.4 },
  60: { adductors: 72.8 },
  75: { adductors: 81.2 },
  90: { adductors: 87.8 },
};

// ---------- Section 16: hip flexion (straight leg raise / iliopsoas pattern) ----------
// 0deg = leg down, 90deg = leg vertical. hip-flexors = avg(iliopsoas, TFL,
// sartorius) -- the taxonomy's collective hip-flexor bucket. Rectus femoris
// (a genuine quad muscle despite crossing the hip too) credits `quads`
// directly; adductor longus's synergist role here credits `adductors`.
const HIP_FLEXION_ANGLES = [0, 15, 30, 45, 60, 75, 90];
const HIP_FLEXION_EMG = {
  0:  { 'hip-flexors': 11.33, quads: 15, adductors: 8 },
  15: { 'hip-flexors': 25,    quads: 30, adductors: 18 },
  30: { 'hip-flexors': 38.33, quads: 42, adductors: 28 },
  45: { 'hip-flexors': 49,    quads: 52, adductors: 36 },
  60: { 'hip-flexors': 58.67, quads: 60, adductors: 42 },
  75: { 'hip-flexors': 66.67, quads: 65, adductors: 45 },
  90: { 'hip-flexors': 69.33, quads: 66, adductors: 44 },
};

// ---------- Section 17: calf raise (ankle plantarflexion) ----------
// 0deg = bottom (stretched), 90deg = top (contracted). calves = avg(medial
// gastroc, lateral gastroc, soleus) -- this taxonomy has no gastroc/soleus
// split. Tibialis posterior (a real synergist in the source) has no
// taxonomy home at all (`tibialis` here means tibialis ANTERIOR, the
// dorsiflexion antagonist, used elsewhere for tibialis-raise exercises) --
// dropped rather than misattributed.
const CALF_ANGLES = [0, 15, 30, 45, 60, 75, 90];
const CALF_EMG = {
  0:  { calves: 19.33 },
  15: { calves: 32.67 },
  30: { calves: 45.67 },
  45: { calves: 58.67 },
  60: { calves: 71.33 },
  75: { calves: 84 },
  90: { calves: 94 },
};
// Seated (knee-flexed) calf raises shift the collapsed `calves` value down
// -- 2/3 of the collapsed average is gastrocnemius (which drops ~35 points
// with the knee bent), 1/3 is soleus (roughly unchanged, +5) -- net a
// damped ~-22 shift, applied when curating seated calf raise exercises.
const CALF_SEATED_MODIFIER = -22;

// ---------- Section 18: wrist flexion/extension (wrist curl / reverse curl) ----------
// 0deg = start (stretched), 180deg = fully flexed/extended. This taxonomy
// has no distinct wrist-flexor/extensor muscle -- `forearms` is the only
// real match, credited from whichever direction's agonist group applies.
// Brachioradialis is a genuine taxonomy muscle and gets its own real
// synergist value directly.
const WRIST_ANGLES = [0, 30, 60, 90, 120, 150, 180];
const WRIST_CURL_EMG = { // flexion (wrist curl)
  0:   { forearms: 19,   brachioradialis: 20 },
  30:  { forearms: 36,   brachioradialis: 24 },
  60:  { forearms: 53,   brachioradialis: 28 },
  90:  { forearms: 68.5, brachioradialis: 31 },
  120: { forearms: 81.5, brachioradialis: 33 },
  150: { forearms: 91,   brachioradialis: 34 },
  180: { forearms: 95,   brachioradialis: 34 },
};
const WRIST_EXTENSION_EMG = { // reverse wrist curl
  0:   { forearms: 21,   brachioradialis: 18 },
  30:  { forearms: 37,   brachioradialis: 22 },
  60:  { forearms: 55,   brachioradialis: 25 },
  90:  { forearms: 71,   brachioradialis: 27 },
  120: { forearms: 83,   brachioradialis: 28 },
  150: { forearms: 92,   brachioradialis: 29 },
  180: { forearms: 96.5, brachioradialis: 29 },
};

// ---------- Section 19: neck flexion/extension ----------
// 0deg = full extension, 180deg = full flexion. This taxonomy has no `neck`
// muscle and no entries for SCM/scalenes/splenius/semispinalis -- only
// upper trapezius has a real home (`traps`, same muscle Barbell Shrug
// trains). Kept mostly for reference; a neck exercise can only ever credit
// `traps` from this table, everything else has nowhere to go.
const NECK_ANGLES = [0, 30, 60, 90, 120, 150, 180];
const NECK_EMG = {
  0:   { traps: 55 },
  30:  { traps: 46 },
  60:  { traps: 36 },
  90:  { traps: 28 },
  120: { traps: 22 },
  150: { traps: 18 },
  180: { traps: 15 },
};

// ---------- Section 20: rotator cuff internal/external rotation ----------
// 0deg = full internal rotation, 180deg = full external rotation.
// rotator-cuff = avg(infraspinatus, teres minor, subscapularis) -- this
// taxonomy has one collective rotator-cuff muscle, not four separate ones.
// Posterior delt -> rear-delt directly; the anterior-delt/pec IR synergist
// column -> front-delt directly (chest secondary role omitted for
// simplicity, matching the source's own "synergist" framing).
const ROTATOR_CUFF_ANGLES = [0, 30, 60, 90, 120, 150, 180];
const ROTATOR_CUFF_EMG = {
  0:   { 'rotator-cuff': 39,    'rear-delt': 10, 'front-delt': 65 },
  30:  { 'rotator-cuff': 41.67, 'rear-delt': 18, 'front-delt': 55 },
  60:  { 'rotator-cuff': 45.33, 'rear-delt': 30, 'front-delt': 42 },
  90:  { 'rotator-cuff': 50,    'rear-delt': 44, 'front-delt': 30 },
  120: { 'rotator-cuff': 55.67, 'rear-delt': 58, 'front-delt': 20 },
  150: { 'rotator-cuff': 60,    'rear-delt': 70, 'front-delt': 13 },
  180: { 'rotator-cuff': 62.33, 'rear-delt': 80, 'front-delt': 8 },
};
// Shoulder-elevation modifier: cuff isolation work (e.g. side-lying
// external rotation) is most effective for infraspinatus/teres-minor with
// the arm AT THE SIDE -- both drop meaningfully as the arm is raised.
// Reference data only, not applied to curated profiles (same reasoning as
// the elbow shoulder modifier -- no live elevation input for a fixed
// per-exercise default).
const ROTATOR_CUFF_ELEVATION_MODIFIER = {
  0:  { infraspinatus: 0, 'teres-minor': 0 },
  45: { infraspinatus: -10, 'teres-minor': -6 },
  90: { infraspinatus: -22, 'teres-minor': -14 },
};

// ---------- Section 21: shrugs (scapular elevation, + bar-path modifier) ----------
// 0% = bottom (scapula depressed, traps stretched), 100% = top ("ears to
// shoulders," scapula fully elevated). A pure scapular-elevation movement,
// distinct from every row/pulldown table above (those are glenohumeral
// pull-direction axes; this is scapulothoracic elevation, a different joint
// action entirely -- exactly the gap that left shrugs uncurated through the
// earlier phases). Levator scapulae is the movement's real #2 mover per the
// source (tracks closely behind upper trapezius throughout) but has no
// taxonomy home in this app (not a sub-head of any of the 31 tracked
// muscles) -- dropped rather than merged into `traps`, same rule as every
// other untracked source muscle in this file.
const SHRUG_ELEVATION_LEVELS = [0, 15, 30, 45, 60, 75, 90, 100];
const SHRUG_ELEVATION_EMG = {
  0:   { traps: 15, 'mid-traps': 10, rhomboids: 8,  forearms: 40 },
  15:  { traps: 30, 'mid-traps': 15, rhomboids: 12, forearms: 45 },
  30:  { traps: 48, 'mid-traps': 20, rhomboids: 16, forearms: 50 },
  45:  { traps: 64, 'mid-traps': 26, rhomboids: 20, forearms: 55 },
  60:  { traps: 78, 'mid-traps': 32, rhomboids: 25, forearms: 60 },
  75:  { traps: 90, 'mid-traps': 38, rhomboids: 30, forearms: 65 },
  90:  { traps: 98, 'mid-traps': 42, rhomboids: 33, forearms: 68 },
  100: { traps: 100, 'mid-traps': 45, rhomboids: 35, forearms: 70 },
};
// Bar-path modifier (add to Table A's values): pulling the bar back and up
// instead of straight up shifts emphasis from the pure elevators (traps,
// levator scapulae) toward the retractors (mid-traps, rhomboids). Reference
// data only -- directional estimates per the source, not measured deltas --
// but kept here since a future behind-the-back-style shrug variant would be
// a real, legitimate use of it, unlike the elbow/rotator-cuff modifiers
// above which had no live per-exercise input to apply against.
const SHRUG_BAR_PATH_MODIFIER = {
  vertical:  { traps: 0,   'mid-traps': 0,   rhomboids: 0 },
  retraction: { traps: -5,  'mid-traps': 15,  rhomboids: 12 },
  behindBack: { traps: -10, 'mid-traps': 25,  rhomboids: 20 },
};

function tableForAngle(table, angle) {
  return table[angle] || null;
}

module.exports = {
  ELBOW_ANGLES, ELBOW_EMG, ELBOW_SHOULDER_MODIFIER, ELBOW_SHOULDER_MODIFIER_ANGLES,
  elbowEmgForShoulderAngle,
  SQUAT_HIP_ANGLES, SQUAT_HIP_EMG,
  HINGE_HIP_ANGLES, HINGE_HIP_EMG,
  HIP_ABDUCTION_ANGLES, HIP_ABDUCTION_EMG,
  KNEE_ANGLES, KNEE_EMG,
  CORE_ANTIEXT_LEVERS, CORE_ANTIEXT_EMG,
  CORE_ANTIROT_LEVERS, CORE_ANTIROT_EMG,
  HIP_ADDUCTION_ANGLES, HIP_ADDUCTION_EMG,
  HIP_FLEXION_ANGLES, HIP_FLEXION_EMG,
  CALF_ANGLES, CALF_EMG, CALF_SEATED_MODIFIER,
  WRIST_ANGLES, WRIST_CURL_EMG, WRIST_EXTENSION_EMG,
  NECK_ANGLES, NECK_EMG,
  ROTATOR_CUFF_ANGLES, ROTATOR_CUFF_EMG, ROTATOR_CUFF_ELEVATION_MODIFIER,
  SHRUG_ELEVATION_LEVELS, SHRUG_ELEVATION_EMG, SHRUG_BAR_PATH_MODIFIER,
  tableForAngle,
};
