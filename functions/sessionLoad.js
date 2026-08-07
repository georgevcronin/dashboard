// #11: a single derived "session load" number — a Strava-Relative-Effort-
// style headline figure for one workout, built entirely from adaptation.js's
// existing per-set stimulus math (volumeResponsePct x rirEffectiveness) and
// setRir's RIR fallback. No new physiology, no second RIR-guessing rule.
//
// Deliberately a different question from sessionStimulusScore (adaptation.js):
// that's a 0-1 per-exercise-instance figure feeding the per-muscle adaptation
// curve. This aggregates every exercise trained in one session into one 0-100
// whole-session number a person can actually react to ("how hard was that").
//
// 0-100 is a relative scale, not an absolute physiological unit — a "70" only
// means something next to this same athlete's own recent sessions (see
// sessionLoadDelta), the way Strava's Relative Effort does.

const { volumeResponsePct, rirEffectiveness, setRir } = require('./adaptation');

// Calibrated so a genuinely hard, high-volume session (6 exercises, 4 sets
// each, RIR ~1) lands around 80; a solid ordinary session (5 exercises, 3
// sets, RIR ~2) lands closer to 40-45. Leaves headroom above for real
// outlier days rather than clipping every hard session to the same ceiling.
const SCALE_DIVISOR = 4;

// sessionLifts: every logged set from ONE session (one date, any number of
// exercises) — e.g. db.lifts.filter(l => l.date === someDate).
function sessionLoadScore(sessionLifts) {
  if (!sessionLifts || !sessionLifts.length) return null;

  const byExercise = {};
  for (const l of sessionLifts) {
    if (!l.exercise) continue;
    (byExercise[l.exercise] ||= []).push(l);
  }
  const exercises = Object.values(byExercise);
  if (!exercises.length) return null;

  const total = exercises.reduce((sum, sets) => {
    const avgRIR = sets.reduce((acc, l) => acc + setRir(l), 0) / sets.length;
    return sum + volumeResponsePct(sets.length) * rirEffectiveness(avgRIR);
  }, 0);

  return Math.round(Math.min(100, (total / SCALE_DIVISOR) * 100));
}

// Delta framing against a trailing average of the athlete's own recent
// sessions — "harder/easier than your last N", not a global scale, since a
// given score only makes sense relative to this person's own history.
function sessionLoadDelta(currentScore, recentScores) {
  if (currentScore == null) return null;
  const history = (recentScores || []).filter(v => v != null);
  if (!history.length) return null;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return { avg: Math.round(avg), delta: Math.round(currentScore - avg) };
}

module.exports = { sessionLoadScore, sessionLoadDelta, SCALE_DIVISOR };
