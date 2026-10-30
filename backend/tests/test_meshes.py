"""SCR-05 on the backend: derived L0 meshes (build_cache), reconstruction_get, error_reconstruction_get (the FP / FN error
mesh, DR-005) and the mesh content route.

Synthetic package only. API Contract 11 is unchanged: every JSON answer still passes validate_response (through
``Api.call``). The frame is the voxel-index frame, axes x=column, y=row, z=slice (DR-008a), so a served face is
checked against the served slice PNGs (row = y, column = x).
"""

from __future__ import annotations

import hashlib
import io
import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from api_support import Api
from backend.app.cases import CaseStore
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.meshes import ERROR_MESH_ID, MeshStore
from backend.mesh import artifact, build_case_mesh, build_cache, error_artifact

B = "/api/v1"
DENY = "GROUND_TRUTH_UNAVAILABLE"


def png_array(payload: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(payload)) as image:
        return np.asarray(image.convert("L"))


@pytest.fixture(scope="session")
def built(environment):
    """The derived meshes of the synthetic cache + packages, built once through the real CLI step."""
    lines = []
    summary = build_cache.build_all(environment["root"], log=lambda *args, **kwargs: lines.append(args[0]))
    return {"dir": environment["root"] / "derived_meshes", "summary": summary, "lines": lines}


def make_api(environment, tmp_path: Path, derived) -> Api:
    settings = Settings.from_env({
        "data_cache": environment["cache"], "experiments_root": environment["experiments"],
        "db_path": tmp_path / "backend.sqlite3", "render_cache": environment["root"] / "render_cache",
        "request_log": tmp_path / "logs" / "requests.jsonl", "derived_meshes": derived,
    })
    app = create_app(settings)
    client = TestClient(app)
    client.__enter__()
    handle = Api(client)
    handle.app = app
    handle._client_context = client
    return handle


@pytest.fixture()
def mesh_api(environment, built, tmp_path):
    handle = make_api(environment, tmp_path, built["dir"])
    yield handle
    handle._client_context.__exit__(None, None, None)
    handle.app.state.backend.storage.close()


@pytest.fixture()
def bare_api(environment, tmp_path):
    handle = make_api(environment, tmp_path, None)
    yield handle
    handle._client_context.__exit__(None, None, None)
    handle.app.state.backend.storage.close()


def reconstruction(api: Api, run: str, mask: str, expect: int = 200):
    return api.call("GET", f"{B}/analysis-runs/{run}/reconstruction?source_mask_id={mask}", "reconstruction_get", expect)


def error_reconstruction(api: Api, run: str, variant: str, expect: int = 200):
    return api.call("GET", f"{B}/analysis-runs/{run}/error-reconstruction?prediction_variant={variant}",
                    "error_reconstruction_get", expect)


def mesh_bytes(api: Api, mesh_artifact_id: str) -> bytes:
    """The bytes of a ``MESH_<sha256>`` or ``ERRMESH_<sha256>`` id from the content route, verified like the app does."""
    digest = mesh_artifact_id.split("_", 1)[1]
    response = api.client.get(f"{B}/artifacts/{digest}.cmesh")
    assert response.status_code == 200, response.text
    assert hashlib.sha256(response.content).hexdigest() == digest
    assert response.headers["etag"] == f'"sha256:{digest}"' and "immutable" in response.headers["cache-control"]
    assert response.headers["content-type"].startswith("application/octet-stream")
    return response.content


# -- the build step -----------------------------------------------------------------------------

def test_the_build_covers_every_served_mask_and_each_evaluation_ground_truth(environment, built):
    summary = built["summary"]
    sidecars = sorted(built["dir"].glob("*.l0.json"))
    # RUN_9001 RAW + PROCESSED, RUN_9003 RAW, RUN_0031 RAW; GT of CASE_9001 and CASE_9003 (CASE_0031 has none).
    labels = [line for line in built["lines"]]
    assert any("RUN_9001 RAW" in line for line in labels) and any("RUN_9001 PROCESSED" in line for line in labels)
    assert any("CASE_9001 GROUND_TRUTH" in line for line in labels) and any("CASE_9003 GROUND_TRUTH" in line for line in labels)
    assert not any("CASE_0031 GROUND_TRUTH" in line for line in labels)
    assert summary["empty"] == 0 and summary["new"] + summary["no_op"] == summary["masks"] == len(sidecars)
    for side in sidecars:
        record = json.loads(side.read_text(encoding="utf-8"))
        body = side.with_name(side.name.replace(".l0.json", ".l0.cmesh"))
        assert side.name == f"{record['mask_sha256']}.l0.json"
        assert hashlib.sha256(body.read_bytes()).hexdigest() == record["mesh_sha256"] and record["bytes"] == body.stat().st_size
        assert record["shape"] == [12, 10, 6] and record["level"] == 0


