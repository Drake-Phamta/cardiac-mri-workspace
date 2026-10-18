"""GATE-IMG-01 post-processing (ml/postprocess.py): hand-built volumes with exactly known outputs, the
candidate table against the Day 39 override record, the frozen config, and the derivation of the
EXP-D-PP run (derive_run) on synthetic run directories, evaluated and exported end to end.

Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pytest

from ml import data as D
from ml import evaluate as E
from ml import export_contract2 as X
from ml import holdout as H
from ml import manifests as MF
from ml import postprocess as PP
from ml.tests import runfixture, synth

CODE = "git:" + "c" * 40


def vol(shape=(9, 11, 13), dtype=np.uint8):
    return np.zeros(shape, dtype=dtype)


def box(a, z, y, x):
    a[z[0]:z[1], y[0]:y[1], x[0]:x[1]] = 1
    return a


# --- the candidate table = the override record -------------------------------------------------

# management/day39/RECOVERY_OVERRIDE_DAY39.md section 4, candidate set (closed)
RECORD = {"PP-0": [], "PP-1": ["largest_component_3d"],
          "PP-2": ["fill_holes_2d_per_slice", "largest_component_3d"],
          "PP-3": ["closing_3d", "largest_component_3d"],
          "PP-4": ["opening_3d", "largest_component_3d"],
          "PP-5": ["closing_3d", "fill_holes_2d_per_slice", "largest_component_3d"]}


def test_candidate_table_matches_the_override_record():
    assert list(PP.CONFIGS) == list(RECORD)
    for cid, names in RECORD.items():
        assert [o["op"] for o in PP.CONFIGS[cid]["operations"]] == names
    assert [c for c, v in PP.CONFIGS.items() if not v["eligible"]] == ["PP-0"]
    assert PP.ELIGIBLE_IDS == ("PP-1", "PP-2", "PP-3", "PP-4", "PP-5")
    assert PP.OP_LARGEST["connectivity"] == 26 and "(3, 3)" in PP.OP_LARGEST["structuring_element"]
    for op in (PP.OP_CLOSE, PP.OP_OPEN):
        assert op["structuring_element"] == "cube" and op["size"] == 3 and op["iterations"] == 1
        assert op["border_value"] == 0
    assert PP.OP_FILL["slice_axis"] == 0 and PP.OP_FILL["background_connectivity"] == 4
    assert PP.SOURCE_RULE == "management/day39/RECOVERY_OVERRIDE_DAY39.md §4"


def test_the_operation_table_is_closed():
    """A kernel size, iteration count or connectivity other than the declared one is refused."""
    a = box(vol(), (2, 5), (2, 5), (2, 5))
    for bad in ({**PP.OP_CLOSE, "size": 5}, {**PP.OP_OPEN, "iterations": 2},
                {**PP.OP_LARGEST, "connectivity": 6}, {"op": "dilate"}):
        with pytest.raises(PP.PostprocessError):
            PP.apply_operations([bad], a)
    with pytest.raises(PP.PostprocessError, match="unknown"):
        PP.apply("PP-9", a)


# --- the operations on hand-built volumes -------------------------------------------------------

def test_largest_component_keeps_the_bigger_blob():
    a = vol()
    box(a, (1, 4), (1, 4), (1, 4))                  # 27 voxels
    box(a, (6, 8), (6, 8), (8, 10))                 # 8 voxels
    expected = box(vol(), (1, 4), (1, 4), (1, 4))
    out = PP.apply("PP-1", a)
    assert np.array_equal(out, expected) and out.dtype == np.uint8


def test_largest_component_uses_26_connectivity():
    a = vol()
    box(a, (1, 4), (1, 4), (1, 4))                  # 27 voxels
    a[4, 4, 4] = 1                                  # touches the cube's corner voxel (3,3,3) diagonally only
    out = PP.apply("PP-1", a)
    assert np.array_equal(out, a)                   # 26-connected: one component, nothing removed
    a[4, 4, 4] = 0
    a[5, 5, 5] = 1                                  # two voxels apart: a separate component
    assert int(PP.apply("PP-1", a).sum()) == 27


def test_largest_component_tie_goes_to_the_first_in_c_order():
    a = vol()
    a[1:3, 1:3, 1:3] = 1                            # 8 voxels, first voxel (1,1,1)
    a[5:7, 6:8, 8:10] = 1                           # 8 voxels, later in C order
    out = PP.apply("PP-1", a)
    assert int(out.sum()) == 8 and out[1, 1, 1] == 1 and out[5, 6, 8] == 0


def test_hole_filling_is_per_slice():
    a = box(vol(), (3, 4), (2, 7), (2, 7))          # slice 3: a 5x5 square ...
    a[3, 3:6, 3:6] = 0                              # ... with a 3x3 hole
    expected = box(vol(), (3, 4), (2, 7), (2, 7))
    assert np.array_equal(PP.apply("PP-2", a), expected)
    # a cavity that only exists in 3D (a hollow box) is filled slice by slice: the end faces are full,
    # every middle slice is a ring whose hole is enclosed, so the whole box is filled
    shell = box(vol(), (2, 7), (2, 7), (2, 7))
    shell[3:6, 3:6, 3:6] = 0
    assert np.array_equal(PP.apply("PP-2", shell), box(vol(), (2, 7), (2, 7), (2, 7)))
    # a gap in the ring lets the background in: nothing to fill
    ring = box(vol(), (3, 4), (2, 7), (2, 7))
    ring[3, 3:6, 3:6] = 0
    ring[3, 2, 4] = 0                               # opens the ring to the outside
    assert np.array_equal(PP.apply("PP-2", ring), ring)


def test_hole_filling_ignores_background_touching_the_slice_border():
    a = vol()
    a[3, 0:5, 0:5] = 1
    a[3, 0:3, 0:3] = 0                              # background region on the slice border: not a hole
    assert np.array_equal(PP.apply("PP-2", a), a)


def test_opening_removes_a_one_voxel_spur_and_keeps_the_body():
    body = box(vol((12, 12, 12)), (3, 8), (3, 8), (3, 8))
    a = body.copy()
    a[5, 5, 8] = 1                                  # 1-voxel spur on the +x face
    a[5, 5, 9] = 1                                  # ... and a second voxel: a 2-voxel needle
    assert np.array_equal(PP.apply("PP-4", a), body)


def test_closing_closes_a_one_voxel_gap():
    a = box(vol((12, 12, 12)), (3, 9), (3, 9), (3, 9))
    a[3:9, 3:9, 6] = 0                              # a 1-voxel-wide slit through the block
    expected = box(vol((12, 12, 12)), (3, 9), (3, 9), (3, 9))
    out = PP.apply("PP-3", a)
    assert np.array_equal(out, expected)


def test_closing_does_not_erode_a_mask_that_touches_the_volume_border():
    """scipy's closing erodes foreground at the volume edge (border_value=0); the 1-voxel padding avoids it."""
    a = box(vol((8, 8, 8)), (0, 8), (0, 4), (0, 8))     # touches five of the six faces
    assert np.array_equal(PP.closing_3d(a.astype(bool)), a.astype(bool))
    assert np.array_equal(PP.apply("PP-3", a), a)
    bare = PP.ndimage.binary_closing(a.astype(bool), structure=np.ones((3, 3, 3), bool), border_value=0)
    assert int(bare.sum()) < int(a.sum())               # the unpadded call really would shrink it
    # extensive: the closing never removes a voxel
    rng = np.random.default_rng(7)
    noise = (rng.random((10, 10, 10)) < 0.5)
    assert not (noise & ~PP.closing_3d(noise)).any()


