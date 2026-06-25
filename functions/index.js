const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");

admin.initializeApp();
const firestore = admin.firestore();
const DOC = firestore.collection("peak").doc("state");

const app = express();
app.use(express.json({ limit: "10mb" }));

const ALLOWED_ORIGINS = [
  "https://georgevcronin.github.io",
  "http://localhost:3000",
  "http://localhost:4321",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function sanitizeNutrition(obj) {
  if (!obj) return { protein: 0, carbs: 0, fat: 0, calories: 0 };
  return { protein: parseFloat(obj.protein) || 0, carbs: parseFloat(obj.carbs) || 0, fat: parseFloat(obj.fat) || 0, calories: parseFloat(obj.calories) || 0 };
}

function estOneRM(kg, reps, rir = 0) {
  if (!kg || !reps) return kg || 0;
  const r = reps + (rir || 0);
  if (r >= 6) return kg / (1.0278 - 0.0278 * r);
  return kg * (1 + r / 30);
}

// ---------- Firestore-backed state (cached in memory) ----------
let db = null;
let saveCounter = 0;
const STARTUP_TS = Date.now();
const DEFAULTS = {
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [], finance: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [], nwHistory: [],
  strava: null,
  weeklyPlan: null,
  soreness: [],
  muscleSensitivity: {},
  userMuscleMap: {},
  exerciseLibrary: [],
  workoutTemplates: [],
  profile: { name: "George", heightCm: null, sex: null, age: null, activityLevel: 1.55, waterTarget: 7,
    macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 75 }, macroMode: "manual" },
};

async function load() {
  if (db) return db;
  const snap = await DOC.get();
  db = snap.exists ? { ...DEFAULTS, ...snap.data() } : { ...DEFAULTS };
  return db;
}
async function save() { if (db) { saveCounter++; await DOC.set(db); } }

const day = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// If burn rate exceeds 10 kcal/min the value is almost certainly in kJ — convert it.
// (Real human max is ~20 kcal/min for elite athletes; kJ values are 4.184× larger.)
function kjGuard(kcal, durationMin) {
  if (kcal == null) return null;
  if (durationMin > 0 && kcal / durationMin > 10) return Math.round(kcal / 4.184);
  return kcal;
}

// ---------- Middleware: load state before every request ----------
app.use(async (req, res, next) => { await load(); next(); });

// ---------- Health Auto Export webhook ----------
// Keep last 3 raw payloads in memory for /health-debug inspection
const _healthLog = [];
app.post("/health", async (req, res) => {
  const raw = req.body;
  _healthLog.push({ ts: new Date().toISOString(), body: JSON.stringify(raw).slice(0, 4000) });
  if (_healthLog.length > 3) _healthLog.shift();

  const d = raw?.data || raw || {};
  let saved = 0;
  for (const m of d.metrics || []) {
    const name = m.name;
    for (const pt of m.data || []) {
      const k = day(pt.date);
      db.metrics[k] = db.metrics[k] || {};
      if (name === "sleep_analysis") {
        // HAE sends totalSleep/asleep in some versions, qty in others
        const sleepH = pt.totalSleep ?? pt.asleep ?? pt.qty ?? null;
        if (sleepH != null) db.metrics[k].sleep_hours = sleepH;
        const inBedH = pt.inBed ?? null;
        const resolvedSleep = db.metrics[k].sleep_hours;
        if (inBedH != null && resolvedSleep != null && inBedH > 0)
          db.metrics[k].sleep_eff = Math.round((resolvedSleep / inBedH) * 100);
      } else if (pt.qty != null || pt.avg != null) {
        const val = pt.qty ?? pt.avg;
        db.metrics[k][name] = val;
        if (name === "body_mass") db.weight[k] = val;
        if (name.startsWith("dietary_")) {
          db.nutrition = db.nutrition || {};
          db.nutrition[k] = db.nutrition[k] || {};
          const nmap = { dietary_protein: "protein", dietary_carbohydrates: "carbs", dietary_fat_total: "fat", dietary_energy_consumed: "calories" };
          if (nmap[name]) db.nutrition[k][nmap[name]] = parseFloat(val) || 0;
        }
      }
      saved++;
    }
  }
  for (const w of d.workouts || []) {
    const k = day(w.start || w.date);
    // Normalize start to ISO so it matches Hevy lift keys (HAE sends "2024-01-15 09:00:00 +0000")
    let isoStart = null;
    if (w.start) { try { isoStart = new Date(w.start).toISOString(); } catch(e) { isoStart = w.start; } }
    if (!db.workouts.find((x) => x.date === k && x.name === w.name && x.start === isoStart)) {
      const rawKcal = w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? null;
      const unit = w.activeEnergyBurned?.units ?? w.activeEnergy?.units ?? "kcal";
      const durationMin = w.duration ? Math.round(w.duration / 60) : null;
      const kcalFromUnit = rawKcal != null ? Math.round(unit === "kJ" ? rawKcal / 4.184 : rawKcal) : null;
      const kcal = kjGuard(kcalFromUnit, durationMin);
      db.workouts.push({ date: k, name: w.name, start: isoStart, duration: durationMin, kcal });
      saved++;
    }
  }
  await save();
  res.json({ ok: true, saved });
});

