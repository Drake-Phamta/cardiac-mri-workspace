"""Fixtures: a synthetic package ingested once per session, a fresh database per test.

Every JSON response a test receives through ``api`` is validated against API
Contract 11 v1.0.0 by ``contracts/api/validate_api_contract.validate_response``
- the same function the contract's own test applies to the generated fixtures.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for entry in (REPO_ROOT, REPO_ROOT / "contracts" / "api", Path(__file__).resolve().parent):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from fastapi.testclient import TestClient  # noqa: E402
from validate_api_contract import validate_response  # noqa: E402

from backend.app import ingest  # noqa: E402
from backend.app.config import Settings  # noqa: E402
from backend.app.main import create_app  # noqa: E402
import synthetic  # noqa: E402

CONTRACT = json.loads((REPO_ROOT / "contracts" / "api" / "contract.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def environment(tmp_path_factory: pytest.TempPathFactory) -> Dict[str, Any]:
    root = tmp_path_factory.mktemp("backend-env")
    built = synthetic.build_package(root)
    cache = root / "data_cache"
    ingest.run_ingest(built["package"], built["dataset_manifest"], built["split_manifest"], cache, check_ignored=False)
    experiments = root / "experiments"
    accepted = synthetic.build_contract2(experiments / "exp-u-025", "EXP-U-025")
    synthetic.build_contract2(experiments / "exp-d-025-blocked", "EXP-D-025", gates_accepted=False, prefix="B")
    return {"root": root, "cache": cache, "experiments": experiments, "accepted": accepted, **built}


class Api:
    """A TestClient whose every JSON answer must satisfy the contract."""

    def __init__(self, client: TestClient):
        self.client = client
        self.seen: List[Dict[str, Any]] = []

    def call(self, method: str, url: str, endpoint_id: str, expect: Optional[int] = None,
             json_body: Any = None, headers: Optional[Dict[str, str]] = None):
        response = self.client.request(method, url, json=json_body, headers=headers)
        body = response.json()
        problems = validate_response(CONTRACT, endpoint_id, response.status_code, body)
        assert not problems, (endpoint_id, url, response.status_code, problems)
        if expect is not None:
            assert response.status_code == expect, (url, response.status_code, body)
        self.seen.append({"endpoint": endpoint_id, "url": url, "status": response.status_code, "body": body})
        return response

    def error_code(self, response) -> str:
        return response.json()["error"]["code"]


@pytest.fixture()
def api(environment: Dict[str, Any], tmp_path: Path) -> Api:
    settings = Settings.from_env({
        "data_cache": environment["cache"],
        "experiments_root": environment["experiments"],
        "db_path": tmp_path / "backend.sqlite3",
        "render_cache": environment["root"] / "render_cache",
    })
    app = create_app(settings)
    with TestClient(app) as client:
        handle = Api(client)
        handle.app = app
        yield handle
    app.state.backend.storage.close()
