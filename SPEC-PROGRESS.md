# Refine-the-UI spec — progress and remaining work

Tracking `~/Downloads/Refine the UI.txt` (120 numbered features + 5 architectural
essays). Status as of `1c93c37`. Kept so a fresh session can pick up without
re-deriving what exists.

**Standing constraints:** `main` deploys to production on every push, no staging.
`npm run build` after any `src/app.jsx` change, `npm test` after any
`functions/*.js` change. Extract pure logic into a module with tests rather than
growing `index.js`. No fabricated numbers — see ARCHITECTURE.md's
"no predicted-stimulus figures" rule, which several tests enforce by grepping.

---

## Done (1–20, the interface layer)

| # | Feature | Where |
|---|---|---|
| 1 | Recommendation-first dashboard | `recommendation.js`, `DEFAULT_PANEL_ORDER` |
| 2 | Progressive fatigue explanations | `expertise.js`, `recoveryScore.js` |
| 3 | Three expertise levels | `expertise.js` — display-only by contract |
| 4 | Today's Limiting Factor | `limitingFactor.js`, now session-weighted |
| 5 | Primary/Secondary/Isolation hierarchy | `ExerciseRoleTag` |
| 7 | Target Muscle Planner | `targetMusclePlanner.js` |
| 9 | Recommendation explainability | `recommendation.js` |
| 10 | What If simulation | `whatIfSimulator.js` |
| 11–16 | Masonry grid, panel states, spans, order, customisation | `pressCss.js`, `layoutMasonry` |
| 17 | Live muscle visualisation | `muscleCredit.js`, `MuscleCreditBars` |
| 18 | Recommended vs current config | angle slider delta |
| 19 | Prediction confidence | confidence levels with named causes |
| 47 | Recovery Forecast | `recoveryForecast.js` |
| 48 | Readiness Confidence | `recommendation.js` |
| 49 | Alternative Workout Plans | `sessionVariants.js` |
| 50 | Time-Constrained Optimisation | Max Length slider |
| 53 | Recovery Drivers | `recoveryScore.js` |
| 28 | Deprioritise vs Avoid | `weeklyPlanner.js` |

Partial, deliberately:
- **#6 sliders** — angle, arm path and grip rotation are real (`PRESS_GRIP_EMG`,
  `FRONTAL_EMG`). `gripWidth` and `stance` have **no EMG data in the repo** and
  were left out rather than invented. Needs a data source before it can ship.
- **#8 override trade-offs** — the *which muscles / which are unloadable* half is
  built. Predicted performance drop and stimulus deltas are **deliberately
  absent** and should stay absent until there is outcome data to calibrate them.

---

## Next up — tractable, engine support already exists

Ordered by value per unit of risk.

### 1. #57 Automatic Exercise Substitution
Rank alternatives by similarity of stimulus, fatigue cost and movement pattern
when equipment/injury/fatigue rules one out.
- `substituteForCNS` already does a narrow version (high-CNS → machine/cable).
  Generalise it rather than writing a second picker.
- Similarity should come from `musclesForExercise` overlap + `emgActivation`
  profile distance + equipment, not a hand-written synonym table.
- **Trap:** must report *why* each substitute ranks where it does, and must not
  claim equivalent stimulus — only measurable overlap.

### 2. #52 Movement Pattern Tracking
Fatigue and weekly volume by pattern (horizontal press, vertical press, squat,
hinge, pull, carry, rotation) alongside muscles.
- `exerciseDb.js` entries already carry `pattern` for angle families; check
  coverage across all 212 before assuming it's populated.
- Mirrors the existing per-muscle aggregation in `fatigue.js` — reuse, don't
  re-derive.

### 3. #56 Training Consistency Analytics
Adherence, missed sessions, recovery consistency, which habits track progress.
- Pure reporting over `db.workouts` — belongs in `analytics.js`.
- **Trap:** PRODUCT.md forbids streak mechanics. Report consistency as a
  measurement, never as a reward.

### 4. #63 Explain Recommendation Changes
"Why is today's pick different from yesterday's?"
- Diff two `recommendation.js` outputs; the term-by-term breakdown already
  exists, so this is a comparison layer, not new scoring.

### 5. #51 Fatigue Heatmap
Whole-body structural/metabolic/neural heatmap.
- `public/body-*.svg` already exists and is already driven by fatigue data.
- Mostly a visualisation task. **Must stay colour-blind-safe** (PRODUCT.md) —
  needs a non-colour channel, as the driver bars do.

### 6. #45 Adaptive Deload Detection
Some deload logic exists in `progression.js`/`index.js` — **audit what's there
before building.** Spec wants it triggered purely from fatigue/performance,
never a fixed schedule, which matches TRAINING_ETHOS.

### 7. #58 / #59 Warm-Up Builder and Cool-Down
`warmupScheme` already exists and is threaded through `sessionPlanner`. #58 is
likely a small extension. #59 is greenfield and lower value.

---

## Blocked or needs a decision from George

- **#21–40 Onboarding rebuild** — you chose the engine work over this. Still
  open. #29 (muscle group expansion), #39 (equipment availability) are the two
  with real engine consequences; #39 in particular would make the "No equipment"
  session variant much better, since Press currently only knows `travelMode`.
- **#6 remainder** — needs grip-width/stance EMG data that isn't in the repo.
- **#54 Long-Term Adaptation Forecast**, **#55 Goal Progress Simulator**,
  **#94 Long-Term Hybrid Optimisation** — all require predicting outcomes weeks
  out. Press has never compared a prediction to an outcome. Building these
  honestly means first building the calibration loop (log prediction → compare
  to actual → report error), which is its own project and worth doing before
  any of the three.
- **HRV scoring curve** — `hrvScore = clamp01(hrv/baseline - 0.5)` means baseline
  earns half of HRV's 40 points and full marks need ~1.5x baseline, so HRV ranks
  as the top cost nearly every day. Left alone deliberately: changing it moves
  every historical recovery score. Needs your call.

---

## Large greenfield — separate projects, not next steps

- **#79–94 Hybrid training engine** (shared fatigue across lifting/running,
  cross-activity trade-offs, unified weekly planning). Strava sync exists, so
  the data is partly there, but the shared-load model is genuinely new.
- **#95–114 Running system** (VO₂ max, pace–HR tracking, running load, race
  planner, terrain, form). ~20 features, effectively a second product.
- **#70 / #112 Digital twin**, **#120 Continuous Learning Engine** — the
  Bayesian per-athlete inference layer. Needs hundreds of logged sessions and
  the calibration loop above. Research, not a feature.
- **#116–118 Casual tracking mode / upgrade path** — a second product posture.

---

## Known gap in what's shipped

**No frontend tests exist.** `WhatIfSandbox`, `TargetMusclePlannerPanel`,
`AxisSlider` and the rewritten `MuscleCreditBars` are verified by `npm run
build`, a free-identifier sweep of the minified bundle, and manual checking —
not by rendering. The engine beneath them has full test coverage; the components
have none. If a component-level regression appears, adding a render harness is
probably worth it before the next UI feature.
