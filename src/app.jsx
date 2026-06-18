import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";

const T = { bg: "#0a0d0b", panel: "#101512", line: "#1c241f", dim: "#5d6b62", mid: "#8a948d", fg: "#e8ece9", green: "#3ddc84", amber: "#e0b46a", red: "#e07a6a" };
const serif = { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontWeight: 400 };
const label = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.dim };
const card = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20 };
const pill = (a) => ({ padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12, border: "1px solid", borderColor: a ? T.green : T.line, background: a ? "rgba(61,220,132,.1)" : "transparent", color: a ? T.green : T.mid });
const input = { background: "#0c100e", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 13px", color: T.fg, fontSize: 14 };
const API_BASE = "https://us-central1-dashboard-79dbb.cloudfunctions.net/api";
const api = (p, body, method = "POST") => fetch(`${API_BASE}/${p}`, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

function Line({ data, w = 600, h = 140, color = T.green, fill = true }) {
  if (!data || data.length < 2) return <div style={{ ...serif, color: T.dim, fontSize: 14, padding: "20px 0" }}>Log a few days and the chart fills in.</div>;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 20) - 10]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = "g" + color.slice(1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block" }}>
      {fill && <><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} /></>}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="4" fill={color} />
    </svg>
  );
}
function Ring({ pct, size = 150, stroke = 11, color = T.green, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1d2420" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct || 0, 1))} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}
const Back = ({ onClick, title }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18 }}>
    <button onClick={onClick} style={{ ...pill(false), border: "none", paddingLeft: 0 }}>← Home</button>
    <h2 style={{ ...serif, fontSize: 32, margin: 0 }}>{title}</h2>
  </div>
);
const dash = (v, unit = "") => (v == null ? "—" : `${typeof v === "number" ? Math.round(v * 10) / 10 : v}${unit}`);

function Home({ go, s }) {
  const [reco, setReco] = useState(null);
  useEffect(() => { api("recommendation").then((r) => setReco(r.text)).catch(() => {}); }, []);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const hub = (key, title, eyebrow, accent) => (
    <div key={key} onClick={() => go(key)}
      style={{ ...card, cursor: "pointer", minHeight: 130, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: accent ? `linear-gradient(150deg, ${accent}16, ${T.panel} 70%)` : T.panel, transition: "border-color .15s, transform .1s", userSelect: "none" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent || T.green; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.transform = ""; }}
      onMouseDown={e => e.currentTarget.style.transform = "scale(.99)"}
      onMouseUp={e => e.currentTarget.style.transform = "translateY(-1px)"}
    >
      <div style={label}>{eyebrow}</div>
      <div style={{ ...serif, fontSize: 24, marginTop: 4 }}>{title} <span style={{ color: T.dim }}>→</span></div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${T.green}, #1a6b40)`, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)" }} />
        <div>
          <div style={{ ...serif, fontSize: 25 }}>{greet}, <span style={{ color: T.green }}>{s.profile?.name || "friend"}</span></div>
          <div style={label}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
            {s.lastSync && <span style={{ color: T.green }}> · synced {s.lastSync}</span>}</div>
        </div>
      </div>
      {reco && (
        <div style={{ ...card, marginBottom: 14, background: `linear-gradient(150deg, rgba(61,220,132,.07), ${T.panel} 60%)` }}>
          <div style={label}>Today's recommendation</div>
          <div style={{ ...serif, fontSize: 19, marginTop: 4, lineHeight: 1.4 }}>{reco}</div>
        </div>
      )}
      {!s.lastSync && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(224,180,106,.4)" }}>
          <div style={{ ...label, color: T.amber }}>Autosync not connected yet</div>
          <div style={{ fontSize: 13, color: T.mid, marginTop: 4, lineHeight: 1.5 }}>Point Health Auto Export on your iPhone at this server (see README) and your sleep, HRV, weight and workouts will flow in automatically.</div>
        </div>
      )}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        {hub("vitality", "Vitality", `Recovery ${dash(s.today?.recovery, "%")} · Sleep ${dash(s.today?.sleepH, "h")}`, T.green)}
        {hub("train", "Train", `${s.workoutsMonth ?? 0} workouts this month`)}
        {hub("fuel", "Fuel", `${Math.round((s.nutritionToday?.protein || 0))}/${s.macroTargets?.protein || 160}g protein · Water ${s.waterToday ?? 0}/${s.profile?.waterTarget ?? 7}`)}
        {hub("mentor", "Mentor", `${s.thoughts?.length ?? 0} thoughts · ask anything`, T.red)}
        {hub("settings", "Profile", "Name · Height · Targets")}
        {hub("fatigue", "Fatigue", "Muscle heat map · recovery status", "#a48ae0")}
        {hub("plan", "Plan", "16-week programme · 4 phases", "#6ab4e0")}
      </div>
    </>
  );
}

function Vitality({ go, s }) {
  const t = s.today || {};
  return (
    <>
      <Back onClick={() => go("home")} title="Vitality" />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={{ ...card, display: "flex", gap: 20, alignItems: "center" }}>
          <Ring pct={(t.recovery ?? 0) / 100} size={150}>
            <div style={{ fontSize: 36, fontWeight: 600 }}>{dash(t.recovery)}<span style={{ fontSize: 15 }}>%</span></div>
            <div style={{ ...label, color: T.green }}>Recovery</div>
          </Ring>
          <div>
            <div style={{ ...serif, fontSize: 19 }}>{t.recovery == null ? "Waiting for data" : t.recovery >= 80 ? "Primed" : t.recovery >= 55 ? "Solid" : "Run down"}</div>
            <p style={{ fontSize: 13, color: T.mid, lineHeight: 1.5, margin: "4px 0 0" }}>
              {t.recovery == null ? "Recovery appears after a couple of synced nights — it's computed from your HRV vs baseline and sleep." :
                t.recovery >= 80 ? "Fully bounced back. Good day to push intensity." : t.recovery >= 55 ? "Train, but keep something in the tank." : "Walk, hydrate, no important decisions."}
            </p>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Recovery · last 14 days</div>
          <Line data={s.recoveryTrend} h={120} />
          {s.sleepDebtH > 0.5 && <div style={{ marginTop: 10, fontSize: 13, color: T.amber }}>Sleep debt −{s.sleepDebtH}h vs your {s.sleepTarget}h target</div>}
          <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>
            Baselines: HRV {dash(s.baselines?.hrv, " ms")} · RHR {dash(s.baselines?.rhr, " bpm")} · sleep target {s.sleepTarget}h {s.sleepTargetLearned ? "(learned from your best-HRV nights)" : "(default until 7 nights synced)"}
          </div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Sleep · last 14 nights</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 100, marginTop: 8 }}>
            {(s.sleepSeries || []).map((d, i) => {
              const h = typeof d === "object" ? d.h : d;
              return h == null ? null : <div key={i} style={{ flex: 1, height: `${Math.min(h / 9.5, 1) * 100}%`, minHeight: 3, borderRadius: 4, background: h >= s.sleepTarget ? T.green : "#23332a" }} title={`${h}h`} />;
            })}
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>Green = hit your {s.sleepTarget}h target</div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Resting HR · last 14 days</div>
          <Line data={s.rhrSeries} h={100} color="#6ab4e0" />
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>Falling RHR over weeks = improving fitness. A sudden spike often precedes illness or under-recovery.</div>
        </div>
        <div style={{ ...card, gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 18 }}>
          {[["Sleep", dash(t.sleepH, "h"), t.sleepEff ? `${Math.round(t.sleepEff)}% efficiency` : ""], ["Strain", dash(t.strain), `wk avg ${dash(s.strainWkAvg)}`], ["HRV", dash(t.hrv, " ms"), s.baselines?.hrv ? `baseline ${s.baselines.hrv}` : ""], ["Resting HR", dash(t.rhr, " bpm"), s.baselines?.rhr ? `baseline ${s.baselines.rhr}` : ""], ["Steps", t.steps ? Math.round(t.steps).toLocaleString() : "—", "today"]].map(([k, v, sub]) => (
            <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 23, fontWeight: 600, margin: "4px 0 2px" }}>{v}</div><div style={{ fontSize: 11, color: T.dim }}>{sub}</div></div>
          ))}
        </div>
      </div>
    </>
  );
}

