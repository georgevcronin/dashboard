const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANONICAL_PRESS_NAME, CANONICAL_ROW_NAME,
  LEGACY_PRESS_NAME_MAP, LEGACY_ROW_NAME_MAP, NEEDS_CLARIFICATION_PRESS_NAMES,
  legacyPressMappingFor, legacyRowMappingFor, pressNeedsClarification,
  migratedLiftFor, planMigration,
} = require('../functions/pressRowMigration');
const { benchPressEmgProfileForAngle } = require('../functions/exerciseEmgProfiles');
const { emgForAngle } = require('../functions/emgActivation');

// This whole module is pure logic against synthetic data ONLY — see its own
// header for why (functions/scripts/migratePressRow.js is the separate,
// not-run-here, real-Firestore-touching CLI). Nothing here should import
// firebase-admin or touch real data.

test('LEGACY_PRESS_NAME_MAP covers exactly the five auto-migratable Overhead/Shoulder Press names, all landing in the +60° Overhead/Shoulder region', () => {
  assert.deepEqual(Object.keys(LEGACY_PRESS_NAME_MAP).sort(), [
    'barbell overhead press', 'behind-neck press (smith machine)', 'machine shoulder press',
    'seated dumbbell overhead press', 'smith machine overhead press',
  ]);
  for (const mapping of Object.values(LEGACY_PRESS_NAME_MAP)) {
    assert.ok(mapping.angle >= 60, 'every auto-migrated press name should land at/above the Overhead/Shoulder Press threshold');
  }
});

test('Dumbbell Overhead Press is deliberately flagged for clarification, not silently defaulted to a stance', () => {
  assert.equal(legacyPressMappingFor('Dumbbell Overhead Press'), null, 'should not be in the auto-migration map');
  const clarify = pressNeedsClarification('Dumbbell Overhead Press');
  assert.ok(clarify);
  assert.equal(clarify.equipment, 'Dumbbell');
  assert.equal(clarify.angle, 75);
  assert.ok(Object.keys(NEEDS_CLARIFICATION_PRESS_NAMES).includes('dumbbell overhead press'));
});

test('Arnold Press, Push Press, Z-Press, Half-Kneeling Press, JM Press are deliberately NOT in either press map — distinct techniques, not angle points', () => {
  for (const name of ['Arnold Press', 'Push Press', 'Z-Press', 'Half-Kneeling Dumbbell Press', 'JM Press']) {
    assert.equal(legacyPressMappingFor(name), null, `${name} should not auto-migrate`);
    assert.equal(pressNeedsClarification(name), null, `${name} should not even be flagged — it's not an angle variant at all`);
  }
});

test('LEGACY_ROW_NAME_MAP covers exactly the ten auto-migratable pull-up/lat-pulldown names, per §15\'s table', () => {
  assert.deepEqual(Object.keys(LEGACY_ROW_NAME_MAP).sort(), [
    'behind-neck lat pulldown', 'chin-up', 'close-grip lat pulldown', 'lat pulldown (neutral grip)',
    'lat pulldown (reverse / underhand)', 'lat pulldown (wide grip)', 'pull-up (neutral grip)',
    'pull-up (wide grip)', 'single-arm lat pulldown', 'weighted pull-up',
  ]);
});

test('Cable Straight-Arm Pulldown is deliberately excluded from the row migration — keeps its own separate identity', () => {
  assert.equal(legacyRowMappingFor('Cable Straight-Arm Pulldown'), null);
});

test('Single-Arm Lat Pulldown migrates to Neutral-Grip angle (150°, adjusted) plus the single-limb flag, not its own width category', () => {
  const mapping = legacyRowMappingFor('Single-Arm Lat Pulldown');
  assert.deepEqual(mapping, { equipment: 'Cable', angle: 150, limb: 'single' });
});

test('legacyPressMappingFor / legacyRowMappingFor are case-insensitive and return null for anything unrecognized', () => {
  assert.deepEqual(legacyPressMappingFor('BARBELL OVERHEAD PRESS'), { equipment: 'Barbell', angle: 75, stance: 'standing' });
  assert.equal(legacyPressMappingFor('Bench Press'), null, 'the canonical name itself should never be treated as a migration source');
  assert.equal(legacyPressMappingFor(''), null);
  assert.equal(legacyPressMappingFor(undefined), null);
  assert.deepEqual(legacyRowMappingFor('CHIN-UP'), { equipment: 'Bodyweight', angle: 135 });
  assert.equal(legacyRowMappingFor('Row'), null, 'the canonical name itself should never be treated as a migration source');
});

