// node app/core/tests/test_endpoints.mjs
//
// The riskiest module in app/core, because two things about contract.json are
// easy to get wrong and both fail silently:
//   - the query string is baked into `path`;
//   - the query PARAMETER name is not the placeholder TOKEN name
//     (?prediction_variant={variant}, ?ids={experiment_ids},
//      ?source_mask_id={mask_id}, and ?variant={variant} on one endpoint).
// A resolver that assumed param === token would emit ?variant=RAW where the
// server expects ?prediction_variant=RAW, and the fixture would still load.

import { createContract } from '../contract.mjs';
import { parseEndpointPath, tokensOf, resolveEndpoint, assertWritePreconditions } from '../endpoints.mjs';
import { createChecker, loadContractJson, throwsCode } from './_harness.mjs';

const { check, done } = createChecker();
const contract = createContract(loadContractJson());

// E1 — every endpoint resolves when every token is supplied, and no resolved
// URL keeps a brace. This walks all 28, so a new endpoint cannot slip past.
{
  const failures = [];
  for (const [id, endpoint] of contract.endpointsById) {
    const { path, query } = tokensOf(contract, id);
    const params = {};
    for (const t of [...path, ...query]) params[t] = t === 'experiment_ids' ? ['EXP-A', 'EXP-B'] : `X_${t}`;
    try {
      const r = resolveEndpoint(contract, id, params);
      if (r.url.includes('{') || r.url.includes('}')) failures.push(`${id}: ${r.url}`);
      if (!r.url.startsWith('/api/v1')) failures.push(`${id}: ${r.url}`);
      if (r.method !== endpoint.method) failures.push(`${id}: method`);
    } catch (err) {
      failures.push(`${id}: ${err.code}`);
    }
  }
  check('E1', failures.length === 0, `all ${contract.endpointsById.size} endpoints resolve` +
    (failures.length ? ` — ${failures.join('; ')}` : ''));
}

// E2 — the four endpoints where param name != token name, spelled out.
{
  const cases = [
    ['analysis_run_metrics', { run_id: 'R1', variant: 'RAW' },
      '/api/v1/analysis-runs/R1/metrics?prediction_variant=RAW'],
    ['prediction_slice_get', { run_id: 'R1', slice_index: 7, variant: 'PROCESSED' },
      '/api/v1/analysis-runs/R1/slices/7/prediction?variant=PROCESSED'],
    ['experiment_compare', { experiment_ids: ['EXP-U-100', 'EXP-D-100'] },
      '/api/v1/experiments/compare?ids=EXP-U-100,EXP-D-100'],
    ['reconstruction_get', { run_id: 'R1', mask_id: 'M9' },
      '/api/v1/analysis-runs/R1/reconstruction?source_mask_id=M9'],
  ];
  for (const [id, params, expected] of cases) {
    const got = resolveEndpoint(contract, id, params).url;
    check('E2', got === expected, `${id} -> ${got}`);
  }
}

// E3 — a missing token is an error, never a silent empty value. `11` section 6
// forbids substituting a prediction variant; an empty ?variant= would do it.
{
  check('E3', throwsCode(() => resolveEndpoint(contract, 'prediction_slice_get',
    { run_id: 'R1', slice_index: 3 })) === 'MISSING_PARAM', 'omitted variant is rejected');
  check('E3', throwsCode(() => resolveEndpoint(contract, 'prediction_slice_get',
    { run_id: 'R1', slice_index: 3, variant: '' })) === 'MISSING_PARAM', 'empty variant is rejected');
  check('E3', throwsCode(() => resolveEndpoint(contract, 'mri_slice_get',
    { case_id: 'C1' })) === 'MISSING_PARAM', 'omitted slice_index is rejected');
}

// slice_index 0 is a legitimate slice. A truthiness check on the value would
// reject it, and the bug would look like "the first slice never loads".
{
  const url = resolveEndpoint(contract, 'mri_slice_get', { case_id: 'C1', slice_index: 0 }).url;
  check('E4', url === '/api/v1/cases/C1/slices/0/mri', `slice 0 resolves: ${url}`);
}

// E5 — an id that needs escaping must not break out of its path segment.
{
  const url = resolveEndpoint(contract, 'case_get', { case_id: 'a/b c?d' }).url;
  check('E5', url === '/api/v1/cases/a%2Fb%20c%3Fd', `case_id is escaped: ${url}`);
}

check('E6', throwsCode(() => resolveEndpoint(contract, 'no_such_endpoint', {})) === 'UNKNOWN_ENDPOINT',
  'unknown endpoint id is rejected');

// E7 — every revision_required endpoint refuses a body without
// expected_revision. revision_rules.last_write_wins_allowed is false, so a
// write that forgets it is a lost edit, not a server problem.
{
  const writes = [...contract.endpointsById.values()].filter((e) => e.revision_required === true);
  check('E7', writes.length === 4, `${writes.length} revision-required endpoints`);
  const leaks = writes.filter((e) =>
    throwsCode(() => assertWritePreconditions(contract, e.id, { data: 1 })) !== 'MISSING_EXPECTED_REVISION');
  check('E7', leaks.length === 0, 'all of them reject a body with no expected_revision');
  const ok = writes.filter((e) =>
    throwsCode(() => assertWritePreconditions(contract, e.id, { expected_revision: 4 })) !== null);
  check('E7', ok.length === 0, 'and accept one that carries it');
}

// E8 — parseEndpointPath keeps the contract's parameter name verbatim.
{
  const p = parseEndpointPath('/api/v1/analysis-runs/{run_id}/slices/{slice_index}/metrics?prediction_variant={variant}');
  check('E8', p.pathTokens.join(',') === 'run_id,slice_index', `path tokens ${p.pathTokens.join(',')}`);
  check('E8', p.queryTokens[0].param === 'prediction_variant' && p.queryTokens[0].token === 'variant',
    `query param ${p.queryTokens[0].param} <- token ${p.queryTokens[0].token}`);
}

done('app/core endpoints');
