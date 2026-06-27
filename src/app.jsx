import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";

// ── GLOBAL CSS ───────────────────────────────────────────────────────────────
(function () {
  const s = document.createElement("style");
  s.textContent = `
:root{--paper:#e0d8c8;--paper2:#d4ccba;--ink:#0d0b08;--rule:#c4b898;--dim:#5c4e38;--gold:#6b5800;--navy:#1a2f54;--forest:#1a4f2a;--ember:#7a3400;--red:#7a1414;--hdr:68px;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overflow:hidden;background:var(--paper);color:var(--ink);font-family:'Times New Roman',Times,Georgia,serif;}
input,select,button,textarea{font-family:inherit;}
button{cursor:pointer;}
.hdr{position:fixed;top:0;left:0;right:0;z-index:200;height:var(--hdr);background:var(--paper);border-bottom:2px solid var(--ink);display:flex;flex-direction:column;}
.mast-row{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:40px;border-bottom:1px solid var(--rule);}
.mast-meta{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;color:var(--dim);text-transform:uppercase;line-height:1.3;}
.mast-title{font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:900;letter-spacing:-.01em;color:var(--ink);}
.mast-btn{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;background:none;border:1px solid var(--rule);color:var(--dim);padding:4px 10px;transition:color .15s,border-color .15s;}
.mast-btn:hover{color:var(--ink);border-color:var(--ink);}
.ticker-wrap{overflow:hidden;height:28px;display:flex;align-items:center;}
.ticker-track{display:flex;gap:0;animation:rtl 60s linear infinite;white-space:nowrap;}
.ticker-track:hover{animation-play-state:paused;}
@keyframes rtl{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.tick{display:inline-flex;gap:7px;align-items:center;padding:0 18px;font-size:10px;letter-spacing:.06em;font-family:'JetBrains Mono',monospace;border-right:1px solid var(--rule);}
.tick-sym{color:var(--dim);}
.tick-val{color:var(--ink);font-weight:600;}
.tick-up{font-size:9px;color:var(--forest);}
.tick-dn{font-size:9px;color:var(--red);}
.scroll{position:fixed;top:var(--hdr);bottom:0;left:0;right:0;overflow-y:scroll;scroll-snap-type:y mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;}
.scroll::-webkit-scrollbar{display:none;}
section{height:100dvh;display:flex;flex-direction:column;padding:18px 20px 14px;scroll-snap-align:start;position:relative;overflow:hidden;}
.fade{transition:opacity .55s ease,transform .55s ease;}
.will-animate .fade{opacity:0;transform:translateY(14px);}
section.visible .fade{opacity:1;transform:translateY(0);}
section.visible .fade:nth-child(2){transition-delay:.08s;}
section.visible .fade:nth-child(3){transition-delay:.16s;}
section.visible .fade:nth-child(4){transition-delay:.26s;}
section.visible .fade:nth-child(5){transition-delay:.36s;}
section.visible .fade:nth-child(6){transition-delay:.46s;}
@media(prefers-reduced-motion:reduce){.fade,.will-animate .fade{opacity:1;transform:none;transition:none;}.ticker-track{animation:none;}}
.sec-nav{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:150;display:flex;flex-direction:column;gap:8px;}
.sec-dot{width:6px;height:6px;border-radius:50%;background:var(--rule);cursor:pointer;transition:background .2s,transform .2s;border:none;padding:0;}
.sec-dot.active{background:var(--ink);transform:scale(1.4);}
.kicker{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:4px;}
.headline{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(26px,6.5vw,44px);line-height:.96;letter-spacing:-.02em;text-wrap:balance;margin-bottom:6px;}
.deck{font-size:13px;line-height:1.5;color:var(--dim);border-left:2px solid var(--rule);padding-left:10px;margin-bottom:4px;}
.pull{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:clamp(13px,3.3vw,16px);color:var(--dim);line-height:1.45;border-top:1px solid var(--rule);padding-top:8px;margin-top:auto;}
.hero-num{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(56px,14vw,96px);letter-spacing:-.04em;line-height:1;color:var(--gold);}
.vitals{display:grid;gap:10px;}
.vital-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);}
.vital-num{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(22px,5.5vw,34px);letter-spacing:-.03em;line-height:1;}
.vital-delta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);margin-top:1px;}
.stat-cols{display:grid;gap:0;}
.stat-cols-2{grid-template-columns:1fr 1fr;}
.stat-cols-3{grid-template-columns:1fr 1fr 1fr;}
.stat-cols-4{grid-template-columns:repeat(4,1fr);}
.sc-label{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:2px;}
.sc-num{font-family:'Syne',sans-serif;font-weight:800;font-size:19px;letter-spacing:-.02em;}
.sc-num.gold{color:var(--gold);}.sc-num.navy{color:var(--navy);}.sc-num.forest{color:var(--forest);}.sc-num.red{color:var(--red);}.sc-num.ember{color:var(--ember);}
.prog-row{display:flex;align-items:center;gap:8px;padding:3px 0;}
.prog-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);width:60px;flex-shrink:0;}
.prog-track{flex:1;height:3px;background:var(--rule);}
.prog-fill{height:100%;}
.prog-val{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);text-align:right;width:64px;flex-shrink:0;}
.macro-row{margin-bottom:0;}
.macro-lbl{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-bottom:3px;}
.macro-track{height:5px;background:var(--paper2);}
.macro-fill{height:100%;}
.macro-remain{font-size:9px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-top:2px;}
.data-table{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace;}
.data-table th{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);text-align:right;padding:0 4px 5px;font-weight:400;border-bottom:1px solid var(--rule);}
.data-table th:first-child{text-align:left;}
.data-table td{font-size:12px;padding:5px 4px;text-align:right;border-bottom:1px solid var(--paper2);color:var(--ink);}
.data-table td:first-child{text-align:left;}
.data-table td.hi{font-weight:600;}.data-table td.up{color:var(--forest);font-weight:600;}.data-table td.dn{color:var(--red);}.data-table td.gld{color:var(--gold);font-weight:600;}.data-table td.emb{color:var(--ember);}
.chart-wrap{flex:1;min-height:0;position:relative;margin:0 -20px;padding:0 20px;}
.chart-wrap svg{width:100%;height:100%;display:block;overflow:visible;}
.arch-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;}
.arch-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);}
.arch-sched{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);}
.arch-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.arch-stage{font-family:'JetBrains Mono',monospace;font-size:11px;width:40px;flex-shrink:0;}
.arch-dur{font-family:'JetBrains Mono',monospace;font-size:11px;width:44px;flex-shrink:0;color:var(--dim);}
.arch-bar-wrap{flex:1;height:4px;background:var(--rule);}
.arch-bar{height:100%;}
.arch-pct{font-family:'JetBrains Mono',monospace;font-size:10px;width:28px;text-align:right;flex-shrink:0;color:var(--dim);}
.bm-tabs{display:flex;border-bottom:1px solid var(--rule);}
.bm-tab{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:none;border:none;border-right:1px solid var(--rule);padding:6px 14px;color:var(--dim);}
.bm-tab:last-child{border-right:none;}
.bm-tab.active{color:var(--ink);background:var(--paper2);}
.panel-overlay{position:fixed;inset:0;z-index:500;display:flex;justify-content:flex-end;}
.panel-backdrop{position:absolute;inset:0;background:rgba(13,11,8,.35);}
.panel-sheet{position:relative;width:min(100vw,480px);height:100%;background:var(--paper);border-left:2px solid var(--ink);display:flex;flex-direction:column;overflow:hidden;}
.panel-head{border-bottom:1px solid var(--rule);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.panel-title{font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:900;}
.panel-close{font-family:'JetBrains Mono',monospace;font-size:11px;background:none;border:1px solid var(--rule);color:var(--dim);padding:5px 10px;}
.panel-close:hover{color:var(--ink);border-color:var(--ink);}
.panel-nav{display:flex;border-bottom:1px solid var(--rule);flex-shrink:0;}
.panel-nav-btn{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:none;border:none;border-right:1px solid var(--rule);padding:8px 16px;color:var(--dim);}
.panel-nav-btn.active{color:var(--ink);background:var(--paper2);}
.panel-body{flex:1;overflow-y:auto;padding:20px;}
.p-input{background:var(--paper2);border:1px solid var(--rule);padding:10px 12px;color:var(--ink);font-size:14px;width:100%;}
.p-input:focus{outline:none;border-color:var(--ink);}
.p-label{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:4px;display:block;}
.p-btn{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;background:var(--ink);color:var(--paper);border:none;padding:10px 16px;}
.p-btn:hover{background:var(--gold);}
.p-btn.ghost{background:none;color:var(--ink);border:1px solid var(--rule);}
.p-btn.ghost:hover{border-color:var(--ink);}
.chat-msg{padding:10px 14px;font-size:13.5px;line-height:1.55;border:1px solid var(--rule);margin-bottom:8px;white-space:pre-wrap;}
.chat-msg.user{background:var(--paper2);}
.loading{position:fixed;inset:0;background:var(--paper);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:999;}
.loading-title{font-family:'Playfair Display',Georgia,serif;font-size:32px;font-weight:900;}
.loading-sub{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--dim);animation:blink 1.4s ease-in-out infinite;}
@keyframes blink{0%,100%{opacity:.3}50%{opacity:1}}
.no-data{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:14px;color:var(--dim);padding:8px 0;}
.rule-thin{height:1px;background:var(--rule);margin:8px 0;}
`;
  document.head.appendChild(s);
})();

