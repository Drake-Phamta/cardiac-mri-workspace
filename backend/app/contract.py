"""The accepted API contract, loaded once, and the error envelope built from it.

The service refuses to start on any contract other than the exact version it
was written for: a drifted contract is a deployment error, never something to
serve around (the same rule app/core/contract.mjs applies on the phone).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

EXPECTED_CONTRACT = "api_contract_11"
EXPECTED_VERSION = "1.0.0"
EXPECTED_GEOMETRY_VERSION = "dr008a-dr012/v1.0.0"


class ApiError(Exception):
    """A contract error code, raised anywhere and answered by the route."""

    def __init__(self, code: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(code)
        self.code = code
        self.details = details


class Contract:
    def __init__(self, data: dict):
        if data.get("contract") != EXPECTED_CONTRACT or data.get("contract_version") != EXPECTED_VERSION:
            raise RuntimeError(
                f"backend serves {EXPECTED_CONTRACT} {EXPECTED_VERSION}; "
                f"got {data.get('contract')} {data.get('contract_version')}"
            )
        geometry = data["geometry_contract"]
        if geometry["version"] != EXPECTED_GEOMETRY_VERSION:
            raise RuntimeError(f"geometry contract must be {EXPECTED_GEOMETRY_VERSION}")
        self.data = data
        self.version = data["contract_version"]
        self.base_path = data["base_path"]
        self.geometry_version = geometry["version"]
        self.index_convention = geometry["index_convention"]
        self.errors = {item["code"]: item for item in data["errors"]}
        self.endpoints = {item["id"]: item for item in data["endpoints"]}
        self.enums = data["domain_enums"]
        self.review_rules = data["review_rules"]
        self.worst_slice_rule = data["selection_rules"]["worst_slice_selection"]
        self.media_type = data["binary_delivery"]["media_type"]

    @classmethod
    def load(cls, path: Path) -> "Contract":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def endpoint_errors(self, endpoint_id: str) -> List[str]:
        return list(self.endpoints[endpoint_id]["errors"])

    def http_status(self, code: str) -> int:
        return int(self.errors[code]["http_status"])

    def error_body(self, code: str, details: Optional[Dict[str, Any]] = None) -> dict:
        return {
            "error": {
                "code": code,
                "message": self.errors[code]["message_template"],
                "request_id": "req_" + uuid.uuid4().hex[:16],
                "details": details,
            }
        }

    def transitions(self) -> Dict[str, List[str]]:
        return self.enums["review_status_transitions"]
