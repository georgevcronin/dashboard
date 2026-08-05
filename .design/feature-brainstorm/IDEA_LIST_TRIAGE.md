# Idea list triage — 2026-08-05

George dropped a raw list of 17 short topics with no detail, closing with "take these features and flesh them out and brainstorm them." This document does that: each topic gets researched against what's already built (so nothing gets re-proposed), fleshed into a concrete shape, and flagged with what it actually is — a bug, a decision, an already-scoped `FEATURES.md` item, or genuinely new scope.

Per `CLAUDE.md`: nothing here is built yet. Several of these are one-line bug fixes that could just be done; several are real product decisions (pricing, new tracked data categories, scope changes to `FEATURES.md`) that need George's call first. Each entry says which.

---

## 1. Layout transitions

**Read as:** the dashboard grid (drag/resize masonry, Phase 4) and panel collapse/expand snapping instead of animating.

**Current state:** `DashboardGrid` (Phase 4, `f1927da`) does live drag-and-drop/resize; panels have Collapsed/Standard/Wide states (Settings → Dashboard Layout, changelog v-era `1121`). No animation layer confirmed on collapse/resize/reorder — worth a quick pass to check if state changes (collapse, panel resize, mobile section switch) currently snap.

**Shape:** CSS transitions on `height`/`grid-row`/`grid-column` when `panelStates` changes, and on the mobile dock's single-section swap. Must honour `prefers-reduced-motion` per `PRODUCT.md`'s accessibility section — that's a hard requirement here, not a nice-to-have, since this app is explicitly viewed in altered states (post-workout, waking up).

**Flag:** small, self-contained UI polish. Buildable without a scope decision — but "layout transitions" alone is too vague to build blind; needs one sentence from George on *which* transition felt wrong (panel collapse? drag-drop? mobile tab switch?) before touching CSS.

---

## 2. Walkthrough

**Read as:** an onboarding walkthrough/tour, or making the existing onboarding wizard clearer.

**Current state:** `Onboarding` (src/app.jsx:6292) exists, re-runnable via Settings → Account → "Restart Setup" (v-era changelog entry near line 1275). `SPEC-PROGRESS.md` flags one specific stale bit: step 5's copy still describes "Focus / Ignore / Normal" while the buttons read "Priority / Maintain / Lower / Avoid" (src/app.jsx:6771) — a real, cheap, already-identified bug.

**Tension:** `PRODUCT.md` design principle #5 explicitly names "no onboarding copy, no empty-state evangelism" and the appendix of `BRAINSTORM.md` marks "Onboarding wizard/tutorial" `[explicit anti-pattern]`. A guided-tour walkthrough (tooltips pointing at UI elements, "next" buttons) is exactly the pattern the brand voice rejects.

**Recommendation:** fix the stale step-5 copy (one line, no scope question). Do **not** build a tour/tooltip walkthrough without confirming with George first — it cuts against a documented design principle, and #76 "Progressive Feature Discovery" (contextual tips as history grows) is the `FEATURES.md`-sanctioned version of "walkthrough" if that's the actual want.

**Flag:** copy fix = just do it. Guided tour = ask first, conflicts with stated principle.

---

## 3. Check running

