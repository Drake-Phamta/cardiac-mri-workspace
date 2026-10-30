# backend/mesh — product surface mesh, pick → slice, error geometry

**Status:** built on Day 22 (2026-10-01) under the Day 22 recovery override
(`management/day22/RECOVERY_OVERRIDE_DAY22.md`, item A4). Owner **Vũ Hùng Anh**
adopts or rejects it on **Day 23**. Rows: V2-01 (product mesh pipeline),
INT-13 (TC-MAINT-002 against product code), V2-03 / MOB-09 (error geometry
skeleton).

`backend.mesh` turns a binary segmentation mask into:

- a closed, outward-wound **voxel-face surface mesh** in world coordinates,
  where every triangle records the **source slice** it came from
  (`surface.py`);
- a **pick → slice** resolver for 3-D picks on that mesh (`surface.py`);
- the canonical **DR-008a / DR-012 transform** as product code, plus the
  adapter that runs the canonical geometry fixture through the product mesh
  (`geometry.py`);
- a **DR-005 candidate 3** error geometry: the prediction's surface plus
  FP/FN connected-component markers with exact slice ranges
  (`error_geometry.py`; a skeleton, not wired to the API);
- the served **error mesh** (DR-005, decided 2026-10-30): the FP and FN
  voxel-face surfaces of a prediction against the ground truth, every face with
  its source slice and its class (`error_artifact.py`, see "The served error
  artifact" below).

It is a namespace package: there is deliberately no `backend/__init__.py`.
Import it as `backend.mesh` with the repository root on `sys.path`.

```python
from backend.mesh import build_case_mesh, pick_slice, build_error_geometry

mesh = build_case_mesh(mask_xyz, level=0, spacing=(0.625, 0.625, 1.25), origin=(0, 0, 0))
hit = pick_slice(mesh, ray_origin_world, ray_direction_world)
slice_index = None if hit is None else hit["slice_index"]      # None never navigates
payload = mesh.to_dict()                                        # JSON-serialisable
```

## Conventions — contract `dr008a-dr012/v1.0.0`

Source of truth: `tests/fixtures/geometry/FORMAT.md` (owner Vũ Hùng Anh, DR-013).

| Item | Rule |
|---|---|
| Voxel `(x, y, z)` | `x` = source column, `y` = source row, `z` = source slice index |
| Arrays | indexed `mask[x, y, z]`; `shape_xyz = [Nx, Ny, Nz]` |
| Transform | `world[i] = origin[i] + voxel[i] * spacing[i]` |
| Cells | voxel `k` occupies the half-open interval `[k, k + 1)` |
| World → slice | floor; a point outside the volume on any axis is **rejected** (`None`), never clamped |
| Profile | validated axis-aligned only (DR-012); oblique, rotated or flipped directions are `GEOMETRY_NOT_VALIDATED` |
| Version | every geometry-bearing output carries `geometry_contract_version`; consumers compare it by **exact string equality** (`validate_contract_version`) |

Masks are `bool`, or integer/float arrays with values `{0, 1}` or `{0, 255}`;
anything else (label maps, probabilities, negatives, NaN) is
`MASK_NOT_BINARY` — binarising is the caller's decision. Pass
`shape_xyz=` from the header to catch a `(z, y, x)` array from a C-order
reader (`GEOMETRY_MISMATCH`).

This module computes in whatever frame it is given. It does **not** decide
`geometry_validation_status`: per QA-002 the LASC headers carry default
spacing 1 / origin 0, which are voxel indices, not validated millimetres. The
API layer owns that field.

## The surface: exact voxel faces, not Marching Cubes

At level 0 the mesh is exactly the set of faces between a foreground voxel and
a background voxel or the volume border. Every vertex is an integer lattice
corner (shared corners are one vertex), each face is two triangles, and every
normal points from foreground to background. Extraction is vectorised (one
array shift per face direction), so a 640×640×88 mask is fine: on the
development desktop a 13.8 M-voxel ellipsoid in that volume built level 0
(1.3 M triangles) in about 0.5 s, and a realistically sized one in 0.04 s.

DAY20 row V2-01 names Marching Cubes. This module deliberately keeps the
spike's exact voxel faces (see `spikes/spike_b_3d/mesh/build_mesh.py`):
every surface point lies on a cell boundary, so each face's source slice is
unambiguous and picking can be checked **exactly** against the canonical
fixture. An interpolated surface makes the true slice of a surface point
ambiguous. Whether a smoother display layer is added on top is the owner's
call; picking must resolve through these faces.

## The per-face source slice rule (PR-3D-04)

Each triangle `t` carries:

- `face_source_slice[t]` — the `z` of the **foreground** voxel whose face it is;
- `face_axis[t]` (0/1/2) and `face_sign[t]` (+1/−1) — the outward normal;
- `source_triangle[t]` — the level-0 triangle it descends from.

A pick that hits triangle `t` navigates to `face_source_slice[t]`, **not** to
`floor(hit_z)`: the +z face of voxel `k` lies on the plane `z = k + 1`, where
the floor rule gives `k + 1`, the slice above the voxel that was picked. The
floor rule (`slice_of_world`) is for points such as an MPR plane position.

`pick_slice(mesh, origin_world, direction_world)` returns
`{slice_index, triangle, point_world, distance_world, front_facing}` for the
first hit (Möller–Trumbore, vectorised; back faces accepted; `t > 1e-9`), or
`None` on a miss. A miss never navigates and nothing is clamped. At level 0 the
pick follows the half-open cells exactly, like the fixture's DDA: a ray lying
in a lattice plane or grazing an edge only touches a closed voxel boundary and
does not enter that voxel; a ray entering through a concave lattice edge is
resolved by a parity test. During development the level-0 pick matched a copy
of the fixture DDA on 47,602 rays (generic, lattice-plane, lattice-line,
vertex-diagonal; the synthetic blob and four random masks). A ray that starts
inside the foreground reports the face it leaves through (the DDA would report
the start cell); that case is not part of the contract.

**On a real mask (Day 22, offline, A4):** on the `CASE_0059` left-atrium mask, level-0
picks through `face_source_slice` matched an exact traversal of the mask on **3,399 of
3,399** rays that meet it (six directions from the PR #66 ray set: top-down, bottom-up,
60 degrees, two near-tangent, one oblique), with no miss and no navigation on a mask-free
ray. The floor rule on the same hit points was one slice off on 1,524 of them, all where a
ray comes down onto a +z cap. At level 2 both rules exceed ±1 slice (holes), as #66 found.
The rays and slices are not committed (derived from a patient mask); only these counts.

## The served artifact and the derived-mesh step (SCR-05)

`artifact.py` encodes a level-0 mesh as the compact binary `cardiac-mesh/1` (vertices uint16, triangles uint16 or
uint32, `face_source_slice` uint16; about 0.4 MB for a 60k-triangle atrium, 1.4-5 MB for noisy full-size
predictions) in the **voxel-index frame**: vertex `(x, y, z)` = (column, row, slice) lattice corner, which is what
`index_convention` `x=column,y=row,z=slice` says and what `test_mesh_artifact.py` pins with an asymmetric single
voxel. `build_cache.py` (`python -m backend.mesh.build_cache --data <root>`) writes one artifact per served mask into
`<root>/derived_meshes/`, keyed by the source mask's sha256, write-once; the same step writes the error meshes (below),
keyed by both masks' sha256 and the format version (`--no-error-meshes` skips them, `--no-ground-truth` reads no ground
truth at all). The API conventions (mesh id, content route, INT-12 refusal) are in `contracts/api/README.md`, "3-D mesh
content" and "3-D error mesh". Golden artifacts built from synthetic masks (`tests/golden/l_shape_cmesh.json`,
`tests/golden/known_errors_errormesh.json`) are read by the mobile tests too, so the Python encoder and the JavaScript
decoder agree byte for byte. QA-074 N-5 gaps (a), (b) and (c) are closed by convention, not by a contract field: (a) the format
and media type are the ones above, (b) the pick rule is `face_source_slice[t]`, carried in the file, (c) the frame is
the voxel-index frame with the identity transform.

