# Design Review: Workout Logger Page

**Reviewed against:** PRODUCT.md  
**Philosophy:** Educated · Sensible · Postmodern  
**Component:** WorkoutLogger (`src/app.jsx:2179-2615`)  
**Date:** 2026-08-01

---

## Summary

The Workout Logger is a highly distilled, text-driven interface that embodies Press's design philosophy. It strips away all visual decoration, chart elements, and motivational framing in favor of pure data entry and session tracking. The interface is functionally complete and accessible, though it presents a stark aesthetic that may feel initially overwhelming or uninviting to new users. Strengths: clear information hierarchy, minimal visual noise, excellent keyboard operability. Weaknesses: dense text-only layout lacks visual breaks; empty state could better guide users; the "day ring" date selector is unconventional and not well-discoverable.

---

## Visual Hierarchy & Structure

### What Works Well
✅ **Session header is the focus.** "IN SESSION" with timer at top-left immediately tells the user: a workout is active, and time is passing. This is the most important fact on the page.

✅ **Two action zones clearly separated:**
  1. **Top:** Exercise input (search bar) and add buttons (+ Exercise Picker, + Build, + Plate Calculator)
  2. **Bottom:** Session control (DISCARD, FINISH)
  
  This separation reflects the user's mental model: adding exercises, then finishing the session.

✅ **Session type and location visible.** "+ GROUP SESSION: SET GYM" tells the user exactly what they're in. Small but crucial for context.

✅ **Collapsible sections (+ prefixes) signal expandability.** Users can add exercises, build custom exercises, or calculate plate weight without clutter. Minimal by default, detailed when needed.

⚠️ **No intermediate hierarchy.** Once exercises are added (off-screen below), the page becomes a dense vertical list. No section groupings like "Lower Body," "Upper Body," or "Accessories" to organize exercises visually.

### Consistency
✅ **Typography is consistent.** JetBrains Mono throughout, matching the rest of Press. No serif/sans-serif mixing.

✅ **Color scheme is minimal.** Dark background, light text, accent colors (red for "danger" actions like DISCARD, white for primary FINISH). No unnecessary gradients or decorative colors.

✅ **Spacing follows the 8px base unit.** Margins and padding align with app-wide standards. The dense layout is intentional, not accidental.

⚠️ **Search input styling is inconsistent with form fields elsewhere.** The "Search or add exercise..." input uses a bottom-border underline, while typical form fields in other parts of Press may have full borders or different styling. Subtle, but worth auditing against the form component patterns.

---

## Component Quality

### Code Structure (WorkoutLogger)
✅ **Props are clear:** `{ planDay, lifts, customExercises, experienceLevel, onClose, refresh }`

✅ **State is well-organized:** 20+ useState calls manage exercises, sets, rest timers, gym detection, coach notes, and session metadata. State is numerous but logically grouped by concern.

✅ **Session persistence is robust:** `saveActiveSession` / `loadActiveSession` uses localStorage with SESSION_KEY. Sessions survive page refreshes during a workout.

✅ **Calculations are delegated to imported modules:** Fatigue, progression, EMG weighting, muscle attribution all use shared functions from `functions/`. No recalculation of the same logic.

✅ **EnhancedExercisePicker is integrated cleanly.** Passes correct props (lifts, onAdd callback, workoutDate). Picker doesn't leak internal state to parent.

### Visual Elements (Collapsible Sections)
✅ **"+" prefix is discoverable.** Signals expandability. Users understand they can click to reveal content.

⚠️ **No visual indicator of expanded/collapsed state.** The "+" doesn't change to "−" when the section expands. Users might not realize they can collapse it again to save space.

---

## States & Interactions

### Session States
✅ **Session timer updates in real-time.** "00:12" → "00:13" gives live feedback that the session is active.

✅ **Active session persists across navigation.** User can leave the logger, browse history, and come back to find their session still running.

✅ **Rest timer is visible.** When a user finishes a set and hits "Rest," the rest window countdown is prominent. Visual feedback for the most time-critical action.

