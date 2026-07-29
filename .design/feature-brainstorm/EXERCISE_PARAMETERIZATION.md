# Exercise Selection Tree + Parameterized Exercises — Mechanics Draft

Two connected pieces, worked out via a grilling pass on 2026-07-29: (1) a node-link tree UI for exercise selection, replacing the current step-by-step tile picker; (2) collapsing today's flat proliferation of separately-named exercise variants (bench press's 6 named entries, row's ~15, etc.) into parameterized entries — equipment + a continuous parameter — with an optional goal/coaching-note layer on top for the families where the science supports it. Nothing below is built yet; this document captures decisions, not implementation.

This is explicitly the "Parameterized exercise variants (angle/incline)" item flagged as **NOT DONE** in prior roadmap notes, where only the migration policy had been decided (existing logged history retroactively rewrites into the new parameterized shape, e.g. old "Incline Barbell Bench Press" logs become "Bench Press" + an inferred incline value — see below). The guided-tree UI was previously told to wait until parameterization existed; in practice we did the UI first and are now doing parameterization, which is fine — the tree's variant-selection step just doesn't have anything real to attach to until this ships.

---

## 1. Selection UI — node-link tree

Validated via a working mockup (`.design/feature-brainstorm/` — see commit history / the artifact from this session) built in Press's own newspaper/ledger design system (`src/pressCss.js` tokens: paper/ink/rule/dim/gold, Playfair Display for group names, JetBrains Mono for pattern/variant labels, italic Times New Roman for movement names).

- **Horizontal branching columns**: Group → Pattern → Movement → Variant, each column a list of tappable nodes.
- **Real connector lines**, not decoration — SVG paths recomputed live from each node's actual DOM position, tracing the open path in gold.
- **One branch open per level** (accordion, not a fully expanded graph) — with 211 exercises across 12 groups, a fully-expanded node-link diagram would be unreadable on a phone. This was a deliberate choice over a true radial/force-directed layout.
- **Auto-scroll**: opening a branch smooth-scrolls the view horizontally so the newly revealed column comes fully into frame, rather than requiring manual scrolling right.
- Once parameterization (below) ships, the tree's final step for a parameterized movement isn't a flat list of named variants — it's the equipment/parameter picker described in §2.

---

## 2. Parameterization — what replaces the flat variant list

