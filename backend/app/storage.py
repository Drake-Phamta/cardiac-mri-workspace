"""SQLite persistence: reviews, reviewed-mask versions, findings.

Rules enforced here, not left to callers:

- review states are the four of FR-REV-001 and only the transitions of
  ``domain_enums.review_status_transitions`` are accepted (05 section 6);
  ``CORRECTED`` needs a persisted reviewed mask; every write checks
  ``expected_revision`` (STALE_REVISION, never last-write-wins);
- every state change is appended to ``review_history``;
- a reviewed mask is a new immutable version: the database refuses UPDATE and
  DELETE on ``reviewed_masks``, ``reviewed_mask_slices`` and both history
  tables, and an INSERT that meets an existing key (REPLACE) on those and on
  ``findings`` (triggers), so an overwrite is impossible even from a bug or
  another connection;
- a finding's evidence columns cannot be updated (trigger); only note and
  status change, each change appended to ``finding_history``.
"""

from __future__ import annotations

import datetime as _dt
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

import numpy as np

from . import imaging
from .contract import ApiError

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
  review_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  source_mask_id TEXT NOT NULL,
  source_mask_kind TEXT NOT NULL,
  prediction_variant TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_REVIEWED', 'ACCEPTED', 'FLAGGED', 'CORRECTED')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, source_mask_id, prediction_variant)
);
CREATE TABLE IF NOT EXISTS review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL REFERENCES reviews(review_id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reviewer_id TEXT,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS working_slices (
  review_id TEXT NOT NULL REFERENCES reviews(review_id),
  slice_index INTEGER NOT NULL,
  png BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (review_id, slice_index)
);
CREATE TABLE IF NOT EXISTS reviewed_masks (
  reviewed_mask_id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(review_id),
  version INTEGER NOT NULL,
  parent_reviewed_mask_id TEXT,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_mask_id TEXT NOT NULL,
  source_mask_kind TEXT NOT NULL,
  prediction_variant TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  checksum TEXT NOT NULL,
  review_revision INTEGER NOT NULL,
  shape TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewer_id TEXT,
  UNIQUE (review_id, version)
);
CREATE TABLE IF NOT EXISTS reviewed_mask_slices (
  reviewed_mask_id TEXT NOT NULL REFERENCES reviewed_masks(reviewed_mask_id),
  slice_index INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  png BLOB NOT NULL,
  PRIMARY KEY (reviewed_mask_id, slice_index)
);
CREATE INDEX IF NOT EXISTS reviewed_mask_slices_sha ON reviewed_mask_slices(sha256);
CREATE TABLE IF NOT EXISTS findings (
  finding_id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  experiment_id TEXT,
  case_id TEXT,
  analysis_run_id TEXT,
  slice_index INTEGER,
  region_reference TEXT,
  finding_type TEXT NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS finding_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT NOT NULL REFERENCES findings(finding_id),
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS reviewed_masks_no_update BEFORE UPDATE ON reviewed_masks
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS reviewed_masks_no_delete BEFORE DELETE ON reviewed_masks
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS reviewed_mask_slices_no_update BEFORE UPDATE ON reviewed_mask_slices
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS reviewed_mask_slices_no_delete BEFORE DELETE ON reviewed_mask_slices
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS review_history_no_update BEFORE UPDATE ON review_history
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS review_history_no_delete BEFORE DELETE ON review_history
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS finding_history_no_update BEFORE UPDATE ON finding_history
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS finding_history_no_delete BEFORE DELETE ON finding_history
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS findings_evidence_immutable
  BEFORE UPDATE OF study_id, experiment_id, case_id, analysis_run_id, slice_index, region_reference, finding_type
  ON findings BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS findings_no_delete BEFORE DELETE ON findings
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
-- An INSERT that meets an existing key (REPLACE, INSERT OR REPLACE, an upsert) is
-- refused before conflict resolution runs, on any connection: these do not depend
-- on PRAGMA recursive_triggers, which is per connection.
CREATE TRIGGER IF NOT EXISTS reviewed_masks_no_replace BEFORE INSERT ON reviewed_masks
  WHEN EXISTS (SELECT 1 FROM reviewed_masks WHERE reviewed_mask_id = NEW.reviewed_mask_id
               OR (review_id = NEW.review_id AND version = NEW.version))
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS reviewed_mask_slices_no_replace BEFORE INSERT ON reviewed_mask_slices
  WHEN EXISTS (SELECT 1 FROM reviewed_mask_slices
               WHERE reviewed_mask_id = NEW.reviewed_mask_id AND slice_index = NEW.slice_index)
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS review_history_no_replace BEFORE INSERT ON review_history
  WHEN EXISTS (SELECT 1 FROM review_history WHERE id = NEW.id)
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS finding_history_no_replace BEFORE INSERT ON finding_history
  WHEN EXISTS (SELECT 1 FROM finding_history WHERE id = NEW.id)
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
CREATE TRIGGER IF NOT EXISTS findings_no_replace BEFORE INSERT ON findings
  WHEN EXISTS (SELECT 1 FROM findings WHERE finding_id = NEW.finding_id)
  BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ARTIFACT'); END;
"""

# A commit's volume builder: (review row, working slices {z: (Ny, Nx)}, base or None)
# -> (volume (z, y, x) uint8 {0, 255}, source checksum "sha256:<hex>").
VolumeBuilder = Callable[[sqlite3.Row, Dict[int, np.ndarray], Optional[np.ndarray]], Tuple[np.ndarray, str]]


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def etag(resource_id: str, revision: int) -> str:
    return f'W/"{resource_id}:{revision}"'


class Storage:
    def __init__(self, path: Path, transitions: Dict[str, List[str]], create_allowed: List[str]):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.transitions = {key: list(value) for key, value in transitions.items()}
        self.create_allowed = list(create_allowed)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        # REPLACE / INSERT OR REPLACE deletes the conflicting row first; with
        # recursive triggers that implicit delete fires the BEFORE DELETE
        # immutability triggers, so a REPLACE cannot overwrite a version either.
        self._conn.execute("PRAGMA recursive_triggers = ON")
        self._conn.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            self._conn.execute("COMMIT")

    def _read(self, sql: str, params: tuple = ()) -> List[sqlite3.Row]:
        with self._lock:
            return list(self._conn.execute(sql, params))

    def raw_execute(self, sql: str, params: tuple = ()) -> None:
        """For tests that prove the database itself refuses an overwrite."""
        with self._lock:
            self._conn.execute(sql, params)

    # -- reviews -------------------------------------------------------------
    def _history(self, conn: sqlite3.Connection, review_id: str, revision: int, action: str,
                 from_status: Optional[str], to_status: str, reviewer: Optional[str], detail: Any = None) -> None:
        conn.execute(
            "INSERT INTO review_history (review_id, revision, action, from_status, to_status, reviewer_id, detail, at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (review_id, revision, action, from_status, to_status, reviewer,
             None if detail is None else json.dumps(detail), now()),
        )

    def create_review(self, run_id: str, case_id: str, source_mask_id: str, source_mask_kind: str,
                      variant: str, status: str, reviewer: Optional[str]) -> Tuple[sqlite3.Row, bool]:
        with self._tx() as conn:
            row = conn.execute(
                "SELECT * FROM reviews WHERE run_id = ? AND source_mask_id = ? AND prediction_variant = ?",
                (run_id, source_mask_id, variant),
            ).fetchone()
            if row is not None:
                if status in ("NOT_REVIEWED", row["status"]):
                    return row, False
                raise ApiError("INVALID_REVIEW_TRANSITION", {
                    "existing_review_id": row["review_id"], "current_status": row["status"],
                    "requested_status": status, "hint": "change an existing review with review_patch",
                })
            if status not in self.create_allowed:
                raise ApiError("INVALID_REVIEW_TRANSITION", {
                    "requested_status": status, "allowed_at_creation": self.create_allowed,
                    "reason": "CORRECTED requires a persisted reviewed mask",
                })
            review_id = "REV_" + uuid.uuid4().hex[:12].upper()
            stamp = now()
            conn.execute(
                "INSERT INTO reviews (review_id, run_id, case_id, source_mask_id, source_mask_kind, prediction_variant,"
                " status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                (review_id, run_id, case_id, source_mask_id, source_mask_kind, variant, status, stamp, stamp),
            )
            self._history(conn, review_id, 1, "CREATE", None, "NOT_REVIEWED", reviewer)
            if status != "NOT_REVIEWED":
                self._history(conn, review_id, 1, "TRANSITION", "NOT_REVIEWED", status, reviewer)
            return conn.execute("SELECT * FROM reviews WHERE review_id = ?", (review_id,)).fetchone(), True

    def get_review(self, review_id: str) -> Optional[sqlite3.Row]:
        rows = self._read("SELECT * FROM reviews WHERE review_id = ?", (review_id,))
        return rows[0] if rows else None

    def _locked_review(self, conn: sqlite3.Connection, review_id: str, expected_revision: int) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM reviews WHERE review_id = ?", (review_id,)).fetchone()
        if row is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"review_id": review_id})
        if row["revision"] != expected_revision:
            raise ApiError("STALE_REVISION", {"current_revision": row["revision"], "expected_revision": expected_revision})
        return row

    def _count_versions(self, conn: sqlite3.Connection, review_id: str) -> int:
        return conn.execute("SELECT COUNT(*) FROM reviewed_masks WHERE review_id = ?", (review_id,)).fetchone()[0]

    def patch_review(self, review_id: str, status: str, expected_revision: int, reviewer: Optional[str]) -> sqlite3.Row:
        with self._tx() as conn:
            row = self._locked_review(conn, review_id, expected_revision)
            allowed = self.transitions.get(row["status"], [])
            if status not in allowed:
                raise ApiError("INVALID_REVIEW_TRANSITION", {"from": row["status"], "to": status, "allowed": allowed})
            if status == "CORRECTED" and self._count_versions(conn, review_id) == 0:
                raise ApiError("INVALID_REVIEW_TRANSITION", {
                    "from": row["status"], "to": status, "reason": "CORRECTED requires a persisted reviewed mask",
                })
            revision = row["revision"] + 1
            conn.execute("UPDATE reviews SET status = ?, revision = ?, updated_at = ? WHERE review_id = ?",
                         (status, revision, now(), review_id))
            self._history(conn, review_id, revision, "TRANSITION", row["status"], status, reviewer)
            return conn.execute("SELECT * FROM reviews WHERE review_id = ?", (review_id,)).fetchone()

    def put_working_slice(self, review_id: str, slice_index: int, png: bytes, expected_revision: int,
                          reviewer: Optional[str]) -> sqlite3.Row:
        digest = imaging.sha256_bytes(png)
        with self._tx() as conn:
            row = self._locked_review(conn, review_id, expected_revision)
            revision = row["revision"] + 1
            conn.execute(
                "INSERT INTO working_slices (review_id, slice_index, png, sha256, revision, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (review_id, slice_index) DO UPDATE SET"
                " png = excluded.png, sha256 = excluded.sha256, revision = excluded.revision,"
                " updated_at = excluded.updated_at",
                (review_id, slice_index, png, digest, revision, now()),
            )
            conn.execute("UPDATE reviews SET revision = ?, updated_at = ? WHERE review_id = ?",
                         (revision, now(), review_id))
            self._history(conn, review_id, revision, "WORKING_SLICE", row["status"], row["status"], reviewer,
                          {"slice_index": slice_index, "sha256": digest})
            return conn.execute("SELECT * FROM reviews WHERE review_id = ?", (review_id,)).fetchone()

    def commit(self, review_id: str, expected_revision: int, build: VolumeBuilder,
               reviewer: Optional[str]) -> sqlite3.Row:
        """Working edits -> a new immutable reviewed-mask version, atomically."""
        with self._tx() as conn:
            row = self._locked_review(conn, review_id, expected_revision)
            if row["status"] != "CORRECTED" and "CORRECTED" not in self.transitions.get(row["status"], []):
                raise ApiError("INVALID_REVIEW_TRANSITION", {"from": row["status"], "to": "CORRECTED"})
            working = {
                item["slice_index"]: imaging.decode_png(item["png"])
                for item in conn.execute("SELECT slice_index, png FROM working_slices WHERE review_id = ?", (review_id,))
            }
            if not working:
                raise ApiError("VALIDATION_ERROR", {"reason": "no working-mask slice to commit"})
            parent = conn.execute(
                "SELECT * FROM reviewed_masks WHERE review_id = ? ORDER BY version DESC LIMIT 1", (review_id,),
            ).fetchone()
            base = None
            if parent is not None:
                slices = conn.execute(
                    "SELECT png FROM reviewed_mask_slices WHERE reviewed_mask_id = ? ORDER BY slice_index",
                    (parent["reviewed_mask_id"],),
                ).fetchall()
                base = np.stack([imaging.decode_png(item["png"]) for item in slices])
            volume, source_checksum = build(row, working, base)
            version = 1 if parent is None else parent["version"] + 1
            reviewed_mask_id = f"RM_{review_id}_V{version}"
            if conn.execute("SELECT 1 FROM reviewed_masks WHERE reviewed_mask_id = ?", (reviewed_mask_id,)).fetchone():
                raise ApiError("IMMUTABLE_ARTIFACT", {"reviewed_mask_id": reviewed_mask_id})
            revision = row["revision"] + 1
            stamp = now()
            conn.execute(
                "INSERT INTO reviewed_masks (reviewed_mask_id, review_id, version, parent_reviewed_mask_id, case_id,"
                " run_id, source_mask_id, source_mask_kind, prediction_variant, source_checksum, checksum,"
                " review_revision, shape, created_at, reviewer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (reviewed_mask_id, review_id, version, None if parent is None else parent["reviewed_mask_id"],
                 row["case_id"], row["run_id"], row["source_mask_id"], row["source_mask_kind"],
                 row["prediction_variant"], source_checksum, imaging.volume_checksum(volume), revision,
                 json.dumps(list(volume.shape)), stamp, reviewer),
            )
            for index in range(volume.shape[0]):
                payload = imaging.encode_png(volume[index])
                conn.execute(
                    "INSERT INTO reviewed_mask_slices (reviewed_mask_id, slice_index, sha256, png) VALUES (?, ?, ?, ?)",
                    (reviewed_mask_id, index, imaging.sha256_bytes(payload), payload),
                )
            conn.execute("UPDATE reviews SET status = 'CORRECTED', revision = ?, updated_at = ? WHERE review_id = ?",
                         (revision, stamp, review_id))
            self._history(conn, review_id, revision, "COMMIT", row["status"], "CORRECTED", reviewer,
                          {"reviewed_mask_id": reviewed_mask_id, "version": version})
            conn.execute("DELETE FROM working_slices WHERE review_id = ?", (review_id,))
            return conn.execute("SELECT * FROM reviewed_masks WHERE reviewed_mask_id = ?", (reviewed_mask_id,)).fetchone()

    def review_history(self, review_id: str) -> List[sqlite3.Row]:
        return self._read("SELECT * FROM review_history WHERE review_id = ? ORDER BY id", (review_id,))

    def reviewed_masks(self, review_id: str) -> List[sqlite3.Row]:
        return self._read("SELECT * FROM reviewed_masks WHERE review_id = ? ORDER BY version", (review_id,))

    def reviewed_mask(self, reviewed_mask_id: str) -> Optional[sqlite3.Row]:
        rows = self._read("SELECT * FROM reviewed_masks WHERE reviewed_mask_id = ?", (reviewed_mask_id,))
        return rows[0] if rows else None

    def reviewed_mask_slice(self, reviewed_mask_id: str, slice_index: int) -> Optional[sqlite3.Row]:
        rows = self._read("SELECT sha256, png FROM reviewed_mask_slices WHERE reviewed_mask_id = ? AND slice_index = ?",
                          (reviewed_mask_id, slice_index))
        return rows[0] if rows else None

    def blob(self, digest: str) -> Optional[bytes]:
        rows = self._read("SELECT png FROM reviewed_mask_slices WHERE sha256 = ? LIMIT 1", (digest,))
        return bytes(rows[0]["png"]) if rows else None

    def blob_owners(self, digest: str, limit: int = 1000) -> List[Tuple[str, str, int]]:
        """Every (reviewed_mask_id, case_id, slice_index) whose PNG has this digest, for the request log.

        Identical slices (an empty one, say) share a digest across versions and cases."""
        rows = self._read(
            "SELECT s.reviewed_mask_id AS id, m.case_id AS case_id, s.slice_index AS z FROM reviewed_mask_slices s"
            " JOIN reviewed_masks m ON m.reviewed_mask_id = s.reviewed_mask_id WHERE s.sha256 = ?"
            " ORDER BY s.reviewed_mask_id, s.slice_index LIMIT ?", (digest, limit))
        return [(row["id"], row["case_id"], int(row["z"])) for row in rows]

    # -- findings ------------------------------------------------------------
    def create_finding(self, values: Dict[str, Any]) -> sqlite3.Row:
        finding_id = "FINDING_" + uuid.uuid4().hex[:12].upper()
        stamp = now()
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO findings (finding_id, study_id, experiment_id, case_id, analysis_run_id, slice_index,"
                " region_reference, finding_type, note, status, revision, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 1, ?, ?)",
                (finding_id, values["study_id"], values.get("experiment_id"), values.get("case_id"),
                 values.get("analysis_run_id"), values.get("slice_index"),
                 None if values.get("region_reference") is None else json.dumps(values["region_reference"]),
                 values["finding_type"], values["note"], stamp, stamp),
            )
            conn.execute("INSERT INTO finding_history (finding_id, revision, status, note, at) VALUES (?, 1, 'OPEN', ?, ?)",
                         (finding_id, values["note"], stamp))
            return conn.execute("SELECT * FROM findings WHERE finding_id = ?", (finding_id,)).fetchone()

    def findings(self, filters: Dict[str, Any]) -> List[sqlite3.Row]:
        clauses, params = [], []
        for column in ("case_id", "analysis_run_id", "experiment_id", "status", "finding_type"):
            if filters.get(column) is not None:
                clauses.append(f"{column} = ?")
                params.append(filters[column])
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        return self._read(f"SELECT * FROM findings{where} ORDER BY created_at, finding_id", tuple(params))

    def patch_finding(self, finding_id: str, expected_revision: int, note: Optional[str],
                      status: Optional[str]) -> sqlite3.Row:
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM findings WHERE finding_id = ?", (finding_id,)).fetchone()
            if row is None:
                raise ApiError("ARTIFACT_NOT_FOUND", {"finding_id": finding_id})
            if row["revision"] != expected_revision:
                raise ApiError("STALE_REVISION", {"current_revision": row["revision"], "expected_revision": expected_revision})
            new_note = row["note"] if note is None else note
            new_status = row["status"] if status is None else status
            revision = row["revision"] + 1
            stamp = now()
            conn.execute("UPDATE findings SET note = ?, status = ?, revision = ?, updated_at = ? WHERE finding_id = ?",
                         (new_note, new_status, revision, stamp, finding_id))
            conn.execute("INSERT INTO finding_history (finding_id, revision, status, note, at) VALUES (?, ?, ?, ?, ?)",
                         (finding_id, revision, new_status, new_note, stamp))
            return conn.execute("SELECT * FROM findings WHERE finding_id = ?", (finding_id,)).fetchone()

    def counts(self) -> Dict[str, int]:
        return {
            "reviews": self._read("SELECT COUNT(*) AS n FROM reviews")[0]["n"],
            "reviewed_masks": self._read("SELECT COUNT(*) AS n FROM reviewed_masks")[0]["n"],
            "findings": self._read("SELECT COUNT(*) AS n FROM findings")[0]["n"],
        }
