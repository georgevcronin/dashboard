const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANONICAL_NAME, LEGACY_NAME_MAP, legacyMappingFor, isLegacyBenchLift, migratedLiftFor, planMigration,
} = require('../functions/benchPressMigration');
const { emgProfileForExercise } = require('../functions/exerciseEmgProfiles');

// This whole module is pure logic against synthetic data ONLY — see its own
// header for why (functions/scripts/migrateBenchPress.js is the separate,
// not-run-here, real-Firestore-touching CLI). Nothing here should import
// firebase-admin or touch real data.

test('LEGACY_NAME_MAP covers exactly the six named bench-press variants, with the standard angle conventions', () => {
  assert.deepEqual(LEGACY_NAME_MAP, {
    'barbell bench press': { equipment: 'Barbell', angle: 0 },
    'incline barbell bench press': { equipment: 'Barbell', angle: 30 },
    'decline barbell bench press': { equipment: 'Barbell', angle: -15 },
    'dumbbell bench press (flat)': { equipment: 'Dumbbell', angle: 0 },
    'dumbbell incline bench press': { equipment: 'Dumbbell', angle: 30 },
    'dumbbell decline bench press': { equipment: 'Dumbbell', angle: -15 },
  });
});

test('Close-Grip Bench Press is deliberately excluded — a grip-width variant, not an angle variant', () => {
  assert.equal(legacyMappingFor('Close-Grip Bench Press'), null);
  assert.equal(isLegacyBenchLift({ exercise: 'Close-Grip Bench Press' }), false);
});

test('legacyMappingFor / isLegacyBenchLift are case-insensitive and return null/false for anything unrecognized', () => {
  assert.deepEqual(legacyMappingFor('BARBELL BENCH PRESS'), { equipment: 'Barbell', angle: 0 });
  assert.equal(legacyMappingFor('Bench Press'), null, 'the canonical name itself should never be treated as a migration source');
  assert.equal(legacyMappingFor(''), null);
  assert.equal(legacyMappingFor(undefined), null);
  assert.equal(isLegacyBenchLift({ exercise: 'Some Other Exercise' }), false);
  assert.equal(isLegacyBenchLift({}), false);
});

test('migratedLiftFor rewrites the exercise name and stamps equipment/angle/emgWeights, preserving every other field', () => {
  const lift = { exercise: 'Incline Barbell Bench Press', kg: 80, reps: 5, rpe: 8, date: '2026-01-15', type: 'D' };
  const migrated = migratedLiftFor(lift);
  assert.equal(migrated.exercise, CANONICAL_NAME);
  assert.equal(migrated.equipment, 'Barbell');
  assert.equal(migrated.angle, 30);
  assert.deepEqual(migrated.emgWeights, emgProfileForExercise('Incline Barbell Bench Press'), 'should reuse the exact same curated EMG profile the old name already resolved to, not a degraded default');
  // Everything else untouched.
  assert.equal(migrated.kg, 80);
  assert.equal(migrated.reps, 5);
  assert.equal(migrated.rpe, 8);
  assert.equal(migrated.date, '2026-01-15');
  assert.equal(migrated.type, 'D');
});

test('migratedLiftFor infers Dumbbell equipment correctly for the three dumbbell-named variants', () => {
  assert.equal(migratedLiftFor({ exercise: 'Dumbbell Bench Press (Flat)' }).equipment, 'Dumbbell');
  assert.equal(migratedLiftFor({ exercise: 'Dumbbell Incline Bench Press' }).equipment, 'Dumbbell');
  assert.equal(migratedLiftFor({ exercise: 'Dumbbell Decline Bench Press' }).equipment, 'Dumbbell');
});

test('migratedLiftFor returns null for a lift that is not one of the six legacy names (including the canonical name and Close-Grip)', () => {
  assert.equal(migratedLiftFor({ exercise: 'Bench Press', kg: 80, reps: 5 }), null);
  assert.equal(migratedLiftFor({ exercise: 'Close-Grip Bench Press', kg: 60, reps: 8 }), null);
  assert.equal(migratedLiftFor({ exercise: 'Barbell Row (Overhand / Pendlay)', kg: 100, reps: 5 }), null);
  assert.equal(migratedLiftFor({}), null);
});

test('planMigration only counts/rewrites matching lifts, leaves the input array itself untouched, and never mutates in place', () => {
  const lifts = [
    { exercise: 'Barbell Bench Press', kg: 100, reps: 5, date: '2026-01-01' },
    { exercise: 'Incline Barbell Bench Press', kg: 70, reps: 8, date: '2026-01-02' },
    { exercise: 'Incline Barbell Bench Press', kg: 72.5, reps: 6, date: '2026-01-09' },
    { exercise: 'Barbell Row (Overhand / Pendlay)', kg: 90, reps: 6, date: '2026-01-03' }, // untouched control
    { exercise: 'Close-Grip Bench Press', kg: 60, reps: 8, date: '2026-01-04' }, // deliberately excluded control
  ];
  const snapshotBefore = JSON.parse(JSON.stringify(lifts));

  const plan = planMigration(lifts);

  assert.equal(plan.totalMatched, 3);
  assert.deepEqual(plan.countsByLegacyName, { 'Barbell Bench Press': 1, 'Incline Barbell Bench Press': 2 });
  assert.equal(plan.rewrites.length, 3);
  for (const { before, after } of plan.rewrites) {
    assert.equal(after.exercise, CANONICAL_NAME);
    assert.ok(before.exercise !== CANONICAL_NAME, 'before should still be the original legacy name');
  }
  // Pure function — the caller's array/objects must be untouched, since the
  // real CLI reads this before deciding whether to write anything at all.
  assert.deepEqual(lifts, snapshotBefore);
});

test('planMigration on a lift history with no legacy bench-press names returns an empty, harmless plan', () => {
  const plan = planMigration([{ exercise: 'Back Squat', kg: 100, reps: 5 }]);
  assert.equal(plan.totalMatched, 0);
  assert.deepEqual(plan.countsByLegacyName, {});
  assert.deepEqual(plan.rewrites, []);
});

test('planMigration handles an empty/undefined lift list without throwing', () => {
  assert.deepEqual(planMigration([]), { totalMatched: 0, countsByLegacyName: {}, rewrites: [] });
  assert.deepEqual(planMigration(undefined), { totalMatched: 0, countsByLegacyName: {}, rewrites: [] });
});
