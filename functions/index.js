const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const webpush = require("web-push");
const { EXERCISE_DB, EXERCISE_MAP } = require('./exerciseDb');
const { isCompoundExercise, findExercise } = require('./muscleTaxonomy');
const { generateWeeklyGuidance, pickBackboneExercises, computeMusclePriority, scoreBucket, MUSCLE_GROUPS, FATIGUE_CEILING, SECONDARY_FATIGUE_CEILING, focusGroups } = require('./weeklyPlanner');
const { buildRecommendation } = require('./recommendation');
const { todaysLimitingFactor } = require('./limitingFactor');
const { buildRecoveryForecast } = require('./recoveryForecast');
const { SPLIT_GROUPS, rankMusclesByFreshness, typicalSessionMuscleCount, mostOverdueGroup, detectPreferredSplit, neglectedMuscles } = require('./splitPlanner');
const { autoPickFullBodySession } = require('./autoPick');
const { solveCalendarWindow } = require('./calendarSolver');
const { computeMuscleLevels, classifyLift, estimate1RM } = require('./strengthStandards');
const { loadAllLifts, appendLifts, removeLiftsAndAppend } = require('./liftChunks');
const { DEFAULTS, loadForUserDoc, saveDocExcludingLifts } = require('./userDoc');
const { computeProgression } = require('./progression');
const { generateSessionExercises, progressionFor, isLowRepPattern, LOW_REP_THRESHOLD, estimateSessionDurationMin, capSessionDuration, fillSessionToDuration, fatigueCeilingFor } = require('./sessionPlanner');
const { buildSessionVariants } = require('./sessionVariants');
const { computeSleepScore } = require('./sleepScore');
const { computeDay, personalSleepTarget, recoveryDrivers } = require('./recoveryScore');
const { callGeminiResilient, parseGeminiJSON } = require('./gemini');
const { unwrapShortcutBody, sumForDay, averageForDay, computeSleepMetrics } = require('./shortcutParsing');
const {
  normalizeUsername, validateUsername, validateDisplayName, deriveDisplayNameFirst,
  generateUsernameSuggestion, canChangeUsername, usernameChangeAvailableAt,
} = require('./identity');
const { computeStimulusContributions, estimateAtrophyRate } = require('./adaptation');
const { validateGoals, validateActivities, applyActivityDefaults, seedReturningAthleteAtrophy } = require('./goalsAndActivities');
const { estimateMaintenanceCalories, applyDeficitLimit } = require('./nutritionLimits');
const { findNearbyGyms, normalizeExerciseKey, GYM_NEARBY_RADIUS_M } = require('./gyms');
const { buildUnifiedTimeline } = require('./analyticsEngine');
const { computePatternFatigue } = require('./movementPatterns');
const { detectComparisonCandidates, resolveImplicitWinner, applyComparison, seedRatingsFromImport, rankExercises } = require('./exercisePreferenceRanking');
const { buildFeedEntries } = require('./feed');

admin.initializeApp();
const firestore = admin.firestore();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:georgevcronin@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

const app = express();
app.use(express.json({ limit: "10mb" }));

const ALLOWED_ORIGINS = [
  "https://pressnewsletter.web.app",
  "https://pressnewsletter.firebaseapp.com",
  "http://localhost:5000",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Fatigue math (structural/CNS/metabolic, ACWR, injury taper) and the muscle
// taxonomy it's keyed on both live in shared modules now — this used to be a
// hand-copied duplicate that had drifted from src/app.jsx's mirror. See
// functions/muscleTaxonomy.js for why.
const {
  computeStructuralFatigue, computeCurrentFatigueScores, musclePeaksFromLifts, fatigueTimeline,
  INJURY_HEALING_DAYS, injuryFatiguePenalty, applyInjuryTaper,
  computeMetabolicFatigue, computeCNSFatigue, sessionStartStamp, importedStartStamp,
  computeMuscleLastTrainedDays, computeCompoundIsolationSplit, computeStabilitySplit,
} = require('./fatigue');
const { personalizedRecoveryHours, trainingMonthsIfKnown, computeAgeYears } = require('./recoveryPersonalization');
const { cyclePhaseFactor, observedHeaviness, nudgeLearnedHeaviness, periodsOverlap, predictedNextPeriod, parseDateOnly } = require('./cycleTracking');
// Only computed when tracking is on and there's at least one logged entry
// — otherwise cycleFactor stays exactly 1 (a no-op), same "opt-in changes
// nothing until there's real data" posture as musclePriorities/goals.
function activeCycleFactor(db) {
  if (!db.profile?.cycleTrackingEnabled || !(db.cycle || []).length) return 1;
  return cyclePhaseFactor(db.cycle, Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned).factor;
}
const { alcoholStats, computeDataMaturity, compVerdict, toCsv, weekLiftSessionsCompleted } = require('./analytics');
const { projectGoal, formatGoalLine, bucketWorkingAttention, ffm, ffmi } = require('./weeklyReview');
const { computeHybridFatigue } = require('./hybridFatigue');
const { buildRunningRecommendation } = require('./runningRecommendation');
const { computeRunningACWR } = require('./runningLoad');
const { vdotTrend, resolveVO2max, vdotTrainingPaces, estimateCyclingVO2maxFromRides } = require('./vo2max');
const { weeklyEfficiencyTrend, detectSessionDistanceSpike, dailyLoadsFromRuns } = require('./runningLoad');
const { parseVO2max } = require('./shortcutParsing');
const { parseStravaActivity } = require('./stravaParsing');
const { predict8WeekVO2Gain } = require('./runningPrediction');
const { classifySportType } = require('./sportClassifier');
const {
  estimateFTP, cogganPowerZones, dailyLoadsFromPower, weeklyPowerEfficiencyTrend, weeklySpeedEfficiencyTrend,
} = require('./cyclingPower');
const { weeklySwimEfficiencyTrend } = require('./enduranceLoad');
const { buildCyclingRecommendation, buildSwimmingRecommendation, buildGeneralRecommendation } = require('./enduranceRecommendation');
const { computeCardioScore } = require('./cardioStandards');
const { coupledAcwr } = require('./fatigue');
const { estimateMaxHeartRate } = require('./runningPrescription');

// ---------- Unified workout schema ----------
// All workouts conform to this shape regardless of source. Validation happens
// on insert/update, ensuring no ghost records or missing required fields.
function createWorkoutRecord({ date, name, source, sourceId = null, duration = null, kcal = null, sets = 0, createdAt = null, updatedAt = null, gymId = null, groupWith = null }) {
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('workout.date must be YYYY-MM-DD');
  if (!name || typeof name !== 'string' || !name.trim()) throw new Error('workout.name required and non-empty');
  if (!source || !['app', 'hevy', 'strava', 'shortcut'].includes(source)) throw new Error('workout.source must be app|hevy|strava|shortcut');
  if (duration != null && (typeof duration !== 'number' || duration < 0)) throw new Error('workout.duration must be non-negative number');
  if (kcal != null && (typeof kcal !== 'number' || kcal < 0)) throw new Error('workout.kcal must be non-negative number');
  if (typeof sets !== 'number' || sets < 0) throw new Error('workout.sets must be non-negative number');
  if (!createdAt || typeof createdAt !== 'string') throw new Error('workout.createdAt required (ISO string)');
  if (!updatedAt || typeof updatedAt !== 'string') throw new Error('workout.updatedAt required (ISO string)');
  const record = { date, name: name.trim(), source, createdAt, updatedAt, sets, ...(sourceId ? { sourceId } : {}), ...(duration != null ? { duration } : {}), ...(kcal != null ? { kcal } : {}), ...(gymId ? { gymId } : {}), ...(groupWith?.length ? { groupWith } : {}) };
  return record;
}

function findOrMergeWorkout(workouts, date, source) {
  return workouts.findIndex(w => w.date === date && w.source === source);
}

function validateSetsForWorkout(sets) {
  return sets.filter(s => s.exercise && +s.kg > 0 && +s.reps > 0).length > 0;
}

// ---------- Firestore-backed state — per user ----------
// DEFAULTS/loadForUserDoc/saveDocExcludingLifts live in functions/userDoc.js
// so the migration-on-load logic can be unit-tested directly against the
// Firestore emulator, not just indirectly through the full Express app.

// In-memory cache keyed by uid. 1st-gen Cloud Functions handle one request at a time per
// instance so the request-scoped globals below are safe to use without race conditions.
const userDbs = {};
const userDocRef = uid => firestore.collection('users').doc(uid);

async function loadForUser(uid) {
  if (userDbs[uid]) return userDbs[uid];
  const ref = userDocRef(uid);
  const snap = await ref.get();
  let fallbackData = null;
  if (!snap.exists && uid === process.env.PRESS_OWNER_UID) {
    // First login for the original owner only: one-time migration from the
    // legacy single-user peak/state document. Any other new account must
    // NOT inherit this data.
    const legacy = await firestore.collection('peak').doc('state').get();
    fallbackData = legacy.exists ? legacy.data() : null;
  }
  userDbs[uid] = await loadForUserDoc(ref, snap, fallbackData);
  return userDbs[uid];
}

// Request-scoped globals (safe because 1st gen = single concurrent request per instance)
let db = null;
let save = async () => {};
let liftsDocRef = null;

// Single-user app currently (see PRODUCT.md) — no per-user timezone is
// wired up anywhere in the profile, so this is a fixed IANA zone rather
// than a real per-athlete lookup. Update this constant if the app ever
// serves someone outside the UK, or wire up a real per-user timezone
// before then.
//
// day() used to be `.toISOString().slice(0, 10)` — always UTC. That's
// silently wrong for "what calendar day is it right now" (or "did this
// external timestamp happen on") near midnight local time. Safe to fix
// broadly: every existing call site that passes a "YYYY-MM-DD"-only string
// (e.g. re-formatting an already-stored date key) is unaffected, since that
// parses as UTC midnight and Europe/London is never negative-UTC — the
// local reformatting can only push forward by up to an hour (BST) within
// the same calendar day, never back a day. The only call sites this
// actually changes behavior for are the ones computing "right now" or
// converting a real external timestamp — exactly the ones that were buggy.
const APP_TIMEZONE = 'Europe/London';
function day(d) {
  const date = d ? new Date(d) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// '' (not "today") for missing/invalid input — distinct from day()'s
// "defaults to now" contract, needed by ingestWorkout to detect "no
// timestamp present at all" rather than silently dating it today.
function utcToAppLocalDateStr(isoString) {
  if (!isoString) return '';
  if (isNaN(new Date(isoString).getTime())) return '';
  return day(isoString);
}

// ---------- Open webhook routes (iOS Health, Hevy, Strava OAuth) ----------
// These are called by external services and can't carry a Firebase token.
// They resolve the owner uid via PRESS_OWNER_UID env var, with legacy fallback.
const OPEN_PATHS = ['/health', '/shortcut', '/hevy/webhook', '/strava/auth', '/strava/callback', '/setup'];

async function loadForUid(uid) {
  db = await loadForUser(uid);
  liftsDocRef = userDocRef(uid);
  save = async () => { await saveDocExcludingLifts(liftsDocRef, db); };
}

async function loadOwner() {
  const uid = process.env.PRESS_OWNER_UID;
  if (uid) {
    await loadForUid(uid);
  } else {
    // Legacy fallback: single-user peak/state document — this is the
    // document actually in active use for the original account (verified
    // directly against production data: users/ has zero documents, all
    // real history lives here), so it needs the same chunk-aware loading
    // as loadForUser, not a raw embedded-field read.
    const ref = firestore.collection('peak').doc('state');
    const snap = await ref.get();
    db = await loadForUserDoc(ref, snap, null);
    liftsDocRef = ref;
    save = async () => { await saveDocExcludingLifts(liftsDocRef, db); };
  }
}

// ---------- Auth middleware ----------
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (OPEN_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    // ?token=... routes an open webhook to a specific user's own account —
    // see /sync-token below. Without one, these fall back to the single
    // legacy owner account (PRESS_OWNER_UID), which is what keeps the
    // original account's already-configured Shortcut/webhooks working
    // unchanged. An invalid token must fail loudly rather than silently
    // fall back to the owner — otherwise a typo'd token would misroute
    // someone else's health data straight into the owner's account, which
    // is the exact bug this token system exists to prevent.
    if (req.query.token) {
      const tokSnap = await firestore.collection('syncTokens').doc(String(req.query.token)).get();
      if (!tokSnap.exists) return res.status(400).json({ error: 'invalid sync token' });
      await loadForUid(tokSnap.data().uid);
    } else {
      await loadOwner();
    }
    return next();
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'auth required' });
  try {
    const { uid } = await admin.auth().verifyIdToken(header.slice(7));
    req.uid = uid;
    await loadForUid(uid);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
});

// ---------- Identity ----------
app.get('/me', (req, res) => res.json({
  uid: req.uid || null,
  // hasUsername gates the mandatory first-login username/displayName step —
  // deliberately re-checked on every load (not just "first login") so
  // accounts that existed before this feature shipped get caught too. See
  // USERNAME_AND_COMPARISON.md's "every account must have a username" note.
  hasUsername: !!db?.profile?.username,
  username: db?.profile?.username || null,
  displayName: db?.profile?.displayName || null,
  displayNameFirst: deriveDisplayNameFirst(db?.profile?.displayName),
}));

// ---------- Health Auto Export webhook ----------
app.post("/health", async (req, res) => {
  const d = req.body?.data || req.body || {};
  let saved = 0;
  for (const m of d.metrics || []) {
    const name = m.name;
    for (const pt of m.data || []) {
      const k = day(pt.date);
      db.metrics[k] = db.metrics[k] || {};
      if (name === "sleep_analysis") {
        db.metrics[k].sleep_hours = pt.totalSleep ?? pt.asleep ?? db.metrics[k].sleep_hours;
        if (pt.inBed != null && pt.totalSleep != null && pt.inBed > 0) db.metrics[k].sleep_eff = Math.round((pt.totalSleep / pt.inBed) * 100);
        // Sleep-stage breakdown, when Health Auto Export includes it (values in hours).
        // Best-effort — HAE's exact field naming isn't guaranteed across versions.
        if (pt.deep != null) db.metrics[k].deep_sleep_min = Math.round(pt.deep * 60);
        if (pt.rem != null) db.metrics[k].rem_sleep_min = Math.round(pt.rem * 60);
        if (pt.core != null) db.metrics[k].light_sleep_min = Math.round(pt.core * 60);
        if (pt.awake != null) db.metrics[k].waso_min = Math.round(pt.awake * 60);
      } else if (pt.qty != null) {
        db.metrics[k][name] = pt.qty;
        if (name === "body_mass") db.weight[k] = pt.qty;
        if (name.startsWith("dietary_")) {
          db.nutrition = db.nutrition || {};
          db.nutrition[k] = db.nutrition[k] || {};
          const nmap = { dietary_protein: "protein", dietary_carbohydrates: "carbs", dietary_fat_total: "fat", dietary_energy_consumed: "calories" };
          if (nmap[name]) db.nutrition[k][nmap[name]] = pt.qty;
        }
      } else if (pt.avg != null) db.metrics[k][name] = pt.avg;
      saved++;
    }
  }
  const now = new Date().toISOString();
  for (const w of d.workouts || []) {
    const k = day(w.start || w.date);
    if (!k) continue;
    const rawKcal = w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? null;
    const unit = w.activeEnergyBurned?.units ?? w.activeEnergy?.units ?? "kcal";
    const kcal = rawKcal != null ? Math.round(unit === "kJ" ? rawKcal / 4.184 : rawKcal) : null;
    const mergeIdx = findOrMergeWorkout(db.workouts || [], k, 'shortcut');
    if (mergeIdx >= 0) {
      const existing = db.workouts[mergeIdx];
      db.workouts[mergeIdx] = createWorkoutRecord({
        date: k, name: w.name, source: 'shortcut',
        duration: w.duration || (existing?.duration || null),
        kcal: kcal || (existing?.kcal || null),
        sets: existing?.sets || 0,
        createdAt: existing?.createdAt || (w.start || w.date || now),
        updatedAt: now,
      });
    } else if (!db.workouts.find((x) => x.date === k && x.name === w.name && x.source === 'shortcut')) {
      db.workouts.push(createWorkoutRecord({
        date: k, name: w.name, source: 'shortcut',
        duration: w.duration || null, kcal,
        createdAt: w.start || w.date || now, updatedAt: now,
      }));
      saved++;
    }
  }
  await save();
  res.json({ ok: true, saved });
});

// ---------- iOS Shortcuts endpoint ----------
app.post("/shortcut", async (req, res) => {
  const d = unwrapShortcutBody(req.body);
  // TEMPORARY — logging the raw + unwrapped payload while the Shortcut setup
  // is still being verified against real device data. Remove once this has
  // been confirmed stable across a few real runs.
  console.log('[shortcut] raw body:', JSON.stringify(req.body));
  console.log('[shortcut] unwrapped:', JSON.stringify(d));
  // Allow an explicit date for historical syncs; default to today
  const k = d.date ? d.date.slice(0, 10) : day();
  db.metrics[k] = db.metrics[k] || {};
  // Health Sample lists arrive as newline-joined text (see
  // shortcutParsing.js), one value per line — reduced here rather than in
  // the fragile Shortcuts GUI, which has no error reporting of its own.
  // Rounded here, not left as raw float division output — every other
  // numeric metric in this codebase is stored pre-rounded (see fatigue.js),
  // and the frontend displays these fields directly with no rounding of
  // its own.
  // Filtered to samples actually dated `k` -- hrv/rhr/hr_values otherwise
  // include stragglers from the previous day's sync (see averageForDay).
  const hrv = averageForDay(d.hrv_values, d.hrv_dates, k, day);
  if (hrv != null) db.metrics[k].heart_rate_variability = Math.round(hrv);
  const rhr = averageForDay(d.rhr_values, d.rhr_dates, k, day);
  if (rhr != null) db.metrics[k].resting_heart_rate = Math.round(rhr);
  // step_count is stored in thousands (the frontend does `steps * 1000` to
  // display the real count — matches the existing /health Health Auto
  // Export convention), not a raw absolute step total.
  // Filtered to samples actually dated `k` -- steps_values otherwise
  // includes stragglers from the previous day (see sumForDay).
  const stepCount = sumForDay(d.steps_values, d.steps_dates, k, day);
  if (stepCount != null) db.metrics[k].step_count = stepCount / 1000;
  // Same straggler filtering as hrv/rhr above.
  const wrist = averageForDay(d.wrist_values, d.wrist_dates, k, day);
  if (wrist != null) db.metrics[k].wrist_temperature = Math.round(wrist * 10) / 10;
  const hr = averageForDay(d.hr_values, d.hr_dates, k, day);
  if (hr != null) db.metrics[k].heart_rate = Math.round(hr);
  const bloodOxygen = averageForDay(d.bloodoxygen_values, d.bloodoxygen_dates, k, day);
  if (bloodOxygen != null) db.metrics[k].blood_oxygen = Math.round(bloodOxygen);
  // Same straggler filtering as hrv/rhr above.
  const weight = averageForDay(d.weight_values, d.weight_dates, k, day);
  if (weight != null) { db.metrics[k].body_mass = Math.round(weight * 10) / 10; db.weight[k] = db.metrics[k].body_mass; }
  const vo2max = averageForDay(d.vo2max_values, d.vo2max_dates, k, day);
  if (vo2max != null) db.metrics[k].vo2max = Math.round(vo2max * 10) / 10;
  const hrr = averageForDay(d.hrr_values, d.hrr_dates, k, day);
  if (hrr != null) db.metrics[k].hrr_bpm = Math.round(hrr);
  // Sleep: total asleep hours, WASO, efficiency, and deep/REM/light stage
  // minutes all derived from the same start/end/type triple — see
  // shortcutParsing.js's computeSleepMetrics for why (In Bed vs. Awake vs.
  // genuine sleep-stage segments). Stage minutes are only non-null when the
  // sync's sleep_types actually reports stage-level values (a source that
  // only sends a single generic "Sleep"/"Asleep" value still gets a real
  // sleep_hours total, just no stage breakdown for sleepScore.js's
  // deep/rem/light dimensions).
  const { asleepHours, wasoMin, sleepEff, deepMin, remMin, lightMin, wakeTimeMs } = computeSleepMetrics(d.sleep_start, d.sleep_end, d.sleep_types);
  if (asleepHours != null) db.metrics[k].sleep_hours = asleepHours;
  if (wasoMin != null) db.metrics[k].waso_min = wasoMin;
  if (sleepEff != null) db.metrics[k].sleep_eff = sleepEff;
  if (deepMin != null) db.metrics[k].deep_sleep_min = deepMin;
  if (remMin != null) db.metrics[k].rem_sleep_min = remMin;
  if (lightMin != null) db.metrics[k].light_sleep_min = lightMin;
  if (wakeTimeMs != null) db.metrics[k].wake_time_ms = wakeTimeMs;
  // Legacy direct-field inputs — still accepted for the /health (Health Auto
  // Export) path or any future manual sync, which send scalars directly
  // rather than the Shortcuts-specific newline-text lists above.
  if (d.deepmin != null) db.metrics[k].deep_sleep_min = d.deepmin;
  if (d.remmin != null) db.metrics[k].rem_sleep_min = d.remmin;
  if (d.coremin != null) db.metrics[k].light_sleep_min = d.coremin;
  if (d.awakemin != null) db.metrics[k].waso_min = d.awakemin;
  if (d.sleephr) db.metrics[k].sleep_heart_rate = d.sleephr;
  if (d.sleepeff != null) db.metrics[k].sleep_eff = d.sleepeff;
  else if (d.inbed && d.sleep) db.metrics[k].sleep_eff = Math.round((d.sleep / d.inbed) * 100);
  if (d.alcohol_units != null && d.alcohol_units > 0) {
    db.alcoholLog = db.alcoholLog || [];
    const existing = db.alcoholLog.find(e => e.date === k);
    if (existing) existing.units = d.alcohol_units;
    else db.alcoholLog.push({ date: k, units: d.alcohol_units, ts: Date.now() });
  }
  if (Array.isArray(d.workouts)) {
    const shortcutNow = new Date().toISOString();
    for (const w of d.workouts) {
      const wDate = w.date ? w.date.slice(0, 10) : k;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wDate)) continue;
      const name = (w.name || "workout").toLowerCase();
      const dur = w.minutes || 0;
      const mergeIdx = findOrMergeWorkout(db.workouts || [], wDate, 'shortcut');
      if (mergeIdx >= 0) {
        const existing = db.workouts[mergeIdx];
        db.workouts[mergeIdx] = createWorkoutRecord({
          date: wDate, name, source: 'shortcut',
          duration: dur || (existing?.duration || null),
          kcal: (w.calories || null) || (existing?.kcal || null),
          sets: existing?.sets || 0,
          createdAt: existing?.createdAt || shortcutNow,
          updatedAt: shortcutNow,
        });
      } else if (!db.workouts.find(x => x.date === wDate && x.name === name && x.source === 'shortcut')) {
        db.workouts.push(createWorkoutRecord({
          date: wDate, name, source: 'shortcut',
          duration: dur || null, kcal: w.calories || null,
          createdAt: shortcutNow, updatedAt: shortcutNow,
        }));
      }
    }
  }
  db.lastSyncAt = new Date().toISOString();
  await save();

  // Awaited rather than fire-and-forget: this is a 1st-gen Cloud Function
  // (functions.https.onRequest), where the platform can freeze or recycle the
  // instance immediately once the response is sent, with no guarantee that
  // work still in flight at that point completes. A detached .then() here
  // used to mean the briefing + push notification would intermittently and
  // silently never happen. The 300s function timeout gives plenty of room.
  // /shortcut can fire several times a day (manual runs on top of the
  // automation) — only generate/push once per day, not on every sync.
  try {
    if (db.todayBriefing?.date !== day()) {
      const briefing = await generateMorningBriefing(db);
      if (briefing) {
        db.todayBriefing = briefing;
        await save();
        const subs = db.pushSubscriptions || [];
        if (subs.length && VAPID_PUBLIC && VAPID_PRIVATE) {
          await Promise.allSettled(subs.map(sub =>
            webpush.sendNotification(sub, JSON.stringify({
              title: briefing.notification || briefing.headline,
              body: briefing.subheading || '',
              url: '/',
            }))
          ));
        }
      }
    }
  } catch (e) {
    console.error('[briefing] generation failed:', e);
  }

  res.json({ ok: true, date: k });
});

// ---------- Hevy helpers ----------
function hevyKey() {
  return process.env.HEVY_API_KEY || functions.config().hevy?.key;
}

// Maps Hevy's set_type onto the app's own W/N/D vocabulary (SET_TYPES in
// src/app.jsx). 'failure' has no dedicated slot here, so it's treated as a
// normal working set like anything else that isn't explicitly a warmup or a
// dropset — the app tracks effort via RIR/RPE, not a separate failure type.
function hevySetType(setType) {
  if (setType === 'warmup') return 'W';
  if (setType === 'dropset') return 'D';
  return 'N';
}

// Source-agnostic: called from every import path (Hevy webhook/backfill, CSV
// import, parsed-session import) so an exercise name that doesn't resolve to
// a real EXERCISE_DB entry (via findExercise, which now also checks
// exerciseNameAliases.js) gets saved as a local custom exercise instead of
// just silently existing as an orphan string in db.lifts forever — the same
// customExercises mechanism the live session logger already uses when a
// freestyle-typed name isn't recognized.
function registerUnknownExercisesAsCustom(names) {
  db.customExercises = db.customExercises || [];
  for (const raw of names) {
    const name = (raw || '').trim().toLowerCase();
    if (!name || findExercise(name)) continue;
    if (!db.customExercises.find(ce => ce.name === name)) db.customExercises.push({ name });
  }
}

