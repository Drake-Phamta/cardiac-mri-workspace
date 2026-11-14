# QA re-check: PR #68 fix delta `35651f8..21d22dc` · **DO NOT MERGE at `21d22dc`** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM QA session (Claude Code, Claude Opus 5.5) running under the team leader's account. It is not a second human. |
| **Target** | PR #68 head `21d22dc9a3fe4b1c9f5e82559775f77ac988f19c`. The delta reviewed is two commits, `8659467` and `21d22dc`: 17 files, +870/−158. |
| **Baseline** | `origin/main` = `6b52628`. CI tested merge commit `6eddaf1`, which is `21d22dc` merged into `6b52628`. **Main is still on contract `DRAFT v0`.** PR #62 (contract `1.0.0`) is still **open**, so a squash of #68 would include its two commits, `ac4b355` and `a1b0b40`. |
| **Run** | 12:15–12:26 (+07). Read-only. Detached worktree; synthetic data only, in `<qa-scratch>`. No deploy, no ssh, nothing posted to GitHub. I never ran more than 2 processes at a time. At the end, `git status` in the worktree was empty. |
| **Hygiene of this report** | It contains no address, host alias or machine path. Findings cite file:line instead. |

> **VERDICT: DO NOT MERGE at `21d22dc`.** The backend fixes are good: B1, B2, B4, N-1, N-2 (inside the app), N-3, N-4, N-5, N-9 and N-12 are verified below. Three things still stop the merge:
> - **X1**: CI is **red** on the PR's own merge ref. `app/core tests` fails 6 of 73 V1 tests. This comes from the #62 part of the stack meeting #53's tests now on main, not from backend code.
> - **X2**: B3 is only half fixed. **Machine paths are still committed**, 11 lines across 4 files, and 3 of them are functional defaults.
> - **X3**: the L4 summarizer **misattributes slice switches**. Its output must not be quoted as NFR-PERF-001 evidence in its current form.

## 1 · Commands run

