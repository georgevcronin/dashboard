# Quick Wins Prompt: UI Transforms (#1–20)

Implement the highest-impact UI features. No backend changes. Focus on visual transformation + mode toggles.

**Priority order** (implement in this sequence):

---

## PRIORITY 1: Expertise Levels (#3) — 45 minutes

**File:** `src/app.jsx`

**What to build:**
Add a 3-way toggle in the S1 header (top-left, next to "Press"):
- Beginner (eye icon)
- Intermediate (muscle icon)  
- Sport Scientist (microscope icon)

**State:**
```javascript
const [expertise, setExpertise] = useState('intermediate'); // store in db.profile.expertiseLevel
```

**Logic:**
Conditional rendering based on expertise:

| Element | Beginner | Intermediate | Sport Scientist |
|---------|----------|--------------|-----------------|
| S1 fatigue display | "CNS: High" only | + recovery % | + raw values, confidence % |
| S3 limiting factor | Simple text | + impact % | + physiological mechanism |
| S5 breakdown | Heatmap only | + muscle list | + decay rates, confidence intervals |
| S3 alternatives | Hidden | Show (1 option) | Show (3 options + trade-offs) |

**Implementation:**
```javascript
// Add to main App component
const [expertise, setExpertise] = useState(() => {
  return db.profile?.expertiseLevel || 'intermediate';
});

// Save on change
const updateExpertise = (level) => {
  setExpertise(level);
  db.profile.expertiseLevel = level;
  // POST /profile with updated db.profile
};

// Render toggle in S1 header
<div className="expertise-toggle">
  {['beginner', 'intermediate', 'scientist'].map(level => (
    <button
      key={level}
      className={`expertise-btn ${expertise === level ? 'active' : ''}`}
      onClick={() => updateExpertise(level)}
      title={level}
    >
      {level === 'beginner' ? '👁️' : level === 'intermediate' ? '💪' : '🔬'}
    </button>
  ))}
</div>

// Use in panels:
{expertise === 'sport scientist' && <AdvancedMetrics />}
{expertise !== 'beginner' && <RecoveryPercentage />}
```

**Test:**
- Toggle between levels → UI updates instantly
- Reload page → expertise persists (check db.profile in GET /me)
- Beginner hides advanced sections
- Sport Scientist shows everything

---

## PRIORITY 2: Recommendation Intensity Mode (#72) — 30 minutes

**File:** `src/app.jsx`

**What to build:**
Add a 3-way mode toggle in S1 header (next to expertise toggle):
- Tracker (logging mode, minimal recommendations)
- Recommendations (balanced, default)
- Coach (detailed cues, alternatives)

**State:**
```javascript
const [mode, setMode] = useState(() => {
  return db.profile?.uiMode || 'recommendations';
});
```

**Logic per mode:**

| Feature | Tracker | Recommendations | Coach |
|---------|---------|-----------------|-------|
| S3 recommended session | Hidden | Show | Show + coaching cues |
| S3 exercise alternatives | Hidden | Hidden | Show (dropdown) |
| S5 adaptation notes | Hidden | Show | Show (expanded) |
| S1 brief/tips | Hidden | Show | Show (detailed) |
| Mode philosophy | "Just log workouts" | "Smart recommendations" | "Learn why each choice" |

**Implementation:**
```javascript
const [mode, setMode] = useState(() => db.profile?.uiMode || 'recommendations');

const updateMode = (newMode) => {
  setMode(newMode);
  db.profile.uiMode = newMode;
  // POST /profile
};

// Render toggle
<div className="mode-toggle">
  {['tracker', 'recommendations', 'coach'].map(m => (
    <button
      key={m}
      className={`mode-btn ${mode === m ? 'active' : ''}`}
      onClick={() => updateMode(m)}
    >
      {m === 'tracker' ? '📝' : m === 'recommendations' ? '💡' : '🎓'}
    </button>
  ))}
</div>

// Use in S3 (SessionRecommendation panel)
{mode !== 'tracker' && <RecommendedSession />}
{mode === 'coach' && <CoachingCues />}
{mode === 'coach' && <AlternativeWorkouts />}
```

