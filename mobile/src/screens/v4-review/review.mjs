// Review state model for SCR-06: one review of one run, source mask and prediction variant. It checks
// status changes before sending them and saves a correction as a new immutable reviewed-mask version.
// Plain JS that Node tests import; every change to an open review carries expected_revision.

import { PREDICTION_VARIANT } from '../../lib/caseMode.mjs';
import { STATE, RECOVERY, loading, fatalInvalid } from '../../api/states.mjs';
import { SOURCE_KIND_FOR_VARIANT } from './brush.mjs';

export const REVIEW_STATUS = Object.freeze({
  NOT_REVIEWED: 'NOT_REVIEWED',
  ACCEPTED: 'ACCEPTED',
  FLAGGED: 'FLAGGED',
  CORRECTED: 'CORRECTED',
});

// Allowed status changes (spec 05 §6). A test keeps this equal to the API contract. CORRECTED is final.
export const REVIEW_TRANSITIONS = Object.freeze({
  NOT_REVIEWED: Object.freeze(['ACCEPTED', 'FLAGGED', 'CORRECTED']),
  ACCEPTED: Object.freeze(['FLAGGED', 'CORRECTED']),
  FLAGGED: Object.freeze(['CORRECTED']),
  CORRECTED: Object.freeze([]),
});

// Mirrors review_rules in the API contract.
export const REVIEW_RULES = Object.freeze({
  initialState: REVIEW_STATUS.NOT_REVIEWED,
  commitResultState: REVIEW_STATUS.CORRECTED,
  terminalStates: Object.freeze([REVIEW_STATUS.CORRECTED]),
  // Only review_commit reaches CORRECTED, together with a new reviewed mask; the server refuses a patch to it.
  correctedOnlyVia: 'review_commit',
});

// The newest saved version: highest provenance.version, else highest revision, else the last row.
// The server builds each new version from this one, so a continued review starts its pixels from it.
export function latestVersion(reviewedMasks) {
  const list = Array.isArray(reviewedMasks) ? reviewedMasks : [];
  const rank = (v) => {
    const n = v && v.provenance && Number.isInteger(v.provenance.version) ? v.provenance.version
      : (v && Number.isInteger(v.revision) ? v.revision : -1);
    return n;
  };
  let best = null;
  list.forEach((v) => { if (best === null || rank(v) >= rank(best)) best = v; });
  return best;
}

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const isId = (v) => typeof v === 'string' && v.length > 0;
export const isReviewStatus = (value) => own(REVIEW_STATUS, value);

function refusal(code, reason) {
  return Object.freeze({ ok: false, code, reason, confirm: false });
}

// May `from -> to` be sent as a review_patch? Pure, so the toolbar greys out buttons by the same rule.
// Never to CORRECTED: only saving a correction gets there, so a CORRECTED review always has a saved mask.
// Leaving ACCEPTED is allowed (the server keeps the history) but must be confirmed by the user.
export function checkTransition(from, to) {
  if (!isReviewStatus(from)) return refusal('REVIEW_STATUS_UNKNOWN', `${from} is not a review state`);
  if (!isReviewStatus(to)) return refusal('REVIEW_STATUS_UNKNOWN', `${to} is not a review state`);
  if (!REVIEW_TRANSITIONS[from].includes(to)) {
    return refusal('INVALID_REVIEW_TRANSITION', `${from} -> ${to} is not a transition of 05 section 6`);
  }
  if (to === REVIEW_STATUS.CORRECTED) {
    return refusal('CORRECTED_BY_COMMIT_ONLY', 'CORRECTED is reached only by saving a correction');
  }
  return Object.freeze({ ok: true, code: null, reason: null, confirm: from === REVIEW_STATUS.ACCEPTED });
}

// Every other state, each with whether it may be chosen now and why not.
export function transitionsFrom(status) {
  if (!isReviewStatus(status)) return Object.freeze([]);
  return Object.freeze(Object.keys(REVIEW_STATUS)
    .filter((to) => to !== status)
    .map((to) => Object.freeze({ to, ...checkTransition(status, to) })));
}

