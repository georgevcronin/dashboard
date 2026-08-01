// Covers Phase 3 (curl/extension Sagittal Angle) of
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md §20/§21: every
// exerciseDb.js entry named in those two tables gets a real `angle` field
// matching the doc's proposed placement, plus the two explicit corrections
// (Machine Curl, Concentration Curl) and the Reverse Grip Pushdown
// grip-rotation fold-in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISE_DB, EXERCISE_MAP } = require('../functions/exerciseDb');

const CURL_PLACEMENTS = {
  'decline-curl': -75,
  'incline-dumbbell-curl': -45,
  'drag-curl': -15,
  'barbell-curl': 0,
  'ez-bar-curl': 0,
  'dumbbell-curl-standing': 0,
  'low-cable-curl': 0,
  'zottman-curl': 0,
  'reverse-curl': 0,
  'hammer-curl': 0,
  'cross-body-hammer-curl': 0,
  'preacher-curl-barbell': 45,
  'spider-curl': 45,
  'incline-curl': 45,
  'cable-curl-high': 75,
  'overhead-cable-curl': 75,
};

// The two named corrections §20 flags explicitly (not a clean derivation --
// a judgment call, per that section's own text).
const CORRECTED_CURL_PLACEMENTS = {
  'machine-curl': 45,
  'concentration-curl': 45,
};

const EXTENSION_PLACEMENTS = {
  'cable-pushdown-rope': 0,
  'cable-pushdown-bar': 0,
  'tricep-pushdown-single-arm': 0,
  'skullcrusher-barbell': 45,
  'skullcrusher-ez': 45,
  'overhead-tricep-extension-cable': 90,
  'overhead-tricep-extension-dumbbell': 90,
  'carter-extension': 105,
};

test('every §20 curl placement (including the two corrections) matches exerciseDb.js', () => {
  for (const [id, angle] of Object.entries({ ...CURL_PLACEMENTS, ...CORRECTED_CURL_PLACEMENTS })) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `missing exerciseDb.js entry for ${id}`);
    assert.equal(e.angle, angle, `${id} should be at ${angle}° per §20`);
    assert.deepEqual(e.angleRange, { min: -90, max: 90, step: 15 }, `${id} should share the curl axis's -90..+90 range`);
  }
});

test('every §21 extension placement matches exerciseDb.js', () => {
  for (const [id, angle] of Object.entries(EXTENSION_PLACEMENTS)) {
    const e = EXERCISE_MAP[id];
    assert.ok(e, `missing exerciseDb.js entry for ${id}`);
    assert.equal(e.angle, angle, `${id} should be at ${angle}° per §21`);
    assert.deepEqual(e.angleRange, { min: 0, max: 105, step: 15 }, `${id} should share the extension axis's 0..105 range`);
  }
});

test('Machine Curl and Concentration Curl no longer sit at their old (pre-correction) angles', () => {
  // Machine Curl's flat profile used to imply the neutral/standing 0°
  // bucket; Concentration Curl's used to imply the +75° peak bucket.
  // Both should now read 45°, not those.
  assert.notEqual(EXERCISE_MAP['machine-curl'].angle, 0);
  assert.notEqual(EXERCISE_MAP['machine-curl'].angle, 75);
  assert.notEqual(EXERCISE_MAP['concentration-curl'].angle, 75);
  assert.equal(EXERCISE_MAP['machine-curl'].angle, 45);
  assert.equal(EXERCISE_MAP['concentration-curl'].angle, 45);
});

test('carve-outs (JM Press, Tate Press, Tricep Dips, Bench Dips) are NOT given a Sagittal Angle -- not in §21\'s own named table', () => {
  for (const id of ['jm-press', 'tate-press', 'tricep-dips', 'bench-dips']) {
    assert.equal(EXERCISE_MAP[id].angle, undefined, `${id} should be left untouched, per §21's own carve-out reasoning`);
  }
});

test('Reverse Grip Pushdown is superseded by Cable Tricep Pushdown (Bar), unmodified otherwise (no angle field added)', () => {
  const rgp = EXERCISE_MAP['reverse-grip-pushdown'];
  assert.equal(rgp.supersededBy, 'cable-pushdown-bar');
  assert.equal(rgp.angle, undefined, 'a superseded entry is folded away, not independently placed on the axis');
  assert.equal(rgp.name, 'Reverse Grip Pushdown', 'identity stays intact for historical lift documents');
});

test('Cable Tricep Pushdown (Bar) gains a rotation field folding in Reverse Grip Pushdown\'s grip distinction, same GRIP_ANGLES convention as Press/Row', () => {
  const bar = EXERCISE_MAP['cable-pushdown-bar'];
  assert.equal(bar.rotation, 0, 'default rotation should be the standard pronated pushdown grip');
  assert.deepEqual(bar.rotationOptions, [0, 180], 'only the two real grips a straight pushdown handle offers -- pronated and supinated');
});

test('every entry with an angle field also declares a consistent angleRange (min <= angle <= max)', () => {
  for (const e of EXERCISE_DB) {
    if (e.angle == null) continue;
    assert.ok(e.angleRange, `${e.id} has an angle but no angleRange`);
    assert.ok(e.angle >= e.angleRange.min && e.angle <= e.angleRange.max, `${e.id}'s angle ${e.angle} falls outside its own angleRange`);
  }
});
