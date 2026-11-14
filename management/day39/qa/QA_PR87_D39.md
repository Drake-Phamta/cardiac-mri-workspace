# QA review of PR #87 (Day 39 override)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.** It replaces the human second review only under the leader's one-day recovery override, together with green CI.

- PR: #87 `ci(mobile): render smoke + bundle job, IPv4 scan, no URL hash, live-only cleartext`
- Head reviewed: `9bf8038a9f12087f0f114609d85d77638d2e1f3c` (base `main`, which already contains #86)
- Diff reviewed: `git diff origin/main...9bf8038` (10 files, +367/-70). `docs/specs/v1.0/**` is not touched.

## VERDICT: MERGE

Blocking findings: 0.

Environment note: the prepared checkout for this PR had every tracked file deleted from its working tree, and its `mobile/node_modules` junction was missing. I did not modify it. I exported the exact SHA with `git archive` into a scratch directory and installed only react, react-test-renderer, fast-png and the two Babel packages the render smoke needs. The full Expo tree was not installed, so the `expo export` step was not run locally. CI ran it and passed.

## Checks run

| Check | Result |
|---|---|
| `gh pr checks 87` | all 11 jobs pass, including the new `mobile render smoke + bundle (npm ci)` (1m16s) |
| `npm test` in mobile/ (Node 24.14) | `tests 187 / pass 187 / fail 0 / skipped 0`. Matches the PR body (187/187) |
| `npm run test:render` (Node 24.14) | `RENDER SMOKE PASS - 92 checks`. Matches the body |
| `npm run test:render` (Node 24.21, the hooks change targets this version) | `RENDER SMOKE PASS - 92 checks` |
| `node app/verticals/v1_case_explorer/test_case_explorer.mjs` | `PASS V1 case explorer - 91/91` |
| `node app/core/tests/run_all.mjs` | `ALL PASS - 10/10` |
| `test/cleartextPlugin.test.mjs` on Node 24.21, with no node_modules present in CI's other jobs | K1-K5 pass (5/5). The plugin loads without `expo` because the `require` is lazy |
| Workflow YAML parses (PyYAML) | 11 jobs, the same count as the header comment ("Eleven") |
| Extracted the `no-forbidden-bytes` step and ran `bash -n` | syntax OK. The heredoc `<<'PY'` terminator sits at column 0 after YAML block-scalar de-indent, and `if ! python3 - ... <<'PY' ... PY` followed by `then` on its own line is valid bash |
| Ran the extracted step under `bash -e -o pipefail` in a scratch git repo with 20 test lines | see the scanner table below |
| Ran the same scanner on `origin/main...9bf8038`, `9bf8038...404a805` (#88) and `origin/main...b1529dc` (#90) | 0 private addresses in each. 427, 616 and 255 added lines scanned |
| `build-release.ps1` parsed with `powershell.exe` 5.1 (`Parser::ParseFile`) | 0 parse errors |
| `grep -c hasInstallScript mobile/package-lock.json` | 0, as the workflow comment says |
| Lockfile has nested `react-is` 19.3.0 under `react-test-renderer` and top-level 18.3.1 | confirmed, README note is accurate |
| Added lines grepped for local absolute paths, drive letters, adb serials | none |
| `docs/specs/v1.0/**` in the diff | none |

### IPv4 scanner behaviour (scratch repo, added-lines-only)

| Input (all on added lines) | Result |
|---|---|
| a private address already on the base commit and left untouched | not flagged (correct, DR-019 rule 3) |
| <private-ip>, 127.0.0.1, 0.0.0.0, the three RFC 5737 ranges, 8.8.8.8 | not flagged |
| 172.15.x, 172.32.x, 100.63.x, 100.128.x, 192.169.x | not flagged (range edges correct) |
| `v10.1.2.3`, `1.2.3.4.5`, `10.0.26200.0` | not flagged |
| plain, inside brackets, with `:port`, with a trailing `.` or `,`, in a URL, `/24` suffix | flagged. 11 hits on the 8 lines that should hit |
| <private-ip> and <private-ip>; <private-ip> and <private-ip> | both ends of each block flagged |
| the log line | prints `path:line` and the block name only, never the address |
| `host_192.168.1.1` (underscore or letter prefix) | **not flagged** (false negative, see N-1) |
| `192.168.1.1abc` | not flagged (false negative, harmless) |
| `<private-ip>` (leading zero) | not flagged (false negative, see N-1) |

Added-lines-only logic is correct: it reads `git diff -U0 base head`, tracks the new-file line number from each `@@` header, ignores `+++` headers (only while `in_header`), ignores `-` and `\` lines, and fails closed with `::error::` if `git diff` itself fails. Annotation properties are percent-encoded.

## Review of the new CI job

`mobile-render-bundle` is correct and safe.
- `permissions: contents: read`, no secrets, first-party actions only.
- `npm ci --ignore-scripts` from the lockfile is the narrowest possible npm exposure.
- The export goes to `$RUNNER_TEMP`, never the checkout. It fails if zero files are written.
- It runs `prepare.mjs --mode fixture --strict`, so a regression of the cleartext decision (fixture means no cleartext) is exercised by the same file the plugin reads.
- The header comment honestly records this as the one npm exception (DR-021 rule 4).

## BLOCKING findings

None.

## NON-BLOCKING findings

1. **N-1, scanner false negatives** (`.github/workflows/guardrails.yml`, the `QUAD` regex and the leading-zero branch). An address glued to a letter or underscore (`host_192.168.1.1`) is skipped by the `(?<![\w.])` lookbehind, and a zero-padded address is skipped. Both are unlikely in prose or code. Smallest fix if wanted: use `(?<![0-9.])` for the lookbehind and drop the leading-zero exemption, accepting a few more version-string hits.
2. **N-2, two-dot diff against a stale base.** The scan diffs `base.sha` against `head.sha`. If a PR branch is behind `main` and `main` has since removed a line that carries an address, that line shows up as "added" for the PR and is flagged. This is the same pattern the existing byte scan uses, and a rebase clears it. A line the PR merely edits on a file that already holds an address is also flagged (the edited line counts as added), which is acceptable under DR-019 rule 2.
3. **N-3, no `timeout-minutes` on the new job.** A hung render smoke (see PR #88 finding N-2, where mutated code hangs instead of failing) would run to the 6-hour default. Suggested fix: `timeout-minutes: 15`.
4. **N-4, branch protection.** The new check name `mobile render smoke + bundle (npm ci)` is not a required check until the leader adds it, so a red result would not block a merge by itself.
5. **N-5, cleartext decision is keyed on `mode === 'live'` only.** A live build with an `https://` base URL still gets `usesCleartextTraffic="true"`. This is by design for LOCAL_DEMO and is documented in the plugin header and README. It is worth remembering for REMOTE_DEMO.
6. **N-6, README wording.** `mobile/README.md` says each vertical owns `mobile/test/v<N>_*.test.mjs`, but the existing V1 file is `mobile/test/v1.test.mjs`, which does not match that pattern. Cosmetic.
7. **N-7, `npm ci` has no cache.** About 1 minute per run. Acceptable.

## PR body versus code

| Claim | Verdict |
|---|---|
| New job steps and `--ignore-scripts` | true |
| IPv4 scan: added lines only, 10/8, 172.16/12, 192.168/16, 100.64/10 flagged; <private-ip>, loopback and documentation ranges allowed; the address is not echoed | true (tested above) |
| `build-release.ps1` writes `api_base_url configured (not recorded)`; README and `S1_L4_SCRIPT.md` updated; L4 history kept accurate | true |
| `config.test.mjs` uses <private-ip> | true |
| Plugin reads `mode` from `src/generated/buildConfig.json`, live means cleartext on, anything else or no file means attribute removed; K1-K5 need no node_modules | true |
| README owner text, `react-is` 19.3.0 note, G1 and G1b default-export test | true |
| mobile 187/187, render 92, V1 91/91 | true (reproduced) |
