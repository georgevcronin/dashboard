# Micro-Widgets & Modular Unit System (#125–134)

Implement compact 1–2 unit widgets + modular grid engine for zero dead space.

---

## Context

**Feature #134** standardizes all dashboard panels into discrete unit heights (1, 2, 3, 4 units), then uses CSS grid `grid-auto-flow: dense` to pack micro-widgets into gaps.

**Result:** Magazine-aesthetic layout with zero vertical whitespace.

**Example before:**
```
S1 (400px)  | S2 (200px)
[empty 200] | [empty 200]
S3 (250px)  | S4 (300px)
```

**Example after (dense):**
```
S1 (400px)  | #126 RHR (1 unit)
            | #125 Hydration (1 unit)
            | #128 Steps (1 unit)
S3 (250px)  | #129 Insight (1 unit)
```

---

## Unit System Rules

Each widget/panel gets a fixed height:

| Units | Height (approx) | Content | Examples |
|-------|-----------------|---------|----------|
| **1** | 120px | Single metric + label | RHR ticker, hydration ring, streak badge |
| **2** | 280px | Small chart + metric | Muscle focus map, weight delta sparkline |
| **3** | 400px | Medium content | Recovery forecast, alternatives |
| **4** | 520px | Large content | Fatigue heatmap, timeline feed |

CSS:
```css
.unit-1 { grid-row: span 1; min-height: 120px; }
.unit-2 { grid-row: span 2; min-height: 280px; }
.unit-3 { grid-row: span 3; min-height: 400px; }
.unit-4 { grid-row: span 4; min-height: 520px; }
```

---

## Micro-Widgets (1 Unit Each)

### #125: Hydration Ring

**Purpose:** Circular progress ring for water intake vs daily target.

**Data source:** `db.water.liters` (current day)

**Props:** `{ db, expertise, mode }`

**Implementation:**

```javascript
function HydrationWidget({ db }) {
  const waterTarget = db?.profile?.waterTarget || 8;
  const waterIntake = db?.water?.liters || 0;
  const percent = Math.min(100, (waterIntake / waterTarget) * 100);

  return (
    <div className="widget unit-1 hydration-widget">
      <div className="ring-container">
        <svg viewBox="0 0 100 100" className="progress-ring">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#3498db"
            strokeWidth="8"
            strokeDasharray={`${percent * 2.51} 251`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </svg>
        {/* Center text */}
        <div className="ring-center">
          <div className="ring-value">{waterIntake.toFixed(1)}</div>
          <div className="ring-label">L</div>
        </div>
      </div>
      <button className="log-water-btn" onClick={() => alert('Log water flow TBD')}>
        +
      </button>
    </div>
  );
}
```

**Styling:**
```css
.hydration-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ring-container {
  position: relative;
  width: 90px;
  height: 90px;
}

.progress-ring {
  width: 100%;
  height: 100%;
}

.ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.ring-value {
  font-size: 20px;
  font-weight: bold;
}

.ring-label {
  font-size: 12px;
  color: #666;
}

.log-water-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #3498db;
  color: white;
  border: none;
  font-size: 18px;
  cursor: pointer;
}
```

---

### #126: Resting Heart Rate Ticker

**Purpose:** Display today's RHR with 7-day variance.

**Data source:** `db.metrics.rhr` (latest + 7-day avg)

**Implementation:**

```javascript
function RHRWidget({ db }) {
  const rhr = db?.metrics?.rhr?.latest || null;
  const rhrBaseline = db?.metrics?.rhr?.sevenDayAvg || 65;
  const variance = rhr ? rhr - rhrBaseline : 0;
  const trend = variance > 2 ? '↑' : variance < -2 ? '↓' : '→';
  const status = rhr <= rhrBaseline ? 'recovered' : 'elevated';

  if (!rhr) {
    return (
      <div className="widget unit-1 rhr-widget">
        <small>Connect wearable for RHR</small>
      </div>
    );
  }

  return (
    <div className="widget unit-1 rhr-widget">
      <div className="rhr-display">
        <div className={`rhr-value rhr-${status}`}>
          {rhr} <span className="rhr-trend">{trend}</span>
        </div>
        <div className="rhr-label">bpm</div>
      </div>
      <small className="rhr-baseline">
        Baseline: {rhrBaseline} bpm
      </small>
    </div>
  );
}
```

**Styling:**
```css
.rhr-widget {
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.rhr-value {
  font-size: 28px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
}

.rhr-recovered {
  color: #27ae60;
}

.rhr-elevated {
  color: #e74c3c;
}

.rhr-trend {
  font-size: 20px;
}

.rhr-label {
  font-size: 12px;
  color: #666;
}

.rhr-baseline {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}
```

