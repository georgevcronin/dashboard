const DECAY_RATES = {
  structural: 0.15,     // 15% per day
  cns: 0.12,            // 12% per day
  cardiovascular: 0.08, // 8% per day
  connectiveTissue: 0.06 // 6% per day
};

function decayValue(value, rate, days) {
  return Math.max(0, value * Math.pow(1 - rate, days));
}

function capValue(raw) {
  return Math.min(100, Math.max(0, raw));
}

function applyRawProperty(obj, key, rawValue) {
  Object.defineProperty(obj, '_raw', {
    value: rawValue,
    enumerable: false,
    writable: true,
    configurable: true
  });
  return obj;
}

function computeRunningLoadScore(run) {
  if (!run.distance || !run.duration) return 0;
  const durationHours = run.duration / 3600;
  const paceVariance = run.pace ? Math.abs(run.pace - 360) / 360 : 0;
  const elevationFactor = run.elevation ? Math.min(1, run.elevation / 1000) : 0;
  return run.distance * (1 + paceVariance * 0.5 + elevationFactor * 0.3);
}

function computeSportsLoadScore(sport) {
  if (!sport.duration) return 0;
  const intensityMult = { high: 1.5, medium: 1.0, low: 0.5 }[sport.intensity] || 1.0;
  return (sport.duration / 60) * intensityMult;
}

function distributeRunningStructuralFatigue(run, muscleAccum) {
  const loadScore = computeRunningLoadScore(run);
  const baseLoad = loadScore * 0.2;

  const muscles = ['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors'];
  muscles.forEach(m => {
    muscleAccum[m] = (muscleAccum[m] || 0) + baseLoad;
  });

  const isHeavyRun = run.pace && run.pace < 360;
  if (isHeavyRun) {
    muscleAccum['quads'] = (muscleAccum['quads'] || 0) + baseLoad * 0.3;
    muscleAccum['hamstrings'] = (muscleAccum['hamstrings'] || 0) + baseLoad * 0.3;
  }

  const isLongRun = run.duration > 90 * 60;
  if (isLongRun) {
    muscleAccum['glutes'] = (muscleAccum['glutes'] || 0) + baseLoad * 0.2;
    muscleAccum['calves'] = (muscleAccum['calves'] || 0) + baseLoad * 0.2;
  }
}

function distributeSportsStructuralFatigue(sport, muscleAccum) {
  if (!sport.musclesEngaged || !Array.isArray(sport.musclesEngaged)) return;
  const loadScore = computeSportsLoadScore(sport);
  const perMuscle = loadScore / sport.musclesEngaged.length;
  sport.musclesEngaged.forEach(m => {
    muscleAccum[m] = (muscleAccum[m] || 0) + perMuscle;
  });
}

function computeRunningCNS(run) {
  const loadScore = computeRunningLoadScore(run);
  const baseCNS = loadScore * 0.1;
  const isHighIntensity = run.pace && run.pace < 360;
  return isHighIntensity ? baseCNS * 1.5 : baseCNS;
}

function computeSportsCNS(sport) {
  const durationMin = sport.duration / 60;
  const intensityMult = { high: 1.5, medium: 1.0, low: 0.5 }[sport.intensity] || 1.0;
  return durationMin * 0.15 * intensityMult;
}

function computeRunningCardiovascular(run) {
  const loadScore = computeRunningLoadScore(run);
  const baseCardio = loadScore * 0.3;

  if (run.pace) {
    if (run.pace < 330) return baseCardio * 1.5;
    if (run.pace < 450) return baseCardio * 1.2;
    return baseCardio * 0.5;
  }
  return baseCardio;
}

function computeSportsCardiovascular(sport) {
  const durationMin = sport.duration / 60;
  const intensityMult = { high: 1.5, medium: 1.0, low: 0.5 }[sport.intensity] || 1.0;
  return durationMin * 0.25 * intensityMult;
}

