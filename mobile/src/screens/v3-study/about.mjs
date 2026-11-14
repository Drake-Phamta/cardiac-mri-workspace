// What the study screens tell people about their data and their numbers: the "About this data" sheet (spec 12:
// research use only, de-identified case IDs, the dataset's source and terms) and the metric legend.
// The facts come from the project's dataset record (data/DATASET_AUDIT.md) and the API contract.

export const DATASET_SOURCE_URL = 'https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/';

const section = (title, lines) => Object.freeze({ title, lines: Object.freeze(lines.filter(Boolean)) });

/* The sheet's sections. `datasetText` is the dataset the server names; `fixture` adds that numbers are placeholders. */
export function aboutData({ datasetText = null, fixture = false } = {}) {
  return Object.freeze([
    section('Where the data comes from', [
      'Left-atrium LGE MRI from the 2018 Atria Segmentation Challenge (LASC 2018), downloaded from the official '
        + 'Cardiac Atlas Project page:',
      DATASET_SOURCE_URL,
      datasetText ? `The server names this study's dataset: ${datasetText}.` : null,
    ]),
    section('Terms of use', [
      'Used under the Cardiac Atlas Project data-use policy kept with the download. Images, masks and results stay '
        + 'inside this project until that policy or a data-use agreement allows sharing them.',
    ]),
    section('Case IDs', [
      'Cases are named CASE_0001 to CASE_0154: IDs this project gave each case when the data was imported.',
      'The app receives only these IDs: no name, birth date or hospital record number.',
    ]),
    section('What these screens show', [
      'Counts and scores only: summaries per experiment and one score per case ID. No image is shown here.',
    ]),
    section('Use', [
      'For research and teaching on how the models behave. Not for diagnosis or treatment decisions, and not a '
        + 'medical device.',
    ]),
    fixture ? section('This build', ['Fixture mode: every number on these screens is a generated placeholder, not a result.']) : null,
  ].filter(Boolean));
}

// One line per case metric the server sends (contract metric_rules.case_metric_fields), in the contract's order.
export const METRIC_LEGEND = Object.freeze([
  { name: 'dice', label: 'Dice', text: 'overlap of prediction and reference, 0 to 1; higher is better' },
  { name: 'iou', label: 'IoU', text: 'overlap divided by the union of both, 0 to 1; higher is better' },
  { name: 'false_positives', label: 'False positives', text: 'voxels predicted outside the reference; lower is better' },
  { name: 'false_negatives', label: 'False negatives', text: 'reference voxels the prediction missed; lower is better' },
  {
    name: 'relative_volume_error',
    label: 'Relative volume error',
    text: 'predicted minus reference voxel count, in % of the reference; closer to 0 is better',
  },
].map((m) => Object.freeze(m)));

// Metrics in mm or mL stay locked: the contract blocks them while the geometry is not validated.
export const LOCKED_METRICS = Object.freeze([
  { name: 'hd95', label: 'HD95', text: 'locked: a distance in mm needs validated geometry, which is not validated yet' },
  { name: 'volume_ml', label: 'Volume (mL)', text: 'locked for the same reason; volumes are voxel counts' },
  { name: 'surface_distance_mm', label: 'Surface distance (mm)', text: 'locked for the same reason' },
].map((m) => Object.freeze(m)));
