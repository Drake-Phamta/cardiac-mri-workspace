/*
 * The one call a vertical makes, and the one place a response is checked.
 *
 * Today the only transport is the fixture bundle. That is deliberate: `12`
 * requires every screen to be demonstrable without a backend, and the backend
 * does not exist yet. A real HTTP transport is a second implementation of the
 * same `send(resolved)` shape, and `createClient` will take it without any
 * vertical changing a line - which is the whole reason the screens call
 * `client.call(endpointId, ...)` instead of a fetch.
 *
 * Every response goes through validateResponse before it reaches a screen, so
 * a fixture that drifts from the contract fails as a FATAL_INVALID with the
 * exact field named, not as an undefined three components deeper.
 */

import { CoreError, resolveEndpoint, assertWritePreconditions, parseEndpointPath } from './contract.mjs';
import * as screen from './states.mjs';
import { classifyError } from './states.mjs';

export function validateResponse(contract, resolved, response) {
  const problems = [];
  if (response.status >= 400) {
    const code = (response.error || {}).code;
    if (!code) problems.push(`${resolved.endpointId} returned ${response.status} with no error code`);
    else if (!resolved.allowedErrors.has(code)) {
      problems.push(`${resolved.endpointId} returned ${code}, which the contract does not allow here`);
    }
    return problems;
  }

  const data = response.data;
  if (!data || typeof data !== 'object') {
    problems.push(`${resolved.endpointId} returned ${response.status} with no data object`);
    return problems;
  }

  const isList = resolved.responseFields.includes('items');
  if (isList && resolved.rowFields) {
    // Contract v1.0.0 list rule: top-level fields = response_fields minus
    // row_fields minus items, present on the object; every row carries every
    // row field, which an empty page (items: []) satisfies vacuously.
    if (!Array.isArray(data.items)) problems.push(`${resolved.endpointId} response is missing items`);
    for (const field of resolved.responseFields) {
      if (field === 'items' || resolved.rowFields.includes(field)) continue;
      if (!(field in data)) problems.push(`${resolved.endpointId} response is missing ${field}`);
    }
    (Array.isArray(data.items) ? data.items : []).forEach((row, i) => {
      for (const field of resolved.rowFields) {
        if (!row || typeof row !== 'object' || !(field in row)) {
          problems.push(`${resolved.endpointId} items[${i}] is missing ${field}`);
        }
      }
    });
  } else {
    // A contract without row_fields: the pre-v1.0 rule, kept for it alone.
    for (const field of resolved.responseFields) {
      if (field in data) continue;
      if (isList && Array.isArray(data.items) && data.items.length > 0
        && data.items.every((row) => row && typeof row === 'object' && field in row)) continue;
      problems.push(`${resolved.endpointId} response is missing ${field}`);
    }
  }

  if (resolved.geometryResponse) {
    for (const field of contract.geometryFields) {
      if (!(field in data)) problems.push(`${resolved.endpointId} response is missing geometry field ${field}`);
    }
    if (data.geometry_contract_version !== undefined
      && data.geometry_contract_version !== contract.geometryContractVersion) {
      problems.push(`${resolved.endpointId} geometry version is ${data.geometry_contract_version}, `
        + `expected ${contract.geometryContractVersion}`);
    }
  }
  return problems;
}

export function createFixtureTransport(bundle) {
  return {
    kind: 'fixture',
    async send(resolved, options) {
      const scenario = getScenario(bundle, resolved.endpointId, options.scenario || 'default');
      if (!scenario) return { status: 0, missingScenario: true };
      return scenario.response;
    },
  };
}

/*
 * The client returns a screen state, never a raw response. A vertical that
 * gets a state cannot forget to handle one - there is nothing else to render.
 */
