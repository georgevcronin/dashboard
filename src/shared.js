// Shared frontend primitives: Firebase auth, the API client, and the date/
// number formatters every section uses. Moved out of app.jsx verbatim so a
// section can live in its own file without pulling the whole 10k-line module
// in with it.
// ponytail: no abstraction added — these are the original definitions, moved.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDlVzSc9yow5GHbQipRWuYAZ5QTQ-jmXiY",
  authDomain: "pressnewsletter.firebaseapp.com",
  projectId: "pressnewsletter",
  storageBucket: "pressnewsletter.firebasestorage.app",
  messagingSenderId: "342853014013",
  appId: "1:342853014013:web:0dd6fb5fe4e975921c8994",
};
export const firebaseApp = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

export const API_BASE = "https://europe-west2-pressnewsletter.cloudfunctions.net/api";

export const getToken = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);

export const api = async (path, opts = {}) => {
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

export const authFetch = async (url, opts = {}) => {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
};


export const toLocalDateStr = (date) => {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
// "Today" as a local "YYYY-MM-DD" string — the frontend equivalent of the
// backend's day(). Every date the backend stores (workouts, nutrition,
// measurements, ...) is keyed this way; comparing against it with a
// UTC-derived string (the old `new Date().toISOString().slice(0,10)`
// pattern, repeated ~15 times across this file) silently mismatches near
// midnight.
export const todayLocalStr = () => toLocalDateStr(new Date());
export const fmtDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
// Sleep target is stored/computed as decimal hours (e.g. 7.3) -- shown as
// "7h 18m" instead, since a bare decimal hour count reads oddly next to
// clock-formatted times elsewhere in the app.
export const fmtHoursMins = h => {
  if (h == null) return '—';
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
};
export const pct = (v, t) => (t && t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0);
// Consecutive days trained, counting back from today (yesterday if today has
// no session yet). Shared between S1's streak row and the Training Streak
// micro-widget so the two never drift apart on what "streak" means.
export const computeTrainingStreak = (workouts) => {
  const dates = new Set((workouts || []).map(w => w.date));
  let streak = 0; const d = new Date();
  const todayStr = toLocalDateStr(d);
  if (!dates.has(todayStr)) d.setDate(d.getDate() - 1);
  while (true) {
    const k = toLocalDateStr(d);
    if (!dates.has(k)) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
};
export const computeSleepStreak = (sleepSeries, sleepTarget) => {
  const target = sleepTarget || 8;
  const series = sleepSeries || [];
  if (!series.length) return 0;
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] >= target * 0.9) streak++;
    else break;
  }
  return streak;
};
// Calorie display default is approximate (nearest 300) — precision that isn't
// really there anyway for most logged food, and it's less anxiety-inducing to
// track than exact numbers. Settings > Nutrition can switch to exact.
export const roundCal = (v, exact) => (v == null ? v : exact ? Math.round(v) : Math.round(v / 300) * 300);
