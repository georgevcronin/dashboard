export function computeHybridFatigue(db, day) {
  const today = day || new Date().toISOString().split('T')[0];
  const lifting = computeFatigueForModality(db.workouts || [], today, 'lifting', 0.15);
  const running = computeFatigueForModality(db.runs || [], today, 'running', 0.12);
  const sports = computeFatigueForModality(db.sports || [], today, 'sports', 0.08);

  const shared = {
    cns: Math.max(lifting.cns || 0, running.cns || 0, sports.cns || 0),
    cardiovascular: Math.max(lifting.cardio || 0, running.cardio || 0, sports.cardio || 0),
    connective: Math.max(lifting.connective || 0, running.connective || 0, sports.connective || 0)
  };

  return { lifting, running, sports, shared };
}

function computeFatigueForModality(sessions, today, modality, dailyDecay) {
  let cns = 0, structural = 0, cardio = 0, connective = 0;
  const now = new Date(today);

  sessions.forEach(session => {
    const sessionDate = new Date(session.date);
    const days = Math.max(0, Math.floor((now - sessionDate) / (1000 * 60 * 60 * 24)));
    const decayFactor = Math.pow(1 - dailyDecay, days);

    cns += (session.cnsLoad || 0) * decayFactor;
    structural += (session.structuralLoad || 0) * decayFactor;
    cardio += (session.cardioLoad || 0) * decayFactor;
    connective += (session.connectiveLoad || 0) * decayFactor;
  });

  cns = Math.min(1, cns);
  structural = Math.min(1, structural);
  cardio = Math.min(1, cardio);
  connective = Math.min(1, connective);

  return { cns, structural, cardio, connective, total: (cns + structural + cardio + connective) / 4 };
}

export function activityWeighting(db, primaryActivity, secondaryActivity = null) {
  const totalRecovery = 1.0;
  const primaryShare = 0.6;
  const secondaryShare = 0.3;
  const tertiaryShare = 0.1;

  const weighting = {
    lifting: { budget: 0, sessions: 0 },
    running: { budget: 0, sessions: 0 },
    sports: { budget: 0, sessions: 0 }
  };

  const activities = [primaryActivity, secondaryActivity].filter(Boolean);
  const all = ['lifting', 'running', 'sports'];
  const remaining = all.filter(a => !activities.includes(a));

  activities.forEach((act, idx) => {
    weighting[act].budget = idx === 0 ? primaryShare : secondaryShare;
    weighting[act].sessions = Math.round(weighting[act].budget * 7);
  });

  remaining.forEach(act => {
    weighting[act].budget = tertiaryShare / remaining.length;
    weighting[act].sessions = Math.round(weighting[act].budget * 7);
  });

  return weighting;
}

export function allocateWeekly(db) {
  const plan = [];
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const fatigueForecast = {};
  days.forEach(day => {
    fatigueForecast[day] = computeHybridFatigue(db, day);
  });

  let lastHardDay = -1;
  days.forEach((day, idx) => {
    const f = fatigueForecast[day];
    const canGoHard = lastHardDay === -1 || (idx - lastHardDay) > 1;
    let activity, intensity, reason;

    if (f.shared.cns > 0.8 || f.shared.cardiovascular > 0.85 || f.shared.connective > 0.9) {
      activity = 'rest';
      intensity = 'none';
      reason = 'High fatigue, rest recommended';
    } else if (canGoHard && f.lifting.structural < 0.6 && f.running.cns < 0.6) {
      if ((db.profile?.primaryActivity || 'lifting') === 'lifting') {
        activity = 'lifting';
        intensity = 'hard';
        reason = 'Primary hard session, low CNS/structural load';
        lastHardDay = idx;
      } else {
        activity = 'running';
        intensity = 'hard';
        reason = 'Primary hard run, acceptable load';
        lastHardDay = idx;
      }
    } else {
      activity = f.lifting.structural < 0.7 ? 'lifting' : 'running';
      intensity = 'moderate';
      reason = 'Moderate to maintain stimulus without overreaching';
    }

    plan.push({ day, activity, intensity, reason });
  });

  return plan;
}

export function computeActivityReadiness(db, activity) {
  const hybrid = computeHybridFatigue(db);
  let readiness = 1;
  const limits = { maxIntensity: 'high', maxDuration: 60 };
  let explanation = 'Ready for normal training.';

  if (activity === 'lifting') {
    readiness -= (hybrid.lifting.structural || 0) * 0.5;
    readiness -= (hybrid.shared.connective || 0) * 0.2;
    if ((hybrid.lifting.structural || 0) > 0.8) {
      limits.maxIntensity = 'low';
      limits.maxDuration = 30;
      explanation = 'Structural fatigue high; reduce volume/intensity.';
    }
  } else if (activity === 'running') {
    readiness -= (hybrid.running.cns || 0) * 0.3;
    readiness -= (hybrid.shared.cardiovascular || 0) * 0.3;
    readiness -= (hybrid.shared.connective || 0) * 0.2;
    if ((hybrid.running.cns || 0) > 0.7) {
      limits.maxIntensity = 'moderate';
      limits.maxDuration = 45;
      explanation = 'CNS fatigue elevated; avoid intervals.';
    }
  } else if (activity === 'sports') {
    readiness -= (hybrid.sports.cns || 0) * 0.2;
    readiness -= (hybrid.shared.cardiovascular || 0) * 0.3;
    readiness -= (hybrid.shared.connective || 0) * 0.3;
  }

  readiness = Math.max(0, Math.min(1, readiness));
  return { readiness, explanation, limits };
}