export function createClient(contract, transport) {
  return {
    contract,
    transportKind: transport.kind,

    resolve(endpointId, params) {
      return resolveEndpoint(contract, endpointId, params);
    },

    async call(endpointId, params = {}, options = {}) {
      let resolved;
      try {
        resolved = resolveEndpoint(contract, endpointId, params);
        if (options.body !== undefined) assertWritePreconditions(contract, endpointId, options.body);
      } catch (err) {
        if (err instanceof CoreError) {
          return screen.fatalInvalid({ code: err.code, safeMessage: err.message, detail: err.detail });
        }
        throw err;
      }

      let response;
      try {
        response = await transport.send(resolved, options);
      } catch (err) {
        return screen.stateForError(contract, 'TRANSPORT_UNREACHABLE', { cause: err?.message || null });
      }

      if (response && response.missingScenario) {
        return screen.stateForError(contract, 'FIXTURE_SCENARIO_MISSING', { endpointId });
      }

      const problems = validateResponse(contract, resolved, response);
      if (problems.length) {
        return screen.fatalInvalid({
          code: 'CONTRACT_DRIFT',
          safeMessage: `The response for ${endpointId} does not match the contract.`,
          detail: { problems },
        });
      }

      if (response.status >= 400) {
        const code = response.error.code;
        return screen.stateForError(contract, code, {
          ...options.context,
          httpStatus: response.status,
          requestId: response.error.request_id || null,
        });
      }

      return screen.success(Object.freeze({
        endpointId,
        url: resolved.url,
        status: response.status,
        ...response.data,
      }));
    },
  };
}

// Kept separate from createClient so a screen can classify an error it already
// holds - a WebView bridge message, say - without a round trip.
export function classify(contract, code, context) {
  return classifyError(contract, code, context);
}

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

export const BUNDLE_PATH = 'mobile/src/generated/api_bundle.json';

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
      const rowFields = Array.isArray(endpoint.row_fields) ? endpoint.row_fields : null;
      if (isList && rowFields) {
        // v1.0.0: top-level fields on the object, row fields on every row; an
        // empty page satisfies the row fields vacuously.
        if (!Array.isArray(data.items)) problems.push(`${at} is missing response field items`);
        for (const field of endpoint.response_fields) {
          if (field === 'items' || rowFields.includes(field)) continue;
          if (!(field in data)) problems.push(`${at} is missing response field ${field}`);
        }
        (Array.isArray(data.items) ? data.items : []).forEach((row, i) => {
          for (const field of rowFields) {
            if (!row || typeof row !== 'object' || !(field in row)) {
              problems.push(`${at} is missing response field ${field} on items[${i}]`);
            }
          }
        });
      } else {
        for (const field of endpoint.response_fields || []) {
          if (field in data) continue;
          if (isList && rowFieldsPresent(data.items, field)) continue;
          problems.push(`${at} is missing response field ${field}`);
        }
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

/*
 * Latest-wins request tracking, the pure core of useCall (N-6).
 *
 * Every start() aborts the request before it (its AbortSignal fires, which
 * httpTransport and content.bytes both honour) and hands out a ticket; only
 * the newest ticket may write a result. abort() cancels whatever is in
 * flight (unmount). A screen that uses this cannot draw a stale answer over
 * a newer one, and does not leave requests running for a screen that is gone.
 */

export function createLatest({ AbortControllerImpl = globalThis.AbortController } = {}) {
  let seq = 0;
  let controller = null;

  function abort() {
    if (controller) controller.abort();
    controller = null;
  }

  return Object.freeze({
    start() {
      abort();
      seq += 1;
      const mine = seq;
      controller = AbortControllerImpl ? new AbortControllerImpl() : null;
      const signal = controller ? controller.signal : null;
      return Object.freeze({
        seq: mine,
        signal,
        isLatest: () => mine === seq && !(signal && signal.aborted),
      });
    },
    abort() { abort(); seq += 1; },
    get seq() { return seq; },
  });
}

/*
 * Runs `call(signal)` as the latest request and resolves to
 * { view, stale } - `stale` true when a newer start() or an abort() happened
 * while it was in flight, in which case `view` must be dropped.
 */
export async function runLatest(latest, call) {
  const ticket = latest.start();
  const view = await call(ticket.signal);
  return { view, stale: !ticket.isLatest() };
}