async function ingestWorkout(w) {
  const wDate = utcToAppLocalDateStr(w.start_time || w.created_at);
  if (!wDate) return 0;

  const startMs = w.start_time ? new Date(w.start_time).getTime() : 0;
  const endMs = w.end_time ? new Date(w.end_time).getTime() : 0;
  const duration = startMs && endMs ? Math.round((endMs - startMs) / 60000) : null;
  const wTitle = (w.title || "gym").toLowerCase();
  const now = new Date().toISOString();

  const newEntries = [];
  for (const ex of (w.exercises || [])) {
    const name = (ex.title || ex.name || "").toLowerCase();
    if (!name) continue;
    for (const set of (ex.sets || [])) {
      const kg = set.weight_kg ?? (set.weight_lbs ? set.weight_lbs / 2.20462 : 0);
      const reps = set.reps || 0;
      const isDupe = db.lifts.find(l => l.date === wDate && l.exercise === name && Math.abs((l.kg || 0) - kg) < 0.1 && l.reps === reps);
      if (!isDupe && (kg > 0 || reps > 0)) {
        const entry = { date: wDate, exercise: name, kg: Math.round(kg * 100) / 100, reps, source: "hevy" };
        // Hevy knows when the session actually started; keeping it means an
        // imported evening workout doesn't read as 18 hours older than it was.
        const hevyStart = importedStartStamp(w.start_time);
        if (hevyStart) entry.start = hevyStart;
        const type = hevySetType(set.set_type);
        if (type !== 'N') entry.type = type;
        if (set.rpe != null) entry.rir = Math.max(0, Math.round((10 - set.rpe) * 10) / 10);
        newEntries.push(entry);
      }
    }
  }
  if (newEntries.length) {
    registerUnknownExercisesAsCustom(newEntries.map(e => e.exercise));
    await appendLifts(liftsDocRef, newEntries);
    db.lifts.push(...newEntries);
  }

  if (newEntries.length) {
    const mergeIdx = findOrMergeWorkout(db.workouts, wDate, 'hevy');
    const existing = db.workouts[mergeIdx];
    const workoutRecord = createWorkoutRecord({
      date: wDate,
      name: wTitle,
      source: 'hevy',
      sourceId: String(w.id || ''),
      duration: duration || (existing?.duration || null),
      sets: (existing?.sets || 0) + newEntries.length,
      createdAt: existing?.createdAt || (w.start_time || w.created_at),
      updatedAt: now,
    });
    if (mergeIdx >= 0) db.workouts[mergeIdx] = workoutRecord;
    else db.workouts.push(workoutRecord);
  }
  return newEntries.length;
}

// ---------- Hevy webhook ----------
app.post("/hevy/key", async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  db.profile = { ...(db.profile || {}), hevyApiKey: key };
  await save();
  res.json({ ok: true });
});

app.post("/hevy/webhook", async (req, res) => {
  // Awaited rather than fire-and-forget: this is a 1st-gen Cloud Function,
  // where the platform can freeze or recycle the instance immediately once
  // the response is sent, with no guarantee that work still in flight at
  // that point completes. Responding before the fetch+ingest+save chain
  // even started meant Hevy saw a 200 and considered the webhook delivered
  // while the actual save could be silently killed mid-flight — the workout
  // never lands, and nothing downstream (fatigue, PRs, history) ever
  // reflects it, indistinguishable from the sync having done nothing at
  // all. Same fix already applied to /shortcut and /strava/callback; the
  // 300s function timeout gives plenty of room for a single Hevy API call.
  const workoutId = req.body.workoutId;
  const key = hevyKey();
  if (!workoutId || !key) return res.sendStatus(200);
  try {
    const r = await fetch("https://api.hevyapp.com/v1/workouts/" + workoutId, {
      headers: { "api-key": key, "accept": "application/json" }
    });
    if (!r.ok) { console.log("[hevy] fetch failed:", r.status); return res.sendStatus(200); }
    const w = await r.json();
    const added = await ingestWorkout(w);
    if (added) await save();
  } catch (e) { console.log("[hevy] webhook failed:", e.message); }
  res.sendStatus(200);
});

// ---------- Hevy backfill ----------
app.post("/hevy/backfill", async (req, res) => {
  const key = hevyKey();
  if (!key) return res.status(400).json({ error: "HEVY_API_KEY not configured" });
  const PAGE_SIZE = 10;
  let page = 1, totalAdded = 0, totalWorkouts = 0;
  try {
    while (true) {
      const r = await fetch(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=${PAGE_SIZE}`, {
        headers: { "api-key": key, "accept": "application/json" }
      });
      if (!r.ok) { console.log("[hevy] backfill page", page, "failed:", r.status); break; }
      const data = await r.json();
      const workouts = data.workouts || [];
      if (!workouts.length) break;
      for (const w of workouts) totalAdded += await ingestWorkout(w);
      totalWorkouts += workouts.length;
      if (workouts.length < PAGE_SIZE) break;
      page++;
    }
    if (totalAdded) {
      // FEATURES.md #142: see /import/hevy's identical seeding call — no-op
      // once ratings already exist.
      db.profile.exerciseRatings = seedRatingsFromImport(db.profile.exerciseRatings || {}, db.lifts, Date.now());
      await save();
    }
    res.json({ ok: true, workouts: totalWorkouts, added: totalAdded });
  } catch (e) {
    console.log("[hevy] backfill failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/import", async (req, res) => {
  const { lifts = [], weights = {}, workouts = [] } = req.body;
  let addedLifts = 0, addedWeights = 0, addedWorkouts = 0;
  const now = new Date().toISOString();
  for (const w of workouts) {
    if (!w.date || !w.name) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) continue;
    const mergeIdx = findOrMergeWorkout(db.workouts || [], w.date, 'hevy');
    if (mergeIdx >= 0) {
      const existing = db.workouts[mergeIdx];
      db.workouts[mergeIdx] = createWorkoutRecord({
        date: w.date, name: w.name, source: 'hevy',
        duration: w.duration || (existing?.duration || null),
        kcal: w.kcal || (existing?.kcal || null),
        sets: existing?.sets || 0,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
    } else {
      db.workouts = db.workouts || [];
      db.workouts.push(createWorkoutRecord({
        date: w.date, name: w.name, source: 'hevy',
        duration: w.duration || null, kcal: w.kcal || null,
        createdAt: now, updatedAt: now,
      }));
      addedWorkouts++;
    }
  }
  const newLiftEntries = [];
  for (const l of lifts) {
    if (!l.date || !l.exercise) continue;
    const isDupe = db.lifts.find(x => x.date === l.date && x.exercise === l.exercise && Math.abs((x.kg || 0) - (l.kg || 0)) < 0.1 && x.reps === l.reps);
    if (!isDupe) {
      const e = { date: l.date, exercise: l.exercise, kg: l.kg || 0, reps: l.reps || 0, source: "hevy" };
      if (l.rir != null) e.rir = l.rir;
      // Honoured if the caller supplies one. This is a generic external
      // endpoint (the iOS Shortcut among others) and most callers send a date
      // only — nothing is invented for them, the lift just falls back to
      // midnight as before.
      const importedStart = importedStartStamp(l.start);
      if (importedStart) e.start = importedStart;
      newLiftEntries.push(e);
      addedLifts++;
    }
  }
  for (const [date, kg] of Object.entries(weights)) {
    if (kg && !db.weight[date]) { db.weight[date] = kg; addedWeights++; }
  }
  if (newLiftEntries.length) {
    registerUnknownExercisesAsCustom(newLiftEntries.map(e => e.exercise));
    await appendLifts(liftsDocRef, newLiftEntries);
    db.lifts.push(...newLiftEntries);
    // FEATURES.md #142: see /import/hevy's identical seeding call — no-op
    // once ratings already exist.
    db.profile.exerciseRatings = seedRatingsFromImport(db.profile.exerciseRatings || {}, db.lifts, Date.now());
  }
  if (addedLifts || addedWeights || addedWorkouts) await save();
  res.json({ ok: true, addedLifts, addedWeights, addedWorkouts });
});

// ---------- Strava ----------
const STRAVA_BASE = "https://europe-west2-pressnewsletter.cloudfunctions.net/api";

function stravaCredentials() {
  return {
    clientId: process.env.STRAVA_CLIENT_ID || functions.config().strava?.client_id,
    clientSecret: process.env.STRAVA_CLIENT_SECRET || functions.config().strava?.client_secret,
  };
}

async function stravaAccessToken() {
  const { clientId, clientSecret } = stravaCredentials();
  if (!db.strava?.refresh_token) return null;
  if (db.strava.expires_at > Date.now() / 1000 + 300) return db.strava.access_token;
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: db.strava.refresh_token, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  db.strava.access_token = data.access_token;
  db.strava.refresh_token = data.refresh_token;
  db.strava.expires_at = data.expires_at;
  await save();
  return data.access_token;
}

function ingestActivity(a) {
  const parsed = parseStravaActivity(a);
  if (!parsed) return;
  const { date, name, sourceId, duration, kcal, isRun, structured } = parsed;
  const now = new Date().toISOString();
  const mergeIdx = findOrMergeWorkout(db.workouts, date, 'strava');
  if (mergeIdx >= 0) {
    const existing = db.workouts[mergeIdx];
    db.workouts[mergeIdx] = createWorkoutRecord({
      date, name, source: 'strava', sourceId,
      duration: duration || (existing?.duration || null),
      kcal: kcal || (existing?.kcal || null),
      sets: existing?.sets || 0,
      createdAt: existing?.createdAt || (a.start_date_local || a.start_date),
      updatedAt: now,
    });
  } else if (!db.workouts.find(w => w.source === "strava" && w.sourceId === sourceId)) {
    db.workouts.push(createWorkoutRecord({
      date, name, source: 'strava', sourceId,
      duration, kcal,
      createdAt: a.start_date_local || a.start_date,
      updatedAt: now,
    }));
  }

  // Structured capture for the running/hybrid engines (#95-113, #79-94) — the
  // workout record above stays a generic summary; distance/pace/HR/elevation
  // only live here. Split by Strava's own sport_type against the app's
  // existing lifting/running/sports vocabulary (userDoc.js weeklyTargets).
  if (structured) {
    const target = isRun ? db.runs : db.sports;
    if (!target.find(r => r.sourceId === sourceId)) {
      target.push({ date, source: "strava", sourceId, ...structured });
    }
  }
}

async function syncStrava() {
  const token = await stravaAccessToken();
  if (!token) return 0;
  const after = db.strava.lastSyncAt ? Math.floor(new Date(db.strava.lastSyncAt).getTime() / 1000) : 0;
  let page = 1, total = 0;
  while (true) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}${after ? `&after=${after}` : ""}`, {
      headers: { "Authorization": "Bearer " + token },
    });
    if (!r.ok) break;
    const activities = await r.json();
    if (!activities.length) break;
    for (const a of activities) ingestActivity(a);
    total += activities.length;
    if (activities.length < 100) break;
    page++;
  }
  db.strava.lastSyncAt = new Date().toISOString();
  await save();
  return total;
}

app.get("/strava/auth", (req, res) => {
  const { clientId } = stravaCredentials();
  if (!clientId) return res.status(400).send("STRAVA_CLIENT_ID not configured");
  const callbackUrl = `${STRAVA_BASE}/strava/callback`;
  res.redirect(`https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=activity:read_all&approval_prompt=auto`);
});

app.get("/strava/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.send("Strava auth failed: " + (error || "no code"));
  const { clientId, clientSecret } = stravaCredentials();
  try {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
    });
    if (!r.ok) return res.send("Token exchange failed: " + r.status);
    const data = await r.json();
    db.strava = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
    await save();
    // Awaited rather than fire-and-forget: this is a 1st-gen Cloud Function,
    // where the platform can freeze the instance right after the response is
    // sent, so a detached sync here could silently never complete.
    try { await syncStrava(); } catch (e) { console.log("[strava] initial sync failed:", e.message); }
    res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;background:#0a0d0b;color:#e8ece9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}h2{color:#3ddc84}p{color:#8a948d}</style></head><body><h2>Strava connected</h2><p>Syncing your activities…</p><script>setTimeout(()=>window.location.href="https://georgevcronin.github.io/dashboard/",2500)</script></body></html>');
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

app.post("/strava/sync", async (req, res) => {
  if (!db.strava?.refresh_token) return res.status(400).json({ error: "Strava not connected" });
  try {
    const synced = await syncStrava();
    res.json({ ok: true, synced });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Derived vitality (same adaptive logic) ----------
function lastN(obj, n) {
  return Object.keys(obj).sort().slice(-n).map((k) => ({ date: k, ...((typeof obj[k] === "object") ? obj[k] : { value: obj[k] }) }));
}
// Today's recovery score (HRV/RHR/sleep/wrist-temp/SpO2/HR-derived), used to modulate
// CNS fatigue. Returns null when there isn't enough HRV history for a personal baseline.
function getRecoveryScore(db) {
  const days = lastN(db.metrics || {}, 30);
  const last14 = days.slice(-14);
  const today = days.at(-1) || {};
  const baseHRV = avg(last14.map(d => d.heart_rate_variability).filter(Boolean));
  const baseRHR = avg(last14.map(d => d.resting_heart_rate).filter(Boolean));
  const baseWristTemp = avg(last14.map(d => d.wrist_temperature).filter(Boolean));
  const baseHR = avg(last14.map(d => d.heart_rate).filter(Boolean));
  const sleep = personalSleepTarget(days);
  return computeDay(today, baseHRV, baseRHR, sleep.target, baseWristTemp, baseHR);
}
app.get("/summary", async (req, res) => {
  const days = lastN(db.metrics, 30);
  const last14 = days.slice(-14);
  const today = days.at(-1) || {};
  const baseHRV = avg(last14.map(d => d.heart_rate_variability).filter(Boolean));
  const baseRHR = avg(last14.map(d => d.resting_heart_rate).filter(Boolean));
  const baseWristTemp = avg(last14.map(d => d.wrist_temperature).filter(Boolean));
  const baseHR = avg(last14.map(d => d.heart_rate).filter(Boolean));
  const sleep = personalSleepTarget(days);
  const recovery = computeDay(today, baseHRV, baseRHR, sleep.target, baseWristTemp, baseHR);
  // The same six sub-scores computeDay just summed, reported instead of
  // discarded. Re-scores those six arithmetic terms; no extra Firestore reads
  // and no second pass over the metrics history.
  const recoveryFactors = recoveryDrivers(today, {
    hrv: baseHRV, rhr: baseRHR, sleepTarget: sleep.target, wristTemp: baseWristTemp, hr: baseHR,
  });
  const recoveryTrend = last14.map(d => computeDay(d, baseHRV, baseRHR, sleep.target, baseWristTemp, baseHR)).filter(x => x != null);
  const sleepScore = computeSleepScore(today);
  const sleepScoreTrend = last14.map(d => computeSleepScore(d)?.score).filter(v => v != null);
  const weights = lastN(db.weight, 30);
  const summaryMusclePeaks = musclePeaksFromLifts(db.lifts);
  const muscleFatigue = computeHybridFatigue(
    db.lifts || [],
    db.runs || [],
    summaryMusclePeaks,
    db.soreness || [],
    db.muscleSensitivity || {},
    personalizedRecoveryHours(db.profile, activeCycleFactor(db)),
    db.profile
  );
  const monthWk = db.workouts.filter(w => w.date >= day(new Date(Date.now() - 30 * 864e5)));
  const sleepDebtH = last14.slice(-2).reduce((s, d) => s + (d.sleep_hours ? Math.max(0, sleep.target - d.sleep_hours) : 0), 0);
  const target = db.profile.waterTarget || 7;
  const waterDays = lastN(db.water, 30).map(w => w.value);
  let streak = 0; for (let i = waterDays.length - 1 - (waterDays.at(-1) < target ? 1 : 0); i >= 0 && waterDays[i] >= target; i--) streak++;
  const liftVolume = [0, 0, 0, 0];
  for (const l of db.lifts) {
    const ago = Math.floor((Date.now() - new Date(l.date).getTime()) / (7 * 864e5));
    if (ago >= 0 && ago < 4) liftVolume[3 - ago] += l.kg * (l.reps || 1);
  }
  const HL = 4 * 36e5, BASE_HYD = 55, BUMP = 12;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const evs = (db.waterEvents || []).filter(t => t >= midnight.getTime());
  const hydrationCurve = [];
  for (let h = 0; h <= Math.min(24, new Date().getHours() + 1); h++) {
    const t = midnight.getTime() + h * 36e5;
    let lvl = BASE_HYD;
    for (const e of evs) if (e <= t) lvl += BUMP * Math.pow(0.5, (t - e) / HL);
    hydrationCurve.push(Math.round(Math.min(100, lvl)));
  }
  // Alcohol
  const { alcoholLastNight, alcoholLast7 } = alcoholStats(db.alcoholLog);
  // VO2 max + HRR series
  const vo2maxSeries = Object.keys(db.metrics).sort().filter(k => db.metrics[k].vo2max != null).slice(-14).map(k => ({ date: k, value: db.metrics[k].vo2max }));
  const hrrSeries = Object.keys(db.metrics).sort().filter(k => db.metrics[k].hrr_bpm != null).slice(-14).map(k => ({ date: k, value: db.metrics[k].hrr_bpm }));
  // Photos: metadata lives in Firestore, image bytes live in Cloud Storage — sign a
  // fresh read URL per request since signed URLs cap out at 7 days.
  const photosMeta = await Promise.all((db.photos || []).slice(-20).map(async p => ({
    id: p.id, date: p.date, note: p.note, url: await signedPhotoUrl(p.path),
  })));
  // Running prediction: 8-week VO₂max gain forecast (self-calibrating from actual athlete data)
  let runningPrediction = null;
  const currentVO2max = resolveVO2max(vo2maxSeries.length ? vo2maxSeries.at(-1)?.value : null, db.profile);
  if (db.runs && db.runs.length && currentVO2max?.vo2max) {
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    const recentRuns = db.runs.filter(r => new Date(r.date) >= eightWeeksAgo);
    if (recentRuns.length > 0) {
      // Compute weekly TRIMP buckets
      const weeklyTrimp = {};
      for (const run of recentRuns) {
        const runDate = new Date(run.date);
        const weekNum = Math.floor((Date.now() - runDate.getTime()) / (7 * 864e5));
        const key = weekNum;
        if (!weeklyTrimp[key]) weeklyTrimp[key] = 0;
        if (run.durationMin && run.avgHeartRate) {
          const resting = db.profile?.baselines?.restingHeartRate ?? 60;
          const maxHR = db.profile?.baselines?.maxHeartRate ?? 200;
          const hrr = (run.avgHeartRate - resting) / (maxHR - resting);
          if (hrr > 0 && hrr < 1.2) {
            const b = db.profile?.sex === 'F' ? 0.64 : db.profile?.sex === 'M' ? 1.92 : 1.5;
            weeklyTrimp[key] += run.durationMin * hrr * Math.exp(b * hrr);
          }
        }
      }
      const weeks = Object.values(weeklyTrimp).slice(0, 8);
      if (weeks.length >= 4) {
        runningPrediction = predict8WeekVO2Gain(weeks, currentVO2max.vo2max);
      }
    }
  }
  // Cardio Score (functions/cardioStandards.js) -- VO2max's equivalent of
  // muscleLevels below. Not reusing currentVO2max above (its resolveVO2max
  // call passes db.profile/a bare number where {value,dateMs}/a real
  // calculatedVDOT belong, so it never actually resolves anything -- a
  // pre-existing issue, not fixed here, out of scope for this change).
  // Prefers running's VDOT if there's running data, else cycling's own
  // FTP-based estimate, else the shared HR-ratio fallback -- same chain
  // /run/recommendation, /cycling/recommendation and /swim/recommendation
  // all use.
  const cardioAge = db.profile.age ?? (db.profile.dob ? Math.round(computeAgeYears(db.profile.dob)) : null);
  const cardioBodyMassKg = weights.at(-1)?.value ?? Object.values(db.weight).at(-1);
  const cardioMaxHR = db.profile?.baselines?.maxHeartRate || (cardioAge ? estimateMaxHeartRate(cardioAge) : null);
  const cardioRestingHR = db.profile?.baselines?.restingHeartRate;
  const runningVdotForCardio = db.runs?.length ? vdotTrend(db.runs, 30) : null;
  const cyclingRidesForCardio = (db.sports || []).filter(s => classifySportType(s.sportType) === 'cycling');
  const cyclingVdotForCardio = !runningVdotForCardio && cyclingRidesForCardio.length && cardioBodyMassKg
    ? estimateCyclingVO2maxFromRides(cyclingRidesForCardio, cardioBodyMassKg, cardioMaxHR) : null;
  const cardioVO2max = resolveVO2max(
    latestAppleWatchVO2max(days),
    runningVdotForCardio || cyclingVdotForCardio,
    cardioMaxHR && cardioRestingHR ? { maxHR: cardioMaxHR, restingHR: cardioRestingHR } : null,
  );
  const cardioScore = cardioVO2max?.vo2max ? computeCardioScore(cardioVO2max.vo2max, cardioAge, db.profile?.sex) : null;
  res.json({
    profile: db.profile, hydrationCurve, hydrationNow: hydrationCurve.at(-1) ?? null,
    liftVolume,
    today: { recovery, hrv: today.heart_rate_variability ?? null, rhr: today.resting_heart_rate ?? null, sleepH: today.sleep_hours ?? null, sleepEff: today.sleep_eff ?? null, steps: today.step_count ?? null, wristTemp: today.wrist_temperature ?? null, hr: today.heart_rate ?? null, spo2: today.blood_oxygen ?? null, wakeTimeMs: today.wake_time_ms ?? null },
    sleepTarget: sleep.target, sleepTargetLearned: sleep.learned,
    sleepDebtH: Math.round(sleepDebtH * 10) / 10,
    sleepScore, sleepScoreTrend,
    recoveryTrend, recoveryFactors, sleepSeries: last14.map(d => d.sleep_hours).filter(Boolean),
    rhrSeries: last14.map(d => d.resting_heart_rate).filter(Boolean),
    baselines: { hrv: baseHRV && Math.round(baseHRV), rhr: baseRHR && Math.round(baseRHR), wristTemp: baseWristTemp && Math.round(baseWristTemp * 10) / 10, hr: baseHR && Math.round(baseHR) },
    composition: compVerdict(weights, db.lifts),
    waterStats: { streak, avg: waterDays.length ? Math.round(avg(waterDays) * 10) / 10 : 0, hitRate: waterDays.length ? Math.round((waterDays.filter(v => v >= target).length / waterDays.length) * 100) : 0, best: waterDays.length ? Math.max(...waterDays) : 0 },
    musclePeaks: summaryMusclePeaks,
    muscleFatigue,
    injuries: (db.injuries || []).filter(i => !i.resolved).map(i => ({
      ...i,
      healingDays: INJURY_HEALING_DAYS[i.severity] || INJURY_HEALING_DAYS.moderate,
      elapsedDays: Math.floor((Date.now() - i.ts) / 864e5),
      clearance: Math.round(100 - injuryFatiguePenalty(i)),
    })),
    cycle: db.cycle || [],
    cycleStats: db.profile?.cycleTrackingEnabled ? cyclePhaseFactor(db.cycle || [], Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned) : null,
    cyclePrediction: db.profile?.cycleTrackingEnabled ? predictedNextPeriod(db.cycle || [], Date.now(), db.profile?.cycleIrregular) : null,
    weights, workouts: [...db.workouts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20), workoutsMonth: monthWk.length,
    water: lastN(db.water, 14), waterToday: db.water[day()] || 0,
    weeklyPlan: db.weeklyPlan ? { ...db.weeklyPlan, sessionsCompletedThisWeek: weekLiftSessionsCompleted(db.lifts) } : null,
    lifts: [...db.lifts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,200), thoughts: db.thoughts,
    nutritionToday: (db.nutrition || {})[day()] || { protein: 0, carbs: 0, fat: 0, calories: 0 },
    nutrition14: Object.keys(db.nutrition || {}).sort().slice(-14).map(k => ({ date: k, ...(db.nutrition[k]) })),
    nutritionLog: (db.nutritionLog || []).filter(l => l.date === day()),
    bodyFatToday: (db.metrics[day()] || {}).body_fat_percentage || null,
    bodyFat30: Object.keys(db.metrics).sort().slice(-30).filter(k => db.metrics[k].body_fat_percentage != null).map(k => ({ date: k, pct: db.metrics[k].body_fat_percentage })),
    macroTargets: db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 },
    macroMode: db.profile.macroMode || "manual", macroGoal: db.profile.macroGoal || "recomp",
    lastSync: db.lastSyncAt ? (() => { const d = new Date(db.lastSyncAt); return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }) + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }); })() : (days.at(-1)?.date || null),
    stravaConnected: !!db.strava?.refresh_token,
    soreness: (db.soreness || []).filter(e => Date.now() - e.ts < 5 * 24 * 3600000),
    muscleSensitivity: db.muscleSensitivity || {}, cnsSensitivity: db.cnsSensitivity || 1.0,
    customExercises: db.customExercises || [],
    alcoholLastNight, alcoholLast7,
    vo2maxSeries, hrrSeries, runningPrediction,
    measurements: (db.measurements || []).slice(-30),
    supplements: db.supplements || [],
    supplementLogToday: (db.supplementLog || []).filter(e => e.date === day()),
    photosMeta,
    experiments: (db.experiments || []),
    travelMode: db.profile?.travelMode || false,
    dataMaturity: computeDataMaturity(db.lifts),
    muscleLevels: computeMuscleLevels(db.lifts, db.weight, weights.at(-1)?.value ?? Object.values(db.weight).at(-1), db.profile?.sex, fatigueTimeline(db.lifts, summaryMusclePeaks)),
    cardioScore,
    // FEATURES.md #23 — the real, measured rate (once there's a logged gap
    // to measure) always wins over the onboarding self-report; the seed
    // stored on the profile is only ever a fallback until then.
    atrophyEstimate: estimateAtrophyRate(db.lifts) || db.profile?.estimatedAtrophyRate || null,
  });
});

// ---------- Unified activity feed ----------
// Deliberately not folded into /summary: the timeline is the whole log
// history, /summary is fixed short windows, and merging them would push the
// common dashboard payload up by the size of the entire lift history.
app.get("/timeline", async (req, res) => {
  const limit = Math.min(500, Math.max(1, +req.query.limit || 100));
  const all = buildUnifiedTimeline(db);
  res.json({ entries: all.slice(0, limit), total: all.length });
});

// ---------- Movement-pattern fatigue ----------
app.get("/movement-patterns", async (req, res) => {
  res.json({ patterns: computePatternFatigue(db.lifts, personalizedRecoveryHours(db.profile, activeCycleFactor(db))) });
});

