# Spike B — real-mesh frontier and offline picking error (B5, B9, B12; B14 cohorts)

**2026-10-01 · OFFLINE workstation evidence · computed by Claude agent A4 under the Day 22
recovery override · Spike B owner Vũ Hùng Anh confirms or rejects on Day 23.**
No number here comes from the Galaxy A17: `median FPS` and `longest stall` stay
`NOT MEASURED` until the device session S-1 tonight. Raw record:
[`real_mesh_frontier.json`](real_mesh_frontier.json) · provenance: [`PROVENANCE.md`](PROVENANCE.md).
Revised after the #66 QA (MERGE AFTER FIXES): the failure mechanism, the along-ray measurements
and the published file hashes changed; every count of the B5 / B9 verdicts is unchanged.

## Result in one paragraph

On the real mask of `CASE_0059`, **only level 0 — the undecimated voxel-face surface (61,424
triangles) — keeps every pick within ±1 source slice**: max error 1 in every cohort, zero
no-hits over 33,085 rays that meet the mask, and zero navigations over 80,717 background rays.
Level 0 passes **by construction** — its surface *is* the mask boundary — so it shows that the
measurement is sound rather than that decimation is safe. **Every vertex-clustering level
fails**, including the near-lossless one (cell 1.25, every vertex moved by < 1 voxel): 211
rays that meet the mask miss the mesh and picks are up to 29 slices wrong. The decimated
meshes have **no holes** (QA: no edge of odd multiplicity at any level). What fails is
geometry, not topology: clustering shifts the silhouette by up to a voxel, so rays that only
clip the mask miss the mesh, and it collapses 1-voxel-thin structures, so a ray whose first
structure is a clipped corner or a thin ledge stops on the **next** surface along the ray —
the error is the distance to that next surface. B5 is therefore **not** a `NEGATIVE_RESULT`
(level 0 holds), but the frontier offers no cheaper level inside the bound.

## Input and method

