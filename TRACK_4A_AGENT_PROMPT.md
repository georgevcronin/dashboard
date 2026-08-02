# TRACK 4A: Analytics Layer — Timeline, Calendar, Weekly Brief, Deload Detection
## Unified Athlete History + Forecast Scaffolding

**Duration:** 3–4 days  
**Status:** Ready to start immediately. Independent of other tracks.  
**Ship Criteria:** Timeline renders interactive, calendar shows sessions, brief generates, deload surfaces, 30+ tests passing.

---

## OVERVIEW

Build the data infrastructure and UI to show athletes:
1. **Unified Timeline:** All workouts, runs, sleep, nutrition, PRs, injuries in one scrollable feed (chronological)
2. **Training Calendar:** Month/week view showing sessions completed, recovery status, no forecasting yet
3. **Weekly Brief:** AI-generated physiological summary ("adapted to quad focus, CNS recovering well")
4. **Deload Detection:** Surface automatic recommendation when fatigue + stagnation detected
5. **Exercise Cards:** Knowledge base + activation breakdown on hover/click

This is pure observation — no recommendations yet. Track 4B (running metrics) is independent.

---

## ARCHITECTURE

### **1. Timeline Data Model** (new in `functions/`)

Unified event structure across all activity types.

#### **Timeline Event Schema**
```javascript
const timelineEvent = {
  date: '2026-07-16',
  timestamp: 1721088000,
  type: 'workout' | 'run' | 'sleep' | 'nutrition' | 'injury' | 'pr' | 'note',
  
  // Common fields
  sourceActivity: 'lifting' | 'running' | 'sleep' | 'nutrition',
  
  // Workout (type: 'workout')
  workout: {
    sessionId: 'session-abc123',
    muscleGroups: ['chest', 'triceps'],
    exercises: 5,
    sessionStimulusScore: 2100,
    duration: 75,
    load: 'heavy'      // 'light', 'moderate', 'heavy'
  },
  
  // Run (type: 'run')
  run: {
    distance: 10,
    duration: 3600,
    pace: 360,
    avgHR: 165,
    maxHR: 178,
    elevation: 200,
    type: 'threshold'  // 'recovery', 'base', 'long', 'threshold', 'interval'
  },
  
  // Sleep (type: 'sleep')
  sleep: {
    duration: 28800,   // seconds
    quality: 0.85,     // 0–1 from wearable or self-report
    deepSleep: 5400    // seconds
  },
  
  // Nutrition (type: 'nutrition')
  nutrition: {
    calories: 2400,
    protein: 150,      // grams
    carbs: 300,
    fat: 80,
    note: 'Pre-workout meal'
  },
  
  // Injury (type: 'injury')
  injury: {
    muscle: 'shoulder',
    severity: 'mild',  // 'mild', 'moderate', 'severe'
    note: 'Shoulder soreness from bench',
    resolved: false
  },
  
  // PR (type: 'pr')
  pr: {
    exercise: 'squat',
    weight: 200,       // kg
    reps: 5,
    note: 'New 5RM'
  },
  
  // Note (type: 'note')
  note: {
    text: 'Felt strong today, ready for intensity'
  }
}
```

#### **Timeline Event Collection Function**
```javascript
function getTimelineEvents(athleteId, startDate, endDate, limit = 100) {
  // Collect from all sources:
  // 1. lifts[] from athlete doc
  // 2. runs[] from Strava sync
  // 3. sleep[] from wearable (if available)
  // 4. nutrition[] from manual entry or health API
  // 5. injuries[] from athlete doc
  // 6. prs[] extracted from lift history
  // 7. notes[] from athlete doc
  
  // Merge, sort by date DESC, apply limit
  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}
```

---

### **2. Training Calendar Model** (new in `functions/`)

Renders month/week view with session indicators.

