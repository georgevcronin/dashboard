// Two competing models for "how does muscle activation shift as a movement's
// angle changes", scored against the same source data.
//
// Model A (proposed): parameterised transfer functions applied to a flat
// baseline, then renormalised so the muscles sum to 100% —
//   upper pec    f(t) = 1.0 + 0.45*sin(pi*t/90)
//   lower pec    f(t) = cos(pi/2 * t/90)
//   front delt   f(t) = 1.0 + 1.2*(t/90)
//
// Model B (shipped): direct lookup in the interpolated-from-literature tables
// in chestHeadSplit.js and emgActivation.js, left unnormalised.
//
// This file exists because the choice between them is not a matter of taste,
// and the losing model is the more intuitive one — a closed-form curve reads
// as more principled than a hand-built table. It isn't here, and the three
// tests below are the reason. Keep them if the parameter sliders are extended:
// the failure modes they pin down are properties of the multiplicative-
// renormalised approach in general, not of these particular coefficients.
//
// A caveat this file has to state about its own scoring: the tables in Model B
// are themselves directional estimates interpolated from published EMG
// comparisons (Trebs et al. 2010, Rocha Jr. et al. 2007, Barnett et al. 1995,
// Solstad et al. 2020 for the chest split), not raw study output. They are not
// ground truth, and "Model A disagrees with Model B by 9.8 points" is not the
// same claim as "Model A is wrong by 9.8 points". What makes the result
// decisive is not the size of the disagreement but its shape: tests 2 and 3
// below fail against physiology directly, not merely against the tables.

const test = require('node:test');
const assert = require('node:assert');

const { CHEST_SPLIT_BY_ANGLE } = require('../functions/chestHeadSplit');
const { emgForAngle } = require('../functions/emgActivation');

const upperFn = t => 1.0 + 0.45 * Math.sin(Math.PI * t / 90);
const lowerFn = t => Math.cos((Math.PI / 2) * (t / 90));
const frontDeltFn = t => 1.0 + 1.2 * (t / 90);

const FLAT = CHEST_SPLIT_BY_ANGLE['0'];

// Model A evaluated exactly as specified: baseline x transfer function, then
// renormalised to 100. Renormalising is part of the proposal, so scoring it
// without that step would be attacking a model nobody put forward.
function modelA(angle) {
  const raw = {
    lower: FLAT.lower * lowerFn(angle),
    mid: FLAT.mid,
    upper: FLAT.upper * upperFn(angle),
  };
  const total = raw.lower + raw.mid + raw.upper;
  return {
    lower: raw.lower / total * 100,
    mid: raw.mid / total * 100,
    upper: raw.upper / total * 100,
  };
}

test('model A and the literature tables disagree, and the gap widens with angle', () => {
  const angles = [0, 15, 30, 45, 60];
  let totalErr = 0;
  let comparisons = 0;

  for (const angle of angles) {
    const a = modelA(angle);
    const b = CHEST_SPLIT_BY_ANGLE[String(angle)];
    for (const head of ['lower', 'mid', 'upper']) {
      totalErr += Math.abs(a[head] - b[head]);
      comparisons++;
    }
  }

  const meanErr = totalErr / comparisons;

  // Both models are pinned to the same flat baseline by construction, so the
  // whole of this error is disagreement about the effect of incline itself.
  assert.strictEqual(modelA(0).upper, FLAT.upper);
  assert.ok(meanErr > 5, `expected a substantial gap, got ${meanErr.toFixed(2)}pp`);

  // The disagreement is not noise around a shared trend — it grows monotonically
  // with angle, which is what "the two models describe different physiology"
  // looks like as opposed to "one is a slightly noisy copy of the other".
  const errAt = angle => Math.abs(modelA(angle).upper - CHEST_SPLIT_BY_ANGLE[String(angle)].upper);
  assert.ok(errAt(60) > errAt(45));
  assert.ok(errAt(45) > errAt(30));
  assert.ok(errAt(30) > errAt(15));
});

