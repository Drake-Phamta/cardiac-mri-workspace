/*
 * SCR-04 Error Inspector - everything the screen decides that is not drawing.
 * Pure; tested in node (test/v1_error.test.mjs).
 *
 * Two sources of numbers, never mixed:
 *   - the SERVER: analysis_run_metrics (case-level metric_values, and the
 *     worst_slice_selection block of DR-010a option b) and
 *     analysis_slice_metrics (per-slice Dice). These are the metrics.
 *   - the MASKS ON SCREEN: TP / FP / FN pixel classes computed from the
 *     ground-truth and prediction masks the server served for this slice
 *     (maskPaths.disagreementRuns). These are a DRAWING of two artifacts,
 *     and the legend counts what is drawn.
 * When both describe the same slice, they are compared and a disagreement is
 * shown, not hidden.
 *
 * DR-010: "the API returns the selection; the client never re-derives it".
 * Nothing in this file orders slices. The selection is read with app/core's
 * readSelection (which preserves the server's order), the top entries are the
 * first ones the server sent, and the per-slice profile places each entry at
 * its own slice index - a position, not a rank. There is deliberately no
 * `.sort(` in this file; test V4x checks it.
 *
 * Two gates before any run-level number is shown (#78 QA B-2, B-3):
 *   - the run metrics must be for the variant asked for. Another one, or none,
 *     is the V1 model's own PREDICTION_VARIANT_MISMATCH state, and then no
 *     case metric, worst slice, profile or server comparison is shown;
 *   - the worst-slice block must state the rule_id AND selection_version the
 *     loaded contract pins. Anything else is unavailable with its reason, and
 *     nothing is ranked here in its place.
 * runLevel() applies both; the screen reads every run-level value from it.
 */

import { readSelection, SELECTION_UNAVAILABLE_REASON, STATE } from '../../../../app/core/index.mjs';
import { variantMismatch } from '../../../../app/verticals/v1_case_explorer/index.mjs';

export const ERROR_CLASS = Object.freeze({
  TP: Object.freeze({
    key: 'TP',
    label: 'TP - agree',
    detail: 'predicted and in the ground truth',
    color: '#4fbf7a',
  }),
  FP: Object.freeze({
    key: 'FP',
    label: 'FP - over-segmentation',
    detail: 'predicted, not in the ground truth',
    color: '#e8635a',
  }),
  FN: Object.freeze({
    key: 'FN',
    label: 'FN - missed',
    detail: 'in the ground truth, not predicted',
    color: '#4d9de0',
  }),
});

