# Task: Wire the analytics + hybrid engines into the Press backend

You are working in a Firebase Functions + React repo (`/home/george/Code/dashboard`). Two new backend modules were written but are **completely unreachable** — nothing imports them, they have no tests, and as written they would crash on load. Your job is to make them work and expose them through an API endpoint.

**Do not add new features. Do not touch the frontend. Do not push or deploy.**

---

## Ground truth about this codebase (verify before trusting anything else)

These are facts checked against the current tree. The previous integration plan got several of them wrong, so read this section carefully.

1. **`functions/` is CommonJS.** `functions/package.json` has no `"type": "module"`. Every other module in `functions/` uses `require(...)` / `module.exports = {...}`. See `functions/analytics.js`, `functions/fatigue.js`.

2. **`GET /me` is NOT the athlete-state endpoint.** It lives at `functions/index.js:222` and only returns identity fields (`uid`, `hasUsername`, `username`, `displayName`, `displayNameFirst`). It gates the mandatory first-login username step. **Do not modify or overwrite it** — breaking it locks users out of the app.

3. **The athlete-state endpoint is `GET /summary`** (`functions/index.js:771`). It returns `profile`, `today`, `liftVolume`, hydration, recovery scores etc. This is what the dashboard reads.

4. **`POST /session` is NOT workout logging.** It's live-session creation — generates a join code and a `liveSessions` Firestore doc (`functions/index.js:2393`). Workout logging goes through `POST /session/complete` (`:2199`) and `PUT /workout/:date` (`:2244`).

5. **`db` and `save` are request-scoped globals** (`functions/index.js:121-123`), populated by the auth middleware per request. This is deliberate — see the "Request-scoped state" section of `ARCHITECTURE.md`. Any async work must be `await`ed **before** `res.json()`; never detach with `.then()`.

6. **Two overlapping modules already exist and are already imported but never used:**
   - `functions/sharedFatigueEngine.js` — exports `computeSharedFatigue`, `DECAY_RATES`, `decayValue`. **Has a test** (`test/sharedFatigue.test.js`). Uses the same decay rates (structural 0.15, cns 0.12, cardiovascular 0.08, connectiveTissue 0.06).
   - `functions/activityWeighting.js` — exports `computeActivityWeights`, `evaluateAllocationAgainstTargets`, `BASE_WEEKLY_BUDGET`.
   - Both are `require`d at `functions/index.js:29-30` and **never called anywhere**.

7. **Tests** live in `test/` at the repo root (not `functions/test/`). Test runner is `npm test` → `node --test && jest`. Follow the style of `test/sharedFatigue.test.js` and `test/analytics.test.js`.

---

## The two new files

### `functions/analyticsEngine.js` (~291 lines)
Currently ESM. Exports:
- `buildUnifiedTimeline(db)` — merges workouts/lifts/runs/sleep/injuries/PRs into a date-sorted feed
- `generateWeeklyBrief(db)` — **async**, calls Gemini for a 2–3 sentence summary
- `computeRecoveryForecast(db)` — predicted recovery completion per muscle + CNS
- `generateAlternativeWorkouts(db)` — 3 session variants with trade-offs
- `computeMovementPatternVolume(db, days = 7)` — tonnage + muscle emphasis per movement pattern
- internal helpers: `classifyPattern`, `getMuscleWeights`

Imports `{ computeCurrentFatigueScores, computeStructuralFatigue }` from `./fatigue` and `{ callGeminiResilient }` from `./gemini` — both of those exist and export those names via `module.exports`.

### `functions/hybridFatigueEngine.js` (~149 lines)
Currently ESM. Exports:
- `computeHybridFatigue(db, day)` — per-modality fatigue for lifting/running/sports + a `shared` max
- `computeFatigueForModality(sessions, today, modality, dailyDecay)` — internal
- `activityWeighting(db, primary, secondary)` — 60/30/10 recovery budget split
- `allocateWeekly(db)` — 7-day schedule respecting CNS/cardio/connective thresholds
- `computeActivityReadiness(db, activity)` — `{ readiness, explanation, limits }`

---

## Work to do, in order

### Step 1 — Make the modules loadable (blocking)

Convert **both** new files from ESM to CommonJS to match the rest of `functions/`:
- `import { x } from './y'` → `const { x } = require('./y')`
- `export function foo(...)` → `function foo(...)` plus a single `module.exports = { ... }` block at the bottom listing the public functions.

Then confirm they actually load:
```bash
cd functions && node -e "require('./analyticsEngine'); require('./hybridFatigueEngine'); console.log('ok')"
```
This must print `ok` before you go further. If it doesn't, fix it before doing anything else.

### Step 2 — Resolve the duplicate-engine overlap

`hybridFatigueEngine.js` reimplements decay logic and activity weighting that `sharedFatigueEngine.js` and `activityWeighting.js` already do — and those two are the tested ones.

**Do this:**
- Make `hybridFatigueEngine.js` import `DECAY_RATES` and `decayValue` from `./sharedFatigueEngine` instead of hardcoding its own decay constants and `Math.pow` calls. Keep the behaviour identical; this is deduplication, not a rewrite.
- Leave `computeHybridFatigue`, `allocateWeekly`, and `computeActivityReadiness` in `hybridFatigueEngine.js` — those are genuinely new.
- For `activityWeighting(db, primary, secondary)`: check whether `computeActivityWeights` in `functions/activityWeighting.js` already covers it. If it does, delete the duplicate from `hybridFatigueEngine.js` and re-export the existing one. If the signatures genuinely differ, keep both but **say so explicitly in your final report** with the reason.
- Do **not** modify `sharedFatigueEngine.js` or `activityWeighting.js` themselves.

