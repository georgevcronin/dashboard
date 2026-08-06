// Deficit safety limits for the Lose Fat / 'cut' diet goal. George asked for
// a hard 30%-below-maintenance ceiling and a 20% warning threshold on how
// aggressive an automatically-calculated fat-loss calorie target is allowed
// to be. "Maintenance" here is a real per-person TDEE estimate (Mifflin-St
// Jeor BMR x an activity multiplier from training frequency), not the flat
// bodyweight x26 proxy /macro-auto uses for its own 'recomp' calculation --
// that flat proxy keeps 'cut' pinned to exactly a 15.4% deficit for every
// user regardless of how active they actually are, so a limit checked
// against it could never fire. A genuinely active person's real maintenance
// sits well above bodyweight x26, which is exactly the case this guards.

const HARD_LIMIT_DEFICIT_PCT = 30;
const WARNING_DEFICIT_PCT = 20;

// Mifflin-St Jeor. Sex is optional on the profile (asked but never
// required) -- averaging the male/female offset (+5 / -161, midpoint -78)
// for an unspecified sex is a neutral estimate, not a guess dressed up as a
// measurement; every caller treats the result as an estimate, never a fact.
function estimateBMR({ sex, weightKg, heightCm, age } = {}) {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0)) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'male') return base + 5;
  if (sex === 'female') return base - 161;
  return base - 78; // midpoint of the two sex offsets
}

// Standard activity-multiplier bands, keyed off the same
// trainingDaysPerWeek the rest of the app already collects (Onboarding's
// Daily Targets step / Settings) rather than introducing a separate
// "activity level" question just for this.
function activityMultiplierFor(trainingDaysPerWeek) {
  const d = trainingDaysPerWeek ?? 4;
  if (d <= 1) return 1.2;   // sedentary
  if (d <= 3) return 1.375; // light
  if (d <= 5) return 1.55;  // moderate
  return 1.725;             // very active (6-7 days)
}

// Real per-person maintenance estimate. Returns null (rather than a
// fabricated number) when there isn't enough profile data yet to compute a
// BMR -- callers fall back to the existing flat bodyweight-based proxy.
function estimateMaintenanceCalories({ sex, weightKg, heightCm, age, trainingDaysPerWeek } = {}) {
  const bmr = estimateBMR({ sex, weightKg, heightCm, age });
  if (bmr == null) return null;
  return Math.round(bmr * activityMultiplierFor(trainingDaysPerWeek));
}

// Checks a proposed fat-loss calorie target against real maintenance.
// 'hard-limit' clamps to exactly a 30% deficit -- there's no deficit dial
// handed back to the athlete to adjust in the auto-calculated Lose Fat
// flow, so the safe move is capping the number rather than leaving no
// target set at all. 'warning' passes the number through unchanged but
// flags it so the caller can surface a message.
function applyDeficitLimit(calories, maintenanceCalories) {
  if (!(maintenanceCalories > 0) || !(calories >= 0)) {
    return { calories, status: 'ok', deficitPct: null, message: null };
  }
  const deficitPct = Math.round(((maintenanceCalories - calories) / maintenanceCalories) * 1000) / 10;
  if (deficitPct > HARD_LIMIT_DEFICIT_PCT) {
    const clamped = Math.round(maintenanceCalories * (1 - HARD_LIMIT_DEFICIT_PCT / 100));
    return {
      calories: clamped,
      status: 'hard-limit',
      deficitPct,
      message: `A ${deficitPct}% deficit isn't attainable — capped at the hard limit of ${HARD_LIMIT_DEFICIT_PCT}% below your estimated ${maintenanceCalories}kcal maintenance (${clamped}kcal).`,
    };
  }
  if (deficitPct > WARNING_DEFICIT_PCT) {
    return {
      calories,
      status: 'warning',
      deficitPct,
      message: `This is a ${deficitPct}% deficit below your estimated ${maintenanceCalories}kcal maintenance — aggressive. Sustainable fat loss is usually well under ${HARD_LIMIT_DEFICIT_PCT}%.`,
    };
  }
  return { calories, status: 'ok', deficitPct, message: null };
}

module.exports = {
  HARD_LIMIT_DEFICIT_PCT, WARNING_DEFICIT_PCT,
  estimateBMR, activityMultiplierFor, estimateMaintenanceCalories, applyDeficitLimit,
};
