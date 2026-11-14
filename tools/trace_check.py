#!/usr/bin/env python3
"""Check that the specification (docs/spec/*.md) and the trace matrix (docs/trace/matrix.csv) agree with the code.

Python standard library only. Run from anywhere:

    python tools/trace_check.py --allow-pending docs/trace/pending_branches.txt   # now (feature branches not merged)
    python tools/trace_check.py --strict                                           # after every branch is merged

What is checked (each failure is one line in the report; exit code 1 if any):
  1. every requirement id in docs/spec has at least one matrix row, and every matrix id appears in docs/spec;
  2. matrix values are valid (status, action, priority, owner, device_evidence) and consistent
     (DONE -> NONE, FUTURE_WORK <-> FUTURE_WORK, an open row names its gap), (id, sub_item) is unique,
     and the rows of one id share one priority;
  3. every MUST row marked DONE cites at least one test;
  4. every code ref `path:symbol` names a file that exists and contains the symbol verbatim;
  5. every test ref resolves: a `test('...')` title containing the text or a `check('ID'` in a .mjs test file,
     or a `def name(` in a .py test file;
  6. the contract version pins agree (contract.json, schema.json, backend, mobile, validator) and equal the
     version docs/spec/06_api.md states; the contract's endpoints equal the EP-* ids and its error codes equal
     the API-02 code rows;
  7. spec tables with an "ID" column agree with the matrix: "Mức" = the id's priority, "Trạng thái" = the
     roll-up of its rows; the ids under a "Hướng phát triển" heading are exactly the ids with FUTURE_WORK rows.

Rows whose code lives on a feature branch that is not merged yet carry that branch in `pending_branch`
(e.g. `v2` or `v1+v4`). With --allow-pending FILE, a ref that does not resolve on such a row is reported as
PENDING (not an error) when every branch it names is listed in FILE; the contract-version and endpoint checks
are relaxed the same way. --strict (the default when --allow-pending is absent) accepts nothing pending.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

REPO = Path(__file__).resolve().parents[1]
SPEC_DIR = "docs/spec"
MATRIX = "docs/trace/matrix.csv"

COLUMNS = ["id", "sub_item", "spec_doc", "owner", "priority", "status", "action", "text", "code_refs",
           "test_refs", "device_evidence", "pending_branch", "gap", "source"]
STATUSES = {"DONE", "PARTIAL", "NOT_DONE", "FUTURE_WORK"}
ACTIONS = {"NONE", "IMPLEMENT", "DEVICE_RUN", "FUTURE_WORK"}
PRIORITIES = {"MUST", "SHOULD", "COULD"}
OWNERS = {"V1", "V2", "V3", "V4", "CHUNG"}
BRANCHES = {"shell", "v1", "v2", "v3", "v4"}

ID_RE = re.compile(r"\b(?:(?:PR|FR|NFR|UC|SCR|TC)-[A-Z0-9]+(?:-[A-Z0-9]+)*|EP-[a-z][a-z_]*[a-z]|API-\d\d)\b")
STATUS_LABEL = {"DONE": "Đã có", "PARTIAL": "Một phần", "NOT_DONE": "Chưa có", "FUTURE_WORK": "Hướng phát triển"}
FUTURE_HEADING = "hướng phát triển"
ERROR_CODE_RE = re.compile(r"^[A-Z][A-Z_]+$")

TEST_TITLE_RE = re.compile(r"""\btest\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1""")
CHECK_ID_RE = re.compile(r"""\bcheck\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1""")

# The contract version as each consumer pins it: (path, regex with one group).
CONTRACT = "contracts/api/contract.json"
PINS = [
    ("contracts/api/schema.json", r'"contract_version"\s*:\s*\{\s*"const"\s*:\s*"([^"]+)"'),
    ("backend/app/contract.py", r'^EXPECTED_VERSION\s*=\s*"([^"]+)"'),
    ("mobile/src/api/contract.mjs", r"contractVersion\s*:\s*'([^']+)'"),
    ("contracts/api/validate_api_contract.py", r'^EXPECTED_VERSION\s*=\s*"([^"]+)"'),
]
SPEC_VERSION_FILE = "06_api.md"
SPEC_VERSION_RE = re.compile(r"contract_version\D{0,20}(\d+\.\d+\.\d+)")


class Report:
    def __init__(self) -> None:
        self.errors: List[str] = []
        self.pending: List[str] = []
        self.notes: List[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def pend(self, msg: str) -> None:
        self.pending.append(msg)


class Files:
    """Reads files under one root once."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self._cache: Dict[str, Optional[str]] = {}

    def text(self, rel: str) -> Optional[str]:
        if rel not in self._cache:
            path = self.root / rel
            try:
                self._cache[rel] = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else None
            except OSError:
                self._cache[rel] = None
        return self._cache[rel]


