

# EXECUTIVE TASK BRIEF FOR CLAUDE: SPECS #6, #17, #7, #4 & #10
## ULTRA-DETAILED CODE & DATA CONTRACT SPECIFICATION

---

## 1. DATA TYPES & INTERFACES

Add/extend these exact types in your type definitions (e.g., `src/types/engine.ts` or `src/types/index.js`):

typescript
export type ExerciseParameterKey = 'incline' | 'gripWidth' | 'gripRotation' | 'stance' | 'armPath';

export interface ExerciseParameterState {
  incline: number;       // degrees: 0 to 90
  gripWidth: number;     // ratio: 0.5 (narrow) to 1.5 (wide), default 1.0
  gripRotation: 'pronated' | 'neutral' | 'supinated';
  stance: 'narrow' | 'shoulder' | 'wide' | 'sumo';
  armPath: 'flared' | '45deg' | 'tucked';
}

export interface MuscleEMGProfile {
  muscleId: string;
  baseEMG: number;       // percentage (sums to 100 in baseline profile)
  transferFunctions: {
    [key in ExerciseParameterKey]?: (value: any) => number; // Multiplier function
  };
}

export interface EvaluatedParameterResult {
  exerciseId: string;
  parameters: ExerciseParameterState;
  normalizedEMG: Record<string, number>; // muscleId -> normalized % (sums to 100)
  fatigueAllocation: Record<string, number>; // muscleId -> F_{e,m}
  totalStimulus: number;
  limitingFatigue: number; // L_e = max(R_m)
  configurationScore: number; // Score_e(\theta)
  recommendedLoad: number; // In kg/lbs
}

export interface LimitingFactorPayload {
  id: string;
  title: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  impactScore: number;
  explanation: Record<'beginner' | 'intermediate' | 'sportScientist', string>;
  expectedPerformanceDelta: string;
  mitigationStrategy: string;
}

export interface WhatIfSimulationDelta {
  baselineSessionId: string;
  candidateSessionId: string;
  performanceDelta: {
    e1RMChangePercent: number;
    targetMuscleStimulusDelta: number;
  };
  fatigueDelta: {
    netFatigueChange: number;
    impactedMuscles: Array<{ muscleId: string; deltaRatio: number }>;
  };
  recoveryDelayDeltaHours: number; // e.g., +4.5 hours to 100% capacity
}



---

## 2. MATHEMATICAL IMPLEMENTATIONS & ENGINE UTILITIES

### A. Parameter EMG Re-Normalization (`src/engine/exerciseParameters.js`)

Implement the exact algorithm below. Do not deviate from the normalization sequence:

/**
 * Calculates normalized EMG distribution and Fatigue Allocation (F_{e,m})
 * 
 * Step 1: Compute raw shifted EMG per muscle: rawEMG_m = baseEMG_m * PROD(f_k(\theta_k))
 * Step 2: Sum rawEMGs: TotalRaw = SUM(rawEMG_m)
 * Step 3: Re-normalize: NormEMG_m = (rawEMG_m / TotalRaw) * 100
 * Step 4: Apply Gamma Exponent: F_{e,m} = Sets * Intensity * Vol * E_m * (NormEMG_m / 100)^1.4
 */
export function calculateParameterEMG(exerciseId, baseProfiles, currentParams, setContext) {
  const { sets = 1, intensity = 1.0, volumeMultiplier = 1.0, muscleCapacities = {} } = setContext;
  const GAMMA = 1.4;

  let rawSum = 0;
  const rawEMGs = {};

  // Step 1: Calculate raw shifted EMG
  baseProfiles.forEach(profile => {
    let multiplier = 1.0;
    Object.keys(currentParams).forEach(paramKey => {
      if (profile.transferFunctions && profile.transferFunctions[paramKey]) {
        multiplier *= profile.transferFunctions[paramKey](currentParams[paramKey]);
      }
    });
    const rawVal = profile.baseEMG * multiplier;
    rawEMGs[profile.muscleId] = rawVal;
    rawSum += rawVal;
  });

  const normalizedEMG = {};
  const fatigueAllocation = {};

  // Step 2 & 3: Re-normalize to 100% and Step 4: Calculate F_{e,m}
  baseProfiles.forEach(profile => {
    const mId = profile.muscleId;
    const normVal = rawSum > 0 ? (rawEMGs[mId] / rawSum) * 100 : 0;
    normalizedEMG[mId] = Number(normVal.toFixed(2));

    const recoveryCoef = muscleCapacities[mId]?.E_m || 1.0;
    const normRatio = normVal / 100;
    
    // F_{e,m} formula application
    const f_em = sets * intensity * volumeMultiplier * recoveryCoef * Math.pow(normRatio, GAMMA);
    fatigueAllocation[mId] = Number(f_em.toFixed(4));
  });

  return { normalizedEMG, fatigueAllocation };
}



