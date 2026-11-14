/*
 * Live transport: plugs `fetch` into app/core's `createClient`.
 *
 * app/core/transport.mjs defines the shape - `send(resolved, options)` returns
 * `{ status, data }` on success or `{ status, error: { code, ... } }` on a
 * contract error - and validates every response before a screen sees it. This
 * file only moves bytes. It never classifies an error and never builds a URL
 * from a template: `resolved.url` comes from app/core/endpoints.mjs, already
 * resolved against the contract.
 *
 * Three decisions live here, each because the alternative lies to the user:
 *
 *   1. A network failure or a timeout THROWS. createClient turns a throw into
 *      TRANSPORT_UNREACHABLE, which is RECOVERABLE_ERROR with RETRY.
 *   2. A 5xx that carries no contract error code also throws. A FastAPI crash
 *      returns {"detail": "Internal Server Error"}; that is a server that is
 *      up but failing, and "retry" is the honest offer. Calling it
 *      CONTRACT_DRIFT would block the screen for something a retry can fix.
 *   3. A 4xx with no contract error code is passed through WITHOUT a code, so
 *      app/core reports CONTRACT_DRIFT and blocks the view. A backend that
 *      answers 404 {"detail": "Not Found"} is a route the contract does not
 *      know - a real drift, not a missing artifact.
 *
 * No React Native import: `fetch` and `AbortController` are injected, so
 * `node --test` exercises the same file Metro bundles.
 */

import { parseErrorEnvelope } from './states.mjs';

export class TransportError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.detail = detail;
  }
}

export function joinUrl(baseUrl, url) {
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new TransportError('BAD_URL', `resolved url must start with "/": ${url}`);
  }
  return `${String(baseUrl).replace(/\/+$/, '')}${url}`;
}

function isJson(contentType) {
  return /\bjson\b/i.test(contentType || '');
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_err) {
    return null;
  }
}

function headerOf(response, name) {
  try {
    return response.headers && typeof response.headers.get === 'function'
      ? response.headers.get(name) : null;
  } catch (_err) {
    return null;
  }
}

/*
 * The JSON body and how many bytes it was on the wire: Content-Length when
 * the server sends it, else the UTF-8 length of the body text. The byte
 * count feeds the per-gesture network log (netLog.mjs, L4); the body itself
 * is never logged.
 */
async function readJsonBody(response, contentType) {
  const declaredRaw = headerOf(response, 'content-length');
  const declared = declaredRaw === null || declaredRaw === undefined ? NaN : Number(declaredRaw);
  const known = Number.isFinite(declared) && declared >= 0 ? declared : null;
  if (!isJson(contentType)) return { json: null, bytes: known };
  if (typeof response.text === 'function') {
    let text = null;
    try { text = await response.text(); } catch (_err) { text = null; }
    let json = null;
    if (text !== null) { try { json = JSON.parse(text); } catch (_err) { json = null; } }
    return { json, bytes: known !== null ? known : (text !== null ? utf8Length(text) : null) };
  }
  return { json: await readJson(response), bytes: known };
}

/*
 * options:
 *   baseUrl         scheme://host[:port] - config.mjs has already normalised it
 *   fetchImpl       defaults to globalThis.fetch
 *   timeoutMs       per request; a timeout is a TRANSPORT_UNREACHABLE
 *   AbortControllerImpl  injectable for tests; defaults to the global
 *   onTiming        optional ({ endpointId, url, status, ms, bytes }) => void,
 *                   for performance evidence: `bytes` is the body size, never
 *                   the body. Called once per response, after the body is read.
 *   onStart         optional (endpointId) => value, called as the request is
 *                   sent; with it, onTiming also gets that value as `start`
 *                   (the runtime passes the gesture open then, #77 QA N-3)
 */
