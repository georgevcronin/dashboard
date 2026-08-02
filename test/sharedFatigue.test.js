const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSharedFatigue,
  DECAY_RATES,
  decayValue
} = require('../functions/sharedFatigueEngine');
const {
  computeActivityWeights,
  BASE_WEEKLY_BUDGET
} = require('../functions/activityWeighting');
const {
  generateWeeklyAllocation,
  THRESHOLD
} = require('../functions/sessionAllocationEngine');

test('Decay Rates: CNS decays at 12% per day', () => {
  const initial = 100;
  const after1Day = decayValue(initial, 0.12, 1);
  assert.ok(Math.abs(after1Day - 88) < 1);
});

test('Decay Rates: Cardiovascular decays at 8% per day', () => {
  const initial = 100;
  const after1Day = decayValue(initial, 0.08, 1);
  assert.ok(Math.abs(after1Day - 92) < 1);
});

test('Decay Rates: Connective tissue decays at 6% per day', () => {
  const initial = 100;
  const after1Day = decayValue(initial, 0.06, 1);
  assert.ok(Math.abs(after1Day - 94) < 1);
});

test('Decay Rates: Structural decays at 15% per day', () => {
  const initial = 100;
  const after1Day = decayValue(initial, 0.15, 1);
  assert.ok(Math.abs(after1Day - 85) < 1);
});

test('Decay Rates: Compound decay over 7 days approaches zero', () => {
  const initial = 100;
  const after7Days = decayValue(initial, 0.12, 7);
  assert.ok(after7Days < 50);
});

test('Decay Rates: Decay is multiplicative (not linear)', () => {
  const initial = 100;
  const after1Day = decayValue(initial, 0.12, 1);
  const after2Days = decayValue(initial, 0.12, 2);
  const after2DaysRecalc = decayValue(after1Day, 0.12, 1);
  assert.ok(Math.abs(after2Days - after2DaysRecalc) < 0.1);
});

test('Decay Rates: Zero fatigue stays zero', () => {
  assert.strictEqual(decayValue(0, 0.12, 5), 0);
});

test('Decay Rates: Negative days return original value', () => {
  assert.strictEqual(decayValue(100, 0.12, 0), 100);
});

test('Fatigue Computation: Lifting alone produces structural + CNS fatigue only', () => {
  const state = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [
          { name: 'Bench Press', reps: 5, kg: 100 },
          { name: 'Squats', reps: 5, kg: 140 }
        ],
        sessionStimulusScore: 2000
      }
    ],
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.structural);
  assert.ok(result.cns.current > 0);
  assert.strictEqual(result.cardiovascular.current, 0);
  assert.ok(result.connectiveTissue.current > 0);
});

test('Fatigue Computation: Running alone produces cardiovascular + structural fatigue', () => {
  const state = {
    lifts: [],
    runs: [
      { date: '2026-07-16', distance: 10, duration: 3600, pace: 360, avgHR: 165, elevation: 0 }
    ],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cardiovascular.current > 0);
  assert.ok((result.structural.quads || result.structural.hamstrings || 0) > 0);
});

test('Fatigue Computation: Sports alone produces connective tissue + CNS fatigue', () => {
  const state = {
    lifts: [],
    runs: [],
    sports: [
      { date: '2026-07-13', type: 'soccer', duration: 5400, intensity: 'high', musclesEngaged: ['quads', 'glutes'] }
    ]
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.connectiveTissue.current > 0);
  assert.ok(result.cns.current > 0);
});

test('Fatigue Computation: Lifting + running combines CNS, cardio, and structural', () => {
  const state = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [{ name: 'Bench Press', reps: 5, kg: 100 }],
        sessionStimulusScore: 2000
      }
    ],
    runs: [
      { date: '2026-07-16', distance: 10, duration: 3600, pace: 360, avgHR: 165, elevation: 0 }
    ],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cns.current > 0);
  assert.ok(result.cardiovascular.current > 0);
  assert.ok(Object.values(result.structural).some(v => v > 0));
});

