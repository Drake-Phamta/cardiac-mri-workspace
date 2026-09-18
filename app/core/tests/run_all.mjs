// node app/core/tests/run_all.mjs
//
// Runs the nine app/core test scripts in one go and exits 1 if any of them
// does. CI runs the same nine individually, so a failure names its own file
// in the job log; this exists so nobody has to remember the list locally.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(HERE).filter((f) => f.startsWith('test_') && f.endsWith('.mjs')).sort();

console.log(`node ${process.version} — ${tests.length} test scripts\n`);
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [join(HERE, t)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
  console.log('');
}
console.log(failed === 0 ? `ALL PASS — ${tests.length}/${tests.length}` : `FAILED — ${failed}/${tests.length}`);
process.exit(failed === 0 ? 0 : 1);
