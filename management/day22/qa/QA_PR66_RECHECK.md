# QA re-check: PR #66 fix delta `2e4463d..654e3bc` · **MERGE (squash)** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, independent QA reviewer.** I am an LLM session (Claude) running under the team leader's account, not a second human. |
| Reviewed at | `654e3bcf507a62717e821ea3ffb85b337b8149f0` = `origin/spike-b/day22-real-mesh-frontier`. Two commits, linear on `2e4463d`, no rebase. `417a637` changes code only (harness and test); `654e3bc` changes evidence only (JSON, README, PROVENANCE). |
| Run window | 12:43–12:49 (+07). Own detached worktree; nothing committed, pushed or commented. Main checkout untouched. |
| Resources | No harness rerun. One single-process probe (`probe654.py`, about 10 s, well under 0.5 GB) that calls the 654e3bc functions in-process. Data read: `CASE_0059` (train) mask only. |
| Sample | The 395 L1 out-of-bound rays I localised on 2e4463d, all of them. This includes the 36 rays from the old ">4" bucket and the worked examples. Everything else is a code and JSON review. |

## Checks

| # | Check | Command / method | Result | Status |
|---|---|---|---|---|
| 0 | Tests | `test_real_mesh_frontier.py` · `conformance.py` · `py_compile` | **33 passed**; 33 points and 13 rays conform, 0 findings; compile exit 0 | PASS |
| 1a | B-1: bucket fix | `bucket()` source, test 6, probe | `bucket(0)` and `bucket(0.0)` return `"0"` | PASS |
| 1b | B-1: exact-walk depth and clearance | Code: `_truth_job` takes depth = max inside-EDT and clearance = min outside-EDT over the cells of `exact_walk`; no sampling remains. Probe via the harness's own `_init_worker` and `_truth_job`. | **All 36 rays that the old code filed under ">4" (sampled depth 0) now have exact depth in (0,1].** The worked examples keep their exact slices (75, 42, 63). The JSON's L1 no-hit depth is `{"(0,1]": 211}`, matching my earlier exact maximum EDT of 1.0 for all 211. No level has a no-hit deeper than 4 any more; L4's deepest bucket is (2,4] with 133 rays. | PASS |
| 1c | B-1: classification | `classify_out_of_bound` on the first-run interval [t_in, t_out]; probe uses brute-force L1 hits | Applied to my 395 rays, it gives **exactly 211 no-hit / 76 inflated / 16 local / 92 cross-structure**, the same as the committed JSON. | PASS |
| 2 | B-2: no per-data-file hash committed | `git grep 314dfd95 654e3bc` and a hash-field walk of the JSON | **Not present in any tracked file at 654e3bc.** The remaining hashes are the two manifests (themselves repo files), the five OBJs and the per-ray table, all derived outputs. `mask_file_hash` is now just a pointer to the sidecar. The sidecar `out_real/CASE_0059/data_file_hashes.json` is ignored (`.gitignore:103`). **Caveat:** `git log -S` shows the hash still sits in `2e4463d` on this branch (see note 1). | PASS |
| 3 | Counts unchanged | `cmp_json.py`: 346 fields compared, old JSON (`2e4463d`) against new (`654e3bc`) | **0 differences**, covering every B5 histogram, maximum, no-hit and verdict per cohort, incidence class and level, plus B9 navigation counts and histograms, march-reference scores, frontier rows, ray totals, all 5 OBJ SHA-256s and sizes, and the per-ray-table SHA-256 (`44f75549…`, unchanged, so every per-ray observation is identical). Truth vs march: 32,284 / 715 / 86, unchanged; the nearest-miss march check finds 0 of 300. Acceleration checks: 744 / 1,326 / 2,096 / 5,362 rays at L1–L4 (446 / 1,026 / 1,798 / 5,076 of them out of bound or background navigations), **0 mismatches**. Only the diagnostic clearance histograms moved, as intended (exact walk instead of sampling): for example L3 navigations (0,1] went from 55 to 56, and L4 (0,1] from 119 to 120. | PASS |
| 4 | Class split vs my 67/77/40 | probe cross-tab, my class → new class | later-run → cross-structure 77 · no-hit → no-hit 211 · my "same run (±1.6)" → local 16, inflated 38, cross-structure 13 · my "no run" → inflated 38, cross-structure 2. The 51 rays that moved out of my "same run" class hit 0.0–1.6 voxel outside the first run (median 1.16), inside my ±1.6 tolerance. No hit lies within 0.05 voxel of a class boundary, so the result is not sensitive to tolerance. **The difference is purely the boundary definition:** a strict first-run interval against my ±1.6 tolerance band. The README discloses it honestly, but slightly incompletely (note 3). | PASS |
| 5 | Absolute paths | Scan of the delta's added lines and of the 5 PR files at 654e3bc for drive letters, user paths, IPs and serials | None. The `D:\…` default is gone; the README uses the `<extracted LASC package>` placeholder; the JSON `command` is `… --workers 2`. With no data root set, the harness exits 1 with "set CARDIAC_DATA_ROOT or pass --data-root" before writing anything. | PASS |
| 6 | N-items | read | **N-1:** level 0 is stated to pass "by construction". **N-2:** the README says DR-008c = L0 only if B10 ≥ 20 FPS median and B11 PASS at 61,424 triangles, and that #44's PASS at 5,648 does not carry over. **N-3:** `min(4, cpu)`, memory documented, and the incident disclosed. **N-5/N-6:** docstrings accurate ("same walk, separate implementation"). **N-7, N-8:** done. Limits now say any simplifying decimator, quadric included, is expected to show this class of error and is untested. "No holes" is attributed to QA. | PASS |

