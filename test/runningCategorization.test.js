const test = require('node:test');
const assert = require('node:assert');

const {
  categorizePaceZone,
  categorizeHRZone,
  reconcileCategories,
  categorizeRun,
  categorizeManyRuns,
} = require('../functions/runningCategorization');

test('Categorize pace zone: easy pace → z1', () => {
  const vdotPaces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zone = categorizePaceZone(6.8, vdotPaces);
  assert.strictEqual(zone, 'z1_easy', 'pace 6.8 should be easy zone');
});

test('Categorize pace zone: marathon pace → z2', () => {
  const vdotPaces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zone = categorizePaceZone(5.5, vdotPaces);
  assert.strictEqual(zone, 'z2_marathon', 'pace 5.5 should be marathon zone');
});

test('Categorize pace zone: threshold pace → z3', () => {
  const vdotPaces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zone = categorizePaceZone(4.2, vdotPaces);
  assert.strictEqual(zone, 'z3_threshold', 'pace 4.2 should be threshold zone');
});

test('Categorize pace zone: interval pace → z4', () => {
  const vdotPaces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zone = categorizePaceZone(3.5, vdotPaces);
  assert.strictEqual(zone, 'z4_interval', 'pace 3.5 should be interval zone');
});

test('Categorize pace zone: sprint faster than reps → z5_sprint', () => {
  const vdotPaces = {
    ePace: 6.5,
    mPace: 5.3,
    tPace: 4.0,
    iPace: 3.2,
    rPace: 2.8,
  };

  const zone = categorizePaceZone(2.3, vdotPaces);
  assert.strictEqual(zone, 'z5_sprint', 'pace 2.3 faster than reps should be sprint');
});

test('Categorize pace zone: null when missing data', () => {
  const zone = categorizePaceZone(null, {});
  assert.strictEqual(zone, null, 'null pace should return null');
});

test('Categorize HR zone: low HR → z1', () => {
  const hrZones = {
    z1: { minHR: 125, maxHR: 138 },
    z2: { minHR: 138, maxHR: 151 },
    z3: { minHR: 151, maxHR: 164 },
    z4: { minHR: 164, maxHR: 177 },
    z5: { minHR: 177, maxHR: 190 },
  };

  const result = categorizeHRZone(135, hrZones);
  assert.strictEqual(result.zone, 'z1', 'HR 135 should be z1');
  assert.strictEqual(result.confidence, 'high');
});

test('Categorize HR zone: high HR → z4', () => {
  const hrZones = {
    z1: { minHR: 125, maxHR: 138 },
    z2: { minHR: 138, maxHR: 151 },
    z3: { minHR: 151, maxHR: 164 },
    z4: { minHR: 164, maxHR: 177 },
    z5: { minHR: 177, maxHR: 190 },
  };

  const result = categorizeHRZone(170, hrZones);
  assert.strictEqual(result.zone, 'z4', 'HR 170 should be z4');
});

test('Categorize HR zone: null when no zones', () => {
  const result = categorizeHRZone(140, null);
  assert.strictEqual(result.zone, null, 'null zones should return null zone');
});

test('Reconcile categories: perfect agreement', () => {
  const result = reconcileCategories('z2_marathon', 'z2');
  assert.strictEqual(result.zone, 'z2_marathon', 'agreement should use pace zone');
  assert.strictEqual(result.source, 'pace+hr-agreement');
  assert.strictEqual(result.confidence, 'high');
});

test('Reconcile categories: pace-only', () => {
  const result = reconcileCategories('z3_threshold', null);
  assert.strictEqual(result.zone, 'z3_threshold', 'pace-only should use pace zone');
  assert.strictEqual(result.source, 'pace-only');
  assert.strictEqual(result.confidence, 'medium');
});

test('Reconcile categories: HR-only', () => {
  const result = reconcileCategories(null, 'z2');
  assert.strictEqual(result.zone, 'z2', 'HR-only should use HR zone');
  assert.strictEqual(result.source, 'hr-only');
  assert.strictEqual(result.confidence, 'medium');
});

test('Reconcile categories: minor mismatch (±1 zone)', () => {
  const result = reconcileCategories('z2_marathon', 'z3');
  assert.strictEqual(result.zone, 'z2_marathon', 'should use pace as primary');
  assert.strictEqual(result.confidence, 'medium', 'mismatch should lower confidence');
  assert(result.note, 'should include note about mismatch');
});

test('Reconcile categories: major mismatch (>1 zone)', () => {
  const result = reconcileCategories('z1_easy', 'z4');
  assert.strictEqual(result.zone, 'z1_easy', 'should use pace as primary');
  assert.strictEqual(result.confidence, 'low', 'major mismatch should be low confidence');
  assert(result.note && result.note.includes('mismatch'), 'should note mismatch');
});

test('Categorize run: complete data', () => {
  const run = {
    date: '2026-08-05',
    distanceKm: 10,
    durationMin: 50,
    paceMinPerKm: 5.5,
    avgHeartRate: 145,
  };

  const result = categorizeRun({
    run,
    vo2maxValue: 50,
    maxHeartRate: 190,
    restingHeartRate: 60,
  });

  assert(result, 'should return categorization');
  assert(result.category, 'should have category');
  assert(result.confidence, 'should have confidence');
  assert(result.reasoning, 'should have reasoning');
});

test('Categorize run: pace-only (no HR)', () => {
  const run = {
    date: '2026-08-05',
    distanceKm: 10,
    durationMin: 50,
    paceMinPerKm: 5.5,
  };

  const result = categorizeRun({
    run,
    vo2maxValue: 50,
    maxHeartRate: 190,
  });

  assert(result, 'should work with pace only');
  assert(result.source === 'pace-only' || result.source.includes('pace'));
});

test('Categorize run: null without pace', () => {
  const run = {
    date: '2026-08-05',
    distanceKm: 10,
    durationMin: 50,
    avgHeartRate: 145,
  };

  const result = categorizeRun({
    run,
    vo2maxValue: 50,
    maxHeartRate: 190,
  });

  assert.strictEqual(result, null, 'should return null without pace');
});

test('Categorize many runs: returns array', () => {
  const runs = [
    { date: '2026-08-05', distanceKm: 10, durationMin: 50, paceMinPerKm: 5.5, avgHeartRate: 145 },
    { date: '2026-08-04', distanceKm: 8, durationMin: 35, paceMinPerKm: 6.2, avgHeartRate: 132 },
    { date: '2026-08-03', distanceKm: 5, durationMin: 15, paceMinPerKm: 3.5, avgHeartRate: 170 },
  ];

  const results = categorizeManyRuns(runs, 50, 190, 60);

  assert(Array.isArray(results), 'should return array');
  assert.strictEqual(results.length, 3, 'should categorize all 3 runs');
});

test('Categorize many runs: filters out uncategorizable', () => {
  const runs = [
    { date: '2026-08-05', distanceKm: 10, durationMin: 50, paceMinPerKm: 5.5 }, // OK
    { date: '2026-08-04', distanceKm: 8, durationMin: 35 }, // No pace, will be filtered
    { date: '2026-08-03', distanceKm: 5, durationMin: 15, paceMinPerKm: 3.5 }, // OK
  ];

  const results = categorizeManyRuns(runs, 50, 190, 60);

  assert.strictEqual(results.length, 2, 'should filter runs without pace');
});

test('Categorize many runs: empty list returns empty array', () => {
  const results = categorizeManyRuns([], 50, 190, 60);
  assert.strictEqual(results.length, 0, 'empty runs should return empty array');
});
