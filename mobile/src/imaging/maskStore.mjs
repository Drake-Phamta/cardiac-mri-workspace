/*
 * Fetch -> decode -> vector path, once per mask artifact.
 *
 * Keyed by the resolved content URL and the slice size it must have.
 * Contract v1.0: content_url is immutable and content-addressed, so one URL
 * is one set of bytes forever, and a cached decode can never be a stale one.
 * Bounded LRU - DR-015 caches per slice, never the volume.
 *
 * Both effects are injected:
 *   fetchBytes(url)            -> Promise<Uint8Array>   (fetchBytesWith(fetch) on the phone)
 *   decode(bytes, {width, height}) -> {width, height, data of 0|1}
 *                                 (decodeMaskPng from maskPng.js - the app's ONE
 *                                 PNG decoder, over fast-png)
 * so this file has no dependency at all and its cache logic is tested in
 * node without node_modules. In-flight loads are shared: two components
 * asking for the same mask cost one request.
 */

import { maskRuns, runPixelCount, runsToPath } from './maskPaths.mjs';

export function createMaskStore({ fetchBytes, decode, maxEntries = 300, now = () => Date.now() } = {}) {
  if (typeof fetchBytes !== 'function') throw new Error('createMaskStore needs fetchBytes(url)');
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
   * is not the contract's format). A failure is NOT cached: the next ask
   * retries.
   */
  function load(url, expected) {
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
      .then(() => fetchBytes(url))
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

// The React Native byte fetcher: one GET, bytes out, a non-2xx is an error,
// and a request that hangs is abandoned after timeoutMs (the layer then says
// unavailable instead of "loading" forever).
export function fetchBytesWith(fetchImpl, { timeoutMs = 15000, AbortControllerImpl = globalThis.AbortController } = {}) {
  return async (url) => {
    let timer = null;
    const init = { method: 'GET' };
    if (AbortControllerImpl && timeoutMs > 0) {
      const controller = new AbortControllerImpl();
      init.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    try {
      const res = await fetchImpl(url, init);
      if (!res || res.status < 200 || res.status >= 300) {
        throw new Error(`mask ${url} answered HTTP ${res ? res.status : 'nothing'}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
