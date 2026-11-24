// A typed stand-in for the V3 endpoints, shared by v3_upgrades.test.mjs and the render smoke. The generated
// fixture answers one body whatever experiment is asked, so two runs there always have the same per-case values;
// this transport answers each experiment with its own rows, so a paired view has real differences to draw.
// Bodies follow contract 1.1.0 and still pass the client's contract check. Every other endpoint is the fixture's.

import { createFixtureTransport } from '../src/api/client.mjs';
import { matrixEntry } from '../src/screens/v3-study/readers.mjs';

// Per-case Dice of each run. CASE_0001 is the withheld inference-review case: evaluated, no per-case value.
export const PAIRED_DICE = Object.freeze({
  'EXP-U-025': { CASE_0002: 0.82, CASE_0003: 0.61, CASE_0004: 0.7, CASE_0005: 0.4 },
  'EXP-D-025': { CASE_0002: 0.86, CASE_0003: 0.58, CASE_0004: 0.79, CASE_0005: 0.52 },
});
// All six RAW runs of the matrix, for the trend chart: each family improves with more training data.
export const SIX_RUNS = Object.freeze({
  ...PAIRED_DICE,
  'EXP-U-050': { CASE_0002: 0.85, CASE_0003: 0.66, CASE_0004: 0.74, CASE_0005: 0.47 },
  'EXP-U-100': { CASE_0002: 0.88, CASE_0003: 0.7, CASE_0004: 0.77, CASE_0005: 0.55 },
  'EXP-D-050': { CASE_0002: 0.88, CASE_0003: 0.65, CASE_0004: 0.82, CASE_0005: 0.6 },
  'EXP-D-100': { CASE_0002: 0.9, CASE_0003: 0.72, CASE_0004: 0.84, CASE_0005: 0.66 },
});
const WITHHELD_CASE = 'CASE_0001';
const METRICS = ['dice', 'iou', 'false_positives', 'false_negatives', 'relative_volume_error'];
const STATS = ['n', 'mean', 'std', 'median', 'q1', 'q3', 'min', 'max', 'ci95_low', 'ci95_high'];

const runId = (experimentId, caseId) => `RUN_${experimentId.slice(4).replace('-', '')}_${caseId.slice(5)}`;
const values = (d) => ({
  dice: d, iou: Number((d / (2 - d)).toFixed(4)), false_positives: Math.round((1 - d) * 100),
  false_negatives: Math.round((1 - d) * 50), relative_volume_error: -5,
});

function quantile(sorted, q) {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (at - lo);
}

// Dice statistics over the rows with a value; the withheld case counts in n (it was evaluated).
function summary(dice) {
  const d = Object.values(dice).sort((a, b) => a - b);
  const empty = Object.fromEntries(STATS.map((s) => [s, null]));
  const out = Object.fromEntries(METRICS.map((m) => [m, { ...empty, n: d.length + 1 }]));
  if (d.length) {
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    out.dice = { ...out.dice, mean, median: quantile(d, 0.5), q1: quantile(d, 0.25), q3: quantile(d, 0.75), min: d[0], max: d[d.length - 1] };
  }
  return out;
}

function caseRows(experimentId, dice) {
  const rows = Object.entries(dice).map(([caseId, d]) => ({
    case_id: caseId, status: 'SUCCEEDED', reason: null, analysis_run_id: runId(experimentId, caseId), metric_values: values(d),
  }));
  rows.push({
    case_id: WITHHELD_CASE, status: 'WITHHELD', reason: 'inference-review case: values withheld',
    analysis_run_id: runId(experimentId, WITHHELD_CASE), metric_values: null,
  });
  return rows;
}

// The server's lowest-Dice selection: Dice ascending, then FP+FN descending, then case id.
function lowestDice(experimentId, rows) {
  const ranked = rows.filter((r) => r.status === 'SUCCEEDED').sort((a, b) => a.metric_values.dice - b.metric_values.dice
    || (b.metric_values.false_positives + b.metric_values.false_negatives) - (a.metric_values.false_positives + a.metric_values.false_negatives)
    || (a.case_id < b.case_id ? -1 : 1));
  return {
    rule_id: 'DR-010', selection_version: 'dr010-outlier/v1', experiment_id: experimentId, prediction_variant: 'RAW', metric_name: 'dice',
    cases: ranked.slice(0, 3).map((r) => ({
      case_id: r.case_id, analysis_run_id: r.analysis_run_id, metric_value: r.metric_values.dice,
      false_positives: r.metric_values.false_positives, false_negatives: r.metric_values.false_negatives,
    })),
  };
}

const idFromPath = (path) => decodeURIComponent(path.split('/experiments/')[1].split('/')[0]);
const idsFromQuery = (query) => decodeURIComponent(query.split('ids=')[1].split('&')[0]).split(',');

/**
 * dice: per-case Dice by experiment id (the experiments listed). compare: 'comparable' or 'not_comparable'.
 * noRows: experiment ids whose experiment_cases page is empty.
 */
export function v3Transport(contractJson, bundle, { dice = PAIRED_DICE, compare = 'comparable', noRows = [] } = {}) {
  const fixture = createFixtureTransport(bundle);
  const httpStatus = (code) => contractJson.errors.find((e) => e.code === code).http_status;
  const answer = (data) => ({ status: 200, data });
  return Object.freeze({
    kind: 'fixture',
    async send(resolved, options = {}) {
      switch (resolved.endpointId) {
        case 'experiment_list':
          return answer({
            evaluation_population: 'FINAL_HOLDOUT',
            items: Object.keys(dice).map((id) => ({ experiment_id: id, prediction_variant: 'RAW' })),
          });
        case 'experiment_get': {
          const id = idFromPath(resolved.path);
          const e = matrixEntry(id);
          return answer({
            experiment_id: id, model_family: e.family === 'UNET' ? 'unet' : 'dinov2', training_fraction: e.fractionPct / 100,
            split_manifest_id: 'split-A', subset_manifest_id: 'subset-A', preprocessing_version: 'pre-v1',
            postprocessing_version: 'none', checkpoint: `ckpt-${id}`, evaluation_version: 'eval-v1', prediction_variant: 'RAW',
          });
        }
        case 'experiment_metrics': {
          const id = idFromPath(resolved.path);
          const n = Object.keys(dice[id] ?? {}).length + 1;
          return answer({
            evaluation_n: n, successful_n: n, metric_summary: summary(dice[id] ?? {}), prediction_variant: 'RAW', metric_version: 'mv1',
          });
        }
        case 'experiment_cases': {
          const id = idFromPath(resolved.path);
          const rows = noRows.includes(id) ? [] : caseRows(id, dice[id] ?? {});
          const selection = lowestDice(id, rows);
          return answer({ items: rows, metric_version: 'mv1', prediction_variant: 'RAW', outlier_selection: selection });
        }
        case 'experiment_compare': {
          if (compare === 'not_comparable') {
            const code = 'NON_COMPARABLE_EXPERIMENTS';
            return { status: httpStatus(code), error: { code, message: 'different evaluation populations', request_id: 'req_v3', details: null } };
          }
          const ids = idsFromQuery(resolved.query);
          const population = [WITHHELD_CASE, ...Object.keys(dice[ids[0]] ?? {})].sort();
          return answer({
            comparable: true, compatibility_reason: null, common_evaluation_population: population,
            metric_version: 'mv1', prediction_variant: 'RAW',
            summary: Object.fromEntries(ids.map((id) => [id, summary(dice[id] ?? {})])),
          });
        }
        default:
          return fixture.send(resolved, options);
      }
    },
  });
}
