# Track 5: Customization + Micro-Polish — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 5 GROUP A: Customization Core (#15, #52, #71–78)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.

FEATURES TO GENERATE:

1. Track 5 #15: Customizable Layouts
   Files: functions/layoutPreferences.js (new), src/app.jsx (Settings panel)
   
   Backend:
   Store layout preferences in db.profile.layoutPreferences:
   ```
   {
     panelOrder: [ 's1', 's2', 's3', 's5', 's4' ],  // reordered panels
     hiddenPanels: [ 's4' ],                          // invisible panels
     columnLayout: 1 | 2 | 3                          // UI columns
   }
   ```
   
   Frontend (Settings panel):
   - New "Layout" section
   - Panel reorder: drag-drop OR numbered list (1st choice: order list UI if simpler)
     Example: "S1: 1st, S3: 2nd, S5: 3rd, S4: hidden"
   - Show/hide toggle per panel: checkboxes
   - Column layout selector: radio buttons (1-col, 2-col, 3-col)
   - [Save] button persists to profile via POST /profile
   
   Styling: match existing Settings panels (form layout, checkboxes, radio buttons)
   
   Frontend (app.jsx main):
   - Read db.profile.layoutPreferences on load
   - Render panels in db.profile.layoutPreferences.panelOrder
   - Hide panels in db.profile.layoutPreferences.hiddenPanels
   - Apply CSS grid with columnLayout value (1fr, repeat(2, 1fr), repeat(3, 1fr))
   
   Default: panelOrder=[S1, S2, S3, S5, S4], hiddenPanels=[], columnLayout=2

2. Track 5 #52: Movement Pattern Tracking
   Files: functions/movementPatterns.js (new), src/app.jsx (S5 section)
   
   Backend:
   Define patterns (generalize from EXERCISE_DB):
   ```
   PATTERNS = {
     'upper-push': ['Bench Press', 'Overhead Press', 'Dip', ...],
     'upper-pull': ['Pull-up', 'Row', 'Lat Pulldown', ...],
     'lower-push': ['Squat', 'Leg Press', 'Leg Extension', ...],
     'posterior-chain': ['Deadlift', 'RDL', 'Back Extension', ...],
     'arm': ['Barbell Curl', 'Skull Crusher', ...],
     'core': ['Plank', 'Cable Crunch', ...]
   }
   ```
   
   Function:
   ```
   computePatternVolume(db, days = 7)
     → { pattern: tonnage, breakdown: { chest_contribution, back_contribution, ... } }
   ```
   
   Tonnage: sum(kg × reps) per pattern (last 7 days)
   Muscle contribution: per pattern, which muscles dominated (%)
   Fatigue per pattern: correlate pattern volume with muscle fatigue in last 7 days
   
   Frontend (S5 section):
   - Stacked bar chart: tonnage per pattern (7 days)
   - Muscle emphasis pie per pattern (click pattern → details)
   - Fatigue per pattern: color-coded (red=high, yellow=med, green=low)
   - Example display: "Upper-Push 5.2k, Upper-Pull 4.8k, Lower 6.1k, Posterior 3.2k"
   
   Size: 2 units (half-width)
   Styling: match existing S5 charts (stacked bars, color coding)

