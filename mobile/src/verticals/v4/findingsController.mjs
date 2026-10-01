/*
 * SCR-08 Findings — everything the screen does except drawing. Pure, so
 * node --test drives it against the generated fixture bundle;
 * FindingsScreen.js renders getState().
 *
 * Built on Day 22 under the recovery override for V4's owner Nguyễn Gia Đức
 * Trung, on app/verticals/v4_review_and_findings/findings.mjs.
 *
 *   - the list: every finding with its type, status, note and evidence; a
 *     record without evidence identifiers is shown, but cannot be opened;
 *   - open: "navigates to the strongest available evidence location" (`10` §3)
 *     - SCR-03 at the exact case and slice, or SCR-07 for an experiment-only
 *     record - as the route the navigator should push;
 *   - create: only from a case/slice context (FR-FIND-001) - SCR-08 opened
 *     with caseId + sliceIndex (from SCR-06, or another screen) shows the form,
 *     prefilled with that context; the tab alone shows the list.
 */

import { STATE } from '../../../../app/core/index.mjs';
import {
  createFindings, FINDING_TYPE, FINDING_STATUS, EVIDENCE_SCREEN, PREDICTION_VARIANT,
} from '../../../../app/verticals/v4_review_and_findings/findings.mjs';

export { FINDING_TYPE, FINDING_STATUS, PREDICTION_VARIANT };

const isId = (v) => typeof v === 'string' && v.length > 0;
const isIndex = (v) => Number.isInteger(v) && v >= 0;
const isVariant = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PREDICTION_VARIANT, v);

// The create context a route carries, or null when SCR-08 was opened bare.
// SCR-06 passes its own prediction variant; a route that names a run without
// one leaves the variant to the form (contract 1.1.0 needs it with a run).
export function contextFrom(params = {}) {
  if (!isId(params.caseId) || !isIndex(params.sliceIndex)) return null;
  const runId = isId(params.runId) ? params.runId : null;
  return Object.freeze({
    caseId: params.caseId,
    sliceIndex: params.sliceIndex,
    runId,
    variant: runId && isVariant(params.variant) ? params.variant : null,
    experimentId: isId(params.experimentId) ? params.experimentId : null,
    region: params.region && typeof params.region === 'object' ? params.region : null,
  });
}

// A location from evidenceLocation() -> the { screenId, params } to push.
// Only what the finding holds is passed on: no default variant, no invented id.
export function routeFor(location) {
  if (!location || !location.available) return null;
  if (location.screen === EVIDENCE_SCREEN.CASE_EXPLORER) {
    const p = { caseId: location.caseId, sliceIndex: location.sliceIndex };
    if (location.runId) p.runId = location.runId;
    if (location.variant) p.variant = location.variant;
    if (location.experimentId) p.experimentId = location.experimentId;
    if (location.region) p.region = location.region;
    return Object.freeze({ screenId: 'SCR-03', params: Object.freeze(p) });
  }
  if (location.screen === EVIDENCE_SCREEN.EXPERIMENT_COMPARISON) {
    return Object.freeze({ screenId: 'SCR-07', params: Object.freeze({ experimentId: location.experimentId }) });
  }
  return null;
}

// Correcting the evidence slice needs a run (SCR-06 is scoped to one). The
// variant goes along when the finding recorded it (contract 1.1.0); without
// it SCR-06 asks rather than defaulting.
export function reviewRouteFor(location) {
  if (!location || !location.available || location.screen !== EVIDENCE_SCREEN.CASE_EXPLORER || !location.runId) return null;
  const p = { runId: location.runId, caseId: location.caseId, sliceIndex: location.sliceIndex };
  if (location.variant) p.variant = location.variant;
  return Object.freeze({ screenId: 'SCR-06', params: Object.freeze(p) });
}

export function createFindingsScreen({ runtime, params = {} }) {
  const model = createFindings(runtime.client, { studyId: runtime.config.studyId });
  const context = contextFrom(params);
  const listeners = new Set();
  const blankForm = () => ({ type: null, note: '', variant: context ? context.variant : null });
  let form = context ? blankForm() : null;
  let busy = null;
  let notice = null;
  let listView = model.current.view; // the list's own state, kept apart from a failed action
  let actionView = null;             // a failed create or status change, shown over a still-valid list
  let version = 0;

  const emit = () => {
    version += 1;
    for (const fn of listeners) fn();
  };

  async function load() {
    busy = 'list';
    emit();
    listView = (await model.list()).view;
    busy = null;
    emit();
    return getState();
  }

  async function submit() {
    if (!form || busy) return getState();
    busy = 'create';
    emit();
    const s = await model.create({
      caseId: context.caseId, sliceIndex: context.sliceIndex, runId: context.runId, variant: form.variant,
      experimentId: context.experimentId, region: context.region, type: form.type, note: form.note,
    });
    busy = null;
    actionView = null;
    if (s.rejection) {
      notice = Object.freeze({ kind: 'refused', text: s.rejection.reason, problems: s.rejection.problems });
    } else if (s.view.state === STATE.SUCCESS) {
      notice = Object.freeze({ kind: 'created', text: `Finding ${s.lastCreated.finding.findingId} created (${s.lastCreated.finding.status}).` });
      form = blankForm();
    } else {
      notice = null;
      actionView = s.view; // the failure, with its own actions
    }
    emit();
    return getState();
  }

  // OPEN <-> RESOLVED through finding_patch (expected_revision = the finding's own).
  async function setStatus(findingId, status) {
    if (busy) return getState();
    busy = 'status';
    emit();
    const s = await model.patch(findingId, { status });
    busy = null;
    actionView = null;
    if (s.rejection) notice = Object.freeze({ kind: 'refused', text: s.rejection.reason });
    else if (s.view.state === STATE.SUCCESS) notice = Object.freeze({ kind: 'status', text: `Finding ${findingId} is now ${status}.` });
    else { notice = null; actionView = s.view; } // STALE_MISMATCH -> Refresh reloads the list
    emit();
    return getState();
  }

  function getState() {
    const m = model.current;
    return Object.freeze({
      version,
      view: listView,
      actionView,
      items: m.items,
      context,
      form: form ? Object.freeze({ ...form }) : null,
      // A form opened with a run but no variant asks which prediction was seen.
      needsVariant: Boolean(context && context.runId && !context.variant),
      canSubmit: Boolean(form && form.type && (!context.runId || form.variant) && !busy),
      busy,
      notice,
    });
  }

  return Object.freeze({
    getState,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load,
    setType(type) {
      if (form && Object.prototype.hasOwnProperty.call(FINDING_TYPE, type)) { form = { ...form, type }; emit(); }
    },
    setNote(note) {
      if (form && typeof note === 'string') { form = { ...form, note }; emit(); }
    },
    setVariant(variant) {
      if (form && context.runId && isVariant(variant)) { form = { ...form, variant }; emit(); }
    },
    submit,
    setStatus,
    // Routes for a listed finding, by id: where its evidence is, and where to correct it.
    routeTo: (findingId) => routeFor(model.open(findingId)),
    reviewRouteTo: (findingId) => reviewRouteFor(model.open(findingId)),
  });
}
