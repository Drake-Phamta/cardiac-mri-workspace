/*
 * V4 Review / Correction state model (SCR-06).
 *
 * This is deliberately framework-neutral: a React Native screen, a WebView,
 * or a browser can render the frozen snapshot returned by this module. It
 * never writes URLs or interprets errors itself; app/core owns both rules.
 *
 * Day 22 (recovery override; built for Nguyễn Gia Đức Trung, who owns it):
 *   - the review status is exactly FR-REV-001's four states, and the
 *     transitions of `05` §6 are enforced here BEFORE anything is sent - the
 *     same way core refuses a write without expected_revision;
 *   - revision safety is unchanged: every write carries expected_revision,
 *     and STALE_REVISION locks writing until REFRESH (never RETRY);
 *   - saveCorrection() is the SCR-06 save: upload the edited working slices,
 *     then commit them as a NEW immutable ReviewedMask version (FR-REV-008).
 *     The source prediction is never sent anywhere as a write (FR-REV-009).
 */

import { STATE, loading, fatalInvalid } from '../../core/index.mjs';

export const REVIEW_STATUS = Object.freeze({
  NOT_REVIEWED: 'NOT_REVIEWED',
  ACCEPTED: 'ACCEPTED',
  FLAGGED: 'FLAGGED',
  CORRECTED: 'CORRECTED',
});

/*
 * `05` §6, transcribed. It mirrors contracts/api/contract.json
 * `domain_enums.review_status_transitions`, and test V4-0 holds the two equal.
 * CORRECTED has no way out: the spec lists none.
 */
export const REVIEW_TRANSITIONS = Object.freeze({
  NOT_REVIEWED: Object.freeze(['ACCEPTED', 'FLAGGED', 'CORRECTED']),
  ACCEPTED: Object.freeze(['FLAGGED', 'CORRECTED']),
  FLAGGED: Object.freeze(['CORRECTED']),
  CORRECTED: Object.freeze([]),
});

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
export const isReviewStatus = (value) => own(REVIEW_STATUS, value);

function refusal(code, reason) {
  return Object.freeze({ ok: false, code, reason, confirm: false });
}

/*
 * May `from -> to` be sent? Pure, so a toolbar greys out a button with the
 * same rule the model enforces.
 *   - only the transitions of `05` §6;
 *   - CORRECTED needs at least one persisted ReviewedMask (`05` §6, review
 *     persistence rules): a correction that was never saved cannot be the
 *     review's state;
 *   - leaving ACCEPTED is allowed "only if audit history is preserved". The
 *     server keeps that trail (review_patch: "The prior revision remains
 *     auditable"); the client's share is to make it a confirmed action, so
 *     `confirm` is true and patchStatus wants { confirmed: true } (`10` §9).
 */
export function checkTransition(from, to, { hasReviewedMask = false } = {}) {
  if (!isReviewStatus(from)) return refusal('REVIEW_STATUS_UNKNOWN', `${from} is not a review state`);
  if (!isReviewStatus(to)) return refusal('REVIEW_STATUS_UNKNOWN', `${to} is not a review state`);
  if (!REVIEW_TRANSITIONS[from].includes(to)) {
    return refusal('INVALID_REVIEW_TRANSITION', `${from} -> ${to} is not a transition of 05 section 6`);
  }
  if (to === REVIEW_STATUS.CORRECTED && !hasReviewedMask) {
    return refusal('CORRECTION_NOT_SAVED', 'CORRECTED needs a saved reviewed mask first');
  }
  return Object.freeze({ ok: true, code: null, reason: null, confirm: from === REVIEW_STATUS.ACCEPTED });
}

// Every other state, each with whether it may be chosen now and why not.
export function transitionsFrom(status, options) {
  if (!isReviewStatus(status)) return Object.freeze([]);
  return Object.freeze(Object.keys(REVIEW_STATUS)
    .filter((to) => to !== status)
    .map((to) => Object.freeze({ to, ...checkTransition(status, to, options) })));
}