function computeRunningConnectiveTissue(run) {
  const loadScore = computeRunningLoadScore(run);
  const baseConnective = loadScore * 0.15;

  const surfaceType = run.type || 'road';
  if (surfaceType === 'trail') return baseConnective * 1.4;
  if (surfaceType === 'treadmill') return baseConnective * 0.8;
  return baseConnective;
}

function computeSportsConnectiveTissue(sport) {
  const durationMin = sport.duration / 60;
  const intensityMult = { high: 1.5, medium: 1.0, low: 0.5 }[sport.intensity] || 1.0;
  return durationMin * 0.2 * intensityMult;
}

function computeLiftingConnectiveTissue(lift) {
  const baseConnective = lift.sessionStimulusScore * 0.05;
  let multiplier = 1.0;

  if (lift.exercises && Array.isArray(lift.exercises)) {
    const hasDeadlift = lift.exercises.some(e => e.name && e.name.toLowerCase().includes('deadlift'));
    const hasSquat = lift.exercises.some(e => e.name && e.name.toLowerCase().includes('squat'));
    const hasOlympic = lift.exercises.some(e => e.name && (e.name.toLowerCase().includes('clean') || e.name.toLowerCase().includes('snatch') || e.name.toLowerCase().includes('jerk')));
    const hasIsolation = lift.exercises.every(e => e.name && (e.name.toLowerCase().includes('curl') || e.name.toLowerCase().includes('extension') || e.name.toLowerCase().includes('fly')));

    if (hasDeadlift || hasSquat) multiplier = 1.5;
    else if (hasOlympic) multiplier = 1.3;
    else if (hasIsolation) multiplier = 0.8;
  }

  return baseConnective * multiplier;
}

function computeSharedFatigue(multiActivityState, athleteProfile = {}, previousFatigue = null) {
  const lifts = multiActivityState.lifts || [];
  const runs = multiActivityState.runs || [];
  const sports = multiActivityState.sports || [];

  const daysSinceLast = previousFatigue ? computeDaysSincePreviousState(previousFatigue.timestamp) : 0;

  let structuralRaw = {};
  let cnsRaw = 0;
  let cardiovascularRaw = 0;
  let connectiveTissueRaw = 0;

  lifts.forEach(lift => {
    if (!lift.exercises || !lift.sessionStimulusScore) return;
    lift.exercises.forEach(ex => {
      const muscleGroups = getMusclesForExercise(ex.name || '');
      const scorePerMuscle = (lift.sessionStimulusScore / lift.exercises.length) * 0.15;
      muscleGroups.forEach(m => {
        structuralRaw[m] = (structuralRaw[m] || 0) + scorePerMuscle;
      });
    });
    cnsRaw += lift.sessionStimulusScore * 0.12;
    connectiveTissueRaw += computeLiftingConnectiveTissue(lift);
  });

  runs.forEach(run => {
    distributeRunningStructuralFatigue(run, structuralRaw);
    cnsRaw += computeRunningCNS(run);
    cardiovascularRaw += computeRunningCardiovascular(run);
    connectiveTissueRaw += computeRunningConnectiveTissue(run);
  });

  sports.forEach(sport => {
    distributeSportsStructuralFatigue(sport, structuralRaw);
    cnsRaw += computeSportsCNS(sport);
    cardiovascularRaw += computeSportsCardiovascular(sport);
    connectiveTissueRaw += computeSportsConnectiveTissue(sport);
  });

  if (previousFatigue && daysSinceLast > 0) {
    Object.keys(structuralRaw).forEach(m => {
      structuralRaw[m] += decayValue(previousFatigue.structural[m] || 0, DECAY_RATES.structural, daysSinceLast);
    });
    Object.keys(previousFatigue.structural || {}).forEach(m => {
      if (!structuralRaw[m]) {
        structuralRaw[m] = decayValue(previousFatigue.structural[m], DECAY_RATES.structural, daysSinceLast);
      }
    });
    cnsRaw += decayValue(previousFatigue.cns._raw || previousFatigue.cns.current || 0, DECAY_RATES.cns, daysSinceLast);
    cardiovascularRaw += decayValue(previousFatigue.cardiovascular._raw || previousFatigue.cardiovascular.current || 0, DECAY_RATES.cardiovascular, daysSinceLast);
    connectiveTissueRaw += decayValue(previousFatigue.connectiveTissue._raw || previousFatigue.connectiveTissue.current || 0, DECAY_RATES.connectiveTissue, daysSinceLast);
  }

  const structural = {};
  Object.keys(structuralRaw).forEach(m => {
    structural[m] = capValue(structuralRaw[m]);
  });
  applyRawProperty(structural, '_raw', structuralRaw);

  const cns = applyRawProperty({ current: capValue(cnsRaw) }, '_raw', cnsRaw);
  const cardiovascular = applyRawProperty({ current: capValue(cardiovascularRaw) }, '_raw', cardiovascularRaw);
  const connectiveTissue = applyRawProperty({ current: capValue(connectiveTissueRaw) }, '_raw', connectiveTissueRaw);

  const recommendations = generateRecommendations(structural, cns.current, cardiovascular.current, connectiveTissue.current);

  return {
    structural,
    cns,
    cardiovascular,
    connectiveTissue,
    activityFatigue: {
      lifting: { score: cnsRaw > 0 ? Math.min(1, cnsRaw / 150) : 0, lastSession: lifts.length > 0 ? lifts[lifts.length - 1].date : null },
      running: { score: cardiovascularRaw > 0 ? Math.min(1, cardiovascularRaw / 150) : 0, lastSession: runs.length > 0 ? runs[runs.length - 1].date : null },
      sports: { score: connectiveTissueRaw > 0 ? Math.min(1, connectiveTissueRaw / 100) : 0, lastSession: sports.length > 0 ? sports[sports.length - 1].date : null }
    },
    recommendations,
    timestamp: new Date().toISOString()
  };
}