test('migratedLiftFor rewrites a press lift, stamping equipment/angle/stance/emgWeights and preserving every other field', () => {
  const lift = { exercise: 'Barbell Overhead Press', kg: 60, reps: 5, rpe: 8, date: '2026-02-01', type: 'N' };
  const migrated = migratedLiftFor(lift);
  assert.equal(migrated.exercise, CANONICAL_PRESS_NAME);
  assert.equal(migrated.equipment, 'Barbell');
  assert.equal(migrated.angle, 75);
  assert.equal(migrated.stance, 'standing');
  assert.deepEqual(migrated.emgWeights, benchPressEmgProfileForAngle(75));
  assert.equal(migrated.kg, 60);
  assert.equal(migrated.reps, 5);
  assert.equal(migrated.rpe, 8);
  assert.equal(migrated.date, '2026-02-01');
  assert.equal(migrated.type, 'N');
});

test('migratedLiftFor rewrites a row lift, stamping equipment/angle/emgWeights and preserving every other field', () => {
  const lift = { exercise: 'Weighted Pull-Up', kg: 20, reps: 6, date: '2026-02-02' };
  const migrated = migratedLiftFor(lift);
  assert.equal(migrated.exercise, CANONICAL_ROW_NAME);
  assert.equal(migrated.equipment, 'Bodyweight');
  assert.equal(migrated.angle, 165);
  assert.deepEqual(migrated.emgWeights, emgForAngle('row', 165));
  assert.equal(migrated.kg, 20);
  assert.equal(migrated.reps, 6);
});

test('migratedLiftFor stamps the limb flag for Single-Arm Lat Pulldown only', () => {
  const migrated = migratedLiftFor({ exercise: 'Single-Arm Lat Pulldown', kg: 25, reps: 8 });
  assert.equal(migrated.limb, 'single');
  const other = migratedLiftFor({ exercise: 'Close-Grip Lat Pulldown', kg: 50, reps: 8 });
  assert.equal(other.limb, undefined);
});

test('migratedLiftFor returns null for anything not in either map, including the canonical names and clarification-flagged names', () => {
  assert.equal(migratedLiftFor({ exercise: 'Bench Press', kg: 80, reps: 5 }), null);
  assert.equal(migratedLiftFor({ exercise: 'Row', kg: 80, reps: 5 }), null);
  assert.equal(migratedLiftFor({ exercise: 'Dumbbell Overhead Press', kg: 20, reps: 8 }), null, 'flagged for clarification, not auto-migrated');
  assert.equal(migratedLiftFor({ exercise: 'Cable Straight-Arm Pulldown', kg: 40, reps: 10 }), null);
  assert.equal(migratedLiftFor({}), null);
});

test('planMigration only counts/rewrites matching lifts, separates clarification-needed lifts, and never mutates in place', () => {
  const lifts = [
    { exercise: 'Barbell Overhead Press', kg: 60, reps: 5, date: '2026-02-01' },
    { exercise: 'Dumbbell Overhead Press', kg: 20, reps: 8, date: '2026-02-02' },
    { exercise: 'Chin-Up', kg: 0, reps: 10, date: '2026-02-03' },
    { exercise: 'Chin-Up', kg: 5, reps: 8, date: '2026-02-10' },
    { exercise: 'Arnold Press', kg: 18, reps: 10, date: '2026-02-04' }, // untouched control
    { exercise: 'Cable Straight-Arm Pulldown', kg: 40, reps: 10, date: '2026-02-05' }, // deliberately excluded control
  ];
  const snapshotBefore = JSON.parse(JSON.stringify(lifts));

  const plan = planMigration(lifts);

  assert.equal(plan.totalMatched, 3, 'Barbell Overhead Press + 2x Chin-Up');
  assert.deepEqual(plan.countsByLegacyName, { 'Barbell Overhead Press': 1, 'Chin-Up': 2 });
  assert.equal(plan.rewrites.length, 3);
  assert.equal(plan.needsClarification.length, 1);
  assert.equal(plan.needsClarification[0].lift.exercise, 'Dumbbell Overhead Press');
  for (const { before, after } of plan.rewrites) {
    assert.ok(after.exercise === CANONICAL_PRESS_NAME || after.exercise === CANONICAL_ROW_NAME);
    assert.ok(before.exercise !== after.exercise, 'before should still be the original legacy name');
  }
  assert.deepEqual(lifts, snapshotBefore, 'pure function — caller\'s array/objects must be untouched');
});

test('planMigration on a lift history with no legacy names returns an empty, harmless plan', () => {
  const plan = planMigration([{ exercise: 'Back Squat', kg: 100, reps: 5 }]);
  assert.equal(plan.totalMatched, 0);
  assert.deepEqual(plan.countsByLegacyName, {});
  assert.deepEqual(plan.rewrites, []);
  assert.deepEqual(plan.needsClarification, []);
});

test('planMigration handles an empty/undefined lift list without throwing', () => {
  assert.deepEqual(planMigration([]), { totalMatched: 0, countsByLegacyName: {}, rewrites: [], needsClarification: [] });
  assert.deepEqual(planMigration(undefined), { totalMatched: 0, countsByLegacyName: {}, rewrites: [], needsClarification: [] });
});
