import React, { useState, useEffect, useRef } from 'react';
import { api, pct, roundCal, todayLocalStr } from '../shared.js';
import { AreaChart } from '../charts.jsx';
import muscleTaxonomyPkg from '../../functions/muscleTaxonomy.js';
const { ALL_MUSCLES } = muscleTaxonomyPkg;

// ── S4: FUEL ─────────────────────────────────────────────────────────────────
export function S4({ s, refresh }) {
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const mealLog = s?.nutritionLog || [];
  const water = s?.waterToday ?? 0;
  const waterTarget = s?.profile?.waterTarget || 7;
  const today = todayLocalStr();
  const todayLog = mealLog.filter(m => m.date === today);

  const cal = n.calories || 0;
  const calTarget = mt.calories || 2400;
  const short = calTarget - cal;
  const exactCal = s?.profile?.exactCalories !== false;

  // Form state
  const [label, setLabel] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [calories, setCalories] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [description, setDescription] = useState('');
  const [logging, setLogging] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [scanMode, setScanMode] = useState('meal');
  const [portion, setPortion] = useState(1);
  const [analysed, setAnalysed] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  // True only for a barcode lookup's actual per-100g label values — photo
  // and text-description estimates are Gemini's guess at the whole portion
  // already (e.g. "large portion"), not a per-100g reference, so the grams
  // calculator (which multiplies by grams/100) would silently scale an
  // already-whole-portion estimate as if it were a per-100g figure.
  const [gramBased, setGramBased] = useState(false);
  const nowHHMM = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const [mealTime, setMealTime] = useState(nowHHMM());
  // Small/Medium/Large estimates from Gemini for a meal photo or text
  // description (see applyAnalysis) — null falls back to the old single-
  // estimate + x0.5/1/1.5/2 multiplier flow (still used for label-photo
  // scans, which read one fixed per-serving value off the label itself).
  const [portionOptions, setPortionOptions] = useState(null);
  const [selectedPortionIdx, setSelectedPortionIdx] = useState(1);

  // Tab + barcode state
  const [foodTab, setFoodTab] = useState('log');
  const [barcode, setBarcode] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeErr, setBarcodeErr] = useState('');
  const [grams, setGrams] = useState('100');
  const [recentFoods, setRecentFoods] = useState([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [historyLog, setHistoryLog] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedHistoryDate, setExpandedHistoryDate] = useState(null);

  const [camOpen, setCamOpen] = useState(false);
  const [camErr, setCamErr] = useState('');
  const photoRef = useRef();
  const uploadRef = useRef();
  const videoRef = useRef();
  const camStreamRef = useRef(null);
  const camDetectorRef = useRef(null);
  const camRafRef = useRef(null);
  const baseNutrition = useRef({ calories: 0, protein: 0, carbs: 0, fat: 0 });

  const applyPortion = (mult, base) => {
    setCalories(base.calories ? String(Math.round(base.calories * mult)) : '');
    setProtein(base.protein ? String(Math.round(base.protein * mult)) : '');
    setCarbs(base.carbs ? String(Math.round(base.carbs * mult)) : '');
    setFat(base.fat ? String(Math.round(base.fat * mult)) : '');
  };

  const applyGrams = (g, base100) => {
    const m = (parseFloat(g) || 100) / 100;
    setCalories(base100.calories ? String(Math.round(base100.calories * m)) : '');
    setProtein(base100.protein ? String(Math.round(base100.protein * m * 10) / 10) : '');
    setCarbs(base100.carbs ? String(Math.round(base100.carbs * m * 10) / 10) : '');
    setFat(base100.fat ? String(Math.round(base100.fat * m * 10) / 10) : '');
  };

  const applyPortionOption = (opt) => {
    setCalories(String(Math.round(opt.calories || 0)));
    setProtein(String(opt.protein || 0));
    setCarbs(String(opt.carbs || 0));
    setFat(String(opt.fat || 0));
  };

  // Meal photo / text description now return three sized estimates
  // (data.portions) instead of one guess — this applies the middle
  // ("Medium") one by default and stashes the rest for the Portion picker.
  // A nutrition-label photo still returns the old flat shape (a label has
  // one real per-serving value, no size to guess), so that falls back to
  // the pre-existing single-estimate + multiplier flow.
  const applyAnalysis = (data) => {
    if (Array.isArray(data.portions) && data.portions.length) {
      const mid = Math.floor((data.portions.length - 1) / 2);
      setPortionOptions(data.portions);
      setSelectedPortionIdx(mid);
      applyPortionOption(data.portions[mid]);
      baseNutrition.current = { ...data.portions[mid] };
    } else {
      setPortionOptions(null);
      const base = { calories: data.calories || 0, protein: data.protein || 0, carbs: data.carbs || 0, fat: data.fat || 0 };
      baseNutrition.current = base;
      setPortion(1);
      applyPortion(1, base);
    }
    if (data.description) setDescription(data.description);
    if (!label && data.name) setLabel(data.name);
  };

  const fillForm = (food) => {
    setLabel(food.name || '');
    setCalories(String(food.calories || ''));
    setProtein(String(food.protein || ''));
    setCarbs(String(food.carbs || ''));
    setFat(String(food.fat || ''));
    setDescription(food.description || '');
    baseNutrition.current = { calories: food.calories || 0, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0 };
    setAnalysed(true);
    setPortion(1);
    setGramBased(false);
    setPortionOptions(null);
  };

  const stopCamera = () => {
    if (camRafRef.current) cancelAnimationFrame(camRafRef.current);
    if (camStreamRef.current) camStreamRef.current.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    setCamOpen(false);
  };

  // Without this, navigating away mid-scan (without tapping Close) leaves
  // the camera stream running indefinitely in the background — camera light
  // stays on and battery drains until the tab itself is closed. Also revokes
  // whatever photo-preview blob URL is current if the component unmounts
  // with one still set (the replace-time revoke in handlePhoto only covers
  // the case where a new photo overwrites an old preview, not unmount).
  const photoPreviewRef = useRef(null);
  useEffect(() => { photoPreviewRef.current = photoPreview; }, [photoPreview]);
  useEffect(() => {
    return () => {
      if (camRafRef.current) cancelAnimationFrame(camRafRef.current);
      if (camStreamRef.current) camStreamRef.current.getTracks().forEach(t => t.stop());
      if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    };
  }, []);

  const onBarcodeDetected = async (code) => {
    stopCamera();
    setBarcode(code);
    setBarcodeLoading(true); setBarcodeErr('');
    try {
      const d = await api('food/barcode', { method: 'POST', body: JSON.stringify({ barcode: code }) });
      if (d.product) { fillForm(d.product); setGrams('100'); setGramBased(true); }
      else setBarcodeErr('Product not found — try entering barcode manually');
    } catch { setBarcodeErr('Lookup failed'); }
    setBarcodeLoading(false);
  };

  const openCameraScanner = async () => {
    setCamErr(''); setCamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
      camStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Use BarcodeDetector API if available (Chrome/Edge on Android)
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'] });
        camDetectorRef.current = detector;
        const scan = async () => {
          if (!videoRef.current || !camStreamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) { onBarcodeDetected(barcodes[0].rawValue); return; }
          } catch {}
          camRafRef.current = requestAnimationFrame(scan);
        };
        videoRef.current?.addEventListener('loadedmetadata', () => { camRafRef.current = requestAnimationFrame(scan); }, { once: true });
      }
      // iOS Safari fallback: no BarcodeDetector — show camera, user taps capture button
    } catch (e) {
      setCamOpen(false);
      setCamErr('Camera access denied — enter barcode manually');
    }
  };

  const handleBarcode = async () => {
    const b = barcode.trim();
    if (!b) return;
    setBarcodeLoading(true); setBarcodeErr('');
    try {
      const d = await api('food/barcode', { method: 'POST', body: JSON.stringify({ barcode: b }) });
      if (d.product) {
        fillForm(d.product);
        setGrams('100');
        setGramBased(true);
        setFoodTab('log');
      } else { setBarcodeErr('Product not found'); }
    } catch { setBarcodeErr('Lookup failed'); }
    setBarcodeLoading(false);
  };

  const handlePhoto = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalysing(true); setDescription(''); setAnalysed(false); setPhotoErr(''); setGramBased(false); setPortionOptions(null);
    const previewUrl = URL.createObjectURL(file);
    // Revoke the previous preview's blob URL before replacing it — otherwise
    // every photo scanned in a session leaks a blob reference for the tab's
    // lifetime (createObjectURL objects are only released on revoke or
    // document unload, not garbage collection of the string).
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = await api('nutrition/analyze', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: ev.target.result, mode: scanMode }),
        });
        if (data.error) throw new Error(data.error);
        applyAnalysis(data);
        setAnalysed(true);
      } catch (e) { setPhotoErr(e.message || 'Photo analysis failed — try again.'); }
      setAnalysing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [foodDesc, setFoodDesc] = useState('');
  const handleDescribe = async () => {
    if (!foodDesc.trim()) return;
    setAnalysing(true); setDescription(''); setAnalysed(false); setPhotoErr(''); setGramBased(false); setPortionOptions(null);
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    try {
      const data = await api('nutrition/analyze', {
        method: 'POST',
        body: JSON.stringify({ description: foodDesc }),
      });
      if (data.error) throw new Error(data.error);
      applyAnalysis(data);
      setAnalysed(true);
    } catch (e) { setPhotoErr(e.message || 'Estimate failed — try again.'); }
    setAnalysing(false);
  };

  // Posts a meal and returns {entry, nutritionToday} without touching app state — callers
  // decide when to refresh, so a loop of several posts can accumulate and refresh once
  // instead of each call clobbering the previous one with a stale s.nutritionLog closure.
  const postMeal = async (body) => {
    const { entry, ...nutritionToday } = await api('nutrition', { method: 'POST', body: JSON.stringify(body) });
    return { entry, nutritionToday };
  };

  const logMeal = async () => {
    if (!calories && !protein) return;
    setLogging(true);
    const { entry, nutritionToday } = await postMeal({ label, protein: +protein || 0, carbs: +carbs || 0, fat: +fat || 0, calories: +calories || 0, time: mealTime, ...(description.trim() ? { description: description.trim() } : {}) });
    setLabel(''); setProtein(''); setCarbs(''); setFat(''); setCalories(''); setDescription(''); setAnalysed(false); setMealTime(nowHHMM()); setPortionOptions(null);
    setLogging(false);
    refresh({ ...s, nutritionToday, nutritionLog: [...(s?.nutritionLog || []), entry] });
  };

  const logFood = async (food) => {
    const { entry, nutritionToday } = await postMeal({ label: food.name || food.label, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0, calories: food.calories || 0, ...(food.description ? { description: food.description } : {}) });
    refresh({ ...s, nutritionToday, nutritionLog: [...(s?.nutritionLog || []), entry] });
  };

  const editEntryTime = async (id, time) => {
    if (!id) return;
    refresh({ ...s, nutritionLog: (s?.nutritionLog || []).map(e => e.id === id ? { ...e, time } : e) });
    await api(`nutrition/log/${id}`, { method: 'PATCH', body: JSON.stringify({ time }) });
  };

  // Cross off a logged meal — removes it and unwinds it from the day's
  // running totals (server does the actual subtraction; nutritionToday
  // here just mirrors what it returns rather than recomputing locally).
  const deleteMealEntry = async (id) => {
    if (!id) return;
    const data = await api(`nutrition/log/${id}`, { method: 'DELETE' });
    refresh({ ...s, nutritionToday: data.nutritionToday, nutritionLog: (s?.nutritionLog || []).filter(e => e.id !== id) });
  };

  const logWater = async (delta) => {
    const data = await api('water', { method: 'POST', body: JSON.stringify({ delta }) });
    refresh({ ...s, waterToday: data.today });
  };

  const loadRecent = async () => {
    if (recentLoaded) return;
    const d = await api('food/recent');
    setRecentFoods(d.recent || []);
    setRecentLoaded(true);
  };

  const loadTemplates = async () => {
    if (templatesLoaded) return;
    const d = await api('food/templates');
    setTemplates(d.templates || []);
    setTemplatesLoaded(true);
  };

  const deleteTemplate = async (name) => {
    await api(`food/template/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setTemplates(t => t.filter(x => x.name !== name));
  };

  const loadHistory = async () => {
    if (historyLoaded) return;
    const d = await api('nutrition/history?days=7');
    setHistoryLog(d.log || []);
    setHistoryLoaded(true);
  };

  const deleteHistoryEntry = async (id) => {
    if (!id) return;
    const data = await api(`nutrition/log/${id}`, { method: 'DELETE' });
    setHistoryLog(h => h.filter(e => e.id !== id));
    // The deleted entry might be today's, in which case the log/totals
    // shown on the Log tab need to stay in sync too.
    if ((s?.nutritionLog || []).some(e => e.id === id)) {
      refresh({ ...s, nutritionToday: data.nutritionToday, nutritionLog: (s?.nutritionLog || []).filter(e => e.id !== id) });
    }
  };

  const saveAsTemplate = async () => {
    const nm = templateName.trim();
    if (!nm || (!calories && !protein)) return;
    setSavingTemplate(true);
    const item = { name: label || nm, protein: +protein||0, carbs: +carbs||0, fat: +fat||0, calories: +calories||0 };
    await api('food/template', { method: 'POST', body: JSON.stringify({ name: nm, items: [item] }) });
    setTemplateName('');
    setTemplates([]);
    setTemplatesLoaded(false);
    setSavingTemplate(false);
  };

  const switchTab = t => {
    setFoodTab(t);
    if (t === 'recent') loadRecent();
    if (t === 'templates') loadTemplates();
    if (t === 'history') loadHistory();
  };

  const tabStyle = (t) => ({
    fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '5px 12px', border: 'none', cursor: 'pointer',
    background: foodTab === t ? 'var(--ink)' : 'none',
    color: foodTab === t ? 'var(--paper)' : 'var(--dim)',
  });

  return (
    <section id="s4" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }}>
        <div className="kicker">Nutrition · Today</div>
        <div className="headline">
          {cal > 0 ? `${roundCal(cal, exactCal).toLocaleString()} kcal —` : 'Empty Plate —'}<br />
          {cal > 0 ? (short > 0 ? `${roundCal(short, exactCal).toLocaleString()} Short` : 'On Target') : 'Nothing on the Docket'}
        </div>
        {!exactCal && cal > 0 && (
          <div className="deck" style={{ marginTop: 2 }}>Approximate, to the nearest 300 kcal. Turn on exact calories in Settings → Nutrition.</div>
        )}
      </div>

      <div className="fade" style={{ flexShrink: 0 }}>
        {[
          { label: 'Calories', val: roundCal(cal, exactCal), tgt: roundCal(calTarget, exactCal), unit: 'kcal', color: 'var(--ink)' },
          { label: 'Protein',  val: n.protein||0,  tgt: mt.protein || 160, unit: 'g',    color: 'var(--navy)'   },
          { label: 'Carbs',    val: n.carbs||0,    tgt: mt.carbs || 250,   unit: 'g',    color: 'var(--forest)' },
          { label: 'Fat',      val: n.fat||0,      tgt: mt.fat || 75,      unit: 'g',    color: 'var(--ember)'  },
        ].map(({ label: lbl, val, tgt, unit, color }) => {
          const p = tgt ? pct(val, tgt) : 0;
          return (
            <div key={lbl} className="macro">
              <div className="macro-lbl"><span>{lbl.toUpperCase()}</span><span>{val} / {tgt} {unit} &nbsp;{p}%</span></div>
              <div className="macro-track"><div className="macro-fill" style={{ width: `${p}%`, background: color }} /></div>
            </div>
          );
        })}
        <div className="macro">
          <div className="macro-lbl"><span>WATER</span><span>{water} / {waterTarget} gl &nbsp;{waterTarget ? pct(water, waterTarget) : 0}%</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="macro-track" style={{ flex: 1 }}><div className="macro-fill" style={{ width: `${waterTarget ? pct(water, waterTarget) : 0}%`, background: 'var(--navy)' }} /></div>
            <button onClick={() => logWater(-1)} disabled={water <= 0} style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--rule)', background: 'none', cursor: water > 0 ? 'pointer' : 'default', fontSize: 13, lineHeight: 1, color: 'var(--ink)' }}>−</button>
            <button onClick={() => logWater(1)} style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--rule)', background: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: 'var(--ink)' }}>+</button>
          </div>
        </div>
      </div>

      {s?.hydrationCurve?.length > 1 && (
        <div className="fade" style={{ flexShrink: 0, marginTop: 2 }}>
          <div className="chart-wrap" style={{ flex: '0 0 44px', position: 'relative' }}>
            <AreaChart data={s.hydrationCurve} color="var(--navy)" id="hydration" />
          </div>
          <div className="sc-delta" style={{ color: 'var(--dim)', marginTop: 2 }}>
            Hydration now: {s.hydrationNow ?? '—'}%
            {s?.waterStats ? ` · ${s.waterStats.streak}d streak · ${s.waterStats.hitRate}% hit rate` : ''}
          </div>
        </div>
      )}

      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="rule-thin" />

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: 12 }}>
          {[['log','Log'],['recent','Recent'],['templates','Templates'],['history','History']].map(([t,l]) => (
            <button key={t} style={tabStyle(t)} onClick={() => switchTab(t)}>{l}</button>
          ))}
        </div>

        {/* LOG TAB */}
        {foodTab === 'log' && (
          <>
            {/* Barcode lookup */}
            {camOpen && (
              <div className="cam-overlay">
                <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
                <div className="cam-frame" />
                <div className="cam-lbl">
                  {'BarcodeDetector' in window ? 'Point at barcode — auto-detecting' : 'Point at barcode then tap Capture'}
                </div>
                {'BarcodeDetector' in window ? null : (
                  <button
                    style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#fff', border: 'none', padding: '12px 32px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                    onClick={async () => {
                      const canvas = document.createElement('canvas');
                      canvas.width = videoRef.current.videoWidth;
                      canvas.height = videoRef.current.videoHeight;
                      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
                      // iOS fallback: use file input to let user take photo instead
                      stopCamera();
                      photoRef.current?.click();
                    }}>
                    Capture
                  </button>
                )}
                <button className="cam-close" onClick={stopCamera}>Close</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              <button className="nutri-photo-btn" style={{ flexShrink: 0, background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }} onClick={openCameraScanner}>
                Scan
              </button>
              <input
                style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
                placeholder="or enter barcode…"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBarcode()}
                inputMode="numeric"
              />
              <button className="nutri-photo-btn" style={{ minWidth: 52, flexShrink: 0 }} onClick={handleBarcode} disabled={barcodeLoading}>
                {barcodeLoading ? '…' : 'Go'}
              </button>
            </div>
            {camErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>{camErr}</div>}
            {barcodeErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{barcodeErr}</div>}

            {/* Photo analysis */}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
            <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            <div className="scan-mode-toggle">
              <button className={`scan-mode-btn${scanMode === 'meal' ? ' active' : ''}`} onClick={() => setScanMode('meal')}>Meal Photo</button>
              <button className={`scan-mode-btn${scanMode === 'label' ? ' active' : ''}`} onClick={() => setScanMode('label')}>Nutrition Label</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {photoPreview && (
                <img src={photoPreview} className={`scan-preview${analysing ? ' analysing' : ''}`} alt="scan preview" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="nutri-photo-btn" onClick={() => photoRef.current?.click()} disabled={analysing}>
                    {analysing ? 'Analysing…' : photoPreview ? 'Scan Again' : 'Take Photo'}
                  </button>
                  <button className="nutri-photo-btn" onClick={() => uploadRef.current?.click()} disabled={analysing}>
                    Upload Photo
                  </button>
                </div>
                {/* AI-scanned description now lands in the editable field below
                    in the manual log form instead of a separate read-only
                    caption here — showing the same text twice was redundant,
                    and the editable version lets it actually be corrected. */}
                {photoErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 4, lineHeight: 1.4 }}>{photoErr}</div>}
              </div>
            </div>

            {/* No photo? Describe it instead — same AI estimate, from text */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              <input
                style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
                placeholder="or describe what you ate…"
                value={foodDesc}
                onChange={e => setFoodDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDescribe()}
                disabled={analysing}
              />
              <button className="nutri-photo-btn" style={{ minWidth: 68, flexShrink: 0 }} onClick={handleDescribe} disabled={analysing || !foodDesc.trim()}>
                {analysing ? '…' : 'Estimate'}
              </button>
            </div>

            {/* Gram calculator (shown after barcode lookup) */}
            {analysed && baseNutrition.current.calories > 0 && gramBased && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>Grams:</span>
                <input
                  style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'right' }}
                  value={grams} inputMode="numeric"
                  onChange={e => { setGrams(e.target.value); applyGrams(e.target.value, baseNutrition.current); }}
                />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>g</span>
              </div>
            )}

            {analysed && portionOptions && (
              <div className="portion-row">
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em' }}>Portion:</span>
                {portionOptions.map((opt, i) => (
                  <button key={i} className="portion-btn"
                    style={{ background: selectedPortionIdx === i ? 'var(--ink)' : 'none', color: selectedPortionIdx === i ? 'var(--paper)' : 'var(--ink)' }}
                    onClick={() => { setSelectedPortionIdx(i); applyPortionOption(opt); baseNutrition.current = { ...opt }; }}>
                    {opt.label} · {opt.calories}kcal
                  </button>
                ))}
              </div>
            )}

            {analysed && !gramBased && !portionOptions && (
              <div className="portion-row">
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em' }}>Portion:</span>
                {[0.5, 1, 1.5, 2].map(m => (
                  <button key={m} className="portion-btn"
                    style={{ background: portion === m ? 'var(--ink)' : 'none', color: portion === m ? 'var(--paper)' : 'var(--ink)' }}
                    onClick={() => { setPortion(m); applyPortion(m, baseNutrition.current); }}>
                    ×{m}
                  </button>
                ))}
              </div>
            )}

            {/* Manual log form */}
            <div className="nutri-log-form">
              <div className="nutri-log-row">
                <input className="nutri-input wide" placeholder="Meal name…" value={label} onChange={e => setLabel(e.target.value)} />
              </div>
              <div className="nutri-log-row">
                {/* Pre-filled from photo analysis when there is one, but always
                    editable and independent of it — a manually-typed note is
                    just as valid as an AI-scan description. */}
                <input className="nutri-input wide" placeholder="Description / notes (optional)…" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="nutri-log-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.1em', color: 'var(--dim)' }}>TIME</span>
                  <input className="nutri-input narrow" type="time" value={mealTime} onChange={e => setMealTime(e.target.value)} />
                </div>
                {[['Protein', protein, setProtein], ['Carbs', carbs, setCarbs], ['Fat', fat, setFat], ['kcal', calories, setCalories]].map(([lbl, val, set]) => (
                  <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.1em', color: 'var(--dim)' }}>{lbl.toUpperCase()}</span>
                    <input className="nutri-input narrow" type="number" placeholder="0" value={val} onChange={e => set(e.target.value)} inputMode="numeric" />
                  </div>
                ))}
                <button className="nutri-submit-btn" onClick={logMeal} disabled={logging || (!calories && !protein)}>
                  {logging ? '…' : 'Log'}
                </button>
              </div>
              {analysed && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', marginTop: 4 }}>
                  {gramBased ? 'Per 100g values — adjust grams above' : 'AI estimate — verify against actual amount'}
                </div>
              )}
              {/* Save as template */}
              {(calories || protein) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input
                    style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '5px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
                    placeholder="Save as template…"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                  />
                  <button className="nutri-submit-btn" onClick={saveAsTemplate} disabled={!templateName.trim() || savingTemplate}>
                    {savingTemplate ? '…' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {/* Today's meal log */}
            {todayLog.length > 0 && (
              <>
                <div className="rule-thin" />
                <table className="data-table">
                  <thead><tr><th>Meal</th><th>Time</th><th>Pro</th><th>kcal</th><th /></tr></thead>
                  <tbody>
                    {todayLog.map((m, i) => (
                      <tr key={i}>
                        <td>
                          {m.label || m.name || 'Meal'}
                          {m.description && (
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontWeight: 400, marginTop: 1 }}>{m.description}</div>
                          )}
                        </td>
                        <td>
                          {m.id ? (
                            <input type="time" value={m.time || ''} onChange={e => editEntryTime(m.id, e.target.value)}
                              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, border: 'none', background: 'none', color: 'var(--ink)', padding: 0 }} />
                          ) : (m.time || '—')}
                        </td>
                        <td className="up">{m.protein ? `${m.protein}g` : '—'}</td>
                        <td className="hi">{m.calories || '—'}</td>
                        <td>
                          {m.id && (
                            <button onClick={() => deleteMealEntry(m.id)} aria-label={`Cross off ${m.label || m.name || 'meal'}`}
                              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, border: 'none', background: 'none', color: 'var(--dim)', cursor: 'pointer', padding: '4px 6px' }}>
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {/* RECENT TAB */}
        {foodTab === 'recent' && (
          <div>
            {!recentLoaded && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Loading…</div>}
            {recentLoaded && recentFoods.length === 0 && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>No recent foods yet.</div>
            )}
            {recentFoods.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{f.label || f.name || 'Food'}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                    {f.protein ? `${f.protein}g P` : ''}{f.carbs ? ` · ${f.carbs}g C` : ''}{f.fat ? ` · ${f.fat}g F` : ''}{f.calories ? ` · ${f.calories}kcal` : ''}
                  </div>
                  {f.description && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2, fontStyle: 'italic' }}>{f.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { fillForm({ name: f.label || f.name, ...f }); switchTab('log'); }}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => logFood(f)}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: 'none', background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer' }}>
                    + Log
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TEMPLATES TAB */}
        {foodTab === 'templates' && (
          <div>
            {!templatesLoaded && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Loading…</div>}
            {templatesLoaded && templates.length === 0 && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>
                No templates yet — log a meal and save it as a template from the Log tab.
              </div>
            )}
            {templates.map((t, i) => {
              const totals = t.items.reduce((a, item) => ({
                calories: a.calories + (item.calories || 0),
                protein: a.protein + (item.protein || 0),
              }), { calories: 0, protein: 0 });
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{t.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
                      {t.items.length} item{t.items.length !== 1 ? 's' : ''} · {totals.protein}g P · {totals.calories}kcal
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => deleteTemplate(t.name)}
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, padding: '4px 8px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)', cursor: 'pointer' }}>
                      ×
                    </button>
                    <button onClick={async () => {
                        let log = s?.nutritionLog || [], today = s?.nutritionToday;
                        for (const item of t.items) {
                          const r = await postMeal({ label: item.name || item.label, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0, calories: item.calories || 0 });
                          log = [...log, r.entry]; today = r.nutritionToday;
                        }
                        refresh({ ...s, nutritionToday: today, nutritionLog: log });
                      }}
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', padding: '4px 8px', border: 'none', background: 'var(--ink)', color: 'var(--paper)', cursor: 'pointer' }}>
                      + Log All
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY TAB — last 7 days */}
        {foodTab === 'history' && (
          <div>
            {!historyLoaded && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Loading…</div>}
            {historyLoaded && historyLog.length === 0 && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Nothing logged in the last 7 days.</div>
            )}
            {(() => {
              const byDate = {};
              for (const m of historyLog) (byDate[m.date] ||= []).push(m);
              const dates = Object.keys(byDate).sort().reverse();
              return dates.map(d => {
                const meals = byDate[d];
                const totals = meals.reduce((a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0) }), { calories: 0, protein: 0 });
                const isOpen = expandedHistoryDate === d;
                return (
                  <div key={d} className="hist-row" onClick={() => setExpandedHistoryDate(isOpen ? null : d)}>
                    <div className="hist-row-hdr">
                      <span className="hist-date">{d}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{meals.length} meal{meals.length !== 1 ? 's' : ''} · {totals.protein}g P · {totals.calories}kcal</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 'auto' }}>{isOpen ? '▲' : '▸'}</span>
                    </div>
                    {isOpen && (
                      <div className="hist-detail">
                        {meals.map((m, i) => (
                          <div key={i} className="hist-ex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span>
                              {m.time ? `${m.time} · ` : ''}{m.label || m.name || 'Meal'}
                              {m.protein ? ` · ${m.protein}g P` : ''} · {m.calories || 0}kcal
                              {m.description && <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 1 }}>{m.description}</div>}
                            </span>
                            {m.id && (
                              <button onClick={e => { e.stopPropagation(); deleteHistoryEntry(m.id); }} aria-label={`Cross off ${m.label || m.name || 'meal'}`}
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, border: 'none', background: 'none', color: 'var(--dim)', cursor: 'pointer', padding: '4px 6px', flexShrink: 0 }}>
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </section>
  );
}

// ── S5: FATIGUE ───────────────────────────────────────────────────────────────
export const BODY_BASE = '';
// ALL_MUSCLES is imported (derived from EXERCISE_DB) — note the body-map SVGs
// (body-anterior.svg etc.) only have data-muscle regions drawn for the
// original 18 muscles, so newer ones (mid-delt, rotator-cuff, tibialis, ...)
// will show up in fatigue scores and the muscle-sensitivity/soreness pickers
// but won't highlight on the diagram until someone adds regions for them.

// Ranked muscles (MUSCLE_EXERCISE_MAP in muscleStandards.js) that have no
// data-muscle region in body-anterior/lateral/posterior.svg — same gap
// documented above for the fatigue diagram, just affecting a different
// (smaller, since fewer muscles are ranked than tracked) set: gluteus
// medius/abductors, brachialis, and brachioradialis have no dedicated
// artwork; mid-delt only has generic "shoulders" regions, not split by head.
export const MUSCLES_WITHOUT_BODY_REGION = ['abductors', 'brachialis', 'brachioradialis', 'mid-delt'];

// Every muscle the SVGs actually have a data-muscle region for (verified
// directly against the 3 files) — any diagram-based muscle picker (Soreness,
// Adaptation) can only be clickable for these; the rest still need a
// fallback button list alongside it, same reasoning as
// MUSCLES_WITHOUT_BODY_REGION above. Named for Soreness, where it was first
// introduced, but not soreness-specific.
export const SORENESS_DIAGRAM_MUSCLES = [
  'abs', 'adductors', 'biceps', 'calves', 'chest', 'erectors', 'forearms',
  'front-delt', 'glutes', 'hamstrings', 'lats', 'obliques', 'quads',
  'rear-delt', 'rhomboids', 'traps', 'triceps',
];
