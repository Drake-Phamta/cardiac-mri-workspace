# QA re-check 2: PR #73 post-session tooling at `01df171` · verdict **NOT READY FOR EXTRACTION**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

It becomes ready after fixes X1–X3. Those touch only the extractor and the exporter, about 20 lines, with no APK or session-tool change. X4 must be fixed before the evidence commit.

| Item | Value |
|---|---|
| Reviewer | CHAT E. **I am an LLM session (Claude) running under the team leader's account, not a second human reviewer.** |
| Target | Head **`01df171`**, whose parent is `2b7dcab`. My worktree is detached there. Main is now `dbee96d`; #66 is on main as squash `e5ccd38`. |
| Run | 12:50–12:58 (+07). Single process at a time, all well under 1 GB. No device, no dataset, no Gradle. The largest run was a synthetic numpy test. |

## 1. Checks

| Check | Result | Evidence |
|---|---|---|
| Scope of `01df171` | **PASS** | Changes `S1_SESSION_SCRIPT.md`, `s1_extract.py` and `s1_export_evidence.py` only. In the script, only the Rules section, §5 and §6 changed; §0–§4, the operator path, are unchanged. The APK sources (`s1/`, `s1_app/`, `app/`), `s1_session.py`, `s1_collector.py` and `capture_conditions.py` are byte-identical to `956ff63`. The tag is still on `956ff63`. |
| `2b7dcab` (operator fixes R1–R4) | **PASS** | Applied word for word: `. { }` around the three blocks, the APK sha256 check, the `$S1` check in window 2, and the health check after step a. The thermal command and the full error pattern were also added. |
| F3 · `--self-test` | **PASS** | `s1_extract self-test: 13 passed`. |
| F3 · my replay against the new code | **PASS** | Re-open case (load 1 `L0-1` navigates, load 2 `L0-1` hits nothing): 2 picks kept (old code kept 1), B7 1/1, B9 0, so the false B7/B9 FAILs are gone. A repeat inside one load refuses. A wrong display in load 2 is a B7 failure in that segment only. |
| F3 · one primary path, the other only a cross-check | **PASS** | Nothing is double-counted. |
| F3 · transport faults the script allows (USB reconnect) | **FAIL** (X1, X2) | Details under X1 and X2. |
| F3 · `--exclude-suite` recorded | **PASS** (one note) | Recorded in `excluded_suites` and per run. An unknown `<segment>.<suite>` is accepted silently. |
| F4 · sanitizer, end to end on a synthetic session (fake serial) | **PASS** | Exit 0. The serial is redacted in notes, `adb_reverse` and conditions. `collector.file`, `device_path` and `build_record` become basenames. `session_dir` becomes its folder name. `installed_apk` keeps 3 keys. Only frame-probe records are exported; the pick record with coordinates is left out. |
| F4 · leak gate, planted leaks | **PASS except the serial** (X4) | Drive path in JSON → exit 1; in Markdown → 1. UNC path plain → 1; JSON-escaped → 1. `/data/app/` → 1. Serial with `--check` alone → **0**; with `--check --serial` → 1. |
| N7 · rules wording | **PASS** | B6/B7/B9 judged at the chosen level; B12 named; "fastest" is the minimum over complete valid runs of each run's nearest-rank median; ≥ 3 complete valid runs; explicit exclusions only. Consistent with override §4 and TASK.md, and committed at 12:49, before the session. |
| N8 · PROVENANCE generated | **PASS except X3** | Phạm Tuấn Anh is operator and Vũ Hùng Anh is owner. Nominal case: DR-008c = **L0**, even though L1 and L4 had higher FPS; they are not eligible on B5. L0 B10 FAIL gives `NEGATIVE_RESULT`, which is correct. L0 with only 2 valid runs also gives `NEGATIVE_RESULT`, which is **wrong** (X3). |
| #66 inputs on the branch vs main `e5ccd38` | **PASS** (provenance note) | The branch still carries the pre-squash copy of #66's files. For each level, B5 verdicts and OBJ hashes are identical, and equal to the APK's. `load_mask` is identical. `exact_first_voxel` was refactored on main (`exact_walk`); on 30,000 synthetic rays, including edge and corner ties, **0 differences**. The results therefore do not depend on which copy is used. |

