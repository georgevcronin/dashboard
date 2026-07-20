const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const webpush = require("web-push");
const { EXERCISE_DB, EXERCISE_MAP } = require('./exerciseDb');
const { isCompoundExercise, findExercise } = require('./muscleTaxonomy');
const { generateWeeklyGuidance, pickBackboneExercises, computeMusclePriority, scoreBucket, MUSCLE_GROUPS } = require('./weeklyPlanner');
const { computeMuscleLevels, classifyLift, estimate1RM } = require('./strengthStandards');
const { loadAllLifts, appendLifts, removeLiftsAndAppend } = require('./liftChunks');
const { DEFAULTS, loadForUserDoc, saveDocExcludingLifts } = require('./userDoc');
const { computeProgression } = require('./progression');
const { generateSessionExercises, progressionFor, isLowRepPattern, LOW_REP_THRESHOLD } = require('./sessionPlanner');
const { computeSleepScore } = require('./sleepScore');
const { callGeminiResilient, parseGeminiJSON } = require('./gemini');
const { unwrapShortcutBody, average, sum, computeSleepMetrics } = require('./shortcutParsing');

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
  computeACWR, computePerformanceTrend, computeMetabolicFatigue, computeCNSFatigue,
  computeMuscleLastTrainedDays, computeCompoundIsolationSplit,
} = require('./fatigue');
const { personalizedRecoveryHours, trainingMonthsIfKnown } = require('./recoveryPersonalization');
const { alcoholStats, computeDataMaturity, compVerdict, toCsv, weekLiftSessionsCompleted } = require('./analytics');

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
app.get('/me', (req, res) => res.json({ uid: req.uid || null }));

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
  for (const w of d.workouts || []) {
    const k = day(w.start || w.date);
    if (!db.workouts.find((x) => x.date === k && x.name === w.name && x.start === w.start)) {
      const rawKcal = w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? null;
      const unit = w.activeEnergyBurned?.units ?? w.activeEnergy?.units ?? "kcal";
      const kcal = rawKcal != null ? Math.round(unit === "kJ" ? rawKcal / 4.184 : rawKcal) : null;
      db.workouts.push({ date: k, name: w.name, start: w.start, duration: w.duration, kcal });
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
  const hrv = average(d.hrv_values);
  if (hrv != null) db.metrics[k].heart_rate_variability = Math.round(hrv);
  const rhr = average(d.rhr_values);
  if (rhr != null) db.metrics[k].resting_heart_rate = Math.round(rhr);
  // step_count is stored in thousands (the frontend does `steps * 1000` to
  // display the real count — matches the existing /health Health Auto
  // Export convention), not a raw absolute step total.
  const stepCount = sum(d.steps_values);
  if (stepCount != null) db.metrics[k].step_count = stepCount / 1000;
  const wrist = average(d.wrist_values);
  if (wrist != null) db.metrics[k].wrist_temperature = Math.round(wrist * 10) / 10;
  const hr = average(d.hr_values);
  if (hr != null) db.metrics[k].heart_rate = Math.round(hr);
  const bloodOxygen = average(d.bloodoxygen_values);
  if (bloodOxygen != null) db.metrics[k].blood_oxygen = Math.round(bloodOxygen);
  if (d.weight) { db.metrics[k].body_mass = d.weight; db.weight[k] = d.weight; }
  if (d.vo2max) db.metrics[k].vo2max = d.vo2max;
  if (d.hrr_bpm) db.metrics[k].hrr_bpm = d.hrr_bpm;
  // Sleep: total asleep hours, WASO, and efficiency all derived from the
  // same start/end/type triple — see shortcutParsing.js's computeSleepMetrics
  // for why (In Bed vs. Awake vs. genuine sleep-stage segments).
  const { asleepHours, wasoMin, sleepEff } = computeSleepMetrics(d.sleep_start, d.sleep_end, d.sleep_types);
  if (asleepHours != null) db.metrics[k].sleep_hours = asleepHours;
  if (wasoMin != null) db.metrics[k].waso_min = wasoMin;
  if (sleepEff != null) db.metrics[k].sleep_eff = sleepEff;
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
    for (const w of d.workouts) {
      // Each workout can carry its own date for bulk/historical uploads
      const wDate = w.date ? w.date.slice(0, 10) : k;
      const name = (w.name || "workout").toLowerCase();
      const dur = w.minutes || 0;
      if (!db.workouts.find(x => x.date === wDate && x.name === name && x.duration === dur)) {
        db.workouts.push({ date: wDate, name, duration: dur, kcal: w.calories || null, source: "shortcut" });
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
  try {
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
  } catch (e) {
    console.error('[briefing] generation failed:', e);
  }

  res.json({ ok: true, date: k });
});

// ---------- Hevy helpers ----------
function hevyKey() {
  return process.env.HEVY_API_KEY || functions.config().hevy?.key;
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
  // Hevy sends UTC timestamps with no local-time field, unlike Strava (see
  // ingestActivity below). Slicing the UTC string directly took the UTC
  // calendar date, which is wrong by a day for a workout logged near
  // midnight in the athlete's actual timezone — not just a display glitch,
  // since this date becomes the stored key everywhere downstream (fatigue
  // decay timing, weekly session counts, history).
  const wDate = utcToAppLocalDateStr(w.start_time || w.created_at);
  if (!wDate) return 0;

  // Add workout entry so it appears in workout history and fatigue model
  const wTitle = (w.title || "gym").toLowerCase();
  if (!db.workouts.find(x => x.source === "hevy" && x.date === wDate && x.name === wTitle)) {
    const startMs = w.start_time ? new Date(w.start_time).getTime() : 0;
    const endMs = w.end_time ? new Date(w.end_time).getTime() : 0;
    const duration = startMs && endMs ? Math.round((endMs - startMs) / 60000) : null;
    db.workouts.push({ date: wDate, name: wTitle, duration, kcal: null, source: "hevy" });
  }

  // Collected and appended to the liftChunks subcollection in one batch at
  // the end rather than pushed to db.lifts one at a time — lifts no longer
  // live embedded in this document (see liftChunks.js), so each new entry
  // needs an actual Firestore write, not just an in-memory array mutation.
  const newEntries = [];
  for (const ex of (w.exercises || [])) {
    const name = (ex.title || ex.name || "").toLowerCase();
    if (!name) continue;
    for (const set of (ex.sets || [])) {
      if (set.set_type === "warmup") continue;
      const kg = set.weight_kg ?? (set.weight_lbs ? set.weight_lbs / 2.20462 : 0);
      const reps = set.reps || 0;
      // Deduplicate against all lifts regardless of source
      const isDupe = db.lifts.find(l => l.date === wDate && l.exercise === name && Math.abs((l.kg || 0) - kg) < 0.1 && l.reps === reps);
      if (!isDupe && (kg > 0 || reps > 0)) {
        const entry = { date: wDate, exercise: name, kg: Math.round(kg * 100) / 100, reps, source: "hevy" };
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
    if (totalAdded) await save();
    res.json({ ok: true, workouts: totalWorkouts, added: totalAdded });
  } catch (e) {
    console.log("[hevy] backfill failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------- CSV import ----------
app.post("/import", async (req, res) => {
  const { lifts = [], weights = {}, workouts = [] } = req.body;
  let addedLifts = 0, addedWeights = 0, addedWorkouts = 0;
  for (const w of workouts) {
    if (!w.date || !w.name) continue;
    const isDupe = (db.workouts || []).find(x => x.date === w.date && x.name === w.name && x.source === "hevy");
    if (!isDupe) { db.workouts = db.workouts || []; db.workouts.push({ date: w.date, name: w.name, duration: w.duration || null, kcal: w.kcal || null, source: "hevy" }); addedWorkouts++; }
  }
  const newLiftEntries = [];
  for (const l of lifts) {
    if (!l.date || !l.exercise) continue;
    const isDupe = db.lifts.find(x => x.date === l.date && x.exercise === l.exercise && Math.abs((x.kg || 0) - (l.kg || 0)) < 0.1 && x.reps === l.reps);
    if (!isDupe) { const e = { date: l.date, exercise: l.exercise, kg: l.kg || 0, reps: l.reps || 0, source: "hevy" }; if (l.rir != null) e.rir = l.rir; newLiftEntries.push(e); addedLifts++; }
  }
  for (const [date, kg] of Object.entries(weights)) {
    if (kg && !db.weight[date]) { db.weight[date] = kg; addedWeights++; }
  }
  if (newLiftEntries.length) {
    registerUnknownExercisesAsCustom(newLiftEntries.map(e => e.exercise));
    await appendLifts(liftsDocRef, newLiftEntries);
    db.lifts.push(...newLiftEntries);
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
  // Strava provides start_date_local specifically so consumers don't have to
  // do UTC-to-local conversion themselves — it carries the athlete's actual
  // local wall-clock time (mislabeled with a "Z" suffix, so just slice the
  // date portion directly rather than running it through a timezone
  // conversion, which would incorrectly shift it a second time). Falls back
  // to start_date (true UTC) only if Strava ever omits the local field.
  const date = (a.start_date_local || a.start_date || "").slice(0, 10);
  if (!date) return;
  const name = (a.sport_type || a.type || "workout").toLowerCase().replace(/_/g, " ");
  const duration = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
  const kcal = a.kilojoules ? Math.round(a.kilojoules * 0.239) : null;
  if (!db.workouts.find(w => w.source === "strava" && w.stravaId === a.id)) {
    db.workouts.push({ date, name, duration, kcal, source: "strava", stravaId: a.id });
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
function personalSleepTarget(days) {
  const paired = days.filter((d) => d.heart_rate_variability && d.sleep_hours);
  if (paired.length < 7) return { target: 8, learned: false };
  const sorted = [...paired].sort((a, b) => b.heart_rate_variability - a.heart_rate_variability);
  const top = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 4)));
  const t = avg(top.map((d) => d.sleep_hours));
  return { target: Math.min(9.5, Math.max(6.5, Math.round(t * 10) / 10)), learned: true };
}
function computeDay(d, baseHRV, baseRHR, sleepTarget, baseWristTemp, baseHR) {
  const hrv = d.heart_rate_variability, rhr = d.resting_heart_rate, sleepH = d.sleep_hours;
  const wristTemp = d.wrist_temperature, hr = d.heart_rate, spo2 = d.blood_oxygen;
  if (!hrv || !baseHRV) return null;
  const hrvScore = Math.max(0, Math.min(1, hrv / baseHRV - 0.5));
  const rhrScore = rhr && baseRHR ? Math.max(0, Math.min(1, 1 - (rhr / baseRHR - 1) * 5)) : 0.8;
  const sleepScore = sleepH ? Math.min(1, sleepH / sleepTarget) : 0.8;
  // Wrist skin temperature deviation from personal baseline — elevated temp is a
  // well-established illness/overreaching signal, penalized more steeply than a
  // below-baseline reading.
  const tempDev = wristTemp != null && baseWristTemp != null ? wristTemp - baseWristTemp : null;
  const wristScore = tempDev == null ? 0.8 : tempDev <= 0
    ? Math.max(0.5, 1 - Math.abs(tempDev) * 0.15)
    : Math.max(0, 1 - tempDev * 0.4);
  // Blood oxygen saturation — healthy range is ~96-100%; below that increasingly
  // signals poor sleep quality or respiratory strain.
  const spo2Score = spo2 != null ? Math.max(0, Math.min(1, (spo2 - 90) / 8)) : 0.8;
  // Current/instant heart rate vs. personal baseline — noisier than true resting HR
  // since it depends on activity at sampling time, so weighted lightly.
  const hrScore = hr && baseHR ? Math.max(0, Math.min(1, 1 - (hr / baseHR - 1) * 3)) : 0.8;
  return Math.round(Math.min(99, (hrvScore * 0.40 + rhrScore * 0.15 + sleepScore * 0.20 + wristScore * 0.10 + spo2Score * 0.10 + hrScore * 0.05) * 100));
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
  const recoveryTrend = last14.map(d => computeDay(d, baseHRV, baseRHR, sleep.target, baseWristTemp, baseHR)).filter(x => x != null);
  const sleepScore = computeSleepScore(today);
  const sleepScoreTrend = last14.map(d => computeSleepScore(d)?.score).filter(v => v != null);
  const weights = lastN(db.weight, 30);
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
  res.json({
    profile: db.profile, hydrationCurve, hydrationNow: hydrationCurve.at(-1) ?? null,
    liftVolume,
    today: { recovery, hrv: today.heart_rate_variability ?? null, rhr: today.resting_heart_rate ?? null, sleepH: today.sleep_hours ?? null, sleepEff: today.sleep_eff ?? null, steps: today.step_count ?? null, wristTemp: today.wrist_temperature ?? null, hr: today.heart_rate ?? null, spo2: today.blood_oxygen ?? null },
    sleepTarget: sleep.target, sleepTargetLearned: sleep.learned,
    sleepDebtH: Math.round(sleepDebtH * 10) / 10,
    sleepScore, sleepScoreTrend,
    recoveryTrend, sleepSeries: last14.map(d => d.sleep_hours).filter(Boolean),
    rhrSeries: last14.map(d => d.resting_heart_rate).filter(Boolean),
    baselines: { hrv: baseHRV && Math.round(baseHRV), rhr: baseRHR && Math.round(baseRHR), wristTemp: baseWristTemp && Math.round(baseWristTemp * 10) / 10, hr: baseHR && Math.round(baseHR) },
    composition: compVerdict(weights, db.lifts),
    waterStats: { streak, avg: waterDays.length ? Math.round(avg(waterDays) * 10) / 10 : 0, hitRate: waterDays.length ? Math.round((waterDays.filter(v => v >= target).length / waterDays.length) * 100) : 0, best: waterDays.length ? Math.max(...waterDays) : 0 },
    musclePeaks: musclePeaksFromLifts(db.lifts),
    injuries: (db.injuries || []).filter(i => !i.resolved).map(i => ({
      ...i,
      healingDays: INJURY_HEALING_DAYS[i.severity] || INJURY_HEALING_DAYS.moderate,
      elapsedDays: Math.floor((Date.now() - i.ts) / 864e5),
      clearance: Math.round(100 - injuryFatiguePenalty(i)),
    })),
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
    vo2maxSeries, hrrSeries,
    measurements: (db.measurements || []).slice(-30),
    supplements: db.supplements || [],
    supplementLogToday: (db.supplementLog || []).filter(e => e.date === day()),
    photosMeta,
    experiments: (db.experiments || []),
    travelMode: db.profile?.travelMode || false,
    dataMaturity: computeDataMaturity(db.lifts),
    muscleLevels: computeMuscleLevels(db.lifts, db.weight, weights.at(-1)?.value ?? Object.values(db.weight).at(-1), db.profile?.sex, fatigueTimeline(db.lifts, musclePeaksFromLifts(db.lifts))),
  });
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
app.post("/nutrition", async (req, res) => {
  const k = day(); db.nutrition = db.nutrition || {};
  db.nutrition[k] = db.nutrition[k] || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const m of ["protein", "carbs", "fat", "calories"]) db.nutrition[k][m] = (db.nutrition[k][m] || 0) + (req.body[m] || 0);
  db.nutritionLog = db.nutritionLog || [];
  if (req.body.label) db.nutritionLog.push({
    date: k, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    label: req.body.label, protein: req.body.protein || 0, carbs: req.body.carbs || 0, fat: req.body.fat || 0, calories: req.body.calories || 0,
    ...(req.body.description?.trim() ? { description: req.body.description.trim() } : {}),
  });
  await save(); res.json(db.nutrition[k]);
});
app.post("/nutrition/analyze", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
  const { imageBase64, mode } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const labelPrompt = 'Read this nutrition label precisely. Return ONLY valid JSON: {"description":"product name","calories":0,"protein":0,"carbs":0,"fat":0}. Use per-serving values. All numbers as integers.';
  const mealPrompt = 'Analyse this meal photo. Estimate nutritional content for the whole plate. Return ONLY valid JSON: {"description":"brief meal description","calories":0,"protein":0,"carbs":0,"fat":0}. All numbers as integers.';
  const promptText = mode === 'label' ? labelPrompt : mealPrompt;
  const result = await callGeminiResilient({
    messages: [{ role: 'user', content: promptText }],
    image: { mimeType, data: rawBase64 },
    maxTokens: 300,
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
  const cals = Math.round(bw * (mult[goal] || 26)), protein = Math.round(bw * (protMult[goal] || 2.0));
  const fat = Math.round(bw * 1), carbs = Math.round(Math.max(0, (cals - fat * 9 - protein * 4) / 4));
  db.profile.macroTargets = { calories: cals, protein, carbs, fat }; db.profile.macroMode = "auto";
  await save(); res.json({ goal, targets: db.profile.macroTargets });
});
app.post("/thought", async (req, res) => { db.thoughts.push({ date: day(), text: req.body.text }); await save(); res.json({ ok: true }); });
app.post("/profile", async (req, res) => {
  const body = { ...req.body };
  // Stamped server-side, never trusting a client-sent timestamp — reset
  // whenever the reported figure changes so it starts accruing fresh from
  // the corrected value.
  if (body.trainingExperienceYears != null) body.trainingExperienceSetAt = new Date().toISOString();
  db.profile = { ...db.profile, ...body };
  await save();
  res.json(db.profile);
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

app.post("/mentor", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.json({ reply: "Add GEMINI_API_KEY to functions/.env to enable the Personal Journalist." });
  const s = db;
  const recentWeights = Object.fromEntries(Object.entries(s.weight || {}).slice(-14));
  const system = "You are Personal Journalist, " + (s.profile?.name || "the user") + "'s personal peak-performance coach. Be direct, concise (2-4 short sentences). No greeting, no self-introduction, no restating who you are — answer the question directly, every time, including the first message of a conversation. " + TRAINING_ETHOS + " Live data: " + JSON.stringify({ recovery: s.metrics, weights: recentWeights, lifts: s.lifts?.slice(-10), water: s.water, workouts: s.workouts?.slice(-5), thoughts: s.thoughts?.slice(-5) });
  const recentMessages = req.body.messages.slice(-10);

  const mentorMessages = [{ role: "system", content: system }, ...recentMessages];
  const result = await callGeminiResilient({ messages: mentorMessages, maxTokens: 700 });
  if (result.ok) return res.json({ reply: result.content });
  console.error("Gemini mentor error:", result.status, JSON.stringify(result.error));
  res.json({ reply: "Personal Journalist error: " + (result.error?.message || `Gemini returned ${result.status}`) });
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
app.post("/plan/session-exercises", async (req, res) => {
  const { type = 'lift', bucket: reqBucket } = req.body;
  let { targetMuscles, backboneExercises } = req.body;
  const lifts = db.lifts || [];

  const peaks = musclePeaksFromLifts(lifts);
  const structuralFatigue = computeStructuralFatigue(lifts, peaks, db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile));
  const activeInjuries = (db.injuries || []).filter(i => !i.resolved);
  const currentFatigue = applyInjuryTaper(structuralFatigue, activeInjuries);
  const metabolicFatigue = computeMetabolicFatigue(lifts, (db.nutrition || {})[day()]?.carbs || 0);
  const cnsFatigue = computeCNSFatigue(lifts, db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const avoidMuscles = Object.entries(currentFatigue).filter(([,v])=>v>65).map(([m])=>m);
  const offlineMuscles = avoidMuscles.filter(m => activeInjuries.some(i => (i.muscles || []).includes(m)));
  const travelMode = db.profile?.travelMode || false;
  const trainingMonths = trainingMonthsIfKnown(db.profile);
  // Self-reported at onboarding — a real anchor for a brand-new account with
  // no lift history yet; see weeklyPlanner.js's FAVORITE_EXERCISE_BONUS for
  // why it's weighted lower than genuinely logged history.
  const favoriteExercises = db.profile?.trainingBackground?.favoriteExercises || [];

  if (type === 'lift' && !targetMuscles?.length && !reqBucket) {
    const muscleLastTrainedDays = computeMuscleLastTrainedDays(lifts);
    const priority = computeMusclePriority(currentFatigue, offlineMuscles, muscleLastTrainedDays);
    const bucketPicks = Object.entries(MUSCLE_GROUPS)
      .map(([name, muscles]) => {
        const avail = muscles.filter(m => priority[m] >= 0);
        if (!avail.length) return null;
        const topMuscle = [...avail].sort((a, b) => priority[b] - priority[a])[0];
        return { name, muscle: topMuscle };
      })
      .filter(Boolean);

    targetMuscles = bucketPicks.map(p => p.muscle);
    // 2 exercises per bucket, matching the pre-full-body single-bucket
    // session's total count — but the 2nd slot's type (another compound vs.
    // an isolation accessory) follows whichever the athlete has actually
    // favored over the last 90 days (computeCompoundIsolationSplit), not a
    // fixed ratio: "continue doing what you already do." No history (new
    // athlete, or a tie) defaults to compound, matching pickBackboneExercises'
    // "compound-first" ethos above. Never two exercises of the *same
    // function* though — pickBackboneExercises/pickAccessories both skip a
    // candidate that shares pattern + an overlapping primary muscle with
    // something already picked (e.g. won't pair Overhead Press with Machine
    // Shoulder Press), so a 2nd same-muscle slot is always genuinely
    // different work, not a redundant duplicate.
    const split = computeCompoundIsolationSplit(lifts);
    const isolationLeaning = split.isolation > split.compound;
    const exercises = bucketPicks.flatMap(({ muscle }) => {
      const backbone = pickBackboneExercises([muscle], { travelMode, lifts, favoriteExercises, count: isolationLeaning ? 1 : 2 }).map(e => e.name);
      return generateSessionExercises({
        type, targetMuscles: [muscle], backboneExerciseNames: backbone, lifts, travelMode,
        avoidMuscles, offlineMuscles, cnsFatigue, metabolicFatigue, trainingMonths, favoriteExercises,
        accessoryCountOverride: isolationLeaning ? 1 : 0, isolationOnly: isolationLeaning,
      });
    });
    return res.json({ exercises, targetMuscles, backboneExercises: exercises.map(e => e.name), bucket: 'full body' });
  }

  let bucket = reqBucket || null;

  if (type === 'lift' && !targetMuscles?.length) {
    const priority = computeMusclePriority(currentFatigue, offlineMuscles);
    const buckets = Object.entries(MUSCLE_GROUPS)
      .map(([name, muscles]) => { const scored = scoreBucket(muscles, priority); return scored ? { name, ...scored } : null; })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (buckets.length) { targetMuscles = buckets[0].muscles; bucket = buckets[0].name; }
  }

  if (type === 'lift' && targetMuscles?.length && !backboneExercises?.length) {
    backboneExercises = pickBackboneExercises(targetMuscles, { travelMode, lifts, favoriteExercises }).map(e => e.name);
  }

  const exercises = generateSessionExercises({
    type, targetMuscles, backboneExerciseNames: backboneExercises, lifts, travelMode,
    avoidMuscles, offlineMuscles, cnsFatigue, metabolicFatigue, trainingMonths, favoriteExercises,
  });
  res.json({ exercises, targetMuscles: targetMuscles || [], backboneExercises: backboneExercises || [], bucket });
});

app.get('/progression/:exercise', async (req, res) => {
  // Case-insensitive: lift history is inconsistently cased across ingestion
  // paths (Hevy/session-logging lowercase on write, CSV/bulk-import store
  // whatever casing the source data had), so a raw lowercase-vs-exact-match
  // here silently returned "no history" for anything imported with
  // Title-Case names. progressionFor normalizes both sides before matching.
  const name = decodeURIComponent(req.params.exercise);
  const prog = progressionFor(db.lifts || [], name);
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
  let imported = 0, skipped = 0;
  const newLiftEntries = [];
  for (const session of sessions) {
    const exists = db.workouts.some(w => w.date === session.date && w.name === session.name);
    if (exists) { skipped++; continue; }
    db.workouts.unshift({ date: session.date, name: session.name, duration: session.duration || null, source: 'hevy' });
    for (const ex of (session.exercises || [])) {
      for (const set of (ex.sets || [])) {
        if ((set.kg || 0) > 0 || (set.reps || 0) > 0) {
          newLiftEntries.push({ date: session.date, exercise: ex.name, kg: set.kg || 0, reps: set.reps || 0, source: 'hevy' });
        }
      }
    }
    imported++;
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
    await save();
  } catch (e) {
    console.error('[import/hevy] save failed:', e.message);
    return res.status(500).json({ ok: false, error: 'Save failed: ' + e.message });
  }
  res.json({ ok: true, imported, skipped });
});

// ---------- Weekly guidance (advisory — never a locked day-by-day schedule) ----------
// How many strength sessions this week's fatigue can absorb, and which muscle
// groups are freshest right now. No days, no locked exercises, nothing that
// tells the athlete "today is leg day" — see weeklyPlanner.js's header for why.
function computeWeeklyGuidance() {
  const peaks = musclePeaksFromLifts(db.lifts);
  const structuralFatigue = computeStructuralFatigue(db.lifts, peaks, db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile));
  const currentFatigue = applyInjuryTaper(structuralFatigue, db.injuries || []);
  const weekMetabolic = computeMetabolicFatigue(db.lifts, (db.nutrition || {})[day()]?.carbs || 0);
  const weekCNS = computeCNSFatigue(db.lifts, db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const maturityWeek = computeDataMaturity(db.lifts);
  return generateWeeklyGuidance({
    currentFatigue, weekMetabolic, weekCNS, offlineMuscles: [],
    dataMature: maturityWeek.hasEnoughData,
    trainingPriority: db.profile?.trainingPriority || 'strength',
    muscleLastTrainedDays: computeMuscleLastTrainedDays(db.lifts),
  });
}

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
app.post('/session/complete', async (req, res) => {
  try {
    const { workout, sets = [], customExercises = [] } = req.body;
    if (!workout?.date) return res.status(400).json({ error: 'workout.date required' });

    db.workouts = db.workouts || [];
    const existing = db.workouts.findIndex(w => w.date === workout.date);
    const workoutRecord = { name: workout.name || 'Session', date: workout.date, sets: sets.length };
    if (existing >= 0) db.workouts[existing] = { ...db.workouts[existing], ...workoutRecord };
    else db.workouts.push(workoutRecord);

    // RPE-drift CNS auto-calibration: compare perceived effort on today's big compounds
    // against the CNS fatigue the model predicted walking in (before this session's lifts
    // are added). Higher felt effort than predicted nudges cnsSensitivity up, and vice
    // versa — same gentle 25%-per-log nudge pattern used for muscleSensitivity below.
    const cnsSetsWithRpe = sets.filter(s => s.rpe && isCompoundExercise(s.exercise || ''));
    if (cnsSetsWithRpe.length) {
      const predicted = computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0) / 100;
      if (predicted > 0.05) {
        const felt = avg(cnsSetsWithRpe.map(s => +s.rpe)) / 10;
        const current = db.cnsSensitivity || 1.0;
        db.cnsSensitivity = Math.round(Math.max(0.3, Math.min(3.0, current * Math.pow(felt / predicted, 0.25))) * 100) / 100;
      }
    }

    const newLiftEntries = sets
      .filter(s => s.exercise && s.kg && s.reps)
      .map(s => ({ exercise: s.exercise, kg: +s.kg, reps: +s.reps, rpe: s.rpe || null, date: workout.date, ...(s.machine ? { machine: s.machine } : {}), ...(s.pulleyType ? { pulleyType: s.pulleyType } : {}) }));
    const isReplacedToday = l => l.date === workout.date && sets.some(s => s.exercise === l.exercise);
    await removeLiftsAndAppend(liftsDocRef, isReplacedToday, newLiftEntries);
    db.lifts = db.lifts.filter(l => !isReplacedToday(l));
    db.lifts.push(...newLiftEntries);

    if (customExercises.length) {
      db.customExercises = db.customExercises || [];
      customExercises.forEach(ce => {
        if (!db.customExercises.find(e => e.name === ce.name)) db.customExercises.push(ce);
      });
    }

    await save();

    let atlasSummary = null;
    if (process.env.GEMINI_API_KEY && sets.length > 0) {
      const topSets = sets.slice(0, 8).map(s => `${s.exercise}: ${s.kg}kg × ${s.reps}${s.rpe ? ' @ RPE ' + s.rpe : ''}`).join('\n');
      const profile = db.profile || {};
      // Evaluated on the complete, final session (not just topSets) — if an
      // early low-rep stretch got worked back up to a normal majority by the
      // end, this correctly reads false and Atlas says nothing about it. Only
      // flagged if the pattern held all the way through, i.e. it wasn't
      // addressed intra-session (see the matching WorkoutLogger banner).
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

      // 180 was too tight for "2-3 sentences" covering fatigue accumulation,
      // standout load, and next-priority guidance — Gemini would sometimes
      // still be mid-sentence at the cap, cutting the summary off outright
      // rather than the prompt's own length instruction doing the limiting.
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: prompt }], maxTokens: 300, temperature: 0.7 });
      atlasSummary = result.ok ? result.content.trim() : null;
    }

    res.json({ ok: true, setsLogged: sets.length, atlasSummary });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

  const fatigue = computeCurrentFatigueScores(db.lifts || [], musclePeaksFromLifts(db.lifts || []), db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile));
  const topFatigued = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `${m} ${Math.round(v)}%`).join(', ');

  const briefingFatigue = fatigue;
  const briefingMetabolic = computeMetabolicFatigue(db.lifts || [], (db.nutrition || {})[today]?.carbs || 0);
  const briefingCNS = computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0, getRecoveryScore(db));
  const macroTargets = db.profile?.macroTargets || { protein: 160, calories: 2400 };
  const nutritionNotLogged = !totalCalories && !totalProtein;

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
- CNS fatigue: ${briefingCNS}%
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
  const fatigue = computeCurrentFatigueScores(db.lifts || [], musclePeaksFromLifts(db.lifts || []), db.soreness || [], db.muscleSensitivity || {}, personalizedRecoveryHours(db.profile));
  const topFatigued = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `${m} ${Math.round(v)}%`).join(', ') || 'none';
  const cns = computeCNSFatigue(db.lifts || [], db.cnsSensitivity || 1.0, getRecoveryScore(db));

  const prompt = `You are generating a ${timeLabel} for a personal health app called Press. Same editorial voices as the morning edition — V (health editor, cool newspaper prose, no hand-holding) and Atlas (training analyst, methodical, science-grounded).

Today's data so far:
- Workout: ${todayWorkout ? todayWorkout.name + ' — completed' : 'not yet logged'}
- Nutrition logged: ${nutritionLogged ? `${totalCals}kcal, ${totalProtein}g protein (target: ${macroTargets.calories}kcal, ${macroTargets.protein}g protein)` : 'NOTHING LOGGED'}
- Structural fatigue: ${topFatigued}
- CNS fatigue: ${cns}%
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

exports.api = functions.region("europe-west2").runWith({ timeoutSeconds: 300, memory: "256MB", invoker: "public" }).https.onRequest(app);
