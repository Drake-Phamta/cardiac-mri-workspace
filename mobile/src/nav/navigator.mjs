/*
 * A small state-based stack navigator. No navigation library: the app has
 * eight screens, one stack and a tab bar, and a reducer plus a header is
 * all of that. Pure - the React side (NavigatorView.js) only renders
 * `top(state)` and dispatches actions.
 *
 *   push(id, params)     open a screen on top           (Case List -> Case Explorer)
 *   pop()                back; a no-op at the root      (Android back button)
 *   replace(id, params)  swap the top screen            (Case Explorer -> another case)
 *   reset(id, params)    one-screen stack               (a tab press)
 *
 * Every action validates the screen id and its required params against
 * screens.mjs. A push that omits caseId is a programming error and throws -
 * rendering SCR-03 with no case would be a screen inventing its subject.
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

export function navReducer(state, action) {
  const seq = state.seq + 1;
  switch (action.type) {
    case NAV.PUSH: {
      const next = entry(action.screenId, action.params, seq);
      const stack = [...state.stack, next];
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
 * The object a screen receives as `nav`. Bound to a dispatch so a screen can
 * call nav.push('SCR-03', { caseId }) without knowing the reducer exists.
 *
 * The route is validated HERE, before dispatch, so a bad push never reaches
 * the reducer inside a React render. It returns false and reports through
 * `onError` instead of throwing out of a tap handler: in a release build an
 * uncaught throw there is a crash, and a crash is not an honest state.
 */
export function bindNav(dispatch, state, onError = null) {
  const guarded = (type, screenId, params) => {
    try {
      validateRoute(screenId, params);
    } catch (err) {
      if (onError) onError(err);
      return false;
    }
    dispatch({ type, screenId, params });
    return true;
  };
  return Object.freeze({
    push: (screenId, params) => guarded(NAV.PUSH, screenId, params),
    replace: (screenId, params) => guarded(NAV.REPLACE, screenId, params),
    reset: (screenId, params) => guarded(NAV.RESET, screenId, params),
    pop: () => { if (!canGoBack(state)) return false; dispatch({ type: NAV.POP }); return true; },
    canGoBack: canGoBack(state),
    depth: state.stack.length,
  });
}
