# TRACK 4B: Running Foundation — Load, VO₂, Efficiency, Readiness, Periodization
## Multi-Factor Running Analytics

**Duration:** 4–5 days  
**Status:** Ready to start immediately. Independent of other tracks.  
**Ship Criteria:** Running load calculates, VO₂ estimates display, efficiency trends, run categories classify correctly, 50+ tests passing.

---

## OVERVIEW

Build running-specific metrics on top of existing Strava integration. Athletes get:
1. **Running Load:** Unified stress metric (distance × intensity) comparable to lifting's stimulusScore
2. **VO₂ Max Estimation:** From pace/HR data, with trend + confidence interval
3. **Aerobic Efficiency:** Pace-to-HR ratio, detect improving economy
4. **Running Readiness:** Separate from lifting, considers leg fatigue + aerobic state
5. **Run Categories:** Classify activities as recovery/base/long/threshold/interval
6. **Race Periodization:** Scaffolding for 16-week macrocycles (build, peak, taper)

---

## ARCHITECTURE

### **1. Running Load Engine** (`functions/runningLoad.js`)

Unified metric for run stress, analogous to `sessionStimulusScore` for lifting.

#### **Input**
```javascript
const stravRun = {
  id: '12345',
  name: 'Morning run',
  date: '2026-07-16',
  startTime: '2026-07-16T06:00:00Z',
  
  distance: 10,          // km
  duration: 3600,        // seconds
  pace: 360,             // seconds/km
  avgHR: 165,            // bpm
  maxHR: 178,
  
  elevation: 200,        // meters climbed
  elevationLoss: 185,
  
  surface: 'road',       // 'road', 'trail', 'track', 'treadmill'
  temperature: 22,       // Celsius (if available)
  
  // If available from other sources
  avgCadence: 180,       // steps/min
  avgStrideLength: 0.93, // meters
}
```

#### **Running Load Calculation**

```javascript
function computeRunningLoad(run, athleteProfile) {
  // 1. Base load = distance (km) × pace intensity factor
  const paceIntensity = getPaceIntensity(run.pace, athleteProfile.runThresholdPace)
  // paceIntensity: 0.3–1.5 (recovery to interval)
  
  const baseLoad = run.distance * (30 + paceIntensity * 70)
  // 30 = recovery baseline, +70 = intensity scaling
  // Example: 10km easy (pace 5:30/km, intensity 0.3) = 10 × (30 + 0.3×70) = 10 × 51 = 510
  // Example: 10km threshold (pace 4:00/km, intensity 1.0) = 10 × (30 + 1.0×70) = 10 × 100 = 1000
  
  // 2. HR intensity multiplier (if HR data available)
  const hrIntensity = getHRIntensity(run.avgHR, athleteProfile.maxHR)
  // hrIntensity: 0.5–1.3 (recovery to max effort)
  
  const hrAdjusted = baseLoad * (0.7 + 0.3 * hrIntensity)
  // Moderates pace estimate; if pace says easy but HR says hard, increase load
  
  // 3. Duration multiplier (longer = more fatigue)
  const durationMinutes = run.duration / 60
  const durationMultiplier = Math.min(1.3, 1 + (durationMinutes - 30) / 100)
  // 30 min = 1.0x, 60 min = 1.3x, 90+ min = caps at 1.3x
  
  // 4. Elevation penalty (climbing burns extra energy)
  const elevationPenalty = run.elevation * 0.1
  // Every 100m climbed = +10 load units
  
  // 5. Surface modifier
  const surfaceModifier = {
    'road': 1.0,
    'trail': 1.15,    // Harder on joints, requires more stabilization
    'track': 0.9,     // Smooth surface, less joint stress
    'treadmill': 0.85 // Impact absorption, easier
  }[run.surface] || 1.0
  
  // Final calculation
  const runningLoad = (hrAdjusted * durationMultiplier + elevationPenalty) * surfaceModifier
  
  // Round to nearest 5
  return Math.round(runningLoad / 5) * 5
}

// Helper: pace intensity 0–1.5
function getPaceIntensity(paceSecsPerKm, thresholdPaceSecsPerKm) {
  if (paceSecsPerKm > thresholdPaceSecsPerKm * 1.3) return 0.2  // Recovery
  if (paceSecsPerKm > thresholdPaceSecsPerKm * 1.1) return 0.4  // Easy
  if (paceSecsPerKm > thresholdPaceSecsPerKm * 0.95) return 0.7 // Steady
  if (paceSecsPerKm > thresholdPaceSecsPerKm * 0.8) return 1.0  // Threshold
  return 1.3  // Interval/fast
}

// Helper: HR intensity 0.5–1.3
function getHRIntensity(avgHR, maxHR) {
  const hrPercentage = avgHR / maxHR
  if (hrPercentage < 0.60) return 0.2  // Recovery
  if (hrPercentage < 0.70) return 0.4  // Easy
  if (hrPercentage < 0.85) return 0.7  // Steady
  if (hrPercentage < 0.92) return 1.0  // Threshold
  return 1.3  // Max effort
}
```

