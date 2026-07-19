# Design Review: Press Dashboard

Reviewed against: `PRODUCT.md` (no `DESIGN_BRIEF.md` exists; PRODUCT.md's Brand Personality / Design Principles / Accessibility sections served as the brief)
Philosophy: Educated · Sensible · Postmodern — "structure is the argument," editorial/newspaper, explicitly anti- fitness-dashboard-genre
Date: 2026-07-01
Account tested: `ihavelank@gmail.com` (fresh account, no Hevy/Apple Health/Strava data synced — i.e. the real sparse/empty state)

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `screenshots/review-login-desktop-1280.png` | Desktop | Login screen, Google/email toggle |
| `screenshots/review-recovery-today-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s1 — Recovery & today's edition |
| `screenshots/review-sleep-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s2 — Sleep trend analysis |
| `screenshots/review-training-fatigue-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s3 — Training / strength |
| `screenshots/review-nutrition-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s4 — Fuel / nutrition logger |
| `screenshots/review-muscle-fatigue-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s5 — Muscle fatigue body maps |
| `screenshots/review-profile-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s6 — Profile |
| `screenshots/review-personal-records-{desktop-1280,tablet-768,mobile-375}.png` | All 3 | s7 — All-time bests |

> All screenshots are in `.design/dashboard-review/screenshots/`. No dark mode was captured because the app has no dark mode implementation (see Dark Mode section below).

## Summary

The editorial system — serif headlines, JetBrains Mono data/ticker, scroll-snapped "sections" as front-page spreads — genuinely delivers on the "postmodern, doesn't look like Whoop/Oura" brief, and the Personal Records and Muscle Fatigue pages in particular are excellent, distinctive executions. But the build has skipped the brief's own stated risk areas: there is exactly one `@media` query in the whole stylesheet (a `prefers-reduced-motion` rule), so the header overlaps itself on every page at 375px, and the `--dim` text color the brief calls out by name as "the main risk area" measures ~3.7:1 against the background — below AA for the small text it's used on throughout. There's also a real (if narrow) data-loading fragility: the scroll fade-in system is wired to re-arm only when the summary fetch succeeds, so a failed first load leaves nearly the whole app invisible.

## Must Fix

1. **Header overlaps on mobile, on every single page.** `.mast-right` (date / name / sign-out) is `white-space: nowrap` inside a `grid-template-columns: 1fr auto 1fr` masthead (`src/app.jsx:140-143`), with no narrower-viewport rule to shrink or stack it. At 375px the right-hand block is wider than its `1fr` column and bleeds left over the centered "PRESS" title — visible identically in every mobile screenshot (e.g. `review-recovery-today-mobile-375.png`, `review-nutrition-mobile-375.png`, `review-personal-records-mobile-375.png`). _Fix: drop "V. Cronin"/shrink to initials or stack date+name+sign-out vertically below a breakpoint, or add `white-space: normal` with a max-width and let it wrap; add a real mobile breakpoint to `.masthead`._
2. **Touch targets are far under the 44px minimum the brief itself sets.** `.sn-dot` (the right-edge section nav) is 5×5px with no padding (`src/app.jsx:191-193`) — the actual click target is ~5px, not 44px. `.tab-btn` (Structural/Types/Soreness/Niggles tabs, `src/app.jsx:228`) computes to roughly 22-26px tall. `.week-day` (the M T W T F S S strip on Training, `src/app.jsx:366`) has `min-width: 34px`. PRODUCT.md says explicitly: _"Touch targets ≥ 44px — matters especially on the bottom nav and pill buttons."_ This is precisely that UI. _Fix: pad `.sn-dot`'s hit area (e.g. invisible 44×44 hit box around the visible 5px dot), bump `.tab-btn` vertical padding, raise `.week-day` min-width on mobile._
3. **`--dim` (#8a7a5c on #f5f0e2) is ~3.7:1 contrast — fails WCAG AA for the small text it's applied to.** It's used for kickers, stat labels, deltas, baselines, captions — much of it at 8-10px (`.sc-label`, `.kicker`, `.t-sym`, etc.), well under the "large text" 18px/14pt-bold threshold where 3:1 would suffice; AA requires 4.5:1 here. PRODUCT.md flags this exact pairing as the named risk area before any contrast check was run. _Fix: darken `--dim` (e.g. toward `#6b5d44`) until it clears 4.5:1, or reserve the current `--dim` only for text ≥ 18px/24px-equivalent._
4. **Two unstyled solid-gray rectangles render in the Training section (s3)** between the headline and the Duration/Output/Month stat row — visible at both desktop and tablet widths (`review-training-fatigue-desktop-1280.png`, `review-training-fatigue-tablet-768.png`). They carry no label, number, or chart content. I wasn't able to pin the exact source element in source review alone; worth a quick dev-tools inspection on this account, since nothing in `S3`'s conditional rendering (`src/app.jsx:1856-1975`) obviously accounts for a gray fill at that position.
5. **Effectively zero responsive breakpoints exist.** The entire CSS has one `@media` rule, for `prefers-reduced-motion` (`src/app.jsx:160`). What "responsiveness" exists today comes entirely from fluid units (`clamp()`, `%`, flex) — which is why most sections reflow fine, but it's also exactly why #1 above happens: nothing catches the case where fluid sizing isn't enough.

## Should Fix

1. **A failed first data fetch can permanently hide the whole app's content for that session.** The `IntersectionObserver` setup that adds the `visible` class sections need for their `.fade` content to become visible (`section.visible .fade{opacity:1}`, `src/app.jsx:153-154`) lives in a `useEffect` keyed to `[s]` (`src/app.jsx:4076-4107`), not to `[user]` or mount. On first render `user` is `undefined` and the function returns a bare loading screen (no `#press-scroll` in the DOM yet); by the time `user` resolves and the real section markup mounts, the effect won't re-run unless `s` itself changes. If the `summary`/`briefing` fetch fails on that first load (I reproduced this locally via a CORS-blocked request — i.e. a real failed-fetch condition, not a fabricated one), `s` never updates, the observer never attaches, and every `.fade` element in the entire app stays at `opacity:0` indefinitely — only the header, ticker, and a handful of inline-styled elements remain visible. Given this is a PWA meant for daily use in variable network conditions (gym, travel, just-woke-up), a transient failure on first load is a realistic scenario worth hardening against. _Fix: key the effect to `[user]` (or run once via an empty dependency array plus a small retry/mutation-observer for late-mounted sections), and/or mark sections visible by default and let the observer only handle re-fade on scroll, not first-paint._
2. **No dark mode exists** (no `prefers-color-scheme`, no toggle, no theme variables beyond the single light palette). PRODUCT.md's accessibility section calls out "the dark palette and dim text colours" as a contrast risk area, implying one is expected on the roadmap. Not necessarily wrong to defer, but worth confirming intentionally deferred vs. forgotten.

## Could Improve

1. **Onboarding (`review-onboarding-overlay` reachable via "Get Started") reads more like a generic SaaS welcome card** (centered logo, bulleted feature list, black CTA) than the bold editorial voice the rest of the app has — a small tonal dip right at first impression. A one-line "kicker" + serif headline treatment (matching every other section) would carry the brand through onboarding too.
2. **The large colored em-dash placeholders are a genuinely nice touch** (`—` rendered at 26-40px in the metric's own color for HRV/RHR/Sleep/Fatigue when data is absent) but are easy to mistake for a rendering glitch at a glance — they read more like a thick bar than a dash at that size/weight. Worth a quick gut-check with fresh eyes once data starts flowing in for real, to confirm it still reads as "no data yet" rather than "broken."

## What Works Well

- **Personal Records (`s7`)** is the strongest screen in the app: dense data table, grouped by movement pattern, inline e1RM sparkline per exercise, "NEW" badges, all without ever feeling cluttered. This is "dense where it's rich" executed exactly as the brief asks.
- **Muscle Fatigue (`s5`)** body diagrams (anterior/lateral/posterior) with color-coded load state and a clear legend are distinctive and specifically avoid the generic "muscle heatmap" look common to fitness apps — a real anti-reference win.
- **The newspaper system as a whole** — Playfair Display headlines, JetBrains Mono ticker/data, scroll-snapped front-page-style sections with a side dot-nav — is unmistakably not Whoop/Oura/Strava, which was the explicit, named bar to clear.
- **Sparse-state copy is disciplined**: "Awaiting Log," "No Recent Session," "Sleep debt cleared" — no gamification, no motivational filler, consistent with the "Sensible" personality even when there's nothing to show.
- **Nutrition (`s4`)** degrades cleanly to its empty state — clear targets, zeroed progress bars, scan/photo/barcode entry points all present without crowding.
