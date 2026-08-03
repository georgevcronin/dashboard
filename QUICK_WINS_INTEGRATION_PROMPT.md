# Quick Wins Integration: Merge Scaffolding into Existing app.jsx

## Context

DeepSeek generated clean scaffolding for Quick Wins (#1–20):
- `QUICK_WINS.jsx` — new component with toggles + hero layout
- `QUICK_WINS.css` — masonry grid + hero styling

**Current app.jsx:** 7000+ lines, monolithic component with:
- Auth flow
- Session logging UI
- Fatigue display
- Existing S1–S7 panels
- Complex state management

**Task:** Integrate new scaffolding without breaking existing flow.

---

## Option A: Gradual Integration (Safer, Recommended)

### Step 1: Create Feature Flag
Add to `src/app.jsx` near top of Dashboard component:

```javascript
const [useNewLayout, setUseNewLayout] = useState(() => {
  return localStorage.getItem('press_use_new_layout') === 'true';
});

// Toggle in header for testing
<button 
  onClick={() => {
    setUseNewLayout(!useNewLayout);
    localStorage.setItem('press_use_new_layout', String(!useNewLayout));
  }}
>
  {useNewLayout ? '✓ New Layout' : 'Old Layout'}
</button>
```

### Step 2: Branch on Flag
At the top of render, before existing JSX:

```javascript
if (useNewLayout) {
  return <QuickWinsDashboard 
    db={db} 
    handleExpertiseChange={updateExpertiseLevel}
    handleModeChange={updateMode}
  />;
}

// Existing old layout code continues below
return (
  <div className="old-dashboard">
    {/* all existing JSX */}
  </div>
);
```

### Step 3: Implement QuickWinsDashboard
File: `src/components/QuickWinsDashboard.jsx` (new file)

Import the DeepSeek scaffolding but fix critical issues:

```javascript
import React, { useState } from 'react';

export function QuickWinsDashboard({ db, handleExpertiseChange, handleModeChange }) {
  const [expertise, setExpertise] = useState(() => db?.profile?.expertiseLevel || 'intermediate');
  const [mode, setMode] = useState(() => db?.profile?.uiMode || 'recommendations');

  const handleExpertiseLocal = (level) => {
    setExpertise(level);
    handleExpertiseChange?.(level);
  };

  const handleModeLocal = (newMode) => {
    setMode(newMode);
    handleModeChange?.(newMode);
  };

  if (!db) {
    return <div>Loading...</div>;
  }

  const { analytics, hybrid } = db;
  const limitingFactor = getLimitingFactor(hybrid);

  return (
    <div className="dashboard-container quick-wins">
      {/* Header */}
      <header className="dashboard-header">
        <h1>Press Dashboard</h1>
        <div className="header-controls">
          <ExpertiseToggle value={expertise} onChange={handleExpertiseLocal} />
          <ModeToggle value={mode} onChange={handleModeLocal} />
        </div>
      </header>

      {/* Masonry Grid */}
      <main className="dashboard-grid">
        {/* Hero: Recommendation */}
        <section className="panel hero-recommendation">
          <SessionRecommendation
            db={db}
            expertise={expertise}
            mode={mode}
            analytics={analytics}
          />
        </section>

        {/* Hero: Limiting Factor */}
        <section className="panel hero-limiting">
          <LimitingFactorPanel factor={limitingFactor} />
        </section>

        {/* Panels (conditional render based on expertise/mode) */}
        <section className="panel recovery">
          <RecoveryPanel db={db} expertise={expertise} mode={mode} />
        </section>

        <section className="panel fatigue-breakdown">
          <FatiguePanel db={db} expertise={expertise} />
        </section>

        {mode === 'coach' && (
          <section className="panel alternatives">
            <AlternativeWorkoutsPanel db={db} />
          </section>
        )}
      </main>
    </div>
  );
}

// --- Sub-components (from DeepSeek, with fixes) ---
// [include all toggle + panel components below]
```

### Step 4: Test Both Layouts
- Users can toggle `useNewLayout` to compare
- Old layout continues working
- New layout bugs don't break existing app
- Once new layout stable → remove old, make new default

---

## Option B: Full Replace (Riskier, Faster)

If you're confident in the new layout:

### Step 1: Backup existing app.jsx
```bash
git stash  # or git checkout -b backup/old-layout
```

### Step 2: Replace top-level component
Rename existing `export default function Dashboard()` → `function OldDashboard()`

Replace with:
```javascript
import { QuickWinsDashboard } from './components/QuickWinsDashboard.jsx';

export default function Dashboard({ db, ...props }) {
  return <QuickWinsDashboard db={db} {...props} />;
}
```

### Step 3: Move old JSX to OldDashboard
Keep old Dashboard for fallback if bugs found.

---

## Code Fixes Needed (Regardless of Option)

### Fix 1: Real Data Binding

**Before (stub):**
```javascript
function RecoveryPanel({ db, expertise, mode }) {
  return (
    <div>
      <h3>Recovery</h3>
      <p>Sleep: 7.5h | Quality: 4/5</p>  // Hardcoded!
    </div>
  );
}
```

**After (real data):**
```javascript
function RecoveryPanel({ db, expertise, mode }) {
  const sleep = db?.sleep?.[db.sleep.length - 1] || {};
  const sleepHours = sleep.hours || 0;
  const sleepQuality = sleep.quality || 0;
  const hrv = db?.metrics?.hrv?.latest || null;

  return (
    <div>
      <h3>Recovery</h3>
      <p>Sleep: {sleepHours}h | Quality: {sleepQuality}/5</p>
      {expertise !== 'beginner' && hrv && <p>HRV: {hrv}ms</p>}
    </div>
  );
}
```

### Fix 2: API Integration

**Before (TODO comment):**
```javascript
const handleExpertiseChange = (level) => {
  setExpertise(level);
  if (db?.profile) db.profile.expertiseLevel = level;
  // TODO: POST /profile with updated db.profile
};
```

**After (real API call):**
```javascript
const handleExpertiseChange = async (level) => {
  setExpertise(level);
  try {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expertiseLevel: level })
    });
    if (response.ok) {
      // State already updated, just log success
      console.log('Expertise level saved:', level);
    } else {
      console.error('Failed to save expertise level');
      setExpertise(db?.profile?.expertiseLevel || 'intermediate'); // Revert on error
    }
  } catch (err) {
    console.error('Error saving expertise level:', err);
    setExpertise(db?.profile?.expertiseLevel || 'intermediate');
  }
};
```

### Fix 3: Dynamic Muscle Groups

**Before (hardcoded):**
```javascript
function FatiguePanel({ db, expertise }) {
  const muscleGroups = ['chest', 'back', 'legs', 'shoulders'];
  // ...
}
```

**After (read from db):**
```javascript
function FatiguePanel({ db, expertise }) {
  const muscleData = db?.hybrid?.fatigue?.lifting?.muscle || {};
  const muscleGroups = Object.keys(muscleData);
  
  if (muscleGroups.length === 0) {
    return <div>No fatigue data yet. Complete a workout to see breakdown.</div>;
  }
  
  return (
    <div>
      <h3>Fatigue Breakdown</h3>
      {muscleGroups.map(m => (
        <FatigueItem
          key={m}
          muscle={m}
          fatigue={muscleData[m] || 0}
          expertise={expertise}
        />
      ))}
    </div>
  );
}
```

### Fix 4: Error Handling

**Add safety checks:**
```javascript
function QuickWinsDashboard({ db, ...props }) {
  if (!db) return <div className="error">Loading athlete data...</div>;
  if (!db.profile) return <div className="error">No profile found.</div>;
  
  // ... rest of component
}
```

### Fix 5: LimitingFactorPanel Complete Props

**Fix utility function:**
```javascript
function getLimitingFactor(hybrid) {
  if (!hybrid?.readiness) return null;
  
  const scores = [
    {
      name: 'Structural',
      score: hybrid.readiness.lifting?.readiness ?? 1,
      type: 'structural',
      why: 'Heavy lifting session yesterday',
    },
    {
      name: 'Cardiovascular',
      score: hybrid.readiness.running?.readiness ?? 1,
      type: 'cardio',
      why: 'High running volume + sports impact',
    },
    {
      name: 'Connective',
      score: hybrid.readiness.sports?.readiness ?? 1,
      type: 'connective',
      why: 'Plyometric volume accumulated',
    },
  ];
  
  scores.sort((a, b) => a.score - b.score);
  const lowest = scores[0];
  
  // Complete all required fields before returning
  lowest.impact = lowest.score < 0.5 ? 'High' : lowest.score < 0.7 ? 'Moderate' : 'Low';
  lowest.recommendation = lowest.score < 0.5 ? 'Easy work only' : 'Moderate intensity OK';
  
  return lowest;
}
```

---

## CSS Integration

DeepSeek's `QUICK_WINS.css` should be merged into `src/styles.css` or imported:

**Option 1: Separate file (cleaner)**
```javascript
// In QuickWinsDashboard.jsx
import '../styles/quick-wins.css';
```

**Option 2: Inline into existing styles.css**
Copy DeepSeek's CSS classes into existing stylesheet, namespacing with `.quick-wins-` prefix if needed to avoid conflicts.

---

## Testing Checklist (Before Going Live)

### Functionality
- [ ] Expertise toggle saves to db.profile, persists on reload
- [ ] Mode toggle saves to db.profile, persists on reload
- [ ] Limiting factor panel shows lowest readiness score
- [ ] Fatigue panel reads real data from db.hybrid.fatigue
- [ ] Recovery panel reads real sleep data
- [ ] Conditional rendering works: beginner hides advanced, tracker hides recommendations

### Visual
- [ ] Desktop (1200px+): 2–3 columns, no gaps
- [ ] Tablet (768–1199px): 2 columns
- [ ] Mobile (<768px): 1 column, full width
- [ ] Hero sections span full width (grid-column: 1 / -1)
- [ ] All buttons clickable, toggle states visible

### Error Handling
- [ ] Missing db → shows "Loading..." message
- [ ] Missing analytics → gracefully degrades (shows placeholder)
- [ ] API call fails → error logged, state reverts

### Compatibility
- [ ] Old layout still works (if using Option A: feature flag)
- [ ] No console errors
- [ ] npm run build succeeds

---

## Recommendation

**Start with Option A (feature flag):**

1. Cleaner rollback if bugs found
2. Users can test new layout without forcing it
3. Easy A/B testing
4. Less risk to existing app

Merge in parallel with other work (integration prompts running). Once new layout stable for 1–2 days, remove feature flag and make it default.

---

## Files to Create/Modify

- **New:** `src/components/QuickWinsDashboard.jsx` (350 lines)
- **New:** `src/styles/quick-wins.css` (150 lines) or merge into existing `styles.css`
- **Modify:** `src/app.jsx` (add feature flag at top, branch render, keep old code as fallback)
- **No changes:** `functions/index.js`, `functions/*` (backend unchanged)