## 2. Findings

### BLOCKING before extraction

**X1. `read_logcat` uses `logcat_stream.txt` whenever it has any tagged line.**
- After a USB disconnect, the stream stops but `logcat_dump.txt` is complete.
- Replay: it read 2 records from the cut stream while the dump had 6.
- `s1_session.finish` already picks the longer source. The extractor must do the same, or merge the two.
- Owner: **A4**.

**X2. The repeat check refuses on both evidence paths, before the primary is chosen.**
- If one HTTP POST of an `s1_rn_open_level` (or an `s1_suite_start`) is lost during a reconnect, the **whole extraction refuses**, even though logcat is complete. Replay confirmed this.
- Fix: refuse only on the chosen primary, and report the secondary's repeats in `evidence_paths`.
- Also prefer logcat as primary when its keyed count is ≥ HTTP's. Logcat preserves emission order. In my replay, HTTP records reordered at a level boundary gave a false B7 FAIL (cross-check showed 1/1 only-in-primary/only-in-secondary). This is low probability, but the logcat preference removes it.
- Owner: **A4**.

**X3. An L0 that was not measured is reported as `NEGATIVE_RESULT`.**
- If L0 has fewer than 3 complete valid runs (an excluded suite never re-run, or an early stop), PROVENANCE says "No level qualifies … `NEGATIVE_RESULT` — escalate".
- The rules reserve `NEGATIVE_RESULT` for L0 *failing* B10 or B11. This line feeds the Day 23 ADR decision.
- Fix: when a B5-eligible level is NOT MEASURED and no level qualifies, write "DR-008c NOT DETERMINED — L0 NOT MEASURED (n of 3 valid runs); re-measure".
- Owner: **A4**.

### BLOCKING before the evidence commit (does not block extraction)

**X4. The documented pre-commit gate does not look for the serial.**
- §5's `--check <folder>` returns exit 0 with the serial planted in a file.
- Only `--check --serial <serial>` catches it. The export run itself does check the serial.
- Fix the script line to:
```powershell
--check <folder> --serial ((Get-Content "$S1\session_state.json" -Raw | ConvertFrom-Json).preflight.serial)
```
  or let `--check` take `--session`.
- Owner: **A4**.

### NON-BLOCKING

- **Exclusions:** refuse an unknown `--exclude-suite` target. Segment open times are printed only from HTTP (`opened None` when logcat is primary); parse the logcat timestamps.
- **Duplicate display:** a duplicate display inside one load (for example `onLoad` firing twice) now refuses the whole extraction. Consider reporting it as a B7 anomaly instead.
- **Embedded paths:** the sanitizer only turns into basenames the strings that *start* with a path. Paths inside text (error messages, operator notes) are left to the gate, which then fails the export. That is the safe direction, but needs a manual edit.
- **Provenance:** rebase #73 onto main before extraction, or record the extractor's commit in `s1_results.json`, which currently records none. The evidence names `real_mesh_frontier.exact_first_voxel`, and a reader will assume main's version.
- **Self-test coverage:** it does not exercise `choose_primary`, `read_logcat`, the exclusion mapping or the exporter's DR-008c. Add the X1–X3 cases.

## 3. Verdict

**NOT READY FOR EXTRACTION at `01df171`.**

The normal path and the re-open/relaunch path are verified correct: self-test 13/13, replay clean, truth function equivalent to main's. **X1–X3** are needed for the USB-reconnect path the script allows, and for the "L0 not measured" case. After those fixes the tooling is **READY FOR EXTRACTION**. **X4** is needed before `git add`.

For tonight's decision: if the operator notes no USB disconnect, POST fail stays 0, and L0 ends with ≥ 3 valid runs, then X1–X3 change no number. They are still cheap, and there are about 7 hours left before 20:30.

The repository was not modified. My scratch scripts are in the session scratchpad under `qa73\`.
