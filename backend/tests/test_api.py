"""Backend tests on the synthetic package (TestClient; no real data, no network).

Run from the repository root:  python -m pytest backend/tests -q
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import sqlite3

import numpy as np
import pytest
from PIL import Image

from backend.app import imaging, ingest
from conftest import CONTRACT
import synthetic

B = "/api/v1"
STUDY = "STUDY_LA_001"
GEOMETRY_VERSION = CONTRACT["geometry_contract"]["version"]
PHYSICAL = re.compile(r"(^|_)(mm|ml|mm2|mm3|cm|cm3|millimet\w*|millilit\w*)($|_)", re.IGNORECASE)


def png_array(payload: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(payload)) as image:
        return np.asarray(image.convert("L"))


def keys(value, prefix=""):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from keys(inner)


# -- service and routes ---------------------------------------------------------

def test_health_and_every_contract_route_exists(api):
    health = api.client.get("/health").json()
    assert health["status"] == "ok" and health["contract_version"] == CONTRACT["contract_version"]
    assert health["cases"] == {"total": 3, "EVALUATION": 2, "INFERENCE_REVIEW": 1}
    assert health["experiments"] == 1 and health["runs"] == 3
    assert health["rejected_experiment_packages"] == ["GATE_ML_01_NOT_ACCEPTED"]
    routes = {(method, route.path) for route in api.app.routes for method in getattr(route, "methods", set())}
    for endpoint in CONTRACT["endpoints"]:
        path = endpoint["path"].split("?", 1)[0]
        path = re.sub(r"\{experiment_ids\}", "", path)
        assert (endpoint["method"], path) in routes, endpoint["id"]


def test_selection_rule_skips_case_0027(environment):
    split = json.loads(environment["split_manifest"].read_text(encoding="utf-8"))
    selection = ingest.rule_based_selection(split)
    assert selection[0] == {"case_id": synthetic.INTEGRATION, "role": "INTEGRATION_CASE_001", "mode": "EVALUATION",
                            "split_partition": "validation"}
    assert [item["case_id"] for item in selection if item["mode"] == "EVALUATION"] == ["CASE_9001", "CASE_9003"]
    assert selection[-1]["case_id"] == synthetic.INT12 and selection[-1]["mode"] == "INFERENCE_REVIEW"


def test_selection_on_the_real_split_manifest_when_present():
    path = ingest.DEFAULT_SPLIT_MANIFEST
    if not path.exists():
        pytest.skip("data/manifests/split_manifest_path_a_seed2024.json is not on this branch yet (PR #35)")
    selection = ingest.rule_based_selection(json.loads(path.read_text(encoding="utf-8")))
    assert selection[0]["case_id"] == "CASE_0061"
    assert len([item for item in selection if item["split_partition"] == "validation"]) == 20
    assert selection[-1]["case_id"] == "CASE_0001" and selection[-1]["mode"] == "INFERENCE_REVIEW"


# -- study and cases ------------------------------------------------------------

def test_study_and_case_list(api):
    study = api.call("GET", f"{B}/studies/{STUDY}", "study_get", 200).json()
    assert study["case_counts"] == {"total": 3, "EVALUATION": 2, "INFERENCE_REVIEW": 1}
    assert study["capabilities"]["ground_truth_evaluation"] and study["capabilities"]["inference_review"]
    assert study["experiment_summary"] == {"status": "AVAILABLE", "experiment_ids": ["EXP-U-025"], "reason": None}
    rows = api.call("GET", f"{B}/studies/{STUDY}/cases", "case_list", 200).json()["items"]
    assert [(row["case_id"], row["mode_capability"], row["ground_truth_available"]) for row in rows] == [
        ("CASE_0031", "INFERENCE_REVIEW", False), ("CASE_9001", "EVALUATION", True), ("CASE_9003", "EVALUATION", True)]
    only = api.call("GET", f"{B}/studies/{STUDY}/cases?mode=INFERENCE_REVIEW", "case_list", 200).json()
    assert [row["case_id"] for row in only["items"]] == ["CASE_0031"] and only["mode"] == "INFERENCE_REVIEW"
    empty = api.call("GET", f"{B}/studies/{STUDY}/cases?q=NOPE", "case_list", 200).json()
    assert empty == {"items": [], "next_page": None, "mode": None}
    paged = api.call("GET", f"{B}/studies/{STUDY}/cases?limit=1", "case_list", 200).json()
    assert len(paged["items"]) == 1 and paged["next_page"] == "1"
    bad = api.call("GET", f"{B}/studies/{STUDY}/cases?mode=BOTH", "case_list", 422)
    assert api.error_code(bad) == "VALIDATION_ERROR"
    assert api.error_code(api.call("GET", f"{B}/studies/NOPE", "study_get", 404)) == "ARTIFACT_NOT_FOUND"


def test_case_geometry_is_index_space_only(api):
    case = api.call("GET", f"{B}/cases/CASE_9001", "case_get", 200).json()
    assert case["mode"] == "EVALUATION" and case["ground_truth_available"] is True
    assert case["available_run_ids"] == ["RUN_9001"]
    assert case["shape"] == [synthetic.NX, synthetic.NY, synthetic.NZ]
    assert case["geometry_validation_status"] == "GEOMETRY_NOT_VALIDATED"
    assert case["geometry_contract_version"] == GEOMETRY_VERSION
    assert case["spacing"] == [1.0, 1.0, 1.0] and case["origin"] == [0.0, 0.0, 0.0]
    geometry = api.call("GET", f"{B}/cases/CASE_9001/geometry", "geometry_get", 200).json()
    assert {key: case[key] for key in geometry} == geometry
    assert api.error_code(api.call("GET", f"{B}/cases/CASE_4040", "case_get", 404)) == "CASE_NOT_FOUND"


# -- slices ---------------------------------------------------------------------

def test_mri_slices_are_the_source_pixels(api, environment):
    source = environment["volumes"]["CASE_9001"]["mri"]
    for z in (0, synthetic.NZ - 1):
        meta = api.call("GET", f"{B}/cases/CASE_9001/slices/{z}/mri", "mri_slice_get", 200).json()
        assert meta["media_type"] == "image/png" and meta["source_volume_id"] == "VOL_CASE_9001"
        content = api.client.get(meta["content_url"])
        assert content.status_code == 200 and content.headers["content-type"] == "image/png"
        assert "sha256:" + hashlib.sha256(content.content).hexdigest() == meta["checksum"]
        assert content.headers["etag"] == f'"{meta["checksum"]}"'
        pixels = png_array(content.content)
        assert pixels.shape == (synthetic.NY, synthetic.NX)  # rows = y, columns = x
        assert np.array_equal(pixels, source[:, :, z].T)
    for bad in (str(synthetic.NZ), "-1", "abc", "1.5"):
        response = api.call("GET", f"{B}/cases/CASE_9001/slices/{bad}/mri", "mri_slice_get", 422)
        assert api.error_code(response) == "SLICE_OUT_OF_RANGE"
    assert api.error_code(api.call("GET", f"{B}/cases/CASE_4040/slices/0/mri", "mri_slice_get", 404)) == "CASE_NOT_FOUND"
    missing = api.client.get(f"{B}/artifacts/{'0' * 64}.png")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "ARTIFACT_NOT_FOUND"


def test_ground_truth_is_served_only_for_evaluation_cases(api, environment):
    meta = api.call("GET", f"{B}/cases/CASE_9001/slices/2/ground-truth", "ground_truth_slice_get", 200).json()
    assert meta["reference_mask_id"] == "MASK_CASE_9001"
    pixels = png_array(api.client.get(meta["content_url"]).content)
    assert np.array_equal(pixels, environment["volumes"]["CASE_9001"]["gt"][:, :, 2].T)
    withheld = api.call("GET", f"{B}/cases/CASE_0031/slices/2/ground-truth", "ground_truth_slice_get", 404)
    assert api.error_code(withheld) == "GROUND_TRUTH_UNAVAILABLE"
    # Nothing derived from the INT-12 ground truth is in the cache at all.
    assert not (environment["cache"] / "cases" / "CASE_0031" / "gt").exists()
    record = json.loads((environment["cache"] / "contract1_record.json").read_text(encoding="utf-8"))
    int12 = next(case for case in record["cases"] if case["case_id"] == "CASE_0031")
    assert int12["ground_truth_withheld"] is True and int12["ground_truth_mask"] is None
    assert int12["mode_capability"] == "INFERENCE_REVIEW"


def test_inference_only_case_never_exposes_ground_truth(api):
    case = api.call("GET", f"{B}/cases/CASE_0031", "case_get", 200).json()
    assert case["mode"] == "INFERENCE_REVIEW" and case["ground_truth_available"] is False
    run = "RUN_0031"
    for url, endpoint_id in (
        (f"{B}/analysis-runs/{run}/metrics?prediction_variant=RAW", "analysis_run_metrics"),
        (f"{B}/analysis-runs/{run}/slices/2/metrics?prediction_variant=RAW", "analysis_slice_metrics"),
        (f"{B}/analysis-runs/{run}/slices/2/error?prediction_variant=RAW", "analysis_slice_error"),
        (f"{B}/analysis-runs/{run}/error-reconstruction?prediction_variant=RAW", "error_reconstruction_get"),
    ):
        assert api.error_code(api.call("GET", url, endpoint_id, 404)) == "GROUND_TRUTH_UNAVAILABLE", endpoint_id
    # Inference & review still works: the prediction is served and reviewable.
    api.call("GET", f"{B}/analysis-runs/{run}/slices/2/prediction?variant=RAW", "prediction_slice_get", 200)
    review = api.call("POST", f"{B}/analysis-runs/{run}/reviews", "review_create", 201, json_body={
        "status": "NOT_REVIEWED", "source_mask_id": "ART_RUN_0031_RAW", "prediction_variant": "RAW"}).json()
    assert review["status"] == "NOT_REVIEWED"
    for seen in api.seen:
        assert "reference_mask_id" not in json.dumps(seen["body"]) or seen["status"] >= 400, seen["url"]


def test_prediction_slices_per_variant_never_substitute(api, environment):
    predictions = environment["accepted"]["predictions"]["RUN_9001"]
    raw = api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/3/prediction?variant=RAW", "prediction_slice_get", 200).json()
    processed = api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/3/prediction?variant=PROCESSED",
                         "prediction_slice_get", 200).json()
    assert raw["prediction_variant"] == "RAW" and processed["prediction_variant"] == "PROCESSED"
    assert raw["prediction_mask_id"] == "ART_RUN_9001_RAW" and processed["prediction_mask_id"] == "ART_RUN_9001_PROCESSED"
    raw_pixels = png_array(api.client.get(raw["content_url"]).content)
    assert np.array_equal(raw_pixels, (predictions[:, :, 3].T != 0).astype(np.uint8) * 255)
    assert not png_array(api.client.get(processed["content_url"]).content).any()  # the processed slice 3 is empty
    absent = api.call("GET", f"{B}/analysis-runs/RUN_0031/slices/3/prediction?variant=PROCESSED", "prediction_slice_get", 404)
    assert api.error_code(absent) == "ARTIFACT_NOT_FOUND"  # never the RAW mask relabelled
    for query in ("?variant=raw", "", "?variant=REVIEWED"):
        response = api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/3/prediction{query}", "prediction_slice_get", 404)
        assert api.error_code(response) == "ARTIFACT_NOT_FOUND"
    failed = api.call("GET", f"{B}/analysis-runs/RUN_9003/slices/3/prediction?variant=RAW", "prediction_slice_get", 409)
    assert api.error_code(failed) == "RUN_NOT_SUCCEEDED"


# -- runs and metrics -----------------------------------------------------------

def test_runs_and_unavailable_metrics(api):
    run = api.call("GET", f"{B}/analysis-runs/RUN_9001", "analysis_run_get", 200).json()
    assert run["status"] == "SUCCEEDED" and run["precomputed"] is True and run["failure_code"] is None
    failed = api.call("GET", f"{B}/analysis-runs/RUN_9003", "analysis_run_get", 200).json()
    assert failed["status"] == "FAILED" and failed["failure_code"] == "ANALYSIS_FAILED"
    assert api.error_code(api.call("GET", f"{B}/analysis-runs/RUN_X", "analysis_run_get", 404)) == "ARTIFACT_NOT_FOUND"
    # No metric artifact is ingested yet: the contract's unavailable state, never a number.
    metrics = api.call("GET", f"{B}/analysis-runs/RUN_9001/metrics?prediction_variant=RAW", "analysis_run_metrics", 404)
    assert api.error_code(metrics) == "ARTIFACT_NOT_FOUND"
    assert metrics.json()["error"]["details"]["reason"] == "METRICS_NOT_INGESTED"
    assert api.error_code(api.call("GET", f"{B}/analysis-runs/RUN_9003/metrics?prediction_variant=RAW",
                                   "analysis_run_metrics", 422)) == "ANALYSIS_FAILED"
    assert api.error_code(api.call("GET", f"{B}/experiments/EXP-U-025/metrics", "experiment_metrics", 404)) == "ARTIFACT_NOT_FOUND"
    assert api.error_code(api.call("GET", f"{B}/experiments/EXP-D-025", "experiment_get", 404)) == "ARTIFACT_NOT_FOUND"
    experiment = api.call("GET", f"{B}/experiments/EXP-U-025", "experiment_get", 200).json()
    assert experiment["prediction_variant"] == "RAW" and experiment["training_fraction"] == 0.25
    listing = api.call("GET", f"{B}/experiments", "experiment_list", 200).json()
    assert listing["items"] == [{"experiment_id": "EXP-U-025", "prediction_variant": "RAW"}]
    assert listing["evaluation_population"] == "holdout-final-54"
    created = api.call("POST", f"{B}/cases/CASE_9001/analysis-runs", "analysis_run_create", 409,
                       json_body={"experiment_id": "EXP-U-025"})
    assert api.error_code(created) == "RUN_NOT_DEPLOYABLE"


# -- reviews --------------------------------------------------------------------

def _new_review(api, run="RUN_9001", variant="RAW", status="NOT_REVIEWED"):
    source = f"ART_{run}_{variant}"
    return api.call("POST", f"{B}/analysis-runs/{run}/reviews", "review_create", None, json_body={
        "status": status, "source_mask_id": source, "prediction_variant": variant})


def _patch(api, review_id, status, revision, expect):
    return api.call("PATCH", f"{B}/reviews/{review_id}", "review_patch", expect,
                    json_body={"status": status, "expected_revision": revision})


def test_review_states_and_transitions(api):
    created = _new_review(api)
    assert created.status_code == 201
    review = created.json()
    assert review["status"] == "NOT_REVIEWED" and review["revision"] == 1 and created.headers["etag"] == review["etag"]
    again = _new_review(api)  # "initialise when needed": the same review comes back
    assert again.status_code == 200 and again.json()["review_id"] == review["review_id"]
    rid = review["review_id"]
    assert api.error_code(_patch(api, rid, "ACCEPTED", 7, 409)) == "STALE_REVISION"
    assert _patch(api, rid, "ACCEPTED", 1, 200).json()["revision"] == 2
    assert _patch(api, rid, "FLAGGED", 2, 200).json()["status"] == "FLAGGED"  # ACCEPTED -> FLAGGED, history kept
    for status in ("ACCEPTED", "NOT_REVIEWED", "FLAGGED"):  # not in the transition table, repeats included
        assert api.error_code(_patch(api, rid, status, 3, 409)) == "INVALID_REVIEW_TRANSITION", status
    refused = _patch(api, rid, "CORRECTED", 3, 409)  # CORRECTED needs a persisted reviewed mask
    assert api.error_code(refused) == "INVALID_REVIEW_TRANSITION"
    assert api.error_code(_patch(api, rid, "APPROVED", 3, 422)) == "VALIDATION_ERROR"
    assert api.error_code(api.call("PATCH", f"{B}/reviews/{rid}", "review_patch", 422,
                                   json_body={"status": "ACCEPTED"})) == "VALIDATION_ERROR"
    conflict = _new_review(api, status="ACCEPTED")
    assert conflict.status_code == 409 and api.error_code(conflict) == "INVALID_REVIEW_TRANSITION"
    corrected = _new_review(api, run="RUN_9001", variant="PROCESSED", status="CORRECTED")
    assert corrected.status_code == 409 and api.error_code(corrected) == "INVALID_REVIEW_TRANSITION"
    history = api.app.state.backend.storage.review_history(rid)
    assert [(row["from_status"], row["to_status"]) for row in history] == [
        (None, "NOT_REVIEWED"), ("NOT_REVIEWED", "ACCEPTED"), ("ACCEPTED", "FLAGGED")]


def test_review_source_must_be_the_runs_prediction(api):
    gt_source = api.call("POST", f"{B}/analysis-runs/RUN_9001/reviews", "review_create", 422, json_body={
        "status": "NOT_REVIEWED", "source_mask_id": "MASK_CASE_9001", "prediction_variant": "RAW"})
    assert api.error_code(gt_source) == "VALIDATION_ERROR"
    wrong_variant = api.call("POST", f"{B}/analysis-runs/RUN_9001/reviews", "review_create", 422, json_body={
        "status": "NOT_REVIEWED", "source_mask_id": "ART_RUN_9001_RAW", "prediction_variant": "PROCESSED"})
    assert api.error_code(wrong_variant) == "VALIDATION_ERROR"
    failed = api.call("POST", f"{B}/analysis-runs/RUN_9003/reviews", "review_create", 409, json_body={
        "status": "NOT_REVIEWED", "source_mask_id": "ART_RUN_9003_RAW", "prediction_variant": "RAW"})
    assert api.error_code(failed) == "RUN_NOT_SUCCEEDED"


def _working_body(source, revision, z, mask, encoding="BITPACK_BASE64", geometry=GEOMETRY_VERSION,
                  status="GEOMETRY_NOT_VALIDATED"):
    if encoding == "BITPACK_BASE64":
        data = imaging.encode_bitpack(mask)
    else:
        buffer = io.BytesIO()
        Image.fromarray(mask.astype(np.uint8)).save(buffer, format="PNG")
        data = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {"source_mask_id": source, "expected_revision": revision, "slice_index": z,
            "geometry_contract_version": geometry, "geometry_validation_status": status,
            "mask_payload": {"encoding": encoding, "data": data}}


def test_correction_creates_immutable_versions_and_never_touches_the_source(api, environment):
    source_file = environment["accepted"]["root"] / "RUN_9001" / "raw.nrrd"
    source_sha_before = hashlib.sha256(source_file.read_bytes()).hexdigest()
    review = _new_review(api).json()
    rid, source = review["review_id"], "ART_RUN_9001_RAW"
    url = f"{B}/reviews/{rid}/working-mask/slices/2"
    edited = np.zeros((synthetic.NY, synthetic.NX), dtype=np.uint8)
    edited[1:4, 2:9] = 255

    put = api.call("PUT", url, "working_mask_put", 200, json_body=_working_body(source, 1, 2, edited))
    assert put.json()["working_revision"] == 2
    assert api.error_code(api.call("PUT", url, "working_mask_put", 409,
                                   json_body=_working_body(source, 1, 2, edited))) == "STALE_REVISION"
    for body, code in (
        (_working_body(source, 2, 2, edited, geometry="dr008a-dr012/v1.0.1"), "GEOMETRY_MISMATCH"),
        (_working_body(source, 2, 2, edited, status="VALIDATED_AXIS_ALIGNED"), "GEOMETRY_MISMATCH"),
        (_working_body(source, 2, 2, np.zeros((synthetic.NY + 1, synthetic.NX), np.uint8), encoding="PNG_BASE64"),
         "GEOMETRY_MISMATCH"),
        (_working_body("MASK_CASE_9001", 2, 2, edited), "VALIDATION_ERROR"),
        (_working_body(source, 2, 3, edited), "VALIDATION_ERROR"),
    ):
        assert api.error_code(api.call("PUT", url, "working_mask_put", None, json_body=body)) == code
    png_edit = edited.copy()
    png_edit[5, 5] = 255
    api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/4", "working_mask_put", 200,
             json_body=_working_body(source, 2, 4, png_edit, encoding="PNG_BASE64"))

    assert api.error_code(api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 409,
                                   json_body={"expected_revision": 1})) == "STALE_REVISION"
    first = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201, json_body={"expected_revision": 3}).json()
    assert first["reviewed_mask_id"] == f"RM_{rid}_V1" and first["revision"] == 4 and first["status"] == "CORRECTED"
    assert first["provenance"]["version"] == 1 and first["provenance"]["parent_reviewed_mask_id"] is None
    assert first["provenance"]["case_id"] == "CASE_9001" and first["provenance"]["run_id"] == "RUN_9001"
    assert first["source_mask_kind"] == "RAW_PREDICTION"
    status = api.call("PATCH", f"{B}/reviews/{rid}", "review_patch", 409,
                      json_body={"status": "CORRECTED", "expected_revision": 4})
    assert api.error_code(status) == "INVALID_REVIEW_TRANSITION"  # the commit already left it CORRECTED

    slice2 = api.call("GET", f"{B}/reviewed-masks/{first['reviewed_mask_id']}/slices/2", "reviewed_mask_slice_get", 200).json()
    assert np.array_equal(png_array(api.client.get(slice2["content_url"]).content), edited)
    slice0 = api.call("GET", f"{B}/reviewed-masks/{first['reviewed_mask_id']}/slices/0", "reviewed_mask_slice_get", 200).json()
    expected0 = (environment["accepted"]["predictions"]["RUN_9001"][:, :, 0].T != 0).astype(np.uint8) * 255
    assert np.array_equal(png_array(api.client.get(slice0["content_url"]).content), expected0)

    nothing = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 422, json_body={"expected_revision": 4})
    assert api.error_code(nothing) == "VALIDATION_ERROR"  # working edits were consumed by the commit
    second_edit = np.zeros_like(edited)
    api.call("PUT", url, "working_mask_put", 200, json_body=_working_body(source, 4, 2, second_edit))
    second = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201, json_body={"expected_revision": 5}).json()
    assert second["provenance"]["version"] == 2 and second["provenance"]["parent_reviewed_mask_id"] == first["reviewed_mask_id"]
    assert second["checksum"] != first["checksum"]

    versions = api.call("GET", f"{B}/reviews/{rid}/reviewed-masks", "reviewed_masks_list", 200).json()["items"]
    assert [item["reviewed_mask_id"] for item in versions] == [first["reviewed_mask_id"], second["reviewed_mask_id"]]
    assert versions[0]["checksum"] == first["checksum"]  # v1 is unchanged by v2
    again = api.call("GET", f"{B}/reviewed-masks/{first['reviewed_mask_id']}/slices/2", "reviewed_mask_slice_get", 200).json()
    assert again["checksum"] == slice2["checksum"]

    storage = api.app.state.backend.storage
    for sql in ("UPDATE reviewed_masks SET checksum = 'x'", "DELETE FROM reviewed_masks",
                "UPDATE reviewed_mask_slices SET png = x''", "DELETE FROM review_history"):
        with pytest.raises(sqlite3.IntegrityError, match="IMMUTABLE_ARTIFACT"):
            storage.raw_execute(sql)
    assert hashlib.sha256(source_file.read_bytes()).hexdigest() == source_sha_before  # the raw prediction is untouched
    raw_again = api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/2/prediction?variant=RAW", "prediction_slice_get", 200).json()
    expected_raw = (environment["accepted"]["predictions"]["RUN_9001"][:, :, 2].T != 0).astype(np.uint8) * 255
    assert np.array_equal(png_array(api.client.get(raw_again["content_url"]).content), expected_raw)


REVIEW_STATES = CONTRACT["domain_enums"]["review_status"]
TRANSITIONS = CONTRACT["domain_enums"]["review_status_transitions"]


def _review_in_state(api, state):
    """A fresh review driven into `state` through the API only; returns (id, revision)."""
    review = _new_review(api).json()
    rid, revision = review["review_id"], review["revision"]
    if state in ("ACCEPTED", "FLAGGED"):
        revision = _patch(api, rid, state, revision, 200).json()["revision"]
    elif state == "CORRECTED":
        mask = np.zeros((synthetic.NY, synthetic.NX), dtype=np.uint8)
        revision = api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/1", "working_mask_put", 200,
                            json_body=_working_body("ART_RUN_9001_RAW", revision, 1, mask)).json()["working_revision"]
        revision = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201,
                            json_body={"expected_revision": revision}).json()["revision"]
    return rid, revision


@pytest.mark.parametrize("source,target", [(s, t) for s in REVIEW_STATES for t in REVIEW_STATES])
def test_every_review_state_pair_through_patch(api, source, target):
    """N9: all 16 (from, to) pairs. Edges into CORRECTED belong to review_commit (#62 QA B2)."""
    rid, revision = _review_in_state(api, source)
    allowed = target in TRANSITIONS.get(source, []) and target != "CORRECTED"
    response = _patch(api, rid, target, revision, 200 if allowed else 409)
    if allowed:
        assert response.json()["status"] == target and response.json()["revision"] == revision + 1
    else:
        assert api.error_code(response) == "INVALID_REVIEW_TRANSITION"
        assert api.app.state.backend.storage.get_review(rid)["revision"] == revision  # nothing moved


@pytest.mark.parametrize("source", REVIEW_STATES)
def test_commit_moves_every_state_to_corrected(api, source):
    rid, revision = _review_in_state(api, source)
    mask = np.full((synthetic.NY, synthetic.NX), 255, dtype=np.uint8)
    revision = api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/2", "working_mask_put", 200,
                        json_body=_working_body("ART_RUN_9001_RAW", revision, 2, mask)).json()["working_revision"]
    committed = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201,
                         json_body={"expected_revision": revision}).json()
    assert committed["status"] == "CORRECTED" and committed["revision"] == revision + 1
    assert api.app.state.backend.storage.get_review(rid)["status"] == "CORRECTED"


