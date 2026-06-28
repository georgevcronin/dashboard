import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

// ── DESIGN SYSTEM ─────────────────────────────────────────────────────────
// Editorial brutalism. Electric-yellow accent, hard edges, oversized Syne
// numerals against a Georgia-italic editorial counterpoint. All colours route
// through CSS variables so the dark/light toggle is a single attribute flip.
const T = {
  bg: "var(--bg)", panel: "var(--panel)", panel2: "var(--panel2)", line: "var(--line)",
  dim: "var(--dim)", mid: "var(--mid)", fg: "var(--fg)",
  accent: "var(--accent)", bright: "var(--bright)", ink: "var(--ink)",
  // Status scale — kept semantic. green ALSO carried "brand" duty in the old
  // app; brand is now `accent` (yellow), so green means strictly "good".
  green: "var(--green)", amber: "var(--amber)", red: "var(--red)",
  blue: "var(--blue)", violet: "var(--violet)",
};

// Type scale — five steps, no in-between sizes.
//   hero   72  the single number that matters   (Syne 800)
//   display 44 secondary big metric             (Syne 800)
//   title  24  section / page headings          (Syne 700)
//   body   14  reading text
//   micro  11  labels + captions (UPPERCASE for labels)
const display = { fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 0.9, fontVariantNumeric: "tabular-nums" };
const titleFont = { fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, letterSpacing: "-0.02em" };
const serif = { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontWeight: 400 };
const num = { fontVariantNumeric: "tabular-nums" };