// ---------- Long-arc trends ----------
// Separate from /summary's fixed 14/30-day windows: lets the frontend ask for
// a wider view (90d, 1y) of a single metric without bloating the main payload.
app.get("/trends", async (req, res) => {
  const RANGES = [14, 30, 90, 365];
  const range = RANGES.includes(+req.query.range) ? +req.query.range : 30;
  const metric = req.query.metric || "weight";
  const cutoff = day(new Date(Date.now() - range * 864e5));
  const rawField = { hrv: "heart_rate_variability", rhr: "resting_heart_rate", sleep: "sleep_hours", steps: "step_count", bodyFat: "body_fat_percentage" }[metric];

  let series = [];
  if (metric === "weight") {
    series = Object.keys(db.weight).sort().filter(k => k >= cutoff).map(k => ({ date: k, value: db.weight[k] }));
  } else if (rawField) {
    series = Object.keys(db.metrics).sort().filter(k => k >= cutoff && db.metrics[k][rawField] != null).map(k => ({ date: k, value: db.metrics[k][rawField] }));
  } else if (metric === "recovery") {
    const allDays = Object.keys(db.metrics).sort();
    const sleep = personalSleepTarget(allDays.map(k => db.metrics[k]));
    for (let i = 0; i < allDays.length; i++) {
      const k = allDays[i];
      if (k < cutoff) continue;
      const window = allDays.slice(Math.max(0, i - 14), i).map(dk => db.metrics[dk]);
      const baseHRV = avg(window.map(d => d.heart_rate_variability).filter(Boolean));
      const baseRHR = avg(window.map(d => d.resting_heart_rate).filter(Boolean));
      const baseWristTemp = avg(window.map(d => d.wrist_temperature).filter(Boolean));
      const baseHR = avg(window.map(d => d.heart_rate).filter(Boolean));
      const v = computeDay(db.metrics[k], baseHRV, baseRHR, sleep.target, baseWristTemp, baseHR);
      if (v != null) series.push({ date: k, value: v });
    }
  } else if (metric === "sleepScore") {
    series = Object.keys(db.metrics).sort().filter(k => k >= cutoff)
      .map(k => ({ date: k, value: computeSleepScore(db.metrics[k])?.score }))
      .filter(p => p.value != null);
  } else if (["squat", "bench", "deadlift", "overheadPress", "row"].includes(metric)) {
    const byDate = {};
    for (const l of (db.lifts || [])) {
      if (!l.date || l.date < cutoff || classifyLift(l.exercise || "") !== metric) continue;
      const e1 = estimate1RM(l.kg, l.reps);
      if (e1 == null) continue;
      if (!byDate[l.date] || e1 > byDate[l.date]) byDate[l.date] = e1;
    }
    let best = 0;
    series = Object.keys(byDate).sort().map(k => {
      best = Math.max(best, byDate[k]);
      return { date: k, value: Math.round(best * 10) / 10 };
    });
  }
  res.json({ metric, range, series });
});

// ---------- CSV export ----------
app.get("/export/csv", async (req, res) => {
  const type = req.query.type || "lifts";
  let filename, csv;
  if (type === "lifts") {
    filename = "lifts.csv";
    csv = toCsv(db.lifts || [], ["date", "exercise", "kg", "reps", "rir", "source"]);
  } else if (type === "workouts") {
    filename = "workouts.csv";
    csv = toCsv(db.workouts || [], ["date", "name", "duration", "kcal", "source"]);
  } else if (type === "weight") {
    filename = "weight.csv";
    const rows = Object.keys(db.weight).sort().map(k => ({ date: k, kg: db.weight[k] }));
    csv = toCsv(rows, ["date", "kg"]);
  } else if (type === "metrics") {
    filename = "metrics.csv";
    const cols = ["date", "heart_rate_variability", "resting_heart_rate", "sleep_hours", "sleep_eff", "deep_sleep_min", "rem_sleep_min", "light_sleep_min", "waso_min", "sleep_heart_rate", "step_count", "vo2max", "hrr_bpm", "wrist_temperature", "heart_rate", "blood_oxygen", "body_fat_percentage", "body_mass"];
    const rows = Object.keys(db.metrics).sort().map(k => ({ date: k, ...db.metrics[k] }));
    csv = toCsv(rows, cols);
  } else if (type === "nutrition") {
    filename = "nutrition-log.csv";
    csv = toCsv(db.nutritionLog || [], ["date", "time", "label", "calories", "protein", "carbs", "fat", "description"]);
  } else if (type === "measurements") {
    filename = "measurements.csv";
    csv = toCsv(db.measurements || [], ["date", "type", "value", "unit"]);
  } else {
    return res.status(400).json({ error: "unknown export type" });
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="press-${filename}"`);
  res.send(csv);
});

// ---------- Manual log endpoints ----------
app.post("/water", async (req, res) => {
  const k = day(); const delta = req.body.delta ?? 1;
  db.water[k] = (db.water[k] || 0) + delta; if (db.water[k] < 0) db.water[k] = 0;
  db.waterEvents = db.waterEvents || [];
  if (delta > 0) db.waterEvents.push(Date.now()); else db.waterEvents.pop();
  db.waterEvents = db.waterEvents.slice(-200);
  await save(); res.json({ today: db.water[k] });
});
app.post("/weight", async (req, res) => {
  db.weight[day()] = req.body.kg;
  await save();
  const weights = lastN(db.weight, 30);
  res.json({ ok: true, weights, composition: compVerdict(weights, db.lifts) });
});
app.post("/bodyfat", async (req, res) => {
  const { pct } = req.body;
  const k = day();
  db.metrics[k] = db.metrics[k] || {};
  db.metrics[k].body_fat_percentage = pct;
  await save();
  res.json({
    ok: true,
    bodyFatToday: pct,
    bodyFat30: Object.keys(db.metrics).sort().slice(-30).filter(kk => db.metrics[kk].body_fat_percentage != null).map(kk => ({ date: kk, pct: db.metrics[kk].body_fat_percentage })),
  });
});
// Accepts an optional caller-supplied "HH:MM" time (logging a meal after the
// fact, e.g. dinner logged an hour late) — falls back to now for anything
// missing or malformed rather than rejecting the whole log attempt.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function resolveEntryTime(requested) {
  return HHMM_RE.test(requested || '') ? requested : new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
app.post("/nutrition", async (req, res) => {
  const k = day(); db.nutrition = db.nutrition || {};
  db.nutrition[k] = db.nutrition[k] || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const m of ["protein", "carbs", "fat", "calories"]) db.nutrition[k][m] = (db.nutrition[k][m] || 0) + (req.body[m] || 0);
  db.nutritionLog = db.nutritionLog || [];
  let entry = null;
  if (req.body.label) {
    entry = {
      id: crypto.randomUUID(), date: k, time: resolveEntryTime(req.body.time),
      label: req.body.label, protein: req.body.protein || 0, carbs: req.body.carbs || 0, fat: req.body.fat || 0, calories: req.body.calories || 0,
      ...(req.body.description?.trim() ? { description: req.body.description.trim() } : {}),
    };
    db.nutritionLog.push(entry);
  }
  await save(); res.json({ ...db.nutrition[k], entry });
});
// Currently only supports moving an entry's logged time — the total nutrient
// sums for the day are keyed by date not by entry, so a time-only edit never
// needs to touch db.nutrition[k].
app.patch("/nutrition/log/:id", async (req, res) => {
  if (!HHMM_RE.test(req.body.time || '')) return res.status(400).json({ error: 'time must be HH:MM' });
  const entry = (db.nutritionLog || []).find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'entry not found' });
  entry.time = req.body.time;
  await save();
  res.json({ ok: true, entry });
});
// "Cross off" a logged meal — removes it from the log and unwinds its
// macros from that date's daily total (the exact inverse of /nutrition's
// additive update), not just a client-side hide. Clamped at 0 rather than
// letting the day's total go negative if it's ever out of sync with the
// log (shouldn't happen, but the totals are a separate running sum from
// the log entries, not derived from them, so nothing guarantees it).
app.delete("/nutrition/log/:id", async (req, res) => {
  db.nutritionLog = db.nutritionLog || [];
  const idx = db.nutritionLog.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'entry not found' });
  const [entry] = db.nutritionLog.splice(idx, 1);
  const k = entry.date;
  if (db.nutrition?.[k]) {
    for (const m of ["protein", "carbs", "fat", "calories"]) {
      db.nutrition[k][m] = Math.max(0, (db.nutrition[k][m] || 0) - (entry[m] || 0));
    }
  }
  await save();
  res.json({ ok: true, nutritionToday: db.nutrition[day()] || { protein: 0, carbs: 0, fat: 0, calories: 0 } });
});
// Last N days of individual logged meals, grouped client-side by date — the
// main /summary payload only ever sends *today's* nutritionLog (see its
// nutritionLog: filter(l => l.date === day()) above), so a multi-day history
// view needs its own fetch rather than reusing what's already loaded.
app.get("/nutrition/history", async (req, res) => {
  const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));
  const cutoff = day(new Date(Date.now() - days * 864e5));
  const log = (db.nutritionLog || [])
    .filter(e => e.date >= cutoff)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  res.json({ log });
});
app.post("/nutrition/analyze", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
  const { imageBase64, mode, description } = req.body;
  if (!imageBase64 && !description?.trim()) return res.status(400).json({ error: 'imageBase64 or description required' });

  // Meal photos and text descriptions are inherently ambiguous about portion
  // size (Gemini is guessing at a whole plate/described amount), so both ask
  // for three sized estimates up front instead of one guess the user then
  // has to correct with a blind x0.5/1.5/2 multiplier. A nutrition-label
  // photo has no such ambiguity -- it's reading fixed per-serving numbers off
  // the label itself -- so that one stays a single flat result.
  // name and description are deliberately two separate fields, not one
  // string the frontend truncates for a "name" — that was the previous
  // shape, and it made the meal name and description read as copies of
  // each other (the name was literally just the description's first 40
  // characters). name is a short label; description is real content
  // (ingredients/prep/notable detail), not a restatement of the name.
  const portionsSchema = '{"name":"short meal name (2-5 words), e.g. \'Fried Egg on Toast\'","description":"one factual sentence on what it actually is -- ingredients, cooking method, anything notable -- not a restatement of the name","portions":[{"label":"Small","calories":0,"protein":0,"carbs":0,"fat":0},{"label":"Medium","calories":0,"protein":0,"carbs":0,"fat":0},{"label":"Large","calories":0,"protein":0,"carbs":0,"fat":0}]}';

  let promptText, image;
  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const labelPrompt = 'Read this nutrition label precisely. Return ONLY valid JSON: {"name":"product name","description":"brief note on flavor/variant/serving size if legible, else an empty string","calories":0,"protein":0,"carbs":0,"fat":0}. Use per-serving values. All numbers as integers.';
    const mealPrompt = `Analyse this meal photo. Estimate nutritional content for three portion sizes: a smaller portion, what's actually shown in the photo, and a larger portion. Return ONLY valid JSON: ${portionsSchema}. "Medium" is your best estimate of the actual portion shown. All numbers as integers.`;
    promptText = mode === 'label' ? labelPrompt : mealPrompt;
    image = { mimeType, data: rawBase64 };
  } else {
    // No photo — estimate from a plain-text description instead (e.g. "two
    // eggs and a slice of wholemeal toast with butter"). Same response
    // shape as the meal-photo path, so the frontend doesn't need a separate
    // code path past this endpoint.
    promptText = `Estimate the nutritional content of this food/meal from the description alone: "${description.trim()}", for three portion sizes: a smaller portion, a typical portion, and a larger portion. Return ONLY valid JSON: ${portionsSchema}. "Medium" is your best estimate of what was actually described. All numbers as integers.`;
  }

  const result = await callGeminiResilient({
    messages: [{ role: 'user', content: promptText }],
    ...(image ? { image } : {}),
    maxTokens: 450,
    jsonMode: true,
  });
  if (!result.ok) return res.status(500).json({ error: result.error?.message || `Gemini returned ${result.status}` });
  try { res.json(parseGeminiJSON(result.content)); } catch { res.status(500).json({ error: 'Gemini returned invalid JSON' }); }
});

app.post("/macro-targets", async (req, res) => {
  db.profile.macroTargets = db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 };
  for (const m of ["calories", "protein", "carbs", "fat"]) if (req.body[m] != null) db.profile.macroTargets[m] = +req.body[m];
  db.profile.macroMode = "manual"; await save(); res.json(db.profile.macroTargets);
});
app.post("/macro-auto", async (req, res) => {
  const bw = Object.values(db.weight).at(-1) || 75;
  const goal = req.body.goal || "recomp"; db.profile.macroGoal = goal;
  const mult = { cut: 22, recomp: 26, bulk: 30 }, protMult = { cut: 2.2, recomp: 2.0, bulk: 1.8 };
  let cals = Math.round(bw * (mult[goal] || 26)), protein = Math.round(bw * (protMult[goal] || 2.0));
  // Lose Fat only: the flat bodyweight x22 target above is always exactly a
  // 15.4% deficit off the bodyweight x26 'recomp' proxy, for every user --
  // checking it against that same proxy could never fire a limit. Checked
  // against a real per-person TDEE estimate instead (functions/
  // nutritionLimits.js), so a genuinely active person whose real
  // maintenance sits well above bodyweight x26 gets a target that reflects
  // that, not just the flat multiplier.
  let deficitCheck = null;
  if (goal === "cut") {
    const age = db.profile.age ?? (db.profile.dob ? Math.round(computeAgeYears(db.profile.dob)) : null);
    const maintenance = estimateMaintenanceCalories({
      sex: db.profile.sex, weightKg: bw, heightCm: db.profile.heightCm, age,
      trainingDaysPerWeek: db.profile.trainingDaysPerWeek,
    });
    if (maintenance) {
      const limited = applyDeficitLimit(cals, maintenance);
      cals = limited.calories;
      deficitCheck = { maintenanceCalories: maintenance, deficitPct: limited.deficitPct, status: limited.status, message: limited.message };
    }
  }
  const fat = Math.round(bw * 1), carbs = Math.round(Math.max(0, (cals - fat * 9 - protein * 4) / 4));
  db.profile.macroTargets = { calories: cals, protein, carbs, fat }; db.profile.macroMode = "auto";
  await save(); res.json({ goal, targets: db.profile.macroTargets, ...(deficitCheck ? { deficitCheck } : {}) });
});
app.post("/thought", async (req, res) => { db.thoughts.push({ date: day(), text: req.body.text }); await save(); res.json({ ok: true }); });

app.post("/profile", async (req, res) => {
  const body = { ...req.body };
  // Stamped server-side, never trusting a client-sent timestamp — reset
  // whenever the reported figure changes so it starts accruing fresh from
  // the corrected value.
  if (body.trainingExperienceYears != null) body.trainingExperienceSetAt = new Date().toISOString();
  // username/displayName go through /account/username only — that's the
  // only path that runs the uniqueness transaction and the monthly
  // rate-limit check. Silently dropping them here (rather than erroring)
  // keeps this generic endpoint safe against a client just including them
  // in a broader profile-save payload without meaning to bypass anything.
  delete body.username; delete body.displayName; delete body.lastUsernameChangeAt;
  // Elo-style exercise ratings (FEATURES.md #142) are server-computed only
  // — from real pairwise comparisons and import seeding, never a client-
  // supplied value — same protection as username/visibility above.
  delete body.exerciseRatings;
  // Per-category visibility toggles, gating what a follower can see (see
  // USERNAME_AND_COMPARISON.md §4/§6). Only the known keys are ever merged
  // in, whitelisted rather than trusting an arbitrary client object, since
  // this becomes a real access-control input once follow/comparison/feed
  // read it. workoutSessions defaults true (visible), comparison and feed
  // both default false (opt-in) — applied at read time in the endpoints
  // that check them, not stamped into the stored object here, so an
  // account that's never touched this at all still gets the right
  // defaults. feed is deliberately its own toggle, separate from and off
  // even when workoutSessions is already on — a persistent feed of every
  // session is a bigger exposure step than a profile someone has to visit
  // (see /feed below).
  if (body.visibility && typeof body.visibility === 'object') {
    const v = {};
    if (typeof body.visibility.workoutSessions === 'boolean') v.workoutSessions = body.visibility.workoutSessions;
    if (typeof body.visibility.comparison === 'boolean') v.comparison = body.visibility.comparison;
    if (typeof body.visibility.feed === 'boolean') v.feed = body.visibility.feed;
    body.visibility = { ...(db.profile?.visibility || {}), ...v };
  } else {
    delete body.visibility;
  }

  // FEATURES.md #21/#24: goals and activities, each entry independently
  // prioritised rather than a single primary + single secondary slot.
  if (body.goals) {
    const err = validateGoals(body.goals);
    if (err) return res.status(400).json({ error: err });
  }
  if (body.activities) {
    const err = validateActivities(body.activities);
    if (err) return res.status(400).json({ error: err });
    applyActivityDefaults(body);
  }
  // FEATURES.md #23: seed an initial atrophy estimate from the self-reported
  // break length; cleared if experienceLevel changes away from "returning".
  if (body.experienceLevel === 'Returning after a break' && body.returningBreakWeeks > 0) {
    body.estimatedAtrophyRate = seedReturningAthleteAtrophy(body.returningBreakWeeks);
  } else if (body.experienceLevel && body.experienceLevel !== 'Returning after a break') {
    body.estimatedAtrophyRate = null;
    body.returningBreakWeeks = null;
  }
  if (body.equipmentAvailable && Array.isArray(body.equipmentAvailable)) {
    const validEquipment = ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight'];
    const invalid = body.equipmentAvailable.filter(e => !validEquipment.includes(e));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid equipment: ${invalid.join(', ')}` });
    }
  }
  if (body.musclePriorities && typeof body.musclePriorities === 'object') {
    const validPriorities = ['focus', 'baseline', 'avoid'];
    for (const [muscle, priority] of Object.entries(body.musclePriorities)) {
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority for ${muscle}: ${priority}` });
      }
    }
  }
  // Recurring "no gym Tuesday/Thursday"-style blackout, indefinite — see
  // calendarSolver.js. Date#getDay convention: 0=Sunday..6=Saturday.
  if (body.unavailableDaysOfWeek) {
    if (!Array.isArray(body.unavailableDaysOfWeek) || body.unavailableDaysOfWeek.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: 'unavailableDaysOfWeek must be an array of integers 0-6' });
    }
  }
  // Allow-list, the inverse shape — "I only ever train Mon/Wed/Fri". Empty
  // means unset (no restriction); see calendarSolver.js's constraintForDate.
  if (body.availableDaysOfWeek) {
    if (!Array.isArray(body.availableDaysOfWeek) || body.availableDaysOfWeek.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: 'availableDaysOfWeek must be an array of integers 0-6' });
    }
  }
  // Soft "Legs on Friday"-style preference — { [splitBucketName]: dayOfWeek }.
  // Only meaningful against a named preferredSplit (Full Body has no fixed
  // buckets to anchor); calendarSolver.js falls back and reports a conflict
  // rather than forcing a fatigued muscle through when it can't be honored.
  if (body.splitDayAnchors) {
    if (typeof body.splitDayAnchors !== 'object' || Array.isArray(body.splitDayAnchors)
      || Object.values(body.splitDayAnchors).some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: 'splitDayAnchors must be an object of bucket name -> integer 0-6' });
    }
  }
  // Manual override of the calendar's auto-computed weekly session count —
  // null (default) lets calendarSolver.js derive it from real fatigue instead.
  if (body.weeklySessionTarget != null) {
    if (!Number.isInteger(body.weeklySessionTarget) || body.weeklySessionTarget < 0 || body.weeklySessionTarget > 14) {
      return res.status(400).json({ error: 'weeklySessionTarget must be an integer 0-14' });
    }
  }

  // Interactive section walkthrough seen-state (FEATURES.md #145) — merged
  // in one key at a time, same reasoning as `visibility` above: the client
  // only ever reports "this section's tour just auto-showed", never the
  // whole map, so a wholesale replace here would silently drop every
  // earlier section's seen flag. "Replay Walkthrough" in Settings sends
  // resetWalkthroughs instead, wiping the map so every section's tour is
  // eligible to auto-show again.
  if (body.walkthroughSeen) {
    body.walkthroughsSeen = { ...(db.profile?.walkthroughsSeen || {}), [body.walkthroughSeen]: true };
  }
  delete body.walkthroughSeen;
  if (body.resetWalkthroughs) body.walkthroughsSeen = {};
  delete body.resetWalkthroughs;

  db.profile = { ...db.profile, ...body };
  await save();
  res.json(db.profile);
});

// true (visible) unless explicitly toggled off — see /profile's visibility
// merge above for why the default lives here rather than in stored data.
const isWorkoutSessionsVisible = profile => profile?.visibility?.workoutSessions !== false;
const isComparisonVisible = profile => profile?.visibility?.comparison === true;
// Off by default even when workoutSessions is already on (FEATURES.md
// #144) — a single session someone has to visit a profile to see is a
// smaller disclosure than a persistent, always-current feed of everything
// they log, same reasoning USERNAME_AND_COMPARISON.md §6 already applied to
// the comparison toggle. /feed below requires both this AND
// isWorkoutSessionsVisible.
const isFeedVisible = profile => profile?.visibility?.feed === true;

// ---------- Username / display name ----------
// See .design/feature-brainstorm/USERNAME_AND_COMPARISON.md for the design.
// Uniqueness is enforced via a Firestore transaction against a dedicated
// usernames/{lowercasedUsername} collection (document ID as the uniqueness
// key), since the per-user wholesale-document pattern this app otherwise
// uses (see ARCHITECTURE.md) has no cross-user query/constraint mechanism.
app.get('/account/username-suggestion', (req, res) => {
  const name = (req.query.name || '').toString();
  res.json({ username: generateUsernameSuggestion(name) });
});

app.post('/account/username', async (req, res) => {
  const { username, displayName } = req.body || {};
  const displayNameErr = validateDisplayName(displayName);
  if (displayNameErr) return res.status(400).json({ error: displayNameErr });
  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });

  const newUsername = normalizeUsername(username);
  const currentUsername = db.profile?.username || null;
  const isChange = !!currentUsername && currentUsername !== newUsername;

  if (isChange && !canChangeUsername(db.profile?.lastUsernameChangeAt)) {
    return res.status(429).json({
      error: 'Username can only be changed once a month',
      availableAt: usernameChangeAvailableAt(db.profile.lastUsernameChangeAt),
    });
  }

  const trimmedDisplayName = displayName.trim();
  // displayNameFirst is denormalized onto the usernames doc itself (not
  // just db.profile) so prefix search (below) can read matches straight off
  // usernames/ without an N+1 cross-user read per result — kept in sync
  // here since /account/username is the only path that ever changes either
  // field.
  const displayNameFirstForIndex = deriveDisplayNameFirst(trimmedDisplayName);

  if (newUsername !== currentUsername) {
    try {
      await firestore.runTransaction(async (tx) => {
        const newRef = firestore.collection('usernames').doc(newUsername);
        const newSnap = await tx.get(newRef);
        if (newSnap.exists && newSnap.data().uid !== req.uid) throw new Error('USERNAME_TAKEN');
        tx.set(newRef, { uid: req.uid, displayNameFirst: displayNameFirstForIndex });
        if (currentUsername) tx.delete(firestore.collection('usernames').doc(currentUsername));
      });
    } catch (e) {
      if (e.message === 'USERNAME_TAKEN') return res.status(409).json({ error: 'That username is already taken' });
      throw e;
    }
  } else {
    await firestore.collection('usernames').doc(newUsername).set({ uid: req.uid, displayNameFirst: displayNameFirstForIndex }, { merge: true });
  }

  db.profile = {
    ...db.profile,
    username: newUsername,
    displayName: trimmedDisplayName,
    ...(isChange ? { lastUsernameChangeAt: new Date().toISOString() } : {}),
  };
  await save();
  res.json({
    username: db.profile.username,
    displayName: db.profile.displayName,
    displayNameFirst: deriveDisplayNameFirst(db.profile.displayName),
  });
});

// Open prefix search over the usernames collection — reads displayNameFirst
// straight off each match (denormalized at claim time above), so this never
// needs to cross-read another user's own document. Exact Firestore
// range-query idiom for "starts with prefix": [prefix, prefix+'').
app.get('/account/search', async (req, res) => {
  const prefix = normalizeUsername((req.query.prefix || '').toString());
  if (!prefix) return res.json({ results: [] });
  // '__name__' is Firestore's reserved field name for document ID —
  // querying it directly avoids depending on admin.firestore.FieldPath
  // (which threw `Cannot read properties of undefined (reading
  // 'documentId')` under the Functions emulator during testing, though not
  // in a bare Node repro — root cause not fully pinned down, but this form
  // sidesteps it entirely and is the more common idiom anyway).
  const snap = await firestore.collection('usernames')
    .where('__name__', '>=', prefix)
    .where('__name__', '<', prefix + '')
    .limit(20)
    .get();
  const results = snap.docs
    .filter(d => d.id !== db.profile?.username) // don't surface yourself in your own search
    .map(d => ({ username: d.id, uid: d.data().uid, displayNameFirst: d.data().displayNameFirst || '' }));
  res.json({ results });
});

// ---------- Follow requests ----------
// followRequests/{fromUid}_{toUid} — deliberately doubles as both the
// pending request AND, once accepted, the follow edge itself (status:
// 'accepted' == "fromUid follows toUid"), rather than a separate `follows`
// collection — one doc's lifecycle covers both, and "who do I follow" /
// "who follows me" are both simple queries against the same collection.
// Both sides' username/displayNameFirst are denormalized onto the request
// doc at creation time (read once, from the usernames collection, which is
// itself already denormalized — never a cross-read into the other
// person's own per-user document).
const followRequestId = (fromUid, toUid) => `${fromUid}_${toUid}`;

