# SPIKE B — current diagnostic result

**Status:** `ACTIVE` · **evidence_present:** `false` · **Owner:** Vũ Hùng Anh

This is a status result, not an acceptance-evidence record. Every number below
comes from deterministic desktop code over the canonical fixture or synthetic
mesh. No physical Galaxy A17 measurement, real-mesh measurement, FPS/stall
measurement, device profile, or reviewer verdict is present. Those remain
required by `TASK.md` and `EVIDENCE_TEMPLATE.md`.

## What was run

```bash
python spikes/spike_b_3d/harness/conformance.py \
  --fixture tests/fixtures/geometry/geometry_fixture_v0.json \
  --expect-contract-version dr008a-dr012/v1.0.0
node spikes/spike_b_3d/app/test_obj.mjs
node spikes/spike_b_3d/app/test_picking.mjs
python spikes/spike_b_3d/harness/picking_error.py
```

The first check covers 33 coordinate points. The app picking check casts the
13 canonical rays into the level-0 synthetic OBJ and requires an exact slice
for each. `picking_error.py` is a separate diagnostic DDA-mask comparison over
13 rays × 6 synthetic orientations (78 samples per level); it is not a phone
or real-anatomy run.

## Criteria

| ID | Current result | Evidence and limit |
|---|---|---|
| B1 | `DIAGNOSTIC PASS` | Desktop WebGL2 viewer renders the synthetic level-0 mesh; orbit, wheel/pinch zoom, desktop/touch pan, and shading are implemented. No Galaxy A17 timing result. |
| B2 | `DIAGNOSTIC PASS` | Canonical source-geometry transform: 33/33 points, 0 findings. This is coordinate conformance, not a physical measurement. |
| B3 | `DIAGNOSTIC PASS` | `test_picking.mjs` raycasts each of 13 canonical rays through the level-0 OBJ. The browser click/tap path uses the same unproject → triangle-hit → world-to-slice functions. |
| B4 | `DIAGNOSTIC PASS` | 13/13 canonical rays resolve the fixture's exact expected slice; tolerance is zero. |
| B5 | `NOT MEASURED` | Requires a real decimated mesh and Galaxy A17 procedure. Synthetic DDA result cannot satisfy this criterion. |
| B6 | `NOT MEASURED` | The offline synthetic harness covers six rotations, but no real-mesh/device run after rotate and zoom exists. |
| B7 | `NOT MEASURED` | No completed device evidence that a 2D production viewer navigates to the picked slice. |
| B8 | `DIAGNOSTIC PASS` | Synthetic offline geometry check ran six orientations; 33/33 coordinate conformance remains exact. This is not arbitrary device manipulation evidence. |
| B9 | `NOT MEASURED` | No device test record for background/invalid selection and zero false navigation. |
| B10 | `NOT MEASURED` | Median FPS must be measured on the physical Galaxy A17. |
| B11 | `NOT MEASURED` | Longest interaction stall must be measured on the physical Galaxy A17. |
| B12 | `DIAGNOSTIC PARTIAL` | Four synthetic levels have triangle counts and generation times below; the required FPS column is absent. |
| B13 | `NOT MEASURED` | No `DR-008c` recommendation: without FPS and real-mesh error there is no eligible optimisation frontier. |
| B14 | `DIAGNOSTIC PASS` | Current app test has 5 `interior` and 8 `surface_tangent` exact rays, reported separately. Offline synthetic run has 30/48 samples per cohort across six orientations. |
| B15 | `NOT MEASURED` | No owner-authored development-cost observation for a candidate stack. |

## B12 synthetic decimation data

Source: committed `spikes/spike_b_3d/mesh/out/mesh_levels.json`; deterministic
synthetic 48×40×24 mask with 6,855 foreground voxels. Generation timing is
diagnostic workstation timing only.

| Level | Cluster cell (voxels) | Vertices | Triangles | Reduction | Generation (ms) | Median FPS | Real-mesh max error |
|---:|---:|---:|---:|---:|---:|---|---|
| 0 | 1 | 2,825 | 5,648 | 0.0% | 0.025 | `NOT MEASURED` | `NOT MEASURED` |
| 1 | 2 | 721 | 1,448 | 74.4% | 1.942 | `NOT MEASURED` | `NOT MEASURED` |
| 2 | 3 | 317 | 632 | 88.8% | 1.756 | `NOT MEASURED` | `NOT MEASURED` |
| 3 | 4 | 178 | 356 | 93.7% | 1.961 | `NOT MEASURED` | `NOT MEASURED` |

The synthetic offline error harness stays within ±1 source slice at every
level, but that does not fill the two missing columns. A triangle budget cannot
be recommended until the same levels have Galaxy A17 FPS/stall data and
real-mesh error data.

## Frozen constraints

| Constraint | State |
|---|---|
| DR-008a `(x, y, z)` / `shape_xyz` | Used by the canonical fixture and checker. |
| DR-012 axis-aligned only | Checker rejects a non-axis-aligned fixture profile; no claim is made that a dataset header is physically validated. |
| Canonical fixture accuracy | Exact only; 13/13 current app rays and 33/33 coordinate points have zero findings. |
| Real decimated-mesh accuracy | Still fixed at ±1 source slice; not measured. |
| `geometry_contract_version` | `dr008a-dr012/v1.0.0`, checked for exact equality in CI. |
| Performance bounds | Unchanged: median ≥20 FPS and no stall >500 ms; both unmeasured. |

## Next required evidence

1. Run the four levels on the physical Galaxy A17 with the declared interaction
   script and record a frame-time distribution, median FPS, longest stall,
   device profile, thermal state, and raw log.
2. Use a real authorised segmentation mesh, measure B5/B6 separately for
   `interior` and `surface_tangent`, and retain the per-point table.
3. Demonstrate B7 and B9 on the target 2D viewer, then have Nguyễn Gia Đức
   Trung review the evidence before changing `evidence_present` or choosing
   `DR-008c`.