def test_a_rerun_is_a_no_op_and_never_overwrites(environment, built, tmp_path):
    before = {path.name: path.read_bytes() for path in built["dir"].iterdir()}
    again = build_cache.build_all(environment["root"], log=lambda *a, **k: None)
    assert again["new"] == 0 and again["no_op"] == again["masks"] and again["empty"] == 0
    errors = again["error_meshes"]
    assert errors["pairs"] >= 3 and errors["new"] == 0 and errors["no_op"] == errors["pairs"]
    assert {path.name: path.read_bytes() for path in built["dir"].iterdir()} == before
    # A mesh whose bytes no longer match its sidecar is a conflict, not something to overwrite.
    copy = tmp_path / "root"
    copy.mkdir()
    shutil.copytree(environment["cache"], copy / "data_cache")
    shutil.copytree(environment["experiments"], copy / "experiments")
    shutil.copytree(built["dir"], copy / "derived_meshes")
    victim = next((copy / "derived_meshes").glob("*.l0.cmesh"))
    victim.write_bytes(victim.read_bytes()[:-4] + b"\x01\x00\x00\x00")
    with pytest.raises(build_cache.BuildError) as raised:
        build_cache.build_all(copy, log=lambda *a, **k: None)
    assert raised.value.code == "CHECKSUM_CONFLICT"


def test_the_cli_builds_selected_runs_only(environment, tmp_path, capsys):
    copy = tmp_path / "root"
    copy.mkdir()
    shutil.copytree(environment["cache"], copy / "data_cache")
    shutil.copytree(environment["experiments"], copy / "experiments")
    assert build_cache.main(["--data", str(copy), "--runs", "RUN_9003", "--no-ground-truth"]) == 0
    out = capsys.readouterr().out
    assert "SUMMARY" in out and "RUN_9003 RAW" in out and "RUN_9001" not in out and "GROUND_TRUTH" not in out
    assert len(list((copy / "derived_meshes").glob("*.l0.cmesh"))) == 1
    # --no-ground-truth reads no ground truth, so it builds no error mesh (they are derived from it)
    assert "ERROR" not in out and not list((copy / "derived_meshes").glob("*.err1.*"))
    # the error meshes of that run alone, then none with --no-error-meshes
    assert build_cache.main(["--data", str(copy), "--runs", "RUN_9003"]) == 0
    out = capsys.readouterr().out
    assert "RUN_9003 RAW ERROR" in out and "CASE_9003 GROUND_TRUTH" in out and "RUN_9001" not in out
    assert len(list((copy / "derived_meshes").glob("*.err1.cmesh"))) == 1
    assert build_cache.main(["--data", str(copy), "--runs", "RUN_9001", "--no-error-meshes"]) == 0
    assert "ERROR" not in capsys.readouterr().out
    assert len(list((copy / "derived_meshes").glob("*.err1.cmesh"))) == 1
    assert build_cache.main(["--data", str(copy), "--runs", "RUN_NOPE"]) == 2
    assert "RUN_NOT_FOUND" in capsys.readouterr().err


def test_a_mask_with_no_foreground_is_recorded_empty_and_served_as_unavailable(tmp_path):
    empty = np.zeros((3, 4, 5), dtype=np.uint8)
    record = build_cache.store_volume(tmp_path / "derived", "e" * 64, empty, "prediction")
    assert record["action"] == "EMPTY" and record["empty"] is True and record["shape"] == [5, 4, 3]
    assert build_cache.store_volume(tmp_path / "derived", "e" * 64, lambda: pytest.fail("read again"), "x")["action"] == "NO_OP"
    from backend.app.meshes import MeshStore

    assert MeshStore(tmp_path / "derived").for_mask("e" * 64) is None


def test_derived_meshes_never_live_inside_the_repository():
    repo = Path(__file__).resolve().parents[2]
    with pytest.raises(RuntimeError, match="inside a git work tree"):
        Settings.from_env({"data_cache": repo.parent / "c", "experiments_root": repo.parent / "e",
                           "db_path": repo.parent / "d", "render_cache": repo.parent / "r",
                           "request_log": repo.parent / "l", "derived_meshes": repo / "derived_meshes"})
    with pytest.raises(build_cache.BuildError) as raised:
        build_cache.build_all(repo / "data_inside_git", log=lambda *a, **k: None)
    assert raised.value.code == "OUTPUT_INSIDE_GIT_WORKTREE"


# -- reconstruction_get -------------------------------------------------------------------------

def test_the_prediction_mesh_reference_and_its_bytes(mesh_api, environment):
    api = mesh_api
    run = api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()
    meta = reconstruction(api, "RUN_9001", "ART_RUN_9001_RAW").json()
    geometry = api.call("GET", f"{B}/cases/CASE_9001/geometry", "geometry_get", 200).json()
    assert meta["source_mask_id"] == "ART_RUN_9001_RAW" and meta["source_mask_kind"] == "RAW_PREDICTION"
    assert meta["mesh_to_world_transform"] == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for key, value in geometry.items():  # the same geometry as geometry_get, state included
        assert meta[key] == value
    assert meta["geometry_validation_status"] == "GEOMETRY_NOT_VALIDATED" and meta["index_convention"] == "x=column,y=row,z=slice"
    nrrd_sha = next(item for item in environment["accepted"]["manifest"]["artifacts"]
                    if item["artifact_id"] == "ART_RUN_9001_RAW")["checksum"]["value"]
    assert meta["reconstruction_version"] == f"dr008c-L0/v1 sha256:{nrrd_sha}"
    assert meta["mesh_artifact_id"] in run["reconstruction_ids"]
    decoded = artifact.decode_mesh(mesh_bytes(api, meta["mesh_artifact_id"]))
    assert decoded["header"]["shape"] == geometry["shape"] == [12, 10, 6]
    # The artifact is the L0 mesh of the prediction array, in [x, y, z] = [column, row, slice] order.
    expected = build_case_mesh(environment["accepted"]["predictions"]["RUN_9001"] != 0, 0)
    assert np.array_equal(decoded["vertices"].astype(np.float64), expected.vertices_world)
    assert np.array_equal(decoded["face_source_slice"].astype(np.int64), expected.face_source_slice)


