# Press Dashboard Implementation Roadmap

**Last Updated:** 2026-08-04  
**Status:** Planning phase complete; ready for Phase 1 cleanup + implementation  
**Context:** George's personal fitness app (Press) with AI-powered training recommendations, hybrid activity support, and multi-level expertise gating.

---

## ⚠️ VERIFICATION NOTES (Critical Findings)

### What Was Verified ✅
- `callGeminiResilient()` exists in `functions/gemini.js` — works as expected
- Schema additions (`db.runs`, `db.sports`, `db.sleep`, `db.injuries`) already in DEFAULTS
- `functions/expertise.js` exists with proper display-only architecture
- **Defect #5 is REAL**: `sharedFatigueEngine.js` uses underscore syntax (`front_delts`, `mid_back`, `rear_delts`) instead of canonical hyphens (`front-delt`, `mid-delt`)

### Critical Function Signature Corrections ❌→✅

**WRONG (in initial roadmap):**
```javascript
const fatigue = computeCurrentFatigueScores(db);
```

**CORRECT (actual signatures from functions/fatigue.js):**
```javascript
// Both signatures require explicit parameters, NOT db object
function computeCurrentFatigueScores(lifts, peaks, soreness = [], sensitivity = {}, recoveryHours = RECOVERY_H)
function computeStructuralFatigue(lifts, musclePeaks, soreness = [], sensitivity = {}, recoveryHours = RECOVERY_H)

// Returns: { muscle1: 0-100, muscle2: 0-100, ... } with non-enumerable _raw property

// CORRECT USAGE:
const { musclePeaksFromLifts } = require('./fatigue');
const peaks = musclePeaksFromLifts(db.lifts);
const fatigue = computeCurrentFatigueScores(
  db.lifts,
  peaks,
  db.soreness || [],
  db.profile?.muscleSensitivity || {},
  RECOVERY_H
);
```

**Impact:** All code examples in this roadmap that call these functions need the correction above. See corrected sections below.

---

## Project Overview

**Press Dashboard** is a solo-developer fitness app built on:
- **Frontend:** React (single component in `src/app.jsx`, bundled via esbuild to `public/app.js`)
- **Backend:** Express + Firebase Cloud Functions (1st-gen, single `functions/index.js`)
- **Data:** Firestore (one doc per user, loaded wholesale into `db` object per request)
- **Auth:** Firebase Auth (Google sign-in)
- **External:** Strava (OAuth sync), Apple Health (iOS Shortcut), Gemini (LLM summaries)
- **Tests:** Node's built-in `node --test` (zero dependencies)

**Key Design Principles:**
- Single source of truth for muscle taxonomy, fatigue math, exercise database
- Expertise levels (Beginner/Intermediate/Sport Scientist) are display-only, never affect computation
- Request-scoped state: one user's `db` per request, no cross-request races (1st-gen CF guarantee)
- Explanation layer never decides; it narrates what the engine already chose
- No fabricated numbers (predictions, deltas) — only measured/calibrated outputs

---

## Current State

### What's Built
- ✅ Core recommendation engine (session planning, weekly guidance)
- ✅ Fatigue math (structural, CNS, metabolic; decay rates; injury taper)
- ✅ Exercise database (212 entries) + muscle taxonomy
- ✅ Strength standards, progression logic, recovery personalization
- ✅ Basic UI (tracking, recommendations, settings)
- ✅ Onboarding flow (9 steps)
- ✅ Integration with Strava, Apple Health, Gemini

### What's Half-Done (Unwired Modules)
9 backend modules exist with tests but aren't integrated:
- `activityWeighting.js` — budget allocation for hybrid training
- `brandCalibration.js` — gym-specific personalization
- `exerciseEmgProfiles.js` — EMG lookup tables (36KB)
- `hybridFatigueEngine.js` — multi-activity fatigue (defect: wrong muscle names)
- `limbOptions.js` — limb variation tracking
- `missedTarget.js` — set miss reason tracking (built, not wired)
- `movementEmg.js` — movement-parameter EMG data
- `muscleStandards.js` — muscle strength baselines (duplicate of existing)
- `sharedFatigueEngine.js` — hybrid fatigue ⚠️ **DEFECT #5:** uses underscore muscle names (`front_delts`, `mid_back`) instead of canonical hyphens (`front-delt`, `mid-delt`)

