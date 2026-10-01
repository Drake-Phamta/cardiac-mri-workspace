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
 *   - a LEGITIMATELY UNAVAILABLE answer (EMPTY_UNAVAILABLE - e.g. metrics not
 *     ingested yet, ARTIFACT_NOT_FOUND) is cached for `unavailableTtlMs`
 *     (default 5 min): scrolling back over a slice whose metrics do not exist
 *     must not ask again on every pass - that is a network request per
 *     revisit, which L4 forbids and the user gains nothing from. A user
 *     Refresh / Retry clears the cache first (clear()), so an artifact that
 *     has since appeared is seen at once.
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

export function createSliceCache(client, {
  maxEntries = 600, endpoints = CACHEABLE_ENDPOINTS, unavailableTtlMs = 5 * 60 * 1000, now = () => Date.now(),
} = {}) {
  const allowed = new Set(endpoints);
  const store = new Map();       // key -> view
  const expires = new Map();     // key -> time an UNAVAILABLE entry stops counting
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

  function fresh(key) {
    if (!store.has(key)) return false;
    const until = expires.get(key);
    if (until !== undefined && now() >= until) {
      store.delete(key);
      expires.delete(key);
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
      const unavailable = view && view.state === 'EMPTY_UNAVAILABLE' && unavailableTtlMs > 0;
      if (success || unavailable) {
        store.set(key, view);
        if (unavailable) expires.set(key, now() + unavailableTtlMs); else expires.delete(key);
        while (store.size > maxEntries) {
          const oldest = store.keys().next().value;
          store.delete(oldest);
          expires.delete(oldest);
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
    // Called by a user Refresh / Retry, so it sees the server as it is now.
    clear() { store.clear(); expires.clear(); },
    get size() { return store.size; },
    stats: () => ({ ...stats, size: store.size }),
  });
}