def foreground_voxel_of_each_face(decoded):
    """The voxel behind each triangle: its centroid pushed one half voxel against the outward normal."""
    v = decoded["vertices"].astype(np.float64)
    tri = decoded["triangles"].astype(np.int64)
    p0, p1, p2 = v[tri[:, 0]], v[tri[:, 1]], v[tri[:, 2]]
    normal = np.cross(p1 - p0, p2 - p0)
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    return np.floor((p0 + p1 + p2) / 3.0 - 0.5 * normal).astype(np.int64)


def test_every_face_lands_on_the_served_mask_of_its_source_slice(mesh_api):
    """H7's contract: the picked face's source slice has the mask at that (column, row) on the served PNG."""
    api = mesh_api
    for run, mask, variant in (("RUN_9001", "ART_RUN_9001_RAW", "RAW"), ("RUN_9001", "ART_RUN_9001_PROCESSED", "PROCESSED"),
                               ("RUN_9003", "ART_RUN_9003_RAW", "RAW")):
        decoded = artifact.decode_mesh(mesh_bytes(api, reconstruction(api, run, mask).json()["mesh_artifact_id"]))
        voxels = foreground_voxel_of_each_face(decoded)
        slices = decoded["face_source_slice"].astype(np.int64)
        assert np.array_equal(voxels[:, 2], slices)  # the foreground voxel is in the face's source slice
        pixels = {}
        for z in sorted(set(slices.tolist())):
            meta = api.call("GET", f"{B}/analysis-runs/{run}/slices/{z}/prediction?variant={variant}",
                            "prediction_slice_get", 200).json()
            pixels[z] = png_array(api.client.get(meta["content_url"]).content)
        for (x, y, z) in voxels:
            assert pixels[int(z)][int(y), int(x)] == 255, (run, variant, x, y, z)  # row = y, column = x


def test_processed_is_its_own_mesh_and_never_the_raw_one(mesh_api):
    api = mesh_api
    raw = reconstruction(api, "RUN_9001", "ART_RUN_9001_RAW").json()
    processed = reconstruction(api, "RUN_9001", "ART_RUN_9001_PROCESSED").json()
    assert processed["source_mask_kind"] == "PROCESSED_PREDICTION" and raw["mesh_artifact_id"] != processed["mesh_artifact_id"]
    run = api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()
    assert sorted(run["reconstruction_ids"]) == sorted([raw["mesh_artifact_id"], processed["mesh_artifact_id"]])
    # RUN_9003 has no processed prediction: asking for it is not found, never the raw mesh relabelled.
    assert api.error_code(reconstruction(api, "RUN_9003", "ART_RUN_9003_PROCESSED", 404)) == "ARTIFACT_NOT_FOUND"
    assert api.error_code(reconstruction(api, "RUN_9003", "ART_RUN_9001_RAW", 404)) == "ARTIFACT_NOT_FOUND"
    for odd in ("", "x", "ART_RUN_9003_RAW%20"):
        assert api.error_code(reconstruction(api, "RUN_9003", odd, 404)) == "ARTIFACT_NOT_FOUND"


def test_the_ground_truth_mesh_is_served_for_an_evaluation_case(mesh_api, environment):
    api = mesh_api
    meta = reconstruction(api, "RUN_9001", "MASK_CASE_9001").json()
    assert meta["source_mask_kind"] == "GROUND_TRUTH" and meta["source_mask_id"] == "MASK_CASE_9001"
    decoded = artifact.decode_mesh(mesh_bytes(api, meta["mesh_artifact_id"]))
    expected = build_case_mesh(environment["volumes"]["CASE_9001"]["gt"] != 0, 0)
    assert np.array_equal(decoded["vertices"].astype(np.float64), expected.vertices_world)
    assert np.array_equal(decoded["face_source_slice"].astype(np.int64), expected.face_source_slice)
    case = api.call("GET", f"{B}/cases/CASE_9001", "case_get", 200).json()
    gt_slice = api.call("GET", f"{B}/cases/CASE_9001/slices/2/ground-truth", "ground_truth_slice_get", 200).json()
    assert gt_slice["reference_mask_id"] == meta["source_mask_id"] and case["ground_truth_available"] is True


def test_int12_gets_a_prediction_mesh_but_no_ground_truth_mesh_and_no_error_mesh(mesh_api):
    api = mesh_api
    pred = reconstruction(api, "RUN_0031", "ART_RUN_0031_RAW").json()
    assert pred["source_mask_kind"] == "RAW_PREDICTION"
    artifact.decode_mesh(mesh_bytes(api, pred["mesh_artifact_id"]))
    refused = reconstruction(api, "RUN_0031", "MASK_CASE_0031", 404)
    body = refused.json()["error"]
    assert body["code"] == "ARTIFACT_NOT_FOUND" and body["details"]["reason"] == DENY
    assert "mesh_artifact_id" not in json.dumps(body)
    error = api.call("GET", f"{B}/analysis-runs/RUN_0031/error-reconstruction?prediction_variant=RAW",
                     "error_reconstruction_get", 404)
    assert api.error_code(error) == DENY
    assert not any(path.name.startswith("MASK_CASE_0031") for path in api.app.state.backend.meshes.root.iterdir())


