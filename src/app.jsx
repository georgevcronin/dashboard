import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";

const T = { bg: "#0a0d0b", panel: "#101512", line: "#1c241f", dim: "#5d6b62", mid: "#8a948d", fg: "#e8ece9", green: "#3ddc84", amber: "#e0b46a", red: "#e07a6a" };
const serif = { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontWeight: 400 };
const label = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.dim };
const card = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: 20 };
const pill = (a) => ({ padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12, border: "1px solid", borderColor: a ? T.green : T.line, background: a ? "rgba(61,220,132,.1)" : "transparent", color: a ? T.green : T.mid });
const input = { background: "#0c100e", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 13px", color: T.fg, fontSize: 14 };
const API_BASE = "https://europe-west2-dashboard-79dbb.cloudfunctions.net/api";
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
  const [kg, setKg] = useState("");
  const [expandedWorkout, setExpandedWorkout] = useState(null);
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const weights = (s.weights || []).map((w) => w.value);
  const cur = weights.at(-1);
  const byEx = {};
  (s.lifts || []).forEach((l) => { (byEx[l.exercise] = byEx[l.exercise] || []).push(l); });
  const liftsByDate = {};
  (s.lifts || []).forEach((l) => { (liftsByDate[l.date] = liftsByDate[l.date] || []).push(l); });
  const muscleWeeklyVol = useMemo(() => {
    const now = Date.now(); const W = 8;
    const result = {};
    for (const l of (s.lifts || [])) {
      const muscles = matchExercise(l.exercise || "");
      if (!muscles) continue;
      const vol = (l.kg || 0) * (l.reps || 0);
      if (vol <= 0) continue;
      const daysAgo = Math.floor((now - new Date(l.date).getTime()) / 864e5);
      if (daysAgo < 0 || daysAgo >= W * 7) continue;
      const wi = W - 1 - Math.floor(daysAgo / 7);
      for (const [m, w] of Object.entries(muscles)) {
        if (!result[m]) result[m] = Array(W).fill(0);
        result[m][wi] += vol * w;
      }
    }
    return result;
  }, [s.lifts]);
  const muscleOptions = Object.keys(muscleWeeklyVol).sort();
  const activeMuscle = selectedMuscle || muscleOptions[0] || null;
  return (
    <>
      <Back onClick={() => go("home")} title="Progress" />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 600 }}>{dash(cur)} <span style={{ fontSize: 15, color: T.mid }}>kg</span></div>
            {weights.length > 1 && <span style={{ background: "rgba(61,220,132,.12)", color: T.green, padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{(cur - weights[0]).toFixed(1)} kg / 30d</span>}
            <span style={{ fontSize: 11, color: T.dim }}>auto-syncs from Apple Health</span>
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
          <div style={{ ...label, marginBottom: 10 }}>Lift log</div>
          {Object.keys(byEx).length === 0 && (
            <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Import a Hevy CSV or let the webhook sync your next workout.</div>
          )}
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
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #161c18", textAlign: "center" }}>
            <a href="import" style={{ fontSize: 12, color: T.dim, textDecoration: "none", letterSpacing: "0.05em" }}>↑ Import Hevy CSV</a>
          </div>
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
        {muscleOptions.length > 0 && (
          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <div style={{ ...label, marginBottom: 10 }}>Muscle volume · 8-week trend <span style={{ textTransform: "none", letterSpacing: 0, color: T.dim }}>(kg × reps weighted by activation)</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {muscleOptions.map(m => (
                <button key={m} style={pill(activeMuscle === m)} onClick={() => setSelectedMuscle(m)}>
                  {m.replace(/([A-Z])/g, " $1").toLowerCase()}
                </button>
              ))}
            </div>
            {activeMuscle && <Line data={muscleWeeklyVol[activeMuscle]} h={100} />}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.dim, marginTop: 4 }}>
              <span>8 weeks ago</span><span>this week</span>
            </div>
          </div>
        )}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={{ ...label, marginBottom: 10 }}>Workouts</div>
          {(s.workouts || []).slice(-12).reverse().map((w, i) => {
            const dayLifts = liftsByDate[w.date] || [];
            const byExDay = {};
            dayLifts.forEach(l => (byExDay[l.exercise] = byExDay[l.exercise] || []).push(l));
            const hasLifts = Object.keys(byExDay).length > 0;
            const isOpen = expandedWorkout === i;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${T.line}`, padding: "10px 0" }}>
                <div onClick={() => setExpandedWorkout(isOpen ? null : i)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: hasLifts ? "pointer" : "default", fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{w.name}</span>
                    <span style={{ color: T.dim, fontSize: 11 }}> · {w.date}</span>
                    {w.source === "hevy" && <span style={{ marginLeft: 6, fontSize: 9, color: T.green, border: "1px solid rgba(61,220,132,.3)", borderRadius: 4, padding: "1px 5px" }}>Hevy</span>}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.mid, fontSize: 12 }}>
                    {w.duration && <span>{w.duration} min</span>}
                    {w.kcal && <span>{Math.round(w.kcal)} kcal</span>}
                    {hasLifts && <span style={{ color: T.dim, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${T.line}` }}>
                    {Object.entries(byExDay).map(([name, sets]) => {
                      const best = Math.max(...sets.map(x => x.kg || 0));
                      return (
                        <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: T.mid }}>
                          <span style={{ color: T.fg, textTransform: "capitalize" }}>{name}</span>
                          <span>{sets.length} set{sets.length !== 1 ? "s" : ""}{best > 0 ? " · " + best + " kg" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!(s.workouts || []).length && <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Workouts appear here once sync is connected.</div>}
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Strava</div>
          {s.stravaConnected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: T.green }}>Connected</span>
              <button style={pill(true)} onClick={async () => { await api("strava/sync"); refresh(); }}>Sync now</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: T.mid, marginBottom: 12 }}>Connect Strava to pull all your runs, rides and sessions directly into the dashboard.</div>
              <a href="https://europe-west2-dashboard-79dbb.cloudfunctions.net/api/strava/auth" style={{ display: "inline-block", padding: "10px 18px", background: "#fc4c02", color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Connect Strava</a>
            </>
          )}
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

