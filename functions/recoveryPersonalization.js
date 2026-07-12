// Static, per-person personalization of the recovery half-life table — a
// starting-point adjustment from who this athlete is (age, training
// experience), computed fresh from profile data each call rather than fitted
// or refit from observed outcomes. That's deliberate: the literature on
// individual variation in muscle recovery time finds it's better explained by
// known moderators (training status, age) than treated as a freely-fitted
// personal constant, and a single noisy data point (one session, one
// soreness log) isn't good evidence to refit a structural decay parameter.
// muscleSensitivity (in functions/index.js) is the other, dynamic half of
// this — it keeps nudging on top of this baseline from actual observed
// soreness/experiment outcomes. The two don't compete: this answers "where
// should this person's baseline reasonably sit," muscleSensitivity answers
// "how has this specific muscle actually behaved for them since."

const { RECOVERY_H } = require('./muscleTaxonomy');

function computeAgeYears(dob) {
  if (!dob) return null;
  return (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000);
}

// Self-reported once (trainingExperienceYears), then accrues automatically
// from the timestamp it was reported (trainingExperienceSetAt) rather than
// staying frozen at whatever number was typed in — so "3 years" answered
// today quietly becomes "4.5 years" 18 months from now without ever needing
// to be re-asked. Correcting the number in Settings resets the clock.
function trainingExperienceMonths(profile) {
  if (profile?.trainingExperienceYears == null) return 0;
  const setAt = profile.trainingExperienceSetAt ? new Date(profile.trainingExperienceSetAt).getTime() : Date.now();
  const monthsSinceSet = Math.max(0, (Date.now() - setAt) / (30.44 * 24 * 3600 * 1000));
  return profile.trainingExperienceYears * 12 + monthsSinceSet;
}

// For the new-lifter set-count budget specifically (unlike the recovery
// half-life above, which safely defaults unknowns to "assume novice"):
// missing data should skip the cap entirely rather than silently capping an
// established lifter's working sets to 1-2 just because they never filled
// in the field. An explicit "0 years" still counts as known data.
function trainingMonthsIfKnown(profile) {
  return profile?.trainingExperienceYears != null ? trainingExperienceMonths(profile) : null;
}

// Repeated-bout effect: trained lifters recover faster from familiar stimuli
// than novices do at the same relative intensity.
function trainingExperienceFactor(months) {
  if (months < 3) return 1.3;
  if (months < 12) return 1.1;
  if (months < 36) return 1.0;
  return 0.85;
}

// Recovery slows with age — persistently elevated inflammatory markers in
// older adults are well documented.
function ageFactor(ageYears) {
  if (ageYears == null) return 1.0;
  if (ageYears < 30) return 0.9;
  if (ageYears < 45) return 1.0;
  if (ageYears < 60) return 1.15;
  return 1.3;
}

// Clamped to 24-120h so the two factors can't compound into something absurd
// for, say, a 65-year-old brand-new lifter.
function personalizedRecoveryHours(profile) {
  const factor = trainingExperienceFactor(trainingExperienceMonths(profile)) * ageFactor(computeAgeYears(profile?.dob));
  const out = {};
  for (const [m, base] of Object.entries(RECOVERY_H)) out[m] = Math.max(24, Math.min(120, Math.round(base * factor)));
  return out;
}

module.exports = {
  computeAgeYears, trainingExperienceMonths, trainingMonthsIfKnown,
  trainingExperienceFactor, ageFactor, personalizedRecoveryHours,
};
