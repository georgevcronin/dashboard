// #17: Swim/bike recommendation engine, parity with #95's running engine.
// Reuses that engine's genuinely sport-agnostic pieces directly —
// computeRunningReadiness (just baseRecoveryScore + an ACWR value, nothing
// running-specific despite the name), sessionTypeByReadiness, and
// durationTargetMinutes — rather than re-deriving the same readiness/
// polarized-training-model math a second time. Only the reasoning prose is
// rewritten per cardioType: buildReasoningString (runningRecommendation.js)
// hardcodes "run"/"running" throughout its sentences, which would be
// factually wrong prose for a swim or bike day, so that part isn't reused
// verbatim even though the underlying decision is identical.
//
// No pace-zone/VDOT prescription (unlike running) and no single-session-
// spike injury model — see cardio.js's header comment for why both are
// deliberately out of scope rather than force-fit from running's citations.
const { computeRunningReadiness, readinessLabel } = require('./runningReadiness');
const { sessionTypeByReadiness, durationTargetMinutes } = require('./runningRecommendation');
const { estimateMaxHeartRate } = require('./runningPrescription');
const { cardioHRZones } = require('./cardio');

const CARDIO_LABEL = { bike: 'bike', swim: 'swim' };

function buildCardioReasoningString({ readiness, label, sessionType, weekSessionCount, cautions, cardioType }) {
  const activity = CARDIO_LABEL[cardioType] || 'cardio';
  const parts = [`You're ${label} for training today (readiness: ${Math.round(readiness)}%)`];

  if (sessionType === 'rest') {
    parts.push(`Your system needs a full recovery day; skip ${activity} today.`);
  } else if (sessionType === 'recovery') {
    parts.push(`A very easy recovery ${activity} session will help active recovery without taxing your system further.`);
  } else if (sessionType === 'easy') {
    parts.push(`An easy aerobic ${activity} session builds your base without additional fatigue.`);
  } else if (sessionType === 'steady') {
    parts.push('You have capacity for moderate-intensity work today.');
  } else if (sessionType === 'tempo' || sessionType === 'interval') {
    parts.push('Your recovery supports a harder session. This is a good day for intensity.');
  }

  if (weekSessionCount === 0) {
    parts.push(`You haven't logged a ${activity} session this week yet.`);
  } else if (weekSessionCount >= 5) {
    parts.push(`You've already logged ${weekSessionCount} ${activity} sessions this week; consider a recovery session or rest day.`);
  }

  if (cautions.length) parts.push(`Cautions: ${cautions.join('; ')}`);

  return parts.join(' ');
}

// cardioType: 'bike' | 'swim'. sessions: this type's filterCardio() output.
function buildCardioRecommendation({
  baseRecoveryScore,
  cardioACWR,
  sessions,
  profile,
  age,
  maxHeartRate,
  restingHeartRate,
  cardioType,
} = {}) {
  if (!baseRecoveryScore || baseRecoveryScore < 0 || baseRecoveryScore > 100) return null;
  if (!CARDIO_LABEL[cardioType]) return null;

  const readiness = computeRunningReadiness(baseRecoveryScore, cardioACWR);
  const label = readinessLabel(readiness);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekSessions = (sessions || []).filter(s => new Date(s.date) >= oneWeekAgo);
  const weekSessionCount = weekSessions.length;
  const lastSession = sessions && sessions.length ? sessions[sessions.length - 1] : null;
  const lastType = lastSession?.type || null;

  const sessionRec = sessionTypeByReadiness(readiness, lastType, weekSessionCount);
  const duration = durationTargetMinutes(readiness, null, sessionRec.recommended);

  const estimatedMaxHR = maxHeartRate || (age ? estimateMaxHeartRate(age) : null);
  const rhr = restingHeartRate || profile?.baselines?.restingHeartRate || 60;
  const hrZones = estimatedMaxHR ? cardioHRZones(estimatedMaxHR, rhr) : null;

  const cautions = [];
  if (readiness < 50) cautions.push('Readiness is low; prioritize recovery');
  if (cardioACWR != null && cardioACWR > 1.5) cautions.push('ACWR elevated; acute load is high relative to chronic base');

  return {
    cardioType,
    sessionType: sessionRec.recommended,
    alternatives: sessionRec.alternatives,
    readiness,
    readinessLabel: label,
    duration,
    hrZones,
    acwr: cardioACWR != null ? Math.round(cardioACWR * 100) / 100 : null,
    weekSessionCount,
    cautions,
    reasoning: buildCardioReasoningString({ readiness, label, sessionType: sessionRec.recommended, weekSessionCount, cautions, cardioType }),
  };
}

module.exports = { buildCardioRecommendation, buildCardioReasoningString };
