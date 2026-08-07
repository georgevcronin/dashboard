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

const FLAT_FALLBACK_DEFICIT_PCT = 15;
const KCAL_PER_KG_FAT = 7700;

// Converts a Lose Fat goal's target into a target bodyweight, so a
// %-metric goal can size a deficit the same way a weight-metric one does.
// 'bodyFat' rides on a lean-mass-constant assumption: derives current fat
// mass from the latest weight + body-fat reading, holds lean mass fixed,
// and solves for the bodyweight at the target %. Softer ground than a
// direct weight target (stacked on an already-estimated body-fat reading),
// but it's the only way to size a %-based goal against a deficit at all.
function impliedTargetWeightKg(goal, currentWeightKg, currentBodyFatPct) {
  if (goal.metric === 'weight') return goal.target;
  if (goal.metric === 'bodyFat') {
    // currentBodyFatPct > 0 rather than >= 0 -- also rejects null/undefined,
    // since null >= 0 is true in JS (null coerces to 0).
    if (!(currentWeightKg > 0) || !(currentBodyFatPct > 0) || !(goal.target < 100)) return null;
    const leanMassKg = currentWeightKg * (1 - currentBodyFatPct / 100);
    return leanMassKg / (1 - goal.target / 100);
  }
  return null;
}

// Sizes a Lose Fat calorie target off the athlete's own goal + timeframe
// instead of a flat guess: (weight to lose x 7700kcal/kg fat) / days
// remaining gives the daily deficit that gets there on schedule. Falls back
// to a flat 15% deficit off real maintenance whenever "on schedule" isn't
// computable — no concrete goal, no target date, the date's already past,
// no current weight/body-fat reading to size the gap from, or the athlete
// is already at/past target. applyDeficitLimit() still clamps the result
// afterwards either way, same safety net regardless of source.
function calorieTargetForFatLossGoal({ maintenanceCalories, currentWeightKg, currentBodyFatPct, goal, todayISO }) {
  const flat = { calories: Math.round(maintenanceCalories * (1 - FLAT_FALLBACK_DEFICIT_PCT / 100)), source: 'flat-fallback' };
  if (!goal || !goal.concrete || !goal.targetDate) return flat;

  const targetWeightKg = impliedTargetWeightKg(goal, currentWeightKg, currentBodyFatPct);
  const daysRemaining = Math.round((new Date(goal.targetDate + 'T00:00:00Z') - new Date(todayISO + 'T00:00:00Z')) / 86400000);
  const weightToLoseKg = targetWeightKg != null && currentWeightKg > 0 ? currentWeightKg - targetWeightKg : null;
  if (daysRemaining <= 0 || !(weightToLoseKg > 0)) return flat;

  const dailyDeficit = (weightToLoseKg * KCAL_PER_KG_FAT) / daysRemaining;
  return {
    calories: Math.round(maintenanceCalories - dailyDeficit),
    source: 'goal-timeframe',
    daysRemaining,
    weightToLoseKg: Math.round(weightToLoseKg * 10) / 10,
  };
}

module.exports = {
  HARD_LIMIT_DEFICIT_PCT, WARNING_DEFICIT_PCT, FLAT_FALLBACK_DEFICIT_PCT, KCAL_PER_KG_FAT,
  estimateBMR, activityMultiplierFor, estimateMaintenanceCalories, applyDeficitLimit,
  impliedTargetWeightKg, calorieTargetForFatLossGoal,
};
