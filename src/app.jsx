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
function WorkoutLogger({ planDay, onClose, refresh }) {
  const [exercises, setExercises] = useState([]);
  const [newEx, setNewEx] = useState('');
  const [start] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [start]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const addExercise = name => {
    if (!name.trim()) return;
    setExercises(prev => [...prev, { name: name.trim(), sets: [{ kg: '', reps: '' }] }]);
    setNewEx('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const addSet = i => setExercises(prev => prev.map((ex, j) =>
    j !== i ? ex : { ...ex, sets: [...ex.sets, { kg: ex.sets.at(-1)?.kg || '', reps: ex.sets.at(-1)?.reps || '' }] }
  ));

  const updateSet = (ei, si, field, val) => setExercises(prev => prev.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }
  ));

  const removeSet = (ei, si) => setExercises(prev => prev.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) }
  ).filter(ex => ex.sets.length > 0));

  const finish = async () => {
    const valid = exercises.map(ex => ({ ...ex, sets: ex.sets.filter(s => s.kg !== '' || s.reps !== '') })).filter(ex => ex.sets.length > 0);
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>In Session</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(elapsed)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ol-btn ol-btn-ghost" onClick={onClose}>Discard</button>
          <button className="ol-btn ol-btn-solid" onClick={finish} disabled={saving}>{saving ? 'Saving…' : 'Finish'}</button>
        </div>
      </div>

      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {session && (
          <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--gold)', background: 'var(--paper2)' }}>
            <div className="kicker" style={{ marginBottom: 4 }}>{session.type} · {session.duration}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, marginBottom: 4 }}>{session.title}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>{session.detail}</div>
          </div>
        )}

        {exercises.map((ex, i) => (
          <div key={i} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, textTransform: 'capitalize', marginBottom: 8 }}>{ex.name}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, marginBottom: 8 }}>
              <thead>
                <tr>
                  {['Set','kg','Reps',''].map((h, j) => (
                    <th key={j} style={{ textAlign: j === 0 ? 'left' : 'right', color: 'var(--dim)', fontSize: 8, letterSpacing: '.15em', textTransform: 'uppercase', padding: '3px 0', borderBottom: '1px solid var(--rule)', fontWeight: 400, width: j === 3 ? 24 : 'auto' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ex.sets.map((set, j) => (
                  <tr key={j}>
                    <td style={{ padding: '5px 0', color: 'var(--dim)' }}>{j + 1}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right' }}>
                      <input className="set-input" value={set.kg} onChange={e => updateSet(i, j, 'kg', e.target.value)} inputMode="decimal" placeholder="—" style={{ color: 'var(--gold)' }} />
                    </td>
                    <td style={{ padding: '5px 0', textAlign: 'right' }}>
                      <input className="set-input" value={set.reps} onChange={e => updateSet(i, j, 'reps', e.target.value)} inputMode="numeric" placeholder="—" style={{ color: 'var(--ink)' }} />
                    </td>
                    <td style={{ textAlign: 'right', padding: '5px 0' }}>
                      <button onClick={() => removeSet(i, j)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8 }} onClick={() => addSet(i)}>+ Set</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input ref={inputRef} className="ex-input" value={newEx} onChange={e => setNewEx(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExercise(newEx)} placeholder="Add exercise…" />
          <button className="ol-btn ol-btn-solid" onClick={() => addExercise(newEx)}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── S3: TRAINING ──────────────────────────────────────────────────────────────
function S3({ s, onStartWorkout }) {
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
        <S3 s={s} onStartWorkout={planDay => setLoggerPlanDay(planDay ?? null)} />
        <S4 s={s} />
        <S5 s={s} />
      </div>
      {loggerOpen && (
        <WorkoutLogger
          planDay={loggerPlanDay}
          onClose={() => setLoggerPlanDay(undefined)}
          refresh={setS}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
