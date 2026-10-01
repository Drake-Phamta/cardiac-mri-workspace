# QA: PR #79, Spike C1 result and ADR-ML-001 (`GATE-ML-01`) · **PASS WITH NOTES** · 2026-10-01

> **Record note (leader's session).** Everything from here to the end of §4 is CHAT E's report on PR #79,
> unedited, as it was returned to the leader's session at 14:29 (+07) on 2026-10-01. The reviewer had already
> written outside-git locations as `<c1>` and `<qa-scratch>`. §5 was added by the leader's session and records
> what was done with each finding before the merge.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM red-team session under the leader's account (Claude Code, Claude Opus 5.5), **not a second human**. It is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #79, branch `spike-c1/day22-result`, head `94eb343270e380f836459781f75f333235e3928d`. The PR is OPEN against `main`, with merge-base `2f62923`. |
| **Code that ran** | Run 2 (the evidence run) used `origin/spike-c1/day22-run-integration` @ `58cbd5e`. Run 1 used `9fac8b9`, and the preflight used `1f6ff5b`. |
| **Baseline** | `origin/main` was `2f62923` at the start of QA and `c7a37e0` at the end. #80 merged in between; it touches only `app/verticals/v1_case_explorer/`, does not overlap the PR, and leaves the split blob unchanged. |
| **Rules applied** | `RECOVERY_OVERRIDE_DAY22.md` §4 (the GATE-ML-01 row and the pre-declared recipe) · `C1_MEASUREMENT_PLAN.md` §3/§4/§5/§7 · `07` §2 · F5 |
| **Run at** | 2026-10-01, about 14:08–14:35 (+07), inside the 45-minute timebox |
| **Method** | **Read-only.** Blobs were read as exact bytes through `git cat-file blob` in Python; no PowerShell redirects were used. **CPU only**, one process at a time, no `torch` import, `CUDA_VISIBLE_DEVICES=""`; the GPU was never touched. No commit, push, merge, branch change or GitHub comment. Scratch files are `<qa-scratch>/qac1_*`, and nothing was deleted. |
| **Data handling** | **What was read:** the outside-git JSON/JSONL evidence in `<c1>`, both preflight JSONs and the nvidia-smi text file. **Names only:** directory names and link counts under `<c1>/root_hardlink` and `<c1>/cache`. **For the C1-5 re-derivation only:** the native **masks** of the 20 training cases in `<c1>/cache/img560`, memory-mapped. No validation or holdout bytes were read, and no MRI image array was opened. This report has aggregates only: no per-case values and no per-file hashes. |

> **VERDICT: PASS WITH NOTES. GATE-ML-01 may close under the pre-declared rule.** There are no blocking findings. Eight non-blocking findings (N-1 to N-8) follow in §3, each with a fix and an owner. Two of them must be handled before the UNet queue starts on Day 23: the N-1 tripwire and the N-2 decision.

---

## 1 · Commands and scripts run

| # | What | Purpose |
|---|---|---|
| R1 | `git rev-parse / log --graph / diff --stat` across `94eb343`, `58cbd5e`, `9fac8b9`, `1f6ff5b` and `origin/main`; blob ids of `preflight.py`, `run_feasibility.py` and `measure_boundary.py`; `git diff 58cbd5e 94eb343 -- spikes/spike_c_ml/c1/ ml/` | Code identity and provenance |
| R2 | `qac1_rerun.py`: runs the PR's `c1_report.py` (exact blob) with the brief's exact arguments (`--measurements <c1>/run_day22b/c1_measurements_20261001T121428.json --boundary <c1>/run_day22/c1_boundary_20261001T120003.json --split-manifest data/manifests/split_manifest_path_a_seed2024.json --dinov2-start 2026-10-01T15:30:00+07:00 --unet-start 2026-10-02T09:00:00+07:00 --deadline 2026-10-03T12:00:00+07:00 --overhead 1.10`), then compares bytes with the PR blobs and the host's report copy | Check 2 |
| R3 | `qac1_analyze.py`: both grids, the practical point re-derived, convergence aggregates, loss JSONL deciles, the fold re-derived, DR-011 aggregates | Checks 1, 3, 4, 5 |
| R4 | `qac1_prov.py`: membership of the hardlink root and the cache by name, link counts, preflight fields, model cards | Check 1 |
| R5 | `qac1_calendar.py`: the C1-9 calendar recomputed by hand, independently of `c1_report.py`, plus sensitivity cases | Check 6 |
| R6 | `qac1_boundary.py`: C1-5 recomputed with the PR's own `measure_boundary.measure()` on the cached training masks | Check 5 |
| R7 | `qac1_hygiene.py`: pattern scan of every file the PR changes; `gh pr view 79` (read-only) for the PR body; the PR's 4 commit messages | Check 9 |
| R8 | Code read: `run_feasibility.py`, `measure_boundary.py`, `c1_report.py`, `ml/data.py` (`CaseAllowlist`, `case_paths`, cache), `ml/train.py` (loss, validation, checkpoints), `ml/models.py`, `matrix_queue.template.json`. Documents read: override §4, the C1 plan, `07` §2, `RESULT_C1.md`, the ADR, and the PR's diffs to `OPEN_DECISIONS`/`SPIKE_PHASE_STATE` | Checks 1, 7, 8 |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | **Provenance (C1-8)** | **PASS** | **Preflight `C1-PREFLIGHT-DAY22`:** RUNNABLE, exit 0, 41/41 checks pass, `validation_paths_resolved 0`, `holdout_paths_resolved 0`, `holdout_case_count 0`. Gates are declared CLOSED, the layout is hardlink, its data root is the C1 hardlink root, and `repo_c1_code_dirty` is false. **Negative control:** REFUSED, exit 1, 7/41 checks fail; 20 validation and 54 holdout paths are resolvable on the broad root. **Split hash:** sha256 `c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d` is the same in the preflight and in the run-2 JSON, and equals the sha256 of the blob at main, at the PR and at `58cbd5e` (blob `d7f09e08`). Dataset manifest `f64d461f…` in both. **Selected cases:** set-equal to `$.training_subsets.25_percent.effective_case_ids` (20/20). Their intersection with validation ∪ holdout is empty, and both source-shape strata are present. **Fold:** re-derived with `np.random.default_rng(2024).permutation` (numpy 2.2.6, the same version as the run host), it equals the recorded 16/4 split; run 1 matches. **Hardlink root:** exactly 78 case directories, equal to the 100 % effective training set, with no validation or holdout case; all 156 files have link count ≥ 2. **Caches** (`img560`, `img448`): exactly the 20 selected ids. **Code path:** the runner refuses unless the preflight is runnable, reports 0/0, and matches on split hash and data root. It then reads through `CaseAllowlist.for_training(split,'25_percent')` and `selection_view` (20 cases, paths `<root>/<CASE_ID>/<file>`) into `case_paths(..., allowlist=)`. `build_cache`, `SliceDataset` and `case_arrays` all call `allowlist.require`. **Code identity:** `run_feasibility.py` and `measure_boundary.py` are blob-identical between `58cbd5e` and the PR. **`c1_report.py` differs only by `newline="\n"` in its three `write_text` calls.** `preflight.py` is identical at `1f6ff5b`, `58cbd5e` and the PR. `ml/models.py` is identical between `58cbd5e` and main. `ml/data.py` on main only adds `FROZEN_SPLIT_SHA256` and `model_input_stack`. The run-2 JSON records `code_commit` = `58cbd5e`. |
| 2 | **The generated table re-derives** | **PASS** | The exact command exits 0 with empty stderr. `c1_result_table.md` (1,470 B), `c1_calendar_20261001T121428.json` (1,834 B) **and** `c1_summary_20261001T121428.json` (16,652 B) are **byte-identical** to the PR blobs and to the host's report copy (LF, no BOM). The table is embedded verbatim in RESULT_C1 §1 and ADR §2. Typed values in the prose are listed in N-3: two are inexact and one is incomplete, and none affects a gate condition. |
| 3 | **C1-1/C1-2/C1-3** | **PASS** (N-1, N-4) | **Grid:** 12 cells (560/448 × b8/4/2 × 2 families) in both runs; every cell fits, none has an error field, no OOM. The practical point re-derives to **560 / b8 in both runs**. **UNet b8 observation:** at 560 the UNet b8/b4 train-step ratio is **4.24× (run 2) and 5.63× (run 1)**, against 2.03×/1.99× at 448. Per sample, b8 is 2.1×/2.8× slower than b4. Peak reserved was 3,968 MiB against **3,288 MiB free at start** (4,096 MiB total). The card is a WDDM display GPU: nvidia-smi showed 3,833 MiB in use, with desktop processes on it. This is consistent with driver spill. In the 1,500-step trial the UNet ran at **2.18 s/step, 2.15× the C1-2 median**. RESULT §3.1 reports this honestly (its per-sample figure is overstated; see N-3). **The rule applies as written:** "fit" means ran without OOM (the plan's C1-1 boundary), so batch 8. **Replicate:** peak allocated and peak reserved are identical in all 12 cells. Train-step ratio run2/run1 is 0.86–1.86 (median 1.11); validation-step ratio is 1.01–1.97 (median 1.05). The UNet loss over the 281 steps both runs share is bit-identical (max \|Δ\| 0.0, inside the plan's 5e-5 tolerance). |
| 4 | **C1-6 convergence** | **PASS** | **Both families:** 1,500/1,500 steps (8.52 epochs), 0 non-finite rows. **Loss trend:** decile means fall monotonically (UNet 0.744 → 0.478; DINOv2 0.782 → 0.499). The highest rolling-50 mean after the first decile (0.687 / 0.729) stays below the first-decile mean, so there is no divergence. The JSONL first/last-10 % means equal the JSON's. **Fold-validation Dice** (mean of 4 cases) at steps 250…1,500: UNet 0.259, 0.718, 0.649, 0.735, 0.733, **0.788**; DINOv2 0.177, 0.261, **0.429**, 0.421, 0.400, 0.349. **Checkpoint reload:** max \|Δ\| **0.0 and 0.0** (≤ 1e-5). "Both families converge" holds under the plan's boundary and under the override's wording. |
| 5 | **C1-4 / C1-5 / C1-7** | **PASS** (N-5, N-8) | **C1-4** (4 fold cases): slices below Dice 0.5 for the largest / median / smallest panels are UNet 0/4, 0/4, 3/4 and DINOv2 1/4, 2/4, 4/4. Empty-ground-truth slices with any false positive: UNet 104/148, DINOv2 147/148. **C1-5**, recomputed on CPU from the 20 cached training masks, is **identical in every key**, including the per-case block (compared only as a boolean): 106,867 skeleton points; p1/p5 at model input 3.5 / 7.215 px; fraction thinner than the stride 0.0 / 0.0 / 0.19786 for strides 1 / 1.75 / 14. **C1-7:** all 20 records use per-volume p0.5/p99.5. `volume_hi` is distinct in 19 of 20 volumes; `volume_lo` is the same everywhere, which fits a zero background at p0.5. The code path is per-volume, the preprocessing version is `ml-preproc-1.0.0`, and the caches were built at `9fac8b9`, whose `ml/` is identical to `58cbd5e`. |
| 6 | **C1-9 calendar** | **PASS** (N-1, N-2) | **Hand recomputation:** 220 / 418 / 858 training steps per epoch (exact multiples of 8) and 220 validation batches. UNet: 3.806 + 6.864 + 13.658 = **24.33 h**, ending 2026-10-03 09:19:41, with 2.67 h of slack (largest E = 55). DINOv2: 2.047 + 3.517 + 6.784 = **12.35 h**, ending 2026-10-02 03:50:52, with 32.2 h of slack (largest E = 180). **E = min(50, 55, 180) = 50 ≥ 10, so no DR-007.** This matches the calendar JSON exactly. **Break-even at E = 50:** UNet 1,128 ms/step (1.12× C1-2); DINOv2 1,893 ms/step (3.89×). The "4050 at 3050 Ti speed" assumption is conservative only on a condition; see N-1. |
| 7 | **C1-10 coverage** | **PASS** (N-7) | All 8 `07` §2 fields have an ADR §1 row pointing at an artifact that exists: <br>• **Variant and source:** `PINNED_REVISIONS` `ed25f3a…`; the model card's requested and resolved revisions are equal. <br>• **Fine-tuning:** trainable = total = 22,294,849 parameters. <br>• **Decoder:** `DinoSeg`; stride 1.75 in the model card and in C1-5. <br>• **Input and channels:** `PREPROCESSING`. <br>• **Loss, optimizer, LR, batch, epochs:** code, `practical_point`, `epochs_E`. <br>• **Threshold:** `resize_logits_back`, `logits_to_mask`. <br>• **Compute:** C1-1/2/3/9. <br>• **Fairness:** a rationale row. <br>Two pointers are weak (N-7). |
| 8 | **Honesty** | **PASS WITH NOTES** | All the limitations the brief asks for are stated: one host, one seed, a 16/4 fold, Dice at model-input resolution, timings from a shared workstation, run 1 lost. So are the unmeasured 4050, the owed C1-4 notes and the holdout slots left `NOT_RUN`. Four statements go beyond the evidence: N-1, N-2, N-3 and N-4. |
| 9 | **Publication hygiene** | **PASS** | Lines the PR adds contain no absolute machine paths, usernames, hostnames, IPs or emails. The only IPs are in **pre-existing** lines of `OPEN_DECISIONS.md` and `SPIKE_PHASE_STATE.yaml`. The case IDs are the 20 selected plus the fold, already public in the split manifest; F5 allows them. Hashes in the summary are the split and dataset manifests, the two C1 checkpoint files and the public HF weights. None of them is a per-file dataset hash, so F5 is met (wording issue in N-8). The Reproduce block uses placeholders. The PR body and the 4 commit messages are clean. |

## 3 · Findings

### BLOCKING
None.

### NON-BLOCKING

**N-1 · The UNet host-speed assumption is conservative only if the RTX 4050 does not spill. It is not an upper bound.**
- **Finding:** The calendar JSON calls the 3050 Ti figure "an upper bound", and RESULT §3.1 calls the calendar "pessimistic, not optimistic". But the C1-2 median (1,010.67 ms over 20 timed steps) understates the same card's sustained b8 rate in the 1,500-step trial: 2.18 s/step, or 2.15×.
  - At that rate, E = 50 needs about 51 h (largest E would be 26).
  - At the C1-2 rate, the UNet queue has 2.67 h of headroom, and the break-even is 1.128 s/step (1.12×).
  - The assumption holds by a wide margin if the 6 GiB card holds the working set (peak reserved 3,968 MiB). Estimated without spill as 2 × the b4 step (≈477 ms), the UNet queue takes about 12.1 h.
- **Fix:**
  - (a) Reword the calendar's `unet_host_speed` kind, RESULT §3.1 and the ADR compute row to: "conservative if the 4050 runs batch 8 without driver spill; not an upper bound on the 3050 Ti's own sustained rate".
  - (b) Add a tripwire at the start of the UNet queue: EXP-U-025 epoch-1 mean training step ≤ 1.13 s, and peak reserved below free VRAM. If either fails, the leader decides at once.
- **Owner:** leader session for the wording, before merge. Bế Quốc Khánh for the tripwire, Day 23 at queue start.

**N-2 · DR-016 is re-recorded without its pre-declared fallback.**
- **Finding:** Override §4, declared before C1, says "if the RTX 4050 is not running by Day 23 12:00, the UNet family follows on the leader's PC". The DR-016 entry this PR adds to `OPEN_DECISIONS.md` cites §4 but instead says the 4 GiB card is not used for UNet at batch 8 and that "the leader decides". That is a change made after C1, attributed to the decision taken before the result.
  - Under the original fallback, E = 50 would not fit even at the C1-2 rate: largest E 49 from Day 23 12:00, or 23 at the sustained rate.
  - One E binds all six runs, and DINOv2 starts at E = 50 tonight. Changing E later would invalidate the DINOv2 runs (ADR §3).
- **Fix:** Quote §4's original text and record the change as a time-stamped amendment (for example DR-016a, with RESULT §3.1 as the reason). Decide now what happens if the 4050 is unavailable or fails the N-1 tripwire; for example, the UNet queue runs past the deadline at E = 50 rather than E changing.
- **Owner:** leader session. The text before merge; the contingency decision before the DINOv2 queue starts.

**N-3 · Typed values in the prose that are not in the generated files.**
- **Finding:**
  - "about 12.4 h" for DINOv2 (RESULT §2, the ADR compute row, the PR body). The generated per-run values sum to 12.35 h (exactly 12.348 h).
  - "about 3× slower per sample" (§3.1). The evidence run shows 2.1×; run 1 shows 2.8×.
  - "4–6×" (§3.1). The 4.24× is in the summary; the 5.63× comes from run 1's outside-git JSON.
  - "0.86–1.86×" (§3.3). This covers training steps only and comes from run 1's outside-git JSON; validation steps reach 1.97×.
  - "12:11 / step 281 / 18-process QA pool" (§3.2). The step and the time match the run-1 loss log; the cause is narrative, not evidenced.
- **Fix:** Correct the first two. Mark the numbers derived from run 1 as coming from its outside-git JSON, or add run-1 grid aggregates to `c1_summary` through `c1_report.py`.
- **Owner:** leader session, before merge (text only).

**N-4 · "Fit" at 560 / batch 8 means ran without OOM, not fits in VRAM.**
- **Finding:** The ADR's batch and compute rows say both families "fit … on the 4 GiB card". On this WDDM display GPU, 3,288 MiB was free at start. Peak reserved was 3,968 MiB for UNet and 3,440 MiB for DINOv2, both above that.
  - DINOv2 shows no spill penalty: at b8 it takes 60.7 ms per sample against 78.7 ms at b4, and its trial ran at 457 ms/step against 486 ms in C1-2. Its queue has 3.9× headroom.
- **Fix:**
  - Say "ran without OOM (UNet through driver memory spill)", and add peak reserved and free-at-start VRAM to the C1-1 row in `c1_report.py`.
  - Tonight, check DINOv2's first-epoch step time against its break-even of 1.89 s/step.
  - Keep heavy jobs off this PC while the queue runs. Run 1 died of host memory exhaustion; `ml/train.py` resumes from `last.pt`.
- **Owner:** leader session.

**N-5 · The generated C1-4 row shows only the small-area panel.**
- **Finding:** The row leaves out three things that are all in `c1_summary`:
  - DINOv2 is also below Dice 0.5 on 2/4 median-area and 1/4 largest-area slices.
  - UNet predicts foreground on 104/148 empty-ground-truth slices; the prose mentions only DINOv2's 147/148.
  - DINOv2's fold Dice peaks at 0.429 and ends at 0.349.

  None of this affects C1-6.
- **Fix:** Extend the row in `c1_report.py` (all three panels plus false positives on empty slices, for both families), or state it in RESULT §2. The Day-23 C1-4 notes should cover both families. No recipe change (`PR-SCI-03`).
- **Owner:** Bế Quốc Khánh (Day 23) for the notes; leader session for the row.

**N-6 · Plan evidence items not fully met, and not declared as deviations.**
- **Finding:**
  - C1-1 has per-cell peaks only, not per-step memory samples.
  - There is an nvidia-smi snapshot for run 1 only.
  - C1-4's raw logits and masks were not kept.
  - The plan's C1-9 variants for 4 h and 5 h windows are absent, as is EXP-D-PP. The override's two-host rule supersedes the windows, and EXP-D-PP is inference only.
  - C2 was timed with the C1 runner loop, not `ml/train.py`. Per-epoch native-resolution validation, `last.pt` saves and post-train validation inference are covered only by the 1.10 assumption.
- **Fix:** List these as recorded deviations in RESULT §4, and time the first epoch of each queue against the calendar.
- **Owner:** leader session; Bế Quốc Khánh revalidates on Day 23.

**N-7 · Two ADR §1 evidence pointers are weak.**
- **Finding:** "Precision and seed" points at "run manifests", which do not exist yet. "Scientific fairness" points at "this table".
- **Fix:** Point them at `c1_summary.recipe`, at the equal `convergence_C1_6.*.{img,batch,steps_done}`, and at `ml/train.py` `ADR_ML_001`/`RECIPE`.
- **Owner:** leader session.

**N-8 · Labels and comments overstate what the code does.**
- **Finding:**
  - The calendar labels `slices_per_case` as "READ (dataset manifest)", but it is a constant in the code. The value is true: all 154 cases have 88 slices.
  - `cohort_statistics_used: False` is a literal the runner writes, not a measurement; the code and the per-volume values do support it.
  - `c1_report.py` says "no per-file hashes", and RESULT §5 puts hashes outside the repository. Yet the summary carries the two checkpoint hashes and the HF weights hash. F5 allows these; only the wording is wrong.
  - The measurement JSON records no dirty-tree flag.
- **Owner:** leader session, in a follow-up PR.

## 4 · VERDICT on GATE-ML-01

**PASS WITH NOTES. Under the pre-declared rule of override §4, GATE-ML-01 may close and ADR-ML-001 may move to ACCEPTED.** The frozen values are 560×560, batch 8, **E = 50**, and the recipe exactly as written.

| Rule condition | Status |
|---|---|
| C1-1…C1-10 each backed by machine evidence | **Holds.** The table, the calendar and the summary re-derive byte-identically. C1-5 re-derives independently. C1-8 is verified against the outside-git records. |
| QA PASS | **PASS WITH NOTES**, no blocking finding |
| Both families converge (decreasing loss, no NaN/Inf) | **Holds** for both, with no divergence and reload Δ 0.0 |

- **The core runs can start.** DINOv2 starts on the leader's PC with `--epochs 50 --batch 8`.
- **Recommended in #79 before merge** (text only, no re-run, does not reopen the gate): N-1 wording, N-2, N-3, N-4 wording.
- **Before the UNet queue on Day 23:** the N-1 tripwire and the N-2 contingency decision.
- **Outside this QA:** model quality. This QA closes nothing beyond the rule.
- **Scratch cleanup:** `<qa-scratch>/qac1_*` holds scripts, blob copies and the regenerated report, including the summary JSON with case IDs. The leader may delete it.

---

## 5 · Disposition *(added by the leader's session; not part of the QA report)*

| Item | What was done |
|---|---|
| **Verdict** | **`GATE-ML-01` CLOSED 2026-10-01 14:30 (+07)** under the pre-declared rule of override §4. **`ADR-ML-001` ACCEPTED**: 560×560, batch 8, E = 50, recipe unchanged. **`SPIKE_C1` ACCEPTED** under the Day 22 override, with this QA standing in for the reviewer's APPROVE (override §2 item 2). Vũ Hùng Anh revalidates it on Day 23 |
| **Queue** | The DINOv2 queue (EXP-D-025 → EXP-D-100 → EXP-D-050, `--epochs 50 --batch 8`) started at 14:30 on the leader's PC from `main` `c7a37e0`. It started after this verdict and before the text fixes below; none of those fixes touches the recipe |
| **N-1** | (a) Wording fixed in RESULT_C1 §2 and §3.1 and in the ADR compute row. The calendar JSON is **not** regenerated, so its bytes stay identical to the file this QA re-derived. Its `unet_host_speed` label still says "upper bound", and RESULT_C1 §3.1 says that label overstates the case. (b) The tripwire is part of **DR-016a** and of Bế Quốc Khánh's Day 23 packet |
| **N-2** | DR-016 now quotes override §4's original text, fallback included. The change made after C1 is recorded on its own as **DR-016a** (reason: RESULT_C1 §3.1). E stays 50 for all six runs. If the RTX 4050 is not running the UNet queue by Day 23 12:00, or fails the tripwire, the UNet family still runs at E = 50 / batch 8, and the calendar slips instead of the recipe. DR-016a was written **after** the DINOv2 queue started, not before as N-2 asked; nothing that queue depends on changed. The leader confirms DR-016a on Day 23 |
| **N-3** | Corrected in RESULT_C1 and the ADR: 12.35 h; 4.24× per step and 2.1× per sample (5.63× and 2.8× in run 1, marked as coming from run 1's outside-git JSON); the run-to-run ranges are marked the same way, with validation steps 1.01–1.97× added; the cause of run 1's loss is marked as the operator's account |
| **N-4** | ADR and RESULT_C1 now say "ran without OOM (the UNet through driver memory spill)", with peak reserved and free-at-start VRAM taken from `c1_summary`. **First-epoch check done:** EXP-D-025's first epoch ran 220 training steps in 97.2 s, a mean of 0.44 s per step against the 1.89 s break-even. The whole epoch, validation included, took 129.5 s (run log, outside the repository). Adding the two VRAM columns to the C1-1 row of `c1_report.py` is a Day 23 follow-up |
| **N-5** | Stated for both families in RESULT_C1 §2. The generated row is unchanged. The per-panel counts were re-checked against the outside-git measurements JSON and match this report. `c1_summary` cannot show them, because its "median" of four values is the upper middle one. The C1-4 notes go to Bế Quốc Khánh on Day 23 |
| **N-6** | Listed as recorded deviations in RESULT_C1 §4 |
| **N-7** | ADR §1 pointers fixed |
| **N-8** | Follow-up PR, Day 23 |