app.post('/follow-request', async (req, res) => {
  const toUsername = normalizeUsername((req.body?.toUsername || '').toString());
  if (!toUsername) return res.status(400).json({ error: 'toUsername required' });
  const targetSnap = await firestore.collection('usernames').doc(toUsername).get();
  if (!targetSnap.exists) return res.status(404).json({ error: 'No account with that username' });
  const toUid = targetSnap.data().uid;
  if (toUid === req.uid) return res.status(400).json({ error: "You can't follow yourself" });

  const id = followRequestId(req.uid, toUid);
  const ref = firestore.collection('followRequests').doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data().status === 'accepted') return res.json({ status: 'accepted' });

  await ref.set({
    fromUid: req.uid, toUid,
    fromUsername: db.profile?.username || null, fromDisplayNameFirst: deriveDisplayNameFirst(db.profile?.displayName),
    toUsername, toDisplayNameFirst: targetSnap.data().displayNameFirst || '',
    status: 'pending', createdAt: new Date().toISOString(), requesterSeenAcceptance: false,
  });
  res.json({ status: 'pending' });
});

app.post('/follow-requests/:fromUid/accept', async (req, res) => {
  const fromUid = req.params.fromUid;
  const ref = firestore.collection('followRequests').doc(followRequestId(fromUid, req.uid));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'pending' || snap.data().toUid !== req.uid) {
    return res.status(404).json({ error: 'No pending request from that account' });
  }
  await ref.update({ status: 'accepted', acceptedAt: new Date().toISOString() });
  res.json({ status: 'accepted' });
});

// Powers the Profile-area badge — incoming pending requests (need action)
// and requests of mine that were accepted since I last looked (the
// "requester also gets notified" behavior from the design doc).
app.get('/follow-requests', async (req, res) => {
  const [incomingSnap, acceptedSnap] = await Promise.all([
    firestore.collection('followRequests').where('toUid', '==', req.uid).where('status', '==', 'pending').get(),
    firestore.collection('followRequests').where('fromUid', '==', req.uid).where('status', '==', 'accepted').where('requesterSeenAcceptance', '==', false).get(),
  ]);
  res.json({
    incoming: incomingSnap.docs.map(d => ({ fromUid: d.data().fromUid, fromUsername: d.data().fromUsername, fromDisplayNameFirst: d.data().fromDisplayNameFirst, createdAt: d.data().createdAt })),
    recentlyAccepted: acceptedSnap.docs.map(d => ({ toUid: d.data().toUid, toUsername: d.data().toUsername, toDisplayNameFirst: d.data().toDisplayNameFirst })),
  });
});

app.post('/follow-requests/ack-accepted', async (req, res) => {
  const snap = await firestore.collection('followRequests').where('fromUid', '==', req.uid).where('status', '==', 'accepted').where('requesterSeenAcceptance', '==', false).get();
  await Promise.all(snap.docs.map(d => d.ref.update({ requesterSeenAcceptance: true })));
  res.json({ ok: true });
});

// ---------- Profile view ----------
// Minimal (first name + username + Follow button) for non-followers;
// workout-session data (subject to the target's own visibility toggle) once
// isFollowing is true. The cross-user read here is deliberately read-only
// and touches only the target's own `users/{uid}` document directly — never
// the request-scoped `db`/`save` globals — same pattern already accepted
// for the group-workout and comparison features in
// USERNAME_AND_COMPARISON.md / GROUP_WORKOUT.md.
app.get('/account/:username', async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const targetSnap = await firestore.collection('usernames').doc(username).get();
  if (!targetSnap.exists) return res.status(404).json({ error: 'No account with that username' });
  const targetUid = targetSnap.data().uid;
  const displayNameFirst = targetSnap.data().displayNameFirst || '';

  if (targetUid === req.uid) return res.json({ username, displayNameFirst, isSelf: true });

  const reqSnap = await firestore.collection('followRequests').doc(followRequestId(req.uid, targetUid)).get();
  const isFollowing = reqSnap.exists && reqSnap.data().status === 'accepted';

  const base = { username, displayNameFirst, isFollowing };
  if (!isFollowing) return res.json(base);

  const targetDoc = await userDocRef(targetUid).get();
  const targetData = targetDoc.data() || {};
  // canCompare surfaces a "Compare" affordance on the profile view only
  // when it would actually work — mutual follow both ways, both accounts'
  // comparison toggle on. Checked here (read-only) rather than making the
  // frontend guess and hit a 403 from /compare.
  const themToMe = await firestore.collection('followRequests').doc(followRequestId(targetUid, req.uid)).get();
  const mutualFollow = themToMe.exists && themToMe.data().status === 'accepted';
  const canCompare = mutualFollow && isComparisonVisible(db.profile) && isComparisonVisible(targetData.profile);

  const workoutsVisible = isWorkoutSessionsVisible(targetData.profile);
  // FEATURES.md #142: the ranked exercise-preference list, gated by the
  // same workoutSessions toggle as workout history — real per-muscle
  // training data at a similar sensitivity level, not the separate
  // (off-by-default, mutual) comparison toggle, and not shown to a
  // non-follower at all per USERNAME_AND_COMPARISON.md §4's minimal-view
  // rule (no extra data beyond name/username/Follow for someone who hasn't
  // been accepted).
  const rankedExercises = workoutsVisible ? rankExercises(targetData.profile?.exerciseRatings || {}) : undefined;
  res.json({ ...base, canCompare, ...(workoutsVisible ? { workouts: targetData.workouts || [], rankedExercises } : {}) });
});

// ---------- Muscle comparison ----------
// Mutual-follow + mutual-comparison-toggle gated (see
// USERNAME_AND_COMPARISON.md §6). Both metrics are computed fresh on every
// call, read-only, off both accounts' own data — no caching, matches the
// "read-only, no save() involved" reasoning already used for the profile
// view and group-workout features. Cross-user reads here (the target's
// lift history, weight history, sex) never touch the request-scoped
// `db`/`save` globals.
function stimulusInWindow(lifts, windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const windowedLifts = (lifts || []).filter(l => l.date && new Date(l.date).getTime() >= cutoff);
  const contributions = computeStimulusContributions(windowedLifts);
  const result = {};
  for (const [muscle, entries] of Object.entries(contributions)) {
    result[muscle] = Math.round(entries.reduce((sum, e) => sum + e.contrib, 0) * 100) / 100;
  }
  return result;
}

function strengthLevelsFor(lifts, weightHistory, sex) {
  const peaks = musclePeaksFromLifts(lifts);
  const currentBodyweight = Object.values(weightHistory || {}).at(-1);
  return computeMuscleLevels(lifts, weightHistory || {}, currentBodyweight, sex, fatigueTimeline(lifts, peaks));
}

app.get('/compare/:username', async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const metric = req.query.metric === 'stimulus' ? 'stimulus' : 'strength';
  const windowDays = [7, 14, 30].includes(+req.query.window) ? +req.query.window : 14;

  const targetSnap = await firestore.collection('usernames').doc(username).get();
  if (!targetSnap.exists) return res.status(404).json({ error: 'No account with that username' });
  const targetUid = targetSnap.data().uid;
  if (targetUid === req.uid) return res.status(400).json({ error: "Can't compare with yourself" });

  const [meToThem, themToMe] = await Promise.all([
    firestore.collection('followRequests').doc(followRequestId(req.uid, targetUid)).get(),
    firestore.collection('followRequests').doc(followRequestId(targetUid, req.uid)).get(),
  ]);
  const mutualFollow = meToThem.exists && meToThem.data().status === 'accepted'
    && themToMe.exists && themToMe.data().status === 'accepted';
  if (!mutualFollow) return res.status(403).json({ error: 'Comparison requires you to follow each other' });

  const targetDocSnap = await userDocRef(targetUid).get();
  const targetData = targetDocSnap.data() || {};
  if (!isComparisonVisible(db.profile) || !isComparisonVisible(targetData.profile)) {
    return res.status(403).json({ error: 'Comparison requires both accounts to opt in, in Settings → Visibility' });
  }

  const targetLifts = await loadAllLifts(userDocRef(targetUid));
  const otherDisplayNameFirst = deriveDisplayNameFirst(targetData.profile?.displayName);

  if (metric === 'stimulus') {
    return res.json({
      metric, window: windowDays, otherDisplayNameFirst,
      self: stimulusInWindow(db.lifts, windowDays),
      other: stimulusInWindow(targetLifts, windowDays),
    });
  }

  res.json({
    metric, otherDisplayNameFirst,
    self: strengthLevelsFor(db.lifts, db.weight, db.profile?.sex),
    other: strengthLevelsFor(targetLifts, targetData.weight, targetData.profile?.sex),
  });
});

// ---------- Activity feed ----------
// FEATURES.md #144. An aggregated feed of recent workout sessions from
// people the requester follows — one-directional (following, not mutual,
// same as the profile view's isFollowing check), but only ever includes a
// followed account's sessions when THAT account has both
// isWorkoutSessionsVisible AND the separate isFeedVisible opt-in on. Both
// gates are re-checked here per account, server-side, from each account's
// own freshly-read doc — never trusting a client-supplied list or a stale
// cached flag. The cross-account reads are read-only and go straight at
// userDocRef(uid), same as /account/:username and /compare — never through
// the request-scoped db/save globals for anyone but the requester
// themselves (ARCHITECTURE.md's "Request-scoped state").
app.get('/feed', async (req, res) => {
  const followingSnap = await firestore.collection('followRequests')
    .where('fromUid', '==', req.uid).where('status', '==', 'accepted').get();
  const followedUids = followingSnap.docs.map(d => d.data().toUid);
  if (!followedUids.length) return res.json({ entries: [] });

  const followedSnaps = await Promise.all(followedUids.map(uid => userDocRef(uid).get()));
  const sources = followedSnaps
    .map((snap, i) => ({ uid: followedUids[i], data: snap.exists ? snap.data() : {} }))
    .filter(({ data }) => isWorkoutSessionsVisible(data.profile) && isFeedVisible(data.profile))
    .map(({ uid, data }) => ({
      uid,
      username: data.profile?.username || null,
      displayNameFirst: deriveDisplayNameFirst(data.profile?.displayName),
      workouts: data.workouts || [],
    }));

  res.json({ entries: buildFeedEntries(sources) });
});

// Per-user token for open webhook routes (/shortcut, /health) — lets each
// account get its own personal sync URL instead of everyone sharing the
// single owner account's, which was silently misrouting other people's
// health data into the owner's own account. Idempotent: returns the
// existing token if one's already been issued, rather than rotating it on
// every call (that would invalidate any Shortcut already built against it).
app.post("/sync-token", async (req, res) => {
  if (db.profile?.syncToken) return res.json({ token: db.profile.syncToken });
  const token = crypto.randomBytes(16).toString('hex');
  await firestore.collection('syncTokens').doc(token).set({ uid: req.uid });
  db.profile = { ...db.profile, syncToken: token };
  await save();
  res.json({ token });
});

// ---------- Personal Journalist ----------
const TRAINING_ETHOS = "Training philosophy — this is the standing stance, not a menu of options to present neutrally: Effort is non-negotiable. Push hard for training close to true failure, always expressed in concrete RIR (reps in reserve) terms — 'take that set to RIR 0-1', 'RIR 3-4 is too far out, add weight or a rep next time' — never vague language like 'push yourself' or 'go hard'. On any exercise with more than one working set, RIR always decreases set to set — the first working set leaves more in reserve, each subsequent set gets closer to true failure, with the last set at RIR 0-1; never repeat the same RIR across sets of the same exercise. Full-body sessions, 2-4x/week: frequency over volume — fewer working sets per session, volume spread across the week rather than stacked into one session. Fully autoregulated: no rigid periodized templates — adjust load, sets, and exercise choice session to session based on real fatigue and performance, and trigger deloads purely from fatigue/performance data, never a fixed schedule. Progress via double progression — climb reps to the top of the rep range at target RIR, then add weight and drop back down in reps. Reps run 1-9, biased toward the higher end (up to 8-9), since 1-2 reps rarely deliver enough stimulus per set to be worth defaulting to. Favor stable, structured movements (machines, fixed-path, cables) over free-weight variations specifically because they let effort be pushed to true failure without technical form breakdown becoming the limiter — not dogma against barbells, just a preference for whatever lets intensity go higher safely; stick with an exercise as long as double progression keeps working, only rotate it out once progress stalls. Prioritize lagging muscle groups with extra frequency or volume over strong points. Warm up with a couple of ramping sets (roughly 60% then 85% of the working weight) before working sets, adjusted by how the day feels, and rest fully between working sets (about 3-4 minutes) to protect effort quality over session speed. When something hurts or flares up, work around it — swap the offending movement or angle and keep training everything else hard, rather than broadly backing off. Keep cardio/conditioning sessions separate from strength sessions so lifting stimulus never gets diluted by concurrent-training interference. No program should be copied wholesale — build around the individual's recovery, goals, and response. A caloric surplus without real training stimulus adds fat, not muscle.";

// Long-term memory: a small, bounded set of durable facts (training
// preferences, injuries, equipment, goals) the model itself maintains
// across conversations, stored in db.profile.mentorMemory and editable in
// Settings. Bounded so the cost of including it is flat regardless of
// account age — the opposite of Live data below, which grows with history
// and is deliberately kept short-window instead. Capped here server-side
// too, never trusting the model to have honored the limit stated in-prompt.
const MENTOR_MEMORY_CAP = 20;
const MENTOR_MEMORY_ENTRY_MAX_LEN = 140;

app.post("/mentor", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.json({ reply: "Add GEMINI_API_KEY to functions/.env to enable the Personal Journalist." });
  const s = db;
  const recentWeights = Object.fromEntries(Object.entries(s.weight || {}).slice(-14));
  // 14-day window, not the full history: metrics grows one entry per day
  // forever, and unlike weights/lifts/workouts/thoughts below it had no cap
  // at all — on a long-running account that's a large, ever-growing prompt
  // on every single chat message. Two weeks is enough for the model to read
  // a real trend (sleep debt, recovery dipping) without the unbounded cost.
  const recentMetrics = Object.fromEntries(Object.entries(s.metrics || {}).slice(-14));
  const memory = db.profile?.mentorMemory || [];
  const memoryBlock = memory.length
    ? "Known long-term facts about this athlete, from past conversations: " + memory.map(m => "- " + m).join(" ")
    : "No long-term facts saved about this athlete yet.";
  const system = "You are Personal Journalist, " + (s.profile?.name || "the user") + "'s personal peak-performance coach. Be direct, concise (2-4 short sentences). No greeting, no self-introduction, no restating who you are — answer the question directly, every time, including the first message of a conversation. "
    + TRAINING_ETHOS + " " + memoryBlock
    + " Respond with ONLY a JSON object of the exact shape {\"reply\": string, \"memory\": string[]}. \"reply\" is the visible answer to the athlete — never mention this JSON structure or the memory list inside it. \"memory\" is the FULL current set of durable, worth-remembering facts about this athlete (training preferences, injuries/limitations, equipment access, goals) that should carry into every future conversation: start from the known facts above, add anything new this message reveals, drop anything superseded or no longer true, keep each entry under "
    + MENTOR_MEMORY_ENTRY_MAX_LEN + " characters and the list under " + MENTOR_MEMORY_CAP + " items. If nothing durable came up this message, return the known facts unchanged. This field is saved silently and never shown to the athlete directly."
    + " Live data: " + JSON.stringify({ recovery: recentMetrics, weights: recentWeights, lifts: s.lifts?.slice(-10), water: s.water, workouts: s.workouts?.slice(-5), thoughts: s.thoughts?.slice(-5) });
  const recentMessages = req.body.messages.slice(-10);

  const mentorMessages = [{ role: "system", content: system }, ...recentMessages];
  // 1500, not the old 700: the memory list alone can now run up to ~700
  // tokens at its cap (20 items x 140 chars), on top of the reply text and
  // JSON structure overhead — 700 total left near-zero room for the actual
  // reply and would trigger a truncation-retry (callGeminiResilient) on
  // nearly every turn once memory filled up.
  const result = await callGeminiResilient({ messages: mentorMessages, maxTokens: 1500, jsonMode: true });
  if (!result.ok) {
    console.error("Gemini mentor error:", result.status, JSON.stringify(result.error));
    return res.json({ reply: "Personal Journalist error: " + (result.error?.message || `Gemini returned ${result.status}`) });
  }
  let reply = result.content, newMemory = null;
  try {
    const parsed = parseGeminiJSON(result.content);
    if (parsed?.reply) {
      reply = parsed.reply;
      if (Array.isArray(parsed.memory)) {
        newMemory = parsed.memory.filter(Boolean).map(m => String(m).trim().slice(0, MENTOR_MEMORY_ENTRY_MAX_LEN)).slice(0, MENTOR_MEMORY_CAP);
      }
    }
  } catch (e) {
    // Structured output occasionally comes back malformed — fall back to
    // showing the raw text rather than losing the reply entirely; memory
    // simply doesn't update this turn.
    console.error("[mentor] failed to parse structured reply:", e.message);
  }
  if (newMemory) { db.profile = { ...db.profile, mentorMemory: newMemory }; await save(); }
  res.json({ reply });
});

// Everything /plan/session-exercises derives about the athlete before it picks
// a single exercise. Extracted so /plan/session-variants can generate its
// alternatives from an identical view of the athlete — a variant assembled
// from even slightly different fatigue or preferences would be compared
// against the recommended session on unequal terms, and the trade-offs
// sessionVariants.js reports would be measuring the wrong difference.
function sessionPlanContext() {
  const lifts = db.lifts || [];
  const peaks = musclePeaksFromLifts(lifts);
  const structuralFatigue = computeStructuralFatigue(lifts, peaks, db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile, activeCycleFactor(db)));
  const activeInjuries = (db.injuries || []).filter(i => !i.resolved);
  const currentFatigue = applyInjuryTaper(structuralFatigue, activeInjuries);
  const metabolicFatigue = computeMetabolicFatigue(lifts, (db.nutrition || {})[day()]?.carbs || 0);
  const cnsFatigue = computeCNSFatigue(lifts, db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const avoidMuscles = Object.entries(currentFatigue).filter(([,v])=>v>FATIGUE_CEILING).map(([m])=>m);
  const avoidMusclesSecondary = Object.entries(currentFatigue).filter(([,v])=>v>SECONDARY_FATIGUE_CEILING).map(([m])=>m);
  // Self-declared at Onboarding step 5 (editable later) — 'ignore' folds
  // into offlineMuscles unconditionally (not just when fatigued), the exact
  // same hard-exclusion mechanism an injury already gets: never a priority
  // target, and never a primary muscle in any picked exercise, regardless
  // of current fatigue level.
  const muscleFocus = db.profile?.muscleFocus || {};
  const ignoredMuscles = Object.entries(muscleFocus).filter(([,v]) => v === 'ignore').map(([m]) => m);
  const offlineMuscles = [...new Set([...avoidMuscles.filter(m => activeInjuries.some(i => (i.muscles || []).includes(m))), ...ignoredMuscles])];
  // Same explicit-setting-else-auto-detect pattern as
  // compoundIsolationPreference, for equipment stability (machine/cable/smith
  // vs. free-standing barbell/dumbbell) — an account that mostly logs
  // machine/cable work gets that reflected as the default going forward. A
  // soft scoring bias (sessionPlanner.js's stabilityScore), not a filter —
  // free-weight can still win when it's clearly the better option.
  const stabilitySplit = computeStabilitySplit(lifts);
  const stableLeaning = db.profile?.stabilityPreference
    ? db.profile.stabilityPreference === 'stable'
    : stabilitySplit.stable > stabilitySplit.unstable;
  return {
    lifts, currentFatigue, metabolicFatigue, cnsFatigue, avoidMuscles, avoidMusclesSecondary,
    offlineMuscles, muscleFocus,
    travelMode: db.profile?.travelMode || false,
    trainingMonths: trainingMonthsIfKnown(db.profile),
    // Self-reported at onboarding — a real anchor for a brand-new account with
    // no lift history yet; see weeklyPlanner.js's FAVORITE_EXERCISE_BONUS for
    // why it's weighted lower than genuinely logged history.
    favoriteExercises: db.profile?.trainingBackground?.favoriteExercises || [],
    warmupScheme: db.profile?.warmupScheme,
    preferStable: stableLeaning,
  };
}

// Alternative versions of the session the client is already showing, each
// under one changed constraint. Separate from /plan/session-exercises rather
// than folded into its response: it generates the whole session three more
// times, and that cost shouldn't land on the request that produces the
// recommendation the athlete is waiting on.
app.post('/plan/session-variants', async (req, res) => {
  const { targetMuscles, backboneExercises, exercises: baseExercises, maxDurationMin } = req.body || {};
  if (!targetMuscles?.length) return res.json({ variants: [] });

  const ctx = sessionPlanContext();
  const variants = buildSessionVariants({
    inputs: {
      type: 'lift', targetMuscles, backboneExerciseNames: backboneExercises || [],
      lifts: ctx.lifts, travelMode: ctx.travelMode,
      avoidMuscles: ctx.avoidMuscles, avoidMusclesSecondary: ctx.avoidMusclesSecondary,
      offlineMuscles: ctx.offlineMuscles, cnsFatigue: ctx.cnsFatigue,
      metabolicFatigue: ctx.metabolicFatigue, trainingMonths: ctx.trainingMonths,
      favoriteExercises: ctx.favoriteExercises, warmupScheme: ctx.warmupScheme,
      preferStable: ctx.preferStable, maxDurationMin: maxDurationMin ?? null,
    },
    baseExercises,
    currentFatigue: ctx.currentFatigue,
    metabolicFatigue: ctx.metabolicFatigue,
  });
  res.json({ variants });
});

// Deterministic — exercise selection is muscle-coverage scoring over
// EXERCISE_DB, every weight/rep number comes from computeProgression's
// double-progression math. See functions/sessionPlanner.js.
//
// No locked schedule to read back: if the caller doesn't specify which
// muscles to train, this builds a full-body session by default (see
// TRAINING_ETHOS: "Full-body sessions, 2-4x/week: frequency over volume") —
// one exercise per available muscle bucket (push/pull/legs/core), each
// targeting whichever specific muscle in that bucket most deserves it right
// now. "Deserves it" blends two things: fatigue-freshness (existing) and
// how overdue the muscle is for a genuine training focus at all
// (computeMuscleLastTrainedDays + weeklyPlanner's stalenessBoost) — a
// muscle neglected for three weeks outranks one that's merely fresh from
// being trained lightly yesterday. A bucket with nothing available (every
// muscle in it fatigued or injured) is simply skipped for this session
// rather than forced. The caller (frontend) can still request a specific
// muscle-focus bucket instead — "changeable, never pushed" means the
// algorithm's full-body default is a default, not a requirement; requesting
// one bucket explicitly still returns the previous richer single-bucket
// session (multiple exercises, accessories included).
// Today's limiting factor, weighted by the session that was just generated.
//
// The copy on Dispatch (from /plan/recommendation) is deliberately NOT
// session-weighted: nothing there knows what today's session is, and guessing
// would be worse than ranking on severity alone. Here the exercise list exists,
// so relevance is a fact rather than an assumption — spent lats rank above
// spent quads before a pull session and below them before a leg session.
// Same factors, same thresholds, same severities; only the order can differ.
function sessionLimitingFactor(exercises, { currentFatigue, cnsFatigue, metabolicFatigue, offlineMuscles }) {
  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  return todaysLimitingFactor({
    cnsFatigue,
    metabolicFatigue,
    currentFatigue,
    offlineMuscles,
    injuries: (db.injuries || []).filter(i => !i.resolved).map(i => ({
      area: i.area, muscles: i.muscles || [], penalty: injuryFatiguePenalty(i),
    })),
    recoveryScore: getRecoveryScore(db),
    sleepHours: todayMetrics.sleep_hours ?? null,
    sleepTarget: personalSleepTarget(recentDays).target,
    session: exercises,
  });
}

app.post("/plan/session-exercises", async (req, res) => {
  const { type = 'lift', bucket: reqBucket, maxDurationMin } = req.body;
  let { targetMuscles, backboneExercises } = req.body;
  const lifts = db.lifts || [];

  const {
    currentFatigue, metabolicFatigue, cnsFatigue, avoidMuscles, avoidMusclesSecondary,
    offlineMuscles, muscleFocus, travelMode, trainingMonths, favoriteExercises,
    preferStable: stableLeaning,
  } = sessionPlanContext();

  if (type === 'lift' && !targetMuscles?.length && !reqBucket) {
    const muscleLastTrainedDays = computeMuscleLastTrainedDays(lifts);
    // Explicit choice always wins; auto-detect only fills in a default for
    // an account that's never set one — never silently overrides a real
    // choice, even if later history stops matching what detectPreferredSplit
    // would currently guess.
    const preferredSplit = db.profile?.preferredSplit || detectPreferredSplit(lifts) || 'Full Body';
    // Picking logic itself lives in autoPick.js, parameterized rather than
    // reading `db`/Date.now() directly, so calendarSolver.js's day-by-day
    // loop can run the identical "what's the next session" logic against a
    // simulated future day — see MASTER_IMPLEMENTATION_PLAN.md Phase 5's
    // "no parallel implementations" rule.
    const picked = autoPickFullBodySession({
      lifts, currentFatigue, offlineMuscles, muscleFocus, muscleLastTrainedDays,
      preferredSplit, travelMode, favoriteExercises, avoidMuscles, avoidMusclesSecondary,
      cnsFatigue, metabolicFatigue, trainingMonths, preferStable: stableLeaning, maxDurationMin,
      warmupScheme: db.profile?.warmupScheme,
      compoundIsolationSplit: computeCompoundIsolationSplit(lifts),
      compoundIsolationPreference: db.profile?.compoundIsolationPreference || null,
    });
    return res.json({
      ...picked,
      backboneExercises: picked.exercises.map(e => e.name),
      limitingFactor: sessionLimitingFactor(picked.exercises, { currentFatigue, cnsFatigue, metabolicFatigue, offlineMuscles }),
      // currentFatigue: lets the frontend re-run capSessionDuration itself
      // as the Max Length slider moves, instantly, instead of a network
      // round-trip per drag tick — see S3's displayedExercises in
      // src/app.jsx. Harmless to expose: it's this athlete's own data,
      // already implicitly visible via the freshness percentages shown
      // elsewhere on the same screen.
      currentFatigue,
    });
  }

  let bucket = reqBucket || null;

  if (type === 'lift' && !targetMuscles?.length) {
    const priority = computeMusclePriority(currentFatigue, offlineMuscles, null, muscleFocus);
    const buckets = Object.entries(MUSCLE_GROUPS)
      .map(([name, muscles]) => { const scored = scoreBucket(muscles, priority); return scored ? { name, ...scored } : null; })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (buckets.length) { targetMuscles = buckets[0].muscles; bucket = buckets[0].name; }
  }

  if (type === 'lift' && targetMuscles?.length && !backboneExercises?.length) {
    // {name, angle?}, not a bare name string -- preserves any recommended
    // angle pickBackboneExercises attached to an isAngleFamily pick through
    // to generateSessionExercises below (which accepts both shapes) instead
    // of silently dropping it back to a bare name. Safe to round-trip as
    // JSON if the client later re-sends this same array verbatim (e.g.
    // starting the workout) — generateSessionExercises's normalization
    // handles either shape either way.
    backboneExercises = pickBackboneExercises(targetMuscles, { travelMode, lifts, favoriteExercises, preferStable: stableLeaning })
      .map(e => e.isAngleFamily ? { name: e.name, angle: e.angle } : { name: e.name });
  }

  const exercises = fillSessionToDuration(capSessionDuration(generateSessionExercises({
    type, targetMuscles, backboneExerciseNames: backboneExercises, lifts, travelMode,
    avoidMuscles, avoidMusclesSecondary, offlineMuscles, cnsFatigue, metabolicFatigue, trainingMonths, favoriteExercises,
    warmupScheme: db.profile?.warmupScheme, maxDurationMin, preferStable: stableLeaning,
  }), currentFatigue, maxDurationMin), maxDurationMin, fatigueCeilingFor(metabolicFatigue));
  res.json({ exercises, targetMuscles: targetMuscles || [], backboneExercises: backboneExercises || [], bucket, estimatedDurationMin: estimateSessionDurationMin(exercises), currentFatigue, fatigueCeiling: fatigueCeilingFor(metabolicFatigue), limitingFactor: sessionLimitingFactor(exercises, { currentFatigue, cnsFatigue, metabolicFatigue, offlineMuscles }) });
});

