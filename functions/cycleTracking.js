// Deterministic, lightweight menstrual-cycle calibration for the recovery
// engine. Deliberately NOT fertility-window prediction and NOT a symptom
// log — the only subjective input is `heaviness`, self-rated training-
// impact severity per cycle (not flow volume), logged once (typically at
// period-end) and correctable afterward. Everything here is pure
// arithmetic over the user's own logged start/end timestamps; no ML, no
// external cycle-phase model.
//
// rirOffset's +-1 bound is deliberately in the same order of magnitude as
// the qualitative guidance found across cycle-coaching sources (a workout
// that reads RPE 8 in the follicular phase commonly reads RPE 9 in the
// luteal phase — roughly a 1-unit RPE/RIR shift) rather than an invented
// number: there's no established literature giving a specific numeric
// RIR/RPE shift for cycle phase, and the underlying research on menstrual-
// phase effects on strength performance is itself inconsistent. Individual
// variation is the one point every source agrees on, hence this is scaled
// down by `confidence` (this user's own logged consistency) rather than
// applied as a blanket rule.

const DEFAULT_CYCLE_LEN_DAYS = 28;
const DEFAULT_PERIOD_LEN_DAYS = 5;
const MIN_CYCLE_LEN_DAYS = 21;
const MAX_CYCLE_LEN_DAYS = 40;
const MAX_AMPLITUDE = 0.3; // swing radius around 1.0 at full confidence + max heaviness
const FACTOR_MIN = 0.7;
const FACTOR_MAX = 1.3; // same order of magnitude as computeCNSFatigue's recoveryFactor clamp

const DAY_MS = 86_400_000;

