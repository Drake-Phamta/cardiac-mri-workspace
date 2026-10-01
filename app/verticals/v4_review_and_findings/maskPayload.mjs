/*
 * The working-mask upload, exactly as contract v1.0 binary_delivery says -
 * framework-neutral, no dependency.
 *
 * working_mask_put.mask_payload is { encoding, data }, nothing else
 * (field_shapes.mask_payload). V4 sends BITPACK_BASE64: "base64 of Ny*Nx
 * bits, row-major, most significant bit first, 1 = foreground". It needs no
 * PNG encoder, so it works on the device today; PNG_BASE64 is the contract's
 * other option and is not produced here.
 *
 * The other direction - a served mask PNG (0/255) decoded to 0/1 - is the
 * app's one shared adapter, mobile/src/imaging/maskPng.js (owned by the shell),
 * not a second decoder here.
 *
 * PROVENANCE - base64ToBytes (with B64 and B64_INV) is a COPY, not an import.
 *   source : spikes/spike_a_2d/app/viewerMath.js
 *   commit : 1b362e8 "SPIKE_A S4: pinch-zoom and pan, with an on-device A2 checksum check"
 *   blob   : e4275a93ad8f1282beed27d7af7767e06af96f44
 *   copied : 2026-10-01 (Day 22), character-for-character; it decoded every
 *            fixture slice Spike A drew on the A17. test_brush.mjs B0 checks it.
 *   bytesToBase64 and the bit packing are V4's own, checked against node's
 *   Buffer (an independent implementation) in test_brush.mjs B10.
 */

import { CoreError } from '../../core/index.mjs';

export const MASK_PAYLOAD_ENCODING = Object.freeze({
  BITPACK_BASE64: 'BITPACK_BASE64',
  PNG_BASE64: 'PNG_BASE64',
});

// --- copied from spikes/spike_a_2d/app/viewerMath.js (see the header) ------

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

// --- V4's own -----------------------------------------------------------------

// Standard base64 with '=' padding (RFC 4648), built in chunks so a 576x576
// slice (41 472 packed bytes) does not grow one string 55 296 times.
export function bytesToBase64(bytes) {
  const parts = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    parts.push(`${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`);
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(`${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`);
  }
  return parts.join('');
}

// 0/1 bytes -> bits, row-major, most significant bit first; a trailing
// partial byte is zero-padded.
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

// The inverse, for a reload check (TC-REV-005). BITPACK_BASE64 only.
export function decodeMaskPayload(payload, nx, ny) {
  if (!payload || payload.encoding !== MASK_PAYLOAD_ENCODING.BITPACK_BASE64 || typeof payload.data !== 'string') {
    throw new CoreError('MASK_PAYLOAD_UNSUPPORTED', { encoding: payload ? payload.encoding : null });
  }
  const packed = base64ToBytes(payload.data);
  const need = Math.ceil((nx * ny) / 8);
  if (packed.length !== need) throw new CoreError('MASK_SHAPE_MISMATCH', { expected: need, got: packed.length });
  return unpackBits(packed, nx * ny);
}
