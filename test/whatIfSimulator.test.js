const test = require('node:test');
const assert = require('node:assert');

const { simulateSession, compareSessions, sessionToLifts } = require('../functions/whatIfSimulator');
const { computeStructuralFatigue, musclePeaksFromLifts } = require('../functions/fatigue');
const { FATIGUE_CEILING } = require('../functions/weeklyPlanner');

// Offset by two hours so no fixture lift lands exactly on one of fatigue.js's
// window boundaries. computeCNSFatigue drops anything over 96h and
// computeStructuralFatigue anything over 336h, so a lift sitting precisely on
// 96h flips in or out between two Date.now() calls a millisecond apart — which
// showed up as an "empty session" moving CNS by 14 points, intermittently.
const dayAgo = n => new Date(Date.now() - (n * 24 + 2) * 3_600_000).toISOString();

// Sessions every fourth day rather than daily. Training the same muscle every
// day pins it at computeStructuralFatigue's 100 cap, where every delta reads as
// 0 and the tests below would pass or fail for the wrong reason.
function history({ everyDays = 4, days = 14 } = {}) {
  const lifts = [];
  for (let d = everyDays; d <= days; d += everyDays) {
    const start = dayAgo(d);
    for (let s = 0; s < 4; s++) {
      lifts.push({ date: start.slice(0, 10), start, exercise: 'barbell bench press', kg: 80, reps: 8 });
      lifts.push({ date: start.slice(0, 10), start, exercise: 'back squat', kg: 100, reps: 5 });
    }
  }
  return lifts;
}

const session = (name, sets, kg = 80, reps = 8) => ([{
  name,
  sets: Array.from({ length: sets }, () => ({ type: 'N', kg, reps })),
}]);

test('simulating does not mutate the history it was given', () => {
  const lifts = history();
  const snapshot = JSON.parse(JSON.stringify(lifts));
  const soreness = [{ muscle: 'chest', score: 5, ts: Date.now() }];
  const sorenessSnapshot = JSON.parse(JSON.stringify(soreness));

  simulateSession({ lifts, exercises: session('barbell bench press', 5), soreness });

  assert.deepStrictEqual(lifts, snapshot, 'lifts array was modified');
  assert.deepStrictEqual(soreness, sorenessSnapshot, 'soreness array was modified');
  assert.strictEqual(lifts.length, snapshot.length);
});

test('a session raises fatigue on the muscles it trains', () => {
  const lifts = history();
  const result = simulateSession({ lifts, exercises: session('barbell bench press', 5) });

  const chest = result.muscles.find(m => m.muscle === 'chest');
  assert.ok(chest, 'chest should appear in the diff');
  assert.ok(chest.fatigueDelta > 0, `expected chest fatigue to rise, got ${chest.fatigueDelta}`);
  assert.ok(chest.fatigueAfter > chest.fatigueBefore);

  // And leaves untrained muscles alone rather than nudging everything.
  assert.ok(!result.muscles.some(m => m.muscle === 'hamstrings'));
});

test('more work costs more than less work', () => {
  const lifts = history();
  const light = simulateSession({ lifts, exercises: session('barbell bench press', 2) });
  const heavy = simulateSession({ lifts, exercises: session('barbell bench press', 8) });

  const chestOf = r => r.muscles.find(m => m.muscle === 'chest').fatigueDelta;
  assert.ok(chestOf(heavy) > chestOf(light));
  assert.ok(heavy.recoveryDelayH >= light.recoveryDelayH);
  assert.ok(heavy.setCount > light.setCount);
});

test('peaks are frozen, so a record session cannot make the baseline look easier', () => {
  // The failure this guards: musclePeaksFromLifts normalises fatigue by the
  // biggest single-day load on record. If the candidate session is allowed to
  // set a new peak, the denominator grows for BOTH readings and the baseline
  // drops — so a punishing session can report a negative fatigue delta.
  const lifts = history();
  const enormous = simulateSession({
    lifts,
    exercises: session('barbell bench press', 40, 200, 10),
  });

  const chest = enormous.muscles.find(m => m.muscle === 'chest');
  assert.ok(chest.fatigueDelta > 0, `a record session must not read as recovery (got ${chest.fatigueDelta})`);

  // The baseline reading must equal what the dashboard shows for the untouched
  // history — not a rescaled version of it.
  const peaks = musclePeaksFromLifts(lifts);
  const live = computeStructuralFatigue(lifts, peaks);
  assert.strictEqual(chest.fatigueBefore, live.chest);
});

