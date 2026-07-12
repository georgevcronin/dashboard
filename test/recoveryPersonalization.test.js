const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeAgeYears, trainingExperienceMonths, trainingMonthsIfKnown, personalizedRecoveryHours,
} = require('../functions/recoveryPersonalization');

test('computeAgeYears returns null with no dob', () => {
  assert.equal(computeAgeYears(null), null);
});

test('trainingExperienceMonths accrues past the originally-reported value over time', () => {
  const setAt = new Date(Date.now() - 18 * 30.44 * 86400000).toISOString(); // ~18 months ago
  const months = trainingExperienceMonths({ trainingExperienceYears: 3, trainingExperienceSetAt: setAt });
  assert.ok(months > 3 * 12, 'should have accrued beyond the originally-reported 3 years');
  assert.ok(Math.abs(months - (3 * 12 + 18)) < 1, `expected ~54 months, got ${months}`);
});

test('trainingMonthsIfKnown returns null (not 0) when the athlete never reported experience', () => {
  assert.equal(trainingMonthsIfKnown({}), null);
  assert.equal(trainingMonthsIfKnown({ trainingExperienceYears: 0 }), 0, 'an explicit 0 years is known data, not missing');
});

test('personalizedRecoveryHours lengthens recovery for an older, newer lifter', () => {
  const veteranYoung = personalizedRecoveryHours({ dob: '2001-01-01', trainingExperienceYears: 10, trainingExperienceSetAt: new Date().toISOString() });
  const noviceOld = personalizedRecoveryHours({ dob: '1955-01-01', trainingExperienceYears: 0, trainingExperienceSetAt: new Date().toISOString() });
  assert.ok(noviceOld.quads > veteranYoung.quads, 'an older, brand-new lifter should get longer recovery windows than an experienced young one');
});

test('personalizedRecoveryHours clamps to the 24-120h band', () => {
  const out = personalizedRecoveryHours({ dob: '1940-01-01', trainingExperienceYears: 0, trainingExperienceSetAt: new Date().toISOString() });
  for (const hl of Object.values(out)) {
    assert.ok(hl >= 24 && hl <= 120, `half-life ${hl} out of clamp range`);
  }
});