def test_without_derived_meshes_nothing_is_offered(bare_api):
    api = bare_api
    assert api.error_code(reconstruction(api, "RUN_9001", "ART_RUN_9001_RAW", 404)) == "ARTIFACT_NOT_FOUND"
    assert api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()["reconstruction_ids"] == []
    study = api.call("GET", f"{B}/studies/STUDY_LA_001", "study_get", 200).json()
    assert study["capabilities"]["reconstruction_3d"] is False
    # No derived error mesh either: the honest not-found, naming that it was not built (never a fabricated mesh).
    missing = error_reconstruction(api, "RUN_9001", "RAW", 404)
    assert api.error_code(missing) == "ARTIFACT_NOT_FOUND" and "not built" in json.dumps(missing.json())


def test_with_derived_meshes_the_study_reports_reconstruction_and_runs_list_ids(mesh_api):
    study = mesh_api.call("GET", f"{B}/studies/STUDY_LA_001", "study_get", 200).json()
    assert study["capabilities"]["reconstruction_3d"] is True
    run = mesh_api.call("GET", f"{B}/analysis-runs/RUN_9003", "analysis_run_get", 200).json()
    assert len(run["reconstruction_ids"]) == 1 and run["reconstruction_ids"][0].startswith("MESH_")
    # A run whose case is not in the cache has no mesh to offer.
    other = mesh_api.call("GET", f"{B}/analysis-runs/RUN_9101", "analysis_run_get", 200).json()
    assert other["reconstruction_ids"] == []


def test_a_failed_run_has_no_reconstruction(mesh_api):
    run = mesh_api.app.state.backend.experiments.runs["RUN_9003"]
    run.status, run.failure_reason = "FAILED", "synthetic failure"
    assert mesh_api.error_code(reconstruction(mesh_api, "RUN_9003", "ART_RUN_9003_RAW", 409)) == "RUN_NOT_SUCCEEDED"


# -- the content route --------------------------------------------------------------------------

def test_the_content_route_serves_only_verified_mesh_bytes(mesh_api, built, tmp_path):
    api = mesh_api
    meta = reconstruction(api, "RUN_9003", "ART_RUN_9003_RAW").json()
    digest = meta["mesh_artifact_id"].split("_", 1)[1]
    assert api.client.get(f"{B}/artifacts/{digest}.png").status_code == 404      # a mesh is not a PNG
    slice_meta = api.call("GET", f"{B}/analysis-runs/RUN_9003/slices/2/prediction?variant=RAW", "prediction_slice_get", 200).json()
    png_digest = slice_meta["content_url"].rsplit("/", 1)[1].split(".")[0]
    assert api.client.get(f"{B}/artifacts/{png_digest}.cmesh").status_code == 404  # a PNG is not a mesh
    assert api.client.get(f"{B}/artifacts/{'0' * 64}.cmesh").status_code == 404
    assert api.client.get(f"{B}/artifacts/{digest}.mesh").status_code == 404
    # A mesh file changed on disk after start-up is never served.
    path = api.app.state.backend.meshes.by_mesh[digest].path
    original = path.read_bytes()
    try:
        path.write_bytes(original[:-4] + b"\x07\x00\x00\x00")
        assert api.client.get(f"{B}/artifacts/{digest}.cmesh").status_code == 404
    finally:
        path.write_bytes(original)
    assert api.client.get(f"{B}/artifacts/{digest}.cmesh").status_code == 200


def test_a_mesh_built_for_another_shape_is_refused_as_a_geometry_mismatch(environment, built, tmp_path):
    derived = tmp_path / "derived"
    shutil.copytree(built["dir"], derived)
    for side in derived.glob("*.l0.json"):
        record = json.loads(side.read_text(encoding="utf-8"))
        record["shape"] = [record["shape"][0] + 1] + record["shape"][1:]
        side.write_text(json.dumps(record), encoding="utf-8")
    api = make_api(environment, tmp_path, derived)
    try:
        assert api.error_code(reconstruction(api, "RUN_9001", "ART_RUN_9001_RAW", 422)) == "GEOMETRY_MISMATCH"
        assert api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()["reconstruction_ids"] == []
    finally:
        api._client_context.__exit__(None, None, None)
        api.app.state.backend.storage.close()


def test_damaged_sidecars_are_rejected_not_served(environment, built, tmp_path):
    derived = tmp_path / "derived"
    shutil.copytree(built["dir"], derived)
    sidecars = sorted(derived.glob("*.l0.json"))
    sidecars[0].write_text("{not json", encoding="utf-8")
    record = json.loads(sidecars[1].read_text(encoding="utf-8"))
    record["mesh_sha256"] = "not-a-digest"
    sidecars[1].write_text(json.dumps(record), encoding="utf-8")
    sidecars[2].with_name(sidecars[2].name.replace(".l0.json", ".l0.cmesh")).unlink()

    store = MeshStore(derived, ground_truth_masks=served_ground_truths(environment))
    assert sorted(store.rejected) == sorted(path.name for path in sidecars[:3]) and len(store.by_mask) == len(sidecars) - 3


# -- the error mesh (DR-005): build step, error_reconstruction_get, content route ---------------------------

