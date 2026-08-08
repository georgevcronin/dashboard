// Manual cardio/sport logging. Until now the only way db.runs/db.sports
// ever got populated was Strava ingestion (parseStravaActivity,
// stravaParsing.js) — an athlete without a synced device, or one who did
// something Strava never saw (a five-a-side game, a pool swim with no
// watch), had no way to get that session into the app at all. This is the
// manual-entry equivalent: same structured shape parseStravaActivity
// produces (durationMin/distanceKm/paceMinPerKm/avgHeartRate/
// elevationGainM/avgCadence/avgWatts/hasPowerMeter), hand-typed instead of
// parsed off a device, so every downstream reader (runningLoad.js,
// cardio.js, hybridFatigue.js, vo2max.js) needs no changes to pick these up
// — they already just read whatever's sitting in db.runs/db.sports.
// Pure — no db/Express here, see functions/index.js's POST /cardio/log.
const ACTIVITY_TYPES = ['run', 'ride', 'swim', 'sport', 'other'];
const ACTIVITY_LABELS = { run: 'Run', ride: 'Ride', swim: 'Swim', sport: 'Sport', other: 'Session' };

// Only run gets a dedicated sportType label — classifySportType
// (sportClassifier.js) already buckets anything ride/cycl/bike-like as
// 'cycling' and anything swim-like as 'swimming' by matching this string,
// so 'Ride'/'Swim' need to read that way for db.sports readers to bucket a
// manual entry the same as a Strava one. 'sport'/'other' fall into
// classifySportType's 'other' catch-all regardless of label, so those use
// whatever name the athlete actually typed (falling back to a generic one).
function sportTypeLabelFor(activityType, name) {
  if (activityType === 'ride') return 'Ride';
  if (activityType === 'swim') return 'Swim';
  return (name || '').trim() || ACTIVITY_LABELS[activityType];
}

// todayStr: server's own day() (functions/index.js), never trusting a
// client clock — see that function's Europe/London-anchored comment.
function buildManualActivity({ activityType, date, durationMin, distanceKm, avgHeartRate, name } = {}, todayStr) {
  if (!ACTIVITY_TYPES.includes(activityType)) {
    return { error: `activityType must be one of ${ACTIVITY_TYPES.join(', ')}` };
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'date must be YYYY-MM-DD' };
  }
  if (todayStr && date > todayStr) {
    return { error: 'date cannot be in the future — use Plan Ahead to schedule an upcoming session instead' };
  }
  const duration = +durationMin;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 720) {
    return { error: 'durationMin must be a number between 1 and 720' };
  }
  let distance = null;
  if (distanceKm != null && distanceKm !== '') {
    distance = +distanceKm;
    if (!Number.isFinite(distance) || distance < 0 || distance > 400) {
      return { error: 'distanceKm must be a non-negative number (max 400)' };
    }
  }
  let hr = null;
  if (avgHeartRate != null && avgHeartRate !== '') {
    hr = +avgHeartRate;
    if (!Number.isFinite(hr) || hr < 30 || hr > 240) {
      return { error: 'avgHeartRate must be between 30 and 240' };
    }
  }

  const isRun = activityType === 'run';
  const workoutName = name?.trim() || ACTIVITY_LABELS[activityType];

  return {
    isRun,
    bucket: isRun ? 'runs' : 'sports',
    workoutName,
    record: {
      date, source: 'manual',
      sportType: sportTypeLabelFor(activityType, name),
      durationMin: duration,
      distanceKm: distance,
      // Same derivation as parseStravaActivity's pace-from-speed, simplified
      // to duration/distance directly since a manual entry never has a
      // speed reading to convert from.
      paceMinPerKm: distance > 0 ? +(duration / distance).toFixed(2) : null,
      avgHeartRate: hr,
      // Device-only fields no manual entry can supply — left null/false
      // rather than guessed, same "no fabricated data" stance
      // micronutrients.js already takes with fields a source doesn't report.
      elevationGainM: null, avgCadence: null, avgWatts: null, hasPowerMeter: false,
    },
  };
}

module.exports = { buildManualActivity, ACTIVITY_TYPES, ACTIVITY_LABELS };
