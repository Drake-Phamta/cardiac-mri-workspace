# QA of branch `fix/qa-backlog-d51` (QA backlog fixes of Day 39 reports)

> Archived by the leader's session on 2026-10-30. Local machine paths are replaced by `<scratch>`, and a profile-like 8.3 name is described instead of spelled. Nothing else is changed.

**LLM QA (Claude Sonnet agent), not a human review.**

| | |
|---|---|
| Date | 2026-10-30 |
| Head reviewed | `6a08de3736b0fa6ef87da8176406c9787eb5a784` (`origin/fix/qa-backlog-d51` is the same commit) |
| Base | `main` = `cd76112545be92566488d70a643d3549091d6672`, which is also the merge base. Reproduced: 19 commits, 43 files, +1625 / -157 |
| `main` moved during the review | `main` is now `d325136` (PR #105 and #108). Those two PRs change only `.github/workflows/guardrails.yml` (the Python 3.9 job pinned to `ubuntu-24.04`) and one `management/` document. No file overlap with the branch, so it merges without conflict. The review below is against `cd76112`, as asked |
| PR / CI | No PR and no workflow run existed for this head when I looked (`gh pr list`, `gh run list`, read-only). The guardrails jobs were therefore reproduced locally (section "Checks run") |
| Method | Clean detached worktree of `6a08de3` (`<scratch>\qab_review`), `mobile\node_modules` = directory junction to `<tooling>\mobile_deps\node_modules`. Mutations ran in a separate scratch copy made with `git archive` (never in the worktree). The worktree is clean after all runs (`git status` empty), the main clone and the author's worktree were not touched |

## VERDICT: MERGE

No blocking finding. Every claim of the author's table was checked against the diff, the tests and a mutation; all of them hold. 64 mutation runs: 63 killed by a named test, 1 survivor that is a coverage gap (N-1). The stricter holdout loader accepts the real Day 39 record and all four real packages (metadata check). Twelve non-blocking items follow; the two worth a follow-up are N-1 (the only regression guard of QA_PR99 NB-5 never runs in CI) and N-2 (a new unguarded `Add-Type` makes the phone-session script depend on the C# compiler).

---

## 1. Checks run

All counts are from my own runs in the clean worktree (Windows 11, Python 3.12.6, Node 24.14.0, Windows PowerShell 5.1.26100, Pester 3.4.0). "Before" = `main` `cd76112`, extracted with `git archive` into a second scratch folder and run the same way.

| # | Command (cwd) | Result at `6a08de3` | Before (`cd76112`) | Author's claim |
|---|---|---|---|---|
| 1 | `npm test` (mobile) | **255 tests, 255 pass, 0 fail, 0 skipped** (4.9 s) | 246 / 246 | 246 -> 255 holds |
| 2 | `npm run test:render` (mobile) | **RENDER SMOKE PASS - 217 checks**, 0 FAIL lines (71 s, while an ml pytest ran in parallel) | 205 | 205 -> 217 holds |
| 3 | `node app/core/tests/run_all.mjs` | ALL PASS 10/10 | (10/10) | holds |
| 4 | `node app/verticals/v1_case_explorer/test_case_explorer.mjs` | PASS 91/91 | | holds |
| 5 | `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` | PASS 160/160 | | 160 holds |
| 6 | `node app/verticals/v4_review_and_findings/test_review_correction.mjs` | PASS 51/51 | 50/50 | 50 -> 51 holds |
|   | `test_brush.mjs`, `test_findings.mjs` | PASS 22/22, PASS 28/28 | | |
| 7 | `python -m pytest backend/tests backend/mesh/tests -q -p no:cacheprovider` | **275 passed** (134 in `backend/tests` + 141 in `backend/mesh/tests`), 70 s | `backend/tests`: 111 collected | 111 -> 134 holds. Per file, as the commit messages say: `test_holdout.py` 42 -> 51, `test_deploy_paths.py` 1 -> 13, `test_api.py` 51 -> 53 |
| 8 | `python -m pytest backend/tests/test_deploy_paths.py -q` (the script runs in Windows PowerShell 5.1 with the system tar) | 13 passed (the 12 Windows-only tests really ran, 8 s) | 1 | holds |
| 9 | `python test_api_contract.py` (contracts/api) | `api_contract_checks=PASS cases=34`, plus the new line "PASS an experiment_cases page is checked against the experiment that was asked for" | cases=34 | holds |
| 10 | `python test_contract1.py`, `python test_contract2.py` | Contract 1 passed; Contract 2 `schema_errors=0`, `contract2_checks=PASS cases=10 dr018_checks=PASS` | cases=9 | 9 -> 10 holds |
| 11 | `CUDA_VISIBLE_DEVICES=-1 HF_HUB_OFFLINE=1 PYTHONIOENCODING=utf-8 python -m pytest ml/tests -q -p no:cacheprovider` | **322 passed** (141 s) | 305 collected | 305 -> 322 holds (+12 `test_results_page.py`, +5 `test_unet_kit.py`) |
| 12 | `powershell -NoProfile -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1 -SelfTest` | **34 checks, 0 failed** (7.6 s) | 32 | 32 -> 34 holds |
| 13 | `Invoke-Pester mobile\test\ps` (Pester 3.4.0) | **Passed 42, Failed 0, Skipped 0** (124 s). The e2e tour test is gated by `CMW_E2E_TOUR` and returns at once; I ran an equivalent interactive tour by hand (section 3) | 42/42 stated | holds |
| 14 | `python tools/report/selftest_unet_flow.py` | PASS (all checks, 58/58 deck facts, new section 3 passes) | | holds |

CI jobs reproduced without GitHub (no PR / run existed):

| CI job | What I ran | Result |
|---|---|---|
| frozen spec checksums | `sha256sum -c SPEC_MANIFEST_SHA256.txt` in `docs/specs/v1.0` | 19/19 OK |
| no PR touches `docs/specs/v1.0` | `git diff --name-only cd76112 6a08de3 -- docs/specs/v1.0` | 0 files |
| no forbidden bytes | the guard's own IPv4 regex and classifier over `git diff -U0` plus the file-name and 10 MB rules | **0 private IPv4**, no dataset / weights / secret extension, no file over 10 MB |
| app/core framework-neutral | the job's six greps, run in Git Bash | fail=0 |
| mobile boundaries | the job's two greps | fail=0 |
| mobile shell logic tests | `node --test mobile/test/*.test.mjs` in a copy **with no node_modules**, as the job does | 255 tests, 239 pass, 0 fail, 16 skipped (needs fast-png; includes RS19 to RS22, see N-1) |
| prepare | `node mobile/scripts/prepare.mjs --mode fixture --strict`, live `--strict` with a `.invalid` URL, fixture | all succeed, generated files are git-ignored |
| fixture bundle | the job's inline generator | 28 endpoints |
| package files | `git diff` of `mobile/package.json` and `package-lock.json` against `main` | **empty**. The tooling `package.json` and `package-lock.json` are byte-identical to the branch's and to `main`'s blobs (sha256 compared), so the junction tree matches the lockfile. Nothing was installed |

Also run: `git diff --check cd76112 6a08de3` clean (exit 0); CI-style Python 3.9 compatibility scan (see "What I did not do").

Timing note for the watchdog (check 4 of the brief): the whole render smoke takes about 70 s here, even with another heavy process running; the committed watchdog allows 8 minutes. The CI job that ran it (QA of #87 / #88) took 1m16s to 1m28s including `npm ci` and `expo export`. The margin is at least six times, and `RENDER_SMOKE_TIMEOUT_MS` overrides it.

## 2. Table of claimed fixes

Verdict key: V = verified (finding really closed), P = partly, N = not verified.

| Finding | Commit | Verdict | Evidence |
|---|---|---|---|
| **QA_PR99 NB-2** Refresh over a newer latest version untested | 2d440ff | V | RS21, RS22 (node) and render V4p exist and pass. Killed by mutation: Refresh never rebuilds (M-V4-8: RS21 + RS22), rebuilds over unsaved edits (M-V4-7: RS22; render M-R-5: V4p), rebuilds although the version did not change (X-V4-5: RS21), inverted base comparison (X-V4-6: RS21 + RS22). Product code unchanged in this commit (diff read) |
| **NB-3** live slice of another mask | e621213 | V | `reviewController.mjs:365` refuses before `fetchMask` (`SOURCE_MASK_MISMATCH`); screen text added. RS20 and render V4o. Killed: check removed (M-V4-1 -> RS20; M-R-4 -> V4o), RAW-only check (X-V4-1 -> RS20), changed text (X-R-1 -> V4o). Live-only by `!fixture`. Wording nit N-4 |
| **NB-4** open reads without the abort signal / README | e49e043 | V | `index.mjs` `open()` spreads `{signal}` into `case_get` and `reviewed_masks_list`, not `review_create`; `refresh(options)` forwards it (`index.mjs:279-285`); controller hands the signal to both. RS23 (also runs in the no-node_modules CI job). Killed: no signal in open (M-V4-3), in refresh (M-V4-4), in the model's case_get (M-V4-5), list without it (X-V4-3), review_create aborted too (X-V4-4): all by RS23 |
| **NB-5** route case vs run case | e621213 | V | `reviewController.mjs:225`; RS19. Killed: check removed (M-V4-2), refusing a route with no caseId (X-V4-2). **But** RS19 is skipped in CI and the render smoke does not notice (M-R-6 survives): N-1. Legit flows cannot be refused: SCR-03 pushes the case's own run; the backend rejects a finding whose run belongs to another case (`backend/app/main.py:857-858`) |
| **NB-6** README of the render smoke | 846470c, be9283c | V | `mobile/README.md` now says shell + V1..V4, the section table matches `smoke.mjs` (sections 1-4, 2b, 3b, 6-9, 5, 10, 11 checked against the file), counts 159 / 205 / 212 / 217 equal my runs. The V2 pointer fixed to section 11 |
| **NB-7** `latestVersion` tie-break | 2d440ff | V | V4-17 (8 cases). Killed: `>=` to `>` (M-V4-6), lowest wins (X-V4-7), no revision fallback (X-V4-8) |
| **QA_PR94 NB-3** record path outside the repo | 8110e75 | V | `ingest.py:118`: `..`, drive or leading separator refused before anything is opened; absolute path still accepted, file name only recorded. 3 parametrized tests with a VALID record one level above the repo. Killed: M-H-4. I also fuzzed odd paths (`''`, `.`, `\abs`, `C:rel`): all give `HOLDOUT_AUTHORIZATION_INVALID`, the normal relative path is accepted. Lexical only (N-10) |
| **NB-4** stale statements | f43afe6 | V | `contracts/.../README.md` now matches `ml/export_contract2.py` (DR-018 rule 1, lines 32-36 and 237-271); `backend/README.md` known-gaps now true: four holdout packages exist (`<runs>` holds EXP-D-025, -050, -100, -PP and no EXP-U-*). Heading nit N-8 |
| **NB-5** `successful_n` pinned | f43afe6 | V | `test_successful_n_counts_the_withheld_case_only_when_it_was_evaluated`; killed by altering the count (M-C-4); comment at `metrics.py:133-136` and README line |
| **NB-6** outlier block vs asked experiment | 6a213b6 | V | `validate_response(..., request=None)` plus `request_params`; compares only when a request is given. `request_params` checked on **all 28 endpoint paths** of the contract (0 mismatches). Callers: `backend/tests/api_support.py` (every call) and the generated-scenario loop. Killed: validator ignores it (M-C-1 contract test, M-C-2 backend test), `Api.call` not passing the request (M-C-3), `request_params` returning `{}` (X-T-9). Nothing outside tests calls the validator, so no existing scenario can break: 34 contract cases and all 275 backend tests pass |
| **NB-7** reflow | 6a213b6 | V | the one `if` is the same condition in parentheses; tests pass |
| **QA_PR98 N-7** duplicates, untrimmed names, served runs vs `authorized_runs` | 8110e75 | V (with the documented limit) | `authorized_runs_problems` is a line-for-line port of `ml/holdout.py` `validate_record` (`_is_name`, `seen`); used by ingest and `CaseStore`. 8,440 junk inputs: never raises. Listed experiment with another checkpoint: rejected whole (`HOLDOUT_CHECKPOINT_NOT_AUTHORIZED`, visible in `/health`, experiment answers `ARTIFACT_NOT_FOUND`). Killed: duplicates (M-H-2), untrimmed (M-H-3), checkpoint never compared (M-H-1), unlisted rejected too (X-T-8). Unlisted experiments are still served and README says why: N-9 (open decision) |
| **#100 NB-1** record on `origin/main` | 029936a | V | `record_origin` (`holdout_pipeline.py:183`) wired into `build_plan` (:253). On the REAL committed Day 39 record in this worktree: `record_problem` None, `record_origin` `(None, None)`; a missing ref gives a note only. 5 new tests use throwaway repos and `git update-ref`. Killed: missing blob accepted (M-T-1), build_plan never asks (M-T-2), differing blob accepted (X-T-1), no ref refuses (X-T-2), no ref silent (X-T-3) |
| **#100 NB-4** `ROOT =Path` | 029936a | V | one-character diff |
| **#100 NB-5** stale ml/README steps | 8ea50ec | V | `ml/README.md` Redeploy steps 2 and 4 now describe `-ShipPackages` and the UNet labels; no other stale "data_cache only" text is left outside the dated management records (grep) |
| **#101 NB-1** null data root | 8ea50ec | V | `deploy_macmini.ps1:74-76` throws before ssh. Killed: M-D-3. Dynamic: the 12 new tests against the OLD script give **5 failed, 8 passed**, exactly the five the commit message names |
| **#101 NB-2** listing exit code, `.nii` | 8ea50ec | V | `Assert-NoRawImages` (:86-94). Killed: exit code unchecked (M-D-1), pattern without nii (M-D-2), NRRD refused in packages (X-D-1), data-cache pattern without nrrd (X-D-2) |
| **#101 NB-4** stale deploy text | 8ea50ec | V | backend/README (two places), ml/README, tools/e2e/README |
| **#101 NB-5** label overlap | 06896e2 | V | `build_results.py` `trend()`; 12 tests; the committed page is rebuilt byte-for-byte by the test (and no UNet run means `ly = sy + 20` exactly as before). Killed: old layout (M-T-3), lower mean above (X-T-4), tie to DINOv2 (X-T-5), tie both below (X-T-6), offset too small (X-T-7) |
| **#102 NB-1** leak scan before write | e1d576d | V | staging in `tempfile.TemporaryDirectory`, scan, then publish. Selftest section 3: leaking build exits 2, previous good build (16 files) untouched, no `--out` created, clean build publishes. Staging folders are removed (0 left in `%TEMP%`). Killed: scan disabled (M-T-4: 3 FAIL lines). Dead variable N-6 |
| **#103 follow-up** fixture outside ZeroTier's pool | 6a08de3 | V | `DeviceSession.SelfTest.ps1:354-359`: second and third octet 250, assertion matches; no spelling of the old fixture address remains in tracked files outside the QA archive; self-test 34/34 |
| **#103 NB-1** SCR-06 question defaults to No | 67f0dfa | V | all four `[y/N]` questions of `device_session.ps1` (lines 562, 594, 1009, 1235) are judged by `^[yY]`; new self-test check scans for it. Killed: M-S-1, X-S-2. **Dynamic**: interactive tour against the fake phone with Enter at every prompt: HEAD opens no SCR-06 and records no backend write (13 screenshots); the old `-match '^[nN]'` judge opens SCR-06 and records a backend write (14 screenshots) |
| **#103 NB-2** 8.3 short names | 67f0dfa | V | `Test-OutsideGit` moved to `device_ui.ps1:222` with `Get-LongPath` (GetLongPathName). Killed: no expansion (M-S-2), case-sensitive match (M-S-3), no trailing separator (X-S-1). **Dynamic**: `-DryRun -Out <8.3 spelling of the worktree>\new\out` now says "outside git: NO - the real run refuses this folder" (long spelling the same; a scratch folder says "yes"); nothing was created. New `Add-Type` dependency: N-2 |
| **QA_PR88 N-1** returnParams SCR-05 / SCR-06 | be9283c | V | render R4, R5 (SCR-03 -> SCR-06 -> Back, slice moved first) pass. Killed: SCR-06 push without returnParams (M-R-1: R5), SCR-05 push without it (M-R-2: V2R14, the pre-existing check) |
| **N-2** render hang | be9283c | V | `watchdog.mjs` + `renderWatchdog.test.mjs` (W1-W4; they run in the no-node_modules job). Killed: not unref'd (M-W-1: W1, W4), env accepts anything (M-W-2: W2), never fires (M-W-3: W1, W3), last check not reported (X-W-1), stop() not clearing (X-W-2). **Dynamic**: `RENDER_SMOKE_TIMEOUT_MS=4000 npm run test:render` prints `FAIL WATCHDOG ... the last check that ran was L8` and `RENDER SMOKE FAIL - did not finish (34 checks ran)`, exit 1 after 4.2 s |
| **N-3** guard that never settles | be9283c | V | render V4q (dismiss without a button is "stay", the next Back asks again); `navigator.mjs` comment and README text. Killed: prompt without `onDismiss` (M-R-3: V4q) |
| **N-4** `CMW_NET_TOTALS` not judged | be9283c | V | documented in `mobile/README.md` |
| **QA_PR87 N-6** README wording | be9283c | V | `v<N>.test.mjs / v<N>_*.test.mjs` |
| **QA_PR90 N-1, N-3** | 59d37fb | V | `case 'DUPLICATE_CASE_ID'` copy and the repeated-selection assertions in V3S10. Killed: copy removed (M-T-5), REASON entry removed (X-T-11), REASON entry changed (X-T-12) |
| **N-2** UTF-8 test | 1c09812 | V | `cli_writes_utf8` with `PYTHONIOENCODING=cp1252`, asserts the probe letter is unencodable first. Killed: CLI no longer forces UTF-8 (M-C-5: UnicodeEncodeError, exit 1), cp1252 with replacement (X-T-10) |
| **N-4** RESULT_C1 heading | f75f19a | V | pure move, see section 5 |
| Housekeeping | 985915a, b7d4eba | V | `%SystemRoot%` fallback removed (tests skip when `SystemRoot` is unset); V4 README range now `V4a..V4q`; `authorized_runs_valid` has no caller left (only the QA archive text mentions it); COM guard in the self-test |

Per-commit statements I could check also hold: the test counts in the commit messages (42 -> 51, 1 -> 13, 5 new, 212 -> 217), the "5 of 12 fail against the old deploy script", and the mutation lists. Of the mutations the commit messages name I re-ran every one except two: e1d576d's faithful reproduction of the old write order (I ran "scan disabled" instead, which e1d576d also lists) and be9283c's "shell never releases the latch" (an existing render check, B3). See section 3.

## 3. Mutation and dynamic results

Method: one fix broken at a time in `<scratch>\qab_mut` (a `git archive` of `6a08de3` with the junction and a generated fixture bundle), the named test run, the file restored from the git blob and compared byte for byte (**all 64 restorations identical**). After the last run I compared the whole copy with the head blobs: content identical everywhere; 17 non-source files (`.css`, `.svg`, `.cmd`, `.csv`, `.jsonl`, `.gitignore`, `.gitattributes`, which the repo's `eol=lf` rules do not cover) differ only by CRLF because `git archive` wrote them through this PC's `core.autocrlf`, and none of them was mutated. 64 runs, **63 killed, 1 survivor** (M-R-6, intended as a probe).

| ID | Area | Fix broken | Killed by |
|---|---|---|---|
| M-V4-1 | V4 | `SOURCE_MASK_MISMATCH` check removed | RS20 (render M-R-4: V4o) |
| M-V4-2 | V4 | route case vs run case removed | RS19 |
| M-V4-3 / 4 / 5 | V4 | signal not passed to `open()` / `refresh()` / model `case_get` | RS23 |
| M-V4-6 | V4 | `latestVersion` `>=` to `>` | V4-17 (4 of 8 rows wrong) |
| M-V4-7 / 8 | V4 | Refresh rebuilds over unsaved edits / never rebuilds | RS22 / RS21 + RS22 |
| M-H-1 | holdout | checkpoint never compared | `test_a_package_exported_from_another_checkpoint...`, `test_the_rejected_package_is_visible_in_health...` |
| M-H-2 | holdout | duplicate experiment accepted | `..._refuses_to_start[<lambda>4]`, two "listed twice" rows |
| M-H-3 | holdout | untrimmed name accepted | `..._does_not_authorize[override13-experiment_id...]` |
| M-H-4 | holdout | record path may climb out | `test_a_relative_record_path_may_not_leave_the_repository` x3 |
| M-C-1 | validator | ignores the asked experiment | `test_api_contract.py:251` (new block) |
| M-C-2 / 3 | validator | same, backend side / `Api.call` not passing the request | `test_a_page_that_names_another_experiments_outliers_fails_the_contract_check` |
| M-C-4 | validator | `successful_n` altered | `test_successful_n_counts_the_withheld_case_only_when_it_was_evaluated` |
| M-C-5 | contract 2 | CLI no longer UTF-8 | `test_contract2.py` `cli_writes_utf8` |
| M-D-1 | deploy | listing exit code unchecked | both "cannot be listed" tests |
| M-D-2 | deploy | packages pattern without `.nii` | `..._refused[scan.nii.gz]`, `[scan.nii]` |
| M-D-3 | deploy | up-front data-root check removed | `test_ship_packages_without_a_data_root_says_so...` |
| M-S-1 | device | SCR-06 question judged by `^[nN]` | self-test "operator questions: every [y/N] question is judged by y..." |
| M-S-2 / 3 | device | no 8.3 expansion / case-sensitive match | self-test "outside-git: ..." |
| M-W-1 / 2 / 3 | watchdog | not unref'd / any env value / never fires | W1+W4 / W2 / W1+W3 |
| M-T-1 / 2 | pipeline | missing blob accepted / build_plan never asks | `test_the_record_must_be_on_origin_main...`, `test_the_plan_refuses...` |
| M-T-3 | results page | old always-below label layout | 8 tests in `test_results_page.py` |
| M-T-4 | report | leak scan disabled | selftest section 3 (3 FAIL lines) |
| M-T-5 | V3 | no copy for `DUPLICATE_CASE_ID` | V3S10 |
| M-R-1 | render | SCR-06 push without returnParams | R5 |
| M-R-2 | render | SCR-05 push without returnParams | V2R14 |
| M-R-3 | render | leave prompt without `onDismiss` | V4q |
| M-R-4 / M-R-5 | render | source-mask check removed / Refresh over unsaved edits | V4o / V4p (2 checks) |
| **M-R-6** | render | **route case check removed** | **SURVIVED: 217 checks PASS** (N-1) |
| X-V4-1..8 | V4 | RAW-only source check, route with no caseId refused, list read without signal, review_create aborted, rebuild although unchanged, inverted base compare, lowest wins, no revision fallback | RS20, RS19, RS23, RS23, RS21, RS21+RS22, V4-15 + V4-17, V4-17 |
| X-R-1 | render | changed screen text | V4o |
| X-D-1 / 2 | deploy | NRRD refused in packages / data-cache pattern without nrrd | `test_packages_with_nrrd_masks_are_shipped` / `test_a_data_cache_holding_a_raw_image_file_is_still_refused` |
| X-T-1..3 | pipeline | differing blob accepted / no ref refuses / no ref silent | `test_a_record_that_differs...`, `test_without_an_origin_main_ref...` and the plan test |
| X-T-4..7 | results page | lower mean above / tie to DINOv2 / tie both below / offset too small | the higher-mean, tie and close-means tests |
| X-T-8 | holdout | unlisted experiments rejected too | `test_a_package_exported_from_another_checkpoint...` and the health test |
| X-T-9 / 10 | contracts | `request_params` returns `{}` / CLI cp1252 with replacement | `test_api_contract.py:253` / `cli_writes_utf8` |
| X-T-11 / 12 | V3 | REASON entry removed / changed | V3S10 |
| X-S-1 / 2 | device | no trailing separator / uninstall question judged by n | "outside-git" / "operator questions" |
| X-W-1 / 2 | watchdog | last check not reported / stop() not clearing | W1+W3 / W1 |

Dynamic checks (no source change):
1. Interactive tour with Enter pressed at every prompt, fake phone: HEAD skips SCR-06 (no backend write); the old judge opens it and records a write. This is the real behaviour of QA_PR100_103 #103 NB-1, not only the static scan.
2. New deploy tests against the OLD deploy script: 5 failed, 8 passed (the commit message names the same five).
3. Smoke watchdog fired with a 4 s limit (see table above).
4. `-DryRun` with the 8.3 spelling of the repository (see table above).

## 4. Behaviour changes that could hurt (check 4 of the brief)

**Stricter holdout loader vs the real Day 39 material (metadata only).** Read: the committed record JSON, and from each package manifest only `experiment.experiment_id` and `experiment.checkpoint.checksum` (algorithm, value). Nothing per case was read or printed; `<data>` (the data root) was not touched.
- `ingest.load_holdout_authorization` accepts the record by its repository-relative path (as the documented command gives it) and by absolute path (records only the file name).
- `authorized_runs_problems` on the record: empty. The four runs are EXP-D-025, EXP-D-050, EXP-D-100, EXP-D-PP: each experiment listed once, names trimmed. EXP-D-100 and EXP-D-PP share one checkpoint on purpose; the duplicate rule is by experiment id, so that is accepted (I checked the shape explicitly).
- For all four packages: manifest `experiment_id` equals the record's, algorithm is sha256, the 64-hex value equals the record's `checkpoint_sha256`. So `HOLDOUT_CHECKPOINT_NOT_AUTHORIZED` rejects none of what the Mac mini serves.
- Not checked: the recorded `authorized_runs` inside the real data cache (`<data>\data_cache\index.json`), because that folder is off limits. It is copied from the record at ingest, so it passes whenever the record does. After the redeploy `/health` must show 4 experiments and an empty `rejected_experiment_packages`.
- Package shape cannot crash startup: Contract 2 `validate_manifest` runs first and requires `experiment.checkpoint.checksum` (schema, `jsonschema` pinned in `backend/requirements.txt`).

**Validator change vs every existing scenario.** It cannot break anything it is not given: `request` is optional; the only runtime callers are `backend/tests/api_support.py` (every `Api.call`, 275 backend tests pass) and the generated-scenario loop (34 cases pass). `tools/e2e/hero_flow_api.py` does not use the validator. `request_params` handles all 28 endpoint paths.

**SCR-06 checks vs a legitimate live case.** The real backend derives `raw/processed_prediction_artifact_id` (`backend/app/main.py:551-552`) and the slice's `prediction_mask_id` (:601-603) from the same `RunRecord.mask_id(variant)` (`backend/app/experiments.py:67-68`), so they are equal for both variants. `analysis_run_get` always carries `case_id`. SCR-03's push uses the case's own run; findings are created only with a run of the same case (`main.py:857-858`). The render smoke's live backend answers like the real one and all of V4a..V4q pass. A route without a caseId is still accepted.

**Watchdog vs a slow healthy run.** See the timing note in section 1: about 70 s against an 8 minute budget, overridable. The timer is `unref`'d and `stop()`ed before the final line, so a passing run is not delayed (W4).

## 5. The `management/` edit (check 6)

`management/spikes/SPIKE_C_ML/RESULT_C1.md`: **pure move, no content change.** Same byte count (13,160), same line count (150), identical multiset of lines. One 5-line block (the "The calendar fits (C1-9)" bullet) leaves main lines 64-68 and enters at head lines 53-57, i.e. at the end of the section 2 bullet list, before the "Owner interpretation" heading; the owner's paragraph now ends section 2 (read in the head file). **No record pins it by hash**: I searched all 793 tracked files at `main` and all 796 at the head (binaries skipped) for the sha256 and the git blob id of both versions, in full and as 7/8/10/12/16-character prefixes: 0 hits. Eleven files mention the path `RESULT_C1.md` (state yaml, ADR-ML-001, day22/23 records, the QA archive, OPEN_DECISIONS); none sits next to a hash of it. The leader's session finding is confirmed.

## 6. Publication policy (check 5)

Over the 1,625 added lines and the 19 commit messages:
- **IPv4:** the guard's classifier finds 0 private addresses; the only dotted quad on an added line is loopback `127.0.0.1` (`backend/tests/test_deploy_paths.py:119`). Per commit: 0 private in each of the 19. The self-test fixtures are still joined at run time (`-join '.'`); the 10.x one now uses 250.250 (outside ZeroTier's default pool).
- **Machine paths / serials / secrets / per-case values:** none on added lines (regex scan for drive-letter paths, `/home`, `/Users`, `/tmp`, serial words, secret words, e-mail like strings; the only hits are a comment word "serial", `kit@example.invalid` in a test, and the word "Secret" in `Hide-Secret` in a commit message). Case ids on added lines are synthetic or fixture placeholders (`CASE_0031`, `CASE_9102`, `CASE_0101/0102`, `CASE_0043`, `CASE_9999`, `CASE_0042` as a leak probe); no metric value per case. History: commit 8ea50ec adds a `%SystemRoot%` fallback, removed again by 985915a, so the net diff has none. One comment example with a profile-like 8.3 name (N-7).
- **Line endings / BOM:** all 43 changed files at the head have 0 CR bytes and no BOM (checked on git blob bytes); the four PowerShell files are pure ASCII (non-ASCII byte count 0). `git diff --check` is clean.
- **Commit messages:** no address, path, serial or secret; they carry the author's attribution line only.

## 7. Scope (check 7)

None of the protected paths is touched: `docs/specs/v1.0/**` 0 files; `docs/**` 0; `.github/**` 0 (so `guardrails.yml` untouched); `backend/mesh/**`, `backend/app/meshes.py`, `backend/app/main.py`, `mobile/src/verticals/v2/**`, `tools/e2e/hero_flow_api.py`: 0 each; also untouched: `contracts/api/contract.json` (no API version change needed), `app/core/**`, `ml/*.py` (the frozen training / inference modules), `mobile/package*.json`. `management/` has exactly one file (section 5). Product files outside the author's usual lanes were edited under the leader's account: `mobile/src/nav/navigator.mjs` (comment only), `mobile/src/verticals/v3/v3View.mjs` (one line), `tools/e2e/README.md` (one doc line). All comment or copy changes; I found no behaviour change in them.

## 8. Findings

### BLOCKING

None.

### NON-BLOCKING

**N-1 (medium-low, CI coverage). The only guard of QA_PR99 NB-5 (route case vs run case) never runs in CI.**
`mobile/test/v4_review_screen.test.mjs:520-521` (RS19 starts with `importMaskPngOrSkip`), code at `mobile/src/verticals/v4/reviewController.mjs:225`. The `mobile-shell` job has no `node_modules`, so RS19 to RS22 are skipped there (16 skipped in my CI-like run). The only job with `node_modules` runs the render smoke, which covers NB-3 and NB-2 (V4o, V4p; M-R-4 and M-R-5 killed) but not NB-5: with the case check removed the smoke still prints `PASS - 217 checks` (M-R-6). So the check is held only on machines that have `mobile/node_modules`.
Fix: the "other case is refused" half of RS19 needs no decoder (the refusal comes before any slice is read). Build the screen with `decodeMaskPng: null`, assert `BLOCKED` / `CONTRACT_DRIFT` and `asked == ['analysis_run_get']`, and keep only the PNG-dependent controls behind `importMaskPngOrSkip`; or add a render check next to V4o.

**N-2 (medium-low, robustness). The new `Add-Type` is an unguarded load-time dependency of the phone-session script.**
`mobile/scripts/device_ui.ps1:185-200` compiles `CmwLongPath` for `Get-LongPath` (:202-219) and `Test-OutsideGit` (:222). `main` had no `Add-Type` in `mobile/`, `backend/` or `tools/`. If the compile is refused (Constrained Language Mode, AppLocker or WDAC, security software), dot-sourcing `device_ui.ps1` throws, so `device_session.ps1`, the self-test and the Pester wrapper cannot start at all, although only the optional 8.3 expansion needs it. Simulated by shadowing `Add-Type` with a throwing function: "device_ui.ps1 FAILED TO LOAD". On this PC it works (self-test 34/34) and costs +0.14 s per start (0.22 s to 0.36 s). The author already guarded the COM class in the self-test (b7d4eba) but not this.
Fix: wrap it in `try/catch`; when it fails `Get-LongPath` returns `GetFullPath` and warns once, and `Test-OutsideGit` fails closed (a path component that looks like `~<digit>` counts as inside / unknown) so the 8.3 hole does not reopen silently.

**N-3 (low). The watchdog test leaves a temp folder per child run.**
`mobile/test/renderWatchdog.test.mjs:54` (`mkdtempSync`) is never removed: 37 `render-watchdog-*` folders (one file each) sit in the OS temp folder after about ten runs.
Fix: `rmSync(dir, { recursive: true, force: true })` in the `close` handler.

**N-4 (low, wording). E2E H8 is cited for both variants but asserts only RAW.**
Commit e621213 says E2E H8 asserts the equality "for both variants"; `app/verticals/v4_review_and_findings/README.md:248` says "E2E H8 asserts it on the real backend". `tools/e2e/hero_flow_api.py:1035-1036` compares the RAW variant only; PROCESSED has an echo check only (:744). The equality holds for both by construction (`backend/app/experiments.py:67-68`, `main.py:551-552` and `:601-603`), so the code is right; the sentence over-claims evidence.
Fix: "E2E H8 asserts it for RAW; the backend serves both from the run's single `mask_id(variant)`".

**N-5 (low, leftover with a weak reason). QA_PR87 N-3 stays open on a partly wrong ground.**
be9283c leaves the `mobile-render-bundle` job (`guardrails.yml:573`) without `timeout-minutes` because "the job-level timeout would only duplicate the watchdog". The watchdog covers the smoke step only; `npm ci` (:601-603) and `expo export` (:613-628) are unbounded (job default 360 minutes). `guardrails.yml` is outside this branch's scope, so nothing to fix here; keep it on the leader's guardrails list with the corrected reason (`timeout-minutes: 15`).

**N-6 (cosmetic). Dead variable.** `tools/report/build_report_assets.py:1255` `fig_dir = out / "figures"` is unused since e1d576d. Remove it.

**N-7 (cosmetic, publication hygiene). A profile-like short name in a comment.** `mobile/scripts/device_ui.ps1:184` uses a profile-like 8.3 name as the example. It is the generic short form of "Administrator", not this PC's profile, but the rule says no machine paths; use a neutral example such as `LONGFO~1`.

**N-8 (cosmetic). Stale heading.** `backend/README.md:270` "Known gaps (Day 22, updated Day 39)" now holds statements dated 2026-10-30. Update the heading.

**N-9 (info, open decision, disclosed by the author). QA_PR98 N-7 is closed only partly, by design.**
`backend/app/experiments.py:167-190` (the unlisted branch at :185): an experiment the cache's single record does not list is served whole. That will be true of every EXP-U-* package until the cache can hold a second record. The real packages are unaffected (section 4). Not a defect of the branch; keep it on the leader's decision list. After the redeploy check `/health` (4 experiments, empty `rejected_experiment_packages`) and run `hero_flow_api.py --no-writes`.

**N-10 (info). Path confinement is lexical.** `backend/app/ingest.py:118` refuses `..`, a drive or a leading separator, but a symlink inside the repository that points out of it is not caught. It needs write access to the repository; if the threat model wants it, resolve and test `relative_to(REPO_ROOT)`.

**N-11 (info). The new deploy tests never run in CI.** The 12 tests are Windows-only and skipped on the Linux runner (the author says so), so CI never exercises `deploy_macmini.ps1`. Run `python -m pytest backend/tests/test_deploy_paths.py -q` on the operator PC before each deploy (13 passed here in 8 s).

**N-12 (info). Global `sys.path` edit.** `ml/tests/test_results_page.py:18` puts `tools/board` first on `sys.path` at import, i.e. for the whole `ml/tests` session. No collision today (322 pass). Optional: import `build_results` with `importlib` or remove the entry afterwards.

## 9. Leftover open findings (source QA files, not fixed by the branch)

"Listed" = the branch's commit messages name it as not done, with a reason.

| Source | Item | State at `6a08de3` |
|---|---|---|
| QA_PR87 | N-1 scanner false negatives, N-2 two-dot diff, N-4 branch protection | open, listed (`guardrails.yml` / settings) |
| | N-3 `timeout-minutes` | open, listed, reason partly wrong (N-5) |
| | N-5, N-7 | information, accepted |
| QA_PR88 | N-5, N-6, N-7 | accepted / information, listed (N-1 to N-4 are fixed) |
| QA_PR90 | N-5 evidence still owed (K6, A17 device evidence for V3, UNet queue); not a code defect | open, listed (N-1 to N-4 are fixed) |
| QA_PR94 | NB-1 backend checks only the record's four identity fields plus `authorized_runs` / `authorized_by` shape; `decision_ref`, `closed_at`, `authorized_at` and a pinned record hash are not enforced | open, optional hardening, **not listed** by the branch |
| | NB-8 `compare([EXP-D-100, EXP-D-PP])` says "not same prediction variant" | open, leader decision, unchanged, **not listed** |
| QA_PR98 (outside the stated scope, N-7 only) | N-2 `--only-binary` for scipy, N-3 job comment (`guardrails.yml`) | open |
| | N-4 viewer "no network" assertion, N-5 double `message` listener, N-6 Back reopens SCR-05 on the opened slice (V2 files, frozen for this branch) | open |
| | N-8 mesh id / `.cmesh` route not in `contract.json` (until the next freeze), N-9 `MeshStore` defence (`backend/app/meshes.py`, frozen for this branch) | open |
| QA_PR99 | all of NB-2..NB-7 fixed; NB-1 was already fixed on `main` by `f086cd1` (2026-10-18) | none |
| QA_PR100_103 | #100 NB-2 (`partial` state not bound to a record, needs frozen `ml/infer.py`), NB-3 (spaces in the ml-tests pip line, still at `guardrails.yml:660`), NB-6 | open, listed |
| | #101 NB-3 optional `--exclude "checkpoints"` | open, **not listed**, not a defect |
| | #102 NB-2 placeholders, NB-3 `fig_e` labels, NB-4 two aggregate files | open, listed |
| | #103 NB-3 hard-coded default output root | accepted, listed |

Closed before the branch (so not leftovers): QA_PR94 NB-2 (CASE_0001 rule, `CaseStore._refuse_unsafe_holdout`), QA_PR98 B-1 (`backend/mesh` is in `$codePaths`), QA_PR98 N-1 (`-ShipPackages`), #103 blocking item 1 (IPv4 fixtures joined at run time, 8aa6c79).

## 10. What I did not do

- **No Python 3.9 interpreter** on this machine. Compatibility of the 12 changed backend / contracts Python files rests on `ast.parse(feature_version=(3, 9))` (all parse), `from __future__ import annotations` present wherever a signature uses `X | Y` (the one file without it, `test_deploy_paths.py`, uses none), `List` imported in `cases.py`; the CI job itself was not run.
- **No GitHub CI** (no PR, no run existed); jobs were reproduced as listed in section 1. `npm ci` was not run (the junction tree is byte-matched to the lockfile), no `expo export`, no Gradle, no emulator, no device. The `state-parses` and `geometry-contract` jobs were not run (their inputs are untouched).
- **Real holdout data:** `<data>` was never touched; the real data cache and the Mac mini were not read, so the cache's recorded `authorized_runs` and the host's `/health` were not checked. Only the record and the four manifests' two fields were read (section 4). No backend was started.
- The e2e tour inside Pester (`CMW_E2E_TOUR=1`) was not run as such; I ran the equivalent interactive tour with blank stdin instead (which is the part Pester cannot drive).
- I did not review Vietnamese wording (none was added), did not comment, review, label or merge anything on GitHub.
- Folders I created outside `<scratch>` are test output of the suites themselves and were not deleted: `render-watchdog-*` and `cmw_*` in the OS temp folder, and `cmw_qab_tour` (my interactive tour runs, synthetic data only).

## 11. Local artifacts (this section is local; redact before archiving)

- Review worktree (detached at `6a08de3`, clean, left in place): `<scratch>\qa_d51\qab_review`
- Scratch copies made with `git archive` (no `.git`): `...\qa_d51\qab_mut` (mutation copy, pristine again), `...\qa_d51\qab_base` (`main` `cd76112` baseline), `...\qa_d51\qab_tourmut` (old-judge tour copy)
- Scripts and logs: `...\qa_d51\mutate_driver.py`, `policy_scan_d51.py`, `per_commit_scan.py`, `eol_check.py`, `real_metadata_check.py`, `c1_move_check.py`, `tour_interactive.ps1`, and `...\qa_d51\logs\` (every suite output, `mut_*.log`, `tour_head.json`, `tour_mutated.json`)
- This report: `...\qa_d51\QA_BRANCH_QA_BACKLOG_D51.md`