- **Case** `CASE_0059`: lowest-numbered case of `training_subsets["25_percent"].effective_case_ids`
  in the Path A split manifest (on `main` since PR #35, blob `d7f09e0`); partition `train`. Mask
  640×640×88, 146,217 foreground voxels, one connected component, slices 23–78. Header affine is
  the QA-002 default (spacing 1, origin 0): all coordinates are **voxel units, not mm**.
- **Surface / levels**: `build_mesh.extract_surface` (exact voxel faces) and
  `build_mesh.decimate` (vertex clustering) unchanged; the OBJ is written, read back, and that
  file is what is measured — the same bytes the device build bundles (SHA-256 per level in the
  JSON; byte-identical to the meshes in the S-1 APK of #73).
- **Picks**: `picking_error.ray_mesh_first_hit` + `slice_of_world` (floor, reject, never
  clamp), unchanged. Cohort rule unchanged: a ray that meets the mask but not the mesh is a
  no-hit and makes the cohort not within bound.
- **Ground truth and every along-ray measurement**: an exact cell-by-cell walk of the **mask**
  (no mesh) — the first voxel, the depth of a missed ray (max EDT along the walk), the clearance
  of a background ray (min EDT along the walk) and the class of every out-of-bound pick.
- **Ray set**: 62 orthographic bundles, 113,802 rays at a 3-voxel pitch, each starting just
  outside the foreground box + 2 voxels. Directions by the fixture's contractual B14 rule
  (angle to the slice plane): `interior` (±90°, ±60° × 6 azimuths), `surface_tangent`
  (±2°, ±5° × 6 azimuths), plus a diagnostic `oblique` cohort (±20°, ±35° × 6 azimuths).
  33,085 rays meet the mask (interior 9,246 · surface_tangent 10,988 · oblique 12,851);
  80,717 do not. Every direction is a camera orientation, so B6's "after rotate" is covered
  offline; zoom does not change a world-space ray and is left to the device.

### Ground-truth correction (found on the first run)

`picking_error.march_mask` samples the ray every 0.25 voxel. On real anatomy that skips voxels a
ray only clips: scored against it, the **exact** level-0 surface showed errors up to **17
slices** and 86 "background" rays that hit the surface — impossible for a surface made of the
mask's own faces. The two truths disagree on 801 of 33,085 rays: 715 with a different first
slice and 86 where the march found no voxel; the march never finds a voxel where the walk finds
none (re-checked each run on the 300 nearest misses: 0). Scored against the exact walk, the same
level-0 picks are all within 1 slice. The harness uses `exact_first_voxel` (Amanatides–Woo);
`test_real_mesh_frontier.py` shows it resolves 13/13 canonical rays exactly and agrees on
2,000/2,000 random rays with `conformance.py`'s reference `slice_of_ray` — a separate
implementation of the same walk that shares no code with the harness. The march scores stay in
the JSON (`scored_against_march_mask`). The first version also measured depth and clearance by
0.25-step sampling (the same defect) and filed depth 0 under ">4"; both are now exact and
`0` has its own bucket. **Owner decision:** whether `picking_error.py` itself should switch.

## B12 — frontier table

Generation = surface extraction + decimation (extraction is ~98% of it), workstation, diagnostic
timing only — it varies with machine load. FPS / stall: `NOT MEASURED` (device, S-1).

| Level | Cell (voxels) | Vertices | Triangles | Gen. ms | Max vertex move | Median FPS | Longest stall | B5 max error (int / tan / obl) | No-hits | B5 | B9 navigations on background rays |
|---:|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| 0 | 1 | 30,714 | 61,424 | 1,033 | 0 | NOT MEASURED | NOT MEASURED | 1 / 1 / 1 | 0 | **WITHIN BOUND** | **0** |
| 1 | 1.25 | 19,683 | 39,384 | 1,055 | 0.98 | NOT MEASURED | NOT MEASURED | 29 / 8 / 16 | 211 | NOT WITHIN | 51 |
| 2 | 2 | 7,684 | 15,412 | 1,054 | 2.10 | NOT MEASURED | NOT MEASURED | 29 / 10 / 18 | 589 | NOT WITHIN | 46 |
| 3 | 4 | 1,923 | 3,884 | 1,059 | 4.00 | NOT MEASURED | NOT MEASURED | 37 / 10 / 22 | 1,103 | NOT WITHIN | 57 |
| 4 | 8 | 467 | 968 | 1,054 | 10.19 | NOT MEASURED | NOT MEASURED | 40 / 9 / 29 | 2,492 | NOT WITHIN | 161 |

## B5 / B14 — cohorts reported separately

`slices per voxel unit` is the slice-axis leverage of the cohort — slices crossed per voxel of
along-ray displacement (the unit is a voxel, not a millimetre: QA-002). Read it before comparing
means.

| Level | Cohort | Rays | Slices per voxel unit | Exact | Error 1 | Max | No-hit | Within ±1 |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 0 | interior | 9,246 | 0.885 | 5,513 | 3,733 | 1 | 0 | ✓ |
| 0 | surface_tangent | 10,988 | 0.061 | 10,742 | 246 | 1 | 0 | ✓ |
| 0 | oblique (diag.) | 12,851 | 0.464 | 10,241 | 2,610 | 1 | 0 | ✓ |
| 1 | interior | 9,246 | 0.885 | 5,266 | 3,789 | 29 | 60 | ✗ |
| 1 | surface_tangent | 10,988 | 0.061 | 10,553 | 376 | 8 | 52 | ✗ |
| 2 | interior | 9,246 | 0.885 | 5,218 | 3,603 | 29 | 193 | ✗ |
| 2 | surface_tangent | 10,988 | 0.061 | 10,329 | 493 | 10 | 149 | ✗ |

Levels 3–4 are worse on every column (JSON `levels[].b5`). The level-0 errors of exactly 1 are
the known cost of the voxel-face surface with a floor rule: a ray coming down onto the top (+z)
face of slice *k* lands on *z = k+1*. It is inside the bound; a per-face source-slice index
removes it.

## Where the decimated failures come from

Every out-of-bound pick (a mask ray with error > 1 or no hit) is classified along the exact walk.
With the first run of foreground voxels along the ray at [t_in, t_out] and the mesh hit at t_hit:
**no_hit** — the mesh is not hit; **inflated** — t_hit < t_in, the mesh is hit in front of the
mask; **local** — t_in ≤ t_hit ≤ t_out, the hit lies on the first structure, displaced;
**cross-structure** — t_hit > t_out, the first structure is not on the mesh and the hit lands on
a later surface.

| Level | Out of bound | no_hit (exact max EDT along the ray) | inflated | local | cross-structure | Largest errors |
|---:|---:|---|---:|---:|---:|---|
| 1 | 395 | 211 (all = 1: silhouette clips) | 76 (66 of them error 2) | 16 (2–4) | 92 (53 of them error 2; up to 29) | cross-structure |
| 2 | 980 | 589 (585 = 1, 4 in (1, 2]) | 96 | 23 | 272 (up to 29) | cross-structure |
| 3 | 1,741 | 1,103 (1,064 = 1, 39 in (1, 2]) | 112 | 80 | 446 (up to 37) | cross-structure |
| 4 | 4,915 | 2,492 (1,792 = 1, 567 in (1, 2], 133 in (2, 4]) | 426 | 1,155 | 842 (up to 40) | cross-structure |

The no-hits at levels 1–2 are silhouette clips: the ray is at most one voxel deep in the mask
(max EDT 1) and the clustered surface, shifted by a fraction of a voxel, no longer meets it. The
errors of 2 are mostly sub-voxel surface shifts (inflated or local) on top of the level-0 floor
effect. The **large** errors are cross-structure: the ray's first run is a clipped corner or a
1-voxel-thin ledge that clustering collapsed, the ray continues, and the error is the slice
distance to the next surface along the ray. QA's independent split of the 395 level-1 cases
(211 no-hit / 67 local / 77 cross-structure / 40 inflated) used other boundaries between local
and inflated; both agree on the no-hits and on where the large errors come from.

## B9 — background rays

80,717 rays meet no mask voxel. Level 0 resolves **none** of them to a slice. Each decimated
level resolves 46–161 of them — all within one voxel of the mask at levels 1–2 (exact clearance;
up to 2 voxels at level 3 and 4 at level 4: the inflated silhouette) — to a slice 0–4 slices from
the nearest mask voxel. The harness reports these strictly as navigations where the mask has no
surface; it does not decide that some of them are acceptable. The device test adds the
on-screen version (taps on visible background).

## What this means for B13 / DR-008c (not decided here)

The pre-declared rule (Day 22 override, §4) is *DR-008c = the fastest level whose B5 ≤ ±1
slice*. On this evidence only level 0 can qualify. **DR-008c = level 0 (61,424 triangles,
no vertex-clustering decimation) ONLY IF level 0 shows B10 ≥ 20 FPS median and B11 PASS on the
Galaxy A17 in tonight's S-1 session.** The B10/B11 PASS already on record (#44, 2026-09-18) was
measured on the 5,648-triangle synthetic level 0 and does **not** carry over to 61,424 real
triangles. If level 0 fails B10 or B11, no level satisfies both bounds and the result is a
`NEGATIVE_RESULT` to escalate. The ±1 bound is not widened in either case.

## Limits

- One case and one decimator. Any simplifying decimator — quadric error metrics included — is
  expected to show this class of error on this ray set, because it too moves the silhouette and
  thins or removes 1-voxel structures; that is **untested** here.
- Voxel units through a default affine; nothing here is a millimetre claim.
- Desktop float64 arithmetic. The device run checks the same picks in the WebView.
- Generation timings are workstation-diagnostic and vary with load.

## Reproduce

```text
CARDIAC_DATA_ROOT=<extracted LASC package>                          # no built-in path
python spikes/spike_b_3d/harness/real_mesh_frontier.py --workers 2  # the run behind this JSON
python spikes/spike_b_3d/harness/test_real_mesh_frontier.py         # data-free, 33 checks
```

**Memory:** the ground truth runs in a process pool, `--workers` (default `min(4, cpu_count)`).
Each worker holds its own copy of the mask and two cropped distance fields, about 0.13 GB. This
JSON was produced with `--workers 2` because a GPU job was training on the shared workstation;
the first version of the harness defaulted to 18 workers and exhausted its RAM in a QA re-run.
The worker count changes the run time only, never a result. Meshes, the per-ray table and the
mask file's hash sidecar are written to the gitignored `spikes/spike_b_3d/mesh/out_real/CASE_0059/`.
