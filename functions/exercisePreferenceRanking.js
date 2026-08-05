// Ranked (not flat) exercise preferences — Phase 7 of
// MASTER_IMPLEMENTATION_PLAN.md. A per-user Elo-style rating per exercise,
// updated by real pairwise comparisons ("X vs Y, which do you prefer?",
// prompted on the finish-workout screen) and, at smaller magnitude, by
// implicit signals (recency-weighted frequency, e1RM improvement trend)
// when a comparison is skipped or hasn't happened yet. Reuses
// strengthStandards.js's e1rmTrendSlope rather than a second trend model —
// see its own doc comment for why it already returns exactly "improving or
// no signal," which is what "improvement" as a ranking factor means here.
const { e1rmTrendSlope, estimate1RM } = require('./strengthStandards');
const { findExercise, musclesForExercise } = require('./muscleTaxonomy');

const DEFAULT_RATING = 1500;
// A real vote should move the needle much more than a same-signal implicit
// nudge — otherwise a handful of ordinary training sessions could outrank a
// deliberate answer. 4x is the same ratio FAVORITE_EXERCISE_BONUS (15) sits
// under LOGGED_EXERCISE_BONUS (40) in weeklyPlanner.js: real behaviour/
// intent outweighs a softer signal, not just nudges around it.
const K_EXPLICIT = 32;
const K_IMPLICIT = 8;

// Exponential decay so a set from 30 days ago counts half as much as one
// today — matches the 7/14/30-day windows the muscle-comparison feature
// already uses elsewhere in the app (functions/index.js's /compare), not a
// number invented fresh for this feature.
const RECENCY_HALF_LIFE_DAYS = 30;

function ratingFor(ratings, name) {
  return ratings[name]?.rating ?? DEFAULT_RATING;
}

// Standard Elo pairwise update. scoreWinner is always 1 here (no draws — a
// comparison always names a preferred exercise; a "skip" either produces an
// implicit winner via resolveImplicitComparison or no update at all, never
// a 0.5/0.5 split). k is the only thing that distinguishes an explicit vote
// from an implicit nudge — same math either way.
function eloUpdate(ratingWinner, ratingLoser, k) {
  const expectedWinner = 1 / (1 + Math.pow(10, (ratingLoser - ratingWinner) / 400));
  const delta = k * (1 - expectedWinner);
  return { winner: ratingWinner + delta, loser: ratingLoser - delta };
}

// Applies one comparison (explicit or implicit) to a ratings map, returning
// a new map — never mutates the one passed in, same convention as
// fatigue.js's simulation functions. Missing entries default to
// DEFAULT_RATING rather than requiring pre-seeding every exercise.
function applyComparison(ratings, winnerName, loserName, { implicit = false } = {}) {
  const k = implicit ? K_IMPLICIT : K_EXPLICIT;
  const { winner, loser } = eloUpdate(ratingFor(ratings, winnerName), ratingFor(ratings, loserName), k);
  const winnerComparisons = (ratings[winnerName]?.comparisons ?? 0) + 1;
  const loserComparisons = (ratings[loserName]?.comparisons ?? 0) + 1;
  return {
    ...ratings,
    [winnerName]: { rating: winner, comparisons: winnerComparisons },
    [loserName]: { rating: loser, comparisons: loserComparisons },
  };
}

// Distinct training days for the exercise, each weighted by how long ago it
// was — counts days, not sets, so a 5-set day doesn't outweigh a 1-set day
// on "how often do you reach for this." `now` is a param (not Date.now())
// so this stays testable without mocking the clock.
function recencyWeightedFrequency(lifts, exerciseName, now) {
  const days = new Set();
  for (const l of lifts) if (l.exercise === exerciseName && l.date) days.add(l.date);
  let score = 0;
  for (const dateStr of days) {
    const ageDays = (now - new Date(dateStr).getTime()) / 86_400_000;
    if (ageDays < 0) continue; // future-dated entries never happen in practice; skip rather than inflate
    score += Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  }
  return score;
}

function rawFrequency(lifts, exerciseName) {
  const days = new Set();
  for (const l of lifts) if (l.exercise === exerciseName && l.date) days.add(l.date);
  return days.size;
}

