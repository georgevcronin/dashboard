const test = require('node:test');
const assert = require('node:assert');

const { buildCardioRecommendation, buildCardioReasoningString } = require('../functions/cardioRecommendation');

test('buildCardioRecommendation: null when invalid recovery score', () => {
  assert.strictEqual(buildCardioRecommendation({ baseRecoveryScore: -5, cardioType: 'bike', sessions: [] }), null);
  assert.strictEqual(buildCardioRecommendation({ baseRecoveryScore: 150, cardioType: 'bike', sessions: [] }), null);
  assert.strictEqual(buildCardioRecommendation({ cardioType: 'bike', sessions: [] }), null);
});

test('buildCardioRecommendation: null for an unrecognized cardioType', () => {
  assert.strictEqual(buildCardioRecommendation({ baseRecoveryScore: 75, cardioType: 'yoga', sessions: [] }), null);
  assert.strictEqual(buildCardioRecommendation({ baseRecoveryScore: 75, sessions: [] }), null);
});

test('buildCardioRecommendation: valid bike recommendation has all expected fields', () => {
  const rec = buildCardioRecommendation({
    baseRecoveryScore: 75,
    cardioACWR: 1.0,
    sessions: [],
    profile: {},
    age: 30,
    cardioType: 'bike',
  });
  assert(rec);
  assert.strictEqual(rec.cardioType, 'bike');
  assert(rec.sessionType);
  assert(rec.readiness >= 0 && rec.readiness <= 100);
  assert(rec.duration.target > 0);
  assert(rec.hrZones, 'age-derived max HR should produce HR zones');
  assert(rec.reasoning.includes('bike'), 'reasoning should reference the actual activity, not running');
  assert(!rec.reasoning.toLowerCase().includes('run'), 'reasoning must not carry over running-specific wording');
});

test('buildCardioRecommendation: valid swim recommendation reasoning references swim, not bike/run', () => {
  const rec = buildCardioRecommendation({
    baseRecoveryScore: 75,
    cardioACWR: 1.0,
    sessions: [],
    profile: {},
    age: 30,
    cardioType: 'swim',
  });
  assert(rec.reasoning.includes('swim'));
  assert(!rec.reasoning.includes('bike'));
});

test('buildCardioRecommendation: caution for high ACWR', () => {
  const rec = buildCardioRecommendation({
    baseRecoveryScore: 75,
    cardioACWR: 1.8,
    sessions: [],
    cardioType: 'bike',
    age: 30,
  });
  assert(rec.cautions.some(c => c.includes('ACWR')));
});

test('buildCardioRecommendation: week session count tracks recent sessions of that type', () => {
  const recentDate = new Date();
  const sessions = [
    { date: recentDate.toISOString().slice(0, 10), cardioType: 'bike' },
  ];
  const rec = buildCardioRecommendation({
    baseRecoveryScore: 75,
    cardioACWR: 1.0,
    sessions,
    cardioType: 'bike',
    age: 30,
  });
  assert.strictEqual(rec.weekSessionCount, 1);
});

test('buildCardioReasoningString: rest day mentions the specific activity', () => {
  const reasoning = buildCardioReasoningString({
    readiness: 30, label: 'Very fatigued — rest recommended', sessionType: 'rest', weekSessionCount: 2, cautions: [], cardioType: 'swim',
  });
  assert(reasoning.includes('skip swim today'));
});

test('buildCardioReasoningString: zero sessions this week is called out', () => {
  const reasoning = buildCardioReasoningString({
    readiness: 70, label: 'Good for training', sessionType: 'easy', weekSessionCount: 0, cautions: [], cardioType: 'bike',
  });
  assert(reasoning.includes("haven't logged a bike session this week"));
});
