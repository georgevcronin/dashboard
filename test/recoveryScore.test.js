const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeDay, personalSleepTarget, recoveryDrivers,
  RECOVERY_FACTORS, MISSING_FALLBACK, SCORE_CAP,
} = require('../functions/recoveryScore');

// ---------------------------------------------------------------------------
// Behaviour preservation.
//
// computeDay and personalSleepTarget were lifted out of functions/index.js
// unchanged. These are verbatim copies of what index.js ran before the
// extraction, kept here as a reference so the refactor has to prove itself
// rather than be assumed correct — recovery is the number the whole CNS
// fatigue model is modulated by, and a silent one-point drift in it would be
// invisible everywhere and wrong everywhere.
// ---------------------------------------------------------------------------

const avgRef = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function computeDayReference(d, baseHRV, baseRHR, sleepTarget, baseWristTemp, baseHR) {
  const hrv = d.heart_rate_variability, rhr = d.resting_heart_rate, sleepH = d.sleep_hours;
  const wristTemp = d.wrist_temperature, hr = d.heart_rate, spo2 = d.blood_oxygen;
  if (!hrv || !baseHRV) return null;
  const hrvScore = Math.max(0, Math.min(1, hrv / baseHRV - 0.5));
  const rhrScore = rhr && baseRHR ? Math.max(0, Math.min(1, 1 - (rhr / baseRHR - 1) * 5)) : 0.8;
  const sleepScore = sleepH ? Math.min(1, sleepH / sleepTarget) : 0.8;
  const tempDev = wristTemp != null && baseWristTemp != null ? wristTemp - baseWristTemp : null;
  const wristScore = tempDev == null ? 0.8 : tempDev <= 0
    ? Math.max(0.5, 1 - Math.abs(tempDev) * 0.15)
    : Math.max(0, 1 - tempDev * 0.4);
  const spo2Score = spo2 != null ? Math.max(0, Math.min(1, (spo2 - 90) / 8)) : 0.8;
  const hrScore = hr && baseHR ? Math.max(0, Math.min(1, 1 - (hr / baseHR - 1) * 3)) : 0.8;
  return Math.round(Math.min(99, (hrvScore * 0.40 + rhrScore * 0.15 + sleepScore * 0.20 + wristScore * 0.10 + spo2Score * 0.10 + hrScore * 0.05) * 100));
}

function personalSleepTargetReference(days) {
  const paired = days.filter((d) => d.heart_rate_variability && d.sleep_hours);
  if (paired.length < 7) return { target: 8, learned: false };
  const sorted = [...paired].sort((a, b) => b.heart_rate_variability - a.heart_rate_variability);
  const top = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 4)));
  const t = avgRef(top.map((d) => d.sleep_hours));
  return { target: Math.min(9.5, Math.max(6.5, Math.round(t * 10) / 10)), learned: true };
}

// Deterministic pseudo-random so a failure is always reproducible.
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

test('computeDay matches the pre-extraction implementation across 20000 random days', () => {
  const rnd = lcg(20260802);
  const maybe = (p, v) => (rnd() < p ? v : undefined);
  for (let i = 0; i < 20000; i++) {
    const day = {
      heart_rate_variability: maybe(0.9, 10 + rnd() * 120),
      resting_heart_rate: maybe(0.85, 38 + rnd() * 50),
      sleep_hours: maybe(0.85, rnd() * 11),
      wrist_temperature: maybe(0.7, 33 + rnd() * 5),
      blood_oxygen: maybe(0.7, 85 + rnd() * 15),
      heart_rate: maybe(0.8, 45 + rnd() * 90),
    };
    const baseHRV = maybe(0.95, 20 + rnd() * 90);
    const baseRHR = maybe(0.9, 45 + rnd() * 25);
    const sleepTarget = 6.5 + rnd() * 3;
    const baseWristTemp = maybe(0.8, 33 + rnd() * 4);
    const baseHR = maybe(0.85, 55 + rnd() * 30);
    const args = [day, baseHRV, baseRHR, sleepTarget, baseWristTemp, baseHR];
    assert.equal(computeDay(...args), computeDayReference(...args),
      `mismatch on iteration ${i}: ${JSON.stringify(args)}`);
  }
});

