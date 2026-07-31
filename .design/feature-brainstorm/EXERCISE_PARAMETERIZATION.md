# Exercise Selection Tree + Parameterized Exercises — Mechanics Draft

Two connected pieces, worked out via a grilling pass on 2026-07-29: (1) a node-link tree UI for exercise selection, replacing the current step-by-step tile picker; (2) collapsing today's flat proliferation of separately-named exercise variants (bench press's 6 named entries, row's ~15, etc.) into parameterized entries — equipment + a continuous parameter — with an optional goal/coaching-note layer on top for the families where the science supports it. Nothing below is built yet; this document captures decisions, not implementation.

This is explicitly the "Parameterized exercise variants (angle/incline)" item flagged as **NOT DONE** in prior roadmap notes, where only the migration policy had been decided (existing logged history retroactively rewrites into the new parameterized shape, e.g. old "Incline Barbell Bench Press" logs become "Bench Press" + an inferred incline value — see below). The guided-tree UI was previously told to wait until parameterization existed; in practice we did the UI first and are now doing parameterization, which is fine — the tree's variant-selection step just doesn't have anything real to attach to until this ships.

---

## 0. The governing principle — why any of this exists

Everything below (§1-14) is an instance of one idea, and it applies to **every exercise in the database eventually, not just press**:

**An exercise's identity is a feature vector — equipment, angle, width, rotation, stance/support, single-limb/bilateral, and whatever else turns out to matter — not a name.** A name is a *derived label*, computed by matching a specific feature combination against known patterns, not a primary key something else hangs off of.

This inverts how the app currently works. Today, `exerciseDb.js` and everything downstream of it (`fatigue.js`'s muscle crediting, `muscleCapacity.js`'s capacity model, `strengthStandards.js`/`muscleStandards.js`'s PR and standards tracking) key off a literal **name string** — name is primary, and only a few exercises (the ones with curated EMG profiles, or PressRowBuilder-generated ones) get any feature-derived treatment at all, bolted on as secondary metadata. Every decision in this document — Bench Press's collapse (§2), Overhead Press/Row's collapse (§4), grip width/rotation (§10-11), stance/support (§12), the unified press angle scale (§14) — is really the same move applied to a different slice of the database: stop trusting the name, derive everything real (muscle credit, fatigue, capacity, PRs) from the feature vector instead.

**The UX stays name-first, the backend stays feature-first.** A lifter searching the picker still taps "Shoulder Press" — a recognizable name, not a raw feature combination — which pre-fills the features that name typically implies (relevant equipment choices, a sensible starting angle). They adjust from there (equipment, incline, etc.). What actually gets saved is the feature vector; what gets *displayed*, back to the lifter and everywhere else in the app, is whichever name best matches that vector — "Shoulder Press" because that's what it resolves to, not because "Shoulder Press" is a row in a table the set is filed under. If they adjust the angle far enough, the matched name can change (e.g. drifting from Shoulder Press territory into Bench Press territory per §14's unified scale) without the underlying storage model changing at all.

Practical implication for anything built against this document: the *matching* direction (feature vector → best-fit name, for display) is new work, separate from and in addition to the *lookup* direction (name → default feature values, for picker convenience) that `EXERCISE_ANGLES.js` already does today in a narrower form. Both directions need to exist; today only the second one does.

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
  - **The actual payoff, per §0**: this isn't just cleaner taxonomy — it's what makes real EMG data available for a custom exercise at all. A custom exercise's free-typed name is a label riding *on top of* the same pattern/equipment/angle/rotation/width feature vector every other entry uses, not a replacement for it. Under today's `registerUnknownExercisesAsCustom`, a custom exercise gets zero EMG modeling — flat, generic muscle credit only. Under this model, a custom exercise built through the structured picker gets exactly the same feature-derived muscle crediting, fatigue attribution, and capacity-model participation as a curated one, because the athlete supplied the same underlying parameters — it just also carries a second, athlete-chosen name alongside whatever common name (if any) that same feature combination would otherwise match to.

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

