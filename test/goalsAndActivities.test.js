const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateGoals, validateActivities, applyActivityDefaults, seedReturningAthleteAtrophy,
} = require('../functions/goalsAndActivities');

test('validateGoals accepts a vague goal with no target', () => {
  assert.equal(validateGoals([{ type: 'flexibility', priority: 'minor', concrete: false }]), null);
});

test('validateGoals rejects an unknown goal type', () => {
  assert.match(validateGoals([{ type: 'bulking', priority: 'primary', concrete: false }]), /Invalid goal type/);
});

test('validateGoals rejects an unknown priority tier', () => {
  assert.match(validateGoals([{ type: 'fatLoss', priority: 'urgent', concrete: false }]), /Invalid priority/);
});

test('validateGoals requires a target and date on a concrete goal', () => {
  assert.match(validateGoals([{ type: 'fatLoss', priority: 'primary', concrete: true, metric: 'weight' }]), /Missing target/);
  assert.match(validateGoals([{ type: 'fatLoss', priority: 'primary', concrete: true, metric: 'weight', target: 78 }]), /Missing target date/);
});

test('validateGoals rejects a NaN target (blank numeric input parsed client-side)', () => {
  assert.match(validateGoals([{ type: 'fatLoss', priority: 'primary', concrete: true, metric: 'weight', target: NaN, targetDate: '2026-10-01' }]), /Missing target/);
});

test('validateGoals requires a valid metric for a concrete goal with a metric list', () => {
  assert.match(validateGoals([{ type: 'cardio', priority: 'primary', concrete: true, target: 55, targetDate: '2026-10-01', metric: 'made-up' }]), /Invalid metric/);
});

test('validateGoals requires an exercise for a lift-metric muscle goal', () => {
  assert.match(validateGoals([{ type: 'muscle', priority: 'primary', concrete: true, metric: 'lift', target: 100, targetDate: '2026-10-01' }]), /Missing exercise/);
  assert.equal(validateGoals([{ type: 'muscle', priority: 'primary', concrete: true, metric: 'lift', target: 100, targetDate: '2026-10-01', exercise: 'Bench Press' }]), null);
});

test('validateGoals requires a benchmark label for a benchmark-metric cardio goal', () => {
  assert.match(validateGoals([{ type: 'cardio', priority: 'primary', concrete: true, metric: 'benchmark', target: 25, targetDate: '2026-10-01' }]), /Missing benchmark label/);
});

test('validateGoals allows flexibility/sport concrete goals through with only a free-text target', () => {
  assert.equal(validateGoals([{ type: 'sport', priority: 'secondary', concrete: true, target: 'Make the starting five', targetDate: '2026-12-01' }]), null);
});

test('validateActivities accepts every documented activity type', () => {
  const ACTIVITY_TYPES = ['strength', 'running', 'hybrid', 'team_sports', 'endurance', 'crossfit', 'other'];
  assert.equal(validateActivities(ACTIVITY_TYPES.map(type => ({ type, priority: 'minor' }))), null);
});

test('validateActivities rejects an unknown activity type', () => {
  assert.match(validateActivities([{ type: 'yoga', priority: 'primary' }]), /Invalid activity type/);
});

test('applyActivityDefaults is a no-op with no activities', () => {
  const body = {};
  applyActivityDefaults(body);
  assert.equal(body.weeklyTargets, undefined);
});

test('applyActivityDefaults uses a single activity\'s own numbers unchanged', () => {
  const body = { activities: [{ type: 'strength', priority: 'primary' }] };
  applyActivityDefaults(body);
  assert.deepEqual(body.weeklyTargets.lifting, { sessionsPerWeek: 4, avgSessionScore: 2000 });
});

test('applyActivityDefaults blends two same-category activities weighted by priority tier', () => {
  // strength (primary, weight 1) sessionsPerWeek=4 vs crossfit (minor, weight 0.25) sessionsPerWeek=5
  // weighted average = (4*1 + 5*0.25) / 1.25 = 4.2 -> rounds to 4
  const body = { activities: [{ type: 'strength', priority: 'primary' }, { type: 'crossfit', priority: 'minor' }] };
  applyActivityDefaults(body);
  assert.equal(body.weeklyTargets.lifting.sessionsPerWeek, 4);
});

test('applyActivityDefaults merges non-overlapping categories from different activities (hybrid)', () => {
  const body = { activities: [{ type: 'running', priority: 'primary' }] };
  applyActivityDefaults(body);
  assert.ok(body.weeklyTargets.running);
  assert.equal(body.weeklyTargets.lifting, undefined);
});

test('applyActivityDefaults treats "other" as contributing nothing', () => {
  const body = { activities: [{ type: 'other', priority: 'primary' }] };
  applyActivityDefaults(body);
  assert.deepEqual(body.weeklyTargets, {});
});

test('seedReturningAthleteAtrophy returns null with no reported break', () => {
  assert.equal(seedReturningAthleteAtrophy(0), null);
  assert.equal(seedReturningAthleteAtrophy(null), null);
});

test('seedReturningAthleteAtrophy scales estimated decline with reported break length', () => {
  const twoWeeks = seedReturningAthleteAtrophy(2);
  const eightWeeks = seedReturningAthleteAtrophy(8);
  assert.ok(twoWeeks.estimatedDeclinePct > 0);
  assert.ok(eightWeeks.estimatedDeclinePct > twoWeeks.estimatedDeclinePct);
  assert.equal(twoWeeks.gapCount, 0);
});

test('seedReturningAthleteAtrophy caps the applied duration at the 90-day/2160h ceiling', () => {
  const oneYear = seedReturningAthleteAtrophy(52);
  const ninetyDays = seedReturningAthleteAtrophy(2160 / 7 / 24);
  assert.equal(oneYear.estimatedDeclinePct, ninetyDays.estimatedDeclinePct);
});
