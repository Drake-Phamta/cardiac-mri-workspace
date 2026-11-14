/*
 * The accepted API contract, loaded and frozen.
 *
 * Takes already-parsed JSON: nothing in app/core touches the filesystem except
 * app/core/node/loadFromDisk.mjs, because on a device the contract is a bundled
 * asset whatever TECH_STACK_ADR eventually picks.
 *
 * Version comparison is whole-string equality. There is no "nearest compatible"
 * here and there must never be one - tests/fixtures/geometry/FORMAT.md and
 * TC-REL-003 both turn on an exact geometry contract version.
 */

export const EXPECTED = Object.freeze({
  contract: 'api_contract_11',
  contractVersion: '1.1.0',
  basePath: '/api/v1',
  geometryContractVersion: 'dr008a-dr012/v1.0.0',
  endpointCount: 28,
  errorCount: 15,
});

export class CoreError extends Error {
  constructor(code, detail = {}) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'CoreError';
    this.code = code;
    this.detail = detail;
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/*
 * Returns a frozen Contract, or throws CoreError('CONTRACT_INVALID') listing
 * every problem at once - a loader that reports one problem per run turns a
 * contract bump into an afternoon.
 */
export function createContract(json) {
  const problems = [];
  const need = (cond, message) => { if (!cond) problems.push(message); };

  need(json && typeof json === 'object', 'contract json is not an object');
  if (problems.length) throw new CoreError('CONTRACT_INVALID', { problems });

  need(json.contract === EXPECTED.contract, `contract is ${json.contract}, expected ${EXPECTED.contract}`);
  need(json.contract_version === EXPECTED.contractVersion,
    `contract_version is ${json.contract_version}, expected ${EXPECTED.contractVersion}`);
  need(json.base_path === EXPECTED.basePath, `base_path is ${json.base_path}, expected ${EXPECTED.basePath}`);

  const geometry = json.geometry_contract || {};
  need(geometry.version === EXPECTED.geometryContractVersion,
    `geometry_contract.version is ${geometry.version}, expected ${EXPECTED.geometryContractVersion}`);
  const geometryFields = Array.isArray(geometry.required_response_fields)
    ? geometry.required_response_fields.slice() : [];
  need(geometryFields.length === 7, `geometry_contract.required_response_fields has ${geometryFields.length}, expected 7`);

  const endpoints = Array.isArray(json.endpoints) ? json.endpoints : [];
  const errors = Array.isArray(json.errors) ? json.errors : [];
  need(endpoints.length === EXPECTED.endpointCount,
    `${endpoints.length} endpoints, expected ${EXPECTED.endpointCount}`);
  need(errors.length === EXPECTED.errorCount, `${errors.length} errors, expected ${EXPECTED.errorCount}`);

  const errorsByCode = new Map();
  for (const e of errors) {
    need(typeof e.code === 'string', `error without a code: ${JSON.stringify(e)}`);
    need(Number.isInteger(e.http_status), `error ${e.code} has no integer http_status`);
    if (errorsByCode.has(e.code)) problems.push(`duplicate error code ${e.code}`);
    errorsByCode.set(e.code, Object.freeze({
      code: e.code, httpStatus: e.http_status, messageTemplate: e.message_template || null,
    }));
  }

  const endpointsById = new Map();
  for (const e of endpoints) {
    need(typeof e.id === 'string', `endpoint without an id: ${JSON.stringify(e).slice(0, 80)}`);
    need(typeof e.path === 'string' && e.path.startsWith(EXPECTED.basePath),
      `endpoint ${e.id} path does not start with ${EXPECTED.basePath}`);
    need(Array.isArray(e.errors) && e.errors.length > 0, `endpoint ${e.id} lists no errors`);
    for (const code of e.errors || []) {
      if (!errorsByCode.has(code)) problems.push(`endpoint ${e.id} references unknown error ${code}`);
    }
    if (endpointsById.has(e.id)) problems.push(`duplicate endpoint id ${e.id}`);
    endpointsById.set(e.id, e);
  }

  if (problems.length) throw new CoreError('CONTRACT_INVALID', { problems });

  return deepFreeze({
    raw: json,
    contract: json.contract,
    contractVersion: json.contract_version,
    basePath: json.base_path,
    geometryContractVersion: geometry.version,
    geometryValidationStatusField: geometry.validation_status_field,
    geometryFields,
    endpointsById,
    errorsByCode,
  });
}

export function getEndpoint(contract, endpointId) {
  const endpoint = contract.endpointsById.get(endpointId);
  if (!endpoint) throw new CoreError('UNKNOWN_ENDPOINT', { endpointId });
  return endpoint;
}

export function listEndpoints(contract) {
  return [...contract.endpointsById.keys()];
}

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
    // List endpoints (contract v1.0.0) say which fields live on each item;
    // null for an endpoint without row_fields.
    rowFields: Array.isArray(endpoint.row_fields) ? Object.freeze([...endpoint.row_fields]) : null,
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
