import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, getRedirectResult } from 'firebase/auth';
import muscleTaxonomyPkg from '../functions/muscleTaxonomy.js';
import fatiguePkg from '../functions/fatigue.js';
import sessionPlannerPkg from '../functions/sessionPlanner.js';
import strengthStandardsPkg from '../functions/strengthStandards.js';
import machineBrandsPkg from '../functions/machineBrands.js';
import adaptationPkg from '../functions/adaptation.js';
import plateCalculatorPkg from '../functions/plateCalculator.js';
import weeklyPlannerPkg from '../functions/weeklyPlanner.js';
import { EXERCISE_DB, EXERCISE_MUSCLE_GROUPS, EXERCISE_PATTERNS } from '../functions/exerciseDb.js';
import { PRESS_CSS } from './pressCss.js';
import { AreaChart, BarChart, Sparkline, AdaptationChart } from './charts.jsx';

// Muscle taxonomy + fatigue math + progression logic are shared with the
// backend (functions/muscleTaxonomy.js, functions/fatigue.js,
// functions/sessionPlanner.js) rather than hand-copied here — this used to be
// three independently-drifting implementations (hyphen/case mismatches,
// an 'ab'-substring collision, and 14 exercises the muscle-bucket taxonomy
// couldn't see at all). One implementation, bundled into both. EXERCISE_DB
// itself is imported separately for the session-logging autocomplete, which
// needs the full exercise name list rather than a derived lookup.
const { ALL_MUSCLES, musclesForExercise, isCompoundExercise, findExercise } = muscleTaxonomyPkg;
const { computeStructuralFatigue, computeACWR, computePerformanceTrend, computeMetabolicFatigue, computeCNSFatigue, cnsLoad } = fatiguePkg;
const { progressionFor, suggestedWorkingSetCount, suggestedRirSequence, isLowRepPattern, LOW_REP_THRESHOLD } = sessionPlannerPkg;
const { e1rm: calcE1RM } = strengthStandardsPkg;
const { defaultMachineBrands } = machineBrandsPkg;
const {
  sessionStimulusScore, adaptationCurve, computeStimulusContributions, computeAdaptationLevel,
  computeAdaptationSeries, estimateAtrophyRate, DEFAULT_ATROPHY_RATE, SECONDARY_MUSCLE_WEIGHT, DEFAULT_RIR,
} = adaptationPkg;
const { platesForWeight, STANDARD_PLATES_KG } = plateCalculatorPkg;
const { FATIGUE_CEILING } = weeklyPlannerPkg;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDlVzSc9yow5GHbQipRWuYAZ5QTQ-jmXiY",
  authDomain: "pressnewsletter.firebaseapp.com",
  projectId: "pressnewsletter",
  storageBucket: "pressnewsletter.firebasestorage.app",
  messagingSenderId: "342853014013",
  appId: "1:342853014013:web:0dd6fb5fe4e975921c8994",
};
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();


const API_BASE = "https://europe-west2-pressnewsletter.cloudfunctions.net/api";

const getToken = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);

const api = async (path, opts = {}) => {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const r = await fetch(`${API_BASE}/${path}`, { ...opts, headers });
  // Most callers read data.error out of a non-2xx JSON body themselves (many
  // routes intentionally return e.g. 400/500 with {error: '...'}), so this
  // stays opt-in via opts.throwOnError rather than a blanket change — used by
  // loadSummary, where silently accepting an error body as if it were real
  // summary data would defeat the initial loading-screen gate (s becomes
  // non-null "garbage" instead of staying null until real data arrives).
  if (!r.ok && opts.throwOnError) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

const authFetch = async (url, opts = {}) => {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
};




const ECHELONS = [
  { key: 'workout', title: 'Training', desc: 'Workout logging, fatigue model, personal records, and AI-planned sessions.' },
  { key: 'workout_sleep', title: 'Training + Recovery', desc: 'Adds sleep tracking, HRV analysis, and recovery-aware planning via Apple Health.' },
  { key: 'full', title: 'Full System', desc: 'Everything — nutrition logging, macro tracking, meal photo scanning, and daily fuel briefings.' },
];

// ── HELPERS ─────────────────────────────────────────────────────────────────
// Dates are stored as "YYYY-MM-DD" strings. `new Date("YYYY-MM-DD")` parses
// that as UTC midnight, so formatting it with toLocaleDateString in a
// negative-UTC-offset timezone (most of the Americas) rolls it back to the
// previous calendar day. Constructing from the local-time components instead
// keeps the displayed day matching the logged day everywhere.
const localDateFromYMD = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};
// The reverse direction: a Date -> "YYYY-MM-DD" using this browser's own
// local timezone, not UTC. `date.toISOString().split('T')[0]` is the bug to
// avoid here — it always converts to UTC first, so a moment that's already
// "tomorrow" locally (e.g. 11:45pm) gets stored under yesterday's date, or
// vice versa depending on offset direction.
const toLocalDateStr = (date) => {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
// "Today" as a local "YYYY-MM-DD" string — the frontend equivalent of the
// backend's day(). Every date the backend stores (workouts, nutrition,
// measurements, ...) is keyed this way; comparing against it with a
// UTC-derived string (the old `new Date().toISOString().slice(0,10)`
// pattern, repeated ~15 times across this file) silently mismatches near
// midnight.
const todayLocalStr = () => toLocalDateStr(new Date());
const fmtDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const pct = (v, t) => (t && t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0);
// Calorie display default is approximate (nearest 300) — precision that isn't
// really there anyway for most logged food, and it's less anxiety-inducing to
// track than exact numbers. Settings > Nutrition can switch to exact.
const roundCal = (v, exact) => (v == null ? v : exact ? Math.round(v) : Math.round(v / 300) * 300);

function Header({ s, onSignOut }) {
  const today = s?.today || {};
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const steps = today.steps != null ? Math.round(today.steps * 1000) : null;
  const exactCal = !!s?.profile?.exactCalories;

  const items = [
    { sym: '$RCVRY',   val: today.recovery != null ? `${Math.round(today.recovery)}` : '—',   chg: null, up: true },
    { sym: '$SLEEP',   val: today.sleepH != null ? `${today.sleepH.toFixed(1)}h` : '—',       chg: null, up: true },
    { sym: '$HRV',     val: today.hrv != null ? `${today.hrv}ms` : '—',                       chg: null, up: true },
    { sym: '$RHR',     val: today.rhr != null ? `${today.rhr}bpm` : '—',                      chg: null, up: false },
    { sym: '$STEPS',   val: steps ? steps.toLocaleString() : '—', chg: steps ? `${pct(steps, 10000)}%` : null, up: steps >= 8000 },
    { sym: '$KCAL',    val: n.calories ? `${roundCal(n.calories, exactCal)}` : '—', chg: mt.calories ? `${pct(n.calories, mt.calories)}%` : null, up: pct(n.calories, mt.calories) >= 80 },
    { sym: '$PROTEIN', val: n.protein ? `${n.protein}g` : '—', chg: mt.protein ? `${pct(n.protein, mt.protein)}%` : null, up: pct(n.protein, mt.protein) >= 80 },
    { sym: '$MASS',    val: s?.weights?.[0]?.value ? `${s.weights[0].value}kg` : '—', chg: null, up: true },
  ];

  return (
    <div className="hdr">
      <div className="masthead">
        <div className="mast-left">Vol. I &nbsp;·&nbsp; Est. 2026</div>
        <div className="mast-title">PRESS</div>
        <div className="mast-right mast-right-stack">
          <span>{fmtDateShort()}</span>
          <span className="mast-right-row">
            <span>{s?.profile?.name ? `${s.profile.name}'s Edition` : 'Personal Edition'}</span>
            {onSignOut && <button onClick={onSignOut} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', padding: '2px 6px', cursor: 'pointer', lineHeight: 1.4 }}>Sign out</button>}
          </span>
        </div>
      </div>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...items, ...items, ...items].map((t, i) => (
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
function S1({ s, briefing, onShowBriefing, onShowAfternoon, onShowNight, onShowWeekly, afternoonLoaded, nightLoaded, weeklyLoaded, newscastLoading, newscastError }) {
  const today = s?.today || {};
  const recovery = today.recovery ?? s?.recoveryTrend?.at(-1) ?? null;

  const trainingStreak = useMemo(() => {
    const dates = new Set((s?.workouts || []).map(w => w.date));
    let streak = 0; const d = new Date();
    const todayStr = toLocalDateStr(d);
    if (!dates.has(todayStr)) d.setDate(d.getDate() - 1);
    while (true) {
      const k = toLocalDateStr(d);
      if (!dates.has(k)) break;
      streak++; d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [s?.workouts]);

  const waterStreak = s?.waterStats?.streak ?? 0;

  const sleepStreak = useMemo(() => {
    const target = s?.sleepTarget || 8;
    const series = s?.sleepSeries || [];
    if (!series.length) return 0;
    let streak = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i] >= target * 0.9) streak++;
      else break;
    }
    return streak;
  }, [s?.sleepSeries, s?.sleepTarget]);
  const hrv = today.hrv;
  const rhr = today.rhr;
  const sleep = today.sleepH;
  const sleepEff = today.sleepEff;
  const sleepDebt = s?.sleepDebtH ?? 0;
  const fatigue = useMemo(() => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity), [s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b) => a+b, 0) / fatigueVals.length) : null;
  // No scheduled deload weeks in this program (see the Wiki entry) — fatigue
  // is per-muscle and autoregulated live, so the only thing worth surfacing
  // here is which specific muscles are actually over the ceiling right now,
  // not a blanket whole-body "recovery week" recommendation.
  const overloadedMuscles = Object.entries(fatigue).filter(([, v]) => v >= FATIGUE_CEILING).sort((a, b) => b[1] - a[1]).map(([m]) => m);
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
  const hour = new Date().getHours();
  // Exclusive windows, not cumulative thresholds — hour >= 18 alone left
  // canAfternoon (hour >= 12) also true all evening, showing both the
  // mid-day and the night report slots at once past 6pm. Only one time-
  // of-day slot should ever be current.
  const canAfternoon = hour >= 12 && hour < 18;
  const canNight = hour >= 18;

  return (
    <section id="s1" style={{ padding: '18px 20px 16px', justifyContent: 'space-between' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Today's Edition · {fmtDate()} · Recovery &amp; Readiness</div>
        <div className="headline" style={{ fontSize: 'clamp(30px,8vw,52px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
      </div>

      {briefing && (
        <div className="briefing-preview fade" style={{ flexShrink: 0 }} onClick={onShowBriefing}>
          <div className="kicker" style={{ marginBottom: 3 }}>Morning Briefing</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: 'var(--gold)', lineHeight: 1.2 }}>
            {briefing.headline}
          </div>
          {briefing.subheading && (
            <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 12, color: 'var(--dim)', fontStyle: 'italic', marginTop: 4 }}>
              {briefing.subheading}
            </div>
          )}
        </div>
      )}

      {canAfternoon && (
        <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: newscastLoading ? 'default' : 'pointer', opacity: newscastLoading ? 0.6 : 1 }} onClick={onShowAfternoon}>
          <div className="kicker" style={{ marginBottom: 3 }}>Mid-Day Update</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
            {newscastLoading ? 'Generating…' : afternoonLoaded ? 'Read mid-day update' : 'Generate mid-day report'}
          </div>
        </div>
      )}

      {canNight && (
        <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: newscastLoading ? 'default' : 'pointer', opacity: newscastLoading ? 0.6 : 1 }} onClick={onShowNight}>
          <div className="kicker" style={{ marginBottom: 3 }}>Tonight's Report</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
            {newscastLoading ? 'Generating…' : nightLoaded ? "Read tonight's report" : 'Generate evening report'}
          </div>
        </div>
      )}

      <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: newscastLoading ? 'default' : 'pointer', opacity: newscastLoading ? 0.6 : 1 }} onClick={onShowWeekly}>
        <div className="kicker" style={{ marginBottom: 3 }}>Weekly Review</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
          {newscastLoading ? 'Generating…' : weeklyLoaded ? 'Read weekly review' : 'Generate weekly review'}
        </div>
      </div>

      {newscastError && (
        <div className="fade" style={{ flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--red)', padding: '6px 0' }}>
          {newscastError}
        </div>
      )}

      <div className="fade" style={{ flex: 1, display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 0, borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '12px 0', overflow: 'hidden' }}>
        {/* Left: recovery number + ghost chart */}
        <div style={{ width: '44%', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '14px 16px 14px 0', borderRight: '1px solid var(--rule)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}>
            <AreaChart data={recoveryTrend.length ? recoveryTrend : s?.sleepSeries || []} color="#6b5800" id="ghost" />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="sc-label" style={{ marginBottom: 6 }}>Recovery · Today</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 'clamp(52px,13vw,84px)', lineHeight: '.82', letterSpacing: '-.05em', color: 'var(--gold)', whiteSpace: 'nowrap' }}>
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
            <div className="sc-num plum" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{sleep != null ? sleep.toFixed(1) : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>h</span></div>
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
          { label: 'Sleep',    color: 'var(--plum)',   val: sleep,                       target: sleepTarget,   fmt: v => `${v.toFixed(1)}h`,                 tgt: `${sleepTarget}` },
          { label: 'Recovery', color: 'var(--gold)',   val: recovery,                    target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
          { label: 'Steps',    color: 'var(--forest)', val: steps ? steps/1000 : null,   target: 10,            fmt: v => `${Math.round(v*1000).toLocaleString()}`, tgt: '10k' },
          { label: 'Protein',  color: 'var(--ember)',  val: protein,                     target: proteinTarget, fmt: v => `${Math.round(v)}g`,                  tgt: `${proteinTarget}g` },
          { label: 'Fatigue',  color: 'var(--red)',    val: overallFatigue,              target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
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

      {/* Streaks row */}
      <div className="streak-row fade" style={{ flexShrink: 0 }}>
        {[
          { label: 'Training Streak', val: trainingStreak },
          { label: 'Water Streak', val: waterStreak },
          { label: 'Sleep Streak', val: sleepStreak },
        ].map(({ label, val }) => (
          <div key={label} className="streak-cell">
            <div className="streak-num" style={{ color: val > 7 ? 'var(--forest)' : val > 3 ? 'var(--gold)' : 'var(--ink)' }}>{val}</div>
            <div className="streak-lbl">{label}</div>
          </div>
        ))}
      </div>

      {/* Sleep debt */}
      {sleepDebt > 0 && (
        <div className="sleep-debt-bar fade" style={{ flexShrink: 0, borderLeftColor: sleepDebt > 1 ? 'var(--red)' : 'var(--gold)' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: sleepDebt > 1 ? 'var(--red)' : 'var(--gold)' }}>
            {sleepDebt.toFixed(1)}h sleep debt
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
            {sleepDebt > 1 ? 'Prioritise 9h tonight to recover' : 'Slight deficit — aim for full sleep tonight'}
          </div>
        </div>
      )}
      {sleepDebt === 0 && (
        <div className="sleep-debt-bar fade" style={{ flexShrink: 0, borderLeftColor: 'var(--forest)' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--forest)' }}>Sleep debt clear</div>
        </div>
      )}

      {overloadedMuscles.length > 0 && (
        <div className="fatigue-banner fade" style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--paper)', letterSpacing: '.04em', textTransform: 'capitalize' }}>
            {overloadedMuscles.length === 1
              ? `${muscleDisplayLabel(overloadedMuscles[0])} — leave it alone`
              : `${overloadedMuscles.map(muscleDisplayLabel).join(', ')} — leave them alone`}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(245,240,226,0.75)', marginTop: 3, lineHeight: 1.5 }}>
            Above the {FATIGUE_CEILING}% fatigue ceiling — skip {overloadedMuscles.length === 1 ? 'it' : 'them'} today and train everything else as normal.
          </div>
        </div>
      )}

      {/* Pull quote */}
      <div className="pull fade" style={{ margin: '10px 0 0', fontSize: 'clamp(12px,3vw,15px)' }}
        dangerouslySetInnerHTML={{ __html: thought
          ? `"${thought}"`
          : '"The body adapts to what you consistently demand of it. <strong>Consistency compounds.</strong>"' }} />
    </section>
  );
}

// ── S2: SLEEP ────────────────────────────────────────────────────────────────
const SLEEP_COMPONENT_LABELS = { duration: 'Duration', efficiency: 'Efficiency', deep: 'Deep Sleep', rem: 'REM Sleep', light: 'Light Sleep', hrDip: 'HR Dip', waso: 'Fragmentation' };

function sleepScoreColor(score) {
  if (score >= 80) return 'var(--forest)';
  if (score >= 60) return 'var(--gold)';
  return 'var(--ember)';
}

function SleepScorePanel({ sleepScore, sleepScoreTrend }) {
  if (!sleepScore) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Sleep Score</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Sync sleep hours and efficiency to see a score — add stage/HR-dip data via the setup guide for the full clinical breakdown.</div>
    </div>
  );
  const availableComponents = Object.entries(sleepScore.components).filter(([, v]) => v != null);
  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>Sleep Score</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 40, fontWeight: 900, lineHeight: 1, color: sleepScoreColor(sleepScore.score) }}>
          {sleepScore.score}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--dim)', marginLeft: 2 }}>/100</span>
        </div>
        {sleepScoreTrend?.length > 1 && <Sparkline data={sleepScoreTrend} color={sleepScoreColor(sleepScore.score)} width={64} height={26} />}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {availableComponents.map(([key, val]) => (
          <div key={key} style={{ minWidth: 64 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{SLEEP_COMPONENT_LABELS[key]}</div>
            <div className="macro-track" style={{ marginBottom: 2 }}><div className="macro-fill" style={{ width: `${val}%`, background: sleepScoreColor(val) }} /></div>
          </div>
        ))}
      </div>
      {sleepScore.inputs && (sleepScore.inputs.deepPct != null || sleepScore.inputs.hrDipPct != null) && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 8 }}>
          {sleepScore.inputs.deepPct != null && `${sleepScore.inputs.deepPct}% deep · ${sleepScore.inputs.remPct}% REM · ${sleepScore.inputs.lightPct}% light`}
          {sleepScore.inputs.deepPct != null && sleepScore.inputs.hrDipPct != null && ' · '}
          {sleepScore.inputs.hrDipPct != null && `${sleepScore.inputs.hrDipPct}% overnight HR dip`}
        </div>
      )}
    </div>
  );
}