test('computeDay handles the edge inputs the fuzz is unlikely to hit', () => {
  const cases = [
    [{}, 50, 60, 8, 34, 70],
    [{ heart_rate_variability: 50 }, null, 60, 8, 34, 70],
    [{ heart_rate_variability: 0 }, 50, 60, 8, 34, 70],
    [{ heart_rate_variability: 50, resting_heart_rate: 0 }, 50, 60, 8, 34, 70],
    [{ heart_rate_variability: 50, sleep_hours: 0 }, 50, 60, 8, 34, 70],
    [{ heart_rate_variability: 50, blood_oxygen: 0 }, 50, 60, 8, 34, 70],
    [{ heart_rate_variability: 50, wrist_temperature: 0 }, 50, 60, 8, 0, 70],
    [{ heart_rate_variability: 999 }, 50, 60, 8, 34, 70],
  ];
  for (const args of cases) {
    assert.equal(computeDay(...args), computeDayReference(...args), JSON.stringify(args));
  }
});

test('personalSleepTarget matches the pre-extraction implementation', () => {
  const rnd = lcg(4242);
  for (let i = 0; i < 2000; i++) {
    const days = Array.from({ length: Math.floor(rnd() * 20) }, () => ({
      heart_rate_variability: rnd() < 0.8 ? 20 + rnd() * 80 : undefined,
      sleep_hours: rnd() < 0.8 ? rnd() * 11 : undefined,
    }));
    assert.deepEqual(personalSleepTarget(days), personalSleepTargetReference(days),
      `mismatch on iteration ${i}`);
  }
});

test('personalSleepTarget survives an empty or absent day list', () => {
  assert.deepEqual(personalSleepTarget([]), { target: 8, learned: false });
  assert.deepEqual(personalSleepTarget(undefined), { target: 8, learned: false });
});

// ---------------------------------------------------------------------------
// The factor table is the score
// ---------------------------------------------------------------------------

