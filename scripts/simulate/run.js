#!/usr/bin/env node
'use strict';
// Drives N synthetic users against the LOCAL Firebase emulator suite for a
// simulated stretch of months, looking for crashes/bad-values/cross-person
// leaks. Never touches prod. See scripts/simulate/README.md to run it.
//
// ponytail: requests are sequential (one at a time, across all personas and
// days), not concurrent. functions/index.js's module-level `db` variable is
// documented (ARCHITECTURE.md) as safe only under "one request at a time per
// instance" — running this concurrently would surface interleaving bugs from
// the emulator's own concurrency behaviour, which is a different, already-
// tracked question (SELLABILITY_ANALYSIS.md), not what this pass is for.
// Upgrade to bounded concurrency later if that question needs its own answer.

const fs = require('fs');
const path = require('path');
const { generatePersonas, CORE_LIFTS } = require('./personas');

// `firebase use` (not .firebaserc directly) matches whatever the emulator
// itself resolved at startup — on this machine those two have disagreed
// before (a stale/overridden local CLI project alias), so ask the same CLI
// the emulator asked rather than trust the repo file.
const PROJECT = require('child_process').execSync('firebase use', { cwd: path.join(__dirname, '../..') }).toString().trim();
const REGION = 'europe-west2';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}/api`;
const AUTH_BASE = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const AUTH_KEY = 'fake-api-key'; // any string works against the Auth emulator
const DAY_MS = 86400000;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : process.argv[i + 1];
}
const PERSONA_COUNT = +arg('personas', 30);
const SIM_DAYS = +arg('days', 182);
const SEED = +arg('seed', 1);
const CLOCK_FILE = process.env.SIM_CLOCK_FILE || path.join(__dirname, '.sim-clock');
const LEAK_CHECK_EVERY_DAYS = 30;

const MEAL_TEMPLATES = [
  { label: 'Oats + whey', protein: 35, carbs: 60, fat: 10, calories: 470 },
  { label: 'Chicken + rice', protein: 45, carbs: 70, fat: 12, calories: 570 },
  { label: 'Salmon + veg', protein: 40, carbs: 20, fat: 25, calories: 460 },
  { label: 'Greek yogurt + fruit', protein: 20, carbs: 30, fat: 5, calories: 240 },
  { label: 'Steak + potato', protein: 50, carbs: 45, fat: 22, calories: 610 },
];

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const LIVE_PATH = path.join(outDir, 'live.json');
// Written every simulated day so an external process (the report artifact
// redeploy loop) can show real day-by-day progress — there's no push
// channel from this script to a hosted page, so that loop polls this file
// on its own schedule instead.
function writeLive(day, personas, sample) {
  fs.writeFileSync(LIVE_PATH, JSON.stringify({
    day, totalDays: SIM_DAYS, generatedAt: new Date().toISOString(),
    personas: personas.map(({ rand, idToken, ...p }) => p),
    issues, sample,
  }));
}

const issues = [];
function flag(kind, persona, detail) {
  issues.push({ kind, persona: persona.id, day: currentDay, detail });
  console.error(`[${kind}] ${persona.id} day ${currentDay}: ${detail}`);
}

let currentDay = 0;
function setClock(day) {
  currentDay = day;
  fs.writeFileSync(CLOCK_FILE, String(day * DAY_MS));
}
// Mirrors clock-shim.js's own math (real now + offset) so date strings built
// here (driver process, unpatched Date) line up with what the shimmed
// emulator process considers "today" for the same simulated day.
function simDate(dayIdx) { return new Date(Date.now() + dayIdx * DAY_MS); }

async function callApi(personaOrNull, method, urlPath, { body, query, openToken } = {}) {
  const url = new URL(FUNCTIONS_BASE + urlPath);
  if (openToken) url.searchParams.set('token', openToken);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers = { 'Content-Type': 'application/json' };
  if (personaOrNull) headers.Authorization = `Bearer ${personaOrNull.idToken}`;
  let res, json;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    flag('hard-failure', personaOrNull || { id: 'n/a' }, `${method} ${urlPath} threw: ${e.message}`);
    return null;
  }
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    flag('hard-failure', personaOrNull || { id: 'n/a' }, `${method} ${urlPath} -> ${res.status} ${JSON.stringify(json)}`);
    return null;
  }
  checkBadValues(personaOrNull, urlPath, json);
  return json;
}

// Anything numeric coming back that's NaN, or a known-bounded field outside
// its bounds, is silent data corruption worth flagging even though the
// request itself "succeeded."
const BOUNDS = {
  bodyFatToday: [1, 70],
};
function checkBadValues(persona, urlPath, json, prefix = '') {
  if (!json || typeof json !== 'object') return;
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === 'number' && Number.isNaN(v)) {
      flag('bad-value', persona || { id: 'n/a' }, `${urlPath} field ${prefix}${k} is NaN`);
    } else if (BOUNDS[k] && typeof v === 'number' && (v < BOUNDS[k][0] || v > BOUNDS[k][1])) {
      flag('bad-value', persona || { id: 'n/a' }, `${urlPath} field ${prefix}${k}=${v} outside [${BOUNDS[k]}]`);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && prefix.length < 20) {
      checkBadValues(persona, urlPath, v, `${prefix}${k}.`);
    }
  }
}

// A normal Auth-emulator sign-in token expires ~1hr after real-world mint
// time — fine for a real client, useless here, since clock-shim.js advances
// the *Functions emulator's* Date a full simulated day (or more) per
// iteration, so verifyIdToken (functions/index.js) sees that token as
// expired from day 1 onward regardless of how recently it was minted.
// Re-minting more often doesn't help — the incompatibility is the offset
// itself, not token freshness. Fix: mint the ID token ourselves with an
// expiry past the whole simulated window. The Auth emulator is documented
// to skip signature verification (only real-Firebase does that), decoding
// claims directly, so an unsigned (alg: none) token with the right claim
// shape is accepted exactly like a real one — this is standard
// Auth-emulator testing practice, not exploiting a bug.
function mintLongLivedIdToken(uid, ttlDays) {
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT,
    auth_time: nowSec, user_id: uid, sub: uid,
    iat: nowSec, exp: nowSec + ttlDays * 86400,
    firebase: { identities: {}, sign_in_provider: 'custom' },
  };
  return `${b64(header)}.${b64(payload)}.`;
}

async function registerPersona(persona) {
  const email = `${persona.id}@sim.local`;
  const password = 'sim-password-1';
  const res = await fetch(`${AUTH_BASE}/accounts:signUp?key=${AUTH_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`auth signUp failed for ${persona.id}: ${JSON.stringify(json)}`);
  persona.uid = json.localId;
  // Real user record created above (so the uid is genuine and traceable in
  // the Auth emulator UI/logs); the token used for every request from here
  // on is our own long-lived one, not the one signUp returned.
  persona.idToken = mintLongLivedIdToken(persona.uid, SIM_DAYS + 30);
  await callApi(persona, 'POST', '/account/username', {
    body: { username: persona.username, displayName: persona.displayName },
  });
  const tok = await callApi(persona, 'POST', '/sync-token');
  persona.syncToken = tok?.token || null;
}

