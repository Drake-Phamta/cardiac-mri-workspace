/*
 * Case mode and prediction variant, shared by the case list and the case screen so both read a case alike.
 * The server decides the mode: EVALUATION has ground truth, INFERENCE_REVIEW has none.
 * A row whose mode and ground_truth_available disagree is shown as inconsistent, never silently resolved.
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
    // Ground-truth views are enabled only when both fields say so.
    groundTruthUsable: cap.key === 'EVALUATION' && gt === true,
    consistent: problem === null,
    problem,
  });
}

// The only accepted variants, and nothing defaults one (spec 11 §6). A reviewed mask is not a
// variant: it has its own endpoint (reviewed_mask_slice_get) and its own layer.
export const PREDICTION_VARIANT = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED' });

// Variants the user may choose, in the contract's order, so the screen never offers one the server
// refuses. There is no default: the screen asks.
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
 * The variant the user chose earlier in this app session, kept in memory only. The first case asks;
 * later cases pre-select that choice and say so on screen, so the app never picks one by itself.
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
