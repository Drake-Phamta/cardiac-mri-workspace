// node --test mobile/test/  - cleartext HTTP only in live builds (plugins/withCleartextLocalDemo.js,
// DR-021 rule 5, QA #65 N-12b). Plain node: the plugin requires expo/config-plugins lazily, so its
// helpers load without node_modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { MOBILE_ROOT } from './_helpers.mjs';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withCleartextLocalDemo.js');
const { applyCleartextPolicy, readBuildMode, BUILD_CONFIG_PATH, ATTR } = plugin;

// The shape withAndroidManifest hands a mod (xml2js of AndroidManifest.xml).
function manifest(appAttrs = { 'android:name': '.MainApplication' }) {
  return { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, application: [{ $: { ...appAttrs } }] } };
}
const appAttrs = (m) => m.manifest.application[0].$;

test('K1 a live build allows cleartext HTTP (LOCAL_DEMO over the private overlay)', () => {
  const m = applyCleartextPolicy(manifest(), 'live');
  assert.equal(appAttrs(m)[ATTR], 'true');
  assert.equal(appAttrs(m)['android:name'], '.MainApplication', 'other attributes are untouched');
});

test('K2 a fixture build has no cleartext - and loses it when the reused android/ still has it from a live build', () => {
  assert.equal(ATTR in appAttrs(applyCleartextPolicy(manifest(), 'fixture')), false);
  const reused = applyCleartextPolicy(manifest({ 'android:name': '.MainApplication', [ATTR]: 'true' }), 'fixture');
  assert.equal(ATTR in appAttrs(reused), false);
  assert.equal(appAttrs(reused)['android:name'], '.MainApplication');
});

test('K3 an unknown or missing mode fails closed: no cleartext, no throw', () => {
  for (const mode of [null, undefined, '', 'LIVE ', 'mock']) {
    const m = applyCleartextPolicy(manifest({ [ATTR]: 'true' }), mode);
    assert.equal(ATTR in appAttrs(m), false, String(mode));
  }
  const noApp = { manifest: { $: {} } };
  assert.equal(applyCleartextPolicy(noApp, 'live'), noApp, 'a manifest without <application> is returned as is');
  const noAttrs = { manifest: { application: [{}] } };
  assert.equal(applyCleartextPolicy(noAttrs, 'live').manifest.application[0].$[ATTR], 'true');
});

test('K4 the mode is read from the buildConfig.json prepare.mjs writes; no file means not live', () => {
  assert.equal(BUILD_CONFIG_PATH, join(MOBILE_ROOT, 'src', 'generated', 'buildConfig.json'));
  const prepare = readFileSync(join(MOBILE_ROOT, 'scripts', 'prepare.mjs'), 'utf8');
  assert.match(prepare, /outDir = join\(mobileRoot, 'src', 'generated'\)/);
  assert.match(prepare, /join\(outDir, 'buildConfig\.json'\), \{\s*mode: config\.mode,/);

  assert.equal(readBuildMode(join(MOBILE_ROOT, 'src', 'generated', 'no-such-file.json')), null);
  assert.equal(readBuildMode(join(MOBILE_ROOT, 'package.json')), null, 'JSON without a mode is not live');
  assert.throws(() => readBuildMode(join(MOBILE_ROOT, 'README.md')), /not valid JSON - rerun scripts\/prepare\.mjs/);
});

test('K5 the plugin is registered and every native build runs prepare.mjs before the manifest is generated', () => {
  assert.equal(typeof plugin, 'function');
  const app = JSON.parse(readFileSync(join(MOBILE_ROOT, 'app.json'), 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/withCleartextLocalDemo'), 'app.json registers the plugin');

  const pkg = JSON.parse(readFileSync(join(MOBILE_ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.android, /^node scripts\/prepare\.mjs && /);
  const release = readFileSync(join(MOBILE_ROOT, 'scripts', 'build-release.ps1'), 'utf8');
  const prepareAt = release.indexOf("Invoke-Checked 'prepare.mjs'");
  const prebuildAt = release.indexOf("Invoke-Checked 'expo prebuild'");
  assert.ok(prepareAt > 0 && prebuildAt > prepareAt, 'build-release.ps1 runs prepare.mjs before expo prebuild');
});
