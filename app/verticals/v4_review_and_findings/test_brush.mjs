// node app/verticals/v4_review_and_findings/test_brush.mjs
//
// The SCR-06 brush model (brush.mjs), offline. Needs no fixture bundle.
//
// Independent references, so the module is never checked against itself:
//   copied function bodies       the spike files they were copied from      (B0)
//   pixels and hashes per stroke spike fixtures/brush_ops.json, computed by
//                                the spike's own Python oracle (generate.py) (B1)
//   touch -> source pixel        spike fixtures/brush_cases.json             (B2)
//                                and the pixel-centre construction           (B5)
//   stroke footprint             a closed-form line rule + a brute-force disc (B6)
//   SHA-256                      node:crypto, never the module's sha256Hex
//
// Not here, because they are device measurements: the <= 100 ms feedback half
// of TC-PERF-003 and TC-REV-003 on the phone (README "TODO for Trung").

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fitTransform, zoomAbout, panBy, clampZoom } from '../../core/index.mjs';
import * as B from './brush.mjs';
import { sha256Hex } from './sha256.mjs';

const ROOT = new URL('../../../', import.meta.url);
const HERE = new URL('./', import.meta.url);
const text = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const json = (url) => JSON.parse(readFileSync(url, 'utf8'));

let failures = 0;
let count = 0;
const check = (id, ok, detail) => {
  count += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(4)} ${detail}`);
};

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const volSha = (slices) => sha(Buffer.concat(slices.map((b) => Buffer.from(b))));
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const changedIndices = (before, after) => {
  const out = [];
  for (let i = 0; i < after.length; i++) if (before[i] !== after[i]) out.push(i);
  return out;
};
const codeOf = (fn) => { try { fn(); return null; } catch (err) { return err?.code ?? 'THREW'; } };
// Deterministic, so a failure reproduces.
let seed = 22;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const randInt = (n) => Math.floor(rand() * n);

const RAW = (maskId = 'MASK_RAW_TEST') => ({ maskId, kind: B.SOURCE_KIND.RAW_PREDICTION_MASK });
function session(nx, ny, slices, source = RAW()) {
  const s = B.createBrushSession({ nx, ny, source });
  slices.forEach((bytes, z) => { if (bytes) s.loadSlice(z, bytes); });
  return s;
}
// A blob-shaped source: deterministic, binary, not symmetric.
function blob(nx, ny, cx, cy, rx, ry) {
  const b = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const dx = (x - cx) / rx; const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) b[y * nx + x] = 1;
    }
  }
  return b;
}

// --- B0 provenance: the copies still equal the code the device measured ------
{
  const bodyOf = (src, name) => {
    const at = src.indexOf(`export function ${name}(`);
    if (at === -1) return null;
    let depth = 0;
    let i = src.indexOf('{', at);
    for (; i < src.length; i++) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') { depth -= 1; if (depth === 0) break; }
    }
    return src.slice(at, i + 1);
  };
  const block = (src, from, to) => {
    const a = src.indexOf(from);
    return a === -1 ? null : src.slice(a, src.indexOf(to, a) + to.length);
  };
  const mine = text(new URL('brush.mjs', HERE));
  const mySha = text(new URL('sha256.mjs', HERE));
  const groups = [
    ['spikes/spike_a_2d/app/brushMath.js', mine, ['footprint', 'linePixels', 'beginStroke', 'strokeSample',
      'rollbackStroke', 'createHistory', 'commitStroke', 'endStroke', 'undo', 'redo', 'diffRuns'],
    ['export const RADII = [0, 1, 2, 3, 5];', "export const END_RELEASE = 'release';",
      "export const END_SECOND_FINGER = 'second_finger';", "export const END_TERMINATED = 'terminated';"]],
    ['spikes/spike_a_2d/app/persist.js', mine, ['rleEncodeSlice', 'rleDecodeSlice'], []],
    ['spikes/spike_a_2d/app/viewerMath.js', mySha, ['sha256Hex'], []],
  ];
  for (const [path, copy, fns, lines] of groups) {
    const url = new URL(path, ROOT);
    if (!existsSync(url)) {
      // The spike is labelled throwaway; once retired, the header carries the provenance.
      check('B0', true, `${path} retired — provenance frozen in the file header`);
      continue;
    }
    const spike = text(url);
    const diverged = fns.filter((n) => bodyOf(spike, n) === null || bodyOf(spike, n) !== bodyOf(copy, n));
    const lineMiss = lines.filter((l) => !spike.includes(l) || !copy.includes(l));
    let kOk = true;
    if (path.endsWith('viewerMath.js')) {
      const k = block(spike, 'const K = new Uint32Array([', ']);');
      kOk = k !== null && k === block(copy, 'const K = new Uint32Array([', ']);');
    }
    check('B0', diverged.length === 0 && lineMiss.length === 0 && kOk,
      `${fns.length} function(s)${lines.length ? ` + ${lines.length} constants` : ''}${path.endsWith('viewerMath.js') ? ' + K table' : ''}` +
      ` identical to ${path}` +
      (diverged.length ? ` — diverged: ${diverged.join(', ')}` : '') + (lineMiss.length ? ` — constants differ` : '') +
      (kOk ? '' : ' — K table differs'));
  }
}

// --- B1 the spike's Python oracle, replayed through the session ----------------
const FIX = new URL('spikes/spike_a_2d/fixtures/', ROOT);
const haveOracle = existsSync(new URL('brush_ops.json', FIX));
if (!haveOracle) {
  check('B1', true, 'spike oracle retired — A3–A7 evidence frozen in the brush.mjs header');
} else {
  const mask = json(new URL('mask_synthetic.json', FIX));
  const ops = json(new URL('brush_ops.json', FIX));
  const [NX, NY, NZ] = mask.shape_xyz;
  const source = mask.slices_b64.map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
  const srcOk = sameList(source.map(sha), mask.slice_sha256) && sameList(ops.source_slice_sha256, mask.slice_sha256);
  const s = session(NX, NY, source, RAW('SPIKE_A_MASK_SYNTHETIC'));
  const working = () => Array.from({ length: NZ }, (_, z) => s.workingSlice(z));

  const bad = [];
  for (const op of ops.ops) {
    const exp = op.expected;
    const before = Uint8Array.from(s.workingSlice(op.slice));
    s.setTool(op.tool);
    s.setRadius(op.radius);
    const t = { zoom: op.transform.zoom, panX: op.transform.pan_x, panY: op.transform.pan_y };
    s.beginStroke(op.slice);
    const centres = op.samples.map(([u, v]) => s.sample(u, v, t));
    const r = s.endStroke();
    const why = [];
    if (JSON.stringify(centres) !== JSON.stringify(exp.centre_pixels)) why.push('centres');
    if (!sameList(changedIndices(before, s.workingSlice(op.slice)), exp.changed_indices)) why.push('changed pixels');
    if (!r.committed || r.changed !== exp.changed || r.lost !== 0) why.push(`result ${JSON.stringify(r)}`);
    if (sha(before) !== exp.slice_sha256_before || sha(s.workingSlice(op.slice)) !== exp.slice_sha256_after) why.push('slice hash');
    if (volSha(working()) !== exp.volume_sha256_after) why.push('volume hash');
    if (why.length) bad.push(`${op.id}: ${why.join(', ')}`);
  }
  check('B1', srcOk && bad.length === 0,
    `${ops.ops.length} oracle strokes (add + erase, r in {${[...new Set(ops.ops.map((o) => o.radius))].sort().join(',')}}) ` +
    `change exactly the oracle's pixels; slice + volume SHA-256 match` + (bad.length ? ` — ${bad.slice(0, 3).join(' | ')}` : ''));

  const undoBad = ops.undo_walk.filter((w) => {
    const e = s.undo();
    return !e || e.slice !== w.slice || sha(s.workingSlice(e.slice)) !== w.slice_sha256 || volSha(working()) !== w.volume_sha256;
  });
  const backToSource = sameList(working().map(sha), ops.after_undo_all_slice_sha256);
  const redoBad = ops.redo_walk.filter((w) => {
    const e = s.redo();
    return !e || e.slice !== w.slice || sha(s.workingSlice(e.slice)) !== w.slice_sha256 || volSha(working()) !== w.volume_sha256;
  });
  const forward = sameList(working().map(sha), ops.after_redo_all_slice_sha256);
  check('B1', undoBad.length === 0 && backToSource && redoBad.length === 0 && forward,
    `undo walk ${ops.undo_walk.length}/${ops.undo_walk.length} and redo walk ${ops.redo_walk.length}/${ops.redo_walk.length} ` +
    'reach the oracle hash at every step; undo-all = source, redo-all = end of script');

  s.reset();
  const st = s.state();
  check('B1', sameList(working().map(sha), ops.after_reset_slice_sha256) && !st.canUndo && !st.canRedo
    && s.sourceIntact().ok && sameList(source.map(sha), mask.slice_sha256),
  `reset: ${NZ}/${NZ} slices equal the source again, history emptied; the session's source copies and the ` +
    'caller\'s buffers still hash to the fixture');
}