def served_ground_truths(environment) -> set:
    """The mask digests of the ground truths the synthetic backend serves (its EVALUATION cases)."""
    store = CaseStore(environment["cache"])
    return {case.data["mask_sha256"] for case in store.cases.values()
            if case.ground_truth_available and case.data.get("mask_sha256")}


def voxel_set(volume_xyz: np.ndarray) -> set:
    return {tuple(int(c) for c in v) for v in np.argwhere(volume_xyz != 0)}


def processed_prediction(environment) -> np.ndarray:
    """The synthetic PROCESSED prediction of RUN_9001 (the RAW one with slice 3 cleared), indexed [x, y, z]."""
    volume = environment["accepted"]["predictions"]["RUN_9001"].copy()
    volume[:, :, 3] = 0
    return volume


def test_the_build_writes_one_error_mesh_per_prediction_of_an_evaluation_case(environment, built):
    errors = built["summary"]["error_meshes"]
    sidecars = sorted(built["dir"].glob("*.err1.json"))
    assert errors["pairs"] == len(sidecars) >= 3 and errors["new"] + errors["no_op"] == errors["pairs"]
    assert any("RUN_9001 RAW ERROR" in line for line in built["lines"])
    assert any("RUN_9001 PROCESSED ERROR" in line for line in built["lines"])
    assert any("RUN_9003 RAW ERROR" in line for line in built["lines"])
    cases = CaseStore(environment["cache"])
    gt_sha = {case_id: case.data["mask_sha256"] for case_id, case in cases.cases.items() if case.ground_truth_available}
    for side in sidecars:
        record = json.loads(side.read_text(encoding="utf-8"))
        body = side.with_name(side.name.replace(".err1.json", ".err1.cmesh"))
        # keyed by both masks' sha256 and the format version
        assert side.name == f"{record['reference_mask_sha256']}.{record['prediction_mask_sha256']}.err1.json"
        assert record["reference_mask_sha256"] in gt_sha.values() and record["shape"] == [12, 10, 6]
        assert hashlib.sha256(body.read_bytes()).hexdigest() == record["mesh_sha256"] and record["bytes"] == body.stat().st_size
        assert record["format"] == "cardiac-errormesh/1" and record["source"] == "error_mesh"
        decoded = error_artifact.decode_error_mesh(body.read_bytes())
        assert [c["voxels"] for c in decoded["header"]["classes"]] == [record["fp_voxels"], record["fn_voxels"]]
    # INT-12: CASE_0031 has no ground truth in the cache, so no error mesh exists for any of its predictions
    assert "CASE_0031" not in gt_sha
    int12_predictions = {artifact_record["checksum"]["value"]
                         for package in (environment["accepted"]["manifest"], environment["second"]["manifest"])
                         for artifact_record in package["artifacts"] if artifact_record.get("case_id") == "CASE_0031"}
    assert int12_predictions
    assert not [path for path in built["dir"].iterdir()
                if any(sha in path.name for sha in int12_predictions) and ".err1." in path.name]
    assert not any("RUN_0031" in line and "ERROR" in line for line in built["lines"])


def test_the_error_mesh_reference_its_bytes_and_the_classes_of_every_face(mesh_api, environment):
    api = mesh_api
    run = api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()
    meta = error_reconstruction(api, "RUN_9001", "RAW").json()
    geometry = api.call("GET", f"{B}/cases/CASE_9001/geometry", "geometry_get", 200).json()
    gt_slice = api.call("GET", f"{B}/cases/CASE_9001/slices/2/ground-truth", "ground_truth_slice_get", 200).json()
    assert ERROR_MESH_ID.fullmatch(meta["error_mesh_artifact_id"])
    # the ids are the ones the other endpoints state for the very same masks
    assert meta["reference_mask_id"] == gt_slice["reference_mask_id"] == "MASK_CASE_9001"
    assert meta["prediction_mask_id"] == run["raw_prediction_artifact_id"] and meta["prediction_variant"] == "RAW"
    for key, value in geometry.items():  # the same geometry as geometry_get, state included
        assert meta[key] == value
    assert meta["geometry_validation_status"] == "GEOMETRY_NOT_VALIDATED"
    assert meta["error_mesh_artifact_id"] not in run["reconstruction_ids"], "surface meshes only (SCR-03's 3D entry)"
    payload = mesh_bytes(api, meta["error_mesh_artifact_id"])
    decoded = error_artifact.decode_error_mesh(payload)
    header = decoded["header"]
    cases = api.app.state.backend.cases
    manifest_sha = next(item for item in environment["accepted"]["manifest"]["artifacts"]
                        if item["artifact_id"] == "ART_RUN_9001_RAW")["checksum"]["value"]
    assert header["shape"] == geometry["shape"] == [12, 10, 6]
    assert header["reference_mask_sha256"] == cases.get("CASE_9001").data["mask_sha256"]
    assert header["prediction_mask_sha256"] == manifest_sha
    # TC-ERR-001: the classes are the boolean mask operations, checked here against plain set arithmetic
    prediction = voxel_set(environment["accepted"]["predictions"]["RUN_9001"])
    reference = voxel_set(environment["volumes"]["CASE_9001"]["gt"])
    fp, fn = header["classes"]
    assert (fp["voxels"], fn["voxels"], header["agreement_voxels"]) == (
        len(prediction - reference), len(reference - prediction), len(prediction & reference))
    assert fp["voxels"] > 0 and fn["voxels"] > 0, "the synthetic pair has both kinds of error"
    voxels = foreground_voxel_of_each_face(decoded)
    classes = decoded["face_class"]
    for t in range(voxels.shape[0]):
        voxel = tuple(int(c) for c in voxels[t])
        if classes[t] == 1:
            assert voxel in prediction - reference, (t, voxel)
        else:
            assert classes[t] == 2 and voxel in reference - prediction, (t, voxel)
        assert int(decoded["face_source_slice"][t]) == voxel[2]
    # the server's own numbers: the artifact counts what analysis_run_metrics counts
    metrics = api.call("GET", f"{B}/analysis-runs/RUN_9001/metrics?prediction_variant=RAW", "analysis_run_metrics", 200).json()
    assert (fp["voxels"], fn["voxels"]) == (metrics["metric_values"]["false_positives"], metrics["metric_values"]["false_negatives"])
    assert metrics["reference_mask_id"] == meta["reference_mask_id"] and metrics["prediction_mask_id"] == meta["prediction_mask_id"]


