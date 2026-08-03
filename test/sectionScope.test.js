// Guards the class of bug the app.jsx split introduced and shipped.
//
// `e84c8cf` moved S4 and S6 into src/sections/. S6 renders <TrendsPanel />, but
// TrendsPanel stayed behind in app.jsx and was never imported. esbuild does not
// resolve free identifiers — it emits them as globals — so `npm run build`
// succeeded, bundleSafety.test.js passed (it only sweeps for Node globals), all
// 779 backend tests passed, and the deployed app threw
// "ReferenceError: TrendsPanel is not defined" on first render for every user.
// The whole page stayed on LOADING.
//
// A section module is self-contained by construction, so the check is cheap:
// every <Capitalised /> it renders must be imported or declared in that same
// file. This is not general scope analysis and does not try to be — it covers
// JSX component references, which is where this failure actually lives.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SECTIONS_DIR = path.join(__dirname, '..', 'src', 'sections');

// React.Fragment shorthand and namespaced tags aren't component identifiers.
const JSX_COMPONENT = /<([A-Z]\w*)/g;

// `import X, { a as b, c } from '...'` — captures every local binding.
function importedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]+?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1];
    const braced = clause.match(/\{([\s\S]*?)\}/);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, '').trim();
    if (def && !def.startsWith('*')) names.add(def);
    const ns = clause.match(/\*\s+as\s+(\w+)/);
    if (ns) names.add(ns[1]);
  }
  return names;
}

function declaredNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:function|class)\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
  // React hooks, browser APIs, and builtins are implicit in section scope.
  for (const name of [
    'React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useContext', 'useLayoutEffect',
    'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Math', 'Promise',
    'Set', 'Map', 'console', 'fetch', 'URL', 'URLSearchParams', 'localStorage', 'sessionStorage',
    'window', 'document', 'navigator', 'performance', 'error', 'undefined', 'null', 'true', 'false',
    'Infinity', 'NaN', 'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'decodeURI', 'encodeURI',
  ]) {
    names.add(name);
  }
  return names;
}

const sectionFiles = fs.readdirSync(SECTIONS_DIR).filter(f => f.endsWith('.jsx'));

test('there are section modules to check', () => {
  assert.ok(sectionFiles.length > 0, 'expected src/sections/*.jsx to exist');
});

for (const file of sectionFiles) {
  test(`every component and identifier ${file} uses is imported or declared in it`, () => {
    const src = fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8');
    const available = new Set([...importedNames(src), ...declaredNames(src)]);

    // Check JSX components
    const jsxMissing = [...new Set([...src.matchAll(JSX_COMPONENT)].map(m => m[1]))]
      .filter(name => !available.has(name) && !name.includes('.'));

    assert.deepEqual(jsxMissing, [],
      `src/sections/${file} renders <${jsxMissing[0]} /> but never imports or declares it. ` +
      'esbuild will emit it as a global and the browser will throw ReferenceError on render. ' +
      'Move the component into this file or import it.');

    // Check uppercase constants (MOVEMENT_GROUPS, BODY_BASE, etc.) — the hidden bug class.
    // Remove comments and strings to avoid false positives from string content.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')          // /* */ comments
      .replace(/\/\/.*/g, '')                     // // comments
      .replace(/\\['"]/g, '')                     // escaped quotes (remove backslash)
      .replace(/'(?:[^'\\]|\\.)*'/g, '')          // single-quoted strings (handles escapes)
      .replace(/"(?:[^"\\]|\\.)*"/g, '')          // double-quoted strings (handles escapes)
      .replace(/`(?:[^`\\]|\\.)*`/g, '');         // template literals (handles escapes)

    const upperIdentifiers = [...codeOnly.matchAll(/\b([A-Z][A-Z_]+)\b/g)].map(m => m[1]);
    const constMissing = [...new Set(upperIdentifiers)]
      .filter(name => !available.has(name) && upperIdentifiers.filter(n => n === name).length > 1);

    assert.deepEqual(constMissing, [],
      `src/sections/${file} uses the constant ${constMissing[0]} which is not imported or declared in it. ` +
      'It lives in another section or app.jsx. Import it or move the constant into this file.');
  });
}
