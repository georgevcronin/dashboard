# Training Ethos

George's training philosophy — this is the standing stance behind every piece of fatigue, planning, and coaching logic in Press. Not a neutral menu of options: the app is opinionated because George is opinionated. Read this before touching `functions/fatigue.js`, `functions/sessionPlanner.js`, `functions/weeklyPlanner.js`, `functions/progression.js`, or the `TRAINING_ETHOS` prompt string in `functions/index.js`.

This is the human-readable, fuller version. `functions/index.js`'s `TRAINING_ETHOS` constant is the condensed form fed directly to the AI mentor's prompt — if the philosophy changes, update both, and keep them consistent (same relationship as `exerciseDb.js` being the single source of truth that everything else resolves against — see `ARCHITECTURE.md`).

## Effort is non-negotiable

Training close to true failure is the baseline, not an option. Always expressed in concrete RIR (reps in reserve) terms — "take that set to RIR 0-1," "RIR 3-4 is too far out, add weight or a rep next time" — never vague language like "push yourself" or "go hard." On any exercise with more than one working set, RIR always decreases set to set: the first working set leaves more in reserve, each subsequent set gets closer to true failure, with the last set at RIR 0-1. Never repeat the same RIR across sets of the same exercise.

## Frequency over volume

Full-body sessions, 2-4x/week. Fewer working sets per session, with volume spread across the week rather than stacked into one session. A muscle hit for 1-2 hard sets several times a week is correctly dosed, not under-dosed — this is a deliberate stance against the "more sets = more gains" instinct, grounded in the idea that mechanical tension near failure drives adaptation regardless of goal (strength vs. hypertrophy), and that frequent, moderate stimulus beats infrequent, maximal stimulus for sustainable progress.

## Fully autoregulated — no rigid periodized templates, no scheduled deloads

Adjust load, sets, and exercise choice session to session based on real fatigue and performance. **This program does not run scheduled deload weeks.** Load reduction is triggered per-muscle, purely from live fatigue/performance data, never from a calendar. If a muscle is overloaded, the answer is "leave that muscle alone for now, train everything else as normal" — never a blanket whole-body pause.

This is a real, deliberate distinction from most mainstream programs (see the app's own Wiki entry, "Why no deload weeks"). It's also why the home-screen fatigue banner names the *specific* over-ceiling muscle(s) rather than declaring a "recovery week" once enough muscles are tired — see the `functions/weeklyPlanner.js` `FATIGUE_CEILING` constant (65%), which is the single shared threshold both the weekly planner and the home-screen banner key off, rather than two independently-drifting numbers.

Per-exercise "deload" — reducing weight on one specific stalled lift after a few non-improving sessions (`functions/progression.js`'s double-progression logic) — is a different, legitimate concept and stays: it's data-triggered and scoped to one exercise, not a scheduled whole-program event. The thing being rejected is the *calendar-driven, whole-body* version, not the word or the underlying mechanic of backing off a specific lift when its own data says to.

## Double progression

Climb reps to the top of the rep range at target RIR, then add weight and drop back down in reps. Reps run 1-9, biased toward the higher end (up to 8-9) — 1-2 reps rarely deliver enough stimulus per set to be worth defaulting to. Stick with an exercise as long as double progression keeps working; only rotate it out once progress genuinely stalls.

## Exercise selection

Favor stable, structured movements (machines, fixed-path, cables) over free-weight variations — specifically because they let effort be pushed to true failure without technical form breakdown becoming the limiter. This is not dogma against barbells; it's a preference for whatever lets intensity go higher safely.

Prioritize lagging muscle groups with extra frequency or volume over already-strong points.

## Warm-up and rest

Warm up with a couple of ramping sets (roughly 60% then 85% of the working weight) before working sets, adjusted by how the day feels. Rest fully between working sets (about 3-4 minutes) — protect effort quality over session speed.

## Working around issues, not backing off broadly

When something hurts or flares up, work around it: swap the offending movement or angle and keep training everything else hard, rather than broadly backing off the whole session or program.

## Cardio stays separate

Keep cardio/conditioning sessions separate from strength sessions so lifting stimulus never gets diluted by concurrent-training interference.

## No copy-paste programs

No program should be copied wholesale — build around the individual's recovery, goals, and response. A caloric surplus without real training stimulus adds fat, not muscle.

## Exercise taxonomy reflects true biomechanical function, not name literals

Exercises are classified (`functions/exerciseDb.js`'s `muscleGroup`/`pattern`/`movementId` fields) by what they actually do, not by parsing words out of their name. Leg Press is a squat pattern, not a "press," despite the name. Pallof Press is anti-rotation core work, not a press. `muscleGroup` is derived from the exercise's own hand-curated `primary` muscle list (first-listed = dominant), never guessed from the name string — most core movement names ("Bench Press," "Squat," "Row") don't contain their target muscle as a word at all.

Pull/row angle affects which muscles dominate a rowing or pulldown movement: a **high** row or pulldown (elbows drive up/out) biases toward the rear delts, traps, and rhomboids; a **low** row (elbows drive down/back) biases toward the lats. (Confirmed against the app's own curated data — High Cable Row's `primary` is `['rear-delt','rhomboids','mid-traps']`, while Seated/T-Bar/Barbell Row's is `['lats','rhomboids','mid-traps']`.) This kind of angle/height detail is useful *descriptive* metadata for browsing and explanation, but should never override an exercise's existing hand-curated `primary`/`secondary` muscle arrays — those already encode more specific, exercise-by-exercise reasoning (see each entry's `curveNote`) than a general angle rule could.

## Fatigue and stimulus are decoupled systems

Structural fatigue (tissue damage, needs to clear before loading a muscle hard again) and stimulus/adaptation (the productive training effect "banked" from recent sessions, which itself decays toward atrophy if not renewed) are tracked separately and can disagree — a muscle can be fatigued *and* well-stimulated at once, or fresh *and* under-stimulated. Don't collapse these into one number; see `ARCHITECTURE.md`'s muscle-taxonomy section and `functions/fatigue.js` vs. `functions/adaptation.js` for how this stays split in code.
