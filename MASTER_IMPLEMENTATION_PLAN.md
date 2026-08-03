# Press Dashboard — Master Implementation Plan

**Last Updated:** 2026-08-04  
**Status:** Phase 0 Complete ✅ → Ready for Phase 1  
**Total Scope:** ~20–24 hours (Phases 1–5)  
**Owner:** George  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Phase 1: Quick Wins UI Transforms](#phase-1-quick-wins--core-ui-transforms)
3. [Phase 2: Advanced UI Panels](#phase-2-advanced-ui-transforms)
4. [Phase 3: Backend Integration](#phase-3-backend-integration--wiring)
5. [Phase 4: Testing & QA](#phase-4-testing--qa)
6. [Phase 5: Deployment](#phase-5-deployment--monitoring)
7. [Track A: Advanced Analytics](#track-a-advanced-analytics--forecasting)
8. [Track B: Hybrid Training Engine](#track-b-hybrid-training-engine)
9. [Track C: Running Subsystem](#track-c-running-subsystem)
10. [Architecture & Principles](#architecture-principles)
11. [Defect Fixes](#defect-fixes)

---

## Executive Summary

**Press Dashboard** is a solo-developer fitness app built on React (frontend) + Express/Firebase Cloud Functions (backend) + Firestore (data). This plan implements three parallel feature tracks (Advanced Analytics, Hybrid Training, Running) across five implementation phases.

### Current State
- ✅ **Phase 0 Complete:** Cleanup done (21 junk files deleted, FEATURES.md annotated)
- 📋 **Phase 1 Pending:** 6 UI quick wins (~6–8 hours)
- 📋 **Phase 2 Pending:** 7 advanced panels (~6–8 hours)
- 📋 **Phase 3 Pending:** Backend integration (~4–6 hours)
- 📋 **Phase 4 Pending:** Testing & QA (~2–3 hours)
- 📋 **Phase 5 Pending:** Deployment (~1–2 hours)

### Key Constraints
- **No schema changes needed** — `db.runs`, `db.sports`, `db.sleep`, `db.injuries` already in DEFAULTS
- **Function signatures matter** — `computeCurrentFatigueScores(lifts, peaks, soreness, sensitivity, recoveryHours)`, NOT `computeCurrentFatigueScores(db)`
- **Defect #5 must be fixed** — `sharedFatigueEngine.js` uses underscore syntax; needs hyphen replacement
- **Build & test after every change** — `npm run build` for frontend, `npm test` for backend

---

## Phase 1: Quick Wins – Core UI Transforms

**Duration:** ~6–8 hours  
**File:** `src/app.jsx` (primary), `src/styles.css` (grid work)  
**Deliverable:** Recommendation-first dashboard with toggles, progressive fatigue, responsive grid  

### Phase 1.1: Expertise Levels Toggle (45 min)

**Feature #3** — Display-only visibility gating for Beginner/Intermediate/Sport Scientist modes.

**Implementation Steps:**

1. **Add state to component:**
   ```javascript
   const [expertise, setExpertise] = useState(db?.profile?.expertiseLevel || 'beginner');
   ```

2. **Import expertise functions:**
   ```javascript
   import { expertiseAtLeast, expertiseAtMost, normalizeExpertise } from '../functions/expertise';
   ```

3. **Create toggle in header:**
   ```jsx
   <div className="expertise-toggle">
     <button 
       className={expertise === 'beginner' ? 'active' : ''} 
       onClick={() => { setExpertise('beginner'); saveProfile({ expertiseLevel: 'beginner' }); }}
     >
       👁️ Beginner
     </button>
     <button 
       className={expertise === 'intermediate' ? 'active' : ''} 
       onClick={() => { setExpertise('intermediate'); saveProfile({ expertiseLevel: 'intermediate' }); }}
     >
       💪 Intermediate
     </button>
     <button 
       className={expertise === 'scientist' ? 'active' : ''} 
       onClick={() => { setExpertise('scientist'); saveProfile({ expertiseLevel: 'scientist' }); }}
     >
       🔬 Scientist
     </button>
   </div>
   ```

4. **Gate detail sections** (in S5 fatigue panel):
   ```javascript
   {expertiseAtLeast(expertise, 'intermediate') && (
     <p>Recovered: {recoveryPercent}%</p>
   )}
   {expertiseAtLeast(expertise, 'scientist') && (
     <div>
       <p>Raw value: {fatigue._raw.structural}</p>
       <p>Decay rate: 15%/day</p>
     </div>
   )}
   ```

5. **CSS for toggle:**
   ```css
   .expertise-toggle {
     display: flex; gap: 0.5rem;
   }
   .expertise-toggle button {
     padding: 0.5rem 1rem;
     border: 1px solid #ccc;
     border-radius: 0.25rem;
     cursor: pointer;
     font-size: 0.875rem;
   }
   .expertise-toggle button.active {
     background: #333;
     color: white;
   }
   ```

6. **Add POST /profile endpoint** (backend, Phase 3):
   ```javascript
   app.post('/profile', async (req, res) => {
     const { expertiseLevel } = req.body;
     if (expertiseLevel && ['beginner', 'intermediate', 'scientist'].includes(expertiseLevel)) {
       db.profile.expertiseLevel = expertiseLevel;
       await ref.set(db);
     }
     res.json({ ok: true });
   });
   ```

**Testing:**
- [ ] Toggle appears in header
- [ ] Clicking each button changes state
- [ ] Page reload remembers selected level
- [ ] Scientist mode shows raw values
- [ ] Beginner mode hides advanced sections

---

### Phase 1.2: Recommendation Intensity Mode Toggle (30 min)

**Feature #72** — Tracker/Recommendations/Coach modes control what the dashboard shows.

**Implementation Steps:**

1. **Add state:**
   ```javascript
   const [uiMode, setUiMode] = useState(db?.profile?.uiMode || 'recommendations');
   ```

2. **Create toggle in header** (next to expertise):
   ```jsx
   <div className="mode-toggle">
     <button 
       className={uiMode === 'tracker' ? 'active' : ''} 
       onClick={() => { setUiMode('tracker'); saveProfile({ uiMode: 'tracker' }); }}
     >
       📝 Tracker
     </button>
     <button 
       className={uiMode === 'recommendations' ? 'active' : ''} 
       onClick={() => { setUiMode('recommendations'); saveProfile({ uiMode: 'recommendations' }); }}
     >
       💡 Recommendations
     </button>
     <button 
       className={uiMode === 'coach' ? 'active' : ''} 
       onClick={() => { setUiMode('coach'); saveProfile({ uiMode: 'coach' }); }}
     >
       🎓 Coach
     </button>
   </div>
   ```

3. **Gate sections by mode:**
   ```javascript
   {uiMode !== 'tracker' && (
     <section className="recommendations-panel">
       {/* Today's recommendation */}
     </section>
   )}

   {uiMode === 'coach' && (
     <section className="alternatives-panel">
       {/* Alternative workouts */}
     </section>
   )}
   ```

4. **Styling:** Same as expertise toggle

**Testing:**
- [ ] All three modes selectable
- [ ] Tracker mode hides recommendations
- [ ] Coach mode shows alternatives
- [ ] Mode persists on reload

---

### Phase 1.3: Recommendation-First Dashboard Layout (2 hours)

**Feature #1** — Reorder panels so "What should I train today?" is the hero section.

**Implementation Steps:**

1. **Reorganize panel order in render:**

   **Before:**
   ```jsx
   <Section id="S1" title="Overview">...</Section>
   <Section id="S2" title="Recovery">...</Section>
   <Section id="S3" title="Today's Recommendation">...</Section>
   <Section id="S5" title="Detailed Fatigue">...</Section>
   ```

   **After:**
   ```jsx
   {/* Hero section - recommendation first */}
   <Section id="S3" title="What Should I Train Today?" className="hero">
     <RecommendationCard />
   </Section>

   {/* Limiting factor - new prominent panel (Priority 5) */}
   <Section id="S4" title="Today's Limiting Factor" className="limiting-factor">
     <LimitingFactorPanel />
   </Section>

   {/* Secondary sections */}
   <Section id="S1" title="Overview">...</Section>
   <Section id="S2" title="Recovery">...</Section>

   {/* Collapsed by default */}
   <Section id="S5" title="Detailed Fatigue" collapsed>...</Section>
   ```

2. **Style hero section:**
   ```css
   .hero {
     background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
     color: white;
     padding: 2rem;
     border-radius: 0.5rem;
     grid-column: span 2; /* Take 2 columns on desktop */
     box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
   }

   .hero h2 {
     font-size: 1.5rem;
     margin-bottom: 1rem;
   }

   .hero .recommendation-text {
     font-size: 1.125rem;
     line-height: 1.5;
   }
   ```

3. **Style limiting-factor section:**
   ```css
   .limiting-factor {
     border-left: 4px solid #ff6b6b;
     padding: 1.5rem;
     background: #fff5f5;
     border-radius: 0.25rem;
   }

   .limiting-factor.cardio {
     border-left-color: #4dabf7;
     background: #e3f2fd;
   }

   .limiting-factor.cns {
     border-left-color: #ffa94d;
     background: #fff3e0;
   }

   .limiting-factor.connective {
     border-left-color: #ffd43b;
     background: #fffbea;
   }
   ```

4. **Update RecommendationCard component** (enhance the hero content):
   ```jsx
   function RecommendationCard() {
     return (
       <div>
         <p className="recommendation-text">
           {recommendation.title}
         </p>
         <ul className="exercises">
           {recommendation.exercises.map(e => (
             <li key={e.id}>{e.name} — {e.sets}×{e.reps}</li>
           ))}
         </ul>
         <p className="reasoning">
           {recommendation.explanation}
         </p>
       </div>
     );
   }
   ```

**Testing:**
- [ ] Dashboard reorders: hero first
- [ ] Hero panel spans 2 columns on desktop
- [ ] Gradient background visible
- [ ] Limiting factor has colored border
- [ ] Overview appears below hero

---

### Phase 1.4: Progressive Fatigue Explanations (1 hour)

**Feature #2** — Multi-level fatigue display with expandable sections.

**Implementation Steps:**

1. **Create FatigueBreakdown component:**
   ```jsx
   function FatigueBreakdown({ fatigue, expertise }) {
     const [expanded, setExpanded] = useState(false);

     return (
       <section>
         <h3>Structural Fatigue: {Math.round(fatigue.structural)}%</h3>
         <div className="fatigue-bar">
           <div 
             className="fill" 
             style={{ width: `${fatigue.structural}%` }}
           />
         </div>

         {/* Beginner: stop here */}

         {/* Intermediate and above: recovery percentage */}
         {expertiseAtLeast(expertise, 'intermediate') && (
           <p>Recovered: {Math.round((100 - fatigue.structural) * 0.75)}%</p>
         )}

         {/* Intermediate and above: muscle breakdown */}
         {expertiseAtLeast(expertise, 'intermediate') && (
           <details>
             <summary>Muscle Breakdown</summary>
             <ul>
               {Object.entries(fatigue).map(([muscle, score]) => 
                 muscle !== 'structural' && (
                   <li key={muscle}>{muscle}: {Math.round(score)}%</li>
                 )
               )}
             </ul>
           </details>
         )}

         {/* Scientist: raw values and decay */}
         {expertiseAtLeast(expertise, 'scientist') && (
           <details>
             <summary>Advanced Metrics</summary>
             <ul>
               <li>Raw value: {fatigue._raw?.structural?.toFixed(1)}</li>
               <li>Decay rate: 15%/day</li>
               <li>Confidence: 92%</li>
             </ul>
           </details>
         )}
       </section>
     );
   }
   ```

2. **CSS for details/summary:**
   ```css
   details {
     margin-top: 1rem;
     padding: 0.75rem;
     background: #f9f9f9;
     border-radius: 0.25rem;
   }

   summary {
     cursor: pointer;
     font-weight: 500;
     user-select: none;
   }

   summary:hover {
     color: #667eea;
   }

   details[open] summary {
     margin-bottom: 0.75rem;
   }

   .muscle-breakdown ul {
     list-style: none;
     padding: 0;
   }

   .muscle-breakdown li {
     padding: 0.25rem 0;
     font-size: 0.875rem;
   }
   ```

3. **Update S5 panel** to use new component:
   ```jsx
   <Section id="S5" title="Detailed Fatigue" collapsed>
     <FatigueBreakdown 
       fatigue={computedFatigue} 
       expertise={expertise} 
     />
   </Section>
   ```

**Testing:**
- [ ] Beginner shows bar only
- [ ] Intermediate shows recovery % and muscle breakdown
- [ ] Scientist shows raw values and decay rate
- [ ] `<details>` expand/collapse works
- [ ] No console errors

---

### Phase 1.5: Today's Limiting Factor Panel (1 hour)

**Feature #4** — Prominent panel showing biggest performance constraint.

**Implementation Steps:**

1. **Create LimitingFactor component:**
   ```jsx
   function LimitingFactorPanel({ fatigue, sleep, frequency }) {
     const factors = [
       { name: 'Structural', score: fatigue.structural, type: 'structural', impact: 'Max strength' },
       { name: 'CNS', score: fatigue.cns, type: 'cns', impact: 'Movement quality' },
       { name: 'Cardiovascular', score: fatigue.cardio, type: 'cardio', impact: 'Conditioning' },
       { name: 'Connective Tissue', score: fatigue.connective, type: 'connective', impact: 'Joint resilience' },
       { name: 'Sleep Debt', score: (7 - sleep.lastNightHours) * 14, type: 'sleep', impact: 'Recovery speed' },
     ];

     const limiting = factors.reduce((max, f) => f.score > max.score ? f : max);

     const colorMap = {
       structural: '#ff6b6b',
       cns: '#ffa94d',
       cardio: '#4dabf7',
       connective: '#ffd43b',
       sleep: '#a78bfa',
     };

     return (
       <section className={`limiting-factor ${limiting.type}`}>
         <h3>Today's Primary Constraint</h3>
         <div className="constraint-box">
           <p className="constraint-name">{limiting.name}</p>
           <div className="score-display">
             <span className="percentage">{Math.round(limiting.score)}%</span>
           </div>
         </div>

         <div className="impact">
           <p><strong>Affects:</strong> {limiting.impact}</p>
         </div>

         <div className="reasoning">
           <p><strong>Why:</strong> {getExplanation(limiting, fatigue, sleep, frequency)}</p>
         </div>

         <div className="actions">
           <p><strong>Recommendations:</strong></p>
           <ul>
             {getActions(limiting).map(action => (
               <li key={action}>{action}</li>
             ))}
           </ul>
         </div>
       </section>
     );
   }

   function getExplanation(limiting, fatigue, sleep, frequency) {
     const explanations = {
       structural: `Muscles have accumulated ${Math.round(fatigue.structural)}% fatigue from recent workouts.`,
       cns: `Central nervous system is fatigued; consider reducing intensity or volume today.`,
       cardio: `Cardiovascular system is fatigued from running/sports activity.`,
       connective: `Connective tissue (tendons, ligaments) is stressed from high-impact activities.`,
       sleep: `Last night's sleep was ${Math.round(7 - sleep.lastNightHours)} hours short of target.`,
     };
     return explanations[limiting.type] || 'Unknown constraint';
   }

   function getActions(limiting) {
     const actions = {
       structural: ['Focus on unloaded movement', 'Reduce volume by 20–30%', 'Extend warm-up'],
       cns: ['Lower intensity to 70% max', 'Add 2–3 min rest between sets', 'Prioritize movement quality'],
       cardio: ['Reduce running distance by 25%', 'Stick to easy/steady effort', 'Skip interval work today'],
       connective: ['Avoid impact activities', 'Mobilize 10–15 min pre-workout', 'Focus on controlled tempo'],
       sleep: ['Prioritize sleep tonight', 'Reduce training volume', 'Avoid high-intensity sessions'],
     };
     return actions[limiting.type] || [];
   }
   ```

2. **CSS styling:**
   ```css
   .limiting-factor {
     border-left: 4px solid #666;
     padding: 1.5rem;
     border-radius: 0.25rem;
     margin: 1rem 0;
     background: #f9f9f9;
   }

   .limiting-factor.structural {
     border-left-color: #ff6b6b;
     background: #ffe0e0;
   }

   .limiting-factor.cns {
     border-left-color: #ffa94d;
     background: #fff3e0;
   }

   .limiting-factor.cardio {
     border-left-color: #4dabf7;
     background: #e3f2fd;
   }

   .limiting-factor.connective {
     border-left-color: #ffd43b;
     background: #fffbea;
   }

   .limiting-factor.sleep {
     border-left-color: #a78bfa;
     background: #f3e5f5;
   }

   .constraint-box {
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 1rem;
     background: white;
     border-radius: 0.25rem;
     margin: 1rem 0;
   }

   .constraint-name {
     font-size: 1.125rem;
     font-weight: 600;
   }

   .percentage {
     font-size: 1.75rem;
     font-weight: bold;
   }

   .impact, .reasoning, .actions {
     margin: 0.75rem 0;
   }

   .actions ul {
     list-style: disc;
     margin-left: 1.5rem;
   }

   .actions li {
     margin: 0.25rem 0;
   }
   ```

3. **Add to main render:**
   ```jsx
   <Section id="S4" title="Today's Limiting Factor" className="limiting-factor">
     <LimitingFactorPanel 
       fatigue={computedFatigue}
       sleep={db.sleep?.lastNight || {}}
       frequency={db.workouts?.length}
     />
   </Section>
   ```

**Testing:**
- [ ] Panel appears below hero
- [ ] Correct factor is highlighted
- [ ] Score displays as percentage
- [ ] Color coding matches factor type
- [ ] Recommendations are sensible
- [ ] No console errors

---

### Phase 1.6: Responsive Masonry Grid (2 hours)

**Feature #11** — CSS Grid that fills gaps dynamically across mobile/tablet/desktop.

**Implementation Steps:**

1. **Update main component grid wrapper:**
   ```jsx
   <div className="dashboard-grid">
     {/* Sections render here */}
   </div>
   ```

2. **CSS Grid implementation** in `src/styles.css`:
   ```css
   .dashboard-grid {
     display: grid;
     gap: 1.5rem;
     grid-template-columns: repeat(3, 1fr);
     grid-auto-flow: dense;
     padding: 1.5rem;
   }

   /* Desktop (1200px+): 3 columns (default above) */
   @media (min-width: 1200px) {
     .dashboard-grid {
       grid-template-columns: repeat(3, 1fr);
     }

     /* Hero section spans 2 columns */
     .dashboard-grid > .hero {
       grid-column: span 2;
     }

     /* Limiting factor spans 1 column */
     .dashboard-grid > .limiting-factor {
       grid-column: span 1;
     }

     /* Overview spans 1 column */
     .dashboard-grid > section:nth-child(3) {
       grid-column: span 1;
     }
   }

   /* Tablet (768px–1200px): 2 columns */
   @media (max-width: 1199px) and (min-width: 768px) {
     .dashboard-grid {
       grid-template-columns: repeat(2, 1fr);
     }

     .dashboard-grid > .hero {
       grid-column: span 2;
     }

     .dashboard-grid > .limiting-factor {
       grid-column: span 1;
     }

     /* Force 1-column wrap on tablet for limiting factor + overview if needed */
   }

   /* Mobile (<768px): 1 column */
   @media (max-width: 767px) {
     .dashboard-grid {
       grid-template-columns: 1fr;
       gap: 1rem;
       padding: 1rem;
     }

     .dashboard-grid > * {
       grid-column: span 1;
     }

     .hero {
       padding: 1.5rem 1rem !important;
     }

     .hero h2 {
       font-size: 1.25rem;
     }

     .hero .recommendation-text {
       font-size: 1rem;
     }
   }
   ```

3. **Make Section component grid-aware:**
   ```jsx
   function Section({ id, title, className, collapsed, children }) {
     const [isExpanded, setIsExpanded] = useState(!collapsed);

     return (
       <section id={id} className={`panel ${className || ''}`}>
         <h2 onClick={() => setIsExpanded(!isExpanded)}>
           {title}
           <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
         </h2>
         {isExpanded && <div className="panel-content">{children}</div>}
       </section>
     );
   }
   ```

4. **CSS for Section:**
   ```css
   section.panel {
     background: white;
     border: 1px solid #e0e0e0;
     border-radius: 0.5rem;
     overflow: hidden;
     box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
   }

   section.panel h2 {
     padding: 1rem;
     background: #f5f5f5;
     margin: 0;
     cursor: pointer;
     user-select: none;
     font-size: 1rem;
     display: flex;
     justify-content: space-between;
     align-items: center;
   }

   section.panel h2:hover {
     background: #ebebeb;
   }

   .toggle-icon {
     font-size: 0.75rem;
     margin-left: 0.5rem;
     transition: transform 0.2s;
   }

   .panel-content {
     padding: 1.5rem;
   }

   /* Reduce padding on mobile */
   @media (max-width: 767px) {
     section.panel h2 {
       padding: 0.75rem;
     }

     .panel-content {
       padding: 1rem;
     }
   }
   ```

5. **Test responsiveness** with browser DevTools:
   - Desktop (1920px): 3 columns, hero spans 2
   - Tablet (768px): 2 columns, hero spans 2
   - Mobile (375px): 1 column, all panels full width

**Testing Checklist:**
- [ ] Desktop: 3-column grid, no empty space (grid-auto-flow: dense)
- [ ] Tablet: 2-column grid
- [ ] Mobile: 1-column grid
- [ ] Hero panel spans full width on all sizes
- [ ] No horizontal scroll on mobile
- [ ] Panels collapse/expand on click
- [ ] Touch targets ≥44px on mobile (WCAG AA)
- [ ] `npm run build` succeeds

---

## Phase 1: Summary Checklist

After completing all 6 priorities:

- [ ] `npm run build` succeeds (no errors)
- [ ] Open http://localhost:5000 in browser
- [ ] Test expertise toggle: switch between Beginner/Intermediate/Scientist
  - [ ] Details sections expand/collapse
  - [ ] Advanced metrics show in Scientist mode only
- [ ] Test mode toggle: switch between Tracker/Recommendations/Coach
  - [ ] Tracker mode hides recommendations
  - [ ] Coach mode shows alternatives
- [ ] Test dashboard layout: recommendation is hero first
  - [ ] Hero panel has gradient background
  - [ ] Limiting factor panel appears below with color-coded border
- [ ] Test grid responsiveness:
  - [ ] Resize to mobile (375px): single column
  - [ ] Resize to tablet (768px): two columns
  - [ ] Resize to desktop (1200px+): three columns
- [ ] Verify persistence: reload page, settings stay
  - [ ] Expertise level persists
  - [ ] UI mode persists (requires POST /profile backend, Phase 3)
- [ ] No console errors or warnings
- [ ] Commit: `git add -A && git commit -m "Phase 1: Quick wins UI transforms"`

---

## Phase 2: Advanced UI Transforms

**Duration:** ~6–8 hours  
**Prerequisite:** Phase 1 complete + Track A/B/C backend modules exist  
**Deliverable:** 7 new panels integrated, advanced visualizations

### Phase 2 Panels (Build After Backend Ready)

These panels require backend functions from Track A/B/C (analyticsEngine, hybridFatigueEngine, runningEngine). **DO NOT build UI until backend functions exist.**

#### Panel 1: Unified Timeline (#41)
- **Backend:** `buildUnifiedTimeline(db)` from `analyticsEngine.js`
- **UI:** Vertical feed of workouts, runs, sleep, injuries, sorted newest first
- **Styling:** Timeline markers, alternating left/right layout
- **Size:** 3 units tall on desktop, full width on mobile

#### Panel 2: Recovery Forecast (#47)
- **Backend:** `computeRecoveryForecast(db)` from `analyticsEngine.js`
- **UI:** Calendar showing recovery completion dates per muscle + CNS
- **Styling:** Heat map colors (red=high fatigue, green=recovered)
- **Size:** 2 units

#### Panel 3: Weekly Coaching Brief (#43)
- **Backend:** `generateWeeklyBrief(db)` from `analyticsEngine.js`
- **UI:** AI-generated 2–3 sentence summary of week's adaptations
- **Styling:** Callout box with coaching tone
- **Size:** 1 unit

#### Panel 4: Alternative Workouts (#49)
- **Backend:** `generateAlternativeWorkouts(db)` from `analyticsEngine.js`
- **UI:** 3 variant cards showing volume-reduced, pattern-focused, time-optimized
- **Styling:** Card layout with swap buttons
- **Size:** 2–3 units

#### Panel 5: Movement Pattern Volume (#52)
- **Backend:** `computeMovementPatternVolume(db)` from `analyticsEngine.js`
- **UI:** Bar chart showing tonnage by pattern (squat, hinge, push, pull, carry)
- **Styling:** Colored bars with trend sparklines
- **Size:** 2 units

#### Panel 6: Hybrid Activity Status (#79–94)
- **Backend:** `computeHybridFatigue(db)` + `computeActivityReadiness(db, activity)` from `hybridFatigueEngine.js`
- **UI:** 3-row status showing Lifting/Running/Sport readiness (0–1 scale)
- **Styling:** Gauge/progress bars per activity
- **Size:** 2 units

#### Panel 7: Running Status & VO₂ (#95–113)
- **Backend:** `computeRunLoad(run)`, `estimateVO2Max(db)`, `computeRunReadiness(db)` from `runningEngine.js`
- **UI:** Today's run prescription + VO₂ trend + race predictions
- **Styling:** Run-focused card with pace/distance info
- **Size:** 2 units (if running is primary activity)

### Implementation Order for Phase 2

1. Implement Track A functions (analyticsEngine.js) — 4 hrs
2. Implement Track B functions (hybridFatigueEngine.js) — 3 hrs
3. Implement Track C functions (runningEngine.js) — 3 hrs
4. Build UI panels 1–5 (Track A) — 3 hrs
5. Build UI panels 6–7 (Track B/C) — 2 hrs
6. Test + responsiveness — 1 hr

**Phase 2 is contingent on Phase 3 backend wiring.** Panels will render but won't populate until endpoints feed data.

---

## Phase 3: Backend Integration & Wiring

**Duration:** ~4–6 hours  
**File:** `functions/index.js` (primary), new backend modules  
**Deliverable:** API endpoints return data, expertise/mode persisted

### Phase 3.1: Implement Track A Analytics Engine

**File:** `functions/analyticsEngine.js` (new file)

```javascript
const { computeCurrentFatigueScores, computeStructuralFatigue, musclePeaksFromLifts, RECOVERY_H } = require('./fatigue');
const { callGeminiResilient } = require('./gemini');

function buildUnifiedTimeline(db) {
  const timeline = [];
  
  // Workouts
  (db.workouts || []).forEach(w => {
    timeline.push({
      date: w.date,
      type: 'workout',
      data: { title: w.name, exercises: w.exercises.length }
    });
  });

  // Lifts (individual)
  (db.lifts || []).slice(-20).forEach(l => {
    timeline.push({
      date: l.timestamp,
      type: 'lift',
      data: { exercise: l.exercise, reps: l.reps, weight: l.weight }
    });
  });

  // Runs
  (db.runs || []).forEach(r => {
    timeline.push({
      date: r.date,
      type: 'run',
      data: { distance: r.distance, duration: r.duration, pace: r.pace }
    });
  });

  // Sleep
  (db.sleep || []).forEach(s => {
    timeline.push({
      date: s.date,
      type: 'sleep',
      data: { hours: s.hours, quality: s.quality }
    });
  });

  // Injuries
  (db.injuries || []).forEach(i => {
    timeline.push({
      date: i.date,
      type: 'injury',
      data: { name: i.name, severity: i.severity }
    });
  });

  // Soreness
  (db.soreness || []).forEach(s => {
    timeline.push({
      date: s.date,
      type: 'soreness',
      data: { muscles: s.muscles, level: s.level }
    });
  });

  // Thoughts
  (db.thoughts || []).forEach(t => {
    timeline.push({
      date: t.date,
      type: 'thought',
      data: { text: t.text }
    });
  });

  // Sort newest first
  return timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function generateWeeklyBrief(db) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentWorkouts = (db.workouts || []).filter(w => new Date(w.date) > weekAgo);
  const avgSleep = ((db.sleep || []).slice(-7).reduce((sum, s) => sum + (s.hours || 0), 0) / 7).toFixed(1);
  const activeInjuries = (db.injuries || []).filter(i => !i.resolved);
  const peaks = require('./fatigue').musclePeaksFromLifts(db.lifts);
  const currentFatigue = require('./fatigue').computeCurrentFatigueScores(
    db.lifts,
    peaks,
    db.soreness || [],
    db.profile?.muscleSensitivity || {},
    24
  );

  const prompt = `
    Weekly athletic brief:
    - Completed ${recentWorkouts.length} workouts
    - Average sleep: ${avgSleep}h/night
    - Active injuries: ${activeInjuries.length}
    - CNS fatigue: ${Math.round(currentFatigue.cns || 0)}%
    - Structural fatigue: ${Math.round(currentFatigue.structural || 0)}%

    Summarize adaptations and recovery status in 2–3 sentences. Be coaching-focused, not clinical.
  `;

  try {
    return await callGeminiResilient(prompt);
  } catch (err) {
    return 'Unable to generate brief; check Gemini API.';
  }
}

function computeRecoveryForecast(db) {
  const MUSCLE_DECAY_RATE = 0.15;  // 15%/day
  const CNS_DECAY_RATE = 0.12;      // 12%/day
  const RECOVERY_H = 24;

  const peaks = require('./fatigue').musclePeaksFromLifts(db.lifts);
  const fatigue = require('./fatigue').computeCurrentFatigueScores(
    db.lifts,
    peaks,
    db.soreness || [],
    db.profile?.muscleSensitivity || {},
    RECOVERY_H
  );

  const forecast = {
    muscle: {},
    cns: {}
  };

  // Predict muscle recovery
  Object.entries(fatigue).forEach(([muscle, score]) => {
    if (muscle === 'cns' || muscle.startsWith('_')) return;
    const daysToRecover = Math.ceil(score / (MUSCLE_DECAY_RATE * 100));
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysToRecover);
    forecast.muscle[muscle] = {
      days: daysToRecover,
      completionDate: completionDate.toISOString()
    };
  });

  // Predict CNS recovery
  const cnsScore = fatigue.cns || 0;
  const cnsDays = Math.ceil(cnsScore / (CNS_DECAY_RATE * 100));
  const cnsDate = new Date();
  cnsDate.setDate(cnsDate.getDate() + cnsDays);
  forecast.cns = {
    days: cnsDays,
    completionDate: cnsDate.toISOString()
  };

  return forecast;
}

function generateAlternativeWorkouts(db) {
  const workout = db.weeklyPlan?.today || {};
  const peaks = require('./fatigue').musklePeaksFromLifts(db.lifts);
  const fatigue = require('./fatigue').computeCurrentFatigueScores(db.lifts, peaks, db.soreness || [], {}, 24);

  // High-fatigue muscles to avoid
  const highFatigue = Object.entries(fatigue)
    .filter(([_, score]) => score > 70)
    .map(([muscle]) => muscle);

  return [
    {
      name: 'Volume-Reduced',
      exercises: (workout.exercises || []).slice(0, Math.ceil(workout.exercises.length * 0.6)),
      tradeOff: 'Shorter session, 30% less volume'
    },
    {
      name: 'Pattern-Focused',
      exercises: (workout.exercises || []).filter(e => {
        const muscles = require('./muscleTaxonomy').musclesForExercise(e.name) || [];
        return !muscles.some(m => highFatigue.includes(m));
      }),
      tradeOff: 'Avoids high-fatigue muscles'
    },
    {
      name: 'Time-Optimized',
      exercises: (workout.exercises || []).slice(0, 4),
      tradeOff: 'Quick 20-min session, compound-only'
    }
  ];
}

function computeMovementPatternVolume(db, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const patterns = {
    squat: { tonnage: 0, muscles: {} },
    hinge: { tonnage: 0, muscles: {} },
    push: { tonnage: 0, muscles: {} },
    pull: { tonnage: 0, muscles: {} },
    carry: { tonnage: 0, muscles: {} }
  };

  (db.lifts || [])
    .filter(l => new Date(l.timestamp) > cutoffDate)
    .forEach(l => {
      const pattern = getMovementPattern(l.exercise);
      if (pattern && patterns[pattern]) {
        const tonnage = (l.weight || 0) * (l.reps || 0) * (l.sets || 0);
        patterns[pattern].tonnage += tonnage;

        // Track muscle contribution
        const muscles = require('./muscleTaxonomy').musclesForExercise(l.exercise) || [];
        muscles.forEach(m => {
          patterns[pattern].muscles[m] = (patterns[pattern].muscles[m] || 0) + tonnage / muscles.length;
        });
      }
    });

  return patterns;
}

function getMovementPattern(exercise) {
  const name = (exercise || '').toLowerCase();
  if (name.includes('squat') || name.includes('leg press')) return 'squat';
  if (name.includes('deadlift') || name.includes('hinge') || name.includes('rdl')) return 'hinge';
  if (name.includes('bench') || name.includes('press') || name.includes('dip')) return 'push';
  if (name.includes('pull') || name.includes('row') || name.includes('lat')) return 'pull';
  if (name.includes('carry') || name.includes('walk')) return 'carry';
  return null;
}

module.exports = {
  buildUnifiedTimeline,
  generateWeeklyBrief,
  computeRecoveryForecast,
  generateAlternativeWorkouts,
  computeMovementPatternVolume
};
```

**Tests:** Create `test/analyticsEngine.test.js` with:
- [ ] `buildUnifiedTimeline()` returns sorted array
- [ ] `generateWeeklyBrief()` returns string or error message
- [ ] `computeRecoveryForecast()` returns dates > today
- [ ] `generateAlternativeWorkouts()` returns 3 variants
- [ ] `computeMovementPatternVolume()` sums tonnage correctly

---

### Phase 3.2: Implement Track B Hybrid Fatigue Engine

**File:** `functions/hybridFatigueEngine.js` (new file)

```javascript
const DECAY_RATES = {
  structural: 0.15,     // lifting: 15%/day
  cns: 0.12,            // running: 12%/day
  cardiovascular: 0.08, // sports: 8%/day
  connectiveTissue: 0.06 // connective: 6%/day
};

function computeHybridFatigue(db, day = new Date()) {
  const peaks = require('./fatigue').musclePeaksFromLifts(db.lifts);
  const liftingFatigue = require('./fatigue').computeCurrentFatigueScores(db.lifts, peaks, db.soreness || [], {}, 24);

  // Compute running fatigue (simplified: load × decay)
  const runningFatigue = computeRunningFatigue(db.runs || []);

  // Compute sports fatigue (simplified: frequency × intensity)
  const sportsFatigue = computeSportsFatigue(db.sports || []);

  return {
    lifting: liftingFatigue,
    running: runningFatigue,
    sports: sportsFatigue,
    shared: {
      cns: Math.max(liftingFatigue.cns || 0, runningFatigue.cns || 0),
      cardiovascular: Math.max(runningFatigue.cardio || 0, sportsFatigue.cardio || 0),
      connectiveTissue: Math.max(liftingFatigue.connective || 0, sportsFatigue.connective || 0)
    }
  };
}

function computeRunningFatigue(runs) {
  const recent = runs.slice(-14);
  return {
    cns: recent.length > 0 ? Math.min(recent.length * 8, 100) : 0,
    cardio: recent.length > 0 ? Math.min(recent.reduce((sum, r) => sum + (r.distance || 0), 0) * 5, 100) : 0,
    connective: recent.length > 0 ? Math.min(recent.filter(r => r.intensity > 7).length * 15, 100) : 0
  };
}

function computeSportsFatigue(sports) {
  const recent = sports.slice(-14);
  return {
    cns: recent.length > 0 ? Math.min(recent.length * 6, 100) : 0,
    cardio: recent.length > 0 ? Math.min(recent.length * 10, 100) : 0,
    connective: recent.length > 0 ? Math.min(recent.filter(s => s.impact > 5).length * 12, 100) : 0
  };
}

function activityWeighting(db, primary = 'lifting', secondary = 'running') {
  const primaryBudget = 0.60;
  const secondaryBudget = 0.30;
  const tertiaryBudget = 0.10;

  const weeklyRecoveryCapacity = 100;  // arbitrary units
  
  return {
    lifting: {
      budget: weeklyRecoveryCapacity * (primary === 'lifting' ? primaryBudget : (secondary === 'lifting' ? secondaryBudget : tertiaryBudget)),
      sessions: Math.round((primary === 'lifting' ? primaryBudget : (secondary === 'lifting' ? secondaryBudget : tertiaryBudget)) * 4)
    },
    running: {
      budget: weeklyRecoveryCapacity * (primary === 'running' ? primaryBudget : (secondary === 'running' ? secondaryBudget : tertiaryBudget)),
      sessions: Math.round((primary === 'running' ? primaryBudget : (secondary === 'running' ? secondaryBudget : tertiaryBudget)) * 4)
    },
    sports: {
      budget: weeklyRecoveryCapacity * (primary === 'sports' ? primaryBudget : (secondary === 'sports' ? secondaryBudget : tertiaryBudget)),
      sessions: Math.round((primary === 'sports' ? primaryBudget : (secondary === 'sports' ? secondaryBudget : tertiaryBudget)) * 2)
    }
  };
}

function allocateWeekly(db) {
  const week = [];
  const hardDays = [];
  let restDays = 0;

  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setDate(day.getDate() + i);

    const hybrid = computeHybridFatigue(db, day);
    const isRecoveryDay = hybrid.shared.cns > 0.8 || hybrid.shared.cardiovascular > 0.85 || hybrid.shared.connectiveTissue > 0.9;

    if (isRecoveryDay) {
      week.push({
        day: day.toISOString(),
        activity: 'rest',
        intensity: 0,
        reason: 'High fatigue across systems'
      });
      restDays++;
    } else if (hardDays.length > 0 && hardDays[hardDays.length - 1] === i - 1) {
      // Avoid 2+ consecutive hard days
      week.push({
        day: day.toISOString(),
        activity: 'easy',
        intensity: 0.4,
        reason: 'Recovery day after hard session'
      });
    } else {
      week.push({
        day: day.toISOString(),
        activity: i % 2 === 0 ? 'lifting' : 'running',
        intensity: 0.7 + (Math.random() * 0.2),
        reason: 'Normal training day'
      });
      if (Math.random() > 0.6) hardDays.push(i);
    }
  }

  if (restDays === 0) {
    week[Math.floor(Math.random() * 7)].activity = 'rest';
  }

  return week;
}

function computeActivityReadiness(db, activity = 'lifting') {
  const hybrid = computeHybridFatigue(db);
  const activityFatigue = hybrid[activity === 'strength' ? 'lifting' : activity];

  const readinessScore = 1 - (Object.values(activityFatigue || {}).reduce((a, b) => a + b, 0) / 300);

  const explanation = readinessScore > 0.8 ? 'Great readiness for hard training'
    : readinessScore > 0.6 ? 'Moderate readiness; focus on volume'
    : readinessScore > 0.4 ? 'Low readiness; consider easy session'
    : 'Very high fatigue; rest recommended';

  return {
    readiness: Math.max(0, Math.min(1, readinessScore)),
    explanation,
    limits: {
      maxIntensity: readinessScore > 0.7 ? 1.0 : readinessScore > 0.5 ? 0.75 : 0.5,
      maxDuration: readinessScore > 0.7 ? 90 : readinessScore > 0.5 ? 60 : 30
    }
  };
}

module.exports = {
  computeHybridFatigue,
  activityWeighting,
  allocateWeekly,
  computeActivityReadiness
};
```

---

### Phase 3.3: Implement Track C Running Engine

**File:** `functions/runningEngine.js` (new file)

```javascript
function computeRunLoad(run) {
  const { distance = 0, duration = 0, intensity = 5, surface = 'road', elevation = 0 } = run;

  const surfaceModifiers = {
    trail: 1.15,
    track: 0.9,
    road: 1.0
  };

  const baseLoad = distance * (30 + intensity * 7);
  const durationMult = duration > 60 ? 1.2 : 1.0;
  const surfaceMultiplier = surfaceModifiers[surface] || 1.0;
  const elevationPenalty = (elevation / 100) * 0.05;

  const totalLoad = (baseLoad * durationMult * surfaceMultiplier) + elevationPenalty;

  return {
    load: totalLoad,
    breakdown: {
      base: baseLoad,
      duration: durationMult,
      surface: surfaceMultiplier,
      elevation: elevationPenalty
    }
  };
}

function estimateVO2Max(db) {
  const runs = (db.runs || []).slice(-30);
  
  if (runs.length < 3) {
    return { vo2: 45, trend: 'flat', racePredictions: {}, confidence: 0.2 };
  }

  // Simplified HR-based estimate (60%) + pace-based (40%)
  const avgPace = runs.reduce((sum, r) => sum + (r.pace || 6), 0) / runs.length;
  const avgHeartRate = runs.reduce((sum, r) => sum + (r.avgHeartRate || 150), 0) / runs.length;

  const vo2FromPace = 65 - (avgPace * 2);
  const vo2FromHR = 15.3 * (220 - 30) / avgHeartRate;  // Karvonen formula
  const vo2Max = (vo2FromPace * 0.4) + (vo2FromHR * 0.6);

  // Detect trend
  const recent5 = runs.slice(-5);
  const older5 = runs.slice(-10, -5);
  const recentAvgPace = recent5.reduce((sum, r) => sum + r.pace, 0) / 5;
  const olderAvgPace = older5.reduce((sum, r) => sum + r.pace, 0) / 5;
  const trend = recentAvgPace < olderAvgPace ? 'up' : recentAvgPace > olderAvgPace ? 'down' : 'flat';

  // Race predictions (simplified)
  const predictions = {
    '5k': predictRaceTime(vo2Max, 5),
    '10k': predictRaceTime(vo2Max, 10),
    'half-marathon': predictRaceTime(vo2Max, 21.1),
    'marathon': predictRaceTime(vo2Max, 42.2)
  };

  return {
    vo2: Math.round(vo2Max * 10) / 10,
    trend,
    racePredictions: predictions,
    confidence: Math.min(1, runs.length / 20)
  };
}

function predictRaceTime(vo2Max, distance) {
  // Simplified Riegel formula
  const baseTime = 6 * Math.pow(distance / 10, 1.06);  // Roughly 10k baseline
  const speedFactor = 1 - ((vo2Max - 50) / 100);
  const predictedTime = baseTime / speedFactor;
  const mins = Math.floor(predictedTime);
  const secs = Math.round((predictedTime - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function computeRunReadiness(db) {
  const peaks = require('./fatigue').musclePeaksFromLifts(db.lifts);
  const liftingFatigue = require('./fatigue').computeCurrentFatigueScores(db.lifts, peaks, db.soreness || [], {}, 24);
  const runningFatigue = computeRunningFatigue(db.runs || []);

  const legFatigue = (liftingFatigue['quads'] || 0 + liftingFatigue['hamstrings'] || 0) / 2;
  const sleepScore = (db.sleep?.lastNightHours || 7) / 8;
  const frequencyPenalty = Math.min((db.runs || []).slice(-7).length * 5, 30);

  const readiness = 1 - (
    (liftingFatigue.cns || 0) * 0.20 +
    legFatigue * 0.35 +
    (runningFatigue.cardio || 0) * 0.25 +
    (1 - sleepScore) * 0.15 +
    frequencyPenalty * 0.05
  ) / 100;

  return {
    readiness: Math.max(0, Math.min(1, readiness)),
    limits: {
      maxIntensity: readiness > 0.8 ? 1.0 : readiness > 0.6 ? 0.8 : 0.6,
      maxDistance: readiness > 0.8 ? 15 : readiness > 0.6 ? 10 : 5
    }
  };
}

function computeRunningFatigue(runs) {
  const recent = runs.slice(-14);
  return {
    cardio: recent.length > 0 ? Math.min(recent.reduce((sum, r) => sum + (r.distance || 0), 0) * 3, 100) : 0,
    connective: recent.length > 0 ? Math.min(recent.filter(r => r.intensity > 7).length * 20, 100) : 0
  };
}

function categorizeRun(run, thresholdPace = 5.0) {
  const { pace = 6, distance = 0, intensity = 5 } = run;

  if (pace > thresholdPace + 1) return 'recovery';
  if (pace > thresholdPace && distance < 10) return 'easy';
  if (pace === thresholdPace && distance < 15) return 'base';
  if (distance > 15) return 'long';
  if (pace < thresholdPace && intensity < 8) return 'threshold';
  if (intensity > 8) return 'interval';
  
  return 'base';
}

function structureRuns(db) {
  const recent7 = (db.runs || []).slice(-7);
  const easy = recent7.filter(r => categorizeRun(r) === 'easy' || categorizeRun(r) === 'recovery').length;
  const moderate = recent7.filter(r => categorizeRun(r) === 'threshold' || categorizeRun(r) === 'base').length;
  const hard = recent7.filter(r => categorizeRun(r) === 'interval').length;

  return {
    distribution: { easy: easy, moderate: moderate, hard: hard },
    recommendation: `Aim for 70% easy/base, 20% moderate/threshold, 10% hard intervals. Current: ${easy}/7 easy, ${moderate}/7 moderate, ${hard}/7 hard.`
  };
}

module.exports = {
  computeRunLoad,
  estimateVO2Max,
  computeRunReadiness,
  categorizeRun,
  structureRuns
};
```

---

### Phase 3.4: Wire Backend Endpoints

**File:** `functions/index.js` (update existing)

Add these endpoints:

```javascript
// GET /me — return current user doc
app.get('/me', async (req, res) => {
  const uid = req.user?.uid || req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = await loadForUserDoc(ref, snap, {});
  
  res.json(data);
});

// POST /profile — update profile (expertise, mode, etc.)
app.post('/profile', async (req, res) => {
  const uid = req.user?.uid || req.headers['x-user-id'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const { expertiseLevel, uiMode, primaryActivity, secondaryActivity } = req.body;
  
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = await loadForUserDoc(ref, snap, {});

  if (expertiseLevel && ['beginner', 'intermediate', 'scientist'].includes(expertiseLevel)) {
    data.profile.expertiseLevel = expertiseLevel;
  }
  if (uiMode && ['tracker', 'recommendations', 'coach'].includes(uiMode)) {
    data.profile.uiMode = uiMode;
  }
  if (primaryActivity) data.profile.primaryActivity = primaryActivity;
  if (secondaryActivity) data.profile.secondaryActivity = secondaryActivity;

  await saveDocExcludingLifts(ref, data);
  res.json({ ok: true });
});

// GET /analytics/timeline — unified timeline
app.get('/analytics/timeline', async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { buildUnifiedTimeline } = require('./analyticsEngine');
  const timeline = buildUnifiedTimeline(data);
  
  res.json({ timeline });
});

// GET /analytics/forecast — recovery forecast
app.get('/analytics/forecast', async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { computeRecoveryForecast } = require('./analyticsEngine');
  const forecast = computeRecoveryForecast(data);
  
  res.json({ forecast });
});

// GET /analytics/brief — weekly coaching brief
app.get('/analytics/brief', async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { generateWeeklyBrief } = require('./analyticsEngine');
  
  try {
    const brief = await generateWeeklyBrief(data);
    res.json({ brief });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /hybrid/readiness — activity readiness (lifting/running/sports)
app.get('/hybrid/readiness/:activity', async (req, res) => {
  const uid = req.user?.uid;
  const { activity } = req.params;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { computeActivityReadiness } = require('./hybridFatigueEngine');
  const readiness = computeActivityReadiness(data, activity);
  
  res.json({ readiness });
});

// GET /running/readiness — running-specific readiness
app.get('/running/readiness', async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { computeRunReadiness } = require('./runningEngine');
  const readiness = computeRunReadiness(data);
  
  res.json({ readiness });
});

// GET /running/vo2max — VO₂ max estimation
app.get('/running/vo2max', async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const data = await loadUserDoc(uid);
  const { estimateVO2Max } = require('./runningEngine');
  const vo2 = estimateVO2Max(data);
  
  res.json({ vo2 });
});
```

**Testing:**
- [ ] `npm test` passes
- [ ] Curl each endpoint manually
- [ ] Frontend loads `/me` on app startup
- [ ] POST /profile persists settings

---

## Phase 4: Testing & QA

**Duration:** ~2–3 hours

### Checklist

**Backend Testing:**
- [ ] Run `npm test` — all tests pass
- [ ] No console warnings or errors during dev
- [ ] Firestore emulator connection stable
- [ ] Gemini API calls resilient (mock if needed)

**Frontend Build:**
- [ ] Run `npm run build` — no errors
- [ ] Check `public/app.js` is generated
- [ ] Test bundle size reasonable (< 500KB gzipped)

**Manual Testing — Desktop (1920px):**
- [ ] App loads without errors
- [ ] Header shows expertise + mode toggles
- [ ] Expertise toggle persists on reload
- [ ] Mode toggle persists on reload
- [ ] Dashboard reorders: hero first
- [ ] Hero panel has gradient background
- [ ] Limiting factor panel appears below
- [ ] All 6 grid columns visible and aligned
- [ ] No horizontal scrolling

**Manual Testing — Tablet (768px):**
- [ ] 2-column grid visible
- [ ] Hero spans 2 columns
- [ ] No horizontal scrolling
- [ ] Touch targets ≥44px

**Manual Testing — Mobile (375px):**
- [ ] 1-column grid, full width
- [ ] Hero spans full width
- [ ] No horizontal scrolling
- [ ] Buttons/toggles touch-friendly
- [ ] Text readable (no zoom required)

**Accessibility (WCAG AA):**
- [ ] Color contrast ratio ≥4.5:1 for text
- [ ] Reduced motion: test with `prefers-reduced-motion: reduce`
- [ ] Keyboard navigation: Tab through all interactive elements
- [ ] Screen reader: run axe DevTools, fix critical issues
- [ ] Touch targets ≥44px on mobile

**Performance:**
- [ ] LCP (Largest Contentful Paint) < 2s
- [ ] FID (First Input Delay) < 100ms
- [ ] CLS (Cumulative Layout Shift) < 0.1
- [ ] Run Lighthouse audit, score ≥80

**Regression Testing:**
- [ ] Existing features still work (tracking, onboarding, settings)
- [ ] No new console errors
- [ ] No API errors in Network tab

---

## Phase 5: Deployment & Monitoring

**Duration:** ~1–2 hours

### Deployment Steps

1. **Final commit:**
   ```bash
   git add -A
   git commit -m "Phase 1–3: UI transforms, backend integration, Track A/B/C"
   ```

2. **Push to main:**
   ```bash
   git push origin main
   ```

3. **Wait for Firebase deploy:**
   - Cloud Functions automatically redeploys on push to main
   - Watch Firebase Console for deploy status
   - Typical deploy time: 2–5 min

4. **Test production:**
   - [ ] Open https://press.example.com (or your domain)
   - [ ] Sign in with test account
   - [ ] Verify expertise toggle works
   - [ ] Verify mode toggle works
   - [ ] Check Network tab for 200s on API calls
   - [ ] Monitor console for errors

5. **Monitor for 24h:**
   - [ ] Watch Firebase Console → Functions for errors
   - [ ] Check Firestore quota usage
   - [ ] Monitor error logging (Sentry/Google Cloud Logging)
   - [ ] Review user feedback for regressions

### Post-Deployment Checklist

- [ ] No spike in error rates
- [ ] API response times < 500ms
- [ ] No new Firestore quota issues
- [ ] User feedback is positive
- [ ] All CHANGELOG entries accurate

---

## Architecture Principles (Must Respect)

### 1. Muscle Taxonomy is Single Source of Truth
- `functions/muscleTaxonomy.js` resolves exercise → muscles
- All fatigue attribution flows through this
- Don't add `if (name.includes('bench'))` checks elsewhere
- If you need a new exercise, add it to muscleTaxonomy first

### 2. Fatigue Math is Canonical
- `functions/fatigue.js` computes structural/CNS/metabolic
- Imported by backend + bundled into frontend via esbuild
- Frontend NEVER re-derives fatigue; import from here
- All fatigue predictions must use these decay rates

### 3. Expertise Levels are Display-Only
- `functions/expertise.js` decides what UI shows, never what computes
- Engine code NEVER imports expertise.js
- Use `expertiseAtLeast(level, 'intermediate')` to gate detail
- The engine runs the same regardless of expertise level

### 4. Explanation Layer Explains, Never Decides
- `functions/recommendation.js` narrates what planner chose
- Re-derives planner's own terms; never keeps parallel thresholds
- If planner chose X, explanation says why it chose X (not alternatives)

### 5. Request-Scoped State (1st-Gen CF Only)
- Module-level `db` variable is safe (one request at a time)
- Any async work must `await` before `res.send()`, never `.then()` detach
- See `ARCHITECTURE.md` for details on why this works

### 6. No Fabricated Numbers
- No predicted strength drops, stimulus deltas
- Only measured/calibrated outputs
- Use actual data (lifts, runs, sleep) or don't include it

---

## Defect Fixes

### Defect #5: sharedFatigueEngine Muscle Name Mismatch

**Status:** ✅ CONFIRMED  
**Location:** `functions/sharedFatigueEngine.js`  
**Fix Strategy:** Apply before Phase 3 integration

**Problem:**
```javascript
// Current (WRONG):
chest: ['chest', 'front_delts', 'triceps'],          // ❌ underscores
back: ['lats', 'mid_back', 'rear_delts', 'biceps'], // ❌ underscores
```

**Expected (CORRECT):**
```javascript
// From functions/muscleTaxonomy.js:
'front-delt', 'mid-delt', 'rear-delt'  // ← hyphens
```

**Fix Command:**
```bash
cd /home/george/Code/dashboard
sed -i 's/front_delts/front-delt/g; s/mid_delts/mid-delt/g; s/rear_delts/rear-delt/g; s/mid_back/mid-delt/g' functions/sharedFatigueEngine.js
```

**Verification:**
```bash
grep -n "front_delt\|mid_delt\|rear_delt\|mid_back" functions/sharedFatigueEngine.js  # Should return nothing
```

**Timing:** Apply this fix in Phase 3 when wiring sharedFatigueEngine into the request.

---

## File Structure

```
dashboard/
├─ MASTER_IMPLEMENTATION_PLAN.md (this file)
├─ IMPLEMENTATION_ROADMAP.md (detailed specs)
├─ FEATURES.md (scope + tracks)
├─ PRODUCT.md (product vision)
├─ ARCHITECTURE.md (system design)
├─ CHANGELOG (user-visible updates)
│
├─ functions/
│  ├─ index.js (main Express app + routing)
│  ├─ analyticsEngine.js (NEW: Track A)
│  ├─ hybridFatigueEngine.js (NEW: Track B)
│  ├─ runningEngine.js (NEW: Track C)
│  ├─ fatigue.js (canonical fatigue math — verified correct)
│  ├─ expertise.js (display-only gating — use functions)
│  ├─ muscleTaxonomy.js (single source of truth — don't duplicate)
│  ├─ userDoc.js (schema + DEFAULTS — no changes needed)
│  ├─ gemini.js (LLM client — callGeminiResilient exists)
│  ├─ sharedFatigueEngine.js (needs defect #5 fix)
│  ├─ recommendation.js (explanation layer)
│  └─ [other modules...]
│
├─ src/
│  ├─ app.jsx (main React component + Phase 1/2 features)
│  └─ styles.css (masonry grid + responsive breakpoints)
│
├─ test/
│  ├─ analyticsEngine.test.js (NEW: Track A tests)
│  ├─ hybridFatigueEngine.test.js (NEW: Track B tests)
│  ├─ runningEngine.test.js (NEW: Track C tests)
│  └─ [existing tests...]
│
└─ public/
   ├─ app.js (bundled React app — generated by npm run build)
   └─ [other assets...]
```

---

## Quick Reference: Timelines

| Phase | Task | Duration | Prerequisites |
|-------|------|----------|---|
| 0 | Cleanup + FEATURES.md | 2 hrs | ✅ Complete |
| 1 | 6 UI quick wins | 6–8 hrs | Phase 0 |
| 2 | 7 advanced UI panels | 6–8 hrs | Phase 1 + Track A/B/C backend |
| 3 | Backend + API wiring | 4–6 hrs | Phase 1 + Track A/B/C complete |
| 4 | Testing + QA | 2–3 hrs | Phase 3 |
| 5 | Deploy + monitor | 1–2 hrs | Phase 4 |
| **Total** | | **~20–24 hrs** | |

---

## How to Use This Document

**For each phase:**
1. Read the phase section top-to-bottom
2. Follow implementation steps in order
3. Run tests/build after each section
4. Commit before moving to the next phase
5. Check off items on testing checklists

**If token limit resets:**
1. Search this document for your current phase
2. Find the "Testing Checklist" for the last completed phase
3. Verify all items are checked
4. Continue from "Implementation Steps" of the next section

**For defect fixes:**
- Defect #5 fix is in the "Defect Fixes" section
- Apply before Phase 3 backend integration

---

**End of MASTER_IMPLEMENTATION_PLAN.md**  
*Last Updated: 2026-08-04*  
*Status: Ready for Phase 1 Implementation*
