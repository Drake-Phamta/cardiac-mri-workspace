// node app/core/tests/test_readers.mjs
//
// selection.mjs and comparability.mjs are the two modules whose job is to NOT
// compute something. Both failures are silent: a chart that looks fair but is
// not, and a worst-slice list a phone ranked for itself. So both are tested
// for what they refuse to do.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSelection, worstSlice, UNAVAILABLE_REASON, RULE_ID } from '../selection.mjs';
import { readComparability, presentation, VERDICT } from '../comparability.mjs';
import { createContract } from '../contract.mjs';
import { createChecker, HERE, loadContractJson } from './_harness.mjs';

const { check, done } = createChecker();

// --- selection -------------------------------------------------------------

// P1 — the module does not sort. DR-010 gave the ranking to the API: "the API
// returns the selection; the client never re-derives it". Two clients ranking
// independently is two answers to the same clinical question.
{
  const src = readFileSync(join(HERE, '..', 'selection.mjs'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('P1', !code.includes('.sort('), 'selection.mjs contains no .sort( outside comments');
  check('P1', RULE_ID === 'DR-010', `the frozen rule is cited as ${RULE_ID}`);
}

// P2 — the honest answer today. No endpoint in the contract returns a
// selection, so a response that has none must be unavailable, never an empty
// list rendered as "no bad slices".
{
  const contract = createContract(loadContractJson());
  const carriers = [...contract.endpointsById.values()].filter((e) =>
    (e.response_fields || []).some((f) => f.includes('worst_slice') || f === 'slice_selection'));
  check('P2', carriers.length === 0,
    'confirmed against the contract: no endpoint returns a worst-slice selection (Decision Request open)');

  const s = readSelection({ run_id: 'R1', status: 'SUCCEEDED' });
  check('P2', s.available === false && s.reason === UNAVAILABLE_REASON.NOT_RETURNED && worstSlice(s) === null,
    `a response with no selection -> unavailable / ${s.reason}`);
  check('P2', readSelection(null).available === false, 'a null response is unavailable, not a crash');
}

// P3 — when a selection does arrive, the server's order is preserved exactly.
// Re-ordering it, even "stably", would be re-deriving the ranking.
{
  const s = readSelection({
    worst_slice_selection: {
      rule_id: 'DR-010',
      selection_version: 'v1',
      slices: [
        { slice_index: 40, dice: 0.31, false_positives: 900, false_negatives: 120 },
        { slice_index: 12, dice: 0.28, false_positives: 10, false_negatives: 20 },
        { slice_index: 7, dice: 0.95, false_positives: 1, false_negatives: 0 },
      ],
    },
  });
  check('P3', s.available && s.slices.map((x) => x.sliceIndex).join(',') === '40,12,7',
    `order preserved as served: ${s.slices.map((x) => x.sliceIndex).join(',')}`);
  check('P3', worstSlice(s).sliceIndex === 40 && worstSlice(s).rank === 0,
    'the worst slice is the first one served, not the lowest Dice');
}

// P4 — an empty eligible set is its own reason. `10` section 7: absent is not
// empty.
{
  const s = readSelection({ worst_slice_selection: { slices: [] } });
  check('P4', s.available === false && s.reason === UNAVAILABLE_REASON.NO_ELIGIBLE_SLICES,
    `an empty selection -> ${s.reason}`);
}

// --- comparability ---------------------------------------------------------

// P5 — `11` section 5: the client must not label a comparison fair when the
// contract says false.
{
  const c = readComparability({
    comparable: false, compatibility_reason: 'different split_manifest_id',
    metric_version: 'mv1', prediction_variant: 'RAW',
  });
  const p = presentation(c);
  check('P5', c.verdict === VERDICT.NOT_COMPARABLE && !p.mayLabelFair && !p.mayShowDelta,
    'comparable:false forbids both the fair label and the delta');
  check('P5', p.mustShowReason && p.reason === 'different split_manifest_id',
    'and the reason is surfaced, not swallowed');
}

// P6 — the branch that matters most. A missing flag is UNDECIDED, never
// comparable: defaulting an absent boolean to true is how an unfair
// comparison gets labelled fair by a typo.
{
  for (const data of [{}, { comparable: 'true' }, { comparable: 1 }, { comparable: null }]) {
    const c = readComparability(data);
    check('P6', c.verdict === VERDICT.UNDECIDED && c.comparable === false && !presentation(c).mayLabelFair,
      `comparable=${JSON.stringify(data.comparable)} -> ${c.verdict}`);
  }
  check('P6', presentation(readComparability({})).reason !== null,
    'an undecided comparison still gives the screen something to say');
}

// P7 — a fair comparison unlocks the delta, and the numbers are always
// showable either way: the bars are real even when the difference is not.
{
  const c = readComparability({
    comparable: true, common_evaluation_population: ['C1', 'C2', 'C3'],
    metric_version: 'mv1', prediction_variant: 'PROCESSED', summary: { dice: [0.8, 0.84] },
  });
  const p = presentation(c);
  check('P7', p.mayShowDelta && p.mayLabelFair && !p.mustShowReason, 'comparable:true unlocks the delta');
  check('P7', c.commonPopulationSize === 3 && c.predictionVariant === 'PROCESSED',
    `population n=${c.commonPopulationSize}, variant ${c.predictionVariant}`);
  check('P7', presentation(readComparability({ comparable: false })).mayShowSideBySide === true,
    'the two sets of numbers stay visible even when not comparable');
}

done('app/core readers');
