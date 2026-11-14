/*
 * Build configuration for the mobile app - which transport the client uses.
 *
 * Two modes, chosen at BUILD time by scripts/prepare.mjs, never switched by
 * the app at run time:
 *
 *   fixture  every call is answered from the bundle that
 *            contracts/api/generate_fixture.py generated (gitignored, never
 *            hand-written). Demonstrable with no backend - `12` asks for that.
 *            Needs nothing configured.
 *   live     every call goes over HTTP to the FastAPI backend. The base URL
 *            is NOT in git (the repository is public): it comes at build time
 *            from EXPO_PUBLIC_API_BASE_URL, either in the environment or in
 *            the untracked mobile/.env.local. A live build without one starts
 *            on a configuration-error screen instead of guessing a host.
 *
 * There is deliberately no fallback from live to fixture. A placeholder
 * answer shown when the backend is down would be a screen that lies about
 * where its numbers came from (DEMO_STANDARD D2). Live + unreachable is the
 * RECOVERABLE_ERROR state with a retry, which is the honest screen.
 *
 * Plain ESM with no React Native import: Metro bundles this file and
 * `node --test` imports the very same file, so the tests check what ships.
 */

export const MODE = Object.freeze({ FIXTURE: 'fixture', LIVE: 'live' });

// The build-time variable that carries the live backend's base URL.
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

/*
 * Every endpoint path in contract.json is already absolute (/api/v1/...), so
 * the base URL must be scheme://host[:port] and nothing more. A base that
 * ends in /api/v1 would produce /api/v1/api/v1/... - refused here rather than
 * discovered as a 404 on the phone.
 */
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
  return `${m[1].toLowerCase()}://${m[2]}${path}`;
}

function normalizeStudyId(raw) {
  const value = raw === undefined || raw === null ? DEFAULT_STUDY_ID : String(raw).trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(value)) {
    throw new ConfigError(`studyId must be a de-identified token [A-Za-z0-9_.-], got: ${raw}`, { raw });
  }
  return value;
}

/*
 * `input` is the JSON that scripts/prepare.mjs wrote to
 * src/generated/buildConfig.json. Unknown keys are ignored; a bad mode or a
 * malformed URL throws, because a build that guesses its own transport is a
 * build nobody can describe in an evidence file. A MISSING live URL does not
 * throw: it resolves with `problem` set, so the app can show what to fix.
 */
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

  // Fixture mode drops the backend address completely: a fixture build has no
  // use for one, and an address that is not there cannot leak into a log,
  // a sidecar or a screenshot.
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

/*
 * Evidence redaction (N-4): the repository is public, and screenshots, logs
 * and build sidecars get committed as evidence. Anything the app SHOWS or
 * LOGS names the backend as scheme + "<configured>", never its host or port;
 * build-release.ps1 records only a SHA-256 of the URL.
 */
export function maskBaseUrl(url) {
  if (typeof url !== 'string' || url === '') return '<not configured>';
  const m = /^(https?):\/\//i.exec(url);
  return m ? `${m[1].toLowerCase()}://<configured>` : '<configured>';
}

// One line for a banner or a log record. Never contains patient data or the
// backend address.
export function describeConfig(config) {
  if (config.mode === MODE.LIVE) {
    return config.apiBaseUrl
      ? `LIVE · backend ${maskBaseUrl(config.apiBaseUrl)} · study ${config.studyId}`
      : `LIVE · no backend URL configured · study ${config.studyId}`;
  }
  return `FIXTURE · generated contract fixtures · study ${config.studyId}`;
}

/*
 * KEY=VALUE lines of a .env file -> object. Comments (#) and blank lines are
 * skipped; surrounding quotes are removed. Used by prepare.mjs for
 * mobile/.env.local, so the URL never has to be typed on a command line that
 * ends up in a shell history or a build log.
 */
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
