const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const webpush = require("web-push");
const { EXERCISE_DB, EXERCISE_MAP } = require('./exerciseDb');

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

const MUSCLE_MAP_B = {
  'hack squat':['quads','glutes'],'squat':['quads','glutes','hamstrings'],
  'leg press':['quads','glutes'],'leg curl':['hamstrings'],'leg extension':['quads'],
  'lunge':['quads','glutes','hamstrings'],'hip thrust':['glutes'],'glute':['glutes'],
  'deadlift':['hamstrings','glutes','erectors','lats'],'rdl':['hamstrings','glutes','erectors'],
  'calf':['calves'],'pull up':['lats','biceps'],'chin up':['lats','biceps'],
  'lat pulldown':['lats','biceps'],'row':['lats','rhomboids','biceps'],
  'bench press':['chest','triceps','front-delt'],'chest press':['chest','triceps','front-delt'],
  'fly':['chest','front-delt'],'dip':['chest','triceps'],
  'overhead press':['front-delt','triceps'],'shoulder press':['front-delt','triceps'],
  'lateral raise':['rear-delt'],'face pull':['rear-delt','rhomboids'],
  'tricep':['triceps'],'bicep':['biceps'],'curl':['biceps'],
  'ab':['abs'],'crunch':['abs'],'plank':['abs'],'oblique':['obliques'],
  'shrug':['traps'],'forearm':['forearms'],'wrist':['forearms'],
};

const RECOVERY_H_B = {
  quads:72, glutes:72, hamstrings:72, calves:48, adductors:72,
  chest:72, triceps:48, biceps:48, lats:72, rhomboids:48,
  traps:48, erectors:72, abs:36, 'front-delt':48, 'rear-delt':48, forearms:36,
};

function computeCurrentFatigueScores(lifts, peaks) {
  const now = Date.now();
  const scores = {};
  for (const l of (lifts || [])) {
    const t = new Date(l.date).getTime();
    const hoursAgo = (now - t) / 3_600_000;
    if (hoursAgo > 336) continue; // ignore anything older than 2 weeks
    const load = (l.kg || 0) * (l.reps || 1);
    const name = (l.exercise || '').toLowerCase();
    for (const [key, muscles] of Object.entries(MUSCLE_MAP_B)) {
      if (name.includes(key)) {
        muscles.forEach(m => {
          const hl = RECOVERY_H_B[m] || 72;
          const decay = Math.exp(-0.693 * hoursAgo / hl);
          scores[m] = (scores[m] || 0) + load * decay;
        });
        break;
      }
    }
  }
  const out = {};
  for (const [m, v] of Object.entries(scores)) out[m] = Math.min(100, Math.round(v / (peaks[m] || 2000) * 100));
  return out;
}

function musclePeaksFromLifts(lifts) {
  const byDate = {};
  for (const l of (lifts || [])) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }
  const peaks = {};
  for (const dayLifts of Object.values(byDate)) {
    const day = {};
    for (const l of dayLifts) {
      const name = (l.exercise || '').toLowerCase();
      const load = (l.kg || 0) * (l.reps || 1);
      for (const [key, muscles] of Object.entries(MUSCLE_MAP_B)) {
        if (name.includes(key)) { muscles.forEach(m => { day[m] = (day[m] || 0) + load; }); break; }
      }
    }
    for (const [m, v] of Object.entries(day)) { if (v > (peaks[m] || 0)) peaks[m] = v; }
  }
  return peaks;
}

// ---------- Firestore-backed state — per user ----------
const DEFAULTS = () => ({
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [], finance: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [], nwHistory: [],
  strava: null, weeklyPlan: null, soreness: [], muscleSensitivity: {},
  injuries: [], measurements: [], supplements: [], supplementLog: [],
  alcoholLog: [], photos: [], experiments: [],
  profile: { name: "George", heightCm: null, sex: null, waterTarget: 7,
    macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 75 }, macroMode: "manual" },
});

// In-memory cache keyed by uid. 1st-gen Cloud Functions handle one request at a time per
// instance so the request-scoped globals below are safe to use without race conditions.
const userDbs = {};
const userDocRef = uid => firestore.collection('users').doc(uid);

async function loadForUser(uid) {
  if (userDbs[uid]) return userDbs[uid];
  const snap = await userDocRef(uid).get();
  if (snap.exists) {
    userDbs[uid] = { ...DEFAULTS(), ...snap.data() };
  } else {
    // First login: auto-migrate from legacy single-user peak/state document
    const legacy = await firestore.collection('peak').doc('state').get();
    userDbs[uid] = legacy.exists ? { ...DEFAULTS(), ...legacy.data() } : DEFAULTS();
    await userDocRef(uid).set(userDbs[uid]);
  }
  return userDbs[uid];
}

// Request-scoped globals (safe because 1st gen = single concurrent request per instance)
let db = null;
let save = async () => {};

const day = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// ---------- Open webhook routes (iOS Health, Hevy, Strava OAuth) ----------
// These are called by external services and can't carry a Firebase token.
// They resolve the owner uid via PRESS_OWNER_UID env var, with legacy fallback.
const OPEN_PATHS = ['/health', '/shortcut', '/hevy/webhook', '/strava/auth', '/strava/callback', '/setup'];

