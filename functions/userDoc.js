// Loading/saving a user's document, factored out of index.js specifically
// so loadForUserDoc's migration-on-load logic (the riskiest part of moving
// lifts out of the embedded array — see liftChunks.js) can be unit-tested
// directly against the Firestore emulator, rather than only indirectly
// through the full Express app.
const { loadAllLifts, appendLifts } = require('./liftChunks');

const DEFAULTS = () => ({
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [],
  strava: null, weeklyPlan: null, soreness: [], muscleSensitivity: {}, cnsSensitivity: 1.0,
  injuries: [], measurements: [], supplements: [], supplementLog: [],
  alcoholLog: [], photos: [], experiments: [], customExercises: [],
  profile: { name: null, heightCm: null, sex: null, waterTarget: 7,
    macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 75 }, macroMode: "manual" },
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
