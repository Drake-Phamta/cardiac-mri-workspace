/*
 * A small stack navigator as a plain reducer, no navigation library: push, pop (Android back), replace,
 * and reset (a tab press). Every action checks the screen id and its required params against routes.mjs.
 * A covered screen unmounts, so push can pass returnParams for the covered entry to show on return.
 */

import { ROOT_SCREEN_ID, isScreenId, missingParams } from './routes.mjs';

export const NAV = Object.freeze({ PUSH: 'PUSH', POP: 'POP', REPLACE: 'REPLACE', RESET: 'RESET' });

// Far deeper than any real path (Study -> Cases -> Explorer -> Error -> 3D); a deeper stack is a leak.
export const MAX_DEPTH = 20;

export class NavError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'NavError';
    this.code = code;
    this.detail = detail;
  }
}

function entry(screenId, params, seq) {
  if (!isScreenId(screenId)) throw new NavError('UNKNOWN_SCREEN', `unknown screen id ${screenId}`, { screenId });
  const clean = params && typeof params === 'object' ? { ...params } : {};
  const missing = missingParams(screenId, clean);
  if (missing.length) {
    throw new NavError('MISSING_PARAMS', `${screenId} needs ${missing.join(', ')}`, { screenId, missing });
  }
  return Object.freeze({ key: `${screenId}#${seq}`, screenId, params: Object.freeze(clean) });
}

export function initialNavState(screenId = ROOT_SCREEN_ID, params = {}) {
  return Object.freeze({ stack: Object.freeze([entry(screenId, params, 1)]), seq: 1 });
}

// Keeps the covered entry's key, so it stays the same entry (and guard slot) with the new params.
function withReturnParams(covered, returnParams) {
  if (!returnParams || typeof returnParams !== 'object') return covered;
  return Object.freeze({ ...covered, params: Object.freeze({ ...covered.params, ...returnParams }) });
}

export function navReducer(state, action) {
  const seq = state.seq + 1;
  switch (action.type) {
    case NAV.PUSH: {
      const next = entry(action.screenId, action.params, seq);
      const below = state.stack.slice(0, -1);
      const covered = withReturnParams(state.stack[state.stack.length - 1], action.returnParams);
      const stack = [...below, covered, next];
      if (stack.length > MAX_DEPTH) stack.splice(0, stack.length - MAX_DEPTH);
      return Object.freeze({ stack: Object.freeze(stack), seq });
    }
    case NAV.POP: {
      if (state.stack.length <= 1) return state;
      return Object.freeze({ stack: Object.freeze(state.stack.slice(0, -1)), seq: state.seq });
    }
    case NAV.REPLACE: {
      const next = entry(action.screenId, action.params, seq);
      return Object.freeze({ stack: Object.freeze([...state.stack.slice(0, -1), next]), seq });
    }
    case NAV.RESET: {
      return Object.freeze({ stack: Object.freeze([entry(action.screenId, action.params, seq)]), seq });
    }
    default:
      throw new NavError('UNKNOWN_ACTION', `unknown navigation action ${action && action.type}`);
  }
}

export const top = (state) => state.stack[state.stack.length - 1];
export const canGoBack = (state) => state.stack.length > 1;

// Throws NavError for an unknown id or a missing required param.
export function validateRoute(screenId, params) {
  entry(screenId, params, 0);
}

/*
 * Leave guards: a screen with unsaved work (e.g. brush edits) sets one with nav.setLeaveGuard(fn), and every
 * action that would leave the screen asks it first. fn gets { type, screenId, params } and returns true, or
 * a Promise of true, to leave. Only one prompt is open at a time, so a guard's Promise must settle on every
 * path, dialog dismiss included, or every later action on that screen is refused.
 */
export function createGuards() {
  const map = new Map();
  let busy = false;
  return Object.freeze({
    get: (key) => map.get(key) || null,
    set(key, fn) { if (typeof fn === 'function') map.set(key, fn); else map.delete(key); },
    prune(keys) { for (const k of [...map.keys()]) if (!keys.includes(k)) map.delete(k); },
    get size() { return map.size; },
    // hold() -> true when this caller may ask a guard now; release() when it has its answer.
    hold() { if (busy) return false; busy = true; return true; },
    release() { busy = false; },
    get busy() { return busy; },
  });
}

/*
 * The nav object a screen receives, e.g. nav.push('SCR-03', { caseId }). A bad route returns false and goes
 * to onError before dispatch, instead of throwing from a tap handler (a crash in a release build).
 * Each action returns true or false, or a Promise of it when a leave guard had to be asked.
 * setContext({ caseId, runId, variant }) tells the header what the screen shows when the route params do not say
 * it (SCR-03 picks its run itself); onContext(key, context) receives it.
 */
export function bindNav(dispatch, state, onError = null, guards = null, onContext = null) {
  const current = top(state);
  // Read when the action runs: a screen usually sets its guard in an effect, after this object exists.
  const guardNow = () => (guards ? guards.get(current.key) : null);

  const leave = (action) => {
    const guard = guardNow();
    if (!guard) { dispatch(action); return true; }
    if (!guards.hold()) return false; // a prompt is already open: this action stays
    return Promise.resolve()
      .then(() => guard({ type: action.type, screenId: action.screenId ?? null, params: action.params ?? null }))
      .then((ok) => {
        guards.release();
        if (ok !== true) return false;
        dispatch(action);
        return true;
      }, (err) => {
        guards.release();
        if (onError) onError(err);
        return false;
      });
  };

  const routed = (type, screenId, params, returnParams = null) => {
    try {
      validateRoute(screenId, params);
    } catch (err) {
      if (onError) onError(err);
      return false;
    }
    return leave(returnParams ? { type, screenId, params, returnParams } : { type, screenId, params });
  };

  return Object.freeze({
    push: (screenId, params, returnParams) => routed(NAV.PUSH, screenId, params, returnParams),
    replace: (screenId, params) => routed(NAV.REPLACE, screenId, params),
    reset: (screenId, params) => routed(NAV.RESET, screenId, params),
    pop: () => (canGoBack(state) ? leave({ type: NAV.POP }) : false),
    setLeaveGuard: (fn) => { if (guards) guards.set(current.key, fn); },
    setContext: (context) => { if (onContext) onContext(current.key, context && typeof context === 'object' ? { ...context } : null); },
    hasLeaveGuard: () => Boolean(guardNow()),
    canGoBack: canGoBack(state),
    depth: state.stack.length,
  });
}
