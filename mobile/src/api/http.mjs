/*
 * The HTTP transport for createClient: send(resolved) fetches resolved.url and returns { status, data }
 * or { status, error }. It only moves bytes; client.mjs checks and classifies the answer.
 * fetch and AbortController are injected, so Node tests run this same file.
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

// The JSON body and its size on the wire (Content-Length, else the UTF-8 length of the text).
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
 * baseUrl is already normalised by config.mjs. onTiming gets { endpointId, url, status, ms, bytes }
 * once per response (the size, never the body). onStart(endpointId) runs as the request is sent,
 * and its return value reaches onTiming as start.
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
      if (options.ifMatch) headers['If-Match'] = String(options.ifMatch);

      // One AbortController per request, fired by the timeout or by the caller's signal
      // (useCall aborts on unmount or when the params change).
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

      // A 5xx without a contract code throws, so the user gets RETRY: the server is up but failing.
      // A 4xx without a code goes on with no code, and the client reports CONTRACT_DRIFT.
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
        // A binary answer has no data object, so the client reports CONTRACT_DRIFT for this endpoint.
        return { status, data: null, contentType: contentType || null };
      }

      // The ETag header is not copied into data: etag is a body field, and filling it
      // from the header would hide a missing field.
      return { status, data: body, contentType };
    },
  });
}

/*
 * Network log per slice gesture, to show a slice switch never downloads a whole volume. Requests between
 * begin() and end() count toward the gesture, and end() logs one CMW_GESTURE line. A request belongs to
 * the gesture open when it started; an answer after that gesture closed counts as late.
 * Only endpoint ids and sizes are logged, never a URL or host.
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
    // kind: 'slice' (slice switch), 'open' (first slice of a case) or 'variant' (from === to).
    begin({ caseId = null, from = null, to = null, kind = 'slice' } = {}) {
      if (open) end({ outcome: 'superseded' });
      seq += 1;
      open = { seq, kind, case: caseId, from, to, t0: now(), requests: [] };
      return seq;
    },
    // seq: openSeq when the request started (null if none was open). Defaults to the open gesture.
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

// UTF-8 byte length counted by hand, so it needs no TextEncoder on Hermes.
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