// ── API ──────────────────────────────────────────────────────────────────────
const API_BASE = "https://europe-west2-dashboard-79dbb.cloudfunctions.net/api";
const api = (p, body, method = "POST") =>
  fetch(`${API_BASE}/${p}`, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

// ── HELPERS ──────────────────────────────────────────────────────────────────
const dash = (v, u = "") => v == null ? "—" : `${typeof v === "number" ? Math.round(v * 10) / 10 : v}${u}`;
const pct = (v, t) => (t ? Math.min(100, Math.round((v / t) * 100)) : 0);
const fmtDate = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function recoveryHeadline(r) {
  if (r == null) return "Awaiting\nFirst Sync";
  if (r >= 80) return "Body Clears\nfor Heavy Load";
  if (r >= 65) return "Solid State —\nBuild on It";
  if (r >= 45) return "Moderate Base —\nTrain Measured";
  return "Recovery Day —\nNo Heavy Load";
}

function sleepHeadline(h, eff) {
  if (h == null) return "No Sleep\nData Yet";
  const e = eff ? ` — ${Math.round(eff)}% Efficiency` : "";
  return `${(Math.round(h * 10) / 10).toFixed(1)} Hours${e}`;
}

function trainingHeadline(lifts) {
  if (!lifts || lifts.length === 0) return "No Recent\nSession Logged";
  const lastDate = lifts.reduce((max, l) => l.date > max ? l.date : max, "");
  const lastSession = lifts.filter(l => l.date === lastDate);
  const topLift = lastSession.reduce((best, l) => l.kg > (best?.kg ?? 0) ? l : best, null);
  const ex = topLift ? topLift.exercise.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : "Session";
  return topLift ? `${ex} —\n${topLift.kg} kg` : "Last Session\nLogged";
}

function fuelHeadline(kcal, target) {
  if (kcal == null) return "No Nutrition\nLogged Yet";
  const deficit = (target || 2400) - kcal;
  if (deficit > 0) return `${Math.round(kcal).toLocaleString()} kcal —\n${Math.round(deficit)} Short`;
  return `${Math.round(kcal).toLocaleString()} kcal —\n${Math.round(-deficit)} Surplus`;
}

function fatigueHeadline(fatigue) {
  const entries = Object.entries(fatigue).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "No Training\nLoad Data";
  const [muscle, level] = entries[0];
  const label = muscle.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const rec = level < 0.4 ? "Fresh" : level < 0.65 ? "Loaded" : "Fatigued";
  return `${label} ${rec} —\nPlan Accordingly`;
}

// ── CHART HOOKS ───────────────────────────────────────────────────────────────
function smoothCurve(pts) {
  if (pts.length < 2) return "";
  const t = 0.35;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * t;
    const cp1y = p1[1] + (p2[1] - p0[1]) * t;
    const cp2x = p2[0] - (p3[0] - p1[0]) * t;
    const cp2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function useAreaChart(ref, data, color) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data || data.length < 2) return;
    const w = svg.clientWidth || 300, h = svg.clientHeight || 100;
    if (!w || !h) return;
    const vals = data.map(d => typeof d === "object" ? d.h : d).filter(v => v != null);
    if (vals.length < 2) return;
    const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - ((v - min) / rng) * (h - 12) - 6]);
    const linePath = smoothCurve(pts);
    const id = "ag" + color.replace(/[^a-z0-9]/gi, "");
    const last = pts.at(-1);
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${linePath} L${w},${h} L0,${h} Z" fill="url(#${id})"/><path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${color}"/>`;
  });
}

function useBarChart(ref, data, color) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data || !data.length) return;
    const w = svg.clientWidth || 300, h = svg.clientHeight || 80;
    if (!w || !h) return;
    const max = Math.max(...data, 1);
    const n = data.length, gap = 3, barW = (w - gap * (n - 1)) / n;
    svg.innerHTML = data.map((v, i) => {
      const bh = Math.max(2, (v / max) * (h - 6));
      return `<rect x="${(i * (barW + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" opacity="${i === n - 1 ? "1" : "0.5"}"/>`;
    }).join("");
  });
}

