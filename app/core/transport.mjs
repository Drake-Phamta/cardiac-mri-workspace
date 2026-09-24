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

import { CoreError } from './contract.mjs';
import { resolveEndpoint, assertWritePreconditions } from './endpoints.mjs';
import { classifyError } from './errors.mjs';
import * as screen from './screenState.mjs';
import { getScenario } from './fixtures/loader.mjs';

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
  for (const field of resolved.responseFields) {
    if (field in data) continue;
    if (isList && Array.isArray(data.items) && data.items.length > 0
      && data.items.every((row) => row && typeof row === 'object' && field in row)) continue;
    problems.push(`${resolved.endpointId} response is missing ${field}`);
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
