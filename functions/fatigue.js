// Single canonical fatigue-calculation module. Previously these functions
// existed twice — once in functions/index.js, once hand-mirrored in
// src/app.jsx for instant client-side display ahead of a /summary round trip
// (see PR #17) — and had already drifted (different RECOVERY_H entries,
// different CNS-compound exercise sets, the muscle-attribution bugs described
// in functions/muscleTaxonomy.js). One implementation, imported by both.

const { RECOVERY_H, findExercise, musclesForExercise, isCompoundExercise } = require('./muscleTaxonomy');
const { e1rm: calcE1RM } = require('./strengthStandards');

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const liftTime = (l) => new Date(l.start || l.date).getTime();

// "Days since this muscle was last a genuine training focus" — a distinct
// signal from fatigue. Fatigue decays toward 0 regardless of whether that
// means "recovered and ready" or "neglected" — this answers the second
// question. PRIMARY targets only (not musclesForExercise's primary+secondary
// union): staleness is about whether a muscle was the actual focus of an
// exercise, not incidentally worked as a synergist.
//
// Detraining research: negligible measurable muscle loss in the first 1-2
// weeks without a stimulus; real hypertrophy decline doesn't set in until
// roughly 3-4+ weeks (systematic review evidence on resistance-training
// detraining timelines — strength holds up even longer). This return value
// is deliberately just the raw day count, not a judgment — weeklyPlanner.js's
// stalenessBoost() is where that timeline gets turned into a priority curve.
function computeMuscleLastTrainedDays(lifts) {
  const now = Date.now();
  const lastSeenMs = {};
  for (const l of (lifts || [])) {
    const entry = findExercise(l.exercise);
    if (!entry) continue;
    const t = liftTime(l);
    if (isNaN(t)) continue;
    for (const m of entry.primary || []) {
      if (!lastSeenMs[m] || t > lastSeenMs[m]) lastSeenMs[m] = t;
    }
  }
  const out = {};
  for (const [m, t] of Object.entries(lastSeenMs)) out[m] = (now - t) / 86_400_000;
  return out; // muscle -> days since last trained; absent key = never trained
}

// recoveryHours optionally overrides RECOVERY_H per-muscle — used to apply a
// per-athlete personalization (age, training experience) computed by the
// caller from profile data, without this module needing to know anything
// about profiles. Falls back to the base taxonomy table for any muscle the
// override doesn't cover.
function computeStructuralFatigue(lifts, musclePeaks, soreness = [], sensitivity = {}, recoveryHours = RECOVERY_H) {
  const now = Date.now();
  const scores = {};
  for (const l of (lifts || [])) {
    const hoursAgo = (now - liftTime(l)) / 3_600_000;
    if (hoursAgo > 336 || hoursAgo < 0) continue;
    const load = (l.kg || 0) * (l.reps || 1);
    for (const m of musclesForExercise(l.exercise)) {
      const hl = recoveryHours[m] || RECOVERY_H[m] || 72;
      const decay = Math.exp(-0.693 * hoursAgo / hl);
      scores[m] = (scores[m] || 0) + load * decay;
    }
  }
  const sorenessMap = {};
  soreness.filter(e => now - e.ts < 5 * 24 * 3600000)
    .forEach(e => { sorenessMap[e.muscle] = Math.max(sorenessMap[e.muscle] || 0, e.score); });
  const out = {};
  for (const [m, v] of Object.entries(scores)) {
    const soreAdj = sorenessMap[m] ? 1 + sorenessMap[m] / 20 : 1;
    const sensAdj = sensitivity[m] || 1.0;
    out[m] = Math.min(100, Math.round(v / (musclePeaks?.[m] || 2000) * 100 * soreAdj * sensAdj));
  }
  return out;
}

function computeCurrentFatigueScores(lifts, peaks, soreness = [], sensitivity = {}, recoveryHours = RECOVERY_H) {
  return computeStructuralFatigue(lifts, peaks, soreness, sensitivity, recoveryHours);
}