---

### #127: Training Streak Badge

**Purpose:** Consecutive days of training or macro compliance.

**Data source:** `db.workouts[]` (completed sessions by date)

**Implementation:**

```javascript
function StreakWidget({ db }) {
  const workouts = db?.workouts || [];
  let streak = 0;
  let checkDate = new Date();

  // Count backwards from today
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const hasWorkout = workouts.some(w => w.date === dateStr);
    if (!hasWorkout) break;
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return (
    <div className="widget unit-1 streak-widget">
      <div className="streak-number">{streak}</div>
      <div className="streak-label">day streak</div>
      <div className="streak-icon">🔥</div>
    </div>
  );
}
```

**Styling:**
```css
.streak-widget {
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

.streak-number {
  font-size: 32px;
  font-weight: bold;
  color: #e74c3c;
}

.streak-label {
  font-size: 12px;
  color: #666;
}

.streak-icon {
  font-size: 20px;
}
```

---

### #128: NEAT / Step Count Mini-Bar

**Purpose:** Daily step accumulation vs target.

**Data source:** `db.metrics.steps.today` (current day steps)

**Implementation:**

```javascript
function StepCountWidget({ db }) {
  const stepsToday = db?.metrics?.steps?.today || 0;
  const stepsTarget = db?.profile?.dailyStepTarget || 10000;
  const percent = Math.min(100, (stepsToday / stepsTarget) * 100);
  const status = percent > 80 ? 'high' : percent > 60 ? 'moderate' : 'low';

  return (
    <div className="widget unit-1 steps-widget">
      <div className="steps-header">
        <span className="steps-label">Steps</span>
        <span className="steps-count">{Math.round(stepsToday / 1000)}k</span>
      </div>
      <div className="steps-bar">
        <div
          className={`steps-fill steps-${status}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <small>{stepsTarget.toLocaleString()} target</small>
    </div>
  );
}
```

**Styling:**
```css
.steps-widget {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.steps-header {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
}

.steps-bar {
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.steps-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.steps-high {
  background: #27ae60;
}

.steps-moderate {
  background: #f39c12;
}

.steps-low {
  background: #e74c3c;
}
```

---

### #129: AI Coaching Insight Nugget

**Purpose:** Single-line daily tip from briefing.

**Data source:** `db.analytics.brief` (extract first sentence)

**Implementation:**

```javascript
function InsightWidget({ db }) {
  const brief = db?.analytics?.brief || 'No insights yet. Complete a workout!';
  const firstSentence = brief.split('.')[0] + '.';

  return (
    <div className="widget unit-1 insight-widget">
      <div className="insight-label">💡 Today's Insight</div>
      <p className="insight-text">{firstSentence}</p>
    </div>
  );
}
```

**Styling:**
```css
.insight-widget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: #f0f4ff;
  border-left: 3px solid #3498db;
  border-radius: 4px;
}

.insight-label {
  font-size: 12px;
  font-weight: 600;
  color: #3498db;
}

.insight-text {
  font-size: 13px;
  line-height: 1.4;
  margin: 0;
  color: #333;
}
```

---

### #130: Optimal Training Window Timer

**Purpose:** Peak circadian + physiological window indicator.

**Data source:** `db.profile.timezone` (user's timezone)

**Implementation:**

```javascript
function TrainingWindowWidget() {
  // Circadian peak: typically 4–6pm (16–18h)
  const now = new Date();
  const hour = now.getHours();
  const peakStart = 16;
  const peakEnd = 18;

  const inPeakWindow = hour >= peakStart && hour < peakEnd;
  const nextPeak = inPeakWindow ? 24 + peakStart - hour : peakStart - hour;

  return (
    <div className="widget unit-1 training-window-widget">
      <div className={`window-status ${inPeakWindow ? 'active' : 'inactive'}`}>
        {inPeakWindow ? '✓ Peak Hour' : `Peak in ${nextPeak}h`}
      </div>
      <small>Optimal for high intensity</small>
    </div>
  );
}
```

**Styling:**
```css
.training-window-widget {
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

.window-status {
  font-size: 16px;
  font-weight: 600;
}

.window-status.active {
  color: #27ae60;
}

.window-status.inactive {
  color: #f39c12;
}
```

---

## 2-Unit Widgets

### #131: Today's Muscle Focus Mini-Map

**Purpose:** Body diagram highlighting primary target muscles.

**Data source:** `db.analytics.forecast.muscle` (sorted by fatigue/focus)

**Implementation:**

```javascript
function MuscleFocusWidget({ db }) {
  const muscleData = db?.analytics?.forecast?.muscle || {};
  const topMuscles = Object.entries(muscleData)
    .sort((a, b) => (b[1]?.days || 0) - (a[1]?.days || 0))
    .slice(0, 3)
    .map(([name]) => name);

  return (
    <div className="widget unit-2 muscle-focus-widget">
      <h4>Today's Focus</h4>
      <div className="muscle-map-simple">
        {/* Simplified body diagram with 3 highlighted regions */}
        <svg viewBox="0 0 100 200" className="body-diagram">
          {/* Body outline */}
          <ellipse cx="50" cy="40" rx="20" ry="25" fill="none" stroke="#ccc" strokeWidth="2" />
          {/* Torso */}
          <rect x="35" y="65" width="30" height="50" fill="none" stroke="#ccc" strokeWidth="2" />
          {/* Legs */}
          <line x1="42" y1="115" x2="42" y2="190" stroke="#ccc" strokeWidth="2" />
          <line x1="58" y1="115" x2="58" y2="190" stroke="#ccc" strokeWidth="2" />

          {/* Highlight top muscles */}
          {topMuscles.includes('chest') && (
            <rect x="35" y="65" width="30" height="20" fill="#3498db" opacity="0.4" />
          )}
          {topMuscles.includes('back') && (
            <rect x="35" y="85" width="30" height="20" fill="#3498db" opacity="0.4" />
          )}
          {topMuscles.includes('legs') && (
            <line
              x1="42"
              y1="115"
              x2="42"
              y2="160"
              stroke="#3498db"
              strokeWidth="4"
              opacity="0.4"
            />
          )}
        </svg>
      </div>
      <div className="muscle-list">
        {topMuscles.map((m, i) => (
          <small key={i}>
            {i + 1}. {m}
          </small>
        ))}
      </div>
    </div>
  );
}
```

**Styling:**
```css
.muscle-focus-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.muscle-map-simple {
  display: flex;
  justify-content: center;
}

.body-diagram {
  width: 60px;
  height: 120px;
}

.muscle-list {
  font-size: 12px;
  text-align: center;
}
```

---

### #132: Body Weight Delta Tracker

**Purpose:** 7-day scale weight sparkline vs bulking/cutting goal.

**Data source:** `db.weight` (daily weigh-ins)

**Implementation:**

```javascript
function WeightDeltaWidget({ db }) {
  const weights = (db?.weight?.daily || []).slice(-7);
  const currentWeight = weights[weights.length - 1] || 75;
  const weekAgoWeight = weights[0] || currentWeight;
  const delta = currentWeight - weekAgoWeight;
  const deltaPercent = ((delta / weekAgoWeight) * 100).toFixed(2);

  const isBuilking = db?.profile?.goal === 'bulk';
  const goalDirection = isBuilking ? 'up' : 'down';
  const deltaStatus =
    (isBuilking && delta > 0) || (!isBuilking && delta < 0) ? 'good' : 'off-track';

  return (
    <div className="widget unit-2 weight-delta-widget">
      <div className="weight-header">
        <span>Weight</span>
        <span className={`weight-delta weight-${deltaStatus}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}kg
        </span>
      </div>
      <div className="weight-chart">
        {weights.map((w, i) => (
          <div
            key={i}
            className="weight-bar"
            style={{ height: `${(w / Math.max(...weights)) * 80}px` }}
          />
        ))}
      </div>
      <small>
        {isBuilking ? 'Bulking' : 'Cutting'} — {deltaStatus === 'good' ? '✓ on track' : '⚠ off track'}
      </small>
    </div>
  );
}
```

**Styling:**
```css
.weight-delta-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weight-header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.weight-delta {
  font-size: 14px;
}

.weight-delta.weight-good {
  color: #27ae60;
}

.weight-delta.weight-off-track {
  color: #e74c3c;
}

.weight-chart {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 80px;
}

.weight-bar {
  flex: 1;
  background: #3498db;
  border-radius: 2px 2px 0 0;
  min-height: 4px;
}
```

---

### #133: Weekly Volume Pace Bar

**Purpose:** Lifting tonnage or running distance vs weekly target.

**Data source:** `db.hybrid.weighting`, `db.analytics.patterns`

**Implementation:**

```javascript
function VolumeWidget({ db }) {
  const patterns = db?.analytics?.patterns || {};
  const weeklyTonnage = Object.values(patterns).reduce(
    (sum, p) => sum + (p?.tonnage || 0),
    0
  );

  const primaryActivity = db?.profile?.primaryActivity || 'lifting';
  const target = primaryActivity === 'lifting' ? 50000 : 100;
  const unit = primaryActivity === 'lifting' ? 'kg' : 'km';
  const percent = Math.min(100, (weeklyTonnage / target) * 100);
  const status = percent > 80 ? 'high' : percent > 60 ? 'moderate' : 'low';

  return (
    <div className="widget unit-2 volume-widget">
      <div className="volume-header">
        <span>Weekly {primaryActivity === 'lifting' ? 'Tonnage' : 'Distance'}</span>
        <span className="volume-value">{weeklyTonnage.toFixed(0)}/{target} {unit}</span>
      </div>
      <div className="volume-bar">
        <div className={`volume-fill volume-${status}`} style={{ width: `${percent}%` }} />
      </div>
      <small>{percent.toFixed(0)}% of weekly target</small>
    </div>
  );
}
```

**Styling:**
```css
.volume-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.volume-header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
}

.volume-value {
  color: #666;
}

.volume-bar {
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.volume-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.3s ease;
}

.volume-high {
  background: #27ae60;
}

.volume-moderate {
  background: #f39c12;
}

.volume-low {
  background: #e74c3c;
}
```

---

## Modular Grid Engine (#134)

**CSS Grid Configuration:**

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  grid-auto-rows: 120px; /* 1 unit = 120px */
  gap: 16px;
  grid-auto-flow: dense; /* Fill gaps with smaller items */
  padding: 16px;
}

/* Unit scaling */
.unit-1 { grid-row: span 1; }
.unit-2 { grid-row: span 2; }
.unit-3 { grid-row: span 3; }
.unit-4 { grid-row: span 4; }

/* Desktop: 3 columns */
@media (min-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Tablet: 2 columns */
@media (min-width: 768px) and (max-width: 1199px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Mobile: 1 column, larger units */
@media (max-width: 767px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-auto-rows: 100px;
  }
  
  .unit-2 { grid-row: span 2; }
  .unit-3 { grid-row: span 3; }
  .unit-4 { grid-row: span 4; }
}
```

---

## Integration into QuickWinsDashboard

**Add micro-widgets to grid after main panels:**

```javascript
<main className="dashboard-grid">
  {/* Hero panels (unit-3 or unit-4) */}
  <section className="panel unit-3 hero-recommendation">
    <SessionRecommendation ... />
  </section>

  <section className="panel unit-3 hero-limiting">
    <LimitingFactorPanel ... />
  </section>

  {/* Secondary panels (unit-2) */}
  <section className="panel unit-2 recovery">
    <RecoveryPanel ... />
  </section>

  {/* Micro-widgets (unit-1) */}
  <section className="widget unit-1">
    <HydrationWidget db={db} />
  </section>

  <section className="widget unit-1">
    <RHRWidget db={db} />
  </section>

  <section className="widget unit-1">
    <StreakWidget db={db} />
  </section>

  <section className="widget unit-1">
    <StepCountWidget db={db} />
  </section>

  {/* 2-unit widgets */}
  <section className="widget unit-2">
    <MuscleFocusWidget db={db} />
  </section>

  <section className="widget unit-2">
    <WeightDeltaWidget db={db} />
  </section>

  <section className="widget unit-2">
    <VolumeWidget db={db} />
  </section>

  {/* Larger panels */}
  <section className="panel unit-3 fatigue-breakdown">
    <FatiguePanel ... />
  </section>

  {/* Grid auto-flow: dense will fill gaps */}
</main>
```

---

## Testing Checklist

- [ ] Hydration ring updates on +/- button
- [ ] RHR ticker shows trend (↑↓→)
- [ ] Streak counts consecutive workout days correctly
- [ ] Step count bar fills based on daily target
- [ ] Insight nugget extracts first sentence from brief
- [ ] Training window shows peak hour or countdown
- [ ] Muscle focus highlights top 3 muscles on diagram
- [ ] Weight delta shows ±kg with goal direction (bulk/cut)
- [ ] Volume bar fills based on weekly tonnage/distance target
- [ ] Grid: desktop 3 cols, tablet 2 cols, mobile 1 col
- [ ] No vertical gaps (grid-auto-flow: dense fills with 1-unit widgets)
- [ ] Mobile: larger units due to narrower viewport
- [ ] Responsive: resize browser → grid reflows seamlessly

---

## Notes

- All widgets read fresh data on each render (no local state needed)
- Use `db?.property || fallback` to handle missing data gracefully
- Emojis are semantic (🔥 for streak, 💡 for insight) — consider accessibility alt-text
- Unit heights are approximations; adjust based on actual content
- `grid-auto-flow: dense` requires no explicit positioning — just add widgets in any order
- Colors should match existing PRESS_CSS palette
