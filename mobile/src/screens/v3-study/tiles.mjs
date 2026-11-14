// SCR-01 tiles: how many cases, how many findings are open or resolved, and the median Dice of each UNet vs DINOv2
// pair, shown only where the server judged the pair comparable. A count the server did not send is "unavailable",
// never 0.

import { STATE } from '../../api/states.mjs';
import { VERDICT, matrixEntry, summaryStat } from './readers.mjs';
import { comparisonRow } from './view.mjs';

const MODE_LABEL = Object.freeze({ EVALUATION: 'evaluation', INFERENCE_REVIEW: 'inference & review' });

/* study_get.case_counts: the total as the big number, one line per case mode. */
export function casesTile(caseCounts) {
  if (!caseCounts || !caseCounts.available) {
    return Object.freeze({ value: null, text: 'case counts unavailable', lines: Object.freeze([]) });
  }
  const { total } = caseCounts;
  return Object.freeze({
    value: total.available ? String(total.value) : null,
    text: total.available ? `case${total.value === 1 ? '' : 's'} in the study` : 'total unavailable',
    lines: Object.freeze(caseCounts.counts
      .filter((c) => c.key !== 'total')
      .map((c) => `${c.count.available ? c.count.value : 'unavailable'} ${MODE_LABEL[c.key] || c.key}`)),
  });
}

/* findings_list: open and resolved among the findings the server returned. */
export function findingsTile(findings) {
  if (!findings || findings.view.state !== STATE.SUCCESS) return Object.freeze({ open: null, resolved: null });
  const count = (status) => {
    const entry = findings.byStatus.find((e) => e.status === status);
    return entry ? entry.count : 0;
  };
  return Object.freeze({ open: count('OPEN'), resolved: count('RESOLVED') });
}

const fmt = (v) => v.toFixed(3);

function chipFor(h) {
  if (!h.requested) return 'Not compared';
  if (h.verdict === VERDICT.NOT_COMPARABLE) return 'Not comparable';
  return 'Not confirmed';
}

/* One row per UNet vs DINOv2 pair: both median Dice values under a "Comparable" chip, or the reason there are none. */
export function diceTile(headline) {
  const rows = headline.filter((h) => h.kind === 'HEAD_TO_HEAD').map((h) => {
    const row = comparisonRow(h);
    const [unetId, dinoId] = h.experimentIds;
    // Summaries reach the headline only under the server's COMPARABLE verdict (models.mjs).
    const unet = summaryStat(h.summaries && h.summaries[unetId], 'dice', 'median');
    const dino = summaryStat(h.summaries && h.summaries[dinoId], 'dice', 'median');
    const fair = row.fair && unet !== null && dino !== null;
    return Object.freeze({
      id: h.id,
      label: `${matrixEntry(unetId).fractionPct} % data`,
      fair,
      chip: fair ? 'Comparable' : chipFor(h),
      unetText: fair ? `UNet ${fmt(unet)}` : null,
      dinoText: fair ? `DINOv2 ${fmt(dino)}` : null,
      // The two medians as numbers, for the markers on the 0 to 1 track.
      unet: fair ? unet : null,
      dino: fair ? dino : null,
      note: fair ? row.populationText : (row.reason || (row.fair ? 'no median Dice in the summary' : null)),
      route: row.route,
    });
  });
  return Object.freeze({
    rows: Object.freeze(rows),
    emptyText: rows.some((r) => r.fair) ? null : 'No UNet vs DINOv2 pair is judged comparable by the server yet.',
  });
}
