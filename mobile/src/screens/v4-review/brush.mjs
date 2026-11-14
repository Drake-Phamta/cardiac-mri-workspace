// Brush model behind SCR-06: the working mask a reviewer edits, one slice at a time, at source resolution.
// It keeps a private, hashed copy of each source slice (never written), the undo/redo history, the
// SOURCE / UNSAVED / SAVED state of each slice and the upload payload. Plain JS that Node tests import.

import { CoreError } from '../../api/contract.mjs';
import { screenToSource } from '../../lib/viewMath.mjs';
import { sha256Hex, base64ToBytes, bytesToBase64 } from '../../lib/bytes.mjs';

// Stroke and history functions, copied unchanged from the 2D viewer prototype, where they ran on the phone.
//   footprint  the disc (x-cx)^2 + (y-cy)^2 <= r^2 in source pixels, so zoom and pan cannot change a stamp
//   stroke     consecutive in-image samples joined by a Bresenham line, the footprint stamped at every
//              line pixel; a sample outside the image paints nothing and ends the segment
//   values     add writes 1, erase writes 0, on the working mask only
//   history    one committed stroke = one undo step (changed pixels only); a new stroke clears redo
//   index      y * nx + x (row-major; x = column, y = row)

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

// The one entry point for a touch sample, so the tests exercise the same path a finger does.
// `buf` is the stroke's slice of the working mask; `t` is the display transform {zoom, panX, panY}.
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

// END_RELEASE commits the stroke as one undo step. END_SECOND_FINGER (the gesture became navigation) and
// END_TERMINATED (the system took the gesture) restore the working mask exactly and leave history alone.
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

// Where a working slice differs from its source, as row runs, so the overlay draws a few rectangles
// instead of one per pixel.
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

// The edit session the screen uses, built on the functions above.

export const TOOL = Object.freeze({ ADD: 'add', ERASE: 'erase' });

// Frozen here, so no caller can widen the brush sizes.
Object.freeze(RADII);

// What a review's source may be: a raw or a processed prediction. Ground truth is left out because it is
// never an editable source (spec 10 §5). An earlier reviewed version is not a source either; it is the
// base a continued review starts from.
export const SOURCE_KIND = Object.freeze({
  RAW_PREDICTION: 'RAW_PREDICTION',
  PROCESSED_PREDICTION: 'PROCESSED_PREDICTION',
});

// The source kind of each prediction variant.
export const SOURCE_KIND_FOR_VARIANT = Object.freeze({
  RAW: SOURCE_KIND.RAW_PREDICTION,
  PROCESSED: SOURCE_KIND.PROCESSED_PREDICTION,
});

// The three slice states the screen must tell apart:
//   SOURCE   the slice still equals the source and nothing was saved
//   UNSAVED  it differs from what is saved (or from the source, before a save)
//   SAVED    it equals what the last successful save committed
export const MASK_STATE = Object.freeze({ SOURCE: 'SOURCE', UNSAVED: 'UNSAVED', SAVED: 'SAVED' });