### Junk MD Files to Delete (21 total, ~180KB)
- TRACK_1–5 + variants (work logs from prior AI sessions)
- QUICK_WINS_*, INTEGRATION_*, PANEL_*, MICRO_WIDGETS_* (prompts)
- DEEPSEEK_BACKEND_WIRING_PROMPT.md, CLAUDE_IMPLEMENTATION_BLUEPRINT.md (outdated)
- GROUPED_PROMPTS_INDEX.md, uirefinement.md
- `src/I now have the complete App().md` (session artifact, 164KB)
- `.ARCHITECTURE.md.kate-swp` (editor swap file)
- `.impeccable/` directory (design artifacts)

### Schema Status
✅ **Already in DEFAULTS** (no additions needed):
- `db.runs[]` — ✅ exists
- `db.sports[]` — ✅ exists
- `db.sleep[]` — ✅ exists
- `db.injuries[]` — ✅ exists

---

## Implementation Roadmap: 5 Phases

### Phase 0: Cleanup (~2 hours)

**Deliverable:** Git commit with junk deleted, FEATURES.md updated.

**Tasks:**
1. **Delete 21 MD files:**
   ```bash
   git rm TRACK_*.md QUICK_WINS_*.md INTEGRATION_*.md PANEL_*.md \
     MICRO_WIDGETS_*.md DEEPSEEK_*.md CLAUDE_IMPLEMENTATION_*.md \
     "EXECUTIVE TASK BRIEF FOR CLAUDE.md" GROUPED_PROMPTS_INDEX.md uirefinement.md
   ```

2. **Remove untracked junk:**
   - `src/I now have the complete App().md`
   - `.ARCHITECTURE.md.kate-swp`
   - `.impeccable/` directory

3. **Update `FEATURES.md`:**
   - Replace generic entries with accurate Track A/B/C specs (30 features total)
   - Map to functions: buildUnifiedTimeline, computeHybridFatigue, computeRunLoad, etc.
   - Document defect #5 in sharedFatigueEngine (muscle name mismatch)
   - Finalize feature list as source of truth

4. **DO NOT modify schema** (runs, sports, sleep, injuries already exist in DEFAULTS)

5. **Commit:** `git commit -m "Clean up: remove junk MD files, update FEATURES.md"`

---

### Phase 1: Quick Wins – Core UI Transforms (~6–8 hours)

**Deliverable:** Recommendation-first dashboard with expertise/mode toggles, progressive fatigue, responsive grid.

**6 Priorities (in order):**

#### Priority 1: Expertise Levels Toggle (#3) — 45 min
- **File:** `src/app.jsx`
- **What:** 3-way toggle (Beginner 👁️ / Intermediate 💪 / Scientist 🔬) in header
- **State:** `db.profile.expertiseLevel` (persisted via POST /profile)
- **Logic:**
  - Beginner: hides advanced sections (detailed fatigue, alternatives, recovery %)
  - Intermediate: shows recovery %, muscle breakdown
  - Scientist: shows raw values, confidence %, decay rates
- **Implementation:** Use `functions/expertise.js` functions:
  ```javascript
  import { expertiseAtLeast, expertiseAtMost } from '../functions/expertise';
  
  if (expertiseAtLeast(expertise, 'intermediate')) {
    // show recovery percentage
  }
  if (expertiseAtLeast(expertise, 'scientist')) {
    // show raw values + confidence
  }
  ```

#### Priority 2: Recommendation Intensity Mode (#72) — 30 min
- **File:** `src/app.jsx`
- **What:** 3-way mode toggle (Tracker 📝 / Recommendations 💡 / Coach 🎓)
- **State:** `db.profile.uiMode` (persisted via POST /profile)
- **Logic:**
  - Tracker: logging only, hides recommendations
  - Recommendations: shows session + brief
  - Coach: shows session + alternatives + coaching cues

#### Priority 3: Recommendation-First Dashboard (#1) — 2 hours
- **File:** `src/app.jsx`
- **What:** Reorder panels so "What should I train today?" is hero (S1 above the fold)
- **New Order:**
  1. S3 - Today's Recommendation (hero, bold recommendation)
  2. S4 - Today's Limiting Factor (new, prominent panel)
  3. S1 - Overview (secondary)
  4. S2 - Recovery (if time)
  5. S5 - Detailed Fatigue (collapsed)
- **Styling:** Hero section with gradient bg, limiting factor with color-coded border

#### Priority 4: Progressive Fatigue Explanations (#2) — 1 hour
- **File:** `src/app.jsx`, S5 panel
- **What:** Multi-level fatigue display based on expertise
- **Beginner:** "Structural Fatigue: 45%" (bar only)
- **Intermediate:** + "recovered 75%" + muscle breakdown (chest/back/legs)
- **Scientist:** + raw value, decay rate, confidence %
- **Implementation:** `<details>` tags for expandable explanations

