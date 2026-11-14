/*
 * React side of the runtime: RuntimeProvider and useRuntime, loadRuntime() for the phone, and useCall.
 * Screens also get the runtime as a prop from the navigator; useRuntime is for nested components.
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
 * Builds the runtime on the phone from bundled JSON. src/generated/ is made by `npm run prepare-app`;
 * without it Metro fails with "Unable to resolve ./generated/buildConfig.json".
 * Returns { runtime } or { error } and never throws, so App.js shows a blocking screen, not a crash.
 */
export function loadRuntime() {
  // Metro still bundles these requires; inside the function, Node tests that import this file never run them.
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
      decodeMask: decodeMaskPng,
      // HTTP timings go to logcat under a fixed tag, with sizes but never the payload.
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
 * useCall: how a screen calls an endpoint. Each new call aborts the previous one and shows LOADING, and
 * only the newest answer is shown. It also aborts on unmount and when enabled turns false.
 * Params are compared as JSON, so a new object literal on each render does not refetch.
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
