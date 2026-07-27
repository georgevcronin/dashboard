# Design Review: Press Dashboard

Reviewed against: `PRODUCT.md` (no `DESIGN_BRIEF.md` exists; PRODUCT.md's Brand Personality / Design Principles / Accessibility sections served as the brief)
Philosophy: Educated · Sensible · Postmodern — "structure is the argument," editorial/newspaper, explicitly anti- fitness-dashboard-genre
Date: 2026-07-27 (update pass — see [prior review](#) from 2026-07-01 for the original baseline)
Account tested: George's real account (`pressnewsletter.web.app`, production)

**Methodology note on this pass**: this update combines fresh code inspection (CSS contrast math, breakpoint audit) with live verification in Chrome across the onboarding flow, Settings, and the main dashboard (Dispatch/Training/Nutrition/Personal Records/Muscle Fatigue sections). The browser tab went unresponsive partway through (a `Page.captureScreenshot` timeout that didn't recover after two retries), so this pass does **not** have newly saved screenshot files the way the 2026-07-01 review did — findings below are backed by direct observation and file/line references instead. The prior review's screenshots (`screenshots/review-*.png`) are still valid for anything not called out as changed below.

## Summary

Substantial, real progress since the 2026-07-01 review: three of that review's five Must-Fix items are now fixed (contrast, mobile masthead overlap, tab touch targets), and a fourth (the unstyled gray rectangles in Training) no longer reproduces. Dark mode has been fully built out since then — a full second palette, not just an inversion — closing the "Could Improve" gap the old review flagged. One old finding was a misdiagnosis on my part (the section-nav dots are a non-interactive, `aria-hidden` scroll indicator, not an under-sized touch target). Set against that, this session's own feature work introduced two real functional bugs (found and fixed during this pass, see commits `4d443e8`/`349f04e`) and surfaces a few new, purely visual findings below — mainly in the newer Onboarding steps and a masthead detail that doesn't reflect the account's real name.

## Fixed Since 2026-07-01 (verified this pass)

1. **`--dim` contrast** — was ~3.7:1 (#8a7a5c), now `#6b5d44` in light mode (5.63:1) and `#ab9a78` in dark mode (6.43:1 against `#1b1812`). Both clear WCAG AA for small text. Computed directly from `src/pressCss.js:7,13`.
2. **Mobile masthead overlap** — `src/pressCss.js:310-319` now has a dedicated `@media(max-width:480px)` block: masthead stacks to a single column, centered, `--hdr` grows to 138px to fit. Verified live at the account's actual mobile rendering.
3. **`.tab-btn` touch target** — now `min-height:44px` (`src/pressCss.js:107`), was ~22-26px.
4. **`.week-day` touch target** — now `min-width:44px` on the mobile breakpoint (`src/pressCss.js:318`), was 34px.
5. **Dark mode** — fully implemented (`:root[data-theme="dark"]`, `src/pressCss.js:13`), not just deferred. A real second palette (not an inversion): gold shifts from `#6b5800` to `#d9b23c`, navy/forest/ember/red/plum all independently tuned, both measured well above AA against their own backgrounds.
6. **Gray rectangles in Training (old Must-Fix #4)** — not reproducible. Live-viewed the same region (headline → Duration/Output/Month stat row) on the real account; it now renders correctly (exercise table, small session-photo thumbnails, stats). See "Needs a closer look" below for one loose end here.

## Correction to the Prior Review

- **Section-nav dots (`.sn-dot`) are not a touch-target bug.** The prior review flagged their 5×5px size against the 44px minimum. On inspection, `.sn-dot` has `pointer-events:none` and the parent `<nav>` is `aria-hidden="true"` with no click handler at all (`src/app.jsx:6867-6868`) — it's a passive scroll-position indicator, not an interactive control. Navigation happens by scrolling/swiping; the dots just reflect where you are. Nothing to fix here.

## Must Fix

*(none carried over — all of the prior review's Must Fix items are resolved or corrected above)*

## Should Fix

1. **Onboarding still reads as generic SaaS onboarding, now with more of it.** The prior review's "Could Improve" note on this holds and is more visible now that Onboarding is 8 steps instead of the original flow — centered welcome card, bulleted feature list, black CTA, a plain step-counter ("Step 5 of 7"). PRODUCT.md is explicit: *"No onboarding copy, no empty-state evangelism... designed for one person who knows this tool intimately."* The rest of the app (kicker + serif headline + JetBrains Mono data) doesn't appear anywhere in the 8-step flow. This is the single biggest tonal gap between the brief and the build — first impression is the one place the editorial voice is entirely absent.
2. **Experience Level selection state is too subtle to read at a glance.** In Onboarding step 4 and the equivalent Settings field, "New to training" / "Experienced" are two bordered boxes where the *only* difference between selected and unselected is a slightly heavier border — no fill, no color shift, nothing like the solid `--ink` fill used for selected state elsewhere (Typical Split, Compound/Isolation, Tracking Level). Confirmed by zooming into the rendered pixels during this pass. A user glancing at the screen genuinely can't tell which is selected without close inspection. _Fix: give it the same solid-fill selected state as every other choice control in the same form._
3. **Masthead subtitle ("George's Edition") is a hardcoded string, not derived from the account.** Verified in `src/app.jsx` — it doesn't read `profile.name`. Minor today since the name happens to match, but it means the masthead would silently go stale if the name in Settings is ever changed, on an app whose entire premise (per PRODUCT.md) is "personal scale... one person." _Fix: derive it from `s?.profile?.name` with the current string as a fallback._

## Could Improve

1. **Needs a closer look**: a row of small, mostly-black thumbnails appears above the Duration/Output/Month stats on the Training section (session photos, presumably). Couldn't get close enough to confirm intent before the browser tab stopped responding — worth a quick manual check that these are meant to render that way (e.g. genuinely empty/placeholder photos) rather than a broken image load.
2. **The large colored em-dash placeholders** (still present, unchanged from the last review) are a nice touch but easy to mistake for a rendering glitch at a glance — carried over from 2026-07-01, still true.
3. **Muscle Focus (new this session, Onboarding step 5 / Settings)** is a plain flat list of 28 muscles, each with three text buttons. Functionally solid and consistent with the form style around it, but it's the single densest, least-editorial screen in the product — 28 near-identical rows with no grouping (e.g. by upper/lower body, or push/pull) makes it harder to scan than the muscle-fatigue body diagram elsewhere in the app already visualizes the same muscle set spatially. Not wrong, just worth a design pass if this screen gets used often.

## What Works Well

- **Personal Records** remains the strongest screen in the app — dense data table grouped by movement pattern, inline e1RM sparkline per exercise, "NEW" badges, all legible without feeling cluttered. Re-confirmed live this pass with George's real lift history.
- **Muscle Fatigue** body diagrams (anterior/lateral/posterior, color-coded, paired with a plain-language legend and a full percentage breakdown list) are distinctive and specifically avoid the generic fitness-app "heatmap" look.
- **Dark mode**, now that it exists, is a genuinely separate palette tuned per-color rather than a blanket inversion — right approach for a brand this considered about color.
- **The newspaper system as a whole** continues to read as unmistakably not Whoop/Oura/Strava — masthead, ticker, serif headlines, scroll-snapped sections. Still the clearest win against the brief's explicit anti-references.
- **Nutrition** degrades cleanly, and the meal-scan/photo/barcode entry points stay legible without crowding the log.
