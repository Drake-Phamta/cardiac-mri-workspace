# QA re-check 2: PR #68 delta `7c19a11..773c0ef` · **MERGE at `773c0ef`, after #62 is merged** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM QA session (Claude Code, Claude Opus 5.5) running under the team leader's account. It is not a second human. |
| **Target** | Head `773c0effc714fc85c1047a7b497287aa422e3cbe`. The delta is one commit on `7c19a11`: 11 files, +401/−105, no binary files. |
| **Restack** | Confirmed patch-identical. `git range-diff a1b0b40..21d22dc 7900fc1..7c19a11` gives `35651f8 = 4a36a80`, `8659467 = f1d952f` and `21d22dc = 7c19a11`. The #62 part is also identical: `ac4b355 = 02b03ad`, `a1b0b40 = 7c77411`, with `7900fc1` added on top. The tree difference between `21d22dc` and `7c19a11` on the backend paths (`guardrails.yml` +7, `.gitignore` +10) equals main's own change `44350d4..6b52628`, so it is base drift, not part of #68. |
| **Baseline** | `origin/main` = `440dab1` (#64, which touches only `ml/**`). **PR #62 is still OPEN**, with head `7900fc1`. |
| **Run** | 12:47–12:52 (+07). Read-only. Detached worktree; synthetic data only, in `<qa-scratch>`. I never ran more than 2 processes at a time. No deploy, no ssh, nothing posted to GitHub. At the end, `git status` in the worktree was empty. The report contains no address, alias or machine path. |

> **VERDICT: MERGE at `773c0ef`.** X1, X2 and X3 are resolved, R-1, R-3 and R-6 are fixed, and nothing new blocks.
> **Merge-order condition:** #62's three commits (`02b03ad`, `7c77411`, `7900fc1`) are still in this branch, and #62 is not merged. Squash-merge #62 first, after its own QA verdict, so that #68's squash carries only the backend. If #62 changes again before it merges, rebase #68 and confirm CI before merging it.

## 1 · Commands run

| # | Command | Result |
|---|---|---|
| D1 | `git range-diff` (both parts of the stack); `git diff --stat 21d22dc 7c19a11 -- backend .github .gitignore .gitattributes` compared with `git diff --stat 44350d4 6b52628` | All commits patch-identical; the difference is base drift only |
| D2 | `python -m pytest backend/tests -q -rs -p no:cacheprovider` (exact-pins venv) | **24 passed, no skip.** The real-split test now runs, because the new base contains the split manifest. |
| D3 | `gh pr checks 68`; `gh run view 36821037898 --log` | **9/9 checks pass** for head `773c0ef`, on merge commit `aa6ad73` (into `440dab1`). Backend: CPython 3.9.25, 24 passed, closure `PASS: 20 distributions`. app/core: `PASS V1 case explorer — 73/73`. |
| D4 | `git grep` for machine paths, IPv4 literals and ssh aliases in all **25 files** #68 touches (`7900fc1..773c0ef`) | **0 / 0 / 0.** The only remaining host-related word is "ZeroTier" (a technology name) in `README.md:7,126`. |
| D5 | `r9_773.py`: a second sqlite3 connection with `recursive_triggers=0`, plus a check on the storage lock | Results in §2 (R-1 and N-14) |
| D6 | `live_probe3.py`: real uvicorn on 127.0.0.1 with `CARDIAC_BACKEND_DATA` set to scratch. 50 requests: 6 sequential switches (MRI, GT and prediction views, each followed by its bytes), a prefetch pattern (two views, then both PNGs), a review commit with its reviewed view and bytes, privacy canaries and query probes. Then `summarize()` compared with switches I computed independently from the client's own record. | Results in §2 |
| D7 | `shared_check.py`: every `shared` log line compared with all owners of its digest on disk | **0 inconsistent** |
| D8 | PS 5.1 parser on both `.ps1` files; `ast.parse(feature_version=(3,9))` on `backend/**` | 0 parse errors; ASCII with LF; no 3.10+ constructs |

## 2 · Checks

| Claim | Result | Evidence |
|---|---|---|
| **X1** CI red from the #62 stack | **CLEARED** | D3: app/core 73/73 and every check green on the merge with current main. The condition above remains: #62 must merge first. |
| **X2** no machine path in any file #68 touches; `--package-root` or env required; scripts stop without a data root | **FIXED** | D4: 0 hits across 25 files. `DEFAULT_PACKAGE_ROOT` is gone; `--package-root` is `required=not env_root`. `run_local.ps1:25` throws without `-DataRoot` or `CARDIAC_BACKEND_DATA`. `deploy_macmini.ps1:56-60` throws without `-DataCache` or the variable, unless `-SkipData` is set. Examples use `<data-root>`. |
| **X3** digests in the log, ids resolved to a case, `shared`/`owners`, summarizer groups by announced digest | **FIXED** | D6 shows each part working: |
| | | Exact log: 50 lines for 50 requests, **0 status or bytes mismatches**. |
| | | **21/21** slice views carry `view` plus the digest their `content_url` names; **21/21** artifact fetches log the digest they served. |
| | | Prediction and reviewed views resolve to `CASE_9001`. |
| | | 12 shared-digest fetches. Each names only the fields that every owner agrees on (D7: 0 inconsistent). Unshared fetches were all attributed to the slice actually viewed. |
| | | **Summarizer output is identical to my independent computation:** 10 switches, for example `(CASE_9001,0)` = 6 requests / 2,012 B. The prefetch pair went to the right switches by digest: 21 by digest, 0 by sequence. |
| **R-1** BEFORE INSERT triggers | **FIXED** | D5, on a second connection with `recursive_triggers=0`: all of the following answer `IMMUTABLE_ARTIFACT`: INSERT OR REPLACE on `reviewed_masks` (same id, and a new id with the same `review_id`+`version`), REPLACE on `reviewed_mask_slices`, `review_history`, `finding_history` and `findings`, an UPSERT on `findings`, UPDATE and DELETE. The checksum was unchanged, there is still 1 row, and all 5 `*_no_replace` triggers are present. App inserts are unaffected (D2). |
| **R-3** allowlisted query keys only | **FIXED** | D6 logged `{'variant':'RAW'}`, `{'mode':'EVALUATION','limit':'5'}` and `{'case_id':'CASE_9001','status':'<not logged>'}`, the last for the value `OPEN OR 1=1`. `q` never appears. Canaries absent from the log: client IP, client port, the `X-Reviewer-Id` value, the finding note, the `q` text and the user agent. |
| **R-6** docstring | **FIXED** | `main.py` now shows `--host 127.0.0.1`, plus a note on the overlay bind |
| Contract conformance | **PASS** | D6: 28/28 JSON answers valid, plus the suite (D2) |
| Earlier fixes (B1, B2, B4, N-1, N-2…) | **Unchanged** | Range-diff `=`. The closure step is green in CI. |

## 3 · Findings

**BLOCKING:** none.

### NON-BLOCKING

| # | Finding | Fix | Owner |
|---|---|---|---|
| N-14 *(new)* | The request log's database lookups run on the **event loop** and wait for the storage lock. `describe()` calls `storage.blob_owners()` on every artifact fetch, and `get_review()`/`reviewed_mask()` for review-scoped routes, all synchronously inside the ASGI middleware. A commit holds the lock while it rebuilds and encodes the volume. D5: with the lock held for 1.5 s, a `case_get` returned in 0.0 s but an MRI artifact fetch took **1.4 s**. Under uvicorn the PNG bytes are already sent, but the event-loop thread stays blocked, so **every request stalls for as long as the commit runs**. Before this delta, MRI and GT fetches did not touch the database. This does not change byte counts or L4 itself, but avoid committing reviews while timing slice switches. | Move `describe` off the loop (`await anyio.to_thread.run_sync(...)`), or give the log its own read-only connection without the app lock, or keep reviewed-mask digests in memory at commit time | A3 / Nguyễn Gia Đức Trung |
| N-15 *(nit)* | `owners` counts the owners known at the time of the fetch. Predictions render on demand, so the first fetch of an empty slice saw 4 owners and later fetches 7. The summarizer does not depend on it. | Document it in the middleware docstring | A3 / Trung |
| Carried over | Unchanged and still non-blocking: R-2 (400/405/413 answer VALIDATION_ERROR at a non-422 status), R-4 (the CI closure step runs on a 3.9 host), R-5 (extras in `check_wheel_closure`), N-6, N-8, N-10, N-11, and N-13 (leader). | As in the earlier reports | As before |

## 4 · Verdict

**MERGE at `773c0ef`.** Every blocking finding from the first two passes (B1–B4, X1–X3) is resolved and verified by running it, not only by reading the code. CI is green on the merge with current main. Squash-merge only after #62 has passed its own QA and been merged. Otherwise #68's squash would also carry the contract v1.0 change and the V1 test fix.

For tonight: the deploy and the request-log capture are fit to use. Quote L4 from `summarize_request_log.py` as it stands at this head. Avoid review commits while timing slice switches (N-14).
