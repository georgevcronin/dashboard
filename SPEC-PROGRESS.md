# Press — implementation status

Status of the 134 features in `FEATURES.md`. Audited by reading the code at
`4f92227` on 2026-08-03. Kept so a fresh session can pick up without re-deriving
what exists.

`FEATURES.md` is the canonical scope list and nothing may be dropped from it
without George's explicit permission — see `CLAUDE.md`. This file only records
what is *built*.

**Caveat on method:** this is a static read of the source, not a run of the app.
The Built/Partial line is a judgement call in places; each Partial says what is
missing so the call can be checked.

**Suite: 779 tests** (`node --test`), all passing.

**36 built · 37 partial · 61 not touched**

---

## Built (36)

| # | Feature | Where |
|---|---|---|
| 2 | Progressive fatigue explanations | `Detail`, expertise-gated depth |
| 3 | Three expertise levels | `expertise.js` — display-only by contract |
| 4 | Today's limiting factor | `limitingFactor.js`, `LimitingFactorPanel` |
| 5 | Exercise hierarchy | `ROLE_LABELS`, `ExerciseRoleTag` |
| 6 | Parameter sliders | `AngleSlider`, `AxisSlider`, `MuscleCreditBars` |
| 7 | Target muscle planner | `targetMusclePlanner.js`, `TargetMusclePlannerPanel` |
| 8 | Override trade-offs | `RecommendationPanel` comparisons |
| 9 | Recommendation explainability | "Why This" blocks, term-by-term at scientist |
| 11 | Masonry grid | `pressCss.js:41` — `grid-auto-rows:1px`, `row dense` |
| 12 | Panel display states | `panelStates`, `resolvePanelState` |
| 16 | Expertise-responsive sizing | `resolvePanelState(id, states, expertise)` |
| 18 | Recommended vs current | `optimalAngleFor`, "✓ best for X" marker |
| 28 | Deprioritise vs Avoid | 4-way `MUSCLE_FOCUS_OPTIONS`, `DEPRIORITISE_PENALTY` |
| 32 | Onboarding summary screen | Step 7, `ob-summary-row` |
| 38 | Injury profiling | `/injury`, `/injuries`, `offlineMuscles` |
| 39 | Equipment availability | gyms, machine models, `travelMode` |
| 40 | Editable central profile | `POST /profile`, Settings |
| 42 | Calendar + forecasting | `calendarSolver.js`, `GET /plan/calendar`, `CalendarGrid` — day-by-day 7/30-day solve with readiness, plus constraints (recurring/allow-list days, holiday windows, weekly session target, split anchor) in Settings |
| 43 | Weekly coaching brief | `generateWeeklyReview`, `/weekly-review`, S1 (Mon–Wed) |
| 44 | Daily coaching brief | `/briefing`, `/newscast` (mid-day + night editions) |
| 46 | Adaptive progression | `progression.js`, double progression |
| 47 | Recovery forecast | `recoveryForecast.js`, `RecoveryForecastPanel` |
| 49 | Alternative workout plans | `sessionVariants.js`, "Other Ways" |
| 50 | Time-constrained optimiser | Max Length slider, `SHORT_SESSION_MIN` |
| 53 | Recovery drivers | `recoveryDrivers`, `RecoveryDriversPanel` |
| 58 | Warm-up builder | `WARMUP_SCHEME_PRESETS`, threaded through `sessionPlanner` |
| 61 | Exercise knowledge cards | `/coach/:exercise`, `form`/`curveNote`, `ExerciseBrowser` |
| 65 | AI coach chat | `MentorChat`, `/mentor` |
| 71 | Standalone tracker mode | `trackingLevel` |
| 73 | Manual builder + feedback | `PressRowBuilder`, `WorkoutLogger`, Freestyle |
| 74 | Passive learning | fatigue/adaptation/capability update from logs regardless of mode |
| 75 | Session templates | `/workout/template(s)`, S3's Templates panel — save any session's exercise list, one-tap start it later |
| 78 | Mode migration | `trackingLevel` is a profile field; no data loss by construction |
| 116 | Lightweight tracker | same mechanism as 71 |
| 118 | Unified athlete model | single Firestore doc, `userDoc.js` DEFAULTS, request-scoped `db` |
| 121 | Data degradation fallback | `getRecoveryScore` returns null without baseline; rolling averages |