// One slice ready to upload: the contract's mask_payload ({ encoding, data }, exactly those two keys),
// with the slice index and the SHA-256 of its 0/1 bytes kept beside it.
export function exportEntry(sliceIndex, buf, nx, ny) {
  return Object.freeze({
    sliceIndex,
    sha256: sha256Hex(buf),
    maskPayload: encodeMaskPayload(buf, nx, ny),
  });
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ENDS = [END_RELEASE, END_SECOND_FINGER, END_TERMINATED];

// One edit session over one source mask.
//   nx, ny   the source resolution; every buffer is nx * ny bytes, row-major
//   source   { maskId, kind, ... }: what is being corrected, sent as source_mask_id; kind is a SOURCE_KIND
//   base     null for a first review; for a CORRECTED review, { reviewedMaskId } of the latest version the
//            working slices start from. Reset still goes back to the source.
// Slices arrive one at a time through loadSlice(z, bytes); the caller's buffer is copied, never written.
export function createBrushSession({ nx, ny, source, base = null } = {}) {
  if (!(Number.isInteger(nx) && nx > 0 && Number.isInteger(ny) && ny > 0)) {
    throw new CoreError('BRUSH_SHAPE_INVALID', { nx, ny });
  }
  if (!source || typeof source.maskId !== 'string' || source.maskId === '') {
    throw new CoreError('SOURCE_IDENTITY_MISSING', {});
  }
  if (!(typeof source.kind === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_KIND, source.kind))) {
    throw new CoreError('SOURCE_NOT_EDITABLE', { kind: source.kind ?? null, editable: Object.keys(SOURCE_KIND) });
  }
  const identity = Object.freeze({
    maskId: source.maskId, kind: source.kind, variant: source.variant ?? null, checksum: source.checksum ?? null,
    // True for the fixture-mode stand-in; the screen must label it.
    synthetic: source.synthetic === true,
  });
  if (base !== null && !(base && typeof base.reviewedMaskId === 'string' && base.reviewedMaskId !== '')) {
    throw new CoreError('BASE_IDENTITY_MISSING', {});
  }
  // The version the pixels continue from; it moves to the new version after each successful save.
  let baseId = base ? base.reviewedMaskId : null;
  const length = nx * ny;

  // Sparse arrays indexed by slice: only the slices the screen has opened.
  const src = [];       // private source copies — written once, at load, never again
  const srcSha = [];    // SHA-256 of each source copy, taken at load
  const working = [];   // what strokes write into
  const saved = [];     // the bytes the last successful save committed
  const uploaded = new Set();
  const history = createHistory();
  const totals = { strokes: 0, committed: 0, rolledBack: 0, received: 0, applied: 0, outside: 0 };
  let tool = TOOL.ADD;
  let radius = 2;
  let active = null;
  let lastSave = null;

  const loaded = () => {
    const out = [];
    working.forEach((_, z) => out.push(z));
    return out;
  };
  const requireLoaded = (z) => {
    if (!working[z]) throw new CoreError('SLICE_NOT_LOADED', { sliceIndex: z });
  };

  const checkBinary = (z, bytes, code) => {
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
      throw new CoreError('SLICE_SHAPE_MISMATCH', { sliceIndex: z, expected: length, got: bytes ? bytes.length : null });
    }
    for (let i = 0; i < length; i++) {
      if (bytes[i] > 1) throw new CoreError(code, { sliceIndex: z, index: i, value: bytes[i] });
    }
  };

  // `bytes` is the source prediction's slice. When continuing a CORRECTED review, `slice.base` is the same
  // slice of the latest version: it becomes the working and the saved copy, while reset still returns to
  // the source. A session with a base refuses a slice without one, or the next version would lose the
  // earlier correction.
  function loadSlice(z, bytes, slice = {}) {
    if (!(Number.isInteger(z) && z >= 0)) throw new CoreError('SLICE_INDEX_INVALID', { sliceIndex: z });
    checkBinary(z, bytes, 'SOURCE_NOT_BINARY');
    const sliceBase = slice.base ?? null;
    if (baseId !== null && sliceBase === null) throw new CoreError('BASE_SLICE_MISSING', { sliceIndex: z, baseId });
    if (baseId === null && sliceBase !== null) throw new CoreError('BASE_NOT_DECLARED', { sliceIndex: z });
    if (sliceBase !== null) checkBinary(z, sliceBase, 'BASE_NOT_BINARY');
    const sha = sha256Hex(bytes);
    if (src[z]) {
      if (sha === srcSha[z]) return sha;
      // Swapping the source under open edits would make every undo entry and
      // the reset target describe a mask that is no longer there.
      throw new CoreError('SOURCE_CHANGED', { sliceIndex: z, loaded: srcSha[z], offered: sha });
    }
    src[z] = Uint8Array.from(bytes);
    srcSha[z] = sha;
    working[z] = Uint8Array.from(sliceBase ?? bytes);
    if (sliceBase !== null) saved[z] = Uint8Array.from(sliceBase);
    return sha;
  }

  function setTool(next) {
    if (next !== TOOL.ADD && next !== TOOL.ERASE) throw new CoreError('BRUSH_TOOL_UNKNOWN', { tool: next });
    tool = next;
  }

  function setRadius(r) {
    if (!RADII.includes(r)) throw new CoreError('BRUSH_RADIUS_OUT_OF_RANGE', { radius: r, allowed: RADII });
    radius = r;
  }

  function finish(end) {
    const s = active;
    active = null;
    const r = endStroke(history, s, working[s.slice], end);
    totals.strokes += 1;
    if (r.committed) totals.committed += 1; else totals.rolledBack += 1;
    totals.received += s.received;
    totals.applied += s.applied;
    totals.outside += s.outside;
    return Object.freeze({
      slice: s.slice, tool: s.tool, radius: s.radius, end, committed: r.committed, changed: r.changed,
      received: s.received, applied: s.applied, outside: s.outside,
      // Every sample is painted or counted as outside the image; a non-zero `lost` means one was dropped.
      lost: s.received - s.applied - s.outside,
    });
  }

  // Undo, redo, reset, cancel and save end a live stroke first, never by committing it:
  // only a clean lift commits.
  const settle = () => (active ? finish(END_TERMINATED) : null);

  function begin(z) {
    requireLoaded(z);
    const interrupted = settle();
    active = beginStroke(z, tool, radius);
    return interrupted;
  }

  function sample(u, v, t) {
    if (!active) throw new CoreError('NO_ACTIVE_STROKE', {});
    return strokeSample(active, working[active.slice], u, v, t, nx, ny);
  }

  function end(how = END_RELEASE) {
    if (!ENDS.includes(how)) throw new CoreError('STROKE_END_UNKNOWN', { end: how });
    return active ? finish(how) : null;
  }

  function restoreAll(from) {
    settle();
    for (const z of loaded()) working[z].set(from(z));
    history.undo.length = 0;
    history.redo.length = 0;
  }

  function maskState(z) {
    requireLoaded(z);
    if (saved[z]) return sameBytes(working[z], saved[z]) ? MASK_STATE.SAVED : MASK_STATE.UNSAVED;
    return sameBytes(working[z], src[z]) ? MASK_STATE.SOURCE : MASK_STATE.UNSAVED;
  }

  const unsavedSlices = () => loaded().filter((z) => maskState(z) === MASK_STATE.UNSAVED);

  // A save uploads every slice that differs from what is committed (last save, else the base, else the
  // source), plus every slice PUT since the last commit: the server keeps the last PUT, so an edit undone
  // after a failed save must be sent again. A commit consumes those copies, so a save right after a save
  // has nothing to send.
  const committed = (z) => saved[z] ?? src[z];
  const slicesToUpload = () => loaded().filter((z) => uploaded.has(z) || !sameBytes(working[z], committed(z)));

  // Freeze what this save sends now, not when the commit returns: strokes are still accepted while the
  // save is in flight, and SAVED must mean what was committed.
  function prepareSave() {
    settle();
    const snapshot = new Map(loaded().map((z) => [z, Uint8Array.from(working[z])]));
    const entries = slicesToUpload().map((z) => exportEntry(z, snapshot.get(z), nx, ny));
    return Object.freeze({ source: identity, entries: Object.freeze(entries), snapshot });
  }

  function markUploaded(z) {
    requireLoaded(z);
    uploaded.add(z);
  }

  function markSaved(prepared, commit = {}) {
    for (const [z, bytes] of prepared.snapshot) saved[z] = bytes;
    // The commit consumed the server's working copies and is now the version the next edit continues from.
    uploaded.clear();
    if (typeof commit.reviewedMaskId === 'string' && commit.reviewedMaskId !== '') baseId = commit.reviewedMaskId;
    lastSave = Object.freeze({ ...commit, slices: Object.freeze(prepared.entries.map((e) => e.sliceIndex)) });
    return lastSave;
  }

  // Checks the source was never written: re-hash each source copy against its hash at load.
  function sourceIntact() {
    const changed = loaded().filter((z) => sha256Hex(src[z]) !== srcSha[z]);
    return Object.freeze({ ok: changed.length === 0, slices: loaded().length, changed: Object.freeze(changed) });
  }

  function overall() {
    const z = loaded();
    if (z.some((k) => maskState(k) === MASK_STATE.UNSAVED)) return MASK_STATE.UNSAVED;
    return lastSave || z.some((k) => saved[k]) ? MASK_STATE.SAVED : MASK_STATE.SOURCE;
  }

  // What a toolbar renders. Plain data, rebuilt on every call.
  function state() {
    return Object.freeze({
      source: identity,
      baseId,
      nx,
      ny,
      tool,
      radius,
      radii: RADII,
      strokeActive: active !== null,
      canUndo: history.undo.length > 0,
      canRedo: history.redo.length > 0,
      undoDepth: history.undo.length,
      redoDepth: history.redo.length,
      maskState: overall(),
      loadedSlices: Object.freeze(loaded()),
      unsavedSlices: Object.freeze(unsavedSlices()),
      lastSave,
      totals: Object.freeze({ ...totals, lost: totals.received - totals.applied - totals.outside }),
    });
  }

  return Object.freeze({
    get source() { return identity; },
    // The reviewed version this session's pixels continue from, or null.
    get baseId() { return baseId; },
    get nx() { return nx; },
    get ny() { return ny; },
    state,
    loadSlice,
    sourceSha: (z) => { requireLoaded(z); return srcSha[z]; },
    setTool,
    setRadius,
    beginStroke: begin,
    sample,
    endStroke: end,
    undo: () => { settle(); return undo(history, working); },
    redo: () => { settle(); return redo(history, working); },
    // Every open slice back to the exact source; the history goes too, since its edits no longer exist.
    reset: () => { restoreAll((z) => src[z]); return state(); },
    // Back to the last save, or to the source when nothing has been saved yet.
    cancel: () => { restoreAll((z) => saved[z] ?? src[z]); return state(); },
    maskState,
    // Read-only views for drawing. Callers must not write into them.
    workingSlice: (z) => { requireLoaded(z); return working[z]; },
    sourceSlice: (z) => { requireLoaded(z); return src[z]; },
    // What the last save committed for this slice, or null, so saved and unsaved edits draw differently.
    savedSlice: (z) => { requireLoaded(z); return saved[z] ?? null; },
    diffRuns: (z) => { requireLoaded(z); return diffRuns(working[z], src[z], nx, ny); },
    sourceIntact,
    slicesToUpload,
    exportSlice: (z) => { requireLoaded(z); return exportEntry(z, working[z], nx, ny); },
    prepareSave,
    markUploaded,
    markSaved,
  });
}

