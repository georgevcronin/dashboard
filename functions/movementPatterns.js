const { RECOVERY_H, findExercise } = require('./muscleTaxonomy');

const WINDOW_H = 336;
const liftTime = (l) => new Date(l.start || l.date).getTime();

// A pattern recovers no faster than its slowest contributing muscle — a squat
// is "back to fresh" when the glutes are, not when the calves are.
function patternHalfLife(exercise, recoveryHours) {
  const primaries = exercise.primary || [];
  const hs = primaries.map(m => recoveryHours[m] || RECOVERY_H[m] || 72);
  return hs.length ? Math.max(...hs) : 72;
}

// Fatigue and volume by movement pattern rather than by muscle. The two answer
// different questions: muscle fatigue says the chest is cooked, pattern fatigue
// says horizontal pressing is cooked — which is what actually blocks
// substituting dumbbell bench for barbell bench.
//
// Normalised against the pattern's own heaviest day in the window rather than a
// peaks table: there is no per-pattern equivalent of musclePeaks, and a
// self-relative scale is honest about being relative.
function computePatternFatigue(lifts, recoveryHours = RECOVERY_H, now = Date.now()) {
  const acc = {};

  for (const l of (lifts || [])) {
    const t = liftTime(l);
    if (Number.isNaN(t)) continue;
    const hoursAgo = (now - t) / 3_600_000;
    if (hoursAgo > WINDOW_H || hoursAgo < 0) continue;

    const ex = findExercise(l.exercise);
    if (!ex || !ex.pattern) continue;

    const load = (l.kg || 0) * (l.reps || 1);
    const p = acc[ex.pattern] || (acc[ex.pattern] = {
      pattern: ex.pattern, volume: 0, sets: 0, residual: 0, lastTs: null, byDay: {},
    });

    p.volume += load;
    p.sets += 1;
    p.residual += load * Math.exp(-0.693 * hoursAgo / patternHalfLife(ex, recoveryHours));
    p.byDay[l.date] = (p.byDay[l.date] || 0) + load;
    if (p.lastTs === null || t > p.lastTs) p.lastTs = t;
  }

  return Object.values(acc)
    .map(p => {
      const peakDay = Math.max(0, ...Object.values(p.byDay));
      return {
        pattern: p.pattern,
        volume: Math.round(p.volume),
        sets: p.sets,
        fatigue: peakDay ? Math.min(100, Math.round(p.residual / peakDay * 100)) : 0,
        hoursSince: p.lastTs === null ? null : Math.round((now - p.lastTs) / 3_600_000),
      };
    })
    .sort((a, b) => b.fatigue - a.fatigue || b.volume - a.volume);
}

module.exports = { computePatternFatigue, WINDOW_H };
