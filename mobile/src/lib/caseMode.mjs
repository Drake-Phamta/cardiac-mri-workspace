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

// `11` section 6 forbids a silent variant substitution, so these are the only
// accepted values and nothing in the app defaults one. They are the
// variants prediction_slice_get serves. `10` section 3's "reviewed" is not one:
// a reviewed mask is its own artifact (reviewed_mask_slice_get) and its own
// layer, LAYER.REVIEWED_MASK, so asking prediction_slice_get for it is refused.
export const PREDICTION_VARIANT = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED' });

/*
 * The prediction variants a user may choose, from the contract when it
 * declares them (v1.0 domain_enums.prediction_variant = RAW, PROCESSED), so
 * the screen never offers a value the server must refuse. Order is the
 * contract's. There is NO default: the screen asks.
 */
export function variantOptions(contract) {
  const raw = contract && contract.raw ? contract.raw : contract;
  const declared = raw && raw.domain_enums && Array.isArray(raw.domain_enums.prediction_variant)
    ? raw.domain_enums.prediction_variant : null;
  return Object.freeze((declared || ['RAW', 'PROCESSED']).filter((v) => v === 'RAW' || v === 'PROCESSED'));
}

export const VARIANT_TEXT = Object.freeze({
  RAW: 'RAW - the network output, before post-processing',
  PROCESSED: 'PROCESSED - after the frozen post-processing step',
});

/*
 * What the user chose earlier in this app session, and nothing else.
 *
 * The prediction variant is never defaulted (`11` §6, V1 model). The first
 * case asks; after that the user's own last choice is pre-selected for the
 * next case and SHOWN as such ("chosen earlier this session") - a remembered
 * explicit choice, visible on screen, not a value the app picked.
 * Memory only: a restart asks again.
 */

const state = { variant: null };

export function rememberedVariant() {
  return state.variant;
}

export function rememberVariant(variant) {
  if (variant === 'RAW' || variant === 'PROCESSED') state.variant = variant;
}

export function forgetSession() {
  state.variant = null;
}
