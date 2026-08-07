// Parsing for raw Strava API activity objects (GET /athlete/activities).
// Pure — takes an activity, returns the shape ingestActivity (index.js)
// writes to db.workouts/db.runs/db.sports. Split out so the field mapping
// (kJ->kcal, m/s->min/km, sport_type/type fallback) is testable without a
// live db.

function parseStravaActivity(a) {
  const date = (a.start_date_local || a.start_date || "").slice(0, 10);
  if (!date) return null;
  const name = (a.sport_type || a.type || "workout").toLowerCase().replace(/_/g, " ");
  const duration = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
  const kcal = a.kilojoules ? Math.round(a.kilojoules * 0.239) : null;
  const sportType = (a.sport_type || a.type || "").toLowerCase();
  const isRun = /run/.test(sportType);

  return {
    date, name, sourceId: String(a.id), duration, kcal, isRun,
    structured: duration > 0 ? {
      sportType: a.sport_type || a.type || null,
      durationMin: duration,
      distanceKm: a.distance ? +(a.distance / 1000).toFixed(2) : null,
      paceMinPerKm: a.average_speed ? +((1000 / 60) / a.average_speed).toFixed(2) : null,
      elevationGainM: a.total_elevation_gain ?? null,
      avgHeartRate: a.average_heartrate ?? null,
      avgCadence: a.average_cadence ?? null,
      // Cycling power (#cyclingPower.js) -- only device_watts:true is a real
      // power meter reading; Strava's own speed/grade-estimated power
      // (device_watts:false) isn't trustworthy enough for a physiology
      // formula, so callers must check hasPowerMeter before trusting avgWatts.
      avgWatts: a.average_watts ?? null,
      hasPowerMeter: a.device_watts === true,
    } : null,
  };
}

module.exports = { parseStravaActivity };
