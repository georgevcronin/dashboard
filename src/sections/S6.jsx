import React, { useState, useRef, useEffect } from 'react';
import { api, pct, todayLocalStr } from '../shared.js';
import { AreaChart } from '../charts.jsx';

const TREND_METRICS = [
  { key: 'weight', label: 'Weight', unit: 'kg', color: 'var(--ink)' },
  { key: 'bodyFat', label: 'Body Fat', unit: '%', color: 'var(--ember)' },
  { key: 'recovery', label: 'Recovery', unit: '/100', color: 'var(--gold)' },
  { key: 'sleepScore', label: 'Sleep Score', unit: '/100', color: 'var(--plum)' },
  { key: 'sleep', label: 'Sleep', unit: 'h', color: 'var(--plum)' },
  { key: 'hrv', label: 'HRV', unit: 'ms', color: 'var(--navy)' },
  { key: 'squat', label: 'Squat e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'bench', label: 'Bench e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'deadlift', label: 'Deadlift e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'overheadPress', label: 'OHP e1RM', unit: 'kg', color: 'var(--forest)' },
  { key: 'row', label: 'Row e1RM', unit: 'kg', color: 'var(--forest)' },
];
const TREND_RANGES = [[14, '14D'], [30, '30D'], [90, '90D'], [365, '1Y']];

export function TrendsPanel() {
  const [metric, setMetric] = useState('weight');
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`trends?metric=${metric}&range=${range}`).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [metric, range]);

  const meta = TREND_METRICS.find(m => m.key === metric);
  const series = data?.series || [];
  const values = series.map(p => p.value);
  const first = values[0], last = values.at(-1);
  const delta = first != null && last != null ? Math.round((last - first) * 10) / 10 : null;

  return (
    <div style={{ marginBottom: 4 }} data-tour="s6-trends">
      <div className="kicker" style={{ margin: '0 0 10px' }}>Long-Term Trends</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={metric} onChange={e => setMetric(e.target.value)}
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}>
          {TREND_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {TREND_RANGES.map(([r, l]) => (
            <button key={r} onClick={() => setRange(r)}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '5px 10px', border: '1px solid var(--rule)', background: range === r ? 'var(--ink)' : 'none', color: range === r ? 'var(--paper)' : 'var(--ink)', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 70, position: 'relative', marginBottom: 4 }}>
        {loading ? (
          <div style={{ fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '20px 0' }}>Loading…</div>
        ) : values.length > 1 ? (
          <AreaChart data={values} color={meta.color} id={`trend-${metric}`} />
        ) : (
          <div style={{ fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '20px 0' }}>Not enough data yet for this range.</div>
        )}
      </div>
      {values.length > 1 && (
        <div className="sc-delta" style={{ color: 'var(--dim)' }}>
          {first} → {last} {meta.unit} {delta != null && delta !== 0 ? `(${delta > 0 ? '+' : ''}${delta})` : ''}
        </div>
      )}
    </div>
  );
}