⚠️ **No "pause session" option visible.** If the user needs to step away (e.g., water break, phone call), they can only discard or finish. A pause might be useful for real-world gym scenarios.

### Exercise List & Set Entry
✅ **Exercises are expandable.** Each added exercise shows an expand/collapse icon (▼/▶) to show/hide its set rows.

✅ **Set rows are scannable.** Each row shows: Exercise Name | Weight (kg) | Reps | RPE | Type | Checkbox (Done)

✅ **Delete exercise is available.** An "X" or trash icon per exercise allows removing it if added by mistake.

⚠️ **No visual grouping of exercises by muscle.** All exercises are in a flat list, regardless of muscle group. This makes it harder to see what you've already hit for a given muscle at a glance.

### Form Input States
✅ **Set row inputs are visible and accessible.** Weight, reps, RPE, type fields are all present for quick data entry.

⚠️ **No visual indicator of which set is "current."** When resting between sets, which row should the user fill next? There's no highlight or label like "Current Set" or "Set 2 of 3."

⚠️ **Type selector (N, W, R, etc.) is unclear.** The abbreviations (N = normal? W = warmup? R = rest-pause?) are not labeled. Tooltips or a small legend would help.

### Session Control
✅ **DISCARD and FINISH buttons are prominent.** Both are clearly accessible at the top-right.

✅ **DISCARD is styled differently (darker/less emphasis) than FINISH.** Visual weight hierarchy reflects consequence: finishing is the normal path, discarding is a rare alternative.

⚠️ **No confirmation on DISCARD.** If the user has logged multiple exercises and accidentally clicks DISCARD, the data is lost. A "Are you sure?" modal would prevent mistakes.

⚠️ **FINISH behavior is not immediately obvious.** Does it save the workout to history? Does it sync to the server? Does it show a summary? The button doesn't explain what happens next.

---

## Accessibility (WCAG AA)

✅ **Keyboard navigation works throughout.** Tab moves through search input, exercise rows, set inputs, buttons. All interactive elements are reachable.

✅ **Color contrast is strong.** Light text (`#d9d4cf`) on dark background (`#1b1812`) achieves ~10:1 contrast, well above AA.

✅ **No reliance on color alone for status.** Sets that are "done" are marked with a checkbox (✓), not just a color change.

⚠️ **Type selector (N/W/R/S/T) is not labeled semantically.** Screen readers will read "N" without context. Add `aria-labels` or `<label>` elements to clarify what each abbreviation means.

⚠️ **Set row expandable icons (▼/▶) may not be clear to screen reader users.** The icon text content might read as a special character rather than "expand" or "collapse". Use `aria-expanded` and `aria-label="Expand exercise"` to clarify.

⚠️ **"+" prefix in section headers might confuse screen readers.** The literal "+" character might be read as "plus" without context that it signals expandability. Consider: `<span aria-label="Expandable section">+</span> Exercise Picker` or use a proper button with `aria-expanded`.

⚠️ **No focus indicators visible on buttons.** The DISCARD and FINISH buttons may not have a clear focus ring when navigated via keyboard. Test with Tab key to ensure focus is visible.

✅ **Reduced motion respected.** No animations on set entry, no timer animations, no transitions. Complies with `prefers-reduced-motion`.

---

## Typography

✅ **Font (JetBrains Mono) loads correctly.** No FOIT/FOUT flash observed.

✅ **Line length on exercise lists is short.** Exercise names typically 15–30 characters. Set data (weight, reps) are 2–5 characters. Readable at a glance.

⚠️ **No line-height specified for dense lists.** The default browser line-height (~1.2 for monospace) makes set rows feel cramped. Increasing to 1.4 or 1.5 would improve readability without sacrificing density.

⚠️ **Font size for set data is small.** Weights and reps are likely 12–14px. Acceptable for a focused user, but risky for accessibility (minimum recommendation is 16px for body text on mobile).

---

## Responsive Behavior

✅ **Mobile-first layout.** The column layout adapts: full-width on mobile, side-by-side panels on larger screens (if implemented).

✅ **Search input is full-width on mobile.** No horizontal scrolling.

