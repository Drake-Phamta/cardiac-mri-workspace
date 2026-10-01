"""Runtime configuration, from environment variables.

Derived patient data (slice PNGs, masks, the review database, rendered
predictions, Contract 2 packages) never defaults to a path inside the
repository: everything lives under ``CARDIAC_BACKEND_DATA`` (or the explicit
per-path variables), and a path inside any git work tree is refused - the same
rule as ``ml/data.py``'s ``inside_git_worktree``.

Layout under ``CARDIAC_BACKEND_DATA``::

    data_cache/            ingest.py output (slice PNGs + metadata)
    experiments/           Contract 2 packages (predictions, metrics)
    var/backend.sqlite3    reviews, reviewed masks, findings
    var/render_cache/      prediction slices rendered on demand
    logs/requests.jsonl    one JSON line per request (no client address)

Other settings: CARDIAC_CORS_ORIGINS (comma-separated allowlist; empty = no
CORS, the React Native app needs none), CARDIAC_ENABLE_DOCS=1 (OpenAPI/docs
routes, off by default).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Optional, Tuple

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
DATA_ROOT_ENV = "CARDIAC_BACKEND_DATA"
DATA_FIELDS = ("data_cache", "db_path", "experiments_root", "render_cache", "request_log")


def inside_git_worktree(path: os.PathLike) -> bool:
    """True when ``path`` (or the directory it would be created in) is inside a git work tree."""
    resolved = Path(path).expanduser().resolve()
    for parent in (resolved, *resolved.parents):
        if (parent / ".git").exists():
            return True
    return False


def data_root_from_env() -> Optional[Path]:
    value = os.environ.get(DATA_ROOT_ENV)
    return Path(value).expanduser() if value else None


def _env_path(name: str) -> Optional[Path]:
    value = os.environ.get(name)
    return Path(value).expanduser() if value else None


@dataclass(frozen=True)
class Settings:
    """Where the service reads and writes."""

    contract_path: Path
    data_cache: Path
    db_path: Path
    experiments_root: Path
    render_cache: Path
    request_log: Path
    study_id: str = "STUDY_LA_001"
    reviewer_header: str = "X-Reviewer-Id"
    cors_origins: Tuple[str, ...] = ()
    enable_docs: bool = False
    max_body_bytes: int = 1024 * 1024

    @classmethod
    def from_env(cls, overrides: Optional[dict] = None) -> "Settings":
        root = data_root_from_env()
        origins = tuple(item.strip() for item in os.environ.get("CARDIAC_CORS_ORIGINS", "").split(",") if item.strip())
        values = {
            "contract_path": _env_path("CARDIAC_API_CONTRACT") or REPO_ROOT / "contracts" / "api" / "contract.json",
            "data_cache": _env_path("CARDIAC_DATA_CACHE") or (root / "data_cache" if root else None),
            "db_path": _env_path("CARDIAC_DB") or (root / "var" / "backend.sqlite3" if root else None),
            "experiments_root": _env_path("CARDIAC_EXPERIMENTS_ROOT") or (root / "experiments" if root else None),
            "render_cache": _env_path("CARDIAC_RENDER_CACHE") or (root / "var" / "render_cache" if root else None),
            "request_log": _env_path("CARDIAC_REQUEST_LOG") or (root / "logs" / "requests.jsonl" if root else None),
            "study_id": os.environ.get("CARDIAC_STUDY_ID", "STUDY_LA_001"),
            "cors_origins": origins,
            "enable_docs": os.environ.get("CARDIAC_ENABLE_DOCS") == "1",
        }
        values.update(overrides or {})
        missing = sorted(name for name, value in values.items() if value is None)
        if missing:
            raise RuntimeError(
                f"set {DATA_ROOT_ENV} to a directory outside any git work tree "
                f"(derived patient data never lives in the repository); unset: {missing}"
            )
        settings = cls(**values)
        settings.refuse_data_inside_git()
        return settings

    def refuse_data_inside_git(self) -> None:
        for field in fields(self):
            if field.name not in DATA_FIELDS:
                continue
            path = getattr(self, field.name)
            if inside_git_worktree(path):
                raise RuntimeError(
                    f"{field.name}={path} is inside a git work tree; derived patient data must live outside "
                    f"the repository (set {DATA_ROOT_ENV})"
                )
