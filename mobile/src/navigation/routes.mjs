/*
 * The screen table (spec 10 §3): id, title, the params a screen needs before it can open, and its tab.
 * Plain data; Navigator.js maps each id to its component.
 */

export const SCREENS = Object.freeze([
  { id: 'SCR-01', title: 'Study Overview', vertical: 'V3', required: [], tab: 'Study' },
  { id: 'SCR-02', title: 'Case List', vertical: 'V1', required: [], tab: 'Cases' },
  { id: 'SCR-03', title: 'Case Explorer', vertical: 'V1', required: ['caseId'], tab: null },
  { id: 'SCR-04', title: 'Error Inspector', vertical: 'V1', required: ['caseId', 'runId', 'variant'], tab: null },
  { id: 'SCR-05', title: '3D Inspector', vertical: 'V2', required: ['caseId', 'runId'], tab: null },
  { id: 'SCR-06', title: 'Review / Correction', vertical: 'V4', required: ['runId'], tab: null },
  { id: 'SCR-07', title: 'Experiment Comparison', vertical: 'V3', required: [], tab: 'Experiments' },
  { id: 'SCR-08', title: 'Findings', vertical: 'V4', required: [], tab: 'Findings' },
].map((s) => Object.freeze({ ...s, required: Object.freeze([...s.required]) })));

export const SCREEN_IDS = Object.freeze(SCREENS.map((s) => s.id));

export const TABS = Object.freeze(SCREENS.filter((s) => s.tab).map((s) => Object.freeze({ label: s.tab, screenId: s.id })));

export const ROOT_SCREEN_ID = 'SCR-01';

const BY_ID = new Map(SCREENS.map((s) => [s.id, s]));

export function screenMeta(id) {
  const meta = BY_ID.get(id);
  if (!meta) throw new Error(`unknown screen id ${id}`);
  return meta;
}

export function isScreenId(id) {
  return BY_ID.has(id);
}

export function missingParams(id, params = {}) {
  return screenMeta(id).required.filter((name) => {
    const v = params ? params[name] : undefined;
    return v === undefined || v === null || v === '';
  });
}