def test_opening_treats_the_outside_as_background():
    a = box(vol((8, 8, 8)), (0, 5), (2, 6), (2, 6))     # 5 thick, touching the z=0 face: kept entirely
    assert np.array_equal(PP.apply("PP-4", a), a)
    thin = box(vol((8, 8, 8)), (0, 2), (2, 6), (2, 6))  # 2 thick: no 3x3x3 cube fits, removed
    assert not PP.apply("PP-4", thin).any() and PP.opening_3d(thin.astype(bool)).sum() == 0


def test_pp5_closes_the_ring_then_fills_then_keeps_the_largest():
    a = vol((6, 14, 14))
    ring = np.zeros((14, 14), np.uint8)
    ring[3:10, 3:10] = 1
    ring[4:9, 4:9] = 0                                  # 7x7 ring, 5x5 interior
    ring[3, 6] = 0                                      # a 1-voxel gap in the top edge
    a[2] = ring
    a[0, 12, 12] = 1                                    # a separate speck
    pp2 = PP.apply("PP-2", a)
    assert int(pp2[2].sum()) == int(ring.sum()) and not pp2[2, 6, 6]    # the gap keeps the hole open
    pp5 = PP.apply("PP-5", a)
    filled = np.zeros((14, 14), np.uint8)
    filled[3:10, 3:10] = 1
    assert np.array_equal(pp5[2], filled) and int(pp5.sum()) == int(filled.sum())   # speck removed too


