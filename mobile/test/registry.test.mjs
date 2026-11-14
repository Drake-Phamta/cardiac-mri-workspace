// node --test mobile/test/  - the screen table, the screen folders, and the import boundaries
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { SCREENS } from '../src/navigation/routes.mjs';
import { MOBILE_ROOT, REPO_ROOT } from './_helpers.mjs';

const NAVIGATOR = join(MOBILE_ROOT, 'src', 'navigation', 'Navigator.js');
const navigatorSource = readFileSync(NAVIGATOR, 'utf8');
// `import CaseListScreen from '../screens/v1-cases/CaseListScreen';` -> CaseListScreen: that path
const screenImports = new Map([...navigatorSource.matchAll(/^import\s+(\w+)\s+from\s+'(\.\.\/screens\/[^']+)';$/gm)]
  .map((m) => [m[1], m[2]]));
// `'SCR-02': CaseListScreen,` -> SCR-02: CaseListScreen
const mapped = new Map([...navigatorSource.matchAll(/'(SCR-\d\d)':\s*(\w+),/g)].map((m) => [m[1], m[2]]));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === 'android' || name === 'ios' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

const productFiles = [
  join(MOBILE_ROOT, 'App.js'), join(MOBILE_ROOT, 'index.js'), ...walk(join(MOBILE_ROOT, 'src')),
];

// A plain-text check, not a parse: `export default function X`, `export default X;`
// and `export { X as default }` all count (the screen contract is
// "has a default export", not one way of writing it).
const HAS_DEFAULT_EXPORT = /^\s*export\s+default\b|^\s*export\s*\{[^}]*\bas\s+default\b/m;

test('G1 every screen in the table maps to a screen file that exists, with a default export', () => {
  for (const s of SCREENS) {
    const name = mapped.get(s.id);
    assert.ok(name, `${s.id} is not mapped to a component in Navigator.js`);
    const spec = screenImports.get(name);
    assert.ok(spec, `${name} (${s.id}) is not imported from ../screens/ in Navigator.js`);
    const p = join(dirname(NAVIGATOR), `${spec}.js`);
    assert.ok(existsSync(p), `${s.id} -> ${spec}.js is missing`);
    assert.match(readFileSync(p, 'utf8'), HAS_DEFAULT_EXPORT, `${s.id} needs a default-exported component`);
  }
});

test('G1b the default-export check accepts every way of writing one, and only those', () => {
  for (const ok of ['export default function CaseListScreen() {}', 'const A = () => null;\nexport default A;',
    'function A() {}\nexport { A as default };', '  export default memo(A);']) {
    assert.match(ok, HAS_DEFAULT_EXPORT, ok);
  }
  for (const bad of ['export function CaseListScreen() {}', '// export default function Old() {}',
    'const note = "export default";', 'export { A };']) {
    assert.doesNotMatch(bad, HAS_DEFAULT_EXPORT, bad);
  }
});

test('G2 Navigator.js maps exactly the ids of the table, each to its own statically imported screen', () => {
  assert.deepEqual([...mapped.keys()].sort(), SCREENS.map((s) => s.id).sort(), 'Navigator.js maps a screen the table does not know');
  assert.equal(new Set(mapped.values()).size, SCREENS.length, 'two ids share one component');
  for (const name of mapped.values()) assert.ok(screenImports.has(name), `${name} is not a static import of a screen file`);
});

test('G3 no product file imports from prototypes/ (copy with a provenance header instead)', () => {
  const offenders = productFiles.filter((f) => /^\s*(import|export)\b[^;]*from\s+['"][^'"]*(spikes|prototypes)\//m.test(readFileSync(f, 'utf8'))
    || /require\(\s*['"][^'"]*(spikes|prototypes)\//.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G4 no product file imports from mobile/test/ - a device bundle has no node:fs', () => {
  const offenders = productFiles.filter((f) => /from\s+['"][^'"]*\/test\//.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G5 product code imports node: builtins nowhere (scripts/ and test/ are build tooling)', () => {
  const offenders = productFiles.filter((f) => /from\s+['"]node:/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G8 a screen folder never imports from another screen folder (shared code lives in api/, lib/, components/)', () => {
  const screensDir = join(MOBILE_ROOT, 'src', 'screens');
  const offenders = [];
  for (const folder of readdirSync(screensDir)) {
    for (const f of walk(join(screensDir, folder))) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const m of code.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)['"](\.[^'"]+)['"]/g)) {
        const target = relative(screensDir, join(dirname(f), m[1])).split(/[\\/]/);
        if (target[0] !== '..' && target[0] !== folder) offenders.push(`${relative(REPO_ROOT, f)} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('G7 the generated inputs are gitignored, never committed', () => {
  const ignore = readFileSync(join(MOBILE_ROOT, '.gitignore'), 'utf8');
  for (const line of ['/src/generated/', '/android/', '/ios/', '*.apk', 'node_modules/']) {
    assert.ok(ignore.split(/\r?\n/).includes(line), `mobile/.gitignore lacks ${line}`);
  }
});