def split_refs(cell: str) -> List[str]:
    return [part.strip() for part in (cell or "").split(";") if part.strip()]


def resolve_code_ref(files: Files, ref: str) -> Optional[str]:
    """None when `path:symbol` resolves, else the reason."""
    if ":" not in ref:
        return "no ':' between path and symbol"
    path, symbol = ref.split(":", 1)
    if not symbol:
        return "empty symbol"
    content = files.text(path)
    if content is None:
        return "file not found"
    return None if symbol in content else "symbol not in file"


def unescape(text: str) -> str:
    return re.sub(r"\\(.)", r"\1", text)


def resolve_test_ref(files: Files, ref: str) -> Optional[str]:
    """None when the test exists, else the reason."""
    if ":" not in ref:
        return "no ':' between path and test"
    path, symbol = ref.split(":", 1)
    content = files.text(path)
    if content is None:
        return "file not found"
    if path.endswith(".mjs"):
        titles = [unescape(m.group(2)) for m in TEST_TITLE_RE.finditer(content)]
        if any(symbol in title for title in titles):
            return None
        checks = {unescape(m.group(2)) for m in CHECK_ID_RE.finditer(content)}
        return None if symbol in checks else "no test('...') title containing it and no check('ID')"
    if path.endswith(".py"):
        if re.search(r"^\s*(?:async\s+)?def\s+" + re.escape(symbol) + r"\s*\(", content, re.M):
            return None
        return "no def with that name"
    return "a test ref must point to a .mjs or .py test file"


def read_matrix(root: Path, rep: Report) -> List[Dict[str, str]]:
    path = root / MATRIX
    if not path.is_file():
        rep.error(f"{MATRIX}: missing")
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            rep.error(f"{MATRIX}: columns must be exactly {','.join(COLUMNS)}")
            return []
        rows = []
        for number, row in enumerate(reader, start=2):
            row["_line"] = str(number)
            rows.append(row)
        return rows


def spec_files(root: Path) -> List[Path]:
    return sorted((root / SPEC_DIR).glob("*.md"))


def spec_ids(root: Path) -> Dict[str, Set[str]]:
    """id -> the spec files that mention it."""
    found: Dict[str, Set[str]] = defaultdict(set)
    for path in spec_files(root):
        for match in ID_RE.finditer(path.read_text(encoding="utf-8")):
            found[match.group(0)].add(path.name)
    return found


def future_ids(root: Path) -> Dict[str, Set[str]]:
    """ids listed under a heading that contains "Hướng phát triển"."""
    found: Dict[str, Set[str]] = defaultdict(set)
    for path in spec_files(root):
        level = 0
        for line in path.read_text(encoding="utf-8").splitlines():
            heading = re.match(r"^(#+)\s+(.*)$", line)
            if heading:
                depth = len(heading.group(1))
                if FUTURE_HEADING in heading.group(2).lower():
                    level = depth
                    continue
                if level and depth <= level:
                    level = 0
            if level:
                for match in ID_RE.finditer(line):
                    found[match.group(0)].add(path.name)
    return found


def spec_tables(root: Path) -> Iterable[Tuple[str, int, str, Dict[str, str]]]:
    """(file, line, id, {column: cell}) for every table row whose first header cell is "ID"."""
    for path in spec_files(root):
        header: Optional[List[str]] = None
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.lstrip().startswith("|"):
                header = None
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if header is None:
                header = [cell.strip("* ").lower() for cell in cells]
                continue
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                continue
            if not header or header[0] != "id":
                continue
            match = ID_RE.search(cells[0])
            if match:
                yield path.name, number, match.group(0), dict(zip(header, cells))


def rollup(rows: List[Dict[str, str]]) -> str:
    live = [row["status"] for row in rows if row["status"] != "FUTURE_WORK"]
    if not live:
        return "FUTURE_WORK"
    if all(status == "DONE" for status in live):
        return "DONE"
    if all(status == "NOT_DONE" for status in live):
        return "NOT_DONE"
    return "PARTIAL"


def read_allowed(path: Optional[str]) -> Set[str]:
    if not path:
        return set()
    allowed = set()
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        token = line.split("#", 1)[0].strip()
        if token:
            allowed.add(token)
    return allowed


