/*
 * Maps the 15 contract error codes to a screen state and the actions a user may take (spec 10 §7-8).
 * A missing artifact is UNAVAILABLE (never an empty chart or a zero mask), a bad reference or an
 * unvalidated geometry blocks the view, and a stale write never offers RETRY.
 */

import { CoreError } from './contract.mjs';

export const STATE = Object.freeze({
  LOADING: 'LOADING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  EMPTY_UNAVAILABLE: 'EMPTY_UNAVAILABLE',
  RECOVERABLE_ERROR: 'RECOVERABLE_ERROR',
  FATAL_INVALID: 'FATAL_INVALID',
  STALE_MISMATCH: 'STALE_MISMATCH',
});

export const RECOVERY = Object.freeze({
  RETRY: 'RETRY',
  REFRESH: 'REFRESH',
  REAUTH: 'REAUTH',
  BACK: 'BACK',
  VIEW_FAILURE: 'VIEW_FAILURE',
});

const MAP = Object.freeze({
  CASE_NOT_FOUND: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  SLICE_OUT_OF_RANGE: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  ARTIFACT_NOT_FOUND: { state: STATE.EMPTY_UNAVAILABLE, actions: [RECOVERY.REFRESH] },
  GROUND_TRUTH_UNAVAILABLE: { state: STATE.EMPTY_UNAVAILABLE, actions: [] },
  INVALID_REVIEW_TRANSITION: { state: STATE.RECOVERABLE_ERROR, actions: [RECOVERY.REFRESH] },
  STALE_REVISION: { state: STATE.STALE_MISMATCH, actions: [RECOVERY.REFRESH] },
  IMMUTABLE_ARTIFACT: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  GEOMETRY_NOT_VALIDATED: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  GEOMETRY_MISMATCH: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  RUN_NOT_DEPLOYABLE: { state: STATE.EMPTY_UNAVAILABLE, actions: [] },
  RUN_NOT_SUCCEEDED: { state: STATE.EMPTY_UNAVAILABLE, actions: [RECOVERY.REFRESH] },
  NON_COMPARABLE_EXPERIMENTS: { state: STATE.EMPTY_UNAVAILABLE, actions: [] },
  ANALYSIS_FAILED: { state: STATE.FATAL_INVALID, actions: [RECOVERY.VIEW_FAILURE] },
  VALIDATION_ERROR: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK] },
  UNAUTHORIZED: { state: STATE.RECOVERABLE_ERROR, actions: [RECOVERY.REAUTH] },
});

// Codes the app raises itself. No server sends them, so they are not in the contract.
export const CLIENT_CODES = Object.freeze({
  TRANSPORT_UNREACHABLE: { state: STATE.RECOVERABLE_ERROR, actions: [RECOVERY.RETRY], httpStatus: null },
  FIXTURE_SCENARIO_MISSING: { state: STATE.EMPTY_UNAVAILABLE, actions: [], httpStatus: null },
  CONTRACT_DRIFT: { state: STATE.FATAL_INVALID, actions: [RECOVERY.BACK], httpStatus: null },
});

export function errorDefinition(contract, code) {
  const def = contract.errorsByCode.get(code);
  if (!def) throw new CoreError('UNKNOWN_ERROR_CODE', { code });
  return def;
}

export function parseErrorEnvelope(body, httpStatus) {
  const envelope = (body && typeof body === 'object' && body.error) ? body.error : body || {};
  return {
    code: typeof envelope.code === 'string' ? envelope.code : null,
    message: typeof envelope.message === 'string' ? envelope.message : null,
    requestId: envelope.request_id || envelope.requestId || null,
    details: envelope.details ?? null,
    httpStatus: httpStatus ?? null,
  };
}

// A run that is still QUEUED or RUNNING (context.runStatus) shows PROCESSING, not an unavailable screen.
export function classifyError(contract, code, context = {}) {
  const client = CLIENT_CODES[code];
  const contractRow = MAP[code];
  if (!client && !contractRow) {
    return {
      code: 'CONTRACT_DRIFT', httpStatus: null, ...CLIENT_CODES.CONTRACT_DRIFT,
      safeMessage: `The server used an error code this build does not know: ${code}`,
      retryable: false, unknownCode: code,
    };
  }

  let { state, actions } = client || contractRow;
  const httpStatus = client ? client.httpStatus : errorDefinition(contract, code).httpStatus;

  if (code === 'RUN_NOT_SUCCEEDED' && ['QUEUED', 'RUNNING'].includes(context.runStatus)) {
    state = STATE.PROCESSING;
  }

  const safeMessage = client
    ? clientMessage(code)
    : (errorDefinition(contract, code).messageTemplate || code);

  return {
    code,
    httpStatus,
    state,
    actions: [...actions],
    safeMessage,
    retryable: actions.includes(RECOVERY.RETRY),
  };
}

function clientMessage(code) {
  switch (code) {
    case 'TRANSPORT_UNREACHABLE': return 'The server could not be reached.';
    case 'FIXTURE_SCENARIO_MISSING': return 'No fixture scenario for this request yet.';
    default: return code;
  }
}

/*
 * Screen states. Screens build them only through these functions, which keep three rules:
 * data is set only in SUCCESS (so an old mask is never drawn under an error), FATAL_INVALID
 * never offers RETRY, and EMPTY_UNAVAILABLE always says why.
 */

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
  // RETRY on a stale write would be last-write-wins, which the contract forbids.
  const list = actions.filter((a) => a !== RECOVERY.RETRY);
  return make(STATE.STALE_MISMATCH, { error, reason: error?.code || null, actions: Object.freeze(list) });
}

// What a screen calls on a failed request, so no screen branches on error codes itself.
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