### B. Leverage Load Scalar & Bayesian Update (`src/engine/exerciseParameters.js`)


export function calculateRecommendedLoad(base1RM, leveragePrior, historicalData = null) {
  // Biomechanical Leverage Multiplier
  let loadScalar = leveragePrior;

  // Bayesian Individual Update if empirical data exists for this specific parameter state
  if (historicalData && historicalData.sampleCount > 0) {
    const empiricalScalar = historicalData.observed1RM / base1RM;
    const weight = Math.min(historicalData.sampleCount / (historicalData.sampleCount + 5), 0.85); // Prior vs Empirical weight
    loadScalar = (leveragePrior * (1 - weight)) + (empiricalScalar * weight);
  }

  return Math.round((base1RM * loadScalar) * 2) / 2; // Round to nearest 0.5kg/lb
}



---

## 3. TARGET MUSCLE PLANNER (`src/engine/targetMusclePlanner.js`)

Implement a pre-filtered discrete step permutation algorithm that runs synchronously under 16ms:


// Pre-defined discrete parameter steps to prevent infinite loop memory leaks
export const PARAMETER_DISCRETIZATION_STEPS = {
  incline: [0, 15, 30, 45, 60, 75, 90],
  gripWidth: [0.6, 1.0, 1.4], // Narrow, Standard, Wide
  stance: ['narrow', 'shoulder', 'wide', 'sumo'],
  armPath: ['flared', '45deg', 'tucked']
};

export function findOptimalConfigurations(targetMuscleIds, candidateExercises, athleteState, lambdaPenalty = 1.5) {
  const results = [];

  for (const exercise of candidateExercises) {
    // 1. Skip exercises that don't hit target muscles
    const hitsTarget = exercise.muscleProfiles.some(p => targetMuscleIds.includes(p.muscleId));
    if (!hitsTarget) continue;

    // 2. Permute discrete parameters for this exercise
    const paramCombos = generateDiscreteCombinations(exercise.supportedParameters);

    for (const params of paramCombos) {
      const { normalizedEMG, fatigueAllocation } = calculateParameterEMG(
        exercise.id,
        exercise.muscleProfiles,
        params,
        { sets: 3, intensity: 1.0, muscleCapacities: athleteState.capacities }
      );

      // Target Stimulus Sum
      const targetStimulus = targetMuscleIds.reduce((sum, mId) => sum + (normalizedEMG[mId] || 0), 0);

      // Limiting Fatigue L_e = max_{m in M_e} (R_m)
      let maxFatigueRatio = 0;
      exercise.muscleProfiles.forEach(p => {
        const ratio = athleteState.currentFatigueRatios[p.muscleId] || 0;
        if (ratio > maxFatigueRatio) maxFatigueRatio = ratio;
      });

      // Score_e(\theta) = Stimulus / (1 + \lambda * L_e)
      const score = targetStimulus / (1 + (lambdaPenalty * maxFatigueRatio));

      results.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        parameters: params,
        targetStimulus,
        limitingFatigue: maxFatigueRatio,
        score,
        normalizedEMG,
        fatigueAllocation
      });
    }
  }

  // Sort descending by calculated configuration score
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}



---

## 4. TODAY'S LIMITING FACTOR DIAGNOSTIC (`src/engine/limitingFactor.js`)