def test_commit_is_atomic(api, monkeypatch):
    """#62 QA B2: version, CORRECTED and the revision step persist together or not at all."""
    rid, revision = _review_in_state(api, "FLAGGED")
    mask = np.full((synthetic.NY, synthetic.NX), 255, dtype=np.uint8)
    revision = api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/3", "working_mask_put", 200,
                        json_body=_working_body("ART_RUN_9001_RAW", revision, 3, mask)).json()["working_revision"]
    from backend.app.contract import ApiError

    def unavailable(*args, **kwargs):
        raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "simulated failure while building the version"})

    experiments = api.app.state.backend.experiments
    monkeypatch.setattr(experiments, "prediction_volume", unavailable)
    failed = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 404, json_body={"expected_revision": revision})
    assert api.error_code(failed) == "ARTIFACT_NOT_FOUND"
    storage = api.app.state.backend.storage
    after = storage.get_review(rid)
    assert after["status"] == "FLAGGED" and after["revision"] == revision and storage.reviewed_masks(rid) == []
    monkeypatch.undo()
    committed = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201,
                         json_body={"expected_revision": revision}).json()  # the working edit survived the rollback
    assert committed["status"] == "CORRECTED" and committed["revision"] == revision + 1


def test_inference_only_case_on_every_ground_truth_dependent_endpoint(api):
    """N1: the INT-12 case answers GROUND_TRUTH_UNAVAILABLE on each case-scoped GT-dependent endpoint."""
    case, run = synthetic.INT12, "RUN_0031"
    calls = {
        "ground_truth_slice_get": f"{B}/cases/{case}/slices/2/ground-truth",
        "analysis_run_metrics": f"{B}/analysis-runs/{run}/metrics?prediction_variant=RAW",
        "analysis_slice_metrics": f"{B}/analysis-runs/{run}/slices/2/metrics?prediction_variant=RAW",
        "analysis_slice_error": f"{B}/analysis-runs/{run}/slices/2/error?prediction_variant=RAW",
        "error_reconstruction_get": f"{B}/analysis-runs/{run}/error-reconstruction?prediction_variant=RAW",
    }
    # The other two are experiment-level: cohort summaries keep the whole population
    # and never carry a per-case value (case_capability.case_level_scope).
    experiment_level = {"experiment_metrics", "experiment_compare"}
    assert set(calls) | experiment_level == set(CONTRACT["case_capability"]["ground_truth_dependent_endpoints"])
    for endpoint_id, url in calls.items():
        assert api.error_code(api.call("GET", url, endpoint_id, 404)) == "GROUND_TRUTH_UNAVAILABLE", endpoint_id
    for endpoint_id, url in ((
            "experiment_metrics", f"{B}/experiments/EXP-U-025/metrics"),
            ("experiment_compare", f"{B}/experiments/compare?ids=EXP-U-025,EXP-U-025")):
        response = api.call("GET", url, endpoint_id)
        assert case not in json.dumps(response.json()), endpoint_id


