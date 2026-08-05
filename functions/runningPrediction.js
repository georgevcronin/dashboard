// #112/#113: Self-Calibrating Endurance Digital Twin
// Dose-response prediction with Bayesian learning
// Predicts VO₂max adaptation from training load; updates on measured outcomes
//
// Empirical basis: Daniels (1979), meta-analyses suggest 3-5% gain per 8 weeks
// Bayesian: prior from literature + posterior from individual measurements

// Dose-response model: weekly TRIMP → VO₂max % gain
// Based on meta-analysis: ~0.8-1.2% gain per 100 TRIMP per week
// Plateau effect: diminishing returns above VO₂max=70
function predictWeeklyVO2Gain(weeklyTrimps, currentVO2max, bCoefficient = 0.01) {
  if (!weeklyTrimps || weeklyTrimps.length === 0) return null;
  if (!currentVO2max || currentVO2max < 30 || currentVO2max > 85) return null;

  // Average weekly TRIMP
  const avgWeeklyTrimp = weeklyTrimps.reduce((a, b) => a + b, 0) / weeklyTrimps.length;

  // Base response: 0.8-1.2% per 100 TRIMP per week
  // Use 1.0% as default (middle of literature range)
  const baseGainPercent = (avgWeeklyTrimp / 100) * bCoefficient;

  // Plateau adjustment: diminishing returns for high-VO₂max athletes
  // VO₂max > 70 = elite; gains slow to ~50% of expected
  // Formula: dampening = 1 - (max(0, (vo2max - 70) / 20) * 0.5)
  let dampening = 1.0;
  if (currentVO2max > 70) {
    dampening = 1.0 - Math.max(0, (currentVO2max - 70) / 20) * 0.5;
  }

  const adjustedGain = baseGainPercent * dampening;
  return {
    weeklyTrimps,
    avgWeeklyTrimp: Math.round(avgWeeklyTrimp),
    baseGainPercent: Math.round(adjustedGain * 100) / 100,
    plateauDampening: Math.round(dampening * 100) / 100,
  };
}

// Predict 8-week cumulative VO₂max gain from training loads
function predict8WeekVO2Gain(trimsPerWeek, currentVO2max, modelWeights = {}) {
  if (!trimsPerWeek || trimsPerWeek.length < 4) return null;

  // Model weights: { bCoefficient, priorGainPercent }
  // bCoefficient: TRIMP→gain conversion (default 0.01 = 1% per 100 TRIMP)
  // priorGainPercent: prior belief from literature (default 4%)
  const b = modelWeights.bCoefficient ?? 0.01;
  const priorGain = modelWeights.priorGainPercent ?? 4.0;

  // Weekly predictions
  const weeklyPredictions = trimsPerWeek.map(weeklyTrimp =>
    predictWeeklyVO2Gain([weeklyTrimp], currentVO2max, b)
  );

  // Cumulative prediction: sum weekly gains
  const cumulativeGainPercent = weeklyPredictions.reduce((sum, pred) => {
    return sum + (pred?.baseGainPercent || 0);
  }, 0);

  // Bayesian blend: 70% prior (literature), 30% model estimate
  // Gives stability early when we have few measurements
  const blendedPrediction = priorGain * 0.7 + cumulativeGainPercent * 0.3;

  // Confidence interval: ±2 standard deviations (95% confidence)
  // Uncertainty grows with model uncertainty, shrinks with prior confidence
  const uncertainty = Math.sqrt((1.5 ** 2 * 0.7) + (1.5 ** 2 * 0.3)); // blended posterior uncertainty
  const ciMargin = uncertainty * 1.96; // 95% CI

  return {
    predictedGainPercent: Math.round(blendedPrediction * 100) / 100,
    predictedVO2maxAfter8Weeks: Math.round((currentVO2max * (1 + blendedPrediction / 100)) * 10) / 10,
    cumulativeModelEstimate: Math.round(cumulativeGainPercent * 100) / 100,
    priorBelief: priorGain,
    blendingWeights: { prior: 0.7, model: 0.3 },
    confidenceInterval: {
      min: Math.round((blendedPrediction - ciMargin) * 100) / 100,
      max: Math.round((blendedPrediction + ciMargin) * 100) / 100,
    },
  };
}

// Bayesian posterior update: blend prior + observation
// Used when actual VO₂max measurement is available
function updateBayesianModel({
  priorGainPercent = 4.0,
  observedGainPercent,
  observationUncertainty = 2.0,
  priorUncertainty = 1.5,
} = {}) {
  if (observedGainPercent === null || observedGainPercent === undefined) return null;

  // Bayesian update: weighted average inverse-variance weighted
  // Lower uncertainty = higher confidence
  const priorWeight = 1 / (priorUncertainty ** 2);
  const obsWeight = 1 / (observationUncertainty ** 2);
  const totalWeight = priorWeight + obsWeight;

  const posteriorGain =
    (priorGainPercent * priorWeight + observedGainPercent * obsWeight) / totalWeight;

  // Posterior uncertainty shrinks (more confident after seeing data)
  const posteriorUncertainty = Math.sqrt(1 / totalWeight);

  // Error = how much observation deviated from prior
  const error = observedGainPercent - priorGainPercent;

  return {
    posteriorGainPercent: Math.round(posteriorGain * 100) / 100,
    posteriorUncertainty: Math.round(posteriorUncertainty * 100) / 100,
    error: Math.round(error * 100) / 100,
    updatedPriorForNextCycle: Math.round(posteriorGain * 100) / 100,
  };
}

// Accumulate errors across multiple observations to detect athlete-specific response
// Returns running average of prediction errors (useful for detecting model drift)
function accumulateModelError(predictions, measurements) {
  if (!predictions || !measurements || predictions.length !== measurements.length) {
    return null;
  }

  const errors = predictions.map((pred, i) => pred - measurements[i]);
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const stdError = Math.sqrt(
    errors.reduce((sum, e) => sum + (e - meanError) ** 2, 0) / errors.length
  );

  return {
    meanError: Math.round(meanError * 100) / 100,
    stdDeviation: Math.round(stdError * 100) / 100,
    observations: predictions.length,
    interpretation:
      Math.abs(meanError) > stdError
        ? 'systematic bias detected'
        : 'errors within expected noise',
  };
}

module.exports = {
  predictWeeklyVO2Gain,
  predict8WeekVO2Gain,
  updateBayesianModel,
  accumulateModelError,
};