// ---------- Health debug: inspect last 3 raw payloads ----------
app.get("/health-debug", (req, res) => {
  const today = Object.keys(db.metrics || {}).sort().slice(-7).map(k => ({
    date: k, sleep_hours: db.metrics[k].sleep_hours ?? null, sleep_eff: db.metrics[k].sleep_eff ?? null,
  }));
  res.json({ recentMetrics: today, lastPayloads: _healthLog });
});

// ---------- Migrate non-ISO workout starts ----------
app.post("/fix-workout-starts", async (req, res) => {
  let fixed = 0;
  for (const w of (db.workouts || [])) {
    if (w.start && !w.start.includes("T")) {
      try { const iso = new Date(w.start).toISOString(); if (iso !== w.start) { w.start = iso; fixed++; } } catch(e) {}
    }
  }
  if (fixed) await save();
  res.json({ ok: true, fixed });
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
  if (Array.isArray(d.workouts)) {
    for (const w of d.workouts) {
      // Each workout can carry its own date for bulk/historical uploads
      const wDate = w.date ? w.date.slice(0, 10) : k;
      const name = (w.name || "workout").toLowerCase();
      const dur = w.minutes || 0;
      if (!db.workouts.find(x => x.date === wDate && x.name === name && x.duration === dur)) {
        db.workouts.push({ date: wDate, name, duration: dur, kcal: kjGuard(w.calories || null, dur), source: "shortcut" });
      }
    }
  }
  db.lastSyncAt = new Date().toISOString();
  await save();
  res.json({ ok: true, date: k });
});

// ---------- Hevy helpers ----------
function hevyKey() {
  return process.env.HEVY_API_KEY || functions.config().hevy?.key;
}

function ingestWorkout(w) {
  const wDate = (w.start_time || w.created_at || "").slice(0, 10);
  if (!wDate) return 0;

  // Add workout entry — keyed by start_time so two same-named workouts on one day stay separate
  const wTitle = (w.title || "gym").toLowerCase();
  const wStart = w.start_time || null;
  const dedupKey = wStart || `${wDate}|${wTitle}`;
  if (!db.workouts.find(x => x.source === "hevy" && (x.start ? x.start === wStart : `${x.date}|${x.name}` === dedupKey))) {
    const startMs = wStart ? new Date(wStart).getTime() : 0;
    const endMs = w.end_time ? new Date(w.end_time).getTime() : 0;
    const duration = startMs && endMs ? Math.round((endMs - startMs) / 60000) : null;
    db.workouts.push({ date: wDate, name: wTitle, start: wStart, duration, kcal: null, source: "hevy" });
  }

  // Workout-level dedup: if any lift already has this start_time the whole session is already stored
  if (wStart && db.lifts.find(l => l.start === wStart)) return 0;

  let added = 0;
  for (const ex of (w.exercises || [])) {
    const name = (ex.title || ex.name || "").toLowerCase();
    if (!name) continue;
    for (const set of (ex.sets || [])) {
      if (set.set_type === "warmup") continue;
      const kg = set.weight_kg ?? (set.weight_lbs ? set.weight_lbs / 2.20462 : 0);
      const reps = set.reps || 0;
      if (kg === 0 && reps === 0) continue;
      // Fallback per-set dedup only when no start_time (edge case — all Hevy workouts have one)
      if (!wStart) {
        const isDupe = db.lifts.find(l => l.date === wDate && l.exercise === name && Math.abs((l.kg || 0) - kg) < 0.1 && l.reps === reps);
        if (isDupe) continue;
      }
      const entry = { date: wDate, start: wStart, exercise: name, kg: Math.round(kg * 100) / 100, reps, source: "hevy" };
      if (set.rpe != null) entry.rir = Math.max(0, Math.round((10 - set.rpe) * 10) / 10);
      db.lifts.push(entry);
      added++;
    }
  }
  return added;
}