| # | Command | Result |
|---|---|---|
| C1 | `python -m pytest backend/tests -q -rs -p no:cacheprovider`, once in the exact-pins venv and once in the global 3.12 environment | **21 passed, 1 skipped** in both. The skip is the real-split test; the branch still lacks main's split manifest. |
| C2 | `gh pr checks 68`; `gh run view 36818695686 --log` (backend and app/core jobs) | Backend job: CPython 3.9.25, **22 passed**, and the closure step reports `PASS: 20 distributions`. **`app/core tests`: FAIL**, `V1 case explorer — 6 of 73 failing` (V1-3 ×2, V1-19, V1-20 ×2, V1-21). |
| C3 | GT proof R7 adapted to the new API: an audit hook on `open` and `stat`, 3 ingests, then every GT endpoint | **No violations.** GT answers were GROUND_TRUTH_UNAVAILABLE 11/11, and all 22 answers are contract-valid. Only the INT-12 MRI and the validation cases' MRI and GT were opened. |
| C4 | R10: `pip download` with global pip 25.3 / Python 3.12 (the deploy's exact command), then the author's `check_wheel_closure.py` and my own closure check | New set: **PASS / closure OK**. Negative control (the author's checker on the old `35651f8` set): **`MISSING exceptiongroup… FAIL`, exit 1**. |
| C5 | `n1_n2_b4.py`: the R14 two-split demo, a hand-merged two-holdout cache, R9 REPLACE, and work-tree probes | Results are in §2. |
| C6 | `live_probe2.py`: a real uvicorn on 127.0.0.1 with `CARDIAC_BACKEND_DATA` set to scratch. 73 requests, each JSON answer checked with `validate_response`; the logged status and bytes compared with what the client received; privacy canaries; body-cap probes | 45/45 JSON answers valid. **72/72 requests: logged status and bytes equal what the client received.** (I didn't record the first `/health` on the client side, so the log has 73 lines.) |
| C7 | `mw_harness.py`: `RequestLogMiddleware` around Starlette under uvicorn 0.32.1 / starlette 0.41.3 | Exact byte counts for async streaming, sync streaming, `FileResponse` (full, and Range → 206), a plain response and a 204. One gap is noted in §2. |
| C8 | `summarize_request_log.py --log … --data-cache …` on the C6 log | Wrong grouping (X3) |
| C9 | `git grep` for IPv4 literals, ssh aliases and machine paths in `backend/` and `.github/`; `git diff --numstat`; PS 5.1 parser; AST scan with `feature_version=(3,9)` | 0 IPv4 literals and 0 alias defaults. **11 machine-path lines.** 0 binary files, 0 parse errors, files are ASCII with LF, no 3.10+ constructs. |

## 2 · Checks

| Claim | Result | Evidence |
|---|---|---|
| **B1** `exceptiongroup` pinned, plus a closure check in CI and in deploy step 3 | **FIXED** | C4: the new set passes both checkers and the old set fails the author's checker. Deploy step 3 runs the check (`deploy_macmini.ps1:120-123`). Note: the CI step downloads on a **3.9** host, where pip's host-marker evaluation already matches the target. So the check that actually protects the 3.12 operator PC is the deploy-time one; I reproduced that case locally. |
| **B2** bind via `-BindHost` / env; `0.0.0.0` only with `-BindAll` | **FIXED** (code reading) | The deploy throws unless one of them is set (`:52-54`). `serve_macmini.sh` binds `"$BIND_HOST"` and health-checks that address. `run_local` defaults to 127.0.0.1. Leftover doc nit: `main.py:9` still shows `--host 0.0.0.0`. |
| **B3** no address, alias or machine path committed | **NOT FIXED (half)** | The IP and the ssh-alias default are gone. Still present: a `D:\…\cardiac-data\…` path at `backend/app/ingest.py:33,34,55`, `backend/README.md:61,62,83,112`, `backend/scripts/deploy_macmini.ps1:35,57` and `backend/scripts/run_local.ps1:14,25`. Three of these are **functional defaults**: `DEFAULT_PACKAGE_ROOT` (`ingest.py:55`), the deploy's data root (`deploy_macmini.ps1:57`) and `run_local`'s `DataRoot` (`run_local.ps1:25`). This is X2. |
| **B4** everything under `CARDIAC_BACKEND_DATA`; no in-repo default; any work-tree path refused | **FIXED** | C5: `Settings.from_env()` with no environment fails, and a data root inside the work tree is refused. `inside_git_worktree` detects a worktree's `.git` *file* and the main repo. `ingest.main()` with no `--out` exits 2 (`OUTPUT_UNSET`). The deploy stage is now under `%TEMP%`, and the Mac data root is `~/cardiac-backend-data`. Nothing was left in the worktree. |
| **N-1** split pin, INDEX_CONFLICT, CaseStore guard | **FIXED** | C5: with the default pin the second split gives `PROVENANCE_INVALID`; with `--split-sha256` for the other split it gives `INDEX_CONFLICT`. The cache is unchanged afterwards (3 cases, 1 inference-only). A hand-merged cache with two holdout cases makes both `CaseStore` and `create_app` refuse with *"serves 2 final_holdout cases"*. `PINNED_SPLIT_SHA256` equals main's split blob, `c5c65a09…396d`. |
| **N-2** `recursive_triggers=ON` plus a REPLACE test | **FIXED inside the app; residual outside it** | C5: on the app's connection, INSERT OR REPLACE, REPLACE INTO, UPDATE and DELETE all answer `IMMUTABLE_ARTIFACT`. The pragma is per connection, so a **separate sqlite3 connection** (default `recursive_triggers=0`) can still REPLACE: the checksum became `sha256:REPLACED`. UPDATE and DELETE stay blocked on every connection. |
| **N-3** CORS | **FIXED** | No `Access-Control-Allow-Origin` header by default, and a preflight answers 405. An allowlist via `CARDIAC_CORS_ORIGINS` uses restricted headers. |
| **N-4** body cap | **FIXED (memory is bounded)** | A body that declares more than 1 MiB gets **413**. A chunked 2.5 MiB body with no Content-Length gets **400**, because FastAPI wraps the middleware's limit error into its own 400. Both answer the envelope. |
| **N-5** envelopes, docs off | **FIXED, with a contract nit** | `/docs`, `/redoc` and `/openapi.json` all give 404. 400, 405 and 413 now carry the envelope, but `validate_response` flags them: *"VALIDATION_ERROR must be HTTP 422, got 413"* and *"case_get answered VALIDATION_ERROR, which the endpoint does not list"* (for 405). app/core's client treats a status that disagrees with the contract as `CONTRACT_DRIFT`. |
| **N-9 / N-12** | **FIXED** | `fullmatch` is used, and `…/slices/3%0A/mri` now answers 422 SLICE_OUT_OF_RANGE. The render index is written atomically, NRRD errors map to ingest codes, and `Cache-Control` is `private`. |
| Request log: bytes | **CORRECT** | C6: logged status and bytes match the client exactly for all 72 recorded requests, including the 413, 400 and 405 answers. C7: exact for async and sync streaming, file (200 and 206), plain and 204 responses. The one discrepancy is `HEAD` on a plain `Response`: it logs 123,456 bytes while 0 go on the wire. This cannot happen in this app, because FastAPI routes reject HEAD. Pinned Starlette and uvicorn do not use the `pathsend` extension. |
| Request log: privacy | **No client IP or PII; one nit** | Keys used: `t, method, route, case_id, run_id, review_id, reviewed_mask_id, experiment_id, slice_index, kind, artifact_id, query, status, bytes, ms`. The canaries were all absent: 127.0.0.1, the client port, the `X-Reviewer-Id` value, the finding note, `Origin` and the user agent. The **raw query string is logged**, so free-text `q=` (my `PII-CANARY-Q`) appears. |
| L4 summarizer | **WRONG** | See X3 |
| Contract conformance at head | **PASS** | 45 live answers and 22 GT-proof answers are valid, plus the suite |
| Python 3.9 | **PASS** | CI 3.9.25: 22 passed. The AST scan is clean, including `middleware.py` and both scripts. |

## 3 · Findings

### BLOCKING for merge

**X1 · CI is red on the PR's own merge ref, and the squash would carry #62.**
- `app/core tests` fails on `6eddaf1`: V1-3, V1-19, V1-20 and V1-21, for example *"DRAFT v0 declares no case capability"* and *"no binary delivery fields in the response"*.
- Main (`6b52628`) is green, and the backend delta touches no `app/` or `contracts/` file. So the failure is #62's contract `1.0.0`, which is in this stack, meeting #53's V1 tests that were written against `DRAFT v0`.
- Squash-merging #68 now would land #62 before its own QA verdict and turn main red.

*Fix:* reconcile #62 with #53, then get #62's QA verdict and merge it. After that, rebase #68 on main so its squash holds only `backend/**`, the CI job and `.gitignore`/`.gitattributes`. Re-run CI.

*Owner:* #62 author together with A3 / Nguyễn Gia Đức Trung. Merge order: the leader.

**X2 · B3 is half fixed.**
- The machine path appears in the 11 lines listed in §2, including 3 defaults that decide behaviour.
- The README says *"Host names and addresses are parameters, never committed"*, which is true for hosts and addresses but not for paths.

*Fix:*
- `DEFAULT_PACKAGE_ROOT` comes only from `CARDIAC_PACKAGE_ROOT`, otherwise `--package-root` is required.
- `deploy_macmini.ps1:57` and `run_local.ps1:25` throw when neither `-DataRoot`/`-DataCache` nor `CARDIAC_BACKEND_DATA` is set, matching `config.py`.
- Examples use `<data-root>` and `<LASC extracted root>`.

*Owner:* A3 / Nguyễn Gia Đức Trung.

**X3 · The L4 summarizer misattributes slice switches.** This blocks quoting the numbers, not the API.
- Artifacts are content-addressed, so identical PNGs share one digest. All-empty mask slices are identical, which covers most GT and prediction slices in real data.
- `cases.blobs` and `render_blobs` keep only the **last** owner of a digest, so `describe_artifact` attributes such a fetch to an arbitrary case and slice. It can name a different case, and for empty prediction slices it could name CASE_0001.
- The prediction and reviewed-mask metadata lines carry no `case_id`, so they are dropped from switch totals.
- On C6 (6 switches on one case, 1,874–2,206 B each), the summarizer printed *"15 switches over 2 case(s)"*, p50 138 B and max 1,359 B, and attributed CASE_9001's empty GT fetches to "gt CASE_9003 slice 5".
- The bytes per request are exact, so the **raw log is still usable**. The derived summary is not.

*Fix:*
- Before tonight's capture, log the artifact digest. It is content, not PII, and makes the log re-analysable afterwards.
- Group a switch by its metadata request (`…/slices/{z}/mri|ground-truth|prediction`, `/reviewed-masks/{id}/slices/{z}`) and attach the following artifact fetches by sequence.
- Resolve `run_id`/`reviewed_mask_id` to `case_id`, and mark digests shared by more than one slice as `shared`.
- Add a test with an empty mask slice shared by two cases.

*Owner:* A3 / Nguyễn Gia Đức Trung.

### NON-BLOCKING

| # | Finding | Fix | Owner |
|---|---|---|---|
| R-1 | REPLACE is still possible from a connection outside the app (N-2 residual) | Add `BEFORE INSERT` triggers on `reviewed_masks` and `reviewed_mask_slices` that `RAISE(ABORT,'IMMUTABLE_ARTIFACT')` when the primary key already exists. That makes the protection independent of the connection. | A3 / Trung |
| R-2 | 400/405/413 answer VALIDATION_ERROR at a non-422 status | Answer an oversized or unparseable body with VALIDATION_ERROR at **422** on endpoints that list it, and document 405 | A3 / Trung |
| R-3 | The raw query string is logged, including free-text `q` | Log an allowlist of keys only (`variant`, `prediction_variant`, `mode`, `limit`, `page`, `source_mask_id`, `ids`) | A3 / Trung |
| R-4 | The CI closure step runs on a 3.9 host, so it cannot reproduce host-marker drops | Run that step under `setup-python 3.12` to mirror the operator PC | A3 / Trung |
| R-5 | `check_wheel_closure.applies(requirement, set())` at pop time drops dependencies gated by an extra. There is no impact today because no extras are used. | Carry the parent's extras through the queue | A3 / Trung |
| R-6 | `main.py:9` docstring still shows `--host 0.0.0.0`. HEAD on a plain `Response` would over-count bytes, but that cannot happen here. | Fix the doc line | A3 / Trung |
| R-7 | Carried over and unchanged: N-6 (the suite's own INT-12 "never opened" test), N-7 (rebase; the README's 3.12 line), N-8 (PID reuse in `serve_macmini.sh`), N-10, N-11, N-13 | As in the first report | A3 / Trung; N-13: leader |

## 4 · Verdict

**DO NOT MERGE at `21d22dc`.** To reach MERGE:
1. **X1**: #62 is reconciled with #53, passes QA and is merged; #68 is rebased and CI is green on its merge ref.
2. **X2**: the machine paths are replaced by required parameters or placeholders.
3. **X3**: the summarizer is fixed and the digest is logged, or the request-log summary is explicitly left out of the L4 evidence.

After those three, re-checking only that diff is enough; nothing else needs a second pass.

**Deploy tonight (separate from merge):**
- The backend at `21d22dc` is fit to deploy from the branch if `-SshHost`, `-BindHost` and `CARDIAC_BACKEND_DATA` or `-DataCache` are passed explicitly. With those set, the machine-path defaults are never used. B1, B2 and B4 are verified.
- The backend refuses any contract other than `1.0.0`, while main's app/core is on `DRAFT v0`. **The phone build must carry contract v1.0 from #62.**
- Capture the request log tonight, but recompute L4 with a fixed summarizer before quoting any number.
