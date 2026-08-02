# TRACK 3: Onboarding Redesign + Profile System
## Multi-Goal, Multi-Activity Athlete Setup

**Duration:** 5–7 days  
**Status:** Ready to start immediately. Depends on Track 1 #39 (equipment availability) — already merged.  
**Ship Criteria:** Onboarding flow works end-to-end, profile schema updated, settings editor functional, tests passing.

---

## OVERVIEW

Replace the current minimal onboarding with a comprehensive 5-step wizard that captures:
- Multiple training goals (strength, hypertrophy, endurance, power, mobility)
- Primary/secondary activities (Strength, Running, Hybrid, Team Sports, CrossFit)
- Equipment availability (set during Track 1 #39; finalize UI here)
- Muscle prioritization (drill down from body regions to specific muscles)
- Onboarding summary before entering app

The profile editor in Settings should expose all these choices in one place, not scattered across panels.

---

## ARCHITECTURE

### **1. Athlete Profile Schema** (extend `functions/userDoc.js`)

Current structure has basic fields. Extend with:

```javascript
const athleteProfile = {
  // Existing fields (preserve these)
  name: 'George',
  email: 'george@example.com',
  
  // NEW: Training goals (multi-select)
  goals: [
    'strength',       // Barbell lifts, 1–5 reps
    'hypertrophy',    // Building muscle, 6–12 reps
    // 'endurance',   // Cardio, distance, time under tension
    // 'power',       // Explosive movements, Olympic lifts
    // 'mobility',    // Flexibility, ROM, injury prevention
  ],
  
  // NEW: Primary/secondary activity split
  primaryActivity: 'strength',      // 'strength', 'running', 'hybrid', 'sports', 'crossfit'
  secondaryActivity: 'running',     // or null
  tertiaryActivity: null,
  
  // NEW: Equipment available (set in Track 1 #39; finalize here)
  equipmentAvailable: ['barbell', 'dumbbell', 'cable', 'machine'],
  
  // NEW: Muscle priorities (custom weighting for recommendations)
  musclePriorities: {
    // Each muscle can be: 'focus', 'baseline', or 'avoid'
    chest: 'focus',
    back: 'focus',
    shoulders: 'baseline',
    biceps: 'avoid',  // shoulder issue
    triceps: 'baseline',
    quads: 'focus',
    hamstrings: 'focus',
    glutes: 'focus',
    calves: 'baseline',
    traps: 'baseline',
    forearms: 'avoid'
  },
  
  // NEW: Weekly targets (drive session allocation in Track 2)
  weeklyTargets: {
    lifting: { sessionsPerWeek: 4, avgSessionScore: 2000 },
    running: { sessionsPerWeek: 3, avgSessionDistance: 10 },
    sports: { sessionsPerWeek: 1 }
  },
  
  // NEW: Activity-specific preferences
  activityPreferences: {
    lifting: {
      splitPreference: 'upper/lower',  // or 'push/pull/legs', 'full-body', 'ppl'
      intensity: 'moderate',            // 'light', 'moderate', 'high'
      sessionDuration: 60                // minutes
    },
    running: {
      pace: 'conversational',            // 'easy', 'conversational', 'hard'
      surface: 'road',                   // 'road', 'trail', 'track', 'treadmill'
      weeklyDistance: 25                 // km
    }
  },
  
  // Existing fields (keep)
  recentLifts: [...],
  fatigueHistory: {...},
  recommendations: {...}
}
```

#### Defaults by Activity Type
When user selects primary activity, set smart defaults:

| Primary Activity | Goals | Weekly Targets | Session Duration |
|---|---|---|---|
| **Strength** | strength, power | 4 lifts/week @2000 | 60–90 min |
| **Running** | endurance, mobility | 4–5 runs/week | 30–60 min |
| **Hybrid** | strength, endurance, mobility | 3 lifts + 3 runs | 45–60 min per session |
| **Team Sports** | power, mobility, endurance | 2 sports/week + 2 lifts | 60–90 min |
| **CrossFit** | strength, power, endurance | 5 sessions/week | 60 min |

---

### **2. Onboarding Wizard** (new component in `src/app.jsx`)

5-step flow, no skipping, no going back (once submitted, show summary before entering app).

#### **Step 1: Welcome + Quick Baseline**
```
┌─────────────────────────────────────────┐
│ Welcome to Press                        │
│                                         │
│ Train any sport. Get stronger.          │
│                                         │
│ What's your experience level?           │
│ ○ Complete beginner (0–6 months)        │
│ ○ Some training (6–24 months)           │
│ ○ Experienced (2+ years)                │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Storage:** `athleteProfile.experienceLevel = 'some_training'`

---

#### **Step 2: Training Goals** (multi-select)
```
┌─────────────────────────────────────────┐
│ What are your training goals?           │
│ (select all that apply)                 │
│                                         │
│ ☑ Build Strength                        │
│ ☑ Build Muscle                          │
│ ☐ Improve Endurance                     │
│ ☐ Build Power & Speed                   │
│ ☐ Improve Flexibility & Mobility        │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Logic:**
- Always require ≥1 goal selected
- If 3+ goals, preview what that means: "Balanced athlete — ~equal time to strength + endurance work"
- If only 1 goal, confirm specialization: "Specialized strength athlete — we'll prioritize heavy lifts"

**Storage:** `athleteProfile.goals = ['strength', 'hypertrophy']`

---

#### **Step 3: Primary Activity**
```
┌─────────────────────────────────────────┐
│ What's your primary training focus?     │
│                                         │
│ ○ Strength (Barbell, dumbbells)         │
│ ○ Running (Road, trail, track)          │
│ ○ Hybrid (Both lifting + running)       │
│ ○ Team Sports (Soccer, basketball)      │
│ ○ CrossFit (Multi-modal fitness)        │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Post-selection (same screen, slide right):**
```
┌─────────────────────────────────────────┐
│ Do you also train in other activities?  │
│                                         │
│ ☐ Running (secondary)                   │
│ ☐ Sports (secondary)                    │
│ ☐ CrossFit (secondary)                  │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Logic:**
- Primary is required
- Secondary/tertiary are optional
- Auto-set `weeklyTargets` based on selection (see defaults table above)
- Update `activityPreferences` defaults

**Storage:**
```javascript
athleteProfile.primaryActivity = 'strength'
athleteProfile.secondaryActivity = 'running'
athleteProfile.tertiaryActivity = null
```

---

#### **Step 4: Equipment Availability** (from Track 1 #39)
```
┌─────────────────────────────────────────┐
│ What equipment do you have?             │
│ (select all that apply)                 │
│                                         │
│ ☑ Barbell (squat rack, bench)          │
│ ☑ Dumbbells                             │
│ ☑ Cable machine                         │
│ ☑ Weight machine (leg press, etc.)      │
│ ☐ Smith machine                         │
│ ☑ Bodyweight only (no equipment)        │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Logic:**
- "Bodyweight only" is mutually exclusive (if selected, unselect all others)
- If barbell + dumbbell selected, assume full gym access
- If none selected, require at least one option

**Storage:** `athleteProfile.equipmentAvailable = ['barbell', 'dumbbell', 'cable', 'machine']`

---

#### **Step 5: Muscle Prioritization** (body diagram drill-down)
```
┌─────────────────────────────────────────┐
│ Which muscles need the most focus?      │
│                                         │
│ [Body diagram here — interactive SVG]   │
│                                         │
│ Click a muscle group to set priority:   │
│                                         │
│ Chest: ◯ Avoid   ◉ Baseline   ○ Focus  │
│ Quads: ○ Avoid   ◯ Baseline   ◉ Focus  │
│                                         │
│ [Continue →]                            │
└─────────────────────────────────────────┘
```

**Interaction:**
- Show interactive SVG body diagram (reuse existing body-*.svg)
- Click a region (chest, back, shoulders, etc.) to expand options
- 3 choices per region: Avoid | Baseline | Focus
- Highlight selected regions on diagram (e.g., Focus = bright color, Avoid = grayed)
- Default: all "Baseline" unless user changes

**Storage:**
```javascript
athleteProfile.musclePriorities = {
  chest: 'focus',
  back: 'focus',
  shoulders: 'baseline',
  biceps: 'avoid',
  triceps: 'baseline',
  quads: 'focus',
  hamstrings: 'focus',
  glutes: 'focus',
  calves: 'baseline',
  traps: 'baseline',
  forearms: 'avoid'
}
```

---

#### **Summary Screen** (before entering app)
```
┌─────────────────────────────────────────┐
│ Your Profile Summary                    │
│                                         │
│ ✓ Experience: Some training             │
│ ✓ Goals: Strength, Hypertrophy          │
│ ✓ Primary: Strength (4 sessions/week)   │
│ ✓ Secondary: Running (3 sessions/week)  │
│ ✓ Equipment: Barbell, dumbbell, cable   │
│ ✓ Focus muscles: Chest, Quads, Glutes   │
│                                         │
│ [Edit Profile] [Enter App →]            │
└─────────────────────────────────────────┘
```

**[Edit Profile]** restarts wizard from step 1.  
**[Enter App →]** closes wizard, saves profile, shows main dashboard.

---

### **3. Settings Profile Editor** (unified panel in `src/app.jsx`)

Add new Settings section called "Profile" that mirrors wizard steps but editable:

```
Settings → Profile (new)

Experience Level: [Dropdown: Beginner, Some training, Experienced]

Training Goals: [Checkboxes: Strength, Hypertrophy, Endurance, Power, Mobility]

Primary Activity: [Radio: Strength, Running, Hybrid, Sports, CrossFit]
Secondary Activity: [Dropdown: None, Running, Sports, CrossFit]

Equipment Available: [Checkboxes: Barbell, Dumbbell, Cable, Machine, Smith, Bodyweight]

Muscle Priorities: [Click body diagram → select priority per muscle]

Weekly Targets:
├─ Lifting Sessions: [Input field] / week
├─ Avg Session Load: [Input field] stimulus
├─ Running Sessions: [Input field] / week
├─ Avg Run Distance: [Input field] km

Activity Preferences:
├─ Lifting Split: [Dropdown: Upper/Lower, Push/Pull/Legs, Full Body]
├─ Running Pace: [Dropdown: Easy, Conversational, Hard]

[Save Changes] [Cancel]
```

**Logic:**
- All fields editable
- Validate before save (require ≥1 goal, ≥1 activity, ≥1 equipment type)
- Show confirmation: "Changes saved. Recommendations will update on next refresh."
- Diff against previous profile; if major fields changed (primary activity, goals), note in changelog

---

### **4. Frontend State & Lifecycle**

#### **Onboarding Detection:**
```javascript
// In app.jsx, on first render or after login:
if (!athlete.goals || !athlete.primaryActivity) {
  // Show onboarding wizard
  showOnboardingWizard = true
} else {
  // Show normal dashboard
  showOnboardingWizard = false
}
```

#### **Profile Persistence:**
```javascript
// On step completion or summary screen [Enter App]:
await fetch('/profile', {
  method: 'POST',
  body: JSON.stringify({
    goals,
    primaryActivity,
    secondaryActivity,
    equipmentAvailable,
    musclePriorities,
    weeklyTargets,
    activityPreferences
  })
})
```

#### **Settings → Profile Save:**
```javascript
// On [Save Changes] in Settings:
await fetch('/profile', {
  method: 'POST',
  body: JSON.stringify(updatedProfile)
})

// Update frontend state
setAthlete(updatedProfile)

// Trigger re-computation of:
// - sessionPlanner (new equipment may allow new exercises)
// - Track 2 engines (weights change based on new primary activity)
// - Track 4 running recommendations (if now tracking running)
```

---

## TESTING

**Test file:** `test/onboarding.test.jsx` (new)

**Assertions (40+):**

1. **Wizard flow** (8 tests)
   - Step 1 → Step 2 transitions correctly
   - Step 2 requires ≥1 goal (disable Continue button if 0 selected)
   - Step 3 accepts primary activity
   - Step 4 multi-selects equipment (bodyweight locks others)
   - Step 5 body diagram clickable, priorities storable
   - Summary shows correct values from all steps
   - [Edit] button restarts wizard
   - [Enter App] closes wizard + saves profile

2. **Profile schema** (8 tests)
   - `goals` is array, accepts 'strength', 'hypertrophy', 'endurance', 'power', 'mobility'
   - `primaryActivity` required, accepts 5 options
   - `secondaryActivity` optional, nullish or valid activity
   - `equipmentAvailable` array, accepts equipment types
   - `musclePriorities` dict with all 10+ muscles, values are 'focus'/'baseline'/'avoid'
   - `weeklyTargets` has structure {lifting: {sessionsPerWeek, avgSessionScore}, ...}
   - `activityPreferences` nested with lifting/running sub-objects
   - Schema update doesn't break existing profiles (backwards compatible)

3. **Settings editor** (8 tests)
   - Renders all fields from profile schema
   - Edits persist on [Save]
   - Validation: require ≥1 goal, ≥1 activity
   - Validation: equipment multi-select functional
   - Validation: bodyweight locks other equipment
   - Confirm message shows on save
   - Cancel button resets form to previous values
   - Editing goals updates summary text (e.g., "Strength + Endurance athlete")

4. **Defaults** (8 tests)
   - Selecting "Strength" as primary → sets `weeklyTargets.lifting = {4, 2000}`
   - Selecting "Running" as primary → sets `weeklyTargets.running = {4–5, 25km}`
   - Selecting "Hybrid" → sets both lifting (3) + running (3)
   - Selecting "CrossFit" → sets single target (5 sessions)
   - Multi-goal selection → preview text updates
   - Body diagram initial state: all muscles "baseline"
   - Equipment defaults empty until user selects

5. **Integration** (8 tests)
   - Onboarding wizard shows when `athlete.goals` missing
   - Onboarding wizard hides when goals + primary activity present
   - Profile save triggers `/profile` POST with correct payload
   - `/profile` POST updates athlete state in app.jsx
   - Settings Profile editor pulls current values from athlete
   - Equipment availability passed to sessionPlanner (verify Track 1 #39)
   - Goals influence recommendations (high hypertrophy goal → suggest higher reps)
   - Primary activity influences allocation engine (from Track 2)

---

## IMPLEMENTATION CHECKLIST

### **Backend (functions/)**
- [ ] `functions/userDoc.js` extended
  - [ ] Add `goals` array field
  - [ ] Add `primaryActivity`, `secondaryActivity`, `tertiaryActivity` fields
  - [ ] Add `equipmentAvailable` array field (from Track 1 #39)
  - [ ] Add `musclePriorities` object
  - [ ] Add `weeklyTargets` object
  - [ ] Add `activityPreferences` object
  - [ ] Set schema defaults (all "baseline" for muscles, empty for others)
  - [ ] Migration: existing profiles get sensible defaults

- [ ] `functions/index.js` `/profile` endpoint
  - [ ] Accept POST with new fields
  - [ ] Validate: ≥1 goal, ≥1 activity, ≥1 equipment
  - [ ] Apply smart defaults (from table above)
  - [ ] Save to Firestore
  - [ ] Return updated athlete object

### **Frontend (src/app.jsx)**
- [ ] Add `showOnboardingWizard` state
- [ ] Add onboarding wizard component
  - [ ] Step 1: Experience level (radio)
  - [ ] Step 2: Goals (checkboxes, min 1)
  - [ ] Step 3: Primary activity + optionals (radio + checkboxes)
  - [ ] Step 4: Equipment (checkboxes, bodyweight locks others)
  - [ ] Step 5: Muscle priorities (body diagram, 3-state toggles)
  - [ ] Summary screen (display all choices)
  - [ ] [Edit] restarts from step 1
  - [ ] [Enter App] closes wizard, saves profile, updates athlete state

- [ ] Add Settings → Profile section
  - [ ] All fields from schema (mirroring wizard)
  - [ ] Render current athlete values
  - [ ] [Save Changes] calls `/profile` POST
  - [ ] [Cancel] resets form
  - [ ] Confirm message on save

- [ ] Onboarding detection logic
  - [ ] On mount: if `athlete.goals` or `athlete.primaryActivity` missing, show wizard
  - [ ] After login: re-check if wizard needed
  - [ ] After profile save: hide wizard

- [ ] Profile state integration
  - [ ] `useEffect` on profile POST response, update athlete state
  - [ ] Pass `equipmentAvailable` to sessionPlanner (Track 1 #39)
  - [ ] Pass `primaryActivity` + `secondaryActivity` to Track 2 engines

### **Testing**
- [ ] `test/onboarding.test.jsx` created with 40+ assertions
- [ ] All 40+ tests passing
- [ ] No regressions in existing tests (Track 1 tests still green)

### **Build & Integration**
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (node --test + jest)
- [ ] No console errors when rendering wizard
- [ ] No console errors when saving profile
- [ ] Profile persists across page reload (Firebase integration verified)

---

## DO NOT

- Don't build progressive disclosure (#33) or step skipping (#34) — linear flow only for now
- Don't ask clarifying questions about UX — use spec above verbatim
- Don't build sport-specific context (#36) or movement preferences (#37) — leave empty for Track 3.5
- Don't implement detraining baseline (#23) — just store profiles, not calculations
- Don't add animations or fancy transitions — keep it simple (borders, state changes)
- Don't change existing Track 1 code

---

## SHIP CRITERIA

✅ Onboarding wizard renders and completes without error  
✅ All 5 steps functional, summary shows correct values  
✅ Profile schema updated in `functions/userDoc.js`  
✅ Settings → Profile editor renders and saves  
✅ Profile persists to Firestore + reloads correctly  
✅ `equipmentAvailable` flows to sessionPlanner  
✅ 40+ tests passing, no regressions  
✅ Build succeeds (`npm run build`)  
✅ No console warnings or errors
