// Continuous per-muscle adaptation/atrophy model — revived from an earlier
// design (git show 05e09b8^:src/app.jsx, deleted in the "Rewrite UI as
// Press" frontend rewrite and never ported forward). Answers a genuinely
// different question than functions/fatigue.js (residual tissue-damage decay,
// toward 0 regardless of training quality) or the old flat per-session
// Stimulus score (hard sets this session ÷ a fixed target): "given real
// training history, how much productive tension stimulus is currently
// 'banked' for this muscle, and where is it headed if nothing more is done."
//
// Deliberately no cross-import from fatigue.js — those stay fully decoupled
// systems by design; structural fatigue has no stimulus attached to it.
//
// Model: every session-instance of an exercise contributes a stimulus score
// (set count + proximity-to-failure), which produces a gamma-shaped
// "adaptation curve" peaking 48h post-workout. Curves from different
// sessions stack (sum), so frequent small sessions accumulate real weekly
// stimulus even though any single session looks under-dosed in isolation —
// the actual shape of a frequency-first program, not a per-session split
// program. Past "now," a straight-line atrophy projection shows where that
// stacked level is headed with no further training, at a rate calibrated
// from the athlete's own real detraining gaps where available.

const { findExercise, musclesForExercise } = require('./muscleTaxonomy');
const { e1rm } = require('./strengthStandards');

// Secondary/assistor muscles get real but distinctly lesser credit than the
// actual primary target of a session — same reasoning and number as
// stimulus.js's SECONDARY_STIMULUS_WEIGHT (that module is being retired;
// this is its sole surviving home). A lat row's biceps assist but aren't the
// prime mover, so shouldn't accumulate adaptation as if they were.
const SECONDARY_MUSCLE_WEIGHT = 0.5;

// Niv Zinder RIR effectiveness: sigmoid, high at RIR 0, dip around RIR 5-6,
// moderate at RIR 10 — mechanical-tension-near-failure weighting.
function rirEffectiveness(rir) {
  const r = Math.max(0, Math.min(10, rir));
  if (r <= 5) return 0.18 + 0.82 * Math.pow(1 - r / 5, 1.5);
  return 0.18 + 0.14 * (r - 5) / 5;
}

// Rise-then-plateau response to hard-set count within one session-instance —
// diminishing returns past ~9 sets rather than a hard cap.
function volumeResponsePct(numSets) {
  const rise = 1 - Math.exp(-numSets / 3);
  const decay = Math.exp(-0.018 * Math.max(0, numSets - 9));
  return rise * decay;
}

// A single session-instance's stimulus score, 0-1 by construction (both
// factors saturate near 1.0) — the value adaptationCurve's peak equals.
function sessionStimulusScore(numSets, avgRIR) {
  return volumeResponsePct(numSets) * rirEffectiveness(avgRIR);
}

// Supercompensation gamma curve — normalized so peak = stimulusScore at
// t = 48h (k=3, θ=24). Zero at/before the stimulus itself.
function adaptationCurve(hoursAfter, stimulusScore) {
  if (hoursAfter <= 0) return 0;
  const PEAK_H = 48, THETA = 24;
  const peakRaw = PEAK_H * PEAK_H * Math.exp(-PEAK_H / THETA);
  return stimulusScore * (hoursAfter * hoursAfter * Math.exp(-hoursAfter / THETA)) / peakRaw;
}

// RIR per set: prefer an explicit l.rir (Hevy imports carry this), else
// derive from l.rpe using the same conversion index.js already applies to
// Hevy webhook data on ingest, else fall back to a moderate default (RIR 3)
// rather than guessing from load — unlike the old model, this app already
// has real logged RPE/RIR on most sets, so a load-based guess isn't worth
// the complexity it would add.
const DEFAULT_RIR = 3;
function setRir(l) {
  if (l.rir != null) return l.rir;
  if (l.rpe != null) return Math.max(0, 10 - l.rpe);
  return DEFAULT_RIR;
}

// Beyond this, a session-instance's gamma contribution is negligible
// (<0.03% of peak by day 14) — not worth including in the sum.
const CONTRIBUTION_WINDOW_H = 500;

