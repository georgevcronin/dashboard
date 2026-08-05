// Phase 8: structured weekly-brief sections that sit alongside
// generateWeeklyReview's existing Gemini narrative. Pure functions only —
// index.js does all the db extraction (which raw field/series backs which
// goal metric, which lifts match a goal's exercise); this module turns
// already-extracted series/numbers into the fixed sections.

const DAY_MS = 24 * 3600 * 1000;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / DAY_MS);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Fat-free mass / FFMI — standard formulas, nothing measures either
// elsewhere in the app yet, so this is the one place they're defined.
function ffm(weightKg, bodyFatPct) {
  return weightKg * (1 - bodyFatPct / 100);
}
function ffmi(weightKg, bodyFatPct, heightCm) {
  const heightM = heightCm / 100;
  return ffm(weightKg, bodyFatPct) / (heightM * heightM);
}

// series: [{date:'YYYY-MM-DD', value:number}] in any order, need not be
// deduped. Direction (does the goal want the number up or down) is inferred
// from sign(target - current) — works for weight/rhr (down) and
// lift/vo2max/ffm (up) without any per-metric special-casing.
function projectGoal(series, target, todayISO) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return { current: null, weekDelta: null, projection: { status: 'insufficient-data' } };

  const current = sorted.at(-1).value;
  const cutoffThis = addDays(todayISO, -7);
  const cutoffLast = addDays(todayISO, -14);
  const thisWeek = sorted.filter(p => p.date >= cutoffThis && p.date <= todayISO);
  const lastWeek = sorted.filter(p => p.date >= cutoffLast && p.date < cutoffThis);
  const weekDelta = thisWeek.length && lastWeek.length ? thisWeek.at(-1).value - lastWeek.at(-1).value : null;

  const gap = target - current;
  let projection;
  if (Math.abs(gap) < 1e-9) {
    projection = { status: 'at-target' };
  } else {
    const windowStart = addDays(todayISO, -28);
    const windowPts = sorted.filter(p => p.date >= windowStart);
    if (windowPts.length < 2) {
      projection = { status: 'insufficient-data' };
    } else {
      const first = windowPts[0], last = windowPts.at(-1);
      const weeks = daysBetween(first.date, last.date) / 7;
      const rate = weeks > 0 ? (last.value - first.value) / weeks : 0;
      if (Math.abs(rate) < 1e-9) {
        projection = { status: 'flat' };
      } else if (Math.sign(rate) !== Math.sign(gap)) {
        projection = { status: 'wrong-direction' };
      } else {
        projection = { status: 'projected', date: addDays(todayISO, Math.round((gap / rate) * 7)) };
      }
    }
  }
  return { current, weekDelta, projection };
}

const GOAL_TYPE_LABEL = {
  fatLoss: 'Lose Fat', muscle: 'Gain Muscle / Strength', cardio: 'Improve Cardiovascular Health',
  flexibility: 'Improve Flexibility', sport: 'Improve in a Sport',
};
const METRIC_LABEL = { weight: 'Bodyweight', bodyFat: 'Body fat', ffm: 'Fat-free mass', ffmi: 'FFMI', rhr: 'Resting HR', vo2max: 'VO₂max' };
const METRIC_UNIT = { weight: 'kg', bodyFat: '%', ffm: 'kg', ffmi: '', rhr: 'bpm', vo2max: '' };
const RATE_TEXT = {
  'insufficient-data': 'not enough data yet for a rate',
  flat: 'holding steady, no clear trend',
  'wrong-direction': 'trending away from target',
  'at-target': 'already at target',
};

// goal: the raw profile.goals entry. progress: projectGoal()'s return value,
// or null for goals with no matching series (benchmark, vague).
function formatGoalLine(goal, progress, todayISO) {
  if (!goal.concrete) return `${GOAL_TYPE_LABEL[goal.type] || goal.type} — no target set`;
  if (goal.metric === 'benchmark') {
    return `${goal.benchmarkLabel || 'Benchmark'}${goal.targetDate ? ` — target ${formatDate(goal.targetDate)}` : ''}`;
  }

  const label = goal.metric === 'lift' ? (goal.exercise || 'Lift') : (METRIC_LABEL[goal.metric] || goal.metric);
  const unit = goal.metric === 'lift' ? 'kg e1RM' : (METRIC_UNIT[goal.metric] || '');
  const { current, weekDelta, projection } = progress || {};
  if (current == null) return `${label} — no data logged yet`;

  const deltaStr = weekDelta != null ? ` (${weekDelta >= 0 ? '+' : ''}${round1(weekDelta)}${unit} this week)` : '';
  const daysLeft = goal.targetDate ? daysBetween(todayISO, goal.targetDate) : null;
  const targetStr = goal.targetDate
    ? ` → target ${round1(goal.target)}${unit} by ${formatDate(goal.targetDate)}${daysLeft != null ? ` (${daysLeft} days left)` : ''}`
    : ` → target ${round1(goal.target)}${unit}`;
  const rateStr = projection.status === 'projected'
    ? ` · at this rate: ${formatDate(projection.date)}`
    : ` · ${RATE_TEXT[projection.status] || ''}`;

  return `${label}: ${round1(current)}${unit}${deltaStr}${targetStr}${rateStr}`;
}

// Buckets the this-week-vs-last-week deltas generateWeeklyReview already
// computes into working / needs-attention lines. Thresholds: sessions/
// volume/recovery — up = working, down = needs attention, flat = omitted;
// sleep — at/above target = working, >0.5h under = needs attention;
// nutrition — ≥5/7 days logged = working, <5/7 = needs attention (same
// cutoff the existing nutritionNote prompt field already uses); PRs only
// ever add to working, there's no negative corollary.
function bucketWorkingAttention(stats) {
  const working = [], needsAttention = [];
  const {
    sessionsThis, sessionsLast, volThis, volLast, recoveryThis, recoveryLast,
    sleepThis, sleepTarget, nutritionDaysLogged, prCount,
  } = stats;

  if (sessionsThis != null && sessionsLast != null && sessionsThis !== sessionsLast) {
    (sessionsThis > sessionsLast ? working : needsAttention)
      .push(`Sessions: ${sessionsThis} this week vs ${sessionsLast} last week`);
  }
  if (volThis != null && volLast != null && volThis !== volLast) {
    (volThis > volLast ? working : needsAttention)
      .push(`Lift volume: ${volThis}kg vs ${volLast}kg last week`);
  }
  if (recoveryThis != null && recoveryLast != null && Math.round(recoveryThis) !== Math.round(recoveryLast)) {
    (recoveryThis > recoveryLast ? working : needsAttention)
      .push(`Avg recovery: ${Math.round(recoveryThis)}% vs ${Math.round(recoveryLast)}% last week`);
  }
  if (sleepThis != null && sleepTarget != null) {
    if (sleepThis >= sleepTarget) working.push(`Sleep: ${sleepThis.toFixed(1)}h vs ${sleepTarget}h target`);
    else if (sleepTarget - sleepThis > 0.5) needsAttention.push(`Sleep: ${sleepThis.toFixed(1)}h vs ${sleepTarget}h target`);
  }
  if (nutritionDaysLogged != null) {
    (nutritionDaysLogged >= 5 ? working : needsAttention)
      .push(`Nutrition logged ${nutritionDaysLogged}/7 days`);
  }
  if (prCount > 0) working.push(`${prCount} new strength PR${prCount === 1 ? '' : 's'} this week`);

  return { working, needsAttention };
}

module.exports = { projectGoal, formatGoalLine, bucketWorkingAttention, ffm, ffmi, formatDate };
