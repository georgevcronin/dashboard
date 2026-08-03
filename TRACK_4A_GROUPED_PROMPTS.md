# Track 4A: Analytics Layer — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 4A GROUP A: Timeline + Calendar (#41–42)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm test.

ARCHITECTURE CONTEXT:
Data sources: db.lifts[], db.workouts[], db.sleep[], db.soreness[], db.injuries[], db.thoughts[]
See CODEBASE_VARIABLES.md for Firestore structure.

FEATURES TO GENERATE:

1. Track 4A #41: Unified Timeline
   Files: functions/timelineService.js (new), src/app.jsx (S1 timeline tab)
   
   Backend function:
   ```
   buildTimeline(db, lastNDays = 30)
     → [ { date, type, content, exercise, sessionType, ... }, ... ]
   ```
   
   Merge & sort (desc by date):
   - Lifts: { type: 'lift', exercise, kg, reps, date, ... }
   - Runs: { type: 'run', distance, pace, date, ... }
   - Sleep: { type: 'sleep', hours, quality, date, ... }
   - Nutrition: { type: 'nutrition', calories, macros, date, ... }
   - Injuries: { type: 'injury', name, severity, date, ... }
   - Personal Records: { type: 'pr', exercise, weight, date, ... }
   - Notes: { type: 'note', content, date, ... }
   
   Frontend (S1 timeline tab):
   - Scrollable feed (last 30 days default)
   - Per entry: date + type icon + content + metric
   - Click exercise name → knowledge card modal (Track 4A #61)
   - Click date → daily detail view (if time; else skip)
   
   Styling: scrollable card list, match existing S1 widget styling

2. Track 4A #42: Training Calendar
   Files: functions/calendarService.js (new), src/app.jsx (S1 calendar tab)
   
   Backend function:
   ```
   buildCalendar(db, year, month)
     → { days: [ { date, sessionType, isComplete, readiness%, ... }, ... ] }
   ```
   
   Per day:
   - date: "2026-08-02"
   - sessionType: "lift" | "run" | "rest" | null
   - isComplete: boolean (vs pending)
   - readiness: 0–100 (from computeCurrentFatigueScores)
   - workoutId: link to full session data
   
   Frontend (S1 calendar tab):
   - Month/week toggle (or start with month only)
   - Each day: box with icon (lift/run) + readiness % + check mark (if complete)
   - Color code by readiness: red (low) → yellow → green (high)
   - Click day → detailed log (session + metrics for that day)
   
   Styling: grid layout (7 columns for weekdays), match S1 widget aesthetic

Tests (Track 4A):
File: test/analytics.test.js (new)

6 tests for timeline:
- Merge lifts, runs, sleep, injuries correctly
- Sort descending by date
- Limit to lastNDays works
- Date range filter accurate
- Event types all present
- PR extraction finds max kg per exercise

8 tests for calendar:
- Generate 28–31 days per month
- Sessions link to actual workout data
- Recovery status calculated (readiness %)
- Rest-day flags correct
- Readiness % accurate (0–100)
- Month summary (total sessions, avg readiness)
- Week boundary handling (month ends mid-week)
- Click/load day detail works

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 4A GROUP B: Brief + Deload + Knowledge (#43, #45, #61–62)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm test.

ARCHITECTURE CONTEXT:
Gemini integration: see callGeminiResilient() in functions/gemini.js (already available).

FEATURES TO GENERATE:

1. Track 4A #43: Weekly Brief
   Files: functions/briefService.js (new), src/app.jsx (S1 widget)
   
   Backend function:
   ```
   buildWeeklyBrief(db)
     → { week, summary: string, cached: boolean, generatedAt: ISO string }
   ```
   
   Collect 7-day data (or 5-day if < 7 logged):
   - Total lift load (tonnage)
   - Run volume (distance, avg pace)
   - Sleep (avg hours, quality)
   - Fatigue state (current + trend)
   - PRs this week
   - Missed sessions (if tracked)
   - Notes/soreness trends
   
   Craft Gemini prompt (use callGeminiResilient from functions/gemini.js):
   ```
   "Summarize this week's training (2–3 sentences). Data: [lift load], [run volume], [sleep avg], [fatigue trend], [PRs]. Focus on physiological progress, not cheerleading."
   ```
   
   Return Gemini's response (2–3 sentence plain text).
   Cache per calendar week (store in db.weeklyBrief[WEEK_NUM]).
   
   Frontend (S1 widget):
   - Title: "This Week's Summary"
   - Display Gemini-generated text
   - Timestamp: "Generated Monday, Aug 2 at 8am"
   - Size: 1 unit (half-width)

2. Track 4A #45: Deload Detection
   Files: functions/deloadService.js (new, or extend functions/progression.js), src/app.jsx (S5 banner)
   
   Deload criteria (check 5):
   1. CNS fatigue > 80 (sustained 3+ days)
   2. PR stagnation: no 1RM progress on main lifts last 2 weeks
   3. Poor sleep: avg < 6 hours last 3 days
   4. Missed sessions: ≥2 planned sessions missed this week
   5. Injury flag: soreness > 7/10 or existing injury logged
   
   Require 2+ criteria to flag deload recommendation.
   
   Backend function:
   ```
   detectDeloadNeed(db)
     → { isDeload: boolean, criteriasMet: [1, 3, 5], recommendation: string, recoveryDays: 5 }
   ```
   
   Recommendation examples:
   - "Your CNS is high and sleep is low. 5-day deload (reduce volume 40%, keep intensity 70%) recommended."
   - "PR stagnation + fatigue. Try 3-day rest or active recovery week."
   
   Recovery timeline: deload typically 3–7 days depending on severity.
   
   Frontend (S5 banner):
   - Display if isDeload=true
   - Banner: "⚠️ Deload Recommended" + criteria Met + recovery timeline
   - Color: orange/yellow background
   - Styling: match existing S5 warning banners

3. Track 4A #61–62: Exercise Knowledge Cards
   Files: functions/exerciseKnowledge.js (new), src/app.jsx (S3 modal)
   
   Static data for 30+ exercises:
   Barbell: Squat, Bench Press, Deadlift, Barbell Row, Overhead Press, Power Clean
   Dumbbell: Dumbbell Bench, Dumbbell Row, Goblet Squat, Farmer's Carry
   Machines: Leg Press, Chest Fly, Lat Pulldown, Leg Curl
   Accessories: Pull-up, Dip, Leg Extension, Lat Raise, Barbell Curl, Skull Crusher
   + others in EXERCISE_DB
   
   Per exercise data:
   - Purpose: "Develops chest, anterior deltoid, triceps; compound movement"
   - Coaching cues: 2–3 technique tips
   - Muscle activation (% contribution): chest 50%, anterior deltoid 30%, triceps 20%
   - Regressions: "Machine Chest Press, Smith Machine Bench"
   - Progressions: "Paused Reps, Band Resistance, Incline Bench"
   - Common mistakes: "Excessive wrist bend, elbows too wide, uneven bar path"
   
   Data structure:
   ```
   {
     name: "Barbell Bench Press",
     purpose: string,
     coachingCues: [ string, ... ],
     muscleActivation: { chest: 50, anterior_deltoid: 30, triceps: 20 },
     regressions: [ string, ... ],
     progressions: [ string, ... ],
     mistakes: [ string, ... ],
     links: [ { title: string, url: string }, ... ] // optional evidence
   }
   ```
   
   Frontend (S3 modal):
   - Trigger: click exercise name in S3 session list
   - Modal title: exercise name
   - Sections: Purpose, Coaching Cues, Muscle Activation (bar chart or % list), Regressions/Progressions, Common Mistakes
   - Links section (if present)
   - Styling: match existing modals (light background, readable font, scrollable if long)
   
   Evidence library (Track 4A #62):
   - Optional links per exercise (research papers, YouTube guides, articles)
   - Display as "Learn More: [link]" at modal bottom
   - Keep minimal; 1–2 links per exercise max (avoid clutter)

Tests (Track 4A):
File: test/analytics.test.js

6 tests for brief:
- buildWeeklyBrief collects 7-day data (or 5-day if less logged)
- Calls Gemini with correct prompt structure
- Returns 2–3 sentence response
- Caching works (same week = cached result)
- Cache expires at week boundary
- Timestamp accurate

6 tests for deload:
- Criteria checking: each of 5 criteria detected correctly
- 2+ criteria flag deload=true
- <2 criteria → deload=false
- Recovery timeline sensible (3–7 days)
- Recommendation text includes specific criteria
- Edge case: no data logged → isDeload=false

START CODE GENERATION HERE (no preamble):
```