def test_empty_stays_empty_under_every_candidate():
    for cid in PP.CONFIGS:
        out = PP.apply(cid, vol())
        assert out.shape == (9, 11, 13) and out.dtype == np.uint8 and not out.any()


def test_pp0_is_the_identity_copy():
    a = box(vol(), (2, 5), (2, 5), (2, 5))
    a[7, 8, 9] = 1
    out = PP.apply("PP-0", a)
    assert np.array_equal(out, a) and out is not a


@pytest.mark.parametrize("dtype", [np.uint8, np.bool_, np.int32])
def test_dtype_is_preserved_and_the_input_is_untouched(dtype):
    a = box(vol(dtype=dtype), (2, 6), (2, 7), (2, 7))
    a[0, 0, 0] = 1
    before = a.copy()
    for cid in PP.CONFIGS:
        out = PP.apply(cid, a)
        assert out.dtype == dtype and out.shape == a.shape
        assert set(np.unique(out)) <= {0, 1}
    assert np.array_equal(a, before)


def test_deterministic():
    rng = np.random.default_rng(2024)
    a = (rng.random((10, 12, 14)) < 0.55).astype(np.uint8)
    for cid in PP.CONFIGS:
        first, second = PP.apply(cid, a), PP.apply(cid, a.copy())
        assert hashlib.sha256(first.tobytes()).digest() == hashlib.sha256(second.tobytes()).digest()


def test_every_candidate_ends_with_a_single_component():
    rng = np.random.default_rng(11)
    a = (rng.random((10, 12, 14)) < 0.6).astype(np.uint8)
    pp1, pp2, pp3 = PP.apply("PP-1", a), PP.apply("PP-2", a), PP.apply("PP-3", a)
    assert not (pp1.astype(bool) & ~a.astype(bool)).any()                       # PP-1 only removes voxels
    assert PP.largest_component_3d(pp1.astype(bool)).sum() == int(pp1.sum())     # and leaves one component
    for out in (pp2, pp3):                                                       # every candidate ends with PP-1
        assert PP.largest_component_3d(out.astype(bool)).sum() == int(out.sum())


@pytest.mark.parametrize("bad", [np.zeros((4, 4)), np.full((3, 3, 3), 2, np.uint8), np.zeros((3, 3, 3), float)])
def test_non_binary_or_wrong_rank_input_is_refused(bad):
    with pytest.raises(PP.PostprocessError):
        PP.apply("PP-1", bad)


# --- the frozen config ------------------------------------------------------------------------