async function loadOwner() {
  const uid = process.env.PRESS_OWNER_UID;
  if (uid) {
    db = await loadForUser(uid);
    save = async () => { await userDocRef(uid).set(db); };
  } else {
    // Legacy fallback: single-user peak/state document
    const snap = await firestore.collection('peak').doc('state').get();
    db = snap.exists ? { ...DEFAULTS(), ...snap.data() } : DEFAULTS();
    save = async () => { await firestore.collection('peak').doc('state').set(db); };
  }
}

// ---------- Auth middleware ----------
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (OPEN_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    await loadOwner();
    return next();
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'auth required' });
  try {
    const { uid } = await admin.auth().verifyIdToken(header.slice(7));
    req.uid = uid;
    db = await loadForUser(uid);
    save = async () => { await userDocRef(uid).set(db); };
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
  const d = req.body || {};
  // Allow an explicit date for historical syncs; default to today
  const k = d.date ? d.date.slice(0, 10) : day();
  db.metrics[k] = db.metrics[k] || {};
  if (d.hrv) db.metrics[k].heart_rate_variability = d.hrv;
  if (d.rhr) db.metrics[k].resting_heart_rate = d.rhr;
  if (d.sleep) db.metrics[k].sleep_hours = d.sleep;
  if (d.steps) db.metrics[k].step_count = d.steps;
  if (d.weight) { db.metrics[k].body_mass = d.weight; db.weight[k] = d.weight; }
  if (d.vo2max) db.metrics[k].vo2max = d.vo2max;
  if (d.hrr_bpm) db.metrics[k].hrr_bpm = d.hrr_bpm;
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
  res.json({ ok: true, date: k });

  // Non-blocking: generate morning briefing and push notification
  generateMorningBriefing(db).then(async briefing => {
    if (!briefing) return;
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
  }).catch(e => console.error('[briefing] generation failed:', e));
});

// ---------- Hevy helpers ----------
function hevyKey() {
  return process.env.HEVY_API_KEY || functions.config().hevy?.key;
}

