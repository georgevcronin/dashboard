// #100: VO₂max Estimation
// Primary: Direct measurement from Apple Watch (Series 3+) synced to Apple Health
// Fallback: Pace-based Daniels VDOT formula (Daniels & Gilbert 1979, r > 0.95)
// See RUNNING_SCIENCE.md §#100 for citations
//
// Preference order:
// 1. Direct Apple Watch VO₂max reading (if recent, <30 days old)
// 2. Calculated VDOT from time trial (if performed)
// 3. EF trend proxy (if <4-week data history)
// 4. Null (insufficient data)

// Step 1: Oxygen cost of running at race pace
// VO₂ = -4.60 + 0.182258 × v + 0.000104 × v²
// v in meters per minute; VO₂ in mL/kg/min
function voTwo_costAtPace(speedMetersPerMinute) {
  const v = speedMetersPerMinute;
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

// Step 2: Fraction of VO₂max used at that pace (duration-dependent)
// Longer efforts require higher %VO₂max; sprints use less
// %VO₂max = 0.8 + 0.1894393 × e^(-0.012778 × t) + 0.2989558 × e^(-0.1932605 × t)
// t in minutes
function fractionVo2max(durationMinutes) {
  const t = durationMinutes;
  const term1 = 0.1894393 * Math.exp(-0.012778 * t);
  const term2 = 0.2989558 * Math.exp(-0.1932605 * t);
  return 0.8 + term1 + term2;
}

// Main function: Compute VDOT from a race effort
// Input: { paceMinPerKm, distanceKm, timeMinutes } or just time + distance
// Output: VDOT (pseudo-VO₂max in mL/kg/min)
function computeVDOT(raceData) {
  if (!raceData) return null;

  // Accept either (paceMinPerKm) or (distance + time)
  let speedMetersPerMinute;

  if (raceData.paceMinPerKm) {
    // Convert pace (min/km) to speed (m/min)
    speedMetersPerMinute = 1000 / raceData.paceMinPerKm;
  } else if (raceData.distanceKm && raceData.timeMinutes) {
    // Calculate pace from distance and time
    const paceMinPerKm = raceData.timeMinutes / raceData.distanceKm;
    speedMetersPerMinute = 1000 / paceMinPerKm;
  } else {
    return null;
  }

  if (speedMetersPerMinute <= 0) return null;

  const durationMinutes = raceData.timeMinutes || raceData.distanceKm * (raceData.paceMinPerKm || 0);
  if (!durationMinutes || durationMinutes < 1) return null;

  // Step 1: VO₂ demand at race pace
  const vo2Demand = voTwo_costAtPace(speedMetersPerMinute);

  // Step 2: Fraction of VO₂max sustained
  const fracVO2max = fractionVo2max(durationMinutes);
  if (fracVO2max <= 0) return null;

  // Step 3: VDOT
  const vdot = vo2Demand / fracVO2max;

  return {
    vdot: Math.round(vdot * 10) / 10, // Round to 1 decimal
    vo2max: vdot, // Pseudo-VO₂max (running economy can inflate/deflate true lab value)
    category: vdotCategory(vdot),
  };
}

// Category labels for VDOT values
function vdotCategory(vdot) {
  if (vdot < 25) return 'beginner';
  if (vdot < 35) return 'recreational';
  if (vdot < 45) return 'competitive-amateur';
  if (vdot < 55) return 'competitive-elite';
  if (vdot < 65) return 'elite';
  return 'elite-plus';
}

// VDOT to training paces (Daniels tables)
// Returns paces (min/km) for each zone
// Note: Daniels real tables are more granular; these are approximations
function vdotTrainingPaces(vdot) {
  if (!vdot || vdot <= 0) return null;

  // Inverse relationship: higher VDOT = faster paces = lower min/km
  // Approximation from Daniels' published tables (3rd edition)
  // Formula: pace_minPerKm = a - b * vdot

  // Easy pace (E): ~60-70% VO₂max
  // VDOT 50 → ~6.5 min/km, VDOT 30 → ~7.5 min/km
  const ePace = 10.5 - (vdot * 0.08);

  // Marathon pace (M): ~70-80% VO₂max
  // VDOT 50 → ~5.3 min/km, VDOT 30 → ~6.3 min/km
  const mPace = 8.3 - (vdot * 0.06);

  // Threshold pace (T): ~85-90% VO₂max
  // VDOT 50 → ~4.0 min/km, VDOT 30 → ~5.0 min/km
  const tPace = 6.8 - (vdot * 0.054);

  // Interval pace (I): ~95-100% VO₂max
  // VDOT 50 → ~3.2 min/km, VDOT 30 → ~4.2 min/km
  const iPace = 5.4 - (vdot * 0.044);

  // Repetition pace (R): >100% VO₂max
  // VDOT 50 → ~2.8 min/km, VDOT 30 → ~3.8 min/km
  const rPace = 4.4 - (vdot * 0.032);

  return {
    ePace: Math.round(ePace * 100) / 100,
    mPace: Math.round(mPace * 100) / 100,
    tPace: Math.round(tPace * 100) / 100,
    iPace: Math.round(iPace * 100) / 100,
    rPace: Math.round(rPace * 100) / 100,
  };
}

// Track VDOT over time (trend)
// Returns average VDOT from recent test runs
function vdotTrend(runs, windowDays = 30) {
  if (!runs || !runs.length) return null;

  // Identify "test" runs (max effort or very close to threshold pace)
  // Heuristic: runs with HR > 85% of max and paceMinPerKm < 5.5 min/km
  // (Threshold pace is typically 3.5-5 min/km for trained runners)

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const testRuns = runs.filter(r => {
    if (!r.date || new Date(r.date) < cutoff) return false;
    if (!r.avgHeartRate || !r.paceMinPerKm) return false;
    // Estimate max HR from Strava (often unreliable)
    // Conservative: runs at >80% effort
    const effortPercent = r.avgHeartRate / (200 || r.maxHeartRate || 190);
    return effortPercent > 0.8 && r.paceMinPerKm < 6;
  });

  if (!testRuns.length) return null;

  const vdots = testRuns
    .map(r => computeVDOT({ paceMinPerKm: r.paceMinPerKm, timeMinutes: r.durationMin })?.vdot)
    .filter(Boolean);

  if (!vdots.length) return null;

  const avg = vdots.reduce((a, b) => a + b, 0) / vdots.length;
  return {
    vdot: Math.round(avg * 10) / 10,
    sampleCount: vdots.length,
    minVDOT: Math.min(...vdots),
    maxVDOT: Math.max(...vdots),
    windowDays,
  };
}

// Resolve best available VO₂max source
// Prefers direct Apple Watch reading over calculated
function resolveVO2max(appleHealthVO2max, calculatedVDOT, efTrend = null, maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  // Check direct Apple Watch VO₂max (Series 3+)
  if (appleHealthVO2max && typeof appleHealthVO2max.value === 'number' && appleHealthVO2max.value > 0) {
    const ageMs = Date.now() - (appleHealthVO2max.dateMs || 0);
    if (ageMs < maxAgeMs) {
      return {
        vo2max: appleHealthVO2max.value,
        source: 'apple-watch',
        date: new Date(appleHealthVO2max.dateMs),
        confidence: 'high', // Direct measurement
        vdot: appleHealthVO2max.value, // VO₂max ≈ VDOT for this purpose
      };
    }
  }

  // Fallback: calculated VDOT from time trial
  if (calculatedVDOT && calculatedVDOT.vdot > 0) {
    return {
      vo2max: calculatedVDOT.vdot,
      source: 'daniels-vdot',
      date: calculatedVDOT.date || null,
      confidence: 'medium', // Calculated from race effort
      vdot: calculatedVDOT.vdot,
      note: 'Running economy may inflate/deflate vs. true lab VO₂max',
    };
  }

  // Fallback: EF trend proxy
  if (efTrend && efTrend.trend4wk) {
    // Rough proxy: EF % improvement per 4 weeks correlates with VO₂max gain
    // Very rough; use only if no other data
    const efGain = efTrend.trend4wk; // % improvement
    const estimatedGain = efGain * 0.6; // Conservative: EF gain ≈ 0.6× VO₂max gain
    return {
      vo2max: null, // Cannot estimate absolute from relative trend
      source: 'efficiency-trend',
      efTrend: efTrend.trend4wk,
      confidence: 'low', // Proxy only; relative, not absolute
      note: 'Efficiency trend detected; use time trial for absolute VO₂max',
    };
  }

  return null;
}

module.exports = {
  computeVDOT,
  vdotCategory,
  vdotTrainingPaces,
  vdotTrend,
  voTwo_costAtPace,
  fractionVo2max,
  resolveVO2max,
};
