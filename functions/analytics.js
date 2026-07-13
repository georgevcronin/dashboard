// Pure summary/reporting computations shared across /summary, /trends,
// /export/csv, and /plan/week — none of these close over the request-scoped
// db state, they take exactly the data they need as parameters.

const { e1rm: calcE1RM } = require('./strengthStandards');

function alcoholStats(alcoholLog) {
  const ydayDate = new Date(); ydayDate.setDate(ydayDate.getDate() - 1);
  const ydayStr = ydayDate.toISOString().slice(0, 10);
  const alcoholLastNight = (alcoholLog || []).find(e => e.date === ydayStr)?.units || 0;
  const alcoholLast7 = (alcoholLog || []).filter(e => {
    const diff = (Date.now() - new Date(e.date).getTime()) / 864e5;
    return diff >= 0 && diff <= 7;
  }).reduce((a, e) => a + (e.units || 0), 0);
  return { alcoholLastNight, alcoholLast7 };
}

function computeDataMaturity(lifts) {
  if (!lifts || lifts.length === 0) return { phase: 'experiments', weeksCovered: 0, sessionsCount: 0, hasPatterns: false, exercisesWithPatterns: 0 };

  const sorted = [...lifts].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sorted[0].date);
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const weeksCovered = Math.round((lastDate - firstDate) / (7 * 86400000));
  const workoutDates = new Set(lifts.map(l => l.date));
  const sessionsCount = workoutDates.size;

  // Find exercises with clear progressive e1RM trend across 4+ sessions
  const byEx = {};
  for (const l of lifts) {
    if (!l.exercise || !l.kg || !l.reps) continue;
    const e1rm = calcE1RM(l.kg, l.reps);
    const key = l.exercise.toLowerCase();
    (byEx[key] = byEx[key] || []).push({ date: l.date, e1rm });
  }
  const exercisesWithPatterns = Object.values(byEx).filter(sets => {
    if (sets.length < 4) return false;
    const s = sets.sort((a, b) => a.date.localeCompare(b.date));
    const earlyAvg = s.slice(0, Math.ceil(s.length / 2)).reduce((a, x) => a + x.e1rm, 0) / Math.ceil(s.length / 2);
    const lateAvg = s.slice(Math.floor(s.length / 2)).reduce((a, x) => a + x.e1rm, 0) / Math.ceil(s.length / 2);
    return lateAvg > earlyAvg * 1.01; // 1%+ improvement = identifiable trend
  }).length;

  // Established = 4+ weeks of history, 10+ sessions, 3+ exercises showing clear trends
  const hasEnoughData = weeksCovered >= 4 && sessionsCount >= 10 && exercisesWithPatterns >= 3;

  return {
    phase: hasEnoughData ? 'established' : 'experiments',
    weeksCovered,
    sessionsCount,
    hasPatterns: exercisesWithPatterns >= 3,
    hasEnoughData,
    exercisesWithPatterns,
  };
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function compVerdict(weights, lifts) {
  if (weights.length < 5) return null;
  const wTrend = weights.at(-1).value - weights[0].value;
  const byEx = {};
  lifts.forEach((l) => { if (!l.exercise) return; const key = l.exercise.toLowerCase(); (byEx[key] = byEx[key] || []).push(l); });
  const liftDeltas = Object.values(byEx).filter((s) => s.length > 1).map((s) => s.at(-1).kg - s[0].kg);
  const liftsUp = liftDeltas.length && avg(liftDeltas) > 0;
  if (Math.abs(wTrend) < 0.8 && liftsUp) return { word: "Recomping", note: "Lifts up, weight steady — likely swapping fat for muscle." };
  if (wTrend <= -0.8 && liftsUp) return { word: "Cutting well", note: "Losing weight while strength climbs." };
  if (wTrend <= -0.8) return { word: "Cutting", note: "Weight trending down. Log lifts to confirm you're holding strength." };
  if (wTrend >= 0.8 && liftsUp) return { word: "Building", note: "Weight and lifts both climbing." };
  if (wTrend >= 0.8) return { word: "Gaining", note: "Weight up without lift progress." };
  return { word: "Maintaining", note: "Weight stable." };
}

function toCsv(rows, columns) {
  const esc = v => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = rows.map(r => columns.map(c => esc(r[c])).join(","));
  return [columns.join(","), ...lines].join("\n");
}

// Monday-anchored (local time) count of distinct days lifted so far this
// calendar week — used to show "sessions completed" against the weekly
// guidance's advisory target.
function weekLiftSessionsCompleted(lifts) {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(now); monday.setDate(now.getDate() - mondayOffset); monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().slice(0, 10);
  return new Set((lifts || []).filter(l => l.date >= mondayStr).map(l => l.date)).size;
}

module.exports = { alcoholStats, computeDataMaturity, compVerdict, toCsv, weekLiftSessionsCompleted };
