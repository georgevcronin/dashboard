# Press Dashboard: Variables & Call Sites Reference

This document maps all key variables, data structures, and function calls across the codebase. Use this when generating code to know where to find/use existing variables.

---

## Firestore Data Structures

### User Document (`users/{uid}`)
Located: `functions/userDoc.js` (DEFAULTS)

```javascript
{
  profile: {
    name: string,
    heightCm: number,
    sex: string,
    waterTarget: number (default: 7),
    macroTargets: { calories, protein, carbs, fat },
    macroMode: "manual" | "auto",
    primaryActivity: "strength" | "running" | "hybrid" | "sports" | "crossfit",
    secondaryActivity: "strength" | "running" | "hybrid" | "sports" | "crossfit",
    equipmentAvailable: ["barbell" | "dumbbell" | "cable" | "machine" | "smith" | "bodyweight"],
    musclePriorities: { [muscle]: "focus" | "baseline" | "avoid" },
    weeklyTargets: { lifting: {}, running: {}, sports: {} },
    activityPreferences: { lifting: {}, running: {} },
    visibility: { workoutSessions: boolean, comparison: boolean }
  },
  metrics: {},
  workouts: [],
  lifts: [], // Stored in subcollection (liftChunks), not here
  water: {},
  weight: {},
  thoughts: [],
  nutrition: {},
  nutritionLog: [],
  waterEvents: [],
  strava: null,
  weeklyPlan: null,
  soreness: [],
  muscleSensitivity: {},
  cnsSensitivity: 1.0,
  injuries: [],
  measurements: [],
  supplements: [],
  supplementLog: [],
  alcoholLog: [],
  photos: [],
  experiments: [],
  customExercises: []
}
```

---

## Backend Module Exports & Key Variables

### `functions/sessionPlanner.js`
**Exports:**
- `generateSessionExercises(context)` – Main session generation
- `progressionFor(entry, context)` – Computes set/rep scheme
- `isLowRepPattern(pattern)` – Boolean check
- `LOW_REP_THRESHOLD` – Constant (number)
- `estimateSessionDurationMin(exercises)` – Duration calc
- `capSessionDuration(exercises, sessionDuration)` – Trim to fit
- `fillSessionToDuration(exercises, target, context)` – Add exercises
- `fatigueCeilingFor(sessionScore, context)` – Fatigue limit

**Key Constants:**
```javascript
LOGGED_EXERCISE_BONUS = 40           // Preference for logged exercises
FAVORITE_EXERCISE_BONUS = 15         // Preference for favorited exercises
OBSCURE_PENALTY = 8                  // Novel exercise disincentive
ISOMETRIC_PENALTY = 15               // Static hold disincentive
FOCUS_PENALTY = 6                    // Extra primary muscle disincentive
HIGH_CNS_EQUIPMENT = ['barbell', 'smith', 'dumbbell']
LOW_CNS_EQUIPMENT = ['machine', 'cable', 'smith']
STABLE_EQUIPMENT = ['machine', 'cable', 'smith']
UNSTABLE_EQUIPMENT = ['barbell', 'dumbbell']
STABILITY_BONUS = 10
STAPLE_SESSION_THRESHOLD = 10        // Sessions to become "staple"
```

**Key Functions:**
```javascript
// Swap high-CNS exercise for lower-CNS alternative
substituteForCNS(entry, avoidMuscles, avoidMusclesSecondary = [])
  -> entry (substituted or original)

// Exercise scoring & rotation
lastAccessoryPick(lifts, targetMuscles, excludeNames)
  -> exerciseName (string)

isStapleExercise(lifts, name)
  -> boolean

exerciseSessionCount(lifts, name)
  -> number

// Accessory selection (main scoring function)
pickAccessories(
  targetMuscles,
  alreadySelected,
  excludeNames,
  avoidMuscles,
  {
    travelMode,
    avoidEquipment = [],
    avoidNames = [],
    count,
    isolationOnly = false,
    lifts,
    favoriteExercises = [],
    avoidMusclesSecondary = [],
    preferStable = false,
    equipmentAvailable = null  // IMPORTANT: Use to filter EXERCISE_DB
  }
)
  -> [exercise, exercise, ...] (array of picked exercises)

stabilityScore(exercise, preferStable)
  -> number (STABILITY_BONUS, -STABILITY_BONUS, or 0)
```

### `functions/exerciseDb.js`
**Exports:**
```javascript
EXERCISE_DB = [
  {
    name: "Barbell Bench Press",
    equipment: "barbell",
    primary: ["chest", "anterior_deltoid"],
    secondary: ["triceps"],
    pattern: "press",
    lesserKnown: false,
    isometric: false,
    cns: 8,
    injuryRisk: ["shoulder"],
    // ... more fields
  },
  // ... 100+ exercises
]

EXERCISE_MAP = { [exerciseName.toLowerCase()]: exercise, ... }
```

