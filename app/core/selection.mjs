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
 * OPEN ISSUE, recorded here because this is where someone will look for it:
 * no endpoint in contract.json returns a worst-slice selection today. The
 * fields exist nowhere - not on analysis_run_get, not on analysis_run_metrics.
 * A Decision Request is open (Day 10) while the contract is still DRAFT v0.
 * Until it resolves, readSelection returns `available: false` and SCR-04 shows
 * EMPTY_UNAVAILABLE, which is honest. It must NOT be worked around by ranking
 * analysis_slice_metrics client-side - that is exactly what DR-010 forbids.
 */

export const RULE_ID = 'DR-010';
export const RULE_TEXT =
  'non-empty-GT slices, Dice ascending, then FP+FN descending, then slice_index ascending';

export const UNAVAILABLE_REASON = Object.freeze({
  NOT_IN_CONTRACT: 'SELECTION_NOT_IN_CONTRACT',
  NOT_RETURNED: 'SELECTION_NOT_RETURNED',
  NO_ELIGIBLE_SLICES: 'SELECTION_NO_ELIGIBLE_SLICES',
});

function unavailable(reason) {
  return Object.freeze({ available: false, reason, ruleId: RULE_ID, slices: Object.freeze([]) });
}

/*
 * Reads a selection the server returned. `data` is a validated response body.
 * The field names are the ones the Decision Request proposes; if the decision
 * lands on different names, this function changes and nothing else does.
 */
export function readSelection(data) {
  if (!data || typeof data !== 'object') return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const block = data.worst_slice_selection ?? data.slice_selection ?? null;
  if (!block) return unavailable(UNAVAILABLE_REASON.NOT_RETURNED);

  const slices = Array.isArray(block.slices) ? block.slices : [];
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