def check_matrix(root: Path, code_root: Path, allowed: Set[str], rep: Report) -> Dict[str, int]:
    rows = read_matrix(root, rep)
    files = Files(code_root)
    by_id: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    seen: Set[Tuple[str, str]] = set()
    stats = defaultdict(int)

    for row in rows:
        where = f"{MATRIX}:{row['_line']} {row['id']}" + (f" [{row['sub_item']}]" if row["sub_item"] else "")
        if not ID_RE.fullmatch(row["id"]):
            rep.error(f"{where}: id is not a requirement id")
        key = (row["id"], row["sub_item"])
        if key in seen:
            rep.error(f"{where}: duplicate (id, sub_item)")
        seen.add(key)
        by_id[row["id"]].append(row)
        for column, valid in (("status", STATUSES), ("action", ACTIONS), ("priority", PRIORITIES),
                              ("owner", OWNERS), ("device_evidence", {"yes", "no"})):
            if row[column] not in valid:
                rep.error(f"{where}: {column} '{row[column]}' not in {sorted(valid)}")
        status, action = row["status"], row["action"]
        if status == "DONE" and action != "NONE":
            rep.error(f"{where}: a DONE row has action NONE (found {action})")
        if (status == "FUTURE_WORK") != (action == "FUTURE_WORK"):
            rep.error(f"{where}: status FUTURE_WORK and action FUTURE_WORK go together")
        if status in ("PARTIAL", "NOT_DONE"):
            if action not in ("IMPLEMENT", "DEVICE_RUN"):
                rep.error(f"{where}: an open row needs action IMPLEMENT or DEVICE_RUN")
            if not row["gap"].strip():
                rep.error(f"{where}: an open row must say its gap")
        if row["priority"] == "MUST" and status == "DONE" and not split_refs(row["test_refs"]):
            rep.error(f"{where}: MUST marked DONE cites no test")
        pending = [tag for tag in row["pending_branch"].split("+") if tag]
        for tag in pending:
            if tag not in BRANCHES:
                rep.error(f"{where}: pending_branch '{tag}' not in {sorted(BRANCHES)}")
        covered = bool(pending) and all(tag in allowed for tag in pending)
        unresolved = 0
        for kind, resolver in (("code_refs", resolve_code_ref), ("test_refs", resolve_test_ref)):
            for ref in split_refs(row[kind]):
                stats[kind] += 1
                reason = resolver(files, ref)
                if reason is None:
                    continue
                unresolved += 1
                message = f"{where}: {kind} '{ref}': {reason}"
                if covered:
                    rep.pend(message + f" (pending {row['pending_branch']})")
                else:
                    rep.error(message)
        if pending and not unresolved and not allowed:
            rep.notes.append(f"{where}: every ref resolves; pending_branch '{row['pending_branch']}' can be cleared")

    for ident, group in sorted(by_id.items()):
        levels = {row["priority"] for row in group if row["status"] != "FUTURE_WORK"}
        if len(levels) > 1:
            rep.error(f"{MATRIX}: {ident}: rows disagree on priority {sorted(levels)}")

    mentioned = spec_ids(root)
    for ident in sorted(set(mentioned) - set(by_id)):
        rep.error(f"{SPEC_DIR}: {ident} (in {', '.join(sorted(mentioned[ident]))}) has no matrix row")
    for ident in sorted(set(by_id) - set(mentioned)):
        rep.error(f"{MATRIX}: {ident} appears in no file of {SPEC_DIR}")

    for name, line, ident, cells in spec_tables(root):
        group = by_id.get(ident)
        if not group:
            continue
        where = f"{SPEC_DIR}/{name}:{line} {ident}"
        level_cell = cells.get("mức")
        if level_cell is not None:
            levels = {row["priority"] for row in group if row["status"] != "FUTURE_WORK"} or \
                {row["priority"] for row in group}
            if level_cell.strip("* ") not in levels:
                rep.error(f"{where}: Mức '{level_cell}' but the matrix says {'/'.join(sorted(levels))}")
        status_cell = cells.get("trạng thái")
        if status_cell is not None:
            expected = STATUS_LABEL[rollup(group)]
            if not status_cell.strip("* ").startswith(expected):
                rep.error(f"{where}: Trạng thái '{status_cell[:40]}' but the matrix rolls up to '{expected}'")

    listed = future_ids(root)
    future = {ident for ident, group in by_id.items() if any(row["status"] == "FUTURE_WORK" for row in group)}
    for ident in sorted(future - set(listed)):
        rep.error(f"{SPEC_DIR}: {ident} has FUTURE_WORK rows but is not listed under 'Hướng phát triển'")
    for ident in sorted(set(listed) - future):
        if ident in by_id:
            rep.error(f"{SPEC_DIR}: {ident} is listed under 'Hướng phát triển' but has no FUTURE_WORK row")

    check_contract(root, files, by_id, allowed, rep)

    stats["ids"] = len(by_id)
    stats["rows"] = len(rows)
    for row in rows:
        stats["status:" + row["status"]] += 1
    return stats


