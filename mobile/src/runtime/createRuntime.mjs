/*
 * The runtime every screen receives: config + contract + one app/core client.
 *
 * Takes already-parsed JSON (the contract, and the generated fixture bundle in
 * fixture mode) so the same function runs under Metro, where both are bundled
 * `require`s, and under `node --test`, where a test reads them from disk.
 *
 * A screen never sees the transport. It calls
 *     runtime.client.call(endpointId, params, options)
 * and gets back one of the seven app/core screen states - fixture or live is
 * invisible to it, which is what lets V1-V4 be written once.
 */

import {
  createContract, createBundle, createClient, createFixtureTransport, listScenarios,
} from '../../../app/core/index.mjs';
import { MODE } from '../config.mjs';
import { createHttpTransport } from './httpTransport.mjs';

export class RuntimeError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.detail = detail;
  }
}

/*
 * Fixture mode only: a per-endpoint scenario override, so the seven states can
 * be shown on a phone without editing code (`10` §8, TC-MOBILE-STATE-001).
 * A screen that names a scenario explicitly keeps it; the override only
 * replaces an unnamed or 'default' request.
 */
function createScenarioOverrides(bundle) {
  const chosen = new Map();
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); };
  return Object.freeze({
    endpoints: () => Object.keys(bundle.scenarios).sort(),
    scenariosFor: (endpointId) => listScenarios(bundle, endpointId),
    get: (endpointId) => chosen.get(endpointId) || 'default',
    set(endpointId, name) {
      if (!listScenarios(bundle, endpointId).includes(name)) {
        throw new RuntimeError('UNKNOWN_SCENARIO', `${endpointId} has no fixture scenario "${name}"`);
      }
      if (name === 'default') chosen.delete(endpointId); else chosen.set(endpointId, name);
      emit();
    },
    clear() { chosen.clear(); emit(); },
    active: () => Object.fromEntries(chosen),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    pick(endpointId, requested) {
      return !requested || requested === 'default' ? (chosen.get(endpointId) || 'default') : requested;
    },
  });
}

export function createRuntime({ config, contractJson, bundleJson = null, fetchImpl, onTiming = null }) {
  if (!config || !config.mode) throw new RuntimeError('NO_CONFIG', 'createRuntime needs a resolved config');

  const contract = createContract(contractJson); // throws CoreError CONTRACT_INVALID on drift

  if (config.mode === MODE.FIXTURE) {
    if (!bundleJson) {
      throw new RuntimeError('NO_FIXTURE_BUNDLE',
        'fixture mode needs the generated bundle - run `npm run prepare-app` in mobile/');
    }
    const bundle = createBundle(contract, bundleJson); // throws CoreError BUNDLE_INVALID on drift
    const overrides = createScenarioOverrides(bundle);
    const base = createFixtureTransport(bundle);
    const transport = Object.freeze({
      kind: 'fixture',
      send: (resolved, options = {}) => base.send(resolved, {
        ...options, scenario: overrides.pick(resolved.endpointId, options.scenario),
      }),
    });
    return Object.freeze({
      mode: MODE.FIXTURE,
      config,
      contract,
      bundle,
      client: createClient(contract, transport),
      fixtureScenarios: overrides,
    });
  }

  // A live build with no backend URL is a configuration error the app shows
  // as such (App.js), never a client pointed at a guessed host.
  if (config.problem) throw new RuntimeError(config.problem.code, config.problem.message);

  const transport = createHttpTransport({
    baseUrl: config.apiBaseUrl,
    fetchImpl: fetchImpl ?? globalThis.fetch,
    timeoutMs: config.timeoutMs,
    onTiming,
  });
  return Object.freeze({
    mode: MODE.LIVE,
    config,
    contract,
    bundle: null,
    client: createClient(contract, transport),
    fixtureScenarios: null,
  });
}
