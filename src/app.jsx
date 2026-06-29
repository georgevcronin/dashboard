import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";

const API_BASE = "https://europe-west2-pressnewsletter.cloudfunctions.net/api";
const api = p => fetch(`${API_BASE}/${p}`).then(r => r.json());

// ── MUSCLE FATIGUE ──────────────────────────────────────────────────────────
const MUSCLE_MAP = {
  'hack squat': ['quads','glutes'], 'squat': ['quads','glutes','hamstrings'],
  'leg press': ['quads','glutes'], 'leg curl': ['hamstrings'], 'leg extension': ['quads'],
  'lunge': ['quads','glutes','hamstrings'], 'hip thrust': ['glutes'], 'glute': ['glutes'],
  'deadlift': ['hamstrings','glutes','erectors','lats'], 'rdl': ['hamstrings','glutes','erectors'],
  'calf': ['calves'], 'pull up': ['lats','biceps'], 'chin up': ['lats','biceps'],
  'lat pulldown': ['lats','biceps'], 'row': ['lats','rhomboids','biceps'],
  'bench press': ['chest','triceps','front-delt'], 'chest press': ['chest','triceps','front-delt'],
  'fly': ['chest','front-delt'], 'dip': ['chest','triceps'],
  'overhead press': ['front-delt','triceps'], 'shoulder press': ['front-delt','triceps'],
  'lateral raise': ['rear-delt'], 'face pull': ['rear-delt','rhomboids'],
  'tricep': ['triceps'], 'triceps': ['triceps'],
  'bicep': ['biceps'], 'curl': ['biceps'],
  'ab': ['abs'], 'crunch': ['abs'], 'plank': ['abs'], 'sit up': ['abs'],
  'oblique': ['obliques'], 'shrug': ['traps'], 'trap': ['traps'],
  'forearm': ['forearms'], 'wrist': ['forearms'],
};
const RECOVERY_H = {
  quads: 72, glutes: 72, hamstrings: 72, calves: 48, adductors: 72,
  chest: 72, triceps: 48, biceps: 48, lats: 72, rhomboids: 48,
  traps: 48, erectors: 72, abs: 36, obliques: 36,
  'front-delt': 48, 'rear-delt': 48, forearms: 36, neck: 24,
};
function computeFatigue(lifts) {
  if (!lifts?.length) return {};
  const now = Date.now();
  const scores = {};
  lifts.forEach(l => {
    const t = new Date(l.start || l.date).getTime();
    const hoursAgo = (now - t) / 3_600_000;
    const load = (l.kg || 0) * (l.reps || 1);
    const name = (l.exercise || '').toLowerCase();
    for (const [key, muscles] of Object.entries(MUSCLE_MAP)) {
      if (name.includes(key)) {
        muscles.forEach(m => {
          const hl = RECOVERY_H[m] || 72;
          const decay = Math.exp(-0.693 * hoursAgo / hl);
          scores[m] = (scores[m] || 0) + load * decay;
        });
        break;
      }
    }
  });
  const max = Math.max(...Object.values(scores), 1);
  const out = {};
  Object.entries(scores).forEach(([m, v]) => { out[m] = Math.min(100, Math.round(v / max * 100)); });
  return out;
}

// ── CSS ─────────────────────────────────────────────────────────────────────
const PRESS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=JetBrains+Mono:wght@400;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#f5f0e2;--paper2:#ede8d4;--ink:#0d0b08;--rule:#c4b898;--dim:#8a7a5c;--gold:#6b5800;--navy:#1a2f54;--forest:#1a4f2a;--ember:#7a3400;--red:#7a1414;--hdr:72px}
html,body{height:100%;background:var(--paper)}
body{font-family:'Times New Roman',Times,Georgia,serif;overflow:hidden;color:var(--ink)}
.hdr{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--paper);border-bottom:3px solid var(--ink)}
.masthead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 20px 6px;border-bottom:1px solid var(--rule)}
.mast-left{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.mast-title{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(22px,5vw,30px);letter-spacing:-.01em;text-align:center;color:var(--ink)}
.mast-right{text-align:right;font-size:8px;letter-spacing:.12em;color:var(--dim);white-space:nowrap}
.ticker-wrap{background:var(--paper2);overflow:hidden;height:28px;display:flex;align-items:center;border-top:1px solid var(--rule)}
.ticker-track{display:flex;gap:0;animation:rtl 28s linear infinite;white-space:nowrap}
.ticker-track:hover{animation-play-state:paused}
@keyframes rtl{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.tick{display:inline-flex;gap:8px;align-items:center;padding:0 20px;font-size:10px;letter-spacing:.06em;border-right:1px solid var(--rule);font-family:'JetBrains Mono',monospace}
.t-sym{color:var(--rule)}.t-val{color:var(--dim)}.t-up{color:var(--forest)}.t-dn{color:var(--red)}
.scroll{position:fixed;top:var(--hdr);bottom:0;left:0;right:0;overflow-y:scroll;scroll-snap-type:y mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch}
.scroll::-webkit-scrollbar{display:none}
section{height:calc(100svh - var(--hdr));scroll-snap-align:start;overflow:hidden;position:relative;border-bottom:3px solid var(--ink);padding:24px 20px 20px;display:flex;flex-direction:column}
.fade{opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s ease}
section.visible .fade{opacity:1;transform:translateY(0)}
section.visible .fade:nth-child(2){transition-delay:.10s}
section.visible .fade:nth-child(3){transition-delay:.20s}
section.visible .fade:nth-child(4){transition-delay:.32s}
section.visible .fade:nth-child(5){transition-delay:.45s}
section.visible .fade:nth-child(6){transition-delay:.56s}
@media(prefers-reduced-motion:reduce){.fade,.ticker-track{animation:none;transition:none}.fade{opacity:1;transform:none}}
.kicker{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--ink);display:inline-block;padding-bottom:2px;margin-bottom:8px}
.headline{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(26px,6.5vw,44px);line-height:1.0;letter-spacing:-.01em;color:var(--ink);margin-bottom:10px}
.deck{font-size:12px;font-style:italic;color:var(--dim);line-height:1.5;border-left:2px solid var(--gold);padding-left:10px;margin-bottom:14px}
.pull{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(14px,3.5vw,18px);line-height:1.4;color:var(--dim);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:10px 0;margin:12px 0}
.pull strong{font-style:normal;color:var(--gold)}
.stat-cols{display:grid;gap:0}
.stat-cols-2{grid-template-columns:1fr 1fr}
.stat-cols-3{grid-template-columns:1fr 1fr 1fr}
.stat-cols-4{grid-template-columns:repeat(4,1fr)}
.stat-cell{padding:10px 0;border-right:1px solid var(--rule);padding-right:14px;padding-left:2px}
.stat-cell:last-child{border-right:none;padding-right:0}
.stat-cell+.stat-cell{padding-left:14px}
.sc-label{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.sc-num{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(22px,5vw,32px);letter-spacing:-.03em;line-height:1;color:var(--ink)}
.sc-num.gold{color:var(--gold)}.sc-num.navy{color:var(--navy)}.sc-num.forest{color:var(--forest)}.sc-num.red{color:var(--red)}
.sc-delta{font-size:9px;margin-top:3px}.up{color:var(--forest)}.dn{color:var(--red)}
.chart-wrap{flex:1;min-height:0;position:relative;margin:0 -20px;padding:0 20px}
.ch{width:100%;height:100%;display:block;overflow:visible}
.rule-bold{height:2px;background:var(--ink);margin:10px 0}
.rule-thin{height:1px;background:var(--rule);margin:10px 0}
.data-table{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace}
.data-table th{font-size:7px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);padding:4px 0;text-align:right;font-weight:400;border-bottom:1px solid var(--rule)}
.data-table th:first-child{text-align:left}
.data-table td{font-size:11px;padding:6px 0;text-align:right;color:var(--dim);border-bottom:1px solid var(--paper2)}
.data-table td:first-child{text-align:left;color:var(--ink)}
.data-table td.hi{color:var(--ink);font-weight:600}.data-table td.up{color:var(--forest)}.data-table td.dn{color:var(--red)}.data-table td.gld{color:var(--gold);font-weight:600}
.macro{margin-bottom:7px}
.macro-lbl{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-bottom:3px}
.macro-track{height:5px;background:var(--paper2);border-radius:1px}
.macro-fill{height:100%;border-radius:1px}
.sec-nav{position:fixed;right:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:200}
.sn-dot{width:5px;height:5px;border-radius:50%;background:var(--rule);cursor:pointer;transition:all .3s}
.sn-dot.active{background:var(--ink);transform:scale(1.6)}
.prog-head{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-bottom:9px}
.prog-row{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.prog-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.prog-label{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);width:68px;flex-shrink:0}
.prog-track{flex:1;height:7px;background:var(--paper2);border-radius:1px;overflow:hidden}
.prog-fill{height:100%;border-radius:1px}
.prog-val{font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--dim);width:80px;text-align:right;flex-shrink:0;white-space:nowrap}
.prog-sub{opacity:.45}
.body-view svg{display:block}
.ol-hdr{position:sticky;top:0;background:var(--paper);border-bottom:3px solid var(--ink);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;z-index:10}
.ol-btn{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:6px 14px;cursor:pointer;border:none}
.ol-btn-ghost{background:none;border:1px solid var(--rule)!important;color:var(--dim)}
.ol-btn-solid{background:var(--ink);color:var(--paper)}
.set-input{width:52px;text-align:right;background:none;border:none;border-bottom:1px solid var(--rule);font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;padding:2px 0}
.ex-input{flex:1;background:none;border:none;border-bottom:2px solid var(--ink);font-family:'Times New Roman',serif;font-style:italic;font-size:15px;color:var(--ink);outline:none;padding:4px 0}
.action-row{display:flex;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--rule)}
.action-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;cursor:pointer;text-align:center;border:1px solid var(--ink);background:none;color:var(--ink)}
.action-btn.primary{background:var(--ink);color:var(--paper)}
`;

// ── HELPERS ─────────────────────────────────────────────────────────────────
const fmtDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const pct = (v, t) => (t && t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0);

function AreaChart({ data, color, id }) {
  if (!data?.length) return null;
  const W = 320, H = 100;
  const mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const lo = mn - rng * 0.07, r = (mx + rng * 0.07) - lo;
  const pts = data.map((v, i) => [+(i / (data.length - 1) * W).toFixed(1), +(H - (v - lo) / r * H).toFixed(1)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const mx2 = (pts[i-1][0] + pts[i][0]) / 2;
    d += ` C${mx2},${pts[i-1][1]} ${mx2},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
  }
  const lp = pts[pts.length - 1];
  const gid = (id || 'g') + color.replace(/[^a-z0-9]/gi, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} y1={f*H} x2={W} y2={f*H} stroke="#c4b898" strokeWidth="1" strokeDasharray="2,4" />)}
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H}Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lp[0]} cy={lp[1]} r="3" fill={color} />
    </svg>
  );
}

