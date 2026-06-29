# Product

## Register

product

## Users

George — sole user. Personal health operating system running on his own devices. Data flows in from Apple Health Auto Export, Hevy, and Strava. No multi-user requirements.

## Product Purpose

Press is a personal operating system for the body: sleep, recovery, training, nutrition, finance, and thought. It aggregates data that would otherwise live in five separate apps and surfaces it through a single coherent interface with an AI mentor who knows your numbers. Success looks like George opening it daily and trusting what it tells him.

## Brand Personality

Educated · Sensible · Postmodern

- **Educated**: assumes full intelligence. Uses real physiological terminology without explanation. Doesn't celebrate the obvious. Trusts the user to interpret their own data.
- **Sensible**: evidence-grounded, no vanity metrics, no overclaiming. If the data is ambiguous, says so. No motivational copy. No gamification.
- **Postmodern**: self-aware of its own genre. Knows what a fitness dashboard looks like and deliberately doesn't do that. Structure is a choice, not a default. Can be ironic about convention without being cynical about purpose.

## Anti-references

The entire fitness dashboard category: Whoop, Oura, Apple Fitness+, MyFitnessPal, Garmin Connect, Strava, Fitbit. Their shared vocabulary — glowing rings, gradient blobs, congratulatory animations, card grids, progress streaks, coloured achievement badges — is explicitly off the table. Press should be newly structured: a reader who knows this genre should not be able to place it in it.

## Design Principles

1. **Structure is the argument** — layout and hierarchy are editorial decisions, not scaffolding. The shape of a page should tell you something about what matters on it.
2. **Earned confidence** — no hype, no urgency, no motivational framing. The data speaks; the interface is the editor.
3. **Postmodern restraint** — aware of fitness dashboard conventions, steps around them deliberately. Familiar enough to be legible, strange enough to be new.
4. **Data before decoration** — every visual element must help you understand something. Decoration that doesn't carry information is noise.
5. **Personal scale** — designed for one person who knows this tool intimately. No onboarding copy, no empty-state evangelism. Sparse where data is absent, dense where it's rich.

## Accessibility & Inclusion

Currently sole-user, with a clear roadmap: friends prototype → commercial product. Build to WCAG AA from the start — retrofitting contrast and keyboard nav is expensive. Specific considerations for the commercial arc:

- **Contrast**: AA minimum throughout; the dark palette and dim text colours are the main risk area
- **Reduced motion**: health data is viewed in varied states (post-workout, waking up) — honour `prefers-reduced-motion` on all transitions and chart animations
- **Colour-blind safety**: the green/amber/red fatigue and status system must not rely on hue alone; pair with value (lightness) and label
- **Keyboard navigation**: forms and log actions should be fully keyboard-operable for the commercial phase
- **Touch targets**: mobile-first, so tap targets ≥ 44px — matters especially on the bottom nav and pill buttons