// Groups lifts into session-instances (same exercise, same date), scores
// each, and attributes that score to the muscles it trains — primary at
// full weight, secondary at SECONDARY_MUSCLE_WEIGHT. Returns
// { [muscle]: [{ ms, contrib }] }, the raw material computeAdaptationLevel
// and computeAdaptationSeries sum gamma curves from.
function computeStimulusContributions(lifts) {
  const now = Date.now();
  const byExDate = {};
  for (const l of (lifts || [])) {
    if (!l.exercise || !l.date || !l.kg) continue;
    const liftMs = new Date(l.date).getTime();
    if (isNaN(liftMs) || (now - liftMs) / 3600000 > CONTRIBUTION_WINDOW_H) continue;
    const key = `${l.exercise}|${l.date}`;
    if (!byExDate[key]) byExDate[key] = { ms: liftMs, exercise: l.exercise, sets: [] };
    byExDate[key].sets.push(l);
  }

  const contributions = {};
  const addContrib = (muscle, ms, contrib) => {
    if (!contributions[muscle]) contributions[muscle] = [];
    contributions[muscle].push({ ms, contrib });
  };

  for (const { ms, exercise, sets } of Object.values(byExDate)) {
    const avgRIR = sets.reduce((acc, l) => acc + setRir(l), 0) / sets.length;
    const score = sessionStimulusScore(sets.length, avgRIR);
    const entry = findExercise(exercise);
    if (entry) {
      for (const m of entry.primary || []) addContrib(m, ms, score);
      for (const m of entry.secondary || []) addContrib(m, ms, score * SECONDARY_MUSCLE_WEIGHT);
    } else {
      // Custom/unrecognized names can't distinguish primary from secondary —
      // full credit for everything the keyword fallback matches.
      for (const m of musclesForExercise(exercise)) addContrib(m, ms, score);
    }
  }
  return contributions;
}

// Sum of every contribution's gamma curve value at one absolute point in
// time (atMs) — the muscle's total adaptation level at that moment.
function computeAdaptationLevel(muscleContributions, atMs) {
  let total = 0;
  for (const { ms, contrib } of (muscleContributions || [])) {
    const hoursAfter = (atMs - ms) / 3600000;
    if (hoursAfter > 0 && hoursAfter < CONTRIBUTION_WINDOW_H) total += adaptationCurve(hoursAfter, contrib);
  }
  return total;
}

// Per-muscle timeline series across a window (default: 14 days back to 3
// days forward, 6h steps) — one flat sample computation per muscle, not a
// per-render recomputation of computeStimulusContributions per step.
function computeAdaptationSeries(lifts, { windowStartH = -14 * 24, windowEndH = 3 * 24, stepH = 6 } = {}) {
  const now = Date.now();
  const contributions = computeStimulusContributions(lifts);
  const steps = Math.floor((windowEndH - windowStartH) / stepH) + 1;
  const result = {};
  for (const [muscle, muscleContribs] of Object.entries(contributions)) {
    const series = [];
    for (let i = 0; i < steps; i++) {
      const h = windowStartH + i * stepH;
      series.push({ h, adapt: computeAdaptationLevel(muscleContribs, now + h * 3600000) });
    }
    result[muscle] = series;
  }
  return result;
}

const DEFAULT_ATROPHY_RATE = 0.003; // adaptation units / hour

// Calibrates a personal atrophy rate from real training gaps in the
// athlete's own history: for each exercise, finds gaps of 14-90 days
// (gamma contribution is negligible by day 14, so any e1RM drop over a gap
// that long is attributable to genuine detraining, not supercompensation
// fading) where e1RM measurably declined, and returns the median
// decline-rate across all qualifying gaps. Returns null with fewer than 2
// qualifying gaps — not enough signal to trust a personal estimate over the
// default.
function estimateAtrophyRate(lifts) {
  const byExercise = {};
  for (const l of (lifts || [])) {
    if (!l.kg || !l.exercise || !l.date) continue;
    const est = e1rm(l.kg, l.reps);
    if (!est) continue;
    if (!byExercise[l.exercise]) byExercise[l.exercise] = {};
    if (byExercise[l.exercise][l.date] == null || est > byExercise[l.exercise][l.date]) {
      byExercise[l.exercise][l.date] = est;
    }
  }

  const rates = [];
  for (const sessions of Object.values(byExercise)) {
    const dates = Object.keys(sessions).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      const gapH = (new Date(dates[i + 1]) - new Date(dates[i])) / 3600000;
      if (gapH < 336 || gapH > 2160) continue; // 14-90 days
      const e1 = sessions[dates[i]], e2 = sessions[dates[i + 1]];
      if (e2 >= e1) continue; // held or improved — no detraining signal here
      const drop = (e1 - e2) / e1;
      if (drop > 0.5) continue; // likely a form/data change, not real detraining
      rates.push(drop / gapH);
    }
  }
  if (rates.length < 2) return null;
  rates.sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)];
}

module.exports = {
  rirEffectiveness, volumeResponsePct, sessionStimulusScore, adaptationCurve,
  computeStimulusContributions, computeAdaptationLevel, computeAdaptationSeries,
  estimateAtrophyRate, DEFAULT_ATROPHY_RATE, SECONDARY_MUSCLE_WEIGHT, DEFAULT_RIR,
};
