# Track 2: Hybrid Training Engine — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 2 GROUP A: Shared Fatigue Engines (#79–82, #87–89)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass existing tests: npm test.
5. No changes to files not listed.

ARCHITECTURE CONTEXT:
See CODEBASE_VARIABLES.md for fatigue variables, EXERCISE_DB usage, and data structure.
Track 1 dependencies: Equipment availability (#39) already merged.

FEATURES TO GENERATE:

1. Track 2 #79–80: Shared Fatigue Engine
   Files: functions/sharedFatigueEngine.js (new)
   
   Compute per-muscle + CNS + cardiovascular + connective fatigue across lifting/running/sports.
   Return capped (0–100 display, 0–2400 structural) + raw (uncapped) values.
   4 decay rates:
   - Structural (lifts + runs + sports distribution): 15% per day
   - CNS (lift + run intensity): 12% per day
   - Cardiovascular (run + sports): 8% per day
   - Connective Tissue (lifts + trail penalty): 6% per day
   
   Function signature:
   ```
   computeSharedFatigue(db, type = 'structural')
     → { capped: 0–100, _raw: number, muscleBreakdown: {...} }
   ```
   
   Types: 'structural', 'cns', 'cardiovascular', 'connective'
   
   Aggregation:
   - Structural: sum(lift tonnage × intensity) + sum(run load × intensity) + sports contrib
   - CNS: weighted intensity from heaviest lifts + run threshold pace
   - Cardiovascular: run volume + HR zones + sports intensity
   - Connective: lift volume + surface penalty for trail running
   
   Decay: daily decay = fatigue × (1 - decayRate)
   Example: structural 2400 decays to 2040 (2400 × 0.85) after 1 day
   
   Capping: structural caps at 2400, all others at 100

2. Track 2 #81: Activity Weighting
   Files: functions/activityWeighting.js (new)
   
   Given athlete's primaryActivity + fatigue state, allocate recovery budget.
   Primary: 60%, Secondary: 30%, Tertiary: 10%
   Reduce budget if fatigue high (structural > 1800 → reduce by 30%, CNS > 85 → reduce 20%)
   
   Function:
   ```
   computeActivityWeights(db, primaryActivity, secondaryActivity = null)
     → { lifting: { budget: 0–1, sessions: 3–5 }, running: {...}, sports: {...} }
   ```
   
   Budget inputs: athlete's weeklyTargets.lifting.sessionsPerWeek (default 4)
   Fatigued athlete: fewer sessions, lower intensity
   Output: recommendedSessions (e.g., { lifting: 3, running: 2, sports: 0 })

3. Track 2 #82: Session Allocation Engine
   Files: functions/sessionAllocationEngine.js (new)
   
   Generate 7-day weekly schedule respecting fatigue thresholds.
   Constraints:
   - CNS > 85: no heavy lifting today
   - Cardiovascular > 80: no running today
   - Connective > 75: no trail running or plyos
   - Avoid 2+ hard sessions consecutive
   - Require ≥1 rest day per week
   
   Function:
   ```
   generateWeeklyAllocation(db, primaryActivity, recommendedSessions)
     → { days: [...], tradeOffs: [...], risks: [...] }
   ```
   
   Output per day: { date, activityType, intensity, reason }
   Trade-offs: "CNS high; postponing heavy leg day to Friday" (array)
   Risks: "No rest day this week; recommend one Monday" (array)

4. Track 2 #87: Warmup per Activity
   Files: functions/sessionPlanner.js (extend existing)
   
   Apply athlete's warmupScheme to lift sessions.
   Extend `generateSessionExercises()` to accept warmupScheme input.
   Respect equipmentAvailable during warmup selection.
   Format: "Warmup: 5@60% + 3@85%" (already stored; just pass through)

Tests (Track 2 #89):
File: test/sharedFatigue.test.js (new)

8 tests for decay rates:
- CNS 12%/day: 100 → 88 after 1 day
- Cardiovascular 8%/day: 100 → 92 after 1 day
- Connective 6%/day: 100 → 94 after 1 day
- Structural 15%/day: 2400 → 2040 after 1 day
- Verify compound decay (2+ days) approaches zero by day 7

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 2 GROUP B: UI + Integration (#83, #85–86, #88, #90–93)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.

FEATURES TO GENERATE:

1. Track 2 #83: Multi-Activity UI (S1 Weekly Allocation Widget)
   File: src/app.jsx (S1 panel, new widget)
   
   Display:
   - Activity split pie chart or bar (lifting %, running %, sports %)
   - CNS + Cardiovascular trend (last 7 days, line chart)
   - Deferred activities banner: "Running deferred; CNS 88%" (if applicable)
   - Trade-off note: "Postponed leg day to Friday to avoid consecutive hard sessions"
   
   Size: 2 units (half-width or stacked depending on layout)
   Data source: sharedFatigueEngine() output
   Styling: use existing S1 widget CSS + className patterns

2. Track 2 #85: Multi-Activity UI (S3 Readiness Check)
   File: src/app.jsx (S3 session header, before "Session Plan")
   
   Display readiness for lifting/running/sports separately:
   - Lifting readiness 65% (CNS 88%, structural 72%)
   - Running readiness 42% (cardio 85%, leg fatigue 90%)
   - Sports readiness 70% (cardio 60%, connective 50%)
   
   Flag if any system overloaded: "⚠️ Your CNS is high; lighter session recommended today"
   
   Integration: call sharedFatigueEngine() on page load, update readiness per activity type

3. Track 2 #86: Multi-Activity UI (S5 Fatigue Detail)
   File: src/app.jsx (S5 panel, extend existing fatigue breakdown)
   
   Expand fatigue display from 1 system (structural) to 4 systems:
   - Structural heatmap (existing, unchanged)
   - CNS: ring + number (0–100)
   - Cardiovascular: ring + number (0–100)
   - Connective Tissue: ring + number (0–100)
   
   Add multi-activity history below fatigue rings:
   - Last 7 days: stacked bar showing lift % + run % + sports %
   - Balance assessment: "Well-balanced across activities" or "Overloaded on lifting"
   
   Styling: match existing S5 layout (rings on top, history below)

4. Track 2 #88: Integration with /profile and /session Endpoints
   File: functions/index.js (extend POST /profile, POST /session, GET /me)
   
   On POST /profile (when primaryActivity/secondaryActivity change):
   - Call computeActivityWeights()
   - Call generateWeeklyAllocation()
   - Store recommendedSessions in db.weeklyPlan
   
   On POST /session (when session submitted):
   - Call sharedFatigueEngine() to update all 4 fatigue types
   - Persist to db
   
   On GET /me (session load):
   - Return all 4 fatigue values + readiness per activity
   - Return tradeOffs + risks from session allocation

Tests (Track 2 #90–93):
File: test/sharedFatigue.test.js

12 tests for fatigue computation:
- Lifting alone: structural ↑, CNS ↑, cardio unchanged, connective ↑
- Running alone: structural ↑, cardio ↑, connective unchanged
- Sports alone: connective ↑, cardio ↑, structural ↑
- Combined: all sum correctly
- Intensity modifiers: +50% threshold → +50% fatigue contribution
- Raw vs capped: raw grows unbounded, capped at ceiling

10 tests for activity weighting:
- Primary 60%, secondary 30%, tertiary 10%
- High fatigue reduces budget by 30%
- CNS > 85 reduces lifting sessions
- Cardio > 80 reduces running sessions

15 tests for session allocation:
- 7-day generation produces 7 entries
- High-intensity separation (max 2 consecutive)
- Rest-day enforcement (≥1 per week)
- Trade-off detection + messaging
- Risk flags (no rest day, overloaded system)

5 integration tests:
- Day-to-day transitions (same athlete, 24h later)
- equipmentAvailable filtering works (from Track 1 #39)
- sessionPlanner uses sharedFatigue correctly
- What If uses raw fatigue (Track 1 Fix #1)
- No regressions in Track 1 tests

START CODE GENERATION HERE (no preamble):
```
