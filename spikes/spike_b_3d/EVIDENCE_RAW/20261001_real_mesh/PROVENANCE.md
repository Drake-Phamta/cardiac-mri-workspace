# PROVENANCE — real-mesh frontier, offline, 2026-10-01

**Offline workstation computation. No device, no operator, no frame rate.** Every number
in `real_mesh_frontier.json` was computed on the workstation by a Claude agent (A4) working
under the leader's account during the **Day 22 recovery override**
(`management/day22/RECOVERY_OVERRIDE_DAY22.md`). Spike B belongs to **Vũ Hùng Anh**; he
confirms, adopts or rejects this record on Day 23. It is not his interpretation and it does
not carry his name as author.

## Roles

| Role | Person |
|---|---|
| Spike B owner — confirms or rejects on Day 23 | Vũ Hùng Anh |
| Computation, code and this file | Claude agent A4, leader's account, Day 22 override |
| Device operator | none — nothing in this record ran on the Galaxy A17 |
| Authorising leader | Phạm Tuấn Anh |

## Input

| Field | Value |
|---|---|
| Case | `CASE_0059` — the lowest-numbered case in `training_subsets["25_percent"].effective_case_ids`; partition `train`, not `validation`, not `final_holdout` (checked by the harness, which refuses any other partition) |
| Split manifest | `data/manifests/split_manifest_path_a_seed2024.json` on `main` (PR #35, merged as `f5aa763` at QA-005 head `7b72ce8`), git blob `d7f09e0`, SHA-256 `c5c65a09…7396d`, 23,393 bytes |
| Dataset manifest | `data/manifests/dataset_manifest.json` on `main`, SHA-256 `f64d461f…5ea9` (the hash the split manifest pins) |
| Mask | `laendo.nrrd` at the manifest's `mask.path_relative`, read from the private extracted package **outside git**; file SHA-256 in the JSON (`case.mask_file_sha256`) |
| Mask geometry | 640 × 640 × 88, axis order x, y, z (slices along z); header spacing 1 / origin 0 — **QA-002 F2: a default affine, voxel units, not validated millimetres** |

## Code

| Field | Value |
|---|---|
| Harness | `spikes/spike_b_3d/harness/real_mesh_frontier.py` — reuses `build_mesh.extract_surface` / `decimate` / `to_world` / `write_obj` and `picking_error.ray_mesh_first_hit` / `slice_of_world` / `load_obj` unchanged |
| Data-free test | `python spikes/spike_b_3d/harness/test_real_mesh_frontier.py` — 25 checks pass (13/13 canonical rays exact; 2,000/2,000 random rays agree with `conformance.py`'s independent reference DDA; candidate-triangle acceleration identical to brute force) |
| Commit the evidence was computed from | `repository_commit` in the JSON; `working_tree_clean_for_harness: true` means the harness and `build_mesh.py` had no uncommitted change |
| Command | `command` in the JSON (all defaults: the split and dataset manifests are read from the repository) |
| Environment | `environment` in the JSON (Python, numpy, scipy, pynrrd, platform, CPU count) |

## Output

| Artifact | Where | In git |
|---|---|---|
| `real_mesh_frontier.json` — counts, timings, errors, hashes | this folder | **yes** |
| `README.md` — the short report: reading of the JSON | this folder | **yes** |
| Five OBJ levels (`level_<i>_cell<c>.obj`) | `spikes/spike_b_3d/mesh/out_real/CASE_0059/` | **no** — derived from a patient mask; SHA-256 and byte size of each are in the JSON |
| `per_ray_table.csv` (113,802 rows) | same folder | **no** — SHA-256 in the JSON |
| `mesh_levels_real.json` (index for the device build) | same folder | **no** |

Regenerating needs the private data package and the split manifest bytes above; with both,
every count and error in the JSON is deterministic. Timings (`*_ms`, `runtime_s`) vary per run.

## What this record is not

- Not an on-device measurement: `median_fps` and `longest_stall_ms` are `NOT MEASURED`.
- Not B6/B7 evidence: those need the device session S-1 tonight (`spikes/spike_b_3d/S1_SESSION_SCRIPT.md`).
- Not the owner's interpretation, and not a DR-008c decision. B13 needs the frame-rate column.
