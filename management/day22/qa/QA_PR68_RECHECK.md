# QA review: PR #68, FastAPI + SQLite backend (delta `a1b0b40..35651f8`) · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM QA session (Claude Code, Claude Opus 5.5) running under the team leader's account. It is not a second human and not an independent human reviewer. |
| **Target** | PR #68, `feat/day22-backend-hero-flow`, head `35651f846af9259a805dd39f354baeaee536f780`. Only the delta `a1b0b40..35651f8` was reviewed: one commit, 22 files, +3140/−0. It covers `backend/**`, one CI job in `guardrails.yml`, `.gitignore` and `.gitattributes`. PR #62 (contract v1.0, head `a1b0b40`) is out of scope. |
| **Baseline** | `origin/main` = `44350d4`. CI tested merge commit `1676259`, which is the head merged into `44350d4`. On main, the split manifest has sha256 `c5c65a09…` (the blob QA-005 accepted) and the dataset manifest has sha256 `f64d461f…`. |
| **Run** | 11:40–11:58 (+07), inside the 50-minute timebox. Windows 11, PowerShell 5.1. The only interpreter is Python 3.12.6: there is no `py` launcher and no 3.9. I built a scratch venv with the exact pins from `backend/requirements-dev.txt`. |
| **Method** | Read-only. I used a detached worktree (`<qa-worktree>`) at the head; scripts and synthetic data live in `<qa-scratch>`, outside any repository. I modified nothing in the repository, posted nothing to GitHub, ran no ssh and did not run the deploy script. At the end, `git status` in the worktree was empty. |
| **Data handling** | Synthetic fixtures only. I opened no real NRRD file, no real PNG and no final_holdout file. I read only the committed manifests on `origin/main` (`dataset_manifest.json` and `split_manifest_path_a_seed2024.json`) so I could apply the selection rule. **This report contains no IP address, host name or machine path.** Findings cite file:line instead. |

> **VERDICT: MERGE AFTER FIXES.** The service core is sound: the routing-to-contract binding, the error envelope, ground-truth withholding for INT-12, the review state machine, `expected_revision` and the immutability triggers. Every JSON answer I collected validates against Contract 11 v1.0.0: 46 from a live uvicorn server and 22 from the INT-12 proof, plus the suite's own answers. There are **4 blocking findings, all in deployment, configuration and docs**, and each is small:
> - **B1**: the offline wheel set is missing `exceptiongroup`, so the default deploy fails on the Mac mini's Python 3.9.6.
> - **B2**: the server binds `0.0.0.0`, so the no-auth API can be reached from outside the overlay.
> - **B3**: the real overlay IP and a machine-specific path are committed.
> - **B4**: derived patient data defaults to a location inside the git work tree.
>
> There are 13 non-blocking findings (N-1 to N-13).

---

## 1 · Commands run

