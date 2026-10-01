/*
 * V3 readers - pure functions over VALIDATED response data.
 *
 * Every function here READS what the server said and reports what it could
 * not read. None of them computes a scientific result:
 *
 *   - comparability is the server's verdict (`11` section 5), read through
 *     app/core comparability.mjs, never derived from manifest ids;
 *   - outliers are the server's DR-010 selection, kept in the order served.
 *     There is deliberately no `.sort(` anywhere in this vertical, and
 *     test_study_and_compare.mjs fails the build if one appears;
 *   - a count or a metric that is absent, or present with the wrong type, is
 *     UNAVAILABLE with a reason and the value that was served. It is never 0,
 *     never NaN, never a blank that a chart would draw as 0 (`10` section 7).
 *
 * WHERE CONTRACT 11 (DRAFT v0) STOPS
 *
 * contract.json names the V3 response fields but not what is inside four of
 * them: `metric_summary`, `experiment_compare.summary`, the per-case metric
 * values on `experiment_cases` rows, and the DR-010 outlier selection (no
 * endpoint returns one yet - the same gap selection.mjs records for the worst
 * slice). PROPOSED_SHAPES below is the one place this vertical assumes a
 * shape. If the contract freeze (INT-11) lands on different names, this block
 * and the reader that uses each name change, and nothing else does.
 */

export const PROPOSED_SHAPES = Object.freeze({
  metric_summary: '{ "<metric_name>": { "mean", "median", "std", "q1", "q3", "min", "max", "ci95_low", "ci95_high" } } - numbers; any stat may be absent',
  experiment_compare_summary: '{ "<experiment_id>": <metric_summary shape> } - over the common evaluation population',
  experiment_cases_row: '{ case_id, status: SUCCEEDED|FAILED|EXCLUDED, reason, analysis_run_id, metrics: { "<metric_name>": number|null } }',
  experiment_list_row: '{ experiment_id, ... }',
  outlier_selection: '{ rule_id: "DR-010", experiment_id, prediction_variant, metric_name, cases: [{ case_id, analysis_run_id, metric_value }] } on experiment_cases, and on study_get.experiment_summary',
});

export const FAMILY = Object.freeze({ UNET: 'UNET', DINOV2: 'DINOV2' });

// The two prediction variants an experiment can be evaluated on. These are the
// same spellings V1's createCaseExplorer accepts, so a navigation intent can be
// handed to SCR-03 unchanged.
export const LANE = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED' });

/*
 * `08` section 2 - the minimum experiment matrix, in the spec's order. The
 * order is a layout, never a ranking: Khánh's design rationale (TC-TEAM-001
 * package section 2) is that the UI cannot reorder to imply a winner.
 *
 * `lane` is the prediction variant `08` section 2 defines the experiment BY.
 * It is checked against what the server declares, never substituted for it.
 */
