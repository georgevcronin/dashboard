// Loading/saving a user's document, factored out of index.js specifically
// so loadForUserDoc's migration-on-load logic (the riskiest part of moving
// lifts out of the embedded array — see liftChunks.js) can be unit-tested
// directly against the Firestore emulator, rather than only indirectly
// through the full Express app.
const { loadAllLifts, appendLifts } = require('./liftChunks');

const DEFAULTS = () => ({
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [], runs: [], sports: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [],
  strava: null, weeklyPlan: null, soreness: [], muscleSensitivity: {}, cnsSensitivity: 1.0,
  injuries: [], measurements: [], supplements: [], supplementLog: [],
  alcoholLog: [], photos: [], experiments: [], customExercises: [],
  // One-off date-range availability constraints for the Plan Ahead calendar
  // (calendarSolver.js) — a holiday/travel window, level: 'rest'|'bodyweight'|
  // 'restricted'. Recurring day-of-week blackouts and the day-of-week split
  // anchor live on `profile` instead (durable settings, not dated events).
  calendarWindows: [],
  // Manual period start/end log for lightweight cycle-aware recovery
  // calibration (see cycleTracking.js) — deliberately not fertility
  // prediction and not symptom logging: the only rating captured is
  // `heaviness`, training-impact severity, not menstrual flow volume.
  // One entry per period: { id, startTs, endTs, heaviness, note }. endTs
  // stays null while the period is open; id doubles as the lookup key for
  // /cycle/:id routes, same convention as injuries above.
  cycle: [],
  profile: { name: null, heightCm: null, sex: null, waterTarget: 7,
    macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 75 }, macroMode: "manual",
    // Each entry: { type, priority: 'primary'|'secondary'|'minor', concrete,
    // metric?, target?, targetDate?, exercise?, benchmarkLabel? }. Replaces
    // the old single primaryActivity/secondaryActivity pair (see below) with
    // the same shape George chose for goals — any number of activities, each
    // independently weighted, rather than exactly one primary + one secondary.
    goals: [],
    activities: [],
    equipmentAvailable: [],
    musclePriorities: {},
    weeklyTargets: { lifting: {}, running: {}, sports: {} },
    activityPreferences: { lifting: {}, running: {} },
    unavailableDaysOfWeek: [],
    availableDaysOfWeek: [],
    splitDayAnchors: {},
    weeklySessionTarget: null,
    // Elo-style { [exerciseName]: { rating, comparisons } } — see
    // functions/exercisePreferenceRanking.js. Deliberately a top-level
    // profile field, not nested under trainingBackground: the frontend's
    // saveTrainingBackground always reconstructs and POSTs the *entire*
    // trainingBackground object from its own local state (it has no
    // knowledge of server-computed ratings), so nesting this there would
    // get silently wiped out the next time someone e.g. added a favourite.
    // Server-only-written (POST /profile explicitly strips this field,
    // same protection as username/visibility) — never built from a client-
    // supplied value, only real comparisons and import seeding.
    exerciseRatings: {},
    // Per-section interactive walkthrough (FEATURES.md #145): { s1: true,
    // s3: true, ... }, one key per section id the user has ever been
    // auto-shown that section's spotlight tour. Only ever grows via /profile's
    // walkthroughSeen merge (mark one section) or gets wiped by
    // resetWalkthroughs ("Replay Walkthrough" in Settings) — never written
    // wholesale by the client, same pattern as `visibility` above.
    walkthroughsSeen: {},
    // Explicit opt-in for menstrual-cycle-aware recovery calibration
    // (cycleTracking.js). The calibration itself never infers readiness
    // from `sex` above — that field is used inconsistently across the
    // codebase ('F'/'M' in some places, 'male'/'female' in others) and
    // isn't a safe gate on its own; only this explicit flag is read
    // server-side. The Settings UI does restrict who can *see* the toggle
    // (sex === 'female'), but that's a client-side display decision, not
    // something this field or its consumers depend on. cycleIrregular
    // turns off day-count estimation between logged periods (see
    // currentCycleDay in cycleTracking.js) — a reasonable guess from the
    // average cycle length for a regular cycle, actively misleading for
    // an irregular one.
    cycleTrackingEnabled: false,
    cycleIrregular: false,
  },
});

// Lifts live in a size-bounded subcollection (functions/liftChunks.js), not
// embedded in this document — a real account's 8000+ lifts already pushed
// the embedded-array document over Firestore's 1MB limit, silently failing
// every write from that point on. Handles both "brand new doc" and "doc
// already exists but still has the old embedded-lifts shape" uniformly:
// either way, any embedded lifts found get migrated into chunks and
// stripped from the parent doc, then the chunk-loaded array becomes the
// canonical `data.lifts` going forward. Takes an already-fetched `snap` to
// avoid a redundant read when the caller already needed it to branch.
async function loadForUserDoc(ref, snap, fallbackData) {
  const source = snap.exists ? snap.data() : fallbackData;
  const data = { ...DEFAULTS(), ...(source || {}) };
  const embeddedLifts = Array.isArray(data.lifts) && data.lifts.length ? data.lifts : null;
  if (!snap.exists || embeddedLifts) {
    const { lifts: _drop, ...toSave } = data;
    await ref.set(toSave);
  }
  if (embeddedLifts) await appendLifts(ref, embeddedLifts);
  data.lifts = await loadAllLifts(ref);
  return data;
}

// `lifts` never gets written back to the parent doc — it lives entirely in
// the liftChunks subcollection now, so re-embedding it here would silently
// reintroduce the exact 1MB-document bug this whole change exists to fix.
function saveDocExcludingLifts(ref, data) {
  const { lifts: _drop, ...toSave } = data;
  return ref.set(toSave);
}

module.exports = { DEFAULTS, loadForUserDoc, saveDocExcludingLifts };
