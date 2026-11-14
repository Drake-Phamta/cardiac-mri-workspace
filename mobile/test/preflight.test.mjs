// scripts/preflight-live.mjs - the paths that need no backend data: P1 (reachable,
// same contract), argument handling, and that the backend address is never
// printed (the output is pasted into session notes). The URL is passed in the
// environment, which wins over an untracked mobile/.env.local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { MOBILE_ROOT, readContractJson } from './_helpers.mjs';

const SCRIPT = join(MOBILE_ROOT, 'scripts', 'preflight-live.mjs');

function run(args, url) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: url, CMW_STUDY_ID: 'STUDY_DEMO' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, out }));
  });
}

async function serve(handler) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, port, close: () => new Promise((r) => server.close(r)) };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function assertNoAddress(out, port) {
  assert.ok(!out.includes('127.0.0.1'), `the host must not be printed:\n${out}`);
  assert.ok(!out.includes(String(port)), `the port must not be printed:\n${out}`);
  assert.match(out, /http:\/\/<configured>/);
}

test('PF1 a backend on another contract version fails P1 and says to rebuild', async () => {
  const srv = await serve((req, res) => sendJson(res, 200, { status: 'ok', contract_version: '0.0.0-preflight-test' }));
  try {
    const { code, out } = await run([], srv.url);
    assert.equal(code, 1, out);
    assert.match(out, /FAIL P1 .*backend contract 0\.0\.0-preflight-test, this checkout /);
    assert.match(out, /REBUILD/);
    assertNoAddress(out, srv.port);
  } finally {
    await srv.close();
  }
});

test('PF2 a backend on the same contract passes P1; the next failure is named, not hidden', async () => {
  const version = readContractJson().contract_version;
  const seen = [];
  const srv = await serve((req, res) => {
    seen.push(req.url);
    if (req.url === '/health') return sendJson(res, 200, { status: 'ok', contract_version: version });
    return sendJson(res, 404, { error: { code: 'ARTIFACT_NOT_FOUND', message: 'not here' } });
  });
  try {
    const { code, out } = await run(['--case', 'CASE_0061'], srv.url);
    assert.equal(code, 1, out);
    assert.match(out, /ok {3}P1 \/health ok; backend contract /);
    assert.match(out, /FAIL P3 case_get CASE_0061/);
    assert.ok(!/PREFLIGHT PASS/.test(out));
    assert.ok(seen.includes('/api/v1/cases/CASE_0061'), seen.join(' '));
    assertNoAddress(out, srv.port);
  } finally {
    await srv.close();
  }
});

test('PF3 nothing listening: P1 says the backend did not answer, without the address', async () => {
  const srv = await serve(() => {});
  const { url, port } = srv;
  await srv.close();
  const { code, out } = await run([], url);
  assert.equal(code, 1, out);
  assert.match(out, /FAIL P1 \/health did not answer/);
  assertNoAddress(out, port);
});

test('PF4 a /health that is not JSON is named as such', async () => {
  const srv = await serve((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>router login</html>'); });
  try {
    const { code, out } = await run([], srv.url);
    assert.equal(code, 1, out);
    assert.match(out, /FAIL P1 \/health answered HTTP 200 but not with JSON/);
    assertNoAddress(out, srv.port);
  } finally {
    await srv.close();
  }
});

test('PF5 an unusable URL exits 2 without echoing the value', async () => {
  const { code, out } = await run([], 'backend.invalid:8000');
  assert.equal(code, 2, out);
  assert.match(out, /not usable/);
  assert.ok(!out.includes('backend.invalid'), out);
});

test('PF6 arguments: unknown or missing values are refused', async () => {
  const a = await run(['--frobnicate'], 'http://backend.invalid:8000');
  assert.equal(a.code, 1);
  assert.match(a.out, /unknown argument --frobnicate/);
  const b = await run(['--case'], 'http://backend.invalid:8000');
  assert.equal(b.code, 1);
  assert.match(b.out, /--case needs a value/);
});
