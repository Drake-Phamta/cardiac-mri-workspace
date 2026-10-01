# Spike B — real-mesh frontier and offline picking error (B5, B9, B12; B14 cohorts)

**2026-10-01 · OFFLINE workstation evidence · computed by Claude agent A4 under the Day 22
recovery override · Spike B owner Vũ Hùng Anh confirms or rejects on Day 23.**
No number here comes from the Galaxy A17: `median FPS` and `longest stall` stay
`NOT MEASURED` until the device session S-1 tonight. Raw record:
[`real_mesh_frontier.json`](real_mesh_frontier.json) · provenance: [`PROVENANCE.md`](PROVENANCE.md).

## Result in one paragraph

On the real mask of `CASE_0059`, **only level 0 — the undecimated voxel-face surface (61,424
triangles) — keeps every pick within ±1 source slice**: max error 1 in every cohort, zero
no-hits over 33,085 rays that meet the mask, and zero navigations over 80,717 background rays.
**Every vertex-clustering level fails**, including the near-lossless one (cell 1.25, every
vertex moved by < 1 voxel): it already has 211 rays that meet the mask but miss the mesh and
picks up to 29 slices wrong. Vertex clustering collapses thin anatomy and opens holes; rays
pass through and hit the far wall. B5 is therefore **not** a `NEGATIVE_RESULT` (level 0
holds), but the decimation frontier offers no cheaper level inside the bound.

## Input and method