app.get('/progression/:exercise', async (req, res) => {
  // Case-insensitive: lift history is inconsistently cased across ingestion
  // paths (Hevy/session-logging lowercase on write, CSV/bulk-import store
  // whatever casing the source data had), so a raw lowercase-vs-exact-match
  // here silently returned "no history" for anything imported with
  // Title-Case names. progressionFor normalizes both sides before matching.
  const name = decodeURIComponent(req.params.exercise);
  const prog = progressionFor(db.lifts || [], name, db.profile?.warmupScheme);
  res.json({ progression: prog });
});

app.get("/coach/:exercise", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.json({ note: null });
  const ex = decodeURIComponent(req.params.exercise);
  const sets = (db.lifts || []).filter(l => l.exercise === ex).slice(-30);
  const byDate = {};
  for (const l of sets) { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); }
  const ctx = Object.keys(byDate).sort().slice(-5).map(d => `${d}: ${byDate[d].map(s => `${s.kg}kg×${s.reps}`).join(', ')}`).join('; ');
  const prompt = `One specific coaching cue for ${ex}. History: ${ctx || 'no data'}. Max 14 words. Evidence-based, specific to their numbers. No intro words.`;
  // gemini.js's thinkingLevel: "LOW" still spends real output-token budget on
  // its thinking pass for gemini-3.x models (the same issue /mentor hit and
  // fixed by raising 400->700 — see that commit) — 60 tokens left almost
  // nothing for the actual ~14-word answer once thinking ate its share,
  // producing cues visibly cut off mid-sentence ("Drive your").
  const result = await callGeminiResilient({ messages: [{ role: "user", content: prompt }], maxTokens: 200 });
  res.json({ note: result.ok ? result.content.trim() : null });
});

app.post("/import/hevy", async (req, res) => {
  const { sessions } = req.body;
  if (!Array.isArray(sessions)) return res.status(400).json({ error: 'sessions must be array' });
  db.workouts = db.workouts || [];
  db.lifts = db.lifts || [];
  let imported = 0, merged = 0, skipped = 0;
  const newLiftEntries = [];
  // Per-set dedup, not whole-session skip: an already-imported session can
  // still be missing sets a later re-import has (e.g. a CSV re-export after
  // the warmup-set-drop bug was fixed) — matching the same per-set dedup
  // ingestWorkout already does for the API path, rather than discarding the
  // whole session because *a* workout record for that date/name exists.
  // Checks newLiftEntries too so two sessions in the same batch can't both
  // add the same "missing" set.
  const isDupeLift = (date, exercise, kg, reps) =>
    db.lifts.some(l => l.date === date && l.exercise === exercise && Math.abs((l.kg || 0) - kg) < 0.1 && l.reps === reps) ||
    newLiftEntries.some(l => l.date === date && l.exercise === exercise && Math.abs((l.kg || 0) - kg) < 0.1 && l.reps === reps);
  for (const session of sessions) {
    const exists = db.workouts.some(w => w.date === session.date && w.name === session.name);
    if (!exists) db.workouts.unshift({ date: session.date, name: session.name, duration: session.duration || null, source: 'hevy' });
    let addedForSession = 0;
    for (const ex of (session.exercises || [])) {
      for (const set of (ex.sets || [])) {
        const kg = set.kg || 0, reps = set.reps || 0;
        if (kg <= 0 && reps <= 0) continue;
        if (isDupeLift(session.date, ex.name, kg, reps)) continue;
        const entry = { date: session.date, exercise: ex.name, kg, reps, source: 'hevy' };
        // parseHevyCSV already reads start_time to derive the date; it now
        // forwards the raw value so the clock survives the import too.
        const csvStart = importedStartStamp(session.start);
        if (csvStart) entry.start = csvStart;
        if (set.type && set.type !== 'N') entry.type = set.type;
        newLiftEntries.push(entry);
        addedForSession++;
      }
    }
    if (!exists) imported++;
    else if (addedForSession) merged++;
    else skipped++;
  }
  // Errors here used to be silently swallowed (server-side console.error
  // only), which is exactly how this bug went unnoticed: the write failed
  // every time (embedded-lifts document over Firestore's 1MB limit) but the
  // client still got back { ok: true, imported: N } and looked successful.
  // Lifts now live in liftChunks (see functions/liftChunks.js) specifically
  // so this class of failure shouldn't recur, but a real failure should
  // still be visible to the client, not just logged.
  try {
    if (newLiftEntries.length) {
      registerUnknownExercisesAsCustom(newLiftEntries.map(e => e.exercise));
      await appendLifts(liftsDocRef, newLiftEntries);
    }
    db.lifts.push(...newLiftEntries);
    // FEATURES.md #142: pre-seed exercise preference ratings from this
    // import's frequency, before any real comparison prompts occur. A no-op
    // if ratings already exist (see seedRatingsFromImport's own comment).
    if (newLiftEntries.length) {
      db.profile.exerciseRatings = seedRatingsFromImport(db.profile.exerciseRatings || {}, db.lifts, Date.now());
    }
    await save();
  } catch (e) {
    console.error('[import/hevy] save failed:', e.message);
    return res.status(500).json({ ok: false, error: 'Save failed: ' + e.message });
  }
  res.json({ ok: true, imported, merged, skipped });
});

// ---------- Weekly guidance (advisory — never a locked day-by-day schedule) ----------
// How many strength sessions this week's fatigue can absorb, and which muscle
// groups are freshest right now. No days, no locked exercises, nothing that
// tells the athlete "today is leg day" — see weeklyPlanner.js's header for why.
// Split out from computeWeeklyGuidance so the explanation layer can be handed
// the identical inputs the guidance was produced from. recommendation.js
// re-derives the planner's own terms rather than recomputing them, and that
// only holds if it sees exactly the same fatigue map, exclusions and split.
function weeklyGuidanceInputs() {
  const peaks = musclePeaksFromLifts(db.lifts);
  const structuralFatigue = computeStructuralFatigue(db.lifts, peaks, db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile, activeCycleFactor(db)));
  const currentFatigue = applyInjuryTaper(structuralFatigue, db.injuries || []);
  const weekMetabolic = computeMetabolicFatigue(db.lifts, (db.nutrition || {})[day()]?.carbs || 0);
  const weekCNS = computeCNSFatigue(db.lifts, db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const maturityWeek = computeDataMaturity(db.lifts);
  const muscleFocus = db.profile?.muscleFocus || {};
  const ignoredMuscles = Object.entries(muscleFocus).filter(([,v]) => v === 'ignore').map(([m]) => m);
  return {
    currentFatigue, weekMetabolic, weekCNS, offlineMuscles: ignoredMuscles,
    dataMature: maturityWeek.hasEnoughData,
    trainingPriority: db.profile?.trainingPriority || 'strength',
    muscleLastTrainedDays: computeMuscleLastTrainedDays(db.lifts),
    // Same "explicit choice always wins, auto-detect only fills in a
    // default" rule as /plan/session-exercises' own preferredSplit
    // resolution — the guidance display and the session it's previewing
    // must agree on which split is actually in effect.
    preferredSplit: db.profile?.preferredSplit || detectPreferredSplit(db.lifts) || 'Full Body',
    muscleFocus,
  };
}

function computeWeeklyGuidance() {
  return generateWeeklyGuidance(weeklyGuidanceInputs());
}

// Why the guidance says what it says: reasoning, the alternatives that lost,
// what changes if one is picked instead, and how much to trust any of it.
// Explanation only — it never alters the guidance it describes.
//
// Explains a freshly computed guidance rather than the stored db.weeklyPlan,
// because the stored plan was ranked against whatever fatigue existed when it
// was saved. Narrating those rankings with today's fatigue terms would produce
// an explanation that contradicts itself. Instead the live ranking is always
// self-consistent, and `supersedes` names the stored plan's pick when fatigue
// has since moved on — which is a fact worth surfacing rather than hiding.
function computeRecommendation(storedPlan) {
  const inputs = weeklyGuidanceInputs();
  const live = generateWeeklyGuidance(inputs);
  const rec = buildRecommendation({
    guidance: live,
    loggedSessionCount: new Set((db.lifts || []).map(l => l.date)).size,
    ...inputs,
  });
  const storedTop = storedPlan?.muscleFocus?.[0]?.name || null;

  // Enrich chosen bucket with actual exercises and sets/reps
  if (rec.chosen) {
    const groups = focusGroups(inputs.preferredSplit || 'Full Body');
    const targetMuscles = groups[rec.chosen.name] || [];

    if (targetMuscles.length > 0) {
      const backboneNames = pickBackboneExercises(targetMuscles, {
        travelMode: db.profile?.travelMode || false,
        lifts: db.lifts || [],
        favoriteExercises: db.profile?.favoriteExercises || [],
        preferStable: db.profile?.stableLeaning,
      });

      const exercises = generateSessionExercises({
        type: 'lift',
        targetMuscles,
        backboneExerciseNames: backboneNames,
        lifts: db.lifts || [],
        travelMode: db.profile?.travelMode || false,
        avoidMuscles: inputs.avoidMuscles || [],
        avoidMusclesSecondary: inputs.avoidMusclesSecondary || [],
        offlineMuscles: inputs.offlineMuscles || [],
        cnsFatigue: inputs.weekCNS || 0,
        metabolicFatigue: inputs.weekMetabolic || 0,
        trainingMonths: db.profile?.trainingMonths,
        favoriteExercises: db.profile?.favoriteExercises || [],
        preferStable: db.profile?.stableLeaning,
      });

      rec.chosen.exercises = exercises;
    }
  }

  // Rides along on this endpoint rather than getting its own: it needs exactly
  // the fatigue pass already done above, and asking for it separately would
  // repeat the most expensive part of the request for no benefit.
  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  const limitingFactor = todaysLimitingFactor({
    cnsFatigue: inputs.weekCNS,
    metabolicFatigue: inputs.weekMetabolic,
    currentFatigue: inputs.currentFatigue,
    // Only the avoid list — that's what actually reaches computeMusclePriority
    // as a hard exclusion. Injuries go in separately because applyInjuryTaper
    // floors their fatigue rather than excluding them, which is a different
    // thing to tell the athlete.
    offlineMuscles: inputs.offlineMuscles,
    injuries: (db.injuries || []).filter(i => !i.resolved).map(i => ({
      area: i.area, muscles: i.muscles || [], penalty: injuryFatiguePenalty(i),
    })),
    recoveryScore: getRecoveryScore(db),
    sleepHours: todayMetrics.sleep_hours ?? null,
    sleepTarget: personalSleepTarget(recentDays).target,
  });

  // Rides along for the same reason as limitingFactor: it needs the fatigue
  // map already computed above, and asking for it separately would repeat the
  // expensive part of the request.
  const recoveryForecast = buildRecoveryForecast({
    currentFatigue: inputs.currentFatigue,
    cnsFatigue: inputs.weekCNS,
    recoveryHours: personalizedRecoveryHours(db.profile, activeCycleFactor(db)),
  });

  return {
    ...rec,
    supersedes: storedTop && rec.chosen && storedTop !== rec.chosen.name ? storedTop : null,
    limitingFactor,
    recoveryForecast,
  };
}

// Deliberately its own endpoint rather than a field on /summary. Building it
// needs a full structural/metabolic/CNS fatigue pass over the lift history,
// and /summary is the app's cold-start request — already the slowest thing
// here. The dashboard fetches this after it has painted, so the reasoning
// arrives a moment late instead of delaying everything else.
app.get("/plan/recommendation", async (req, res) => {
  if (!db.weeklyPlan) return res.json(null);
  res.json(computeRecommendation(db.weeklyPlan));
});

// #95: Running Recommendation Engine
// Returns daily run prescription: session type, duration, intensity, reasoning
app.get("/run/recommendation", async (req, res) => {
  if (!db.runs || !db.runs.length) return res.json(null);

  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  const baseRecoveryScore = computeDay(todayMetrics,
    avg(recentDays.map(d => d.heart_rate_variability).filter(Boolean)),
    avg(recentDays.map(d => d.resting_heart_rate).filter(Boolean)),
    personalSleepTarget(recentDays).target,
    avg(recentDays.map(d => d.wrist_temperature).filter(Boolean)),
    avg(recentDays.map(d => d.heart_rate).filter(Boolean))
  );

  if (baseRecoveryScore === null || baseRecoveryScore === undefined) {
    return res.json(null);
  }

  const runningACWR = computeRunningACWR(db.runs, new Date().toISOString().split('T')[0], db.profile);
  const lastEfficiency = weeklyEfficiencyTrend(db.runs, new Date());
  const lastRun = db.runs[db.runs.length - 1];
  const lastSpikeDetection = lastRun ? detectSessionDistanceSpike(lastRun, db.runs, 1.10) : null;

  const vdot = vdotTrend(db.runs, 30);
  const appleWatchVO2max = db.metrics[new Date().toISOString().split('T')[0]]?.vo2max ? {
    value: db.metrics[new Date().toISOString().split('T')[0]].vo2max,
    dateMs: Date.now(),
  } : null;
  const vo2maxResolution = resolveVO2max(appleWatchVO2max, vdot);

  const paces = vo2maxResolution?.vo2max ? vdotTrainingPaces(vo2maxResolution.vo2max) : null;

  const rec = buildRunningRecommendation({
    baseRecoveryScore,
    runningACWR,
    runs: db.runs,
    profile: db.profile,
    lastEfficiency,
    lastSpikeDetection,
    vo2maxResolution,
    vdotTrainingPaces: paces,
    age: db.profile?.age,
    maxHeartRate: db.profile?.baselines?.maxHeartRate,
    restingHeartRate: db.profile?.baselines?.restingHeartRate,
  });

  res.json(rec);
});

// Latest Apple Watch VO2max reading within a recent-days window (from
// lastN(db.metrics, n)), not just today's exact date the way
// /run/recommendation's own inline check above does -- that only ever
// matches a reading synced today, narrower than resolveVO2max's own 30-day
// staleness allowance actually supports. Pre-existing there, not touched;
// this is the more correct version for the new call sites below.
function latestAppleWatchVO2max(recentDays) {
  for (let i = recentDays.length - 1; i >= 0; i--) {
    if (recentDays[i].vo2max != null) return { value: recentDays[i].vo2max, dateMs: new Date(recentDays[i].date).getTime() };
  }
  return null;
}

// #cyclingPower.js / #enduranceRecommendation.js: cycling's own daily
// prescription, same shape /run/recommendation returns above. db.sports is
// the shared, unsplit bucket every non-running Strava activity lands in --
// filtered down to cycling-classified entries first.
app.get("/cycling/recommendation", async (req, res) => {
  const rides = (db.sports || []).filter(s => classifySportType(s.sportType) === 'cycling');
  if (!rides.length) return res.json(null);

  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  const baseRecoveryScore = computeDay(todayMetrics,
    avg(recentDays.map(d => d.heart_rate_variability).filter(Boolean)),
    avg(recentDays.map(d => d.resting_heart_rate).filter(Boolean)),
    personalSleepTarget(recentDays).target,
    avg(recentDays.map(d => d.wrist_temperature).filter(Boolean)),
    avg(recentDays.map(d => d.heart_rate).filter(Boolean))
  );
  if (baseRecoveryScore === null || baseRecoveryScore === undefined) return res.json(null);

  const age = db.profile.age ?? (db.profile.dob ? Math.round(computeAgeYears(db.profile.dob)) : null);
  const maxHeartRate = db.profile?.baselines?.maxHeartRate || (age ? estimateMaxHeartRate(age) : null);
  const restingHeartRate = db.profile?.baselines?.restingHeartRate;
  const bodyMassKg = Object.values(db.weight).at(-1);

  const ftpResult = estimateFTP(rides, maxHeartRate);
  const todayStr = new Date().toISOString().split('T')[0];
  const acwr = ftpResult
    ? coupledAcwr(dailyLoadsFromPower(rides, ftpResult.ftp), todayStr)
    : coupledAcwr(dailyLoadsFromRuns(rides, db.profile), todayStr); // TRIMP fallback, same generic load fn running uses
  const lastEfficiency = ftpResult
    ? weeklyPowerEfficiencyTrend(rides, new Date())
    : weeklySpeedEfficiencyTrend(rides, new Date());
  const lastRide = rides[rides.length - 1];
  const lastSpikeDetection = lastRide ? detectSessionDistanceSpike(lastRide, rides, 1.10) : null;

  const cyclingVdot = bodyMassKg ? estimateCyclingVO2maxFromRides(rides, bodyMassKg, maxHeartRate) : null;
  const appleWatchVO2max = latestAppleWatchVO2max(recentDays);
  const hrRatioInputs = maxHeartRate && restingHeartRate ? { maxHR: maxHeartRate, restingHR: restingHeartRate } : null;
  const vo2maxResolution = resolveVO2max(appleWatchVO2max, cyclingVdot, hrRatioInputs);

  const rec = buildCyclingRecommendation({
    baseRecoveryScore, acwr, sessions: rides, profile: db.profile,
    lastEfficiency, lastSpikeDetection, vo2maxResolution,
    age, maxHeartRate, restingHeartRate, ftpResult,
  });

  res.json(rec);
});

// #enduranceRecommendation.js: swimming's daily prescription -- same shape,
// HR-only throughout (no power/pace equivalent exists for swimming, see
// ENDURANCE_SCIENCE.md).
app.get("/swim/recommendation", async (req, res) => {
  const swims = (db.sports || []).filter(s => classifySportType(s.sportType) === 'swimming');
  if (!swims.length) return res.json(null);

  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  const baseRecoveryScore = computeDay(todayMetrics,
    avg(recentDays.map(d => d.heart_rate_variability).filter(Boolean)),
    avg(recentDays.map(d => d.resting_heart_rate).filter(Boolean)),
    personalSleepTarget(recentDays).target,
    avg(recentDays.map(d => d.wrist_temperature).filter(Boolean)),
    avg(recentDays.map(d => d.heart_rate).filter(Boolean))
  );
  if (baseRecoveryScore === null || baseRecoveryScore === undefined) return res.json(null);

  const age = db.profile.age ?? (db.profile.dob ? Math.round(computeAgeYears(db.profile.dob)) : null);
  const maxHeartRate = db.profile?.baselines?.maxHeartRate || (age ? estimateMaxHeartRate(age) : null);
  const restingHeartRate = db.profile?.baselines?.restingHeartRate;

  const todayStr = new Date().toISOString().split('T')[0];
  const acwr = coupledAcwr(dailyLoadsFromRuns(swims, db.profile), todayStr); // TRIMP, sport-agnostic
  const lastEfficiency = weeklySwimEfficiencyTrend(swims, new Date());
  const lastSwim = swims[swims.length - 1];
  const lastSpikeDetection = lastSwim ? detectSessionDistanceSpike(lastSwim, swims, 1.10) : null;

  const appleWatchVO2max = latestAppleWatchVO2max(recentDays);
  const hrRatioInputs = maxHeartRate && restingHeartRate ? { maxHR: maxHeartRate, restingHR: restingHeartRate } : null;
  // No swimming-specific calculatedVDOT source exists (see
  // ENDURANCE_SCIENCE.md) -- Apple Watch or the shared HR-ratio fallback only.
  const vo2maxResolution = resolveVO2max(appleWatchVO2max, null, hrRatioInputs);

  const rec = buildSwimmingRecommendation({
    baseRecoveryScore, acwr, sessions: swims, profile: db.profile,
    lastEfficiency, lastSpikeDetection, vo2maxResolution,
    age, maxHeartRate, restingHeartRate,
  });

  res.json(rec);
});

// #enduranceRecommendation.js's buildGeneralRecommendation: Sport & Aerobic
// (S14/S15) share this one computation, off db.sports's catch-all 'other'
// bucket (football, rock-climbing, Pilates, anything not run/cycle/swim) --
// Strava's sport_type can't distinguish those two activity choices in any
// principled way, so there's no data-level split to serve two different
// prescriptions from. HR-only throughout; no efficiency-trend metric either
// (no universal speed/pace unit across this bucket -- a distance means
// something for a hike, nothing for Pilates).
app.get("/general/recommendation", async (req, res) => {
  const sessions = (db.sports || []).filter(s => classifySportType(s.sportType) === 'other');
  if (!sessions.length) return res.json(null);

  const recentDays = lastN(db.metrics, 30);
  const todayMetrics = recentDays.at(-1) || {};
  const baseRecoveryScore = computeDay(todayMetrics,
    avg(recentDays.map(d => d.heart_rate_variability).filter(Boolean)),
    avg(recentDays.map(d => d.resting_heart_rate).filter(Boolean)),
    personalSleepTarget(recentDays).target,
    avg(recentDays.map(d => d.wrist_temperature).filter(Boolean)),
    avg(recentDays.map(d => d.heart_rate).filter(Boolean))
  );
  if (baseRecoveryScore === null || baseRecoveryScore === undefined) return res.json(null);

  const age = db.profile.age ?? (db.profile.dob ? Math.round(computeAgeYears(db.profile.dob)) : null);
  const maxHeartRate = db.profile?.baselines?.maxHeartRate || (age ? estimateMaxHeartRate(age) : null);
  const restingHeartRate = db.profile?.baselines?.restingHeartRate;

  const todayStr = new Date().toISOString().split('T')[0];
  const acwr = coupledAcwr(dailyLoadsFromRuns(sessions, db.profile), todayStr); // TRIMP, sport-agnostic
  const lastSession = sessions[sessions.length - 1];
  const lastSpikeDetection = lastSession ? detectSessionDistanceSpike(lastSession, sessions, 1.10) : null;

  const appleWatchVO2max = latestAppleWatchVO2max(recentDays);
  const hrRatioInputs = maxHeartRate && restingHeartRate ? { maxHR: maxHeartRate, restingHR: restingHeartRate } : null;
  const vo2maxResolution = resolveVO2max(appleWatchVO2max, null, hrRatioInputs);

  const rec = buildGeneralRecommendation({
    baseRecoveryScore, acwr, sessions, profile: db.profile,
    lastEfficiency: null, lastSpikeDetection, vo2maxResolution,
    age, maxHeartRate, restingHeartRate,
  });

  res.json(rec);
});

app.get("/plan/week", async (req, res) => {
  if (!db.weeklyPlan) return res.json(null);
  res.json({ ...db.weeklyPlan, sessionsCompletedThisWeek: weekLiftSessionsCompleted(db.lifts) });
});

app.post("/plan/week", async (req, res) => {
  const guidance = computeWeeklyGuidance();
  db.weeklyPlan = { ...guidance, generatedAt: new Date().toISOString() };
  await save();
  res.json({ ...db.weeklyPlan, sessionsCompletedThisWeek: weekLiftSessionsCompleted(db.lifts) });
});

// ---------- Plan Ahead calendar (Phase 5) ----------
// The forward-looking replacement for the "This Week's Guidance" advisory
// display: an actual day-by-day solve instead of just a session-count target
// + freshness ranking. db.weeklyPlan (above) stays as-is — #131/#133's
// micro-widgets still read it — this is additive, not a replacement of that
// stored shape.
//
// Never stored. TRAINING_ETHOS.md is explicit this is autoregulated
// session-to-session, never a locked program — recomputed fresh from live
// fatigue on every request, same as /plan/recommendation already does for a
// single day. Only the constraints (calendarWindows, unavailableDaysOfWeek,
// availableDaysOfWeek, splitDayAnchors, weeklySessionTarget) are durable;
// the picks never are.
app.get('/plan/calendar', async (req, res) => {
  const days = +req.query.days === 30 ? 30 : 7;
  const ctx = sessionPlanContext();
  const preferredSplit = db.profile?.preferredSplit || detectPreferredSplit(db.lifts) || 'Full Body';
  const result = solveCalendarWindow({
    lifts: ctx.lifts,
    soreness: db.soreness || [],
    sensitivity: db.muscleSensitivity || {},
    recoveryHours: personalizedRecoveryHours(db.profile, activeCycleFactor(db)),
    cnsSensitivity: db.cnsSensitivity || 1.0,
    recoveryScore: getRecoveryScore(db),
    carbsToday: (db.nutrition || {})[day()]?.carbs || 0,
    injuries: db.injuries || [],
    muscleFocus: ctx.muscleFocus,
    preferredSplit,
    travelMode: ctx.travelMode,
    favoriteExercises: ctx.favoriteExercises,
    trainingMonths: ctx.trainingMonths,
    preferStable: ctx.preferStable,
    maxDurationMin: db.profile?.maxSessionDurationMin || null,
    warmupScheme: ctx.warmupScheme,
    compoundIsolationPreference: db.profile?.compoundIsolationPreference || null,
    // Empty/unset means "never configured", not "only bodyweight allowed" —
    // same null-means-unrestricted convention as everywhere else this flows.
    equipmentAvailable: db.profile?.equipmentAvailable?.length ? db.profile.equipmentAvailable : null,
    calendarWindows: db.calendarWindows || [],
    unavailableDaysOfWeek: db.profile?.unavailableDaysOfWeek || [],
    availableDaysOfWeek: db.profile?.availableDaysOfWeek || [],
    splitDayAnchors: db.profile?.splitDayAnchors || {},
    weeklySessionTarget: db.profile?.weeklySessionTarget ?? null,
    trainingPriority: db.profile?.trainingPriority || 'strength',
    days,
  });
  res.json(result);
});