# -- findings -------------------------------------------------------------------

def test_findings_keep_their_evidence(api):
    created = api.call("POST", f"{B}/findings", "finding_create", 201, json_body={
        "study_id": STUDY, "experiment_id": "EXP-U-025", "case_id": "CASE_9001", "analysis_run_id": "RUN_9001",
        "prediction_variant": "PROCESSED", "slice_index": 3, "finding_type": "UNDER_SEGMENTATION",
        "note": "misses the appendage", "region_reference": {"x": 4, "y": 5}}).json()
    assert created["status"] == "OPEN" and created["revision"] == 1
    assert created["evidence"]["region_reference"] == {"x": 4, "y": 5}
    assert created["evidence"]["prediction_variant"] == "PROCESSED"
    fid = created["finding_id"]
    listed = api.call("GET", f"{B}/findings?case_id=CASE_9001", "findings_list", 200).json()["items"]
    assert [item["finding_id"] for item in listed] == [fid]
    assert api.call("GET", f"{B}/findings?case_id=CASE_9003", "findings_list", 200).json() == {"items": []}
    patched = api.call("PATCH", f"{B}/findings/{fid}", "finding_patch", 200,
                       json_body={"status": "RESOLVED", "expected_revision": 1}).json()
    assert patched["status"] == "RESOLVED" and patched["revision"] == 2 and patched["evidence"] == created["evidence"]
    assert api.error_code(api.call("PATCH", f"{B}/findings/{fid}", "finding_patch", 409,
                                   json_body={"note": "late", "expected_revision": 1})) == "STALE_REVISION"
    assert api.error_code(api.call("PATCH", f"{B}/findings/{fid}", "finding_patch", 422,
                                   json_body={"case_id": "CASE_9003", "expected_revision": 2})) == "VALIDATION_ERROR"
    for body, code, status in (
        ({"study_id": STUDY, "finding_type": "WRONG", "note": ""}, "VALIDATION_ERROR", 422),
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "case_id": "CASE_4040"}, "CASE_NOT_FOUND", 404),
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "case_id": "CASE_9001", "slice_index": 99},
         "SLICE_OUT_OF_RANGE", 422),
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "case_id": "CASE_9003", "analysis_run_id": "RUN_9001",
          "prediction_variant": "RAW"}, "VALIDATION_ERROR", 422),
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "analysis_run_id": "RUN_9001"},  # no variant
         "VALIDATION_ERROR", 422),
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "case_id": "CASE_9001", "prediction_variant": "RAW"},
         "VALIDATION_ERROR", 422),  # a variant without a run
        ({"study_id": STUDY, "finding_type": "OTHER", "note": "", "analysis_run_id": "RUN_0031",
          "prediction_variant": "PROCESSED"}, "VALIDATION_ERROR", 422),  # the run has no PROCESSED mask
    ):
        assert api.error_code(api.call("POST", f"{B}/findings", "finding_create", status, json_body=body)) == code
    inferred = api.call("POST", f"{B}/findings", "finding_create", 201, json_body={
        "study_id": STUDY, "finding_type": "OTHER", "note": "", "analysis_run_id": "RUN_0031",
        "prediction_variant": "RAW"}).json()
    assert inferred["case_id"] == "CASE_0031"
    storage = api.app.state.backend.storage
    for sql in ("UPDATE findings SET case_id = 'CASE_9003'", "UPDATE findings SET prediction_variant = 'RAW'"):
        with pytest.raises(sqlite3.IntegrityError, match="IMMUTABLE_ARTIFACT"):
            storage.raw_execute(sql)