#### **Aggregation**
```javascript
function getWeeklyRunningLoad(athleteId, weekStartDate) {
  const runs = getRuns(athleteId, weekStartDate, 7)
  const loads = runs.map(r => computeRunningLoad(r, getAthleteProfile(athleteId)))
  return {
    totalLoad: loads.reduce((a, b) => a + b, 0),
    runs: runs.length,
    averageLoadPerRun: Math.round(loads.reduce((a, b) => a + b, 0) / runs.length),
    byIntensity: {
      recovery: loads.filter(l => l < 300).length,
      easy: loads.filter(l => l >= 300 && l < 500).length,
      steady: loads.filter(l => l >= 500 && l < 700).length,
      threshold: loads.filter(l => l >= 700 && l < 1000).length,
      interval: loads.filter(l => l >= 1000).length
    }
  }
}
```

---

### **2. VO₂ Max Estimator** (`functions/vo2MaxEstimator.js`)

Estimate from pace/HR data using multiple methods, track trend, show confidence.

#### **Estimation Methods**

**Method 1: Karvonen (HR-based)**
```javascript
function vo2MaxFromHR(avgHR, maxHR, run) {
  // VO₂max = ((avgHR - restHR) / (maxHR - restHR)) × VO₂max_ceiling
  const restHR = 60; // athlete-specific, default 60
  const vo2Ceiling = 70; // VO₂max ceiling (mL/min/kg) based on sport
  
  const vo2 = ((avgHR - restHR) / (maxHR - restHR)) * vo2Ceiling
  return Math.round(vo2 * 10) / 10
}
```

**Method 2: Pace-based (VDOT)**
```javascript
function vo2MaxFromPace(pace, duration) {
  // Based on Jack Daniels' VDOT formula
  // Faster pace + longer duration = higher VO₂ capacity
  
  const paceMinPerKm = pace / 60
  const distanceKm = duration * (60 / pace)
  
  // Approximation: faster 10k pace ≈ higher VO₂
  if (distanceKm >= 10) {
    // Use as VO₂ proxy
    const vo2 = 60 - (paceMinPerKm * 2.5) // Inverted: faster pace = higher VO₂
    return Math.max(30, Math.min(80, vo2)) // Clamp 30–80
  }
  
  return null // Not reliable for short runs
}
```

**Method 3: Hybrid (pace + HR)**
```javascript
function vo2MaxHybrid(avgHR, maxHR, pace, distance, duration) {
  // Weight HR method 60%, pace method 40%
  
  const hrEstimate = vo2MaxFromHR(avgHR, maxHR)
  const paceEstimate = vo2MaxFromPace(pace, distance, duration)
  
  if (paceEstimate) {
    return Math.round((hrEstimate * 0.6 + paceEstimate * 0.4) * 10) / 10
  }
  
  return hrEstimate
}
```

