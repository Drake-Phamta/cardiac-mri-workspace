/*
 * What a screen SAYS in each of the seven app/core states - pure, so the copy
 * and the action list are tested in node and StateView.js only draws them.
 *
 * `10` §8 acceptance, restated as the rule each branch follows:
 *   LOADING            the request is pending; a spinner, nothing else
 *   PROCESSING         analysis is running; stay interactive; show progress
 *                      ONLY if the server sent one (SCR-09: never fabricate)
 *   EMPTY_UNAVAILABLE  the artifact is legitimately absent; say WHY, never an
 *                      empty chart, never zero (`10` §7)
 *   RECOVERABLE_ERROR  a safe reason plus the recovery app/core offered
 *   FATAL_INVALID      block the view; expose the code and a reference id
 *   STALE_MISMATCH     a version mismatch; refresh, never retry (no
 *                      last-write-wins, revision_rules)
 *   SUCCESS            the screen draws its data; nothing here
 *
 * The action list is app/core's, never extended here: a FATAL_INVALID that
 * offered RETRY would re-render the same lie.
 */

import { STATE, RECOVERY } from '../../../app/core/index.mjs';

export const TONE = Object.freeze({ NEUTRAL: 'neutral', INFO: 'info', WARN: 'warn', DANGER: 'danger' });

export const ACTION_LABEL = Object.freeze({
  [RECOVERY.RETRY]: 'Retry',
  [RECOVERY.REFRESH]: 'Refresh',
  [RECOVERY.BACK]: 'Back',
  [RECOVERY.REAUTH]: 'Sign in again',
  [RECOVERY.VIEW_FAILURE]: 'View failure reason',
});

// Plain-language reasons for the codes a researcher actually meets. The
// contract's own message_template is shown too; this adds what to DO.
const REASON_TEXT = Object.freeze({
  GROUND_TRUTH_UNAVAILABLE:
    'This case has no ground-truth mask, so error and metric views are unavailable - not zero.',
  ARTIFACT_NOT_FOUND: 'The requested artifact does not exist on the server for this selection.',
  RUN_NOT_SUCCEEDED: 'The analysis run has not produced a successful result yet.',
  RUN_NOT_DEPLOYABLE: 'This experiment configuration is not deployable, so no run can be requested.',
  NON_COMPARABLE_EXPERIMENTS: 'These experiments do not share a fair evaluation population and are not compared.',
  FIXTURE_SCENARIO_MISSING:
    'The generated fixture bundle has no scenario for this request. Regenerate it with `npm run prepare-app`.',
  SCREEN_NOT_BUILT: 'This screen is not built yet in this build.',
  SELECTION_NOT_RETURNED: 'The server did not return a worst-slice selection for this run.',
  SELECTION_NO_ELIGIBLE_SLICES: 'No slice has non-empty ground truth, so there is no worst slice to rank.',
  TRANSPORT_UNREACHABLE: 'The backend could not be reached. Check the overlay network, then retry.',
  CONTRACT_DRIFT: 'The response does not match the API contract this build was made from.',
  STALE_REVISION: 'Someone saved a newer revision. Refresh before writing again - nothing was overwritten.',
});

export function reasonText(code) {
  return (code && REASON_TEXT[code]) || null;
}

function detailLines(view, context) {
  const lines = [];
  const err = view.error || {};
  const code = err.code || view.reason || null;
  if (code) lines.push(`code ${code}`);
  if (err.httpStatus) lines.push(`HTTP ${err.httpStatus}`);
  if (err.requestId) lines.push(`request ${err.requestId}`);
  if (err.unknownCode) lines.push(`unknown server code ${err.unknownCode}`);
  const problems = err.detail && Array.isArray(err.detail.problems) ? err.detail.problems : [];
  for (const p of problems.slice(0, 6)) lines.push(p);
  if (problems.length > 6) lines.push(`... ${problems.length - 6} more`);
  if (code === 'TRANSPORT_UNREACHABLE' && context.apiBaseUrl) lines.push(`backend ${context.apiBaseUrl}`);
  return lines;
}

function progressText(progress) {
  if (progress === null || progress === undefined) return null;
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)} % (reported by the server)`;
  }
  if (typeof progress === 'object' && progress.label) return String(progress.label);
  return null;
}

/*
 * view    an app/core screen state ({ state, data, error, reason, actions, progress })
 * context { what: 'the case list', apiBaseUrl }
 */
export function describeState(view, context = {}) {
  const what = context.what || 'this view';
  const actions = (view.actions || []).map((id) => ({ id, label: ACTION_LABEL[id] || id }));
  const err = view.error || {};
  const code = err.code || view.reason || null;
  const safe = err.safeMessage || null;

  switch (view.state) {
    case STATE.LOADING:
      return { state: view.state, tone: TONE.NEUTRAL, spinner: true, blocking: false, title: `Loading ${what}…`, body: null, details: [], actions: [] };
    case STATE.PROCESSING:
      return {
        state: view.state, tone: TONE.INFO, spinner: true, blocking: false,
        title: 'Analysis is still running',
        body: progressText(view.progress) || 'The server has not reported progress. This screen stays usable; refresh to check again.',
        details: [], actions,
      };
    case STATE.EMPTY_UNAVAILABLE:
      return {
        state: view.state, tone: TONE.NEUTRAL, spinner: false, blocking: false,
        title: 'Unavailable',
        body: reasonText(code) || safe || `No ${what} is available.`,
        details: code ? [`reason ${code}`] : [], actions,
      };
    case STATE.RECOVERABLE_ERROR:
      return {
        state: view.state, tone: TONE.WARN, spinner: false, blocking: false,
        title: 'Something went wrong',
        body: reasonText(code) || safe || 'The request failed.',
        details: detailLines(view, context), actions,
      };
    case STATE.STALE_MISMATCH:
      return {
        state: view.state, tone: TONE.WARN, spinner: false, blocking: true,
        title: 'Version mismatch',
        body: reasonText(code) || safe || 'What is on screen is older than the server copy. Refresh before continuing.',
        details: detailLines(view, context), actions,
      };
    case STATE.FATAL_INVALID:
      return {
        state: view.state, tone: TONE.DANGER, spinner: false, blocking: true,
        title: 'Cannot show this safely',
        body: reasonText(code) || safe || 'The data failed validation, so it is not drawn.',
        details: detailLines(view, context), actions,
      };
    case STATE.SUCCESS:
      return { state: view.state, tone: TONE.NEUTRAL, spinner: false, blocking: false, title: null, body: null, details: [], actions: [] };
    default:
      // A state app/core does not define. Treated as invalid, never as success.
      return {
        state: STATE.FATAL_INVALID, tone: TONE.DANGER, spinner: false, blocking: true,
        title: 'Unknown screen state', body: `app/core returned an unknown state: ${view && view.state}`,
        details: [], actions: [{ id: RECOVERY.BACK, label: ACTION_LABEL[RECOVERY.BACK] }],
      };
  }
}
