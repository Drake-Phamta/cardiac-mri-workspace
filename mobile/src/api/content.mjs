/*
 * The one path for artifact bytes (MRI slices, masks). bytes(content_url, { checksum }) fetches from
 * this backend's /artifacts/ route, checks the bytes against the stated sha256 and returns a screen
 * state, never a throw. A content_url on another host is CONTRACT_DRIFT and is never fetched.
 */

import { emptyUnavailable, fatalInvalid, stateForError, success, parseErrorEnvelope } from './states.mjs';
import { sha256Hex } from '../lib/bytes.mjs';

export const CONTENT_REASON = Object.freeze({
  FIXTURE_NO_BYTES: 'FIXTURE_NO_BYTES',
  NO_CONTENT_URL: 'NO_CONTENT_URL',
  REQUEST_ABORTED: 'REQUEST_ABORTED',
});

const drift = (safeMessage, problems = []) => fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage, detail: { problems } });

export function createContent({
  contract,
  mode,
  baseUrl = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  AbortControllerImpl = globalThis.AbortController,
  netLog = null,
  now = () => Date.now(),
  verifyChecksum = true,
} = {}) {
  const live = mode === 'live' && Boolean(baseUrl);
  const base = live ? String(baseUrl).replace(/\/+$/, '') : null;
  const artifactPrefix = `${contract.basePath}/artifacts/`;

  // content_url -> absolute URL on this backend's artifact route, or null.
  function resolve(contentUrl) {
    if (!live || typeof contentUrl !== 'string') return null;
    const u = contentUrl.trim();
    if (u.startsWith('/')) return u.startsWith(artifactPrefix) ? `${base}${u}` : null;
    if (u.startsWith(`${base}/`)) return u.slice(base.length).startsWith(artifactPrefix) ? u : null;
    return null;
  }

  async function bytes(contentUrl, { checksum = null, signal = null, kind = 'artifact' } = {}) {
    if (!live) return emptyUnavailable(CONTENT_REASON.FIXTURE_NO_BYTES);
    if (typeof contentUrl !== 'string' || contentUrl.trim() === '') return emptyUnavailable(CONTENT_REASON.NO_CONTENT_URL);
    const url = resolve(contentUrl);
    if (!url) {
      return drift(`content_url is not an artifact path of the configured backend (${artifactPrefix}…)`,
        ['content_url outside the artifact route - not fetched']);
    }
    // Bytes are always checked against the stated SHA-256, so a missing checksum is
    // CONTRACT_DRIFT (never an unchecked success) and nothing is fetched.
    if (checksum === null || checksum === undefined || String(checksum).trim() === '') {
      return drift('no checksum stated for this content_url - its bytes cannot be verified',
        ['checksum missing - not fetched']);
    }
    const m = /^sha256:([0-9a-f]{64})$/i.exec(String(checksum));
    if (!m) return drift('checksum is not "sha256:<64 hex>"', [`checksum ${String(checksum).slice(0, 80)}`]);
    const expected = m[1].toLowerCase();
    if (signal && signal.aborted) return emptyUnavailable(CONTENT_REASON.REQUEST_ABORTED);

    // The request belongs to the gesture that is open when it starts.
    const gesture = netLog ? netLog.openSeq : null;
    const record = (bytesCount, status, t0) => {
      if (netLog) netLog.record({ endpoint: `artifact:${kind}`, bytes: bytesCount, ms: now() - t0, status, seq: gesture });
    };

    let controller = null;
    let timer = null;
    let timedOut = false;
    let unlink = null;
    if (AbortControllerImpl) {
      controller = new AbortControllerImpl();
      if (timeoutMs > 0) timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      if (signal && typeof signal.addEventListener === 'function') {
        const onAbort = () => controller.abort();
        signal.addEventListener('abort', onAbort);
        unlink = () => signal.removeEventListener('abort', onAbort);
      }
    }
    const t0 = now();
    try {
      let res;
      try {
        res = await fetchImpl(url, { method: 'GET', signal: controller ? controller.signal : undefined });
      } catch (_err) {
        record(null, 'error', t0);
        if (signal && signal.aborted && !timedOut) return emptyUnavailable(CONTENT_REASON.REQUEST_ABORTED);
        return stateForError(contract, 'TRANSPORT_UNREACHABLE');
      }
      const header = (name) => {
        try { return res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null; } catch (_e) { return null; }
      };
      if (res.status >= 400) {
        let body = null;
        try { body = /json/i.test(header('content-type') || '') ? await res.json() : null; } catch (_e) { body = null; }
        record(null, res.status, t0);
        const env = parseErrorEnvelope(body, res.status);
        if (env.code && contract.errorsByCode.has(env.code)) return stateForError(contract, env.code);
        if (res.status >= 500) return stateForError(contract, 'TRANSPORT_UNREACHABLE');
        return drift(`the artifact route answered ${res.status} without a contract error code`, [`HTTP ${res.status}`]);
      }
      let buf;
      try {
        buf = new Uint8Array(await res.arrayBuffer());
      } catch (_err) {
        record(null, 'error', t0);
        if (signal && signal.aborted && !timedOut) return emptyUnavailable(CONTENT_REASON.REQUEST_ABORTED);
        return stateForError(contract, 'TRANSPORT_UNREACHABLE');
      }
      record(buf.length, res.status, t0);

      let verified = false;
      if (verifyChecksum) {
        const got = sha256Hex(buf);
        if (got !== expected) {
          return drift('the artifact bytes do not hash to the checksum the server stated',
            [`expected sha256:${expected}`, `received sha256:${got} (${buf.length} bytes)`]);
        }
        verified = true;
        const etag = header('etag');
        if (etag) {
          const tag = etag.replace(/^W\//, '').replace(/"/g, '').toLowerCase();
          if (tag !== `sha256:${expected}` && tag !== expected) {
            return drift('the artifact ETag disagrees with the checksum', [`ETag ${etag.slice(0, 90)}`]);
          }
        }
      }
      return success(Object.freeze({ bytes: buf, size: buf.length, checksum: `sha256:${expected}`, verified }));
    } finally {
      if (timer) clearTimeout(timer);
      if (unlink) unlink();
    }
  }

  return Object.freeze({
    live,
    uri: (contentUrl) => resolve(contentUrl),
    bytes,
  });
}

// For caches that want value-or-throw: a non-SUCCESS state becomes an Error with the state in err.view.
export async function bytesOrThrow(content, contentUrl, options) {
  const view = await content.bytes(contentUrl, options);
  if (view.state === 'SUCCESS') return view.data.bytes;
  const err = new Error((view.error && view.error.safeMessage) || view.reason || view.state);
  err.view = view;
  err.code = view.reason || view.state;
  throw err;
}
