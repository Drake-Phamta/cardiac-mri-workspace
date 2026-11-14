# SPIKE C1 BRING-UP — DAY 15

| Field | Value |
|---|---|
| **Date** | 2026-09-24 (Day 15 of 30), from 14:00 +07:00 |
| **Written by** | CHAT C — ML / Imaging, under `RECOVERY_OVERRIDE_DAY15` |
| **Authority** | `management/day15/RECOVERY_OVERRIDE_DAY15.md`, recorded on `main` at `454c526` |
| **Normal owner of this work** | **Bế Quốc Khánh** (Spike C0 and Spike C1, both stages, per `DR-013` and `SPIKE_C_ML/TASK.md`) |
| **Nature of this document** | **RECOVERY SUPPORT ONLY.** Ownership does not transfer. Everything here hands back on Day 16 — see section 9. |
| **Phase reached** | **PHASE 1 only.** No training run was started. `SPIKE_C1` was not set to `ACTIVE`. No gate was transitioned. |

> **Scope warning, stated once and binding on every figure below.**
> This document contains **no Spike C1 evidence**. Every measured number it reports was either
> (a) measured by Bế Quốc Khánh during **Spike C0 on synthetic data**, or (b) a structural
> property of a **candidate** split manifest that was not yet on `main` on Day 15. Nothing here can close
> `GATE-ML-01`, and `DR-007` forbids anyone from claiming otherwise.
>
> **Update 2026-10-01:** #35 merged at `f5aa763` on 2026-10-01. The merged blob is byte-identical to the
> candidate (`c5c65a09…396d`). Section 11 records the Day 22 QA fixes to the harness.

---

## 1 · THE COMPUTE HOST — the first deliverable

This section was produced before any other work, because if it is wrong everything after it is wasted.

### (a) The ML compute host that is actually approved and available

**The approved and recorded ML compute host is Bế Quốc Khánh's personal laptop — an NVIDIA GeForce
RTX 4050 Laptop GPU, 6.0 GiB VRAM, 15.25 GiB host RAM.**

Sources, all current project truth:

| Source | What it says |
|---|---|
| `management/spikes/SPIKE_C_ML/RESULT.md` | "Execution: 2026-09-16 on the owner's RTX 4050 Laptop GPU" |
| `management/PROJECT_STATE.yaml`, `M4.state_2026_09_18` | "**C1 runs on the owner's RTX 4050; no Mac mini is involved**" |
| `management/PROJECT_STATE.yaml`, merged PR #36 record | "20 measurements over 10 variants in fp32 and bf16 **on the owner's RTX 4050**" |
| `management/readiness/OPEN_DECISIONS.md` (DR-003 deployment profile) | "**Training is not required to occur on the Mac mini**; ML training may run on separate compute hardware (relevant to Spike C0/C1, which measure whatever hardware is actually used)" |

**The Mac mini M2 24 GB is explicitly NOT the ML compute host.** Under `DR-003` it is the
backend / persistence / artifact / demo host. The prompt's caution is confirmed by the record:
no approved decision places training on it, and `PROJECT_STATE.yaml` says so in as many words.

**Important qualification.** No Decision Request ever *chose* a training host. `DR-007` approved
the *spike* that measures "whatever hardware is actually used". The RTX 4050 is therefore the
**declared and recorded** host, established by the owner executing C0 on it and by Project Control
mirroring that fact inward — it is not a host selected by a formal architecture decision. That
distinction matters for section 1(f).

### (b) Is it available TODAY?

**NO — NOT ESTABLISHED, and it must be treated as unavailable.**

- The host is a **personal laptop belonging to a team member who is not executing today.** Day 15
  is a leader-executed recovery day.
- **There is no documented remote-access path to that machine anywhere in the repository.** The
  only remote-access mechanism the project records is `ssh -o BatchMode=yes macmini`, and that
  reaches the Mac mini, which is not the ML host.
- The 4–5 unattended GPU hours/day that the whole C0 calendar verdict rests on are **the owner's
  personal machine availability, self-reported on 2026-09-16.** That capacity is not transferable
  to anyone else and is not a resource the leader can spend.
- During the Spike C0 review, the reviewer (Vũ Hùng Anh) **stated he could not run `probe.py
  --selftest` on his own host**, which is why no independent GPU rerun was ever claimed. The
  project already has a recorded precedent that this GPU workload does not simply move between
  team machines.

### (c) The environment

**On the approved host (RTX 4050) — as recorded in `SPIKE_C_ML/RESULT.md`. NOT re-verified today,
because the host was not reachable.**

| Field | Value |
|---|---|
| OS | Windows build 26200 |
| Python | 3.11.9 |
| PyTorch | 2.11.0+cu128 |
| CUDA / cuDNN / driver | 12.8 / 91900 / 595.79 |
| GPU | RTX 4050 Laptop, 6.0 GiB; host RAM 15.25 GiB |
| BF16 | supported |

**On the machine this session actually ran on — MEASURED TODAY, 2026-09-24 14:12 +07:00**
(`preflight.py check` environment block, evidence file in section 5):