## 10. Grip-width field

A 7th parameterization field (alongside equipment / angle / rotation / brand / resistance-curve-rating / single-limb — §6, §9), scoped to **Bench Press and Row only**, on **Barbell and Machine equipment specifically**. Not Dumbbell — each hand holds an independent implement, there's no fixed "width" to choose between. Not Cable — the equivalent choice there is attachment type (rope / straight bar / V-handle), a related but distinct parameter, out of scope here.

### Scope — Overhead Press excluded, pending better evidence
Grip-width literature for overhead pressing is thin and mostly Olympic-lifting/clean-grip-adjacent, not a real hypertrophy-emphasis axis the way bench press and row grip width are. Same evidentiary bar already applied elsewhere in this doc (§2 excludes shoulder press from the goal/note layer for the analogous reason: "the interesting front-vs-lateral-delt tradeoff belongs to raise variants, not press"). Deferred, not ruled out — revisit if better sourcing turns up.

### Precedent already in the codebase
Not a new premise: `functions/exerciseEmgProfiles.js`'s pull-up/pulldown family already carries real, literature-sourced grip-width differentiation (Close-Grip Lat Pulldown: lats 46; standard/Wide-Grip: lats 27; Behind-Neck: lats 23 — narrower/underhand grips pull closer to the torso and read more lat-favorable, wider/behind-neck grips shift toward rear-delt/rhomboids). Currently implemented as separately-named static entries — exactly the proliferation this whole effort exists to collapse. This field generalizes the same underlying biomechanical premise into a slider instead of a name, for bench/row.

**Not to be confused with the existing grip-*rotation* axis** (`PRESS_GRIP_EMG`/`ROW_GRIP_EMG`, `GRIP_ANGLES` — pronated → neutral → supinated, in `emgActivation.js`). That's rotation of the hand about its own axis, currently advisory-only (`gripCueForProfile` — a coaching cue, doesn't change what's logged or credited). Grip width is a physically different axis (hand spacing along the bar) and, per below, is not advisory.

### Real parameter, not an advisory cue — RESOLVED
Matches this document's overall direction: stored per-exercise-instance (same convention as equipment/angle, §6), and actually changes the EMG weights credited for that logged set — feeding the capacity/fatigue model the same way angle does, not a coaching tip layered on after the fact.

### Data needed — new curation work, full rigor (not the resistance-curve's best-effort tier)
Two new tables, same sourcing standard as `EXERCISE_ANGLES.js`/`emgActivation.js` (cited literature):
- **Bench press**: chest / triceps / front-delt across close / medium / wide grip.
- **Row**: lats / rear-delt / rhomboids / biceps across close / medium / wide grip.

Discrete keys (close / medium / wide), not a continuous slider — matches how the existing rotation axis is discrete (0/45/90/135/180) rather than continuous, since a barbell only offers a handful of practically distinct hand positions.

### Open — machine grip-width, rigor level undecided
Barbell is unambiguous: every barbell is the same continuous bar, graspable anywhere along it, so close/medium/wide is universally available. Machines are not — `machineModels.js`/`machineBrands.js` don't track handle configuration at all today, and most selectorized press/row machines only offer a single fixed handle position; whether a given machine even offers a real choice is a machine-by-machine question nothing currently answers. Two ways to handle it, needs a decision before building:
1. **Full research pass** — audit which specific machine models actually offer multiple handle positions, comparable in shape to the existing brand+model machine catalog research.
2. **Best-effort reuse** — apply the barbell-derived width values to machine exercises too, as an approximation, flagged at the resistance-curve's lower rigor tier rather than the EMG tables' full-citation standard, on the assumption that a machine's neutral/wide handle setting roughly mirrors the equivalent barbell hand position.

## 11. Grip-rotation field — promoted from advisory cue to a real parameter — RESOLVED

