/*
 * Per-slice response cache in front of the app/core client (PR-CACHE-01,
 * DR-015: caching is PER SLICE; whole-volume caching is out).
 *
 * NFR-PERF-001 bounds switching among ALREADY CACHED slices at p95 <= 200 ms.
 * Without a cache every switch back to a slice the user has seen costs the
 * same three or four round trips over the overlay as the first visit. With
 * it, a revisit is answered from memory and only the image decode remains -
 * and React Native's image pipeline already caches the MRI bytes by URL.
 *
 * What may be cached, and why it is safe:
 *   - only the slice-level GET endpoints below, and only SUCCESS states;
 *   - their artifacts are immutable (contract artifact_rules) and their
 *     content_url is content-addressed, so a response for one exact URL
 *     never changes underneath the cache;
 *   - the key is the RESOLVED URL, which carries the case or run, the slice
 *     index and the prediction variant - RAW and PROCESSED can never share an
 *     entry (`11` §6: no silent variant substitution, and a cache that mixed
 *     them would be one with a longer lifetime);
 *   - errors are never cached (a retry must reach the server);
 *   - a LEGITIMATELY UNAVAILABLE answer is cached for `unavailableTtlMs`
 *     (default 5 min) - only EMPTY_UNAVAILABLE with a reason in
 *     NEGATIVE_CACHE_REASONS (ARTIFACT_NOT_FOUND: metrics not ingested yet;
 *     GROUND_TRUTH_UNAVAILABLE: an inference-only case). Scrolling back over a
 *     slice whose metrics do not exist must not ask again on every pass - that
 *     is a network request per revisit, which L4 forbids and the user gains
 *     nothing from. Any other unavailable reason is not kept.
 *
 * Forgetting (#77 QA N-1/N-2, #78 QA N-4): clearNegative() drops only those
 * unavailable entries, and SCR-03 / SCR-04 call it only when they open;
 * clearWhere(fn) drops the entries whose (endpointId, params) match, the
 * unavailable ones included. Retry forgets only the slice it retries - Retry
 * and "refresh this slice" clear that slice's keys and nothing else, not even
 * another slice's unavailable answer - so a Retry never turns the cached
 * slices of an L4 revisit pass back into network traffic.
 *
 * Bounded LRU; a stale-run screen must call clear() rather than trust it.
 */

import { bytesToBase64 } from '../lib/bytes.mjs';
import { maskRuns, runPixelCount, runsToPath } from '../lib/mask.mjs';

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
    // A named fixture scenario is part of the answer; an unnamed request and
    // an explicit 'default' are the same request (the V1 model always names
    // one, a screen reading the cache usually does not).
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
    // The cached state for exactly this request, synchronously, or null. Lets
    // a screen read a field of a response the model already fetched
    // (content_url, say) in the same render, without a round trip.
    peek: (endpointId, params, options) => {
      if (!allowed.has(endpointId)) return null;
      const key = keyFor(endpointId, params, options);
      return key !== null && fresh(key) ? store.get(key) : null;
    },
    // Everything - a stale run, or a test.
    clear() { store.clear(); expires.clear(); about.clear(); },
    // Only the cached "legitimately unavailable" answers; returns how many.
    clearNegative() {
      const keys = [...expires.keys()];
      keys.forEach(drop);
      return keys.length;
    },
    // The entries whose request matches fn(endpointId, params); returns how many.
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
 * MRI slice images: fetch the PNG bytes from content_url, keep them as a
 * data URI, hand <Image> the data URI.
 *
 * Why not give <Image> the URL directly? Because then the bytes never pass
 * through JavaScript, and L4 (NFR-PERF-001 limb 2: no full-volume transfer
 * per slice gesture) needs the phone to COUNT what each gesture received.
 * Fetching here lets netLog attribute every byte to its gesture, and the
 * per-slice cache makes a revisit provably free (0 requests). Data URIs are
 * also exactly how Spike A measured A9 on the A17 (cached switch p95 65 ms,
 * 576 x 576 x 88, release build), so this is the measured path, not a new
 * one.
 *
 * Bounded LRU per slice image (DR-015: per slice, never the volume). The
 * content URL is content-addressed, so a cached image can never be stale.
 */

/*
 * fetchBytes(key, { checksum }) -> Promise<Uint8Array>; in the app it is
 * runtime.content.bytes (timeout, error mapping, checksum check, netLog)
 * through bytesOrThrow. The key is the content_url itself.
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