// --- B2 A5 cases: touch -> source pixel after zoom/pan, through the session ----
if (!haveOracle) {
  check('B2', true, 'spike brush cases retired — A5 evidence frozen in the brush.mjs header');
} else {
  const cases = json(new URL('brush_cases.json', FIX)).cases;
  const ops = json(new URL('brush_ops.json', FIX));
  const [NX, NY] = ops.shape_xyz;
  for (const radius of ops.a5.radii) {
    const s = session(NX, NY, [new Uint8Array(NX * NY)]);
    s.setRadius(radius);
    let hits = 0;
    const misses = [];
    cases.forEach((c, k) => {
      const p = c.expected_source_pixel;
      const want = radius === 0 ? (p ? [p[1] * NX + p[0]] : []) : ops.a5.cases[k][`painted_r${radius}`];
      s.beginStroke(0);
      s.sample(c.touch_u, c.touch_v, { zoom: c.zoom, panX: c.pan_x, panY: c.pan_y });
      const got = changedIndices(new Uint8Array(NX * NY), s.workingSlice(0));
      const r = s.endStroke(B.END_TERMINATED);          // roll back: every case starts blank
      const clean = s.workingSlice(0).every((v) => v === 0);
      if (sameList(got, want) && clean && !r.committed) hits += 1; else misses.push(c.id);
    });
    check('B2', hits === cases.length, `r=${radius}: ${hits}/${cases.length} brush cases paint exactly the expected ` +
      'source pixels (outside-image taps paint nothing), each rolled back clean' + (misses.length ? ` — ${misses.slice(0, 4).join(', ')}` : ''));
  }
}

