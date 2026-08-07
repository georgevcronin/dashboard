'use strict';

// Seeded PRNG (mulberry32) so a bad run is reproducible with the same seed
// instead of "it broke once and I can't get it back."
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CORE_LIFTS = ['Barbell Bench Press', 'Back Squat', 'Conventional Deadlift', 'Barbell Overhead Press', 'Seated Cable Row', 'Lat Pulldown (Wide Grip)'];

// Each archetype exists to stress a specific code path — not a realism
// exercise. Weights sum to 1.
const ARCHETYPES = [
  { key: 'consistent', weight: 0.35, adherence: [0.8, 0.95], daysPerWeek: [3, 5], progressionPctPerWeek: [0.5, 1.2], nutritionLogRate: [0.6, 0.9] },
  { key: 'erratic', weight: 0.2, adherence: [0.25, 0.55], daysPerWeek: [2, 5], progressionPctPerWeek: [-0.3, 0.8], nutritionLogRate: [0.1, 0.4] },
  { key: 'overreaching', weight: 0.15, adherence: [0.9, 1.0], daysPerWeek: [5, 7], progressionPctPerWeek: [1.5, 3], nutritionLogRate: [0.3, 0.7] },
  { key: 'underloading', weight: 0.15, adherence: [0.4, 0.7], daysPerWeek: [1, 2], progressionPctPerWeek: [-0.5, 0.2], nutritionLogRate: [0.3, 0.7] },
  { key: 'injury-taper', weight: 0.1, adherence: [0.7, 0.9], daysPerWeek: [3, 5], progressionPctPerWeek: [0.5, 1.2], nutritionLogRate: [0.4, 0.8] },
  { key: 'beginner-sparse', weight: 0.05, adherence: [0.2, 0.5], daysPerWeek: [1, 3], progressionPctPerWeek: [1, 2.5], nutritionLogRate: [0.1, 0.5] },
];

function pickArchetype(rand) {
  const r = rand();
  let acc = 0;
  for (const a of ARCHETYPES) { acc += a.weight; if (r <= acc) return a; }
  return ARCHETYPES[0];
}

function between(rand, [lo, hi]) { return lo + rand() * (hi - lo); }

function generatePersonas(count, seed) {
  const rand = mulberry32(seed);
  const personas = [];
  for (let i = 0; i < count; i++) {
    const a = pickArchetype(rand);
    const sex = rand() < 0.5 ? 'male' : 'female';
    const heightCm = Math.round(sex === 'male' ? between(rand, [165, 195]) : between(rand, [152, 180]));
    const startWeightKg = Math.round(between(rand, [55, 110]));
    personas.push({
      id: `sim-${String(i).padStart(3, '0')}-${a.key}`,
      // Kept separate from `id`: USERNAME_RE is [a-z0-9-]+ max 20 chars,
      // DISPLAY_NAME_RE forbids digits — `id` (with its numeric index and
      // archetype tag) satisfies neither, so registerPersona() needs its
      // own safe values rather than deriving them from `id`.
      username: `sim-${i}`,
      displayName: `Sim ${a.key}`,
      archetype: a.key,
      sex,
      heightCm,
      startWeightKg,
      adherence: between(rand, a.adherence),
      daysPerWeek: Math.round(between(rand, a.daysPerWeek)),
      progressionPctPerWeek: between(rand, a.progressionPctPerWeek),
      nutritionLogRate: between(rand, a.nutritionLogRate),
      sleepBaseHours: between(rand, [5.5, 8.5]),
      sleepVariance: between(rand, [0.3, 2]),
      // injury-taper personas get one injury event roughly a third of the way in
      injuryDay: a.key === 'injury-taper' ? Math.round(between(rand, [40, 80])) : null,
      taperDays: a.key === 'injury-taper' ? Math.round(between(rand, [10, 25])) : 0,
      // per-lift starting weight, scaled off bodyweight so it's not identical across personas
      startingLifts: Object.fromEntries(CORE_LIFTS.map(name => [name, Math.round((startWeightKg * (0.3 + rand() * 0.9)) / 2.5) * 2.5])),
      rand, // kept so run.js can keep drawing from this persona's own stream
    });
  }
  return personas;
}

module.exports = { generatePersonas, CORE_LIFTS, mulberry32 };