**Read as:** audit the running subsystem (#95–113, Track C).

**Current state — audited:** substantially built. Recent commits: `798675b` (hybrid fatigue wired into `/summary` + #95 running engine), `ca81485` (#97 Karvonen HR zones + prescriptions, `functions/runningPrescription.js`), `9691a25` (#101 run session categorisation), `cfc0d0f` (#112/#113 endurance digital twin). `MASTER_IMPLEMENTATION_PLAN.md` Phase 9 confirms the gate that used to block all of this — `ingestActivity` discarding `distance`/`average_speed`/`elevation`/`heartrate` from Strava — is being widened.

**What's still open (from `SPEC-PROGRESS.md`/`MASTER_IMPLEMENTATION_PLAN.md`, not re-derived here):** `#41`/`#52` (timeline, movement patterns) have working backends with no frontend. Running-specific ACWR reuses `coupledAcwr()`, not a second implementation — confirm that's still true post-Phase-9.

**Recommendation:** this reads as "give me a status report," which is what the above is. If "check running" instead means "verify the running recommendations are *correct*" (i.e., a QA pass against real Strava data), that's a different task — worth a one-line clarification.

**Flag:** answered above; no code change implied unless George means QA-testing real output, not an architecture audit.

---

## 4. Clean up setup

**Read as:** either (a) tidy the onboarding wizard flow, or (b) tidy Settings → setup-adjacent tooling (plate calculator, sync tokens, restart-setup).

**Current state:** Settings is organised into 7 collapsible categories per `PRODUCT.md` ("Profile & Training, Dashboard Layout, Targets & Nutrition, Connected Data, Tools, Account, What's New"). No specific mess identified in this pass — this is too vague to act on without George pointing at what's actually cluttered.

**Flag:** needs one concrete example ("the X section has Y and Z that don't belong together") before this becomes actionable. Parking as a question, not a task.

---

## 5. Fix social functions

**Read as:** something's broken in the username/follow/profile/comparison system (`FEATURES.md` Category XIII, `.design/feature-brainstorm/USERNAME_AND_COMPARISON.md`).

**Current state:** #135–141 are marked *Built* in `FEATURES.md`, most recently audited 2026-08-05 (`#141` New-Account Safety, regression-tested against the full username/follow/compare/group-session surface, `test/userDoc.test.js`). No open defect against this area is currently flagged in `SPEC-PROGRESS.md` or `MASTER_IMPLEMENTATION_PLAN.md`.

**Recommendation:** without a repro ("X should happen, Y happens instead"), there's nothing to fix here that hasn't already been fixed and tested this same day. Needs a concrete bug report from George — what broke, for which account, doing what.

**Flag:** blocked on repro steps. Don't touch a just-hardened, just-tested system on a vague "fix it."

---

## 6. Languages

**Read as:** multi-language / i18n support.

**Current state:** `BRAINSTORM.md`'s appendix explicitly cut this — `[scope, single user, not needed yet]`. That reasoning is now stale: `CLAUDE.md` itself says Press is "moving from a single-user personal tool toward a commercial, multi-user product." i18n is a real, large, cross-cutting piece of work (every LLM-generated string in `functions/index.js`'s briefing/newscast/mentor prompts, every static UI string in `src/app.jsx`, date/number formatting) — not a toggle.

**Recommendation:** genuinely worth re-opening given the commercial pivot, but it's a `FEATURES.md`-scope-sized decision (134+ existing features, none currently speak to localisation) — not something to start building from a one-word prompt. Needs a decision: which languages, and whether it's "UI chrome only" or "the AI-generated editorial voice too" (much harder — the brand voice/training-ethos prompts are English-idiom-dependent).

**Flag:** ask George — real scope addition, not a quick build.

---

## 7. Micronutrient tracker

**Read as:** track vitamins/minerals, not just macros.

**Current state:** already identified as a genuine gap in `BRAINSTORM.md` #19 — "Press's food barcode/photo pipeline already resolves to structured macro data — extending the lookup to pull micronutrient fields ... is a data-plumbing change, not a new architecture," modelled on Cronometer's 84-nutrient tracking with category "nutrition scores" (bone/blood/immune).

**Shape:** check whether the barcode/nutrition-lookup data source (whatever's behind `/food/*`) already returns micronutrient fields that are just being discarded on ingest — if so this is genuinely small. If not, it's a data-source swap, bigger. S4 (Nutrition) would need a new sub-view; per `PRODUCT.md` Educated/Sensible voice, no "scores" gamification — raw values + RDA-relative framing (e.g. "62% of RDA"), not a badge.

**Flag:** real feature, already scoped as a gap, not yet in `FEATURES.md`. If George wants this built, it needs a `FEATURES.md` entry first (per `CLAUDE.md`'s "canonical feature list" rule) — recommend adding it under Nutrition rather than building silently.

---

## 8. Check period software

**Read as — genuinely ambiguous, two real readings:**

**(a) Training periodization** — `SPEC-PROGRESS.md` already flags an open contradiction: `FEATURES.md` #64 "Seasonal Periodization Planning" (macrocycles, automated phase transitions) directly conflicts with `TRAINING_ETHOS.md`'s stated principle, baked into the mentor's own system prompt (`functions/index.js:1486`): *"no rigid periodized templates — adjust session to session based on real fatigue and performance... trigger deloads purely from fatigue/performance data, never a fixed schedule."* This is a real, already-identified, unresolved decision — not new research.

**(b) Menstrual cycle tracking** — `BRAINSTORM.md` #7 flagged this as "not applicable to George specifically today" but "a real gap if the app's stated roadmap brings in a female user" — which is exactly the roadmap `CLAUDE.md` now describes. `db.profile` already holds `sex`/`dob`. Shape (per BRAINSTORM.md): optional profile toggle, cycle-phase-aware training/nutrition framing, modelled on Whoop/FitrWoman but kept to Press's existing deterministic-core-plus-editorial-gloss pattern. No period/symptom logging exists anywhere in the codebase today (grepped, confirmed).

**Recommendation:** if (a), the answer is: pick a side, `#64` and `TRAINING_ETHOS.md` can't both be true. If (b), this is a real, previously-flagged gap worth building now that a second real user is the stated direction — but it's new tracked personal health data, which needs its own `FEATURES.md` entry and a data-model decision (new `db.cycle` collection, visibility defaults) before code.

**Flag:** ask George which reading was meant — the two answers are unrelated.

---

## 9. Fix mobile-too-wide widgets and Settings

**Read as:** a real, reproducible mobile layout bug — panels or Settings sections overflowing viewport width.

**Current state:** the desktop masonry grid (2/3/4-column, spanning wide panels at 1380px/1800px breakpoints) is recent (Phase 4, this week's changelog entries). Mobile is supposed to be dock/single-section (`PRODUCT.md`: "the phone dock already shows one section at a time"), but a wide-panel CSS rule added for desktop spanning is a plausible place for a missed `@media` guard to let a "Wide (double-width)" panel state leak onto a narrow viewport, or for a Settings sub-panel to inherit a fixed min-width from a shared class. No `overflow-x`/responsive rule currently found in `src/app.jsx` guarding this specific case in this pass — worth a direct look at the panel width/Wide-state CSS next to the mobile dock render path.

**Flag:** this is an actual bug fix, distinct from the vague items above — but needs a device/browser + which screen (which panel, which Settings section) to reproduce and fix correctly rather than guessing at a CSS patch. Good candidate for a focused follow-up once George names the specific widget(s).

---

## 10. Discuss pro membership prices

**Current state:** zero payments infrastructure exists (`grep` for pricing/premium/subscription/paywall across the repo returns nothing) — confirmed by `SELLABILITY_ANALYSIS.md` §2, which lists "no payments infra" as a known gap, and its appendix in `BRAINSTORM.md` cuts "subscription tier paywall" as `[scope, no payments infra, no commercial model yet]`.

**Existing research to build on, not redo:** `SELLABILITY_ANALYSIS.md` §3 already has a competitive pricing table — Whoop $199–359/yr, Oura $349–499 hw + $70/yr, MacroFactor ~$72/yr no free tier, Fitbod ~$96–192/yr, Hevy Pro ~$24/yr, Levels ~$200+/yr — with the pattern that "a subscription earns its keep when it changes a same-day decision, not when it merely displays more data." §4 ranks Press's real differentiators (deterministic-core-plus-editorial architecture, self-calibrating soreness model, training-ethos intellectual honesty) against what's taste-not-moat (multi-persona newspaper voice, finance tracking).

**Recommendation:** this is a discussion, not a build — the inputs are already assembled. Worth a direct conversation: what tier structure (single paid tier vs. freemium), what's gated (the differentiators §4 ranks highest — adaptive macro/expenditure, muscle-comparison, running system — are the actual candidates for a paywall; commodity features like PR tracking shouldn't be gated per the "same-day decision" pattern). This also can't be scoped seriously until Phase 6.5's structural liabilities (§2: single-owner webhooks, no real onboarding/account isolation) are closed — you can't sell seats to an architecture that still silently clones one account's data into another's, which is exactly the incident `#141` fixed.

**Flag:** ready to have this conversation now; no research gap blocking it.

---

## 11. Performance number after a workout

**Read as:** a single post-workout summary metric — "how good was that session," not just "here's what you logged."

**Current state:** closest existing things: `sessionStimulusScore(numSets, avgRIR)` (`adaptation.js`) computed on demand but never surfaced as a headline number; the Phase 7 finish-workout comparison prompt ("X vs Y — which do you prefer?") exists but answers a different question (preference, not performance). Nothing currently rolls a session into one "how did that go" figure the way Strava's Relative Effort does.

**Shape (already scoped in `BRAINSTORM.md` #10):** "Relative Effort / session-load score independent of duration... Press's CNS/metabolic fatigue functions are close to this already; a single derived 'session load' number... would let the weekly planner's `weekCNS`/`weekMetabolic` inputs be shown to the user directly instead of staying internal." That's the shape: deterministic, reuses existing fatigue math, no new data source.

**Flag:** genuine gap, already researched, not yet built or in `FEATURES.md`. Natural pairing with #12 below (same number, tracked over time) — build them together rather than as two separate features.

---

## 12. Trend tracking of performance number based on variables

**Read as:** once #11 exists, chart it over time and explain what's driving it up/down.

**Current state:** directly matches `BRAINSTORM.md` #11 (CTL/ATL/TSB-style fitness/fatigue/form chart — TrainingPeaks' 42-day/7-day exponential-weighting model applied to Press's session-load numbers, "once #10 exists") and #12 (auto-detected deload suggestion once that trend goes deeply negative for N weeks — "propose, not silently insert," matching `weeklyPlanner.js`'s existing philosophy). Also connects to `BRAINSTORM.md` #22, the generalized correlation engine ("what correlates with what," gated by sample-size discipline so it never reports insufficient-n as a null finding) — that's the "based on variables" half: which inputs (sleep, alcohol, macro adherence, training split) actually move the performance number.

**Flag:** three already-researched ideas (#10→#11→#22 in BRAINSTORM.md) stacked into one ask. Real, valuable, sequenced correctly in that doc already — build #11 (the number) before #12 (the trend) before the correlation layer.

---

## 13. Add zone-two cardio recommendation for weight loss

**Current state — closer to done than it looks:** `functions/runningPrescription.js` already implements a full 5-zone Karvonen HR-zone model (`karvonen5Zones`), with `z1` defined as "Aerobic threshold, most long runs, general base aerobic" — that *is* Zone 2 in the popular framing, it's just not labelled "Zone 2" anywhere user-facing, and it's wired into running prescriptions generally, not specifically pitched as a weight-loss recommendation.

**Shape:** this is mostly a framing/labelling and recommendation-logic addition, not new math — (1) surface the existing z1 range explicitly as "Zone 2" with its HR range, (2) add a deterministic rule: when a user's goal includes weight loss (`db.profile.goals`), the running/cardio recommender should weight toward z1/z2 sessions (steady-state, fat-oxidation-favouring intensity) rather than defaulting to higher zones, with the physiological reasoning stated plainly (`PRODUCT.md`'s "earned confidence" — cite the actual mechanism, not "burn more fat" marketing language). Fits `FEATURES.md` #97 (already-built "Physiological Target-Based Running Prescriptions") as a goal-aware extension, not a new engine.

**Flag:** small, mostly wiring existing zone math into the goal-based recommendation path. Reasonable to just build once confirmed this is specifically about the running/cardio recommender and not a new standalone feature.

---

## 14. Fully transform the workout-only mode into just showing training

## 15. Make "level of tracking" a tick-box selection like the exercise-type selection

**These two are the same system — merging them.** Found the exact existing feature both are describing: `ECHELONS` (src/app.jsx:164), the onboarding step-5 / Settings tracking-level selector:

```
workout        → "Training" — workout logging, fatigue model, PRs, AI-planned sessions
workout_sleep  → "Training + Recovery" — adds sleep/HRV
full           → "Full System" — adds nutrition, macros, meal photo scanning, fuel briefings
```

This is currently a **single-select radio** (one of three fixed presets), stored as `profile.trackingLevel`, gating `showSleep`/`showFuel` elsewhere in the render tree (src/app.jsx:9845-9850). It is not independent checkboxes — you can't currently pick "training + nutrition, no sleep," for instance, and the note at line 9821/9850 ("trackingLevel's own s2/s4 gating still applies on top of the user's own [panel choices]") suggests the gating is layered rather than a single source of truth, worth checking for edge cases while touching this.

**#15, fleshed out:** replace the 3-preset radio with independent checkboxes — Training / Sleep / Nutrition (and presumably Recovery, Body, Records follow from Training being on, same as today) — any combination, not just the three pre-baked ones. Directly matches how the user phrased it ("tick box like the selection of what types of exercises").

**#14, fleshed out:** when Training is the *only* box ticked, "workout-only mode" should genuinely be workout-only — not just hiding S2/S4 panels while Recovery/Body/Records still show half-populated or empty-state UI that assumes nutrition/sleep data exists. This means auditing every panel that reads sleep/nutrition data (Recovery's sleep-debt inputs, Dispatch's briefing copy, the mentor's context) for graceful degradation when those categories are off, not just the two panels currently gated (`showSleep`, `showFuel`).

**Recommendation:** #15 (checkboxes instead of radio) is a genuinely well-scoped, contained UI + one profile-field-shape change. #14 (full audit of every panel's behaviour under partial tracking) is bigger — it's the real work, not the toggle UI. Do them together: #15 without #14 just creates more ways to reach a half-broken partial-tracking state that already sort-of exists with the 3-preset version.

**Flag:** ready to scope as a real feature. Needs a `FEATURES.md` decision on whether this replaces the existing echelon system's description (#71 "Standalone Workout Tracker Mode" already exists in scope; this would be its concrete data-model shape) or is additive — recommend asking George before changing `profile.trackingLevel`'s shape from a string enum to a set, since it's a stored-data migration, not just a UI change.

---

## 16. Add findable citations of sources of studies for why we do specific things

**Current state:** partially built, inconsistently. `RUNNING_SCIENCE.md` already cites real sources inline (e.g. "Aarhus University / Garmin-RUNSAFE study (N=5,205 runners, 18 months), 2024–2025, unpublished pre-print" — appears 3 times across the doc, used to justify the single-session-distance-spike injury logic in `runningPrescription.js`/`runningCategorization.js`). That's a citation *in the design doc*, not surfaced anywhere in the app UI. `FEATURES.md` #62 "Scientific Evidence Library" ("link fatigue models and algorithms to evidence summaries and primary research") is exactly this feature, already in scope, not yet built — `SPEC-PROGRESS.md`'s "later/long tail" list defers it alongside #60/#66-70.

**Shape:** a `SOURCES` or evidence-map data structure (module-level, near `muscleTaxonomy.js`/`emgActivation.js`/`vo2max.js` — the files whose formulas already come from specific research, per the earlier grep) mapping a computation (structural fatigue decay, VO₂max estimation, Karvonen zones, RUNSAFE-based injury flags, the soreness-calibration nudge) to its real citation, then surfaced via #61 "Exercise Knowledge Cards" and/or #27 in `BRAINSTORM.md` ("Ask why" drill-down — when a number is shown, let the user ask the mentor why, and have it cite the actual source for *that* formula, not a generic explanation).

**Recommendation:** genuinely valuable, fits the "Educated" brand voice precisely (assumes intelligence, doesn't just assert), and the hard research work is partially already done for the running subsystem — the gap is (a) doing the same citation-gathering for the strength/fatigue/nutrition formulas that don't have it yet, and (b) building the surface (#62) to show it. Real, multi-formula research effort — not a quick pass.

**Flag:** `FEATURES.md` #62, already scoped, not yet built. Good candidate to actually build — recommend starting with the formulas that already have citations sitting in docs (running) before doing new research for the rest.

---

## 17. Add swimming and biking on top of running

**Current state:** confirmed via `ingestActivity` (functions/index.js:715-716) — Strava activities are filtered with `const isRun = /run/.test(sportType)`, so swim/bike activities from Strava are currently discarded entirely, not partially tracked. This is the exact gate `SPEC-PROGRESS.md` already names as blocking the whole running subsystem ("~15 lines in `ingestActivity`... currently keeps only date, sport, duration, calories... discards distance/speed/elevation/heart rate") — swim/bike would need the same widening, plus their own load/zone math (cycling and swimming have different HR-to-effort relationships than running; `FEATURES.md` #113 "Multi-Sport Endurance Integration" is the already-scoped umbrella for this).

**Recommendation:** natural, cheap follow-on once the `ingestActivity` widening for running (already underway per Phase 9) lands, since the plumbing (Strava sport-type dispatch, `db.runs`-equivalent storage, Karvonen zones) is shared. Swim-specific stroke analysis and bike-specific FTP/power-meter features were explicitly cut in `BRAINSTORM.md`'s appendix as `[hardware]`/`[scope]` — this should stay to what Strava already reports (distance, duration, HR, elevation for rides; distance/duration/HR for swims), not chase power-meter-grade cycling metrics.

**Flag:** genuinely sequenced correctly behind the running work already in flight. Worth confirming with George whether this becomes its own `db.rides`/`db.swims` or a generalized `db.cardio` keyed by sport type — the latter avoids three near-identical collections and matches #79 "Unified Allocation Architecture"'s framing better.

---

## 18. "After-workout commentary" — the closing feature itself

Read literally, this is its own idea, not just an instruction to brainstorm the rest: AI editorial reaction immediately after a session ends, not just the next scheduled Dispatch briefing.

**Current state:** Press already generates multi-persona editorial content on a schedule (morning briefing, midday/evening newscasts, weekly review — `generateMorningBriefing`/`generateNewscast`/`generateWeeklyReview`) and has the Phase 7 finish-workout comparison prompt as the only *event-triggered* (not scheduled) piece of UI at session-end. Nothing currently generates prose immediately after a workout finishes.

**Shape:** reuses the exact pattern `BRAINSTORM.md` already establishes — deterministic core (session-load number from #11 above, delta vs. recent sessions, which muscles are now most fatigued) + one LLM pass in the existing editorial voice, triggered by `/session/complete` rather than a cron schedule. Closest prior art in the same doc: #26 (weekly form editorial) and #28 (contradiction surfacing between data sources) — same `callGemini` + training-ethos system-prompt pattern, new trigger point instead of new architecture. Also the natural home for #11's session-performance number once it exists — "commentary" without a number to react to is just more prose, which `PRODUCT.md`'s "data before decoration" principle argues against.

**Recommendation:** don't build this before #11 (the performance number) — commentary that doesn't reference a real computed figure is decoration, not editorial. Sequence: #11 → #18, using the existing newscast/briefing machinery for the actual generation.

**Flag:** real, well-precedented feature idea, not yet in `FEATURES.md`. Worth adding once #11 exists to react to.

---

## Summary — what's actually actionable right now

| # | Topic | Status |
|---|---|---|
| 2 | Onboarding step-5 stale copy | **Just fix it** — one line, already identified in `SPEC-PROGRESS.md` |
| 9 | Mobile-too-wide widgets/Settings | **Real bug** — needs George to name the specific widget/screen, then fix |
| 10 | Pro membership prices | **Ready to discuss now** — research already assembled in `SELLABILITY_ANALYSIS.md` |
| 13 | Zone 2 cardio for weight loss | **Small, mostly wiring** existing Karvonen z1 into goal-aware recommendation |
| 3 | Check running | **Answered above** — audited, mostly built, ask if a QA pass was meant instead |
| 5 | Fix social functions | **Blocked** on a repro from George — system was just hardened and tested |
| 1, 4 | Layout transitions, clean up setup | **Too vague** — need one concrete example each |
| 6 | Languages | **Real scope decision** — needs George's call on breadth (UI vs. AI voice) |
| 7 | Micronutrient tracker | **Real feature**, needs a `FEATURES.md` entry before building |
| 8 | Check period software | **Ambiguous** — periodization-vs-ethos conflict, or menstrual tracking; unrelated answers |
| 11, 12, 18 | Performance number → trend → post-workout commentary | **Sequenced feature chain**, build in that order, all need `FEATURES.md` entries |
| 14, 15 | Workout-only mode / tick-box tracking level | **Real feature**, found the exact existing system (`ECHELONS`), needs a data-shape decision before touching `profile.trackingLevel` |
| 16 | Citations of sources | `FEATURES.md` #62, **already scoped**, not built — good candidate to start |
| 17 | Swimming and biking | **Sequenced correctly** behind the in-flight running `ingestActivity` widening |

Nothing in this document has been built. Say which of these to actually start, and in what order — several (#7, #11/#12/#18, #14/#15, #16, #17) need a `FEATURES.md` entry first per `CLAUDE.md`'s scope rule before any code gets written.