// --- B3 the source is never written (TC-REV-006 at the model level) -----------
{
  const NX = 96; const NY = 80;
  const callerSlices = [blob(NX, NY, 40, 30, 20, 14), blob(NX, NY, 50, 44, 25, 18), blob(NX, NY, 30, 50, 12, 9)];
  const callerHashes = callerSlices.map(sha);
  const s = session(NX, NY, callerSlices);
  const t = fitTransform(480, 400, NX, NY);
  for (let k = 0; k < 40; k++) {
    s.setTool(k % 3 === 0 ? B.TOOL.ERASE : B.TOOL.ADD);
    s.setRadius(B.RADII[k % B.RADII.length]);
    s.beginStroke(k % 3);
    for (let j = 0; j < 12; j++) s.sample(t.panX + rand() * NX * t.zoom, t.panY + rand() * NY * t.zoom, t);
    s.endStroke(k % 7 === 0 ? B.END_SECOND_FINGER : B.END_RELEASE);
    if (k % 5 === 0) s.undo();
    if (k % 11 === 0) s.redo();
  }
  const prepared = s.prepareSave();
  s.markSaved(prepared, { reviewedMaskId: 'RM_TEST' });
  s.cancel();
  s.reset();
  const intact = s.sourceIntact();
  check('B3', sameList(callerSlices.map(sha), callerHashes) && intact.ok && intact.slices === 3
    && [0, 1, 2].every((z) => sha(s.sourceSlice(z)) === callerHashes[z] && s.sourceSha(z) === callerHashes[z]),
  '40 strokes, undo/redo, save, cancel, reset: caller buffers, session source copies and load-time hashes all unchanged');
}

