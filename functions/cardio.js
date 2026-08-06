// #17: Swimming and biking, at parity with the running subsystem (#95-113).
// Reuses that subsystem's math directly rather than re-deriving it — TRIMP
// (Banister 1991, Morton et al. 1990) and Karvonen HR zones are both
// already sport-agnostic in their actual implementation (duration + HR +
// resting/max HR only, nothing running-specific), so dailyLoadsFromRuns and
// karvonen5Zones are called as-is on swim/bike data, not duplicated.
// See RUNNING_SCIENCE.md for the underlying citations.
//
// Storage: every non-running Strava activity has been landing in db.sports
// (functions/index.js's ingestActivity) since before this file existed —
// full structured data (date, durationMin, distanceKm, avgHeartRate,
// elevationGainM), just never read by anything downstream. This module is
// the read side; ingestion itself needed no changes.
//
// Deliberately does NOT extend #102's single-session-distance-spike injury
// model to swim/bike — that model (Garmin-RUNSAFE, N=5,205) was validated
// specifically for running; presenting it as equally validated for cycling
// or swimming would overclaim the evidence. ACWR (Williams et al. 2017,
// validated across endurance sports generally) is the honest choice here.
const { dailyLoadsFromRuns } = require('./runningLoad');
const { coupledAcwr } = require('./fatigue');
const { karvonen5Zones } = require('./runningPrescription');

// Strava's sport_type/type strings for bike and swim activities, matched
// case-insensitively against whatever ingestActivity stored. Deliberately a
// broad match ("ride"/"bike"/"cycl", "swim") rather than an exhaustive
// enum of every Strava sport_type variant (VirtualRide, GravelRide,
// EBikeRide, OpenWaterSwim, etc.) — new Strava sport_types appear over
// time, and a substring match keeps this working without needing to track
// Strava's own taxonomy changes.
const BIKE_PATTERN = /ride|bike|cycl/i;
const SWIM_PATTERN = /swim/i;

function cardioTypeOf(sportType) {
  if (!sportType) return null;
  if (BIKE_PATTERN.test(sportType)) return 'bike';
  if (SWIM_PATTERN.test(sportType)) return 'swim';
  return null;
}

// db.sports holds every non-running Strava activity — team sports, yoga,
// hikes, everything. Filters to just swim/bike, tagging each with which one.
function filterCardio(sports) {
  return (sports || [])
    .map(s => ({ ...s, cardioType: cardioTypeOf(s.sportType) }))
    .filter(s => s.cardioType);
}

// type: 'bike' | 'swim' | null (both combined). Mirrors computeRunningACWR
// (fatigue.js) exactly — one function (coupledAcwr), same Williams et al.
// 2017 time constants, no sport-specific tuning.
function dailyLoadsFromCardio(sports, profile = {}, type = null) {
  const entries = filterCardio(sports).filter(s => !type || s.cardioType === type);
  return dailyLoadsFromRuns(entries, profile);
}

function computeCardioACWR(sports, targetDate, profile, type = null) {
  const dailyLoads = dailyLoadsFromCardio(sports, profile, type);
  return coupledAcwr(dailyLoads, targetDate || new Date().toISOString().slice(0, 10));
}

// HR-zone prescription only — no VDOT/pace zones. VDOT is a running-economy
// formula (Daniels & Gilbert 1979); forcing it onto swim/bike pace would be
// presenting an unvalidated extrapolation as the same real science #97 uses
// for running. Karvonen zones are genuinely HR-only and generalize cleanly.
function cardioHRZones(maxHR, restingHR = 60) {
  return karvonen5Zones(maxHR, restingHR);
}

// #103 extension: per-muscle fatigue contribution, mirroring
// hybridFatigue.js's runningFatigueByMuscle exactly in approach (same
// magnitude scale, same 7-day recency window, same negligible-load
// threshold) — only the muscle distribution changes per modality. Like
// runningFatigueByMuscle's own 60/20/20 split, these percentages are a
// reasoned anatomical estimate, not drawn from a specific cited study (the
// TRIMP/decay math underneath them is the part that's actually cited).
//
// Bike: quad-dominant concentric pedaling, no eccentric braking stress the
// way running has — more quad-heavy and less hamstring/calf-loaded than
// running's split.
// Swim: the one modality here that isn't leg-dominant — pulling phase loads
// lats/shoulders/triceps, core stabilizes rotation, legs contribute via
// kick but far less than in running or biking.
const CARDIO_MUSCLE_SPLIT = {
  bike: {
    primary: { quads: 0.38, glutes: 0.22, hamstrings: 0.10, calves: 0.10, erectors: 0.08 },
    secondary: { abs: 0.06, adductors: 0.06 },
  },
  swim: {
    primary: { lats: 0.28, front_delt: 0.14, triceps: 0.12, abs: 0.12 },
    secondary: { quads: 0.10, obliques: 0.10, calves: 0.05, chest: 0.09 },
  },
};

function cardioFatigueByMuscle(sports, profile = {}, cardioType) {
  const split = CARDIO_MUSCLE_SPLIT[cardioType];
  const entries = filterCardio(sports).filter(s => s.cardioType === cardioType);
  if (!split || !entries.length) return {};

  const dailyLoads = dailyLoadsFromRuns(entries, profile);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentLoad = Object.entries(dailyLoads)
    .filter(([date]) => new Date(date) >= sevenDaysAgo)
    .reduce((sum, [, load]) => sum + load, 0);

  if (recentLoad < 2) return {}; // Same negligible-load threshold as running

  const magnitude = recentLoad * 0.4; // Same lifting-tension-vs-lifting scale as running
  const fatigue = {};
  for (const [muscle, fraction] of Object.entries(split.primary)) fatigue[muscle] = magnitude * fraction;
  for (const [muscle, fraction] of Object.entries(split.secondary)) fatigue[muscle] = (magnitude * 0.2) * fraction;
  return fatigue;
}

module.exports = {
  cardioTypeOf, filterCardio, dailyLoadsFromCardio, computeCardioACWR, cardioHRZones, cardioFatigueByMuscle,
  BIKE_PATTERN, SWIM_PATTERN, CARDIO_MUSCLE_SPLIT,
};
