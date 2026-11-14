# QA re-check 3: PR #73 extraction tooling at `259b1e7` · verdict **READY FOR EXTRACTION**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | CHAT E. **I am an LLM session (Claude) running under the team leader's account, not a second human reviewer.** |
| Target | Head **`259b1e7`**, one commit on `01df171`. My worktree is detached there. |
| Run | 14:24–14:27 (+07). Single process at a time, all well under 1 GB. No device, no dataset. |

## 1. Checks

| Check | Result | Evidence |
|---|---|---|
| Scope | **PASS** | The commit touches only `s1_extract.py`, `s1_export_evidence.py` and the one §5 `--check` line of the script. These are byte-identical to `956ff63`: the APK sources (`s1/`, `s1_app/`, `app/`), `s1_session.py`, `s1_collector.py` and `capture_conditions.py`. The operator sections §0–§4 are unchanged. The tag `s1-apk-956ff63` is still on `956ff63`. |
| Self-test | **PASS** | `s1_extract self-test: 30 passed`. |
| X1 · cut logcat stream | **PASS** | Stream with 2 lines, dump with 9 records: the dump is read. `evidence_paths` records both line counts and the lines only the other source has. Segment open times come from logcat's device clock. A tie goes to the stream. |
| X2 · lost HTTP `open_level`, logcat complete | **PASS** | Logcat is primary. Picks 3, B7 2/2, B9 0. HTTP's repeat is reported (1), not refused. |
| X2 · HTTP order swapped at a boundary | **PASS** | Logcat is primary, so there is no false B7. The cross-check shows 1/1 differences. |
| X2 · genuine repeat inside one load | **PASS** | Refused, on the primary. |
| F3 · re-open case, both paths complete | **PASS** | Tie goes to logcat as primary. All picks kept, B7 2/2, B9 0. |
| X3 · DR-008c outcomes, end to end through the exporter (synthetic, fake serial) | **PASS** | Nominal: **L0**, even though L1 and L4 are faster (they are not B5-eligible). L0 B10 FAIL: `NEGATIVE_RESULT`. L0 B11 FAIL: `NEGATIVE_RESULT`. **L0 with 2 valid runs: "DR-008c NOT DETERMINED — L0 NOT MEASURED (2 of 3 valid runs); re-measure"**. L0 absent: NOT DETERMINED (0 of 3). Both scripts share one function, `dr008c_decision()`. |
| X4 · leak gate, planted serial | **PASS** | `--check` with no serial source: **exit 2**. `--check --session`: clean export 0; planted serial 1. `--serial`: 1. |
| X4 · leak gate, other plants | **PASS** | Drive path (JSON and Markdown), UNC path (plain and JSON-escaped) and `/data/app/` each give 1 with `--session` and with `--serial`. §5 now reads `--check <folder> --session $S1`. |
| Cheap items | **PASS** | An unknown or malformed `--exclude-suite` refuses (3 cases in the self-test). `extractor_commit` and `extractor_tree_clean` are written. A duplicate display counts as a B7 anomaly, and as a failure only if its slice differs. |

## 2. Findings

**No BLOCKING findings.**

NON-BLOCKING residuals, all owned by **A4**:
1. **Two double faults with known outcomes.**
   - Logcat entirely missing *and* HTTP order swapped at a page-load boundary: a false B7 FAIL. There is no second path to cross-check against.
   - A lost HTTP `open_level` *and* a shorter logcat: refusal on the primary. That is the strict behaviour by design.
   
   Both are very unlikely tonight.
2. **The published `frame_probes.jsonl` is always copied from the HTTP collector,** even when logcat is primary, which it is on a tie. If HTTP lost a probe, the published raw timings would lack a run the results used. Export from the primary path, or warn when the two counts differ.
3. **`extractor_tree_clean` only checks `spikes/spike_b_3d/harness`.** `real_mesh_frontier` also imports `mesh/build_mesh.py`. The truth and OBJ functions the extraction uses are in `harness/`, so the numbers are not affected; widen the check anyway.
4. **The branch still carries the pre-squash copy of #66's files.** As verified at the last check, the B5 verdicts and OBJ hashes equal main's, and the truth function is equivalent. With `extractor_commit` now recorded, this is a provenance note only. Rebase after the session, as planned.

## 3. Verdict

**READY FOR EXTRACTION at `259b1e7`.** X1–X4 are fixed and verified by replay. The APK, the session tools and the operator path are unchanged since the session-ready state.

The repository was not modified. My scratch scripts are in the session scratchpad under `qa73\`.
