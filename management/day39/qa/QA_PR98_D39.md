# QA of PR #98 (V2 SCR-05 skeleton + backend L0 meshes + holdout hardening + CI)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

- PR: Drake-Phamta/cardiac-mri-workspace #98, branch `feat/v2-scr05-skeleton`
- Head SHA reviewed: `a851ccb9bc95b4c75f96ca0096270a2d4e49d721` (the SHA `gh pr view` reports; CI run on this SHA is green)
- Reviewer actions: read-only checkout, tests run, one in-process live run against the D39 data root (read only, separate sqlite / render cache / request log in the scratchpad; nothing under the data root was written).

## VERDICT: MERGE AFTER FIXES

One blocking item (B-1): the Mac mini deploy script does not pack `backend/mesh`, and `backend/app/main.py` now imports it at module load, so a redeploy from this branch cannot start the backend. Everything else I was asked to check passes. B-1 is a one-line fix plus a guard test.

## BLOCKING

### B-1. `backend/scripts/deploy_macmini.ps1:105-110` omits `backend/mesh`; the deployed backend dies at import

- `backend/app/main.py:36` is `from ..mesh import artifact as mesh_module` (also `backend/app/meshes.py` is imported from it). `backend/mesh/` is a sibling of `backend/app/`.
- The deploy packs only `backend/app`, `backend/requirements.txt`, `backend/scripts/serve_macmini.sh` and contract files (`$codePaths`, line 106).
- Reproduced: I copied exactly the `$codePaths` set to an empty directory and ran `python -c "import backend.app.main"`: `ModuleNotFoundError: No module named 'backend.mesh'` (`backend/app/main.py`, line 36).
- Result: the next `deploy_macmini.ps1` run replaces the code, `serve_macmini.sh` starts uvicorn, `/health` never answers, and the deploy fails at its last step. The running demo backend is replaced by a dead one. No CI job covers the deploy file list, so all checks are green.
- Fix: add `"backend/mesh"` to `$codePaths` (it may exclude `backend/mesh/tests` with `--exclude tests` / `--exclude golden`, nothing in `backend/mesh` outside `tests/` is needed at run time other than the `.py` modules; `backend/mesh/README.md` is harmless). Add a test or CI step that guards the list, for example: copy only the paths parsed from `$codePaths` into a temp dir and `import backend.app.main` there (the same simulation I ran). Also say in `backend/README.md` (3-D meshes section) that `derived_meshes/` must be copied or built on the host (it already says so for the data, see N-1).

## NON-BLOCKING

- **N-1.** The deploy copies `data_cache` only (`backend/scripts/deploy_macmini.ps1:113-120`; `backend/README.md` states it). After B-1 is fixed the Mac mini will still answer `reconstruction_3d: false` and no meshes until `derived_meshes/` is copied or `python -m backend.mesh.build_cache --data <root>` is run there. Fine for a skeleton, but the demo runbook needs the step. Also, the new holdout record check means any older deployed data cache lacking `authorized_by` / `authorized_runs` refuses to start until the ingest is re-run (README says so; the D39 cache I loaded already carries both).
- **N-2.** `.github/workflows/guardrails.yml:218-221`: `pip install scipy==1.13.1` has no `--only-binary=:all:`. 1.13.1 does have cp39 manylinux wheels, so it is deterministic today, but if a wheel were ever unavailable pip would fall back to a long source build instead of failing. Add the flag.
- **N-3.** `.github/workflows/guardrails.yml:196` job name and line 194 comment still say "Contract 11 v1.0.0" (the contract is 1.1.0) and do not mention the mesh tests. Pre-existing staleness; do not rename the job if it is a required check, but the comment at lines 192-194 should add "and backend/mesh".
- **N-4.** `mobile/test/v2_viewer.test.mjs` V2W1 says "asks nothing of the network" but only proves it by running the script in a context that has no `fetch`. Nothing asserts that `VIEWER_HTML` / `VIEWER_SCRIPT` contain no `http`, `src=`, `import(`, `fetch(`, `XMLHttpRequest` or `<link`. I grepped the source: there are none (no CDN, no remote script, the page is one inline script), so this is a missing regression guard, not a defect. Add one assertion.
- **N-5.** `mobile/src/verticals/v2/viewerSource.mjs:395-396` listens on both `window` and `document` for `message`. On a React Native WebView that dispatches to both, a mesh would decode and upload twice (harmless, wasteful, `loaded` posted twice). Device-test item for the owner (TC-3D-*).
- **N-6.** Back from SCR-03 reopens SCR-05 on the slice that was opened (`returnParams.sliceIndex`, `mobile/src/verticals/v2/inspector3d.mjs:176-184`), not on a slice the user moved to inside 2D. The text says "the 3D plane follows the 2D slice"; true only at open time. Round trip itself is correct (the covered entry gets `returnParams` merged by `mobile/src/nav/navigator.mjs:54-58`).
- **N-7.** `backend/app/cases.py` / `backend/app/ingest.py` validate the shape of `authorized_runs` and `authorized_by` exactly like `ml/holdout.py`, but they do not reject duplicate `experiment_id` entries (`ml/holdout.py:172-175` does), and nothing checks served runs against `authorized_runs`. The record is now non-empty and attributable; it is not yet enforced against what is served. Say so in `backend/README.md` or add the check later.
- **N-8.** Contract placement: the mesh id format `MESH_<64 hex>`, the `.cmesh` content route and the INT-12 `details.reason` live only in `contracts/api/README.md`, not in `contract.json` (`binary_delivery.applies_to`, `media_type: image/png` and `content_url_rule` still describe slices only). The README is honest about this (it names the deviation, says no field/enum/error was added, and why no version bump), so I accept it under the Day-39 override. At the next freeze, put the convention in `contract.json` and bump.
- **N-9.** `backend/app/meshes.py` does not itself refuse a sidecar whose source mask is an INT-12 ground truth; the guarantee comes from `backend/mesh/build_cache.py` (skips cases without ground truth) and `CaseStore` (CASE_0001 cannot carry ground truth). Both hold today. A one-line defence in `MeshStore` is optional.