def check_contract(root: Path, files: Files, by_id: Dict[str, List[Dict[str, str]]], allowed: Set[str],
                   rep: Report) -> None:
    text = files.text(CONTRACT)
    if text is None:
        rep.error(f"{CONTRACT}: missing")
        return
    try:
        contract = json.loads(text)
    except ValueError as exc:
        rep.error(f"{CONTRACT}: not JSON ({exc})")
        return
    version = contract.get("contract_version")
    for path, pattern in PINS:
        content = files.text(path)
        match = re.search(pattern, content or "", re.M)
        if not match:
            rep.error(f"{path}: contract version pin not found")
        elif match.group(1) != version:
            rep.error(f"{path}: pins contract {match.group(1)}, {CONTRACT} says {version}")

    spec_path = root / SPEC_DIR / SPEC_VERSION_FILE
    stated = SPEC_VERSION_RE.search(spec_path.read_text(encoding="utf-8")) if spec_path.is_file() else None
    if not stated:
        rep.error(f"{SPEC_DIR}/{SPEC_VERSION_FILE}: states no contract_version")
    elif stated.group(1) != version:
        message = f"{SPEC_DIR}/{SPEC_VERSION_FILE}: describes contract {stated.group(1)}, the code pins {version}"
        rep.pend(message) if allowed else rep.error(message)

    def pending_ok(ident: str) -> bool:
        tags = {tag for row in by_id.get(ident, []) for tag in row["pending_branch"].split("+") if tag}
        return bool(tags) and tags <= allowed

    served = {"EP-" + endpoint["id"] for endpoint in contract.get("endpoints", [])}
    specified = {ident for ident in by_id if ident.startswith("EP-")}
    for ident in sorted(specified - served):
        message = f"{ident}: no such endpoint in {CONTRACT} {version}"
        rep.pend(message) if pending_ok(ident) else rep.error(message)
    for ident in sorted(served - specified):
        rep.error(f"{CONTRACT}: endpoint {ident[3:]} has no EP- row in the matrix")

    codes = {error["code"] for error in contract.get("errors", [])}
    rows = {row["sub_item"] for row in by_id.get("API-02", []) if ERROR_CODE_RE.match(row["sub_item"])}
    for code in sorted(codes - rows):
        rep.error(f"{CONTRACT}: error code {code} has no API-02 row")
    for code in sorted(rows - codes):
        rep.error(f"API-02 [{code}]: no such error code in {CONTRACT}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", default=str(REPO), help="repository root holding docs/spec and docs/trace")
    parser.add_argument("--code-root", help="where code and test refs are read (default: --root)")
    parser.add_argument("--allow-pending", metavar="FILE", help="branch tags whose refs may be missing")
    parser.add_argument("--strict", action="store_true", help="accept nothing pending (the default without "
                        "--allow-pending)")
    parser.add_argument("--quiet", action="store_true", help="print problems and the summary only")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    code_root = Path(args.code_root).resolve() if args.code_root else root
    allowed = set() if args.strict else read_allowed(args.allow_pending)
    rep = Report()
    stats = check_matrix(root, code_root, allowed, rep)

    mode = "strict" if not allowed else f"pending allowed for {'+'.join(sorted(allowed))}"
    print(f"trace_check ({mode}): {stats['ids']} ids, {stats['rows']} rows, "
          f"{stats['code_refs']} code refs, {stats['test_refs']} test refs")
    print("  rows by status: " + ", ".join(f"{s} {stats['status:' + s]}" for s in sorted(STATUSES)))
    if rep.pending:
        print(f"PENDING ({len(rep.pending)}): refs that exist only on a branch not merged yet")
        if not args.quiet:
            for line in rep.pending:
                print("  " + line)
    if rep.notes and not args.quiet:
        print(f"NOTES ({len(rep.notes)})")
        for line in rep.notes:
            print("  " + line)
    if rep.errors:
        print(f"ERRORS ({len(rep.errors)})")
        for line in rep.errors:
            print("  " + line)
        return 1
    print("OK: spec, matrix and code agree" + (" (with pending refs)" if rep.pending else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
