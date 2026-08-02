// Alternative versions of today's session, each built by re-running the same
// generator under one changed constraint, plus a measured description of what
// that constraint cost.
//
// Two rules this module exists to hold, both borrowed from recommendation.js:
//
//   1. It generates, it doesn't invent. Every variant comes out of
//      sessionPlanner.js's generateSessionExercises with the same athlete
//      inputs and the same target muscles as the recommended session — only
//      the named constraint differs. There is no second, simpler exercise
//      picker in here.
//
//   2. Every trade-off is a measured difference between two sessions that
//      were actually generated: minutes, working sets, exercise names,
//      muscles left without a dedicated exercise, equipment required. The
//      obvious temptation is to write "about 15% less hypertrophic stimulus"
//      next to the short session. Press has never compared a predicted
//      stimulus against an observed outcome, so that number would be
//      decoration. Comparisons here are all things you could verify by
//      reading the two exercise lists side by side.
//
// The base session is included as a variant ('recommended') so the interface
// can render one uniform list, and so its own duration/set count come from
// the same measurement code as everything it's compared against.

const { EXERCISE_DB } = require('./exerciseDb');
const { pickBackboneExercises } = require('./weeklyPlanner');
const {
  generateSessionExercises, estimateSessionDurationMin, capSessionDuration,
  fillSessionToDuration, fatigueCeilingFor,
} = require('./sessionPlanner');

// The short session's ceiling. Deliberately not the 20-minute floor of S3's
// Max Length slider: at 20 minutes a session is one exercise, which isn't an
// alternative plan so much as a different activity. 30 keeps two or three
// exercises, so the comparison is still about the same session.
const SHORT_SESSION_MIN = 30;

// Each variant is one constraint applied to the recommended session's own
// inputs. `overrides` are merged into the generateSessionExercises call;
// `maxDurationMin` (when set) additionally drives the cap/fill pass, the same
// way the slider does.
const VARIANTS = [
  {
    key: 'recommended',
    label: 'Recommended',
    premise: "Today's session as Press would plan it, with no extra constraint.",
    overrides: {},
  },
  {
    key: 'short',
    label: 'Short session',
    premise: `The most useful ${SHORT_SESSION_MIN} minutes of the same session.`,
    overrides: {},
    maxDurationMin: SHORT_SESSION_MIN,
  },
  {
    key: 'lowCns',
    label: 'Easy on the nervous system',
    premise: 'Machine, cable and Smith work in place of free-weight compounds, so effort can stay high without balance or technique becoming the limit.',
    overrides: { lowCnsMode: true, preferStable: true },
  },
  {
    key: 'bodyweight',
    // Named for what the engine can actually guarantee. "Home gym" would
    // imply Press knows what equipment is at home, which it has never been
    // told — travelMode restricts selection to bodyweight and nothing else.
    label: 'No equipment',
    premise: 'Bodyweight only — nothing that needs a rack, a machine or a loadable implement.',
    overrides: { travelMode: true },
  },
];

const entryFor = name => EXERCISE_DB.find(e => e.name.toLowerCase() === String(name || '').toLowerCase()) || null;

function workingSetCount(exercises) {
  return (exercises || []).reduce((n, ex) => n + (ex.sets || []).filter(s => s.type !== 'W').length, 0);
}

// A muscle counts as genuinely trained only when some exercise's own main
// mover is that muscle — the same #1-primary test generateSessionExercises'
// widening step uses. Appearing third in a compound's primary list is real
// stimulus but thin, and calling it "covered" would let a variant claim
// coverage it doesn't deliver.
function dedicatedMuscles(exercises) {
  const out = new Set();
  for (const ex of exercises || []) {
    const entry = entryFor(ex.name);
    if (entry?.primary?.length) out.add(entry.primary[0]);
  }
  return out;
}

function equipmentUsed(exercises) {
  const out = new Set();
  for (const ex of exercises || []) {
    const entry = entryFor(ex.name);
    if (entry?.equipment) out.add(entry.equipment);
  }
  return [...out].sort();
}

