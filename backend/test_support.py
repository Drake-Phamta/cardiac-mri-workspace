"""Shared paths and frozen API data used by backend test suites."""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads(
    (REPO_ROOT / "contracts" / "api" / "contract.json").read_text(encoding="utf-8"))
