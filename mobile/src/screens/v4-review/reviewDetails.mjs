// What the Details sheet of SCR-06 says: every id, revision and checksum that the page itself leaves out
// (Direction A keeps them off the main surface). Plain lines of text in sections, built from the controller's state.

import { sliceDetail } from '../../lib/sliceNumber.mjs';
import { statusWord } from './format.mjs';

const line = (label, value) => (value === null || value === undefined || value === '' ? null : `${label} ${value}`);
const kept = (lines) => lines.filter(Boolean);

// The history as one line per entry, with the full time, the reviewer, the mask id of a save and the reason.
function historyLine(l) {
  const ref = l.ref ? ` (${l.ref})` : '';
  const reason = l.reason ? ` — ${l.reason}` : '';
  return `Revision ${l.revision} · ${l.when} · ${l.who} · ${l.what}${ref}${reason}`;
}

// st: the controller's getState() once the review is open (phase READY).
export function reviewDetailSections(st) {
  const r = st.review;
  const b = st.brush;
  const t = st.target;
  const z = st.slice ? st.slice.index : null;
  const sections = [];

  sections.push({
    title: 'This review',
    lines: kept([
      line('Review', r.reviewId),
      `Status ${statusWord(r.status)} (revision ${r.revision})`,
      line('Prediction', t && t.variant),
      line('Source mask', b && b.source ? `${b.source.maskId}${b.source.synthetic ? ' (synthetic stand-in)' : ''}` : null),
    ]),
  });

  sections.push({
    title: 'Where',
    lines: kept([
      line('Case', t && t.caseId),
      line('Run', t && t.runId),
      line('Experiment', t && t.experimentId),
      z === null ? null : sliceDetail(z, st.slice.total),
    ]),
  });

  const latest = r.latestVersion;
  const versionLines = kept([
    latest ? `Latest version ${latest.reviewed_mask_id}` : 'No version saved yet',
    latest ? line('Made from', `${latest.source_mask_id}${latest.source_mask_kind ? ` (${latest.source_mask_kind})` : ''}`) : null,
    latest ? line('Checksum', latest.checksum) : null,
    r.reviewedMasks.length ? `${r.reviewedMasks.length} ${r.reviewedMasks.length === 1 ? 'version' : 'versions'} in all` : null,
    b && b.baseId ? `Edits continue from version ${b.baseId}` : null,
  ]);
  sections.push({ title: 'Versions', lines: versionLines });

  if (st.history.lines.length) sections.push({ title: 'History, in full', lines: st.history.lines.map(historyLine) });
  return sections;
}