export const CLASS_ORDER = Object.freeze(['TP', 'FP', 'FN']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/*
 * analysis_run_metrics data -> what the summary card shows. Values that are
 * missing or not numbers stay null and are shown as "not stated" - never 0.
 */
export function readRunMetrics(data) {
  const v = (data && typeof data.metric_values === 'object' && data.metric_values) || {};
  return Object.freeze({
    state: data ? (data.metric_state ?? null) : null,
    version: data ? (data.metric_version ?? null) : null,
    aggregation: data ? (data.aggregation_level ?? null) : null,
    variant: data ? (data.prediction_variant ?? null) : null,
    referenceMaskId: data ? (data.reference_mask_id ?? null) : null,
    predictionMaskId: data ? (data.prediction_mask_id ?? null) : null,
    dice: num(v.dice),
    iou: num(v.iou),
    falsePositives: num(v.false_positives),
    falseNegatives: num(v.false_negatives),
    relativeVolumeError: num(v.relative_volume_error),
  });
}

export function fmt(value, digits = 3) {
  if (value === null || value === undefined) return 'not stated';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
}

/*
 * The per-slice error profile: one cell per slice of the volume, holding the
 * server's entry for that slice or null ("not eligible": no ground truth on
 * that slice, or both empty - DR-010 eligibility). A null cell is drawn as
 * absent, never as a zero-height bar that would read as "no error".
 * Entries whose slice_index is outside the volume are reported, not dropped.
 */
export function profileFromSelection(selection, total) {
  const cells = Array.from({ length: Number.isInteger(total) && total > 0 ? total : 0 }, () => null);
  const problems = [];
  let maxError = 0;
  if (selection && selection.available) {
    for (const s of selection.slices) {
      const z = s.sliceIndex;
      if (!Number.isInteger(z) || z < 0 || z >= cells.length) {
        problems.push(`selection names slice ${z}, outside 0..${cells.length - 1}`);
        continue;
      }
      if (cells[z]) {
        problems.push(`selection names slice ${z} twice`);
        continue;
      }
      const fp = num(s.falsePositives);
      const fn = num(s.falseNegatives);
      const errorPixels = fp !== null && fn !== null ? fp + fn : null;
      if (errorPixels !== null) maxError = Math.max(maxError, errorPixels);
      cells[z] = Object.freeze({ sliceIndex: z, rank: s.rank, dice: num(s.dice), fp, fn, errorPixels });
    }
  }
  return Object.freeze({ cells: Object.freeze(cells), maxError, problems: Object.freeze(problems) });
}

// The first n entries in the SERVER's order (worst first). Not a sort.
export function topEntries(selection, n = 5) {
  return selection && selection.available ? selection.slices.slice(0, n) : [];
}

export function worstLabel(entry) {
  if (!entry) return null;
  return `z ${entry.sliceIndex} (slice ${entry.sliceIndex + 1}) · Dice ${fmt(entry.dice)} · FP ${fmt(entry.falsePositives ?? entry.fp)} · FN ${fmt(entry.falseNegatives ?? entry.fn)}`;
}

/*
 * #78 QA N-7: a server entry opens exactly the slice it names. One that names
 * no slice of this volume - z 90 of an 88-slice case, or no index at all - is
 * listed as such and never opened: clamping it would open z 87, a slice the
 * server did not name. (The scrubber's clamp is another matter: it keeps a
 * gesture inside the volume.)
 */
export function inVolume(entry, total) {
  return Boolean(entry) && Number.isInteger(total) && Number.isInteger(entry.sliceIndex)
    && entry.sliceIndex >= 0 && entry.sliceIndex < total;
}

// What a worst-slice row says when it cannot be opened; null when it can.
export function outsideVolumeNote(entry, total) {
  if (!entry || inVolume(entry, total)) return null;
  return Number.isInteger(total) && total > 0
    ? `outside this volume (z 0..${total - 1}) - not opened`
    : 'the case states no slice count - not opened';
}

/*
 * The masks on screen against the server's numbers for the same slice. The
 * selection counts in "pixels of the slice" (contract selection_rules), the
 * same unit the masks are counted in, so they must agree exactly.
 */
export function compareWithServer(cell, counts) {
  if (!cell || !counts) return Object.freeze({ checked: false, consistent: null, text: null });
  const diffs = [];
  if (cell.fp !== null && cell.fp !== counts.fp) diffs.push(`FP server ${cell.fp} vs masks ${counts.fp}`);
  if (cell.fn !== null && cell.fn !== counts.fn) diffs.push(`FN server ${cell.fn} vs masks ${counts.fn}`);
  return Object.freeze({
    checked: true,
    consistent: diffs.length === 0,
    text: diffs.length === 0
      ? `Matches the server for this slice (FP ${counts.fp}, FN ${counts.fn}).`
      : `Differs from the server for this slice: ${diffs.join('; ')}.`,
  });
}

/*
 * DR-013a addendum (#78 QA N-6, TC-ERR-002): the classes are drawn here, but
 * every number on this screen is the server's, and those numbers are about the
 * masks the run metrics name - reference_mask_id and prediction_mask_id. The
 * masks drawn must be those masks (their ids as the slice responses state them:
 * the V1 model's groundTruthRef / predictionRef.artifactId). When they differ,
 * or the run metrics name none, the screen says so and does not compare the
 * drawn classes with the server's FP / FN: the two would describe different
 * masks. Nothing drawn (a ref missing) is nothing to check.
 */
export function compareMaskIds(runMetrics, displayed) {
  const gt = displayed ? displayed.groundTruthRef : null;
  const pred = displayed ? displayed.predictionRef : null;
  if (!runMetrics || !gt || !pred) return Object.freeze({ checked: false, consistent: null, text: null });
  const name = (v) => (v === null || v === undefined || v === '' ? 'none' : String(v));
  const diffs = [];
  for (const [label, server, drawn] of [
    ['reference', runMetrics.referenceMaskId, gt.artifactId],
    ['prediction', runMetrics.predictionMaskId, pred.artifactId],
  ]) {
    if (name(server) === 'none' || name(server) !== name(drawn)) {
      diffs.push(`${label} drawn ${name(drawn)}, run metrics name ${name(server)}`);
    }
  }
  return Object.freeze({
    checked: true,
    consistent: diffs.length === 0,
    text: diffs.length === 0
      ? `The masks drawn are the ones the server's numbers refer to (reference ${name(gt.artifactId)}, prediction ${name(pred.artifactId)}).`
      : `The masks drawn are not the ones the server's numbers refer to: ${diffs.join('; ')}. `
        + 'The drawn classes are not compared with the server\'s FP / FN.',
  });
}

// Slider-style mapping for the profile chart: position -> slice, deterministic.
export function profileIndexAt(x, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.floor((x / width) * total)));
}

