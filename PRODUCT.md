# Product

## Register

product

## Users

George — sole user today. Personal health operating system running on his own devices. Data flows in from Apple Health Auto Export (via an iOS Shortcut), Hevy, and Strava. A social/multi-user mode (usernames, public profiles, live shared workout sessions) is planned but not yet built — see the roadmap note in Accessibility & Inclusion below.

## Product Purpose

Press is a personal operating system for the body: sleep, recovery, training, nutrition, and thought. It aggregates data that would otherwise live in several separate apps and surfaces it through a single coherent interface with an AI mentor ("V") who knows your numbers. Success looks like George opening it daily and trusting what it tells him.

Finance was part of the original purpose statement but was never built — dropped from scope, not hidden.

## What's Actually In The App

Seven main sections (bottom-nav dock), plus Settings and an always-available mentor chat:

1. **Dispatch** (`S1`) — the daily entry point. Morning briefing, afternoon/night newscasts, and a weekly digest, all Gemini-generated in the app's own editorial voices. Surfaces the day's headline stat, a quick "thought" capture, and links into the other sections.
2. **Sleep** (`S2`) — sleep score (with deep/REM/light stage breakdown), trends, and recovery-relevant sleep metrics pulled from Apple Health.
3. **Training** (`S3`) — the core workout logger: start/log a session, exercise picker (212+ exercise database with weighted EMG-based muscle-fatigue attribution), the "Build Press/Row" angle-based exercise builder, live Session Stimulus readout per muscle, workout history, and Hevy CSV import.
4. **Nutrition** (`S4`) — meal logging (including photo-scan entries), macro targets (manual or auto-calculated from a goal), water tracking, recent-foods, CSV export.
5. **Recovery** (`S5`) — structural/CNS/metabolic fatigue readouts per muscle, injury taper, weekly training guidance (advisory, not a locked schedule), staleness/"days since trained" tracking, and Today's Limiting Factor. (ACWR is computed inside `fatigue.js` and feeds the fatigue model, but is not surfaced in the interface — it was listed here for a while as though it were.)
6. **Body** (`S6`) — bodyweight, body-fat, body measurements (neck/chest/waist/hips/limbs), supplement log.
7. **Records** (`S7`) — PRs and e1RM history per exercise, searchable.

Plus:
- **Mentor chat ("V")** — Gemini-backed conversational coach with its own persisted memory, referencing live recovery/training/nutrition/thought data.
- **Settings** — grouped into seven collapsible categories (Profile & Training, Dashboard Layout, Targets & Nutrition, Connected Data, Tools, Account, What's New/Changelog). Includes onboarding wizard (re-runnable via "Restart Setup"), plate calculator, and per-account data controls.
- **Integrations**: Apple Health (iOS Shortcut → `/shortcut`), Hevy (CSV import), Strava (OAuth + periodic sync), Gemini (all AI-generated copy — briefings, newscasts, weekly reviews, mentor chat).

This list changes often — the `CHANGELOG` array at the top of `src/app.jsx` (shown in Settings → What's New) is the authoritative, dated record of what's shipped; this section is a snapshot, not a spec.

## Brand Personality

Educated · Sensible · Postmodern

- **Educated**: assumes full intelligence. Uses real physiological terminology without explanation. Doesn't celebrate the obvious. Trusts the user to interpret their own data.
- **Sensible**: evidence-grounded, no vanity metrics, no overclaiming. If the data is ambiguous, says so. No motivational copy. No gamification.
- **Postmodern**: self-aware of its own genre. Knows what a fitness dashboard looks like and deliberately doesn't do that. Structure is a choice, not a default. Can be ironic about convention without being cynical about purpose.

## Anti-references

The entire fitness dashboard category: Whoop, Oura, Apple Fitness+, MyFitnessPal, Garmin Connect, Strava, Fitbit. Their shared vocabulary — glowing rings, gradient blobs, congratulatory animations, card grids, progress streaks, coloured achievement badges — is explicitly off the table. Press should be newly structured: a reader who knows this genre should not be able to place it in it.

Note: the in-progress social mode (visible-by-default workout feed, live shared sessions) is a deliberate departure from this stance for that feature specifically — see the roadmap note below. It doesn't relax this principle for the rest of the app.

## Design Principles

1. **Structure is the argument** — layout and hierarchy are editorial decisions, not scaffolding. The shape of a page should tell you something about what matters on it.
2. **Earned confidence** — no hype, no urgency, no motivational framing. The data speaks; the interface is the editor.
3. **Postmodern restraint** — aware of fitness dashboard conventions, steps around them deliberately. Familiar enough to be legible, strange enough to be new.
4. **Data before decoration** — every visual element must help you understand something. Decoration that doesn't carry information is noise.
5. **Personal scale** — designed for one person who knows this tool intimately. No onboarding copy, no empty-state evangelism. Sparse where data is absent, dense where it's rich.

Note: the interactive section walkthrough (FEATURES.md #145 — spotlight tooltips that auto-show once per section, the first time a user encounters it) is a deliberate departure from this principle, confirmed directly with George. It exists because a growing second-user base can't be assumed to "know this tool intimately" the way George does, and George decided the trade-off is worth it for that specific onboarding gap. It covers every dock panel plus Settings — Settings auto-shows its own short tour the first time it's opened, same one-shot-per-surface mechanism as the panels (as of 2026-08-07; originally Settings was deliberately excluded, confirmed to extend directly with George). It doesn't relax this principle for anything else in the app: no other feature gets an unprompted tour beyond what's listed here, and the walkthrough itself is written in the same dry, factual voice as the rest of the product (no onboarding-copy enthusiasm) and never shows again automatically once a section or Settings has been seen once.

## Accessibility & Inclusion

Currently sole-user. A social mode is actively being planned (see below) — Google/Apple sign-in, mandatory username on first login, per-category visibility toggles in Settings (workout sessions visible by default; sleep/nutrition/mentor-chat/etc. off by default), and live shared workout sessions where each participant logs their own sets independently while watching the other's progress in real time. Build to WCAG AA from the start — retrofitting contrast and keyboard nav is expensive. Specific considerations:

- **Contrast**: AA minimum throughout; the dark palette and dim text colours are the main risk area
- **Reduced motion**: health data is viewed in varied states (post-workout, waking up) — honour `prefers-reduced-motion` on all transitions and chart animations
- **Colour-blind safety**: the green/amber/red fatigue and status system must not rely on hue alone; pair with value (lightness) and label
- **Keyboard navigation**: forms and log actions should be fully keyboard-operable for the commercial phase
- **Touch targets**: mobile-first, so tap targets ≥ 44px — matters especially on the bottom nav and pill buttons