// ---------- Hevy webhook ----------
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
    // start_time is the canonical session key; fall back to date+name for older imports
    const isDupe = (db.workouts || []).find(x => x.source === "hevy" &&
      (w.start && x.start ? x.start === w.start : x.date === w.date && x.name === w.name));
    if (!isDupe) {
      db.workouts = db.workouts || [];
      db.workouts.push({ date: w.date, name: w.name, start: w.start || null, duration: w.duration || null, kcal: w.kcal || null, source: "hevy" });
      addedWorkouts++;
    }
  }
  // Group incoming lifts by session key for session-level dedup
  // (per-set dedup incorrectly rejects multiple sets at the same weight×reps)
  const liftsBySession = {};
  for (const l of lifts) {
    if (!l.date || !l.exercise) continue;
    const k = l.start || l.date;
    (liftsBySession[k] = liftsBySession[k] || []).push(l);
  }
  for (const [sessKey, sessLifts] of Object.entries(liftsBySession)) {
    // Skip entire session if we already have lifts from it
    const hasSession = db.lifts.find(x => {
      const xk = x.start || x.date;
      return xk === sessKey && sessLifts.some(l => l.exercise === x.exercise);
    });
    if (hasSession) continue;
    for (const l of sessLifts) {
      const e = { date: l.date, exercise: l.exercise, kg: l.kg || 0, reps: l.reps || 0, source: "hevy" };
      if (l.start) e.start = l.start;
      if (l.rir != null) e.rir = l.rir;
      db.lifts.push(e);
      addedLifts++;
    }
  }
  for (const [date, kg] of Object.entries(weights)) {
    if (kg && !db.weight[date]) { db.weight[date] = kg; addedWeights++; }
  }
  if (addedLifts || addedWeights || addedWorkouts) await save();
  res.json({ ok: true, addedLifts, addedWeights, addedWorkouts });
});

// ---------- Strava ----------
const STRAVA_BASE = "https://europe-west2-dashboard-79dbb.cloudfunctions.net/api";

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
// Two-process sleep pressure model: ΔS = α(1−S)·t_wake − β·S·t_sleep
// α and β calibrated for a 7.5 h sleep / 16.5 h wake steady-state cycle
const SLEEP_REQUIRED = 7.5;
const SP_ALPHA = 0.0631;  // pressure build rate per awake hour
const SP_BETA  = 0.2054;  // pressure clearance rate per sleep hour
const SP_REST  = 0.15;    // resting pressure after adequate sleep

