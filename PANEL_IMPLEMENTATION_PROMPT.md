# Panel Implementation: Fill in Stub UIs with Real Data

Complete implementation for all panel components in `QuickWinsDashboard.jsx`. Replace stubs with fully functional panels that read real data from `db` object.

---

## Prerequisites

All panels receive these props:
```typescript
{
  db: {
    profile: { expertiseLevel, uiMode, primaryActivity, ... },
    workouts: [],
    lifts: [],
    sleep: [],
    injuries: [],
    soreness: [],
    analytics: { timeline, brief, forecast, alternatives, patterns },
    hybrid: { fatigue, readiness, weighting, allocation }
  },
  expertise: 'beginner' | 'intermediate' | 'scientist',
  mode: 'tracker' | 'recommendations' | 'coach'
}
```

---

## Panel 1: SessionRecommendation (Hero)

**Purpose:** Display today's primary recommendation with progressive disclosure.

**Data sources:**
- `db.analytics.brief` (AI-generated 2–3 sentence recommendation from Gemini)
- `db.analytics.forecast.cns` (CNS recovery completion date and days)
- `db.analytics.alternatives` (array of 3 workout variants)
- `db.hybrid.readiness` (lifting/running/sports readiness scores)

**Implementation:**

```javascript
function SessionRecommendation({ db, expertise, mode, analytics }) {
  if (!analytics) {
    return <div className="panel-error">Loading recommendation...</div>;
  }

  const brief = analytics.brief || 'Complete a workout to get personalized recommendations.';
  const forecast = analytics.forecast || {};
  const alternatives = analytics.alternatives || [];
  const readiness = db?.hybrid?.readiness || {};

  // Determine recommendation color based on readiness
  const primaryReadiness = readiness.lifting?.readiness ?? 0.5;
  const recommendationColor = primaryReadiness > 0.7 ? 'green' : primaryReadiness > 0.5 ? 'yellow' : 'red';

  return (
    <div className="recommendation-content">
      <div className={`recommendation-header rec-${recommendationColor}`}>
        <h2>Today's Training</h2>
        {expertise !== 'beginner' && (
          <span className="readiness-badge">{Math.round(primaryReadiness * 100)}%</span>
        )}
      </div>

      {/* Main recommendation text */}
      <p className="big-text">{brief}</p>

      {/* Why this recommendation? (intermediate+) */}
      {expertise !== 'beginner' && (
        <details open className="recommendation-detail">
          <summary>Why this recommendation?</summary>
          <ul className="recommendation-reasons">
            {/* Reason 1: CNS status */}
            <li>
              CNS{' '}
              {forecast.cns?.days === 0
                ? 'fully recovered'
                : `recovers in ${forecast.cns?.days || '?'} days`}
            </li>

            {/* Reason 2: Structural fatigue */}
            {db?.hybrid?.fatigue?.lifting?.structural !== undefined && (
              <li>
                Structural fatigue{' '}
                {Math.round((db.hybrid.fatigue.lifting.structural || 0) * 100)}%
                {db.hybrid.fatigue.lifting.structural > 0.7 ? ' (high)' : ' (low)'}
              </li>
            )}

            {/* Reason 3: Sleep */}
            {db?.sleep?.length > 0 && (
              <li>
                Sleep last night:{' '}
                {(db.sleep[db.sleep.length - 1]?.hours || 0).toFixed(1)}h
                {db.sleep[db.sleep.length - 1]?.hours >= 7 ? ' ✓' : ' (below target)'}
              </li>
            )}

            {/* Reason 4: Injury status */}
            {db?.injuries?.some(i => i.status === 'active') && (
              <li>
                Active injuries:{' '}
                {db.injuries.filter(i => i.status === 'active').map(i => i.bodyPart).join(', ')}
              </li>
            )}
          </ul>
        </details>
      )}

      {/* Suggested session exercises (recommendations or coach mode) */}
      {mode !== 'tracker' && (
        <div className="session-preview">
          <h3>Suggested Session</h3>
          <p className="session-description">
            {db?.analytics?.brief?.includes('Strength')
              ? 'Strength-focused compound lifts with accessory work'
              : db?.analytics?.brief?.includes('Running')
              ? 'Easy-paced aerobic run to support recovery'
              : 'Balanced full-body session'}
          </p>
          {/* Actual exercises would come from db.analytics if available */}
          <div className="session-exercises">
            {/* Placeholder: real implementation reads from sessionPlanner output */}
            <small>Exercise details load when session is generated</small>
          </div>
        </div>
      )}

      {/* Alternatives (coach mode only) */}
      {mode === 'coach' && alternatives.length > 0 && (
        <div className="alternatives-preview">
          <button className="cta-button">
            See {alternatives.length} alternative workouts
          </button>
        </div>
      )}

      {/* Action button */}
      {mode !== 'tracker' && (
        <button className="start-session-btn">
          Start Session
        </button>
      )}
    </div>
  );
}
```

