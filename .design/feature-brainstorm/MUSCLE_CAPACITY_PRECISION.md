# muscleCapacity.js precision overhaul ("Feature 1") — recap, written up before build

This was designed in detail in an earlier session but never committed to a doc — reconstructing it here from what's certain before handing it to a build agent, rather than letting exact numbers drift on memory alone. Structural decisions below were explicit "yes" answers; numeric constants are flagged where they need a fresh confirmation rather than asserted as already-agreed.

## Current state (`functions/muscleCapacity.js`, unchanged)

Solves per-muscle "capacity" (latent kg value) from logged press/row history via ridge regression: `e1RM_i ≈ Σ_m (EMG%_m / 100) × capacity_m` across every distinct logged angle, ridge-regularized (`RIDGE = 4.0`, a fixed constant) because the system is normally underdetermined (13+ possible muscles, rarely that many distinct angles logged). Requires `MIN_OBSERVATIONS = 3` distinct exercises or returns `null` outright. Negative solved capacities are hard-clamped to 0 (`Math.max(0, solved[i])`).

Three real gaps this overhaul targets:

## 1. Mean-prior fix (replaces the hard 0-floor)

`Math.max(0, solved[i])` throws away information — a muscle whose regression solves slightly negative (noise, not truth) gets clipped to exactly 0 instead of shrunk toward something more plausible. Fix: shrink each muscle's estimate toward a **prior mean** (the athlete's own average capacity across muscles that DO have solid data, not a fixed constant) rather than toward zero — same shrinkage direction ridge regression already uses, just with a non-zero, athlete-specific target.

## 2. Adaptive λ (replaces fixed `RIDGE = 4.0`)

Confirmed: **accuracy-maximizing**, not compute-minimizing (explicit "yes" to prioritizing prediction accuracy over server cost). Fixed ridge penalty is wrong for both extremes — too weak when an account has only the minimum 3 observations (unstable), too strong once an account has 10+ distinct logged angles (unnecessarily shrinks a well-determined system). Fix: pick λ per-account via leave-one-out cross-validation over a small candidate set (`RIDGE_CANDIDATES`), choosing whichever minimizes held-out prediction error.

**Decided**: `RIDGE_CANDIDATES = [1, 2, 4, 8, 16]` (log-spaced around the current fixed value) — proposed and adopted.

## 3. Joint equipment (brand+model) calibration via ALS

Confirmed decisions from that session:
- Barbell/dumbbell/cable **generalize** across manufacturers (no brand-specific factor needed) — only **machines** get one, because two machines of the same nominal lift can load very differently for the same true e1RM (a Life Fitness machine vs. a Hammer Strength machine).
- Keyed by **brand AND model**, not brand alone (explicit "yes it should be model and brand, not just brand").
- A machine-specific `EQUIPMENT_LOAD_FACTOR` is solved **jointly** with muscle capacities via alternating least squares (ALS): hold capacities fixed, solve for each machine's load factor from its own logged observations; hold load factors fixed, re-solve capacities using load-factor-corrected observations; iterate to convergence.
- **Fading shrinkage via a virtual-sample-size prior**: a machine's load factor starts heavily shrunk toward 1.0 (no adjustment — trust the generic model) when few observations exist for that specific brand+model, and the shrinkage fades in proportion to how much real data accumulates for it. This is the same shape as a Bayesian pseudo-count prior, not a hard cutoff.
- A small minimum observation count gates whether a machine gets its own factor solved at all (explicit "yes, small minimum 2/3").

**Decided**: minimum is **3** distinct observations, matching the existing `MIN_OBSERVATIONS` convention already used elsewhere in this file.

**Delegated to the build agent**: the exact virtual-sample-size value (how many "phantom" observations of trust the generic 1.0 factor starts with before real data outweighs it) is a tunable, not a load-bearing decision — the build agent should pick a small, clearly-named, clearly-commented constant (e.g. `EQUIPMENT_FACTOR_PRIOR_WEIGHT`) and document its reasoning, same as any other estimated constant in this codebase (e.g. `RIDGE`'s own original choice).

## Not yet re-derived

The compute-cost discussion (you asked "how much would this increase calculation power cost on a Firebase server" and I answered at the time) — I don't have that number preserved anywhere accurate, so it isn't restated here. ALS with cross-validated λ is more expensive than the current one-shot ridge solve (multiple linear-system solves instead of one, times however many CV folds/candidate λs), but it's still small, dense matrices (≤15x15) solved with Gauss-Jordan, not anything that scales with lift history size — if the exact cost estimate matters before building this, worth re-running rather than trusting a stale memory of it.

## Status: confirmed, ready to build

Both flagged numbers above are resolved. Handed to a background build agent — self-contained math changes to `muscleCapacity.js`, new test coverage in `test/muscleCapacity.test.js`, no frontend changes expected (this only changes prediction quality, not any UI surface).
