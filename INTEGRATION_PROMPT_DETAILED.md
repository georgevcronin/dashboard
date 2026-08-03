# Integration Prompt: Analytics + Hybrid Fatigue Engines

## Overview

Two new engines exist in the codebase:
- `functions/analyticsEngine.js` — timeline, briefs, forecasts, alternatives, patterns
- `functions/hybridFatigueEngine.js` — multi-activity fatigue, allocation, readiness

**Your task:** Integrate these into `functions/index.js` endpoints. Zero modifications to engine code.

---

## File Locations & Context

**Source files (already written, do NOT modify):**
- `functions/analyticsEngine.js` (291 lines)
- `functions/hybridFatigueEngine.js` (149 lines)
- `functions/userDoc.js` (now has `runs: []`, `sports: []` in DEFAULTS)

**Target file:**
- `functions/index.js` (currently ~3200 lines)

**Key locations in functions/index.js:**
- Line ~1: Imports section
- Line ~106: `loadForUser(uid)` function
- Line ~222: Auth middleware ending
- Line ~235+: `app.post("/health", ...)` first endpoint
- Line ~1125: `app.post("/profile", ...)` profile endpoint
- Line ~2200+: `app.get("/me", ...)` current endpoint (MODIFY THIS)
- Line ~2400+: Session-related endpoints

---

## Part 1: Add Imports

**Location:** Top of functions/index.js, after existing imports (around line 30)

**Add these lines:**

```javascript
const { buildUnifiedTimeline, generateWeeklyBrief, computeRecoveryForecast, generateAlternativeWorkouts, computeMovementPatternVolume } = require('./analyticsEngine');
const { computeHybridFatigue, activityWeighting, allocateWeekly, computeActivityReadiness } = require('./hybridFatigueEngine');
```

**Why:** Imports the 9 functions you'll call in endpoints below.

---

## Part 2: Extend GET /me Endpoint

**Location:** Find `app.get("/me", ...)` in functions/index.js (around line 2200–2300)

**Current code looks like:**
```javascript
app.get('/me', (req, res) => {
  res.json({
    uid: req.uid,
    profile: db.profile,
    // ... other fields
  });
});
```

**REPLACE with:**

```javascript
app.get('/me', async (req, res) => {
  try {
    // Compute new analytics synchronously
    const hybrid = computeHybridFatigue(db);
    const alternatives = generateAlternativeWorkouts(db);
    const forecast = computeRecoveryForecast(db);
    const allocation = allocateWeekly(db);
    const patternVolume = computeMovementPatternVolume(db, 7);

    // Compute brief asynchronously
    let brief = null;
    try {
      brief = await generateWeeklyBrief(db);
    } catch (err) {
      console.warn('Brief generation failed:', err);
      brief = null; // Don't fail whole request if brief fails
    }

    // Compute activity readiness for each modality
    const readiness = {
      lifting: computeActivityReadiness(db, 'lifting'),
      running: computeActivityReadiness(db, 'running'),
      sports: computeActivityReadiness(db, 'sports')
    };

    // Build response (keep all existing fields, add new ones)
    res.json({
      uid: req.uid,
      profile: db.profile,
      workouts: db.workouts || [],
      lifts: db.lifts || [],
      runs: db.runs || [],
      sports: db.sports || [],
      water: db.water || {},
      weight: db.weight || {},
      sleep: db.sleep || [],
      injuries: db.injuries || [],
      soreness: db.soreness || [],
      thoughts: db.thoughts || [],
      // NEW FIELDS:
      analytics: {
        timeline: buildUnifiedTimeline(db),
        brief,
        forecast,
        alternatives,
        patterns: patternVolume
      },
      hybrid: {
        fatigue: hybrid,
        allocation,
        readiness,
        weighting: activityWeighting(db, db.profile?.primaryActivity, db.profile?.secondaryActivity)
      }
    });
  } catch (err) {
    console.error('GET /me failed:', err);
    res.status(500).json({ error: 'Failed to build athlete state' });
  }
});
```

**Key points:**
- Make endpoint `async` (generateWeeklyBrief is async)
- Wrap brief in try/catch so it doesn't crash whole response
- Keep all existing fields (db.workouts, db.profile, etc.)
- Add `analytics` object with timeline, brief, forecast, alternatives, patterns
- Add `hybrid` object with fatigue, allocation, readiness, weighting
- Return 500 error if anything fails

---

## Part 3: Extend POST /session Endpoint

**Location:** Find `app.post("/session", ...)` in functions/index.js (around line 2393)