#### Priority 5: Today's Limiting Factor Panel (#4) — 1 hour
- **File:** `src/app.jsx` (new component)
- **What:** Prominent panel showing single biggest constraint
- **Content:**
  - Name (Cardiovascular Fatigue, CNS, Structural, etc.)
  - Score (0–100%)
  - Why (cause)
  - Impact (reduction in max intensity)
  - Recommended actions
- **Styling:** Color-coded border (cardio=blue, structural=orange, connective=yellow)

#### Priority 6: Responsive Masonry Grid (#11) — 2 hours
- **File:** `src/app.jsx`, `src/styles.css`
- **What:** CSS Grid with `grid-auto-flow: dense` to fill gaps
- **Breakpoints:**
  - Desktop (1200px+): 3 columns
  - Tablet (768px–1200px): 2 columns
  - Mobile (<768px): 1 column
- **Panel sizing:** Default 1 unit; hero = 2 units; some = variable

**Total Phase 1: 6.5 hours**

**Testing Checklist:**
- [ ] Expertise toggle persists on reload
- [ ] Mode toggle persists on reload
- [ ] Dashboard reorders: recommendation hero first
- [ ] Beginner mode hides advanced sections
- [ ] Coach mode shows alternatives
- [ ] Grid responsive: 1 col mobile, 2–3 col desktop
- [ ] `npm run build` succeeds
- [ ] No console errors

**Next After Phase 1:** Commit and test before moving to Phase 2

---

### Phase 2: Advanced UI Transforms – Backend Integration (~6–8 hours)

**Deliverable:** 7 new panels integrated into dashboard, using backend functions from Tracks A/B/C.

**Critical: These panels need backend functions that don't exist yet.** Phase 2 assumes Track A/B/C functions are implemented (see Track A/B/C specs below).

#### 1. Unified Timeline (#41)
- **Import:** (Not yet built — needs `functions/analyticsEngine.js`)
- **Panels to build after backend is ready**

#### 2–7. Other panels deferred until backend functions exist

**See Track A/B/C Specifications below for what needs to be built first.**

---

### Phase 3: Backend Integration & Wiring (~4–6 hours)

**Deliverable:** API endpoints return data for Phase 1/2 UI; expertise/mode persisted.

**CRITICAL FUNCTION SIGNATURES (VERIFIED):**

```javascript
// ⚠️ DO NOT call with db object — these require explicit parameters
const { 
  computeCurrentFatigueScores, 
  computeStructuralFatigue,
  musclePeaksFromLifts,
  RECOVERY_H 
} = require('./fatigue');

// CORRECT USAGE:
const peaks = musclePeaksFromLifts(db.lifts);
const fatigue = computeCurrentFatigueScores(
  db.lifts,
  peaks,
  db.soreness || [],
  db.profile?.muscleSensitivity || {},
  RECOVERY_H
);
// Returns: { chest: 45, back: 38, ... _raw: {...} }
```

---

## Track A, B, C Specifications

### ⚠️ NOTE: These tracks need to be implemented as NEW modules

The following specs assume you'll create three new backend modules:
- `functions/analyticsEngine.js` (Track A)
- `functions/hybridFatigueEngine.js` (Track B)
- `functions/runningEngine.js` (Track C)

Each needs to import existing fatigue functions correctly.

### Track A: Advanced Analytics & Forecasting (#41–70)

**7 Core Functions to implement in `functions/analyticsEngine.js`:**

```javascript
const { computeCurrentFatigueScores, computeStructuralFatigue, musclePeaksFromLifts, RECOVERY_H } = require('./fatigue');
const { callGeminiResilient } = require('./gemini');

export function buildUnifiedTimeline(db)
  // Input: db object
  // Returns: [ { date, type, data }, ... ] (types: workout, run, sleep, injury, lift, soreness, thought)
  // Action: Merge db.workouts, db.lifts, db.sleep, db.injuries, db.soreness, db.thoughts into single feed
  // Sort: newest first

export async function generateWeeklyBrief(db)
  // Input: db object
  // Returns: Promise<string> (2–3 sentence AI summary)
  // Action: Build prompt with session count, avg sleep, active injuries, CNS fatigue
  // Calls: await callGeminiResilient(prompt) — returns string or throws

export function computeRecoveryForecast(db)
  // Input: db object
  // Returns: { muscle: { [name]: { completionDate, days } }, cns: { completionDate, days } }
  // Action: Use fatigue.js's decay math to predict recovery dates
  // Formula: days = ceil(currentFatigue / decayRate)
  // Muscle decay: ~15%/day, CNS decay: ~12%/day

export function generateAlternativeWorkouts(db)
  // Input: db object
  // Returns: [ { name, exercises, tradeOff }, ... ] (3 variants)
  // Variants: reduced volume, pattern emphasis, time-optimized
  // Action: Filter today's workout by high-fatigue muscles, propose alternatives

export function computeMovementPatternVolume(db, days=7)
  // Input: db object, days (default 7)
  // Returns: { pattern: { tonnage, muscles: { muscle: tonnage } }, ... }
  // Patterns: squat, hinge, push, pull, carry
  // Action: Sum weight × reps × sets over recent lifts, group by pattern
```

