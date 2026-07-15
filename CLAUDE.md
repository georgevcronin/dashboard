# Claude Code Guidelines — Press (dashboard)

Sole user is George. See `PRODUCT.md` for what this is and who it's for, `ARCHITECTURE.md` for how it's built. Read both before non-trivial work — this file only covers things they don't.

## Before touching code
- If a change is ambiguous in scope, which file it belongs in, or whether it should touch `functions/index.js` vs a dedicated module — ask, don't assume.
- Check `ARCHITECTURE.md`'s "muscle-taxonomy architecture" and "request-scoped state" sections before touching fatigue/planning logic or `functions/index.js`'s `db` handling. Both describe deliberate designs with a documented history of bugs from "fixing" them naively.

## Workflow
- `npm run build` after any `src/app.jsx` change — it's the only thing that catches syntax/import errors on the frontend (no frontend test suite).
- `npm test` after any `functions/*.js` change — extract pure logic into its own module (pattern: `analytics.js`, `recoveryPersonalization.js`) and add a test file in `test/` rather than growing `index.js`.
- `main` deploys on every push with no staging environment — treat it as production. Don't push to `main` without being asked.
- After shipping something worth calling out (a fix or feature a user would actually notice — not internal refactors), add an entry to `CHANGELOG` in `src/app.jsx` (near the top, alongside `SET_TYPES`): bump the version, today's date, one bullet per notable change. Shown at the top of Settings, newest first.

## Code style
- No comments unless the WHY is genuinely non-obvious (matches the pattern already in this codebase — see the muscle-taxonomy and request-scoped-state notes in `ARCHITECTURE.md` for what "non-obvious" looks like here).
- Before adding an `if (name.includes('bench'))`-style exercise/muscle check anywhere, check whether `musclesForExercise`, `isCompoundExercise`, or `isLowerBodyExercise` (`functions/muscleTaxonomy.js`) already covers it.
- Async work that must survive past the response (background sync, fire-and-forget) needs `await` before `res.send()`/`res.json()` — never detach with `.then()`. See `ARCHITECTURE.md`'s "Request-scoped state" for why.

## Design
- Follow `PRODUCT.md`'s design principles and anti-references — this is deliberately not a typical fitness-dashboard UI (no rings, gradient blobs, streaks, celebratory copy). If a change reads like Whoop/Oura/MyFitnessPal, it's probably wrong for this product.
- Build to WCAG AA (contrast, reduced-motion, colour-blind-safe status indicators, 44px touch targets) — see `PRODUCT.md`'s Accessibility section.

## Self-review
After any change, before calling it done: re-read the diff, check it against `ARCHITECTURE.md`/`PRODUCT.md` intent, and confirm `npm run build`/`npm test` were actually run — not just assumed to pass.