// ── FATIGUE ENGINE ────────────────────────────────────────────────────────────
const MUSCLE_MAP = {
  "hack squat":{quads:1,glutes:.5},"back squat":{quads:1,glutes:.7,hamstrings:.4,core:.3},
  "leg press":{quads:1,glutes:.5},"leg extension":{quads:1},"leg curl":{hamstrings:1},
  "seated leg curl":{hamstrings:1},"hip thrust":{glutes:1,hamstrings:.4},
  "hip adduction":{adductors:1},"glute 45":{glutes:1,hamstrings:.6},
  "romanian deadlift":{hamstrings:1,glutes:.8,lowerBack:.5},
  "bench press":{chest:1,frontDelts:.5,triceps:.5},"chest fly":{chest:1},
  "pec deck":{chest:1},"butterfly":{chest:1},
  "shoulder press":{frontDelts:1,triceps:.5},"overhead press":{frontDelts:1,triceps:.5,core:.3},
  "lateral raise":{sideDelts:1},"rear delt":{rearDelts:1},
  "barbell row":{lats:1,rearDelts:.5,biceps:.5,forearms:.3},
  "iso-lateral row":{lats:1,rearDelts:.5,biceps:.5},
  "lat pulldown":{lats:1,biceps:.5},"straight arm":{lats:1},
  "pull-up":{lats:1,biceps:.7,forearms:.5,core:.3},"chin-up":{lats:.8,biceps:1,forearms:.5},
  "bicep curl":{biceps:1,forearms:.3},"decline curl":{biceps:1},
  "tricep pushdown":{triceps:1},"triceps pushdown":{triceps:1},
  "cable crunch":{core:1},"crunch":{core:1},"plank":{core:1},
  "_running":{quads:.8,calves:1,glutes:.6,hamstrings:.5,hipFlexors:.6,core:.3},
  "_bouldering":{forearms:1,lats:.9,biceps:.8,core:.7,rearDelts:.5},
  "_cycling":{quads:.9,calves:.5,glutes:.6,hamstrings:.4},
};

const RECOVERY_H = {
  quads:56,hamstrings:56,glutes:56,calves:36,adductors:48,hipFlexors:40,
  chest:52,lats:52,frontDelts:44,sideDelts:40,rearDelts:40,
  triceps:36,biceps:36,forearms:32,core:36,lowerBack:56,
};

const MUSCLES = {
  frontDelts: {label:"Front Delts",x:112,y:88,w:22,h:18,side:"front"},
  frontDeltsR:{label:"Front Delts",x:166,y:88,w:22,h:18,side:"front",link:"frontDelts"},
  chest:      {label:"Chest",x:122,y:108,w:56,h:30,side:"front"},
  biceps:     {label:"Biceps",x:100,y:120,w:18,h:28,side:"front"},
  bicepsR:    {label:"Biceps",x:182,y:120,w:18,h:28,side:"front",link:"biceps"},
  core:       {label:"Core",x:130,y:142,w:40,h:40,side:"front"},
  forearms:   {label:"Forearms",x:92,y:152,w:16,h:32,side:"front"},
  forearmsR:  {label:"Forearms",x:192,y:152,w:16,h:32,side:"front",link:"forearms"},
  hipFlexors: {label:"Hip Flexors",x:128,y:184,w:44,h:14,side:"front"},
  quads:      {label:"Quads",x:118,y:200,w:26,h:46,side:"front"},
  quadsR:     {label:"Quads",x:156,y:200,w:26,h:46,side:"front",link:"quads"},
  adductors:  {label:"Adductors",x:140,y:210,w:20,h:30,side:"front"},
  calves:     {label:"Calves",x:120,y:260,w:20,h:32,side:"front"},
  calvesR:    {label:"Calves",x:160,y:260,w:20,h:32,side:"front",link:"calves"},
  rearDelts:  {label:"Rear Delts",x:412,y:88,w:22,h:18,side:"back"},
  rearDeltsR: {label:"Rear Delts",x:466,y:88,w:22,h:18,side:"back",link:"rearDelts"},
  lats:       {label:"Lats",x:418,y:112,w:20,h:36,side:"back"},
  latsR:      {label:"Lats",x:462,y:112,w:20,h:36,side:"back",link:"lats"},
  lowerBack:  {label:"Lower Back",x:435,y:148,w:30,h:24,side:"back"},
  triceps:    {label:"Triceps",x:400,y:118,w:16,h:26,side:"back"},
  tricepsR:   {label:"Triceps",x:484,y:118,w:16,h:26,side:"back",link:"triceps"},
  glutes:     {label:"Glutes",x:425,y:175,w:50,h:28,side:"back"},
  hamstrings: {label:"Hamstrings",x:420,y:206,w:24,h:42,side:"back"},
  hamstringsR:{label:"Hamstrings",x:456,y:206,w:24,h:42,side:"back",link:"hamstrings"},
};

function matchExercise(name) {
  const n = name.toLowerCase();
  for (const [key, muscles] of Object.entries(MUSCLE_MAP)) {
    if (key.startsWith("_")) continue;
    if (n.includes(key)) return muscles;
  }
  if (n.includes("run") || n.includes("jog")) return MUSCLE_MAP._running;
  if (n.includes("boulder") || n.includes("climb")) return MUSCLE_MAP._bouldering;
  if (n.includes("cycle") || n.includes("bike")) return MUSCLE_MAP._cycling;
  return null;
}

function useFatigue(s) {
  return useMemo(() => {
    const accum = {}, now = Date.now();
    const sensitivity = s.muscleSensitivity || {};
    const activeSoreness = {};
    for (const e of (s.soreness || [])) {
      const h = (now - e.ts) / 36e5;
      if (h > 168) continue;
      const dec = (e.score / 10) * Math.pow(0.5, h / 36);
      activeSoreness[e.muscle] = (activeSoreness[e.muscle] || 0) + dec;
    }
    for (const l of (s.lifts || [])) {
      const muscles = matchExercise(l.exercise || "");
      if (!muscles) continue;
      const h = (now - new Date(l.date).getTime()) / 36e5;
      if (h > 168) continue;
      const stim = (l.kg || 0) * (1 - Math.exp(-(l.reps || 0)));
      for (const [m, w] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1, sor = Math.min(1, activeSoreness[m] || 0);
        const hl = (RECOVERY_H[m] || 48) * (1 + sor * 2);
        accum[m] = (accum[m] || 0) + stim * sens * w * Math.pow(0.5, h / hl);
      }
    }
    for (const w of (s.workouts || [])) {
      const muscles = matchExercise(w.name || "");
      if (!muscles) continue;
      const h = (now - new Date(w.date || w.start).getTime()) / 36e5;
      if (h > 168) continue;
      const effort = (w.kcal || 200) * (w.duration || 30) / 30;
      for (const [m, wt] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1, sor = Math.min(1, activeSoreness[m] || 0);
        const hl = (RECOVERY_H[m] || 48) * (1 + sor * 2);
        accum[m] = (accum[m] || 0) + effort * sens * wt * Math.pow(0.5, h / hl);
      }
    }
    const maxVal = Math.max(1, ...Object.values(accum));
    const result = {};
    for (const [m, v] of Object.entries(accum)) result[m] = v / maxVal;
    return result;
  }, [s.lifts, s.workouts, s.muscleSensitivity, s.soreness]);
}

