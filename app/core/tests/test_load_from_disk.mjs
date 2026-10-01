// node app/core/tests/test_load_from_disk.mjs
//
// The other nine tests feed app/core JSON they built themselves. This one
// feeds it the two artifacts that actually exist on disk:
//   - contracts/api/contract.json, the accepted contract;
//   - whatever contracts/api/generate_fixture.py produces TODAY.
//
// That second one is the point. Trung's generator and this loader are two
// halves of a handshake written by two people; if the half on main stopped
// loading, every vertical would find out at once and none of them would know
// why. Python is invoked with an argv, never a shell string, because a shell
// string is where quoting goes to die on Windows.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContract, loadClient, CONTRACT_PATH } from '../node/loadFromDisk.mjs';
import { createBundle, BUNDLE_PATH } from '../fixtures/loader.mjs';
import { STATE } from '../errors.mjs';
import { createChecker, REPO, CONTRACT_FILE } from './_harness.mjs';

const { check, done } = createChecker();

const contract = await loadContract(CONTRACT_FILE);
check('D1', contract.endpointsById.size === 28, `contract.json loads from disk: ${contract.endpointsById.size} endpoints`);
check('D1', CONTRACT_PATH === 'contracts/api/contract.json', `default path is ${CONTRACT_PATH}`);

// D2 — the real generator's output loads. Run through the module, not a copy
// of its logic, so a change to generate_fixture.py is what this observes.
{
  const script = [
    'import json,sys',
    'sys.path.insert(0, sys.argv[1])',
    'from generate_fixture import generate_fixture',
    'print(json.dumps(generate_fixture(json.load(open(sys.argv[2], encoding="utf-8")))))',
  ].join('\n');

  let out = null;
  for (const exe of ['python', 'python3']) {
    const r = spawnSync(exe, ['-c', script, join(REPO, 'contracts', 'api'), CONTRACT_FILE], { encoding: 'utf8' });
    if (r.status === 0) { out = r.stdout; break; }
  }

  if (out === null) {
    check('D2', false, 'could not run generate_fixture.py (no python on PATH?)');
  } else {
    const generated = JSON.parse(out);
    let problems = [];
    try { createBundle(contract, generated); } catch (err) { problems = err.detail?.problems ?? [err.code]; }
    check('D2', problems.length === 0, "today's generate_fixture.py output loads clean" +
      (problems.length ? ` — ${problems.slice(0, 3).join('; ')}` : ''));

    const bundle = createBundle(contract, generated);
    check('D2', bundle.hasScenarios && Object.keys(bundle.scenarios).length === 28,
      'and has one generated scenario group for every endpoint');
    check('D2', ['review_patch', 'working_mask_put', 'review_commit'].every(
      (id) => bundle.scenarios[id]?.stale_revision,
    ), 'and includes the three V4 stale-revision scenarios');
    check('D2', bundle.scenarios.analysis_run_get?.default?.response?.data?.status === 'SUCCEEDED',
      'and supplies a successful analysis-run state for result screens');
    check('D2', ['prediction_slice_get', 'analysis_slice_metrics'].every(
      (id) => bundle.scenarios[id]?.run_not_succeeded?.response?.error?.code === 'RUN_NOT_SUCCEEDED',
    ), 'and supplies the V1 processing-state scenarios');
  }
}

// D3 — a missing bundle is not a failure. A fresh clone has none, because the
// bundle is generated and gitignored, and the app must still start: every
// screen shows FIXTURE_SCENARIO_MISSING, which is a working screen.
{
  const { bundleLoaded, client } = await loadClient({
    contractPath: CONTRACT_FILE,
    bundlePath: join(tmpdir(), 'no-such-bundle-1758240000.json'),
  });
  check('D3', bundleLoaded === false, 'a missing bundle is reported, not thrown');
  const view = await client.call('case_get', { case_id: 'C1' });
  check('D3', view.state === STATE.EMPTY_UNAVAILABLE && view.reason === 'FIXTURE_SCENARIO_MISSING',
    `and every call yields ${view.state} / ${view.reason}`);
}

// D4 — a bundle that IS on disk is loaded and served.
{
  const dir = mkdtempSync(join(tmpdir(), 'appcore-'));
  const path = join(dir, 'api_bundle.json');
  try {
    const { buildBundle } = await import('./_bundle.mjs');
    writeFileSync(path, JSON.stringify(buildBundle(contract)), 'utf8');
    const { bundleLoaded, client } = await loadClient({ contractPath: CONTRACT_FILE, bundlePath: path });
    const view = await client.call('case_get', { case_id: 'X_case_id' });
    check('D4', bundleLoaded === true && view.state === STATE.SUCCESS,
      `a bundle on disk is loaded and served (${view.state})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// D5 — app/core/index.mjs must stay importable where there is no node:fs.
// Re-exporting loadFromDisk from the barrel would break the bundle on a
// device, and it is an easy mistake to make while adding an export.
{
  const barrel = await import('../index.mjs');
  check('D5', !('loadClient' in barrel) && !('loadContract' in barrel),
    'the barrel does not re-export the filesystem module');
}

// D6 — the documented path. CI regenerates the bundle at BUNDLE_PATH before
// running these tests, so in CI this asserts that the generated file at the
// path FORMAT.md publishes is the one the app actually loads. Locally the
// file usually does not exist, and the check says so rather than failing:
// a developer who has not run the generator is not in an error state.
{
  const path = join(REPO, ...BUNDLE_PATH.split('/'));
  if (!existsSync(path)) {
    check('D6', true, `no bundle at ${BUNDLE_PATH} yet — generate it, or let CI do it`);
  } else {
    const { bundleLoaded, bundle } = await loadClient({ contractPath: CONTRACT_FILE, bundlePath: path });
    check('D6', bundleLoaded === true,
      `the bundle at ${BUNDLE_PATH} loads (${Object.keys(bundle.scenarios).length} endpoints with scenarios)`);
  }
}

done('app/core load from disk');
