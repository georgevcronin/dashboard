// Detail levels: how much of the model the interface shows, and nothing else.
//
// The contract this module exists to protect is that expertise is a *display*
// input only. Nothing here is imported by sessionPlanner, weeklyPlanner,
// fatigue or progression, and nothing here returns a number that feeds them —
// today's recommendation is identical at every level, and only the amount of
// reasoning printed around it changes. If a future change makes the engine
// read a level, that's the bug, not a missing feature.

const EXPERTISE_LEVELS = ['beginner', 'intermediate', 'scientist'];

const EXPERTISE_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  scientist: 'Sport Scientist',
};

const EXPERTISE_BLURBS = {
  beginner: 'What to train today, in plain language. No percentages.',
  intermediate: 'Adds the numbers behind it — recovery percentages, strength ranking, e1RM.',
  scientist: 'The whole model — structural/metabolic/CNS fatigue split, and adaptation estimates.',
};

// Accounts predating this setting already see everything, so the default has
// to be the most detailed level. Defaulting any lower would silently strip
// panels out of a dashboard someone already reads daily.
const DEFAULT_EXPERTISE = 'scientist';

function normalizeExpertise(value) {
  return EXPERTISE_LEVELS.includes(value) ? value : DEFAULT_EXPERTISE;
}

function expertiseRank(level) {
  return EXPERTISE_LEVELS.indexOf(normalizeExpertise(level));
}

function expertiseAtLeast(level, min) {
  return expertiseRank(level) >= EXPERTISE_LEVELS.indexOf(min);
}

function expertiseAtMost(level, max) {
  return expertiseRank(level) <= EXPERTISE_LEVELS.indexOf(max);
}

// Lowest level each Recovery tab appears at. Soreness and Injuries are absent
// deliberately: they're how the athlete puts data *in*, so withholding them
// would degrade the model rather than just simplify the view. Types
// (structural/metabolic/CNS split) and Adaptation are the two that only mean
// anything if you already read the fatigue model, hence scientist.
const RECOVERY_TAB_MIN_LEVEL = {
  fatigue: 'beginner',
  ranking: 'intermediate',
  types: 'scientist',
  adaptation: 'scientist',
  patterns: 'scientist',
};

function visibleRecoveryTabs(order, hidden, level) {
  const hiddenSet = new Set(hidden || []);
  return (order || []).filter(id =>
    !hiddenSet.has(id) && expertiseAtLeast(level, RECOVERY_TAB_MIN_LEVEL[id] || 'beginner'));
}

const PANEL_STATES = ['collapsed', 'standard', 'expanded'];

// Where a panel starts before the user has ever set it, per detail level.
// Beginner folds the two retrospective panels away so the page opens on what
// to do today; Sport Scientist gives Recovery the double-width slot because
// it's the panel that actually grows at that level. An explicit choice in
// Settings always wins — this only fills in the gaps.
const PANEL_STATE_DEFAULTS = {
  beginner: { s6: 'collapsed', s7: 'collapsed' },
  intermediate: {},
  scientist: { s5: 'expanded' },
};

function defaultPanelState(id, level) {
  return PANEL_STATE_DEFAULTS[normalizeExpertise(level)]?.[id] || 'standard';
}

// An explicitly stored state wins; anything unset or unrecognised falls back
// to the level's default, so adding a panel needs no data migration.
function resolvePanelState(id, storedStates, level) {
  const stored = storedStates?.[id];
  return PANEL_STATES.includes(stored) ? stored : defaultPanelState(id, level);
}

module.exports = {
  EXPERTISE_LEVELS, EXPERTISE_LABELS, EXPERTISE_BLURBS, DEFAULT_EXPERTISE,
  normalizeExpertise, expertiseAtLeast, expertiseAtMost,
  RECOVERY_TAB_MIN_LEVEL, visibleRecoveryTabs,
  PANEL_STATES, PANEL_STATE_DEFAULTS, defaultPanelState, resolvePanelState,
};
