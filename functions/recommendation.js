// Explains decisions the engine has already made. Nothing here scores or
// selects anything: every number it reports is re-derived from the same
// weeklyPlanner.js terms that produced the recommendation, so an explanation
// can never disagree with the thing it's explaining. If this file ever needs
// its own copy of a threshold or a scoring rule, that's the bug — import it.
//
// Deliberately absent: predicted performance drop, extra recovery hours,
// stimulus deltas. Press has no calibrated model for any of those yet, and a
// plausible-looking number with nothing behind it is worse than no number.
// What's here is what the planner actually computes. See recommendationConfidence
// for why confidence is a level with named causes rather than a percentage.

const {
  stalenessBoost, focusGroups,
  FATIGUE_CEILING, FOCUS_MUSCLE_BONUS,
} = require('./weeklyPlanner');

// Two buckets closer than this are, for practical purposes, the same
// recommendation — priority scores run roughly 0-185 ((100 - fatigue), plus
// up to 60 staleness, plus a 25 focus bonus), so a handful of points is well
// inside the noise of a single logged session shifting one muscle's fatigue.
// Used only to admit the pick was near-arbitrary, never to change it.
const NEAR_TIE_MARGIN = 5;

// Always rank on the unclamped score. muscleFocus.freshness is clamped to 100
// for display, so three buckets that the planner separated clearly can all
// read as 100 and every comparison degenerates into "near tie". Falls back to
// freshness only for a guidance object predating the score field.
const rankOf = bucket => bucket?.score ?? bucket?.freshness ?? 0;

// Enough logged sessions for per-muscle fatigue to reflect a real routine
// rather than a handful of entries. Matches the spirit of the backend's own
// dataMature flag, which this defers to when it's supplied.
const CONFIDENT_SESSION_COUNT = 12;

const round = n => Math.round(n * 10) / 10;

// Breaks a single muscle's priority into the terms weeklyPlanner.js actually
// summed, so the interface can say *why* a muscle ranked where it did.
// Mirrors computeMusclePriority's branches exactly, including its -1s.
function explainMusclePriority(muscle, {
  currentFatigue = {}, offlineMuscles = [], muscleLastTrainedDays = null, muscleFocus = {},
} = {}) {
  const fatigue = currentFatigue[muscle] || 0;

  if (offlineMuscles.includes(muscle)) {
    return { muscle, available: false, priority: -1, fatigue, exclusion: 'offline', terms: [] };
  }
  if (fatigue >= FATIGUE_CEILING) {
    return { muscle, available: false, priority: -1, fatigue, exclusion: 'fatigue-ceiling', terms: [] };
  }

  const terms = [{ key: 'recovery', label: 'Recovered', value: round(100 - fatigue) }];
  // null means the caller had no lift history to hand, which is different
  // from "trained today" — computeMusclePriority skips the term entirely in
  // that case rather than assuming anything, and so does this.
  if (muscleLastTrainedDays) {
    const days = muscleLastTrainedDays[muscle];
    const boost = stalenessBoost(days);
    // computeMuscleLastTrainedDays returns a fractional day count. The boost
    // is computed from the raw value (stalenessBoost ramps continuously), but
    // the figure shown to a reader is rounded — "59.480495983796295 days since
    // it was last trained" is not a more precise fact than "59 days", just a
    // less readable one.
    if (boost > 0) {
      terms.push({
        key: 'staleness', label: 'Overdue', value: round(boost),
        days: days == null ? null : Math.round(days),
      });
    }
  }
  if (muscleFocus[muscle] === 'focus') {
    terms.push({ key: 'focus', label: 'Your priority', value: FOCUS_MUSCLE_BONUS });
  }

  return {
    muscle,
    available: true,
    priority: round(terms.reduce((sum, t) => sum + t.value, 0)),
    fatigue,
    exclusion: null,
    terms,
  };
}

