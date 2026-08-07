// #103: Lifting/Running Interference Management
// Combines structural/CNS fatigue from lifting with running load impact
// Unified fatigue ceiling prevents over-stressing across modalities
//
// Scientific basis: Gabbett (2016) — higher chronic load is protective
// (athletes adapted to high load tolerate acute spikes better than those with
// low chronic base). Do NOT use separate caps; integrate into one FATIGUE_CEILING.
// See RUNNING_SCIENCE.md §#103

const { computeCurrentFatigueScores } = require('./fatigue');
const { computeRunningACWR, computeMetabolicFatigue, computeCNSFatigue } = require('./fatigue');
const { dailyLoadsFromRuns } = require('./runningLoad');
// #17 extension: bike/swim contribute to the same unified ceiling running
// already does, via the same Gabbett-principle merge below — see
// cardio.js's cardioFatigueByMuscle for the per-modality muscle split.
const { cardioFatigueByMuscle } = require('./cardio');

// Running contribution to muscle fatigue (lower body focus)
// Running creates structural fatigue in legs, cardiovascular stress, and CNS load
// Map running load to muscle groups affected
//
// Lower body muscles are primary targets of distance running:
// - Glutes, quads, hamstrings, calves: 60% of running load
// - Erectors, adductors: 20% of running load
// - Everything else: 20% distributed (CNS, general metabolic)
//
// Scale: 1 unit of running TRIMP load ≈ 0.3-0.5 units of structural fatigue
// (running is less concentrative than lifting, more distributed)
function runningFatigueByMuscle(runs, profile = {}) {
  if (!runs || !runs.length) return {};

  const dailyLoads = dailyLoadsFromRuns(runs, profile);
  const totalRunLoad = Object.values(dailyLoads).reduce((a, b) => a + b, 0);

  // Normalize: average daily running load over past 7 days (approximate)
  // Decay: running fatigue clears faster than lifting (3-7 days vs. 7-14)
  // Use structural decay from 7 days ago (half-life ~3 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentRunLoad = Object.entries(dailyLoads)
    .filter(([date]) => new Date(date) >= sevenDaysAgo)
    .reduce((sum, [_, load]) => sum + load, 0);

  if (recentRunLoad < 2) return {}; // Negligible running load (threshold: ~5 min moderate run)

  // Scale running load to structural fatigue (0.4x multiplier)
  // Running is lower mechanical tension than lifting; less tissue damage
  const runFatigueMagnitude = recentRunLoad * 0.4;

  // Distribution: lower body 60%, secondary 20%, other 20%
  const lowerBodyMuscles = {
    glutes: 0.20,        // 20% of 60%
    quads: 0.20,
    hamstrings: 0.12,
    calves: 0.08,
    erectors: 0.10,      // 10% of 60% + some from core
    adductors: 0.05,
  };

  const secondaryMuscles = {
    abs: 0.04,           // 4% from core engagement
    obliques: 0.03,      // 3%
    chest: 0.02,         // Arm swing
    front_delt: 0.02,
  };

  const runFatigue = {};

  // Primary lower body
  for (const [muscle, fraction] of Object.entries(lowerBodyMuscles)) {
    runFatigue[muscle] = runFatigueMagnitude * fraction;
  }

  // Secondary muscles
  for (const [muscle, fraction] of Object.entries(secondaryMuscles)) {
    runFatigue[muscle] = (runFatigueMagnitude * 0.2) * fraction;
  }

  return runFatigue;
}

// Applies the same Gabbett-principle protective merge computeHybridFatigue
// always used for running to any additional per-muscle contribution map —
// chronic load (the current combined base) is protective, so the same
// acute contribution has less cumulative effect against a higher base.
// combined = base + load * sqrt(1 - base/100)
function mergeFatigueContribution(base, contribution) {
  const merged = { ...base };
  for (const [muscle, load] of Object.entries(contribution)) {
    const current = merged[muscle] || 0;
    const chronicFraction = Math.max(0, Math.min(1, current / 100));
    const protectionFactor = Math.sqrt(1 - chronicFraction);
    merged[muscle] = Math.min(100, current + load * protectionFactor);
  }
  return merged;
}

// #103 (+ #17 extension): hybrid fatigue = lifting + running + bike + swim,
// one unified ceiling. Each modality merges in via the same Gabbett-
// principle formula in turn (order doesn't change the ceiling-capping
// intent, just which contribution "sees" the others as already-chronic).
// Result: unified per-muscle fatigue score (0-100) fed to FATIGUE_CEILING.
function computeHybridFatigue(lifts, runs, musclePeaks, soreness = {}, sensitivity = {}, recoveryHours = {}, profile = {}, sports = []) {
  const liftingFatigue = computeCurrentFatigueScores(lifts || [], musclePeaks, soreness, sensitivity, recoveryHours);
  const runningFatigue = runningFatigueByMuscle(runs || [], profile);
  const bikeFatigue = cardioFatigueByMuscle(sports, profile, 'bike');
  const swimFatigue = cardioFatigueByMuscle(sports, profile, 'swim');

  let hybridFatigue = mergeFatigueContribution(liftingFatigue, runningFatigue);
  hybridFatigue = mergeFatigueContribution(hybridFatigue, bikeFatigue);
  hybridFatigue = mergeFatigueContribution(hybridFatigue, swimFatigue);
  return hybridFatigue;
}

// Diagnostic: show which muscles are limited by which modality.
function hybridFatigueBreakdown(lifts, runs, musclePeaks, soreness = {}, sensitivity = {}, recoveryHours = {}, profile = {}, sports = []) {
  const liftingFatigue = computeCurrentFatigueScores(lifts || [], musclePeaks, soreness, sensitivity, recoveryHours);
  const runningFatigue = runningFatigueByMuscle(runs || [], profile);
  const bikeFatigue = cardioFatigueByMuscle(sports, profile, 'bike');
  const swimFatigue = cardioFatigueByMuscle(sports, profile, 'swim');

  const allMuscles = new Set([
    ...Object.keys(liftingFatigue || {}), ...Object.keys(runningFatigue || {}),
    ...Object.keys(bikeFatigue || {}), ...Object.keys(swimFatigue || {}),
  ]);

  const breakdown = {};
  for (const muscle of allMuscles) {
    const byModality = { lifting: liftingFatigue[muscle] || 0, running: runningFatigue[muscle] || 0, bike: bikeFatigue[muscle] || 0, swim: swimFatigue[muscle] || 0 };
    const limitedBy = Object.entries(byModality).sort((a, b) => b[1] - a[1])[0][0];
    breakdown[muscle] = { ...byModality, hybrid: Object.values(byModality).reduce((a, b) => a + b, 0), limitedBy };
  }

  return breakdown;
}

module.exports = {
  computeHybridFatigue,
  runningFatigueByMuscle,
  hybridFatigueBreakdown,
};
