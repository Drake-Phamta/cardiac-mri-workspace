// node --test mobile/test/  - V1 privacy mode on SCR-03 / SCR-04 (src/lib/privacy.mjs, src/lib/screenCapture.js):
// on by default, says what is in force, and degrades to "not available" without the native module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { applyPrivacy, PRIVACY, privacyText, privacyWanted, setPrivacyWanted } from '../src/lib/privacy.mjs';
import { MOBILE_ROOT } from './_helpers.mjs';

function fakeModule({ available = true, fail = false } = {}) {
  const calls = [];
  return {
    calls,
    isAvailableAsync: async () => available,
    preventScreenCaptureAsync: async (key) => { calls.push(['prevent', key]); if (fail) throw new Error('refused'); },
    allowScreenCaptureAsync: async (key) => { calls.push(['allow', key]); },
  };
}

test('PV1 on by default for the session; the switch is remembered', () => {
  assert.equal(privacyWanted(), true);
  setPrivacyWanted(false);
  assert.equal(privacyWanted(), false);
  setPrivacyWanted(true);
  assert.equal(privacyWanted(), true);
});

test('PV2 with the module: on blocks capture for the screen\'s key, off allows it', async () => {
  const mod = fakeModule();
  assert.equal(await applyPrivacy(mod, true, 'SCR-03'), PRIVACY.PROTECTED);
  assert.equal(await applyPrivacy(mod, false, 'SCR-03'), PRIVACY.OFF);
  assert.deepEqual(mod.calls, [['prevent', 'SCR-03'], ['allow', 'SCR-03']]);
});

test('PV3 without the module, with a module that is not available, or one that refuses: never "protected"', async () => {
  assert.equal(await applyPrivacy(null, true, 'SCR-03'), PRIVACY.UNAVAILABLE);
  assert.equal(await applyPrivacy({ preventScreenCaptureAsync: 1 }, true, 'SCR-03'), PRIVACY.UNAVAILABLE);
  assert.equal(await applyPrivacy(fakeModule({ available: false }), true, 'SCR-03'), PRIVACY.UNAVAILABLE);
  assert.equal(await applyPrivacy(fakeModule({ fail: true }), true, 'SCR-04'), PRIVACY.FAILED);
  for (const st of [PRIVACY.UNAVAILABLE, PRIVACY.FAILED, PRIVACY.OFF, PRIVACY.PENDING]) {
    for (const on of [true, false]) assert.doesNotMatch(privacyText(st, on).title, /^Privacy mode: ON$/, `${st} ${on}`);
  }
  assert.equal(privacyText(PRIVACY.PROTECTED, true).title, 'Privacy mode: ON');
  assert.equal(privacyText(PRIVACY.UNAVAILABLE, true).title, 'Privacy mode: not available in this build');
  assert.equal(privacyText(PRIVACY.UNAVAILABLE, false).title, 'Privacy mode: OFF (not available in this build)');
  assert.match(privacyText(PRIVACY.UNAVAILABLE, true).detail, /screenshots are not blocked/);
});

test('PV4 one loader: only lib/screenCapture.js names expo-screen-capture, inside a try; the package is in the lockfile', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'generated') walk(p); } else if (/\.m?js$/.test(name)) files.push(p);
    }
  };
  walk(join(MOBILE_ROOT, 'src'));
  const naming = files.filter((f) => readFileSync(f, 'utf8').includes("'expo-screen-capture'"));
  assert.deepEqual(naming.map((f) => f.slice(MOBILE_ROOT.length + 1).replace(/\\/g, '/')), ['src/lib/screenCapture.js']);
  const src = readFileSync(join(MOBILE_ROOT, 'src', 'lib', 'screenCapture.js'), 'utf8');
  assert.match(src, /try \{\s*\/\/[^\n]*\n\s*screenCapture = require\('expo-screen-capture'\);\s*\} catch/);
  assert.doesNotMatch(src, /^import[^\n]*expo-screen-capture/m, 'never a static import: an old APK would crash on load');
  const pkg = JSON.parse(readFileSync(join(MOBILE_ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.dependencies['expo-screen-capture'], /^~57\./, 'the SDK 57 line');
  const lock = JSON.parse(readFileSync(join(MOBILE_ROOT, 'package-lock.json'), 'utf8'));
  const entry = lock.packages['node_modules/expo-screen-capture'];
  assert.ok(entry && /^57\./.test(entry.version) && entry.integrity && entry.license === 'MIT' && !entry.hasInstallScript,
    `locked: ${entry ? `${entry.version} ${entry.license}` : 'missing'}`);
});
