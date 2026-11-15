// node --test mobile/test/  - V1 overlay drawing: mask outlines from boundary pixels (src/lib/mask.mjs) and the
// Fill / Outline / Both style (src/screens/v1-cases/sliceControls.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { disagreementMasks, disagreementRuns, maskOutlinePath } from '../src/lib/mask.mjs';
import { OUTLINE_WIDTHS, OVERLAY_MODE, needsOutline, overlayStyle } from '../src/screens/v1-cases/sliceControls.mjs';

const mask = (w, h, on) => {
  const data = new Uint8Array(w * h);
  for (const [x, y] of on) data[y * w + x] = 1;
  return { width: w, height: h, data };
};
const rect = (x0, y0, x1, y1) => {
  const out = [];
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) out.push([x, y]);
  return out;
};

// Walks a path of "M x y" + h/v moves + "z" and returns every unit edge it draws, per subpath.
function walk(path) {
  const loops = [];
  for (const part of path.split('M').filter(Boolean)) {
    const m = /^(\d+) (\d+)((?:[hv]-?\d+)*)z$/.exec(part);
    assert.ok(m, `subpath has the form M x y (h|v)* z: ${part}`);
    let x = Number(m[1]);
    let y = Number(m[2]);
    const start = [x, y];
    const edges = [];
    for (const [, cmd, n] of m[3].matchAll(/([hv])(-?\d+)/g)) {
      const d = Number(n);
      const sx = cmd === 'h' ? Math.sign(d) : 0;
      const sy = cmd === 'v' ? Math.sign(d) : 0;
      for (let i = 0; i < Math.abs(d); i += 1) { edges.push([x, y, x + sx, y + sy]); x += sx; y += sy; }
    }
    assert.deepEqual([x, y], start, 'every loop closes where it started');
    loops.push(edges);
  }
  return loops;
}

// The unit edges between a foreground pixel and a background one (or the border), counted directly.
function boundaryEdges(mk) {
  const fg = (x, y) => x >= 0 && y >= 0 && x < mk.width && y < mk.height && mk.data[y * mk.width + x] !== 0;
  const set = new Set();
  for (let y = 0; y < mk.height; y += 1) {
    for (let x = 0; x < mk.width; x += 1) {
      if (!fg(x, y)) continue;
      if (!fg(x, y - 1)) set.add(`${x},${y}-${x + 1},${y}`);
      if (!fg(x + 1, y)) set.add(`${x + 1},${y}-${x + 1},${y + 1}`);
      if (!fg(x, y + 1)) set.add(`${x},${y + 1}-${x + 1},${y + 1}`);
      if (!fg(x - 1, y)) set.add(`${x},${y}-${x},${y + 1}`);
    }
  }
  return set;
}
const undirected = ([x0, y0, x1, y1]) => (x0 < x1 || y0 < y1 ? `${x0},${y0}-${x1},${y1}` : `${x1},${y1}-${x0},${y0}`);

test('VO1 the outline of a filled square is its perimeter, with no inner edge', () => {
  const sq = mask(8, 8, rect(2, 2, 5, 5));
  assert.equal(maskOutlinePath(sq), 'M2 2h3v3h-3v-3z');
  const edges = walk(maskOutlinePath(sq)).flat();
  assert.equal(edges.length, 12, '3 x 3 square: perimeter 12');
  // The run rectangles of the same square (one per row) would also draw the two inner row borders.
  assert.equal(disagreementRuns(sq, sq).tp.length / 3, 3, 'three row runs');
});

test('VO2 one pixel, the slice border, an empty mask', () => {
  assert.equal(maskOutlinePath(mask(3, 3, [[1, 1]])), 'M1 1h1v1h-1v-1z');
  assert.equal(maskOutlinePath(mask(2, 2, rect(0, 0, 2, 2))), 'M0 0h2v2h-2v-2z', 'a full mask is outlined along the border');
  assert.equal(maskOutlinePath(mask(4, 4, [])), '');
});

test('VO3 a hole is a second loop; two pixels touching at a corner stay two loops', () => {
  const ring = mask(7, 7, rect(1, 1, 6, 6).filter(([x, y]) => !(x === 3 && y === 3)));
  const loops = walk(maskOutlinePath(ring));
  assert.equal(loops.length, 2);
  assert.deepEqual(loops.map((l) => l.length).sort((a, b) => a - b), [4, 20]);
  const diagonal = walk(maskOutlinePath(mask(3, 3, [[0, 0], [1, 1]])));
  assert.deepEqual(diagonal.map((l) => l.length), [4, 4]);
});

test('VO4 on random masks every boundary edge is drawn exactly once and nothing else is drawn', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let trial = 0; trial < 40; trial += 1) {
    const w = 3 + Math.floor(rand() * 14);
    const h = 3 + Math.floor(rand() * 14);
    const on = [];
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (rand() < 0.45) on.push([x, y]);
    const mk = mask(w, h, on);
    const drawn = walk(maskOutlinePath(mk)).flat().map(undirected);
    const expected = boundaryEdges(mk);
    assert.equal(new Set(drawn).size, drawn.length, `trial ${trial}: no edge drawn twice`);
    assert.deepEqual([...drawn].sort(), [...expected].sort(), `trial ${trial}: drawn edges = boundary edges (${w}x${h})`);
  }
});

test('VO5 disagreement masks split the pixels into TP / FP / FN with the same counts as the runs', () => {
  const gt = mask(6, 6, rect(1, 1, 4, 4));
  const pred = mask(6, 6, rect(2, 2, 5, 5));
  const m = disagreementMasks(gt, pred);
  const count = (x) => x.data.reduce((a, b) => a + b, 0);
  assert.deepEqual([count(m.tp), count(m.fp), count(m.fn)], [4, 5, 5]);
  assert.deepEqual({ ...disagreementRuns(gt, pred).counts }, { tp: 4, fp: 5, fn: 5 });
  assert.equal(walk(maskOutlinePath(m.tp)).flat().length, 8);
  assert.throws(() => disagreementMasks(gt, mask(5, 6, [])), /mask sizes differ/);
});

test('VO6 overlay style: fill, outline or both; the outline keeps its screen width at any zoom', () => {
  const fill = overlayStyle({ mode: OVERLAY_MODE.FILL, opacity: 0.5, zoom: 2 });
  assert.deepEqual({ ...fill }, { fill: true, fillOpacity: 0.5, stroke: false, strokeWidth: 0, strokeDasharray: null });
  const outline = overlayStyle({ mode: OVERLAY_MODE.OUTLINE, widthPx: 2, zoom: 4, opacity: 0.5 });
  assert.equal(outline.fill, false);
  assert.equal(outline.stroke, true);
  assert.equal(outline.strokeWidth * 4, 2, '2 px on screen = 0.5 source pixels at zoom 4');
  const both = overlayStyle({ mode: OVERLAY_MODE.BOTH, widthPx: 3, zoom: 0.5, dashed: true, opacity: 0.25 });
  assert.equal(both.fill && both.stroke, true);
  assert.equal(both.fillOpacity, 0.25);
  assert.deepEqual([...both.strokeDasharray], [18, 12], 'dash 3 widths on, 2 off, in source pixels');
  assert.equal(overlayStyle({ mode: OVERLAY_MODE.OUTLINE, zoom: 0 }).strokeWidth, 2, 'a zoom of 0 is treated as 1');
  assert.deepEqual([...OUTLINE_WIDTHS], [1, 2, 3]);
  assert.equal(needsOutline(OVERLAY_MODE.FILL), false);
  assert.equal(needsOutline(OVERLAY_MODE.BOTH), true);
});