### Step 3 — Write tests first, before wiring anything into `index.js`

Create `test/analyticsEngine.test.js` and `test/hybridFatigueEngine.test.js` using `node:test` + `node:assert`, matching the style of `test/sharedFatigue.test.js`.

Use a fixture db like:
```javascript
const mockDb = {
  profile: { primaryActivity: 'lifting', secondaryActivity: 'running' },
  workouts: [{
    date: '2026-08-01', name: 'Upper A', duration: 60, intensity: 0.8,
    exercises: [
      { name: 'Bench Press', weight: 100, reps: 5, sets: 3 },
      { name: 'Barbell Row', weight: 100, reps: 5, sets: 3 },
    ],
    structuralLoad: 0.6, cnsLoad: 0.5, connectiveLoad: 0.2, cardioLoad: 0,
  }],
  lifts: [{ date: '2026-08-01', exercise: 'Bench Press', kg: 100, reps: 5 }],
  runs: [{ date: '2026-08-01', distance: 10, duration: 60, intensity: 0.6, cnsLoad: 0.2, cardioLoad: 0.6, structuralLoad: 0.5, connectiveLoad: 0.05 }],
  sports: [], sleep: [{ date: '2026-08-01', hours: 8, quality: 4 }],
  injuries: [], soreness: [], thoughts: [], metrics: [], weight: [], water: [],
};
```

Cover at minimum:
- `buildUnifiedTimeline` returns an array sorted by date, includes entries from every source array present
- `buildUnifiedTimeline({})` on a totally empty db returns `[]` and does not throw
- `computeHybridFatigue` returns `lifting`/`running`/`sports`/`shared`, every value a number in `[0, 1]`
- `computeHybridFatigue` decays: a session 7 days old produces strictly lower fatigue than the same session today
- `allocateWeekly` returns exactly 7 entries, each with a valid `activity` and `intensity`, and never schedules two consecutive hard days
- `computeActivityReadiness(db, 'lifting'|'running'|'sports')` returns readiness in `[0, 1]` with a non-empty `explanation`
- `computeRecoveryForecast` returns non-negative day counts
- `generateAlternativeWorkouts` returns 3 items, each with a name and a trade-off string

**Do not test `generateWeeklyBrief` against the live Gemini API.** Either skip it or stub `callGeminiResilient`.

Run `npm test` from the repo root. All tests — existing ones too — must pass before Step 4.

### Step 4 — Expose the data via a new endpoint

Add **one new endpoint**, `GET /athlete-state`. Do not modify `/me`, `/summary`, `/session`, or `/session/complete`.

Place it near the other GET endpoints in `functions/index.js`. Add the requires alongside the existing ones at the top of the file (lines 1–30).

```javascript
app.get('/athlete-state', async (req, res) => {
  try {
    const hybridFatigue = computeHybridFatigue(db);
    const readiness = {
      lifting: computeActivityReadiness(db, 'lifting'),
      running: computeActivityReadiness(db, 'running'),
      sports:  computeActivityReadiness(db, 'sports'),
    };

    let brief = null;
    try {
      brief = await generateWeeklyBrief(db);
    } catch (err) {
      console.warn('weekly brief failed:', err);
    }

    res.json({
      analytics: {
        timeline: buildUnifiedTimeline(db),
        brief,
        forecast: computeRecoveryForecast(db),
        alternatives: generateAlternativeWorkouts(db),
        patterns: computeMovementPatternVolume(db, 7),
      },
      hybrid: {
        fatigue: hybridFatigue,
        allocation: allocateWeekly(db),
        readiness,
        weighting: activityWeighting(db, db.profile?.primaryActivity, db.profile?.secondaryActivity),
      },
    });
  } catch (err) {
    console.error('GET /athlete-state failed:', err);
    res.status(500).json({ error: 'failed to build athlete state' });
  }
});
```

Requirements:
- endpoint is `async` (the brief is async)
- a Gemini failure must degrade to `brief: null`, never fail the request
- everything is `await`ed before `res.json()` — no `.then()` detachment
- no writes to `db`, no `save()` call — this is read-only

### Step 5 — Clean up the dead requires

`functions/index.js:29-30` requires `computeSharedFatigue` and `computeActivityWeights` but never calls them. Either use them (if Step 2 routes through them) or delete the unused require lines. Don't leave them dangling.

### Step 6 — Verify

```bash
npm test        # from repo root — all tests pass
npm run build   # must succeed
```

Report the actual output. If something fails, say so and show the error — do not report success you didn't observe.

---

## Explicitly out of scope

- Any change to `src/app.jsx` or any frontend file
- `POST /runs` and `POST /sports` endpoints (later task — `db.runs` / `db.sports` are already in `functions/userDoc.js` DEFAULTS, so the engines read empty arrays for now and that's fine)
- Attaching load metrics to workout logging (later task)
- `git push`, `firebase deploy`, or anything that touches `main` — `main` is production with no staging

---

## Deliverable

A summary containing:
1. What changed, file by file
2. The Step 2 overlap decision and why
3. Verbatim output of `npm test` and `npm run build`
4. Anything you found that looked wrong but you left alone
