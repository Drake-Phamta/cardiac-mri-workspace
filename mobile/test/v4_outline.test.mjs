// node --test mobile/test/  - the source outline SCR-06 draws under the edits (src/screens/v4-review/outline.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { outlinePath } from '../src/screens/v4-review/outline.mjs';
import { syntheticSourceSlice } from '../src/screens/v4-review/reviewScreen.mjs';

function mask(width, height, on) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data[y * width + x] = on(x, y) ? 1 : 0;
  return data;
}

// Total length of the path's segments, read back from "M x y h n" / "M x y v n".
const lengthOf = (path) => [...path.matchAll(/M\d+ \d+[hv](\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);

// The same thing counted directly: every pixel side between foreground and background (or the border).
function boundarySides(data, width, height) {
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] !== 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!on(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on(x + dx, y + dy)) n += 1;
    }
  }
  return n;
}

test('OL1 a filled square gives exactly its four sides and nothing inside it', () => {
  const square = mask(8, 6, (x, y) => x >= 2 && x <= 4 && y >= 1 && y <= 3);
  assert.equal(outlinePath(square, 8, 6), 'M2 1h3M2 4h3M2 1v3M5 1v3');
});

test('OL2 a ring gives its outer and inner sides; an empty mask gives no path', () => {
  const ring = mask(7, 7, (x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 5 && !(x === 3 && y === 3));
  const path = outlinePath(ring, 7, 7);
  assert.equal(lengthOf(path), 20 + 4, 'outer square 5 x 4 sides, hole 4 sides');
  assert.ok(path.includes('M3 3h1') && path.includes('M3 4h1'), 'the hole\'s top and bottom are drawn');
  assert.equal(outlinePath(new Uint8Array(12), 4, 3), '');
});

test('OL3 a mask touching the slice border is closed along the border', () => {
  const full = mask(3, 2, () => true);
  assert.equal(outlinePath(full, 3, 2), 'M0 0h3M0 2h3M0 0v2M3 0v2');
});

test('OL4 on random masks and the synthetic slice, the outline length equals the boundary sides counted directly', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 30; k += 1) {
    const width = 5 + Math.floor(rand() * 20);
    const height = 5 + Math.floor(rand() * 20);
    const data = mask(width, height, () => rand() < 0.45);
    assert.equal(lengthOf(outlinePath(data, width, height)), boundarySides(data, width, height), `mask ${k}`);
  }
  const slice = syntheticSourceSlice(576, 576, 44, 88);
  const started = performance.now();
  const path = outlinePath(slice, 576, 576);
  const ms = performance.now() - started;
  assert.equal(lengthOf(path), boundarySides(slice, 576, 576));
  assert.ok(ms < 200, `a 576 x 576 slice is outlined in ${ms.toFixed(1)} ms`);
});
