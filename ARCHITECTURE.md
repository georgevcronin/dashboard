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

## Request-scoped state

`functions/index.js` loads the current user's entire Firestore document into a module-level `db` variable at the top of the request-auth middleware, and every route handler reads/mutates that variable directly, calling `save()` to persist. This works safely *only* because the function is deployed 1st-gen (`functions.region(...).https.onRequest(app)`), which Google Cloud guarantees handles one request at a time per instance — there is no cross-request race. Don't "fix" this into a request-scoped object or add concurrency handling without first checking whether the deployment model has changed; the confirmed-intentional reasoning is documented inline at the top of `index.js`'s `db`-related code.

The corollary: any async work you want to survive past a response being sent (background notifications, a fire-and-forget sync) must be `await`ed *before* `res.send()`/`res.json()`, not detached with `.then()`. The same 1st-gen platform can freeze the instance immediately after the response completes, silently truncating anything still in flight. (This was a real bug, fixed in the `/shortcut` and `/strava/callback` handlers — see git history for the reasoning if you're deciding whether to detach something again.)

## Testing

`npm test` runs everything in `test/`. Coverage is currently the dependency-free backend modules (everything except `index.js` itself, which initializes `firebase-admin` at module load and would need an emulator or heavier mocking to test directly — a natural next step if `index.js`'s route logic keeps growing). When you extract a new pure function out of `index.js` (see the pattern in `analytics.js`/`recoveryPersonalization.js`/`gemini.js`), add a test file alongside it.

There is no frontend test setup — `src/app.jsx` is verified by `npm run build` (catches syntax/import errors) and manual testing. If you add non-trivial pure logic to the frontend, consider whether it belongs in a backend module instead (importable from both sides, and then it's testable).

## Deploy

`.github/workflows/deploy.yml` deploys on every push to `main` — there's no staging environment or manual approval gate. `npm run build` runs as part of `npm run deploy`. Treat `main` as production.