#52 Movement Pattern Fatigue is complete at the engine layer
(`movementPatterns.js`, `GET /movement-patterns`, 6 tests) but nothing renders
it, so it is counted under Partial below.

## Partial (37)

| # | Feature | What's missing |
|---|---|---|
| 1 | Recommendation-first dashboard | Engine exists; layout doesn't. Recommendation sits inside Training, the 3rd panel |
| 10 | What If simulation | Dedicated `WhatIfSandbox` (parameter sliders, side-by-side comparison) removed — superseded by the Plan Ahead calendar, which previews a session's predicted fatigue/stimulus effect (`simulateSession`) before you commit, but doesn't let you compare multiple hand-tuned options against each other |
| 13 | Row/column spanning | Row spanning works via masonry; no column spanning |
| 15 | Customizable layouts | Reorder, hide, collapse — no resize or drag |
| 17 | Live recalibration animation | Bars recalculate live; nothing animates |
| 19 | Prediction confidence | Levels + named causes, no intervals — deliberate, nothing validated |
| 20 | Coaching-first philosophy | Editorial stance, not a discrete build |
| 22 | Smart goal defaults | Sleep/macro targets adapt, but not from a stated goal |
| 23 | Returning-after-break | `estimateAtrophyRate` models detraining; onboarding has no such option |
| 27 | Layered region editor | Flat muscle list; no sub-muscle side panels |
| 29 | Sub-muscle breakdown | Model splits delt/triceps/chest heads; onboarding doesn't expose them |
| 31 | Categorised integrations | Health/Hevy/Strava exist, ungrouped |
| 33 | Progressive disclosure | `echelon` gives lite/full paths, not per-question |
| 34 | Penalty-free skipping | Summary shows gaps without blocking; no explicit skip control |
| 37 | Movement preferences | Compound/Isolation slider only, not movement categories |
| 41 | Unified timeline | `/timeline` built; nothing renders it |
| 45 | Deload detection | Per-exercise deload in `progression.js`; no systemic trigger |
| 48 | Readiness confidence | see #19 |
| 51 | Fatigue heatmap | `public/body-*.svg` + `MiniBodyDiagram`; not the 3-type interactive map |
| 52 | Movement pattern fatigue | Backend built; no UI |
| 54 | Adaptation forecasting | `adaptationCurve` is historical; no forward projection |
| 56 | Consistency analytics | Streaks + session counts; no adherence engine |
| 57 | Substitution engine | Ad-hoc swaps; no ranked stimulus-similarity list |
| 60 | Bayesian reflection | `missedTarget.js` learns from misses; never asks a question |
| 62 | Evidence library | Extensive inline reasoning + wiki; no citations to primary research |
| 66 | Multi-objective optimisation | `weeklyPlanner` scores competing terms and shows the arithmetic |
| 68 | Physiological notifications | Full push stack (`sw.js`, VAPID, `/push/send`); no readiness triggers |
| 69 | Milestone detection | PRs yes; work-capacity and recovery-kinetics milestones no |
| 70 | Digital twin dashboard | Scientist-level Recovery panel; not a full state inspector |
| 72 | Recommendation intensity | Two levels (`workout`/`full`); spec wants three |
| 81 | Shared fatigue engine | `sharedFatigueEngine.js` exists with tests but is unwired — see Open defects #5 |
| 115 | Guidance persona | Detail level adjustable; tone fixed by `TRAINING_ETHOS` |
| 117 | Mode escalation | Works, across two levels only |
| 119 | Uncertainty framework | see #19/#48 |
| 120 | Continuous learning loop | Real updating (capability, sensitivity, recovery hours) — not formally Bayesian |
| 122 | Quick-log | Logger + live sessions + Shortcuts; not single-tap with drawers |
| 124 | Offline-first sync | Service worker caches the shell; no write queue or deferred sync |

## Not touched (61)

- **Layout** — 14 above-the-fold priority
- **Onboarding (7)** — 21 multi-goal · 24 broad activity selection · 25 entry-point
  options · 26 goal presets · 30 activity architecture · 35 recommendation
  preview · 36 sport context
