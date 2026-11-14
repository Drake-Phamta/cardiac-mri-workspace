/*
 * Holds a V3 state model's snapshot in React state.
 *
 * The models (app/verticals/v3_study_and_compare) are async factories that
 * return frozen snapshots wrapping an app/core screen state. This hook is the
 * only place a V3 screen awaits one:
 *   - the LOADING snapshot is shown as soon as a request starts, so a refresh
 *     never leaves the previous numbers on screen as if they were current
 *     (`10` section 8: stale content is not silently mixed);
 *   - only the LATEST request may update the screen - an older answer that
 *     arrives late is dropped, not drawn over a newer one;
 *   - a model that throws becomes a FATAL_INVALID state with the message, not
 *     an unhandled promise rejection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fatalInvalid, RECOVERY } from '../../../../app/core/index.mjs';

function failed(err) {
  return Object.freeze({
    view: fatalInvalid({
      code: 'SCREEN_ERROR',
      safeMessage: 'The screen could not load its data.',
      detail: { problems: [String(err && err.message)] },
    }, [RECOVERY.BACK]),
  });
}

export function useSnapshot(model) {
  const [snap, setSnap] = useState(() => model.current);
  const alive = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback((start) => {
    latest.current += 1;
    const mine = latest.current;
    let pending;
    try {
      pending = start();
    } catch (err) {
      setSnap(failed(err));
      return;
    }
    setSnap(model.current);
    Promise.resolve(pending).then(
      (next) => { if (alive.current && mine === latest.current) setSnap(next); },
      (err) => { if (alive.current && mine === latest.current) setSnap(failed(err)); },
    );
  }, [model]);

  return [snap, run, setSnap];
}
