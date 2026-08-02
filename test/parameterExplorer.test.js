const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ANGLE_PATTERNS, angleOptionsFor, activationAt,
  optimalAngleFor, compareAngle, bestConfigurationsFor, targetableMuscles,
} = require('../functions/parameterExplorer');
const { emgForAngle, classifyMuscles, ANGLES } = require('../functions/emgActivation');

// ---------------------------------------------------------------------------
// Angle options
// ---------------------------------------------------------------------------

test('a continuous pattern offers the full 15-degree sweep', () => {
  assert.deepEqual(angleOptionsFor('press'), ANGLES);
  assert.deepEqual(angleOptionsFor('row'), ANGLES);
});

// Only two real devices exist for this movement (45-degree bench, 90-degree
// Roman chair), so offering 13 slider stops would fabricate positions nobody
// can actually train in.
test('hyperextension offers only the two angles that are real devices', () => {
  assert.deepEqual(angleOptionsFor('hyperextension'), [45, 90]);
});

test('every angle a pattern offers actually has EMG data behind it', () => {
  for (const pattern of ANGLE_PATTERNS) {
    const options = angleOptionsFor(pattern);
    assert.ok(options.length > 0, `${pattern} has no angles`);
    for (const angle of options) {
      assert.ok(emgForAngle(pattern, angle), `${pattern}@${angle} has no data`);
    }
  }
});

test('an unknown pattern yields no angles rather than throwing', () => {
  assert.deepEqual(angleOptionsFor('nonsense'), []);
  assert.equal(activationAt('nonsense', 90), null);
});

// ---------------------------------------------------------------------------
// Activation. The values are % of each muscle's own MVIC — not shares of the
// exercise. These guard against anyone "tidying" them into a distribution.
// ---------------------------------------------------------------------------

test('activation values are returned unnormalised, not as shares summing to 100', () => {
  const { muscles } = activationAt('press', 120);
  const total = muscles.reduce((sum, m) => sum + m.activation, 0);
  assert.ok(total > 100, `values were normalised into a distribution (total ${total})`);
  for (const m of muscles) {
    assert.equal(m.activation, emgForAngle('press', 120)[m.muscle], `${m.muscle} was rescaled`);
  }
});

// emgActivation.js's header is explicit that a dynamic contraction can exceed
// a static MVIC reference, so clamping to 100 would be a data error.
test('activation above 100 is preserved and the scale accommodates it', () => {
  const result = activationAt('press', 150);
  const midDelt = result.muscles.find(m => m.muscle === 'mid-delt');
  assert.ok(midDelt.activation > 100, 'expected mid-delt over 100 at 150deg');
  assert.ok(result.scale >= midDelt.activation, 'scale would clip a real value');
});

test('scale is the pattern-wide ceiling, so bars stay comparable across angles', () => {
  const scales = angleOptionsFor('press').map(a => activationAt('press', a).scale);
  assert.equal(new Set(scales).size, 1, 'scale moved between angles');
});

test('muscles are ordered strongest-first so the lead emphasis reads first', () => {
  const { muscles } = activationAt('row', 90);
  const values = muscles.map(m => m.activation);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});

