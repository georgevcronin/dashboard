# Claude Code Guidelines — Press (dashboard)

George is the primary user and owns all product decisions, but Press is moving from a single-user personal tool toward a **commercial, multi-user product** — real second users, public profiles, a username/follow system. See `PRODUCT.md`'s Users and Accessibility & Inclusion sections for the current roadmap note, `.design/feature-brainstorm/USERNAME_AND_COMPARISON.md` for the worked-out username/follow/profile/comparison design, and `.design/feature-brainstorm/SELLABILITY_ANALYSIS.md` §2 for the specific structural liabilities (single-owner webhook ingestion, no real onboarding/account-isolation, unreviewed Firestore rules, request-scoped `db` globals, no deploy alerting) that block real second users until fixed. `MASTER_IMPLEMENTATION_PLAN.md`'s Phase 6.5 sequences that work. See `PRODUCT.md` for what this is and who it's for, `ARCHITECTURE.md` for how it's built. Read both before non-trivial work — this file only covers things they don't.

Anything that assumes single-owner behaviour (`PRESS_OWNER_UID`, the request-scoped `db`/`save` globals treated as "safe because one person uses this") is a known, tracked liability, not a design to extend — don't build new features on top of that assumption without flagging it.

## Scope is George's to set
- `FEATURES.md` is the canonical feature list. **Never remove, merge, renumber, or mark a feature out-of-scope without George's explicit permission.** Same for existing behaviour in the app.
- "Already covered by X", "duplicates Y", "nothing consumes it", and "it's broken anyway" are reasons to *raise it and wait* — not reasons to drop it. Say what you'd cut and why, then stop.
- Deleting code that implements a listed feature is a removal, even if it's unwired, untested, or was written by another AI. Ask first.

## Before touching code
- If a change is ambiguous in scope, which file it belongs in, or whether it should touch `functions/index.js` vs a dedicated module — ask, don't assume.
- Check `ARCHITECTURE.md`'s "muscle-taxonomy architecture" and "request-scoped state" sections before touching fatigue/planning logic or `functions/index.js`'s `db` handling. Both describe deliberate designs with a documented history of bugs from "fixing" them naively.

## Workflow
- `npm run build` after any `src/app.jsx` change — it's the only thing that catches syntax/import errors on the frontend (no frontend test suite).
- `npm test` after any `functions/*.js` change — extract pure logic into its own module (pattern: `analytics.js`, `recoveryPersonalization.js`) and add a test file in `test/` rather than growing `index.js`.
- `main` deploys on every push with no staging environment — treat it as production. Don't push to `main` without being asked.
- No PRs — when asked to ship, commit directly to `main`. A PR sitting unmerged is why changes stop showing up in the app.
- After shipping something worth calling out (a fix or feature a user would actually notice — not internal refactors), add a bullet to the **current top entry** of `CHANGELOG` in `src/app.jsx` (near `SET_TYPES`) — do not bump the version number. All changes land under `1.0` for now; bumping per-shipment previously produced same-day `1.0`/`1.1`/`1.2` clutter that had to be condensed back into one entry, so stay on `1.0` until George explicitly says to cut a new version. Update that entry's `date` to today's if it's changed. Shown at the top of Settings, newest first.

## Code style
- No comments unless the WHY is genuinely non-obvious (matches the pattern already in this codebase — see the muscle-taxonomy and request-scoped-state notes in `ARCHITECTURE.md` for what "non-obvious" looks like here).
- Before adding an `if (name.includes('bench'))`-style exercise/muscle check anywhere, check whether `musclesForExercise`, `isCompoundExercise`, or `isLowerBodyExercise` (`functions/muscleTaxonomy.js`) already covers it.
- Async work that must survive past the response (background sync, fire-and-forget) needs `await` before `res.send()`/`res.json()` — never detach with `.then()`. See `ARCHITECTURE.md`'s "Request-scoped state" for why.

## Design
- Follow `PRODUCT.md`'s design principles and anti-references — this is deliberately not a typical fitness-dashboard UI (no rings, gradient blobs, streaks, celebratory copy). If a change reads like Whoop/Oura/MyFitnessPal, it's probably wrong for this product.
- Build to WCAG AA (contrast, reduced-motion, colour-blind-safe status indicators, 44px touch targets) — see `PRODUCT.md`'s Accessibility section.

## Self-review
After any change, before calling it done: re-read the diff, check it against `ARCHITECTURE.md`/`PRODUCT.md` intent, and confirm `npm run build`/`npm test` were actually run — not just assumed to pass.