test('model A understates the incline effect it exists to describe', () => {
  // The entire point of an incline slider is that incline moves work onto the
  // clavicular fibres. The literature tables have upper pec going 20% -> 64%
  // of chest across the range. Model A moves it 20% -> 31%.
  //
  // So the model is not merely imprecise: applied to the one question the
  // control is for, it reports roughly a third of the effect its own source
  // literature describes, and a user dragging the slider to 60 degrees would
  // see most of the reason for doing so missing.
  const tableSwing = CHEST_SPLIT_BY_ANGLE['60'].upper - CHEST_SPLIT_BY_ANGLE['0'].upper;
  const modelSwing = modelA(60).upper - modelA(0).upper;

  assert.ok(tableSwing > 40, `table swing was ${tableSwing}`);
  assert.ok(modelSwing < 15, `model A swing was ${modelSwing.toFixed(1)}`);
  assert.ok(modelSwing < tableSwing / 2.5);
});

test('multiplicative transfer functions ignore the ceiling the unit already implies', () => {
  // This is the structural failure, and it is not fixable by retuning the
  // coefficient.
  //
  // These values are % of each muscle's OWN maximum. Front delt is already at
  // 97 during a flat press. Multiplying by (1 + 1.2*t/90) is a claim that it
  // can go on rising by another 120% — but the quantity being multiplied is
  // defined against that muscle's own ceiling, so a multiplier is the wrong
  // operator on it near the top of the range. The tables agree: front delt
  // barely moves from flat to overhead, because it has nowhere left to go.
  const flatPress = emgForAngle('press', 90)['front-delt'];
  const overheadPress = emgForAngle('press', 180)['front-delt'];

  const modelAOverhead = flatPress * frontDeltFn(90);

  assert.ok(modelAOverhead > 200, `model A predicted ${modelAOverhead.toFixed(1)}`);
  assert.ok(Math.abs(overheadPress - flatPress) < 5,
    'tables show front delt near-flat across this range');

  // emgActivation.js does allow values above 100 — a dynamic contraction can
  // exceed a static MVIC reference, and mid-delt legitimately reads 103-109.
  // So the objection is not "above 100 is impossible". It is that those real
  // excursions are ~10%, while an unbounded multiplier produces 213% and would
  // keep climbing with the parameter. Different order, different kind of claim.
  const tableMax = Math.max(...Object.values(emgForAngle('press', 135)));
  assert.ok(tableMax < 120, `largest table value in range was ${tableMax}`);
  assert.ok(modelAOverhead > tableMax * 1.75);
});

test('renormalising to 100 erases how hard a movement is', () => {
  // The proposal normalises every muscle set to sum to 100 so the numbers read
  // as shares of the exercise. The tables do not sum to 100, and the amount by
  // which they miss is itself the signal: total activation across a press rises
  // nearly fivefold from the bottom of the range to overhead.
  //
  // Renormalising sets that sum to exactly 100 at every angle. Two positions
  // with a 4.8x difference in total drive become indistinguishable — and since
  // the proposed fatigue term F = S*I*V*E*(EMG/100)^gamma reads the normalised
  // share, absolute demand drops out of the fatigue calculation entirely.
  const totalAt = angle => Object.values(emgForAngle('press', angle))
    .reduce((sum, v) => sum + v, 0);

  const low = totalAt(0);
  const high = totalAt(180);

  assert.ok(low < 150, `total at 0deg was ${low}`);
  assert.ok(high > 500, `total at 180deg was ${high}`);
  assert.ok(high / low > 4, 'total drive varies several-fold across the range');

  // Which is exactly the quantity `scale` exists to preserve, and why
  // activationAt returns these unnormalised.
  const normalised = angle => {
    const total = totalAt(angle);
    return Object.values(emgForAngle('press', angle)).map(v => v / total * 100);
  };
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum(normalised(0)) - 100) < 1e-9);
  assert.ok(Math.abs(sum(normalised(180)) - 100) < 1e-9);
});