// Fatigue color for paper background (uses value + hue contrast, not pure hue)
function fatigueColor(p) {
  p = Math.min(1, Math.max(0, p));
  if (p < 0.2) return `rgba(26,79,42,${0.12 + p * 0.5})`;   // forest tint
  if (p < 0.5) return `rgba(107,88,0,${0.25 + p * 0.5})`;   // gold tint
  if (p < 0.75) return `rgba(122,52,0,${0.35 + p * 0.5})`;  // ember tint
  return `rgba(122,20,20,${0.45 + p * 0.3})`;                // red
}
function fatigueLevelLabel(p) {
  if (p < 0.35) return "Low";
  if (p < 0.65) return "Moderate";
  return "High";
}
function fatigueLevelClass(p) {
  if (p < 0.35) return "";
  if (p < 0.65) return "gld";
  return "emb";
}

// ── TICKER ────────────────────────────────────────────────────────────────────
function Ticker({ s }) {
  const t = s.today || {};
  const w = (s.weights || []).at(-1)?.value;
  const items = [
    { sym: "$RCVRY",   val: dash(t.recovery),                    chg: t.recovery != null ? `${t.recovery}%` : "—",       up: (t.recovery ?? 0) >= 70 },
    { sym: "$SLEEP",   val: dash(t.sleepH, "h"),                  chg: t.sleepEff ? `${Math.round(t.sleepEff)}% eff` : "—", up: (t.sleepH ?? 0) >= (s.sleepTarget || 8) },
    { sym: "$HRV",     val: dash(t.hrv, "ms"),                    chg: s.baselines?.hrv ? `base ${s.baselines.hrv}` : "—",  up: (t.hrv ?? 0) >= (s.baselines?.hrv ?? 0) },
    { sym: "$RHR",     val: dash(t.rhr, "bpm"),                   chg: s.baselines?.rhr ? `base ${s.baselines.rhr}` : "—",  up: (t.rhr ?? 99) <= (s.baselines?.rhr ?? 99) },
    { sym: "$PROTEIN", val: `${Math.round(s.nutritionToday?.protein || 0)}g`, chg: `/${s.macroTargets?.protein || 160}g`, up: (s.nutritionToday?.protein ?? 0) >= (s.macroTargets?.protein || 160) * 0.8 },
    { sym: "$KCAL",    val: `${Math.round(s.nutritionToday?.calories || s.nutritionToday?.kcal || 0)}`, chg: `/${s.macroTargets?.calories || s.macroTargets?.kcal || 2400}`, up: true },
    { sym: "$H2O",     val: `${s.waterToday ?? 0}gl`,            chg: `/${s.profile?.waterTarget || 7}`,                   up: (s.waterToday ?? 0) >= (s.profile?.waterTarget || 7) * 0.7 },
    { sym: "$STEPS",   val: t.steps ? Math.round(t.steps).toLocaleString() : "—", chg: "today",                            up: (t.steps ?? 0) >= 8000 },
    { sym: "$MASS",    val: w ? `${w}kg` : "—",                  chg: "body",                                               up: true },
  ].filter(Boolean);
  const all = [...items, ...items];
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {all.map((item, i) => (
          <div key={i} className="tick">
            <span className="tick-sym">{item.sym}</span>
            <span className="tick-val">{item.val}</span>
            <span className={item.up ? "tick-up" : "tick-dn"}>{item.chg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MASTHEAD ──────────────────────────────────────────────────────────────────
function Masthead({ s, onMenu }) {
  const d = new Date();
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const vol = `Vol. I · No. ${Math.floor((d - new Date(2026, 0, 1)) / 864e5) + 1} · Est. 2026`;
  const name = s?.profile?.name ? s.profile.name.split(" ").slice(0, 2).join(" ") : "George";
  return (
    <header className="hdr">
      <div className="mast-row">
        <div className="mast-meta">{vol}</div>
        <div className="mast-title">PRESS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mast-meta" style={{ textAlign: "right" }}>{date}<br />{name}</div>
          <button className="mast-btn" onClick={onMenu}>☰</button>
        </div>
      </div>
      {s && <Ticker s={s} />}
    </header>
  );
}

// ── SECTION NAV ───────────────────────────────────────────────────────────────
const SEC_LABELS = ["Recovery", "Sleep", "Training", "Fuel", "Fatigue"];
function SectionNav({ active, scrollRef }) {
  const scrollTo = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };
  return (
    <nav className="sec-nav" aria-label="Sections">
      {SEC_LABELS.map((label, i) => (
        <button key={i} className={`sec-dot${active === i ? " active" : ""}`}
          onClick={() => scrollTo(i)} title={label} aria-label={label} />
      ))}
    </nav>
  );
}

// ── S1: RECOVERY ──────────────────────────────────────────────────────────────
function S1Recovery({ s }) {
  const t = s.today || {};
  const recovery = t.recovery;
  const bgRef = useRef(null);
  useAreaChart(bgRef, s.recoveryTrend, "#6b5800");

  const sleepPct  = t.sleepH && s.sleepTarget ? t.sleepH / s.sleepTarget : 0;
  const rcvryPct  = (recovery ?? 0) / 100;
  const stepsPct  = t.steps ? Math.min(1, t.steps / 10000) : 0;
  const protPct   = pct(s.nutritionToday?.protein || 0, s.macroTargets?.protein || 160) / 100;
  const fatiguePct = 0.27; // placeholder — would come from fatigue computation

  const bars = [
    { label: "Sleep",    pct: sleepPct, val: dash(t.sleepH, "h"), tgt: `${s.sleepTarget || 8}h`, color: "#1a2f54" },
    { label: "Recovery", pct: rcvryPct, val: dash(recovery),       tgt: "100",                   color: "#6b5800" },
    { label: "Steps",    pct: stepsPct, val: t.steps ? Math.round(t.steps).toLocaleString() : "—", tgt: "10k", color: "#1a4f2a" },
    { label: "Protein",  pct: protPct,  val: `${Math.round(s.nutritionToday?.protein || 0)}g`, tgt: `${s.macroTargets?.protein || 160}g`, color: "#7a3400" },
  ];

  const hline = recoveryHeadline(recovery).split("\n");
  const hrvDelta = t.hrv != null && s.baselines?.hrv ? t.hrv - s.baselines.hrv : null;
  const rhrDelta = t.rhr != null && s.baselines?.rhr ? t.rhr - s.baselines.rhr : null;

  return (
    <section id="s1">
      <div className="fade" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 8, marginBottom: 8, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)" }}>
        Today's Edition · {fmtDate()} · Recovery & Readiness
      </div>

      <div className="fade" style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* Left: hero number + ghost chart */}
        <div style={{ flex: "0 0 44%", display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingRight: 16, borderRight: "1px solid var(--rule)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .38, pointerEvents: "none" }}>
            <svg ref={bgRef} width="100%" height="100%" preserveAspectRatio="none" />
          </div>
          <div className="kicker" style={{ position: "relative" }}>Recovery · Today</div>
          <div className="hero-num" style={{ position: "relative" }}>{dash(recovery)}</div>
          <div style={{ position: "relative", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "var(--dim)", marginTop: 2 }}>/100</div>
          <div style={{ position: "relative", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "var(--dim)", marginTop: 6 }}>
            {recovery != null ? (recovery >= 80 ? "▲" : recovery >= 55 ? "→" : "▼") : ""} {recovery != null ? `${recovery}%` : ""} · {recovery != null ? (recovery >= 80 ? "TRAIN HEAVY" : recovery >= 55 ? "TRAIN SMART" : "RECOVER") : "AWAITING DATA"}
          </div>
        </div>

        {/* Right: vitals */}
        <div style={{ flex: 1, paddingLeft: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {[
            { label: "HRV", val: dash(t.hrv, "ms"), delta: hrvDelta, cls: "navy" },
            { label: "Resting HR", val: dash(t.rhr, "bpm"), delta: rhrDelta ? -rhrDelta : null, cls: "forest" },
            { label: "Sleep", val: dash(t.sleepH, "h"), delta: null, cls: "" },
            { label: "Fatigue", val: `${Math.round(fatiguePct * 100)}/100`, delta: null, cls: "red" },
          ].map(({ label, val, delta, cls }) => (
            <div key={label} className="vitals">
              <div className="vital-lbl">{label}</div>
              <div className={`vital-num${cls ? ` sc-num ${cls}` : ""}`}>{val}</div>
              {delta != null && (
                <div className="vital-delta">{delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 10) / 10)} vs baseline</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Daily progress */}
      <div className="fade" style={{ borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 8 }}>
        <div className="kicker" style={{ marginBottom: 4 }}>Daily Progress</div>
        {bars.map(({ label, pct: p, val, tgt, color }) => (
          <div key={label} className="prog-row">
            <span className="prog-lbl">{label}</span>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${Math.min(1, p) * 100}%`, background: color }} />
            </div>
            <span className="prog-val">{val} / {tgt}</span>
          </div>
        ))}
      </div>

      <div className="pull fade">
        {recovery != null
          ? `${recovery >= 80 ? "Forty-eight hours since the last session." : recovery >= 55 ? "Moderate recovery." : "Accumulated fatigue is high."} HRV sits ${hrvDelta != null ? `${Math.abs(Math.round(hrvDelta))} ms ${hrvDelta > 0 ? "above" : "below"} its rolling mean` : "within range"}. ${recovery >= 65 ? "The body has <strong>finished its repair work.</strong>" : "A lighter session today protects tomorrow."}`
          : "Connect Apple Health Auto Export to start seeing your daily readiness."
        }
      </div>
    </section>
  );
}

// ── S2: SLEEP ─────────────────────────────────────────────────────────────────
function S2Sleep({ s }) {
  const t = s.today || {};
  const chartRef = useRef(null);
  useAreaChart(chartRef, s.sleepSeries, "#1a2f54");

  const series14 = (s.sleepSeries || []).map(d => typeof d === "object" ? d.h : d).filter(v => v != null);
  const high14 = series14.length ? Math.max(...series14) : null;
  const low14  = series14.length ? Math.min(...series14) : null;
  const avg14  = series14.length ? series14.reduce((a, b) => a + b, 0) / series14.length : null;

  const hline = sleepHeadline(t.sleepH, t.sleepEff).split("\n");

  return (
    <section id="s2">
      <div className="fade">
        <div className="kicker">Health · Sleep Analysis · 14-Day</div>
        <div className="headline">{hline[0]}{hline[1] && <><br />{hline[1]}</>}</div>
        <div className="deck">
          {s.sleepDebtH > 0.5
            ? `Debt sits at ${s.sleepDebtH.toFixed(1)} hours. The two-process model says tonight is the critical window. Miss it and the week compounds.`
            : t.sleepH != null
              ? `Sleep target hit — ${t.sleepH.toFixed(1)}h vs ${s.sleepTarget || 8}h target. Recovery window used well.`
              : "Connect Apple Health to track sleep debt and efficiency."}
        </div>
      </div>

      {/* Sleep architecture — shown if stage data available, else raw stats */}
      {t.sleepStages ? (
        <div className="fade">
          <div className="arch-header">
            <span className="arch-lbl">Sleep Architecture</span>
            {t.sleepBed && t.sleepWake && (
              <span className="arch-sched">Bed {t.sleepBed} · Wake {t.sleepWake}</span>
            )}
          </div>
          {[
            { stage: "REM",   dur: t.sleepStages.rem,   color: "#1a2f54" },
            { stage: "Deep",  dur: t.sleepStages.deep,  color: "#6b5800" },
            { stage: "Core",  dur: t.sleepStages.core,  color: "#574a24" },
            { stage: "Awake", dur: t.sleepStages.awake, color: "#5c4e38" },
          ].filter(r => r.dur != null).map(({ stage, dur, color }) => {
            const total = t.sleepH * 60;
            const p = total ? Math.round((dur / total) * 100) : 0;
            const h = Math.floor(dur / 60), m = Math.round(dur % 60);
            return (
              <div key={stage} className="arch-row">
                <span className="arch-stage">{stage}</span>
                <span className="arch-dur">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
                <div className="arch-bar-wrap"><div className="arch-bar" style={{ width: `${p}%`, background: color }} /></div>
                <span className="arch-pct">{p}%</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="chart-wrap fade" style={{ flex: 1, minHeight: 60 }}>
        <svg ref={chartRef} preserveAspectRatio="none" />
      </div>

      {/* Physiology row — show if any data available */}
      {(t.hrv || t.spo2 || t.respRate) && (
        <div className="fade">
          <div className="stat-cols stat-cols-4" style={{ borderTop: "1px solid var(--rule)", paddingTop: 8, marginBottom: 10 }}>
            {[
              { label: "Sleep HRV",   val: dash(t.hrv, "ms"),      cls: "navy"   },
              { label: "SpO₂",        val: dash(t.spo2, "%"),       cls: "forest" },
              { label: "Resp. Rate",  val: dash(t.respRate, "/min"), cls: ""       },
              { label: "Wrist Temp",  val: t.wristTemp != null ? `${t.wristTemp > 0 ? "+" : ""}${t.wristTemp.toFixed(1)}°C` : "—", cls: "" },
            ].map(({ label, val, cls }) => (
              <div key={label} className="stat-cell">
                <div className="sc-label">{label}</div>
                <div className={`sc-num${cls ? " " + cls : ""}`} style={{ fontSize: 18 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fade">
        <div className="stat-cols stat-cols-4" style={{ borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
          {[
            { label: "14D High",   val: dash(high14, "h"), cls: "" },
            { label: "14D Low",    val: dash(low14, "h"),  cls: low14 != null && low14 < (s.sleepTarget || 7) ? "red" : "" },
            { label: "14D Avg",    val: avg14 != null ? `${(Math.round(avg14 * 10) / 10).toFixed(1)}h` : "—", cls: "" },
            { label: "Sleep Debt", val: s.sleepDebtH != null ? `${Math.abs(s.sleepDebtH).toFixed(1)}h` : "—", cls: (s.sleepDebtH || 0) > 1 ? "red" : "forest" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="stat-cell">
              <div className="sc-label">{label}</div>
              <div className={`sc-num${cls ? " " + cls : ""}`} style={{ fontSize: 19 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pull fade">
        {avg14 != null
          ? `14-night average of ${(Math.round(avg14 * 10) / 10).toFixed(1)} hours${(s.sleepDebtH || 0) > 1 ? ` with a ${s.sleepDebtH.toFixed(1)}-hour deficit accumulating` : ""}. ${t.sleepEff >= 85 ? "Efficiency above 85% — architecture is sound." : t.sleepEff ? `${Math.round(t.sleepEff)}% efficiency — room to improve sleep quality.` : "Wrist temperature and HRV tell the full story."}`
          : "Connect Apple Health Auto Export to start tracking your sleep architecture."}
      </div>
    </section>
  );
}

// ── S3: TRAINING ──────────────────────────────────────────────────────────────
function S3Training({ s }) {
  const chartRef = useRef(null);

  const lifts = s.lifts || [];
  const lastDate = lifts.reduce((max, l) => l.date > max ? l.date : max, "");
  const lastSession = lifts.filter(l => l.date === lastDate);
  const hline = trainingHeadline(lifts).split("\n");

  // 7-week volume per week
  const weekVol = useMemo(() => {
    const now = Date.now(), W = 7;
    const arr = Array(W).fill(0);
    for (const l of lifts) {
      const days = Math.floor((now - new Date(l.date).getTime()) / 864e5);
      if (days < 0 || days >= W * 7) continue;
      const wi = W - 1 - Math.floor(days / 7);
      arr[wi] += (l.kg || 0) * (l.reps || 0);
    }
    return arr;
  }, [lifts]);

  useBarChart(chartRef, weekVol, "#0d0b08");

  const topLift = lastSession.reduce((best, l) => l.kg > (best?.kg ?? 0) ? l : best, null);
  const est1RM  = topLift ? Math.round(topLift.kg * (1 + (topLift.reps || 1) / 30)) : null;
  const volLoad = lastSession.reduce((sum, l) => sum + (l.kg || 0) * (l.reps || 0), 0);

  return (
    <section id="s3">
      <div className="fade">
        <div className="kicker">Performance · Strength · {lastDate || "No Data"}</div>
        <div className="headline">{hline[0]}{hline[1] && <><br />{hline[1]}</>}</div>
        {(est1RM || volLoad > 0) && (
          <div className="deck">
            {lastSession.length} sets · {Math.round(volLoad).toLocaleString()} kg volume load{est1RM ? ` · ${est1RM} kg est. 1RM` : ""}
          </div>
        )}
      </div>

      {lastSession.length > 0 ? (
        <div className="fade">
          <table className="data-table">
            <thead>
              <tr><th>Exercise</th><th>Weight</th><th>Reps</th><th>RIR</th></tr>
            </thead>
            <tbody>
              {lastSession.slice(0, 5).map((l, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.exercise}</td>
                  <td className="gld">{l.kg} kg</td>
                  <td className="hi">{l.reps}</td>
                  <td className={l.rir != null && l.rir <= 2 ? "up" : ""}>{l.rir ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fade"><div className="no-data">No sessions logged yet. Import a Hevy CSV or connect via webhook.</div></div>
      )}

      <div className="chart-wrap fade" style={{ flex: 1, minHeight: 80 }}>
        <svg ref={chartRef} preserveAspectRatio="none" />
      </div>

      <div className="fade">
        <div className="stat-cols stat-cols-3" style={{ borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
          {[
            { label: "Month", val: s.workoutsMonth ?? "—", unit: "sessions", cls: "forest" },
            { label: "Sets",  val: lastSession.length || "—", unit: "last session", cls: "" },
            { label: "Vol",   val: volLoad > 0 ? Math.round(volLoad / 1000 * 10) / 10 : "—", unit: "T last session", cls: "" },
          ].map(({ label, val, unit, cls }) => (
            <div key={label} className="stat-cell">
              <div className="sc-label">{label}</div>
              <div className={`sc-num${cls ? " " + cls : ""}`} style={{ fontSize: 20 }}>
                {val}<span style={{ fontSize: ".45em", color: "var(--dim)" }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {topLift && (
        <div className="pull fade">
          {est1RM ? `Estimated 1RM sits at ${est1RM} kg. ` : ""}
          {s.workoutsMonth >= 10 ? "Eleven sessions in the month — consistency is the variable." : "One good week separates you from a <strong>squat personal record.</strong>"}
        </div>
      )}
    </section>
  );
}

// ── S4: FUEL ──────────────────────────────────────────────────────────────────
function S4Fuel({ s }) {
  const n  = s.nutritionToday || {};
  const mt = s.macroTargets   || { protein: 160, calories: 2400, carbs: 250, fat: 75 };
  // API uses 'calories' key, not 'kcal'
  const nCal = n.calories ?? n.kcal;
  const mtCal = mt.calories ?? mt.kcal ?? 2400;
  const hline = fuelHeadline(nCal || null, mtCal).split("\n");

  const macros = [
    { label: "Calories", val: nCal || null, tgt: mtCal,      unit: "kcal", remain: Math.max(0, mtCal - (nCal || 0)),                                  color: "#0d0b08",  remainUnit: "kcal" },
    { label: "Protein",  val: n.protein, tgt: mt.protein, unit: "g",    remain: Math.max(0, (mt.protein || 160) - (n.protein || 0)), color: "#1a2f54",  remainUnit: "g", note: (n.protein || 0) < (mt.protein || 160) * 0.8 ? "critical window" : null },
    { label: "Carbs",    val: n.carbs,   tgt: mt.carbs,   unit: "g",    remain: Math.max(0, (mt.carbs || 250) - (n.carbs || 0)),     color: "#1a4f2a",  remainUnit: "g" },
    { label: "Fat",      val: n.fat,     tgt: mt.fat,     unit: "g",    remain: Math.max(0, (mt.fat || 75) - (n.fat || 0)),          color: "#7a3400",  remainUnit: "g" },
    { label: "Water",    val: s.waterToday, tgt: s.profile?.waterTarget || 7, unit: "gl", remain: Math.max(0, (s.profile?.waterTarget || 7) - (s.waterToday || 0)), color: "#1a2f54", remainUnit: "glasses" },
  ];

  return (
    <section id="s4">
      <div className="fade">
        <div className="kicker">Nutrition · Today</div>
        <div className="headline">{hline[0]}{hline[1] && <><br />{hline[1]}</>}</div>
        <div className="deck">
          {(nCal || 0) > 0
            ? `${Math.round((mt.protein || 160) - (n.protein || 0))} g protein remaining. Dinner decides the day.`
            : "Log meals via Apple Health to see today's macro progress."}
        </div>
      </div>

      <div className="fade" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--rule)", marginTop: 8, paddingTop: 10 }}>
        {macros.map(({ label, val, tgt, unit, remain, color, remainUnit, note }) => {
          const hasData = (val || 0) > 0;
          const fraction = tgt && hasData ? Math.min(1, val / tgt) : 0;
          return (
            <div key={label} className="macro-row">
              <div className="macro-lbl">
                <span>{label}</span>
                <span>{hasData ? `${Math.round(val)} / ${tgt} ${unit}` : `— / ${tgt} ${unit}`} &nbsp; {tgt ? `${Math.round(fraction * 100)}%` : ""}</span>
              </div>
              <div className="macro-track"><div className="macro-fill" style={{ width: `${fraction * 100}%`, background: color }} /></div>
              <div className="macro-remain">
                {hasData ? `${Math.round(remain)} ${remainUnit} remaining` : "—"}
                {note && hasData && <> — <span style={{ color: "var(--ember)" }}>{note}</span></>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pull fade">
        {(nCal || 0) > 0
          ? `Calories at ${Math.round((nCal / mtCal) * 100)}% of target. ${(n.protein || 0) < (mt.protein || 160) * 0.5 ? "Protein is behind — front-load it at the next meal." : "Protein on track."}`
          : "Nothing logged yet. Every meal missed is a macro gap that compounds."}
      </div>

      {(n.meals || []).length > 0 && (
        <div className="fade">
          <div style={{ height: 1, background: "var(--rule)", margin: "8px 0" }} />
          <table className="data-table">
            <thead><tr><th>Meal</th><th>Time</th><th>Protein</th><th>Carbs</th><th>kcal</th></tr></thead>
            <tbody>
              {n.meals.map((m, i) => (
                <tr key={i}>
                  <td>{m.name}</td>
                  <td>{m.time || "—"}</td>
                  <td className="up">{m.protein != null ? `${Math.round(m.protein)}g` : "—"}</td>
                  <td>{m.carbs != null ? `${Math.round(m.carbs)}g` : "—"}</td>
                  <td className="hi">{m.kcal != null ? Math.round(m.kcal) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── S5: FATIGUE ───────────────────────────────────────────────────────────────
function S5Fatigue({ s }) {
  const fatigue = useFatigue(s);
  const [bmView, setBmView] = useState("front");
  const hline = fatigueHeadline(fatigue).split("\n");

  const sortedMuscles = Object.entries(fatigue).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const getMuscleLevel = (key) => {
    const m = MUSCLES[key];
    return fatigue[m?.link || key] || 0;
  };

  const bodyViews = {
    front: { viewBox: "80 30 140 280", offset: 0 },
    back:  { viewBox: "380 30 140 280", offset: 300 },
  };

  const SIL_FILL   = "#b8ae9e";
  const SIL_STROKE = "#9c9080";
  const Silhouette = ({ offset }) => (
    <>
      <ellipse cx={150 + offset} cy={52} rx={18} ry={20} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={120 + offset} y={72} width={60} height={110} rx={12} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={95 + offset} y={82} width={20} height={70} rx={8} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={185 + offset} y={82} width={20} height={70} rx={8} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={88 + offset} y={148} width={16} height={44} rx={6} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={196 + offset} y={148} width={16} height={44} rx={6} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={122 + offset} y={184} width={24} height={70} rx={8} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={154 + offset} y={184} width={24} height={70} rx={8} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={120 + offset} y={256} width={22} height={38} rx={6} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
      <rect x={158 + offset} y={256} width={22} height={38} rx={6} fill={SIL_FILL} stroke={SIL_STROKE} strokeWidth="1" />
    </>
  );

  const view = bodyViews[bmView] || bodyViews.front;
  const side = bmView === "back" ? "back" : "front";

  return (
    <section id="s5" style={{ padding: "18px 20px 12px" }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Recovery · Muscle Fatigue · 7-Day Load</div>
        <div className="headline" style={{ fontSize: "clamp(24px,6vw,40px)", marginBottom: 0 }}>
          {hline[0]}{hline[1] && <><br />{hline[1]}</>}
        </div>
      </div>

      <div className="fade" style={{ flex: 1, display: "flex", flexDirection: "column", borderTop: "2px solid var(--ink)", margin: "10px 0", minHeight: 0, overflow: "hidden" }}>
        <div className="bm-tabs">
          {["front", "back"].map(v => (
            <button key={v} className={`bm-tab${bmView === v ? " active" : ""}`} onClick={() => setBmView(v)}>
              {v === "front" ? "Anterior" : "Posterior"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: 0, overflow: "hidden", borderBottom: "2px solid var(--ink)" }}>
          <svg viewBox={view.viewBox} style={{ height: "100%", width: "auto", maxWidth: "100%" }}>
            <Silhouette offset={view.offset} />
            {Object.entries(MUSCLES)
              .filter(([, m]) => m.side === side)
              .map(([key, m]) => {
                const lvl = getMuscleLevel(key);
                return (
                  <rect key={key} x={m.x} y={m.y} width={m.w} height={m.h} rx={4}
                    fill={fatigueColor(lvl)} stroke="transparent" strokeWidth={0}
                    style={{ transition: "fill .3s" }} />
                );
              })}
          </svg>
        </div>
      </div>

      <div className="fade" style={{ flexShrink: 0 }}>
        {sortedMuscles.length > 0 ? (
          <table className="data-table" style={{ fontSize: "11.5px" }}>
            <thead><tr><th style={{ textAlign: "left" }}>Muscle</th><th>Fatigue</th><th>Level</th></tr></thead>
            <tbody>
              {sortedMuscles.map(([muscle, level]) => {
                const cls = fatigueLevelClass(level);
                const label = muscle.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
                return (
                  <tr key={muscle}>
                    <td>{label}</td>
                    <td className={cls}>{Math.round(level * 100)}%</td>
                    <td className={cls}>{fatigueLevelLabel(level)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="no-data">Log lifts or sync workouts — the map comes alive.</div>
        )}
      </div>
    </section>
  );
}

// ── MENTOR PANEL ──────────────────────────────────────────────────────────────
function MentorContent({ s, refresh }) {
  const [msgs, setMsgs] = useState([]), [inp, setInp] = useState(""), [busy, setBusy] = useState(false), [thought, setThought] = useState("");
  const prompts = ["How is my week looking?", "Am I drinking enough water?", "What should I focus on today?", "How is my recovery trending?"];

  async function send(text) {
    const q = (text ?? inp).trim(); if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInp(""); setBusy(true);
    const { reply } = await api("mentor", { messages: next });
    setMsgs([...next, { role: "assistant", content: reply }]); setBusy(false);
  }

  return (
    <div className="panel-body">
      <div style={{ display: "flex", flexDirection: "column", minHeight: 300, marginBottom: 20 }}>
        {msgs.length === 0 ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12, lineHeight: 1.5 }}>I can see your live data — sleep, recovery, workouts, water, and notes.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {prompts.map(p => (
                <button key={p} onClick={() => send(p)}
                  style={{ textAlign: "left", background: "var(--paper2)", border: "1px solid var(--rule)", padding: "10px 14px", fontSize: 13, color: "var(--ink)" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, flex: 1, overflowY: "auto" }}>
            {msgs.map((m, i) => <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>)}
            {busy && <div className="no-data">Mentor is thinking…</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <input className="p-input" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask me anything…" style={{ flex: 1 }} />
          <button className="p-btn" onClick={() => send()} disabled={busy}>→</button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Memory · {s.thoughts?.length ?? 0} thoughts</div>
        {(s.thoughts || []).map((th, i) => (
          <div key={i} style={{ fontSize: 13, padding: "6px 0 6px 10px", borderLeft: "2px solid var(--rule)", marginBottom: 6, color: "var(--dim)" }}>{th.text}</div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="p-input" value={thought} onChange={e => setThought(e.target.value)} placeholder="Drop a thought…" style={{ flex: 1 }} />
          <button className="p-btn ghost" onClick={async () => {
            if (thought.trim()) { await api("thought", { text: thought.trim() }); setThought(""); refresh(); }
          }}>Keep</button>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────────────
function SettingsContent({ s, refresh, onClose }) {
  const [p, setP] = useState(s.profile || {});
  return (
    <div className="panel-body">
      <div className="kicker" style={{ marginBottom: 12 }}>Profile</div>
      <div style={{ display: "grid", gap: 12 }}>
        {[["name", "Name", "text"], ["heightCm", "Height (cm)", "number"], ["sex", "Sex", "text"], ["waterTarget", "Water target (glasses/day)", "number"]].map(([k, l, t]) => (
          <div key={k}>
            <label className="p-label">{l}</label>
            <input className="p-input" value={p[k] ?? ""} type={t}
              onChange={e => setP({ ...p, [k]: t === "number" ? +e.target.value : e.target.value })} />
          </div>
        ))}
        <button className="p-btn" style={{ marginTop: 4 }} onClick={async () => { await api("profile", p); refresh(); onClose(); }}>Save Profile</button>
      </div>

      {!s.lastSync && (
        <div style={{ marginTop: 24, padding: "14px", background: "var(--paper2)", border: "1px solid var(--rule)" }}>
          <div className="kicker" style={{ marginBottom: 4 }}>Apple Health Not Connected</div>
          <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.5 }}>Point Health Auto Export on your iPhone at this server and your sleep, HRV, weight, and workouts will flow in automatically.</p>
        </div>
      )}

      {s.lastSync && (
        <div style={{ marginTop: 16, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--dim)" }}>
          Last sync: {s.lastSync}
        </div>
      )}
    </div>
  );
}

// ── PANEL OVERLAY ─────────────────────────────────────────────────────────────
function PanelOverlay({ s, refresh, onClose }) {
  const [tab, setTab] = useState("mentor");
  return (
    <div className="panel-overlay">
      <div className="panel-backdrop" onClick={onClose} />
      <div className="panel-sheet">
        <div className="panel-head">
          <div className="panel-title">PRESS</div>
          <button className="panel-close" onClick={onClose}>✕ Close</button>
        </div>
        <div className="panel-nav">
          {[["mentor", "Mentor"], ["settings", "Profile"]].map(([key, label]) => (
            <button key={key} className={`panel-nav-btn${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        {tab === "mentor"   && <MentorContent s={s} refresh={refresh} />}
        {tab === "settings" && <SettingsContent s={s} refresh={refresh} onClose={onClose} />}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
const SECTIONS = ["s1", "s2", "s3", "s4", "s5"];

function App() {
  const [s, setS]           = useState(null);
  const [activeSection, setActiveSection] = useState(0);
  const [panel, setPanel]   = useState(false);
  const scrollRef           = useRef(null);

  const refresh = useCallback(() => api("summary").then(setS), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  // Intersection observer — tracks active section + reveals fades
  useEffect(() => {
    if (!s) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const sections = SECTIONS.map(id => document.getElementById(id)).filter(Boolean);

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add("visible");
        e.target.classList.remove("will-animate");
        const i = sections.indexOf(e.target);
        if (i >= 0) setActiveSection(i);
      });
    }, { root: scrollEl, threshold: 0.45 });

    // Mark off-screen sections as will-animate, in-view as visible
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (inView) { sec.classList.add("visible"); }
      else         { sec.classList.add("will-animate"); }
      obs.observe(sec);
    });

    return () => obs.disconnect();
  }, [s]);

  // Keyboard navigation
  useEffect(() => {
    let locked = false;
    const onKey = (e) => {
      if (panel) return;
      const dir = e.key === "ArrowDown" || e.key === "PageDown" ? 1 : e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0;
      if (!dir || locked) return;
      e.preventDefault();
      const el = scrollRef.current;
      if (!el) return;
      const h = el.clientHeight;
      const cur = Math.round(el.scrollTop / h);
      const tgt = Math.max(0, Math.min(SECTIONS.length - 1, cur + dir));
      if (tgt === cur) return;
      locked = true;
      el.style.scrollSnapType = "none";
      el.scrollTo({ top: tgt * h, behavior: "smooth" });
      const restore = () => { el.style.scrollSnapType = ""; locked = false; };
      "onscrollend" in el ? el.addEventListener("scrollend", restore, { once: true }) : setTimeout(restore, 700);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  if (!s) return (
    <div className="loading">
      <div className="loading-title">PRESS</div>
      <div className="loading-sub">Compiling today's edition…</div>
    </div>
  );

  return (
    <>
      <Masthead s={s} onMenu={() => setPanel(true)} />
      <div className="scroll" ref={scrollRef}>
        <S1Recovery s={s} />
        <S2Sleep    s={s} />
        <S3Training s={s} />
        <S4Fuel     s={s} />
        <S5Fatigue  s={s} />
      </div>
      <SectionNav active={activeSection} scrollRef={scrollRef} />
      {panel && <PanelOverlay s={s} refresh={refresh} onClose={() => setPanel(false)} />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