**Current code probably looks like:**
```javascript
app.post('/session', async (req, res) => {
  const { exercises, duration, notes } = req.body;
  // ... build session object
  // ... save to db.workouts
  res.json({ sessionId: ref.id, session });
});
```

**MODIFY as follows:**

After the session is created and saved, add these lines BEFORE the `res.json()` call:

```javascript
    // NEW: Compute and attach load metrics based on hybrid fatigue
    const sessionHybrid = computeHybridFatigue(db);
    
    // Estimate loads from the session:
    // - structuralLoad: based on volume (tonnage) and intensity
    // - cnsLoad: based on compound exercises and intensity
    // - cardioLoad: not typical for strength but could come from HIIT circuits
    // - connectiveLoad: based on isolation volume
    
    const sessionExercises = req.body.exercises || [];
    let totalTonnage = 0;
    let compoundCount = 0;
    let isolationCount = 0;
    
    sessionExercises.forEach(ex => {
      const tonnage = (ex.weight || 0) * (ex.reps || 0) * (ex.sets || 1);
      totalTonnage += tonnage;
      if (ex.type === 'compound' || /squat|deadlift|bench|row|press|pull/.test((ex.name || '').toLowerCase())) {
        compoundCount++;
      } else {
        isolationCount++;
      }
    });
    
    // Normalize to 0–1 scale (rough heuristic; adjust thresholds as needed)
    const avgSessionTonnage = 8000; // typical session is ~8000 kg total
    const structuralLoad = Math.min(1, totalTonnage / avgSessionTonnage);
    const cnsLoad = Math.min(1, (compoundCount * 0.15) + (req.body.intensity || 0.5) * 0.3);
    const connectiveLoad = Math.min(1, (isolationCount * 0.1) + (req.body.duration || 60) / 120 * 0.2);
    
    // Attach to session before saving
    session.structuralLoad = structuralLoad;
    session.cnsLoad = cnsLoad;
    session.connectiveLoad = connectiveLoad;
    session.cardioLoad = 0; // Strength sessions typically have zero cardio load
    
    // Re-save with updated loads
    await db.workouts.push(session); // or however you currently save sessions
```

**Why:**
- Computes how much structural/CNS/connective stress this session added
- Used by `computeHybridFatigue()` on next call to forecast fatigue
- Allows future sessions to be scheduled around accumulated fatigue

**Alternative (simpler):**
If the above is too complex, just add placeholder loads:
```javascript
    session.structuralLoad = 0.5; // placeholder
    session.cnsLoad = 0.4;
    session.connectiveLoad = 0.3;
    session.cardioLoad = 0;
```

---

## Part 4: Add New Endpoints for Runs & Sports (Optional)

**If time permits, add these two endpoints to functions/index.js:**

### POST /runs

```javascript
app.post('/runs', async (req, res) => {
  const { distance, duration, intensity, elevation, date, notes } = req.body;
  
  // Validation
  if (!distance || !duration || !date) {
    return res.status(400).json({ error: 'distance, duration, date required' });
  }
  
  // Compute run load (see functions/runningEngine.js for formula)
  const intensityFactor = 30 + (intensity || 0.5) * 70;
  const durationMult = Math.max(0.5, duration / 60);
  const surfaceModifier = 1.0; // default to road
  const elevationBonus = (elevation || 0) * 0.05;
  const baseLoad = distance * intensityFactor * durationMult * surfaceModifier;
  const runLoad = baseLoad + elevationBonus;
  
  // Estimate CNS/cardio from run metrics
  const cnsLoad = Math.min(1, (intensity || 0.5) * 0.3); // runs are lower CNS than lifting
  const cardioLoad = Math.min(1, (intensity || 0.5) * 0.7); // runs are high cardio
  const structuralLoad = Math.min(1, distance / 20); // distance in km
  
  const run = {
    date: date || new Date().toISOString().split('T')[0],
    distance,
    duration,
    intensity: intensity || 0.5,
    elevation: elevation || 0,
    notes: notes || '',
    load: Math.round(runLoad * 100) / 100,
    cnsLoad,
    cardioLoad,
    structuralLoad,
    connectiveLoad: Math.min(1, distance / 15 * 0.1) // minimal connective stress from running
  };
  
  db.runs.push(run);
  await save();
  
  res.json({ run });
});
```

### POST /sports