function ingestWorkout(w) {
  const wDate = (w.start_time || w.created_at || "").slice(0, 10);
  if (!wDate) return 0;

  // Add workout entry so it appears in workout history and fatigue model
  const wTitle = (w.title || "gym").toLowerCase();
  if (!db.workouts.find(x => x.source === "hevy" && x.date === wDate && x.name === wTitle)) {
    const startMs = w.start_time ? new Date(w.start_time).getTime() : 0;
    const endMs = w.end_time ? new Date(w.end_time).getTime() : 0;
    const duration = startMs && endMs ? Math.round((endMs - startMs) / 60000) : null;
    db.workouts.push({ date: wDate, name: wTitle, duration, kcal: null, source: "hevy" });
  }

  let added = 0;
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
        db.lifts.push(entry);
        added++;
      }
    }
  }
  return added;
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
  res.sendStatus(200);
  const workoutId = req.body.workoutId;
  const key = hevyKey();
  if (!workoutId || !key) return;
  try {
    const r = await fetch("https://api.hevyapp.com/v1/workouts/" + workoutId, {
      headers: { "api-key": key, "accept": "application/json" }
    });
    if (!r.ok) { console.log("[hevy] fetch failed:", r.status); return; }
    const w = await r.json();
    const added = ingestWorkout(w);
    if (added) await save();
  } catch (e) { console.log("[hevy] webhook failed:", e.message); }
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
      for (const w of workouts) totalAdded += ingestWorkout(w);
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
  for (const l of lifts) {
    if (!l.date || !l.exercise) continue;
    const isDupe = db.lifts.find(x => x.date === l.date && x.exercise === l.exercise && Math.abs((x.kg || 0) - (l.kg || 0)) < 0.1 && x.reps === l.reps);
    if (!isDupe) { const e = { date: l.date, exercise: l.exercise, kg: l.kg || 0, reps: l.reps || 0, source: "hevy" }; if (l.rir != null) e.rir = l.rir; db.lifts.push(e); addedLifts++; }
  }
  for (const [date, kg] of Object.entries(weights)) {
    if (kg && !db.weight[date]) { db.weight[date] = kg; addedWeights++; }
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
  const date = (a.start_date || "").slice(0, 10);
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
    syncStrava().catch(e => console.log("[strava] initial sync failed:", e.message));
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
function computeDay(d, baseHRV, baseRHR, sleepTarget) {
  const hrv = d.heart_rate_variability, rhr = d.resting_heart_rate, sleepH = d.sleep_hours;
  if (!hrv || !baseHRV) return null;
  const hrvScore = Math.max(0, Math.min(1, hrv / baseHRV - 0.5));
  const rhrScore = rhr && baseRHR ? Math.max(0, Math.min(1, 1 - (rhr / baseRHR - 1) * 5)) : 0.8;
  const sleepScore = sleepH ? Math.min(1, sleepH / sleepTarget) : 0.8;
  return Math.round(Math.min(99, (hrvScore * 0.5 + rhrScore * 0.2 + sleepScore * 0.3) * 100));
}
function computeDataMaturity(lifts) {
  if (!lifts || lifts.length === 0) return { phase: 'experiments', weeksCovered: 0, sessionsCount: 0, hasPatterns: false, exercisesWithPatterns: 0 };

  const sorted = [...lifts].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const weeksCovered = Math.round((lastDate - firstDate) / (7 * 86400000));
  const workoutDates = new Set(lifts.map(l => l.date));
  const sessionsCount = workoutDates.size;

  // Find exercises with clear progressive e1RM trend across 4+ sessions
  const byEx = {};
  for (const l of lifts) {
    if (!l.exercise || !l.kg || !l.reps) continue;
    const e1rm = l.kg * (1 + l.reps / 30);
    (byEx[l.exercise] = byEx[l.exercise] || []).push({ date: l.date, e1rm });
  }
  const exercisesWithPatterns = Object.values(byEx).filter(sets => {
    if (sets.length < 4) return false;
    const s = sets.sort((a, b) => a.date.localeCompare(b.date));
    const earlyAvg = s.slice(0, Math.ceil(s.length / 2)).reduce((a, x) => a + x.e1rm, 0) / Math.ceil(s.length / 2);
    const lateAvg = s.slice(Math.floor(s.length / 2)).reduce((a, x) => a + x.e1rm, 0) / Math.ceil(s.length / 2);
    return lateAvg > earlyAvg * 1.01; // 1%+ improvement = identifiable trend
  }).length;

  // Established = 4+ weeks of history, 10+ sessions, 3+ exercises showing clear trends
  const hasEnoughData = weeksCovered >= 4 && sessionsCount >= 10 && exercisesWithPatterns >= 3;

  return {
    phase: hasEnoughData ? 'established' : 'experiments',
    weeksCovered,
    sessionsCount,
    hasPatterns: exercisesWithPatterns >= 3,
    hasEnoughData,
    exercisesWithPatterns,
  };
}

function compVerdict(weights, lifts) {
  if (weights.length < 5) return null;
  const wTrend = weights.at(-1).value - weights[0].value;
  const byEx = {};
  lifts.forEach((l) => { (byEx[l.exercise] = byEx[l.exercise] || []).push(l); });
  const liftDeltas = Object.values(byEx).filter((s) => s.length > 1).map((s) => s.at(-1).kg - s[0].kg);
  const liftsUp = liftDeltas.length && avg(liftDeltas) > 0;
  if (Math.abs(wTrend) < 0.8 && liftsUp) return { word: "Recomping", note: "Lifts up, weight steady — likely swapping fat for muscle." };
  if (wTrend <= -0.8 && liftsUp) return { word: "Cutting well", note: "Losing weight while strength climbs." };
  if (wTrend <= -0.8) return { word: "Cutting", note: "Weight trending down. Log lifts to confirm you're holding strength." };
  if (wTrend >= 0.8 && liftsUp) return { word: "Building", note: "Weight and lifts both climbing." };
  if (wTrend >= 0.8) return { word: "Gaining", note: "Weight up without lift progress." };
  return { word: "Maintaining", note: "Weight stable." };
}

app.get("/summary", async (req, res) => {
  const days = lastN(db.metrics, 30);
  const last14 = days.slice(-14);
  const today = days.at(-1) || {};
  const baseHRV = avg(last14.map(d => d.heart_rate_variability).filter(Boolean));
  const baseRHR = avg(last14.map(d => d.resting_heart_rate).filter(Boolean));
  const sleep = personalSleepTarget(days);
  const recovery = computeDay(today, baseHRV, baseRHR, sleep.target);
  const recoveryTrend = last14.map(d => computeDay(d, baseHRV, baseRHR, sleep.target)).filter(x => x != null);
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
  const ydayDate = new Date(); ydayDate.setDate(ydayDate.getDate() - 1);
  const ydayStr = ydayDate.toISOString().slice(0, 10);
  const alcoholLastNight = (db.alcoholLog || []).find(e => e.date === ydayStr)?.units || 0;
  const alcoholLast7 = (db.alcoholLog || []).filter(e => {
    const diff = (Date.now() - new Date(e.date).getTime()) / 864e5;
    return diff >= 0 && diff <= 7;
  }).reduce((a, e) => a + (e.units || 0), 0);
  // VO2 max + HRR series
  const vo2maxSeries = Object.keys(db.metrics).sort().filter(k => db.metrics[k].vo2max != null).slice(-14).map(k => ({ date: k, value: db.metrics[k].vo2max }));
  const hrrSeries = Object.keys(db.metrics).sort().filter(k => db.metrics[k].hrr_bpm != null).slice(-14).map(k => ({ date: k, value: db.metrics[k].hrr_bpm }));
  // Photos (strip base64 for list view to keep payload small)
  const photosMeta = (db.photos || []).slice(-20).map(p => ({ id: p.id, date: p.date, note: p.note }));
  res.json({
    profile: db.profile, hydrationCurve, hydrationNow: hydrationCurve.at(-1) ?? null,
    liftVolume, nwHistory: db.nwHistory || [],
    today: { recovery, hrv: today.heart_rate_variability ?? null, rhr: today.resting_heart_rate ?? null, sleepH: today.sleep_hours ?? null, sleepEff: today.sleep_eff ?? null, steps: today.step_count ?? null },
    sleepTarget: sleep.target, sleepTargetLearned: sleep.learned,
    sleepDebtH: Math.round(sleepDebtH * 10) / 10,
    recoveryTrend, sleepSeries: last14.map(d => d.sleep_hours).filter(Boolean),
    rhrSeries: last14.map(d => d.resting_heart_rate).filter(Boolean),
    baselines: { hrv: baseHRV && Math.round(baseHRV), rhr: baseRHR && Math.round(baseRHR) },
    composition: compVerdict(weights, db.lifts),
    waterStats: { streak, avg: waterDays.length ? Math.round(avg(waterDays) * 10) / 10 : 0, hitRate: waterDays.length ? Math.round((waterDays.filter(v => v >= target).length / waterDays.length) * 100) : 0, best: waterDays.length ? Math.max(...waterDays) : 0 },
    musclePeaks: musclePeaksFromLifts(db.lifts),
    injuries: (db.injuries || []).filter(i => !i.resolved),
    weights, workouts: [...db.workouts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20), workoutsMonth: monthWk.length,
    water: lastN(db.water, 14), waterToday: db.water[day()] || 0,
    weeklyPlan: db.weeklyPlan || null,
    lifts: [...db.lifts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,200), finance: db.finance, thoughts: db.thoughts,
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
    muscleSensitivity: db.muscleSensitivity || {},
    alcoholLastNight, alcoholLast7,
    vo2maxSeries, hrrSeries,
    measurements: (db.measurements || []).slice(-30),
    supplements: db.supplements || [],
    supplementLogToday: (db.supplementLog || []).filter(e => e.date === day()),
    photosMeta,
    experiments: (db.experiments || []),
    travelMode: db.profile?.travelMode || false,
    dataMaturity: computeDataMaturity(db.lifts),
  });
});

// ---------- kcal migration (one-time: fix kJ-stored-as-kcal from before the conversion fix) ----------
app.post("/fix-kcal", async (req, res) => {
  let fixed = 0;
  for (const w of db.workouts) {
    // Values >1500 with a non-hevy source are almost certainly raw kJ from HAE
    if (w.kcal != null && w.kcal > 1500 && w.source !== "hevy") {
      w.kcal = Math.round(w.kcal / 4.184);
      fixed++;
    }
  }
  if (fixed) await save();
  res.json({ ok: true, fixed });
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
app.post("/weight", async (req, res) => { db.weight[day()] = req.body.kg; await save(); res.json({ ok: true }); });
app.post("/bodyfat", async (req, res) => {
  const { pct } = req.body;
  const k = day();
  db.metrics[k] = db.metrics[k] || {};
  db.metrics[k].body_fat_percentage = pct;
  await save();
  res.json({ ok: true });
});
app.post("/nutrition", async (req, res) => {
  const k = day(); db.nutrition = db.nutrition || {};
  db.nutrition[k] = db.nutrition[k] || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const m of ["protein", "carbs", "fat", "calories"]) db.nutrition[k][m] = (db.nutrition[k][m] || 0) + (req.body[m] || 0);
  db.nutritionLog = db.nutritionLog || [];
  if (req.body.label) db.nutritionLog.push({ date: k, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), label: req.body.label, protein: req.body.protein || 0, carbs: req.body.carbs || 0, fat: req.body.fat || 0, calories: req.body.calories || 0 });
  await save(); res.json(db.nutrition[k]);
});
app.post("/nutrition/analyze", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(400).json({ error: 'GROQ_API_KEY not set' });
  const { imageBase64, mode } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const dataUrl = mimeMatch ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const labelPrompt = 'Read this nutrition label precisely. Return ONLY valid JSON: {"description":"product name","calories":0,"protein":0,"carbs":0,"fat":0}. Use per-serving values. All numbers as integers.';
  const mealPrompt = 'Analyse this meal photo. Estimate nutritional content for the whole plate. Return ONLY valid JSON: {"description":"brief meal description","calories":0,"protein":0,"carbs":0,"fat":0}. All numbers as integers.';
  const promptText = mode === 'label' ? labelPrompt : mealPrompt;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: promptText }
          ]
        }]
      })
    });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    res.json(JSON.parse(content || '{}'));
  } catch (e) { res.status(500).json({ error: e.message }); }
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
app.post("/finance", async (req, res) => {
  db.finance.push({ date: day(), name: req.body.name, type: req.body.type, amount: req.body.amount });
  const total = db.finance.reduce((a, e) => a + e.amount, 0);
  db.nwHistory = db.nwHistory || []; const k = day();
  const last = db.nwHistory.at(-1);
  if (last && last.date === k) last.total = total; else db.nwHistory.push({ date: k, total });
  await save(); res.json({ ok: true });
});
app.delete("/finance/:i", async (req, res) => { db.finance.splice(+req.params.i, 1); await save(); res.json({ ok: true }); });
app.post("/thought", async (req, res) => { db.thoughts.push({ date: day(), text: req.body.text }); await save(); res.json({ ok: true }); });
app.post("/workout/session", async (req, res) => {
  const { name, exercises, duration } = req.body;
  const d = day();
  db.workouts = db.workouts || [];
  db.workouts.unshift({ date: d, name: name || 'Session', duration: duration || null });
  for (const ex of (exercises || [])) {
    for (const set of (ex.sets || [])) {
      const kg = parseFloat(set.kg) || 0;
      const reps = parseInt(set.reps) || 1;
      if (kg > 0 || reps > 0) db.lifts.push({ date: d, exercise: ex.name.toLowerCase().trim(), kg, reps, source: 'manual' });
    }
  }
  await save(); res.json({ ok: true });
});
app.post("/lift", async (req, res) => {
  const { exercise, kg, reps, sets } = req.body;
  if (!exercise) return res.status(400).json({ error: "exercise required" });
  const d = day();
  const n = sets && +sets > 1 ? +sets : 1;
  for (let i = 0; i < n; i++) db.lifts.push({ date: d, exercise: exercise.toLowerCase().trim(), kg: +kg || 0, reps: +reps || 1, source: "manual" });
  await save(); res.json({ ok: true });
});
app.delete("/lift/:i", async (req, res) => { db.lifts.splice(+req.params.i, 1); await save(); res.json({ ok: true }); });
app.post("/profile", async (req, res) => { db.profile = { ...db.profile, ...req.body }; await save(); res.json(db.profile); });