| # | Command | Result |
|---|---|---|
| R1 | `git fetch origin`; `git checkout --detach 35651f8…` (worktree); `git diff --stat a1b0b40 35651f8`; `git merge-base --is-ancestor a1b0b40 35651f8` | 22 files, +3140; exit 0, so the head is stacked cleanly on #62 |
| R2 | `python -m pytest backend/tests -q -p no:cacheprovider` (global Python 3.12.6 with fastapi 0.140 / starlette 1.3 / pydantic 2.13) | **15 passed, 1 skipped** |
| R3 | The same command with `-rs`, in a venv using the exact pins (fastapi 0.115.6, starlette 0.41.3, pydantic 2.10.4, numpy 1.26.4, pillow 11.0.0, pynrrd 1.1.1, jsonschema 4.23.0, uvicorn 0.32.1) | **15 passed, 1 skipped**. The skip is `test_selection_on_the_real_split_manifest_when_present`, because the split manifest is not on the PR branch (the branch predates PR #35). |
| R4 | `py -0p` and `where.exe python` | No launcher and no 3.9, so 3.9 was **not run locally**. I ran the AST scan instead (R12). |
| R5 | `gh pr checks 68`; `gh run view 36816072819 --log --job 110221290328` | 9/9 checks pass. The backend job: `setup-python` reports *"Successfully set up CPython (3.9.25)"*, checkout is `refs/remotes/pull/68/merge` = `1676259`, and the result is **`16 passed in 1.06s`**. The real-split test ran there. |
| R6 | `ingest.rule_based_selection()` on main's split, read with `git show` | 21 cases: **CASE_0061** as `INTEGRATION_CASE_001`, **20** validation cases (including 0061), and **CASE_0001** as `INFERENCE_ONLY_INT12`. The split's dataset pin `f64d461f…` equals the committed dataset manifest. Main's split sha256 is `c5c65a09…`, the QA-005 blob. |
| R7 | `gt_proof.py`: synthetic package. `sys.addaudithook` raises on any `open` of the INT-12 GT path or of either file of the 2 non-selected holdout cases, and `Path.stat` is patched to raise on the INT-12 GT path. I then ran ingest three times (NEW, NO_OP, and `only=[CASE_9101, CASE_0027]`) with `check_ignored=True`, then drove the app through every GT-dependent endpoint with the hook still armed. | **VIOLATIONS: []**. Details are in check 3. |
| R8 | `live_probe.py`: real `uvicorn` on 127.0.0.1 (pinned venv) over the synthetic env. All 28 endpoint ids, success and error paths, each answer checked with `validate_api_contract.validate_response`, followed by security probes and a concurrency race. | **46/46 answers contract-valid**. Probe results are in check 5. |
| R9 | `db_and_ast.py`: direct SQL against a copy of the live DB after a commit | UPDATE, DELETE and UPSERT are blocked; **INSERT OR REPLACE and REPLACE INTO are allowed** (N-2) |
| R10 | The deploy's own command, `python -m pip download --platform macosx_11_0_arm64 --python-version 3.9 --implementation cp --only-binary=:all: -r backend/requirements.txt` (global pip 25.3, which is what the script calls). Then a closure check that evaluates every wheel's `Requires-Dist` markers for CPython 3.9.6, darwin, arm64. | 20 wheels. The 4 binary ones are all `cp39-cp39-macosx_11_0_arm64`. **Unsatisfied: `anyio 4.12.1 → exceptiongroup>=1.0.2; python_version < "3.11"`** (B1). After adding `exceptiongroup==1.3.0` the closure check reports OK. |
| R11 | `git grep -n -E '<IPv4>' 35651f8 -- <changed files>`; `git grep` for absolute paths; `git diff --numstat` (binary check); `git grep -c '<same IP>' origin/main` | IP literal at `backend/README.md:114` and `backend/scripts/deploy_macmini.ps1:36`. A `D:\…`/`D:/…` package path at `backend/app/ingest.py:32`, `:54` and `backend/README.md:56`. **0 binary files** in the delta. The same IP already appears in **21 files on main**. |
| R12 | AST scan of `backend/**`: `ast.parse(feature_version=(3,9))`, plus checks for `match`/`except*`, parenthesized context managers, `zip(strict=)`, `X \| Y` and builtin generics in annotations, `dataclass(slots/kw_only)`, and a list of 3.10+ API names | **No findings.** Every module that has annotations uses `from __future__ import annotations`. |
| R13 | `Settings.from_env()` defaults; `ingest._refuse_tracked_output()` on `backend/data_cache` and on an unignored path | All 4 defaults are inside the work tree. The guard **accepts** the ignored in-repo path and refuses only unignored ones (B4). |
| R14 | Second ingest with an operator-error split into a copy of the same cache (`stale_cache` demo) | `index.json` merges as a union, so the server now serves **2** `INFERENCE_REVIEW` final_holdout cases (N-1) |
| R15 | PS 5.1 `Parser.ParseFile` on both `.ps1` files; byte scan of the 3 scripts | 0 parse errors; pure ASCII, LF line endings, no BOM |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Suite on the head | **PASS** | R2/R3: 15 passed, 1 skipped (environment-dependent skip only) |
| 1b | Suite under Python 3.9 | **PASS (CI) / NOT RUN locally** | R5: CPython 3.9.25 on merge `1676259`, 16 passed. No 3.9 interpreter is available locally (R4). |
| 1c | 3.10+ syntax that pydantic/FastAPI would evaluate at runtime | **PASS** | R12: no findings. Residual risk: CI runs Linux x64 3.9.25, not macOS arm64 3.9.6, and installs online, so it never exercises the offline path that B1 breaks. |
| 2a | Every route returns contract-valid responses | **PASS** | R8: all 28 endpoint ids, 46/46 valid. R7: 22/22 valid. The suite validates every `api.call`. Limit: the metric, cohort and mesh success shapes are untested because those endpoints answer the unavailable state by design (`metrics.py`, README "Known gaps"), which `metric_rules.unavailable_rule` allows. |
| 2b | Error codes come only from each endpoint's list | **PASS** | The `endpoint()` wrapper (`main.py:74-87`) turns any unlisted code into a 500. Observed: GROUND_TRUTH_UNAVAILABLE 404, STALE_REVISION 409, INVALID_REVIEW_TRANSITION 409, GEOMETRY_MISMATCH 422, VALIDATION_ERROR 422, SLICE_OUT_OF_RANGE 422, CASE_NOT_FOUND 404, RUN_NOT_DEPLOYABLE 409, ARTIFACT_NOT_FOUND 404; RUN_NOT_SUCCEEDED and ANALYSIS_FAILED in the suite. Exception: 400 and 405 answer non-envelope bodies (N-5). Precedence note: for INT-12, an out-of-range GT slice answers SLICE_OUT_OF_RANGE, and a missing `prediction_variant` answers ARTIFACT_NOT_FOUND before GROUND_TRUTH_UNAVAILABLE. Neither leaks GT. |
| 3a | Only the declared case set is ingested | **PASS** | `ingest.py:73-89` implements the rule. `--only` can only filter the selection (`:273-274`); R7 shows `only=[CASE_9101, CASE_0027]` ingests nothing. On main's split: 21 cases, exactly one holdout case, CASE_0001 (R6). |
| 3b | The INT-12 GT file is never opened | **PASS** | Code: `withheld` (`ingest.py:137`). The mask path is built and opened only inside `if not withheld` (`:170-187`); the NO_OP path reads only the cached `case.json`. Runtime (R7): no open or stat of the INT-12 GT across 3 ingests plus serving. Files opened under the package were the INT-12 MRI and the two validation cases' MRI and GT only. INT-12 `case.json`: `ground_truth_available` false, 0 GT slices, `mask_sha256` null, `reference_mask_id` null, no `gt/` directory. |
| 3c | No other final_holdout id can be ingested or served | **PASS with gap** | Ingest: correct by rule (R6, R7). Serve: the other holdout ids answer CASE_NOT_FOUND (R7). However, the server trusts whatever `index.json` lists, and that file is a union across runs (R14), so the "exactly one" invariant is not enforced. That is N-1. |
| 3d | GT endpoints answer GROUND_TRUTH_UNAVAILABLE for INT-12 | **PASS** | R7: 11/11 (3 GT slices, plus run metrics, slice metrics, slice error and error-reconstruction for both RAW and PROCESSED). Prediction, review and findings stay available, as `case_capability` requires. |
| 4a | Transitions enforced server-side, `commit_result_state = CORRECTED` | **PASS** | Enforced in code (`storage.py:198-258, 279-329`) and matches `review_status_transitions` and `create_allowed_states`. CORRECTED requires a persisted version; a commit always ends CORRECTED; a commit on a CORRECTED review adds a version. R8: PATCH after a commit answers INVALID_REVIEW_TRANSITION. The `reviews` table has no trigger (code-only enforcement), which the brief allows. |
| 4b | Reviewed-mask versions are immutable and checksummed | **PASS with gap** | Each version is `RM_<review>_V<n>` with a parent link and a sha256 over the uint8 (z,y,x) bytes. Per-slice sha256 is stored, and the artifact route re-hashes bytes on every serve. R9: UPDATE/DELETE on `reviewed_masks`, `reviewed_mask_slices` and `review_history`, and UPSERT, all answer `IMMUTABLE_ARTIFACT`. **INSERT OR REPLACE / REPLACE INTO bypass the triggers** (N-2). No app code path uses REPLACE. |
| 4c | `expected_revision` / STALE_REVISION | **PASS** | Covered in the suite and in R8. Race: 4 concurrent PATCHes with `expected_revision=1` produced exactly one 200 (revision 2) and three 409 STALE_REVISION. |
| 5a | Path traversal on the artifacts route and any file-serving route | **PASS** | R8: `..%2F`, `%2e%2e%2f`, `..%5C`, `C:%5C…`, `%2F…`, double-encoded `%252F` and a raw `../../` all answer 404 ARTIFACT_NOT_FOUND. No route serves a path built from user input. Render-cache directories are named by Contract 2 ids, which the validator restricts to `ART_[A-Za-z0-9._-]+`. |
| 5b | Content-addressed ids checked by a strict regex | **PASS (nit)** | `^([0-9a-f]{64})\.png$`; uppercase and `.PNG` answer 404. `$` also accepts a trailing newline, so `<digest>.png%0A` answers 200 with the same blob. Harmless (N-9). |
| 5c | SQL injection | **PASS** | Every `execute` uses `?` placeholders. `findings()` interpolates only column names from a fixed tuple. Injection strings in R8 return empty results or not-found. |
| 5d | Request size limit on `working_mask_put` | **FAIL (non-blocking)** | A ~40 MiB JSON body was accepted and fully parsed: 422 after 0.5 s. No limit exists (N-4). |
| 5e | Bind address | **FAIL (blocking)** | `serve_macmini.sh:35` uses `--host 0.0.0.0`, as do the docs at `main.py:9` and `README.md:111`. B2. |
| 5f | CORS | **FAIL (non-blocking)** | `allow_origins=["*"]` with PUT/PATCH (`main.py:67-68`). A preflight from an arbitrary origin is approved (N-3). |
| 5g | No auth vs DR-003 | **Consistent in design, not as deployed** | DR-003 is "LOCAL_DEMO, private overlay, cellular access", and the authenticated ZeroTier overlay (DR-003a) is the trust boundary. That justifies no auth *only if* the process can be reached through the overlay alone; the Spike E stub (`spikes/spike_e_transport/stub/server.py:36-42`) states that rule and binds loopback or the overlay address only. Bound to `0.0.0.0`, the unauthenticated read/write API is also reachable from every other network the Mac mini is attached to. Hence B2. |
| 6a | Deploy script deletes nothing outside its target directory | **PASS** | It deletes nothing at all: no rm, only `mkdir -p`, scp and `tar -x` under `~/<RemoteDir>`. The local stage is overwritten, never deleted. |
| 6b | No secrets | **PASS** | ssh runs in BatchMode with key access; no token or password appears. |
| 6c | No hard-coded IPs or hosts; they are parameters | **FAIL (blocking)** | `-OverlayIp` defaults to the real overlay IPv4 (`deploy_macmini.ps1:36`), and the same IP is in `README.md:114`. B3. The `macmini` ssh alias as a parameter default is acceptable. |
| 6d | Offline wheels are cp39 macOS-arm64 | **PASS on tags, FAIL on closure (blocking)** | R10: all binary wheels are `cp39-cp39-macosx_11_0_arm64`, but `exceptiongroup` is missing. B1. |
| 6e | Service starts with a pid file and a log | **PASS (nit)** | `nohup … >> backend/var/uvicorn.log`, `echo $! > backend/var/uvicorn.pid`, then a `/health` wait loop. Restart edge cases are in N-8. |
| 7 | Derived patient data lives outside any git work tree | **FAIL (blocking)** | The defaults `backend/data_cache`, `backend/var/backend.sqlite3`, `backend/experiments` and `backend/var/render_cache` (`config.py:44-47`), `ingest --out` (`ingest.py:315`), and the deploy stage `backend/var/deploy_stage` holding `data_cache.tar.gz` (`deploy_macmini.ps1:45,64`) are all inside the repo. They are only gitignored, and the guard accepts ignored paths (R13). B4. |
| 8a | No hosts, IPs, usernames or machine paths in committed files | **FAIL (blocking)** | R11: the IP literal in 2 places and the machine package path in 3 places. B3. |
| 8b | No dataset bytes in the diff | **PASS** | R11: 22 text files, 0 binary, largest 39.8 KB (`main.py`) |

## 3 · Findings

### BLOCKING. All four must be fixed before merge. B1 and B2 must also be in whatever is deployed at 19:00.

**B1 · The offline wheel set misses `exceptiongroup`, so the default deploy fails on Python 3.9.6.**
- `pip download --python-version 3.9` evaluates environment markers against the *host* interpreter (3.12) rather than the target. R10 proves it: Windows-only `colorama` is included and the 3.9-only `exceptiongroup` is not.
- `anyio 4.12.1` requires `exceptiongroup` on Python < 3.11.
- So on the Mac mini, `pip install --no-index --find-links wheels` fails. `serve_macmini.sh` (`set -euo pipefail`) then exits 1, and the deploy stops at step 5.
- CI does not catch this because it installs online on a 3.9 runner.

*Fix:*
- Add `exceptiongroup==1.3.0` to `backend/requirements.txt` **without a marker**. A marker would be evaluated on the host and dropped again. R10 confirms the closure is then complete.
- Better: commit a full lock taken from `pip freeze` in the CI 3.9 job, and add a CI step that runs the deploy's `pip download` and a marker-closure check for CPython 3.9.6 / darwin / arm64.

*Workaround tonight:* `-NoWheels`, if the Mac mini has internet access.

*Owner:* A3 / Nguyễn Gia Đức Trung.

**B2 · The no-auth API binds `0.0.0.0`, outside DR-003's trust boundary.**
- `serve_macmini.sh:35` serves CAP-derived MRI and GT slices and accepts review and finding writes on every interface of the Mac mini, not only the overlay.
- CORS `*` (N-3) makes any web page opened in a browser on those networks a client.
- This contradicts DR-003/DR-003a and the team's Spike E rule ("the process must not be reachable outside [the overlay]").

*Fix:*
- `serve_macmini.sh` takes a `BIND_HOST` argument; `deploy_macmini.ps1` passes the overlay address it was given.
- uvicorn runs with `--host "$BIND_HOST"`, and the local health check curls `http://$BIND_HOST:$PORT/health`.
- Refuse `0.0.0.0` unless an explicit override flag is set.
- Update `main.py:9` and `README.md:111`.

*Owner:* A3 / Nguyễn Gia Đức Trung.

**B3 · The real overlay IP and a machine-specific path are committed to a public repo.**
- The IP is the default of `-OverlayIp` (`deploy_macmini.ps1:36`) and appears in `README.md:114`.
- `D:\…\lasc2018\extracted` is the default of `DEFAULT_PACKAGE_ROOT` (`ingest.py:54`) and appears in the docstring (`:32`) and `README.md:56`.
- The leader's F5 practice is that the private package's "absolute machine path is intentionally omitted" (`SPIKE_D_DATASET/POLICY_EVIDENCE.md`). The Spike E stub writes `10.x.x.x`.

*Fix:*
- Make `-OverlayIp` mandatory with no default, or read it from an untracked local file or environment variable.
- Read the package root from `CARDIAC_PACKAGE_ROOT`, or require `--package-root`.
- Use `<overlay-ip>` and `<LASC extracted root>` in the docs.
- The IP already appears in 21 files on main; that cleanup is N-13.

*Owner:* A3 / Nguyễn Gia Đức Trung.

**B4 · Derived patient data defaults to a location inside the git work tree.**
- All data defaults and the deploy stage are under `backend/` (check 7).
- The guard `_refuse_tracked_output` (`ingest.py:92-107`) refuses only paths that are *not ignored*.
- The cache's `case.json` and `contract1_record.json` also hold the per-data-file SHA-256s. F5 keeps those in restricted artifacts *outside the repository*, and the dataset validator "refuses to write the restricted artifact anywhere inside the repository".
- `no-forbidden-bytes` does not reject `.png`, `.sqlite3` or `.tar.gz`, so a force-add would not be caught.

*Fix:*
- Default all of these outside any work tree: `Settings`, `ingest --out`, `run_local.ps1` and the deploy stage (for example a per-user `~/.cardiac-backend/` or `%LOCALAPPDATA%\cardiac-backend\`).
- Make the guard refuse **any** path inside a git work tree, ignored or not.
- Keep the `.gitignore` lines as defense in depth.

*Tonight, before the code fix:* pass `--out` and `-DataCache` paths outside the repo.

*Owner:* A3 / Nguyễn Gia Đức Trung.

### NON-BLOCKING

| # | Finding | Fix | Owner |
|---|---|---|---|
| N-1 | "Exactly one holdout case" is not enforced when `index.json` is merged or at serve time. `index.json` is a union across runs (`ingest.py:286-289`), so a second ingest with a different split into the same cache serves 2 holdout cases (R14). The split manifest is not pinned either; only `split_id` is recorded. | `run_ingest`: refuse when the previous index has a different split or dataset hash, and pin the accepted split sha256 `c5c65a09…`. `CaseStore`: refuse to start with more than 1 final_holdout case, or with any holdout case that has GT available or GT slices. **Recommended before the deploy.** | A3 / Trung |
| N-2 | The triggers do not stop `INSERT OR REPLACE` / `REPLACE INTO`, because `recursive_triggers` is 0 and the REPLACE delete fires no trigger (R9: the checksum was overwritten and a slice replaced). This makes the claim at `storage.py:10-12` ("impossible even from a bug") too strong. | Run `PRAGMA recursive_triggers = ON` at connect, or add BEFORE INSERT triggers that abort when the primary key already exists. Add a REPLACE test. | A3 / Trung |
| N-3 | CORS `*` allows write methods from any origin. | Add a `CARDIAC_CORS_ORIGINS` allowlist (empty means no CORS middleware), set to the phone client's real origin. | A3 / Trung |
| N-4 | There is no request-body limit (check 5d). | Add middleware that caps the body at about 1 MiB, by Content-Length and by streamed count, answering with the VALIDATION_ERROR envelope. A 576×576 bitpack payload is about 55 KB in base64. | A3 / Trung |
| N-5 | 400 and 405 answer `{"detail": …}` instead of the contract envelope (`main.py:93-97`). `/docs`, `/redoc` and `/openapi.json` are exposed. | Map 400 to VALIDATION_ERROR and give 405 an envelope. Use `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` for deployment. | A3 / Trung |
| N-6 | The suite's INT-12 guard (`synthetic.py:67-70`, GT replaced by non-NRRD bytes) proves the GT is never *parsed*, not never *opened*. A regression that only hashes the GT would pass. | Adopt the R7 audit-hook test (`open` + `stat`, run in a subprocess). | A3 / Trung |
| N-7 | The docs and branch are stale. `README.md:126-127` says the suite runs on 3.12, but CI runs 3.9. `README.md:59-60` says PR #35 is unmerged. The branch predates #35, so the real-split test skips on the head and only ran on the CI merge ref. | Rebase on main and update the README. | A3 / Trung |
| N-8 | `serve_macmini.sh:27-33` kills the PID in the pid file without checking that it is this uvicorn (PID reuse). It also starts a new server even if the old one is still alive after 10 s, in which case `/health` could pass against the old process. | Check `ps -p $PID -o command=`; escalate or abort if the old process is still alive; verify that `/health` reports the new start. | A3 / Trung |
| N-9 | The regexes use `$`, which accepts a trailing `\n` (`main.py:33-35`). | Use `fullmatch` or `\Z`. | A3 / Trung |
| N-10 | `X-Reviewer-Id` is self-asserted, so the FR-REV-010 provenance records an unauthenticated claim. | List it under "Known gaps" as a LOCAL_DEMO limit. | A3 / Trung |
| N-11 | F5 material reaches API clients. `mri_slice_get.source_version` carries the first 16 hex characters of the per-file MRI SHA-256. This is fine on the overlay, but real-data responses must never be pasted into committed evidence. | Derive `source_version` from the rendered-slice checksums or from an opaque render id. | A3 / Trung |
| N-12 | Minor robustness issues: render `index.json` is written non-atomically (`experiments.py:202`), so a concurrent first render can 500; `ingest.main` lets FileNotFoundError/ValueError escape as tracebacks; the artifact `Cache-Control` is `public`. | Write to a temp file and replace; catch and map the errors to `FAIL [code]`; change `public` to `private`. | A3 / Trung |
| N-13 | *Follow-up outside this PR.* The same overlay IP literal is already in 21 files on main, and `no-forbidden-bytes` ignores derived PNGs, SQLite files and IP literals. | Run a cleanup sweep. Extend the guard to reject `backend/data_cache/**`, `backend/var/**`, `*.sqlite3` and IPv4 literals in added lines. | Leader (Project Control) |

## 4 · Verdict

**MERGE AFTER FIXES: B1, B2, B3 and B4.** Each one touches only `requirements.txt`, the two scripts, `config.py`/`ingest.py` defaults plus the guard, and the README. Re-checking those diffs, with CI green, is enough; no full re-review is needed.

On ground-truth safety, the point that matters most tonight: by code reading and by the R7 runtime proof, CASE_0001's GT is never opened, and every GT-dependent endpoint answers GROUND_TRUTH_UNAVAILABLE for it.

For the 19:00 deploy:
- **B1** (or the `-NoWheels` workaround) and **B2** must be in the deployed code.
- **B4** can be met operationally tonight with out-of-repo `--out` and `-DataCache` paths.
- **N-1** is strongly recommended.
