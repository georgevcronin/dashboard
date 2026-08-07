// Cycling & swimming's daily prescriptions -- same "what should I do today,
// and why" shape buildRunningRecommendation (runningRecommendation.js)
// returns, built the same way: readiness (base recovery x ACWR penalty,
// genuinely sport-agnostic, imported unchanged), polarized session-type
// pick (also imported unchanged), then sport-specific zones/duration/
// reasoning. See ENDURANCE_SCIENCE.md for what's reused vs. new and why.
//
// index.js's routes compute ACWR/efficiency-trend/spike-detection (mirroring
// how /run/recommendation computes runningACWR/lastEfficiency itself) and
// pass the results in -- this file only assembles the prescription from
// already-resolved inputs, same division of responsibility running uses.

const { computeRunningReadiness, readinessLabel } = require('./runningReadiness');
const { sessionTypeByReadiness } = require('./runningRecommendation');
const { karvonen5Zones, estimateMaxHeartRate, prescribeWorkout } = require('./runningPrescription');
const { cogganPowerZones } = require('./cyclingPower');
const { formatSwimPacePer100m } = require('./enduranceLoad');

// Cycling sessions run longer, swim sessions shorter than running's
// (durationTargetMinutes in runningRecommendation.js isn't reused here --
// its base-minutes table is hardcoded to running-typical durations).
// 'general' (Sport/Aerobic -- see below) sits in the middle since it covers
// everything from a five-a-side match to a Pilates class, no single typical
// duration.
const DURATION_BASE = {
  cycling: { easy: 60, recovery: 40, steady: 75, tempo: 50, interval: 45, long: 120 },
  swimming: { easy: 30, recovery: 20, steady: 35, tempo: 30, interval: 25, long: 50 },
  general: { easy: 40, recovery: 25, steady: 45, tempo: 35, interval: 30, long: 75 },
};
function durationTargetMinutesFor(sport, readiness, efficiencyTrend, sessionType) {
  const base = DURATION_BASE[sport][sessionType] || DURATION_BASE[sport].easy;
  const readinessMult = Math.max(0.6, Math.min(1.2, readiness / 75));
  let final = Math.round(base * readinessMult);
  if (efficiencyTrend && efficiencyTrend.trend4wk < -3) final = Math.round(base * 0.8);
  return { min: Math.round(final * 0.8), target: final, max: Math.round(final * 1.3) };
}

// Maps the same neutral session-type vocabulary sessionTypeByReadiness
// already returns onto Coggan's 7-zone power model instead of running's
// 5-zone HR model -- 'tempo' lands on Coggan's own literally-named Tempo
// zone, 'interval' on VO2max (the same relative position running's own
// zoneMap in runningPrescription.js puts it), 'long' rides sit at endurance
// pace rather than a dedicated zone (there isn't one).
const CYCLING_ZONE_MAP = { rest: null, recovery: 'z1', easy: 'z2', steady: 'z3', tempo: 'z4', interval: 'z5', long: 'z2' };
function prescribeCyclingWorkout(sessionType, powerZones, durationMin) {
  const key = CYCLING_ZONE_MAP[sessionType];
  if (!key || !powerZones) return null;
  const zone = powerZones[key];
  if (!zone) return null;
  return {
    sessionType, zone: key, zoneName: zone.name,
    minWatts: zone.minWatts, maxWatts: zone.maxWatts, range: zone.range,
    duration: durationMin,
    durationRange: { min: Math.round(durationMin * 0.8), target: durationMin, max: Math.round(durationMin * 1.3) },
    purpose: zone.purpose,
  };
}

// Sport/Aerobic (functions/sportClassifier.js's 'other' bucket -- football,
// rock-climbing, Pilates, anything not run/cycle/swim) have no shared verb
// the way "ride"/"swim" do, so both use the generic "session"/"trained".
const SESSION_NOUNS = { cycling: 'ride', swimming: 'swim', general: 'session' };
const SESSION_VERBS = { cycling: 'ridden', swimming: 'swum', general: 'trained' };

function buildEnduranceReasoningString(sport, { readiness, label, sessionType, weekSessionCount, cautions }) {
  const noun = SESSION_NOUNS[sport];
  const verbed = SESSION_VERBS[sport];
  const parts = [];

  parts.push(`You're ${label} for training today (readiness: ${Math.round(readiness)}%)`);

  if (sessionType === 'rest') parts.push(`Your system needs a full recovery day; skip your ${noun} today.`);
  else if (sessionType === 'recovery') parts.push(`A very easy recovery ${noun} will help active recovery without taxing your system further.`);
  else if (sessionType === 'easy') parts.push(`An easy aerobic ${noun} builds your base without additional fatigue.`);
  else if (sessionType === 'steady') parts.push('You have capacity for moderate-intensity work today.');
  else if (sessionType === 'tempo' || sessionType === 'interval') parts.push('Your recovery and efficiency support a harder session. This is a good day for intensity.');

  if (weekSessionCount === 0) parts.push(`You haven't ${verbed} this week yet.`);
  else if (weekSessionCount >= 5) parts.push(`You've already logged ${weekSessionCount} ${noun}s this week; consider a recovery ${noun} or rest day.`);

  if (cautions.length) parts.push(`Cautions: ${cautions.join('; ')}`);

  return parts.join(' ');
}