## CHECKS

| # | Check | Result |
|---|---|---|
| 1a | `contracts/api/contract.json` unchanged | PASS: `git diff origin/main...HEAD -- contracts/api/contract.json` is empty; only `contracts/api/README.md` (+31) changes |
| 1b | README "3-D mesh content" honest | PASS with N-8: states the id carries the digest, the route extension, that no field/enum/error is added, and that `reconstruction_get` answers INT-12 with `ARTIFACT_NOT_FOUND` + `details.reason` because adding `GROUND_TRUTH_UNAVAILABLE` would bump the version |
| 1c | `python contracts/api/test_api_contract.py` | PASS (`api_contract_checks=PASS cases=34`) |
| 1d | Backend responses validate against the contract | PASS: `backend/tests/api_support.py` `Api.call` runs `validate_response` on every JSON answer; `backend/tests/test_meshes.py` uses it for every `reconstruction_get` (200 and 404) and for run/study answers. Also re-run live on the D39 data (below): 0 validation problems |
| 2a | Frame = voxel index, x = column, y = row, z = slice | PASS: `backend/mesh/artifact.py` `mask_from_zyx` transposes (z,y,x) to [x,y,z]; header `index_convention`/`frame`; test pins a single voxel; served mesh vs served PNG |
| 2b | `face_source_slice` and the +z face | PASS: it is the z of the foreground voxel. Live on real D39 data (CASE_0002, 640x640x88, RAW 124,848 triangles, GT 112,024): every +z face lies on plane k+1 with source k, every -z face on plane k with source k; the voxel behind every face is in its source slice; 0 of 124,848 and 0 of 112,024 faces have no foreground at (column, row) on the served PNG of their source slice (row = y, column = x) |
| 2c | Pick = first-hit triangle's source slice, no off-by-one | PASS: `viewerSource.mjs` `rayCast`/`pickRay` return `layer.slices[hit.triangle]` of the nearest hit, never floor of the hit point; a miss posts `slice: null`; `selectionAfterPick` refuses a slice outside [0, total); viewer run in node on the golden agrees with the Python reference on every golden pick case |
| 3a | INT-12: no GT mesh for CASE_0001 via `reconstruction_get` | PASS live: 4 CASE_0001 runs; `MASK_CASE_0001` answers 404 `ARTIFACT_NOT_FOUND` with `reason: GROUND_TRUTH_UNAVAILABLE`; another case's mask id answers 404; only RAW prediction answers 200 |
| 3b | `error_reconstruction_get` | PASS live: `GROUND_TRUTH_UNAVAILABLE` for CASE_0001 |
| 3c | No GT mesh exists or can be guessed | PASS: of 289 sidecars in the D39 `derived_meshes` (216 prediction, 73 ground truth) none is CASE_0001's (its `mask_sha256` is null in the cache); `build_cache.py` skips cases without ground truth; a mask sha used as a mesh sha answers 404 |
| 3d | Content route safety | PASS: `backend/app/main.py:328-340`, `ARTIFACT_NAME` is a whole-string `[0-9a-f]{64}\.(png|cmesh)`; lookup is a dict by digest (no path built from the request); bytes are re-hashed against the digest before sending. Live: `..%2f`, `%2e%2e%2f`, NUL, upper-case hex, 63-char, trailing slash, `.l0.cmesh`, `.l0.json`, `..%5c` all 404; a PNG digest with `.cmesh` and a mesh digest with `.png` 404 |
| 4a | Holdout record checks | PASS: `backend/app/cases.py` `authorized_runs_valid` (non-empty list of exactly `{experiment_id, checkpoint_sha256}`, sha is 64 lowercase hex) and `authorized_by_valid` (non-blank string) match `ml/holdout.py` shapes; enforced at ingest (`backend/app/ingest.py` `load_holdout_authorization`) and again when the store starts; recorded in `index.json`. 10 ingest + 8 store parametrized refusals in `backend/tests/test_holdout.py` |
| 4b | CASE_0001 refusal | PASS: `CaseStore._refuse_unsafe_holdout` refuses start if CASE_0001 is not INFERENCE_REVIEW or carries any ground-truth marker (`_serves_ground_truth`), whatever the index says; CASE_0001 is always in `inference_only_ids`. Test covers empty, elsewhere and self designations, the mixed mode, the valid case, and that other cases are untouched |
| 5 | CI change in `guardrails.yml` | PASS with N-2 / N-3: only `backend-tests` gained two steps; no other job touched; scipy absent for the first run (error-geometry module `importorskip`, `test_mesh_lazy_scipy` masks scipy in a subprocess with empty cwd), then `scipy==1.13.1` for the second; the wheel-closure step after it downloads from `backend/requirements.txt`, unaffected. No network beyond PyPI. CI green on the head SHA (`gh pr checks 98`: all pass; backend tests 56 s) |
| 6a | Viewer offline | PASS (see N-4): no remote URL, no external script in `VIEWER_HTML`; `source={{ html }}`, `originWhitelist={['about:*','data:*']}`, `onShouldStartLoadWithRequest` allows only `about:blank`/`data:`, file access and universal file access off, mixed content never |
| 6b | Checksum verified before use | PASS: bytes come through `runtime.content.bytes(url, { checksum })` (`mobile/src/runtime/content.mjs`, DR-021 rule 1); the screen sends nothing to the viewer unless the step is SUCCESS and `parseMeshHeader` + `gridMatches` pass; render smoke V2R10 tampers prediction and ground-truth bytes: `CONTRACT_DRIFT`, no viewer mounted / bad bytes never reach it |
| 6c | States | PASS: loading, unavailable (API reason shown), error (code shown), success; variant never defaulted; INT-12 requests no GT; fixture mode says `FIXTURE_NO_BYTES`; failed run, no PROCESSED, wrong grid, no WebGL2 (render smoke V2R6-V2R13) |
| 6d | Back / returnParams | PASS (see N-6): `openIn2D` pushes SCR-03 with `{caseId, runId, variant, sliceIndex}` and `returnParams {runId, variant, sliceIndex}` into this screen's entry |
| 6e | Tests not vacuous | PASS: viewer script executed in a `vm` against a stub canvas on the Python golden artifact; JS encoder is independent of the Python one; tamper and refusal paths asserted with codes; golden regenerated and compared byte for byte in `backend/mesh/tests/test_mesh_artifact.py` |
| 7a | `python -m pytest backend/tests backend/mesh/tests -q -p no:cacheprovider` | PASS: 251 passed (Python 3.12.6, scipy present) |
| 7b | Fixture regeneration, `node app/core/tests/run_all.mjs` | PASS: ALL PASS 10/10 |
| 7c | `node app/verticals/v1_case_explorer/test_case_explorer.mjs` | PASS: 91/91 |
| 7d | mobile `npm test`, `npm run test:render` | PASS: 220/220; RENDER SMOKE PASS 159 checks |
| 7e | `gh pr checks 98` | PASS, all checks green on `a851ccb` |
| 8 | Hygiene | PASS: no `.cmesh`/NRRD/PNG/sqlite/binary files in the diff (numstat shows no binaries); the golden is a synthetic 15-voxel L-shape; the diff has no absolute paths, IPs, serials or per-case values (grep of all added lines); derived meshes are written outside git (`Settings` and `build_cache` both refuse an output path inside a work tree) |

## What I could not verify

- Rendering, gestures and frame rate on the device (WebGL2 in a real WebView, Android `html` source and `onShouldStartLoadWithRequest` behaviour): the PR itself assigns these to the owner (TC-3D-001/002, TC-PERF-002).
- CI on Python 3.9 was taken from the green run, not rerun here.