// Structural fatigue for every muscle a lift touches, evaluated at the
// moment immediately BEFORE that lift happened (using only earlier lifts) —
// used by strengthStandards.js's computeMuscleLevels to correct a session's
// e1RM for residual fatigue before comparing it against a different exercise
// (e.g. doing Preacher Curl shortly after a hard Barbell Curl session
// shouldn't make Preacher Curl look weaker than it really is). Same decay
// math and RECOVERY_H constants as computeStructuralFatigue, but a single
// chronological pass with a running per-muscle decay accumulator instead of
// re-summing the whole history at every point — computeStructuralFatigue
// itself is O(lifts) per call; calling it once per lift here would be
// O(lifts^2), which matters at the scale of a multi-year real account
// (8000+ lifts).
function fatigueTimeline(lifts, musclePeaks, recoveryHours = RECOVERY_H) {
  const withIndex = (lifts || [])
    .map((l, i) => ({ l, i, t: liftTime(l) }))
    .filter(x => !isNaN(x.t));
  const sorted = [...withIndex].sort((a, b) => a.t - b.t);

  const acc = {}; // muscle -> { value, lastMs } — decayed running load total
  const out = new Array(lifts.length).fill(null);
  for (const { l, i, t } of sorted) {
    const load = (l.kg || 0) * (l.reps || 1);
    const fatigueBefore = {};
    for (const m of musclesForExercise(l.exercise)) {
      const hl = recoveryHours[m] || RECOVERY_H[m] || 72;
      const state = acc[m];
      let decayedValue = 0;
      if (state) {
        const hoursSince = (t - state.lastMs) / 3_600_000;
        decayedValue = state.value * Math.exp(-0.693 * hoursSince / hl);
      }
      fatigueBefore[m] = Math.min(100, Math.round(decayedValue / (musclePeaks?.[m] || 2000) * 100));
      acc[m] = { value: decayedValue + load, lastMs: t };
    }
    out[i] = fatigueBefore;
  }
  return out; // index-aligned with the input lifts array; out[i][muscle] = fatigue (0-100) right before lifts[i]
}

// How far back to look for "peak daily load" when normalizing fatigue.
// Unbounded all-time meant a single old specialization day (e.g. a leg day
// stacking squat+leg press+extension+curl all on quads) permanently set a
// ceiling a lighter, spread-out full-body day's single quad exercise could
// never approach, silently suppressing that muscle's fatigue% forever
// regardless of how training style later changed — same failure mode
// already caught and fixed for strength-standard peaks (see
// strengthStandards.js's RECENT_AVERAGE_WINDOW_DAYS: "a real, steady,
// non-anomalous peak look[ed] like a near-2x outlier" there too). Same
// 90-day rationale: roughly a training block/mesocycle.
const PEAK_WINDOW_DAYS = 90;

// Peak single-day load per muscle within the last PEAK_WINDOW_DAYS, used as
// computeStructuralFatigue's normalization denominator ("100" = as hard as
// you've recently hit this muscle). Falls back to the all-time peak for any
// muscle with nothing in the recent window at all — e.g. one you haven't
// trained in months — rather than an undefined/zero denominator, same
// graceful-degradation shape as strengthStandards.js's recentBest.
function musclePeaksFromLifts(lifts) {
  const now = Date.now();
  const windowMs = PEAK_WINDOW_DAYS * 86_400_000;
  const byDate = {};
  for (const l of (lifts || [])) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }
  const recentPeaks = {};
  const allTimePeaks = {};
  for (const [date, dayLifts] of Object.entries(byDate)) {
    const t = new Date(date).getTime();
    const isRecent = !isNaN(t) && now - t <= windowMs;
    const day = {};
    for (const l of dayLifts) {
      const load = (l.kg || 0) * (l.reps || 1);
      for (const m of musclesForExercise(l.exercise)) day[m] = (day[m] || 0) + load;
    }
    for (const [m, v] of Object.entries(day)) {
      if (v > (allTimePeaks[m] || 0)) allTimePeaks[m] = v;
      if (isRecent && v > (recentPeaks[m] || 0)) recentPeaks[m] = v;
    }
  }
  const peaks = {};
  for (const m of new Set([...Object.keys(allTimePeaks), ...Object.keys(recentPeaks)])) {
    peaks[m] = recentPeaks[m] || allTimePeaks[m];
  }
  return peaks;
}

