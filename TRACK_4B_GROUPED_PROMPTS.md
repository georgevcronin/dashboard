# Track 4B: Running Foundation — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 4B GROUP A: Running Metrics Engines (#98–101, #99B)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm test.

ARCHITECTURE CONTEXT:
Running data source: db.workouts[] with source='strava' or manual logs
See CODEBASE_VARIABLES.md for Firestore structure.

FEATURES TO GENERATE:

1. Track 4B #98: Running Load
   File: functions/runningLoad.js (new)
   
   Formula: (distance × (30 + intensity×70)) × durationMult × surfaceModifier + elevationBonus
   
   Inputs per run:
   - distance (km)
   - intensity (0–1, derived from pace vs threshold pace)
   - duration (minutes)
   - surface: "road" (1.0), "trail" (1.2), "track" (0.9)
   - elevation (meters climbed)
   
   Breakdown:
   - Base: distance × (30 + intensity×70)
     Example: 10km easy (intensity 0.4) = 10 × (30 + 28) = 580
     Example: 10km threshold (intensity 0.8) = 10 × (30 + 56) = 860
   - Duration multiplier: (actual / typical pace for intensity)
     Typical: easy 6min/km, threshold 4:30min/km
   - Surface modifier: trail +20%, track –10%
   - Elevation bonus: +2 per meter climbed
   
   Function:
   ```
   computeRunLoad(run)
     → { load: number, breakdown: { base, duration, surface, elevation } }
   ```
   
   Aggregate weekly load: sum all runs in past 7 days

2. Track 4B #99: VO₂ Max Estimation
   File: functions/vo2MaxEstimator.js (new)
   
   3 methods (blend):
   - HR method (Karvonen): VO₂ = (0.64 × HR_reserve / age_factor) + base
   - Pace method (VDOT): VO₂ = (pace_percentile × 10) + base (based on recent race or threshold pace)
   - Hybrid (recommended): 60% pace + 40% HR
   
   Trend detection:
   - Last 2 weeks vs prior 2 weeks
   - Uptrend (↑): improved aerobic capacity
   - Flat: maintenance
   - Downtrend (↓): fatigue or detraining
   
   Race-time predictions:
   - VO₂ max maps to expected race times (5k, 10k, half, marathon)
   - Use Riegel formula or lookup table
   - Confidence: 0–100% (higher = more data, less variance)
   
   Function:
   ```
   estimateVO2Max(db)
     → { vo2: number, method: 'hr' | 'pace' | 'hybrid', trend: 'up' | 'flat' | 'down', 
          racePredictions: { '5k': string, '10k': string, ... }, confidence: 0–100 }
   ```
   
   Minimum data: 4 runs in last 2 weeks

3. Track 4B #99B: Aerobic Efficiency
   File: functions/aerobicEfficiency.js (new)
   
   Metric: pace-to-HR ratio (lower is better; same pace, lower HR = improving efficiency)
   
   Calculation per run:
   - avg pace (min/km)
   - avg HR (bpm)
   - efficiency = pace / HR (or HR / pace depending on scaling; pick one for consistency)
   
   Trend over 60 days:
   - Linear regression on (date, efficiency) pairs
   - Detect improvement: slope > 0 (more negative pace-to-HR ratio = better efficiency)
   - % improvement: (latest – 60daysAgo) / 60daysAgo × 100
   
   Function:
   ```
   computeAerobicEfficiency(db)
     → { trend: number (slope), improvement%: number, latest: number, chart: [ { date, efficiency }, ... ] }
   ```
   
   Chart: display last 60 days, overlay linear trend line

4. Track 4B #100: Running Readiness
   File: functions/runReadiness.js (new)
   
   Separate from lifting readiness. Weights:
   - CNS fatigue: 20% (separate from lifting CNS; running is lower CNS)
   - Leg fatigue: 35% (structural fatigue of lower body, from running + leg-heavy lifts)
   - Cardiovascular fatigue: 25% (from runningLoad accumulation)
   - Sleep: 15% (recovery enabler)
   - Run frequency: 5% (avoid 3+ hard runs in 4 days)
   
   Formula: readiness = (1 - CNS_ratio×0.20 - leg_ratio×0.35 - cardio_ratio×0.25 - sleep_penalty×0.15 - freq_penalty×0.05)
   
   Output:
   ```
   computeRunReadiness(db)
     → { readiness: 0–1, description: string, runLimitations: { maxIntensity: 0–1, maxDistance: km } }
   ```
   
   Run limitations (if readiness low):
   - maxIntensity: 0.4 (easy pace only) if readiness < 0.3
   - maxDistance: 5km if readiness < 0.5
   - Full spectrum if readiness > 0.7

5. Track 4B #101: Run Categories
   File: functions/runCategories.js (new)
   
   Auto-classify runs based on pace, HR, duration:
   - Recovery: < 70% threshold pace, HR < 140, any duration
   - Easy: 70–85% threshold pace, HR 140–155
   - Base: 85–95% threshold pace, HR 155–170
   - Long: duration > 60min, any pace
   - Threshold: 95–105% threshold pace, HR 170–185 (lactate threshold work)
   - Interval: pace varies >10%, HR varies >15 (hard/easy repeats)
   
   Function:
   ```
   categorizeRun(run, athleteThresholdPace)
     → "recovery" | "easy" | "base" | "long" | "threshold" | "interval"
   ```
   
   Heuristic: if 3+ categories match, pick the most specific (e.g., long+easy → long)
   Fallback: if unclear, classify as "base" (neutral)