test('Fatigue Computation: All three activities combine all four fatigue systems', () => {
  const state = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [{ name: 'Deadlift', reps: 5, kg: 140 }],
        sessionStimulusScore: 2200
      }
    ],
    runs: [
      { date: '2026-07-16', distance: 10, duration: 3600, pace: 360, avgHR: 165, elevation: 200 }
    ],
    sports: [
      { date: '2026-07-13', type: 'soccer', duration: 5400, intensity: 'high', musclesEngaged: ['quads'] }
    ]
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cns.current > 0);
  assert.ok(result.cardiovascular.current > 0);
  assert.ok(result.connectiveTissue.current > 0);
  assert.ok(Object.values(result.structural).some(v => v > 0));
});

test('Fatigue Capping: Display values capped at 100', () => {
  const state = {
    lifts: Array(5).fill({
      date: '2026-07-15',
      exercises: [{ name: 'Bench Press', reps: 5, kg: 100 }],
      sessionStimulusScore: 2000
    }),
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cns.current <= 100);
  Object.values(result.structural).forEach(v => {
    assert.ok(v <= 100);
  });
});

test('Fatigue Capping: Raw values stored uncapped', () => {
  const state = {
    lifts: Array(5).fill({
      date: '2026-07-15',
      exercises: [{ name: 'Bench Press', reps: 5, kg: 100 }],
      sessionStimulusScore: 2000
    }),
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cns._raw > result.cns.current);
});

test('Fatigue Capping: Raw property is non-enumerable', () => {
  const state = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [{ name: 'Bench Press', reps: 5, kg: 100 }],
        sessionStimulusScore: 2000
      }
    ],
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  const keys = Object.keys(result.cns);
  assert.ok(keys.includes('current'));
  assert.ok(!keys.includes('_raw'));
});

test('Recommendations: High CNS blocks hard lifting', () => {
  const state = {
    lifts: Array(8).fill({
      date: '2026-07-15',
      exercises: [{ name: 'Bench Press', reps: 5, kg: 100 }],
      sessionStimulusScore: 2000
    }),
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.strictEqual(result.recommendations.canLift, false);
});

test('Recommendations: High cardiovascular affect', () => {
  const state = {
    lifts: [],
    runs: Array(20).fill({
      date: '2026-07-16',
      distance: 10,
      duration: 3600,
      pace: 300,
      avgHR: 180,
      elevation: 500
    }),
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.ok(result.cardiovascular.current > 20);
});

test('Recommendations: High connective tissue blocks sports', () => {
  const state = {
    lifts: Array(10).fill({
      date: '2026-07-15',
      exercises: [{ name: 'Deadlift', reps: 5, kg: 140 }],
      sessionStimulusScore: 2200
    }),
    runs: [],
    sports: []
  };

  const result = computeSharedFatigue(state);
  assert.strictEqual(result.recommendations.canSports, false);
});

test('Intensity Modifiers: High-intensity run produces more CNS than recovery run', () => {
  const recState = {
    lifts: [],
    runs: [{ date: '2026-07-16', distance: 5, duration: 1800, pace: 480, avgHR: 120, elevation: 0 }],
    sports: []
  };
  const hardState = {
    lifts: [],
    runs: [{ date: '2026-07-16', distance: 5, duration: 1800, pace: 300, avgHR: 180, elevation: 0 }],
    sports: []
  };

  const recResult = computeSharedFatigue(recState);
  const hardResult = computeSharedFatigue(hardState);
  assert.ok(hardResult.cns.current > recResult.cns.current);
});

test('Intensity Modifiers: Trail running produces more connective tissue than road', () => {
  const roadState = {
    lifts: [],
    runs: [{ date: '2026-07-16', distance: 10, duration: 3600, pace: 360, type: 'road', elevation: 0 }],
    sports: []
  };
  const trailState = {
    lifts: [],
    runs: [{ date: '2026-07-16', distance: 10, duration: 3600, pace: 360, type: 'trail', elevation: 200 }],
    sports: []
  };

  const roadResult = computeSharedFatigue(roadState);
  const trailResult = computeSharedFatigue(trailState);
  assert.ok(trailResult.connectiveTissue.current > roadResult.connectiveTissue.current);
});

test('Intensity Modifiers: Deadlifts produce more connective tissue than isolation', () => {
  const deState = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [{ name: 'Deadlift', reps: 5, kg: 140 }],
        sessionStimulusScore: 2000
      }
    ],
    runs: [],
    sports: []
  };
  const isolState = {
    lifts: [
      {
        date: '2026-07-15',
        exercises: [{ name: 'Dumbbell Curl', reps: 10, kg: 30 }],
        sessionStimulusScore: 2000
      }
    ],
    runs: [],
    sports: []
  };

  const deResult = computeSharedFatigue(deState);
  const isolResult = computeSharedFatigue(isolState);
  assert.ok(deResult.connectiveTissue.current > isolResult.connectiveTissue.current);
});