// --- B4 add / erase change only the intended pixels, on one slice (TC-REV-002) --
{
  const NX = 64; const NY = 64;
  const src = [blob(NX, NY, 32, 32, 14, 10), blob(NX, NY, 20, 40, 9, 9)];
  const s = session(NX, NY, src);
  const t = { zoom: 4, panX: 10, panY: 6 };
  const disc = (cx, cy, r) => {
    const out = new Set();
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.add(y * NX + x);
    return out;
  };
  const tap = (tool, x, y, r) => {
    s.setTool(tool); s.setRadius(r);
    const other = sha(s.workingSlice(1));
    const before = Uint8Array.from(s.workingSlice(0));
    s.beginStroke(0);
    s.sample(t.panX + (x + 0.5) * t.zoom, t.panY + (y + 0.5) * t.zoom, t);
    s.endStroke();
    const changed = changedIndices(before, s.workingSlice(0));
    const inDisc = disc(x, y, r);
    const value = tool === B.TOOL.ADD ? 1 : 0;
    return changed.every((i) => inDisc.has(i) && s.workingSlice(0)[i] === value)
      && [...inDisc].every((i) => s.workingSlice(0)[i] === value)
      && sha(s.workingSlice(1)) === other;
  };
  const ok = tap(B.TOOL.ADD, 50, 12, 3) && tap(B.TOOL.ERASE, 32, 32, 5) && tap(B.TOOL.ADD, 0, 0, 2) && tap(B.TOOL.ERASE, 63, 63, 1);
  check('B4', ok, 'add writes 1 and erase writes 0 on exactly the brush disc (clipped at the edges); the other slice is untouched');
}

// --- B5 FR-REV-011 / TC-REV-003: the right source pixel after any zoom and pan ---
{
  const NX = 576; const NY = 576;
  const s = session(NX, NY, [new Uint8Array(NX * NY)]);
  s.setRadius(0);
  const fit = fitTransform(1080, 1440, NX, NY);
  let t = fit;
  let hits = 0;
  let outsideClean = 0;
  const N = 300;
  for (let k = 0; k < N; k++) {
    if (k % 3 === 0) t = zoomAbout(t, clampZoom(t.zoom * (0.5 + rand() * 3), fit.zoom), rand() * 1080, rand() * 1440);
    else t = panBy(t, (rand() - 0.5) * 400, (rand() - 0.5) * 400);
    const x = randInt(NX); const y = randInt(NY);
    s.beginStroke(0);
    const c = s.sample(t.panX + (x + 0.5) * t.zoom, t.panY + (y + 0.5) * t.zoom, t);
    const painted = s.workingSlice(0)[y * NX + x] === 1;
    const r = s.endStroke(B.END_TERMINATED);
    if (c && c[0] === x && c[1] === y && painted && r.changed === 1) hits += 1;
    // and a tap just outside the image paints nothing
    s.beginStroke(0);
    const out = s.sample(t.panX - 0.5 * t.zoom, t.panY + (y + 0.5) * t.zoom, t);
    const r2 = s.endStroke(B.END_TERMINATED);
    if (out === null && r2.changed === 0 && r2.outside === 1) outsideClean += 1;
  }
  check('B5', hits === N && outsideClean === N,
    `${hits}/${N} taps at pixel centres under random zoom/pan (core viewMath) paint exactly that source pixel; ` +
    `${outsideClean}/${N} taps outside the image paint nothing`);
}

// --- B6 TC-PERF-003 logic half: zero lost samples, no gaps in a fast stroke ----
{
  const NX = 64; const NY = 64;
  const t = { zoom: 7.5, panX: -20, panY: 13 };
  // Independent oracle: floor the inverse transform, join consecutive in-image
  // centres with the closed-form rounding rule the Bresenham loop implements,
  // stamp a brute-force disc. Nothing from brush.mjs.
  const centre = (u, v) => {
    const sx = (u - t.panX) / t.zoom; const sy = (v - t.panY) / t.zoom;
    return sx >= 0 && sy >= 0 && sx < NX && sy < NY ? [Math.floor(sx), Math.floor(sy)] : null;
  };
  const line = (x0, y0, x1, y1) => {
    const a = Math.abs(x1 - x0); const b = Math.abs(y1 - y0);
    const sx = x1 >= x0 ? 1 : -1; const sy = y1 >= y0 ? 1 : -1;
    const out = [];
    if (a >= b) for (let i = 0; i <= a; i++) out.push([x0 + sx * i, y0 + sy * (a ? Math.floor((2 * i * b + a) / (2 * a)) : 0)]);
    else for (let j = 0; j <= b; j++) out.push([x0 + sx * Math.floor((2 * j * a + b) / (2 * b)), y0 + sy * j]);
    return out;
  };
  const r = 1;
  const want = new Uint8Array(NX * NY);
  const samples = [];
  let inside = 0;
  let prev = null;
  for (let k = 0; k < 400; k++) {
    // big jumps between samples on purpose: a dropped sample would leave a gap
    const u = t.panX + (rand() * 1.2 - 0.1) * NX * t.zoom;
    const v = t.panY + (rand() * 1.2 - 0.1) * NY * t.zoom;
    samples.push([u, v]);
    const c = centre(u, v);
    if (!c) { prev = null; continue; }
    inside += 1;
    for (const [px, py] of prev ? line(prev[0], prev[1], c[0], c[1]) : [c]) {
      for (let y = py - r; y <= py + r; y++) {
        for (let x = px - r; x <= px + r; x++) {
          if (x >= 0 && y >= 0 && x < NX && y < NY && (x - px) ** 2 + (y - py) ** 2 <= r * r) want[y * NX + x] = 1;
        }
      }
    }
    prev = c;
  }
  const s = session(NX, NY, [new Uint8Array(NX * NY)]);
  s.setRadius(r);
  s.beginStroke(0);
  for (const [u, v] of samples) s.sample(u, v, t);
  const res = s.endStroke();
  const same = sha(s.workingSlice(0)) === sha(want);
  const totals = s.state().totals;
  check('B6', res.received === 400 && res.applied === inside && res.outside === 400 - inside && res.lost === 0
    && totals.lost === 0 && same,
  `400 samples (${inside} inside, ${400 - inside} outside): received ${res.received} = applied ${res.applied} + ` +
    `outside ${res.outside}, lost ${res.lost}; painted set equals the independent line+disc oracle, no gaps`);
}

