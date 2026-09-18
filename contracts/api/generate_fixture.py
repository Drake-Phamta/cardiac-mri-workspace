#!/usr/bin/env python3
"""Generate a data-free API mock catalog from schema.json (never handwritten)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the API Contract 11 mock catalog")
    parser.add_argument(
        "--contract",
        type=Path,
        default=Path(__file__).with_name("contract.json"),
        help="accepted contract instance used as the fixture source",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    fixture = generate_fixture(contract)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    print(f"generated {args.output} from {args.contract}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