def test_no_response_carries_a_physical_unit(api):
    api.call("GET", f"{B}/studies/{STUDY}", "study_get", 200)
    for case_id in ("CASE_9001", "CASE_0031"):
        api.call("GET", f"{B}/cases/{case_id}", "case_get", 200)
        api.call("GET", f"{B}/cases/{case_id}/geometry", "geometry_get", 200)
        api.call("GET", f"{B}/cases/{case_id}/slices/1/mri", "mri_slice_get", 200)
    api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/1/prediction?variant=RAW", "prediction_slice_get", 200)
    for seen in api.seen:
        offending = [key for key in keys(seen["body"]) if PHYSICAL.search(key)]
        assert not offending, (seen["url"], offending)
        if isinstance(seen["body"], dict) and "geometry_validation_status" in seen["body"]:
            assert seen["body"]["geometry_validation_status"] == "GEOMETRY_NOT_VALIDATED"


def test_ingest_is_idempotent_and_refuses_changed_bytes(environment, tmp_path):
    again = ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"],
                              environment["cache"], expected_split_sha256=environment["split_sha256"])
    assert again["cases"] == ["CASE_0031", "CASE_9001", "CASE_9003"]
    import shutil

    import nrrd

    changed = tmp_path / "package"
    shutil.copytree(environment["package"], changed)
    dataset = json.loads(environment["dataset_manifest"].read_text(encoding="utf-8"))
    mri = changed / next(case for case in dataset["cases"] if case["case_id"] == "CASE_9001")["mri"]["path_relative"]
    data, header = nrrd.read(str(mri))
    data[0, 0, 0] = (int(data[0, 0, 0]) + 1) % 256
    nrrd.write(str(mri), data, header)
    with pytest.raises(ingest.IngestError) as raised:
        ingest.run_ingest(changed, environment["dataset_manifest"], environment["split_manifest"], environment["cache"],
                          expected_split_sha256=environment["split_sha256"])
    assert raised.value.code == "CHECKSUM_CONFLICT"


