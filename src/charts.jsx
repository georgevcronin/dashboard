// Small, reusable SVG chart primitives — pure functions of their props, no
// dependency on app-level state. Extracted from app.jsx for readability.

export function AreaChart({ data, color, id }) {
  if (!data?.length) return null;
  const W = 320, H = 100;
  const mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const lo = mn - rng * 0.07, r = (mx + rng * 0.07) - lo;
  const pts = data.map((v, i) => [+(i / (data.length - 1) * W).toFixed(1), +(H - (v - lo) / r * H).toFixed(1)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const mx2 = (pts[i-1][0] + pts[i][0]) / 2;
    d += ` C${mx2},${pts[i-1][1]} ${mx2},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
  }
  const lp = pts[pts.length - 1];
  const gid = (id || 'g') + color.replace(/[^a-z0-9]/gi, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} y1={f*H} x2={W} y2={f*H} stroke="#c4b898" strokeWidth="1" strokeDasharray="2,4" />)}
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H}Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lp[0]} cy={lp[1]} r="3" fill={color} />
    </svg>
  );
}

export function BarChart({ data, color }) {
  if (data?.filter(Boolean).length < 2) return null;
  const W = 320, H = 60;
  const mx = Math.max(...data) * 1.12 || 1;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
      <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--rule)" strokeWidth={1} />
      {data.map((v, i) => {
        const h = (v / mx) * H;
        return <rect key={i} x={i*bw+1.5} y={H-h} width={bw-3} height={Math.max(h,0)} fill={i===data.length-1 ? color : color+'a0'} rx={1} />;
      })}
    </svg>
  );
}

export function Sparkline({ data, color = 'var(--gold)', width = 60, height = 20 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// Continuous per-muscle adaptation curve (functions/adaptation.js's
// computeAdaptationSeries) plus a dashed atrophy projection past "now" —
// revived from an earlier version of this app (deleted in a full frontend
// rewrite), restyled to this app's actual CSS-var palette instead of the old
// hardcoded theme object it was originally written against.
export function AdaptationChart({ series, atrophyRate, w = 600, h = 100 }) {
  if (!series || series.length < 2) return (
    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '20px 0' }}>Log lifts to see the adaptation curve.</div>
  );
  const startH = series[0].h, endH = series.at(-1).h, totalH = endH - startH;
  const maxAdapt = Math.max(0.001, ...series.map(p => p.adapt));
  const xOf = hv => ((hv - startH) / totalH) * w;
  const yOf = v => h - (Math.max(0, v) / maxAdapt) * (h - 8) - 4;
  const pts = series.map(p => [xOf(p.h), yOf(p.adapt)]);
  const adaptPath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const nowIdx = series.findIndex(p => p.h >= 0);
  const nowAdapt = nowIdx >= 0 ? series[nowIdx].adapt : 0;
  const atFuture = series.filter(p => p.h >= 0).map(p => [xOf(p.h), yOf(Math.max(0, nowAdapt - atrophyRate * p.h))]);
  const atPath = atFuture.length > 1 ? atFuture.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : null;
  const nowX = xOf(0), peakX = xOf(48);
  const dayLabels = [];
  for (let dh = startH; dh <= endH; dh += 3 * 24) {
    const d = new Date(Date.now() + dh * 3600000);
    dayLabels.push({ x: xOf(dh), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
  }
  const gid = 'adaptG';
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--forest)" stopOpacity=".22" />
          <stop offset="100%" stopColor="var(--forest)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${adaptPath} L${pts.at(-1)[0]},${h} L${pts[0][0]},${h} Z`} fill={`url(#${gid})`} />
      <path d={adaptPath} fill="none" stroke="var(--forest)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={nowX} y1="0" x2={nowX} y2={h} stroke="var(--dim)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={nowX + 3} y="10" fontSize="8" fill="var(--dim)">now</text>
      {peakX > nowX && peakX < w && (
        <>
          <line x1={peakX} y1="0" x2={peakX} y2={h} stroke="var(--gold)" strokeWidth="1" strokeOpacity=".45" />
          <text x={peakX} y="10" fontSize="8" fill="var(--gold)" textAnchor="middle">↑48h</text>
        </>
      )}
      {atPath && <path d={atPath} fill="none" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round" />}
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="var(--rule)" strokeWidth="0.5" />
      {dayLabels.map((l, i) => <text key={i} x={l.x} y={h + 20} fontSize="8" fill="var(--dim)" textAnchor="middle">{l.label}</text>)}
    </svg>
  );
}