**Used By:**
- `sessionPlanner.js` – Exercise selection scoring
- `recommendation.js` – Session building
- `index.js` – Exercise stats, validation

### `functions/muscleTaxonomy.js`
**Exports:**
```javascript
isCompoundExercise(exercise) -> boolean
findExercise(name) -> exercise | null
musclesForExercise(exercise) -> [muscle, muscle, ...]
isLowerBodyExercise(exercise) -> boolean
isUpperBodyExercise(exercise) -> boolean
isBodyweightOnlyExercise(exercise) -> boolean
loggedExerciseNames(lifts) -> Set<exerciseName>
redundancyPattern(pattern) -> pattern name

MUSCLE_GROUPS = ["chest", "back", "shoulder", "arm", "forearm", "leg", ...]
```

### `functions/weeklyPlanner.js`
**Exports:**
```javascript
generateWeeklyGuidance(context)
  -> { backbone: [session, session, ...], muscleTargets, ... }

pickBackboneExercises(targetMuscles, context)
  -> [exercise, exercise, ...]

computeMusclePriority(muscle, context)
  -> "primary" | "secondary" | "tertiary"

scoreBucket(bucket, context)
  -> number

MUSCLE_GROUPS = [list of muscles]
FATIGUE_CEILING = 2400 (max structural fatigue)
SECONDARY_FATIGUE_CEILING = 600 (max CNS fatigue)
```

### `functions/index.js`
**Global/Module-level Variables:**
```javascript
const firestore = admin.firestore()
const APP_TIMEZONE = 'Europe/London'
const OPEN_PATHS = ['/health', '/shortcut', '/hevy/webhook', '/strava/auth', ...]
const ALLOWED_ORIGINS = ["https://pressnewsletter.web.app", ...]

// Request-scoped (per-request, safe in Cloud Functions 1st gen)
let db = null                    // Loaded user document
let save = async () => {}        // Function to persist db to Firestore
let liftsDocRef = null           // Reference to user's lifts subcollection
```

**Functions:**
```javascript
loadForUid(uid)
  -> Sets: db, save, liftsDocRef

loadOwner()
  -> Sets: db, save, liftsDocRef (for anonymous/open endpoints)

day(d)
  -> "YYYY-MM-DD" string

createWorkoutRecord({ date, name, source, ... })
  -> workout object (validated)

findOrMergeWorkout(workouts, date, source)
  -> index (or -1)

validateSetsForWorkout(sets)
  -> boolean

generateUniqueSessionCode()
  -> "XXXX" (4-char code)
```

**Imported from other modules:**
```javascript
const { EXERCISE_DB, EXERCISE_MAP } = require('./exerciseDb')
const { generateSessionExercises, progressionFor, ... } = require('./sessionPlanner')
const { computeStructuralFatigue, computeCurrentFatigueScores, ... } = require('./fatigue')
const { buildRecommendation } = require('./recommendation')
const { computeDay, personalSleepTarget, recoveryDrivers } = require('./recoveryScore')
const { computeMuscleLevels, classifyLift, estimate1RM } = require('./strengthStandards')
// ... many more
```

---

## Backend Endpoints & Request/Response Structures

### Authentication Middleware
```javascript
// All POST/GET/DELETE endpoints get req.uid (Firebase UID) injected here
app.use(async (req, res, next) => {
  if (OPEN_PATHS.includes(req.path)) {
    // Handle ?token= query for external webhooks
    if (req.query.token) {
      const tokSnap = await firestore.collection('syncTokens').doc(String(req.query.token)).get()
      req.uid = tokSnap.data().uid
    } else {
      await loadOwner() // Single owner account fallback
    }
  } else {
    // Normal auth: Firebase ID token in Authorization header
    const header = req.headers.authorization
    if (header?.startsWith('Bearer ')) {
      const { uid } = await admin.auth().verifyIdToken(header.slice(7))
      req.uid = uid
      await loadForUid(uid)
    }
  }
  next()
})
```

### POST /profile
**File:** `functions/index.js` line 1125

**Request Body:**
```javascript
{
  name: string,
  heightCm: number,
  sex: string,
  trainingExperienceYears: number,
  macroTargets: { calories, protein, carbs, fat },
  primaryActivity: "strength" | "running" | "hybrid" | "sports" | "crossfit",
  secondaryActivity: "strength" | "running" | "hybrid" | "sports" | "crossfit",
  equipmentAvailable: ["barbell" | "dumbbell" | "cable" | "machine" | "smith" | "bodyweight"],
  musclePriorities: { [muscle]: "focus" | "baseline" | "avoid" },
  // ... other fields
}
```