function computeSleepPressure(allDays) {
  let S = SP_REST;
  const out = [];
  for (const d of allDays) {
    const sleepH = d.sleep_hours || SLEEP_REQUIRED;
    const wakeH  = Math.max(0, 24 - sleepH);
    S = 1 - (1 - S) * Math.exp(-SP_ALPHA * wakeH);
    S = Math.max(0, Math.min(1, S * Math.exp(-SP_BETA * sleepH)));
    const debtH = S > SP_REST ? Math.log(S / SP_REST) / SP_BETA : 0;
    out.push({ date: d.date, pressure: Math.round(S * 1000) / 1000, debtH: Math.round(debtH * 10) / 10 });
  }
  return out;
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
  const allMetricDays = lastN(db.metrics, 60);
  const pressureFull = computeSleepPressure(allMetricDays);
  const pressureSeries14 = pressureFull.slice(-14);
  const currentPressure = pressureFull.at(-1)?.pressure ?? SP_REST;
  const sleepDebtH = pressureFull.at(-1)?.debtH ?? 0;
  // Pre-compute all-time best est1RM per exercise (used by frontend for normalization)
  const liftPRs = {};
  for (const l of db.lifts) {
    if (!l.kg || !l.exercise) continue;
    const e = estOneRM(l.kg, l.reps || 1, l.rir || 0);
    if (!liftPRs[l.exercise] || e > liftPRs[l.exercise]) liftPRs[l.exercise] = Math.round(e * 100) / 100;
  }
  // Estimate atrophy rate from training gaps (14–90 days) on the full lift history
  const _byExDate = {};
  for (const l of db.lifts) {
    if (!l.kg || !l.exercise || !l.date) continue;
    const e1rm = estOneRM(l.kg, l.reps || 1, l.rir || 0);
    if (!_byExDate[l.exercise]) _byExDate[l.exercise] = {};
    if (_byExDate[l.exercise][l.date] == null || e1rm > _byExDate[l.exercise][l.date]) _byExDate[l.exercise][l.date] = e1rm;
  }
  const _atrophyRates = [];
  for (const sessions of Object.values(_byExDate)) {
    const dates = Object.keys(sessions).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      const gapH = (new Date(dates[i + 1]) - new Date(dates[i])) / 3600000;
      if (gapH < 336 || gapH > 2160) continue;
      const e1 = sessions[dates[i]], e2 = sessions[dates[i + 1]];
      if (e2 >= e1) continue;
      const drop = (e1 - e2) / e1;
      if (drop > 0.5) continue;
      _atrophyRates.push(drop / gapH);
    }
  }
  _atrophyRates.sort((a, b) => a - b);
  const estimatedAtrophyRate = _atrophyRates.length >= 2 ? _atrophyRates[Math.floor(_atrophyRates.length / 2)] : null;
  // Trim lifts to last 90 days for payload (liftPRs carries all-time bests separately)
  const _ninetyDaysAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const recentLifts = db.lifts.filter(l => l.date >= _ninetyDaysAgo);

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
  res.json({
    profile: db.profile, hydrationCurve, hydrationNow: hydrationCurve.at(-1) ?? null,
    liftVolume, nwHistory: db.nwHistory || [],
    today: { recovery, hrv: today.heart_rate_variability ?? null, rhr: today.resting_heart_rate ?? null, sleepH: today.sleep_hours ?? null, sleepEff: today.sleep_eff ?? null, sleepInBed: (today.sleep_eff && today.sleep_hours) ? Math.round((today.sleep_hours / (today.sleep_eff / 100)) * 10) / 10 : null, steps: today.step_count ?? null },
    sleepTarget: sleep.target, sleepTargetLearned: sleep.learned,
    sleepDebtH: Math.round(sleepDebtH * 10) / 10,
    sleepPressure: Math.round(currentPressure * 1000) / 1000,
    sleepPressureSeries: pressureSeries14,
    sleepRequired: SLEEP_REQUIRED,
    recoveryTrend, sleepSeries: last14.map(d => ({ date: d.date, h: d.sleep_hours || null, eff: d.sleep_eff || null })),
    rhrSeries: last14.map(d => d.resting_heart_rate).filter(Boolean),
    baselines: { hrv: baseHRV && Math.round(baseHRV), rhr: baseRHR && Math.round(baseRHR) },
    composition: compVerdict(weights, db.lifts),
    waterStats: { streak, avg: waterDays.length ? Math.round(avg(waterDays) * 10) / 10 : 0, hitRate: waterDays.length ? Math.round((waterDays.filter(v => v >= target).length / waterDays.length) * 100) : 0, best: waterDays.length ? Math.max(...waterDays) : 0 },
    liftPRs, estimatedAtrophyRate,
    _v: `${STARTUP_TS}-${saveCounter}`,
    weights, workouts: db.workouts.slice(-30), workoutsMonth: monthWk.length,
    water: lastN(db.water, 14), waterToday: db.water[day()] || 0,
    lifts: recentLifts, finance: db.finance, thoughts: (db.thoughts || []).slice(-200),
    nutritionToday: sanitizeNutrition((db.nutrition || {})[day()]),
    nutrition14: Object.keys(db.nutrition || {}).sort().slice(-14).map(k => ({ date: k, ...sanitizeNutrition(db.nutrition[k]) })),
    nutritionLog: (db.nutritionLog || []).filter(l => l.date === day()).map(l => ({ ...l, protein: parseFloat(l.protein) || 0, carbs: parseFloat(l.carbs) || 0, fat: parseFloat(l.fat) || 0, calories: parseFloat(l.calories) || 0 })),
    macroTargets: db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 },
    macroMode: db.profile.macroMode || "manual", macroGoal: db.profile.macroGoal || "recomp",
    lastSync: db.lastSyncAt ? (() => { const d = new Date(db.lastSyncAt); return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }) + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }); })() : (days.at(-1)?.date || null),
    stravaConnected: !!db.strava?.refresh_token,
    soreness: (db.soreness || []).filter(e => Date.now() - e.ts < 5 * 24 * 3600000),
    muscleSensitivity: db.muscleSensitivity || {},
    userMuscleMap: db.userMuscleMap || {},
    exerciseLibrary: db.exerciseLibrary || [],
    workoutTemplates: db.workoutTemplates || [],
  });
});

// ---------- Manual workout logger ----------

app.post("/exercises/custom", async (req, res) => {
  const { name, category, equipment, primaryMuscles, secondaryMuscles, notes } = req.body;
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
  db.exerciseLibrary = db.exerciseLibrary || [];
  const slug = name.trim().toLowerCase().slice(0, 80);
  if (db.exerciseLibrary.find(e => e.name === slug)) return res.json({ ok: true, existing: true });
  const ex = {
    id: Date.now(),
    name: slug,
    category: (["chest","back","shoulders","arms","legs","core","cardio","other"].includes(category) ? category : "other"),
    equipment: (["barbell","dumbbell","cable","machine","bodyweight","kettlebell","bands","other"].includes(equipment) ? equipment : "other"),
    primaryMuscles: Array.isArray(primaryMuscles) ? primaryMuscles.slice(0, 6) : [],
    secondaryMuscles: Array.isArray(secondaryMuscles) ? secondaryMuscles.slice(0, 8) : [],
    notes: typeof notes === "string" ? notes.slice(0, 300) : "",
    custom: true,
  };
  db.exerciseLibrary.push(ex);
  await save();
  res.json({ ok: true, exercise: ex });
});

