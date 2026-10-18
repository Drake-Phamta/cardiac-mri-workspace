"""Shared helpers of the backend suite (imported by name from conftest.py and the test modules).

``Api`` wraps a TestClient so that every JSON answer is validated against API Contract 11 by
``contracts/api/validate_api_contract.validate_response`` - the same function the contract's own test applies to
the generated fixtures.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
for entry in (REPO_ROOT, REPO_ROOT / "contracts" / "api", Path(__file__).resolve().parent):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from fastapi.testclient import TestClient  # noqa: E402
from validate_api_contract import validate_response  # noqa: E402

CONTRACT = json.loads((REPO_ROOT / "contracts" / "api" / "contract.json").read_text(encoding="utf-8"))


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