def test_frozen_config_roundtrip_and_sha(tmp_path):
    path = tmp_path / "frozen.json"
    sha = PP.write_frozen_config(path, "PP-3", CODE)
    assert sha == hashlib.sha256(path.read_bytes()).hexdigest() == PP.config_sha256(path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert set(doc) == {"format", "config_id", "operations", "code_version", "source_rule"}
    assert doc["format"] == "ml-postprocess-config/1" and doc["config_id"] == "PP-3"
    assert [o["op"] for o in doc["operations"]] == ["closing_3d", "largest_component_3d"]
    assert doc["code_version"] == CODE and doc["source_rule"] == PP.SOURCE_RULE
    config, loaded_sha = PP.load_frozen_config(path)
    assert loaded_sha == sha and config == doc
    a = box(vol((12, 12, 12)), (3, 9), (3, 9), (3, 9))
    a[3:9, 3:9, 6] = 0
    assert np.array_equal(PP.apply(config, a), PP.apply("PP-3", a))        # a frozen config is applied as is
    other = PP.write_frozen_config(tmp_path / "again.json", "PP-3", CODE)
    assert other == sha                                                     # same input -> same bytes
    with pytest.raises(FileExistsError):
        PP.write_frozen_config(path, "PP-3", CODE)


def test_frozen_config_refuses_what_is_not_the_declared_candidate(tmp_path):
    with pytest.raises(PP.PostprocessError):
        PP.write_frozen_config(tmp_path / "a.json", "PP-0", CODE)           # the reference cannot win
    good = PP.frozen_config("PP-4", CODE)
    tampered = {**good, "operations": [{**PP.OP_OPEN, "size": 5}, PP.OP_LARGEST]}
    for n, doc in enumerate((tampered, {**good, "extra": 1}, {**good, "format": "x"}, {**good, "config_id": "PP-0"},
                             {**good, "source_rule": "somewhere else"}, {**good, "code_version": "abc"})):
        path = tmp_path / f"bad{n}.json"
        path.write_bytes(MF.json_bytes(doc))
        with pytest.raises(PP.PostprocessError):
            PP.load_frozen_config(path)


def test_module_code_version_names_a_commit_or_unknown():
    v = PP.module_code_version()
    assert v["version"] == "UNKNOWN" or v["version"].startswith("git:")


# --- EXP-D-PP: derive, evaluate, export -------------------------------------------------------

@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("ppkg"))


@pytest.fixture()
def pinned(cpkg, tmp_path, monkeypatch):
    return runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")


@pytest.fixture()
def clean_code(monkeypatch):
    clean = {"commit": "a" * 40, "dirty": False, "version": "git:" + "a" * 40}
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: dict(clean))
    monkeypatch.setattr(PP, "module_code_version", lambda *a, **k: dict(clean))


def predict_with_speck(ref: np.ndarray) -> np.ndarray:
    """The shifted reference plus an isolated voxel in the corner: PP-1 removes exactly that voxel."""
    pred = runfixture.predict_by_shift(ref).astype(np.uint8)
    pred[0, 0, 0] = 1
    return pred


@pytest.fixture()
def setup(cpkg, tmp_path, pinned, clean_code):
    """frozen PP-1 config, a record authorizing EXP-D-100 and EXP-D-PP (same best.pt) and that config,
    and the EXP-D-100 source run with RAW holdout predictions made under that record."""
    cfg = tmp_path / "frozen.json"
    sha = PP.write_frozen_config(cfg, "PP-1", CODE)
    record = runfixture.write_authorization(
        tmp_path / "record.json",
        runfixture.authorization_record(D.FROZEN_SPLIT_SHA256,
                                        [("EXP-D-100", runfixture.CHECKPOINT_SHA256),
                                         ("EXP-D-PP", runfixture.CHECKPOINT_SHA256)],
                                        postprocessing_config_sha256=sha))
    src = runfixture.make_run_dir(tmp_path / "EXP-D-100", cpkg, experiment_id="EXP-D-100", subset="100_percent",
                                  predictor=predict_with_speck, holdout_authorization=record)
    return {"cfg": cfg, "sha": sha, "record": record, "src": src, "out": tmp_path / "EXP-D-PP",
            "tmp": tmp_path}


def derive(setup, cpkg, **kw):
    kw.setdefault("holdout_authorization", setup["record"])
    return PP.derive_run(setup["src"], D.HOLDOUT_PARTITION, setup["cfg"], setup["out"],
                         split_manifest=cpkg["split_manifest_path"], log=None, **kw)


