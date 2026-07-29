// Pure helpers for the gym equipment catalog — see
// .design/feature-brainstorm/GYM_MACHINE_CATALOG.md for the full design.
// Endpoint wiring (Firestore reads/writes, auth) lives in functions/index.js,
// same split as identity.js/index.js.

const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// gyms: array of { id, lat, lng, ... }. Returns matches within radiusMeters,
// closest first — used both for create-time dedup and workout-start
// auto-detect (GYM_MACHINE_CATALOG.md §3/§4).
function findNearbyGyms(gyms, lat, lng, radiusMeters) {
  return gyms
    .map(g => ({ gym: g, distance: haversineMeters(lat, lng, g.lat, g.lng) }))
    .filter(x => x.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .map(x => ({ ...x.gym, distanceMeters: Math.round(x.distance) }));
}

// Matches the exercise-name normalization convention already established in
// resistanceCurves.js/machineModels.js, kept independent here rather than
// imported so gyms.js has no dependency on those larger data files.
function normalizeExerciseKey(name) {
  return (name || '').toLowerCase().trim();
}

module.exports = { haversineMeters, findNearbyGyms, normalizeExerciseKey, GYM_NEARBY_RADIUS_M: 100 };
