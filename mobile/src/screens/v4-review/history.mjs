// The review timeline on SCR-06: who changed the review, what, and when, from the rows of review_history_list
// (contract 1.2.0, served oldest first). Shown newest first. The slice uploads of one save are folded into that
// save's line, so a save is one line, not one per slice. Plain JS that Node tests import.

const STATUS_WORD = Object.freeze({
  NOT_REVIEWED: 'not reviewed', ACCEPTED: 'Accepted', FLAGGED: 'Flagged', CORRECTED: 'Corrected',
});

// "2026-10-01T09:05:00Z" -> "2026-10-01 09:05 UTC". The server's time is shown as it is, never converted, so the
// same row reads the same on every phone.
export function formatUtc(at) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(typeof at === 'string' ? at : '');
  return m ? `${m[1]} ${m[2]} UTC` : String(at ?? 'time not recorded');
}

// The reviewer as the project alias the server recorded. Spec 12 section 2: an email address is never shown.
export function reviewerLabel(id) {
  if (typeof id !== 'string' || id === '') return 'reviewer not recorded';
  if (id.includes('@')) return 'reviewer hidden';
  return id;
}

function describe(row, slices) {
  if (row.action === 'CREATE') return 'Review opened';
  if (row.action === 'TRANSITION') {
    return `${STATUS_WORD[row.to_status] || row.to_status} (was ${STATUS_WORD[row.from_status] || row.from_status})`;
  }
  if (row.action === 'COMMIT') {
    const where = slices.length ? `, slice ${slices.join(', ')}` : '';
    return `Saved correction ${row.reviewed_mask_id}${where}`;
  }
  return row.action;
}

function line(row, what) {
  return Object.freeze({
    key: `${row.revision}:${row.action}`,
    when: formatUtc(row.at),
    who: reviewerLabel(row.reviewer_id),
    what,
    reason: typeof row.reason === 'string' && row.reason !== '' ? row.reason : null,
  });
}

// Rows as served (oldest first) -> lines, newest first.
export function timelineLines(items) {
  const lines = [];
  let uploads = []; // working slices waiting for the save they belong to
  let lastUpload = null;
  for (const row of Array.isArray(items) ? items : []) {
    if (row.action === 'WORKING_SLICE') {
      if (Number.isInteger(row.slice_index) && !uploads.includes(row.slice_index)) uploads.push(row.slice_index);
      lastUpload = row;
      continue;
    }
    lines.push(line(row, describe(row, uploads)));
    if (row.action === 'COMMIT') {
      uploads = [];
      lastUpload = null;
    }
  }
  // Uploads with no save after them: a save that stopped half-way. The server keeps them for the next save.
  if (lastUpload) lines.push(line(lastUpload, `Uploaded slice ${uploads.join(', ')}, not saved yet`));
  return Object.freeze(lines.reverse());
}
