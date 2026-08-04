# Press Dashboard — Master Implementation Plan

**Last Updated:** 2026-08-04
**Supersedes:** the previous version of this file, which assumed a near-empty
Phase 1 (expertise toggle, mode toggle, recommendation-first layout, etc.) —
all of that was already built. `SPEC-PROGRESS.md` is the audited source of
truth; this file sequences what's actually left, against it.
**Owner:** George
**Note:** `SPEC-PROGRESS.md` was last audited 2026-08-03, before this file's
Phase 0-4 work landed (#125-134, #13 spanning, defect fixes/deletions below)
— it doesn't reflect those yet. Trust this file over it for anything Phase 4
or earlier until it's re-audited.

## Ground rules

- **Reuse before rebuild.** Every phase below starts from what already exists
  in the repo. Where a phase needs "new" code, only the genuinely new part is
  new — the surrounding pieces (fatigue math, session generation, EMG tables)
  get called, not re-derived.
- **No parallel implementations.** Two files doing the same job is a defect,
  not a feature — see Phase 0.2.
- **FEATURES.md stays the scope authority.** Nothing here removes a feature
  without saying so explicitly (Phase 4, Phase 5). Anything here that *isn't*
  in `FEATURES.md`'s 134 gets flagged as new scope, not built quietly
  (Phase 7).
- **Defer the speculative.** Forecasting/simulation features (#54, #55, #94,
  #60) need a calibration loop (log a prediction → compare to the actual
  outcome) that doesn't exist yet. Building them first is exactly the
  "does this need to exist yet" case — they stay in the long tail until that
  loop exists.

---

## Phase 0 — Fix what's broken (blocking, do first)

### 0.1 Defect #5 — `sharedFatigueEngine.js` invents its own exercise→muscle map

Not a naming typo to `sed`. The file hand-rolls `getMusclesForExercise()`
with a keyword-matching `muscleMap` (`front_delts`, `mid_back`, `general` —
none of which exist in `ALL_MUSCLES`) and `name.includes('bench')`-style
checks, which `CLAUDE.md` already bans in favour of `musclesForExercise()`.

Root-cause fix: delete `getMusclesForExercise()` entirely, `require`
`musclesForExercise` from `./muscleTaxonomy` (same signature —
`musclesForExercise(exerciseName) → [muscle,...]`, already used at the one
call site, line 151), done. No sed script, no muscle-name mapping table to
maintain in two places.

### 0.2 `hybridFatigueEngine.js` is dead code — and redundant with code that already works

- Uses `export function` (ES modules) in a CommonJS repo — throws if
  `require()`'d, which is why nothing does.
- Invents fields (`session.cnsLoad`, `.structuralLoad`...) that don't exist
  on `db.workouts`/`db.runs`/`db.sports` — bypasses the canonical
  `fatigue.js` engine entirely.
- Zero test coverage, zero callers.

**Correction, traced further:** `sharedFatigueEngine.js`, `activityWeighting.js`
and `sessionAllocationEngine.js` looked like the fix — tested, wired-adjacent —
but tracing their actual inputs shows the same defect as `hybridFatigueEngine.js`:

- `computeSharedFatigue` reads `lift.sessionStimulusScore` as a stored field.
  Nothing ever writes it — the real `sessionStimulusScore(numSets, avgRIR)`
  (`adaptation.js`) is computed on demand, never persisted. Every real lift
  fails the function's own guard and contributes zero.
- `activityWeighting.js` and `sessionAllocationEngine.js` both expect fatigue
  as `{ cns: { current }, cardiovascular: { current }, connectiveTissue: { current } }`.
  No function anywhere produces that shape — the real engine
  (`computeCurrentFatigueScores`) returns a flat per-muscle score map.
- `sessionAllocationEngine.js` additionally fabricates session loads
  (`2200`/`1500`/`800`) and cycles `upper`/`lower`/`full_body` blindly, never
  touching `EXERCISE_DB` or real session generation — a direct violation of
  `ARCHITECTURE.md`'s "no fabricated numbers" principle.
- Their 530-line test file (`sharedFatigue.test.js`) tests all three against
  their own invented shapes, so it stayed green while contributing nothing
  real — the same failure mode `SPEC-PROGRESS.md` already flagged for
  defect #5, just uncaught in the other two files.

All three deleted (`sharedFatigueEngine.js`, `activityWeighting.js`,
`sessionAllocationEngine.js`, `test/sharedFatigue.test.js` — 1,113 lines),
along with the dangling `sessionAllocationEngine` require in `index.js`.
`node --test` stays green (743/743) — none of it was reachable from a real
code path.

---

## Phase 1 — Track B: build on real data, not before it exists

Multi-activity fatigue tracking can't be built — scientifically or
otherwise — before there's real running/sports data to run it on. Resequenced:

1. Apply 0.1, 0.2.
2. **`ingestActivity` widening first** (`functions/index.js:663`): it keeps
   only date/sport/duration/calories from Strava and discards `distance`,
   `average_speed`, `total_elevation_gain`, `average_heartrate`,
   `average_cadence`. Widen the capture, write to `db.runs`/`db.sports`
   (nothing does today). This is the actual prerequisite for Track B *and*
   Track C (#95–113) — one gate, two tracks unblocked.
3. **Then** build hybrid fatigue from what's real, not a parallel invented
   model:
   - Lifting: `computeCurrentFatigueScores` (structural, per-muscle) +
     `cnsLoad` (`fatigue.js`) — both already correct, already used by
     `weeklyPlanner.js`'s `FATIGUE_CEILING`.
   - Running: session-RPE / TRIMP-style load from the real
     pace/HR/duration/elevation data Step 2 makes available — not a distance-only
     heuristic.
   - Cross-activity load management: **the EWMA-based `coupledAcwr()` from
     Phase 3 (Williams et al. 2017, already cited there) is the scientifically
     established tool for exactly this problem** — quantifying combined
     training-load risk across modalities — not a second decay-rate
     simulation with invented per-system constants. One ACWR function, called
     with lifting load and running load, is the correct architecture; a
     `{ cns, cardiovascular, connectiveTissue }` decay simulation invented
     for this file specifically is not.

---

## Phase 2 — Additive UI for engines that already work

No new backend logic in this phase — every item here has a working, tested
function behind it that nothing renders yet.

| # | Feature | Reuse | New |
|---|---|---|---|
| 41 | Unified timeline | Done — `TimelineOverlay`, opened from a teaser card in Dispatch (S1), fetches `GET /timeline` on open, grouped by date | — |
| 52 | Movement pattern fatigue | Done — new "Patterns" tab in S5 (scientist-level, same gate as Types/Adaptation), computed client-side from `movementPatterns.js` bundled straight into the frontend (same pattern as `fatigue.js`), no network round-trip | — |
| 45 | Deload detection | Audited — already done: `progression.js`'s per-exercise stalled-trend reset is surfaced in the UI (`src/app.jsx:3448`), and `weeklyPlanner.js`'s `FATIGUE_CEILING` exclusion + banner covers the per-muscle case. A systemic/whole-program deload is what `TRAINING_ETHOS.md` explicitly rejects | Nothing — building more here contradicts the stated philosophy |
| 57 | Exercise substitution | Done — `substituteForCNS` now scores candidates by `exerciseEmgProfiles.js` stimulus similarity (falls back to the old primary-muscle count when either exercise has no curated profile), not a second picker | — |
| 63 | Recommendation delta explanations | Already done, missed by the audit (landed in `710eb67`, after it) — `computeRecommendation`'s `supersedes` field + `src/app.jsx:4532` render it | — |
| 51 | Heatmap colour-blind channel | Done — the fatigue triptych's colour fill now pairs with a native SVG `<title>` per muscle (hover/focus/screen-reader accessible: "Quads: 62% (moderate)"), plus a `data-fatigue` value that was previously static/stale in the source SVG | — |
| — | Onboarding Step 5 stale copy | — | One-line text fix: deck says "Focus/Ignore/Normal", buttons say Priority/Maintain/Lower/Avoid (`src/app.jsx:6771`) |

---

## Phase 3 — Scientific accuracy (engine-only, no UI)

The valid part of the DeepSeek brainstorm's "Part B" — real fixes, no
deletions, all callable against modules that already exist:

- **Secondary-muscle stimulus ratio** — done. `secondaryMuscleRatio(entry, muscle)`
  in `adaptation.js` uses `exerciseEmgProfiles.js` (the per-exercise profile,
  not the per-pattern angle table — the right primitive since this operates
  on named logged exercises) when curated data exists, falls back to the flat
  `SECONDARY_MUSCLE_WEIGHT` otherwise. Wired into both `computeStimulusContributions`
  (backend) and `liveAdaptationPreview` (frontend, was duplicated) — one
  function, not two copies to keep in sync.
- **Biphasic adaptation curve** — done. Fast (~12h, Clarkson & Hubal 2002) +
  slow (~48h, MacDougall et al. 1995) phases, weighted 0.3/0.7. The combined
  peak isn't at 48h (the fast phase hasn't fully decayed by then) — it's
  ~44.6h, found by numeric search at module load and exported as
  `ADAPTATION_PEAK_H` rather than hardcoded, since 3 frontend spots
  (`liveAdaptationPreview`'s projected-peak timestamp, the Adaptation chart's
  peak marker, Wiki copy) depended on the literal "48". All three now read
  the real constant instead of duplicating the number.
- **EWMA-based ACWR** — done. `coupledAcwr(dailyLoads, targetDate)` in
  `fatigue.js` (Williams et al. 2017), fed a dense day-by-day load map so the
  exponential decay runs on a true daily cadence including rest days. Kept
  the existing "<28 days → null" gate (now literally checking span, where the
  old code's comment claimed that but the code actually gated on load
  volume). `computeACWR(lifts)` is now a thin wrapper — Phase 9 (running)
  calls `coupledAcwr` directly with running load instead of a second ACWR.
- **EMG-weighted backbone coverage** in `weeklyPlanner.js` — done.
  `weightedCoverage(exercise, targetMuscles)` (lifted to module scope from a
  closure so it's directly testable) uses real EMG data when curated,
  positional fallback otherwise. Verified against the exact bug class the
  positional formula was originally written to fix (Sumo Deadlift/Box Squat
  padding, "three lat exercises") — none of those regression tests broke, and
  a new one confirms a real case where the two formulas disagree (Chest
  Dips' triceps EMG (38) is genuinely higher than its own chest EMG (31.7),
  which array position alone gets backwards).

(Recovery-forecast decaying from capped-100 instead of real fatigue — already
shipped, closed Defect #1. Nothing to do here.)

---

## Phase 4 — Dashboard grid rebuild

**Decision revised mid-build.** George's actual requirement (his words):
"i want the grid layout, like we had before, but i want the packing to have
no empty space at all, whether that be dynamic widget style patterning or
that to be drag and resize, or introducing microwidgets having the options
for all people, and having a few preset layout for desktop, on mobile it will
still be the tabs on the bottom." Zero-gap packing is the hard requirement;
the mechanism was left open. The original 12-column-widget-system plan above
would have deleted `layoutMasonry()` (feature #11) to replace pixel-precise
dense packing with a coarser explicit-span system — strictly worse at the one
thing George actually asked for. **layoutMasonry() was kept, not rebuilt.**

**Built:**
- Fixed 3/4-column tracks at 1380px/1800px+ (`pressCss.js`) replacing
  `auto-fill`, so `grid-column: span N` means something predictable.
  `.panel-w2`/`.panel-w3` span classes + `PANEL_WIDE` set (`app.jsx`) give
  Dispatch and Recovery a real default width (#13) — layered on top of
  `layoutMasonry()`'s existing per-pixel dense packing, not replacing it.
  Verified against real production content via live CSS injection (Claude in
  Chrome): correct spanning, no overlap, gaps still zero.
- **Micro-widget structural filler system (#125-134), all 9 widgets +
  the sizing engine.** Same reasoning as above: #134's "modular unit engine"
  goal (fill vertical gaps, zero dead space) is realised by making each
  micro-widget an ordinary short `.panel` grid item that `layoutMasonry()`
  already dense-packs into whatever gap a taller neighbour leaves, rather
  than building a second, competing 36-unit accounting system. `MICRO_WIDGET_UNITS`
  (1 or 2, from FEATURES.md's own per-widget sizing) is kept only as a
  content-density hint, not a layout algorithm.
  - New file `src/sections/MicroWidgets.jsx`: Hydration Ring (#125),
    Resting HR Ticker (#126), Training Streak Badge (#127), Step Count
    Mini-Bar (#128), AI Coaching Insight Nugget (#129), Optimal Training
    Window (#130), Muscle Focus Mini-Map (#131), Body Weight Delta Tracker
    (#132), Weekly Volume Pace Bar (#133) — all built on data the app
    already computes (`s.today`, `s.baselines`, `s.weeklyPlan`, `s.weights`,
    `s.waterToday`, `briefing`), no fabricated numbers.
  - **#130 required real new backend work, not just a display widget.**
    "Optimal Training Window" as spec'd needs a circadian performance
    model; the app had no wake-clock-time data at all (`computeSleepMetrics`
    discarded it, keeping only durations). Added `wakeTimeMs` to
    `shortcutParsing.js`/`functions/index.js` (`db.metrics[k].wake_time_ms`,
    exposed as `today.wakeTimeMs`) from the real Apple Health sleep session.
    Window = wake time + 10-12h, grounded in the circadian core-temperature
    performance rhythm (Atkinson & Reilly, *Sports Medicine* 21(4), 1996)
    anchored to the athlete's own wake time rather than a fixed clock time,
    since peak-performance timing shifts with chronotype (Facer-Childs &
    Brandstaetter, *Current Biology* 25(4), 2015). No synced sleep data →
    widget says so, not a fabricated default.
  - Settings → Dashboard Layout gets a new "Micro-Widgets" reorder/show-hide
    list (`microWidgetOrder`/`hiddenMicroWidgets` on profile), same
    `PanelOrderEditor` component the panel list already uses.
  - Desktop-only, per George's explicit mobile requirement — not rendered
    at all when `isMobile` (no dock entry, no hidden-but-mounted panel).
  - Backend: 2 new tests (`shortcutParsing.test.js`), all 753 backend tests
    pass. Frontend: verified real field shapes (`waterToday`, `baselines`,
    `weeklyPlan.muscleFocus`, `weights`) against the live production
    `/summary` response, including the null/sparse-data fallback paths this
    account currently exercises (no RHR reading today, sparse weight log,
    no wake time yet — pre-deploy).

**Not yet built** (deferred, not dropped — George has not weighed in on
scope for these specifically):
- Drag-and-drop reordering directly on the dashboard (spec'd as one option
  among several for reaching zero-gap, not required now that
  `layoutMasonry()` already delivers that).
- A few named preset desktop layouts (explicitly requested, one-click in
  Settings) — not yet built.

---

## Phase 5 — Plan Ahead

**Feature:** closest match in `FEATURES.md` is `#42` "Training Calendar with
Predictive Forecasting" — worded as readiness/recovery forecasting on a
calendar, not explicitly a session-generating solver with drag/drop. Confirm
with George that #42 is the intended target before building; if it's a
distinct feature, it needs its own `FEATURES.md` entry first (same rule as
Phase 7).

**Decision made:** build as spec'd — replaces `weeklyPlanner.js`'s
`generateWeeklyGuidance` advisory output and deletes `WhatIfSandbox` (#10,
currently Built). Also logged as a removal per `CLAUDE.md` — approved.

**Reuse, not new math:** the per-day work inside the solver is
`pickBackboneExercises` + `generateSessionExercises` (already exist) run
through `simulateSession` (already exists, already returns before/after
fatigue). The genuinely new code is the day-by-day loop that chains these
calls across a calendar window, plus the calendar UI and drag/drop. Don't
re-derive fatigue math to build this.

**Constraint carried over from `TRAINING_ETHOS.md`:** "session to session,
no rigid periodized templates." A fixed 3-week schedule generated once
contradicts that. The stored plan must be treated as provisional — regenerated
from real fatigue data whenever a day changes what actually happened, not
locked in on generation. `Auto` re-solves from current state; the calendar
never becomes a committed program.

---

## Phase 6 — Onboarding gaps + goal system (#21–27)

**Chunk 1 done (#21, #22, #23, #24).** Correction to this section's own
premise, found while starting: there was no `goal` field in `userDoc.js`
DEFAULTS to check, and nothing read one server-side — #21-27 hadn't actually
been started (the diet-goal single-select feeding macro-auto is a separate,
older field, left untouched). Built fresh, via George's own answers on a
round of clarifying questions rather than assumed:

- **#21 Multi-goal.** New `profile.goals` array (`functions/userDoc.js`
  DEFAULTS) — any number of entries, each independently `primary`/
  `secondary`/`minor`, and independently concrete (target + date) or vague.
  Strength and Hypertrophy stay one goal ("Gain Muscle / Strength" — same
  progressive-overload mechanism, different rep range, captured by the
  existing usual-rep-range fields already in Training Background) per
  George's earlier correction. Concrete targets are structured per type, not
  free text, so progress can be computed automatically where real data
  exists: Lose Fat → bodyweight or body-fat %; Gain Muscle/Strength → a
  specific lift (reuses e1RM the same way S7/Personal Records does), Fat-Free
  Mass, or FFMI; Cardiovascular → resting HR (live from day one), a benchmark
  time, or VO₂max (both capture the target now, show "not tracked yet" until
  the Running Subsystem, #95-113, exists — same honesty pattern as the
  Optimal Training Window widget, never a fabricated number); Flexibility/
  Sport → free text, nothing in the app measures either.
- **#22 Smart defaults.** The Daily Targets step's sleep/water/training-days
  steppers prefill from a weighted blend of the goals just picked
  (`suggestTargets()`, `src/app.jsx`) — still fully editable. Multiple
  conflicting Primary goals blend toward the middle rather than one silently
  winning, same principle `applyActivityDefaults()` (below) uses for
  activities.
- **#23 Returning after a break.** Third onboarding experience option.
  `estimateAtrophyRate()` (`adaptation.js`) needs a real logged gap to
  measure, which a brand-new signup doesn't have — `seedReturningAthleteAtrophy()`
  (new `functions/goalsAndActivities.js`) seeds a conservative estimate from
  the self-reported break length instead, using the same
  `DEFAULT_ATROPHY_RATE` constant. `/summary` prefers the real measured rate
  the instant one exists (`estimateAtrophyRate(db.lifts) || ...seed`), so the
  seed is automatically superseded, never needs manual clearing. "New to
  training" never sees the break-length question or any atrophy logic.
- **#24 Broad activity.** `profile.activities` replaces the old single
  `primaryActivity`/`secondaryActivity` pair with the same any-number/
  independently-prioritised shape as goals — expanded from 5 to the full 7
  (`team_sports`, `endurance`, `other` added). `applyActivityDefaults()`
  blends weekly session/volume defaults across every selected activity
  weighted by priority tier, not a single "primary" winner.

New dedicated **Goals dashboard section** (S8, `src/sections/Goals.jsx`) —
dock entry, panel-order settings entry, same as any other section. Shows
current-vs-target for concrete goals where Press has real data to compare
against, a passive trend (weight, resting HR) for vague goals where one
exists, a plain tag otherwise.

Logic extracted to `functions/goalsAndActivities.js` per CLAUDE.md's rule
(validation/blending isn't route glue) — `test/goalsAndActivities.test.js`
covers it, 772/772 backend tests green.

**Not done — #25, #26, #27, deferred to chunk 2** (George's call, to keep
this pass reviewable): entry-point prioritisation (Smart Recommendations /
Goal-Based Presets / Custom Priorities), goal-based focus presets (Balanced
Physique, V-Taper, etc.), and the layered muscle region editor. The existing
flat Priority/Maintain/Lower/Avoid muscle-focus step is untouched and still
functions as the de facto "Custom Priorities" path in the meantime.

---

## Phase 7 — Exercise preferences

**Not currently in `FEATURES.md`.** Straightforward and additive (profile
field, Settings UI, a scoring bonus in `weeklyPlanner.js`) but needs a
`FEATURES.md` entry before or alongside building it — flag for George, don't
add scope silently.

---

## Phase 8 — Structured weekly brief

Upgrade to the already-Built #43 (`generateWeeklyReview`). Adds sections
(goal check, at-a-glance, what's working/needs attention, fatigue trend) on
top of the existing Gemini narrative — reuses `/summary` data and the
existing recovery/recommendation pipeline, no new engine.

---

## Phase 9 — Running subsystem (#95–113)

Blocked on Phase 1's `ingestActivity` widening — nothing populates `db.runs`
until then. Once unblocked: run load, VO₂max estimation, run readiness, run
categorisation. Running ACWR calls Phase 3's `coupledAcwr()` with running
loads — one function, two callers, not a second ACWR implementation.

---

## Later / long tail

`#60`, `#62`, `#66–70`, `#54`, `#55`, `#94` and similar — deferred, not
forgotten. Each needs either the calibration loop noted above, or hundreds of
logged sessions to be meaningful (digital twin, continuous learning). Building
UI for a prediction Press has never validated is the thing YAGNI exists to
catch.

---

## Open items needing a decision (unchanged from prior audit)

- `#64` Seasonal Periodization directly contradicts `TRAINING_ETHOS.md`'s "no
  rigid periodized templates." One has to give.
- `#68` notifications: push stack is fully built; PRODUCT.md's anti-references
  reject the engagement-mechanic version of this.
- `#77` Adaptive Interface Personalization would compete with #15 (user) and
  #16 (expertise) for who owns panel sizing.
- HRV scoring curve (`hrvScore = clamp01(hrv/baseline - 0.5)`) — known-odd,
  left alone deliberately; changing it moves every historical recovery score.
