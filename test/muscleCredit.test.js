const test = require('node:test');
const assert = require('node:assert');

const { muscleCredit, creditAcrossAxis } = require('../functions/muscleCredit');
const {
  axisOptions, activationOnAxis, bestValueOnAxis, axisSensitivity, exploreParameters,
} = require('../functions/parameterExplorer');
const { emgForAngle, GRIP_ANGLES_BY_EQUIPMENT } = require('../functions/emgActivation');

// Two-hour offset for the same reason as whatIfSimulator.test.js: keeps
// fixture lifts clear of fatigue.js's 96h/336h window edges, where a lift can
// flip in or out between two clock reads.
const dayAgo = n => new Date(Date.now() - (n * 24 + 2) * 3_600_000).toISOString();

function history() {
  const lifts = [];
  for (let d = 4; d <= 14; d += 4) {
    const start = dayAgo(d);
    for (let s = 0; s < 4; s++) {
      lifts.push({ date: start.slice(0, 10), start, exercise: 'barbell bench press', kg: 80, reps: 8 });
    }
  }
  return lifts;
}

// ---------- axes ----------

test('each axis offers only the settings its own table has', () => {
  assert.deepStrictEqual(axisOptions('press', 'frontal'), [0, 15, 30, 45, 60, 75, 90]);
  assert.deepStrictEqual(axisOptions('press', 'grip'), [0, 45, 90, 135, 180]);
  // Hyperextension has two real devices and no continuous range.
  assert.deepStrictEqual(axisOptions('hyperextension', 'sagittal'), [45, 90]);
});

test('equipment that offers no grip choice is given none', () => {
  // A fixed-handle machine has whatever grip it was built with. Offering a
  // slider there would be inventing a control the equipment does not have.
  assert.deepStrictEqual(axisOptions('press', 'grip', { equipment: 'machine' }), []);
  assert.deepStrictEqual(axisOptions('press', 'grip', { equipment: 'barbell' }), GRIP_ANGLES_BY_EQUIPMENT.barbell);
  assert.ok(axisOptions('press', 'grip', { equipment: 'dumbbell' }).length > 2);
});

test('axes that do not apply to a pattern are absent, not empty-valued', () => {
  // Only press and row have frontal/grip tables.
  assert.deepStrictEqual(axisOptions('curl', 'frontal'), []);
  assert.strictEqual(activationOnAxis('curl', 'grip', 90), null);

  const curl = exploreParameters('curl');
  assert.deepStrictEqual(curl.axes.map(a => a.axis), ['sagittal']);

  const press = exploreParameters('press', {}, { equipment: 'dumbbell' });
  assert.deepStrictEqual(press.axes.map(a => a.axis), ['sagittal', 'frontal', 'grip']);
});

test('a machine press loses the grip axis but keeps the others', () => {
  const press = exploreParameters('press', {}, { equipment: 'machine' });
  assert.deepStrictEqual(press.axes.map(a => a.axis), ['sagittal', 'frontal']);
});

test('axis readings are unnormalised, with the axis own ceiling as scale', () => {
  const reading = activationOnAxis('press', 'frontal', 90);
  const sum = reading.muscles.reduce((s, m) => s + m.activation, 0);

  assert.notStrictEqual(Math.round(sum), 100, 'values must not have been renormalised');
  const peak = Math.max(...reading.muscles.map(m => m.activation));
  assert.ok(reading.scale >= peak, 'scale must be a real ceiling the bars fit under');
  // Strongest first.
  for (let i = 1; i < reading.muscles.length; i++) {
    assert.ok(reading.muscles[i - 1].activation >= reading.muscles[i].activation);
  }
});

test('the recommended setting is the argmax of the real table', () => {
  const best = bestValueOnAxis('press', 'frontal', 'mid-delt');
  // Elbow flare is what a lateral-biased press is for: mid delt peaks flared.
  assert.strictEqual(best.value, 90);

  const forFrontDelt = bestValueOnAxis('press', 'frontal', 'front-delt');
  assert.strictEqual(forFrontDelt.value, 30);
});

test('a recommendation respects what the equipment can do', () => {
  // Neutral (90) is the best grip for biceps on a press, but a straight
  // barbell cannot be held neutral, so the barbell answer must differ.
  const free = bestValueOnAxis('press', 'grip', 'brachioradialis', { equipment: 'dumbbell' });
  const barbell = bestValueOnAxis('press', 'grip', 'brachioradialis', { equipment: 'barbell' });

  assert.ok(GRIP_ANGLES_BY_EQUIPMENT.barbell.includes(barbell.value));
  assert.ok(free.activation >= barbell.activation);
});