---

### Track B: Hybrid Training Engine (#79–94)

**4 Core Functions to implement in `functions/hybridFatigueEngine.js`:**

```javascript
// ⚠️ Decay rates from sharedFatigueEngine.js (verified):
const DECAY_RATES = {
  structural: 0.15,     // lifting: 15% per day
  cns: 0.12,            // running: 12% per day
  cardiovascular: 0.08, // sports: 8% per day
  connectiveTissue: 0.06 // connective: 6% per day
};

export function computeHybridFatigue(db, day)
  // Input: db object, optional day (defaults to today)
  // Returns: { lifting: {...}, running: {...}, sports: {...}, shared: { cns, cardiovascular, connective } }
  // Action: Apply decay to each modality (workouts, runs, sports) separately
  // Shared: take max across modalities

export function activityWeighting(db, primary, secondary)
  // Input: db object, primary activity, optional secondary
  // Returns: { lifting: { budget, sessions }, running: {...}, sports: {...} }
  // Logic: primary 60%, secondary 30%, tertiary 10% of weekly recovery capacity
  // Calculation: sessions = round(budget × 7 days)

export function allocateWeekly(db)
  // Input: db object
  // Returns: [ { day, activity, intensity, reason }, ... ] (7 days)
  // Constraints: no 2+ hard consecutive days, ≥1 rest/week
  // Thresholds: CNS > 0.8, cardio > 0.85, connective > 0.9 → rest day

export function computeActivityReadiness(db, activity)
  // Input: db object, activity ('lifting' | 'running' | 'sports')
  // Returns: { readiness: 0–1, explanation: string, limits: { maxIntensity, maxDuration } }
  // Readiness = 1 - (weighted fatigue scores)
```

---

### Track C: Running Subsystem (#95–113)

**5 Core Functions to implement in `functions/runningEngine.js`:**

```javascript
export function computeRunLoad(run)
  // Input: run object { distance, duration, intensity, surface?, elevation? }
  // Returns: { load, breakdown: { base, duration, surface, elevation } }
  // Formula: distance × (30 + intensity×70) × durationMult × surface + elevation
  // Surface modifiers: trail 1.15x, track 0.9x, road 1.0x
  // Elevation: +0.05 per 100m

export function estimateVO2Max(db)
  // Input: db object (needs db.runs)
  // Returns: { vo2, trend, racePredictions: { 5k, 10k, halfMarathon, marathon }, confidence }
  // Methods: HR-based (60%) + pace-based (40%)
  // Trend: 'up' | 'flat' | 'down'
  // Race predictions: time strings (MM:SS)

export function computeRunReadiness(db)
  // Input: db object
  // Returns: { readiness: 0–1, limits: { maxIntensity, maxDistance } }
  // Weights: CNS 20%, leg fatigue 35%, cardio 25%, sleep 15%, frequency 5%

export function categorizeRun(run, thresholdPace=5.0)
  // Input: run object, threshold pace in min/km
  // Returns: 'recovery' | 'easy' | 'base' | 'long' | 'threshold' | 'interval'
  // Based on: pace vs threshold + distance + intensity

export function structureRuns(db)
  // Input: db object
  // Returns: { distribution: { easy, moderate, hard }, recommendation: string }
  // Distribution: 70% easy/base, 20% moderate/threshold, 10% hard/interval
```

---

### Phase 4: Testing & QA (~2–3 hours)

**Deliverable:** All tests passing, no regressions, verified on mobile.

**Checklist:**
- [ ] `npm test` passes (backend)
- [ ] `npm run build` succeeds (frontend)
- [ ] Manual testing on desktop (Chrome/Firefox)
- [ ] Mobile testing (375px viewport)
- [ ] Tablet testing (768px viewport)
- [ ] No console errors or warnings
- [ ] Performance: LCP < 2s on desktop

---

### Phase 5: Deployment & Monitoring (~1–2 hours)

**Deliverable:** Code deployed, production verified.

