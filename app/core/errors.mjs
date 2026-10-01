/*
 * The 15 contract error codes, mapped once to what a screen must do.
 *
 * This table is the deliverable. Every vertical reads it instead of re-reading
 * `10` section 8, and test_errors.mjs asserts it code by code so it cannot
 * drift quietly. Three rules decided its shape:
 *
 *   - an absent artifact is UNAVAILABLE, never an empty chart and never a zero
 *     mask (`10` section 7);
 *   - a wrong reference or an unvalidated geometry BLOCKS the view rather than
 *     rendering something misleading (`10` section 8, TC-REL-003);
 *   - STALE_REVISION never offers RETRY. Retrying a stale write is last-write-
 *     wins, which revision_rules forbids.
 */

import { CoreError } from './contract.mjs';

export { CoreError };

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

// Codes the client itself raises. They are not in the contract because no
// server sends them, but a screen still has to show something honest.
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

/*
 * context.runStatus lets one row be context-sensitive: a run that has not
 * succeeded because it is still QUEUED or RUNNING is PROCESSING, which `10`
 * section 8 requires to stay interactive, not an unavailable screen.
 */
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