- **Analytics (5)** — 55 goal simulator · 59 cool-down prescriptions · 63 delta
  explanations · 64 seasonal periodization · 67 habit engine
- **Modes (2)** — 76 feature discovery · 77 adaptive personalization
- **Hybrid (15)** — 79, 80, 82–94
- **Running (19)** — 95–113
- **Architecture (2)** — 114 focus mode · 123 goal trade-off resolver
- **Micro-widgets (10)** — 125–133, 134

---

## Open defects, highest value first

### 1. ~~The 100 cap makes What If unable to compare saturated muscles~~ — CLOSED
`computeStructuralFatigue` (`fatigue.js:182`) scores a muscle against its own
historical peak load, then caps at 100. A muscle with little direct history
saturates on almost any volume — so −2 sets and +2 sets both read 100, both
recovery figures decay from 100, and the tool reports byte-identical output for
very different sessions. Live example: three ab exercises pin abs and obliques
at the cap in all five slider positions.

`614973d` made this **legible** — clamped muscles get a `*`, a hatched bar and a
plain statement that the figure is a floor.

Fixed in three parts:
- `cf18ebe` added the `_raw` map to `computeStructuralFatigue` (one formula,
  both values, non-enumerable so existing consumers keep the capped number) and
  routed `whatIfSimulator.js`'s deltas through it.
- `recoveryForecast.js`'s `forecastMuscleRecovery` now decays from `_raw` where
  present, so a muscle at 250% real load no longer reports the same wait as one
  at 110%. The displayed `fatigue` and the `clamped` flag stay capped.
- `applyInjuryTaper` (`fatigue.js:302`) rebuilds `_raw` after its spread. Without
  this the `/summary` path — the only one the dashboard uses — silently dropped
  the uncapped map and reverted to a capped forecast with nothing failing.

### 2. Frontend test coverage is thin
`cf18ebe` added a jest + `@testing-library/react` harness. Before it,
`WhatIfSandbox`, `TargetMusclePlannerPanel`, `AxisSlider` and `MuscleCreditBars`
were verified only by `npm run build`, a free-identifier sweep of the minified
bundle, and manual checking.

This is not theoretical. Two real bugs were invisible to the backend suite:
- **Add to Calendar never worked** (`fa53041`). `foldLine` used `Buffer`, a Node
  global absent in browsers, so the button threw on every click for every user
  from the day it shipped. All 16 calendar tests passed throughout, because
  `npm test` runs where `Buffer` exists. `test/bundleSafety.test.js` now guards
  that whole class by asserting against the built artefact.
- **Train A Muscle offered 13 muscles it could not answer for** (`7ff5b52`).

Note: `npx jest` also picks up `test/app.test.jsx` inside `.claude/worktrees/*`.
Those failures are sibling worktrees being scanned, not real.

### 3. `tibialis` and `core` are unreachable
Nothing in `exerciseEmgProfiles.js` reaches them above the 20% involvement floor,
so they are correctly excluded from Train A Muscle rather than offered as chips
that return nothing. Fixing means EMG data or a lower floor — a data question,
not a code one.

### 4. ~~`test/fatigue.test.js:126` is a wall-clock flake~~ — CLOSED
The `daysAgo(1)` lift had no `start`, so it parsed to midnight UTC. Late in the
day that is ~48h ago, not ~24h, and quads decayed to exactly 25% — failing
`assert.ok(fatigue.quads > 25)` on the boundary. Reproduced at 23:31 UTC. Fixed
by pinning `start` to exactly 24h ago, which is what the test's own comment
always claimed it was testing.

### 5. `sharedFatigueEngine.js` emits muscle names the taxonomy doesn't have
Six of the names its `getMusclesForExercise` returns — `front_delts`,
`mid_delts`, `rear_delts`, `mid_back`, `hip_flexors`, `general` — are absent from
`ALL_MUSCLES`. The taxonomy uses `front-delt`, `mid-delt`, `rear-delt`,
`hip-flexors`. Its 530-line test file tests it against its own names, so the
suite is green and the contract is still wrong. It also matches exercises with
`name.includes('bench')`-style checks, which `CLAUDE.md` bans in favour of
`musclesForExercise`. Currently unwired, so it breaks nothing — fix before
anything reads it.

