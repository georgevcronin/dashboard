// Cycling's own physiology model, built on real Strava power-meter data
// (average_watts/device_watts, captured in stravaParsing.js) rather than a
// HR-only genericization of the running engine. See ENDURANCE_SCIENCE.md.
//
// estimateFTP is the one primitive everything else here derives from --
// zones, load, and efficiency all key off it. Every export here returns
// null/no-op with no qualifying power-meter ride, so callers fall back to
// the HR-only path (Karvonen zones, TRIMP load, speed-based EF) exactly the
// way running already degrades gracefully when pace/VO2max data is missing.

// #FTP: Functional Threshold Power (Coggan/Allen, "Training and Racing with
// a Power Meter") -- the best ~20min-plus power-meter effort at genuine
// threshold intensity (avgHeartRate >= 85% max, same "detect a hard effort"
// heuristic vo2max.js's vdotTrend uses for running: HR/max > 0.8), scaled by
// the standard 95%-of-best-20-min convention. Takes the single best
// qualifying ride, not an average across several -- FTP is a ceiling
// capacity, unlike VDOT's averaged test-run estimate, which is smoothing
// noise across repeat near-max efforts rather than looking for a peak.
function estimateFTP(rides, maxHeartRate, windowDays = 90) {
  if (!rides?.length || !maxHeartRate) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const candidates = rides.filter(r =>
    r.hasPowerMeter && r.avgWatts > 0 && r.durationMin >= 20 &&
    r.avgHeartRate && r.avgHeartRate >= 0.85 * maxHeartRate &&
    r.date && new Date(r.date) >= cutoff
  );
  if (!candidates.length) return null;

  const best = candidates.reduce((a, b) => (b.avgWatts > a.avgWatts ? b : a));
  return {
    ftp: Math.round(best.avgWatts * 0.95),
    basedOnWatts: best.avgWatts,
    basedOnDate: best.date,
    sampleCount: candidates.length,
  };
}

// Coggan's standard 7-zone power model, % of FTP. Cycling's real equivalent
// of running's VDOT pace zones.
const POWER_ZONES = {
  z1: { name: 'Active Recovery', pctMin: 0, pctMax: 0.55, purpose: 'Very easy spinning, active recovery' },
  z2: { name: 'Endurance', pctMin: 0.56, pctMax: 0.75, purpose: 'Aerobic base, long steady rides' },
  z3: { name: 'Tempo', pctMin: 0.76, pctMax: 0.90, purpose: 'Sustained moderate effort' },
  z4: { name: 'Threshold', pctMin: 0.91, pctMax: 1.05, purpose: 'Lactate threshold, FTP intervals' },
  z5: { name: 'VO2max', pctMin: 1.06, pctMax: 1.20, purpose: 'VO2max intervals, 3-8 min efforts' },
  z6: { name: 'Anaerobic', pctMin: 1.21, pctMax: 1.50, purpose: 'Anaerobic capacity, short hard efforts' },
  z7: { name: 'Neuromuscular', pctMin: 1.51, pctMax: null, purpose: 'All-out sprints, max power' },
};
function cogganPowerZones(ftp) {
  if (!ftp || ftp <= 0) return null;
  const result = {};
  for (const [key, z] of Object.entries(POWER_ZONES)) {
    const minWatts = Math.round(ftp * z.pctMin);
    const maxWatts = z.pctMax == null ? null : Math.round(ftp * z.pctMax);
    result[key] = { ...z, minWatts, maxWatts, range: maxWatts ? `${minWatts}-${maxWatts}W` : `${minWatts}W+` };
  }
  return result;
}

// TSS (Training Stress Score): duration(hr) x intensityFactor^2 x 100,
// where IF = avgWatts/FTP -- algebraically equivalent to the standard
// (sec x NP x IF)/(FTP x 3600) x 100 formula since NP=avgWatts here (we
// only have average_watts from Strava's activity-list endpoint, not true
// Normalized Power -- see ENDURANCE_SCIENCE.md for why that's an accepted
// simplification, not an error).
function computeRideTSS(ride, ftp) {
  if (!ride?.durationMin || !ride.avgWatts || !ftp) return null;
  const intensityFactor = ride.avgWatts / ftp;
  return (ride.durationMin / 60) * intensityFactor * intensityFactor * 100;
}

// Daily TSS load by date, matching dailyLoadsFromRuns's {date: load, ...}
// contract so it feeds the same coupledAcwr (functions/fatigue.js) running
// and lifting already share -- one ACWR function, three sports now.
function dailyLoadsFromPower(rides, ftp) {
  const byDate = {};
  if (!ftp) return byDate;
  for (const r of (rides || [])) {
    if (!r.hasPowerMeter || !r.date) continue;
    const tss = computeRideTSS(r, ftp);
    if (tss == null) continue;
    byDate[r.date] = (byDate[r.date] || 0) + tss;
  }
  return byDate;
}

// Cycling's real Efficiency Factor (avgWatts/avgHeartRate -- what
// TrainingPeaks and similar coaching tools call EF), not the speed-based
// approximation used when no power meter exists. Higher = better, same
// direction convention as running's HR/pace EF.
function computePowerEfficiencyFactor(ride) {
  if (!ride?.hasPowerMeter || !ride.avgWatts || !ride.avgHeartRate) return null;
  const ef = ride.avgWatts / ride.avgHeartRate;
  return ef > 0 ? ef : null;
}

// Fallback EF (km/h / HR) for rides with no power meter -- same
// higher-is-better direction as computePowerEfficiencyFactor, just a
// coarser proxy (speed is affected by wind/terrain in a way power isn't).
function computeSpeedEfficiencyFactor(ride) {
  if (!ride?.distanceKm || !ride.durationMin || !ride.avgHeartRate) return null;
  const kmh = ride.distanceKm / (ride.durationMin / 60);
  const ef = kmh / ride.avgHeartRate;
  return ef > 0 ? ef : null;
}

// Weekly EF trend, current week's average vs. the prior 3 weeks' -- same
// {trend4wk} shape buildRunningRecommendation's caution logic expects (see
// the shape-mismatch note in runningLoad.js's own weeklyEfficiencyTrend --
// this one is built correctly from the start). Shared by both EF flavors
// above, parameterized by which one to apply.
function weeklyTrendFromEf(rides, endDate, efFn) {
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const fourWeeksAgo = new Date(endDate);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const inWindow = (from, to) => (rides || []).filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    return d > from && d <= to;
  }).map(efFn).filter(Boolean);

  const recent = inWindow(weekAgo, endDate);
  const prior = inWindow(fourWeeksAgo, weekAgo);
  if (recent.length < 1 || prior.length < 1) return null;

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  if (!(priorAvg > 0)) return null;

  return { trend4wk: Math.round(((recentAvg - priorAvg) / priorAvg) * 1000) / 10 };
}
function weeklyPowerEfficiencyTrend(rides, endDate) {
  return weeklyTrendFromEf(rides, endDate, computePowerEfficiencyFactor);
}
function weeklySpeedEfficiencyTrend(rides, endDate) {
  return weeklyTrendFromEf(rides, endDate, computeSpeedEfficiencyFactor);
}

module.exports = {
  estimateFTP, cogganPowerZones, computeRideTSS, dailyLoadsFromPower,
  computeSpeedEfficiencyFactor, weeklySpeedEfficiencyTrend,
  computePowerEfficiencyFactor, weeklyPowerEfficiencyTrend,
};