#### **Calendar Event Schema**
```javascript
const calendarDay = {
  date: '2026-07-16',
  dayOfWeek: 'Wednesday',
  
  // Sessions scheduled/completed
  sessions: [
    {
      type: 'lifting',
      sessionId: 'session-abc',
      muscleGroups: ['chest', 'triceps'],
      completed: true,
      load: 'heavy',
      stimulusScore: 2100
    },
    {
      type: 'running',
      completed: false,
      planned: { distance: 10, pace: 'conversational' }
    }
  ],
  
  // Recovery status
  recoveryStatus: {
    sleepQuality: 'good',      // 'poor', 'fair', 'good', 'excellent'
    fatigueLevel: 'moderate',  // 'low', 'moderate', 'high'
    readiness: 0.72            // 0–1
  },
  
  // Flags
  isRestDay: false,
  isDeloadDay: false,
  isPeakDay: false,
  injuries: []
}
```

#### **Calendar View Function**
```javascript
function getCalendarView(athleteId, year, month) {
  // Generate 28–31 calendarDay objects for the month
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1)
    return buildCalendarDay(athleteId, date)
  })
  
  return {
    year,
    month,
    days,
    summary: {
      totalSessions: 18,
      liftingSessions: 8,
      runningSessions: 8,
      sportsSessions: 2,
      restDays: 2,
      averageFatigue: 0.58
    }
  }
}
```

---

### **3. Weekly Brief Engine** (new in `functions/`)

Generates short physiological summary using Gemini (existing integration).

#### **Brief Generation**
```javascript
async function generateWeeklyBrief(athleteId, year, week) {
  // Collect data for past 7 days
  const weekData = {
    liftingLoad: 15600,        // total stimulus score
    runningVolume: 52,         // km
    averageSleep: 7.2,         // hours
    averageSleepQuality: 0.82, // 0–1
    currentFatigue: {
      cns: 68,
      structural: 55,
      cardiovascular: 62
    },
    muscleEmphasis: ['chest', 'quads'],
    injuries: [],
    prs: 1,
    missedSessions: 2
  }
  
  // Craft prompt for Gemini
  const prompt = `
    Weekly athlete brief based on:
    - Lifting: ${weekData.liftingLoad} stimulus, emphasis on ${weekData.muscleEmphasis.join(', ')}
    - Running: ${weekData.runningVolume} km
    - Sleep: ${weekData.averageSleep}h/night, quality ${(weekData.averageSleepQuality * 100).toFixed(0)}%
    - Fatigue: CNS ${weekData.currentFatigue.cns}/100, structural ${weekData.currentFatigue.structural}/100
    - PRs: ${weekData.prs}, missed sessions: ${weekData.missedSessions}
    
    Generate a 2–3 sentence physiological assessment. Be specific (mention the emphasized muscles, fatigue trend, recovery status). Avoid generic praise.
    Example: "Adapted well to quad-focused week; CNS elevated but trending down, ready for intensity. Sleep quality strong despite volume. Watch connective tissue on next long run."
  `
  
  const brief = await callGemini(prompt)
  
  return {
    week,
    year,
    generatedAt: new Date(),
    brief,
    confidence: 0.85  // based on data completeness
  }
}
```

#### **Gemini Integration**
- Use existing `functions/geminiService.js` or equivalent
- Rate-limit: 1 brief per week (cache if requested same week twice)
- Fallback: if Gemini unavailable, return templated brief: "Training volume moderate. Recovery adequate. Monitor CNS for next cycle."

---

### **4. Deload Detection** (extend existing `functions/progression.js`)

Audit current deload logic, surface recommendation when criteria met.