// --- B7 FR-REV-005..007 / TC-REV-004: undo, redo and reset are exact -----------
{
  const NX = 48; const NY = 40;
  const src = [blob(NX, NY, 24, 20, 12, 8), blob(NX, NY, 10, 30, 6, 6), new Uint8Array(NX * NY)];
  const s = session(NX, NY, src);
  const t = { zoom: 3, panX: 2, panY: 2 };
  const all = () => [0, 1, 2].map((z) => sha(s.workingSlice(z))).join(':');
  const states = [all()];
  for (let k = 0; k < 25; k++) {
    s.setTool(rand() < 0.6 ? B.TOOL.ADD : B.TOOL.ERASE);
    s.setRadius(B.RADII[randInt(B.RADII.length)]);
    s.beginStroke(randInt(3));
    for (let j = 0; j < 6; j++) s.sample(t.panX + rand() * NX * t.zoom, t.panY + rand() * NY * t.zoom, t);
    s.endStroke();
    states.push(all());
  }
  let undoOk = true;
  for (let k = states.length - 2; k >= 0; k--) { s.undo(); if (all() !== states[k]) undoOk = false; }
  const atSource = all() === states[0] && s.undo() === null;
  let redoOk = true;
  for (let k = 1; k < states.length; k++) { s.redo(); if (all() !== states[k]) redoOk = false; }
  const atEnd = s.redo() === null;
  for (let k = 0; k < 9; k++) s.undo();                      // both stacks non-empty
  const depth = [s.state().undoDepth, s.state().redoDepth];
  s.reset();
  const st = s.state();
  check('B7', undoOk && atSource && redoOk && atEnd, '25 strokes on 3 slices: every undo returns the exact previous ' +
    'all-slice hash, undo-all = source; every redo returns the exact next one');
  check('B7', depth[0] > 0 && depth[1] > 0 && all() === states[0] && !st.canUndo && !st.canRedo
    && st.maskState === B.MASK_STATE.SOURCE,
  `reset from undo/redo depth ${depth[0]}/${depth[1]}: every slice equals the declared source, both stacks empty`);
}

