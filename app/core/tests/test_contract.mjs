// node app/core/tests/test_contract.mjs
//
// Checks the loader against the REAL contracts/api/contract.json, not a
// miniature. A loader tested only against its own fixture agrees with itself.

import { createContract, EXPECTED } from '../contract.mjs';
import { createChecker, loadContractJson, throwsCode } from './_harness.mjs';

const { check, done } = createChecker();
const json = loadContractJson();
const contract = createContract(json);

check('C1', contract.contract === EXPECTED.contract, `contract is ${contract.contract}`);
check('C2', contract.contractVersion === EXPECTED.contractVersion,
  `contract_version is ${contract.contractVersion}`);
check('C3', contract.basePath === EXPECTED.basePath, `base_path is ${contract.basePath}`);
check('C4', contract.endpointsById.size === EXPECTED.endpointCount,
  `${contract.endpointsById.size} endpoints, expected ${EXPECTED.endpointCount}`);
check('C5', contract.errorsByCode.size === EXPECTED.errorCount,
  `${contract.errorsByCode.size} error codes, expected ${EXPECTED.errorCount}`);
check('C6', contract.geometryContractVersion === EXPECTED.geometryContractVersion,
  `geometry version is ${contract.geometryContractVersion}`);
check('C7', contract.geometryFields.length === 7,
  `${contract.geometryFields.length} required geometry fields`);

// Every endpoint path is fully qualified. If one were relative, a caller
// concatenating base_path would produce /api/v1/api/v1/... and only find out
// on a device.
{
  const bad = [...contract.endpointsById.values()].filter((e) => !e.path.startsWith(EXPECTED.basePath));
  check('C8', bad.length === 0, `all paths start with ${EXPECTED.basePath}`);
}

// Frozen all the way down: a vertical cannot mutate the shared contract.
{
  let mutated = false;
  try { contract.raw.endpoints[0].id = 'tampered'; mutated = contract.raw.endpoints[0].id === 'tampered'; }
  catch { mutated = false; }
  check('C9', mutated === false, 'contract is deep-frozen against in-place edits');
}

// A drifted contract must be rejected, and must report EVERY problem at once.
{
  const drifted = JSON.parse(JSON.stringify(json));
  drifted.contract_version = 'DRAFT v1';
  drifted.base_path = '/api/v2';
  drifted.endpoints.pop();
  let problems = [];
  try { createContract(drifted); } catch (err) { problems = err.detail.problems; }
  check('C10', problems.length >= 3, `rejected with ${problems.length} problems reported together`);
}

// An endpoint referencing an error code that does not exist is a real drift
// mode: the code is deleted from `errors` but left on an endpoint.
{
  const drifted = JSON.parse(JSON.stringify(json));
  drifted.endpoints[0].errors = [...drifted.endpoints[0].errors, 'NO_SUCH_CODE'];
  const code = throwsCode(() => createContract(drifted));
  check('C11', code === 'CONTRACT_INVALID', `unknown error reference rejected (${code})`);
}

done('app/core contract');
