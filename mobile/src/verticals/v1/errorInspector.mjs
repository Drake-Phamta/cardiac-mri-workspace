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
 */

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

// Slider-style mapping for the profile chart: position -> slice, deterministic.
export function profileIndexAt(x, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.floor((x / width) * total)));
}
