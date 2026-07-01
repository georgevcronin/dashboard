// Deterministic weekly training structure generator.
//
// Encodes the shared, non-dogmatic training ethos as actual rules rather than
// LLM judgment: effort near failure matters more than hitting an exact split;
// don't load a muscle already near its fatigue ceiling; compound "boring but
// effective" movements are the backbone, novel variations are accessory only;
// frequency/volume trade off against systemic (CNS/metabolic) fatigue rather
// than following a fixed template. The LLM is only used afterwards to turn
// this structured skeleton into readable session titles/detail text.

const { EXERCISE_DB } = require('./exerciseDb');

const ALL_MUSCLES = [
  'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'erectors',
  'chest', 'abs', 'obliques', 'biceps', 'triceps', 'forearms', 'traps',
  'front-delt', 'rear-delt', 'lats', 'rhomboids', 'neck',
];

const MUSCLE_GROUPS = {
  push: ['chest', 'front-delt', 'triceps'],
  pull: ['lats', 'rhomboids', 'traps', 'rear-delt', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
};
const CORE_MUSCLES = ['abs', 'obliques', 'erectors', 'neck'];

const FATIGUE_CEILING = 65; // ethos: don't load a muscle already this fatigued

// Compound-first exercise selection: excludes lesserKnown (novel/accessory)
// variations, which the ethos treats as a "final 5%" addition, not a starting
// strategy. Picks the exercises whose primary muscles best cover the target set.
function pickBackboneExercises(targetMuscles, { travelMode, count = 2 } = {}) {
  const pool = EXERCISE_DB.filter(e =>
    !e.lesserKnown &&
    (travelMode ? e.equipment === 'bodyweight' : true) &&
    e.primary.some(m => targetMuscles.includes(m))
  );
  const scored = pool
    .map(e => ({ e, score: e.primary.filter(m => targetMuscles.includes(m)).length }))
    .sort((a, b) => b.score - a.score);
  const out = [];
  for (const { e } of scored) {
    if (out.some(o => o.name === e.name)) continue;
    out.push(e);
    if (out.length >= count) break;
  }
  return out;
}

// Per-muscle priority: -1 means "do not load this week" (injured or already at/over
// the fatigue ceiling); otherwise higher = fresher = more deserving of stimulus.
function computeMusclePriority(currentFatigue, offlineMuscles) {
  const priority = {};
  for (const m of ALL_MUSCLES) {
    if (offlineMuscles.includes(m)) { priority[m] = -1; continue; }
    const fatigue = currentFatigue[m] || 0;
    priority[m] = fatigue >= FATIGUE_CEILING ? -1 : (100 - fatigue);
  }
  return priority;
}

function scoreBucket(muscles, priority) {
  const avail = muscles.filter(m => priority[m] >= 0);
  if (!avail.length) return null;
  return { muscles: avail, score: avail.reduce((s, m) => s + priority[m], 0) / avail.length };
}

// How many genuine lifting sessions this week, and how much per-session effort is
// reasonable, is exactly the "stimulus vs. fatigue" lever the ethos describes as a
// legitimate trade-off rather than a fixed rule. Systemic (CNS/metabolic) fatigue
// pulls the count down; low systemic fatigue with several fresh muscle groups pulls
// it up toward higher frequency.
function planLiftDayCount(weekCNS, weekMetabolic, availableBucketCount) {
  let days = 4;
  if (weekCNS > 70 || weekMetabolic > 70) days = 2;
  else if (weekCNS > 40 || weekMetabolic > 40) days = 3;
  return Math.max(0, Math.min(days, availableBucketCount === 0 ? 0 : availableBucketCount + 1));
}

function generateWeeklyStructure({ weekDates, currentFatigue, weekMetabolic, weekCNS, offlineMuscles, travelMode, dataMature }) {
  const priority = computeMusclePriority(currentFatigue || {}, offlineMuscles || []);

  const buckets = Object.entries(MUSCLE_GROUPS)
    .map(([name, muscles]) => {
      const scored = scoreBucket(muscles, priority);
      return scored ? { name, ...scored } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const liftDayCount = planLiftDayCount(weekCNS, weekMetabolic, buckets.length);

  // Rotation order: highest-priority buckets first, repeating from the top once
  // liftDayCount exceeds the number of distinct buckets available this week.
  const rotation = [];
  for (let i = 0; i < liftDayCount; i++) rotation.push(buckets[i % buckets.length]);

  // Spread lift days across the week so no two are adjacent where possible ("no
  // consecutive heavy sessions"), interleaving cardio/rest into the gaps.
  const days = weekDates.map(d => ({ ...d, kind: null }));
  const liftSlots = [];
  if (liftDayCount > 0) {
    const gap = Math.max(1, Math.floor(7 / liftDayCount));
    for (let i = 0, pos = 0; i < liftDayCount; i++, pos += gap) liftSlots.push(Math.min(pos, 6));
  }
  // De-duplicate slot collisions from rounding by nudging forward into the next free day.
  const usedSlots = new Set();
  const finalSlots = liftSlots.map(s => {
    while (usedSlots.has(s) && s < 6) s++;
    usedSlots.add(s);
    return s;
  });

  finalSlots.forEach((slot, i) => {
    days[slot].kind = 'lift';
    days[slot].bucket = rotation[i];
  });

  // Remaining open days: one Norwegian 4x4 HIIT (mandatory), some zone2, rest of what's left as rest.
  const openIdx = days.map((d, i) => i).filter(i => days[i].kind === null);
  let hiitPlaced = false;
  openIdx.forEach((i, j) => {
    if (!hiitPlaced && weekCNS < 60) { days[i].kind = 'hiit'; hiitPlaced = true; return; }
    days[i].kind = j % 2 === 0 ? 'zone2' : 'rest';
  });
  if (!hiitPlaced) {
    // CNS too fatigued for HIIT anywhere open — still place it on the least-bad open day
    // (or the last day) since a weekly plan without any conditioning is worse than a
    // deliberately easy one; note stays honest about the trade-off via the text pass.
    const fallback = openIdx[openIdx.length - 1] ?? 6;
    days[fallback].kind = 'hiit';
  }

  const DURATION_MIN = { lift: 60, hiit: 25, zone2: 40, rest: 0 };

  return days.map(d => {
    if (d.kind === 'lift') {
      const backbone = pickBackboneExercises(d.bucket.muscles, { travelMode });
      return {
        date: d.date, label: d.label, type: 'lift', duration: DURATION_MIN.lift,
        targetMuscles: d.bucket.muscles,
        backboneExercises: backbone.map(e => e.name),
        rationale: dataMature
          ? `Proven stimulus — ${d.bucket.muscles.join(', ')} freshest this week, load compound movements close to failure.`
          : `Early-stage — ${d.bucket.muscles.join(', ')} targeted; vary rep range session to session to build a response profile.`,
      };
    }
    if (d.kind === 'hiit') return { date: d.date, label: d.label, type: 'hiit', duration: DURATION_MIN.hiit, rationale: 'Norwegian 4x4 conditioning.' };
    if (d.kind === 'zone2') return { date: d.date, label: d.label, type: 'zone2', duration: DURATION_MIN.zone2, rationale: 'Aerobic base, recovery-friendly intensity.' };
    return { date: d.date, label: d.label, type: 'rest', duration: DURATION_MIN.rest, rationale: 'No available fresh muscle groups or systemic fatigue too high for productive loading.' };
  });
}

module.exports = { generateWeeklyStructure, ALL_MUSCLES, MUSCLE_GROUPS, CORE_MUSCLES, FATIGUE_CEILING };
