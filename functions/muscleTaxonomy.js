// Single source of truth for the muscle taxonomy and exercise->muscle attribution.
//
// This used to be three independently hand-maintained copies (functions/index.js,
// functions/weeklyPlanner.js, src/app.jsx), each a name-substring keyword table
// covering only ~18 of the ~31 muscles exerciseDb.js actually tracks per exercise
// (primary/secondary). That drifted: hyphenated names ("Pull-Up") never matched
// space-separated keywords ("pull up"), single-letter-collision keys ("ab" matching
// inside "Cable") silently misattributed fatigue, and newer muscles added to
// exerciseDb.js (mid-delt, rotator-cuff, tibialis, ...) were invisible to fatigue
// tracking and to the deterministic session generator's muscle-bucket targeting —
// 14 exercises (all lateral raises, both rotator-cuff isolation moves, both
// tibialis raises, both hammer curl variants) could never be selected at all,
// since their entire `primary` array fell outside the old 18-muscle list.
//
// Fix: derive the muscle list from exerciseDb.js instead of hand-copying it, and
// resolve exercise -> muscles by looking the exercise up in EXERCISE_DB by name
// first (exact, case-insensitive — no substring ambiguity possible). The keyword
// table only exists now as a fallback for names that aren't in the database
// (custom exercises, Hevy-imported names that don't match canonical naming).

const { EXERCISE_DB } = require('./exerciseDb');

const BY_NAME = new Map(EXERCISE_DB.map(e => [e.name.toLowerCase(), e]));

function findExercise(name) {
  return BY_NAME.get((name || '').toLowerCase()) || null;
}

// Every muscle exerciseDb.js ever names as a primary or secondary target,
// derived rather than hand-copied so a new exercise's muscle tags automatically
// become visible to fatigue tracking and session generation without a second
// edit anywhere else.
const ALL_MUSCLES = [...new Set(EXERCISE_DB.flatMap(e => [...(e.primary || []), ...(e.secondary || [])]))].sort();

// Illustrative recovery half-lives in hours, not clinical guidance (matches the
// spirit of the pre-existing values this extends) — smaller/stabilizer muscles
// recover faster, larger prime movers slower.
const RECOVERY_H = {
  quads: 72, glutes: 72, hamstrings: 72, calves: 48, adductors: 72, abductors: 60,
  chest: 72, triceps: 48, biceps: 48, brachialis: 48, brachioradialis: 36,
  lats: 72, rhomboids: 48, traps: 48, 'lower-traps': 48, 'mid-traps': 48,
  erectors: 72, abs: 36, obliques: 36, core: 36, 'transverse-abs': 36,
  'front-delt': 48, 'rear-delt': 48, 'mid-delt': 48, shoulders: 48, 'rotator-cuff': 48,
  serratus: 36, 'teres-major': 48, forearms: 36, 'hip-flexors': 48, tibialis: 36,
};

// Which of ALL_MUSCLES actually appear as a `primary` target somewhere — those
// are the only ones exercise-selection buckets need to cover, since
// pickBackboneExercises/pickAccessories only ever match against e.primary.
const PRIMARY_MUSCLES = [...new Set(EXERCISE_DB.flatMap(e => e.primary || []))].sort();