#### **Deload Detection Logic**
```javascript
function detectDeloadNeeded(athleteId, lookbackDays = 28) {
  const recent = getRecentData(athleteId, lookbackDays)
  
  // Multiple criteria (need 2+ to flag)
  const criteria = {
    highFatigueTrend: recent.fatigueAverage > 75,              // CNS + structural high
    volumeStagnation: recent.prLastOccurred > 14,              // No PR in 2+ weeks
    sleepDeprivation: recent.sleepQuality < 0.7,               // Consistent poor sleep
    highMissedSessions: recent.missedSessionsRatio > 0.2,      // >20% sessions skipped
    injuryPresent: recent.activeInjuries.length > 0            // Ongoing pain
  }
  
  const criteriaCount = Object.values(criteria).filter(Boolean).length
  
  if (criteriaCount >= 2) {
    return {
      recommended: true,
      criteria: Object.entries(criteria)
        .filter(([_, v]) => v)
        .map(([k, _]) => k),
      suggestion: `Deload recommended: ${criteria.highFatigueTrend ? 'fatigue trending high' : ''}, ${criteria.volumeStagnation ? 'volume plateau detected' : ''}.`,
      deloadDuration: 'next 3–7 days',
      whatToReduce: ['intensity', 'volume'],
      keepWhat: ['technique work', 'mobility']
    }
  }
  
  return { recommended: false }
}
```

#### **Deload Recommendation Display (S5)**
```
Deload Recommendation (optional, only shows if needed)
═══════════════════════════════════════════════════
Criteria Detected:
  ✓ High CNS fatigue (78/100, trending up)
  ✓ Volume plateau (no PR in 16 days)
  
Suggestion: Take a 3–7 day deload
  • Reduce intensity: Stay in Z2 for runs, use 60–70% 1RM for lifts
  • Reduce volume: 50% of normal sessions
  • Keep: Technique work, mobility, 1–2 light sessions/week
  
Recovery Expected: 3–4 days for full bounce-back
[Accept Deload] [Dismiss] [Learn More]
```

---

### **5. Exercise Knowledge Cards** (new component)

Hover/click on exercise in S3 → show modal with:

#### **Card Structure**
```javascript
const exerciseCard = {
  exercise: 'squat',
  aliases: ['back squat', 'barbell squat'],
  
  // Summary
  summary: 'Primary leg strength exercise. Builds quads, glutes, hamstrings. Heavy compound movement.',
  
  // Purpose
  purpose: 'Build lower body strength, power, muscle.',
  
  // Muscle Activation
  muscleActivation: {
    primary: ['quads', 'glutes', 'hamstrings'],
    secondary: ['lower back', 'core'],
    stabilizers: ['hip flexors', 'adductors']
  },
  
  // Activation Chart (visual)
  activationByMuscle: {
    quads: 95,
    glutes: 90,
    hamstrings: 80,
    lowerBack: 60,
    core: 55
  },
  
  // Coaching Cues
  coachingCues: [
    'Chest up, core tight',
    'Elbows back and under bar',
    'Break at knees and hips simultaneously',
    'Drive through heels',
    'Full depth: hip crease below knee'
  ],
  
  // Regressions/Progressions
  regressions: ['goblet squat', 'leg press', 'smith machine squat'],
  progressions: ['pause squat', 'tempo squat', 'front squat', 'competition squat'],
  
  // Common Mistakes
  commonMistakes: [
    'Knees caving inward',
    'Chest collapse on ascent',
    'Heels coming off ground',
    'Partial range (high-box squat w/o full depth)'
  ],
  
  // Evidence Links (optional)
  evidence: [
    { title: 'Squat EMG Analysis', url: 'https://...' },
    { title: 'Squat Programming Guide', url: 'https://...' }
  ]
}
```

#### **Data Source**
- Store exercise cards in `functions/exerciseKnowledge.js` (static data, or sync from external DB)
- Include ~30 common exercises (squat, bench, deadlift, ohp, row, pull-up, leg press, leg curl, leg extension, chest press, chest fly, lat pulldown, cable row, dumbbell press, dumbbell row, dumbbell fly, dumbbell curl, dumbbell extension, barbell curl, barbell extension, etc.)

#### **UI Modal (S3)**
When user clicks exercise in session preview:
```
┌──────────────────────────────────────────┐
│ Squat                                    │
│                                          │
│ Purpose: Build lower body strength       │
│                                          │
│ Muscle Activation Chart:                 │
│ ├─ Quads: ████████████░░░ 95%            │
│ ├─ Glutes: ███████████░░░░ 90%           │
│ └─ Hamstrings: ████████░░░░░░░ 80%       │
│                                          │
│ Coaching Cues:                           │
│ • Chest up, core tight                   │
│ • Elbows back and under bar              │
│ • Full depth required                    │
│                                          │
│ [Close] [Evidence Links] [Regressions]   │
└──────────────────────────────────────────┘
```

