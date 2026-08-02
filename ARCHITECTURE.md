# Architecture

Technical orientation for a developer new to this codebase. For product/design intent, see `PRODUCT.md`.

## Stack

- **Frontend**: a single React component tree in `src/app.jsx`, bundled by esbuild (`npm run build`) into `public/app.js`. No router, no state library — one root component holds app state and passes it down; sections (`S1`, `S2`, ... `S7`) are the main screens.
- **Backend**: a single Express app (`functions/index.js`) deployed as one 1st-generation Firebase Cloud Function (`exports.api`), fronting all `/api/*` routes.
- **Data**: Firestore, one document per user, loaded wholesale into an in-memory `db` object at the start of each request and written back wholesale on every mutation (`save()`). See "Request-scoped state" below — this is a deliberate simplification, not an oversight.
- **Auth**: Firebase Auth (Google sign-in), verified per-request in Express middleware.
- **External integrations**: Apple Health (via an iOS Shortcut posting to `/shortcut`), Hevy (webhook + backfill + CSV import), Strava (OAuth + periodic sync), Gemini (LLM-generated briefings/newscasts/weekly reviews/mentor chat).
- **Tests**: `node --test` (Node's built-in test runner, zero extra dependencies). Run with `npm test`.

## Directory structure

```
functions/          Backend — deployed as the Cloud Function
  index.js            Express app: routing, request-scoped db state, ingestion,
                       and anything else still too state-coupled to extract safely
  exerciseDb.js        The exercise database (212 entries) — single source of
                       truth for exercise names, muscles, equipment
  muscleTaxonomy.js     Exercise -> muscle attribution, derived from exerciseDb.js
  fatigue.js            All fatigue math (structural/CNS/metabolic, ACWR,
                       injury taper) — one canonical implementation, imported
                       by both the backend and (via esbuild bundling) the frontend
  weeklyPlanner.js      Weekly training guidance (advisory, not a locked schedule)
  sessionPlanner.js     Per-session exercise selection + set/rep/weight scheme
  progression.js        Double-progression weight/rep suggestions
  strengthStandards.js  Bodyweight-ratio strength-level ranking
  recoveryPersonalization.js  Age/training-experience recovery-hours adjustment
  expertise.js          Detail-level gating (Beginner/Intermediate/Sport
                       Scientist): which panels and tabs are visible at which
                       level. Display-only by contract — see below.
  recommendation.js     Why the weekly guidance chose what it chose: reasoning,
                       rejected alternatives, override trade-offs, confidence.
                       Explains, never decides — see below.
  limitingFactor.js     Today's biggest constraint (CNS, metabolic, structural,
                       injury, recovery, sleep), ranked. Reports only thresholds
                       the engine actually acts on — see below.
  parameterExplorer.js  Angle-slider support: what a movement activates at an
                       angle, the best angle for a muscle, and the gap between.
                       Pure lookups over emgActivation.js's tables.
  recoveryForecast.js   When each muscle and the CNS return to trainable. An
                       exact inversion of fatigue.js's decay, not a new model.
  calendarExport.js     RFC 5545 .ics export for a planned session (escaping,
                       75-octet line folding, stable UIDs).
  analytics.js           Pure summary/reporting helpers (data maturity, CSV export, etc.)
  gemini.js              Gemini API client (retry/fallback logic)
  sleepScore.js           Sleep-score calculation

src/app.jsx          Frontend — entire React app in one file, bundled to public/app.js

test/                node:test suite — one file per backend module

public/              Static assets served as-is: index.html, sw.js, body-*.svg,
                     the esbuild output (app.js) — this directory is the deploy target
```

## The muscle-taxonomy architecture

This is the least obvious part of the codebase and worth understanding before touching fatigue/planning code.

`functions/exerciseDb.js` is the single source of truth for "what muscles does this exercise train." Everything else — fatigue attribution, session/weekly exercise selection, progression rounding, the frontend's fatigue display — resolves an exercise name to its muscles via `functions/muscleTaxonomy.js`'s `musclesForExercise(name)`, which:

1. Looks the name up in `EXERCISE_DB` first (exact match, case-insensitive) — this is the path for anything logged through the app's own exercise picker or a well-formed import.
2. Falls back to a small keyword table (`KEYWORD_FALLBACK`) only for names that don't match anything in the database — custom exercises, oddly-named imports. This fallback is intentionally narrow scope; do not add exercise names here that belong in `exerciseDb.js` instead.

This replaced an earlier design where three different files each hand-maintained their own copy of a similar keyword table (backend, frontend, and a third inside `weeklyPlanner.js`'s bucket logic). Those copies drifted independently and had real bugs (a name-substring match where `'ab'` matched inside "Cable", hyphenated names never matching space-separated keywords). If you find yourself about to write a new `if (name.includes('bench'))`-style check anywhere, check whether `musclesForExercise`, `isCompoundExercise`, or `isLowerBodyExercise` (all in `muscleTaxonomy.js`) already covers it — they almost certainly should be extended instead of duplicated.

`functions/fatigue.js` is the same idea for the actual fatigue math: one implementation, imported by the backend directly and bundled into the frontend via esbuild (`src/app.jsx` does `import fatiguePkg from '../functions/fatigue.js'` — esbuild handles the CJS/ESM interop). Frontend-only display code should never re-derive fatigue numbers locally; import from here.

## Detail levels are display-only

`functions/expertise.js` decides what the interface *shows* at Beginner /
Intermediate / Sport Scientist. It must never decide what the app *computes*.
The planner, fatigue maths, progression and exercise selection don't import it,
and today's recommendation is identical at every level — only the amount of
reasoning printed around it changes.

This is load-bearing rather than stylistic: the levels are sold to the user as
a curtain over one engine, so a level that changed a number would make the
recommendation unreproducible between two people looking at the same data.
`test/expertise.test.js` asserts that no engine module references `expertise`
at all, which is the cheapest way to keep the boundary from eroding. If a level
needs to affect a computed value, that's a signal the value belongs in the
athlete profile (like `experienceLevel`, which *is* an engine input and is a
different thing entirely despite the similar name).

## The explanation layer explains, it never decides

`functions/recommendation.js` describes a decision `weeklyPlanner.js` has
already made. It re-derives that planner's own terms —
`computeMusclePriority`'s `(100 - fatigue) + stalenessBoost + focusBonus`, its
`FATIGUE_CEILING` cutoff, its offline exclusions — rather than keeping its own
copy of any threshold. That's the same single-source-of-truth rule the
muscle-taxonomy section describes, for the same reason: two copies of a
scoring rule drift, and here the symptom would be an interface confidently
narrating a formula the engine stopped using.
`test/recommendation.test.js` asserts the explained terms sum to what
`computeMusclePriority` actually returned.

Two things worth knowing before extending it:

- **Rank on `score`, not `freshness`.** `muscleFocus[].freshness` is clamped to
  100 for display. Buckets the planner separated clearly can all show 100, so
  comparing on it makes every pick look like a coin toss. `score` is the raw
  unclamped value and exists for this.
`functions/limitingFactor.js` follows the same rule from the other direction:
it reports a constraint only when a threshold the engine acts on has been
crossed, and states the effect the engine actually applies at that threshold
(`cnsFatigue > 70` → CNS substitution and a 2-session week; `metabolicFatigue
> 60` → `fatigueCeilingFor` 2 working sets; `fatigue >= FATIGUE_CEILING` →
excluded from selection). Its header carries the full threshold-to-behaviour
map, and `test/limitingFactor.test.js` asserts each boundary against the
function that consumes it — so "poor sleep is limiting you today" always cashes
out as a specific multiplier being applied somewhere, never as atmosphere.

One more trap, in `emgActivation.js`'s tables and anything reading them
(`parameterExplorer.js`, the angle slider): those values are **% of each
muscle's own MVIC**, not shares of the exercise. They do not sum to 100 and
legitimately exceed it — a dynamic contraction can beat a static MVIC
reference. Rendering them as a pie, or normalising them so they total 100,
converts a real measurement into a fabricated distribution. `activationAt`
returns them unnormalised and supplies `scale` (the movement's own ceiling
across all its angles) so a bar chart has a real maximum to draw against.

- **No fabricated numbers.** Predicted performance drop, extra recovery hours
  and stimulus deltas are deliberately absent — Press has never compared a
  prediction against an outcome, so there's nothing to calibrate them against.
  Confidence is a level with named causes for the same reason. A test asserts
  those fields stay out of the payload.

## Request-scoped state

`functions/index.js` loads the current user's entire Firestore document into a module-level `db` variable at the top of the request-auth middleware, and every route handler reads/mutates that variable directly, calling `save()` to persist. This works safely *only* because the function is deployed 1st-gen (`functions.region(...).https.onRequest(app)`), which Google Cloud guarantees handles one request at a time per instance — there is no cross-request race. Don't "fix" this into a request-scoped object or add concurrency handling without first checking whether the deployment model has changed; the confirmed-intentional reasoning is documented inline at the top of `index.js`'s `db`-related code.

The corollary: any async work you want to survive past a response being sent (background notifications, a fire-and-forget sync) must be `await`ed *before* `res.send()`/`res.json()`, not detached with `.then()`. The same 1st-gen platform can freeze the instance immediately after the response completes, silently truncating anything still in flight. (This was a real bug, fixed in the `/shortcut` and `/strava/callback` handlers — see git history for the reasoning if you're deciding whether to detach something again.)

## Testing

`npm test` runs everything in `test/`. Coverage is currently the dependency-free backend modules (everything except `index.js` itself, which initializes `firebase-admin` at module load and would need an emulator or heavier mocking to test directly — a natural next step if `index.js`'s route logic keeps growing). When you extract a new pure function out of `index.js` (see the pattern in `analytics.js`/`recoveryPersonalization.js`/`gemini.js`), add a test file alongside it.

There is no frontend test setup — `src/app.jsx` is verified by `npm run build` (catches syntax/import errors) and manual testing. If you add non-trivial pure logic to the frontend, consider whether it belongs in a backend module instead (importable from both sides, and then it's testable).

## Deploy

`.github/workflows/deploy.yml` deploys on every push to `main` — there's no staging environment or manual approval gate. `npm run build` runs as part of `npm run deploy`. Treat `main` as production.
