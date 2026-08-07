// Swimming's Efficiency Factor -- the one piece that genuinely can't be
// borrowed from running or cycling, since pace units differ per sport and
// there's no power-meter equivalent for swimming (see ENDURANCE_SCIENCE.md).
// Load/ACWR and distance-spike detection for swimming reuse runningLoad.js's
// TRIMP/detectSessionDistanceSpike/computeLongRunPercentage directly --
// those already operate on generic {date, durationMin, avgHeartRate,
// distanceKm} fields with nothing running-specific inside.

// Speed-based EF (m/min / HR), same higher-is-better direction as running's
// HR/pace EF and cycling's watts/HR EF -- faster at a lower heart rate is
// always "better" regardless of which ratio gets there.
function computeSwimEfficiencyFactor(session) {
  if (!session?.distanceKm || !session.durationMin || !session.avgHeartRate) return null;
  const speedMetersPerMin = (session.distanceKm * 1000) / session.durationMin;
  const ef = speedMetersPerMin / session.avgHeartRate;
  return ef > 0 ? ef : null;
}

// Display-ready pace, swimming's actual convention (min:sec per 100m) --
// not running's min/km, which reads meaninglessly slow for pool distances.
function formatSwimPacePer100m(session) {
  if (!session?.distanceKm || !session.durationMin) return null;
  const totalSec = session.durationMin * 60;
  const per100m = (session.distanceKm * 1000) / 100;
  if (!(per100m > 0)) return null;
  const paceSec = totalSec / per100m;
  const mm = Math.floor(paceSec / 60);
  const ss = Math.round(paceSec % 60);
  return `${mm}:${String(ss).padStart(2, '0')}/100m`;
}

// Weekly EF trend, current week vs. the prior 3 weeks -- returns the
// {trend4wk} shape buildRunningRecommendation's caution logic actually
// expects (runningLoad.js's own weeklyEfficiencyTrend returns a bare number
// instead, an existing shape mismatch noted but deliberately not touched --
// see the plan/ENDURANCE_SCIENCE.md).
function weeklySwimEfficiencyTrend(sessions, endDate) {
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const fourWeeksAgo = new Date(endDate);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const inWindow = (from, to) => (sessions || []).filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    return d > from && d <= to;
  }).map(computeSwimEfficiencyFactor).filter(Boolean);

  const recent = inWindow(weekAgo, endDate);
  const prior = inWindow(fourWeeksAgo, weekAgo);
  if (recent.length < 1 || prior.length < 1) return null;

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  if (!(priorAvg > 0)) return null;

  return { trend4wk: Math.round(((recentAvg - priorAvg) / priorAvg) * 1000) / 10 };
}

module.exports = { computeSwimEfficiencyFactor, formatSwimPacePer100m, weeklySwimEfficiencyTrend };