const label = { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.dim, fontWeight: 600 };
// Brutalist card: hard 3px corners, hairline rule, flat fill. No glow, no soft shadow.
const card = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 3, padding: 22 };
// Active pill = yellow highlighter block with ink text. Inactive = hairline ghost.
const pill = (a) => ({ padding: "7px 15px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: a ? 700 : 500, border: "1px solid", borderColor: a ? "transparent" : T.line, background: a ? T.bright : "transparent", color: a ? "#141414" : T.mid, transition: "all .12s", letterSpacing: a ? "0.01em" : "0" });
const input = { background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 3, padding: "11px 13px", color: T.fg, fontSize: 14 };

// CSS variables + base typography. Injected once at the root.
const GLOBAL_CSS = `
:root, :root[data-theme="dark"] {
  --bg:#0f0f0f; --panel:#171717; --panel2:#121212; --line:#292929;
  --dim:#6e6e6e; --mid:#9c9c9c; --fg:#f3f1ec; --ink:#141414;
  --accent:#F5E642; --bright:#F5E642;
  --green:#6ee787; --amber:#f5a623; --red:#ff5c4d; --blue:#5ac8fa; --violet:#b89cff;
}
:root[data-theme="light"] {
  --bg:#f4f1ea; --panel:#ece8de; --panel2:#e4dfd2; --line:#d6cfbf;
  --dim:#8a8478; --mid:#5d574c; --fg:#16140f; --ink:#16140f;
  --accent:#7a6a00; --bright:#F5E642;
  --green:#1f8f3e; --amber:#b5650a; --red:#c8341f; --blue:#1f6f9c; --violet:#6a4fd0;
}
* { -webkit-tap-highlight-color: transparent; }
body { font-family:'Inter',-apple-system,system-ui,sans-serif; }
::selection { background:var(--bright); color:#141414; }
`;

function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "light" ? "#f4f1ea" : "#0f0f0f");
  try { localStorage.setItem("press-theme", mode); } catch {}
}
function useTheme() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem("press-theme") || "dark"; } catch { return "dark"; }
  });
  useEffect(() => { applyTheme(mode); }, [mode]);
  return [mode, () => setMode(m => (m === "dark" ? "light" : "dark"))];
}
const API_BASE = "https://europe-west2-dashboard-79dbb.cloudfunctions.net/api";
const api = (p, body, method = "POST") => fetch(`${API_BASE}/${p}`, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

function useIsMobile(bp = 700) {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    setV(mq.matches);
    const h = e => setV(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [bp]);
  return v;
}

function Line({ data, w = 600, h = 140, color = T.green, fill = true }) {
  if (!data || data.length < 2) return <div style={{ ...serif, color: T.dim, fontSize: 14, padding: "20px 0" }}>Log a few days and the chart fills in.</div>;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 20) - 10]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  // Sanitise id — color may be "var(--green)", which is not a valid id fragment.
  const id = "g" + color.replace(/[^a-z0-9]/gi, "");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block" }}>
      {fill && <><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: color }} stopOpacity=".22" /><stop offset="100%" style={{ stopColor: color }} stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} /></>}
      <path d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: color }} />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="4" style={{ fill: color }} />
    </svg>
  );
}
function Ring({ pct, size = 150, stroke = 11, color = T.green, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" style={{ stroke: "var(--line)" }} />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct || 0, 1))} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .8s ease", stroke: color }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}
const Back = ({ onClick, title }) => (
  <div style={{ marginBottom: 22, paddingBottom: 16, borderBottom: `1px solid ${T.line}` }}>
    <button onClick={onClick} style={{ ...label, color: T.dim, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>← Home</button>
    <h2 style={{ ...titleFont, fontSize: "clamp(28px,5vw,40px)", margin: 0, lineHeight: 0.95, color: T.fg }}>{title}</h2>
  </div>
);
const dash = (v, unit = "") => (v == null ? "—" : `${typeof v === "number" ? Math.round(v * 10) / 10 : v}${unit}`);

const ARIA_COLOR = "#3dd8dc";

function Aria({ s }) {
  const [briefing, setBriefing] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [fetched, setFetched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setBusy(true);
    const hr = new Date().getHours();
    const timeOfDay = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";
    api("mentor", { messages: [{ role: "user", content: `Good ${timeOfDay}. Brief me on my status in exactly 2 sentences. Be direct, specific, and personal.` }] })
      .then(({ reply }) => setBriefing(reply))
      .catch(() => setBriefing("Hey! I'm ARIA — ask me anything about your data."))
      .finally(() => setBusy(false));
  }, []);

  async function send(text) {
    const q = (text ?? inp).trim();
    if (!q || busy) return;
    const seed = briefing ? [{ role: "assistant", content: briefing }] : [];
    const history = [...seed, ...msgs];
    const next = [...history, { role: "user", content: q }];
    setInp(""); setBusy(true);
    try {
      const { reply } = await api("mentor", { messages: next });
      setMsgs([...msgs, { role: "user", content: q }, { role: "assistant", content: reply }]);
    } finally { setBusy(false); }
  }

  const displayMsg = msgs.filter(m => m.role === "assistant").at(-1)?.content ?? briefing;
  const dot = busy ? T.amber : T.green;

  return (
    <div style={{ borderRadius: 16, border: `1px solid ${ARIA_COLOR}20`, background: `linear-gradient(150deg, rgba(61,216,220,.05), ${T.panel} 55%)`, padding: "13px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: `linear-gradient(135deg, ${ARIA_COLOR}cc, #0e4b4c)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", flexShrink: 0, boxShadow: `0 0 10px ${ARIA_COLOR}30` }}>✦</div>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: ARIA_COLOR }}>ARIA</span>
          <span style={{ fontSize: 9, color: T.dim, letterSpacing: "0.1em", marginLeft: 8 }}>PERSONAL ASSISTANT</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: dot, boxShadow: `0 0 5px ${dot}88`, transition: "background .3s" }} />
          <span style={{ color: T.dim, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ minHeight: 38, marginBottom: 10 }}>
            {busy && !displayMsg
              ? <div style={{ ...serif, color: T.dim, fontSize: 13, opacity: 0.7 }}>briefing…</div>
              : displayMsg
                ? <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.6 }}>{displayMsg}</div>
                : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={inputRef} value={inp} onChange={e => setInp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="ask ARIA anything…"
              style={{ ...input, flex: 1, borderRadius: 999, fontSize: 13, padding: "8px 14px", borderColor: `${ARIA_COLOR}28` }} />
            <button onClick={() => send()} disabled={busy || !inp.trim()}
              style={{ padding: "8px 15px", borderRadius: 999, background: `${ARIA_COLOR}18`, border: `1px solid ${ARIA_COLOR}40`, color: ARIA_COLOR, fontSize: 13, cursor: busy || !inp.trim() ? "default" : "pointer", opacity: busy || !inp.trim() ? 0.4 : 1, transition: "opacity .2s" }}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Home({ go, s }) {
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const t = s.today || {};

  const sleepTarget = s.sleepTarget || 8;
  const sleepSeries = (s.sleepSeries || []).slice(-7).map(d => d.h || 0);
  const rec = t.recovery;
  const recColor = rec == null ? T.dim : rec >= 70 ? T.green : rec >= 40 ? T.amber : T.red;

  const recentWorkouts = (s.workouts || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const lastWkt = recentWorkouts[0];
  const daysAgo = lastWkt ? Math.floor((Date.now() - new Date(lastWkt.date + "T12:00:00")) / 864e5) : null;

  const now = Date.now();
  const dow = new Date().getDay();
  const weekStartMs = now - ((dow === 0 ? 6 : dow - 1) * 864e5) - (now % 864e5);
  const setsThisWeek = (s.lifts || []).filter(l => new Date(l.date).getTime() >= weekStartMs).length;

  const protein = s.nutritionToday?.protein || 0;
  const proteinTarget = s.macroTargets?.protein || 160;
  const calories = s.nutritionToday?.calories || 0;
  const calTarget = s.macroTargets?.calories || 2400;
  const water = s.waterToday || 0;
  const waterTarget = s.profile?.waterTarget || 7;
  const lastThought = s.thoughts?.at(-1);
  const cap = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

  // ── Brutalist presentation ───────────────────────────────────────────────
  const name = s.profile?.name || "friend";
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  const recWord = rec == null ? "No data" : rec >= 80 ? "Primed" : rec >= 55 ? "Solid" : rec >= 40 ? "Worn" : "Run down";
  const recRead = rec == null ? "Recovery appears after a couple of synced nights."
    : rec >= 80 ? "Fully bounced back. Good day to push intensity."
    : rec >= 55 ? "Train, but keep something in the tank."
    : "Walk, hydrate, keep it light today.";

  // Flat cell — no card chrome. Hairline rules come from the 1px grid gap.
  const cell = { background: T.bg, padding: "20px 22px", cursor: "pointer", display: "flex", flexDirection: "column", userSelect: "none", transition: "background .14s", position: "relative", minHeight: 138 };
  const cellHover = {
    onMouseEnter: e => { e.currentTarget.style.background = T.panel; },
    onMouseLeave: e => { e.currentTarget.style.background = T.bg; },
  };
  const arrow = <span style={{ position: "absolute", top: 18, right: 20, color: T.dim, fontSize: 13 }}>↗</span>;
  const cellLabel = (txt, color) => <div style={{ ...label, color: color || T.dim }}>{txt}</div>;

  // ── Vitality content (shared between mobile + desktop) ──────────────────
  const vitalityContent = (
    <>
      <div style={{ ...label, color: T.green }}>Vitality</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
        <Ring pct={(rec || 0) / 100} size={isMobile ? 72 : 86} stroke={8} color={recColor}>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: recColor, lineHeight: 1 }}>{rec != null ? rec : "—"}</div>
          <div style={{ fontSize: 8, color: T.dim, letterSpacing: "0.1em", marginTop: 1 }}>REC</div>
        </Ring>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={label}>Sleep</div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 600, marginTop: 1, color: !t.sleepH ? T.dim : t.sleepH >= sleepTarget ? T.green : t.sleepH >= sleepTarget * 0.82 ? T.amber : T.red }}>
              {t.sleepH ? fmtHM(t.sleepH) : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div><div style={label}>HRV</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 1, color: T.fg }}>{t.hrv != null ? t.hrv : "—"}</div></div>
            {t.rhr && <div><div style={label}>HR</div><div style={{ fontSize: 14, color: T.fg, marginTop: 1 }}>{t.rhr}</div></div>}
          </div>
        </div>
      </div>
      {sleepSeries.length > 2 && (
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          <div style={{ ...label, marginBottom: 5 }}>7-night sleep</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 30 }}>
            {sleepSeries.map((h, i) => {
              const pct = Math.min(1, h / (sleepTarget * 1.15));
              const c = h >= sleepTarget ? T.green : h >= sleepTarget * 0.82 ? T.amber : T.red;
              return <div key={i} style={{ flex: 1, background: `${c}55`, borderRadius: "3px 3px 0 0", height: `${Math.max(10, pct * 100)}%` }} />;
            })}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>Open →</div>
    </>
  );

  // ── Fuel bars ──────────────────────────────────────────────────────────
  const fuelBars = [
    { lbl: "Protein", val: Math.round(protein), max: proteinTarget, unit: "g", color: T.green },
    { lbl: "Calories", val: Math.round(calories), max: calTarget, unit: "kcal", color: T.amber },
    { lbl: "Water", val: water, max: waterTarget, unit: "", color: "#6ab4e0" },
  ].map(({ lbl, val, max, unit, color }) => (
    <div key={lbl}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.dim }}>{lbl}</div>
        <div style={{ fontSize: 11, color: T.fg }}>{val}<span style={{ color: T.dim }}>/{max}{unit}</span></div>
      </div>
      <div style={{ height: 3, background: T.line, borderRadius: 99, marginBottom: 7 }}>
        <div style={{ height: "100%", width: `${Math.min(100, (val / max) * 100)}%`, background: color, borderRadius: 99, transition: "width .5s" }} />
      </div>
    </div>
  ));

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, background: `linear-gradient(135deg, ${T.green}, #1a6b40)`, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...serif, fontSize: 17 }}>{greet}, <span style={{ color: T.green }}>{s.profile?.name || "friend"}</span></div>
            <div style={{ ...label, fontSize: 9 }}>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}{s.lastSync && <span style={{ color: T.dim }}> · {s.lastSync}</span>}</div>
          </div>
        </div>

        <Aria s={s} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {/* Vitality — full width */}
          <div style={{ ...tile("rgba(61,220,132,.1)"), gridColumn: "1 / 3", minHeight: 160 }} onClick={() => go("vitality")} {...hover(T.green)}>
            {vitalityContent}
          </div>

          {/* Train */}
          <div style={{ ...tile("rgba(106,180,224,.09)"), minHeight: 130 }} onClick={() => go("train")} {...hover("#6ab4e0")}>
            <div style={{ ...label, color: "#6ab4e0" }}>Train</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: T.fg, lineHeight: 1, marginTop: 6 }}>{s.workoutsMonth ?? 0}</div>
            <div style={{ fontSize: 10, color: T.dim }}>this month</div>
            <div style={{ marginTop: "auto", paddingTop: 8 }}>
              {lastWkt && <div style={{ fontSize: 11, color: T.fg, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastWkt.name}</div>}
              <div style={{ fontSize: 10, color: T.dim }}>{daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`}</div>
            </div>
          </div>

          {/* Fuel */}
          <div style={{ ...tile("rgba(224,180,106,.08)"), minHeight: 130 }} onClick={() => go("fuel")} {...hover(T.amber)}>
            <div style={{ ...label, color: T.amber }}>Fuel</div>
            <div style={{ flex: 1, marginTop: 8 }}>{fuelBars}</div>
          </div>

          {/* Mentor */}
          <div style={{ ...tile("rgba(224,106,106,.08)"), minHeight: 110 }} onClick={() => go("mentor")} {...hover(T.red)}>
            <div style={{ ...label, color: T.red }}>Mentor</div>
            <div style={{ flex: 1, marginTop: 6, overflow: "hidden" }}>
              {lastThought?.text
                ? <div style={{ fontSize: 11, color: T.mid, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lastThought.text}</div>
                : <div style={{ ...serif, fontSize: 11, color: T.dim }}>Your AI coach.</div>}
            </div>
            <div style={{ fontSize: 10, color: T.dim, marginTop: 6 }}>Ask →</div>
          </div>

          {/* Fatigue */}
          <div style={{ ...tile("rgba(164,138,224,.08)"), minHeight: 110 }} onClick={() => go("fatigue")} {...hover("#a48ae0")}>
            <div style={{ ...label, color: "#a48ae0" }}>Fatigue</div>
            <div style={{ flex: 1, marginTop: 6 }}>
              {lastWkt
                ? <><div style={{ fontSize: 12, color: T.fg, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastWkt.name}</div>
                    <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{daysAgo === 0 ? "Active today" : `${daysAgo}d recovery`}</div></>
                : <div style={{ fontSize: 11, color: T.dim }}>Log workouts →</div>}
            </div>
            <div style={{ fontSize: 10, color: T.dim, marginTop: 6 }}>Heat map →</div>
          </div>

          {/* Plan — full width */}
          <div style={{ ...tile("rgba(106,180,224,.06)"), gridColumn: "1 / 3", minHeight: 80 }} onClick={() => go("plan")} {...hover("#6ab4e0")}>
            <div style={{ ...label, color: "#6ab4e0" }}>This Week</div>
            <div style={{ flex: 1, marginTop: 6 }}>
              {s.weeklyPlan?.focus
                ? <div style={{ ...serif, fontSize: 13, color: T.mid, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.weeklyPlan.focus}</div>
                : <div style={{ ...serif, fontSize: 12, color: T.dim }}>Generate your week →</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${T.green}, #1a6b40)`, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...serif, fontSize: 20 }}>{greet}, <span style={{ color: T.green }}>{s.profile?.name || "friend"}</span></span>
          <span style={{ ...label, marginLeft: 12 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span>
        </div>
      </div>

      <div style={{ flexShrink: 0 }}><Aria s={s} /></div>

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr 1fr", gridTemplateRows: "minmax(160px, 1fr) minmax(160px, 1fr) minmax(110px, .72fr)", gap: 10, minHeight: "calc(100dvh - 260px)" }}>

        {/* HERO — RECOVERY, full width */}
        <div style={{ ...cell, gridColumn: "1 / -1", minHeight: 0, padding: "26px 24px" }} onClick={() => go("vitality")} {...cellHover}>
          {arrow}
          {cellLabel("Today · Recovery", T.accent)}
          <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: "0 30px", marginTop: 8 }}>
            <div style={{ ...display, fontSize: "clamp(64px,16vw,112px)", color: recColor }}>
              {rec != null ? rec : "—"}<span style={{ fontSize: "0.3em", color: T.dim, marginLeft: 4 }}>%</span>
            </div>
            <div style={{ flex: 1, minWidth: 200, paddingBottom: 14 }}>
              <div style={{ ...titleFont, fontSize: 22, color: recColor, marginBottom: 6 }}>{recWord}</div>
              <div style={{ fontSize: 13, color: T.mid, lineHeight: 1.5, maxWidth: 360 }}>{recRead}</div>
            </div>
            <div style={{ display: "flex", gap: 28, paddingBottom: 14 }}>
              {[["Sleep", t.sleepH ? fmtHM(t.sleepH) : "—"], ["HRV", t.hrv != null ? t.hrv : "—"], ["RHR", t.rhr || "—"]].map(([k, v]) => (
                <div key={k}>
                  <div style={label}>{k}</div>
                  <div style={{ ...num, fontSize: 22, fontWeight: 700, color: T.fg, marginTop: 5 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          {sleepSeries.length > 2 && (
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ ...label, whiteSpace: "nowrap" }}>7-night sleep</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 30, flex: 1, maxWidth: 340 }}>
                {sleepSeries.map((h, i) => {
                  const pct = Math.min(1, h / (sleepTarget * 1.15));
                  const c = h >= sleepTarget ? T.green : h >= sleepTarget * 0.82 ? T.amber : T.red;
                  return <div key={i} style={{ flex: 1, background: c, opacity: 0.5, height: `${Math.max(12, pct * 100)}%` }} />;
                })}
              </div>
            </div>
          )}
        </div>

        {/* TRAIN */}
        <div style={cell} onClick={() => go("train")} {...cellHover}>
          {arrow}{cellLabel("Train", T.blue)}
          <div style={{ ...display, fontSize: 52, color: T.fg, marginTop: 14 }}>{s.workoutsMonth ?? 0}</div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>workouts this month</div>
          <div style={{ marginTop: "auto", paddingTop: 14 }}>
            {lastWkt && <div style={{ fontSize: 12, color: T.fg, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastWkt.name}</div>}
            <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{lastWkt ? (daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`) : "—"} · {setsThisWeek} sets/wk</div>
          </div>
        </div>

        {/* FUEL */}
        <div style={cell} onClick={() => go("fuel")} {...cellHover}>
          {arrow}{cellLabel("Fuel", T.amber)}
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 14 }}>
            <div style={{ ...display, fontSize: 52, color: T.fg }}>{Math.round(calories)}</div>
            <div style={{ ...num, fontSize: 12, color: T.dim }}>/ {calTarget}</div>
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6 }}>kcal today</div>
          <div style={{ marginTop: "auto", paddingTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            {[["Protein", Math.round(protein), proteinTarget, T.green], ["Water", water, waterTarget, T.blue]].map(([k, v, m, c]) => (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.dim }}>{k}</span>
                  <span style={{ ...num, fontSize: 11, color: T.fg }}>{v}<span style={{ color: T.dim }}>/{m}</span></span>
                </div>
                <div style={{ height: 3, background: T.line }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (v / m) * 100)}%`, background: c, transition: "width .5s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FATIGUE */}
        <div style={cell} onClick={() => go("fatigue")} {...cellHover}>
          {arrow}{cellLabel("Fatigue", T.violet)}
          <div style={{ flex: 1, marginTop: 14 }}>
            {lastWkt
              ? <><div style={{ ...titleFont, fontSize: 18, color: T.fg, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastWkt.name}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>{daysAgo === 0 ? "Active today" : daysAgo === 1 ? "1 day recovery" : `${daysAgo}d recovery`}</div></>
              : <div style={{ ...serif, fontSize: 14, color: T.dim }}>Log workouts to see muscle fatigue.</div>}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Muscle heat map ↗</div>
        </div>

        {/* MENTOR */}
        <div style={cell} onClick={() => go("mentor")} {...cellHover}>
          {arrow}{cellLabel("Mentor", T.red)}
          <div style={{ flex: 1, marginTop: 14, overflow: "hidden" }}>
            {lastThought?.text
              ? <div style={{ ...serif, fontSize: 14, color: T.mid, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>“{lastThought.text}”</div>
              : <div style={{ ...serif, fontSize: 14, color: T.dim, lineHeight: 1.5 }}>Your AI coach — training, recovery, nutrition.</div>}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Ask anything ↗</div>
        </div>

        {/* PLAN */}
        <div style={cell} onClick={() => go("plan")} {...cellHover}>
          {arrow}{cellLabel("This Week", T.blue)}
          <div style={{ flex: 1, marginTop: 14 }}>
            {s.weeklyPlan?.focus
              ? <div style={{ ...serif, fontSize: 15, color: T.mid, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.weeklyPlan.focus}</div>
              : <div style={{ ...serif, fontSize: 14, color: T.dim }}>No plan yet — generate your week.</div>}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Plan the week ↗</div>
        </div>

        {/* PROFILE */}
        <div style={cell} onClick={() => go("settings")} {...cellHover}>
          {arrow}{cellLabel("Profile")}
          <div style={{ flex: 1, marginTop: 14 }}>
            <div style={{ ...titleFont, fontSize: 18, color: T.fg }}>{name}</div>
            {s.macroGoal && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, textTransform: "capitalize" }}>Goal · {cap(s.macroGoal)}</div>}
            {s.profile?.heightCm && <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>Height · {s.profile.heightCm} cm</div>}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Edit profile ↗</div>
        </div>

      </div>
    </div>
  );
}

// Bevel-style sleep quality: duration^1.5 × efficiency × HRV ratio
function sleepQuality(sleepH, sleepEff, hrv, baselineHrv, target) {
  if (!sleepH || !target) return null;
  const duration = Math.min(1, sleepH / target);
  const eff = sleepEff ? sleepEff / 100 : 0.85;
  const hrvMult = (hrv && baselineHrv) ? Math.min(1.1, Math.max(0.3, hrv / baselineHrv)) : 1.0;
  return Math.round(Math.min(99, Math.pow(duration, 1.5) * eff * hrvMult * 100));
}

function fmtHM(h) {
  if (h == null || isNaN(h)) return "—";
  const hrs = Math.floor(Math.abs(h));
  const mins = Math.round((Math.abs(h) - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

function Vitality({ go, s }) {
  const t = s.today || {};
  const sleepTarget = s.sleepTarget || 8;
  const qual = sleepQuality(t.sleepH, t.sleepEff, t.hrv, s.baselines?.hrv, sleepTarget);
  const qualColor = qual == null ? T.dim : qual >= 75 ? T.green : qual >= 50 ? T.amber : T.red;
  const qualWord = qual == null ? null : qual >= 75 ? "Great" : qual >= 50 ? "Decent" : qual >= 30 ? "Poor" : "Very poor";
  const coach = qual == null
    ? "Connect Health Auto Export to track sleep quality."
    : qual >= 75 ? "Well rested. Sleep is supporting your recovery and training."
    : qual >= 50 ? "Decent sleep. Consistent timing and hitting your duration target will push this higher."
    : qual >= 30 ? "Below average. Avoid alcohol and heavy meals in the evening, and aim for a consistent wind-down time."
    : "Poor sleep. Your body didn't get the rest it needed — take it easy today and prioritise tonight.";

  const todayISO = new Date().toISOString().slice(0, 10);
  const yesterdayISO = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const fmtDay = (dateStr) => {
    if (!dateStr) return ["", ""];
    if (dateStr === todayISO) return ["Today", ""];
    if (dateStr === yesterdayISO) return ["Yest", ""];
    const d = new Date(dateStr + "T12:00:00");
    return [d.toLocaleDateString("en-GB", { weekday: "short" }), String(d.getDate())];
  };

  const sleepSeries = s.sleepSeries || [];
  const maxH = Math.max(sleepTarget * 1.15, ...sleepSeries.map(d => d.h || 0), 0.1);

  // Two-process sleep pressure model (ΔS = α(1−S)·t_wake − β·S·t_sleep, baseline 7.5 h)
  const pressureSeries = Array.isArray(s.sleepPressureSeries) ? s.sleepPressureSeries : [];
  const currentPressure = typeof s.sleepPressure === "number" ? s.sleepPressure : (pressureSeries.at(-1)?.pressure ?? null);
  const SP_REST_UI = 0.15;
  const pressureEntries = pressureSeries.map((p, i) => ({
    date: p.date,
    pressure: p.pressure ?? SP_REST_UI,
    debtH: p.debtH ?? 0,
    delta: i > 0 ? (p.pressure ?? SP_REST_UI) - (pressureSeries[i - 1].pressure ?? SP_REST_UI) : 0,
  }));
  const absMaxDelta = pressureEntries.length > 0 ? Math.max(0.02, ...pressureEntries.map(e => Math.abs(e.delta))) : 0.02;
  const debtH = typeof s.sleepDebtH === "number" ? s.sleepDebtH : 0;
  const pressureColor = currentPressure == null ? T.dim : currentPressure <= SP_REST_UI * 1.3 ? T.green : currentPressure <= SP_REST_UI * 2.2 ? T.amber : T.red;

  return (
    <>
      <Back onClick={() => go("home")} title="Vitality" />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>

        {/* Recovery ring */}
        <div style={{ ...card, display: "flex", gap: 20, alignItems: "center" }}>
          <Ring pct={(t.recovery ?? 0) / 100} size={150}>
            <div style={{ fontSize: 36, fontWeight: 600 }}>{dash(t.recovery)}<span style={{ fontSize: 15 }}>%</span></div>
            <div style={{ ...label, color: T.green }}>Recovery</div>
          </Ring>
          <div>
            <div style={{ ...serif, fontSize: 19 }}>{t.recovery == null ? "Waiting for data" : t.recovery >= 80 ? "Primed" : t.recovery >= 55 ? "Solid" : "Run down"}</div>
            <p style={{ fontSize: 13, color: T.mid, lineHeight: 1.5, margin: "4px 0 0" }}>
              {t.recovery == null ? "Recovery appears after a couple of synced nights — computed from HRV vs baseline and sleep." :
                t.recovery >= 80 ? "Fully bounced back. Good day to push intensity." : t.recovery >= 55 ? "Train, but keep something in the tank." : "Walk, hydrate, no important decisions."}
            </p>
          </div>
        </div>

        {/* Sleep Quality ring (Bevel-style) */}
        <div style={{ ...card, display: "flex", gap: 20, alignItems: "center" }}>
          <Ring pct={(qual ?? 0) / 100} size={150} color={qualColor}>
            <div style={{ fontSize: 36, fontWeight: 600, color: qualColor }}>{qual ?? "—"}{qual != null && <span style={{ fontSize: 15 }}>%</span>}</div>
            <div style={{ ...label, color: qualColor }}>Quality</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...serif, fontSize: 19, color: qualColor, marginBottom: 8 }}>{qualWord ?? "No data"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[["Time Asleep", fmtHM(t.sleepH)], ["Time in Bed", fmtHM(t.sleepInBed ?? (t.sleepH && t.sleepEff ? t.sleepH / (t.sleepEff / 100) : null))]].map(([k, v]) => (
                <div key={k} style={{ background: "var(--panel2)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: T.mid, lineHeight: 1.5, margin: 0 }}>{coach}</p>
          </div>
        </div>


        {/* Sleep history — labelled bar chart */}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={{ ...label, marginBottom: 14 }}>Sleep · last 14 nights</div>
          {sleepSeries.every(d => !d.h) ? (
            <div style={{ ...serif, color: T.dim, fontSize: 14 }}>No sleep data yet — connect Health Auto Export.</div>
          ) : (
            <>
              <div style={{ position: "relative", height: 120 }}>
                {/* Dotted target line */}
                <div style={{ position: "absolute", left: 0, right: 0, top: `${(1 - sleepTarget / maxH) * 100}%`, borderTop: `1px dashed ${T.dim}`, zIndex: 1, pointerEvents: "none" }}>
                  <span style={{ position: "absolute", right: 0, top: -13, fontSize: 9, color: T.dim }}>{sleepTarget}h</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: "100%" }}>
                  {sleepSeries.map((d, i) => {
                    const isToday = d.date === todayISO;
                    const pct = d.h ? Math.min(d.h / maxH, 1) : 0;
                    const barColor = !d.h ? "transparent" : d.h >= sleepTarget ? T.green : d.h >= sleepTarget * 0.8 ? T.amber : T.red;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                        {d.h && <div style={{ fontSize: 8, color: T.dim, textAlign: "center", marginBottom: 2 }}>{fmtHM(d.h)}</div>}
                        <div style={{ height: `${pct * 88}%`, minHeight: d.h ? 3 : 0, background: barColor, borderRadius: "3px 3px 0 0", outline: isToday ? `2px solid ${T.fg}` : "none", outlineOffset: 1 }} title={d.h ? `${fmtHM(d.h)}${d.eff ? ` · ${d.eff}% eff` : ""}` : "No data"} />
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Day labels */}
              <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                {sleepSeries.map((d, i) => {
                  const isToday = d.date === todayISO;
                  const [line1, line2] = fmtDay(d.date);
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center", lineHeight: 1.25 }}>
                      <div style={{ fontSize: 8, color: isToday ? T.green : T.dim, fontWeight: isToday ? 700 : 400 }}>{line1}</div>
                      {line2 && <div style={{ fontSize: 8, color: isToday ? T.green : T.dim }}>{line2}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 10, color: T.dim, marginTop: 10 }}>
                <span><span style={{ color: T.green }}>■</span> Hit target</span>
                <span><span style={{ color: T.amber }}>■</span> 80–99%</span>
                <span><span style={{ color: T.red }}>■</span> Below 80%</span>
                <span style={{ marginLeft: "auto" }}><span style={{ outline: `1.5px solid ${T.fg}`, padding: "0 3px", borderRadius: 2 }}>&nbsp;</span> Today</span>
              </div>
            </>
          )}
        </div>

        {/* Sleep Pressure */}
        <div style={{ ...card, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={label}>Sleep Pressure · last 14 nights</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: pressureColor, lineHeight: 1 }}>
                  {currentPressure != null ? Math.round(currentPressure * 100) : "—"}{currentPressure != null && <span style={{ fontSize: 20 }}>%</span>}
                </div>
                <div style={{ fontSize: 13, color: pressureColor }}>
                  {currentPressure == null ? "" : currentPressure <= SP_REST_UI * 1.3 ? "Recovered" : currentPressure <= SP_REST_UI * 2.2 ? "Mild debt" : "High debt"}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.6, textAlign: "right" }}>
              Baseline 7h 30m/night<br />
              {debtH > 0 ? `${fmtHM(debtH)} to clear` : "Fully cleared"}
            </div>
          </div>
          {/* Per-night pressure change bars, centred on a zero line */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 3, height: 70 }}>
            {pressureEntries.map((e, i) => {
              const isToday = e.date === todayISO;
              const recovered = e.delta < 0;
              const accumulated = e.delta > 0;
              const pct = Math.abs(e.delta) / absMaxDelta;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    {recovered ? <div style={{ width: "100%", height: `${pct * 100}%`, background: T.green, borderRadius: "3px 3px 0 0", minHeight: 3, outline: isToday ? `1.5px solid ${T.fg}` : "none" }} title={`Pressure −${(Math.abs(e.delta) * 100).toFixed(1)}%`} /> : <div style={{ width: "100%" }} />}
                  </div>
                  <div style={{ height: 1, width: "100%", background: T.line }} />
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-start", width: "100%" }}>
                    {accumulated ? <div style={{ width: "100%", height: `${pct * 100}%`, background: T.red, borderRadius: "0 0 3px 3px", minHeight: 3, outline: isToday ? `1.5px solid ${T.fg}` : "none" }} title={`Pressure +${(e.delta * 100).toFixed(1)}%`} /> : <div style={{ width: "100%" }} />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Day labels */}
          <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
            {pressureEntries.map((e, i) => {
              const isToday = e.date === todayISO;
              const [line1, line2] = fmtDay(e.date);
              return (
                <div key={i} style={{ flex: 1, textAlign: "center", lineHeight: 1.25 }}>
                  <div style={{ fontSize: 8, color: isToday ? T.green : T.dim, fontWeight: isToday ? 700 : 400 }}>{line1}</div>
                  {line2 && <div style={{ fontSize: 8, color: isToday ? T.green : T.dim }}>{line2}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 10, lineHeight: 1.5 }}>
            Green bars = pressure fell (good sleep). Red bars = pressure rose (short sleep). Current pressure {currentPressure != null ? Math.round(currentPressure * 100) + "%" : "—"}; baseline is ~15% after a full 7h 30m night.
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ ...card, gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 18 }}>
          {[
            ["Sleep", fmtHM(t.sleepH), t.sleepEff ? `${Math.round(t.sleepEff)}% efficiency` : ""],
            ["Quality", qual != null ? qual + "%" : "—", qualWord ?? ""],
            ["HRV", dash(t.hrv, " ms"), s.baselines?.hrv ? `baseline ${s.baselines.hrv} ms` : ""],
            ["Resting HR", dash(t.rhr, " bpm"), s.baselines?.rhr ? `baseline ${s.baselines.rhr}` : ""],
            ["Steps", t.steps ? Math.round(t.steps).toLocaleString() : "—", "today"],
          ].map(([k, v, sub]) => (
            <div key={k}><div style={label}>{k}</div><div style={{ fontSize: 23, fontWeight: 600, margin: "4px 0 2px" }}>{v}</div><div style={{ fontSize: 11, color: T.dim }}>{sub}</div></div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Exercise library ────────────────────────────────────────────────────────
const MUSCLES = [
  { key: "chest", label: "Chest" }, { key: "lats", label: "Lats" }, { key: "rhomboids", label: "Rhomboids" },
  { key: "frontDelts", label: "Front Delts" }, { key: "sideDelts", label: "Side Delts" }, { key: "rearDelts", label: "Rear Delts" },
  { key: "traps", label: "Traps" }, { key: "biceps", label: "Biceps" }, { key: "triceps", label: "Triceps" },
  { key: "forearms", label: "Forearms" }, { key: "quads", label: "Quads" }, { key: "hamstrings", label: "Hamstrings" },
  { key: "glutes", label: "Glutes" }, { key: "adductors", label: "Adductors" }, { key: "calves", label: "Calves" },
  { key: "lowerBack", label: "Lower Back" }, { key: "core", label: "Core" },
];
const CATEGORIES = ["chest","back","shoulders","arms","legs","core","cardio","other"];
const EQUIPMENT_TYPES = ["barbell","dumbbell","cable","machine","bodyweight","kettlebell","bands","other"];

const BUILTIN_EXERCISES = [
  // Chest
  { name:"barbell bench press", category:"chest", equipment:"barbell", primaryMuscles:["chest"], secondaryMuscles:["frontDelts","triceps"] },
  { name:"incline barbell bench press", category:"chest", equipment:"barbell", primaryMuscles:["chest"], secondaryMuscles:["frontDelts","triceps"] },
  { name:"decline barbell bench press", category:"chest", equipment:"barbell", primaryMuscles:["chest"], secondaryMuscles:["triceps"] },
  { name:"dumbbell bench press", category:"chest", equipment:"dumbbell", primaryMuscles:["chest"], secondaryMuscles:["frontDelts","triceps"] },
  { name:"incline dumbbell press", category:"chest", equipment:"dumbbell", primaryMuscles:["chest"], secondaryMuscles:["frontDelts","triceps"] },
  { name:"dumbbell fly", category:"chest", equipment:"dumbbell", primaryMuscles:["chest"], secondaryMuscles:[] },
  { name:"incline dumbbell fly", category:"chest", equipment:"dumbbell", primaryMuscles:["chest"], secondaryMuscles:[] },
  { name:"cable fly", category:"chest", equipment:"cable", primaryMuscles:["chest"], secondaryMuscles:[] },
  { name:"cable crossover", category:"chest", equipment:"cable", primaryMuscles:["chest"], secondaryMuscles:[] },
  { name:"pec deck", category:"chest", equipment:"machine", primaryMuscles:["chest"], secondaryMuscles:[] },
  { name:"push-up", category:"chest", equipment:"bodyweight", primaryMuscles:["chest"], secondaryMuscles:["triceps","frontDelts"] },
  { name:"dips", category:"chest", equipment:"bodyweight", primaryMuscles:["chest"], secondaryMuscles:["triceps","frontDelts"] },
  // Back
  { name:"pull-up", category:"back", equipment:"bodyweight", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","biceps","forearms"] },
  { name:"chin-up", category:"back", equipment:"bodyweight", primaryMuscles:["lats"], secondaryMuscles:["biceps","rhomboids"] },
  { name:"lat pulldown", category:"back", equipment:"cable", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","biceps"] },
  { name:"seated cable row", category:"back", equipment:"cable", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","rearDelts","biceps"] },
  { name:"barbell row", category:"back", equipment:"barbell", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","rearDelts","biceps","forearms"] },
  { name:"dumbbell row", category:"back", equipment:"dumbbell", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","rearDelts","biceps"] },
  { name:"t-bar row", category:"back", equipment:"barbell", primaryMuscles:["lats"], secondaryMuscles:["rhomboids","rearDelts","biceps"] },
  { name:"straight arm pulldown", category:"back", equipment:"cable", primaryMuscles:["lats"], secondaryMuscles:[] },
  { name:"face pull", category:"back", equipment:"cable", primaryMuscles:["rearDelts"], secondaryMuscles:["rhomboids"] },
  { name:"deadlift", category:"back", equipment:"barbell", primaryMuscles:["lats"], secondaryMuscles:["glutes","hamstrings","lowerBack","traps","forearms"] },
  { name:"romanian deadlift", category:"legs", equipment:"barbell", primaryMuscles:["hamstrings"], secondaryMuscles:["glutes","lowerBack"] },
  { name:"sumo deadlift", category:"legs", equipment:"barbell", primaryMuscles:["glutes"], secondaryMuscles:["hamstrings","adductors","lats"] },
  { name:"good morning", category:"back", equipment:"barbell", primaryMuscles:["hamstrings"], secondaryMuscles:["lowerBack","glutes"] },
  // Shoulders
  { name:"barbell overhead press", category:"shoulders", equipment:"barbell", primaryMuscles:["frontDelts"], secondaryMuscles:["triceps","sideDelts"] },
  { name:"dumbbell shoulder press", category:"shoulders", equipment:"dumbbell", primaryMuscles:["frontDelts"], secondaryMuscles:["triceps","sideDelts"] },
  { name:"seated dumbbell press", category:"shoulders", equipment:"dumbbell", primaryMuscles:["frontDelts"], secondaryMuscles:["triceps","sideDelts"] },
  { name:"arnold press", category:"shoulders", equipment:"dumbbell", primaryMuscles:["frontDelts"], secondaryMuscles:["sideDelts","triceps"] },
  { name:"lateral raise", category:"shoulders", equipment:"dumbbell", primaryMuscles:["sideDelts"], secondaryMuscles:[] },
  { name:"cable lateral raise", category:"shoulders", equipment:"cable", primaryMuscles:["sideDelts"], secondaryMuscles:[] },
  { name:"front raise", category:"shoulders", equipment:"dumbbell", primaryMuscles:["frontDelts"], secondaryMuscles:[] },
  { name:"rear delt fly", category:"shoulders", equipment:"dumbbell", primaryMuscles:["rearDelts"], secondaryMuscles:["rhomboids"] },
  { name:"upright row", category:"shoulders", equipment:"barbell", primaryMuscles:["sideDelts"], secondaryMuscles:["traps","biceps"] },
  { name:"shrug", category:"shoulders", equipment:"barbell", primaryMuscles:["traps"], secondaryMuscles:[] },
  // Arms
  { name:"barbell curl", category:"arms", equipment:"barbell", primaryMuscles:["biceps"], secondaryMuscles:["forearms"] },
  { name:"dumbbell curl", category:"arms", equipment:"dumbbell", primaryMuscles:["biceps"], secondaryMuscles:["forearms"] },
  { name:"hammer curl", category:"arms", equipment:"dumbbell", primaryMuscles:["biceps"], secondaryMuscles:["forearms"] },
  { name:"incline dumbbell curl", category:"arms", equipment:"dumbbell", primaryMuscles:["biceps"], secondaryMuscles:[] },
  { name:"cable curl", category:"arms", equipment:"cable", primaryMuscles:["biceps"], secondaryMuscles:["forearms"] },
  { name:"preacher curl", category:"arms", equipment:"machine", primaryMuscles:["biceps"], secondaryMuscles:[] },
  { name:"concentration curl", category:"arms", equipment:"dumbbell", primaryMuscles:["biceps"], secondaryMuscles:[] },
  { name:"tricep pushdown", category:"arms", equipment:"cable", primaryMuscles:["triceps"], secondaryMuscles:[] },
  { name:"overhead tricep extension", category:"arms", equipment:"cable", primaryMuscles:["triceps"], secondaryMuscles:[] },
  { name:"skull crusher", category:"arms", equipment:"barbell", primaryMuscles:["triceps"], secondaryMuscles:[] },
  { name:"close-grip bench press", category:"arms", equipment:"barbell", primaryMuscles:["triceps"], secondaryMuscles:["chest"] },
  { name:"tricep kickback", category:"arms", equipment:"dumbbell", primaryMuscles:["triceps"], secondaryMuscles:[] },
  // Legs
  { name:"back squat", category:"legs", equipment:"barbell", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings","core"] },
  { name:"front squat", category:"legs", equipment:"barbell", primaryMuscles:["quads"], secondaryMuscles:["core","glutes"] },
  { name:"hack squat", category:"legs", equipment:"machine", primaryMuscles:["quads"], secondaryMuscles:["glutes"] },
  { name:"leg press", category:"legs", equipment:"machine", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings"] },
  { name:"leg extension", category:"legs", equipment:"machine", primaryMuscles:["quads"], secondaryMuscles:[] },
  { name:"leg curl", category:"legs", equipment:"machine", primaryMuscles:["hamstrings"], secondaryMuscles:[] },
  { name:"seated leg curl", category:"legs", equipment:"machine", primaryMuscles:["hamstrings"], secondaryMuscles:[] },
  { name:"nordic hamstring curl", category:"legs", equipment:"bodyweight", primaryMuscles:["hamstrings"], secondaryMuscles:[] },
  { name:"hip thrust", category:"legs", equipment:"barbell", primaryMuscles:["glutes"], secondaryMuscles:["hamstrings"] },
  { name:"glute bridge", category:"legs", equipment:"bodyweight", primaryMuscles:["glutes"], secondaryMuscles:["hamstrings"] },
  { name:"bulgarian split squat", category:"legs", equipment:"dumbbell", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings"] },
  { name:"lunges", category:"legs", equipment:"bodyweight", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings"] },
  { name:"walking lunges", category:"legs", equipment:"dumbbell", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings"] },
  { name:"reverse lunge", category:"legs", equipment:"bodyweight", primaryMuscles:["quads"], secondaryMuscles:["glutes","hamstrings"] },
  { name:"step-up", category:"legs", equipment:"dumbbell", primaryMuscles:["quads"], secondaryMuscles:["glutes"] },
  { name:"hip adduction", category:"legs", equipment:"machine", primaryMuscles:["adductors"], secondaryMuscles:[] },
  { name:"glute 45", category:"legs", equipment:"machine", primaryMuscles:["glutes"], secondaryMuscles:["hamstrings"] },
  { name:"calf raise", category:"legs", equipment:"machine", primaryMuscles:["calves"], secondaryMuscles:[] },
  { name:"seated calf raise", category:"legs", equipment:"machine", primaryMuscles:["calves"], secondaryMuscles:[] },
  // Core
  { name:"plank", category:"core", equipment:"bodyweight", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"crunch", category:"core", equipment:"bodyweight", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"cable crunch", category:"core", equipment:"cable", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"leg raise", category:"core", equipment:"bodyweight", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"hanging leg raise", category:"core", equipment:"bodyweight", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"russian twist", category:"core", equipment:"bodyweight", primaryMuscles:["core"], secondaryMuscles:[] },
  { name:"ab wheel rollout", category:"core", equipment:"other", primaryMuscles:["core"], secondaryMuscles:["lats"] },
  // Cardio
  { name:"treadmill running", category:"cardio", equipment:"machine", primaryMuscles:[], secondaryMuscles:[] },
  { name:"cycling", category:"cardio", equipment:"machine", primaryMuscles:[], secondaryMuscles:[] },
  { name:"rowing machine", category:"cardio", equipment:"machine", primaryMuscles:[], secondaryMuscles:[] },
  { name:"elliptical", category:"cardio", equipment:"machine", primaryMuscles:[], secondaryMuscles:[] },
  { name:"jump rope", category:"cardio", equipment:"bodyweight", primaryMuscles:[], secondaryMuscles:[] },
  { name:"stair climber", category:"cardio", equipment:"machine", primaryMuscles:[], secondaryMuscles:["quads","glutes"] },
];

const SET_TYPES = [
  { key: "warmup", label: "W", title: "Warm-up" },
  { key: "working", label: "●", title: "Working" },
  { key: "drop", label: "D", title: "Drop set" },
  { key: "failure", label: "F", title: "To failure" },
];

function mkSet(prev = null) {
  return { type: prev?.type || "working", kg: prev?.kg || "", reps: prev?.reps || "", rir: prev?.rir || "" };
}

// ─── Custom exercise form ────────────────────────────────────────────────────
function AddExerciseForm({ onSave, onCancel, refresh }) {
  const [exName, setExName] = useState("");
  const [cat, setCat] = useState("other");
  const [equip, setEquip] = useState("other");
  const [primary, setPrimary] = useState([]);
  const [secondary, setSecondary] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleMuscle = (key, list, setList) => {
    setList(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  async function save() {
    if (!exName.trim()) return;
    setSaving(true);
    try {
      const res = await api("exercises/custom", { name: exName.trim(), category: cat, equipment: equip, primaryMuscles: primary, secondaryMuscles: secondary, notes });
      refresh();
      onSave(res.exercise?.name || exName.trim().toLowerCase());
    } finally { setSaving(false); }
  }

  const selectSt = { ...input, fontSize: 13, padding: "8px 12px", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234d6080'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...label, color: T.green }}>New exercise</div>

      <div>
        <div style={{ ...label, marginBottom: 5 }}>Name *</div>
        <input value={exName} onChange={e => setExName(e.target.value)} placeholder="e.g. cable crunch" style={{ ...input, width: "100%", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ ...label, marginBottom: 5 }}>Category</div>
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...selectSt, width: "100%" }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 5 }}>Equipment</div>
          <select value={equip} onChange={e => setEquip(e.target.value)} style={{ ...selectSt, width: "100%" }}>
            {EQUIPMENT_TYPES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 7 }}>Primary muscles</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MUSCLES.map(m => (
            <button key={m.key} onClick={() => toggleMuscle(m.key, primary, setPrimary)}
              style={{ ...pill(primary.includes(m.key)), fontSize: 11, padding: "4px 10px", borderColor: primary.includes(m.key) ? T.green : T.line }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 7 }}>Secondary muscles</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MUSCLES.map(m => (
            <button key={m.key} onClick={() => toggleMuscle(m.key, secondary, setSecondary)}
              style={{ ...pill(secondary.includes(m.key)), fontSize: 11, padding: "4px 10px", borderColor: secondary.includes(m.key) ? T.mid : T.line, color: secondary.includes(m.key) ? T.mid : T.dim }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 5 }}>Notes (optional)</div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="form cues, links…" style={{ ...input, width: "100%", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={!exName.trim() || saving}
          style={{ ...pill(true), flex: 1, opacity: !exName.trim() || saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Add exercise"}
        </button>
        <button onClick={onCancel} style={{ ...pill(false) }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Exercise search overlay ─────────────────────────────────────────────────
function ExercisePicker({ customExercises, onPick, onCreateNew, onClose }) {
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const allExercises = [...BUILTIN_EXERCISES, ...(customExercises || [])];
  const filtered = allExercises.filter(e => {
    const matchQ = !q || e.name.includes(q.toLowerCase());
    const matchCat = catFilter === "all" || e.category === catFilter;
    return matchQ && matchCat;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 200, display: "flex", flexDirection: "column", padding: "24px clamp(14px,4vw,44px)" }}>
      <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", maxWidth: 600, width: "100%", margin: "0 auto", maxHeight: "90dvh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search exercises…"
            style={{ ...input, flex: 1, borderRadius: 999, padding: "9px 14px" }} />
          <button onClick={onClose} style={{ color: T.dim, background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
          {["all", ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{ ...pill(catFilter === c), fontSize: 10, padding: "3px 9px" }}>
              {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.slice(0, 80).map(ex => (
            <button key={ex.name} onClick={() => onPick(ex.name)}
              style={{ textAlign: "left", background: "transparent", border: "none", borderBottom: `1px solid ${T.line}`, padding: "10px 4px", cursor: "pointer", borderRadius: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, color: T.fg, textTransform: "capitalize" }}>{ex.name}</span>
                {ex.custom && <span style={{ fontSize: 9, color: T.green, border: `1px solid ${T.green}44`, borderRadius: 4, padding: "1px 5px" }}>Custom</span>}
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                {ex.category} · {ex.equipment}
                {ex.primaryMuscles?.length > 0 && ` · ${ex.primaryMuscles.join(", ")}`}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ ...serif, color: T.dim, fontSize: 13, padding: "20px 0" }}>No exercises match — create a new one below.</div>}
        </div>

        <button onClick={onCreateNew}
          style={{ ...pill(false), marginTop: 12, textAlign: "center", borderColor: T.green, color: T.green }}>
          + Create new exercise
        </button>
      </div>
    </div>
  );
}

// ─── Strength scoring ────────────────────────────────────────────────────────

function frontE1RM(kg, reps, rir = 0) {
  if (!kg || !reps) return kg || 0;
  const r = reps + (rir || 0);
  if (r >= 6) return kg / (1.0278 - 0.0278 * r);
  return kg * (1 + r / 30);
}

// 1RM thresholds in kg for an 80 kg male: [beginner, novice, intermediate, advanced, elite]
const STRENGTH_STD = {
  "barbell bench press":         [48, 68,  92, 118, 148],
  "incline barbell bench press": [39, 55,  75,  96, 120],
  "decline barbell bench press": [51, 72,  97, 124, 155],
  "dumbbell bench press":        [38, 54,  73,  94, 118],
  "incline dumbbell press":      [31, 45,  61,  78,  98],
  "dips":                        [ 0, 13,  28,  45,  65],
  "push-up":                     [ 0,  8,  18,  30,  45],
  "cable fly":                   [20, 31,  44,  57,  72],
  "pec deck":                    [37, 54,  74,  94, 118],
  "barbell overhead press":      [29, 41,  56,  73,  92],
  "dumbbell shoulder press":     [21, 31,  43,  56,  70],
  "seated dumbbell press":       [21, 31,  43,  56,  70],
  "lateral raise":               [ 6,  9,  13,  18,  24],
  "back squat":                  [55, 78, 104, 133, 165],
  "front squat":                 [42, 60,  80, 102, 127],
  "hack squat":                  [55, 78, 104, 133, 165],
  "leg press":                   [82,116, 153, 192, 232],
  "leg extension":               [30, 43,  57,  72,  88],
  "leg curl":                    [25, 37,  50,  64,  79],
  "seated leg curl":             [25, 37,  50,  64,  79],
  "hip thrust":                  [60, 88, 119, 151, 184],
  "bulgarian split squat":       [22, 35,  49,  64,  80],
  "deadlift":                    [73,103, 136, 172, 210],
  "romanian deadlift":           [55, 79, 105, 132, 162],
  "sumo deadlift":               [75,107, 141, 178, 217],
  "barbell row":                 [42, 60,  80, 103, 127],
  "dumbbell row":                [29, 42,  57,  73,  90],
  "t-bar row":                   [44, 63,  85, 108, 133],
  "seated cable row":            [44, 63,  84, 107, 130],
  "pull-up":                     [ 0,  9,  22,  38,  57],
  "chin-up":                     [ 0, 11,  25,  42,  63],
  "lat pulldown":                [41, 58,  77,  98, 121],
  "barbell curl":                [19, 29,  41,  53,  67],
  "dumbbell curl":               [10, 15,  22,  29,  37],
  "skull crusher":               [22, 33,  46,  59,  74],
  "close-grip bench press":      [43, 61,  82, 105, 131],
  "tricep pushdown":             [23, 35,  48,  62,  77],
  "overhead tricep extension":   [18, 27,  38,  50,  63],
  "face pull":                   [18, 27,  38,  50,  63],
  "calf raise":                  [55, 80, 108, 138, 170],
};

const LEVEL_LABELS = ["Untrained", "Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const LEVEL_COLORS = [T.dim, "#6ab4e0", "#8a9ab8", T.green, "#fca311", "#ff8c42"];

function getStrengthLevel(exerciseName, est1RM, bwKg = 80) {
  if (!est1RM || est1RM <= 0) return null;
  const std = STRENGTH_STD[(exerciseName || "").toLowerCase().trim()];
  if (!std) return null;
  const scale = Math.pow(Math.max(bwKg || 80, 40) / 80, 0.67);
  const t = std.map(v => v * scale);
  let level = 0;
  for (let i = 0; i < t.length; i++) { if (est1RM >= t[i]) level = i + 1; }
  let pct;
  if (level === 0) pct = t[0] > 0 ? Math.min(est1RM / t[0], 1) * 20 : 20;
  else if (level >= 5) pct = 100;
  else pct = level * 20 + ((est1RM - t[level - 1]) / Math.max(t[level] - t[level - 1], 1)) * 20;
  return {
    level, label: LEVEL_LABELS[level], color: LEVEL_COLORS[level],
    pct: Math.min(Math.max(Math.round(pct), 0), 100),
    nextLabel: level < 5 ? LEVEL_LABELS[level + 1] : null,
    nextAt: level < 5 ? t[level] : null,
  };
}

const STRENGTH_RATIOS = [
  { a: "barbell bench press", b: "barbell overhead press", expected: 1.6,  label: "Bench / OHP" },
  { a: "barbell bench press", b: "barbell row",            expected: 1.0,  label: "Push / Pull" },
  { a: "back squat",          b: "deadlift",               expected: 0.84, label: "Squat / DL"  },
  { a: "back squat",          b: "barbell bench press",    expected: 1.25, label: "Squat / Bench" },
];

// ─── Pre-session AI planner ───────────────────────────────────────────────────

const MUSCLE_TO_FOCUS = {
  chest:"chest", lats:"back", rhomboids:"back", rearDelts:"back", traps:"back",
  frontDelts:"shoulders", sideDelts:"shoulders",
  biceps:"arms", triceps:"arms", forearms:"arms",
  quads:"legs", hamstrings:"legs", calves:"legs", adductors:"legs",
  glutes:"glutes", hipFlexors:"glutes",
  core:"core", lowerBack:"core",
};
const ALL_FOCUS = ["chest","back","shoulders","arms","legs","glutes","core"];

function PlanningScreen({ s, onStart, onSkip }) {
  // ── Auto-derive intensity from recovery score ──────────────────────────
  const rec = s.recovery ?? null;
  const autoIntensity = rec == null ? "moderate"
    : rec >= 80 ? "max"
    : rec >= 65 ? "hard"
    : rec >= 45 ? "moderate"
    : "easy";
  const intensityReason = rec == null ? "no recovery data"
    : `recovery ${rec}%`;

  // ── Auto-derive goal from recent rep ranges ────────────────────────────
  const recentSets = (s.lifts || []).slice(-40).filter(l => l.reps);
  const avgReps = recentSets.length > 0
    ? recentSets.reduce((a, l) => a + (+l.reps || 0), 0) / recentSets.length : 10;
  const autoGoal = avgReps < 6 ? "strength" : avgReps > 12 ? "endurance" : "hypertrophy";
  const goalReason = recentSets.length > 0 ? `avg ${Math.round(avgReps)} reps recently` : "default";

  // ── Auto-derive focus: muscles not trained in last 48h ─────────────────
  const now = Date.now();
  const lastTrained = {};
  for (const l of (s.lifts || []).slice(-300)) {
    const muscles = MUSCLE_MAP[(l.exercise || "").toLowerCase()] || {};
    for (const m of Object.keys(muscles)) {
      const focus = MUSCLE_TO_FOCUS[m];
      if (!focus) continue;
      const ms = new Date(l.date).getTime();
      if (!lastTrained[focus] || ms > lastTrained[focus]) lastTrained[focus] = ms;
    }
  }
  const autoFocus = ALL_FOCUS.filter(f => {
    const last = lastTrained[f];
    return !last || (now - last) / 3600000 >= 48;
  });
  const focusMuscles = autoFocus.length > 0 ? autoFocus : ALL_FOCUS.slice(0, 3);

  // ── 3-component fatigue model (personalised via calibration) ─────────────
  const calibration = useMemo(() => calibrateRecovery(s.lifts), [s.lifts]);
  const { focusFatigue, cnsScore } = computeFatigueState(s.lifts, now, calibration);

  // Default RIR by goal: hypertrophy trains close to failure, strength preserves quality
  const goalDefaultRIR = autoGoal === "hypertrophy" ? 0 : autoGoal === "strength" ? 1 : 2;
  const baseRIR = calibration?.optimalRIR ?? goalDefaultRIR;
  function fatigueToRIR(fatigue) {
    const floor = Math.round(baseRIR + fatigue * 2);
    return Math.max(1, Math.min(5, floor));
  }
  const muscleRIR = {};
  for (const f of ALL_FOCUS) muscleRIR[f] = fatigueToRIR(focusFatigue[f]);
  const cnsOffset = cnsScore > 0.8 ? 3 : cnsScore > 0.6 ? 2 : cnsScore > 0.3 ? 1 : 0;

  const [long, setLong] = useState(false);
  const durationMin = long ? 75 : 45;
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function generate(dur) {
    setLoading(true); setErr(null); setPlan(null);
    try {
      const p = await api("workout/plan", {
        focusMuscles, durationMin: dur ?? durationMin,
        intensity: autoIntensity, goal: autoGoal, notes,
        muscleFatigue: focusFatigue, muscleRIR, cnsOffset, cnsScore,
      });
      if (p.error) setErr(p.error);
      else setPlan(p);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  }

  useEffect(() => { generate(durationMin); }, []);

  const chip = (txt, sub) => (
    <div style={{ ...card, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.fg, textTransform: "capitalize" }}>{txt}</div>
      <div style={{ fontSize: 10, color: T.dim }}>{sub}</div>
    </div>
  );

  if (plan) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, background: "rgba(252,163,17,.07)", border: `1px solid ${T.green}55`, padding: "14px 18px" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.green, marginBottom: 4 }}>{plan.title}</div>
        <div style={{ fontSize: 12, color: T.mid }}>{plan.rationale}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chip(autoIntensity, intensityReason)}
        {chip(autoGoal, goalReason)}
        {chip(`${durationMin} min`, long ? "long session" : "short session")}
      </div>
      {plan.warmup && (
        <div style={{ ...card, padding: "10px 16px" }}>
          <div style={{ ...label, marginBottom: 3 }}>Warmup</div>
          <div style={{ fontSize: 12, color: T.mid }}>{plan.warmup}</div>
        </div>
      )}
      <div style={{ ...card }}>
        <div style={{ ...label, marginBottom: 10 }}>Exercises</div>
        {(plan.exercises || []).map((ex, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${T.line}`, paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: T.fg, textTransform: "capitalize", flex: 1 }}>{ex.name}</span>
              {ex.isNew && <span style={{ fontSize: 9, color: T.green, border: `1px solid ${T.green}44`, borderRadius: 4, padding: "1px 5px" }}>NEW</span>}
            </div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>
              {ex.sets} sets × {ex.reps} reps{ex.rpe ? ` @ RPE ${ex.rpe}` : ""}
              {ex.notes ? <span style={{ marginLeft: 8, color: T.mid, fontStyle: "italic" }}>{ex.notes}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {plan.cooldown && (
        <div style={{ ...card, padding: "10px 16px" }}>
          <div style={{ ...label, marginBottom: 3 }}>Cooldown</div>
          <div style={{ fontSize: 12, color: T.mid }}>{plan.cooldown}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={{ ...pill(false), fontSize: 12, whiteSpace: "nowrap" }}
          onClick={() => { const nl = !long; setLong(nl); generate(nl ? 75 : 45); }}>
          Switch to {long ? "short" : "long"}
        </button>
        <button onClick={() => generate()} style={{ ...pill(false), fontSize: 12 }}>Regenerate</button>
        <button onClick={() => onStart(plan)} style={{ ...pill(true), flex: 1, padding: "13px", fontSize: 14, fontWeight: 600 }}>Start</button>
      </div>
      <button onClick={onSkip} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: "4px" }}>Skip — start empty</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {chip(autoIntensity, intensityReason)}
        {chip(autoGoal, goalReason)}
        {chip(focusMuscles.slice(0, 3).join(", ") + (focusMuscles.length > 3 ? "…" : ""), "unworked muscles")}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setLong(false)} style={{ ...pill(!long), flex: 1 }}>Short · 45 min</button>
        <button onClick={() => setLong(true)} style={{ ...pill(long), flex: 1 }}>Long · 75 min</button>
      </div>
      <button onClick={() => setShowNotes(v => !v)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, textAlign: "left", padding: 0 }}>
        {showNotes ? "▾" : "▸"} Add notes / special requests
      </button>
      {showNotes && (
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="injuries, preferences, skip an exercise…"
          style={{ ...input, width: "100%", minHeight: 58, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
      )}
      {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
      {loading
        ? <div style={{ ...serif, color: T.dim, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Building your session…</div>
        : <button onClick={() => generate()} style={{ ...pill(true), padding: "13px", fontSize: 14, fontWeight: 600 }}>Generate</button>
      }
      <button onClick={onSkip} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: "4px" }}>Skip — start empty</button>
    </div>
  );
}

// ─── Post-session review ──────────────────────────────────────────────────────

function ReviewScreen({ comparison, wName, s, onDone }) {
  const [feel, setFeel] = useState(null);
  const [newRatings, setNewRatings] = useState({});
  const bwKg = Object.values(s.weight || {}).at(-1) || 75;

  const e1RMs = {};
  (comparison.exercises || []).forEach(ex => { if (ex.curr1RM) e1RMs[ex.name] = ex.curr1RM; });
  const ratioRows = STRENGTH_RATIOS
    .filter(r => e1RMs[r.a] && e1RMs[r.b])
    .map(r => { const actual = e1RMs[r.a] / e1RMs[r.b]; return { ...r, actual, diff: ((actual - r.expected) / r.expected) * 100 }; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...card, textAlign: "center", padding: "18px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.green, marginBottom: 4 }}>Session complete!</div>
        <div style={{ fontSize: 13, color: T.mid }}>{wName} · {comparison.durationMin} min · {Math.round((comparison.totalVol || 0) / 1000 * 10) / 10}t volume</div>
      </div>

      {comparison.prs?.length > 0 && (
        <div style={{ ...card, background: "rgba(252,163,17,.08)", border: `1px solid ${T.green}55`, padding: "14px 18px" }}>
          <div style={{ ...label, color: T.green, marginBottom: 8 }}>Personal Records</div>
          {comparison.prs.map((pr, i) => <div key={i} style={{ fontSize: 13, color: T.fg, marginBottom: 3 }}>{pr}</div>)}
        </div>
      )}

      <div style={{ ...card }}>
        <div style={{ ...label, marginBottom: 10 }}>Exercise Performance</div>
        {(comparison.exercises || []).filter(ex => ex.curr1RM).map((ex, i) => {
          const lvl = getStrengthLevel(ex.name, ex.curr1RM, bwKg);
          const delta = ex.prev1RM && ex.curr1RM ? ex.curr1RM - ex.prev1RM : null;
          return (
            <div key={i} style={{ borderBottom: `1px solid ${T.line}`, paddingBottom: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 14, color: T.fg, textTransform: "capitalize", flex: 1 }}>{ex.name}</span>
                {lvl && <span style={{ fontSize: 9, background: lvl.color + "22", color: lvl.color, border: `1px solid ${lvl.color}44`, borderRadius: 4, padding: "2px 6px" }}>{lvl.label}</span>}
              </div>
              <div style={{ fontSize: 12, color: T.mid, marginBottom: lvl ? 6 : 0 }}>
                Est 1RM: <span style={{ color: T.fg, fontWeight: 600 }}>{Math.round(ex.curr1RM)} kg</span>
                {delta !== null && (
                  <span style={{ marginLeft: 10, color: delta > 0.5 ? T.green : delta < -0.5 ? T.red : T.mid }}>
                    {delta > 0.5 ? "up" : delta < -0.5 ? "down" : "="} {Math.abs(Math.round(delta))} kg vs prev
                  </span>
                )}
                {!ex.prev1RM && <span style={{ marginLeft: 10, color: T.green }}>First session!</span>}
              </div>
              {lvl && (
                <>
                  <div style={{ height: 4, background: T.line, borderRadius: 2, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ height: "100%", width: lvl.pct + "%", background: lvl.color, borderRadius: 2, transition: "width .6s ease" }} />
                  </div>
                  {lvl.nextLabel && <div style={{ fontSize: 10, color: T.dim }}>{lvl.nextLabel} at {Math.round(lvl.nextAt)} kg est 1RM</div>}
                </>
              )}
              {ex.isNew && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: T.mid, marginBottom: 5 }}>Rate this exercise:</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["1","2","3","4","5"].map((v) => (
                      <button key={v} onClick={() => setNewRatings(r => ({ ...r, [ex.name]: +v }))}
                        style={{ fontSize: 13, background: newRatings[ex.name] === +v ? "rgba(252,163,17,.2)" : "transparent", border: `1px solid ${newRatings[ex.name] === +v ? T.green : T.line}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: newRatings[ex.name] === +v ? T.green : T.mid }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ratioRows.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ ...label, marginBottom: 10 }}>Strength Balance</div>
          {ratioRows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: T.mid, flex: 1 }}>{r.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: Math.abs(r.diff) < 10 ? T.green : T.amber }}>{r.actual.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: T.dim }}>target {r.expected.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: Math.abs(r.diff) < 10 ? T.green : T.red }}>{r.diff > 0 ? "+" : ""}{Math.round(r.diff)}%</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card }}>
        <div style={{ ...label, marginBottom: 8 }}>How did the session feel?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["1","Rough"],["2","Hard"],["3","Good"],["4","Great"],["5","Amazing"]].map(([v,lbl]) => (
            <button key={v} onClick={() => setFeel(+v)} style={{ ...pill(feel === +v), fontSize: 12 }}>{lbl}</button>
          ))}
        </div>
      </div>

      <button onClick={() => onDone(feel, newRatings)}
        style={{ ...pill(true), padding: "13px", fontSize: 14, fontWeight: 600 }}>
        Done
      </button>
    </div>
  );
}

// ─── Active workout logger ────────────────────────────────────────────────────
function LogWorkout({ s, refresh }) {
  const [phase, setPhase] = useState("idle"); // idle | planning | active | review
  const [wName, setWName] = useState("My Workout");
  const [startTs, setStartTs] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [finishMsg, setFinishMsg] = useState(null);
  const [aiPlan, setAiPlan] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [showPlanRef, setShowPlanRef] = useState(false);

  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, startTs]);

  function fmtElapsed(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), sc = sec % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}` : `${m}:${String(sc).padStart(2,"0")}`;
  }

  function startFresh() { setStartTs(Date.now()); setExercises([]); setWName("My Workout"); setAiPlan(null); setPhase("active"); }

  function startTemplate(tpl) {
    setStartTs(Date.now()); setWName(tpl.name); setAiPlan(null);
    setExercises(tpl.exercises.map(e => ({ name: e.name, sets: Array.from({ length: e.sets }, () => mkSet()) })));
    setPhase("active");
  }

  function startWithPlan(plan) {
    setStartTs(Date.now()); setWName(plan.title || "My Workout"); setAiPlan(plan);
    setExercises((plan.exercises || []).map(ex => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets || 3 }, () => mkSet()),
      planNote: ex.notes || null, planReps: ex.reps || null, planRpe: ex.rpe || null,
    })));
    setPhase("active");
  }

  function addExercise(name) { setExercises(prev => [...prev, { name, sets: [mkSet()] }]); setShowPicker(false); }
  function removeExercise(i) { setExercises(prev => prev.filter((_, idx) => idx !== i)); }
  function addSet(i) { setExercises(prev => { const n=[...prev]; const ex={...n[i]}; ex.sets=[...ex.sets, mkSet(ex.sets.at(-1))]; n[i]=ex; return n; }); }
  function removeSet(ei, si) {
    setExercises(prev => {
      const n=[...prev]; const ex={...n[ei]}; ex.sets=ex.sets.filter((_,ii) => ii!==si);
      if (ex.sets.length===0) return n.filter((_,ii) => ii!==ei);
      n[ei]=ex; return n;
    });
  }
  function updSet(ei, si, field, val) {
    setExercises(prev => {
      const n=[...prev]; const ex={...n[ei]}; const sets=[...ex.sets];
      sets[si]={...sets[si],[field]:val}; ex.sets=sets; n[ei]=ex; return n;
    });
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    try {
      const endTs = Date.now();
      const durationMin = Math.round((endTs - startTs) / 60000);
      const liftHistory = s.lifts || [];
      const bwKg = Object.values(s.weight || {}).at(-1) || 75;
      const prs = [];
      const compExercises = exercises.map(ex => {
        const wSets = ex.sets.filter(st => st.type !== "warmup" && st.kg !== "" && st.reps !== "");
        const curr1RM = wSets.length > 0 ? Math.max(...wSets.map(st => frontE1RM(+st.kg||0,+st.reps||0,+st.rir||0))) : 0;
        const prevSets = liftHistory.filter(l => l.exercise?.toLowerCase() === ex.name.toLowerCase());
        const prev1RM = prevSets.length > 0 ? Math.max(...prevSets.map(l => frontE1RM(+l.kg||0,+l.reps||0,+l.rir||0))) : 0;
        if (curr1RM > 0 && prev1RM > 0 && curr1RM > prev1RM + 0.5)
          prs.push(`${ex.name}: ${Math.round(curr1RM)} kg est 1RM (prev ${Math.round(prev1RM)} kg)`);
        return { name: ex.name, curr1RM: curr1RM || null, prev1RM: prev1RM || null, isNew: prevSets.length === 0 && wSets.length > 0 };
      });
      const totalVol = exercises.reduce((acc, ex) => acc + ex.sets.filter(st => st.type !== "warmup").reduce((a, st) => a + (parseFloat(st.kg)||0)*(parseInt(st.reps)||0), 0), 0);
      await api("workouts/log", { name: wName, startTime: new Date(startTs).toISOString(), endTime: new Date(endTs).toISOString(), exercises });
      setSaving(false);
      setComparison({ exercises: compExercises, prs, durationMin, totalVol });
      setPhase("review");
    } catch(e) { setSaving(false); }
  }

  async function saveTemplate() {
    if (!tplName.trim()) return;
    setTplSaving(true);
    await api("templates", { name: tplName.trim(), exercises: exercises.map(e => ({ name: e.name, sets: e.sets.filter(st => st.type !== "warmup").length || e.sets.length })) });
    setTplSaving(false); setShowTemplateSave(false); setTplName(""); refresh();
  }

  async function deleteTemplate(id) { await api(`templates/${id}`, {}, "DELETE"); refresh(); }

  const templates = s.workoutTemplates || [];
  const customExercises = s.exerciseLibrary || [];
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.filter(st => st.type !== "warmup" && (st.kg !== "" || st.reps !== "")).length, 0);
  const totalVol = exercises.reduce((acc, ex) => acc + ex.sets.filter(st => st.type !== "warmup").reduce((a, st) => a + (parseFloat(st.kg)||0)*(parseInt(st.reps)||0), 0), 0);

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === "idle") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {finishMsg && <div style={{ ...card, background: "rgba(252,163,17,.1)", border: `1px solid ${T.green}44`, color: T.green, fontSize: 14, textAlign: "center" }}>{finishMsg}</div>}

      <button onClick={() => setPhase("planning")}
        style={{ ...card, background: `linear-gradient(135deg, rgba(252,163,17,.18), ${T.panel} 70%)`, border: `1px solid ${T.green}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
        <div style={{ width: 42, height: 42, borderRadius: 999, background: "rgba(252,163,17,.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: T.green, flexShrink: 0 }}>AI</div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.green }}>Plan & Start workout</div>
          <div style={{ fontSize: 12, color: T.mid, marginTop: 2 }}>AI creates a personalised session based on your history</div>
        </div>
      </button>

      <button onClick={startFresh}
        style={{ ...card, background: "transparent", border: `1px dashed ${T.line}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
        <div style={{ width: 38, height: 38, borderRadius: 999, background: T.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>+</div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 14, color: T.fg }}>Start empty workout</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>Add exercises as you go</div>
        </div>
      </button>

      {templates.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ ...label, marginBottom: 12 }}>Templates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#080e1c", borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: T.fg, fontWeight: 500 }}>{tpl.name}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{tpl.exercises.map(e => e.name).slice(0, 4).join(" · ")}{tpl.exercises.length > 4 ? ` +${tpl.exercises.length - 4}` : ""}</div>
                </div>
                <button onClick={() => startTemplate(tpl)} style={{ ...pill(true), fontSize: 11, padding: "5px 12px" }}>Start</button>
                <button onClick={() => deleteTemplate(tpl.id)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14, padding: "4px 6px" }}>x</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── PLANNING ──────────────────────────────────────────────────────────────
  if (phase === "planning") return <PlanningScreen s={s} onStart={startWithPlan} onSkip={startFresh} />;

  // ── REVIEW ────────────────────────────────────────────────────────────────
  if (phase === "review" && comparison) return (
    <ReviewScreen comparison={comparison} wName={wName} s={s}
      onDone={(feel, ratings) => {
        const msg = comparison.prs?.length > 0
          ? `${comparison.prs.length} PR${comparison.prs.length > 1 ? "s" : ""}! Great session.`
          : "Workout saved!";
        setPhase("idle"); setFinishMsg(msg); setComparison(null); refresh();
      }} />
  );

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  const bwKg = Object.values(s.weight || {}).at(-1) || 75;
  const liftHistory = s.lifts || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input value={wName} onChange={e => setWName(e.target.value)}
          style={{ ...input, flex: 1, minWidth: 140, padding: "6px 12px", fontSize: 15, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: T.fg }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: T.green, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtElapsed(elapsed)}</div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {aiPlan && <button onClick={() => setShowPlanRef(p => !p)} style={{ ...pill(showPlanRef), fontSize: 11 }}>AI Plan</button>}
          {!showTemplateSave && <button onClick={() => setShowTemplateSave(true)} style={{ ...pill(false), fontSize: 11 }}>Save template</button>}
          <button onClick={finish} disabled={saving} style={{ ...pill(true), fontSize: 12, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving..." : `Finish (${totalSets} sets)`}
          </button>
        </div>
      </div>

      {/* AI plan reference */}
      {aiPlan && showPlanRef && (
        <div style={{ ...card, background: "rgba(252,163,17,.05)", border: `1px solid ${T.green}44`, padding: "12px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.green, marginBottom: 6 }}>{aiPlan.title}</div>
          {(aiPlan.exercises || []).map((ex, i) => (
            <div key={i} style={{ fontSize: 12, color: T.mid, marginBottom: 3 }}>
              <span style={{ color: T.fg, textTransform: "capitalize" }}>{ex.name}</span>
              {" "}- {ex.sets}x{ex.reps}{ex.rpe ? ` @RPE${ex.rpe}` : ""}{ex.notes ? ` · ${ex.notes}` : ""}
            </div>
          ))}
        </div>
      )}

      {/* Save as template */}
      {showTemplateSave && (
        <div style={{ ...card, padding: "12px 16px", display: "flex", gap: 8, alignItems: "center" }}>
          <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name..."
            onKeyDown={e => e.key === "Enter" && saveTemplate()}
            style={{ ...input, flex: 1, padding: "7px 12px", fontSize: 13 }} />
          <button onClick={saveTemplate} disabled={!tplName.trim() || tplSaving}
            style={{ ...pill(true), fontSize: 11, opacity: !tplName.trim() ? 0.5 : 1 }}>
            {tplSaving ? "..." : "Save"}
          </button>
          <button onClick={() => setShowTemplateSave(false)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14, padding: "4px" }}>x</button>
        </div>
      )}

      {/* Volume summary */}
      {totalVol > 0 && (
        <div style={{ fontSize: 12, color: T.mid, textAlign: "right" }}>
          <span style={{ color: T.green, fontWeight: 600 }}>{totalSets}</span> working sets · <span style={{ color: T.green, fontWeight: 600 }}>{Math.round(totalVol / 1000 * 10) / 10}t</span> total volume
        </div>
      )}

      {/* Exercise cards */}
      {exercises.map((ex, ei) => {
        let workingCount = 0;
        const prevHistory = liftHistory.filter(l => l.exercise?.toLowerCase() === ex.name.toLowerCase());
        const prevBest = prevHistory.length > 0
          ? prevHistory.reduce((best, l) => frontE1RM(+l.kg||0,+l.reps||0,+l.rir||0) > frontE1RM(+best.kg||0,+best.reps||0,+best.rir||0) ? l : best, prevHistory[0])
          : null;
        const currWS = ex.sets.filter(st => st.type !== "warmup" && st.kg !== "" && st.reps !== "");
        const curr1RM = currWS.length > 0 ? Math.max(...currWS.map(st => frontE1RM(+st.kg||0,+st.reps||0,+st.rir||0))) : 0;
        const lvl = curr1RM > 0 ? getStrengthLevel(ex.name, curr1RM, bwKg) : null;

        return (
          <div key={ei} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.fg, textTransform: "capitalize" }}>{ex.name}</div>
              {lvl && <span style={{ fontSize: 9, background: lvl.color + "22", color: lvl.color, border: `1px solid ${lvl.color}44`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{lvl.label}</span>}
              <button onClick={() => removeExercise(ei)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 13, padding: "2px 6px" }}>Remove</button>
            </div>

            {(prevBest || ex.planReps) && (
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {prevBest && <span>Prev best: <span style={{ color: T.mid }}>{prevBest.kg}kg x{prevBest.reps}</span></span>}
                {ex.planReps && <span style={{ color: T.green }}>Plan: {ex.sets.length}x{ex.planReps}{ex.planRpe ? ` @RPE${ex.planRpe}` : ""}</span>}
                {ex.planNote && <span style={{ fontStyle: "italic" }}>{ex.planNote}</span>}
              </div>
            )}

            {/* Set column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 1fr 64px 24px", gap: 4, marginBottom: 4, paddingLeft: 2 }}>
              {["#","Type","kg","Reps","RIR",""].map((h, i) => <div key={i} style={{ ...label, fontSize: 9, textAlign: i >= 2 ? "center" : "left" }}>{h}</div>)}
            </div>

            {ex.sets.map((set, si) => {
              if (set.type !== "warmup") workingCount++;
              const setNum = set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "failure" ? "F" : workingCount;
              const numColor = set.type === "warmup" ? T.mid : set.type === "drop" ? "#6ab4e0" : set.type === "failure" ? T.red : T.green;
              return (
                <div key={si} style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 1fr 64px 24px", gap: 4, marginBottom: 4, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: numColor, textAlign: "center" }}>{setNum}</div>

                  <div style={{ position: "relative" }}>
                    <select value={set.type} onChange={e => updSet(ei, si, "type", e.target.value)}
                      style={{ ...input, padding: "5px 4px", fontSize: 11, background: "#080e1c", width: "100%", textAlign: "center", cursor: "pointer", appearance: "none" }}>
                      {SET_TYPES.map(t => <option key={t.key} value={t.key}>{t.title}</option>)}
                    </select>
                  </div>

                  <input type="number" min="0" step="0.5" value={set.kg} onChange={e => updSet(ei, si, "kg", e.target.value)}
                    placeholder="-" style={{ ...input, padding: "5px 6px", fontSize: 13, textAlign: "center" }} />
                  <input type="number" min="0" step="1" value={set.reps} onChange={e => updSet(ei, si, "reps", e.target.value)}
                    placeholder="-" style={{ ...input, padding: "5px 6px", fontSize: 13, textAlign: "center" }} />
                  <input type="number" min="0" max="10" step="0.5" value={set.rir} onChange={e => updSet(ei, si, "rir", e.target.value)}
                    placeholder="-" style={{ ...input, padding: "5px 6px", fontSize: 11, textAlign: "center" }} />
                  <button onClick={() => removeSet(ei, si)}
                    style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14, padding: "2px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    x
                  </button>
                </div>
              );
            })}

            <button onClick={() => addSet(ei)}
              style={{ marginTop: 6, fontSize: 12, color: T.mid, background: "transparent", border: `1px dashed ${T.line}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", width: "100%" }}>
              + Add set
            </button>
          </div>
        );
      })}

      {/* Add exercise / finish */}
      <button onClick={() => setShowPicker(true)}
        style={{ ...card, cursor: "pointer", border: `1px dashed ${T.line}`, background: "transparent", fontSize: 14, color: T.mid, padding: "16px", textAlign: "center" }}>
        + Add exercise
      </button>

      <button onClick={() => { if (confirm("Discard this workout?")) { setPhase("idle"); setExercises([]); } }}
        style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, padding: "6px", textDecoration: "underline" }}>
        Discard workout
      </button>

      {/* Overlays */}
      {showPicker && !showAddEx && (
        <ExercisePicker customExercises={customExercises} onPick={addExercise}
          onCreateNew={() => setShowAddEx(true)} onClose={() => setShowPicker(false)} />
      )}
      {showPicker && showAddEx && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 200, display: "flex", flexDirection: "column", padding: "24px clamp(14px,4vw,44px)", overflowY: "auto" }}>
          <div style={{ ...card, maxWidth: 520, width: "100%", margin: "0 auto" }}>
            <AddExerciseForm refresh={refresh}
              onSave={name => { addExercise(name); setShowAddEx(false); setShowPicker(false); }}
              onCancel={() => setShowAddEx(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Train({ go, s, refresh }) {
  const [expandedWorkout, setExpandedWorkout] = useState(null);
  const [trainTab, setTrainTab] = useState("workouts");
  const [hevySyncing, setHevySyncing] = useState(false);
  const [hevySyncMsg, setHevySyncMsg] = useState(null);

  const weights = (s.weights || []).map((w) => w.value);
  const cur = weights.at(-1);

  // Group lifts by exercise (skip zero-weight/bodyweight)
  const byEx = {};
  (s.lifts || []).forEach((l) => {
    if (!l.exercise || (!l.kg && !l.reps)) return;
    (byEx[l.exercise] = byEx[l.exercise] || []).push(l);
  });

  // Group lifts by session key for workout expansion — normalise to ISO so HAE & Hevy keys match
  const liftsByKey = {};
  (s.lifts || []).forEach((l) => {
    if (!l.start && !l.date) return;
    let key;
    try { key = l.start ? new Date(l.start).toISOString() : l.date; } catch(e) { key = l.start || l.date; }
    (liftsByKey[key] = liftsByKey[key] || []).push(l);
  });

  // Workouts sorted newest first
  const sortedWorkouts = [...(s.workouts || [])].sort((a, b) => {
    const ka = a.start || a.date || "";
    const kb = b.start || b.date || "";
    return kb.localeCompare(ka);
  }).slice(0, 50);

  // Per-exercise stimulus data for last 8 sessions
  const [stimExercise, setStimExercise] = useState(null);
  const stimulusData = useMemo(() => {
    const est1RM = s.liftPRs || {};
    const byExKey = {};
    for (const l of (s.lifts || [])) {
      if (!l.exercise || !l.kg || !l.date) continue;
      const sessKey = l.start || l.date;
      if (!byExKey[l.exercise]) byExKey[l.exercise] = {};
      if (!byExKey[l.exercise][sessKey]) byExKey[l.exercise][sessKey] = [];
      byExKey[l.exercise][sessKey].push(l);
    }
    const result = {};
    for (const [ex, sessions] of Object.entries(byExKey)) {
      const erm = est1RM[ex] || 1;
      result[ex] = Object.entries(sessions)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([sessKey, sets]) => {
          const date = sets[0].date;
          const numSets = sets.length;
          const topKg = Math.max(...sets.map(l => l.kg || 0));
          const avgRIR = sets.reduce((acc, l) => acc + (l.rir != null ? l.rir : estRIR(l.kg, l.reps || 1, erm)), 0) / numSets;
          const avgReps = sets.reduce((acc, l) => acc + (l.reps || 1), 0) / numSets;
          const stimulus = volumeResponsePct(numSets) * rirEffectiveness(avgRIR) * lowRepScale(avgReps);
          return { date, topKg, stimulus, numSets, avgRIR: Math.round(avgRIR * 10) / 10 };
        });
    }
    return result;
  }, [s.lifts, s.liftPRs]);

  const stimExercises = Object.keys(stimulusData).sort();
  const activeStimEx = stimExercise || stimExercises[0] || null;
  const activeStimSessions = activeStimEx ? (stimulusData[activeStimEx] || []) : [];
  const maxStimulus = Math.max(0.01, ...activeStimSessions.map(x => x.stimulus));

  // Per-exercise PR progression (top set weight per session, for sparkline)
  const exProgress = useMemo(() => {
    const out = {};
    for (const [ex, sessions] of Object.entries(stimulusData)) {
      out[ex] = sessions.map(s => s.topKg);
    }
    return out;
  }, [stimulusData]);

  return (
    <>
      <Back onClick={() => go("home")} title="Training" />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {[["log", "Log Workout"], ["workouts", "History"], ["strength", "Strength PRs"], ["stimulus", "Stimulus"], ["body", "Weight"]].map(([k, lbl]) => (
          <button key={k} style={pill(trainTab === k)} onClick={() => setTrainTab(k)}>{lbl}</button>
        ))}
      </div>

      {/* ── Log tab ── */}
      {trainTab === "log" && <LogWorkout s={s} refresh={refresh} />}

      {/* ── Workouts tab ── */}
      {trainTab === "workouts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Muscle map CTA */}
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "linear-gradient(150deg, rgba(164,138,224,.08), var(--panel) 70%)" }}>
            <div>
              <div style={{ ...label, color: "var(--violet)" }}>Exercise muscle map</div>
              <div style={{ fontSize: 13, color: T.mid, marginTop: 3 }}>Tell the app exactly which muscles each exercise targets — used for fatigue tracking.</div>
            </div>
            <button style={{ ...pill(true), borderColor: "var(--violet)", color: "var(--violet)", background: "rgba(164,138,224,.1)", padding: "9px 18px", flexShrink: 0 }} onClick={() => go("quiz")}>
              Open editor →
            </button>
          </div>

          {sortedWorkouts.length === 0 && (
            <div style={{ ...card }}>
              <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Workouts appear here once sync is connected. <a href="import" style={{ color: T.dim }}>Import Hevy CSV ↑</a></div>
            </div>
          )}
          {sortedWorkouts.map((w, i) => {
            let wktKey; try { wktKey = w.start ? new Date(w.start).toISOString() : w.date; } catch(e) { wktKey = w.start || w.date; }
            const dayLifts = liftsByKey[wktKey] || [];
            const byExDay = {};
            dayLifts.forEach(l => { if (l.exercise) (byExDay[l.exercise] = byExDay[l.exercise] || []).push(l); });
            const hasLifts = Object.keys(byExDay).length > 0;
            const isOpen = expandedWorkout === i;
            const totalSets = dayLifts.reduce((acc, l) => acc + 1, 0);
            const totalVol = dayLifts.reduce((acc, l) => acc + (l.kg || 0) * (l.reps || 0), 0);

            return (
              <div key={i} style={{ ...card, padding: "14px 18px" }}>
                <div onClick={() => setExpandedWorkout(isOpen ? null : i)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{w.name}</span>
                      {w.source === "hevy" && <span style={{ fontSize: 9, color: T.green, border: "1px solid rgba(61,220,132,.3)", borderRadius: 4, padding: "1px 5px" }}>Hevy</span>}
                    </div>
                    <div style={{ fontSize: 12, color: T.dim, marginTop: 3 }}>
                      {w.date}
                      {w.duration && ` · ${Math.round(w.duration)} min`}
                      {hasLifts && ` · ${Object.keys(byExDay).length} exercises · ${totalSets} sets`}
                      {totalVol > 0 && ` · ${Math.round(totalVol / 1000 * 10) / 10}t vol`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                    {w.kcal && <span style={{ fontSize: 12, color: T.mid }}>{Math.round(w.kcal)} kcal</span>}
                    <span style={{ color: T.dim, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && hasLifts && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                    {Object.entries(byExDay).map(([name, sets]) => {
                      const best = Math.max(...sets.map(x => x.kg || 0));
                      const erm = (s.liftPRs || {})[name] || 1;
                      const numSets = sets.length;
                      const avgReps = sets.reduce((acc, l) => acc + (l.reps || 1), 0) / numSets;
                      const avgRIR = sets.reduce((acc, l) => acc + (l.rir != null ? l.rir : estRIR(l.kg, l.reps || 1, erm)), 0) / numSets;
                      const stim = volumeResponsePct(numSets) * rirEffectiveness(avgRIR) * lowRepScale(avgReps);
                      const stimPct = Math.round(stim * 100);
                      const stimColor = stimPct >= 55 ? T.green : stimPct >= 32 ? T.amber : T.red;
                      // All-time PR for this exercise
                      const sessionsForEx = stimulusData[name] || [];
                      const allTimePR = sessionsForEx.length ? Math.max(...sessionsForEx.map(x => x.topKg)) : 0;
                      const isPR = best > 0 && best >= allTimePR && sessionsForEx.length > 1;
                      return (
                        <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${T.line}` }}>
                          <div>
                            <span style={{ color: T.fg, textTransform: "capitalize" }}>{name}</span>
                            {isPR && <span style={{ marginLeft: 6, fontSize: 9, color: T.amber, border: `1px solid ${T.amber}40`, borderRadius: 4, padding: "1px 4px" }}>PR</span>}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: T.mid }}>{numSets} sets{best > 0 ? ` · ${best} kg` : ""}</span>
                            <span style={{ fontSize: 10, color: stimColor, border: `1px solid ${stimColor}40`, borderRadius: 4, padding: "1px 5px" }}>
                              {stimPct}% stim
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", paddingBottom: 4 }}>
            <a href="import" style={{ fontSize: 12, color: T.dim, textDecoration: "none" }}>↑ Import Hevy CSV</a>
            <button style={{ fontSize: 12, color: hevySyncing ? T.dim : T.green, background: "transparent", border: "none", cursor: hevySyncing ? "default" : "pointer", padding: 0 }}
              disabled={hevySyncing}
              onClick={() => {
                setHevySyncing(true); setHevySyncMsg(null);
                api("hevy/backfill", {}).then(r => { setHevySyncMsg(r.added > 0 ? `+${r.added} sets synced` : "Already up to date"); if (r.added > 0) refresh(); })
                  .catch(() => setHevySyncMsg("Sync failed")).finally(() => setHevySyncing(false));
              }}>
              {hevySyncing ? "Syncing…" : "↻ Sync Hevy"}
            </button>
            {hevySyncMsg && <span style={{ fontSize: 11, color: T.mid }}>{hevySyncMsg}</span>}
          </div>
        </div>
      )}

      {/* ── Strength PRs tab ── */}
      {trainTab === "strength" && (
        <div style={{ ...card }}>
          <div style={{ ...label, marginBottom: 14 }}>Strength progress · top set per session</div>
          {(() => {
            const twoMonthsAgo = new Date(Date.now() - 61 * 864e5).toISOString().slice(0, 10);
            const entries = Object.entries(byEx).filter(([, sets]) => {
              const hasWeight = sets.some(l => (l.kg || 0) > 0);
              const recentlyDone = sets.some(l => (l.date || "") >= twoMonthsAgo);
              return hasWeight && recentlyDone;
            });
            if (entries.length === 0) return (
              <div style={{ ...serif, color: T.dim, fontSize: 14 }}>No weighted exercises in the last 2 months. Import a Hevy CSV to get started.</div>
            );
            return entries.map(([name, sets]) => {
              const sessMap = {};
              sets.forEach(l => { const k = l.start || l.date; (sessMap[k] = sessMap[k] || []).push(l); });
              const sessKeys = Object.keys(sessMap).sort();
              const numSessions = sessKeys.length;
              const tops = sessKeys.map(k => Math.max(...sessMap[k].map(l => l.kg || 0)));
              const firstTopKg = tops[0] || 0;
              const lastTopKg = tops.at(-1) || 0;
              const best = Math.max(...tops);
              const lastSet = sessMap[sessKeys.at(-1)].reduce((a, b) => (b.kg || 0) >= (a.kg || 0) ? b : a);
              const progress = Math.round((lastTopKg - firstTopKg) * 10) / 10;
              const maxTop = best || 1;
              return (
                <div key={name} style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}>{name}</span>
                    <span style={{ fontSize: 12, color: T.mid }}>
                      {`${lastTopKg} kg × ${lastSet.reps || "?"}`}
                      {progress > 0 && numSessions > 1 && <span style={{ color: T.green }}> ▲{progress} kg</span>}
                      {progress < 0 && numSessions > 1 && <span style={{ color: T.red }}> ▼{Math.abs(progress)} kg</span>}
                    </span>
                  </div>
                  {tops.length > 1 && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28, marginBottom: 4 }}>
                      {tops.map((kg, i) => {
                        const pct = kg / maxTop;
                        const isLast = i === tops.length - 1;
                        return <div key={i} style={{ flex: 1, height: `${Math.max(15, pct * 100)}%`, background: isLast ? T.green : `${T.green}44`, borderRadius: "2px 2px 0 0" }} />;
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.dim }}>
                    {numSessions} session{numSessions !== 1 ? "s" : ""} · best {best} kg · est 1RM {Math.round(estOneRM(best, lastSet.reps || 1))} kg
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ── Stimulus tab ── */}
      {trainTab === "stimulus" && stimExercises.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ ...label, marginBottom: 10 }}>Effective stimulus · last 8 sessions</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {stimExercises.map(ex => (
              <button key={ex} style={pill(activeStimEx === ex)} onClick={() => setStimExercise(ex)}>
                {ex.length > 28 ? ex.slice(0, 26) + "…" : ex}
              </button>
            ))}
          </div>
          {activeStimSessions.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100, marginBottom: 6 }}>
                {activeStimSessions.map((sess, i) => {
                  const pct = sess.stimulus / maxStimulus;
                  const color = pct >= 0.75 ? T.green : pct >= 0.45 ? T.amber : T.red;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div title={`Stimulus: ${(sess.stimulus * 100).toFixed(0)}%\n${sess.numSets} sets · ~RIR ${sess.avgRIR}\nTop: ${sess.topKg} kg`}
                        style={{ width: "100%", height: Math.max(3, pct * 80) + "px", borderRadius: 4, background: color, transition: "height .4s" }} />
                      <div style={{ fontSize: 9, color: T.dim, marginTop: 4, textAlign: "center", lineHeight: 1.3 }}>
                        {sess.date.slice(5)}<br />{sess.numSets}s·{sess.topKg}kg
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: T.dim }}>
                <span><span style={{ color: T.green }}>■</span> High</span>
                <span><span style={{ color: T.amber }}>■</span> Moderate</span>
                <span><span style={{ color: T.red }}>■</span> Low</span>
              </div>
              <div style={{ fontSize: 10, color: T.dim, marginTop: 8 }}>Ogasawara 2017 volume response · Niv Zinder RIR model.</div>
            </>
          ) : (
            <div style={{ ...serif, color: T.dim, fontSize: 14 }}>No lift data for this exercise.</div>
          )}
        </div>
      )}
      {trainTab === "stimulus" && stimExercises.length === 0 && (
        <div style={card}><div style={{ ...serif, color: T.dim, fontSize: 14 }}>No lift data yet.</div></div>
      )}

      {/* ── Weight tab ── */}
      {trainTab === "body" && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 600 }}>{dash(cur)} <span style={{ fontSize: 15, color: T.mid }}>kg</span></div>
            {weights.length > 1 && <span style={{ background: "rgba(61,220,132,.12)", color: T.green, padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{(cur - weights[0]).toFixed(1)} kg / 30d</span>}
            <span style={{ fontSize: 11, color: T.dim }}>Apple Health</span>
          </div>
          <Line data={weights} h={120} />
          {s.composition && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(61,220,132,.06)", border: `1px solid ${T.line}` }}>
              <div style={label}>Composition · last 30 days</div>
              <div style={{ ...serif, fontSize: 18, margin: "3px 0 2px" }}>{s.composition.word}</div>
              <div style={{ fontSize: 12, color: T.mid, lineHeight: 1.5 }}>{s.composition.note}</div>
            </div>
          )}
        </div>
      )}
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
        <div style={{ height: 10, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
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
                {[["P", nt.protein, mt.protein, T.green], ["C", nt.carbs, mt.carbs, "var(--blue)"], ["F", nt.fat, mt.fat, T.amber]].map(([l, cur, max, c]) => (
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
              {macroBar("carbs", nt.carbs, mt.carbs, "var(--blue)")}
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
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
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
              <div style={{ fontSize: 11, color: T.mid }}>{s.macroMode === "auto" ? `auto · ${s.macroGoal} · Mifflin-St Jeor` : "manual"}</div>
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
                  const colors = { bank: T.green, stocks: "var(--blue)", crypto: T.amber, other: "var(--violet)", debt: T.red };
                  return <div key={g} style={{ width: `${(sum / pos) * 100}%`, background: colors[g] || T.dim }} title={g} />;
                })}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: T.mid }}>
                {Object.entries(groups).map(([g, list]) => {
                  const sum = list.reduce((a, e) => a + Math.max(0, e.amount), 0);
                  const pos = entries.reduce((a, e) => a + Math.max(0, e.amount), 0) || 1;
                  const colors = { bank: T.green, stocks: "var(--blue)", crypto: T.amber, other: "var(--violet)", debt: T.red };
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
                <div key={e.i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
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
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "user" ? "rgba(61,220,132,.1)" : "var(--panel2)", border: `1px solid ${m.role === "user" ? "rgba(61,220,132,.3)" : T.line}`, borderRadius: 14, padding: "10px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
              ))}
              {busy && <div style={{ ...serif, color: T.dim, fontSize: 13 }}>mentor is thinking…</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={inp} onChange={(e) => setInp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="ask me anything…" style={{ ...input, flex: 1, borderRadius: 999 }} />
            <button onClick={() => send()} disabled={busy} style={{ ...pill(true), opacity: busy ? 0.5 : 1 }}>→</button>
          </div>
        </div>
        <div style={{ ...card, background: "radial-gradient(ellipse at 50% 120%, rgba(61,220,132,.07), var(--panel2) 70%)" }}>
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
// Inserted into Press app

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
  "lateral raise":{sideDelts:1},"rear delt":{rearDelts:1,rhomboids:.4},
  "barbell row":{lats:1,rhomboids:.7,rearDelts:.5,biceps:.5,forearms:.3},
  "iso-lateral row":{lats:1,rhomboids:.7,rearDelts:.5,biceps:.5},
  "lat pulldown":{lats:1,rhomboids:.3,biceps:.5},"straight arm":{lats:1},
  "pull-up":{lats:1,rhomboids:.5,biceps:.7,forearms:.5,core:.3},"chin-up":{lats:.8,rhomboids:.4,biceps:1,forearms:.5},
  "bicep curl":{biceps:1,forearms:.3},"decline curl":{biceps:1},
  "tricep pushdown":{triceps:1},"triceps pushdown":{triceps:1},
  "cable crunch":{core:1},"crunch":{core:1},"plank":{core:1},
  // Generic fallbacks — checked after specific entries above; catch Hevy "(Barbell)"/"(Machine)" variants
  "squat":{quads:1,glutes:.7,hamstrings:.4,core:.3},
  "deadlift":{hamstrings:.9,glutes:.8,lowerBack:1,core:.4},
  "pull up":{lats:1,rhomboids:.5,biceps:.7,forearms:.5,core:.3},
  "row":{lats:.8,rhomboids:.6,rearDelts:.4,biceps:.5},
  "press":{chest:.7,frontDelts:.6,triceps:.6},
  "curl":{biceps:1,forearms:.4},
  "fly":{chest:1},
  "extension":{triceps:1},
  "raise":{sideDelts:1},
  // Activities
  "_running":{quads:.8,calves:1,glutes:.6,hamstrings:.5,hipFlexors:.6,core:.3},
  "_bouldering":{forearms:1,lats:.9,rhomboids:.7,biceps:.8,core:.7,rearDelts:.5,fingers:1},
  "_cycling":{quads:.9,calves:.5,glutes:.6,hamstrings:.4},
  "_zone2":{quads:.3,calves:.3,glutes:.2},
  "_hiit":{quads:.6,calves:.5,glutes:.4,hamstrings:.3,core:.3},
};

// 1RM: Brzycki for 6+ reps (more accurate mid-range), Epley for <6
function estOneRM(kg, reps) {
  if (!kg || !reps) return kg || 0;
  if (reps >= 6) return kg / (1.0278 - 0.0278 * reps);
  return kg * (1 + reps / 30);
}

// RIR via rep-to-failure inversion — reps is now a variable
function estRIR(kg, reps, est1rm) {
  if (!est1rm || est1rm <= 0 || !kg) return 5;
  const intensity = kg / est1rm;
  const repsToFail = reps >= 6
    ? (1.0278 - intensity) / 0.0278   // Brzycki inverted
    : 30 * (1 / intensity - 1);        // Epley inverted
  return Math.max(0, Math.min(10, repsToFail - reps));
}

// Low-rep scale: inverse exponential, clear plateau at reps≥6 — heavy/neural work carries less hypertrophy stimulus
function lowRepScale(reps) {
  if (reps >= 6) return 1;
  return 1 - Math.exp(-0.55 * reps);
}

// Ogasawara et al. 2017: volume response peaks at ~9 sets, normalized 0-1
function volumeResponsePct(numSets) {
  const rise = 1 - Math.exp(-numSets / 3);
  const decay = Math.exp(-0.018 * Math.max(0, numSets - 9));
  return rise * decay;
}

// Niv Zinder RIR effectiveness: sigmoid, high at RIR 0, dip around RIR 5-6, moderate at RIR 10
// RIR 0 = maximum hypertrophic stimulus. RIR 1 within 5%. Exponential decay thereafter.
// Reflects proximity-to-failure evidence (Schoenfeld, Refalo 2023).
function rirEffectiveness(rir) {
  const r = Math.max(0, Math.min(10, rir));
  if (r <= 1) return 1.0 - r * 0.05;          // 1.00 at RIR 0, 0.95 at RIR 1
  return 0.95 * Math.exp(-0.22 * (r - 1));     // ~0.76 at 2, ~0.61 at 3, ~0.49 at 4
}

// Supercompensation gamma curve — normalized so peak = stimulusScore at t = 48h (k=3, θ=24)
function adaptationCurve(hoursAfter, stimulusScore) {
  if (hoursAfter <= 0) return 0;
  const PEAK_H = 48, THETA = 24;
  const peakRaw = PEAK_H * PEAK_H * Math.exp(-PEAK_H / THETA); // 48^2 * e^-2
  return stimulusScore * (hoursAfter * hoursAfter * Math.exp(-hoursAfter / THETA)) / peakRaw;
}

function AdaptationChart({ series, atrophyRate, w = 600, h = 100 }) {
  if (!series || series.length < 2) return (
    <div style={{ ...serif, color: T.dim, fontSize: 14, padding: "20px 0" }}>Log lifts to see adaptation curve.</div>
  );
  const startH = series[0].h, endH = series.at(-1).h, totalH = endH - startH;
  const maxAdapt = Math.max(0.001, ...series.map(p => p.adapt));
  const xOf = hv => ((hv - startH) / totalH) * w;
  const yOf = v => h - (Math.max(0, v) / maxAdapt) * (h - 8) - 4;
  const pts = series.map(p => [xOf(p.h), yOf(p.adapt)]);
  const adaptPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const nowIdx = series.findIndex(p => p.h >= 0);
  const nowAdapt = nowIdx >= 0 ? series[nowIdx].adapt : 0;
  const atFuture = series.filter(p => p.h >= 0).map(p => [xOf(p.h), yOf(Math.max(0, nowAdapt - atrophyRate * p.h))]);
  const atPath = atFuture.length > 1 ? atFuture.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") : null;
  const nowX = xOf(0), peakX = xOf(48);
  const dayLabels = [];
  for (let dh = startH; dh <= endH; dh += 3 * 24) {
    const d = new Date(Date.now() + dh * 3600000);
    dayLabels.push({ x: xOf(dh), label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
  }
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="adG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: T.green }} stopOpacity=".22" />
          <stop offset="100%" style={{ stopColor: T.green }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${adaptPath} L${pts.at(-1)[0]},${h} L${pts[0][0]},${h} Z`} fill="url(#adG)" />
      <path d={adaptPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: T.green }} />
      <line x1={nowX} y1="0" x2={nowX} y2={h} strokeWidth="1" strokeDasharray="3 3" style={{ stroke: T.dim }} />
      <text x={nowX + 3} y="10" fontSize="8" style={{ fill: T.dim }}>now</text>
      {peakX > nowX && peakX < w && (
        <>
          <line x1={peakX} y1="0" x2={peakX} y2={h} strokeWidth="1" strokeOpacity=".45" style={{ stroke: T.amber }} />
          <text x={peakX} y="10" fontSize="8" textAnchor="middle" style={{ fill: T.amber }}>↑48h</text>
        </>
      )}
      {atPath && <path d={atPath} fill="none" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round" style={{ stroke: T.red }} />}
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} strokeWidth="0.5" style={{ stroke: T.line }} />
      {dayLabels.map((l, i) => <text key={i} x={l.x} y={h + 20} fontSize="8" textAnchor="middle" style={{ fill: T.dim }}>{l.label}</text>)}
    </svg>
  );
}

// Fuzzy match exercise name to muscle map key
function matchExercise(name, userMap) {
  const n = (name || "").toLowerCase().trim();
  if (!n) return null;
  // User-defined exact mappings take priority
  if (userMap && userMap[n]) return userMap[n];
  // MUSCLE_MAP substring matching (specific keys checked before generic fallbacks)
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

// Infer how fatiguing a movement is (0–1) from its muscle profile + name keywords
function inferMuscleFatigueLoad(exerciseName, muscles) {
  const n = (exerciseName || "").toLowerCase();
  const total = Object.values(muscles).reduce((s, w) => s + w, 0);
  let base = Math.min(0.8, 0.2 + total * 0.08);
  if (n.includes("deadlift")) base = Math.max(base, 0.9);
  else if (n.includes("squat") || n.includes("hack squat")) base = Math.max(base, 0.8);
  else if (n.includes("row") || n.includes("pull-up") || n.includes("pull up")) base = Math.max(base, 0.7);
  else if (n.includes("press") && !n.includes("leg")) base = Math.max(base, 0.6);
  if (n.includes("plank") || n.includes("crunch")) base = Math.min(base, 0.3);
  else if (n.includes("curl") || n.includes("raise") || n.includes("extension")) base = Math.min(base, 0.5);
  return Math.round(Math.max(0.1, Math.min(1.0, base)) * 10) / 10;
}

// Infer CNS demand (0–1) — heavy/explosive compounds score highest, isolation very low
function inferCnsLoad(exerciseName, muscles) {
  const n = (exerciseName || "").toLowerCase();
  const primaries = Object.values(muscles).filter(w => w >= 0.8).length;
  let cns = 0.1 + primaries * 0.1;
  if (n.includes("snatch") || n.includes("clean") || n.includes("jerk")) cns = 1.0;
  else if (n.includes("deadlift")) cns = Math.max(cns, 0.9);
  else if (n.includes("squat") || n.includes("hack squat")) cns = Math.max(cns, 0.8);
  else if (n.includes("overhead press") || n.includes("ohp")) cns = Math.max(cns, 0.7);
  else if (n.includes("bench press") || n.includes("row") || n.includes("pull-up") || n.includes("pull up") || n.includes("pulldown") || n.includes("chin-up")) cns = Math.max(cns, 0.6);
  if (n.includes("machine") || n.includes("leg press") || n.includes("leg extension") || n.includes("leg curl") || n.includes("seated")) cns = Math.min(cns, 0.2);
  if (n.includes("plank") || n.includes("crunch")) cns = Math.min(cns, 0.1);
  if (n.includes("curl") || n.includes("raise") || n.includes("pushdown") || n.includes("fly") || n.includes("extension")) cns = Math.min(cns, 0.15);
  // Steady-state cardio has negligible CNS cost; HIIT slightly higher
  if (n.includes("run") || n.includes("jog") || n.includes("bike") || n.includes("cycle") || n.includes("ride") ||
      n.includes("swim") || n.includes("walk") || n.includes("hike") || n.includes("zone")) cns = Math.min(cns, 0.10);
  if (n.includes("hiit")) cns = Math.min(cns, 0.25);
  if (n.includes("boulder") || n.includes("climb")) cns = Math.min(cns, 0.20);
  return Math.round(Math.max(0.05, Math.min(1.0, cns)) * 100) / 100;
}

// Returns true if this is a cardio/activity log where reps = duration (minutes)
function isCardioActivity(exerciseName, kg) {
  if (+kg !== 0) return false;
  const n = (exerciseName || "").toLowerCase();
  return n.includes("run") || n.includes("jog") || n.includes("bike") || n.includes("cycle") ||
         n.includes("ride") || n.includes("swim") || n.includes("walk") || n.includes("hike") ||
         n.includes("boulder") || n.includes("climb") || n.includes("hiit") || n.includes("zone") ||
         n.includes("cardio") || n.includes("rowing machine") || n.includes("ski erg") || n.includes("assault");
}

// For cardio, volume proxy = duration(min) × MET-equivalent factor; intensity = aerobic effort level
function cardioVolumeAndIntensity(exerciseName, durationMin) {
  const n = (exerciseName || "").toLowerCase();
  let factor = 8, intensity = 0.50;
  if (n.includes("hiit")) { factor = 12; intensity = 0.72; }
  else if (n.includes("run") || n.includes("jog")) { factor = 10; intensity = 0.52; }
  else if (n.includes("boulder") || n.includes("climb")) { factor = 9; intensity = 0.62; }
  else if (n.includes("bike") || n.includes("cycle") || n.includes("ride")) { factor = 7; intensity = 0.48; }
  else if (n.includes("swim")) { factor = 9; intensity = 0.55; }
  else if (n.includes("zone")) { factor = 5; intensity = 0.35; }
  else if (n.includes("walk") || n.includes("hike")) { factor = 4; intensity = 0.30; }
  return { volume: durationMin * factor, intensity };
}

// 3-component fatigue model (science-backed decay rates & weightings)
// Components: muscle (metabolic 18h HL + structural 38h HL, context-blended by intensity),
//             peripheral neural (44h HL, intensity²-scaled),
//             CNS (8h HL, intensity⁸ spike term)
// Display composite: muscle×0.70 + peripheral×0.25 + CNS×0.05
// Infers personal recovery rate and optimal RIR from lift history.
// Buckets consecutive session pairs by rest period, finds which rest window
// produced the highest average relative 1RM gain → implies individual half-life.
// Returns { recoveryMultiplier, optimalRestH, optimalRIR, pairsAnalyzed } or null if insufficient data.
function calibrateRecovery(lifts) {
  if (!lifts || lifts.length < 10) return null;

  // Group sets into per-day sessions per exercise
  const sessions = {};
  for (const l of lifts) {
    if (!l.exercise || !l.kg || !l.reps) continue;
    const dateKey = (l.date || "").slice(0, 10);
    const key = (l.exercise || "").toLowerCase();
    if (!sessions[key]) sessions[key] = {};
    if (!sessions[key][dateKey]) sessions[key][dateKey] = { sets: 0, rirSum: 0, best1RM: 0 };
    const sess = sessions[key][dateKey];
    const e1rm = frontE1RM(+l.kg, +l.reps, +l.rir || 0);
    sess.sets++;
    sess.rirSum += (+l.rir || 0);
    sess.best1RM = Math.max(sess.best1RM, e1rm);
  }

  // Build consecutive session pairs (A → B) per exercise
  const pairs = [];
  for (const [, dayMap] of Object.entries(sessions)) {
    const days = Object.entries(dayMap)
      .map(([date, d]) => ({ date, avgRIR: d.rirSum / d.sets, sets: d.sets, best1RM: d.best1RM }))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1], curr = days[i];
      const restH = (new Date(curr.date) - new Date(prev.date)) / 3600000;
      if (restH <= 0 || restH > 336 || prev.best1RM <= 0) continue;
      pairs.push({
        restH,
        avgRIR: prev.avgRIR,
        relGain: (curr.best1RM - prev.best1RM) / prev.best1RM,
      });
    }
  }
  if (pairs.length < 5) return null;

  // Bucket by 24h windows, find which rest period yields highest avg relative gain
  const buckets = {};
  for (const p of pairs) {
    const b = Math.floor(p.restH / 24) * 24;
    if (!buckets[b]) buckets[b] = [];
    buckets[b].push(p.relGain);
  }
  let bestBucket = 48, bestAvg = -Infinity;
  for (const [b, gains] of Object.entries(buckets)) {
    if (gains.length < 2) continue;
    const avg = gains.reduce((s, g) => s + g, 0) / gains.length;
    if (avg > bestAvg) { bestAvg = avg; bestBucket = +b; }
  }
  const optimalRestH = bestBucket + 12; // centre of bucket

  // Population optimal rest ≈ 48h — ratio gives personal recovery speed
  const recoveryMultiplier = Math.max(0.4, Math.min(2.5, 48 / optimalRestH));

  // Optimal RIR: average RIR of the top-quartile gain sessions
  const sorted = [...pairs].filter(p => p.relGain > 0).sort((a, b) => b.relGain - a.relGain);
  const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.25)));
  const optimalRIR = top.length > 0
    ? Math.round((top.reduce((s, p) => s + p.avgRIR, 0) / top.length) * 10) / 10
    : 2;

  return { recoveryMultiplier, optimalRestH, optimalRIR, pairsAnalyzed: pairs.length };
}

function computeFatigueState(lifts, now, calibration = null) {
  const mult = calibration?.recoveryMultiplier ?? 1.0;
  const METABOLIC_HL = 18 * mult, STRUCTURAL_HL = 38 * mult, PERIPHERAL_HL = 44 * mult, CNS_HL = 8 * mult;
  const CNS_SCALE = 100;
  const muscleAccum = {}, peripheralAccum = {};
  let cnsAccumRaw = 0;

  for (const l of (lifts || []).filter(l => {
    const h = (now - new Date(l.date).getTime()) / 3600000;
    return h >= 0 && h <= 168;
  })) {
    const muscles = matchExercise(l.exercise, null);
    if (!muscles || !Object.keys(muscles).length) continue;

    const hoursAgo = (now - new Date(l.date).getTime()) / 3600000;
    const kg = +l.kg || 0, reps = +l.reps || 1, rir = +l.rir || 0;
    const cardio = isCardioActivity(l.exercise, kg);
    let volume, intensity;
    if (cardio) {
      // reps = duration in minutes; derive volume & intensity from MET-equivalent model
      ({ volume, intensity } = cardioVolumeAndIntensity(l.exercise, reps));
    } else {
      const est1rm = frontE1RM(kg, reps, rir);
      const weightIntensity = Math.min(1.0, kg / Math.max(est1rm, 1));
      const effortIntensity = Math.max(0, 1 - rir / 10);
      intensity = weightIntensity * 0.6 + effortIntensity * 0.4;
      volume = kg * reps;
    }
    const mfl = inferMuscleFatigueLoad(l.exercise, muscles);
    const cnsl = inferCnsLoad(l.exercise, muscles);

    // Raw values: metabolic peaks at low intensity, structural at high intensity
    const metabolicRaw = volume * mfl * (1 + (1 - intensity) * 0.5);
    const structuralRaw = volume * mfl * intensity * intensity;
    const muscleRaw = metabolicRaw * (1 - intensity) + structuralRaw * intensity;
    const peripheralRaw = volume * mfl * intensity * intensity;
    const cnsRaw = Math.pow(reps, 0.65) * cnsl * (intensity * intensity + Math.pow(intensity, 8) * 2.5);

    // Intensity-blended decay for muscle (metabolic clears fast, structural slow)
    const metDecay = Math.pow(0.5, hoursAgo / METABOLIC_HL);
    const strDecay = Math.pow(0.5, hoursAgo / STRUCTURAL_HL);
    const muscleDecay = metDecay * (1 - intensity) + strDecay * intensity;
    const peripheralDecay = Math.pow(0.5, hoursAgo / PERIPHERAL_HL);
    const cnsDecay = Math.pow(0.5, hoursAgo / CNS_HL);

    for (const [m, w] of Object.entries(muscles)) {
      const focus = MUSCLE_TO_FOCUS[m];
      if (!focus) continue;
      muscleAccum[focus] = (muscleAccum[focus] || 0) + muscleRaw * w * muscleDecay;
      peripheralAccum[focus] = (peripheralAccum[focus] || 0) + peripheralRaw * w * peripheralDecay;
    }
    cnsAccumRaw += cnsRaw * cnsDecay;
  }

  const maxMuscle = Math.max(1, ...Object.values(muscleAccum));
  const maxPeripheral = Math.max(1, ...Object.values(peripheralAccum));
  const cnsScore = Math.min(1, cnsAccumRaw / CNS_SCALE);
  const focusFatigue = {};
  for (const f of ALL_FOCUS) {
    const mNorm = (muscleAccum[f] || 0) / maxMuscle;
    const pNorm = (peripheralAccum[f] || 0) / maxPeripheral;
    focusFatigue[f] = Math.round((mNorm * 0.70 + pNorm * 0.25 + cnsScore * 0.05) * 100) / 100;
  }
  return { focusFatigue, cnsScore };
}

// Recovery half-life per muscle group (hours) — larger muscles recover slower
const RECOVERY_H = {
  quads:56, hamstrings:56, glutes:56, calves:36, adductors:48, hipFlexors:40,
  chest:52, lats:52, frontDelts:44, sideDelts:40, rearDelts:40, rhomboids:44,
  triceps:36, biceps:36, forearms:32, fingers:36, core:36, lowerBack:56,
};

// All displayable muscles with SVG coordinates (front and back body)
const BODY_SVG = {
  // Front — { label, cx, cy, rx, ry, side [, link] }
  frontDelts:  { label:"Front Delts",  cx:113, cy:87,  rx:9,  ry:8,  side:"front" },
  frontDeltsR: { label:"Front Delts",  cx:187, cy:87,  rx:9,  ry:8,  side:"front", link:"frontDelts" },
  sideDelts:   { label:"Side Delts",   cx:103, cy:91,  rx:9,  ry:8,  side:"front" },
  sideDeltsR:  { label:"Side Delts",   cx:197, cy:91,  rx:9,  ry:8,  side:"front", link:"sideDelts" },
  chest:       { label:"Chest",        cx:150, cy:111, rx:27, ry:17, side:"front" },
  biceps:      { label:"Biceps",       cx:96,  cy:121, rx:8,  ry:14, side:"front" },
  bicepsR:     { label:"Biceps",       cx:204, cy:121, rx:8,  ry:14, side:"front", link:"biceps" },
  core:        { label:"Core",         cx:150, cy:150, rx:17, ry:20, side:"front" },
  forearms:    { label:"Forearms",     cx:91,  cy:166, rx:7,  ry:14, side:"front" },
  forearmsR:   { label:"Forearms",     cx:209, cy:166, rx:7,  ry:14, side:"front", link:"forearms" },
  hipFlexors:  { label:"Hip Flexors",  cx:150, cy:186, rx:21, ry:8,  side:"front" },
  quads:       { label:"Quads",        cx:121, cy:226, rx:12, ry:22, side:"front" },
  quadsR:      { label:"Quads",        cx:179, cy:226, rx:12, ry:22, side:"front", link:"quads" },
  adductors:   { label:"Adductors",    cx:150, cy:219, rx:9,  ry:18, side:"front" },
  calves:      { label:"Calves",       cx:124, cy:282, rx:8,  ry:12, side:"front" },
  calvesR:     { label:"Calves",       cx:176, cy:282, rx:8,  ry:12, side:"front", link:"calves" },
  // Back (x = front_x + 300)
  rearDelts:   { label:"Rear Delts",   cx:412, cy:88,  rx:10, ry:9,  side:"back" },
  rearDeltsR:  { label:"Rear Delts",   cx:488, cy:88,  rx:10, ry:9,  side:"back",  link:"rearDelts" },
  lats:        { label:"Lats",         cx:421, cy:126, rx:12, ry:22, side:"back" },
  latsR:       { label:"Lats",         cx:479, cy:126, rx:12, ry:22, side:"back",  link:"lats" },
  rhomboids:   { label:"Rhomboids",    cx:450, cy:112, rx:16, ry:11, side:"back" },
  lowerBack:   { label:"Lower Back",   cx:450, cy:156, rx:13, ry:11, side:"back" },
  triceps:     { label:"Triceps",      cx:402, cy:121, rx:7,  ry:14, side:"back" },
  tricepsR:    { label:"Triceps",      cx:498, cy:121, rx:7,  ry:14, side:"back",  link:"triceps" },
  glutes:      { label:"Glutes",       cx:450, cy:183, rx:25, ry:15, side:"back" },
  hamstrings:  { label:"Hamstrings",   cx:430, cy:227, rx:12, ry:22, side:"back" },
  hamstringsR: { label:"Hamstrings",   cx:470, cy:227, rx:12, ry:22, side:"back",  link:"hamstrings" },
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
  const [adaptMuscle, setAdaptMuscle] = useState(null);
  const [atrophyRate, setAtrophyRate] = useState(0.000117); // calibrated from 82 real gaps: median 0.28%/day

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

    const liftEst1RM = s.liftPRs || {};
    const uMap = s.userMuscleMap || {};
    // From logged lifts
    for (const l of (s.lifts || [])) {
      const muscles = matchExercise(l.exercise || "", uMap);
      if (!muscles) continue;
      const hoursAgo = (now - new Date(l.date).getTime()) / 36e5;
      if (hoursAgo > 168) continue;
      const intensity = liftEst1RM[l.exercise] ? (l.kg || 0) / liftEst1RM[l.exercise] : 0.75;
      const baseStimulus = intensity * (1 - Math.exp(-(l.reps || 0)));
      for (const [m, w] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1.0;
        const rawSoreness = activeSoreness[m] || 0;
        // Bidirectional: low soreness (score ~1-3) reduces HL, high soreness extends it. Neutral ~score 4.
        const hlMult = rawSoreness === 0 ? 1 : Math.max(0.5, 1 + (Math.min(1, rawSoreness) - 0.4) * 2.5);
        const effectiveHL = (RECOVERY_H[m] || 48) * hlMult;
        const decay = Math.pow(0.5, hoursAgo / effectiveHL);
        accum[m] = (accum[m] || 0) + baseStimulus * sens * w * decay;
      }
    }

    // From synced workouts (cardio / HAE)
    for (const w of (s.workouts || [])) {
      const muscles = matchExercise(w.name || "", uMap);
      if (!muscles) continue;
      const hoursAgo = (now - new Date(w.date || w.start).getTime()) / 36e5;
      if (hoursAgo > 168) continue;
      const effort = (w.kcal || 200) * (w.duration || 30) / 30;
      for (const [m, weight] of Object.entries(muscles)) {
        const sens = sensitivity[m] || 1.0;
        const rawSoreness = activeSoreness[m] || 0;
        const hlMult = rawSoreness === 0 ? 1 : Math.max(0.5, 1 + (Math.min(1, rawSoreness) - 0.4) * 2.5);
        const effectiveHL = (RECOVERY_H[m] || 48) * hlMult;
        const decay = Math.pow(0.5, hoursAgo / effectiveHL);
        accum[m] = (accum[m] || 0) + effort * sens * weight * decay;
      }
    }

    // Normalize to 0–1
    const maxVal = Math.max(1, ...Object.values(accum));
    const result = {};
    for (const [m, v] of Object.entries(accum)) result[m] = v / maxVal;
    return result;
  }, [s.lifts, s.liftPRs, s.workouts, s.muscleSensitivity, s.soreness]);

  const getMuscleLevel = (key) => {
    const m = BODY_SVG[key];
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
    return { pct, improving, strengthSets, zone2Mins, hiitMins };
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

  const adaptationTimeline = useMemo(() => {
    const now = Date.now();
    const uMap = s.userMuscleMap || {};
    const WINDOW_START_H = -14 * 24, WINDOW_END_H = 3 * 24, STEP_H = 6;
    const steps = Math.floor((WINDOW_END_H - WINDOW_START_H) / STEP_H) + 1;
    const est1RM = s.liftPRs || {};
    const byExDate = {};
    for (const l of (s.lifts || [])) {
      if (!l.exercise || !l.date || !l.kg) continue;
      const liftMs = new Date(l.date).getTime();
      if ((now - liftMs) / 3600000 > 500) continue; // gamma negligible beyond 500h
      const key = `${l.exercise}|${l.date}`;
      if (!byExDate[key]) byExDate[key] = { ms: liftMs, sets: [] };
      byExDate[key].sets.push(l);
    }
    const muscleContribs = {};
    for (const [key, sess] of Object.entries(byExDate)) {
      const ex = key.split("|")[0];
      const muscles = matchExercise(ex, uMap);
      if (!muscles) continue;
      const erm = est1RM[ex] || 1;
      const numSets = sess.sets.length;
      const avgRIR = sess.sets.reduce((acc, l) =>
        acc + (l.rir != null ? l.rir : estRIR(l.kg, l.reps || 1, erm)), 0) / numSets;
      const avgReps = sess.sets.reduce((acc, l) => acc + (l.reps || 1), 0) / numSets;
      const stimulus = volumeResponsePct(numSets) * rirEffectiveness(avgRIR) * lowRepScale(avgReps);
      for (const [m, w] of Object.entries(muscles)) {
        if (!muscleContribs[m]) muscleContribs[m] = [];
        muscleContribs[m].push({ ms: sess.ms, contrib: stimulus * w });
      }
    }
    const result = {};
    for (const [muscle, contribs] of Object.entries(muscleContribs)) {
      const series = [];
      for (let i = 0; i < steps; i++) {
        const h = WINDOW_START_H + i * STEP_H;
        const sampleMs = now + h * 3600000;
        let adapt = 0;
        for (const { ms, contrib } of contribs) {
          const ha = (sampleMs - ms) / 3600000;
          if (ha > 0 && ha < 400) adapt += adaptationCurve(ha, contrib);
        }
        series.push({ h, adapt });
      }
      result[muscle] = series;
    }
    return result;
  }, [s.lifts, s.liftPRs]);

  const adaptMuscles = Object.keys(adaptationTimeline).sort();
  const activeAdaptMuscle = adaptMuscle || adaptMuscles[0] || null;
  const activeSeries = activeAdaptMuscle ? (adaptationTimeline[activeAdaptMuscle] || []) : [];

  const estimatedAtrophyRate = s.estimatedAtrophyRate ?? null;

  // Auto-apply once enough data is available; ignore on subsequent lift changes
  const [atrophyCalibrated, setAtrophyCalibrated] = useState(false);
  useEffect(() => {
    if (estimatedAtrophyRate != null && !atrophyCalibrated) {
      setAtrophyRate(estimatedAtrophyRate);
      setAtrophyCalibrated(true);
    }
  }, [estimatedAtrophyRate]);

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

  const hoverMuscle = hover ? BODY_SVG[hover] : null;
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
          const color = p == null ? T.dim : p < 70 ? "var(--blue)" : p <= 130 ? T.green : p <= 170 ? T.amber : T.red;
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {[
                    ["Lifts", trainingLoad.improving != null ? trainingLoad.improving + "% up" : "—", trainingLoad.improving != null ? trainingLoad.improving > 50 ? T.green : T.amber : T.dim],
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
                {/* Body silhouette — paths in front coords, translated +300 for back */}
                <g transform={side === "back" ? "translate(300,0)" : undefined} strokeWidth="1" strokeLinejoin="round" style={{ fill: "var(--panel2)", stroke: T.line }}>
                  {/* Head */}
                  <ellipse cx="150" cy="50" rx="17" ry="20"/>
                  {/* Neck */}
                  <path d="M 143,69 L 157,69 L 157.5,80 L 142.5,80 Z" strokeWidth="0.5"/>
                  {/* Torso — shoulders wide → waist narrow → hips flare */}
                  <path d="M 144,77 L 117,83 C 107,91 104,113 106,133 C 107,144 119,154 127,158 C 121,165 118,176 120,184 L 180,184 C 182,176 179,165 173,158 C 181,154 193,144 194,133 C 196,113 193,91 183,83 L 156,77 Z"/>
                  {/* Left upper arm — tapers from shoulder to elbow */}
                  <path d="M 103,83 C 93,90 88,110 88,129 C 88,141 92,151 99,156 L 111,152 C 115,142 116,124 114,107 C 113,93 118,84 117,83 Z"/>
                  {/* Left forearm */}
                  <path d="M 99,157 C 92,166 88,182 88,196 C 88,204 91,210 96,211 L 107,207 C 109,198 109,182 109,169 C 109,162 106,156 99,157 Z"/>
                  {/* Right upper arm */}
                  <path d="M 197,83 C 207,90 212,110 212,129 C 212,141 208,151 201,156 L 189,152 C 185,142 184,124 186,107 C 187,93 182,84 183,83 Z"/>
                  {/* Right forearm */}
                  <path d="M 201,157 C 208,166 212,182 212,196 C 212,204 209,210 204,211 L 193,207 C 191,198 191,182 191,169 C 191,162 194,156 201,157 Z"/>
                  {/* Left thigh */}
                  <path d="M 118,185 C 110,198 107,220 108,241 C 109,256 115,267 124,271 L 135,267 C 138,251 139,232 137,211 C 135,196 131,187 122,185 Z"/>
                  {/* Right thigh */}
                  <path d="M 182,185 C 190,198 193,220 192,241 C 191,256 185,267 176,271 L 165,267 C 162,251 161,232 163,211 C 165,196 169,187 178,185 Z"/>
                  {/* Left calf */}
                  <path d="M 124,272 C 117,282 115,296 116,307 C 117,309 121,310 126,309 L 133,308 C 134,297 133,285 133,274 C 132,273 128,272 124,272 Z"/>
                  {/* Right calf */}
                  <path d="M 176,272 C 183,282 185,296 184,307 C 183,309 179,310 174,309 L 167,308 C 166,297 167,285 167,274 C 168,273 172,272 176,272 Z"/>
                </g>
                {/* Spine crease for back view */}
                {side === "back" && <line x1="450" y1="85" x2="450" y2="165" strokeWidth="0.75" strokeDasharray="2,3" style={{ stroke: T.line }}/>}
                {/* Muscle overlays — ellipses use absolute coordinates */}
                {Object.entries(BODY_SVG).filter(([, m]) => m.side === side).map(([key, m]) => {
                  const level = getMuscleLevel(key);
                  return (
                    <ellipse key={key} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry}
                      fill={fatigueColor(level)}
                      strokeWidth={hover === key ? 1.5 : 0}
                      style={{ cursor: "pointer", transition: "fill .3s", stroke: hover === key ? T.fg : "transparent" }}
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
          <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid var(--line)` }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: fatigueColor(v), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, textTransform: "capitalize" }}>{m.replace(/([A-Z])/g, " $1")}</span>
            <div style={{ width: 120, height: 5, background: "var(--line)", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${v * 100}%`, background: fatigueColor(v), borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 12, color: T.mid, width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(v * 100)}%</span>
          </div>
        ))}
        {Object.keys(fatigue).length === 0 && (
          <div style={{ ...serif, color: T.dim, fontSize: 14 }}>Log lifts or sync workouts and the map comes alive. Import a Hevy CSV or connect Strava below.</div>
        )}
      </div>

      {/* Adaptation Timeline */}
      {adaptMuscles.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={label}>Adaptation timeline · supercompensation curve</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: T.dim }}>
              {estimatedAtrophyRate != null && (
                <button onClick={() => { setAtrophyRate(estimatedAtrophyRate); setAtrophyCalibrated(true); }}
                  style={{ ...pill(atrophyCalibrated), fontSize: 10, padding: "3px 9px" }}
                  title={`Calibrated from your training gaps (14–90 days). Median 1RM drop = ${(estimatedAtrophyRate * 24 * 100).toFixed(3)}% / day`}>
                  {atrophyCalibrated ? "✓ calibrated from gaps" : "recalibrate from gaps"}
                </button>
              )}
              {estimatedAtrophyRate == null && <span style={{ fontSize: 10, color: T.dim }}>needs a 14+ day training gap to calibrate</span>}
              <input type="range" min="0.00005" max="0.002" step="0.00005" value={atrophyRate}
                onChange={e => { setAtrophyRate(+e.target.value); setAtrophyCalibrated(false); }}
                style={{ width: 80, accentColor: T.red }} />
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 60 }}>{(atrophyRate * 24).toFixed(4)}/day</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {adaptMuscles.map(m => (
              <button key={m} style={pill(activeAdaptMuscle === m)} onClick={() => setAdaptMuscle(m)}>
                {m.replace(/([A-Z])/g, " $1").toLowerCase()}
              </button>
            ))}
          </div>
          <AdaptationChart series={activeSeries} atrophyRate={atrophyRate} />
          <div style={{ display: "flex", gap: 16, fontSize: 10, color: T.dim, marginTop: 8 }}>
            <span><span style={{ color: T.green }}>—</span> Adaptation (gamma, k=3, θ=24h, peak 48h)</span>
            <span><span style={{ color: T.red }}>- -</span> Atrophy projection</span>
            <span><span style={{ color: T.amber }}>|</span> 48h peak window</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>
            Each stimulus contributes a gamma response peaking 48h post-workout. The red dashed line shows muscle loss at the current atrophy rate without further training. Train again where the green curve is highest for maximum supercompensation.
          </div>
        </div>
      )}

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
            const color = val > 1.15 ? T.amber : val < 0.85 ? "var(--blue)" : T.green;
            return (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid var(--line)` }}>
                <span style={{ flex: 1, fontSize: 13, textTransform: "capitalize" }}>{m.replace(/([A-Z])/g, " $1")}</span>
                <div style={{ width: 80, height: 4, background: "var(--line)", borderRadius: 99 }}>
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

      {/* Exercise muscle map */}
      <div style={{ ...card, marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={label}>Exercise muscle map</div>
          <div style={{ fontSize: 13, color: T.mid, marginTop: 3 }}>Define which muscles each of your exercises targets — overrides auto-detection for fatigue tracking.</div>
        </div>
        <button style={{ ...pill(true), padding: "10px 20px", flexShrink: 0 }} onClick={() => go("quiz")}>Open editor →</button>
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


const ALL_MUSCLE_LABELS = Object.entries(RECOVERY_H).map(([k]) => ({
  key: k, label: k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
}));

// 0 = off, 1 = primary (1.0), 0.5 = secondary
function cycleState(cur) { return cur === 0 ? 1 : cur === 1 ? 0.5 : 0; }

function ExerciseRow({ exercise, userMap, onSave }) {
  const autoMatch = matchExercise(exercise);
  const customMap = userMap[exercise] || null;
  const isCustom = !!customMap;
  const isAuto = !isCustom && !!autoMatch;

  const [open, setOpen] = useState(false);
  const [muscles, setMuscles] = useState(() => customMap || autoMatch || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMuscles(customMap || autoMatch || {});
  }, [customMap, autoMatch]);

  const toggle = (key) => {
    setMuscles(m => {
      const cur = m[key] ?? 0;
      const next = cycleState(cur);
      const updated = { ...m };
      if (next === 0) delete updated[key];
      else updated[key] = next;
      return updated;
    });
  };

  const save = async () => {
    setSaving(true);
    await onSave(exercise, muscles);
    setSaving(false);
    setOpen(false);
  };

  const clear = async () => {
    setSaving(true);
    await onSave(exercise, {});
    setSaving(false);
    setOpen(false);
  };

  const hasPrimary = Object.values(muscles).some(v => v >= 0.8);

  const statusBadge = isCustom
    ? { label: "custom", color: T.green, bg: "rgba(61,220,132,.12)" }
    : isAuto
    ? { label: "auto", color: T.amber, bg: "rgba(224,180,106,.12)" }
    : { label: "unmapped", color: T.dim, bg: "var(--panel2)" };

  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", cursor: "pointer" }}
      >
        <div style={{ flex: 1, fontSize: 14, color: T.fg, textTransform: "capitalize" }}>{exercise}</div>
        {!open && Object.keys(muscles).length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(muscles).slice(0, 4).map(([m, w]) => (
              <span key={m} style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 999,
                background: w >= 0.8 ? "rgba(61,220,132,.15)" : "rgba(224,180,106,.15)",
                color: w >= 0.8 ? T.green : T.amber,
              }}>{m.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
            ))}
            {Object.keys(muscles).length > 4 && <span style={{ fontSize: 10, color: T.dim }}>+{Object.keys(muscles).length - 4}</span>}
          </div>
        )}
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 999,
          background: statusBadge.bg, color: statusBadge.color, flexShrink: 0,
        }}>{statusBadge.label}</span>
        <span style={{ color: T.dim, fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ paddingBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>
            Click once = <span style={{ color: T.green }}>primary</span> · twice = <span style={{ color: T.amber }}>secondary</span> · three times = off
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {ALL_MUSCLE_LABELS.map(({ key, label }) => {
              const v = muscles[key] ?? 0;
              const isPrimary = v >= 0.8;
              const isSecondary = v > 0 && v < 0.8;
              return (
                <button key={key} onClick={() => toggle(key)} style={{
                  padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontSize: 12,
                  border: "1px solid",
                  borderColor: isPrimary ? T.green : isSecondary ? T.amber : T.line,
                  background: isPrimary ? "rgba(61,220,132,.15)" : isSecondary ? "rgba(224,180,106,.15)" : "transparent",
                  color: isPrimary ? T.green : isSecondary ? T.amber : T.mid,
                  fontWeight: isPrimary || isSecondary ? 600 : 400,
                  transition: "all .12s",
                }}>
                  {label}{isPrimary ? " ●" : isSecondary ? " ○" : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...pill(true), padding: "8px 20px", fontSize: 13 }}
              onClick={save}
              disabled={saving || !hasPrimary}
            >{saving ? "Saving…" : "Save"}</button>
            {isCustom && (
              <button
                style={{ ...pill(false), padding: "8px 16px", fontSize: 13, color: T.red, borderColor: T.red }}
                onClick={clear}
                disabled={saving}
              >Clear custom</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Quiz({ go, s, refresh }) {
  const uMap = s.userMuscleMap || {};

  const exercises = useMemo(() => {
    const seen = new Set();
    const unmapped = [], custom = [], auto = [];
    for (const l of (s?.lifts || [])) {
      const ex = (l.exercise || "").toLowerCase().trim();
      if (!ex || seen.has(ex)) continue;
      seen.add(ex);
      if (uMap[ex]) custom.push(ex);
      else if (matchExercise(ex)) auto.push(ex);
      else unmapped.push(ex);
    }
    // Also surface exercises only in MUSCLE_MAP but never done
    // (skipped — only show exercises user has actually done)
    return { unmapped, custom, auto, all: [...unmapped, ...custom, ...auto] };
  }, [s.lifts, uMap]);

  const [filter, setFilter] = useState("all");

  const displayed = filter === "unmapped" ? exercises.unmapped
    : filter === "custom" ? exercises.custom
    : filter === "auto" ? exercises.auto
    : exercises.all;

  const tabs = [
    { key: "all",      label: `All (${exercises.all.length})` },
    { key: "unmapped", label: `Unmapped (${exercises.unmapped.length})` },
    { key: "custom",   label: `Custom (${exercises.custom.length})` },
    { key: "auto",     label: `Auto (${exercises.auto.length})` },
  ];

  const handleSave = async (exercise, muscles) => {
    await api("user-muscle-map", { exercise, muscles });
    if (refresh) refresh();
  };

  return (
    <>
      <Back onClick={() => go("fatigue")} title="Exercise muscle map" />
      <div style={{ fontSize: 13, color: T.mid, marginTop: -10, marginBottom: 16, lineHeight: 1.5 }}>
        Map each exercise to the muscles it targets. This overrides auto-detection for fatigue tracking.
        Green = primary, amber = secondary.
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)} style={{
            padding: "6px 14px", borderRadius: 999, fontSize: 12, cursor: "pointer",
            border: `1px solid ${filter === t.key ? T.green : T.line}`,
            background: filter === t.key ? "rgba(61,220,132,.12)" : "transparent",
            color: filter === t.key ? T.green : T.mid,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ ...card }}>
        {displayed.length === 0 && (
          <div style={{ fontSize: 13, color: T.dim, padding: "20px 0", textAlign: "center" }}>No exercises in this category.</div>
        )}
        {displayed.map(ex => (
          <ExerciseRow key={ex} exercise={ex} userMap={uMap} onSave={handleSave} />
        ))}
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
    lift:  { color: "var(--blue)", bg: "rgba(106,180,224,.12)", icon: "△" },
    zone2: { color: T.green,   bg: "rgba(61,220,132,.12)",  icon: "◎" },
    hiit:  { color: T.red,     bg: "rgba(224,122,106,.12)", icon: "▲" },
    climb: { color: "var(--violet)", bg: "rgba(164,138,224,.12)", icon: "◈" },
    flex:  { color: T.amber,   bg: "rgba(224,180,106,.12)", icon: "〜" },
    rest:  { color: T.dim,     bg: "var(--panel2)", icon: "◌" },
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


const ACTIVITY_LEVELS = [
  [1.2,   "Sedentary",   "desk job, no exercise"],
  [1.375, "Light",       "exercise 1–3 days/wk"],
  [1.55,  "Moderate",    "exercise 3–5 days/wk"],
  [1.725, "Active",      "hard exercise 6–7 days/wk"],
  [1.9,   "Very active", "physical job + training"],
];

function Settings({ go, s, refresh }) {
  const [p, setP] = useState(s.profile || {});
  const al = p.activityLevel || 1.55;
  return (
    <>
      <Back onClick={() => go("home")} title="Profile" />
      <div style={{ ...card, maxWidth: 420, display: "grid", gap: 12 }}>
        {[["name", "Name", "text"], ["heightCm", "Height (cm)", "number"], ["sex", "Sex (m/f)", "text"], ["age", "Age", "number"], ["waterTarget", "Water target (bottles/day)", "number"]].map(([k, l, t]) => (
          <div key={k}><div style={{ ...label, marginBottom: 4 }}>{l}</div>
            <input value={p[k] ?? ""} type={t} onChange={(e) => setP({ ...p, [k]: t === "number" ? +e.target.value : e.target.value })} style={{ ...input, width: "100%" }} /></div>
        ))}
        <div>
          <div style={{ ...label, marginBottom: 8 }}>Activity level</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ACTIVITY_LEVELS.map(([val, name, desc]) => (
              <button key={val} style={{ ...pill(al === val), textAlign: "left", padding: "8px 14px" }}
                onClick={() => setP({ ...p, activityLevel: val })}>
                <span style={{ fontWeight: al === val ? 600 : 400 }}>{name}</span>
                <span style={{ fontSize: 11, color: al === val ? T.green : T.dim, marginLeft: 8 }}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <button style={{ ...pill(true), marginTop: 4 }} onClick={async () => { await api("profile", p); refresh(); go("home"); }}>Save</button>
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
  { key: "quiz",     icon: "◇", label: "Muscle Map" },
];

// Primary nav: 5 items only. Fatigue, Plan, Profile and Muscle Map are
// reachable from the Home tiles — they don't earn a permanent tab slot.
const NAV_PRIMARY = ["home", "vitality", "train", "fuel", "mentor"];

function BottomNav({ page, go }) {
  const visible = NAV_PAGES.filter(p => NAV_PRIMARY.includes(p.key));
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: T.bg, borderTop: `1px solid ${T.line}`,
      display: "flex", justifyContent: "space-around", alignItems: "stretch",
      padding: "0 0 env(safe-area-inset-bottom)",
      zIndex: 100,
    }}>
      {visible.map(({ key, icon, label }) => {
        const active = page === key;
        return (
          <button key={key} onClick={() => go(key)} style={{
            background: "none", border: "none", borderTop: `3px solid ${active ? T.bright : "transparent"}`,
            cursor: "pointer", flex: 1,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "9px 0 11px",
            color: active ? T.fg : T.dim,
            transition: "color .15s, border-color .15s",
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: active ? 700 : 500 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Persistent dark/light toggle, fixed top-right. Shows the mode you'll switch TO.
function ThemeToggle({ mode, toggle }) {
  return (
    <button onClick={toggle} aria-label="Toggle theme" style={{
      position: "fixed", top: "calc(14px + env(safe-area-inset-top))", right: 14, zIndex: 200,
      width: 38, height: 38, borderRadius: 999, cursor: "pointer",
      border: `1px solid ${T.line}`, background: T.panel, color: T.fg,
      fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
    }}>{mode === "dark" ? "☀" : "☾"}</button>
  );
}

function App() {
  const getHash = () => {
    const h = window.location.hash.slice(1);
    return NAV_PAGES.find(p => p.key === h) ? h : "home";
  };
  const [page, setPage] = useState(getHash);
  const [s, setS] = useState(null);
  const [mode, toggleTheme] = useTheme();

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

  const refresh = useCallback(() => api("summary").then(data => {
    setS(prev => (prev && prev._v === data._v) ? prev : data);
  }), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  if (!s) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <div style={{ width: 44, height: 44, background: T.bright, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ ...serif, color: T.dim, fontSize: 16 }}>loading…</div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.35} 50%{opacity:1} }`}</style>
      </div>
    </>
  );

  const props = { go, s, refresh };
  const pages = { home: <Home {...props} />, vitality: <Vitality {...props} />, train: <Train {...props} />, fuel: <Fuel {...props} />, mentor: <Mentor {...props} />, settings: <Settings {...props} />, plan: <Plan {...props} />, fatigue: <Fatigue {...props} />, quiz: <Quiz {...props} /> };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.fg, fontFamily: "'Inter', -apple-system, system-ui, sans-serif", padding: "24px clamp(14px,4vw,44px) 88px" }}>
      <style>{GLOBAL_CSS}</style>
      <ThemeToggle mode={mode} toggle={toggleTheme} />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{pages[page]}</div>
      <BottomNav page={page} go={go} />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