// ---------- Personal Journalist ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

app.post("/mentor", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ reply: "Add GROQ_API_KEY to functions/.env to enable the Personal Journalist." });
  const s = db;
  const recentWeights = Object.fromEntries(Object.entries(s.weight || {}).slice(-14));
  const system = "You are Personal Journalist, " + (s.profile?.name || "the user") + "'s personal peak-performance coach. Be direct, concise (2-4 short sentences). Live data: " + JSON.stringify({ recovery: s.metrics, weights: recentWeights, lifts: s.lifts?.slice(-10), water: s.water, workouts: s.workouts?.slice(-5), thoughts: s.thoughts?.slice(-5) });
  const recentMessages = req.body.messages.slice(-10);

  let data, status;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 400,
          messages: [{ role: "system", content: system }, ...recentMessages],
        }),
      });
      data = await r.json();
      status = r.status;
      if (r.ok && data.choices?.[0]?.message?.content) {
        return res.json({ reply: data.choices[0].message.content });
      }
      if (status !== 429) break;
      const waitSec = parseFloat(data.error?.message?.match(/try again in ([\d.]+)s/)?.[1]) || (2 * (attempt + 1));
      await sleep(Math.min(waitSec, 20) * 1000 + 250);
    } catch (e) {
      console.error("Groq mentor exception:", e);
      return res.json({ reply: "Personal Journalist error: " + e.message });
    }
  }
  console.error("Groq mentor error:", status, JSON.stringify(data));
  res.json({ reply: "Personal Journalist error: " + (data.error?.message || `Groq returned ${status}`) });
});

