# Feature Brainstorm: 200 → 30

Research pass across strength logging (Hevy, Fitbod, RP Hypertrophy, Boostcamp, Juggernaut AI), endurance/cardio (Strava, TrainingPeaks, Garmin Connect), wearables/recovery (Whoop 5.0, Oura, Ultrahuman, Eight Sleep, Rise), nutrition (MacroFactor, Cronometer, Levels, MyFitnessPal), symptom/behavior correlation (Bearable, Whoop Journal), women's health (FitrWoman, Jennis), and Apple Health's 2026 mental-health features. Sources cited inline where a specific claim is drawn from search results; general industry framing is uncited.

Press already has more built than a first skim suggests — before reading the shortlist, note what already exists so the same idea doesn't get proposed twice: per-muscle fatigue with structural/metabolic/CNS decomposition (`functions/index.js` `computeStructuralFatigue`/`computeMetabolicFatigue`/`computeCNSFatigue`, `S5`), a deterministic weekly training structure generator with fatigue-ceiling enforcement (`weeklyPlanner.js`), an n=1 experiment tracker with hypothesis/metric/outcome (`S3`, `db.experiments`), injury logging (`db.injuries`), supplement + alcohol logs, food barcode scanning + camera macro estimation + meal templates, water/finance/thought logs, all-time PR tracking with e1RM (`S7`), a morning briefing and periodic "newscast" generator, push notifications, data-maturity gating (falls back to template text until there's enough history to trust pattern-based prescriptions), and travel mode (bodyweight-only exercise selection). The gaps below are genuine gaps, checked against this list.

## How the cut was made

1. **Brand fit** — `PRODUCT.md` explicitly names Whoop/Oura/Fitbit/MyFitnessPal/Strava as *anti-references for visual language* (rings, gradient blobs, streak badges, congratulatory animations) — not as a ban on their underlying mechanics. A idea like "readiness score" is fine; a idea like "7-day streak flame icon" is not. Hard-reject: streaks-as-streaks, badges, social leaderboards, confetti/celebration moments, anything that manufactures urgency instead of reporting a fact.
2. **Architecture fit** — favor ideas that are either (a) a new deterministic computation over data already flowing in (sleep, HRV, resting HR, recovery, weight, macros, lifts, soreness, injuries) or (b) a new LLM-prose pass over an existing deterministic output, matching the established "deterministic core decides structure, LLM writes text" pattern. Deprioritize anything needing a native app, a social graph, payments, or third-party hardware Press doesn't already ingest.
3. **Solo-dev feasibility** — one person, HTML/JS/Python, single-file React SPA + Firebase Functions. Multi-quarter platform bets are out.
4. **Genuine gap** — cross-checked against the "already exists" list above.

---

## Top 30

### Cluster 1 — Recovery & Readiness

