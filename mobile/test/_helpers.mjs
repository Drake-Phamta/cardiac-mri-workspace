// Shared by the mobile tests. Reads the contract from disk and generates the
// fixture bundle with the project's own generator - the tests never carry a
// hand-written response body for a fixture-mode check.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createContract } from '../../app/core/index.mjs';
import { runGenerator } from '../scripts/prepare.mjs';

export const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(MOBILE_ROOT, '..');

export function readContractJson() {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'contracts', 'api', 'contract.json'), 'utf8'));
}

export function loadContract() {
  return createContract(readContractJson());
}

let cachedBundle = null;
export function generatedBundleJson() {
  if (!cachedBundle) cachedBundle = runGenerator({ python: process.env.PYTHON }).json;
  return cachedBundle;
}
