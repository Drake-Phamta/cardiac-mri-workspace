/*
 * V4 brush model — the working mask behind SCR-06 Review / Correction.
 *
 * Framework-neutral like the rest of app/: no React, no React Native, no node
 * builtin. A screen feeds it touch samples and draws what it returns; nothing
 * here knows how a pixel reaches the display.
 *
 * PROVENANCE — the stroke, footprint and history functions are a COPY, not an
 * import (app/README.md rule 2: no import from spikes/**).
 *   source : spikes/spike_a_2d/app/brushMath.js
 *   commit : e41e78b "SPIKE_A S5: pure brush logic in brushMath.js, checked offline as F5"
 *   blob   : abb3ec28abdca146cc88d8e396bdc1f82fa22609
 *   copied : 2026-10-01 (Day 22), character-for-character: RADII, the three
 *            END_* constants, footprint, linePixels, beginStroke, strokeSample,
 *            rollbackStroke, createHistory, commitStroke, endStroke, undo,
 *            redo, diffRuns. The one changed line is the import: screenToSource
 *            now comes from app/core, itself a checked copy of the same spike
 *            function (app/core/tests/test_view_math.mjs V0).
 *   source : spikes/spike_a_2d/app/persist.js  (PR #49, branch spike-a/s8-save-reload)
 *   commit : 0e3e54f "SPIKE_A S8: save/reload for A8, and the two scripts that conclude A10/A11"
 *   blob   : c5c2c6cd7e20f14cdc0fdd32fc1dfba219274cc9
 *   copied : 2026-10-01, rleEncodeSlice and rleDecodeSlice, character-for-character.
 *
 * Why a copy and not a rewrite: these exact functions are what Spike A measured
 * on the A17 — A3/A4 8/8 strokes against an independent Python oracle, A5 60/60
 * at r = 0 and r = 2 after zoom/pan, the A6/A7 undo and redo walks, A8 byte-exact
 * save/reload, A10 worst stroke feedback 30.48 ms with 0 committed samples lost,
 * A11 12/12 second-finger interruptions rolled back. A rewrite would throw that
 * evidence away. test_brush.mjs B0 keeps the copy honest and B1 replays the
 * spike's own oracle against it.
 *
 * NOT copied: runA5 and runOpsScript (the spike's measurement hooks);
 * copySlices, resetWorking and volumeSha256, which assume the whole volume is
 * in memory — SCR-06 loads slices one at a time, so the session below does the
 * same work over the slices it holds; persist.js's file format, which was the
 * spike's own. The API payload below is V4's.
 *
 * What V4 adds (createBrushSession):
 *   - a declared source identity, refused when it is ground truth (`10` §5);
 *   - a private copy of every source slice with its SHA-256 taken at load, so
 *     "the source mask was never written" is a check, not a belief (TC-REV-006);
 *   - a per-slice mask state SOURCE / UNSAVED / SAVED, because SCR-06 must tell
 *     the three apart at a glance (`10` §3, DEMO_STANDARD §4);
 *   - reset (back to the declared source, FR-REV-007) and cancel (back to the
 *     last save, `10` §5) as two different operations;
 *   - sample accounting, received = applied + outside and lost = 0, which is
 *     the logic half of TC-PERF-003 (the ≤ 100 ms half is a device measurement);
 *   - the save export: one run-length payload per slice, with its SHA-256.
 */

import { CoreError, screenToSource } from '../../core/index.mjs';
import { sha256Hex } from './sha256.mjs';

// ---------------------------------------------------------------------------
// Copied from spikes/spike_a_2d/app/brushMath.js (see the header).
//
// Contract (spike fixtures/brush_ops.json `contract`):
//   centre pixel  screenToSource - floor, null outside the image, and null paints nothing
//   footprint     {(x, y) : (x-cx)^2 + (y-cy)^2 <= r^2, inside the image}, in SOURCE
//                 pixels, so zoom and pan cannot change what a stamp covers
//   stroke        consecutive in-image samples joined by an integer Bresenham line
//                 between their centre pixels, both ends included, footprint stamped
//                 at every line pixel; a sample outside the image ends the segment
//   values        add writes 1, erase writes 0, on one slice of the WORKING mask;
//                 nothing in this file writes the source mask
//   history       one committed stroke = one undo step (slice, changed flat indices,
//                 old values, new values - changed pixels only); a new stroke clears
//                 redo; reset restores every slice from the source and clears history
//   flat index    y * nx + x (row-major; DR-008a x = column, y = row)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Copied from spikes/spike_a_2d/app/persist.js (see the header).
//
// One slice -> alternating run lengths, starting with a run of value 0. A slice
// that begins with 1 therefore starts with a zero-length run, which costs one
// number and removes the need for a separate "first value" field.
// ---------------------------------------------------------------------------

export function rleEncodeSlice(buf) {
  const runs = [];
  let value = 0;
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] ? 1 : 0;
    if (v === value) { count += 1; continue; }
    runs.push(count);
    value = v;
    count = 1;
  }
  runs.push(count);
  return runs;
}