// Which muscles actually moved a bucket's score, strongest first, plus the
// ones holding it back. `limiters` is the honest half: a bucket can rank top
// while some of its muscles are unloadable, and that's what the athlete needs
// to know before starting.
//
// Membership comes from focusGroups(preferredSplit), not from the bucket —
// scoreBucket only puts *available* muscles in bucket.muscles, so the excluded
// ones would be invisible exactly when they matter most. Under 'Full Body'
// every muscle is its own bucket and this resolves to a one-element list,
// which is correct rather than degenerate.
function explainBucket(bucketName, { preferredSplit = 'Full Body', ...inputs } = {}) {
  const groups = focusGroups(preferredSplit);
  const muscles = groups[bucketName] || [];
  const explained = muscles.map(m => explainMusclePriority(m, inputs));
  return {
    name: bucketName,
    drivers: explained.filter(e => e.available).sort((a, b) => b.priority - a.priority),
    limiters: explained.filter(e => !e.available),
  };
}

// What actually differs between the recommendation and an option the athlete
// picked instead. Every field is measured, not predicted.
function compareOptions(chosen, alternative, inputs = {}) {
  if (!chosen || !alternative) return null;

  const a = explainBucket(chosen.name, inputs);
  const b = explainBucket(alternative.name, inputs);
  const chosenMuscles = new Set(a.drivers.map(d => d.muscle));
  const altMuscles = new Set(b.drivers.map(d => d.muscle));

  return {
    from: chosen.name,
    to: alternative.name,
    // Positive means the recommendation ranked higher, on the planner's raw
    // priority scale rather than the clamped display figure.
    scoreDelta: round(rankOf(chosen) - rankOf(alternative)),
    nearTie: Math.abs(rankOf(chosen) - rankOf(alternative)) <= NEAR_TIE_MARGIN,
    trades: {
      losing: [...chosenMuscles].filter(m => !altMuscles.has(m)),
      gaining: [...altMuscles].filter(m => !chosenMuscles.has(m)),
      shared: [...chosenMuscles].filter(m => altMuscles.has(m)),
    },
    // Muscles in the alternative that can't be loaded at all right now. This
    // is the real cost of overriding, and it's a fact rather than a forecast.
    blocked: b.limiters.map(l => ({ muscle: l.muscle, reason: l.exclusion, fatigue: l.fatigue })),
  };
}

// Confidence is a level with named causes, not a percentage. A percentage
// would imply the model has been calibrated against outcomes, and it hasn't —
// Press has never compared a predicted session against the one that actually
// happened. These are the four things genuinely known to weaken a pick:
// thin history, no staleness data, a near-tie between the top two options,
// and the backend's own dataMature flag.
function recommendationConfidence({
  buckets = [], loggedSessionCount = 0, dataMature = null, muscleLastTrainedDays = null,
} = {}) {
  const limitations = [];

  if (!buckets.length) {
    return {
      level: 'none',
      limitations: [{ code: 'no-options', text: 'No muscle group is available to train right now.' }],
    };
  }
  if (dataMature === false) {
    limitations.push({ code: 'immature-data', text: 'Not enough training history yet for fatigue estimates to settle.' });
  }
  if (loggedSessionCount < CONFIDENT_SESSION_COUNT) {
    limitations.push({
      code: 'thin-history',
      text: `Based on ${loggedSessionCount} logged session${loggedSessionCount === 1 ? '' : 's'} — fatigue estimates sharpen with more.`,
    });
  }
  if (!muscleLastTrainedDays) {
    limitations.push({ code: 'no-staleness', text: 'No last-trained dates available, so nothing is weighted for being overdue.' });
  }
  if (buckets.length > 1) {
    const margin = rankOf(buckets[0]) - rankOf(buckets[1]);
    if (margin <= NEAR_TIE_MARGIN) {
      limitations.push({
        code: 'near-tie',
        text: `${buckets[0].name} and ${buckets[1].name} scored within ${round(margin)} points — either is a reasonable choice today.`,
      });
    }
  }

  // Two or more independent weaknesses is what separates "take this with a
  // pinch of salt" from "one caveat worth knowing".
  const level = limitations.length === 0 ? 'high' : limitations.length === 1 ? 'moderate' : 'low';
  return { level, limitations };
}

