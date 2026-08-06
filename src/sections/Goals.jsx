import React, { useState } from 'react';
// Reuses the same e1RM formula the backend and S7 (Personal Records) use —
// no second copy of the math (CLAUDE.md already flags duplicated e1RM
// formulas as a past defect).
import strengthStandardsPkg from '../../functions/strengthStandards.js';
const { e1rm: calcE1RM } = strengthStandardsPkg;
// Same reasoning: GOAL_METRICS (which metrics a goal type accepts) is the
// exact table POST /profile's validateGoals() enforces server-side — a
// second copy here could silently drift from what the server actually
// accepts.
import goalsAndActivitiesPkg from '../../functions/goalsAndActivities.js';
const GOAL_METRICS = goalsAndActivitiesPkg.GOAL_METRICS;
import { api } from '../shared.js';

const GOAL_LABELS = {
  fatLoss: 'Lose Fat', muscle: 'Gain Muscle / Strength', cardio: 'Improve Cardiovascular Health',
  flexibility: 'Improve Flexibility', sport: 'Improve in a Sport',
};
const PRIORITY_LABELS = { primary: 'Primary', secondary: 'Secondary', minor: 'Minor' };
const PRIORITY_ORDER = { primary: 0, secondary: 1, minor: 2 };
const PRIORITY_TIER_OPTIONS = ['primary', 'secondary', 'minor'];
// Labels/units for editing — same metric keys GOAL_METRICS validates,
// display strings only (mirrors the onboarding step's GOAL_METRIC_OPTIONS
// in app.jsx, which isn't exported/shared since it's onboarding-specific
// copy like exercise-name placeholder text).
const METRIC_LABELS = {
  weight: 'Bodyweight', bodyFat: 'Body Fat %', lift: 'A specific lift',
  ffm: 'Fat-Free Mass', ffmi: 'FFMI', rhr: 'Resting Heart Rate',
  benchmark: 'Benchmark time (e.g. 5k)', vo2max: 'VO₂ Max',
};
const METRIC_UNITS = { weight: 'kg', bodyFat: '%', lift: 'kg', ffm: 'kg', ffmi: '', rhr: 'bpm', vo2max: '' };

// Same shape validateGoals() (functions/goalsAndActivities.js) enforces for
// a concrete goal — checked client-side so Save only fires a request that
// can actually succeed, not a second copy of the validation rule itself
// (the server call still runs validateGoals() independently either way).
function draftValid(d) {
  if (!d.concrete) return true;
  if (!d.targetDate) return false;
  if (d.target == null || d.target === '') return false;
  const metrics = GOAL_METRICS[d.type];
  if (metrics) {
    if (!metrics.includes(d.metric)) return false;
    if (d.metric === 'lift' && !d.exercise) return false;
    if (d.metric === 'benchmark' && !d.benchmarkLabel) return false;
  }
  return true;
}

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

