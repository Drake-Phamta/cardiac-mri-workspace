"""SCR-05 on the backend: derived L0 meshes (build_cache), reconstruction_get and the mesh content route.

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
from backend.app.config import Settings
from backend.app.main import create_app
from backend.mesh import artifact, build_case_mesh, build_cache

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


def mesh_bytes(api: Api, mesh_artifact_id: str) -> bytes:
    digest = mesh_artifact_id.split("_", 1)[1]
    response = api.client.get(f"{B}/artifacts/{digest}.cmesh")
    assert response.status_code == 200, response.text
    assert hashlib.sha256(response.content).hexdigest() == digest
    assert response.headers["etag"] == f'"sha256:{digest}"' and "immutable" in response.headers["cache-control"]
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


def test_error_reconstruction_stays_honestly_unavailable_while_dr005_is_open(mesh_api):
    response = mesh_api.call("GET", f"{B}/analysis-runs/RUN_9001/error-reconstruction?prediction_variant=RAW",
                             "error_reconstruction_get", 404)
    assert mesh_api.error_code(response) == "ARTIFACT_NOT_FOUND" and "DR-005" in json.dumps(response.json())


def test_without_derived_meshes_nothing_is_offered(bare_api):
    api = bare_api
    assert api.error_code(reconstruction(api, "RUN_9001", "ART_RUN_9001_RAW", 404)) == "ARTIFACT_NOT_FOUND"
    assert api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()["reconstruction_ids"] == []
    study = api.call("GET", f"{B}/studies/STUDY_LA_001", "study_get", 200).json()
    assert study["capabilities"]["reconstruction_3d"] is False


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
    from backend.app.meshes import MeshStore

    store = MeshStore(derived)
    assert sorted(store.rejected) == sorted(path.name for path in sidecars[:3]) and len(store.by_mask) == len(sidecars) - 3