app.delete("/exercises/custom/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const before = (db.exerciseLibrary || []).length;
  db.exerciseLibrary = (db.exerciseLibrary || []).filter(e => e.id !== id);
  if (db.exerciseLibrary.length !== before) await save();
  res.json({ ok: true });
});

app.post("/workouts/log", async (req, res) => {
  const { name, startTime, endTime, exercises } = req.body;
  if (!name || typeof name !== "string" || !Array.isArray(exercises)) return res.status(400).json({ error: "name and exercises required" });
  let wStart;
  try { wStart = startTime ? new Date(startTime).toISOString() : new Date().toISOString(); } catch(e) { wStart = new Date().toISOString(); }
  const wDate = wStart.slice(0, 10);
  const durationMin = (startTime && endTime) ? Math.round((new Date(endTime) - new Date(startTime)) / 60000) : null;
  db.workouts = db.workouts || [];
  if (!db.workouts.find(w => w.start === wStart)) {
    db.workouts.push({ date: wDate, name: name.trim().toLowerCase().slice(0, 80), start: wStart, duration: durationMin, kcal: null, source: "manual" });
  }
  db.lifts = db.lifts || [];
  let added = 0;
  for (const ex of exercises) {
    const exName = typeof ex.name === "string" ? ex.name.trim().toLowerCase().slice(0, 80) : "";
    if (!exName) continue;
    for (const set of (ex.sets || [])) {
      if (set.type === "warmup") continue;
      const kg = Math.round((parseFloat(set.kg) || 0) * 100) / 100;
      const reps = Math.max(0, parseInt(set.reps, 10) || 0);
      if (kg === 0 && reps === 0) continue;
      const entry = { date: wDate, start: wStart, exercise: exName, kg, reps, source: "manual" };
      if (set.rir !== "" && set.rir != null) entry.rir = Math.max(0, parseFloat(set.rir) || 0);
      db.lifts.push(entry);
      added++;
    }
  }
  await save();
  res.json({ ok: true, added, date: wDate });
});

app.post("/templates", async (req, res) => {
  const { name, exercises } = req.body;
  if (!name || typeof name !== "string" || !Array.isArray(exercises)) return res.status(400).json({ error: "name and exercises required" });
  db.workoutTemplates = db.workoutTemplates || [];
  const template = {
    id: Date.now(),
    name: name.trim().slice(0, 60),
    exercises: exercises.slice(0, 30).map(e => ({ name: (e.name || "").toLowerCase().slice(0, 80), sets: Math.min(20, Math.max(1, parseInt(e.sets, 10) || 3)) })),
    createdAt: new Date().toISOString(),
  };
  db.workoutTemplates.push(template);
  if (db.workoutTemplates.length > 50) db.workoutTemplates = db.workoutTemplates.slice(-50);
  await save();
  res.json({ ok: true, template });
});

app.delete("/templates/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const before = (db.workoutTemplates || []).length;
  db.workoutTemplates = (db.workoutTemplates || []).filter(t => t.id !== id);
  if (db.workoutTemplates.length !== before) await save();
  res.json({ ok: true });
});

// ---------- Remove lifts with raw CSV start_time format (non-ISO, contains spaces/commas) ----------
app.post("/fix-csv-lifts", async (req, res) => {
  const before = db.lifts.length;
  // Raw CSV format looks like "15 Jan 2024, 09:00:00" — ISO format is "2024-..." or null/undefined
  const isRawCSV = s => s && !/^\d{4}-/.test(s);
  db.lifts = db.lifts.filter(l => !isRawCSV(l.start));
  const removed = before - db.lifts.length;
  if (removed) await save();
  res.json({ ok: true, removed, remaining: db.lifts.length });
});

// ---------- duration migration (one-time: fix seconds-stored-as-minutes from HAE webhook) ----------
app.post("/fix-duration", async (req, res) => {
  let fixed = 0;
  for (const w of db.workouts) {
    // HAE stores duration in seconds (fractional). Values >300 (5h in minutes) or with decimal = seconds.
    if (w.duration != null && (w.duration % 1 !== 0 || w.duration > 300)) {
      w.duration = Math.round(w.duration / 60);
      fixed++;
    }
  }
  if (fixed) await save();
  res.json({ ok: true, fixed });
});

// ---------- kcal migration: fix kJ-stored-as-kcal (rate-based heuristic) ----------
app.post("/fix-kcal", async (req, res) => {
  let fixed = 0;
  for (const w of db.workouts) {
    if (w.kcal == null || w.source === "hevy" || w.source === "strava") continue;
    const corrected = kjGuard(w.kcal, w.duration);
    if (corrected !== w.kcal) { w.kcal = corrected; fixed++; }
  }
  if (fixed) await save();
  res.json({ ok: true, fixed });
});

