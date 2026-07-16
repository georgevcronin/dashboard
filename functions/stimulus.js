// Per-session, per-muscle stimulus-adequacy score -- a different question
// from fatigue.js's recovery-timing metric (residual load decaying over
// time, normalized against a personal peak). This asks: for the sets
// logged so far this session, did each muscle get the right dose of hard
// (non-warmup) sets for a productive hypertrophy stimulus? 100 = optimal.
// Scores keep climbing linearly past 100 rather than capping there -- the
// whole point is to surface "you've gone past the useful dose," not hide
// it the way a 0-100 cap would.
//
// OPTIMAL_HARD_SETS_PER_SESSION is a single, deliberately simple target,
// not muscle-specific precision -- there's no single authoritative source
// with clean per-session (as opposed to per-week) set-count numbers for
// all 31 muscles this app tracks, so this stays one judgment call rather
// than fabricated per-muscle thresholds (same shape as fatigue.js's
// MAX_FATIGUE_1RM_DECREMENT). Landed on 4: it sits inside the commonly-
// cited ~3-5 hard-sets-per-muscle-per-session range where hypertrophy
// literature places the point of sharply diminishing within-session
// returns, and matches this app's own TRAINING_ETHOS (index.js) --
// "frequency over volume: fewer working sets per session, volume spread
// across the week rather than stacked into one session."
const OPTIMAL_HARD_SETS_PER_SESSION = 4;

const { musclesForExercise } = require('./muscleTaxonomy');

// exercises: the live session-logger shape ([{name, sets:[{type,done,...}]}]).
// Warmup-vs-working type only survives in this in-progress shape -- it's
// never persisted once a session is saved (see index.js's
// /session/complete, which drops `type` entirely) -- so this is
// necessarily a live, in-session readout, not something recomputable from
// historical lift data after the fact.
function computeSessionStimulus(exercises) {
  const hardSets = {};
  for (const ex of (exercises || [])) {
    for (const s of (ex.sets || [])) {
      if (s.type === 'W' || !s.done) continue;
      for (const m of musclesForExercise(ex.name)) hardSets[m] = (hardSets[m] || 0) + 1;
    }
  }
  const out = {};
  for (const [m, count] of Object.entries(hardSets)) {
    out[m] = Math.round((count / OPTIMAL_HARD_SETS_PER_SESSION) * 100);
  }
  return out;
}

module.exports = { computeSessionStimulus, OPTIMAL_HARD_SETS_PER_SESSION };
