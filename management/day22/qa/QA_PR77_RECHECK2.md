# QA delta re-check: PR #77 `1332614..458219d` · **MERGE AFTER GATE-MOB-01** · L4 tooling **READY** for tonight

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

*Reviewer: CHAT E, an LLM session (Claude) running under the team leader's account, not a second human reviewer. Read-only. One process at a time. node_modules reused (package files unchanged), no `npm ci`, no Gradle, no expo export. Run at 15:09–15:15.*

| Check | Result | Evidence |
|---|---|---|
| Delta | **2 commits, fast-forward on `1332614`** | `4565bed` (S1 script) and `458219d` (`CaseExplorerScreen.js` + `smoke.mjs`) |
| **R-1** rerun procedure | **PASS** | New §2b: reruns are allowed only for a disturbed run or a hang (no "L4 finished" about 2 min after the long-press, controls still locked), decided before the report and never because of a FAIL. Steps: Ctrl+C, rename to `attempt1`, `logcat -d` backup, `force-stop`, `logcat -c`, capture to `attempt2`, redo §2.1–2.9, judge attempt 2 only. If attempt 2 also fails to finish → NOT MEASURED. The budget row points to §2b; §4 names the attempt-2 file. All valid PS 5.1. |
| **R-2** absolute path in preflight output | **PASS** | `node --no-warnings` for the preflight and l4-report, and "paste only `preflight:` … `PREFLIGHT`". Re-ran the preflight probe against a local 1.1.0 no-run mock with `--no-warnings`: no warning, no absolute path, `PREFLIGHT PASS`, address not printed. |
| **R-3** stale step timer | **PASS** | The timer now matches its own waiter by identity, and resolving the waiter clears the timer (`CaseExplorerScreen.js:506-522`). `qa_probe3.mjs` in **collide mode now finishes**: 30/30 steps, "L4 finished", 0 `CMW_STEP_TIMEOUT`, l4-report **PASS**. Control run: PASS. |
| T1 detects the bug | **Confirmed** | Running the new smoke with the *old* `stepTo` (swapped in my scratch copy, then restored and hash-checked) makes **T1 FAIL: 16 steps armed, 1 timeout, FAIL**. T1 is the stronger test: every earlier timer fires each time a step arms its own. |
| **N-a** run-line wording | **PASS** | Render probe: an INFERENCE_REVIEW case with no run reads "No analysis run for this case - **MRI only**"; an EVALUATION case with no run still reads "MRI and ground truth only". |
| Tests | **PASS** | Unit 147/147; render **51/51** (T1 included; logic only); app/core 10/10; V1 model 88/88. Re-run probes for B-3 and N-1 still behave. |
| `gh pr checks 77` on `458219d` | **PASS** | 10/10 |
| Docs vs tonight's APK (`0bfaba3`) | **Consistent** | Between `0bfaba3` and `458219d`, the only app-bundled change is `CaseExplorerScreen.js` (R-3 + N-a); `mobile/scripts` are identical. So the APK does **not** have R-3 and §2b is the mitigation; the hang it can cause only ever produces a FAIL. Line 100 still names the `0bfaba3` APK. The §2.5 run-line text is the same in the APK and at head for CASE_0061, which is EVALUATION. |
| Hygiene | **PASS** | 120 added lines and both commit messages: no IP, user path, serial, URL hash or URL other than `backend.invalid`. |

**New findings (all non-blocking):**
1. **Say where R-3 is fixed.** §2b calls the hang "known, rare". It could add "fixed in `458219d`, not in tonight's APK `0bfaba3`" so the next session knows whether §2b still applies.
2. **A slow step is not a volume transfer.** A genuine slow step (> 6 s) still lets the run finish with a `CMW_STEP_TIMEOUT`. §2b correctly forbids a rerun, so the report says L4 FAIL on **R6**. That means the measurement was disturbed, not that a volume moved. When the gate is decided, the notes should name the failing rule, not just the verdict word.
3. **Main has moved.** `origin/main` is now `985c9c3` (#75 and #63 merged after this branch's base `3647f2e`), and GitHub reports mergeability as UNKNOWN. A read-only `git merge-tree` shows one file changed on both sides, `.github/workflows/guardrails.yml`, in separate regions, with **no conflict markers**. Re-run the four suites on the merge result when merging, because the V4 model (#63) is now on main.

**Verdict:** R-1, R-2, R-3 and N-a are all verified, and nothing is blocking. **MERGE AFTER GATE-MOB-01.** The L4 tooling is **READY** for 19:00 with the `0bfaba3` APK, with §2b covering its known hang.

Scratch: `…\scratchpad\qa77\repo4`, with node_modules moved there. Nothing was deleted and the main checkout was not touched.