## Notes (none blocking at 654e3bc)

1. **Merge by squash.** A merge commit would bring `2e4463d`, which carries `mask_file_sha256`, into main's history and defeat F5 on main. The hash stays visible in PR #66's commit list (`refs/pull/66`) whatever we do; the leader accepts that under F5 or escalates. *Owner: leader at merge.*
2. **Cross-PR hazard with the S-1 branch** (`origin/spike-b/day22-s1-device-session`). That branch carries pre-fix copies of all five #66 paths: the JSON computed at `ae247fa` (schema 1, **including `mask_file_sha256`**), the old README with the "holes" text, and its own harness variant (`6939244`). `git merge-tree` against 654e3bc reports add/add conflicts on these paths. Whichever merges second must take **654e3bc's versions**, or drop the paths from the S-1 PR; otherwise both the F5 hash and the wrong mechanism come back. The two JSONs carry identical OBJ hashes (L0 `870ca76d…`), consistent with "byte-identical to the S-1 APK", but I did not inspect the APK itself. *Owner: A4 / leader.*
3. **Wording nit** (README, "Where the decimated failures come from"). "Other boundaries between local and inflated" should read "a ±1.6-voxel tolerance around each run against the strict first-run interval". The difference is on both sides of the run: 38 of my local rays became inflated and 13 became cross-structure, and 2 of my no-run rays became cross-structure. *Owner: A4, optional.*
4. **Prose nit.** "No-hits at levels 1–2 … at most one voxel deep" is exact for L1 (211/211), but L2 has 4 of 589 in (1,2]. The table already says so. *Owner: A4, optional.*
5. **Suggestion.** Have the harness emit the odd-multiplicity edge count per level, so the "no holes" claim re-derives from the committed JSON instead of resting on QA's word. *Owner: A4, optional.*

## VERDICT

**MERGE at `654e3bc`, as a squash merge** (note 1); note 2 applies when the S-1 branch lands.
- B-1 and B-2 are fixed and verified.
- Every B5/B9 count is unchanged, down to the per-ray table hash.
- The new class split reproduces exactly from my independent localisation; it differs from my numbers only in where the class boundaries are drawn, and the README discloses this.
- No absolute paths remain.
- The conclusion stands: only L0 is within ±1, so DR-008c = L0 (61,424 triangles) only if B10 ≥ 20 FPS median and B11 PASS on the A17 at S-1.
