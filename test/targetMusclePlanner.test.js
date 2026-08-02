const test = require('node:test');
const assert = require('node:assert');

const {
  findOptimalConfigurations, scoreConfiguration, withoutFatiguePenalty,
  fatigueChangedTheAnswer, limitingFatigue, DEFAULT_LAMBDA,
} = require('../functions/targetMusclePlanner');
const { emgForAngle } = require('../functions/emgActivation');
const { FATIGUE_CEILING } = require('../functions/weeklyPlanner');

test('a fresh configuration outranks a more stimulating but spent one', () => {
  // The case the whole penalty exists for. Scored directly so the comparison
  // isolates the mechanism rather than depending on which angles happen to win.
  const spent = scoreConfiguration('press', 120, ['front-delt'], {
    currentFatigue: { 'front-delt': 95, 'mid-delt': 95 },
  });
  const fresh = scoreConfiguration('press', 60, ['front-delt'], {
    currentFatigue: { 'front-delt': 10, 'mid-delt': 10 },
  });

  // The spent one genuinely offers more raw activation...
  assert.ok(spent.stimulus > fresh.stimulus,
    `expected 120deg to out-activate 60deg (${spent.stimulus} vs ${fresh.stimulus})`);
  // ...and still loses, because the muscles it needs are gone.
  assert.ok(fresh.score > spent.score,
    `fresh should win on score (${fresh.score.toFixed(1)} vs ${spent.score.toFixed(1)})`);
});

test('the penalty is exactly 1 + lambda * limiting fatigue', () => {
  const fatigue = { 'front-delt': 80, chest: 20 };
  const result = scoreConfiguration('press', 90, ['chest'], { currentFatigue: fatigue, lambda: 1.5 });

  assert.strictEqual(result.limitingMuscle, 'front-delt');
  assert.ok(Math.abs(result.limitingFatigue - 0.8) < 1e-9);
  assert.ok(Math.abs(result.penaltyFactor - (1 + 1.5 * 0.8)) < 1e-9);
  assert.ok(Math.abs(result.score - result.stimulus / result.penaltyFactor) < 1e-9);
});

test('lambda 0 ranks purely on stimulus', () => {
  const fatigue = { 'front-delt': 100 };
  const penalised = scoreConfiguration('press', 120, ['front-delt'], { currentFatigue: fatigue, lambda: 1.5 });
  const unpenalised = scoreConfiguration('press', 120, ['front-delt'], { currentFatigue: fatigue, lambda: 0 });

  assert.strictEqual(unpenalised.score, unpenalised.stimulus);
  assert.ok(penalised.score < unpenalised.score);
  assert.strictEqual(penalised.stimulus, unpenalised.stimulus);
});

test('stimulus is the sum of the targets actual table values, nothing else', () => {
  const targets = ['chest', 'front-delt'];
  const result = scoreConfiguration('press', 45, targets, {});
  const weights = emgForAngle('press', 45);

  assert.strictEqual(result.stimulus, weights.chest + weights['front-delt']);
  for (const t of result.perTarget) {
    assert.strictEqual(t.activation, weights[t.muscle]);
  }
});

test('a pattern that does not track the target is dropped, not scored zero', () => {
  // A row has no chest column at all. Scoring it 0 would let it fill the
  // results list when nothing genuinely suitable exists.
  assert.strictEqual(scoreConfiguration('row', 90, ['chest'], {}), null);

  const found = findOptimalConfigurations(['chest'], {});
  assert.ok(found.results.length > 0);
  for (const r of found.results) {
    assert.notStrictEqual(r.pattern, 'row');
  }
});

test('barely-involved muscles do not drive the penalty', () => {
  // Without an involvement floor, a press's incidental serratus involvement at
  // a low angle would carry that muscle's fatigue into the penalty and flatten
  // every ranking.
  const weights = emgForAngle('press', 0);
  assert.ok(weights.serratus < 20, 'fixture assumes serratus is minor at 0deg');

  const limited = limitingFatigue(weights, { serratus: 100 }, 20);
  assert.strictEqual(limited.muscle, null);
  assert.strictEqual(limited.ratio, 0);

  // Raise the same muscle above the floor and it counts.
  const counted = limitingFatigue(weights, { biceps: 100 }, 20);
  assert.strictEqual(counted.muscle, 'biceps');
  assert.strictEqual(counted.ratio, 1);
});

test('multiple targets are all counted', () => {
  const single = findOptimalConfigurations(['chest'], {});
  const dual = findOptimalConfigurations(['chest', 'front-delt'], {});

  assert.deepStrictEqual(dual.targets, ['chest', 'front-delt']);
  for (const r of dual.results) {
    assert.ok(r.perTarget.length >= 1);
    assert.ok(r.perTarget.every(t => dual.targets.includes(t.muscle)));
  }
  // Adding a second target should change what wins, or the second target is
  // doing nothing.
  assert.ok(single.results[0].stimulus !== dual.results[0].stimulus);
});