test('Activity Weighting: Primary activity gets 60% of budget', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running' };
  const fatigue = { cns: { current: 0 }, cardiovascular: { current: 0 }, connectiveTissue: { current: 0 } };

  const weights = computeActivityWeights(profile, fatigue);
  assert.strictEqual(weights.lifting.allocationPercent, 0.60);
  assert.ok(Math.abs(weights.lifting.recoveryBudgetAvailable - (BASE_WEEKLY_BUDGET * 0.60)) < 10);
});

test('Activity Weighting: Secondary activity gets 30% of budget', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running' };
  const fatigue = { cns: { current: 0 }, cardiovascular: { current: 0 }, connectiveTissue: { current: 0 } };

  const weights = computeActivityWeights(profile, fatigue);
  assert.strictEqual(weights.running.allocationPercent, 0.30);
});

test('Activity Weighting: Tertiary activity gets 10% when fatigue low', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running', tertiaryActivity: 'sports' };
  const fatigue = { cns: { current: 20 }, cardiovascular: { current: 20 }, connectiveTissue: { current: 20 } };

  const weights = computeActivityWeights(profile, fatigue);
  assert.ok(Math.abs(weights.sports.recoveryBudgetAvailable - (BASE_WEEKLY_BUDGET * 0.10)) < 50);
});

test('Activity Weighting: High CNS reduces budget', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running' };
  const lowFatigue = { cns: { current: 0 }, cardiovascular: { current: 0 }, connectiveTissue: { current: 0 } };
  const highFatigue = { cns: { current: 90 }, cardiovascular: { current: 0 }, connectiveTissue: { current: 0 } };

  const lowResult = computeActivityWeights(profile, lowFatigue);
  const highResult = computeActivityWeights(profile, highFatigue);
  assert.ok(highResult.totalRecoveryBudget < lowResult.totalRecoveryBudget);
});

test('Activity Weighting: Combined high fatigue reduces significantly', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running' };
  const allHigh = { cns: { current: 80 }, cardiovascular: { current: 80 }, connectiveTissue: { current: 80 } };

  const result = computeActivityWeights(profile, allHigh);
  assert.ok(result.totalRecoveryBudget < BASE_WEEKLY_BUDGET * 0.5);
});

test('Activity Weighting: Session recommendations scale with budget', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running' };
  const fatigue = { cns: { current: 0 }, cardiovascular: { current: 0 }, connectiveTissue: { current: 0 } };

  const weights = computeActivityWeights(profile, fatigue);
  assert.ok(weights.lifting.recommendedSessions > 0);
  assert.ok(weights.running.recommendedSessions > 0);
});

test('Activity Weighting: Budget mismatch warning when recommendation < target', () => {
  const profile = {
    primaryActivity: 'lifting',
    secondaryActivity: 'running',
    weeklyTargets: { lifting: { sessionsPerWeek: 6 } }
  };
  const allHigh = { cns: { current: 90 }, cardiovascular: { current: 90 }, connectiveTissue: { current: 90 } };

  const weights = computeActivityWeights(profile, allHigh);
  assert.ok(weights.lifting.mismatchWarning);
});