Grip rotation (pronated → neutral → supinated, about the hand's own long axis — physically distinct from grip width in §10) already exists as data and code: `PRESS_GRIP_EMG`/`ROW_GRIP_EMG`, `GRIP_ANGLES` (`[0, 45, 90, 135, 180]`), and `GRIP_ANGLES_BY_EQUIPMENT` in `functions/emgActivation.js`. Until now it's been advisory-only (`gripCueForProfile` — a coaching suggestion, doesn't change what's logged or credited). Decision: promote it to a real, stored-per-exercise-instance parameter, same status as angle and (per §10) width.

**Per-equipment availability is already resolved, unlike width's open machine question** — `GRIP_ANGLES_BY_EQUIPMENT` already encodes real constraints: barbell → `[0, 180]` only (true neutral needs a specialty bar, not assumed available); dumbbell/cable → full range (rotate freely); machine → `[]`, no recommendable rotation at all (no per-exercise handle data exists to know what's offered). Once rotation is a real parameter rather than a cue, this table becomes load-bearing — it defines what the picker actually offers, not just what a cue is allowed to suggest.

### Open — how rotation combines with the sagittal (angle) weight vector
`PRESS_GRIP_EMG`/`ROW_GRIP_EMG` only track a subset of muscles (biceps/brachioradialis/brachialis/front-delt/triceps for press; biceps/brachioradialis/lats/lower-traps/rear-delt for row) — not the full set `PRESS_EMG`/`ROW_EMG` track (chest, mid-delt, serratus, rhomboids, mid-traps, teres-major, etc.). So a logged set's full credited weight vector can't come from the rotation table alone. Proposed approach: treat rotation as a **modifier on top of the sagittal base vector**, applied only to the muscles it tracks — the same pattern already used elsewhere in `movementEmg.js` for a secondary axis adjusting a subset of a primary table (`CALF_SEATED_MODIFIER`, `SHRUG_BAR_PATH_MODIFIER`, `ROTATOR_CUFF_ELEVATION_MODIFIER`), rather than inventing a new blending mechanism. Needs confirmation before building — this is the one real architectural fork here.

### Open — `gripCueForProfile`'s fate
Once rotation is explicitly chosen at log time for parameterized exercises, the advisory-cue function has nothing left to advise about for those exercises. Does it get retired entirely, or kept alive as a fallback suggestion for exercises that haven't been migrated into the parameterized model yet (so there's still a rotation recommendation for those in the interim)?

## 12. Stance/support field — Press (seated/standing), Row (chest-supported/standing) — RESOLVED as in-scope

An 8th (er, 9th, at this point) parameterization field: a two-value toggle, per pattern — Press gets seated/standing, Row gets chest-supported/standing (free, bent-over). Stored per-exercise-instance, same convention as every other field in §6.

**Mechanism — proposed, needs confirmation: this is NOT another EMG-percentage redistribution table like angle/rotation/width.** Angle/rotation/width all work by shifting *which* prime-mover muscle gets more or less credit at the same total effort. Stance/support is different in kind: the prime movers (delts/triceps/chest for press; lats/rhomboids/rear-delt for row) don't really shift emphasis based on support — what changes is (a) how much of your total effort goes into the lift itself vs. spinal/core stabilization, and (b) whether the erector-spinae/core get credited as real secondary movers at all. That's the same shape of problem `EQUIPMENT_LOAD_FACTOR` (§ muscleCapacity.js precision work) already solves for barbell-vs-dumbbell stabilization tradeoffs — a supported position frees up effort that would otherwise go to stabilizing, similar to how a barbell's fixed bar frees up effort a dumbbell's independent-balancing demand would otherwise consume.

