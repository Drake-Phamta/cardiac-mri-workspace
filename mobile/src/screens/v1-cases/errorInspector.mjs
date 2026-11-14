/*
 * SCR-04 Error Inspector logic, plain JS that Node tests import. The server's metrics and worst slices are kept
 * apart from the TP / FP / FN counted from the masks on screen; when both cover a slice, they are compared.
 * Slices are never ranked here (DR-010: the server ranks, the client only reads), so this file has no `.sort(`.
 */

import { STATE } from '../../api/states.mjs';
import { errorClass } from '../../components/tokens.mjs';
import { variantMismatch } from './cases.mjs';

// Colour-blind safe: green / magenta / blue instead of a red-green pair, and FP's outline is dashed, so the
// classes differ by line style and by name as well as by colour (test/v1_colours.test.mjs measures them).
export const ERROR_CLASS = Object.freeze({
  TP: Object.freeze({
    key: 'TP',
    label: 'TP - agree',
    detail: 'predicted and in the ground truth',
    color: errorClass.TP,
    dashed: false,
  }),
  FP: Object.freeze({
    key: 'FP',
    label: 'FP - over-segmentation',
    detail: 'predicted, not in the ground truth',
    color: errorClass.FP,
    dashed: true,
  }),
  FN: Object.freeze({
    key: 'FN',
    label: 'FN - missed',
    detail: 'in the ground truth, not predicted',
    color: errorClass.FN,
    dashed: false,
  }),
});

export const CLASS_ORDER = Object.freeze(['TP', 'FP', 'FN']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// analysis_run_metrics data -> the case metrics card. Missing or non-numeric values stay null ("not stated"), never 0.
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
 * The error profile: one cell per slice, holding the server's entry or null for a slice that is not eligible (no
 * ground truth there). A null cell is drawn as no bar, never as a zero bar that would read as "no error". Entries
 * outside the volume are reported, not dropped.
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

// The first n entries in the server's order (worst first).
export function topEntries(selection, n = 5) {
  return selection && selection.available ? selection.slices.slice(0, n) : [];
}

export function worstLabel(entry) {
  if (!entry) return null;
  return `z ${entry.sliceIndex} (slice ${entry.sliceIndex + 1}) · Dice ${fmt(entry.dice)} · FP ${fmt(entry.falsePositives ?? entry.fp)} · FN ${fmt(entry.falseNegatives ?? entry.fn)}`;
}

// A server entry opens exactly the slice it names. One outside this volume (z 90 of 88 slices, or no index) is
// listed but never opened: clamping it would open a slice the server did not name.
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

// The drawn masks against the server's FP / FN for the same slice. Both count pixels of the slice, so they must
// match exactly.
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
 * The server's numbers are about the masks the run metrics name (reference_mask_id, prediction_mask_id). If the
 * drawn masks have other ids, or the metrics name none, the screen says so and skips the FP / FN comparison,
 * because the two would describe different masks. Nothing drawn means nothing to check.
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

// Profile chart x -> slice index, the same mapping as the slider.
export function profileIndexAt(x, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.floor((x / width) * total)));
}

// ----- Run level: two gates before any run-level number is shown -----

/*
 * Gate 1: the run metrics must be for the variant the server says it served (spec 11 §6). Another one, or none,
 * gets PREDICTION_VARIANT_MISMATCH, the same state as a substituted prediction slice. Other views pass through.
 */
export function runMetricsView(view, requested) {
  if (!view || view.state !== STATE.SUCCESS) return view;
  const served = view.data ? (view.data.prediction_variant ?? null) : null;
  return served === requested ? view : variantMismatch(requested, served);
}

/*
 * Gate 2: a worst-slice block is shown only when its rule_id and selection_version equal the ones the loaded
 * contract pins in selection_rules.worst_slice_selection. A contract that pins nothing lets nothing through.
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

// analysis_run_metrics data -> the selection SCR-04 may show. The gate checks the raw block the server sent,
// because readSelection fills a missing rule_id with DR-010.
export function readWorstSlices(data, pinned) {
  const pin = pinned || pinnedSelection(null);
  const selection = readSelection(data);
  // The same block readSelection reads (the contract's field name only).
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

// Everything SCR-04 shows at run level, through both gates. Outside SUCCESS (a variant mismatch included) there is
// no case metric, worst slice or profile, so no slice is compared with the server.
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

// Worst-slice card text when nothing is listed. A gated block names its reason, the value sent and the one accepted.
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
    case UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES:
      return Object.freeze({ tone: 'neutral', text: 'No slice has non-empty ground truth, so there is no worst slice to rank.' });
    case UNAVAILABLE_REASON.MALFORMED:
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
    case UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES:
      return 'No profile: no slice has non-empty ground truth.';
    case UNAVAILABLE_REASON.MALFORMED:
      return 'No profile: the server\'s worst-slice selection cannot be read (see above).';
    default:
      return 'No profile: the server returned no worst-slice selection for this run.';
  }
}

/*
 * Worst-slice selection reader. The server ranks slices by the DR-010 rule (RULE_TEXT) and returns the ranked list
 * as worst_slice_selection in analysis_run_metrics; this code only reads it. A response without the block is
 * unavailable. It is never replaced by ranking slices on the phone, which would give a second, different answer.
 */

export const RULE_ID = 'DR-010';
export const RULE_TEXT =
  'non-empty-GT slices, Dice ascending, then FP+FN descending, then slice_index ascending';

export const UNAVAILABLE_REASON = Object.freeze({
  NOT_IN_CONTRACT: 'SELECTION_NOT_IN_CONTRACT',
  NOT_RETURNED: 'SELECTION_NOT_RETURNED',
  NO_ELIGIBLE_SLICES: 'SELECTION_NO_ELIGIBLE_SLICES',
  // `slices` is not a list: unreadable, which is not the same as "no eligible slice".
  MALFORMED: 'SELECTION_MALFORMED',
});

function unavailable(reason) {
  return Object.freeze({ available: false, reason, ruleId: RULE_ID, slices: Object.freeze([]) });
}

// Reads the selection from a validated response body. Only the contract's field name, worst_slice_selection, is read.
export function readSelection(data) {
  if (!data || typeof data !== 'object') return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const block = data.worst_slice_selection ?? null;
  if (!block) return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const slices = block.slices;
  if (!Array.isArray(slices)) return unavailable(UNAVAILABLE_REASON.MALFORMED);
  if (slices.length === 0) return unavailable(UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES);

  // Kept in the order the server sent; rank is the position in that list.
  return Object.freeze({
    available: true,
    reason: null,
    ruleId: block.rule_id ?? RULE_ID,
    selectionVersion: block.selection_version ?? null,
    metricVersion: block.metric_version ?? data.metric_version ?? null,
    slices: Object.freeze(slices.map((s, rank) => Object.freeze({
      rank,
      sliceIndex: s.slice_index,
      dice: s.dice ?? null,
      falsePositives: s.false_positives ?? null,
      falseNegatives: s.false_negatives ?? null,
    }))),
  });
}

export function worstSlice(selection) {
  return selection.available ? selection.slices[0] : null;
}
