// node --test mobile/test/  - the build-input script (scripts/prepare.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBundle } from '../../app/core/index.mjs';
import { parseArgs, runGenerator } from '../scripts/prepare.mjs';
import { loadContract } from './_helpers.mjs';

test('P1 flags beat the environment, the environment beats mobile/.env.local, which beats defaults', () => {
  assert.deepEqual(parseArgs([], {}), {
    mode: 'fixture', apiBaseUrl: undefined, studyId: undefined, quiet: false, strict: false,
  });
  assert.equal(parseArgs([], { CMW_MODE: 'live' }).mode, 'live');
  assert.equal(parseArgs(['--mode', 'fixture'], { CMW_MODE: 'live' }).mode, 'fixture');
  const file = { EXPO_PUBLIC_API_BASE_URL: 'http://from-file.invalid:1' };
  assert.equal(parseArgs([], {}, file).apiBaseUrl, 'http://from-file.invalid:1');
  assert.equal(parseArgs([], { EXPO_PUBLIC_API_BASE_URL: 'http://from-env.invalid:2' }, file).apiBaseUrl, 'http://from-env.invalid:2');
  assert.equal(parseArgs(['--api-base-url', 'http://from-flag.invalid:3'], { EXPO_PUBLIC_API_BASE_URL: 'http://e.invalid:2' }, file).apiBaseUrl,
    'http://from-flag.invalid:3');
  assert.equal(parseArgs([], { CMW_STUDY_ID: 'S1' }).studyId, 'S1');
  assert.equal(parseArgs(['--strict']).strict, true);
});

test('P2 a flag with no value, or an unknown flag, is an error', () => {
  assert.throws(() => parseArgs(['--mode']), /needs a value/);
  assert.throws(() => parseArgs(['--mode', '--quiet']), /needs a value/);
  assert.throws(() => parseArgs(['--fast']), /unknown argument/);
});

test('P3 the bundle comes from contracts/api/generate_fixture.py and passes app/core FORMAT.md checks', () => {
  const { json } = runGenerator({ python: process.env.PYTHON });
  const bundle = createBundle(loadContract(), json);
  assert.equal(json.contract, 'api_contract_11');
  assert.ok(bundle);
});