test('roles match classifyMuscles, not a second copy of the thresholds', () => {
  for (const pattern of ANGLE_PATTERNS) {
    for (const angle of angleOptionsFor(pattern)) {
      const weights = emgForAngle(pattern, angle);
      const { primary, secondary } = classifyMuscles(weights);
      for (const m of activationAt(pattern, angle).muscles) {
        const expected = primary.includes(m.muscle) ? 'primary'
          : secondary.includes(m.muscle) ? 'secondary' : 'minor';
        assert.equal(m.role, expected, `${pattern}@${angle} ${m.muscle}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Optimum and deviation
// ---------------------------------------------------------------------------

test('the optimal angle really is the pattern-wide maximum for that muscle', () => {
  for (const pattern of ANGLE_PATTERNS) {
    for (const muscle of targetableMuscles([pattern])) {
      const best = optimalAngleFor(pattern, muscle);
      if (!best) continue;
      for (const angle of angleOptionsFor(pattern)) {
        const value = emgForAngle(pattern, angle)?.[muscle] ?? 0;
        assert.ok(value <= best.activation,
          `${pattern} ${muscle}: ${angle}deg scores ${value}, above the claimed peak ${best.activation}`);
      }
    }
  }
});

test('a muscle the pattern never touches has no optimum rather than a fake one', () => {
  assert.equal(optimalAngleFor('press', 'calves'), null);
  assert.equal(compareAngle('press', 90, 'calves'), null);
});

test('sitting on the optimum reports no deficit', () => {
  const best = optimalAngleFor('press', 'front-delt');
  const cmp = compareAngle('press', best.angle, 'front-delt');
  assert.equal(cmp.atOptimum, true);
  assert.equal(cmp.deficitPct, 0);
  assert.equal(cmp.current, cmp.peak);
});

test('deviation reports the real activation gap and where the peak is', () => {
  const cmp = compareAngle('press', 0, 'front-delt');
  assert.equal(cmp.atOptimum, false);
  assert.equal(cmp.current, emgForAngle('press', 0)['front-delt']);
  assert.equal(cmp.peak, emgForAngle('press', cmp.peakAngle)['front-delt']);
  assert.ok(cmp.deficitPct > 0);
  assert.ok(cmp.deficitPct <= 100);
});

// The gap is an EMG activation difference. Calling it a strength or growth
// difference would be a claim the tables cannot support.
test('deviation never exceeds 100 percent of the muscle peak', () => {
  for (const pattern of ANGLE_PATTERNS) {
    for (const muscle of targetableMuscles([pattern])) {
      for (const angle of angleOptionsFor(pattern)) {
        const cmp = compareAngle(pattern, angle, muscle);
        if (!cmp) continue;
        assert.ok(cmp.deficitPct >= 0 && cmp.deficitPct <= 100,
          `${pattern}@${angle} ${muscle} -> ${cmp.deficitPct}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Target Muscle Planner
// ---------------------------------------------------------------------------

test('the planner ranks movements by how hard they activate the target', () => {
  const configs = bestConfigurationsFor('front-delt');
  assert.ok(configs.length > 1, 'expected more than one movement to hit front-delt');
  const values = configs.map(c => c.activation);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});

test('the planner picks the row pattern for lats, at its low-pull end', () => {
  const best = bestConfigurationsFor('lats')[0];
  assert.equal(best.pattern, 'row');
  assert.equal(best.angle, emgForAngle('row', best.angle) && best.angle);
  // 0deg is a low pull (straight-arm pulldown), which the row table peaks lats at.
  assert.equal(best.angle, 0);
});

test('every planner result is reproducible through the single-pattern optimum', () => {
  for (const muscle of targetableMuscles()) {
    for (const config of bestConfigurationsFor(muscle)) {
      assert.deepEqual(optimalAngleFor(config.pattern, muscle), config);
    }
  }
});

test('a muscle no angle table touches yields no configurations', () => {
  for (const muscle of ['abs', 'quads', 'adductors', 'tibialis', 'hip-flexors']) {
    assert.deepEqual(bestConfigurationsFor(muscle), [], `${muscle} should be unreachable`);
  }
});

// Calves sit in the leg-curl table because gastrocnemius crosses the knee, but
// they only reach 20% MVIC — under the 25% secondary cutoff. So the picker
// doesn't offer them (a slider can't meaningfully target them), while asking
// directly still returns the honest answer rather than a blank.
test('a muscle below the secondary cutoff is answerable but not offered as a target', () => {
  const configs = bestConfigurationsFor('calves');
  assert.equal(configs.length, 1);
  assert.equal(configs[0].pattern, 'leg-curl');
  assert.ok(configs[0].activation < 25);
  assert.ok(!targetableMuscles().includes('calves'));
});

test('targetableMuscles only offers muscles some slider can actually affect', () => {
  const muscles = targetableMuscles();
  assert.ok(muscles.length > 0);
  for (const muscle of muscles) {
    assert.ok(bestConfigurationsFor(muscle).length > 0, `${muscle} is offered but unreachable`);
  }
  assert.deepEqual(muscles, [...muscles].sort(), 'expected a stable sorted order');
});

test('the whole payload survives JSON on its way to the frontend', () => {
  const payload = {
    activation: activationAt('press', 90),
    optimum: optimalAngleFor('press', 'front-delt'),
    comparison: compareAngle('press', 30, 'front-delt'),
    plan: bestConfigurationsFor('chest'),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
});