export const MATRIX = Object.freeze([
  { id: 'EXP-U-025', family: FAMILY.UNET, fractionPct: 25, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-U-050', family: FAMILY.UNET, fractionPct: 50, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-U-100', family: FAMILY.UNET, fractionPct: 100, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-025', family: FAMILY.DINOV2, fractionPct: 25, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-050', family: FAMILY.DINOV2, fractionPct: 50, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-100', family: FAMILY.DINOV2, fractionPct: 100, lane: LANE.RAW, question: 'RQ-A' },
  // Derived from the SAME raw predictions as EXP-D-100 (`08` section 2, section 9).
  { id: 'EXP-D-PP', family: FAMILY.DINOV2, fractionPct: 100, lane: LANE.PROCESSED, question: 'RQ-B', derivedFrom: 'EXP-D-100' },
].map((e) => Object.freeze(e)));

export const MATRIX_IDS = Object.freeze(MATRIX.map((e) => e.id));

export function matrixEntry(id) {
  return MATRIX.find((e) => e.id === id) ?? null;
}

/*
 * The comparisons this vertical asks the SERVER to judge. Each is one
 * experiment_compare call; the verdict, its reason and the common population
 * come back from the server and are shown as served.
 *
 * The two TREND groups decide whether a family's 25 -> 50 -> 100 points may be
 * joined into a line. A line between points from different populations would
 * be a trend the data does not support, so it is drawn only on COMPARABLE.
 */
export const COMPARISONS = Object.freeze([
  { id: 'RQ-A-025', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 25 %', experimentIds: ['EXP-U-025', 'EXP-D-025'] },
  { id: 'RQ-A-050', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 50 %', experimentIds: ['EXP-U-050', 'EXP-D-050'] },
  { id: 'RQ-A-100', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 100 %', experimentIds: ['EXP-U-100', 'EXP-D-100'] },
  { id: 'RQ-A-TREND-UNET', question: 'RQ-A', kind: 'TREND', family: FAMILY.UNET, label: 'UNet 25 -> 50 -> 100 %', experimentIds: ['EXP-U-025', 'EXP-U-050', 'EXP-U-100'] },
  { id: 'RQ-A-TREND-DINOV2', question: 'RQ-A', kind: 'TREND', family: FAMILY.DINOV2, label: 'DINOv2 25 -> 50 -> 100 %', experimentIds: ['EXP-D-025', 'EXP-D-050', 'EXP-D-100'] },
  { id: 'RQ-B', question: 'RQ-B', kind: 'ABLATION', label: 'DINOv2 100 %: raw vs post-processed', experimentIds: ['EXP-D-100', 'EXP-D-PP'] },
].map((c) => Object.freeze({ ...c, experimentIds: Object.freeze([...c.experimentIds]) })));

/*
 * DR-010, approved: the operational "outlier". Cited, never applied here.
 */
export const OUTLIER_RULE = Object.freeze({
  id: 'DR-010',
  text: 'the three successfully evaluated cases with the lowest case-level 3D Dice, for the explicitly '
    + 'selected experiment and prediction variant; ties: higher FP+FN voxel count first, then case_id',
});

// Per-case row statuses. `08` section 8.1: failed and excluded cases are never
// dropped, so every row is kept; only SUCCEEDED rows with a value are plotted.
export const ROW_STATUS = Object.freeze({ SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', EXCLUDED: 'EXCLUDED' });

export const UNAVAILABLE = Object.freeze({
  NOT_RETURNED: 'NOT_RETURNED',
  WRONG_TYPE: 'WRONG_TYPE',
  NO_READABLE_STATISTIC: 'NO_READABLE_STATISTIC',
  OUTLIERS_NOT_RETURNED: 'OUTLIERS_NOT_RETURNED',
  OUTLIERS_UNREADABLE: 'OUTLIERS_UNREADABLE',
  OUTLIERS_UNDER_ANOTHER_RULE: 'OUTLIERS_UNDER_ANOTHER_RULE',
  OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT: 'OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT',
  OUTLIERS_FOR_ANOTHER_EXPERIMENT: 'OUTLIERS_FOR_ANOTHER_EXPERIMENT',
  OUTLIERS_FOR_ANOTHER_VARIANT: 'OUTLIERS_FOR_ANOTHER_VARIANT',
  NO_ELIGIBLE_CASES: 'NO_ELIGIBLE_CASES',
  // experiment_list answered with no rows: no experiment is listed yet.
  NO_EXPERIMENTS_LISTED: 'NO_EXPERIMENTS_LISTED',
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const absent = (v) => v === undefined || v === null;

/*
 * What a screen shows for a value it could not read: the reason AND what the
 * server actually sent, so "unavailable" is diagnosable rather than mysterious.
 * `served` is shortened, never interpreted.
 */
function servedForDisplay(v) {
  if (absent(v)) return null;
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function unavailableValue(v, wrongType = UNAVAILABLE.WRONG_TYPE) {
  return Object.freeze({
    available: false, value: null,
    reason: absent(v) ? UNAVAILABLE.NOT_RETURNED : wrongType,
    served: servedForDisplay(v),
  });
}

/* A count is a non-negative integer. Anything else is unavailable, not 0. */
export function readCount(v) {
  if (Number.isInteger(v) && v >= 0) return Object.freeze({ available: true, value: v, reason: null, served: String(v) });
  return unavailableValue(v);
}

export function readNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Object.freeze({ available: true, value: v, reason: null, served: String(v) });
  return unavailableValue(v);
}

/*
 * `08` section 8.1 and NFR-REP-003: intended N and successful N are two
 * numbers and are always shown as two. They are not subtracted into a "failed"
 * count here - the failed and excluded rows themselves come from
 * experiment_cases, with their reasons, which is what `08` asks for.
 */
export function readCohortN(data) {
  const intended = readCount(data?.evaluation_n);
  const successful = readCount(data?.successful_n);
  let consistency = null;
  if (intended.available && successful.available) {
    consistency = successful.value <= intended.value ? 'CONSISTENT' : 'SUCCESSFUL_EXCEEDS_INTENDED';
  }
  const show = (c) => (c.available ? String(c.value) : 'unavailable');
  return Object.freeze({
    intended,
    successful,
    consistency,
    text: `N intended ${show(intended)} · N successful ${show(successful)}`,
  });
}

const VARIANT_SPELLINGS = Object.freeze({
  RAW: LANE.RAW, RAW_PREDICTION: LANE.RAW,
  PROCESSED: LANE.PROCESSED, PROCESSED_PREDICTION: LANE.PROCESSED,
});

/*
 * Contract 11 examples say RAW_PREDICTION, Contract 2 says RAW_PREDICTION /
 * PROCESSED_PREDICTION, the generated fixture says RAW, `11` section 6 says
 * raw|processed. All four spell the same two lanes. `declared` keeps the
 * server's own spelling for display; an unknown spelling has lane null and is
 * treated as undeclared, never guessed.
 */
export function readVariant(v) {
  const lane = typeof v === 'string' ? (VARIANT_SPELLINGS[v.toUpperCase()] ?? null) : null;
  return Object.freeze({ declared: absent(v) ? null : v, lane, readable: lane !== null });
}

export function readFamily(v) {
  let family = null;
  if (typeof v === 'string') {
    const key = v.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.startsWith('unet')) family = FAMILY.UNET;
    else if (key.startsWith('dinov2')) family = FAMILY.DINOV2;
  }
  return Object.freeze({ declared: absent(v) ? null : v, family, readable: family !== null });
}

// Contract 2 enumerates training_fraction as 0.25 | 0.5 | 1.0. Nothing else is
// read as a fraction: "25" or 25 would be a guess about units.
const FRACTIONS = new Map([[0.25, 25], [0.5, 50], [1, 100]]);

export function readFraction(v) {
  const pct = typeof v === 'number' ? (FRACTIONS.get(v) ?? null) : null;
  return Object.freeze({ declared: absent(v) ? null : v, pct, readable: pct !== null });
}

/*
 * An evaluation population is a manifest id, an object with an id and n, or a
 * list of case ids. It is shown as served; `n` is only filled when the server
 * gave a count or a list to count.
 */
export function readPopulation(v) {
  if (Array.isArray(v)) {
    return Object.freeze({ available: true, label: `${v.length} cases`, n: v.length, served: servedForDisplay(v) });
  }
  if (isObject(v)) {
    const n = Number.isInteger(v.n) && v.n >= 0 ? v.n : (Number.isInteger(v.case_count) ? v.case_count : null);
    const id = v.manifest_id ?? v.id ?? null;
    return Object.freeze({
      available: id !== null || n !== null,
      label: [id, n !== null ? `N ${n}` : null].filter(Boolean).join(' · ') || null,
      n,
      served: servedForDisplay(v),
    });
  }
  if (typeof v === 'string' && v.length > 0) return Object.freeze({ available: true, label: v, n: null, served: v });
  return Object.freeze({ available: false, label: null, n: null, served: servedForDisplay(v) });
}

const PROVENANCE_FIELDS = Object.freeze([
  'split_manifest_id', 'subset_manifest_id', 'preprocessing_version', 'postprocessing_version',
  'checkpoint', 'evaluation_version',
]);

/*
 * experiment_get, checked against the `08` section 2 cell it is meant to fill.
 *
 * A mismatch is REPORTED, never repaired: the cell is not moved to wherever the
 * server's declaration would put it, and the declaration is not overwritten by
 * the spec's. The screen shows both and says they disagree.
 */
export function readExperimentIdentity(data, expected) {
  const servedId = data?.experiment_id ?? null;
  const family = readFamily(data?.model_family);
  const fraction = readFraction(data?.training_fraction);
  const variant = readVariant(data?.prediction_variant);
  const problems = [];
  if (servedId !== expected.id) {
    problems.push(`asked for ${expected.id}; the server answered for ${servedForDisplay(servedId) ?? 'no experiment_id'}`);
  }
  if (family.family !== expected.family) {
    problems.push(`08 section 2 makes ${expected.id} ${expected.family}; model_family is ${servedForDisplay(family.declared) ?? 'absent'}`);
  }
  if (fraction.pct !== expected.fractionPct) {
    problems.push(`08 section 2 makes ${expected.id} ${expected.fractionPct} %; training_fraction is ${servedForDisplay(fraction.declared) ?? 'absent'}`);
  }
  if (variant.lane !== expected.lane) {
    problems.push(`08 section 2 makes ${expected.id} ${expected.lane}; prediction_variant is ${servedForDisplay(variant.declared) ?? 'absent'}`);
  }
  const provenance = {};
  for (const f of PROVENANCE_FIELDS) provenance[f] = absent(data?.[f]) ? null : data[f];
  return Object.freeze({
    servedId,
    idConfirmed: servedId === expected.id,
    family, fraction, variant,
    provenance: Object.freeze(provenance),
    problems: Object.freeze(problems),
    consistent: problems.length === 0,
  });
}

const SUMMARY_STATS = Object.freeze(['mean', 'median', 'std', 'q1', 'q3', 'min', 'max', 'ci95_low', 'ci95_high']);

/*
 * A metric summary as served (PROPOSED_SHAPES.metric_summary). Each statistic
 * is read on its own; one missing std does not hide a present median, and a
 * missing median is null, not 0. Keys whose value is not an object are listed
 * in `ignored` so nothing the server sent disappears silently.
 */
export function readMetricSummary(summary) {
  if (!isObject(summary)) {
    return Object.freeze({
      available: false, reason: absent(summary) ? UNAVAILABLE.NOT_RETURNED : UNAVAILABLE.WRONG_TYPE,
      served: servedForDisplay(summary), metrics: Object.freeze([]), ignored: Object.freeze([]),
    });
  }
  const metrics = [];
  const ignored = [];
  for (const [name, block] of Object.entries(summary)) {
    if (!isObject(block)) { ignored.push(name); continue; }
    const stats = {};
    let readable = 0;
    for (const s of SUMMARY_STATS) {
      const v = block[s];
      stats[s] = typeof v === 'number' && Number.isFinite(v) ? v : null;
      if (stats[s] !== null) readable += 1;
    }
    metrics.push(Object.freeze({ name, stats: Object.freeze(stats), available: readable > 0 }));
  }
  const available = metrics.some((m) => m.available);
  return Object.freeze({
    available,
    reason: available ? null : UNAVAILABLE.NO_READABLE_STATISTIC,
    served: servedForDisplay(summary),
    metrics: Object.freeze(metrics),
    ignored: Object.freeze(ignored),
  });
}

export function summaryStat(summary, metricName, stat) {
  if (!summary?.available) return null;
  const m = summary.metrics.find((x) => x.name === metricName);
  return m ? m.stats[stat] ?? null : null;
}

/*
 * A navigation intent for SCR-03. Every point on a V3 chart and every outlier
 * row produces one. It is enabled only when the server named all three of case,
 * run and variant: SCR-03 needs a run (V1's open() takes a runId), and the
 * variant must never be defaulted (`11` section 6). A disabled intent says
 * which field was missing, so the screen can say why the tap does nothing.
 */
export function caseIntent({ caseId, runId, variant, experimentId, from }) {
  const missing = [];
  if (!caseId) missing.push('case_id');
  if (!runId) missing.push('analysis_run_id');
  if (!variant || !LANE[variant]) missing.push('prediction_variant');
  return Object.freeze({
    screen: 'SCR-03',
    caseId: caseId ?? null,
    runId: runId ?? null,
    variant: variant ?? null,
    experimentId: experimentId ?? null,
    from: from ?? null,
    enabled: missing.length === 0,
    reason: missing.length === 0 ? null : `the server did not return ${missing.join(', ')} for this case`,
    text: `open ${caseId ?? '?'} (run ${runId ?? '?'}, variant ${variant ?? '?'})`,
  });
}

/*
 * experiment_cases rows (PROPOSED_SHAPES.experiment_cases_row). Every row is
 * kept, in the order served. `plotState` says why a row is or is not a point:
 * a FAILED or EXCLUDED case stays visible with its reason (`08` section 8.1),
 * and a SUCCEEDED row with no value is "not returned", not a point at 0.
 */
export function readCaseRows(data, { metricName, variant, experimentId } = {}) {
  const items = Array.isArray(data?.items) ? data.items : null;
  if (!items) {
    return Object.freeze({
      available: false, reason: UNAVAILABLE.NOT_RETURNED, rows: Object.freeze([]),
      counts: Object.freeze({ total: 0, plotted: 0 }), metricVersion: data?.metric_version ?? null,
    });
  }
  const rows = items.map((r, index) => {
    const caseId = typeof r?.case_id === 'string' && r.case_id ? r.case_id : null;
    const status = typeof r?.status === 'string' ? r.status : null;
    const runId = typeof r?.analysis_run_id === 'string' && r.analysis_run_id ? r.analysis_run_id : null;
    const metrics = isObject(r?.metrics) ? r.metrics : null;
    const raw = metricName && metrics ? metrics[metricName] : undefined;
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

    let plotState;
    if (!caseId) plotState = 'NO_CASE_ID';
    else if (!status || !ROW_STATUS[status]) plotState = 'UNKNOWN_STATUS';
    else if (status !== ROW_STATUS.SUCCEEDED) plotState = status;
    else if (!metricName) plotState = 'NO_METRIC_SELECTED';
    else if (value === null) plotState = 'VALUE_NOT_RETURNED';
    else plotState = 'PLOTTED';

    return Object.freeze({
      index,
      caseId,
      status,
      reason: absent(r?.reason) ? null : r.reason,
      runId,
      value,
      plotted: plotState === 'PLOTTED',
      plotState,
      intent: caseIntent({ caseId, runId, variant, experimentId, from: 'experiment_cases' }),
    });
  });

  const counts = { total: rows.length, plotted: 0 };
  for (const row of rows) {
    if (row.plotted) counts.plotted += 1;
    counts[row.plotState] = (counts[row.plotState] ?? 0) + 1;
  }
  return Object.freeze({
    available: true,
    reason: null,
    rows: Object.freeze(rows),
    counts: Object.freeze(counts),
    metricName: metricName ?? null,
    metricVersion: data?.metric_version ?? null,
  });
}

/*
 * The DR-010 outlier selection, READ ONLY - the same discipline as app/core
 * selection.mjs. The server applies the rule; this keeps the server's order
 * and ranks nothing. Refused rather than shown when:
 *   - it cites another rule (a second definition of "outlier" on screen is
 *     two answers to one question);
 *   - it does not name its experiment and variant (DR-010: both are explicit
 *     inputs, never defaults);
 *   - it was made for another experiment or variant than the one displayed.
 */
export function readOutlierSelection(block, { experimentId, variant } = {}) {
  const unavailable = (reason, extra = {}) => Object.freeze({
    available: false, reason, ruleId: OUTLIER_RULE.id, cases: Object.freeze([]), ...extra,
  });
  if (absent(block)) return unavailable(UNAVAILABLE.OUTLIERS_NOT_RETURNED);
  if (!isObject(block) || !Array.isArray(block.cases)) {
    return unavailable(UNAVAILABLE.OUTLIERS_UNREADABLE, { served: servedForDisplay(block) });
  }
  if (!absent(block.rule_id) && block.rule_id !== OUTLIER_RULE.id) {
    return unavailable(UNAVAILABLE.OUTLIERS_UNDER_ANOTHER_RULE, { served: servedForDisplay(block.rule_id) });
  }
  const servedVariant = readVariant(block.prediction_variant);
  const servedExperiment = typeof block.experiment_id === 'string' && block.experiment_id ? block.experiment_id : null;
  if (!servedExperiment || !servedVariant.readable) {
    return unavailable(UNAVAILABLE.OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT);
  }
  if (experimentId && servedExperiment !== experimentId) {
    return unavailable(UNAVAILABLE.OUTLIERS_FOR_ANOTHER_EXPERIMENT, { served: servedExperiment });
  }
  if (variant && servedVariant.lane !== variant) {
    return unavailable(UNAVAILABLE.OUTLIERS_FOR_ANOTHER_VARIANT, { served: servedVariant.declared });
  }
  if (block.cases.length === 0) return unavailable(UNAVAILABLE.NO_ELIGIBLE_CASES);

  // Order comes from the server, in the order it sent. Preserved as-is.
  const cases = block.cases.map((c, rank) => {
    const caseId = typeof c?.case_id === 'string' && c.case_id ? c.case_id : null;
    const runId = typeof c?.analysis_run_id === 'string' && c.analysis_run_id ? c.analysis_run_id : null;
    return Object.freeze({
      rank,
      caseId,
      runId,
      value: readNumber(c?.metric_value),
      intent: caseIntent({
        caseId, runId, variant: servedVariant.lane, experimentId: servedExperiment, from: 'outlier_selection',
      }),
    });
  });
  return Object.freeze({
    available: true,
    reason: null,
    ruleId: block.rule_id ?? null,
    ruleCited: block.rule_id === OUTLIER_RULE.id,
    experimentId: servedExperiment,
    variant: servedVariant,
    metricName: block.metric_name ?? null,
    cases: Object.freeze(cases),
  });
}

/* study_get.dataset - a label or an identity object; shown as served. */
export function readDataset(v) {
  if (typeof v === 'string' && v) return Object.freeze({ available: true, label: v, name: v, version: null, acquisitionTag: null });
  if (isObject(v)) {
    const name = v.name ?? v.dataset_id ?? v.id ?? null;
    const version = v.version ?? null;
    const acquisitionTag = v.acquisition_tag ?? null;
    return Object.freeze({
      available: name !== null,
      label: [name, version, acquisitionTag].filter((x) => !absent(x)).join(' · ') || null,
      name, version, acquisitionTag,
    });
  }
  return Object.freeze({ available: false, label: null, name: null, version: null, acquisitionTag: null, served: servedForDisplay(v) });
}

/* study_get.case_counts - every key the server sent, each read as a count. */
export function readCaseCounts(v) {
  if (!isObject(v)) return Object.freeze({ available: false, reason: absent(v) ? UNAVAILABLE.NOT_RETURNED : UNAVAILABLE.WRONG_TYPE, counts: Object.freeze([]) });
  const counts = Object.entries(v).map(([key, raw]) => Object.freeze({ key, count: readCount(raw) }));
  return Object.freeze({
    available: counts.some((c) => c.count.available),
    reason: null,
    counts: Object.freeze(counts),
    total: (counts.find((c) => c.key === 'total') ?? null)?.count ?? readCount(undefined),
  });
}

/*
 * study_get.capabilities - a list of names, or an object of flags. A flag is
 * on only when it is === true: the generated fixture puts placeholder STRINGS
 * in typed fields, and a string is truthy.
 */
export function readCapabilities(v) {
  if (Array.isArray(v)) return Object.freeze({ available: true, names: Object.freeze(v.filter((x) => typeof x === 'string')) });
  if (isObject(v)) {
    return Object.freeze({ available: true, names: Object.freeze(Object.keys(v).filter((k) => v[k] === true)) });
  }
  return Object.freeze({ available: false, names: Object.freeze([]), served: servedForDisplay(v) });
}

/* Rows of a list endpoint that carry the id a screen needs, and how many do not. */
export function readIdRows(data, idField) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const ids = [];
  let unreadable = 0;
  for (const row of items) {
    const id = row?.[idField];
    if (typeof id === 'string' && id) ids.push(id);
    else unreadable += 1;
  }
  return Object.freeze({ ids: Object.freeze(ids), total: items.length, unreadable });
}
