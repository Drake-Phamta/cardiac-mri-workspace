# QA PR #95 `tools/e2e-hero-flow` (Day 39)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

| Field | Value |
|---|---|
| PR | #95 tools(e2e): API-level hero-flow proof H1-H10 |
| Head SHA | `e8734dd94e8be82d2d433e0478801900f953c6c4` |
| Files | `tools/e2e/hero_flow_api.py` (1169 lines), `tools/e2e/README.md` (only these two) |
| Reviewed | 2026-10-18 |
| **Verdict** | **MERGE** (no blocking items; 7 non-blocking) |

## Checks

| Check | Result |
|---|---|
| `gh pr checks 95` | all 11 pass (backend tests Python 3.9, contract tests, mobile render smoke, no dataset/checkpoint/secret bytes, frozen specs 19/19, ...) |
| Python 3.9 syntax | `ast.parse(..., feature_version=(3,9))` OK. No `match`, no `X \| Y` annotations, no `zip(strict=)`. Runtime executed only on 3.12.6 (no 3.9 interpreter used by me) |
| Stdlib only | imports: argparse, base64, hashlib, json, struct, sys, time, urllib.{error,parse,request}, zlib. Nothing third party |
| No IPs / paths / per-case values committed | grep: only `127.0.0.1` (loopback, required by the write gate and examples). No drive paths, no user paths, no remote addresses (README uses `<overlay-address>`). Case ids appear only as identifiers/examples (`CASE_0001` = INT-12 case, `CASE_0029`/`CASE_0042` in usage examples); no metric value is committed. README states the console and `--json-out` contain per-case values and must stay outside git |
| Write gating | Only H8 and H9 issue POST/PUT/PATCH (`hero_flow_api.py:830-888`, `920-979`). `writes_allowed()` (`:799-805`) returns False for `--no-writes`, and for any host other than `127.0.0.1` / `localhost` / `::1` unless `--allow-remote-writes`. `urlparse().hostname` is used, so `127.0.0.1.evil.com` or `user@host` tricks do not pass. The gate is evaluated first in H8 (`:808-810`) and H9 skips when H8 left no state. The banner (`:1140`) prints the write mode. I did not exercise H8/H9 (instructed no writes) |
| Reproduction | Backend started from this checkout (`backend.app.main:app`) on `127.0.0.1:8765` with `CARDIAC_BACKEND_DATA=<data>\backend_d39` (read-only use; the backend created `var/` there, acceptable). Command: `hero_flow_api.py --base-url http://127.0.0.1:8765 --case CASE_0042 --no-writes --json-out <scratchpad>\d39\qa\e2e_qa_nowrites.json`. Exit 0, 57 requests, 2.0 s. Backend process (pid I started) stopped; port 8765 no longer listening |

### Reproduced result table (`--no-writes`, CASE_0042): PASS=18 FAIL=0 SKIP=5

| Step | Result | Step | Result |
|---|---|---|---|
| H0 | PASS | H5 | PASS |
| H1.1 | PASS | H6.g | PASS |
| H1.2 | PASS | H6 | SKIP (V2/SCR-05 not built, no RECONSTRUCTION_3D artifact) |
| H1.3 | PASS | H7 | SKIP (needs mesh + DR-005 error-region map) |
| H1.4 | PASS | H8 | SKIP (`--no-writes given`) |
| H1.5 | PASS | H9 | SKIP (reason text: "H8 did not create a working mask", see NB-1) |
| H2 | PASS | H10.1 | PASS |
| H3.1 | PASS | H10.2 | PASS |
| H3.2 | PASS | H10.3 | SKIP (UNet runs not trained yet) |
| H3.3 | PASS | INT-12 | PASS |
| H3.4 | PASS | | |
| H4.1 | PASS | | |
| H4.2 | PASS | | |