def test_every_error_face_lies_on_the_served_masks_of_its_source_slice(mesh_api):
    """H7 for errors: a picked FP face has the prediction at that (column, row) of its slice and no ground truth there;
    a picked FN face the other way round - read from the served PNGs (row = y, column = x)."""
    api = mesh_api
    for run, case, variant in (("RUN_9001", "CASE_9001", "RAW"), ("RUN_9001", "CASE_9001", "PROCESSED"),
                               ("RUN_9003", "CASE_9003", "RAW")):
        meta = error_reconstruction(api, run, variant).json()
        decoded = error_artifact.decode_error_mesh(mesh_bytes(api, meta["error_mesh_artifact_id"]))
        voxels = foreground_voxel_of_each_face(decoded)
        slices = decoded["face_source_slice"].astype(np.int64)
        pixels = {}
        for z in sorted(set(slices.tolist())):
            prediction = api.call("GET", f"{B}/analysis-runs/{run}/slices/{z}/prediction?variant={variant}",
                                  "prediction_slice_get", 200).json()
            reference = api.call("GET", f"{B}/cases/{case}/slices/{z}/ground-truth", "ground_truth_slice_get", 200).json()
            pixels[z] = (png_array(api.client.get(prediction["content_url"]).content),
                         png_array(api.client.get(reference["content_url"]).content))
        seen = set()
        for t, (x, y, z) in enumerate(voxels):
            assert int(slices[t]) == int(z), f"face {t}: its source slice is not the slice of the voxel behind it"
            prediction_png, reference_png = pixels[int(slices[t])]   # the PNG of the slice the FACE names
            cls = int(decoded["face_class"][t])
            seen.add(cls)
            if cls == error_artifact.CLASS_FP:
                assert (prediction_png[int(y), int(x)], reference_png[int(y), int(x)]) == (255, 0), (run, variant, "FP", x, y, z)
            else:
                assert (prediction_png[int(y), int(x)], reference_png[int(y), int(x)]) == (0, 255), (run, variant, "FN", x, y, z)
        assert seen == {1, 2}, (run, variant, "the synthetic pair has false positives and false negatives")


def test_processed_has_its_own_error_mesh_and_an_unknown_variant_is_not_found(mesh_api, environment):
    api = mesh_api
    raw = error_reconstruction(api, "RUN_9001", "RAW").json()
    processed = error_reconstruction(api, "RUN_9001", "PROCESSED").json()
    assert processed["prediction_variant"] == "PROCESSED" and processed["prediction_mask_id"] == "ART_RUN_9001_PROCESSED"
    assert raw["error_mesh_artifact_id"] != processed["error_mesh_artifact_id"]
    decoded = error_artifact.decode_error_mesh(mesh_bytes(api, processed["error_mesh_artifact_id"]))
    prediction, reference = voxel_set(processed_prediction(environment)), voxel_set(environment["volumes"]["CASE_9001"]["gt"])
    assert [c["voxels"] for c in decoded["header"]["classes"]] == [len(prediction - reference), len(reference - prediction)]
    # RUN_9003 has no PROCESSED prediction: not found, never the RAW error mesh relabelled
    missing = error_reconstruction(api, "RUN_9003", "PROCESSED", 404)
    assert api.error_code(missing) == "ARTIFACT_NOT_FOUND" and "PROCESSED" in json.dumps(missing.json())
    for odd in ("REVIEWED", "raw", "", "RAW%20"):
        assert api.error_code(error_reconstruction(api, "RUN_9001", odd, 404)) == "ARTIFACT_NOT_FOUND"
    no_variant = api.call("GET", f"{B}/analysis-runs/RUN_9001/error-reconstruction", "error_reconstruction_get", 404)
    assert api.error_code(no_variant) == "ARTIFACT_NOT_FOUND"
    assert api.error_code(api.call("GET", f"{B}/analysis-runs/RUN_NOPE/error-reconstruction?prediction_variant=RAW",
                                   "error_reconstruction_get", 404)) == "ARTIFACT_NOT_FOUND"


