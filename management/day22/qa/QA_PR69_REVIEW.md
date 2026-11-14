# QA-069 · PR #69 V3 screens (SCR-01 Study Overview, SCR-07 Experiment Comparison) · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. An LLM red-team session (Claude Code, Claude Opus 5.5) run under the leader's account. **Not a second human reviewer.** This is the independent QA pass that `RECOVERY_OVERRIDE_DAY22.md` §2 requires. |
| **Target** | PR #69, `origin/feat/day22-v3-screens`, head `57acfee808eac6ea075f47f52aa5fab2c89ef705`. The head was unchanged on the remote at the end of the review. GitHub reports OPEN, MERGEABLE / CLEAN, with no review and no label. |
| **Stack** | The stack is as described: `d6441bc` (base) → `c893b8f` (merge of #77 at `4f46b37`) → `b2a1254` → `2a5d046` → `57acfee`. `c893b8f` is a normal merge: its tree `e57968b` is identical to a fresh `merge-tree` of `d6441bc` + `4f46b37`. |
| **Review range** | `c893b8f..57acfee`: 11 files, +1538/−49. All of them are in `mobile/src/verticals/v3/`, `mobile/test/v3_screens.test.mjs`, `mobile/test/render/{smoke.mjs,mocks/*}` and `app/verticals/v3_study_and_compare/README.md`. |
| **Baseline** | `origin/main` = `be86cb1` at both start and end. |
| **Rules applied** | DR-010 (the client never ranks) · `11` §6 (a variant is never defaulted or relabelled) · INT-12 · `10` SCR-01/SCR-07 and the §8 states · #61 QA B-1 to B-4 · the override's merge rule (QA plus green CI) |
| **Method** | All work ran in a detached worktree `<scratch>/qa69_wt`. `node_modules` came through a non-destructive junction to `<scratch>/qa77/repo4/mobile/node_modules`; no `npm ci` was run. `git fetch origin --prune` reported no change. The worktree was checked out at `2a5d046` for the crash repro and then returned to `57acfee`. Three mutations were made and each was reverted with `git checkout --`; the worktree ended clean at `57acfee`. Nothing was committed, pushed, commented, labelled or deleted. The main checkout was untouched: still `main` at `c7a37e0`, with only the pre-existing `?? .claude/`. Probes are `<scratch>/qa69_probe.mjs`, `qa69_render_probe.mjs`, `qa69_codes.mjs` and `qa69_export_guard.ps1`; logs are `<scratch>/qa69_*.txt`. |

> **VERDICT: MERGE AFTER FIXES.** Tests, CI, the SCR-01 crash fix, the registry, the states, the bundle export and merge mechanics all hold. **One blocking finding (B-1):** SCR-07's per-case table prints values from a cell whose variant the model refused, and calls them "plotted". The fix is small and lives in `v3View.caseTable` plus one test. After a delta QA of that fix, merge #69 right after #77 and GATE-MOB-01.

---

## 1 · Commands run

| # | Command (from `<repo>` or `<scratch>/qa69_wt`) | Purpose |
|---|---|---|
| R1 | `git rev-parse` of the head, main and the V1 branch · `git log origin/main..head` · `git merge-tree --write-tree d6441bc 4f46b37` compared with `c893b8f^{tree}` · `git diff --stat/--name-only c893b8f 57acfee` | Resolve refs, confirm the stack and the scope, and rule out an evil merge |
| R2 | `python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json` | Generate the fixture bundle (gitignored) |
| R3 | In `mobile/`: `node --no-warnings --test --test-concurrency=1 test/*.test.mjs` · `node --no-warnings --import ./test/render/hooks.mjs test/render/smoke.mjs` | Mobile suite and render smoke |
| R4 | `node app/core/tests/run_all.mjs` · `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` · `gh pr checks 69` · `gh run view 36837205122` | Core suite, V3 model suite, CI |
| R5 | `node qa69_probe.mjs <wt>` · `node --import <wt>/mobile/test/render/hooks.mjs qa69_render_probe.mjs <wt>` | Model-to-screen probes: crash, variant, an INT-12 sweep, states. These run at the logic level and as real renders. |
| R6 | The same probes and V3S11 at `2a5d046`. V3S11 and the test-only mocks were taken from `57acfee` and then reverted. | Reproduce the SCR-01 crash |
| R7 | Three mutations of `v3View.mjs`, each followed by R3 | Test strength |
| R8 | `qa69_export_guard.ps1`: `node scripts/prepare.mjs`, then `expo export --platform android --max-workers 1 --output-dir <scratch>/qa69_export`, with a commit-memory watchdog | Bundle compiles |
| R9 | `git merge-tree --write-tree --name-only` of the head with `origin/main`, and with `origin/feat/day22-v1-case-explorer-screens` | Merge mechanics |
| R10 | Scan of the 1,420 added lines and the 3 commit messages for paths, IPs, URLs, hosts, e-mails, secrets, hashes and high-precision numbers | Publication hygiene |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Mobile `node --test` | **PASS** | 158/158, 0 fail, 3.7 s |
| 1b | Render smoke | **PASS** | `RENDER SMOKE PASS - 59 checks`. V3R1–V3R3 are ok and E1 (no `console.error`) holds. |
| 1c | `app/core` and the V3 model | **PASS** | `ALL PASS — 10/10` · `PASS V3 study and compare — 155/155` |
| 1d | CI | **PASS** | 10/10 green, run `36837205122` on `pull_request` with `headSha 57acfee…`. The mobile job runs `node --test mobile/test/*.test.mjs`, which includes `v3_screens`. CI does **not** run the render smoke (N-6). |
| 2a | No ranking or sorting on the phone (DR-010) | **PASS** | `mobile/src/verticals/v3/` has 0 hits for `.sort(`, `toSorted`, `.reverse(`, `localeCompare` or `Math.max/min`. The two "rank" hits are a label and the server's rank used as a React key. Outliers are shown "in the order the server sent". V3S9 enforces this. |
| 2b | No value on FAILED / EXCLUDED / WITHHELD rows (B-1) | **PASS** | `valueText` comes from the model's `row.value`, which is null off SUCCEEDED rows. V3S6 and V3S10 cover it, and mutation M1 was killed. |
| 2c | Outlier refusals in words (B-2, B-4) | **PASS** | All 18 V3 model reason codes have words (probe). V3S10 covers the pinned version and a selection that names an ineligible case ("…the whole selection is refused (server sent "CASE_0102")"). |
| 2d | Comparisons respect the variant (B-3) | **PASS** | RQ-A-100 reads "undecided - treated as not comparable" with its reason. RQ-B keeps its verdict, and its difference reads "no difference shown: …withheld". V3S3 and V3S11 cover it, and M3 was killed. |
| 2e | Per-case values carry their variant (`11` §6) | **FAIL** | **B-1.** A refused cell's case table prints the values of the other variant. |
| 2f | INT-12: CASE_0001 never shows a number | **PASS** | The sweep covered SCR-01 (generated list and all seven listed) and SCR-07 (matrix generated, matrix with all seven, explicit with all seven), for every metric × statistic × selected cell, plus the details of 240 strip points. 687 strings name CASE_0001 and only 2 are distinct: `CASE_0001` and `open CASE_0001 (run RUN_0001, variant RAW)`. None has a digit outside an id. Strip points belong to CASE_0002–0005 only. |
| 2g | Every tap opens SCR-03 with case, run and variant, or is disabled with its reason | **PASS** (N-6 a11y) | Outlier rows, case rows and strip details all go through `routeForIntent` to SCR-03 `{caseId, runId, variant, experimentId}`, which `validateRoute` accepts (V3S6–V3S8). V3R3 renders a tapped dot, which pushes `SCR-03 {CASE_0002, RUN_0002, RAW, EXP-U-100}`. A disabled `LinkButton` keeps its label and shows the reason, and a tap shows "Cannot open: <reason>". SCR-03 honours the passed `runId` and `variant` (`CaseExplorerScreen`). |
| 3 | SCR-01 crash fixed at `57acfee`, without swallowing the error | **PASS** | **At `2a5d046`:** the probe throws `TypeError: Cannot read properties of undefined (reading 'mayLabelFair')` in `comparisonRow` (`v3View.mjs:178`) once the server lists all seven experiments. V3S11 fails with the same error. Rendered through `NavigatorView`, SCR-01 (the **root** screen) is replaced by the shell's crash panel, logging `CMW_SCREEN_CRASH {"screenId":"SCR-01",…mayLabelFair…}`. **At `57acfee`:** V3S11 passes, and the render shows six headline verdicts with 0 crash lines and 0 `console.error`. **The fix adds no `try/catch`:** it is three shape readers (`verdictOf`, `fairOf`, `reasonOf`). An unknown shape degrades to the conservative "undecided – treated as not comparable" and "not fair". The only catch in the folder is the pre-existing `useSnapshot`, which turns a model rejection into a visible FATAL_INVALID with the message and BACK. |
| 4a | Reached through the registry and navigator; required params enforced | **PASS** | `registry.js`, `screens.mjs` and `navigator.mjs` are unchanged. SCR-01 is the root and the Study tab; SCR-07 is the Experiments tab; both have `required: []`. SCR-03 requires `caseId`; the model's intent also requires run and variant. V3R1 and V3R2 render through `NavigatorView`, and every V3 route is checked with `validateRoute`. |
| 4b | No edit outside the V3 folder | **PASS** | The range touches only the 11 files above. There is no change to `package.json`, the lockfile, `app.json`, the registry or nav. |
| 4c | Mocks only add stand-ins | **PASS** | The mocks add `Pressable`, `Circle`, `G`, and `Text` exported as host `'SvgText'`. No existing export changed, and no existing check reads SVG text (see N-6). |
| 5 | States | **PASS** (N-2) | **Loading:** the first frame shows "Loading the study overview…", and both models are LOADING synchronously after `open()`. **Empty:** SCR-01 says "the server lists no experiment yet" and "no listed experiment, so no DR-010 selection to show", with N null rather than 0. SCR-07 shows EMPTY_UNAVAILABLE `NO_EXPERIMENTS_LISTED` with Refresh. With no case rows, both the table and the strip note say "no per-case result yet". **Error:** study `error_case` shows "Unavailable · The requested artifact does not exist… · Refresh". **Fixture badge:** V3R1 and V3R2 pass. |
| 6 | Bundle compiles (guarded) | **PASS** | **Gate:** commit limit 44.79 GB with 5.80–5.94 GB free (above 5 GB). **Run:** `EXPO_NO_TELEMETRY=1`, TEMP/TMP set to `<scratch>/qa69_tmp`, 1 worker. It took 61.4 s; the lowest free commit was **4.93 GB** (the 2 GB stop line was never approached) and 5.78 GB was free at the end. **Output:** `Android Bundled 29506ms index.js (781 modules)`, one 2.1 MB Hermes bundle, and the V3 strings are present in the bytecode. **Repo:** no tracked file changed; only ignored outputs appeared in the QA worktree. |
| 7 | Test strength | **FAIL** (one survivor) | **M1** (a WITHHELD row shows `fmt(0)`) was killed by V3S6. **M3** (the B-3 "withheld" difference dropped) was killed by V3S3. **M2** (`routeForIntent` defaults a missing variant to RAW and enables the link) **survived** both 158/158 and the render smoke 59/59. Under M2 the refused EXP-D-PP rows link to SCR-03 as RAW. A strip-only version of M2 would be undetectable under the current model, because points exist only in variant-confirmed cells, so the mutation went into the shared gate. All mutations were reverted. |
| 8 | Merge mechanics | **PASS** (N-7) | With `be86cb1`: clean, tree `38bc188`. With `4f46b37`: clean, tree `56118d4`, since `4f46b37` is an ancestor of the head. No conflicts. |
| 9 | Publication hygiene | **PASS** | The added lines contain no path, IP, URL, host, e-mail, secret or hash. The only 4-decimal number is the synthetic typed-test input `0.6933`, and the case ids `CASE_0101`/`0102` are synthetic. The commit messages are clean. |

## 3 · Findings

### BLOCKING

**B-1 · SCR-07 prints per-case values from a cell whose variant was refused, and labels them "plotted".**

- **Where.** `mobile/src/verticals/v3/v3View.mjs`, `caseTable()`. It sets `valueText: r.value !== null ? fmt(r.value) : null` and the text `${c.total} row(s) returned, ${c.plotted} plotted`. Both come from row-level fields. It never consults `cell.points`, `cell.pointsWithheld` or `cell.status`.
- **What the model does.** It keeps the rows whenever `experiment_cases` succeeded, and it computes `value` and `plotted` per row regardless of variant. For these cells it sets `points = []` and `pointsWithheld` to `CASES_FOR_ANOTHER_VARIANT` or `CELL_NOT_LOADED`. Its own contract says a VARIANT_MISMATCH cell "shows no number", and that such rows are "listed, nothing drawn or linked".
- **Reproduced on the generated bundle, in V3S3's own setup, and rendered:**
  1. Open SCR-07 with EXP-U-100, EXP-D-100 and EXP-D-PP.
  2. Pick `dice`.
  3. Tap EXP-D-PP, whose card says "variant mismatch - refused".
  4. The screen shows `Cases - DINOv2 100 % post-processed (EXP-D-PP) | 6 row(s) returned, 4 plotted | CASE_0002 · plotted · 0.900 | CASE_0003 · plotted · 0.600 …`.
  - Those are RAW values printed under the post-processed column, while the strip draws nothing.
- **Typed case.** Metrics served RAW with `experiment_cases` served PROCESSED gives `UNet 100 % | 2 row(s) returned, 2 plotted | CASE_0101 · plotted · 0.910 | CASE_0102 · plotted · 0.620`.
- **Why it blocks.** This is the silent substitution that `11` §6 forbids, on the RQ-B axis (raw vs processed). The screen contradicts its own "refused" card. No test catches it, and the related mutation M2 survives.
- **Fix (leader session, before merge):**
  - In `caseTable`, show a value and the word "plotted" only for rows that are in `cell.points`. Report the plotted count as `cell.points.length`.
  - When `cell.pointsWithheld` is set or the status is not LOADED, show no value and say why in the table text, e.g. "served for another variant – listed, not drawn, not linked".
  - Add a test (V3S12) asserting:
    - the fixture EXP-D-PP after `selectMetric('dice')` has no `valueText`;
    - the typed RAW-metrics / PROCESSED-cases cell has no `valueText`;
    - every such row's route stays `ok:false` (this kills M2).
  - Then re-QA as a delta.

### NON-BLOCKING

**N-1 · SCR-01 never shows its "high-level comparable metrics" numbers.**
- The model releases `headline[].summaries` only under COMPARABLE and only when nothing is withheld, but `v3View` never reads that field.
- The screen copy and the header comment imply that numbers do appear under COMPARABLE.
- The behaviour is conservative, but the copy overclaims, and the `10` SCR-01 item is unmet.
- **Fix (Bế Quốc Khánh, D23):** render the released `summaries` with `summaryLine`, or reword the screen to "verdicts only – numbers on SCR-07". Add it to the README TODO.

**N-2 · SCR-07's "no experiment listed" state reads "Unavailable · No the experiment comparison is available. · reason NO_EXPERIMENTS_LISTED".**
- The absence is stated as an absence and never as 0, but the V3 words are unused, because the shared `stateCopy` has no entry for this code. The sentence is also ungrammatical.
- **Fix (leader, in the shell's `stateCopy.mjs`):** add `NO_EXPERIMENTS_LISTED` to `REASON_TEXT`, and drop the article when `what` already starts with "the".

**N-3 · Model wording and hardening for rows of an unconfirmed variant.**
- The disabled-link reason reads "the server did not return prediction_variant for this case". That is false: `buildCell` passes `variant: null`, but the server did return a variant, just another one.
- These rows also carry `value` and `plotted`.
- **Fix (Bế Quốc Khánh, D23, in the model, outside this PR):** pass the cell's refusal reason into the intent, and null `value`/`plotted` when the variant is unconfirmed, so that no later screen can repeat B-1.

**N-4 · Contract error codes without V3 words.**
- `VALIDATION_ERROR`, `RUN_NOT_DEPLOYABLE`, `ANALYSIS_FAILED`, `CASE_NOT_FOUND` and others would print as codes, for example "blocked: VALIDATION_ERROR".
- **Fix (Bế Quốc Khánh):** fall back to `stateCopy.reasonText` before falling back to the code.

**N-5 · Device evidence is NOT MEASURED.** This is recorded honestly as README TODO 8. Info only; owner Bế Quốc Khánh.

**N-6 · The V3 render evidence is local only.**
- V3R1–V3R3 are not in CI, because they need `node_modules`.
- SVG text is mocked as host `SvgText`, which `texts()` does not see. Any future render-level INT-12 scan must include it; today `StripChart` draws only axis ticks and column and family labels as SVG text.
- The SCR-01 headline rows lack `accessibilityState.disabled` when their link is off.
- **Fix (Bế Quốc Khánh).**

**N-7 · Merge order (leader).**
- #69 carries #77's 15 commits through `c893b8f`.
- Merge #77 first, with a merge commit at `4f46b37`.
- If #77 is squash-merged instead, rebase #69 onto the new main (dropping `c893b8f`) before merging; otherwise #77's original commits enter main through #69.
- Both READMEs cite `TECH_STACK_ADR`, which exists only on `origin/docs/tech-stack-adr`. It lands with GATE-MOB-01.
- If the head moves, re-QA the delta.

## 4 · Scratch left in place

`<scratch>/qa69_wt` is still registered as a git worktree, and its `mobile/node_modules` is a **junction**. It also holds the ignored `src/generated/`, `.expo/` and the fixture bundle. Other leftovers are `<scratch>/qa69_export`, `<scratch>/qa69_tmp` (the Metro cache) and the `qa69_*` probes and logs. Nothing was deleted.

If the worktree is removed later, take the junction out first with a non-recursive `cmd /c rmdir <scratch>\qa69_wt\mobile\node_modules`, then run `git worktree remove`. **Never** run a recursive delete on the worktree while the junction is inside it.

**VERDICT: MERGE AFTER FIXES**: fix B-1 and add its test, run a delta QA, then merge right after #77 and GATE-MOB-01.
