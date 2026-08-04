const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadForUserDoc, DEFAULTS } = require('../functions/userDoc');

// Minimal in-memory fake of the Firestore doc-ref surface loadForUserDoc and
// its liftChunks.js calls actually use (.get/.set on docs, .collection/
// .doc/.orderBy/.get on subcollections, .firestore.batch()). Not a general
// Firestore emulator substitute — just enough to exercise the real
// account-safety logic path in loadForUserDoc without spinning up the
// emulator for one function.
function makeStore() {
  const docs = new Map();
  class FakeDoc {
    constructor(path) { this.path = path; }
    get id() { return this.path.slice(this.path.lastIndexOf('/') + 1); }
    async get() {
      const data = docs.get(this.path);
      return { exists: data !== undefined, data: () => data };
    }
    async set(data) { docs.set(this.path, data); }
    collection(name) { return new FakeCollection(`${this.path}/${name}`); }
    get firestore() { return { batch: () => new FakeBatch() }; }
  }
  class FakeCollection {
    constructor(path) { this.path = path; }
    doc(id) { return new FakeDoc(`${this.path}/${id}`); }
    orderBy() { return this; }
    async get() {
      const prefix = this.path + '/';
      const rows = [...docs.keys()]
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .sort()
        .map(k => ({ id: k.slice(prefix.length), data: () => docs.get(k) }));
      return { forEach: fn => rows.forEach(fn) };
    }
  }
  class FakeBatch {
    constructor() { this.ops = []; }
    set(ref, data) { this.ops.push(() => docs.set(ref.path, data)); }
    async commit() { this.ops.forEach(fn => fn()); }
  }
  return { docs, ref: path => new FakeDoc(path) };
}

// This is the exact bug class from commit 6b1ce27: a brand-new account (no
// existing doc) must never inherit another account's data just because a
// legacy/fallback blob happens to be in scope.
test('loadForUserDoc: brand-new account with no fallback starts genuinely empty', async () => {
  const { ref } = makeStore();
  const data = await loadForUserDoc(ref('users/newUser'), { exists: false }, null);
  assert.deepEqual(data.profile, DEFAULTS().profile);
  assert.deepEqual(data.workouts, []);
  assert.deepEqual(data.lifts, []);
});

// The one deliberate exception (loadForUser, gated to PRESS_OWNER_UID) still
// has to work — this is the legacy one-time migration path itself.
test('loadForUserDoc: brand-new account WITH an explicit fallback (the gated legacy-migration path) inherits it', async () => {
  const { ref } = makeStore();
  const legacy = { profile: { ...DEFAULTS().profile, name: 'George' }, workouts: [{ date: '2020-01-01', name: 'Legacy' }] };
  const data = await loadForUserDoc(ref('users/owner'), { exists: false }, legacy);
  assert.equal(data.profile.name, 'George');
  assert.deepEqual(data.workouts, legacy.workouts);
});

// The critical by-construction guarantee: even if a future bug ever passed a
// non-null fallback for the wrong uid, an account that already has its own
// doc can never be overwritten by it — existing data always wins.
test('loadForUserDoc: an EXISTING account ignores fallback data entirely, even if non-null', async () => {
  const { ref } = makeStore();
  const own = { ...DEFAULTS(), profile: { ...DEFAULTS().profile, name: 'SomeoneElse' }, workouts: [] };
  const wronglyPassedFallback = { profile: { ...DEFAULTS().profile, name: 'George' }, workouts: [{ date: '2020-01-01', name: 'Legacy' }] };
  const data = await loadForUserDoc(ref('users/existing'), { exists: true, data: () => own }, wronglyPassedFallback);
  assert.equal(data.profile.name, 'SomeoneElse');
  assert.deepEqual(data.workouts, []);
});
