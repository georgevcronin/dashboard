# Track 1: Remaining Features — Grouped Prompts

Copy each prompt into a new Claude chat for code generation.

---

## TRACK 1 GROUP A: Heatmap Accessibility (#51)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified. No extra abstractions.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from the codebase.
4. All code must pass existing tests (npm run build && npm test).
5. No changes to files not listed. No deleting existing code.

ARCHITECTURE CONTEXT:
See CODEBASE_VARIABLES.md in the repo root for full variable reference, database access patterns, and integration points.

FEATURE TO GENERATE:

Track 1 #51: Heatmap Accessibility
File: public/body-*.svg (update all body diagram SVGs)
What to Build: Add non-colour channel (pattern/hatching) to body diagram for colorblind users. Fatigue intensity → pattern density.

Pattern mapping:
- Fatigue 0–20 (blue): No pattern
- Fatigue 21–40 (teal): Horizontal lines (10px spacing)
- Fatigue 41–60 (green): Diagonal cross-hatch (8px density)
- Fatigue 61–80 (yellow): Fine cross-hatch (5px density)
- Fatigue 81–100 (red): Dense cross-hatch (3px density)

Implementation:
1. Define <defs> SVG pattern elements for each density (5 total).
2. For each muscle group <path> or <circle>, add a <defs><pattern> reference instead of solid fill.
3. Keep existing color fills as the primary visual, add pattern on top (use CSS opacity: 0.6 or similar).
4. Test in browser: change fatigue input in S5, verify pattern density increases without color (simulate colorblind mode).

Files to update:
- public/body-front.svg
- public/body-back.svg
- public/body-arms.svg
- public/body-legs.svg
- Any other body-*.svg in public/

Integration notes:
- Frontend reads fatigue values from db.computeCurrentFatigueScores() (functions/fatigue.js).
- S5 panel (Fatigue Detail) renders body SVG with muscle fatigue heatmap.
- Each muscle's capped fatigue (0–100) drives pattern selection.
- No backend changes needed.

Gotchas:
- SVG patterns are not CSS-resizable; define width/height in <pattern> tag and test across devices (mobile, desktop).
- Pattern IDs must be unique (use pattern-0-20, pattern-21-40, etc.).
- Color + pattern together: existing color is primary, pattern is secondary overlay (accessibility fallback).

Test approach:
- Open S5 in browser, trigger different fatigue levels (mock or real data).
- Disable color vision (browser DevTools simulate colorblind mode or use online tool).
- Verify pattern density increases with fatigue (no colour dependence).

START CODE GENERATION HERE (just SVG code, no preamble):
```

---

## TRACK 1 GROUP B: Recommendation Delta (#63)

```
You are generating code for the Press Dashboard, a personalized fitness recommendation engine.

CRITICAL RULES:
1. YAGNI: Only generate exactly what's specified. No extra abstractions.
2. No comments unless the WHY is non-obvious.
3. Use existing patterns from the codebase.
4. All code must pass existing tests (npm run build && npm test).
5. No changes to files not listed. No deleting existing code.

ARCHITECTURE CONTEXT:
See CODEBASE_VARIABLES.md in the repo root for full variable reference, database access patterns, and integration points.

FEATURE TO GENERATE:

Track 1 #63: Recommendation Delta
Files: functions/progression.js (extend), src/app.jsx (new display layer in S3 header)
What to Build: Build comparison showing "limiting factor changed from CNS to metabolic". One-sentence explanation of why recommendation changed day-to-day.

Backend (functions/progression.js):
1. Add function: `computeRecommendationDelta(todayContext, yesterdayContext)` → { changed: boolean, reason: string, deltaSummary: { from: string, to: string } }
2. Limiting factor detection (already in todaysLimitingFactor.js): compare yesterday's vs today's.
3. If changed:
   - CNS → Metabolic: "CNS recovered but metabolic fatigue increased (high volume yesterday)"
   - Structural → CNS: "High-intensity work; need lower technical demand today"
   - Any others: descriptive one-liner.
4. Return both the new limiting factor AND the delta reason.

Integration with functions/index.js:
- POST /session endpoint: call computeRecommendationDelta() during recommendation building.
- Pass both db.todaysRecommendation and previousDay's recommendation.
- Include delta in response: `{ sessionPlan, limitingFactor, recommendationDelta: { changed, reason } }`

Frontend (src/app.jsx, S3 session recommendation header):
1. Receive recommendationDelta from API response.
2. If changed: render banner above session recommendation (or below header):
   ```
   <div style={{ padding: '8px 12px', background: 'rgba(255, 200, 0, 0.15)', borderRadius: '4px', marginBottom: '8px' }}>
     <strong>Limiting factor changed:</strong> {delta.reason}
   </div>
   ```
3. If not changed: render nothing (no visual clutter).
4. Styling: yellow/amber background, text color matches existing secondary text (gray).
5. Position: above the "Session Plan" heading in S3.

Gotchas:
- Yesterday's context may not exist (first day of tracking). If so, skip delta comparison (no "changed" banner).
- Limiting factor is not the same as "why exercise selection changed" — this is specifically about the primary constraint (CNS high, metabolic high, etc.).
- Don't over-explain; keep reason to one sentence max (existing copy in todaysLimitingFactor.js is a good length reference).

Test approach:
1. Mock two consecutive days' worth of data.
2. Day 1: high volume → metabolic fatigue dominates.
3. Day 2: high intensity, reduced volume → CNS dominates.
4. Call computeRecommendationDelta(day2Context, day1Context).
5. Verify: changed=true, reason includes "CNS" and "metabolic" terms.
6. Frontend: render delta banner, verify text appears and styling correct.

START CODE GENERATION HERE (no preamble):
```
