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
 * Forgetting (#77 QA N-1/N-2): clearNegative() drops only those unavailable
 * entries (the Explorer calls it when it mounts, and Retry / Refresh do);
 * clearWhere(fn) drops the entries whose (endpointId, params) match - "refresh
 * this slice" clears one slice's keys and nothing else, so a Retry never turns
 * the cached slices of an L4 revisit pass back into network traffic.
 *
 * Bounded LRU; a stale-run screen must call clear() rather than trust it.
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