function scheduledTrainingDay(persona, dayIdx) {
  // spread daysPerWeek across a 7-day week deterministically per persona
  const slot = dayIdx % 7;
  return slot % Math.max(1, Math.round(7 / persona.daysPerWeek)) === 0;
}

function inTaperWindow(persona, dayIdx) {
  return persona.injuryDay != null && dayIdx >= persona.injuryDay && dayIdx < persona.injuryDay + persona.taperDays;
}

async function simulateDay(persona, dayIdx) {
  const rand = persona.rand;

  if (persona.injuryDay === dayIdx) {
    await callApi(persona, 'POST', '/injury', { body: { area: 'shoulder', severity: 'moderate', note: 'sim event' } });
  }

  const wantsTraining = scheduledTrainingDay(persona, dayIdx) && !inTaperWindow(persona, dayIdx);
  if (wantsTraining && rand() < persona.adherence) {
    const weeksElapsed = dayIdx / 7;
    const growth = 1 + (persona.progressionPctPerWeek / 100) * weeksElapsed;
    const lifts = rand() < 0.3 ? CORE_LIFTS.slice(0, 2 + Math.floor(rand() * 3)) : [CORE_LIFTS[Math.floor(rand() * CORE_LIFTS.length)]];
    const sets = lifts.flatMap(name => {
      const base = persona.startingLifts[name] * growth;
      const kg = Math.max(2.5, Math.round((base * (0.95 + rand() * 0.1)) / 2.5) * 2.5);
      const setCount = 2 + Math.floor(rand() * 3);
      return Array.from({ length: setCount }, () => ({ exercise: name, kg, reps: 4 + Math.floor(rand() * 8), rpe: 6 + Math.floor(rand() * 4) }));
    });
    const date = simDate(dayIdx).toISOString().slice(0, 10);
    await callApi(persona, 'PUT', `/workout/${date}`, { body: { sets } });
    if (rand() < 0.4) await callApi(persona, 'POST', '/soreness', { body: { muscle: 'chest', score: Math.floor(rand() * 8) } });
  }

  if (rand() < persona.nutritionLogRate) {
    const mealsToday = 1 + Math.floor(rand() * 3);
    for (let m = 0; m < mealsToday; m++) {
      const t = MEAL_TEMPLATES[Math.floor(rand() * MEAL_TEMPLATES.length)];
      const jitter = 0.85 + rand() * 0.3;
      await callApi(persona, 'POST', '/nutrition', {
        body: { label: t.label, protein: Math.round(t.protein * jitter), carbs: Math.round(t.carbs * jitter), fat: Math.round(t.fat * jitter), calories: Math.round(t.calories * jitter) },
      });
    }
  }

  if (rand() < 0.9 && persona.syncToken) {
    const hours = Math.max(2, persona.sleepBaseHours + (rand() - 0.5) * 2 * persona.sleepVariance);
    await callApi(null, 'POST', '/health', {
      openToken: persona.syncToken,
      body: { data: { metrics: [{ name: 'sleep_analysis', data: [{ date: `${simDate(dayIdx).toISOString().slice(0, 10)} 06:00:00`, totalSleep: hours, inBed: hours + 0.3 }] }] } },
    });
  }

  const waterEvents = Math.floor(rand() * 5);
  for (let w = 0; w < waterEvents; w++) await callApi(persona, 'POST', '/water', { body: { delta: 1 } });

  if (dayIdx % 5 === 0) {
    const weeksElapsed = dayIdx / 7;
    const drift = persona.archetype === 'overreaching' ? -0.05 : persona.archetype === 'underloading' ? 0.02 : 0.01;
    const kg = Math.round((persona.startWeightKg + drift * weeksElapsed + (rand() - 0.5)) * 10) / 10;
    await callApi(persona, 'POST', '/weight', { body: { kg } });
  }
}

