// Per-user, live-computed equipment-brand calibration — the "keep weight
// numbers honest across different machines/brands" half of the equipment
// consistency work (machine brand + cable pulley-type tagging). No crowd to
// source from yet (this is currently a sole-user app — see PRODUCT.md), so
// this computes each athlete's own cross-brand ratio directly from their own
// lift history instead of pooling across users via a Cloud Function; the
// per-user computation here is the same math a crowdsourced version would
// need per-user anyway, just not yet fed into anything cross-user.
//
// Only meaningful per exercise, not per broad equipment category — two
// different leg press machines from different manufacturers can have
// genuinely different resistance curves, and a "machine" broad-category
// average would blur that rather than correct for it.

const { e1rm } = require('./strengthStandards');

// Two same-exercise sessions on different brands within this many days of
// each other are treated as "close enough in time that real strength change
// is unlikely to explain the gap" — grounded in the same detraining-timeline
// reasoning weeklyPlanner.js's stalenessBoost uses (negligible measurable
// change in the first 1-2 weeks), with a little extra room since this needs
// an actual pair to compare, not just a single data point.
const CLOSE_WINDOW_DAYS = 21;

// Median rather than mean — a single outlier session (unusually good/bad
// day) shouldn't swing the whole brand ratio the way it would pull a mean.
function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Returns { [exerciseName]: { referenceBrand, multipliers: { [brand]: ratio } } }
// for every exercise logged on 2+ brands with at least one close-in-time
// cross-brand pair. `ratio` for a brand is referenceBrand's e1RM divided by
// that brand's e1RM for matched-in-time sessions — >1 means the brand reads
// lighter than the reference for the same true output (so its logged
// weights should be scaled up before comparing against reference-brand
// history), <1 means it reads heavier.
function computeBrandCalibration(lifts) {
  const byExercise = {};
  for (const l of (lifts || [])) {
    if (!l.machine || !l.exercise || !l.kg || !l.reps || !l.date) continue;
    const est = e1rm(l.kg, l.reps);
    if (!est) continue;
    const key = l.exercise;
    if (!byExercise[key]) byExercise[key] = [];
    byExercise[key].push({ brand: l.machine, date: l.date, e1rm: est });
  }

  const result = {};
  for (const [exercise, entries] of Object.entries(byExercise)) {
    const brands = [...new Set(entries.map(e => e.brand))];
    if (brands.length < 2) continue;

    const countByBrand = {};
    for (const e of entries) countByBrand[e.brand] = (countByBrand[e.brand] || 0) + 1;
    // Most-logged brand is the most reliable anchor to calibrate everything
    // else against.
    const referenceBrand = [...brands].sort((a, b) => countByBrand[b] - countByBrand[a])[0];
    const referenceEntries = entries.filter(e => e.brand === referenceBrand);

    const multipliers = {};
    for (const brand of brands) {
      if (brand === referenceBrand) continue;
      const pairRatios = [];
      for (const a of entries.filter(e => e.brand === brand)) {
        const aMs = new Date(a.date).getTime();
        const close = referenceEntries
          .map(r => ({ r, gapDays: Math.abs(new Date(r.date).getTime() - aMs) / 86_400_000 }))
          .filter(({ gapDays }) => gapDays <= CLOSE_WINDOW_DAYS)
          .sort((x, y) => x.gapDays - y.gapDays);
        if (close.length) pairRatios.push(close[0].r.e1rm / a.e1rm);
      }
      if (pairRatios.length) multipliers[brand] = median(pairRatios);
    }
    if (Object.keys(multipliers).length) result[exercise] = { referenceBrand, multipliers };
  }
  return result;
}

// Scales a raw e1RM computed from a specific brand's logged weight into
// reference-brand-equivalent terms, using an already-computed calibration
// table (computeBrandCalibration). Returns the raw value unchanged when
// there's no calibration data for that exercise/brand — never guesses.
function calibratedE1RM(rawE1RM, exercise, brand, calibrationTable) {
  const entry = calibrationTable?.[exercise];
  if (!entry || !brand || brand === entry.referenceBrand) return rawE1RM;
  const multiplier = entry.multipliers[brand];
  return multiplier ? rawE1RM * multiplier : rawE1RM;
}

module.exports = { computeBrandCalibration, calibratedE1RM, CLOSE_WINDOW_DAYS };
