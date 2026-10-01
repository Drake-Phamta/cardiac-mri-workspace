/*
 * V4 Review / Correction state model (SCR-06).
 *
 * This is deliberately framework-neutral: a React Native screen, a WebView,
 * or a browser can render the frozen snapshot returned by this module. It
 * never writes URLs or interprets errors itself; app/core owns both rules.
 *
 * Day 22 (recovery override; built for Nguyễn Gia Đức Trung, who owns it),
 * against contract v1.0 (`review_rules`, `domain_enums`, DR-009):
 *   - the review status is exactly FR-REV-001's four states, and the
 *     transitions of `05` §6 are enforced here BEFORE anything is sent - the
 *     same way core refuses a write without expected_revision;
 *   - a review is scoped to one run, one source mask and one prediction
 *     variant (review_rules.scope_fields); open() sends all three;
 *   - revision safety is unchanged: every write carries expected_revision,
 *     and STALE_REVISION locks writing until REFRESH (never RETRY);
 *   - saveCorrection() is the SCR-06 save: upload the edited working slices,
 *     then commit them as a NEW immutable ReviewedMask version (FR-REV-008).
 *     A successful commit leaves the review CORRECTED by itself
 *     (review_rules.commit_result_state) - no PATCH follows it. The source
 *     prediction is never sent anywhere as a write (FR-REV-009).
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

// contract.json review_rules, mirrored (test V4-0).
export const REVIEW_RULES = Object.freeze({
  initialState: REVIEW_STATUS.NOT_REVIEWED,
  commitResultState: REVIEW_STATUS.CORRECTED,
  terminalStates: Object.freeze([REVIEW_STATUS.CORRECTED]),
});

// domain_enums.prediction_variant - the variants a review can be scoped to.
export const PREDICTION_VARIANT = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED' });

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const isId = (v) => typeof v === 'string' && v.length > 0;
export const isReviewStatus = (value) => own(REVIEW_STATUS, value);

function refusal(code, reason) {
  return Object.freeze({ ok: false, code, reason, confirm: false });
}

/*
 * May `from -> to` be sent as a review_patch? Pure, so a toolbar greys out a
 * button with the same rule the model enforces.
 *   - only the transitions of `05` §6 (a repeat of the current state is not
 *     one - review_rules.notes);
 *   - CORRECTED needs at least one persisted ReviewedMask
 *     (review_rules.corrected_requires_reviewed_mask);
 *   - leaving ACCEPTED is allowed because the server appends every transition
 *     to an immutable history; the client still makes it a confirmed action,
 *     so `confirm` is true and patchStatus wants { confirmed: true } (`10` §9).
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
    // The review's scope (DR-009): what is being reviewed, shown before save.
    sourceMaskId: fields.sourceMaskId ?? null,
    predictionVariant: fields.predictionVariant ?? null,
    // The case's geometry, echoed on every working-mask write.
    geometry: fields.geometry ?? null,
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

function drift(endpointId, problems) {
  return fatalInvalid({
    code: 'CONTRACT_DRIFT',
    safeMessage: `The response for ${endpointId} does not match the API contract.`,
    detail: { endpointId, problems },
  });
}

// Scenarios are per endpoint (see V1). A map names some; the rest use `fallback`.
const pick = (scenarios, endpointId, fallback = 'default') => (scenarios && scenarios[endpointId]) || fallback;

/**
 * Create the V4 state model over a core client.
 *
 * `open` takes the case and the review's scope (run, source mask, variant).
 * It reads the case geometry, initializes/loads the review, then lists the
 * immutable reviewed-mask versions. No mutable mask is ever treated as a
 * reviewed one.
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
   * case_get first: working_mask_put must echo the CASE's
   * geometry_contract_version and geometry_validation_status (GEOMETRY_
   * NOT_VALIDATED on the real data), never an assumed VALIDATED. Then
   * review_create with status NOT_REVIEWED (`05` §6 initial state), which
   * returns an existing review of the same scope unchanged. The status it
   * answers is authoritative; one outside the four states, or a review of a
   * different scope, is contract drift and the screen must not render it.
   */
  async function open({ caseId, runId, sourceMaskId, predictionVariant, scenario = 'default', scenarios } = {}) {
    const scope = { caseId, runId, sourceMaskId, predictionVariant };
    current = snapshot(loading(), scope);
    const missing = ['caseId', 'runId', 'sourceMaskId'].filter((k) => !isId(scope[k]));
    if (!own(PREDICTION_VARIANT, predictionVariant)) missing.push('predictionVariant (RAW or PROCESSED)');
    if (missing.length) {
      return set(fatalInvalid({
        code: 'REVIEW_SCOPE_MISSING',
        safeMessage: `A review needs ${missing.join(', ')}.`,
        detail: { problems: missing.map((m) => `missing ${m}`) },
      }));
    }

    const kase = await client.call('case_get', { case_id: caseId }, { scenario: pick(scenarios, 'case_get', scenario) });
    if (kase.state !== STATE.SUCCESS) return set(kase);
    const geometry = Object.freeze({
      contractVersion: kase.data.geometry_contract_version,
      validationStatus: kase.data.geometry_validation_status,
      shape: Object.freeze([...kase.data.shape]),
    });

    const review = await client.call('review_create', { run_id: runId }, {
      body: { status: REVIEW_RULES.initialState, source_mask_id: sourceMaskId, prediction_variant: predictionVariant },
      scenario: pick(scenarios, 'review_create', scenario),
    });
    if (review.state !== STATE.SUCCESS) return set(review, { geometry });

    const d = review.data;
    const problems = [];
    if (!isReviewStatus(d.status)) problems.push(`status ${d.status} is not one of ${Object.keys(REVIEW_STATUS).join('/')}`);
    for (const [field, want] of [['source_mask_id', sourceMaskId], ['prediction_variant', predictionVariant]]) {
      if (d[field] !== undefined && d[field] !== want) problems.push(`${field} is ${d[field]}, the review was opened for ${want}`);
    }
    if (problems.length) return set(drift('review_create', problems), { geometry });

    const fields = {
      geometry, reviewId: d.review_id, status: d.status, revision: revisionFrom(d, null), etag: d.etag ?? null,
      reviewedMasks: [], lastCommit: null,
    };
    const versions = await client.call('reviewed_masks_list', { review_id: d.review_id }, {
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
    const { caseId, runId, sourceMaskId, predictionVariant } = current;
    return open({ caseId, runId, sourceMaskId, predictionVariant, ...options });
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

  // One working slice. source_mask_id is the review's own (the contract
  // refuses any other), and the geometry is the case's, echoed.
  async function putWorkingMask({ sliceIndex, maskPayload, scenario = 'default' }) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const view = await client.call('working_mask_put', {
      review_id: current.reviewId, slice_index: sliceIndex,
    }, {
      body: {
        source_mask_id: current.sourceMaskId,
        expected_revision: current.revision,
        slice_index: sliceIndex,
        geometry_contract_version: current.geometry.contractVersion,
        geometry_validation_status: current.geometry.validationStatus,
        mask_payload: maskPayload,
      },
      scenario,
    });
    return set(view, { revision: revisionFrom(view.data, current.revision) });
  }

  const needsConfirm = (confirmed) => current.status === REVIEW_STATUS.ACCEPTED && confirmed !== true;

  /*
   * Commit = a NEW immutable ReviewedMask version, appended; never an
   * overwrite. It leaves the review CORRECTED (commit_result_state); on a
   * review already CORRECTED it adds a version without a transition. From
   * ACCEPTED that is a transition away from an accepted review, so it is
   * confirmed first, like patchStatus.
   */
  async function commit({ scenario = 'default', confirmed = false } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    if (needsConfirm(confirmed)) {
      return reject('CONFIRMATION_REQUIRED', 'Committing moves the accepted review to CORRECTED; confirm it first',
        { from: current.status, to: REVIEW_RULES.commitResultState });
    }
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
      provenance: d.provenance ? Object.freeze({ ...d.provenance }) : null,
    });
    return set(view, {
      status: REVIEW_RULES.commitResultState,
      revision: revisionFrom(d, current.revision),
      lastCommit: version,
      reviewedMasks: [...current.reviewedMasks, version],
    });
  }

  /*
   * The SCR-06 save, over a brush session (brush.mjs createBrushSession).
   * Refused before anything is sent when the session edits another source
   * than the review's, has another slice size than the case, is a synthetic
   * stand-in on a real backend, or would move an ACCEPTED review unconfirmed.
   * Then:
   *   1. freeze what is being saved (prepareSave) - edits made while the save
   *      is in flight stay UNSAVED;
   *   2. PUT every slice that must go, each with expected_revision;
   *   3. commit them as a new ReviewedMask version - the review is CORRECTED;
   *   4. only then mark the session SAVED.
   * The first failure stops the save and is the state returned; a
   * STALE_REVISION anywhere leaves canWrite false and REFRESH as the only way on.
   */
  async function saveCorrection(session, { scenarios, confirmed = false } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const src = session.source;
    if (src.maskId !== current.sourceMaskId) {
      return reject('SOURCE_MISMATCH', `The brush edits ${src.maskId}; this review is for ${current.sourceMaskId}.`);
    }
    const [nx, ny] = current.geometry ? current.geometry.shape : [];
    if (session.nx !== nx || session.ny !== ny) {
      return reject('GEOMETRY_MISMATCH', `The working mask is ${session.nx}x${session.ny}; the case is ${nx}x${ny}.`);
    }
    if (src.synthetic && client.transportKind !== 'fixture') {
      return reject('SYNTHETIC_SOURCE', 'A synthetic stand-in mask is never sent to a backend.');
    }
    if (needsConfirm(confirmed)) {
      return reject('CONFIRMATION_REQUIRED', 'Saving moves the accepted review to CORRECTED; confirm it first',
        { from: current.status, to: REVIEW_RULES.commitResultState });
    }
    const prepared = session.prepareSave();
    if (prepared.entries.length === 0) {
      return reject('NOTHING_TO_SAVE', 'The working mask equals the source; there is no correction to save.');
    }
    for (const entry of prepared.entries) {
      const step = await putWorkingMask({
        sliceIndex: entry.sliceIndex, maskPayload: entry.maskPayload, scenario: pick(scenarios, 'working_mask_put'),
      });
      if (step.view.state !== STATE.SUCCESS) return step;
      session.markUploaded(entry.sliceIndex);
    }
    const committed = await commit({ scenario: pick(scenarios, 'review_commit'), confirmed: true });
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
