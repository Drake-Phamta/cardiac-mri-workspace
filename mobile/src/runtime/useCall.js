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
 *   - `view` is always an app/core screen state, as client.call returns it.
 *
 * Params are compared by value (JSON), so passing a new object literal on
 * every render does not refetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loading } from '../../../app/core/index.mjs';
import { createLatest } from './latest.mjs';

export default function useCall(client, endpointId, params = {}, { enabled = true, scenario } = {}) {
  const [view, setView] = useState(loading());
  const [epoch, setEpoch] = useState(0);
  const latest = useMemo(() => createLatest(), []);
  const key = JSON.stringify([endpointId, params, scenario || null]);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled || !client) return undefined;
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