| Field | Value |
|---|---|
| Hostname | `<leader-pc>` (the leader's PC; redacted 2026-10-01, public repo) |
| OS | Windows 11, build 10.0.26200 |
| Python | 3.12.6 |
| PyTorch | 2.5.1+cu121 |
| CUDA / cuDNN | 12.1 / 90100 (driver reports CUDA 13.0, `nvidia-smi` 581.95) |
| GPU | **NVIDIA GeForce RTX 3050 Ti Laptop GPU, 4.00 GiB** (≈646 MiB already held by desktop apps) |
| BF16 | supported |
| MPS | not available |
| numpy / transformers / huggingface_hub / pynrrd | 2.2.6 / 4.51.3 / 0.36.2 / 1.1.3 |

These two environments are **not the same** and their measurements are **not interchangeable**.

### (d) Access path, and who holds it

| Host | Access path | Who holds it |
|---|---|---|
| **RTX 4050 (approved ML host)** | **NONE DOCUMENTED.** Physical/interactive use by the owner only. | Bế Quốc Khánh, personally |
| Mac mini M2 (backend/demo, **not ML**) | `ssh -o BatchMode=yes macmini` | Leader only. Irrelevant to training. |
| Leader's PC `<leader-pc>` | Local | Leader. **Not an approved ML host.** |

### (e) Expected throughput, and where the number comes from

The only throughput figures that exist in this project are **Spike C0's, measured on synthetic
data on the RTX 4050** at 560×560, batch 2, warm-up excluded, data loading excluded. Representative
BF16 rows from `spikes/spike_c_ml/EVIDENCE_RAW/c0_probe_20260916T005659+0700.json`:

| Variant | ms/train step (median) | slices/s | Peak MiB |
|---|---:|---:|---:|
| `unet_base16_depth4` | 37.67 | 53.09 | 443.7 |
| `unet_base32_depth4` | 77.89 | 25.68 | 902.4 |
| `dinov2_s14_frozen_progressive` | 27.56 | 72.56 | 177.1 |
| `dinov2_s14_full_progressive` | 89.56 | 22.33 | 1028.8 |
| `dinov2_b14_full_progressive` | 223.45 | 8.95 | 2527.9 |

**Expected throughput on real data: NOT MEASURED.** That is precisely question Q8/Q9 of Spike C1.
C0's own limitation statement says synthetic data cannot establish it. Real-data throughput will
differ at least because data loading — explicitly excluded from every C0 timing — becomes real I/O
against 14.2 GB of NRRD volumes.

### (f) P0 BLOCKER FOR THE LEADER — a compute-host decision is required, and I am not taking it

**Raised as P0. This is the single thing most likely to cost the project the training matrix.**

The approved ML compute host is not available today. Meanwhile, a material and previously
unrecorded fact turned up during this bring-up:

> **The leader's own PC has the complete real dataset, a working CUDA PyTorch stack, both pinned
> DINOv2 checkpoints already cached at the exact revisions C0 used — and a 4 GiB GPU.**

| Asset | Status on `<leader-pc>` | Evidence |
|---|---|---|
| Real dataset, all 154 cases | **PRESENT** at `<package-root>` (a local directory outside Git) — `Training Set/` 100 case dirs, `Testing Set/` 54 case dirs, 14.2 GB, matching `dataset_manifest.json` `case_count: 154` | directory census, section 5 |
| Source archive | `<data-dir>\2018_UTAH_MICCAI.zip`, 2,200,962,438 bytes | directory listing |
| PyTorch + CUDA | working, `cuda_available: true`, bf16 supported | `preflight.py` env block |
| `facebook/dinov2-small` | cached at revision `ed25f3a31f01632728cabb09d1542f84ab7b0056` — **exactly the revision pinned in C0** | HF cache census |
| `facebook/dinov2-base` | cached at revision `f9e44c814b77203eaa57a6bdbbd535f21ede1415` — **exactly the revision pinned in C0** | HF cache census |
| Free disk | D: 62.3 GB, C: 43.6 GB | `Get-PSDrive` |
| GPU | RTX 3050 Ti Laptop, **4.00 GiB** vs the approved host's 6.0 GiB | `nvidia-smi`, torch |

**What this does and does not mean.**

- It does **not** mean the leader's PC is the compute host. **Choosing a compute host is an
  architecture decision, and the prompt forbids me from taking it. I have not taken it.**
- On C0's measured peak-memory table, the BF16 candidates other than `dinov2_b14_full_*` would
  physically fit in 4 GiB at batch 2 (`dinov2_s14_frozen_progressive` 177.1 MiB,
  `unet_base16_depth4` 443.7 MiB, `dinov2_s14_full_progressive` 1028.8 MiB). `dinov2_b14_full_progressive`
  at 2527.9 MiB plus ~646 MiB of desktop usage is close enough to 4 GiB that it is **NOT
  ESTABLISHED** as fitting. **None of this is a measurement on the 3050 Ti — it is C0's 4050
  numbers read against a different card's capacity, and it may be wrong.**
- Timings would **not** be comparable to C0. That is acceptable in itself, because `C1-2`
  explicitly *supersedes* the C0 estimate — but the calendar arithmetic would then also have to be
  rebuilt on the **leader's** available hours, not the owner's 4–5 h/day.
- The project already has a bounded cross-machine story: the Day-9 PR #37 reruns produced a
  reproduction tolerance of **5e-5 mean training loss / 5e-4 Dice** across machines, pinned in the
  C1 measurement plan. Cross-machine execution is therefore *characterised*, not unknown.

**The decision the leader must take, today, one of:**

1. **Get Khánh's RTX 4050 online today** — the approved host, zero governance cost, but it depends
   on a person who is not scheduled today; or
2. **Record a Decision Request adding a second ML compute host** (the leader's `<leader-pc>`,
   RTX 3050 Ti 4 GiB) with its own re-measured throughput and its own calendar basis. This is an
   architecture addition and needs the leader's signature, not mine; or
3. **Accept that no C1 run happens today**, and that `GATE-ML-01` cannot close on Day 15.

Option 2 also requires a fresh memory probe on the 3050 Ti before any matrix run, because 4 GiB is
a real constraint and C0's fit table was measured at 6 GiB.

---

## 2 · THE C0 / C1 EVIDENCE BOUNDARY — stated so the two cannot be confused

### What Spike C0 established (and it is genuinely established)

C0 is a **hardware-and-throughput probe on synthetic data**. On the RTX 4050, on 2026-09-16, it
established, with 20 measurements over 10 variants in fp32 and bf16:

1. The compute that exists: RTX 4050 Laptop, 6.0 GiB, bf16-capable, with exact framework versions.
2. Peak training memory for both model families at 560×560, batch 2, for every candidate variant.
3. The largest fitting batch per variant (capped at 16; capped values are **lower bounds only**).
4. Step time and slices/s per variant, warm-up excluded, device-synchronised, **data loading excluded**.
5. Effective decoder output stride: UNet 1, DINOv2 linear 14, DINOv2 progressive 1.75.
6. Checkpoint identity — revision and weights SHA-256 for both DINOv2 variants.
7. A **preliminary** calendar extrapolation, and the owner's 4–5 unattended GPU h/day.
8. That the DR-011 normalization policy is configured from the start, not retrofitted.

### What Spike C1 must establish, that C0 cannot — and the reason in each case

| # | What only C1 can establish | Why C0 structurally cannot |
|---|---|---|
| `C1-1` | Real-data peak memory | Synthetic volumes have the right shape and dtype, nothing else. |
| `C1-2` | Real-data wall-clock per run | **C0 excluded data loading entirely.** Real I/O over 14.2 GB of NRRD is not in any C0 number. |
| `C1-3` | The practical input resolution | 560 was chosen in C0 as a shape convenient to both a 14-patch ViT and a /16 UNet. Whether real LA anatomy survives that resize is untested. |
| `C1-4` | Decoder behaviour on real LA anatomy | Synthetic data has no anatomy. A decoder cannot fail anatomically on data with no anatomy. |
| `C1-5` | **Effective output resolution vs measured LA boundary thickness in voxels** | The single most likely reason a ViT underperforms here. The boundary is thin; a stride-14 feature map may not resolve it. **There is no LA boundary in synthetic data to measure.** |
| `C1-6` | Convergence sanity for both families | Synthetic targets are learnable or not for reasons unrelated to the task. C0 ran no convergence trial at all. |
| `C1-7` | DR-011 conformance **in a real cohort** | C0 proved the *policy is configured*. C1 must prove no cohort-fitted statistic leaks in across real data fractions. |
| `C1-8` | Subset provenance from the frozen real split | There was no real split to draw from. |
| `C1-9` | The **final** calendar verdict | C0's verdict is labelled PRELIMINARY by the owner and by `DR-007`. |
| `C1-10` | Every `07` §2 `ADR-ML-001` field supported by artefacts | C0 supports the compute/memory fields only. |

### The one-sentence version

> **C0 answered "can this hardware hold and move these models at all?" — measured, on synthetic
> data, and it is real evidence for that question and no other. C1 must answer "does this recipe
> actually work on real hearts, and does the matrix fit the calendar?" — and until it does,
> `GATE-ML-01` stays OPEN. `DR-007` makes this non-negotiable, and today's override waives review,
> not evidence.**

---

## 3 · BLOCKER STATE — correcting a stale record

`PROJECT_STATE.yaml` line 359 reads `SPIKE_C1: {status: BLOCKED, blocked_by: [SPIKE_D]}`.
**That is stale.** Same file, line 363: `GATE-DATA-01: {status: CLOSED, closed_at:
"2026-09-18T21:40+07:00" ... "SPIKE_C1 remains BLOCKED on GATE-SPLIT-01"}`.

**The real and only remaining blocker for Spike C1 is `GATE-SPLIT-01`, which closes when PR #35 lands.**
*(Update 2026-10-01: #35 merged at `f5aa763` on 2026-10-01. Recording the gate transition is the
leader's action, not this document's.)*

Merge readiness of PR #35, checked today from the fetched branch:

| Check | Result |
|---|---|
| Branch | `codex/path-a-split`, head `7b72ce83fe09520aefad4eb6f746ed665b9179f1`, "fix(split): regenerate Path A from merged dataset manifest", 2026-09-21 08:35 +07 |
| Position vs `main` | **6 ahead, 4 behind** (merge-base `41e5154`) |
| Merge conflicts against current `main` | **NONE.** `git merge-tree` reports a clean merge. |
| Carries | `data/manifests/split_manifest_path_a_seed2024.json` (1031 lines), `tools/dataset_split/{split.py,linkage_screen.py,split_manifest.schema.json}`, `SPLIT_RESULT.md`, `PATIENT_LINKAGE_EVIDENCE.md` |

**Recommended correction for Project Control (leader's action, not mine):** set
`SPIKE_C1.blocked_by` to `[GATE-SPLIT-01]`. I have not edited `PROJECT_STATE.yaml`.

---

## 4 · PHASE 1 — ENVIRONMENT, HARNESS AND COMMANDS

Three scripts were written today under `spikes/spike_c_ml/c1/`, which is inside the implementation
boundary that `SPIKE_C_ML/TASK.md` allows (`spikes/spike_c_ml/**`). None of them trains anything.

### 4.1 `verify_subsets.py` — nesting by SET CONTAINMENT, never by counting

The candidate manifest asserts `invariants.subsets_nested_25_in_50_in_100: true`. **An asserted
boolean is a claim by the generator, not evidence.** This script recomputes each claim from the
case-ID lists with `set.issubset`. `len(a) <= len(b)` is never used as a proof of containment.

It also recomputes the **transitive connected components** of the declared correlation groups with
a union-find, rather than trusting the declared group count — which is the exact QA-003 open
question recorded against PR #35. *(Corrected 2026-10-01: that union-find runs over the **declared**
groups, so it is not independent of them — it can show two declared groups sharing a case, never a
pair the manifest omits. The independent support is the screen's own counts: 5 pairs above threshold
= 4 two-case groups + 1 link, and 9 affected cases. Since Day 22 the script also runs the union-find
over groups **plus** links and derives the exclusions; see section 11.)*

### 4.2 `preflight.py` — fail-closed gate, subset and data-root proof

Implements section 1 of `C1_MEASUREMENT_PLAN.md`. It reads **no voxels**; it resolves paths and
calls `Path.exists()` and never opens an NRRD. *(Day 22: `check` now also verifies every link target
and file identity, using stat calls only, and `make-root` defaults to a hard-link layout. See section 11.
The Day 15 `check` verified entry **names** only. QA showed that this let it certify roots whose links
pointed at validation data or at the package parent.)*

Two properties worth stating explicitly:

- **Gate state is never inferred.** `--gate-data-01` and `--gate-split-01` must be passed
  explicitly, and the script refuses to certify a run unless both are `CLOSED`. A dry run requires
  the separate `--allow-open-gates` flag and is stamped as not-C1-evidence in its own JSON.
- **`make-root` exists because a software filter is not proof.** The released package puts
  `Training Set/` and `Testing Set/` side by side under one parent, so the locked 54-case holdout
  is one path join away from any naive data root. `make-root` builds a root containing **directory
  links to the effective training cases and nothing else**, and `check` then proves nothing else
  resolves beneath it. It copies no image bytes and modifies nothing in the source package.

### 4.3 `forecast_matrix.py` — fraction-weighted calendar arithmetic

`harness/extrapolate.py` (C0) prices the matrix as `7 × hours_per_run` with **every run costed at
the full 80-case partition**. That is conservative, but it is not the matrix `08` §2 specifies:
`EXP-D-025/050/100` train on the nested subsets. This script prices each run at its **own effective
subset size read from the manifest**, and at the **measured** slices-per-case read from the dataset
manifest. It refuses to invent a throughput: a variant with no measured step time is reported as
NOT MEASURED and skipped.

### 4.4 Exact commands used today

```powershell
# candidate manifest, extracted from the PR #35 branch (NOT from main)
# !! CORRECTION 2026-10-01: this PowerShell 5.1 `>` redirect re-encoded the bytes (UTF-8 BOM + CRLF).
# !! It produced the ff1517d0... hash pinned in section 5. The committed blob's SHA-256 is
# !! c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d. Never hash a redirected copy;
# !! hash the blob bytes in Python (section 8, step 2).
git -C <worktree> show origin/codex/path-a-split:data/manifests/split_manifest_path_a_seed2024.json `
  > <scratch>\split_candidate.json

# structural verification
python spikes\spike_c_ml\c1\verify_subsets.py `
  --manifest <scratch>\split_candidate.json `
  --label "C1_PREP/NON-AUTHORITATIVE_DRY_RUN" `
  --json-out <scratch>\c1prep_subset_verify.json

# NEGATIVE CONTROL - the naive package root must be refused
python spikes\spike_c_ml\c1\preflight.py check `
  --split-manifest <scratch>\split_candidate.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --data-root "<package-root>" `
  --gate-data-01 CLOSED --gate-split-01 OPEN --allow-open-gates `
  --label "C1_PREP/NON-AUTHORITATIVE_DRY_RUN/NEGATIVE_CONTROL" `
  --json-out <scratch>\preflight_negative_control.json

# build the allowlisted training-only root (links only, no copies)
python spikes\spike_c_ml\c1\preflight.py make-root `
  --split-manifest <scratch>\split_candidate.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --package-root "<package-root>" `
  --out-root <scratch>\c1_train_only_root

# POSITIVE CONTROL - containment proof against the allowlisted root
python spikes\spike_c_ml\c1\preflight.py check `
  --split-manifest <scratch>\split_candidate.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --data-root <scratch>\c1_train_only_root `
  --gate-data-01 CLOSED --gate-split-01 OPEN --allow-open-gates `
  --label "C1_PREP/NON-AUTHORITATIVE_DRY_RUN" --repo <worktree> `
  --json-out <scratch>\preflight_dryrun.json

# fraction-weighted matrix forecast (one call per candidate variant pair)
python spikes\spike_c_ml\c1\forecast_matrix.py `
  --probe spikes\spike_c_ml\EVIDENCE_RAW\c0_probe_20260916T005659+0700.json `
  --split-manifest <scratch>\split_candidate.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --window-start 2026-09-24 --deadline 2026-10-09 `
  --gpu-hours-per-day 4 --epochs 50 --overhead 1.35 `
  --unet <variant> --dinov2 <variant> `
  --label "C1_PREP/NON-AUTHORITATIVE_DRY_RUN" --json-out <scratch>\forecast_<tag>.json
```

---

## 5 · C1_PREP / NON-AUTHORITATIVE DRY RUN — results

> ### THE FOUR CONSTRAINTS ON EVERYTHING IN THIS SECTION
>
> 1. **This is NOT `SPIKE_C1 ACTIVE`.** Spike C1's status is unchanged. Only the leader may
>    transition it, and only after `GATE-SPLIT-01` is CLOSED.
> 2. **This is NOT accepted C1 evidence.** No C1 acceptance criterion is satisfied by anything below.
> 3. **This CANNOT close `GATE-ML-01`.** `DR-007` requires real-data C1 evidence, and this ran
>    against a candidate manifest with no model executed at all.
> 4. **This is VOID and must be re-run if the manifest changes when the split is frozen.** The
>    input is PR #35's branch head, not `main`. Its SHA-256 is pinned below precisely so that a
>    changed manifest is detectable rather than silently inherited.

**Input pinned:**

| Field | Value |
|---|---|
| Source | `origin/codex/path-a-split` @ `7b72ce83fe09520aefad4eb6f746ed665b9179f1` (PR #35 — **not on `main` on Day 15**; the PR was marked ready for review on 2026-09-21, so "draft" in the first version of this record was wrong. **#35 merged at `f5aa763` on 2026-10-01**, and the merged blob is unchanged) |
| File | `data/manifests/split_manifest_path_a_seed2024.json` |
| **Candidate SHA-256** | `ff1517d00b8da4808e87bf6ab1325148fa3543031c0b5453d2dda11e0bbe3ce0` — **CORRECTION (2026-10-01): this is the hash of a CRLF + UTF-8-BOM copy written by a PowerShell 5.1 `>` redirect (section 4.4), not of the committed file. The committed blob's SHA-256 is `c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d`, at `7b72ce8` and on `main` alike.** Re-encoding the blob as BOM + CRLF reproduces `ff1517d0…` exactly (`test_preflight.py` asserts this). The structural checks below are unaffected, because they parse the JSON; only the pin was wrong. Re-pin from the **blob bytes** (section 8, step 2), never from a redirected copy or the working-tree file |
| `split_id` | `path_a_seed2024_dr002b_v1`, generated 2026-09-21T08:35:11+07:00 |
| Dataset manifest cross-check | manifest's declared source SHA-256 `f64d461f…5ea9` **matches** the `dataset_manifest.json` on `main` — PASS |

### 5.1 `C4` — subsets 20 / 38 / 78, nesting verified BY SET CONTAINMENT

18 / 18 structural checks PASS on the candidate manifest.

| Check | Method | Result |
|---|---|---|
| `NEST-EFF-25-IN-50` | `set(20) ⊆ set(38)` | **PASS** |
| `NEST-EFF-50-IN-100` | `set(38) ⊆ set(78)` | **PASS** |
| `NEST-EFF-25-IN-100` | `set(20) ⊆ set(78)`, checked directly, not inferred transitively | **PASS** |
| `NEST-NOM-25-IN-50`, `NEST-NOM-50-IN-100` | nominal 20 ⊆ 40 ⊆ 80 | **PASS** |
| `TRAIN-ONLY-100` | every effective-100% case ∈ train partition | **PASS** |
| `NO-VALIDATION-LEAK` | subsets ∩ validation = ∅ for all three | **PASS** |
| `NO-HOLDOUT-LEAK` | subsets ∩ 54-case locked holdout = ∅ for all three | **PASS** |
| `PARTITIONS-DISJOINT` | train/validation/holdout pairwise disjoint | **PASS** |
| `EXCL-ABSENT-EVERYWHERE` | `{CASE_0117, CASE_0133}` ∩ every effective subset = ∅ | **PASS** |
| `EXCL-DERIVES-EFFECTIVE-TRAIN` | effective train recomputed as `train − exclusions`, not trusted from the field | **PASS** |
| `EFF-100-EQUALS-EFF-TRAIN` | set equality, both directions | **PASS** |
| `GROUPS-WHOLE-IN-PARTITION` | no correlation group split across partitions | **PASS** |
| `GROUPS-WHOLE-IN-SUBSET` | no group partially present in a nested subset | **PASS** |
| `GROUPS-TRANSITIVE` | union-find over the **declared** groups == declared groups (not independent of them; see below) | **PASS** — 4 declared, 4 recomputed |
| `CENSUS-EXACTLY-ONCE` | 80 + 20 + 54 = 154 = union size = declared count | **PASS** |
| `COUNTS-MATCH-LISTS` | stated `effective_case_count` == `len(effective_case_ids)` | **PASS** |
| `THRESHOLD-DECLARED` | `r >= 0.75`, operator `>=`, declared 2026-09-17 | **PASS** |

**On the QA-003 open question.** QA-003 recorded that "four groups [were] recorded, while an
independent recomputation finds four pairs forming three transitive components". Against the
**regenerated** 2026-09-21 manifest, a union-find over the declared groups finds that the declared
four groups **are** their own transitive components: `{0056,0097}`, `{0057,0128}`, `{0081,0095}`,
`{0117,0133}` — four disjoint pairs, four components. *(Corrected 2026-10-01: an earlier version
called this union-find "independent". It is not, because it runs over the declared groups. The
independent support is the screen's counts. Four disjoint pairs plus the one link give exactly the
declared 5 pairs above threshold and 9 affected cases. Four pairs forming three components would
cover only 7 cases from the groups. `SCREEN-COUNTS-CONSISTENT`, added on Day 22, checks this.)*
The concern appears **resolved by the regeneration**, on this candidate.

**On the fifth above-threshold pair.** The screen reports 5 pairs above `r >= 0.75` and 9 affected
cases. Four pairs are same-partition (the groups above, 8 cases); the fifth is the cross-partition
development→holdout link `CASE_0133 ↔ CASE_0027` (the 9th case). The manifest does **not** merge
that pair into a group — by declared semantics, cross-partition pairs are exclusion signals, not
grouping edges. The consequence is handled the DR-002b (c) way: `CASE_0133` is excluded directly
and `CASE_0117` is excluded by group propagation, so the holdout is never disturbed. **Verified as
internally consistent; this is a design choice correctly implemented, not a defect.**

### 5.2 Data-root containment — negative and positive control

| Run | Data root | `validation_paths_resolved` | `holdout_paths_resolved` | Verdict |
|---|---|---:|---:|---|
| **Negative control** | `<package-root>` (naive package root) | **20** | **54** | **REFUSED**, as designed |
| **Positive control** | allowlisted training-only link root, 78 entries | **0** | **0** | containment PASS |

The negative control is the point: pointing the loader at the obvious root makes **every one of the
54 locked holdout cases and all 20 validation cases reachable**. The preflight caught it and
refused. This is why `make-root` exists, and it is the concrete implementation of the measurement
plan's rule that "a software filter alone is not proof".

The positive-control run still reports `RUNNABLE AS SPIKE C1: False` and
`is_spike_c1_evidence: false`, because `GATE-SPLIT-01` is declared `OPEN`. **The one FAIL in that
run is `GATE-STATE`, and it is a correct FAIL.** *(Day 22 note: the Day 15 containment PASS
checked entry names only, and QA showed that is not enough. The Day 22 `check` verifies link
targets and file identities. See section 11.)*

### 5.3 Evidence files

Committed under `management/day15/c1_prep_evidence/`:

| File | Contents |
|---|---|
| `c1prep_subset_verify.json` | the 18 containment checks, with the candidate manifest SHA-256 |
| `preflight_negative_control.json` | the refusal: the counts of resolved validation/holdout paths (20 + 54 = 74) and the first 10 hits of each (20 paths stored, not 74) |
| `preflight_dryrun.json` | the containment proof, the measured environment block, the 78 selected case IDs and their JSON pointer |
| `forecast_*.json` | the calendar arithmetic, machine-generated, with assumptions separated from measurements |

Raw NRRD bytes, checkpoints and restricted linkage scores remain outside Git, per the data policy.

---

## 6 · `C5` — SIX-RUN WALL-CLOCK FORECAST AGAINST DAY 30

### Provenance of every input

| Input | Provenance |
|---|---|
| ms per train step | **MEASURED** — but by C0, on **synthetic** data, on the **RTX 4050**. Not a C1 number. |
| slices per case = 88 | **MEASURED** — from `dataset_manifest.json`, uniform across all 154 cases. The script refuses to proceed if depth is non-uniform. |
| effective subsets 20 / 38 / 78 | **READ** from the candidate manifest's `effective_case_ids` lists. |
| epochs = 50 | **ASSUMPTION. NOT MEASURED.** Unmeasured until `C1-6` convergence evidence exists. |
| overhead ×1.35 | **ASSUMPTION. NOT MEASURED.** Inherited from C0. |
| GPU hours/day = 4 | **SELF-REPORTED** by the owner on 2026-09-16, for **his** machine. Not the leader's capacity. |
| ablation priced as the most expensive core run | **ASSUMPTION**, deliberately conservative. |

### Result — the matrix is far cheaper than C0 estimated

Because C0 priced all seven runs at the full 80-case partition while the real matrix trains on
20 / 38 / 78, the fraction-weighted total is **substantially lower** than C0's table:

| Candidate pair | 6 core runs | + 1 ablation | **Total** | Days at 4 h/day |
|---|---:|---:|---:|---:|
| **A** `unet_base16_depth4` + `dinov2_s14_frozen_progressive` | 7.30 h | 2.42 h | **9.72 h** | 2.43 |
| **B** `unet_base32_depth4` + `dinov2_s14_full_progressive` | 18.79 h | 5.76 h | **24.55 h** | 6.14 |
| **C** `unet_base32_depth4` + `dinov2_b14_full_progressive` | 33.82 h | 14.38 h | **48.20 h** | 12.05 |

**Notable correction to the C0 record.** C0's flat pricing declared `dinov2_b14_full_progressive`
**DOES NOT FIT** at either 4 or 5 h/day (25.81 and 20.65 days). Priced at the actual subset sizes it
is 12.05 days at 4 h/day. **C0's "does not fit" verdict for the B/14 full variants was an artefact
of pricing every run at 80 cases.** This does not close anything — the epoch count is still an
assumption and the throughput is still synthetic — but the leader should not discard B/14 on C0's
calendar verdict alone.

### Does it fit before Day 30 (2026-10-09)?

**Window 1 — the full nominal remainder, 2026-09-24 → 2026-10-09, 15 days, 60 GPU-h at 4 h/day:**

| Pair | Total | Headroom | Verdict |
|---|---:|---:|---|
| A | 9.72 h | +50.28 h | FITS |
| B | 24.55 h | +35.45 h | FITS |
| C | 48.20 h | +11.80 h | FITS |

**Window 2 — a realistic training window, 2026-09-25 → 2026-10-03 (Day 16 → Day 24), 32 GPU-h.**
*This window is a planning judgement, not a measurement:* it reserves Days 25–30 for holdout
evaluation, RQ-A/RQ-B analysis, `GATE-IMG-01`, product integration and demo rehearsal, none of
which can happen while the matrix is still running.

| Pair | Total | Headroom | Verdict |
|---|---:|---:|---|
| A | 9.72 h | +22.28 h | FITS |
| B | 24.55 h | +7.45 h | FITS, thin |
| C | 48.20 h | **−16.20 h** | **DOES NOT FIT** |

**Window 2 with the epoch assumption doubled to 100** — the single assumption most likely to be
wrong, and it is wrong in the expensive direction:

| Pair | Total | Headroom | Verdict |
|---|---:|---:|---|
| B | 49.11 h | **−17.11 h** | **DOES NOT FIT** |
| C | 96.37 h | **−64.37 h** | **DOES NOT FIT** |

### The plain statement, not softened

**GPU-hours are not the binding constraint. Access and calendar days are.**

The arithmetic says the matrix fits comfortably — *given a compute host running 4 h/day starting
tomorrow*. Neither half of that is currently true. Today is Day 15 of 30, **zero training runs have
ever executed in this project**, M6 has not started, and the approved compute host is not reachable.
Every day the host stays offline removes 4 GPU-hours from a budget that only pair C strains.

**What would have to change, named:**

1. **A compute host must be available within 24–48 hours.** This is the whole problem. Nothing else
   on this list matters until it is solved. See section 1(f).
2. **`GATE-SPLIT-01` must close today.** PR #35 merges cleanly into current `main` with no conflicts.
3. **The epoch count must stop being an assumption.** `C1-6` convergence evidence is what converts
   50 from a guess into a basis. If real convergence needs 100 epochs, pair B stops fitting the
   realistic window and the recipe must shrink **before** `GATE-ML-01` freezes it — never mid-matrix.
4. **If the host is the leader's 4 GiB card**, the memory fit table must be re-measured at 4 GiB and
   the hours/day basis rebuilt on the leader's availability. C0's 6 GiB fit table does not transfer.
5. **If it still does not fit**, `DR-007`'s named remedy applies: reduce input resolution or model
   size **before** freezing the recipe, and record the change as part of `GATE-ML-01`.
   `00` §9 and PR-SCI-03 permit a smaller-but-honest experiment. What they forbid is changing the
   protocol after seeing results.

### A PR-SCI-03 warning about pair A

Pair A is the cheapest by a wide margin, and the C1 measurement plan names
`dinov2_s14_frozen_progressive` for the convergence sanity trial. **Selecting a *frozen* DINOv2
backbone for the matrix because it fits the calendar, while giving UNet a fully-trained baseline,
would systematically disadvantage DINOv2.** PR-SCI-03 forbids tuning evidence to force the
reference-paper direction — and the mirror-image error, quietly handicapping DINOv2 for
convenience, is the same failure of protocol integrity. This must be an explicit, pre-declared
decision recorded at `GATE-ML-01` in `ADR-ML-001`, not a default inherited from a throughput table.
**Flagged for the leader; not decided here.**

---

## 7 · `C6` — IMAGING PREREQUISITES THAT WOULD CORRUPT RESULTS IF IGNORED

### 7.1 DR-011 per-volume normalization — DECIDED, and already configured

**Per-image / per-volume normalization only, plus fixed pretrained-model constants where the
backbone requires them, applied identically across model families and all data fractions. No
cohort-fitted statistic anywhere.** C0 used a per-volume p0.5/p99.5 clip and [0,1] scale, and its
record states no cohort-fitted statistic was used.

**Why it would corrupt the result.** The whole point of `EXP-D-025/050/100` is that data *fraction*
is the only thing that varies. A statistic fitted on each fraction's own cohort makes the
preprocessing itself a function of the fraction, and the measured effect stops being attributable
to data quantity. This is `RISK-CONFOUND-01`. `C1-7` must confirm conformance at runtime, not just
in configuration, and `preprocessing_version` must appear in every `08` §10 manifest.

### 7.2 Physical geometry NOT VERIFIED — mm / mL reporting stays DISABLED

Every case in `dataset_manifest.json` carries `space_origin [0,0,0]`, `space_directions` = the
identity basis and `spacing [1,1,1]`. **That is an identity placeholder, not measured physical
voxel spacing.** The released package does not carry real spacing.

**Therefore:** any volume computed from these masks is in **voxels**, and **must not be reported in
mm or mL**. A voxel count multiplied by an assumed 1 mm³ is a fabricated physical measurement.
Under `DR-012` the project accepts axis-aligned geometry only and rejects anything else with
`GEOMETRY_NOT_VALIDATED`; the data is axis-aligned, so it is *ingestible* — but ingestible is not
the same as physically calibrated.

**Status: mm/mL reporting DISABLED. Not a `C1` blocker, but a hard constraint on every downstream
number, including the demo.** `C1-5` measures LA boundary thickness **in voxels** for exactly this
reason, and the C1 plan already specifies voxels.

### 7.3 GATE-IMG-01 morphology config — OPEN

`DR-G04`: `GATE-IMG-01` closes on a **frozen morphology config derived from development/validation
evidence only**, and it depends on `DR-G03` (`GATE-ML-01`). It has **not started**, and it gates
`EXP-D-PP`.

**Why it would corrupt the result.** Post-processing morphology (hole filling, largest-connected-
component, closing radius) can move a Dice score materially. If it is tuned after seeing holdout
predictions, the holdout is contaminated and the 54-case evaluation is no longer a clean final
evaluation. The config must be frozen on development/validation data **before** the holdout is
touched. **NOT MEASURED. Needs: the first real segmentation outputs on validation data, which
needs a completed training run, which needs a compute host.**

### 7.4 Input resolution — chosen for arithmetic convenience, not yet validated on anatomy

560×560 was chosen in C0 because neither released shape (576×576×88, 640×640×88) is a multiple of
the ViT's 14-pixel patch, and 560 is divisible by both 14 and 16. **Both released cohorts are
resized to a common size, which is a real interpolation of real anatomy, and it has never been
evaluated against real LA boundaries.** That is `C1-3` and `C1-5`. **NOT MEASURED.**

---

## 8 · PHASE 2 / PHASE 3 — NOT ENTERED, AND WHY

**Phase 2 was not entered.** It requires the leader to confirm `GATE-SPLIT-01` is CLOSED. As of
writing, PR #35 has not landed and the gate is OPEN. No training run was started. *(Update
2026-10-01: #35 merged at `f5aa763` on 2026-10-01.)*

**Phase 3 was not entered, and could not have been.** `GATE-ML-01` stays OPEN.

### `C3` — C1 acceptance criteria as they stand right now

**Every one of the ten C1 criteria is NOT MEASURED.** Nothing is rounded up.

| Criterion | Status | What it needs |
|---|---|---|
| `C1-1` real-data peak memory | **NOT MEASURED** | a compute host + the frozen split |
| `C1-2` real-data wall-clock | **NOT MEASURED** | a compute host + the frozen split, **including data-loading I/O**, which no C0 number contains |
| `C1-3` practical input resolution | **NOT MEASURED** | the predeclared 112-step grid from 560 trialled on real volumes |
| `C1-4` decoder behaviour on real LA anatomy | **NOT MEASURED** | forward passes on real cases, both families |
| `C1-5` output resolution vs LA boundary thickness | **NOT MEASURED** | per-case boundary measurement in voxels on training-only masks |
| `C1-6` convergence sanity, both families | **NOT MEASURED** | an equal-budget convergence trial. **This also converts the epoch assumption in section 6 into a basis.** |
| `C1-7` DR-011 conformance at runtime | **NOT MEASURED** — policy configured (C0), runtime conformance unverified on real data |
| `C1-8` subset provenance | **PARTIAL, AND IT DOES NOT COUNT.** Structure verified today against a **candidate** manifest; the criterion requires the **frozen** manifest on `main`. **Recorded as NOT MEASURED.** |
| `C1-9` final calendar verdict | **NOT MEASURED** — section 6 is C0-throughput arithmetic, explicitly not the C1 verdict |
| `C1-10` every `ADR-ML-001` field evidenced | **NOT MEASURED** |

### Recommendation on `GATE-ML-01`

**`GATE-ML-01` STAYS OPEN.** Zero of ten C1 criteria are satisfied. I am not recommending closure,
and no dry run, candidate-manifest verification or C0 measurement can be offered toward it.

### The first real run, ready to launch the moment a host exists

Not started. Listed so that it can start within minutes of the two blockers clearing:

1. **Preconditions:** leader confirms `GATE-SPLIT-01` CLOSED and #35 on `main`; a compute host is
   named and available.
2. **Re-pin from the blob bytes, never from the working-tree file.** *(Corrected 2026-10-01.
   The earlier text said "`data/manifests/**` is `-text`, so the working-tree file is byte-identical
   to the blob". That is wrong. `.gitattributes` line 40 sets `data/manifests/** -text`, but line 48,
   `*.json text eol=lf`, comes later and wins for every JSON file. `git check-attr` reports
   `text: set`, `eol: lf`. A fresh checkout is LF and matches the blob. A copy re-saved with CRLF
   hashes differently, and `git diff` still shows nothing, because git normalises line endings
   before comparing.)* Hash the bytes git returns, in Python:
   ```python
   import hashlib, subprocess
   blob = subprocess.run(["git", "cat-file", "blob",
                          "main:data/manifests/split_manifest_path_a_seed2024.json"],
                         capture_output=True, check=True).stdout
   print(hashlib.sha256(blob).hexdigest())
   ```
   Compare the result with `c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d`, the
   committed candidate blob. The earlier `ff1517d0…` was the hash of a redirected copy. Pass it to
   `preflight.py check --expect-split-sha256`. Never pipe the blob through a PowerShell `>`
   redirect. **If the hash differs, every figure in section 5 and section 6 is void and must be re-run.**
3. **Re-run preflight** with `--gate-split-01 CLOSED` and **without** `--allow-open-gates`, against
   a freshly built training-only root (Day 22: `make-root --layout hardlink`, and `check` with the
   now-required `--package-root`; section 11). It must report `runnable: true`,
   `validation_paths_resolved: 0`, `holdout_paths_resolved: 0`.
4. **Then, and only then,** the leader may transition `SPIKE_C1` to `ACTIVE` — that is his
   transition, not mine.
5. **First run:** the `C1-6` equal-budget convergence sanity trial, both families, per
   `C1_MEASUREMENT_PLAN.md` §5 run order — preflight, one case loaded and verified, one
   forward/backward/reload cycle per family, then the trial. It is the shortest path to converting
   the epoch assumption into a measurement, which is what section 6's forecast actually depends on.
6. **How to check on it:** the run writes `c1_preflight_<ts>.json`, `c1_measurements_<ts>.json` and
   `c1_loss_<family>.jsonl` to a run directory outside Git. Morning check: confirm the preflight
   JSON says `runnable: true` and `holdout_paths_resolved: 0`, then read the loss JSONL for a
   decreasing trend with no NaN/Inf. **A `NEGATIVE_RESULT` is a valid outcome and is recorded as
   one, not retried until it looks better.**

---

## 9 · HANDBACK LIST FOR BẾ QUỐC KHÁNH — DAY 16

Ownership of Spike C0 and Spike C1 never left him. `RECOVERY_OVERRIDE_DAY15` expires at 23:59
today and `DR-013` ownership returns in full. Everything below is his to accept, correct or reject.

| # | Item | What it is | What Khánh must do |
|---|---|---|---|
| **H1** | `spikes/spike_c_ml/c1/verify_subsets.py` | Set-containment verifier for the split manifest | **Review and adopt or replace.** Written by recovery support, not by the owner. |
| **H2** | `spikes/spike_c_ml/c1/preflight.py` | Fail-closed gate/subset/data-root preflight, with `make-root` | **Review and adopt.** He must re-run it himself on the frozen manifest — the `C1-8` provenance record must be produced by the owner on the real compute. |
| **H3** | `spikes/spike_c_ml/c1/forecast_matrix.py` | Fraction-weighted calendar arithmetic | **Review the arithmetic and challenge it.** Then decide whether it supersedes or complements `harness/extrapolate.py`. |
| **H4** | The candidate-manifest dry run (section 5) | 18/18 structural checks on PR #35's branch head | **Void on manifest change.** Re-run against `main` once #35 lands. Compare the **blob** SHA-256 with `c5c65a09…396d` (section 8, step 2). *(Corrected 2026-10-01: this row first said `ff1517d0…3ce0`, which is the redirected copy's hash.)* |
| **H5** | The C0 calendar correction (section 6) | B/14 full was declared "DOES NOT FIT" on flat 80-case pricing; fraction-weighted it is 12.05 days at 4 h/day | **Confirm or refute.** If confirmed, `SPIKE_C_ML/RESULT.md`'s calendar table needs an owner-authored correction. **I did not edit `RESULT.md`.** |
| **H6** | The compute-host question (section 1) | Approved host is his RTX 4050; it was unavailable today | **His availability declaration is the input nobody else can supply.** If a second host is added, he must re-measure memory and throughput on it. |
| **H7** | The `C1-6` convergence trial | Not started | **Owner work on real compute.** `TASK.md`: "All hardware and timing measurements are executed by Bế Quốc Khánh on the real compute." |
| **H8** | The PR-SCI-03 frozen-vs-full concern (section 6) | Choosing frozen DINOv2 for cost would handicap DINOv2 | **Owner opinion required** before `ADR-ML-001` freezes the recipe. |
| **H9** | `PROJECT_STATE.yaml` `SPIKE_C1.blocked_by` | Stale: `[SPIKE_D]`, should be `[GATE-SPLIT-01]` | **Project Control action** (leader). I did not edit it. |
| **H10** | PR #35 follow-ups | The QA-003 transitivity question appears resolved on the regenerated manifest (section 5.1); PR #34's owed follow-up (F13 anomalies/`package_findings`, F12 regeneration command) is still open | **Owner confirms** the transitivity resolution and closes the #34 follow-up. |
| **H11** | The allowlisted training-only root | Built in a session scratch directory as links | **Ephemeral. Not a project artefact.** He should build his own on his host with `preflight.py make-root`. |

### What was NOT done today, deliberately

- No training run, real or trial. No model executed.
- No `SPIKE_C1` state transition. No gate transition. No `PROJECT_STATE.yaml` edit.
- No edit to `docs/specs/v1.0/**`.
- No edit to `management/spikes/SPIKE_C_ML/RESULT.md` — it is the owner's evidence document.
- No merge, no push to `main`.
- No compute-architecture change, and no compute host chosen.
- No file or directory deleted.
- No number invented. Everything unmeasured is written **NOT MEASURED**.

---

## 10 · WHAT THE LEADER NEEDS TO DECIDE, IN ORDER

1. **P0 — name a compute host** (section 1(f)). Nothing in M6 can start until this is answered.
   Three options are laid out; I have not chosen among them.
2. **Land PR #35 and close `GATE-SPLIT-01`.** It merges cleanly into current `main`, 6 ahead /
   4 behind, no conflicts. QA remains mandatory for it under the override. *(Update 2026-10-01:
   #35 merged at `f5aa763` on 2026-10-01.)*
3. **Correct `SPIKE_C1.blocked_by`** from `[SPIKE_D]` to `[GATE-SPLIT-01]`.
4. **Decide the frozen-vs-full DINOv2 question before `GATE-ML-01`**, on scientific grounds, and
   record it (section 6, PR-SCI-03 warning).
5. **Accept that `GATE-ML-01` does not close on Day 15.** Zero of ten C1 criteria are measured.
   The override waives review, not evidence.

---

## 11 · DAY 22 ADDENDUM — QA FIXES (CHAT E), 2026-10-01

Made under the **Day 22 recovery override**. The block owner is **Bế Quốc Khánh**, who takes it back
on D23. An independent QA review (CHAT E) reproduced three BLOCKING defects in the harness. There is
also a new requirement: a hard-link root that `ml/data.py` can use. Sections 1–10 above remain the
Day 15 record, annotated where they were wrong.

### 11.1 BLOCKING 1 — `check` trusted entry names, not link targets

QA built roots in which every entry name was allowlisted but one link pointed at a validation case
directory, or at the package parent (holdout reachable at `root/CASE_0055/Testing Set/…`). Both were
certified `runnable: true`. `check` now requires `--package-root`, uses stat calls only, and
verifies every top-level entry:

| Entry | Accepted only if |
|---|---|
| any | its name is an effective-training case id |
| symlink / junction | it resolves to **exactly** `package_root/source_dir_relative` of that case, and that directory holds only regular files the dataset manifest declares for the case |
| real directory (hard-link layout) | it holds **exactly** the MRI and the mask, both regular files with no subdirectory and nothing else, each `os.path.samefile` with the package file |
| anything else | never: a top-level file, a nested link, any other reparse point |

It also requires the following. No entry may resolve to, inside, or above a validation or
final_holdout case directory. No file under the root may be the same file (`st_dev`, `st_ino`) as
any validation or holdout MRI, mask or companion volume. The root must not be equal to, inside, or a
parent of the package root, and must not sit inside a git work tree. `validation_paths_resolved` and
`holdout_paths_resolved` now count a case as reachable through any of these routes, not only through
the Day 15 name probes.

### 11.2 The hard-link layout (`make-root --layout hardlink`, now the default)

`ml/data.py` (PR #60) requires each resolved file to stay inside the root it is given, and a
junction resolves back into the package. For each of the 78 ids in
`training_subsets.100_percent.effective_case_ids`, `make-root` therefore creates
`root/<CASE_ID>/lgemri.nrrd` and `root/<CASE_ID>/laendo.nrrd` as `os.link`s to the package files. It
links nothing else; companion volumes are left out. It refuses an out-root inside a git work tree,
an out-root equal to, inside, or above the package root, and an out-root on another volume (hard
links cannot cross volumes). It never overwrites or deletes anything. `--layout junction`, the
Day 15 layout, still works and passes the same `check`.

### 11.3 BLOCKING 2 — the stated mechanism of the hash correction

The mechanism is now stated correctly in section 8, step 2. `*.json text eol=lf` overrides
`data/manifests/** -text`, so re-pin from the git **blob bytes** hashed in Python. Section 4.4 is
annotated: the `> split_candidate.json` redirect produced `ff1517d0…`, and the blob hashes to
`c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d`.

### 11.4 BLOCKING 3 — the leakage chain is recomputed

`verify_subsets.py` now runs a union-find over the declared groups **plus**
`development_to_holdout_links`. It fails if any effective training case, in any subset, shares a
component with a validation or final_holdout case (`LEAKAGE-CHAIN-CLEAN`). It **derives** the
exclusions as the group closure of the linked development cases and compares them with
`training_exclusions` and with each subset's `excluded_case_ids` (`EXCL-DERIVED-FROM-LINKS`,
`SUBSET-EXCLUSIONS-DERIVED`). It checks `pair_count_above_threshold` and `affected_case_ids` against
the groups and links (`SCREEN-COUNTS-CONSISTENT`: 5 pairs = 4 groups + 1 link; 9 affected cases).
With the dataset manifest supplied, as `preflight.py` always does, it also checks the census by **set
equality** (`CENSUS-SET-EQUALS-DATASET`), so an invented id cannot hide behind a correct count.
`preflight.py` no longer hard-codes the exclusions. Its named `CASE_0133` / `CASE_0117` check is now
only a cross-check against DR-002b, run on the derived set. On the merged manifest every check
passes. The component `{CASE_0027, CASE_0117, CASE_0133}` is wholly out of training.

### 11.5 Exit codes, and the self-test

`check` exits 0 when the root is runnable. It exits 1 when it refuses: any check other than the gate
state failed, or a gate is OPEN and `--allow-open-gates` was not passed. It exits 2 for a labelled
**dry run**: a gate is OPEN, `--allow-open-gates` was passed, and every other check passed. Before
Day 22, `--allow-open-gates` had no effect.

`python spikes/spike_c_ml/c1/test_preflight.py` reads no dataset bytes. It uses the committed
manifests, read as git blob bytes, and a synthetic package of placeholder files in a temp dir. It
asserts the following:

- A hard-link root and a junction root are both runnable.
- These are all refused:
  - a junction under an allowlisted name pointing at a validation case directory;
  - a junction pointing at the package root or at its parent;
  - a hard link of a holdout file under an allowlisted name;
  - an extra file in a case directory;
  - a missing case;
  - the naive package root.
- The pin `ff1517d0…` fails and `c5c65a09…` passes.
- A new dev→holdout link on a case still in training fails `verify_subsets`.
- An invented id in the census fails.
- The `make-root` refusals hold.

It prints a summary and exits non-zero on any failure.

### 11.6 The Day 22 commands for the real run (outputs outside Git)

```powershell
python spikes\spike_c_ml\c1\test_preflight.py

python spikes\spike_c_ml\c1\preflight.py make-root --layout hardlink `
  --split-manifest data\manifests\split_manifest_path_a_seed2024.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --package-root <package-root> --out-root <data-dir>\c1\root_hardlink

python spikes\spike_c_ml\c1\preflight.py check `
  --split-manifest data\manifests\split_manifest_path_a_seed2024.json `
  --dataset-manifest data\manifests\dataset_manifest.json `
  --data-root <data-dir>\c1\root_hardlink --package-root <package-root> `
  --gate-data-01 CLOSED --gate-split-01 CLOSED `
  --expect-split-sha256 c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d `
  --operator "Day 22 recovery override (leader account)" --label C1-PREFLIGHT-DAY22 `
  --json-out <data-dir>\c1\preflight_day22.json
```

`GATE-SPLIT-01` closes on QA-005 PASS of the merged split. The leader's session records that
transition; this document does not.

### 11.7 Day 22 real-data acceptance, 2026-10-01 11:47 +07:00 (stat and `os.link` only)

The code was at commit `1f6ff5b` (`repo_c1_code_dirty: false`). The gates were **declared** by the
operator as instructed for the Day 22 run. Both JSON files are outside Git. The paths below are
written as placeholders.

| Run | Data root | Result | `validation_paths_resolved` | `holdout_paths_resolved` | JSON (SHA-256 of the file) |
|---|---|---|---:|---:|---|
| `make-root --layout hardlink` | `<data-dir>\c1\root_hardlink` | 78 linked, 0 failed. 78 case dirs, 156 hard links (MRI + mask), no companion volumes | — | — | — |
| `check`, `C1-PREFLIGHT-DAY22` | that root | **RUNNABLE**, exit 0. 41/41 checks pass. `is_spike_c1_evidence: true`. Split pin `c5c65a09…396d` matches. Derived exclusions `CASE_0117`, `CASE_0133` | **0** | **0** | `<data-dir>\c1\preflight_day22.json` (`aa0c85ba…8f93`) |
| `check`, negative control | `<package-root>` (naive) | **REFUSED**, exit 1. Failing checks: `ROOT-NOT-PACKAGE`, `ROOT-IS-ALLOWLIST-ONLY`, `ENTRY-TARGETS-VERIFIED`, `NO-FILE-IS-VALIDATION-OR-HOLDOUT`, `VALIDATION-UNREACHABLE`, `HOLDOUT-UNREACHABLE`, `TRAINING-COMPLETE` | **20** | **54** | `<data-dir>\c1\preflight_day22_negative_control.json` (`6810a632…d38f`) |

The preflight is runnable. That is **not** a C1 result. Zero of the ten C1 criteria are measured by
it, and `GATE-ML-01` stays OPEN.
