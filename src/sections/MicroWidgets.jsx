import React from 'react';
import { pct, computeTrainingStreak } from '../shared.js';

// FEATURES.md #125-133 -- Modular Micro-Widget Structural Filler System.
// Each one is a small `.panel` grid item alongside the main s1-s7 panels
// (see app.jsx's sectionIds render loop): layoutMasonry() already dense-packs
// by real measured pixel height, so a short widget naturally gets pulled into
// whatever gap a taller neighbour leaves. #134's "modular unit engine" goal
// (zero vertical dead space) is realised through that existing mechanism
// rather than a second, competing unit-accounting layout system -- these
// widgets only need to declare roughly how tall they are (MICRO_WIDGET_UNITS,
// 1 or 2, matching FEATURES.md's own per-widget sizing), not participate in
// a parallel packing algorithm.
export const MICRO_WIDGET_IDS = [
  'hydration', 'rhr', 'streak', 'steps', 'insight',
  'trainWindow', 'muscleFocus', 'weightDelta', 'volumePace',
];
export const MICRO_WIDGET_LABELS = {
  hydration: 'Hydration Ring',
  rhr: 'Resting HR Ticker',
  streak: 'Training Streak Badge',
  steps: 'Step Count Bar',
  insight: 'AI Coaching Insight',
  trainWindow: 'Optimal Training Window',
  muscleFocus: "Today's Muscle Focus",
  weightDelta: 'Body Weight Delta',
  volumePace: 'Weekly Volume Pace',
};
export const MICRO_WIDGET_UNITS = {
  hydration: 1, rhr: 1, streak: 1, steps: 1, insight: 1,
  trainWindow: 1, muscleFocus: 2, weightDelta: 2, volumePace: 2,
};

const mwHead = label => <div className="kicker" style={{ marginBottom: 10 }}>{label}</div>;
const mwBig = (val, unit, color) => (
  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, lineHeight: 1, color: color || 'var(--ink)' }}>
    {val}{unit && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
  </div>
);

function Ring({ p, color }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--rule)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, p / 100))}
        transform="rotate(-90 28 28)" />
    </svg>
  );
}

function HydrationRingWidget({ s }) {
  const target = s?.profile?.waterTarget || 7;
  const glasses = s?.waterToday || 0;
  const p = pct(glasses, target);
  return (
    <>
      {mwHead('Hydration')}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Ring p={p} color={p >= 100 ? 'var(--forest)' : 'var(--navy)'} />
        <div>
          {mwBig(glasses, `/ ${target} gl`)}
          <div className="sc-delta" style={{ color: 'var(--dim)' }}>{p}% today</div>
        </div>
      </div>
    </>
  );
}

function RHRTickerWidget({ s }) {
  const rhr = s?.today?.rhr;
  const baseline = s?.baselines?.rhr;
  const delta = rhr != null && baseline != null ? Math.round(rhr - baseline) : null;
  return (
    <>
      {mwHead('Resting Heart Rate')}
      {mwBig(rhr ?? '—', 'bpm')}
      <div className="sc-delta" style={{ color: 'var(--dim)' }}>
        {delta != null ? `${delta <= 0 ? '▼' : '▲'} ${Math.abs(delta)} vs baseline` : baseline != null ? `Baseline: ${baseline}bpm` : 'No baseline yet'}
      </div>
    </>
  );
}

function StreakBadgeWidget({ s }) {
  const val = computeTrainingStreak(s?.workouts);
  return (
    <>
      {mwHead('Training Streak')}
      {mwBig(val, val === 1 ? 'day' : 'days', val > 7 ? 'var(--forest)' : val > 3 ? 'var(--gold)' : 'var(--ink)')}
    </>
  );
}

function StepsBarWidget({ s }) {
  const steps = s?.today?.steps != null ? Math.round(s.today.steps * 1000) : null;
  const target = 10000;
  const p = steps != null ? pct(steps, target) : 0;
  return (
    <>
      {mwHead('Steps Today')}
      {mwBig(steps != null ? steps.toLocaleString() : '—')}
      <div style={{ height: 5, background: 'var(--paper2)', marginTop: 8, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: p >= 80 ? 'var(--forest)' : 'var(--gold)' }} />
      </div>
      <div className="sc-delta" style={{ color: 'var(--dim)' }}>{p}% of {target.toLocaleString()}</div>
    </>
  );
}

function InsightNuggetWidget({ briefing }) {
  const line = briefing?.headline || briefing?.pullQuote;
  return (
    <>
      {mwHead("Today's Read")}
      <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}>
        {line || 'No briefing generated yet today.'}
      </div>
    </>
  );
}

