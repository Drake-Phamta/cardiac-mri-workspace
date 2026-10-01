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
 *   - errors and unavailable states are never cached: a refresh must be able
 *     to see an artifact that has since appeared.
 *
 * Bounded LRU; a stale-run screen must call clear() rather than trust it.
 */

export const CACHEABLE_ENDPOINTS = Object.freeze([
  'mri_slice_get',
  'prediction_slice_get',
  'ground_truth_slice_get',
  'analysis_slice_metrics',
  'reviewed_mask_slice_get',
]);

export function createSliceCache(client, { maxEntries = 600, endpoints = CACHEABLE_ENDPOINTS } = {}) {
  const allowed = new Set(endpoints);
  const store = new Map();
  const stats = { hits: 0, misses: 0, evictions: 0 };

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

  async function call(endpointId, params = {}, options = {}) {
    const cacheable = allowed.has(endpointId) && options.body === undefined && options.noCache !== true;
    const key = cacheable ? keyFor(endpointId, params, options) : null;
    if (key && store.has(key)) {
      const hit = store.get(key);
      store.delete(key);
      store.set(key, hit); // most recently used
      stats.hits += 1;
      return hit;
    }
    const view = await client.call(endpointId, params, options);
    if (key) {
      stats.misses += 1;
      if (view && view.state === 'SUCCESS') {
        store.set(key, view);
        while (store.size > maxEntries) {
          store.delete(store.keys().next().value);
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
      return key !== null && store.has(key);
    },
    // The cached SUCCESS state for exactly this request, synchronously, or
    // null. Lets a screen read a field of a response the model already
    // fetched (content_url, say) in the same render, without a round trip.
    peek: (endpointId, params, options) => {
      if (!allowed.has(endpointId)) return null;
      const key = keyFor(endpointId, params, options);
      return key !== null && store.has(key) ? store.get(key) : null;
    },
    clear() { store.clear(); },
    get size() { return store.size; },
    stats: () => ({ ...stats, size: store.size }),
  });
}
