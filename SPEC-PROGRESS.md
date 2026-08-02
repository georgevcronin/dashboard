# Refine-the-UI spec — progress and remaining work

Tracking `~/Downloads/Refine the UI.txt` (120 numbered features + 5 architectural
essays). Status as of `7ff5b52`. Kept so a fresh session can pick up without
re-deriving what exists.

**Standing constraints:** `main` deploys to production on every push, no staging.
`npm run build` after any `src/app.jsx` change, `npm test` after any
`functions/*.js` change. Extract pure logic into a module with tests rather than
growing `index.js`. No fabricated numbers — several tests enforce this by
grepping the payload for predicted-stimulus figures.

**Suite: 708 tests.**

---

## Done

**Interface layer (1–20)** — recommendation-first dashboard, progressive
explanations, three expertise levels, Today's Limiting Factor (now
session-weighted), Primary/Secondary/Isolation hierarchy, Target Muscle Planner,
recommendation explainability, What If, masonry grid with panel states and
spans, live muscle visualisation, recommended-vs-current config, prediction
confidence.

**Engine features** — #47 Recovery Forecast, #48 Readiness Confidence,
#49 Alternative Workout Plans (`sessionVariants.js`), #50 Time-Constrained
Optimisation, #53 Recovery Drivers (`recoveryScore.js`), #28 Deprioritise vs
Avoid.

Partial, deliberately:
- **#6 sliders** — angle, arm path and grip rotation are real (`PRESS_GRIP_EMG`,
  `FRONTAL_EMG`). `gripWidth` and `stance` have **no EMG data in the repo** and
  were left out rather than invented.
- **#8 override trade-offs** — the *which muscles / which are unloadable* half is
  built. Predicted performance drop and stimulus deltas are deliberately absent
  until there is outcome data to calibrate them.

---

## Open defects, highest value first

### 1. The 100 cap makes What If unable to compare saturated muscles
`computeStructuralFatigue` (`fatigue.js:182`) scores a muscle against its own
historical peak load, then caps at 100. A muscle with little direct history
saturates on almost any volume — so −2 sets and +2 sets both read 100, both
recovery figures decay from 100, and the tool reports byte-identical output for
very different sessions. Live example: three ab exercises pin abs and obliques
at the cap in all five slider positions.

`614973d` made this **legible** — clamped muscles get a `*`, a hatched bar and a
plain statement that the figure is a floor. It did not fix it.

The fix, and why it hasn't been done: compute the raw ratio once and return both
raw and capped from **one** formula so they cannot drift; keep every existing
consumer on the capped value; let only What If and `recoveryForecast.js` read the
raw one. Provable by fuzzing the capped output against the current
implementation, the way `test/recoveryScore.test.js` already does for
`computeDay`. Not done unreviewed because `computeStructuralFatigue` feeds every
panel, the weekly planner and CNS modulation.

### 2. No frontend tests exist
`WhatIfSandbox`, `TargetMusclePlannerPanel`, `AxisSlider` and `MuscleCreditBars`
are verified by `npm run build`, a free-identifier sweep of the minified bundle,
and manual checking — not by rendering. The engine beneath them is well covered;
the components have none.

This is not theoretical. Two real bugs this session were invisible to the suite:
- **Add to Calendar never worked** (`fa53041`). `foldLine` used `Buffer`, a Node
  global absent in browsers, so the button threw on every click for every user
  from the day it shipped. All 16 calendar tests passed throughout, because
  `npm test` runs where `Buffer` exists. `test/bundleSafety.test.js` now guards
  that whole class by asserting against the built artefact.
- **Train A Muscle offered 13 muscles it could not answer for** (`7ff5b52`).

A render harness is worth building before the next UI feature, not after.

### 3. `tibialis` and `core` are unreachable
Nothing in `exerciseEmgProfiles.js` reaches them above the 20% involvement floor,
so they are correctly excluded from Train A Muscle rather than offered as chips
that return nothing. Fixing means EMG data or a lower floor — a data question,
not a code one.

---

## Next features — engine support already exists

**#57 Automatic Exercise Substitution.** Rank alternatives when equipment,
injury or fatigue rules an exercise out. `substituteForCNS` already does a narrow
version (high-CNS → machine/cable) — generalise it rather than writing a second
picker. Similarity from `musclesForExercise` overlap plus `emgActivation` profile
distance. Must not claim equivalent stimulus, only measurable overlap.
**`scoreWeights` in `targetMusclePlanner.js` is now the natural scoring primitive
for this** — it already ranks any muscle→activation map against current fatigue.

**#52 Movement Pattern Tracking.** Fatigue and weekly volume by pattern alongside
muscles. `exerciseDb.js` carries `pattern`, but only on angle-family entries —
check coverage across all 212 before assuming it's populated.

**#56 Training Consistency Analytics.** Pure reporting over `db.workouts`,
belongs in `analytics.js`. PRODUCT.md forbids streaks, so this must be a
measurement, never a reward.

**#63 Explain Recommendation Changes.** Diff two `recommendation.js` outputs.
The term-by-term breakdown exists, so this is a comparison layer, not new
scoring.

**#51 Fatigue Heatmap.** `public/body-*.svg` exists and is already fatigue-driven.
Mostly visualisation — needs a non-colour channel to stay colour-blind-safe.

**#45 Adaptive Deload Detection.** Deload logic already exists in
`progression.js`/`index.js`. **Audit before building** — may be mostly done.

**#58 / #59 Warm-Up Builder, Cool-Down.** `warmupScheme` is already threaded
through `sessionPlanner`, so #58 is likely small. #59 is greenfield, lower value.

---

## Needs a decision from George

- **HRV scoring curve.** `hrvScore = clamp01(hrv/baseline - 0.5)`, so being *at*
  your own baseline earns half of HRV's 40 points and full marks need ~1.5x
  baseline. HRV therefore ranks as the top cost nearly every day. Left alone
  deliberately: changing it moves every historical recovery score, the trend
  chart, and the CNS modulation derived from it.
- **#21–40 onboarding rebuild.** You chose engine work over this. **#39 equipment
  availability** is the one with real engine consequences — it would make the
  "No equipment" session variant far better, since Press currently only knows
  `travelMode` (bodyweight or not).
- **#6 remaining sliders** — needs grip-width/stance EMG data that isn't in the
  repo.
- **#54 / #55 / #94 forecasting and simulators** — all require predicting outcomes
  weeks out. Press has never compared a prediction to an outcome. The honest
  prerequisite is a **calibration loop** (log prediction → compare to actual →
  report error), which is arguably more valuable than any of the three and would
  also unblock the deliberately-absent stimulus figures everywhere else.

---

## Separate projects, not next steps

- **#79–94 Hybrid training engine** — shared fatigue across lifting and running.
  Strava sync exists so the data is partly there; the shared-load model is new.
- **#95–114 Running system** — VO₂ max, pace–HR, running load, race planner,
  terrain, form. ~20 features, effectively a second product.
- **#70 / #112 Digital twin**, **#120 Continuous Learning** — needs the
  calibration loop plus hundreds of logged sessions. Research, not a feature.
- **#116–118 Casual tracking mode / upgrade path** — a second product posture.
