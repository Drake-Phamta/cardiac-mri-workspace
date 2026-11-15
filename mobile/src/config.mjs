/*
 * Build configuration: fixture mode answers from the generated bundle with no backend; live mode calls the
 * backend over HTTP. scripts/prepare.mjs fixes the mode at build time. Live never falls back to fixture,
 * so a backend that is down shows RECOVERABLE_ERROR with Retry, not made-up answers.
 */

export const MODE = Object.freeze({ FIXTURE: 'fixture', LIVE: 'live' });

// The build-time variable with the backend base URL. The URL is never in git: the repository is public.
export const API_BASE_URL_ENV = 'EXPO_PUBLIC_API_BASE_URL';

// Matches the generated fixture's {study_id} so fixture mode needs no flag.
// A live build that serves another study passes --study-id.
export const DEFAULT_STUDY_ID = 'STUDY_DEMO';

export const DEFAULT_TIMEOUT_MS = 15000;

export class ConfigError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ConfigError';
    this.code = detail.code || 'CONFIG_INVALID';
    this.detail = detail;
  }
}

// The phone reaches the backend on this PC through `adb reverse`, so the app only talks to 127.0.0.1.
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/i;

// Contract paths already start with /api/v1, so the base URL is only scheme://host[:port].
// A base ending in /api/v1 is refused here instead of showing up as a 404 on the phone.
// Plain http:// is accepted only for a loopback host (NFR-SEC-002): any other host must use https://,
// so no build can send MRI slices in cleartext over a real network.
export function normalizeBaseUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ConfigError('apiBaseUrl is empty');
  }
  const value = raw.trim().replace(/\/+$/, '');
  if (value.includes('<') || value.includes('>')) {
    throw new ConfigError(`apiBaseUrl is still the README placeholder: ${raw}`, { raw });
  }
  const m = /^(https?):\/\/([^/\s?#]+)(\/[^\s?#]*)?$/i.exec(value);
  if (!m) throw new ConfigError(`apiBaseUrl is not an http(s) URL: ${raw}`, { raw });
  const path = m[3] || '';
  if (/\/api\/v\d+$/i.test(path)) {
    throw new ConfigError(
      `apiBaseUrl must not include the API prefix - contract paths already start with /api/v1: ${raw}`,
      { raw },
    );
  }
  const scheme = m[1].toLowerCase();
  if (scheme === 'http' && !LOOPBACK_HOST.test(m[2])) {
    throw new ConfigError(
      `apiBaseUrl uses http:// to a host other than this device - use https://, or http://127.0.0.1 with adb reverse: ${raw}`,
      { raw, code: 'CONFIG_CLEARTEXT_REMOTE' },
    );
  }
  return `${scheme}://${m[2]}${path}`;
}

function normalizeStudyId(raw) {
  const value = raw === undefined || raw === null ? DEFAULT_STUDY_ID : String(raw).trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(value)) {
    throw new ConfigError(`studyId must be a de-identified token [A-Za-z0-9_.-], got: ${raw}`, { raw });
  }
  return value;
}

// input is src/generated/buildConfig.json from scripts/prepare.mjs. A bad mode or URL throws; a missing
// live URL does not, it sets problem so the app can show what to fix.
export function resolveConfig(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const mode = src.mode === undefined || src.mode === null ? MODE.FIXTURE : String(src.mode).toLowerCase();
  if (mode !== MODE.FIXTURE && mode !== MODE.LIVE) {
    throw new ConfigError(`mode must be "fixture" or "live", got: ${src.mode}`, { mode: src.mode });
  }

  const timeoutMs = src.timeoutMs === undefined || src.timeoutMs === null
    ? DEFAULT_TIMEOUT_MS : Number(src.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new ConfigError(`timeoutMs must be 1000..120000, got: ${src.timeoutMs}`);
  }

  // Fixture mode drops the backend address, so it cannot leak into a log or a screenshot.
  const hasUrl = mode === MODE.LIVE && typeof src.apiBaseUrl === 'string' && src.apiBaseUrl.trim() !== '';
  const apiBaseUrl = hasUrl ? normalizeBaseUrl(src.apiBaseUrl) : null;
  const problem = mode === MODE.LIVE && !apiBaseUrl
    ? Object.freeze({
      code: 'CONFIG_LIVE_URL_MISSING',
      message: `Live mode needs the backend base URL. Set ${API_BASE_URL_ENV}=http://<host>:<port> in `
        + 'mobile/.env.local (untracked) or in the environment, then rebuild.',
    })
    : null;

  return Object.freeze({
    mode,
    apiBaseUrl,
    studyId: normalizeStudyId(src.studyId),
    timeoutMs,
    problem,
    build: Object.freeze({
      generatedAt: src.generatedAt ?? null,
      gitSha: src.gitSha ?? null,
      contractVersion: src.contractVersion ?? null,
      fixtureGeneratedBy: src.fixtureGeneratedBy ?? null,
    }),
  });
}

// Screenshots and logs may be committed to the public repository, so the app shows the backend only as
// scheme + "<configured>", never its host or port.
export function maskBaseUrl(url) {
  if (typeof url !== 'string' || url === '') return '<not configured>';
  const m = /^(https?):\/\//i.exec(url);
  return m ? `${m[1].toLowerCase()}://<configured>` : '<configured>';
}

// One line for a banner or a log. Never contains patient data or the backend address.
export function describeConfig(config) {
  if (config.mode === MODE.LIVE) {
    return config.apiBaseUrl
      ? `LIVE · backend ${maskBaseUrl(config.apiBaseUrl)} · study ${config.studyId}`
      : `LIVE · no backend URL configured · study ${config.studyId}`;
  }
  return `FIXTURE · generated contract fixtures · study ${config.studyId}`;
}

// Reads mobile/.env.local for prepare.mjs, so the URL is never typed on a command line that ends up
// in a shell history or a build log.
export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