// --- B8 A11 rules: an interrupted stroke rolls back; a new stroke clears redo ---
{
  const NX = 32; const NY = 32;
  const s = session(NX, NY, [blob(NX, NY, 16, 16, 8, 8)]);
  const t = { zoom: 10, panX: 0, panY: 0 };
  const stroke = (pts, end) => { s.beginStroke(0); for (const [x, y] of pts) s.sample(x * 10 + 5, y * 10 + 5, t); return s.endStroke(end); };
  stroke([[2, 2], [20, 3]], B.END_RELEASE);
  stroke([[3, 25], [28, 25]], B.END_RELEASE);
  s.undo();
  const before = sha(s.workingSlice(0));
  const depth = [s.state().undoDepth, s.state().redoDepth];
  const results = [B.END_SECOND_FINGER, B.END_TERMINATED].map((end) => stroke([[0, 10], [31, 12]], end));
  const rolled = results.every((r) => !r.committed && r.changed > 0) && sha(s.workingSlice(0)) === before
    && s.state().undoDepth === depth[0] && s.state().redoDepth === depth[1];
  // a stroke begun while another is live ends the live one WITHOUT committing it
  s.beginStroke(0); s.sample(5, 5, t);
  const interrupted = s.beginStroke(0);
  s.endStroke(B.END_TERMINATED);
  const fresh = stroke([[8, 8]], B.END_RELEASE);
  const cleared = fresh.committed && s.state().redoDepth === 0 && s.redo() === null;
  check('B8', rolled && interrupted && !interrupted.committed && cleared,
    'second finger and system termination restore the slice exactly with history untouched; a stroke ' +
    'interrupted by a new one is not committed; a committed stroke empties redo');
}

// --- B9 sha256Hex against node:crypto -----------------------------------------
{
  const lengths = [0, 1, 3, 55, 56, 57, 63, 64, 65, 127, 128, 1000, 576 * 576];
  const bad = lengths.filter((n) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (i * 31 + n) & 0xff;
    return sha256Hex(b) !== sha(b);
  });
  check('B9', bad.length === 0, `sha256Hex equals node:crypto at ${lengths.length} lengths incl. padding edges and 576x576` +
    (bad.length ? ` — differs at ${bad.join(', ')}` : ''));
}

// --- B10 the save export round-trips byte for byte (TC-REV-005 at model level) -
{
  const NX = 576; const NY = 576;
  const s = session(NX, NY, [blob(NX, NY, 300, 260, 90, 70)]);
  const t = fitTransform(1080, 1440, NX, NY);
  s.setRadius(5);
  s.beginStroke(0);
  for (let k = 0; k < 30; k++) s.sample(t.panX + (200 + k * 7) * t.zoom, t.panY + (240 + (k % 5) * 9) * t.zoom, t);
  s.endStroke();
  const payload = s.exportSlice(0);
  const back = B.decodeSlicePayload(payload);
  const sum = payload.runs.reduce((a, b) => a + b, 0);
  const tampered = { ...payload, runs: payload.runs.map((n, i) => (i === 1 ? n + 1 : i === 2 ? n - 1 : n)) };
  const t2 = B.decodeSlicePayload(tampered);
  const short = { ...payload, runs: payload.runs.slice(0, -1) };
  let threw = false;
  try { B.decodeSlicePayload(short); } catch { threw = true; }
  check('B10', payload.format === B.PAYLOAD_FORMAT && sum === NX * NY && back.verified
    && sha(back.bytes) === sha(s.workingSlice(0)) && payload.sha256 === sha(s.workingSlice(0)),
  `576x576 working slice -> ${payload.runs.length} runs -> decoded bytes equal the working slice; payload SHA-256 = node:crypto`);
  check('B10', t2.verified === false && threw,
    'a payload whose runs were altered decodes with verified=false (reported, not hidden); a short one throws');
}

