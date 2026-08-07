// #100: VO₂max Estimation
// Primary: Direct measurement from Apple Watch (Series 3+) synced to Apple Health
// Fallback: Pace-based Daniels VDOT formula (Daniels & Gilbert 1979, r > 0.95)
// See RUNNING_SCIENCE.md §#100 for citations
//
// Preference order:
// 1. Direct Apple Watch VO₂max reading (if recent, <30 days old)
// 2. Calculated VDOT from time trial (running) or FTP (cycling, see
//    estimateCyclingVO2maxFromRides/ENDURANCE_SCIENCE.md)
// 3. HR-ratio estimate (Uth et al. 2004) -- sport-agnostic, lowest-confidence
//    of the three real-number estimates; see estimateVO2maxFromHRRatio
// 4. EF trend proxy (if <4-week data history; relative only, no absolute number)
// 5. Null (insufficient data)

const { estimateFTP } = require('./cyclingPower');

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

// #cyclingPower.js: cycling's own VO2max estimate, off real Strava power
// data rather than a running-pace formula that doesn't apply to cycling.
// VO2 at FTP via the ACSM leg-ergometry equation (ACSM's Guidelines for
// Exercise Testing and Prescription -- standard textbook formula, same
// citation rigor as runningPrescription.js's Karvonen/Astrand):
//   VO2 (mL/kg/min) = 11.0 x Watts / bodyMassKg + 7
// That's VO2 AT threshold, not VO2max -- threshold sits at roughly 85% of
// VO2max in trained individuals (Coyle et al. 1988; Faria et al. 2005
// cycling-physiology review), so VO2max ~= VO2atFTP / 0.85, the same spirit
// as Daniels' own duration->%VO2max curve above. Returns the same
// {vdot, vo2max, category} shape computeVDOT returns, so it plugs into
// resolveVO2max's existing calculatedVDOT argument unmodified.
function estimateCyclingVO2maxFromRides(rides, bodyMassKg, maxHeartRate) {
  if (!bodyMassKg) return null;
  const ftpResult = estimateFTP(rides, maxHeartRate);
  if (!ftpResult) return null;

  const vo2AtFTP = (11.0 * ftpResult.ftp) / bodyMassKg + 7;
  const vdot = vo2AtFTP / 0.85;

  return {
    vdot: Math.round(vdot * 10) / 10,
    vo2max: vdot,
    category: vdotCategory(vdot),
    ftp: ftpResult.ftp,
    date: ftpResult.basedOnDate,
    source: 'cycling-ftp', // resolveVO2max's medium tier reads this instead of defaulting to 'daniels-vdot'
  };
}

// Heart Rate Ratio method (Uth, Sorensen, Overgaard & Pedersen, 2004, Eur J
// Appl Physiol): VO2max ~= 15.3 x (HRmax/HRrest). No pace or power needed at
// all, so it's the one estimate that works for every sport -- but the
// weakest of the self-calculated methods here: the original validation was
// in a narrow young-athlete sample, and replication studies in general
// populations show far wider variance (r as low as ~0.5) than Daniels
// VDOT's r>0.95 or the ACSM power-based estimate above. Always 'low'
// confidence in resolveVO2max's chain below, never medium or high.
function estimateVO2maxFromHRRatio(maxHR, restingHR) {
  if (!maxHR || !restingHR || restingHR <= 0) return null;
  const vo2max = 15.3 * (maxHR / restingHR);
  if (!(vo2max > 0)) return null;
  return {
    vdot: Math.round(vo2max * 10) / 10,
    vo2max,
    category: vdotCategory(vo2max),
  };
}

// Resolve best available VO₂max source
// Prefers direct Apple Watch reading over calculated
function resolveVO2max(appleHealthVO2max, calculatedVDOT, hrRatioInputs = null, efTrend = null, maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
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

  // Fallback: calculated VDOT from time trial (running) or FTP (cycling).
  // calculatedVDOT.source, when the caller sets one (estimateCyclingVO2max
  // FromRides does), overrides the 'daniels-vdot' default -- additive only,
  // running's own vdotTrend result never carries a .source field, so this
  // is unchanged behavior for every existing caller.
  if (calculatedVDOT && calculatedVDOT.vdot > 0) {
    return {
      vo2max: calculatedVDOT.vdot,
      source: calculatedVDOT.source || 'daniels-vdot',
      date: calculatedVDOT.date || null,
      confidence: 'medium', // Calculated from race/threshold effort
      vdot: calculatedVDOT.vdot,
      note: calculatedVDOT.source === 'cycling-ftp'
        ? 'Threshold-to-VO2max approximation may inflate/deflate vs. true lab VO₂max'
        : 'Running economy may inflate/deflate vs. true lab VO₂max',
    };
  }

  // Fallback: HR-ratio method -- sport-agnostic, only reached with no watch
  // reading and no sport-specific calculatedVDOT (running pace-test or
  // cycling FTP) available. A real absolute number, just a rougher one --
  // tried before the EF-trend proxy below since that one can only ever
  // return a relative trend, never an absolute vo2max value.
  if (hrRatioInputs?.maxHR && hrRatioInputs?.restingHR) {
    const est = estimateVO2maxFromHRRatio(hrRatioInputs.maxHR, hrRatioInputs.restingHR);
    if (est) {
      return {
        vo2max: est.vo2max,
        source: 'hr-ratio',
        date: null,
        confidence: 'low',
        vdot: est.vdot,
        note: 'Rough estimate from HR max/rest ratio; no pace or power test data available',
      };
    }
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
  estimateCyclingVO2maxFromRides,
  estimateVO2maxFromHRRatio,
};