### Scope and rollout order
1. **Bench Press** — the pilot. Barbell/Dumbbell equipment choice + a continuous incline slider, replacing today's 6 separately-named entries (Barbell / Incline Barbell / Decline Barbell / Dumbbell Flat / Dumbbell Incline / Dumbbell Decline). **Close-Grip Bench Press stays a separate, non-parameterized entry** — it's a grip-width variant, not an angle variant, and doesn't belong on the incline slider.
2. **Overhead Press and Row families** — next, and comparatively free: they already have a working angle/EMG model (`functions/emgActivation.js`'s vertical press/row arc, curated angle values in `functions/exerciseAngles.js`, and the existing `PressRowBuilder` UI that already does equipment→angle selection to *generate* a custom exercise). This work is "just" wiring the existing DB-named variants into that same picker instead of a separate custom-exercise builder.
3. **Elbow flexion (curls)** and **elbow extension (triceps)** — need a genuinely new parameter model (below), since `EXERCISE_ANGLES.js` explicitly excludes horizontal/elbow-based movements today (different arc than the vertical press table).
4. **Rows** get the fuller goal/coaching-note treatment from §3 (see below) — same evidence quality as elbow flexion/extension.
5. **Legs** — explicitly deferred, unscoped. Quad/hamstring/glute emphasis is real but mostly plays out as genuinely different exercises (leg extension vs. leg curl vs. RDL) rather than one parameterized movement with a slider; within-exercise stance-width emphasis shifts are much shakier evidence than the elbow case. Needs its own scoping pass later, not assumed to fit this model.

### Explicitly out of scope for the goal/note layer (§3)
- **Shoulder press** does not get its own muscle-emphasis treatment. Overhead press is anterior-delt-dominant across nearly its whole angle range — the interesting front-vs-lateral-delt tradeoff belongs to *raise* variants, not press, so it doesn't cleanly fit inside this parameterization.
- **Chest press** gets the equipment+angle parameterization (§2) but **not** the goal/note layer — upper-vs-lower-pec emphasis via incline is the commonly cited example, but more recent EMG literature shows the effect is smaller and noisier than the claim usually implies. Don't build a confident-sounding coaching note on shakier evidence than the curl/extension/row case.

### Resistance curve — SUPERSEDED by a unified 1-5 scale (see below)
The section immediately below replaces the free-weight-geometric-derivation / cable-recommendation split originally worked out here. Kept as a record of the reasoning that led to the simpler model, not as the design itself:

~~Free weights (Barbell/Dumbbell) are "free" — the resistance curve is derivable directly from geometry: gravity provides a constant vertical force, so torque about the joint follows from limb-angle geometry alone.~~
~~Cable is hard — considered a full geometric derivation (continuous pulley-height slider, anthropometric-ratio-based limb lengths from `profile.heightCm`, derived standing distance), then simplified to a setup recommendation aimed at landing the resistance peak at the right joint angle, scoped to curls/extensions/rows only.~~

### Resistance curve — unified 1-5 ordinal scale, all equipment, best-effort

All three earlier mechanisms (geometric derivation for free weights, recommendation-based peak-targeting for cable, and a separate machine-brand assessment) are replaced by **one simple ordinal rating applied consistently across every equipment type**:

```
1 — strongly ascending  (hardest at the top/end of the range)
2 — mildly ascending
3 — flat                (roughly constant resistance through the range)
4 — mildly descending
5 — strongly descending (hardest at the bottom/start of the range)
```

- Applies to **all equipment** — barbell, dumbbell, cable, plate-loaded machine, pin/selectorized machine, Smith — not just the "hard" cases. A barbell bench press is trivially "1, ascending" (hardest off the chest, easiest at lockout); a cable's direction is knowable from which way the pulley pulls, no derived geometry needed. One mental model instead of three different mechanisms answering the same underlying question ("does this get harder, easier, or stay constant through the rep").
- **`equipment` field, five values**: Barbell / Dumbbell / Cable / Plate-Loaded Machine / Pin Machine — a single field, not baked into the exercise name (see §5's data-model section). Plate-loaded vs. pin/selectorized machines are split because they behave differently (plate-loaded is gravity-driven, closer to free weights; pin/cam machines have a resistance profile built into that specific cam, brand-dependent).
- **Best-effort estimation, not sourced/cited.** Explicitly decided over requiring real citations (manufacturer specs, EMG literature) the way the *existing* curated tables (`EXERCISE_ANGLES.js`, `emgActivation.js`) were built — this is deliberately lower-rigor than those, since the ordinal scale itself is coarse enough that precise sourcing isn't the bottleneck the way exact EMG percentages would be.
- **Comprehensive machine catalog, not just the current 9-brand bucketed list.** `machineBrands.js` currently only tracks brand *names* (for the separate brand-calibration weight-adjustment system) at a per-brand granularity ("a gym's leg press, chest press, and lat pulldown all come from the same manufacturer roster"). The resistance-curve assessment goes further: every machine/brand combination gets its own 1-5 rating, not one rating per brand — a Life Fitness leg press and a Life Fitness chest press can and do have different curve shapes even though they'd share a brand-calibration weight adjustment.

  **Brand scope, researched against real UK gym-chain data (not narrowed to one "primary" brand per chain — comprehensive coverage of every brand actually present at each chain):**

  | # | Chain | UK Locations | Equipment brands present |
  |---|---|---|---|
  | 1 | PureGym | ~360-500+ | Life Fitness + Matrix Fitness |
  | 2 | The Gym Group | ~150-240+ | Matrix Fitness (contract since 2008) |
  | 3 | JD Gyms | ~230 | Technogym + Life Fitness (also True Fitness/FreeMotion per existing `machineBrands.js` research) |
  | 4 | Anytime Fitness | ~190 | Precor (their single biggest global partnership — sole vendor across all 32 countries they operate in) |
  | 5 | Nuffield Health | ~110-112 | Technogym (named lead supplier, 2024 announcement) |

  This confirms every brand named here already exists somewhere in `machineBrands.js`'s existing 9/8/8 lists — no genuinely new brand names needed — but raises Precor and Technogym's real-world importance (each the *exclusive* supplier for one of these five chains) above what a flat alphabetical brand list implies. Sources: Statista UK gym operator rankings, GymPal chain comparisons, ScrapeHero location counts, Health Club Management's reporting on the Precor/Anytime Fitness and Technogym/Nuffield Health supplier deals.
- **Execution: an overnight agent research job**, not manual synchronous work — populate the 1-5 ratings across the full machine/brand/exercise catalog as a background task, best-effort, understood as approximate rather than verified data (contrast with the existing tables, which are treated as trustworthy inputs to fatigue/PR calculations).

---

## 3. Goal / muscle-emphasis layer (curls, extensions, rows only)

The motivating question: once an exercise is parameterized (equipment + angle + rotation for curls, equipment + angle for extensions/rows), the picker needs *some* criterion to recommend a setup or write a coaching note — otherwise it's a slider with no guidance, which isn't meaningfully better than today's flat list.

### No mandatory setup
- **Default behavior treats sub-muscles equally** — for elbow flexion: biceps brachii / brachialis / brachioradialis; for elbow extension: the three triceps heads; for rows: lats / rhomboids-mid-traps / rear delts.
- The default target is **balanced coverage over time**, inferred from what's actually been logged (which variants the athlete has actually done recently), **not** from an explicit stated preference. No onboarding step, no mandatory goal-picker before logging a set.

### Optional override
- An athlete **can** set an explicit preference per movement family (e.g. "for elbow flexion, I care about biceps more than brachialis") — modeled the same way as existing durable athlete preferences already in the schema: `profile.muscleFocus`, `profile.compoundIsolationPreference`, `profile.preferredSplit`. Set once, editable later from Settings, **not** re-asked per log.
- **Priority order**: an explicit stated goal, once set, becomes the primary driver of recommendations/notes for that family — the balanced-from-logged-history default is purely the fallback for someone who's never stated a preference, not something that competes with an explicit goal once one exists.

### Coaching notes, not overrides
- The system **never blocks or overrides** an athlete's actual exercise choice — matches `PRODUCT.md`'s existing "editorial, not a black box" stance, the same register as the already-built "Ask why" drill-down and Atlas's coaching voice.
- Instead, when a logged choice doesn't serve the active goal (explicit or default-balanced), it surfaces an **informative note**, not a correction: e.g. an athlete who consistently logs overhead extensions gets a note that pushdowns hit the triceps long head harder — stated as information, not a rule they broke.

---

## 4. Open questions (not yet resolved — next layer to drill)

- **Coaching note surface — RESOLVED.** Both: a short tip shown right next to the exercise on the picker itself (actionable before the set is logged, which is the only moment "try pushdowns instead" is actually useful), *and* a note in Atlas's existing post-exercise/post-session commentary (retrospective). Not one or the other — both surfaces, no new commentary-generation pass needed since it reuses Atlas's existing voice.

- **Migration mechanics — RESOLVED, with standard angle conventions set.** This **physically mutates stored lift history** (a one-time backend rewrite of old chunked lift entries — canonical name + inferred angle stamped in), a deliberate departure from the read-time-lookup alternative that was raised and rejected. Standard angle conventions to use for the rewrite, since there's no real per-athlete signal to infer from (gyms don't record exact incline degrees):
  - Shoulder Press → 75°
  - Incline → 30°
  - Flat → 0°
  - Decline → -15°

  (Note: Shoulder Press's 75° sits within the *existing* vertical press 0–180° arc already used by `EXERCISE_ANGLES.js`/`PressRowBuilder` — this migration convention and that existing system should agree, not define two competing angle scales for the same joint.)

- **Custom exercise handling — RESOLVED, and this changes the exercise-creation flow going forward, not just migration.** The free-text "+ Use '[name]'" escape hatch in the current search UI is **removed entirely** — every exercise, standard or custom, gets created through the structured picker from now on:
  - **Existing custom-named logs** (pre-migration): prompt the athlete to clarify equipment/parameters at migration time rather than guessing.
  - **Future custom exercises**: no more typing an arbitrary name from scratch. Instead, the tree gets a **"new movement" leaf at the bottom of each pattern's movement list** — the athlete still picks a real muscle group and pattern structurally (unlike today's `registerUnknownExercisesAsCustom`, which stores whatever string was typed with zero taxonomy), then free-types only the specific movement *name* at that one final step, and is prompted for equipment/parameters same as any other entry afterward.
  - **Future imports** (Hevy sync, CSV): the same clarification-at-creation logic applies — any incoming custom-named exercise that looks like it matches a parameterized family's naming pattern gets the same clarification prompt, not silently re-admitted as an unparameterized free-text string.
  - Expected to be rare in practice once the tree is built out — "very unlikely" a real exercise won't already be represented somewhere in the structured tree.

## 5. Recommendation logic — RESOLVED mechanism, data still uncurated

The existing `functions/emgActivation.js` infrastructure — angle-indexed activation tables (`{muscle: percentage}` per angle, already used for press/row fatigue attribution) — is the mechanism, not a new heuristic. This settles both the goal-preference input shape and the "land the resistance peak correctly" question in one design:

- **Goal-preference input stays a single primary-muscle pick** (§3), because the precision lives in the table lookup, not the input — the pick just tells the lookup which muscle to optimize for.
- **Recommendation formula: maximize the isolation ratio**, not raw activation. Given a goal muscle, scan the equipment/angle/rotation table for the combination where `goalMuscle% ÷ nextHighestCompetingMuscle%` is highest — not simply where the goal muscle's raw percentage peaks. Raw-maximum was considered and rejected: it can select a setup that's just high-effort overall without differentially emphasizing the goal muscle over its competitor, which silently ignores the "over brachialis" half of a goal like "prioritize biceps over brachialis." Worked example (illustrative numbers, not real curated data): angle 90° at biceps 80%/brachialis 75% has a *worse* isolation ratio than angle 45° at biceps 68%/brachialis 40%, even though the raw biceps number is lower at 45° — the isolation-ratio formula correctly prefers 45°.
- **Default-balanced case (no goal set) uses the identical formula and table** — only the target muscle differs: instead of an athlete-named goal, it's whichever of the family's muscles has received the least cumulative EMG-weighted stimulus in recent logged history (same "recent contribution" math already used elsewhere for fatigue/adaptation tracking). Not a second mechanism, the same one with a different target-selection rule.

**Still uncurated**: the elbow-flexion table itself (shoulder-angle × hand-rotation × equipment → biceps/brachialis/brachioradialis percentages) doesn't exist yet. The existing tables only have biceps/brachioradialis as *secondary* contributors within the press/row tables, not as the primary movement's own table. Building this table is real EMG-literature curation work, comparable in effort to how the existing press/row tables were built (per prior changelog history: exercise-by-exercise, over multiple sessions, not automated) — not a quick lookup to assemble.

## 6. Data model — partially resolved

- **Storage granularity: per-exercise-instance, not per-set.** Angle and rotation are set once for the whole exercise entry within a session, matching how `machine`/`pulleyType` already work today (`ex.machine`, `ex.pulleyType` on the exercise object, not on each individual set) — you dial in a bench angle once and do all your sets at it, same as you don't re-select a machine brand between sets. Modeling set-level granularity would be over-fitting to a rare edge case (angle-dropsetting) at the cost of matching an established, working pattern.
- **Exercise name collapses to one canonical string per movement.** "Bench Press" instead of separate `"barbell bench press"`/`"dumbbell bench press (flat)"` strings — equipment becomes real queryable data instead of being buried in the name, which is the whole point of collapsing the proliferation in the first place.
- **`equipment` is a new field, separate from the existing `machine` field.** `machine` already means *brand* (e.g. "Life Fitness," feeding `brandCalibration.js`'s per-user weight-adjustment system) and stays exactly as-is; `equipment` is the new *type* field: Barbell / Dumbbell / Cable / Plate-Loaded Machine / Pin Machine. They answer different questions and both matter independently — merging them would break the existing brand-calibration system, which already depends on `machine` meaning brand specifically.
- **Goal-preference field**: single primary-muscle-pick value (not a ranking or weights — see §5), stored per movement family on `profile`, same pattern as the existing `profile.muscleFocus`/`profile.compoundIsolationPreference`/`profile.preferredSplit` durable-preference fields. Set once, editable later, never re-asked per log.
- **Still not designed**: the literal field/key shapes (exact property names, how a movement-family key is represented on `profile`, how the per-set schema documents equipment/angle/rotation together) — the *shape* of each piece is resolved above, not the literal schema.

## 7. Resistance-curve data collection — DONE (commit `0ab8093`)

`functions/resistanceCurves.js` is built, tested (8 structural-sanity tests, `test/resistanceCurves.test.js`), and merged:
- **988 entries**: the 1-5 ordinal rating (§2) for 72 machine/cable/smith exercises × 28 brands, all brand-keyed. Free-weight/bodyweight/kettlebell exercises are deliberately **not stored** — brand never applies to them (nothing to differentiate), so `baseRatingFor(exercise)` (still exported from the same file) computes that case directly on demand instead of persisting a lookup entry with only one possible value. Only 2 exercises skipped entirely (Power Clean, Hang Clean — ballistic multi-phase lifts, no single curve-shape judgment applies), both with stated reasons.
- **Plate-loaded base resistance (kg)** — added after the main pass, since `machineBrands.js` doesn't distinguish plate-loaded from pin-loaded machines at all (both bucket under `'machine'` equipment today). Deliberately narrow rather than guessed across every machine exercise: Hammer Strength generally (that brand's whole identity), plus Leg Press/Single-Leg Press/Hack Squat/Calf-Raise-on-Leg-Press across the specific brands whose plate-loaded lines came up in this feature's own brand research (Atlantis Strength, SportsArt, Life Fitness, Matrix Fitness, Panatta, Gym80). The lever ratio itself (how much a given kg of plates gets multiplied by) was explicitly *not* estimated — lower confidence than even the base-resistance figure, left out rather than guessed.
- Same best-effort, no-citation-required rigor as the rest of §2 — explicitly lower-rigor than the EMG-sourced `EXERCISE_ANGLES.js`/`emgActivation.js` tables, flagged prominently in the new file's own header comment so it's never mistaken for that level of rigor.
- **Process note**: this was produced by a background agent (a fork of this session), which correctly flagged and declined to act on what it judged to be a suspicious out-of-band instruction — a legitimate mid-task scope addition (the plate-loaded piece) that arrived via a follow-up message rather than its original directive. The caution was reasonable in principle even though it was a false positive here; the plate-loaded piece was added afterward directly, not re-delegated.

## 8. Still open (not yet drilled)

- **Literal schema** — exact field/property names and shapes (see §6's last bullet).
- **Table curation sourcing** — where the actual EMG percentages for the elbow-flexion (and eventually row) tables come from, and to what confidence standard, before any recommendation can honestly ship. Separate from and higher-rigor than the resistance-curve data in §7.

## 9. Single-limb / bilateral field

A 6th parameterization field, alongside equipment/angle/rotation (§6), stored the same way (per-exercise-instance, not per-set). Exists to collapse today's separately-named unilateral variants (Single-Arm Dumbbell Press, Single-Leg Press, Single-Arm Lat Pulldown, Single-Leg RDL, Single-Arm Cable Row, etc. — the same shape of proliferation bench press/curls/rows already had) into their bilateral counterpart + a limb flag, rather than leaving them as permanently separate DB entries outside the parameterization model.

### Weight-logging rule
**Always log whatever's actually set on the equipment — never a value the app computes or transforms.** What differs is what that number *means*, which depends on whether the equipment has one shared load path or an independent one per side:

- **Independent per side (double-pulley cable, iso-lateral machines like Hammer Strength's press/row lines)**: the number is already a per-side reading by construction. Switching single-limb ↔ bilateral never changes it — using one side or both, that side's own resistance is what it is.
- **Shared load path (single-pulley/single-stack cable, most pin-loaded machines, barbell)**: going bilateral → single-limb roughly **halves** the comparable weight to keep per-limb effort equivalent (one arm alone moving the full stack ≈ two arms sharing double that stack) — and single-limb → bilateral roughly **doubles** it. Worked example: a lat pulldown done bilaterally at 60kg on a single-stack machine ≈ 30kg single-arm on the same machine, since one arm now has to move the whole stack alone that it previously shared with the other.
- This is a **suggested equivalent weight when switching modes**, not a transformation applied to what gets logged — the athlete still always logs the real number on the equipment; the 2x/0.5x relationship is what the app can *suggest* as a starting point when switching, using the shared-vs-independent distinction already established for `equipment` (§2/§6).

### Scope — audit DONE (commit `cd36961`), migration decisions still open

`functions/limbOptions.js` audits all 211 exercises: **45 marked limb-capable** (17 dumbbell — always independent-per-side; 28 cable/machine — shared-load by default, but genuinely depends on `pulleyType`/brand at log time, e.g. Hammer Strength's iso-lateral lines flip this to independent).

Of the 12 existing "Single-Arm"/"Single-Leg"-named exercises:
- **Recommended to collapse (6)**: Single-Arm Lat Pulldown → Lat Pulldown (Neutral Grip); Single-Arm Cable Row → Seated Cable Row; Single-Arm Cable Lateral Raise → Lateral Raise (Cable); Single-Arm Dumbbell Press → Dumbbell Bench Press (Flat); Single-Leg Press → Leg Press; Single-Arm Cable Pushdown → Cable Tricep Pushdown (Bar).
- **Recommended to stay separate (4)** — a real balance/stability challenge, not a load-only choice: Single-Leg RDL, Single-Leg Hip Thrust, Single-Leg Calf Raise, Single-Arm Landmine Row.
- **No clean bilateral target exists yet (2)**: Single-Arm Cable Press, Standing Single-Arm Cable Row.

**Both decisions resolved (commit `c4ef786`):**
1. **"Hip Thrust (Machine)" — added.** New `EXERCISE_DB` entry, joining the existing "hip-thrust" movement family (Barbell Hip Thrust, Hip Thrust (Smith Machine) — a distinct pre-existing equipment type, not a duplicate). Booty Builder's real flagship product now has somewhere to attach data; picked up automatically by the resistance-curve generator.
2. **Single-Leg Press collapse — confirmed correct, reconciliation plan documented, migration itself still not done.** Its `RESISTANCE_CURVES` entry is redundant with "Leg Press"'s once the collapse ships. Its `PLATE_LOADED_BASE_RESISTANCE_KG` values are **not** redundant — a single-leg carriage genuinely has a lighter empty weight than the bilateral platform (e.g. Hammer Strength 20kg vs 32kg) — so nothing was deleted; the re-keying plan for when the actual `exerciseDb.js` migration happens is documented in both `resistanceCurves.js` and `limbOptions.js`. That migration (removing the live "Single-Leg Press" entry, wiring the limb field into real logging) hasn't happened yet, consistent with every other collapse recommendation (bench press, curls, etc.) also remaining design-only so far.
