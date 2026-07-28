const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUsername, validateUsername, validateDisplayName, deriveDisplayNameFirst,
  slugifyForUsername, generateUsernameSuggestion, canChangeUsername, usernameChangeAvailableAt,
  USERNAME_MAX,
} = require('../functions/identity');

test('normalizeUsername lowercases and trims', () => {
  assert.equal(normalizeUsername('  George '), 'george');
});

test('validateUsername accepts lowercase letters, numbers, hyphens within length bounds', () => {
  assert.equal(validateUsername('george-cronin7'), null);
  assert.equal(validateUsername('abc'), null);
  assert.equal(validateUsername('a'.repeat(20)), null);
});

test('validateUsername rejects too short/long', () => {
  assert.match(validateUsername('ab'), /3-20/);
  assert.match(validateUsername('a'.repeat(21)), /3-20/);
});

test('validateUsername rejects disallowed characters', () => {
  assert.match(validateUsername('George_Cronin'), /lowercase letters, numbers, and hyphens/);
  assert.match(validateUsername('george cronin'), /lowercase letters, numbers, and hyphens/);
  assert.match(validateUsername('george!'), /lowercase letters, numbers, and hyphens/);
});

test('validateUsername is case-insensitive on the underlying check (normalizes first)', () => {
  assert.equal(validateUsername('George-Cronin'), null); // valid once normalized
});

test('validateDisplayName accepts letters, spaces, hyphens, including unicode letters', () => {
  assert.equal(validateDisplayName('George Cronin'), null);
  assert.equal(validateDisplayName('Jean-Luc'), null);
  assert.equal(validateDisplayName('Björn Åke'), null);
  assert.equal(validateDisplayName('José'), null);
});

test('validateDisplayName rejects numbers', () => {
  assert.match(validateDisplayName('George7'), /letters, spaces, and hyphens/);
});

test('validateDisplayName rejects empty and over-length', () => {
  assert.match(validateDisplayName(''), /required/);
  assert.match(validateDisplayName('a'.repeat(31)), /30 characters/);
});

test('deriveDisplayNameFirst returns only the first token', () => {
  assert.equal(deriveDisplayNameFirst('George Cronin'), 'George');
  assert.equal(deriveDisplayNameFirst('Jean-Luc'), 'Jean-Luc');
  assert.equal(deriveDisplayNameFirst('  George   Cronin '), 'George');
  assert.equal(deriveDisplayNameFirst(''), '');
});

test('slugifyForUsername strips non-alphanumerics, lowercases, caps length', () => {
  assert.equal(slugifyForUsername('George Cronin'), 'georgecronin');
  assert.equal(slugifyForUsername('José Ramírez'), 'joseramirez');
  assert.equal(slugifyForUsername('A Very Long Name Indeed'), 'averylongnam');
});

test('generateUsernameSuggestion produces a valid username from a real name', () => {
  const suggestion = generateUsernameSuggestion('George Cronin');
  assert.equal(validateUsername(suggestion), null);
  assert.ok(suggestion.startsWith('georgecronin-'));
  assert.ok(suggestion.length <= USERNAME_MAX);
});

test('generateUsernameSuggestion falls back to "user" for an empty/unusable name', () => {
  const suggestion = generateUsernameSuggestion('');
  assert.ok(suggestion.startsWith('user-'));
  assert.equal(validateUsername(suggestion), null);
});

test('canChangeUsername allows a first-time set (no prior change)', () => {
  assert.equal(canChangeUsername(null), true);
});

test('canChangeUsername blocks within the cooldown, allows after', () => {
  const now = Date.now();
  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(canChangeUsername(tenDaysAgo, now), false);
  assert.equal(canChangeUsername(fortyDaysAgo, now), true);
});

test('usernameChangeAvailableAt returns null when no prior change, else cooldown end', () => {
  assert.equal(usernameChangeAvailableAt(null), null);
  const last = new Date('2026-01-01T00:00:00.000Z').toISOString();
  assert.equal(usernameChangeAvailableAt(last), '2026-01-31T00:00:00.000Z');
});
