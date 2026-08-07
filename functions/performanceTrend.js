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

// Sustained, not a single rough day — but a strict unbroken streak turned
// out to be unreachable for a realistic training pattern: a persona
// training hard 5-7 days/week with normal rest days dipped form below
// threshold on 18 of 120 simulated days, but the longest unbroken streak
// was only 3 (any single recovered rest day reset the count to zero), so
// the streak version never fired even for someone doing ~50% more volume
// than recommended for 4 straight months (see scripts/simulate/ closed-loop
// run, 2026-08-07). A rolling average tolerates the occasional good day
// while still requiring sustained accumulated fatigue over the window —
// closer to what "worth a deliberately lighter week" is actually about.
const DELOAD_FORM_THRESHOLD = -10;
const DELOAD_WINDOW_DAYS = 14;

function deloadSuggestion(trend) {
  if (!trend || trend.length < DELOAD_WINDOW_DAYS) return null;
  const window = trend.slice(-DELOAD_WINDOW_DAYS);
  const avgForm = window.reduce((sum, t) => sum + t.form, 0) / window.length;
  if (avgForm > DELOAD_FORM_THRESHOLD) return null;
  const rounded = Math.round(avgForm * 10) / 10;
  return {
    suggested: true,
    windowDays: DELOAD_WINDOW_DAYS,
    avgForm: rounded,
    form: trend.at(-1).form,
    reason: `Form has averaged ${rounded} over the last ${DELOAD_WINDOW_DAYS} days — accumulated fatigue is consistently outpacing banked fitness. Worth a deliberately lighter week.`,
  };
}

module.exports = {
  dailyLoadSeries, computeTrend, deloadSuggestion,
  FITNESS_DAYS, FATIGUE_DAYS, DELOAD_FORM_THRESHOLD, DELOAD_WINDOW_DAYS,
};