function snapshot(view, fields) {
  const reviewedMasks = Object.freeze([...(fields.reviewedMasks ?? [])]);
  const status = fields.status ?? null;
  return Object.freeze({
    view,
    caseId: fields.caseId ?? null,
    runId: fields.runId ?? null,
    // The review's scope: what is being reviewed, shown before save.
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
    latestVersion: latestVersion(reviewedMasks),
    // The version a continued review starts from: the latest one when CORRECTED, else null.
    baseVersion: status === REVIEW_STATUS.CORRECTED ? latestVersion(reviewedMasks) : null,
    transitions: transitionsFrom(status),
    // A write refused before sending: { code, reason, ... }. Nothing reached the server, so the view is unchanged.
    rejection: fields.rejection ?? null,
    // After a failed write (e.g. a stale revision) the user must refresh; resending the same revision
    // would be last-write-wins.
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

// Fixture scenarios are per endpoint: the map names some, the rest use `fallback`.
const pick = (scenarios, endpointId, fallback = 'default') => (scenarios && scenarios[endpointId]) || fallback;

// The review state model over an API client. Only saved (immutable) versions count as reviewed masks.
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

  // case_get first: each working_mask_put must echo the case's own geometry status, never an assumed
  // VALIDATED. review_create returns an existing review of the same scope unchanged; an answer with an
  // unknown status or another scope is contract drift and is not shown.
  async function open({ caseId, runId, sourceMaskId, predictionVariant, scenario = 'default', scenarios, signal = null } = {}) {
    // Only the reads take the screen's AbortSignal. review_create is not aborted: a sent POST should
    // finish, and it is idempotent.
    const reads = signal ? { signal } : {};
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

    const kase = await client.call('case_get', { case_id: caseId }, { scenario: pick(scenarios, 'case_get', scenario), ...reads });
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
    // The review must answer the run, source mask and variant it was opened for; a missing field is wrong too.
    for (const [field, want] of [['run_id', runId], ['source_mask_id', sourceMaskId], ['prediction_variant', predictionVariant]]) {
      if (d[field] !== want) problems.push(`${field} is ${d[field]}, the review was opened for ${want}`);
    }
    if (problems.length) return set(drift('review_create', problems), { geometry });

    const fields = {
      geometry, reviewId: d.review_id, status: d.status, revision: revisionFrom(d, null), etag: d.etag ?? null,
      reviewedMasks: [], lastCommit: null,
    };
    const versions = await client.call('reviewed_masks_list', { review_id: d.review_id }, {
      scenario: pick(scenarios, 'reviewed_masks_list', scenario), ...reads,
    });
    if (versions.state !== STATE.SUCCESS) return set(versions, fields);
    const items = versions.data.items ?? [];
    // CORRECTED is reached only by a commit, which makes a version: a corrected
    // review that lists none is not a state the server can be in.
    if (d.status === REVIEW_STATUS.CORRECTED && items.length === 0) {
      return set(drift('reviewed_masks_list', ['the review is CORRECTED but lists no reviewed-mask version']), fields);
    }
    return set(review, { ...fields, reviewedMasks: items });
  }

  // The REFRESH action of STALE_MISMATCH: reload the same review from the server.
  async function refresh(options = {}) {
    if (!current.caseId || !current.runId) {
      return blocked(current, 'REVIEW_NOT_OPEN', 'Open a review before refreshing.');
    }
    const { caseId, runId, sourceMaskId, predictionVariant } = current;
    return open({ caseId, runId, sourceMaskId, predictionVariant, ...options });
  }

  // Refused locally, with nothing sent, when the transition is not allowed or lacks a needed confirmation.
  // A 2xx means the server applied exactly `to`, so the status is not read back (the fixture answers a
  // fixed placeholder). On failure the status and revision stay as they were.
  async function patchStatus(to, { scenario = 'default', confirmed = false } = {}) {
    const rejected = requireOpenWrite();
    if (rejected) return rejected;
    const check = checkTransition(current.status, to);
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

  // Upload one working slice with the review's own source_mask_id and the case's geometry echoed.
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

  // Commit appends a new immutable reviewed-mask version and leaves the review CORRECTED.
  // From ACCEPTED it moves away from an accepted review, so it must be confirmed, like patchStatus.
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
    // The answer must name a new version with its checksum; an id already in the list would overwrite an
    // immutable version. On any problem nothing is appended, the session is not marked saved, and only a
    // refresh shows what the server holds.
    const problems = [];
    if (typeof d.reviewed_mask_id !== 'string' || d.reviewed_mask_id === '') {
      problems.push('the answer names no reviewed_mask_id for the new version');
    }
    if (typeof d.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(d.checksum)) {
      problems.push(`the answer carries no sha256 checksum for the new version (${JSON.stringify(d.checksum)})`);
    }
    if (current.reviewedMasks.some((v) => v.reviewed_mask_id === d.reviewed_mask_id)) {
      problems.push(`reviewed_mask_id ${d.reviewed_mask_id} is already a version of this review`);
    }
    // A commit always answers status, source_mask_id and source_mask_kind, so none has a fallback.
    const status = d.status;
    if (status !== REVIEW_RULES.commitResultState) {
      problems.push(`status ${status} is not ${REVIEW_RULES.commitResultState}, the result of a commit`);
    }
    if (d.source_mask_id !== current.sourceMaskId) {
      problems.push(`source_mask_id is ${d.source_mask_id}, the review's source is ${current.sourceMaskId}`);
    }
    const wantKind = SOURCE_KIND_FOR_VARIANT[current.predictionVariant];
    if (d.source_mask_kind !== wantKind) {
      problems.push(`source_mask_kind is ${d.source_mask_kind}, a ${current.predictionVariant} review has ${wantKind}`);
    }
    if (problems.length) {
      return set(fatalInvalid({
        code: 'CONTRACT_DRIFT',
        safeMessage: 'The commit answer does not match the API contract; refresh to see what the server holds.',
        detail: { endpointId: 'review_commit', problems },
      }, [RECOVERY.REFRESH, RECOVERY.BACK]));
    }
    const version = Object.freeze({
      reviewed_mask_id: d.reviewed_mask_id,
      source_mask_id: d.source_mask_id,
      source_mask_kind: d.source_mask_kind,
      revision: d.revision,
      checksum: d.checksum,
      provenance: d.provenance ? Object.freeze({ ...d.provenance }) : null,
    });
    return set(view, {
      status,
      revision: revisionFrom(d, current.revision),
      lastCommit: version,
      reviewedMasks: [...current.reviewedMasks, version],
    });
  }

  // Save a brush session (brush.mjs). Refused before anything is sent when the session has another source,
  // slice size or base version than the review, or is a synthetic stand-in on a real backend. The server
  // builds the next version from the latest one, so saving over an older base would drop newer corrections.
  // Order: freeze what is saved (edits made meanwhile stay unsaved), PUT each slice, commit, then mark the
  // session saved. The first failure stops the save and is returned.
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
    const wantKind = SOURCE_KIND_FOR_VARIANT[current.predictionVariant];
    if (src.kind !== wantKind) {
      return reject('SOURCE_KIND_MISMATCH', `The brush edits a ${src.kind} source; a ${current.predictionVariant} review has ${wantKind}.`);
    }
    const wantBase = current.baseVersion ? current.baseVersion.reviewed_mask_id : null;
    if ((session.baseId ?? null) !== wantBase) {
      return reject('BASE_VERSION_MISMATCH', wantBase
        ? `The latest version is ${wantBase}; this session continues from ${session.baseId ?? 'the source prediction'}. Reload the review before saving.`
        : `This session continues from ${session.baseId}, which is not a version of this review.`);
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
    // The new version is now the base the next edit continues from.
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