#### **VO₂ Max Trend & Confidence**
```javascript
function estimateVO2Max(athleteId, lookbackDays = 90) {
  const runs = getRuns(athleteId, lookbackDays)
  
  const estimates = runs
    .filter(r => r.avgHR && r.pace)
    .map(r => ({
      date: r.date,
      vo2: vo2MaxHybrid(r.avgHR, getAthlete(athleteId).maxHR, r.pace, r.distance, r.duration),
      confidence: getEstimateConfidence(r) // 0–1
    }))
  
  if (estimates.length < 3) {
    return {
      vo2Max: null,
      trend: null,
      confidence: 0,
      note: 'Need 3+ recent runs with HR data'
    }
  }
  
  // Latest estimate
  const latest = estimates[estimates.length - 1].vo2
  
  // Trend: compare last 2 weeks to previous 2 weeks
  const lastTwoWeeks = estimates.filter(e => e.date > now() - 14*86400).map(e => e.vo2)
  const previousTwoWeeks = estimates.filter(e => e.date < now() - 14*86400 && e.date > now() - 28*86400).map(e => e.vo2)
  
  const trendUp = lastTwoWeeks.length && previousTwoWeeks.length
    ? (avg(lastTwoWeeks) - avg(previousTwoWeeks)) / avg(previousTwoWeeks) > 0.02
    : null
  
  // Confidence: average confidence score of recent estimates
  const avgConfidence = avg(estimates.slice(-5).map(e => e.confidence))
  
  return {
    vo2Max: latest,
    trend: trendUp ? 'up' : trendUp === false ? 'down' : 'stable',
    confidencePercent: Math.round(avgConfidence * 100),
    estimates, // full history
    raceTimeEstimates: {
      '5k': predictRaceTime(latest, '5k'),
      '10k': predictRaceTime(latest, '10k'),
      'half': predictRaceTime(latest, 'half'),
      'marathon': predictRaceTime(latest, 'marathon')
    }
  }
}

function getEstimateConfidence(run) {
  // Higher confidence if: long run, clear HR data, normal pace variation
  let confidence = 0.5
  if (run.duration > 1800) confidence += 0.2  // Long run
  if (run.avgHR > 0) confidence += 0.15       // HR data available
  if (run.distance > 5) confidence += 0.15    // Sufficient distance
  return Math.min(1, confidence)
}

function predictRaceTime(vo2Max, distance) {
  // Jack Daniels formula: race time inversely correlates with VO₂
  // Simplified approximation
  const timeCoefficients = {
    '5k': { a: 0.5, b: 12 },
    '10k': { a: 0.55, b: 25 },
    'half': { a: 0.6, b: 110 },
    'marathon': { a: 0.65, b: 240 }
  }
  
  const { a, b } = timeCoefficients[distance]
  const predictedMinutes = b / (vo2Max * a)
  
  return {
    minutes: Math.round(predictedMinutes),
    pace: formatPace(predictedMinutes * 60 / distanceKm[distance])
  }
}
```

---

### **3. Aerobic Efficiency Tracker** (`functions/aerobicEfficiency.js`)

Track pace-to-HR ratio over time; improving ratio = improving economy.

```javascript
function computeAerobicEfficiency(run, athleteProfile) {
  // Efficiency = speed / HR
  // Higher = better (same pace, lower HR = more efficient)
  
  const speedKmPerHour = 3.6 / (run.pace / 1000)
  const efficiency = speedKmPerHour / run.avgHR
  
  return {
    efficiency,
    pace: run.pace,
    avgHR: run.avgHR,
    percentOfMax: (run.avgHR / athleteProfile.maxHR * 100).toFixed(1)
  }
}

function getEfficiencyTrend(athleteId, lookbackDays = 60) {
  const runs = getRuns(athleteId, lookbackDays)
    .filter(r => r.avgHR && r.pace)
    .map(r => computeAerobicEfficiency(r, getAthleteProfile(athleteId)))
  
  if (runs.length < 5) return null
  
  // Fit linear trend
  const trend = linearRegression(runs)
  
  return {
    currentEfficiency: runs[runs.length - 1].efficiency,
    trend: trend.slope > 0.0001 ? 'improving' : 'stable',
    improvementPercent: Math.round((trend.slope / runs[0].efficiency) * 100),
    data: runs
  }
}
```

---

### **4. Running Readiness** (`functions/runReadiness.js`)

Separate readiness for running vs lifting (same fatigue, different system priorities).