// Injury/niggle recovery is a taper, not a switch: a fresh injury takes a muscle
// fully offline, but as it heals, load should ramp back in rather than snapping
// from "banned" to "fully available" the moment someone marks it resolved.
// Illustrative recovery windows by self-reported severity, not medical guidance.
const INJURY_HEALING_DAYS = { mild: 10, moderate: 21, severe: 35 };
function injuryFatiguePenalty(injury, now = Date.now()) {
  const totalDays = INJURY_HEALING_DAYS[injury.severity] || INJURY_HEALING_DAYS.moderate;
  const elapsedDays = (now - injury.ts) / 864e5;
  return Math.max(0, Math.round(100 * (1 - elapsedDays / totalDays)));
}
// Merges active injuries into a structural-fatigue map as an artificial fatigue
// penalty — reuses the same 65% "avoid loading" ceiling everything else already
// respects, so a fresh injury (penalty 100) is fully offline and a nearly-healed
// one (penalty dropping below 65) naturally reopens without any separate
// binary offline-list mechanism.
function applyInjuryTaper(fatigue, injuries) {
  const out = { ...fatigue };
  const now = Date.now();
  for (const inj of (injuries || []).filter(i => !i.resolved)) {
    const penalty = injuryFatiguePenalty(inj, now);
    for (const m of (inj.muscles || [])) out[m] = Math.max(out[m] || 0, penalty);
  }
  return out;
}

// Acute:chronic workload ratio (Gabbett/Hulin) — 7-day load vs. 28-day weekly average.
// >1.5 signals overreach relative to your adapted baseline; 0.8-1.3 is the established
// "sweet spot" in the sports-science load-monitoring literature. Returns null with <28
// days of history since the chronic baseline isn't meaningful yet.
function computeACWR(lifts) {
  const now = Date.now();
  let acute = 0, chronic = 0;
  for (const l of (lifts || [])) {
    const daysAgo = (now - liftTime(l)) / 86_400_000;
    if (daysAgo < 0 || daysAgo > 28) continue;
    const load = (l.kg || 0) * (l.reps || 1);
    chronic += load;
    if (daysAgo <= 7) acute += load;
  }
  const chronicWeekly = chronic / 4;
  return chronicWeekly < 1 ? null : acute / chronicWeekly;
}

// Session-to-session estimated-1RM trend per exercise, most recent 2 sessions vs.
// the 2 before that. Positive = declining performance under similar loads — a direct
// performance-based fatigue signal, independent of volume or ACWR.
function computePerformanceTrend(lifts) {
  const byEx = {};
  for (const l of (lifts || [])) {
    if (!l.exercise || !l.kg || !l.reps) continue;
    const daysAgo = (Date.now() - liftTime(l)) / 86_400_000;
    if (daysAgo < 0 || daysAgo > 21) continue;
    const date = l.date || l.start;
    const e1rm = calcE1RM(l.kg, l.reps);
    // Lowercased so the same exercise logged via different sources (Hevy
    // import lowercases; other paths may not) doesn't silently split into
    // two untracked trend buckets.
    const key = l.exercise.toLowerCase();
    (byEx[key] = byEx[key] || {})[date] = Math.max((byEx[key] || {})[date] || 0, e1rm);
  }
  const decrements = [];
  for (const byDate of Object.values(byEx)) {
    const dates = Object.keys(byDate).sort();
    if (dates.length < 4) continue;
    const recentAvg = avg(dates.slice(-2).map(d => byDate[d]));
    const priorAvg = avg(dates.slice(-4, -2).map(d => byDate[d]));
    if (priorAvg > 0) decrements.push((priorAvg - recentAvg) / priorAvg);
  }
  return decrements.length ? avg(decrements) : null;
}

