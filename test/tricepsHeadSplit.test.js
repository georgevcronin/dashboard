const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EXTENSION_HEAD_SPLIT_BY_ANGLE, extensionHeadSplitForAngle } = require('../functions/tricepsHeadSplit');
const { ANGLES } = require('../functions/emgActivation');

test('every angle in EXTENSION_HEAD_SPLIT_BY_ANGLE sums to exactly 100, and covers every PressRowBuilder extension angle', () => {
  for (const a of ANGLES) {
    const split = EXTENSION_HEAD_SPLIT_BY_ANGLE[a];
    assert.ok(split, `EXTENSION_HEAD_SPLIT_BY_ANGLE missing angle ${a}`);
    assert.equal(split.long + split.lateral + split.medial, 100, `angle ${a} should sum to 100`);
  }
});

test('extensionHeadSplitForAngle: low angle (pushdown/lying) favors lateral+medial, high angle (overhead) favors the long head', () => {
  const low = extensionHeadSplitForAngle(0);
  const mid = extensionHeadSplitForAngle(90);
  const high = extensionHeadSplitForAngle(180);
  assert.ok(high.long > mid.long && mid.long > low.long, 'long-head share should increase as angle rises toward overhead');
  assert.ok(low.lateral + low.medial > high.lateral + high.medial, 'lateral+medial combined share should decrease as angle rises');
});

test('extensionHeadSplitForAngle returns null for an angle outside the 15deg grid', () => {
  assert.equal(extensionHeadSplitForAngle(37), null);
});
