// #95: Standalone Running Recommendation Engine
// Provides daily run prescriptions: "What run should I do today, and why?"
//
// Inputs: readiness (fitness + load + recovery), efficiency trend, VO₂max, recent load
// Output: session type + duration target + intensity zone + reasoning
//
// Scientific basis: polarized training (80% easy, 20% hard) with ACWR safeguards
// See RUNNING_SCIENCE.md §#95

const { computeRunningReadiness, readinessLabel } = require('./runningReadiness');
const { computeRunningACWR } = require('./fatigue');
const { weeklyEfficiencyTrend, detectSessionDistanceSpike } = require('./runningLoad');

// Map readiness score to session type distribution (polarized 80/20)
// Healthy athletes should do mostly easy runs with occasional hard sessions
function sessionTypeByReadiness(readiness, lastRunType = null, weekSessionCount = 0) {
  // readiness: 0-100 score
  // Returns: { recommended: 'type', alternatives: ['type', ...], rationale }

  if (readiness >= 85) {
    // Fresh and well-recovered: opportunity for hard work
    // 70% chance easy (maintenance), 30% chance hard (build)
    return {
      recommended: weekSessionCount % 3 === 0 && lastRunType !== 'interval' ? 'interval' : 'easy',
      alternatives: ['steady', 'tempo', 'recovery'],
      intensity: 'threshold or VO₂max',
    };
  }

  if (readiness >= 70) {
    // Good recovery: balanced work
    // Mix of easy and moderate (threshold, steady)
    return {
      recommended: weekSessionCount % 4 === 0 ? 'steady' : 'easy',
      alternatives: ['recovery', 'tempo'],
      intensity: 'easy or marathon pace',
    };
  }

  if (readiness >= 55) {
    // Moderate fatigue: prioritize easy work and recovery
    return {
      recommended: 'easy',
      alternatives: ['recovery', 'long'],
      intensity: 'easy (60-70% max HR)',
    };
  }

  if (readiness >= 40) {
    // High fatigue: recovery runs only
    return {
      recommended: 'recovery',
      alternatives: ['easy'],
      intensity: 'easy (55-65% max HR)',
    };
  }

  // Severely depleted: rest
  return {
    recommended: 'rest',
    alternatives: ['recovery'],
    intensity: 'none',
    reason: 'Severely elevated fatigue; rest or very easy recovery only',
  };
}

// Duration prescription based on readiness and efficiency trend
function durationTargetMinutes(readiness, efficiencyTrend, runType) {
  const base = {
    easy: 45,
    recovery: 30,
    steady: 50,
    tempo: 40,
    interval: 35,
    long: 75,
  }[runType] || 45;

  // Adjust for readiness
  const readinessMult = Math.max(0.6, Math.min(1.2, readiness / 75)); // 60-120%
  const adjusted = Math.round(base * readinessMult);

  // Efficiency trend warning: if declining, cap at base
  let final = adjusted;
  if (efficiencyTrend && efficiencyTrend.trend4wk < -3) {
    final = Math.round(base * 0.8); // Reduce 20% if efficiency dropping sharply
  }

  return { min: Math.round(final * 0.8), target: final, max: Math.round(final * 1.3) };
}

// Pace zones from VO₂max
function paceZonesFromVO2max(vo2max, vdotTrainingPaces) {
  if (!vo2max) return null;
  if (!vdotTrainingPaces) return null;

  const { ePace, mPace, tPace, iPace, rPace } = vdotTrainingPaces;

  return {
    easy: `${Math.round(ePace * 100) / 100} min/km (easy, aerobic base)`,
    recovery: `${Math.round((ePace + 0.5) * 100) / 100}+ min/km (very easy, below aerobic threshold)`,
    steady: `${Math.round(mPace * 100) / 100} min/km (marathon pace, steady)`,
    tempo: `${Math.round(tPace * 100) / 100} min/km (threshold, 85-90% max HR)`,
    interval: `${Math.round(iPace * 100) / 100} min/km (VO₂max effort, 95-100% max HR)`,
    rep: `${Math.round(rPace * 100) / 100} min/km (rep pace, sprint efforts)`,
  };
}