// Parses a plain YYYY-MM-DD date-only string (from an <input type="date">)
// into a timestamp that reads back as the *same calendar date* in virtually
// any timezone. `new Date(str)` parses a date-only string as UTC midnight,
// which rolls back to "the day before" once formatted in any timezone
// behind UTC — a real bug for any user west of UTC. Anchoring to noon UTC
// instead gives +-12h of slack, covering every real-world UTC offset
// (-12..+14) except the handful of Pacific-island zones past +12.
// ponytail: doesn't handle those edge-case offsets — a per-user timezone
// field would, if it ever matters for this user base.
function parseDateOnly(str) {
  const ts = new Date(`${str}T12:00:00Z`).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

// Average cycle length from consecutive start-to-start gaps. Needs >=2
// starts to say anything; with 0 or 1 the population default is the only
// honest answer, so it's returned rather than a guess dressed up as data.
function averageCycleLengthDays(cycleLog) {
  const starts = [...(cycleLog || [])].map(c => c.startTs).sort((a, b) => a - b);
  if (starts.length < 2) return DEFAULT_CYCLE_LEN_DAYS;
  const gaps = [];
  for (let i = 1; i < starts.length; i++) gaps.push((starts[i] - starts[i - 1]) / DAY_MS);
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  // Clamp against mis-taps / a single wildly-off gap distorting the whole
  // curve — same defensive posture as every clamp elsewhere in the fatigue engine.
  return Math.max(MIN_CYCLE_LEN_DAYS, Math.min(MAX_CYCLE_LEN_DAYS, avg));
}

// Average period (bleed) length from closed entries, used only to decide
// whether an *estimated* (no open entry) day-count still counts as "on
// period" for display. Independent default/clamp from cycle length since
// these are different quantities.
function averagePeriodLengthDays(cycleLog) {
  const closed = (cycleLog || []).filter(c => c.endTs != null);
  const lens = closed.map(c => (c.endTs - c.startTs) / DAY_MS).filter(d => d > 0);
  if (!lens.length) return DEFAULT_PERIOD_LEN_DAYS;
  const avg = lens.reduce((s, d) => s + d, 0) / lens.length;
  return Math.max(1, Math.min(10, avg));
}

// Current cycle-day estimate (day 1 = period start), handling all cases:
// an open entry (currently mid-period — real, observed data, applies
// regardless of `irregular` since it isn't a prediction), no open entry
// but a known last start (estimate forward via modulo — skipped entirely
// when `irregular` is true, since extrapolating from an average that
// doesn't hold for this user would be worse than saying nothing), or no
// data at all.
function currentCycleDay(cycleLog, now = Date.now(), irregular = false) {
  const log = cycleLog || [];
  const open = log.find(c => c.endTs == null);
  const avgLen = averageCycleLengthDays(log);
  if (open) {
    const d = Math.floor((now - open.startTs) / DAY_MS) + 1;
    return { cycleDay: Math.max(1, d), avgLen, onPeriod: true, lastStart: open.startTs };
  }
  const lastStart = log.length ? Math.max(...log.map(c => c.startTs)) : null;
  if (!lastStart || irregular) {
    return { cycleDay: null, avgLen, onPeriod: false, lastStart: lastStart || null };
  }
  const daysSince = Math.floor((now - lastStart) / DAY_MS);
  const cycleDay = (daysSince % Math.round(avgLen)) + 1;
  const periodLen = averagePeriodLengthDays(log);
  return { cycleDay, avgLen, onPeriod: cycleDay <= periodLen, lastStart };
}

// A single predicted next-period window (start+end), for a lightweight
// "what's coming" marker on the calendar — not a fertility-window model,
// just the same average-cycle-length extrapolation currentCycleDay already
// uses for cycleDay, turned into a date range instead of a day count. Null
// whenever that extrapolation shouldn't be trusted: currently mid-period
// (there's no "next" to predict, real data already covers today),
// irregular cycles (an average that doesn't hold for this user), or no
// prior start logged at all.
function predictedNextPeriod(cycleLog, now = Date.now(), irregular = false) {
  const log = cycleLog || [];
  if (log.some(c => c.endTs == null)) return null;
  if (irregular) return null;
  const lastStart = log.length ? Math.max(...log.map(c => c.startTs)) : null;
  if (!lastStart) return null;
  const startTs = lastStart + Math.round(averageCycleLengthDays(log)) * DAY_MS;
  const endTs = startTs + Math.round(averagePeriodLengthDays(log)) * DAY_MS;
  return { startTs, endTs };
}

// Heaviness average + variation (population stdev, since we're describing
// the full logged history, not sampling from a larger population) over
// closed cycles that actually have a rating. 0/1 data points: average
// falls back to the neutral midpoint (3 = moderate) rather than null, so
// downstream math always has a number; variation is 0 with <2 ratings
// (nothing to disagree with yet — confidence separately down-weights low
// data volume via n).
function heavinessStats(cycleLog) {
  const ratings = (cycleLog || []).map(c => c.heaviness).filter(h => h != null);
  if (!ratings.length) return { avgHeaviness: 3, variation: 0, n: 0 };
  const avgHeaviness = ratings.reduce((s, h) => s + h, 0) / ratings.length;
  if (ratings.length < 2) return { avgHeaviness, variation: 0, n: ratings.length };
  const variance = ratings.reduce((s, h) => s + (h - avgHeaviness) ** 2, 0) / ratings.length;
  return { avgHeaviness, variation: Math.sqrt(variance), n: ratings.length };
}

// How much of the theoretical max amplitude to actually apply. Two
// independent dampeners multiply together:
//   - dataPointsFactor: n/(n+2) — a smooth, saturating "how much evidence
//     do we have" curve. n=0 -> 0 (no calibration at all), n=1 -> 0.33,
//     n=4 -> 0.67, n=8 -> 0.8, asymptoting to 1. Chosen over a hard
//     min(1, n/N) cliff so early data contributes a little rather than
//     nothing-then-suddenly-everything at some arbitrary threshold.
//   - consistencyFactor: 1 - variation/2, clamped to [0,1]. Heaviness is
//     rated 1-5, so the maximum possible population stdev (two ratings at
//     opposite extremes) is 2 — at that ceiling consistencyFactor hits 0
//     and the cycle's effect is judged genuinely unpredictable, so no
//     directional swing is applied even with plenty of data.
function confidence(cycleLog) {
  const { variation, n } = heavinessStats(cycleLog);
  const dataPointsFactor = n / (n + 2);
  const consistencyFactor = Math.max(0, 1 - variation / 2);
  return dataPointsFactor * consistencyFactor;
}

// Single entry point everything else calls: recovery-hours personalization,
// the RIR nudge, and briefing copy all just want factor/rirOffset/cycleDay/
// onPeriod/confidence/avgHeaviness, not the intermediate math above.
//
// Phase curve: a single cosine over the full average cycle length, day 1
// (period start) at the "worst" extreme and the cycle midpoint at the
// "best" extreme — a defensible, minimal-parameter shape for "dips during
// menstruation, gradually recovers, peaks around the midpoint, gradually
// declines back toward the next period" without claiming to model any
// specific hormonal mechanism.
//
// factor > 1 means WORSE capacity (mirrors computeCNSFatigue's
// recoveryFactor: this feeds personalizedRecoveryHours as a multiplier on
// hours-to-recover, so >1 = takes longer to recover = more fatigued for
// longer; <1 = clears fatigue faster = more training headroom). rirOffset
// translates the same signal into a rep-in-reserve nudge (see header
// comment for the +-1 bound's grounding).
//
// learnedHeaviness (see the learning section below), when present,
// overrides the plain average-of-self-reports as the amplitude driver —
// `variation`/`confidence` still describe self-report consistency either
// way, since that's a distinct question ("how much does this affect you"
// vs "how consistently do you report the same answer").
function cyclePhaseFactor(cycleLog, now = Date.now(), irregular = false, learnedHeaviness = null) {
  const log = cycleLog || [];
  const { cycleDay, avgLen, onPeriod } = currentCycleDay(log, now, irregular);
  const { avgHeaviness: selfReportedAvg, variation } = heavinessStats(log);
  const avgHeaviness = learnedHeaviness != null ? learnedHeaviness : selfReportedAvg;
  const conf = confidence(log);

  if (cycleDay == null) {
    // No usable data yet (or irregular + no open entry) — untouched
    // baseline, exactly as if tracking were off.
    return { factor: 1, rirOffset: 0, cycleDay: null, onPeriod: false, confidence: 0, avgHeaviness: null, variation: null };
  }

  const theta = 2 * Math.PI * (cycleDay - 1) / avgLen;
  const heavinessMagnitude = (avgHeaviness - 1) / 4; // 1-5 scale -> 0-1
  const amplitude = MAX_AMPLITUDE * heavinessMagnitude * conf;
  const rawFactor = 1 + amplitude * Math.cos(theta);
  const factor = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, rawFactor));
  const rirOffset = Math.max(-1, Math.min(1, Math.round((factor - 1) * 4)));

  return { factor, rirOffset, cycleDay, onPeriod, confidence: conf, avgHeaviness, variation };
}

