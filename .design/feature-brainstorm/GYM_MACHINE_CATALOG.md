# Gym Equipment Catalog & Presets — Fully Worked-Out Mechanics

Worked out via a grilling pass. Nothing below is built yet.

Extends the existing per-set `machine` field (a free-typed brand/technique note on
each set, see `src/app.jsx`'s `ex.machine`) with: a real brand+model catalog, a
shared directory of physical gyms and what's in them, and geolocation-based
auto-detection so logging at a gym you've used before requires no typing.

---

## 1. Core model

- **Catalog is brand + model**, not brand-only. Today's `machineBrands.js` /
  `resistanceCurves.js` only go brand-deep ("Life Fitness"). This adds a second
  layer: named product models within a brand ("Life Fitness — Converging Cable
  Row", "Hammer Strength — Super Incline Press") — literally the name printed
  on the machine.
- **Gyms are a shared global directory**, not personal. One `gyms/{gymId}`
  Firestore doc per physical gym, visible/usable by any signed-in user, not
  scoped to whoever created it.
- **Two tiers of what a gym "has"**:
  - **Soft save**: a brand is present at this gym, split by equipment type
    (`cable: [...]`, `machine: [...]`) — mirrors the existing
    `CABLE_BRANDS`/`SELECTORIZED_BRANDS` split (`machineBrands.js`). Used only
    to promote relevant brands to the top of a dropdown.
  - **Hard save**: a specific `exercise → {brand, model}` pairing — e.g. "this
    gym's Shoulder Press is a Life Fitness Super Incline Press." Used to
    prefill the machine field outright when that exercise is logged again at
    this gym.
- **No new UI screen.** Both soft and hard saves happen implicitly, as a side
  effect of the existing per-set machine/brand picker — whatever you pick
  while logging at an active gym is what gets saved. No separate "add a
  machine" search screen.
- **No visible map.** "Map functionality" is geolocation auto-detect only —
  coordinates stored per gym, proximity-matched against your current
  position. No pin-drop UI, no Maps API/billing.

---

## 2. The brand+model catalog

- Catalog structure, per exercise (matching `resistanceCurves.js`'s existing
  `${exerciseName}|${brand}` keying): for exercises/brands where the brand
  genuinely sells a named model that fits, a model name. New file, separate
  from `resistanceCurves.js` (different purpose/rigor) — proposed
  `functions/machineModels.js`.
- **Pre-researched**, same rigor bar as `resistanceCurves.js`'s brand
  research this session (best-effort, no fabrication, real WebSearch per
  manufacturer, absent rather than guessed where no real named model exists).
- **All brands currently in `machineBrands.js`** get researched — commercial
  brands (Hammer Strength, Life Fitness, Cybex, Matrix Fitness, Technogym,
  Precor, Nautilus, Panatta, Star Trac, Booty Builder, Atlantis Strength,
  Gym80, HOIST, SportsArt, Keiser, Force USA, Bolt Fitness Supply, Altas
  Strength) and budget/home-gym brands (Body-Solid, BodyCraft, Promaxima,
  TKO, Major Fitness, RitFit, MAXUM Fitness) alike — expect the budget tier
  to genuinely yield few or no named-model entries, which is a true finding,
  not a gap to fill.
- Where no researched model exists for a brand+exercise, the model field is
  free-text (same UX pattern as the existing brand "Other" free-text entry).

---

## 3. Gym records (Firestore)

Proposed shape, `gyms/{gymId}`:

```js
{
  name: "PureGym Manchester Central",
  lat: 53.4808, lng: -2.2426,
  softBrands: { cable: ["Life Fitness", "Hammer Strength"], machine: ["Technogym"] },
  hardSaves: {
    "shoulder press": { brand: "Life Fitness", model: "Super Incline Press" },
    "seated row": { brand: "Hammer Strength", model: "Converging Cable Row" },
  },
  createdBy: uid, createdAt, updatedAt,
}
```

- **Additive-only edits, no deletes.** Any signed-in user can add a soft
  brand or a hard exercise→{brand,model} pairing to any gym. Duplicate adds
  no-op. Nobody can remove another user's entry — avoids vandalism/conflict
  entirely at the cost of never pruning a machine that's actually been
  removed from a gym. All writes go through a Cloud Functions endpoint (this
  app has no direct client Firestore access anywhere — see `functions/index.js`),
  which enforces additive-only server-side.
- **Dedup on create**: before creating a new gym, the create endpoint checks
  for existing gyms within ~100m of the given coordinates and returns them
  instead of creating a duplicate ("Is this your gym? [Name]").

---

## 4. Selecting a gym for a workout

- **Trigger**: once per workout, at start. `WorkoutLogger` mount silently
  requests geolocation and queries nearby (~100m) gyms.
  - **Exactly one match** → auto-select, shown as a small dismissible "At
    [Gym] · change" indicator. Tapping "change" opens the manual picker.
  - **Multiple matches** (e.g. two gyms in the same complex) → don't
    auto-pick; show a short picker of just the nearby matches.
  - **No match** (nothing nearby, or location denied) → no gym selected,
    dropdowns behave exactly as today (full catalog, no "in your gym"
    section). Manual text search (below) is always available regardless.
  - If nothing nearby matches at all, offer "add this gym" (name entry;
    proximity dedup check runs server-side as in §3).
- **Manual fallback**: a name search box (same search-as-you-type pattern as
  the existing `/account/search` username search) to find/select any gym in
  the shared directory regardless of location — needed for denied/imprecise
  geolocation, and for setting a gym ahead of a trip.
- **Group sessions**: gym detection stays independent per participant — no
  new sync logic added to the existing `liveSessions` merge cycle for this.
- **History**: the selected `gymId` (if any) is recorded on the saved
  workout, same spirit as the existing per-set `ex.machine` tracking.

---

## 5. Effect on the logging UI

With an active gym:
- The machine/brand `<select>`/datalist (`src/app.jsx:1637`, `:2578`) shows
  the gym's soft-saved brands for the current equipment type first, under an
  "(in your gym)" divider, full catalog below.
- If this gym has a hard save for the exercise being logged, the
  brand+model fields prefill with it automatically.
- Whatever brand/model you pick while logging (dropdown or free-text) is
  saved back to the gym: soft-saves the brand, hard-saves the
  exercise→{brand, model} pairing. Silent, no confirmation step.

Without an active gym: unchanged from today.

---

## 6. Explicitly out of scope for this pass

- Removing/correcting a gym's stale entries (additive-only, no prune).
- Visible map / pin-drop UI.
- Sharing gym selection across group-session participants.
- A dedicated "manage this gym's equipment" screen — everything happens
  implicitly through normal logging.