def test_int12_has_no_error_mesh_even_when_one_is_planted(environment, built, tmp_path):
    """INT-12: the route answers GROUND_TRUTH_UNAVAILABLE first; and an error mesh planted against a ground truth the
    backend does not serve is never loaded, so its bytes are not on the content route either."""
    derived = tmp_path / "derived"
    shutil.copytree(built["dir"], derived)
    probe = make_api(environment, tmp_path / "probe", derived)
    try:
        run = probe.app.state.backend.experiments.runs["RUN_0031"]
        int12_prediction = run.package.artifacts[run.raw_mask_id]["checksum"]["value"]
        reference = np.zeros((6, 10, 12), dtype=np.uint8)
        reference[1:5, 3:7, 3:8] = 255                       # a forged ground truth of the withheld case
        prediction = np.zeros((6, 10, 12), dtype=np.uint8)
        prediction[1:4, 2:6, 4:9] = 255
        forged_reference = "e" * 64
        record = build_cache.store_error_volumes(derived, forged_reference, int12_prediction, reference, prediction)
        assert record["action"] == "NEW"
        for variant in ("RAW", "PROCESSED"):
            response = error_reconstruction(probe, "RUN_0031", variant, 404)
            assert probe.error_code(response) == DENY and "error_mesh_artifact_id" not in json.dumps(response.json())
    finally:
        probe._client_context.__exit__(None, None, None)
        probe.app.state.backend.storage.close()
    api = make_api(environment, tmp_path / "planted", derived)
    try:
        backend = api.app.state.backend
        planted = f"{forged_reference}.{int12_prediction}.err1.json"
        assert planted in backend.meshes.rejected and backend.meshes.for_error(forged_reference, int12_prediction) is None
        assert api.client.get(f"{B}/artifacts/{record['mesh_sha256']}.cmesh").status_code == 404
        assert api.error_code(error_reconstruction(api, "RUN_0031", "RAW", 404)) == DENY
        # the cases that have a ground truth are untouched by the refusal
        assert error_reconstruction(api, "RUN_9001", "RAW").json()["error_mesh_artifact_id"].startswith("ERRMESH_")
    finally:
        api._client_context.__exit__(None, None, None)
        api.app.state.backend.storage.close()


def test_a_rerun_never_overwrites_an_error_mesh(environment, built, tmp_path):
    copy = tmp_path / "root"
    copy.mkdir()
    shutil.copytree(environment["cache"], copy / "data_cache")
    shutil.copytree(environment["experiments"], copy / "experiments")
    shutil.copytree(built["dir"], copy / "derived_meshes")
    victim = next((copy / "derived_meshes").glob("*.err1.cmesh"))
    original = victim.read_bytes()
    victim.write_bytes(original[:-4] + b"\x01\x00\x00\x00")
    with pytest.raises(build_cache.BuildError) as raised:
        build_cache.build_all(copy, log=lambda *a, **k: None)
    assert raised.value.code == "CHECKSUM_CONFLICT" and victim.read_bytes() != original
    # an interrupted build (body, no sidecar) is rebuilt with identical bytes, and a different body is a conflict
    victim.write_bytes(original)
    victim.with_name(victim.name.replace(".err1.cmesh", ".err1.json")).unlink()
    again = build_cache.build_all(copy, log=lambda *a, **k: None)
    assert again["error_meshes"]["new"] == 1 and victim.read_bytes() == original
    victim.with_name(victim.name.replace(".err1.cmesh", ".err1.json")).unlink()
    victim.write_bytes(original[:-4] + b"\x02\x00\x00\x00")
    with pytest.raises(build_cache.BuildError) as raised:
        build_cache.build_all(copy, log=lambda *a, **k: None)
    assert raised.value.code == "CHECKSUM_CONFLICT"


def test_the_content_route_serves_only_verified_error_mesh_bytes(mesh_api):
    api = mesh_api
    meta = error_reconstruction(api, "RUN_9003", "RAW").json()
    digest = meta["error_mesh_artifact_id"].split("_", 1)[1]
    assert api.client.get(f"{B}/artifacts/{digest}.png").status_code == 404      # a mesh is not a PNG
    assert api.client.get(f"{B}/artifacts/{digest}.cmesh").status_code == 200
    path = api.app.state.backend.meshes.by_mesh[digest].path
    original = path.read_bytes()
    try:
        path.write_bytes(original[:-4] + b"\x07\x00\x00\x00")                    # changed on disk after start-up
        assert api.client.get(f"{B}/artifacts/{digest}.cmesh").status_code == 404
    finally:
        path.write_bytes(original)
    assert api.client.get(f"{B}/artifacts/{digest}.cmesh").status_code == 200
    # the surface mesh and the error mesh of one run are different artifacts under different ids
    surface = reconstruction(api, "RUN_9003", "ART_RUN_9003_RAW").json()["mesh_artifact_id"]
    assert surface.startswith("MESH_") and surface.split("_", 1)[1] != digest
    with pytest.raises(artifact.MeshArtifactError) as raised:
        error_artifact.decode_error_mesh(mesh_bytes(api, surface))
    assert raised.value.code == "MESH_FORMAT"
    with pytest.raises(artifact.MeshArtifactError) as raised:
        artifact.decode_mesh(mesh_bytes(api, meta["error_mesh_artifact_id"]))
    assert raised.value.code == "MESH_FORMAT"


