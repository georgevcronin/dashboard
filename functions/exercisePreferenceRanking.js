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

// The actual point-scoring comparison, taking already-computed
// frequency/trend numbers rather than lifts — split out from
// resolveImplicitWinner so a bulk-import seed (which compares many pairs
// across the same handful of exercises) can compute each exercise's
// frequency/trend once and reuse it, instead of re-scanning the full lift
// history per pair. Two independent signals, each a simple point: higher
// recency-weighted frequency scores a point; a real (non-null) e1RM
// improvement trend beats a flat/negative/no-data one. Deliberately NOT a
// weighted sum of the two raw numbers — they're on incomparable scales (a
// frequency score of ~3 vs a trend slope of ~0.05 kg/day), so summing them
// would let whichever factor happens to have larger magnitude silently
// dominate. A tie (no signal either way, or one point each) returns null —
// "not enough information to nudge," not a coin flip.
function resolveImplicitWinnerFromScores(nameA, nameB, freqA, freqB, trendA, trendB) {
  let pointsA = 0, pointsB = 0;

  if (freqA > freqB) pointsA++; else if (freqB > freqA) pointsB++;

  if (trendA != null && trendB == null) pointsA++;
  else if (trendB != null && trendA == null) pointsB++;
  else if (trendA != null && trendB != null) {
    if (trendA > trendB) pointsA++; else if (trendB > trendA) pointsB++;
  }

  if (pointsA > pointsB) return nameA;
  if (pointsB > pointsA) return nameB;
  return null;
}

// Decides which of two exercises implicitly "wins" when a real comparison
// was skipped (or none has happened yet) — the finish-workout skip
// fallback, one pair at a time. seedRatingsFromImport below runs the same
// resolveImplicitWinnerFromScores logic against precomputed scores instead,
// for the many-pairs-at-once bulk-import case.
function resolveImplicitWinner(lifts, nameA, nameB, now) {
  return resolveImplicitWinnerFromScores(
    nameA, nameB,
    recencyWeightedFrequency(lifts, nameA, now), recencyWeightedFrequency(lifts, nameB, now),
    exerciseE1rmTrend(lifts, nameA), exerciseE1rmTrend(lifts, nameB),
  );
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

// Pre-seeds ratings from a bulk workout-history import (FEATURES.md #142:
// "pre-seed the ranked order from import frequency before any real
// comparisons occur"). A no-op if any rating already exists — "before any
// real comparisons occur" means this runs at most once, the first time an
// account gets bulk data; re-running it against a later import could
// silently override real Elo progress an exercise has accumulated since
// from actual votes. Groups the account's logged exercises by shared
// primary muscle and runs resolveImplicitWinnerFromScores across every pair
// within each group — same "what counts as preferred" rule the finish-
// workout skip fallback uses, just applied to many pairs at once.
// Frequency/trend are computed once per exercise up front rather than once
// per pair (a name can appear in several muscle groups' pair lists), which
// keeps this roughly linear in lift count rather than quadratic in it.
function seedRatingsFromImport(existingRatings, lifts, now) {
  if (Object.keys(existingRatings).length > 0) return existingRatings;

  const names = [...new Set(lifts.map(l => l.exercise).filter(Boolean))];
  const freq = {}, trend = {};
  for (const name of names) {
    freq[name] = recencyWeightedFrequency(lifts, name, now);
    trend[name] = exerciseE1rmTrend(lifts, name);
  }

  const byMuscle = {};
  for (const name of names) {
    for (const muscle of primaryMusclesOf(name)) (byMuscle[muscle] = byMuscle[muscle] || []).push(name);
  }

  let ratings = {};
  for (const group of Object.values(byMuscle)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const winner = resolveImplicitWinnerFromScores(a, b, freq[a], freq[b], trend[a], trend[b]);
        if (!winner) continue;
        ratings = applyComparison(ratings, winner, winner === a ? b : a, { implicit: true });
      }
    }
  }
  return ratings;
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
  exerciseE1rmTrend, resolveImplicitWinner, detectComparisonCandidates,
  seedRatingsFromImport, rankExercises,
};
