const BASE_WEEKLY_BUDGET = 2000;

function computeActivityWeights(activityProfile, currentFatigue) {
  const profile = activityProfile || {};
  const primaryActivity = profile.primaryActivity || 'lifting';
  const secondaryActivity = profile.secondaryActivity || 'running';
  const weeklyTargets = profile.weeklyTargets || {};

  const fatigue = currentFatigue || {
    cns: { current: 0 },
    cardiovascular: { current: 0 },
    connectiveTissue: { current: 0 }
  };

  const cnsReduction = (fatigue.cns?.current || 0) / 100 * 0.3;
  const cardioReduction = (fatigue.cardiovascular?.current || 0) / 100 * 0.2;
  const connectiveReduction = (fatigue.connectiveTissue?.current || 0) / 100 * 0.15;
  const totalReduction = Math.min(0.6, cnsReduction + cardioReduction + connectiveReduction);

  const adjustedBudget = BASE_WEEKLY_BUDGET * (1 - totalReduction);

  const weights = {};
  weights[primaryActivity] = {
    allocationPercent: 0.60,
    recoveryBudgetAvailable: adjustedBudget * 0.60,
    thresholdCheck: fatigue.cns?.current > 85,
    rationale: 'Primary activity'
  };

  weights[secondaryActivity] = {
    allocationPercent: 0.30,
    recoveryBudgetAvailable: adjustedBudget * 0.30,
    thresholdCheck: fatigue.cns?.current > 75,
    rationale: 'Secondary activity'
  };

  const tertiaryActivity = profile.tertiaryActivity || 'sports';
  const shouldSkipTertiary = Object.values(fatigue).some(sys => sys.current > 80);
  weights[tertiaryActivity] = {
    allocationPercent: shouldSkipTertiary ? 0 : 0.10,
    recoveryBudgetAvailable: shouldSkipTertiary ? 0 : adjustedBudget * 0.10,
    thresholdCheck: Object.values(fatigue).some(sys => sys.current > 80),
    rationale: shouldSkipTertiary ? 'Any fatigue system > 80; skipping this week' : 'Tertiary activity'
  };

  const sessionCosts = {
    lifting: 300,
    running: 200,
    sports: 200
  };

  Object.keys(weights).forEach(activity => {
    const w = weights[activity];
    const cost = sessionCosts[activity] || 500;
    w.recommendedSessions = Math.floor(w.recoveryBudgetAvailable / cost);

    const target = weeklyTargets[activity]?.sessionsPerWeek;
    if (target && w.recommendedSessions < target) {
      w.mismatchWarning = `Target ${target} sessions/week, but budget only covers ${w.recommendedSessions}`;
    }

    if (w.thresholdCheck) {
      w.recoveryBudgetAvailable *= 0.7;
      w.recommendedSessions = Math.floor(w.recoveryBudgetAvailable / cost);
      w.thresholdApplied = true;
    }
  });

  return {
    lifting: weights.lifting || defaultWeight('lifting', 0.60),
    running: weights.running || defaultWeight('running', 0.30),
    sports: weights.sports || defaultWeight('sports', 0.10),
    totalRecoveryBudget: adjustedBudget
  };
}

function defaultWeight(activity, percent) {
  return {
    allocationPercent: percent,
    recoveryBudgetAvailable: BASE_WEEKLY_BUDGET * percent,
    recommendedSessions: 3,
    thresholdCheck: false,
    rationale: activity
  };
}

function evaluateAllocationAgainstTargets(weights, weeklyTargets) {
  const mismatches = [];
  const activities = Object.keys(weights);

  activities.forEach(activity => {
    const w = weights[activity];
    const target = weeklyTargets?.[activity];
    if (target && target.sessionsPerWeek && w.recommendedSessions < target.sessionsPerWeek) {
      mismatches.push({
        activity,
        targetSessions: target.sessionsPerWeek,
        recommendedSessions: w.recommendedSessions,
        message: `Cannot meet ${activity} target (${target.sessionsPerWeek}/week) with current recovery budget`
      });
    }
  });

  return mismatches;
}

module.exports = {
  computeActivityWeights,
  evaluateAllocationAgainstTargets,
  BASE_WEEKLY_BUDGET
};