// ----- run level: the two gates ------------------------------------------------------

/*
 * B-3 (#78 QA), `11` §6, TC-MASK-004: the run metrics belong to the variant the
 * server SAYS it served. Another one, or none, is a substituted answer. It gets
 * the state the V1 model gives a substituted prediction slice:
 * PREDICTION_VARIANT_MISMATCH, "Asked for X, served Y; a substituted variant is
 * not shown." Any other view passes through unchanged.
 */
export function runMetricsView(view, requested) {
  if (!view || view.state !== STATE.SUCCESS) return view;
  const served = view.data ? (view.data.prediction_variant ?? null) : null;
  return served === requested ? view : variantMismatch(requested, served);
}

/*
 * B-2 (#78 QA), DR-010: a worst-slice block is shown as DR-010's only when it
 * states the rule_id AND the selection_version that the loaded contract pins
 * in selection_rules.worst_slice_selection (contract 1.1.0: DR-010,
 * dr010-worst-slice/v1). Both values are read from the contract, never written
 * here. A contract that pins nothing lets nothing through.
 */
export const SELECTION_GATE = Object.freeze({
  RULE_UNSUPPORTED: 'SELECTION_RULE_UNSUPPORTED',
  VERSION_UNSUPPORTED: 'SELECTION_VERSION_UNSUPPORTED',
});

const pinnedValue = (v) => (typeof v === 'string' && v !== '' ? v : null);

export function pinnedSelection(contract) {
  const rules = contract && contract.raw ? contract.raw.selection_rules : null;
  const pin = rules ? rules.worst_slice_selection : null;
  return Object.freeze({
    ruleId: pinnedValue(pin && pin.rule_id),
    selectionVersion: pinnedValue(pin && pin.selection_version),
  });
}

function unsupported(reason, served, pinned) {
  return Object.freeze({
    available: false,
    reason,
    ruleId: served.ruleId,
    selectionVersion: served.selectionVersion,
    served: Object.freeze(served),
    pinned,
    slices: Object.freeze([]),
  });
}

/*
 * analysis_run_metrics data -> the selection SCR-04 may show. app/core's
 * readSelection reads the block (server order kept, nothing ranked). The gate
 * then checks what the server actually SENT in that block, because
 * readSelection fills a missing rule_id with DR-010.
 */
