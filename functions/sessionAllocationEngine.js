const THRESHOLD = {
  cns: 85,
  cardiovascular: 80,
  connectiveTissue: 75
};

const SESSION_COSTS = {
  lifting: { cns: 25, cardiovascular: 5, connectiveTissue: 15 },
  running: { cns: 15, cardiovascular: 30, connectiveTissue: 10 },
  sports: { cns: 20, cardiovascular: 25, connectiveTissue: 20 }
};

function generateWeeklyAllocation(allocationRequest) {
  const {
    weekStartDate,
    currentFatigue,
    activityWeights,
    upcomingEvents = [],
    athletePreferences = {}
  } = allocationRequest;

  const restDays = athletePreferences.restDays || [];
  const consecutiveSessionsMax = athletePreferences.consecutiveSessionsMax || 2;

  const startDate = new Date(weekStartDate);
  const schedule = [];
  let dailyFatigue = { ...currentFatigue };
  let consecutiveCount = 0;
  let riskFlags = [];
  let totalWeeklyLoad = 0;
  const tradeoffAnalysis = {};

  const activityOrder = ['lifting', 'running', 'sports'];
  const sessionRecommendations = {
    lifting: activityWeights.lifting?.recommendedSessions || 3,
    running: activityWeights.running?.recommendedSessions || 3,
    sports: activityWeights.sports?.recommendedSessions || 1
  };

  let sessionsPlaced = { lifting: 0, running: 0, sports: 0 };

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + dayOfWeek);
    const dateStr = currentDate.toISOString().slice(0, 10);
    const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayOfWeek];

    const upcomingEvent = upcomingEvents.find(e => e.date === dateStr);
    const isRestDay = restDays.includes(dayName);

    if (isRestDay) {
      schedule.push({
        date: dateStr,
        dayName,
        sessions: [],
        tradeoffs: 'Scheduled rest day'
      });
      consecutiveCount = 0;
      applyDayDecay(dailyFatigue);
      continue;
    }

    const daySessions = [];
    let dayTradeoffs = [];
    let dayHasHardSession = false;

    for (const activity of activityOrder) {
      if (sessionsPlaced[activity] >= sessionRecommendations[activity]) continue;

      const cost = SESSION_COSTS[activity];
      const wouldExceedThreshold = checkThresholdViolation(dailyFatigue, cost);

      if (wouldExceedThreshold && activity !== (upcomingEvent?.activity)) {
        dayTradeoffs.push(`Skipping ${activity}: would exceed ${wouldExceedThreshold} threshold`);
        continue;
      }

      const sessionType = getSessionType(activity, dailyFatigue);
      const session = {
        activity,
        type: sessionType,
        estimatedLoad: getEstimatedLoad(activity, sessionType),
        confidence: getConfidence(activity, sessionType, dailyFatigue)
      };

      if (activity === 'lifting') {
        session.muscleGroup = selectMuscleGroup(sessionsPlaced.lifting);
      } else if (activity === 'running') {
        session.distance = sessionType === 'recovery' ? 5 : (sessionType === 'threshold' ? 10 : 8);
        session.pace = sessionType === 'recovery' ? 480 : (sessionType === 'threshold' ? 360 : 420);
      }

      daySessions.push(session);
      sessionsPlaced[activity]++;
      dayHasHardSession = dayHasHardSession || (sessionType === 'heavy' || sessionType === 'threshold');

      applySessionFatigue(dailyFatigue, activity, sessionType);
      totalWeeklyLoad += session.estimatedLoad;
    }

    if (dayHasHardSession) {
      consecutiveCount++;
      if (consecutiveCount > consecutiveSessionsMax) {
        riskFlags.push(`${dayName}: ${consecutiveCount} consecutive hard days (max ${consecutiveSessionsMax})`);
      }
    } else {
      consecutiveCount = 0;
    }

    if (daySessions.length > 0) {
      const combinedCNS = dailyFatigue.cns?.current || 0;
      if (combinedCNS > 85) {
        dayTradeoffs.push('Combined CNS load high. Consider downgrading intensity.');
      }
    }

    schedule.push({
      date: dateStr,
      dayName,
      sessions: daySessions,
      tradeoffs: dayTradeoffs.join(' | ') || 'Normal day'
    });

    applyDayDecay(dailyFatigue);
  }

  Object.keys(sessionsPlaced).forEach(activity => {
    if (sessionsPlaced[activity] < sessionRecommendations[activity]) {
      riskFlags.push(`${activity}: only ${sessionsPlaced[activity]}/${sessionRecommendations[activity]} sessions scheduled`);
    }
  });

  return {
    schedule,
    summary: {
      liftingSessions: sessionsPlaced.lifting,
      runningSessions: sessionsPlaced.running,
      sportsSessions: sessionsPlaced.sports,
      recoveryDays: schedule.filter(d => d.sessions.length === 0).length,
      totalWeeklyLoad: Math.round(totalWeeklyLoad),
      riskFlags
    },
    tradeoffAnalysis
  };
}

