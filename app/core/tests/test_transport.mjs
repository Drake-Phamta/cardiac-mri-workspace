// node app/core/tests/test_transport.mjs
//
// The client must hand a screen a state, never a raw response, and must never
// hand it a response the contract did not license.

import { createContract } from '../contract.mjs';
import { createBundle } from '../fixtures/loader.mjs';
import { createFixtureTransport, createClient, validateResponse } from '../transport.mjs';
import { resolveEndpoint } from '../endpoints.mjs';
import { STATE, RECOVERY } from '../errors.mjs';
import { createChecker, loadContractJson } from './_harness.mjs';
import { buildBundle } from './_bundle.mjs';

const { check, done } = createChecker();
const contract = createContract(loadContractJson());
const bundle = createBundle(contract, buildBundle(contract));
const client = createClient(contract, createFixtureTransport(bundle));

// T1 — every one of the 28 endpoints answers SUCCESS from the bundle. This is
// the check that says the four verticals can actually build today.
{
  const failures = [];
  for (const id of contract.endpointsById.keys()) {
    const params = bundle.scenarios[id].default.request.params;
    const view = await client.call(id, params);
    if (view.state !== STATE.SUCCESS) failures.push(`${id}: ${view.state} ${JSON.stringify(view.error?.detail ?? '')}`);
  }
  check('T1', failures.length === 0, `all ${contract.endpointsById.size} endpoints return SUCCESS` +
    (failures.length ? ` — ${failures.slice(0, 3).join('; ')}` : ''));
}

// T2 — every endpoint's error scenario becomes a non-SUCCESS state with a
// reason, and never leaks data.
{
  const failures = [];
  for (const id of contract.endpointsById.keys()) {
    const params = bundle.scenarios[id].error_case.request.params;
    const view = await client.call(id, params, { scenario: 'error_case' });
    if (view.state === STATE.SUCCESS || view.data !== null || !view.reason) failures.push(id);
  }
  check('T2', failures.length === 0, 'every error scenario yields a reasoned, data-free state' +
    (failures.length ? ` — ${failures.slice(0, 3).join(', ')}` : ''));
}

// T3 — a missing scenario is EMPTY_UNAVAILABLE, not a crash. This is the state
// every screen shows until the generator grows a scenarios block.
{
  const view = await client.call('case_get', { case_id: 'C1' }, { scenario: 'no_such_scenario' });
  check('T3', view.state === STATE.EMPTY_UNAVAILABLE && view.reason === 'FIXTURE_SCENARIO_MISSING',
    `missing scenario -> ${view.state} / ${view.reason}`);
}

// T4 — a response that drifts from the contract is FATAL_INVALID naming the
// field, not an undefined three components deeper.
{
  const drifted = createClient(contract, {
    kind: 'test',
    async send() { return { status: 200, data: { case_id: 'C1' } }; },
  });
  const view = await drifted.call('case_get', { case_id: 'C1' });
  check('T4', view.state === STATE.FATAL_INVALID && view.error.code === 'CONTRACT_DRIFT',
    `a short response -> ${view.state} / ${view.error?.code}`);
  check('T4', view.error.detail.problems.some((p) => p.includes('geometry_validation_status')),
    'and the missing field is named');
}

// T5 — a server error code the endpoint does not license is refused before it
// can be classified. A fixture must not teach a screen a wrong recovery.
{
  const rogue = createClient(contract, {
    kind: 'test',
    async send() { return { status: 409, error: { code: 'STALE_REVISION' } }; },
  });
  const view = await rogue.call('mri_slice_get', { case_id: 'C1', slice_index: 1 });
  check('T5', view.state === STATE.FATAL_INVALID && view.error.code === 'CONTRACT_DRIFT',
    `an unlicensed error code -> ${view.error?.code}`);
}

// T6 — a transport that throws becomes the one retryable state, not a fatal.
{
  const dead = createClient(contract, {
    kind: 'test',
    async send() { throw new Error('econnrefused'); },
  });
  const view = await dead.call('case_get', { case_id: 'C1' });
  check('T6', view.state === STATE.RECOVERABLE_ERROR && view.actions.includes(RECOVERY.RETRY),
    `an unreachable server -> ${view.state} offering ${view.actions.join('/')}`);
}

// T7 — a resolution failure never reaches the transport. An omitted variant
// must not become a request with the parameter missing.
{
  let sent = 0;
  const counting = createClient(contract, {
    kind: 'test',
    async send() { sent += 1; return { status: 200, data: {} }; },
  });
  const view = await counting.call('prediction_slice_get', { run_id: 'R1', slice_index: 1 });
  check('T7', sent === 0 && view.state === STATE.FATAL_INVALID && view.error.code === 'MISSING_PARAM',
    `unresolved request is not sent (${view.error?.code})`);
}

// T8 — a write without expected_revision is refused client-side.
{
  let sent = 0;
  const counting = createClient(contract, {
    kind: 'test',
    async send() { sent += 1; return { status: 200, data: {} }; },
  });
  const view = await counting.call('review_patch', { review_id: 'RV1' }, { body: { status: 'APPROVED' } });
  check('T8', sent === 0 && view.error?.code === 'MISSING_EXPECTED_REVISION',
    `a write with no expected_revision is refused (${view.error?.code})`);
}

// T9 — validateResponse is usable on its own, for a screen holding a payload
// that did not come through the client (a WebView bridge message, say).
{
  const resolved = resolveEndpoint(contract, 'geometry_get', { case_id: 'C1' });
  const problems = validateResponse(contract, resolved, {
    status: 200,
    data: { geometry_contract_version: 'WRONG', geometry_validation_status: 'VALIDATED' },
  });
  check('T9', problems.length > 0 && problems.some((p) => p.includes('geometry version')),
    `validateResponse alone finds ${problems.length} problems`);
}

done('app/core transport');
