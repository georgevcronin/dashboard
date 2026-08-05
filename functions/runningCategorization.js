// #101: Diverse Run Session Categorisation
// Classify past runs by effort zone, pace relative to baseline, and physiological intensity
//
// Purpose: retrospective labeling of completed runs as E/M/T/I/R
// Input: run data (pace, HR, duration) + baseline (VO₂max, resting HR, max HR)
// Output: session category + confidence + reasoning
//
// Based on Daniels (1979) VDOT zones and Karvonen HR intensity

const { vdotTrainingPaces } = require('./vo2max');
const { karvonen5Zones } = require('./runningPrescription');

// Map pace to VDOT zone
// pace in min/km, vdot paces from vdotTrainingPaces()
function categorizePaceZone(paceMinPerKm, vdotPaces) {
  if (!vdotPaces || !paceMinPerKm) return null;

  const { ePace, mPace, tPace, iPace, rPace } = vdotPaces;

  // Zones have ranges with 5% margin for variability
  // (tempo runs aren't exactly at T-pace, some variability expected)
  const margin = 0.3; // 0.3 min/km tolerance

  if (paceMinPerKm >= ePace - margin) return 'z1_easy';
  if (paceMinPerKm >= mPace - margin) return 'z2_marathon';
  if (paceMinPerKm >= tPace - margin) return 'z3_threshold';
  if (paceMinPerKm >= iPace - margin) return 'z4_interval';
  if (paceMinPerKm >= rPace - margin) return 'z5_repetition';

  // Faster than repetition pace
  return 'z5_sprint';
}

// Map average HR to Karvonen zone
// Returns zone name (z1-z5) and whether it's a definitive match (vs marginal)
function categorizeHRZone(avgHeartRate, hrZones) {
  if (!hrZones || !avgHeartRate) return { zone: null, confidence: 'low' };

  const { z1, z2, z3, z4, z5 } = hrZones;

  // Check each zone with 2-3 bpm tolerance for margin of error
  const margin = 3;

  if (avgHeartRate <= z1.maxHR + margin) return { zone: 'z1', confidence: 'high' };
  if (avgHeartRate <= z2.maxHR + margin) return { zone: 'z2', confidence: 'high' };
  if (avgHeartRate <= z3.maxHR + margin) return { zone: 'z3', confidence: 'high' };
  if (avgHeartRate <= z4.maxHR + margin) return { zone: 'z4', confidence: 'high' };
  if (avgHeartRate <= z5.maxHR + margin) return { zone: 'z5', confidence: 'high' };

  // Above max HR (unlikely but handle it)
  return { zone: 'z5', confidence: 'low' };
}

// Reconcile pace-based and HR-based categorization
// They should agree; disagreement may indicate:
// - Running economy improvement (faster at same HR)
// - Excessive effort for pace (HR elevated)
// - Data quality issue
function reconcileCategories(paceZone, hrZone) {
  if (!paceZone && !hrZone) return null;
  if (!paceZone) return { zone: hrZone, source: 'hr-only', confidence: 'medium' };
  if (!hrZone) return { zone: paceZone, source: 'pace-only', confidence: 'medium' };

  // Extract zone numbers for comparison
  const paceNum = parseInt(paceZone.charAt(1));
  const hrNum = parseInt(hrZone.charAt(1));

  // Agreement: use pace as primary (pace is more precise than avg HR)
  if (paceNum === hrNum) {
    return { zone: paceZone, source: 'pace+hr-agreement', confidence: 'high' };
  }

  // Slight disagreement (±1 zone): weight toward pace
  if (Math.abs(paceNum - hrNum) === 1) {
    return { zone: paceZone, source: 'pace-primary', confidence: 'medium', note: 'HR and pace slightly mismatched' };
  }

  // Major disagreement (>1 zone): flag for review
  return {
    zone: paceZone,
    source: 'pace-primary',
    confidence: 'low',
    note: `Large pace/HR mismatch: pace suggests ${paceZone}, HR suggests z${hrNum}`,
  };
}