⚠️ **Exercise list becomes very long on mobile.** With no grouping by muscle or collapsible sections, a typical 10-exercise workout becomes a 30+ row vertical scroll. On 375px width, scrolling fatigue is real.

⚠️ **Set data columns may stack poorly on mobile.** Weight | Reps | RPE | Type | Checkbox might wrap awkwardly at narrow widths. Test at 375px to verify.

✅ **Timer and session controls stay at the top.** Even while scrolling the exercise list, the session header remains visible. Good sticky positioning.

---

## Aesthetic Alignment

✅ **Purely text-driven, no visual fluff.** No progress rings, gradients, badges, animations, or illustrations. Pure data presentation.

✅ **Educated tone.** Uses "Set," "RPE," "E1RM," "Stimulus" — real terminology, no simplification for casual users.

✅ **Sensible structure.** Session timer → add exercises → log sets → finish. The order reflects the actual gym workflow.

✅ **Postmodern restraint.** Most fitness apps flood the user with motivational copy, achievement badges, and visual celebration. Press does the opposite: stern silence, data only. This is deliberate and alien to the category.

⚠️ **Stark aesthetic may feel isolating.** For a new user or someone seeking encouragement, the bare interface might feel clinical or unwelcoming. There's no "welcome," no "great session," no social feedback. This is a feature of the design philosophy, but worth acknowledging as a UX trade-off.

---

## Must Fix

1. **Confirmation dialog missing on DISCARD.**  
   **Issue:** Users can lose an entire workout session with a single click. No "Are you sure?" modal.  
   **Impact:** Data loss risk.  
   **Fix:** Add a confirmation modal: "Discard session? All logged data will be lost." with Cancel and Confirm buttons.

2. **Type selector abbreviations are undocumented.**  
   **Issue:** N, W, R, S, T are not labeled. Users unfamiliar with the notation won't know what they mean.  
   **Impact:** Accessibility failure; new users may input incorrect set types.  
   **Fix:** Add a help icon (?) with a popover or tooltip explaining: N = Normal, W = Warmup, R = Rest-pause, S = Straight set, T = Drop set (or whatever these abbreviations mean — verify the actual mappings).

3. **Focus indicators invisible on action buttons.**  
   **Issue:** DISCARD and FINISH buttons don't have clear focus rings when navigated via keyboard.  
   **Impact:** Keyboard users can't easily see which button is focused.  
   **Fix:** Add CSS focus styles: `button:focus { outline: 2px solid var(--accent); outline-offset: 2px; }` or equivalent. Test with Tab navigation.

---

## Should Fix

1. **No "current set" indicator.**  
   **Issue:** When multiple sets exist for an exercise, there's no clear indication of which one the user should fill next.  
   **Impact:** Minor UX friction; users might click the wrong row.  
   **Fix:** Highlight or subtly shade the next unfilled set (the first row where checkbox is unchecked). Or add a label like "Set 2 of 3" next to the checkbox.

2. **Exercise list has no muscle grouping.**  
   **Issue:** All exercises are in a flat list. A typical full-body session mixes chest, back, legs, arms — no visual organization.  
   **Impact:** Users can't quickly scan "have I hit quads yet?" without reading every exercise name.  
   **Fix:** Group exercises by muscle group with section headers (e.g., "— CHEST —", "— BACK —"). Collapsible sections per muscle to reduce scroll.

3. **Expand/collapse indicator doesn't toggle visually.**  
   **Issue:** The "+" prefix in "+ EXERCISE PICKER" etc. doesn't change to "−" when expanded. Users might not realize they can collapse.  
   **Impact:** Usability friction; space-conscious users may think sections are permanently expanded.  
   **Fix:** Change "+" to "−" on expand, and vice versa. Or use an icon: `▶ EXERCISE PICKER` → `▼ EXERCISE PICKER`.

4. **No pause session option.**  
   **Issue:** Real gym sessions have breaks (water, phone call, long rest). Users can only discard or finish; no pause.  
   **Impact:** Users mid-session might accidentally discard or feel forced to finish prematurely.  
   **Fix:** Add a "PAUSE" button alongside DISCARD/FINISH. Paused sessions resume on return; the timer is frozen.