function S2({ s, refresh }) {
  const series = s?.sleepSeries || [];
  const sleepTarget = s?.sleepTarget || 8;
  const debt = s?.sleepDebtH ?? 0;
  const todaySleep = s?.today?.sleepH;
  const eff = s?.today?.sleepEff;
  const vo2Series = (s?.vo2maxSeries || []).map(p => p.value);
  const hrrSeries = (s?.hrrSeries || []).map(p => p.value);
  const alcoholLastNight = s?.alcoholLastNight || 0;
  const alcoholLast7 = s?.alcoholLast7 || 0;
  const [alcoholUnits, setAlcoholUnits] = useState('');
  const [loggingAlcohol, setLoggingAlcohol] = useState(false);

  const hi = series.length ? Math.max(...series).toFixed(1) : '—';
  const lo = series.length ? Math.min(...series).toFixed(1) : '—';
  const avg = series.length ? (series.reduce((a,b) => a+b,0) / series.length).toFixed(2) : '—';
  const effPct = eff != null ? Math.round(eff) : null;

  const logAlcohol = async () => {
    if (!alcoholUnits) return;
    setLoggingAlcohol(true);
    const data = await api('alcohol', { method: 'POST', body: JSON.stringify({ units: +alcoholUnits }) });
    setAlcoholUnits('');
    setLoggingAlcohol(false);
    refresh({ ...s, alcoholLastNight: data.alcoholLastNight, alcoholLast7: data.alcoholLast7 });
  };

  return (
    <section id="s2">
      <div className="fade">
        <div className="kicker">Health · Sleep Analysis · {series.length}‑Night</div>
        <div className="headline">
          {todaySleep != null ? `${todaySleep.toFixed(1)} Hours —` : 'Lights Out —'}<br />
          {effPct != null ? `${effPct}% Efficiency` : 'Nothing on Record'}
        </div>
        <div className="deck">
          {debt > 0
            ? `Sleep debt stands at ${debt.toFixed(1)} hours. Consistent nights above target needed to clear it.`
            : 'Sleep debt cleared. Maintain consistent bedtimes to hold this position.'}
          {' '}Target {sleepTarget}h ({s?.sleepTargetLearned ? 'learned from your recent nights' : 'default — not enough data yet to personalise'}).
        </div>
      </div>
      <div className="chart-wrap fade" style={{ flex: '0 0 90px', position: 'relative' }}>
        {series.length ? (
          <>
            <AreaChart data={series} color="#3d2452" id="sleep" />
            {(() => {
              const mn = Math.min(...series), mx = Math.max(...series), rng = (mx - mn) || 1;
              const lo = mn - rng * 0.07, r = (mx + rng * 0.07) - lo;
              const tgtY = 100 - ((sleepTarget - lo) / r * 100);
              if (tgtY < 0 || tgtY > 100) return null;
              return (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <svg viewBox="0 0 320 100" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} preserveAspectRatio="none">
                    <line x1="0" y1={tgtY} x2="320" y2={tgtY} stroke="var(--gold)" strokeWidth="1" strokeDasharray="4,4" opacity="0.7" />
                    <text x="4" y={tgtY - 3} fontSize="7" fill="var(--gold)" fontFamily="JetBrains Mono,monospace" opacity="0.9">target {sleepTarget}h{s?.sleepTargetLearned ? ' · learned' : ' · default'}</text>
                  </svg>
                </div>
              );
            })()}
          </>
        ) : (
          <div style={{ color: 'var(--dim)', fontStyle: 'italic', fontSize: 13, padding: '20px 0' }}>Sleep data syncing.</div>
        )}
      </div>
      <div className="fade">
        <div className="stat-cols stat-cols-4" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <div className="stat-cell"><div className="sc-label">{series.length}N High</div><div className="sc-num" style={{ fontSize: 22 }}>{hi}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Low</div><div className="sc-num red" style={{ fontSize: 22 }}>{lo}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Avg</div><div className="sc-num" style={{ fontSize: 22 }}>{avg}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">Sleep Debt</div><div className="sc-num red" style={{ fontSize: 22 }}>{debt.toFixed(1)}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
        </div>
      </div>

      <SleepScorePanel sleepScore={s?.sleepScore} sleepScoreTrend={s?.sleepScoreTrend} />

      {/* VO2 max + HRR trends */}
      {(vo2Series.length > 0 || hrrSeries.length > 0) && (
        <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Cardiovascular Fitness</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {vo2Series.length > 0 && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>VO2 Max</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--forest)' }}>
                    {vo2Series.at(-1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>ml/kg/min</span>
                  </div>
                  <Sparkline data={vo2Series} color="var(--forest)" width={56} height={22} />
                </div>
              </div>
            )}
            {hrrSeries.length > 0 && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Heart Rate Recovery</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--navy)' }}>
                    {hrrSeries.at(-1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>bpm</span>
                  </div>
                  <Sparkline data={hrrSeries} color="var(--navy)" width={56} height={22} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wrist temp / SpO2 / current HR — folded into the recovery score, shown here */}
      {(s?.today?.wristTemp != null || s?.today?.spo2 != null || s?.today?.hr != null) && (
        <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Recovery Signals</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {s?.today?.wristTemp != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Wrist Temp</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: s?.baselines?.wristTemp != null && s.today.wristTemp - s.baselines.wristTemp > 0.3 ? 'var(--ember)' : 'var(--forest)' }}>
                  {s.today.wristTemp.toFixed(1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>°C</span>
                </div>
                {s?.baselines?.wristTemp != null && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
                    baseline {s.baselines.wristTemp}°C ({s.today.wristTemp - s.baselines.wristTemp >= 0 ? '+' : ''}{(s.today.wristTemp - s.baselines.wristTemp).toFixed(1)})
                  </div>
                )}
              </div>
            )}
            {s?.today?.spo2 != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Blood Oxygen</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: s.today.spo2 < 95 ? 'var(--ember)' : 'var(--forest)' }}>
                  {s.today.spo2}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>%</span>
                </div>
              </div>
            )}
            {s?.today?.hr != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Heart Rate</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--navy)' }}>
                  {s.today.hr}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>bpm</span>
                </div>
                {s?.baselines?.hr != null && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>baseline {s.baselines.hr}bpm</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alcohol section */}
      <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Alcohol</div>
        {alcoholLastNight > 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', marginBottom: 6, letterSpacing: '.06em' }}>
            {alcoholLastNight} unit{alcoholLastNight !== 1 ? 's' : ''} last night · HRV + sleep likely affected
          </div>
        )}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8 }}>
          Last 7 days: {alcoholLast7} units
        </div>
        <div className="alcohol-row">
          <input
            style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, padding: '5px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'center' }}
            type="number" min="0" step="0.5" placeholder="0"
            value={alcoholUnits} onChange={e => setAlcoholUnits(e.target.value)}
            inputMode="decimal"
          />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>units tonight</span>
          <button className="prof-btn solid" onClick={logAlcohol} disabled={!alcoholUnits || loggingAlcohol} style={{ padding: '5px 14px', fontSize: 9 }}>
            {loggingAlcohol ? '…' : 'Log'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── WORKOUT LOGGER ───────────────────────────────────────────────────────────
// Was a hand-maintained 57-name list that had drifted so far from
// EXERCISE_DB's actual naming (e.g. 'skull crusher' vs. the DB's
// "Skullcrusher (Barbell)") that 41 of the 57 default suggestions — including
// "bench press", "deadlift", "pull up" — never matched any DB entry. Logging
// one of those meant zero fatigue tracking and no equipment-aware
// progression rounding for that exercise. Deriving from EXERCISE_DB directly
// keeps the suggestion list and the actual data in permanent sync.
const BASE_EXERCISES = EXERCISE_DB.map(e => e.name.toLowerCase());

// Colloquial terms that don't appear anywhere in EXERCISE_DB's own
// primary/secondary muscle names, so the plain muscle-tag match above can't
// find them on its own — "bicep" -> "biceps" is already covered by simple
// substring matching, but "legs", "back", "delts" etc. name a muscle *group*,
// not a single tracked muscle, and never literally appear in any exercise's
// tag data. Expanded into EXERCISE_SEARCH_TAGS below so e.g. "back" finds
// every row/pulldown/lat-pulldown variant, not just exercises literally
// tagged "lats".
const MUSCLE_SYNONYMS = {
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip-flexors', 'tibialis'],
  back: ['lats', 'rhomboids', 'traps', 'mid-traps', 'lower-traps', 'rear-delt', 'erectors'],
  shoulders: ['front-delt', 'mid-delt', 'rear-delt', 'rotator-cuff'],
  delts: ['front-delt', 'mid-delt', 'rear-delt'],
  arms: ['biceps', 'triceps', 'forearms', 'brachialis', 'brachioradialis'],
  abs: ['abs', 'obliques', 'transverse-abs', 'core'],
  core: ['abs', 'obliques', 'transverse-abs', 'erectors'],
  hammies: ['hamstrings'],
  pecs: ['chest'],
  traps: ['traps', 'mid-traps', 'lower-traps'],
};

// Lets exercise search match on muscles/equipment/category ("lats" finds
// every row/pulldown variant) without those tags cluttering the visible
// suggestion list — keyed by the same lowercase name used in allExercises.
const EXERCISE_SEARCH_TAGS = new Map(EXERCISE_DB.map(e => {
  const muscles = [...(e.primary || []), ...(e.secondary || [])];
  const synonyms = Object.entries(MUSCLE_SYNONYMS)
    .filter(([, group]) => group.some(m => muscles.includes(m)))
    .map(([synonym]) => synonym);
  return [
    e.name.toLowerCase(),
    [...muscles, ...synonyms, e.equipment, e.category].join(' ').toLowerCase(),
  ];
}));

const e1rm = (kg, reps) => (kg > 0 && reps > 0) ? Math.round(calcE1RM(kg, reps)) : null;

// Minimum whole reps at `kg` needed to match/exceed `targetE1RM` — e1rm rises
// monotonically with reps at a fixed weight (see strengthStandards.js), so
// walking reps up from 1 against the raw curve is simpler and just as exact
// as inverting it algebraically. Capped at 20: past that a "reps needed for
// a PR" hint stops being an answerable (or useful) question.
const repsForPR = (kg, targetE1RM) => {
  if (!kg || !targetE1RM) return null;
  for (let r = 1; r <= 20; r++) {
    if (calcE1RM(kg, r) >= targetE1RM) return r;
  }
  return null;
};
const SET_TYPES = ['W','N','D','F'];
const SET_LABELS = { W: 'Warm-up', N: 'Normal', D: 'Drop Set', F: 'Failure' };
const REST_DEFAULT = 90;
// Rest timer displays live muscle glycogen replenishment instead of a plain
// countdown — exponential recovery toward 100%, half-life 45s (50% back at
// 45s, 75% at 90s, ~94% by the time the RPE9+ 180s rest window ends). Still
// bounded by the same effort-scaled total (90/120/180s) as before; only the
// displayed metric changed from "time remaining" to "% recovered."
const GLYCOGEN_HALF_LIFE_S = 45;
const glycogenPct = elapsedS => Math.round(100 * (1 - Math.pow(0.5, elapsedS / GLYCOGEN_HALF_LIFE_S)));

// Shown at the top of Settings. Newest first — add a new entry (bump the
// version, today's date, a feature-list bullet per notable change) whenever
// shipping something worth calling out, rather than editing this comment
// instead of the list. v0.1 is the first tracked release, not literally the
// app's first version — everything before this had no changelog at all.
const CHANGELOG = [
  {
    version: '0.18',
    date: '2026-07-19',
    features: [
      'Home screen no longer suggests a whole-week "recovery week" once several muscles get fatigued — it now names exactly which muscle(s) are over the fatigue ceiling and says to leave those alone, since this program never runs on a scheduled deload anyway',
      'Full-body auto-generated sessions no longer pair up two exercises that do the same job on the same muscle (e.g. Barbell Overhead Press + Machine Shoulder Press) — a second exercise for the same muscle only shows up now if it\'s genuinely different work',
      'Home screen panels and Recovery tabs can now be reordered and hidden from Settings',
      'Disabled pinch-to-zoom so the app behaves more like a native app rather than a zoomable page',
      'Fixed the mid-day and evening report both being generatable at once in the evening — only the report matching the actual time of day shows now',
    ],
  },
  {
    version: '0.17',
    date: '2026-07-18',
    features: [
      'Fixed sections sometimes staying invisible after the loading screen dismissed — a scroll-reveal effect stopped re-attaching once the loading screen delayed when the page actually mounted',
      'Weight suggestions and progress trends now account for switching gyms/machine brands — logging the same exercise on a different brand no longer reads as a strength change once you\'ve logged it on both close enough in time to compare',
      'Adaptation tab now defaults to a colored body diagram by current stimulus level (red = atrophying, green = actively adapting), not just tap-to-select',
      'Exercise selection now correctly recognizes a lot more of your real logged history — imported exercise names that didn\'t exactly match the database (e.g. "Bench Press (Barbell)") were silently being treated as novel; ~140 known real aliases are now wired into exercise selection, not just the ranking system',
      'Exercises you log regularly (10+ sessions) are now protected as "staples" — no longer rotated away from for variety',
      'Any imported workout history referencing an exercise not in the database now auto-saves it as a custom exercise, from any import source',
      'New "Merge Exercises" tool in Settings, for folding two entries that are really the same exercise into one',
      'New onboarding step: split, usual sets/reps, favorite exercises, and experience level — gives session planning a real starting point before you\'ve logged anything',
      'Beginners (self-tagged at onboarding) get Easy/Medium/Failure effort logging instead of numeric RPE',
      'New Wiki page (Settings → Learn): plain-language training concepts and a searchable exercise reference',
      'Exercise search now understands muscle-group terms like "back," "legs," and "delts," not just individual muscle names',
      'Renamed Niggles to Injuries',
      'New plate calculator in the workout logger',
      'Machine/cable entry is now a brand dropdown instead of free text, with a single/double-pulley option for cables',
      'Exercises are now tagged by muscle group, movement pattern, and movement family (e.g. Bench Press → Barbell/Dumbbell × Flat/Incline/Decline) — new "Browse by Muscle" picker in the workout logger lets you drill down to an exercise instead of only searching by name',
    ],
  },
  {
    version: '0.16',
    date: '2026-07-18',
    features: [
      'Fixed the Atlas post-session summary and Personal Journalist chat sometimes getting cut off mid-sentence — Gemini\'s "thinking" pass was silently eating into the same token budget as the visible reply; now detected and retried with more room instead of quietly returning the cut-off text',
      'New rep-range callout: flags it live while logging once most hard sets in a session are running 3 reps or under (the training ethos biases toward 8-9), and Atlas will mention it after the session too if it never got worked back up',
    ],
  },
  {
    version: '0.15',
    date: '2026-07-18',
    features: [
      'Replaced the flat "hard sets this session ÷ 4" Stimulus score with a continuous per-muscle adaptation model: each session contributes a rise-and-decay curve peaking 48h later, and curves from different sessions stack — a frequency-first week of small sessions can now correctly read as fully dosed, instead of every individual session looking under-dosed in isolation',
      'New Adaptation tab (Recovery section): a per-muscle chart of that stacked curve, plus a dashed projection of where it heads with no further training — the projected decay rate calibrates automatically from your own real training gaps where there\'s enough history, with a manual override',
      'The live "Session Stimulus" badge while logging a workout now shows a projected peak (recent history + this session so far) instead of a flat this-session-only dose',
    ],
  },
  {
    version: '0.14',
    date: '2026-07-18',
    features: [
      'Added Dark Mode — toggle it in Settings → Profile, syncs across logins/devices',
      'Fixed a gap where a failed /summary request could silently defeat the loading screen and briefly show empty data instead',
      'Rest timer now shows live glycogen replenishment (half-life 45s) instead of a plain time countdown',
      'Fatigue Types (Structural/Metabolic/CNS) now shown as a plain percentage',
      'Session Stimulus no longer credits a secondary/assistor muscle (e.g. biceps on a row) the same as the actual primary target — secondary muscles now count at half weight',
    ],
  },
  {
    version: '0.13',
    date: '2026-07-18',
    features: [
      'Exercise selection now heavily favors whatever you\'ve actually done before over something novel, whether picking a backbone lift or an accessory',
      'Big disincentive against isometric holds (Plank, Pallof Press, Side Plank, ...) in favor of exercises with a normal, progressively-loadable range of motion — mechanical tension through full ROM is the primary driver of strength stimulus',
      'Obscure/novel exercises (like the Pallof Press) are now scored down hard as accessories, and were already excluded from backbone picks entirely',
    ],
  },
  {
    version: '0.12',
    date: '2026-07-18',
    features: [
      'Exercise search now also matches muscle, equipment, and category — searching "lats" finds every pulldown/row variant, not just exercises with "lats" literally in the name',
      'Full-body auto-picked sessions now give 2 exercises per muscle group instead of 1, with the split between compound and isolation work following whichever you\'ve actually favored over your last 90 days of training',
      'Fixed the Strength Level panel (All-Time Bests) never appearing on mobile — a scroll-reveal effect required 35% of the section on-screen at once, which a long PR list can never reach on a phone-sized viewport',
      'App now shows a proper loading screen on open instead of the full page appearing with every section empty for a few seconds while data loads',
      'Moved What\'s New to the bottom of Settings, out of the way of the settings you actually came to change',
    ],
  },
  {
    version: '0.11',
    date: '2026-07-18',
    features: [
      'Fixed the Ranking legend showing no color at all for 5 of its 6 tiers (Beginner through Elite) — a key mismatch left every dot but Untrained blank',
      'Ranking tier colors now run grey → green → blue → purple → orange → gold as you climb, ending Elite on literal gold, instead of an arbitrary hue per tier',
    ],
  },
  {
    version: '0.10',
    date: '2026-07-16',
    features: [
      'Soreness logging now has a body diagram picker, matching Fatigue and Ranking — tap a muscle on the diagram instead of hunting through a 31-button grid (muscles without a diagram region still list separately below it)',
    ],
  },
  {
    version: '0.9',
    date: '2026-07-16',
    features: [
      'Added a real home-screen icon (a bold serif "P" on the app\'s own paper/ink colours) plus a web app manifest, so "Add to Home Screen" no longer falls back to a screenshot — also fixes push notifications, which were already referencing an icon file that never existed',
    ],
  },
  {
    version: '0.8',
    date: '2026-07-16',
    features: [
      'Freestyle-logged exercises now suggest a set count and a descending RIR target per set (e.g. "3 sets · RIR 2→1→0"), matching the same guidance a pre-planned session already gets for free',
    ],
  },
  {
    version: '0.7',
    date: '2026-07-16',
    features: [
      'New "Session Stimulus" readout while logging a workout: 100% = optimal hard-set dose for a muscle this session, above 100% means you\'ve gone past the useful dose into diminishing returns',
    ],
  },
  {
    version: '0.6',
    date: '2026-07-16',
    features: [
      'Fixed muscle fatigue reading far too low after a real session — the fatigue denominator was an unbounded all-time peak, so one old specialization day (e.g. 4 quad exercises stacked in one leg day) could permanently suppress that muscle\'s fatigue% forever, even years later',
    ],
  },
  {
    version: '0.5',
    date: '2026-07-16',
    features: [
      'Nutrition log entries can now carry a free-text description/note, editable regardless of whether it came from a photo scan — shown in the meal log table, Recent Foods, and CSV export',
      'Fixed Recent Foods always showing empty (it was matching on a field no nutrition entry actually has)',
    ],
  },
  {
    version: '0.4',
    date: '2026-07-16',
    features: [
      'Fixed Hevy live-sync webhook responding before the workout was actually saved, so a sync could silently fail to update anything (fatigue included) despite Hevy reporting success',
    ],
  },
  {
    version: '0.3',
    date: '2026-07-16',
    features: [
      'Strength Level bars now fill toward the next numbered sub-level instead of a flat 0-100',
      'Wide-range time estimate to your next strength level, shown only when you have a real, sustained progression trend behind it',
    ],
  },
  {
    version: '0.2',
    date: '2026-07-16',
    features: [
      'Strength ranks simplified back to the original 5, each split into 3 numbered sub-levels (e.g. Beginner 1/2/3) instead of separate invented names',
    ],
  },
  {
    version: '0.1',
    date: '2026-07-15',
    features: [
      'Session CNS-load badge no longer misreads row-heavy sessions as "Light"',
      'Warmup sets no longer flagged "Short of target"',
      'A set that lands a new e1RM PR no longer flagged "Short of target"',
      'Live "PR pace" hint shows the rep range needed to beat your PR as you enter a weight',
      'Machine/technique tag suggests real UK commercial-gym equipment brands',
      'In-progress sessions now survive backgrounding the app (no more lost workouts)',
      'Removed a duplicate progression note and fixed truncated AI coaching cues',
      'Ranking tab body diagram no longer shows stale colors from previous data',
      'Ranking tab diagram colors now correctly match the legend key',
      'Finer strength ranks added between the original 5, plus an open-ended "Ultra Elite" tier above 100',
    ],
  },
];

// In-progress session persistence — WorkoutLogger previously held its whole
// state (exercises, elapsed timer, custom-exercise additions) in plain React
// state with nowhere else to live. Mobile browsers/PWAs routinely discard a
// backgrounded tab's JS state and reload the page when you switch back to
// it, which silently wiped an entire session mid-workout. Mirrored to
// localStorage on every change and restored on mount instead.
const ACTIVE_SESSION_KEY = 'press_active_session';
const ACTIVE_SESSION_MAX_AGE_MS = 24 * 3600000; // abandoned, not resumable

function saveActiveSession(data) {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data)); } catch {}
}
function loadActiveSession() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.startedAt || Date.now() - data.startedAt > ACTIVE_SESSION_MAX_AGE_MS) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}
function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
}
// cnsLoad and progression (computeProgression via progressionFor) are
// imported — see the top-of-file comment by the muscleTaxonomy/fatigue/
// sessionPlanner imports.

const sessionFatigue = exercises => {
  const scores = {};
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (!s.done) continue;
      const load = (+s.kg || 0) * (+s.reps || 1);
      for (const m of musclesForExercise(ex.name)) scores[m] = (scores[m] || 0) + load;
    }
  }
  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(Object.entries(scores).map(([m, v]) => [m, Math.min(100, Math.round(v / max * 100))]));
};