test('results are ranked, capped and counted honestly', () => {
  const found = findOptimalConfigurations(['lats'], { limit: 3 });

  assert.ok(found.results.length <= 3);
  assert.ok(found.consideredCount >= found.results.length);
  for (let i = 1; i < found.results.length; i++) {
    assert.ok(found.results[i - 1].score >= found.results[i].score);
  }
});

test('ranking is deterministic for an unchanged state', () => {
  const opts = { currentFatigue: { lats: 40, biceps: 55 } };
  const a = findOptimalConfigurations(['lats'], opts);
  const b = findOptimalConfigurations(['lats'], opts);
  assert.deepStrictEqual(a.results, b.results);
});

test('every configuration names a real, buildable exercise', () => {
  const found = findOptimalConfigurations(['biceps'], {});
  assert.ok(found.results.length > 0);
  for (const r of found.results) {
    assert.ok(r.exercises.length > 0, `${r.pattern}@${r.angle} named no exercise`);
    for (const e of r.exercises) {
      assert.ok(typeof e.name === 'string' && e.name.length > 0);
      assert.ok(typeof e.equipment === 'string');
    }
  }
});

test('equipment filtering never invents an option', () => {
  const machineOnly = findOptimalConfigurations(['chest'], { equipment: 'machine' });
  for (const r of machineOnly.results) {
    assert.ok(r.exercises.every(e => e.equipment === 'machine'));
  }
});

test('spent muscles are named against the planners real ceiling', () => {
  const fatigue = { 'front-delt': FATIGUE_CEILING + 5, chest: 10 };

  // A configuration that genuinely leans on the spent muscle reports it.
  const heavyOnFrontDelt = scoreConfiguration('press', 120, ['chest'], { currentFatigue: fatigue });
  assert.ok(emgForAngle('press', 120)['front-delt'] >= 20, 'fixture assumes real involvement');
  assert.ok(heavyOnFrontDelt.spentMuscles.includes('front-delt'));

  assert.strictEqual(findOptimalConfigurations(['chest'], { currentFatigue: fatigue }).ceiling, FATIGUE_CEILING);
});

test('a spent synergist pushes the recommendation away from it', () => {
  // The behaviour the penalty is for: not merely labelling the problem, but
  // ranking around it. With front delt buried, the winning configuration
  // should lean on it less than the one chosen when everything is fresh.
  const involvement = r => emgForAngle(r.pattern, r.angle)['front-delt'] ?? 0;

  const fresh = findOptimalConfigurations(['chest'], { currentFatigue: {} });
  const tired = findOptimalConfigurations(['chest'], {
    currentFatigue: { 'front-delt': 100 },
  });

  assert.ok(involvement(tired.results[0]) <= involvement(fresh.results[0]),
    `expected less front-delt involvement when it is spent (${involvement(tired.results[0])} vs ${involvement(fresh.results[0])})`);
  assert.ok(tired.penaltyApplied);
  assert.strictEqual(fresh.penaltyApplied, false);
});

test('no targets is an empty answer, not a crash or a default', () => {
  for (const input of [[], null, undefined, [null, false]]) {
    const found = findOptimalConfigurations(input, {});
    assert.deepStrictEqual(found.results, []);
    assert.deepStrictEqual(found.targets, []);
  }
});

test('the counterfactual is silent when fatigue changed nothing', () => {
  const rested = fatigueChangedTheAnswer(['chest'], { currentFatigue: {} });
  assert.strictEqual(rested, null, 'nothing is tired, so nothing was swapped');
});

test('the counterfactual reports the swap it actually made', () => {
  // Bury the muscles that win when fresh, and the planner should both pick
  // something else and be able to say what it avoided.
  const fresh = withoutFatiguePenalty(['chest'], {});
  const top = fresh.results[0];
  const heavy = Object.fromEntries(
    Object.keys(emgForAngle(top.pattern, top.angle)).map(m => [m, 100]),
  );

  const swap = fatigueChangedTheAnswer(['chest'], { currentFatigue: heavy });
  if (swap) {
    assert.notStrictEqual(
      `${swap.chosen.pattern}@${swap.chosen.angle}`,
      `${swap.insteadOf.pattern}@${swap.insteadOf.angle}`,
    );
    assert.strictEqual(swap.insteadOf.pattern, top.pattern);
    assert.ok(swap.fatigue > 0);
  }
});

test('default lambda is a stated preference, not a hidden constant', () => {
  assert.strictEqual(typeof DEFAULT_LAMBDA, 'number');
  const found = findOptimalConfigurations(['chest'], {});
  assert.strictEqual(found.lambda, DEFAULT_LAMBDA);
});

test('no fabricated prescription numbers reach the payload', () => {
  const json = JSON.stringify(findOptimalConfigurations(['chest'], { currentFatigue: { chest: 30 } }));
  for (const banned of ['e1RM', 'predicted', 'expectedGain', 'hypertrophy', 'percentBetter']) {
    assert.ok(!json.includes(banned), `payload leaked ${banned}`);
  }
});

