// Deterministic sleep-quality score (0-100), built from published clinical
// sleep-research benchmarks rather than an arbitrary formula:
// - Total duration: 7-9h
// - Sleep efficiency (time asleep / time in bed): >=85%
// - Sleep architecture: 13-25% deep, 20-25% REM, 50-60% light
// - Cardiovascular recovery: overnight heart rate 10-30% below daytime
//   waking resting heart rate
// - Fragmentation: WASO (wake after sleep onset) under 30 minutes
//
// Each dimension scores 0-100 independently — 100 squarely inside the ideal
// range/floor/ceiling, tapering off outside it — then combines as a weighted
// average over whichever dimensions have data. A night with no stage-level
// tracking still scores from duration/efficiency/WASO/HR-dip alone, with
// weights renormalized over what's actually available rather than penalizing
// data the phone/watch never had a chance to report.

const WEIGHTS = { duration: 25, efficiency: 20, deep: 15, rem: 15, light: 5, hrDip: 10, waso: 10 };

function rangeScore(value, lo, hi, falloffPerUnit) {
  if (value == null) return null;
  if (value >= lo && value <= hi) return 100;
  const dist = value < lo ? lo - value : value - hi;
  return Math.max(0, 100 - dist * falloffPerUnit);
}
function floorScore(value, floor, falloffPerUnit) {
  if (value == null) return null;
  return value >= floor ? 100 : Math.max(0, 100 - (floor - value) * falloffPerUnit);
}
function ceilingScore(value, ceiling, falloffPerUnit) {
  if (value == null) return null;
  return value <= ceiling ? 100 : Math.max(0, 100 - (value - ceiling) * falloffPerUnit);
}

// dayMetrics: a db.metrics[date]-shaped object. Expects (all optional):
// sleep_hours, sleep_eff (0-100), deep_sleep_min, rem_sleep_min,
// light_sleep_min, waso_min, resting_heart_rate, sleep_heart_rate.
function computeSleepScore(dayMetrics) {
  if (!dayMetrics) return null;
  const d = dayMetrics;
  const stageTotal = (d.deep_sleep_min || 0) + (d.rem_sleep_min || 0) + (d.light_sleep_min || 0);
  const deepPct = stageTotal ? (d.deep_sleep_min || 0) / stageTotal * 100 : null;
  const remPct = stageTotal ? (d.rem_sleep_min || 0) / stageTotal * 100 : null;
  const lightPct = stageTotal ? (d.light_sleep_min || 0) / stageTotal * 100 : null;
  const hrDipPct = (d.resting_heart_rate && d.sleep_heart_rate)
    ? (d.resting_heart_rate - d.sleep_heart_rate) / d.resting_heart_rate * 100
    : null;

  const components = {
    duration: rangeScore(d.sleep_hours, 7, 9, 25),
    efficiency: floorScore(d.sleep_eff, 85, 3),
    deep: rangeScore(deepPct, 13, 25, 8),
    rem: rangeScore(remPct, 20, 25, 8),
    light: rangeScore(lightPct, 50, 60, 4),
    hrDip: rangeScore(hrDipPct, 10, 30, 4),
    waso: ceilingScore(d.waso_min, 30, 2),
  };
  const available = Object.entries(components).filter(([, v]) => v != null);
  if (!available.length) return null;
  const totalWeight = available.reduce((s, [k]) => s + WEIGHTS[k], 0);
  const weightedSum = available.reduce((s, [k, v]) => s + v * WEIGHTS[k], 0);

  return {
    score: Math.round(weightedSum / totalWeight),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v == null ? null : Math.round(v)])),
    inputs: {
      deepPct: deepPct == null ? null : Math.round(deepPct),
      remPct: remPct == null ? null : Math.round(remPct),
      lightPct: lightPct == null ? null : Math.round(lightPct),
      hrDipPct: hrDipPct == null ? null : Math.round(hrDipPct),
    },
  };
}

module.exports = { computeSleepScore, WEIGHTS };
