import React, { useState } from 'react';
import { api } from '../shared.js';
// Reuses the same e1RM formula the backend and S7 (Personal Records) use —
// no second copy of the math (CLAUDE.md already flags duplicated e1RM
// formulas as a past defect).
import strengthStandardsPkg from '../../functions/strengthStandards.js';
const { e1rm: calcE1RM } = strengthStandardsPkg;

// Single source of truth for goal defs/priorities/metrics and the payload
// shape — Onboarding step 2 and Settings' Training Goals editor (app.jsx)
// both import these too rather than keeping their own copies.
// FEATURES.md #21 -- five goal types. Strength and Hypertrophy stay one
// mechanism per George's correction (same progressive-overload training,
// different rep range) -- that's already captured by the existing usual-rep-
// range fields in Training Background, not a second goal here.
export const GOAL_DEFS = [
  { key: 'fatLoss', label: 'Lose Fat', desc: 'Calorie deficit, preserve muscle' },
  { key: 'muscle', label: 'Gain Muscle / Strength', desc: 'Progressive overload — rep range below sets the emphasis' },
  { key: 'cardio', label: 'Improve Cardiovascular Health', desc: 'Heart rate, endurance, conditioning' },
  { key: 'flexibility', label: 'Improve Flexibility', desc: 'Mobility and range of motion' },
  { key: 'sport', label: 'Improve in a Sport', desc: 'Sport-specific performance' },
];
export const GOAL_PRIORITIES = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'minor', label: 'Minor' },
];
// Metrics for a concrete goal's target, per type -- flexibility/sport are
// free text (nothing in the app measures either), so they're absent here.
export const GOAL_METRIC_OPTIONS = {
  fatLoss: [{ value: 'weight', label: 'Bodyweight', unit: 'kg' }, { value: 'bodyFat', label: 'Body Fat %', unit: '%' }],
  muscle: [{ value: 'lift', label: 'A specific lift', unit: 'kg' }, { value: 'ffm', label: 'Fat-Free Mass', unit: 'kg' }, { value: 'ffmi', label: 'FFMI', unit: '' }],
  cardio: [{ value: 'rhr', label: 'Resting Heart Rate', unit: 'bpm' }, { value: 'benchmark', label: 'Benchmark time (e.g. 5k)', unit: '' }, { value: 'vo2max', label: 'VO₂ Max', unit: '' }],
};
// Shapes a raw trainingGoals draft (as edited by the GOAL_DEFS card UI,
// concrete/metric/target/etc. all still loose strings) into the payload
// /profile's validateGoals expects. Shared by Onboarding step 2, Settings'
// Training Goals editor, and this panel's own Edit button so the three
// can't quietly diverge — this exact transform used to be copy-pasted.
export function buildGoalsPayload(goals) {
  return goals.map(g => {
    const out = { type: g.type, priority: g.priority, concrete: !!g.concrete };
    if (!g.concrete) return out;
    out.targetDate = g.targetDate;
    if (GOAL_METRIC_OPTIONS[g.type]) {
      out.metric = g.metric;
      out.target = parseFloat(g.target);
      if (g.metric === 'lift') out.exercise = g.exercise;
      if (g.metric === 'benchmark') out.benchmarkLabel = g.benchmarkLabel;
    } else {
      out.target = g.target;
    }
    return out;
  });
}

const GOAL_LABELS = {
  fatLoss: 'Lose Fat', muscle: 'Gain Muscle / Strength', cardio: 'Improve Cardiovascular Health',
  flexibility: 'Improve Flexibility', sport: 'Improve in a Sport',
};
const PRIORITY_LABELS = { primary: 'Primary', secondary: 'Secondary', minor: 'Minor' };
const PRIORITY_ORDER = { primary: 0, secondary: 1, minor: 2 };
const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '6px 0', background: 'transparent', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' };

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