// Live preview of the continuous adaptation model (functions/adaptation.js):
// for each muscle touched so far this session, projects where that muscle's
// stacked adaptation curve would peak (48h out) if the session ended right
// now — the already-logged history's own curves at that future point, plus
// this in-progress session's own contribution evaluated at its peak (48h is
// exactly the peak for a session dated "now", so this is
// sessionStimulusScore(...) directly, just expressed via adaptationCurve to
// stay visibly consistent with the rest of the model). Replaces the old flat
// "hard sets this session ÷ a fixed target" badge, which couldn't see that a
// frequency-first program's small per-session doses are meant to stack
// across the week, not clear a bar in any single session.
const liveAdaptationPreview = (exercises, lifts) => {
  const peakMs = Date.now() + 48 * 3600000;
  const historicalContributions = computeStimulusContributions(lifts);

  const liveScore = {};
  for (const ex of exercises) {
    const doneSets = ex.sets.filter(s => s.type !== 'W' && s.done);
    if (!doneSets.length) continue;
    const avgRIR = doneSets.reduce((acc, s) => {
      const rpe = s.rpe === '' || s.rpe == null ? null : +s.rpe;
      return acc + (rpe != null ? Math.max(0, 10 - rpe) : DEFAULT_RIR);
    }, 0) / doneSets.length;
    const score = sessionStimulusScore(doneSets.length, avgRIR);
    const entry = findExercise(ex.name);
    if (entry) {
      for (const m of entry.primary || []) liveScore[m] = (liveScore[m] || 0) + score;
      for (const m of entry.secondary || []) liveScore[m] = (liveScore[m] || 0) + score * SECONDARY_MUSCLE_WEIGHT;
    } else {
      for (const m of musclesForExercise(ex.name)) liveScore[m] = (liveScore[m] || 0) + score;
    }
  }

  const muscles = new Set([...Object.keys(historicalContributions), ...Object.keys(liveScore)]);
  const out = {};
  for (const m of muscles) {
    const historicalLevel = computeAdaptationLevel(historicalContributions[m], peakMs);
    const liveContribution = adaptationCurve(48, liveScore[m] || 0);
    out[m] = Math.round((historicalLevel + liveContribution) * 100);
  }
  return out;
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
        <span>{localDateFromYMD(pts[0].d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
        <span>{localDateFromYMD(last.d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
      </div>
    </div>
  );
}

// Tree-nav exercise picker: muscle group -> pattern -> movement -> variant.
// Additive alongside the free-text search above, not a replacement — same
// addExercise() call either way, this is just a browsable way to arrive at
// a name for someone who doesn't know exactly what they're looking for.
// Skips the variant step when a movement only has one (e.g. Face Pull),
// since making someone pick between one option isn't navigation.
function ExerciseBrowser({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(null);
  const [pattern, setPattern] = useState(null);
  const [movementId, setMovementId] = useState(null);

  const reset = () => { setGroup(null); setPattern(null); setMovementId(null); };

  const groups = useMemo(() => EXERCISE_MUSCLE_GROUPS.filter(g => EXERCISE_DB.some(e => e.muscleGroup === g)), []);

  const patterns = useMemo(() => {
    if (!group) return [];
    const present = new Set(EXERCISE_DB.filter(e => e.muscleGroup === group).map(e => e.pattern));
    return EXERCISE_PATTERNS.filter(p => present.has(p));
  }, [group]);

  const movements = useMemo(() => {
    if (!group || !pattern) return [];
    const byId = new Map();
    for (const e of EXERCISE_DB) {
      if (e.muscleGroup !== group || e.pattern !== pattern) continue;
      if (!byId.has(e.movementId)) byId.set(e.movementId, { movementId: e.movementId, movementName: e.movementName, count: 0 });
      byId.get(e.movementId).count++;
    }
    return [...byId.values()].sort((a, b) => a.movementName.localeCompare(b.movementName));
  }, [group, pattern]);

  const variants = useMemo(() => {
    if (!movementId) return [];
    return EXERCISE_DB.filter(e => e.movementId === movementId).sort((a, b) => a.name.localeCompare(b.name));
  }, [movementId]);

  const pick = ex => {
    onAdd(ex.name.toLowerCase());
    reset();
  };

  const selectMovement = m => {
    if (m.count === 1) {
      pick(EXERCISE_DB.find(e => e.movementId === m.movementId));
    } else {
      setMovementId(m.movementId);
    }
  };

  const tileStyle = { padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'left' };

  let step = 'group', items = [], onPick = null;
  if (!group) { step = 'group'; items = groups.map(g => ({ key: g, label: g })); onPick = it => setGroup(it.key); }
  else if (!pattern) { step = 'pattern'; items = patterns.map(p => ({ key: p, label: p })); onPick = it => setPattern(it.key); }
  else if (!movementId) { step = 'movement'; items = movements.map(m => ({ key: m.movementId, label: m.count > 1 ? `${m.movementName} (${m.count})` : m.movementName, m })); onPick = it => selectMovement(it.m); }
  else { step = 'variant'; items = variants.map(v => ({ key: v.id, label: v.name, v })); onPick = it => pick(it.v); }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <button onClick={() => { setOpen(v => !v); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {open ? '− ' : '+ '}Browse by Muscle
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>
            {group && <button onClick={() => reset()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{group}</button>}
            {pattern && <><span>›</span><button onClick={() => { setPattern(null); setMovementId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{pattern}</button></>}
            {movementId && <><span>›</span><span>{variants[0]?.movementName}</span></>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {items.map(it => (
              <button key={it.key} style={tileStyle} onClick={() => onPick(it)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}>
                {it.label}
              </button>
            ))}
          </div>
          {step !== 'group' && (
            <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8, marginTop: 8 }}
              onClick={() => {
                if (step === 'variant') setMovementId(null);
                else if (step === 'movement') setPattern(null);
                else if (step === 'pattern') setGroup(null);
              }}>
              ← Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PlateCalculator() {
  const [open, setOpen] = useState(false);
  const [barWeight, setBarWeight] = useState('20');
  const [targetWeight, setTargetWeight] = useState('');
  const [disabledPlates, setDisabledPlates] = useState(() => new Set());

  const result = useMemo(() => {
    const target = parseFloat(targetWeight), bar = parseFloat(barWeight);
    if (!target || !bar) return null;
    if (target <= bar) return { tooLight: true };
    const available = STANDARD_PLATES_KG.filter(p => !disabledPlates.has(p));
    return platesForWeight(target, bar, available);
  }, [targetWeight, barWeight, disabledPlates]);

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {open ? '− ' : '+ '}Plate Calculator
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="prof-lbl" style={{ marginBottom: 4 }}>Bar (kg)</div>
              <input className="prof-input" style={{ width: '100%' }} inputMode="decimal" value={barWeight} onChange={e => setBarWeight(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="prof-lbl" style={{ marginBottom: 4 }}>Target (kg)</div>
              <input className="prof-input" style={{ width: '100%' }} inputMode="decimal" placeholder="e.g. 100" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
            </div>
          </div>

          <div className="prof-lbl" style={{ marginBottom: 4 }}>Available plates</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {STANDARD_PLATES_KG.map(p => (
              <button key={p} className={`prof-btn${disabledPlates.has(p) ? '' : ' solid'}`}
                onClick={() => setDisabledPlates(prev => {
                  const next = new Set(prev);
                  next.has(p) ? next.delete(p) : next.add(p);
                  return next;
                })}>
                {p}
              </button>
            ))}
          </div>

          {result?.tooLight && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>Target is at or under the bar weight.</div>
          )}
          {result && !result.tooLight && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>{result.perSide}kg per side:</div>
              {result.plates.length === 0 ? (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>No available plate combination reaches this weight.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {result.plates.map(({ plate, count }) => (
                    <div key={plate} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--ink)', border: '1px solid var(--rule)', padding: '5px 10px' }}>
                      {plate}kg <span style={{ color: 'var(--dim)' }}>×{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.leftover > 0 && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', marginTop: 6 }}>
                  {result.leftover}kg per side can't be made with the available plates.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RPE_PLAIN_LANGUAGE = { easy: 6, medium: 8, failure: 10 };

function WorkoutLogger({ planDay, lifts, customExercises, experienceLevel, onClose, refresh }) {
  const isBeginner = experienceLevel === 'New to training';
  // Read once, on mount — a session already restored into `exercises` below
  // shouldn't be re-read on every render (the App-level restore that opened
  // this component in the first place already matched on the same key).
  const [restored] = useState(() => loadActiveSession());
  const [exercises, setExercises] = useState(() => restored?.exercises || []);
  const [loading, setLoading] = useState(() => !restored && !!planDay);
  const [expandedEx, setExpandedEx] = useState(null);
  const [otherMachineRows, setOtherMachineRows] = useState(() => new Set());
  const [coachNotes, setCoachNotes] = useState({});
  const [coachLoading, setCoachLoading] = useState({});
  const [newEx, setNewEx] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [start] = useState(() => restored?.startedAt || Date.now());
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - (restored?.startedAt || Date.now())) / 1000));
  const [rest, setRest] = useState(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [newCustomExercises, setNewCustomExercises] = useState(() => restored?.newCustomExercises || []);
  const inputRef = useRef();

  const allExercises = useMemo(() => {
    const fromLifts = [...new Set((lifts || []).map(l => l.exercise).filter(Boolean))];
    const fromCustom = (customExercises || []).map(ce => ce.name).filter(Boolean);
    return [...new Set([...fromLifts, ...fromCustom, ...BASE_EXERCISES])].sort();
  }, [lifts, customExercises]);

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

  // Load exercises — use preloaded if available, otherwise fetch from AI.
  // Skipped entirely when resuming a restored session: `exercises` is
  // already hydrated from storage above, and re-running this would replace
  // real in-progress sets with a freshly (re)generated plan.
  useEffect(() => {
    if (!planDay || restored) return;
    const session = planDay.sessions?.[0];
    if (!session || session.type === 'rest') { setLoading(false); return; }

    const toExercise = ex => ({
      name: ex.name.toLowerCase().trim(),
      bw: false,
      targetReps: ex.sets?.[0]?.reps || 8,
      sets: (ex.sets || Array.from({length:3},()=>({type:'N',kg:'',reps:'8'}))).map(s => ({ type: s.type || 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rpe: '', done: false })),
    });

    if (planDay.preloadedExercises?.length) {
      setExercises(planDay.preloadedExercises.map(toExercise));
      setLoading(false);
      return;
    }

    authFetch(`${API_BASE}/plan/session-exercises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: session.type, targetMuscles: session.targetMuscles, backboneExercises: session.backboneExercises }),
    }).then(r => r.json()).then(data => {
      if (data.exercises?.length) setExercises(data.exercises.map(toExercise));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Derived from `start` on every tick rather than incremented — a plain
    // counter reads correctly while the tab stays alive, but resets to 0 on
    // restore/remount even though `start` (and the persisted session) still
    // know when the session actually began.
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [start]);

  // Mirror the live session to localStorage on every change so a
  // backgrounded-tab reload (common on mobile) can restore it instead of
  // losing it — see the ACTIVE_SESSION_KEY comment above. Stops once the
  // session is complete; `finish()`/discard clear the key outright at that
  // point instead of leaving a finished session's snapshot behind.
  useEffect(() => {
    if (summary || loading) return;
    saveActiveSession({ planDay, exercises, newCustomExercises, startedAt: start });
  }, [planDay, exercises, newCustomExercises, start, summary, loading]);

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
    const nameMatches = allExercises.filter(e => e.includes(q));
    const tagMatches = allExercises.filter(e => !e.includes(q) && (EXERCISE_SEARCH_TAGS.get(e) || '').includes(q));
    setSuggestions([...nameMatches, ...tagMatches].slice(0, 8));
  };

  const addExercise = name => {
    if (!name.trim()) return;
    const key = name.toLowerCase().trim();
    if (!allExercises.includes(key)) {
      setNewCustomExercises(p => p.some(ce => ce.name === key) ? p : [...p, { name: key }]);
    }
    const prev = prevData[key];
    const sets = prev?.sets?.map(s => ({ type: 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rpe: '', done: false }))
      || [{ type: 'N', kg: '', reps: '', rpe: '', done: false }];
    setExercises(p => [...p, { name: key, bw: false, targetReps: 8, sets }]);
    setNewEx(''); setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 50);
    // No progression fetch here — the render below already calls
    // progressionFor(lifts, ex.name) live for every exercise, including
    // ones just added here, so a separate backend round-trip for the same
    // computation was redundant (and, worse, rendered as a visible
    // duplicate of the exact same note text once it resolved).
  };

  // expandedEx tracks a raw array index, so removing an earlier exercise
  // reindexes the array underneath it — without this adjustment, expanding
  // exercise B, then deleting an exercise before it in the list, would leave
  // expandedEx pointing at whatever exercise slid into B's old slot instead
  // of B (or the wrong row collapsing/expanding depending on position).
  const removeExercise = i => {
    setExercises(p => p.filter((_, j) => j !== i));
    setExpandedEx(prev => prev == null ? prev : prev === i ? null : prev > i ? prev - 1 : prev);
  };

  const addSet = i => setExercises(p => p.map((ex, j) => j !== i ? ex : {
    ...ex, sets: [...ex.sets, { type: 'N', kg: ex.sets.at(-1)?.kg || '', reps: ex.sets.at(-1)?.reps || '', rpe: '', done: false }]
  }));

  const updateSet = (ei, si, field, val) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }
  ));

  const cycleType = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: SET_TYPES[(SET_TYPES.indexOf(s.type) + 1) % SET_TYPES.length] }) }
  ));

  const completeSet = (ei, si) => {
    const ex = exercises[ei];
    const set = ex.sets[si];
    const rpe = parseInt(set.rpe) || null;
    const reps = parseInt(set.reps) || 0;
    const kg = parseFloat(set.kg) || 0;
    const targetReps = ex.targetReps || 8;

    const weekAgo = toLocalDateStr(new Date(Date.now() - 7 * 86400000));
    const exLifts = (lifts || []).filter(l => l.exercise === ex.name && l.date < weekAgo);
    const weekOldMax = exLifts.length ? Math.max(...exLifts.map(l => l.kg || 0)) : null;
    const weekProgressionPct = (weekOldMax && kg) ? ((kg - weekOldMax) / weekOldMax * 100) : 0;
    const setE1rm = !ex.bw ? e1rm(kg, reps) : null;
    const isNewPR = setE1rm && setE1rm > (prData[ex.name] || 0);

    let feedback = null;
    let feedbackType = 'neutral';
    if (set.type === 'W') {
      // Warmup sets are deliberately low-rep ramp-ups, not attempts at the
      // working-set target — comparing them to targetReps flagged every
      // warmup as "short of target" regardless of how the set actually went.
    } else if (rpe !== null && rpe >= 9 && weekProgressionPct > 5) {
      feedback = 'High effort + rapid load increase — check form before adding weight';
      feedbackType = 'red';
      api(`exercises/${encodeURIComponent(ex.name.replace(/\s+/g, '-'))}`).then(d => {
        if (d.exercise?.form?.[0]) {
          setExercises(p => p.map((e, i) => i !== ei ? e : {
            ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, feedback: `${d.exercise.form[0]}`, feedbackType: 'red' })
          }));
        }
      }).catch(() => {});
    } else if (isNewPR) {
      // A rep count under targetReps still reads as "short" by the branch
      // below, but a heavier set that lands a new e1RM PR is the opposite of
      // a shortfall — check this before the rep-count comparison, not after.
      feedback = 'New e1RM PR — strong set';
      feedbackType = 'green';
    } else if (reps < targetReps - 2) {
      feedback = 'Short of target — hold weight next set';
      feedbackType = 'amber';
    } else if (reps > targetReps + 2 && (rpe === null || rpe <= 7)) {
      feedback = 'Strong set — add 2.5kg next set';
      feedbackType = 'green';
    } else if (rpe !== null && rpe >= 7 && rpe <= 8 && reps >= targetReps) {
      feedback = 'On target — maintain next set';
      feedbackType = 'green';
    }

    setExercises(p => p.map((e, i) => i !== ei ? e : {
      ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, done: true, feedback, feedbackType })
    }));
    const restDuration = rpe !== null && rpe >= 9 ? 180 : rpe !== null && rpe >= 7 ? 90 : REST_DEFAULT;
    setRest({ remaining: restDuration, total: restDuration });
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
    if (!valid.length) { clearActiveSession(); onClose(); return; }
    setSaving(true);
    const today = todayLocalStr();
    const allSets = valid.flatMap(ex => ex.sets.map(s => ({
      exercise: ex.name, kg: parseFloat(s.kg) || 0, reps: parseInt(s.reps) || 0, rpe: parseInt(s.rpe) || null,
      ...(ex.machine ? { machine: ex.machine } : {}),
      ...(ex.pulleyType ? { pulleyType: ex.pulleyType } : {}),
    })));
    try {
      const r = await api('session/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout: { name: planDay?.sessions?.[0]?.title || 'Session', date: today }, sets: allSets, customExercises: newCustomExercises }),
      });
      clearActiveSession(); // saved server-side now — stop persisting/offering to restore this one
      await api('summary').then(refresh);
      setSummary({
        name: planDay?.sessions?.[0]?.title || 'Session',
        duration: Math.round(elapsed / 60),
        setsLogged: allSets.filter(s => s.kg || s.reps).length,
        atlasSummary: r.atlasSummary,
      });
    } catch (e) {
      // Left persisted deliberately: session/complete failed (network etc.),
      // so the in-progress draft is still the only copy of this data.
      onClose();
    }
    setSaving(false);
  };

  const session = planDay?.sessions?.[0];
  const cns = cnsLoad(exercises);
  const fatigue = sessionFatigue(exercises);
  const fatigueMuscles = Object.entries(fatigue).sort(([,a],[,b]) => b - a);
  // Stimulus is a different question from the fatigue block below it: not
  // "which muscles got hit hardest relative to each other this session"
  // (sessionFatigue, normalized against the session's own max), but "if this
  // session ended right now, where would each muscle's continuous adaptation
  // level peak" — see liveAdaptationPreview and functions/adaptation.js.
  // 100 = the single-session peak a maximal-effort session on its own would
  // reach; recent history stacks on top, so this can (correctly) exceed 100.
  const stimulus = liveAdaptationPreview(exercises, lifts);
  const stimulusMuscles = Object.entries(stimulus).sort(([,a],[,b]) => b - a);
  // Session-wide pattern, not a per-set nag — a single deliberate heavy
  // single/double/triple (testing a top set) shouldn't trip this, only a
  // real majority of the session landing at/below LOW_REP_THRESHOLD. See
  // sessionPlanner.js's isLowRepPattern for the training-ethos reasoning.
  const hardSetsSoFar = exercises.flatMap(ex => ex.sets.filter(s => s.type !== 'W' && s.done));
  const lowRepPattern = isLowRepPattern(hardSetsSoFar);
  const th = { fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400, padding: '3px 0', borderBottom: '1px solid var(--rule)', textAlign: 'right' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: rest ? 72 : 0 }}>

      {/* Header */}
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>{summary ? 'Complete' : 'In Session'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(elapsed)}</div>
            {!summary && exercises.some(e => e.sets.some(s => s.done)) && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 7px', background: cns.color, color: 'var(--paper)' }}>{cns.label}</span>
            )}
          </div>
        </div>
        {summary ? (
          <button className="ol-btn ol-btn-solid" onClick={onClose}>Back to Press</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ol-btn ol-btn-ghost" onClick={() => { clearActiveSession(); onClose(); }}>Discard</button>
            <button className="ol-btn ol-btn-solid" onClick={finish} disabled={saving}>{saving ? 'Saving…' : 'Finish'}</button>
          </div>
        )}
      </div>

      {/* Loading template */}
      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em' }}>
          Generating session plan…
        </div>
      )}

      {!loading && summary && (
        <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="kicker">Session Complete</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, lineHeight: 1.1, margin: '6px 0 4px' }}>{summary.name.toUpperCase()}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.1em' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {summary.duration}min · {summary.setsLogged} sets
            </div>
          </div>
          <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 14 }}>
            <div className="kicker" style={{ marginBottom: 8 }}>Atlas · Training</div>
            {summary.atlasSummary
              ? <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 14, lineHeight: 1.85, color: 'var(--ink)' }}>{summary.atlasSummary}</div>
              : <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Atlas was quiet today.</div>
            }
          </div>
        </div>
      )}

      {!loading && !summary && (
        <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* AI plan context */}
          {session && (
            <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--gold)', background: 'var(--paper2)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>{session.type} · {session.duration}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, marginBottom: 4 }}>{session.title}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>{session.detail}</div>
            </div>
          )}

          {/* Low-rep pattern callout — training ethos biases toward 8-9 reps;
              1-2 reps rarely deliver enough stimulus per set to default to.
              Only shown once it's a real session-wide majority, not a single
              deliberate heavy set. */}
          {lowRepPattern && (
            <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--ember)', background: 'var(--paper2)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>Rep Range</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
                Most hard sets so far are at or under {LOW_REP_THRESHOLD} reps. Ethos biases toward 8-9 reps — low singles/doubles/triples rarely deliver enough stimulus per set to default to.
              </div>
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

          {/* Live projected peak — where each muscle's stacked adaptation
              curve (recent history + this session so far) would peak 48h
              from now if the session ended right now. 100 = a single maximal
              session's own peak; recent history stacking on top can push
              this past 100, which is expected, not a warning. */}
          {stimulusMuscles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Session Stimulus</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {stimulusMuscles.map(([m, pct]) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: pct > 130 ? 'var(--ember)' : pct >= 70 ? 'var(--forest)' : 'var(--gold)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>{m} {pct}%</span>
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
            const prog = progressionFor(lifts, ex.name);
            const progression = prog?.note || null;
            // Freestyle-only: a planned session already communicates its set
            // count by pre-filling that many rows (see
            // generateSessionExercises), but a freestyle-added exercise
            // starts with just one blank/carried-over set and no RIR
            // guidance at all — this fills that specific gap.
            let freestyleSuggestion = null;
            if (!planDay) {
              const sessionCount = new Set(lifts.filter(l => l.exercise === ex.name).map(l => l.date)).size;
              const setCount = suggestedWorkingSetCount(sessionCount);
              freestyleSuggestion = `Suggested: ${setCount} sets · RIR ${suggestedRirSequence(setCount).join('→')}`;
            }
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
                    {localDateFromYMD(prev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {prev.sets.map(s => ex.bw ? `BW×${s.reps}` : `${s.kg}×${s.reps}`).join(', ')}
                  </div>
                )}

                {/* Progressive overload suggestion — used to be duplicated by a
                    second "AI-generated" note fetched from the backend, back
                    when the session planner called Gemini for this. Since the
                    planner went fully deterministic (both paths call the same
                    progressionFor()), that second fetch just reproduced this
                    exact same string a beat later and rendered it twice. */}
                {progression && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: prog.trend === 'stalled' ? 'var(--ember)' : 'var(--forest)', marginBottom: 5 }}>
                    {progression}
                  </div>
                )}

                {/* Freestyle set-count/RIR guidance — see freestyleSuggestion
                    above for why this only appears outside a planned session. */}
                {freestyleSuggestion && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--navy)', marginBottom: 5 }}>
                    {freestyleSuggestion}
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

                {/* BW toggle + volume + optional machine/technique tag */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setExercises(p => p.map((e, j) => j !== i ? e : { ...e, bw: !e.bw }))}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer', border: '1px solid var(--rule)', background: ex.bw ? 'var(--ink)' : 'none', color: ex.bw ? 'var(--paper)' : 'var(--dim)' }}>
                    BW
                  </button>
                  {vol > 0 && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{Math.round(vol).toLocaleString()} kg total</span>}
                  {(() => {
                    const equipment = findExercise(ex.name)?.equipment;
                    const brands = defaultMachineBrands(equipment);
                    const tagStyle = { fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.03em', padding: '3px 6px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)' };
                    if (!brands.length) {
                      // Barbell/dumbbell/bodyweight have no brand-specific
                      // leverage/curve — free text stays for whatever
                      // personal technique note is still worth tagging.
                      return (
                        <>
                          <input list={`machine-tags-${i}`} value={ex.machine || ''} placeholder="Machine/technique (optional)"
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: e.target.value }))}
                            style={{ ...tagStyle, width: 150 }} />
                          <datalist id={`machine-tags-${i}`}>
                            {[...new Set((lifts || []).filter(l => l.exercise === ex.name && l.machine).map(l => l.machine))].map(m => <option key={m} value={m} />)}
                          </datalist>
                        </>
                      );
                    }
                    const showOther = otherMachineRows.has(i) || (ex.machine && !brands.includes(ex.machine));
                    return (
                      <>
                        <select value={showOther ? '__other__' : (ex.machine || '')}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '__other__') { setOtherMachineRows(p => new Set(p).add(i)); return; }
                            setOtherMachineRows(p => { const n = new Set(p); n.delete(i); return n; });
                            setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: v }));
                          }}
                          style={tagStyle}>
                          <option value="">Brand (optional)</option>
                          {brands.map(b => <option key={b} value={b}>{b}</option>)}
                          <option value="__other__">Other…</option>
                        </select>
                        {showOther && (
                          <input value={ex.machine || ''} placeholder="Gym/brand name" autoFocus
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: e.target.value }))}
                            style={{ ...tagStyle, width: 120 }} />
                        )}
                        {equipment === 'cable' && (
                          <select value={ex.pulleyType || ''}
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, pulleyType: e.target.value }))}
                            style={tagStyle}>
                            <option value="">Pulley (optional)</option>
                            <option value="single">Single Pulley</option>
                            <option value="double">Double Pulley</option>
                          </select>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Sets table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left', width: 26 }}>Set</th>
                      <th style={{ ...th, width: 56 }}>Prev</th>
                      {!ex.bw && <th style={{ ...th, width: 48 }}>kg</th>}
                      <th style={{ ...th, width: 38 }}>Reps</th>
                      <th style={{ ...th, width: isBeginner ? 58 : 28 }}>{isBeginner ? 'Effort' : 'RPE'}</th>
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
                      const fbColor = set.feedbackType === 'green' ? 'var(--forest)' : set.feedbackType === 'red' ? 'var(--red)' : set.feedbackType === 'amber' ? 'var(--gold)' : 'var(--dim)';
                      const minRepsForPR = (!ex.bw && !set.done && isWorking && +set.kg > 0) ? repsForPR(+set.kg, prData[ex.name]) : null;
                      return (
                        <React.Fragment key={j}>
                        <tr style={{ opacity: set.done ? 0.45 : 1 }}>
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
                              ? isBeginner
                                ? <select value={Object.keys(RPE_PLAIN_LANGUAGE).find(k => String(RPE_PLAIN_LANGUAGE[k]) === String(set.rpe)) || ''}
                                    onChange={e => updateSet(i, j, 'rpe', e.target.value ? String(RPE_PLAIN_LANGUAGE[e.target.value]) : '')}
                                    disabled={set.done}
                                    style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, background: 'transparent', border: 'none', width: 56 }}>
                                    <option value="">—</option>
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="failure">Failure</option>
                                  </select>
                                : <input className="set-input" value={set.rpe} onChange={e => updateSet(i, j, 'rpe', e.target.value)}
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
                        {set.done && set.feedback && (
                          <tr>
                            <td colSpan={ex.bw ? 5 : 6} style={{ paddingBottom: 4 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.09em', color: fbColor }}>↳ {set.feedback}</span>
                            </td>
                          </tr>
                        )}
                        {minRepsForPR != null && (
                          <tr>
                            <td colSpan={ex.bw ? 5 : 6} style={{ paddingBottom: 4 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.09em', color: 'var(--dim)' }}>
                                ↳ PR pace at {set.kg}kg — {minRepsForPR}–{minRepsForPR + 3} reps
                              </span>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
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

          <ExerciseBrowser onAdd={addExercise} />
          <PlateCalculator />
        </div>
      )}

      {/* Rest timer — shows live glycogen replenishment (% recovered, half-life
          45s) rather than a plain time countdown; still auto-clears at the
          same effort-scaled total as before. */}
      {rest && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--ink)', color: 'var(--paper)', zIndex: 1100, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', background: 'var(--paper)', borderRadius: 2, transform: `scaleX(${glycogenPct(rest.total - rest.remaining) / 100})`, transformOrigin: 'left', transition: 'transform 1s linear' }} />
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>Glycogen {glycogenPct(rest.total - rest.remaining)}%</div>
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
      const dateISO = toLocalDateStr(new Date(startRaw));
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

const IMPORT_BATCH = 10;

function HevyImport({ onClose, refresh }) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, imported: 0, skipped: 0, current: null });
  const [log, setLog] = useState([]);
  const logRef = useRef();
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
    const total = sessions.length;
    // flushSync forces React to synchronously commit before any async work starts
    flushSync(() => {
      setStatus('importing');
      setLog([]);
      setProgress({ done: 0, total, imported: 0, skipped: 0, current: sessions[0] || null });
    });

    setProgress({ done: 0, total, current: sessions[0], imported: 0, skipped: 0 });

    let totalImported = 0, totalSkipped = 0;
    try {
      const r = await authFetch(`${API_BASE}/import/hevy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)));
      totalImported = r?.imported || 0;
      totalSkipped = r?.skipped || 0;
      setLog(sessions.map(s => ({ name: s.name, date: s.date, exCount: s.exercises.length })));
    } catch (err) {
      setResult({ ok: false, error: err.message });
      setStatus('done');
      return;
    }

    setProgress({ done: total, total, imported: totalImported, skipped: totalSkipped, current: null });
    setResult({ ok: true, imported: totalImported, skipped: totalSkipped });
    await api('summary').then(refresh);
    setStatus('done');
  };

  const totalSets = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Data Import</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700 }}>Hevy CSV</div>
        </div>
        {status !== 'importing' && <button className="ol-btn ol-btn-ghost" onClick={onClose}>Close</button>}
      </div>

      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

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
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16, borderTop: '1px solid var(--rule)', flex: 1 }}>
              {sessions.slice().reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{s.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{s.exercises.map(e => e.name).join(' · ')}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', whiteSpace: 'nowrap', marginLeft: 12 }}>{s.date}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ol-btn ol-btn-solid" onClick={doImport}>Import {sessions.length} sessions</button>
              <button className="ol-btn ol-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {status === 'importing' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink)', marginBottom: 10 }}>
                Importing {progress.total} sessions…
              </div>
              <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--ink)', borderRadius: 2, width: '100%', animation: 'pulse-bar 1.4s ease-in-out infinite' }} />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 6 }}>
                Sending to server — this takes a few seconds
              </div>
            </div>

            {/* Live log */}
            <div ref={logRef} style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--rule)' }}>
              {log.slice().reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--rule)', opacity: i === 0 ? 1 : Math.max(0.25, 1 - i * 0.05) }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: s.error ? 'var(--ember)' : 'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: s.error ? 'var(--ember)' : 'var(--dim)', marginTop: 1 }}>{s.error ? 'skipped — timeout' : `${s.exCount} exercises`}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: s.error ? 'var(--ember)' : 'var(--forest)' }}>{s.error ? '⚠ ' : '✓ '}{s.date}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            {result?.ok ? (
              <>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {result.imported} sessions imported.
                </div>
                {result.skipped > 0 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 16 }}>{result.skipped} already existed — skipped.</div>}
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--forest)', marginBottom: 20, letterSpacing: '.06em' }}>✓ Progressive overload + fatigue models updated</div>
              </>
            ) : (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ember)', marginBottom: 16 }}>
                Import failed: {result?.error || 'unknown error'}. Try again.
              </div>
            )}
            <button className="ol-btn ol-btn-solid" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── WORKOUT HISTORY ───────────────────────────────────────────────────────────
function WorkoutHistory({ s, onClose }) {
  const [expanded, setExpanded] = useState(null);
  const workouts = useMemo(() => {
    return [...(s?.workouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [s?.workouts]);

  const lifts = s?.lifts || [];

  const getExerciseSummary = (date) => {
    const dayLifts = lifts.filter(l => l.date === date);
    const byEx = {};
    dayLifts.forEach(l => {
      if (!byEx[l.exercise]) byEx[l.exercise] = { sets: 0, maxKg: 0 };
      byEx[l.exercise].sets++;
      if (l.kg > byEx[l.exercise].maxKg) byEx[l.exercise].maxKg = l.kg;
    });
    return Object.entries(byEx).map(([ex, data]) => ({ ex, sets: data.sets, maxKg: data.maxKg }));
  };

  return (
    <div className="hist-overlay">
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Training</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700 }}>Workout History</div>
        </div>
        <button className="ol-btn ol-btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div style={{ padding: '0 20px 20px', flex: 1 }}>
        {workouts.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', padding: '24px 0', fontStyle: 'italic' }}>
            No workouts logged yet.
          </div>
        )}
        {workouts.map((w, i) => {
          const isOpen = expanded === i;
          const exercises = getExerciseSummary(w.date);
          return (
            <div key={i} className="hist-row" onClick={() => setExpanded(isOpen ? null : i)}>
              <div className="hist-row-hdr">
                <span className="hist-date">{w.date}</span>
                <span className="hist-name">{w.name || 'Session'}</span>
                {w.duration && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{w.duration}min</span>}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 'auto' }}>{isOpen ? '▲' : '▸'}</span>
              </div>
              {isOpen && exercises.length > 0 && (
                <div className="hist-detail">
                  {exercises.map(({ ex, sets, maxKg }) => (
                    <div key={ex} className="hist-ex">
                      {ex}: {sets} set{sets !== 1 ? 's' : ''}{maxKg > 0 ? ` · ${maxKg}kg peak` : ''}
                    </div>
                  ))}
                </div>
              )}
              {isOpen && exercises.length === 0 && (
                <div className="hist-detail">
                  <div className="hist-ex" style={{ fontStyle: 'italic' }}>No lift data for this session.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── S3: TRAINING ──────────────────────────────────────────────────────────────
// Mirrors functions/strengthStandards.js's TIER_BANDS — every name
// computeMuscleLevels can return needs a color here. The 3 numbered
// sub-levels within a tier (Beginner 1/2/3, etc.) share their parent tier's
// color rather than getting a distinct hue each — the number already gives
// the precise sub-rank, the color just needs to place it in the right
// broad band at a glance.
//
// Ordered as an ascending "rarity" ramp (grey → green → blue → purple →
// orange → gold) rather than an arbitrary hue assignment, so the color
// itself hints at rank without reading the label: grey reads as "nothing
// yet", and Elite lands on literal gold — the one color association
// (gold medal, "going for gold") that needs no legend at all. Every tier
// still carries its name as text alongside the color (never color-alone),
// so this is a readability upgrade, not a new colorblind-accessibility
// dependency.
const TIER_BASE_COLOR = {
  Untrained: 'var(--dim)',
  Beginner: 'var(--forest)',
  Novice: 'var(--navy)',
  Intermediate: 'var(--plum)',
  Advanced: 'var(--ember)',
  Elite: 'var(--gold)',
};
// Keyed by both the broad tier name (diagram/legend) and each numbered
// sub-level (per-muscle panel, e.g. "Beginner 1") — both forms need to
// resolve to a color and previously only the numbered form did, leaving
// the legend's dots for every tier but Untrained with no color at all.
const TIER_COLOR = { Untrained: TIER_BASE_COLOR.Untrained };
for (const tier of ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']) {
  TIER_COLOR[tier] = TIER_BASE_COLOR[tier];
  for (const n of [1, 2, 3]) TIER_COLOR[`${tier} ${n}`] = TIER_BASE_COLOR[tier];
}
// The diagram/legend show the broad 6-tier version (no sub-level numbers) —
// same bands TIER_COLOR above already keys its sub-levels into, so a
// muscle's diagram color always matches whichever tier its precise
// (text-only) sub-level belongs to. Filter ids are named after the raw
// hue (fm-neutral is the forest-green filter, fm-gold is gold, etc.,
// defined once in each body-*.svg) rather than after a tier, since
// fm-neutral is shared with the Fatigue tab's own (unrelated) coloring —
// see TIER_BASE_COLOR above for which hue backs which tier.
const DIAGRAM_TIER_BANDS = [
  [0, 'Untrained', 'url(#fm-dim)'], [20, 'Beginner', 'url(#fm-neutral)'],
  [40, 'Novice', 'url(#fm-navy)'], [60, 'Intermediate', 'url(#fm-plum)'],
  [80, 'Advanced', 'url(#fm-ember)'], [100, 'Elite', 'url(#fm-gold)'],
];
function diagramFilterForScore(score) {
  let filter = DIAGRAM_TIER_BANDS[0][2];
  for (const [floor, , f] of DIAGRAM_TIER_BANDS) { if (score < floor) break; filter = f; }
  return filter;
}

// Per-muscle strength panel: shows every muscle in muscleLevels (backend's
// computeMuscleLevels) with a real strengthlevel.com-sourced tier, split
// into 3 numbered sub-levels each by TIER_BANDS (see strengthStandards.js).
// Muscles with no ranking yet (no published standard for any exercise
// that trains them, or a canonical exercise not yet logged under a
// recognized name) are simply omitted — no unranked/personal-best fallback
// section, by request.
//
// Display-only relabeling — the underlying taxonomy key stays 'abductors'
// everywhere else (fatigue tracking, weekly planning, etc. all key off it),
// this only changes what this one panel shows, since 'abductors' as a
// muscle is really gluteus medius/TFL work (see Abductor Machine's own
// exerciseDb.js note) and that's a clearer label for a ranked score.
const MUSCLE_DISPLAY_LABELS = { abductors: 'Gluteus Medius' };
const muscleDisplayLabel = m => MUSCLE_DISPLAY_LABELS[m] || m.replace(/-/g, ' ');

function StrengthLevelPanel({ muscleLevels, hasSex }) {
  const cutoff14 = toLocalDateStr(new Date(Date.now() - 14 * 864e5));

  if (!hasSex) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Set your sex in Settings → Profile to unlock strength-level rankings.</div>
    </div>
  );

  const rankedMuscles = Object.entries(muscleLevels || {}).filter(([, v]) => v)
    .sort(([, a], [, b]) => b.score - a.score);

  if (!rankedMuscles.length) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Log some lifts to see per-muscle strength levels — ranked against published bodyweight standards where one exists, Beginner→Elite.</div>
    </div>
  );

  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>Strength Level · By Muscle</div>
      {rankedMuscles.map(([muscle, v]) => {
        const isNew = v.date >= cutoff14;
        return (
          <div key={muscle} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginBottom: 3 }}>
              <span style={{ color: 'var(--ink)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 6 }}>
                {muscleDisplayLabel(muscle)}
                {isNew && <span style={{ fontSize: 7, letterSpacing: '.1em', background: 'var(--gold)', color: 'var(--paper)', padding: '1px 4px' }}>NEW</span>}
              </span>
              <span style={{ color: TIER_COLOR[v.tier] }}>{v.tier} · {v.score}{v.score <= 100 ? '/100' : ''}</span>
            </div>
            {/* Fills toward the next numbered sub-level (bandFloor->bandCeiling),
                not toward a flat 100 — bandCeiling is null only at the very top
                (Elite 3, no further checkpoint), where it just shows full. */}
            <div className="macro-track"><div className="macro-fill" style={{
              width: `${v.bandCeiling == null ? 100 : Math.max(0, Math.min(100, (v.score - v.bandFloor) / (v.bandCeiling - v.bandFloor) * 100))}%`,
              background: TIER_COLOR[v.tier],
            }} /></div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.exercise} · {v.e1RM}kg e1RM · {localDateFromYMD(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {v.bodyweightKg}kg bodyweight
              {v.blendedFrom?.length ? ` · blended with ${v.blendedFrom.length} other exercise${v.blendedFrom.length === 1 ? '' : 's'}` : ''}
            </div>
            {/* Only shown with a real, sustained upward trend behind it (see
                etaToNextLevel in strengthStandards.js) — blank rather than a
                guess when there isn't enough logged history to trust one. */}
            {v.etaWeeksLow != null && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1, fontStyle: 'italic' }}>
                Est. {v.etaWeeksLow}–{v.etaWeeksHigh} weeks to {v.nextTier} at current pace
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function S3({ s, onStartWorkout, onImport, onHistory, refresh }) {
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
  // Calendar-day difference against local midnight today, not a raw
  // Date.now() ms subtraction against UTC-midnight-parsed lastSession.date —
  // the latter can be off by a day in negative-UTC timezones.
  const daysAgo = lastSession?.date
    ? Math.round((new Date(new Date().setHours(0, 0, 0, 0)) - localDateFromYMD(lastSession.date)) / 86_400_000)
    : null;

  const guidance = s?.weeklyPlan; // advisory only: session-count target + muscle freshness ranking, never a locked day-by-day schedule
  const [selectedBucket, setSelectedBucket] = useState(null); // null = let the algorithm pick the freshest muscle group live

  const experiments = s?.experiments || [];
  const activeExps = experiments.filter(e => e.active);
  const [showExpForm, setShowExpForm] = useState(false);
  const [expHyp, setExpHyp] = useState('');
  const [expMetric, setExpMetric] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [expSaving, setExpSaving] = useState(false);
  const [concludeId, setConcludeId] = useState(null);
  const [concludeOutcome, setConcludeOutcome] = useState('');

  const saveExperiment = async () => {
    if (!expHyp.trim()) return;
    setExpSaving(true);
    const hypothesis = expHyp.trim(), metric = expMetric.trim(), endDate = expEnd || null;
    const data = await api('experiments', { method: 'POST', body: JSON.stringify({ hypothesis, metric, endDate }) });
    setExpHyp(''); setExpMetric(''); setExpEnd(''); setShowExpForm(false);
    setExpSaving(false);
    refresh({ ...s, experiments: [...(s?.experiments || []), {
      id: data.id, hypothesis, startDate: todayLocalStr(), endDate, metric, notes: '', active: true, outcome: null, concludedAt: null,
    }] });
  };

  const concludeExperiment = async (id) => {
    await api(`experiments/${id}/conclude`, { method: 'POST', body: JSON.stringify({ outcome: concludeOutcome }) });
    setConcludeId(null); setConcludeOutcome('');
    refresh({ ...s, experiments: (s?.experiments || []).map(e => e.id === id ? { ...e, active: false, outcome: concludeOutcome || 'concluded', concludedAt: Date.now() } : e) });
  };

  const deleteExperiment = async (id) => {
    await api(`experiments/${id}`, { method: 'DELETE' });
    refresh({ ...s, experiments: (s?.experiments || []).filter(e => e.id !== id) });
  };

  // Live-pick a session so it's ready before the user taps Start — no locked
  // schedule to read back, this always reflects fatigue right now. Auto-picks
  // the freshest muscle group unless the athlete has overridden that choice
  // via the muscle-focus chips below.
  const [preloadedExercises, setPreloadedExercises] = useState(null);
  const [pickedBucket, setPickedBucket] = useState(null);
  const [preloading, setPreloading] = useState(false);
  useEffect(() => {
    setPreloading(true);
    setPreloadedExercises(null);
    const body = selectedBucket
      ? { type: 'lift', targetMuscles: selectedBucket.muscles, bucket: selectedBucket.name }
      : { type: 'lift' };
    authFetch(`${API_BASE}/plan/session-exercises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(data => {
      setPreloadedExercises(data.exercises || []);
      setPickedBucket(data.bucket ? { name: data.bucket, muscles: data.targetMuscles, backboneExercises: data.backboneExercises } : null);
      setPreloading(false);
    }).catch(() => setPreloading(false));
  }, [selectedBucket?.name]);

  const generatePlan = async () => {
    setGenning(true);
    await authFetch(`${API_BASE}/plan/week`, { method: 'POST' });
    setGenning(false);
    window.location.reload();
  };

  return (
    <section id="s3">
      {s?.travelMode && (
        <div className="travel-banner">
          <span>Travel Mode — bodyweight only</span>
          <button onClick={async () => { const data = await api('travel-mode', { method: 'POST', body: JSON.stringify({ enabled: false }) }); refresh({ ...s, travelMode: data.travelMode }); }}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.4)', color: 'var(--paper)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer' }}>
            Disable
          </button>
        </div>
      )}
      <div className="fade">
        <div className="kicker">Performance · Strength · {daysAgo != null ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} Days Ago`) : '—'}</div>
        <div className="headline">
          {topLift ? `${sessionName} Day —` : 'Quiet Gym —'}<br />
          {topLift ? `${topLift.kg > 0 ? `${topLift.kg} kg` : 'BW'} ${topLift.exercise[0].toUpperCase() + topLift.exercise.slice(1)}` : 'Nothing on the Card'}
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
      {liftVol.filter(Boolean).length >= 2 && (
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
        {guidance ? (
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="kicker" style={{ marginBottom: 4 }}>
              This Week's Guidance · {guidance.sessionsCompletedThisWeek ?? 0}/{guidance.liftSessionsTarget} strength{guidance.cardioSessionsTarget > 0 ? ` · ${guidance.cardioSessionsTarget} cardio` : ''}
              {guidance.trainingPriority && guidance.trainingPriority !== 'strength' && <span style={{ color: 'var(--gold)', textTransform: 'capitalize' }}> · {guidance.trainingPriority} priority</span>}
            </div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 13, color: 'var(--dim)', marginBottom: 8, lineHeight: 1.4 }}>
              {guidance.rationale}
            </div>
            {guidance.muscleFocus?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {guidance.muscleFocus.map(b => {
                  const active = selectedBucket ? selectedBucket.name === b.name : pickedBucket?.name === b.name;
                  return (
                    <button key={b.name} className={`prof-btn${active ? ' solid' : ''}`} style={{ fontSize: 9, padding: '5px 10px', textTransform: 'capitalize' }}
                      onClick={() => setSelectedBucket(selectedBucket?.name === b.name ? null : { name: b.name, muscles: b.muscles })}>
                      {b.name} · {b.freshness}%
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8 }}>
            No weekly guidance yet — purely a session-count suggestion, not required. You can start a session below regardless.
          </div>
        )}

        <div style={{ paddingTop: guidance ? 8 : 0 }}>
          {pickedBucket?.name && preloadedExercises?.length > 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--gold)', textTransform: 'capitalize', marginBottom: 6 }}>
              {selectedBucket ? 'Selected' : 'Freshest right now'}: {pickedBucket.name}
            </div>
          )}
          {preloadedExercises?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {preloadedExercises.map((ex, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ink)', textTransform: 'capitalize', flex: 1 }}>{ex.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{ex.sets?.length ?? 3} sets · {ex.sets?.[0]?.reps ?? 8} reps</span>
                  {ex.sets?.[0]?.kg ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--gold)' }}>{ex.sets[0].kg}kg</span> : null}
                </div>
              ))}
            </div>
          )}
          {preloading && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8 }}>Preparing exercises…</div>
          )}
          {!preloading && preloadedExercises?.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 8 }}>No fresh muscle group available right now — Freestyle, or rest and try again later.</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="action-btn primary" disabled={!preloadedExercises?.length}
              onClick={() => onStartWorkout({ sessions: [{ type: 'lift', targetMuscles: pickedBucket?.muscles, backboneExercises: pickedBucket?.backboneExercises }], preloadedExercises })}>
              Start Session
            </button>
            <button className="action-btn" onClick={() => onStartWorkout(null)}>Freestyle</button>
            {selectedBucket && <button className="action-btn" onClick={() => setSelectedBucket(null)}>Auto-Pick Freshest</button>}
            <button onClick={generatePlan} disabled={genning}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
              {genning ? '…' : guidance ? 'Refresh Guidance' : 'Get Weekly Guidance'}
            </button>
          </div>
        </div>

        {/* Week history strip — which days actually had a session, not a forward schedule */}
        {(() => {
          const now = new Date();
          const mondayOffset = (now.getDay() + 6) % 7;
          const monday = new Date(now); monday.setDate(now.getDate() - mondayOffset);
          const todayStr = toLocalDateStr(now);
          const DOW = ['M','T','W','T','F','S','S'];
          const workoutDates = new Set(workouts.map(w => w.date));
          return (
            <div className="week-strip">
              {DOW.map((label, i) => {
                const d = new Date(monday); d.setDate(monday.getDate() + i);
                const dateStr = toLocalDateStr(d);
                const isToday = dateStr === todayStr;
                const hasSession = workoutDates.has(dateStr);
                return (
                  <div key={i} className={`week-day${isToday ? ' today' : ''}${hasSession ? ' has-session' : ''}`} title={hasSession ? 'Trained' : ''}>
                    <div className="week-day-label">{label}</div>
                    {hasSession && <div className="week-day-dot" />}
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onImport} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>Import Hevy</button>
          <button onClick={onHistory} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>History</button>
          {s?.stravaConnected
            ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.08em', color: 'var(--forest)' }}>Strava</span>
            : <button onClick={() => { window.location.href = `${API_BASE}/strava/auth`; }} style={{ background: 'none', border: '1px solid var(--rule)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: '4px 10px' }}>Connect Strava</button>
          }
        </div>
      </div>

      {/* Experiments */}
      <div className="fade" style={{ borderTop: '2px solid var(--ink)', paddingTop: 12, marginTop: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: s?.dataMaturity?.hasEnoughData && activeExps.length === 0 ? 6 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="kicker" style={{ margin: 0 }}>Experiments {activeExps.length > 0 ? `· ${activeExps.length} active` : ''}</div>
            {s?.dataMaturity?.hasEnoughData && activeExps.length === 0 && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--forest)', letterSpacing: '.05em' }}>PATTERN FOUND</span>
            )}
          </div>
          <button onClick={() => setShowExpForm(v => !v)}
            style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
            {showExpForm ? 'Cancel' : '+ New'}
          </button>
        </div>

        {s?.dataMaturity?.hasEnoughData && activeExps.length === 0 && !showExpForm && (
          <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 12, color: 'var(--forest)', fontStyle: 'italic', padding: '4px 0 8px', lineHeight: 1.5 }}>
            {s.dataMaturity.exercisesWithPatterns} exercises show clear progression patterns across {s.dataMaturity.weeksCovered} weeks. Press is prescribing from your data — no experiments needed.
          </div>
        )}

        {showExpForm && (
          <div className="experiment-form" style={{ marginBottom: 14 }}>
            <input className="experiment-input" placeholder="Hypothesis (e.g. Creatine adds 5% to squat in 6 weeks)…"
              value={expHyp} onChange={e => setExpHyp(e.target.value)} />
            <input className="experiment-input" placeholder="Metric to track (e.g. squat e1RM)…"
              value={expMetric} onChange={e => setExpMetric(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>End date:</span>
              <input type="date" value={expEnd} onChange={e => setExpEnd(e.target.value)}
                style={{ border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', outline: 'none', padding: '4px 0' }} />
            </div>
            <button className="prof-btn solid" onClick={saveExperiment} disabled={!expHyp.trim() || expSaving} style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {expSaving ? 'Saving…' : 'Start Experiment'}
            </button>
          </div>
        )}

        {!s?.dataMaturity?.hasEnoughData && experiments.length === 0 && !showExpForm && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0 8px' }}>
            Track n=1 experiments. Test a protocol 4–8 weeks and record the outcome.
          </div>
        )}

        {experiments.map(exp => (
          <div key={exp.id} className="experiment-card" style={{ borderColor: exp.active ? 'var(--gold)' : 'var(--rule)', opacity: exp.active ? 1 : 0.7 }}>
            <div className="experiment-h">{exp.hypothesis}</div>
            <div className="experiment-meta">
              {exp.startDate}{exp.endDate ? ` → ${exp.endDate}` : ''}{exp.metric ? ` · ${exp.metric}` : ''}
              {!exp.active && exp.concludedAt ? ` · concluded ${new Date(exp.concludedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            {exp.outcome && <div className="experiment-outcome">{exp.outcome}</div>}
            {exp.active && (
              concludeId === exp.id ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 13, outline: 'none', padding: '3px 0', color: 'var(--ink)' }}
                    placeholder="Outcome…" value={concludeOutcome} onChange={e => setConcludeOutcome(e.target.value)} />
                  <button className="prof-btn solid" onClick={() => concludeExperiment(exp.id)} style={{ fontSize: 8, padding: '4px 10px' }}>Done</button>
                  <button className="prof-btn" onClick={() => setConcludeId(null)} style={{ fontSize: 8, padding: '4px 10px' }}>×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="prof-btn" onClick={() => setConcludeId(exp.id)} style={{ fontSize: 8, padding: '3px 8px' }}>Conclude</button>
                  <button onClick={() => deleteExperiment(exp.id)} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>× Delete</button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── S4: FUEL ─────────────────────────────────────────────────────────────────
function S4({ s, refresh }) {
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const mealLog = s?.nutritionLog || [];
  const water = s?.waterToday ?? 0;
  const waterTarget = s?.profile?.waterTarget || 7;
  const today = todayLocalStr();
  const todayLog = mealLog.filter(m => m.date === today);

  const cal = n.calories || 0;
  const calTarget = mt.calories || 2400;
  const short = calTarget - cal;
  const exactCal = !!s?.profile?.exactCalories;

  // Form state
  const [label, setLabel] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [calories, setCalories] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [description, setDescription] = useState('');
  const [logging, setLogging] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [scanMode, setScanMode] = useState('meal');
  const [portion, setPortion] = useState(1);
  const [analysed, setAnalysed] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  // Tab + barcode state
  const [foodTab, setFoodTab] = useState('log');
  const [barcode, setBarcode] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeErr, setBarcodeErr] = useState('');
  const [grams, setGrams] = useState('100');
  const [recentFoods, setRecentFoods] = useState([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [camOpen, setCamOpen] = useState(false);
  const [camErr, setCamErr] = useState('');
  const photoRef = useRef();
  const videoRef = useRef();
  const camStreamRef = useRef(null);
  const camDetectorRef = useRef(null);
  const camRafRef = useRef(null);
  const baseNutrition = useRef({ calories: 0, protein: 0, carbs: 0, fat: 0 });

  const applyPortion = (mult, base) => {
    setCalories(base.calories ? String(Math.round(base.calories * mult)) : '');
    setProtein(base.protein ? String(Math.round(base.protein * mult)) : '');
    setCarbs(base.carbs ? String(Math.round(base.carbs * mult)) : '');
    setFat(base.fat ? String(Math.round(base.fat * mult)) : '');
  };

  const applyGrams = (g, base100) => {
    const m = (parseFloat(g) || 100) / 100;
    setCalories(base100.calories ? String(Math.round(base100.calories * m)) : '');
    setProtein(base100.protein ? String(Math.round(base100.protein * m * 10) / 10) : '');
    setCarbs(base100.carbs ? String(Math.round(base100.carbs * m * 10) / 10) : '');
    setFat(base100.fat ? String(Math.round(base100.fat * m * 10) / 10) : '');
  };

  const fillForm = (food) => {
    setLabel(food.name || '');
    setCalories(String(food.calories || ''));
    setProtein(String(food.protein || ''));
    setCarbs(String(food.carbs || ''));
    setFat(String(food.fat || ''));
    setDescription(food.description || '');
    baseNutrition.current = { calories: food.calories || 0, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0 };
    setAnalysed(true);
    setPortion(1);
  };

  const stopCamera = () => {
    if (camRafRef.current) cancelAnimationFrame(camRafRef.current);
    if (camStreamRef.current) camStreamRef.current.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    setCamOpen(false);
  };

  // Without this, navigating away mid-scan (without tapping Close) leaves
  // the camera stream running indefinitely in the background — camera light
  // stays on and battery drains until the tab itself is closed. Also revokes
  // whatever photo-preview blob URL is current if the component unmounts
  // with one still set (the replace-time revoke in handlePhoto only covers
  // the case where a new photo overwrites an old preview, not unmount).
  const photoPreviewRef = useRef(null);
  useEffect(() => { photoPreviewRef.current = photoPreview; }, [photoPreview]);
  useEffect(() => {
    return () => {
      if (camRafRef.current) cancelAnimationFrame(camRafRef.current);
      if (camStreamRef.current) camStreamRef.current.getTracks().forEach(t => t.stop());
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    };
  }, []);

  const onBarcodeDetected = async (code) => {
    stopCamera();
    setBarcode(code);
    setBarcodeLoading(true); setBarcodeErr('');
    try {
      const d = await api('food/barcode', { method: 'POST', body: JSON.stringify({ barcode: code }) });
      if (d.name) { fillForm(d); setGrams('100'); }
      else setBarcodeErr('Product not found — try entering barcode manually');
    } catch { setBarcodeErr('Lookup failed'); }
    setBarcodeLoading(false);
  };

  const openCameraScanner = async () => {
    setCamErr(''); setCamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
      camStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Use BarcodeDetector API if available (Chrome/Edge on Android)
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'] });
        camDetectorRef.current = detector;
        const scan = async () => {
          if (!videoRef.current || !camStreamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) { onBarcodeDetected(barcodes[0].rawValue); return; }
          } catch {}
          camRafRef.current = requestAnimationFrame(scan);
        };
        videoRef.current?.addEventListener('loadedmetadata', () => { camRafRef.current = requestAnimationFrame(scan); }, { once: true });
      }
      // iOS Safari fallback: no BarcodeDetector — show camera, user taps capture button
    } catch (e) {
      setCamOpen(false);
      setCamErr('Camera access denied — enter barcode manually');
    }
  };

  const handleBarcode = async () => {
    const b = barcode.trim();
    if (!b) return;
    setBarcodeLoading(true); setBarcodeErr('');
    try {
      const d = await api('food/barcode', { method: 'POST', body: JSON.stringify({ barcode: b }) });
      if (d.product) {
        fillForm(d.product);
        setGrams('100');
        setFoodTab('log');
      } else { setBarcodeErr('Product not found'); }
    } catch { setBarcodeErr('Lookup failed'); }
    setBarcodeLoading(false);
  };

  const handlePhoto = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalysing(true); setDescription(''); setAnalysed(false); setPhotoErr('');
    const previewUrl = URL.createObjectURL(file);
    // Revoke the previous preview's blob URL before replacing it — otherwise
    // every photo scanned in a session leaks a blob reference for the tab's
    // lifetime (createObjectURL objects are only released on revoke or
    // document unload, not garbage collection of the string).
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = await api('nutrition/analyze', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: ev.target.result, mode: scanMode }),
        });
        if (data.error) throw new Error(data.error);
        const base = { calories: data.calories || 0, protein: data.protein || 0, carbs: data.carbs || 0, fat: data.fat || 0 };
        baseNutrition.current = base;
        if (data.description) setDescription(data.description);
        setPortion(1);
        applyPortion(1, base);
        if (!label && data.description) setLabel(data.description.slice(0, 40));
        setAnalysed(true);
      } catch (e) { setPhotoErr(e.message || 'Photo analysis failed — try again.'); }
      setAnalysing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Posts a meal and returns {entry, nutritionToday} without touching app state — callers
  // decide when to refresh, so a loop of several posts can accumulate and refresh once
  // instead of each call clobbering the previous one with a stale s.nutritionLog closure.
  const postMeal = async (body) => {
    const nutritionToday = await api('nutrition', { method: 'POST', body: JSON.stringify(body) });
    const entry = { date: todayLocalStr(), time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), ...body };
    return { entry, nutritionToday };
  };

  const logMeal = async () => {
    if (!calories && !protein) return;
    setLogging(true);
    const { entry, nutritionToday } = await postMeal({ label, protein: +protein || 0, carbs: +carbs || 0, fat: +fat || 0, calories: +calories || 0, ...(description.trim() ? { description: description.trim() } : {}) });
    setLabel(''); setProtein(''); setCarbs(''); setFat(''); setCalories(''); setDescription(''); setAnalysed(false);
    setLogging(false);
    refresh({ ...s, nutritionToday, nutritionLog: [...(s?.nutritionLog || []), entry] });
  };

  const logFood = async (food) => {
    const { entry, nutritionToday } = await postMeal({ label: food.name || food.label, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0, calories: food.calories || 0, ...(food.description ? { description: food.description } : {}) });
    refresh({ ...s, nutritionToday, nutritionLog: [...(s?.nutritionLog || []), entry] });
  };

  const logWater = async (delta) => {
    const data = await api('water', { method: 'POST', body: JSON.stringify({ delta }) });
    refresh({ ...s, waterToday: data.today });
  };

  const loadRecent = async () => {
    if (recentLoaded) return;
    const d = await api('food/recent');
    setRecentFoods(d.recent || []);
    setRecentLoaded(true);
  };

  const loadTemplates = async () => {
    if (templatesLoaded) return;
    const d = await api('food/templates');
    setTemplates(d.templates || []);
    setTemplatesLoaded(true);
  };

  const deleteTemplate = async (name) => {
    await api(`food/template/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setTemplates(t => t.filter(x => x.name !== name));
  };

  const saveAsTemplate = async () => {
    const nm = templateName.trim();
    if (!nm || (!calories && !protein)) return;
    setSavingTemplate(true);
    const item = { name: label || nm, protein: +protein||0, carbs: +carbs||0, fat: +fat||0, calories: +calories||0 };
    await api('food/template', { method: 'POST', body: JSON.stringify({ name: nm, items: [item] }) });
    setTemplateName('');
    setTemplates([]);
    setTemplatesLoaded(false);
    setSavingTemplate(false);
  };

  const switchTab = t => {
    setFoodTab(t);
    if (t === 'recent') loadRecent();
    if (t === 'templates') loadTemplates();
  };

  const tabStyle = (t) => ({
    fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '5px 12px', border: 'none', cursor: 'pointer',
    background: foodTab === t ? 'var(--ink)' : 'none',
    color: foodTab === t ? 'var(--paper)' : 'var(--dim)',
  });

  return (
    <section id="s4" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Nutrition · Today</div>
        <div className="headline">
          {cal > 0 ? `${roundCal(cal, exactCal).toLocaleString()} kcal —` : 'Empty Plate —'}<br />
          {cal > 0 ? (short > 0 ? `${roundCal(short, exactCal).toLocaleString()} Short` : 'On Target') : 'Nothing on the Docket'}
        </div>
        {!exactCal && cal > 0 && (
          <div className="deck" style={{ marginTop: 2 }}>Approximate, to the nearest 300 kcal. Turn on exact calories in Settings → Nutrition.</div>
        )}
      </div>

      <div className="fade" style={{ flexShrink: 0 }}>
        {[
          { label: 'Calories', val: roundCal(cal, exactCal), tgt: roundCal(calTarget, exactCal), unit: 'kcal', color: 'var(--ink)' },
          { label: 'Protein',  val: n.protein||0,  tgt: mt.protein || 160, unit: 'g',    color: 'var(--navy)'   },
          { label: 'Carbs',    val: n.carbs||0,    tgt: mt.carbs || 250,   unit: 'g',    color: 'var(--forest)' },
          { label: 'Fat',      val: n.fat||0,      tgt: mt.fat || 75,      unit: 'g',    color: 'var(--ember)'  },
        ].map(({ label: lbl, val, tgt, unit, color }) => {
          const p = tgt ? pct(val, tgt) : 0;
          return (
            <div key={lbl} className="macro">
              <div className="macro-lbl"><span>{lbl.toUpperCase()}</span><span>{val} / {tgt} {unit} &nbsp;{p}%</span></div>
              <div className="macro-track"><div className="macro-fill" style={{ width: `${p}%`, background: color }} /></div>
            </div>
          );
        })}
        <div className="macro">
          <div className="macro-lbl"><span>WATER</span><span>{water} / {waterTarget} gl &nbsp;{waterTarget ? pct(water, waterTarget) : 0}%</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="macro-track" style={{ flex: 1 }}><div className="macro-fill" style={{ width: `${waterTarget ? pct(water, waterTarget) : 0}%`, background: 'var(--navy)' }} /></div>
            <button onClick={() => logWater(-1)} disabled={water <= 0} style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--rule)', background: 'none', cursor: water > 0 ? 'pointer' : 'default', fontSize: 13, lineHeight: 1, color: 'var(--ink)' }}>−</button>
            <button onClick={() => logWater(1)} style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--rule)', background: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: 'var(--ink)' }}>+</button>
          </div>
        </div>
      </div>

      {s?.hydrationCurve?.length > 1 && (
        <div className="fade" style={{ flexShrink: 0, marginTop: 2 }}>
          <div className="chart-wrap" style={{ flex: '0 0 44px', position: 'relative' }}>
            <AreaChart data={s.hydrationCurve} color="var(--navy)" id="hydration" />
          </div>
          <div className="sc-delta" style={{ color: 'var(--dim)', marginTop: 2 }}>
            Hydration now: {s.hydrationNow ?? '—'}%
            {s?.waterStats ? ` · ${s.waterStats.streak}d streak · ${s.waterStats.hitRate}% hit rate` : ''}
          </div>
        </div>
      )}

      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="rule-thin" />

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: 12 }}>
          {[['log','Log'],['recent','Recent'],['templates','Templates']].map(([t,l]) => (
            <button key={t} style={tabStyle(t)} onClick={() => switchTab(t)}>{l}</button>
          ))}
        </div>

        {/* LOG TAB */}
        {foodTab === 'log' && (
          <>
            {/* Barcode lookup */}
            {camOpen && (
              <div className="cam-overlay">
                <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
                <div className="cam-frame" />
                <div className="cam-lbl">
                  {'BarcodeDetector' in window ? 'Point at barcode — auto-detecting' : 'Point at barcode then tap Capture'}
                </div>
                {'BarcodeDetector' in window ? null : (
                  <button
                    style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#fff', border: 'none', padding: '12px 32px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                    onClick={async () => {
                      const canvas = document.createElement('canvas');
                      canvas.width = videoRef.current.videoWidth;
                      canvas.height = videoRef.current.videoHeight;
                      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
                      // iOS fallback: use file input to let user take photo instead
                      stopCamera();
                      photoRef.current?.click();
                    }}>
                    Capture
                  </button>
                )}
                <button className="cam-close" onClick={stopCamera}>Close</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              <button className="nutri-photo-btn" style={{ flexShrink: 0, background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }} onClick={openCameraScanner}>
                Scan
              </button>
              <input
                style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
                placeholder="or enter barcode…"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBarcode()}
                inputMode="numeric"
              />
              <button className="nutri-photo-btn" style={{ minWidth: 52, flexShrink: 0 }} onClick={handleBarcode} disabled={barcodeLoading}>
                {barcodeLoading ? '…' : 'Go'}
              </button>
            </div>
            {camErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>{camErr}</div>}
            {barcodeErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{barcodeErr}</div>}

            {/* Photo analysis */}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <div className="scan-mode-toggle">
              <button className={`scan-mode-btn${scanMode === 'meal' ? ' active' : ''}`} onClick={() => setScanMode('meal')}>Meal Photo</button>
              <button className={`scan-mode-btn${scanMode === 'label' ? ' active' : ''}`} onClick={() => setScanMode('label')}>Nutrition Label</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {photoPreview && (
                <img src={photoPreview} className={`scan-preview${analysing ? ' analysing' : ''}`} alt="scan preview" />
              )}
              <div style={{ flex: 1 }}>
                <button className="nutri-photo-btn" onClick={() => photoRef.current?.click()} disabled={analysing}>
                  {analysing ? 'Analysing…' : photoPreview ? 'Scan Again' : 'Scan Photo'}
                </button>
                {/* AI-scanned description now lands in the editable field below
                    in the manual log form instead of a separate read-only
                    caption here — showing the same text twice was redundant,
                    and the editable version lets it actually be corrected. */}
                {photoErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 4, lineHeight: 1.4 }}>{photoErr}</div>}
              </div>
            </div>

            {/* Gram calculator (shown after barcode lookup) */}
            {analysed && baseNutrition.current.calories > 0 && !photoPreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>Grams:</span>
                <input
                  style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'right' }}
                  value={grams} inputMode="numeric"
                  onChange={e => { setGrams(e.target.value); applyGrams(e.target.value, baseNutrition.current); }}
                />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>g</span>
              </div>
            )}

            {analysed && photoPreview && (
              <div className="portion-row">
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em' }}>Portion:</span>
                {[0.5, 1, 1.5, 2].map(m => (
                  <button key={m} className="portion-btn"
                    style={{ background: portion === m ? 'var(--ink)' : 'none', color: portion === m ? 'var(--paper)' : 'var(--ink)' }}
                    onClick={() => { setPortion(m); applyPortion(m, baseNutrition.current); }}>
                    ×{m}
                  </button>
                ))}
              </div>
            )}

            {/* Manual log form */}
            <div className="nutri-log-form">
              <div className="nutri-log-row">
                <input className="nutri-input wide" placeholder="Meal name…" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="nutri-log-row">
                {/* Pre-filled from photo analysis when there is one, but always
                    editable and independent of it — a manually-typed note is
                    just as valid as an AI-scan description. */}
                <input className="nutri-input wide" placeholder="Description / notes (optional)…" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="nutri-log-row">
                {[['Protein', protein, setProtein], ['Carbs', carbs, setCarbs], ['Fat', fat, setFat], ['kcal', calories, setCalories]].map(([lbl, val, set]) => (
                  <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.1em', color: 'var(--dim)' }}>{lbl.toUpperCase()}</span>
                    <input className="nutri-input narrow" type="number" placeholder="0" value={val} onChange={e => set(e.target.value)} inputMode="numeric" />
                  </div>
                ))}
                <button className="nutri-submit-btn" onClick={logMeal} disabled={logging || (!calories && !protein)}>
                  {logging ? '…' : 'Log'}
                </button>
              </div>
              {analysed && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', marginTop: 4 }}>
                  {photoPreview ? 'AI estimate — verify against actual label' : 'Per 100g values — adjust grams above'}
                </div>
              )}
              {/* Save as template */}
              {(calories || protein) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input
                    style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '5px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
                    placeholder="Save as template…"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                  />
                  <button className="nutri-submit-btn" onClick={saveAsTemplate} disabled={!templateName.trim() || savingTemplate}>
                    {savingTemplate ? '…' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {/* Today's meal log */}
            {todayLog.length > 0 && (
              <>
                <div className="rule-thin" />
                <table className="data-table">
                  <thead><tr><th>Meal</th><th>Time</th><th>Pro</th><th>kcal</th></tr></thead>
                  <tbody>
                    {todayLog.map((m, i) => (
                      <tr key={i}>
                        <td>
                          {m.label || m.name || 'Meal'}
                          {m.description && (
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontWeight: 400, marginTop: 1 }}>{m.description}</div>
                          )}
                        </td>
                        <td>{m.time || '—'}</td>
                        <td className="up">{m.protein ? `${m.protein}g` : '—'}</td>
                        <td className="hi">{m.calories || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {/* RECENT TAB */}
        {foodTab === 'recent' && (
          <div>
            {!recentLoaded && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Loading…</div>}
            {recentLoaded && recentFoods.length === 0 && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>No recent foods yet.</div>
            )}
            {recentFoods.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{f.label || f.name || 'Food'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                    {f.protein ? `${f.protein}g P` : ''}{f.carbs ? ` · ${f.carbs}g C` : ''}{f.fat ? ` · ${f.fat}g F` : ''}{f.calories ? ` · ${f.calories}kcal` : ''}
                  </div>
                  {f.description && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2, fontStyle: 'italic' }}>{f.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { fillForm({ name: f.label || f.name, ...f }); switchTab('log'); }}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => logFood(f)}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: 'none', background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer' }}>
                    + Log
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TEMPLATES TAB */}
        {foodTab === 'templates' && (
          <div>
            {!templatesLoaded && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Loading…</div>}
            {templatesLoaded && templates.length === 0 && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>
                No templates yet — log a meal and save it as a template from the Log tab.
              </div>
            )}
            {templates.map((t, i) => {
              const totals = t.items.reduce((a, item) => ({
                calories: a.calories + (item.calories || 0),
                protein: a.protein + (item.protein || 0),
              }), { calories: 0, protein: 0 });
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{t.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                      {t.items.length} item{t.items.length !== 1 ? 's' : ''} · {totals.protein}g P · {totals.calories}kcal
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => deleteTemplate(t.name)}
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, padding: '4px 8px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)', cursor: 'pointer' }}>
                      ×
                    </button>
                    <button onClick={async () => {
                        let log = s?.nutritionLog || [], today = s?.nutritionToday;
                        for (const item of t.items) {
                          const r = await postMeal({ label: item.name || item.label, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0, calories: item.calories || 0 });
                          log = [...log, r.entry]; today = r.nutritionToday;
                        }
                        refresh({ ...s, nutritionToday: today, nutritionLog: log });
                      }}
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: 'none', background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer' }}>
                      + Log All
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── S5: FATIGUE ───────────────────────────────────────────────────────────────
const BODY_BASE = '';
// ALL_MUSCLES is imported (derived from EXERCISE_DB) — note the body-map SVGs
// (body-anterior.svg etc.) only have data-muscle regions drawn for the
// original 18 muscles, so newer ones (mid-delt, rotator-cuff, tibialis, ...)
// will show up in fatigue scores and the muscle-sensitivity/soreness pickers
// but won't highlight on the diagram until someone adds regions for them.

// Ranked muscles (MUSCLE_EXERCISE_MAP in muscleStandards.js) that have no
// data-muscle region in body-anterior/lateral/posterior.svg — same gap
// documented above for the fatigue diagram, just affecting a different
// (smaller, since fewer muscles are ranked than tracked) set: gluteus
// medius/abductors, brachialis, and brachioradialis have no dedicated
// artwork; mid-delt only has generic "shoulders" regions, not split by head.
const MUSCLES_WITHOUT_BODY_REGION = ['abductors', 'brachialis', 'brachioradialis', 'mid-delt'];

// Every muscle the SVGs actually have a data-muscle region for (verified
// directly against the 3 files) — any diagram-based muscle picker (Soreness,
// Adaptation) can only be clickable for these; the rest still need a
// fallback button list alongside it, same reasoning as
// MUSCLES_WITHOUT_BODY_REGION above. Named for Soreness, where it was first
// introduced, but not soreness-specific.
const SORENESS_DIAGRAM_MUSCLES = [
  'abs', 'adductors', 'biceps', 'calves', 'chest', 'erectors', 'forearms',
  'front-delt', 'glutes', 'hamstrings', 'lats', 'obliques', 'quads',
  'rear-delt', 'rhomboids', 'traps', 'triceps',
];

function S5({ s, refresh }) {
  const antRef = useRef(), latRef = useRef(), postRef = useRef();
  const [svgsReady, setSvgsReady] = useState(false);
  // Ranking tab gets its own separate triptych/refs rather than sharing the
  // fatigue tab's — the fatigue triptych's div only mounts while tab ===
  // 'fatigue', so switching away and back would leave an empty container
  // (the SVG-fetch effect only runs once, deps=[]). Duplicating the small
  // fetch-and-inject pattern avoids risking that same issue here, at the
  // cost of one extra (browser-cached) fetch of the same 3 static files.
  const rankAntRef = useRef(), rankLatRef = useRef(), rankPostRef = useRef();
  const [rankSvgsReady, setRankSvgsReady] = useState(false);
  // Soreness tab's own triptych/refs, same reasoning as the Ranking tab's —
  // its container only mounts once the user switches to 'soreness'.
  const soreAntRef = useRef(), soreLatRef = useRef(), sorePostRef = useRef();
  const [soreSvgsReady, setSoreSvgsReady] = useState(false);
  // Adaptation tab's own triptych/refs, same reasoning again.
  const adaptAntRef = useRef(), adaptLatRef = useRef(), adaptPostRef = useRef();
  const [adaptSvgsReady, setAdaptSvgsReady] = useState(false);
  const recoveryTabOrder = s?.profile?.recoveryTabOrder?.length ? s.profile.recoveryTabOrder : DEFAULT_RECOVERY_TAB_ORDER;
  const hiddenRecoveryTabSet = new Set(s?.profile?.hiddenRecoveryTabs || []);
  const visibleRecoveryTabs = recoveryTabOrder.filter(id => !hiddenRecoveryTabSet.has(id));
  const [tab, setTab] = useState(() => (visibleRecoveryTabs.includes('fatigue') ? 'fatigue' : visibleRecoveryTabs[0]) || 'fatigue');
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [sliderVal, setSliderVal] = useState(5);
  const [soreLogging, setSoreLogging] = useState(false);
  const [injuryArea, setInjuryArea] = useState('');
  const [injurySev, setInjurySev] = useState('mild');
  const [injuryNote, setInjuryNote] = useState('');
  const [injuryLogging, setInjuryLogging] = useState(false);
  const [adaptMuscle, setAdaptMuscle] = useState(null);
  const [atrophyRate, setAtrophyRate] = useState(DEFAULT_ATROPHY_RATE);
  const [atrophyCalibrated, setAtrophyCalibrated] = useState(false);

  const fatigue = useMemo(() => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity), [s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity]);
  const metabolic = useMemo(() => computeMetabolicFatigue(s?.lifts, s?.nutritionToday?.carbs || 0), [s?.lifts, s?.nutritionToday?.carbs]);
  const cns = useMemo(() => computeCNSFatigue(s?.lifts, s?.cnsSensitivity, s?.today?.recovery), [s?.lifts, s?.cnsSensitivity, s?.today?.recovery]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b)=>a+b,0)/fatigueVals.length) : null;
  const sortedFatigue = Object.entries(fatigue).filter(([,v]) => v > 0).sort(([,a],[,b]) => b-a);
  const fMax = sortedFatigue.length ? sortedFatigue[0][1] : 0;
  const topMuscles = sortedFatigue.slice(0,2).map(([m]) => m);

  const SORENESS_MUSCLES = ALL_MUSCLES;
  const recentSoreness = useMemo(() => (s?.soreness || []).filter(e => Date.now() - e.ts < 5 * 24 * 3600000), [s?.soreness]);
  const sorenessSet = new Set(recentSoreness.map(e => e.muscle));

  const adaptationSeries = useMemo(() => computeAdaptationSeries(s?.lifts), [s?.lifts]);
  const stimulusContributions = useMemo(() => computeStimulusContributions(s?.lifts), [s?.lifts]);
  // Default diagram view: colors every muscle by its current stimulus level
  // (not a slope/derivative — stimulus is already treated as the derivative
  // of ranking, so differentiating again isn't wanted), diverging red (near
  // zero -- effectively atrophying) to green (well above the single-session
  // peak -- actively adapting). "No data" is deliberately distinct from
  // "zero current stimulus": a muscle with an all-time ranked score
  // (s.muscleLevels) but nothing within the ~20-day contribution window has
  // genuinely decayed to near-zero and should read as red, not gray — gray
  // is reserved for a muscle that's never been trained at all.
  const adaptationFilterForMuscle = m => {
    const contribs = stimulusContributions[m];
    const everTrained = (contribs?.length > 0) || s?.muscleLevels?.[m];
    if (!everTrained) return 'url(#fm-dim)';
    const level = contribs ? computeAdaptationLevel(contribs, Date.now()) : 0;
    if (level < 0.15) return 'url(#fm-red)';
    if (level < 0.5) return 'url(#fm-ember)';
    if (level < 0.9) return 'url(#fm-gold)';
    return 'url(#fm-neutral)';
  };
  const adaptMuscles = Object.keys(adaptationSeries).sort();
  const activeAdaptMuscle = adaptMuscle || adaptMuscles[0] || null;
  const activeAdaptSeries = activeAdaptMuscle ? (adaptationSeries[activeAdaptMuscle] || []) : [];
  // Calibrated from the athlete's own real 14-90 day training gaps where
  // there's enough signal (estimateAtrophyRate); auto-applied once, then left
  // alone so a manual override via the slider below isn't silently
  // overwritten on every lift-history change.
  const estimatedAtrophyRate = useMemo(() => estimateAtrophyRate(s?.lifts), [s?.lifts]);
  useEffect(() => {
    if (estimatedAtrophyRate != null && !atrophyCalibrated) {
      setAtrophyRate(estimatedAtrophyRate);
      setAtrophyCalibrated(true);
    }
  }, [estimatedAtrophyRate]);

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

  useEffect(() => {
    // Unlike the fatigue triptych above, this container only mounts (and
    // attaches its refs) once the user switches to the 'ranking' tab, which
    // happens strictly after a mount-time (deps=[]) effect would already
    // have resolved and found the refs null. Gate on tab and re-run when it
    // changes; rankSvgsReady guards against re-fetching once it's loaded.
    if (tab !== 'ranking' || rankSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (rankAntRef.current)  rankAntRef.current.innerHTML  = ant;
      if (rankLatRef.current)  rankLatRef.current.innerHTML  = lat;
      if (rankPostRef.current) rankPostRef.current.innerHTML = post;
      setRankSvgsReady(true);
    }).catch(() => {});
  }, [tab, rankSvgsReady]);

  useEffect(() => {
    if (!rankSvgsReady) return;
    const containers = [rankAntRef.current, rankLatRef.current, rankPostRef.current].filter(Boolean);
    // Uses DIAGRAM_TIER_BANDS/diagramFilterForScore (declared alongside
    // TIER_COLOR above) so the diagram's buckets and the legend key's
    // colors can never drift apart the way they previously did — the old
    // inline brackets here were off by one tier against TIER_COLOR (e.g.
    // score 20-40, real "Beginner" range, rendered gold — Novice's color —
    // not ember) and merged Advanced and Elite into a single plum bucket.
    //
    // Iterates ALL_MUSCLES and explicitly clears anything without a score,
    // rather than only ever setting filters for muscles present in the
    // current s.muscleLevels — the previous version left whatever was last
    // painted on a muscle region in place once set, with no path to reset
    // it. Since this SVG DOM persists across re-renders (only injected once
    // via rankSvgsReady) and s.muscleLevels can legitimately change to have
    // fewer entries (a fresh account's mostly-empty data loading in, a
    // muscle dropping below the ranking eligibility threshold), that meant
    // the diagram could keep showing a previous snapshot's colors overlaid
    // on the current one instead of reflecting only the current data.
    ALL_MUSCLES.forEach(m => {
      const score = s?.muscleLevels?.[m]?.score;
      const f = score == null ? 'none' : diagramFilterForScore(score);
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => el.setAttribute('filter', f)));
    });
  }, [rankSvgsReady, s?.muscleLevels]);

  useEffect(() => {
    if (tab !== 'soreness' || soreSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (soreAntRef.current)  soreAntRef.current.innerHTML  = ant;
      if (soreLatRef.current)  soreLatRef.current.innerHTML  = lat;
      if (sorePostRef.current) sorePostRef.current.innerHTML = post;
      setSoreSvgsReady(true);
    }).catch(() => {});
  }, [tab, soreSvgsReady]);

  // Nearest-centroid matching rather than raw e.target hit-testing: these
  // muscle-region images are irregularly shaped and their *bounding boxes*
  // overlap heavily even where the drawn artwork doesn't (e.g. a wide
  // "forearms" cutout with a fully transparent gap over the torso where
  // abs/obliques actually are) — standard hit-testing/pointer-events
  // doesn't account for PNG alpha, so a click landing in that transparent
  // gap would hit whichever image paints on top there, not the muscle
  // actually drawn at that pixel. Verified directly: naive closest()
  // hit-testing mis-picked the wrong muscle on roughly a third of clicks
  // (e.g. clicking dead-center on biceps or obliques resolved to chest or
  // forearms instead). Comparing the click point against every region's
  // on-screen center sidesteps z-order entirely and got every muscle
  // right except two visually-thin ones (adductors, rear-delt) even at
  // their own bounding box's exact center — the worst case a real tap
  // (which lands on visible pixels, not a raw bbox center) should ever hit.
  useEffect(() => {
    if (!soreSvgsReady) return;
    const containers = [soreAntRef.current, soreLatRef.current, sorePostRef.current].filter(Boolean);
    const onClick = e => {
      const container = containers.find(c => c.contains(e.target));
      if (!container) return;
      let closest = null, closestDist = Infinity;
      container.querySelectorAll('[data-muscle]').forEach(el => {
        const m = el.getAttribute('data-muscle');
        if (!SORENESS_DIAGRAM_MUSCLES.includes(m)) return;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < closestDist) { closestDist = dist; closest = m; }
      });
      if (!closest) return;
      setSelectedMuscle(prev => prev === closest ? null : closest);
      setSliderVal(5);
    };
    containers.forEach(c => c.addEventListener('click', onClick));
    return () => containers.forEach(c => c.removeEventListener('click', onClick));
  }, [soreSvgsReady]);

  useEffect(() => {
    if (!soreSvgsReady) return;
    const containers = [soreAntRef.current, soreLatRef.current, sorePostRef.current].filter(Boolean);
    SORENESS_DIAGRAM_MUSCLES.forEach(m => {
      const f = selectedMuscle === m ? 'url(#fm-ember)' : sorenessSet.has(m) ? 'url(#fm-navy)' : 'none';
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.setAttribute('filter', f);
        el.style.cursor = 'pointer';
      }));
    });
  }, [soreSvgsReady, selectedMuscle, sorenessSet]);

  useEffect(() => {
    if (tab !== 'adaptation' || adaptSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (adaptAntRef.current)  adaptAntRef.current.innerHTML  = ant;
      if (adaptLatRef.current)  adaptLatRef.current.innerHTML  = lat;
      if (adaptPostRef.current) adaptPostRef.current.innerHTML = post;
      setAdaptSvgsReady(true);
    }).catch(() => {});
  }, [tab, adaptSvgsReady]);

  // Same nearest-centroid click matching as the Soreness picker above — see
  // that effect's comment for why raw hit-testing misattributes clicks on
  // these irregularly-shaped, alpha-transparent region images.
  useEffect(() => {
    if (!adaptSvgsReady) return;
    const containers = [adaptAntRef.current, adaptLatRef.current, adaptPostRef.current].filter(Boolean);
    const onClick = e => {
      const container = containers.find(c => c.contains(e.target));
      if (!container) return;
      let closest = null, closestDist = Infinity;
      container.querySelectorAll('[data-muscle]').forEach(el => {
        const m = el.getAttribute('data-muscle');
        if (!SORENESS_DIAGRAM_MUSCLES.includes(m)) return;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < closestDist) { closestDist = dist; closest = m; }
      });
      if (closest) setAdaptMuscle(closest);
    };
    containers.forEach(c => c.addEventListener('click', onClick));
    return () => containers.forEach(c => c.removeEventListener('click', onClick));
  }, [adaptSvgsReady]);

  useEffect(() => {
    if (!adaptSvgsReady) return;
    const containers = [adaptAntRef.current, adaptLatRef.current, adaptPostRef.current].filter(Boolean);
    SORENESS_DIAGRAM_MUSCLES.forEach(m => {
      const f = adaptationFilterForMuscle(m);
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.setAttribute('filter', f);
        el.style.cursor = 'pointer';
      }));
    });
  }, [adaptSvgsReady, stimulusContributions, s?.muscleLevels]);

  const hl1 = topMuscles[0] ? `${topMuscles[0][0].toUpperCase() + topMuscles[0].slice(1)} Loaded —` : 'Fresh —';
  const hl2 = topMuscles[1] ? `Train ${topMuscles[1][0].toUpperCase() + topMuscles[1].slice(1)} Today` : 'All Systems Go';

  const logSoreness = async () => {
    if (!selectedMuscle) return;
    setSoreLogging(true);
    const data = await api('soreness', { method: 'POST', body: JSON.stringify({ muscle: selectedMuscle, score: sliderVal }) });
    // Update locally instead of a full /summary refetch — that recomputes hydration
    // curves, composition verdicts, and signed photo URLs, none of which changed here.
    refresh({
      ...s,
      soreness: [...(s?.soreness || []), { ts: Date.now(), muscle: selectedMuscle, score: sliderVal }],
      muscleSensitivity: data.muscleSensitivity ?? s?.muscleSensitivity,
    });
    setSelectedMuscle(null);
    setSoreLogging(false);
  };

  return (
    <section id="s5" style={{ padding: '18px 20px 12px', display: 'flex', flexDirection: 'column' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Recovery · Muscle Fatigue · Post Session</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,40px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
      </div>

      <div className="fade tab-bar" style={{ flexShrink: 0 }}>
        {visibleRecoveryTabs.map(id => (
          <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {RECOVERY_TAB_LABELS[id]}{id === 'injuries' && s?.injuries?.length > 0 ? ` (${s.injuries.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'fatigue' && <>
        {/* Body triptych */}
        <div className="fade" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
          {[['Anterior', antRef], ['Lateral', latRef], ['Posterior', postRef]].map(([label, ref]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
              <div className="body-view" ref={ref} />
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="fade" style={{ flexShrink: 0, display: 'flex', gap: 0 }}>
          <div className="stat-cell" style={{ flex: '0 0 auto', minWidth: 120 }}>
            <div className="sc-label">Most Loaded Muscle</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <div className="sc-num red" style={{ fontSize: 22 }}>{fMax || '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div>
              {topMuscles[0] && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', textTransform: 'capitalize', letterSpacing: '.06em' }}>{topMuscles[0]}</div>}
            </div>
          </div>
          <div style={{ width: '1px', background: 'var(--rule)', margin: '0 16px', flexShrink: 0 }} />
          <div className="stat-cell" style={{ flex: '0 0 auto' }}>
            <div className="sc-label">Avg Muscle Fatigue</div>
            <div className="sc-num" style={{ fontSize: 22, color: overallFatigue > 60 ? 'var(--ember)' : overallFatigue > 30 ? 'var(--gold)' : 'var(--forest)' }}>
              {overallFatigue ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span>
            </div>
          </div>
          <div style={{ width: '1px', background: 'var(--rule)', margin: '0 16px', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <div className="stat-cell">
              <div className="sc-label">Recovery</div>
              <div className="sc-num forest" style={{ fontSize: 18 }}>{s?.recoveryTrend?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div>
            </div>
            <div className="stat-cell">
              <div className="sc-label">Resting HR</div>
              <div className="sc-num" style={{ fontSize: 18 }}>{s?.rhrSeries?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>bpm</span></div>
            </div>
          </div>
        </div>

        {/* Scrollable muscle bars */}
        <div className="muscle-scroll fade">
          {sortedFatigue.map(([m, v]) => (
            <div key={m} className="muscle-row">
              <div className="muscle-name">{m}</div>
              <div className="muscle-bar-track">
                <div className="muscle-bar-fill" style={{ width: `${v}%`, background: v < 40 ? 'var(--forest)' : v < 70 ? 'var(--gold)' : 'var(--red)' }} />
              </div>
              <div className="muscle-pct">{v}%</div>
            </div>
          ))}
          {!sortedFatigue.length && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', paddingTop: 10, fontStyle: 'italic' }}>No recent sessions logged.</div>}
        </div>

        <div className="fade" style={{ display: 'flex', gap: 14, flexShrink: 0, marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
          {[['Recovered','#1a4f2a'],['Moderate','#6b5800'],['Fatigued','#7a3400']].map(([lbl, css]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
              <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
            </div>
          ))}
        </div>
      </>}

      {tab === 'ranking' && <>
        {/* Body triptych, colored by strength-ranking tier instead of fatigue */}
        <div className="fade" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
          {[['Anterior', rankAntRef], ['Lateral', rankLatRef], ['Posterior', rankPostRef]].map(([label, ref]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
              <div className="body-view" ref={ref} />
            </div>
          ))}
        </div>

        <div className="fade" style={{ display: 'flex', gap: 12, flexShrink: 0, marginTop: 8, flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
          {DIAGRAM_TIER_BANDS.map(([, tier]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: TIER_COLOR[tier] }} />
              <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{tier}</span>
            </div>
          ))}
        </div>

        {/* Muscles this diagram has no body-map region for -- shown as text so
            "all of the muscles" actually means all of them, not just the 14
            of 19 ranked muscles the SVGs happen to have artwork for. */}
        {MUSCLES_WITHOUT_BODY_REGION.some(m => s?.muscleLevels?.[m]) && (
          <div className="fade" style={{ flexShrink: 0, marginTop: 10, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 6 }}>
              Not shown on the diagram (no body-map region drawn for these yet):
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {MUSCLES_WITHOUT_BODY_REGION.filter(m => s?.muscleLevels?.[m]).map(m => {
                const v = s.muscleLevels[m];
                return (
                  <div key={m} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--ink)' }}>{muscleDisplayLabel(m)}</span>
                    {' '}<span style={{ color: TIER_COLOR[v.tier] }}>{v.tier}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>}

      {tab === 'types' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingTop: 8 }}>
          {[
            { label: 'Structural', value: overallFatigue, desc: 'Mechanical tissue damage — per muscle, decays 48–72h. Adjusted by logged soreness.', color: overallFatigue > 60 ? 'var(--red)' : overallFatigue > 30 ? 'var(--gold)' : 'var(--forest)' },
            { label: 'Metabolic', value: metabolic, desc: `Glycogen & energy system depletion — 12h half-life. Reduced by carb intake (${s?.nutritionToday?.carbs || 0}g today).`, color: metabolic > 60 ? 'var(--red)' : metabolic > 30 ? 'var(--gold)' : 'var(--forest)' },
            { label: 'CNS', value: cns, desc: 'Central nervous system load from heavy compounds (deadlift, squat, press) — 36h half-life.', color: cns > 60 ? 'var(--red)' : cns > 30 ? 'var(--gold)' : 'var(--forest)' },
          ].map(({ label, value, desc, color }) => (
            <div key={label} style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                <div className="sc-label" style={{ width: 80, flexShrink: 0 }}>{label}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: '-.03em', color, lineHeight: 1 }}>
                  {value != null ? `${value}%` : '—'}
                </div>
              </div>
              {value != null && (
                <div style={{ height: 5, background: 'var(--paper2)', borderRadius: 1, margin: '6px 0', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: color, borderRadius: 1, transform: `scaleX(${value / 100})`, transformOrigin: 'left', transition: 'transform .4s ease' }} />
                </div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', paddingBottom: 8 }}>
            Recovery times are defaults and will personalise as your data accumulates.
          </div>
        </div>
      )}

      {tab === 'adaptation' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 10 }}>
            Colored by current stimulus level — red means it's effectively atrophying, green means it's actively adapting. Tap a muscle for its full continuous curve below.
          </div>

          {/* Body triptych — colored by adaptationFilterForMuscle by default;
              click a region to select it for the chart below, same
              tap-to-toggle behavior as the Soreness/Ranking pickers. */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
            {[['Anterior', adaptAntRef], ['Lateral', adaptLatRef], ['Posterior', adaptPostRef]].map(([label, ref]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
                <div className="body-view" ref={ref} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexShrink: 0, margin: '2px 0 10px', flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
            {[['Atrophying', 'var(--red)'], ['Low', 'var(--ember)'], ['Moderate', 'var(--gold)'], ['Adapting', 'var(--forest)'], ['No data', 'var(--dim)']].map(([lbl, css]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
                <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
              </div>
            ))}
          </div>

          {/* Muscles the diagram has no region for (see SORENESS_DIAGRAM_MUSCLES) */}
          {adaptMuscles.some(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
              {adaptMuscles.filter(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)).map(m => (
                <button key={m} className="prof-btn" onClick={() => setAdaptMuscle(m)}
                  style={activeAdaptMuscle === m ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                  {muscleDisplayLabel(m)}
                </button>
              ))}
            </div>
          )}

          {adaptMuscles.length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>Log some lifts to see adaptation curves.</div>
          )}

          {activeAdaptMuscle && (
            <>
              <div className="kicker" style={{ marginTop: 12, marginBottom: 8 }}>{muscleDisplayLabel(activeAdaptMuscle)}</div>
              <AdaptationChart series={activeAdaptSeries} atrophyRate={atrophyRate} />

              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {estimatedAtrophyRate != null ? (
                  <button className="prof-btn" onClick={() => { setAtrophyRate(estimatedAtrophyRate); setAtrophyCalibrated(true); }}
                    style={atrophyCalibrated ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}
                    title={`Calibrated from your own training gaps (14-90 days). Median 1RM drop = ${(estimatedAtrophyRate * 24 * 100).toFixed(3)}%/day`}>
                    {atrophyCalibrated ? '✓ calibrated from your gaps' : 'calibrate from your gaps'}
                  </button>
                ) : (
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic' }}>Needs a 14+ day training gap to calibrate — using a default rate.</span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
                  <input type="range" min="0.0005" max="0.015" step="0.0005" value={atrophyRate}
                    onChange={e => { setAtrophyRate(+e.target.value); setAtrophyCalibrated(false); }}
                    style={{ flex: 1, accentColor: 'var(--ink)' }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', minWidth: 62, textAlign: 'right' }}>
                    {(atrophyRate * 24 * 100).toFixed(2)}%/day
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'soreness' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 10 }}>
            Tap a muscle on the diagram (or in the list below it) to log soreness (1–10)
          </div>

          {/* Body triptych — click a region to select it, same tap-to-toggle
              behavior as the fallback buttons below. */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
            {[['Anterior', soreAntRef], ['Lateral', soreLatRef], ['Posterior', sorePostRef]].map(([label, ref]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
                <div className="body-view" ref={ref} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexShrink: 0, margin: '2px 0 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
            {[['Selected', 'var(--ember)'], ['Logged recently', 'var(--navy)']].map(([lbl, css]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
                <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
              </div>
            ))}
          </div>

          {/* Muscles the diagram has no region for (see SORENESS_DIAGRAM_MUSCLES) */}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 6 }}>
            Not shown above:
          </div>
          <div className="soreness-grid" style={{ flexShrink: 0 }}>
            {SORENESS_MUSCLES.filter(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)).map(m => (
              <button key={m} className={`soreness-btn${sorenessSet.has(m) ? ' has-log' : ''}${selectedMuscle === m ? ' active' : ''}`}
                onClick={() => { setSelectedMuscle(selectedMuscle === m ? null : m); setSliderVal(5); }}
                style={selectedMuscle === m ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : {}}>
                {sorenessSet.has(m) && <span className="soreness-dot" />}
                {m}
              </button>
            ))}
          </div>
          {selectedMuscle && (
            <div className="soreness-slider-wrap">
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8, textTransform: 'capitalize' }}>
                {selectedMuscle} soreness: <strong style={{ color: 'var(--ink)' }}>{sliderVal}/10</strong>
              </div>
              <input type="range" min="1" max="10" value={sliderVal} onChange={e => setSliderVal(+e.target.value)}
                style={{ width: '100%', marginBottom: 10, accentColor: 'var(--ink)' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="prof-btn solid" onClick={logSoreness} disabled={soreLogging} style={{ fontSize: 8, padding: '5px 14px' }}>
                  {soreLogging ? 'Logging…' : 'Log'}
                </button>
                <button className="prof-btn" onClick={() => setSelectedMuscle(null)} style={{ fontSize: 8, padding: '5px 14px' }}>Cancel</button>
              </div>
            </div>
          )}
          {recentSoreness.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Recent Logs</div>
              {[...recentSoreness].reverse().slice(0, 5).map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', padding: '3px 0', borderBottom: '1px solid var(--paper2)', textTransform: 'capitalize' }}>
                  <span>{e.muscle}</span><span style={{ color: 'var(--ink)' }}>{e.score}/10</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'injuries' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 6 }}>
            Active injuries — logged to avoid overloading affected areas
          </div>

          {/* Active injuries list */}
          {(s?.injuries || []).length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>
              No active injuries. Log any pain or restriction below.
            </div>
          )}
          <div className="injury-list">
            {(s?.injuries || []).map(inj => (
              <div key={inj.id} className="injury-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div className="injury-area">{inj.area}</div>
                    <div className="injury-meta">
                      {inj.severity} · {new Date(inj.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {inj.clearance != null && ` · ${inj.clearance >= 100 ? 'fully healed' : `day ${inj.elapsedDays}/${inj.healingDays} — ${inj.clearance}% cleared`}`}
                    </div>
                    {inj.note && <div className="injury-note">{inj.note}</div>}
                  </div>
                  <button className="injury-resolve" onClick={async () => {
                    await api(`injuries/${inj.id}/resolve`, { method: 'POST' });
                    refresh({ ...s, injuries: (s?.injuries || []).filter(i => i.id !== inj.id) });
                  }}>Resolved</button>
                </div>
              </div>
            ))}
          </div>

          {/* Log new injury form */}
          <div className="injury-form">
            <div className="kicker" style={{ margin: 0 }}>Log an Injury</div>
            <input
              className="injury-input"
              placeholder="Area or movement affected (e.g. left knee, shoulder flexion)…"
              value={injuryArea}
              onChange={e => setInjuryArea(e.target.value)}
            />
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Severity</div>
              <div className="injury-sev">
                {['mild','moderate','severe'].map(sev => (
                  <button key={sev} className={`injury-sev-btn${injurySev === sev ? ' active' : ''}`} onClick={() => setInjurySev(sev)}>
                    {sev}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="injury-input"
              placeholder="Notes (optional)…"
              value={injuryNote}
              onChange={e => setInjuryNote(e.target.value)}
            />
            <button className="prof-btn solid" disabled={!injuryArea.trim() || injuryLogging}
              onClick={async () => {
                setInjuryLogging(true);
                const area = injuryArea.trim(), severity = injurySev, note = injuryNote.trim();
                const data = await api('injury', { method: 'POST', body: JSON.stringify({ area, severity, note }) });
                setInjuryArea(''); setInjuryNote(''); setInjurySev('mild');
                setInjuryLogging(false);
                refresh({ ...s, injuries: [...(s?.injuries || []), { id: data.id, ts: data.id, area, severity, note, muscles: [], resolved: false }] });
              }}
              style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {injuryLogging ? 'Logging…' : 'Log Injury'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── S6: PROFILE ───────────────────────────────────────────────────────────────
const TREND_METRICS = [
  { key: 'weight', label: 'Weight', unit: 'kg', color: 'var(--ink)' },
  { key: 'bodyFat', label: 'Body Fat', unit: '%', color: 'var(--ember)' },
  { key: 'recovery', label: 'Recovery', unit: '/100', color: 'var(--gold)' },
  { key: 'sleepScore', label: 'Sleep Score', unit: '/100', color: 'var(--plum)' },
  { key: 'sleep', label: 'Sleep', unit: 'h', color: 'var(--plum)' },
  { key: 'hrv', label: 'HRV', unit: 'ms', color: 'var(--navy)' },
  { key: 'squat', label: 'Squat e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'bench', label: 'Bench e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'deadlift', label: 'Deadlift e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'overheadPress', label: 'OHP e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'row', label: 'Row e1RM', unit: 'kg', color: 'var(--forest)' },
];
const TREND_RANGES = [[14, '14D'], [30, '30D'], [90, '90D'], [365, '1Y']];

function TrendsPanel() {
  const [metric, setMetric] = useState('weight');
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`trends?metric=${metric}&range=${range}`).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [metric, range]);

  const meta = TREND_METRICS.find(m => m.key === metric);
  const series = data?.series || [];
  const values = series.map(p => p.value);
  const first = values[0], last = values.at(-1);
  const delta = first != null && last != null ? Math.round((last - first) * 10) / 10 : null;

  return (
    <div style={{ marginBottom: 4 }}>
      <div className="kicker" style={{ margin: '0 0 10px' }}>Long-Term Trends</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={metric} onChange={e => setMetric(e.target.value)}
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}>
          {TREND_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {TREND_RANGES.map(([r, l]) => (
            <button key={r} onClick={() => setRange(r)}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '5px 10px', border: '1px solid var(--rule)', background: range === r ? 'var(--ink)' : 'none', color: range === r ? 'var(--paper)' : 'var(--ink)', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 70, position: 'relative', marginBottom: 4 }}>
        {loading ? (
          <div style={{ fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '20px 0' }}>Loading…</div>
        ) : values.length > 1 ? (
          <AreaChart data={values} color={meta.color} id={`trend-${metric}`} />
        ) : (
          <div style={{ fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '20px 0' }}>Not enough data yet for this range.</div>
        )}
      </div>
      {values.length > 1 && (
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>
          {first} → {last} {meta.unit} {delta != null && delta !== 0 ? `(${delta > 0 ? '+' : ''}${delta})` : ''}
        </div>
      )}
    </div>
  );
}

function S6({ s, onOpenSettings, refresh }) {
  const supplements = s?.supplements || [];
  const suppLogToday = s?.supplementLogToday || [];
  const suppLoggedSet = new Set(suppLogToday.map(e => e.name));
  const [togglingSupp, setTogglingSupp] = useState('');
  const [weightVal, setWeightVal] = useState('');
  const [bfVal, setBfVal] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const MEASURE_TYPES = ['neck','chest','waist','hips','left arm','right arm','left thigh','right thigh'];
  const [measureType, setMeasureType] = useState('waist');
  const [measureVal, setMeasureVal] = useState('');
  const [measureUnit, setMeasureUnit] = useState('cm');
  const [savingMeasure, setSavingMeasure] = useState(false);
  const measurements = s?.measurements || [];

  const getLatest = (type) => {
    const entries = measurements.filter(m => m.type === type).sort((a,b) => a.ts - b.ts);
    return entries.at(-1) || null;
  };
  const getPrev = (type) => {
    const entries = measurements.filter(m => m.type === type).sort((a,b) => a.ts - b.ts);
    return entries.length >= 2 ? entries.at(-2) : null;
  };

  const logMeasurement = async () => {
    if (!measureVal) return;
    setSavingMeasure(true);
    const type = measureType, value = parseFloat(measureVal), unit = measureUnit;
    await api('measurements', { method: 'POST', body: JSON.stringify({ type, value, unit }) });
    setMeasureVal('');
    setSavingMeasure(false);
    const now = Date.now();
    refresh({ ...s, measurements: [...(s?.measurements || []), { id: now, date: todayLocalStr(), type, value, unit, ts: now }] });
  };

  const toggleSuppLog = async (supp) => {
    setTogglingSupp(supp.name);
    const data = await api('supplement/log', { method: 'POST', body: JSON.stringify({ name: supp.name, dose: supp.dose }) });
    setTogglingSupp('');
    const today = todayLocalStr();
    refresh({ ...s, supplementLogToday: data.logged
      ? [...(s?.supplementLogToday || []), { date: today, name: supp.name, dose: supp.dose || '', ts: Date.now() }]
      : (s?.supplementLogToday || []).filter(e => e.name !== supp.name) });
  };

  const photos = s?.photosMeta || [];
  const [photoNote, setPhotoNote] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef();

  const handleAddPhoto = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const note = photoNote;
      const data = await api('photos', { method: 'POST', body: JSON.stringify({ image: reader.result, note }) });
      setPhotoNote('');
      setUploadingPhoto(false);
      refresh({ ...s, photosMeta: [...(s?.photosMeta || []), { id: data.id, date: todayLocalStr(), note, url: data.url }] });
    };
    reader.readAsDataURL(file);
  };

  const deletePhoto = async id => {
    await api(`photos/${id}`, { method: 'DELETE' });
    refresh({ ...s, photosMeta: (s?.photosMeta || []).filter(p => p.id !== id) });
  };
  return (
    <section id="s6" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Profile</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>{s?.profile?.name || 'Profile'}</div>
        <button className="settings-open-btn" onClick={onOpenSettings}>
          <span>Settings</span>
          <span>→</span>
        </button>
      </div>

      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {supplements.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="kicker" style={{ margin: '0 0 8px' }}>Today's Supplements</div>
            {supplements.map(sup => {
              const done = suppLoggedSet.has(sup.name);
              return (
                <div key={sup.name} className="supp-item">
                  <button className={`supp-check${done ? ' done' : ''}`}
                    onClick={() => toggleSuppLog(sup)} disabled={togglingSupp === sup.name}>
                    {done ? '✓' : ''}
                  </button>
                  <span className="supp-name">{sup.name}</span>
                  <span className="supp-meta">{[sup.dose, sup.timing].filter(Boolean).join(' · ')}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="rule-thin" />

        <div className="kicker" style={{ margin: '16px 0 10px' }}>Body Data</div>
        {(() => {
          const latestWeight = s?.weights?.at(-1) ?? null;
          const prevWeight = s?.weights?.length >= 2 ? s.weights.at(-2) : null;
          const weightDelta = latestWeight && prevWeight ? parseFloat((latestWeight.value - prevWeight.value).toFixed(1)) : null;
          const bf = s?.bodyFatToday ?? null;
          return (latestWeight || bf != null) ? (
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              {latestWeight && (
                <div className="measure-row" style={{ flex: 1, border: 'none' }}>
                  <span className="measure-lbl">Weight</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="measure-val">{latestWeight.value}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>kg</span>
                    {weightDelta !== null && (
                      <span className="measure-delta" style={{ color: weightDelta < 0 ? 'var(--forest)' : weightDelta > 0 ? 'var(--ember)' : 'var(--dim)' }}>
                        {weightDelta > 0 ? '+' : ''}{weightDelta}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {bf != null && (
                <div className="measure-row" style={{ flex: 1, border: 'none' }}>
                  <span className="measure-lbl">Body Fat</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="measure-val">{bf.toFixed(1)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>%</span>
                  </div>
                </div>
              )}
            </div>
          ) : null;
        })()}
        {s?.composition && (
          <div className="pull" style={{ margin: '2px 0 14px' }}>
            <strong>{s.composition.word}</strong> — {s.composition.note}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Weight kg" value={weightVal} onChange={e => setWeightVal(e.target.value)} style={{ flex: 1 }} />
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Body fat %" value={bfVal} onChange={e => setBfVal(e.target.value)} style={{ flex: 1 }} />
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            disabled={(!weightVal && !bfVal) || savingWeight}
            onClick={async () => {
              setSavingWeight(true);
              const patch = {};
              if (weightVal) {
                const r = await api('weight', { method: 'POST', body: JSON.stringify({ kg: parseFloat(weightVal) }) });
                patch.weights = r.weights; patch.composition = r.composition;
              }
              if (bfVal) {
                const r = await api('bodyfat', { method: 'POST', body: JSON.stringify({ pct: parseFloat(bfVal) }) });
                patch.bodyFatToday = r.bodyFatToday; patch.bodyFat30 = r.bodyFat30;
              }
              setWeightVal(''); setBfVal('');
              setSavingWeight(false);
              refresh({ ...s, ...patch });
            }}>
            {savingWeight ? '…' : 'Log'}
          </button>
        </div>
        <div className="rule-thin" style={{ margin: '16px 0' }} />

        <TrendsPanel />

        <div className="rule-thin" style={{ margin: '16px 0' }} />

        <div className="kicker" style={{ margin: '0 0 10px' }}>Measurements</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {MEASURE_TYPES.map(t => (
            <button key={t} className={`prof-btn${measureType === t ? ' solid' : ''}`}
              onClick={() => setMeasureType(t)} style={{ fontSize: 8, padding: '4px 8px', textTransform: 'capitalize', marginBottom: 4 }}>
              {t}
            </button>
          ))}
        </div>
        {(() => {
          const latest = getLatest(measureType);
          const prev = getPrev(measureType);
          const delta = latest && prev ? parseFloat((latest.value - prev.value).toFixed(1)) : null;
          return latest ? (
            <div className="measure-row" style={{ marginBottom: 8 }}>
              <span className="measure-lbl">{measureType}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="measure-val">{latest.value}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{latest.unit}</span>
                {delta !== null && (
                  <span className="measure-delta" style={{ color: delta < 0 ? 'var(--forest)' : delta > 0 ? 'var(--ember)' : 'var(--dim)' }}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                )}
              </div>
            </div>
          ) : null;
        })()}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Value" value={measureVal} onChange={e => setMeasureVal(e.target.value)} style={{ width: 90 }} />
          <div className="ob-unit-toggle">
            {['cm','in'].map(u => (
              <button key={u} className={`ob-unit-btn${measureUnit === u ? ' active' : ''}`} onClick={() => setMeasureUnit(u)}>{u}</button>
            ))}
          </div>
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            onClick={logMeasurement} disabled={!measureVal || savingMeasure}>
            {savingMeasure ? '…' : 'Log'}
          </button>
        </div>

        <div className="rule-thin" style={{ margin: '16px 0' }} />
        <div className="kicker" style={{ margin: '0 0 10px' }}>Progress Photos</div>
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
            {photos.map(p => (
              <div key={p.id} style={{ position: 'relative', flexShrink: 0, width: 84 }}>
                <img src={p.url} alt={p.note || p.date} style={{ width: 84, height: 84, objectFit: 'cover', border: '1px solid var(--rule)', display: 'block' }} />
                <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{p.date}</div>
                <button onClick={() => deletePhoto(p.id)}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'var(--ink)', color: 'var(--paper)', border: 'none', width: 16, height: 16, fontSize: 9, lineHeight: '16px', cursor: 'pointer', padding: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="prof-input" placeholder="Note (optional)" value={photoNote} onChange={e => setPhotoNote(e.target.value)} style={{ flex: 1 }} />
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleAddPhoto} />
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
            {uploadingPhoto ? '…' : 'Add Photo'}
          </button>
        </div>

      </div>
    </section>
  );
}

// ── S7: PERSONAL RECORDS ──────────────────────────────────────────────────────
const MOVEMENT_GROUPS = [
  { label: 'Lower Push', keys: ['squat','leg press','lunge','hack squat','bulgarian','step up','leg extension'] },
  { label: 'Lower Pull', keys: ['deadlift','rdl','hip thrust','glute','leg curl','nordic','hamstring'] },
  { label: 'Upper Push', keys: ['bench','chest press','overhead press','shoulder press','dip','fly','push up'] },
  { label: 'Upper Pull', keys: ['pull','row','pulldown','lat','face pull','shrug','trap'] },
  { label: 'Arms', keys: ['curl','bicep','tricep','extension','pushdown','preacher','hammer'] },
  { label: 'Calves & Core', keys: ['calf','raise','abs','crunch','plank','oblique'] },
];

function groupExercise(name) {
  const n = name.toLowerCase();
  for (const g of MOVEMENT_GROUPS) if (g.keys.some(k => n.includes(k))) return g.label;
  return 'Other';
}

function S7({ s }) {
  const [search, setSearch] = useState('');
  const { prs, e1rmHistory } = useMemo(() => {
    const byEx = {};
    const history = {};
    const lifts = [...(s?.lifts || [])].sort((a,b) => a.date.localeCompare(b.date));
    for (const l of lifts) {
      const e1 = l.kg > 0 && l.reps > 0 ? Math.round(calcE1RM(l.kg, l.reps)) : 0;
      if (!e1 || !l.exercise) continue;
      // Case-insensitive key — CSV/bulk-imported history can carry different
      // casing than the app's own (always-lowercase) session logging, and
      // without this the same exercise would silently split into two
      // separate PR entries and sparkline histories.
      const key = l.exercise.toLowerCase();
      if (!history[key]) history[key] = [];
      history[key].push(e1);
      if (!byEx[key] || e1 > byEx[key].e1rm)
        byEx[key] = { exercise: l.exercise, kg: l.kg, reps: l.reps, e1rm: e1, date: l.date };
    }
    return {
      prs: Object.values(byEx).sort((a, b) => b.e1rm - a.e1rm),
      e1rmHistory: Object.fromEntries(Object.entries(history).map(([k, v]) => [byEx[k]?.exercise ?? k, v])),
    };
  }, [s?.lifts]);

  const cutoff14 = toLocalDateStr(new Date(Date.now() - 14 * 864e5));
  const filtered = search ? prs.filter(p => p.exercise.toLowerCase().includes(search.toLowerCase())) : prs;

  const grouped = useMemo(() => {
    const map = {};
    for (const pr of filtered) {
      const g = groupExercise(pr.exercise);
      if (!map[g]) map[g] = [];
      map[g].push(pr);
    }
    return map;
  }, [filtered]);

  const groupOrder = [...MOVEMENT_GROUPS.map(g => g.label), 'Other'].filter(g => grouped[g]);

  return (
    <section id="s7" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade" style={{ flexShrink: 0 }}>
        <div className="kicker">Personal Records · All Time</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>All-Time<br />Bests</div>
        <div className="deck">{prs.length} exercise{prs.length !== 1 ? 's' : ''} tracked</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <StrengthLevelPanel muscleLevels={s?.muscleLevels} hasSex={!!s?.profile?.sex} />
        <div style={{ marginTop: 12 }}>
          <input className="pr-search" placeholder="Filter exercise…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!prs.length && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>No records yet — log some lifts.</div>
        )}
        {prs.length > 0 && filtered.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>No matches.</div>
        )}
        {groupOrder.map(group => (
          <div key={group}>
            <div className="pr-group-hdr">{group}</div>
            {grouped[group].map((pr, i) => {
              const hist = e1rmHistory[pr.exercise] || [];
              const sparkData = hist.slice(-10);
              const isNew = pr.date >= cutoff14;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--rule)', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, textTransform: 'capitalize', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.exercise}</span>
                      {isNew && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.1em', background: 'var(--gold)', color: 'var(--paper)', padding: '1px 4px', flexShrink: 0 }}>NEW</span>}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>
                      {pr.kg}kg × {pr.reps} · {pr.date}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>{pr.e1rm}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginLeft: 2 }}>kg</span></div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'var(--dim)', marginTop: 1 }}>e1RM</div>
                  </div>
                  {sparkData.length >= 2 && (
                    <Sparkline data={sparkData} color={isNew ? 'var(--gold)' : 'var(--dim)'} width={48} height={20} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
const TRAINING_SPLITS = ['Full Body', 'Upper / Lower', 'Push / Pull / Legs', 'Bro Split', 'Other'];

function Onboarding({ onComplete, onOpenImport }) {
  const TOTAL = 7;
  const [step, setStep] = useState(0);
  const [echelon, setEchelon] = useState('full');

  // Step 4 (training background)
  const [split, setSplit] = useState('');
  const [usualSets, setUsualSets] = useState('');
  const [usualRepsLow, setUsualRepsLow] = useState('');
  const [usualRepsHigh, setUsualRepsHigh] = useState('');
  const [favoriteInput, setFavoriteInput] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState('');

  // Step 1
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [heightUnit, setHeightUnit] = useState('cm');
  const [heightVal, setHeightVal] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [weightVal, setWeightVal] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [sex, setSex] = useState('');

  // Step 2
  const [goal, setGoal] = useState('');
  const [sleepTarget, setSleepTarget] = useState(8);
  const [waterTarget, setWaterTarget] = useState(7);
  const [trainingDays, setTrainingDays] = useState(4);

  // Step 3 tracking
  const [stravaStarted, setStravaStarted] = useState(false);
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);
  const [hevyKeyVal, setHevyKeyVal] = useState('');
  const [hevyKeyMode, setHevyKeyMode] = useState(null);
  const [hevyKeySaved, setHevyKeySaved] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const SHORTCUT_URL = `${API_BASE}/shortcut`;
  // Personal sync URL — each account gets its own token so its data lands
  // in its own account rather than everyone sharing the owner's URL (which
  // silently misrouted a second person's health data into the owner's own
  // account the first time this was actually tried). Falls back to the
  // untokened URL until the token's fetched. Fetched lazily (only once the
  // guide is actually opened) rather than on mount, so this doesn't cost
  // every onboarding user a round trip they may never need.
  const [syncUrl, setSyncUrl] = useState(SHORTCUT_URL);
  const [guideAdvanced, setGuideAdvanced] = useState(false);
  const openHealthGuide = () => {
    setHealthGuideOpen(v => {
      const next = !v;
      if (next && syncUrl === SHORTCUT_URL) {
        api('sync-token', { method: 'POST' }).then(({ token }) => {
          if (token) setSyncUrl(`${SHORTCUT_URL}?token=${token}`);
        }).catch(() => {});
      }
      return next;
    });
  };

  const copyUrl = () => {
    navigator.clipboard?.writeText(syncUrl).then(() => {
      setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  const saveStep1 = async () => {
    const kg = weightUnit === 'kg' ? parseFloat(weightVal) : parseFloat(weightVal) * 0.453592;
    const cm = heightUnit === 'cm' ? parseFloat(heightVal) : parseFloat(heightVal) * 30.48;
    const age = dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null;
    const profileBody = { name: name || undefined, dob: dob || undefined, age, heightCm: cm || undefined, sex: sex || undefined };
    await api('profile', { method: 'POST', body: JSON.stringify(profileBody) });
    if (kg > 0) await api('weight', { method: 'POST', body: JSON.stringify({ kg }) });
    if (bodyFat) await api('bodyfat', { method: 'POST', body: JSON.stringify({ pct: parseFloat(bodyFat) }) });
  };

  const saveStep2 = async () => {
    const macroGoalMap = { 'Lose Fat': 'cut', 'Build Muscle': 'bulk', 'Maintain': 'recomp', 'Athletic Performance': 'recomp' };
    await api('profile', { method: 'POST', body: JSON.stringify({ goal, sleepTarget, waterTarget, trainingDaysPerWeek: trainingDays }) });
    if (macroGoalMap[goal]) await api('macro-auto', { method: 'POST', body: JSON.stringify({ goal: macroGoalMap[goal] }) }).catch(() => {});
  };

  const saveStep4 = async () => {
    const trainingBackground = {
      split: split || undefined,
      usualSets: usualSets ? parseInt(usualSets) : undefined,
      usualRepsLow: usualRepsLow ? parseInt(usualRepsLow) : undefined,
      usualRepsHigh: usualRepsHigh ? parseInt(usualRepsHigh) : undefined,
      favoriteExercises: favorites,
    };
    await api('profile', { method: 'POST', body: JSON.stringify({ trainingBackground, experienceLevel: experienceLevel || undefined }) }).catch(() => {});
  };

  const advance = async () => {
    setSaving(true);
    try {
      if (step === 1) await saveStep1();
      if (step === 2) await saveStep2();
      if (step === 3) await api('profile', { method: 'POST', body: JSON.stringify({ trackingLevel: echelon }) }).catch(() => {});
      if (step === 4) await saveStep4();
    } catch {}
    setSaving(false);
    setStep(s => s + 1);
  };

  const progressPct = (step / (TOTAL - 1)) * 100;

  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)' };

  return (
    <div className="onboard-overlay">
      {/* Progress bar */}
      <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${progressPct}%` }} /></div>

      <div className="ob-wrap">
        {step > 0 && (
          <div className="ob-step-ind">Step {step} of {TOTAL - 1}</div>
        )}

        {/* ── STEP 0: WELCOME ── */}
        {step === 0 && (
          <>
            <div className="ob-logo">Press</div>
            <div className="ob-sub">Your personal health operating system.</div>
            <div className="ob-lede">We'll get you set up in 2 minutes. Tell us about yourself and connect your services.</div>
            <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', margin: '0 0 32px' }}>
              {[
                ['Daily vitals', 'HRV, sleep, recovery, and readiness at a glance'],
                ['AI workout planner', 'Fatigue-aware sessions with progressive overload targets'],
                ['Nutrition logger', 'Photograph a meal for instant macro estimates'],
                ['Body & performance', 'PRs, muscle fatigue maps, Apple Health & Strava sync'],
              ].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--paper2)' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 700, flexShrink: 0, fontFamily: 'Times New Roman,serif' }}>—</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="ob-next" style={{ width: '100%', padding: '14px 0' }} onClick={() => setStep(1)}>Get Started</button>
          </>
        )}

        {/* ── STEP 1: ABOUT YOU ── */}
        {step === 1 && (
          <>
            <div className="ob-h">About You</div>
            <div className="ob-deck">Tell us the basics so Press can calibrate your targets and progress.</div>

            <label className="ob-label">Name</label>
            <input style={inputStyle} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />

            <label className="ob-label">Date of Birth</label>
            <input style={inputStyle} type="date" value={dob} onChange={e => setDob(e.target.value)} />

            <label className="ob-label">Sex <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(optional — used only to calibrate strength-level standards)</span></label>
            <div className="ob-unit-toggle" style={{ marginBottom: 14 }}>
              <button className={`ob-unit-btn${sex === 'male' ? ' active' : ''}`} onClick={() => setSex('male')}>Male</button>
              <button className={`ob-unit-btn${sex === 'female' ? ' active' : ''}`} onClick={() => setSex('female')}>Female</button>
            </div>

            <label className="ob-label">Height</label>
            <div className="ob-unit-row">
              <input style={{ ...inputStyle, flex: 1, width: 'auto' }}
                placeholder={heightUnit === 'cm' ? 'e.g. 180' : 'e.g. 5.11'}
                type="number" value={heightVal} onChange={e => setHeightVal(e.target.value)} inputMode="decimal" />
              <div className="ob-unit-toggle">
                <button className={`ob-unit-btn${heightUnit === 'cm' ? ' active' : ''}`} onClick={() => setHeightUnit('cm')}>cm</button>
                <button className={`ob-unit-btn${heightUnit === 'ft' ? ' active' : ''}`} onClick={() => setHeightUnit('ft')}>ft</button>
              </div>
            </div>

            <label className="ob-label">Current Weight</label>
            <div className="ob-unit-row">
              <input style={{ ...inputStyle, flex: 1, width: 'auto' }}
                placeholder={weightUnit === 'kg' ? 'e.g. 82' : 'e.g. 180'}
                type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)} inputMode="decimal" />
              <div className="ob-unit-toggle">
                <button className={`ob-unit-btn${weightUnit === 'kg' ? ' active' : ''}`} onClick={() => setWeightUnit('kg')}>kg</button>
                <button className={`ob-unit-btn${weightUnit === 'lbs' ? ' active' : ''}`} onClick={() => setWeightUnit('lbs')}>lbs</button>
              </div>
            </div>

            <label className="ob-label">Body Fat % <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(optional)</span></label>
            <input style={inputStyle} placeholder="Leave blank if unknown" type="number" step="0.1"
              value={bodyFat} onChange={e => setBodyFat(e.target.value)} inputMode="decimal" />

            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(0)}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 2: GOALS ── */}
        {step === 2 && (
          <>
            <div className="ob-h">Your Goals</div>
            <div className="ob-deck">Set your primary objective and daily targets.</div>

            <label className="ob-label">Primary Goal</label>
            <div className="ob-goal-grid">
              {[
                ['Lose Fat', 'Calorie deficit, preserve muscle'],
                ['Build Muscle', 'Caloric surplus, progressive overload'],
                ['Maintain', 'Body recomposition, balanced macros'],
                ['Athletic Performance', 'Power, endurance, sport-specific'],
              ].map(([g, d]) => (
                <button key={g} className={`ob-goal-card${goal === g ? ' selected' : ''}`} onClick={() => setGoal(g)}>
                  <div className="ob-goal-card-title">{g}</div>
                  <div className="ob-goal-card-desc">{d}</div>
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
              <label className="ob-label" style={{ marginTop: 0 }}>Sleep Target</label>
              <div className="ob-stepper" style={{ margin: '10px 0 16px' }}>
                <button className="ob-stepper-btn" onClick={() => setSleepTarget(t => Math.max(5, t - 0.5))}>−</button>
                <div className="ob-stepper-val">{sleepTarget}<span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--dim)', fontWeight: 400 }}>h</span></div>
                <button className="ob-stepper-btn" onClick={() => setSleepTarget(t => Math.min(12, t + 0.5))}>+</button>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>per night</span>
              </div>

              <label className="ob-label" style={{ marginTop: 0 }}>Water Target</label>
              <div className="ob-stepper" style={{ margin: '10px 0 16px' }}>
                <button className="ob-stepper-btn" onClick={() => setWaterTarget(t => Math.max(2, t - 1))}>−</button>
                <div className="ob-stepper-val">{waterTarget}</div>
                <button className="ob-stepper-btn" onClick={() => setWaterTarget(t => Math.min(16, t + 1))}>+</button>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>glasses / day</span>
              </div>

              <label className="ob-label" style={{ marginTop: 0 }}>Training Days per Week</label>
              <div className="ob-stepper" style={{ margin: '10px 0' }}>
                <button className="ob-stepper-btn" onClick={() => setTrainingDays(t => Math.max(1, t - 1))}>−</button>
                <div className="ob-stepper-val">{trainingDays}</div>
                <button className="ob-stepper-btn" onClick={() => setTrainingDays(t => Math.min(7, t + 1))}>+</button>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>days</span>
              </div>
            </div>

            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(1)}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving || !goal}>{saving ? 'Saving…' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 3: TRACKING LEVEL ── */}
        {step === 3 && (
          <>
            <div className="ob-h">How deep do you want to go?</div>
            <div className="ob-deck">Pick your tracking level. You can always change this in Settings.</div>
            {ECHELONS.map(e => (
              <button key={e.key} className={`echelon-card${echelon === e.key ? ' selected' : ''}`}
                onClick={() => setEchelon(e.key)}>
                <div className="echelon-card-dot" />
                <div style={{ flex: 1 }}>
                  <div className="echelon-card-title">{e.title}</div>
                  <div className="echelon-card-desc">{e.desc}</div>
                </div>
              </button>
            ))}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(2)}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 4: TRAINING BACKGROUND ── */}
        {step === 4 && (
          <>
            <div className="ob-h">Your training so far</div>
            <div className="ob-deck">
              Nothing logged yet, so this gives the workout generator a real starting anchor instead of guessing — it'll shift toward your actual logged history the moment you start training.
            </div>

            <div className="ob-label">Experience</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {['New to training', 'Experienced'].map(lvl => (
                <button key={lvl} className={`echelon-card${experienceLevel === lvl ? ' selected' : ''}`} style={{ flex: 1, padding: '10px 12px' }}
                  onClick={() => setExperienceLevel(lvl)}>
                  <div style={{ flex: 1 }}><div className="echelon-card-title" style={{ fontSize: 13 }}>{lvl}</div></div>
                </button>
              ))}
            </div>

            <div className="ob-label">Typical split</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {TRAINING_SPLITS.map(sp => (
                <button key={sp} className={`prof-btn${split === sp ? ' solid' : ''}`} onClick={() => setSplit(sp)}>{sp}</button>
              ))}
            </div>

            <div className="ob-label">Usual working sets per exercise</div>
            <input style={inputStyle} type="number" inputMode="numeric" placeholder="e.g. 3" value={usualSets} onChange={e => setUsualSets(e.target.value)} />

            <div className="ob-label" style={{ marginTop: 16 }}>Usual rep range</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
              <input style={{ ...inputStyle, width: 'auto', flex: 1 }} type="number" inputMode="numeric" placeholder="Low, e.g. 6" value={usualRepsLow} onChange={e => setUsualRepsLow(e.target.value)} />
              <span style={{ color: 'var(--dim)' }}>–</span>
              <input style={{ ...inputStyle, width: 'auto', flex: 1 }} type="number" inputMode="numeric" placeholder="High, e.g. 10" value={usualRepsHigh} onChange={e => setUsualRepsHigh(e.target.value)} />
            </div>

            <div className="ob-label">Favorite / go-to exercises</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...inputStyle, width: 'auto', flex: 1 }} list="ob-exercise-options" placeholder="e.g. Barbell Bench Press" value={favoriteInput}
                onChange={e => setFavoriteInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !favoriteInput.trim()) return;
                  e.preventDefault();
                  setFavorites(p => p.includes(favoriteInput.trim()) ? p : [...p, favoriteInput.trim()]);
                  setFavoriteInput('');
                }} />
              <button className="prof-btn" onClick={() => {
                if (!favoriteInput.trim()) return;
                setFavorites(p => p.includes(favoriteInput.trim()) ? p : [...p, favoriteInput.trim()]);
                setFavoriteInput('');
              }}>Add</button>
            </div>
            <datalist id="ob-exercise-options">
              {BASE_EXERCISES.map(n => <option key={n} value={n} />)}
            </datalist>
            {favorites.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {favorites.map(f => (
                  <span key={f} className="prof-btn solid" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                    {f}
                    <span style={{ cursor: 'pointer' }} onClick={() => setFavorites(p => p.filter(x => x !== f))}>×</span>
                  </span>
                ))}
              </div>
            )}

            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(3)}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 5: CONNECT SERVICES ── */}
        {step === 5 && (
          <>
            <div className="ob-h">Connect Services</div>
            <div className="ob-deck">Optional — you can always connect these later from the Profile page.</div>

            {/* Strava */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Strava</div>
                  <div className="ob-svc-desc">Import your runs, rides, and activities automatically</div>
                </div>
                <button className={`ob-svc-btn${stravaStarted ? ' done' : ''}`}
                  onClick={() => { setStravaStarted(true); window.open(`${API_BASE}/strava/auth`, '_blank'); }}>
                  {stravaStarted ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>

            {/* Apple Health */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Apple Health</div>
                  <div className="ob-svc-desc">Stream sleep, HRV, steps, and heart rate from your iPhone</div>
                </div>
                <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={openHealthGuide}>
                  {healthGuideOpen ? 'Hide Guide' : 'Setup Guide'}
                </button>
              </div>
              {healthGuideOpen && (
                <div className="ob-guide">
                  <a href="https://www.icloud.com/shortcuts/e1a3c6dea8854f10a8b431a185c7c17d" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: 'var(--gold)' }}>
                    Install the pre-built Shortcut →
                  </a>
                  Your personal sync link — after installing, open the Shortcut and make sure its URL matches this (replace it if it doesn't), so your data lands in your own account:
                  <div className="ob-copy-url" onClick={copyUrl}>
                    <span>{syncUrl}</span>
                    <button onClick={e => { e.stopPropagation(); copyUrl(); }}>{urlCopied ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <button onClick={() => setGuideAdvanced(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                    {guideAdvanced ? '− Hide' : '+ Show'} manual build / sharing with others / unsupported sensors
                  </button>
                  {guideAdvanced && (
                    <div style={{ marginTop: 10 }}>
                      <strong>No Blood Oxygen or Wrist Temperature on your Watch?</strong> Apple Watch SE has neither sensor, and Wrist Temperature needs Series 8+/Ultra — "Find Health Samples" errors on a type your device doesn't support (it doesn't just return empty), so just delete those two blocks from your own copy of the Shortcut. Everything else (HR, HRV, RHR, Steps, Sleep) works on every Watch and the iPhone alone.<br /><br />
                      <strong>Sharing this with someone else?</strong> Add these steps to the top of the Shortcut so it asks for their URL once and remembers it automatically, instead of everyone needing to manually edit it:<br />
                      <strong>a.</strong> Add <strong>Get File</strong> (iCloud Drive → Shortcuts folder → <code>press-sync-url.txt</code>), with "Error if Not Found" turned off — this file won't exist the first time<br />
                      <strong>b.</strong> Add an <strong>If</strong> checking whether that result has any value<br />
                      <strong>c.</strong> If yes → set variable <code>syncUrl</code> to the file's contents<br />
                      <strong>d.</strong> Otherwise → <strong>Ask for Input</strong> ("Paste your Press sync URL"), set <code>syncUrl</code> to the answer, then <strong>Save File</strong> it back to the same <code>press-sync-url.txt</code> path so every future run finds it already there<br />
                      <strong>e.</strong> Use <code>syncUrl</code> (not typed text) as the URL in Get Contents of URL<br /><br />
                      Or build it yourself from scratch:<br />
                      <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                      <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                      <strong>3.</strong> Trigger: <strong>Daily</strong> — set up <strong>three</strong> automations (duplicate this one twice), one each in the morning, afternoon, and night, so your data is fresh for each of Press's Morning Briefing, Mid-Day Update, and Tonight's Report<br />
                      <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                      <strong>5.</strong> URL — the same personal link shown above<br />
                      <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                      <strong>7.</strong> Add a Dictionary with: <code>hr_values</code>/<code>hr_dates</code>, <code>rhr_values</code>/<code>rhr_dates</code>, <code>hrv_values</code>/<code>hrv_dates</code>, <code>bloodoxygen_values</code>/<code>bloodoxygen_dates</code>, <code>steps_values</code>/<code>steps_dates</code>, <code>wrist_values</code>/<code>wrist_dates</code>, and <code>sleep_start</code>/<code>sleep_end</code>/<code>sleep_types</code><br />
                      <strong>8.</strong> Each pair comes from its own "Find Health Samples" block — Value+Start Date for the first six, Start Date+End Date+Type for Sleep
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hevy */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Hevy</div>
                  <div className="ob-svc-desc">Import your lifting history from Hevy</div>
                </div>
              </div>
              <div className="ob-hevy-modes">
                <button className={`ob-svc-btn${hevyKeyMode === 'csv' ? ' done' : ''}`}
                  onClick={() => { onOpenImport(); }}>
                  Import CSV
                </button>
                <button className={`ob-svc-btn${hevyKeyMode === 'api' ? ' done' : ''}`}
                  onClick={() => setHevyKeyMode(m => m === 'api' ? null : 'api')}>
                  {hevyKeyMode === 'api' ? 'API Key' : 'API Key'}
                </button>
              </div>
              {hevyKeyMode === 'api' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input style={{ ...inputStyle, flex: 1, width: 'auto', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}
                    placeholder="Hevy API key…" value={hevyKeyVal} onChange={e => setHevyKeyVal(e.target.value)} />
                  <button className="ob-svc-btn" style={hevyKeySaved ? { background: 'var(--forest)', borderColor: 'var(--forest)', color: 'var(--paper)' } : {}}
                    onClick={async () => {
                      if (!hevyKeyVal.trim()) return;
                      await api('hevy/key', { method: 'POST', body: JSON.stringify({ key: hevyKeyVal.trim() }) }).catch(() => {});
                      setHevyKeySaved(true);
                    }}>
                    {hevyKeySaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(4)}>← Back</button>
              <button className="ob-next" onClick={() => setStep(6)}>Continue</button>
            </div>
          </>
        )}

        {/* ── STEP 6: ALL SET ── */}
        {step === 6 && (
          <>
            <div className="ob-logo" style={{ fontSize: 'clamp(36px,9vw,60px)' }}>You're set up.</div>
            <div className="ob-sub" style={{ marginBottom: 6 }}>Press is ready.</div>
            <div className="ob-lede">Your data will populate as you train, sleep, and log.</div>

            <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', margin: '8px 0 28px', padding: '4px 0' }}>
              {[
                [!!name, name ? `${name}${goal ? ` · ${goal}` : ''}` : 'Profile skipped'],
                [!!goal, `${sleepTarget}h sleep · ${waterTarget} glasses water · ${trainingDays} training days`],
                [true, ECHELONS.find(e => e.key === echelon)?.title || 'Full System'],
                [!!(split || favorites.length), split ? `${split}${favorites.length ? ` · ${favorites.length} favorite${favorites.length === 1 ? '' : 's'}` : ''}` : 'Training background skipped'],
                [stravaStarted, 'Strava'],
                [healthGuideOpen, 'Apple Health setup viewed'],
                [hevyKeySaved, 'Hevy API key saved'],
              ].map(([done, lbl], i) => (
                <div key={i} className="ob-summary-row">
                  <div className={`ob-summary-check${done ? '' : ' empty'}`} />
                  <div className="ob-summary-lbl" style={{ color: done ? 'var(--ink)' : 'var(--dim)' }}>{lbl}</div>
                </div>
              ))}
            </div>

            <button className="ob-next" style={{ width: '100%', padding: '14px 0' }} onClick={onComplete}>Open Press</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── SETTINGS OVERLAY ─────────────────────────────────────────────────────────
// Home-screen panel order/visibility, and Recovery tab order/visibility —
// both stored on the profile (panelOrder/hiddenPanels,
// recoveryTabOrder/hiddenRecoveryTabs) and consumed by App()/S5. Defaults
// here double as the fallback when a profile has never set a preference.
const DEFAULT_PANEL_ORDER = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
const PANEL_LABELS = { s1: 'Dispatch', s2: 'Sleep', s3: 'Training', s4: 'Nutrition', s5: 'Recovery', s6: 'Body & Supplements', s7: 'Personal Records' };
const DEFAULT_RECOVERY_TAB_ORDER = ['fatigue', 'ranking', 'types', 'adaptation', 'soreness', 'injuries'];
const RECOVERY_TAB_LABELS = { fatigue: 'Structural', ranking: 'Ranking', types: 'Types', adaptation: 'Adaptation', soreness: 'Soreness', injuries: 'Injuries' };

function PanelOrderEditor({ order, hidden, labels, onChange }) {
  const move = (id, dir) => {
    const idx = order.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = [...order];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next, hidden);
  };
  const toggleHidden = id => onChange(order, hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {order.map((id, i) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--paper2)', opacity: hidden.includes(id) ? 0.45 : 1 }}>
          <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{labels[id] || id}</span>
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${labels[id]} up`}>↑</button>
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }} disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${labels[id]} down`}>↓</button>
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 9, padding: '5px 10px', minWidth: 48 }} onClick={() => toggleHidden(id)}>{hidden.includes(id) ? 'Show' : 'Hide'}</button>
        </div>
      ))}
    </div>
  );
}

function SettingsOverlay({ s, onClose, refresh, onSignOut, onOpenImport, onOpenWiki, setBriefing }) {
  const [nameVal, setNameVal] = useState(s?.profile?.name || '');
  const [trainingExpVal, setTrainingExpVal] = useState(s?.profile?.trainingExperienceYears ?? '');
  const [sleepTarget, setSleepTarget] = useState(s?.profile?.sleepTarget || 8);
  const [waterTarget, setWaterTarget] = useState(s?.profile?.waterTarget || 7);
  const [trainingDays, setTrainingDays] = useState(s?.profile?.trainingDaysPerWeek || 4);
  const [trackingLevel, setTrackingLevel] = useState(s?.profile?.trackingLevel || 'full');
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [stravaStarted, setStravaStarted] = useState(false);
  const [hevyKeyMode, setHevyKeyMode] = useState(null);
  const [hevyKeyVal, setHevyKeyVal] = useState('');
  const [hevyKeySaved, setHevyKeySaved] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [mergeStatus, setMergeStatus] = useState('');
  const [merging, setMerging] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppDose, setNewSuppDose] = useState('');
  const [newSuppTiming, setNewSuppTiming] = useState('morning');
  const [savingSupp, setSavingSupp] = useState(false);
  const [sensMuscle, setSensMuscle] = useState(ALL_MUSCLES[0]);
  const [sensValue, setSensValue] = useState('1.0');
  const [savingSens, setSavingSens] = useState(false);
  const [panelOrder, setPanelOrder] = useState(s?.profile?.panelOrder?.length ? s.profile.panelOrder : DEFAULT_PANEL_ORDER);
  const [hiddenPanels, setHiddenPanels] = useState(s?.profile?.hiddenPanels || []);
  const [recoveryTabOrder, setRecoveryTabOrder] = useState(s?.profile?.recoveryTabOrder?.length ? s.profile.recoveryTabOrder : DEFAULT_RECOVERY_TAB_ORDER);
  const [hiddenRecoveryTabs, setHiddenRecoveryTabs] = useState(s?.profile?.hiddenRecoveryTabs || []);

  const savePanels = async (order, hidden) => {
    setPanelOrder(order); setHiddenPanels(hidden);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ panelOrder: order, hiddenPanels: hidden }) });
    refresh({ ...s, profile });
  };
  const saveRecoveryTabs = async (order, hidden) => {
    setRecoveryTabOrder(order); setHiddenRecoveryTabs(hidden);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ recoveryTabOrder: order, hiddenRecoveryTabs: hidden }) });
    refresh({ ...s, profile });
  };

  const SHORTCUT_URL = `${API_BASE}/shortcut`;
  const [syncUrl, setSyncUrl] = useState(SHORTCUT_URL);
  const [guideAdvanced, setGuideAdvanced] = useState(false);
  const openHealthGuide = () => {
    setHealthGuideOpen(v => {
      const next = !v;
      if (next && syncUrl === SHORTCUT_URL) {
        api('sync-token', { method: 'POST' }).then(({ token }) => {
          if (token) setSyncUrl(`${SHORTCUT_URL}?token=${token}`);
        }).catch(() => {});
      }
      return next;
    });
  };
  const supplements = s?.supplements || [];
  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' };

  const saveLevel = async (level) => {
    setTrackingLevel(level);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ trackingLevel: level }) });
    refresh({ ...s, profile });
  };

  const saveTargets = async () => {
    setSavingTargets(true);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ sleepTarget, waterTarget, trainingDaysPerWeek: trainingDays }) });
    setSavingTargets(false);
    refresh({ ...s, profile });
  };

  const addSupplement = async () => {
    if (!newSuppName.trim()) return;
    setSavingSupp(true);
    const name = newSuppName.trim(), dose = newSuppDose.trim(), timing = newSuppTiming;
    await api('supplements', { method: 'POST', body: JSON.stringify({ name, dose, timing }) });
    setNewSuppName(''); setNewSuppDose('');
    setSavingSupp(false);
    const entry = { name, dose, timing, notes: '' };
    const existing = supplements.findIndex(sp => sp.name.toLowerCase() === name.toLowerCase());
    const nextSupplements = existing >= 0 ? supplements.map((sp, i) => i === existing ? entry : sp) : [...supplements, entry];
    refresh({ ...s, supplements: nextSupplements });
  };

  const deleteSupp = async (name) => {
    await api(`supplements/${encodeURIComponent(name)}`, { method: 'DELETE' });
    refresh({ ...s, supplements: supplements.filter(sp => sp.name !== name) });
  };

  const setMuscleSensitivity = async (muscle, value) => {
    setSavingSens(true);
    await api('muscle-sensitivity', { method: 'PUT', body: JSON.stringify({ muscle, value }) });
    setSavingSens(false);
    refresh({ ...s, muscleSensitivity: { ...(s?.muscleSensitivity || {}), [muscle]: value } });
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm !== 'granted') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await api('push/vapid-public-key');
      if (!keyRes.key) return;
      const urlBase64ToUint8Array = b64 => {
        const padding = '='.repeat((4 - b64.length % 4) % 4);
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
      };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.key),
      });
      await api('push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
    } catch {}
  };

  return (
    <div className="settings-overlay">
      <div className="settings-hdr">
        <div className="settings-hdr-title">Settings</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-body">

        {/* ── PROFILE ── */}
        <div className="settings-sec">
          <div className="settings-sh">Profile</div>
          <div className="prof-field">
            <span className="prof-lbl">Name</span>
            <input className="prof-input" value={nameVal} onChange={e => setNameVal(e.target.value)}
              onBlur={() => nameVal !== (s?.profile?.name || '') && api('profile', { method: 'POST', body: JSON.stringify({ name: nameVal }) }).then(profile => refresh({ ...s, profile }))}
              placeholder="Your name" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Goal</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['cut','recomp','bulk'].map(g => (
                <button key={g} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, macroGoal: g });
                    api('macro-auto', { method: 'POST', body: JSON.stringify({ goal: g }) }).then(data => refresh({ ...s, macroGoal: data.goal, macroTargets: data.targets, macroMode: 'auto' }));
                  }}
                  style={{ textTransform: 'capitalize', ...(s?.macroGoal === g ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Sex <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(for strength standards)</span></span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['male','female'].map(sx => (
                <button key={sx} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, sex: sx } });
                    api('profile', { method: 'POST', body: JSON.stringify({ sex: sx }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ textTransform: 'capitalize', ...(s?.profile?.sex === sx ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {sx}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Training Priority <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(shapes weekly guidance)</span></span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['strength','cardio','sport'].map(p => (
                <button key={p} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, trainingPriority: p } });
                    api('profile', { method: 'POST', body: JSON.stringify({ trainingPriority: p }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ textTransform: 'capitalize', ...((s?.profile?.trainingPriority || 'strength') === p ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Training Experience <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(years — used for recovery pacing)</span></span>
            <input className="prof-input" type="number" min="0" step="0.5" inputMode="decimal"
              value={trainingExpVal} onChange={e => setTrainingExpVal(e.target.value)}
              onBlur={() => {
                const v = trainingExpVal === '' ? null : parseFloat(trainingExpVal);
                if (v !== (s?.profile?.trainingExperienceYears ?? null)) {
                  api('profile', { method: 'POST', body: JSON.stringify({ trainingExperienceYears: v }) }).then(profile => refresh({ ...s, profile }));
                }
              }}
              placeholder="e.g. 2" style={{ flex: 1, minWidth: 0, maxWidth: 80 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Dark Mode</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['off', false], ['on', true]].map(([label, val]) => (
                <button key={label} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, darkMode: val } });
                    api('profile', { method: 'POST', body: JSON.stringify({ darkMode: val }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ textTransform: 'capitalize', ...(!!s?.profile?.darkMode === val ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── TRACKING LEVEL ── */}
        <div className="settings-sec">
          <div className="settings-sh">Tracking Level</div>
          {ECHELONS.map(e => (
            <button key={e.key} className={`echelon-card${trackingLevel === e.key ? ' selected' : ''}`}
              onClick={() => saveLevel(e.key)}>
              <div className="echelon-card-dot" />
              <div style={{ flex: 1 }}>
                <div className="echelon-card-title">{e.title}</div>
                <div className="echelon-card-desc">{e.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── LAYOUT ── */}
        <div className="settings-sec">
          <div className="settings-sh">Home Screen Order</div>
          <PanelOrderEditor order={panelOrder} hidden={hiddenPanels} labels={PANEL_LABELS} onChange={savePanels} />
        </div>

        <div className="settings-sec">
          <div className="settings-sh">Recovery Tab Order</div>
          <PanelOrderEditor order={recoveryTabOrder} hidden={hiddenRecoveryTabs} labels={RECOVERY_TAB_LABELS} onChange={saveRecoveryTabs} />
        </div>

        {/* ── TARGETS ── */}
        <div className="settings-sec">
          <div className="settings-sh">Targets</div>
          {[
            ['Sleep Target', sleepTarget, v => setSleepTarget(v), .5, 5, 12, v => `${v}h`],
            ['Water Target', waterTarget, v => setWaterTarget(v), 1, 2, 16, v => `${v} gl`],
            ['Training Days / Week', trainingDays, v => setTrainingDays(v), 1, 1, 7, v => `${v} days`],
          ].map(([label, val, set, step, min, max, fmt]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label className="ob-label" style={{ marginTop: 0 }}>{label}</label>
              <div className="ob-stepper" style={{ margin: '8px 0' }}>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.max(min, parseFloat((v - step).toFixed(1))))}>−</button>
                <div className="ob-stepper-val">{fmt(val)}</div>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.min(max, parseFloat((v + step).toFixed(1))))}>+</button>
              </div>
            </div>
          ))}
          <button className="prof-btn solid" style={{ padding: '7px 20px' }}
            onClick={saveTargets} disabled={savingTargets}>
            {savingTargets ? 'Saving…' : 'Save Targets'}
          </button>
        </div>

        {/* ── NUTRITION ── */}
        <div className="settings-sec">
          <div className="settings-sh">Nutrition</div>
          <div className="prof-field">
            <span className="prof-lbl">Exact Calories <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(default: nearest 300)</span></span>
            <button className="prof-btn" onClick={() => {
                const exactCalories = !s?.profile?.exactCalories;
                refresh({ ...s, profile: { ...s.profile, exactCalories } });
                api('profile', { method: 'POST', body: JSON.stringify({ exactCalories }) });
              }}
              style={s?.profile?.exactCalories ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
              {s?.profile?.exactCalories ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* ── CONNECTED SERVICES ── */}
        <div className="settings-sec">
          <div className="settings-sh">Connected Services</div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Apple Health</div>
                <div className="ob-svc-desc">Stream sleep, HRV, steps, and heart rate from your iPhone</div>
              </div>
              <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={openHealthGuide}>
                {healthGuideOpen ? 'Hide' : 'Setup'}
              </button>
            </div>
            {healthGuideOpen && (
              <div className="ob-guide">
                <a href="https://www.icloud.com/shortcuts/e1a3c6dea8854f10a8b431a185c7c17d" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: 'var(--gold)' }}>
                  Install the pre-built Shortcut →
                </a>
                Your personal sync link — after installing, open the Shortcut and make sure its URL matches this (replace it if it doesn't), so your data lands in your own account:
                <div className="ob-copy-url" onClick={() => navigator.clipboard?.writeText(syncUrl).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); })}>
                  <span>{syncUrl}</span>
                  <button>{urlCopied ? 'Copied!' : 'Copy'}</button>
                </div>
                <button onClick={() => setGuideAdvanced(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                  {guideAdvanced ? '− Hide' : '+ Show'} manual build / sharing with others / unsupported sensors
                </button>
                {guideAdvanced && (
                  <div style={{ marginTop: 10 }}>
                    <strong>No Blood Oxygen or Wrist Temperature on your Watch?</strong> Apple Watch SE has neither sensor, and Wrist Temperature needs Series 8+/Ultra — "Find Health Samples" errors on a type your device doesn't support (it doesn't just return empty), so just delete those two blocks from your own copy of the Shortcut. Everything else (HR, HRV, RHR, Steps, Sleep) works on every Watch and the iPhone alone.<br /><br />
                    <strong>Sharing this with someone else?</strong> Add these steps to the top of the Shortcut so it asks for their URL once and remembers it automatically, instead of everyone needing to manually edit it:<br />
                    <strong>a.</strong> Add <strong>Get File</strong> (iCloud Drive → Shortcuts folder → <code>press-sync-url.txt</code>), with "Error if Not Found" turned off — this file won't exist the first time<br />
                    <strong>b.</strong> Add an <strong>If</strong> checking whether that result has any value<br />
                    <strong>c.</strong> If yes → set variable <code>syncUrl</code> to the file's contents<br />
                    <strong>d.</strong> Otherwise → <strong>Ask for Input</strong> ("Paste your Press sync URL"), set <code>syncUrl</code> to the answer, then <strong>Save File</strong> it back to the same <code>press-sync-url.txt</code> path so every future run finds it already there<br />
                    <strong>e.</strong> Use <code>syncUrl</code> (not typed text) as the URL in Get Contents of URL<br /><br />
                    Or build it yourself from scratch:<br />
                    <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                    <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                    <strong>3.</strong> Trigger: <strong>Daily</strong> — set up <strong>three</strong> automations (duplicate this one twice), one each in the morning, afternoon, and night, so your data is fresh for each of Press's Morning Briefing, Mid-Day Update, and Tonight's Report<br />
                    <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                    <strong>5.</strong> URL — the same personal link shown above<br />
                    <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                    <strong>7.</strong> Add a Dictionary with: <code>hr_values</code>/<code>hr_dates</code>, <code>rhr_values</code>/<code>rhr_dates</code>, <code>hrv_values</code>/<code>hrv_dates</code>, <code>bloodoxygen_values</code>/<code>bloodoxygen_dates</code>, <code>steps_values</code>/<code>steps_dates</code>, <code>wrist_values</code>/<code>wrist_dates</code>, and <code>sleep_start</code>/<code>sleep_end</code>/<code>sleep_types</code><br />
                    <strong>8.</strong> Each pair comes from its own "Find Health Samples" block — Value+Start Date for the first six, Start Date+End Date+Type for Sleep
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Strava</div>
                <div className="ob-svc-desc">Import runs, rides, and activities automatically</div>
              </div>
              <button className={`ob-svc-btn${stravaStarted ? ' done' : ''}`}
                onClick={() => { setStravaStarted(true); window.open(`${API_BASE}/strava/auth`, '_blank'); }}>
                {stravaStarted ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Hevy</div>
                <div className="ob-svc-desc">Import your lifting history from Hevy</div>
              </div>
            </div>
            <div className="ob-hevy-modes">
              <button className="ob-svc-btn" onClick={() => { onOpenImport(); onClose(); }}>Import CSV</button>
              <button className={`ob-svc-btn${hevyKeyMode === 'api' ? ' done' : ''}`}
                onClick={() => setHevyKeyMode(m => m === 'api' ? null : 'api')}>API Key</button>
            </div>
            {hevyKeyMode === 'api' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={{ ...inputStyle, flex: 1, width: 'auto', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}
                  placeholder="Hevy API key…" value={hevyKeyVal} onChange={e => setHevyKeyVal(e.target.value)} />
                <button className="ob-svc-btn"
                  style={hevyKeySaved ? { background: 'var(--forest)', borderColor: 'var(--forest)', color: 'var(--paper)' } : {}}
                  onClick={async () => {
                    if (!hevyKeyVal.trim()) return;
                    await api('hevy/key', { method: 'POST', body: JSON.stringify({ key: hevyKeyVal.trim() }) }).catch(() => {});
                    setHevyKeySaved(true);
                  }}>{hevyKeySaved ? 'Saved' : 'Save'}</button>
              </div>
            )}
          </div>
        </div>

        {/* ── SUPPLEMENT STACK ── */}
        <div className="settings-sec">
          <div className="settings-sh">Supplement Stack</div>
          {supplements.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {supplements.map(sup => (
                <div key={sup.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{sup.name}</div>
                    {(sup.dose || sup.timing) && (
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1 }}>{[sup.dose, sup.timing].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <button onClick={() => deleteSupp(sup.name)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '4px 8px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input style={inputStyle} placeholder="Supplement name" value={newSuppName} onChange={e => setNewSuppName(e.target.value)} />
            <input style={inputStyle} placeholder="Dose (optional)" value={newSuppDose} onChange={e => setNewSuppDose(e.target.value)} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['morning','evening','pre-workout','post-workout'].map(t => (
                <button key={t} className={`prof-btn${newSuppTiming === t ? ' solid' : ''}`} onClick={() => setNewSuppTiming(t)}
                  style={{ fontSize: 8, padding: '4px 8px', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            <button className="prof-btn solid" style={{ alignSelf: 'flex-start', padding: '7px 20px' }}
              onClick={addSupplement} disabled={savingSupp || !newSuppName.trim()}>
              {savingSupp ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>

        {/* ── MUSCLE SENSITIVITY ── */}
        <div className="settings-sec">
          <div className="settings-sh">Muscle Sensitivity</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            Fatigue tracking auto-tunes per muscle from soreness logs. Override a muscle directly here if it's drifted wrong — 1.0 is neutral, higher means it fatigues faster than average.
          </div>
          {Object.entries(s?.muscleSensitivity || {}).filter(([, v]) => v !== 1.0).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {Object.entries(s?.muscleSensitivity || {}).filter(([, v]) => v !== 1.0).map(([muscle, value]) => (
                <div key={muscle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', textTransform: 'capitalize' }}>{muscle} — {value.toFixed(2)}×</div>
                  <button onClick={() => setMuscleSensitivity(muscle, 1.0)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '4px 8px' }}>Reset</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={sensMuscle} onChange={e => setSensMuscle(e.target.value)}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '7px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textTransform: 'capitalize' }}>
              {ALL_MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" min="0.3" max="3.0" step="0.1" value={sensValue} onChange={e => setSensValue(e.target.value)}
              style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '7px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
            <button className="prof-btn solid" style={{ padding: '7px 16px' }}
              onClick={() => setMuscleSensitivity(sensMuscle, +sensValue)} disabled={savingSens || !sensValue}>
              {savingSens ? 'Saving…' : 'Set'}
            </button>
          </div>
        </div>

        {/* ── APP ── */}
        <div className="settings-sec">
          <div className="settings-sh">App</div>
          <div className="prof-field" style={{ marginBottom: 14 }}>
            <span className="prof-lbl">Morning Briefing</span>
            <button className="prof-btn" style={{ padding: '5px 14px' }}
              onClick={async () => {
                setRegenLoading(true);
                const r = await api('briefing/generate', { method: 'POST' }).catch(() => null);
                if (r?.briefing) setBriefing(r.briefing);
                setRegenLoading(false);
              }} disabled={regenLoading}>
              {regenLoading ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          <div className="prof-field" style={{ marginBottom: 14 }}>
            <span className="prof-lbl">Push Notifications</span>
            {notifPermission === 'granted'
              ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--forest)' }}>Enabled</span>
              : notifPermission === 'unsupported'
              ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Not supported</span>
              : <button className="prof-btn" style={{ padding: '5px 14px' }} onClick={enableNotifications}>Enable</button>
            }
          </div>
          {s?.profile?.travelMode && (
            <div className="prof-field">
              <span className="prof-lbl">Travel Mode</span>
              <button className="prof-btn" onClick={() => {
                  refresh({ ...s, profile: { ...s.profile, travelMode: false }, travelMode: false });
                  api('profile', { method: 'POST', body: JSON.stringify({ travelMode: false }) });
                }}>Disable</button>
            </div>
          )}
        </div>

        {/* ── DATA EXPORT ── */}
        <div className="settings-sec">
          <div className="settings-sh">Data Export</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            Download your data as CSV, readable in Excel, Numbers, Sheets, or any spreadsheet tool.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['lifts','Lifts'],['workouts','Workouts'],['weight','Weight'],['metrics','Health Metrics'],['nutrition','Nutrition Log'],['measurements','Measurements']].map(([type, label]) => (
              <button key={type} className="prof-btn" style={{ fontSize: 9, padding: '6px 10px' }}
                onClick={async () => {
                  const r = await authFetch(`${API_BASE}/export/csv?type=${type}`);
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `press-${type}.csv`; a.click();
                  URL.revokeObjectURL(url);
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── MERGE EXERCISES ── */}
        <div className="settings-sec">
          <div className="settings-sh">Merge Exercises</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            For two entries that are really the same exercise but got logged under different names (a typo, or an import source that didn't match) — folds all history from the first into the second.
          </div>
          <datalist id="merge-exercise-options">
            {[...new Set([...(s?.lifts || []).map(l => l.exercise), ...BASE_EXERCISES])].sort().map(n => <option key={n} value={n} />)}
          </datalist>
          <div className="prof-field">
            <span className="prof-lbl">Merge from</span>
            <input className="prof-input" list="merge-exercise-options" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} placeholder="e.g. bench press (barbell)" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Into</span>
            <input className="prof-input" list="merge-exercise-options" value={mergeTo} onChange={e => setMergeTo(e.target.value)} placeholder="e.g. Barbell Bench Press" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <button className="prof-btn solid" style={{ marginTop: 8 }} disabled={!mergeFrom.trim() || !mergeTo.trim() || merging}
            onClick={async () => {
              setMerging(true); setMergeStatus('');
              const res = await api('exercises/merge', { method: 'POST', body: JSON.stringify({ from: mergeFrom.trim(), to: mergeTo.trim() }) });
              setMerging(false);
              if (res.error) { setMergeStatus(res.error); return; }
              setMergeStatus(`Merged ${res.mergedSets} set${res.mergedSets === 1 ? '' : 's'} into "${mergeTo.trim()}".`);
              setMergeFrom(''); setMergeTo('');
              api('summary').then(refresh);
            }}>
            {merging ? 'Merging…' : 'Merge'}
          </button>
          {mergeStatus && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 8 }}>{mergeStatus}</div>}
        </div>

        {/* ── WIKI ── */}
        <div className="settings-sec">
          <div className="settings-sh">Learn</div>
          <button className="settings-open-btn" onClick={onOpenWiki}>
            <span>Exercise & Training Wiki</span><span>→</span>
          </button>
        </div>

        {/* ── ACCOUNT ── */}
        <div className="settings-sec">
          <div className="settings-sh">Account</div>
          <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 4 }} onClick={onSignOut}>Sign Out</button>
        </div>

        {/* ── WHAT'S NEW ── */}
        <div className="settings-sec">
          <div className="settings-sh">v{CHANGELOG[0].version} · What's New</div>
          {CHANGELOG.map(entry => (
            <div key={entry.version} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>
                v{entry.version} — {localDateFromYMD(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "'Times New Roman',serif", fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                {entry.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── MENTOR CHAT ───────────────────────────────────────────────────────────────
// Plain-language explanations matching this app's own training philosophy
// (TRAINING_ETHOS, functions/index.js) — not generic fitness content, since
// several mainstream conventions (deload weeks, RPE-only without a rep
// range) don't apply the way Press actually works.
const WIKI_CONCEPTS = [
  {
    term: 'RIR (Reps in Reserve)',
    plain: 'How many more reps you could have done before failing. RIR 2 means you stopped with 2 good reps left in the tank.',
    detail: 'This app plans sets around a target RIR, decreasing set to set — the first working set leaves more in reserve, the last set lands at RIR 0-1 (true or near-true failure). This is the primary lever the app uses, not RPE.',
  },
  {
    term: 'RPE (Rate of Perceived Exertion)',
    plain: 'The same idea as RIR, flipped: a 0-10 scale of how hard a set felt, where 10 = true failure. RPE 10 = RIR 0, RPE 8 = RIR 2, and so on.',
    detail: 'The app converts between the two internally (RIR ≈ 10 − RPE). If you\'re new to training, Effort logging shows Easy / Medium / Failure instead of a number — those map to RPE 6 / 8 / 10.',
  },
  {
    term: 'Mechanical Tension',
    plain: 'The force a muscle produces against resistance through a real range of motion — the main thing that actually drives strength and muscle growth.',
    detail: 'This is why the app heavily favors exercises with a normal, progressively-loadable range of motion, and disincentivizes isometric holds (planks, static presses) — a static hold doesn\'t give the app\'s progressive-overload system (adding weight or reps over time) anything to work with.',
  },
  {
    term: 'Double Progression',
    plain: 'Climb reps to the top of your target rep range first, then add weight and drop back to the bottom of the range.',
    detail: 'e.g. target range 6-9 reps: once you hit 9 reps at a given weight, the app suggests adding weight next session and dropping back to ~6 reps, then climbing again.',
  },
  {
    term: 'Structural Fatigue',
    plain: 'Mechanical tissue damage from training — decays over 48-72 hours per muscle. This is what makes a muscle feel "not ready" the day after a hard session.',
    detail: 'Distinct from metabolic fatigue (glycogen depletion, ~12h half-life) and CNS fatigue (nervous system load from heavy compounds, ~36h half-life) — the app tracks all three separately since they recover at different rates.',
  },
  {
    term: 'Stimulus / Adaptation',
    plain: 'How much productive training effect is currently "banked" for a muscle from recent sessions — separate from fatigue. A muscle can be fatigued and well-stimulated at the same time, or fresh and under-stimulated.',
    detail: 'Each session contributes a rise-and-decay curve that peaks about 48 hours later; several sessions in a week stack together. Left untouched for long enough, this decays toward atrophy — the Adaptation tab shows this per muscle.',
  },
  {
    term: 'Frequency over Volume',
    plain: 'This app\'s core training philosophy: fewer working sets per session, spread more often across the week, rather than a few huge sessions.',
    detail: 'Full-body sessions 2-4x/week are the default shape, not a body-part split. If your logged history leans toward low reps-per-session but high frequency, the app is designed to recognize that as correctly-dosed, not under-dosed.',
  },
  {
    term: 'Why no "deload weeks"',
    plain: 'Press doesn\'t suggest scheduled deload weeks.',
    detail: 'Every generated session is already calibrated against your live fatigue numbers, so volume and exercise selection back off automatically as fatigue accumulates — a blunt whole-week deload on top of that would be redundant.',
  },
];

function WikiOverlay({ onClose }) {
  const [tab, setTab] = useState('concepts');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const exercises = q
    ? EXERCISE_DB.filter(e => (EXERCISE_SEARCH_TAGS.get(e.name.toLowerCase()) || '').includes(q) || e.name.toLowerCase().includes(q))
    : EXERCISE_DB;

  return (
    <div className="settings-overlay">
      <div className="settings-hdr">
        <div className="settings-hdr-title">Wiki</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-body">
        <div className="fade tab-bar" style={{ flexShrink: 0, marginBottom: 12 }}>
          <button className={`tab-btn${tab === 'concepts' ? ' active' : ''}`} onClick={() => setTab('concepts')}>Concepts</button>
          <button className={`tab-btn${tab === 'exercises' ? ' active' : ''}`} onClick={() => setTab('exercises')}>Exercises</button>
        </div>

        {tab === 'concepts' && WIKI_CONCEPTS.map(c => (
          <div key={c.term} className="settings-sec" style={{ paddingTop: 12 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{c.term}</div>
            <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{c.plain}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }}>{c.detail}</div>
          </div>
        ))}

        {tab === 'exercises' && (
          <>
            <input className="pr-search" placeholder="Search exercises or muscles…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>{exercises.length} exercise{exercises.length === 1 ? '' : 's'}</div>
            {exercises.slice(0, 60).map(e => (
              <div key={e.id} style={{ borderBottom: '1px solid var(--rule)', padding: '10px 0' }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize', marginBottom: 4 }}>
                  {e.equipment} · {[...e.primary].join(', ')}{e.secondary?.length ? ` (+ ${e.secondary.join(', ')})` : ''}
                </div>
                {e.form?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 18px', fontFamily: "'Times New Roman',serif", fontSize: 12, lineHeight: 1.6, color: 'var(--ink)' }}>
                    {e.form.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {exercises.length > 60 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', padding: '10px 0' }}>Showing first 60 — narrow your search to see more.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function MentorChat({ onClose }) {
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: 'I\'m your Personal Journalist. Ask me anything about your training, recovery, or nutrition.' }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    const newMsgs = [...msgs, { role: 'user', content: text }];
    setMsgs(newMsgs);
    setInput('');
    setThinking(true);
    try {
      const data = await Promise.race([
        api('mentor', {
          method: 'POST',
          body: JSON.stringify({ messages: newMsgs.filter(m => m.role !== 'assistant' || newMsgs.indexOf(m) > 0).map(m => ({ role: m.role, content: m.content })) }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
      ]);
      setMsgs(p => [...p, { role: 'assistant', content: data.reply || 'No reply.' }]);
    } catch {
      setMsgs(p => [...p, { role: 'assistant', content: 'Connection error — try again.' }]);
    }
    setThinking(false);
  };

  return (
    <div className="chat-panel">
      <div className="chat-hdr">
        <div>
          <div className="kicker" style={{ margin: 0 }}>Your Personal Journalist</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--dim)' }}>×</button>
      </div>
      <div className="chat-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'chat-msg-user' : 'chat-msg-asst'}>
            {m.content}
          </div>
        ))}
        {thinking && <div className="chat-msg-thinking">Personal Journalist is thinking…</div>}
        <div ref={msgsEndRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Ask your personal journalist…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={thinking}
        />
        <button className="chat-send" onClick={send} disabled={thinking || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

// ── NEWSCAST OVERLAY ─────────────────────────────────────────────────────────
function NewscastOverlay({ newscast, onClose }) {
  const period = newscast?.period;
  const label = period === 'afternoon' ? 'Mid-Day Update' : period === 'week' ? 'Weekly Review' : "Tonight's Report";
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const numbers = newscast?.bullets?.numbers || [];

  return (
    <div className="briefing-overlay">
      <div className="briefing-hdr">
        <div>
          <div className="briefing-masthead">THE PRESS</div>
          <div className="briefing-edition">{label} · {dateStr}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--paper)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>Close ×</button>
      </div>
      <div className="briefing-body">
        <div className="briefing-top">
          <div className="briefing-headline">{newscast?.headline || label.toUpperCase()}</div>
          <div className="briefing-sub">{newscast?.subheading}</div>
        </div>
        <div className="briefing-columns">
          {numbers.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-kicker">At a Glance</div>
              <div className="briefing-stat-grid">
                {numbers.map((n, i) => (
                  <div key={i} className="briefing-stat">
                    <div className="briefing-stat-val">{n.value}</div>
                    <div className="briefing-stat-lbl">{n.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newscast?.pullQuote && (
            <div className="briefing-section"><div className="briefing-pull">{newscast.pullQuote}</div></div>
          )}

          <div className="briefing-section">
            <div className="briefing-byline">V</div>
            <div className="briefing-byline-role">Health &amp; Performance</div>
            <div className="briefing-prose">{newscast?.v}</div>
          </div>

          {newscast?.atlas && (
            <div className="briefing-section">
              <div className="briefing-byline">Atlas</div>
              <div className="briefing-byline-role">Training</div>
              <div className="briefing-prose">{newscast.atlas}</div>
            </div>
          )}

          {newscast?.nutritionNote && (
            <div className="briefing-section">
              <div className="briefing-byline" style={{ borderTopColor: 'var(--gold)' }}>Fuel</div>
              <div className="briefing-byline-role">Nutrition</div>
              <div className="briefing-prose" style={{ fontStyle: 'italic', color: 'var(--gold)' }}>{newscast.nutritionNote}</div>
            </div>
          )}
        </div>
        <button className="briefing-open-btn" onClick={onClose}>Back to Press</button>
      </div>
    </div>
  );
}

// ── BRIEFING OVERLAY ─────────────────────────────────────────────────────────
function BriefingOverlay({ briefing, onClose }) {
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  const wins = briefing?.bullets?.wins || [];
  const misses = briefing?.bullets?.misses || [];
  const numbers = briefing?.bullets?.numbers || [];

  return (
    <div className="briefing-overlay">
      <div className="briefing-hdr">
        <div>
          <div className="briefing-masthead">THE PRESS</div>
          <div className="briefing-edition">Morning Edition · {dateStr}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--paper)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>Close ×</button>
      </div>

      <div className="briefing-body">
        <div className="briefing-top">
          <div className="briefing-headline">{briefing?.headline || 'YOUR MORNING BRIEFING'}</div>
          <div className="briefing-sub">{briefing?.subheading}</div>
        </div>

        <div className="briefing-columns">
          {(wins.length > 0 || misses.length > 0 || numbers.length > 0) && (
            <div className="briefing-section">
              <div className="briefing-kicker">At a Glance</div>
              {(wins.length > 0 || misses.length > 0) && (
                <div className="briefing-bullets">
                  <div>{wins.map((w, i) => <div key={i} className="briefing-win">+ {w}</div>)}</div>
                  <div>{misses.map((m, i) => <div key={i} className="briefing-miss">- {m}</div>)}</div>
                </div>
              )}
              {numbers.length > 0 && (
                <div className="briefing-stat-grid">
                  {numbers.map((n, i) => (
                    <div key={i} className="briefing-stat">
                      <div className="briefing-stat-val">{n.value}</div>
                      <div className="briefing-stat-lbl">{n.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {briefing?.pullQuote && (
            <div className="briefing-section"><div className="briefing-pull">{briefing.pullQuote}</div></div>
          )}

          <div className="briefing-section">
            <div className="briefing-byline">V</div>
            <div className="briefing-byline-role">Health &amp; Performance</div>
            <div className="briefing-prose">{briefing?.v}</div>
          </div>

          {briefing?.atlas && (
            <div className="briefing-section">
              <div className="briefing-byline">Atlas</div>
              <div className="briefing-byline-role">Training</div>
              <div className="briefing-prose">{briefing.atlas}</div>
            </div>
          )}

          {briefing?.fuel && (
            <div className="briefing-section">
              <div className="briefing-byline" style={{ borderTopColor: 'var(--gold)' }}>Fuel</div>
              <div className="briefing-byline-role">Nutrition</div>
              <div className="briefing-prose" style={{ fontStyle: 'italic' }}>{briefing.fuel}</div>
            </div>
          )}
        </div>

        <button className="briefing-open-btn" onClick={onClose}>Open Press</button>
      </div>
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>Loading…</div>
    </div>
  );
}

function LoginScreen() {
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectErr = sessionStorage.getItem('auth_redirect_error') || '';
  const [err, setErr] = useState(redirectErr ? `Google sign-in failed: ${redirectErr}` : '');
  useEffect(() => { sessionStorage.removeItem('auth_redirect_error'); }, []);


  // Called synchronously from tap — no await before signInWithPopup so iOS
  // Safari recognises it as a user-gesture and allows the popup to open.
  const google = () => {
    setErr(''); setBusy(true);
    signInWithPopup(auth, googleProvider)
      .catch(e => { setErr(e.code || e.message || 'Sign-in failed'); setBusy(false); });
  };

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (ex) {
      setErr(
        ex.code === 'auth/invalid-credential' ? 'Wrong email or password.' :
        ex.code === 'auth/email-already-in-use' ? 'Account already exists — sign in instead.' :
        ex.code === 'auth/weak-password' ? 'Password must be at least 6 characters.' :
        ex.code === 'auth/invalid-email' ? 'Invalid email address.' : ex.message
      );
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-rule" />
      <div className="auth-logo">PRESS</div>
      <div className="auth-tag">Personal Health Operating System</div>
      <div className="auth-form">
        <button className="auth-submit" onClick={google} disabled={busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#fff" fillOpacity=".75"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#fff" fillOpacity=".6"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".45"/>
          </svg>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>

        {!showEmail && (
          <div className="auth-toggle" style={{ marginTop: 16 }}>
            <span onClick={() => setShowEmail(true)}>Use email &amp; password instead</span>
          </div>
        )}

        {showEmail && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="auth-field">
              <label className="auth-lbl">Email</label>
              <input className="auth-input" type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label className="auth-lbl">Password</label>
              <input className="auth-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </div>
            <button className="auth-submit" type="submit" disabled={busy} style={{ background: 'none', color: 'var(--ink)', border: '1px solid var(--ink)' }}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <div className="auth-toggle">
              {mode === 'signin'
                ? <>New? <span onClick={() => { setMode('register'); setErr(''); }}>Create account</span></>
                : <>Have an account? <span onClick={() => { setMode('signin'); setErr(''); }}>Sign in</span></>}
            </div>
          </form>
        </>}

        {err && <div className="auth-err" style={{ marginTop: 12 }}>{err}</div>}
      </div>
      <div className="auth-rule-bottom" />
    </div>
  );
}

function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [s, setS] = useState(null);
  const [loggerPlanDay, setLoggerPlanDay] = useState(() => {
    const restored = loadActiveSession();
    return restored ? restored.planDay : undefined;
  });
  const loggerOpen = loggerPlanDay !== undefined;
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('press_onboarded'));
  const [briefing, setBriefing] = useState(null);
  const [showBriefing, setShowBriefing] = useState(false);
  const [afternoonNewscast, setAfternoonNewscast] = useState(null);
  const [nightNewscast, setNightNewscast] = useState(null);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [showAfternoonNewscast, setShowAfternoonNewscast] = useState(false);
  const [showNightNewscast, setShowNightNewscast] = useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [newscastLoading, setNewscastLoading] = useState(false);
  const [newscastError, setNewscastError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const loadSummary = () => api('summary', { throwOnError: true })
    .then(data => { setS(data); setSummaryError(''); })
    .catch(() => setSummaryError('Failed to load — check your connection and try again.'));

  const fetchNewscast = async (period) => {
    if (newscastLoading) return;
    setNewscastLoading(true);
    setNewscastError('');
    try {
      const data = await api(`newscast?period=${period}`);
      if (data.newscast) {
        if (period === 'afternoon') { setAfternoonNewscast(data.newscast); setShowAfternoonNewscast(true); }
        else { setNightNewscast(data.newscast); setShowNightNewscast(true); }
      } else {
        setNewscastError(data.error || 'Generation failed — Gemini may be overloaded. Try again in a moment.');
      }
    } catch {
      setNewscastError('Connection error — try again.');
    }
    setNewscastLoading(false);
  };

  const fetchWeeklyReview = async () => {
    if (newscastLoading) return;
    setNewscastLoading(true);
    setNewscastError('');
    try {
      const data = await api('weekly-review');
      if (data.review) { setWeeklyReview(data.review); setShowWeeklyReview(true); }
      else setNewscastError(data.error || 'Generation failed — Gemini may be overloaded. Try again in a moment.');
    } catch {
      setNewscastError('Connection error — try again.');
    }
    setNewscastLoading(false);
  };

  const handleOnboardDone = () => { localStorage.setItem('press_onboarded', '1'); setOnboarded(true); };

  // Applies the synced preference once real profile data loads, and caches it
  // so index.html's bootstrap script (which runs before this JS even loads)
  // can apply the right theme immediately on the next visit without a flash.
  // Skipped entirely while darkMode is unset (undefined, not just false) --
  // that's "never chosen yet," so whatever the bootstrap script/CSS default
  // already applied stands rather than being forced back to light.
  useEffect(() => {
    if (s?.profile?.darkMode == null) return;
    document.documentElement.dataset.theme = s.profile.darkMode ? 'dark' : 'light';
    try { localStorage.setItem('press_dark_mode', s.profile.darkMode ? '1' : '0'); } catch {}
  }, [s?.profile?.darkMode]);

  useEffect(() => {
    getRedirectResult(auth)
      .then(result => { if (result?.user) setUser(result.user); })
      .catch(e => {
        // Store error so LoginScreen can display it after redirect
        sessionStorage.setItem('auth_redirect_error', e?.code || e?.message || 'unknown');
      });
    return onAuthStateChanged(auth, u => setUser(u ?? null));
  }, []);

  const refresh = data => { if (data) setS(data); else loadSummary(); };

  useEffect(() => {
    if (user) loadSummary();
    else setS(null);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api('briefing').then(r => { if (r.briefing) setBriefing(r.briefing); }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!briefing?.date) return;
    const key = `briefing_seen_${briefing.date}`;
    if (!sessionStorage.getItem(key)) {
      setShowBriefing(true);
      sessionStorage.setItem(key, '1');
    }
  }, [briefing]);

  // Register SW silently on login (permission prompt happens via S6 button)
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [user]);

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'press-css';
    el.textContent = PRESS_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // Scrollspy: reveal each section's .fade content once it enters the viewport, and mark its
  // nav dot active while visible.
  //
  // Was keyed to [user] alone on the assumption that "the section DOM exists
  // as soon as the user is signed in" — true before the loading-screen gate
  // below (s === null && !summaryError -> <LoadingScreen/>) existed, since
  // the page used to render immediately with s still null. Now #press-scroll
  // doesn't mount until s is populated, but user was already set well before
  // that (during the LoadingScreen phase) and never changes again, so this
  // effect's first (and only) run found no #press-scroll yet, bailed via the
  // early return below, and never got a second chance to attach — no section
  // ever got .visible, so every .fade block stayed opacity:0 forever past
  // the spinner, indistinguishable from "dismissed too early." !!s flips
  // false->true exactly once on the initial load (then stays true across
  // ordinary refresh() calls, so this doesn't re-attach on every data
  // refresh) — enough to give the effect a second, now-successful run right
  // when the real page actually mounts.
  //
  // threshold was 0.35 (35% of the section's own height visible at once) — fine for
  // roughly viewport-sized sections, but S7 (All-Time Bests) grows with logged PR
  // history and easily exceeds 2500-3500px. On a mobile viewport (~700px tall) the
  // max possible visible fraction of a 3000px section is ~23%, so .visible never got
  // added and the whole section (Strength Level panel included) stayed opacity:0
  // forever — reproducible on any device short enough relative to that section's
  // height, which in practice meant mobile only. A near-zero threshold fires as soon
  // as any part of a section enters view, independent of how tall it grows.
  useEffect(() => {
    const scroll = document.getElementById('press-scroll');
    if (!scroll) return;
    const sections = [...scroll.querySelectorAll('section')];
    const dots = [...document.querySelectorAll('#sec-nav .sn-dot')];

    sections[0]?.classList.add('visible');
    dots[0]?.classList.add('active');

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const idx = sections.indexOf(e.target);
        if (e.isIntersecting) e.target.classList.add('visible');
        if (dots[idx]) dots[idx].classList.toggle('active', e.isIntersecting);
      });
    }, { threshold: 0.01 });
    sections.forEach(sec => obs.observe(sec));

    return () => obs.disconnect();
  }, [user, !!s]);

  if (user === undefined) return <LoadingScreen />;

  if (!user) return <LoginScreen />;

  // Without this, the app shell (header, tabs, sections) rendered immediately
  // with s still null, so every section showed its own empty state for the
  // ~3s /summary round trip instead of one clean loading screen. Only gates
  // the very first load — refresh()/loadSummary() calls after that update s
  // in place without ever setting it back to null, so switching tabs or
  // pulling to refresh doesn't re-trigger this.
  if (s === null && !summaryError) return <LoadingScreen />;

  const trackingLevel = s?.profile?.trackingLevel || 'full';
  const showSleep = trackingLevel !== 'workout';
  const showFuel = trackingLevel === 'full';
  const panelOrder = s?.profile?.panelOrder?.length ? s.profile.panelOrder : DEFAULT_PANEL_ORDER;
  const hiddenPanelSet = new Set(s?.profile?.hiddenPanels || []);
  // trackingLevel's own s2/s4 gating still applies on top of the user's own
  // order/hide preference — a "workout" tracking level shouldn't show Sleep
  // just because it isn't in hiddenPanels.
  const sectionIds = panelOrder.filter(id =>
    !hiddenPanelSet.has(id) && (id !== 's2' || showSleep) && (id !== 's4' || showFuel)
  );
  const sectionEls = {
    s1: <S1 key="s1" s={s} briefing={briefing} onShowBriefing={() => setShowBriefing(true)}
            onShowAfternoon={() => afternoonNewscast ? setShowAfternoonNewscast(true) : fetchNewscast('afternoon')}
            onShowNight={() => nightNewscast ? setShowNightNewscast(true) : fetchNewscast('night')}
            onShowWeekly={() => weeklyReview ? setShowWeeklyReview(true) : fetchWeeklyReview()}
            afternoonLoaded={!!afternoonNewscast} nightLoaded={!!nightNewscast} weeklyLoaded={!!weeklyReview}
            newscastLoading={newscastLoading} newscastError={newscastError} />,
    s2: <S2 key="s2" s={s} refresh={refresh} />,
    s3: <S3 key="s3" s={s} onStartWorkout={planDay => setLoggerPlanDay(planDay ?? null)} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} refresh={refresh} />,
    s4: <S4 key="s4" s={s} refresh={refresh} />,
    s5: <S5 key="s5" s={s} refresh={refresh} />,
    s6: <S6 key="s6" s={s} onOpenSettings={() => setShowSettings(true)} refresh={refresh} />,
    s7: <S7 key="s7" s={s} />,
  };

  return (
    <>
      {!onboarded && <Onboarding onComplete={handleOnboardDone} onOpenImport={() => { handleOnboardDone(); setShowImport(true); }} />}
      <Header s={s} onSignOut={() => signOut(auth)} />
      {summaryError && !s && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 16px', background: '#7a1414', color: '#f5f0e2', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.06em' }}>
          <span>{summaryError}</span>
          <button onClick={loadSummary} style={{ background: 'none', border: '1px solid rgba(245,240,226,.5)', color: '#f5f0e2', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>Retry</button>
        </div>
      )}
      <nav className="sec-nav" id="sec-nav" aria-hidden="true">
        {sectionIds.map(id => <div key={id} className="sn-dot" />)}
      </nav>
      <div className="scroll" id="press-scroll">
        {sectionIds.map(id => sectionEls[id])}
      </div>
      {/* Floating personal journalist chat bubble */}
      {!chatOpen && (
        <button className="chat-bubble" onClick={() => setChatOpen(true)} aria-label="Open personal journalist chat">PJ</button>
      )}
      {chatOpen && <MentorChat onClose={() => setChatOpen(false)} />}
      {showSettings && <SettingsOverlay s={s} onClose={() => setShowSettings(false)} refresh={refresh} onSignOut={() => signOut(auth)} onOpenImport={() => { setShowSettings(false); setShowImport(true); }} onOpenWiki={() => { setShowSettings(false); setShowWiki(true); }} setBriefing={setBriefing} />}
      {showWiki && <WikiOverlay onClose={() => setShowWiki(false)} />}
      {showBriefing && briefing && <BriefingOverlay briefing={briefing} onClose={() => setShowBriefing(false)} />}
      {showAfternoonNewscast && afternoonNewscast && <NewscastOverlay newscast={afternoonNewscast} onClose={() => setShowAfternoonNewscast(false)} />}
      {showNightNewscast && nightNewscast && <NewscastOverlay newscast={nightNewscast} onClose={() => setShowNightNewscast(false)} />}
      {showWeeklyReview && weeklyReview && <NewscastOverlay newscast={weeklyReview} onClose={() => setShowWeeklyReview(false)} />}
      {loggerOpen && (
        <WorkoutLogger
          planDay={loggerPlanDay}
          lifts={s?.lifts || []}
          customExercises={s?.customExercises || []}
          experienceLevel={s?.profile?.experienceLevel}
          onClose={() => setLoggerPlanDay(undefined)}
          refresh={setS}
        />
      )}
      {showImport && <HevyImport onClose={() => setShowImport(false)} refresh={setS} />}
      {showHistory && <WorkoutHistory s={s} onClose={() => setShowHistory(false)} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