---

## FRONTEND IMPLEMENTATION

### **S1: Timeline Section** (new or expand existing)

Add scrollable feed showing last 30 days:
```
S1 > Timeline (new tab or expand Recent)
═══════════════════════════════════════════════════

Today (Wed, Jul 16)
├─ Squat: 5×5 @ 160kg, CNS +12
├─ Bench: 3×8 @ 100kg, Chest +18
├─ Sleep: 7h 45m, quality 85%
└─ Note: "Strong session, ready for intensity"

Yesterday (Tue, Jul 15)
├─ 10k Run: 36:30 (Z4), HR avg 165
├─ Sleep: 7h 2m, quality 72%
└─ Injury note: Shoulder soreness (resolved)

July 14 (Sun)
├─ REST DAY
└─ Sleep: 8h 15m, quality 92%

[Load more]
```

**Interaction:**
- Click date to expand/collapse details
- Click exercise to show knowledge card modal
- Scroll down to load older entries
- Filter by type (workouts only, sleep only, etc.) [optional for MVP]

---

### **S1/S2: Training Calendar** (new section or modal)

Add month/week toggle:
```
S1 > Calendar (new tab)
═══════════════════════════════════════════════════

July 2026 (Month View)

Sun    Mon    Tue    Wed    Thu    Fri    Sat
       1      2      3      4      5      6
       🏋️     🏃     🏋️     🏋️     🏃     🏋️     ⭕
              
7      8      9     10     11     12     13
🏃     🏋️     🏋️     🏋️     🏃     🏋️     ⭕
(CNS↑) (OK)   (OK)   (OK)  (CNS↑) (OK)  (Rest)

14     15     16     17     18     19     20
🏋️     🏃     🏋️     🏋️     🏃     🏋️     ⭕
(OK)  (OK)   (Today)(Sched)(Sched)(Sched)(Rest)

Legend: 🏋️ = Lifting, 🏃 = Running, ⭕ = Rest, ↑ = Elevated CNS

[Week View] [Today]
```

**Week View:**
```
Week of Jul 14
═══════════════════════════════════════════════════

Mon 14:  🏋️ Squat 2100 stim | 🏃 10k easy
         Sleep: 7h 45m | Readiness: 76%

Tue 15:  🏃 10k threshold (Z4) | 🏋️ Bench 1800 stim
         Sleep: 7h 2m | Readiness: 72%

Wed 16:  🏋️ Squat + Bench mix | 
         Sleep: pending | Readiness: 82%

[Show Details] [View Timeline]
```

---

### **S1: Weekly Brief** (new widget or expansion)

```
Weekly Physiological Brief (Jul 8–14)
═══════════════════════════════════════════════════

Generated: Adapted well to quad-focused week; CNS elevated but 
trending down, ready for intensity. Sleep quality strong despite 
18 sessions. Watch connective tissue on next long run—trail 
running this week pushed harder than usual.

Data Summary:
├─ Volume: 15.6k stimulus, 51 km running
├─ Sleep: 7.2h/night, 84% quality
├─ Fatigue: CNS ↓, struct stable, cardio ↑
├─ PRs: 1 (squat 160×5)
└─ Missed: 1 session (schedule conflict)

[Refresh] [Details]
```

---

### **S5: Deload Recommendation** (conditional display)

Only shows if `detectDeloadNeeded()` returns true:
```
⚠️ Deload Recommended
═══════════════════════════════════════════════════

Criteria:
  ✓ CNS fatigue: 78/100 (high)
  ✓ No PR in 16 days (stagnation)

Suggested 3–7 day deload:
  • Intensity: 60–70% 1RM on lifts, Z2 only for runs
  • Volume: 50% reduction (2–3 light sessions/week)
  • Keep: Technique, mobility, form focus

Expected recovery: 3–4 days to peak readiness

[Start Deload] [Dismiss] [Why Deload?]
```

