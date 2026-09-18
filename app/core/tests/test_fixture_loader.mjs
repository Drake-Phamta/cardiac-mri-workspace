// node app/core/tests/test_fixture_loader.mjs
//
// Each check corrupts a bundle in exactly one way and asserts the loader
// names it. These are the six rules in FORMAT.md, and they are the six ways
// Trung's generator can drift from the contract without anything crashing.

import { createContract } from '../contract.mjs';
import { createBundle, getScenario, listScenarios } from '../fixtures/loader.mjs';
import { createChecker, loadContractJson } from './_harness.mjs';
import { buildBundle } from './_bundle.mjs';

const { check, done } = createChecker();
const contract = createContract(loadContractJson());

const problemsOf = (json) => {
  try { createBundle(contract, json); return []; } catch (err) { return err.detail?.problems ?? [err.code]; }
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const good = buildBundle(contract);

// F0 — a bundle generated from the contract passes unmodified. Without this
// every other check could pass for the wrong reason.
{
  const problems = problemsOf(good);
  check('F0', problems.length === 0, 'a contract-derived bundle loads clean' +
    (problems.length ? ` — ${problems.slice(0, 3).join('; ')}` : ''));
  const bundle = createBundle(contract, good);
  check('F0', bundle.hasScenarios && listScenarios(bundle, 'case_get').includes('default'),
    `${Object.keys(bundle.scenarios).length} endpoints have scenarios`);
}

// F1 — identity. A bundle built from a different contract revision renders,
// and renders the wrong thing, so it must be refused.
{
  const b = clone(good); b.contract_version = 'DRAFT v1';
  check('F1', problemsOf(b).some((p) => p.includes('contract_version')), 'a wrong contract_version is refused');
  const c = clone(good); c.geometry.geometry_contract_version = 'dr008a-dr012/v1.0.1';
  check('F1', problemsOf(c).some((p) => p.includes('geometry version')), 'a wrong geometry version is refused');
}

// F2 — a scenario keyed by an endpoint id that does not exist is dead weight
// that looks like coverage.
{
  const b = clone(good); b.scenarios.slice_get = b.scenarios.case_get;
  check('F2', problemsOf(b).some((p) => p.includes('unknown endpoint id slice_get')),
    'an invented endpoint id is refused');
}

// F3 — a 200 missing a response_field is the blank-field bug: the screen
// renders, the value is undefined.
{
  const b = clone(good); delete b.scenarios.case_get.default.response.data.available_run_ids;
  check('F3', problemsOf(b).some((p) => p.includes('missing response field available_run_ids')),
    'a missing response field is named');
}

// F3b — the items row rule. A list field satisfied on every row is present;
// satisfied on only some rows it is not.
{
  const b = clone(good);
  check('F3b', problemsOf(b).length === 0, 'list endpoints pass with row fields on every item');
  const c = clone(good); delete c.scenarios.reviewed_masks_list.default.response.data.items[1].checksum;
  check('F3b', problemsOf(c).some((p) => p.includes('missing response field checksum')),
    'a field present on only some rows is refused');
}

// F4 — an error code that belongs to a different endpoint. This is the one a
// human reviewer misses, because the code is real.
{
  const b = clone(good);
  b.scenarios.mri_slice_get.error_case.response = {
    status: 409, error: { code: 'STALE_REVISION', message: 'x', request_id: 'r', details: null },
  };
  check('F4', problemsOf(b).some((p) => p.includes('STALE_REVISION')),
    'an error code the endpoint does not list is refused');

  const c = clone(good);
  c.scenarios.case_get.error_case.response.status = 500;
  check('F4', problemsOf(c).some((p) => p.includes('but')),
    'an error status that disagrees with the contract is refused');
}

// F5 — geometry. Seven fields, exact version, on every geometry endpoint.
{
  const b = clone(good); delete b.scenarios.geometry_get.default.response.data.direction;
  check('F5', problemsOf(b).some((p) => p.includes('missing geometry field direction')),
    'a missing geometry field is named');
  const c = clone(good);
  c.scenarios.case_get.default.response.data.geometry_contract_version = 'dr008a-dr012/v0.9.0';
  check('F5', problemsOf(c).some((p) => p.includes('geometry_contract_version')),
    'a per-response geometry version drift is refused');
}

// F6 — every {token} supplied, including the ones whose parameter name differs.
{
  const b = clone(good); delete b.scenarios.analysis_run_metrics.default.request.params.variant;
  check('F6', problemsOf(b).some((p) => p.includes('{variant}')), 'an unsupplied token is named');
}

// F7 — a bundle with no scenarios block is VALID. That is what lets the four
// verticals build today against a generator that does not exist yet.
{
  const b = clone(good); delete b.scenarios;
  const problems = problemsOf(b);
  check('F7', problems.length === 0, 'a bundle with no scenarios loads');
  const bundle = createBundle(contract, b);
  check('F7', bundle.hasScenarios === false && getScenario(bundle, 'case_get') === null,
    'and reports no scenario rather than throwing');
}

// F8 — every problem is collected, not just the first.
{
  const b = clone(good);
  delete b.scenarios.case_get.default.response.data.available_run_ids;
  delete b.scenarios.geometry_get.default.response.data.direction;
  b.contract_version = 'DRAFT v1';
  check('F8', problemsOf(b).length >= 3, `${problemsOf(b).length} problems reported in one pass`);
}

done('app/core fixture loader');
