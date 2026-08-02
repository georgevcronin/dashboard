const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPERTISE_LEVELS, DEFAULT_EXPERTISE, normalizeExpertise,
  expertiseAtLeast, expertiseAtMost,
  RECOVERY_TAB_MIN_LEVEL, visibleRecoveryTabs,
  PANEL_STATES, defaultPanelState, resolvePanelState,
} = require('../functions/expertise');

const ALL_TABS = ['fatigue', 'ranking', 'types', 'adaptation', 'soreness', 'injuries'];

// The whole point of the feature: a level is a display filter, so an account
// that has never set one must land on the level that hides nothing.
test('an unset or unrecognised level falls back to the most detailed one', () => {
  assert.equal(DEFAULT_EXPERTISE, 'scientist');
  assert.equal(normalizeExpertise(undefined), 'scientist');
  assert.equal(normalizeExpertise(null), 'scientist');
  assert.equal(normalizeExpertise(''), 'scientist');
  assert.equal(normalizeExpertise('expert'), 'scientist');
  assert.equal(normalizeExpertise('BEGINNER'), 'scientist');
});

test('normalizeExpertise passes through every real level unchanged', () => {
  for (const lvl of EXPERTISE_LEVELS) assert.equal(normalizeExpertise(lvl), lvl);
});

test('expertiseAtLeast orders beginner < intermediate < scientist', () => {
  assert.ok(expertiseAtLeast('beginner', 'beginner'));
  assert.ok(!expertiseAtLeast('beginner', 'intermediate'));
  assert.ok(!expertiseAtLeast('beginner', 'scientist'));
  assert.ok(expertiseAtLeast('intermediate', 'beginner'));
  assert.ok(expertiseAtLeast('intermediate', 'intermediate'));
  assert.ok(!expertiseAtLeast('intermediate', 'scientist'));
  assert.ok(expertiseAtLeast('scientist', 'scientist'));
  assert.ok(expertiseAtLeast('scientist', 'beginner'));
});

test('expertiseAtMost is the mirror of atLeast, so min/max never both hide a block', () => {
  for (const level of EXPERTISE_LEVELS) {
    for (const bound of EXPERTISE_LEVELS) {
      assert.equal(
        expertiseAtLeast(level, bound) && expertiseAtMost(level, bound),
        level === bound,
        `${level} vs ${bound}`);
    }
  }
});

test('recovery tabs unlock cumulatively as the level rises', () => {
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, [], 'beginner'), ['fatigue', 'soreness', 'injuries']);
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, [], 'intermediate'), ['fatigue', 'ranking', 'soreness', 'injuries']);
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, [], 'scientist'), ALL_TABS);
});

// Soreness and Injuries are how the athlete feeds the model. Gating them would
// make a lower detail level degrade the data, not just the view.
test('the tabs the athlete inputs data through are never gated by level', () => {
  for (const lvl of EXPERTISE_LEVELS) {
    const tabs = visibleRecoveryTabs(ALL_TABS, [], lvl);
    assert.ok(tabs.includes('soreness'), `soreness missing at ${lvl}`);
    assert.ok(tabs.includes('injuries'), `injuries missing at ${lvl}`);
  }
  assert.equal(RECOVERY_TAB_MIN_LEVEL.soreness, undefined);
  assert.equal(RECOVERY_TAB_MIN_LEVEL.injuries, undefined);
});

test('hiding a tab in Settings and gating it by level compose, in either order', () => {
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, ['fatigue'], 'beginner'), ['soreness', 'injuries']);
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, ['types'], 'scientist'),
    ['fatigue', 'ranking', 'adaptation', 'soreness', 'injuries']);
});

test('visibleRecoveryTabs preserves the user-chosen tab order, not the canonical one', () => {
  const reordered = ['injuries', 'soreness', 'fatigue'];
  assert.deepEqual(visibleRecoveryTabs(reordered, [], 'beginner'), reordered);
});

test('visibleRecoveryTabs tolerates missing order/hidden rather than throwing', () => {
  assert.deepEqual(visibleRecoveryTabs(undefined, undefined, 'scientist'), []);
  assert.deepEqual(visibleRecoveryTabs(ALL_TABS, undefined, 'beginner'), ['fatigue', 'soreness', 'injuries']);
});

test('panel defaults simplify at Beginner and widen Recovery at Sport Scientist', () => {
  assert.equal(defaultPanelState('s7', 'beginner'), 'collapsed');
  assert.equal(defaultPanelState('s6', 'beginner'), 'collapsed');
  assert.equal(defaultPanelState('s3', 'beginner'), 'standard');
  assert.equal(defaultPanelState('s7', 'intermediate'), 'standard');
  assert.equal(defaultPanelState('s5', 'scientist'), 'expanded');
  assert.equal(defaultPanelState('s5', 'beginner'), 'standard');
});

test('every default panel state is one the layout actually implements', () => {
  for (const lvl of EXPERTISE_LEVELS) {
    for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) {
      assert.ok(PANEL_STATES.includes(defaultPanelState(id, lvl)), `${id}@${lvl}`);
    }
  }
});

test('an explicit panel state always beats the level default', () => {
  assert.equal(resolvePanelState('s7', { s7: 'standard' }, 'beginner'), 'standard');
  assert.equal(resolvePanelState('s5', { s5: 'collapsed' }, 'scientist'), 'collapsed');
});

test('resolvePanelState ignores stored junk instead of passing it to the DOM', () => {
  assert.equal(resolvePanelState('s7', { s7: 'huge' }, 'beginner'), 'collapsed');
  assert.equal(resolvePanelState('s7', {}, 'beginner'), 'collapsed');
  assert.equal(resolvePanelState('s7', null, 'beginner'), 'collapsed');
  assert.equal(resolvePanelState('s7', undefined, 'intermediate'), 'standard');
});

// Guards the contract in functions/expertise.js's header: the engine must not
// be able to read a detail level. If a planner ever imports this, today's
// recommendation could differ between levels, which is the one thing the
// feature promises can't happen.
test('no engine module imports the expertise gating', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ENGINE = ['sessionPlanner.js', 'weeklyPlanner.js', 'splitPlanner.js', 'fatigue.js',
                  'progression.js', 'muscleTaxonomy.js', 'adaptation.js', 'muscleCapacity.js'];
  for (const file of ENGINE) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'functions', file), 'utf8');
    assert.ok(!src.includes('expertise'), `${file} references expertise`);
  }
});
