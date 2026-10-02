/*
 * SCR-03 helpers - everything the Case Explorer screen decides that is not
 * drawing. Pure, so `node --test` checks the same code Hermes runs.
 *
 * The state itself (case, run, slice, refs, overlays, metrics) lives in the
 * V1 model, app/verticals/v1_case_explorer/index.mjs. This file only turns
 * that state, the contract and the build config into labels, choices and
 * numbers the screen shows.
 */

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
 * Which run the explorer opens. An explicit request wins and must be one the
 * case lists - also when the case lists none (#80 QA N3): a run that is not
 * listed is never reported as 'requested', so the screen opens no run for it
 * and says why instead of asking the server about it. A case with exactly one
 * run opens it (and the screen shows it); several runs mean the user chooses -
 * nothing is picked for them.
 */
export function chooseRun(availableRunIds, requested = null) {
  const ids = Array.isArray(availableRunIds) ? availableRunIds.filter((x) => typeof x === 'string' && x) : [];
  if (requested) {
    return ids.includes(requested)
      ? Object.freeze({ runId: requested, reason: 'requested', choices: Object.freeze(ids) })
      : Object.freeze({ runId: null, reason: 'requested-run-not-listed', choices: Object.freeze(ids) });
  }
  if (ids.length === 1) return Object.freeze({ runId: ids[0], reason: 'only-run', choices: Object.freeze(ids) });
  if (ids.length === 0) return Object.freeze({ runId: null, reason: 'no-runs', choices: Object.freeze(ids) });
  return Object.freeze({ runId: null, reason: 'choose', choices: Object.freeze(ids) });
}

// `10` §3: slice `n / total`. 1-based for people, with the 0-based index the
// API and the evidence files use, so neither has to be converted in a head.
export function sliceLabel(sliceIndex, total) {
  if (!Number.isInteger(sliceIndex) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${sliceIndex + 1} / ${total}  (z = ${sliceIndex})`;
}

export function clampSlice(index, total) {
  if (!Number.isInteger(total) || total <= 0) return null;
  return Math.max(0, Math.min(total - 1, Math.round(index)));
}

/*
 * Slider position -> slice index, deterministically (TC-MRI-002): the track
 * is cut into `total` equal cells and x picks one. The same x always gives
 * the same slice; the ends are reachable; outside the track clamps.
 */
export function scrubIndex(x, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0) return null;
  const cell = Math.floor((x / width) * total);
  return Math.max(0, Math.min(total - 1, cell));
}

// Centre of a slice's cell on the track, for drawing the thumb.
export function scrubPosition(index, width, total) {
  if (!(width > 0) || !Number.isInteger(total) || total <= 0 || !Number.isInteger(index)) return 0;
  return ((index + 0.5) / total) * width;
}

/*
 * The per-slice metric line. NOT_APPLICABLE is said in words and never as 0
 * or 1 (contract metric_rules.empty_slice_rule); unavailable says why. The
 * variant is part of the label because a Dice without its variant is a
 * number nobody can trace (DEMO_STANDARD D2).
 */
export function metricsText(metrics, variant) {
  if (!metrics) return { text: 'Slice Dice: loading…', tone: 'neutral' };
  if (metrics.state === 'COMPUTED' && typeof metrics.value === 'number' && Number.isFinite(metrics.value)) {
    return {
      text: `Slice Dice (${variant}): ${metrics.value.toFixed(3)}${metrics.version ? ` · metric ${metrics.version}` : ''}`,
      tone: 'ok',
    };
  }
  if (metrics.state === 'NOT_APPLICABLE') {
    return { text: `Slice Dice (${variant}): not applicable - ground truth and prediction are both empty here`, tone: 'neutral' };
  }
  if (metrics.state === 'UNAVAILABLE') {
    return { text: `Slice Dice: unavailable${metrics.reason ? ` (${metrics.reason})` : ''}`, tone: 'neutral' };
  }
  return { text: `Slice Dice: state ${metrics.state} is not one this build knows - not shown`, tone: 'warn' };
}

// The run line `10` §3 requires: run, experiment / model, precomputed or new.
export function runText(run, modelFamily = null) {
  if (!run) return 'Run: -';
  const model = modelFamily ? `${modelFamily} · ` : '';
  const pre = run.precomputed === true ? 'precomputed' : run.precomputed === false ? 'newly executed' : 'precomputed: not stated';
  const status = run.status && run.status !== 'SUCCEEDED' ? ` · ${run.status}` : '';
  return `Run ${run.runId} · ${model}${run.experimentId || 'experiment not stated'} · ${pre}${status}`;
}

export const OPACITY_STEPS = Object.freeze([0.25, 0.5, 0.75, 1]);

/*
 * The 30-step navigation sequence of TC-PERF-001 / NFR-PERF-001.
 *
 * PROVENANCE - a COPY, not an import (product code never imports spikes/**).
 *   source : spikes/spike_a_2d/app/App.js - NAV_SEQUENCE_16 and buildNavSequence
 *   commit : 0e3e54f "SPIKE_A S8: save/reload for A8, and the two scripts that conclude A10/A11"
 *   blob   : a8fb8a512c8a1ace2e3dbf487d11d1ee1218dc08
 *   copied : 2026-10-01, list and function unchanged except formatting.
 * Copied so the product's A9-style run is the SAME sequence Spike A measured
 * (A9 cached p95 65.31 ms at 576x576x88, release build), and the two numbers
 * stay comparable: moves of +/-1 stay +/-1 at any depth, jumps are scaled by
 * (Nz - 1) / 15.
 */
const NAV_SEQUENCE_16 = [
  1, 2, 3, 4, 5, 6, 7, 8,           // forward run
  7, 6, 5, 4, 3, 2, 1, 0,           // backward run
  8, 0, 15, 4, 11, 2, 13, 6,        // jumps
  7, 8, 9, 10, 11, 12,              // forward again
];

export function buildNavSequence(nz) {
  const scale = (nz - 1) / 15;
  const out = [];
  let prev16 = 0;
  let pos = 0;
  for (const target16 of NAV_SEQUENCE_16) {
    const delta16 = target16 - prev16;
    const delta = Math.abs(delta16) === 1 ? delta16 : Math.round(delta16 * scale);
    pos = Math.max(0, Math.min(nz - 1, pos + delta));
    out.push(pos);
    prev16 = target16;
  }
  return out;
}
