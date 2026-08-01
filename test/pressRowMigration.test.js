const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CANONICAL_PRESS_NAME, CANONICAL_ROW_NAME,
  LEGACY_PRESS_NAME_MAP, LEGACY_ROW_NAME_MAP,
  NEEDS_CLARIFICATION_PRESS_NAMES, NEEDS_CLARIFICATION_ROW_NAMES,
  legacyPressMappingFor, legacyRowMappingFor, pressNeedsClarification, rowNeedsClarification,
  migratedLiftFor, planMigration,
} = require('../functions/pressRowMigration');
const { benchPressEmgProfileForAngle } = require('../functions/exerciseEmgProfiles');
const { emgForAngle, applyGripRotationModifier } = require('../functions/emgActivation');
const { ROW_PULLDOWN_ANGLE_THRESHOLD } = require('../functions/exerciseLabelMatching');

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

test('LEGACY_ROW_NAME_MAP\'s original ten pull-up/lat-pulldown names (§15) are all still present', () => {
  const PULLDOWN_CLUSTER_NAMES = [
    'behind-neck lat pulldown', 'chin-up', 'close-grip lat pulldown', 'lat pulldown (neutral grip)',
    'lat pulldown (reverse / underhand)', 'lat pulldown (wide grip)', 'pull-up (neutral grip)',
    'pull-up (wide grip)', 'single-arm lat pulldown', 'weighted pull-up',
  ];
  for (const name of PULLDOWN_CLUSTER_NAMES) {
    assert.ok(LEGACY_ROW_NAME_MAP[name], `expected ${name} to still be in the migration table`);
  }
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

// ── Row-family fold-in: picks up the scope the pull-up/pulldown pass (above)
// explicitly deferred — "only the pull-up/pulldown cluster, not the whole
// ~15-entry Row family." See functions/pressRowMigration.js's own inline
// comments for the sourcing/correction reasoning behind each value below.

test('LEGACY_ROW_NAME_MAP now also covers the broader named Row family, on top of the original ten pull-up/pulldown names', () => {
  const NEW_ROW_FAMILY_NAMES = [
    'barbell row (overhand / pendlay)', 'barbell row (underhand / yates)', 'bent-over dumbbell row (bilateral)',
    'chest-supported barbell row', 'dumbbell row (pronated)', 'dumbbell row (three-point)', 'high cable row',
    'inverted row (trx/rings)', 'machine row (seated)', 'meadows row', 'rack row (barbell inverted)',
    'seated cable row', 'single-arm cable row', 'single-arm landmine row', 'standing single-arm cable row',
    't-bar row', 'wide-grip cable row',
  ];
  for (const name of NEW_ROW_FAMILY_NAMES) {
    assert.ok(LEGACY_ROW_NAME_MAP[name], `expected ${name} to be in the migration table`);
  }
  assert.equal(Object.keys(LEGACY_ROW_NAME_MAP).length, 10 + NEW_ROW_FAMILY_NAMES.length);
});

test('Upright Row, Face Pull, and Cable Straight-Arm Pulldown are still deliberately excluded from the Row migration', () => {
  for (const name of ['Upright Row', 'Face Pull', 'Cable Straight-Arm Pulldown']) {
    assert.equal(legacyRowMappingFor(name), null, `${name} should not auto-migrate into Row`);
    assert.equal(rowNeedsClarification(name), null, `${name} isn't an angle variant at all — shouldn't even be flagged`);
  }
});

test('every newly auto-migrated Row-family name (this pass) lands strictly below the Lat Pulldown/Pull-up threshold, so none of them get mislabeled post-migration', () => {
  const NEW_ROW_FAMILY_NAMES = [
    'barbell row (overhand / pendlay)', 'barbell row (underhand / yates)', 'bent-over dumbbell row (bilateral)',
    'chest-supported barbell row', 'dumbbell row (pronated)', 'dumbbell row (three-point)', 'high cable row',
    'inverted row (trx/rings)', 'machine row (seated)', 'meadows row', 'rack row (barbell inverted)',
    'seated cable row', 'single-arm cable row', 'single-arm landmine row', 'standing single-arm cable row',
    't-bar row', 'wide-grip cable row',
  ];
  for (const name of NEW_ROW_FAMILY_NAMES) {
    const mapping = LEGACY_ROW_NAME_MAP[name];
    assert.ok(mapping.angle < ROW_PULLDOWN_ANGLE_THRESHOLD, `${name} at angle ${mapping.angle} should stay in Row territory, not drift into Lat Pulldown/Pull-up`);
  }
  // The original pull-up/pulldown cluster is the opposite by design — those
  // names deliberately ARE the pulldown/pull-up region (§15).
  for (const name of ['close-grip lat pulldown', 'chin-up', 'weighted pull-up']) {
    assert.ok(LEGACY_ROW_NAME_MAP[name].angle >= ROW_PULLDOWN_ANGLE_THRESHOLD);
  }
});

test('High Cable Row and Wide-Grip Cable Row are corrected to 105°, not the bulk-profile-implied 120° that would mislabel them as Lat Pulldown', () => {
  assert.deepEqual(legacyRowMappingFor('High Cable Row'), { equipment: 'Cable', angle: 105 });
  assert.deepEqual(legacyRowMappingFor('Wide-Grip Cable Row'), { equipment: 'Cable', angle: 105 });
});

test('T-Bar Row uses exerciseAngles.js\'s own curated angle (75) and §13\'s Machine equipment classification, not the bulk EMG-profile default', () => {
  assert.deepEqual(legacyRowMappingFor('T-Bar Row'), { equipment: 'Machine', angle: 75 });
});

test('Barbell Row Overhand/Underhand share one pull angle and are differentiated by grip rotation, not two different angles', () => {
  const overhand = legacyRowMappingFor('Barbell Row (Overhand / Pendlay)');
  const underhand = legacyRowMappingFor('Barbell Row (Underhand / Yates)');
  assert.equal(overhand.angle, 60);
  assert.equal(underhand.angle, 60);
  assert.equal(overhand.rotation, 0, 'overhand = pronated');
  assert.equal(underhand.rotation, 180, 'underhand = supinated');
});

test('migratedLiftFor applies the grip-rotation modifier for rotation-bearing Row names, giving Underhand higher biceps/lats than Overhand', () => {
  const overhand = migratedLiftFor({ exercise: 'Barbell Row (Overhand / Pendlay)', kg: 100, reps: 5 });
  const underhand = migratedLiftFor({ exercise: 'Barbell Row (Underhand / Yates)', kg: 100, reps: 5 });
  assert.equal(overhand.rotation, 0);
  assert.equal(underhand.rotation, 180);
  const baseWeights = emgForAngle('row', 60);
  assert.deepEqual(overhand.emgWeights, applyGripRotationModifier('row', baseWeights, 0));
  assert.deepEqual(underhand.emgWeights, applyGripRotationModifier('row', baseWeights, 180));
  assert.ok(underhand.emgWeights.biceps > overhand.emgWeights.biceps, 'supinated/underhand should credit more biceps, matching its own curveNote');
  assert.ok(underhand.emgWeights.lats > overhand.emgWeights.lats, 'supinated/underhand should credit more lats, matching its own curveNote');
});

test('Dumbbell Row (Pronated) is corrected to angle 60 (matching the rest of the bent-over dumbbell cluster) plus rotation, not the bulk-profile-implied 75°', () => {
  assert.deepEqual(legacyRowMappingFor('Dumbbell Row (Pronated)'), { equipment: 'Dumbbell', angle: 60, rotation: 0 });
});

test('single-arm/three-point Row variants all get the limb:\'single\' flag', () => {
  for (const name of ['Single-Arm Cable Row', 'Single-Arm Landmine Row', 'Standing Single-Arm Cable Row', 'Dumbbell Row (Three-Point)', 'Meadows Row']) {
    const mapping = legacyRowMappingFor(name);
    assert.equal(mapping.limb, 'single', `${name} should be flagged single-limb`);
  }
  assert.equal(legacyRowMappingFor('Bent-Over Dumbbell Row (Bilateral)').limb, undefined);
});

test('Meadows Row and Single-Arm Landmine Row are classified as Machine equipment, per §13\'s landmine/T-Bar precedent', () => {
  assert.equal(legacyRowMappingFor('Meadows Row').equipment, 'Machine');
  assert.equal(legacyRowMappingFor('Single-Arm Landmine Row').equipment, 'Machine');
});

test('Rack Row and Inverted Row are classified as Bodyweight equipment, matching the pull-up/chin-up precedent', () => {
  assert.equal(legacyRowMappingFor('Rack Row (Barbell Inverted)').equipment, 'Bodyweight');
  assert.equal(legacyRowMappingFor('Inverted Row (TRX/Rings)').equipment, 'Bodyweight');
});

test('Chest-Supported Barbell Row carries a stance value; migratedLiftFor stamps it onto the migrated lift', () => {
  const mapping = legacyRowMappingFor('Chest-Supported Barbell Row');
  assert.deepEqual(mapping, { equipment: 'Barbell', angle: 105, stance: 'chest-supported' });
  const migrated = migratedLiftFor({ exercise: 'Chest-Supported Barbell Row', kg: 60, reps: 8 });
  assert.equal(migrated.stance, 'chest-supported');
});

test('Chest-Supported Dumbbell Row is flagged for clarification (ambiguous bilateral/single-limb), not auto-migrated', () => {
  assert.equal(legacyRowMappingFor('Chest-Supported Dumbbell Row'), null);
  const clarify = rowNeedsClarification('Chest-Supported Dumbbell Row');
  assert.ok(clarify);
  assert.equal(clarify.equipment, 'Dumbbell');
  assert.equal(clarify.angle, 90);
  assert.ok(Object.keys(NEEDS_CLARIFICATION_ROW_NAMES).includes('chest-supported dumbbell row'));
  assert.equal(migratedLiftFor({ exercise: 'Chest-Supported Dumbbell Row', kg: 30, reps: 10 }), null);
});

test('planMigration surfaces both press and row clarification-needed names in the same bucket', () => {
  const lifts = [
    { exercise: 'Dumbbell Overhead Press', kg: 20, reps: 8, date: '2026-03-01' },
    { exercise: 'Chest-Supported Dumbbell Row', kg: 30, reps: 10, date: '2026-03-02' },
    { exercise: 'T-Bar Row', kg: 80, reps: 6, date: '2026-03-03' },
  ];
  const plan = planMigration(lifts);
  assert.equal(plan.totalMatched, 1, 'only T-Bar Row auto-migrates');
  assert.equal(plan.needsClarification.length, 2);
  const clarifiedNames = plan.needsClarification.map(c => c.lift.exercise).sort();
  assert.deepEqual(clarifiedNames, ['Chest-Supported Dumbbell Row', 'Dumbbell Overhead Press']);
});
