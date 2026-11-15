/*
 * What the screen header says: the screen's name for people, and the case it shows. A screen names its run, model
 * and variant for people itself (title, subtitle with nav.setContext, e.g. "DINOv2 100 %" or "CASE_0029 · Raw"); until
 * it does, the subtitle is the case alone, never a run id (the device session r8 saw "CASE_0029 · run RUN_EXP-D-100_..."
 * for half a second while SCR-04 loaded). Run ids, the screen id, the build and the contract version go to the Details
 * sheet behind the header's Info button instead.
 *
 * What a screen may report with nav.setContext (all optional; memoize arrays and functions, the shell compares the
 * report shallowly and re-renders only when it changed):
 *   caseId                   the default subtitle, the case (wins over the route params)
 *   title, subtitle          strings that replace the header's two lines (a viewer names the case and the model)
 *   onSubtitlePress          the subtitle becomes a button with a chevron (a run picker)
 *   actions                  [{ key, icon, label, active, onPress }]: icon buttons before Info (a privacy shield)
 *   overflow                 { label, onPress }: a "more" button after Info, for a screen's own menu
 *   details                  [{ title, lines }]: sections at the top of the Details sheet (ids, checksums, versions)
 */

const word = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function headerLines(meta, params = null, context = null, { studyId = null } = {}) {
  const p = { ...(params || {}), ...(context || {}) };
  const parts = [];
  const caseId = word(p.caseId);
  if (caseId) parts.push(caseId);
  let subtitle = parts.join(' · ');
  if (!subtitle) subtitle = word(studyId) ? `Study ${studyId}` : '';
  const ctx = context || {};
  return Object.freeze({
    title: word(ctx.title) || meta.title,
    subtitle: word(ctx.subtitle) || subtitle || null,
    screenId: meta.id,
    vertical: meta.vertical,
  });
}

// The screen's own Details sections from its report: only well-formed { title, lines } entries with text lines.
export function contextDetails(context) {
  const list = context && Array.isArray(context.details) ? context.details : [];
  return Object.freeze(list
    .filter((sec) => sec && word(sec.title) && Array.isArray(sec.lines))
    .map((sec) => Object.freeze({ title: sec.title, lines: Object.freeze(sec.lines.filter((l) => word(l))) }))
    .filter((sec) => sec.lines.length > 0));
}

// The lines of the Details sheet: which screen this is in the spec, and what build answers it.
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
