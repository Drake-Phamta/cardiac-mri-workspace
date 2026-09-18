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
  contractVersion: 'DRAFT v0',
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
