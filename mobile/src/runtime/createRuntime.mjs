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
import { createImageStore } from '../imaging/imageStore.mjs';
import { createMaskStore } from '../imaging/maskStore.mjs';
import { bytesOrThrow, createContent } from './content.mjs';
import { createHttpTransport } from './httpTransport.mjs';
import { createNetLog } from './netLog.mjs';
import { createSliceCache } from './sliceCache.mjs';

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
      // No slice cache in fixture mode: the scenario picker can change an
      // endpoint's answer at any moment, and a cache would keep showing the
      // old one. Fixture answers are local and instant anyway.
      sliceClient: client,
      // No bytes exist behind any fixture URL: content.bytes answers
      // EMPTY_UNAVAILABLE FIXTURE_NO_BYTES, content.uri null, nothing is
      // fetched or decoded, and there is no network to account for - no
      // gesture log either (a fixture "0 bytes" line would read as a measured
      // cache hit).
      content: createContent({ contract, mode: MODE.FIXTURE }),
      maskStore: null,
      imageStore: null,
      netLog: null,
      fixtureScenarios: overrides,
    });
  }

  // A live build with no backend URL is a configuration error the app shows
  // as such (App.js), never a client pointed at a guessed host.
  if (config.problem) throw new RuntimeError(config.problem.code, config.problem.message);

  const doFetch = fetchImpl ?? globalThis.fetch;
  // Every live request - JSON API calls and artifact bytes - is reported to
  // the gesture log (L4: per-slice transfers only, revisits free).
  const netLog = createNetLog({ log, now });
  const transport = createHttpTransport({
    baseUrl: config.apiBaseUrl,
    fetchImpl: doFetch,
    timeoutMs: config.timeoutMs,
    now,
    onTiming: (t) => {
      netLog.record({ endpoint: t.endpointId, bytes: t.bytes, ms: t.ms, status: t.status });
      if (onTiming) onTiming(t);
    },
  });
  const client = createClient(contract, transport);
  // The ONE binary path (N-1): timeout, error mapping, checksum, netLog.
  const content = createContent({
    contract, mode: MODE.LIVE, baseUrl: config.apiBaseUrl, fetchImpl: doFetch, timeoutMs: config.timeoutMs, netLog, now,
  });
  return Object.freeze({
    mode: MODE.LIVE,
    config,
    contract,
    bundle: null,
    client,
    // Per-slice response cache (PR-CACHE-01 / DR-015), shared by every
    // screen for the life of the app, so a slice seen once is a cache hit
    // wherever it is seen again.
    sliceClient: createSliceCache(client),
    content,
    // MRI slice bytes -> data URI, cached per content-addressed URL; fetched
    // through content.bytes so every byte is checked and counted per gesture.
    imageStore: createImageStore({
      fetchBytes: (url, opts) => bytesOrThrow(content, url, { ...opts, kind: 'mri' }), now,
    }),
    // Decoded mask paths, keyed by content_url. The decoder is injected
    // (maskPng.js over fast-png, from loadRuntime.js) so this file and its
    // tests need no node_modules.
    maskStore: decodeMask
      ? createMaskStore({
        fetchBytes: (url, opts) => bytesOrThrow(content, url, { ...opts, kind: 'mask' }), decode: decodeMask, now,
      })
      : null,
    netLog,
    fixtureScenarios: null,
  });
}
