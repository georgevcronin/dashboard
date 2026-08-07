// db.sports (functions/index.js's ingestActivity) already holds every
// non-running Strava activity, unsplit -- cycling, swimming, hiking,
// whatever else, all mixed together. Same isRun-style regex-on-sport_type
// approach stravaParsing.js already uses for the run/not-run split, just
// carried one step further for the two sports that get their own panel
// (#cyclingPower.js, #enduranceRecommendation.js). Everything else stays
// 'other' -- not every Strava sport_type needs its own bucket, only the
// ones with a panel to feed.
function classifySportType(sportType) {
  const t = (sportType || '').toLowerCase();
  if (/ride|cycl|bike|velomobile|handcycle/.test(t)) return 'cycling';
  if (/swim/.test(t)) return 'swimming';
  return 'other';
}

module.exports = { classifySportType };