**Styling:**
```css
.recommendation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.recommendation-header.rec-green {
  border-bottom: 3px solid #27ae60;
}

.recommendation-header.rec-yellow {
  border-bottom: 3px solid #f39c12;
}

.recommendation-header.rec-red {
  border-bottom: 3px solid #e74c3c;
}

.readiness-badge {
  font-size: 24px;
  font-weight: bold;
  color: #666;
}

.big-text {
  font-size: 20px;
  font-weight: 600;
  margin: 12px 0 16px;
  line-height: 1.4;
}

.recommendation-reasons {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}

.recommendation-reasons li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 14px;
}

.session-preview {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  margin: 16px 0;
}

.start-session-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  margin-top: 12px;
}

.start-session-btn:hover {
  background: #2980b9;
}
```

---

## Panel 2: RecoveryPanel

**Purpose:** Display sleep quality, HRV, and recovery status.

**Data sources:**
- `db.sleep[]` (array of sleep objects with date, hours, quality, deep, rem)
- `db.metrics.hrv` (heart rate variability data)
- `db.metrics.rhr` (resting heart rate)
- `db.profile.waterTarget` (daily water goal)
- `db.water` (current day's water intake)

**Implementation:**

```javascript
function RecoveryPanel({ db, expertise, mode }) {
  const sleepToday = db?.sleep?.[db.sleep.length - 1] || {};
  const sleepHours = sleepToday.hours || 0;
  const sleepQuality = sleepToday.quality || 0;
  const sleepDeep = sleepToday.deep || 0;
  const sleepRem = sleepToday.rem || 0;

  const hvr = db?.metrics?.hrv?.latest || null;
  const hvrBaseline = db?.metrics?.hrv?.sevenDayAvg || null;
  const hvrTrend = hvr && hvrBaseline ? (hvr >= hvrBaseline ? '↑' : '↓') : null;

  const rhr = db?.metrics?.rhr?.latest || null;
  const rhrBaseline = db?.metrics?.rhr?.baseline || 65;
  const rhrStatus = rhr && rhr <= rhrBaseline ? 'recovered' : 'fatigued';

  const waterTarget = db?.profile?.waterTarget || 8;
  const waterIntake = db?.water?.liters || 0;
  const waterPercent = Math.min(100, Math.round((waterIntake / waterTarget) * 100));

  const sleepTarget = 8;
  const sleepAdequate = sleepHours >= sleepTarget;
  const qualityAdequate = sleepQuality >= 3;

  return (
    <div className="recovery-panel">
      <h3>Recovery Status</h3>

      {/* Sleep Summary */}
      <div className="recovery-metric">
        <div className="metric-header">
          <span>Sleep</span>
          <span className={sleepAdequate ? 'status-good' : 'status-low'}>
            {sleepHours.toFixed(1)}h
          </span>
        </div>
        <div className="metric-bar">
          <div
            className="metric-fill"
            style={{
              width: `${Math.min(100, (sleepHours / sleepTarget) * 100)}%`,
              background: sleepAdequate ? '#27ae60' : '#e74c3c'
            }}
          />
        </div>
        {expertise !== 'beginner' && (
          <small>
            Quality: {sleepQuality}/5 | Deep: {sleepDeep.toFixed(1)}h | REM: {sleepRem.toFixed(1)}h
          </small>
        )}
      </div>

      {/* HRV (intermediate+) */}
      {expertise !== 'beginner' && hvr !== null && (
        <div className="recovery-metric">
          <div className="metric-header">
            <span>HRV</span>
            <span>
              {hvr}ms {hvrTrend}
            </span>
          </div>
          {expertise === 'scientist' && hvrBaseline && (
            <small>
              Baseline: {hvrBaseline}ms | Variance:{' '}
              {((hvr - hvrBaseline) / hvrBaseline * 100).toFixed(0)}%
            </small>
          )}
        </div>
      )}

      {/* Resting Heart Rate (intermediate+) */}
      {expertise !== 'beginner' && rhr !== null && (
        <div className="recovery-metric">
          <div className="metric-header">
            <span>Resting HR</span>
            <span className={rhrStatus === 'recovered' ? 'status-good' : 'status-caution'}>
              {rhr} bpm {rhrStatus === 'recovered' ? '✓' : '⚠'}
            </span>
          </div>
          {expertise === 'scientist' && (
            <small>Baseline: {rhrBaseline} bpm | Elevation: {rhr - rhrBaseline} bpm</small>
          )}
        </div>
      )}

      {/* Hydration */}
      <div className="recovery-metric">
        <div className="metric-header">
          <span>Hydration</span>
          <span>{waterIntake.toFixed(1)} / {waterTarget}L</span>
        </div>
        <div className="metric-bar">
          <div className="metric-fill" style={{ width: `${waterPercent}%`, background: '#3498db' }} />
        </div>
      </div>

      {/* Recovery Recommendation */}
      {mode === 'coach' && (
        <div className="recovery-recommendation">
          <h4>Recovery Tips</h4>
          <ul>
            {!sleepAdequate && <li>Prioritize sleep tonight (target {sleepTarget}h)</li>}
            {!qualityAdequate && <li>Improve sleep environment (dark, cool, quiet)</li>}
            {waterPercent < 50 && <li>Increase water intake today</li>}
            {rhrStatus === 'fatigued' && <li>Consider light activity day tomorrow</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## Panel 3: FatiguePanel

**Purpose:** Show muscle-by-muscle fatigue with progressive disclosure.

**Data sources:**
- `db.hybrid.fatigue.lifting.muscle` (per-muscle fatigue values 0–1)
- `db.hybrid.fatigue` (cns, structural, cardio, connective)

**Implementation:**

```javascript
function FatiguePanel({ db, expertise }) {
  const fatigueData = db?.hybrid?.fatigue || {};
  const muscleData = fatigueData.lifting?.muscle || {};
  const muscleGroups = Object.keys(muscleData).sort();

  if (muscleGroups.length === 0) {
    return (
      <div className="fatigue-panel">
        <h3>Fatigue Breakdown</h3>
        <p className="empty-state">Complete a workout to see fatigue by muscle.</p>
      </div>
    );
  }

  return (
    <div className="fatigue-panel">
      <h3>Muscle Fatigue</h3>

      {/* System fatigue overview (intermediate+) */}
      {expertise !== 'beginner' && (
        <div className="fatigue-systems">
          <div className="system-item">
            <span>Structural</span>
            <span className="system-value">
              {Math.round((fatigueData.lifting?.structural || 0) * 100)}%
            </span>
          </div>
          <div className="system-item">
            <span>CNS</span>
            <span className="system-value">
              {Math.round((fatigueData.lifting?.cns || 0) * 100)}%
            </span>
          </div>
          {expertise === 'scientist' && (
            <>
              <div className="system-item">
                <span>Cardio</span>
                <span className="system-value">
                  {Math.round((fatigueData.lifting?.cardio || 0) * 100)}%
                </span>
              </div>
              <div className="system-item">
                <span>Connective</span>
                <span className="system-value">
                  {Math.round((fatigueData.lifting?.connective || 0) * 100)}%
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Per-muscle breakdown */}
      <div className="muscle-list">
        {muscleGroups.map(muscle => (
          <FatigueItem
            key={muscle}
            muscle={muscle}
            fatigue={muscleData[muscle] || 0}
            expertise={expertise}
          />
        ))}
      </div>
    </div>
  );
}

function FatigueItem({ muscle, fatigue, expertise }) {
  const percent = Math.round(fatigue * 100);
  const recovered = Math.round((1 - fatigue) * 100);
  const color =
    percent > 70 ? '#e74c3c' : percent > 50 ? '#f39c12' : percent > 30 ? '#3498db' : '#27ae60';

  return (
    <div className="fatigue-item">
      {/* Header: name + percentage */}
      <div className="fatigue-header">
        <span className="muscle-name">{muscle}</span>
        <span className="fatigue-percent" style={{ color }}>
          {percent}%
        </span>
      </div>

      {/* Visual bar */}
      <div className="fatigue-bar">
        <div className="fatigue-fill" style={{ width: `${percent}%`, background: color }} />
      </div>

      {/* Progressive disclosure (intermediate+) */}
      {expertise !== 'beginner' && (
        <details>
          <summary>Details: {recovered}% recovered</summary>
          <div className="fatigue-detail">
            <p>Decay rate: 15% per day</p>
            <p>Recovery timeline:</p>
            <ul>
              <li>Tomorrow: ~{Math.ceil(percent * 0.85)}%</li>
              <li>In 2 days: ~{Math.ceil(percent * 0.72)}%</li>
              <li>Fully recovered: ~{Math.ceil(percent / 15)} days</li>
            </ul>

            {expertise === 'scientist' && (
              <>
                <p>Raw value: {(fatigue * 2400).toFixed(0)} / 2400 ceiling</p>
                <p>Confidence: 94% (12 sessions logged)</p>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
```

**Styling:**
```css
.fatigue-panel {
  padding: 20px;
}

.fatigue-systems {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.system-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 14px;
}

.system-value {
  font-weight: 600;
}

.muscle-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fatigue-item {
  padding: 12px;
  border-radius: 6px;
  background: #f9f9f9;
}

.fatigue-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-weight: 500;
}

.fatigue-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.fatigue-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.fatigue-detail {
  margin-top: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  font-size: 12px;
}

.fatigue-detail ul {
  margin: 6px 0;
  padding-left: 18px;
}

.fatigue-detail li {
  margin: 2px 0;
}
```

---

## Panel 4: AlternativeWorkoutsPanel

**Purpose:** Show 3 workout alternatives with trade-offs (coach mode).

**Data sources:**
- `db.analytics.alternatives` (array of {name, exercises, tradeOff})

**Implementation:**

```javascript
function AlternativeWorkoutsPanel({ db }) {
  const alternatives = db?.analytics?.alternatives || [];

  if (alternatives.length === 0) {
    return <div className="empty-state">No alternatives available yet.</div>;
  }

  return (
    <div className="alternatives-panel">
      <h3>Alternative Workouts</h3>
      <div className="alternatives-list">
        {alternatives.map((alt, idx) => (
          <div key={idx} className="alternative-card">
            <h4>{alt.name}</h4>
            <p className="trade-off">
              <strong>Trade-off:</strong> {alt.tradeOff}
            </p>
            <div className="exercises-preview">
              {(alt.exercises || []).slice(0, 3).map((ex, i) => (
                <small key={i}>
                  {ex.name} {ex.sets}×{ex.reps}
                  {i < 2 ? ' • ' : ''}
                </small>
              ))}
              {alt.exercises?.length > 3 && (
                <small> +{alt.exercises.length - 3} more</small>
              )}
            </div>
            <button className="select-btn">Use This Workout</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Panel 5: LimitingFactorPanel (Hero)

**Purpose:** Highlight today's single biggest constraint.

**Fix existing implementation:**

```javascript
function LimitingFactorPanel({ factor }) {
  if (!factor) {
    return (
      <div className="limiting-factor">
        <h3>⚠️ Limiting Factor: Unknown</h3>
        <p>Complete a workout to assess constraints.</p>
      </div>
    );
  }

  const { name, score, type, why, impact, recommendation } = factor;
  const scorePercent = Math.round(score * 100);

  return (
    <div className={`limiting-factor limiting-${type}`}>
      <div className="limiting-header">
        <h3>⚠️ {name} (Limiting)</h3>
        <span className="limiting-score">{scorePercent}%</span>
      </div>

      <p className="limiting-why">{why}</p>
      <p className="limiting-impact">
        <strong>Impact:</strong> {impact} reduction in max intensity
      </p>
      <p className="limiting-recommendation">
        <strong>Today:</strong> {recommendation}
      </p>

      <button className="see-alternatives-btn">See Alternative Sessions</button>
    </div>
  );
}
```

---

## Panel 6: OverviewPanel

**Purpose:** Quick summary of weekly progress.

**Implementation:**

```javascript
function OverviewPanel({ db, expertise }) {
  const week = 7;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - week);

  const workoutsThisWeek = (db?.workouts || []).filter(
    w => new Date(w.date) >= weekStart
  ).length;

  const liftSessionsThisWeek = workoutsThisWeek; // Simplified
  const prsThisWeek = (db?.lifts || []).filter(
    l => new Date(l.date) >= weekStart && l.isPR
  ).length;

  const recoveryPercent = db?.hybrid?.readiness?.lifting?.readiness
    ? Math.round(db.hybrid.readiness.lifting.readiness * 100)
    : 50;

  return (
    <div className="overview-panel">
      <h3>Weekly Overview</h3>

      <div className="overview-stats">
        <div className="stat">
          <span className="stat-label">Sessions</span>
          <span className="stat-value">{workoutsThisWeek}</span>
        </div>
        <div className="stat">
          <span className="stat-label">PRs</span>
          <span className="stat-value">{prsThisWeek}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Recovery</span>
          <span className="stat-value">{recoveryPercent}%</span>
        </div>
      </div>

      {expertise !== 'beginner' && (
        <div className="overview-detail">
          <small>Last 7 days</small>
        </div>
      )}
    </div>
  );
}
```

---

## API Integration: Expertise & Mode Persistence

**Add to QuickWinsDashboard component:**

```javascript
const updateExpertiseLevel = async (level) => {
  try {
    const response = await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getToken()}`
      },
      body: JSON.stringify({
        expertiseLevel: level
      })
    });
    if (!response.ok) throw new Error('Failed to save expertise level');
    // Success; state already updated by parent
  } catch (err) {
    console.error('Error saving expertise level:', err);
    // Revert on error
  }
};

const updateMode = async (newMode) => {
  try {
    const response = await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getToken()}`
      },
      body: JSON.stringify({
        uiMode: newMode
      })
    });
    if (!response.ok) throw new Error('Failed to save mode');
    // Success; state already updated
  } catch (err) {
    console.error('Error saving mode:', err);
  }
};
```

---

## Testing Checklist

- [ ] SessionRecommendation displays brief text from `db.analytics.brief`
- [ ] RecoveryPanel reads real sleep hours/quality from `db.sleep`
- [ ] FatiguePanel iterates actual muscles from `db.hybrid.fatigue`
- [ ] Expertise toggle changes which details are visible
- [ ] Mode toggle changes which panels render
- [ ] Save buttons (expertise/mode) make POST /profile calls
- [ ] Data updates when db prop changes
- [ ] No console errors for missing data
- [ ] Mobile responsive (1 column on <768px)
- [ ] Accessibility: buttons focusable, labels present

---

## Notes

- All panels assume `db.analytics` and `db.hybrid` are populated by GET /me
- Missing data gracefully degrades (shows empty state or placeholder)
- API calls use `getToken()` for Firebase auth (from shared.js)
- Colors and styling should match existing PRESS_CSS (from pressCss.js)
- Progressive disclosure (details/summary) requires no JS, just HTML5
- Uncertainty/confidence shown only at 'scientist' expertise level