export function identifyTodayLimitingFactor(athleteState, scheduledSession, userExpertiseMode = 'intermediate') {
  const candidateFactors = [];

  // 1. Evaluate CNS / Neural Drive Fatigue
  if (athleteState.cnsFatigueScore > 0.25) {
    const relevance = calculateSessionAxialLoading(scheduledSession);
    candidateFactors.push({
      id: 'cns_elevated',
      title: 'Elevated Central Nervous System Fatigue',
      severity: athleteState.cnsFatigueScore > 0.5 ? 'high' : 'moderate',
      impactScore: athleteState.cnsFatigueScore * relevance,
      explanations: {
        beginner: "Your nervous system is still recovering from recent heavy workouts. Swap to machine exercises to keep building muscle safely today.",
        intermediate: `Elevated CNS fatigue (Neural Drive down ${Math.round(athleteState.cnsFatigueScore * 100)}%). Multi-joint compounds will feel significantly heavier.`,
        sportScientist: `CNS Voluntary Activation Deficit: ${athleteState.cnsFatigueScore.toFixed(2)}. Axial load coefficient: ${relevance.toFixed(2)}.`
      },
      mitigation: "Swap axial barbell lifts (Squat/Deadlift) for chest-supported or machine movements."
    });
  }

  // 2. Evaluate Local Muscle Structural Fatigue Ratios
  Object.keys(athleteState.currentFatigueRatios).forEach(muscleId => {
    const ratio = athleteState.currentFatigueRatios[muscleId];
    if (ratio > 0.70) {
      const relevance = calculateSessionMuscleRelevance(scheduledSession, muscleId);
      candidateFactors.push({
        id: `local_fatigue_${muscleId}`,
        title: `High Local Fatigue: ${formatMuscleName(muscleId)}`,
        severity: ratio > 0.85 ? 'critical' : 'high',
        impactScore: ratio * relevance,
        explanations: {
          beginner: `Your ${formatMuscleName(muscleId)} needs more rest before being pushed hard again.`,
          intermediate: `${formatMuscleName(muscleId)} structural fatigue ratio is at ${Math.round(ratio * 100)}%, restricting maximum power output.`,
          sportScientist: `Structural Fatigue Ratio R_${muscleId} = ${ratio.toFixed(3)} exceeding limit threshold (0.70).`
        },
        mitigation: `Reduce volume on exercises targeting ${formatMuscleName(muscleId)} or adjust parameter sliders to shift load to synergists.`
      });
    }
  });

  if (candidateFactors.length === 0) return null;

  // Isolate highest impact factor (tie-breaker prefers CNS/Systemic)
  candidateFactors.sort((a, b) => b.impactScore - a.impactScore);
  const primary = candidateFactors[0];

  return {
    ...primary,
    explanation: primary.explanations[userExpertiseMode] || primary.explanations.intermediate
  };
}



---

## 5. "WHAT IF?" SANDBOX TRANSIENT CONTEXT (`src/engine/whatIfSimulator.js`)

Ensure transient cloning is isolated using deep object freezing/cloning:


export class WhatIfSimulatorContext {
  constructor(athleteStateModel) {
    // Deep clone state snapshot to prevent live state mutation
    this.baseSnapshot = JSON.parse(JSON.stringify(athleteStateModel));
    this.transientState = JSON.parse(JSON.stringify(athleteStateModel));
  }

  previewSessionAlteration(candidateSession) {
    // 1. Run transient session forward simulation
    const simulatedFatigueState = simulateSessionFatigue(this.transientState, candidateSession);
    
    // 2. Calculate e1RM Delta
    const baselineE1RM = calculateSessionE1RM(this.baseSnapshot, candidateSession);
    const simulatedE1RM = calculateSessionE1RM(simulatedFatigueState, candidateSession);
    const e1RMChangePercent = ((simulatedE1RM - baselineE1RM) / baselineE1RM) * 100;

    // 3. Calculate Recovery Time Delta (Hours to 100% capacity)
    const baselineRecoveryHours = calculateTimeToFullRecovery(this.baseSnapshot);
    const simulatedRecoveryHours = calculateTimeToFullRecovery(simulatedFatigueState);

    return {
      performanceDelta: {
        e1RMChangePercent: Number(e1RMChangePercent.toFixed(1)),
      },
      fatigueDelta: {
        netFatigueChange: computeNetFatigueDifference(this.baseSnapshot, simulatedFatigueState),
      },
      recoveryDelayDeltaHours: Number((simulatedRecoveryHours - baselineRecoveryHours).toFixed(1))
    };
  }