def test_ingest_pins_the_split_and_never_merges_caches(environment, tmp_path):
    """#68 QA N-1: the split blob hash is pinned, and a cache is never a union of two splits."""
    with pytest.raises(ingest.IngestError) as raised:  # the synthetic split is not the pinned real one
        ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"],
                          tmp_path / "cache")
    assert raised.value.code == "PROVENANCE_INVALID"
    other = json.loads(environment["split_manifest"].read_text(encoding="utf-8"))
    other["split_id"] = "another_split"
    other_path = tmp_path / "other_split.json"
    other_path.write_text(json.dumps(other), encoding="utf-8")
    with pytest.raises(ingest.IngestError) as raised:
        ingest.run_ingest(environment["package"], environment["dataset_manifest"], other_path, environment["cache"],
                          expected_split_sha256=hashlib.sha256(other_path.read_bytes()).hexdigest())
    assert raised.value.code == "INDEX_CONFLICT"
    assert ingest.PINNED_SPLIT_SHA256 == "c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d"


def test_case_store_refuses_a_holdout_case_with_ground_truth(environment, tmp_path):
    """#68 QA N-1: at most one final_holdout case, and only without its ground truth."""
    import shutil

    from backend.app.cases import CaseStore

    cache = tmp_path / "cache"
    shutil.copytree(environment["cache"], cache)
    case_path = cache / "cases" / "CASE_9001" / "case.json"
    record = json.loads(case_path.read_text(encoding="utf-8"))
    record["split_partition"] = "final_holdout"  # a holdout case served WITH ground truth
    case_path.write_text(json.dumps(record), encoding="utf-8")
    with pytest.raises(RuntimeError, match="final_holdout"):
        CaseStore(cache)


