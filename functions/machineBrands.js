// Default machine/equipment-brand suggestions for the "Machine/technique" tag
// field (see strengthStandards.js's comment on why the tag exists — it lets
// sessions on a genuinely different machine be blended separately instead of
// pooled as if they had the same resistance curve). Before this, the tag's
// datalist only ever offered brands the user had personally typed before;
// this seeds it with real manufacturers so it's useful from the first set.
//
// Only machine/cable/smith exercises get a brand list — a barbell or
// dumbbell has no brand-specific leverage/curve, it's just a bar, so
// offering brand suggestions there wouldn't mean anything.
//
// Bucketed by physical machine type rather than per exercise name: a given
// gym's leg press, chest press, and lat pulldown all come from the same
// manufacturer roster, so a finer split wouldn't reflect how gyms are
// actually equipped. Researched against the UK's three biggest commercial
// chains — PureGym and The Gym Group both run on Matrix Fitness (Matrix has
// held the Gym Group contract since 2008, most recently renewed for £25m);
// JD Gyms takes a multi-supplier approach across Life Fitness, Technogym,
// True Fitness and FreeMotion — plus the other manufacturers that competed
// for those same contracts (Precor, Cybex) or supply the UK's independent/
// premium gym market (Panatta, Nautilus, Star Trac, Watson Gym Equipment,
// Primal Strength, BLK BOX).

const SELECTORIZED_BRANDS = [
  'Life Fitness', 'Hammer Strength', 'Matrix Fitness', 'Technogym',
  'Precor', 'Cybex', 'Panatta', 'Nautilus', 'Star Trac',
];

const CABLE_BRANDS = [
  'Life Fitness', 'Matrix Fitness', 'Technogym', 'Cybex',
  'FreeMotion', 'Precor', 'Panatta', 'Hammer Strength',
];

const SMITH_BRANDS = [
  'Life Fitness', 'Matrix Fitness', 'Technogym', 'Panatta',
  'Watson Gym Equipment', 'Primal Strength', 'BLK BOX', 'Cybex',
];

const BRANDS_BY_EQUIPMENT = {
  machine: SELECTORIZED_BRANDS,
  cable: CABLE_BRANDS,
  smith: SMITH_BRANDS,
};

// `equipment` is exerciseDb.js's own field (machine/cable/smith/barbell/
// dumbbell/bodyweight/kettlebell) — reusing it instead of a second
// classification keeps this in sync with the database automatically.
function defaultMachineBrands(equipment) {
  return BRANDS_BY_EQUIPMENT[equipment] || [];
}

module.exports = { defaultMachineBrands, SELECTORIZED_BRANDS, CABLE_BRANDS, SMITH_BRANDS };