function snapshot(view, fields) {
  const reviewedMasks = Object.freeze([...(fields.reviewedMasks ?? [])]);
  const status = fields.status ?? null;
  return Object.freeze({
    view,
    caseId: fields.caseId ?? null,
    runId: fields.runId ?? null,
    reviewId: fields.reviewId ?? null,
    revision: fields.revision ?? null,
    etag: fields.etag ?? null,
    status,
    // Immutable versions only. A working (unsaved) mask never appears here.
    reviewedMasks,
    lastCommit: fields.lastCommit ?? null,
    transitions: transitionsFrom(status, { hasReviewedMask: reviewedMasks.length > 0 }),
    // A write the model refused before sending: { code, reason, ... }. The
    // view is untouched by it - nothing reached the server.
    rejection: fields.rejection ?? null,
    // A stale correction must be refreshed, then consciously re-applied. A
    // second submit of the same revision is forbidden last-write-wins.
    canWrite: view.state === STATE.SUCCESS,
  });
}

function revisionFrom(data, fallback) {
  return data?.revision ?? data?.working_revision ?? fallback;
}

function blocked(fields, code, safeMessage) {
  return snapshot(fatalInvalid({ code, safeMessage }), fields);
}

// Scenarios are per endpoint (see V1). A map names some; the rest use `fallback`.
const pick = (scenarios, endpointId, fallback = 'default') => (scenarios && scenarios[endpointId]) || fallback;

/**
 * Create the V4 state model over a core client.
 *
 * `open` takes both the case and run identity required by SCR-06. The API
 * initializes/loads the review by run, then lists immutable reviewed masks by
 * the returned review id. No mutable mask is ever treated as a reviewed one.
 */