// This exercise's own e1RM trend slope (kg/day, improving-only — see the
// module comment), built from its own logged history the same way
// strengthStandards.js's own callers do (one point per day's best set).
function exerciseE1rmTrend(lifts, exerciseName) {
  const entries = lifts
    .filter(l => l.exercise === exerciseName)
    .map(l => ({ date: l.date, raw: estimate1RM(l.kg, l.reps) }));
  return e1rmTrendSlope(entries);
}

// Decides which of two exercises implicitly "wins" when a real comparison
// was skipped (or none has happened yet) — used both as the finish-workout
// skip fallback and to seed ratings from a bulk history import (same
// function either way, not two copies of "what counts as preferred").
//
// Two independent signals, each a simple point: higher recency-weighted
// frequency scores a point; a real (non-null) e1RM improvement trend beats
// a flat/negative/no-data one. Deliberately NOT a weighted sum of the two
// raw numbers — they're on incomparable scales (a frequency score of ~3 vs
// a trend slope of ~0.05 kg/day), so summing them would let whichever
// factor happens to have larger magnitude silently dominate. A tie (no
// signal either way, or one point each) returns null — "not enough
// information to nudge," not a coin flip.
function resolveImplicitWinner(lifts, nameA, nameB, now) {
  let pointsA = 0, pointsB = 0;

  const freqA = recencyWeightedFrequency(lifts, nameA, now);
  const freqB = recencyWeightedFrequency(lifts, nameB, now);
  if (freqA > freqB) pointsA++; else if (freqB > freqA) pointsB++;

  const trendA = exerciseE1rmTrend(lifts, nameA);
  const trendB = exerciseE1rmTrend(lifts, nameB);
  if (trendA != null && trendB == null) pointsA++;
  else if (trendB != null && trendA == null) pointsB++;
  else if (trendA != null && trendB != null) {
    if (trendA > trendB) pointsA++; else if (trendB > trendA) pointsB++;
  }

  if (pointsA > pointsB) return nameA;
  if (pointsB > pointsA) return nameB;
  return null;
}

function primaryMusclesOf(exerciseName) {
  return findExercise(exerciseName)?.primary || musclesForExercise(exerciseName);
}

// Finish-workout comparison trigger: for each primary muscle trained by an
// exercise in the just-logged session, find a *different* exercise sharing
// that primary muscle from the athlete's prior history (excluding this
// session's own new entries), and pair them up — one candidate per
// overlapping primary muscle, not one per exercise-pair combination (so a
// session with 3 exercises sharing the same muscle doesn't fire 3 near-
// identical prompts). Ties on "most relevant prior exercise for this
// muscle" go to whichever was logged most recently, matching how "recent"
// already reads as "relevant" elsewhere in the app (favourites, staleness).
function detectComparisonCandidates(newLiftEntries, priorLifts) {
  const newExerciseNames = [...new Set(newLiftEntries.map(l => l.exercise))];
  const lastLoggedDate = {};
  for (const l of priorLifts) {
    if (!l.date) continue;
    if (!lastLoggedDate[l.exercise] || l.date > lastLoggedDate[l.exercise]) lastLoggedDate[l.exercise] = l.date;
  }
  const priorExerciseNames = Object.keys(lastLoggedDate);

  const seenMuscles = new Set();
  const candidates = [];
  for (const name of newExerciseNames) {
    for (const muscle of primaryMusclesOf(name)) {
      if (seenMuscles.has(muscle)) continue;
      let best = null;
      for (const priorName of priorExerciseNames) {
        if (priorName === name) continue;
        if (!primaryMusclesOf(priorName).includes(muscle)) continue;
        if (!best || lastLoggedDate[priorName] > lastLoggedDate[best]) best = priorName;
      }
      if (best) {
        seenMuscles.add(muscle);
        candidates.push({ muscle, a: name, b: best });
      }
    }
  }
  return candidates;
}

// Sorted highest-rated first — what the ranked Settings display and the
// public profile list both read directly.
function rankExercises(ratings) {
  return Object.entries(ratings)
    .map(([name, r]) => ({ name, rating: r.rating, comparisons: r.comparisons || 0 }))
    .sort((a, b) => b.rating - a.rating);
}

module.exports = {
  DEFAULT_RATING, K_EXPLICIT, K_IMPLICIT, RECENCY_HALF_LIFE_DAYS,
  eloUpdate, applyComparison, recencyWeightedFrequency, rawFrequency,
  exerciseE1rmTrend, resolveImplicitWinner, detectComparisonCandidates, rankExercises,
};
