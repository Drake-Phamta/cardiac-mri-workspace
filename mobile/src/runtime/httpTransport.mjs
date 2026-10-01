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

import { parseErrorEnvelope } from '../../../app/core/index.mjs';

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
 * options:
 *   baseUrl         scheme://host[:port] - config.mjs has already normalised it
 *   fetchImpl       defaults to globalThis.fetch
 *   timeoutMs       per request; a timeout is a TRANSPORT_UNREACHABLE
 *   AbortControllerImpl  injectable for tests; defaults to the global
 *   onTiming        optional ({ endpointId, url, status, ms }) => void, for
 *                   performance evidence. Called with no payload bytes.
 */
export function createHttpTransport({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  AbortControllerImpl = globalThis.AbortController,
  onTiming = null,
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

      let timer = null;
      let controller = null;
      if (AbortControllerImpl && timeoutMs > 0) {
        controller = new AbortControllerImpl();
        init.signal = controller.signal;
        timer = setTimeout(() => controller.abort(), timeoutMs);
      }

      const t0 = now();
      let response;
      try {
        response = await fetchImpl(url, init);
      } catch (err) {
        const aborted = err && (err.name === 'AbortError' || (controller && controller.signal.aborted));
        throw new TransportError(
          aborted ? 'TIMEOUT' : 'NETWORK',
          aborted ? `no response from ${url} within ${timeoutMs} ms` : `request to ${url} failed: ${err?.message || err}`,
          { url },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      const status = response.status;
      const contentType = headerOf(response, 'content-type');
      if (onTiming) {
        try { onTiming({ endpointId: resolved.endpointId, url: resolved.url, status, ms: now() - t0 }); } catch (_e) { /* evidence hook must never break a call */ }
      }

      if (status >= 400) {
        const body = isJson(contentType) ? await readJson(response) : null;
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
      const data = await readJson(response);
      return { status, data, contentType };
    },
  });
}