async function leakCheck(personas) {
  for (const persona of personas) {
    const me = await callApi(persona, 'GET', '/me');
    if (me && me.username && me.username !== persona.username) {
      flag('cross-person-leak', persona, `/me returned username ${me.username}, expected ${persona.username}`);
    }
  }
}

async function main() {
  console.log(`Simulating ${PERSONA_COUNT} personas over ${SIM_DAYS} days (seed ${SEED}) against ${FUNCTIONS_BASE}`);
  // The Auth AND Firestore emulators both persist state across separate
  // script runs within the same `firebase emulators:start` session — Auth
  // alone isn't enough: a prior run's `usernames/{username}` Firestore doc
  // outlives the Auth user that claimed it, so re-running with the same
  // seed 409s on username-already-taken even after accounts are wiped.
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const personas = generatePersonas(PERSONA_COUNT, SEED);
  setClock(0);

  for (const persona of personas) {
    try { await registerPersona(persona); }
    catch (e) { flag('hard-failure', persona, `registration failed: ${e.message}`); }
  }
  const registered = personas.filter(p => p.idToken);
  console.log(`${registered.length}/${personas.length} personas registered`);

  let sample = null;
  for (let d = 0; d < SIM_DAYS; d++) {
    setClock(d);
    for (const persona of registered) {
      await simulateDay(persona, d);
    }
    if (d > 0 && d % LEAK_CHECK_EVERY_DAYS === 0) await leakCheck(registered);
    // A fresh /summary is its own batch of requests, so it's only pulled
    // periodically (not every day) — cheap enough to give the live report
    // a recent muscle-fatigue/nutrition sample without doubling request
    // volume for the whole run.
    if (d % 14 === 0 && registered[0]) sample = await callApi(registered[0], 'GET', '/summary');
    writeLive(d, personas, sample);
    if (d % 30 === 0) console.log(`day ${d}/${SIM_DAYS} — ${issues.length} issues so far`);
  }

  // Suspicious-but-valid data is dumped raw for a follow-up human/LLM review
  // pass, not auto-judged here — see the debugging-session write-up.
  const suspicious = [];
  for (const persona of registered) {
    const summary = await callApi(persona, 'GET', '/summary');
    suspicious.push({ persona: persona.id, archetype: persona.archetype, summary });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outDir, `report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ personas: personas.map(({ rand, ...p }) => p), issues, suspicious }, null, 2));

  console.log(`\nDone. ${issues.length} issues flagged. Report: ${reportPath}`);
  const byKind = {};
  for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  console.log(byKind);
}

main().catch(e => { console.error(e); process.exit(1); });
