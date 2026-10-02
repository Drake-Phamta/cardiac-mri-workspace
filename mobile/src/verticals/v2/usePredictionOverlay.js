import { useEffect, useState } from 'react';

const OFF = Object.freeze({ status: 'off', path: null, error: null });

export default function usePredictionOverlay(store, ref, size) {
  const width = size && size.width;
  const height = size && size.height;
  const checksum = ref && ref.checksum;
  const url = ref && ref.content_url;
  const expected = width && height ? { width, height } : null;
  const cached = store && url && expected ? store.peek(url, expected) : null;
  const [state, setState] = useState(OFF);

  useEffect(() => {
    if (!store || !url || !expected) { setState(OFF); return undefined; }
    if (store.peek(url, expected)) return undefined;
    let alive = true;
    setState({ status: 'loading', path: null, error: null, url });
    store.load(url, expected, { checksum }).then(
      (value) => { if (alive) setState({ status: 'ready', path: value.path, error: null, url }); },
      (error) => { if (alive) setState({ status: 'error', path: null, error: String(error && error.message), url }); },
    );
    return () => { alive = false; };
  }, [store, url, width, height, checksum]);

  if (cached) return { status: 'ready', path: cached.path, error: null };
  if (state.url !== url) return url && store && expected ? { status: 'loading', path: null, error: null } : OFF;
  return state;
}