// Upload encoding for working_mask_put: mask_payload is { encoding, data }. BITPACK_BASE64 is base64 of
// Ny*Nx bits, row-major, most significant bit first, 1 = foreground. It needs no PNG encoder on the phone;
// PNG_BASE64 is allowed by the contract but not produced here.

export const MASK_PAYLOAD_ENCODING = Object.freeze({
  BITPACK_BASE64: 'BITPACK_BASE64',
  PNG_BASE64: 'PNG_BASE64',
});

// 0/1 bytes -> bits, most significant bit first; a trailing partial byte is zero-padded.
export function packBits(buf) {
  const out = new Uint8Array(Math.ceil(buf.length / 8));
  for (let k = 0; k < buf.length; k++) if (buf[k]) out[k >> 3] |= 0x80 >> (k & 7);
  return out;
}

export function unpackBits(packed, length) {
  const out = new Uint8Array(length);
  for (let k = 0; k < length; k++) out[k] = (packed[k >> 3] >> (7 - (k & 7))) & 1;
  return out;
}

export function encodeMaskPayload(buf, nx, ny) {
  if (buf.length !== nx * ny) throw new CoreError('MASK_SHAPE_MISMATCH', { expected: nx * ny, got: buf.length });
  return Object.freeze({ encoding: MASK_PAYLOAD_ENCODING.BITPACK_BASE64, data: bytesToBase64(packBits(buf)) });
}

// The inverse, used to check what a reload returns. BITPACK_BASE64 only.
export function decodeMaskPayload(payload, nx, ny) {
  if (!payload || payload.encoding !== MASK_PAYLOAD_ENCODING.BITPACK_BASE64 || typeof payload.data !== 'string') {
    throw new CoreError('MASK_PAYLOAD_UNSUPPORTED', { encoding: payload ? payload.encoding : null });
  }
  const packed = base64ToBytes(payload.data);
  const need = Math.ceil((nx * ny) / 8);
  if (packed.length !== need) throw new CoreError('MASK_SHAPE_MISMATCH', { expected: need, got: packed.length });
  return unpackBits(packed, nx * ny);
}