```javascript
function computeRunReadiness(athleteId, today = new Date()) {
  const athlete = getAthlete(athleteId)
  const fatigue = getCurrentFatigue(athleteId)
  
  // Readiness factors (0–1 scale, 1 = fully ready)
  
  // 1. CNS fatigue (shared with lifting, but less critical for running)
  const cnsReadiness = 1 - (fatigue.cns / 100) * 0.4
  // Running is less CNS-intensive than lifting; 40% weight
  
  // 2. Local leg fatigue (structural)
  const legFatigue = (
    (fatigue.structural.quads || 50) +
    (fatigue.structural.hamstrings || 50) +
    (fatigue.structural.glutes || 50)
  ) / 3
  const legReadiness = 1 - (legFatigue / 100) * 0.8
  // Local leg fatigue is very important; 80% weight
  
  // 3. Cardiovascular fatigue
  const cardioReadiness = 1 - (fatigue.cardiovascular / 100) * 0.6
  // Aerobic system is moderate constraint; 60% weight
  
  // 4. Sleep quality (recovery factor)
  const recentSleep = getRecentSleep(athleteId, 1)
  const sleepReadiness = recentSleep?.quality || 0.7
  // If sleep data available, use quality. Default 0.7 (neutral)
  
  // 5. Run frequency (too many consecutive days = fatigue)
  const recentRunCount = getRuns(athleteId, 1).length
  const frequencyReadiness = recentRunCount > 2 ? 0.7 : 1.0
  
  // Weighted average
  const readiness = (
    cnsReadiness * 0.2 +
    legReadiness * 0.35 +
    cardioReadiness * 0.25 +
    sleepReadiness * 0.15 +
    frequencyReadiness * 0.05
  )
  
  return {
    readiness: Math.max(0, Math.min(1, readiness)),
    components: {
      cns: cnsReadiness,
      legs: legReadiness,
      cardio: cardioReadiness,
      sleep: sleepReadiness,
      frequency: frequencyReadiness
    },
    recommendation: getRunReadinessRecommendation(readiness, fatigue),
    runLimitations: {
      intensity: readiness > 0.7 ? 'full' : readiness > 0.5 ? 'moderate' : 'easy_only',
      distance: readiness > 0.8 ? 'unlimited' : readiness > 0.5 ? '12km_max' : '8km_max'
    }
  }
}

function getRunReadinessRecommendation(readiness, fatigue) {
  if (readiness > 0.8) return 'Ready for hard effort (tempo, threshold, intervals)'
  if (readiness > 0.65) return 'Ready for easy-moderate run (Z2–Z3)'
  if (readiness > 0.5) return 'Recovery run recommended (Z1–Z2)'
  return 'Skip running today; focus on recovery'
}
```

---

### **5. Run Category Classification** (`functions/runCategories.js`)

Auto-categorize runs based on pace, HR, duration.

```javascript
function classifyRun(run, athleteProfile) {
  const paceIntensity = getPaceIntensity(run.pace, athleteProfile.runThresholdPace)
  const hrIntensity = getHRIntensity(run.avgHR, athleteProfile.maxHR)
  const duration = run.duration / 3600  // hours
  
  // Classify based on intensity + duration
  if (hrIntensity < 0.65 && paceIntensity < 0.4) {
    return 'recovery'  // Easy pace, low HR, any duration
  }
  
  if (paceIntensity >= 1.2 && duration < 1) {
    return 'interval'  // Fast pace, <1 hour
  }
  
  if (paceIntensity >= 0.95 && paceIntensity < 1.2 && duration < 1.5) {
    return 'threshold'  // Threshold pace, <90 min
  }
  
  if (paceIntensity >= 0.7 && paceIntensity < 0.95) {
    return duration > 1.5 ? 'long' : 'base'  // Steady pace; long run if >90min
  }
  
  // Default
  return duration > 1.5 ? 'long' : 'base'
}

// More precise classifications (optional)
const runTypes = {
  'recovery': { hrZone: 'Z1–Z2', pace: 'easy', purpose: 'rebuild aerobic base' },
  'easy': { hrZone: 'Z2', pace: 'conversational', purpose: 'build aerobic base' },
  'base': { hrZone: 'Z2–Z3', pace: 'steady', purpose: 'aerobic work' },
  'long': { hrZone: 'Z2–Z3', pace: 'steady', duration: '>90 min', purpose: 'endurance' },
  'threshold': { hrZone: 'Z4', pace: 'comfortably hard', duration: '20–40 min', purpose: 'FTHR work' },
  'interval': { hrZone: 'Z5', pace: 'fast', duration: '4–12 min reps', purpose: 'VO₂ max' }
}
```