function Train({ go, s, refresh }) {
  const [kg, setKg] = useState(""), [ex, setEx] = useState(""), [lkg, setLkg] = useState(""), [reps, setReps] = useState("");
  const weights = (s.weights || []).map((w) => w.value);
  const cur = weights.at(-1);
  const byEx = {};
  (s.lifts || []).forEach((l) => { (byEx[l.exercise] = byEx[l.exercise] || []).push(l); });
  return (
    <>
      <Back onClick={() => go("home")} title="Progress" />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 600 }}>{dash(cur)} <span style={{ fontSize: 15, color: T.mid }}>kg</span></div>
            {weights.length > 1 && <span style={{ background: "rgba(61,220,132,.12)", color: T.green, padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{(cur - weights[0]).toFixed(1)} kg / 30d</span>}
            <span style={{ fontSize: 11, color: T.dim }}>auto-syncs from Apple Health, or log below</span>
          </div>
          <Line data={weights} h={120} />
          {s.composition && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(61,220,132,.06)", border: `1px solid ${T.line}` }}>
              <div style={label}>Composition · last 30 days</div>
              <div style={{ ...serif, fontSize: 18, margin: "3px 0 2px" }}>{s.composition.word}</div>
              <div style={{ fontSize: 12, color: T.mid, lineHeight: 1.5 }}>{s.composition.note}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={kg} onChange={(e) => setKg(e.target.value)} placeholder="kg" inputMode="decimal" style={{ ...input, width: 90 }} />
            <button style={pill(true)} onClick={async () => { if (+kg) { await api("weight", { kg: +kg }); setKg(""); refresh(); } }}>Log weigh-in</button>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Log a lift</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={ex} onChange={(e) => setEx(e.target.value)} placeholder="barbell bench" style={{ ...input, flex: 1, minWidth: 130 }} />
            <input value={lkg} onChange={(e) => setLkg(e.target.value)} placeholder="kg" inputMode="decimal" style={{ ...input, width: 70 }} />
            <input value={reps} onChange={(e) => setReps(e.target.value)} placeholder="reps" inputMode="numeric" style={{ ...input, width: 70 }} />
            <button style={pill(true)} onClick={async () => { if (ex && +lkg) { await api("lift", { exercise: ex.toLowerCase(), kg: +lkg, reps: +reps || 1 }); setEx(""); setLkg(""); setReps(""); refresh(); } }}>Add</button>
          </div>
          {Object.entries(byEx).map(([name, sets]) => {
            const best = Math.max(...sets.map((x) => x.kg)), first = sets[0].kg, last = sets.at(-1);
            return (
              <div key={name} style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid #161c18` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={serif}>{name}</span>
                  <span>{last.kg} kg × {last.reps} {best > first && <span style={{ color: T.green, fontSize: 11 }}>+{best - first} kg since first</span>}</span>
                </div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{sets.length} session{sets.length > 1 ? "s" : ""} · best {best} kg · est 1RM {Math.round(last.kg * (1 + (last.reps || 1) / 30))} kg</div>
              </div>
            );
          })}
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Volume · last 4 weeks <span style={{ color: T.dim, textTransform: "none", letterSpacing: 0 }}>(kg × reps)</span></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 90 }}>
            {(s.liftVolume || []).map((v, i) => {
              const max = Math.max(...(s.liftVolume || [1]), 1);
              return (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: `${(v / max) * 70}px`, minHeight: 3, borderRadius: 4, background: i === 3 ? T.green : "#23332a" }} />
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>{v ? (v / 1000).toFixed(1) + "t" : "—"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>Tonnage trending up while recovery holds = productive overload.</div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Workouts · synced</div>
          {(s.workouts || []).slice(-8).reverse().map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #161c18", fontSize: 13 }}>
              <span>{w.name} <span style={{ color: T.dim, fontSize: 11 }}>· {w.date}</span></span>
              <span style={{ color: T.mid }}>{w.kcal ? Math.round(w.kcal) + " kcal" : ""}</span>
            </div>
          ))}
          {!(s.workouts || []).length && <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Workouts appear here automatically once sync is connected.</div>}
        </div>
      </div>
    </>
  );
}