function computeMetabolicFatigue(lifts, carbsToday = 0) {
  const now = Date.now();
  let volume = 0;
  for (const l of (lifts || [])) {
    const hoursAgo = (now - liftTime(l)) / 3_600_000;
    if (hoursAgo > 48 || hoursAgo < 0) continue;
    const decay = Math.exp(-0.693 * hoursAgo / 12);
    volume += (l.kg || 0) * (l.reps || 1) * decay;
  }
  const carbReduction = Math.min(40, Math.floor(carbsToday / 50) * 10);
  const acuteScore = Math.max(0, Math.min(100, Math.round(volume / 500)) - carbReduction);

  const acwr = computeACWR(lifts);
  const acwrScore = acwr == null ? null : Math.max(0, Math.min(100, Math.round((acwr - 0.8) / (1.8 - 0.8) * 100)));

  const trend = computePerformanceTrend(lifts);
  const trendScore = trend == null ? null : Math.max(0, Math.min(100, Math.round(trend * 500)));

  // Blend: recent-volume/glycogen proxy stays primary, ACWR and performance-trend act as
  // corroborating systemic signals when there's enough history to compute them.
  const parts = [[acuteScore, 0.5], ...(acwrScore != null ? [[acwrScore, 0.3]] : []), ...(trendScore != null ? [[trendScore, 0.2]] : [])];
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight);
}

function computeCNSFatigue(lifts, sensitivity = 1.0, recoveryScore = null) {
  const now = Date.now();
  let score = 0;
  for (const l of (lifts || [])) {
    const hoursAgo = (now - liftTime(l)) / 3_600_000;
    if (hoursAgo > 96 || hoursAgo < 0) continue;
    if (!isCompoundExercise(l.exercise)) continue;
    const decay = Math.exp(-0.693 * hoursAgo / 36);
    score += (l.kg || 0) * (l.reps || 1) * decay;
  }
  let out = Math.min(100, Math.round(score / 5000 * 100 * sensitivity));
  if (recoveryScore != null) {
    // Poor HRV/RHR/sleep-derived recovery compounds true neuromuscular fatigue and good
    // recovery offsets it. Centered on 55 — the app's existing "steady" recovery threshold.
    const recoveryFactor = Math.max(0.7, Math.min(1.4, 1 + (55 - recoveryScore) / 110));
    out = Math.min(100, Math.round(out * recoveryFactor));
  }
  return out;
}

// Single-session CNS-load readout (Light/Moderate/Heavy/Max Effort badge) — a
// different granularity than computeCNSFatigue's multi-day decay, but now
// shares the same isCompoundExercise definition instead of a separately
// hand-copied, differently-scoped exercise list.
function cnsLoad(exercises) {
  let score = 0;
  for (const ex of (exercises || [])) {
    const mult = isCompoundExercise(ex.name) ? 2.2 : 1;
    for (const s of ex.sets) if (s.type !== 'W' && s.done && +s.kg > 0) score += +s.kg * (+s.reps || 1) * mult;
  }
  if (score < 3000) return { label: 'Light', color: 'var(--forest)' };
  if (score < 9000) return { label: 'Moderate', color: 'var(--gold)' };
  if (score < 20000) return { label: 'Heavy', color: 'var(--ember)' };
  return { label: 'Max Effort', color: 'var(--red)' };
}

// "Continue doing what you already do": the full-body auto-pick session
// (functions/index.js) decides whether each bucket's 2nd exercise slot is
// another compound or an isolation accessory based on which the athlete has
// actually favored recently, rather than a fixed ratio. 90-day window
// matches PEAK_WINDOW_DAYS above — roughly a training block. Counted per
// (date, exercise) occurrence rather than per logged set, so a 5x5 day
// doesn't outweigh a session that logged the same exercise once.
function computeCompoundIsolationSplit(lifts, windowDays = 90) {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const seen = new Set();
  let compound = 0, isolation = 0;
  for (const l of (lifts || [])) {
    if (!l.exercise) continue;
    const t = liftTime(l);
    if (isNaN(t) || t < cutoff) continue;
    const key = `${l.date}|${l.exercise.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isCompoundExercise(l.exercise)) compound++; else isolation++;
  }
  return { compound, isolation, total: compound + isolation };
}

module.exports = {
  computeStructuralFatigue, computeCurrentFatigueScores, musclePeaksFromLifts, fatigueTimeline,
  INJURY_HEALING_DAYS, injuryFatiguePenalty, applyInjuryTaper,
  computeACWR, computePerformanceTrend, computeMetabolicFatigue, computeCNSFatigue,
  cnsLoad, computeMuscleLastTrainedDays, computeCompoundIsolationSplit,
};