test('the weights sum to exactly 1', () => {
  const total = RECOVERY_FACTORS.reduce((s, f) => s + f.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});

test('exactly one factor is required, and it is the one without which there is no baseline', () => {
  const required = RECOVERY_FACTORS.filter(f => f.required);
  assert.equal(required.length, 1);
  assert.equal(required[0].key, 'hrv');
});

test('factor keys are unique', () => {
  assert.equal(new Set(RECOVERY_FACTORS.map(f => f.key)).size, RECOVERY_FACTORS.length);
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

const FULL_DAY = {
  heart_rate_variability: 50, resting_heart_rate: 60, sleep_hours: 8,
  wrist_temperature: 34, blood_oxygen: 98, heart_rate: 70,
};
const BASE = { hrv: 55, rhr: 58, sleepTarget: 8, wristTemp: 34, hr: 68 };

test('the drivers reported add up to the score they explain', () => {
  const { score, factors } = recoveryDrivers(FULL_DAY, BASE);
  const summed = factors.reduce((s, f) => s + f.points, 0);
  // Rounding budget: six factors each rounded to one decimal (<= 0.3 total)
  // plus computeDay's own rounding to a whole number (<= 0.5). Anything beyond
  // that is real drift between the decomposition and the score.
  assert.ok(Math.abs(summed - score) <= 0.8,
    `factors sum to ${summed} but the score is ${score}`);
});

test('the sum still matches the score on a day with missing sensors', () => {
  const { score, factors } = recoveryDrivers(
    { heart_rate_variability: 50, sleep_hours: 7 }, BASE);
  const summed = factors.reduce((s, f) => s + f.points, 0);
  assert.ok(Math.abs(summed - score) <= 0.8);
});

// The decomposition has to hold for every athlete, not the two days that got
// hand-picked as fixtures.
test('the decomposition sums to the score across 5000 random days', () => {
  const rnd = lcg(99991);
  for (let i = 0; i < 5000; i++) {
    const day = {
      heart_rate_variability: 10 + rnd() * 120,
      resting_heart_rate: rnd() < 0.85 ? 38 + rnd() * 50 : undefined,
      sleep_hours: rnd() < 0.85 ? rnd() * 11 : undefined,
      wrist_temperature: rnd() < 0.7 ? 33 + rnd() * 5 : undefined,
      blood_oxygen: rnd() < 0.7 ? 85 + rnd() * 15 : undefined,
      heart_rate: rnd() < 0.8 ? 45 + rnd() * 90 : undefined,
    };
    const base = {
      hrv: 20 + rnd() * 90, rhr: 45 + rnd() * 25, sleepTarget: 6.5 + rnd() * 3,
      wristTemp: 33 + rnd() * 4, hr: 55 + rnd() * 30,
    };
    const { score, factors } = recoveryDrivers(day, base);
    const summed = factors.reduce((s, f) => s + f.points, 0);
    // The 99 cap legitimately breaks the sum on an exceptional day: the score
    // is truncated where the factors are not.
    if (score >= 99) continue;
    assert.ok(Math.abs(summed - score) <= 0.8,
      `iteration ${i}: factors sum to ${summed}, score is ${score}`);
  }
});

test('factors are ranked by what they cost, not by their weight', () => {
  // HRV carries the largest weight but is above baseline here; sleep is the
  // one genuinely dragging the score down.
  const { factors } = recoveryDrivers(
    { ...FULL_DAY, heart_rate_variability: 200, sleep_hours: 3 }, BASE);
  assert.equal(factors[0].key, 'sleep',
    `expected sleep to lead, got ${factors.map(f => f.key).join(',')}`);
});

test('costs are ordered descending', () => {
  const { factors } = recoveryDrivers(FULL_DAY, BASE);
  for (let i = 1; i < factors.length; i++) {
    assert.ok(factors[i - 1].cost >= factors[i].cost - 0.05,
      `cost ordering broken at ${factors[i].key}`);
  }
});

test('no factor can cost more than its own weight allows', () => {
  const { factors } = recoveryDrivers({ heart_rate_variability: 1 }, BASE);
  for (const f of factors) {
    assert.ok(f.cost <= f.maxPoints + 0.05, `${f.key} cost ${f.cost} exceeds max ${f.maxPoints}`);
    assert.ok(f.points >= -0.05, `${f.key} contributed negative points`);
  }
});

// The trap this module exists to avoid: an absent sensor scores 0.8, and
// reporting that as a measurement would attribute points to data that was
// never collected.
test('an unrecorded factor is flagged rather than presented as a reading', () => {
  const { factors, unmeasured } = recoveryDrivers({ heart_rate_variability: 50 }, BASE);
  assert.ok(unmeasured.includes('spo2'));
  const spo2 = factors.find(f => f.key === 'spo2');
  assert.equal(spo2.measured, false);
  assert.equal(spo2.reading, null);
  assert.equal(spo2.points, Math.round(MISSING_FALLBACK * spo2.maxPoints * 10) / 10);
});

test('a recorded factor is marked measured and carries its reading', () => {
  const { factors, unmeasured } = recoveryDrivers(FULL_DAY, BASE);
  assert.deepEqual(unmeasured, []);
  const sleep = factors.find(f => f.key === 'sleep');
  assert.equal(sleep.measured, true);
  assert.equal(sleep.reading, 8);
  assert.equal(sleep.baseline, 8);
});

test('without HRV there is no decomposition at all, not a decomposition of nothing', () => {
  assert.deepEqual(recoveryDrivers({ sleep_hours: 8 }, BASE), { score: null, factors: [], unmeasured: [] });
  assert.deepEqual(recoveryDrivers({ heart_rate_variability: 50 }, {}), { score: null, factors: [], unmeasured: [] });
});

test('the score a decomposition reports is the score computeDay returns', () => {
  const { score } = recoveryDrivers(FULL_DAY, BASE);
  assert.equal(score, computeDay(FULL_DAY, BASE.hrv, BASE.rhr, BASE.sleepTarget, BASE.wristTemp, BASE.hr));
});

test('each factor states which direction helps it', () => {
  const { factors } = recoveryDrivers(FULL_DAY, BASE);
  const dir = Object.fromEntries(factors.map(f => [f.key, f.betterWhen]));
  assert.equal(dir.sleep, 'higher');
  assert.equal(dir.hrv, 'higher');
  assert.equal(dir.rhr, 'lower', 'a resting heart rate above baseline is the bad direction');
  assert.equal(dir.wristTemp, 'lower');
});

test('the score never reaches 100, whatever the readings', () => {
  const perfect = {
    heart_rate_variability: 10000, resting_heart_rate: 1, sleep_hours: 24,
    wrist_temperature: 34, blood_oxygen: 100, heart_rate: 1,
  };
  assert.ok(computeDay(perfect, 50, 60, 8, 34, 70) <= SCORE_CAP);
});
