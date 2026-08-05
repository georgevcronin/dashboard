const test = require('node:test');
const assert = require('node:assert');

const {
  computeACWRPenalty,
  computeRunningReadiness,
  readinessLabel,
  readinessExplanation,
  runningSessionSuggestion,
} = require('../functions/runningReadiness');

test('ACWR penalty: safe zone (0.8-1.3)', () => {
  const safe = [0.8, 1.0, 1.3];

  for (const acwr of safe) {
    const penalty = computeACWRPenalty(acwr);
    assert(penalty <= 0.15, `ACWR ${acwr} should have ≤15% penalty in safe zone`);
  }
});

test('ACWR penalty: elevated zone (1.3-1.5)', () => {
  const elevated = 1.4;
  const penalty = computeACWRPenalty(elevated);

  assert(penalty > 0.15 && penalty < 0.5, 'elevated ACWR should have 15-50% penalty');
});

test('ACWR penalty: high risk (>1.5)', () => {
  const high = 1.6;
  const penalty = computeACWRPenalty(high);

  assert(penalty > 0.5 && penalty < 0.8, 'high ACWR should have 50-80% penalty');
});

test('ACWR penalty: capped at 80%', () => {
  const veryhigh = 3.0;
  const penalty = computeACWRPenalty(veryhigh);

  assert.strictEqual(penalty, 0.8, 'penalty should cap at 80%');
});

test('ACWR penalty: below safe zone returns 0', () => {
  const penalty = computeACWRPenalty(0.7);

  assert.strictEqual(penalty, 0, 'below 0.8 should have 0 penalty (detraining signal)');
});

test('Running readiness: high base + low ACWR', () => {
  const readiness = computeRunningReadiness(90, 0.95);

  assert(readiness > 85, 'high recovery + safe ACWR should yield high readiness');
});

test('Running readiness: high base + high ACWR', () => {
  const readiness = computeRunningReadiness(90, 1.6);

  assert(readiness < 85, 'high ACWR should reduce readiness despite high base');
  assert(readiness > 35, 'should still allow some training at high base recovery');
});

test('Running readiness: low base + any ACWR', () => {
  const readiness = computeRunningReadiness(30, 1.0);

  assert(readiness < 40, 'low base recovery should yield low readiness');
});

test('Running readiness: null ACWR uses base only', () => {
  const readiness = computeRunningReadiness(75, null);

  assert.strictEqual(readiness, 75, 'null ACWR should apply 0 penalty');
});

test('Readiness labels', () => {
  assert.strictEqual(readinessLabel(85), 'Ready for intensity');
  assert.strictEqual(readinessLabel(70), 'Good for training');
  assert.strictEqual(readinessLabel(50), 'Moderate fatigue');
  assert.strictEqual(readinessLabel(25), 'High fatigue');
  assert.strictEqual(readinessLabel(10), 'Very fatigued — rest recommended');
});

test('Readiness explanation: high readiness', () => {
  const exp = readinessExplanation(85, 0.9);

  assert.strictEqual(exp, 'Recovered and ready.');
});

test('Readiness explanation: low recovery', () => {
  const exp = readinessExplanation(40, 1.0);

  assert(exp.includes('Base recovery'), 'should cite low base recovery');
});

test('Readiness explanation: high ACWR', () => {
  const exp = readinessExplanation(80, 1.6);

  assert(exp.includes('ACWR'), 'should mention high ACWR');
});

test('Session suggestion: high readiness', () => {
  const suggestion = runningSessionSuggestion(80, 0, null);

  assert(suggestion.includes('Tempo') || suggestion.includes('Interval'), 'should suggest intensity work');
});

test('Session suggestion: moderate readiness', () => {
  const suggestion = runningSessionSuggestion(60, 0, null);

  assert(
    suggestion.includes('Easy') || suggestion.includes('long run'),
    'should suggest steady/long run'
  );
});

test('Session suggestion: low readiness', () => {
  const suggestion = runningSessionSuggestion(25, 0, null);

  assert(
    suggestion.includes('Very easy') || suggestion.includes('recovery'),
    'should suggest easy recovery or rest'
  );
});

test('Session suggestion: spike overrides readiness', () => {
  const highReadiness = 80;
  const spike = { isSpike: true, riskLevel: 'elevated' };
  const suggestion = runningSessionSuggestion(highReadiness, 0, spike);

  assert(suggestion.includes('Easy'), 'spike should force easy run despite high readiness');
});

test('Session suggestion: low efficiency triggers intensity', () => {
  const readiness = 80;
  const lowEfficiency = -5; // Fitness declining
  const suggestion = runningSessionSuggestion(readiness, lowEfficiency, null);

  assert(suggestion.includes('Interval'), 'declining fitness should suggest intensity');
});