export function S8({ s, refresh }) {
  const goals = s?.profile?.goals || [];
  const sorted = [...goals].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  // editingIndex refers into `goals` (unsorted, save order), not `sorted` —
  // sorting reorders references, not objects, so goals.indexOf(g) below
  // stays valid regardless of display order.
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const startEdit = (idx, g) => { setEditingIndex(idx); setDraft({ ...g }); setSaveError(''); };
  const cancelEdit = () => { setEditingIndex(null); setDraft(null); setSaveError(''); };
  const updateDraft = patch => setDraft(d => ({ ...d, ...patch }));

  const saveEdit = async () => {
    if (!draftValid(draft)) { setSaveError('Fill in the required fields before saving.'); return; }
    const out = { type: draft.type, priority: draft.priority, concrete: !!draft.concrete };
    if (draft.concrete) {
      out.targetDate = draft.targetDate;
      const metrics = GOAL_METRICS[draft.type];
      if (metrics) {
        out.metric = draft.metric;
        out.target = parseFloat(draft.target);
        if (draft.metric === 'lift') out.exercise = draft.exercise;
        if (draft.metric === 'benchmark') out.benchmarkLabel = draft.benchmarkLabel;
      } else {
        out.target = draft.target;
      }
    }
    const next = goals.map((g, i) => (i === editingIndex ? out : g));
    setSaving(true);
    setSaveError('');
    try {
      // Full-array replace, same as onboarding's saveGoals — POST /profile
      // sets db.profile.goals = body.goals wholesale (functions/index.js),
      // so the edited entry has to travel alongside every other goal
      // unchanged, not sent alone.
      const profile = await api('profile', { method: 'POST', body: JSON.stringify({ goals: next }), throwOnError: true });
      refresh({ ...s, profile });
      setEditingIndex(null);
      setDraft(null);
    } catch {
      setSaveError('Couldn’t save — check your connection and try again.');
    }
    setSaving(false);
  };

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
        {sorted.map((g) => {
          const idx = goals.indexOf(g);
          const isEditing = editingIndex === idx;
          const cur = g.concrete ? currentValueFor(g, s) : null;
          const trend = !g.concrete ? passiveTrendFor(g.type, s) : null;
          const metrics = GOAL_METRICS[g.type];
          return (
            <div key={idx} style={{ padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{GOAL_LABELS[g.type] || g.type}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                    {PRIORITY_LABELS[g.priority] || g.priority}
                  </span>
                  {!isEditing && (
                    <button className="prof-btn" style={{ fontSize: 8, padding: '4px 8px' }} onClick={() => startEdit(idx, g)}>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {!isEditing ? (
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
              ) : (
                <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--rule)' }}>
                  <div className="ob-label" style={{ marginTop: 0 }}>Priority</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {PRIORITY_TIER_OPTIONS.map(p => (
                      <button key={p} className={`prof-btn${draft.priority === p ? ' solid' : ''}`} onClick={() => updateDraft({ priority: p })}>
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>

                  <div className="ob-label">Target</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    <button className={`prof-btn${!draft.concrete ? ' solid' : ''}`} onClick={() => updateDraft({ concrete: false })}>No specific target</button>
                    <button className={`prof-btn${draft.concrete ? ' solid' : ''}`} onClick={() => updateDraft({ concrete: true })}>Set a target</button>
                  </div>

                  {draft.concrete && (
                    <>
                      {metrics && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                          {metrics.map(m => (
                            <button key={m} className={`prof-btn${draft.metric === m ? ' solid' : ''}`} onClick={() => updateDraft({ metric: m })}>
                              {METRIC_LABELS[m] || m}
                            </button>
                          ))}
                        </div>
                      )}
                      {draft.metric === 'lift' && (
                        <input className="prof-input" style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                          placeholder="Exercise, e.g. Barbell Bench Press"
                          value={draft.exercise || ''} onChange={e => updateDraft({ exercise: e.target.value })} />
                      )}
                      {draft.metric === 'benchmark' && (
                        <input className="prof-input" style={{ width: '100%', textAlign: 'left', marginBottom: 10 }}
                          placeholder="What, e.g. 5k"
                          value={draft.benchmarkLabel || ''} onChange={e => updateDraft({ benchmarkLabel: e.target.value })} />
                      )}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        {metrics ? (
                          <input className="prof-input" style={{ flex: 1, width: 'auto', textAlign: 'left' }} type="number" inputMode="decimal"
                            placeholder={`Target${METRIC_UNITS[draft.metric] ? ` (${METRIC_UNITS[draft.metric]})` : ''}`}
                            value={draft.target ?? ''} onChange={e => updateDraft({ target: e.target.value })} />
                        ) : (
                          <input className="prof-input" style={{ flex: 1, width: 'auto', textAlign: 'left' }}
                            placeholder="Target, e.g. sub-25min 5k"
                            value={draft.target ?? ''} onChange={e => updateDraft({ target: e.target.value })} />
                        )}
                        <input className="prof-input" style={{ flex: 1, width: 'auto', textAlign: 'left' }} type="date"
                          value={draft.targetDate || ''} onChange={e => updateDraft({ targetDate: e.target.value })} />
                      </div>
                    </>
                  )}

                  {saveError && (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 8 }}>{saveError}</div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="prof-btn solid" style={{ padding: '6px 14px' }} disabled={saving || !draftValid(draft)} onClick={saveEdit}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="prof-btn" style={{ padding: '6px 14px' }} disabled={saving} onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