---

## BACKEND IMPLEMENTATION

### **Firestore Collections/Docs**

Extend existing structure:

```
athletes/{athleteId}/
├─ profile (existing, add timelineEvents field if needed)
├─ lifts[] (existing)
├─ runs[] (from Strava sync, existing)
├─ sleep[] (wearable or manual entry, new)
├─ nutrition[] (manual entry, new)
├─ injuries[] (manual entry, new)
├─ prs[] (extracted from lifts, new)
└─ notes[] (timeline notes, new)
```

### **API Endpoints (functions/index.js)**

```javascript
// GET /timeline?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=100
app.get('/timeline', async (req, res) => {
  const events = getTimelineEvents(req.user.uid, req.query.start, req.query.end, req.query.limit)
  res.json(events)
})

// GET /calendar?year=2026&month=7
app.get('/calendar', async (req, res) => {
  const calendar = getCalendarView(req.user.uid, req.query.year, req.query.month)
  res.json(calendar)
})

// GET /brief?year=2026&week=29
app.get('/brief', async (req, res) => {
  const brief = await generateWeeklyBrief(req.user.uid, req.query.year, req.query.week)
  res.json(brief)
})

// GET /deload-check
app.get('/deload-check', async (req, res) => {
  const deload = detectDeloadNeeded(req.user.uid)
  res.json(deload)
})

// GET /exercise-knowledge/{exerciseName}
app.get('/exercise-knowledge/:name', (req, res) => {
  const card = getExerciseCard(req.params.name)
  res.json(card)
})

// POST /timeline/event (add manual event)
app.post('/timeline/event', async (req, res) => {
  const event = req.body
  await db.collection('athletes').doc(req.user.uid).collection('events').add({
    ...event,
    timestamp: Date.now()
  })
  res.json({ success: true })
})
```

---

## TESTING

**Test file:** `test/analytics.test.js` (new)

**Assertions (30+):**

1. **Timeline collection** (6 tests)
   - Merges lifts + runs + sleep + nutrition + injuries
   - Sorts by date descending
   - Limit parameter works (returns ≤ limit items)
   - Date range filter works (only items between start/end)
   - Each event has required fields (date, type, sourceActivity)
   - PR extraction works (squat 160×5 appears as type 'pr')

2. **Calendar view** (8 tests)
   - Generates 28–31 days for a month
   - Each day has sessions[], recoveryStatus, flags
   - Sessions link back to actual lifts/runs
   - Recovery status calculated from sleep + fatigue
   - Rest days identified correctly (flag `isRestDay = true`)
   - Month summary counts sessions by type
   - Readiness (0–1) calculated from fatigue + sleep
   - Year/month boundaries handled (June → July transition)

3. **Weekly brief generation** (6 tests)
   - Collects data for 7-day window
   - Calls Gemini API with correct prompt
   - Returns brief text + confidence score
   - Caching works (same week requested twice = cached response)
   - Fallback templated brief if Gemini unavailable
   - Brief mentions emphasized muscles + CNS status + sleep quality

4. **Deload detection** (6 tests)
   - Flags when CNS > 75 AND no PR in 2+ weeks
   - Flags when sleep quality < 0.7 AND volume high
   - Flags when >20% sessions missed AND fatigue high
   - Requires 2+ criteria to recommend (not 1)
   - Returns `recommended: true` + list of matching criteria
   - Deload suggestion text includes specific reasons

5. **Exercise cards** (4 tests)
   - Card for squat has all required fields (purpose, cues, muscles)
   - Activation chart sums to 100% across primary muscles
   - Progressions/regressions list valid exercises
   - Evidence links (if any) are valid URLs

---

## IMPLEMENTATION CHECKLIST

