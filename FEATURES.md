# Press — Feature List

The canonical scope list for Press. 134 features across 12 categories, as specified by George.

**No feature is to be removed, merged, renumbered, or marked out-of-scope without George's explicit permission.** If a feature looks redundant, already covered, or wrong, say so and wait — don't quietly drop it. See `CLAUDE.md`.

This file records *what Press is meant to do*, not what is built yet. Implementation status lives in `SPEC-PROGRESS.md`.

## Implementation Tracks

**Track A (Advanced Analytics #41–70):** Unified timeline, recovery forecasting, weekly briefings, alternative recommendations, movement pattern analysis.

**Track B (Hybrid Training #79–94):** Multi-activity fatigue, activity weighting, weekly distribution, readiness scoring for strength/running/sport.

**Track C (Running Subsystem #95–113):** Run load estimation, VO₂ max tracking, run readiness, run categorization, training structure.

---

## I. Core Architecture & Recommendation Engine

1. **Recommendation-First Dashboard Transformation** — Replace the workout-tracker-first UI with a recommendation-first dashboard centered around "What should I train today, and why?", including concise explanations, expandable physiological reasoning, and quantified trade-offs.
2. **Progressive Fatigue Explanations** — Display natural-language reasoning by default, with expandable sections revealing recovery percentages, contributing fatigue factors, and structural, metabolic, and CNS fatigue breakdowns.
3. **Three Information Visibility Expertise Levels** — Implement Beginner, Intermediate, and Sport Scientist viewing modes that alter only information visibility without changing the underlying recommendation engine.
4. **Today's Limiting Factor Panel** — Highlight the primary constraint on today's performance using clear explanations, expected performance impacts, and suggested mitigations.
5. **Exercise Hierarchy Categorisation** — Categorize exercises into Primary Compound, Secondary Compound, and Isolation sections with distinct visual hierarchy.
6. **Interactive Exercise Parameter Sliders** — Replace parameter dropdowns with real-time sliders (angle, grip width, stance width, etc.) that instantly recalculate muscle emphasis, fatigue, load, stimulus, and recovery cost.
7. **Target Muscle Planner** — Allow users to select target muscles first so Press can recommend optimal configurations and loading.
8. **Transparent Override Trade-offs** — Display estimated performance reduction and recovery cost when non-recommended exercises are chosen rather than blocking the selection.
9. **Recommendation Explainability** — Ensure every workout, exercise, and parameter choice explains why it was recommended, why alternatives were rejected, and what changes if another option is chosen.
10. **"What If?" Scenario Simulation** — Provide a simulation mode to compare options before committing, showing predicted effects on performance, fatigue, and stimulus.

## II. Responsive Dashboard & Desktop Masonry Layout

11. **Responsive Masonry Grid** — Replace fixed-height layouts with a responsive masonry-style grid using variable-height cards to eliminate empty whitespace.
12. **Variable Panel Display States** — Equip panels with Collapsed, Standard, and Expanded states that adjust based on expertise level and data density.
13. **Multi-Row and Multi-Column Spanning** — Allow key recommendation and analytics panels to span multiple rows or columns while keeping smaller widgets compact.
14. **Priority Scaling Above the Fold** — Position core recommendation-related panels above the fold on desktop.
15. **Customizable Dashboard Layouts** — Allow users to rearrange, resize, collapse, or hide dashboard panels without altering recommendation logic.
16. **Expertise-Responsive Panel Resizing** — Automatically scale card sizes based on the active expertise level.

## III. Muscle Visualisation & Scientific Transparency

17. **Live Muscle Recalibration Animations** — Animate muscle recruitment and fatigue allocation in real time as parameters change.
18. **Recommended vs. Current Parameter Comparison** — Display visual indicators comparing current configurations against the optimal recommended baseline.
19. **Surface Prediction Confidence** — Expose confidence intervals and statistical uncertainty across advanced views.
20. **Coaching-First System Philosophy** — Ensure every interface element reinforces that Press is an intelligent recommendation engine where logging refines the internal model.

## IV. Expanded Onboarding & Goal Customization

21. **Multi-Goal Selection** — Allow users to select multiple primary and secondary goals.
22. **Smart Goal Defaults** — Automatically suggest sleep, hydration, frequency, and volume targets based on goals.
23. **"Returning After a Break" Baseline** — Include a detraining-aware experience option alongside "New" and "Experienced".
24. **Broad Activity Selection** — Support primary activities including Strength, Running, Hybrid, Team Sports, Endurance, CrossFit, and Other.
25. **Entry-Point Prioritisation Options** — Offer Smart Recommendations, Goal-Based Presets, or Custom Priorities for muscle focus.
26. **Goal-Based Focus Presets** — Provide pre-configured priorities like Balanced Physique, V-Taper, Bigger Arms, etc.
27. **Layered Muscle Region Editor** — Keep body diagrams simple, opening detailed side panels for sub-muscles upon selection.
28. **Replace "Ignore" with "Deprioritise"** — Keep non-target muscles modeled physiologically while lowering priority, reserving total exclusion for rehabilitation.
29. **Sub-Muscle Group Breakdown** — Expand major regions into constituent parts (e.g., Shoulders into anterior, lateral, posterior delts, and rotator cuff).
30. **Future Activity Integration Architecture** — Design onboarding around generalized activity units for smooth future module integration.
31. **Categorised Health & Fitness Service Integrations** — Group integrations into Recovery, Activity, and Strength categories.
32. **Personalised Onboarding Summary Screen** — Conclude onboarding with an overview explaining goals, styles, habits, connected services, and adaptation vectors.
33. **Progressive Disclosure in Onboarding** — Hide advanced technical questions unless requested.
34. **Penalty-Free Step Skipping** — Allow users to skip non-essential steps, noting missing data increases uncertainty rather than blocking features.
35. **Onboarding Recommendation Preview** — Show a sample recommendation preview before entering the app.
36. **Sport-Specific Context Selection** — Allow users to select active sports for baseline fatigue modeling.
37. **Movement Preference Prioritisation** — Allow users to prioritize movement categories to weight recommendations.
38. **Injury & Joint Limitation Profiling** — Capture injuries and restrictions to automatically filter exercise selections.
39. **Equipment Availability Mapping** — Filter exercise selections based on available equipment.
40. **Editable Central Athlete Profile** — Store all onboarding choices in a unified profile that can be modified at any time.

## V. Advanced Analytics, Adaptive Coaching & Forecasting (Track A)

41. **Unified Athlete Timeline** — Display workouts, runs, recovery, sleep, nutrition, injuries, and PRs on a single timeline.
42. **Training Calendar with Predictive Forecasting** — Show future predicted readiness and recovery completion across a calendar view.
43. **Weekly Physiological Coaching Brief** — Generate an AI weekly summary detailing physiological adaptations and progress limiters.
44. **Daily Morning Coaching Brief** — Provide a morning briefing covering recommendations, recovery status, limiting factors, and priority actions.
45. **Adaptive Deload Detection Engine** — Automatically recommend deloads when accumulated fatigue and performance trends signal diminishing returns.
46. **Adaptive Progression Engine** — Continuously adjust volume, intensity, and progression rates based on observed adaptation.
47. **Multi-Horizon Recovery Forecast** — Predict exact recovery completion times for every muscle group, pattern, and CNS state.
48. **Readiness Confidence Indicators** — Display confidence scores of readiness predictions alongside explanations of missing data.
49. **Alternative Workout Plan Generation** — Provide multiple evidence-based options for the day with explicit trade-offs.
50. **Time-Constrained Workout Optimiser** — Rebuild sessions dynamically based on available time limits.
51. **Whole-Body Fatigue Heatmap** — Provide an interactive body map illustrating structural, metabolic, and neural fatigue.
52. **Movement Pattern Fatigue Tracking** — Track volume and fatigue by movement patterns alongside muscles.
53. **Recovery Drivers Decomposition** — Expose specific variables driving daily recovery estimates.
54. **Long-Term Adaptation Forecasting** — Forecast projected strength, hypertrophy, or endurance gains over coming weeks.
55. **Goal Progress Simulator** — Allow users to simulate long-term outcomes based on hypothetical training changes.
56. **Training Consistency Analytics** — Analyze adherence, missed sessions, and recovery consistency.
57. **Automatic Exercise Substitution Engine** — Rank alternative exercises based on stimulus similarity and current fatigue limits.
58. **Intelligent Warm-Up Builder** — Generate dynamic warm-up sequences and mobility drills tailored to the day's workout.
59. **Cool-Down & Recovery Prescriptions** — Recommend post-workout recovery strategies based on session stress.
60. **Bayesian Session Reflection Engine** — Prompt users with targeted questions when actual performance deviates from expectations to update the athlete model.
61. **Exercise Knowledge Cards** — Provide coaching details, purpose, and selection logic for every exercise.
62. **Scientific Evidence Library** — Link fatigue models and algorithms to evidence summaries and primary research.
63. **Recommendation Delta Explanations** — Explain explicitly when daily recommendations change significantly from previous patterns.
64. **Seasonal Periodization Planning** — Support long-term training phases with automated phase transitions.
65. **Integrated AI Coach Assistant** — Embed a chat interface with access to the complete athlete state vector.
66. **Multi-Objective Optimisation Engine** — Simultaneously optimize competing objectives while transparently presenting trade-offs.
67. **Habit Recommendation Engine** — Suggest high-impact behavioral changes expected to improve performance.
68. **Adaptive Physiological Notifications** — Deliver notifications based on physiological readiness thresholds.
69. **Performance Milestone Detection** — Recognize improvements in work capacity and recovery kinetics beyond standard PRs.
70. **Digital Twin Dashboard** — Provide an advanced control panel exposing latent physiological states for full state inspection.

## VI. Flexible Experience Modes & Workout Tracking

71. **Standalone Workout Tracker Mode** — Provide a pure logging mode for users who prefer manual entry while the background engine learns.
72. **Configurable Recommendation Intensity** — Allow users to choose system proactivity (Tracker, Recommendations, Coach).
73. **Manual Workout Builder with Passive Feedback** — Allow manual routine construction with non-intrusive feedback on recovery and stimulus.
74. **Passive Athlete Learning System** — Continuously update fatigue, recovery, and volume models from logged workouts regardless of mode.
75. **Quick-Start Session Templates** — Provide one-tap session starts for common splits.
76. **Progressive Feature Discovery** — Introduce advanced features over time via contextual tips as history grows.
77. **Adaptive Interface Personalization** — Automatically scale interface density based on user interaction frequency.
78. **Seamless Mode Migration** — Allow frictionless toggling between experience modes without data loss.

## VII. Unified Hybrid Training & Multi-Sport System (Track B)

79. **Unified Allocation Architecture** — Allocate total available recovery capacity across lifting, running, and sports within a single engine.
80. **Activity Priority Weighting** — Rank activity types as Primary, Secondary, or Maintenance.
81. **Shared Multi-System Fatigue Engine** — Track local, systemic/CNS, cardiovascular, and connective tissue stress across all training forms.
82. **Universal Weekly Stress Management** — Coordinate hard days and recovery days across modalities.
83. **Intelligent Session Pairing** — Pair complimentary high-stress sessions to preserve recovery windows.
84. **Event & Competition-Aware Tapering** — Adjust training load and tapering automatically around matches or races.
85. **Adaptive Weekly Distribution Engine** — Distribute weekly sessions dynamically based on physiological state.
86. **Activity-Specific Readiness Ratings** — Provide separate readiness estimates for Strength, Running, Sport, and Mobility.
87. **Cross-Activity Trade-Off Quantifier** — Display exact performance trade-offs between modalities.
88. **Automatic Multi-Sport Stimulus Credit** — Credit physiological stimulus from sport and endurance toward overall weekly targets.
89. **Active Recovery & Substitution Scheduling** — Recommend low-stress alternatives when high-intensity capacity is exceeded.
90. **Hybrid Progression Framework** — Manage progression curves independently while capping total systemic stress.
91. **Unified Athletic Overview Dashboard** — Combine strength, running, sport, and recovery trends into one overview.
92. **Goal Conflict Detection & Mitigation** — Identify competing adaptations and recommend realistic compromises.
93. **Generalized Stimulus Decision Engine** — Evaluate every daily recommendation around maximizing adaptation return.
94. **Long-Term Hybrid Pathway Simulation** — Simulate future trajectories over extended timelines.

## VIII. Dedicated Running Sub-System (Track C)

95. **Standalone Running Recommendation Engine** — Provide targeted daily run prescriptions answering "What run should I do today, and why?".
96. **Adaptive Endurance Structure** — Structure running distribution based on adaptive endurance principles.
97. **Physiological Target-Based Running Prescriptions** — Prescribe runs based on heart rate zones and terrain rather than rigid paces.
98. **Running Readiness & Performance Scoring** — Evaluate running-specific readiness combining fitness, load, and efficiency.
99. **Pace-to-Heart Rate Efficiency Tracking** — Track aerobic efficiency changes over time.
100. **Continuous VO₂ Max Estimation Engine** — Estimate VO₂ max trends, confidence intervals, and race times.
101. **Diverse Run Session Categorisation** — Generate structured workouts for recovery, base, long runs, thresholds, and intervals.
102. **Running Injury Risk Mitigation Engine** — Monitor mileage velocity, long-run ratios, and tendon stress to adjust volume.
103. **Lifting & Running Interference Management** — Schedule high-stress running and heavy leg training to avoid exhaustion.
104. **Race Goal Periodization Engine** — Construct macrocycles for target distances with structured training phases.
105. **Coaching-First Running Philosophy** — Prescribe runs based on maximizing adaptation relative to recovery.
106. **Multi-Factor Running Load Engine** — Quantify running stress using distance, duration, pace, heart rate, and elevation.
107. **Acute-to-Chronic Running Load Ratio (ACWR)** — Track acute vs. chronic running stress to guide safe progression.
108. **Running Adaptation Tracking** — Track running economy and threshold speed over time.
109. **Post-Run Feedback & Recalibration** — Analyze post-run metrics to refine future endurance recommendations.
110. **Terrain & Environment Auto-Adjustment** — Adjust pace expectations based on elevation and weather.
111. **Running Biomechanics & Economy Metrics** — Integrate optional running form trends to refine efficiency estimates.
112. **Endurance Athlete Digital Twin** — Combine logs, wearable health data, and recovery kinetics into a predictive model.
113. **Multi-Sport Endurance Integration** — Support combined multi-sport endurance athlete profiles.

## IX. Architectural Integrity & System Modes

114. **Primary Focus Mode Selection** — Set primary modes (Weightlifting, Running, Hybrid, Sport, General) while running the central engine.
115. **Configurable Guidance Persona** — Adjust coaching guidance levels without modifying calculations.
116. **Lightweight Manual Weights Tracker** — Provide a clean logging experience for basic tracking while the background engine builds the state vector.
117. **Frictionless Mode Escalation** — Allow users to toggle between experience modes at any point.
118. **Centralized Unified Athlete Model** — Maintain a single central state vector storing history, recovery, goals, and metrics.
119. **Recommendation Uncertainty & Confidence Framework** — Expose system confidence metrics and uncertainty drivers alongside recommendations.
120. **Continuous Learning Loop Engine** — Process every input through Bayesian updating to continuously refine the digital twin.

## X. Practicality & System Architecture Fixes

121. **Data Degradation Fallback Tier** — Implement an automatic fallback mechanism for missing wearable or health data using subjective proxies and rolling averages without breaking recommendations.
122. **Frictionless Quick-Log Interface** — Provide a fast-logging mode during active workouts to record sets with a single tap, keeping advanced parameters hidden inside drawers.
123. **Explicit Goal Trade-Off Resolver** — Surface transparent trade-off notifications when competing multi-goal combinations are selected, paired with an interactive priority ranker.
124. **Offline-First Local State Sync Architecture** — Cache the local athlete state model and recommendation engine client-side on the device to support full offline usage and deferred background synchronization.

## XI. Modular Micro-Widget Structural Filler System

125. **Hydration Ring Micro-Widget** — A 1-unit compact circular progress ring tracking water intake against daily nutritional and health goals.
126. **Resting Heart Rate Ticker Micro-Widget** — A 1-unit biometric ticker displaying today's resting heart rate alongside variance from the 7-day rolling baseline.
127. **Training Streak Badge Micro-Widget** — A 1-unit minimalist counter tracking consecutive days of training consistency or macro compliance.
128. **NEAT / Step Count Mini-Bar Micro-Widget** — A 1-unit slim horizontal progress bar tracking daily step accumulation against target baselines.
129. **AI Coaching Insight Nugget Micro-Widget** — A 1-unit editorial single-line takeaway driven by the daily physiological briefing engine.
130. **Optimal Training Window Timer Micro-Widget** — A 1-unit subtle indicator showing peak circadian and physiological windows for high-output training.
131. **Today's Muscle Focus Mini-Map Micro-Widget** — A 2-unit mini-silhouette highlighting the primary target region for today's scheduled training session.
132. **Body Weight Delta Tracker Micro-Widget** — A 2-unit trend sparkline showing 7-day scale weight movement relative to bulking or cutting targets.
133. **Weekly Volume Pace Bar Micro-Widget** — A 2-unit progress breakdown showing completed weekly tonnage or running distance versus the target adaptive curve.

## XII. Modular Unit Panel Length & Column Balancing System

134. **Modular Unit Panel Length Engine** — Standardizes all primary widgets and micro-widgets into a strict modular scale (1, 2, 3, and 4 units) summing to a mathematically divisible total (36 units). This enables the layout engine to dynamically balance columns across 2, 3, or 4 grid tracks by filling vertical gaps with micro-widgets, guaranteeing zero vertical dead space while preserving an editorial magazine aesthetic.

## XIII. Multi-User Platform (Commercial)

Press moving from single-user (George) to a real multi-user product. **Correction, 2026-08-05: #135–140 turned out to already be built** (commits `bae1ed2`, `c7f531f`, `0dbadac`, all 2026-07-28, predating this category being added to this file) — added here yesterday as though they were new scope, before checking. Left in place, marked Built, rather than deleted, so this file keeps recording *what Press is meant to do* even where the "meant to" and "already does" happen to coincide. See `.design/feature-brainstorm/USERNAME_AND_COMPARISON.md` for the design behind #135–139, `.design/feature-brainstorm/SELLABILITY_ANALYSIS.md` §2 for why #141 is a prerequisite, and `MASTER_IMPLEMENTATION_PLAN.md`'s Phase 6.5 for what's actually still open. #142 depends on this whole category.

135. **Username & Identity System** *(Built)* — Mandatory unique username (pre-filled suggestion, format rules, case-insensitive uniqueness enforced via a Firestore transaction, rate-limited rename) plus a separate cosmetic display name that's shown to other users as first-name-only.
136. **Open Username Search** *(Built)* — Prefix search over usernames, available to any authenticated user with no prior connection required, in a Settings → Social section.
137. **Follow System** *(Built)* — One-directional, request-based follow (request → accept → both parties notified), feeding the per-category visibility toggles already in Settings (workout sessions visible-by-default to followers; sleep/nutrition/mentor-chat off by default).
138. **Profile View Screen** *(Built)* — Minimal view for non-followers (first name + username + Follow button, no vanity metrics); full view for followers gated by the visibility toggles above.
139. **Muscle Comparison** *(Built)* — Per-muscle strength score and training-stimulus comparison (selectable 7/14/30-day window) between two mutually-followed, mutually-opted-in users; separate opt-in toggle from the general session-visibility one; on-demand, no caching.
140. **Per-User Data Integrations** *(Built)* — Per-account webhook sync token (`POST /sync-token`, shown in Settings) so Hevy/Strava/Apple Health/Shortcut ingestion lands in the right account instead of always resolving to the single hardcoded owner (`PRESS_OWNER_UID` stays as the fallback for un-tokened requests, for backward compatibility with the original account's already-configured Shortcut).
141. **New-Account Safety** *(Built, now regression-tested)* — Guarantee every new account starts genuinely empty: no other account's history is ever cloned into or visible from a fresh signup (closes the class of bug behind the account-data-mixing incident, commit `6b1ce27`). Audited 2026-08-05 against the full username/follow/compare/group-session surface — `loadForUserDoc` (`functions/userDoc.js`) is the only function that ever seeds a new doc, and `loadForUser`'s `PRESS_OWNER_UID` gate is the only call site that ever passes it non-null legacy data; every other `userDocRef` write (follow requests, sync tokens, group sessions) only ever touches a uid's own doc. Locked in with `test/userDoc.test.js`.
142. **Public Ranked Exercise Preferences** *(Built, 2026-08-05 — gating flagged for confirmation, see `MASTER_IMPLEMENTATION_PLAN.md` Phase 7)* — A ranked (not flat) order of favourite exercises per user, publicly visible on their profile. Built from in-app pairwise comparisons ("X vs Y — which do you prefer?", prompted once per overlapping primary muscle on the finish-workout screen when the session includes an exercise sharing a primary muscle with a previously-logged exercise, skippable and non-blocking) plus implicit signals that apply when a comparison is skipped or before any real comparisons exist: logged/imported frequency (raw and recency-weighted) and e1RM improvement trend, at smaller weight than an explicit vote. Bulk workout-history imports pre-seed the ranking from import frequency. Supersedes the flat `favoriteExercises` list's role as "the" preference signal — that list and its existing `FAVORITE_EXERCISE_BONUS` scoring stay as-is unless George says otherwise.
143. **Front-Page Social Panel** *(Built, 2026-08-05)* — A new dashboard section (`S9`, registered in `PANEL_LABELS`/`DOCK_LABELS`/`DEFAULT_PANEL_ORDER` alongside `S1`–`S8`, participates in the panel collapse/masonry-grid/mobile-dock system same as any other section) surfacing #135–137's follow-request/username-search mechanics and #139's muscle comparison directly on the front page, instead of only inside Settings → Social. Settings → Social stays in place as a secondary entry point (additive, not a removal) — both surfaces call the same endpoints and open the same profile-view/`ComparisonScreen` overlays, so there is one implementation behind two entry points, not two to drift apart.
144. **Followed-Users Activity Feed** *(Built, 2026-08-05)* — A feed on the new panel (#143) of recent workout sessions from people the requester follows: date, session name, set count — no likes, reactions, or streak counts, matching `PRODUCT.md`'s anti-gamification stance even though this feature category is its one deliberate exception (see `PRODUCT.md`'s Accessibility & Inclusion roadmap note). Gated by a **new, separate opt-in visibility toggle** (`visibility.feed`, Settings → Social → Visibility), off by default even when the existing "workout sessions visible to followers" toggle is already on — a persistent feed of everything logged is a bigger exposure step than a single session a follower has to visit a profile to see. A followed account's sessions only ever appear when that account has *both* toggles on; checked server-side per account on every request (`GET /feed`, `functions/index.js`), never trusting a client-supplied list. Merge/sort/cap logic lives in `functions/feed.js` (pure, unit-tested in `test/feed.test.js`) with visibility gating and the cross-account Firestore reads kept in `index.js` next to `/compare` and `/account/:username`'s — same read-only, never-through-the-request-scoped-`db`-of-another-account discipline #141 already established.
145. **Interactive First-Encounter Walkthrough** *(Built, 2026-08-05 — Dispatch/Training/Recovery only, see below)* — Spotlight/tooltip overlay that highlights a live control or region with a short caption and steps through a section's sequence, auto-triggering the first time (and only the first time, ever) a given user actually encounters that section — not just once at signup. Distinct mechanism from #76 ("Progressive Feature Discovery… contextual tips as history grows"): #76 is history-driven and ongoing, this is a one-shot per-section reveal keyed off first exposure, with a per-section `profile.walkthroughsSeen` flag and a Settings → Account "Replay Walkthrough" control to reset and re-trigger on demand. A confirmed, scoped exception to `PRODUCT.md` Design Principle #5 — see that file's note under Design Principle #5. Content is real (not stubbed) for Dispatch (S1), Training (S3), and Recovery (S5) only; Sleep (S2), Nutrition (S4), Body (S6), and Records (S7) have no tour content yet and the mechanism simply does nothing for them until a follow-up adds it. (Renumbered from #143 to #145 during the merge of PR #45 alongside PR #42, which had already claimed #143/#144 for the same next-available slot — nothing else renumbered.)
146. **Goal-Aware Zone 2 Cardio Weighting** *(Built, 2026-08-06)* — Extends #97 (Physiological Target-Based Running Prescriptions): when `profile.goals` includes an active `fatLoss` goal, `sessionTypeByReadiness` (`functions/runningRecommendation.js`) biases session-type selection at readiness ≥70 toward steady-state Zone 2 work (`runningPrescription.js`'s `z2`, 60–70% HR reserve — "aerobic threshold, most long runs, general base aerobic," the intensity most associated with fat oxidation as fuel) instead of the higher-intensity intervals/tempo it would otherwise mix in, with the reasoning stated plainly rather than asserted. No change below readiness 70 — recovery/easy there are already Zone 1/2-equivalent. Also the first frontend surface for #95's running recommendation engine at all: a minimal "Today's Run" card in S3 (Training) showing session type, HR range, duration target, and reasoning — `GET /run/recommendation` existed since #97 shipped but nothing rendered it until now.
147. **Session Load Score** *(Built, 2026-08-06)* — A single derived 0-100 "how hard was that" headline number per session (`functions/sessionLoad.js`), Strava-Relative-Effort in spirit: built entirely from `adaptation.js`'s existing per-set stimulus math (`volumeResponsePct` × `rirEffectiveness`, summed across every exercise trained that day), no new physiology. A relative scale, not absolute — framed against the athlete's own trailing sessions (`sessionLoadDelta`), shown as a fourth stat cell ("Load") in S3 (Training) alongside Duration/Output/Month.
148. **Fitness/Fatigue/Form Trend + Deload Suggestion** *(Built, 2026-08-06)* — TrainingPeaks CTL/ATL/TSB-style exponentially-weighted trend over #147's session-load numbers (`functions/performanceTrend.js`, `GET /performance/trend`): 42-day "fitness," 7-day "fatigue," form = fitness − fatigue. Sustained deeply-negative form (≤ −10 for 10+ straight days) surfaces a deload suggestion — propose only, same as `weeklyPlanner.js`'s philosophy, never auto-inserted into the plan. Rendered as a "Form" line + 30-day sparkline under S3's stat row. Deliberately scoped to the trend itself — the "based on variables" correlation half of the original ask (what correlates with the number: sleep, alcohol, macro adherence, split) is `.design/feature-brainstorm/IDEA_LIST_TRIAGE.md`'s reference to `BRAINSTORM.md` #22, a separate correlation engine with its own sample-size-discipline requirement, not built here.
149. **Post-Session AI Commentary ("Atlas")** *(Built prior to this file recording it — retroactively added 2026-08-06, enhanced same day)* — One LLM pass reacting to the just-finished session, triggered directly from `POST /session/complete` (`functions/index.js`), not a scheduled briefing — "Atlas," a distinct persona from the Dispatch/newscast personas, precise and science-grounded. Rendered on the finish-workout screen under "Atlas · Training." Pre-dates #147/#148 but was never recorded in this file; found while researching where to add post-workout commentary for the original ask, which turned out to already exist. **2026-08-06 enhancement:** the prompt and finish screen now also reference #147's session-load number and #148's form trend (delta vs. the athlete's last 5 sessions, current form value) when available, computed fresh against post-save `db.lifts` state rather than a stale pre-request snapshot — closing the gap `.design/feature-brainstorm/IDEA_LIST_TRIAGE.md` flagged: "commentary that doesn't reference a real computed figure is decoration."
150. **Micronutrient Tracking** *(Built, 2026-08-06)* — Vitamins/minerals/fiber/sodium etc. alongside the existing macro tracking, on every logging path. `functions/micronutrients.js` extracts whichever fields a barcode-scanned product actually reports from OpenFoodFacts' `nutriments` object (`/food/barcode` — real measured data, discarded before this) — no fabricated zeros for fields a product doesn't report. Per direct instruction, also extended to the AI-estimate paths (`/nutrition/analyze`'s meal-photo, label-photo, and text-description modes) with an explicit, unmissable "estimated, may not be accurate" label everywhere it's shown, distinct from the barcode path's real-data framing — the two are never presented at the same confidence level. Raw values + EU-NRV-relative percent (`pctRDA`), never a score/badge, per `PRODUCT.md`'s anti-gamification stance. Shown on the current (not-yet-logged) entry in S4's log form and as a daily rollup under S4's macro bars, both absent entirely on a day/entry with nothing micronutrient-bearing rather than a block of zeros. Discovered mid-build that the barcode-scan camera UI (`BarcodeDetector` API + iOS Safari manual-capture fallback) already existed in `src/sections/S4.jsx` — this only had to extend the endpoint and storage, not build scanning from scratch.
151. **Independent Tracking-Category Checkboxes** *(Built, 2026-08-06)* — Replaces `ECHELONS`' 3-preset radio (Training / Training+Recovery / Full System, stored as `profile.trackingLevel`) with two independent checkboxes, Recovery and Nutrition (`TRACKING_CATEGORIES`, `profile.trackingCategories`) — Training itself always on. Expresses combinations the old 3 presets couldn't (e.g. Training + Nutrition, no Recovery). Migrated at read time only, matching `withNewDefaultsAppended`'s pattern for panels — `trackingCategoriesFor()` prefers a saved `trackingCategories` object, falling back to mapping an existing `trackingLevel` string, never rewriting stored data in place. `functions/trackingCategories.js`'s `validateTrackingCategories` guards `POST /profile`'s write side, unit-tested (`test/trackingCategories.test.js`, which also locks the frontend migration map's expected behavior since `src/app.jsx` has no test runner reaching it). **Not included:** #14, the actual "does Training-only mode degrade every panel gracefully" audit the checkboxes make more reachable (any combination, not just the old three) — every panel reading sleep/nutrition data beyond the two already-gated ones (S2/S4) needs checking, per `.design/feature-brainstorm/IDEA_LIST_TRIAGE.md`'s own framing: "the real work, not the toggle UI." Flagged, not silently folded into this entry.
