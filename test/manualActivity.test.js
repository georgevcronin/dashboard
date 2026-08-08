const test = require('node:test');
const assert = require('node:assert');

const { buildManualActivity, ACTIVITY_TYPES } = require('../functions/manualActivity');

const TODAY = '2026-08-08';
const valid = (overrides = {}) => ({
  activityType: 'run', date: TODAY, durationMin: 45, distanceKm: 8, avgHeartRate: 150,
  ...overrides,
});

test('accepts a valid run and shapes it like a parsed Strava activity', () => {
  const result = buildManualActivity(valid(), TODAY);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.isRun, true);
  assert.strictEqual(result.bucket, 'runs');
  assert.strictEqual(result.workoutName, 'Run');
  assert.deepStrictEqual(result.record, {
    date: TODAY, source: 'manual', sportType: 'Run',
    durationMin: 45, distanceKm: 8, paceMinPerKm: 5.63, avgHeartRate: 150,
    elevationGainM: null, avgCadence: null, avgWatts: null, hasPowerMeter: false,
  });
});

test('a ride is bucketed into sports with sportType Ride, classifiable by classifySportType', () => {
  const { classifySportType } = require('../functions/sportClassifier');
  const result = buildManualActivity(valid({ activityType: 'ride' }), TODAY);
  assert.strictEqual(result.isRun, false);
  assert.strictEqual(result.bucket, 'sports');
  assert.strictEqual(result.record.sportType, 'Ride');
  assert.strictEqual(classifySportType(result.record.sportType), 'cycling');
});

test('a swim is bucketed into sports with sportType Swim, classifiable by classifySportType', () => {
  const { classifySportType } = require('../functions/sportClassifier');
  const result = buildManualActivity(valid({ activityType: 'swim' }), TODAY);
  assert.strictEqual(result.bucket, 'sports');
  assert.strictEqual(result.record.sportType, 'Swim');
  assert.strictEqual(classifySportType(result.record.sportType), 'swimming');
});

test('a sport uses the given name as its sportType label, falling back to "Sport"', () => {
  const named = buildManualActivity(valid({ activityType: 'sport', name: 'Five-a-side' }), TODAY);
  assert.strictEqual(named.record.sportType, 'Five-a-side');
  assert.strictEqual(named.workoutName, 'Five-a-side');

  const unnamed = buildManualActivity(valid({ activityType: 'sport', name: '' }), TODAY);
  assert.strictEqual(unnamed.record.sportType, 'Sport');
  assert.strictEqual(unnamed.workoutName, 'Sport');
});

test('rejects an unknown activityType', () => {
  const result = buildManualActivity(valid({ activityType: 'football' }), TODAY);
  assert.match(result.error, /activityType must be one of/);
  assert.strictEqual(result.record, undefined);
});

test('rejects a malformed or missing date', () => {
  assert.match(buildManualActivity(valid({ date: '08/08/2026' }), TODAY).error, /date must be YYYY-MM-DD/);
  assert.match(buildManualActivity(valid({ date: null }), TODAY).error, /date must be YYYY-MM-DD/);
});

test('rejects a future date, pointing at Plan Ahead instead', () => {
  const result = buildManualActivity(valid({ date: '2026-08-09' }), TODAY);
  assert.match(result.error, /Plan Ahead/);
});

test('rejects a non-positive or absurd duration', () => {
  assert.match(buildManualActivity(valid({ durationMin: 0 }), TODAY).error, /durationMin/);
  assert.match(buildManualActivity(valid({ durationMin: -5 }), TODAY).error, /durationMin/);
  assert.match(buildManualActivity(valid({ durationMin: 1000 }), TODAY).error, /durationMin/);
  assert.match(buildManualActivity(valid({ durationMin: 'abc' }), TODAY).error, /durationMin/);
});

test('distance and heart rate are optional — omitting both still succeeds with null pace', () => {
  const result = buildManualActivity(valid({ distanceKm: null, avgHeartRate: null }), TODAY);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.record.distanceKm, null);
  assert.strictEqual(result.record.avgHeartRate, null);
  assert.strictEqual(result.record.paceMinPerKm, null);
});

test('rejects an out-of-range heart rate but leaves valid ones alone', () => {
  assert.match(buildManualActivity(valid({ avgHeartRate: 20 }), TODAY).error, /avgHeartRate/);
  assert.match(buildManualActivity(valid({ avgHeartRate: 300 }), TODAY).error, /avgHeartRate/);
  assert.strictEqual(buildManualActivity(valid({ avgHeartRate: 190 }), TODAY).error, undefined);
});

test('rejects a negative distance', () => {
  assert.match(buildManualActivity(valid({ distanceKm: -1 }), TODAY).error, /distanceKm/);
});

test('ACTIVITY_TYPES covers exactly run/ride/swim/sport/other', () => {
  assert.deepStrictEqual(ACTIVITY_TYPES, ['run', 'ride', 'swim', 'sport', 'other']);
});