def evaluate_derived(setup, cpkg):
    return E.evaluate_run(setup["out"], D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                          package_root=cpkg["package_root"], allow_holdout=True,
                          holdout_authorization=setup["record"], split_manifest=cpkg["split_manifest_path"], log=None)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_derive_writes_a_processed_run_with_the_raw_geometry(setup, cpkg):
    pred_dir = derive(setup, cpkg)
    out = setup["out"]
    pm = MF.validate_predictions_manifest(load(pred_dir / "predictions_manifest.json"))
    assert pm["experiment_id"] == "EXP-D-PP" and pm["prediction_variant"] == "PROCESSED_PREDICTION"
    assert pm["postprocessing_version"] == "ml-postprocess-1.0.0:PP-1" and pm["postprocessing_version"] != "none"
    assert pm["postprocessing_config_sha256"] == setup["sha"] == D.sha256_file(out / "postprocessing" /
                                                                               "postprocess_config.frozen.json")
    src_pm_path = setup["src"] / "predictions" / "final_holdout" / "predictions_manifest.json"
    src_pm = load(src_pm_path)
    assert pm["derived_from"] == {"experiment_id": "EXP-D-100", "partition": "final_holdout",
                                  "predictions_manifest_sha256": D.sha256_file(src_pm_path),
                                  "checkpoint_sha256": runfixture.CHECKPOINT_SHA256,
                                  "checkpoint_id": src_pm["checkpoint"]["checkpoint_id"]}
    assert pm["holdout_authorization"]["record_sha256"] == D.sha256_file(setup["record"])
    assert pm["holdout_authorization"]["record"] == load(setup["record"])
    assert not (out / "checkpoints").exists()                    # no checkpoint file in a derived run
    assert pm["succeeded_n"] == 54 and pm["failed_n"] == 0
    for entry, src_entry in zip(pm["cases"], src_pm["cases"]):
        cid = entry["case_id"]
        raw, raw_header, raw_sha = D.read_nrrd_zyx(setup["src"] / "predictions" / "final_holdout" / src_entry["file"])
        proc, proc_header, proc_sha = D.read_nrrd_zyx(pred_dir / entry["file"])
        assert proc_sha == entry["sha256"] and proc.dtype == np.uint8 and set(np.unique(proc)) <= {0, 1}
        assert np.array_equal(proc, PP.apply("PP-1", raw))
        assert raw[0, 0, 0] == 1 and proc[0, 0, 0] == 0          # the speck, and only it, is gone
        assert int(raw.sum()) - int(proc.sum()) == 1
        for key in D.GEOMETRY_KEYS:                              # same header geometry as the raw mask
            if key in raw_header:
                assert np.array_equal(np.asarray(raw_header[key]), np.asarray(proc_header[key])), (cid, key)
        assert proc.shape == raw.shape
        copy_path = pred_dir / entry["raw_source_file"]          # the raw mask it derives from, byte for byte
        assert copy_path.read_bytes() == (setup["src"] / "predictions" / "final_holdout" / src_entry["file"]).read_bytes()
        assert entry["raw_source_sha256"] == raw_sha == src_entry["sha256"]
    rm = MF.validate_run_manifest(load(out / "run_manifest.json"))
    assert rm["experiment_id"] == "EXP-D-PP" and rm["prediction_variant"] == "PROCESSED_PREDICTION"
    assert rm["postprocessing_config_sha256"] == setup["sha"]
    assert (out / "manifests" / "split_manifest.json").read_bytes() == cpkg["split_manifest_path"].read_bytes()


def test_derived_run_is_evaluated_and_improves_on_the_raw_run(setup, cpkg):
    derive(setup, cpkg)
    evaluate_derived(setup, cpkg)
    em = load(setup["out"] / "evaluation" / "final_holdout" / "evaluation_manifest.json")
    assert em["prediction_variant"] == "PROCESSED_PREDICTION" and em["postprocessing_config_sha256"] == setup["sha"]
    assert em["holdout_authorization"]["record_sha256"] == D.sha256_file(setup["record"])
    assert em["successful_n"] == 54 and em["failed_n"] == 0
    # the raw run, evaluated the same way
    E.evaluate_run(setup["src"], D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], allow_holdout=True, holdout_authorization=setup["record"],
                   split_manifest=cpkg["split_manifest_path"], log=None)
    raw = load(setup["src"] / "evaluation" / "final_holdout" / "per_case_metrics.json")
    proc = load(setup["out"] / "evaluation" / "final_holdout" / "per_case_metrics.json")
    assert proc["prediction_variant"] == "PROCESSED_PREDICTION" and raw["prediction_variant"] == "RAW_PREDICTION"
    for r, p in zip(raw["cases"], proc["cases"]):
        assert p["case_id"] == r["case_id"] and p["dice_3d"] > r["dice_3d"]          # one false positive less
        assert p["pred_voxels"] == r["pred_voxels"] - 1 and p["fp_voxels"] == r["fp_voxels"] - 1