Proposed: model this as (1) a load-factor-style multiplier (standing/unsupported credits *less* absolute load-moved for the same target-muscle effort, same mechanism as the equipment factor, not a separate new mechanism) and (2) a toggle on whether erectors/core appear as secondary muscles at all for that logged set (present when standing/bent-over, dropped or reduced when seated/chest-supported). Needs confirmation before building — this reuses Feature 1's mechanism rather than inventing a third table type, which is why it's flagged as proposed rather than settled.

## 13. T-Bar Row equipment classification — RESOLVED

T-Bar Row is a plate-loaded, fixed-pivot apparatus — closer to Plate-Loaded Machine than free Barbell or a true Machine/Pin category. The lateral freedom of movement a T-bar/landmine setup allows doesn't meaningfully change its stability category. Classify it as **Plate-Loaded Machine** rather than inventing a dedicated landmine/T-bar equipment type.

## 14. Unified Press angle scale — Overhead Press, Bench Press, and Dips are ONE parameterized family — RESOLVED

Bigger than a Phase-2 detail: Overhead Press, Bench Press (§2's pilot), and Dips/Tricep Press are not three separate parameterized exercises with their own scales — they're **one continuous angle axis**, with "Bench Press," "Overhead Press," and "Dip/Tricep Press" as *labels for different regions of the same underlying parameter*, not separate canonical exercises.

**Convention: 0° = Flat Press, positive = toward incline/shoulder/overhead, negative = toward decline/dip** — extending the sign convention the Bench Press pilot already shipped (Flat=0°, Incline=30°, Decline=-15°), rather than the vertical press arc's original native convention (0°=arm at side, 90°=flat, 180°=overhead). This was chosen specifically because it required less rework of already-shipped code and matches how lifters actually talk about bench angle ("a 30° incline," not "120° on an arm-elevation arc").

Full resolved partition, in 15° steps (confirmed there are no real gaps once you account for the grid — everywhere looked like a gap was actually just two adjacent 15°-step values with nothing missing between them; only one true gap existed, at -45°, now assigned to Decline):

| Angle | Category |
|---|---|
| -90°, -75°, -60° | Dip / Tricep Press |
| -45°, -30°, -15° | Decline Press |
| 0° | Flat Press |
| +15°, +30° | Incline Press |
| +45° | Hybrid Shoulder/Incline Press |
| +60° and above | Shoulder / Overhead Press |

**Compatibility with the already-shipped Bench Press pilot**: good news — not a conflict, an extension. The pilot's own values (Flat=0°, Incline=30°, Decline=-15°) fall correctly within this table's Flat/Incline/Decline zones under the same sign convention. What the pilot doesn't yet have: range extending past ±30° to reach Hybrid/Shoulder-Overhead territory on the positive end and Decline/Dip territory on the negative end (it's currently capped at `angleRange: {min:-30, max:60, step:5}` — the +60 cap already technically reaches into Shoulder/Overhead per this table, but the -30 floor stops short of Dip/Tricep entirely), and its 5° step vs. this table's 15° step needs reconciling if Bench Press and Overhead Press are to genuinely share one field going forward.

**Exercise identity / picker UX — RESOLVED.** One canonical entry — Phase 1's existing `exerciseDb.js` "Bench Press" row gets extended (wider `angleRange`, reconciled step size) rather than a competing "Overhead Press" entity created alongside it. "Bench Press"/"Overhead Press"/"Shoulder Press"/"Dip"/"Tricep Press" all survive only as *display labels*, matched from the underlying (angle, equipment, stance/support, ...) feature vector per §0 — not separate rows a lifter's set gets filed under.

**The label match isn't angle alone — it also reads Stance/Support (§12/§17).** Confirmed concretely for the Shoulder/Overhead region (new angle ≥ +60°, per §14's table): if Stance/Support = Standing, the matched label is **"Overhead Press"**; if Stance/Support = Seated, the matched label is **"Shoulder Press"** — same angle region, different label, because that's genuinely how lifters distinguish the two in practice. Full label-matching table, by unified-scale region (§14):

