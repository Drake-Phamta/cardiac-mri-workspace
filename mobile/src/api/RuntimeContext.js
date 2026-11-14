/*
 * Makes the runtime (config + contract + app/core client) available to every
 * screen without threading it through props. Screens also receive it as the
 * `runtime` prop from the navigator; the hook exists for nested components.
 */

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveConfig, MODE } from '../config.mjs';
import { decodeMaskPng } from '../lib/maskPng';
import { createRuntime } from './runtime.mjs';
import { loading } from './states.mjs';
import { createLatest } from './client.mjs';

const RuntimeContext = createContext(null);

export function RuntimeProvider({ runtime, children }) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  return useContext(RuntimeContext);
}

/*
 * Device-side loading: the contract and the generated inputs are bundled
 * `require`s here, which is the one thing that differs from `node --test`
 * (where a test reads the same JSON from disk). Everything else is
 * createRuntime.mjs.
 *
 * src/generated/ is written by scripts/prepare.mjs and is gitignored. If it
 * is missing, Metro fails the bundle with "Unable to resolve
 * ./generated/buildConfig.json" - run `npm run prepare-app` in mobile/.
 */

/*
 * Returns { runtime } or { error } - never throws, so App.js can render a
 * build that carries a drifted contract as a blocking screen instead of a
 * white crash.
 */
export function loadRuntime() {
  // Metro bundles every require('...') it finds; inside the function, Node tests that import this file never run them.
  const contractJson = require('../../../contracts/api/contract.json');
  const buildConfigJson = require('../generated/buildConfig.json');
  const bundleJson = require('../generated/api_bundle.json');
  try {
    const config = resolveConfig(buildConfigJson);
    const runtime = createRuntime({
      config,
      contractJson,
      bundleJson: config.mode === MODE.FIXTURE ? bundleJson : null,
      fetchImpl: global.fetch,
      // The app's one mask PNG decoder (fast-png adapter), injected so the
      // runtime's own logic stays testable without node_modules.
      decodeMask: decodeMaskPng,
      // Live HTTP timings go to logcat under a fixed tag, without payload
      // bytes (TC-SEC-003), so device evidence can be extracted later.
      onTiming: (t) => console.log(`CMW_HTTP ${JSON.stringify({ ...t, ms: Math.round(t.ms) })}`),
    });
    return { runtime, error: null };
  } catch (err) {
    return {
      runtime: null,
      error: {
        name: err && err.name,
        code: err && err.code,
        message: (err && err.message) || String(err),
        problems: err && err.detail && Array.isArray(err.detail.problems) ? err.detail.problems : [],
      },
    };
  }
}

/*
 * useCall - the shell's one way for a screen to call an endpoint (N-6).
 *
 *   const { view, refetch } = useCall(runtime.client, 'case_list', { study_id }, { enabled: true });
 *   <StateView view={view} onAction={(id) => (id === 'RETRY' || id === 'REFRESH') && refetch()}>…
 *
 *   - latest wins: a new call (params changed, refetch) aborts the previous
 *     one through its AbortSignal and only the newest answer is ever shown;
 *   - LOADING on every (re)fetch - a refetch never keeps the old data on screen
 *     under a request for new data;
 *   - aborted on unmount, so a screen that is gone stops its requests;
 *   - aborted when `enabled` turns false (DR-021 rule 2, #77 QA N-8): a call
 *     started while enabled never lands after the screen said it is not wanted;
 *   - `view` is always an app/core screen state, as client.call returns it.
 *
 * Params are compared by value (JSON), so passing a new object literal on
 * every render does not refetch.
 */

export function useCall(client, endpointId, params = {}, { enabled = true, scenario } = {}) {
  const [view, setView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const latest = useMemo(() => createLatest(), []);
  const key = JSON.stringify([endpointId, params, scenario || null]);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled || !client) { latest.abort(); return undefined; }
    const ticket = latest.start();
    setView(loading());
    const options = { signal: ticket.signal };
    if (scenario) options.scenario = scenario;
    client.call(endpointId, paramsRef.current, options).then((v) => {
      if (ticket.isLatest()) setView(v);
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, enabled, epoch, latest]);

  useEffect(() => () => latest.abort(), [latest]);

  const refetch = useCallback(() => setEpoch((n) => n + 1), []);
  return { view, refetch };
}
