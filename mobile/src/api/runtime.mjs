/*
 * Builds the runtime every screen receives: contract, client, caches and network log.
 * A screen only calls runtime.client.call(...) and gets a screen state, so fixture or live mode is hidden.
 * It takes already-parsed JSON, so Metro (bundled require) and Node tests (read from disk) share it.
 */

import { createContract } from './contract.mjs';
import { createBundle, listScenarios, createClient, createFixtureTransport } from './client.mjs';
import { MODE } from '../config.mjs';
import { createImageStore, createMaskStore, createSliceCache } from './cache.mjs';
import { bytesOrThrow, createContent } from './content.mjs';
import { createHttpTransport, createNetLog } from './http.mjs';

export class RuntimeError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.detail = detail;
  }
}

// Fixture mode: choose a scenario per endpoint on the phone, to show every screen state without code
// changes. It only replaces an unnamed or 'default' scenario; one a screen names itself is kept.
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

export function createRuntime({
  config, contractJson, bundleJson = null, fetchImpl, onTiming = null, decodeMask = null,
  log = (line) => console.log(line), now = () => Date.now(),
}) {
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
    const client = createClient(contract, transport);
    return Object.freeze({
      mode: MODE.FIXTURE,
      config,
      contract,
      bundle,
      client,
      // No cache: the scenario picker can change an answer at any time.
      sliceClient: client,
      // Fixture URLs have no bytes behind them, so nothing is fetched and there is no network log.
      content: createContent({ contract, mode: MODE.FIXTURE }),
      maskStore: null,
      imageStore: null,
      netLog: null,
      fixtureScenarios: overrides,
    });
  }

  // Live mode without a backend URL is shown as a config error (App.js), never sent to a guessed host.
  if (config.problem) throw new RuntimeError(config.problem.code, config.problem.message);

  const doFetch = fetchImpl ?? globalThis.fetch;
  // Every live request (API calls and artifact bytes) goes to the network log,
  // under the gesture that was open when it was sent.
  const netLog = createNetLog({ log, now });
  const transport = createHttpTransport({
    baseUrl: config.apiBaseUrl,
    fetchImpl: doFetch,
    timeoutMs: config.timeoutMs,
    now,
    onStart: () => netLog.openSeq,
    onTiming: ({ start, ...t }) => {
      netLog.record({ endpoint: t.endpointId, bytes: t.bytes, ms: t.ms, status: t.status, seq: start });
      if (onTiming) onTiming(t);
    },
  });
  const client = createClient(contract, transport);
  const content = createContent({
    contract, mode: MODE.LIVE, baseUrl: config.apiBaseUrl, fetchImpl: doFetch, timeoutMs: config.timeoutMs, netLog, now,
  });
  return Object.freeze({
    mode: MODE.LIVE,
    config,
    contract,
    bundle: null,
    client,
    // One response cache for the whole app, so a slice seen once is a hit on any screen.
    sliceClient: createSliceCache(client),
    content,
    imageStore: createImageStore({
      fetchBytes: (url, opts) => bytesOrThrow(content, url, { ...opts, kind: 'mri' }), now,
    }),
    // The mask decoder (maskPng.js) is passed in, so this file and its tests need no node_modules.
    maskStore: decodeMask
      ? createMaskStore({
        fetchBytes: (url, opts) => bytesOrThrow(content, url, { ...opts, kind: 'mask' }), decode: decodeMask, now,
      })
      : null,
    netLog,
    fixtureScenarios: null,
  });
}
