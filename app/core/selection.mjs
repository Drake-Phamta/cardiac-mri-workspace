/*
 * Worst-slice selection - READER ONLY.
 *
 * DR-010 froze the rule: among slices with non-empty ground truth, rank by
 * Dice ascending, then FP+FN descending, then slice_index ascending. It also
 * froze WHO applies it: "the API returns the selection; the client never
 * re-derives it". Two clients ranking independently is two answers to the same
 * clinical question, and the one on the phone is the one a reviewer acts on.
 *
 * So this module sorts nothing. There is deliberately no `.sort(` in this
 * file, and the app-framework-neutral CI job greps for one.
 *
 * TRANSPORT, decided 2026-10-01 (DR-010a option b, contract v1.0.0):
 * analysis_run_metrics returns a `worst_slice_selection` block - rule_id,
 * selection_version, slices[{slice_index, dice, false_positives,
 * false_negatives}] - ranked by the server, worst first. It is the only
 * endpoint that carries one. A response without the block still reads as
 * `available: false`, and SCR-04 shows EMPTY_UNAVAILABLE. It must NOT be
 * worked around by ranking analysis_slice_metrics client-side - that is
 * exactly what DR-010 forbids.
 */

export const RULE_ID = 'DR-010';
export const RULE_TEXT =
  'non-empty-GT slices, Dice ascending, then FP+FN descending, then slice_index ascending';

export const UNAVAILABLE_REASON = Object.freeze({
  NOT_IN_CONTRACT: 'SELECTION_NOT_IN_CONTRACT',
  NOT_RETURNED: 'SELECTION_NOT_RETURNED',
  NO_ELIGIBLE_SLICES: 'SELECTION_NO_ELIGIBLE_SLICES',
  // A block whose `slices` is not a list: unreadable, which is not the same
  // as "no slice is eligible" (#78 QA N-10).
  MALFORMED: 'SELECTION_MALFORMED',
});

function unavailable(reason) {
  return Object.freeze({ available: false, reason, ruleId: RULE_ID, slices: Object.freeze([]) });
}

/*
 * Reads a selection the server returned. `data` is a validated response body.
 * The field names are the ones contract v1.0.0 freezes in
 * selection_rules.worst_slice_selection - that name only; no other field is
 * read as a selection (#78 QA N-10 dropped the pre-1.0 `slice_selection`).
 */
export function readSelection(data) {
  if (!data || typeof data !== 'object') return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const block = data.worst_slice_selection ?? null;
  if (!block) return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const slices = block.slices;
  if (!Array.isArray(slices)) return unavailable(UNAVAILABLE_REASON.MALFORMED);
  if (slices.length === 0) return unavailable(UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES);

  // Order comes from the server, in the order it sent. Preserved as-is.
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