// Peak physical performance tracks the circadian core-temperature rhythm,
// which troughs shortly before habitual waking and peaks roughly 10-12h
// after it (Atkinson & Reilly, "Circadian Variation in Sports Performance",
// Sports Med 21(4), 1996) -- and that offset is anchored to the athlete's
// own wake time rather than a fixed clock time, since peak-performance
// timing has been shown to shift with individual chronotype (Facer-Childs &
// Brandstaetter, Curr Biol 25(4), 2015). wakeTimeMs comes from the real
// Apple Health sleep session (see shortcutParsing.js's computeSleepMetrics),
// not a population-average clock time -- so with no synced sleep data there
// is genuinely nothing to personalize from, and the widget says so rather
// than falling back to an invented default.
function TrainingWindowWidget({ s }) {
  const wake = s?.today?.wakeTimeMs;
  if (wake == null) {
    return (
      <>
        {mwHead('Optimal Training Window')}
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>Sync sleep data (Apple Health) to personalize this.</div>
      </>
    );
  }
  const fmt = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const from = wake + 10 * 3600000, to = wake + 12 * 3600000;
  const now = Date.now();
  const inWindow = now >= from && now <= to;
  return (
    <>
      {mwHead('Optimal Training Window')}
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: inWindow ? 'var(--forest)' : 'var(--ink)' }}>
        {fmt(from)}–{fmt(to)}
      </div>
      <div className="sc-delta" style={{ color: 'var(--dim)' }}>{inWindow ? 'In window now' : '10–12h after waking'}</div>
    </>
  );
}

function MuscleFocusWidget({ guidance }) {
  const top = guidance?.muscleFocus?.[0];
  if (!top) {
    return (
      <>
        {mwHead("Today's Muscle Focus")}
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>No weekly guidance yet.</div>
      </>
    );
  }
  return (
    <>
      {mwHead("Today's Muscle Focus")}
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, textTransform: 'capitalize', color: 'var(--ink)' }}>{top.name}</div>
      <div className="sc-delta" style={{ color: 'var(--dim)', marginBottom: 8 }}>{top.freshness}% fresh</div>
      {top.muscles?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {top.muscles.slice(0, 6).map(m => (
            <span key={m} className="prof-btn" style={{ cursor: 'default' }}>{m}</span>
          ))}
        </div>
      )}
    </>
  );
}

function weightDeltaFor(weights) {
  if (!weights?.length) return null;
  const latest = weights.at(-1);
  const latestT = new Date(latest.date).getTime();
  const weekAgo = weights.find(w => new Date(w.date).getTime() >= latestT - 7 * 86400000) || weights[0];
  if (weekAgo === latest) return null;
  return { latest, from: weekAgo, delta: Math.round((latest.value - weekAgo.value) * 10) / 10 };
}

function WeightDeltaWidget({ s }) {
  const d = weightDeltaFor(s?.weights);
  if (!d) {
    return (
      <>
        {mwHead('Body Weight')}
        {mwBig(s?.weights?.at(-1)?.value ?? '—', 'kg')}
      </>
    );
  }
  return (
    <>
      {mwHead('Body Weight · 7D')}
      {mwBig(d.latest.value, 'kg', d.delta > 0 ? 'var(--ember)' : d.delta < 0 ? 'var(--forest)' : 'var(--ink)')}
      <div className="sc-delta" style={{ color: 'var(--dim)' }}>{d.delta > 0 ? '+' : ''}{d.delta}kg since {d.from.date}</div>
    </>
  );
}

function VolumePaceWidget({ guidance }) {
  if (!guidance) {
    return (
      <>
        {mwHead('Weekly Volume Pace')}
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>No weekly guidance yet.</div>
      </>
    );
  }
  const done = guidance.sessionsCompletedThisWeek ?? 0;
  const target = guidance.liftSessionsTarget || 1;
  const p = pct(done, target);
  return (
    <>
      {mwHead('Weekly Volume Pace')}
      {mwBig(`${done}/${target}`, 'strength')}
      <div style={{ height: 5, background: 'var(--paper2)', marginTop: 8, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: p >= 80 ? 'var(--forest)' : 'var(--gold)' }} />
      </div>
      {guidance.cardioSessionsTarget > 0 && (
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>+ {guidance.cardioSessionsTarget} cardio target</div>
      )}
    </>
  );
}

const MICRO_WIDGET_COMPONENTS = {
  hydration: HydrationRingWidget,
  rhr: RHRTickerWidget,
  streak: StreakBadgeWidget,
  steps: StepsBarWidget,
  insight: InsightNuggetWidget,
  trainWindow: TrainingWindowWidget,
  muscleFocus: MuscleFocusWidget,
  weightDelta: WeightDeltaWidget,
  volumePace: VolumePaceWidget,
};

export function MicroWidget({ id, s, briefing, guidance }) {
  const Cmp = MICRO_WIDGET_COMPONENTS[id];
  if (!Cmp) return null;
  return (
    <section style={{ padding: '16px 18px' }}>
      <Cmp s={s} briefing={briefing} guidance={guidance} />
    </section>
  );
}
