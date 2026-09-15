/*
 * SPIKE_A — pure viewer math, shared by the app and by harness/test_viewer_math.mjs.
 *
 * THROWAWAY SPIKE CODE. Boundary: spikes/spike_a_2d/**.
 *
 * Nothing here touches React Native, so the same functions the phone runs are
 * checked offline against the fixtures before any device session. A mapping
 * that is only ever exercised on the device is a mapping nobody can re-check.
 *
 * Display transform (README "transform", fixtures/brush_cases.json `transform`):
 *   zoom   screen pixels per source pixel, uniform in x and y
 *   pan    viewport-space position of the image's top-left corner
 *   source_x = floor((u - pan_x) / zoom),  source_y = floor((v - pan_y) / zoom)
 * DR-008a: x = column, y = row, origin top-left. A touch outside the image
 * maps to null and must never paint.
 *
 * Invariant 2 of `07` §8 (Q2): zoom and pan change ONLY the display transform.
 * They take and return transform objects; no function here receives mask data
 * except the checksum, which only reads it.
 */

export function screenToSource(u, v, t, nx, ny) {
  const sx = (u - t.panX) / t.zoom;
  const sy = (v - t.panY) / t.zoom;
  if (!(sx >= 0 && sy >= 0 && sx < nx && sy < ny)) return null;
  return [Math.floor(sx), Math.floor(sy)];
}

export function fitTransform(viewW, viewH, nx, ny) {
  const zoom = Math.min(viewW / nx, viewH / ny);
  return { zoom, panX: (viewW - nx * zoom) / 2, panY: (viewH - ny * zoom) / 2 };
}

export function clampZoom(zoom, fitZoom, minFactor = 0.25, maxFactor = 16) {
  return Math.min(fitZoom * maxFactor, Math.max(fitZoom * minFactor, zoom));
}

/*
 * Zoom about a focal point (the pinch midpoint) so the source pixel under the
 * fingers stays under the fingers:  pan' = focal - (focal - pan) * (zoom'/zoom)
 */
export function zoomAbout(t, newZoom, fx, fy) {
  const k = newZoom / t.zoom;
  return { zoom: newZoom, panX: fx - (fx - t.panX) * k, panY: fy - (fy - t.panY) * k };
}

export function panBy(t, dx, dy) {
  return { zoom: t.zoom, panX: t.panX + dx, panY: t.panY + dy };
}

// --- base64 -> bytes (no dependency on atob being present in the JS engine) ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => {
  const m = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) m[B64.charCodeAt(i)] = i;
  return m;
})();

export function base64ToBytes(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64_INV[clean.charCodeAt(i)];
    const b = B64_INV[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_INV[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? B64_INV[clean.charCodeAt(i + 3)] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

// --- SHA-256 (FIPS 180-4), so the app can compare against slice_sha256 --------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(bytes) {
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
  return hex;
}

/*
 * The fixed zoom/pan sequence for the automated half of A2. Steps are relative to
 * the fit transform so they are meaningful at any screen size. Every kind of
 * change a user can make is present: zoom in and out about different focal
 * points, pans past every edge, a zoom-out below fit, and a return to fit.
 */
export const A2_SEQUENCE = [
  { kind: 'zoom', factor: 2, fx: 0.5, fy: 0.5 },
  { kind: 'zoom', factor: 2, fx: 0.1, fy: 0.1 },
  { kind: 'pan', dx: 0.3, dy: 0 },
  { kind: 'pan', dx: 0, dy: 0.3 },
  { kind: 'pan', dx: -0.9, dy: -0.9 },
  { kind: 'zoom', factor: 4, fx: 0.9, fy: 0.9 },
  { kind: 'pan', dx: 1.5, dy: 0.2 },
  { kind: 'zoom', factor: 0.25, fx: 0.5, fy: 0.5 },
  { kind: 'zoom', factor: 0.1, fx: 0.2, fy: 0.8 },
  { kind: 'pan', dx: 0.4, dy: 0.4 },
  { kind: 'zoom', factor: 8, fx: 0.33, fy: 0.66 },
  { kind: 'pan', dx: -2, dy: 1 },
  { kind: 'fit' },
];

export function applyStep(t, step, viewW, viewH, fit) {
  if (step.kind === 'fit') return { ...fit };
  if (step.kind === 'pan') return panBy(t, step.dx * viewW, step.dy * viewH);
  const z = clampZoom(t.zoom * step.factor, fit.zoom);
  return zoomAbout(t, z, step.fx * viewW, step.fy * viewH);
}
