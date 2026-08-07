# Cycling & Swimming Subsystem Scientific Foundation

Extends `RUNNING_SCIENCE.md`'s subsystem to Cycling (S12), Swimming (S13),
Sport (S14) and Aerobic (S15) rather than duplicating it — most of the
running engine turned out to be genuinely sport-agnostic (TRIMP and ACWR
are explicitly documented there as "validated across endurance sports" /
"cross-sport proven," not running-only claims). This file documents what's
reused unmodified, what's new, and why — every formula here is cited the
same way `RUNNING_SCIENCE.md`'s is: a real published source, applied, not
an invented heuristic.

## Reused unmodified from the running engine

No new code, no changes to the cited files — imported directly:

- **Readiness** (`computeRunningReadiness`/`readinessLabel`, `runningReadiness.js`) — takes `(baseRecoveryScore, acwr)`, nothing running-specific inside.
- **Session-type selection** (`sessionTypeByReadiness`, `runningRecommendation.js`) — polarized 80/20 logic keyed on neutral labels (easy/steady/tempo/interval/recovery/rest).
- **HR zones** (`karvonen5Zones`, `estimateMaxHeartRate`, `runningPrescription.js`) — Karvonen-formula, generic; used for Swimming always, and for Cycling on days without a power meter.
- **ACWR** (`coupledAcwr`, `fatigue.js`) — Williams et al. 2017's 7-day/28-day decay constants, generic on any `{date: load}` map.
- **8-week VO2max dose-response model** (`predict8WeekVO2Gain`, `runningPrediction.js`) — takes weekly load numbers + current VO2max, not running mechanics. *(Not currently wired into a Cycling/Swimming forecast — see Known gaps below.)*
- **Distance-spike / long-session-% detection** (`detectSessionDistanceSpike`, `computeLongRunPercentage`, `runningLoad.js`) — operate on generic `{date, durationMin, distanceKm}` fields.
- **TRIMP load** (`dailyLoadsFromRuns`, `runningLoad.js`) — duration × HR-reserve-based impulse (Banister 1991, Morton et al. 1990). Swimming's load/ACWR model throughout; Cycling's fallback on days without a power meter.
- Apple Watch VO2max reading — systemic, valid regardless of which sport triggered it.

## Cycling: real power data, not a HR-only approximation

Strava's `/athlete/activities` response (the same endpoint `syncStrava`
already calls) includes `average_watts` and `device_watts` — `device_watts:
true` means a real power meter; `false` means Strava's own speed/grade
estimate, not trustworthy for a physiology formula. Only `true` readings
feed anything below (`stravaParsing.js` captures both fields as `avgWatts`/
`hasPowerMeter`).

