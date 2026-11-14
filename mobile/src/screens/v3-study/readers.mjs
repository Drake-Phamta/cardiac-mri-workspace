// Plain functions that read validated server data for SCR-01 and SCR-07 and report what they could not read. They
// compute no scientific result: comparability and outliers are the server's, kept in the served order, and a missing
// or wrongly typed count or metric is UNAVAILABLE with a reason, never 0 or NaN. The tests fail if anything sorts here.

export const FAMILY = Object.freeze({ UNET: 'UNET', DINOV2: 'DINOV2' });

// The same variant spellings SCR-03 accepts, so a navigation intent passes to it unchanged.
export const LANE = Object.freeze({ RAW: 'RAW', PROCESSED: 'PROCESSED' });

// The minimum experiment matrix of spec 08 §2, in the spec's order. The order is layout, never a ranking, so the UI
// cannot reorder to imply a winner. `lane` is checked against what the server declares, never substituted for it.
export const MATRIX = Object.freeze([
  { id: 'EXP-U-025', family: FAMILY.UNET, fractionPct: 25, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-U-050', family: FAMILY.UNET, fractionPct: 50, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-U-100', family: FAMILY.UNET, fractionPct: 100, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-025', family: FAMILY.DINOV2, fractionPct: 25, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-050', family: FAMILY.DINOV2, fractionPct: 50, lane: LANE.RAW, question: 'RQ-A' },
  { id: 'EXP-D-100', family: FAMILY.DINOV2, fractionPct: 100, lane: LANE.RAW, question: 'RQ-A' },
  // Post-processed from the same raw predictions as EXP-D-100.
  { id: 'EXP-D-PP', family: FAMILY.DINOV2, fractionPct: 100, lane: LANE.PROCESSED, question: 'RQ-B', derivedFrom: 'EXP-D-100' },
].map((e) => Object.freeze(e)));

export const MATRIX_IDS = Object.freeze(MATRIX.map((e) => e.id));

export function matrixEntry(id) {
  return MATRIX.find((e) => e.id === id) ?? null;
}