**Test:**
- Toggle modes → UI updates instantly
- Tracker: S3 shows only exercise list, no recommendations
- Recommendations: S3 shows full session + brief
- Coach: S3 shows session + alternatives + coaching cues
- Reload → mode persists

---

## PRIORITY 3: Recommendation-First Dashboard (#1) — 2 hours

**File:** `src/app.jsx`

**What to build:**
Reorder panels so "What should I train today?" is the hero. Current layout has S1 (Overview) first; change to Recommendation-first.

**Current order:**
1. S1 - Overview (metrics, hydration, streak)
2. S2 - Recovery (sleep, fatigue)
3. S3 - Session (tracking interface)
4. S5 - Detailed Fatigue

**New order:**
1. **S3 - Today's Recommendation** (HERO, above the fold)
   - Bold: "Strength session recommended today"
   - Why: "CNS recovered, structural fatigue low"
   - Limiting factor: "Cardiovascular capacity 72%"
   - Suggested session: [exercises]
   
2. **S4 - Today's Limiting Factor Panel** (NEW, HERO)
   - Primary constraint: "Cardiovascular fatigue high"
   - Impact: "Lower max HR zone by 5 bpm"
   - Mitigation: "Easy run acceptable, threshold pace not recommended"
   
3. S1 - Overview (smaller, secondary)
   - Weekly progress
   - Streak
   - Recovery %

4. S2 - Recovery (if time; else skip)

5. S5 - Detailed fatigue (collapsed by default)

**Implementation:**

```javascript
// Top-level App component, reorganize render order:

return (
  <div className="dashboard-container">
    {/* Header: Expertise + Mode toggles */}
    <header className="dashboard-header">
      <h1>Press</h1>
      <div className="header-controls">
        <ExpertiseToggle value={expertise} onChange={setExpertise} />
        <ModeToggle value={mode} onChange={setMode} />
      </div>
    </header>

    {/* HERO: Today's Recommendation */}
    <section className="hero-section">
      <SessionRecommendation db={db} expertise={expertise} mode={mode} />
    </section>

    {/* HERO: Today's Limiting Factor */}
    <section className="limiting-factor-section">
      <LimitingFactorPanel db={db} expertise={expertise} />
    </section>

    {/* Secondary: Overview & Recovery */}
    <section className="secondary-section">
      <OverviewPanel db={db} expertise={expertise} />
      <RecoveryPanel db={db} expertise={expertise} />
    </section>

    {/* Tertiary: Detailed Fatigue (collapsed) */}
    <section className="detail-section">
      <DetailedFatiguePanel db={db} expertise={expertise} collapsed={true} />
    </section>
  </div>
);
```

**Styling:**
```css
.hero-section {
  grid-column: 1 / -1; /* full width */
  background: linear-gradient(135deg, #f0f4ff 0%, #fff 100%);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.limiting-factor-section {
  grid-column: 1 / -1;
  background: #fff8f0;
  border-left: 4px solid #ff6b35;
  padding: 20px;
  margin-bottom: 24px;
  border-radius: 8px;
}

.secondary-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
```

**Key elements in SessionRecommendation:**
```javascript
function SessionRecommendation({ db, expertise, mode }) {
  const recommendation = db.analytics?.brief || "Loading..."; // from GET /me
  const limiting = db.analytics?.forecast?.cns || {};
  
  return (
    <div className="session-recommendation">
      <h2>Today's Training</h2>
      <p className="big-text">{recommendation}</p>
      
      {expertise !== 'beginner' && (
        <details>
          <summary>Why this recommendation?</summary>
          <ul>
            <li>CNS recovered 85% (was 92% yesterday)</li>
            <li>Structural fatigue low (34%)</li>
            <li>Sleep 8h (target met)</li>
          </ul>
        </details>
      )}
      
      {mode !== 'tracker' && (
        <div className="session-preview">
          <h3>Suggested Session</h3>
          {/* render session exercises */}
        </div>
      )}
      
      {mode === 'coach' && (
        <div className="alternatives">
          <button>See alternatives</button>
        </div>
      )}
    </div>
  );
}
```