---

## Next features — engine support already exists

**#57 Automatic Exercise Substitution.** Rank alternatives when equipment,
injury or fatigue rules an exercise out. `substituteForCNS` already does a narrow
version (high-CNS → machine/cable) — generalise it rather than writing a second
picker. Similarity from `musclesForExercise` overlap plus `emgActivation` profile
distance. Must not claim equivalent stimulus, only measurable overlap.
**`scoreWeights` in `targetMusclePlanner.js` is the natural scoring primitive** —
it already ranks any muscle→activation map against current fatigue.

**#41 / #52 need frontends, not engines.** `GET /timeline` and
`GET /movement-patterns` both return finished data that nothing renders.

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

**#59 Cool-Down.** Greenfield, lower value. (#58 shipped in `0d0a42d`.)

**#95–113 Running.** The gate is ~15 lines in `ingestActivity`
(`functions/index.js:663`), which currently keeps only date, sport name, duration
and calories from each Strava activity and discards `distance`,
`average_speed`, `total_elevation_gain`, `average_heartrate` and
`average_cadence` — the exact inputs #97–#111 need. Widen it and write to
`db.runs` as well as `db.workouts`.

---

## Needs a decision from George

- **#64 Seasonal Periodization contradicts `TRAINING_ETHOS`.** The prompt at
  `functions/index.js:1486` states "no rigid periodized templates — adjust
  session to session based on real fatigue and performance, and trigger deloads
  purely from fatigue/performance data, never a fixed schedule." #64 asks for
  macrocycles with automated phase transitions. One of the two has to give.
- **#68 notifications: push or in-app?** The push stack is fully built
  (service worker, VAPID keys, `/push/subscribe`, `/push/send`). Readiness-
  threshold pushes are the engagement mechanic PRODUCT.md's anti-references
  reject; surfacing the same thing in-app isn't.
- **#77 conflicts with #15 and #16.** Three systems would resize the same panels:
  the user (#15), expertise level (#16), and usage frequency (#77). One has to
  own panel size; the others become inputs to it.
- **Build order for #11–16 and #125–134.** Micro-widgets sized to fill column
  gaps (#125–133) and the 36-unit modular scale (#134) are meaningless until the
  grid defines the columns. Building them first means rebuilding them.
- **HRV scoring curve.** `hrvScore = clamp01(hrv/baseline - 0.5)`, so being *at*
  your own baseline earns half of HRV's 40 points and full marks need ~1.5x
  baseline. HRV therefore ranks as the top cost nearly every day. Left alone
  deliberately: changing it moves every historical recovery score, the trend
  chart, and the CNS modulation derived from it.
- **#6 remaining sliders** — `gripWidth` and `stance` need EMG data that isn't in
  the repo. Angle, arm path and grip rotation are real (`PRESS_GRIP_EMG`,
  `FRONTAL_EMG`).
- **#54 / #55 / #94 forecasting and simulators** — all require predicting outcomes
  weeks out. Press has never compared a prediction to an outcome. The honest
  prerequisite is a **calibration loop** (log prediction → compare to actual →
  report error), which is arguably more valuable than any of the three and would
  also unblock the deliberately-absent stimulus figures everywhere else.
- **Onboarding copy is stale.** Step 5's deck still describes "Focus / Ignore /
  Normal" while the buttons below it read Priority / Maintain / Lower / Avoid
  (`src/app.jsx:6771`). One-line fix, but it's user-visible copy.

---

## Large blocks, not next steps

- **#79–94 Hybrid training engine** — shared fatigue across lifting and running.
  `sharedFatigueEngine.js`, `activityWeighting.js` and
  `sessionAllocationEngine.js` landed in `4f92227` with tests but are unwired,
  and `db.runs`/`db.sports` still have no writer. See Open defects #5 before
  wiring any of it.
- **#95–113 Running system** — ~19 features, effectively a second product.
  Blocked on the `ingestActivity` widening described above.
- **#70 / #112 Digital twin**, **#120 Continuous Learning** — needs the
  calibration loop plus hundreds of logged sessions. Research, not a feature.
- **#125–134 Micro-widget and modular grid system** — 10 features, all dependent
  on the grid decision above.