## The served error artifact (DR-005, decided 2026-10-30)

`error_artifact.py` builds `cardiac-errormesh/1` for one prediction (RAW or PROCESSED) and the case's ground truth:

| | |
|---|---|
| Classes | `FP` (code 1) = prediction AND NOT ground truth, `FN` (code 2) = ground truth AND NOT prediction. Agreement (TP) has no surface of its own: the prediction surface shows it where no error covers it |
| Surface | the L0 voxel faces of each class's voxel set, built by the same `build_case_mesh` as every other mesh: a face lies between a voxel of the class and anything else, its normal points out of the class, and its **source slice is the `z` of the class voxel** - the rule of the surface artifact, not a new one |
| Frame | the voxel-index frame of `cardiac-mesh/1` (`x=column,y=row,z=slice`, voxel `k` = `[k, k+1)`), vertices uint16, identity transform, no millimetres while the geometry is not validated |
| Layout | the `cardiac-mesh/1` container (`CARDMESH`, JSON header, vertices, triangles, `face_source_slice`) plus a fifth section `face_class` (uint8 per triangle). Blocks are contiguous: the FP vertices then the FN vertices, the FP triangles then the FN triangles; a triangle indexes only its own block. The header's `classes` table gives each class's `code`, `rule`, `voxels`, `vertex_range` and `triangle_range` |
| Zero errors | a class with no voxel is an empty range (and `0` voxels): "no false positives" is a fact, not a missing layer. A prediction equal to the ground truth is a valid artifact with no face |
| Identity | the header names both source masks (`reference_mask_sha256`, `prediction_mask_sha256`), so the bytes are a pure function of the two masks; the artifact is content-addressed (sha256 of the bytes) and written once as `<reference_sha256>.<prediction_sha256>.err1.cmesh` + `.err1.json` by `build_cache` |
| Pick | the first triangle a ray hits names `face_source_slice[t]` and `face_class[t]`; a miss navigates nowhere (`artifact.pick_triangle` is the reference ray cast) |
| Cross-check | the class voxel counts equal the server's own `analysis_run_metrics` `false_positives` / `false_negatives` of the same run and variant (`tools/e2e/hero_flow_api.py` H6 checks it on the served data), and `agreement_voxels` gives the same Dice |