---

### **6. Race Periodization Scaffolding** (`functions/racePeriodization.js`)

Outline structure for macrocycles (not full automation yet).

```javascript
function buildRaceMacrocycle(raceDate, raceDistance, currentDate = new Date()) {
  // Simple 16-week structure (can be customized)
  const weeksToRace = Math.round((raceDate - currentDate) / (7 * 86400))
  
  if (weeksToRace < 8) {
    return { error: 'Minimum 8 weeks to race' }
  }
  
  const phases = {
    'build': {
      duration: weeksToRace - 6,
      focus: 'Increase volume, introduce pace work',
      sessionsPerWeek: {
        'long': 1,
        'threshold': 1,
        'interval': 0,
        'easy': 2
      }
    },
    'peak': {
      duration: 3,
      focus: 'VO₂ max + race-pace work',
      sessionsPerWeek: {
        'long': 1,
        'threshold': 1,
        'interval': 1,
        'easy': 1
      }
    },
    'taper': {
      duration: 2,
      focus: 'Reduce volume, maintain intensity',
      sessionsPerWeek: {
        'long': 0,
        'threshold': 0,
        'interval': 1,
        'easy': 2
      }
    },
    'race': {
      duration: 1,
      focus: 'Rest + race',
      sessionsPerWeek: {
        'race': 1
      }
    }
  }
  
  return {
    raceDate,
    raceDistance,
    totalWeeks: weeksToRace,
    phases,
    raceTimeEstimate: predictRaceTime(athlete.vo2Max, raceDistance)
  }
}
```

---

## FRONTEND IMPLEMENTATION

### **S3: Running Dashboard** (new section or expand S5)

```
S3 > Running (new tab)
═══════════════════════════════════════════════════

Weekly Running Load
├─ Total: 2,840 load (3 runs)
├─ Avg/run: 947 load
└─ Breakdown: 1 recovery (420), 1 easy (680), 1 threshold (1,740)

VO₂ Max Estimate
├─ Current: 52.3 mL/min/kg
├─ Trend: ↑ +2% last 2 weeks (improving)
├─ Confidence: 82%
└─ Predictions:
    • 5k: 17:25 (pace 3:29/km)
    • 10k: 36:42 (pace 3:40/km)
    • Half-Marathon: 1:20:15
    • Marathon: 2:52:40

Aerobic Efficiency
├─ Current: 0.061 km/h/bpm (pace 4:15/km @ 165 bpm)
├─ Trend: ↑ Improving (pace down 5 sec/km at same HR over 8 weeks)
└─ Chart: [Efficiency trend line, 60 days]

Running Readiness (Today)
├─ Overall: 74% ready
├─ Leg fatigue: 68% (quad-heavy week)
├─ Cardio: 82% (fresh)
├─ Recommendation: Ready for moderate intensity (Z3 pace)
├─ Limits: <12km for hard efforts, unlimited for easy

[Load Chart 30d] [VO₂ Detail] [Pace/HR Plot]
```

---

### **S5: Run Metrics Overlay**

Add running section alongside lifting metrics:
```
Fatigue (Lifting focused today; Running metrics below)

Running-Specific Metrics
├─ Weekly Running Load: 2,840 (3 runs)
├─ Average VO₂ Max: 52.3 mL/min/kg (stable)
├─ Aerobic Efficiency: 0.061 (↑ improving)
└─ Running Readiness: 74%
```

---

### **S1: Weekly Brief Integration** (from Track 4A)

Include running volume in brief:
```
Weekly Physiological Brief

"Balanced training week: 4 lifts (15.6k stimulus) + 3 runs (2.8k load) with 
8.1h sleep/night at 84% quality. VO₂ max trending up (+2%); aerobic efficiency 
improving steadily. Leg fatigue elevated from quad-heavy week, but CNS stable 
and ready for intensity. Next week: maintain volume, consider deload on run 
side if leg soreness persists."
```

---