- **Case** `CASE_0059`: lowest-numbered case of `training_subsets["25_percent"].effective_case_ids`
  in the Path A split manifest (on `main` since PR #35, blob `d7f09e0`); partition `train`. Mask 640×640×88,
  146,217 foreground voxels, one connected component, slices 23–78. Header affine is the
  QA-002 default (spacing 1, origin 0): all coordinates are **voxel units, not mm**.
- **Surface / levels**: `build_mesh.extract_surface` (exact voxel faces) and
  `build_mesh.decimate` (vertex clustering) unchanged; the OBJ is written, read back, and
  that file is what is measured — the same bytes the device build bundles (SHA-256 per level
  in the JSON).
- **Picks**: `picking_error.ray_mesh_first_hit` + `slice_of_world` (floor, reject, never
  clamp), unchanged. Cohort rule unchanged: a ray that meets the mask but not the mesh is a
  no-hit and makes the cohort not within bound.
- **Ground truth**: an exact cell-by-cell traversal of the **mask** (no mesh), see below.
- **Ray set**: 62 orthographic bundles, 113,802 rays at a 3-voxel pitch, each starting just
  outside the foreground box + 2 voxels. Directions by the fixture's contractual B14 rule
  (angle to the slice plane): `interior` (±90°, ±60° × 6 azimuths), `surface_tangent`
  (±2°, ±5° × 6 azimuths), plus a diagnostic `oblique` cohort (±20°, ±35° × 6 azimuths).
  33,085 rays meet the mask (interior 9,246 · surface_tangent 10,988 · oblique 12,851);
  80,717 do not. Every direction is a camera orientation, so B6's "after rotate" is covered
  offline; zoom does not change a world-space ray and is left to the device.

### Ground-truth correction found on this run

`picking_error.march_mask` samples the ray every 0.25 voxel. On real anatomy that skips
voxels a ray only clips: scored against it, the **exact** level-0 surface showed errors up to
**17 slices** and 86 "background" rays that hit the surface — impossible for a surface made
of the mask's own faces. The two truths disagree on 801 of 33,085 rays: 715 with a different
first slice and 86 where the march found no voxel at all; there is no ray where the march
found a voxel and the exact traversal did not. Scored against the exact traversal, the same
level-0 picks are all within 1 slice. The harness now uses `exact_first_voxel` (Amanatides–Woo, the same walk as
`conformance.py`'s reference `slice_of_ray`); `test_real_mesh_frontier.py` shows it resolves
13/13 canonical rays exactly and agrees with that independent reference on 2,000/2,000
random rays. The march scores stay in the JSON (`scored_against_march_mask_step_0p25`) so the
change is visible. **Owner decision:** whether `picking_error.py` itself should switch.

## B12 — frontier table

Generation = surface extraction + decimation (extraction is ~98% of it), workstation, diagnostic
timing only — it varies with machine load (an earlier run of the same harness code under heavier load took ~3.1 s). FPS / stall: `NOT MEASURED` (device, S-1).

| Level | Cell (voxels) | Vertices | Triangles | Gen. ms | Max vertex move | Median FPS | Longest stall | B5 max error (int / tan / obl) | No-hits | B5 | B9 navigations on background rays |
|---:|---:|---:|---:|---:|---:|---|---|---|---:|---|---:|
| 0 | 1 | 30,714 | 61,424 | 1,102 | 0 | NOT MEASURED | NOT MEASURED | 1 / 1 / 1 | 0 | **WITHIN BOUND** | **0** |
| 1 | 1.25 | 19,683 | 39,384 | 1,141 | 0.98 | NOT MEASURED | NOT MEASURED | 29 / 8 / 16 | 211 | NOT WITHIN | 51 |
| 2 | 2 | 7,684 | 15,412 | 1,130 | 2.10 | NOT MEASURED | NOT MEASURED | 29 / 10 / 18 | 589 | NOT WITHIN | 46 |
| 3 | 4 | 1,923 | 3,884 | 1,126 | 4.00 | NOT MEASURED | NOT MEASURED | 37 / 10 / 22 | 1,103 | NOT WITHIN | 57 |
| 4 | 8 | 467 | 968 | 1,126 | 10.19 | NOT MEASURED | NOT MEASURED | 40 / 9 / 29 | 2,492 | NOT WITHIN | 161 |

## B5 / B14 — cohorts reported separately

`slices/mm` is the slice-axis leverage of the cohort (read it before comparing means).

| Level | Cohort | Rays | slices/mm | Exact | Error 1 | Max | No-hit | Within ±1 |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 0 | interior | 9,246 | 0.885 | 5,513 | 3,733 | 1 | 0 | ✓ |
| 0 | surface_tangent | 10,988 | 0.061 | 10,742 | 246 | 1 | 0 | ✓ |
| 0 | oblique (diag.) | 12,851 | 0.464 | 10,241 | 2,610 | 1 | 0 | ✓ |
| 1 | interior | 9,246 | 0.885 | 5,266 | 3,789 | 29 | 60 | ✗ |
| 1 | surface_tangent | 10,988 | 0.061 | 10,553 | 376 | 8 | 52 | ✗ |
| 2 | interior | 9,246 | 0.885 | 5,218 | 3,603 | 29 | 193 | ✗ |
| 2 | surface_tangent | 10,988 | 0.061 | 10,329 | 493 | 10 | 149 | ✗ |

Levels 3–4 are worse on every column (JSON `levels[].b5`). The level-0 errors of exactly 1
are the known cost of the voxel-face surface with a floor rule: a ray coming down onto the top
(+z) face of slice *k* lands on *z = k+1*. It is inside the bound; a per-face source-slice
index removes it.

**Where the decimated failures come from.** Of the level-1 no-hits, 175 graze the silhouette
(the ray is never more than 1 voxel deep in the mask) and 36 go more than 4 voxels deep —
holes. The large errors are rays that pass through such a hole and stop on the far wall.

## B9 — background rays

80,717 rays meet no mask voxel. Level 0 resolves **none** of them to a slice. Each decimated
level resolves 46–161 of them (all within 1–4 voxels of the mask: the inflated silhouette) to
a slice 0–4 slices from the nearest mask voxel. The harness reports these strictly as
navigations where the mask has no surface; it does not decide that some of them are
acceptable. The device test tonight adds the on-screen version (taps on visible background).

## What this means for B13 / DR-008c (not decided here)

The pre-declared rule (Day 22 override, §4) is *DR-008c = the fastest level whose B5 ≤ ±1
slice*. On this evidence only level 0 can qualify, so **if level 0 passes B10/B11 on the A17
tonight, the rule yields level 0 — no vertex-clustering decimation, 61,424 triangles for this
case**; if level 0 fails B10/B11, no level satisfies both bounds and the result is a
`NEGATIVE_RESULT` to escalate. The ±1 bound is not widened in either case.

## Limits

- One case, one decimation algorithm. A topology-preserving decimation (e.g. quadric error
  with a no-hole constraint) was not tried; choosing a mesh library is the owner's call.
- Voxel units through a default affine; nothing here is a millimetre claim.
- Desktop float64 arithmetic. The device run checks the same picks in the WebView.
- Generation timings were taken on a loaded workstation and vary run to run.

## Reproduce

```text
python spikes/spike_b_3d/harness/real_mesh_frontier.py              # case, levels, rays: all defaults
python spikes/spike_b_3d/harness/test_real_mesh_frontier.py         # data-free, 25 checks
```

Needs the private LASC package at `CARDIAC_DATA_ROOT` (default
`D:\02_Research\cardiac-data\lasc2018\extracted`). Meshes and the per-ray table are written to
the gitignored `spikes/spike_b_3d/mesh/out_real/CASE_0059/`.
