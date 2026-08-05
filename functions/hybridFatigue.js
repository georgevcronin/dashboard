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

// #103: Hybrid fatigue = lifting fatigue + running fatigue, unified ceiling
// Takes lifting-derived fatigue and adds running contribution
// Result: unified per-muscle fatigue score (0-100) fed to FATIGUE_CEILING
function computeHybridFatigue(lifts, runs, musclePeaks, soreness = {}, sensitivity = {}, recoveryHours = {}, profile = {}) {
  // Base fatigue from lifting (structural, CNS, metabolic combined)
  const liftingFatigue = computeCurrentFatigueScores(lifts || [], musclePeaks, soreness, sensitivity, recoveryHours);

  // Running contribution (especially lower body)
  const runningFatigue = runningFatigueByMuscle(runs || [], profile);

  // Merge: combine contributions, cap at 100
  const hybridFatigue = { ...liftingFatigue };
  for (const [muscle, runLoad] of Object.entries(runningFatigue)) {
    const base = hybridFatigue[muscle] || 0;
    // Don't simply sum (would exceed 100). Use Gabbett principle:
    // chronic load (base) is protective — high chronic load means
    // same acute load has less cumulative effect
    //
    // Formula: if chronic > 50%, acute is less impactful
    // combined = base + runLoad * (1 - base/100)^0.5
    const chronicFraction = Math.max(0, Math.min(1, base / 100));
    const protectionFactor = Math.sqrt(1 - chronicFraction); // sqrt(1 - chronic%)
    const combined = base + runLoad * protectionFactor;

    hybridFatigue[muscle] = Math.min(100, combined);
  }

  return hybridFatigue;
}

// Diagnostic: show which muscles are limited by running vs. lifting
function hybridFatigueBreakdown(lifts, runs, musclePeaks, soreness = {}, sensitivity = {}, recoveryHours = {}, profile = {}) {
  const liftingFatigue = computeCurrentFatigueScores(lifts || [], musclePeaks, soreness, sensitivity, recoveryHours);
  const runningFatigue = runningFatigueByMuscle(runs || [], profile);

  const allMuscles = new Set([
    ...Object.keys(liftingFatigue || {}),
    ...Object.keys(runningFatigue || {}),
  ]);

  const breakdown = {};
  for (const muscle of allMuscles) {
    breakdown[muscle] = {
      lifting: liftingFatigue[muscle] || 0,
      running: runningFatigue[muscle] || 0,
      hybrid: (liftingFatigue[muscle] || 0) + (runningFatigue[muscle] || 0),
      limitedBy: (liftingFatigue[muscle] || 0) > (runningFatigue[muscle] || 0) ? 'lifting' : 'running',
    };
  }

  return breakdown;
}

module.exports = {
  computeHybridFatigue,
  runningFatigueByMuscle,
  hybridFatigueBreakdown,
};