// Classify a single run
function categorizeRun({
  run,
  vo2maxValue,
  maxHeartRate,
  restingHeartRate,
} = {}) {
  if (!run) return null;

  const { paceMinPerKm, avgHeartRate, durationMin } = run;

  // Can't categorize without pace
  if (!paceMinPerKm) return null;

  // Get VDOT zones if we have VO₂max
  const vdotPaces = vo2maxValue ? vdotTrainingPaces(vo2maxValue) : null;
  const paceZone = vdotPaces ? categorizePaceZone(paceMinPerKm, vdotPaces) : null;

  // Get HR zones if we have max HR
  const hrZones = maxHeartRate ? karvonen5Zones(maxHeartRate, restingHeartRate || 60) : null;
  const hrZoneResult = avgHeartRate && hrZones ? categorizeHRZone(avgHeartRate, hrZones) : null;

  // Reconcile pace and HR categorization
  const categoryResult = reconcileCategories(paceZone, hrZoneResult?.zone);

  if (!categoryResult) return null;

  return {
    run: { date: run.date, distanceKm: run.distanceKm, durationMin, paceMinPerKm, avgHeartRate },
    category: categoryResult.zone,
    source: categoryResult.source,
    confidence: categoryResult.confidence,
    note: categoryResult.note || null,
    reasoning: buildCategorizationReasoning({
      category: categoryResult.zone,
      paceMinPerKm,
      avgHeartRate,
      vdotPaces,
      hrZones,
      source: categoryResult.source,
    }),
  };
}

// Classify multiple runs (e.g., past 30 days)
function categorizeManyRuns(runs, vo2maxValue, maxHeartRate, restingHeartRate) {
  if (!runs || !runs.length) return [];

  return runs
    .map(run =>
      categorizeRun({
        run,
        vo2maxValue,
        maxHeartRate,
        restingHeartRate,
      })
    )
    .filter(Boolean);
}

// Generate description of why a run was categorized a certain way
function buildCategorizationReasoning({
  category,
  paceMinPerKm,
  avgHeartRate,
  vdotPaces,
  hrZones,
  source,
}) {
  const parts = [];

  const categoryNames = {
    z1_easy: 'Easy/Recovery',
    z2_marathon: 'Steady/Marathon pace',
    z3_threshold: 'Threshold/Tempo',
    z4_interval: 'VO₂max interval',
    z5_repetition: 'Repetition/sprint effort',
    z5_sprint: 'Sprint/maximal effort',
  };

  parts.push(`Classified as ${categoryNames[category] || category}`);

  if (source === 'pace+hr-agreement') {
    parts.push(`pace and HR both confirm this zone`);
  } else if (source === 'pace-primary') {
    parts.push(`pace-based classification (HR secondary)`);
  }

  if (paceMinPerKm && vdotPaces) {
    const { ePace, mPace, tPace, iPace, rPace } = vdotPaces;
    const zoneMap = {
      z1_easy: ePace,
      z2_marathon: mPace,
      z3_threshold: tPace,
      z4_interval: iPace,
      z5_repetition: rPace,
      z5_sprint: rPace,
    };
    const zonePace = zoneMap[category];
    if (zonePace) {
      const diff = Math.round((paceMinPerKm - zonePace) * 100) / 100;
      parts.push(`(pace: ${paceMinPerKm} min/km, zone target: ${Math.round(zonePace * 100) / 100} min/km${diff !== 0 ? `, ${diff > 0 ? '+' : ''}${diff} min/km difference` : ''})`);
    }
  }

  if (avgHeartRate && hrZones) {
    const z = {
      z1: hrZones.z1,
      z2: hrZones.z2,
      z3: hrZones.z3,
      z4: hrZones.z4,
      z5: hrZones.z5,
    };
    const categoryNum = category.charAt(1);
    const zoneData = z[`z${categoryNum}`];
    if (zoneData) {
      parts.push(`(HR: ${avgHeartRate} bpm, zone range: ${zoneData.minHR}-${zoneData.maxHR} bpm)`);
    }
  }

  return parts.join('; ');
}

module.exports = {
  categorizePaceZone,
  categorizeHRZone,
  reconcileCategories,
  categorizeRun,
  categorizeManyRuns,
  buildCategorizationReasoning,
};