// Swimming's max HR runs lower than land-sport max HR at equivalent effort
// -- McArdle, Glaser & Magel (1971) measured maximal HR ~13bpm lower during
// free swimming than treadmill running in trained swimmers (horizontal
// body position, reduced venous return/cardiac output demand); widely
// re-cited since (e.g. McArdle, Katch & Katch's Exercise Physiology
// textbook). Using a more conservative 10bpm here rather than the study's
// own ~13bpm, since that cohort was competitive-swimmer-specific and a
// general athlete's true offset likely sits lower -- so its Karvonen zones
// don't overstate effort without overcorrecting either.
const SWIM_MAX_HR_OFFSET = 10;

function buildEnduranceRecommendation(sport, {
  baseRecoveryScore,
  acwr,
  sessions,
  profile,
  lastEfficiency,
  lastSpikeDetection,
  vo2maxResolution,
  age,
  maxHeartRate,
  restingHeartRate,
  ftpResult,
} = {}) {
  if (!baseRecoveryScore || baseRecoveryScore < 0 || baseRecoveryScore > 100) return null;

  const readiness = computeRunningReadiness(baseRecoveryScore, acwr);
  const label = readinessLabel(readiness);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekSessions = (sessions || []).filter(s => new Date(s.date) >= oneWeekAgo);
  const weekSessionCount = weekSessions.length;
  const lastSession = sessions && sessions.length ? sessions[sessions.length - 1] : null;

  const efficiencyTrend = lastEfficiency || null;
  const sessionRec = sessionTypeByReadiness(readiness, lastSession?.type || null, weekSessionCount);
  const duration = durationTargetMinutesFor(sport, readiness, efficiencyTrend, sessionRec.recommended);

  const estimatedMaxHR = maxHeartRate || (age ? estimateMaxHeartRate(age) : null);
  const rhr = restingHeartRate || profile?.baselines?.restingHeartRate || 60;

  let hrZones = null, powerZones = null, workoutPrescription = null;

  if (sport === 'cycling' && ftpResult?.ftp) {
    powerZones = cogganPowerZones(ftpResult.ftp);
    workoutPrescription = prescribeCyclingWorkout(sessionRec.recommended, powerZones, duration.target);
    // Still shown alongside power zones, for the days a power meter isn't worn.
    hrZones = estimatedMaxHR ? karvonen5Zones(estimatedMaxHR, rhr) : null;
  } else {
    const effectiveMaxHR = sport === 'swimming' && estimatedMaxHR ? estimatedMaxHR - SWIM_MAX_HR_OFFSET : estimatedMaxHR;
    hrZones = effectiveMaxHR ? karvonen5Zones(effectiveMaxHR, rhr) : null;
    workoutPrescription = effectiveMaxHR
      ? prescribeWorkout({ sessionType: sessionRec.recommended, maxHR: effectiveMaxHR, vo2max: null, vdotPaces: null, durationMin: duration.target, restingHR: rhr })
      : null;
  }

  const noun = SESSION_NOUNS[sport];
  const cautions = [];
  if (lastSpikeDetection && lastSpikeDetection.risk === 'very_high') {
    cautions.push(`Last ${noun} was a distance spike (>110% of 30-day max); consider easy/recovery only`);
  }
  if (readiness < 50) cautions.push('Readiness is low; prioritize recovery');
  if (acwr > 1.5) cautions.push('ACWR elevated; acute load is high relative to chronic base');
  if (efficiencyTrend && efficiencyTrend.trend4wk < -5) cautions.push('Efficiency declining; consider extra recovery day');

  return {
    sessionType: sessionRec.recommended,
    alternatives: sessionRec.alternatives,
    intensity: sessionRec.intensity,
    readiness,
    readinessLabel: label,
    duration,
    hrZones,
    powerZones,
    ftp: ftpResult?.ftp || null,
    workoutPrescription,
    vo2maxSource: vo2maxResolution?.source || null,
    vo2maxValue: vo2maxResolution?.vo2max || null,
    efficiencyTrend,
    acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
    weekSessionCount,
    lastSession,
    cautions,
    reasoning: buildEnduranceReasoningString(sport, { readiness, label, sessionType: sessionRec.recommended, weekSessionCount, cautions }),
  };
}

function buildCyclingRecommendation(data = {}) {
  const result = buildEnduranceRecommendation('cycling', data);
  if (!result) return result;
  // No power meter on record -> average speed is the closest cycling gets
  // to running's pace display, instead of the power-zone table above.
  if (!data.ftpResult?.ftp && result.lastSession?.distanceKm && result.lastSession?.durationMin) {
    const kmh = result.lastSession.distanceKm / (result.lastSession.durationMin / 60);
    result.avgSpeedDisplay = `${Math.round(kmh * 10) / 10} km/h`;
  }
  delete result.lastSession;
  return result;
}

function buildSwimmingRecommendation(data = {}) {
  const result = buildEnduranceRecommendation('swimming', data);
  if (!result) return result;
  result.avgPaceDisplay = result.lastSession ? formatSwimPacePer100m(result.lastSession) : null;
  delete result.lastSession;
  return result;
}

// Sport & Aerobic (S14/S15) -- both driven by the exact same computation,
// off the same catch-all 'other' db.sports pool (functions/
// sportClassifier.js). Strava's sport_type can't distinguish a five-a-side
// match from a Pilates class in any principled way, so there's no data-level
// split to build two different prescriptions from -- HR zones + TRIMP load
// only, no power/pace equivalent, no distance/speed display (many of these
// activities have no meaningful distance at all).
function buildGeneralRecommendation(data = {}) {
  const result = buildEnduranceRecommendation('general', data);
  if (!result) return result;
  delete result.lastSession;
  return result;
}

module.exports = { buildCyclingRecommendation, buildSwimmingRecommendation, buildGeneralRecommendation, buildEnduranceReasoningString };