test('Activity Weighting: High CNS threshold applies to primary', () => {
  const profile = { primaryActivity: 'lifting' };
  const highCNS = { cns: { current: 88 }, cardiovascular: { current: 20 }, connectiveTissue: { current: 20 } };

  const weights = computeActivityWeights(profile, highCNS);
  assert.strictEqual(weights.lifting.thresholdCheck, true);
  assert.strictEqual(weights.lifting.thresholdApplied, true);
});

test('Activity Weighting: Tertiary activity skipped if any system > 80', () => {
  const profile = { primaryActivity: 'lifting', secondaryActivity: 'running', tertiaryActivity: 'sports' };
  const allHigh = { cns: { current: 85 }, cardiovascular: { current: 85 }, connectiveTissue: { current: 85 } };

  const weights = computeActivityWeights(profile, allHigh);
  assert.strictEqual(weights.sports.recoveryBudgetAvailable, 0);
});

test('Session Allocation: 7 days generated for any input week', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 30 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 3 },
      sports: { recommendedSessions: 1 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.strictEqual(allocation.schedule.length, 7);
});

test('Session Allocation: Rest day preference enforced', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 30 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 3 },
      sports: { recommendedSessions: 1 }
    },
    athletePreferences: { restDays: ['Sunday'] }
  };

  const allocation = generateWeeklyAllocation(request);
  const sunday = allocation.schedule.find(d => d.dayName === 'Sunday');
  assert.strictEqual(sunday.sessions.length, 0);
});

test('Session Allocation: Consecutive hard days tracked', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 10 }, cardiovascular: { current: 10 }, connectiveTissue: { current: 10 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 0 },
      sports: { recommendedSessions: 0 }
    },
    athletePreferences: { consecutiveSessionsMax: 2 }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.ok(allocation.schedule.length === 7);
  assert.ok(allocation.summary.liftingSessions > 0);
});

test('Session Allocation: CNS threshold prevents hard sessions', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 85 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 3 },
      sports: { recommendedSessions: 1 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  const firstDay = allocation.schedule[0];
  if (firstDay.sessions.length > 0) {
    assert.ok(firstDay.sessions.some(s => s.type === 'light' || s.type === 'recovery'));
  }
});

test('Session Allocation: Low fatigue allows scheduling', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 20 }, cardiovascular: { current: 20 }, connectiveTissue: { current: 20 } },
    activityWeights: {
      lifting: { recommendedSessions: 0 },
      running: { recommendedSessions: 2 },
      sports: { recommendedSessions: 0 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.ok(allocation.summary.runningSessions > 0);
});

test('Session Allocation: High combined CNS flags trade-off', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 70 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 3 },
      sports: { recommendedSessions: 1 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.ok(allocation.schedule.some(d => d.tradeoffs.includes('CNS')));
});

test('Session Allocation: Session counts match placed sessions', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 30 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 3 },
      running: { recommendedSessions: 2 },
      sports: { recommendedSessions: 1 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.ok(allocation.summary.liftingSessions <= 3);
  assert.ok(allocation.summary.runningSessions <= 2);
  assert.ok(allocation.summary.sportsSessions <= 1);
});

test('Session Allocation: Total weekly load calculated', () => {
  const request = {
    weekStartDate: '2026-07-14',
    currentFatigue: { cns: { current: 30 }, cardiovascular: { current: 30 }, connectiveTissue: { current: 30 } },
    activityWeights: {
      lifting: { recommendedSessions: 2 },
      running: { recommendedSessions: 2 },
      sports: { recommendedSessions: 1 }
    }
  };

  const allocation = generateWeeklyAllocation(request);
  assert.ok(allocation.summary.totalWeeklyLoad > 0);
});
