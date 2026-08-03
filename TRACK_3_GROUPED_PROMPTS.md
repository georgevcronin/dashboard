# Track 3: Onboarding Redesign + Profile System — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 3 GROUP A: Wizard Flow Steps (#21, #24, #27–29)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.
5. React patterns: useState/useEffect, inline styles, className for CSS.

ARCHITECTURE CONTEXT:
Track 3 backend (schema + validation) is ✅ COMPLETE. This is frontend only.
See CODEBASE_VARIABLES.md for data structure: profile.{primaryActivity, secondaryActivity, equipmentAvailable, musclePriorities}.
Current wizard: 9 steps (0–8). No changes to existing steps yet; just add new content.

FEATURES TO GENERATE:

1. Track 3 #21: Multi-Goal Selection (Step 2, existing)
   File: src/app.jsx (locate step 2, extend checkboxes)
   
   Current Step 2: training experience selector
   Extend with: goal selection checkboxes (requires ≥1)
   
   Goals: strength, hypertrophy, endurance, power, mobility
   Styling: checkbox list, match existing S1 widget styling
   State: db.profile.goals (array or object, TBD by existing structure)
   Show specialization preview: "Your focus: strength + hypertrophy → 3–4 lifting sessions/week, high intensity"
   
   Preview text: use existing logic from weeklyPlanner.js if available

2. Track 3 #24: Activity Selection (NEW Step 5)
   File: src/app.jsx (insert between step 4 and current step 5, renumber steps after this 0–9)
   
   NEW STEP 5: PRIMARY + SECONDARY ACTIVITY
   - Radio buttons: primaryActivity = "strength" | "running" | "hybrid" | "sports" | "crossfit"
   - Checkboxes below: secondaryActivity (multiple, optional)
   - Required: primaryActivity selected
   - Optional: 0–2 secondary activities
   
   Styling: match existing step styling (heading, description, action buttons)
   Next button: enabled only if primaryActivity selected
   
   State variables (already in app.jsx from backend work):
   - primaryActivity
   - secondaryActivity (array)
   
   Integration note: Backend smartDefaults already handles weeklyTargets based on primaryActivity

3. Track 3 #27–29: Muscle Priorities (3-State Toggle, Step 6, was Step 5)
   File: src/app.jsx (locate existing Step 5 "Muscle Focus", renumber to Step 6, extend)
   
   Current: toggle baseline ↔ focus
   Extend: baseline → focus → avoid → baseline (cycle)
   
   Styling:
   - focus: bright blue background (existing "active" color)
   - baseline: neutral gray background
   - avoid: darker gray + strikethrough text (visual indicator)
   
   State: musclePriorities object { chest: "focus", back: "baseline", legs: "avoid", ... }
   
   Per-muscle toggle: click muscle name to cycle through 3 states
   Display counts: "3 focused, 4 baseline, 2 avoided"
   
   Gotcha: ensure Step 4 (training background) is now Step 4, Step 5 (new activity) is Step 5, Step 6 (muscle focus 3-state) is Step 6, etc.

STEP NUMBERING AFTER THIS GROUP:
- Step 0: Name
- Step 1: Height/Sex
- Step 2: Experience + Goals
- Step 3: Training Background
- Step 4: Primary + Secondary Activity (NEW)
- Step 5: Muscle Priorities (3-state)
- Step 6: Macro Targets
- Step 7: Daily Preferences
- Step 8: Summary (renumbered from Step 7)
- Step 9: Final confirmation (renumbered from Step 8)

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 3 GROUP B: Wizard Summary + Profile Editor (#22–23, #32, #40)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.

FEATURES TO GENERATE:

1. Track 3 #22–23: Schema + Validation (Backend, ✅ ALREADY DONE)
   File: functions/userDoc.js + functions/index.js
   Status: COMPLETE. Smart defaults applied in POST /profile handler.
   This group is frontend only; assume backend is ready.

2. Track 3 #32: Onboarding Summary (NEW Step 8, renumbered from Step 7)
   File: src/app.jsx (locate Step 7, renumber to Step 8, add summary display)
   
   Before entering app, show all onboarding choices:
   - Name: John Doe
   - Height: 183 cm, Sex: M
   - Training Experience: 5 years
   - Goals: strength, hypertrophy
   - Primary Activity: strength, Secondary: running
   - Equipment: barbell, dumbbell, cable
   - Muscle Priorities: chest (focus), back (focus), legs (baseline), arms (avoid)
   - Daily Preferences: (summary of Step 7 choices)
   
   Layout: 2-column list (key: value pairs) or card-based display
   Buttons: [Edit] (restart wizard), [Enter App] (save & close wizard)
   
   Styling: match existing step styling (white card, clear typography)
   
   On [Edit]: setStep(0), reset to name entry
   On [Enter App]: call POST /profile with all data, close wizard modal

3. Track 3 #40: Unified Profile Editor (Settings Panel)
   File: src/app.jsx (Settings overlay, new "Profile" section)
   
   Add new tab or accordion section in Settings: "Profile"
   Edit fields:
   - Experience: number input
   - Goals: checkboxes (strength, hypertrophy, endurance, power, mobility)
   - Primary Activity: radio buttons
   - Secondary Activity: checkboxes
   - Equipment: checkboxes (barbell, dumbbell, cable, machine, smith, bodyweight)
   - Muscle Priorities: 3-state toggles per muscle (match Step 6 UI)
   - Weekly Targets: (if time) number inputs per activity type
   - Activity Preferences: (if time) checkboxes per activity
   
   Buttons: [Save], [Cancel], [Confirm Changes] (undo if cancel)
   
   Styling: match existing Settings panels (card layout, form inputs)
   
   Integration: on Save, call POST /profile with updated db.profile, reload
   
   Gotcha: ensure musclePriorities 3-state logic is identical to Step 6

Tests (Track 3):
File: test/onboarding.test.jsx (new)

8 tests for wizard flow:
- Step advance: current step increments/decrements correctly
- Validation: step with required fields blocks next (no primaryActivity → can't advance)
- Bodyweight lockout: selecting bodyweight unchecks others (and vice versa)
- Data persistence: form state survives step back + forward
- Save/enter-app: wizard closes, data persists in db

8 tests for schema + defaults:
- New fields exist: primaryActivity, secondaryActivity, equipmentAvailable, musclePriorities
- Muscle priorities 3-state: all 3 states work, cycle correctly
- Backward compat: old muscleFocus field still works if present
- Smart defaults: primaryActivity='strength' → weeklyTargets.lifting ≥4 sessions/week

START CODE GENERATION HERE (no preamble):
```