// ---------- Soreness logging + personal sensitivity ----------
app.post("/soreness", async (req, res) => {
  const { muscle, score, calcFatigue } = req.body;
  if (!muscle || score == null) return res.status(400).json({ error: "muscle and score required" });
  const s = Math.max(0, Math.min(10, +score));
  db.soreness = db.soreness || [];
  db.soreness.push({ ts: Date.now(), muscle, score: s });
  // Keep only last 90 days
  const cutoff = Date.now() - 90 * 864e5;
  db.soreness = db.soreness.filter(e => e.ts > cutoff);
  // Auto-calibrate sensitivity: nudge multiplier toward felt/predicted ratio
  db.muscleSensitivity = db.muscleSensitivity || {};
  if (calcFatigue != null && calcFatigue > 0.05) {
    const felt = s / 10;
    const current = db.muscleSensitivity[muscle] || 1.0;
    const ratio = felt / calcFatigue;
    const updated = current * Math.pow(ratio, 0.25); // gentle 25% nudge per log
    db.muscleSensitivity[muscle] = Math.round(Math.max(0.3, Math.min(3.0, updated)) * 100) / 100;
  }
  await save();
  res.json({ ok: true, muscleSensitivity: db.muscleSensitivity });
});

// ---------- Injury / niggle log ----------
app.get('/injuries', async (req, res) => {
  res.json({ injuries: (db.injuries || []).filter(i => !i.resolved) });
});

app.post('/injury', async (req, res) => {
  const { area, severity, note, muscles } = req.body;
  if (!area) return res.status(400).json({ error: 'area required' });
  db.injuries = db.injuries || [];
  const id = Date.now();
  db.injuries.push({ id, ts: id, area, severity: severity || 'mild', note: note || '', muscles: Array.isArray(muscles) ? muscles : [], resolved: false });
  await save();
  res.json({ ok: true, id });
});

app.post('/injuries/:id/resolve', async (req, res) => {
  const id = +req.params.id;
  db.injuries = db.injuries || [];
  const injury = db.injuries.find(i => i.id === id);
  if (!injury) return res.status(404).json({ error: 'not found' });
  injury.resolved = true;
  injury.resolvedAt = Date.now();
  await save();
  res.json({ ok: true });
});

// ---------- Menstrual cycle tracking (lightweight, manual — see cycleTracking.js) ----------
app.get('/cycle', async (req, res) => {
  const log = db.cycle || [];
  res.json({
    cycle: log,
    stats: cyclePhaseFactor(log, Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned),
    prediction: predictedNextPeriod(log, Date.now(), db.profile?.cycleIrregular),
  });
});

// `start`/`end` (YYYY-MM-DD) are optional and default to now — lets a user
// pick the actual day a period began/ended instead of only "right now",
// same date-driven shape /cycle/retro uses for a fully-past period.
app.post('/cycle/start', async (req, res) => {
  db.cycle = db.cycle || [];
  if (db.cycle.some(c => c.endTs == null)) {
    return res.status(400).json({ error: 'a period is already open — end it before starting a new one' });
  }
  const { start } = req.body || {};
  const startTs = start ? parseDateOnly(start) : Date.now();
  if (!Number.isFinite(startTs)) return res.status(400).json({ error: 'invalid start date' });
  if (startTs > Date.now()) return res.status(400).json({ error: "start date can't be in the future" });
  // Open-ended entry: extends to "now or later" until closed, so it
  // overlaps anything already logged after this chosen start date too.
  if (periodsOverlap(startTs, Infinity, db.cycle)) return res.status(400).json({ error: "overlaps a period that's already logged" });
  const id = startTs;
  db.cycle.push({ id, startTs, endTs: null, heaviness: null, note: '' });
  await save();
  res.json({ ok: true, id, startTs });
});

app.post('/cycle/:id/end', async (req, res) => {
  const id = +req.params.id;
  db.cycle = db.cycle || [];
  const entry = db.cycle.find(c => c.id === id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  if (entry.endTs != null) return res.status(400).json({ error: 'already ended' });
  const { heaviness, note, end } = req.body || {};
  if (heaviness != null && (!Number.isInteger(heaviness) || heaviness < 1 || heaviness > 5)) {
    return res.status(400).json({ error: 'heaviness must be an integer 1-5' });
  }
  const endTs = end ? parseDateOnly(end) : Date.now();
  if (!Number.isFinite(endTs)) return res.status(400).json({ error: 'invalid end date' });
  if (endTs <= entry.startTs) return res.status(400).json({ error: 'end must be after start' });
  if (endTs > Date.now()) return res.status(400).json({ error: "end date can't be in the future" });
  entry.endTs = endTs;
  if (heaviness != null) entry.heaviness = heaviness;
  if (note != null) entry.note = String(note).slice(0, 500);
  // The pick above is only this cycle's starting estimate — nudge the
  // persistent learned value toward what actually happened, same gentle
  // shape as muscleSensitivity's soreness calibration. Seeded from the
  // fresh pick (or the neutral midpoint) the first time there's nothing
  // learned yet; a no-op if there isn't enough logged training in either
  // window to judge.
  const observed = observedHeaviness(db.lifts, entry, db.cycle);
  const seed = db.profile.cycleHeavinessLearned ?? entry.heaviness ?? 3;
  db.profile.cycleHeavinessLearned = nudgeLearnedHeaviness(seed, observed);
  await save();
  res.json({ ok: true, endTs });
});

// Backfilling a period that already happened, entirely in the past — same
// endTs-time learning step as /cycle/:id/end, just start+end supplied
// together instead of start-now/end-later. More logged history is what
// currentCycleDay/heavinessStats/nudgeLearnedHeaviness all key off, so this
// is purely about giving the calibration more to work with, not a new kind
// of entry.
app.post('/cycle/retro', async (req, res) => {
  db.cycle = db.cycle || [];
  const { start, end, heaviness, note } = req.body || {};
  const startTs = start ? parseDateOnly(start) : NaN;
  const endTs = end ? parseDateOnly(end) : NaN;
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
  if (endTs <= startTs) return res.status(400).json({ error: 'end must be after start' });
  if (endTs > Date.now()) return res.status(400).json({ error: 'cannot log a period in the future' });
  if (heaviness != null && (!Number.isInteger(heaviness) || heaviness < 1 || heaviness > 5)) {
    return res.status(400).json({ error: 'heaviness must be an integer 1-5' });
  }
  if (periodsOverlap(startTs, endTs, db.cycle)) return res.status(400).json({ error: 'overlaps a period that\'s already logged' });
  const entry = { id: startTs, startTs, endTs, heaviness: heaviness ?? null, note: note ? String(note).slice(0, 500) : '' };
  db.cycle.push(entry);
  const observed = observedHeaviness(db.lifts, entry, db.cycle);
  const seed = db.profile.cycleHeavinessLearned ?? entry.heaviness ?? 3;
  db.profile.cycleHeavinessLearned = nudgeLearnedHeaviness(seed, observed);
  await save();
  res.json({ ok: true, entry });
});

// Correcting the training-impact rating after the fact — heaviness is
// often only clear a few days after a period ends, not the moment it does.
app.patch('/cycle/:id', async (req, res) => {
  const id = +req.params.id;
  db.cycle = db.cycle || [];
  const entry = db.cycle.find(c => c.id === id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  const { heaviness, note } = req.body || {};
  if (heaviness != null) {
    if (!Number.isInteger(heaviness) || heaviness < 1 || heaviness > 5) {
      return res.status(400).json({ error: 'heaviness must be an integer 1-5' });
    }
    entry.heaviness = heaviness;
  }
  if (note != null) entry.note = String(note).slice(0, 500);
  await save();
  res.json({ ok: true, entry });
});

// Safety-net delete for a mis-tapped start/end — same shape as
// /calendar-windows/:id.
app.delete('/cycle/:id', async (req, res) => {
  db.cycle = (db.cycle || []).filter(c => c.id !== +req.params.id);
  await save();
  res.json({ ok: true });
});

// ---------- Calendar constraint windows (Plan Ahead — see calendarSolver.js) ----------
// One-off date-range availability constraints: a holiday, a trip with only a
// hotel gym, a week you can't train at all. Recurring day-of-week blackouts
// and the split-day anchor are durable profile settings instead (POST
// /profile) — these are dated events, same shape-of-concern as injuries.
const CALENDAR_WINDOW_LEVELS = ['rest', 'bodyweight', 'restricted'];
app.get('/calendar-windows', async (req, res) => {
  res.json({ calendarWindows: db.calendarWindows || [] });
});

app.post('/calendar-windows', async (req, res) => {
  const { start, end, level, equipment, reason } = req.body || {};
  if (!start || !end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
  if (end < start) return res.status(400).json({ error: 'end must not be before start' });
  if (!CALENDAR_WINDOW_LEVELS.includes(level)) return res.status(400).json({ error: `level must be one of ${CALENDAR_WINDOW_LEVELS.join(', ')}` });
  if (level === 'restricted' && !Array.isArray(equipment)) return res.status(400).json({ error: 'restricted level requires an equipment array' });
  db.calendarWindows = db.calendarWindows || [];
  const id = Date.now();
  db.calendarWindows.push({ id, start, end, level, equipment: level === 'restricted' ? equipment : null, reason: reason || null });
  await save();
  res.json({ ok: true, id });
});

app.delete('/calendar-windows/:id', async (req, res) => {
  db.calendarWindows = (db.calendarWindows || []).filter(w => w.id !== +req.params.id);
  await save();
  res.json({ ok: true });
});

// ---------- Push notifications ----------
app.get("/push/vapid-public-key", (req, res) => {
  res.json({ key: VAPID_PUBLIC || null });
});

app.post("/push/subscribe", async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription required' });
  db.pushSubscriptions = db.pushSubscriptions || [];
  const exists = db.pushSubscriptions.find(s => s.endpoint === subscription.endpoint);
  if (!exists) db.pushSubscriptions.push(subscription);
  await save();
  res.json({ ok: true });
});

app.post("/push/send", async (req, res) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(400).json({ error: 'VAPID not configured' });
  const { title, body } = req.body;
  const subs = db.pushSubscriptions || [];
  if (!subs.length) return res.json({ sent: 0, message: 'no subscribers' });
  const results = await Promise.allSettled(subs.map(sub =>
    webpush.sendNotification(sub, JSON.stringify({ title: title || 'Press', body: body || '' }))
  ));
  res.json({ sent: results.filter(r => r.status === 'fulfilled').length });
});

app.put("/muscle-sensitivity", async (req, res) => {
  const { muscle, value } = req.body;
  if (!muscle || value == null) return res.status(400).json({ error: "muscle and value required" });
  db.muscleSensitivity = db.muscleSensitivity || {};
  db.muscleSensitivity[muscle] = Math.round(Math.max(0.3, Math.min(3.0, +value)) * 100) / 100;
  await save();
  res.json({ ok: true });
});

// ---------- Exercise library ----------
app.get('/exercises', async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const cat = req.query.category;
  let results = EXERCISE_DB;
  if (q) results = results.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.primary.some(m => m.toLowerCase().includes(q)) ||
    e.secondary.some(m => m.toLowerCase().includes(q))
  );
  if (cat) results = results.filter(e => e.category === cat);
  res.json({ exercises: results.slice(0, 30) });
});

app.get('/exercises/:id', async (req, res) => {
  const ex = EXERCISE_MAP[req.params.id] || EXERCISE_DB.find(e => e.name.toLowerCase() === req.params.id.toLowerCase());
  if (!ex) return res.status(404).json({ error: 'not found' });
  res.json({ exercise: ex });
});

// Manual merge for two exercise entries that are really the same movement
// but got saved as separate names — fuzzy auto-matching across import
// sources (Hevy, CSV, custom typed-in names) can't always resolve this on
// its own (see exerciseNameAliases.js for the cases it does catch). `from`
// is folded into `to`: every logged set under `from` is re-attributed to
// `to` (case-insensitive match, exact string on write), and `from` is
// dropped from customExercises if it was one. `to` doesn't need to already
// be a custom exercise — merging into a real EXERCISE_DB canonical name is
// the common case (e.g. a mistyped freestyle log getting folded into the
// real entry).
app.post('/exercises/merge', async (req, res) => {
  const from = (req.body.from || '').trim();
  const to = (req.body.to || '').trim();
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  if (from.toLowerCase() === to.toLowerCase()) return res.status(400).json({ error: 'from and to must be different' });
  const fromLower = from.toLowerCase();
  const matching = (db.lifts || []).filter(l => (l.exercise || '').toLowerCase() === fromLower);
  if (!matching.length && !(db.customExercises || []).some(ce => ce.name === fromLower)) {
    return res.status(404).json({ error: `no logged history or custom exercise found for "${from}"` });
  }
  const renamed = matching.map(l => ({ ...l, exercise: to }));
  await removeLiftsAndAppend(liftsDocRef, l => (l.exercise || '').toLowerCase() === fromLower, renamed);
  db.lifts = (db.lifts || []).filter(l => (l.exercise || '').toLowerCase() !== fromLower).concat(renamed);
  db.customExercises = (db.customExercises || []).filter(ce => ce.name !== fromLower);
  await save();
  res.json({ ok: true, mergedSets: matching.length });
});

// ---------- Session complete ----------
// Core "finish a workout" logic, shared by the solo /session/complete route
// below and the group-workout finish/auto-finish paths (functions/index.js
// group-session section, further down). Takes the target account's own
// data/liftsRef/save explicitly rather than closing over the module-level
// db/save/liftsDocRef globals, so it can run against a DIFFERENT account
// than the one making the current request — needed for the group session's
// 1-hour-inactivity auto-finish, which finishes a stale participant's
// workout on their behalf, not the requester's own. See
// .design/feature-brainstorm/GROUP_WORKOUT.md §4/§6.
async function applySessionComplete(data, liftsRef, saveFn, { workout, sets = [], customExercises = [], groupWith = null, elapsed = null }) {
  data.workouts = data.workouts || [];

  // A real clock reading for when the work happened, so fatigue decays from
  // then rather than from midnight. Null for anything not being logged today —
  // see sessionStartStamp for why guessing is worse than falling back.
  const startedAt = sessionStartStamp({ dateStr: workout.date, today: day(), elapsedSec: elapsed });

  const newLiftEntries = sets
    .filter(s => s.exercise && s.kg && s.reps)
    .map(s => ({
      exercise: s.exercise, kg: +s.kg, reps: +s.reps, rpe: s.rpe || null, date: workout.date,
      ...(startedAt ? { start: startedAt } : {}),
      ...(s.type && s.type !== 'N' ? { type: s.type } : {}),
      ...(s.machine ? { machine: s.machine } : {}), ...(s.pulleyType ? { pulleyType: s.pulleyType } : {}),
      ...(s.model ? { model: s.model } : {}),
      ...(s.emgWeights ? { emgWeights: s.emgWeights } : {}),
      ...(s.angle != null ? { angle: s.angle } : {}),
      ...(s.pattern ? { pattern: s.pattern } : {}),
    }));

  if (!newLiftEntries.length) return null;

  const cnsSetsWithRpe = newLiftEntries.filter(s => s.rpe && isCompoundExercise(s.exercise || ''));
  if (cnsSetsWithRpe.length) {
    const predicted = computeCNSFatigue(data.lifts || [], data.cnsSensitivity || 1.0) / 100;
    if (predicted > 0.05) {
      const felt = avg(cnsSetsWithRpe.map(s => +s.rpe)) / 10;
      const current = data.cnsSensitivity || 1.0;
      data.cnsSensitivity = Math.round(Math.max(0.3, Math.min(3.0, current * Math.pow(felt / predicted, 0.25))) * 100) / 100;
    }
  }

  const now = new Date().toISOString();
  const mergeIdx = findOrMergeWorkout(data.workouts, workout.date, 'app');
  const existing = data.workouts[mergeIdx];
  const workoutRecord = createWorkoutRecord({
    date: workout.date,
    name: workout.name || 'Session',
    source: 'app',
    sets: newLiftEntries.length,
    duration: elapsed ? Math.round(elapsed / 60) : (existing?.duration || null),
    gymId: workout.gymId || existing?.gymId,
    groupWith,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  if (mergeIdx >= 0) data.workouts[mergeIdx] = workoutRecord;
  else data.workouts.push(workoutRecord);

  const isReplacedToday = l => l.date === workout.date && newLiftEntries.some(s => s.exercise === l.exercise);
  await removeLiftsAndAppend(liftsRef, isReplacedToday, newLiftEntries);
  const priorLifts = data.lifts.filter(l => !isReplacedToday(l));
  data.lifts = priorLifts;
  data.lifts.push(...newLiftEntries);

  if (customExercises.length) {
    data.customExercises = data.customExercises || [];
    customExercises.forEach(ce => {
      if (!data.customExercises.find(e => e.name === ce.name)) data.customExercises.push(ce);
    });
  }

  // FEATURES.md #142: candidate pairwise-preference prompts for the finish-
  // workout screen — computed against history as it stood *before* this
  // session's own new entries, per priorLifts above, so an exercise doesn't
  // get offered as its own comparison partner via a set logged seconds ago
  // in the same session.
  const comparisonCandidates = detectComparisonCandidates(newLiftEntries, priorLifts);

  await saveFn();
  return { setsLogged: newLiftEntries.length, comparisonCandidates };
}

app.post('/session/complete', async (req, res) => {
  try {
    const { workout, sets = [], customExercises = [], elapsed = null } = req.body;
    if (!workout?.date) return res.status(400).json({ error: 'workout.date required' });
    if (typeof elapsed !== 'number' || elapsed < 0) return res.status(400).json({ error: 'elapsed (ms) must be non-negative number' });

    const sessionResult = await applySessionComplete(db, liftsDocRef, save, { workout, sets, customExercises, elapsed });
    if (sessionResult === null) return res.json({ ok: true, setsLogged: 0, atlasSummary: null, comparisonCandidates: [] });
    const { setsLogged, comparisonCandidates } = sessionResult;

    let atlasSummary = null;
    if (process.env.GEMINI_API_KEY && setsLogged > 0) {
      const topSets = sets.slice(0, 8).map(s => `${s.exercise}: ${s.kg}kg × ${s.reps}${s.rpe ? ' @ RPE ' + s.rpe : ''}`).join('\n');
      const profile = db.profile || {};
      const lowRepNote = isLowRepPattern(sets)
        ? `\n\nNote: most hard sets this session were at or under ${LOW_REP_THRESHOLD} reps, and stayed that way through the end of the session. The training ethos biases toward 8-9 reps — low reps rarely deliver enough stimulus per set to default to. If this reads as a deliberate low-rep/strength-testing day, don't labor the point, but if it looks habitual, say so plainly.`
        : '';
      const prompt = `You are Atlas, a training analyst for Press — a personal health app. You write post-session analysis. Precise, science-grounded, a touch cold. Gender-ambiguous (never use he/she/him/her). One short paragraph, 2-3 sentences max.

Session: ${workout.name || 'Workout'} on ${workout.date}
Sets logged:
${topSets}

Goal: ${profile.goal || 'build muscle'}
Training age: ${profile.trainingAge || 'unknown'}

Write a brief post-session note highlighting what the numbers say — mechanical fatigue accumulation, any standout load, what to prioritise next. No bullet points. No greetings.${lowRepNote}`;

      const result = await callGeminiResilient({ messages: [{ role: 'user', content: prompt }], maxTokens: 300, temperature: 0.7 });
      atlasSummary = result.ok ? result.content.trim() : null;
    }

    res.json({ ok: true, setsLogged, atlasSummary, comparisonCandidates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Exercise preference ranking (FEATURES.md #142) ----------
// Records the answer to a finish-workout "X vs Y" prompt (a and b from a
// comparisonCandidates entry above). winner === a or b for a real vote; omit
// it (or send skip: true) to fall back to the implicit signal instead —
// same resolveImplicitWinner used for bulk-import seeding, just applied to
// one specific pair instead of a whole imported history at once.
app.post('/preferences/compare', async (req, res) => {
  const { a, b, winner } = req.body || {};
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string' || a === b) {
    return res.status(400).json({ error: 'a and b (two different exercise names) required' });
  }
  const ratings = db.profile.exerciseRatings || {};
  let resolvedWinner = winner === a || winner === b ? winner : null;
  const implicit = !resolvedWinner;
  if (implicit) resolvedWinner = resolveImplicitWinner(db.lifts || [], a, b, Date.now());
  if (!resolvedWinner) return res.json({ ok: true, applied: false });

  const loser = resolvedWinner === a ? b : a;
  db.profile.exerciseRatings = applyComparison(ratings, resolvedWinner, loser, { implicit });
  await save();
  res.json({ ok: true, applied: true, implicit, winner: resolvedWinner });
});

app.delete('/workout/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  db.workouts = (db.workouts || []).filter(w => w.date !== date);
  db.lifts = (db.lifts || []).filter(l => l.date !== date);
  await removeLiftsAndAppend(liftsDocRef, l => l.date === date, []);
  await save();
  res.json({ ok: true });
});

app.put('/workout/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const sets = Array.isArray(req.body?.sets) ? req.body.sets : [];
  // This route replaces every lift for the date, so a workout that already had
  // a real timestamp would silently fall back to midnight after any edit.
  // Carry the existing one forward; there's no better source here, since an
  // edit can happen days after the session.
  const existingStart = (db.lifts || []).find(l => l.date === date && l.start)?.start || null;
  const newLiftEntries = sets
    .filter(s => s.exercise && s.kg && s.reps)
    .map(s => ({
      exercise: s.exercise, kg: +s.kg, reps: +s.reps, rpe: s.rpe || null, date,
      ...(existingStart ? { start: existingStart } : {}),
      ...(s.type && s.type !== 'N' ? { type: s.type } : {}),
      ...(s.machine ? { machine: s.machine } : {}), ...(s.pulleyType ? { pulleyType: s.pulleyType } : {}),
      ...(s.model ? { model: s.model } : {}),
    }));
  await removeLiftsAndAppend(liftsDocRef, l => l.date === date, newLiftEntries);
  db.lifts = (db.lifts || []).filter(l => l.date !== date).concat(newLiftEntries);
  const now = new Date().toISOString();
  if (!newLiftEntries.length) {
    db.workouts = (db.workouts || []).filter(w => w.date !== date);
  } else {
    const idx = (db.workouts || []).findIndex(w => w.date === date);
    if (idx >= 0) {
      const existing = db.workouts[idx];
      db.workouts[idx] = createWorkoutRecord({
        date,
        name: existing.name || 'Session',
        source: existing.source || 'app',
        sourceId: existing.sourceId || null,
        duration: existing.duration || null,
        kcal: existing.kcal || null,
        sets: newLiftEntries.length,
        gymId: existing.gymId || null,
        groupWith: existing.groupWith || null,
        createdAt: existing.createdAt || now,
        updatedAt: now,
      });
    } else {
      db.workouts = [...(db.workouts || []), createWorkoutRecord({ date, name: 'Session', source: 'app', sets: newLiftEntries.length, createdAt: now, updatedAt: now })];
    }
  }
  await save();
  res.json({ ok: true, setsLogged: newLiftEntries.length });
});

// ---------- Group workout sessions ----------
// See .design/feature-brainstorm/GROUP_WORKOUT.md for the full design.
// liveSessions/{sessionId} + an entries/ subcollection — deliberately a
// separate collection from any user's own per-user document, since this
// feature needs multiple accounts' data readable/writable in one request,
// which the per-user wholesale-document pattern (ARCHITECTURE.md) can't do
// safely. Full mutual read/write on entries while both the editor and the
// entry's owner are still "active" participants (flat trust model, by
// design — see §3); locked and removed from others' view the moment a
// participant finishes or leaves (§4).
const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — avoids read-aloud ambiguity
const SESSION_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

function randomSessionCode() {
  let out = '';
  for (let i = 0; i < 4; i++) out += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  return out;
}

async function generateUniqueSessionCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomSessionCode();
    const existing = await firestore.collection('liveSessions').where('code', '==', code).limit(1).get();
    if (existing.empty) return code;
  }
  throw new Error('Could not generate a unique session code');
}

const sessionParticipantSelf = () => ({
  uid: null, // filled by caller
  username: db.profile?.username || null,
  displayNameFirst: deriveDisplayNameFirst(db.profile?.displayName),
  status: 'active',
});

// participantUids is a flat array mirrored alongside `participants` purely
// for firestore.rules, which has no lambda/map() support — confirmed by an
// actual rules-compile failure against the Firestore emulator, not a style
// preference. Every write to `participants` must go through this so the two
// never drift apart.
const participantUidsOf = participants => participants.map(p => p.uid);

async function touchActivity(sessionRef, sessionData, uid) {
  const now = new Date().toISOString();
  const participants = sessionData.participants.map(p => p.uid === uid ? { ...p, lastActivityAt: now } : p);
  await sessionRef.update({ participants, participantUids: participantUidsOf(participants) });
}

// Once every participant who was ever in the session has individually left
// or finished, the session's whole temporary footprint (doc + entries) goes
// away — nothing about anyone's already-saved personal data is touched.
async function deleteSessionIfDone(sessionRef, participants) {
  if (!participants.every(p => p.status !== 'active')) return;
  const entriesSnap = await sessionRef.collection('entries').get();
  const batch = firestore.batch();
  entriesSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(sessionRef);
  await batch.commit();
}

function sessionEntryToSet(entry) {
  return { exercise: entry.exercise, kg: entry.kg, reps: entry.reps, rpe: entry.rpe, type: entry.type, machine: entry.machine, pulleyType: entry.pulleyType, model: entry.model };
}

// No real Cloud Scheduler job backs the 1-hour inactivity timeout (that's
// meaningfully more deploy/IAM plumbing than a solo-dev app needs for this)
// — instead a lazy sweep runs at the top of the read/write paths a session
// actually gets touched through (GET for polling, POST entries for live
// activity), which is enough to make a stale participant's tab disappear
// within about the next poll cycle after the hour is up, matching the
// user-visible behavior the design calls for without a standing background
// job. Auto-finishes a stale participant by reading and writing THEIR OWN
// users/{uid} document directly via loadForUserDoc/saveDocExcludingLifts —
// deliberately not the request-scoped db/save globals, which belong to
// whoever is making the current request, not the stale participant.
async function sweepStaleParticipants(sessionRef, sessionData) {
  const now = Date.now();
  const stale = sessionData.participants.filter(p => p.status === 'active' && now - new Date(p.lastActivityAt).getTime() > SESSION_INACTIVITY_TIMEOUT_MS);
  if (!stale.length) return sessionData.participants;

  let participants = sessionData.participants;
  for (const p of stale) {
    const entriesSnap = await sessionRef.collection('entries').where('uid', '==', p.uid).get();
    const sets = entriesSnap.docs.map(d => sessionEntryToSet(d.data())).filter(s => s.exercise && s.kg && s.reps);
    if (sets.length) {
      const targetRef = userDocRef(p.uid);
      const targetSnap = await targetRef.get();
      const targetData = await loadForUserDoc(targetRef, targetSnap, null);
      const groupWith = participants.filter(o => o.uid !== p.uid).map(o => ({ uid: o.uid, username: o.username, displayNameFirst: o.displayNameFirst }));
      // Backdated to last activity, not the moment the sweep runs — an idle
      // hour shouldn't inflate the recorded workout duration.
      await applySessionComplete(targetData, targetRef, () => saveDocExcludingLifts(targetRef, targetData),
        { workout: { name: 'Group Session', date: day(p.lastActivityAt) }, sets, customExercises: [], groupWith: groupWith.length ? groupWith : null });
    }
    participants = participants.map(x => x.uid === p.uid ? { ...x, status: 'finished', lastActivityAt: new Date().toISOString() } : x);
  }
  await sessionRef.update({ participants, participantUids: participantUidsOf(participants) });
  await deleteSessionIfDone(sessionRef, participants);
  return participants;
}

app.post('/session', async (req, res) => {
  const code = await generateUniqueSessionCode();
  const now = new Date().toISOString();
  const participant = { ...sessionParticipantSelf(), uid: req.uid, joinedAt: now, lastActivityAt: now };
  const ref = firestore.collection('liveSessions').doc();
  await ref.set({ code, createdBy: req.uid, createdAt: now, participants: [participant], participantUids: [req.uid] });
  res.json({ sessionId: ref.id, code });
});

app.post('/session/join', async (req, res) => {
  const code = (req.body?.code || '').toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const snap = await firestore.collection('liveSessions').where('code', '==', code).limit(1).get();
  if (snap.empty) return res.status(404).json({ error: 'Session not found' });
  const ref = snap.docs[0].ref;
  const data = snap.docs[0].data();
  const already = data.participants.find(p => p.uid === req.uid);
  if (already) {
    if (already.status !== 'active') return res.status(410).json({ error: 'You already left or finished this session' });
    return res.json({ sessionId: ref.id }); // idempotent rejoin
  }
  if (data.participants.filter(p => p.status === 'active').length >= 4) return res.status(409).json({ error: 'Session full' });
  const now = new Date().toISOString();
  const participant = { ...sessionParticipantSelf(), uid: req.uid, joinedAt: now, lastActivityAt: now };
  const participants = [...data.participants, participant];
  await ref.update({ participants, participantUids: participantUidsOf(participants) });
  res.json({ sessionId: ref.id });
});

// Bulk-copies whatever the caller has already logged in their current
// in-progress solo workout into their tab in the shared session, the
// moment they connect (creator starting, or joiner joining) — not
// forward-only. See GROUP_WORKOUT.md §2 "Merge-on-connect."
// Replace semantics (delete-then-insert), not purely additive — this is
// called both once at connect (the original "merge-on-connect" from
// GROUP_WORKOUT.md §2) AND repeatedly afterward as the frontend's debounced
// local->shared sync (the caller's own tab in the group session IS their
// normal solo-logging UI, kept live-synced outward rather than merged only
// once). Additive semantics would have duplicated every set on every sync.
// Known tradeoff, consistent with the feature's accepted last-write-wins
// model: if another participant adds a bare exercise placeholder to my tab
// between my polls, an in-flight sync from stale local state could
// transiently wipe it until my next poll reconciles it back in.
app.post('/session/:id/merge', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  const data = snap.data();
  if (!data.participants.find(p => p.uid === req.uid && p.status === 'active')) {
    return res.status(403).json({ error: 'Not an active participant of this session' });
  }
  const sets = Array.isArray(req.body?.sets) ? req.body.sets : [];
  const now = new Date().toISOString();
  const existingMine = await ref.collection('entries').where('uid', '==', req.uid).get();
  const batch = firestore.batch();
  existingMine.docs.forEach(d => batch.delete(d.ref));
  for (const s of sets) {
    if (!s.exercise) continue;
    batch.set(ref.collection('entries').doc(), {
      uid: req.uid, lastEditedBy: req.uid,
      exercise: s.exercise, kg: s.kg ?? null, reps: s.reps ?? null, rpe: s.rpe ?? null,
      type: s.type || null, machine: s.machine || null, pulleyType: s.pulleyType || null, model: s.model || null,
      loggedAt: now, updatedAt: now,
    });
  }
  await batch.commit();
  await touchActivity(ref, data, req.uid);
  res.json({ ok: true, merged: sets.filter(s => s.exercise).length });
});

app.get('/session/:id', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  await sweepStaleParticipants(ref, snap.data());
  // Re-fetch: the sweep may have auto-finished the last active participant
  // and deleted the whole session doc in the process.
  const freshSnap = await ref.get();
  if (!freshSnap.exists) return res.json({ ended: true });
  const data = freshSnap.data();
  if (!data.participants.find(p => p.uid === req.uid)) return res.status(403).json({ error: 'Not a participant of this session' });
  const entriesSnap = await ref.collection('entries').get();
  res.json({
    sessionId: ref.id, code: data.code, participants: data.participants,
    entries: entriesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  });
});

app.post('/session/:id/entries', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  const data = snap.data();
  if (!data.participants.find(p => p.uid === req.uid && p.status === 'active')) {
    return res.status(403).json({ error: 'Not an active participant of this session' });
  }
  const owner = data.participants.find(p => p.uid === req.body?.uid);
  if (!owner || owner.status !== 'active') return res.status(400).json({ error: 'That participant is not active in this session' });
  const now = new Date().toISOString();
  const { exercise, kg, reps, rpe, type, machine, pulleyType, model } = req.body;
  const entryRef = ref.collection('entries').doc();
  await entryRef.set({
    uid: owner.uid, lastEditedBy: req.uid,
    exercise: exercise || null, kg: kg ?? null, reps: reps ?? null, rpe: rpe ?? null,
    type: type || null, machine: machine || null, pulleyType: pulleyType || null, model: model || null,
    loggedAt: now, updatedAt: now,
  });
  await touchActivity(ref, data, req.uid);
  res.json({ id: entryRef.id });
});