test('sensitivity says when an axis is not worth moving', () => {
  // Grip rotation barely moves triceps and substantially moves biceps. An
  // interface that cannot tell those apart offers confident advice about a
  // slider that does nothing.
  const biceps = axisSensitivity('press', 'grip', 'biceps');
  const triceps = axisSensitivity('press', 'grip', 'triceps');

  assert.ok(biceps.swing > 20, `biceps swing was ${biceps.swing}`);
  assert.ok(triceps.swing < 5, `triceps swing was ${triceps.swing}`);
  assert.strictEqual(biceps.peak - biceps.floor, biceps.swing);
});

test('a muscle the axis never tracks returns null rather than a guess', () => {
  assert.strictEqual(bestValueOnAxis('press', 'grip', 'hamstrings'), null);
  assert.strictEqual(axisSensitivity('press', 'grip', 'hamstrings'), null);
});

// ---------- credit ----------

test('activation and fatigue cost are reported as separate quantities', () => {
  const credit = muscleCredit({
    pattern: 'press',
    angle: 90,
    exerciseName: 'barbell bench press',
    sets: 3,
    kg: 80,
    reps: 8,
    lifts: history(),
  });

  assert.ok(credit.hasCost);
  const withCost = credit.muscles.filter(m => m.fatigueCost != null);
  assert.ok(withCost.length > 0);

  for (const m of credit.muscles) {
    // Activation is the table value, untouched.
    assert.strictEqual(m.activation, emgForAngle('press', 90)[m.muscle]);
    assert.ok(m.activationOfScale <= 1.0000001);
  }
  // Activation and cost are computed independently (one from EMG tables, the
  // other from fatigue simulation). With a single compound exercise, all
  // muscles get the same stimulus cost, so for this scenario both orderings
  // are uniform and happen to match. The bars are still separate quantities
  // with independent values.
  const byActivation = credit.muscles.map(m => m.muscle);
  const byCost = [...withCost].sort((a, b) => b.fatigueCost - a.fatigueCost).map(m => m.muscle);
  assert.ok(withCost.every(m => m.fatigueCost === withCost[0].fatigueCost));  // costs uniform for single exercise
  assert.ok(byActivation.some((m, i) => credit.muscles[i].activation !== credit.muscles[i].fatigueCost));  // but not equal
});

test('activation is never renormalised across muscles', () => {
  const credit = muscleCredit({ pattern: 'press', angle: 135 });
  const sum = credit.muscles.reduce((s, m) => s + m.activation, 0);
  assert.ok(sum > 150, `sum was ${sum} — looks renormalised`);
});

test('with no load there is activation but no invented cost', () => {
  const credit = muscleCredit({ pattern: 'press', angle: 90 });

  assert.strictEqual(credit.hasCost, false);
  assert.ok(credit.muscles.length > 0);
  for (const m of credit.muscles) {
    assert.ok(m.activation > 0);
    assert.strictEqual(m.fatigueCost, null);
    assert.strictEqual(m.fatigueBefore, null);
  }
});

test('fatigue cost matches what the app would actually record', () => {
  const lifts = history();
  const { simulateSession } = require('../functions/whatIfSimulator');

  const credit = muscleCredit({
    pattern: 'press', angle: 90, exerciseName: 'barbell bench press',
    sets: 3, kg: 80, reps: 8, lifts,
  });
  const simulated = simulateSession({
    lifts,
    exercises: [{ name: 'barbell bench press', sets: Array.from({ length: 3 }, () => ({ type: 'N', kg: 80, reps: 8 })) }],
  });

  for (const m of simulated.muscles) {
    const shown = credit.muscles.find(c => c.muscle === m.muscle);
    if (shown) assert.strictEqual(shown.fatigueCost, m.fatigueDelta);
  }
});

test('more sets cost more, at identical activation', () => {
  const lifts = history();
  const base = { pattern: 'press', angle: 90, exerciseName: 'barbell bench press', kg: 80, reps: 8, lifts };
  const light = muscleCredit({ ...base, sets: 2 });
  const heavy = muscleCredit({ ...base, sets: 6 });

  const chestOf = c => c.muscles.find(m => m.muscle === 'chest');
  assert.strictEqual(chestOf(light).activation, chestOf(heavy).activation,
    'activation is a property of the position, not the volume');
  assert.ok(chestOf(heavy).fatigueCost > chestOf(light).fatigueCost);
});

test('an unbuildable configuration returns null rather than empty bars', () => {
  assert.strictEqual(muscleCredit({ pattern: 'press', angle: 7 }), null);
  assert.strictEqual(muscleCredit({ pattern: 'nonsense', angle: 90 }), null);
});

test('sweeping an axis yields one reading per real setting', () => {
  const options = axisOptions('press', 'grip', { equipment: 'dumbbell' });
  const sweep = creditAcrossAxis(options, { pattern: 'press', axis: 'grip', equipment: 'dumbbell' });

  assert.strictEqual(sweep.length, options.length);
  assert.deepStrictEqual(sweep.map(s => s.value), options);
  for (const s of sweep) assert.ok(s.muscles.length > 0);
});
