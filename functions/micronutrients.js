// #7: micronutrient extraction from OpenFoodFacts' `nutriments` object.
// Press's barcode lookup (functions/index.js's /food/barcode) already fetches
// this data — it just discarded everything past calories/protein/carbs/fat.
// This is that data-plumbing extension, not new architecture.
//
// OFF's API normalizes every "_100g" mass-based nutrient field to grams
// uniformly (documented OFF API convention), regardless of how the product's
// label itself was entered (mg, µg, etc.) — the scaleToMg/scaleToUg factors
// below convert back to the units people actually read on a label. Only
// fields a product actually reports are ever returned — no fabricated zero
// for missing data, per PRODUCT.md's "raw values + RDA-relative framing, not
// a score" instruction (IDEA_LIST_TRIAGE.md #7).
//
// rda values are EU NRV (Regulation 1169/2011 Annex XIII) for a generic
// adult — the same reference OFF itself uses for %NRV on-pack, and a
// defensible default since Press has no per-sex/age micronutrient target
// model to compute something more tailored. null rda = no defined reference
// (sugar, cholesterol) — pctRDA returns null rather than a misleading 0%.
const MICRONUTRIENT_FIELDS = {
  'fiber_100g':       { key: 'fiber',       label: 'Fiber',       unit: 'g',  rda: 30 },
  'sugars_100g':      { key: 'sugar',       label: 'Sugar',       unit: 'g',  rda: null },
  'sodium_100g':      { key: 'sodium',      label: 'Sodium',      unit: 'mg', rda: 2300, scaleToMg: 1000 },
  'potassium_100g':   { key: 'potassium',   label: 'Potassium',   unit: 'mg', rda: 3500, scaleToMg: 1000 },
  'calcium_100g':     { key: 'calcium',     label: 'Calcium',     unit: 'mg', rda: 800, scaleToMg: 1000 },
  'iron_100g':        { key: 'iron',        label: 'Iron',        unit: 'mg', rda: 14, scaleToMg: 1000 },
  'magnesium_100g':   { key: 'magnesium',   label: 'Magnesium',   unit: 'mg', rda: 375, scaleToMg: 1000 },
  'zinc_100g':        { key: 'zinc',        label: 'Zinc',        unit: 'mg', rda: 10, scaleToMg: 1000 },
  'vitamin-c_100g':   { key: 'vitaminC',    label: 'Vitamin C',   unit: 'mg', rda: 80, scaleToMg: 1000 },
  'vitamin-a_100g':   { key: 'vitaminA',    label: 'Vitamin A',   unit: 'µg', rda: 800, scaleToMg: 1e6 },
  'vitamin-d_100g':   { key: 'vitaminD',    label: 'Vitamin D',   unit: 'µg', rda: 5, scaleToMg: 1e6 },
  'cholesterol_100g': { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', rda: null, scaleToMg: 1000 },
};

// nutriments: OpenFoodFacts' raw product.nutriments object. Returns
// { key: valueInDisplayUnit } for whichever fields the product reports.
function extractMicronutrients(nutriments) {
  if (!nutriments || typeof nutriments !== 'object') return {};
  const result = {};
  for (const [offField, def] of Object.entries(MICRONUTRIENT_FIELDS)) {
    const raw = nutriments[offField];
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
    const scaled = def.scaleToMg ? raw * def.scaleToMg : raw;
    result[def.key] = Math.round(scaled * 100) / 100;
  }
  return result;
}

// value: already in the display unit (extractMicronutrients' output).
function pctRDA(microKey, value) {
  const def = Object.values(MICRONUTRIENT_FIELDS).find(d => d.key === microKey);
  if (!def || def.rda == null || value == null) return null;
  return Math.round((value / def.rda) * 1000) / 10;
}

function labelFor(microKey) {
  const def = Object.values(MICRONUTRIENT_FIELDS).find(d => d.key === microKey);
  return def ? { label: def.label, unit: def.unit } : null;
}

module.exports = { MICRONUTRIENT_FIELDS, extractMicronutrients, pctRDA, labelFor };