def test_validation_derivation_matches_scoring_the_candidate_in_memory(setup, cpkg, tmp_path):
    """The derive + evaluate route equals scoring the candidate in memory (what ml.gate_img_01 does)."""
    val_src = runfixture.make_run_dir(tmp_path / "val" / "EXP-D-100", cpkg, experiment_id="EXP-D-100",
                                      subset="100_percent", partition="validation", predictor=predict_with_speck)
    out = tmp_path / "val" / "EXP-D-PP"
    PP.derive_run(val_src, "validation", setup["cfg"], out, split_manifest=cpkg["split_manifest_path"], log=None)
    E.evaluate_run(out, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                   split_manifest=cpkg["split_manifest_path"], log=None)
    derived = load(out / "evaluation" / "validation" / "per_case_metrics.json")
    allow = D.CaseAllowlist.for_validation(D.load_split_manifest(cpkg["split_manifest_path"]))
    paths = D.case_paths(cpkg["dataset"], cpkg["package_root"], allowlist=allow)
    pm = load(val_src / "predictions" / "validation" / "predictions_manifest.json")
    loader = E.make_pair_loader(val_src, val_src / "predictions" / "validation", {c["case_id"]: c for c in pm["cases"]},
                                paths, transform=lambda m: PP.apply("PP-1", m))
    in_memory = E.evaluate_population(list(allow), loader, population={"role": "VALIDATION", "case_ids": list(allow)},
                                      prediction_variant="PROCESSED_PREDICTION")
    assert [c["dice_3d"] for c in derived["cases"]] == [c["dice_3d"] for c in in_memory["cases"]]
    assert len(derived["cases"]) == 2


