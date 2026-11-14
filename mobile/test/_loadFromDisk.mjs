/*
 * Test helper: reads the contract and a fixture bundle from disk. The app itself takes
 * already-parsed JSON (a device bundle has no node:fs), so this stays under mobile/test/.
 */

import { readFile } from 'node:fs/promises';
import { createContract } from '../src/api/contract.mjs';
import { createBundle, BUNDLE_PATH, createFixtureTransport, createClient } from '../src/api/client.mjs';

export const CONTRACT_PATH = 'contracts/api/contract.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadContract(path = CONTRACT_PATH) {
  return createContract(await readJson(path));
}

export async function loadBundle(contract, path = BUNDLE_PATH) {
  return createBundle(contract, await readJson(path));
}

/*
 * A missing bundle is not an error. The bundle is gitignored and generated, so
 * a fresh clone has none until CI or a developer runs the generator; the
 * client then serves FIXTURE_SCENARIO_MISSING for every call, which is a
 * working screen. `bundleLoaded` says which of the two happened.
 */
export async function loadClient({ contractPath = CONTRACT_PATH, bundlePath = BUNDLE_PATH } = {}) {
  const contract = await loadContract(contractPath);
  let bundle;
  let bundleLoaded = true;
  try {
    bundle = await loadBundle(contract, bundlePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      bundleLoaded = false;
      bundle = createBundle(contract, {
        contract: contract.contract,
        contract_version: contract.contractVersion,
        base_path: contract.basePath,
        geometry: { geometry_contract_version: contract.geometryContractVersion },
      });
    } else {
      throw err;
    }
  }
  return { contract, bundle, bundleLoaded, client: createClient(contract, createFixtureTransport(bundle)) };
}
