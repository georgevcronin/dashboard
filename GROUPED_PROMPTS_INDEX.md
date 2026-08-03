# Grouped Feature Prompts — Master Index

All 72 remaining features organized into 13 groups, ready to copy-paste into new Claude chats.

**Completed:** Track 1 #57 (Exercise Substitution)
**Remaining:** 71 features across Tracks 1–5

---

## Quick Navigation

| Track | Features | Groups | Files |
|-------|----------|--------|-------|
| **1** | 3 remain | 2 | TRACK_1_GROUPED_PROMPTS.md |
| **2** | 15 | 2 | TRACK_2_GROUPED_PROMPTS.md |
| **3** | 11 | 2 | TRACK_3_GROUPED_PROMPTS.md |
| **4A** | 9 | 2 | TRACK_4A_GROUPED_PROMPTS.md |
| **4B** | 13 | 2 | TRACK_4B_GROUPED_PROMPTS.md |
| **5** | 18 | 3 | TRACK_5_GROUPED_PROMPTS.md |
| **TOTAL** | **71** | **13** | – |

---

## Group Execution Order

**Recommended parallel execution:**
- All groups can start independently (no cross-dependencies except Track 1 → Track 2/3/4).
- Track 1 groups should complete first (they're short: 3h each).
- Tracks 2–5 can run in parallel after Track 1 is done.

**Suggested batching:**
```
WEEK 1:
  - Assign Track 1 Groups A & B (1–2 days per group, sequential)
  
WEEK 2:
  - Assign Tracks 2–5 Group A (all 5 groups in parallel)
  
WEEK 3:
  - Assign Tracks 2–5 Group B (all 5 groups in parallel)
  
WEEK 4:
  - Assign Track 5 Group C (tests, 1 day)
  - Code review + integration (3 days)
```

---

## All 13 Prompts at a Glance

### TRACK 1: Phase 1 Fixes (3 features, 2 groups)

**Group 1A: Heatmap Accessibility** (3h)
- File: `TRACK_1_GROUPED_PROMPTS.md`, first prompt block
- Features: #51 Heatmap Accessibility
- Work: Add SVG patterns (5 density levels) to body diagrams for colorblind accessibility
- Files: `public/body-*.svg`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 1B: Recommendation Delta** (4h)
- File: `TRACK_1_GROUPED_PROMPTS.md`, second prompt block
- Features: #63 Recommendation Delta
- Work: Compute why limiting factor changed day-to-day, display one-sentence explanation in S3
- Files: `functions/progression.js`, `src/app.jsx`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

### TRACK 2: Hybrid Training Engine (15 features, 2 groups)

**Group 2A: Shared Fatigue Engines** (12h)
- File: `TRACK_2_GROUPED_PROMPTS.md`, first prompt block
- Features: #79, #80 (Shared Fatigue), #81 (Activity Weighting), #82 (Session Allocation), #87 (Warmup), #89 (Tests: Decay)
- Work: Build 4-system fatigue model (structural 15%, CNS 12%, cardio 8%, connective 6% decay). Activity weighting & weekly allocation.
- Files: `functions/sharedFatigueEngine.js`, `functions/activityWeighting.js`, `functions/sessionAllocationEngine.js`, `test/sharedFatigue.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 2B: UI + Integration** (10h)
- File: `TRACK_2_GROUPED_PROMPTS.md`, second prompt block
- Features: #83 (S1 Widget), #85–86 (S3 Readiness, S5 Fatigue), #88 (Endpoint Integration), #90–93 (Tests: Weighting, Allocation, Integration)
- Work: Add multi-activity readiness rings + fatigue breakdown. Integrate into /profile and /session endpoints.
- Files: `src/app.jsx`, `functions/index.js`, `test/sharedFatigue.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

### TRACK 3: Onboarding Redesign (11 features, 2 groups)

**Group 3A: Wizard Flow Steps** (8h)
- File: `TRACK_3_GROUPED_PROMPTS.md`, first prompt block
- Features: #21 (Multi-Goal), #24 (Activity Selection NEW Step 5), #27–29 (Muscle Priorities 3-state, renumbered Step 6)
- Work: Extend onboarding wizard from 8 → 9 steps. Add goals, activity selection, 3-state muscle priorities.
- Files: `src/app.jsx` (wizard steps)
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 3B: Wizard Summary + Profile Editor** (8h)
- File: `TRACK_3_GROUPED_PROMPTS.md`, second prompt block
- Features: #22–23 (Backend ✅ done), #32 (Onboarding Summary), #40 (Profile Editor), Tests
- Work: Add summary review before entering app. Build comprehensive profile editor in Settings.
- Files: `src/app.jsx`, `test/onboarding.test.jsx`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

### TRACK 4A: Analytics Layer (9 features, 2 groups)

**Group 4A-I: Timeline + Calendar** (8h)
- File: `TRACK_4A_GROUPED_PROMPTS.md`, first prompt block
- Features: #41 (Unified Timeline), #42 (Training Calendar), Tests
- Work: Merge lifts/runs/sleep/nutrition/injuries/PRs into scrollable feed. Month/week calendar view with readiness %.
- Files: `functions/timelineService.js`, `functions/calendarService.js`, `src/app.jsx`, `test/analytics.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 4A-II: Brief + Deload + Knowledge** (10h)
- File: `TRACK_4A_GROUPED_PROMPTS.md`, second prompt block
- Features: #43 (Weekly Brief via Gemini), #45 (Deload Detection), #61–62 (Exercise Knowledge Cards + Evidence Links), Tests
- Work: Auto-generate 2–3 sentence weekly summary. Flag deload if 2+ criteria. Build knowledge card modal for 30+ exercises.
- Files: `functions/briefService.js`, `functions/deloadService.js`, `functions/exerciseKnowledge.js`, `src/app.jsx`, `test/analytics.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

### TRACK 4B: Running Foundation (13 features, 2 groups)

**Group 4B-I: Running Metrics Engines** (14h)
- File: `TRACK_4B_GROUPED_PROMPTS.md`, first prompt block
- Features: #98 (Running Load), #99 (VO₂ Max Estimation), #99B (Aerobic Efficiency), #100 (Running Readiness), #101 (Run Categories), Tests
- Work: Build running load formula (distance × intensity × surface × elevation). Estimate VO₂ from HR + pace. Track aerobic efficiency trend. Compute running readiness (separate from lifting). Auto-classify runs (easy, threshold, long, etc.).
- Files: `functions/runningLoad.js`, `functions/vo2MaxEstimator.js`, `functions/aerobicEfficiency.js`, `functions/runReadiness.js`, `functions/runCategories.js`, `test/running.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 4B-II: UI Display + Integration** (8h)
- File: `TRACK_4B_GROUPED_PROMPTS.md`, second prompt block
- Features: #104 (Race Periodization scaffolding), S3 Running Dashboard, S5 Running Metrics, S1 Brief Integration
- Work: Add running metrics panels to S3 (weekly load, VO₂ chart, efficiency trend, readiness). S5 running load + metrics. Integrate into S1 brief.
- Files: `functions/racePeriodization.js`, `src/app.jsx`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

### TRACK 5: Customization + Micro-Polish (18 features, 3 groups)

**Group 5A: Customization Core** (10h)
- File: `TRACK_5_GROUPED_PROMPTS.md`, first prompt block
- Features: #15 (Customizable Layouts), #52 (Movement Pattern Tracking), #71 (Mode Toggle), #72–78 (Mode Density Effects), Tests
- Work: Drag-drop panel reorder + column layout. Track tonnage + muscle emphasis per pattern. Add 3-mode toggle (tracker/recommendations/coach). Conditional UI density per mode.
- Files: `functions/layoutPreferences.js`, `functions/movementPatterns.js`, `src/app.jsx`, `test/customization.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 5B: Templates + Widgets** (10h)
- File: `TRACK_5_GROUPED_PROMPTS.md`, second prompt block
- Features: #75 (Quick-Start Templates), #125–129 (Hydration Ring, RHR Ticker, Volume Pace Bar, Muscle Focus Map), Widget Config UI, Tests
- Work: 5 session templates (full-body, upper/lower, PPL, strength, hypertrophy). Build 4 micro-widgets (hydration, RHR, volume pace, muscle map). Widget config in Settings.
- Files: `functions/sessionTemplates.js`, `src/app.jsx`, `test/customization.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

**Group 5C: Remaining Tests** (2h)
- File: `TRACK_5_GROUPED_PROMPTS.md`, third prompt block
- Features: Final tests for mode toggle + any remaining edge cases
- Work: Test mode cycling, coaching cues visibility, all 3 modes working correctly.
- Files: `test/customization.test.js`
- Copy prompt starting at: "You are generating code for the Press Dashboard..."

---

## How to Use These Prompts

**Option 1: Parallel Execution (Fastest)**
1. Copy TRACK_1_GROUPED_PROMPTS.md Group 1A into Chat 1 → get code
2. Copy TRACK_1_GROUPED_PROMPTS.md Group 1B into Chat 2 → get code (parallel to 1A)
3. Once Track 1 done, start Tracks 2–5 in 5 parallel chats (one per track's Group A)
4. Once all Group A done, start Group B chats (one per track, except Track 5 needs Group C after B)
5. Merge all code into `main` branch in a single PR

**Option 2: Sequential (Safer Testing)**
1. Complete Track 1 (2 chats, 1 day)
2. Complete Track 2 Group A (1 chat, 1 day) → test + merge
3. Complete Track 2 Group B (1 chat, 1 day) → test + merge
4. Repeat for Tracks 3–5
5. Full integration test at end (npm run build && npm test)

**Option 3: Hybrid (Recommended)**
1. Track 1: both groups in parallel (1 day)
2. Tracks 2–5: Group A for all 4 tracks in parallel (2 days)
3. Tracks 2–5: Group B for all 4 tracks in parallel (2 days)
4. Track 5 Group C (0.5 days)
5. Integration + code review (2 days)

---

## Context Files for Each Chat

Every new Claude chat should have access to:
- `CODEBASE_VARIABLES.md` — complete variable reference (copy or paste link)
- `CLAUDE.md` — project guidelines (root + worktree)
- `ARCHITECTURE.md` — system design (if exists)
- `PRODUCT.md` — feature design (if exists)

Optional: 
- `package.json` — dependency reference
- `functions/index.js` (first 200 lines) — endpoint signatures

---

## Tracking Progress

| Group | Status | Assignee | Start | End | PR |
|-------|--------|----------|-------|-----|-----|
| Track 1A | – | – | – | – | – |
| Track 1B | – | – | – | – | – |
| Track 2A | – | – | – | – | – |
| Track 2B | – | – | – | – | – |
| Track 3A | – | – | – | – | – |
| Track 3B | – | – | – | – | – |
| Track 4A-I | – | – | – | – | – |
| Track 4A-II | – | – | – | – | – |
| Track 4B-I | – | – | – | – | – |
| Track 4B-II | – | – | – | – | – |
| Track 5A | – | – | – | – | – |
| Track 5B | – | – | – | – | – |
| Track 5C | – | – | – | – | – |

---

## Testing Checklist (After All Groups Complete)

- [ ] npm run build (frontend bundles without errors)
- [ ] npm test (all 725+ backend tests pass)
- [ ] Manual test: S1 loads all widgets
- [ ] Manual test: S3 session generation works
- [ ] Manual test: S5 fatigue displays correctly
- [ ] Manual test: Onboarding wizard completes (all 9 steps)
- [ ] Manual test: Settings editor saves profile changes
- [ ] Manual test: Mode toggle (tracker/recommendations/coach) works
- [ ] Browser test: colorblind mode (simulate CVD) shows SVG patterns in heatmap
- [ ] Browser test: mobile viewport (375px) responsive
- [ ] No console errors or warnings

---

## Estimated Total Effort

| Track | Hours | Days |
|-------|-------|------|
| 1 | 7 | 1 |
| 2 | 22 | 3 |
| 3 | 16 | 2 |
| 4A | 18 | 2.5 |
| 4B | 22 | 3 |
| 5 | 22 | 3 |
| **TOTAL** | **107** | **14.5** |

*Assumes parallel execution: ~1 week of wall-clock time with 2–3 concurrent chats.*

