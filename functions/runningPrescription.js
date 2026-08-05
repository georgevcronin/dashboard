// #97: Physiological Target-Based Running Prescriptions
// Karvonen heart rate zones + VDOT pacing for running-specific training
//
// Karvonen formula: HR_target = HRrest + (HRmax - HRrest) × intensity%
// Provides individualized HR ranges accounting for resting heart rate
// Validated in Lucia et al. (2006) and used by TrainingPeaks, Garmin

const { vdotTrainingPaces } = require('./vo2max');

// Calculate max heart rate if not measured
function estimateMaxHeartRate(age, measuredMax = null) {
  if (measuredMax && measuredMax > 0) return measuredMax;

  // Karvonen-based aging curve (Astrand, 1952)
  // More accurate than Fox formula when calibrated to actual measured max
  // Fallback: 220 - age (Fox 1971, used clinically when nothing else available)
  const fox = 220 - age;
  const astrand = 205 - (age / 2);

  // Astrand is slightly lower/more conservative; use it as default
  return Math.round(astrand);
}

// Calculate HR reserve (Karvonen)
function calculateHRReserve(maxHR, restingHR = 60) {
  return maxHR - restingHR;
}

// Generate Karvonen zones (5-zone polarized model)
// Intensity percentages based on training zones in endurance sports
function karvonen5Zones(maxHR, restingHR = 60) {
  if (!maxHR || maxHR <= 0) return null;

  const reserve = calculateHRReserve(maxHR, restingHR);

  // Zone definitions (% of HRmax or HRreserve)
  // Using HRreserve (Karvonen) as more accurate than HRmax percentage
  const zones = {
    z1: {
      name: 'Recovery/Easy',
      intensityMin: 0.50, intensityMax: 0.60,
      purpose: 'Base building, active recovery, warm-up/cool-down',
      effort: 'Very easy, conversational',
    },
    z2: {
      name: 'Aerobic/Steady',
      intensityMin: 0.60, intensityMax: 0.70,
      purpose: 'Aerobic threshold, most long runs, general base aerobic',
      effort: 'Comfortable, can speak',
    },
    z3: {
      name: 'Threshold/Tempo',
      intensityMin: 0.70, intensityMax: 0.80,
      purpose: 'Lactate threshold, marathon pace, sustained moderate effort',
      effort: 'Hard, breathing elevated, speech breaks',
    },
    z4: {
      name: 'VO₂max/Interval',
      intensityMin: 0.80, intensityMax: 0.90,
      purpose: 'VO₂max development, 3-8 min intervals, hard efforts',
      effort: 'Very hard, breathing labored, mostly non-verbal',
    },
    z5: {
      name: 'Anaerobic/Sprint',
      intensityMin: 0.90, intensityMax: 1.00,
      purpose: 'All-out sprints, <3 min max efforts, rarely sustained',
      effort: 'Maximum effort, cannot sustain >10 min',
    },
  };

  // Calculate HR ranges for each zone
  const result = {};
  for (const [key, zone] of Object.entries(zones)) {
    const minHR = Math.round(restingHR + reserve * zone.intensityMin);
    const maxHR = Math.round(restingHR + reserve * zone.intensityMax);

    result[key] = {
      ...zone,
      minHR,
      maxHR,
      range: `${minHR}-${maxHR} bpm`,
    };
  }

  return result;
}