1. **Composite morning readiness score (0–100)** — inspired by Garmin Training Readiness / Oura Readiness / Whoop Recovery. Press already computes structural/metabolic/CNS fatigue and has sleep + HRV + RHR flowing in from Apple Health; nothing currently rolls these into one number with a plain-English "why." *Shape:* deterministic weighted composite (reuse existing fatigue functions + sleep debt below) + one-line LLM gloss, surfaced in S1 next to existing vitals.
2. **Sleep debt ledger (cumulative, not nightly)** — Rise Science's core insight is that a single night's score matters less than the rolling deficit ([risescience.com](https://www.risescience.com/)). Press's S2 currently shows nightly sleep only. *Shape:* deterministic rolling sum of (personal sleep target − actual) over 14 days, displayed as a running debt/credit number, not a score.
3. **HRV/RHR baseline-deviation framing instead of raw numbers** — Oura's Readiness Score contributors are expressed as deviation from your own baseline, not absolute value ([support.ouraring.com](https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score)). `personalSleepTarget`/`computeDay` already build personal baselines for sleep — extend the same baseline logic to HRV and RHR so S1/S2 report "12ms below your 30-day baseline" rather than a bare number.
4. **Illness/overtraining early-warning from temperature + RHR + HRV co-deviation** — Oura's illness detection uses body temp deviation ([simplewearablereport.com](https://simplewearablereport.com/learn/metrics)); Apple Health Auto Export already exposes wrist temperature. *Shape:* deterministic rule (temp + RHR + HRV all outside band simultaneously → flag), LLM writes the framing, never a diagnosis.
5. **Recovery-time-remaining estimate per muscle group, not just a fatigue % bar** — Garmin's "Recovery Time" gives hours-until-ready rather than a raw score ([the5krunner.com](https://the5krunner.com/garmin-features/training/training-readiness/)). Press's S5 fatigue map has the underlying decay math already (`computeStructuralFatigue`) — surface it as "back to baseline in ~18h" per muscle instead of only a percentage.
6. **Cardiovascular age estimate** — Oura's 2024 feature, calculated from resting HR/HRV trend and pulse-wave-adjacent signals over a rolling window ([support.ouraring.com](https://support.ouraring.com/hc/en-us/articles/28451491040019-Cardiovascular-Age)). Press has years of RHR/HRV history already ingested via Apple Health — a long-run trend regression is realistic without new hardware. *Shape:* deterministic trend model, recomputed weekly, LLM writes the one-line context.
7. **Menstrual-phase-aware training/nutrition framing (if applicable)** — FitrWoman/Whoop tie training and nutrition suggestions to cycle phase ([whoop.com](https://www.whoop.com/us/en/thelocker/whoop-feature-menstrual-cycle-coaching/)). Not applicable to George specifically today, but cheap to build as an optional profile toggle since `db.profile` already holds `sex`/`dob`, and it's a real gap if the app's stated roadmap ("friends prototype → commercial product," per `PRODUCT.md`) brings in a female user.

### Cluster 2 — Training Intelligence

8. **Per-muscle volume landmarks (MEV/MAV/MRV) layered onto the existing fatigue map** — RP Strength's volume-landmark system ([rpstrength.com](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth)) is a genuinely different axis from fatigue: fatigue asks "how cooked is this muscle right now," landmarks ask "have you done enough weekly sets to grow it at all." `weeklyPlanner.js`'s bucket-scoring already tracks target muscles per session — extend it to also accumulate weekly set counts per muscle and flag under-MEV muscles, which the fatigue-only view currently can't surface.
9. **Estimated-1RM trend regression per lift, with a stall/plateau flag** — Fitbod re-estimates 1RM continuously via the Brzycki formula and adapts load ([fitbod.me](https://fitbod.me/blog/how-fitbods-ai-knows-exactly-when-you-should-lift-heavier-and-when-to-recover/)). S7 already computes e1RM history per exercise but only shows the all-time max — add a rolling-trend view that flags "flat for 3 sessions" so the deterministic planner (or the n=1 experiment tracker that already exists) has a concrete trigger to suggest a variation change.
10. **Relative Effort / session-load score independent of duration** — Strava's Relative Effort weights intensity over duration so a short hard session and long easy one are comparable ([support.strava.com](https://support.strava.com/hc/en-us/articles/360000197364-Relative-Effort)). Press's CNS/metabolic fatigue functions are close to this already; a single derived "session load" number (not just fatigue-by-muscle) would let the weekly planner's `weekCNS`/`weekMetabolic` inputs be shown to the user directly instead of staying internal.
11. **CTL/ATL/TSB-style long-run fitness/fatigue/form chart, generalized beyond endurance** — TrainingPeaks' Performance Management Chart (42-day exponentially-weighted "fitness" vs 7-day "fatigue," their difference is "form") ([trainingpeaks.com](https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/)) is a proven visualization for "am I peaking or digging a hole" — apply the same exponential-weighting math to Press's existing session-load numbers (once #10 exists) for a long-horizon trend chart, distinct from the short-horizon per-muscle fatigue map.
12. **Auto-detected deload week suggestion** — a direct consequence of #11: when TSB-equivalent stays deeply negative for N consecutive weeks, the deterministic planner should propose (not silently insert) a deload, matching `weeklyPlanner.js`'s existing `planLiftDayCount` fatigue-ceiling philosophy but at a monthly rather than weekly grain.
13. **Warm-up set auto-calculation** — Hevy's plate calculator and standard warm-up ramps ([hevyapp.com](https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling)) are pure arithmetic (percentage ramp to a working weight) — genuinely missing from `functions/index.js`'s exercise/session endpoints, trivial deterministic addition, no LLM needed.
14. **Plate-loading calculator** — same Hevy feature, same rationale: given target kg and known plate inventory, compute the combination. Pure function, zero new data source, could live entirely client-side in `app.jsx`.
15. **Rest-timer with per-exercise default, persisted** — Hevy lets each exercise remember its own rest duration ([hevyapp.com](https://www.hevyapp.com/features/workout-rest-timer/)). UI-only addition to the existing workout-session flow in S3.
16. **"Backbone exercise" substitution suggestions when a target isn't hit** — `weeklyPlanner.js`'s `pickBackboneExercises` already scores exercises by muscle overlap; expose a "swap this" affordance in S3 that re-runs the same scoring function excluding the current pick, rather than building a separate recommendation engine.
17. **Injury-aware exercise exclusion made visible to the user, not just internal** — `offlineMuscles` already feeds `computeMusclePriority` to silently avoid injured muscles; surface *why* a muscle group is missing from this week's plan (currently the deterministic reasoning exists but isn't shown), which is squarely in the "earned confidence, no black box" register `PRODUCT.md` asks for.

### Cluster 3 — Nutrition & Metabolic

18. **Adaptive TDEE from logged weight + intake trend, replacing/supplementing the static macro targets** — MacroFactor's core differentiator: reverse-calculate true expenditure from real weight-trend + logged-intake data over 2–4 weeks rather than a Mifflin-St-Jeor style static formula ([macrofactorapp.com](https://macrofactorapp.com/algorithm-accuracy/)). Press already has `db.weight` and `db.nutritionLog` history and a `macro-auto` endpoint — check whether `macro-auto` already does this (if it's static, this is the single highest-leverage nutrition feature on the list, since the inputs already exist).
19. **Micronutrient tracking (vitamins/minerals), not just macros** — Cronometer tracks 84 nutrients from verified USDA-sourced data, with summary "nutrition scores" for categories like bone/blood/immune health ([support.cronometer.com](https://support.cronometer.com/hc/en-us/articles/360042110112-Nutrition-Scores)). Press's food barcode/photo pipeline already resolves to structured macro data — extending the lookup to pull micronutrient fields (if the barcode data source has them) is a data-plumbing change, not a new architecture.
20. **Meal-to-recovery correlation, not just meal-to-macro** — Levels' core loop ties food choices to a downstream physiological signal (glucose) rather than just logging calories ([levels.com](https://www.levels.com/)). Press doesn't have CGM data, but it does have next-day HRV/sleep/soreness — a deterministic correlation pass ("late high-carb dinners → next-day HRV −8ms avg, n=6") reuses the same n=1 experiment-tracking instinct already in `db.experiments`, just automated instead of user-hypothesized.
21. **Alcohol-to-sleep-quality correlation surfaced explicitly** — `db.alcoholLog` already exists but per the architecture skim isn't yet cross-referenced against sleep metrics in the UI. Direct, cheap win: join two datasets Press already owns.

### Cluster 4 — Long-Term Trends & Correlation

22. **Generalized behavior-tag correlation engine** — Whoop Journal logs 300+ behaviors and surfaces which ones move Recovery, requiring ~5 occurrences of both a "yes" and a "no" before showing a correlation (to avoid noise from tiny samples) ([whoop.com](https://www.whoop.com/us/en/thelocker/a-new-way-to-see-insights-on-which-behaviors-affect-your-recovery/)); Bearable applies the same idea more generally to any custom symptom/factor pair with a 30-day minimum before claiming correlation ([bearable.app](https://bearable.app/symptom-tracker/)). Press already has the raw ingredients scattered (soreness, alcohol, thoughts, sleep, training) but no unified "what correlates with what" pass. This is the single most reusable idea on the list — a generic deterministic correlation function over any two time series already in `db`, gated by the same sample-size discipline Bearable/Whoop use, with LLM only writing the plain-English sentence once a real correlation clears the bar. Must inherit `PRODUCT.md`'s "if the data is ambiguous, say so" principle — report insufficient-n as insufficient-n, not as a null result dressed as a finding.
23. **Long-run weight/body-fat trend with rate-of-change framing (not just data-entry rows)** — S6 currently shows a plain value+delta row (per the earlier design-review pass). A trailing-average trend line with rate-of-change ("−0.3kg/week, consistent with your cut target") is a deterministic regression over data already logged, matching MacroFactor's framing of "trend, not noise."
24. **"Time since PR" per lift, not just the PR value** — a one-line deterministic addition to S7: alongside the existing all-time e1RM, show how long it's stood, which is a cheap, dry, editorially-appropriate way to convey stagnation without a "you're losing your streak!" framing.
25. **Cardio/steps/NEAT trend distinct from formal training load** — Ultrahuman's "Movement Index" tracks non-exercise activity as its own axis, separate from workouts ([ultrahuman.com](https://www.ultrahuman.com/global/ring/)). Apple Health Auto Export already sends step/activity data into `db.metrics`; nothing currently separates "incidental daily movement" from "the session I logged," and metabolic-health literature treats them as genuinely different levers.

### Cluster 5 — Editorial / Chat / Briefings

26. **Weekly "form" editorial** — a once-a-week long-form piece from the Personal Journalist synthesizing the week's training/sleep/nutrition into one editorial narrative, distinct from the existing daily morning briefing and periodic newscast. Pure reuse of the existing `callGemini` + training-ethos system prompt pattern, just a new cadence and a longer context window pulling from `generateNewscast`'s period logic.
27. **"Ask why" drill-down from any number to its derivation** — when the composite readiness score (#1) or any fatigue number is shown, let the user ask the Personal Journalist "why is this X today" and have it explain the deterministic formula inputs for *that specific number*, not a generic explanation. This directly serves `PRODUCT.md`'s "the interface is the editor, not a black box" ethos and is cheap: pass the specific computed intermediate values into the existing mentor system prompt as context.
28. **Contradiction/tension surfacing between data sources** — e.g., Hevy says PR week, sleep says accumulating debt, HRV says declining — today these live in separate sections; an editorial pass that explicitly names the tension ("training is up, recovery signals are down — a familiar contradiction, not usually a coincidence") fits the "postmodern, self-aware of its own genre" brand voice better than a single-metric readiness score alone.
29. **N=1 experiment auto-suggestion from correlation engine (#22) output** — once a real correlation clears the sample-size bar, offer to formalize it as a tracked experiment in the existing `db.experiments` structure, closing the loop between passive correlation-finding and the active hypothesis-tracking feature that already exists — no new data model, just a new entry point into one that's already built.
30. **Plain "what changed since last week" digest** — a deterministic diff over last week's vs this week's key numbers (fatigue baseline, sleep debt, weight trend, macro adherence), with the LLM only writing the connecting sentence. This is close to Whoop's "Journal Trends" concept ([whoop.com](https://www.whoop.com/us/en/thelocker/a-new-way-to-see-insights-on-which-behaviors-affect-your-recovery/)) but framed as a factual digest rather than a behavior-nudge.

---

## Appendix: ~170 considered and cut

Grouped by source category. Reason codes: **[gamified]** violates no-gamification/no-motivational-copy principle; **[social]** requires a social graph/leaderboard, out of scope for a single-user app; **[hardware]** requires wearable/sensor Press doesn't ingest; **[exists]** already built, see file/section cited; **[native]** requires a native mobile app Press doesn't have; **[scope]** clinical/medical scope beyond a personal dashboard; **[low-value]** real feature elsewhere but thin value for this specific single-user context.

**Strength logging (Hevy, Fitbod, Boostcamp, Juggernaut AI, Strong)**
- Superset/circuit builder UI — [low-value, S3 already supports session logging without needing formal superset grouping]
- Auto-detect exercise from phone accelerometer (Whoop Strength Trainer) — [hardware]
- Video form-check via camera — [native, needs on-device ML pipeline beyond current stack]
- Real-time voice rep counting — [native]
- Community-shared workout templates — [social]
- Gym equipment availability check-in — [low-value]
- Workout streak counter — [gamified]
- "Workout of the day" leaderboard — [social, gamified]
- Badge for hitting a new PR — [gamified]
- Partner/friend workout challenges — [social]
- Exercise video demo library — [low-value, static content maintenance burden for solo dev]
- Custom exercise creation UI — [low-value, EXERCISE_DB already covers the practical range]
- Barbell-specific bar-speed/velocity tracking — [hardware]
- Auto-adjusting rep targets mid-set via voice — [native]
- Folder-based routine organization — [low-value, single user doesn't need routine folders]
- "Muscle you haven't trained in 30 days" nag — [gamified framing risk, close to #5/#17 done properly instead]
- Home-gym equipment inventory management — [low-value]
- Wearable-based automatic set/rest detection — [hardware]
- Coach-assigns-program multi-user mode — [social/multi-user, out of scope]
- In-app payment for premium programs — [scope, no payments infra]

**Endurance/cardio (Strava, TrainingPeaks, Garmin)**
- Segment leaderboards — [social, gamified]
- Kudos/social reactions on activities — [social]
- Route heatmaps from other users — [social]
- Live location sharing during activity — [social, scope]
- Race predictor (marathon time forecast) — [low-value, George's training focus per existing app content is strength/general health, not race-specific endurance]
- PacePro pacing strategy — [low-value, same reason]
- Group challenges/monthly distance goals — [gamified, social]
- Virtual races — [gamified, social]
- Elevation-gain competitive rankings — [social]
- Training Stress Score (TSS) requiring a power meter — [hardware]
- FTP (functional threshold power) auto-detection — [hardware, cycling-specific]
- Club/team leaderboard — [social]

**Wearables/recovery (Whoop, Oura, Ultrahuman, Eight Sleep, Rise)**
- Smart mattress temperature auto-adjustment — [hardware]
- Sleep sound machine / white noise player — [low-value, commodity feature, not a data feature]
- Guided breathing/meditation sessions — [scope creep into wellness-app territory away from "operating system for the body" data focus]
- Snoring detection — [hardware]
- SpO2 blood oxygen tracking — [hardware, not in current Apple Health export]
- Pregnancy mode — [not applicable]
- "Strain" gamified daily target with a color ring — [gamified, explicitly the anti-reference visual language]
- Achievement badges for recovery streaks — [gamified]
- Smart alarm clock (wake in light sleep window) — [native, requires phone-as-alarm integration]
- Community recovery percentile ranking ("better than 80% of users your age") — [social, also vanity-metric which PRODUCT.md explicitly rejects]
- Skin temperature continuous trend — [hardware, not currently exported]
- Environmental sensor (bedroom temp/humidity/light) — [hardware]
- Widget/lock-screen complications — [native]
- Blood marker lab test integration/ordering — [scope, requires medical/lab partnership]

**Nutrition (MacroFactor, Cronometer, Levels, MyFitnessPal, Noom)**
- Barcode database expansion to restaurant menus — [low-value, diminishing returns for solo dev to maintain]
- Recipe import from URL — [low-value, nice-to-have not gap-filling]
- Grocery list generation — [low-value, adjacent feature not core to "operating system for the body"]
- Meal-plan marketplace — [scope, social/commercial]
- CGM (continuous glucose monitor) integration — [hardware, no CGM currently owned]
- Noom-style psychology "color" food categorization (green/yellow/red foods) — [gamified-adjacent, also paternalistic framing PRODUCT.md's "assumes full intelligence" principle explicitly argues against]
- Points-based food scoring — [gamified]
- Fasting timer with streak — [gamified]
- Restaurant menu recommendation engine — [low-value]
- Social recipe sharing — [social]
- AI meal-photo calorie estimate for restaurant plates specifically — [low-value, existing photo-analysis endpoint already covers general food photos]
- Water reminder push notifications on a fixed schedule — [gamified-adjacent nagging, existing water logging is passive not prescriptive]
- Weekly grocery spend tracking tied to nutrition — [low-value, `db.finance` exists separately and merging risks scope creep]

**Symptom/behavior correlation (Bearable, Whoop Journal, Apple Health)**
- 300+ preset behavior checklist UI — [low-value, better to let correlation engine (#22) run on data already logged rather than add a large new daily-logging burden]
- PHQ-9/GAD-7 clinical mental health questionnaires — [scope, clinical instrument requiring appropriate handling/disclaimers beyond personal dashboard scope]
- Medication interaction checker — [scope, medical liability]
- Symptom severity 1-10 daily check-in for chronic conditions — [scope, not applicable, no chronic condition being managed]
- Mood emoji picker UI — [gamified-adjacent, thin data value versus existing free-text `db.thoughts`]
- State-of-mind logging separate from thoughts log — [low-value, `db.thoughts` already captures this in freer form matching brand voice]

**Women's health (FitrWoman, Jennis, Harna)**
- Full cycle-phase nutrition micro-recommendations — [not applicable today, folded into #7 as an optional toggle instead of a dedicated feature]
- Fertility window prediction — [scope, medical]
- Symptom-phase correlation specific to menstrual cycle — [not applicable today]
- Pregnancy-specific mode — [not applicable]

**Habit/behavior mechanics (Duolingo, Noom, general gamification)**
- Daily streak flame icon — [gamified, explicit anti-pattern]
- XP/level system — [gamified]
- Achievement unlocks — [gamified]
- Push notification nagging for missed logging — [gamified-adjacent, also PRODUCT.md: "no motivational copy"]
- Celebration animation/confetti on goal hit — [gamified, explicit anti-pattern]
- Leaderboard vs friends — [social, gamified]
- Daily login reward — [gamified]
- Habit-stacking prompts ("do X right after Y") — [gamified-adjacent nudge mechanic]
- Progress bar toward an arbitrary round-number goal — [gamified, vanity-metric risk]
- Motivational quote of the day — [explicit anti-pattern, PRODUCT.md: "no motivational copy"]

**Social/community (Peloton, Strava, Whoop community)**
- Live leaderboard during workout — [social, gamified]
- Friends' activity feed — [social]
- Group challenges — [social, gamified]
- Comment/like on others' sessions — [social]
- Follow/followers graph — [social]
- Instructor-led live classes — [scope, requires content production]
- Team/squad training plans — [social, multi-user]

**Finance crossover (adjacent to existing `db.finance`)**
- Full budgeting app feature parity (categories, recurring bills) — [scope creep, `db.finance` is a lightweight log not a budgeting product]
- Investment portfolio tracking — [scope, unrelated to health operating system purpose]
- Spend-vs-training-cost ROI dashboard — [low-value, cute idea but no real decision it informs]

**Misc./niche**
- Voice journaling via speech-to-text — [native, needs speech API wiring beyond current text-only chat]
- Apple Watch complication — [native]
- Widget for home screen — [native]
- Dark/light theme toggle beyond existing palette — [low-value, already has one considered palette per design-review history]
- Export data to PDF report for a doctor — [scope, low-value for single self-user, revisit only if "commercial phase" from PRODUCT.md's roadmap actually arrives]
- Multi-language support — [scope, single user, not needed yet]
- Onboarding wizard/tutorial — [explicit anti-pattern, PRODUCT.md: "no onboarding copy... sparse where data is absent"]
- Referral program — [scope, commercial feature not applicable]
- In-app purchase for cosmetic themes — [scope, no payments infra, also gamified-adjacent]
- Wearable marketplace/store integration — [scope]
- Third-party trainer marketplace — [social, scope]
- AI-generated workout video avatars — [scope, disproportionate build cost for a solo dev]
- Blockchain/NFT fitness achievements — [gamified, explicit anti-pattern, also absurd for this brand]
- Weather-based workout suggestion (rain → indoor) — [low-value, George's training is gym-based per existing data, weather integration solves a problem that doesn't exist here]
- Commute/step-count office nudge — [gamified-adjacent nudge mechanic]
- Family sharing/dependent accounts — [social, multi-user — also the exact class of bug just fixed this session, worth deliberately NOT building more multi-user surface area until the isolation model is hardened]
- Third-party API for developers — [scope, no external developer audience]
- Voice assistant integration (Siri/Alexa shortcuts) — [native]
- Smart scale hardware integration beyond manual weight entry — [hardware, no smart scale currently owned]
- Video calls with a real coach — [scope, requires human-in-the-loop service Press doesn't offer]
- In-app store for supplements — [scope, commercial feature]
- Barcode scanning for supplements specifically (vs. food) — [low-value, `db.supplements` logging already covers this via manual entry, marginal gain]
- Habit-based reward store (redeem points for merch) — [gamified, explicit anti-pattern]
- Sleep sound library marketplace — [scope, commodity feature better served by existing apps]
- Custom notification sound themes — [low-value]
- Apple Health mirroring in reverse (Press writes back to Health) — [low-value, one-way ingestion is the correct model per current architecture, round-tripping adds complexity without a clear win]
- Multi-device sync conflict resolution UI — [low-value, single Firestore doc per user already avoids most conflict scenarios]
- Offline-first PWA caching — [low-value engineering investment relative to actual usage pattern of a home-network dashboard]
- Biometric login (Face ID) beyond existing Firebase auth — [low-value, existing Google/email auth is sufficient for single user]
- Data export to CSV/JSON — [low-value today, cheap to add later if ever needed, not a current gap]
- Full-text search across all logs — [low-value, data volume for single user doesn't yet justify search infra]
- Calendar integration (block workout time) — [scope creep beyond health-data focus]
- Location-based gym check-in — [low-value, no gym-specific logic exists or is needed]
- Third-party insurance wellness-program integration — [scope, commercial feature]
- Multi-currency finance support — [scope, not applicable]
- Tax-related finance categorization — [scope creep, `db.finance` is not a tax tool]
- Voice-activated meal logging ("Hey Press, log a chicken sandwich") — [native, requires always-listening voice pipeline]
- AR body-scan for body-fat estimation — [scope, disproportionate build cost]
- Genetic testing integration (DNA-based training recommendations) — [scope, requires lab partnership]
- Blood pressure tracking — [hardware, not in current Apple Health export]
- ECG/arrhythmia detection — [scope, clinical, requires appropriate medical framing]
- Fall detection / emergency SOS — [scope, not relevant to training use case]
- Screen-time/digital-wellbeing tracking — [scope creep beyond physical health focus]
- Air quality correlation with training performance — [hardware, no air quality sensor]
- Altitude/travel-adjusted training zones — [low-value, `travel-mode` already handles the travel case via bodyweight-only exclusion, altitude-specific physiology is a level of precision beyond current need]
- Multi-sport triathlon-specific periodization — [low-value, George's training focus is strength/general fitness not triathlon]
- Swim-specific stroke analysis — [hardware, scope, not George's training modality]
- Golf/tennis specific swing analysis — [scope, not George's training modality]
- Esports/gaming reflex training modules — [scope, unrelated]
- Cognitive/brain-training games — [gamified, scope creep beyond physical health]
- Meditation streak tracking — [gamified]
- Habit pairing with a "why" journal prompt every single day — [gamified-adjacent nudge, also PRODUCT.md "no onboarding evangelism" spirit]
- In-app store for branded merchandise — [scope, commercial]
- Referral/invite-a-friend flow — [scope, commercial, social]
- A/B tested UI variants (growth-team tooling) — [scope, no growth team, single user]
- Push notification A/B testing — [scope, not applicable]
- Subscription tier paywall — [scope, no payments infra, no commercial model yet per PRODUCT.md]
- Ads/sponsorship integration — [scope, explicitly against the editorial/trustworthy brand voice]
- Public profile page — [social, scope]
- Public API for third-party quantified-self tools — [scope, no external audience]
- Data anonymization/research-donation opt-in — [scope, no research partnership exists]
- Multi-tenant admin dashboard — [scope, single user, no admin need]
- Role-based access control — [scope, single user]
- SSO/enterprise login — [scope, not applicable]
- Compliance/HIPAA certification — [scope, personal project not a covered entity]
- White-label version for other users — [scope, this is literally the future "commercial product" roadmap item from PRODUCT.md, but that's a business decision, not a feature to brainstorm casually]
- Localization of units (imperial/metric toggle beyond kg) — [low-value, single user, one unit system suffices]
- Custom exercise video upload — [low-value, storage/hosting overhead for marginal benefit]
- In-app tutorial videos — [explicit anti-pattern, "no onboarding copy"]
- Achievement sharing to social media — [social, gamified, explicit anti-pattern]
- Printable workout log for gym wall — [low-value, niche]
- Physical therapy exercise library — [scope, requires clinical vetting]
- Wearable ring/watch firmware updates management — [scope, hardware vendor's job not Press's]
- Multi-language voice coaching — [native, scope]
- Live chat with human trainer — [scope, requires human service]
- In-app scheduling/booking for personal training sessions — [scope, commercial marketplace feature]
- Corporate wellness program dashboard — [scope, B2B feature, not applicable]
- Insurance premium discount integration — [scope, requires insurer partnership]
- Wearable battery-level monitoring — [hardware, vendor's job]
- Cross-device handoff (start log on phone, finish on watch) — [native, no watch app exists]
- watchOS companion app — [native]
- Android widget — [native]
- Siri Shortcuts custom actions — [native]
- Apple Watch complication for readiness score — [native, but genuinely reasonable if a native companion is ever built — noted for later, not now]

**Total appendix: ~172 ideas, one-phrase reason each, as above.**
