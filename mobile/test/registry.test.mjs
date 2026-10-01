// node --test mobile/test/  - the screen registry, the vertical folders, and the import boundaries
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { SCREENS, screenPath } from '../src/nav/screens.mjs';
import { MOBILE_ROOT, REPO_ROOT } from './_helpers.mjs';

const registrySource = readFileSync(join(MOBILE_ROOT, 'src', 'registry.js'), 'utf8');

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

test('G1 every screen in the table has a file in its vertical folder', () => {
  for (const s of SCREENS) {
    const p = join(MOBILE_ROOT, screenPath(s.id));
    assert.ok(existsSync(p), `${s.id} -> ${screenPath(s.id)} is missing`);
    assert.match(readFileSync(p, 'utf8'), /export default function/, `${s.id} needs a default-exported component`);
  }
});

test('G2 registry.js statically imports exactly those files and maps each id to its own import', () => {
  for (const s of SCREENS) {
    const name = s.file.replace(/\.js$/, '');
    const importLine = new RegExp(`import\\s+(\\w+)\\s+from\\s+'\\./verticals/${s.folder}/${name}';`);
    const m = importLine.exec(registrySource);
    assert.ok(m, `registry.js does not import ./verticals/${s.folder}/${name}`);
    assert.match(registrySource, new RegExp(`'${s.id}':\\s*${m[1]},`), `${s.id} is not mapped to ${m[1]}`);
  }
  const mapped = registrySource.match(/'SCR-\d\d':/g) || [];
  assert.equal(mapped.length, SCREENS.length, 'registry maps a screen the table does not know');
});

test('G3 no product file imports from spikes/ (copy with a provenance header instead)', () => {
  const offenders = productFiles.filter((f) => /^\s*(import|export)\b[^;]*from\s+['"][^'"]*spikes\//m.test(readFileSync(f, 'utf8'))
    || /require\(\s*['"][^'"]*spikes\//.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G4 no product file reaches app/core/node/ - a device bundle has no node:fs', () => {
  const offenders = productFiles.filter((f) => /core\/node\//.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G5 product code imports node: builtins nowhere (scripts/ and test/ are build tooling)', () => {
  const offenders = productFiles.filter((f) => /from\s+['"]node:/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => relative(REPO_ROOT, f)), []);
});

test('G6 the shell did not put a framework manifest under app/ (app-framework-neutral)', () => {
  for (const name of ['package.json', 'package-lock.json', 'metro.config.js']) {
    assert.equal(existsSync(join(REPO_ROOT, 'app', name)), false, `app/${name} must not exist`);
  }
});

test('G7 the generated inputs are gitignored, never committed', () => {
  const ignore = readFileSync(join(MOBILE_ROOT, '.gitignore'), 'utf8');
  for (const line of ['/src/generated/', '/android/', '/ios/', '*.apk', 'node_modules/']) {
    assert.ok(ignore.split(/\r?\n/).includes(line), `mobile/.gitignore lacks ${line}`);
  }
});