// Guards a retrospectively-logged period against overlapping one already in
// the log (open entries treated as ongoing to "now" for this check) — used
// by POST /cycle/retro so backfilled history can't double-count the same
// days for calibration.
function periodsOverlap(startTs, endTs, cycleLog) {
  return (cycleLog || []).some(c => startTs < (c.endTs ?? Infinity) && endTs > c.startTs);
}

// --- Learning the heaviness rating from actual training performance ---
//
// The picker (1-5) is only ever a starting point, per cycle — a self-
// report of expected impact. What actually drives the calibration over
// time is `profile.cycleHeavinessLearned`, a single persistent value
// nudged a little closer to objectively observed performance each time a
// period ends, the same shape as muscleSensitivity's soreness-based
// auto-calibration (functions/index.js POST /soreness): a "felt" self-
// report anchors a fresh estimate, then real outcomes gently correct it,
// never fully overwrite it, one observation at a time.

const HEAVINESS_MIN = 1, HEAVINESS_MAX = 5;
// A 50% volume-load drop during the period vs. this athlete's own
// baseline reads as maximum severity (5); no drop at all reads as no
// effect (1) — a defensible, round anchor rather than a fitted constant,
// consistent with this module's stated preference for simple arithmetic
// over anything resembling a trained model.
const VOLUME_DROP_FOR_MAX_SEVERITY = 0.5;
const BASELINE_WINDOW_DAYS = 60;

