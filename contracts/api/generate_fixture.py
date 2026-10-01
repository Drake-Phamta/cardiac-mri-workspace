#!/usr/bin/env python3
"""Generate a data-free API mock catalog from schema.json (never handwritten)."""

from __future__ import annotations


def generate_fixture(schema: dict) -> dict:
    return {
        "contract": schema["contract"],
        "contract_version": schema["contract_version"],
        "base_path": schema["base_path"],
        "endpoints": [
            {
                "id": endpoint["id"],
                "method": endpoint["method"],
                "path": endpoint["path"],
                "response_kind": endpoint["response_kind"],
            }
            for endpoint in schema["endpoints"]
        ],
        "errors": [
            {"code": error["code"], "http_status": error["http_status"]}
            for error in schema["errors"]
        ],
        "geometry": {
            "geometry_contract_version": schema["geometry_contract"]["version"],
            "geometry_validation_status": "VALIDATED",
        },
    }