```javascript
app.post('/sports', async (req, res) => {
  const { sportName, duration, intensity, date, notes } = req.body;
  
  // Validation
  if (!sportName || !duration || !date) {
    return res.status(400).json({ error: 'sportName, duration, date required' });
  }
  
  // Estimate loads based on sport type and intensity
  const intensityFactor = intensity || 0.5;
  const durationHours = duration / 60;
  
  const sport = {
    date: date || new Date().toISOString().split('T')[0],
    sportName,
    duration,
    intensity: intensityFactor,
    notes: notes || '',
    cnsLoad: Math.min(1, intensityFactor * 0.25), // sports are moderately CNS-demanding
    cardioLoad: Math.min(1, intensityFactor * 0.8), // sports are high cardio
    structuralLoad: Math.min(1, intensityFactor * 0.4), // depends on sport (tackling, jumping, etc.)
    connectiveLoad: Math.min(1, intensityFactor * 0.5) // sports have injury risk
  };
  
  db.sports.push(sport);
  await save();
  
  res.json({ sport });
});
```

**Why:**
- Allows athletes to log runs and sports
- Populates db.runs[] and db.sports[] that `computeHybridFatigue()` uses
- Loads are auto-calculated from distance/duration/intensity/sport type

---

## Part 5: Add Tests

**File:** Create or update `test/integration.test.js`

**Add these test cases:**

```javascript
const test = require('node:test');
const assert = require('assert');

// Mock db object with sample data
const mockDb = {
  profile: { primaryActivity: 'lifting', secondaryActivity: 'running' },
  workouts: [
    { date: '2026-08-01', name: 'Upper A', exercises: [
      { name: 'Bench Press', weight: 100, reps: 5, sets: 3, type: 'compound', muscleGroup: 'chest' },
      { name: 'Barbell Row', weight: 100, reps: 5, sets: 3, type: 'compound', muscleGroup: 'back' }
    ], duration: 60, intensity: 0.8, structuralLoad: 0.6, cnsLoad: 0.5, connectiveLoad: 0.2, cardioLoad: 0 }
  ],
  lifts: [
    { date: '2026-08-01', exercise: 'Bench Press', weight: 100, reps: 5, sets: 3 }
  ],
  runs: [
    { date: '2026-08-01', distance: 10, duration: 60, intensity: 0.6, elevation: 100, load: 600, cnsLoad: 0.2, cardioLoad: 0.6, structuralLoad: 0.5, connectiveLoad: 0.05 }
  ],
  sports: [],
  sleep: [
    { date: '2026-08-01', hours: 8, quality: 4 }
  ],
  injuries: [],
  soreness: [],
  thoughts: []
};

test('analyticsEngine: buildUnifiedTimeline returns sorted entries', () => {
  const { buildUnifiedTimeline } = require('../functions/analyticsEngine');
  const timeline = buildUnifiedTimeline(mockDb);
  
  assert(Array.isArray(timeline));
  assert(timeline.length > 0);
  
  // Verify descending sort
  for (let i = 0; i < timeline.length - 1; i++) {
    assert(new Date(timeline[i].date) >= new Date(timeline[i+1].date), 'Timeline should be sorted desc by date');
  }
});

test('analyticsEngine: generateAlternativeWorkouts returns 3 options', async () => {
  const { generateAlternativeWorkouts } = require('../functions/analyticsEngine');
  const alternatives = generateAlternativeWorkouts(mockDb);
  
  assert(Array.isArray(alternatives));
  assert.strictEqual(alternatives.length, 3, 'Should return 3 alternative workouts');
  alternatives.forEach(alt => {
    assert(alt.name, 'Each alternative should have a name');
    assert(alt.exercises, 'Each alternative should have exercises');
    assert(alt.tradeOff, 'Each alternative should have a tradeOff description');
  });
});

test('hybridFatigueEngine: computeHybridFatigue returns 4 systems', () => {
  const { computeHybridFatigue } = require('../functions/hybridFatigueEngine');
  const hybrid = computeHybridFatigue(mockDb);
  
  assert(hybrid.lifting, 'Should have lifting fatigue');
  assert(hybrid.running, 'Should have running fatigue');
  assert(hybrid.sports, 'Should have sports fatigue');
  assert(hybrid.shared, 'Should have shared (cross-activity) fatigue');
  
  // Verify structure
  ['lifting', 'running', 'sports'].forEach(modality => {
    assert(typeof hybrid[modality].cns === 'number');
    assert(typeof hybrid[modality].structural === 'number');
    assert(typeof hybrid[modality].cardio === 'number');
    assert(typeof hybrid[modality].connective === 'number');
  });
  
  // Verify shared is max across modalities
  assert(hybrid.shared.cns <= 1, 'Shared CNS should be capped at 1');
  assert(hybrid.shared.cardiovascular <= 1, 'Shared cardio should be capped at 1');
});

test('hybridFatigueEngine: allocateWeekly returns 7-day plan', () => {
  const { allocateWeekly } = require('../functions/hybridFatigueEngine');
  const plan = allocateWeekly(mockDb);
  
  assert(Array.isArray(plan));
  assert.strictEqual(plan.length, 7, 'Should return 7 days');
  
  plan.forEach((day, idx) => {
    assert(day.day, `Day ${idx} should have a date`);
    assert(['rest', 'lifting', 'running', 'sports'].includes(day.activity), `Activity must be rest/lifting/running/sports`);
    assert(['none', 'easy', 'moderate', 'hard'].includes(day.intensity), 'Intensity must be one of the valid levels');
    assert(day.reason, 'Each day should have a reason string');
  });
});

test('analyticsEngine: computeRecoveryForecast predicts completion dates', () => {
  const { computeRecoveryForecast } = require('../functions/analyticsEngine');
  const forecast = computeRecoveryForecast(mockDb);
  
  assert(forecast.muscle, 'Should have muscle forecast');
  assert(forecast.cns, 'Should have CNS forecast');
  
  assert(forecast.cns.completionDate, 'CNS should have completionDate');
  assert(typeof forecast.cns.days === 'number', 'CNS should have days estimate');
  assert(forecast.cns.days >= 0, 'Days should be non-negative');
});
```

