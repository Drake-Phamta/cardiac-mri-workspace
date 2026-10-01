"""Runtime configuration, from environment variables with repository defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser() if value else default


@dataclass(frozen=True)
class Settings:
    """Where the service reads and writes.

    contract_path    the accepted API Contract 11 (exact version is enforced)
    data_cache       derived per-slice PNGs + metadata written by ingest.py
                     (gitignored; derived from patient images)
    db_path          SQLite store for reviews, reviewed masks and findings
    experiments_root Contract 2 experiment artifact packages (gitignored)
    render_cache     prediction slices rendered on demand (gitignored)
    study_id         the de-identified study this deployment serves
    """

    contract_path: Path
    data_cache: Path
    db_path: Path
    experiments_root: Path
    render_cache: Path
    study_id: str = "STUDY_LA_001"
    reviewer_header: str = "X-Reviewer-Id"

    @classmethod
    def from_env(cls, overrides: Optional[dict] = None) -> "Settings":
        values = {
            "contract_path": _env_path("CARDIAC_API_CONTRACT", REPO_ROOT / "contracts" / "api" / "contract.json"),
            "data_cache": _env_path("CARDIAC_DATA_CACHE", BACKEND_ROOT / "data_cache"),
            "db_path": _env_path("CARDIAC_DB", BACKEND_ROOT / "var" / "backend.sqlite3"),
            "experiments_root": _env_path("CARDIAC_EXPERIMENTS_ROOT", BACKEND_ROOT / "experiments"),
            "render_cache": _env_path("CARDIAC_RENDER_CACHE", BACKEND_ROOT / "var" / "render_cache"),
            "study_id": os.environ.get("CARDIAC_STUDY_ID", "STUDY_LA_001"),
        }
        values.update(overrides or {})
        return cls(**values)