**Test:**
- S3 recommendation is first visual element above the fold
- Limiting factor panel is prominent and explains today's constraint
- Overview is smaller, secondary
- Mode/expertise toggles affect what's displayed
- Reload → layout persists

---

## PRIORITY 4: Progressive Fatigue Explanations (#2) — 1 hour

**File:** `src/app.jsx`, S5 panel

**What to build:**
Expand S5 fatigue display from just numbers to progressive disclosure:

**Beginner view:**
```
Structural Fatigue: 45%
(small bar)
```

**Intermediate view:**
```
Structural Fatigue: 45% (recovered 75%)
├─ Chest: 52% (sore)
├─ Back: 38% (fresh)
└─ Legs: 40% (moderate)
```

**Sport Scientist view:**
```
Structural Fatigue: 45% (capped)
Raw value: 1080 / 2400 cap
Decay: 15% / day (prev 48h: 1200 → 1020)
├─ Chest: 52% (1248 raw)
├─ Back: 38% (912 raw)
└─ Legs: 40% (960 raw)
Confidence: 92% (12 sessions logged this week)
```

**Implementation:**
```javascript
function FatigueExplanation({ db, expertise, muscle }) {
  const fatigue = db.computeCurrentFatigueScores?.muscle?.[muscle] || 0;
  const raw = db.computeCurrentFatigueScores?.muscle_raw?.[muscle] || 0;
  
  return (
    <div className="fatigue-item">
      <div className="fatigue-header">
        <span>{muscle}</span>
        <span className="fatigue-percent">{Math.round(fatigue * 100)}%</span>
      </div>
      
      {expertise !== 'beginner' && (
        <details className="fatigue-detail">
          <summary>Recovery: {Math.round((1 - fatigue) * 100)}%</summary>
          <div className="fatigue-breakdown">
            <p>Decay rate: 15% per day</p>
            {expertise === 'sport scientist' && (
              <>
                <p>Raw value: {raw.toFixed(0)} / 2400</p>
                <p>Confidence: 94%</p>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
```

**Test:**
- Beginner: only % visible
- Intermediate: % + recovery % + muscle breakdown
- Scientist: + raw values, confidence, decay rates
- Details expandable/collapsible

---

## PRIORITY 5: Today's Limiting Factor Panel (#4) — 1 hour

**File:** `src/app.jsx` (new component)

**What to build:**
Prominent panel showing today's single biggest constraint:

```
⚠️ Today's Limiting Factor: Cardiovascular Fatigue (72%)

Why: High running volume yesterday + sports match evening
Impact: Max heart rate reduced by ~8 bpm from baseline
        Threshold pace 10 sec/km slower than normal

Recommended: Easy runs today, skip high-intensity work
Alternatives: Strength focus (low cardio stress), mobility
```

**Implementation:**
```javascript
function LimitingFactorPanel({ db }) {
  const hybrid = db.hybrid || {}; // from GET /me
  const readiness = hybrid.readiness || {};
  
  // Find lowest readiness score
  const factors = [
    { name: 'Structural', score: readiness.lifting?.readiness || 1, type: 'structural' },
    { name: 'Cardiovascular', score: readiness.running?.readiness || 1, type: 'cardio' },
    { name: 'Connective', score: readiness.sports?.readiness || 1, type: 'connective' },
  ];
  
  const limiting = factors.reduce((a, b) => a.score < b.score ? a : b);
  const impact = limiting.score < 0.5 ? 'High' : limiting.score < 0.7 ? 'Moderate' : 'Low';
  
  return (
    <div className={`limiting-factor limiting-${limiting.type}`}>
      <h3>⚠️ {limiting.name} (Limiting)</h3>
      <p className="score">{(limiting.score * 100).toFixed(0)}%</p>
      
      <p className="why">
        {limiting.type === 'cardio' && "High running volume + sports impact"}
        {limiting.type === 'structural' && "Heavy lifting session yesterday"}
        {limiting.type === 'connective' && "Plyometric volume accumulated"}
      </p>
      
      <p className="impact">Impact: {impact} reduction in max intensity</p>
      
      <div className="recommendations">
        <p>Today: Easy/moderate work recommended</p>
        <button>See alternatives</button>
      </div>
    </div>
  );
}
```