function computeProgression(lifts, name) {
  const ex = lifts.filter(l => l.exercise === name);
  if (!ex.length) return null;
  const byDate = {};
  for (const l of ex) { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); }
  const sessions = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([date, sets]) => {
    const topKg = Math.max(...sets.map(s => s.kg || 0));
    const topSet = sets.find(s => s.kg === topKg) || sets[0];
    const e1rm = topSet.kg > 0 && topSet.reps > 0 ? Math.round(topSet.kg * (1 + topSet.reps / 30)) : 0;
    return { date, kg: topSet.kg, reps: topSet.reps, e1rm, setCount: sets.length };
  });
  const last = sessions.at(-1);
  const prev = sessions.at(-2);
  const isLower = ['squat','deadlift','leg press','lunge','hip thrust','romanian'].some(k => name.includes(k));
  const inc = isLower ? 5 : 2.5;
  let suggestKg = last.kg, suggestReps = last.reps, trend, note;
  if (!prev) {
    trend = 'baseline'; note = `baseline — ${last.kg}kg×${last.reps}`;
  } else if (last.e1rm > prev.e1rm && last.reps >= 5) {
    suggestKg = last.kg + inc; trend = 'progressing';
    note = `progressing — try ${suggestKg}kg×${last.reps} (+${inc}kg)`;
  } else if (last.e1rm >= prev.e1rm) {
    suggestReps = last.reps + 1; trend = 'steady';
    note = `steady — target ${last.kg}kg×${suggestReps} (+1 rep)`;
  } else if (sessions.slice(-3).every((s, i, a) => i === 0 || s.e1rm <= a[i-1].e1rm)) {
    suggestKg = Math.max(0, last.kg - inc * 2); trend = 'stalled';
    note = `stalled — reset to ${suggestKg}kg and rebuild`;
  } else {
    trend = 'recovering'; note = `recovering — hold ${last.kg}kg×${last.reps}`;
  }
  const warmup1kg = Math.round(suggestKg * 0.5 / 2.5) * 2.5;
  const warmup2kg = Math.round(suggestKg * 0.75 / 2.5) * 2.5;
  const recentStr = sessions.slice(-3).map(s => `${s.date}: ${s.kg}kg×${s.reps} (e1RM ${s.e1rm})`).join(', ');
  return { name, trend, note, suggestKg, suggestReps, warmup1kg, warmup2kg, setCount: last.setCount, recentStr };
}

