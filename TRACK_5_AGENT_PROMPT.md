# TRACK 5: Dashboard Customization + Micro-Polish
## Layout Control, Templates, Micro-Widgets, Mode Flexibility

**Duration:** 3–4 days  
**Status:** Ready to start immediately. Low priority; can run parallel to other tracks.  
**Ship Criteria:** Customization works, micro-widgets render, mode toggle functional, 20+ tests passing.

---

## OVERVIEW

Polish the dashboard experience with user control and micro-utilities:
1. **Customizable Layouts** (#15): Drag-drop rearrange panels, hide/show toggles, persist
2. **Movement Pattern Tracking** (#52): Surface pattern volume + muscle fatigue breakdown
3. **Quick-Start Templates** (#75): Pre-load session skeletons ("Full Body", "Upper/Lower", etc.)
4. **Micro-Widgets** (#125–133): Hydration, RHR, volume pace, muscle focus map (if space permits)
5. **Mode Toggle** (#71): Switch between Tracker, Recommendations, Coach density

---

## ARCHITECTURE

### **1. Customizable Layouts** (`functions/layoutPreferences.js` + frontend state)

Store panel arrangement in athlete profile.

#### **Layout Data Model**
```javascript
const layoutPreferences = {
  // Which panels to show
  panels: {
    'dashboard-overview': { visible: true, order: 1, width: 'full' },
    'weekly-load': { visible: true, order: 2, width: 'half' },
    'fatigue-heatmap': { visible: true, order: 3, width: 'half' },
    'recommendations': { visible: true, order: 4, width: 'full' },
    'timeline': { visible: false, order: 5, width: 'full' },      // Hidden
    'running-dashboard': { visible: true, order: 6, width: 'half' },
    'micro-widgets': { visible: true, order: 7, width: 'half' }
  },
  
  // Tab/section visibility
  tabs: {
    'S1-tabs': ['Overview', 'Calendar', 'Timeline'],           // which tabs show in S1
    'S3-tabs': ['Generate Session', 'Templates', 'History'],
    'S5-tabs': ['Fatigue Breakdown', 'Recovery', 'Metrics']
  },
  
  // Global settings
  theme: 'light',                  // 'light', 'dark', 'auto'
  compactMode: false,              // true = reduce spacing/padding
  metricFormat: 'metric'           // 'metric' (kg, km), 'imperial' (lbs, mi)
}
```

#### **Backend Storage**
```javascript
// In athlete profile
athlete.layoutPreferences = { panels: {...}, tabs: {...}, theme: '...', ... }

// Endpoint to save
POST /layout-preferences
{
  panels: {...},
  tabs: {...}
}
```

#### **Frontend State Management**
```javascript
// In app.jsx
const [layoutPreferences, setLayoutPreferences] = useState(defaultLayout)

// On drag-drop reorder:
const handlePanelReorder = (panelId, newOrder) => {
  const updated = {
    ...layoutPreferences,
    panels: {
      ...layoutPreferences.panels,
      [panelId]: { ...layoutPreferences.panels[panelId], order: newOrder }
    }
  }
  setLayoutPreferences(updated)
  saveToDB(updated)  // POST /layout-preferences
}

// On toggle hide:
const handlePanelToggle = (panelId) => {
  const updated = {
    ...layoutPreferences,
    panels: {
      ...layoutPreferences.panels,
      [panelId]: { ...layoutPreferences.panels[panelId], visible: !layoutPreferences.panels[panelId].visible }
    }
  }
  setLayoutPreferences(updated)
  saveToDB(updated)
}
```

---

### **2. Movement Pattern Tracking** (`functions/movementPatterns.js`)

Surface pattern volume + muscle fatigue breakdown in S5.

#### **Pattern Definition**
```javascript
// Map exercises to movement patterns
const exerciseToPattern = {
  'squat': 'lower-body-push',
  'deadlift': 'posterior-chain',
  'bench': 'upper-body-push',
  'ohp': 'vertical-push',
  'row': 'horizontal-pull',
  'pull-up': 'vertical-pull',
  'leg-curl': 'knee-flexion',
  'chest-fly': 'horizontal-adduction',
  'leg-press': 'lower-body-push',
  // ... ~30 exercises mapped
}

const patterns = {
  'upper-body-push': { exercises: ['bench', 'ohp', 'incline-press'], muscles: ['chest', 'shoulders', 'triceps'] },
  'upper-body-pull': { exercises: ['row', 'pull-up', 'lat-pulldown'], muscles: ['back', 'biceps'] },
  'horizontal-pull': { exercises: ['row', 'face-pull'], muscles: ['back', 'rear-delts'] },
  'vertical-pull': { exercises: ['pull-up', 'pulldown'], muscles: ['back', 'biceps'] },
  'vertical-push': { exercises: ['ohp', 'dips'], muscles: ['shoulders', 'triceps'] },
  'horizontal-adduction': { exercises: ['chest-fly', 'pec-deck'], muscles: ['chest'] },
  'lower-body-push': { exercises: ['squat', 'leg-press', 'leg-extension'], muscles: ['quads', 'glutes'] },
  'lower-body-pull': { exercises: ['deadlift', 'leg-curl'], muscles: ['hamstrings', 'glutes'] },
  'posterior-chain': { exercises: ['deadlift', 'rdl', 'leg-curl'], muscles: ['hamstrings', 'glutes', 'lower-back'] },
  'knee-flexion': { exercises: ['leg-curl', 'nordic'], muscles: ['hamstrings'] },
  'knee-extension': { exercises: ['leg-extension', 'squat'], muscles: ['quads'] },
  'knee-stability': { exercises: ['split-squat', 'step-up'], muscles: ['quads', 'glutes', 'core'] },
  'core-stability': { exercises: ['plank', 'pallof-press', 'ab-wheel'], muscles: ['core'] },
  'shoulder-health': { exercises: ['face-pull', 'band-pull-apart', 'wall-slides'], muscles: ['rear-delts', 'traps'] }
}
```

#### **Pattern Volume Calculation**
```javascript
function getMovementPatternVolume(athleteId, lookbackDays = 30) {
  const lifts = getLifts(athleteId, lookbackDays)
  
  const patternVolume = {}
  
  for (const lift of lifts) {
    for (const exercise of lift.exercises) {
      const pattern = exerciseToPattern[exercise.name] || 'other'
      if (!patternVolume[pattern]) {
        patternVolume[pattern] = {
          sets: 0,
          reps: 0,
          tonnage: 0,  // total weight × reps
          muscleEmphasis: {},
          sessions: 0
        }
      }
      
      patternVolume[pattern].sets += exercise.sets
      patternVolume[pattern].reps += exercise.sets * exercise.reps
      patternVolume[pattern].tonnage += exercise.weight * exercise.sets * exercise.reps
      patternVolume[pattern].sessions++
      
      // Track which muscles for this pattern
      const patternDef = patterns[pattern]
      if (patternDef) {
        for (const muscle of patternDef.muscles) {
          patternVolume[pattern].muscleEmphasis[muscle] = 
            (patternVolume[pattern].muscleEmphasis[muscle] || 0) + 1
        }
      }
    }
  }
  
  // Sort by tonnage descending
  return Object.entries(patternVolume)
    .map(([pattern, data]) => ({ pattern, ...data }))
    .sort((a, b) => b.tonnage - a.tonnage)
}
```

#### **Pattern + Fatigue Breakdown**
```javascript
function getPatternFatigueBreakdown(athleteId, lookbackDays = 30) {
  const patterns = getMovementPatternVolume(athleteId, lookbackDays)
  const currentFatigue = getCurrentFatigue(athleteId)
  
  return patterns.map(p => ({
    pattern: p.pattern,
    volume: {
      sets: p.sets,
      tonnage: p.tonnage
    },
    muscleContribution: Object.entries(p.muscleEmphasis)
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, count]) => {
        const fatiguePct = (currentFatigue.structural[muscle] || 0) / 100
        return {
          muscle,
          sessionCount: count,
          fatigue: currentFatigue.structural[muscle] || 0,
          fatiguePercent: fatiguePct,
          saturationLevel: fatiguePct > 0.7 ? 'high' : fatiguePct > 0.4 ? 'moderate' : 'low'
        }
      })
  }))
}
```

---

### **3. Quick-Start Templates** (`functions/sessionTemplates.js`)

Pre-load common session skeletons.

#### **Template Definitions**
```javascript
const sessionTemplates = {
  'full-body': {
    name: 'Full Body',
    description: 'One-session full-body workout. 45–60 min.',
    muscleGroups: ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders'],
    baseExercises: [
      { name: 'squat', sets: 3, reps: '5', intensity: 'heavy' },
      { name: 'bench', sets: 3, reps: '5', intensity: 'heavy' },
      { name: 'row', sets: 3, reps: '5', intensity: 'heavy' },
      { name: 'leg-curl', sets: 2, reps: '8–10', intensity: 'moderate' },
      { name: 'lat-pulldown', sets: 2, reps: '8–10', intensity: 'moderate' }
    ],
    estimatedDuration: 60
  },
  
  'upper-lower': {
    name: 'Upper/Lower Split',
    description: 'Two-day split. Generate Upper, then Lower.',
    variants: {
      'upper': {
        muscleGroups: ['chest', 'back', 'shoulders', 'arms'],
        baseExercises: [
          { name: 'bench', sets: 4, reps: '5', intensity: 'heavy' },
          { name: 'row', sets: 4, reps: '5', intensity: 'heavy' },
          { name: 'ohp', sets: 3, reps: '8', intensity: 'moderate' },
          { name: 'pulldown', sets: 3, reps: '8', intensity: 'moderate' }
        ]
      },
      'lower': {
        muscleGroups: ['quads', 'hamstrings', 'glutes', 'core'],
        baseExercises: [
          { name: 'squat', sets: 4, reps: '5', intensity: 'heavy' },
          { name: 'deadlift', sets: 3, reps: '5', intensity: 'heavy' },
          { name: 'leg-press', sets: 3, reps: '8–10', intensity: 'moderate' },
          { name: 'leg-curl', sets: 3, reps: '8–10', intensity: 'moderate' }
        ]
      }
    }
  },
  
  'push-pull-legs': {
    name: 'Push/Pull/Legs',
    description: 'Three-day split. High frequency.',
    variants: {
      'push': { ... },
      'pull': { ... },
      'legs': { ... }
    }
  },
  
  'strength-focus': {
    name: 'Strength Focus',
    description: 'Heavy compound emphasis (1–5 reps). 50–75 min.',
    muscleGroups: ['chest', 'back', 'quads', 'hamstrings', 'glutes'],
    baseExercises: [
      { name: 'squat', sets: 5, reps: '3', intensity: 'heavy' },
      { name: 'bench', sets: 5, reps: '3', intensity: 'heavy' },
      { name: 'deadlift', sets: 3, reps: '3', intensity: 'heavy' },
      { name: 'row', sets: 4, reps: '5', intensity: 'heavy' }
    ]
  },
  
  'hypertrophy-focus': {
    name: 'Hypertrophy Focus',
    description: 'Higher reps (6–12). Volume emphasis. 60–90 min.',
    muscleGroups: ['chest', 'back', 'shoulders', 'arms', 'quads', 'glutes'],
    baseExercises: [
      { name: 'incline-press', sets: 4, reps: '8–10', intensity: 'moderate' },
      { name: 'cable-row', sets: 4, reps: '8–10', intensity: 'moderate' },
      { name: 'leg-press', sets: 4, reps: '8–12', intensity: 'moderate' },
      { name: 'chest-fly', sets: 3, reps: '10–12', intensity: 'light' },
      { name: 'leg-extension', sets: 3, reps: '12', intensity: 'light' }
    ]
  }
}
```

#### **Template Application**
```javascript
function loadTemplate(templateName) {
  const template = sessionTemplates[templateName]
  if (!template) return null
  
  // Return structured session proposal
  return {
    muscleGroups: template.muscleGroups,
    proposedExercises: template.baseExercises,
    estimatedDuration: template.estimatedDuration,
    note: `Loaded from template: ${template.description}`
  }
}
```

---

### **4. Micro-Widgets** (new components in S1)

Small 1–2 unit displays for quick data.

#### **Widget Types**

**Hydration Ring** (1 unit)
```
┌──────────────┐
│ Hydration    │
│              │
│ [◉◯◯◯◯◯] 33% │
│ 2L / 6L      │
│              │
│ [+ Add]      │
└──────────────┘
```
- Track daily water intake (manual or from health app)
- Goal: 6L/day (configurable)
- Color: blue to green as % fills

**RHR Ticker** (1 unit)
```
┌──────────────┐
│ Resting HR   │
│              │
│ 54 bpm       │
│ ↓ −1 bpm     │
│ (vs 7d avg)  │
└──────────────┘
```
- Pull from wearable (Apple Health, Fitbit, etc.)
- 7-day moving average
- Trend indicator (↑ = elevated recovery need, ↓ = recovery good)

**Volume Pace Bar** (2 units)
```
┌────────────────────────────┐
│ Week Volume vs Target       │
│                            │
│ Lifting: [████████░░] 18k  │
│ Target: 20k                │
│                            │
│ Running: [██████░░░░] 35 km│
│ Target: 40 km              │
│                            │
│ Volume Total: 80% of goal   │
└────────────────────────────┘
```
- Compare current week to targets
- Aggregate bar + per-activity breakdown
- Color: green if >80%, yellow if 60–80%, red if <60%

**Muscle Focus Map** (2 units)
```
┌────────────────────────────┐
│ Emphasis (Last 7d)         │
│                            │
│ [Body diagram here]        │
│                            │
│ Top: Chest (18% of volume) │
│       Quads (16%)          │
│       Glutes (14%)         │
│                            │
│ Bottom: Calves (2%)        │
└────────────────────────────┘
```
- Show which muscles got most work this week
- Reuse existing body diagram SVG
- Highlight top 3 by volume

#### **Widget Configuration in Settings**
```
Settings → Dashboard Widgets
═════════════════════════════════

Visible Widgets:
☑ Hydration Ring
☑ RHR Ticker
☑ Volume Pace Bar
☑ Muscle Focus Map

Layout:
[◯◯] = 2-column grid (default)
[◯  ] = 1-column (compact)
[◯◯◯] = 3-column (wide)

[Save] [Reset to Default]
```

---

### **5. Mode Toggle** (#71)

Switch between Tracker, Recommendations, Coach modes (affects S1/S3 density).

#### **Mode Definitions**
```javascript
const modes = {
  'tracker': {
    name: 'Tracker',
    description: 'Minimal recommendations, focus on data logging',
    features: {
      showRecommendations: false,
      showAdaptation: false,
      sessionDetail: 'basic',    // Just exercises + load
      recoveryDetail: 'full'     // All recovery metrics
    },
    layout: {
      'recommendations': { visible: false },
      'adaptation-note': { visible: false },
      'dashboard-overview': { visible: true },
      'weekly-load': { visible: true },
      'fatigue-heatmap': { visible: true }
    }
  },
  
  'recommendations': {
    name: 'Recommendations',
    description: 'Balanced view: data + suggestions',
    features: {
      showRecommendations: true,
      showAdaptation: true,
      sessionDetail: 'full',
      recoveryDetail: 'full'
    },
    layout: {
      'recommendations': { visible: true },
      'adaptation-note': { visible: true },
      'dashboard-overview': { visible: true },
      'weekly-load': { visible: true }
    }
  },
  
  'coach': {
    name: 'Coach',
    description: 'Detailed narratives, step-by-step guidance',
    features: {
      showRecommendations: true,
      showAdaptation: true,
      showCoachingCues: true,
      sessionDetail: 'expert',   // Include alternatives, scaling
      recoveryDetail: 'minimal'  // High-level only
    },
    layout: {
      'recommendations': { visible: true },
      'coaching-guide': { visible: true },
      'dashboard-overview': { visible: false }  // Skip, go straight to detail
    }
  }
}
```

#### **Mode Switcher (S1 Header)**
```
S1 Header
═════════════════════════════════

[Logo] Press

Mode: [Tracker ▼] | [Recommendations] | [Coach]

[Settings]
```

#### **Effect on S3 (Session Gen)**
```
TRACKER MODE:
───────────────
Session for 2026-07-16
├─ Squat 5×5 @ 160kg
├─ Bench 3×8 @ 100kg
├─ Row 4×5 @ 90kg
└─ Leg curl 3×10 @ 50kg

[Generate] [Save]


RECOMMENDATIONS MODE:
───────────────
Recommendation: Upper/Lower split
Rationale: CNS high after yesterday's squat, upper focus today
├─ Bench Press 4×5 @ 100kg (primary)
├─ Lat Pulldown 4×8 @ 90kg
├─ Incline Press 3×8 @ 80kg
├─ Face Pull 3×12 @ 20kg (shoulder health)

Status: Fatigue moderate, sleep good, ready for intensity

[Generate] [Save] [Why This?]


COACH MODE:
───────────────
🎯 Coaching Plan for Upper Day

Your Goal: Build strength in horizontal press patterns.
Why Today: CNS recovering well post-squat. Horizontal pull volume low this week.

Main Lift: Bench Press
├─ Target: 4×5 @ 100kg
├─ Coaching: "Chest up, elbows tucked. Control eccentric (3 sec)."
├─ Scaling: ↑ Add weight if reps feel light. ↓ Drop 5kg if form breaks.
├─ Why: Builds chest stability + tricep lockout

Accessory Progression:
├─ Lat Pulldown: 4×8 @ 90kg (2kg up from last week ✓)
├─ Incline Press: 3×8 @ 80kg (tempo: 3 up, 1 pause, 2 down)

Warmup: 5@60% + 3@85% (auto-loaded)
Expected Time: 65 minutes
Recovery Focus: Shoulder health + CNS reset

[Start Session] [Customize] [See Alternatives]
```

---

## FRONTEND IMPLEMENTATION

### **Layout Management (S1 Settings)**
```
Settings → Dashboard
═════════════════════════════════

Customize Layout (drag to reorder, toggle to hide/show)

[☑] Dashboard Overview       [↑↓ drag]
[☑] Weekly Load             [↑↓ drag]
[☑] Fatigue Heatmap        [↑↓ drag]
[☑] Recommendations         [↑↓ drag]
[☐] Timeline               [↑↓ drag]  (currently hidden)
[☑] Running Dashboard      [↑↓ drag]
[☑] Micro-Widgets          [↑↓ drag]

Column Layout:
[◯◯] 2-column (default)
[◯  ] 1-column
[◯◯◯] 3-column

Theme: [Light] [Dark] [Auto]

[Save Changes] [Reset to Default]
```

### **Micro-Widget Display (S1)**
```
S1 Widget Row (below main panels)
═════════════════════════════════

[Hydration]    [RHR]           [Volume Pace]      [Muscle Focus]
[◉◯◯◯◯] 33%   54 bpm ↓        Lifting: 80%      [Body diagram]
2L / 6L         (stable)        Running: 70%      Chest 18%
                                Overall: 75%      Quads 16%
                                                  Glutes 14%
```

### **Mode Toggle**
```
S1 Top Bar (right side)
═════════════════════════════════

[Tracker] | [Recommendations] | [Coach] | ⚙️

Current: Recommendations
```

---

## TESTING

**Test file:** `test/customization.test.js` (new)

**Assertions (20+):**

1. **Layout preferences** (5 tests)
   - Save panel order (drag-drop simulation)
   - Toggle panel visibility (save/load)
   - Save/load tab list (S1, S3, S5 tabs)
   - Default layout loads on first app open
   - Persist to Firebase, survive reload

2. **Movement patterns** (4 tests)
   - Exercise → pattern mapping correct (squat = lower-body-push, row = horizontal-pull)
   - Pattern volume aggregates sets + tonnage correctly
   - Muscle emphasis breakdown by pattern (which muscles involved)
   - Pattern fatigue integration (muscle fatigue + pattern volume)

3. **Quick-start templates** (4 tests)
   - Load "full-body" template → 5 exercises returned
   - Load "upper/lower" variant "upper" → 4 upper exercises
   - Load "strength-focus" → all exercises heavy (1–5 reps)
   - Load "hypertrophy-focus" → all exercises moderate reps (6–12)

4. **Micro-widgets** (4 tests)
   - Hydration ring: 2L of 6L = 33% (correct calculation)
   - RHR ticker: 7-day moving average calculated
   - Volume pace bar: current vs target percentages
   - Muscle focus map: top 3 muscles by tonnage in past week

5. **Mode toggle** (3 tests)
   - "Tracker" mode: hides recommendations + adaptation
   - "Recommendations" mode: shows all features
   - "Coach" mode: shows coaching guide + detailed cues
   - Mode persists on reload

---

## IMPLEMENTATION CHECKLIST

### **Backend**
- [ ] `functions/layoutPreferences.js` created
  - [ ] Save panel order + visibility
  - [ ] GET/POST `/layout-preferences` endpoints
  
- [ ] `functions/movementPatterns.js` created
  - [ ] `exerciseToPattern` mapping (~30 exercises)
  - [ ] `getMovementPatternVolume(athleteId, days)`
  - [ ] `getPatternFatigueBreakdown(athleteId)`
  
- [ ] `functions/sessionTemplates.js` created
  - [ ] 5 templates (full-body, upper/lower, ppl, strength, hypertrophy)
  - [ ] `loadTemplate(name)` function
  
- [ ] `functions/index.js` extended
  - [ ] GET/POST `/layout-preferences`
  - [ ] GET `/patterns/volume?days=30`
  - [ ] GET `/template/{name}`

### **Frontend**
- [ ] Settings → Dashboard panel
  - [ ] Drag-drop reorder simulation (or library like react-dnd)
  - [ ] Toggle visibility checkboxes
  - [ ] Save/reset buttons
  - [ ] Column layout selector
  
- [ ] Settings → Dashboard Widgets panel
  - [ ] Checkboxes for each widget (hydration, RHR, volume pace, muscle focus)
  - [ ] Layout column selector
  
- [ ] Settings → Mode selector
  - [ ] Radio buttons: Tracker, Recommendations, Coach
  - [ ] Mode description text
  - [ ] Save selection to athlete profile
  
- [ ] S1 micro-widgets section
  - [ ] Hydration ring component (SVG ring + percentage)
  - [ ] RHR ticker component (number + trend arrow)
  - [ ] Volume pace bar component (stacked progress bars)
  - [ ] Muscle focus map component (body diagram + top 3 list)
  - [ ] Conditional render based on `layoutPreferences.panels['micro-widgets'].visible`
  
- [ ] S1 mode toggle (top-right header)
  - [ ] 3 buttons: Tracker, Recommendations, Coach
  - [ ] Active button highlighted
  - [ ] onChange: save to athlete profile, re-render S1/S3 based on mode
  
- [ ] S3 rendering by mode
  - [ ] Tracker: basic exercise list
  - [ ] Recommendations: full detail + rationale
  - [ ] Coach: step-by-step guide + scaling
  
- [ ] Template selector (S3)
  - [ ] Add "Quick-Start Templates" section
  - [ ] Dropdown or cards: Full Body, Upper/Lower, PPL, Strength, Hypertrophy
  - [ ] [Load Template] button → calls GET `/template/{name}`, pre-fills session
  
- [ ] Movement pattern display (S5)
  - [ ] Add "Emphasis" breakdown section
  - [ ] Show pattern volume (tonnage, sets) + fatigue per pattern
  - [ ] List top 3 patterns by volume

### **Testing**
- [ ] `test/customization.test.js` created with 20+ assertions
- [ ] All 20+ tests passing
- [ ] No regressions in Track 1 tests

### **Build**
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## DO NOT

- Don't build #127 (streak badge) — forbidden by PRODUCT.md
- Don't build #134 (modular unit system) — premature, do #15 first
- Don't ask questions — use defaults above
- Don't change Track 1 code
- Don't implement complex animations (keep it simple)

---

## SHIP CRITERIA

✅ Drag-drop panel reorder works  
✅ Panel hide/show toggle persists  
✅ Tab visibility customizable  
✅ Micro-widgets render (all 4: hydration, RHR, volume pace, muscle focus)  
✅ Widgets configurable in Settings  
✅ Mode toggle (Tracker/Recommendations/Coach) functional  
✅ Mode affects S1/S3 density correctly  
✅ Quick-start templates load + pre-fill session  
✅ Movement pattern volume + fatigue breakdown displays in S5  
✅ 20+ tests passing, no regressions  
✅ Build succeeds  
✅ No console errors