`error_geometry.py` (connected components with markers, candidate 3) is not part of the served path: the demo needs
"tap an error region, land on its contributing slice", which the per-face slice and class already give, and a stored
component id is not needed for it. The size on the real holdout data is a distribution, not a constant: it is printed
by the build step (`built_bytes_min_median_max`, `built_triangles_min_median_max` under `error_meshes`) and recorded in
the run report, not here.

## Levels and DR-008c (decided 2026-10-01: L0)

| Level | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Clustering cell (voxels) | 1 (exact) | 1.25 | 2 | 4 | 8 |

These are the five levels of today's (Day 22) offline Spike B real-mask
frontier run (PR #66, `spikes/spike_b_3d/EVIDENCE_RAW/20261001_real_mesh/`). Level numbers follow that run, not the older
`spikes/spike_b_3d/mesh/out/mesh_levels.json` numbering (cells 1, 2, 3, 4).

**DR-008c is decided as L0** (2026-10-01, Spike B S-1). Its rule (Day 22 override): DR-008c = the fastest
level whose B5 ≤ ±1 source slice. Today's offline Spike B evidence shows only
level 0 keeps real-mesh picking within ±1 slice — vertex clustering opens holes
in thin anatomy — so **`DEFAULT_LEVEL = 0`**. Changing it is a DR-008c
decision, not a code tweak.

Decimation is the spike's vertex clustering, unchanged: keys
`np.round(v / cell)` (round-half-to-even, so at even cells cluster widths
alternate), the cluster mean as representative, triangles with a repeated
vertex dropped, unreferenced vertices kept (so counts match the Spike B
table). Surviving triangles keep the `face_source_slice`, axis and sign of
their level-0 face. Decimated picks take the nearest hit; their error is the
B5 measurement, bounded at ±1 slice only where Spike B shows it.

## Error geometry — DR-005 candidate 3 skeleton (V2-03)

`build_error_geometry(pred, gt, spacing=..., origin=..., connectivity=26, level=0)`
returns the prediction's surface (`CaseMesh`, or `None` with
`surface_reason` when the prediction is empty) and the connected components of
`FP = pred & ~gt` and `FN = gt & ~pred` (`scipy.ndimage.label`; connectivity
6/18/26 → `generate_binary_structure(3, 1/2/3)`, recorded in the output).
Each component has `id`, `class`, `voxel_count`, inclusive `bbox_voxel`
`{lo, hi}`, `source_slice_range` `[zmin, zmax]` and `slices` (exact from the
voxels), `centroid_world` (mean of voxel centres), and `marker_world` /
`marker_voxel` / `marker_slice` — the component's own voxel centre nearest the
centroid in world distance, so the marker is inside the region even for a
ring. `include_component_meshes=True` adds a level-0 voxel-face mesh per
component (enough for candidate 1's FP/FN meshes; a TP mesh is
`build_case_mesh(pred & gt)`).

DR-005 itself is decided on Day 24: Vũ Hùng Anh brings the recommendation
from MOB-09 (compressed Spike F, F7/F8 on device) and the leader records the
decision (DAY20 plan, D24 18:30). Choices taken for the skeleton meanwhile:

- **Order:** FN before FP (alphabetical), then `voxel_count` descending, `zmin`
  ascending, bbox `lo` then `hi` lexicographic, then the first voxel in C order
  (components are disjoint, so the order is total). Ids are `FN_0001`, … per class.