5. **FINISH button behavior is opaque.**  
   **Issue:** Clicking FINISH sends the session to history, but there's no feedback about what happens next (summary screen, confirmation, redirect).  
   **Impact:** Users might click and wonder if it worked.  
   **Fix:** On FINISH, show a brief summary modal (e.g., "Session saved: 4 exercises, 45 min, 250 stimulus") with an "OK" button that dismisses it and returns to the dashboard.

---

## Could Improve

1. **Font size on set data is small for accessibility.**  
   Current size is likely 12–14px. Consider bumping to 14–16px for better readability, especially on mobile. Monospace is denser than proportional fonts, so the visual impact is less than it would be for serif text.

2. **Line height in exercise lists is tight.**  
   Current browser default (~1.2 for monospace) makes rows feel cramped. Increasing to 1.4 would improve readability. The trade-off is slightly more vertical space, but probably worth it for accessibility.

3. **Set row layout could be tabular.**  
   Currently, set data (weight, reps, RPE, type, checkbox) are laid out as inline fields. A true `<table>` with headers (Weight | Reps | RPE | Type | Done) would be more scannable and semantically correct for tabular data.

4. **Day ring date selector is not discoverable.**  
   (Not visible in current screenshot, but mentioned in codebase.) The "M T W Th F S S" day selector is a custom UI. It's unclear how to interact with it (click to select, visual feedback on selection). A clearer design would help: highlight selected day with background color, show a subtle border or underline, add a label like "Select workout date:".

5. **Session type display could show more info.**  
   "+ GROUP SESSION: SET GYM" tells you it's a group session at a specific gym. But what if the user wants to know who else is in the session, or switch gyms? Consider: clicking the session type badge opens a popover with options (leave group, change gym, etc.).

6. **No visual progress within a session.**  
   The timer runs, but there's no sense of how "full" the session is. A progress bar (time spent / planned duration) or a simple counter ("3 of 5 exercises done") would give users confidence they're on track.

---

## What Works Well

1. **Session persistence is robust.** Refreshing the page or navigating away doesn't lose your active workout. This is essential for real-world gym use (phone calls, accidental closes).

2. **Keyboard navigation throughout.** Tab moves seamlessly through all interactive elements. Power users can log a full workout without touching the mouse.

3. **Time tracking is always visible.** The timer at the top-left never disappears, even while scrolling. Users always know session duration.

4. **Three complementary ways to add exercises.** Search (for any exercise), Exercise Picker (browsable database), and Build buttons (for angle-based exercises) cover all user intents. No single path dominates.

5. **Restrained, honest empty state.** No motivational language, no "let's get to work!" hype. The blank session is presented as a fact, ready for the user to add exercises. Aligns perfectly with the postmodern, sensible philosophy.

6. **Integration with EMG and fatigue math is invisible.** Users see RPE, weight, reps — the same data they'd log on paper. But Press is silently computing stimulus, fatigue attribution, and muscle focus in the background. This invisible complexity is the highest form of respect for a trained athlete's mental model.

---

## Conclusion

The Workout Logger is a masterclass in utilitarian design. It strips away every decoration, every motivational flourish, every social feature that other fitness apps layer on top of basic data entry. The result is stark, sometimes forbidding, but deeply honest: here's your session, here's your data, add your exercises, log your numbers, finish. This aesthetic is perfectly aligned with Press's design philosophy. The component is highly functional and accessible for power users.

However, the stark design poses a discoverability risk for new users. The bare text, the abbreviations, the unconventional UI patterns (day ring, type selector) all require learning. For onboarding, consider adding tooltips or a guided tour to explain these patterns on first use. The core component is sound; the onboarding experience is where focus should shift next.

**Recommendation:** Ship as-is, but add the five "must fix" items (confirmation on DISCARD, type selector documentation, focus indicators, current set indicator, and FINISH feedback). These are quick wins that significantly reduce friction and accessibility gaps. The "should fix" and "could improve" items are worth a follow-up pass but not blockers.