// ---------------------------------------------------------------------------
// Fixed (non-angle-family) exercises
//
// The planner originally swept only the seven angle families, so it could
// answer for the 17 muscles those happen to touch and silently offered no
// quads, abs, calves, traps, forearms, adductors, abductors, hip-flexors or
// rotator-cuff — most of the lower body and all of the core. The data was
// never missing; exerciseEmgProfiles.js covers 208 exercises. Only the sweep
// was too narrow.
// ---------------------------------------------------------------------------

const {
  allTargetableMuscles, scoreFixedExercises, scoreWeights,
} = require('../functions/targetMusclePlanner');

test('the muscles that were missing are all answerable now', () => {
  const targetable = allTargetableMuscles();
  for (const muscle of ['quads', 'abs', 'obliques', 'calves', 'traps', 'forearms',
                        'adductors', 'abductors', 'hip-flexors', 'rotator-cuff']) {
    assert.ok(targetable.includes(muscle), `${muscle} is still not targetable`);
    const plan = findOptimalConfigurations([muscle], { currentFatigue: {} });
    assert.ok(plan.results.length > 0, `no configuration found for ${muscle}`);
    assert.ok(plan.results[0].exercises.length > 0, `${muscle}'s top result names no exercise`);
  }
});

test('every targetable muscle really does yield at least one result', () => {
  for (const muscle of allTargetableMuscles()) {
    const plan = findOptimalConfigurations([muscle], { currentFatigue: {} });
    assert.ok(plan.results.length > 0, `${muscle} is offered but returns nothing`);
  }
});

test('a fixed exercise reports no angle rather than a made-up one', () => {
  const plan = findOptimalConfigurations(['quads'], { currentFatigue: {} });
  const fixed = plan.results.find(r => r.pattern === null);
  assert.ok(fixed, 'expected at least one non-angle-family result for quads');
  assert.equal(fixed.angle, null);
  assert.equal(fixed.exercises.length, 1);
  assert.ok(fixed.exercises[0].name);
});

// Both sweeps are ranked against each other in one list, so they have to be
// scored by the same function or the ordering is meaningless.
test('fixed exercises and angle configurations are scored identically', () => {
  const weights = { quads: 80, glutes: 40 };
  const direct = scoreWeights(weights, ['quads'], { currentFatigue: { glutes: 100 } });
  assert.equal(direct.stimulus, 80);
  assert.equal(direct.limitingMuscle, 'glutes');
  assert.equal(direct.penaltyFactor, 1 + 1.5 * 1);
  assert.equal(direct.score, 80 / (1 + 1.5));
});

test('scoreWeights drops a candidate that reaches no target at all', () => {
  assert.equal(scoreWeights({ calves: 90 }, ['chest'], {}), null);
  assert.equal(scoreWeights(null, ['chest'], {}), null);
});

test('the equipment filter applies to fixed exercises too', () => {
  const all = scoreFixedExercises(['quads'], {});
  const machineOnly = scoreFixedExercises(['quads'], { equipment: 'machine' });
  assert.ok(machineOnly.length > 0);
  assert.ok(machineOnly.length < all.length);
  for (const r of machineOnly) assert.equal(r.exercises[0].equipment, 'machine');
});

// Sorting used a.pattern.localeCompare, which throws the moment a fixed
// exercise (pattern: null) enters the list.
test('ranking does not throw when fixed and angle results are mixed', () => {
  for (const muscle of ['chest', 'quads', 'lats', 'abs']) {
    assert.doesNotThrow(() => findOptimalConfigurations([muscle], { currentFatigue: {} }));
  }
  const mixed = findOptimalConfigurations(['chest'], { currentFatigue: {} });
  for (let i = 1; i < mixed.results.length; i++) {
    assert.ok(mixed.results[i - 1].score >= mixed.results[i].score, 'results are not ranked by score');
  }
});

test('ranking is deterministic across repeated calls', () => {
  const once = findOptimalConfigurations(['quads', 'glutes'], { currentFatigue: { glutes: 40 } });
  const twice = findOptimalConfigurations(['quads', 'glutes'], { currentFatigue: { glutes: 40 } });
  assert.deepEqual(once.results.map(r => r.exercises[0].name), twice.results.map(r => r.exercises[0].name));
});

// Identity for the counterfactual has to include the exercise name: a fixed
// exercise carries pattern: null and angle: null, so comparing only those made
// every pair of distinct fixed exercises look like the same movement.
test('a swap between two fixed exercises is still reported', () => {
  const targets = ['quads'];
  const unpenalised = findOptimalConfigurations(targets, { currentFatigue: {} }).results[0];
  const spent = { [unpenalised.limitingMuscle || 'glutes']: 100 };
  const changed = fatigueChangedTheAnswer(targets, { currentFatigue: spent });
  if (changed) {
    const name = r => `${r.pattern ?? ''}|${r.angle ?? ''}|${r.exercises[0]?.name ?? ''}`;
    assert.notEqual(name(changed.chosen), name(changed.insteadOf),
      'reported a swap between two identical movements');
  }
});
