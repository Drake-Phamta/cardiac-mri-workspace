/*
 * The app's one mask PNG decoder, over fast-png. A mask is an 8-bit single-channel PNG of 0 and 255 at the
 * slice size; it comes back as data[y * width + x] of 0 or 1. Anything else throws MaskPngError (CONTRACT_DRIFT),
 * so an unreadable mask is shown as unavailable, never guessed.
 */

// fast-png builds a latin1 TextDecoder when it loads, which Hermes lacks, so the shim must come first.
import './textDecoderLatin1.mjs';
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
