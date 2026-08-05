// Running training load quantification — TRIMP (Training Impulse) based
// Banister (1991), Morton et al. (1990), validated across endurance sports
// See RUNNING_SCIENCE.md for citations

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// #106: Multi-Factor Running Load Engine
// Converts run data (duration, HR, elevation) into daily TRIMP-based load scores
// Returns { date: dailyLoad, ... }, matching dailyLoadsFromLifts() contract
//
// TRIMP = Duration × (HRavg - HRrest) / (HRmax - HRrest) × exp_factor
// See RUNNING_SCIENCE.md §#106 for full formula
function dailyLoadsFromRuns(runs, profile = {}) {
  const byDate = {};
  const resting = profile?.baselines?.restingHeartRate ?? 60;
  const max = profile?.baselines?.maxHeartRate ?? 200;

  for (const r of (runs || [])) {
    if (!r.date || !r.durationMin || !r.avgHeartRate) continue;

    const date = r.date;
    const duration = r.durationMin;
    const hrAvg = r.avgHeartRate;

    // HR reserve (percentage of max capacity being used)
    const hrr = (hrAvg - resting) / (max - resting);
    if (hrr < 0 || hrr > 1.2) continue; // Discard bad HR readings

    // TRIMP with gender factor (default 1.5 for unknown gender)
    // See RUNNING_SCIENCE.md: b = 0.64 (women), 1.92 (men), 1.5 (average)
    const b = profile?.sex === 'F' ? 0.64 : profile?.sex === 'M' ? 1.92 : 1.5;
    const trimp = duration * hrr * Math.exp(b * hrr);

    // Elevation adjustment (optional, secondary multiplier)
    // Small increase: +2% per 100m gain per minute
    // Only applies if elevation is significant (>50m total)
    let elevationMultiplier = 1.0;
    if (r.elevationGainM && r.elevationGainM > 50) {
      const elevationFactor = 0.02 * (r.elevationGainM / r.durationMin);
      elevationMultiplier = 1 + Math.min(elevationFactor, 0.3); // Cap at 30% boost
    }

    const load = trimp * elevationMultiplier;
    byDate[date] = (byDate[date] || 0) + load;
  }

  return byDate;
}

// Standalone helper: compute TRIMP for a single run session
// Used for detailed logging or real-time feedback
function computeRunTrimp(run, resting = 60, max = 200) {
  if (!run.durationMin || !run.avgHeartRate) return null;

  const hrr = (run.avgHeartRate - resting) / (max - resting);
  if (hrr < 0 || hrr > 1.2) return null;

  // Default gender factor when not specified
  const b = 1.5;
  return run.durationMin * hrr * Math.exp(b * hrr);
}

// Running efficiency factor: HR-to-pace ratio (inverse)
// Correlates with lab running economy (r=0.7-0.85)
// See RUNNING_SCIENCE.md §#99/#108
// Higher EF = better efficiency (lower HR at same pace, or faster pace at same HR)
// Improvements 2-5% per 4-week cycle = fitness gain
function computeEfficiencyFactor(run) {
  if (!run.paceMinPerKm || !run.avgHeartRate) return null;
  // EF = HR / pace (inverse): higher HR for slower pace = worse; normalized by pace
  const efficiency = run.avgHeartRate / run.paceMinPerKm;
  return efficiency > 0 ? efficiency : null;
}

// Weekly efficiency summary (average of all runs in period)
// Requires minimum 3-4 runs to filter noise
function weeklyEfficiencyTrend(runs, endDate) {
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekRuns = (runs || []).filter(r => {
    const d = new Date(r.date);
    return d > weekAgo && d <= endDate;
  });

  if (weekRuns.length < 3) return null;

  const efs = weekRuns
    .map(r => computeEfficiencyFactor(r))
    .filter(Boolean);

  return efs.length ? avg(efs) : null;
}

// Single-session distance spike detection (Garmin-RUNSAFE validation, N=5205)
// See RUNNING_SCIENCE.md §#102 for thresholds
//
// Risk increases 64% if session > 110% of longest run in past 30 days
function detectSessionDistanceSpike(run, priorRuns, thresholdRatio = 1.10) {
  if (!run.distanceKm) return null;

  const thirtyDaysAgo = new Date(run.date);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentRuns = (priorRuns || []).filter(r => {
    const d = new Date(r.date);
    return d > thirtyDaysAgo && d < new Date(run.date);
  });

  const longestRecent = Math.max(
    ...(recentRuns.map(r => r.distanceKm || 0)),
    run.distanceKm * 0.5 // Conservative baseline if <4 weeks history
  );

  const ratio = run.distanceKm / longestRecent;
  return {
    ratio,
    isSpike: ratio > thresholdRatio,
    riskLevel: ratio >= 2.0 ? 'very_high' : ratio > 1.3 ? 'high' : ratio > 1.1 ? 'elevated' : 'normal',
  };
}

// Long-run percentage: proportion of weekly total
// Safe range: 25-30%; caution: >50%
// See RUNNING_SCIENCE.md §#102
function computeLongRunPercentage(runs, endDate) {
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekRuns = (runs || []).filter(r => {
    const d = new Date(r.date);
    return d >= weekAgo && d <= endDate;
  });

  if (!weekRuns.length) return null;

  const weeklyTotal = weekRuns.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
  const longest = Math.max(...weekRuns.map(r => r.distanceKm || 0));

  return weeklyTotal > 0 ? (longest / weeklyTotal) * 100 : null;
}

module.exports = {
  dailyLoadsFromRuns,
  computeRunTrimp,
  computeEfficiencyFactor,
  weeklyEfficiencyTrend,
  detectSessionDistanceSpike,
  computeLongRunPercentage,
};
