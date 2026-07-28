// Username/display-name validation and derivation — pure logic, extracted
// per this app's usual pattern (see plateCalculator.js) so it's covered by
// npm test rather than only ever exercised by hand. See
// .design/feature-brainstorm/USERNAME_AND_COMPARISON.md for the design this
// implements.

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z0-9-]+$/;

// Any Unicode letter, plus spaces and hyphens. No digits — this is a
// cosmetic name, not an identifier, so it's validated purely against what a
// real name looks like, not against a machine-safe character set.
const DISPLAY_NAME_RE = /^[\p{L} -]+$/u;
const DISPLAY_NAME_MAX = 30;

const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase();
}

// Returns null if valid, or a user-facing reason string if not.
function validateUsername(raw) {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters`;
  }
  if (!USERNAME_RE.test(u)) {
    return 'Username can only contain lowercase letters, numbers, and hyphens';
  }
  return null;
}

function validateDisplayName(raw) {
  const d = (raw || '').trim();
  if (!d.length) return 'Display name is required';
  if (d.length > DISPLAY_NAME_MAX) return `Display name must be ${DISPLAY_NAME_MAX} characters or fewer`;
  if (!DISPLAY_NAME_RE.test(d)) return 'Display name can only contain letters, spaces, and hyphens';
  return null;
}

// What's shown to other people is always just the first token — the full
// display name is only ever shown to the account's own owner. See
// USERNAME_AND_COMPARISON.md §2.
function deriveDisplayNameFirst(displayName) {
  const d = (displayName || '').trim();
  if (!d) return '';
  return d.split(/\s+/)[0];
}

function slugifyForUsername(name) {
  return (name || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}

function randomSuffix(len = 7) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Suggested username shown pre-filled on the mandatory first-login step —
// not guaranteed unique on its own; the caller still needs to check/claim
// it (and retry with a fresh suffix on collision, vanishingly rare given
// the suffix space).
function generateUsernameSuggestion(name) {
  const base = slugifyForUsername(name) || 'user';
  const suffix = randomSuffix();
  const combined = `${base}-${suffix}`;
  return combined.length <= USERNAME_MAX ? combined : combined.slice(0, USERNAME_MAX);
}

function canChangeUsername(lastUsernameChangeAt, now = Date.now()) {
  if (!lastUsernameChangeAt) return true;
  return now - new Date(lastUsernameChangeAt).getTime() >= USERNAME_CHANGE_COOLDOWN_MS;
}

function usernameChangeAvailableAt(lastUsernameChangeAt) {
  if (!lastUsernameChangeAt) return null;
  return new Date(new Date(lastUsernameChangeAt).getTime() + USERNAME_CHANGE_COOLDOWN_MS).toISOString();
}

module.exports = {
  USERNAME_MIN, USERNAME_MAX, DISPLAY_NAME_MAX, USERNAME_CHANGE_COOLDOWN_MS,
  normalizeUsername, validateUsername, validateDisplayName, deriveDisplayNameFirst,
  slugifyForUsername, generateUsernameSuggestion, canChangeUsername, usernameChangeAvailableAt,
};