// Assembles the full object the dashboard renders: what was chosen, why, what
// else was considered, and how much to trust it. `guidance` is
// generateWeeklyGuidance's return value verbatim — this reads it, never
// recomputes it, so the explanation is always of the real recommendation.
function buildRecommendation({ guidance, loggedSessionCount = 0, ...inputs } = {}) {
  const buckets = guidance?.muscleFocus || [];
  const chosen = buckets[0] || null;
  const alternatives = buckets.slice(1);
  // generateWeeklyGuidance already carries the backend's maturity verdict, so
  // a caller shouldn't have to thread it separately to get honest confidence.
  const confidenceInputs = {
    buckets, loggedSessionCount,
    dataMature: inputs.dataMature ?? guidance?.dataMature ?? null,
    muscleLastTrainedDays: inputs.muscleLastTrainedDays ?? null,
  };

  if (!chosen) {
    return {
      chosen: null,
      alternatives: [],
      reasoning: [],
      comparisons: [],
      restingMuscleGroups: guidance?.restingMuscleGroups || [],
      confidence: recommendationConfidence(confidenceInputs),
    };
  }

  const detail = explainBucket(chosen.name, inputs);
  const reasoning = [];

  const lead = detail.drivers[0];
  if (lead) {
    const overdue = lead.terms.find(t => t.key === 'staleness');
    const focused = lead.terms.find(t => t.key === 'focus');
    reasoning.push({
      code: 'top-driver',
      text: overdue
        ? (overdue.days != null
          ? `${lead.muscle} has recovered and is overdue — ${overdue.days} days since it was last trained.`
          // stalenessBoost treats an unknown date as roughly three weeks
          // overdue, so this muscle ranked up for having no record at all.
          // Saying "overdue" here would invent a history that doesn't exist.
          : `${lead.muscle} is recovered and has no training on record, so it's treated as long overdue.`)
        : `${lead.muscle} is the most recovered muscle available.`,
      ...(focused ? { note: 'Ranked up because you marked it a priority.' } : {}),
    });
  }
  if (detail.limiters.length) {
    const injured = detail.limiters.filter(l => l.exclusion === 'offline').map(l => l.muscle);
    const spent = detail.limiters.filter(l => l.exclusion === 'fatigue-ceiling').map(l => l.muscle);
    if (spent.length) {
      reasoning.push({
        code: 'at-ceiling',
        text: `${spent.join(', ')} ${spent.length === 1 ? 'is' : 'are'} above the ${FATIGUE_CEILING}-point fatigue ceiling and won't be loaded today.`,
      });
    }
    if (injured.length) {
      reasoning.push({ code: 'offline', text: `${injured.join(', ')} excluded — flagged as injured or set to avoid.` });
    }
  }
  if (alternatives[0]) {
    const cmp = compareOptions(chosen, alternatives[0], inputs);
    reasoning.push({
      code: 'runner-up',
      text: cmp.nearTie
        ? `${alternatives[0].name} scored almost identically — it would be a defensible choice too.`
        : `${alternatives[0].name} ranked ${round(cmp.scoreDelta)} points lower.`,
    });
  }

  return {
    chosen: { ...chosen, ...detail },
    alternatives,
    reasoning,
    restingMuscleGroups: guidance?.restingMuscleGroups || [],
    confidence: recommendationConfidence(confidenceInputs),
    // Precomputed rather than a compareWith(name) callback: this object is
    // meant to survive JSON on its way to the frontend, and a function
    // wouldn't. One entry per alternative answers "what changes if I pick
    // that instead?" without the interface recomputing anything.
    comparisons: alternatives.map(alt => compareOptions(chosen, alt, inputs)),
  };
}

module.exports = {
  explainMusclePriority, explainBucket, compareOptions,
  recommendationConfidence, buildRecommendation,
  NEAR_TIE_MARGIN, CONFIDENT_SESSION_COUNT,
};
