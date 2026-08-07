const test = require('node:test');
const assert = require('node:assert');

const { dailyLoadSeries, computeTrend, deloadSuggestion, DELOAD_FORM_THRESHOLD, DELOAD_MIN_CONSECUTIVE_DAYS } = require('../functions/performanceTrend');

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test('dailyLoadSeries: empty for no lifts', () => {
  assert.deepStrictEqual(dailyLoadSeries([]), []);
  assert.deepStrictEqual(dailyLoadSeries(null), []);
});

test('dailyLoadSeries: fills gap days with 0 load between two logged sessions', () => {
  const lifts = [
    { exercise: 'bench press', kg: 80, reps: 5, rir: 2, date: dateNDaysAgo(5) },
    { exercise: 'bench press', kg: 80, reps: 5, rir: 2, date: dateNDaysAgo(5) },
    { exercise: 'squat', kg: 100, reps: 5, rir: 2, date: dateNDaysAgo(2) },
  ];
  const series = dailyLoadSeries(lifts);
  assert.strictEqual(series.length, 6, 'should have one point per day from first lift through today');
  const gapDay = series.find(p => p.date === dateNDaysAgo(3));
  assert.strictEqual(gapDay.load, 0, 'a day with no logged lift should have 0 load');
  const trainedDay = series.find(p => p.date === dateNDaysAgo(5));
  assert(trainedDay.load > 0, 'a day with logged lifts should have positive load');
});

test('computeTrend: empty for no lifts', () => {
  assert.deepStrictEqual(computeTrend([]), []);
});

test('computeTrend: fitness responds slower than fatigue to a load spike', () => {
  // A long history of moderate, steady training, then nothing recent —
  // fatigue (7-day) should decay toward 0 much faster than fitness (42-day).
  const lifts = [];
  for (let i = 30; i >= 10; i--) {
    lifts.push({ exercise: 'bench press', kg: 80, reps: 5, rir: 2, date: dateNDaysAgo(i) });
    lifts.push({ exercise: 'bench press', kg: 80, reps: 5, rir: 2, date: dateNDaysAgo(i) });
    lifts.push({ exercise: 'bench press', kg: 80, reps: 5, rir: 2, date: dateNDaysAgo(i) });
  }
  const trend = computeTrend(lifts);
  const last = trend.at(-1);
  assert(last.fatigue < last.fitness, 'after a rest gap, fast-moving fatigue should have decayed below slow-moving fitness');
  assert(last.form > 0, 'form should be positive (fresh) after a rest gap following steady training');
});

test('computeTrend: form goes deeply negative when hard daily training ramps up off a light baseline', () => {
  // A constant load, however high, converges fitness and fatigue to the
  // same value (form -> 0) — form only diverges on a *change* in load,
  // since fatigue (7-day) reacts to that change faster than fitness
  // (42-day). Light baseline, then a hard daily ramp, is the actual
  // "overreaching" shape this is meant to catch.
  const lifts = [];
  for (let i = 34; i >= 11; i--) {
    lifts.push({ exercise: 'bench press', kg: 60, reps: 8, rir: 5, date: dateNDaysAgo(i) });
  }
  for (let i = 10; i >= 0; i--) {
    for (const exercise of ['bench press', 'row', 'squat', 'overhead press', 'deadlift']) {
      lifts.push({ exercise, kg: 90, reps: 5, rir: 0, date: dateNDaysAgo(i) });
      lifts.push({ exercise, kg: 90, reps: 5, rir: 0, date: dateNDaysAgo(i) });
      lifts.push({ exercise, kg: 90, reps: 5, rir: 0, date: dateNDaysAgo(i) });
    }
  }
  const trend = computeTrend(lifts);
  assert(trend.at(-1).form < -20, 'a hard daily ramp off a light baseline should push form deeply negative');
});

test('deloadSuggestion: null when trend is empty or form is fine', () => {
  assert.strictEqual(deloadSuggestion([]), null);
  assert.strictEqual(deloadSuggestion(null), null);
  assert.strictEqual(deloadSuggestion([{ date: dateNDaysAgo(0), load: 50, fitness: 50, fatigue: 50, form: 0 }]), null);
});

test('deloadSuggestion: null when the negative streak is too short', () => {
  const trend = [];
  for (let i = DELOAD_MIN_CONSECUTIVE_DAYS - 2; i >= 0; i--) {
    trend.push({ date: dateNDaysAgo(i), load: 0, fitness: 0, fatigue: 0, form: DELOAD_FORM_THRESHOLD - 5 });
  }
  assert.strictEqual(deloadSuggestion(trend), null);
});

test('deloadSuggestion: suggests when form has stayed at/below threshold for the full window', () => {
  const trend = [];
  for (let i = DELOAD_MIN_CONSECUTIVE_DAYS + 3; i >= 0; i--) {
    trend.push({ date: dateNDaysAgo(i), load: 0, fitness: 0, fatigue: 0, form: DELOAD_FORM_THRESHOLD - 5 });
  }
  const result = deloadSuggestion(trend);
  assert(result, 'should suggest a deload');
  assert.strictEqual(result.suggested, true);
  assert(result.consecutiveDays >= DELOAD_MIN_CONSECUTIVE_DAYS);
  assert(result.reason.includes('Form'), 'reason should be descriptive prose explaining the trigger');
});

test('deloadSuggestion: a single good day breaks the streak', () => {
  const trend = [];
  for (let i = DELOAD_MIN_CONSECUTIVE_DAYS + 3; i >= 1; i--) {
    trend.push({ date: dateNDaysAgo(i), load: 0, fitness: 0, fatigue: 0, form: DELOAD_FORM_THRESHOLD - 5 });
  }
  trend.push({ date: dateNDaysAgo(0), load: 0, fitness: 0, fatigue: 0, form: 5 }); // today's form recovers
  assert.strictEqual(deloadSuggestion(trend), null, 'a recovered most-recent day should break the streak entirely');
});
