// Today's recovery score, and the decomposition of it.
//
// The score is a fixed weighted sum of six sub-scores, each in 0..1 and each
// measured against this athlete's own 14-day baseline rather than a population
// norm. Because it is a plain weighted sum, "why is recovery 66 today" has an
// exact answer — every factor's contribution is its sub-score times its
// weight — and that is what recoveryDrivers returns.
//
// The factor table is the single source of truth for both. computeDay sums it
// rather than keeping its own copy of the weights, so a driver can never
// narrate a weight the score stopped using. This is the same rule
// recommendation.js follows against weeklyPlanner, for the same reason.
//
// The one genuine trap: a missing input does not score zero, it scores
// MISSING_FALLBACK (0.8). That keeps one absent sensor from tanking the whole
// score, but it means the contribution of an unrecorded factor is a stand-in,
// not a measurement. Every factor carries `measured` so nothing downstream
// reports "blood oxygen contributed 8 points" on a day the watch never
// recorded it.

// Substituted for any sub-score whose input is absent. Deliberately below 1.0
// (an unmeasured factor shouldn't score better than a measured average one)
// and well above 0 (absence of evidence isn't evidence of poor recovery).
const MISSING_FALLBACK = 0.8;

const clamp01 = v => Math.max(0, Math.min(1, v));

// Ordered by weight. Each `score` returns null when its input is missing, and
// the caller substitutes MISSING_FALLBACK — keeping "no reading" distinct from
// "a reading that happens to equal the fallback".
const RECOVERY_FACTORS = [
  {
    key: 'hrv',
    label: 'Heart rate variability',
    weight: 0.40,
    // The only required factor: without it there is no personal baseline to
    // judge anything against, and computeDay returns null rather than guess.
    required: true,
    score: (d, b) => (d.heart_rate_variability && b.hrv ? clamp01(d.heart_rate_variability / b.hrv - 0.5) : null),
    reading: d => d.heart_rate_variability,
    baseline: b => b.hrv,
    unit: 'ms',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    weight: 0.20,
    score: (d, b) => (d.sleep_hours ? Math.min(1, d.sleep_hours / b.sleepTarget) : null),
    reading: d => d.sleep_hours,
    baseline: b => b.sleepTarget,
    unit: 'h',
  },
  {
    key: 'rhr',
    label: 'Resting heart rate',
    weight: 0.15,
    score: (d, b) => (d.resting_heart_rate && b.rhr ? clamp01(1 - (d.resting_heart_rate / b.rhr - 1) * 5) : null),
    reading: d => d.resting_heart_rate,
    baseline: b => b.rhr,
    unit: 'bpm',
    // Lower is better, so a reading above baseline is the bad direction.
    inverted: true,
  },
  {
    key: 'wristTemp',
    label: 'Wrist temperature',
    weight: 0.10,
    // Elevated skin temperature is a well-established illness/overreaching
    // signal, so it is penalised more steeply than a below-baseline reading.
    score: (d, b) => {
      if (d.wrist_temperature == null || b.wristTemp == null) return null;
      const dev = d.wrist_temperature - b.wristTemp;
      return dev <= 0 ? Math.max(0.5, 1 - Math.abs(dev) * 0.15) : Math.max(0, 1 - dev * 0.4);
    },
    reading: d => d.wrist_temperature,
    baseline: b => b.wristTemp,
    unit: '°',
    inverted: true,
  },
  {
    key: 'spo2',
    label: 'Blood oxygen',
    weight: 0.10,
    // Healthy range is roughly 96-100%; below that increasingly signals poor
    // sleep quality or respiratory strain.
    score: d => (d.blood_oxygen != null ? clamp01((d.blood_oxygen - 90) / 8) : null),
    reading: d => d.blood_oxygen,
    baseline: () => null,
    unit: '%',
  },
  {
    key: 'hr',
    label: 'Heart rate',
    weight: 0.05,
    // Noisier than true resting HR since it depends on what the athlete was
    // doing when it was sampled, hence the smallest weight in the table.
    score: (d, b) => (d.heart_rate && b.hr ? clamp01(1 - (d.heart_rate / b.hr - 1) * 3) : null),
    reading: d => d.heart_rate,
    baseline: b => b.hr,
    unit: 'bpm',
    inverted: true,
  },
];

