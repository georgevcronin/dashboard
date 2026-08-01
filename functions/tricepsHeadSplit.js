// Triceps-head split (long/lateral/medial) per exercise angle — informational
// only, same principle as functions/chestHeadSplit.js: does NOT touch
// fatigue.js/adaptation.js's 'triceps' computation at all, so 'triceps'
// stays outside a workout numerically comparable to every other unsplit
// muscle. The 3-way breakdown below is surfaced only inside a workout
// (which head a given extension angle actually emphasizes), never fed into
// the shared fatigue/stimulus pipeline as its own tracked muscle.
//
// Keyed on functions/emgActivation.js's own extension axis (0° = arm at
// your side / pushdown / lying extension, 180° = arm overhead), not a
// separate axis of its own -- extension's angle IS the same physical
// quantity this split needs, unlike fly (which needed its own axis
// distinct from chestHeadSplit's bench-incline one).
//
// Grounded in Maeo et al. 2023 (European Journal of Sport Science): the
// triceps long head is biarticular (crosses the shoulder as well as the
// elbow), so it's genuinely stretched more in the overhead position than
// the neutral/arms-down one -- that study found significantly greater
// long-head hypertrophy training overhead vs. neutral (+28.5% vs +19.6%),
// and greater whole-triceps growth overall (+19.9% vs +13.9%). Lateral and
// medial heads are monoarticular (elbow only) and aren't meaningfully
// biased by shoulder/arm position on their own -- their SHARE below
// declines toward 180° not because their own engagement drops, but because
// long head's relative contribution grows as the stretch increases. Same
// caveat as chestHeadSplit.js: no single study measured all three heads
// continuously across this exact axis -- directional estimates from the
// stretch-mechanism finding, not raw per-angle study data.
const EXTENSION_HEAD_SPLIT_BY_ANGLE = {
  0:   { long: 25, lateral: 40, medial: 35 },
  15:  { long: 27, lateral: 39, medial: 34 },
  30:  { long: 29, lateral: 38, medial: 33 },
  45:  { long: 32, lateral: 37, medial: 31 },
  60:  { long: 35, lateral: 36, medial: 29 },
  75:  { long: 38, lateral: 34, medial: 28 },
  90:  { long: 41, lateral: 33, medial: 26 },
  105: { long: 44, lateral: 31, medial: 25 },
  120: { long: 46, lateral: 30, medial: 24 },
  135: { long: 48, lateral: 28, medial: 24 },
  150: { long: 49, lateral: 28, medial: 23 },
  165: { long: 50, lateral: 27, medial: 23 },
  180: { long: 50, lateral: 27, medial: 23 },
};

// Returns { long, lateral, medial } for an extension angle (0-180°, 15°
// steps), or null for an angle outside that grid.
function extensionHeadSplitForAngle(angle) {
  return EXTENSION_HEAD_SPLIT_BY_ANGLE[angle] || null;
}

module.exports = { EXTENSION_HEAD_SPLIT_BY_ANGLE, extensionHeadSplitForAngle };