def test_an_error_mesh_built_for_another_shape_is_a_geometry_mismatch(environment, built, tmp_path):
    derived = tmp_path / "derived"
    shutil.copytree(built["dir"], derived)
    for side in derived.glob("*.err1.json"):
        record = json.loads(side.read_text(encoding="utf-8"))
        record["shape"] = [record["shape"][0] + 1] + record["shape"][1:]
        side.write_text(json.dumps(record), encoding="utf-8")
    api = make_api(environment, tmp_path, derived)
    try:
        assert api.error_code(error_reconstruction(api, "RUN_9001", "RAW", 422)) == "GEOMETRY_MISMATCH"
    finally:
        api._client_context.__exit__(None, None, None)
        api.app.state.backend.storage.close()


def test_a_run_that_did_not_succeed_has_no_error_mesh(mesh_api):
    run = mesh_api.app.state.backend.experiments.runs["RUN_9003"]
    run.status, run.failure_reason = "FAILED", "synthetic failure"
    assert mesh_api.error_code(error_reconstruction(mesh_api, "RUN_9003", "RAW", 422)) == "ANALYSIS_FAILED"
    run.status = "RUNNING"
    assert mesh_api.error_code(error_reconstruction(mesh_api, "RUN_9003", "RAW", 409)) == "RUN_NOT_SUCCEEDED"


def test_the_request_log_tells_an_error_mesh_fetch_from_a_surface_mesh_fetch(environment, built, tmp_path):
    settings = Settings.from_env({
        "data_cache": environment["cache"], "experiments_root": environment["experiments"],
        "db_path": tmp_path / "backend.sqlite3", "render_cache": environment["root"] / "render_cache",
        "request_log": tmp_path / "logs" / "requests.jsonl", "derived_meshes": built["dir"],
    })
    app = create_app(settings)
    with TestClient(app) as client:
        api = Api(client)
        error_id = error_reconstruction(api, "RUN_9003", "RAW").json()["error_mesh_artifact_id"]
        surface_id = reconstruction(api, "RUN_9003", "ART_RUN_9003_RAW").json()["mesh_artifact_id"]
        mesh_bytes(api, error_id)
        mesh_bytes(api, surface_id)
    app.state.backend.storage.close()
    lines = [json.loads(line) for line in (tmp_path / "logs" / "requests.jsonl").read_text(encoding="utf-8").splitlines()]
    fetched = {line["digest"]: line["kind"] for line in lines if (line.get("route") or "").endswith("/artifacts/{name}")}
    assert fetched == {error_id.split("_", 1)[1]: "error_mesh", surface_id.split("_", 1)[1]: "mesh"}


# -- INT-12 defence in the store itself (QA #98 N-9) -------------------------------------------------------

def test_the_store_loads_a_ground_truth_derived_mesh_only_for_a_ground_truth_it_was_told_about(environment, built):
    served = served_ground_truths(environment)
    everything = MeshStore(built["dir"], ground_truth_masks=served)
    assert not everything.rejected
    ground_truth_sidecars = [side for side in built["dir"].glob("*.l0.json")
                             if json.loads(side.read_text(encoding="utf-8")).get("source") == "ground_truth_slices"]
    error_sidecars = list(built["dir"].glob("*.err1.json"))
    assert ground_truth_sidecars and error_sidecars
    # told about none (the default): no ground-truth mesh and no error mesh is loaded, predictions are
    default = MeshStore(built["dir"])
    assert sorted(default.rejected) == sorted(side.name for side in ground_truth_sidecars + error_sidecars)
    assert not default.by_error and len(default.by_mask) == len(everything.by_mask) - len(ground_truth_sidecars)
    assert set(default.by_mesh) == {entry.mesh_sha256 for entry in default.by_mask.values()}
    # told about all but one: that one's mesh and every error mesh against it are refused, the others are loaded
    one = sorted(served)[0]
    partial = MeshStore(built["dir"], ground_truth_masks=served - {one})
    assert one not in partial.by_mask and all(key[0] != one for key in partial.by_error)
    assert {key[0] for key in everything.by_error} == served and len(partial.by_error) < len(everything.by_error)


def test_a_ground_truth_mesh_of_an_unserved_case_is_not_on_the_content_route(environment, built, tmp_path):
    """INT-12 by construction cannot have one (no ground truth in the cache); if a pair were planted anyway - built by
    hand, source ground_truth_slices, a digest no EVALUATION case owns - the backend would not load or serve it."""
    derived = tmp_path / "derived"
    shutil.copytree(built["dir"], derived)
    forged = np.zeros((6, 10, 12), dtype=np.uint8)
    forged[2:5, 6:9, 1:4] = 255
    forged[0, 0, 0] = 255        # a shape no synthetic mask has: its bytes are its own
    record = build_cache.store_volume(derived, "d" * 64, forged, "ground_truth_slices")
    assert record["action"] == "NEW"
    api = make_api(environment, tmp_path, derived)
    try:
        assert f"{'d' * 64}.l0.json" in api.app.state.backend.meshes.rejected
        assert api.client.get(f"{B}/artifacts/{record['mesh_sha256']}.cmesh").status_code == 404
        assert api.app.state.backend.meshes.for_mask("d" * 64) is None
    finally:
        api._client_context.__exit__(None, None, None)
        api.app.state.backend.storage.close()
    # a prediction-sourced mesh with an unknown digest is still loaded: only ground-truth-derived meshes are gated
    other = build_cache.store_volume(derived, "c" * 64, forged, "prediction")
    assert other["action"] == "NEW"
    assert "c" * 64 in MeshStore(derived, ground_truth_masks=served_ground_truths(environment)).by_mask
