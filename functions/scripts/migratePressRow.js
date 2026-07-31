#!/usr/bin/env node
// ============================================================================
// PRESS/ROW PHASE 2 MIGRATION — MANUAL, HUMAN-REVIEWED, ONE-TIME SCRIPT
// ============================================================================
// Physically rewrites historical lift documents logged under the now-
// superseded Overhead/Shoulder Press names or pull-up/lat-pulldown names
// into the unified 'Bench Press' (§14) / 'Row' (§15) entities. See
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md (§14, §15) for the
// design this implements, and ../pressRowMigration.js for the pure rewrite
// logic this script calls (and unit-tests against synthetic data in
// test/pressRowMigration.test.js).
//
// Same safety posture as functions/scripts/migrateBenchPress.js — read that
// file's own header for the full rationale. Summary:
//
//   1. DEFAULTS TO DRY RUN. Nothing is ever written unless you pass
//      --execute explicitly.
//   2. Even with --execute, it prints the full plan (per-name counts,
//      example before/after rewrites, and anything flagged for manual
//      clarification) and then requires you to type MIGRATE at an
//      interactive prompt before touching Firestore.
//   3. Defaults to a SINGLE account (--uid) rather than scanning every user
//      document.
//   4. Lifts flagged `needsClarification` (currently just "Dumbbell Overhead
//      Press" — ambiguous stance, see pressRowMigration.js) are NEVER
//      rewritten by this script, --execute or not. They're printed as a
//      separate list for a human to resolve individually (e.g. by hand-
//      editing those specific lifts, or extending the design once a real
//      answer exists) — never silently guessed at.
//
// Prerequisites: same as migrateBenchPress.js — run from functions/ with
// `npm install` done there, and Firestore-capable credentials.
//
// Usage:
//   node scripts/migratePressRow.js --uid <firebase-uid>              # dry run (default)
//   node scripts/migratePressRow.js --uid <firebase-uid> --execute    # real run, asks to confirm
//   node scripts/migratePressRow.js --execute                        # ALL users — confirms per user
// ============================================================================

const admin = require('firebase-admin');
const readline = require('readline');
const { planMigration, migratedLiftFor } = require('../pressRowMigration');

const META_DOC_ID = '_meta';

function parseArgs(argv) {
  const args = { execute: false, uid: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--execute') args.execute = true;
    else if (argv[i] === '--uid') args.uid = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') { printUsageAndExit(); }
  }
  return args;
}

function printUsageAndExit() {
  console.log(`Usage:
  node scripts/migratePressRow.js --uid <firebase-uid>              # dry run (default)
  node scripts/migratePressRow.js --uid <firebase-uid> --execute    # real run, asks to confirm
  node scripts/migratePressRow.js --execute                        # ALL users — confirms per user`);
  process.exit(0);
}

function confirm(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(promptText, answer => { rl.close(); resolve(answer.trim() === 'MIGRATE'); }));
}

// Same non-flattening chunk load as migrateBenchPress.js — this script needs
// to write back only the specific chunk documents that actually changed.
async function loadChunks(chunksRef) {
  const snap = await chunksRef.orderBy('__name__').get();
  const chunks = [];
  snap.forEach(doc => { if (doc.id !== META_DOC_ID) chunks.push({ ref: doc.ref, lifts: doc.data().lifts || [] }); });
  return chunks;
}

async function migrateUser(userDocRef, { execute }) {
  const chunksRef = userDocRef.collection('liftChunks');
  const chunks = await loadChunks(chunksRef);
  const allLifts = chunks.flatMap(c => c.lifts);
  const plan = planMigration(allLifts);

  console.log(`\n--- User ${userDocRef.id} ---`);
  console.log(`${allLifts.length} total lift(s), ${plan.totalMatched} match a legacy press/row name, ${plan.needsClarification.length} need manual clarification (not auto-migrated).`);

  if (plan.needsClarification.length) {
    console.log('\nFlagged for manual review (never auto-rewritten by this script):');
    for (const { lift, reason } of plan.needsClarification) {
      console.log(`  ${JSON.stringify(lift)} — ${reason}`);
    }
  }

  if (!plan.totalMatched) return { matched: 0, written: 0 };

  console.log('\nBy legacy name:');
  for (const [name, count] of Object.entries(plan.countsByLegacyName)) console.log(`  ${name}: ${count}`);

  console.log('\nExample rewrite(s):');
  for (const { before, after } of plan.rewrites.slice(0, 3)) {
    console.log(`  ${JSON.stringify(before)}\n  -> ${JSON.stringify(after)}`);
  }

  if (!execute) {
    console.log('\nDry run only — no data was written. Re-run with --execute to apply.');
    return { matched: plan.totalMatched, written: 0 };
  }

  const proceed = await confirm(`\nType MIGRATE to physically rewrite these ${plan.totalMatched} lift(s) for user ${userDocRef.id}: `);
  if (!proceed) { console.log('Not confirmed — aborting, nothing written for this user.'); return { matched: plan.totalMatched, written: 0 }; }

  const batch = userDocRef.firestore.batch();
  let written = 0;
  for (const chunk of chunks) {
    let changed = false;
    const rewritten = chunk.lifts.map(l => {
      const migrated = migratedLiftFor(l);
      if (!migrated) return l;
      changed = true;
      written++;
      return migrated;
    });
    if (changed) batch.set(chunk.ref, { lifts: rewritten });
  }
  await batch.commit();
  console.log(`Done — rewrote ${written} lift(s) for user ${userDocRef.id}.`);
  return { matched: plan.totalMatched, written };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  admin.initializeApp();
  const firestore = admin.firestore();

  const userRefs = args.uid
    ? [firestore.collection('users').doc(args.uid)]
    : (await firestore.collection('users').get()).docs.map(d => d.ref);

  if (!args.uid) {
    console.log(`No --uid given — scanning all ${userRefs.length} user document(s) under /users. Pass --uid <id> to scope to one account (recommended for a first run).`);
  }
  if (!args.execute) {
    console.log('DRY RUN — no data will be written. Pass --execute to apply changes (after reviewing this output).');
  }

  let totalMatched = 0, totalWritten = 0;
  for (const ref of userRefs) {
    const { matched, written } = await migrateUser(ref, args);
    totalMatched += matched;
    totalWritten += written;
  }
  console.log(`\n=== Total across ${userRefs.length} user(s): ${totalMatched} matched, ${totalWritten} written. ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
