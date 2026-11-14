/*
 * The API contract (contract.json), checked once and frozen.
 * It takes already-parsed JSON, because on the phone the contract is a bundled asset, not a file.
 * Versions must match exactly; there is no "nearest compatible" version.
 */

export const EXPECTED = Object.freeze({
  contract: 'api_contract_11',
  contractVersion: '1.2.0',
  basePath: '/api/v1',
  geometryContractVersion: 'dr008a-dr012/v1.0.0',
  endpointCount: 29,
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

// Throws CONTRACT_INVALID with every problem found, not only the first one.
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
 * Paths in contract.json already start with /api/v1 and carry their query, e.g.
 * /api/v1/experiments/compare?ids={experiment_ids}. The query name can differ from the
 * {token}, so callers pass params keyed by token and never build a URL by hand.
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
  // A list (experiment_ids) keeps plain commas so the ids stay readable in a log.
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  return encodeURIComponent(raw).replace(/%2C/g, ',');
}

// Every token is required: a default would silently swap the prediction variant (spec 11 §6).
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
    rowFields: Array.isArray(endpoint.row_fields) ? Object.freeze([...endpoint.row_fields]) : null,
  });
}

// The contract forbids last-write-wins, so a write without expected_revision is a client bug.
export function assertWritePreconditions(contract, endpointId, body = {}) {
  const endpoint = getEndpoint(contract, endpointId);
  if (endpoint.revision_required === true && !(body && 'expected_revision' in body)) {
    throw new CoreError('MISSING_EXPECTED_REVISION', { endpointId });
  }
}
