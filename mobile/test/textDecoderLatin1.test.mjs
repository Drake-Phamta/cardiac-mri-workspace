/*
 * The A17 release APK died at start with `RangeError: Unknown encoding: latin1`
 * (S-1, 2026-10-01): fast-png builds `new TextDecoder('latin1')` at module
 * load and Hermes' TextDecoder knows UTF-8 only. These tests replace Node's
 * TextDecoder with a Hermes-like one BEFORE anything imports fast-png, so the
 * module-load crash is reproduced and the fix is shown on the same path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MOBILE_ROOT } from './_helpers.mjs';

const NodeTextDecoder = globalThis.TextDecoder;
class HermesLikeTextDecoder {
  constructor(label = 'utf-8') {
    const l = String(label).trim().toLowerCase();
    if (l !== 'utf-8' && l !== 'utf8') throw new RangeError(`Unknown encoding: ${label} (normalized: ${l})`);
    this.encoding = 'utf-8';
  }

  decode(input) { return new NodeTextDecoder('utf-8').decode(input); }
}

test('TD1 index.js imports the latin1 shim before anything else', () => {
  const src = readFileSync(join(MOBILE_ROOT, 'index.js'), 'utf8');
  const imports = src.split('\n').filter((l) => /^import\s/.test(l));
  assert.match(imports[0], /src\/polyfills\/textDecoderLatin1\.mjs/, `first import is: ${imports[0]}`);
});

// #77 QA NB-1: the shim only wraps a TextDecoder that already exists, so the
// mask decoder imports it too, right before fast-png - safe in either load order.
test('TD3 maskPng.js imports the latin1 shim immediately before fast-png', () => {
  const src = readFileSync(join(MOBILE_ROOT, 'src', 'imaging', 'maskPng.js'), 'utf8');
  const imports = src.split('\n').filter((l) => /^import\s/.test(l));
  const at = imports.findIndex((l) => /from 'fast-png'/.test(l));
  assert.ok(at > 0, `fast-png is imported, and not first: ${imports.join(' | ')}`);
  assert.match(imports[at - 1], /^import '\.\.\/polyfills\/textDecoderLatin1\.mjs';$/, `import before fast-png is: ${imports[at - 1]}`);
});

test('TD2 on a Hermes-like runtime the shim makes fast-png load and decode; latin1 is ISO-8859-1', async (t) => {
  globalThis.TextDecoder = HermesLikeTextDecoder;
  try {
    assert.throws(() => new globalThis.TextDecoder('latin1'), /Unknown encoding: latin1/, 'the runtime reproduces the device error');
    const { installLatin1TextDecoder } = await import('../src/polyfills/textDecoderLatin1.mjs');
    assert.notEqual(globalThis.TextDecoder, HermesLikeTextDecoder, 'the shim replaced the runtime decoder');
    assert.equal(installLatin1TextDecoder(globalThis), false, 'installing twice changes nothing');

    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    assert.equal(new globalThis.TextDecoder('latin1').decode(all), String.fromCharCode(...all));
    assert.equal(new globalThis.TextDecoder('ISO-8859-1').decode(all.subarray(65, 68)), 'ABC');
    assert.equal(new globalThis.TextDecoder().decode(new TextEncoder().encode('hé')), 'hé', 'utf-8 still goes to the runtime');
    assert.throws(() => new globalThis.TextDecoder('utf-16le'), /Unknown encoding/, 'other labels still fail as the runtime does');

    // fast-png is imported for the first time here, under the Hermes-like runtime.
    // CI runs without node_modules: skip there, as _png.mjs does for the mask decoder.
    let fastPng;
    try {
      fastPng = await import('fast-png');
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
        t.skip('fast-png is not installed here (CI runs without npm install) - run `npm ci` in mobile/ to check this');
        return;
      }
      throw err;
    }
    const { encode, decode } = fastPng;
    const data = Uint8Array.from({ length: 4 * 3 }, (_, i) => (i % 2 ? 255 : 0));
    const png = encode({ width: 4, height: 3, data, channels: 1, depth: 8 });
    const back = decode(png);
    assert.equal(back.width, 4);
    assert.deepEqual([...back.data], [...data]);
  } finally {
    globalThis.TextDecoder = NodeTextDecoder;
  }
});
