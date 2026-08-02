// Guards the one gap that unit tests structurally cannot see.
//
// Several functions/*.js modules are imported by src/app.jsx and bundled into
// public/app.js by esbuild, so they execute in a browser as well as in the
// Cloud Function. `npm test` runs in Node, where every Node global exists — so
// a module can reference Buffer, process or __dirname, pass its entire test
// file, and still throw ReferenceError for every user on every click.
//
// That is not hypothetical. calendarExport.js's foldLine used
// Buffer.from(line, 'utf8'); test/calendarExport.test.js passed 16 tests
// against it, and Add to Calendar threw "Buffer is not defined" in production
// from the moment it shipped until it was caught by reading the browser
// console. Nothing in the suite could have found it, because the suite runs
// where Buffer is defined.
//
// So this test asserts against the built artefact rather than the source: if a
// Node global survives into public/app.js, the bundle is broken in a browser
// whatever the other 690 tests say.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE = path.join(__dirname, '..', 'public', 'app.js');

// Globals that exist in Node and not in a browser. Matched as whole words so
// a property named `process` on an object (`x.process`) or a minified local
// doesn't trip it.
//
// `require` is deliberately included: esbuild leaves an unresolved require()
// as a bare call, which is the signature of a dependency it could not bundle.
const NODE_ONLY_GLOBALS = ['Buffer', '__dirname', '__filename'];

const readBundle = () => fs.readFileSync(BUNDLE, 'utf8');

test('the built frontend bundle exists and is not empty', () => {
  assert.ok(fs.existsSync(BUNDLE), 'public/app.js is missing — run npm run build');
  assert.ok(readBundle().length > 1000);
});

test('no Node-only global reaches the browser bundle', () => {
  const bundle = readBundle();
  for (const name of NODE_ONLY_GLOBALS) {
    const hits = bundle.match(new RegExp(`\\b${name}\\b`, 'g')) || [];
    assert.equal(hits.length, 0,
      `public/app.js references the Node global \`${name}\` ${hits.length} time(s). ` +
      'It does not exist in a browser and will throw ReferenceError at runtime. ' +
      'Use a cross-runtime equivalent (TextEncoder/TextDecoder instead of Buffer).');
  }
});

// process.env deliberately gets a source-level check rather than a bundle-level
// one, because two things make the bundle a bad place to assert it:
//
//   - esbuild targets the browser by default and substitutes
//     process.env.NODE_ENV with "production", then eliminates the dead branch.
//     muscleTaxonomy.js's dev-only MUSCLE_GROUPS validation never reaches the
//     browser at all, which is correct and would look like a violation here.
//   - the Firebase SDK reads process.env behind its own
//     `typeof process > "u"` guard, which is safe and is not ours to change.
//
// So the real risk is one of OUR shared modules reading process.env for
// something other than NODE_ENV. That is what this checks, at the source.
test('no frontend-imported module reads process.env except for NODE_ENV', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.jsx'), 'utf8');
  const imported = [...appSrc.matchAll(/from '\.\.\/functions\/([\w.]+)'/g)].map(m => m[1]);
  assert.ok(imported.length > 5, 'expected src/app.jsx to import several shared modules');

  for (const file of imported) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'functions', file), 'utf8');
    const reads = [...src.matchAll(/process\s*\.\s*env\s*\.\s*(\w+)/g)].map(m => m[1]);
    const unsafe = reads.filter(name => name !== 'NODE_ENV');
    assert.deepEqual(unsafe, [],
      `functions/${file} is bundled into the browser and reads process.env.${unsafe[0]}, ` +
      'which is undefined there. Only NODE_ENV is safe (esbuild substitutes it).');
  }
});

// A module can only be browser-safe if everything it pulls in is too, so the
// check has to be on the bundle. This asserts the shared modules are genuinely
// reachable from it — if they ever stop being bundled, the test above would
// start passing for the wrong reason.
test('the shared engine modules really are in the bundle', () => {
  const bundle = readBundle();
  for (const marker of ['BEGIN:VCALENDAR', 'PRODID']) {
    assert.ok(bundle.includes(marker),
      `expected calendarExport.js to be bundled (missing ${marker}) — ` +
      'if it was removed from src/app.jsx, drop this assertion too');
  }
});

// Belt and braces on the specific function that broke: prove it runs with the
// Node global removed, which is the closest this suite can get to a browser.
test('foldLine works when Buffer does not exist', () => {
  const saved = globalThis.Buffer;
  // eslint-disable-next-line no-global-assign
  delete globalThis.Buffer;
  try {
    // Required inside the try so module init is covered by the same condition.
    const { foldLine, buildSessionICS } = require('../functions/calendarExport');

    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldLine(long);
    assert.ok(folded.includes('\r\n '));
    assert.equal(folded.replace(/\r\n /g, ''), long);

    const multibyte = 'DESCRIPTION:' + '→'.repeat(60);
    assert.equal(foldLine(multibyte).replace(/\r\n /g, ''), multibyte);
    assert.ok(!foldLine(multibyte).includes('�'), 'produced a replacement character');

    const ics = buildSessionICS({
      title: 'Press — Lower',
      start: new Date('2026-08-03T18:00:00Z'),
      exercises: [{ name: 'Leg Extension', sets: [{ reps: 8 }] }],
      now: new Date('2026-08-02T09:30:00Z'),
    });
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('END:VCALENDAR'));
  } finally {
    globalThis.Buffer = saved;
  }
});
