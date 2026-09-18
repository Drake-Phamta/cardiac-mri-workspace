/*
 * The seven screen states every vertical renders, and the only constructors
 * for them.
 *
 * A screen never assembles a state object literal. It calls one of these, so
 * four invariants hold in four verticals without four people remembering them:
 *
 *   - `data` is non-null ONLY in SUCCESS. An error state carrying half a
 *     payload is how a stale mask ends up drawn under an error banner.
 *   - FATAL_INVALID never offers RETRY. `10` section 8 blocks the view on a bad
 *     reference or an unvalidated geometry; retrying re-renders the same lie.
 *   - EMPTY_UNAVAILABLE always carries a reason. "No data" with no reason is
 *     indistinguishable from a bug, and `10` section 7 requires the screen to
 *     say that the artifact is absent, not to show an empty chart.
 *   - Every non-SUCCESS state carries `actions`, possibly empty. An empty list
 *     is a decision ("nothing the user can do here"), not an oversight.
 */

import { CoreError } from './contract.mjs';
import { STATE, RECOVERY, classifyError } from './errors.mjs';

export { STATE, RECOVERY };

export const ALL_STATES = Object.freeze(Object.values(STATE));

function make(state, extra) {
  return Object.freeze({
    state,
    data: null,
    error: null,
    reason: null,
    actions: Object.freeze([]),
    progress: null,
    ...extra,
  });
}

export function loading(progress = null) {
  return make(STATE.LOADING, { progress });
}

export function processing(progress = null, actions = []) {
  return make(STATE.PROCESSING, { progress, actions: Object.freeze([...actions]) });
}

export function success(data) {
  if (data === null || data === undefined) {
    throw new CoreError('SUCCESS_WITHOUT_DATA', {});
  }
  return make(STATE.SUCCESS, { data });
}

export function emptyUnavailable(reason, actions = []) {
  if (!reason) throw new CoreError('EMPTY_WITHOUT_REASON', {});
  return make(STATE.EMPTY_UNAVAILABLE, { reason, actions: Object.freeze([...actions]) });
}

export function recoverableError(error, actions = [RECOVERY.RETRY]) {
  return make(STATE.RECOVERABLE_ERROR, { error, reason: error?.code || null, actions: Object.freeze([...actions]) });
}

export function fatalInvalid(error, actions = [RECOVERY.BACK]) {
  const list = actions.filter((a) => a !== RECOVERY.RETRY);
  return make(STATE.FATAL_INVALID, { error, reason: error?.code || null, actions: Object.freeze(list) });
}

export function staleMismatch(error, actions = [RECOVERY.REFRESH]) {
  // RETRY on a stale write is last-write-wins, which revision_rules forbids.
  const list = actions.filter((a) => a !== RECOVERY.RETRY);
  return make(STATE.STALE_MISMATCH, { error, reason: error?.code || null, actions: Object.freeze(list) });
}

/*
 * The single entry point a screen uses on a failed call: classify, then build
 * the matching state. Nothing else in a vertical should branch on an error
 * code, and test_screen_state.mjs walks all 15 codes through this function.
 */
export function stateForError(contract, code, context = {}) {
  const classified = classifyError(contract, code, context);
  switch (classified.state) {
    case STATE.PROCESSING:
      return processing(context.progress ?? null, classified.actions);
    case STATE.EMPTY_UNAVAILABLE:
      return Object.freeze({
        ...emptyUnavailable(classified.code, classified.actions), error: classified,
      });
    case STATE.RECOVERABLE_ERROR:
      return recoverableError(classified, classified.actions);
    case STATE.STALE_MISMATCH:
      return staleMismatch(classified, classified.actions);
    case STATE.FATAL_INVALID:
    default:
      return fatalInvalid(classified, classified.actions);
  }
}

export function isTerminal(view) {
  return view.state !== STATE.LOADING && view.state !== STATE.PROCESSING;
}

export function canRetry(view) {
  return view.actions.includes(RECOVERY.RETRY);
}