The PR title's 20 PASS / 0 FAIL / 3 SKIP is the with-writes run (H8, H9 PASS); I could not reproduce that part under the read-only instruction (it would write to the backend DB). The no-writes counts are consistent with it (H8, H9 PASS -> SKIP gives 18/0/5).

### Does each step assert what its name claims?
Read every step against its name; the run output shows the evidence lines match the data (e.g. the experiment means and CIs equal those in PR #96, the INT-12 row is WITHHELD with `metric_values: null`).

- H0, H1.1-H1.5, H2, H3.x, H4.x: real assertions on status, literals, counts, ordering (DR-010 order recomputed client-side), run-level metrics equal to `experiment_cases` row, SHA-256 of fetched bytes equals API checksum and ETag. Not vacuous.
- H5: FP, FN and Dice recomputed from the two decoded PNG masks and compared with the API (`:742-761`); `analysis_slice_error` 404 is asserted as the documented `NO_ERROR_ARTIFACT`, not silently accepted.
- H6.g: both reconstruction endpoints must answer `ARTIFACT_NOT_FOUND` when no mesh is listed (a real guard). H6/H7 are unconditional SKIP with a stated reason (not counted as PASS).
- H10.1: two `COMPARABLE` pairs with `n == expect_n`; delta is computed client-side from the two summaries (the API has no delta field), not compared with an API value. Acceptable.
- H10.2: 200 `comparable=false`, reason names the variant mismatch, no single `prediction_variant`. Real.
- INT-12: every GT-dependent endpoint must answer 404 `GROUND_TRUTH_UNAVAILABLE`, prediction still 200, absent from outlier lists. Real.
- H8, H9 (read, not run): stale write -> `STALE_REVISION`, geometry claim -> `GEOMETRY_MISMATCH`, new immutable version, only the edited pixel differs, raw prediction checksum unchanged, `INVALID_REVIEW_TRANSITION`, empty second commit refused. Real assertions.
- SKIP discipline: every SKIP carries a reason; a failing/crashing step is FAIL (exception recorded); exit code 1 on any FAIL, 2 on runner crash.

## BLOCKING
None.

## NON-BLOCKING
1. `tools/e2e/hero_flow_api.py:914` H9 skip reason is "H8 did not create a working mask" even when H8 was skipped by `--no-writes` or by the remote-host gate (observed in the run above). Fix: have H8 store its skip reason in `st` (e.g. `st["h8_skip"] = why`) and let H9 repeat it.
2. `:465` `r.get("analysis_run_id") in (None,) or isinstance(r.get("analysis_run_id"), str)` is near-vacuous (accepts None or any str). Replace with an assertion that WITHHELD rows have no usable run id, or drop it.
3. `:1041-1048` H10.3: if a UNet experiment is served but no DINOv2 experiment has the same fraction and variant, `same` is empty and the step ends PASS having compared nothing. Add `c.ok(compared > 0, ...)` or SKIP with a reason.
4. `:446` (and `:1032`, `:1037`): `requires=["metrics"]` is always satisfied because `st["metrics"]` is set to `{}` at the top of H1.4 (`:399`), so the dependency never skips. Use a non-empty check or set the key only on success.
5. `:422` the variant-vs-`experiment_list` comparison defaults to itself when the experiment is missing from `experiment_rows` (`.get(e, d.get(...))`), which makes it vacuous in that case. Minor.
6. `:694`, `:704` evidence strings state "sha256 of fetched bytes == API checksum" / "verified" unconditionally; a mismatch is still reported as a `!` problem and FAIL, but the evidence line then reads as a pass. Print the comparison result instead.
7. `--experiments` (`:1128`, `nargs="*"`) accepts an empty list, which would make H1.2-H1.5 loops vacuous. Use `nargs="+"`. Also `README.md:11` uses `CASE_0029` as the example demo case (it is the worst EXP-D-100 outlier on the holdout); harmless, but a neutral placeholder (`<case id>`) would keep per-case information out of the repo text.
