# QA review: PR #66, Spike B real-mesh frontier (B5, B9, B12) · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, independent QA reviewer.** I am an LLM session (Claude) running under the team leader's account, not a second human. |
| PR | #66 "evidence(spike-b): real-mesh decimation frontier and offline picking error (B5, B9, B12)" |
| Reviewed at | head `2e4463d421fc860a3377d6047d5060eb37e337e3` (= `origin/spike-b/day22-real-mesh-frontier`; `ae247fa` on base `f5aa763`). It merges cleanly onto the current `origin/main` `b606295` (`git merge-tree`, no conflicts). Main's later `build_mesh.py` change touches only `build()`, not `extract_surface`/`decimate`, so the evidence stays valid after merge. |
| Where | My own detached worktree. Nothing committed, pushed, commented or approved. The main checkout was not touched: its reflog's last entry is 11:32, before this review began. |
| Run window | 12:04–12:25 (+07) |
| Data read | Only `CASE_0059` `laendo.nrrd`. Split manifest: `train=true`, `validation=false`, `final_holdout=false`, lowest-numbered case in the 25% effective set. File SHA-256 matches the JSON. |
| Outputs | Scratchpad outside git: five rerun OBJs and `l1_fail_detail.json`, both derived from a real patient. Nothing deleted; the leader decides on cleanup. |
| **Resource incident (mine)** | My first full rerun used the harness default `--workers` (cpu−2 = 18). It exhausted RAM at about 12:11 and the leader's C1 GPU job died OOM. I stopped my process tree (pid 28728 and its children) at 12:13:52. Every later check ran single-process, under 300 MB. **pid 17924 `backend_real_pick_diag.py` is not mine.** It was started 12:11:59 from parent 15000. I did not touch it. |
| **Samples (reduced, as instructed)** | **L1:** every failing ray was localised, 395/395. They were found by computing the exact ground truth for all 3,437 rays where the L0 and L1 picks differ, plus 12,000 random rays. **L0:** the 12,000-ray random sample (3,537 meet the mask) plus a 1,750-ray convention sample. **march vs exact:** 2,500 rays that meet the mask. **L2–L4 B5/B9:** not re-run; only their OBJ hashes were checked. |

## Checks

