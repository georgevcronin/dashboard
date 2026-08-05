const test = require('node:test');
const assert = require('node:assert');

const {
  predictWeeklyVO2Gain,
  predict8WeekVO2Gain,
  updateBayesianModel,
  accumulateModelError,
} = require('../functions/runningPrediction');

test('Weekly VO₂max gain: calculates base response from TRIMP', () => {
  const result = predictWeeklyVO2Gain([500], 50, 0.01);
  assert(result, 'should return prediction');
  assert(result.baseGainPercent > 0, 'should predict positive gain');
  assert(result.baseGainPercent < 10, 'should predict realistic gain %');
});

test('Weekly VO₂max gain: higher TRIMP → higher gain', () => {
  const low = predictWeeklyVO2Gain([300], 50, 0.01);
  const high = predictWeeklyVO2Gain([700], 50, 0.01);
  assert(high.baseGainPercent > low.baseGainPercent, 'more load should predict higher gain');
});

test('Weekly VO₂max gain: plateau effect for VO₂max > 70', () => {
  const lowVO2 = predictWeeklyVO2Gain([500], 45, 0.01);
  const highVO2 = predictWeeklyVO2Gain([500], 75, 0.01);
  assert(
    highVO2.baseGainPercent < lowVO2.baseGainPercent,
    'elite athletes should see smaller gains'
  );
  assert(highVO2.plateauDampening < 1.0, 'dampening should reduce high-VO₂ gains');
});

test('Weekly VO₂max gain: null for invalid VO₂max', () => {
  const result = predictWeeklyVO2Gain([500], 90, 0.01);
  assert.strictEqual(result, null, 'unrealistic VO₂max should return null');
});

test('Weekly VO₂max gain: null for empty TRIMP array', () => {
  const result = predictWeeklyVO2Gain([], 50, 0.01);
  assert.strictEqual(result, null, 'empty TRIMP array should return null');
});

test('8-week prediction: generates confident forecast', () => {
  const weeklyTrimp = [450, 480, 520, 490, 510, 470, 460, 500];
  const result = predict8WeekVO2Gain(weeklyTrimp, 50);
  assert(result, 'should return 8-week prediction');
  assert(result.predictedGainPercent > 0, 'should predict positive gain');
  assert(result.predictedGainPercent < 10, 'should predict realistic 8-week gain');
  assert(result.predictedVO2maxAfter8Weeks > 50, 'should increase VO₂max value');
});

test('8-week prediction: uses Bayesian blending (70% prior, 30% model)', () => {
  const weeklyTrimp = [100, 100, 100, 100, 100, 100, 100, 100]; // Very low load
  const result = predict8WeekVO2Gain(weeklyTrimp, 50);
  // Model estimate would be ~0.8%, prior is 4%
  // Blend: 4% * 0.7 + 0.8% * 0.3 ≈ 3.04%
  assert(result.predictedGainPercent >= 2, 'should be dominated by prior');
  assert(result.predictedGainPercent <= 4, 'but should drift toward model if data strong');
});

test('8-week prediction: confidence interval brackets prediction', () => {
  const weeklyTrimp = [450, 480, 520, 490, 510, 470, 460, 500];
  const result = predict8WeekVO2Gain(weeklyTrimp, 50);
  assert(
    result.confidenceInterval.min < result.predictedGainPercent,
    'lower bound should be below prediction'
  );
  assert(
    result.confidenceInterval.max > result.predictedGainPercent,
    'upper bound should be above prediction'
  );
});

test('8-week prediction: null for insufficient data (<4 weeks)', () => {
  const result = predict8WeekVO2Gain([450, 480], 50);
  assert.strictEqual(result, null, 'should require at least 4 weeks');
});

test('Bayesian update: posterior blends prior + observation', () => {
  const result = updateBayesianModel({
    priorGainPercent: 4.0,
    observedGainPercent: 6.0,
    observationUncertainty: 1.5,
    priorUncertainty: 1.5,
  });
  assert(result, 'should return posterior');
  assert(result.posteriorGainPercent > 4.0, 'should shift toward observation');
  assert(result.posteriorGainPercent < 6.0, 'but not fully to observation');
  assert.strictEqual(result.posteriorGainPercent, 5.0, 'equal uncertainty should average');
});

test('Bayesian update: confident observation dominates weak prior', () => {
  const result = updateBayesianModel({
    priorGainPercent: 4.0,
    observedGainPercent: 7.0,
    observationUncertainty: 0.5,
    priorUncertainty: 3.0,
  });
  assert(result.posteriorGainPercent > 5.5, 'confident observation should pull posterior up');
});

test('Bayesian update: calculates error magnitude', () => {
  const result = updateBayesianModel({
    priorGainPercent: 4.0,
    observedGainPercent: 2.5,
  });
  assert.strictEqual(result.error, -1.5, 'error = observed - prior');
});

test('Bayesian update: null for missing observation', () => {
  const result = updateBayesianModel({
    priorGainPercent: 4.0,
    observedGainPercent: null,
  });
  assert.strictEqual(result, null, 'should return null without observation');
});

test('Model error accumulation: calculates mean error', () => {
  const predictions = [3.5, 4.2, 3.8, 4.1];
  const measurements = [3.8, 3.9, 4.0, 3.7];
  const result = accumulateModelError(predictions, measurements);
  assert(result, 'should return error stats');
  assert(typeof result.meanError === 'number', 'should calculate mean error');
});

test('Model error accumulation: detects systematic bias', () => {
  // Predictions consistently lower than actual
  const predictions = [2.0, 2.1, 2.2, 2.3];
  const measurements = [5.0, 5.1, 5.2, 5.3];
  const result = accumulateModelError(predictions, measurements);
  assert(result.meanError < -2, 'should detect large negative bias');
  assert(result.interpretation.includes('systematic bias'), 'should flag bias');
});

test('Model error accumulation: null for mismatched arrays', () => {
  const result = accumulateModelError([1, 2, 3], [1, 2]);
  assert.strictEqual(result, null, 'length mismatch should return null');
});

test('Model error accumulation: characterizes random noise', () => {
  const predictions = [4.0, 4.0, 4.0, 4.0];
  const measurements = [3.8, 4.2, 3.9, 4.1]; // Small random variations
  const result = accumulateModelError(predictions, measurements);
  assert(Math.abs(result.meanError) < 0.2, 'mean error should be small');
  assert(result.interpretation.includes('within expected noise'), 'should classify as noise');
});
