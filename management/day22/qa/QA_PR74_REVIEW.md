# QA-074: PR #74 backend mesh pipeline for V2 (`backend/mesh/`) · **MERGE** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM session (Claude Code, Claude Opus 5.5) running under the leader's account. **It is not a second human reviewer.** This is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md`. |
| **Target** | PR #74 "feat(backend): mesh pipeline for V2", branch `feat/day22-backend-mesh`, head `ceb919621d18032ed20969b6db8084b79755504d`. It has 3 commits (`db95809`, `3e4f73d`, `ceb9196`), built by agent A4 under the override. The head had not changed when the review ended. |
| **Base** | The PR's base is `6b52628`, 23 commits behind main. `origin/main` was `254044a` at the start and `d6441bc` at the end, because #75 and #61 merged during the review. Trial merges onto both are clean, giving trees `1a52f9e` and `1ef40b0`. #74 adds 14 files, all under `backend/mesh/`. |
| **Run time** | 2026-10-01 15:01–15:25 (+07), about 24 minutes of the 40-minute box |
| **Method** | `git fetch` (this updates remote-tracking refs only). Three detached worktrees: `<scratch>/qa74_wt` at the PR head, and `<scratch>/qa74_merge_wt` and `<scratch>/qa74_merge2_wt` holding uncommitted trial merges. `gh` was used read-only. Independent scripts are in `<scratch>/qa74_*.py`. Synthetic data only, CPU only, one process at a time; peak RSS was 174 MiB. Nothing was committed, pushed, labelled or commented on. The `<repo>` checkout is still on `main` at `c7a37e0`, with only `?? .claude/`. |
| **Environment** | Python 3.12.6, numpy 2.2.6, scipy 1.17.1, pytest 8.3.4. CI's backend job runs Python 3.9 (see N-4). |
| **Data handling** | No MRI or mask file of any case was opened. `CARDIAC_DATA_ROOT` stayed unset throughout. |

