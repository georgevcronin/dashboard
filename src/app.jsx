import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, getRedirectResult } from 'firebase/auth';
import muscleTaxonomyPkg from '../functions/muscleTaxonomy.js';
import fatiguePkg from '../functions/fatigue.js';
import sessionPlannerPkg from '../functions/sessionPlanner.js';
import { EXERCISE_DB } from '../functions/exerciseDb.js';

// Muscle taxonomy + fatigue math + progression logic are shared with the
// backend (functions/muscleTaxonomy.js, functions/fatigue.js,
// functions/sessionPlanner.js) rather than hand-copied here — this used to be
// three independently-drifting implementations (hyphen/case mismatches,
// an 'ab'-substring collision, and 14 exercises the muscle-bucket taxonomy
// couldn't see at all). One implementation, bundled into both. EXERCISE_DB
// itself is imported separately for the session-logging autocomplete, which
// needs the full exercise name list rather than a derived lookup.
const { ALL_MUSCLES, musclesForExercise, isCompoundExercise } = muscleTaxonomyPkg;
const { computeStructuralFatigue, computeACWR, computePerformanceTrend, computeMetabolicFatigue, computeCNSFatigue, cnsLoad } = fatiguePkg;
const { progressionFor } = sessionPlannerPkg;

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
  return r.json();
};

const authFetch = async (url, opts = {}) => {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
};