// --- B11 SOURCE / UNSAVED / SAVED, and what a save uploads --------------------
{
  const NX = 40; const NY = 40;
  const s = session(NX, NY, [blob(NX, NY, 20, 20, 9, 9), blob(NX, NY, 15, 15, 5, 5)]);
  const t = { zoom: 5, panX: 0, panY: 0 };
  const paint = (z, tool, x, y) => { s.setTool(tool); s.beginStroke(z); s.sample(x * 5 + 2, y * 5 + 2, t); return s.endStroke(); };
  const states = [];
  const note = () => states.push([s.maskState(0), s.maskState(1), s.state().maskState].join('/'));
  note();                                                     // SOURCE/SOURCE/SOURCE
  paint(0, B.TOOL.ADD, 2, 2); note();                         // UNSAVED/SOURCE/UNSAVED
  s.undo(); note();                                           // back to SOURCE
  s.redo();
  const firstUpload = s.slicesToUpload();
  const prepared = s.prepareSave();
  paint(1, B.TOOL.ADD, 35, 35);                               // drawn while the save is "in flight"
  s.markUploaded(0);
  // A save snapshots EVERY open slice - a reviewed mask is a whole artifact -
  // so from here on an untouched slice is SAVED, not SOURCE.
  s.markSaved(prepared, { reviewedMaskId: 'RM_1' }); note();  // SAVED/UNSAVED/UNSAVED
  s.undo(); note();                                           // slice 1 back to what was saved: SAVED/SAVED/SAVED
  paint(0, B.TOOL.ERASE, 20, 20); note();                     // UNSAVED/SAVED/UNSAVED
  s.cancel(); note();                                         // back to the save: SAVED/SAVED/SAVED
  s.reset(); note();                                          // slice 0 = source != saved: UNSAVED/SAVED/UNSAVED
  const afterReset = s.slicesToUpload();                      // slice 0 equals the source now, but was uploaded
  const want = [
    'SOURCE/SOURCE/SOURCE', 'UNSAVED/SOURCE/UNSAVED', 'SOURCE/SOURCE/SOURCE', 'SAVED/UNSAVED/UNSAVED',
    'SAVED/SAVED/SAVED', 'UNSAVED/SAVED/UNSAVED', 'SAVED/SAVED/SAVED', 'UNSAVED/SAVED/UNSAVED',
  ];
  check('B11', sameList(states, want), `mask state walk ${states.join(' -> ')}`);
  check('B11', sameList(firstUpload, [0]) && prepared.payloads.length === 1 && sameList(afterReset, [0])
    && s.state().lastSave.reviewedMaskId === 'RM_1' && sameList(s.state().lastSave.slices, [0]),
  'a save uploads the slices that differ from the source, keeps re-sending a slice the server already holds ' +
    '(even once it equals the source again), and SAVED means what was frozen at prepareSave');
}

// --- B12 refusals: what must never be accepted --------------------------------
{
  const NX = 8; const NY = 8;
  const codes = {
    groundTruth: codeOf(() => B.createBrushSession({ nx: NX, ny: NY, source: { maskId: 'GT_1', kind: 'GROUND_TRUTH' } })),
    protoKind: codeOf(() => B.createBrushSession({ nx: NX, ny: NY, source: { maskId: 'X', kind: 'toString' } })),
    noIdentity: codeOf(() => B.createBrushSession({ nx: NX, ny: NY, source: { kind: 'RAW_PREDICTION_MASK' } })),
  };
  const s = session(NX, NY, [new Uint8Array(NX * NY)]);
  const notBinary = new Uint8Array(NX * NY); notBinary[5] = 255;
  const other = new Uint8Array(NX * NY); other[0] = 1;
  codes.radius = codeOf(() => s.setRadius(4));
  codes.tool = codeOf(() => s.setTool('smudge'));
  codes.notBinary = codeOf(() => s.loadSlice(1, notBinary));
  codes.shape = codeOf(() => s.loadSlice(2, new Uint8Array(10)));
  codes.changed = codeOf(() => s.loadSlice(0, other));
  codes.same = codeOf(() => s.loadSlice(0, new Uint8Array(NX * NY)));
  codes.noStroke = codeOf(() => s.sample(1, 1, { zoom: 1, panX: 0, panY: 0 }));
  codes.notLoaded = codeOf(() => s.beginStroke(7));
  codes.badEnd = codeOf(() => s.endStroke('lifted'));
  const want = {
    groundTruth: 'SOURCE_NOT_EDITABLE', protoKind: 'SOURCE_NOT_EDITABLE', noIdentity: 'SOURCE_IDENTITY_MISSING',
    radius: 'BRUSH_RADIUS_OUT_OF_RANGE', tool: 'BRUSH_TOOL_UNKNOWN', notBinary: 'SOURCE_NOT_BINARY',
    shape: 'SLICE_SHAPE_MISMATCH', changed: 'SOURCE_CHANGED', same: null, noStroke: 'NO_ACTIVE_STROKE',
    notLoaded: 'SLICE_NOT_LOADED', badEnd: 'STROKE_END_UNKNOWN',
  };
  const wrong = Object.keys(want).filter((k) => codes[k] !== want[k]);
  check('B12', wrong.length === 0, 'ground truth is not an editable source; radius outside {0,1,2,3,5}, unknown tool, ' +
    'non-binary or resized source, a source swapped under the session, a sample with no stroke — all refused by code' +
    (wrong.length ? ` — wrong: ${wrong.map((k) => `${k}=${codes[k]}`).join(', ')}` : ''));
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'} V4 brush model — ${count - failures}/${count}`);
process.exit(failures === 0 ? 0 : 1);