export function readWorstSlices(data, pinned) {
  const pin = pinned || pinnedSelection(null);
  const selection = readSelection(data);
  // The block readSelection read: the contract's field only, no alias (#78 QA N-10).
  const block = data && typeof data === 'object' ? (data.worst_slice_selection ?? null) : null;
  if (!block) return selection; // not returned: unavailable, with its own reason
  const served = {
    ruleId: typeof block === 'object' ? (block.rule_id ?? null) : null,
    selectionVersion: typeof block === 'object' ? (block.selection_version ?? null) : null,
  };
  if (pin.ruleId === null || served.ruleId !== pin.ruleId) {
    return unsupported(SELECTION_GATE.RULE_UNSUPPORTED, served, pin);
  }
  if (pin.selectionVersion === null || served.selectionVersion !== pin.selectionVersion) {
    return unsupported(SELECTION_GATE.VERSION_UNSUPPORTED, served, pin);
  }
  return selection;
}

/*
 * Everything SCR-04 shows at run level, from one analysis_run_metrics view.
 * Outside SUCCESS (a variant mismatch included) there is no case metric, no
 * worst slice and no profile cell, so no slice is compared with the server.
 */
export function runLevel(view, { variant, pinned, total }) {
  const shown = runMetricsView(view, variant);
  const data = shown && shown.state === STATE.SUCCESS ? shown.data : null;
  const selection = readWorstSlices(data, pinned);
  return Object.freeze({
    view: shown,
    metrics: data ? readRunMetrics(data) : null,
    selection,
    profile: profileFromSelection(selection, total),
    worst: topEntries(selection, 5),
  });
}

/*
 * The worst-slice card when nothing is listed. A gated block names its reason
 * code, the value the server sent and the one this build shows.
 */
export function selectionNote(selection) {
  if (!selection || selection.available) return null;
  const gated = (field, served, pinned) => Object.freeze({
    tone: 'warn',
    text: `${selection.reason}: the server sent ${served === null || served === undefined ? `no ${field}` : `${field} "${String(served)}"`}; `
      + `${pinned === null ? `the loaded contract pins no ${field}` : `this build shows only "${pinned}"`}. `
      + 'Its worst slices are not listed, and none are ranked here instead.',
  });
  switch (selection.reason) {
    case SELECTION_GATE.RULE_UNSUPPORTED:
      return gated('rule_id', selection.served.ruleId, selection.pinned.ruleId);
    case SELECTION_GATE.VERSION_UNSUPPORTED:
      return gated('selection_version', selection.served.selectionVersion, selection.pinned.selectionVersion);
    case SELECTION_UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES:
      return Object.freeze({ tone: 'neutral', text: 'No slice has non-empty ground truth, so there is no worst slice to rank.' });
    case SELECTION_UNAVAILABLE_REASON.MALFORMED:
      return Object.freeze({
        tone: 'warn',
        text: `${selection.reason}: the server's worst-slice selection carries no list of slices, so it cannot be read. `
          + 'Its worst slices are not listed, and none are ranked here instead.',
      });
    default:
      return Object.freeze({ tone: 'neutral', text: 'The server did not return a worst-slice selection for this run.' });
  }
}

// Why the profile is empty, in the same terms as the worst-slice card. null = draw it.
export function profileNote(level) {
  if (!level || !level.view || level.view.state !== STATE.SUCCESS) {
    return 'No profile without the run metrics (see the worst-slice card).';
  }
  if (level.selection.available) return null;
  switch (level.selection.reason) {
    case SELECTION_GATE.RULE_UNSUPPORTED:
    case SELECTION_GATE.VERSION_UNSUPPORTED:
      return 'No profile: the server\'s worst-slice selection is not one this build shows (see above).';
    case SELECTION_UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES:
      return 'No profile: no slice has non-empty ground truth.';
    case SELECTION_UNAVAILABLE_REASON.MALFORMED:
      return 'No profile: the server\'s worst-slice selection cannot be read (see above).';
    default:
      return 'No profile: the server returned no worst-slice selection for this run.';
  }
}