// ── CSS ─────────────────────────────────────────────────────────────────────
const PRESS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=JetBrains+Mono:wght@400;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#f5f0e2;--paper2:#ede8d4;--ink:#0d0b08;--rule:#c4b898;--dim:#6b5d44;--gold:#6b5800;--navy:#1a2f54;--forest:#1a4f2a;--ember:#7a3400;--red:#7a1414;--plum:#3d2452;--hdr:72px}
html,body{height:100%;background:var(--paper)}
body{font-family:'Times New Roman',Times,Georgia,serif;color:var(--ink)}
.hdr{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--paper);border-bottom:3px solid var(--ink)}
.masthead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 20px 6px;border-bottom:1px solid var(--rule)}
.mast-left{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.mast-title{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(22px,5vw,30px);letter-spacing:-.01em;text-align:center;color:var(--ink)}
.mast-right{text-align:right;font-size:8px;letter-spacing:.12em;color:var(--dim);white-space:nowrap}
.mast-right-stack{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.mast-right-row{display:flex;gap:10px;align-items:center}
.ticker-wrap{background:var(--paper2);overflow:hidden;height:28px;display:flex;align-items:center;border-top:1px solid var(--rule)}
.ticker-track{display:flex;gap:0;animation:rtl 40s linear infinite;white-space:nowrap;will-change:transform}
.ticker-track:hover{animation-play-state:paused}
@keyframes rtl{0%{transform:translateX(0)}100%{transform:translateX(-33.333%)}}
.tick{display:inline-flex;gap:8px;align-items:center;padding:0 20px;font-size:10px;letter-spacing:.06em;border-right:1px solid var(--rule);font-family:'JetBrains Mono',monospace}
.t-sym{color:var(--rule)}.t-val{color:var(--dim)}.t-up{color:var(--forest)}.t-dn{color:var(--red)}
.scroll{padding-top:var(--hdr);column-width:440px;column-gap:0;column-rule:1px solid var(--rule)}
@media(min-width:481px){.scroll{padding-right:40px}}
section{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;overflow:visible;position:relative;border-bottom:3px solid var(--ink);padding:24px 20px 20px;display:flex;flex-direction:column}
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
.sc-num.gold{color:var(--gold)}.sc-num.navy{color:var(--navy)}.sc-num.forest{color:var(--forest)}.sc-num.red{color:var(--red)}.sc-num.plum{color:var(--plum)}
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
.sn-dot{width:5px;height:5px;border-radius:50%;background:var(--rule);transition:all .3s;pointer-events:none}
.sn-dot.active{background:var(--ink);transform:scale(2.2);box-shadow:0 0 0 4px rgba(13,11,8,.08)}
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
.auth-wrap{min-height:100svh;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px}
.auth-rule{width:100%;max-width:380px;height:3px;background:var(--ink);margin-bottom:24px}
.auth-logo{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(40px,10vw,60px);letter-spacing:-.02em;color:var(--ink);margin-bottom:4px}
.auth-tag{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-bottom:32px}
.auth-form{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px}
.auth-field{display:flex;flex-direction:column;gap:5px}
.auth-lbl{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.auth-input{font-family:'JetBrains Mono',monospace;font-size:13px;background:none;border:none;border-bottom:2px solid var(--ink);padding:6px 0;outline:none;color:var(--ink);width:100%}
.auth-input::placeholder{color:var(--rule)}
.auth-submit{margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;padding:12px;background:var(--ink);color:var(--paper);border:none;cursor:pointer;width:100%}
.auth-submit:disabled{opacity:.45;cursor:default}
.auth-toggle{font-size:10px;color:var(--dim);text-align:center;margin-top:10px;font-style:italic}
.auth-toggle span{color:var(--gold);cursor:pointer;text-decoration:underline}
.auth-err{font-size:10px;color:var(--red);font-family:'JetBrains Mono',monospace;text-align:center;border:1px solid var(--red);padding:8px}
.auth-rule-bottom{width:100%;max-width:380px;height:1px;background:var(--rule);margin-top:24px}
.tab-bar{display:flex;border-bottom:2px solid var(--ink);margin-bottom:12px;gap:0}
.tab-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;padding:7px 16px;cursor:pointer;background:none;border:none;color:var(--dim);border-bottom:2px solid transparent;margin-bottom:-2px;min-height:44px;display:flex;align-items:center}
.tab-btn.active{color:var(--ink);border-bottom-color:var(--ink)}
.muscle-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
.muscle-scroll::-webkit-scrollbar{width:3px}.muscle-scroll::-webkit-scrollbar-track{background:var(--paper2)}.muscle-scroll::-webkit-scrollbar-thumb{background:var(--rule)}
.muscle-row{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--paper2)}
.muscle-name{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);width:80px;flex-shrink:0;text-transform:capitalize}
.muscle-bar-track{flex:1;height:6px;background:var(--paper2);border-radius:1px;overflow:hidden}
.muscle-bar-fill{height:100%;border-radius:1px;transition:width .4s ease}
.muscle-pct{font-family:'JetBrains Mono',monospace;font-size:9px;width:30px;text-align:right;color:var(--dim);flex-shrink:0}
.soreness-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:4px 0}
.soreness-btn{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:capitalize;padding:7px 4px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim);position:relative;text-align:center}
.soreness-btn.has-log{border-color:var(--navy);color:var(--navy)}
.soreness-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--navy)}
.soreness-slider-wrap{background:var(--paper2);border:1px solid var(--rule);padding:10px 12px;margin-top:8px}
.prof-field{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}
.prof-lbl{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.prof-val{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink)}
.prof-input{font-family:'JetBrains Mono',monospace;font-size:12px;background:none;border:none;border-bottom:1px solid var(--ink);outline:none;color:var(--ink);width:120px;text-align:right}
.prof-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim)}
.prof-btn.solid{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.onboard-overlay{position:fixed;inset:0;z-index:9999;background:var(--paper);overflow-y:auto}
.ob-progress{position:sticky;top:0;left:0;right:0;height:2px;background:var(--rule);z-index:10}
.ob-progress-fill{height:100%;background:var(--gold);transition:width .4s ease}
.ob-wrap{max-width:480px;margin:0 auto;padding:32px 20px 60px}
.ob-step-ind{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:28px}
.ob-logo{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(48px,12vw,72px);letter-spacing:-.02em;color:var(--gold);line-height:.9;margin-bottom:10px}
.ob-sub{font-size:14px;color:var(--ink);line-height:1.6;margin-bottom:8px;font-family:'Times New Roman',serif}
.ob-lede{font-size:12px;color:var(--dim);font-style:italic;margin-bottom:32px;line-height:1.6}
.ob-h{font-family:'Playfair Display',serif;font-weight:900;font-size:26px;color:var(--ink);margin-bottom:6px;line-height:1.05}
.ob-deck{font-size:12px;color:var(--dim);font-style:italic;margin-bottom:24px;line-height:1.5}
.ob-label{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);display:block;margin-bottom:4px;margin-top:16px}
.ob-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:8px 0;background:transparent;font-family:'Times New Roman',serif;font-size:16px;outline:none;color:var(--ink);margin-bottom:4px}
.ob-input::placeholder{color:var(--rule)}
.ob-unit-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:4px}
.ob-unit-row .ob-input{flex:1;margin-bottom:0}
.ob-unit-toggle{display:flex;border:1px solid var(--rule);overflow:hidden;flex-shrink:0;height:36px}
.ob-unit-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:0 10px;border:none;background:none;cursor:pointer;color:var(--dim)}
.ob-unit-btn.active{background:var(--ink);color:var(--paper)}
.ob-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.ob-goal-card{padding:14px 12px;border:1px solid var(--rule);cursor:pointer;text-align:left;background:none;transition:all .15s}
.ob-goal-card.selected{background:var(--ink);border-color:var(--ink)}
.ob-goal-card-title{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--ink);margin-bottom:4px}
.ob-goal-card.selected .ob-goal-card-title{color:var(--paper)}
.ob-goal-card-desc{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.08em;color:var(--dim)}
.ob-goal-card.selected .ob-goal-card-desc{color:rgba(255,255,255,.6)}
.ob-stepper{display:flex;align-items:center;gap:14px}
.ob-stepper-btn{width:30px;height:30px;border:1px solid var(--rule);background:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:16px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.ob-stepper-val{font-family:'Syne',sans-serif;font-weight:800;font-size:26px;color:var(--ink);min-width:32px;text-align:center}
.ob-service-row{padding:16px 0;border-bottom:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.ob-svc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ob-svc-title{font-family:'Playfair Display',serif;font-weight:700;font-size:16px;color:var(--ink)}
.ob-svc-desc{font-size:11px;color:var(--dim);font-style:italic;margin-top:2px;line-height:1.5}
.ob-svc-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:7px 14px;border:1px solid var(--ink);background:none;color:var(--ink);cursor:pointer;white-space:nowrap;flex-shrink:0}
.ob-svc-btn.done{background:var(--forest);border-color:var(--forest);color:var(--paper)}
.ob-guide{background:var(--paper2);border-left:2px solid var(--gold);padding:12px 14px;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);line-height:2}
.ob-guide strong{color:var(--ink)}
.ob-copy-url{display:flex;align-items:center;gap:8px;margin:4px 0 8px;background:var(--paper);border:1px solid var(--rule);padding:7px 10px;cursor:pointer}
.ob-copy-url span{flex:1;font-size:9px;letter-spacing:.04em;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ob-copy-url button{font-family:'JetBrains Mono',monospace;font-size:7px;letter-spacing:.14em;text-transform:uppercase;border:none;background:none;cursor:pointer;color:var(--gold);flex-shrink:0}
.ob-hevy-modes{display:flex;gap:8px;margin-top:8px}
.ob-nav{display:flex;align-items:center;justify-content:space-between;margin-top:32px;padding-top:16px;border-top:1px solid var(--rule)}
.ob-back{background:none;border:none;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);cursor:pointer;padding:0}
.ob-next{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;padding:11px 28px;background:var(--ink);color:var(--paper);border:none;cursor:pointer}
.ob-next:disabled{opacity:.45;cursor:default}
.ob-summary-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--rule)}
.ob-summary-check{width:16px;height:16px;border-radius:50%;background:var(--forest);flex-shrink:0}
.ob-summary-check.empty{background:var(--rule)}
.ob-summary-lbl{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink);letter-spacing:.06em}
.pr-search{font-family:'JetBrains Mono',monospace;font-size:11px;background:none;border:none;border-bottom:1px solid var(--ink);outline:none;color:var(--ink);width:100%;padding:6px 0;margin-bottom:10px}
.pr-search::placeholder{color:var(--rule)}
.nutri-log-form{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-top:1px solid var(--rule)}
.nutri-log-row{display:flex;gap:6px;align-items:center}
.nutri-input{font-family:'JetBrains Mono',monospace;font-size:11px;background:none;border:none;border-bottom:1px solid var(--rule);outline:none;color:var(--ink);padding:3px 0}
.nutri-input.wide{flex:1}.nutri-input.narrow{width:52px;text-align:right}
.nutri-photo-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px 12px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim)}
.nutri-submit-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px 12px;cursor:pointer;background:var(--ink);color:var(--paper);border:none}
.chat-bubble{position:fixed;bottom:24px;right:20px;z-index:500;width:44px;height:44px;border-radius:50%;background:var(--ink);color:var(--paper);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;box-shadow:0 2px 12px rgba(0,0,0,.18)}
.chat-panel{position:fixed;right:0;top:0;bottom:0;width:min(380px,100vw);background:var(--paper);border-left:3px solid var(--ink);z-index:600;display:flex;flex-direction:column}
.chat-hdr{padding:14px 16px;border-bottom:2px solid var(--ink);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.chat-msgs{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:10px}
.chat-msg-user{align-self:flex-end;background:var(--ink);color:var(--paper);padding:8px 12px;max-width:82%;font-size:13px;line-height:1.5}
.chat-msg-asst{align-self:flex-start;background:var(--paper2);border:1px solid var(--rule);padding:8px 12px;max-width:82%;font-size:13px;line-height:1.5;color:var(--ink)}
.chat-msg-thinking{align-self:flex-start;font-size:11px;color:var(--dim);font-style:italic;font-family:'JetBrains Mono',monospace}
.chat-input-row{display:flex;border-top:2px solid var(--ink);flex-shrink:0}
.chat-input{flex:1;border:none;padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:13px;outline:none;background:var(--paper);color:var(--ink)}
.chat-send{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:0 16px;background:var(--ink);color:var(--paper);border:none;cursor:pointer;flex-shrink:0}
.hist-overlay{position:fixed;inset:0;z-index:1000;background:var(--paper);overflow-y:auto;display:flex;flex-direction:column}
.hist-row{padding:12px 0;border-bottom:1px solid var(--rule);cursor:pointer}
.hist-row-hdr{display:flex;align-items:baseline;gap:12px}
.hist-date{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim)}
.hist-name{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--ink);text-transform:capitalize}
.hist-detail{margin-top:6px;padding-left:12px}
.hist-ex{font-size:11px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-bottom:2px}
.streak-row{display:flex;gap:0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin:10px 0}
.streak-cell{flex:1;padding:8px 0;text-align:center;border-right:1px solid var(--rule)}
.streak-cell:last-child{border-right:none}
.streak-num{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;line-height:1}
.streak-lbl{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-top:2px}
.sleep-debt-bar{padding:10px 0 6px;border-left:3px solid var(--ember);padding-left:10px;margin:10px 0}
.notif-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}
.scan-preview{width:72px;height:72px;object-fit:cover;border:1px solid var(--rule);flex-shrink:0}
.scan-preview.analysing{animation:pulse-opacity 1.4s ease-in-out infinite}
@keyframes pulse-opacity{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes pulse-bar{0%,100%{opacity:.4}50%{opacity:1}}
.scan-mode-toggle{display:flex;border:1px solid var(--rule);overflow:hidden;margin-bottom:10px}
.scan-mode-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px;border:none;background:none;cursor:pointer;color:var(--dim)}
.scan-mode-btn.active{background:var(--ink);color:var(--paper)}
.cam-overlay{position:fixed;inset:0;z-index:2000;background:#000;display:flex;flex-direction:column}
.cam-video{flex:1;width:100%;object-fit:cover}
.cam-frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:240px;height:160px;border:2px solid var(--gold);box-shadow:0 0 0 9999px rgba(0,0,0,.55)}
.cam-frame::before,.cam-frame::after{content:'';position:absolute;width:20px;height:20px;border-color:var(--gold);border-style:solid}
.cam-frame::before{top:-2px;left:-2px;border-width:3px 0 0 3px}
.cam-frame::after{bottom:-2px;right:-2px;border-width:0 3px 3px 0}
.cam-lbl{position:absolute;bottom:100px;left:0;right:0;text-align:center;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.cam-close{position:absolute;top:20px;right:20px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;cursor:pointer}
.portion-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.portion-btn{width:24px;height:24px;border:1px solid var(--rule);background:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.briefing-overlay{position:fixed;inset:0;z-index:1100;background:var(--paper);display:flex;flex-direction:column;overflow-y:auto}
.briefing-hdr{background:var(--ink);color:var(--paper);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;position:sticky;top:0;z-index:1}
.briefing-masthead{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;letter-spacing:.04em}
.briefing-edition{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:rgba(245,240,226,.5)}
.briefing-body{padding:24px 20px 48px;max-width:1000px;width:100%;margin:0 auto}
.briefing-headline{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,40px);font-weight:900;color:var(--gold);line-height:1.05;text-transform:uppercase;margin-bottom:8px;break-inside:avoid}
.briefing-sub{font-family:'Times New Roman',serif;font-size:15px;font-style:italic;color:var(--ink);line-height:1.5;margin-bottom:0;break-inside:avoid}
.briefing-top{margin-bottom:16px}
.briefing-rule{border:none;border-top:1px solid var(--rule);margin:16px 0}
.briefing-columns{column-width:420px;column-gap:36px;column-rule:1px solid var(--rule)}
.briefing-section{break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:20px}
.briefing-kicker{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.briefing-bullets{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:8px}
.briefing-win{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--forest);line-height:1.6}
.briefing-miss{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ember);line-height:1.6}
.briefing-stat-grid{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:0;margin-top:10px}
.briefing-stat{border-right:1px solid var(--rule);padding:0 12px 0 0}
.briefing-stat:first-child{padding-left:0}
.briefing-stat+.briefing-stat{padding-left:12px}
.briefing-stat:last-child{border-right:none}
.briefing-stat-val{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(18px,3.5vw,24px);letter-spacing:-.02em;color:var(--ink);line-height:1}
.briefing-stat-lbl{font-family:'JetBrains Mono',monospace;font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:4px}
.briefing-pull{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(16px,3vw,20px);line-height:1.4;color:var(--dim);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:14px 0;margin:20px 0}
.briefing-byline{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);border-top:2px solid var(--ink);padding-top:8px;margin-top:0;margin-bottom:2px}
.briefing-byline-role{font-family:'JetBrains Mono',monospace;font-size:7px;color:var(--dim);margin-bottom:8px}
.briefing-prose{font-family:'Times New Roman',serif;font-size:14px;line-height:1.85;color:var(--ink)}
.briefing-open-btn{display:block;width:100%;background:var(--ink);color:var(--paper);border:none;padding:14px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;margin-top:28px;break-inside:avoid}
.briefing-preview{border-bottom:1px solid var(--rule);padding:10px 0;cursor:pointer}
.deload-banner{background:var(--ember);padding:10px 12px;margin:8px 0;border-left:3px solid var(--ink)}
.week-strip{display:flex;gap:3px;overflow-x:auto;padding:8px 0;border-top:1px solid var(--rule);margin-top:8px;scrollbar-width:none}
.week-strip::-webkit-scrollbar{display:none}
.week-day{flex:1 0 0;min-width:34px;min-height:44px;padding:6px 3px 5px;border:1px solid var(--rule);text-align:center;cursor:default;position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center}
.week-day.today{border:2px solid var(--ink)}
.week-day.has-session{background:var(--ink)}
.week-day.clickable{cursor:pointer}
.week-day-label{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.08em;color:var(--dim);margin-bottom:3px;text-transform:uppercase}
.week-day.today .week-day-label{color:var(--ink);font-weight:700}
.week-day.has-session .week-day-label{color:rgba(245,240,226,.7)}
.week-day-dot{width:5px;height:5px;background:var(--gold);border-radius:50%;margin:0 auto}
.week-day-type{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.06em;color:var(--gold);line-height:1.3;margin-top:2px}
.week-day-type.past{color:var(--rule)}
.niggle-list{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.niggle-card{padding:10px 12px;border-left:3px solid var(--ember)}
.niggle-area{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--ink);text-transform:capitalize}
.niggle-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);margin-top:2px}
.niggle-note{font-family:Times New Roman,serif;font-size:12px;color:var(--ink);margin-top:4px;font-style:italic;line-height:1.5}
.niggle-resolve{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;background:none;border:1px solid var(--rule);color:var(--dim);padding:3px 8px;cursor:pointer;margin-top:6px}
.niggle-form{margin-top:16px;padding-top:12px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.niggle-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:6px 0;background:transparent;font-family:Times New Roman,serif;font-size:14px;color:var(--ink);outline:none}
.niggle-sev{display:flex;gap:6px}
.niggle-sev-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:5px;border:1px solid var(--rule);background:none;cursor:pointer;color:var(--dim)}
.niggle-sev-btn.active{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.travel-banner{margin:0 0 14px;padding:8px 12px;background:var(--navy);color:var(--paper);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
.experiment-card{padding:10px 12px;border-left:3px solid var(--gold);margin-bottom:10px}
.experiment-h{font-family:'Playfair Display',serif;font-size:13px;font-weight:700;color:var(--ink);margin-bottom:3px}
.experiment-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);margin-bottom:4px}
.experiment-outcome{font-family:Times New Roman,serif;font-size:12px;font-style:italic;color:var(--forest);margin-top:4px}
.experiment-form{margin-top:12px;padding-top:12px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.experiment-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:6px 0;background:transparent;font-family:Times New Roman,serif;font-size:14px;color:var(--ink);outline:none}
.supp-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--rule)}
.supp-check{width:18px;height:18px;border:2px solid var(--ink);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px}
.supp-check.done{background:var(--ink);color:var(--paper)}
.supp-name{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink);flex:1;margin:0 10px}
.supp-meta{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--dim)}
.measure-row{display:flex;align-items:baseline;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--rule)}
.measure-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);letter-spacing:.06em;text-transform:uppercase;width:80px;flex-shrink:0}
.measure-val{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--ink)}
.measure-delta{font-family:'JetBrains Mono',monospace;font-size:8px;margin-left:6px}
.alcohol-row{display:flex;align-items:center;gap:8px;padding:10px 0}
.pr-group-hdr{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);padding:8px 0 4px;border-top:1px solid var(--rule);margin-top:4px}
.pr-group-hdr:first-child{border-top:none;margin-top:0}
.settings-overlay{position:fixed;inset:0;z-index:1200;background:var(--paper);display:flex;flex-direction:column;overflow:hidden}
.settings-hdr{background:var(--ink);color:var(--paper);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:sticky;top:0;z-index:1}
.settings-hdr-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;letter-spacing:-.01em}
.settings-close{background:none;border:none;color:rgba(245,240,226,.7);cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:0}
.settings-body{flex:1;overflow-y:auto;padding:0 20px 80px;-webkit-overflow-scrolling:touch}
.settings-sec{padding:20px 0 4px;border-top:2px solid var(--ink);margin-top:8px}
.settings-sec:first-child{border-top:none;margin-top:0;padding-top:20px}
.settings-sh{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-bottom:14px}
.settings-open-btn{width:100%;background:none;border:1px solid var(--ink);color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:11px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-top:12px;box-sizing:border-box}
.echelon-card{width:100%;padding:12px 14px;border:1px solid var(--rule);cursor:pointer;text-align:left;background:none;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;box-sizing:border-box}
.echelon-card.selected{border-color:var(--ink);background:rgba(0,0,0,.04)}
.echelon-card-dot{width:8px;height:8px;border-radius:50%;border:2px solid var(--rule);flex-shrink:0;margin-top:5px;transition:all .15s}
.echelon-card.selected .echelon-card-dot{border-color:var(--ink);background:var(--ink)}
.echelon-card-title{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:3px}
.echelon-card-desc{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);line-height:1.6}
@media(max-width:480px){
:root{--hdr:138px}
.masthead{grid-template-columns:1fr;row-gap:6px;text-align:center;padding:10px 14px 8px}
.mast-left{order:2}
.mast-title{order:1}
.mast-right{order:3}
.mast-right-stack{align-items:center}
.mast-right-row{justify-content:center}
.week-day{min-width:44px}
}
`;



const ECHELONS = [
  { key: 'workout', title: 'Training', desc: 'Workout logging, fatigue model, personal records, and AI-planned sessions.' },
  { key: 'workout_sleep', title: 'Training + Recovery', desc: 'Adds sleep tracking, HRV analysis, and recovery-aware planning via Apple Health.' },
  { key: 'full', title: 'Full System', desc: 'Everything — nutrition logging, macro tracking, meal photo scanning, and daily fuel briefings.' },
];

// ── HELPERS ─────────────────────────────────────────────────────────────────
const fmtDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const pct = (v, t) => (t && t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0);
// Calorie display default is approximate (nearest 300) — precision that isn't
// really there anyway for most logged food, and it's less anxiety-inducing to
// track than exact numbers. Settings > Nutrition can switch to exact.
const roundCal = (v, exact) => (v == null ? v : exact ? Math.round(v) : Math.round(v / 300) * 300);

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
  if (data?.filter(Boolean).length < 2) return null;
  const W = 320, H = 60;
  const mx = Math.max(...data) * 1.12 || 1;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
      <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--rule)" strokeWidth={1} />
      {data.map((v, i) => {
        const h = (v / mx) * H;
        return <rect key={i} x={i*bw+1.5} y={H-h} width={bw-3} height={Math.max(h,0)} fill={i===data.length-1 ? color : color+'a0'} rx={1} />;
      })}
    </svg>
  );
}

// ── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = 'var(--gold)', width = 60, height = 20 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── HEADER ──────────────────────────────────────────────────────────────────
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
    const todayStr = d.toISOString().slice(0, 10);
    if (!dates.has(todayStr)) d.setDate(d.getDate() - 1);
    while (true) {
      const k = d.toISOString().slice(0, 10);
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
  const fatigue = useMemo(() => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity), [s?.lifts, s?.soreness, s?.muscleSensitivity]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b) => a+b, 0) / fatigueVals.length) : null;
  const highFatigueMuscles = Object.values(fatigue).filter(v => v > 70).length;
  const deloadRecommended = highFatigueMuscles >= 3;
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
  const canAfternoon = hour >= 12;
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
          { label: 'Sleep',    color: '#3d2452', val: sleep,                       target: sleepTarget,   fmt: v => `${v.toFixed(1)}h`,                 tgt: `${sleepTarget}` },
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

      {deloadRecommended && (
        <div className="deload-banner fade" style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--paper)', letterSpacing: '.04em' }}>Recovery week recommended</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(245,240,226,0.75)', marginTop: 3, lineHeight: 1.5 }}>
            {highFatigueMuscles} muscle groups above 70% fatigue. Reduce load 40%, maintain reps — rebuild in 5 days.
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

const e1rm = (kg, reps) => (kg > 0 && reps > 0) ? Math.round(kg * (1 + reps / 30)) : null;
const SET_TYPES = ['W','N','D','F'];
const SET_LABELS = { W: 'Warm-up', N: 'Normal', D: 'Drop Set', F: 'Failure' };
const REST_DEFAULT = 90;
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

function WorkoutLogger({ planDay, lifts, customExercises, onClose, refresh }) {
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
  const [summary, setSummary] = useState(null);
  const [newCustomExercises, setNewCustomExercises] = useState([]);
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

  // Load exercises — use preloaded if available, otherwise fetch from AI
  useEffect(() => {
    if (!planDay) return;
    const session = planDay.sessions?.[0];
    if (!session || session.type === 'rest') { setLoading(false); return; }

    const toExercise = ex => ({
      name: ex.name.toLowerCase().trim(),
      bw: false,
      note: ex.note || '',
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
    if (!allExercises.includes(key)) {
      setNewCustomExercises(p => p.some(ce => ce.name === key) ? p : [...p, { name: key }]);
    }
    const prev = prevData[key];
    const sets = prev?.sets?.map(s => ({ type: 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rpe: '', done: false }))
      || [{ type: 'N', kg: '', reps: '', rpe: '', done: false }];
    setExercises(p => [...p, { name: key, bw: false, note: '', targetReps: 8, sets }]);
    setNewEx(''); setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 50);
    // Fetch progression note from backend (fire-and-forget)
    api(`progression/${encodeURIComponent(key)}`).then(d => {
      if (d.progression?.note) {
        setExercises(p => p.map(ex => ex.name === key && !ex.note ? { ...ex, note: d.progression.note } : ex));
      }
    }).catch(() => {});
  };

  const removeExercise = i => setExercises(p => p.filter((_, j) => j !== i));

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

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const exLifts = (lifts || []).filter(l => l.exercise === ex.name && l.date < weekAgo);
    const weekOldMax = exLifts.length ? Math.max(...exLifts.map(l => l.kg || 0)) : null;
    const weekProgressionPct = (weekOldMax && kg) ? ((kg - weekOldMax) / weekOldMax * 100) : 0;

    let feedback = null;
    let feedbackType = 'neutral';
    if (rpe !== null && rpe >= 9 && weekProgressionPct > 5) {
      feedback = 'High effort + rapid load increase — check form before adding weight';
      feedbackType = 'red';
      api(`exercises/${encodeURIComponent(ex.name.replace(/\s+/g, '-'))}`).then(d => {
        if (d.exercise?.form?.[0]) {
          setExercises(p => p.map((e, i) => i !== ei ? e : {
            ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, feedback: `${d.exercise.form[0]}`, feedbackType: 'red' })
          }));
        }
      }).catch(() => {});
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
    if (!valid.length) { onClose(); return; }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const allSets = valid.flatMap(ex => ex.sets.map(s => ({
      exercise: ex.name, kg: parseFloat(s.kg) || 0, reps: parseInt(s.reps) || 0, rpe: parseInt(s.rpe) || null,
    })));
    try {
      const r = await api('session/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workout: { name: planDay?.sessions?.[0]?.title || 'Session', date: today }, sets: allSets, customExercises: newCustomExercises }),
      });
      await api('summary').then(refresh);
      setSummary({
        name: planDay?.sessions?.[0]?.title || 'Session',
        duration: Math.round(elapsed / 60),
        setsLogged: allSets.filter(s => s.kg || s.reps).length,
        atlasSummary: r.atlasSummary,
      });
    } catch (e) {
      onClose();
    }
    setSaving(false);
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
            <button className="ol-btn ol-btn-ghost" onClick={onClose}>Discard</button>
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
            const prog = progressionFor(lifts, ex.name);
            const progression = prog?.note || null;
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
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: prog.trend === 'stalled' ? 'var(--ember)' : 'var(--forest)', marginBottom: 5 }}>
                    {progression}
                  </div>
                )}

                {/* AI-generated progression note */}
                {ex.note && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--navy)', marginBottom: 6, letterSpacing: '.04em' }}>
                    {ex.note}
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
                      <th style={{ ...th, width: 28 }}>RPE</th>
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
                              ? <input className="set-input" value={set.rpe} onChange={e => updateSet(i, j, 'rpe', e.target.value)}
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
const STRENGTH_LIFT_LABELS = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift', overheadPress: 'Overhead Press', row: 'Row' };
const STRENGTH_MUSCLE_LABELS = { chest: 'Chest', shoulders: 'Shoulders', back: 'Back', legs: 'Legs' };
const TIER_COLOR = { Untrained: 'var(--dim)', Beginner: 'var(--ember)', Novice: 'var(--gold)', Intermediate: 'var(--navy)', Advanced: 'var(--forest)', Elite: 'var(--plum)' };

function StrengthLevelPanel({ strengthLevels, hasSex }) {
  if (!hasSex) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Set your sex in Settings → Profile to unlock strength-level rankings.</div>
    </div>
  );
  const rankedLifts = Object.entries(strengthLevels?.lifts || {}).filter(([, v]) => v);
  if (!rankedLifts.length) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Log a squat, bench press, deadlift, overhead press, or row to see your tier — ranked against published bodyweight-ratio standards, Beginner→Elite.</div>
    </div>
  );
  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>All-Time Best · vs. Published Standards</div>
      {rankedLifts.map(([cat, v]) => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: 'var(--ink)' }}>{STRENGTH_LIFT_LABELS[cat]}</span>
            <span style={{ color: TIER_COLOR[v.tier] }}>{v.tier} · {v.e1RM}kg e1RM</span>
          </div>
          <div className="macro-track"><div className="macro-fill" style={{ width: `${v.score}%`, background: TIER_COLOR[v.tier] }} /></div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
            PR set {new Date(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {v.bodyweightKg}kg bodyweight — ratio {v.ratio}×
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
        {Object.entries(strengthLevels?.muscleGroups || {}).filter(([, v]) => v).map(([mg, v]) => (
          <div key={mg}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{STRENGTH_MUSCLE_LABELS[mg]}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: TIER_COLOR[v.tier] }}>{v.tier}</div>
          </div>
        ))}
      </div>
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
  const daysAgo = lastSession?.date ? Math.round((Date.now() - new Date(lastSession.date)) / 86_400_000) : null;

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
      id: data.id, hypothesis, startDate: new Date().toISOString().slice(0, 10), endDate, metric, notes: '', active: true, outcome: null, concludedAt: null,
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
      <StrengthLevelPanel strengthLevels={s?.strengthLevels} hasSex={!!s?.profile?.sex} />
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
          const todayStr = now.toISOString().slice(0, 10);
          const DOW = ['M','T','W','T','F','S','S'];
          const workoutDates = new Set(workouts.map(w => w.date));
          return (
            <div className="week-strip">
              {DOW.map((label, i) => {
                const d = new Date(monday); d.setDate(monday.getDate() + i);
                const dateStr = d.toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
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
    setPhotoPreview(previewUrl);
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
    const entry = { date: new Date().toISOString().slice(0, 10), time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), ...body };
    return { entry, nutritionToday };
  };

  const logMeal = async () => {
    if (!calories && !protein) return;
    setLogging(true);
    const { entry, nutritionToday } = await postMeal({ label, protein: +protein || 0, carbs: +carbs || 0, fat: +fat || 0, calories: +calories || 0 });
    setLabel(''); setProtein(''); setCarbs(''); setFat(''); setCalories(''); setDescription(''); setAnalysed(false);
    setLogging(false);
    refresh({ ...s, nutritionToday, nutritionLog: [...(s?.nutritionLog || []), entry] });
  };

  const logFood = async (food) => {
    const { entry, nutritionToday } = await postMeal({ label: food.name || food.label, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0, calories: food.calories || 0 });
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
                {description && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 4, lineHeight: 1.4 }}>{description}</div>}
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
                        <td>{m.label || m.name || 'Meal'}</td>
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

function S5({ s, refresh }) {
  const antRef = useRef(), latRef = useRef(), postRef = useRef();
  const [svgsReady, setSvgsReady] = useState(false);
  const [tab, setTab] = useState('fatigue');
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [sliderVal, setSliderVal] = useState(5);
  const [soreLogging, setSoreLogging] = useState(false);
  const [niggleArea, setNiggleArea] = useState('');
  const [niggleSev, setNiggleSev] = useState('mild');
  const [niggleNote, setNiggleNote] = useState('');
  const [niggleLogging, setNiggleLogging] = useState(false);

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
        <button className={`tab-btn${tab === 'fatigue' ? ' active' : ''}`} onClick={() => setTab('fatigue')}>Structural</button>
        <button className={`tab-btn${tab === 'types' ? ' active' : ''}`} onClick={() => setTab('types')}>Types</button>
        <button className={`tab-btn${tab === 'soreness' ? ' active' : ''}`} onClick={() => setTab('soreness')}>Soreness</button>
        <button className={`tab-btn${tab === 'niggles' ? ' active' : ''}`} onClick={() => setTab('niggles')}>
          Niggles{(s?.injuries?.length > 0) ? ` (${s.injuries.length})` : ''}
        </button>
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
                  {value ?? '—'}{value != null && <span style={{ fontSize: '.4em', color: 'var(--dim)', fontWeight: 700 }}>/100</span>}
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

      {tab === 'soreness' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 10 }}>
            Tap a muscle to log soreness (1–10)
          </div>
          <div className="soreness-grid" style={{ flexShrink: 0 }}>
            {SORENESS_MUSCLES.map(m => (
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

      {tab === 'niggles' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 6 }}>
            Active injuries and niggles — logged to avoid overloading affected areas
          </div>

          {/* Active niggles list */}
          {(s?.injuries || []).length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>
              No active niggles. Log any pain or restriction below.
            </div>
          )}
          <div className="niggle-list">
            {(s?.injuries || []).map(inj => (
              <div key={inj.id} className="niggle-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div className="niggle-area">{inj.area}</div>
                    <div className="niggle-meta">
                      {inj.severity} · {new Date(inj.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {inj.clearance != null && ` · ${inj.clearance >= 100 ? 'fully healed' : `day ${inj.elapsedDays}/${inj.healingDays} — ${inj.clearance}% cleared`}`}
                    </div>
                    {inj.note && <div className="niggle-note">{inj.note}</div>}
                  </div>
                  <button className="niggle-resolve" onClick={async () => {
                    await api(`injuries/${inj.id}/resolve`, { method: 'POST' });
                    refresh({ ...s, injuries: (s?.injuries || []).filter(i => i.id !== inj.id) });
                  }}>Resolved</button>
                </div>
              </div>
            ))}
          </div>

          {/* Log new niggle form */}
          <div className="niggle-form">
            <div className="kicker" style={{ margin: 0 }}>Log a Niggle</div>
            <input
              className="niggle-input"
              placeholder="Area or movement affected (e.g. left knee, shoulder flexion)…"
              value={niggleArea}
              onChange={e => setNiggleArea(e.target.value)}
            />
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Severity</div>
              <div className="niggle-sev">
                {['mild','moderate','severe'].map(sev => (
                  <button key={sev} className={`niggle-sev-btn${niggleSev === sev ? ' active' : ''}`} onClick={() => setNiggleSev(sev)}>
                    {sev}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="niggle-input"
              placeholder="Notes (optional)…"
              value={niggleNote}
              onChange={e => setNiggleNote(e.target.value)}
            />
            <button className="prof-btn solid" disabled={!niggleArea.trim() || niggleLogging}
              onClick={async () => {
                setNiggleLogging(true);
                const area = niggleArea.trim(), severity = niggleSev, note = niggleNote.trim();
                const data = await api('injury', { method: 'POST', body: JSON.stringify({ area, severity, note }) });
                setNiggleArea(''); setNiggleNote(''); setNiggleSev('mild');
                setNiggleLogging(false);
                refresh({ ...s, injuries: [...(s?.injuries || []), { id: data.id, ts: data.id, area, severity, note, muscles: [], resolved: false }] });
              }}
              style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {niggleLogging ? 'Logging…' : 'Log Niggle'}
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
    refresh({ ...s, measurements: [...(s?.measurements || []), { id: now, date: new Date().toISOString().slice(0, 10), type, value, unit, ts: now }] });
  };

  const toggleSuppLog = async (supp) => {
    setTogglingSupp(supp.name);
    const data = await api('supplement/log', { method: 'POST', body: JSON.stringify({ name: supp.name, dose: supp.dose }) });
    setTogglingSupp('');
    const today = new Date().toISOString().slice(0, 10);
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
      refresh({ ...s, photosMeta: [...(s?.photosMeta || []), { id: data.id, date: new Date().toISOString().slice(0, 10), note, url: data.url }] });
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
      const e1 = l.kg > 0 && l.reps > 0 ? Math.round(l.kg * (1 + l.reps / 30)) : 0;
      if (!e1) continue;
      if (!history[l.exercise]) history[l.exercise] = [];
      history[l.exercise].push(e1);
      if (!byEx[l.exercise] || e1 > byEx[l.exercise].e1rm)
        byEx[l.exercise] = { exercise: l.exercise, kg: l.kg, reps: l.reps, e1rm: e1, date: l.date };
    }
    return {
      prs: Object.values(byEx).sort((a, b) => b.e1rm - a.e1rm),
      e1rmHistory: history,
    };
  }, [s?.lifts]);

  const cutoff14 = new Date(Date.now() - 14 * 864e5).toISOString().slice(0,10);
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
      <div className="fade" style={{ flexShrink: 0 }}>
        <input className="pr-search" placeholder="Filter exercise…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
function Onboarding({ onComplete, onOpenImport }) {
  const TOTAL = 6;
  const [step, setStep] = useState(0);
  const [echelon, setEchelon] = useState('full');

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

  const copyUrl = () => {
    navigator.clipboard?.writeText(SHORTCUT_URL).then(() => {
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

  const advance = async () => {
    setSaving(true);
    try {
      if (step === 1) await saveStep1();
      if (step === 2) await saveStep2();
      if (step === 3) await api('profile', { method: 'POST', body: JSON.stringify({ trackingLevel: echelon }) }).catch(() => {});
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

        {/* ── STEP 4: CONNECT SERVICES ── */}
        {step === 4 && (
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
                <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={() => setHealthGuideOpen(v => !v)}>
                  {healthGuideOpen ? 'Hide Guide' : 'Setup Guide'}
                </button>
              </div>
              {healthGuideOpen && (
                <div className="ob-guide">
                  <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                  <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                  <strong>3.</strong> Trigger: <strong>Daily at 6:00 AM</strong><br />
                  <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                  <strong>5.</strong> URL (tap to copy):
                  <div className="ob-copy-url" onClick={copyUrl}>
                    <span>{SHORTCUT_URL}</span>
                    <button onClick={e => { e.stopPropagation(); copyUrl(); }}>{urlCopied ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                  <strong>7.</strong> Add fields: <code>sleep_hours</code>, <code>hrv</code>, <code>rhr</code><br />
                  <strong>8.</strong> Set values from <strong>Health</strong> actions in Shortcuts
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
              <button className="ob-back" onClick={() => setStep(3)}>← Back</button>
              <button className="ob-next" onClick={() => setStep(5)}>Continue</button>
            </div>
          </>
        )}

        {/* ── STEP 5: ALL SET ── */}
        {step === 5 && (
          <>
            <div className="ob-logo" style={{ fontSize: 'clamp(36px,9vw,60px)' }}>You're set up.</div>
            <div className="ob-sub" style={{ marginBottom: 6 }}>Press is ready.</div>
            <div className="ob-lede">Your data will populate as you train, sleep, and log.</div>

            <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', margin: '8px 0 28px', padding: '4px 0' }}>
              {[
                [!!name, name ? `${name}${goal ? ` · ${goal}` : ''}` : 'Profile skipped'],
                [!!goal, `${sleepTarget}h sleep · ${waterTarget} glasses water · ${trainingDays} training days`],
                [true, ECHELONS.find(e => e.key === echelon)?.title || 'Full System'],
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
function SettingsOverlay({ s, onClose, refresh, onSignOut, onOpenImport, setBriefing }) {
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

  const SHORTCUT_URL = `${API_BASE}/shortcut`;
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
                  onClick={() => api('macro-auto', { method: 'POST', body: JSON.stringify({ goal: g }) }).then(data => refresh({ ...s, macroGoal: data.goal, macroTargets: data.targets, macroMode: 'auto' }))}
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
                  onClick={() => api('profile', { method: 'POST', body: JSON.stringify({ sex: sx }) }).then(profile => refresh({ ...s, profile }))}
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
                  onClick={() => api('profile', { method: 'POST', body: JSON.stringify({ trainingPriority: p }) }).then(profile => refresh({ ...s, profile }))}
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
            <button className="prof-btn" onClick={() => api('profile', { method: 'POST', body: JSON.stringify({ exactCalories: !s?.profile?.exactCalories }) }).then(profile => refresh({ ...s, profile }))}
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
              <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={() => setHealthGuideOpen(v => !v)}>
                {healthGuideOpen ? 'Hide' : 'Setup'}
              </button>
            </div>
            {healthGuideOpen && (
              <div className="ob-guide">
                <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                <strong>3.</strong> Trigger: <strong>Daily at 6:00 AM</strong><br />
                <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                <strong>5.</strong> URL (tap to copy):
                <div className="ob-copy-url" onClick={() => navigator.clipboard?.writeText(SHORTCUT_URL).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); })}>
                  <span>{SHORTCUT_URL}</span>
                  <button>{urlCopied ? 'Copied!' : 'Copy'}</button>
                </div>
                <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                <strong>7.</strong> Fields: <code>sleep_hours</code>, <code>hrv</code>, <code>rhr</code> from Health actions
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
              <button className="prof-btn" onClick={() => api('profile', { method: 'POST', body: JSON.stringify({ travelMode: false }) }).then(profile => refresh({ ...s, profile, travelMode: profile.travelMode }))}>Disable</button>
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

        {/* ── ACCOUNT ── */}
        <div className="settings-sec">
          <div className="settings-sh">Account</div>
          <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 4 }} onClick={onSignOut}>Sign Out</button>
        </div>

      </div>
    </div>
  );
}

// ── MENTOR CHAT ───────────────────────────────────────────────────────────────
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
  const [loggerPlanDay, setLoggerPlanDay] = useState(undefined);
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
  const [summaryError, setSummaryError] = useState('');

  const loadSummary = () => api('summary')
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
  // nav dot active while visible. Keyed to [user] (not [s]) so a failed data fetch can never
  // leave the observer unattached — the section DOM exists as soon as the user is signed in.
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
    }, { threshold: 0.35 });
    sections.forEach(sec => obs.observe(sec));

    return () => obs.disconnect();
  }, [user]);

  if (user === undefined) return (
    <div style={{ minHeight: '100svh', background: '#f5f0e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a7a5c' }}>Loading…</div>
    </div>
  );

  if (!user) return <LoginScreen />;

  const trackingLevel = s?.profile?.trackingLevel || 'full';
  const showSleep = trackingLevel !== 'workout';
  const showFuel = trackingLevel === 'full';
  const sectionIds = ['s1', ...(showSleep ? ['s2'] : []), 's3', ...(showFuel ? ['s4'] : []), 's5', 's6', 's7'];

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
        <S1 s={s} briefing={briefing} onShowBriefing={() => setShowBriefing(true)}
            onShowAfternoon={() => afternoonNewscast ? setShowAfternoonNewscast(true) : fetchNewscast('afternoon')}
            onShowNight={() => nightNewscast ? setShowNightNewscast(true) : fetchNewscast('night')}
            onShowWeekly={() => weeklyReview ? setShowWeeklyReview(true) : fetchWeeklyReview()}
            afternoonLoaded={!!afternoonNewscast} nightLoaded={!!nightNewscast} weeklyLoaded={!!weeklyReview}
            newscastLoading={newscastLoading} newscastError={newscastError} />
        {showSleep && <S2 s={s} refresh={refresh} />}
        <S3 s={s} onStartWorkout={planDay => setLoggerPlanDay(planDay ?? null)} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} refresh={refresh} />
        {showFuel && <S4 s={s} refresh={refresh} />}
        <S5 s={s} refresh={refresh} />
        <S6 s={s} onOpenSettings={() => setShowSettings(true)} refresh={refresh} />
        <S7 s={s} />
      </div>
      {/* Floating personal journalist chat bubble */}
      {!chatOpen && (
        <button className="chat-bubble" onClick={() => setChatOpen(true)} aria-label="Open personal journalist chat">PJ</button>
      )}
      {chatOpen && <MentorChat onClose={() => setChatOpen(false)} />}
      {showSettings && <SettingsOverlay s={s} onClose={() => setShowSettings(false)} refresh={refresh} onSignOut={() => signOut(auth)} onOpenImport={() => { setShowSettings(false); setShowImport(true); }} setBriefing={setBriefing} />}
      {showBriefing && briefing && <BriefingOverlay briefing={briefing} onClose={() => setShowBriefing(false)} />}
      {showAfternoonNewscast && afternoonNewscast && <NewscastOverlay newscast={afternoonNewscast} onClose={() => setShowAfternoonNewscast(false)} />}
      {showNightNewscast && nightNewscast && <NewscastOverlay newscast={nightNewscast} onClose={() => setShowNightNewscast(false)} />}
      {showWeeklyReview && weeklyReview && <NewscastOverlay newscast={weeklyReview} onClose={() => setShowWeeklyReview(false)} />}
      {loggerOpen && (
        <WorkoutLogger
          planDay={loggerPlanDay}
          lifts={s?.lifts || []}
          customExercises={s?.customExercises || []}
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