> **VERDICT: MERGE.** There is no blocking finding.
> - **Picking.** The level-0 pick matches an independent half-open DDA exactly on 34,672 rays, and B9 holds.
> - **Provenance.** The copied code produces bit-identical output to the spike at the cited blobs.
> - **Data.** The change carries no data and makes no claim of device acceptance.
>
> Eight non-blocking findings follow. The two that matter most are N-1 (the CI run is stale) and N-4 (the module cannot be imported on the backend's Python 3.9 runtime).

---

## 1 · Commands and scripts run

| # | Command (scripts are in `<scratch>`) | Purpose |
|---|---|---|
| R1 | `git fetch origin main feat/day22-backend-mesh`<br>`git worktree add --detach` (3 times)<br>`git merge-tree --write-tree origin/main ceb9196`<br>`git merge --no-ff --no-commit ceb9196` (in the trial worktrees only) | Resolve refs, prove the merge is clean, build trial-merge trees |
| R2 | `python -m pytest backend/mesh -q -p no:cacheprovider` (PR head and both trial merges)<br>`python -m pytest backend/tests -q -p no:cacheprovider`<br>`python -m pytest backend -q -p no:cacheprovider`, with and without `--ignore=backend/mesh` | Check 1 |
| R3 | `gh pr checks 74`<br>`gh pr view 74`<br>`gh run view 36819376724`<br>`guardrails.yml` at `origin/main` | CI coverage and freshness |
| R4 | `python qa74_check.py <scratch>/qa74_wt` | Checks 2–5: topology on 27 meshes, 29,268 rays against an exact DDA, spike semantics, error-geometry invariants, equivalence with the spike |
| R5 | `qa74_nondyadic.py`, `qa74_border.py`, `qa74_manifold.py` | Non-dyadic geometry (5,404 rays); why the floor rule disagrees; edge incidence |
| R6 | `git rev-parse <commit>:<path>` for each cited blob<br>`git diff 32d5b14 7e26a3a` | Check 5 (provenance) |
| R7 | `qa74_policy.py <repo> 6b52628 ceb9196`<br>`git grep` for the case id on `origin/main` | Check 6 (data policy) |
| R8 | `qa74_contract.py`<br>Reading `backend/app/main.py` and `imaging.py` at the trial merge | Check 7 (API exposure) |
| R9 | `qa74_perf.py` | Check 8 (performance) |
| R10 | `qa74_py39.py`<br>The CI geometry command: `conformance.py … --implementation-name reference` | Python 3.9 syntax, import without scipy; reproduced the CI geometry job (0 findings) |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1.1 | `backend/mesh` tests, synthetic, one process | **PASS** | 131 passed in 2.6 s at the PR head; 131 passed on both trial merges. |
| 1.2 | Tests that need `CARDIAC_DATA_ROOT` | **NOT RUN** | None exists in `backend/mesh`; no test reads an environment variable or a data root. The README's real-mask pick check is offline only and cannot be reproduced from the repo. It reports one case, 3,399/3,399 rays exact, with the floor rule 1 slice off on 1,524. Re-running it would show that the exact pick also holds on real thin and concave anatomy, not only on synthetic masks (N-8c). |
| 1.3 | `backend/tests` after the merge | **PASS** | Trial merge onto `254044a`: 46 passed. Onto `d6441bc`: 50 passed. Both on Python 3.12. |
| 1.4 | All of `backend/` in one process | **FAIL (non-blocking)** | `python -m pytest backend -q` stops with a collection error in `backend/tests/test_api.py`: its `from conftest import CONTRACT` binds to `backend/mesh/tests/conftest.py`. With `--ignore=backend/mesh` it passes (46 / 50). See N-3. |
| 1.5 | CI (`gh pr checks 74`) | **PASS, stale** | 8/8 green. The run (12:21 +07) tested a merge ref with main at `6b52628`. That was before #68 added the "backend tests (Python 3.9…)" job, and before the V4/V1/V3 app steps existed. See N-1. |
| 1.6 | `backend/mesh` tests in CI | **FAIL (non-blocking)** | No CI job runs them. The geometry-contract job checks only the reference implementation, so TC-MAINT-002 through product code (INT-13) is not in CI. The README and the PR body both say so. See N-2. |
| 2.1 | Contract identity | **PASS** | `CONTRACT_VERSION` (`dr008a-dr012/v1.0.0`) and `INDEX_CONVENTION` (`x=column,y=row,z=slice`) equal contract 1.1.0's `geometry_contract`. The canonical fixture run through `conformance_adapter`, which uses the product mesh, gives 33 points + 13 rays with 0 findings. Expecting v1.0.1 gives `contract_version_mismatch`. |
| 2.2 | Axis order, slice convention, spacing identity or real | **PASS** | Masks are indexed `[x, y, z]` and `z` is the slice. Every check below ran under three geometries: identity; dyadic anisotropic (spacing 0.625/0.75/1.25, origin −12.5/7.25/−30); non-dyadic (spacing 0.7/0.9/1.1, origin 3.3/−1.7/12.9). |
| 2.3 | Vertices on voxel boundaries; surface closed | **PASS** | Run on 9 masks × 3 geometries. The masks: single voxel, a 4-voxel case, diagonal contacts, a border-touching mask, 4 random masks, and the 48×40×24 Spike B blob.<br>- Every vertex is a lattice corner inside [0, N].<br>- Every directed edge is matched by its reverse, so the surface is closed and consistently wound.<br>- The signed volume by the divergence theorem equals foreground voxels × voxel volume (relative 1e-9).<br>- Every normal is axis-aligned and points outward, with a foreground voxel behind it and background or the border in front.<br>- The face count equals a brute-force count of exposed faces, at 2 triangles per face.<br>The surface is closed but not always 2-manifold (N-8a). |
| 2.4 | Face → slice | **PASS** | On all 27 meshes, `face_source_slice[t]` equals the `z` of the foreground voxel recomputed from triangle t's own corners. |
| 2.5 | Small mask with known slices | **PASS** | Voxels (2,2,1), (2,2,2), (3,2,2) and (5,5,6) in an 8×8×9 volume with anisotropic spacing. 9/9 rays gave the expected slice:<br>- top-down onto the column → 2 (the floor of the hit point would give 3);<br>- bottom-up → 1;<br>- from the side at z 1.5 → 1, and at z 2.5 → 2;<br>- top-down onto (5,5,6) → 6;<br>- an empty column, and a ray pointing away → None;<br>- an oblique ray → 6. |
| 3.1 | Level-0 pick vs exact half-open DDA | **PASS** | 34,672 rays over three geometries, with 0 mismatches. Ray kinds: generic, lattice-plane, lattice-line, vertex-diagonal, edge-diagonal, and starting in a background cell. The reference is `conformance.py`'s DDA walk with occupancy made a parameter; it is a QA copy and shares no product code. |
| 3.2 | B9: a miss returns no slice | **PASS** | 0 navigations on the 18,050 rays that meet no mask voxel, and 0 in the non-dyadic set. |
| 3.3 | Agreement with `picking_error.py` semantics, within ±1 | **PASS** | The spike's rule is floor of the first hit point. On the product's level-0 mesh, over 531 generic hits, that rule was exact on 391, 1 slice off on 61, and gave no slice on 79.<br>- All 61 off-by-ones are on +z faces: the "cap" case the README describes.<br>- All 79 no-slice cases are hits on the volume's upper border (x = Nx, y = Ny or z = Nz), which the floor rule maps outside the volume.<br>- A focused rerun classified 129 + 287 more cases the same way, with no exception.<br>`pick_slice`, which uses `face_source_slice`, is exact in every one of these cases.<br>Against `march_mask` (0.25-voxel steps), the product disagrees on 37 of 1,110 generic rays. These are exactly the 37 rays where `march_mask` disagrees with the exact DDA: the sampling defect #66 documented, not a product error. |
| 4.1 | FP/FN computed without mutating the inputs | **PASS** | 48 builds: 8 random pairs × connectivity 6/18/26 × bool and uint8 {0,255}. Input bytes are unchanged, read-only inputs are accepted, and the surface arrays are read-only. |
| 4.2 | Class labels as documented | **PASS** | A voxel only in the prediction gives `FP`; a voxel only in the ground truth gives `FN`; swapping the inputs swaps them. Ids are `FN_0001` and `FP_0001`, FN first. Every component (class, size, inclusive bbox, slices, centroid) equals an independent BFS labelling at connectivity 6, 18 and 26. Each marker lies inside its own component, and each component mesh holds exactly that component's voxels. |
| 5 | Provenance of the copied code | **PASS** | Blob ids:<br>- `build_mesh.py` is `32d5b14…` at `f5aa763` and `7e26a3a…` at `44350d4`, which is also main today.<br>- `32d5b14→7e26a3a` adds 4 lines, all inside `build()` (`ba492ae`).<br>- `conformance.py` is `1fa1373…` at `f5aa763`, the same as main.<br>Output comparison:<br>- `_FACES` is identical character for character.<br>- The rewritten `extract_surface` gives identical vertices and triangles on 9 masks.<br>- The clustering gives identical output at cells 1.25/2/3/4/8 (45 pairs).<br>- Levels 0–4 give world vertices bit-identical to the spike's `decimate` + `to_world`.<br>- The blob formula in `conftest.py` equals the one in `conformance.py`.<br>Every change from the source is listed in the header. |
| 6 | Data policy (F5) | **PASS** | All 14 files are `.py` or `.md`; there are no mesh, OBJ or binary bytes. Across 2,750 added lines there are no absolute paths, IPs, emails, URLs, hostnames, 64-hex hashes or long numeric runs. The real-mask paragraph gives counts only. Its one case id is already public on main through #66's evidence files. |
| 7 | API exposure | **PASS (no endpoints)** | #74 adds no route. A contract change is needed before picks through the API can be exact (N-5). |
| 8 | Performance | **PASS (reported, no threshold)** | 576×576×88 synthetic mask (Spike B blob formula, 4,342,005 foreground voxels), level 0, one CPU run: **0.187 s**, 294,119 vertices / 588,236 triangles, peak RSS 174 MiB. One top-down pick on that mesh took 0.084 s. |
| 9 | No claim of device acceptance | **PASS** | The code and docs contain no "ACCEPTED", frame-rate or device claim. DR-008c is described as undecided, and `DEFAULT_LEVEL = 0` follows #66. The device condition is not stated (N-6). |
| 10 | Backend runtime: Python 3.9, numpy 1.26.4, no scipy | **NOT RUN** (no 3.9 interpreter here) | Statically, all 13 files parse as Python 3.9 and their annotations are deferred. However, `import backend.mesh` raises ImportError when scipy is absent (N-4). |

## 3 · Findings

### BLOCKING
**None.**

### NON-BLOCKING

**N-1 · Process, medium. CI is green but stale.**
- **What.** The 8/8 checks come from a run against main `6b52628`. That run predates the "backend tests (Python 3.9…)" job (#68, 12:54) and the V4/V1/V3 app steps.
- **Why it is not blocking.** QA's trial merges onto `254044a` and `d6441bc` are clean, and `backend/tests` passes on both. #74 adds no file that any CI job collects.
- **Caveat.** QA ran those tests on Python 3.12, not 3.9.
- **Fix (leader session).**
  - Merge at the QA'd head with `--match-head-commit ceb919621d18032ed20969b6db8084b79755504d`.
  - Then confirm that main's push run is green on every job, as in QA-005's disposition.
  - For a signal before the merge instead, refresh the merge ref: update the branch from main, or close and reopen the PR. A plain re-run replays the original event and its old workflow file.

**N-2 · CI coverage, medium. No CI job runs `backend/mesh`, so TC-MAINT-002 through product code (INT-13) is unguarded.**
- **Fix (Vũ Hùng Anh, Day 23; the leader edits the shared workflow).** Add a step that runs `python -m pytest backend/mesh/tests -q -p no:cacheprovider` as its own invocation (see N-3), on the backend's pins (see N-4).

**N-3 · Tests, low/medium. After the merge, `pytest backend` fails at collection.**
- **Cause.** `backend/tests/test_api.py` imports `conftest` by name. Once a second `conftest.py` exists under `backend/`, that import binds to the wrong file.
- **Impact.** Each suite passes when run alone. CI and both documented commands (`pytest backend/tests` and `pytest backend/mesh/tests`) are unaffected.
- **Fix.**
  - Keep the two suites in separate invocations.
  - The durable fix is in `test_api.py`: import `CONTRACT` and `REPO_ROOT` from a plain helper module instead of from `conftest`. `ml/tests/conftest.py` sets the same trap.
  - **Owner:** leader session, routed to the owner of `backend/tests`.

**N-4 · Deploy compatibility, medium. The module cannot be imported on the backend's runtime.** This blocks adopting V2-01, not this merge.
- **The runtime.** Under DR-003 the Mac mini runs Python 3.9. `backend/requirements.txt` pins numpy 1.26.4 and has no scipy.
- **The import.** `backend/mesh/__init__.py` imports `error_geometry` eagerly, and that module imports scipy. So `import backend.mesh` raises ImportError without scipy; QA reproduced this by masking scipy.
- **The README.** It lists Python 3.12, numpy 2.2 and scipy 1.17. Those versions have never been tested against the target runtime.
- **Fix (Vũ Hùng Anh, Day 23, before any endpoint imports the module).**
  - Either pin a SciPy that ships CPython 3.9 wheels for macOS arm64 (the 1.13 series is the last that supports 3.9) and re-run `check_wheel_closure.py`;
  - or import scipy lazily inside `build_error_geometry`, so that meshing and picking need only numpy.
  - Then run the mesh tests on 3.9 with numpy 1.26.4 in CI, and correct the README's dependency line.

**N-5 · API and contract, medium. How V2 gets the mesh, and why a contract change is needed.**
- **Route.** V2 would use contract 1.1.0's `reconstruction_get`, which returns an artifact reference (`mesh_artifact_id`, geometry, `mesh_to_world_transform`). Errors would come from `error_reconstruction_get`.
- **On main today.** `reconstruction_get` serves mesh artifacts listed in a Contract 2 package. `error_reconstruction_get` answers ARTIFACT_NOT_FOUND because DR-005 is open.
- **Gap (a): artifact format.** The mesh artifact's format and media type are undefined. `binary_delivery` covers PNG slices only, and ADR-ART-001 is still open.
- **Gap (b): exact picking.** `face_source_slice`, which is what makes a pick exact, has no field in the contract. `hero_flow.picking` implies taking the floor of the hit point. Check 3.3 shows that rule is 1 slice off on +z faces and returns nothing on upper-border faces. On the real mask the README reports 1,524 of 3,399 picks off by one.
- **Gap (c): coordinate frame.**
  - `backend.mesh` emits world coordinates (origin + voxel × spacing).
  - Main's `reconstruction_get` returns an identity `mesh_to_world_transform`, with a code comment saying meshes are in the voxel-index frame.
  - The two agree only under the default LASC affine.
- **Fix: a contract MINOR (1.2.0).**
  - It defines the mesh artifact: vertices, triangles, `face_source_slice`, and `content_sha256` as `reconstruction_version`.
  - It states that a pick resolves to `face_source_slice[t]`.
  - It fixes which frame the transform refers to.
  - **Owner:** Vũ Hùng Anh proposes on Day 23; the leader session approves.

**N-6 · Docs, low. The README makes no acceptance claim, but it does not state the device condition either.**
- **What is missing.** Per #66, DR-008c = level 0 only if B10/B11 pass on the A17 in tonight's S-1 session. Level 0 is 61,424 triangles on the real mask, while the B10/B11 PASS on record was measured on 5,648 synthetic triangles. The 3D module stays conditional until then.
- **Fix (Vũ Hùng Anh; optionally the leader session as a one-line doc edit before the merge).** Add that sentence under "Levels and DR-008c".

**N-7 · Wiring hazards, low. None is triggered by LASC, whose headers are the default affine.**
- **(a) Flipped axes.** `build_case_mesh` accepts only spacing and origin. Main's header reader (`imaging.py`) checks off-diagonal terms only, so it reports a flipped axis as axis-aligned. Such a header would be meshed at mirrored world positions instead of being rejected as `GEOMETRY_NOT_VALIDATED`.
- **(b) Array order.** Main holds volumes as (z, y, x) (`to_zyx`). Passing `shape_xyz=` is the only guard against a transposed mask, and it is optional.
- **(c) Duplicate geometry code.** `geometry.py` calls itself "the backend's single implementation" of the geometry contract. But `backend/app/ingest.py` has its own `GEOMETRY_CONTRACT_VERSION` constant and its own header geometry.
- **Fix (Vũ Hùng Anh, when wiring).**
  - Add a `space_directions=` parameter to `build_case_mesh` and `build_error_geometry`, validated with `validate_axis_aligned`.
  - Require `shape_xyz` at the API layer.
  - Use one shared version constant.

**N-8 · Info (Vũ Hùng Anh, Day 23).**
- **(a) Not 2-manifold.** The level-0 surface is closed but not always 2-manifold: an edge where voxels touch only along that edge is shared by 4 triangles (one such edge on the 48×40×24 blob). Picking handles it, as check 3 shows; a smoothing display layer would have to handle it too.
- **(b) Rays that start inside the foreground.** Such a ray reports the face it exits through, not the cell it starts in. Of 164 such rays, 25 land more than 1 slice from the DDA's start cell. The README documents this as outside the contract, and it is arguably right for a viewer, since it is the face the user sees. V2 should still record this choice.
- **(c) Real-mask check.** Re-run it with #66's harness (counts only) before adoption; see check 1.2.

**Housekeeping.** QA deleted nothing.
- The worktrees `<scratch>/qa74_wt`, `<scratch>/qa74_merge_wt` and `<scratch>/qa74_merge2_wt` are still in place. The last two hold uncommitted trial merges; remove them with `git worktree remove --force` when convenient.
- The scripts `<scratch>/qa74_*.py` contain no data and take their paths as arguments.

**VERDICT: MERGE.**
- **How to merge.** Merge at the QA'd head with `--match-head-commit ceb919621d18032ed20969b6db8084b79755504d`, then confirm main's push run is green (N-1).
- **What merging does not claim.** It does not claim device acceptance; V2's 3D module stays conditional on tonight's S-1 session.
- **What must close first.** N-2, N-4 and N-5 must be closed before any endpoint uses `backend.mesh`.
