// #12: trend tracking of #11's session-load number over time — a
// TrainingPeaks CTL/ATL/TSB-style model applied to Press's own session-load
// scores instead of a third-party TSS. Exponentially-weighted moving
// averages, not a fixed rolling window, so one big session's influence fades
// smoothly rather than dropping off a cliff N days later.
//
// fitness (CTL-equivalent): 42-day time constant, slow-moving — "how much
// consistent training have you banked."
// fatigue (ATL-equivalent): 7-day time constant, fast-moving — "how much
// recent load are you carrying."
// form (TSB-equivalent): fitness - fatigue. Positive = fresh/recovered
// capacity; sustained deeply negative is the deload-suggestion trigger
// below — matches weeklyPlanner.js's "propose, don't silently insert"
// philosophy. deloadSuggestion only ever returns a flag + explanation,
// never a plan.
//
// Deliberately scoped to the trend + deload-suggestion only. The
// "based on variables" half of the original ask (what correlates with the
// number — sleep, alcohol, macro adherence, split) is BRAINSTORM.md #22, a
// separate, larger correlation engine with its own sample-size-discipline
// requirement (never report insufficient-n as a null finding). Held out of
// this pass rather than built hastily — flagging, not dropping.

const { sessionLoadScore } = require('./sessionLoad');

const FITNESS_DAYS = 42, FATIGUE_DAYS = 7;
const FITNESS_LAMBDA = 2 / (FITNESS_DAYS + 1);
const FATIGUE_LAMBDA = 2 / (FATIGUE_DAYS + 1);

// lifts: full db.lifts history. Returns one point per calendar day from the
// first logged lift through today (inclusive), 0-load on days with nothing
// logged — the EWMA needs an unbroken daily series, not just training days,
// or the decay math between sessions is wrong.
function dailyLoadSeries(lifts) {
  if (!lifts || !lifts.length) return [];
  const byDate = {};
  for (const l of lifts) {
    if (!l.date) continue;
    (byDate[l.date] ||= []).push(l);
  }
  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];

  const series = [];
  for (let d = new Date(dates[0]); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dayLifts = byDate[dateStr];
    series.push({ date: dateStr, load: dayLifts ? (sessionLoadScore(dayLifts) || 0) : 0 });
  }
  return series;
}

// Applies the fitness/fatigue EWMA over a daily load series, returning one
// point per day: { date, load, fitness, fatigue, form }.
function computeTrend(lifts) {
  const series = dailyLoadSeries(lifts);
  if (!series.length) return [];

  let fitness = series[0].load, fatigue = series[0].load;
  return series.map((point, i) => {
    if (i > 0) {
      fitness += FITNESS_LAMBDA * (point.load - fitness);
      fatigue += FATIGUE_LAMBDA * (point.load - fatigue);
    }
    return {
      date: point.date,
      load: point.load,
      fitness: Math.round(fitness * 10) / 10,
      fatigue: Math.round(fatigue * 10) / 10,
      form: Math.round((fitness - fatigue) * 10) / 10,
    };
  });
}

// Sustained, not a single rough day: form has sat at/below threshold for at
// least minConsecutiveDays straight, checked back from the most recent point.
const DELOAD_FORM_THRESHOLD = -10;
const DELOAD_MIN_CONSECUTIVE_DAYS = 10;

function deloadSuggestion(trend) {
  if (!trend || !trend.length) return null;
  let streak = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].form <= DELOAD_FORM_THRESHOLD) streak++;
    else break;
  }
  if (streak < DELOAD_MIN_CONSECUTIVE_DAYS) return null;
  return {
    suggested: true,
    consecutiveDays: streak,
    form: trend.at(-1).form,
    reason: `Form has stayed at or below ${DELOAD_FORM_THRESHOLD} for ${streak} straight days — accumulated fatigue is consistently outpacing banked fitness. Worth a deliberately lighter week.`,
  };
}

module.exports = {
  dailyLoadSeries, computeTrend, deloadSuggestion,
  FITNESS_DAYS, FATIGUE_DAYS, DELOAD_FORM_THRESHOLD, DELOAD_MIN_CONSECUTIVE_DAYS,
};