function checkThresholdViolation(currentFatigue, costDelta) {
  const newCNS = (currentFatigue.cns?.current || 0) + (costDelta.cns || 0);
  const newCardio = (currentFatigue.cardiovascular?.current || 0) + (costDelta.cardiovascular || 0);
  const newConnective = (currentFatigue.connectiveTissue?.current || 0) + (costDelta.connectiveTissue || 0);

  if (newCNS > THRESHOLD.cns) return 'CNS';
  if (newCardio > THRESHOLD.cardiovascular) return 'cardiovascular';
  if (newConnective > THRESHOLD.connectiveTissue) return 'connective tissue';
  return null;
}

function getSessionType(activity, currentFatigue) {
  const cns = currentFatigue.cns?.current || 0;
  const cardio = currentFatigue.cardiovascular?.current || 0;

  if (activity === 'lifting') {
    if (cns > 70) return 'light';
    if (cns > 50) return 'moderate';
    return 'heavy';
  } else if (activity === 'running') {
    if (cardio > 75) return 'recovery';
    if (cardio > 50) return 'steady';
    return 'threshold';
  } else {
    return 'normal';
  }
}

function getEstimatedLoad(activity, sessionType) {
  const loads = {
    lifting: { heavy: 2200, moderate: 1500, light: 800 },
    running: { threshold: 480, steady: 350, recovery: 200 },
    sports: { normal: 600 }
  };
  return loads[activity]?.[sessionType] || 500;
}

function getConfidence(activity, sessionType, currentFatigue) {
  const fatiguePenalty = ((currentFatigue.cns?.current || 0) / 100) * 0.2;
  let baseConfidence = 0.90;
  if (sessionType === 'light' || sessionType === 'recovery') baseConfidence = 0.95;
  if (sessionType === 'heavy' || sessionType === 'threshold') baseConfidence = 0.85;
  return Math.max(0.5, baseConfidence - fatiguePenalty);
}

function selectMuscleGroup(sessionsPlacedCount) {
  const groups = ['upper', 'lower', 'full_body'];
  return groups[sessionsPlacedCount % groups.length];
}

function applySessionFatigue(dailyFatigue, activity, sessionType) {
  const intensityMult = sessionType === 'heavy' || sessionType === 'threshold' ? 1.0 : 0.5;
  const costs = SESSION_COSTS[activity];

  dailyFatigue.cns = dailyFatigue.cns || { current: 0 };
  dailyFatigue.cardiovascular = dailyFatigue.cardiovascular || { current: 0 };
  dailyFatigue.connectiveTissue = dailyFatigue.connectiveTissue || { current: 0 };

  dailyFatigue.cns.current += costs.cns * intensityMult;
  dailyFatigue.cardiovascular.current += costs.cardiovascular * intensityMult;
  dailyFatigue.connectiveTissue.current += costs.connectiveTissue * intensityMult;
}

function applyDayDecay(fatigue) {
  const rates = { cns: 0.88, cardiovascular: 0.92, connectiveTissue: 0.94 };

  fatigue.cns = fatigue.cns || { current: 0 };
  fatigue.cardiovascular = fatigue.cardiovascular || { current: 0 };
  fatigue.connectiveTissue = fatigue.connectiveTissue || { current: 0 };

  fatigue.cns.current *= rates.cns;
  fatigue.cardiovascular.current *= rates.cardiovascular;
  fatigue.connectiveTissue.current *= rates.connectiveTissue;
}

module.exports = {
  generateWeeklyAllocation,
  THRESHOLD,
  SESSION_COSTS
};
