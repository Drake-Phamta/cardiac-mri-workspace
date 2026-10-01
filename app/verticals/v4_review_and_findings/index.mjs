/*
 * V4 Review / Correction state model.
 *
 * This is deliberately framework-neutral: a React Native screen, a WebView,
 * or a browser can render the frozen snapshot returned by this module. It
 * never writes URLs or interprets errors itself; app/core owns both rules.
 */

import { STATE, loading, fatalInvalid } from '../../core/index.mjs';

function snapshot(view, fields) {
  return Object.freeze({
    view,
    caseId: fields.caseId ?? null,
    runId: fields.runId ?? null,
    reviewId: fields.reviewId ?? null,
    revision: fields.revision ?? null,
    etag: fields.etag ?? null,
    reviewedMasks: Object.freeze([...(fields.reviewedMasks ?? [])]),
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

/**
 * Create the V4 state model over a core client.
 *
 * `open` takes both the case and run identity required by SCR-06. The API
 * initializes/loads the review by run, then lists immutable reviewed masks by
 * the returned review id. No mutable mask is ever treated as a reviewed one.
 */
export function createReviewCorrection(client) {
  let current = snapshot(loading(), {});

  const set = (view, patch = {}) => {
    current = snapshot(view, { ...current, ...patch });
    return current;
  };

  const requireOpenWrite = () => {
    if (!current.reviewId) return blocked(current, 'REVIEW_NOT_OPEN', 'Open a review before writing.');
    if (!current.canWrite) return current;
    return null;
  };

  async function open({ caseId, runId, status = 'IN_PROGRESS', scenario = 'default' }) {
    current = snapshot(loading(), { caseId, runId });
    const review = await client.call('review_create', { run_id: runId }, { body: { status }, scenario });
    if (review.state !== STATE.SUCCESS) return set(review);

    const reviewId = review.data.review_id;
    const versions = await client.call('reviewed_masks_list', { review_id: reviewId }, { scenario });
    if (versions.state !== STATE.SUCCESS) {
      return set(versions, {
        reviewId, revision: revisionFrom(review.data, null), etag: review.data.etag ?? null,
      });
    }
    return set(review, {
      reviewId,
      revision: revisionFrom(review.data, null),
      etag: review.data.etag ?? null,
      reviewedMasks: versions.data.items ?? [],
    });
  }

  async function patchStatus(status, { scenario = 'default' } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const view = await client.call('review_patch', { review_id: current.reviewId }, {
      body: { status, expected_revision: current.revision }, scenario,
    });
    return set(view, {
      revision: revisionFrom(view.data, current.revision), etag: view.data?.etag ?? current.etag,
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

  async function commit({ scenario = 'default' } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const view = await client.call('review_commit', { review_id: current.reviewId }, {
      body: { expected_revision: current.revision }, scenario,
    });
    return set(view, { revision: revisionFrom(view.data, current.revision) });
  }

  return Object.freeze({
    get current() { return current; },
    open,
    patchStatus,
    putWorkingMask,
    commit,
  });
}