// The comparisons the server is asked to judge, one experiment_compare call each. A TREND group decides whether a
// family's 25 -> 50 -> 100 points may be joined by a line: only on COMPARABLE, because points from different
// populations would show a trend the data does not support.
export const COMPARISONS = Object.freeze([
  { id: 'RQ-A-025', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 25 %', experimentIds: ['EXP-U-025', 'EXP-D-025'] },
  { id: 'RQ-A-050', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 50 %', experimentIds: ['EXP-U-050', 'EXP-D-050'] },
  { id: 'RQ-A-100', question: 'RQ-A', kind: 'HEAD_TO_HEAD', label: 'UNet vs DINOv2 at 100 %', experimentIds: ['EXP-U-100', 'EXP-D-100'] },
  { id: 'RQ-A-TREND-UNET', question: 'RQ-A', kind: 'TREND', family: FAMILY.UNET, label: 'UNet 25 -> 50 -> 100 %', experimentIds: ['EXP-U-025', 'EXP-U-050', 'EXP-U-100'] },
  { id: 'RQ-A-TREND-DINOV2', question: 'RQ-A', kind: 'TREND', family: FAMILY.DINOV2, label: 'DINOv2 25 -> 50 -> 100 %', experimentIds: ['EXP-D-025', 'EXP-D-050', 'EXP-D-100'] },
  { id: 'RQ-B', question: 'RQ-B', kind: 'ABLATION', label: 'DINOv2 100 %: raw vs post-processed', experimentIds: ['EXP-D-100', 'EXP-D-PP'] },
].map((c) => Object.freeze({ ...c, experimentIds: Object.freeze([...c.experimentIds]) })));

// The server's outlier rule (DR-010), quoted for display and never applied here. The values match the contract's
// outlier_selection, and a test fails if the contract changes them.
export const OUTLIER_RULE = Object.freeze({
  id: 'DR-010',
  selectionVersion: 'dr010-outlier/v1',
  metricName: 'dice',
  cardinality: 3,
  text: 'the three successfully evaluated cases with the lowest case-level 3D Dice, for the explicitly '
    + 'selected experiment and prediction variant; ties: higher FP+FN voxel count first, then case_id',
});

// Own keys only, so a string such as "constructor" never matches through the object prototype.
const has = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

// Failed and excluded rows are never dropped; only SUCCEEDED rows with a value are plotted. WITHHELD is an
// inference-review case (INT-12): shown with its reason, never with a value.
export const ROW_STATUS = Object.freeze({
  SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', EXCLUDED: 'EXCLUDED', WITHHELD: 'WITHHELD',
});

export const UNAVAILABLE = Object.freeze({
  NOT_RETURNED: 'NOT_RETURNED',
  WRONG_TYPE: 'WRONG_TYPE',
  NO_READABLE_STATISTIC: 'NO_READABLE_STATISTIC',
  OUTLIERS_NOT_RETURNED: 'OUTLIERS_NOT_RETURNED',
  OUTLIERS_UNREADABLE: 'OUTLIERS_UNREADABLE',
  OUTLIERS_UNDER_ANOTHER_RULE: 'OUTLIERS_UNDER_ANOTHER_RULE',
  OUTLIERS_UNDER_ANOTHER_VERSION: 'OUTLIERS_UNDER_ANOTHER_VERSION',
  OUTLIERS_FOR_ANOTHER_METRIC: 'OUTLIERS_FOR_ANOTHER_METRIC',
  OUTLIERS_OVER_CARDINALITY: 'OUTLIERS_OVER_CARDINALITY',
  OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT: 'OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT',
  OUTLIERS_FOR_ANOTHER_EXPERIMENT: 'OUTLIERS_FOR_ANOTHER_EXPERIMENT',
  OUTLIERS_FOR_ANOTHER_VARIANT: 'OUTLIERS_FOR_ANOTHER_VARIANT',
  OUTLIERS_DUPLICATE_CASE_ID: 'OUTLIERS_DUPLICATE_CASE_ID',
  // The selection names a case that is not SUCCEEDED in the same experiment_cases answer. The rule picks only
  // successfully evaluated cases.
  OUTLIERS_NAME_INELIGIBLE_CASE: 'OUTLIERS_NAME_INELIGIBLE_CASE',
  NO_ELIGIBLE_CASES: 'NO_ELIGIBLE_CASES',
  NO_EXPERIMENTS_LISTED: 'NO_EXPERIMENTS_LISTED',
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const absent = (v) => v === undefined || v === null;

// Next to the reason, a screen shows what the server actually sent (shortened, not interpreted), so "unavailable"
// can be diagnosed.
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

// Intended N and successful N are always shown as two numbers, never subtracted into a "failed" count: the failed
// and excluded rows come from experiment_cases, with their reasons.
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

const VARIANT_SPELLINGS = LANE;

// The contract allows exactly RAW and PROCESSED. Other spellings are drift and are not normalised; `declared` keeps
// what the server sent.
export function readVariant(v) {
  const key = typeof v === 'string' ? v : null;
  const lane = has(VARIANT_SPELLINGS, key) ? VARIANT_SPELLINGS[key] : null;
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

// training_fraction is 0.25, 0.5 or 1.0. Nothing else is read: "25" or 25 would be a guess about units.
const FRACTIONS = new Map([[0.25, 25], [0.5, 50], [1, 100]]);

export function readFraction(v) {
  const pct = typeof v === 'number' ? (FRACTIONS.get(v) ?? null) : null;
  return Object.freeze({ declared: absent(v) ? null : v, pct, readable: pct !== null });
}

// A population is a manifest id, an object with an id and n, or a list of case ids. `n` is set only when the server
// gave a count or a list to count.
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

// Checks experiment_get against the matrix cell it should fill. A mismatch is reported, never repaired: the screen
// shows both values and says they disagree.
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

// Each statistic is a number or null (not computed).
const SUMMARY_STATS = Object.freeze(['n', 'mean', 'median', 'std', 'q1', 'q3', 'min', 'max', 'ci95_low', 'ci95_high']);

// Each statistic is read on its own, so a missing std does not hide a present median, and a missing value is null,
// not 0. Keys whose value is not an object go to `ignored`, so nothing the server sent disappears silently.
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

// A navigation intent to SCR-03, from a chart point or an outlier row. It is enabled only when the server named the
// case, run and variant: SCR-03 needs a run, and the variant is never defaulted (spec 11 §6). A disabled intent says
// which field was missing, so the screen can say why the tap does nothing.
export function caseIntent({ caseId, runId, variant, experimentId, from }) {
  const missing = [];
  if (!caseId) missing.push('case_id');
  if (!runId) missing.push('analysis_run_id');
  if (!has(LANE, variant)) missing.push('prediction_variant');
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

// Every experiment_cases row is kept, in the served order. `plotState` says why a row is or is not a point: a
// FAILED, EXCLUDED or WITHHELD case stays visible with its reason, and a SUCCEEDED row with no value is not a point
// at 0. Only a SUCCEEDED row has a value; one sent on another row is dropped and flagged as `servedValueIgnored`.
export function readCaseRows(data, {
  metricName, variant, experimentId, disabledIntentReason = null,
} = {}) {
  const items = Array.isArray(data?.items) ? data.items : null;
  const servedVariant = readVariant(data?.prediction_variant);
  if (!items) {
    return Object.freeze({
      available: false, reason: UNAVAILABLE.NOT_RETURNED, rows: Object.freeze([]),
      counts: Object.freeze({ total: 0, plotted: 0 }), metricVersion: data?.metric_version ?? null, servedVariant,
    });
  }
  const caseIdCounts = new Map();
  for (const item of items) {
    const id = typeof item?.case_id === 'string' && item.case_id ? item.case_id : null;
    if (id) caseIdCounts.set(id, (caseIdCounts.get(id) ?? 0) + 1);
  }
  const duplicateCaseIds = new Set([...caseIdCounts].filter(([, n]) => n > 1).map(([id]) => id));
  const rows = items.map((r, index) => {
    const caseId = typeof r?.case_id === 'string' && r.case_id ? r.case_id : null;
    const duplicateCaseId = caseId !== null && duplicateCaseIds.has(caseId);
    const status = typeof r?.status === 'string' ? r.status : null;
    const runId = typeof r?.analysis_run_id === 'string' && r.analysis_run_id ? r.analysis_run_id : null;
    const succeeded = status === ROW_STATUS.SUCCEEDED;
    const metrics = isObject(r?.metric_values) ? r.metric_values : null;
    const raw = succeeded && metricName && metrics ? metrics[metricName] : undefined;
    const value = !duplicateCaseId && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    const servedValueIgnored = !succeeded && !absent(r?.metric_values);

    let plotState;
    if (!caseId) plotState = 'NO_CASE_ID';
    else if (duplicateCaseId) plotState = 'DUPLICATE_CASE_ID';
    else if (!has(ROW_STATUS, status)) plotState = 'UNKNOWN_STATUS';
    else if (!succeeded) plotState = status;
    else if (!metricName) plotState = 'NO_METRIC_SELECTED';
    else if (value === null) plotState = 'VALUE_NOT_RETURNED';
    else plotState = 'PLOTTED';

    const baseIntent = caseIntent({ caseId, runId, variant, experimentId, from: 'experiment_cases' });
    const intent = duplicateCaseId
      ? Object.freeze({ ...baseIntent, enabled: false, reason: `duplicate case_id ${caseId} in experiment_cases` })
      : disabledIntentReason
        ? Object.freeze({ ...baseIntent, enabled: false, reason: disabledIntentReason })
        : baseIntent;

    return Object.freeze({
      index,
      caseId,
      status,
      reason: absent(r?.reason) ? null : r.reason,
      runId,
      value,
      servedValueIgnored,
      plotted: plotState === 'PLOTTED',
      plotState,
      intent,
    });
  });

  const counts = { total: rows.length, plotted: 0, servedValueIgnored: 0 };
  for (const row of rows) {
    if (row.plotted) counts.plotted += 1;
    if (row.servedValueIgnored) counts.servedValueIgnored += 1;
    counts[row.plotState] = (counts[row.plotState] ?? 0) + 1;
  }
  return Object.freeze({
    available: true,
    reason: null,
    rows: Object.freeze(rows),
    counts: Object.freeze(counts),
    metricName: metricName ?? null,
    metricVersion: data?.metric_version ?? null,
    servedVariant,
    duplicateCaseIds: Object.freeze([...duplicateCaseIds]),
  });
}

// Reads the server's outlier selection and keeps its order; nothing is ranked here. It is refused, not shown, when
// it cites another rule, version or metric, does not name its experiment and variant, was made for another
// experiment or variant, or lists more cases than the rule allows.
export function readOutlierSelection(block, { experimentId, variant } = {}) {
  const unavailable = (reason, extra = {}) => Object.freeze({
    available: false, reason, ruleId: OUTLIER_RULE.id, cases: Object.freeze([]), ...extra,
  });
  if (absent(block)) return unavailable(UNAVAILABLE.OUTLIERS_NOT_RETURNED);
  if (!isObject(block) || !Array.isArray(block.cases)) {
    return unavailable(UNAVAILABLE.OUTLIERS_UNREADABLE, { served: servedForDisplay(block) });
  }
  if (block.rule_id !== OUTLIER_RULE.id) {
    return unavailable(UNAVAILABLE.OUTLIERS_UNDER_ANOTHER_RULE, { served: servedForDisplay(block.rule_id) });
  }
  if (block.selection_version !== OUTLIER_RULE.selectionVersion) {
    return unavailable(UNAVAILABLE.OUTLIERS_UNDER_ANOTHER_VERSION, { served: servedForDisplay(block.selection_version) });
  }
  if (block.metric_name !== OUTLIER_RULE.metricName) {
    return unavailable(UNAVAILABLE.OUTLIERS_FOR_ANOTHER_METRIC, { served: servedForDisplay(block.metric_name) });
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
  if (block.cases.length > OUTLIER_RULE.cardinality) {
    return unavailable(UNAVAILABLE.OUTLIERS_OVER_CARDINALITY, { served: String(block.cases.length) });
  }
  const selectedIds = block.cases.map((c) => c?.case_id).filter((id) => typeof id === 'string' && id);
  const duplicateSelectedIds = [...new Set(selectedIds.filter((id, i) => selectedIds.indexOf(id) !== i))];
  if (duplicateSelectedIds.length > 0) {
    return unavailable(UNAVAILABLE.OUTLIERS_DUPLICATE_CASE_ID, { served: duplicateSelectedIds.join(', ') });
  }

  // `rank` is the position the server sent.
  const cases = block.cases.map((c, rank) => {
    const caseId = typeof c?.case_id === 'string' && c.case_id ? c.case_id : null;
    const runId = typeof c?.analysis_run_id === 'string' && c.analysis_run_id ? c.analysis_run_id : null;
    return Object.freeze({
      rank,
      caseId,
      runId,
      value: readNumber(c?.metric_value),
      // FP and FN are the server's tie-break: shown, never used to re-rank.
      falsePositives: readCount(c?.false_positives),
      falseNegatives: readCount(c?.false_negatives),
      intent: caseIntent({
        caseId, runId, variant: servedVariant.lane, experimentId: servedExperiment, from: 'outlier_selection',
      }),
    });
  });
  return Object.freeze({
    available: true,
    reason: null,
    ruleId: block.rule_id,
    ruleCited: true,
    selectionVersion: block.selection_version,
    experimentId: servedExperiment,
    variant: servedVariant,
    metricName: block.metric_name,
    cases: Object.freeze(cases),
  });
}

/* study_get.dataset is { dataset_id, name, version }, shown as served. */
export function readDataset(v) {
  if (!isObject(v)) {
    return Object.freeze({ available: false, label: null, datasetId: null, name: null, version: null, served: servedForDisplay(v) });
  }
  const datasetId = typeof v.dataset_id === 'string' && v.dataset_id ? v.dataset_id : null;
  const name = typeof v.name === 'string' && v.name ? v.name : null;
  const version = absent(v.version) ? null : String(v.version);
  const head = name ?? datasetId;
  return Object.freeze({
    available: head !== null,
    label: head === null ? null
      : `${head}${version ? ` · version ${version}` : ''}${name && datasetId ? ` (${datasetId})` : ''}`,
    datasetId, name, version,
  });
}

// UNAVAILABLE is a valid answer with a reason; no summary is invented for it.
export function readExperimentSummary(v) {
  if (!isObject(v)) {
    return Object.freeze({ available: false, status: null, reason: absent(v) ? UNAVAILABLE.NOT_RETURNED : UNAVAILABLE.WRONG_TYPE, experimentIds: Object.freeze([]) });
  }
  const ids = Array.isArray(v.experiment_ids) ? v.experiment_ids.filter((x) => typeof x === 'string' && x) : [];
  return Object.freeze({
    available: v.status === 'AVAILABLE',
    status: typeof v.status === 'string' ? v.status : null,
    reason: absent(v.reason) ? null : String(v.reason),
    experimentIds: Object.freeze(ids),
  });
}

/* study_get.case_counts: every key the server sent, each read as a count. */
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

// Capabilities are a list of names or an object of flags. A flag is on only when it is === true, because a drifted
// server can send a string, and a string is truthy.
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

// A matrix experiment listed under another variant than the spec gives it is reported, never moved.
export function readExperimentRows(data) {
  const base = readIdRows(data, 'experiment_id');
  const variants = {};
  const problems = [];
  for (const row of Array.isArray(data?.items) ? data.items : []) {
    const id = typeof row?.experiment_id === 'string' && row.experiment_id ? row.experiment_id : null;
    if (!id) continue;
    const variant = readVariant(row.prediction_variant);
    variants[id] = variant;
    const expected = matrixEntry(id);
    if (expected && variant.lane !== expected.lane) {
      problems.push(`08 section 2 defines ${id} on ${expected.lane}; the list states ${servedForDisplay(variant.declared) ?? 'no variant'}`);
    }
  }
  return Object.freeze({ ...base, variants: Object.freeze(variants), problems: Object.freeze(problems) });
}

// Comparability: the server decides and the app only reads the verdict (spec 11 §5). Two bars from different
// populations would render fine and still be wrong, so the reason must be as easy to show as the numbers.

export const VERDICT = Object.freeze({
  COMPARABLE: 'COMPARABLE',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  UNDECIDED: 'UNDECIDED',
});

// A missing or non-boolean `comparable` is UNDECIDED, never comparable, so a typo cannot label a comparison fair.
export function readComparability(data) {
  const comparable = data?.comparable;
  let verdict;
  if (comparable === true) verdict = VERDICT.COMPARABLE;
  else if (comparable === false) verdict = VERDICT.NOT_COMPARABLE;
  else verdict = VERDICT.UNDECIDED;

  const population = data?.common_evaluation_population ?? null;
  return Object.freeze({
    verdict,
    comparable: verdict === VERDICT.COMPARABLE,
    reason: data?.compatibility_reason ?? null,
    commonPopulation: population,
    commonPopulationSize: Array.isArray(population) ? population.length : (population?.n ?? null),
    metricVersion: data?.metric_version ?? null,
    predictionVariant: data?.prediction_variant ?? null,
    summary: data?.summary ?? null,
  });
}

// What a screen may draw for a verdict. Screens call this instead of their own `if (comparable)`, so the app has
// one answer to "may I show the difference?".
export function presentation(comparability) {
  const fair = comparability.verdict === VERDICT.COMPARABLE;
  return Object.freeze({
    mayShowSideBySide: true,          // the numbers themselves are always real
    mayShowDelta: fair,               // a difference is only meaningful if fair
    mayLabelFair: fair,
    mustShowReason: !fair,
    reason: comparability.reason
      ?? (comparability.verdict === VERDICT.UNDECIDED
        ? 'The server did not state whether these experiments are comparable.'
        : null),
  });
}
