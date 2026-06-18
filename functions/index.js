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

// ---------- Firestore-backed state (cached in memory) ----------
let db = null;
const DEFAULTS = {
  metrics: {}, workouts: [], water: {}, weight: {}, lifts: [], finance: [],
  thoughts: [], nutrition: {}, nutritionLog: [], waterEvents: [], nwHistory: [],
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
      db.workouts.push({ date: k, name: w.name, start: w.start, duration: w.duration, kcal: w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? null });
      saved++;
    }
  }
  await save();
  res.json({ ok: true, saved });
});

// ---------- iOS Shortcuts endpoint ----------
app.post("/shortcut", async (req, res) => {
  const d = req.body || {};
  const k = day();
  db.metrics[k] = db.metrics[k] || {};
  if (d.hrv) db.metrics[k].heart_rate_variability = d.hrv;
  if (d.rhr) db.metrics[k].resting_heart_rate = d.rhr;
  if (d.sleep) db.metrics[k].sleep_hours = d.sleep;
  if (d.steps) db.metrics[k].step_count = d.steps;
  if (d.weight) { db.metrics[k].body_mass = d.weight; db.weight[k] = d.weight; }
  if (Array.isArray(d.workouts)) {
    for (const w of d.workouts) {
      const name = (w.name || "workout").toLowerCase();
      if (!db.workouts.find(x => x.date === k && x.name === name && x.duration === (w.minutes || 0))) {
        db.workouts.push({ date: k, name, duration: w.minutes || 0, kcal: w.calories || null, source: "shortcut" });
      }
    }
  }
  await save();
  res.json({ ok: true, date: k });
});

// ---------- Hevy webhook ----------
app.post("/hevy/webhook", async (req, res) => {
  res.sendStatus(200);
  const workoutId = req.body.workoutId;
  const key = process.env.HEVY_API_KEY || functions.config().hevy?.key;
  if (!workoutId || !key) return;
  try {
    const r = await fetch("https://api.hevyapp.com/v1/workouts/" + workoutId, {
      headers: { "api-key": key, "accept": "application/json" }
    });
    const w = await r.json();
    const wDate = (w.start_time || w.created_at || "").slice(0, 10);
    if (!wDate) return;
    let added = 0;
    for (const ex of (w.exercises || [])) {
      const name = (ex.title || ex.name || "").toLowerCase();
      if (!name) continue;
      for (const set of (ex.sets || [])) {
        if (set.set_type === "warmup") continue;
        const kg = set.weight_kg ?? (set.weight_lbs ? set.weight_lbs / 2.20462 : 0);
        const reps = set.reps || 0;
        const isDupe = db.lifts.find(l => l.source === "hevy" && l.date === wDate && l.exercise === name && Math.abs(l.kg - kg) < 0.1 && l.reps === reps);
        if (!isDupe && (kg > 0 || reps > 0)) {
          db.lifts.push({ date: wDate, exercise: name, kg: Math.round(kg * 100) / 100, reps, source: "hevy" });
          added++;
        }
      }
    }
    if (added) await save();
  } catch (e) { console.log("[hevy] webhook failed:", e.message); }
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
    weights, workouts: db.workouts.slice(-20), workoutsMonth: monthWk.length,
    water: lastN(db.water, 14), waterToday: db.water[day()] || 0,
    lifts: db.lifts.slice(-50), finance: db.finance, thoughts: db.thoughts,
    nutritionToday: (db.nutrition || {})[day()] || { protein: 0, carbs: 0, fat: 0, calories: 0 },
    nutrition14: Object.keys(db.nutrition || {}).sort().slice(-14).map(k => ({ date: k, ...(db.nutrition[k]) })),
    nutritionLog: (db.nutritionLog || []).filter(l => l.date === day()),
    macroTargets: db.profile.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 },
    macroMode: db.profile.macroMode || "manual", macroGoal: db.profile.macroGoal || "recomp",
    lastSync: days.at(-1)?.date || null,
  });
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
app.post("/lift", async (req, res) => { db.lifts.push({ date: day(), exercise: req.body.exercise, kg: req.body.kg, reps: req.body.reps }); await save(); res.json({ ok: true }); });
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

app.get("/recommendation", async (req, res) => {
  const r = db.metrics[day()]?.recovery;
  if (r == null) return res.json({ text: "Connect health sync and recommendations will appear." });
  const text = r >= 80 ? "Push. Recovery " + r + "% — stack your hardest training today."
    : r >= 55 ? "Steady. Recovery " + r + "% — train as planned, protect your sleep tonight."
    : "Recover. Walk, hydrate, no important decisions. Recovery " + r + "%.";
  res.json({ text });
});

// ---------- Setup page ----------
app.get("/setup", (req, res) => {
  const host = req.get("host") || "YOUR-PROJECT.web.app";
  const url = "https://" + host + "/shortcut";
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Peak Setup</title><style>body{font-family:system-ui;background:#0a0d0b;color:#e8ece9;max-width:640px;margin:0 auto;padding:20px}h1{color:#3ddc84}h2{color:#8a948d;font-size:16px;margin-top:24px}code{background:#1c241f;padding:2px 8px;border-radius:4px;font-size:14px}.url{background:#1c241f;padding:12px;border-radius:8px;font-family:monospace;font-size:15px;color:#3ddc84;word-break:break-all;margin:8px 0;user-select:all}ol{line-height:1.8;padding-left:20px}li{margin-bottom:6px}</style></head><body><h1>Peak Setup</h1><h2>Your sync URL</h2><div class="url">' + url + '</div><h2>Shortcut steps</h2><ol><li>Open Shortcuts, tap +, name it Sync Health</li><li>Add Find Health Samples: Heart Rate Variability, limit 1. Set Variable: hrv</li><li>Repeat for: Resting Heart Rate (rhr), Step Count today (steps), Weight (weight)</li><li>Add Dictionary with keys: hrv, rhr, steps, weight</li><li>Add Get Contents of URL: POST to the URL above, body = JSON dictionary</li></ol><h2>Automate</h2><p>Automation tab, Time of Day, 8 AM + 9 PM, run Sync Health. One tap per notification.</p></body></html>');
});

exports.api = functions.https.onRequest(app);
