// #14/#15: independent tracking-category checkboxes (Recovery/Sleep,
// Nutrition), replacing the old profile.trackingLevel 3-preset string
// ('workout'/'workout_sleep'/'full'). Training itself is always on — there's
// no scenario with literally nothing tracked. An old stored trackingLevel
// string is never rewritten in place — an account that hasn't saved through
// the new checkbox UI keeps it, migrated only at read time by
// resolveTrackingCategories below.
//
// The single shared source of truth for both directions: src/app.jsx
// imports resolveTrackingCategories directly (esbuild bundles functions/*.js
// into the frontend build same as functions/muscleTaxonomy.js already does)
// rather than keeping its own copy — #14's whole premise is that scattered
// copies of this logic drift out of sync with what the checkboxes actually
// mean, so there is deliberately only one implementation, used by the
// briefing/newscast generators below and by the dashboard's own render gate.
const TRACKING_CATEGORY_KEYS = ['sleep', 'nutrition'];

function validateTrackingCategories(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'trackingCategories must be an object of {sleep, nutrition} -> boolean';
  }
  for (const [k, v] of Object.entries(value)) {
    if (!TRACKING_CATEGORY_KEYS.includes(k) || typeof v !== 'boolean') {
      return 'trackingCategories must be an object of {sleep, nutrition} -> boolean';
    }
  }
  return null;
}

const LEGACY_TRACKING_LEVEL_MAP = {
  workout: { sleep: false, nutrition: false },
  workout_sleep: { sleep: true, nutrition: false },
  full: { sleep: true, nutrition: true },
};

function resolveTrackingCategories(profile) {
  return profile?.trackingCategories || LEGACY_TRACKING_LEVEL_MAP[profile?.trackingLevel] || LEGACY_TRACKING_LEVEL_MAP.full;
}

module.exports = { TRACKING_CATEGORY_KEYS, validateTrackingCategories, LEGACY_TRACKING_LEVEL_MAP, resolveTrackingCategories };
