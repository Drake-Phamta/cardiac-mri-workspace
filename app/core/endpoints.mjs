/*
 * Endpoint resolution against the accepted contract.
 *
 * Two facts about contract.json shape every decision here:
 *   1. a path is already fully qualified - it starts with /api/v1, so nothing
 *      concatenates base_path onto it;
 *   2. query parameters are baked into the path string, and the query parameter
 *      NAME differs from the placeholder TOKEN:
 *          /api/v1/analysis-runs/{run_id}/metrics?prediction_variant={variant}
 *          /api/v1/experiments/compare?ids={experiment_ids}
 *      Two endpoints even use {variant} under different names (prediction_variant=
 *      for the metrics/error family, variant= for prediction_slice_get).
 * Callers therefore key params by TOKEN, and this module keeps the contract's
 * parameter names verbatim. No caller ever writes a URL template by hand.
 */

import { CoreError, getEndpoint } from './contract.mjs';

const TOKEN = /\{([a-z_][a-z0-9_]*)\}/gi;

function tokensIn(text) {
  return [...text.matchAll(TOKEN)].map((m) => m[1]);
}

export function parseEndpointPath(path) {
  const cut = path.indexOf('?');
  const pathTemplate = cut === -1 ? path : path.slice(0, cut);
  const queryTemplate = cut === -1 ? null : path.slice(cut + 1);
  const queryTokens = [];
  if (queryTemplate) {
    for (const pair of queryTemplate.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) throw new CoreError('MALFORMED_QUERY', { queryTemplate, pair });
      const param = pair.slice(0, eq);
      const inner = tokensIn(pair.slice(eq + 1));
      if (inner.length !== 1) throw new CoreError('MALFORMED_QUERY', { queryTemplate, pair });
      queryTokens.push({ param, token: inner[0] });
    }
  }
  return { pathTemplate, queryTemplate, pathTokens: tokensIn(pathTemplate), queryTokens };
}

export function tokensOf(contract, endpointId) {
  const parsed = parseEndpointPath(getEndpoint(contract, endpointId).path);
  return { path: parsed.pathTokens, query: parsed.queryTokens.map((q) => q.token) };
}

function serialize(token, value, endpointId) {
  if (value === undefined || value === null || value === '') {
    throw new CoreError('MISSING_PARAM', { endpointId, token });
  }
  // Only experiment_ids is a list today; joining with a comma keeps the id
  // readable in a log, which a percent-encoded comma would not.
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  return encodeURIComponent(raw).replace(/%2C/g, ',');
}

/*
 * Every token must be supplied. A default would be a silent substitution, and
 * `11` section 6 forbids exactly that for the prediction variant.
 */
export function resolveEndpoint(contract, endpointId, params = {}) {
  const endpoint = getEndpoint(contract, endpointId);
  const parsed = parseEndpointPath(endpoint.path);

  let path = parsed.pathTemplate;
  for (const token of parsed.pathTokens) {
    path = path.replace(`{${token}}`, serialize(token, params[token], endpointId));
  }

  const query = parsed.queryTokens
    .map(({ param, token }) => `${param}=${serialize(token, params[token], endpointId)}`)
    .join('&');
  const url = query ? `${path}?${query}` : path;

  if (url.includes('{') || url.includes('}')) {
    throw new CoreError('UNRESOLVED_TEMPLATE', { endpointId, url });
  }

  return Object.freeze({
    endpointId,
    method: endpoint.method,
    path,
    query: query || null,
    url,
    responseKind: endpoint.response_kind,
    geometryResponse: endpoint.geometry_response === true,
    revisionRequired: endpoint.revision_required === true,
    artifactWrite: endpoint.artifact_write === true,
    groundTruthBehavior: endpoint.ground_truth_behavior,
    allowedErrors: new Set(endpoint.errors),
    responseFields: Object.freeze([...(endpoint.response_fields || [])]),
  });
}

/*
 * revision_rules.last_write_wins_allowed is false, so a write that forgets
 * expected_revision is a client bug, not a server concern. Saying that once
 * here means V4 cannot forget it in one of four call sites.
 */
export function assertWritePreconditions(contract, endpointId, body = {}) {
  const endpoint = getEndpoint(contract, endpointId);
  if (endpoint.revision_required === true && !(body && 'expected_revision' in body)) {
    throw new CoreError('MISSING_EXPECTED_REVISION', { endpointId });
  }
}