def test_replace_cannot_overwrite_an_immutable_row(api):
    """#68 QA N-2: REPLACE / INSERT OR REPLACE would bypass UPDATE triggers; recursive triggers stop it."""
    rid = _new_review(api).json()["review_id"]
    mask = np.zeros((synthetic.NY, synthetic.NX), dtype=np.uint8)
    api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/1", "working_mask_put", 200,
             json_body=_working_body("ART_RUN_9001_RAW", 1, 1, mask))
    api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201, json_body={"expected_revision": 2})
    storage = api.app.state.backend.storage
    version = storage.reviewed_masks(rid)[0]
    for sql in (
        f"REPLACE INTO reviewed_masks SELECT * FROM reviewed_masks WHERE reviewed_mask_id = '{version['reviewed_mask_id']}'",
        "INSERT OR REPLACE INTO reviewed_mask_slices SELECT * FROM reviewed_mask_slices LIMIT 1",
        "INSERT OR REPLACE INTO review_history SELECT * FROM review_history LIMIT 1",
    ):
        with pytest.raises(sqlite3.IntegrityError, match="IMMUTABLE_ARTIFACT"):
            storage.raw_execute(sql)
    assert storage.reviewed_masks(rid)[0]["checksum"] == version["checksum"]

    # #68 QA R-1: refused on ANY connection - this one never set PRAGMA recursive_triggers.
    other = sqlite3.connect(str(storage.path), isolation_level=None)
    try:
        assert other.execute("PRAGMA recursive_triggers").fetchone()[0] == 0
        columns = ("review_id, version, parent_reviewed_mask_id, case_id, run_id, source_mask_id, source_mask_kind,"
                   " prediction_variant, source_checksum, 'sha256:forged', review_revision, shape, created_at, reviewer_id")
        for sql in (
            f"REPLACE INTO reviewed_masks SELECT * FROM reviewed_masks WHERE reviewed_mask_id = '{version['reviewed_mask_id']}'",
            f"INSERT OR REPLACE INTO reviewed_masks SELECT 'RM_FORGED', {columns} FROM reviewed_masks LIMIT 1",
            "INSERT OR REPLACE INTO reviewed_mask_slices SELECT * FROM reviewed_mask_slices LIMIT 1",
            "INSERT OR REPLACE INTO review_history SELECT * FROM review_history LIMIT 1",
        ):
            with pytest.raises(sqlite3.IntegrityError, match="IMMUTABLE_ARTIFACT"):
                other.execute(sql)
    finally:
        other.close()
    assert [row["checksum"] for row in storage.reviewed_masks(rid)] == [version["checksum"]]