// ---------- Manual log endpoints ----------
app.post("/water", async (req, res) => {
  const delta = parseFloat(req.body.delta ?? 1);
  if (!isFinite(delta) || Math.abs(delta) > 20) return res.status(400).json({ error: "invalid delta" });
  const k = day();
  db.water[k] = (db.water[k] || 0) + delta; if (db.water[k] < 0) db.water[k] = 0;
  db.waterEvents = db.waterEvents || [];
  if (delta > 0) db.waterEvents.push(Date.now()); else db.waterEvents.pop();
  db.waterEvents = db.waterEvents.slice(-200);
  await save(); res.json({ today: db.water[k] });
});
app.post("/weight", async (req, res) => {
  const kg = parseFloat(req.body.kg);
  if (!isFinite(kg) || kg <= 0 || kg > 500) return res.status(400).json({ error: "invalid kg" });
  db.weight[day()] = Math.round(kg * 100) / 100;
  await save(); res.json({ ok: true });
});
app.post("/nutrition", async (req, res) => {
  const k = day(); db.nutrition = db.nutrition || {};
  db.nutrition[k] = db.nutrition[k] || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const m of ["protein", "carbs", "fat", "calories"]) db.nutrition[k][m] = (parseFloat(db.nutrition[k][m]) || 0) + (parseFloat(req.body[m]) || 0);
  db.nutritionLog = db.nutritionLog || [];
  if (req.body.label) db.nutritionLog.push({ date: k, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), label: req.body.label, protein: parseFloat(req.body.protein) || 0, carbs: parseFloat(req.body.carbs) || 0, fat: parseFloat(req.body.fat) || 0, calories: parseFloat(req.body.calories) || 0 });
  // Keep only last 90 days of meal logs
  const cutoff90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  db.nutritionLog = (db.nutritionLog || []).filter(l => l.date >= cutoff90);
  await save(); res.json(db.nutrition[k]);
});
app.post("/macro-targets", async (req, res) => {
  db.profile.macroTargets = db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 };
  for (const m of ["calories", "protein", "carbs", "fat"]) {
    if (req.body[m] != null) {
      const val = parseFloat(req.body[m]);
      if (isFinite(val) && val >= 0) db.profile.macroTargets[m] = Math.round(val);
    }
  }
  db.profile.macroMode = "manual"; await save(); res.json(db.profile.macroTargets);
});
app.post("/macro-auto", async (req, res) => {
  const goal = req.body.goal || "recomp";
  db.profile.macroGoal = goal;

  const bw = parseFloat(Object.values(db.weight || {}).at(-1)) || 75;
  const h = db.profile.heightCm || 175;
  const age = db.profile.age || 25;
  const sex = (db.profile.sex || "m").toLowerCase().slice(0, 1); // "m" or "f"
  const activity = db.profile.activityLevel || 1.55;

  // Mifflin-St Jeor BMR
  const bmr = sex === "f"
    ? 10 * bw + 6.25 * h - 5 * age - 161
    : 10 * bw + 6.25 * h - 5 * age + 5;
  const tdee = Math.round(bmr * activity);

  // Cut: -500 kcal deficit; recomp: maintenance; bulk: +300 surplus
  const adj = { cut: -500, recomp: 0, bulk: 300 };
  const cals = tdee + (adj[goal] ?? 0);

  // Protein: 1 g/kg; fat: 0.9 g/kg; carbs: fill remainder
  const protein = Math.round(bw);
  const fat = Math.round(bw * 0.9);
  const carbs = Math.max(0, Math.round((cals - protein * 4 - fat * 9) / 4));

  db.profile.macroTargets = { calories: Math.round(cals), protein, carbs, fat };
  db.profile.macroMode = "auto";
  await save();
  res.json({ goal, tdee, targets: db.profile.macroTargets });
});
app.post("/finance", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (!isFinite(amount)) return res.status(400).json({ error: "invalid amount" });
  const name = typeof req.body.name === "string" ? req.body.name.slice(0, 200) : "";
  const type = typeof req.body.type === "string" ? req.body.type.slice(0, 50) : "";
  db.finance.push({ date: day(), name, type, amount });
  const total = db.finance.reduce((a, e) => a + (parseFloat(e.amount) || 0), 0);
  db.nwHistory = db.nwHistory || []; const k = day();
  const last = db.nwHistory.at(-1);
  if (last && last.date === k) last.total = total; else db.nwHistory.push({ date: k, total });
  db.nwHistory = db.nwHistory.slice(-365);
  await save(); res.json({ ok: true });
});
app.delete("/finance/:i", async (req, res) => {
  const i = parseInt(req.params.i, 10);
  if (!Number.isInteger(i) || i < 0 || i >= db.finance.length) return res.status(400).json({ error: "invalid index" });
  db.finance.splice(i, 1);
  await save(); res.json({ ok: true });
});
app.post("/thought", async (req, res) => { db.thoughts.push({ date: day(), text: req.body.text }); db.thoughts = db.thoughts.slice(-200); await save(); res.json({ ok: true }); });
app.post("/profile", async (req, res) => {
  const allowed = ["name", "heightCm", "sex", "age", "activityLevel", "waterTarget", "macroMode", "macroGoal"];
  const update = {};
  for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
  db.profile = { ...db.profile, ...update };
  await save(); res.json(db.profile);
});

