/*
 * A small state-based stack navigator. No navigation library: the app has
 * eight screens, one stack and a tab bar, and a reducer plus a header is
 * all of that. Pure - the React side (NavigatorView.js) only renders
 * `top(state)` and dispatches actions.
 *
 *   push(id, params[, returnParams])  open a screen on top (Case List -> Case Explorer)
 *   pop()                back; a no-op at the root      (Android back button)
 *   replace(id, params)  swap the top screen            (Case Explorer -> another case)
 *   reset(id, params)    one-screen stack               (a tab press)
 *
 * Every action validates the screen id and its required params against
 * screens.mjs. A push that omits caseId is a programming error and throws -
 * rendering SCR-03 with no case would be a screen inventing its subject.
 *
 * A covered screen UNMOUNTS, so what it shows when the user comes back is its
 * stack entry's params. `returnParams` (#78 QA N-8) are merged into the entry
 * the push COVERS, in the same action, keeping its key: SCR-03 hands SCR-04
 * the run, variant and slice on screen and gets them back on Back. Nothing
 * changes when the push does not happen (a leave guard said no).
 */

import { ROOT_SCREEN_ID, isScreenId, missingParams } from './screens.mjs';

export const NAV = Object.freeze({ PUSH: 'PUSH', POP: 'POP', REPLACE: 'REPLACE', RESET: 'RESET' });

// A deep stack on a phone is a leak, not a feature. Twenty is far beyond any
// path through the `10` §2 tree (Study -> Cases -> Explorer -> Error -> 3D).
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

// The covered entry with `returnParams` merged in: same key and screen, so it
// is the same entry (and the same guard slot), with what to show on return.
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
 * Leave guards (N-2). A screen with something to lose - V4's unsaved brush
 * edits on SCR-06, say - registers one with nav.setLeaveGuard(fn). Every
 * action that would take the user OFF that screen asks it first: pop (Back,
 * the Android back button), push (a new screen COVERS it - and a covered
 * screen UNMOUNTS in this navigator, its React state is gone), replace, and
 * reset (every tab press). The guard gets { type, screenId, params } and
 * answers true to leave, false to stay - or a Promise of either, e.g. after
 * a confirmation dialog. Anything but `true` stays. A guard belongs to the
 * stack entry that set it while that entry is on top: NavigatorView prunes
 * every other key, so a covered screen - unmounted, its edits gone with it -
 * leaves no guard behind to be asked on its behalf later (#77 QA N-7).
 *
 * One prompt at a time (#77 QA N-7): while a guard is being asked, any other
 * action that would ask one - a second back press, a tab - is refused at once
 * instead of opening a second dialog over the first.
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
 * The object a screen receives as `nav`. Bound to a dispatch so a screen can
 * call nav.push('SCR-03', { caseId }) without knowing the reducer exists.
 *
 * The route is validated HERE, before dispatch, so a bad push never reaches
 * the reducer inside a React render. It returns false and reports through
 * `onError` instead of throwing out of a tap handler: in a release build an
 * uncaught throw there is a crash, and a crash is not an honest state.
 *
 * Return value of every action: `true` / `false` when it was decided at once
 * (no guard on the current screen, or another guard prompt still open), or a
 * Promise of true / false when the current screen's leave guard had to be
 * asked.
 */
export function bindNav(dispatch, state, onError = null, guards = null) {
  const current = top(state);
  // Read at action time, not bind time: a screen usually sets its guard in an
  // effect, after the nav object it was rendered with already exists.
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
    hasLeaveGuard: () => Boolean(guardNow()),
    canGoBack: canGoBack(state),
    depth: state.stack.length,
  });
}
