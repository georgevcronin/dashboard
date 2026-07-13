// Lifts live in a size-bounded subcollection ('liftChunks') under the user's
// document, not embedded as a single array field. A real account's lift
// history (8000+ entries) already pushed the embedded-array document over
// Firestore's 1MB-per-document hard limit, silently failing every write
// from that point on -- including, specifically, CSV re-imports, which is
// what surfaced this. See index.js's /import/hevy handler (pre-fix) for how
// silent that failure was: save() threw, the catch block only logged
// server-side, and the client still got back { ok: true, imported: N }.
//
// Chunked by SIZE (a fixed max lift count per document), not by one document
// per lift -- the latter would trade the 1MB-ceiling problem for a much
// worse one (thousands of individual document reads on every full-history
// load, where today it's a single document read). At MAX_LIFTS_PER_CHUNK
// lifts/chunk, a lift entry is roughly 100-150 bytes serialized, so each
// chunk is comfortably tens of KB, nowhere near the limit, while the total
// chunk count for 8000+ lifts stays in the teens -- a handful of reads for
// a full-history load, not one read per lift and not one oversized document.
const MAX_LIFTS_PER_CHUNK = 500;

function chunksCollection(docRef) {
  return docRef.collection('liftChunks');
}

// Zero-padded so a lexicographic '__name__' sort (Firestore's default,
// and what orderBy('__name__') uses) is also numeric chunk order.
function chunkId(i) {
  return `chunk-${String(i).padStart(6, '0')}`;
}

// Separate from the chunk-id namespace ('chunk-000000' etc) — tracks which
// chunk is currently being filled and how full it is, so appendLifts can
// find where to write with a single cheap document read instead of a query.
// Firestore doesn't support descending key-range scans (orderBy('__name__',
// 'desc') throws FAILED_PRECONDITION — caught by testing against the
// emulator before this ever touched real data), so "read the last chunk"
// isn't actually queryable; tracking it explicitly sidesteps that entirely.
const META_DOC_ID = '_meta';

// Concatenates every chunk into one flat array, in chunk order. Excludes
// the meta document (its id sorts before 'chunk-...' lexicographically, so
// a naive scan would otherwise try to spread its fields into the lift
// list). Returns [] for a brand-new account or before migration has run —
// callers should treat that identically to "no lifts yet", same as the old
// embedded-array default.
async function loadAllLifts(docRef) {
  const snap = await chunksCollection(docRef).orderBy('__name__').get();
  const lifts = [];
  snap.forEach(doc => { if (doc.id !== META_DOC_ID) lifts.push(...(doc.data().lifts || [])); });
  return lifts;
}

// Appends new lift entries, filling the currently-active chunk (per the
// meta doc) before creating new ones. Reads only the meta doc plus that one
// active chunk — never the full history — so this stays cheap regardless of
// how many years of data exist. A single call can span multiple new chunk
// documents (e.g. a first-time migration of 8000+ lifts) — still far under
// Firestore's 500-operation batch limit even then. Meta and chunk writes
// commit in the same batch, so they can never drift out of sync with each
// other even if the process dies mid-write.
async function appendLifts(docRef, newLifts) {
  if (!newLifts || !newLifts.length) return;
  const coll = chunksCollection(docRef);
  const metaRef = coll.doc(META_DOC_ID);
  const metaSnap = await metaRef.get();
  let currentIndex = 0;
  let currentLifts = [];
  if (metaSnap.exists) {
    currentIndex = metaSnap.data().lastIndex || 0;
    const chunkSnap = await coll.doc(chunkId(currentIndex)).get();
    currentLifts = chunkSnap.exists ? (chunkSnap.data().lifts || []) : [];
  }
  const batch = docRef.firestore.batch();
  const remaining = [...newLifts];
  while (remaining.length) {
    const space = MAX_LIFTS_PER_CHUNK - currentLifts.length;
    const slice = remaining.splice(0, Math.max(space, 0));
    currentLifts = [...currentLifts, ...slice];
    batch.set(coll.doc(chunkId(currentIndex)), { lifts: currentLifts });
    if (remaining.length) { currentIndex++; currentLifts = []; }
  }
  batch.set(metaRef, { lastIndex: currentIndex, lastChunkSize: currentLifts.length });
  await batch.commit();
}

// Removes every lift matching `predicate(lift)` from wherever it lives
// across chunks, then appends `newLifts` — the dedup-then-rewrite pattern
// /session/complete uses (delete today's existing entries for exercises
// being re-logged, then write the current set). Reads every chunk, since a
// matching lift could be in any of them (chunks aren't keyed by date) — an
// acceptable cost for human-scale, low-frequency session logging, unlike
// the bulk-import append path above.
async function removeLiftsAndAppend(docRef, predicate, newLifts) {
  const coll = chunksCollection(docRef);
  const snap = await coll.orderBy('__name__').get();
  const batch = docRef.firestore.batch();
  let anyRemoved = false;
  snap.forEach(doc => {
    const lifts = doc.data().lifts || [];
    const kept = lifts.filter(l => !predicate(l));
    if (kept.length !== lifts.length) {
      anyRemoved = true;
      batch.set(doc.ref, { lifts: kept });
    }
  });
  if (anyRemoved) await batch.commit();
  await appendLifts(docRef, newLifts);
}

module.exports = { loadAllLifts, appendLifts, removeLiftsAndAppend, chunkId, MAX_LIFTS_PER_CHUNK };
