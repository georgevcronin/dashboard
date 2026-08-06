// #14/#15: independent tracking-category checkboxes (Recovery/Sleep,
// Nutrition), replacing the old profile.trackingLevel 3-preset string
// ('workout'/'workout_sleep'/'full'). Training itself is always on — there's
// no scenario with literally nothing tracked. See LEGACY_TRACKING_LEVEL_MAP
// in src/app.jsx for the frontend's read-time migration of an old stored
// string value (never rewritten in place — an account that hasn't saved
// through the new checkbox UI keeps its old trackingLevel string; this is
// purely the new field's write-side validation).
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

module.exports = { TRACKING_CATEGORY_KEYS, validateTrackingCategories };