**FTP (Functional Threshold Power)** — `estimateFTP`, `cyclingPower.js`.
Coggan & Allen's standard anchor for cycling training zones (*Training and
Racing with a Power Meter*, VeloPress). Best 20-minute-plus power-meter
effort at genuine threshold intensity (`avgHeartRate ≥ 0.85 × maxHR`, in
the last 90 days — the same "detect a hard effort, don't require a formal
test" heuristic `vdotTrend` uses for running's VDOT), scaled by the
standard 95%-of-best-20-min convention.

**Power zones** — `cogganPowerZones`. Coggan's published 7-zone model as %
of FTP: Active Recovery (<55%), Endurance (56–75%), Tempo (76–90%),
Threshold (91–105%), VO2max (106–120%), Anaerobic (121–150%), Neuromuscular
(>150%).

**Load / ACWR** — `dailyLoadsFromPower`/`computeRideTSS`. Standard TSS
(Training Stress Score): `duration(hr) × intensityFactor² × 100`, where
`intensityFactor = avgWatts/FTP` — algebraically equivalent to the
canonical `(sec × NP × IF)/(FTP × 3600) × 100` formula given `NP =
avgWatts` here. Using Strava's `average_watts` rather than true Normalized
Power (fetched via a per-activity detail call, not on the list endpoint
`syncStrava` uses) — deliberate, avoids multiplying Strava API usage
against its rate limits for heavy cycling volume. Feeds the same
`coupledAcwr` running and lifting already share.

**Efficiency Factor** — `computePowerEfficiencyFactor` (avgWatts/avgHeartRate,
the actual metric TrainingPeaks and similar coaching tools call EF), with
`computeSpeedEfficiencyFactor` (km/h ÷ HR) as the fallback on days without a
power meter.

**VO2max** — `estimateCyclingVO2maxFromRides`, `vo2max.js`. VO2 at FTP via
the ACSM leg-ergometry equation (ACSM's *Guidelines for Exercise Testing
and Prescription* — standard textbook formula):

```
VO2 (mL/kg/min) = 11.0 × Watts / bodyMassKg + 7
```

That's VO2 *at* threshold, not VO2max — threshold sits at roughly 85% of
VO2max in trained individuals (Coyle et al. 1988; Faria, Parker & Faria
2005, a cycling-physiology review), so `VO2max ≈ VO2atFTP / 0.85`, an
approximation in the same spirit as Daniels' own duration→%VO2max curve for
running. Slots into `resolveVO2max`'s existing `calculatedVDOT` argument
with its own `source: 'cycling-ftp'` (so the UI correctly labels it
"Estimated from FTP" rather than running's "Estimated from pace" —
`resolveVO2max`'s medium-confidence branch reads `calculatedVDOT.source`
when the caller sets one, defaulting to `'daniels-vdot'` for backward
compatibility with running's own untouched call sites).

No power meter on any qualifying ride → every one of the four falls back to
its HR-only counterpart (Karvonen zones, TRIMP load, speed-based EF,
HR-ratio VO2max below) — the same degrade-gracefully pattern running
already uses for missing pace/VO2max data.

## Swimming: HR-only, honestly

No power, no pace-per-length from Strava, and no validated non-lab formula
analogous to Daniels VDOT for swimming — the real one, Critical Swim Speed,
needs a deliberate two-time-trial protocol (typically 200m + 400m
time trials) that can't be inferred from casually logged swims. Not
inventing a substitute formula. Swimming gets:

- HR zones (`karvonen5Zones`, imported) with a **10bpm downward offset** on
  max HR — McArdle, Glaser & Magel (1971) measured maximal HR ~13bpm lower
  during free swimming than treadmill running in trained swimmers
  (horizontal body position, reduced venous return/cardiac output demand),
  a finding widely re-cited since in exercise-physiology texts. Used
  conservatively here (10bpm, not the study's own ~13bpm) since that
  cohort was competitive-swimmer-specific and a general athlete's true
  offset likely sits lower.
- TRIMP load/ACWR (`dailyLoadsFromRuns`, imported directly).
- Its own Efficiency Factor: `computeSwimEfficiencyFactor` (m/min ÷ HR,
  `enduranceLoad.js`), with pace displayed in swimming's actual convention
  (`formatSwimPacePer100m`: min:sec/100m), not running's min/km.
- Whatever tier the shared VO2max fallback chain below resolves to — never
  better than `low`, since there's no swimming-specific medium-confidence
  source.

## Sport & Aerobic: one shared computation, honestly

`functions/sportClassifier.js`'s `classifySportType` only distinguishes
`'cycling'`/`'swimming'`/`'other'` — everything else Strava logs (a
five-a-side match, a hike, a Pilates class, rock-climbing) lands in
`'other'`. Sport and Aerobic are both just labels a user picks for that same
catch-all bucket; there's no Strava field or principled heuristic that
splits "Sport" activities from "Aerobic" ones (is indoor rowing a sport or
aerobic conditioning? there's no real answer). Rather than fabricate a
classification, both panels (S14, S15) render off the **exact same**
`buildGeneralRecommendation` computation and the same `/general/recommendation`
route — picking both activities just shows the same session history twice,
under two labels. HR zones + TRIMP load/ACWR only (`buildEnduranceRecommendation`
called with `sport: 'general'`, no swim-style max-HR offset since there's no
equivalent land-vs-water physiology difference to correct for); no
efficiency-trend metric either — there's no universal speed/pace unit
across this bucket (a distance means something for a hike, nothing for
Pilates).

## Self-calculated VO2max: the shared bottom-of-chain fallback

`resolveVO2max` (`vo2max.js`) already prefers Apple Watch, then a
sport-specific `calculatedVDOT` (Daniels for running, FTP-based for
cycling, nothing for swimming). It gains exactly one more tier, reached
only when nothing better exists for any sport: the **Heart Rate Ratio
method** (Uth, Sørensen, Overgaard & Pedersen, 2004, *European Journal of
Applied Physiology*):

```
VO2max ≈ 15.3 × (HRmax / HRrest)
```

No pace or power needed at all — the one estimate that works for every
sport. Deliberately the *weakest* of the self-calculated methods here: the
original validation was in a narrow young-athlete sample, and replication
studies in general populations show far wider variance (r as low as ~0.5)
than Daniels VDOT's r>0.95 or the ACSM power-based estimate above — always
`low` confidence, never medium or high.

Chain: Apple Watch (`high`) → sport-specific `calculatedVDOT` (`medium`) →
HR-ratio (`low`) → EF-trend proxy (relative only, no absolute number) →
nothing. New branch added after the existing ones — every current call
site keeps its exact prior behavior when better data exists.

## Cardio Score

`cardioStandards.js`'s `computeCardioScore` mirrors `strengthStandards.js`'s
per-muscle strength ranking exactly, reusing its actual scoring machinery —
`scoreForRatio`/`TIER_BANDS` (imported unchanged) give the same
Beginner→Elite tier + continuous score, and `interpolateStandards`
(`muscleStandards.js`, imported unchanged) does the bracket interpolation —
muscle ranking interpolates bodyweight-bracketed rows, this interpolates
age-bracketed rows, same generic function either way.

`VO2MAX_STANDARDS` thresholds are approximate checkpoints from widely-
published ACSM/Cooper Institute age-graded VO2max norms (ACSM's
*Guidelines for Exercise Testing and Prescription*) — the same "reference
methodology, not a scrape of any one source" sourcing `strengthStandards.js`'s
own `STANDARDS` table already uses. One score, not per-sport: VO2max is a
systemic measurement.

## Known gaps (deliberate, flagged rather than silently dropped)

- **No 8-week VO2max forecast for Cycling/Swimming.** `predict8WeekVO2Gain`
  is reusable (see above) but wiring a per-sport weekly-load forecast into
  `/summary` wasn't built in this pass — a real scope cut, not an oversight.
  The core prescriptions (readiness, zones, load, EF, VO2max estimation
  itself, Cardio Score) don't depend on it.
- **`/summary`'s existing `runningPrediction` is effectively dead in
  production**, discovered while building Cardio Score's own VO2max
  resolution: its `resolveVO2max(vo2maxSeries.at(-1)?.value, db.profile)`
  call passes a bare number where `resolveVO2max` expects `{value, dateMs}`,
  and `db.profile` where it expects a real `calculatedVDOT` — neither branch
  can ever match, so `currentVO2max` (and therefore `runningPrediction`) is
  always `null`. Pre-existing, not fixed here (out of scope for this
  change) — Cardio Score's own VO2max resolution in `/summary` is built
  correctly from the start (`latestAppleWatchVO2max`, a real
  `calculatedVDOT`), so it doesn't inherit the bug.
- **`/run/recommendation`'s Apple Watch check only matches a reading synced
  on today's exact date**, narrower than `resolveVO2max`'s own 30-day
  staleness allowance actually supports. Pre-existing, not touched.
  `latestAppleWatchVO2max` (used by the two new routes and Cardio Score)
  is the more correct version, scanning the recent-days window instead.

## References

- ACSM (2021). *ACSM's Guidelines for Exercise Testing and Prescription*
  (11th ed.). Wolters Kluwer. (Leg-ergometry VO2 equation.)
- Allen, H., Coggan, A., & McGregor, S. (2019). *Training and Racing with a
  Power Meter* (3rd ed.). VeloPress. (FTP, TSS, 7-zone power model.)
- Coyle, E. F., Coggan, A. R., Hopper, M. K., & Walters, T. J. (1988).
  Determinants of endurance in well-trained cyclists. *Journal of Applied
  Physiology*, 64(6), 2622-2630.
- Faria, E. W., Parker, D. L., & Faria, I. E. (2005). The science of
  cycling: physiology and training – part 1. *Sports Medicine*, 35(4),
  285-312.
- McArdle, W. D., Glaser, R. M., & Magel, J. R. (1971). Metabolic and
  cardiorespiratory response during free swimming and treadmill walking.
  *Journal of Applied Physiology*, 30(5), 733-738. (Swim vs. land-sport max
  HR offset.)
- Uth, N., Sørensen, H., Overgaard, K., & Pedersen, P. K. (2004).
  Estimation of VO2max from the ratio between HRmax and HR rest — the Heart
  Rate Ratio Method. *European Journal of Applied Physiology*, 91(1),
  111-115.
- See `RUNNING_SCIENCE.md`'s own References for TRIMP/ACWR/Karvonen/Astrand
  citations, reused unmodified above.