// 3-zone polarized model (easier to remember for casual runners)
function karvonen3Zones(maxHR, restingHR = 60) {
  if (!maxHR || maxHR <= 0) return null;

  const reserve = calculateHRReserve(maxHR, restingHR);

  return {
    z1: {
      name: 'Easy (Z1-Z2)',
      minHR: Math.round(restingHR + reserve * 0.50),
      maxHR: Math.round(restingHR + reserve * 0.70),
      purpose: 'Recovery, base building, majority of runs (80%)',
      effort: 'Conversational pace',
    },
    z2: {
      name: 'Moderate (Z3)',
      minHR: Math.round(restingHR + reserve * 0.70),
      maxHR: Math.round(restingHR + reserve * 0.80),
      purpose: 'Threshold, tempo work (10%)',
      effort: 'Challenging but sustainable',
    },
    z3: {
      name: 'Hard (Z4-Z5)',
      minHR: Math.round(restingHR + reserve * 0.80),
      maxHR: Math.round(restingHR + reserve * 1.00),
      purpose: 'VO₂max, intervals, sprints (10%)',
      effort: 'Very hard or maximal',
    },
  };
}

// Map VDOT paces to Karvonen HR zones
function zonesWithPaces(maxHR, vo2max, vdotPaces, restingHR = 60) {
  if (!maxHR || !vo2max) return null;

  const karvonenZones = karvonen5Zones(maxHR, restingHR);
  if (!karvonenZones) return null;

  // Match pace zones to Karvonen zones
  const mapped = {
    z1: {
      ...karvonenZones.z1,
      pace: vdotPaces?.ePace ? `${Math.round(vdotPaces.ePace * 100) / 100} min/km` : null,
      paceZone: 'Easy pace',
    },
    z2: {
      ...karvonenZones.z2,
      pace: vdotPaces?.mPace ? `${Math.round(vdotPaces.mPace * 100) / 100} min/km` : null,
      pazeZone: 'Marathon/Steady pace',
    },
    z3: {
      ...karvonenZones.z3,
      pace: vdotPaces?.tPace ? `${Math.round(vdotPaces.tPace * 100) / 100} min/km` : null,
      paceZone: 'Threshold pace',
    },
    z4: {
      ...karvonenZones.z4,
      pace: vdotPaces?.iPace ? `${Math.round(vdotPaces.iPace * 100) / 100} min/km` : null,
      paceZone: 'VO₂max pace',
    },
    z5: {
      ...karvonenZones.z5,
      pace: vdotPaces?.rPace ? `${Math.round(vdotPaces.rPace * 100) / 100} min/km` : null,
      paceZone: 'Repetition pace',
    },
  };

  return mapped;
}

// Prescribe workout targets: HR zone + pace + duration
function prescribeWorkout({ sessionType, maxHR, vo2max, vdotPaces, durationMin, restingHR = 60 } = {}) {
  if (!maxHR || !sessionType) return null;

  const zones = karvonen5Zones(maxHR, restingHR);
  if (!zones) return null;

  // Map session type to HR zone
  const zoneMap = {
    rest: null,
    recovery: 'z1',
    easy: 'z1',
    steady: 'z2',
    tempo: 'z3',
    threshold: 'z3',
    interval: 'z4',
    vo2max: 'z4',
    rep: 'z5',
    sprint: 'z5',
  };

  const targetZone = zoneMap[sessionType];
  if (!targetZone) return null;

  const zone = zones[targetZone];
  if (!zone) return null;

  // Add pace if available
  const paceMap = {
    z1: vdotPaces?.ePace,
    z2: vdotPaces?.mPace,
    z3: vdotPaces?.tPace,
    z4: vdotPaces?.iPace,
    z5: vdotPaces?.rPace,
  };

  const pace = paceMap[targetZone];

  return {
    sessionType,
    zone: targetZone,
    hrZone: zone.name,
    minHR: zone.minHR,
    maxHR: zone.maxHR,
    hrRange: zone.range,
    pace: pace ? `${Math.round(pace * 100) / 100} min/km` : null,
    duration: durationMin,
    durationRange: {
      min: Math.round(durationMin * 0.8),
      target: durationMin,
      max: Math.round(durationMin * 1.3),
    },
    purpose: zone.purpose,
    effort: zone.effort,
  };
}

module.exports = {
  estimateMaxHeartRate,
  calculateHRReserve,
  karvonen5Zones,
  karvonen3Zones,
  zonesWithPaces,
  prescribeWorkout,
};