def test_derived_run_exports_as_processed_and_passes_the_validator(setup, cpkg):
    derive(setup, cpkg)
    evaluate_derived(setup, cpkg)
    out = setup["out"]
    with pytest.raises(X.ExportError, match="source run"):
        X.build_manifest(out, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED", split_manifest=cpkg["split_manifest_path"])
    path = X.export(out, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED", split_manifest=cpkg["split_manifest_path"],
                    source_run=setup["src"])
    manifest = load(path)
    result = X.validate(manifest, out)
    assert result["status"] == "PASS", result
    assert result["analysis_runs"] == 54
    assert manifest["manifest_id"] == "exp-d-pp-processed-holdout"
    exp = manifest["experiment"]
    assert exp["prediction_variant"] == "PROCESSED_PREDICTION" and exp["postprocessing_version"] != "none"
    assert exp["checkpoint"]["checksum"]["value"] == runfixture.CHECKPOINT_SHA256
    kinds = [a["kind"] for a in manifest["artifacts"]]
    assert kinds.count("PROCESSED_PREDICTION_MASK") == kinds.count("RAW_PREDICTION_MASK") == 54
    assert kinds.count("METRIC_SET") == 54
    by_id = {a["artifact_id"]: a for a in manifest["artifacts"]}
    for run in manifest["analysis_runs"]:
        processed = by_id[run["processed_prediction_mask_id"]]
        assert processed["kind"] == "PROCESSED_PREDICTION_MASK" and processed["source_artifact_id"] == run["raw_prediction_mask_id"]
        metric = by_id[run["metric_set_ids"][0]]
        assert metric["prediction_mask_id"] == processed["artifact_id"] and metric["prediction_mask_kind"] == "PROCESSED_PREDICTION"
    record = load(path.with_name(path.stem + ".export.json"))
    assert record["postprocessing_config_sha256"] == setup["sha"]
    assert record["derived_from"]["experiment_id"] == "EXP-D-100" and record["failed_case_ids"] == []
    assert record["code_versions"]["postprocessing_code_version"].startswith("git:")


def test_a_processed_run_without_derived_from_is_not_exported(setup, cpkg):
    derive(setup, cpkg)
    evaluate_derived(setup, cpkg)
    pm_path = setup["out"] / "predictions" / "final_holdout" / "predictions_manifest.json"
    pm = load(pm_path)
    del pm["derived_from"]
    pm_path.write_bytes(MF.json_bytes(pm))
    em_path = setup["out"] / "evaluation" / "final_holdout" / "evaluation_manifest.json"
    em = load(em_path)
    em["predictions_manifest"]["sha256"] = D.sha256_file(pm_path)
    em_path.write_bytes(MF.json_bytes(em))
    with pytest.raises(X.ExportError, match="derived"):
        X.build_manifest(setup["out"], gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                         split_manifest=cpkg["split_manifest_path"], source_run=setup["src"])


def test_a_raw_checkpoint_other_than_the_one_named_is_refused_at_export(setup, cpkg):
    derive(setup, cpkg)
    evaluate_derived(setup, cpkg)
    best = setup["src"] / "checkpoints" / "best.pt"
    original = best.read_bytes()
    best.write_bytes(original + b"x")
    try:
        with pytest.raises(X.ExportError, match="sha256"):
            X.build_manifest(setup["out"], gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                             split_manifest=cpkg["split_manifest_path"], source_run=setup["src"])
    finally:
        best.write_bytes(original)


# --- the holdout lock on the derivation --------------------------------------------------------

def test_holdout_derivation_needs_a_record_that_freezes_this_config(setup, cpkg, tmp_path):
    with pytest.raises(H.HoldoutAuthorizationError, match="authorization"):
        PP.derive_run(setup["src"], D.HOLDOUT_PARTITION, setup["cfg"], setup["out"],
                      split_manifest=cpkg["split_manifest_path"], log=None)
    other_cfg = tmp_path / "other.json"
    PP.write_frozen_config(other_cfg, "PP-2", CODE)
    with pytest.raises(H.HoldoutAuthorizationError, match="freezes"):
        PP.derive_run(setup["src"], D.HOLDOUT_PARTITION, other_cfg, setup["out"], holdout_authorization=setup["record"],
                      split_manifest=cpkg["split_manifest_path"], log=None)
    null_cfg = runfixture.write_authorization(
        tmp_path / "null.json", runfixture.authorization_record(
            D.FROZEN_SPLIT_SHA256, [("EXP-D-100", runfixture.CHECKPOINT_SHA256), ("EXP-D-PP", runfixture.CHECKPOINT_SHA256)]))
    with pytest.raises(H.HoldoutAuthorizationError, match="freezes"):
        derive(setup, cpkg, holdout_authorization=null_cfg)
    assert not setup["out"].exists()                       # nothing was written by any refusal


def test_holdout_derivation_needs_exp_d_pp_in_authorized_runs(setup, cpkg, tmp_path):
    only_raw = runfixture.write_authorization(
        tmp_path / "only_raw.json", runfixture.authorization_record(
            D.FROZEN_SPLIT_SHA256, [("EXP-D-100", runfixture.CHECKPOINT_SHA256)], postprocessing_config_sha256=setup["sha"]))
    with pytest.raises(H.HoldoutAuthorizationError, match="authorized_runs"):
        derive(setup, cpkg, holdout_authorization=only_raw)
    wrong_ckpt = runfixture.write_authorization(
        tmp_path / "wrong.json", runfixture.authorization_record(
            D.FROZEN_SPLIT_SHA256, [("EXP-D-100", runfixture.CHECKPOINT_SHA256), ("EXP-D-PP", "0" * 64)],
            postprocessing_config_sha256=setup["sha"]))
    with pytest.raises(H.HoldoutAuthorizationError, match="authorized_runs"):
        derive(setup, cpkg, holdout_authorization=wrong_ckpt)
    assert not setup["out"].exists()


def test_holdout_derivation_needs_the_record_the_raw_predictions_were_made_under(setup, cpkg, tmp_path):
    another = runfixture.write_authorization(
        tmp_path / "another.json", runfixture.authorization_record(
            D.FROZEN_SPLIT_SHA256, [("EXP-D-100", runfixture.CHECKPOINT_SHA256), ("EXP-D-PP", runfixture.CHECKPOINT_SHA256)],
            postprocessing_config_sha256=setup["sha"], authorized_by="Someone Else"))
    with pytest.raises(H.HoldoutAuthorizationError, match="not made under"):
        derive(setup, cpkg, holdout_authorization=another)


def test_holdout_derivation_refuses_the_unfrozen_split_switch_and_a_validation_record(setup, cpkg):
    with pytest.raises(H.HoldoutSplitError):
        derive(setup, cpkg, allow_unfrozen_split=True)
    with pytest.raises(ValueError, match="non-holdout"):
        PP.derive_run(setup["src"], "validation", setup["cfg"], setup["out"], holdout_authorization=setup["record"],
                      split_manifest=cpkg["split_manifest_path"], log=None)


def test_derivation_refuses_to_overwrite_and_only_derives_from_raw_exp_d_100(setup, cpkg, tmp_path):
    derive(setup, cpkg)
    with pytest.raises(FileExistsError):
        derive(setup, cpkg)
    with pytest.raises(ValueError, match="EXP-D-100"):
        PP.derive_run(setup["out"], D.HOLDOUT_PARTITION, setup["cfg"], tmp_path / "again",
                      holdout_authorization=setup["record"], split_manifest=cpkg["split_manifest_path"], log=None)
    with pytest.raises(ValueError, match="separate"):
        PP.derive_run(setup["src"], D.HOLDOUT_PARTITION, setup["cfg"], setup["src"] / "inside",
                      holdout_authorization=setup["record"], split_manifest=cpkg["split_manifest_path"], log=None)


def test_a_failed_raw_case_stays_failed_in_the_derived_run(cpkg, tmp_path, pinned, clean_code):
    cfg = tmp_path / "frozen.json"
    sha = PP.write_frozen_config(cfg, "PP-1", CODE)
    record = runfixture.write_authorization(
        tmp_path / "record.json", runfixture.authorization_record(
            D.FROZEN_SPLIT_SHA256, [("EXP-D-100", runfixture.CHECKPOINT_SHA256), ("EXP-D-PP", runfixture.CHECKPOINT_SHA256)],
            postprocessing_config_sha256=sha))
    failing = synth.C_HOLDOUT[5]
    src = runfixture.make_run_dir(tmp_path / "EXP-D-100", cpkg, experiment_id="EXP-D-100", subset="100_percent",
                                  fail_cases=(failing,), holdout_authorization=record)
    out = tmp_path / "EXP-D-PP"
    PP.derive_run(src, D.HOLDOUT_PARTITION, cfg, out, holdout_authorization=record,
                  split_manifest=cpkg["split_manifest_path"], log=None)
    pm = load(out / "predictions" / "final_holdout" / "predictions_manifest.json")
    bad = [c for c in pm["cases"] if c["status"] != "SUCCEEDED"]
    assert [c["case_id"] for c in bad] == [failing] and bad[0]["failure_reason"].startswith("RAW_PREDICTION_FAILED")
    assert pm["succeeded_n"] == 53 and pm["failed_n"] == 1
    assert not (out / "predictions" / "final_holdout" / f"{failing}.nrrd").exists()


def test_derive_cli(setup, cpkg, capsys, monkeypatch):
    base = ["derive", "--source-run", str(setup["src"]), "--config", str(setup["cfg"]), "--out-run", str(setup["out"]),
            "--split-manifest", str(cpkg["split_manifest_path"])]
    assert PP.main(base + ["--population", "holdout"]) == 2
    assert "needs --holdout-authorization" in capsys.readouterr().out
    assert PP.main(base + ["--population", "validation", "--holdout-authorization", str(setup["record"])]) == 2
    assert "only applies to --population holdout" in capsys.readouterr().out
    assert PP.main(base + ["--population", "holdout", "--holdout-authorization", str(setup["record"])]) == 0
    assert "wrote" in capsys.readouterr().out
    assert PP.main(base + ["--population", "holdout", "--holdout-authorization", str(setup["record"])]) == 2
    assert "REFUSED" in capsys.readouterr().out