// Muscle-group buckets for weekly freshness scoring (functions/weeklyPlanner.js).
// Every entry in PRIMARY_MUSCLES must appear in exactly one bucket below, or a
// whole class of exercises silently becomes unselectable again — see the header.
const MUSCLE_GROUPS = {
  push: ['chest', 'front-delt', 'mid-delt', 'triceps'],
  pull: ['lats', 'rhomboids', 'traps', 'lower-traps', 'mid-traps', 'rear-delt', 'rotator-cuff', 'biceps', 'brachialis', 'brachioradialis', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip-flexors', 'tibialis'],
  core: ['abs', 'obliques', 'erectors', 'transverse-abs', 'core'],
};

if (process.env.NODE_ENV !== 'production') {
  const bucketed = new Set(Object.values(MUSCLE_GROUPS).flat());
  const missing = PRIMARY_MUSCLES.filter(m => !bucketed.has(m));
  if (missing.length) throw new Error(`muscleTaxonomy: MUSCLE_GROUPS is missing bucket(s) for: ${missing.join(', ')}`);
}

// Fallback keyword table for exercise names not found in EXERCISE_DB (custom
// exercises, imported history with non-canonical naming). Matched as whole
// words against the name with hyphens normalized to spaces first, so
// "Pull-Up"/"pull up" are equivalent and "ab" can never match inside "cable".
const KEYWORD_FALLBACK = {
  'hack squat': ['quads', 'glutes'], squat: ['quads', 'glutes', 'hamstrings'],
  'leg press': ['quads', 'glutes'], 'leg curl': ['hamstrings'], 'leg extension': ['quads'],
  lunge: ['quads', 'glutes', 'hamstrings'], 'hip thrust': ['glutes'], glute: ['glutes'],
  deadlift: ['hamstrings', 'glutes', 'erectors', 'lats'], rdl: ['hamstrings', 'glutes', 'erectors'],
  calf: ['calves'], 'pull up': ['lats', 'biceps'], 'chin up': ['lats', 'biceps'],
  'lat pulldown': ['lats', 'biceps'], pulldown: ['lats', 'biceps'], row: ['lats', 'rhomboids', 'biceps'],
  'bench press': ['chest', 'triceps', 'front-delt'], 'chest press': ['chest', 'triceps', 'front-delt'],
  fly: ['chest', 'front-delt'], dip: ['chest', 'triceps'], 'push up': ['chest', 'triceps', 'front-delt'],
  'overhead press': ['front-delt', 'triceps'], 'shoulder press': ['front-delt', 'triceps'],
  'lateral raise': ['mid-delt'], 'face pull': ['rear-delt', 'rhomboids'],
  tricep: ['triceps'], triceps: ['triceps'], skullcrusher: ['triceps'],
  bicep: ['biceps'], curl: ['biceps'], 'hammer curl': ['brachialis', 'brachioradialis'],
  ab: ['abs'], abs: ['abs'], crunch: ['abs'], plank: ['abs'], 'sit up': ['abs'],
  oblique: ['obliques'], shrug: ['traps'], trap: ['traps'],
  forearm: ['forearms'], wrist: ['forearms'],
  abduction: ['abductors'], abductor: ['abductors'], adduction: ['adductors'], adductor: ['adductors'],
  tibialis: ['tibialis'], 'rotator cuff': ['rotator-cuff'],
};

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const FALLBACK_MATCHERS = Object.entries(KEYWORD_FALLBACK).map(([key, muscles]) => ({
  re: new RegExp(`\\b${escapeRegex(key)}\\b`),
  muscles,
}));

function normalizeForMatch(name) {
  return (name || '').toLowerCase().replace(/-/g, ' ');
}

// Muscles trained by a logged exercise name — DB lookup first (exact, so no
// substring ambiguity), falling back to whole-word keyword matching for names
// that aren't in EXERCISE_DB at all. Returns [] if nothing matches (silently
// dropping fatigue attribution is the old, wrong behavior; callers should treat
// an empty result as "unattributable" rather than pretend it's fine).
function musclesForExercise(name) {
  const entry = findExercise(name);
  if (entry) return [...new Set([...(entry.primary || []), ...(entry.secondary || [])])];
  const normalized = normalizeForMatch(name);
  for (const { re, muscles } of FALLBACK_MATCHERS) {
    if (re.test(normalized)) return muscles;
  }
  return [];
}

const LEG_MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip-flexors', 'tibialis'];
const LOWER_BODY_FALLBACK = /\b(squat|deadlift|leg press|lunge|hip thrust|romanian|rdl)\b/;

// True for exercises whose double-progression weight increment should be 5kg
// (lower-body/hip-hinge pattern) instead of 2.5kg — DB lookup first (checks the
// exercise's real primary muscles), keyword fallback for unknown names.
function isLowerBodyExercise(name) {
  const entry = findExercise(name);
  if (entry) return (entry.primary || []).some(m => LEG_MUSCLES.includes(m));
  return LOWER_BODY_FALLBACK.test(normalizeForMatch(name));
}

// Unified compound/CNS-taxing list — previously two different hand-copied lists
// (functions/index.js's CNS_COMPOUND and src/app.jsx's COMPOUND) that had
// silently drifted to cover different exercise sets. Not derivable purely from
// primary-muscle count (e.g. Hammer Curl has 2 primary muscles but isn't
// CNS-heavy), so this stays an explicit, whole-word-matched list — just one of
// them now, normalized against hyphens like everything else here.
// "row" is generic (not "barbell row") so it also catches the T-bar/cable/
// dumbbell/machine variants in exerciseDb.js — those are equally multi-joint
// pulling compounds, just previously missed because only the literal phrase
// "barbell row" was listed, silently undercounting session CNS load on any
// back day built around them instead of the specific barbell variant.
const COMPOUND_FALLBACK = /\b(squat|deadlift|hack squat|bench press|overhead press|leg press|row|pull up|chin up|hip thrust|power clean|hang clean|push press)\b/;
function isCompoundExercise(name) {
  return COMPOUND_FALLBACK.test(normalizeForMatch(name));
}

// Used by weeklyPlanner.js/sessionPlanner.js's exercise scoring to heavily
// prefer whatever the athlete has actually done before over something novel —
// case-insensitive since logged history (Hevy imports especially) is
// inconsistently cased against exerciseDb.js's canonical Title Case names.
function loggedExerciseNames(lifts) {
  return new Set((lifts || []).map(l => (l.exercise || '').toLowerCase()).filter(Boolean));
}

module.exports = {
  ALL_MUSCLES, PRIMARY_MUSCLES, RECOVERY_H, MUSCLE_GROUPS,
  findExercise, musclesForExercise, isLowerBodyExercise, isCompoundExercise, loggedExerciseNames,
};