export function rleDecodeSlice(runs, length) {
  const buf = new Uint8Array(length);
  let at = 0;
  let value = 0;
  for (let i = 0; i < runs.length; i++) {
    const n = runs[i];
    if (value === 1) buf.fill(1, at, at + n);
    at += n;
    value = value === 1 ? 0 : 1;
  }
  if (at !== length) {
    throw new Error(`rle length mismatch: runs cover ${at}, expected ${length}`);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// V4's own code from here down.
// ---------------------------------------------------------------------------

export const TOOL = Object.freeze({ ADD: 'add', ERASE: 'erase' });

// The copied RADII line stays byte-identical to the spike (B0); freezing it
// here means no caller can widen the measured range (FR-REV-004).
Object.freeze(RADII);

/*
 * What a working mask may start from: the contract's own artifact kinds
 * (artifact_rules). GROUND_TRUTH is absent on purpose — `10` §5: "Ground truth
 * is never a default editable source and must not be copied into a reviewed
 * mask as if it were a user correction", and working_mask_put: "Ground truth
 * cannot be used as an implicit source prediction".
 */
export const SOURCE_KIND = Object.freeze({
  RAW_PREDICTION_MASK: 'RAW_PREDICTION_MASK',
  PROCESSED_PREDICTION_MASK: 'PROCESSED_PREDICTION_MASK',
  REVIEWED_MASK: 'REVIEWED_MASK',
});

// The SCR-03 prediction variant (`11` §6) a correction starts from, as its kind.
export const SOURCE_KIND_FOR_VARIANT = Object.freeze({
  RAW: SOURCE_KIND.RAW_PREDICTION_MASK,
  PROCESSED: SOURCE_KIND.PROCESSED_PREDICTION_MASK,
  REVIEWED: SOURCE_KIND.REVIEWED_MASK,
});

/*
 * The three things SCR-06 must keep apart (`10` §3 "user must be able to
 * distinguish raw prediction from unsaved/saved reviewed mask"):
 *   SOURCE   the slice still equals the declared source and nothing was saved
 *   UNSAVED  it differs from what is saved (or from the source, before a save)
 *   SAVED    it equals what the last successful save committed
 */
export const MASK_STATE = Object.freeze({ SOURCE: 'SOURCE', UNSAVED: 'UNSAVED', SAVED: 'SAVED' });

/*
 * working_mask_put.mask_payload. `11` §8 leaves the binary encoding to the
 * ADR ("edited binary slice payload or equivalent deterministic delta"). Until
 * it picks one, this is V4's proposal: persist.js's run-length coding, which
 * A8 measured byte-exact on the device, plus the SHA-256 of the decoded slice
 * so the receiver can prove it reconstructed the same bytes.
 */
export const PAYLOAD_FORMAT = 'v4_binary_slice_rle/v1';

export function encodeSlicePayload(sliceIndex, buf, nx, ny) {
  return Object.freeze({
    format: PAYLOAD_FORMAT,
    slice_index: sliceIndex,
    nx,
    ny,
    runs: Object.freeze(rleEncodeSlice(buf)),
    sha256: sha256Hex(buf),
  });
}

// Never throws on a checksum mismatch — it reports it. A decoder that hides a
// bad reload behind an exception says "reload failed" when the finding is
// "reload silently changed the mask" (the same reasoning as persist.js).
export function decodeSlicePayload(payload) {
  if (!payload || payload.format !== PAYLOAD_FORMAT) {
    throw new CoreError('MASK_PAYLOAD_FORMAT', { format: payload ? payload.format : null });
  }
  const bytes = rleDecodeSlice(payload.runs, payload.nx * payload.ny);
  const sha256 = sha256Hex(bytes);
  return { bytes, sha256, verified: sha256 === payload.sha256 };
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const ENDS = [END_RELEASE, END_SECOND_FINGER, END_TERMINATED];

/*
 * One edit session over one declared source mask.
 *
 *   nx, ny   the SOURCE resolution; every buffer here is nx * ny bytes, row-major
 *   source   { maskId, kind, checksum? } — what is being corrected, shown before
 *            save and sent as source_mask_id. kind is a SOURCE_KIND.
 *
 * Slices arrive one at a time through loadSlice(z, bytes): the session keeps
 * its own copy of the bytes (the caller's buffer is never written either) and
 * a working copy that strokes write into. Everything is at source resolution;
 * the display transform only ever reaches the brush through screenToSource.
 */
export function createBrushSession({ nx, ny, source } = {}) {
  if (!(Number.isInteger(nx) && nx > 0 && Number.isInteger(ny) && ny > 0)) {
    throw new CoreError('BRUSH_SHAPE_INVALID', { nx, ny });
  }
  if (!source || typeof source.maskId !== 'string' || source.maskId === '') {
    throw new CoreError('SOURCE_IDENTITY_MISSING', {});
  }
  if (!(typeof source.kind === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_KIND, source.kind))) {
    throw new CoreError('SOURCE_NOT_EDITABLE', { kind: source.kind ?? null, editable: Object.keys(SOURCE_KIND) });
  }
  const identity = Object.freeze({ maskId: source.maskId, kind: source.kind, checksum: source.checksum ?? null });
  const length = nx * ny;

  // All sparse arrays indexed by slice: SCR-06 holds the slices it has opened.
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

  function loadSlice(z, bytes) {
    if (!(Number.isInteger(z) && z >= 0)) throw new CoreError('SLICE_INDEX_INVALID', { sliceIndex: z });
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
      throw new CoreError('SLICE_SHAPE_MISMATCH', { sliceIndex: z, expected: length, got: bytes ? bytes.length : null });
    }
    for (let i = 0; i < length; i++) {
      if (bytes[i] > 1) throw new CoreError('SOURCE_NOT_BINARY', { sliceIndex: z, index: i, value: bytes[i] });
    }
    const sha = sha256Hex(bytes);
    if (src[z]) {
      if (sha === srcSha[z]) return sha;
      // Swapping the source under open edits would make every undo entry and
      // the reset target describe a mask that is no longer there.
      throw new CoreError('SOURCE_CHANGED', { sliceIndex: z, loaded: srcSha[z], offered: sha });
    }
    src[z] = Uint8Array.from(bytes);
    srcSha[z] = sha;
    working[z] = Uint8Array.from(bytes);
    return sha;
  }

  function setTool(next) {
    if (next !== TOOL.ADD && next !== TOOL.ERASE) throw new CoreError('BRUSH_TOOL_UNKNOWN', { tool: next });
    tool = next;
  }

  // FR-REV-004 "adjustable within a bounded useful range": the measured radii.
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
      // Every sample is either painted or counted as outside the image. A
      // non-zero `lost` would mean a sample was dropped (TC-PERF-003).
      lost: s.received - s.applied - s.outside,
    });
  }

  // Undo, redo, reset, cancel and save all end a live stroke first, and never
  // by committing it: only a clean lift commits (the A11 rule).
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

  /*
   * What a save must upload: every slice that differs from the source, plus
   * every slice the server was sent before. The server's working copy of a
   * slice is whatever was last PUT; if the user has since undone that edit
   * (after a failed save, say), skipping the slice would let the stale edit
   * ride into the commit.
   */
  const slicesToUpload = () => loaded().filter((z) => uploaded.has(z) || !sameBytes(working[z], src[z]));

  /*
   * Freeze what this save is about to send. The snapshot is taken now, not
   * when the commit returns: the UI keeps accepting strokes while the save is
   * in flight, and SAVED must mean "what was committed", not "what is on
   * screen when the response arrives".
   */
  function prepareSave() {
    settle();
    const snapshot = new Map(loaded().map((z) => [z, Uint8Array.from(working[z])]));
    const payloads = slicesToUpload().map((z) => encodeSlicePayload(z, snapshot.get(z), nx, ny));
    return Object.freeze({ source: identity, payloads: Object.freeze(payloads), snapshot });
  }

  function markUploaded(z) {
    requireLoaded(z);
    uploaded.add(z);
  }

  function markSaved(prepared, commit = {}) {
    for (const [z, bytes] of prepared.snapshot) saved[z] = bytes;
    lastSave = Object.freeze({ ...commit, slices: Object.freeze(prepared.payloads.map((p) => p.slice_index)) });
    return lastSave;
  }

  // Re-hash every source copy against the hash taken at load (TC-REV-006).
  function sourceIntact() {
    const changed = loaded().filter((z) => sha256Hex(src[z]) !== srcSha[z]);
    return Object.freeze({ ok: changed.length === 0, slices: loaded().length, changed: Object.freeze(changed) });
  }

  function overall() {
    const z = loaded();
    if (z.some((k) => maskState(k) === MASK_STATE.UNSAVED)) return MASK_STATE.UNSAVED;
    return lastSave ? MASK_STATE.SAVED : MASK_STATE.SOURCE;
  }

  // What a toolbar renders. Plain data, rebuilt on every call.
  function state() {
    return Object.freeze({
      source: identity,
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
    // FR-REV-007: every open slice back to the exact declared source; the
    // history goes too, since its entries describe edits that no longer exist.
    reset: () => { restoreAll((z) => src[z]); return state(); },
    // `10` §5 "Cancel discards unsaved session changes": back to the last save,
    // or to the source when nothing has been saved yet.
    cancel: () => { restoreAll((z) => saved[z] ?? src[z]); return state(); },
    maskState,
    // Read-only views for drawing. Callers must not write into them.
    workingSlice: (z) => { requireLoaded(z); return working[z]; },
    sourceSlice: (z) => { requireLoaded(z); return src[z]; },
    diffRuns: (z) => { requireLoaded(z); return diffRuns(working[z], src[z], nx, ny); },
    sourceIntact,
    slicesToUpload,
    exportSlice: (z) => { requireLoaded(z); return encodeSlicePayload(z, working[z], nx, ny); },
    prepareSave,
    markUploaded,
    markSaved,
  });
}