**Steps:**
1. Commit: `git add -A && git commit -m "Phase 0–3: UI transforms + backend integration + Track A/B/C"`
2. Push: `git push origin main`
3. Wait for Firebase deploy (automatic)
4. Test in production
5. Monitor error rates for 24h

---

## Defect #5: sharedFatigueEngine Muscle Name Mismatch

**Status:** ✅ CONFIRMED — File exists, bug is real

**Location:** `functions/sharedFatigueEngine.js`

**Problem:**
```javascript
// Lines with incorrect underscore syntax:
chest: ['chest', 'front_delts', 'triceps'],          // ❌ should be 'front-delt'
back: ['lats', 'mid_back', 'rear_delts', 'biceps'], // ❌ should be 'mid-delt', 'rear-delt'
shoulders: ['front_delts', 'mid_delts', 'rear_delts', 'traps'], // ❌ underscore vs hyphen
```

**Canonical names (from `functions/muscleTaxonomy.js`):**
```javascript
'front-delt', 'mid-delt', 'rear-delt'  // ← CORRECT (hyphens)
```

**Fix:** Find/replace underscore with hyphen in sharedFatigueEngine.js before Phase 3 integration:
```bash
sed -i 's/front_delts/front-delt/g; s/mid_delts/mid-delt/g; s/rear_delts/rear-delt/g; s/mid_back/mid-back/g' functions/sharedFatigueEngine.js
```

---

## Architecture Principles (Must Respect)

### 1. Muscle Taxonomy is Single Source of Truth
- `functions/muscleTaxonomy.js` resolves exercise → muscles
- All fatigue attribution flows through this
- Don't add `if (name.includes('bench'))` checks elsewhere

### 2. Fatigue Math is Canonical
- `functions/fatigue.js` computes structural/CNS/metabolic
- Imported by backend + bundled into frontend via esbuild
- Frontend NEVER re-derives fatigue; import from here

### 3. Expertise Levels are Display-Only
- `functions/expertise.js` decides what UI shows, never what computes
- Engine code NEVER imports expertise.js
- Use `expertiseAtLeast(level, 'intermediate')` to gate detail

### 4. Explanation Layer Explains, Never Decides
- `functions/recommendation.js` narrates what planner chose
- Re-derives planner's own terms; never keeps parallel thresholds

### 5. Request-Scoped State (1st-Gen CF Only)
- Module-level `db` variable is safe (one request at a time)
- Any async work must `await` before `res.send()`, never `.then()` detach

### 6. No Fabricated Numbers
- No predicted strength drops, stimulus deltas
- Only measured/calibrated outputs

---

## File Structure

```
functions/
  ├─ index.js (main Express app, routing)
  ├─ analyticsEngine.js (NEW: Track A — timeline, briefs, forecast)
  ├─ hybridFatigueEngine.js (NEW: Track B — hybrid fatigue, allocation)
  ├─ runningEngine.js (NEW: Track C — run load, VO₂, readiness)
  ├─ fatigue.js (canonical fatigue math — use signatures above)
  ├─ userDoc.js (schema defaults — NO CHANGES NEEDED, runs/sports/sleep/injuries already there)
  ├─ expertise.js (detail-level gating — display-only, use functions)
  ├─ gemini.js (LLM client — callGeminiResilient exists and works)
  ├─ sharedFatigueEngine.js (needs defect #5 fix: underscore → hyphen)
  └─ [other modules...]

src/
  ├─ app.jsx (main React component, will add Phase 1 + 2 features)
  └─ styles.css (masonry grid, responsive breakpoints)

FEATURES.md (canonical scope reference — NEEDS UPDATE for Phase 0)
```

---

## Next Session Checklist

**If you're reading this at token limit reset:**

1. ✅ Have you read this file end-to-end?
2. If not yet started:
   - [ ] Run Phase 0 (cleanup): delete MD files, update FEATURES.md (NO schema changes needed)
   - [ ] Then Phase 1: implement 6 UI transforms
3. If Phase 1 is done:
   - [ ] Implement Track A/B/C backend modules (analyticsEngine, hybridFatigueEngine, runningEngine)
   - [ ] Fix defect #5 in sharedFatigueEngine (underscore → hyphen)
   - [ ] Then Phase 2: add 7 UI panels + CSS
   - [ ] Then Phase 3: backend integration (GET /me, POST /session, etc.)
4. If Phase 3 is done:
   - [ ] Run Phase 4: testing + QA
   - [ ] Then Phase 5: deploy

---

**End of IMPLEMENTATION_ROADMAP.md**  
*Last verified: 2026-08-04*  
*Critical corrections applied to function signatures and defect #5 status.*