| Region | Label |
|---|---|
| -90° to -60° | Dip / Tricep Press |
| -45° to -15° | Decline Press |
| 0° | Bench Press (flat) |
| +15° to +30° | Incline Press |
| +45° | Incline Shoulder Press (Hybrid) |
| +60° and above, Standing | Overhead Press |
| +60° and above, Seated | Shoulder Press |

This is the first real instance of the feature-vector-to-name matching direction §0 describes — worth building as the shared, reusable mechanism (`matchExerciseName(pattern, features)`, raised earlier as an open question) rather than a one-off if-chain specific to Press, since Row's own labels (plain Row vs. Pulldown vs. Pull-up, per §15) need the exact same kind of multi-field match.

## 15. Pull-up/Lat Pulldown family folds into Row, not a separate family — RESOLVED

`emgActivation.js`'s own row-axis definition already cites both extremes as pull-up/pulldown examples ("0° = a low pull, e.g. straight-arm pulldown... 180° = an overhead pull, e.g. pull-up") — this was never a separate pattern needing its own model, it's the existing Row axis's own upper (and one lower) anchor. Confirmed numerically: every existing named pull-up/pulldown entry's `lats` value in `exerciseEmgProfiles.js` matches `ROW_EMG`'s angle table exactly:

| Existing named entry | lats value | Matches `ROW_EMG` angle |
|---|---|---|
| Cable Straight-Arm Pulldown | 95 | 0° |
| Close-Grip Lat Pulldown | 46 | 120° |
| Chin-up, Pull-up (Neutral), Lat Pulldown (Neutral/Underhand) | 38 | 135° |
| Single-Arm Lat Pulldown | 32 | 150° |
| Pull-up (Wide), Weighted Pull-up, Lat Pulldown (Wide) | 27 | 165° |
| Behind-Neck Lat Pulldown | 23 | 180° |

