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

import { CoreError } from '../../api/index.mjs';
import { base64ToBytes, bytesToBase64 } from '../../lib/bytes.mjs';

export const MASK_PAYLOAD_ENCODING = Object.freeze({
  BITPACK_BASE64: 'BITPACK_BASE64',
  PNG_BASE64: 'PNG_BASE64',
});

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
