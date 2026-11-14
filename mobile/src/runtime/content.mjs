/*
 * runtime.content - the app's ONE binary path, shared by every vertical.
 *
 * Contract v1.0 `binary_delivery`: slice endpoints answer JSON metadata that
 * carries `content_url` (immutable, content-addressed under
 * /api/v1/artifacts/) and `checksum` ("sha256:<hex>"); the bytes come from
 * content_url, they hash to that checksum, and the artifact route answers
 * with an ETag equal to it. Every vertical that needs bytes - V1 overlays and
 * MRI, V4 brush editing, anything later - goes through here, so all of them
 * get the same timeout, the same error mapping, the same checksum check and
 * the same network accounting, instead of one bare fetch each.
 *
 *   content.uri(content_url)
 *       -> absolute URL for an <Image>, or null (fixture mode, or not an
 *          artifact path of this backend)
 *   content.bytes(content_url, { checksum, signal, kind })
 *       -> Promise of an app/core screen state, never a throw:
 *          SUCCESS            data = { bytes: Uint8Array, size, checksum, verified }
 *          EMPTY_UNAVAILABLE  FIXTURE_NO_BYTES (fixture mode: nothing behind any
 *                             URL), NO_CONTENT_URL, REQUEST_ABORTED (the
 *                             caller's signal fired - discard it)
 *          RECOVERABLE_ERROR  TRANSPORT_UNREACHABLE (network, timeout, 5xx
 *                             without a contract code) - RETRY
 *          FATAL_INVALID      CONTRACT_DRIFT (a URL outside the artifact route,
 *                             no checksum stated, bytes that do not hash to
 *                             the checksum, an ETag that disagrees, a 4xx
 *                             without a contract code)
 *          + the contract code's own state for an error envelope
 *            (ARTIFACT_NOT_FOUND -> EMPTY_UNAVAILABLE, ...)
 *
 * Only artifact paths of the configured backend are fetched: a content_url
 * pointing at another host is CONTRACT_DRIFT, never a request. Every
 * response is reported to runtime.netLog as `artifact:<kind>` with its size.
 */

import {
  emptyUnavailable, fatalInvalid, parseErrorEnvelope, stateForError, success,
} from '../../../app/core/index.mjs';
import { sha256Hex } from './sha256.mjs';

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

  // content_url -> absolute URL of THIS backend's artifact route, or null.
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
    // DR-021 rule 1 (#77 QA N-10): every content URL's bytes are verified
    // against the SHA-256 the server stated for them. A response that states
    // none cannot be verified, so it is CONTRACT_DRIFT - never an unverified
    // success - and nothing is fetched for it.
    if (checksum === null || checksum === undefined || String(checksum).trim() === '') {
      return drift('no checksum stated for this content_url - its bytes cannot be verified',
        ['checksum missing - not fetched']);
    }
    const m = /^sha256:([0-9a-f]{64})$/i.exec(String(checksum));
    if (!m) return drift('checksum is not "sha256:<64 hex>"', [`checksum ${String(checksum).slice(0, 80)}`]);
    const expected = m[1].toLowerCase();
    if (signal && signal.aborted) return emptyUnavailable(CONTENT_REASON.REQUEST_ABORTED);

    // The gesture open as the request starts is the one it belongs to (#77 QA N-3).
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

/*
 * For stores that cache bytes and want a plain value-or-throw: a non-SUCCESS
 * state becomes an Error carrying it (`err.view`), so the layer can say why
 * it is unavailable with the same words as everywhere else.
 */
export async function bytesOrThrow(content, contentUrl, options) {
  const view = await content.bytes(contentUrl, options);
  if (view.state === 'SUCCESS') return view.data.bytes;
  const err = new Error((view.error && view.error.safeMessage) || view.reason || view.state);
  err.view = view;
  err.code = view.reason || view.state;
  throw err;
}