// The edit form for one goal card — toggle to add/remove it, then (if
// added) priority and optional target. Same fields/flow as Onboarding step
// 2 and Settings' Training Goals editor (app.jsx), just scoped to this
// panel's own local draft.
function GoalEditor({ draft, setDraft }) {
  const goalFor = key => draft.find(g => g.type === key);
  const toggleGoal = key => setDraft(gs => gs.some(g => g.type === key)
    ? gs.filter(g => g.type !== key) : [...gs, { type: key, priority: 'secondary', concrete: false }]);
  const updateGoal = (key, patch) => setDraft(gs => gs.map(g => g.type === key ? { ...g, ...patch } : g));

  return (
    <div style={{ padding: '12px 0' }}>
      {GOAL_DEFS.map(gd => {
        const g = goalFor(gd.key);
        const metrics = GOAL_METRIC_OPTIONS[gd.key];
        const metricDef = metrics?.find(m => m.value === g?.metric);
        return (
          <div key={gd.key} style={{ marginBottom: 10 }}>
            <button className={`ob-goal-card${g ? ' selected' : ''}`} style={{ width: '100%' }} onClick={() => toggleGoal(gd.key)}>
              <div className="ob-goal-card-title">{gd.label}</div>
              <div className="ob-goal-card-desc">{gd.desc}</div>
            </button>
            {g && (
              <div style={{ padding: '10px 12px', border: '1px solid var(--rule)', borderTop: 'none' }}>
                <div className="ob-label" style={{ marginTop: 0 }}>Priority</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {GOAL_PRIORITIES.map(p => (
                    <button key={p.value} className={`prof-btn${g.priority === p.value ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { priority: p.value })}>{p.label}</button>
                  ))}
                </div>

                <div className="ob-label">Target</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  <button className={`prof-btn${!g.concrete ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { concrete: false })}>No specific target</button>
                  <button className={`prof-btn${g.concrete ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { concrete: true })}>Set a target</button>
                </div>

                {g.concrete && (
                  <>
                    {metrics && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                        {metrics.map(m => (
                          <button key={m.value} className={`prof-btn${g.metric === m.value ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { metric: m.value })}>{m.label}</button>
                        ))}
                      </div>
                    )}
                    {g.metric === 'lift' && (
                      <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Exercise, e.g. Barbell Bench Press"
                        value={g.exercise || ''} onChange={e => updateGoal(gd.key, { exercise: e.target.value })} />
                    )}
                    {g.metric === 'benchmark' && (
                      <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="What, e.g. 5k"
                        value={g.benchmarkLabel || ''} onChange={e => updateGoal(gd.key, { benchmarkLabel: e.target.value })} />
                    )}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                      {metrics ? (
                        <input style={{ ...inputStyle, flex: 1 }} type="number" inputMode="decimal"
                          placeholder={`Target${metricDef?.unit ? ` (${metricDef.unit})` : ''}`} value={g.target || ''} onChange={e => updateGoal(gd.key, { target: e.target.value })} />
                      ) : (
                        <input style={{ ...inputStyle, flex: 1 }} placeholder="Target, e.g. sub-25min 5k"
                          value={g.target || ''} onChange={e => updateGoal(gd.key, { target: e.target.value })} />
                      )}
                      <input style={{ ...inputStyle, flex: 1 }} type="date" value={g.targetDate || ''} onChange={e => updateGoal(gd.key, { targetDate: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function S8({ s, refresh }) {
  const goals = s?.profile?.goals || [];
  const sorted = [...goals].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => { setDraft(goals.map(g => ({ ...g }))); setError(''); setEditing(true); };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const profile = await api('profile', { method: 'POST', body: JSON.stringify({ goals: buildGoalsPayload(draft) }), throwOnError: true });
      refresh({ ...s, profile });
      setEditing(false);
    } catch {
      setError('Save failed — check every concrete goal has a target and date, then try again.');
    }
    setSaving(false);
  };

  return (
    <section id="s8" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s8-headline">
        <div className="kicker">Goals</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>Your<br />Goals</div>
        <div className="deck" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span>{goals.length} goal{goals.length !== 1 ? 's' : ''} set</span>
          {!editing && <button className="prof-btn" onClick={startEdit}>Edit</button>}
        </div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} data-tour="s8-list">
        {editing ? (
          <>
            <GoalEditor draft={draft} setDraft={setDraft} />
            {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="prof-btn solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="prof-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {!goals.length && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>
                No goals set yet — tap Edit above to add some.
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
          </>
        )}
      </div>
    </section>
  );
}
