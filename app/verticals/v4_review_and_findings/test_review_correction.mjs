// node app/verticals/v4_review_and_findings/test_review_correction.mjs

import { readFileSync } from 'node:fs';
import { createContract, createBundle, createClient, createFixtureTransport, RECOVERY, STATE } from '../../core/index.mjs';
import { createReviewCorrection } from './index.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));
const model = createReviewCorrection(createClient(contract, createFixtureTransport(bundle)));

let failures = 0;
function check(id, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(4)} ${detail}`);
}

// V4-1: SCR-06 opens by case + run and makes the current revision visible.
{
  const screen = await model.open({ caseId: 'CASE_0043', runId: 'RUN_0043' });
  check('V4-1', screen.view.state === STATE.SUCCESS && screen.caseId === 'CASE_0043' && screen.runId === 'RUN_0043',
    `open -> ${screen.view.state} for ${screen.caseId}/${screen.runId}`);
  check('V4-1', screen.revision === 1 && screen.reviewId && screen.reviewedMasks.length === 1,
    `revision ${screen.revision}, ${screen.reviewedMasks.length} immutable reviewed-mask version`);
}

// V4-2: every V4 write supplies expected_revision through the single model.
{
  const screen = await model.putWorkingMask({
    sliceIndex: 44, sourceMaskId: 'MASK_PROCESSED_0043', maskPayload: 'fixture brush delta',
  });
  check('V4-2', screen.view.state === STATE.SUCCESS && screen.revision === 1,
    `working-mask write -> ${screen.view.state}, revision ${screen.revision}`);
}

// V4-3: STALE_REVISION locks writes and offers REFRESH, never RETRY.
{
  const stale = await model.patchStatus('APPROVED', { scenario: 'stale_revision' });
  check('V4-3', stale.view.state === STATE.STALE_MISMATCH && stale.canWrite === false,
    `stale response -> ${stale.view.state}, canWrite=${stale.canWrite}`);
  check('V4-3', stale.view.actions.includes(RECOVERY.REFRESH) && !stale.view.actions.includes(RECOVERY.RETRY),
    `actions ${stale.view.actions.join('/')}`);
  const blocked = await model.commit();
  check('V4-3', blocked === stale, 'a stale correction is not resubmitted');
}

// V4-4: an unopened review is a readable fatal state, not a request missing
// expected_revision that reaches transport.
{
  const fresh = createReviewCorrection(createClient(contract, createFixtureTransport(bundle)));
  const screen = await fresh.commit();
  check('V4-4', screen.view.state === STATE.FATAL_INVALID && screen.view.error.code === 'REVIEW_NOT_OPEN',
    `commit before open -> ${screen.view.error.code}`);
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'} V4 review/correction — ${4 - failures}/4`);
process.exit(failures === 0 ? 0 : 1);