// Full mutual edit — any active participant may edit any other active
// participant's entry, not just their own (GROUP_WORKOUT.md §3, a
// deliberate flat trust model for this max-4 code-joined feature).
app.put('/session/:id/entries/:entryId', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  const data = snap.data();
  if (!data.participants.find(p => p.uid === req.uid && p.status === 'active')) {
    return res.status(403).json({ error: 'Not an active participant of this session' });
  }
  const entryRef = ref.collection('entries').doc(req.params.entryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) return res.status(404).json({ error: 'Entry not found' });
  const owner = data.participants.find(p => p.uid === entrySnap.data().uid);
  if (!owner || owner.status !== 'active') return res.status(403).json({ error: "That participant's data is locked — they've already left or finished" });
  const { exercise, kg, reps, rpe, type, machine, pulleyType, model } = req.body;
  const patch = { lastEditedBy: req.uid, updatedAt: new Date().toISOString() };
  if (exercise !== undefined) patch.exercise = exercise;
  if (kg !== undefined) patch.kg = kg;
  if (reps !== undefined) patch.reps = reps;
  if (rpe !== undefined) patch.rpe = rpe;
  if (type !== undefined) patch.type = type;
  if (machine !== undefined) patch.machine = machine;
  if (pulleyType !== undefined) patch.pulleyType = pulleyType;
  if (model !== undefined) patch.model = model;
  await entryRef.update(patch);
  await touchActivity(ref, data, req.uid);
  res.json({ ok: true });
});

app.delete('/session/:id/entries/:entryId', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  const data = snap.data();
  if (!data.participants.find(p => p.uid === req.uid && p.status === 'active')) {
    return res.status(403).json({ error: 'Not an active participant of this session' });
  }
  const entryRef = ref.collection('entries').doc(req.params.entryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) return res.status(404).json({ error: 'Entry not found' });
  const owner = data.participants.find(p => p.uid === entrySnap.data().uid);
  if (!owner || owner.status !== 'active') return res.status(403).json({ error: "That participant's data is locked — they've already left or finished" });
  await entryRef.delete();
  await touchActivity(ref, data, req.uid);
  res.json({ ok: true });
});