export function createHttpTransport({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  AbortControllerImpl = globalThis.AbortController,
  onTiming = null,
  onStart = null,
  now = () => Date.now(),
} = {}) {
  if (!baseUrl) throw new TransportError('NO_BASE_URL', 'createHttpTransport needs a baseUrl');
  if (typeof fetchImpl !== 'function') throw new TransportError('NO_FETCH', 'no fetch implementation available');

  return Object.freeze({
    kind: 'http',
    baseUrl,

    async send(resolved, options = {}) {
      const url = joinUrl(baseUrl, resolved.url);
      const headers = { Accept: 'application/json' };
      const init = { method: resolved.method, headers };
      if (options.body !== undefined && options.body !== null) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      // revision_rules.etag_header is ETag; a write may also carry If-Match.
      if (options.ifMatch) headers['If-Match'] = String(options.ifMatch);

      // One AbortController per request, fired by the timeout OR by the
      // caller's options.signal (useCall aborts on unmount / param change).
      const callerSignal = options.signal || null;
      if (callerSignal && callerSignal.aborted) {
        throw new TransportError('ABORTED', `request to ${resolved.endpointId} was cancelled before it started`, { url });
      }
      let timer = null;
      let controller = null;
      let timedOut = false;
      let unlink = null;
      if (AbortControllerImpl) {
        controller = new AbortControllerImpl();
        init.signal = controller.signal;
        if (timeoutMs > 0) timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        if (callerSignal && typeof callerSignal.addEventListener === 'function') {
          const onAbort = () => controller.abort();
          callerSignal.addEventListener('abort', onAbort);
          unlink = () => callerSignal.removeEventListener('abort', onAbort);
        }
      }

      let start = null;
      if (onStart) {
        try { start = onStart(resolved.endpointId); } catch (_e) { start = null; }
      }
      const t0 = now();
      let response;
      try {
        response = await fetchImpl(url, init);
      } catch (err) {
        const aborted = err && (err.name === 'AbortError' || (controller && controller.signal.aborted));
        if (aborted && !timedOut && callerSignal && callerSignal.aborted) {
          throw new TransportError('ABORTED', `request to ${resolved.endpointId} was cancelled`, { url });
        }
        throw new TransportError(
          aborted ? 'TIMEOUT' : 'NETWORK',
          aborted ? `no response from ${url} within ${timeoutMs} ms` : `request to ${url} failed: ${err?.message || err}`,
          { url },
        );
      } finally {
        if (timer) clearTimeout(timer);
        if (unlink) unlink();
      }

      const status = response.status;
      const contentType = headerOf(response, 'content-type');
      const { json: body, bytes } = await readJsonBody(response, contentType);
      if (onTiming) {
        try {
          const timing = { endpointId: resolved.endpointId, url: resolved.url, status, ms: now() - t0, bytes };
          if (onStart) timing.start = start;
          onTiming(timing);
        } catch (_e) { /* evidence hook must never break a call */ }
      }

      if (status >= 400) {
        const envelope = parseErrorEnvelope(body, status);
        if (!envelope.code && status >= 500) {
          throw new TransportError('SERVER_ERROR', `${url} answered ${status} without a contract error code`, { url, status });
        }
        const error = {};
        if (envelope.code) error.code = envelope.code;
        if (envelope.message) error.message = envelope.message;
        error.request_id = envelope.requestId || headerOf(response, 'x-request-id') || null;
        error.details = envelope.details;
        return { status, error };
      }

      if (!isJson(contentType)) {
        // A BINARY endpoint answered with raw bytes. app/core validates a data
        // object against response_fields, so this reaches the screen as
        // CONTRACT_DRIFT naming the endpoint - until ADR-ART-001's
        // representation is wired here, which is the right failure.
        return { status, data: null, contentType: contentType || null };
      }

      // The body is passed through untouched. In particular the ETag header is
      // NOT copied into `data`: response_fields list `etag` as a body field,
      // and filling it from a header would hide exactly that drift.
      return { status, data: body, contentType };
    },
  });
}