app.post("/plan/session-exercises", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ exercises: [] });
  const { type, title, detail, duration } = req.body;
  const bw = Object.values(db.weight || {}).at(-1) || 75;
  const lifts = db.lifts || [];
  const knownExercises = [...new Set(lifts.map(l => l.exercise).filter(Boolean))];
  const progressions = knownExercises.map(n => computeProgression(lifts, n)).filter(Boolean);

  const progressionCtx = progressions.map(p =>
    `${p.name}: ${p.recentStr} → ${p.note} → USE ${p.suggestKg}kg×${p.suggestReps} for working sets`
  ).join('\n');

  const peaks = musclePeaksFromLifts(lifts);
  const currentFatigue = computeCurrentFatigueScores(lifts, peaks);
  const fatigueStr = Object.entries(currentFatigue).filter(([,v])=>v>15).sort(([,a],[,b])=>b-a)
    .map(([m,v])=>`${m} ${v}%`).join(', ') || 'none';
  const avoidMuscles = Object.entries(currentFatigue).filter(([,v])=>v>65).map(([m])=>m);
  const activeInjuries = (db.injuries || []).filter(i => !i.resolved);
  const injuryStr = activeInjuries.length ? activeInjuries.map(i => `${i.area} (${i.severity}${i.note ? ': ' + i.note : ''})`).join(', ') : '';

  const travelMode = db.profile?.travelMode || false;
  const maturity = computeDataMaturity(lifts);
  const maturityCtx = maturity.hasEnoughData
    ? `PRESCRIPTION MODE: Established athlete — ${maturity.weeksCovered} weeks of data, ${maturity.exercisesWithPatterns} exercises with clear progression patterns. Prescribe confidently based on known response. No experimentation needed — use proven exercises and loads.`
    : `EXPERIMENT MODE: Limited history (${maturity.weeksCovered} weeks, ${maturity.sessionsCount} sessions). Introduce variety to identify which exercises and rep ranges produce best response for this athlete. Vary stimulus each session.`;

  const prompt = `You are writing a complete, precise workout prescription. Progressive overload targets are pre-computed from real training data — use them exactly.
${travelMode ? '\n⚠️ TRAVEL MODE: Athlete is travelling. Use bodyweight exercises only — no barbells, no dumbbells, no machines. Bodyweight squats, push-up variations, pull-ups (if available), lunges, step-ups, plank holds, dips.\n' : ''}
${maturityCtx}

Session type: ${title} (${type})
Guidance: ${detail}
Athlete: ${bw}kg bodyweight

CURRENT MUSCLE FATIGUE (avoid loading muscles above 65%):
${fatigueStr}
${avoidMuscles.length ? `AVOID exercises that primarily stress: ${avoidMuscles.join(', ')}` : 'All muscle groups available.'}
${injuryStr ? `ACTIVE INJURIES/NIGGLES — modify or avoid exercises stressing these areas: ${injuryStr}` : ''}

PRE-COMPUTED PROGRESSIVE OVERLOAD TARGETS:
${progressionCtx || 'No history yet — use reasonable beginner/intermediate weights'}

Instructions:
- Select exercises appropriate for "${title}" that do NOT primarily load fatigued muscles
- Use the exact suggestKg and suggestReps from the targets above
- 2 warm-up sets per compound lift (~50% and ~75% of working weight)
- 3-4 working sets at suggested weight
- Include as many exercises as appropriate — do not limit by time

Return ONLY valid JSON:
{
  "exercises": [
    {
      "name": "exercise name",
      "note": "progressing — up 2.5kg from last session",
      "sets": [{"type":"W","kg":50,"reps":10},{"type":"W","kg":70,"reps":5},{"type":"N","kg":90,"reps":5},{"type":"N","kg":90,"reps":5},{"type":"N","kg":90,"reps":5}]
    }
  ]
}
Set types: W=warm-up, N=normal, D=drop, F=failure. Include the note field per exercise.`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1600, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await r.json();
    res.json(JSON.parse(data.choices?.[0]?.message?.content || '{"exercises":[]}'));
  } catch (e) { res.json({ exercises: [] }); }
});

app.get('/progression/:exercise', async (req, res) => {
  const name = decodeURIComponent(req.params.exercise).toLowerCase();
  const prog = computeProgression(db.lifts || [], name);
  res.json({ progression: prog });
});

app.get("/coach/:exercise", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ note: null });
  const ex = decodeURIComponent(req.params.exercise);
  const sets = (db.lifts || []).filter(l => l.exercise === ex).slice(-30);
  const byDate = {};
  for (const l of sets) { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); }
  const ctx = Object.keys(byDate).sort().slice(-5).map(d => `${d}: ${byDate[d].map(s => `${s.kg}kg×${s.reps}`).join(', ')}`).join('; ');
  const prompt = `One specific coaching cue for ${ex}. History: ${ctx || 'no data'}. Max 14 words. Evidence-based, specific to their numbers. No intro words.`;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 60, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await r.json();
    res.json({ note: data.choices?.[0]?.message?.content?.trim() || null });
  } catch (e) { res.json({ note: null }); }
});

app.post("/import/hevy", async (req, res) => {
  const { sessions } = req.body;
  if (!Array.isArray(sessions)) return res.status(400).json({ error: 'sessions must be array' });
  db.workouts = db.workouts || [];
  db.lifts = db.lifts || [];
  let imported = 0, skipped = 0;
  for (const session of sessions) {
    const exists = db.workouts.some(w => w.date === session.date && w.name === session.name);
    if (exists) { skipped++; continue; }
    db.workouts.unshift({ date: session.date, name: session.name, duration: session.duration || null, source: 'hevy' });
    for (const ex of (session.exercises || [])) {
      for (const set of (ex.sets || [])) {
        if ((set.kg || 0) > 0 || (set.reps || 0) > 0) {
          db.lifts.push({ date: session.date, exercise: ex.name, kg: set.kg || 0, reps: set.reps || 0, source: 'hevy' });
        }
      }
    }
    imported++;
  }
  try { await save(); } catch (e) { console.error('[import/hevy] save failed:', e.message); }
  res.json({ ok: true, imported, skipped });
});