  reset() {
    this.transientState = JSON.parse(JSON.stringify(this.baseSnapshot));
  }
}



---

## 6. REACT UI LAYER CONTRACTS & INTEGRATION

### A. Dynamic Component: `MuscleCreditVisualizer.jsx`

* **Props Contract**:
* `normalizedEMG`: `Record<string, number>`
* `fatigueAllocation`: `Record<string, number>`
* `activeExpertiseMode`: `'beginner' | 'intermediate' | 'sportScientist'`


* **Visual Spec**:
* Display dual horizontal progress bars per involved muscle.
* **Bar 1 (Top / Cyan `#06b6d4`)**: Pure normalized EMG activation percentage.
* **Bar 2 (Bottom / Amber `#f59e0b` or Red `#ef4444`)**: Fatigue Allocation $F_{e,m}$ score.
* Smooth animation using CSS `transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);`.



### B. Dynamic Component: `ParameterExplorer.jsx`

* Render range sliders for numerical parameter values (`incline`, `gripWidth`).
* Render segmented buttons for discrete settings (`gripRotation`, `stance`, `armPath`).
* Render an SVG tick mark at `recommendedValue` on every slider track so the user clearly sees baseline deviation.

### C. Expertise Formatting Wrapper

Every UI card built for these specs MUST filter its numerical depth based on the global state mode:

jsx
export function LimitingFactorCard({ factorPayload, userMode }) {
  return (
    <div className="card-panel">
      <h3>{factorPayload.title}</h3>
      <p className="description">{factorPayload.explanation}</p>

      {/* Sport Scientist Mode Only: Raw Equations & Metrics */}
      {userMode === 'sportScientist' && (
        <div className="raw-math-block">
          <code>Impact Score: {factorPayload.impactScore.toFixed(4)}</code>
          <code>Severity Rating: {factorPayload.severity}</code>
        </div>
      )}

      {/* Intermediate Mode: Show standard percentages */}
      {userMode === 'intermediate' && (
        <div className="metric-badge">
          Expected Performance Impact: {factorPayload.expectedPerformanceDelta}
        </div>
      )}

      <div className="mitigation-callout">
        <strong>Suggested Action:</strong> {factorPayload.mitigationStrategy}
      </div>
    </div>
  );
}



---

## 7. STEP-BY-STEP BUILD & TEST CHECKLIST FOR CLAUDE

When executing this prompt, complete and verify the following tasks in order:

* [ ] **Task 1: Math Core Implementation**
* Implement `calculateParameterEMG` in `src/engine/exerciseParameters.js`.
* Add unit test verifying sum of normalized EMG array equals $100.00\%$ within $0.01\%$ floating point variance.


* [ ] **Task 2: Target Muscle Optimization Finder**
* Implement `findOptimalConfigurations` in `src/engine/targetMusclePlanner.js`.
* Add test confirming that an exercise with high target EMG but high limiting fatigue ratio ($L_e > 0.80$) receives a lower configuration score than a lower-target exercise with $L_e = 0.10$.


* [ ] **Task 3: Limiting Factor & Transient Sandbox**
* Implement `identifyTodayLimitingFactor` and `WhatIfSimulatorContext`.
* Write unit test ensuring calling `previewSessionAlteration` does NOT mutate the root `AthleteStateModel` object.


* [ ] **Task 4: React Components & UI Visualizer**
* Build `ParameterExplorer.jsx`, `MuscleCreditVisualizer.jsx`, `TargetMusclePlannerPanel.jsx`, and `WhatIfSandbox.jsx`.
* Wire up global `visibilitychange` listener on masonry container to trigger dynamic recalculation when tabs switch.





