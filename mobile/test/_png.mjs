// Test-only PNG encoder: every PNG a test decodes is built here from pixel
// arrays the test holds, with node:zlib - never a stored binary fixture. It
// is the independent cross-check of the app's decoder (maskPng.js over
// fast-png): two encoders and one decoder agreeing on known pixels.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/*
 * pixels: one value per sample, row-major (width * height * channels values;
 * for colour type 3 the values are palette indices). bitDepth 8 or 16.
 * filterFor(y) picks each row's PNG filter (0 None, 1 Sub, 2 Up, 3 Average,
 * 4 Paeth); zopts goes to zlib.deflateSync (level 0 = stored blocks,
 * strategy Z_FIXED = fixed Huffman, default/level 9 = dynamic).
 */
export function encodePng(width, height, colorType, pixels, {
  filterFor = () => 0, zopts = {}, bitDepth = 8, palette = null,
} = {}) {
  const channels = CHANNELS[colorType];
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  // Serialise samples to bytes first (big-endian for 16-bit).
  const sampleBytes = Buffer.alloc(height * stride);
  for (let i = 0; i < width * height * channels; i += 1) {
    if (bytesPerSample === 2) sampleBytes.writeUInt16BE(pixels[i], i * 2);
    else sampleBytes[i] = pixels[i];
  }
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const ft = filterFor(y);
    raw[y * (stride + 1)] = ft;
    for (let i = 0; i < stride; i += 1) {
      const r = sampleBytes[y * stride + i];
      const a = i >= bpp ? sampleBytes[y * stride + i - bpp] : 0;
      const b = y > 0 ? sampleBytes[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? sampleBytes[(y - 1) * stride + i - bpp] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][ft];
      raw[y * (stride + 1) + 1 + i] = (r - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const z = zlib.deflateSync(raw, zopts);
  const half = Math.floor(z.length / 2);
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (colorType === 3) parts.push(chunk('PLTE', Buffer.from(palette || [0, 0, 0, 255, 255, 255])));
  // Split IDAT in two, as real encoders may.
  parts.push(chunk('IDAT', z.subarray(0, half)), chunk('IDAT', z.subarray(half)), chunk('IEND', Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}

// A deterministic LA-like blob: an ellipse of `value` on 0.
export function ellipseMask(width, height, cx, cy, rx, ry, value = 255) {
  const d = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) d[y * width + x] = value;
    }
  }
  return d;
}

// Try to import the app's decoder adapter. CI runs without node_modules, so
// fast-png may be absent: the caller skips with this reason instead of failing.
export async function importMaskPngOrSkip(t) {
  try {
    return await import('../src/imaging/maskPng.js');
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('fast-png is not installed here (CI runs without npm install) - run `npm ci` in mobile/ to check this');
      return null;
    }
    throw err;
  }
}
