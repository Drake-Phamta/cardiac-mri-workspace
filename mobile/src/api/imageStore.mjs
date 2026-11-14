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

import { bytesToBase64 } from '../lib/bytes.mjs';

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
