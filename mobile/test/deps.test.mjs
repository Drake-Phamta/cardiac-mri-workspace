// node --test mobile/test/  - smoke checks for third-party runtime dependencies
//
// These need mobile/node_modules. The CI job mobile-shell deliberately runs
// without `npm install` (no npm supply chain in guardrails), so there they
// SKIP with a reason; locally, after `npm ci` in mobile/, they run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MOBILE_ROOT } from './_helpers.mjs';

// A 2x2 8-bit greyscale PNG (colour type 0), rows [0, 255] and [255, 0],
// generated once with node:zlib (signature, IHDR, one IDAT, IEND, CRCs).
const PNG_2X2_GREY = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGNg+M/wnwEABgAB/4/x/JoAAAAASUVORK5CYII=';

async function importOrSkip(t, name) {
  try {
    return await import(name);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip(`${name} is not installed here (CI runs without npm install) - run \`npm ci\` in mobile/ to check it`);
      return null;
    }
    throw err;
  }
}

test('D1 fast-png is pinned to an exact version in package.json (V4 SCR-06 reads mask pixels with it)', () => {
  const pkg = JSON.parse(readFileSync(join(MOBILE_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['fast-png'], '8.0.0');
});

test('D2 fast-png decodes the contract mask format: an 8-bit single-channel PNG, row = y, column = x', async (t) => {
  const fastPng = await importOrSkip(t, 'fast-png');
  if (!fastPng) return;
  const img = fastPng.decode(Buffer.from(PNG_2X2_GREY, 'base64'));
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.depth, 8);
  assert.equal(img.channels, 1);
  assert.deepEqual([...img.data], [0, 255, 255, 0]);
});
