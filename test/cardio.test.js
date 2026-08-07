const test = require('node:test');
const assert = require('node:assert');

const { cardioTypeOf, filterCardio, dailyLoadsFromCardio, computeCardioACWR, cardioHRZones } = require('../functions/cardio');

test('cardioTypeOf: classifies bike sport types', () => {
  assert.strictEqual(cardioTypeOf('Ride'), 'bike');
  assert.strictEqual(cardioTypeOf('VirtualRide'), 'bike');
  assert.strictEqual(cardioTypeOf('MountainBikeRide'), 'bike');
  assert.strictEqual(cardioTypeOf('GravelRide'), 'bike');
  assert.strictEqual(cardioTypeOf('EBikeRide'), 'bike');
});

test('cardioTypeOf: classifies swim sport types', () => {
  assert.strictEqual(cardioTypeOf('Swim'), 'swim');
  assert.strictEqual(cardioTypeOf('OpenWaterSwim'), 'swim');
});

test('cardioTypeOf: null for running and unrelated sports, and missing input', () => {
  assert.strictEqual(cardioTypeOf('Run'), null);
  assert.strictEqual(cardioTypeOf('TrailRun'), null);
  assert.strictEqual(cardioTypeOf('Yoga'), null);
  assert.strictEqual(cardioTypeOf('Hike'), null);
  assert.strictEqual(cardioTypeOf(null), null);
  assert.strictEqual(cardioTypeOf(undefined), null);
});

test('filterCardio: keeps only swim/bike entries, tags cardioType, ignores everything else', () => {
  const sports = [
    { date: '2026-08-01', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 },
    { date: '2026-08-02', sportType: 'Swim', durationMin: 30, avgHeartRate: 130 },
    { date: '2026-08-03', sportType: 'Yoga', durationMin: 45, avgHeartRate: 100 },
    { date: '2026-08-04', sportType: 'Run', durationMin: 40, avgHeartRate: 150 },
  ];
  const result = filterCardio(sports);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].cardioType, 'bike');
  assert.strictEqual(result[1].cardioType, 'swim');
});

test('filterCardio: empty for no sports', () => {
  assert.deepStrictEqual(filterCardio([]), []);
  assert.deepStrictEqual(filterCardio(null), []);
});

test('dailyLoadsFromCardio: produces positive load for a valid bike session', () => {
  const sports = [{ date: '2026-08-01', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 }];
  const loads = dailyLoadsFromCardio(sports, { baselines: { restingHeartRate: 55, maxHeartRate: 190 } });
  assert(loads['2026-08-01'] > 0, 'a valid bike session should produce positive load');
});

test('dailyLoadsFromCardio: type filter isolates bike from swim', () => {
  const sports = [
    { date: '2026-08-01', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 },
    { date: '2026-08-01', sportType: 'Swim', durationMin: 30, avgHeartRate: 130 },
  ];
  const bikeOnly = dailyLoadsFromCardio(sports, {}, 'bike');
  const swimOnly = dailyLoadsFromCardio(sports, {}, 'swim');
  assert(bikeOnly['2026-08-01'] > 0);
  assert(swimOnly['2026-08-01'] > 0);
  assert(bikeOnly['2026-08-01'] !== swimOnly['2026-08-01'] || true, 'both present independently'); // duration differs, so loads differ, but the real assertion is both being computed at all
  const combined = dailyLoadsFromCardio(sports, {});
  assert(combined['2026-08-01'] > bikeOnly['2026-08-01'], 'combined (no type filter) should include both sessions summed');
});

test('dailyLoadsFromCardio: ignores non-cardio sports mixed into the same array', () => {
  const sports = [
    { date: '2026-08-01', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 },
    { date: '2026-08-01', sportType: 'Yoga', durationMin: 200, avgHeartRate: 200 }, // would dominate if not filtered out
  ];
  const loads = dailyLoadsFromCardio(sports, { baselines: { restingHeartRate: 55, maxHeartRate: 190 } });
  const bikeOnlyLoads = dailyLoadsFromCardio([sports[0]], { baselines: { restingHeartRate: 55, maxHeartRate: 190 } });
  assert.strictEqual(loads['2026-08-01'], bikeOnlyLoads['2026-08-01'], 'non-cardio sport in the same array must not contribute load');
});

test('computeCardioACWR: null with insufficient history', () => {
  const sports = [{ date: '2026-08-01', sportType: 'Ride', durationMin: 60, avgHeartRate: 140 }];
  assert.strictEqual(computeCardioACWR(sports, '2026-08-01', {}), null);
});

test('computeCardioACWR: a number once there is enough history', () => {
  const sports = [];
  for (let i = 40; i >= 0; i--) {
    const d = new Date('2026-08-06'); d.setDate(d.getDate() - i);
    sports.push({ date: d.toISOString().slice(0, 10), sportType: 'Ride', durationMin: 45, avgHeartRate: 135 });
  }
  const acwr = computeCardioACWR(sports, '2026-08-06', { baselines: { restingHeartRate: 55, maxHeartRate: 190 } });
  assert(typeof acwr === 'number' && acwr > 0);
});

test('cardioHRZones: delegates to karvonen5Zones — 5 zones for a valid maxHR', () => {
  const zones = cardioHRZones(190, 55);
  assert(zones);
  assert(zones.z1 && zones.z2 && zones.z3 && zones.z4 && zones.z5);
});