function computeDaysSincePreviousState(previousTimestamp) {
  if (!previousTimestamp) return 0;
  const prev = new Date(previousTimestamp);
  const now = new Date();
  return Math.floor((now - prev) / (1000 * 60 * 60 * 24));
}

function generateRecommendations(structural, cns, cardiovascular, connectiveTissue) {
  const canLift = cns < 85 && Object.values(structural).every(s => s < 80);

  const legMuscles = ['quads', 'hamstrings', 'glutes', 'calves', 'hip_flexors'];
  const legsAreFresh = legMuscles.every(m => (structural[m] || 0) < 80);
  const canRun = cardiovascular < 80 && legsAreFresh;

  const canSports = cns < 75 && connectiveTissue < 75;

  let rationale = '';
  if (!canLift && cns >= 85) rationale = 'CNS saturated; skip heavy lifting today';
  else if (!canRun && cardiovascular >= 80) rationale = 'Cardiovascular fatigue high; skip running';
  else if (!canSports && connectiveTissue >= 75) rationale = 'Connective tissue stress high; skip intense sports';

  return { canLift, canRun, canSports, rationale };
}

function getMusclesForExercise(exerciseName) {
  const name = (exerciseName || '').toLowerCase();
  const muscleMap = {
    chest: ['chest', 'front_delts', 'triceps'],
    back: ['lats', 'mid_back', 'rear_delts', 'biceps'],
    legs: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'],
    shoulders: ['front_delts', 'mid_delts', 'rear_delts', 'traps'],
    arms: ['biceps', 'triceps', 'forearms']
  };

  if (name.includes('bench') || name.includes('press') && name.includes('chest')) return muscleMap.chest;
  if (name.includes('squat') || name.includes('leg press')) return muscleMap.legs;
  if (name.includes('deadlift') || name.includes('row')) return muscleMap.back;
  if (name.includes('shoulder') || name.includes('overhead')) return muscleMap.shoulders;
  if (name.includes('curl') || name.includes('extension')) return muscleMap.arms;

  return ['general'];
}

module.exports = {
  computeSharedFatigue,
  DECAY_RATES,
  decayValue
};
