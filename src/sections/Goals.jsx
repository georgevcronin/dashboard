import React from 'react';
// Reuses the same e1RM formula the backend and S7 (Personal Records) use —
// no second copy of the math (CLAUDE.md already flags duplicated e1RM
// formulas as a past defect).
import strengthStandardsPkg from '../../functions/strengthStandards.js';
const { e1rm: calcE1RM } = strengthStandardsPkg;

const GOAL_LABELS = {
  fatLoss: 'Lose Fat', muscle: 'Gain Muscle / Strength', cardio: 'Improve Cardiovascular Health',
  flexibility: 'Improve Flexibility', sport: 'Improve in a Sport',
};
const PRIORITY_LABELS = { primary: 'Primary', secondary: 'Secondary', minor: 'Minor' };
const PRIORITY_ORDER = { primary: 0, secondary: 1, minor: 2 };

function ffmFrom(weightKg, bodyFatPct) {
  if (!weightKg || bodyFatPct == null) return null;
  return Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
}
function ffmiFrom(ffmKg, heightCm) {
  if (!ffmKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((ffmKg / (heightM * heightM)) * 10) / 10;
}
function bestE1rmFor(lifts, exercise) {
  if (!exercise) return null;
  const key = exercise.toLowerCase();
  let best = null;
  for (const l of lifts || []) {
    if ((l.exercise || '').toLowerCase() !== key || !(l.kg > 0) || !(l.reps > 0)) continue;
    const e1 = calcE1RM(l.kg, l.reps);
    if (!best || e1 > best) best = e1;
  }
  return best ? Math.round(best) : null;
}

// Current value for a concrete goal's metric, from data Press already
// tracks — null when there's nothing to compare against yet. Never
// fabricates a number (ARCHITECTURE.md's "no fabricated numbers" principle);
// benchmark/vo2max stay null until the Running Subsystem (#95-113) exists.
function currentValueFor(g, s) {
  const weight = s?.weights?.at(-1)?.value ?? null;
  const bodyFat = s?.bodyFat30?.at(-1)?.pct ?? s?.bodyFatToday ?? null;
  switch (g.metric) {
    case 'weight': return weight != null ? { value: weight, unit: 'kg' } : null;
    case 'bodyFat': return bodyFat != null ? { value: bodyFat, unit: '%' } : null;
    case 'lift': { const v = bestE1rmFor(s?.lifts, g.exercise); return v != null ? { value: v, unit: 'kg e1RM' } : null; }
    case 'ffm': { const v = ffmFrom(weight, bodyFat); return v != null ? { value: v, unit: 'kg FFM' } : null; }
    case 'ffmi': { const v = ffmiFrom(ffmFrom(weight, bodyFat), s?.profile?.heightCm); return v != null ? { value: v, unit: ' FFMI' } : null; }
    case 'rhr': { const v = s?.baselines?.rhr ?? s?.today?.rhr ?? null; return v != null ? { value: v, unit: 'bpm' } : null; }
    default: return null;
  }
}

function formatTarget(g) {
  if (g.metric === 'lift') return `${g.exercise}: ${g.target}kg`;
  if (g.metric === 'benchmark') return `${g.benchmarkLabel}: ${g.target}`;
  if (g.metric === 'weight') return `${g.target}kg`;
  if (g.metric === 'bodyFat') return `${g.target}%`;
  if (g.metric === 'ffm') return `${g.target}kg FFM`;
  if (g.metric === 'ffmi') return `FFMI ${g.target}`;
  if (g.metric === 'rhr') return `${g.target}bpm resting HR`;
  if (g.metric === 'vo2max') return `VO₂max ${g.target}`;
  return `${g.target}`; // flexibility / sport — free text
}

// Vague goals have no target, but still show a passive trend where Press
// already tracks the relevant number continuously — flexibility/sport and
// a vague muscle goal have nothing clean to show, so they stay a plain tag.
function passiveTrendFor(type, s) {
  if (type === 'fatLoss') { const v = s?.weights?.at(-1)?.value; return v != null ? `${v}kg, latest` : null; }
  if (type === 'cardio') { const v = s?.baselines?.rhr ?? s?.today?.rhr; return v != null ? `${v}bpm resting HR` : null; }
  return null;
}

export function S8({ s }) {
  const goals = s?.profile?.goals || [];
  const sorted = [...goals].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  return (
    <section id="s8" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }}>
        <div className="kicker">Goals</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>Your<br />Goals</div>
        <div className="deck">{goals.length} goal{goals.length !== 1 ? 's' : ''} set</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!goals.length && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>
            No goals set yet — add some from Settings → Profile & Training.
          </div>
        )}
        {sorted.map((g, i) => {
          const cur = g.concrete ? currentValueFor(g, s) : null;
          const trend = !g.concrete ? passiveTrendFor(g.type, s) : null;
          return (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{GOAL_LABELS[g.type] || g.type}</div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', flexShrink: 0 }}>
                  {PRIORITY_LABELS[g.priority] || g.priority}
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
                {g.concrete ? (
                  <>
                    {cur && <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{cur.value}{cur.unit} → </span>}
                    Target: {formatTarget(g)}{g.targetDate ? ` by ${g.targetDate}` : ''}
                    {!cur && ' — not tracked yet'}
                  </>
                ) : (
                  trend || 'Ongoing — no specific target'
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
