// #98: Running Readiness — combines running ACWR + existing daily recovery score
// Not a parallel model; reuses computeDay() and computeCurrentFatigueScores
// See RUNNING_SCIENCE.md §#98 for approach

// Integration point: assumes caller has already computed:
//   - runningACWR from computeRunningACWR()
//   - baseRecoveryScore from computeDay() (0-100 scale, 100=fresh)

// ACWR fatigue penalty conversion: scales ACWR (0.8-1.5+) to penalty (0-1)
// See RUNNING_SCIENCE.md §#98
function computeACWRPenalty(acwr) {
  if (acwr === null || acwr === undefined) return 0; // No penalty if not calculable

  // Safe zone: ACWR 0.8–1.3 (minimal penalty, 0-15%)
  // Elevated: 1.3–1.5 (moderate penalty, 15-50%)
  // High: >1.5 (significant penalty, 50%+)

  if (acwr < 0.8) return 0; // Below threshold: ready to push
  if (acwr <= 1.3) return (acwr - 0.8) / 0.5 * 0.15; // 0-15% penalty in safe zone
  if (acwr <= 1.5) return 0.15 + (acwr - 1.3) / 0.2 * 0.35; // 15-50% penalty in elevated
  if (acwr <= 2.0) return 0.5 + (acwr - 1.5) / 0.5 * 0.3; // 50-80% penalty in high
  return 0.8; // 80% penalty cap for very high ACWR
}

// #98 Running Readiness Score (0-100)
// Input:
//   - baseRecoveryScore: 0-100 from computeDay() (structural, CNS, metabolic fatigue combined)
//   - runningACWR: acute:chronic ratio from computeRunningACWR()
//
// Output: 0-100 readiness score, where 100 = fully ready for high-intensity running
function computeRunningReadiness(baseRecoveryScore, runningACWR) {
  if (typeof baseRecoveryScore !== 'number') return null;

  const acwrPenalty = computeACWRPenalty(runningACWR);
  const readiness = baseRecoveryScore * (1 - acwrPenalty);

  return Math.max(0, Math.min(100, Math.round(readiness)));
}

// Readiness categories for UI
function readinessLabel(score) {
  if (score >= 80) return 'Ready for intensity';
  if (score >= 60) return 'Good for training';
  if (score >= 40) return 'Moderate fatigue';
  if (score >= 20) return 'High fatigue';
  return 'Very fatigued — rest recommended';
}

// Readiness explanation showing what's limiting performance
function readinessExplanation(baseRecoveryScore, runningACWR) {
  const acwrPenalty = computeACWRPenalty(runningACWR);
  const fromRecovery = baseRecoveryScore;
  const fromACWR = acwrPenalty * 100;

  const factors = [];
  if (fromRecovery < 60) {
    factors.push(`Base recovery low (${Math.round(fromRecovery)}%)`);
  }
  if (acwrPenalty > 0.2) {
    const acwrCategory =
      runningACWR > 1.5 ? 'High ACWR' : runningACWR > 1.3 ? 'Elevated ACWR' : 'Moderate ACWR';
    factors.push(`${acwrCategory} (${runningACWR?.toFixed(2)})`);
  }

  if (factors.length === 0) {
    return 'Recovered and ready.';
  }
  return `Limited by: ${factors.join(', ')}`;
}

// Recommendation by readiness level (for #95 engine to use)
function runningSessionSuggestion(readiness, lastEfficiency, spike) {
  // High readiness: interval or tempo work
  if (readiness >= 75) {
    if (spike?.isSpike) return 'Easy recovery run only (recent distance spike)';
    if (!lastEfficiency || lastEfficiency < -3) return 'Interval session (regain fitness)';
    return 'Tempo or threshold run';
  }

  // Moderate readiness: steady run or long run
  if (readiness >= 50) {
    if (spike?.isSpike) return 'Easy recovery run (distance spike risk)';
    return 'Easy aerobic or long run';
  }

  // Low readiness: easy only
  if (readiness >= 20) {
    return 'Very easy recovery run or rest day';
  }

  return 'Rest recommended; skip running';
}

module.exports = {
  computeACWRPenalty,
  computeRunningReadiness,
  readinessLabel,
  readinessExplanation,
  runningSessionSuggestion,
};
