# TRACK 2: Hybrid Training Engine
## Parallel Track for Lifting + Running + Sports Fatigue Management

**Duration:** 5–7 days  
**Status:** Ready to start immediately. Equipment availability (#39) merged in Track 1.  
**Ship Criteria:** Core algorithm tested, UI displays multi-activity fatigue + allocation, 50+ tests passing.

---

## OVERVIEW

Build a unified fatigue model that handles lifting, running, and sports simultaneously. Athletes have a shared recovery pool across all activities — when CNS is saturated from heavy squats, it affects running readiness. The system must:
1. Compute per-muscle + CNS + cardiovascular + connective tissue fatigue
2. Allocate weekly recovery budget across activities (Primary/Secondary/Maintenance)
3. Show trade-offs when activities conflict
4. Recommend session pacing to avoid overtraining across domains

## ARCHITECTURE

### **1. Shared Fatigue Engine** (`functions/sharedFatigueEngine.js`)

Extends the existing single-activity fatigue model in `functions/fatigue.js`.

#### Input Structure
```javascript
const multiActivityState = {
  lifts: [
    { date: '2026-07-15', exercises: [...], sessionStimulusScore: 2100 },
    { date: '2026-07-14', exercises: [...], sessionStimulusScore: 1800 }
  ],
  runs: [
    { date: '2026-07-16', distance: 10, duration: 3600, pace: 360, avgHR: 165, elevation: 200 },
    { date: '2026-07-14', distance: 8, duration: 2880, pace: 360, avgHR: 155, elevation: 0 }
  ],
  sports: [
    { date: '2026-07-13', type: 'soccer', duration: 5400, intensity: 'high', musclesEngaged: ['quads', 'glutes', 'hamstrings'] }
  ]
}
```

#### Computation Function Signature
```javascript
function computeSharedFatigue(multiActivityState, athleteProfile) {
  // Returns:
  return {
    structural: { 
      chest: 65, quads: 72, biceps: 40, // per-muscle
      _raw: { chest: 120, quads: 145, biceps: 78 } // uncapped for What If
    },
    cns: { current: 75, _raw: 145 },
    cardiovascular: { current: 68, _raw: 130 }, // aerobic system fatigue
    connectiveTissue: { current: 52, _raw: 95 },   // joints, tendons
    activityFatigue: {
      lifting: { score: 0.72, lastSession: '2026-07-15' },
      running: { score: 0.68, lastSession: '2026-07-16' },
      sports: { score: 0.45, lastSession: '2026-07-13' }
    },
    recommendations: {
      canLift: true,
      canRun: true,
      canSports: false, // CNS too high
      rationale: 'CNS saturated; skip intense sports today'
    }
  }
}
```

#### Implementation Details

**Structural Fatigue (by muscle):**
- Existing logic from `functions/fatigue.js` applies to lifts (already working)
- Runs distribute fatigue to: quads, hamstrings, glutes, calves, hip flexors
  - Base: 20% of running load score
  - Heavy run (threshold/interval): +30% to quads + hamstrings
  - Long run (>90 min): +20% to glutes + calves
- Sports distribute per `musclesEngaged[]` in payload
- **Decay:** All structural fatigue decays at 15% per day (existing pattern)
- **Cap:** 100 display, store raw value with `Object.defineProperty(..., enumerable: false)`

**CNS Fatigue:**
- Lifting CNS from existing `computeStructuralFatigue()` (already capped at 100)
- Running CNS: 10% of total running load (distance × intensity factor)
  - High-intensity runs (threshold/interval): ×1.5 CNS multiplier
  - Recovery runs: ×0.5 CNS multiplier
- Sports CNS: 15% of duration in minutes × intensity factor (high=1.5, medium=1.0, low=0.5)
- **Combined CNS:** Sum of all three, apply same 100 cap + raw storage
- **Decay:** 12% per day

**Cardiovascular Fatigue (new):**
- Quantifies aerobic system stress
- Lifting: 2% of sessionStimulusScore (minimal, only if high-rep work)
- Running: 30% of total running load (duration × pace relative to threshold)
  - Hard runs (tempo/threshold/interval): +50%
  - Steady-state: +20%
  - Recovery: +5%
- Sports: 25% of duration × intensity (high=1.5, medium=1.0)
- **Combined:** Sum, cap at 100, store raw
- **Decay:** 8% per day (aerobic system recovers slower than CNS)

**Connective Tissue Fatigue (new):**
- Joint and tendon stress
- Lifting: 5% of sessionStimulusScore (especially compound lifts with heavy eccentric)
  - Deadlifts/squats: +50% bonus
  - Olympic lifts: +30% bonus
  - Isolation: −20% (less joint stress)
- Running: 15% of total running load (volume accumulates connective stress)
  - Trail running: +40% (uneven surface)
  - Road running: baseline
  - Treadmill: −20% (more forgiving)
- Sports: 20% of duration × intensity (high contact = higher)
- **Combined:** Sum, cap at 100, store raw
- **Decay:** 6% per day (connective tissue recovers slowest)

**Decay Implementation:**
```javascript
function applyMultiActivityDecay(previousState, daysSincePreviousState) {
  return {
    structural: decayPerMuscle(previousState.structural, 0.15, daysSincePreviousState),
    cns: Math.max(0, previousState.cns * Math.pow(0.88, daysSincePreviousState)),
    cardiovascular: Math.max(0, previousState.cardiovascular * Math.pow(0.92, daysSincePreviousState)),
    connectiveTissue: Math.max(0, previousState.connectiveTissue * Math.pow(0.94, daysSincePreviousState))
  }
}
```

### **2. Activity Weighting Engine** (`functions/activityWeighting.js`)

Allocates the athlete's weekly recovery budget across activities based on priority.

#### Input Structure
```javascript
const activityProfile = {
  primaryActivity: 'lifting',        // gets 60% of recovery
  secondaryActivity: 'running',      // gets 30%
  tertiaryActivity: null,             // gets 10%
  weeklyTargets: {
    lifting: { sessionsPerWeek: 4, avgSessionScore: 2000 },
    running: { sessionsPerWeek: 3, avgSessionDistance: 10 }
  }
}
```

#### Computation Function Signature
```javascript
function computeActivityWeights(activityProfile, currentFatigue) {
  // Returns recovery pool allocation
  return {
    lifting: {
      allocationPercent: 0.60,
      recoveryBudgetAvailable: 1200, // from available pool
      recommendedSessions: 3,         // reduce if fatigue high
      rationale: 'Primary activity'
    },
    running: {
      allocationPercent: 0.30,
      recoveryBudgetAvailable: 600,
      recommendedSessions: 2,
      rationale: 'Secondary activity'
    },
    sports: {
      allocationPercent: 0.10,
      recoveryBudgetAvailable: 200,
      recommendedSessions: 1,
      rationale: 'Tertiary activity'
    },
    totalRecoveryBudget: 2000
  }
}
```

#### Logic

**Primary/Secondary/Tertiary Allocation:**
- **Primary (e.g., lifting):** 60% of recovery budget
  - Target: hitting weekly session targets even if secondary suffers
  - Threshold: if primary CNS > 85, reduce to 50% and notify
- **Secondary (e.g., running):** 30% of recovery budget
  - Target: 2–3 quality sessions/week
  - Threshold: if secondary activity CNS > 75, downgrade one session to recovery pace
- **Tertiary (e.g., sports):** 10% of recovery budget
  - Threshold: if any fatigue system > 80, skip this week

**Recovery Budget Calculation:**
```javascript
// Total recovery available per week = 2000 (configurable default)
const totalBudget = 2000;

// Reduce if overall fatigue is high
const fatigueReduction = (
  (currentFatigue.cns.current / 100) * 0.3 +
  (currentFatigue.cardiovascular.current / 100) * 0.2 +
  (currentFatigue.connectiveTissue.current / 100) * 0.15
);
const adjustedBudget = totalBudget * (1 - fatigueReduction);

// Allocate by percentages
allocation.lifting.recoveryBudgetAvailable = adjustedBudget * 0.60;
allocation.running.recoveryBudgetAvailable = adjustedBudget * 0.30;
allocation.sports.recoveryBudgetAvailable = adjustedBudget * 0.10;
```

**Session Recommendations:**
- Compare remaining budget to typical session cost
  - Lifting session: ~1500–2500 stimulus score
  - Running session: ~300–600 running load points
  - Sports session: ~400–800 intensity×duration
- Return `recommendedSessions` = floor(recoveryBudgetAvailable / typicalSessionCost)
- Flag if recommendation conflicts with weekly target (e.g., target 4 lifts/week but only 2 recommended)

### **3. Session Allocation Engine** (`functions/sessionAllocationEngine.js`)

Generates a weekly schedule that respects recovery budgets across all activities.

#### Input Structure
```javascript
const allocationRequest = {
  weekStartDate: '2026-07-14',
  currentFatigue: { ... }, // from sharedFatigueEngine
  activityWeights: { ... }, // from activityWeightingEngine
  upcomingEvents: [
    { date: '2026-07-18', type: 'competition', activity: 'lifting', priority: 'high' }
  ],
  athletePreferences: {
    restDays: ['Sunday'],
    consecutiveSessionsMax: 2
  }
}
```

#### Computation Function Signature
```javascript
function generateWeeklyAllocation(allocationRequest) {
  return {
    schedule: [
      // Monday
      {
        date: '2026-07-14',
        sessions: [
          { activity: 'lifting', type: 'heavy', muscleGroup: 'lower', estimatedLoad: 2200, confidence: 0.95 },
          { activity: 'running', type: 'recovery', distance: 5, pace: 480, confidence: 0.90 }
        ],
        tradeoffs: 'Combined CNS load: 68/100. Can do both.'
      },
      // Tuesday
      {
        date: '2026-07-15',
        sessions: [
          { activity: 'running', type: 'threshold', distance: 10, pace: 360, estimatedLoad: 480, confidence: 0.85 }
        ],
        tradeoffs: 'Skip lifting — cardiovascular + CNS elevated.'
      },
      // ... through Sunday (7 entries)
    ],
    summary: {
      liftingSessions: 3,
      runningSessions: 3,
      sportsSessions: 1,
      recoveryDays: 1,
      totalWeeklyLoad: 8500,
      riskFlags: ['high CNS mid-week', 'consecutive hard days Tue-Wed']
    },
    tradeoffAnalysis: {
      'Tue/Wed': 'Both high intensity. Run at Z2 instead of Z4 on Wed to preserve CNS for Thu lift.',
      'Fri': 'Could add sports, but connective tissue fatigue trending high. Skip this week.'
    }
  }
}
```

#### Logic

**Greedy Scheduling:**
1. Iterate through 7 days
2. For each day, try to place highest-priority activity first (Primary > Secondary > Tertiary)
3. Check if current fatigue + proposed session violates any thresholds:
   - CNS > 85: no hard lifting or high-intensity running
   - Cardiovascular > 80: no back-to-back aerobic work
   - Connective tissue > 75: no high-impact sports
4. If violates, try next-priority activity or mark as recovery day
5. Spread high-intensity work to avoid consecutive hard days (max 2 consecutive)
6. Preserve user's preferred rest days

**Trade-off Detection:**
- Flag when activities conflict:
  - Heavy squat + long run on same day = high CNS + cardiovascular
  - Suggest: move run to recovery pace, or skip one
- Quantify the conflict: "Combined CNS load would be 92/100; recommend skip run"
- Offer alternatives: "Move run to tomorrow (easier day) or cut to 5k tempo"

**Integration with Track 1 Warm-Up:**
- Use existing `sessionPlanner.js` to fill in exercise details once activity + muscle group decided
- Respect `equipmentAvailable` filter (set during onboarding in Track 3)
- Apply athlete's existing `warmupScheme` for lift sessions

### **4. Frontend UI Updates**

#### **S1 (Dashboard Overview)**
Add a "Weekly Allocation" panel below current recovery forecast:
```
Weekly Allocation (next 7 days)
├─ Lifting: 3 sessions (60% budget), CNS trending ↓
├─ Running: 3 sessions (30% budget), cardiovascular ↑
├─ Sports: Deferred (limited CNS recovery)
└─ Tradeoff: Skip hard run on Wed; reserve recovery for Thu competition lift

[Expand] [Adjust allocation]
```

#### **S3 (Session Generator)**
Add "Multi-Activity Readiness" check:
```
Today's Readiness (2026-07-16)
├─ Lifting: Ready (CNS 45/100, struct 52/100)
├─ Running: Ready (cardio 58/100, struct 52/100)
├─ Sports: Limited (CNS 45, but connective tissue 72/100 — high impact risky)
└─ Recommendation: Lift heavy + run easy, skip soccer

[Generate Session] [See Allocation Plan]
```

#### **S5 (Recovery Detail)**
Expand fatigue heatmap to show all four systems:
```
Fatigue by System (today)
├─ Structural (muscle-level heatmap, existing)
├─ CNS: 65/100 ↓ (recovering well, safe for hard work)
├─ Cardiovascular: 72/100 ↑ (cumulative from runs; monitor)
└─ Connective Tissue: 48/100 ↓ (low stress)

Multi-Activity History
├─ Last 7d lift load: 12,400 stimulus
├─ Last 7d run load: 2,100 running units
├─ Last 7d sports: 5.5 hours
└─ Balance assessment: Lifting-heavy week (60/30/10 allocation); on track
```

---

## TESTING

**Test file:** `test/sharedFatigue.test.js` (new)

**Assertions (50+):**

1. **Decay rates** (8 tests)
   - CNS decays at 12% per day: `fatigue(t+1) = fatigue(t) * 0.88`
   - Cardiovascular decays at 8% per day
   - Connective tissue decays at 6% per day
   - Structural per-muscle decays at 15% per day
   - Verify compound decay over 7 days converges to ~0

2. **Fatigue computation** (12 tests)
   - Lifting alone: structural + CNS only (no cardio/connective boost)
   - Running alone: cardio + structural + mild CNS (no lifting CNS spike)
   - Sports alone: connective tissue + cardio
   - Combined: all four systems sum correctly
   - High-intensity modifiers apply (threshold run = cardio ×1.5)
   - Raw values uncapped, display values capped at 100
   - `_raw` property non-enumerable (doesn't break Object.keys iteration)

3. **Activity weighting** (10 tests)
   - Primary gets 60%, secondary 30%, tertiary 10%
   - High fatigue reduces total budget (e.g., if CNS > 80, budget = 1400 instead of 2000)
   - Session recommendations scale with budget (e.g., 600 budget ÷ 300 per run = 2 sessions)
   - Threshold check: if secondary activity fatigue > 75, recommend downgrade 1 session to recovery pace
   - Threshold check: if CNS > 85, skip primary activity recommendation
   - Tertiary activity skipped if any fatigue > 80
   - Budget allocation respects user's weekly targets (e.g., if target 4 lifts/week but budget only covers 2, flag mismatch)

4. **Session allocation** (15 tests)
   - 7 days generated for any input week
   - High-intensity sessions separated (max 2 consecutive)
   - Respects user's preferred rest days (e.g., Sunday always rest)
   - Trade-off detection: combined CNS > 85 for same-day hard sessions, suggests downgrade
   - Trade-off detection: cardiovascular > 80, prevents back-to-back running
   - Trade-off detection: connective tissue > 75, skips high-impact sports
   - Alternative suggestions provided (e.g., "move run to recovery pace")
   - Total weekly load calculated correctly (sum of all sessions)
   - Risk flags: identifies patterns (consecutive hard days, single system overload)

5. **Integration** (5 tests)
   - Multi-activity state transitions correctly day-to-day
   - Schedule respects athlete's `equipmentAvailable` (passed from Track 1 #39)
   - Allocation integrates with existing `sessionPlanner.js` (can call picAccessories w/ equipmentAvailable)
   - UI state updates reflect current fatigue + allocation (no stale display)
   - What If simulator uses raw fatigue for deltas (verify with Track 1 Fix #1)

---

## IMPLEMENTATION CHECKLIST

- [ ] `sharedFatigueEngine.js` created and exported
  - [ ] `computeSharedFatigue(multiActivityState, athleteProfile)` function
  - [ ] Structural fatigue: lifting + running + sports distribution
  - [ ] CNS fatigue: lifting + running + sports, intensity modifiers
  - [ ] Cardiovascular fatigue: running + sports, hard-session bonuses
  - [ ] Connective tissue fatigue: lifting (deadlifts +50%) + running (trail +40%) + sports
  - [ ] Decay functions for all four systems
  - [ ] Raw value storage with `Object.defineProperty`
  
- [ ] `activityWeighting.js` created and exported
  - [ ] `computeActivityWeights(activityProfile, currentFatigue)` function
  - [ ] Primary/secondary/tertiary allocation (60/30/10)
  - [ ] Budget reduction based on fatigue (CNS×0.3 + cardio×0.2 + connective×0.15)
  - [ ] Session recommendation calculation
  - [ ] Threshold checks (CNS > 85, cardio > 80, connective > 75)
  
- [ ] `sessionAllocationEngine.js` created and exported
  - [ ] `generateWeeklyAllocation(allocationRequest)` function
  - [ ] 7-day schedule generation (greedy algorithm)
  - [ ] Threshold violation prevention
  - [ ] Consecutive hard day limit enforcement
  - [ ] Rest day preference enforcement
  - [ ] Trade-off detection + alternative suggestions
  - [ ] Risk flag generation
  
- [ ] `test/sharedFatigue.test.js` created
  - [ ] All 50+ assertions implemented and passing
  
- [ ] Frontend updates
  - [ ] S1: Add "Weekly Allocation" panel
  - [ ] S3: Add "Multi-Activity Readiness" check
  - [ ] S5: Expand fatigue display to 4 systems
  - [ ] Update state to store `weeklyAllocation` from engine
  
- [ ] Integration
  - [ ] `functions/index.js`: Call engines on `/profile` and `/session` endpoints
  - [ ] Athlete profile includes `primaryActivity`, `secondaryActivity`, `weeklyTargets`
  - [ ] Multi-activity data flows from Strava + manual lift tracking
  - [ ] What If simulator uses raw fatigue (verify Track 1 Fix #1 still works)

- [ ] Build passes: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] No regressions in existing tests (Track 1 tests still green)

---

## DO NOT

- Don't touch `functions/fatigue.js` — sharedFatigueEngine extends it, doesn't replace
- Don't build tapering logic (#84), interference scheduling (#103), or simulation (#94)
- Don't ask questions about ambiguous requirements — proceed with defaults above
- Don't add UI mode selection yet (that's Track 5)
- Don't implement sport-specific detail (terrain, movement patterns) — save for later phases

---

## SHIP CRITERIA

✅ Core algorithm (`sharedFatigue`, `activityWeighting`, `sessionAllocation`) implemented  
✅ 50+ tests passing, no regressions  
✅ UI panels render without errors (S1, S3, S5 updates visible)  
✅ Multi-activity state persists to athlete profile  
✅ Build runs clean (`npm run build` succeeds)  
✅ No destructive changes to Track 1 code
