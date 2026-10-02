// node --test mobile/test/  - build configuration (src/config.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_BASE_URL_ENV, ConfigError, DEFAULT_STUDY_ID, MODE, describeConfig, maskBaseUrl, normalizeBaseUrl, parseEnvFile,
  resolveConfig,
} from '../src/config.mjs';

const HOST = 'http://backend.invalid:8000'; // RFC 2606 reserved name - no real host in git

test('C1 an empty input is fixture mode, needs nothing configured, and carries no backend URL', () => {
  const c = resolveConfig({});
  assert.equal(c.mode, MODE.FIXTURE);
  assert.equal(c.apiBaseUrl, null);
  assert.equal(c.problem, null);
  assert.equal(c.studyId, DEFAULT_STUDY_ID);
  assert.ok(Object.isFrozen(c));
});

test('C2 live mode keeps a given base URL, normalised', () => {
  const c = resolveConfig({ mode: 'LIVE', apiBaseUrl: ` ${HOST}/ ` });
  assert.equal(c.mode, MODE.LIVE);
  assert.equal(c.apiBaseUrl, HOST);
  assert.equal(c.problem, null);
});

test('C3 live mode WITHOUT a URL resolves with a configuration problem instead of guessing a host', () => {
  const c = resolveConfig({ mode: 'live' });
  assert.equal(c.apiBaseUrl, null);
  assert.equal(c.problem.code, 'CONFIG_LIVE_URL_MISSING');
  assert.match(c.problem.message, new RegExp(API_BASE_URL_ENV));
  assert.match(c.problem.message, /\.env\.local/);
  assert.match(describeConfig(c), /^LIVE · no backend URL configured/);
});

test('C4 an unknown mode is refused, never guessed', () => {
  assert.throws(() => resolveConfig({ mode: 'offline' }), ConfigError);
  assert.throws(() => resolveConfig({ mode: 'mock' }), /fixture" or "live/);
});

test('C5 a base URL that already carries /api/v1 is refused (contract paths are absolute)', () => {
  assert.throws(() => normalizeBaseUrl(`${HOST}/api/v1`), /API prefix/);
  assert.throws(() => normalizeBaseUrl(`${HOST}/api/v1/`), /API prefix/);
  assert.equal(normalizeBaseUrl('https://backend.invalid/gateway'), 'https://backend.invalid/gateway');
});

test('C6 malformed URLs and the unedited README placeholder are refused', () => {
  for (const bad of ['', '   ', 'ftp://x', 'backend.invalid:8000', 'file:///etc/passwd', null,
    'http://<mac-mini-overlay-ip>:8000']) {
    assert.throws(() => normalizeBaseUrl(bad), ConfigError, String(bad));
  }
  assert.throws(() => resolveConfig({ mode: 'live', apiBaseUrl: 'http://<mac-mini-overlay-ip>:8000' }), /placeholder/);
});

test('C7 a study id must be a de-identified token', () => {
  assert.equal(resolveConfig({ studyId: 'STUDY_DEMO' }).studyId, 'STUDY_DEMO');
  assert.throws(() => resolveConfig({ studyId: 'Nguyen Van A' }), /de-identified/);
  assert.throws(() => resolveConfig({ studyId: '../etc' }), /de-identified/);
});

test('C8 timeouts outside 1..120 s are refused', () => {
  assert.equal(resolveConfig({ timeoutMs: 5000 }).timeoutMs, 5000);
  assert.throws(() => resolveConfig({ timeoutMs: 10 }), /timeoutMs/);
  assert.throws(() => resolveConfig({ timeoutMs: 'soon' }), /timeoutMs/);
});

test('C9 the banner text names the mode and, for live, the backend', () => {
  assert.equal(describeConfig(resolveConfig({ mode: 'live', apiBaseUrl: HOST })), 'LIVE · backend http://<configured> · study STUDY_DEMO');
  assert.match(describeConfig(resolveConfig({})), /^FIXTURE · generated contract fixtures/);
});

test('C10 build provenance passes through and defaults to null', () => {
  const c = resolveConfig({ gitSha: 'abc123', generatedAt: '2026-10-01T00:00:00Z', contractVersion: 'DRAFT v0' });
  assert.deepEqual({ ...c.build }, {
    gitSha: 'abc123', generatedAt: '2026-10-01T00:00:00Z', contractVersion: 'DRAFT v0', fixtureGeneratedBy: null,
  });
});

test('C11 .env.local parsing: comments, blanks, quotes and export are handled', () => {
  const env = parseEnvFile([
    '# live backend - never committed',
    '',
    `${API_BASE_URL_ENV}="${HOST}"`,
    "export CMW_STUDY_ID='STUDY_DEMO'",
    'BROKEN LINE',
    '=no-key',
  ].join('\r\n'));
  assert.deepEqual(env, { [API_BASE_URL_ENV]: HOST, CMW_STUDY_ID: 'STUDY_DEMO' });
});

test('C12 fixture mode drops a backend address completely, even when one is supplied (N-4)', () => {
  const c = resolveConfig({ mode: 'fixture', apiBaseUrl: HOST });
  assert.equal(c.apiBaseUrl, null);
  assert.equal(resolveConfig({ mode: 'fixture', apiBaseUrl: 'http://<mac-mini-overlay-ip>:8000' }).apiBaseUrl, null,
    'not even validated - it is not used');
});

test('C13 maskBaseUrl keeps the scheme and hides host and port', () => {
  assert.equal(maskBaseUrl('http://192.0.2.10:8000'), 'http://<configured>'); // RFC 5737 documentation address
  assert.equal(maskBaseUrl('HTTPS://backend.invalid'), 'https://<configured>');
  assert.equal(maskBaseUrl(null), '<not configured>');
  assert.ok(!describeConfig(resolveConfig({ mode: 'live', apiBaseUrl: HOST })).includes('backend.invalid'));
});