Tests (Track 4B):
File: test/running.test.js (new)

10 tests for running load:
- Easy run (6min/km): ~510 load
- Threshold run (4:30/km): ~1000 load
- Long run (duration 2h): multiplier applies correctly
- Trail surface: +20% bonus verified
- Elevation: +2 per meter (1000m climb = +2000 load bonus)
- Weekly aggregation: sum 4 runs correctly
- Intensity breakdown: verify each component (base, duration, surface, elevation)
- Short run: minimal load
- High-intensity interval: load reflects intensity
- No data: load = 0

12 tests for VO₂ max:
- HR method: calculated from HR zones
- Pace method: calculated from recent pace
- Hybrid: 60/40 blend weights correct
- Trend up: VO₂ higher last 2w vs prior 2w
- Trend down: detected correctly
- Confidence 0–100%: scales with data points
- Race predictions: 5k/10k/half/marathon estimates plausible
- Minimum data check: 4 runs required
- Insufficient data: returns null or "insufficient data"
- Edge case: only 1 run logged → confidence very low

8 tests for aerobic efficiency:
- Efficiency ratio (pace/HR or HR/pace): consistent
- Trend line: linear regression accurate
- Improvement %: calculated correctly
- Improving efficiency: detects when HR drops at same pace
- Plateau: trend slope near 0
- 60-day window: includes data from exactly 60 days ago (not 59 or 61)
- Chart generation: returns 60 data points, sorted by date

8 tests for running readiness:
- High fatigue → low readiness (< 0.3)
- Well-recovered → high readiness (> 0.7)
- Weight calculation correct (20+35+25+15+5 = 100%)
- Run limitations apply: low readiness → maxIntensity 0.4, maxDistance 5km
- High readiness: no limitations
- Sleep penalty: sleep < 6h → 0.5 penalty factor
- Frequency penalty: 3 hard runs in 4 days → freq_penalty 0.5
- Edge case: no runs logged → readiness defaults sensibly

8 tests for run categorization:
- Easy run: classified as "easy"
- Threshold: classified as "threshold"
- Long run: classified as "long" (duration > 60min)
- Recovery: low pace & HR → "recovery"
- Interval: pace/HR varies → "interval"
- Ambiguous run: defaults to "base"
- Edge case: walk (very low pace) → "recovery"
- High-intensity sprint (very high pace): classified correctly (unlikely "long" unless duration long)

START CODE GENERATION HERE (no preamble):
```

---

## TRACK 4B GROUP B: UI Display + Integration (#104, S3/S5/S1 panels)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from CODEBASE_VARIABLES.md.
4. All code must pass: npm run build && npm test.
5. React patterns: useState/useEffect, inline styles, className.

FEATURES TO GENERATE:

1. S3 Running Dashboard (Running Tab)
   File: src/app.jsx (S3 panel, new tab or section)
   
   Display:
   - Weekly load: current week volume + breakdown (last 7 days)
     Example: "82 km, 41k load | Easy: 35km | Threshold: 15km | Long: 20km"
   - VO₂ chart: 8-week trend line + latest VO₂ + confidence %
   - Aerobic efficiency trend: 8-week chart (HR/pace) + % improvement
   - Running readiness: ring % + recommendation + run limits
     Example: "Readiness 62% | Easy/base pace OK, skip threshold work today"
   - Run type breakdown: stacked bar chart (recovery %, easy %, base %, long %, threshold %, interval %)
   
   Size: 2 units (multi-section display) or multiple widgets
   Styling: match existing S3 panels (light background, clear metrics)
   Data source: estimateVO2Max(), computeAerobicEfficiency(), computeRunReadiness(), aggregateRunLoad()

2. S5 Running Metrics (Running Metrics Section)
   File: src/app.jsx (S5 panel, add new section below lifting metrics)
   
   Display:
   - Running load: current week + 4-week trend (small line chart)
   - VO₂ Max: number + trend arrow (↑ ↓ →)
   - Aerobic efficiency: number + trend %
   - Running readiness: ring + % + description
   - Weekly breakdown: pie chart (recovery/easy/base/long/threshold/interval split)
   
   Size: 2 units (half-width or stacked)
   Styling: match existing S5 style (rings + charts + trends)

3. S1 Brief Integration (Weekly Summary)
   File: src/app.jsx (S1 widget, Track 4A's briefService)
   
   Extend Track 4A #43 briefService to include:
   - Running volume: "40km this week, avg pace 5:20"
   - VO₂ trend: "↑ improving aerobic capacity" (if uptrend)
   - Any new PRs on runs (e.g., fastest 5k)
   
   Integrate into Gemini prompt (Track 4A #43):
   "Summarize this week: lifting [load], running [volume, VO₂ trend], sleep [avg], fatigue [state]. Focus on balanced training, not cheerleading."
   
   No new UI needed; just extend existing briefService + widget.

Integration Points (functions/index.js):
- POST /session: after session logged, recompute runReadiness
- GET /me: return running metrics (load, VO₂, efficiency, readiness)
- Track 2 multi-activity endpoints: ensure running data flows to sharedFatigueEngine()

START CODE GENERATION HERE (no preamble):
```