test('crossing the planner ceiling is reported', () => {
  const lifts = history();
  const result = simulateSession({ lifts, exercises: session('barbell bench press', 30, 150, 10) });

  for (const m of result.muscles) {
    assert.strictEqual(m.crossesCeiling, m.fatigueBefore < FATIGUE_CEILING && m.fatigueAfter >= FATIGUE_CEILING);
  }
  assert.deepStrictEqual(
    result.newlyOverCeiling,
    result.muscles.filter(m => m.crossesCeiling).map(m => m.muscle),
  );
  assert.strictEqual(result.ceiling, FATIGUE_CEILING);
});

test('an empty session changes nothing', () => {
  const lifts = history();
  const result = simulateSession({ lifts, exercises: [] });

  assert.deepStrictEqual(result.muscles, []);
  assert.strictEqual(result.cnsDelta, 0);
  assert.strictEqual(result.recoveryDelayH, 0);
  assert.strictEqual(result.setCount, 0);
});

test('no history is a valid starting state', () => {
  const result = simulateSession({ lifts: [], exercises: session('barbell bench press', 3) });
  assert.ok(result.muscles.length > 0);
  for (const m of result.muscles) {
    assert.ok(Number.isFinite(m.fatigueAfter));
    assert.ok(m.fatigueBefore === 0);
  }
});

test('warmup sets are carried through as load, tagged W', () => {
  const lifts = sessionToLifts([{
    name: 'Barbell Bench Press',
    sets: [
      { type: 'W', kg: 40, reps: 10 },
      { type: 'N', kg: 80, reps: 8 },
      { type: 'N', kg: 80, reps: 8 },
    ],
  }]);

  assert.strictEqual(lifts.length, 3);
  assert.strictEqual(lifts[0].type, 'W');
  assert.strictEqual(lifts[1].type, undefined, "working sets are untagged, matching the ingest paths");
  assert.strictEqual(lifts[0].exercise, 'barbell bench press');
  // Every row carries a real timestamp, so "if I trained now" is now and not
  // midnight — see the header note on liftTime.
  for (const l of lifts) assert.ok(l.start && !Number.isNaN(Date.parse(l.start)));
});

test('empty and zero-load sets are dropped rather than logged as zero-weight lifts', () => {
  const lifts = sessionToLifts([
    { name: 'barbell bench press', sets: [{ type: 'N', kg: 0, reps: 0 }] },
    { name: '', sets: [{ type: 'N', kg: 80, reps: 8 }] },
  ]);
  assert.deepStrictEqual(lifts, []);
});

test('per-muscle recovery hours only ever grow after training that muscle', () => {
  const lifts = history();
  const result = simulateSession({ lifts, exercises: session('back squat', 6, 120, 5) });

  for (const m of result.muscles) {
    assert.ok(m.fatigueDelta > 0);
    assert.ok(m.hoursAfter >= m.hoursBefore,
      `${m.muscle}: hours went ${m.hoursBefore} -> ${m.hoursAfter}`);
  }
  assert.ok(result.recoveryDelayH >= 0);
});

test('compareSessions ranks candidates against one shared baseline', () => {
  const lifts = history();
  const results = compareSessions({
    lifts,
    candidates: [
      { key: 'short', label: 'Short', exercises: session('barbell bench press', 2) },
      { key: 'long', label: 'Long', exercises: session('barbell bench press', 8) },
    ],
  });

  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].key, 'short');
  assert.strictEqual(results[1].label, 'Long');

  // Same baseline for every candidate — otherwise the comparison is not one.
  assert.strictEqual(results[0].before.cns, results[1].before.cns);
  assert.strictEqual(results[0].before.fullyRecoveredInH, results[1].before.fullyRecoveredInH);
  assert.ok(results[1].recoveryDelayH >= results[0].recoveryDelayH);
});

test('no fabricated performance numbers reach the payload', () => {
  // The same guard recommendation.js carries. Fatigue and recovery hours are
  // the model read forwards; a predicted strength or stimulus change would be
  // a claim Press has never calibrated against an outcome.
  const result = simulateSession({ lifts: history(), exercises: session('barbell bench press', 5) });
  const json = JSON.stringify(result);

  for (const banned of ['e1RM', 'e1rm', 'stimulus', 'predictedStrength', 'performanceDelta', 'percentStronger']) {
    assert.ok(!json.includes(banned), `payload leaked a ${banned} field`);
  }
});
