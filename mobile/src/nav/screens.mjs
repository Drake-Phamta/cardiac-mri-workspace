/*
 * The screen table - SCR-01..SCR-08 of `10` §3, who owns each, and where its
 * file lives. Pure data, so the navigator and its tests can read it without
 * React Native; src/registry.js binds each id to its component.
 *
 * Ownership is `14` §3 as amended by DR-013a (SCR-04 joined V1, 2026-09-18).
 * A vertical replaces ONLY the files inside its own folder:
 *
 *   src/verticals/v1/   SCR-02, SCR-03, SCR-04   Phạm Tuấn Anh
 *   src/verticals/v2/   SCR-05                   Vũ Hùng Anh
 *   src/verticals/v3/   SCR-01, SCR-07           Bế Quốc Khánh
 *   src/verticals/v4/   SCR-06, SCR-08           Nguyễn Gia Đức Trung
 *
 * SCR-09 (Analysis Run Status) is a SHOULD that exists only if PR-AN-01 is
 * activated; it is not registered until then.
 *
 * `required` lists the params a screen cannot open without. The navigator
 * refuses a push that omits one, so a screen never has to invent a case id.
 * `tab` marks the four entry points of the `10` §2 tree that sit on the tab
 * bar: Study Overview, and its Cases / Experiments / Findings branches.
 */

export const SCREENS = Object.freeze([
  { id: 'SCR-01', title: 'Study Overview', vertical: 'V3', folder: 'v3', file: 'StudyOverviewScreen.js', required: [], tab: 'Study' },
  { id: 'SCR-02', title: 'Case List', vertical: 'V1', folder: 'v1', file: 'CaseListScreen.js', required: [], tab: 'Cases' },
  { id: 'SCR-03', title: 'Case Explorer', vertical: 'V1', folder: 'v1', file: 'CaseExplorerScreen.js', required: ['caseId'], tab: null },
  { id: 'SCR-04', title: 'Error Inspector', vertical: 'V1', folder: 'v1', file: 'ErrorInspectorScreen.js', required: ['caseId', 'runId', 'variant'], tab: null },
  { id: 'SCR-05', title: '3D Inspector', vertical: 'V2', folder: 'v2', file: 'Inspector3DScreen.js', required: ['caseId', 'runId'], tab: null },
  { id: 'SCR-06', title: 'Review / Correction', vertical: 'V4', folder: 'v4', file: 'ReviewCorrectionScreen.js', required: ['runId'], tab: null },
  { id: 'SCR-07', title: 'Experiment Comparison', vertical: 'V3', folder: 'v3', file: 'ExperimentComparisonScreen.js', required: [], tab: 'Experiments' },
  { id: 'SCR-08', title: 'Findings', vertical: 'V4', folder: 'v4', file: 'FindingsScreen.js', required: [], tab: 'Findings' },
].map((s) => Object.freeze({ ...s, required: Object.freeze([...s.required]) })));

export const OWNERS = Object.freeze({
  V1: 'Phạm Tuấn Anh',
  V2: 'Vũ Hùng Anh',
  V3: 'Bế Quốc Khánh',
  V4: 'Nguyễn Gia Đức Trung',
});

export const SCREEN_IDS = Object.freeze(SCREENS.map((s) => s.id));

export const TABS = Object.freeze(SCREENS.filter((s) => s.tab).map((s) => Object.freeze({ label: s.tab, screenId: s.id })));

// `10` §2: Study Overview is the root of the information architecture.
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

export function screenPath(id) {
  const meta = screenMeta(id);
  return `src/verticals/${meta.folder}/${meta.file}`;
}

export function missingParams(id, params = {}) {
  return screenMeta(id).required.filter((name) => {
    const v = params ? params[name] : undefined;
    return v === undefined || v === null || v === '';
  });
}
