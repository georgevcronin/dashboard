# EXECUTIVE TASK BRIEF FOR CLAUDE: SPECS #6, #17, #7, #4 & #10

## ARCHITECTURAL CONSTRAINTS & CORE PHILOSOPHY
1. **One Engine, Multiple Visibility Views**: Beginner, Intermediate, and Sport Scientist modes dictate ONLY how much data is displayed. The underlying fatigue calculations, EMG distributions, recovery rates, and recommendation scoring MUST remain identical regardless of user mode.
2. **Honest Quantification**: Never use placeholder percentages or fake heuristics disguised as science. Every stimulus shift, load change, or recovery trade-off must be a calculated comparison between real model states.
3. **Unified Athlete State Model**: Every parameter change, exercise selection, and simulated session feeds into or queries the single, evolving Athlete State Model.
4. **Test-Driven Delivery**: Every new utility function must be accompanied by unit tests and fuzzing to guarantee mathematical boundaries (e.g., non-negative loads, valid EMG sums, finite recovery half-lives).

---

## IMPLEMENTATION BREAKDOWN BY SPECIFICATION

### 1. SPEC #6 & #17: Interactive Exercise Parameters & Animated Muscle Credit

#### Objective:
Replace static parameter dropdowns (or hidden settings) with continuous or discrete step sliders for exercise movement variables. Instantly recalculate muscle EMG distributions, mechanical load adjustments, fatigue costs, and render an animated visual representation of muscle activation shifts.

#### Affected Files:
- `src/engine/exerciseParameters.js` (NEW / EXTEND): Parameter mapping math & EMG shift rules.
- `src/components/ParameterExplorer.jsx` (NEW): Slider UI component with recommendation overlay.
- `src/components/MuscleCreditVisualizer.jsx` (NEW): Dynamic SVG/Canvas animated muscle recruitment heatmap/credit bar.
- `src/tests/exerciseParameters.test.js` (NEW): Test parameter shifts and edge cases.

#### Parameter Shift Mathematical Engine (`exerciseParameters.js`):
Base EMG weights for exercise $e$ across muscle set $M_e$ are modified dynamically based on user parameter adjustments $\vec{\theta} = (\text{angle}, \text{gripWidth}, \text{gripRotation}, \text{stance}, \text{armPath})$.

1. **EMG Redistribution Vector Transformation**:
   For each parameter $\theta$, apply transfer functions that adjust the baseline EMG weight $\text{EMG}_{e,m}^0$:
   $$\text{EMG}_{e,m}(\vec{\theta}) = \text{EMG}_{e,m}^0 \times \prod_{k} f_k(\theta_k, m)$$
   *Example Logic (Pressing Angle $\theta_{\text{angle}}$ from $0^\circ$ Flat to $90^\circ$ Overhead)*:
   - Pectoralis Major (Clavicular / Upper): Peaks around $30^\circ - 45^\circ$ ($f(\theta) = 1.0 + 0.45 \cdot \sin(\pi \cdot \theta / 90)$).
   - Pectoralis Major (Sternocostal / Lower): Decreases monotonically as angle rises ($f(\theta) = \cos(\pi / 2 \cdot \theta / 90)$).
   - Anterior Deltoid: Increases monotonically ($f(\theta) = 1.0 + 1.2 \cdot (\theta / 90)$).
   - Triceps Brachii: Shifts according to grip width multiplier ($\theta_{\text{grip}}$).

2. **Normalisation Guardrail**:
   $$\sum_{m \in M_e} \text{EMG}_{e,m}(\vec{\theta}) = 100\%$$
   The adjusted EMG values must always re-normalize to $100\%$ total movement contribution across primary, secondary, and synergist muscles.

3. **Emphasis Exponent & Fatigue Contribution Calculation**:
   Calculate muscle-specific set fatigue $F_{e,m}$ using the re-normalized EMG:
   $$F_{e,m} = S \cdot I \cdot V \cdot E_m \cdot \left(\frac{\text{EMG}_{e,m}(\vec{\theta})}{100}\right)^\gamma \quad (\gamma = 1.4)$$

4. **Mechanical Load Adjustment Factor**:
   Leverage changes modify recommended load $W_{\text{rec}}$:
   $$W_{\text{rec}}(\vec{\theta}) = W_{\text{base}} \times M_{\text{leverage}}(\vec{\theta})$$
   *(e.g., Incline pressing reduces load leverage relative to flat benching; deficit deadlifts reduce load relative to block pulls).*