// ---------- Mentor ----------
app.post("/mentor", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ reply: "Add GROQ_API_KEY to functions/.env to enable the mentor." });
  const days7 = lastN(db.metrics, 7);
  const todayM = days7.at(-1) || {};
  const weekAvgHRV = avg(days7.map(d => d.heart_rate_variability).filter(Boolean));
  const recentLifts = (db.lifts || []).slice(-10).map(l => `${l.exercise} ${l.kg}kg×${l.reps}`).join(", ");
  const system = "You are Mentor, " + (db.profile?.name || "the user") + "'s personal peak-performance coach. Be direct, concise (2-4 short sentences). Live data: " + JSON.stringify({
    todayHRV: todayM.heart_rate_variability, todaySleepH: todayM.sleep_hours, todayRHR: todayM.resting_heart_rate,
    weekAvgHRV: weekAvgHRV && Math.round(weekAvgHRV),
    weightKg: Object.values(db.weight || {}).at(-1),
    recentLifts, waterToday: db.water?.[day()],
    recentWorkouts: (db.workouts || []).slice(-5).map(w => `${w.date} ${w.name}`),
    recentThoughts: (db.thoughts || []).slice(-3).map(t => t.text),
  });
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        messages: [{ role: "system", content: system }, ...req.body.messages],
      }),
    });
    const data = await r.json();
    res.json({ reply: data.choices?.[0]?.message?.content || "no reply" });
  } catch (e) { res.json({ reply: "mentor error: " + e.message }); }
});

app.get("/recommendation", async (req, res) => {
  const r = db.metrics[day()]?.recovery;
  if (r == null) return res.json({ text: "Connect health sync and recommendations will appear." });
  const text = r >= 80 ? "Push. Recovery " + r + "% — stack your hardest training today."
    : r >= 55 ? "Steady. Recovery " + r + "% — train as planned, protect your sleep tonight."
    : "Recover. Walk, hydrate, no important decisions. Recovery " + r + "%.";
  res.json({ text });
});

// ---------- Weekly plan (AI-generated by mentor) ----------
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

  const recentWorkouts = (db.workouts || []).slice(-14)
    .map(w => `${w.date} ${w.name}${w.duration ? " " + w.duration + "min" : ""}${w.kcal ? " " + Math.round(w.kcal) + "kcal" : ""}`).join(", ");

  const byEx = {};
  for (const l of (db.lifts || []).slice(-80)) (byEx[l.exercise] = byEx[l.exercise] || []).push(l);
  const liftSummary = Object.entries(byEx).slice(0, 10).map(([ex, sets]) => {
    const sorted = [...sets].sort((a, b) => a.date.localeCompare(b.date));
    return `${ex}: ${sorted[0].kg}→${sorted.at(-1).kg}kg (${sorted.length} sessions)`;
  }).join("; ");

  const todayMetrics = (db.metrics || {})[todayStr] || {};
  const bw = Object.values(db.weight || {}).at(-1) || 75;

  const systemPrompt = `You are Mentor, performance coach for ${db.profile?.name || "this athlete"} (${bw}kg bodyweight). Generate a tailored 7-day training plan for the week starting ${weekDates[0].date}. Return ONLY valid JSON matching this exact structure:
{
  "focus": "one sentence theme for the week",
  "days": [
    { "date": "YYYY-MM-DD", "label": "Mon", "sessions": [
      { "type": "lift|zone2|hiit|climb|flex|rest", "title": "Short session title", "detail": "2-3 sentences of specific guidance", "duration": "X min" }
    ]}
  ],
  "notes": "1-2 sentences on load management or key cues"
}
Rest days: sessions = [{"type":"rest","title":"Rest","detail":"...","duration":""}]. No extra keys.`;

  const userPrompt = `Recent 2 weeks: ${recentWorkouts || "no data yet"}
Lift progress: ${liftSummary || "no lift data yet"}
Today recovery: ${todayMetrics.heart_rate_variability ? "HRV " + todayMetrics.heart_rate_variability + "ms" : "unknown"}
Plan the week ${weekDates[0].date} to ${weekDates[6].date}. Include strength, zone 2 cardio, and at least one Norwegian 4×4 HIIT. Balance load — no consecutive heavy sessions.`;

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

