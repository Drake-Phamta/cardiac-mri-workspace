/*
 * Case mode capability - ONE derivation, used by SCR-02 (the list) and
 * SCR-03 (the case), so a case reads the same in both places (TC-CASE-002:
 * "reflected consistently in case list, case detail and enabled UI
 * capabilities").
 *
 * The server decides the mode; this only reads it. Contract v1.0
 * case_capability: EVALUATION carries ground_truth_available = true and
 * serves ground-truth-dependent data; INFERENCE_REVIEW carries false and
 * answers GROUND_TRUTH_UNAVAILABLE (INT-12 withholds one final-holdout case
 * this way). A row whose two fields disagree is shown as inconsistent, not
 * silently resolved in either direction.
 */

export const CAPABILITY = Object.freeze({
  EVALUATION: Object.freeze({
    key: 'EVALUATION',
    label: 'Evaluation',
    short: 'EVAL',
    detail: 'ground truth available · metrics and error views',
  }),
  INFERENCE_REVIEW: Object.freeze({
    key: 'INFERENCE_REVIEW',
    label: 'Inference & review',
    short: 'INFER',
    detail: 'no ground truth · prediction and review only',
  }),
  UNKNOWN: Object.freeze({
    key: 'UNKNOWN',
    label: 'Mode not stated',
    short: '?',
    detail: 'the server did not state a known mode',
  }),
});

export function capabilityOf(mode, groundTruthAvailable) {
  const cap = CAPABILITY[mode] && mode !== 'UNKNOWN' ? CAPABILITY[mode] : CAPABILITY.UNKNOWN;
  const gt = groundTruthAvailable === true ? true : groundTruthAvailable === false ? false : null;
  let problem = null;
  if (cap.key === 'EVALUATION' && gt !== true) {
    problem = `mode EVALUATION but ground_truth_available is ${JSON.stringify(groundTruthAvailable)}`;
  } else if (cap.key === 'INFERENCE_REVIEW' && gt !== false) {
    problem = `mode INFERENCE_REVIEW but ground_truth_available is ${JSON.stringify(groundTruthAvailable)}`;
  } else if (cap.key === 'UNKNOWN') {
    problem = `mode ${JSON.stringify(mode)} is not EVALUATION or INFERENCE_REVIEW`;
  }
  return Object.freeze({
    ...cap,
    groundTruthAvailable: gt,
    // Ground-truth-dependent UI is enabled only when BOTH say so.
    groundTruthUsable: cap.key === 'EVALUATION' && gt === true,
    consistent: problem === null,
    problem,
  });
}

/*
 * case_list `data` -> rows the screen can draw. Rows without a case_id are
 * listed separately as invalid: they cannot be opened, and inventing an id
 * would be a screen choosing its subject.
 */
export function readCaseRows(data) {
  const items = data && Array.isArray(data.items) ? data.items : [];
  const rows = [];
  const invalid = [];
  items.forEach((item, i) => {
    const caseId = item && typeof item.case_id === 'string' && item.case_id.trim() !== '' ? item.case_id : null;
    if (!caseId) {
      invalid.push(Object.freeze({ position: i + 1, reason: 'row has no case_id' }));
      return;
    }
    rows.push(Object.freeze({
      caseId,
      // Contract 1.1.0 names the row field `mode_capability` (the top-level
      // `mode` echoes the list filter); 1.0.0 called it `mode`. Read the
      // newer name first - neither is ever inferred from the other field.
      capability: capabilityOf(item.mode_capability ?? item.mode, item.ground_truth_available),
    }));
  });
  const counts = { total: rows.length, EVALUATION: 0, INFERENCE_REVIEW: 0, UNKNOWN: 0 };
  for (const r of rows) counts[r.capability.key] += 1;
  return Object.freeze({
    rows: Object.freeze(rows),
    invalid: Object.freeze(invalid),
    counts: Object.freeze(counts),
    // A next page exists on the server. The contract's case_list path has no
    // page parameter app/core can fill, so this build says so instead of
    // pretending the first page is the whole study.
    hasMore: data ? (data.next_page !== null && data.next_page !== undefined) : false,
  });
}

// Search by id substring and filter by mode. Server order is kept.
export function filterRows(rows, { query = '', mode = 'ALL' } = {}) {
  const q = String(query).trim().toLowerCase();
  return rows.filter((r) => (mode === 'ALL' || r.capability.key === mode)
    && (q === '' || r.caseId.toLowerCase().includes(q)));
}