/*
 * Network accounting per slice gesture - the phone-side evidence for L4,
 * NFR-PERF-001 limb 2: "a slice gesture never triggers a full-volume
 * transfer".
 *
 * A screen opens a gesture when the user asks for a slice and closes it when
 * that slice is on screen; every network request in between - JSON API calls
 * (httpTransport), MRI and mask artifact bytes (imageStore, maskStore) - is
 * attributed to it. Closing writes ONE logcat line:
 *
 *   CMW_GESTURE {"seq","kind","case","from","to","requests":[{"endpoint","bytes","ms","status"}],
 *                "cache_hit","bytes_total","max_request_bytes","ms","outcome"}
 *
 * cache_hit is true exactly when the gesture caused no network request at all.
 * Bytes are the response body as received (Content-Length when the server
 * sends it, else the counted body). Nothing here contains a payload, a URL
 * or a host - only endpoint ids and sizes (TC-SEC-003, no address in logs).
 * A gesture that is superseded by the next one is closed with outcome
 * "superseded", never silently merged into it.
 *
 * A request belongs to the gesture that was open when it STARTED (#77 QA N-3):
 * the caller reads `openSeq` before it sends and passes it to record() as
 * `seq`. A response that lands after its gesture closed is counted as `late`,
 * never filed under the gesture open at that moment; one that started with
 * no gesture open is `unattributed`. totals() keeps both, and SCR-03 logs it
 * as CMW_NET_TOTALS after each scripted pass's CMW_RUN_END.
 */

export function createNetLog({ log = (line) => console.log(line), now = () => Date.now() } = {}) {
  let seq = 0;
  let open = null;
  const totals = { gestures: 0, requests: 0, bytes: 0, unattributed: 0, late: 0 };

  function end({ outcome = 'shown' } = {}) {
    if (!open) return null;
    const g = open;
    open = null;
    totals.gestures += 1;
    let bytesTotal = 0;
    let maxBytes = 0;
    for (const r of g.requests) {
      bytesTotal += r.bytes || 0;
      maxBytes = Math.max(maxBytes, r.bytes || 0);
    }
    const rec = {
      seq: g.seq,
      kind: g.kind,
      case: g.case,
      from: g.from,
      to: g.to,
      requests: g.requests,
      cache_hit: g.requests.length === 0,
      bytes_total: bytesTotal,
      max_request_bytes: maxBytes,
      ms: Math.round(now() - g.t0),
      outcome,
    };
    log(`CMW_GESTURE ${JSON.stringify(rec)}`);
    return rec;
  }

  return Object.freeze({
    // kind: 'slice' (a slice switch - what L4 judges), 'open' (the first
    // slice of a case), 'variant' (a prediction-variant switch, from === to).
    begin({ caseId = null, from = null, to = null, kind = 'slice' } = {}) {
      if (open) end({ outcome: 'superseded' });
      seq += 1;
      open = { seq, kind, case: caseId, from, to, t0: now(), requests: [] };
      return seq;
    },
    // seq: openSeq when the request started (null: none was open). Left out,
    // the request is taken to start now.
    record({ endpoint, bytes = null, ms = null, status = null, seq = open ? open.seq : null }) {
      totals.requests += 1;
      totals.bytes += bytes || 0;
      if (seq === null) { totals.unattributed += 1; return; }
      if (!open || open.seq !== seq) { totals.late += 1; return; }
      open.requests.push({
        endpoint,
        bytes: Number.isFinite(bytes) ? bytes : null,
        ms: Number.isFinite(ms) ? Math.round(ms) : null,
        status,
      });
    },
    end,
    get openSeq() { return open ? open.seq : null; },
    get openTo() { return open ? open.to : null; },
    totals: () => ({ ...totals }),
  });
}

// UTF-8 byte length of a string, for a body read as text without a
// Content-Length header. Hermes-safe (no TextEncoder needed).
export function utf8Length(text) {
  const s = String(text);
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}
