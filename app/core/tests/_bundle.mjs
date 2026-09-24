/*
 * Builds a bundle for the tests, DERIVED FROM THE CONTRACT.
 *
 * fixture_rules.handwritten_fixtures_allowed is false, so nothing here is
 * typed out by hand: every scenario is generated from
 * contract["endpoints"][*], exactly as Trung's generator will. That also makes
 * these tests a live check on FORMAT.md - if the format asks for something the
 * contract does not supply, this file cannot produce it.
 */

import { parseEndpointPath } from '../endpoints.mjs';

const SAMPLE = {
  slice_index: 7,
  experiment_ids: ['EXP-U-100', 'EXP-D-100'],
  variant: 'RAW',
  mask_id: 'MASK_0001',
};

function paramValue(token) {
  if (token in SAMPLE) return SAMPLE[token];
  return `X_${token}`;
}

function fieldValue(field, contract) {
  switch (field) {
    case 'geometry_contract_version': return contract.geometryContractVersion;
    case 'geometry_validation_status': return 'VALIDATED';
    case 'shape': return [576, 576, 88];
    case 'index_convention': return 'x=column,y=row,z=slice';
    case 'spacing': return [1.25, 1.25, 8.0];
    case 'origin': return [0, 0, 0];
    case 'direction': return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    case 'slice_index': return SAMPLE.slice_index;
    case 'prediction_variant': return SAMPLE.variant;
    case 'comparable': return true;
    case 'status': return 'SUCCEEDED';
    default: return `${field}_value`;
  }
}

export function buildBundle(contract, { endpointIds = null } = {}) {
  const ids = endpointIds ?? [...contract.endpointsById.keys()];
  const scenarios = {};

  for (const id of ids) {
    const endpoint = contract.endpointsById.get(id);
    const parsed = parseEndpointPath(endpoint.path);
    const params = {};
    for (const t of [...parsed.pathTokens, ...parsed.queryTokens.map((q) => q.token)]) {
      params[t] = paramValue(t);
    }

    const fields = endpoint.response_fields || [];
    const isList = fields.includes('items');
    const data = {};
    if (isList) {
      // Row fields go on every element of items, top-level fields stay on top.
      const row = {};
      for (const f of fields) {
        if (f === 'items') continue;
        if (['next_page', 'mode', 'metric_version', 'prediction_variant', 'evaluation_population'].includes(f)) {
          data[f] = fieldValue(f, contract);
        } else {
          row[f] = fieldValue(f, contract);
        }
      }
      data.items = [row, { ...row }];
    } else {
      for (const f of fields) data[f] = fieldValue(f, contract);
    }
    if (endpoint.geometry_response === true) {
      for (const f of contract.geometryFields) data[f] = fieldValue(f, contract);
    }

    scenarios[id] = {
      default: { request: { params, body: null }, response: { status: 200, data } },
    };

    // One error scenario per endpoint, using that endpoint's own first code at
    // that code's own http_status.
    const code = endpoint.errors[0];
    scenarios[id].error_case = {
      request: { params, body: null },
      response: {
        status: contract.errorsByCode.get(code).httpStatus,
        error: { code, message: contract.errorsByCode.get(code).messageTemplate, request_id: 'req_0001', details: null },
      },
    };
  }

  return {
    bundle: 'api_contract_11_fixture_bundle',
    bundle_version: 'v0-test',
    contract: contract.contract,
    contract_version: contract.contractVersion,
    base_path: contract.basePath,
    geometry: {
      geometry_contract_version: contract.geometryContractVersion,
      geometry_validation_status: 'VALIDATED',
    },
    generated_by: 'app/core/tests/_bundle.mjs',
    scenarios,
  };
}