These were already derived from `ROW_EMG` by whoever curated them (matches that file's own comment: narrower/underhand grips pull closer to the torso, wide/behind-neck grips sit closer to true overhead) — just never connected back to Row's own parameterization.

**Grip-width becomes angle-dependent in its mechanism, not its data:**
- **Below ~105° (seated/bent-over row territory)**: width is a genuine independent dimension from angle — you can grip narrow or wide at the same pulling angle — so it stays a real delta-modifier (`ROW_GRIP_WIDTH_EMG`, the seated-row-study-sourced table already built).
- **At 120° and above (pulldown/pull-up territory)**: width and angle collapse into the *same* choice — picking a grip width mechanically determines how close to true-overhead the pull is. No new modifier needed here; the existing angle table already encodes it exactly, per the table above. Width just becomes an alternate, more familiar UI label for selecting a specific angle in this region, not a second axis multiplying against it.

**New equipment value needed**: Row's equipment choices must include **Bodyweight** for Chin-up/Pull-up/Weighted Pull-up (self-powered, not barbell/dumbbell/cable/machine) — cable/machine covers every lat pulldown variant.

**Single-Arm Lat Pulldown is not its own width category** — it's Neutral-Grip Lat Pulldown (135°) plus the single-limb/bilateral flag (§9), sitting at a slightly adjusted curated angle (150°) to reflect the real stability/mechanics shift unilateral loading causes, not a fourth grip-width option alongside close/neutral/wide/behind-neck.

## 16. Angle-value corrections found by auditing every existing named entry against the axis's own definition — RESOLVED

Same rigor as §4's Bent Over Row/Pendlay Row fix, applied to the rest of the list. Two clear, confirmed duplicate-value inconsistencies, plus one case where the right fix isn't a corrected constant at all:

- **Seated row cluster**: Seated Cable Row (Bar Grip), Seated Cable Row (V Grip), Seated Iso-Lateral Row, and Seated Iso-Low-Row Cable Machine (NU) were at 105° despite all being the same basic seated-row movement as Seated Iso-Row Cable Machine, Seated Row (Machine), and Seated Upper Back Iso-Row Cable Machine (NU) — already at 90°, which also matches `ROW_EMG`'s own header comment citing "90° = a pull from in front, e.g. seated cable row" as its defining example. **Corrected default: 90°**, for all of them.
- **High row cluster**: High Lat Row was at 30° despite being the same category of movement as Iso-Lateral High Cable Row (Machine) and Iso-Lateral High Row (Machine), both at 15°. **Corrected default: 15°.**
- **Seated/machine shoulder press cluster** (Seated Shoulder Press (Machine) (+TF), Shoulder Press (Hard Machine)) — **not a single-value fix.** Unlike the two above, there's no confident "one correct angle" here: different shoulder-press machines genuinely press on different paths (some dead-vertical, some on a forward-diagonal path closer to Hybrid/incline territory), and guessing a universal constant would just be trading one under-differentiated value for another. **Resolution: don't hardcode it — make angle athlete-specifiable for this cluster** (and, by the same logic, for the seated-row and high-row clusters above too — their corrected values become sensible *pre-fill defaults* in the picker, not new permanently-fixed constants). This is exactly Phase 2's own equipment+angle picker mechanism (§4) — these three clusters are concrete input to that build, not a reason to keep hand-patching `EXERCISE_ANGLES.js` entry by entry the way Bent Over Row was (a reasonable one-off fix, since Pendlay/Bent-Over genuinely only ever have one correct angle between them — not a precedent to repeat for entries whose real angle actually varies by setup).

## 17. Full parameter schema across every exercise pattern — RESOLVED (one item open)

Scoped via an interactive Y/N pass covering every major pattern family against 8 candidate dimensions, then corrected against what's actually built/sourced. This is the definitive cross-pattern reference — supersedes any pattern-specific parameter list stated earlier in this doc where the two disagree.

**A 9th dimension had to be added mid-pass**: the original 8 columns conflated two genuinely different things under "Frontal-Plane Angle" — arm-*elevation* to the side (what `PRESS_FRONTAL_EMG`/`ROW_FRONTAL_EMG` actually measure, viewed from the front) vs. arm-*sweep* forward/backward relative to the torso at roughly constant shoulder height (viewed from above — a true transverse-plane axis). The first is real and already built for Press/Row's elbow-flare cue. The second doesn't exist in the codebase at all, and is what actually differentiates a standard Lateral Raise from a Y-Raise from a Rear Delt Fly from a Band Pull-Apart — currently four separately-named, separately-curated exercises with no shared axis between them, the exact shape of proliferation this whole document exists to collapse. Added as **Transverse/Sweep Angle**, a 9th column.

| Category | Exercise Type | Sagittal Angle | Frontal-Plane Angle | Transverse/Sweep Angle | Hand Rotation | Grip/Stance Width | Depth/ROM | Stance/Support | Single-Limb/Bilateral | Equipment |
|---|---|---|---|---|---|---|---|---|---|---|
| Upper Push | Press (Bench/Overhead/Dip — unified, §14) | Y | Y | N | Y | Y | N | Y | Y | Y |
| Upper Push | Fly | N | Y | Y | N | N | N | N | Y | Y |
| Upper Pull | Row (incl. Pulldown/Pull-up, §15) | Y | Y | N | Y | Y | N | Y | Y | Y |
| Upper Isolation | Curl | Y | N | N | Y | N | N | N | Y | Y |
| Upper Isolation | Extension (Triceps) | Y | N | N | N | N | N | N | Y | Y |
| Upper Isolation | Lateral Raise | N | N | Y | N | N | N | N | Y | Y |
| Upper Isolation | Shrug | Y | N | N | N | N | N | N | Y | Y |
| Lower Body | Squat | N | N | N | N | Y | Y | Y | Y | Y |
| Lower Body | Leg Press | Y | N | N | N | Y | Y | N | Y | Y |
| Lower Body | Leg Curl (Hamstring) | Y | N | N | N | N | N | N | Y | Y |
| Lower Body | Leg Extension (Quad) | N | N | N | N | N | N | N | Y | Y |
| Lower Body | Deadlift / Hinge | Y | N | N | N | Y | Y | N | Y | Y |
| Lower Body | Hip Thrust | N | N | N | N | N | Y | N | Y | Y |
| Lower Body | Kickback (Glute) | N | Y | N | N | N | N | Y | Y | Y |
| Lower Body | Calf Raise | N | N | N | N | N | N | Y | Y | Y |
| Core | Core (Anti-Extension/Anti-Rotation) | N | N | N | N | N | N | Y | N | Y |
| Other | Rotator Cuff Rotation† | Y | N | N | N | N | N | Y | Y | Y |
| Other | Hip Abduction/Adduction | N | N | N | N | N | N | N | N | Y |

**Notes on specific rows:**
- **Fly — resolved: both Frontal-Plane AND Transverse/Sweep apply.** Not an either/or with Lateral Raise after all — Fly gets a genuinely 2D angle space (elevation × sweep), since it can vary on both axes independently (an incline cable fly changes elevation; high-to-low vs. low-to-high changes sweep). See §18 for the full Transverse axis this unlocks, unifying Fly with Lateral Raise and Rear Delt Fly into one family.
- **Curl / Extension — Stance/Support explicitly ruled N.** What "preacher vs. standing" (Curl) or "overhead vs. lying" (Extension) would have meant here is already fully captured by Sagittal Angle itself — that's the literal reason the angle axis exists for these two patterns. Would have been double-counting the same thing under two names.
- **Leg Curl (Hamstring) — Sagittal=Y**, using the already-sourced Maeo et al. 2020 data (hamstrings rise 75→87→99 across lying-to-seated hip positions) rather than discarding real literature because Leg Extension's own audit correctly found nothing to curate.
- **Rotator Cuff Rotation† — imperfect column fit, flagged rather than hidden.** None of the 8 original columns cleanly describe shoulder internal/external rotation. Mapped as Sagittal=Y for the primary rotation-degree axis (`ROTATOR_CUFF_ANGLES`/`ROTATOR_CUFF_EMG`) and Stance/Support=Y for the arm-elevation modifier (`ROTATOR_CUFF_ELEVATION_MODIFIER` — 0° arm-at-side vs. 90°-abducted external rotation), reusing existing columns as the closest available fit rather than adding a 10th dimension for one pattern.

**New-data implications, ranked by how much sourcing work they actually need:**
- **Zero new sourcing** — Press, Row, Curl, Extension, Rotator Cuff Rotation: every Y above maps to data that already exists in the codebase (possibly needing promotion from cue to real parameter, per §11, but not new research).
- **New sourcing, but scoped and named** — Legs (Squat's width/depth, Leg Press's own EMG+angle+depth, Deadlift's width/depth, Hip Thrust's depth): genuinely new work, but the shape of what's needed is already clear from this table.
- **New sourcing, not yet scoped at all** — Transverse/Sweep Angle's actual EMG data. Resolved in §18 below via interpolation between existing anchors, not fresh literature — flagged accordingly.

## 18. Transverse/Sweep Angle — unifies Fly, Lateral Raise, and Rear Delt Fly into one family

Same move as §14 (Press) and §15 (Row): Chest Fly, Lateral Raise, and Rear Delt Fly/Y-Raise/Band Pull-Apart aren't separate patterns, they're one continuous arm-sweep-at-roughly-constant-shoulder-height arc, currently expressed as a pile of separately-named, separately-curated exercises with no shared axis between them.

**No literature exists for this axis at all** — unlike Press/Row, where real curated data already existed to audit and correct, this table is a fresh construction, built by interpolating between the three anchor points that *do* already exist in `exerciseEmgProfiles.js` (Chest Fly's flat `chest: 70`, Lateral Raise's `mid-delt: 100, front-delt: 22`, Rear Delt Fly's `rear-delt: 100, mid-traps: 100, rhomboids: 91`). Same construction method the original `PRESS_EMG`/`ROW_EMG` tables used (anchored to real zones, smoothly interpolated between them) — this is a reasoned interpolation between three known points, not independently sourced at every angle, and should be flagged as such wherever it's implemented.

**Convention**: 0° = hands together in front of the chest (Chest Fly's fully-squeezed position) → 90° = arms straight out to the sides, T-pose (Lateral Raise's raised position) → 180°-270° = arms sweeping behind the body (Rear Delt Fly territory, increasing rear-delt/scapular-retraction emphasis toward 270°).

| Angle | Chest | Front-Delt | Mid-Delt | Rear-Delt | Mid-Traps | Rhomboids |
|---|---|---|---|---|---|---|
| 0° | 70 | 15 | 5 | 0 | 0 | 0 |
| 15° | 70 | 16 | 10 | 0 | 0 | 0 |
| 30° | 68 | 17 | 20 | 0 | 0 | 0 |
| 45° | 62 | 18 | 38 | 2 | 0 | 0 |
| 60° | 50 | 20 | 60 | 5 | 5 | 3 |
| 75° | 30 | 21 | 85 | 12 | 12 | 8 |
| 90° | 8 | 22 | 100 | 20 | 20 | 15 |
| 105° | 0 | 18 | 92 | 35 | 35 | 28 |
| 120° | 0 | 14 | 78 | 52 | 52 | 44 |
| 135° | 0 | 10 | 60 | 68 | 68 | 58 |
| 150° | 0 | 6 | 42 | 82 | 82 | 72 |
| 165° | 0 | 3 | 26 | 92 | 92 | 82 |
| 180° | 0 | 0 | 14 | 98 | 98 | 88 |
| 195° | 0 | 0 | 8 | 100 | 100 | 90 |
| 210° | 0 | 0 | 4 | 100 | 100 | 91 |
| 225° | 0 | 0 | 2 | 100 | 100 | 91 |
| 240° | 0 | 0 | 0 | 100 | 100 | 91 |
| 255° | 0 | 0 | 0 | 98 | 96 | 89 |
| 270° | 0 | 0 | 0 | 95 | 93 | 86 |

Shape: chest dominates 0°-60° and is essentially gone by 90° (a fly and a lateral raise share zero chest involvement once the arms are straight out to the side); mid-delt climbs to its exact peak at 90° (matching Lateral Raise precisely) and falls off just as hard past 120° (a true rear-delt movement doesn't work mid-delt); rear-delt/mid-traps/rhomboids stay near-zero until ~90°, climb to their peak by ~210°-240°, and hold roughly flat to 270° (with a slight taper reflecting reduced mechanical efficiency at the extreme end).

**Named exercise placement:**
- **~15° (chest-dominant)**: Cable Fly (High to Low / Low to High), Cable Crossover, Pec Deck/Machine Fly, Incline Cable Fly, Svend Press. These currently share an identical flat value with no differentiation between them — placed together rather than inventing distinctions the data doesn't support. (Upper/lower pec fiber emphasis some of these names imply — e.g. high-to-low vs. low-to-high cable path — is a separate, not-yet-modeled axis, not this one.)
- **90° (exact)**: Lateral Raise (Dumbbell/Cable/Machine), Single-Arm Cable Lateral Raise, Landmine Lateral Raise.
- **~240° (rear-delt/scapular-dominant)**: Cable Y-Raise, Incline Y-Raise (Dumbbell), Band Pull-Apart, Rear Delt Fly (Dumbbell/Cable), Reverse Pec Deck. All currently identical or near-identical — a real distinction between a diagonal Y-raise and a horizontal pull-apart would need its own sourcing, not fabricated here.