// Self-scoped only — finishing your own workout. Frontend is expected to
// have already done the "fresh refresh from the shared session before
// saving" step (GROUP_WORKOUT.md §4) by fetching GET /session/:id and
// merging before calling this; the backend just takes whatever final `sets`
// it's given, same contract as solo /session/complete.
app.post('/session/:id/finish', async (req, res) => {
  try {
    const { workout, sets = [], customExercises = [], elapsed = null } = req.body;
    if (!workout?.date) return res.status(400).json({ error: 'workout.date required' });
    if (typeof elapsed !== 'number' || elapsed < 0) return res.status(400).json({ error: 'elapsed (ms) must be non-negative number' });
    const ref = firestore.collection('liveSessions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
    const data = snap.data();
    if (!data.participants.find(p => p.uid === req.uid)) return res.status(403).json({ error: 'Not a participant of this session' });

    const groupWith = data.participants.filter(p => p.uid !== req.uid).map(p => ({ uid: p.uid, username: p.username, displayNameFirst: p.displayNameFirst }));
    const sessionResult = await applySessionComplete(db, liftsDocRef, save, { workout, sets, customExercises, groupWith: groupWith.length ? groupWith : null, elapsed });
    if (sessionResult === null) return res.json({ ok: true, setsLogged: 0, comparisonCandidates: [] });
    const { setsLogged, comparisonCandidates } = sessionResult;

    const now = new Date().toISOString();
    const updatedParticipants = data.participants.map(p => p.uid === req.uid ? { ...p, status: 'finished', lastActivityAt: now } : p);
    await ref.update({ participants: updatedParticipants, participantUids: participantUidsOf(updatedParticipants) });
    await deleteSessionIfDone(ref, updatedParticipants);
    res.json({ ok: true, setsLogged, comparisonCandidates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Self-scoped only — exits the shared aspect without finishing/saving your
// own workout (which keeps going solo on your own device). Same visible
// effect on other participants as finishing: your tab disappears from their
// view immediately.
app.post('/session/:id/leave', async (req, res) => {
  const ref = firestore.collection('liveSessions').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Session not found' });
  const data = snap.data();
  if (!data.participants.find(p => p.uid === req.uid)) return res.status(403).json({ error: 'Not a participant of this session' });
  const now = new Date().toISOString();
  const updatedParticipants = data.participants.map(p => p.uid === req.uid ? { ...p, status: 'left', lastActivityAt: now } : p);
  await ref.update({ participants: updatedParticipants, participantUids: participantUidsOf(updatedParticipants) });
  await deleteSessionIfDone(ref, updatedParticipants);
  res.json({ ok: true });
});

// ---------- Gym equipment catalog ----------
// See .design/feature-brainstorm/GYM_MACHINE_CATALOG.md for the full design.
// gyms/{gymId} — a shared global directory (not per-user), same reasoning
// as liveSessions/ above for living outside the per-user wholesale-document
// pattern: any signed-in user can read/contribute to any gym record.
// Additive-only by convention (enforced here, in the Admin-SDK endpoints —
// firestore.rules is not load-bearing, same caveat as liveSessions/): saves
// only ever add a brand to softBrands or set/replace this gym's own
// exercise->{brand,model} hard save, never remove another contributor's
// entry.
function gymSoftBrandsDefault() { return { cable: [], machine: [], smith: [] }; }

app.post('/gyms', async (req, res) => {
  const { name, lat, lng, force } = req.body || {};
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'name, lat, lng required' });
  }
  if (!force) {
    const allSnap = await firestore.collection('gyms').get();
    const nearby = findNearbyGyms(allSnap.docs.map(d => ({ id: d.id, ...d.data() })), lat, lng, GYM_NEARBY_RADIUS_M);
    if (nearby.length) return res.json({ matches: nearby });
  }
  const now = new Date().toISOString();
  const ref = firestore.collection('gyms').doc();
  await ref.set({ name, lat, lng, softBrands: gymSoftBrandsDefault(), hardSaves: {}, createdBy: req.uid, createdAt: now, updatedAt: now });
  res.json({ gymId: ref.id });
});

app.get('/gyms/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'lat, lng required' });
  const radius = req.query.radius ? parseFloat(req.query.radius) : GYM_NEARBY_RADIUS_M;
  const allSnap = await firestore.collection('gyms').get();
  const nearby = findNearbyGyms(allSnap.docs.map(d => ({ id: d.id, ...d.data() })), lat, lng, radius);
  res.json({ gyms: nearby });
});

app.get('/gyms/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (!q) return res.json({ gyms: [] });
  // Simple in-memory substring match, not a prefix-indexed query — fine at
  // this app's scale (same tradeoff as /food/recent above), and avoids the
  // FieldPath('__name__') workaround /account/search needed (gymId isn't a
  // human-typed identifier, so there's no natural doc-ID prefix to query).
  const allSnap = await firestore.collection('gyms').get();
  const gyms = allSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(g => (g.name || '').toLowerCase().includes(q))
    .slice(0, 20);
  res.json({ gyms });
});

app.get('/gyms/:id', async (req, res) => {
  const snap = await firestore.collection('gyms').doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Gym not found' });
  res.json({ id: snap.id, ...snap.data() });
});

app.post('/gyms/:id/save-machine', async (req, res) => {
  const { equipmentType, brand, exercise, model } = req.body || {};
  if (!['cable', 'machine', 'smith'].includes(equipmentType) || !brand) {
    return res.status(400).json({ error: 'equipmentType (cable/machine/smith) and brand required' });
  }
  const ref = firestore.collection('gyms').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Gym not found' });
  const data = snap.data();
  const softBrands = { ...gymSoftBrandsDefault(), ...data.softBrands };
  if (!softBrands[equipmentType].includes(brand)) softBrands[equipmentType] = [...softBrands[equipmentType], brand];

  const update = { softBrands, updatedAt: new Date().toISOString() };
  if (exercise) {
    update[`hardSaves.${normalizeExerciseKey(exercise)}`] = { brand, model: model || null };
  }
  await ref.update(update);
  res.json({ ok: true });
});

// ---------- Food ----------
app.get('/food/recent', async (req, res) => {
  const log = db.nutritionLog || [];
  const seen = new Set();
  const recent = [];
  for (const entry of [...log].reverse()) {
    // Every nutritionLog entry is stored under `label` (see POST /nutrition),
    // never `name` -- this was reading a field that never existed, so `key`
    // was always undefined and this route always returned an empty list.
    const key = entry.label?.toLowerCase();
    if (key && !seen.has(key)) { seen.add(key); recent.push(entry); }
    if (recent.length >= 20) break;
  }
  res.json({ recent });
});

app.get('/food/templates', async (req, res) => {
  res.json({ templates: db.mealTemplates || [] });
});

app.post('/food/template', async (req, res) => {
  const { name, items } = req.body;
  if (!name || !items?.length) return res.status(400).json({ error: 'name and items required' });
  db.mealTemplates = db.mealTemplates || [];
  const existing = db.mealTemplates.findIndex(t => t.name === name);
  if (existing >= 0) db.mealTemplates[existing] = { name, items };
  else db.mealTemplates.push({ name, items });
  await save();
  res.json({ ok: true });
});

app.delete('/food/template/:name', async (req, res) => {
  db.mealTemplates = (db.mealTemplates || []).filter(t => t.name !== req.params.name);
  await save();
  res.json({ ok: true });
});

app.post('/food/barcode', async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`);
    const d = await r.json();
    if (d.status !== 1 || !d.product) return res.status(404).json({ error: 'product not found' });
    const p = d.product;
    const n = p.nutriments || {};
    res.json({
      product: {
        name: p.product_name || p.product_name_en || 'Unknown product',
        brand: p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || (n.energy_100g || 0) / 4.184),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        servingSize: p.serving_size || '100g',
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Morning briefing ----------
async function generateMorningBriefing(db) {
  if (!process.env.GEMINI_API_KEY) return null;

  const today = day();
  const yesterday = day(Date.now() - 86400000);

  const yesterdayWorkout = (db.workouts || []).find(w => w.date === yesterday);
  const yesterdayLifts = (db.lifts || []).filter(l => l.date === yesterday);
  const yesterdayNutrition = (db.nutritionLog || []).filter(n => n.date === yesterday);
  const todayMetrics = db.metrics?.[today] || {};
  const yesterdayMetrics = db.metrics?.[yesterday] || {};

  const totalCalories = yesterdayNutrition.reduce((s, n) => s + (n.calories || 0), 0);
  const totalProtein = yesterdayNutrition.reduce((s, n) => s + (n.protein || 0), 0);

  const sleepH = todayMetrics.sleep_hours || yesterdayMetrics.sleep_hours;
  const hrv = todayMetrics.heart_rate_variability || yesterdayMetrics.heart_rate_variability;
  const rhr = todayMetrics.resting_heart_rate || yesterdayMetrics.resting_heart_rate;

  const fatigue = computeCurrentFatigueScores(db.lifts || [], musclePeaksFromLifts(db.lifts || []), db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile, activeCycleFactor(db)));
  const topFatigued = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `${m} ${Math.round(v)}%`).join(', ');

  const briefingFatigue = fatigue;
  const briefingMetabolic = computeMetabolicFatigue(db.lifts || [], (db.nutrition || {})[today]?.carbs || 0);
  const briefingCNS = computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const macroTargets = db.profile?.macroTargets || { protein: 160, calories: 2400 };
  const nutritionNotLogged = !totalCalories && !totalProtein;
  const cycleInfo = db.profile?.cycleTrackingEnabled && (db.cycle || []).length ? cyclePhaseFactor(db.cycle, Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned) : null;

  const prompt = `You are generating a morning health briefing for a personal health app called Press. The briefing has three voices:

V — the health editor. Cool, authoritative, deliberate. Treats health data like breaking news. No gender, no backstory, just V. Always writes something even on rest days — rest has a story too. Editorial newspaper voice, punchy and precise.

Atlas — the training analyst. Methodical, precise, science-grounded. Only speaks on training days or to preview tomorrow's session on rest days.

Fuel — the nutrition editor. Precise, no-nonsense. Prescribes today's nutrition based on training demands and recovery needs. One short paragraph.

The user's data:
- Sleep: ${sleepH ? sleepH + 'h' : 'not logged'}
- HRV: ${hrv ? hrv + 'ms' : 'not logged'}
- RHR: ${rhr ? rhr + 'bpm' : 'not logged'}
- Yesterday's workout: ${yesterdayWorkout ? yesterdayWorkout.name + ' — ' + yesterdayLifts.length + ' sets logged' : 'rest day'}
- Yesterday's nutrition: ${totalCalories ? totalCalories + 'kcal, ' + totalProtein + 'g protein' : 'NOT LOGGED — flag this'}
- Structural fatigue: ${topFatigued || 'none'}
- Metabolic fatigue: ${briefingMetabolic}%
- CNS fatigue: ${briefingCNS}%${cycleInfo && cycleInfo.cycleDay != null ? `\n- Cycle phase: day ${cycleInfo.cycleDay}${cycleInfo.onPeriod ? ' (on period)' : ''}, recovery calibration factor ${cycleInfo.factor.toFixed(2)}, RIR guidance: ${cycleInfo.rirOffset > 0 ? '+' + cycleInfo.rirOffset : cycleInfo.rirOffset}` : ''}
- Goal: ${db.profile?.goal || 'build muscle'}
- Protein target: ${macroTargets.protein}g/day, Calorie target: ${macroTargets.calories}kcal/day
- Supplements: ${(db.supplements || []).map(s => s.name).join(', ') || 'none logged'}

Return ONLY valid JSON in this exact structure:
{
  "headline": "PUNCHY HEADLINE IN CAPS — MAX 55 CHARS",
  "subheading": "One sharp sentence expanding on the headline. Reads like a magazine deck.",
  "pullQuote": "One standalone, quotable sentence pulled from the day's most important insight — the kind of line a newspaper pulls out and sets in large type between columns. Not a repeat of the headline or subheading.",
  "bullets": {
    "wins": ["win 1", "win 2"],
    "misses": ["miss 1${nutritionNotLogged ? ', nutrition not logged yesterday' : ''}"],
    "numbers": [{"label": "Sleep", "value": "8.2h"}, {"label": "HRV", "value": "68ms"}, {"label": "Calories", "value": "3,200"}]
  },
  "v": "2-3 sentences of flowing editorial prose from V. Newspaper voice, no bullet points. Contextualises the data as a narrative.",
  "atlas": "1-2 sentences from Atlas on training. Null if true rest day with no training context.",
  "fuel": "Fuel's prescription for today. Based on today's training demands, metabolic state (${briefingMetabolic}% depleted), and goal. Specific: name protein sources, carb timing around training, total targets. 2-3 sentences max.",
  "notification": "The headline rephrased for a push notification — under 60 chars, punchy"
}`;

  const result = await callGeminiResilient({ messages: [{ role: 'user', content: prompt }], maxTokens: 750, jsonMode: true, temperature: 0.8 });
  if (!result.ok) {
    console.error('Gemini briefing error:', result.status, JSON.stringify(result.error));
    throw new Error(result.error?.message || `Gemini returned ${result.status}`);
  }
  let briefing;
  try { briefing = parseGeminiJSON(result.content); } catch (e) { throw new Error('Gemini returned invalid JSON: ' + e.message); }
  briefing.generatedAt = new Date().toISOString();
  briefing.date = today;
  return briefing;
}

async function generateNewscast(db, period) {
  if (!process.env.GEMINI_API_KEY) return null;
  const today = day();
  const todayNutrition = (db.nutritionLog || []).filter(n => n.date === today);
  const totalCals = todayNutrition.reduce((s, n) => s + (n.calories || 0), 0);
  const totalProtein = todayNutrition.reduce((s, n) => s + (n.protein || 0), 0);
  const todayWorkout = (db.workouts || []).find(w => w.date === today);
  const nutritionLogged = todayNutrition.length > 0;
  const macroTargets = db.profile?.macroTargets || { calories: 2400, protein: 160 };
  const timeLabel = period === 'afternoon' ? 'Mid-Day Update' : "Tonight's Report";
  const fatigue = computeCurrentFatigueScores(db.lifts || [], musclePeaksFromLifts(db.lifts || []), db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile, activeCycleFactor(db)));
  const topFatigued = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `${m} ${Math.round(v)}%`).join(', ') || 'none';
  const cns = computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const cycleInfo = db.profile?.cycleTrackingEnabled && (db.cycle || []).length ? cyclePhaseFactor(db.cycle, Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned) : null;

  const prompt = `You are generating a ${timeLabel} for a personal health app called Press. Same editorial voices as the morning edition — V (health editor, cool newspaper prose, no hand-holding) and Atlas (training analyst, methodical, science-grounded).

Today's data so far:
- Workout: ${todayWorkout ? todayWorkout.name + ' — completed' : 'not yet logged'}
- Nutrition logged: ${nutritionLogged ? `${totalCals}kcal, ${totalProtein}g protein (target: ${macroTargets.calories}kcal, ${macroTargets.protein}g protein)` : 'NOTHING LOGGED'}
- Structural fatigue: ${topFatigued}
- CNS fatigue: ${cns}%${cycleInfo && cycleInfo.cycleDay != null ? `\n- Cycle phase: day ${cycleInfo.cycleDay}${cycleInfo.onPeriod ? ' (on period)' : ''}, recovery calibration factor ${cycleInfo.factor.toFixed(2)}, RIR guidance: ${cycleInfo.rirOffset > 0 ? '+' + cycleInfo.rirOffset : cycleInfo.rirOffset}` : ''}
- Time of day: ${period === 'afternoon' ? 'mid-afternoon' : 'evening'}

Return ONLY valid JSON:
{
  "headline": "HEADLINE IN CAPS — MAX 55 CHARS",
  "subheading": "One sharp sentence.",
  "pullQuote": "One standalone, quotable sentence pulled from today's most important thread so far — not a repeat of the headline or subheading.",
  "bullets": { "numbers": [{"label": "Calories", "value": "1,850"}, {"label": "Protein", "value": "120g"}] },
  "v": "${period === 'afternoon' ? 'Check-in tone — how is the day building. 2-3 sentences.' : 'Closing note — what the day amounted to. 2-3 sentences.'}${!nutritionLogged ? ' Address the missing nutrition log directly and briefly — frame it as a data gap, not a nag.' : ''}",
  "atlas": "1-2 sentences from Atlas on today's training/fatigue state. Null if there's genuinely nothing training-relevant to say (e.g. true rest day, nothing logged yet).",
  "nutritionNote": ${nutritionLogged ? 'null' : '"A single direct sentence prompting the user to log their nutrition today."'}
}`;

  const result = await callGeminiResilient({ messages: [{ role: 'user', content: prompt }], maxTokens: 500, jsonMode: true, temperature: 0.75 });
  if (!result.ok) {
    console.error('Gemini newscast error:', result.status, JSON.stringify(result.error));
    throw new Error(result.error?.message || `Gemini returned ${result.status}`);
  }
  let newscast;
  try { newscast = parseGeminiJSON(result.content); } catch (e) { throw new Error('Gemini returned invalid JSON: ' + e.message); }
  newscast.period = period;
  newscast.generatedAt = new Date().toISOString();
  newscast.date = today;
  return newscast;
}

// Week-over-week digest: same editorial voices as the daily briefing/newscast,
// but comparing this week to the prior week instead of describing a single day.
async function generateWeeklyReview(db) {
  if (!process.env.GEMINI_API_KEY) return null;
  const cutoffThis = day(new Date(Date.now() - 7 * 864e5));
  const cutoffLast = day(new Date(Date.now() - 14 * 864e5));

  const thisWeekWorkouts = (db.workouts || []).filter(w => w.date >= cutoffThis);
  const lastWeekWorkouts = (db.workouts || []).filter(w => w.date >= cutoffLast && w.date < cutoffThis);
  const thisWeekLifts = (db.lifts || []).filter(l => l.date >= cutoffThis);
  const lastWeekLifts = (db.lifts || []).filter(l => l.date >= cutoffLast && l.date < cutoffThis);
  const volFor = lifts => Math.round(lifts.reduce((s, l) => s + (l.kg || 0) * (l.reps || 0), 0));
  const thisVol = volFor(thisWeekLifts), lastVol = volFor(lastWeekLifts);

  const days30 = lastN(db.metrics, 30);
  const baseHRV = avg(days30.map(d => d.heart_rate_variability).filter(Boolean));
  const baseRHR = avg(days30.map(d => d.resting_heart_rate).filter(Boolean));
  const baseWristTemp = avg(days30.map(d => d.wrist_temperature).filter(Boolean));
  const baseHR = avg(days30.map(d => d.heart_rate).filter(Boolean));
  const sleepT = personalSleepTarget(days30);
  const scoresFor = keys => keys.map(k => computeDay(db.metrics[k], baseHRV, baseRHR, sleepT.target, baseWristTemp, baseHR)).filter(v => v != null);
  const metricKeys = Object.keys(db.metrics);
  const thisWeekKeys = metricKeys.filter(k => k >= cutoffThis);
  const lastWeekKeys = metricKeys.filter(k => k >= cutoffLast && k < cutoffThis);
  const avgRecoveryThis = avg(scoresFor(thisWeekKeys));
  const avgRecoveryLast = avg(scoresFor(lastWeekKeys));
  const avgSleepThis = avg(thisWeekKeys.map(k => db.metrics[k].sleep_hours).filter(Boolean));
  const avgSleepLast = avg(lastWeekKeys.map(k => db.metrics[k].sleep_hours).filter(Boolean));

  const nutritionKeysThis = Object.keys(db.nutrition || {}).filter(k => k >= cutoffThis);
  const avgCalThis = avg(nutritionKeysThis.map(k => db.nutrition[k].calories).filter(Boolean));
  const avgProteinThis = avg(nutritionKeysThis.map(k => db.nutrition[k].protein).filter(Boolean));
  const macroTargets = db.profile?.macroTargets || { calories: 2400, protein: 160 };

  const weightKeysThis = Object.keys(db.weight).filter(k => k >= cutoffThis).sort();
  const weightKeysLast = Object.keys(db.weight).filter(k => k >= cutoffLast && k < cutoffThis).sort();
  const weightStart = db.weight[weightKeysLast[0]] ?? db.weight[weightKeysThis[0]];
  const weightEnd = db.weight[weightKeysThis.at(-1)];

  const prLifts = ['squat', 'bench', 'deadlift', 'overheadPress', 'row'].filter(cat => {
    const priorBest = Math.max(0, ...db.lifts.filter(l => l.date < cutoffThis && classifyLift(l.exercise || '') === cat).map(l => estimate1RM(l.kg, l.reps) || 0));
    const thisBest = Math.max(0, ...thisWeekLifts.filter(l => classifyLift(l.exercise || '') === cat).map(l => estimate1RM(l.kg, l.reps) || 0));
    return thisBest > priorBest && thisBest > 0;
  });

  // Phase 8 — structured sections, computed deterministically (no Gemini
  // involved) alongside the narrative below. See weeklyReview.js for the
  // pure math/formatting; this just extracts the right series per goal
  // metric from the raw db shapes.
  const todayISO = day();
  const goalCheck = (db.profile?.goals || []).map(g => {
    if (!g.concrete || g.metric === 'benchmark') return formatGoalLine(g, null, todayISO);
    let series = [];
    if (g.metric === 'weight') {
      series = Object.entries(db.weight).map(([date, value]) => ({ date, value }));
    } else if (g.metric === 'bodyFat') {
      series = Object.keys(db.metrics).filter(k => db.metrics[k].body_fat_percentage != null)
        .map(k => ({ date: k, value: db.metrics[k].body_fat_percentage }));
    } else if (g.metric === 'lift') {
      const wanted = (g.exercise || '').toLowerCase();
      const bestByDate = {};
      for (const l of db.lifts) {
        if ((l.exercise || '').toLowerCase() !== wanted) continue;
        const est = estimate1RM(l.kg, l.reps);
        if (est == null) continue;
        bestByDate[l.date] = Math.max(bestByDate[l.date] || 0, est);
      }
      series = Object.entries(bestByDate).map(([date, value]) => ({ date, value }));
    } else if (g.metric === 'rhr') {
      series = Object.keys(db.metrics).filter(k => db.metrics[k].resting_heart_rate != null)
        .map(k => ({ date: k, value: db.metrics[k].resting_heart_rate }));
    } else if (g.metric === 'vo2max') {
      series = Object.keys(db.metrics).filter(k => db.metrics[k].vo2max != null)
        .map(k => ({ date: k, value: db.metrics[k].vo2max }));
    } else if (g.metric === 'ffm' || g.metric === 'ffmi') {
      const heightCm = db.profile?.heightCm;
      if (heightCm) {
        series = Object.keys(db.weight).filter(k => db.metrics[k]?.body_fat_percentage != null)
          .map(k => ({
            date: k,
            value: g.metric === 'ffm'
              ? ffm(db.weight[k], db.metrics[k].body_fat_percentage)
              : ffmi(db.weight[k], db.metrics[k].body_fat_percentage, heightCm),
          }));
      }
    }
    const progress = projectGoal(series, g.target, todayISO);
    return formatGoalLine(g, progress, todayISO);
  });

  const workingAttention = bucketWorkingAttention({
    sessionsThis: thisWeekWorkouts.length, sessionsLast: lastWeekWorkouts.length,
    volThis: thisVol, volLast: lastVol,
    recoveryThis: avgRecoveryThis, recoveryLast: avgRecoveryLast,
    sleepThis: avgSleepThis, sleepTarget: sleepT.target,
    nutritionDaysLogged: nutritionKeysThis.length, prCount: prLifts.length,
  });

  // Same fatigue functions the morning briefing already calls (fatigue.js) —
  // newly wired in here too, no new engine. Muscle/CNS/metabolic fatigue are
  // current-moment snapshots (nothing stores them historically), so they
  // contextualize the recovery trend rather than being a trend themselves.
  const weeklyMusclePeaks = musclePeaksFromLifts(db.lifts || []);
  const currentFatigue = computeCurrentFatigueScores(db.lifts || [], weeklyMusclePeaks, db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile, activeCycleFactor(db)));
  const topFatigued = Object.entries(currentFatigue).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m, v]) => `${m} ${Math.round(v)}%`);
  const fatigueTrend = {
    recoveryThisWeek: avgRecoveryThis != null ? Math.round(avgRecoveryThis) : null,
    recoveryLastWeek: avgRecoveryLast != null ? Math.round(avgRecoveryLast) : null,
    topFatigued,
    cns: computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0, getRecoveryScore(db)),
    metabolic: computeMetabolicFatigue(db.lifts || [], (db.nutrition || {})[todayISO]?.carbs || 0),
  };
  // Not woven into the LLM prompt below — this generator's prompt doesn't
  // narrate fatigue numbers as text at all (unlike the morning briefing/
  // newscast), it's display-only data for the frontend, same as fatigueTrend.
  const cycleInfo = db.profile?.cycleTrackingEnabled && (db.cycle || []).length ? cyclePhaseFactor(db.cycle, Date.now(), db.profile?.cycleIrregular, db.profile?.cycleHeavinessLearned) : null;

  const prompt = `You are generating a Weekly Review for a personal health app called Press — a week-over-week digest, not a single-day report. Same editorial voices as the daily editions — V (health editor, cool newspaper prose, no hand-holding) and Atlas (training analyst, methodical, science-grounded).

This week vs. last week:
- Sessions: ${thisWeekWorkouts.length} this week vs ${lastWeekWorkouts.length} last week
- Lift volume: ${thisVol}kg total this week vs ${lastVol}kg last week
- Avg recovery: ${avgRecoveryThis != null ? Math.round(avgRecoveryThis) + '%' : 'no data'} this week vs ${avgRecoveryLast != null ? Math.round(avgRecoveryLast) + '%' : 'no data'} last week
- Avg sleep: ${avgSleepThis != null ? avgSleepThis.toFixed(1) + 'h' : 'no data'} this week vs ${avgSleepLast != null ? avgSleepLast.toFixed(1) + 'h' : 'no data'} last week (target ${sleepT.target}h)
- Nutrition: logged ${nutritionKeysThis.length}/7 days, avg ${avgCalThis ? Math.round(avgCalThis) : '—'}kcal / ${avgProteinThis ? Math.round(avgProteinThis) : '—'}g protein (target ${macroTargets.calories}kcal / ${macroTargets.protein}g)
- Weight: ${weightStart && weightEnd ? `${weightStart}kg → ${weightEnd}kg` : 'not enough data'}
- New strength PRs this week: ${prLifts.length ? prLifts.join(', ') : 'none'}

Return ONLY valid JSON:
{
  "headline": "HEADLINE IN CAPS — MAX 55 CHARS",
  "subheading": "One sharp sentence on how the week went overall.",
  "pullQuote": "One standalone, quotable sentence pulled from the week's most important thread — not a repeat of the headline or subheading.",
  "bullets": { "numbers": [{"label": "Sessions", "value": "${thisWeekWorkouts.length}"}, {"label": "Volume", "value": "${thisVol}kg"}, {"label": "Avg Recovery", "value": "${avgRecoveryThis != null ? Math.round(avgRecoveryThis) + '%' : '—'}"}, {"label": "Avg Sleep", "value": "${avgSleepThis != null ? avgSleepThis.toFixed(1) + 'h' : '—'}"}] },
  "v": "Overall verdict on the week — training consistency, recovery trend, nutrition adherence. 2-3 sentences, direct.",
  "atlas": "1-2 sentences from Atlas on training volume/strength trend and ${prLifts.length ? 'the new PR(s)' : 'the absence of new PRs'} this week.",
  "nutritionNote": ${nutritionKeysThis.length < 5 ? '"A single direct sentence noting the nutrition logging gap this week."' : 'null'}
}`;

  const result = await callGeminiResilient({ messages: [{ role: 'user', content: prompt }], maxTokens: 550, jsonMode: true, temperature: 0.75 });
  if (!result.ok) {
    console.error('Gemini weekly review error:', result.status, JSON.stringify(result.error));
    throw new Error(result.error?.message || `Gemini returned ${result.status}`);
  }
  let review;
  try { review = parseGeminiJSON(result.content); } catch (e) { throw new Error('Gemini returned invalid JSON: ' + e.message); }
  review.period = 'week';
  review.generatedAt = new Date().toISOString();
  review.weekStart = cutoffThis;
  review.goalCheck = goalCheck;
  review.workingAttention = workingAttention;
  review.fatigueTrend = fatigueTrend;
  review.cycleInfo = cycleInfo;
  return review;
}

app.get('/weekly-review', async (req, res) => {
  try {
    const cached = db.weeklyReview;
    const twelveHoursAgo = Date.now() - 12 * 3600 * 1000;
    const cutoffThis = day(new Date(Date.now() - 7 * 864e5));
    if (cached?.weekStart === cutoffThis && new Date(cached.generatedAt).getTime() > twelveHoursAgo) {
      return res.json({ review: cached });
    }
    const review = await generateWeeklyReview(db);
    if (!review) return res.json({ review: null });
    db.weeklyReview = review;
    await save();
    res.json({ review });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/newscast', async (req, res) => {
  try {
    const period = req.query.period === 'night' ? 'night' : 'afternoon';
    const cached = db[`${period}Newscast`];
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    if (cached?.date === day() && new Date(cached.generatedAt).getTime() > twoHoursAgo) {
      return res.json({ newscast: cached });
    }
    const newscast = await generateNewscast(db, period);
    if (!newscast) return res.json({ newscast: null });
    db[`${period}Newscast`] = newscast;
    await save();
    res.json({ newscast });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/briefing', async (req, res) => {
  res.json({ briefing: db.todayBriefing || null });
});

app.post('/briefing/generate', async (req, res) => {
  try {
    const briefing = await generateMorningBriefing(db);
    if (!briefing) return res.status(400).json({ error: 'GEMINI_API_KEY not configured or Gemini request failed' });
    db.todayBriefing = briefing;
    await save();
    res.json({ briefing });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Setup page ----------
app.get("/setup", (req, res) => {
  const syncUrl = `https://europe-west2-pressnewsletter.cloudfunctions.net/api/shortcut`;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Press — Apple Health Setup</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#f5f0e2;--ink:#0d0b08;--gold:#6b5800;--dim:#8a7a5c;--rule:#c4b898}
body{background:var(--paper);color:var(--ink);font-family:'JetBrains Mono',monospace;max-width:560px;margin:0 auto;padding:48px 24px 64px}
.kicker{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
h1{font-family:'Playfair Display',serif;font-size:32px;font-weight:900;line-height:1.1;margin-bottom:6px}
.sub{font-size:11px;color:var(--dim);line-height:1.7;margin-bottom:32px}
hr{border:none;border-top:2px solid var(--ink);margin:28px 0}
h2{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin-bottom:12px}
.url-box{background:var(--ink);color:var(--paper);padding:14px 16px;font-size:11px;word-break:break-all;line-height:1.6;cursor:pointer;user-select:all;margin-bottom:6px}
.copy-hint{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
ol{padding-left:0;list-style:none;counter-reset:steps}
li{counter-increment:steps;display:flex;gap:14px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:11px;line-height:1.7;align-items:flex-start}
li::before{content:counter(steps);font-family:'Playfair Display',serif;font-size:20px;font-weight:900;color:var(--gold);flex-shrink:0;width:20px;line-height:1}
code{background:rgba(0,0,0,.07);padding:1px 5px;font-size:10px}
strong{font-weight:600}
.note{margin-top:28px;border-left:3px solid var(--gold);padding-left:12px;font-size:10px;color:var(--dim);line-height:1.8}
</style>
</head>
<body>
<div class="kicker">Press — iOS Health Sync</div>
<h1>Apple Health Setup</h1>
<p class="sub">Stream your sleep, HRV, heart rate, and steps into Press automatically every morning via iOS Shortcuts.</p>

<hr>

<h2>Your sync URL</h2>
<div class="url-box" onclick="navigator.clipboard.writeText(this.innerText)">${syncUrl}</div>
<div class="copy-hint">Tap to copy</div>

<hr>

<h2>Shortcut steps</h2>
<ol>
  <li><span>Open <strong>Shortcuts</strong> on your iPhone and tap <strong>Automation</strong></span></li>
  <li><span>Tap <strong>New Automation</strong> → <strong>Time of Day</strong> → set to <strong>8:00 AM, Daily</strong></span></li>
  <li><span>Add action: <strong>Find Health Samples</strong> — type: <strong>Heart Rate Variability</strong>, limit 1 → <strong>Set Variable</strong>: <code>hrv</code></span></li>
  <li><span>Repeat for <strong>Resting Heart Rate</strong> → <code>rhr</code>, <strong>Steps</strong> (today) → <code>steps</code>, <strong>Sleep Analysis</strong> → <code>sleep</code></span></li>
  <li><span>Add action: <strong>Get Contents of URL</strong>. Paste your sync URL above. Method: <strong>POST</strong>, Body: <strong>JSON</strong></span></li>
  <li><span>Add the four keys to the JSON body: <code>hrv</code>, <code>rhr</code>, <code>steps</code>, <code>sleep</code> — set each to the variable from step 3–4</span></li>
  <li><span>Toggle <strong>Run Automatically</strong> on. Done — Press receives your health data every morning.</span></li>
</ol>

<div class="note">
  <strong>Tip:</strong> You can add a second automation at 9 PM for an evening sync — duplicate the shortcut and change the time.
</div>

<div class="note">
  <strong>Optional recovery signals:</strong> Press also folds these into your recovery score if you add them the same way: <code>wrist</code> (Sleep Wrist Temperature, °C), <code>hr</code> (Heart Rate), <code>bloodoxygen</code> (Blood Oxygen Saturation, %). Not required — everything works fine without them.
</div>

<div class="note">
  <strong>Optional sleep score signals:</strong> add any of these for a clinically-benchmarked Sleep Score (duration, efficiency, sleep stages, overnight HR dip, fragmentation) on the Sleep tab — every field is independently optional, the score just uses whatever you provide: <code>deepmin</code> / <code>remmin</code> / <code>coremin</code> (minutes in each Sleep Analysis stage — Deep / REM / Core), <code>awakemin</code> (minutes awake overnight — WASO), <code>sleephr</code> (average Heart Rate sampled only during your sleep window), <code>sleepeff</code> (sleep efficiency %, or send <code>inbed</code> — hours in bed — alongside <code>sleep</code> and Press computes it).
</div>
</body>
</html>`);
});

// ---------- Measurements ----------
app.get('/measurements', async (req, res) => {
  res.json({ measurements: db.measurements || [] });
});

app.post('/measurements', async (req, res) => {
  const { type, value, unit } = req.body;
  if (!type || value == null) return res.status(400).json({ error: 'type and value required' });
  db.measurements = db.measurements || [];
  db.measurements.push({ id: Date.now(), date: day(), type, value: +value, unit: unit || 'cm', ts: Date.now() });
  db.measurements = db.measurements.slice(-500);
  await save();
  res.json({ ok: true });
});

// ---------- Progress photos ----------
// Images live in Cloud Storage, not Firestore (a doc has a 1MB cap and a photo
// history would blow past it fast). Firestore only keeps {id, date, note, path};
// read URLs are signed on demand since a 7-day signed URL is the practical max.
async function signedPhotoUrl(path) {
  try {
    const [url] = await admin.storage().bucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 3600 * 1000 });
    return url;
  } catch (e) {
    console.error('[photos] signed URL failed:', e.message);
    return null;
  }
}

app.post('/photos', async (req, res) => {
  const { image, note } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });
  const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = mimeType.split('/')[1] || 'jpg';
  const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const id = Date.now();
  const path = `progress-photos/${req.uid}/${id}.${ext}`;
  try {
    await admin.storage().bucket().file(path).save(buffer, { metadata: { contentType: mimeType } });
  } catch (e) {
    return res.status(500).json({ error: 'upload failed: ' + e.message });
  }
  db.photos = db.photos || [];
  db.photos.push({ id, date: day(), note: note || '', path });
  db.photos = db.photos.slice(-200);
  await save();
  res.json({ ok: true, id, url: await signedPhotoUrl(path) });
});

app.delete('/photos/:id', async (req, res) => {
  db.photos = db.photos || [];
  const idx = db.photos.findIndex(p => String(p.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [photo] = db.photos.splice(idx, 1);
  await save();
  try { await admin.storage().bucket().file(photo.path).delete(); } catch (e) { console.error('[photos] delete failed:', e.message); }
  res.json({ ok: true });
});

// ---------- Supplements ----------
app.get('/supplements', async (req, res) => {
  res.json({ supplements: db.supplements || [] });
});

app.post('/supplements', async (req, res) => {
  const { name, dose, timing, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.supplements = db.supplements || [];
  const existing = db.supplements.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  const entry = { name, dose: dose || '', timing: timing || 'morning', notes: notes || '' };
  if (existing >= 0) db.supplements[existing] = entry;
  else db.supplements.push(entry);
  await save();
  res.json({ ok: true });
});

app.delete('/supplements/:name', async (req, res) => {
  db.supplements = (db.supplements || []).filter(s => s.name !== decodeURIComponent(req.params.name));
  await save();
  res.json({ ok: true });
});

app.post('/supplement/log', async (req, res) => {
  const { name, dose } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const k = day();
  db.supplementLog = db.supplementLog || [];
  const existing = db.supplementLog.findIndex(e => e.date === k && e.name === name);
  if (existing >= 0) {
    db.supplementLog.splice(existing, 1);
    await save();
    return res.json({ ok: true, logged: false });
  }
  db.supplementLog.push({ date: k, name, dose: dose || '', ts: Date.now() });
  db.supplementLog = db.supplementLog.slice(-1000);
  await save();
  res.json({ ok: true, logged: true });
});

app.get('/supplement/log', async (req, res) => {
  const k = day();
  res.json({ log: (db.supplementLog || []).filter(e => e.date === k) });
});

// ---------- Alcohol (manual log) ----------
app.post('/alcohol', async (req, res) => {
  const { units, date: reqDate } = req.body;
  if (units == null) return res.status(400).json({ error: 'units required' });
  const k = reqDate ? reqDate.slice(0, 10) : day();
  db.alcoholLog = db.alcoholLog || [];
  const existing = db.alcoholLog.findIndex(e => e.date === k);
  if (existing >= 0) db.alcoholLog[existing].units = +units;
  else if (+units > 0) db.alcoholLog.push({ date: k, units: +units, ts: Date.now() });
  await save();
  res.json({ ok: true, ...alcoholStats(db.alcoholLog) });
});

// ---------- Experiments ----------
app.get('/experiments', async (req, res) => {
  res.json({ experiments: db.experiments || [] });
});

app.post('/experiments', async (req, res) => {
  const { hypothesis, startDate, endDate, metric, notes } = req.body;
  if (!hypothesis) return res.status(400).json({ error: 'hypothesis required' });
  db.experiments = db.experiments || [];
  const id = Date.now();
  db.experiments.push({
    id, hypothesis,
    startDate: startDate || day(),
    endDate: endDate || null,
    metric: metric || '',
    notes: notes || '',
    active: true,
    outcome: null,
    concludedAt: null,
  });
  await save();
  res.json({ ok: true, id });
});

app.post('/experiments/:id/conclude', async (req, res) => {
  const id = +req.params.id;
  const exp = (db.experiments || []).find(e => e.id === id);
  if (!exp) return res.status(404).json({ error: 'not found' });
  exp.active = false;
  exp.outcome = req.body.outcome || 'concluded';
  exp.concludedAt = Date.now();
  await save();
  res.json({ ok: true });
});

app.delete('/experiments/:id', async (req, res) => {
  db.experiments = (db.experiments || []).filter(e => e.id !== +req.params.id);
  await save();
  res.json({ ok: true });
});

// ---------- Travel mode ----------
app.post('/travel-mode', async (req, res) => {
  const { enabled } = req.body;
  db.profile = { ...(db.profile || {}), travelMode: !!enabled };
  await save();
  res.json({ ok: true, travelMode: !!enabled });
});

// ---------- Exercise Stats for Picker ----------
// Computes frequency and recency stats from lifts for the exercise picker UI
// Returns recent exercises, frequency by time window, and in-session indicators
app.get('/exercise-stats', (req, res) => {
  const { timeWindow = '30d', sessionDate = null } = req.query;
  const lifts = db.lifts || [];
  if (!lifts.length) return res.json({ recent: [], frequent: [], today: [] });

  // Parse time window
  const now = new Date();
  let daysBack = 30;
  if (timeWindow === '6m') daysBack = 180;
  else if (timeWindow === '1y') daysBack = 365;
  else if (timeWindow === 'all') daysBack = 999999;

  const cutoffDate = new Date(now.getTime() - daysBack * 86400000);

  // Group lifts by exercise name, tracking recency and frequency
  const stats = {};
  lifts.forEach(lift => {
    if (!lift.exercise) return;
    const name = lift.exercise;
    if (!stats[name]) stats[name] = { count: 0, lastUsedAt: null, lastSet: null };
    stats[name].count++;
    const liftDate = new Date(lift.date + 'T00:00:00Z');
    if (!stats[name].lastUsedAt || liftDate > new Date(stats[name].lastUsedAt)) {
      stats[name].lastUsedAt = liftDate.toISOString();
      stats[name].lastSet = { kg: lift.kg, reps: lift.reps, rpe: lift.rpe };
    }
  });

  // Compute recent (last 30 days) — all exercises, sorted by date desc
  const recentLimit = new Date(now.getTime() - 30 * 86400000);
  const recent = lifts
    .filter(l => l.exercise && new Date(l.date + 'T00:00:00Z') >= recentLimit)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .reduce((acc, l) => {
      if (!acc.find(e => e.name === l.exercise)) {
        const s = stats[l.exercise];
        acc.push({ name: l.exercise, lastUsedAt: s.lastUsedAt, lastSet: s.lastSet });
      }
      return acc;
    }, []);

  // Compute frequent (time-windowed) — sorted by count desc
  const frequent = Object.entries(stats)
    .filter(([_, s]) => s.lastUsedAt && new Date(s.lastUsedAt) >= cutoffDate)
    .map(([name, s]) => ({ name, count: s.count, lastUsedAt: s.lastUsedAt, lastSet: s.lastSet }))
    .sort((a, b) => b.count - a.count || new Date(b.lastUsedAt) - new Date(a.lastUsedAt));

  // Exercises already logged in the given session date (for in-session indicator)
  const today = sessionDate
    ? [...new Set(lifts.filter(l => l.date === sessionDate && l.exercise).map(l => l.exercise))]
    : [];

  res.json({ recent, frequent, today });
});

exports.api = functions.region("europe-west2").runWith({ timeoutSeconds: 300, memory: "256MB", invoker: "public" }).https.onRequest(app);
