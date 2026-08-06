const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseStravaActivity } = require('../functions/stravaParsing');

test('parses a real-shaped Strava run activity', () => {
  const a = {
    id: 12345, sport_type: 'Run', type: 'Run',
    start_date_local: '2026-08-07T06:15:00Z', start_date: '2026-08-07T06:15:00Z',
    moving_time: 1800, elapsed_time: 1850, kilojoules: 900,
    distance: 5000, average_speed: 2.78, total_elevation_gain: 45,
    average_heartrate: 152, average_cadence: 172,
  };
  const p = parseStravaActivity(a);
  assert.equal(p.date, '2026-08-07');
  assert.equal(p.name, 'run');
  assert.equal(p.sourceId, '12345');
  assert.equal(p.duration, 30); // moving_time preferred over elapsed_time
  assert.equal(p.kcal, 215); // 900 * 0.239 rounded
  assert.equal(p.isRun, true);
  assert.equal(p.structured.distanceKm, 5);
  assert.equal(p.structured.paceMinPerKm, 6); // (1000/60)/2.78 ≈ 6.0
  assert.equal(p.structured.elevationGainM, 45);
  assert.equal(p.structured.avgHeartRate, 152);
  assert.equal(p.structured.avgCadence, 172);
});

test('falls back to elapsed_time when moving_time is absent', () => {
  const a = { id: 1, type: 'Ride', start_date: '2026-08-01T00:00:00Z', elapsed_time: 600 };
  assert.equal(parseStravaActivity(a).duration, 10);
});

test('falls back to legacy `type` when `sport_type` is missing, and underscores become spaces', () => {
  const a = { id: 1, type: 'Virtual_Ride', start_date: '2026-08-01T00:00:00Z', moving_time: 60 };
  const p = parseStravaActivity(a);
  assert.equal(p.name, 'virtual ride');
  assert.equal(p.isRun, false);
});

test('no kilojoules means kcal is null, not 0', () => {
  const a = { id: 1, type: 'Yoga', start_date: '2026-08-01T00:00:00Z', moving_time: 30 };
  assert.equal(parseStravaActivity(a).kcal, null);
});

test('missing distance/speed/hr/cadence fields stay null rather than 0 or NaN', () => {
  const a = { id: 1, type: 'Run', start_date: '2026-08-01T00:00:00Z', moving_time: 1200 };
  const p = parseStravaActivity(a);
  assert.equal(p.structured.distanceKm, null);
  assert.equal(p.structured.paceMinPerKm, null);
  assert.equal(p.structured.elevationGainM, null);
  assert.equal(p.structured.avgHeartRate, null);
  assert.equal(p.structured.avgCadence, null);
});

test('zero-duration activity (e.g. a manual/incomplete entry) gets no structured record', () => {
  const a = { id: 1, type: 'Run', start_date: '2026-08-01T00:00:00Z' };
  const p = parseStravaActivity(a);
  assert.equal(p.duration, 0);
  assert.equal(p.structured, null);
});

test('activity with no start date is unparseable and returns null', () => {
  assert.equal(parseStravaActivity({ id: 1, type: 'Run', moving_time: 30 }), null);
  assert.equal(parseStravaActivity({}), null);
});

test('sport_type wins over legacy type when both are present', () => {
  const a = { id: 1, type: 'Workout', sport_type: 'TrailRun', start_date: '2026-08-01T00:00:00Z', moving_time: 30 };
  const p = parseStravaActivity(a);
  assert.equal(p.name, 'trailrun');
  assert.equal(p.isRun, true);
});