// Capped below 100: a perfect score would claim a certainty six consumer
// sensors can't support.
const SCORE_CAP = 99;

// The learned personal sleep target: the average sleep on this athlete's own
// highest-HRV days, not a recommended figure. Falls back to 8h until there
// are enough paired nights to learn anything.
function personalSleepTarget(days) {
  const paired = (days || []).filter(d => d.heart_rate_variability && d.sleep_hours);
  if (paired.length < 7) return { target: 8, learned: false };
  const sorted = [...paired].sort((a, b) => b.heart_rate_variability - a.heart_rate_variability);
  const top = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 4)));
  const t = avg(top.map(d => d.sleep_hours));
  return { target: Math.min(9.5, Math.max(6.5, Math.round(t * 10) / 10)), learned: true };
}

function avg(xs) {
  const vals = (xs || []).filter(v => typeof v === 'number' && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Each factor's sub-score plus whether it came from a real reading.
function scoreFactors(day, baselines) {
  const d = day || {};
  return RECOVERY_FACTORS.map(factor => {
    const raw = factor.score(d, baselines || {});
    return {
      factor,
      subScore: raw == null ? MISSING_FALLBACK : raw,
      measured: raw != null,
    };
  });
}

function computeDay(day, baseHRV, baseRHR, sleepTarget, baseWristTemp, baseHR) {
  const baselines = { hrv: baseHRV, rhr: baseRHR, sleepTarget, wristTemp: baseWristTemp, hr: baseHR };
  const scored = scoreFactors(day, baselines);
  const required = scored.find(s => s.factor.required);
  if (required && !required.measured) return null;
  const total = scored.reduce((sum, s) => sum + s.subScore * s.factor.weight, 0);
  return Math.round(Math.min(SCORE_CAP, total * 100));
}

// Which factors are actually holding today's recovery down, in points of the
// final score, ranked by how much each is costing.
//
// `cost` is the honest quantity here — the points a factor is giving up
// against the most it could contribute — because that is what the athlete can
// act on. Reporting `points` alone would rank HRV first every day purely
// because it carries the largest weight, even on a day HRV is excellent.
function recoveryDrivers(day, { hrv, rhr, sleepTarget, wristTemp, hr } = {}) {
  const baselines = { hrv, rhr, sleepTarget, wristTemp, hr };
  const scored = scoreFactors(day, baselines);
  const required = scored.find(s => s.factor.required);
  if (required && !required.measured) return { score: null, factors: [], unmeasured: [] };

  const d = day || {};
  const factors = scored.map(({ factor, subScore, measured }) => {
    const maxPoints = factor.weight * 100;
    const points = subScore * maxPoints;
    const reading = factor.reading(d);
    const base = factor.baseline(baselines);
    return {
      key: factor.key,
      label: factor.label,
      unit: factor.unit,
      weight: factor.weight,
      measured,
      reading: reading ?? null,
      baseline: base ?? null,
      // Rounded for display only; ranking below uses the unrounded cost, so
      // two factors a tenth of a point apart still order correctly.
      points: Math.round(points * 10) / 10,
      maxPoints: Math.round(maxPoints * 10) / 10,
      cost: Math.round((maxPoints - points) * 10) / 10,
      share: Math.round(subScore * 1000) / 10,
      // Which direction a reading has to move to help, so the interface never
      // has to re-derive that from the factor name.
      betterWhen: factor.inverted ? 'lower' : 'higher',
      rawCost: maxPoints - points,
    };
  });

  const ranked = [...factors].sort((a, b) => b.rawCost - a.rawCost).map(({ rawCost, ...f }) => f);

  return {
    score: computeDay(day, hrv, rhr, sleepTarget, wristTemp, hr),
    factors: ranked,
    // Named separately so the interface can say "three of these are estimates"
    // rather than presenting a substituted 0.8 as a measurement.
    unmeasured: ranked.filter(f => !f.measured).map(f => f.key),
  };
}

module.exports = {
  computeDay, personalSleepTarget, recoveryDrivers,
  RECOVERY_FACTORS, MISSING_FALLBACK, SCORE_CAP,
};
