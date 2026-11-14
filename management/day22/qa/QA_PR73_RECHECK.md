# QA re-check: PR #73 at `582cf43` · verdict **READY AFTER FIXES**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

The remaining fixes are four lines of script text. There is no rebuild. If they are applied word for word, the package is **READY FOR SESSION** and needs no further QA round.

| Item | Value |
|---|---|
| Reviewer | CHAT E. **I am an LLM session (Claude) running under the team leader's account, not a second human reviewer.** |
| Target | Head **`582cf43`**. My worktree is detached there. The A4 worktree is also at `582cf43` on the branch, so Block A's branch check will pass. |
| Delta | `c8da2eb..582cf43` is **3 commits and 4 files**, not "only `S1_SESSION_SCRIPT.md`": `6939244` (`real_mesh_frontier.py --workers` default `min(4,cpu)` plus a note in #66's evidence README), `971f2ae` (new `s1_export_evidence.py`), `582cf43` (the script). |
| Session safety | The APK and every tool used during the session are byte-unchanged since `956ff63`: `s1_session.py`, `s1_collector.py`, `s1_extract.py`, `s1/`, `s1_app/`, `app/`, `capture_conditions.py`. |
| Run | 12:28–12:37 (+07). Single process; only git, gh and stdlib Python. |

## Checks

| Check | Result | Evidence |
|---|---|---|
| F1 · Block A (both windows) | **PASS, with R2 and R3** | Sets the location to `$WT`, checks the branch, defines `$ADB`/`$APK`/`$REC`/`$S1`, checks that each exists, and checks that `$S1` is outside `$WT`. |
| F1 · Block B (refuse existing `$S1`, start collector) | **PASS, with R2** | Both are present, but the refusal can be bypassed (R2). |
| F1 · Block C (derive `$SERIAL`) | **PASS, with R4** | `model:SM_A176B` combined with `\sdevice\s` excludes unauthorised and offline handsets and does not match the `device:` field. It requires exactly one match. |
| F1 · "repository root" defined, no absolute paths | **PASS** | The definition is at §0. A grep for drive paths, IPs and the serial in the script and the exporter finds nothing. |
| F2 · stop-rule table | **PASS** | Covers: build-record mismatch, wrong triangle count or slow load, a second ERROR, heat, USB, a dead collector, the 45-min limit, and "anything else → stop". |
| F2 · redo rule, noting times | **PASS** | "RUN SUITE again on the loaded level"; note the time of any re-open, relaunch or re-run. |
| N4 | **PARTIAL** | Never re-run `start`, use a new `$S1`, and the model check in Block C are all done. Not done: READY even when the conditions capture failed, and the refresh-rate setting. Both are acceptable. |
| N5 | **FAIL (R1)** | The new POST line produces a false STOP. The quick-check pattern is unchanged. |
| N6 | **PASS (4 of 4)** | Ignore the L1–L4 prompt; wait for the slice before the next tap; a background tap that changes the slice means the mesh was hit; the optional L2 block is removed. |
| Tag `s1-apk-956ff63` | **PASS** | Annotated (object `33259305…`, identical on the remote). It points at `956ff63`. The message records sha256 `212dd248…b989f978` and "built 12:06:14 +07". |
| PR #73 body | **PASS, with a note** | Details below. |

## BLOCKING (docs only)

**R1. The POST check produces a false STOP every time.**
- After `start`, the script says the app's bottom line "must show `POST ok ≥ 1 · POST fail 0`". It will show `POST ok 0`.
- `transport.posted` is a plain module object, not React state. Nothing re-renders the panel after the start record's POST until the operator taps something.
- The operator then lands on "anything else → STOP" before measuring anything.
- This was my N5 wording, and it was wrong.

Replace it with:
> After step a on **L0**, window 2: `(Invoke-RestMethod http://127.0.0.1:8766/health).records` must be **≥ 3**. If it is 0: run the `reverse` line again, tap **L0** again, check again; still 0 → STOP. (The app's `POST ok` line refreshes only when the screen changes.)

**R2. The STOP guards may not stop anything.**
- With Windows Terminal or right-click paste, PS 5.1 runs pasted lines one at a time. A top-level `throw` then stops only its own line.
- Block B would still create or reuse the folder and **start the collector, appending to an existing `$S1`**. That is exactly the case its guard exists for.
- Block C would still install on `$found[0]`.
- Block A would still print `OK` after a STOP.

Fix: make the first line of each of Blocks A, B and C `. {` and the last line `}`. The block then runs as one statement, a STOP aborts it, and the variables still persist.

**R3. The wrong APK can still pass as "True".**
- `s1_build\` holds three builds side by side: `114023`, `114210` and `120616`.
- `start` compares the installed APK with the `build_record.json` next to whichever APK was chosen.
- Add to Block A:
```powershell
if ((Get-FileHash $APK -Algorithm SHA256).Hash -ne "212dd248614e5131b2cdc39c6eb5196b0cb838570cf363da7fcf9509b989f978") { throw "STOP: not the session APK" }
```

**R4. The two windows can end up with different `$S1` folders.**
- `$S1` is typed into each window separately. A typo splits the evidence: the collector writes to X while `start`/`finish` write to Y.
- Add as the first line of Block C:
```powershell
if (-not (Test-Path "$S1\repository_commit.txt")) { throw "STOP: window 2 `$S1 is not the folder window 1 created" }
```

## NON-BLOCKING

- **#66's files are changed on #73's branch** (`6939244`: the worker default and #66's evidence README). The two PRs now diverge on those files. Tell #66's QA and owner, and reconcile at the post-session rebase.
- **`s1_export_evidence.py`** replaces the serial with `<A17_SERIAL>` and refuses to finish if it survives. It does not strip the absolute paths (`session_dir`, `per_pick_table.path`, `installed_apk.build_record`, `preflight.collector.file`), so **F4 stays open**, as agreed. F3 is unchanged.
- **Doc inconsistencies:**
  - §5 still says to redact the serial by hand; the exporter now does it.
  - §6's "Kept outside git" lists `s1_per_pick.csv`, but the exporter commits it. The file has no coordinates.
  - The quick-check error pattern still misses `s1_rn_webview_error`, `s1_rn_nav_error`, `webview_rejection` and `s1_nav_ack_timeout`.
  - The heat row gives no command. Suggest `& $ADB -s $SERIAL shell dumpsys thermalservice | Select-String "Thermal Status"`.
- **The `$S1` outside-repo check** only compares against `$WT` and is case-sensitive. That is fine for the suggested `...\s1_sessions\...` folder.
- **PR body:**
  - Nothing from the stray text is left: 0 lines unique to the 05:30:27Z revision, which was another agent's #65 mobile-shell description. It was replaced 48 s later, at 05:31:15Z.
  - The current body is A4's own revision. It adds the `$WT`, tag and branch-state rows and the F3/F4/N7/N8 to-do list.
  - It **dropped the "## Checks run" section** that the 05:11 version had. Please confirm that was intended.
  - The public edit history still shows the stray revision, and the 05:07 revision that contains the serial. The serial is already public on main.

## Verdict

**READY AFTER FIXES.**
- **R1 is required**: without it, setup ends in a false STOP.
- **R2–R4** are one line each. They close the remaining ways to measure the wrong APK, or to split or contaminate the session folder.

Applied word for word, these are docs-only changes and the APK stays the verified `956ff63` build. The package is then **READY FOR SESSION** without another review round. **F3 and F4 stay open** until before extraction.

Nothing in the repository was modified.
