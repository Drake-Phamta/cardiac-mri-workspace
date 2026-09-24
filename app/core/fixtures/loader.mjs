/*
 * Reads a generated fixture bundle and checks it against the contract.
 *
 * The checks are the six rules in FORMAT.md, and they exist so that a drift
 * between Trung's generator and the contract fails in one second here rather
 * than as a blank screen at 20:00 in somebody's vertical.
 *
 * Like createContract, this collects every problem before throwing. The
 * generator author gets one list, not one problem per run.
 */

import { CoreError } from '../contract.mjs';
import { parseEndpointPath } from '../endpoints.mjs';

export const BUNDLE_PATH = 'app/core/fixtures/.generated/api_bundle.json';

function rowFieldsPresent(items, name) {
  return Array.isArray(items) && items.length > 0
    && items.every((row) => row && typeof row === 'object' && name in row);
}

export function createBundle(contract, json) {
  const problems = [];
  const need = (cond, message) => { if (!cond) problems.push(message); };

  need(json && typeof json === 'object', 'bundle json is not an object');
  if (problems.length) throw new CoreError('BUNDLE_INVALID', { problems });

  // Rule 1 - identity. A bundle generated from another contract revision is
  // worse than no bundle: it renders, and it renders the wrong thing.
  need(json.contract === contract.contract,
    `bundle contract is ${json.contract}, expected ${contract.contract}`);
  need(json.contract_version === contract.contractVersion,
    `bundle contract_version is ${json.contract_version}, expected ${contract.contractVersion}`);
  need(json.base_path === contract.basePath,
    `bundle base_path is ${json.base_path}, expected ${contract.basePath}`);
  const geometryVersion = (json.geometry || {}).geometry_contract_version;
  need(geometryVersion === contract.geometryContractVersion,
    `bundle geometry version is ${geometryVersion}, expected ${contract.geometryContractVersion}`);

  // A bundle with no `scenarios` block is valid on purpose. Until the
  // generator grows one, every screen shows EMPTY_UNAVAILABLE with reason
  // FIXTURE_SCENARIO_MISSING, which is a working screen, and it lights up with
  // no code change the moment the scenarios land.
  const scenarios = json.scenarios && typeof json.scenarios === 'object' ? json.scenarios : {};

  for (const [endpointId, byName] of Object.entries(scenarios)) {
    // Rule 2 - real endpoint ids.
    const endpoint = contract.endpointsById.get(endpointId);
    if (!endpoint) { problems.push(`scenarios has unknown endpoint id ${endpointId}`); continue; }
    if (!byName || typeof byName !== 'object') {
      problems.push(`scenarios.${endpointId} is not an object`); continue;
    }
    const parsed = parseEndpointPath(endpoint.path);
    const tokens = [...parsed.pathTokens, ...parsed.queryTokens.map((q) => q.token)];

    for (const [name, scenario] of Object.entries(byName)) {
      const at = `scenarios.${endpointId}.${name}`;
      if (!scenario || typeof scenario !== 'object') { problems.push(`${at} is not an object`); continue; }

      // Rule 6 - every token supplied.
      const params = (scenario.request || {}).params || {};
      for (const token of tokens) {
        if (params[token] === undefined || params[token] === null || params[token] === '') {
          problems.push(`${at} does not supply {${token}}`);
        }
      }

      const response = scenario.response;
      if (!response || typeof response !== 'object') { problems.push(`${at} has no response`); continue; }
      if (!Number.isInteger(response.status)) { problems.push(`${at} response.status is not an integer`); continue; }

      if (response.status >= 400) {
        // Rule 4 - the code must belong to THIS endpoint, at ITS http_status.
        const code = (response.error || {}).code;
        if (!code) { problems.push(`${at} is a ${response.status} with no error.code`); continue; }
        if (!endpoint.errors.includes(code)) {
          problems.push(`${at} uses ${code}, which ${endpointId} does not list`);
          continue;
        }
        const expectedStatus = contract.errorsByCode.get(code).httpStatus;
        need(response.status === expectedStatus,
          `${at} is status ${response.status}, but ${code} is ${expectedStatus}`);
        continue;
      }

      const data = response.data;
      if (!data || typeof data !== 'object') { problems.push(`${at} is a ${response.status} with no data`); continue; }

      // Rule 3 - every response_field, with the items row rule for lists.
      const isList = (endpoint.response_fields || []).includes('items');
      for (const field of endpoint.response_fields || []) {
        if (field in data) continue;
        if (isList && rowFieldsPresent(data.items, field)) continue;
        problems.push(`${at} is missing response field ${field}`);
      }

      // Rule 5 - geometry endpoints carry all seven fields, exact version.
      if (endpoint.geometry_response === true) {
        for (const field of contract.geometryFields) {
          if (!(field in data)) problems.push(`${at} is missing geometry field ${field}`);
        }
        if (data.geometry_contract_version !== undefined
          && data.geometry_contract_version !== contract.geometryContractVersion) {
          problems.push(`${at} geometry_contract_version is ${data.geometry_contract_version}, `
            + `expected ${contract.geometryContractVersion}`);
        }
      }
    }
  }

  if (problems.length) throw new CoreError('BUNDLE_INVALID', { problems });

  return Object.freeze({
    bundleVersion: json.bundle_version || null,
    generatedBy: json.generated_by || null,
    scenarios: Object.freeze(scenarios),
    hasScenarios: Object.keys(scenarios).length > 0,
    raw: json,
  });
}

export function getScenario(bundle, endpointId, name = 'default') {
  const byName = bundle.scenarios[endpointId];
  if (!byName || !byName[name]) return null;
  return byName[name];
}

export function listScenarios(bundle, endpointId) {
  return Object.keys(bundle.scenarios[endpointId] || {});
}