### **Backend**
- [ ] `functions/timelineService.js` created
  - [ ] `getTimelineEvents(athleteId, start, end, limit)`
  - [ ] Merge lifts + runs + sleep + nutrition + injuries + notes
  - [ ] Sort by date DESC
  
- [ ] `functions/calendarService.js` created
  - [ ] `getCalendarView(athleteId, year, month)`
  - [ ] Generate 28–31 `calendarDay` objects
  - [ ] Calculate recovery status + readiness per day
  
- [ ] `functions/briefService.js` created
  - [ ] `generateWeeklyBrief(athleteId, year, week)`
  - [ ] Collect 7-day data (lift load, run volume, sleep, fatigue)
  - [ ] Call Gemini with crafted prompt
  - [ ] Cache response for same week
  
- [ ] `functions/deloadService.js` created (or extend `functions/progression.js`)
  - [ ] `detectDeloadNeeded(athleteId, lookbackDays)`
  - [ ] Check 5 criteria (fatigue, PR stagnation, sleep, missed sessions, injuries)
  - [ ] Return recommendation if 2+ criteria met
  
- [ ] `functions/exerciseKnowledge.js` created
  - [ ] Static data for 30+ exercises (squat, bench, deadlift, ohp, row, pull-up, etc.)
  - [ ] Each exercise: summary, purpose, muscleActivation, coachingCues, regressions, progressions, evidence
  - [ ] `getExerciseCard(exerciseName)` function
  
- [ ] `functions/index.js` extended
  - [ ] GET `/timeline` endpoint
  - [ ] GET `/calendar` endpoint
  - [ ] GET `/brief` endpoint
  - [ ] GET `/deload-check` endpoint
  - [ ] GET `/exercise-knowledge/:name` endpoint
  - [ ] POST `/timeline/event` endpoint

### **Frontend**
- [ ] S1 timeline section
  - [ ] Fetch `/timeline` on component mount
  - [ ] Render scrollable feed (last 30 days default)
  - [ ] Click exercise → show knowledge card modal
  - [ ] Click date → expand/collapse day details
  - [ ] "Load more" button at bottom
  
- [ ] S1/S2 calendar section
  - [ ] Fetch `/calendar` for current month
  - [ ] Month view with day grid
  - [ ] Week view toggle with readiness/session details
  - [ ] Clicking day → show detailed log
  
- [ ] S1 weekly brief widget
  - [ ] Fetch `/brief` for current week on mount
  - [ ] Display brief text + data summary
  - [ ] "Refresh" button to re-fetch
  - [ ] Show generated timestamp
  
- [ ] S5 deload recommendation (conditional)
  - [ ] Fetch `/deload-check` on mount
  - [ ] Show banner only if `recommended: true`
  - [ ] Display criteria + suggestion + recovery timeline
  - [ ] [Start Deload] button (optional for MVP)
  
- [ ] Exercise knowledge modal
  - [ ] Trigger on exercise click in S3
  - [ ] Fetch `/exercise-knowledge/{name}`
  - [ ] Display purpose, muscle chart, cues, progressions
  - [ ] Show evidence links (if available)

### **Testing**
- [ ] `test/analytics.test.js` created with 30+ assertions
- [ ] All tests passing
- [ ] No regressions in Track 1 tests

### **Build**
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (node --test + jest)

---

## DO NOT

- Don't build forecasting (Track 4 decision pending) or race planning yet
- Don't build tapering UI (#84) or interference detection (#103)
- Don't ask questions about data sources — use existing patterns (lifts[], runs[] from Strava)
- Don't implement detailed sport-specific metrics — save for Track 4B
- Don't change Track 1 code

---

## SHIP CRITERIA

✅ Timeline renders 30+ events, scrollable  
✅ Calendar month view shows 28–31 days with session icons + readiness  
✅ Calendar week view shows detailed load + sleep  
✅ Weekly brief generates + displays correctly  
✅ Deload recommendation surfaces when criteria met  
✅ Exercise knowledge cards display on click with all required fields  
✅ 30+ tests passing  
✅ No console errors  
✅ Build succeeds
