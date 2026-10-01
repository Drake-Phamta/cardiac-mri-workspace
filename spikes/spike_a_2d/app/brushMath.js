/*
 * SPIKE_A — pure brush logic (stage S5: A3–A7), shared by the app and by
 * harness/test_brush.mjs.
 *
 * THROWAWAY SPIKE CODE. Boundary: spikes/spike_a_2d/**.
 *
 * No React here, for the same reason as viewerMath.js: the functions the phone
 * runs are replayed offline against fixtures/brush_ops.json, which
 * fixtures/generate.py derives with its own, independent Python implementation.
 *
 * Contract (fixtures/brush_ops.json `contract`):
 *   centre pixel  screenToSource - floor, null outside the image, and null paints nothing
 *   footprint     {(x, y) : (x-cx)^2 + (y-cy)^2 <= r^2, inside the image}, in SOURCE
 *                 pixels, so zoom and pan cannot change what a stamp covers
 *   stroke        consecutive in-image samples joined by an integer Bresenham line
 *                 between their centre pixels, both ends included, footprint stamped
 *                 at every line pixel; a sample outside the image ends the segment
 *   values        add writes 1, erase writes 0, on one slice of the WORKING mask;
 *                 nothing in this file writes the source mask
 *   history       one committed stroke = one undo step (slice, changed flat indices,
 *                 old values, new values - changed pixels only); a new stroke clears
 *                 redo; reset restores every slice from the source and clears history
 *   flat index    y * nx + x (row-major; DR-008a x = column, y = row)
 */

import { screenToSource, sha256Hex } from './viewerMath.js';

export const RADII = [0, 1, 2, 3, 5];

// How a stroke ended. Only a normal lift commits; the other two roll back.
export const END_RELEASE = 'release';
export const END_SECOND_FINGER = 'second_finger';
export const END_TERMINATED = 'terminated';

export function footprint(cx, cy, r, nx, ny) {
  const out = [];
  const y1 = Math.min(ny - 1, cy + r);
  const x1 = Math.min(nx - 1, cx + r);
  for (let y = Math.max(0, cy - r); y <= y1; y++) {
    for (let x = Math.max(0, cx - r); x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) out.push(y * nx + x);
    }
  }
  return out;
}

// All-octant integer Bresenham, both endpoints included, as flat [x, y, x, y, ...].
// generate.py states the same line as a rounding rule instead of this loop.
export function linePixels(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

export function beginStroke(slice, tool, radius) {
  if (tool !== 'add' && tool !== 'erase') throw new Error(`unknown brush tool ${tool}`);
  if (!(Number.isInteger(radius) && radius >= 0)) throw new Error(`brush radius ${radius} is not a non-negative integer`);
  return {
    slice, tool, radius, value: tool === 'add' ? 1 : 0, prev: null,
    indices: [], oldValues: [], received: 0, applied: 0, outside: 0,
  };
}

/*
 * THE entry point for one touch sample. The live PanResponder handler, the
 * "kiểm A5" check and the scripted A3–A7 run all come through here, so the
 * offline test exercises the path a finger does. `buf` is the stroke's slice of
 * the working mask; `t` is the display transform {zoom, panX, panY}.
 */
export function strokeSample(stroke, buf, u, v, t, nx, ny) {
  stroke.received += 1;
  const c = screenToSource(u, v, t, nx, ny);
  if (!c) {
    stroke.outside += 1;
    stroke.prev = null;                       // no line is drawn across the outside
    return null;
  }
  const p = stroke.prev;
  const line = p ? linePixels(p[0], p[1], c[0], c[1]) : c;
  const { value, radius, indices, oldValues } = stroke;
  for (let k = 0; k < line.length; k += 2) {
    const fp = footprint(line[k], line[k + 1], radius, nx, ny);
    for (let m = 0; m < fp.length; m++) {
      const i = fp[m];
      // A stroke writes one value, so a pixel changes at most once per stroke and
      // oldValues holds its value from before the stroke.
      if (buf[i] !== value) { indices.push(i); oldValues.push(buf[i]); buf[i] = value; }
    }
  }
  stroke.applied += 1;
  stroke.prev = c;
  return c;
}

export function rollbackStroke(stroke, buf) {
  const n = stroke.indices.length;
  for (let k = n - 1; k >= 0; k--) buf[stroke.indices[k]] = stroke.oldValues[k];
  stroke.indices = [];
  stroke.oldValues = [];
  stroke.prev = null;
  return n;
}

export function createHistory() {
  return { undo: [], redo: [] };
}

export function commitStroke(history, stroke) {
  const n = stroke.indices.length;
  const entry = {
    slice: stroke.slice, tool: stroke.tool, radius: stroke.radius,
    indices: Int32Array.from(stroke.indices),
    oldValues: Uint8Array.from(stroke.oldValues),
    newValues: new Uint8Array(n).fill(stroke.value),
  };
  history.undo.push(entry);
  history.redo.length = 0;
  return entry;
}

/*
 * Finish a stroke. END_RELEASE commits it as one undo step. END_SECOND_FINGER
 * (a second finger landed: the gesture is navigation) and END_TERMINATED (the
 * system took the gesture away) restore the working mask exactly and leave
 * history untouched. `changed` is how many pixels the stroke had changed when it
 * ended - restored again when committed is false.
 */
export function endStroke(history, stroke, buf, end) {
  if (end === END_RELEASE) {
    const entry = commitStroke(history, stroke);
    return { committed: true, end, changed: entry.indices.length, entry };
  }
  if (end !== END_SECOND_FINGER && end !== END_TERMINATED) throw new Error(`unknown stroke end ${end}`);
  return { committed: false, end, changed: rollbackStroke(stroke, buf), entry: null };
}

export function undo(history, working) {
  const e = history.undo.pop();
  if (!e) return null;
  const buf = working[e.slice];
  for (let k = e.indices.length - 1; k >= 0; k--) buf[e.indices[k]] = e.oldValues[k];
  history.redo.push(e);
  return e;
}

export function redo(history, working) {
  const e = history.redo.pop();
  if (!e) return null;
  const buf = working[e.slice];
  for (let k = 0; k < e.indices.length; k++) buf[e.indices[k]] = e.newValues[k];
  history.undo.push(e);
  return e;
}

export function copySlices(source) {
  return source.map((b) => new Uint8Array(b));
}

export function resetWorking(history, working, source) {
  for (let z = 0; z < source.length; z++) working[z].set(source[z]);
  history.undo.length = 0;
  history.redo.length = 0;
}

export function volumeSha256(slices) {
  let n = 0;
  for (const b of slices) n += b.length;
  const all = new Uint8Array(n);
  let o = 0;
  for (const b of slices) { all.set(b, o); o += b.length; }
  return sha256Hex(all);
}

/*
 * Rendering: where one working slice differs from its source, as row runs.
 * Consecutive pixels of the same kind in a row are one run, so the overlay
 * draws a handful of rectangles instead of a View per pixel.
 */
export function diffRuns(work, src, nx, ny) {
  const runs = [];
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    let x = 0;
    while (x < nx) {
      const w = work[row + x];
      if (w === src[row + x]) { x += 1; continue; }
      const start = x;
      x += 1;
      while (x < nx && work[row + x] === w && src[row + x] !== w) x += 1;
      runs.push({ y, x: start, len: x - start, kind: w === 1 ? 'add' : 'erase' });
    }
  }
  return runs;
}