// Average total volume-load (kg*reps, the same unit computeMetabolicFatigue/
// computeStructuralFatigue use) per distinct training day inside
// [fromTs, toTs) — null when there were no training days in the window at
// all, so callers can tell "no effect observed" apart from "nothing to
// compare against." excludeWindows lets other periods' own days be kept
// out of what's supposed to be an *unaffected* baseline. liftTime mirrors
// fatigue.js's own `l.start || l.date` convention rather than importing
// that whole module for one line.
function avgVolumePerDay(lifts, fromTs, toTs, excludeWindows = []) {
  const byDay = {};
  for (const l of (lifts || [])) {
    const ts = new Date(l.start || l.date).getTime();
    if (!ts || ts < fromTs || ts >= toTs) continue;
    if (excludeWindows.some(([s, e]) => ts >= s && ts < e)) continue;
    const day = l.date || new Date(ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (+l.kg || 0) * (+l.reps || 0);
  }
  const days = Object.values(byDay);
  return days.length ? days.reduce((s, v) => s + v, 0) / days.length : null;
}

// Objective, 1-5-scaled "how much did training actually drop" for one
// closed cycle entry — average volume-load per training day during the
// period vs. the BASELINE_WINDOW_DAYS immediately before it started
// (excluding any other logged period's own days, so the baseline reflects
// unaffected training). Returns null when there isn't enough logged
// training in either window to compare, rather than guessing from silence.
function observedHeaviness(lifts, entry, cycleLog, baselineWindowDays = BASELINE_WINDOW_DAYS) {
  if (entry?.startTs == null || entry?.endTs == null) return null;
  const periodVol = avgVolumePerDay(lifts, entry.startTs, entry.endTs);
  if (periodVol == null) return null;
  const priorWindows = (cycleLog || [])
    .filter(c => c.id !== entry.id && c.endTs != null)
    .map(c => [c.startTs, c.endTs]);
  const baselineVol = avgVolumePerDay(lifts, entry.startTs - baselineWindowDays * DAY_MS, entry.startTs, priorWindows);
  if (!baselineVol) return null;
  const drop = Math.max(0, 1 - periodVol / baselineVol);
  return Math.max(HEAVINESS_MIN, Math.min(HEAVINESS_MAX, 1 + (drop / VOLUME_DROP_FOR_MAX_SEVERITY) * 4));
}

// Same gentle-nudge shape as muscleSensitivity: move 1/4 of the way (in
// ratio terms) toward what was actually observed, never jump straight to
// it — one closed period is one data point, not proof the prior estimate
// was wrong. `current` is the running learned value (or, on the very
// first cycle, the fresh self-reported pick, since there's nothing else
// to anchor to yet); `observed` is this cycle's observedHeaviness. A null
// observation (not enough training data to compare) is a no-op.
function nudgeLearnedHeaviness(current, observed) {
  if (observed == null || !current) return current;
  const ratio = observed / current;
  const updated = current * Math.pow(ratio, 0.25);
  return Math.round(Math.max(HEAVINESS_MIN, Math.min(HEAVINESS_MAX, updated)) * 100) / 100;
}

module.exports = {
  DEFAULT_CYCLE_LEN_DAYS, DEFAULT_PERIOD_LEN_DAYS,
  parseDateOnly,
  averageCycleLengthDays, averagePeriodLengthDays, currentCycleDay, predictedNextPeriod,
  heavinessStats, confidence, cyclePhaseFactor,
  avgVolumePerDay, observedHeaviness, nudgeLearnedHeaviness, periodsOverlap,
};
