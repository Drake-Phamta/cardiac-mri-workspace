/*
 * What the screen header says: the screen's name for people, and the case and run it shows. A screen that picks
 * its run itself (SCR-03) reports it with nav.setContext; that wins over the route params. The screen id, the
 * build and the contract version go to the folded "About this screen" panel instead.
 */

const word = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function headerLines(meta, params = null, context = null, { studyId = null } = {}) {
  const p = { ...(params || {}), ...(context || {}) };
  const parts = [];
  const caseId = word(p.caseId);
  const runId = word(p.runId);
  const variant = word(p.variant);
  if (caseId) parts.push(caseId);
  if (runId) parts.push(`run ${runId}`);
  if (runId && variant) parts.push(variant);
  let subtitle = parts.join(' · ');
  if (!subtitle) subtitle = word(studyId) ? `Study ${studyId}` : '';
  return Object.freeze({
    title: meta.title,
    subtitle: subtitle || null,
    screenId: meta.id,
    vertical: meta.vertical,
  });
}

// The lines of the folded panel: which screen this is in the spec, and what build answers it.
export function aboutLines(meta, config, contractVersion = null) {
  const lines = [`Screen ${meta.id} (${meta.vertical})`];
  const mode = config && config.mode ? String(config.mode).toUpperCase() : null;
  if (mode) lines.push(`Mode ${mode}${config.studyId ? ` · study ${config.studyId}` : ''}`);
  const build = config && config.build ? config.build : {};
  const contract = contractVersion || build.contractVersion || null;
  lines.push(`Contract ${contract || 'not stated'}`);
  lines.push(`Build ${build.gitSha ? String(build.gitSha).slice(0, 7) : 'not stated'}${build.generatedAt ? ` · ${build.generatedAt}` : ''}`);
  return Object.freeze(lines);
}

// Shallow equality for the context a screen reports, so an unchanged report does not re-render the shell.
export function sameContext(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}