**Validation:**
- Activities: 5 valid options (line 1156, 1163)
- Equipment: 6 valid options (line 1169)
- Muscle priorities: 3 valid states only (line 1176)

**Smart Defaults Applied:** `applyActivityDefaults(body)` (line 1160)
- If `primaryActivity === 'strength'` → sets `weeklyTargets.lifting = { sessionsPerWeek: 4, avgSessionScore: 2000 }`

**Response:**
```javascript
{ ...db.profile } // Full profile object
```

### POST /session
**File:** `functions/index.js` line 2393

**Request:** (empty or minimal)

**Response:**
```javascript
{
  sessionId: string,
  code: "XXXX" (4-char code)
}
```

**Creates:** LiveSessions Firestore collection document

---

## Frontend State Variables

Located: `src/app.jsx`

**Main App State:**
```javascript
const [uid, setUid] = useState(null)
const [db, setDb] = useState(DEFAULTS())
const [expert, setExpert] = useState(false)
const [today, setToday] = useState(day())
const [showSettings, setShowSettings] = useState(false)

// Onboarding wizard (9 steps: 0-8)
const [step, setStep] = useState(0)
const [stepError, setStepError] = useState('')

// Profile editing
const [name, setName] = useState('')
const [heightCm, setHeightCm] = useState('')
const [sex, setSex] = useState('')
const [trainingExperienceYears, setTrainingExperienceYears] = useState('')

// Track 3: Activity selection
const [primaryActivity, setPrimaryActivity] = useState('')
const [secondaryActivity, setSecondaryActivity] = useState('')

// Track 3: Equipment & Priorities
const [equipmentAvailable, setEquipmentAvailable] = useState([])
const [musclePriorities, setMusclePriorities] = useState({})

// Macro targets
const [macroMode, setMacroMode] = useState('manual')
const [calories, setCalories] = useState('')
const [protein, setProtein] = useState('')
const [carbs, setCarbs] = useState('')
const [fat, setFat] = useState('')

// ... many more for workouts, lifts, etc.
```

**CHANGELOG (shown in Settings):**
```javascript
const CHANGELOG = [
  { version: '2.3.1', date: '2026-08-02', changes: [...] },
  { version: '2.3.0', date: '2026-07-28', changes: [...] },
  // ...
]
```

---

## Key Constants & Enums

### Muscle Groups
```javascript
MUSCLE_GROUPS = [
  'chest', 'back', 'shoulder', 'arm', 'forearm', 'leg', 'glute',
  'abdominal', 'lower_back', 'calf', 'neck', 'trap', 'anterior_deltoid',
  // ... more
]
```

### Activities
```javascript
VALID_ACTIVITIES = ['strength', 'running', 'hybrid', 'sports', 'crossfit']
```

### Equipment
```javascript
VALID_EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight']
```

### Constraint Types (for Track 1 #57)
```javascript
CONSTRAINT_TYPES = ['cns', 'muscle', 'equipment', 'injury']
```

### Fatigue Types
```javascript
FATIGUE_TYPES = {
  structural: { cap: 2400, _raw: uncapped },
  cns: { cap: 600, _raw: uncapped },
  metabolic: { cap: 100, _raw: uncapped },
  cardiovascular: { cap: 100, _raw: uncapped },
  connective_tissue: { cap: 100, _raw: uncapped }
}
```

---

## Database Access Patterns

### Loading User Data
```javascript
// In backend endpoints:
await loadForUid(uid)
// Now: db (user document), save (persist function), liftsDocRef available

// Access:
db.profile        // Profile object
db.workouts       // Array of workouts
db.lifts          // Array of lifts (loaded from subcollection)
db.lifts[i]       // { exercise, kg, reps, date, ... }
```

### Saving Changes
```javascript
// Modify db in memory
db.profile.name = 'New Name'
db.workouts.push(newWorkout)

// Persist to Firestore (automatically excludes db.lifts)
await save()
```

### Loading Lifts from Subcollection
```javascript
const { loadAllLifts, appendLifts } = require('./liftChunks')

// In userDoc.js loadForUserDoc():
data.lifts = await loadAllLifts(liftsDocRef)  // Array of all lifts, chunked

// To add more lifts:
await appendLifts(liftsDocRef, newLifts)
```

---

## Exercise Database Access

