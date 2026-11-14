/*
 * Fetch -> decode -> vector path, once per mask artifact.
 *
 * Keyed by the content_url and the slice size the mask must have. Contract
 * v1.0: content_url is immutable and content-addressed, so one URL is one set
 * of bytes forever, and a cached decode can never be a stale one. Bounded
 * LRU - DR-015 caches per slice, never the volume.
 *
 * Both effects are injected:
 *   fetchBytes(contentUrl, { checksum }) -> Promise<Uint8Array>
 *        in the app: runtime.content.bytes through bytesOrThrow - the ONE
 *        binary path (timeout, error mapping, checksum check, netLog)
 *   decode(bytes, {width, height}) -> {width, height, data of 0|1}
 *        in the app: decodeMaskPng from maskPng.js - the ONE PNG decoder
 * so this file has no dependency at all and its cache logic is tested in node
 * without node_modules. In-flight loads are shared: two components asking for
 * the same mask cost one request.
 */

import { maskRuns, runPixelCount, runsToPath } from './maskPaths.mjs';

export function createMaskStore({ fetchBytes, decode, maxEntries = 300, now = () => Date.now() } = {}) {
  if (typeof fetchBytes !== 'function') throw new Error('createMaskStore needs fetchBytes(contentUrl)');
  if (typeof decode !== 'function') throw new Error('createMaskStore needs decode(bytes, {width, height})');
  const done = new Map();
  const pending = new Map();
  const stats = { hits: 0, loads: 0, failures: 0 };

  const keyOf = (url, expected) => `${url}|${expected.width}x${expected.height}`;

  function remember(key, value) {
    done.set(key, value);
    while (done.size > maxEntries) done.delete(done.keys().next().value);
  }

  /*
   * Resolves to { width, height, mask, runs, path, pixels, ms } or rejects
   * with the reason the layer is unavailable (a MaskPngError for a mask that
   * is not the contract's format, an Error carrying `view` for a failed
   * fetch). A failure is NOT cached: the next ask retries.
   */
  function load(url, expected, { checksum = null } = {}) {
    if (!expected || !Number.isInteger(expected.width) || !Number.isInteger(expected.height)) {
      return Promise.reject(new Error('maskStore.load needs the expected slice size {width, height}'));
    }
    const key = keyOf(url, expected);
    if (done.has(key)) {
      const v = done.get(key);
      done.delete(key);
      done.set(key, v);
      stats.hits += 1;
      return Promise.resolve(v);
    }
    if (pending.has(key)) return pending.get(key);
    const t0 = now();
    const p = Promise.resolve()
      .then(() => fetchBytes(url, { checksum }))
      .then((bytes) => {
        const mask = decode(bytes, expected);
        const runs = maskRuns(mask);
        const value = Object.freeze({
          width: mask.width,
          height: mask.height,
          mask,
          runs,
          path: runsToPath(runs),
          pixels: runPixelCount(runs),
          ms: now() - t0,
        });
        remember(key, value);
        stats.loads += 1;
        return value;
      })
      .catch((err) => {
        stats.failures += 1;
        throw err;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  }

  return Object.freeze({
    load,
    peek: (url, expected) => (expected ? done.get(keyOf(url, expected)) || null : null),
    stats: () => ({ ...stats, cached: done.size, inFlight: pending.size }),
    clear() { done.clear(); },
  });
}
