// How V4 writes things for people. SCR-06 numbers a slice with the shared formatter (lib/sliceNumber.mjs: "45 / 88").
// That one needs the number of slices. A finding row and a history row know only the slice (z = 44), so they say
// "slice 45" with this: the same counting from 1, no total.

export const sliceNumber = (index) => (Number.isInteger(index) ? index + 1 : null);

// A review status in words, for tags and notices: ACCEPTED -> "Accepted", NOT_REVIEWED -> "Not reviewed".
const STATUS_WORD = Object.freeze({
  NOT_REVIEWED: 'Not reviewed', ACCEPTED: 'Accepted', FLAGGED: 'Flagged', CORRECTED: 'Corrected',
});
export const statusWord = (status) => STATUS_WORD[status] || String(status);

// RAW -> "Raw", PROCESSED -> "Processed"; anything else says nothing.
const VARIANT_WORD = Object.freeze({ RAW: 'Raw', PROCESSED: 'Processed' });
export const variantWord = (variant) => (Object.prototype.hasOwnProperty.call(VARIANT_WORD, variant) ? VARIANT_WORD[variant] : null);

// An experiment by its label, as people say it: EXP-D-100 -> "DINOv2 100 %". These are the study's seven experiments
// (spec 08 section 2; the same words as SCR-01 and SCR-07). A screen folder does not import another one, so the table
// is kept here, and test/v4_restyle.test.mjs (RV3) lists all seven labels. An id outside the table has no label, and
// the id itself is never shown on a main surface, so the answer is null.
const EXPERIMENT_LABEL = Object.freeze({
  'EXP-U-025': 'UNet 25 %',
  'EXP-U-050': 'UNet 50 %',
  'EXP-U-100': 'UNet 100 %',
  'EXP-D-025': 'DINOv2 25 %',
  'EXP-D-050': 'DINOv2 50 %',
  'EXP-D-100': 'DINOv2 100 %',
  'EXP-D-PP': 'DINOv2 100 % post-processed',
});
export const experimentLabel = (experimentId) => (
  Object.prototype.hasOwnProperty.call(EXPERIMENT_LABEL, experimentId) ? EXPERIMENT_LABEL[experimentId] : null);

// Where something is, in words: "CASE_0029 · Slice 45 · DINOv2 100 % · Raw". Every part is optional. The case is the
// only id; the run and the experiment id stay in the Details sheets.
export function placeLine({ caseId = null, sliceIndex = null, experimentId = null, variant = null } = {}) {
  const label = experimentLabel(experimentId);
  // "post-processed" already says Processed
  const prediction = label && label.endsWith('post-processed') ? null : variantWord(variant);
  return [caseId, Number.isInteger(sliceIndex) ? `Slice ${sliceNumber(sliceIndex)}` : null, label, prediction]
    .filter(Boolean).join(' · ');
}
