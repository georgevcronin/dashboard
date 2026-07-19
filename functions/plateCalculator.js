// Pure plate-loading math for WorkoutLogger's Plate Calculator — extracted
// out of src/app.jsx per this app's usual pattern for non-trivial pure logic
// (see ARCHITECTURE.md), even though nothing server-side actually calls it,
// so it's covered by npm test instead of only ever exercised by hand in a
// browser.

// Standard bumper-plate set, kg. Doesn't attempt to handle arbitrary custom
// plate collections beyond the disable-what-you-don't-have toggle list in
// the UI — good enough for "what do I load" at a normal gym, not a
// plate-inventory system.
const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

// Greedy largest-first fill — correct as long as the available set is a
// normal plate progression (each denomination a clean multiple/fraction of
// its neighbors, which the standard set above always is); not a general
// coin-change solver, doesn't need to be for a real plate set.
function platesForWeight(targetKg, barKg, availablePlates) {
  const perSide = Math.round(((targetKg - barKg) / 2) * 100) / 100;
  if (perSide <= 0) return { plates: [], leftover: 0, perSide };
  let remaining = perSide;
  const plates = [];
  for (const p of [...availablePlates].sort((a, b) => b - a)) {
    let count = 0;
    while (remaining >= p - 0.001) { remaining = Math.round((remaining - p) * 100) / 100; count++; }
    if (count) plates.push({ plate: p, count });
  }
  return { plates, leftover: Math.max(0, remaining), perSide };
}

module.exports = { platesForWeight, STANDARD_PLATES_KG };