3. Track 5 #71: Mode Toggle
   Files: src/app.jsx (S1 header, new buttons)
   
   Add 3-button toggle in S1 header (or top-left corner):
   - [Tracker] (default)
   - [Recommendations]
   - [Coach]
   
   Store selected mode: db.profile.uiMode = "tracker" | "recommendations" | "coach"
   
   Mode effects (Track 5 #72–78):
   - Tracker: hide recommendations + adaptation notes (basic logging view)
   - Recommendations: full UI (all panels visible, recommendations showing)
   - Coach: show coaching cues + exercise alternatives (detailed guidance)
   
   Styling: toggle buttons (match existing button styling, active = highlighted)
   Persist: call POST /profile on mode change

4. Track 5 #72–78: Mode Density Effects
   File: src/app.jsx (conditional rendering per mode)
   
   Tracker mode:
   - Hide S3 "Recommended Session" section
   - Hide adaptation notes in S5
   - Show bare workout logging UI only
   
   Recommendations mode:
   - Show all panels (S1–S7 default)
   - Include S3 recommended session
   - Include S5 adaptation notes
   
   Coach mode:
   - Show all panels
   - Add "Coaching Cues" collapsible section below each exercise in S3
   - Show "Alternatives" for each picked exercise
   - Add detailed explanations for why this session (limiting factor, goal alignment)
   
   Implementation:
   - Per mode, use conditional rendering: { uiMode === 'coach' && <CoachingCues /> }
   - Coach mode content: hardcode coaching cues per exercise (or source from Track 4A #61 knowledge cards)

Tests (Track 5):
File: test/customization.test.js (new)

5 tests for customization:
- Drag reorder: change panel order, verify render order updates
- Toggle hide: hide S4, verify not rendered; show again, verified rendered
- Save/persist: set layout in Settings, reload page, layout persists
- Defaults load: new account → default layout (2-col, all visible)
- Column layout: 1-col renders single column, 2-col renders 2 columns, etc.

4 tests for patterns:
- Exercise → pattern mapping: Bench Press → 'upper-push'
- Tonnage aggregation: 5 sets × 100kg × 5 reps = 2500 tonnage for 1 exercise
- Muscle emphasis: upper-push is 50% chest, 30% deltoid, 20% triceps
- Pattern fatigue: high tonnage → high fatigue contribution

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 5 GROUP B: Templates + Widgets (#75, #125–129, Config UI)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.

FEATURES TO GENERATE:

1. Track 5 #75: Quick-Start Templates
   Files: functions/sessionTemplates.js (new), src/app.jsx (S3 section)
   
   Backend:
   Define 5 templates (store as static data or db.profile.sessionTemplates):
   ```
   TEMPLATES = {
     'full-body': { exerciseNames: ['Squat', 'Bench Press', 'Row', 'RDL', 'Lat Raise', 'Curl', 'Dip'] },
     'upper-lower': { // A/B split alternating
       'A': ['Bench Press', 'Row', 'Lat Raise', 'Lat Pulldown'],
       'B': ['Squat', 'RDL', 'Leg Curl', 'Leg Extension']
     },
     'ppl': { // Push/Pull/Legs
       'push': ['Bench', 'Incline Press', 'Lat Raise', 'Tricep Dip'],
       'pull': ['Barbell Row', 'Pull-up', 'Face Pull', 'Bicep Curl'],
       'legs': ['Squat', 'RDL', 'Leg Press', 'Leg Curl']
     },
     'strength-focus': { exerciseNames: ['Squat', 'Bench', 'Deadlift', 'Row', 'OHP'] },
     'hypertrophy-focus': { exerciseNames: ['Incline Bench', 'Machine Row', 'Leg Press', 'Leg Curl', 'Lat Raise', 'Dumbbell Curl'] }
   }
   ```
   
   Frontend (S3 session view):
   - Dropdown or card buttons: [Full-Body] [Upper/Lower] [PPL] [Strength] [Hypertrophy]
   - [Load Template] button
   - On click: pre-fill S3 session with template exercises
   - User can then edit, adjust weights, add/remove exercises
   
   Styling: match existing S3 UI (buttons or dropdown)

2. Track 5 #125: Hydration Widget
   File: src/app.jsx (S1 micro-widget, 1 unit)
   
   Display:
   - Ring: 0–100% fill (current water intake / daily target)
   - Center: "2/6L" (current liters / target liters)
   - Goal: 6L/day (configurable? or hardcoded from db.profile.waterTarget)
   - Manual entry: [+] button to log water (or click ring)
   
   Data source: db.water or db.waterLog (existing structure)
   Styling: circular progress ring (match existing ring widgets)

3. Track 5 #126: RHR Ticker
   File: src/app.jsx (S1 micro-widget, 1 unit)
   
   Display:
   - Number: latest RHR (bpm)
   - Trend arrow: ↑ (elevated, red) | ↓ (good, green) | → (stable, gray)
   - Context: "7-day avg: 58 bpm"
   - Interpretation: if RHR ↑ significantly (5+ bpm above baseline), flag "recovery needed"
   
   Data source: db.workouts[] (wearable data), or manual entry via Apple Health
   Styling: simple display (number + arrow + text)

4. Track 5 #128: Volume Pace Bar
   File: src/app.jsx (S1 micro-widget, 2 units)
   
   Display:
   - Lifting: stacked horizontal bar (current / target weekly tonnage)
     Example: [████████░░] 80% (8000/10000 kg this week)
   - Running: stacked horizontal bar (current / target weekly distance)
     Example: [██████░░░░] 60% (30/50 km this week)
   - Colors: green (>80%), yellow (60–80%), red (<60%)
   
   Target: from db.profile.weeklyTargets (set during onboarding)
   Styling: horizontal bar chart (match existing progress bars)

5. Track 5 #129: Muscle Focus Map
   File: src/app.jsx (S1 micro-widget, 2 units)
   
   Display:
   - Body diagram (simplified, colored muscle groups)
   - Top 3 muscles by tonnage (last 7 days)
     Example: "Chest 35%, Back 28%, Legs 22%"
   - Highlight top 3 on diagram
   - List percentages below
   
   Data source: compute tonnage per muscle from db.lifts (last 7 days)
   Styling: simplified body diagram + text (match existing body diagrams)

6. Widget Configuration UI
   File: src/app.jsx (Settings panel, new "Widgets" section)
   
   Display:
   - Checkboxes for each widget (Hydration, RHR, Volume Pace, Muscle Map)
   - Layout selector: 2-col (default), 1-col, 3-col
   - Widget size adjustment (if time; else hardcode sizes)
   - [Save]
   
   Store in: db.profile.widgetPreferences = { hydration: true, rhr: true, volumePace: true, muscleMap: true, layout: 2 }
   
   Frontend: render only enabled widgets in S1

Tests (Track 5):
File: test/customization.test.js

4 tests for templates:
- Load full-body: session populates with 7 exercises
- Load strength: loads compound-heavy lifts
- Load hypertrophy: loads moderate-rep exercises
- Pre-fill: exercises appear in S3 session list, editable

4 tests for widgets:
- Hydration ring: 33% (2/6L) → ring 33% full
- RHR ticker: latest RHR 62, 7-day avg 60, trend ↑ (elevated)
- Volume pace bar: lifting 8000/10000 → 80% filled (green)
- Muscle map: top 3 = chest 35%, back 28%, legs 22%

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 5 GROUP C: Tests

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

Tests for Track 5: test/customization.test.js

3 tests for mode toggle:
- Set mode to 'tracker', verify db.profile.uiMode persists
- Set mode to 'coach', verify coaching cues visible in S3
- Switch modes: tracker → recommendations → coach → tracker (cycle works)

Tests already defined in Group A and Group B (patterns, templates, widgets above).

START CODE GENERATION HERE (no preamble):
```

---

## Summary: All Grouped Prompts

**Track 1** (3 remaining):
- Track 1 Group A: #51 Heatmap Accessibility (SVG patterns)
- Track 1 Group B: #63 Recommendation Delta (logic + display)

**Track 2** (15 features):
- Track 2 Group A: #79–82, #87–89 (Shared fatigue engines + tests)
- Track 2 Group B: #83, #85–86, #88, #90–93 (UI + integration + tests)

**Track 3** (11 features):
- Track 3 Group A: #21, #24, #27–29 (Wizard flow steps)
- Track 3 Group B: #22–23, #32, #40 (Schema, summary, profile editor + tests)

**Track 4A** (9 features):
- Track 4A Group A: #41–42 (Timeline + Calendar + tests)
- Track 4A Group B: #43, #45, #61–62 (Brief + Deload + Knowledge + tests)

**Track 4B** (13 features):
- Track 4B Group A: #98–101, #99B (Running metrics engines + tests)
- Track 4B Group B: #104, S3/S5/S1 UI (Display + integration)

**Track 5** (18 features):
- Track 5 Group A: #15, #52, #71–78 (Customization core)
- Track 5 Group B: #75, #125–129 (Templates + widgets + config UI + tests)
- Track 5 Group C: Remaining tests

**Total: 12 grouped prompts ready to copy-paste into new Claude chats.**