/*
 * "kiểm A5": every brush case as one ADD sample on a blank scratch slice, through
 * strokeSample, compared with the expected painted set (sorted flat indices).
 * `cases` holds one compact record per case - [centre x, centre y, pixels
 * painted, first 12 hex of the scratch slice's SHA-256] - so a reader can
 * recompute the verdict without trusting `pass`.
 */
export function runA5(cases, radius, expectedSets, nx, ny) {
  const scratch = new Uint8Array(nx * ny);
  const history = createHistory();
  const records = [];
  const errors = [];
  let pass = 0;
  cases.forEach((c, k) => {
    scratch.fill(0);
    const st = beginStroke(c.slice_index, 'add', radius);
    const centre = strokeSample(st, scratch, c.touch_u, c.touch_v, { zoom: c.zoom, panX: c.pan_x, panY: c.pan_y }, nx, ny);
    const { entry } = endStroke(history, st, scratch, END_RELEASE);
    const got = Array.from(entry.indices).sort((a, b) => a - b);
    const want = expectedSets[k];
    records.push([centre ? centre[0] : null, centre ? centre[1] : null, got.length, sha256Hex(scratch).slice(0, 12)]);
    if (got.length === want.length && got.every((i, m) => i === want[m])) {
      pass += 1;
      return;
    }
    const exp = c.expected_source_pixel;
    errors.push({
      id: c.id,
      dx: centre && exp ? centre[0] - exp[0] : null,
      dy: centre && exp ? centre[1] - exp[1] : null,
      changed: got.length,
      expected_changed: want.length,
    });
  });
  return { radius, pass, of: cases.length, errors, cases: records };
}

/*
 * "A3–A7 tự động": the brush_ops.json script on a scratch copy of the source
 * mask, through strokeSample, then undo all, redo all and reset. Returns the log
 * records in order; the caller only emits them. The user's working mask is
 * never passed in here.
 */
export function runOpsScript(fx, source, nx, ny) {
  const working = copySlices(source);
  const history = createHistory();
  const records = [];
  let step = 0;
  for (const op of fx.ops) {
    const st = beginStroke(op.slice, op.tool, op.radius);
    const t = { zoom: op.transform.zoom, panX: op.transform.pan_x, panY: op.transform.pan_y };
    for (const [u, v] of op.samples) strokeSample(st, working[op.slice], u, v, t, nx, ny);
    const r = endStroke(history, st, working[op.slice], END_RELEASE);
    step += 1;
    records.push({ step, op: op.id, slice: op.slice, hash: sha256Hex(working[op.slice]), changed: r.changed, volume: volumeSha256(working) });
  }
  while (history.undo.length) {
    const id = fx.ops[history.undo.length - 1].id;
    const e = undo(history, working);
    step += 1;
    records.push({ step, op: `undo:${id}`, slice: e.slice, hash: sha256Hex(working[e.slice]), changed: e.indices.length, volume: volumeSha256(working) });
  }
  step += 1;
  records.push({ step, op: 'undo-all', hashes: working.map((b) => sha256Hex(b)) });
  while (history.redo.length) {
    const id = fx.ops[history.undo.length].id;
    const e = redo(history, working);
    step += 1;
    records.push({ step, op: `redo:${id}`, slice: e.slice, hash: sha256Hex(working[e.slice]), changed: e.indices.length, volume: volumeSha256(working) });
  }
  step += 1;
  records.push({ step, op: 'redo-all', hashes: working.map((b) => sha256Hex(b)) });
  resetWorking(history, working, source);
  step += 1;
  records.push({ step, op: 'reset', hashes: working.map((b) => sha256Hex(b)), undo_depth: history.undo.length, redo_depth: history.redo.length });
  return records;
}