**Styling:**
```css
.limiting-factor {
  border-left: 6px solid;
  padding: 20px;
  border-radius: 8px;
  margin: 16px 0;
}

.limiting-cardio { border-color: #2e86de; background: rgba(46, 134, 222, 0.05); }
.limiting-structural { border-color: #ff6b35; background: rgba(255, 107, 53, 0.05); }
.limiting-connective { border-color: #f9ca24; background: rgba(249, 202, 36, 0.05); }

.limiting-factor h3 { margin: 0 0 12px 0; font-size: 18px; }
.limiting-factor .score { font-size: 32px; font-weight: bold; margin: 8px 0; }
.limiting-factor .why { color: #666; font-size: 14px; margin: 12px 0; }
.limiting-factor .impact { font-weight: 600; margin: 12px 0; }
```

**Test:**
- Panel shows only 1 limiting factor (lowest readiness)
- Color-coded by factor type
- Specific reasoning for today's constraint
- Alternatives button visible

---

## PRIORITY 6: Responsive Masonry Grid (#11) — 2 hours

**File:** `src/app.jsx`, CSS

**What to build:**
Replace fixed-height grid with CSS masonry or auto-flow grid that fills vertical space:

**Current (problematic):**
```
S1 (400px)  | S2 (400px)   | S3 (400px)
[empty]     | [empty]      | [empty]
```
Lots of white space on left if S2 is short.

**New (masonry):**
```
S1 (200px)  | S2 (400px)
S3 (250px)  | S4 (300px)
[no gaps]
```

**CSS solution:**
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  grid-auto-rows: auto; /* variable heights */
  gap: 16px;
  grid-auto-flow: dense; /* fill gaps */
}

@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr; /* single column mobile */
  }
}

@media (min-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

**Panel sizing rules:**
- Default: 1 unit (auto height)
- Recommendation hero: 2 units (wider)
- S5 fatigue: 2 units if expanded, 1 if collapsed
- Micro-widgets: 1 unit each

**Test:**
- Desktop: 2–3 columns, no white space
- Tablet: 2 columns, balanced
- Mobile: 1 column, full width
- Resize browser → grid reflows smoothly

---

## Implementation Order

1. **Session 1** (45m): Expertise toggle (#3)
2. **Session 2** (30m): Mode toggle (#72)
3. **Session 3** (2h): Reorder dashboard recommendation-first (#1)
4. **Session 4** (1h): Progressive fatigue explanations (#2)
5. **Session 5** (1h): Limiting factor panel (#4)
6. **Session 6** (2h): Responsive grid (#11)

**Total: 6.5 hours** for highest-impact, fastest turnaround.

---

## Files to Modify

- `src/app.jsx` — main component (reorder panels, add toggles, new components)
- `src/styles.css` (or inline `style` props) — grid, hero styling, mode/expertise colors

## Testing Checklist

- [ ] Expertise toggle persists on reload
- [ ] Mode toggle persists on reload
- [ ] Dashboard reorders: recommendation hero first, limiting factor visible
- [ ] Beginner mode hides advanced sections
- [ ] Coach mode shows alternatives
- [ ] Grid responsive: 1 col mobile, 2–3 col desktop
- [ ] No console errors
- [ ] npm run build succeeds
- [ ] Existing functionality (session tracking, workout logging) still works

---

## Notes

- No backend changes needed for this batch
- All state stored in `db.profile` (expertiseLevel, uiMode)
- Reuse existing data from GET /me (analytics, hybrid, forecast)
- Keep existing S1–S7 component structure; just reorder render order
- Mobile-first: test on phone width (375px) early