- **Connectivity default 26:** one error region that steps diagonally between
  slices stays one marker. scipy's own default is 6, so the structure is
  always passed explicitly.
- **Geometry:** shapes must match; `gt_spacing` / `gt_origin` (when the ground
  truth has its own header) must match within Contract 1's tolerance (1e-6),
  else `GEOMETRY_MISMATCH`.

`error_geometry_to_dict` makes a result JSON-serialisable;
`error_geometry_sha256` hashes it (meshes by their `content_sha256`).

## Error codes

`GeometryError` is a `ValueError` with a stable `code`. Suggested API mapping
(`contracts/api/contract.json`) is for the backend owner to confirm.

| Code | When | Suggested API code |
|---|---|---|
| `GEOMETRY_NOT_VALIDATED` | spacing not positive-finite, origin not finite, oblique/flipped/degenerate directions | `GEOMETRY_NOT_VALIDATED` |
| `GEOMETRY_MISMATCH` | pred/gt shape or header differ; mask shape ≠ declared `shape_xyz`; direction diagonal ≠ spacing | `GEOMETRY_MISMATCH` |
| `GEOMETRY_CONTRACT_VERSION_MISSING` / `_MISMATCH` | version absent / not exactly the expected string | `GEOMETRY_MISMATCH` |
| `MASK_NOT_3D`, `MASK_NOT_BINARY`, `MASK_EMPTY` | mask rejected (empty only where a surface is required) | `VALIDATION_ERROR` |
| `MESH_LEVEL_UNKNOWN`, `CONNECTIVITY_UNSUPPORTED` | option outside the table | `VALIDATION_ERROR` |
| `POINT_INVALID`, `RAY_INVALID` | malformed or non-finite coordinates, zero ray direction | `VALIDATION_ERROR` |

## TC-MAINT-002 through product code (INT-13)

`conformance_adapter(mask, spacing, origin, level=0, space_directions=...)`
returns the mapping `conformance.check_fixture` expects, with `slice_of_ray`
implemented through the product mesh (`build_case_mesh` then
`pick_slice(...)['slice_index']`). `test_mesh_conformance.py` runs the
canonical fixture through it at level 0: **33 points and 13 rays, 0
findings**, and a `dr008a-dr012/v1.0.1` expectation yields a
`contract_version_mismatch` finding. The test imports the shared checker
`spikes/spike_b_3d/harness/conformance.py` (its documented purpose); product
code never imports `spikes/`. CI runs these tests (QA-074 N-2) in the `backend-tests` job of
`.github/workflows/guardrails.yml`, on Python 3.9 with the backend pins, first without scipy and then with
scipy 1.13.1 for the error-geometry module.

## Running the tests

From the repository root:

```bash
python -m pytest backend/mesh/tests -q
# or
pytest backend/mesh/tests -q
```

`tests/conftest.py` puts the repository root on `sys.path`. All test data is
synthetic; no patient data is read or written.

## Dependencies

Runtime: `numpy` only (the backend pins 1.26.4 on Python 3.9; 2.2 on Python 3.12 also passes), the served error mesh
included (`error_artifact.py` needs no scipy). `scipy` is needed
only by `build_error_geometry` (`scipy.ndimage` for the error components) and is imported lazily
(QA-074 N-4): `import backend.mesh`, meshing and picking work without it, and `build_error_geometry`
raises a clear `ImportError` where it is absent. scipy is not in `backend/requirements.txt`; 1.13.1 is the last
series with CPython 3.9 wheels (1.17 used on 3.12). Tests: `pytest` (8.3 used). Nothing else.

## Provenance

The face table and the decimation rule are a **copy, not an import**, of
`spikes/spike_b_3d/mesh/build_mesh.py` (`_FACES`, `extract_surface`,
`decimate`, `to_world`) at **origin/main `f5aa763`** (file last changed in
`ee9ef60`, blob `32d5b14f97b5b554dac83fb5c302609c5396a4f9`), copied 2026-10-01;
re-checked at origin/main `44350d4` (blob `7e26a3a`), where `ba492ae` changed
only `build()` and the copied functions are unchanged.
`_FACES` is character-for-character; `extract_surface` is rewritten
vectorised with the spike's emission order and first-encounter vertex order;
`decimate` keeps its rule with an order-preserving scalar key instead of
`np.unique(axis=0)` and `bincount` instead of `np.add.at`. During development
the output was compared with the spike on its 48×40×24 synthetic blob at
cells 1, 1.25, 2, 3, 4 and 8: identical vertices and triangles. The test-side
blob formula is copied from `conformance.py` (blob `1fa13730`) the same way.
Spike code stays throwaway behind `spikes/**`.