export function createReviewCorrection(client) {
  let current = snapshot(loading(), {});

  // Any new state clears the previous refusal unless the patch sets one.
  const set = (view, patch = {}) => {
    current = snapshot(view, { ...current, rejection: null, ...patch });
    return current;
  };

  const reject = (code, reason, extra = {}) => set(current.view, {
    rejection: Object.freeze({ code, reason, ...extra }),
  });

  const requireOpenWrite = () => {
    if (!current.reviewId) return blocked(current, 'REVIEW_NOT_OPEN', 'Open a review before writing.');
    if (!current.canWrite) return current;
    return null;
  };

  /*
   * A review starts NOT_REVIEWED (`05` §6), so that is what review_create
   * initializes with. The status the server answers with is authoritative,
   * and anything outside the four states is contract drift: the screen must
   * not invent a meaning for it.
   */
  async function open({ caseId, runId, scenario = 'default', scenarios } = {}) {
    current = snapshot(loading(), { caseId, runId });
    const review = await client.call('review_create', { run_id: runId }, {
      body: { status: REVIEW_STATUS.NOT_REVIEWED }, scenario: pick(scenarios, 'review_create', scenario),
    });
    if (review.state !== STATE.SUCCESS) return set(review);

    const status = review.data.status;
    if (!isReviewStatus(status)) {
      return set(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: `The review status ${status} is not one of ${Object.keys(REVIEW_STATUS).join(', ')}.`,
        detail: { endpointId: 'review_create', field: 'status', value: status },
      }));
    }

    const reviewId = review.data.review_id;
    const fields = {
      reviewId, status, revision: revisionFrom(review.data, null), etag: review.data.etag ?? null,
      reviewedMasks: [], lastCommit: null,
    };
    const versions = await client.call('reviewed_masks_list', { review_id: reviewId }, {
      scenario: pick(scenarios, 'reviewed_masks_list', scenario),
    });
    if (versions.state !== STATE.SUCCESS) return set(versions, fields);
    return set(review, { ...fields, reviewedMasks: versions.data.items ?? [] });
  }

  // The REFRESH action of STALE_MISMATCH: reload the same review from the server.
  async function refresh(options = {}) {
    if (!current.caseId || !current.runId) {
      return blocked(current, 'REVIEW_NOT_OPEN', 'Open a review before refreshing.');
    }
    return open({ caseId: current.caseId, runId: current.runId, ...options });
  }

  /*
   * Change the review status. Refused locally, with nothing sent, when the
   * transition is not in `05` §6 or needs a confirmation it did not get. On
   * success the status becomes `to`: a 2xx from review_patch means the server
   * applied exactly that transition. (The generated fixture's response status
   * is a fixed placeholder, so it is not read back here.) On any failure the
   * status and revision stay what they were.
   */
  async function patchStatus(to, { scenario = 'default', confirmed = false } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const check = checkTransition(current.status, to, { hasReviewedMask: current.reviewedMasks.length > 0 });
    if (!check.ok) return reject(check.code, check.reason, { from: current.status, to });
    if (check.confirm && confirmed !== true) {
      return reject('CONFIRMATION_REQUIRED',
        `${current.status} -> ${to} reopens an accepted review; confirm it first`, { from: current.status, to });
    }
    const view = await client.call('review_patch', { review_id: current.reviewId }, {
      body: { status: to, expected_revision: current.revision }, scenario,
    });
    if (view.state !== STATE.SUCCESS) return set(view);
    return set(view, {
      status: to, revision: revisionFrom(view.data, current.revision), etag: view.data.etag ?? current.etag,
    });
  }

  async function putWorkingMask({ sliceIndex, sourceMaskId, maskPayload, scenario = 'default' }) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const view = await client.call('working_mask_put', {
      review_id: current.reviewId, slice_index: sliceIndex,
    }, {
      body: {
        source_mask_id: sourceMaskId,
        expected_revision: current.revision,
        slice_index: sliceIndex,
        geometry_contract_version: client.contract.geometryContractVersion,
        geometry_validation_status: 'VALIDATED',
        mask_payload: maskPayload,
      },
      scenario,
    });
    return set(view, { revision: revisionFrom(view.data, current.revision) });
  }

  // Commit = a NEW immutable ReviewedMask version, appended; never an overwrite.
  async function commit({ scenario = 'default' } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const view = await client.call('review_commit', { review_id: current.reviewId }, {
      body: { expected_revision: current.revision }, scenario,
    });
    if (view.state !== STATE.SUCCESS) return set(view);
    const d = view.data;
    const version = Object.freeze({
      reviewed_mask_id: d.reviewed_mask_id,
      source_mask_id: d.source_mask_id,
      source_mask_kind: d.source_mask_kind,
      revision: d.revision,
      checksum: d.checksum,
    });
    return set(view, {
      revision: revisionFrom(d, current.revision),
      lastCommit: version,
      reviewedMasks: [...current.reviewedMasks, version],
    });
  }

  /*
   * The SCR-06 save, over a brush session (brush.mjs createBrushSession):
   *   1. freeze what is being saved (prepareSave) - edits made while the save
   *      is in flight stay UNSAVED;
   *   2. PUT every slice that must go, each with expected_revision, tied to
   *      the session's declared source mask (FR-REV-010);
   *   3. commit them as a new ReviewedMask version;
   *   4. only then mark the session SAVED.
   * The first failure stops the save and is the state returned; a
   * STALE_REVISION anywhere leaves canWrite false and REFRESH as the only way
   * on. The status is NOT changed here: CORRECTED is chosen by the user once a
   * reviewed mask exists (decision recorded in the README).
   */
  async function saveCorrection(session, { scenarios } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const prepared = session.prepareSave();
    if (prepared.payloads.length === 0) {
      return reject('NOTHING_TO_SAVE', 'The working mask equals the source; there is no correction to save.');
    }
    for (const payload of prepared.payloads) {
      const step = await putWorkingMask({
        sliceIndex: payload.slice_index,
        sourceMaskId: prepared.source.maskId,
        maskPayload: payload,
        scenario: pick(scenarios, 'working_mask_put'),
      });
      if (step.view.state !== STATE.SUCCESS) return step;
      session.markUploaded(payload.slice_index);
    }
    const committed = await commit({ scenario: pick(scenarios, 'review_commit') });
    if (committed.view.state !== STATE.SUCCESS) return committed;
    session.markSaved(prepared, {
      reviewedMaskId: committed.lastCommit.reviewed_mask_id,
      checksum: committed.lastCommit.checksum,
      revision: committed.lastCommit.revision,
    });
    return current;
  }

  return Object.freeze({
    get current() { return current; },
    open,
    refresh,
    patchStatus,
    putWorkingMask,
    commit,
    saveCorrection,
  });
}