---

## Part 6: Integration Checklist

**Before submitting:**

- [ ] Imports added at top of functions/index.js
- [ ] GET /me endpoint modified (async, calls all 5 sync functions + brief)
- [ ] GET /me returns `analytics` object with timeline, brief, forecast, alternatives, patterns
- [ ] GET /me returns `hybrid` object with fatigue, allocation, readiness, weighting
- [ ] Brief generation wrapped in try/catch so it doesn't fail whole request
- [ ] POST /session endpoint modified to compute structuralLoad, cnsLoad, connectiveLoad, cardioLoad
- [ ] (Optional) POST /runs endpoint added
- [ ] (Optional) POST /sports endpoint added
- [ ] Tests added to test/integration.test.js
- [ ] `npm test` passes all tests
- [ ] `npm run build` succeeds with no errors
- [ ] No modifications to functions/analyticsEngine.js or functions/hybridFatigueEngine.js

---

## Data Structures Reference

### analytics object (from GET /me)
```javascript
{
  timeline: [ { date, type, data }, ... ], // merged activity feed
  brief: "string or null", // 2–3 sentence AI summary
  forecast: { muscle: { name: { completionDate: "2026-08-09", days: 7 } }, cns: { completionDate, days } },
  alternatives: [ { name, exercises, tradeOff }, ... ], // 3 workout variants
  patterns: { squat: { tonnage: 5000, muscles: { quads: 2500, glutes: 1500, ... } }, ... }
}
```

### hybrid object (from GET /me)
```javascript
{
  fatigue: { lifting: { cns, structural, cardio, connective }, running: {...}, sports: {...}, shared: { cns, cardiovascular, connective } },
  allocation: [ { day: "2026-08-03", activity, intensity, reason }, ... ], // 7-day plan
  readiness: { lifting: { readiness: 0.65, explanation, limits }, running: {...}, sports: {...} },
  weighting: { lifting: { budget: 0.6, sessions: 4 }, running: { budget: 0.3, sessions: 2 }, sports: { budget: 0.1, sessions: 1 } }
}
```

---

## Common Pitfalls

1. **Forgetting `async` keyword on GET /me** — makes `await generateWeeklyBrief()` fail
2. **Not wrapping brief in try/catch** — Gemini failures crash whole response
3. **Not updating load fields on session** — `computeHybridFatigue()` won't see the new session's stress
4. **Using wrong decay rates** — lifting 15%, running 12%, sports 8%, connective 6% per day
5. **Not calling `save()` after db modifications** — changes won't persist to Firestore
6. **Forgetting to handle undefined arrays** — `db.runs || []` prevents crashes if arrays don't exist

---

## Questions to Answer Before Coding

1. Are runs/sports truly separate from workouts, or are they entries in workouts[]?
   **Answer:** They're separate (db.runs[], db.sports[], db.workouts[])

2. Should POST /runs and POST /sports create new endpoints or use existing /workout endpoint?
   **Answer:** Create new endpoints (/runs and /sports) so hybrid engine can distinguish modalities

3. What if generateWeeklyBrief() fails (Gemini down, quota exceeded)?
   **Answer:** Return null for brief field, don't fail the whole /me endpoint

4. Should session loads be recomputed each time /session is called, or stored once?
   **Answer:** Computed at creation time and stored in db.workouts[].structuralLoad etc., so they don't change retroactively
