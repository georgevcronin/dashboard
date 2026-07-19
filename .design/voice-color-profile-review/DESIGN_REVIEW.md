# Design Review: Sleep color, empty-state voice, Profile layout

Reviewed against: `PRODUCT.md` (Brand Personality / Design Principles sections)
Philosophy: Educated · Sensible · Postmodern — editorial/newspaper, dry wit, no hype
Date: 2026-07-01
Scope: three specific issues flagged by the user, not a full-app pass (see `.design/dashboard-review/DESIGN_REVIEW.md` for that).

## Screenshots Captured

| Screenshot | Description |
| --- | --- |
| `screenshots/review-profile-current-460.png` | S6 Profile: current Weight/Body Fat vs Measurements layout, rendered from the real PRESS_CSS against representative data |

## 1. Sleep signature color

**Current state:** Recovery=`--gold` (#6b5800), HRV=`--navy` (#1a2f54), Resting HR=`--forest` (#1a4f2a), Fatigue=`--red` (#7a1414). Sleep uses plain `--ink`/`--dim` — no hue of its own, despite having its own dedicated section (S2) same as the others.

**Fix:** add a new token, a muted plum/indigo — thematically "night/dusk," and the only hue family in the palette not already claimed (existing hues: yellow-brown/gold, blue/navy, green/forest, red, orange/ember).

```css
--plum:#3d2452
```

Contrast against `--paper` (#f5f0e2): **11.7:1** — comfortably clears AA even at small text sizes, in line with the other tokens (gold 6.1, navy 11.7, forest 8.4, red 9.5, ember 8.0).

Apply to:
- `src/app.jsx` S1, the Sleep vital: `.sc-num` currently unstyled/plain-ink at line ~697 → add `plum` class or inline `color:var(--plum)`.
- `src/app.jsx` S2, the sleep trend `AreaChart` color prop (`color="#1a2f54"` at line ~828, currently reusing navy) → change to `"#3d2452"`.
- Add a `.sc-num.plum{color:var(--plum)}` rule next to the existing `.sc-num.gold/.navy/.forest/.red` line in `PRESS_CSS`.

## 2. Empty-state copy voice

**Current state:** populated headlines are specific and witty ("Body Clears — for Heavy Load", "Lats Loaded — Train Quads Today"). Null-data fallbacks are generic SaaS: "Training"/"No Recent Session" (S3), "Sleep"/"Trend Analysis" (S2), "Fuel"/"Awaiting Log" (S4).

**Fix — replace with a consistent "nothing filed yet" editorial structure**, using domain-correct terminology so it reads specific rather than templated:

| Section | Current | Replacement |
| --- | --- | --- |
| S2 Sleep | `'Sleep'` / `'Trend Analysis'` | `'Lights Out —'` / `'Nothing on Record'` |
| S3 Training | `'Training'` / `'No Recent Session'` | `'Quiet Gym —'` / `'Nothing on the Card'` |
| S4 Nutrition | `'Fuel'` / `'Awaiting Log'` | `'Empty Plate —'` / `'Nothing on the Docket'` |

Rationale: "card" is real lifting terminology (a workout card/program), "docket" fits a food log, "on record" fits a sleep log — each is domain-specific rather than interchangeable filler, matching "Educated" (assumes vocabulary, doesn't explain itself) and "Postmodern" (aware of its own headline-genre, plays with structure) without tipping into motivational-app tone. No gamification, no "let's get started!" energy — consistent with "Sensible."

## 3. Profile page (S6) layout unification

**Current state** (see screenshot): Weight/Body Fat is a two-column split where the input field itself doubles as both display and edit control (mono, right-aligned, underlined, placeholder shows last value). Measurements is a three-part pattern: pill selector → a separate large serif **display** row (`.measure-val`, Playfair, with a colored delta) → a separate bare-input **edit** row below. These are visibly two different systems on one screen.

**Fix — standardize on the Measurements pattern (view and edit as separate rows), applied to Weight and Body Fat too:**

1. Above each input, add a `.measure-row`-style display line showing the last logged value in the same typography already established for metrics elsewhere in the app (`.measure-val`: Playfair Display, 700, 16px) with a delta vs. the previous entry, reusing the existing `.measure-row`/`.measure-val`/`.measure-delta` classes verbatim — no new CSS needed.
   - Weight: delta computable from `s?.weights` (array of prior entries already available).
   - Body Fat: only `s?.bodyFatToday` is currently exposed (no history in `s`), so render the display row without a delta, matching how `.measure-row` already handles the no-`prev`/no-delta case for Measurements (`{delta !== null && (...)}` is already conditional).
2. Keep the input row below as a plain "enter new value" control — this already matches Measurements' bare-underline-input style closely; only remove the placeholder-as-display convention (the input field should show empty/placeholder "Value", not double as the read display, since the display row above now owns that job).
3. Keep Weight and Body Fat side-by-side (two columns) rather than forcing Measurements' single-column-with-selector shape — that structural difference is justified (2 fixed fields vs. 8 selectable types), so only the *typography and view/edit separation* need to unify, not the grid.

This is a same-file, same-class change (reuses `.measure-row`/`.measure-val`/`.measure-delta`, `.prof-input`) — no new CSS tokens required.

## What Works Well

- The existing per-metric color system (gold/navy/forest/red) is legible and consistent everywhere it's already applied — Sleep was simply the one gap.
- Populated-state headline copy is genuinely the strongest voice writing in the app; the fix here is bringing empty states up to that bar, not inventing a new voice.
- Measurements' view/edit separation (display row + input row) is the better of the two existing patterns and the right one to standardize on, rather than picking a third pattern.
