// Shared test scaffolding for app/core. No npm dependency, no test runner:
// every test file is a plain node script that exits 1 on failure, which is
// the convention the rest of the repo already uses.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..', '..');
export const CONTRACT_FILE = join(REPO, 'contracts', 'api', 'contract.json');

export function loadContractJson() {
  return JSON.parse(readFileSync(CONTRACT_FILE, 'utf8'));
}

export function createChecker() {
  const state = { failures: 0, count: 0 };
  const check = (id, ok, detail) => {
    state.count += 1;
    if (!ok) state.failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${String(id).padEnd(5)} ${detail}`);
  };
  const done = (name) => {
    console.log(`${state.failures === 0 ? 'PASS' : 'FAIL'} ${name} — ${state.count - state.failures}/${state.count}`);
    process.exit(state.failures === 0 ? 0 : 1);
  };
  return { check, done, state };
}

// Returns the CoreError code a thunk threw, or null if it did not throw.
export function throwsCode(fn) {
  try { fn(); return null; } catch (err) { return err?.code ?? err?.name ?? 'THREW'; }
}

export async function throwsCodeAsync(fn) {
  try { await fn(); return null; } catch (err) { return err?.code ?? err?.name ?? 'THREW'; }
}