// Main recommendation function
function buildRunningRecommendation({
  baseRecoveryScore,
  runningACWR,
  runs,
  profile,
  lastEfficiency,
  lastSpikeDetection,
  vo2maxResolution,
  vdotTrainingPaces,
} = {}) {
  if (!baseRecoveryScore || baseRecoveryScore < 0 || baseRecoveryScore > 100) {
    return null;
  }

  // Compute readiness
  const readiness = computeRunningReadiness(baseRecoveryScore, runningACWR);
  const label = readinessLabel(readiness);

  // Count this week's runs
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekRuns = (runs || []).filter(r => new Date(r.date) >= oneWeekAgo);
  const weekSessionCount = weekRuns.length;

  // Get last run type for diversity heuristic
  const lastRun = runs && runs.length ? runs[runs.length - 1] : null;
  const lastRunType = lastRun?.type || null;

  // Efficiency trend (4-week window)
  const efficiencyTrend = lastEfficiency || null;

  // Session type recommendation
  const sessionRec = sessionTypeByReadiness(readiness, lastRunType, weekSessionCount);

  // Duration target
  const duration = durationTargetMinutes(readiness, efficiencyTrend, sessionRec.recommended);

  // Pace zones
  const paceZones = paceZonesFromVO2max(vo2maxResolution?.vo2max, vdotTrainingPaces);

  // Warnings and cautions
  const cautions = [];
  if (lastSpikeDetection && lastSpikeDetection.risk === 'very_high') {
    cautions.push('Last run was a distance spike (>110% of 30-day max); consider easy/recovery only');
  }
  if (readiness < 50) {
    cautions.push('Readiness is low; prioritize recovery');
  }
  if (runningACWR > 1.5) {
    cautions.push('ACWR elevated; acute load is high relative to chronic base');
  }
  if (efficiencyTrend && efficiencyTrend.trend4wk < -5) {
    cautions.push('Efficiency declining; consider extra recovery day');
  }

  return {
    sessionType: sessionRec.recommended,
    alternatives: sessionRec.alternatives,
    intensity: sessionRec.intensity,
    readiness,
    readinessLabel: label,
    duration,
    paceZones,
    vo2maxSource: vo2maxResolution?.source || null,
    vo2maxValue: vo2maxResolution?.vo2max || null,
    efficiencyTrend,
    acwr: Math.round(runningACWR * 100) / 100,
    weekSessionCount,
    cautions,
    reasoning: buildReasoningString({
      readiness,
      label,
      sessionType: sessionRec.recommended,
      weekSessionCount,
      cautions,
    }),
  };
}

// Human-readable reasoning string
function buildReasoningString({ readiness, label, sessionType, weekSessionCount, cautions }) {
  const parts = [];

  parts.push(`You're ${label} for training today (readiness: ${Math.round(readiness)}%)`);

  if (sessionType === 'rest') {
    parts.push('Your system needs a full recovery day; skip running today.');
  } else if (sessionType === 'recovery') {
    parts.push('A very easy recovery run (30 min) will help active recovery without taxing your system further.');
  } else if (sessionType === 'easy') {
    parts.push('An easy aerobic run builds your base without additional fatigue.');
  } else if (sessionType === 'steady') {
    parts.push(`You have capacity for moderate-intensity work today.`);
  } else if (sessionType === 'tempo' || sessionType === 'interval') {
    parts.push(`Your recovery and efficiency support a harder session. This is a good day for intensity.`);
  }

  if (weekSessionCount === 0) {
    parts.push('You haven\'t run this week yet.');
  } else if (weekSessionCount >= 5) {
    parts.push(`You've already logged ${weekSessionCount} runs this week; consider a recovery run or rest day.`);
  }

  if (cautions.length) {
    parts.push(`Cautions: ${cautions.join('; ')}`);
  }

  return parts.join(' ');
}

module.exports = {
  buildRunningRecommendation,
  sessionTypeByReadiness,
  durationTargetMinutes,
  paceZonesFromVO2max,
  buildReasoningString,
};