function BarChart({ data, color }) {
  if (!data?.filter(Boolean).length) return null;
  const W = 320, H = 60;
  const mx = Math.max(...data) * 1.12 || 1;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
      {data.map((v, i) => {
        const h = (v / mx) * H;
        return <rect key={i} x={i*bw+1.5} y={H-h} width={bw-3} height={Math.max(h,0)} fill={i===data.length-1 ? color : color+'60'} rx={1} />;
      })}
    </svg>
  );
}

// ── HEADER ──────────────────────────────────────────────────────────────────
function Header({ s }) {
  const today = s?.today || {};
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const steps = today.steps != null ? Math.round(today.steps * 1000) : null;

  const items = [
    { sym: '$RCVRY',   val: today.recovery != null ? `${Math.round(today.recovery)}` : '—',   chg: null, up: true },
    { sym: '$SLEEP',   val: today.sleepH != null ? `${today.sleepH.toFixed(1)}h` : '—',       chg: null, up: true },
    { sym: '$HRV',     val: today.hrv != null ? `${today.hrv}ms` : '—',                       chg: null, up: true },
    { sym: '$RHR',     val: today.rhr != null ? `${today.rhr}bpm` : '—',                      chg: null, up: false },
    { sym: '$STEPS',   val: steps ? steps.toLocaleString() : '—', chg: steps ? `${pct(steps, 10000)}%` : null, up: steps >= 8000 },
    { sym: '$KCAL',    val: n.calories ? `${n.calories}` : '—', chg: mt.calories ? `${pct(n.calories, mt.calories)}%` : null, up: pct(n.calories, mt.calories) >= 80 },
    { sym: '$PROTEIN', val: n.protein ? `${n.protein}g` : '—', chg: mt.protein ? `${pct(n.protein, mt.protein)}%` : null, up: pct(n.protein, mt.protein) >= 80 },
    { sym: '$MASS',    val: s?.weights?.[0]?.value ? `${s.weights[0].value}kg` : '—', chg: null, up: true },
  ];

  return (
    <div className="hdr">
      <div className="masthead">
        <div className="mast-left">Vol. I &nbsp;·&nbsp; Est. 2026</div>
        <div className="mast-title">PRESS</div>
        <div className="mast-right">{fmtDateShort()}<br />{s?.profile?.name || 'George'} V. Cronin</div>
      </div>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...items, ...items].map((t, i) => (
            <div key={i} className="tick">
              <span className="t-sym">{t.sym}</span>
              <span className="t-val">{t.val}</span>
              {t.chg && <span className={t.up ? 't-up' : 't-dn'}>{t.chg}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── S1: FRONT PAGE ───────────────────────────────────────────────────────────
function S1({ s }) {
  const today = s?.today || {};
  const recovery = today.recovery ?? s?.recoveryTrend?.at(-1) ?? null;
  const hrv = today.hrv;
  const rhr = today.rhr;
  const sleep = today.sleepH;
  const sleepEff = today.sleepEff;
  const sleepDebt = s?.sleepDebtH ?? 0;
  const fatigue = useMemo(() => computeFatigue(s?.lifts), [s?.lifts]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b) => a+b, 0) / fatigueVals.length) : null;
  const steps = today.steps != null ? Math.round(today.steps * 1000) : null;
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const protein = n.protein || 0;
  const proteinTarget = mt.protein || 160;
  const sleepTarget = s?.sleepTarget || 8;

  let hl1 = 'Morning', hl2 = 'Dispatch';
  if (recovery != null) {
    if (recovery >= 80)      { hl1 = 'Body Clears'; hl2 = 'for Heavy Load'; }
    else if (recovery >= 65) { hl1 = 'Steady State —'; hl2 = 'Build Today'; }
    else                     { hl1 = 'Recovery Day —'; hl2 = 'Light Work Only'; }
  }

  const hrvDelta = hrv != null && s?.baselines?.hrv != null ? Math.round(hrv - s.baselines.hrv) : null;
  const rhrDelta = rhr != null && s?.baselines?.rhr != null ? Math.round(rhr - s.baselines.rhr) : null;
  const recoveryTrend = s?.recoveryTrend || [];

  const thought = s?.thoughts?.[0]?.text;

  return (
    <section id="s1" style={{ padding: '18px 20px 16px', justifyContent: 'space-between' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Today's Edition · {fmtDate()} · Recovery &amp; Readiness</div>
        <div className="headline" style={{ fontSize: 'clamp(30px,8vw,52px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
      </div>

      <div className="fade" style={{ flex: 1, display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 0, borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '12px 0', overflow: 'hidden' }}>
        {/* Left: recovery number + ghost chart */}
        <div style={{ width: '44%', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '14px 16px 14px 0', borderRight: '1px solid var(--rule)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none' }}>
            <AreaChart data={recoveryTrend.length ? recoveryTrend : s?.sleepSeries || []} color="#6b5800" id="ghost" />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="sc-label" style={{ marginBottom: 6 }}>Recovery · Today</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 'clamp(64px,17vw,106px)', lineHeight: '.82', letterSpacing: '-.05em', color: 'var(--gold)' }}>
              {recovery != null ? Math.round(recovery) : '—'}<span style={{ fontSize: '.32em', color: 'var(--rule)', letterSpacing: 0, fontWeight: 700 }}> /100</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--forest)', marginTop: 10, letterSpacing: '.04em' }}>
              {recovery != null ? (recovery >= 70 ? '▲ TRAIN HEAVY' : recovery >= 50 ? '→ TRAIN MODERATE' : '▼ REST OR LIGHT') : 'AWAITING DATA'}
            </div>
          </div>
        </div>

        {/* Right: 4 vitals */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px 0 12px 16px' }}>
          <div>
            <div className="sc-label">HRV</div>
            <div className="sc-num navy" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{hrv != null ? hrv : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>ms</span></div>
            <div className="sc-delta up">{hrvDelta != null ? `${hrvDelta >= 0 ? '▲' : '▼'} ${Math.abs(hrvDelta)} vs baseline` : `Baseline: ${s?.baselines?.hrv ?? '—'}ms`}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Resting HR</div>
            <div className="sc-num forest" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{rhr != null ? rhr : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>bpm</span></div>
            <div className="sc-delta up">{rhrDelta != null ? `${rhrDelta <= 0 ? '▼' : '▲'} ${Math.abs(rhrDelta)} vs baseline` : `Baseline: ${s?.baselines?.rhr ?? '—'}bpm`}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Sleep</div>
            <div className="sc-num" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{sleep != null ? sleep.toFixed(1) : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>h</span></div>
            <div className="sc-delta" style={{ color: 'var(--dim)' }}>
              {sleep != null ? `${sleepEff != null ? `${Math.round(sleepEff * 100)}% eff · ` : ''}${sleepDebt.toFixed(1)}h debt` : `Target: ${sleepTarget}h`}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Fatigue</div>
            <div className="sc-num red" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{overallFatigue != null ? overallFatigue : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>/100</span></div>
            <div className="sc-delta up">{overallFatigue != null ? (overallFatigue < 40 ? 'Low — cleared for heavy load' : overallFatigue < 70 ? 'Moderate — train smart' : 'High — recovery first') : 'No recent sessions'}</div>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="prog-head">Daily Progress</div>
        {[
          { label: 'Sleep',    color: '#1a2f54', val: sleep,                       target: sleepTarget,   fmt: v => `${v.toFixed(1)}h`,                 tgt: `${sleepTarget}` },
          { label: 'Recovery', color: '#6b5800', val: recovery,                    target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
          { label: 'Steps',    color: '#1a4f2a', val: steps ? steps/1000 : null,   target: 10,            fmt: v => `${Math.round(v*1000).toLocaleString()}`, tgt: '10k' },
          { label: 'Protein',  color: '#7a3400', val: protein,                     target: proteinTarget, fmt: v => `${Math.round(v)}g`,                  tgt: `${proteinTarget}g` },
          { label: 'Fatigue',  color: '#7a1414', val: overallFatigue,              target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
        ].map(({ label, color, val, target, fmt, tgt }, i) => {
          const p = val != null && target ? Math.min(100, val / target * 100) : 0;
          return (
            <div key={label} className="prog-row" style={i === 4 ? { marginBottom: 0 } : {}}>
              <div className="prog-dot" style={{ background: color }} />
              <div className="prog-label">{label}</div>
              <div className="prog-track"><div className="prog-fill" style={{ width: `${p}%`, background: color }} /></div>
              <div className="prog-val" style={{ color }}>
                {val != null ? fmt(val) : '—'} <span className="prog-sub">/ {tgt}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pull quote */}
      <div className="pull fade" style={{ margin: '10px 0 0', fontSize: 'clamp(12px,3vw,15px)' }}
        dangerouslySetInnerHTML={{ __html: thought
          ? `"${thought}"`
          : '"The body adapts to what you consistently demand of it. <strong>Consistency compounds.</strong>"' }} />
    </section>
  );
}

// ── S2: SLEEP ────────────────────────────────────────────────────────────────
function S2({ s }) {
  const series = s?.sleepSeries || [];
  const sleepTarget = s?.sleepTarget || 8;
  const debt = s?.sleepDebtH ?? 0;
  const todaySleep = s?.today?.sleepH;
  const eff = s?.today?.sleepEff;

  const hi = series.length ? Math.max(...series).toFixed(1) : '—';
  const lo = series.length ? Math.min(...series).toFixed(1) : '—';
  const avg = series.length ? (series.reduce((a,b) => a+b,0) / series.length).toFixed(2) : '—';
  const effPct = eff != null ? Math.round(eff * 100) : null;

  return (
    <section id="s2">
      <div className="fade">
        <div className="kicker">Health · Sleep Analysis · {series.length}‑Night</div>
        <div className="headline">
          {todaySleep != null ? `${todaySleep.toFixed(1)} Hours —` : 'Sleep'}<br />
          {effPct != null ? `${effPct}% Efficiency` : 'Trend Analysis'}
        </div>
        <div className="deck">
          {debt > 0
            ? `Sleep debt stands at ${debt.toFixed(1)} hours. Consistent nights above target needed to clear it.`
            : 'Sleep debt cleared. Maintain consistent bedtimes to hold this position.'}
        </div>
      </div>
      <div className="chart-wrap fade" style={{ flex: 1, minHeight: 0 }}>
        {series.length
          ? <AreaChart data={series} color="#1a2f54" id="sleep" />
          : <div style={{ color: 'var(--dim)', fontStyle: 'italic', fontSize: 13, padding: '20px 0' }}>Sleep data syncing.</div>}
      </div>
      <div className="fade">
        <div className="stat-cols stat-cols-4" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <div className="stat-cell"><div className="sc-label">{series.length}N High</div><div className="sc-num" style={{ fontSize: 22 }}>{hi}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Low</div><div className="sc-num red" style={{ fontSize: 22 }}>{lo}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Avg</div><div className="sc-num" style={{ fontSize: 22 }}>{avg}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">Sleep Debt</div><div className="sc-num red" style={{ fontSize: 22 }}>{debt.toFixed(1)}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
        </div>
      </div>
    </section>
  );
}

// ── WORKOUT LOGGER ───────────────────────────────────────────────────────────
const BASE_EXERCISES = [
  'back squat','front squat','hack squat','leg press','leg curl','leg extension',
  'lunge','bulgarian split squat','hip thrust','glute bridge','romanian deadlift',
  'deadlift','sumo deadlift','calf raise','seated calf raise',
  'pull up','chin up','lat pulldown','seated row','cable row','barbell row','dumbbell row','t-bar row',
  'bench press','incline bench press','decline bench press','dumbbell press','incline dumbbell press',
  'cable fly','dumbbell fly','dip','push up',
  'overhead press','dumbbell shoulder press','arnold press','lateral raise','front raise','face pull','rear delt fly',
  'barbell curl','dumbbell curl','hammer curl','preacher curl','cable curl',
  'tricep pushdown','skull crusher','overhead tricep extension','close grip bench press',
  'plank','crunch','cable crunch','leg raise','ab rollout','russian twist',
  'shrug','farmer carry','wrist curl',
];

const e1rm = (kg, reps) => (kg > 0 && reps > 0) ? Math.round(kg * (1 + reps / 30)) : null;
const SET_TYPES = ['W','N','D','F'];
const SET_LABELS = { W: 'Warm-up', N: 'Normal', D: 'Drop Set', F: 'Failure' };
const REST_DEFAULT = 90;
const COMPOUND = ['squat','deadlift','bench press','overhead press','barbell row','pull up','chin up','romanian deadlift','hip thrust'];
const LOWER_BODY = ['squat','deadlift','leg press','lunge','hip thrust','romanian deadlift','bulgarian'];

const cnsLoad = exercises => {
  let score = 0;
  for (const ex of exercises) {
    const mult = COMPOUND.some(c => ex.name.includes(c)) ? 2.2 : 1;
    for (const s of ex.sets) if (s.type !== 'W' && s.done && +s.kg > 0) score += +s.kg * (+s.reps || 1) * mult;
  }
  if (score < 3000) return { label: 'Light', color: 'var(--forest)' };
  if (score < 9000) return { label: 'Moderate', color: 'var(--gold)' };
  if (score < 20000) return { label: 'Heavy', color: 'var(--ember)' };
  return { label: 'Max Effort', color: 'var(--red)' };
};

const getProgression = (name, prevSets, lifts) => {
  if (!prevSets?.length) return null;
  const byDate = {};
  for (const l of lifts.filter(l => l.exercise === name)) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }
  const dates = Object.keys(byDate).sort();
  if (dates.length < 2) return null;
  const last = byDate[dates.at(-1)];
  const prev2 = byDate[dates.at(-2)];
  const lastMax = Math.max(...last.map(s => s.kg));
  const prev2Max = Math.max(...prev2.map(s => s.kg));
  const lastTopSet = last.find(s => s.kg === lastMax);
  const inc = LOWER_BODY.some(k => name.includes(k)) ? 5 : 2.5;
  if (lastTopSet?.reps >= 5) return `↑ Try ${lastMax + inc}kg — hit ${lastTopSet.reps} reps at ${lastMax}kg`;
  if (lastMax > prev2Max) return `↑ Progressed last session — hold ${lastMax}kg`;
  if (lastTopSet?.reps >= 3) return `Hold ${lastMax}kg — ${lastTopSet.reps} reps last time`;
  return `↓ Consider ${Math.max(0, lastMax - inc * 2)}kg — missed reps at ${lastMax}kg`;
};

const sessionFatigue = exercises => {
  const scores = {};
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (!s.done) continue;
      const load = (+s.kg || 0) * (+s.reps || 1);
      for (const [key, muscles] of Object.entries(MUSCLE_MAP)) {
        if (ex.name.includes(key)) { muscles.forEach(m => { scores[m] = (scores[m] || 0) + load; }); break; }
      }
    }
  }
  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(Object.entries(scores).map(([m, v]) => [m, Math.min(100, Math.round(v / max * 100))]));
};

function ExHistoryChart({ name, lifts }) {
  const pts = useMemo(() => {
    const byDate = {};
    for (const l of lifts.filter(l => l.exercise === name)) {
      const v = e1rm(l.kg, l.reps);
      if (v && (!byDate[l.date] || v > byDate[l.date])) byDate[l.date] = v;
    }
    return Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-16).map(([d,v]) => ({ d, v }));
  }, [name, lifts]);

  if (pts.length < 2) return <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', padding: '8px 0' }}>Not enough history.</div>;

  const vals = pts.map(p => p.v);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const W = 300, H = 70;
  const x = i => (i / (pts.length - 1)) * W;
  const y = v => H - ((v - mn) / rng) * (H - 8) - 4;
  let d = `M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx2 = (x(i-1) + x(i)) / 2;
    d += ` C${mx2},${y(pts[i-1].v)} ${mx2},${y(pts[i].v)} ${x(i).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
  }
  const last = pts.at(-1);

  return (
    <div style={{ margin: '8px 0 12px', padding: '10px 12px', background: 'var(--paper2)', borderLeft: '2px solid var(--navy)' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
        e1RM History · {pts.length} sessions · Peak {Math.max(...vals)}kg
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70, display: 'block' }} preserveAspectRatio="none">
        <path d={`${d} L${W},${H} L0,${H}Z`} fill="var(--navy)" opacity=".12" />
        <path d={d} fill="none" stroke="var(--navy)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx={x(pts.length-1)} cy={y(last.v)} r="3" fill="var(--navy)" />
        <text x={x(pts.length-1)-2} y={y(last.v)-6} textAnchor="end" fontSize="8" fill="var(--navy)" fontFamily="JetBrains Mono,monospace">{last.v}kg</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
        <span>{new Date(pts[0].d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
        <span>{new Date(last.d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
      </div>
    </div>
  );
}

function WorkoutLogger({ planDay, lifts, onClose, refresh }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(!!planDay);
  const [expandedEx, setExpandedEx] = useState(null);
  const [coachNotes, setCoachNotes] = useState({});
  const [coachLoading, setCoachLoading] = useState({});
  const [newEx, setNewEx] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [start] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef();

  const allExercises = useMemo(() => {
    const fromLifts = [...new Set((lifts || []).map(l => l.exercise).filter(Boolean))];
    return [...new Set([...fromLifts, ...BASE_EXERCISES])].sort();
  }, [lifts]);

  const prevData = useMemo(() => {
    const byEx = {};
    for (const l of (lifts || [])) {
      if (!byEx[l.exercise]) byEx[l.exercise] = {};
      if (!byEx[l.exercise][l.date]) byEx[l.exercise][l.date] = [];
      byEx[l.exercise][l.date].push(l);
    }
    const out = {};
    for (const [ex, byDate] of Object.entries(byEx)) {
      const d = Object.keys(byDate).sort().at(-1);
      if (d) out[ex] = { date: d, sets: byDate[d] };
    }
    return out;
  }, [lifts]);

  const prData = useMemo(() => {
    const out = {};
    for (const l of (lifts || [])) {
      const v = e1rm(l.kg, l.reps);
      if (v && v > (out[l.exercise] || 0)) out[l.exercise] = v;
    }
    return out;
  }, [lifts]);

  // Load AI-generated template when starting from plan
  useEffect(() => {
    if (!planDay) return;
    const session = planDay.sessions?.[0];
    if (!session || session.type === 'rest') { setLoading(false); return; }
    fetch(`${API_BASE}/plan/session-exercises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: session.type, title: session.title, detail: session.detail, duration: session.duration }),
    }).then(r => r.json()).then(data => {
      if (data.exercises?.length) {
        setExercises(data.exercises.map(ex => {
          const key = ex.name.toLowerCase().trim();
          const prev = prevData[key];
          return {
            name: key, bw: false, note: '',
            sets: ex.sets.map((s, idx) => ({
              type: s.type || 'N',
              kg: prev?.sets?.[idx] ? String(prev.sets[idx].kg) : String(s.kg || ''),
              reps: String(s.reps || ''),
              rir: '', done: false,
            })),
          };
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!rest || rest.remaining <= 0) { if (rest) setRest(null); return; }
    const t = setTimeout(() => setRest(r => r ? { ...r, remaining: r.remaining - 1 } : null), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const onSearchChange = val => {
    setNewEx(val);
    if (!val.trim()) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    setSuggestions(allExercises.filter(e => e.includes(q)).slice(0, 8));
  };

  const addExercise = name => {
    if (!name.trim()) return;
    const key = name.toLowerCase().trim();
    const prev = prevData[key];
    const sets = prev?.sets?.map(s => ({ type: 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rir: '', done: false }))
      || [{ type: 'N', kg: '', reps: '', rir: '', done: false }];
    setExercises(p => [...p, { name: key, bw: false, note: '', sets }]);
    setNewEx(''); setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const removeExercise = i => setExercises(p => p.filter((_, j) => j !== i));

  const addSet = i => setExercises(p => p.map((ex, j) => j !== i ? ex : {
    ...ex, sets: [...ex.sets, { type: 'N', kg: ex.sets.at(-1)?.kg || '', reps: ex.sets.at(-1)?.reps || '', rir: '', done: false }]
  }));

  const updateSet = (ei, si, field, val) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }
  ));

  const cycleType = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: SET_TYPES[(SET_TYPES.indexOf(s.type) + 1) % SET_TYPES.length] }) }
  ));

  const completeSet = (ei, si) => {
    updateSet(ei, si, 'done', true);
    setRest({ remaining: REST_DEFAULT, total: REST_DEFAULT });
  };

  const removeSet = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) }
  ).filter(ex => ex.sets.length > 0));

  const loadCoach = async name => {
    if (coachNotes[name] || coachLoading[name]) return;
    setCoachLoading(p => ({ ...p, [name]: true }));
    try {
      const d = await api(`coach/${encodeURIComponent(name)}`);
      setCoachNotes(p => ({ ...p, [name]: d.note || '' }));
    } finally { setCoachLoading(p => ({ ...p, [name]: false })); }
  };

  const finish = async () => {
    const valid = exercises.map(ex => ({
      ...ex, sets: ex.sets.filter(s => s.done || s.kg !== '' || s.reps !== ''),
    })).filter(ex => ex.sets.length > 0);
    if (!valid.length) { onClose(); return; }
    setSaving(true);
    await fetch(`${API_BASE}/workout/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: planDay?.sessions?.[0]?.title || 'Session', exercises: valid, duration: Math.round(elapsed / 60) }),
    });
    await api('summary').then(refresh);
    onClose();
  };

  const session = planDay?.sessions?.[0];
  const cns = cnsLoad(exercises);
  const fatigue = sessionFatigue(exercises);
  const fatigueMuscles = Object.entries(fatigue).sort(([,a],[,b]) => b - a);
  const th = { fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400, padding: '3px 0', borderBottom: '1px solid var(--rule)', textAlign: 'right' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: rest ? 72 : 0 }}>

      {/* Header */}
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>In Session</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(elapsed)}</div>
            {exercises.some(e => e.sets.some(s => s.done)) && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 7px', background: cns.color, color: 'var(--paper)' }}>{cns.label}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ol-btn ol-btn-ghost" onClick={onClose}>Discard</button>
          <button className="ol-btn ol-btn-solid" onClick={finish} disabled={saving}>{saving ? 'Saving…' : 'Finish'}</button>
        </div>
      </div>

      {/* Loading template */}
      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em' }}>
          Generating session plan…
        </div>
      )}

      {!loading && (
        <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* AI plan context */}
          {session && (
            <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--gold)', background: 'var(--paper2)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>{session.type} · {session.duration}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, marginBottom: 4 }}>{session.title}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>{session.detail}</div>
            </div>
          )}

          {/* Fatigue impact preview */}
          {fatigueMuscles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Session Fatigue</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fatigueMuscles.map(([m, pct]) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: pct > 70 ? 'var(--ember)' : pct > 35 ? 'var(--gold)' : 'var(--forest)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise blocks */}
          {exercises.map((ex, i) => {
            const prev = prevData[ex.name];
            const doneE1rms = ex.sets.filter(s => s.done && !ex.bw).map(s => e1rm(+s.kg, +s.reps)).filter(Boolean);
            const bestE1rm = doneE1rms.length ? Math.max(...doneE1rms) : null;
            const isPR = bestE1rm && bestE1rm > (prData[ex.name] || 0);
            const vol = ex.sets.filter(s => s.done).reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 1), 0);
            const progression = getProgression(ex.name, prev?.sets, lifts);
            const isExpanded = expandedEx === i;
            const coach = coachNotes[ex.name];
            const isLoadingCoach = coachLoading[ex.name];

            return (
              <div key={i} style={{ marginBottom: 22, paddingBottom: 16, borderBottom: '2px solid var(--ink)' }}>
                {/* Exercise header row */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                  <button onClick={() => setExpandedEx(isExpanded ? null : i)}
                    style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 17, textTransform: 'capitalize', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}>
                    {ex.name} {isExpanded ? '▲' : '▸'}
                  </button>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {isPR && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', background: 'var(--gold)', color: 'var(--paper)', padding: '2px 6px' }}>PR</span>}
                    {bestE1rm && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>e1RM {bestE1rm}kg</span>}
                    <button onClick={() => removeExercise(i)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                </div>

                {/* History chart (expanded) */}
                {isExpanded && <ExHistoryChart name={ex.name} lifts={lifts} />}

                {/* Previous performance */}
                {prev && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>
                    {new Date(prev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {prev.sets.map(s => ex.bw ? `BW×${s.reps}` : `${s.kg}×${s.reps}`).join(', ')}
                  </div>
                )}

                {/* Progressive overload suggestion */}
                {progression && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: progression.startsWith('↓') ? 'var(--ember)' : 'var(--forest)', marginBottom: 5 }}>
                    {progression}
                  </div>
                )}

                {/* AI coaching note */}
                <div style={{ marginBottom: 8 }}>
                  {coach
                    ? <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>"{coach}"</div>
                    : <button onClick={() => loadCoach(ex.name)} disabled={isLoadingCoach}
                        style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, opacity: isLoadingCoach ? .5 : 1 }}>
                        {isLoadingCoach ? 'Loading cue…' : '+ Coaching cue'}
                      </button>
                  }
                </div>

                {/* BW toggle + volume */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <button onClick={() => setExercises(p => p.map((e, j) => j !== i ? e : { ...e, bw: !e.bw }))}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer', border: '1px solid var(--rule)', background: ex.bw ? 'var(--ink)' : 'none', color: ex.bw ? 'var(--paper)' : 'var(--dim)' }}>
                    BW
                  </button>
                  {vol > 0 && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{Math.round(vol).toLocaleString()} kg total</span>}
                </div>

                {/* Sets table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left', width: 26 }}>Set</th>
                      <th style={{ ...th, width: 56 }}>Prev</th>
                      {!ex.bw && <th style={{ ...th, width: 48 }}>kg</th>}
                      <th style={{ ...th, width: 38 }}>Reps</th>
                      <th style={{ ...th, width: 28 }}>RIR</th>
                      <th style={{ ...th, width: 26 }}>✓</th>
                      <th style={{ ...th, width: 16 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((set, j) => {
                      const prevSet = prev?.sets?.[j];
                      const setE1rm = !ex.bw ? e1rm(+set.kg, +set.reps) : null;
                      const setIsPR = setE1rm && setE1rm > (prData[ex.name] || 0);
                      const isWorking = set.type !== 'W';
                      return (
                        <tr key={j} style={{ opacity: set.done ? 0.4 : 1 }}>
                          <td style={{ padding: '5px 0', textAlign: 'left' }}>
                            <button onClick={() => cycleType(i, j)} title={SET_LABELS[set.type]}
                              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, background: set.type === 'W' ? 'var(--navy)' : set.type === 'F' ? 'var(--ember)' : set.type === 'D' ? 'var(--gold)' : 'var(--paper2)', color: set.type !== 'N' ? 'var(--paper)' : 'var(--dim)', border: 'none', padding: '2px 4px', cursor: 'pointer', minWidth: 20, textAlign: 'center' }}>
                              {set.type === 'N' ? j + 1 : set.type}
                            </button>
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>
                            {prevSet ? (ex.bw ? `BW×${prevSet.reps}` : `${prevSet.kg}×${prevSet.reps}`) : '—'}
                          </td>
                          {!ex.bw && (
                            <td style={{ padding: '5px 0', textAlign: 'right' }}>
                              <input className="set-input" value={set.kg} onChange={e => updateSet(i, j, 'kg', e.target.value)}
                                inputMode="decimal" placeholder="—" disabled={set.done}
                                style={{ color: setIsPR ? 'var(--gold)' : 'var(--ink)', width: 42 }} />
                            </td>
                          )}
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            <input className="set-input" value={set.reps} onChange={e => updateSet(i, j, 'reps', e.target.value)}
                              inputMode="numeric" placeholder="—" disabled={set.done}
                              style={{ color: 'var(--ink)', width: 30 }} />
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            {isWorking
                              ? <input className="set-input" value={set.rir} onChange={e => updateSet(i, j, 'rir', e.target.value)}
                                  inputMode="numeric" placeholder="—" disabled={set.done}
                                  style={{ color: 'var(--dim)', width: 24 }} />
                              : <span style={{ color: 'var(--rule)', fontSize: 10 }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            {set.done
                              ? <span style={{ color: 'var(--forest)', fontSize: 13 }}>✓</span>
                              : <button onClick={() => completeSet(i, j)} style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', cursor: 'pointer', fontSize: 11, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                            }
                          </td>
                          <td style={{ textAlign: 'right', padding: '5px 0' }}>
                            <button onClick={() => removeSet(i, j)} style={{ background: 'none', border: 'none', color: 'var(--rule)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8 }} onClick={() => addSet(i)}>+ Set</button>
              </div>
            );
          })}

          {/* Exercise search */}
          <div style={{ position: 'relative', marginTop: 8, paddingBottom: 40 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input ref={inputRef} className="ex-input" value={newEx}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addExercise(newEx); if (e.key === 'Escape') { setSuggestions([]); setNewEx(''); } }}
                placeholder="Search or add exercise…" autoComplete="off" />
              {newEx.trim() && <button className="ol-btn ol-btn-solid" onClick={() => addExercise(newEx)}>Add</button>}
            </div>
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper)', border: '1px solid var(--ink)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                {suggestions.map(ex => (
                  <div key={ex} onClick={() => addExercise(ex)}
                    style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize', cursor: 'pointer', borderBottom: '1px solid var(--paper2)', color: 'var(--ink)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{ex}</div>
                ))}
                {!allExercises.includes(newEx.toLowerCase().trim()) && newEx.trim() && (
                  <div onClick={() => addExercise(newEx)}
                    style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, cursor: 'pointer', color: 'var(--gold)', borderTop: '1px solid var(--rule)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    + Use "{newEx.trim()}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rest timer */}
      {rest && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--ink)', color: 'var(--paper)', zIndex: 1100, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 2 }}>
            <div style={{ height: '100%', background: 'var(--paper)', borderRadius: 2, width: `${(rest.remaining / rest.total) * 100}%`, transition: 'width 1s linear' }} />
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>Rest {fmt(rest.remaining)}</div>
          <button onClick={() => setRest(null)} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,.3)', color: 'var(--paper)', padding: '4px 10px', cursor: 'pointer' }}>Skip</button>
        </div>
      )}
    </div>
  );
}

// ── HEVY IMPORT ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const vals = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').replace(/^"|"$/g, '')]));
  });
}

function parseHevyCSV(text) {
  const rows = parseCSV(text);
  const map = {};
  for (const row of rows) {
    const title = row['title'] || row['Title'] || row['Workout Name'] || 'Session';
    const startRaw = row['start_time'] || row['Start Time'] || row['Date'];
    if (!startRaw) continue;
    const key = `${title}__${startRaw}`;
    if (!map[key]) {
      const startMs = new Date(startRaw).getTime();
      const endRaw = row['end_time'] || row['End Time'];
      const endMs = endRaw ? new Date(endRaw).getTime() : null;
      const dateISO = new Date(startRaw).toISOString().split('T')[0];
      map[key] = {
        name: title,
        date: dateISO,
        duration: endMs ? Math.round((endMs - startMs) / 60000) : null,
        exercises: {},
      };
    }
    const exRaw = row['exercise_title'] || row['Exercise Name'] || row['Exercise'];
    if (!exRaw) continue;
    const exName = exRaw.toLowerCase().trim();
    if (!map[key].exercises[exName]) map[key].exercises[exName] = [];
    const kg = parseFloat(row['weight_kg'] ?? row['Weight (kg)'] ?? row['Weight']) || 0;
    const reps = parseInt(row['reps'] || row['Reps']) || 0;
    if (kg > 0 || reps > 0) map[key].exercises[exName].push({ kg, reps });
  }
  return Object.values(map).map(s => ({
    ...s,
    exercises: Object.entries(s.exercises).map(([name, sets]) => ({ name, sets })),
  })).filter(s => s.exercises.length > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function HevyImport({ onClose, refresh }) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseHevyCSV(ev.target.result);
        if (!parsed.length) { setError('No workout data found — make sure this is a Hevy CSV export.'); return; }
        setSessions(parsed);
        setStatus('parsed');
      } catch (err) { setError('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    setStatus('importing');
    const r = await fetch(`${API_BASE}/import/hevy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions }),
    }).then(r => r.json());
    setResult(r);
    if (r.ok) await api('summary').then(refresh);
    setStatus('done');
  };

  const totalSets = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Data Import</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700 }}>Hevy CSV</div>
        </div>
        <button className="ol-btn ol-btn-ghost" onClick={onClose}>Close</button>
      </div>

      <div style={{ padding: '20px' }}>
        {status === 'idle' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.7, marginBottom: 20 }}>
              In Hevy: <strong>Profile → Settings → Export Workout Data → CSV</strong>. Then select the downloaded file below. All sessions and lifts will be imported into Press.
            </div>
            {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ember)', marginBottom: 12 }}>{error}</div>}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
            <button className="ol-btn ol-btn-solid" onClick={() => fileRef.current?.click()}>Select CSV file</button>
          </>
        )}

        {status === 'parsed' && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 12, letterSpacing: '.06em' }}>
              {sessions.length} sessions · {sessions.reduce((a,s)=>a+s.exercises.length,0)} exercises · {totalSets} sets
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16, borderTop: '1px solid var(--rule)' }}>
              {sessions.slice(-40).reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{s.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                      {s.exercises.map(e => e.name).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', whiteSpace: 'nowrap', marginLeft: 12 }}>{s.date}</div>
                </div>
              ))}
              {sessions.length > 40 && <div style={{ padding: '8px 0', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>…and {sessions.length - 40} earlier sessions</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ol-btn ol-btn-solid" onClick={doImport}>Import {sessions.length} sessions</button>
              <button className="ol-btn ol-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {status === 'importing' && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em' }}>Importing…</div>
        )}

        {status === 'done' && (
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {result?.imported} sessions imported.
            </div>
            {result?.skipped > 0 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 12 }}>{result.skipped} already existed — skipped.</div>}
            <button className="ol-btn ol-btn-solid" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── S3: TRAINING ──────────────────────────────────────────────────────────────
function S3({ s, onStartWorkout, onImport }) {
  const workouts = s?.workouts || [];
  const lifts = s?.lifts || [];
  const liftVol = s?.liftVolume || [];
  const lastSession = workouts[0] || null;
  const sessionLifts = lastSession ? lifts.filter(l => l.date === lastSession.date) : [];
  const [genning, setGenning] = useState(false);

  const exerciseMap = {};
  sessionLifts.forEach(l => {
    if (!exerciseMap[l.exercise] || l.kg > exerciseMap[l.exercise].kg) exerciseMap[l.exercise] = l;
  });
  const rows = Object.values(exerciseMap).slice(0, 5);
  const topLift = rows.reduce((a, b) => (b.kg > (a?.kg || 0) ? b : a), null);
  const sessionName = lastSession?.name ? lastSession.name[0].toUpperCase() + lastSession.name.slice(1) : 'Session';
  const daysAgo = lastSession?.date ? Math.round((Date.now() - new Date(lastSession.date)) / 86_400_000) : null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const plan = s?.weeklyPlan;
  const todayPlan = plan?.days?.find(d => d.date === todayStr) || null;
  const todaySession = todayPlan?.sessions?.[0] || null;

  const generatePlan = async () => {
    setGenning(true);
    await fetch(`${API_BASE}/plan/week`, { method: 'POST' });
    setGenning(false);
    window.location.reload();
  };

  return (
    <section id="s3">
      <div className="fade">
        <div className="kicker">Performance · Strength · {daysAgo != null ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} Days Ago`) : '—'}</div>
        <div className="headline">
          {topLift ? `${sessionName} Day —` : 'Training'}<br />
          {topLift ? `${topLift.kg > 0 ? `${topLift.kg} kg` : 'BW'} ${topLift.exercise[0].toUpperCase() + topLift.exercise.slice(1)}` : 'No Recent Session'}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="fade">
          <table className="data-table">
            <thead><tr><th>Exercise</th><th>Weight</th><th>Reps</th></tr></thead>
            <tbody>
              {rows.map((l, i) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{l.exercise}</td>
                  <td className="gld">{l.kg > 0 ? `${l.kg} kg` : 'BW'}</td>
                  <td className="hi">{l.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {liftVol.some(Boolean) && (
        <div className="chart-wrap fade" style={{ flex: 1, minHeight: 60, maxHeight: 90 }}>
          <BarChart data={liftVol} color="#0d0b08" />
        </div>
      )}
      <div className="fade">
        <div className="stat-cols stat-cols-3" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <div className="stat-cell"><div className="sc-label">Duration</div><div className="sc-num" style={{ fontSize: 22 }}>{lastSession?.duration ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>min</span></div></div>
          <div className="stat-cell"><div className="sc-label">Output</div><div className="sc-num" style={{ fontSize: 22 }}>{lastSession?.kcal ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>kcal</span></div></div>
          <div className="stat-cell"><div className="sc-label">Month</div><div className="sc-num forest" style={{ fontSize: 22 }}>{s?.workoutsMonth ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>sessions</span></div></div>
        </div>
      </div>
      <div className="fade" style={{ marginTop: 'auto' }}>
        {todaySession ? (
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="kicker" style={{ marginBottom: 4 }}>{plan.focus}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 13, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.4 }}>
              Today — <strong style={{ fontStyle: 'normal', color: 'var(--ink)' }}>{todaySession.title}</strong> · {todaySession.duration}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {todaySession.type === 'rest' ? (
                <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>{todaySession.detail}</div>
              ) : (
                <>
                  <button className="action-btn primary" onClick={() => onStartWorkout(todayPlan)}>Start Today's Session</button>
                  <button className="action-btn" onClick={() => onStartWorkout(null)}>Freestyle</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, display: 'flex', gap: 8 }}>
            {!plan ? (
              <button className="action-btn" onClick={generatePlan} disabled={genning}>{genning ? 'Generating…' : 'Generate Week Plan'}</button>
            ) : (
              <button className="action-btn" onClick={generatePlan} disabled={genning}>{genning ? 'Generating…' : 'Regenerate Plan'}</button>
            )}
            <button className="action-btn primary" onClick={() => onStartWorkout(null)}>Start Workout</button>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }}>
          <button onClick={onImport} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>Import from Hevy</button>
        </div>
      </div>
    </section>
  );
}

// ── S4: FUEL ─────────────────────────────────────────────────────────────────
function S4({ s }) {
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const log = s?.nutritionLog || [];
  const water = s?.waterToday ?? 0;
  const waterTarget = s?.profile?.waterTarget || 8;

  const cal = n.calories || 0;
  const calTarget = mt.calories || 2400;
  const short = calTarget - cal;
  const protein = n.protein || 0;
  const carbs = n.carbs || 0;
  const fat = n.fat || 0;

  return (
    <section id="s4">
      <div className="fade">
        <div className="kicker">Nutrition · Today</div>
        <div className="headline">
          {cal > 0 ? `${cal.toLocaleString()} kcal —` : 'Fuel'}<br />
          {cal > 0 ? (short > 0 ? `${short.toLocaleString()} Short` : 'On Target') : 'Awaiting Log'}
        </div>
        <div className="deck">{s?.macroGoal ? `Goal: ${s.macroGoal}.` : ''} {log.length > 0 ? `${log.length} meal${log.length > 1 ? 's' : ''} logged.` : 'No meals logged yet.'}{mt.protein ? ` Protein target: ${mt.protein}g.` : ''}</div>
      </div>
      <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {[
          { label: 'Calories', val: cal,     tgt: calTarget,         unit: 'kcal', color: 'var(--ink)'    },
          { label: 'Protein',  val: protein,  tgt: mt.protein || 160, unit: 'g',    color: 'var(--navy)'   },
          { label: 'Carbs',    val: carbs,    tgt: mt.carbs || 250,   unit: 'g',    color: 'var(--forest)' },
          { label: 'Fat',      val: fat,      tgt: mt.fat || 75,      unit: 'g',    color: 'var(--ember)'  },
          { label: 'Water',    val: water,    tgt: waterTarget,       unit: 'gl',   color: 'var(--navy)',  extra: { marginTop: 10 } },
        ].map(({ label, val, tgt, unit, color, extra }) => {
          const p = tgt ? pct(val, tgt) : 0;
          return (
            <div key={label} className="macro" style={extra || {}}>
              <div className="macro-lbl">
                <span>{label.toUpperCase()}</span>
                <span>{val} / {tgt} {unit} &nbsp; {p}%</span>
              </div>
              <div className="macro-track"><div className="macro-fill" style={{ width: `${p}%`, background: color }} /></div>
            </div>
          );
        })}
      </div>
      {log.length > 0 && (
        <div className="fade">
          <div className="rule-thin" />
          <table className="data-table">
            <thead><tr><th>Meal</th><th>Time</th><th>Protein</th><th>kcal</th></tr></thead>
            <tbody>
              {log.slice(0, 3).map((m, i) => (
                <tr key={i}>
                  <td>{m.name || m.meal || 'Meal'}</td>
                  <td>{m.time || '—'}</td>
                  <td className="up">{m.protein ? `${m.protein}g` : '—'}</td>
                  <td className="hi">{m.calories || m.kcal || '—'}</td>
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
const BODY_BASE = '';
const ALL_MUSCLES = ['glutes','quads','hamstrings','adductors','calves','erectors','chest','abs','obliques','biceps','triceps','forearms','traps','front-delt','rear-delt','lats','rhomboids','neck'];

function S5({ s }) {
  const antRef = useRef(), latRef = useRef(), postRef = useRef();
  const [svgsReady, setSvgsReady] = useState(false);
  const fatigue = useMemo(() => computeFatigue(s?.lifts), [s?.lifts]);

  useEffect(() => {
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (antRef.current)  antRef.current.innerHTML  = ant;
      if (latRef.current)  latRef.current.innerHTML  = lat;
      if (postRef.current) postRef.current.innerHTML = post;
      setSvgsReady(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!svgsReady) return;
    const containers = [antRef.current, latRef.current, postRef.current].filter(Boolean);
    ALL_MUSCLES.forEach(m => {
      const p = fatigue[m] || 0;
      const f = p < 40 ? 'url(#fm-neutral)' : p <= 65 ? 'url(#fm-gold)' : 'url(#fm-ember)';
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => el.setAttribute('filter', f)));
    });
  }, [svgsReady, fatigue]);

  const topMuscles = Object.entries(fatigue).sort(([,a],[,b]) => b-a).slice(0,2).map(([m]) => m);
  const fatigueMax = fatigueVals => fatigueVals.length ? Math.round(Math.max(...fatigueVals)) : 0;
  const fMax = fatigueMax(Object.values(fatigue));

  const hl1 = topMuscles[0] ? `${topMuscles[0][0].toUpperCase() + topMuscles[0].slice(1)} Loaded —` : 'Fresh —';
  const hl2 = topMuscles[1] ? `Train ${topMuscles[1][0].toUpperCase() + topMuscles[1].slice(1)} Today` : 'All Systems Go';

  return (
    <section id="s5" style={{ padding: '18px 20px 12px' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Recovery · Muscle Fatigue · Post Session</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,40px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
      </div>

      {/* Body triptych */}
      <div className="fade" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
        {[['Anterior', antRef], ['Lateral', latRef], ['Posterior', postRef]].map(([label, ref]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
            <div className="body-view" ref={ref} />
          </div>
        ))}
      </div>

      <div className="fade">
        <div className="stat-cols stat-cols-3" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <div className="stat-cell"><div className="sc-label">Peak Fatigue</div><div className="sc-num red" style={{ fontSize: 22 }}>{fMax || '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div></div>
          <div className="stat-cell"><div className="sc-label">Recovery</div><div className="sc-num forest" style={{ fontSize: 22 }}>{s?.recoveryTrend?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div></div>
          <div className="stat-cell"><div className="sc-label">RHR</div><div className="sc-num" style={{ fontSize: 22 }}>{s?.rhrSeries?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>bpm</span></div></div>
        </div>
      </div>

      <div className="fade" style={{ display: 'flex', gap: 14, flexShrink: 0, marginTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
        {[['Recovered','#1a4f2a'],['Moderate','#6b5800'],['Fatigued','#7a3400']].map(([label, css]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
            <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
function App() {
  const [s, setS] = useState(null);
  const [loggerPlanDay, setLoggerPlanDay] = useState(undefined);
  const loggerOpen = loggerPlanDay !== undefined;
  const [showImport, setShowImport] = useState(false);

  const refresh = data => { if (data) setS(data); else api('summary').then(setS).catch(console.error); };

  useEffect(() => { api('summary').then(setS).catch(console.error); }, []);

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'press-css';
    el.textContent = PRESS_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    const scroll = document.getElementById('press-scroll');
    if (!scroll) return;
    const sections = [...scroll.querySelectorAll('section')];
    const dots = [...document.querySelectorAll('#sec-nav .sn-dot')];

    sections[0]?.classList.add('visible');
    dots[0]?.classList.add('active');

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        const idx = sections.indexOf(e.target);
        dots.forEach((d, j) => d.classList.toggle('active', j === idx));
      });
    }, { root: scroll, threshold: 0.45 });
    sections.forEach(sec => obs.observe(sec));

    const onKey = e => {
      if (!['ArrowDown','ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const curr = sections.findIndex(sec => {
        const r = sec.getBoundingClientRect();
        return r.top > -10 && r.top < window.innerHeight * 0.6;
      });
      const next = e.key === 'ArrowDown' ? Math.min(curr + 1, sections.length - 1) : Math.max(curr - 1, 0);
      sections[next]?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => { obs.disconnect(); window.removeEventListener('keydown', onKey); };
  }, [s]);

  return (
    <>
      <Header s={s} />
      <nav className="sec-nav" id="sec-nav">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="sn-dot" onClick={() => {
            document.getElementById('press-scroll')?.querySelectorAll('section')[i]?.scrollIntoView({ behavior: 'smooth' });
          }} />
        ))}
      </nav>
      <div className="scroll" id="press-scroll">
        <S1 s={s} />
        <S2 s={s} />
        <S3 s={s} onStartWorkout={planDay => setLoggerPlanDay(planDay ?? null)} onImport={() => setShowImport(true)} />
        <S4 s={s} />
        <S5 s={s} />
      </div>
      {loggerOpen && (
        <WorkoutLogger
          planDay={loggerPlanDay}
          lifts={s?.lifts || []}
          onClose={() => setLoggerPlanDay(undefined)}
          refresh={setS}
        />
      )}
      {showImport && <HevyImport onClose={() => setShowImport(false)} refresh={setS} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