function Fuel({ go, s, refresh }) {
  const [tab, setTab] = useState("macros");
  const target = s.profile?.waterTarget ?? 7;
  const hist = (s.water || []).map((w) => w.value);
  const mt = s.macroTargets || { calories: 2400, protein: 160, carbs: 250, fat: 75 };
  const nt = s.nutritionToday || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState(mt);
  const [goal, setGoal] = useState(s.macroGoal || "recomp");
  const [meal, setMeal] = useState({ label: "", protein: "", carbs: "", fat: "", calories: "" });

  const macroBar = (name, current, max, color, unit = "g") => {
    const pct = max ? Math.min(current / max, 1.35) : 0;
    const over = current > max;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
          <span style={{ textTransform: "capitalize" }}>{name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: over ? T.amber : T.mid }}>
            {Math.round(current)} / {max}{unit} {over && <span style={{ fontSize: 10 }}>({Math.round(current - max)}+ over)</span>}
          </span>
        </div>
        <div style={{ height: 10, background: "#1d2420", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(pct, 1) * 100}%`, background: over ? T.amber : color, borderRadius: 99, transition: "width .6s" }} />
        </div>
      </div>
    );
  };

  const protPerKg = (s.weights || []).length ? (nt.protein / (s.weights.at(-1).value || 75)).toFixed(1) : null;

  return (
    <>
      <Back onClick={() => go("home")} title="Fuel" />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["macros", "water"].map((t) => <button key={t} style={pill(tab === t)} onClick={() => setTab(t)}>{t === "macros" ? "Macros" : "Water"}</button>)}
      </div>

      {tab === "macros" && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          {/* Today's macros */}
          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={label}>Today's intake</div>
                <div style={{ fontSize: 36, fontWeight: 600, marginTop: 2 }}>{Math.round(nt.calories)} <span style={{ fontSize: 15, color: T.mid }}>/ {mt.calories} kcal</span></div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                {[["P", nt.protein, mt.protein, T.green], ["C", nt.carbs, mt.carbs, "#6ab4e0"], ["F", nt.fat, mt.fat, T.amber]].map(([l, cur, max, c]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <Ring pct={cur / (max || 1)} size={68} stroke={6} color={cur > max ? T.amber : c}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(cur)}</div>
                      <div style={{ fontSize: 8, color: T.dim }}>{l}</div>
                    </Ring>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>/ {max}g</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              {macroBar("protein", nt.protein, mt.protein, T.green)}
              {macroBar("carbs", nt.carbs, mt.carbs, "#6ab4e0")}
              {macroBar("fat", nt.fat, mt.fat, T.amber)}
              {macroBar("calories", nt.calories, mt.calories, T.fg, " kcal")}
            </div>
            {protPerKg && (
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(61,220,132,.06)", border: `1px solid ${T.line}`, fontSize: 13 }}>
                Protein: <b>{protPerKg} g/kg</b> bodyweight today
                {protPerKg >= 1.8 ? <span style={{ color: T.green }}> — on track for recomp</span> : <span style={{ color: T.amber }}> — aim for 1.8-2.2 g/kg</span>}
              </div>
            )}
          </div>

          {/* Quick log */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 10 }}>Quick log a meal</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input value={meal.label} onChange={(e) => setMeal({ ...meal, label: e.target.value })} placeholder="meal name" style={{ ...input, gridColumn: "1 / -1" }} />
              <input value={meal.protein} onChange={(e) => setMeal({ ...meal, protein: e.target.value })} placeholder="protein (g)" inputMode="decimal" style={input} />
              <input value={meal.carbs} onChange={(e) => setMeal({ ...meal, carbs: e.target.value })} placeholder="carbs (g)" inputMode="decimal" style={input} />
              <input value={meal.fat} onChange={(e) => setMeal({ ...meal, fat: e.target.value })} placeholder="fat (g)" inputMode="decimal" style={input} />
              <input value={meal.calories} onChange={(e) => setMeal({ ...meal, calories: e.target.value })} placeholder="kcal (auto if blank)" inputMode="decimal" style={input} />
            </div>
            <button style={{ ...pill(true), width: "100%", marginTop: 10, padding: "10px 0" }} onClick={async () => {
              const p = +meal.protein || 0, c = +meal.carbs || 0, f = +meal.fat || 0;
              const cal = +meal.calories || (p * 4 + c * 4 + f * 9);
              if (p || c || f || cal) { await api("nutrition", { protein: p, carbs: c, fat: f, calories: cal, label: meal.label || "meal" }); setMeal({ label: "", protein: "", carbs: "", fat: "", calories: "" }); refresh(); }
            }}>Log meal</button>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>Leave kcal blank to auto-calculate from macros (P*4 + C*4 + F*9). Or just log from Bevel — it syncs through Apple Health.</div>
            {(s.nutritionLog || []).length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                <div style={{ ...label, marginBottom: 6 }}>Today's meals</div>
                {s.nutritionLog.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #161c18" }}>
                    <span><span style={{ color: T.dim, fontSize: 11 }}>{m.time}</span> {m.label}</span>
                    <span style={{ color: T.mid, fontVariantNumeric: "tabular-nums" }}>{m.protein}p {m.carbs}c {m.fat}f · {m.calories}kcal</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Targets */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={label}>Daily targets</div>
              <div style={{ fontSize: 11, color: T.mid }}>{s.macroMode === "auto" ? "auto · " + s.macroGoal : "manual"}</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 14 }}>
              {["cut", "recomp", "bulk"].map((g) => (
                <button key={g} style={pill(goal === g)} onClick={async () => {
                  setGoal(g);
                  const r = await api("macro-auto", { goal: g });
                  setTargets(r.targets); refresh();
                }}>{g}</button>
              ))}
              <button style={pill(false)} onClick={() => setEditing(!editing)}>{editing ? "done" : "custom"}</button>
            </div>
            {editing ? (
              <div style={{ display: "grid", gap: 8 }}>
                {[["calories", "kcal"], ["protein", "g"], ["carbs", "g"], ["fat", "g"]].map(([k, u]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, width: 60, textTransform: "capitalize" }}>{k}</span>
                    <input value={targets[k]} onChange={(e) => setTargets({ ...targets, [k]: +e.target.value })} type="number" style={{ ...input, flex: 1 }} />
                    <span style={{ fontSize: 11, color: T.dim, width: 30 }}>{u}</span>
                  </div>
                ))}
                <button style={{ ...pill(true), marginTop: 6 }} onClick={async () => { await api("macro-targets", targets); setEditing(false); refresh(); }}>Save targets</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[["Calories", mt.calories, "kcal"], ["Protein", mt.protein, "g"], ["Carbs", mt.carbs, "g"], ["Fat", mt.fat, "g"]].map(([k, v, u]) => (
                  <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{v}<span style={{ fontSize: 11, color: T.dim }}>{u}</span></div></div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: T.dim, marginTop: 12, lineHeight: 1.5 }}>
              <b>Auto-calc:</b> cut = 22 kcal/kg (high protein 2.2g/kg), recomp = 26 kcal/kg (2.0g/kg), bulk = 30 kcal/kg (1.8g/kg). Fat fixed at 1g/kg, carbs fill the remainder. Tap custom to override any number.
            </div>
          </div>

          {/* 14-day protein history */}
          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <div style={{ ...label, marginBottom: 10 }}>Protein · last 14 days</div>
            {(s.nutrition14 || []).length > 1 ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 100 }}>
                  {s.nutrition14.map((d, i) => {
                    const p = d.protein || 0;
                    return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: "100%", height: Math.max(3, (p / (mt.protein * 1.3)) * 80) + "px", borderRadius: 4, background: p >= mt.protein ? T.green : "#23332a" }} />
                    </div>;
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 14, paddingTop: 12, borderTop: "1px solid " + T.line }}>
                  {(() => {
                    const ps = s.nutrition14.map((d) => d.protein || 0).filter(Boolean);
                    const a = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : 0;
                    const hit = ps.filter((p) => p >= mt.protein).length;
                    return [["Daily avg", a + "g"], ["Hit target", hit + "/" + ps.length + " days"], ["Best day", (ps.length ? Math.round(Math.max(...ps)) : 0) + "g"]].map(([k, v]) => (
                      <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
                    ));
                  })()}
                </div>
              </>
            ) : <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Log meals or connect Bevel and the chart builds itself.</div>}
          </div>
        </div>
      )}

      {tab === "water" && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", maxWidth: 760 }}>
        <div style={{ ...card, textAlign: "center", padding: "32px 24px" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Ring pct={(s.waterToday || 0) / target} size={180}>
              <div style={{ ...serif, fontSize: 54, lineHeight: 1 }}>{s.waterToday || 0}</div>
              <div style={{ color: T.dim, fontSize: 12 }}>of {target} bottles</div>
            </Ring>
          </div>
          <button onClick={async () => { await api("water", { delta: 1 }); refresh(); }}
            style={{ width: "100%", marginTop: 20, padding: "13px 0", borderRadius: 999, border: "none", background: T.fg, color: T.bg, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Drank a bottle +</button>
          <button onClick={async () => { await api("water", { delta: -1 }); refresh(); }} style={{ marginTop: 10, background: "none", border: "none", color: T.dim, fontSize: 12, cursor: "pointer" }}>undo −</button>
        </div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={label}>Body water · live estimate</div>
            <div style={{ fontSize: 13, color: (s.hydrationNow ?? 0) >= 70 ? T.green : T.amber }}>{dash(s.hydrationNow, "%")} now</div>
          </div>
          <Line data={s.hydrationCurve} h={110} color={(s.hydrationNow ?? 0) >= 70 ? T.green : T.amber} />
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>
            Each bottle lifts the level ~12%, then decays with a 4-hour half-life — so a bottle at 8 AM is half gone by noon. Keep the curve above 70% and you never play catch-up.
          </div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Last 14 days</div>
          {hist.length ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 110, marginTop: 10 }}>
              {hist.map((v, i) => <div key={i} style={{ flex: 1, height: `${Math.min(v / target, 1) * 100}%`, minHeight: 3, borderRadius: 4, background: v >= target ? T.green : "#23332a" }} />)}
            </div>
          ) : <div style={{ ...serif, color: T.dim, fontSize: 14, marginTop: 16 }}>Log a few days and the chart fills in.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            {[["Streak", `${s.waterStats?.streak ?? 0}d`], ["Best run", `${s.waterStats?.best ?? 0}d`], ["Hit rate", `${s.waterStats?.hitRate ?? 0}%`], ["Daily avg", s.waterStats?.avg ?? 0]].map(([k, v]) => (
              <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>
      )}
    </>
  );
}

function Money({ go, s, refresh }) {
  const [name, setName] = useState(""), [type, setType] = useState("bank"), [amt, setAmt] = useState("");
  const entries = s.finance || [];
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const groups = {};
  entries.forEach((e, i) => { (groups[e.type] = groups[e.type] || []).push({ ...e, i }); });
  return (
    <>
      <Back onClick={() => go("home")} title="Net worth" />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={label}>Total net worth</div>
          <div style={{ fontSize: "clamp(30px,4.5vw,44px)", fontWeight: 600 }}>USD {total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          {(s.nwHistory || []).length > 1 && (
            <div style={{ marginTop: 10 }}>
              <Line data={s.nwHistory.map((h) => h.total)} h={120} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.dim }}>
                <span>{s.nwHistory[0].date}</span><span>{s.nwHistory.at(-1).date}</span>
              </div>
            </div>
          )}
          {entries.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", height: 9, borderRadius: 99, overflow: "hidden" }}>
                {Object.entries(groups).map(([g, list], i) => {
                  const sum = list.reduce((a, e) => a + Math.max(0, e.amount), 0);
                  const pos = entries.reduce((a, e) => a + Math.max(0, e.amount), 0) || 1;
                  const colors = { bank: T.green, stocks: "#6ab4e0", crypto: T.amber, other: "#a48ae0", debt: T.red };
                  return <div key={g} style={{ width: `${(sum / pos) * 100}%`, background: colors[g] || T.dim }} title={g} />;
                })}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: T.mid }}>
                {Object.entries(groups).map(([g, list]) => {
                  const sum = list.reduce((a, e) => a + Math.max(0, e.amount), 0);
                  const pos = entries.reduce((a, e) => a + Math.max(0, e.amount), 0) || 1;
                  const colors = { bank: T.green, stocks: "#6ab4e0", crypto: T.amber, other: "#a48ae0", debt: T.red };
                  return <span key={g}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: colors[g] || T.dim, marginRight: 5 }} />{g} {Math.round((sum / pos) * 100)}%</span>;
                })}
              </div>
            </div>
          )}
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Add asset / liability</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" style={{ ...input, flex: 1, minWidth: 110 }} />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...input, width: 110 }}>
              {["bank", "stocks", "crypto", "other", "debt"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount (− for debt)" inputMode="decimal" style={{ ...input, width: 150 }} />
            <button style={pill(true)} onClick={async () => { if (name && +amt) { await api("finance", { name, type, amount: +amt }); setName(""); setAmt(""); refresh(); } }}>Add</button>
          </div>
        </div>
        <div style={card}>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} style={{ marginBottom: 14 }}>
              <div style={{ ...serif, fontSize: 16, marginBottom: 4, textTransform: "capitalize" }}>{g}</div>
              {list.map((e) => (
                <div key={e.i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #161c18", fontSize: 13 }}>
                  <span>{e.name} <span style={{ color: T.dim, fontSize: 11 }}>· {e.date}</span></span>
                  <span style={{ color: e.amount < 0 ? T.red : T.fg }}>
                    {e.amount.toLocaleString()} <button onClick={async () => { await api("finance/" + e.i, {}, "DELETE"); refresh(); }} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}>×</button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {!entries.length && <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Add your accounts and the breakdown builds itself.</div>}
        </div>
      </div>
    </>
  );
}

function Mentor({ go, s, refresh }) {
  const [msgs, setMsgs] = useState([]), [inp, setInp] = useState(""), [busy, setBusy] = useState(false), [thought, setThought] = useState("");
  const prompts = ["How is my week looking?", "Am I drinking enough water?", "What should I focus on today?", "How is my recovery trending?"];
  async function send(text) {
    const q = (text ?? inp).trim(); if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInp(""); setBusy(true);
    const { reply } = await api("mentor", { messages: next });
    setMsgs([...next, { role: "assistant", content: reply }]); setBusy(false);
  }
  const t = s.today || {};
  const chip = (k, v) => <span key={k} style={{ fontSize: 11, color: T.mid, border: `1px solid ${T.line}`, borderRadius: 999, padding: "4px 10px" }}><span style={{ color: T.dim }}>{k}</span> <span style={{ color: T.fg }}>{v}</span></span>;
  return (
    <>
      <Back onClick={() => go("home")} title="Mentor" />
      <div style={{ ...serif, color: T.mid, fontSize: 16, marginTop: -8, marginBottom: 12 }}>what's on your mind, {(s.profile?.name || "").toLowerCase()}?</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: T.green, border: `1px solid rgba(61,220,132,.35)`, borderRadius: 999, padding: "4px 10px" }}>● LIVE</span>
        {chip("RECOVERY", dash(t.recovery, "%"))}{chip("SLEEP", dash(t.sleepH, "h"))}{chip("WORKOUTS", s.workoutsMonth ?? 0)}{chip("WEIGHT", dash((s.weights || []).at(-1)?.value, " kg"))}{chip("NOTES", s.thoughts?.length ?? 0)}
      </div>
      <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
        <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 380 }}>
          {msgs.length === 0 ? (
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, color: T.mid, marginTop: 0 }}>I can see your live synced data — sleep, recovery, workouts, water, weight, money, and notes.<br /><span style={{ color: T.dim }}>Pick a prompt or type your own.</span></p>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                {prompts.map((p) => <button key={p} onClick={() => send(p)} style={{ textAlign: "left", ...input, borderRadius: 12, cursor: "pointer" }}><span style={{ color: T.green, marginRight: 8 }}>●</span>{p}</button>)}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, overflowY: "auto" }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "user" ? "rgba(61,220,132,.1)" : "#0c100e", border: `1px solid ${m.role === "user" ? "rgba(61,220,132,.3)" : T.line}`, borderRadius: 14, padding: "10px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
              ))}
              {busy && <div style={{ ...serif, color: T.dim, fontSize: 13 }}>mentor is thinking…</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={inp} onChange={(e) => setInp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="ask me anything…" style={{ ...input, flex: 1, borderRadius: 999 }} />
            <button onClick={() => send()} disabled={busy} style={{ ...pill(true), opacity: busy ? 0.5 : 1 }}>→</button>
          </div>
        </div>
        <div style={{ ...card, background: "radial-gradient(ellipse at 50% 120%, rgba(61,220,132,.07), #0c100e 70%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ ...serif, fontSize: 22 }}>The void.</div>
            <div style={label}>Memory · {s.thoughts?.length ?? 0} thoughts</div>
          </div>
          <p style={{ ...serif, color: T.mid, fontSize: 14, lineHeight: 1.55, margin: "8px 0 12px" }}>You have about fifty thousand thoughts a day. Most disappear. The ones that matter live here, and the mentor will remember them for you.</p>
          {(s.thoughts || []).map((th, i) => <div key={i} style={{ fontSize: 13, padding: "6px 0 6px 10px", borderLeft: `2px solid ${T.green}`, marginBottom: 6 }}>{th.text}</div>)}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={thought} onChange={(e) => setThought(e.target.value)} placeholder="drop a thought into the void…" style={{ ...input, flex: 1 }} />
            <button style={pill(true)} onClick={async () => { if (thought.trim()) { await api("thought", { text: thought.trim() }); setThought(""); refresh(); } }}>Keep</button>
          </div>
        </div>
      </div>
    </>
  );
}

// PLAN_COMPONENT - to be inserted into app.jsx

// FATIGUE PAGE — muscle heat map from lifting, running, bouldering
// Inserted into Peak app

// Exercise → muscle mapping (primary 1.0, secondary 0.5)
const MUSCLE_MAP = {
  // Gym lifts (Hevy exercise names → muscles)
  "hack squat":{quads:1,glutes:.5},"back squat":{quads:1,glutes:.7,hamstrings:.4,core:.3},
  "leg press":{quads:1,glutes:.5},"leg extension":{quads:1},"leg curl":{hamstrings:1},
  "seated leg curl":{hamstrings:1},"hip thrust":{glutes:1,hamstrings:.4},
  "hip adduction":{adductors:1},"glute 45":{glutes:1,hamstrings:.6},
  "romanian deadlift":{hamstrings:1,glutes:.8,lowerBack:.5},
  "bench press":{chest:1,frontDelts:.5,triceps:.5},"chest fly":{chest:1},
  "pec deck":{chest:1},"butterfly":{chest:1},
  "shoulder press":{frontDelts:1,triceps:.5},"overhead press":{frontDelts:1,triceps:.5,core:.3},
  "lateral raise":{sideDelts:1},"rear delt":{rearDelts:1},
  "barbell row":{lats:1,rearDelts:.5,biceps:.5,forearms:.3},
  "iso-lateral row":{lats:1,rearDelts:.5,biceps:.5},
  "lat pulldown":{lats:1,biceps:.5},"straight arm":{lats:1},
  "pull-up":{lats:1,biceps:.7,forearms:.5,core:.3},"chin-up":{lats:.8,biceps:1,forearms:.5},
  "bicep curl":{biceps:1,forearms:.3},"decline curl":{biceps:1},
  "tricep pushdown":{triceps:1},"triceps pushdown":{triceps:1},
  "cable crunch":{core:1},"crunch":{core:1},"plank":{core:1},
  // Activities
  "_running":{quads:.8,calves:1,glutes:.6,hamstrings:.5,hipFlexors:.6,core:.3},
  "_bouldering":{forearms:1,lats:.9,biceps:.8,core:.7,rearDelts:.5,fingers:1},
  "_cycling":{quads:.9,calves:.5,glutes:.6,hamstrings:.4},
  "_zone2":{quads:.3,calves:.3,glutes:.2},
  "_hiit":{quads:.6,calves:.5,glutes:.4,hamstrings:.3,core:.3},
};

// Fuzzy match exercise name to muscle map key
function matchExercise(name) {
  const n = name.toLowerCase();
  for (const [key, muscles] of Object.entries(MUSCLE_MAP)) {
    if (key.startsWith("_")) continue;
    if (n.includes(key)) return muscles;
  }
  // Activity type matching
  if (n.includes("run") || n.includes("jog")) return MUSCLE_MAP._running;
  if (n.includes("boulder") || n.includes("climb")) return MUSCLE_MAP._bouldering;
  if (n.includes("cycle") || n.includes("bike") || n.includes("ride")) return MUSCLE_MAP._cycling;
  return null;
}

// Recovery half-life per muscle group (hours) — larger muscles recover slower
const RECOVERY_H = {
  quads:56, hamstrings:56, glutes:56, calves:36, adductors:48, hipFlexors:40,
  chest:52, lats:52, frontDelts:44, sideDelts:40, rearDelts:40,
  triceps:36, biceps:36, forearms:32, fingers:72, core:36, lowerBack:56,
};

// All displayable muscles with SVG coordinates (front and back body)
const MUSCLES = {
  // Front view
  frontDelts:  { label:"Front Delts",   x:112, y:88,  w:22, h:18, side:"front" },
  frontDeltsR: { label:"Front Delts",   x:166, y:88,  w:22, h:18, side:"front", link:"frontDelts" },
  chest:       { label:"Chest",         x:122, y:108, w:56, h:30, side:"front" },
  biceps:      { label:"Biceps",        x:100, y:120, w:18, h:28, side:"front" },
  bicepsR:     { label:"Biceps",        x:182, y:120, w:18, h:28, side:"front", link:"biceps" },
  core:        { label:"Core",          x:130, y:142, w:40, h:40, side:"front" },
  forearms:    { label:"Forearms",      x:92,  y:152, w:16, h:32, side:"front" },
  forearmsR:   { label:"Forearms",      x:192, y:152, w:16, h:32, side:"front", link:"forearms" },
  hipFlexors:  { label:"Hip Flexors",   x:128, y:184, w:44, h:14, side:"front" },
  quads:       { label:"Quads",         x:118, y:200, w:26, h:46, side:"front" },
  quadsR:      { label:"Quads",         x:156, y:200, w:26, h:46, side:"front", link:"quads" },
  adductors:   { label:"Adductors",     x:140, y:210, w:20, h:30, side:"front" },
  calves:      { label:"Calves",        x:120, y:260, w:20, h:32, side:"front" },
  calvesR:     { label:"Calves",        x:160, y:260, w:20, h:32, side:"front", link:"calves" },
  // Back view (offset by 300px)
  rearDelts:   { label:"Rear Delts",    x:412, y:88,  w:22, h:18, side:"back" },
  rearDeltsR:  { label:"Rear Delts",    x:466, y:88,  w:22, h:18, side:"back", link:"rearDelts" },
  lats:        { label:"Lats",          x:418, y:112, w:20, h:36, side:"back" },
  latsR:       { label:"Lats",          x:462, y:112, w:20, h:36, side:"back", link:"lats" },
  lowerBack:   { label:"Lower Back",    x:435, y:148, w:30, h:24, side:"back" },
  triceps:     { label:"Triceps",       x:400, y:118, w:16, h:26, side:"back" },
  tricepsR:    { label:"Triceps",       x:484, y:118, w:16, h:26, side:"back", link:"triceps" },
  glutes:      { label:"Glutes",        x:425, y:175, w:50, h:28, side:"back" },
  hamstrings:  { label:"Hamstrings",    x:420, y:206, w:24, h:42, side:"back" },
  hamstringsR: { label:"Hamstrings",    x:456, y:206, w:24, h:42, side:"back", link:"hamstrings" },
};

function fatigueColor(pct) {
  // 0 = fresh (green) → 0.5 = moderate (amber) → 1 = fatigued (red)
  const p = Math.min(1, Math.max(0, pct));
  if (p < 0.35) return `rgba(61,220,132,${0.15 + p * 0.6})`;
  if (p < 0.65) return `rgba(224,180,106,${0.3 + p * 0.5})`;
  return `rgba(224,106,106,${0.4 + p * 0.5})`;
}

function Fatigue({ go, s }) {
  const [hover, setHover] = useState(null);

  // Compute fatigue from all sources
  const fatigue = useMemo(() => {
    const accum = {};
    const now = Date.now();

    // From logged lifts (Peak's own data)
    for (const l of (s.lifts || [])) {
      const muscles = matchExercise(l.exercise || "");
      if (!muscles) continue;
      const hoursAgo = (now - new Date(l.date).getTime()) / 36e5;
      if (hoursAgo > 168) continue; // ignore >7 days
      const volume = (l.kg || 0) * (l.reps || 1);
      for (const [m, w] of Object.entries(muscles)) {
        const hl = RECOVERY_H[m] || 48;
        const decay = Math.pow(0.5, hoursAgo / hl);
        accum[m] = (accum[m] || 0) + volume * w * decay;
      }
    }

    // From synced workouts (via Health Auto Export)
    for (const w of (s.workouts || [])) {
      const muscles = matchExercise(w.name || "");
      if (!muscles) continue;
      const hoursAgo = (now - new Date(w.date || w.start).getTime()) / 36e5;
      if (hoursAgo > 168) continue;
      const effort = (w.kcal || 200) * (w.duration || 30) / 30;
      for (const [m, weight] of Object.entries(muscles)) {
        const hl = RECOVERY_H[m] || 48;
        const decay = Math.pow(0.5, hoursAgo / hl);
        accum[m] = (accum[m] || 0) + effort * weight * decay;
      }
    }

    // Normalize to 0–1 range
    const maxVal = Math.max(1, ...Object.values(accum));
    const result = {};
    for (const [m, v] of Object.entries(accum)) result[m] = v / maxVal;
    return result;
  }, [s.lifts, s.workouts]);

  const getMuscleLevel = (key) => {
    const m = MUSCLES[key];
    const dataKey = m.link || key;
    return fatigue[dataKey] || 0;
  };

  const hoverMuscle = hover ? MUSCLES[hover] : null;
  const hoverKey = hoverMuscle ? (hoverMuscle.link || hover) : null;
  const hoverLevel = hoverKey ? (fatigue[hoverKey] || 0) : 0;
  const hoverWord = hoverLevel < 0.2 ? "Fresh" : hoverLevel < 0.45 ? "Mild" : hoverLevel < 0.7 ? "Moderate" : "Fatigued";

  return (
    <>
      <Back onClick={() => go("home")} title="Muscle fatigue" />
      <div style={{ ...serif, color: T.mid, fontSize: 14, marginTop: -10, marginBottom: 14 }}>Accumulated stimulus from gym, running, and bouldering — decays with each muscle's recovery rate.</div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 11, color: T.dim }}>
        {[["Fresh", "rgba(61,220,132,.4)"], ["Mild", "rgba(61,220,132,.7)"], ["Moderate", "rgba(224,180,106,.6)"], ["Fatigued", "rgba(224,106,106,.7)"]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{l}
          </span>
        ))}
      </div>

      {/* Body diagram */}
      <div style={{ ...card, padding: 24, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 30 }}>
          {["front", "back"].map(side => (
            <div key={side} style={{ textAlign: "center" }}>
              <div style={label}>{side}</div>
              <svg viewBox={side === "front" ? "80 30 140 280" : "380 30 140 280"} style={{ width: 160, height: 320 }}>
                {/* Body silhouette */}
                <ellipse cx={side === "front" ? 150 : 450} cy={52} rx={18} ry={20} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 120 : 420} y={72} width={60} height={110} rx={12} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 95 : 395} y={82} width={20} height={70} rx={8} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 185 : 485} y={82} width={20} height={70} rx={8} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 88 : 388} y={148} width={16} height={44} rx={6} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 196 : 496} y={148} width={16} height={44} rx={6} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 122 : 422} y={184} width={24} height={70} rx={8} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 154 : 454} y={184} width={24} height={70} rx={8} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 120 : 420} y={256} width={22} height={38} rx={6} fill="#1a2420" stroke={T.line} strokeWidth="1" />
                <rect x={side === "front" ? 158 : 458} y={256} width={22} height={38} rx={6} fill="#1a2420" stroke={T.line} strokeWidth="1" />

                {/* Muscle overlays */}
                {Object.entries(MUSCLES).filter(([, m]) => m.side === side).map(([key, m]) => {
                  const level = getMuscleLevel(key);
                  return (
                    <rect key={key} x={m.x} y={m.y} width={m.w} height={m.h} rx={4}
                      fill={fatigueColor(level)}
                      stroke={hover === key ? T.fg : "transparent"} strokeWidth={hover === key ? 1.5 : 0}
                      style={{ cursor: "pointer", transition: "fill .3s" }}
                      onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)} />
                  );
                })}
              </svg>
            </div>
          ))}
        </div>

        {/* Hover tooltip */}
        {hoverMuscle && (
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 16px", fontSize: 13, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: fatigueColor(hoverLevel) }} />
            <span style={{ fontWeight: 600 }}>{hoverMuscle.label}</span>
            <span style={{ color: T.mid }}>{hoverWord} · {Math.round(hoverLevel * 100)}%</span>
          </div>
        )}
      </div>

      {/* Muscle breakdown table */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ ...label, marginBottom: 10 }}>All muscles · sorted by fatigue</div>
        {Object.entries(fatigue).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
          <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid #161c18` }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: fatigueColor(v), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, textTransform: "capitalize" }}>{m.replace(/([A-Z])/g, " $1")}</span>
            <div style={{ width: 120, height: 5, background: "#1d2420", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${v * 100}%`, background: fatigueColor(v), borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 12, color: T.mid, width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(v * 100)}%</span>
          </div>
        ))}
        {Object.keys(fatigue).length === 0 && (
          <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Log lifts or sync workouts and the map comes alive. Import a Hevy CSV or connect Strava below.</div>
        )}
      </div>

      {/* Data source info */}
      <div style={{ ...card, marginTop: 16, background: `linear-gradient(150deg, rgba(106,180,224,.06), ${T.panel} 60%)` }}>
        <div style={{ ...label, marginBottom: 8 }}>Data sources</div>
        <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.6 }}>
          <b>Hevy</b> — your API key auto-syncs every lift with exercise-level detail. Every exercise maps to primary and secondary muscles with volume weighting. Syncs on startup + every 4 hours.
          <br /><br />
          <b>Apple Health</b> — Health Auto Export sends runs, bouldering, cycling, and any other workout. Running maps to quads, calves, glutes, hamstrings. Bouldering maps to forearms, lats, biceps, core.
          <br /><br />
          <b>Manual lifts</b> — anything logged on the Train page is already included. The map updates in real time.
          <br /><br />
          <b>Recovery model:</b> each muscle has its own half-life (calves 36h, quads 56h, fingers 72h). Fatigue decays exponentially — a heavy squat session yesterday shows hot quads, but three days later they're green again.
        </div>
      </div>
    </>
  );
}


const PLAN_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PLAN_TYPES = {
  zone2: { name:'Zone 2', color:'#3ddc84', bg:'rgba(61,220,132,.12)' },
  hiit:  { name:'4×4 HIIT', color:'#e07a6a', bg:'rgba(224,122,106,.12)' },
  lift:  { name:'Lifting', color:'#6ab4e0', bg:'rgba(106,180,224,.12)' },
  climb: { name:'Bouldering', color:'#a48ae0', bg:'rgba(164,138,224,.12)' },
  flex:  { name:'Flexibility', color:'#e0b46a', bg:'rgba(224,180,106,.12)' },
};
const PLAN_PHASES = [
  { label:'Phase 1 · Foundation', weeks:'Weeks 1–4',
    metrics:['Full body 3×/wk','4–6 reps','RPE 8','Zone 2 2×','HIIT 1×','Boulder 2×'],
    week:[
      [{type:'lift',label:'Full body A',s:'liftA'}],
      [{type:'climb',label:'Bouldering',s:'climb'}],
      [{type:'zone2',label:'Zone 2',s:'z2'}],
      [{type:'hiit',label:'4×4 HIIT',s:'hiit'}],
      [{type:'lift',label:'Full body B',s:'liftB'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'flex',label:'Flexibility',s:'flex'}],
      [{type:'climb',label:'Bouldering',s:'climb'},{type:'lift',label:'Full body C',s:'liftC'}],
    ]},
  { label:'Phase 2 · Hypertrophy', weeks:'Weeks 5–8',
    metrics:['Upper/Lower 4×/wk','4–8 reps','RPE 8–9','Zone 2 2×','HIIT 1×','Boulder 3×'],
    week:[
      [{type:'lift',label:'Upper A',s:'upperA'}],
      [{type:'climb',label:'Bouldering',s:'climb'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'lift',label:'Lower A',s:'lowerA'}],
      [{type:'climb',label:'Bouldering',s:'climb'}],
      [{type:'lift',label:'Upper B',s:'upperB'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'flex',label:'Flexibility',s:'flex'}],
      [{type:'climb',label:'Bouldering',s:'climb'},{type:'hiit',label:'4×4 HIIT',s:'hiit'}],
    ]},
  { label:'Phase 3 · Strength', weeks:'Weeks 9–12',
    metrics:['Push/Pull/Legs','3–5 reps','RPE 9–10','Zone 2 2×','HIIT 2×','Boulder 2×'],
    week:[
      [{type:'lift',label:'Push',s:'push'}],
      [{type:'climb',label:'Bouldering',s:'climb'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'hiit',label:'4×4 HIIT',s:'hiit'}],
      [{type:'lift',label:'Pull',s:'pull'}],
      [{type:'zone2',label:'Zone 2',s:'z2'}],
      [{type:'lift',label:'Legs',s:'legs'}],
      [{type:'climb',label:'Bouldering',s:'climb'},{type:'flex',label:'Flexibility',s:'flex'}],
    ]},
  { label:'Phase 4 · Peaking', weeks:'Weeks 13–16',
    metrics:['Upper/Lower 3×/wk','2–4 reps','RPE 10 (W16: 7)','Zone 2 2×','HIIT 2×','Boulder 2×'],
    week:[
      [{type:'lift',label:'Upper heavy',s:'upperH'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'hiit',label:'4×4 HIIT',s:'hiit'}],
      [{type:'lift',label:'Upper vol',s:'upperV'}],
      [{type:'climb',label:'Bouldering',s:'climb'}],
      [{type:'lift',label:'Lower heavy',s:'lowerH'}],
      [{type:'climb',label:'Bouldering',s:'climb'},{type:'hiit',label:'4×4 HIIT',s:'hiit'}],
      [{type:'zone2',label:'Zone 2',s:'z2'},{type:'flex',label:'Flexibility',s:'flex'}],
    ]},
];
const PLAN_SESSIONS = {
  liftA:{title:'Full body A',type:'lift',ex:[
    {n:'Hack Squat',sets:'2',reps:'4–6',note:'Quad anchor. 3s eccentric. RPE 8.'},
    {n:'Hip Thrust (Machine)',sets:'1–2',reps:'4–6',note:'Full hip lock-out.'},
    {n:'Chest Fly (DB)',sets:'1–2',reps:'4–6',note:'Horizontal push. Deep stretch.'},
    {n:'Rear Delt Row',sets:'1–2',reps:'4–6',note:'Horizontal pull. Lead elbows.'},
    {n:'Shoulder Press (Machine)',sets:'1–2',reps:'4–5',note:'Vertical push. Full ROM.'},
    {n:'Cable Crunch',sets:'1–2',reps:'5–8',note:'Core. Add weight each week.'},
  ]},
  liftB:{title:'Full body B',type:'lift',ex:[
    {n:'Glute 45s',sets:'2',reps:'4–6',note:'Hip hinge anchor.'},
    {n:'Seated Leg Curl',sets:'1–2',reps:'4–6',note:'Hamstring. 3s eccentric.'},
    {n:'Iso-Lateral Row',sets:'1–2',reps:'4–6',note:'Horizontal pull. Unilateral.'},
    {n:'Lat Pulldown',sets:'1–2',reps:'5–8',note:'Lat isolation.'},
    {n:'Tricep Pushdown',sets:'1–2',reps:'5–8',note:'Tricep volume.'},
    {n:'Bicep Curl (Cable)',sets:'1–2',reps:'5–8',note:'Arm volume.'},
  ]},
  liftC:{title:'Full body C',type:'lift',ex:[
    {n:'Leg Extension (Single)',sets:'1–2',reps:'5–8',note:'Quad isolation. Unilateral.'},
    {n:'Hip Adduction',sets:'1–2',reps:'5–8',note:'Adductor volume.'},
    {n:'Pec Deck',sets:'1–2',reps:'5–8',note:'Chest isolation.'},
    {n:'Shoulder Press (Seated)',sets:'1–2',reps:'4–6',note:'Vertical push variation.'},
    {n:'Decline Curl',sets:'1–2',reps:'5–8',note:'Bicep peak.'},
    {n:'Triceps Pushdown',sets:'1–2',reps:'5–8',note:'Tricep finisher.'},
  ]},
  upperA:{title:'Upper A — push focus',type:'lift',ex:[
    {n:'Shoulder Press (Machine)',sets:'2',reps:'4–6',note:'Heavy. RPE 8–9. 2 min rest.'},
    {n:'Chest Fly (DB)',sets:'2',reps:'4–6',note:'Load up vs Phase 1.'},
    {n:'Pec Deck',sets:'1–2',reps:'4–6',note:'Chest accessory.'},
    {n:'Tricep Pushdown (Single)',sets:'1–2',reps:'5–7',note:'Unilateral.'},
    {n:'Triceps Pushdown',sets:'1–2',reps:'5–7',note:'Finisher.'},
  ]},
  lowerA:{title:'Lower A — quad focus',type:'lift',ex:[
    {n:'Hack Squat',sets:'2',reps:'4–6',note:'Add load vs Phase 1. 2 min rest.'},
    {n:'Leg Extension (Single)',sets:'1–2',reps:'4–6',note:'3s eccentric.'},
    {n:'Hip Adduction',sets:'1–2',reps:'5–8',note:'Adductor volume.'},
    {n:'Seated Leg Curl',sets:'1–2',reps:'4–6',note:'Hamstring balance.'},
    {n:'Cable Crunch',sets:'1–2',reps:'5–8',note:'Weighted.'},
  ]},
  upperB:{title:'Upper B — pull focus',type:'lift',ex:[
    {n:'Iso-Lateral Row',sets:'2',reps:'4–6',note:'Pull anchor. RPE 9.'},
    {n:'Rear Delt Row',sets:'1–2',reps:'4–6',note:'Posterior shoulder.'},
    {n:'Lat Pulldown',sets:'1–2',reps:'5–7',note:'Lat isolation.'},
    {n:'Shoulder Press (Seated)',sets:'1–2',reps:'4–6',note:'Push to balance pull.'},
    {n:'Bicep Curl (Cable)',sets:'1–2',reps:'5–7',note:'Bicep volume.'},
    {n:'Decline Curl',sets:'1–2',reps:'5–7',note:'Peak contraction.'},
  ]},
  push:{title:'Push — anterior',type:'lift',ex:[
    {n:'Shoulder Press (Machine)',sets:'2',reps:'3–5',note:'Heavy. 3 min rest. RPE 9–10.'},
    {n:'Chest Fly (DB)',sets:'2',reps:'3–5',note:'Load up vs Phase 2.'},
    {n:'Pec Deck',sets:'1–2',reps:'4–6',note:'Chest accessory.'},
    {n:'Shoulder Press (Seated)',sets:'1–2',reps:'3–5',note:'Second OHP variation.'},
    {n:'Tricep Pushdown (Single)',sets:'1–2',reps:'4–6',note:'Unilateral.'},
    {n:'Triceps Pushdown',sets:'1–2',reps:'4–6',note:'Finisher.'},
  ]},
  pull:{title:'Pull — posterior',type:'lift',warn:'Pull preceded by bouldering (Tue) — back/biceps had stimulus. If fatigue lingers, drop iso-lateral row to 3 sets and skip decline curl.',ex:[
    {n:'Iso-Lateral Row',sets:'2',reps:'3–5',note:'Heaviest of programme. RPE 9–10.'},
    {n:'Rear Delt Row',sets:'2',reps:'3–5',note:'Heavier, fewer reps.'},
    {n:'Lat Pulldown',sets:'1–2',reps:'4–6',note:'Lat isolation.'},
    {n:'Bicep Curl (Cable)',sets:'1–2',reps:'4–6',note:'Heavier curl.'},
    {n:'Decline Curl',sets:'1–2',reps:'4–6',note:'Superset option.'},
  ]},
  legs:{title:'Legs — full lower',type:'lift',ex:[
    {n:'Hack Squat',sets:'2',reps:'3–5',note:'Heaviest of programme. 3 min rest.'},
    {n:'Glute 45s',sets:'2',reps:'3–5',note:'Hip hinge, heavy load.'},
    {n:'Hip Thrust (Machine)',sets:'1–2',reps:'3–5',note:'Glute strength.'},
    {n:'Seated Leg Curl',sets:'1–2',reps:'4–6',note:'Hamstring accessory.'},
    {n:'Leg Extension (Single)',sets:'1–2',reps:'4–6',note:'Quad finisher.'},
    {n:'Hip Adduction',sets:'1–2',reps:'5–7',note:'Adductor volume.'},
  ]},
  upperH:{title:'Upper — peaking loads',type:'lift',ex:[
    {n:'Iso-Lateral Row',sets:'2',reps:'2–4',note:'Heaviest of cycle. 3 min rest. W16: 60%.'},
    {n:'Shoulder Press (Machine)',sets:'2',reps:'2–4',note:'Peak overhead. W16: deload.'},
    {n:'Rear Delt Row',sets:'1–2',reps:'3–5',note:'Accessory reduced vs P3.'},
    {n:'Lat Pulldown',sets:'1–2',reps:'4–6',note:'Lat maintained.'},
    {n:'Bicep Curl (Cable)',sets:'1–2',reps:'4–6',note:'Arm maintenance.'},
  ]},
  upperV:{title:'Upper vol — push only',type:'lift',warn:'No pull exercises — bouldering is tomorrow which hits back/biceps. Push and chest only.',ex:[
    {n:'Chest Fly (DB)',sets:'1–2',reps:'3–5',note:'Load maintained, volume cut.'},
    {n:'Pec Deck',sets:'1–2',reps:'4–6',note:'Chest accessory.'},
    {n:'Shoulder Press (Seated)',sets:'1–2',reps:'3–5',note:'Intensity high.'},
    {n:'Tricep Pushdown (Single)',sets:'1–2',reps:'4–6',note:'Arm maintenance.'},
    {n:'Triceps Pushdown',sets:'1–2',reps:'4–6',note:'No pull movements.'},
  ]},
  lowerH:{title:'Lower — peaking loads',type:'lift',ex:[
    {n:'Hack Squat',sets:'2',reps:'2–4',note:'Peak quad. 3 min rest. W16: 60%.'},
    {n:'Hip Thrust (Machine)',sets:'2',reps:'3–4',note:'Peak glute strength.'},
    {n:'Glute 45s',sets:'1–2',reps:'3–5',note:'Hip hinge accessory.'},
    {n:'Seated Leg Curl',sets:'1–2',reps:'3–5',note:'Volume trimmed.'},
    {n:'Cable Crunch',sets:'1–2',reps:'4–6',note:'Core maintained.'},
  ]},
  z2:{title:'Zone 2 cardio',type:'zone2',info:'60–70% HRmax. Bike, row, or brisk walk. Nasal breathing throughout — if you need to open your mouth, slow down. 30–40 min. Builds mitochondrial density and cardiac output.'},
  hiit:{title:'Norwegian 4×4',type:'hiit',info:'5 min warm-up → 4 × (4 min at 85–95% HRmax + 3 min active recovery) → 5 min cool-down. ~34 min total. If resting HR is 5+ bpm above baseline, swap for Zone 2.'},
  climb:{title:'Bouldering',type:'climb',info:'1–2 hrs. Treat as pulling + grip + core training. 15 min warm-up on easier grades. 2–3 sets of wrist extension and external shoulder rotation after to balance flexion load.'},
  flex:{title:'Flexibility & mobility',type:'flex',info:'25 min. Dynamic warm-up (5 min), static holds (20 min): hip flexors, hamstrings, thoracic spine, shoulder capsule, adductors. PNF contract-relax on restricted areas. Never before heavy lifting.'},
};

function Plan({ go }) {
  const [phase, setPhase] = useState(0);
  const [detail, setDetail] = useState(null);
  const p = PLAN_PHASES[phase];

  return (
    <>
      <Back onClick={() => go("home")} title="Plan" />
      <div style={{ ...serif, color: T.mid, fontSize: 14, marginTop: -10, marginBottom: 14 }}>16 weeks · 4 phases · Zone 2 & HIIT priority · no consecutive muscle group days</div>

      {/* Phase tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {PLAN_PHASES.map((ph, i) => <button key={i} style={pill(phase === i)} onClick={() => { setPhase(i); setDetail(null); }}>{ph.label}</button>)}
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {p.metrics.map((m, i) => <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,.04)", border: `1px solid ${T.line}`, color: T.mid }}>{m}</span>)}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(PLAN_TYPES).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.dim }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: v.bg, border: `1.5px solid ${v.color}` }} />{v.name}
          </span>
        ))}
      </div>

      {/* Week grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 16 }}>
        {p.week.map((daySlots, di) => (
          <div key={di} style={{ borderRadius: 10, overflow: "hidden", minWidth: 0 }}>
            <div style={{ background: T.fg, color: T.bg, textAlign: "center", padding: "6px 2px", fontSize: 11, fontWeight: 600 }}>{PLAN_DAYS[di]}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 3px", background: T.panel, border: `1px solid ${T.line}`, borderTop: "none", borderRadius: "0 0 10px 10px", minHeight: 100 }}>
              {daySlots.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, borderRadius: 6, border: `1px dashed ${T.line}` }}>
                  <span style={{ fontSize: 12, color: T.dim }}>Rest</span>
                </div>
              ) : daySlots.map((slot, si) => {
                const st = PLAN_TYPES[slot.type];
                return (
                  <div key={si} onClick={() => setDetail(slot.s)} style={{ borderRadius: 6, padding: "5px 4px", textAlign: "center", fontSize: 9.5, fontWeight: 500, lineHeight: 1.3, cursor: "pointer", background: st.bg, color: st.color, transition: "opacity .1s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    {slot.label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.dim, marginBottom: 20 }}>Click any session to view exercises</div>

      {/* Session detail */}
      {detail && PLAN_SESSIONS[detail] && (() => {
        const s = PLAN_SESSIONS[detail];
        const st = PLAN_TYPES[s.type];
        return (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ ...serif, fontSize: 20 }}>{s.title}</div>
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{st.name}</span>
            </div>
            {s.warn && (
              <div style={{ background: "rgba(224,180,106,.08)", border: "1px solid rgba(224,180,106,.3)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: T.amber, marginBottom: 14, lineHeight: 1.5 }}>
                ⚠ {s.warn}
              </div>
            )}
            {s.ex ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>
                    {["Exercise", "Sets", "Reps", "Notes"].map(h => (
                      <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 600, color: T.dim, padding: "0 8px 6px 0", textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {s.ex.map((e, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: "7px 8px 7px 0", fontWeight: 500 }}>{e.n}</td>
                        <td style={{ padding: "7px 8px 7px 0", color: T.mid }}>{e.sets}</td>
                        <td style={{ padding: "7px 8px 7px 0", color: T.mid }}>{e.reps}</td>
                        <td style={{ padding: "7px 8px 7px 0", fontSize: 11, color: T.dim }}>{e.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : s.info ? (
              <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.7 }}>{s.info}</div>
            ) : null}
          </div>
        );
      })()}
    </>
  );
}


function Settings({ go, s, refresh }) {
  const [p, setP] = useState(s.profile || {});
  return (
    <>
      <Back onClick={() => go("home")} title="Profile" />
      <div style={{ ...card, maxWidth: 420, display: "grid", gap: 10 }}>
        {[["name", "Name", "text"], ["heightCm", "Height (cm)", "number"], ["sex", "Sex", "text"], ["waterTarget", "Water target (bottles/day)", "number"]].map(([k, l, t]) => (
          <div key={k}><div style={{ ...label, marginBottom: 4 }}>{l}</div>
            <input value={p[k] ?? ""} type={t} onChange={(e) => setP({ ...p, [k]: t === "number" ? +e.target.value : e.target.value })} style={{ ...input, width: "100%" }} /></div>
        ))}
        <button style={{ ...pill(true), marginTop: 6 }} onClick={async () => { await api("profile", p); refresh(); go("home"); }}>Save</button>
      </div>
    </>
  );
}

const NAV_PAGES = [
  { key: "home",     icon: "⬡", label: "Home" },
  { key: "vitality", icon: "◎", label: "Vitality" },
  { key: "train",    icon: "△", label: "Train" },
  { key: "fuel",     icon: "◈", label: "Fuel" },
  { key: "mentor",   icon: "✦", label: "Mentor" },
  { key: "fatigue",  icon: "◉", label: "Fatigue" },
  { key: "plan",     icon: "▦", label: "Plan" },
  { key: "settings", icon: "◌", label: "Profile" },
];

function BottomNav({ page, go }) {
  const visible = NAV_PAGES.filter(p => p.key !== "settings");
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "rgba(10,13,11,.92)", backdropFilter: "blur(16px) saturate(180%)",
      borderTop: `1px solid ${T.line}`,
      display: "flex", justifyContent: "space-around", alignItems: "center",
      padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
      zIndex: 100,
    }}>
      {visible.map(({ key, icon, label }) => {
        const active = page === key;
        return (
          <button key={key} onClick={() => go(key)} style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "4px 8px", borderRadius: 10,
            color: active ? T.green : T.dim,
            transition: "color .15s",
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
            {active && <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, position: "absolute", marginTop: 28 }} />}
          </button>
        );
      })}
    </nav>
  );
}

function App() {
  const getHash = () => {
    const h = window.location.hash.slice(1);
    return NAV_PAGES.find(p => p.key === h) ? h : "home";
  };
  const [page, setPage] = useState(getHash);
  const [s, setS] = useState(null);

  const go = useCallback((key) => {
    window.location.hash = key === "home" ? "" : key;
    setPage(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Hash-based browser navigation (back/forward support)
  useEffect(() => {
    const onHash = () => setPage(getHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Keyboard shortcut: Escape → home
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && page !== "home") go("home"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, go]);

  const refresh = useCallback(() => api("summary").then(setS), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  if (!s) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${T.green}, #1a6b40)`, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", animation: "pulse 1.5s ease-in-out infinite" }} />
      <div style={{ ...serif, color: T.dim, fontSize: 16 }}>loading…</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
    </div>
  );

  const props = { go, s, refresh };
  const pages = { home: <Home {...props} />, vitality: <Vitality {...props} />, train: <Train {...props} />, fuel: <Fuel {...props} />, mentor: <Mentor {...props} />, settings: <Settings {...props} />, plan: <Plan {...props} />, fatigue: <Fatigue {...props} /> };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.fg, fontFamily: "'Inter', -apple-system, system-ui, sans-serif", padding: "24px clamp(14px,4vw,44px) 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{pages[page]}</div>
      <BottomNav page={page} go={go} />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