| # | Check | Command | Result | Status |
|---|---|---|---|---|
| 1a | PR test | `python spikes/spike_b_3d/harness/test_real_mesh_frontier.py` | `25 passed`, exit 0 | PASS |
| 1b | Conformance | `python spikes/spike_b_3d/harness/conformance.py` | 33 points and 13 rays conform, 0 findings | PASS |
| 1c | Compile | `python -m py_compile` on `real_mesh_frontier.py`, `picking_error.py`, `build_mesh.py` | exit 0 | PASS |
| 1d | `picking_error.py` synthetic run · `node app/test_obj.mjs`, `test_picking.mjs` | as named | Not run to completion. These files are unchanged by the PR. They need synthetic OBJs generated into the tracked `mesh/out/`; the node tests stop with ENOENT on `level_0_cell1.obj`. The `picking_error` functions the PR reuses were exercised directly in checks 2–4. | NOT RUN |
| 2 | Reproduce L0 and L1; coordinate frame end to end | PR harness rerun (`--mesh-out`/`--evidence` in scratch) up to the mesh stage, then `scratchpad/loc2.py`, which imports the PR's own functions | **All 5 OBJs are byte-identical** to the JSON (SHA-256 and size). L0 is 30,714 V / 61,424 T; L1 is 19,683 V / 39,384 T. **L1 B5 reproduced exactly:** 395 failures = 211 no-hit + 184 with error > 1; interior max 29 with 60 no-hits, tangent 8/52, oblique 16/99; B9 = 51 navigations. L0 sample: 0 no-hits, max 1, 0 background navigations. **Frame:** see the chain below. | PASS |
| 3 | Error localisation on L1 | `loc2.py`, `loc3.py` | The errors are real; there is no frame bug. **0 odd-multiplicity edges at every level (L0–L4), so no mesh has holes.** All 211 L1 no-hits have an exact maximum EDT of 1.0 along the whole ray. The 184 errors > 1 split three ways: **67 local** (L1 lands on the same mask run; errors 2/3/4 = 60/5/2); **77 cross-structure** (the first run is a clip or a 1-voxel-thin ledge: 77/77 have EDT ≤ 1, 68/77 are shorter than 1 voxel; L1 lands on the *next* mask run after background; errors 2–29); **40 inflated silhouette** (L1 surface where the ray's column has no mask voxel; hit ≤ 1.41 voxel from the mask; errors 2–16). Accelerated and brute-force picks agree on 395/395. | PASS (README mechanism wrong → B-1) |
| 4 | Ground-truth change | `loc2.py` | On 2,500 rays: 2,461 same slice, 35 different, 4 where the march finds nothing. **All 39 disagreements cross the exact first voxel for < 0.25 voxel (max 0.208).** Every ray crossing its first voxel for ≥ 0.25 agrees, so the march defect is real. Translating L0 by +5 slices gives errors centred on 5 (235 at 5, 127 at 6, 82 at 4; 32 no-hits of 600), so the truth does not read the mesh. **L0 passes by construction**, though: all 61,424 of its triangles are mask boundary faces (fg behind, bg in front), so its only possible error is the floor rule. In the sample, 336/336 error-1 cases are +z-face-from-above entries and every other entry has error 0. The switch flips L0 from NOT WITHIN (march: max 17, 86 navigations) to WITHIN; L1–L4 fail under both truths. | PASS |
| 5 | B9/B12 numbers re-derive from the committed JSON | JSON vs README, cell by cell | Frontier table, cohort table, slices/mm, ray totals (33,085 + 80,717 = 113,802; 62 bundles), 715 + 86 = 801 disagreements, B9 statements: all match. "One connected component" is verified (6- and 26-connectivity). **Defect:** in `no_hit_max_inside_depth_voxels`, the ">4" buckets (L1 36, L2 65, L3 78, L4 81) hold rays whose sampled depth is 0, because `bucket(0)` falls through to ">4". Verified 36/36 at L1. The harness docstring's "13 slices / 41 navigations" does not match the README/JSON "17 / 86". | PASS with defect |
| 6 | Scientific honesty | read | The DR-008c consequence is stated: L0, 61,424 triangles, otherwise `NEGATIVE_RESULT`, bound not widened. Alternative decimators are called untested. **However,** the "holes / far wall / 36 more than 4 voxels deep" mechanism is contradicted by measurement, and "no-hole constraint" points at the wrong fix. The ≥ 20 FPS bar is not spelled out, nor that #44's B10/B11 PASS was on 5,648 synthetic triangles (`MEASUREMENT_B10_B11.md`). | FAIL (B-1) |
| 7 | Publication hygiene | `git diff --numstat`, path/IP/serial grep | 6 files; largest is the JSON at 63,270 B. No OBJ, CSV, NRRD or NPY files. `spikes/**/mesh/out_real/` is ignored. No hostnames, IPs or adb serials. **Two findings:** an absolute data path as the code default and in the README, and a per-data-file SHA-256 in the public JSON (F5). | PASS with findings (B-2, N-4) |

**Frame chain (check 2):**
- NRRD `sizes 640 640 88`, identity `space directions`, origin 0, LPS. pynrrd F order gives (x, y, z), with z the 88-slice axis (foreground in slices 23–78).
- world = origin + voxel·spacing = voxel.
- The L0 vertex bounding box `[297,309,23]–[453,385,79]` is exactly `[lo, hi+1]`.
- L1 keeps the same bounding box. Its centroid shifts by only (0.07, −0.01, −0.07), so there is no re-centring. Maximum vertex move is 0.98 (|dz| ≤ 0.80).
- The clustering cell is applied in voxel coordinates before `to_world`.
- Rays are built and walked in the same frame; the slice is taken by floor (DR-008a).

**Result:** no z/x swap, no double or missing spacing, no mm/voxel mix-up (spacing is 1), no origin offset, and no off-by-one beyond the documented boundary rule.

**Worked examples (check 3, voxel units):**
- **Error 29, `interior/el-60_az180/11/9`.** The ray enters voxel (452,341,75) for only 0.226 voxel. The L0 hit is (453.000, 341.110, 75.196), slice 75, which equals the truth. x = 452 and 453 fall in the same 1.25 cell (key 362), so the +x face moves to x ≈ 452.5; for example (453,340,76) becomes (452.5,340,76). The ray misses and lands on the next run at (436.144, 341.110, 46.000), slice 46.
- **Error 28, `interior/el+90/10/47`.** A vertical ray at (437.83, 338.11) passes a mask ledge one voxel wide (x = 437, z = 42–44; x = 438 is background). x = 437 and 438 share a key, so the ledge collapses to x ≈ 437.5. L0 hits z = 42; L1 hits z = 70.
- **Early hit, `interior/el-90/16/40`.** L1 hits at z = 72.52, which is 8.5 voxels before the column's first mask voxel. It is an inflated neighbouring structure.

**Answer to the main question:** the cell size bounds the *surface* displacement (≤ 0.98 voxel at L1), not the *slice error*. When a sub-voxel shift removes the first surface a ray meets, or adds one, the error is the distance to the next surface along the ray. In a 56-slice left atrium that is tens of slices. The 29–40-slice errors are real for this metric, not a coordinate, units or axis bug.

## Findings

### BLOCKING

**B-1. The README states the wrong failure mechanism, and the depth buckets are mislabelled.**
- Where it appears:
  - README, "Result in one paragraph": "opens holes; rays pass through and hit the far wall".
  - README, "Where the decimated failures come from": "36 go more than 4 voxels deep — holes".
  - README, Limits: "no-hole constraint".
  - In the harness, `bucket()` and the 0.25-step `field_along` depth, which has the same defect as `march_mask`.
- Fix:
  1. In `bucket()`, give v == 0 its own bucket, and compute depth from the exact traversal.
  2. Rerun with `--workers 2` and regenerate the JSON.
  3. Rewrite the mechanism: sub-voxel silhouette shifts plus collapse of 1-voxel-thin structures, with the error being the distance to the next surface; and L1 also has 67 local errors of 2–4 slices.
  4. Remove "no-hole". Say that any simplifying decimator, quadric included, is expected to show this class of error on this ray set, and that this is untested.
  5. Optionally, report the local / cross-structure / inflated split per level.
- **Owner:** A4 (under the Day 22 override). Vũ Hùng Anh confirms on Day 23.

**B-2. A per-data-file hash is in the public repo, against F5.**
- `case.mask_file_sha256` is in the committed JSON. The leader's F5 decision of 2026-09-16 (`DATASET_AUDIT.md`, "Restricted per-file checksum manifest") keeps per-data-file SHA-256s out of the public repo.
- Fix: drop the field, keep it in a gitignored `out_real/` sidecar or cite the restricted manifest, and update the matching line in `PROVENANCE.md`. It is a one-line change; the leader may waive it explicitly.
- **Owner:** A4.

### NON-BLOCKING (owner A4 unless noted)

1. **N-1.** Say in the README that L0 passes by construction (its surface is the mask boundary). Its PASS is a cross-check of two code paths plus the cost of the floor rule, not evidence of picking robustness.
2. **N-2.** State the consequence in full. DR-008c = L0 (61,424 triangles for this case) **only if** B10 reaches ≥ 20 FPS median and B11 passes at L0 on the A17 tonight. #44's PASS was at 5,648 synthetic triangles; 61,424 is 10.9× that, so it does not carry over. (Also for the leader, for S-1.)
3. **N-3.** The default `--workers` is cpu−2, and each worker is sent the mask and the dilated mask, about 72 MB. My rerun with the defaults caused the 12:11 OOM. Set the default to 2.
4. **N-4.** The absolute default `<data-root>` appears in the code and README. Use `CARDIAC_DATA_ROOT` (required) and the `<CARDIAC_DATA_ROOT>` placeholder that main's `ml/` already uses.
5. **N-5.** The `real_mesh_frontier.py` docstrings are stale: march_mask is still named as the truth, the "13 slices / 41" numbers remain, and the B9 section still says "ray-march finds nothing".
6. **N-6.** Fix the "independent reference" wording: `conformance.slice_of_ray` is the same Amanatides–Woo walk. The truly independent check is the L0 Möller–Trumbore agreement.
7. **N-7.** The acceleration check uses 300 random rays, mostly background. Add every out-of-bound ray; I found 395/395 identical.
8. **N-8.** Relabel "slices/mm" as "slices per voxel unit".
9. **N-9 (Vũ Hùng Anh, DR-013 — a decision, not a fix).** Decide whether B5 counts rays that cross the mask for less than 1 voxel (silhouette clips), without widening ±1. It does not change DR-008c here: L1 fails on its 67 local errors anyway.

## VERDICT

**MERGE AFTER FIXES: B-1 and B-2.**

- The numbers reproduce exactly where I re-ran them: all OBJ hashes, and L1's B5 and B9 down to the ray. The coordinate frame is consistent from end to end.
- The 29–40-slice errors are a real effect of vertex clustering plus the silhouette discontinuity of this metric, not a bug.
- **"Only L0 is within ±1" stands, and it does not depend on silhouette rays.** The consequence holds: DR-008c = L0 at 61,424 triangles. Tonight's S-1 must show B10 ≥ 20 FPS median and B11 PASS at L0 on the A17; otherwise the outcome is `NEGATIVE_RESULT`.
- S-1 does not need to wait for this merge. The device meshes are generated locally; the L0 OBJ SHA-256 is `870ca76d…a1b1b8`, 2,206,375 B.