function Fatigue({ go, s, refresh }) {
  const [hover, setHover] = useState(null);
  const [sorenessTarget, setSorenessTarget] = useState(null);
  const [sorenessScore, setSorenessScore] = useState(null);
  const [editingSens, setEditingSens] = useState(null);

  // Compute fatigue — applies personal sensitivity + soreness-extended recovery half-lives
  const fatigue = useMemo(() => {
    const accum = {};
    const now = Date.now();
    const sensitivity = s.muscleSensitivity || {};

    // Pre-compute active (decaying) soreness per muscle — 36h half-life
    const SORENESS_HL = 36;
    const activeSoreness = {};
    for (const e of (s.soreness || [])) {
      const hoursAgo = (now - e.ts) / 36e5;
      if (hoursAgo > 168) continue;
      const decayed = (e.score / 10) * Math.pow(0.5, hoursAgo / SORENESS_HL);
      activeSoreness[e.muscle] = (activeSoreness[e.muscle] || 0) + decayed;
    }

    // From logged lifts
    for (const l of (s.lifts || [])) {
      const muscles = matchExercise(l.exercise || "");
      if (!muscles) continue;
      const hoursAgo = (now - new Date(l.date).getTime()) / 36e5;
      if (hoursAgo > 168) continue;
      const baseStimulus = (l.kg || 0) * (1 - Math.exp(-(l.reps || 0)));
      for (const [m, w] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1.0;
        const soreness = Math.min(1, activeSoreness[m] || 0);
        const effectiveHL = (RECOVERY_H[m] || 48) * (1 + soreness * 2);
        const decay = Math.pow(0.5, hoursAgo / effectiveHL);
        accum[m] = (accum[m] || 0) + baseStimulus * sens * w * decay;
      }
    }

    // From synced workouts (cardio / HAE)
    for (const w of (s.workouts || [])) {
      const muscles = matchExercise(w.name || "");
      if (!muscles) continue;
      const hoursAgo = (now - new Date(w.date || w.start).getTime()) / 36e5;
      if (hoursAgo > 168) continue;
      const effort = (w.kcal || 200) * (w.duration || 30) / 30;
      for (const [m, weight] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1.0;
        const soreness = Math.min(1, activeSoreness[m] || 0);
        const effectiveHL = (RECOVERY_H[m] || 48) * (1 + soreness * 2);
        const decay = Math.pow(0.5, hoursAgo / effectiveHL);
        accum[m] = (accum[m] || 0) + effort * sens * weight * decay;
      }
    }

    // Normalize to 0–1
    const maxVal = Math.max(1, ...Object.values(accum));
    const result = {};
    for (const [m, v] of Object.entries(accum)) result[m] = v / maxVal;
    return result;
  }, [s.lifts, s.workouts, s.muscleSensitivity, s.soreness]);

  const getMuscleLevel = (key) => {
    const m = MUSCLES[key];
    const dataKey = m.link || key;
    return fatigue[dataKey] || 0;
  };

  const trainingLoad = useMemo(() => {
    // Weighted avg fatigue across major muscles → training load %
    // 50% avg fatigue = 100% (optimal), linear scale
    const MW = { quads:3, hamstrings:2, glutes:3, lats:2.5, chest:1.5, core:2, frontDelts:1, sideDelts:1, rearDelts:1, triceps:1, biceps:1 };
    let wSum = 0, wFat = 0;
    for (const [m, w] of Object.entries(MW)) { if (fatigue[m] != null) { wFat += (fatigue[m] || 0) * w; wSum += w; } }
    const avgFatigue = wSum > 0 ? wFat / wSum : 0;
    const pct = Math.round(avgFatigue * 200); // 50% avg → 100%

    // Lift trend: % of exercises improving (max kg now vs 4 weeks ago)
    const cutoff = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const byEx = {};
    for (const l of (s.lifts || [])) (byEx[l.exercise] = byEx[l.exercise] || []).push(l);
    const deltas = Object.values(byEx).filter(sets => sets.length > 1).map(sets => {
      const sorted = [...sets].sort((a, b) => a.date.localeCompare(b.date));
      const old = sorted.filter(x => x.date <= cutoff);
      const recent = sorted.filter(x => x.date > cutoff);
      if (!old.length || !recent.length) return 0;
      return Math.max(...recent.map(x => x.kg)) - Math.max(...old.map(x => x.kg));
    });
    const improving = deltas.length ? Math.round((deltas.filter(d => d > 0).length / deltas.length) * 100) : null;

    // Recovery avg last 7 days
    const recov = (s.recoveryTrend || []).slice(-7);
    const avgRecov = recov.length ? Math.round(recov.reduce((a, b) => a + b, 0) / recov.length) : null;

    // This-week training mix
    const now = Date.now();
    const dow = new Date().getDay();
    const weekStartMs = now - ((dow === 0 ? 6 : dow - 1) * 864e5) - (now % 864e5);
    let strengthSets = 0, zone2Mins = 0, hiitMins = 0;
    for (const l of (s.lifts || [])) if (new Date(l.date).getTime() >= weekStartMs) strengthSets++;
    for (const w of (s.workouts || [])) {
      if (new Date(w.date).getTime() < weekStartMs) continue;
      const n = (w.name || "").toLowerCase(); const d = w.duration || 0;
      if (n.includes("hiit") || n.includes("4x4") || n.includes("interval")) hiitMins += d;
      else if (n.includes("run") || n.includes("zone") || n.includes("walk") || n.includes("cycle") || n.includes("bike")) zone2Mins += d;
    }
    return { pct, improving, avgRecov, strengthSets, zone2Mins, hiitMins };
  }, [fatigue, s.lifts, s.workouts, s.recoveryTrend]);

  const activeSorenessDisplay = useMemo(() => {
    const now = Date.now();
    return (s.soreness || [])
      .filter(e => now - e.ts < 5 * 24 * 3600000)
      .sort((a, b) => b.ts - a.ts)
      .map(e => {
        const h = (now - e.ts) / 36e5;
        const age = h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.floor(h / 24)}d ago`;
        return { ...e, age };
      });
  }, [s.soreness]);

  const handleLogSoreness = async () => {
    if (!sorenessTarget || sorenessScore == null) return;
    const calcFatigue = fatigue[sorenessTarget] || 0;
    await api("soreness", { muscle: sorenessTarget, score: sorenessScore, calcFatigue });
    setSorenessTarget(null); setSorenessScore(null);
    refresh();
  };

  const handleSaveSens = async (muscle, value) => {
    await api("muscle-sensitivity", { muscle, value }, "PUT");
    refresh();
  };

  const hoverMuscle = hover ? MUSCLES[hover] : null;
  const hoverKey = hoverMuscle ? (hoverMuscle.link || hover) : null;
  const hoverLevel = hoverKey ? (fatigue[hoverKey] || 0) : 0;
  const hoverWord = hoverLevel < 0.2 ? "Fresh" : hoverLevel < 0.45 ? "Mild" : hoverLevel < 0.7 ? "Moderate" : "Fatigued";

  return (
    <>
      <Back onClick={() => go("home")} title="Muscle fatigue" />
      <div style={{ ...serif, color: T.mid, fontSize: 14, marginTop: -10, marginBottom: 16 }}>Training load and muscle-by-muscle fatigue — decays with each muscle's recovery rate.</div>

      {/* Training Load Gauge */}
      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        {(() => {
          const p = trainingLoad.pct;
          const color = p == null ? T.dim : p < 70 ? "#6ab4e0" : p <= 130 ? T.green : p <= 170 ? T.amber : T.red;
          const word = p == null ? "No data" : p < 70 ? "Undertraining" : p <= 130 ? "Optimal" : p <= 170 ? "High load" : "Overtraining";
          return (
            <>
              <Ring pct={p != null ? Math.min(1, p / 150) : 0} size={130} stroke={10} color={color}>
                <div style={{ fontSize: 28, fontWeight: 700, color }}>{p != null ? p : "—"}<span style={{ fontSize: 12, color: T.dim }}>%</span></div>
                <div style={{ fontSize: 9, color: T.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>load</div>
              </Ring>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ ...serif, fontSize: 20, color, marginBottom: 6 }}>{word}</div>
                <div style={{ fontSize: 11, color: T.dim, marginBottom: 14, lineHeight: 1.5 }}>
                  {p == null ? "Log workouts and lifts to compute training load." :
                   p < 70 ? "Fatigue is low — you're below the stimulus needed for adaptation. Add sessions or increase load." :
                   p <= 130 ? "You're in the productive overload zone. Keep recovery high and load consistent." :
                   p <= 170 ? "Approaching your recovery ceiling. Prioritise sleep and watch for stalling lifts." :
                   "Accumulated fatigue exceeds recovery capacity. A deload this week will pay dividends."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {[
                    ["Lifts", trainingLoad.improving != null ? trainingLoad.improving + "% up" : "—", trainingLoad.improving != null ? trainingLoad.improving > 50 ? T.green : T.amber : T.dim],
                    ["Recovery", trainingLoad.avgRecov != null ? trainingLoad.avgRecov + "%" : "—", trainingLoad.avgRecov != null ? trainingLoad.avgRecov > 65 ? T.green : T.amber : T.dim],
                    ["Sets·wk", trainingLoad.strengthSets || "—", T.mid],
                  ].map(([k, v, c]) => (
                    <div key={k}><div style={{ ...label }}>{k}</div><div style={{ fontSize: 16, fontWeight: 600, color: c, marginTop: 2 }}>{v}</div></div>
                  ))}
                </div>
                {(trainingLoad.zone2Mins > 0 || trainingLoad.hiitMins > 0) && (
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 10 }}>
                    This week: {trainingLoad.zone2Mins > 0 ? `Zone 2 ${trainingLoad.zone2Mins} min` : ""}
                    {trainingLoad.zone2Mins > 0 && trainingLoad.hiitMins > 0 ? " · " : ""}
                    {trainingLoad.hiitMins > 0 ? `HIIT ${trainingLoad.hiitMins} min` : ""}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

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

      {/* Log Soreness */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ ...label, marginBottom: 8 }}>Log soreness</div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 12, lineHeight: 1.5 }}>Rate a muscle 1–10 right now. Soreness extends its recovery time and tunes your personal sensitivity constants over time.</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {Object.keys(RECOVERY_H).map(m => (
            <button key={m} style={pill(sorenessTarget === m)} onClick={() => { setSorenessTarget(sorenessTarget === m ? null : m); setSorenessScore(null); }}>
              {m.replace(/([A-Z])/g, " $1").toLowerCase()}
            </button>
          ))}
        </div>
        {sorenessTarget && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "10px 0" }}>
            <span style={{ fontSize: 13, color: T.mid, minWidth: 80, textTransform: "capitalize" }}>{sorenessTarget.replace(/([A-Z])/g, " $1")}</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setSorenessScore(n)} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${sorenessScore === n ? (n <= 3 ? T.green : n <= 6 ? T.amber : T.red) : T.line}`, background: sorenessScore === n ? (n <= 3 ? "rgba(61,220,132,.15)" : n <= 6 ? "rgba(224,180,106,.15)" : "rgba(224,106,106,.15)") : "transparent", color: sorenessScore === n ? T.fg : T.dim, cursor: "pointer", fontSize: 12, fontWeight: sorenessScore === n ? 600 : 400 }}>{n}</button>
              ))}
            </div>
            <button style={{ ...pill(true), opacity: sorenessScore ? 1 : 0.4 }} onClick={handleLogSoreness} disabled={!sorenessScore}>Log</button>
          </div>
        )}
        {activeSorenessDisplay.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            <div style={{ ...label, marginBottom: 6 }}>Active soreness</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeSorenessDisplay.map((e, i) => (
                <span key={i} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: `1px solid ${e.score > 6 ? T.red : e.score > 3 ? T.amber : T.green}22`, background: e.score > 6 ? "rgba(224,106,106,.08)" : e.score > 3 ? "rgba(224,180,106,.08)" : "rgba(61,220,132,.08)", color: T.mid }}>
                  <span style={{ textTransform: "capitalize" }}>{e.muscle.replace(/([A-Z])/g, " $1")}</span> {e.score}/10 · {e.age}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Personal Sensitivity */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={label}>Personal sensitivity</div>
          <div style={{ fontSize: 11, color: T.dim }}>auto-calibrated from soreness · editable</div>
        </div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 12, lineHeight: 1.5 }}>How much fatigue you accumulate per unit of work vs average. 1.0× = average. Above 1 = more sensitive (accumulates fatigue faster). Click a value to override.</div>
        <div style={{ display: "grid", gap: 1 }}>
          {Object.keys(RECOVERY_H).map(m => {
            const val = (s.muscleSensitivity || {})[m] || 1.0;
            const isEditing = editingSens === m;
            const color = val > 1.15 ? T.amber : val < 0.85 ? "#6ab4e0" : T.green;
            return (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid #161c18` }}>
                <span style={{ flex: 1, fontSize: 13, textTransform: "capitalize" }}>{m.replace(/([A-Z])/g, " $1")}</span>
                <div style={{ width: 80, height: 4, background: "#1d2420", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${Math.min(1, val / 2) * 100}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
                </div>
                {isEditing ? (
                  <input type="number" step="0.05" min="0.3" max="3.0" defaultValue={val}
                    autoFocus
                    onBlur={e => { handleSaveSens(m, +e.target.value); setEditingSens(null); }}
                    onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingSens(null); }}
                    style={{ ...input, width: 64, padding: "3px 8px", fontSize: 12, textAlign: "center" }} />
                ) : (
                  <button onClick={() => setEditingSens(m)} title="Click to edit" style={{ fontSize: 13, color, background: "none", border: "none", cursor: "pointer", fontVariantNumeric: "tabular-nums", fontFamily: "inherit", width: 44, textAlign: "right" }}>{val.toFixed(2)}×</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Data source info */}
      <div style={{ ...card, marginTop: 16, background: `linear-gradient(150deg, rgba(106,180,224,.06), ${T.panel} 60%)` }}>
        <div style={{ ...label, marginBottom: 8 }}>Data sources</div>
        <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.6 }}>
          <b>Hevy</b> — your API key auto-syncs every lift with exercise-level detail. Every exercise maps to primary and secondary muscles with volume weighting. Syncs on startup + every 4 hours.
          <br /><br />
          <b>Apple Health</b> — Health Auto Export sends runs, bouldering, cycling, and any other workout. Running maps to quads, calves, glutes, hamstrings. Bouldering maps to forearms, lats, biceps, core.
          <br /><br />
          <b>Recovery model:</b> each muscle has its own half-life (calves 36h, quads 56h, fingers 72h). Fatigue decays exponentially — a heavy squat session yesterday shows hot quads, but three days later they're green again.
        </div>
      </div>
    </>
  );
}


function Plan({ go }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api("plan/week").then(p => { if (p && !p.error) setPlan(p); }).catch(() => {});
  }, []);

  const generate = async () => {
    setLoading(true); setErr(null);
    try {
      const p = await api("plan/week", {});
      if (p?.error) setErr(p.error);
      else setPlan(p);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const ST = {
    lift:  { color: "#6ab4e0", bg: "rgba(106,180,224,.12)", icon: "△" },
    zone2: { color: T.green,   bg: "rgba(61,220,132,.12)",  icon: "◎" },
    hiit:  { color: T.red,     bg: "rgba(224,122,106,.12)", icon: "▲" },
    climb: { color: "#a48ae0", bg: "rgba(164,138,224,.12)", icon: "◈" },
    flex:  { color: T.amber,   bg: "rgba(224,180,106,.12)", icon: "〜" },
    rest:  { color: T.dim,     bg: "rgba(255,255,255,.03)", icon: "◌" },
  };

  const genDate = plan?.generatedAt
    ? new Date(plan.generatedAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
    : null;

  return (
    <>
      <Back onClick={() => go("home")} title="This Week" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          {plan?.focus && <div style={{ ...serif, fontSize: 15, color: T.mid, maxWidth: 520, lineHeight: 1.5 }}>{plan.focus}</div>}
          {genDate && <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>Mentor · {genDate}</div>}
        </div>
        <button style={pill(!plan)} onClick={generate} disabled={loading}>
          {loading ? "Asking mentor…" : plan ? "Regenerate" : "Plan this week"}
        </button>
      </div>

      {err && (
        <div style={{ ...card, borderColor: "rgba(224,106,106,.3)", color: T.red, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!plan && !loading && !err && (
        <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ ...serif, fontSize: 24, marginBottom: 10 }}>No plan yet</div>
          <div style={{ fontSize: 13, color: T.mid, maxWidth: 360, margin: "0 auto 24px", lineHeight: 1.6 }}>
            Tap below and the mentor will review your recent training, recovery, and lift data to build a personalised week — strength, Zone 2, and HIIT balanced to your load.
          </div>
          <button style={{ ...pill(true), padding: "12px 28px", fontSize: 14 }} onClick={generate}>Plan this week</button>
        </div>
      )}

      {loading && (
        <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ ...serif, color: T.mid, fontSize: 16 }}>Mentor is analysing your training data…</div>
        </div>
      )}

      {plan?.days && !loading && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))" }}>
          {plan.days.map((d, i) => (
            <div key={i} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ ...serif, fontSize: 18 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: T.dim }}>{d.date}</div>
              </div>
              {(d.sessions || []).map((sess, j) => {
                const st = ST[sess.type] || ST.rest;
                return (
                  <div key={j} style={{ borderRadius: 10, padding: "10px 12px", background: st.bg, border: `1px solid ${st.color}28`, marginBottom: j < d.sessions.length - 1 ? 8 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sess.detail ? 5 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: st.color }}>{st.icon} {sess.title}</span>
                      {sess.duration && <span style={{ fontSize: 11, color: T.dim }}>{sess.duration}</span>}
                    </div>
                    {sess.detail && <div style={{ fontSize: 12, color: T.mid, lineHeight: 1.55 }}>{sess.detail}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {plan?.notes && !loading && (
        <div style={{ ...card, marginTop: 14, background: `linear-gradient(150deg, rgba(61,220,132,.06), ${T.panel} 60%)` }}>
          <div style={{ ...label, marginBottom: 6 }}>Mentor's note</div>
          <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.65 }}>{plan.notes}</div>
        </div>
      )}
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