def _log_lines(api):
    return [json.loads(line) for line in api.app.state.backend.settings.request_log.read_text(encoding="utf-8").splitlines()]


def _summarizer():
    import importlib.util

    from conftest import REPO_ROOT

    spec = importlib.util.spec_from_file_location(
        "summarize_request_log", REPO_ROOT / "backend" / "scripts" / "summarize_request_log.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_request_log_records_route_case_slice_and_bytes_without_the_client(api):
    """L4 (NFR-PERF-001 limb 2): one JSON line per request, artifact fetches attributed to their slice."""
    meta = api.call("GET", f"{B}/cases/CASE_9001/slices/3/mri", "mri_slice_get", 200).json()
    png = api.client.get(meta["content_url"])
    lines = _log_lines(api)
    slice_line, artifact_line = lines[-2], lines[-1]
    assert slice_line["route"] == "/api/v1/cases/{case_id}/slices/{slice_index}/mri"
    assert (slice_line["case_id"], slice_line["slice_index"], slice_line["status"]) == ("CASE_9001", 3, 200)
    assert slice_line["view"] == "mri" and slice_line["digest"] == meta["checksum"].split(":", 1)[1]
    assert artifact_line["route"] == "/api/v1/artifacts/{name}" and artifact_line["bytes"] == len(png.content)
    assert artifact_line["digest"] == slice_line["digest"] and "shared" not in artifact_line
    assert (artifact_line["kind"], artifact_line["case_id"], artifact_line["slice_index"]) == ("mri", "CASE_9001", 3)
    for line in lines:
        assert not {"client", "ip", "host", "headers", "user_agent"} & set(line)


def test_request_log_switches_survive_shared_digests(api):
    """#68 QA X3: an empty mask slice has the same bytes in every case; switches start at slice views,
    artifact fetches join the switch that announced their digest, run / reviewed-mask ids resolve to the case."""
    sizes = []

    def get(url, endpoint_id=None):
        response = api.call("GET", url, endpoint_id, 200) if endpoint_id else api.client.get(url)
        assert response.status_code == 200, url
        sizes.append(len(response.content))
        return response

    first = [get(f"{B}/cases/CASE_9001/slices/0/mri", "mri_slice_get").json(),
             get(f"{B}/cases/CASE_9001/slices/0/ground-truth", "ground_truth_slice_get").json(),
             get(f"{B}/analysis-runs/RUN_9001/slices/0/prediction?variant=RAW", "prediction_slice_get").json()]
    for meta in first:
        get(meta["content_url"])
    second = get(f"{B}/cases/CASE_9003/slices/0/ground-truth", "ground_truth_slice_get").json()
    assert second["checksum"] == first[1]["checksum"]  # the empty slice 0 of two cases: one digest
    get(second["content_url"])
    switch_bytes = [sum(sizes[:6]), sum(sizes[6:8])]

    rid = _new_review(api).json()["review_id"]
    api.call("PUT", f"{B}/reviews/{rid}/working-mask/slices/1", "working_mask_put", 200,
             json_body=_working_body("ART_RUN_9001_RAW", 1, 1, np.zeros((synthetic.NY, synthetic.NX), np.uint8)))
    mask_id = api.call("POST", f"{B}/reviews/{rid}/commit", "review_commit", 201,
                       json_body={"expected_revision": 2}).json()["reviewed_mask_id"]
    del sizes[:]
    reviewed = get(f"{B}/reviewed-masks/{mask_id}/slices/0", "reviewed_mask_slice_get").json()
    get(reviewed["content_url"])
    switch_bytes.append(sum(sizes))

    lines = _log_lines(api)
    routes = [line["route"] or "" for line in lines]
    empty = first[1]["checksum"].split(":", 1)[1]
    fetches = [line for line, route in zip(lines, routes) if route.endswith("/artifacts/{name}") and line["digest"] == empty]
    assert len(fetches) >= 2
    for line in fetches:  # owned by several slices of several cases: never attributed to one of them
        assert line["shared"] is True and line["owners"] >= 4 and "case_id" not in line and "slice_index" not in line
    prediction_line = next(line for line, route in zip(lines, routes) if route.endswith("/prediction"))
    assert (prediction_line["case_id"], prediction_line["slice_index"], prediction_line["view"]) == ("CASE_9001", 0, "prediction")
    assert prediction_line["query"] == {"variant": "RAW"}
    reviewed_line = next(line for line, route in zip(lines, routes)
                         if route.endswith("/reviewed-masks/{reviewed_mask_id}/slices/{slice_index}"))
    assert (reviewed_line["case_id"], reviewed_line["slice_index"], reviewed_line["view"]) == ("CASE_9001", 0, "reviewed")
    assert reviewed_line["digest"] == reviewed["checksum"].split(":", 1)[1]

    switches, stats = _summarizer().summarize(lines)
    assert [switch.key for switch in switches] == [("CASE_9001", 0), ("CASE_9003", 0), ("CASE_9001", 0)]
    assert [switch.requests for switch in switches] == [6, 2, 2]
    assert [switch.bytes for switch in switches] == switch_bytes  # the counted response bytes, exactly
    assert stats["artifacts_by_digest"] == 5 and stats["artifacts_by_sequence"] == 0
    assert stats["other_requests"] == 3  # review create, working slice of another slice, commit


def test_request_log_keeps_only_allowlisted_query_keys(api):
    """#68 QA R-3: the free-text case search `q` and unknown keys are never written to the log."""
    api.call("GET", f"{B}/studies/{STUDY}/cases?q=private%20words&mode=EVALUATION&limit=5&token=abc", "case_list", 200)
    api.call("GET", f"{B}/analysis-runs/RUN_9001/slices/1/prediction?variant=RAW%20OR%201", "prediction_slice_get", 404)
    lines = _log_lines(api)
    assert lines[-2]["query"] == {"mode": "EVALUATION", "limit": "5"}
    assert lines[-1]["query"] == {"variant": "<not logged>"}
    text = api.app.state.backend.settings.request_log.read_text(encoding="utf-8")
    assert "private" not in text and "token" not in text and "OR 1" not in text


def test_transport_hygiene(api):
    """#68 QA N-3/N-4/N-5: no CORS by default, 1 MiB body cap, envelopes for 405, docs off."""
    response = api.client.get(f"{B}/cases/CASE_9001", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in {key.lower() for key in response.headers}
    big = api.client.post(f"{B}/findings", content=b"{" + b" " * (1024 * 1024 + 10) + b"}",
                          headers={"Content-Type": "application/json"})
    assert big.status_code == 413 and big.json()["error"]["code"] == "VALIDATION_ERROR"
    wrong_method = api.client.delete(f"{B}/cases/CASE_9001")
    assert wrong_method.status_code == 405 and wrong_method.json()["error"]["code"] == "VALIDATION_ERROR"
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert api.client.get(path).status_code == 404
    newline = api.client.get(f"{B}/cases/CASE_9001/slices/3%0A/mri")
    assert newline.status_code == 422 and newline.json()["error"]["code"] == "SLICE_OUT_OF_RANGE"


def test_derived_data_never_lives_inside_a_git_work_tree(environment, monkeypatch):
    from backend.app.config import REPO_ROOT, Settings

    inside = REPO_ROOT / "backend" / "never_created"
    with pytest.raises(ingest.IngestError) as raised:
        ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"], inside,
                          expected_split_sha256=environment["split_sha256"])
    assert raised.value.code == "OUTPUT_INSIDE_GIT_WORKTREE" and not inside.exists()
    paths = {"data_cache": environment["cache"], "experiments_root": environment["experiments"],
             "db_path": environment["root"] / "db.sqlite3", "render_cache": environment["root"] / "render_cache",
             "request_log": environment["root"] / "logs" / "requests.jsonl"}
    for name in paths:
        with pytest.raises(RuntimeError, match="inside a git work tree"):
            Settings.from_env(dict(paths, **{name: inside / name}))
    for variable in ("CARDIAC_BACKEND_DATA", "CARDIAC_DATA_CACHE", "CARDIAC_DB", "CARDIAC_EXPERIMENTS_ROOT",
                     "CARDIAC_RENDER_CACHE", "CARDIAC_REQUEST_LOG"):
        monkeypatch.delenv(variable, raising=False)
    with pytest.raises(RuntimeError, match="CARDIAC_BACKEND_DATA"):
        Settings.from_env()  # no in-repository default exists
    assert ingest.main(["--package-root", str(environment["package"])]) == 2