function measure(exercises) {
  return {
    exerciseCount: (exercises || []).length,
    workingSets: workingSetCount(exercises),
    durationMin: estimateSessionDurationMin(exercises || []),
    muscles: [...dedicatedMuscles(exercises)].sort(),
    equipment: equipmentUsed(exercises),
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const list = (items, conjunction = 'and') => (items.length <= 2 ? items.join(` ${conjunction} `)
  : `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`);

// "bodyweight" is the absence of equipment, so it belongs in the equipment
// list (it's what the session uses) but never in the requirements diff —
// "needs bodyweight" is not a constraint anyone can fail to meet.
const REQUIREMENTS = equipment => equipment.filter(e => e !== 'bodyweight');

// Differences only, and only the ones a reader would act on. An empty array
// is a legitimate result: a constraint that changed nothing should say so by
// producing no trade-offs, not by inventing a downside to look thorough.
function compareToBase(variantStats, baseStats) {
  const out = [];

  const dMin = variantStats.durationMin - baseStats.durationMin;
  if (dMin !== 0) {
    out.push({
      key: 'duration',
      direction: dMin < 0 ? 'less' : 'more',
      text: `${plural(Math.abs(dMin), 'minute')} ${dMin < 0 ? 'shorter' : 'longer'}`,
    });
  }

  const dSets = variantStats.workingSets - baseStats.workingSets;
  if (dSets !== 0) {
    out.push({
      key: 'volume',
      direction: dSets < 0 ? 'less' : 'more',
      text: `${plural(Math.abs(dSets), 'working set')} ${dSets < 0 ? 'fewer' : 'more'}`,
    });
  }

  const dropped = baseStats.muscles.filter(m => !variantStats.muscles.includes(m));
  if (dropped.length) {
    out.push({
      key: 'dropped',
      direction: 'less',
      text: `no dedicated work for ${list(dropped)}`,
      muscles: dropped,
    });
  }

  const added = variantStats.muscles.filter(m => !baseStats.muscles.includes(m));
  if (added.length) {
    out.push({
      key: 'added',
      direction: 'more',
      text: `adds dedicated work for ${list(added)}`,
      muscles: added,
    });
  }

  // Equipment is the whole point of some variants (the low-CNS one changes
  // nothing else — same length, same set count, same muscles), so leaving it
  // out makes those read as a free lunch.
  const baseNeeds = REQUIREMENTS(baseStats.equipment);
  const variantNeeds = REQUIREMENTS(variantStats.equipment);

  const freed = baseNeeds.filter(e => !variantNeeds.includes(e));
  if (freed.length) {
    out.push({ key: 'equipmentFreed', direction: 'less', text: `no ${list(freed, 'or')} needed`, equipment: freed });
  }

  const needs = variantNeeds.filter(e => !baseNeeds.includes(e));
  if (needs.length) {
    out.push({ key: 'equipmentNeeded', direction: 'more', text: `needs ${list(needs)}`, equipment: needs });
  }

  return out;
}

// A variant is worth offering only if it differs from the recommended session
// in the exercises themselves. One that returns an identical list is a
// constraint today's session already happens to satisfy — showing it as a
// choice would imply a decision the athlete doesn't actually have.
function sameExercises(a, b) {
  const names = xs => (xs || []).map(x => String(x.name || '').toLowerCase()).sort().join('|');
  return names(a) === names(b);
}

// `inputs` is exactly what functions/index.js already assembles for
// /plan/session-exercises — passed through untouched so a variant can never
// be generated from a different view of the athlete than the recommendation
// it is being compared against.
function buildSessionVariants({ inputs, baseExercises, currentFatigue = {}, metabolicFatigue = 0, backboneCount } = {}) {
  if (!inputs?.targetMuscles?.length) return [];

  const ceiling = fatigueCeilingFor(metabolicFatigue);
  const generate = variant => {
    const opts = { ...inputs, ...variant.overrides };
    // The backbone has to be re-picked under the variant's own constraint
    // rather than carried over from the recommended session.
    // backboneExerciseNames is resolved by name and filtered only on muscle,
    // so a bodyweight variant handed the recommended session's Barbell Bench
    // Press keeps it — and then reports itself as needing no equipment while
    // requiring a barbell. A variant with no overrides is the recommended
    // session itself and keeps whatever backbone the caller already chose.
    const backboneExerciseNames = Object.keys(variant.overrides).length
      ? pickBackboneExercises(opts.targetMuscles, {
        travelMode: opts.travelMode,
        lifts: opts.lifts,
        favoriteExercises: opts.favoriteExercises,
        preferStable: opts.preferStable,
        ...(backboneCount != null ? { count: backboneCount } : {}),
      }).map(e => (e.isAngleFamily ? { name: e.name, angle: e.angle } : { name: e.name }))
      : inputs.backboneExerciseNames;

    const cap = variant.maxDurationMin ?? inputs.maxDurationMin ?? null;
    const exercises = generateSessionExercises({ ...opts, backboneExerciseNames, maxDurationMin: cap });
    return fillSessionToDuration(capSessionDuration(exercises, currentFatigue, cap), cap, ceiling);
  };

  const base = baseExercises?.length ? baseExercises : generate(VARIANTS[0]);
  const baseStats = measure(base);

  const out = [{
    key: 'recommended', label: VARIANTS[0].label, premise: VARIANTS[0].premise,
    exercises: base, ...baseStats, tradeoffs: [], identical: false,
  }];

  for (const variant of VARIANTS.slice(1)) {
    let exercises;
    try {
      exercises = generate(variant);
    } catch {
      continue;
    }
    // A constraint can legitimately leave nothing selectable — bodyweight
    // against a target list of muscles with no bodyweight exercise in
    // EXERCISE_DB. Dropping the variant is the honest outcome; an empty
    // session presented as an option is not an option.
    if (!exercises?.length) continue;
    if (sameExercises(exercises, base)) continue;

    const stats = measure(exercises);
    // A time-capped variant is only an alternative if it actually saves time.
    // When the recommended session already comes in under the cap, offering a
    // "short session" that runs the same length or longer is a false choice.
    if (variant.maxDurationMin && stats.durationMin >= baseStats.durationMin) continue;

    out.push({
      key: variant.key, label: variant.label, premise: variant.premise,
      exercises, ...stats,
      tradeoffs: compareToBase(stats, baseStats),
      identical: false,
    });
  }

  return out;
}

module.exports = {
  buildSessionVariants, VARIANTS, SHORT_SESSION_MIN,
  measure, compareToBase, dedicatedMuscles, equipmentUsed, workingSetCount,
};
