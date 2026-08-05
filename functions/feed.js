// Merge/sort/cap logic for the front-page activity feed (FEATURES.md #144).
// Deliberately pure and dependency-free — the actual visibility gating
// (isWorkoutSessionsVisible + the feed-specific opt-in) and the Firestore
// reads happen in index.js, same "route does I/O, module does the logic"
// split as stimulusInWindow/strengthLevelsFor use for /compare. Kept
// separate so the merge/ordering/cap behaviour is unit-testable without an
// emulator, per ARCHITECTURE.md's testing note.
//
// Callers must pre-filter `sources` to only accounts the viewer is actually
// authorized to see (mutual visibility toggles) — this function trusts its
// input and does no authorization of its own, so getting that pre-filter
// right is the security-relevant part and lives in index.js next to the
// other cross-account reads.

const DEFAULT_LIMIT = 50;
const DEFAULT_PER_USER_LIMIT = 10;

// One followed account's already-loaded, already-authorized data.
// { uid, username, displayNameFirst, workouts: [{date,name,sets,duration,createdAt,...}] }
function buildFeedEntries(sources, { limit = DEFAULT_LIMIT, perUserLimit = DEFAULT_PER_USER_LIMIT } = {}) {
  const entries = [];
  for (const src of sources || []) {
    const workouts = [...(src.workouts || [])]
      .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''))
      .slice(0, perUserLimit);
    for (const w of workouts) {
      entries.push({
        uid: src.uid, username: src.username, displayNameFirst: src.displayNameFirst,
        date: w.date, name: w.name, sets: w.sets ?? 0, duration: w.duration ?? null,
        createdAt: w.createdAt || w.date,
      });
    }
  }
  entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return entries.slice(0, limit);
}

module.exports = { buildFeedEntries, DEFAULT_LIMIT, DEFAULT_PER_USER_LIMIT };