## BACKEND IMPLEMENTATION

### **API Endpoints (functions/index.js)**

```javascript
// GET /running-load?week=YYYY-W##
app.get('/running-load', async (req, res) => {
  const weekStartDate = parseWeekString(req.query.week)
  const load = getWeeklyRunningLoad(req.user.uid, weekStartDate)
  res.json(load)
})

// GET /vo2-max
app.get('/vo2-max', async (req, res) => {
  const vo2 = estimateVO2Max(req.user.uid, 90)
  res.json(vo2)
})

// GET /aerobic-efficiency?days=60
app.get('/aerobic-efficiency', async (req, res) => {
  const trend = getEfficiencyTrend(req.user.uid, req.query.days || 60)
  res.json(trend)
})

// GET /running-readiness
app.get('/running-readiness', async (req, res) => {
  const readiness = computeRunReadiness(req.user.uid)
  res.json(readiness)
})

// GET /run-categories?days=30
app.get('/run-categories', async (req, res) => {
  const runs = getRuns(req.user.uid, req.query.days || 30)
  const classified = runs.map(r => ({
    ...r,
    category: classifyRun(r, getAthleteProfile(req.user.uid))
  }))
  res.json(classified)
})

// GET /race-periodization?raceDate=YYYY-MM-DD&distance=5k|10k|half|marathon
app.get('/race-periodization', async (req, res) => {
  const macro = buildRaceMacrocycle(
    new Date(req.query.raceDate),
    req.query.distance
  )
  res.json(macro)
})
```

---

## TESTING

**Test file:** `test/running.test.js` (new)

**Assertions (50+):**

1. **Running Load** (10 tests)
   - Easy 10km run (pace 5:30/km, HR 60% max): load ~510
   - Threshold 10km (pace 4:00/km, HR 85% max): load ~1000
   - Long run 15km (pace 5:00/km, HR 65% max): load ~900
   - Elevation bonus: +10 load per 100m climbed
   - Surface modifier: trail +15%, treadmill −15%
   - Duration multiplier: 30min = 1.0x, 90min = 1.3x
   - Weekly aggregation: sums correctly, counts by intensity
   - Different athletes: same run = different loads (by threshold pace)

2. **VO₂ Max Estimation** (12 tests)
   - HR method: 50% HR reserve = ~50% VO₂
   - Pace method: returns null for runs <5km
   - Hybrid: weights HR 60%, pace 40%
   - Trend detection: last 2w vs previous 2w, >2% = "up"
   - Confidence: 0.5–1.0 based on run duration + HR data + distance
   - Race time prediction: 5k/10k/half/marathon plausible times
   - Requires 3+ runs with HR data (rejects if fewer)
   - Estimates clamp 30–80 mL/min/kg (realistic range)

3. **Aerobic Efficiency** (8 tests)
   - Efficiency = speed / HR (higher = better)
   - Trend fit: linear regression on 5+ runs
   - Improvement detection: slope > 0.0001 = "improving"
   - Same pace at lower HR = efficiency up
   - New athlete: 5 runs required before trend available

4. **Running Readiness** (8 tests)
   - High fatigue (CNS > 75, legs > 70) = readiness 0.3–0.5
   - Fresh (all systems <50) = readiness 0.9+
   - CNS weight 20%, leg fatigue 35%, cardio 25%, sleep 15%, frequency 5%
   - Sleep quality (0–1) directly applied to readiness
   - 3+ runs in 1 day drops readiness to 0.7
   - Recommendation text changes by readiness (hard/moderate/easy/skip)
   - Run limitations (intensity, distance) scaled by readiness

5. **Run Classification** (8 tests)
   - Recovery: HR < 65% max, pace easy
   - Easy: HR 65–75% max, pace easy
   - Base: HR 75–85% max, pace steady, duration <90 min
   - Long: any intensity, duration >90 min
   - Threshold: HR 85–92% max, pace 90–120% threshold, <90 min
   - Interval: HR > 92% max, pace >120% threshold, <60 min
   - Classification matches run data consistently
   - Edge cases: unclear runs default to "base" or "long"

