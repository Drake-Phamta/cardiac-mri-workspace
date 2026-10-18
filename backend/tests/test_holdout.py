"""DR-022: holdout cases in the backend after GATE-IMG-01, and the DR-018 loader rules.

Synthetic package only (``synthetic.py``). The authorization records written here are
test fixtures in a temporary directory: they authorize nothing.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import ingest
from backend.app.cases import CaseStore
from backend.app.config import Settings
from backend.app.experiments import ExperimentStore
from backend.app.main import create_app
from conftest import Api
import synthetic

B = "/api/v1"
INT12 = synthetic.INT12
HOLDOUT_EVALUATED = ["CASE_0027", "CASE_9101"] + synthetic.FILLERS  # every holdout case but INT-12
GATE = {"format": "ml-holdout-authorization/1", "gate": "GATE-IMG-01", "gate_status": "CLOSED"}


def write_record(path: Path, split: str, **overrides) -> Path:
    record = dict(GATE, split_sha256=split,
                  closed_at="2026-10-18T03:00:00+00:00", authorized_by="synthetic test",
                  authorized_at="2026-10-18T03:05:00+00:00", decision_ref="management/synthetic.md",
                  postprocessing_config_sha256=None,
                  authorized_runs=[{"experiment_id": "EXP-U-025", "checkpoint_sha256": "a" * 64}])
    record.update(overrides)
    path.write_text(json.dumps(record), encoding="utf-8")
    return path


def ingest_holdout(environment, out: Path, authorization, **kwargs) -> dict:
    return ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"], out,
                             expected_split_sha256=environment["split_sha256"], include_holdout=True,
                             holdout_authorization=authorization, **kwargs)


@pytest.fixture(scope="session")
def holdout_environment(environment, tmp_path_factory):
    root = tmp_path_factory.mktemp("holdout-env")
    record = write_record(root / "authorization.json", environment["split_sha256"])
    cache = root / "data_cache"
    index = ingest_holdout(environment, cache, record)
    return {"cache": cache, "record": record, "index": index}


@pytest.fixture()
def holdout_api(environment, holdout_environment, tmp_path):
    settings = Settings.from_env({
        "data_cache": holdout_environment["cache"],
        "experiments_root": environment["experiments"],
        "db_path": tmp_path / "backend.sqlite3",
        "render_cache": tmp_path / "render_cache",
        "request_log": tmp_path / "logs" / "requests.jsonl",
    })
    app = create_app(settings)
    with TestClient(app) as client:
        handle = Api(client)
        handle.app = app
        yield handle
    app.state.backend.storage.close()


# -- the selection --------------------------------------------------------------------

def test_selection_adds_holdout_cases_only_when_asked(environment):
    split = json.loads(environment["split_manifest"].read_text(encoding="utf-8"))
    default = ingest.rule_based_selection(split)
    assert not [item for item in default if item["role"] == "FINAL_HOLDOUT"]
    selection = ingest.rule_based_selection(split, include_holdout=True)
    holdout = [item for item in selection if item["split_partition"] == "final_holdout"]
    assert [item["case_id"] for item in holdout if item["role"] == "FINAL_HOLDOUT"] == sorted(
        HOLDOUT_EVALUATED, key=lambda value: int(value.split("_")[1]))
    assert all(item["mode"] == "EVALUATION" for item in holdout if item["role"] == "FINAL_HOLDOUT")
    assert "CASE_0027" in HOLDOUT_EVALUATED  # the DR-002b suspected case is ingested like any other
    int12 = [item for item in selection if item["case_id"] == INT12]
    assert int12 == [{"case_id": INT12, "role": "INFERENCE_ONLY_INT12", "mode": "INFERENCE_REVIEW",
                      "split_partition": "final_holdout"}]  # one entry, never an EVALUATION one


def test_selection_on_the_real_split_with_holdout():
    path = ingest.DEFAULT_SPLIT_MANIFEST
    if not path.exists():
        pytest.skip("the real split manifest is not on this checkout")
    split = json.loads(path.read_text(encoding="utf-8"))
    selection = ingest.rule_based_selection(split, include_holdout=True)
    by_id = {item["case_id"]: item for item in selection}
    assert len(selection) == 20 + 1 + 53 and len(by_id) == len(selection)
    assert by_id["CASE_0001"]["mode"] == "INFERENCE_REVIEW" and by_id["CASE_0001"]["role"] == "INFERENCE_ONLY_INT12"
    assert by_id["CASE_0027"] == {"case_id": "CASE_0027", "role": "FINAL_HOLDOUT", "mode": "EVALUATION",
                                  "split_partition": "final_holdout"}
    holdout = set(split["partitions"]["final_holdout"]["case_ids"])
    assert {case_id for case_id, item in by_id.items() if item["split_partition"] == "final_holdout"} == holdout
    assert len(holdout) == 54


# -- the authorization record ---------------------------------------------------------

def test_holdout_is_refused_without_a_record(environment, tmp_path, capsys):
    out = tmp_path / "cache"
    with pytest.raises(ingest.IngestError) as raised:
        ingest_holdout(environment, out, None)
    assert raised.value.code == "HOLDOUT_AUTHORIZATION_REQUIRED"
    assert not out.exists()  # nothing was written, no holdout file was opened
    with pytest.raises(ingest.IngestError) as raised:  # a record without the flag is a mistake, not a default
        ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"], out,
                          expected_split_sha256=environment["split_sha256"],
                          holdout_authorization=tmp_path / "record.json")
    assert raised.value.code == "HOLDOUT_AUTHORIZATION_UNUSED"
    code = ingest.main(["--package-root", str(environment["package"]), "--dataset-manifest",
                        str(environment["dataset_manifest"]), "--split-manifest", str(environment["split_manifest"]),
                        "--split-sha256", environment["split_sha256"], "--out", str(out), "--include-holdout"])
    assert code == 2 and "HOLDOUT_AUTHORIZATION_REQUIRED" in capsys.readouterr().err
    assert not out.exists()
    with pytest.raises(ingest.IngestError) as raised:  # a record that is not there
        ingest_holdout(environment, out, tmp_path / "absent.json")
    assert raised.value.code == "HOLDOUT_AUTHORIZATION_INVALID"


@pytest.mark.parametrize("override, fragment", [
    ({"gate_status": "OPEN"}, "gate_status"),
    ({"gate_status": None}, "gate_status"),
    ({"split_sha256": "0" * 64}, "split_sha256"),
    ({"format": "ml-holdout-authorization/2"}, "format"),
    ({"gate": "GATE-ML-01"}, "gate"),
])
def test_holdout_is_refused_for_a_record_that_does_not_authorize(environment, tmp_path, override, fragment):
    record = write_record(tmp_path / "record.json", environment["split_sha256"], **override)
    out = tmp_path / "cache"
    with pytest.raises(ingest.IngestError, match=fragment) as raised:
        ingest_holdout(environment, out, record)
    assert raised.value.code == "HOLDOUT_AUTHORIZATION_INVALID"
    assert not out.exists()


def test_holdout_is_refused_for_a_record_that_is_not_strict_json(environment, tmp_path):
    out = tmp_path / "cache"
    for name, payload in (("list.json", "[]"), ("text.json", "gate closed"), ("nan.json", '{"x": NaN}'),
                          ("twice.json", '{"format": "ml-holdout-authorization/1", "format": "x"}')):
        record = tmp_path / name
        record.write_text(payload, encoding="utf-8")
        with pytest.raises(ingest.IngestError) as raised:
            ingest_holdout(environment, out, record)
        assert raised.value.code == "HOLDOUT_AUTHORIZATION_INVALID", name
    assert not out.exists()


def test_a_relative_record_path_is_resolved_against_the_repository(environment, tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    (repo / "management").mkdir(parents=True)
    write_record(repo / "management" / "record.json", environment["split_sha256"])
    monkeypatch.setattr(ingest, "REPO_ROOT", repo)
    index = ingest_holdout(environment, tmp_path / "cache", Path("management/record.json"), only=["CASE_9102"])
    assert index["holdout_authorization"]["record_path"] == "management/record.json"


# -- the cache ---------------------------------------------------------------------------

def test_the_cache_records_the_record_and_every_holdout_case_except_int12(environment, holdout_environment):
    index = holdout_environment["index"]
    digest = hashlib.sha256(holdout_environment["record"].read_bytes()).hexdigest()
    assert index["holdout_authorization"] == {
        **GATE, "split_sha256": environment["split_sha256"], "record_sha256": digest, "record_path": "authorization.json"}
    assert len(index["cases"]) == 2 + 1 + len(HOLDOUT_EVALUATED) == 54
    assert index["inference_only_case_ids"] == [INT12]
    cache = holdout_environment["cache"]
    for case_id in HOLDOUT_EVALUATED:
        record = json.loads((cache / "cases" / case_id / "case.json").read_text(encoding="utf-8"))
        assert (record["role"], record["mode"], record["split_partition"], record["ground_truth_available"]) == (
            "FINAL_HOLDOUT", "EVALUATION", "final_holdout", True), case_id
        assert (cache / "cases" / case_id / "gt").is_dir()
    int12 = json.loads((cache / "cases" / INT12 / "case.json").read_text(encoding="utf-8"))
    assert int12["mode"] == "INFERENCE_REVIEW" and int12["ground_truth_available"] is False
    assert not (cache / "cases" / INT12 / "gt").exists() and int12["mask_sha256"] is None
    assert str(holdout_environment["record"].parent) not in json.dumps(index)  # no machine path in the cache metadata


def test_rerunning_the_default_ingest_keeps_the_record(environment, holdout_environment):
    again = ingest.run_ingest(environment["package"], environment["dataset_manifest"], environment["split_manifest"],
                              holdout_environment["cache"], expected_split_sha256=environment["split_sha256"])
    assert again["holdout_authorization"] == holdout_environment["index"]["holdout_authorization"]
    assert len(again["cases"]) == 54


def test_holdout_cases_are_served_in_evaluation_mode_and_int12_never_with_ground_truth(holdout_api, environment):
    api = holdout_api
    health = api.client.get("/health").json()
    assert health["cases"] == {"total": 54, "EVALUATION": 53, "INFERENCE_REVIEW": 1}
    for case_id in ("CASE_0027", "CASE_9102", "CASE_9150"):
        case = api.call("GET", f"{B}/cases/{case_id}", "case_get", 200).json()
        assert case["mode"] == "EVALUATION" and case["ground_truth_available"] is True, case_id
        meta = api.call("GET", f"{B}/cases/{case_id}/slices/2/ground-truth", "ground_truth_slice_get", 200).json()
        assert meta["reference_mask_id"] == f"MASK_{case_id}"
    # SCR-03 / SCR-04 numbers of an evaluated holdout case come from the saved metric artifacts.
    run = api.call("GET", f"{B}/analysis-runs/RUN_9102", "analysis_run_get", 200).json()
    assert run["case_id"] == "CASE_9102" and run["status"] == "SUCCEEDED"
    metrics = api.call("GET", f"{B}/analysis-runs/RUN_9102/metrics?prediction_variant=RAW", "analysis_run_metrics", 200).json()
    assert metrics["metric_state"] == "COMPUTED" and metrics["reference_mask_id"] == "MASK_CASE_9102"
    api.call("GET", f"{B}/analysis-runs/RUN_9102/slices/2/prediction?variant=RAW", "prediction_slice_get", 200)
    api.call("GET", f"{B}/analysis-runs/RUN_9102/slices/2/metrics?prediction_variant=RAW", "analysis_slice_metrics", 200)
    # INT-12 stays an inference-review case with no ground truth, in every mode.
    case = api.call("GET", f"{B}/cases/{INT12}", "case_get", 200).json()
    assert case["mode"] == "INFERENCE_REVIEW" and case["ground_truth_available"] is False
    assert api.error_code(api.call("GET", f"{B}/cases/{INT12}/slices/2/ground-truth", "ground_truth_slice_get", 404)) \
        == "GROUND_TRUTH_UNAVAILABLE"
    assert api.error_code(api.call("GET", f"{B}/analysis-runs/RUN_0031/metrics?prediction_variant=RAW",
                                   "analysis_run_metrics", 404)) == "GROUND_TRUTH_UNAVAILABLE"
    page = api.call("GET", f"{B}/experiments/EXP-U-025/cases", "experiment_cases", 200).json()
    assert next(row for row in page["items"] if row["case_id"] == INT12)["status"] == "WITHHELD"
    assert INT12 not in json.dumps(page["outlier_selection"])
    # The 51 other holdout cases are listed, in EVALUATION mode.
    rows = api.call("GET", f"{B}/studies/STUDY_LA_001/cases?limit=100", "case_list", 200).json()["items"]
    modes = {row["case_id"]: row["mode_capability"] for row in rows}
    assert modes[INT12] == "INFERENCE_REVIEW" and sum(1 for mode in modes.values() if mode == "EVALUATION") == 53


# -- the lock in CaseStore -----------------------------------------------------------------

def copy_cache(source: Path, target: Path) -> Path:
    shutil.copytree(source, target)
    return target


def edit_json(path: Path, change) -> None:
    document = json.loads(path.read_text(encoding="utf-8"))
    change(document)
    path.write_text(json.dumps(document), encoding="utf-8")


def test_without_the_record_in_the_cache_the_old_rule_holds(holdout_environment, tmp_path):
    cache = copy_cache(holdout_environment["cache"], tmp_path / "cache")
    edit_json(cache / "index.json", lambda index: index.pop("holdout_authorization"))
    with pytest.raises(RuntimeError, match="at most one"):
        CaseStore(cache)
    # ... and one holdout case with ground truth is still refused, as before DR-022.
    only_one = copy_cache(holdout_environment["cache"], tmp_path / "one")
    edit_json(only_one / "index.json", lambda index: (index.pop("holdout_authorization"), index.update(
        cases=[case_id for case_id in index["cases"] if case_id not in HOLDOUT_EVALUATED[1:]])))
    with pytest.raises(RuntimeError, match="final_holdout"):
        CaseStore(only_one)


def test_the_record_in_the_cache_lets_evaluation_holdout_cases_in(holdout_environment):
    store = CaseStore(holdout_environment["cache"])
    assert len(store.cases) == 54 and store.inference_only_ids == {INT12} and store.modes_known
    assert store.counts() == {"total": 54, "EVALUATION": 53, "INFERENCE_REVIEW": 1}


@pytest.mark.parametrize("change", [
    lambda a: a.update(gate_status="OPEN"),
    lambda a: a.update(gate="GATE-ML-01"),
    lambda a: a.update(format="ml-holdout-authorization/2"),
    lambda a: a.update(split_sha256="0" * 64),
    lambda a: a.update(record_sha256="short"),
])
def test_a_malformed_record_in_the_cache_refuses_to_start(holdout_environment, tmp_path, change):
    cache = copy_cache(holdout_environment["cache"], tmp_path / "cache")
    edit_json(cache / "index.json", lambda index: change(index["holdout_authorization"]))
    with pytest.raises(RuntimeError, match="GATE-IMG-01 record"):
        CaseStore(cache)


def test_int12_is_never_served_with_ground_truth_whatever_the_record_says(holdout_environment, tmp_path):
    # (1) the INT-12 case.json claims ground truth.
    cache = copy_cache(holdout_environment["cache"], tmp_path / "gt_flag")
    edit_json(cache / "cases" / INT12 / "case.json", lambda case: case.update(ground_truth_available=True))
    with pytest.raises(RuntimeError, match="INT-12"):
        CaseStore(cache)
    # (2) the INT-12 case is an EVALUATION case with ground-truth slices.
    cache = copy_cache(holdout_environment["cache"], tmp_path / "gt_slices")
    donor = json.loads((cache / "cases" / "CASE_9102" / "case.json").read_text(encoding="utf-8"))
    forged = dict(donor, case_id=INT12, role="INFERENCE_ONLY_INT12")
    (cache / "cases" / INT12 / "case.json").write_text(json.dumps(forged), encoding="utf-8")
    with pytest.raises(RuntimeError, match="INT-12"):
        CaseStore(cache)
    # (3) the cache does not say which case is INT-12 at all.
    cache = copy_cache(holdout_environment["cache"], tmp_path / "undesignated")
    edit_json(cache / "index.json", lambda index: index.pop("inference_only_case_ids"))
    edit_json(cache / "cases" / INT12 / "case.json", lambda case: case.update(mode="EVALUATION"))
    with pytest.raises(RuntimeError, match="does not designate"):
        CaseStore(cache)
    # (4) an authorised holdout case in a mode other than EVALUATION or the designated INT-12.
    cache = copy_cache(holdout_environment["cache"], tmp_path / "second_inference")
    edit_json(cache / "cases" / "CASE_9102" / "case.json", lambda case: case.update(
        mode="INFERENCE_REVIEW", ground_truth_available=False))
    with pytest.raises(RuntimeError, match="CASE_9102"):
        CaseStore(cache)


# -- DR-018: the loader and the validator ---------------------------------------------------

def test_the_loader_refuses_a_package_that_drops_a_case(environment, tmp_path):
    root = tmp_path / "experiments"
    built = synthetic.build_contract2(root / "run-dropped", environment, "EXP-DROPPED", prefix="D")
    manifest = built["manifest"]
    manifest["analysis_runs"].pop()  # a case vanishes: not a run, not a listed failure
    built["manifest_path"].write_text(json.dumps(manifest), encoding="utf-8")
    store = ExperimentStore(root, CaseStore(environment["cache"]), tmp_path / "render")
    assert store.experiments == {}
    assert [item["code"] for item in store.rejected] == ["EVALUATION_POPULATION_INVALID"]


def test_the_loader_serves_a_package_with_one_failure_and_shows_it_as_failed(environment, tmp_path):
    store = ExperimentStore(environment["experiments"], CaseStore(environment["cache"]), tmp_path / "render")
    package = store.experiments["EXP-U-025"]
    assert len(package.manifest["analysis_runs"]) == 53 and synthetic.FAILED_CASE not in package.run_by_case
    assert store.runs_for_case(synthetic.FAILED_CASE) == []
