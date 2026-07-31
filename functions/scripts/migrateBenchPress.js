#!/usr/bin/env node
// ============================================================================
// BENCH PRESS MIGRATION — MANUAL, HUMAN-REVIEWED, ONE-TIME SCRIPT
// ============================================================================
// Physically rewrites historical lift documents logged under the six
// now-superseded bench-press names (Barbell / Incline Barbell / Decline
// Barbell / Dumbbell Flat / Dumbbell Incline / Dumbbell Decline Bench Press)
// into the new canonical 'Bench Press' entry + equipment/angle fields. See
// .design/feature-brainstorm/EXERCISE_PARAMETERIZATION.md ("Migration
// mechanics") for the design this implements, and ../benchPressMigration.js
// for the pure rewrite logic this script calls (and unit-tests against
// synthetic data in test/benchPressMigration.test.js).
//
// THIS SCRIPT IS NOT WIRED INTO ANYTHING. It is not called on deploy, on
// Cloud Function cold start, or from any request handler in index.js — the
// only way it ever runs is a human typing the command below. This is a
// single-user production app with no staging environment (see the repo's
// CLAUDE.md) — an unreviewed automatic rewrite of someone's real lift
// history would be a serious, hard-to-reverse mistake. Accordingly this
// script is deliberately friction-full:
//
//   1. DEFAULTS TO DRY RUN. Nothing is ever written unless you pass
//      --execute explicitly.
//   2. Even with --execute, it prints the full plan (per-name counts +
//      example before/after rewrites) and then requires you to type
//      MIGRATE at an interactive prompt before touching Firestore.
//   3. Defaults to a SINGLE account (--uid) rather than scanning every user
//      document, so a first real run is scoped to one account you've
//      actually reviewed the dry-run output for. Omitting --uid scans every
//      `users/*` document — fine for this app's current single real user,
//      included mainly for completeness if that ever changes.
//
// Prerequisites: run from the functions/ directory with `npm install` done
// there (needs firebase-admin), and credentials that can read/write this
// Firebase project's Firestore — either GOOGLE_APPLICATION_CREDENTIALS
// pointed at a service account key, or `gcloud auth application-default
// login` / `firebase login` in an environment already configured for this
// project.
//
// Usage:
//   node scripts/migrateBenchPress.js --uid <firebase-uid>              # dry run (default)
//   node scripts/migrateBenchPress.js --uid <firebase-uid> --execute    # real run, asks to confirm
//   node scripts/migrateBenchPress.js --execute                        # ALL users — confirms per user
// ============================================================================

const admin = require('firebase-admin');
const readline = require('readline');
const { planMigration, migratedLiftFor } = require('../benchPressMigration');

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
  node scripts/migrateBenchPress.js --uid <firebase-uid>              # dry run (default)
  node scripts/migrateBenchPress.js --uid <firebase-uid> --execute    # real run, asks to confirm
  node scripts/migrateBenchPress.js --execute                        # ALL users — confirms per user`);
  process.exit(0);
}

function confirm(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(promptText, answer => { rl.close(); resolve(answer.trim() === 'MIGRATE'); }));
}

// Reads liftChunks with each chunk document's own ref intact (unlike
// functions/liftChunks.js's loadAllLifts, which flattens to one array) —
// this script needs to write back only the specific chunk documents that
// actually changed, not re-derive chunk boundaries from scratch.
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
  console.log(`${allLifts.length} total lift(s), ${plan.totalMatched} match a legacy bench-press name.`);
  if (!plan.totalMatched) return { matched: 0, written: 0 };

  console.log('By legacy name:');
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
