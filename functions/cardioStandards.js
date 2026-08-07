// Cardio Score -- VO2max's equivalent of computeMuscleLevels's per-muscle
// strength ranking (functions/strengthStandards.js). Reuses that ranking's
// actual scoring machinery rather than reimplementing it: scoreForRatio/
// TIER_BANDS give the Beginner->Elite tier + continuous score exactly as
// muscle ranking does, and interpolateStandards (muscleStandards.js) does
// the bracket interpolation -- muscle ranking interpolates bodyweight-
// bracketed rows, this interpolates age-bracketed rows, same generic
// function either way, nothing bodyweight-specific inside it.
const { scoreForRatio, TIER_BANDS } = require('./strengthStandards');
const { interpolateStandards } = require('./muscleStandards');

// [ageBracketStart, Beginner, Novice, Intermediate, Advanced, Elite]
// thresholds in mL/kg/min -- approximate checkpoints from widely-published
// ACSM/Cooper Institute age-graded VO2max norms (ACSM's Guidelines for
// Exercise Testing and Prescription), the same "reference methodology, not
// a scrape of any one source" sourcing strengthStandards.js's own STANDARDS
// table already uses. Ages below 20 clamp to the 20-bracket, 60+ clamps to
// the 60-bracket (interpolateStandards's existing out-of-range behavior).
const VO2MAX_STANDARDS = {
  male: [
    [20, 33, 37, 42, 46, 52],
    [30, 31, 35, 39, 44, 50],
    [40, 28, 32, 36, 41, 47],
    [50, 25, 29, 33, 37, 44],
    [60, 21, 25, 29, 33, 40],
  ],
  female: [
    [20, 28, 32, 36, 40, 45],
    [30, 27, 31, 34, 38, 43],
    [40, 25, 29, 32, 36, 40],
    [50, 21, 25, 28, 32, 36],
    [60, 18, 21, 24, 28, 32],
  ],
};

function thresholdsForAge(age, sex) {
  const table = VO2MAX_STANDARDS[sex];
  if (!table || !age) return null;
  return interpolateStandards(table, age);
}

// One score, not per-sport -- VO2max is a systemic measurement, not tied to
// which activity produced it. bandFloor/bandCeiling mirror
// computeMuscleLevels's own inline computation (strengthStandards.js) so
// the frontend can fill a progress bar toward the next named checkpoint the
// same way StrengthLevelPanel already does, without duplicating TIER_BANDS
// client-side.
function computeCardioScore(vo2max, age, sex) {
  if (!vo2max || vo2max <= 0) return null;
  const thresholds = thresholdsForAge(age, sex);
  if (!thresholds) return null;
  const { tier, score } = scoreForRatio(vo2max, thresholds);
  const bandFloor = TIER_BANDS.filter(([floor]) => floor <= score).at(-1)?.[0] ?? 0;
  const nextBand = TIER_BANDS.find(([floor]) => floor > score);
  return { vo2max, tier, score, bandFloor, bandCeiling: nextBand ? nextBand[0] : null };
}

module.exports = { VO2MAX_STANDARDS, thresholdsForAge, computeCardioScore };