// ---------- User-defined exercise → muscle mappings ----------
app.post("/user-muscle-map", async (req, res) => {
  const { exercise, muscles } = req.body;
  if (!exercise) return res.status(400).json({ error: "exercise required" });
  db.userMuscleMap = db.userMuscleMap || {};
  const key = exercise.toLowerCase().trim();
  if (!muscles || Object.keys(muscles).length === 0) {
    delete db.userMuscleMap[key];
  } else {
    db.userMuscleMap[key] = muscles;
  }
  await save();
  res.json({ ok: true, key });
});

app.put("/muscle-sensitivity", async (req, res) => {
  const { muscle, value } = req.body;
  if (!muscle || value == null) return res.status(400).json({ error: "muscle and value required" });
  db.muscleSensitivity = db.muscleSensitivity || {};
  db.muscleSensitivity[muscle] = Math.round(Math.max(0.3, Math.min(3.0, +value)) * 100) / 100;
  await save();
  res.json({ ok: true });
});

// ---------- Workout session plan (AI-generated) ----------
app.post("/workout/plan", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ error: "GROQ_API_KEY not set" });

  const { focusMuscles = [], durationMin = 60, intensity = "moderate", goal = "hypertrophy", notes = "" } = req.body;
  const bw = Object.values(db.weight || {}).at(-1) || 75;

  const recentWorkouts = (db.workouts || []).slice(-10)
    .map(w => `${w.date} ${w.name}${w.duration ? " " + w.duration + "min" : ""}`).join(", ");

  const byEx = {};
  for (const l of (db.lifts || []).slice(-100)) (byEx[l.exercise] = byEx[l.exercise] || []).push(l);
  const liftHistory = Object.entries(byEx).slice(0, 15).map(([ex, sets]) => {
    const sorted = [...sets].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const latest = sorted.at(-1);
    const best1RM = Math.max(...sets.map(s => estOneRM(+s.kg || 0, +s.reps || 0, +s.rir || 0)));
    return `${ex}: last ${latest.kg}kg×${latest.reps}, est1RM ${Math.round(best1RM)}kg`;
  }).join("; ");

  const systemPrompt = `You are a personal trainer creating a single gym session plan for ${db.profile?.name || "the athlete"} (${bw}kg bodyweight). Return ONLY valid JSON:
{
  "title": "Workout title",
  "rationale": "1-2 sentences why this plan fits today",
  "exercises": [
    { "name": "Exercise name", "sets": 3, "reps": "8-10", "rpe": 8, "notes": "optional coaching cue", "isNew": false }
  ],
  "warmup": "brief warmup description",
  "cooldown": "brief cooldown description"
}
Session: ${durationMin} min total. Intensity: ${intensity}. Goal: ${goal}. Focus: ${focusMuscles.join(", ") || "full body"}. ${notes ? "Extra notes: " + notes : ""}
Include 4-7 exercises. Mark isNew:true for exercises not in the user's lift history. Use common exercise names.`;

  const userPrompt = `Recent workouts: ${recentWorkouts || "none yet"}
Lift history with estimated 1RMs: ${liftHistory || "no data yet"}
Create the workout plan now.`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!r.ok) return res.status(500).json({ error: "Groq API error " + r.status });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    let plan;
    try { plan = JSON.parse(content); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Setup page ----------
app.get("/setup", (req, res) => {
  const host = req.get("host") || "YOUR-PROJECT.web.app";
  const url = "https://" + host + "/shortcut";
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Peak Setup</title><style>body{font-family:system-ui;background:#0a0d0b;color:#e8ece9;max-width:640px;margin:0 auto;padding:20px}h1{color:#3ddc84}h2{color:#8a948d;font-size:16px;margin-top:24px}code{background:#1c241f;padding:2px 8px;border-radius:4px;font-size:14px}.url{background:#1c241f;padding:12px;border-radius:8px;font-family:monospace;font-size:15px;color:#3ddc84;word-break:break-all;margin:8px 0;user-select:all}ol{line-height:1.8;padding-left:20px}li{margin-bottom:6px}</style></head><body><h1>Peak Setup</h1><h2>Your sync URL</h2><div class="url">' + url + '</div><h2>Shortcut steps</h2><ol><li>Open Shortcuts, tap +, name it Sync Health</li><li>Add Find Health Samples: Heart Rate Variability, limit 1. Set Variable: hrv</li><li>Repeat for: Resting Heart Rate (rhr), Step Count today (steps), Weight (weight)</li><li>Add Dictionary with keys: hrv, rhr, steps, weight</li><li>Add Get Contents of URL: POST to the URL above, body = JSON dictionary</li></ol><h2>Automate</h2><p>Automation tab, Time of Day, 8 AM + 9 PM, run Sync Health. One tap per notification.</p></body></html>');
});

exports.api = functions.region("europe-west2").runWith({ timeoutSeconds: 300, memory: "256MB", invoker: "public" }).https.onRequest(app);
