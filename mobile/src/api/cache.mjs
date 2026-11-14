/*
 * Per-slice caches (never a whole volume): API responses, MRI images and decoded masks, each a bounded LRU.
 * A revisited slice is answered from memory with no network request. Artifact URLs are
 * content-addressed, so a cached entry for one URL never goes stale.
 */

import { bytesToBase64 } from '../lib/bytes.mjs';
import { maskRuns, runPixelCount, runsToPath } from '../lib/mask.mjs';

/*
 * Response cache. Only SUCCESS answers of CACHEABLE_ENDPOINTS are kept, keyed by the resolved URL, so RAW
 * and PROCESSED never share an entry (spec 11 §6). Errors are never kept, so a retry reaches the server.
 * An unavailable answer with a reason in NEGATIVE_CACHE_REASONS is kept for unavailableTtlMs, so
 * scrolling back over a slice without metrics does not ask again every time.
 */
export const NEGATIVE_CACHE_REASONS = Object.freeze(['ARTIFACT_NOT_FOUND', 'GROUND_TRUTH_UNAVAILABLE']);

export const CACHEABLE_ENDPOINTS = Object.freeze([
  'mri_slice_get',
  'prediction_slice_get',
  'ground_truth_slice_get',
  'analysis_slice_metrics',
  'reviewed_mask_slice_get',
]);

export function createSliceCache(client, {
  maxEntries = 600, endpoints = CACHEABLE_ENDPOINTS, unavailableTtlMs = 5 * 60 * 1000, now = () => Date.now(),
  negativeReasons = NEGATIVE_CACHE_REASONS,
} = {}) {
  const allowed = new Set(endpoints);
  const negative = new Set(negativeReasons);
  const store = new Map();       // key -> view
  const expires = new Map();     // key -> time an UNAVAILABLE entry stops counting
  const about = new Map();       // key -> { endpointId, params } for clearWhere
  const stats = { hits: 0, misses: 0, evictions: 0 };

  function drop(key) {
    store.delete(key);
    expires.delete(key);
    about.delete(key);
  }

  function keyFor(endpointId, params, options) {
    let url;
    try {
      url = client.resolve(endpointId, params).url;
    } catch (_err) {
      return null; // let the client report the bad request as its own state
    }
    // A named fixture scenario changes the answer; no name and 'default' are the same request.
    const scenario = options && options.scenario && options.scenario !== 'default' ? options.scenario : '';
    return `${endpointId}|${url}|${scenario}`;
  }

  function fresh(key) {
    if (!store.has(key)) return false;
    const until = expires.get(key);
    if (until !== undefined && now() >= until) {
      drop(key);
      return false;
    }
    return true;
  }

  async function call(endpointId, params = {}, options = {}) {
    const cacheable = allowed.has(endpointId) && options.body === undefined && options.noCache !== true;
    const key = cacheable ? keyFor(endpointId, params, options) : null;
    if (key && fresh(key)) {
      const hit = store.get(key);
      store.delete(key);
      store.set(key, hit); // most recently used
      stats.hits += 1;
      return hit;
    }
    const view = await client.call(endpointId, params, options);
    if (key) {
      stats.misses += 1;
      const success = view && view.state === 'SUCCESS';
      const unavailable = view && view.state === 'EMPTY_UNAVAILABLE' && unavailableTtlMs > 0 && negative.has(view.reason);
      if (success || unavailable) {
        store.set(key, view);
        about.set(key, { endpointId, params: { ...params } });
        if (unavailable) expires.set(key, now() + unavailableTtlMs); else expires.delete(key);
        while (store.size > maxEntries) {
          drop(store.keys().next().value);
          stats.evictions += 1;
        }
      }
    }
    return view;
  }

  return Object.freeze({
    ...client,
    call,
    cached: true,
    has: (endpointId, params, options) => {
      const key = keyFor(endpointId, params, options);
      return key !== null && fresh(key);
    },
    // The cached state for this request, read synchronously during a render, or null.
    peek: (endpointId, params, options) => {
      if (!allowed.has(endpointId)) return null;
      const key = keyFor(endpointId, params, options);
      return key !== null && fresh(key) ? store.get(key) : null;
    },
    // Drops everything (a stale run, or a test).
    clear() { store.clear(); expires.clear(); about.clear(); },
    // Drops only the cached unavailable answers; returns how many.
    clearNegative() {
      const keys = [...expires.keys()];
      keys.forEach(drop);
      return keys.length;
    },
    // Drops the entries matching fn(endpointId, params); returns how many. Retry uses it to
    // forget only the slice it retries, so other cached slices still need no request.
    clearWhere(fn) {
      const keys = [...about.entries()].filter(([, a]) => fn(a.endpointId, a.params)).map(([k]) => k);
      keys.forEach(drop);
      return keys.length;
    },
    get size() { return store.size; },
    stats: () => ({ ...stats, size: store.size }),
  });
}

/*
 * MRI slice images, kept as data URIs. The PNG bytes are fetched in JS instead of giving <Image> the URL,
 * so the network log can count each gesture's bytes and a cached revisit costs no request.
 * fetchBytes(contentUrl, { checksum }) is content.bytes through bytesOrThrow in the app.
 */
export function createImageStore({ fetchBytes, maxEntries = 48, mediaType = 'image/png', now = () => Date.now() } = {}) {
  if (typeof fetchBytes !== 'function') throw new Error('createImageStore needs fetchBytes(url)');
  const done = new Map();
  const pending = new Map();
  const stats = { hits: 0, loads: 0, failures: 0 };

  function load(url, { checksum = null } = {}) {
    if (done.has(url)) {
      const v = done.get(url);
      done.delete(url);
      done.set(url, v);
      stats.hits += 1;
      return Promise.resolve(v);
    }
    if (pending.has(url)) return pending.get(url);
    const t0 = now();
    const p = Promise.resolve()
      .then(() => fetchBytes(url, { checksum }))
      .then((bytes) => {
        const value = Object.freeze({
          uri: `data:${mediaType};base64,${bytesToBase64(bytes)}`,
          bytes: bytes.length,
          ms: now() - t0,
        });
        done.set(url, value);
        while (done.size > maxEntries) done.delete(done.keys().next().value);
        stats.loads += 1;
        return value;
      })
      .catch((err) => { stats.failures += 1; throw err; })
      .finally(() => pending.delete(url));
    pending.set(url, p);
    return p;
  }

  return Object.freeze({
    load,
    peek: (url) => done.get(url) || null,
    has: (url) => done.has(url),
    stats: () => ({ ...stats, cached: done.size, inFlight: pending.size }),
    clear() { done.clear(); },
  });
}

/*
 * Masks: fetch, decode and build the vector path once per mask, keyed by content_url and slice size.
 * fetchBytes and decode (decodeMaskPng in the app) are injected, so Node tests need no node_modules.
 * Two components asking for the same mask share one request.
 */

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

  // Resolves to { width, height, mask, runs, path, pixels, ms }. A failure is not cached, so the next call retries.
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