### Finding an Exercise
```javascript
// Method 1: By exact name (case-insensitive)
const ex = EXERCISE_DB.find(e => e.name.toLowerCase() === name.toLowerCase())

// Method 2: By map (faster)
const ex = EXERCISE_MAP[name.toLowerCase()]

// Method 3: Using muscleTaxonomy
const ex = findExercise(name)  // from muscleTaxonomy.js
```

### Filtering by Equipment (Track 1 #57)
```javascript
// Inside pickAccessories() or generateSessionExercises():
const athlete = db.profile
const equipmentAvailable = athlete.equipmentAvailable || []

const candidates = EXERCISE_DB.filter(e => {
  if (equipmentAvailable.length && !equipmentAvailable.includes(e.equipment)) {
    return false  // Filter out unavailable equipment
  }
  // ... other filters
  return true
})
```

### Filtering by Constraint Type (Track 1 #57)
```javascript
const exercise = EXERCISE_DB[0]

// Muscle constraint
const musclesInExercise = [...exercise.primary, ...(exercise.secondary || [])]
const violatesMuscle = (musclesInExercise).some(m => avoidMuscles.includes(m))

// Equipment constraint
const violatesEquipment = avoidEquipment.includes(exercise.equipment)

// CNS constraint
const violatesCNS = HIGH_CNS_EQUIPMENT.includes(exercise.equipment) && cnsFatigue > THRESHOLD

// Injury constraint
const exerciseInjuryRisks = exercise.injuryRisk || []
const violatesInjury = exerciseInjuryRisks.some(r => athleteInjuries.includes(r))
```

---

## Testing Patterns

### Backend Tests (`test/*.test.js`)
```javascript
// Using node:test framework
const test = require('node:test')
const assert = require('assert')

test('function name', async () => {
  const context = { /* mock data */ }
  const result = functionToTest(context)
  assert.strictEqual(result, expected)
})

// Async tests
test('async operation', async () => {
  const result = await asyncFunction()
  assert.ok(result)
})
```

### Frontend Tests (`test/app.test.jsx`)
```javascript
// Using Jest + React Testing Library
import { render, screen } from '@testing-library/react'
import App from '../src/app'

test('renders component', () => {
  render(<App />)
  expect(screen.getByText(/text/i)).toBeInTheDocument()
})
```

---

## Build & Deployment

### Frontend Build
```bash
npm run build
# Runs esbuild on src/app.jsx
# Output: public/app.js (bundled, minified)
```

### Backend Tests
```bash
npm test
# Runs: node --test (backend) && jest (frontend)
```

### Deployment
```bash
git push main
# Automatic deploy via Firebase Hosting + Cloud Functions
# No staging environment — main is production
```

---

## Common Integration Points

### Adding to POST /profile
1. Validate new field in `functions/index.js` POST /profile handler (line 1125)
2. Add to default profile schema in `functions/userDoc.js` DEFAULTS (line 8)
3. Apply smart defaults in `applyActivityDefaults()` if needed (line 1160)

### Adding to Session Generation
1. Define new function in `functions/sessionPlanner.js`
2. Export from sessionPlanner.js
3. Import in `functions/index.js`
4. Call in the recommendation/guidance-building flow
5. Use during `generateSessionExercises()` call

### Adding a New Constraint Type (Track 1 #57)
1. Add constraint checking logic to a new function
2. Modify `substituteForCNS()` → generalize to `substituteExercise()`
3. Call from `pickAccessories()` when constraint violates
4. Add test case to `test/sessionPlanner.test.js`

---

## Performance Notes

- **db** is request-scoped, cached in-memory for the request lifetime
- **EXERCISE_DB** is module-scoped, loaded once at startup
- Lifts are stored in subcollection chunks (not embedded) because original account exceeded 1MB document limit
- Query patterns are designed for single-user app (no cross-user queries except username uniqueness)

---

## Files to Modify by Feature Track

- **Track 1** (Phase 1 Fixes): `functions/sessionPlanner.js`, `functions/index.js`
- **Track 2** (Hybrid Training): `functions/weeklyPlanner.js`, `functions/activityWeighting.js`, `src/app.jsx`
- **Track 3** (Onboarding): `src/app.jsx` (steps 5-6), `functions/userDoc.js` (profile schema), `functions/index.js` (POST /profile validation)
- **Track 4A** (Analytics): `functions/index.js` (new endpoints), `src/app.jsx` (dashboards)
- **Track 4B** (Running): `functions/exerciseDb.js` (add running exercises), `functions/sessionPlanner.js` (running-specific logic)
- **Track 5** (Customization): `src/app.jsx` (UI panels), `functions/userDoc.js` (profile extensions)