#### UI & Visualization Requirements (`ParameterExplorer.jsx` & `MuscleCreditVisualizer.jsx`):
- **Interactive Sliders**: Continuous range sliders for `Angle (0° - 90°)`, `Grip Width (Narrow -> Wide)`, `Grip Rotation (Pronated -> Neutral -> Supinated)`, and `Stance`.
- **Recommended Baseline Marker**: Show a visual tick/indicator on each slider marking the engine's optimal recommended parameter setting.
- **Delta Indicator**: Display the exact divergence between current selection and optimal recommendation (e.g., "+15° Incline -> +12% Anterior Deltoid fatigue, -8% Sternocostal Chest stimulus").
- **Live Visual Credit Bar / Heatmap**: An animated, transition-smoothed chart or anatomical diagram updating muscle activation credit live as the slider is dragged.

---

### 2. SPEC #7: Target Muscle Planner

#### Objective:
Invert the workflow: allow users to pick one or more target muscles first, and have Press evaluate the exercise library and parameter permutations to discover the optimal movement configuration, slider settings, and prescribed loading to maximize stimulus while respecting the athlete's current fatigue constraints.

#### Affected Files:
- `src/engine/targetMusclePlanner.js` (NEW): Optimization finder algorithm.
- `src/components/TargetMusclePlannerPanel.jsx` (NEW): Interactive muscle selector & calculated result display.
- `src/tests/targetMusclePlanner.test.js` (NEW): Optimization tests.

#### Optimization Algorithm Logic:
1. **Inputs**:
   - Target Muscle Set $T \subseteq \mathcal{M}$ (e.g., $T = \{\text{Upper Chest}, \text{Lateral Deltoid}\}$).
   - Current Athlete State Model (Current Fatigue Ratios $R_m$, Muscle Capacities $C_m$, Equipment Available, Injuries).
2. **Permutation & Scoring Sweep**:
   For every candidate exercise $e$ capable of targeting $T$:
   - Sweep parameter space $\vec{\theta}$ at discrete step intervals (e.g., angle steps of $15^\circ$, 3 grip widths).
   - Calculate candidate stimulus $\text{Stimulus}_e(\vec{\theta}, T)$ across target muscles.
   - Calculate limiting fatigue $L_e(\vec{\theta}) = \max_{m \in M_e} R_m$.
   - Compute Net Configuration Score:
     $$\mathrm{Score}_e(\vec{\theta}) = \frac{\sum_{m \in T} \text{Stimulus}_{e,m}(\vec{\theta})}{1 + \lambda \cdot L_e(\vec{\theta})}$$
3. **Output**:
   - Top-ranked exercise.
   - Recommended slider parameters $(\theta_{\text{optimal}})$.
   - Prescribed set, rep, and load scheme.
   - Explanation of why this configuration optimizes target stimulus while avoiding already-fatigued synergists.

---

### 3. SPEC #4 & #10: Today's Limiting Factor & "What If?" Simulation Sandbox

#### Objective:
1. Highlight the primary constraint limiting today's performance (*Today's Limiting Factor*) with plain-language context, expected performance cost, and actionable mitigations.
2. Provide a predictive *What If?* Sandbox allowing athletes to test hypothetical workout alterations before committing, displaying instant real-time differentials in performance, fatigue accumulators, and recovery timelines.

#### Affected Files:
- `src/engine/limitingFactor.js` (NEW): Primary constraint diagnostic engine.
- `src/engine/whatIfSimulator.js` (NEW): Differential state simulation engine.
- `src/components/LimitingFactorPanel.jsx` (NEW): Dashboard card.
- `src/components/WhatIfSandbox.jsx` (NEW): Interactive pre-commit simulator.
- `src/tests/limitingFactor.test.js` & `whatIf.test.js` (NEW).

#### Today's Limiting Factor Diagnostics (`limitingFactor.js`):
Evaluate all internal state constraints to isolate the highest relative performance impairment:
1. **Candidate Limiting Factors**:
   - *CNS / Systemic Fatigue*: High accumulated neural fatigue from recent heavy axial loading or poor sleep.
   - *Specific Muscle Fatigue Capacity*: High local structural fatigue ratio $R_m \ge 0.75$.
   - *Sleep / Biometric Impairment*: Substantial baseline recovery point sacrifice (from `recoveryScore.js`).
   - *Substrate / Glycogen Depletion*: Consecutive high-volume training days without sufficient rest/nutrition.
2. **Isolation Formula**:
   Find factor $k$ maximizing impact function $I_k$:
   $$\text{Limiting Factor} = \arg\max_k \left( \text{Impairment}_k \times \text{RelevanceToTodaySession}_k \right)$$
3. **Structured Output Payload**:
   ```json
   {
     "id": "cns_fatigue_elevated",
     "title": "Elevated Central Nervous System Fatigue",
     "severity": "moderate",
     "explanation": "Heavy axial loading over your last 2 sessions combined with below-baseline sleep has reduced voluntary neural drive.",
     "expectedImpact": "-4.5% predicted top-end strength on heavy compound lifts",
     "mitigation": "Swap heavy barbell compound movements for supported machine variations today."
   }
