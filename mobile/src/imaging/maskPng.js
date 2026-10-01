/*
 * THE mask PNG decoder of the app - one adapter over fast-png, shared by V1
 * (SCR-03 overlays, SCR-04 disagreement) and V4 (SCR-06 brush editing).
 * Owned by the shell / V1. Other verticals import it; they do not edit it.
 *
 * Contract v1.0 `binary_delivery`: every mask slice (ground truth, raw and
 * processed prediction, reviewed mask) is served as an 8-bit single-channel
 * PNG at native resolution - height Ny rows, width Nx columns, row = y,
 * column = x, top-left origin (DR-008a) - with values 0 = background and
 * 255 = foreground.
 *
 *   decodeMaskPng(bytes, { width, height })
 *     -> { width, height, data: Uint8Array(width * height) of 0 | 1 }
 *     data[y * width + x] is source pixel (x, y).
 *
 * Strict on purpose. Anything that is not exactly that format - another bit
 * depth, colour, alpha, a palette, a value other than 0 or 255, or a size
 * other than the slice the caller expects - throws MaskPngError with code
 * CONTRACT_DRIFT and the reason. A mask that cannot be read is an
 * unavailable layer, never a guessed one: thresholding a 128 or stretching a
 * 575-pixel row would draw an edit or an error class that is not there.
 */

import { decode } from 'fast-png';

export class MaskPngError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'MaskPngError';
    this.code = 'CONTRACT_DRIFT';
    this.detail = detail;
  }
}

export function decodeMaskPng(bytes, expected) {
  if (!expected || !Number.isInteger(expected.width) || !Number.isInteger(expected.height)
    || expected.width <= 0 || expected.height <= 0) {
    throw new MaskPngError('decodeMaskPng needs the expected slice size { width, height }', { expected });
  }
  let img;
  try {
    img = decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (err) {
    throw new MaskPngError(`mask PNG could not be decoded: ${err && err.message}`, { cause: err && err.message });
  }
  if (img.palette) {
    throw new MaskPngError('mask PNG is palette-indexed; the contract serves 8-bit greyscale', { palette: true });
  }
  if (img.depth !== 8) {
    throw new MaskPngError(`mask PNG bit depth is ${img.depth}; the contract serves 8-bit`, { depth: img.depth });
  }
  if (img.channels !== 1) {
    throw new MaskPngError(`mask PNG has ${img.channels} channels; the contract serves single-channel greyscale`,
      { channels: img.channels });
  }
  if (img.width !== expected.width || img.height !== expected.height) {
    throw new MaskPngError(
      `mask PNG is ${img.width}x${img.height}; the slice is ${expected.width}x${expected.height}`,
      { width: img.width, height: img.height, expected },
    );
  }
  const n = img.width * img.height;
  const src = img.data;
  if (!src || src.length !== n) {
    throw new MaskPngError(`mask PNG carries ${src ? src.length : 0} values for ${n} pixels`, { length: src && src.length });
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = src[i];
    if (v === 255) out[i] = 1;
    else if (v !== 0) {
      throw new MaskPngError(
        `mask PNG has value ${v} at pixel (${i % img.width}, ${Math.floor(i / img.width)}); the contract allows only 0 and 255`,
        { value: v, x: i % img.width, y: Math.floor(i / img.width) },
      );
    }
  }
  return Object.freeze({ width: img.width, height: img.height, data: out });
}