app.get("/recommendation", async (req, res) => {
  const r = db.metrics[day()]?.recovery;
  if (r == null) return res.json({ text: "Connect health sync and recommendations will appear." });
  const text = r >= 80 ? "Push. Recovery " + r + "% — stack your hardest training today."
    : r >= 55 ? "Steady. Recovery " + r + "% — train as planned, protect your sleep tonight."
    : "Recover. Walk, hydrate, no important decisions. Recovery " + r + "%.";
  res.json({ text });
});

// ---------- Weekly plan (AI-generated by Personal Journalist) ----------
app.get("/plan/week", async (req, res) => {
  res.json(db.weeklyPlan || null);
});

app.post("/plan/week", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ error: "GROQ_API_KEY not set — add it to GitHub secrets" });

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dow = today.getDay(); // 0=Sun
  const daysToNextMon = dow === 0 ? 1 : 8 - dow;
  const nextMon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToNextMon);
  const dayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weekDates = dayLabels.map((label, i) => {
    const d = new Date(nextMon);
    d.setDate(d.getDate() + i);
    return { label, date: d.toISOString().slice(0, 10) };
  });

  const recentWorkouts = [...(db.workouts || [])].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, 14)
    .map(w => `${w.date} ${w.name}`).join(', ');

  const byEx = {};
  for (const l of (db.lifts || []).slice(-120)) (byEx[l.exercise] = byEx[l.exercise] || []).push(l);
  const liftSummary = Object.entries(byEx).slice(0, 12).map(([ex, sets]) => {
    const sorted = [...sets].sort((a, b) => a.date.localeCompare(b.date));
    return `${ex}: ${sorted[0].kg}→${sorted.at(-1).kg}kg (${sorted.length} sessions)`;
  }).join('; ');

  const peaks = musclePeaksFromLifts(db.lifts);
  const currentFatigue = computeCurrentFatigueScores(db.lifts, peaks);
  const fatigueStr = Object.entries(currentFatigue).filter(([,v])=>v>15).sort(([,a],[,b])=>b-a)
    .map(([m,v])=>`${m} ${v}%`).join(', ') || 'fully recovered';

  const todayMetrics = (db.metrics || {})[todayStr] || {};
  const bw = Object.values(db.weight || {}).at(-1) || 75;

  const systemPrompt = `You are Personal Journalist, performance coach for ${db.profile?.name || "this athlete"} (${bw}kg bodyweight). Generate a tailored 7-day training plan. Return ONLY valid JSON:
{
  "focus": "one sentence theme for the week",
  "days": [
    { "date": "YYYY-MM-DD", "label": "Mon", "sessions": [
      { "type": "lift|zone2|hiit|climb|flex|rest", "title": "Short session title", "detail": "2-3 sentences of specific guidance" }
    ]}
  ],
  "notes": "1-2 sentences on load management or key cues"
}
Rest days: sessions = [{"type":"rest","title":"Rest","detail":"..."}]. No duration field. No extra keys.`;

  const travelModeWeek = db.profile?.travelMode || false;
  const maturityWeek = computeDataMaturity(lifts);
  const maturityLine = maturityWeek.hasEnoughData
    ? `Established athlete (${maturityWeek.weeksCovered} wks data, ${maturityWeek.exercisesWithPatterns} tracked exercises). Plan based on proven stimulus — no experimental variation needed.`
    : `Early-stage athlete (${maturityWeek.weeksCovered} wks data). Vary exercises and rep ranges to build response profile.`;
  const userPrompt = `Current muscle fatigue (% of personal peak): ${fatigueStr}
Recent sessions: ${recentWorkouts || 'no data yet'}
Lift progression: ${liftSummary || 'no lift data yet'}
Today recovery: ${todayMetrics.heart_rate_variability ? 'HRV ' + todayMetrics.heart_rate_variability + 'ms' : 'unknown'}
${travelModeWeek ? 'TRAVEL MODE ACTIVE: Plan bodyweight-only sessions this week — no gym equipment available.\n' : ''}${maturityLine}
Plan week ${weekDates[0].date} to ${weekDates[6].date}. Avoid loading muscles currently above 60% fatigue. Include strength, zone2 cardio, at least one Norwegian 4×4 HIIT. No consecutive heavy sessions.`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!r.ok) return res.status(500).json({ error: "Groq API error " + r.status });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    let plan;
    try { plan = JSON.parse(content); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }
    plan.generatedAt = new Date().toISOString();
    db.weeklyPlan = plan;
    await save();
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  const { area, severity, note } = req.body;
  if (!area) return res.status(400).json({ error: 'area required' });
  db.injuries = db.injuries || [];
  const id = Date.now();
  db.injuries.push({ id, ts: id, area, severity: severity || 'mild', note: note || '', resolved: false });
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

    db.lifts = (db.lifts || []).filter(l => !(l.date === workout.date && sets.some(s => s.exercise === l.exercise)));
    sets.forEach(s => {
      if (!s.exercise || !s.kg || !s.reps) return;
      db.lifts.push({ exercise: s.exercise, kg: +s.kg, reps: +s.reps, rpe: s.rpe || null, date: workout.date });
    });

    if (customExercises.length) {
      db.customExercises = db.customExercises || [];
      customExercises.forEach(ce => {
        if (!db.customExercises.find(e => e.name === ce.name)) db.customExercises.push(ce);
      });
    }

    await save();

    let atlasSummary = null;
    if (process.env.GROQ_API_KEY && sets.length > 0) {
      try {
        const topSets = sets.slice(0, 8).map(s => `${s.exercise}: ${s.kg}kg × ${s.reps}${s.rpe ? ' @ RPE ' + s.rpe : ''}`).join('\n');
        const profile = db.profile || {};
        const prompt = `You are Atlas, a training analyst for Press — a personal health app. You write post-session analysis. Precise, science-grounded, a touch cold. Gender-ambiguous (never use he/she/him/her). One short paragraph, 2-3 sentences max.

Session: ${workout.name || 'Workout'} on ${workout.date}
Sets logged:
${topSets}

Goal: ${profile.goal || 'build muscle'}
Training age: ${profile.trainingAge || 'unknown'}

Write a brief post-session note highlighting what the numbers say — mechanical fatigue accumulation, any standout load, what to prioritise next. No bullet points. No greetings.`;

        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 180,
          }),
        });
        const d = await r.json();
        atlasSummary = d.choices?.[0]?.message?.content?.trim() || null;
      } catch (_) {}
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
    const key = entry.name?.toLowerCase();
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
  if (!process.env.GROQ_API_KEY) return null;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

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

  const fatigue = computeCurrentFatigueScores(db.lifts || [], musclePeaksFromLifts(db.lifts || []));
  const topFatigued = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, v]) => `${m} ${Math.round(v)}%`).join(', ');

  const prompt = `You are generating a morning health briefing for a personal health app called Press. The briefing has two voices:

V — the health editor. Cool, authoritative, deliberate. Treats health data like breaking news. No gender, no backstory, just V. Always writes something even on rest days — rest has a story too. Editorial newspaper voice, punchy and precise.

Atlas — the training analyst. Methodical, precise, science-grounded. Only speaks on training days or to preview tomorrow's session on rest days.

The user's data:
- Sleep: ${sleepH ? sleepH + 'h' : 'not logged'}
- HRV: ${hrv ? hrv + 'ms' : 'not logged'}
- RHR: ${rhr ? rhr + 'bpm' : 'not logged'}
- Yesterday's workout: ${yesterdayWorkout ? yesterdayWorkout.name + ' — ' + yesterdayLifts.length + ' sets logged' : 'rest day'}
- Nutrition: ${totalCalories ? totalCalories + 'kcal, ' + totalProtein + 'g protein' : 'not logged'}
- Top fatigued muscles: ${topFatigued || 'none'}
- Goal: ${db.profile?.goal || 'build muscle'}
- Name: ${db.profile?.name || 'Athlete'}

Return ONLY valid JSON in this exact structure:
{
  "headline": "PUNCHY HEADLINE IN CAPS — MAX 55 CHARS",
  "subheading": "One sharp sentence expanding on the headline. Reads like a magazine deck.",
  "bullets": {
    "wins": ["win 1", "win 2"],
    "misses": ["miss 1"],
    "numbers": ["8.2h sleep", "HRV 68ms", "3,200kcal"]
  },
  "v": "2-3 sentences of flowing editorial prose from V. Newspaper voice, no bullet points. Contextualises the data as a narrative.",
  "atlas": "1-2 sentences from Atlas on training. Null if true rest day with no training context.",
  "notification": "The headline rephrased for a push notification — under 60 chars, punchy"
}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 600,
    }),
  });
  const data = await response.json();
  const briefing = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  briefing.generatedAt = new Date().toISOString();
  briefing.date = today;
  return briefing;
}

app.get('/briefing', async (req, res) => {
  res.json({ briefing: db.todayBriefing || null });
});

app.post('/briefing/generate', async (req, res) => {
  try {
    const briefing = await generateMorningBriefing(db);
    if (!briefing) return res.status(400).json({ error: 'GROQ_API_KEY not configured' });
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
  <li><span>Repeat for <strong>Resting Heart Rate</strong> → <code>rhr</code>, <strong>Steps</strong> (today) → <code>steps</code>, <strong>Sleep Analysis</strong> → <code>sleep_hours</code></span></li>
  <li><span>Add action: <strong>Get Contents of URL</strong>. Paste your sync URL above. Method: <strong>POST</strong>, Body: <strong>JSON</strong></span></li>
  <li><span>Add the four keys to the JSON body: <code>hrv</code>, <code>rhr</code>, <code>steps</code>, <code>sleep_hours</code> — set each to the variable from step 3–4</span></li>
  <li><span>Toggle <strong>Run Automatically</strong> on. Done — Press receives your health data every morning.</span></li>
</ol>

<div class="note">
  <strong>Tip:</strong> You can add a second automation at 9 PM for an evening sync — duplicate the shortcut and change the time.
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
  res.json({ ok: true });
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
