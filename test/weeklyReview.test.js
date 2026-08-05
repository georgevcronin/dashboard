const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectGoal, formatGoalLine, bucketWorkingAttention, ffm, ffmi } = require('../functions/weeklyReview');

const TODAY = '2026-08-05';

test('projectGoal reports insufficient-data with no history', () => {
  const r = projectGoal([], 78, TODAY);
  assert.equal(r.projection.status, 'insufficient-data');
  assert.equal(r.current, null);
});

test('projectGoal reports insufficient-data with only one point in the 28-day window', () => {
  const r = projectGoal([{ date: TODAY, value: 82 }], 78, TODAY);
  assert.equal(r.projection.status, 'insufficient-data');
  assert.equal(r.current, 82);
});

test('projectGoal projects a date when trending toward the target', () => {
  // 82kg 28 days ago -> 80kg today = -0.5kg/week, target 78kg = 4 weeks out
  const series = [{ date: '2026-07-08', value: 82 }, { date: TODAY, value: 80 }];
  const r = projectGoal(series, 78, TODAY);
  assert.equal(r.projection.status, 'projected');
  assert.equal(r.projection.date, '2026-09-02');
});

test('projectGoal flags wrong-direction when trending away from the target', () => {
  const series = [{ date: '2026-07-08', value: 78 }, { date: TODAY, value: 80 }];
  const r = projectGoal(series, 78, TODAY); // gaining weight, target is to lose
  assert.equal(r.projection.status, 'wrong-direction');
});

test('projectGoal flags flat when the value hasn\'t moved over the window', () => {
  const series = [{ date: '2026-07-08', value: 80 }, { date: TODAY, value: 80 }];
  const r = projectGoal(series, 78, TODAY);
  assert.equal(r.projection.status, 'flat');
});

test('projectGoal reports at-target when current already equals target', () => {
  const series = [{ date: '2026-07-08', value: 78 }, { date: TODAY, value: 78 }];
  const r = projectGoal(series, 78, TODAY);
  assert.equal(r.projection.status, 'at-target');
});

test('projectGoal computes week-over-week delta from the two cutoff windows', () => {
  // last-week window [07-22, 07-29): 81 on 07-25. this-week window [07-29, today]: 80 on today.
  const series = [{ date: '2026-07-25', value: 81 }, { date: '2026-08-01', value: 80.5 }, { date: TODAY, value: 80 }];
  const r = projectGoal(series, 78, TODAY);
  assert.equal(r.weekDelta, -1); // today's 80 vs last week's endpoint 81
});

test('formatGoalLine renders a vague goal with no target', () => {
  assert.equal(formatGoalLine({ type: 'muscle', concrete: false }, null, TODAY), 'Gain Muscle / Strength — no target set');
});

test('formatGoalLine renders a benchmark goal as a placeholder, no progress number', () => {
  const line = formatGoalLine({ type: 'cardio', concrete: true, metric: 'benchmark', benchmarkLabel: '5k under 20min', targetDate: '2026-10-12' }, null, TODAY);
  assert.equal(line, '5k under 20min — target 12 Oct');
});

test('formatGoalLine renders a projected numeric goal end-to-end', () => {
  const goal = { type: 'fatLoss', concrete: true, metric: 'weight', target: 78, targetDate: '2026-10-12' };
  const series = [{ date: '2026-07-08', value: 82 }, { date: '2026-07-25', value: 81 }, { date: TODAY, value: 80 }];
  const progress = projectGoal(series, 78, TODAY);
  const line = formatGoalLine(goal, progress, TODAY);
  assert.match(line, /^Bodyweight: 80kg \(-1kg this week\) → target 78kg by 12 Oct \(68 days left\) · at this rate: 2 Sept?$/);
});

test('formatGoalLine surfaces the no-data case separately from insufficient-data-for-rate', () => {
  const goal = { type: 'fatLoss', concrete: true, metric: 'weight', target: 78, targetDate: '2026-10-12' };
  const line = formatGoalLine(goal, projectGoal([], 78, TODAY), TODAY);
  assert.equal(line, 'Bodyweight — no data logged yet');
});

test('ffm and ffmi apply the standard formulas', () => {
  assert.equal(ffm(80, 20), 64);
  assert.ok(Math.abs(ffmi(80, 20, 180) - (64 / (1.8 * 1.8))) < 1e-9);
});

test('bucketWorkingAttention sorts improved metrics into working and worsened into needsAttention', () => {
  const { working, needsAttention } = bucketWorkingAttention({
    sessionsThis: 4, sessionsLast: 3, volThis: 9000, volLast: 9500,
    recoveryThis: 70, recoveryLast: 65, sleepThis: 6.9, sleepTarget: 8,
    nutritionDaysLogged: 6, prCount: 1,
  });
  assert.ok(working.some(l => l.startsWith('Sessions')));
  assert.ok(working.some(l => l.startsWith('Avg recovery')));
  assert.ok(working.some(l => l.includes('PR')));
  assert.ok(working.some(l => l.startsWith('Nutrition')));
  assert.ok(needsAttention.some(l => l.startsWith('Lift volume')));
  assert.ok(needsAttention.some(l => l.startsWith('Sleep')));
});

test('bucketWorkingAttention omits a flat metric from both lists', () => {
  const { working, needsAttention } = bucketWorkingAttention({ sessionsThis: 4, sessionsLast: 4 });
  assert.equal(working.length, 0);
  assert.equal(needsAttention.length, 0);
});

test('bucketWorkingAttention treats a small sleep shortfall as neither working nor needing attention', () => {
  const { working, needsAttention } = bucketWorkingAttention({ sleepThis: 7.8, sleepTarget: 8 });
  assert.equal(working.length, 0);
  assert.equal(needsAttention.length, 0);
});
