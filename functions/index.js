const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");

admin.initializeApp();
const firestore = admin.firestore();
const DOC = firestore.collection("peak").doc("state");

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

// ---------- Firestore-backed state (cached in memory) ----------
let db = null;
const DEFAULTS = {
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [], finance: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [], nwHistory: [],
  strava: null,
  weeklyPlan: null,
  soreness: [],
  muscleSensitivity: {},
  profile: { name: "George", heightCm: null, sex: null, waterTarget: 7,
    macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 75 }, macroMode: "manual" },
};

async function load() {
  if (db) return db;
  const snap = await DOC.get();
  db = snap.exists ? { ...DEFAULTS, ...snap.data() } : { ...DEFAULTS };
  return db;
}
async function save() { if (db) await DOC.set(db); }

const day = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// ---------- Middleware: load state before every request ----------
app.use(async (req, res, next) => { await load(); next(); });

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
    weights, workouts: [...db.workouts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20), workoutsMonth: monthWk.length,
    water: lastN(db.water, 14), waterToday: db.water[day()] || 0,
    weeklyPlan: db.weeklyPlan || null,
    lifts: [...db.lifts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,200), finance: db.finance, thoughts: db.thoughts,
    nutritionToday: (db.nutrition || {})[day()] || { protein: 0, carbs: 0, fat: 0, calories: 0 },
    nutrition14: Object.keys(db.nutrition || {}).sort().slice(-14).map(k => ({ date: k, ...(db.nutrition[k]) })),
    nutritionLog: (db.nutritionLog || []).filter(l => l.date === day()),
    macroTargets: db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 },
    macroMode: db.profile.macroMode || "manual", macroGoal: db.profile.macroGoal || "recomp",
    lastSync: db.lastSyncAt ? (() => { const d = new Date(db.lastSyncAt); return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }) + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }); })() : (days.at(-1)?.date || null),
    stravaConnected: !!db.strava?.refresh_token,
    soreness: (db.soreness || []).filter(e => Date.now() - e.ts < 5 * 24 * 3600000),
    muscleSensitivity: db.muscleSensitivity || {},
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
app.post("/nutrition", async (req, res) => {
  const k = day(); db.nutrition = db.nutrition || {};
  db.nutrition[k] = db.nutrition[k] || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const m of ["protein", "carbs", "fat", "calories"]) db.nutrition[k][m] = (db.nutrition[k][m] || 0) + (req.body[m] || 0);
  db.nutritionLog = db.nutritionLog || [];
  if (req.body.label) db.nutritionLog.push({ date: k, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), label: req.body.label, protein: req.body.protein || 0, carbs: req.body.carbs || 0, fat: req.body.fat || 0, calories: req.body.calories || 0 });
  await save(); res.json(db.nutrition[k]);
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

// ---------- Mentor ----------
app.post("/mentor", async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ reply: "Add GROQ_API_KEY to functions/.env to enable the mentor." });
  const s = db;
  const system = "You are Mentor, " + (s.profile?.name || "the user") + "'s personal peak-performance coach. Be direct, concise (2-4 short sentences). Live data: " + JSON.stringify({ recovery: s.metrics, weights: s.weight, lifts: s.lifts?.slice(-20), water: s.water, workouts: s.workouts?.slice(-10), thoughts: s.thoughts });
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

  const prompt = `You are building a precise workout plan. The progressive overload targets have been pre-computed from real training data — use them exactly.

Session: ${title} (${type}, ${duration})
Guidance: ${detail}
Athlete: ${bw}kg bodyweight

PRE-COMPUTED PROGRESSIVE OVERLOAD TARGETS (use these weights exactly):
${progressionCtx || 'No history yet — estimate beginner weights'}

Instructions:
- Select 3-5 exercises appropriate for "${title}" (${type} day)
- For each chosen exercise, use the exact suggestKg and suggestReps from above
- Add warm-up sets at ~50% and ~75% of working weight
- Add 2-4 working sets at the suggested weight
- If an exercise has no history, estimate reasonable beginner/intermediate weights

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
Set types: W=warm-up, N=normal, D=drop, F=failure. Include the note field explaining the progression decision.`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 900, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await r.json();
    res.json(JSON.parse(data.choices?.[0]?.message?.content || '{"exercises":[]}'));
  } catch (e) { res.json({ exercises: [] }); }
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
  await save();
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

app.put("/muscle-sensitivity", async (req, res) => {
  const { muscle, value } = req.body;
  if (!muscle || value == null) return res.status(400).json({ error: "muscle and value required" });
  db.muscleSensitivity = db.muscleSensitivity || {};
  db.muscleSensitivity[muscle] = Math.round(Math.max(0.3, Math.min(3.0, +value)) * 100) / 100;
  await save();
  res.json({ ok: true });
});

// ---------- Setup page ----------
app.get("/setup", (req, res) => {
  const host = req.get("host") || "YOUR-PROJECT.web.app";
  const url = "https://" + host + "/shortcut";
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Peak Setup</title><style>body{font-family:system-ui;background:#0a0d0b;color:#e8ece9;max-width:640px;margin:0 auto;padding:20px}h1{color:#3ddc84}h2{color:#8a948d;font-size:16px;margin-top:24px}code{background:#1c241f;padding:2px 8px;border-radius:4px;font-size:14px}.url{background:#1c241f;padding:12px;border-radius:8px;font-family:monospace;font-size:15px;color:#3ddc84;word-break:break-all;margin:8px 0;user-select:all}ol{line-height:1.8;padding-left:20px}li{margin-bottom:6px}</style></head><body><h1>Peak Setup</h1><h2>Your sync URL</h2><div class="url">' + url + '</div><h2>Shortcut steps</h2><ol><li>Open Shortcuts, tap +, name it Sync Health</li><li>Add Find Health Samples: Heart Rate Variability, limit 1. Set Variable: hrv</li><li>Repeat for: Resting Heart Rate (rhr), Step Count today (steps), Weight (weight)</li><li>Add Dictionary with keys: hrv, rhr, steps, weight</li><li>Add Get Contents of URL: POST to the URL above, body = JSON dictionary</li></ol><h2>Automate</h2><p>Automation tab, Time of Day, 8 AM + 9 PM, run Sync Health. One tap per notification.</p></body></html>');
});

exports.api = functions.region("europe-west2").runWith({ timeoutSeconds: 300, memory: "256MB", invoker: "public" }).https.onRequest(app);
