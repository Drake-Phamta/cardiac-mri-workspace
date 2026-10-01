/*
 * One mask layer for the viewport: content_url in, vector path out.
 *
 * Goes through the runtime's mask store (runtime.content.bytes -> maskPng.js
 * -> runs), keyed by the content-addressed URL and the slice size the mask
 * must have; the checksum the server stated is verified on the way in. A
 * decode that is already cached is returned in the SAME render (peek), so a
 * revisited slice draws its overlay with its image, not a frame later.
 *
 *   status  'off'      no store (fixture mode) or no URL - nothing to fetch
 *           'loading'  fetching / decoding
 *           'ready'    path is drawable
 *           'error'    the layer is unavailable; `error` says why
 */

import { useEffect, useState } from 'react';

const OFF = Object.freeze({ status: 'off', path: null, pixels: null, error: null, url: null });

export default function useMaskOverlay(store, url, size, checksum = null) {
  const width = size ? size.width : null;
  const height = size ? size.height : null;
  const expected = width && height ? { width, height } : null;
  const cached = store && url && expected ? store.peek(url, expected) : null;

  const [state, setState] = useState(OFF);

  useEffect(() => {
    if (!store || !url || !expected) { setState(OFF); return undefined; }
    if (store.peek(url, expected)) return undefined; // drawn from the cache below
    let alive = true;
    setState({ status: 'loading', path: null, pixels: null, error: null, url });
    store.load(url, expected, { checksum }).then(
      (v) => { if (alive) setState({ status: 'ready', path: v.path, pixels: v.pixels, error: null, url }); },
      (err) => { if (alive) setState({ status: 'error', path: null, pixels: null, error: String(err && err.message), url }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, url, width, height, checksum]);

  if (cached) return { status: 'ready', path: cached.path, pixels: cached.pixels, error: null, url };
  // Never hand back a path that belongs to a previous URL.
  if (state.url !== url) return url && store && expected ? { status: 'loading', path: null, pixels: null, error: null, url } : OFF;
  return state;
}