export function S6({ s, refresh }) {
  const supplements = s?.supplements || [];
  const suppLogToday = s?.supplementLogToday || [];
  const suppLoggedSet = new Set(suppLogToday.map(e => e.name));
  const [togglingSupp, setTogglingSupp] = useState('');
  const [weightVal, setWeightVal] = useState('');
  const [bfVal, setBfVal] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const MEASURE_TYPES = ['neck','chest','waist','hips','left arm','right arm','left thigh','right thigh'];
  const [measureType, setMeasureType] = useState('waist');
  const [measureVal, setMeasureVal] = useState('');
  const [measureUnit, setMeasureUnit] = useState('cm');
  const [savingMeasure, setSavingMeasure] = useState(false);
  const measurements = s?.measurements || [];

  const getLatest = (type) => {
    const entries = measurements.filter(m => m.type === type).sort((a,b) => a.ts - b.ts);
    return entries.at(-1) || null;
  };
  const getPrev = (type) => {
    const entries = measurements.filter(m => m.type === type).sort((a,b) => a.ts - b.ts);
    return entries.length >= 2 ? entries.at(-2) : null;
  };

  const logMeasurement = async () => {
    if (!measureVal) return;
    setSavingMeasure(true);
    const type = measureType, value = parseFloat(measureVal), unit = measureUnit;
    await api('measurements', { method: 'POST', body: JSON.stringify({ type, value, unit }) });
    setMeasureVal('');
    setSavingMeasure(false);
    const now = Date.now();
    refresh({ ...s, measurements: [...(s?.measurements || []), { id: now, date: todayLocalStr(), type, value, unit, ts: now }] });
  };

  const toggleSuppLog = async (supp) => {
    setTogglingSupp(supp.name);
    const data = await api('supplement/log', { method: 'POST', body: JSON.stringify({ name: supp.name, dose: supp.dose }) });
    setTogglingSupp('');
    const today = todayLocalStr();
    refresh({ ...s, supplementLogToday: data.logged
      ? [...(s?.supplementLogToday || []), { date: today, name: supp.name, dose: supp.dose || '', ts: Date.now() }]
      : (s?.supplementLogToday || []).filter(e => e.name !== supp.name) });
  };

  const photos = s?.photosMeta || [];
  const [photoNote, setPhotoNote] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef();

  const handleAddPhoto = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const note = photoNote;
      const data = await api('photos', { method: 'POST', body: JSON.stringify({ image: reader.result, note }) });
      setPhotoNote('');
      setUploadingPhoto(false);
      refresh({ ...s, photosMeta: [...(s?.photosMeta || []), { id: data.id, date: todayLocalStr(), note, url: data.url }] });
    };
    reader.readAsDataURL(file);
  };

  const deletePhoto = async id => {
    await api(`photos/${id}`, { method: 'DELETE' });
    refresh({ ...s, photosMeta: (s?.photosMeta || []).filter(p => p.id !== id) });
  };
  return (
    <section id="s6" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s6-headline">
        <div className="kicker">Profile</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>{s?.profile?.name || 'Profile'}</div>
      </div>

      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {supplements.length > 0 && (
          <div style={{ marginBottom: 16 }} data-tour="s6-supplements">
            <div className="kicker" style={{ margin: '0 0 8px' }}>Today's Supplements</div>
            {supplements.map(sup => {
              const done = suppLoggedSet.has(sup.name);
              return (
                <div key={sup.name} className="supp-item">
                  <button className={`supp-check${done ? ' done' : ''}`}
                    onClick={() => toggleSuppLog(sup)} disabled={togglingSupp === sup.name}>
                    {done ? '✓' : ''}
                  </button>
                  <span className="supp-name">{sup.name}</span>
                  <span className="supp-meta">{[sup.dose, sup.timing].filter(Boolean).join(' · ')}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="rule-thin" />

        <div className="kicker" style={{ margin: '16px 0 10px' }}>Body Data</div>
        {(() => {
          const latestWeight = s?.weights?.at(-1) ?? null;
          const prevWeight = s?.weights?.length >= 2 ? s.weights.at(-2) : null;
          const weightDelta = latestWeight && prevWeight ? parseFloat((latestWeight.value - prevWeight.value).toFixed(1)) : null;
          const bf = s?.bodyFatToday ?? null;
          return (latestWeight || bf != null) ? (
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              {latestWeight && (
                <div className="measure-row" style={{ flex: 1, border: 'none' }}>
                  <span className="measure-lbl">Weight</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="measure-val">{latestWeight.value}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>kg</span>
                    {weightDelta !== null && (
                      <span className="measure-delta" style={{ color: weightDelta < 0 ? 'var(--forest)' : weightDelta > 0 ? 'var(--ember)' : 'var(--dim)' }}>
                        {weightDelta > 0 ? '+' : ''}{weightDelta}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {bf != null && (
                <div className="measure-row" style={{ flex: 1, border: 'none' }}>
                  <span className="measure-lbl">Body Fat</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="measure-val">{bf.toFixed(1)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>%</span>
                  </div>
                </div>
              )}
            </div>
          ) : null;
        })()}
        {s?.composition && (
          <div className="pull" style={{ margin: '2px 0 14px' }}>
            <strong>{s.composition.word}</strong> — {s.composition.note}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }} data-tour="s6-bodydata">
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Weight kg" value={weightVal} onChange={e => setWeightVal(e.target.value)} style={{ flex: 1 }} />
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Body fat %" value={bfVal} onChange={e => setBfVal(e.target.value)} style={{ flex: 1 }} />
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            disabled={(!weightVal && !bfVal) || savingWeight}
            onClick={async () => {
              setSavingWeight(true);
              const patch = {};
              if (weightVal) {
                const r = await api('weight', { method: 'POST', body: JSON.stringify({ kg: parseFloat(weightVal) }) });
                patch.weights = r.weights; patch.composition = r.composition;
              }
              if (bfVal) {
                const r = await api('bodyfat', { method: 'POST', body: JSON.stringify({ pct: parseFloat(bfVal) }) });
                patch.bodyFatToday = r.bodyFatToday; patch.bodyFat30 = r.bodyFat30;
              }
              setWeightVal(''); setBfVal('');
              setSavingWeight(false);
              refresh({ ...s, ...patch });
            }}>
            {savingWeight ? '…' : 'Log'}
          </button>
        </div>
        <div className="rule-thin" style={{ margin: '16px 0' }} />

        <TrendsPanel />

        <div className="rule-thin" style={{ margin: '16px 0' }} />

        <div className="kicker" style={{ margin: '0 0 10px' }}>Measurements</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }} data-tour="s6-measurements">
          {MEASURE_TYPES.map(t => (
            <button key={t} className={`prof-btn${measureType === t ? ' solid' : ''}`}
              onClick={() => setMeasureType(t)} style={{ fontSize: 8, padding: '4px 8px', textTransform: 'capitalize', marginBottom: 4 }}>
              {t}
            </button>
          ))}
        </div>
        {(() => {
          const latest = getLatest(measureType);
          const prev = getPrev(measureType);
          const delta = latest && prev ? parseFloat((latest.value - prev.value).toFixed(1)) : null;
          return latest ? (
            <div className="measure-row" style={{ marginBottom: 8 }}>
              <span className="measure-lbl">{measureType}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="measure-val">{latest.value}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{latest.unit}</span>
                {delta !== null && (
                  <span className="measure-delta" style={{ color: delta < 0 ? 'var(--forest)' : delta > 0 ? 'var(--ember)' : 'var(--dim)' }}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                )}
              </div>
            </div>
          ) : null;
        })()}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="prof-input" type="number" step="0.1" inputMode="decimal"
            placeholder="Value" value={measureVal} onChange={e => setMeasureVal(e.target.value)} style={{ width: 90 }} />
          <div className="ob-unit-toggle">
            {['cm','in'].map(u => (
              <button key={u} className={`ob-unit-btn${measureUnit === u ? ' active' : ''}`} onClick={() => setMeasureUnit(u)}>{u}</button>
            ))}
          </div>
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            onClick={logMeasurement} disabled={!measureVal || savingMeasure}>
            {savingMeasure ? '…' : 'Log'}
          </button>
        </div>

        <div className="rule-thin" style={{ margin: '16px 0' }} />
        <div className="kicker" style={{ margin: '0 0 10px' }}>Progress Photos</div>
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
            {photos.map(p => (
              <div key={p.id} style={{ position: 'relative', flexShrink: 0, width: 84 }}>
                <img src={p.url} alt={p.note || p.date} style={{ width: 84, height: 84, objectFit: 'cover', border: '1px solid var(--rule)', display: 'block' }} />
                <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{p.date}</div>
                <button onClick={() => deletePhoto(p.id)}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'var(--ink)', color: 'var(--paper)', border: 'none', width: 16, height: 16, fontSize: 9, lineHeight: '16px', cursor: 'pointer', padding: 0 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} data-tour="s6-photos">
          <input className="prof-input" placeholder="Note (optional)" value={photoNote} onChange={e => setPhotoNote(e.target.value)} style={{ flex: 1 }} />
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleAddPhoto} />
          <button className="prof-btn solid" style={{ padding: '6px 14px' }}
            disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
            {uploadingPhoto ? '…' : 'Add Photo'}
          </button>
        </div>

      </div>
    </section>
  );
}

// ── S7: PERSONAL RECORDS ──────────────────────────────────────────────────────
export const MOVEMENT_GROUPS = [
  { label: 'Lower Push', keys: ['squat','leg press','lunge','hack squat','bulgarian','step up','leg extension'] },
  { label: 'Lower Pull', keys: ['deadlift','rdl','hip thrust','glute','leg curl','nordic','hamstring'] },
  { label: 'Upper Push', keys: ['bench','chest press','overhead press','shoulder press','dip','fly','push up'] },
  { label: 'Upper Pull', keys: ['pull','row','pulldown','lat','face pull','shrug','trap'] },
  { label: 'Arms', keys: ['curl','bicep','tricep','extension','pushdown','preacher','hammer'] },
  { label: 'Calves & Core', keys: ['calf','raise','abs','crunch','plank','oblique'] },
];

export function groupExercise(name) {
  const n = name.toLowerCase();
  for (const g of MOVEMENT_GROUPS) if (g.keys.some(k => n.includes(k))) return g.label;
  return 'Other';
}
