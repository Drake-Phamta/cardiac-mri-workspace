#!/usr/bin/env node
/*
 * Writes the two generated inputs the app bundles, into src/generated/
 * (gitignored):
 *
 *   api_bundle.json    the fixture bundle, produced by the project's own
 *                      generator - contracts/api/generate_fixture.py - and
 *                      checked by app/core's createBundle before it is kept.
 *                      Never hand-written: contract.json says
 *                      fixture_rules.handwritten_fixtures_allowed = false.
 *   buildConfig.json   mode (fixture | live), backend base URL, study id,
 *                      and provenance (time, git sha, contract version).
 *
 * Usage (from mobile/):
 *   node scripts/prepare.mjs                       # fixture mode - needs nothing configured
 *   node scripts/prepare.mjs --mode live           # live - URL from EXPO_PUBLIC_API_BASE_URL
 *   node scripts/prepare.mjs --mode live --study-id STUDY_DEMO --strict
 *
 * The live backend URL is never in git (public repository). It comes, in
 * this order, from --api-base-url, the environment variable
 * EXPO_PUBLIC_API_BASE_URL, or the untracked file mobile/.env.local:
 *     EXPO_PUBLIC_API_BASE_URL=http://<backend-host>:8000
 * Other environment: CMW_MODE, CMW_STUDY_ID, PYTHON, CMW_GIT_SHA.
 *
 * Live mode with no URL writes the config anyway and warns: the app then
 * opens on a configuration-error screen. --strict (build-release.ps1) makes
 * it a hard error instead, so no APK is built that cannot reach anything.
 *
 * The generator is called as a FUNCTION (generate_fixture(contract)), the
 * same way the app-core CI job calls it, so this works whether or not the
 * generator has grown its --contract/--output CLI.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBundle, createContract } from '../../app/core/index.mjs';
import { API_BASE_URL_ENV, describeConfig, parseEnvFile, resolveConfig } from '../src/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, '..');
const repoRoot = resolve(mobileRoot, '..');
const outDir = join(mobileRoot, 'src', 'generated');
const contractPath = join(repoRoot, 'contracts', 'api', 'contract.json');
const envLocalPath = join(mobileRoot, '.env.local');

// Flags beat the environment, the environment beats mobile/.env.local.
export function parseArgs(argv, env = {}, envFile = {}) {
  const out = {
    mode: env.CMW_MODE || envFile.CMW_MODE || 'fixture',
    apiBaseUrl: env[API_BASE_URL_ENV] || envFile[API_BASE_URL_ENV] || undefined,
    studyId: env.CMW_STUDY_ID || envFile.CMW_STUDY_ID || undefined,
    quiet: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--mode') out.mode = value();
    else if (a === '--api-base-url') out.apiBaseUrl = value();
    else if (a === '--study-id') out.studyId = value();
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--strict') out.strict = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function readEnvLocal() {
  return existsSync(envLocalPath) ? parseEnvFile(readFileSync(envLocalPath, 'utf8')) : {};
}

const PY_GENERATE = [
  'import json, sys',
  'sys.path.insert(0, sys.argv[1])',
  'from generate_fixture import generate_fixture',
  'with open(sys.argv[2], encoding="utf-8") as fh:',
  '    contract = json.load(fh)',
  'json.dump(generate_fixture(contract), sys.stdout, indent=2)',
].join('\n');

export function runGenerator({ python, contractFile = contractPath } = {}) {
  const candidates = python ? [python] : ['python', 'python3', 'py'];
  const failures = [];
  for (const exe of candidates) {
    const r = spawnSync(exe, ['-c', PY_GENERATE, join(repoRoot, 'contracts', 'api'), contractFile], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    });
    if (r.error) { failures.push(`${exe}: ${r.error.code || r.error.message}`); continue; }
    if (r.status !== 0) {
      throw new Error(`contracts/api/generate_fixture.py failed under ${exe}:\n${r.stderr}`);
    }
    return { json: JSON.parse(r.stdout), python: exe };
  }
  throw new Error(`no python interpreter found to run the fixture generator (${failures.join('; ')}). `
    + 'Install Python 3 or set PYTHON=<path>.');
}

// build-release.ps1 builds a staging copy that is not a git checkout, and
// passes the commit it archived in CMW_GIT_SHA.
function gitSha(env) {
  if (env.CMW_GIT_SHA) return String(env.CMW_GIT_SHA).slice(0, 12);
  const r = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env, readEnvLocal());
  const contractJson = JSON.parse(readFileSync(contractPath, 'utf8'));
  const contract = createContract(contractJson); // refuses a drifted contract before anything is written

  const { json: bundleJson, python } = runGenerator({ python: env.PYTHON });
  const bundle = createBundle(contract, bundleJson); // FORMAT.md rules 1-6, all problems at once

  const config = resolveConfig({
    mode: args.mode,
    apiBaseUrl: args.apiBaseUrl,
    studyId: args.studyId,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(env),
    contractVersion: contract.contractVersion,
    fixtureGeneratedBy: bundle.generatedBy || 'contracts/api/generate_fixture.py',
  });

  if (config.problem && args.strict) {
    throw new Error(`${config.problem.code}: ${config.problem.message}`);
  }

  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, 'api_bundle.json'), bundleJson);
  writeJson(join(outDir, 'buildConfig.json'), {
    mode: config.mode,
    apiBaseUrl: config.apiBaseUrl,
    studyId: config.studyId,
    timeoutMs: config.timeoutMs,
    generatedAt: config.build.generatedAt,
    gitSha: config.build.gitSha,
    contractVersion: config.build.contractVersion,
    fixtureGeneratedBy: config.build.fixtureGeneratedBy,
  });

  if (!args.quiet) {
    const n = Object.keys(bundle.scenarios).length;
    console.log(`prepare: ${describeConfig(config)}`);
    console.log(`prepare: fixture bundle from contracts/api/generate_fixture.py via ${python} - `
      + `${n} endpoint(s) with scenarios${n === 0 ? ' (every fixture call will be FIXTURE_SCENARIO_MISSING)' : ''}`);
    console.log(`prepare: wrote ${join('src', 'generated', 'api_bundle.json')} and ${join('src', 'generated', 'buildConfig.json')}`);
  }
  if (config.problem) {
    console.warn(`prepare: WARNING ${config.problem.code} - ${config.problem.message}`);
    console.warn('prepare: the app will open on a configuration-error screen until this is set.');
  }
  return config;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(`prepare: FAILED - ${err.message}`);
    if (err.detail && Array.isArray(err.detail.problems)) for (const p of err.detail.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}
