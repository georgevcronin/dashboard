# 6-month synthetic-user simulator

Drives a randomized population of virtual people against the **local Firebase
emulator suite** for a fast-forwarded stretch of months, flagging crashes,
bad values, and cross-person data leaks. Never touches prod Firestore or
costs real Firestore/Gemini usage.

## Run it

Terminal A — start the emulators with the clock shim and without live
API keys (so nothing accidentally calls a real paid API):

```
SIM_CLOCK_FILE=$(pwd)/scripts/simulate/.sim-clock \
NODE_OPTIONS="--require $(pwd)/scripts/simulate/clock-shim.js" \
GEMINI_API_KEY= PRESS_OWNER_UID= \
firebase emulators:start --only functions,firestore,auth
```

Terminal B — run the driver:

```
node scripts/simulate/run.js --personas 30 --days 182 --seed 1
```

Output: `scripts/simulate/out/report-<timestamp>.json` — `issues[]` (hard
failures, bad values, cross-person leaks, each with persona id + simulated
day) and `suspicious[]` (each persona's final `/summary` payload, raw, for a
manual or LLM follow-up pass — this script doesn't judge "does this
recommendation look right," only "is this a valid response").

## What it doesn't cover (by design, not oversight)

- **Concurrency**: requests are sequential, not concurrent, across personas
  and days — see the comment in `run.js`. Testing the request-scoped `db`
  variable under real concurrent load is a separate, already-tracked
  question (`SELLABILITY_ANALYSIS.md`), not this pass.
- **Gemini-dependent behavior** (briefings, newscasts, mentor chat): skipped
  by leaving `GEMINI_API_KEY` unset, so those endpoints just exercise their
  no-key error path rather than making a real, billed call. Add a stub
  response in `run.js` if you want to test the Gemini-dependent paths
  specifically.
- **Real historical seed data**: personas start from zero, not a copy of
  real account history. `functions/exerciseDb.js`'s exercise catalog is
  already the real one (it's a static module, not Firestore data), so lift
  names/EMG attribution are real regardless.

## Re-running a bad seed

`--seed` fully determines persona generation and every random roll during
the simulation (each persona draws from its own seeded stream), so the same
`--personas`/`--days`/`--seed` reproduces an identical run.