6. **Race Periodization** (4 tests)
   - 16-week structure for 10km race
   - Build → Peak → Taper → Race phases
   - Minimum 8 weeks required (error if <8)
   - Session distribution (long/threshold/interval/easy) correct per phase
   - Race time estimate plausible
   - Phases sum to total weeks to race

---

## IMPLEMENTATION CHECKLIST

### **Backend**
- [ ] `functions/runningLoad.js` created
  - [ ] `computeRunningLoad(run, athleteProfile)` with all 5 factors
  - [ ] `getPaceIntensity()` helper
  - [ ] `getHRIntensity()` helper
  - [ ] `getWeeklyRunningLoad(athleteId, weekStart)`
  - [ ] Aggregation by intensity

- [ ] `functions/vo2MaxEstimator.js` created
  - [ ] `vo2MaxFromHR()` method
  - [ ] `vo2MaxFromPace()` method
  - [ ] `vo2MaxHybrid()` method
  - [ ] `estimateVO2Max(athleteId, lookbackDays)`
  - [ ] Trend detection logic
  - [ ] Confidence scoring
  - [ ] `predictRaceTime()` for 5k/10k/half/marathon

- [ ] `functions/aerobicEfficiency.js` created
  - [ ] `computeAerobicEfficiency(run, athleteProfile)`
  - [ ] `getEfficiencyTrend(athleteId, lookbackDays)`
  - [ ] Linear regression fit

- [ ] `functions/runReadiness.js` created
  - [ ] `computeRunReadiness(athleteId)`
  - [ ] 5-factor weighting (CNS, legs, cardio, sleep, frequency)
  - [ ] `getRunReadinessRecommendation()` text
  - [ ] Run limitations by readiness

- [ ] `functions/runCategories.js` created
  - [ ] `classifyRun(run, athleteProfile)`
  - [ ] 6 categories (recovery, easy, base, long, threshold, interval)
  - [ ] Fallback logic for edge cases

- [ ] `functions/racePeriodization.js` created
  - [ ] `buildRaceMacrocycle(raceDate, distance)`
  - [ ] 4-phase structure (build, peak, taper, race)
  - [ ] Session distribution per phase

- [ ] `functions/index.js` extended
  - [ ] GET `/running-load` endpoint
  - [ ] GET `/vo2-max` endpoint
  - [ ] GET `/aerobic-efficiency` endpoint
  - [ ] GET `/running-readiness` endpoint
  - [ ] GET `/run-categories` endpoint
  - [ ] GET `/race-periodization` endpoint

### **Frontend**
- [ ] S3 Running tab
  - [ ] Fetch `/running-load` weekly
  - [ ] Fetch `/vo2-max` on mount
  - [ ] Display VO₂ estimate + trend + confidence + race predictions
  - [ ] Fetch `/aerobic-efficiency`, display chart
  - [ ] Fetch `/running-readiness`, show recommendation
  - [ ] Display run type breakdown (recovery/easy/base/long/threshold/interval)

- [ ] S5 running metrics overlay
  - [ ] Add running load + VO₂ + efficiency + readiness below lifting metrics

- [ ] S1 brief integration (from Track 4A)
  - [ ] Include running volume in weekly brief text

### **Testing**
- [ ] `test/running.test.js` created with 50+ assertions
- [ ] All 50+ tests passing
- [ ] No regressions in Track 1 tests

### **Build**
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (node --test + jest)

---

## DO NOT

- Don't build terrain adjustment (#110), form metrics (#111), or race tapering automation (#84) yet
- Don't implement cross-sport interference scheduling (#103)
- Don't ask questions about data sources — use Strava runs already syncing
- Don't change Track 1 code
- Don't build complete race planning UI (macrocycle is scaffolding only)

---

## SHIP CRITERIA

✅ Running load calculates correctly for diverse run types  
✅ VO₂ max estimates display with confidence + trend  
✅ Race time predictions plausible (5k, 10k, half, marathon)  
✅ Aerobic efficiency tracks and trends over 60 days  
✅ Running readiness scores 0–1, recommendations sensible  
✅ Run classification assigns correct category 95%+ of time  
✅ Race periodization scaffolding generates 4-phase macrocycle  
✅ 50+ tests passing, no regressions  
✅ Frontend displays all metrics without console errors  
✅ Build succeeds
