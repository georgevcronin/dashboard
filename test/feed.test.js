const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFeedEntries, DEFAULT_LIMIT, DEFAULT_PER_USER_LIMIT } = require('../functions/feed');

test('buildFeedEntries: merges and sorts entries across accounts newest-first', () => {
  const entries = buildFeedEntries([
    { uid: 'a', username: 'alice', displayNameFirst: 'Alice', workouts: [
      { date: '2026-08-01', name: 'Push', sets: 12, createdAt: '2026-08-01T09:00:00.000Z' },
    ] },
    { uid: 'b', username: 'bob', displayNameFirst: 'Bob', workouts: [
      { date: '2026-08-03', name: 'Legs', sets: 15, createdAt: '2026-08-03T18:00:00.000Z' },
    ] },
  ]);
  assert.deepEqual(entries.map(e => e.username), ['bob', 'alice']);
});

test('buildFeedEntries: falls back to date when createdAt is absent', () => {
  const entries = buildFeedEntries([
    { uid: 'a', username: 'alice', displayNameFirst: 'Alice', workouts: [{ date: '2026-08-01', name: 'Push', sets: 5 }] },
    { uid: 'b', username: 'bob', displayNameFirst: 'Bob', workouts: [{ date: '2026-08-05', name: 'Legs', sets: 5 }] },
  ]);
  assert.deepEqual(entries.map(e => e.username), ['bob', 'alice']);
});

test('buildFeedEntries: caps workouts scanned per user before the merge', () => {
  const workouts = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`, name: 'Session', sets: 5,
    createdAt: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const entries = buildFeedEntries([{ uid: 'a', username: 'alice', displayNameFirst: 'Alice', workouts }], { perUserLimit: 3 });
  assert.equal(entries.length, 3);
  // The three most recent, not the first three in array order.
  assert.deepEqual(entries.map(e => e.date), ['2026-07-20', '2026-07-19', '2026-07-18']);
});

test('buildFeedEntries: caps the total merged list', () => {
  const sources = Array.from({ length: 5 }, (_, i) => ({
    uid: `u${i}`, username: `user${i}`, displayNameFirst: `User${i}`,
    workouts: [{ date: '2026-08-01', name: 'Session', sets: 5, createdAt: `2026-08-01T0${i}:00:00.000Z` }],
  }));
  const entries = buildFeedEntries(sources, { limit: 2 });
  assert.equal(entries.length, 2);
  // Highest createdAt (u4) first.
  assert.deepEqual(entries.map(e => e.username), ['user4', 'user3']);
});

test('buildFeedEntries: an account with no workouts contributes nothing', () => {
  const entries = buildFeedEntries([
    { uid: 'a', username: 'alice', displayNameFirst: 'Alice', workouts: [] },
    { uid: 'b', username: 'bob', displayNameFirst: 'Bob', workouts: undefined },
  ]);
  assert.deepEqual(entries, []);
});

test('buildFeedEntries: no sources returns an empty list, never throws', () => {
  assert.deepEqual(buildFeedEntries([]), []);
  assert.deepEqual(buildFeedEntries(undefined), []);
});

test('buildFeedEntries: default limits are sane', () => {
  assert.equal(DEFAULT_LIMIT, 50);
  assert.equal(DEFAULT_PER_USER_LIMIT, 10);
});

test('buildFeedEntries: carries the fields the frontend renders, nothing more sensitive', () => {
  const entries = buildFeedEntries([
    { uid: 'a', username: 'alice', displayNameFirst: 'Alice', workouts: [
      { date: '2026-08-01', name: 'Push', sets: 8, duration: 52, createdAt: '2026-08-01T09:00:00.000Z' },
    ] },
  ]);
  assert.deepEqual(entries, [{
    uid: 'a', username: 'alice', displayNameFirst: 'Alice',
    date: '2026-08-01', name: 'Push', sets: 8, duration: 52, createdAt: '2026-08-01T09:00:00.000Z',
  }]);
});
