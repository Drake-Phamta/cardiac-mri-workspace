"""Tests for tools/trace_check.py. Standard library only.

Run: python -m pytest tools/tests   or   python -m unittest discover -s tools/tests
"""

from __future__ import annotations

import csv
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
import trace_check as tc  # noqa: E402

REPO = TOOLS.parent

SPEC_02 = """# 02

| ID | Yêu cầu | Mức | Trạng thái |
|---|---|---|---|
| FR-DEMO-001 | Hiện một lát | MUST | Đã có |
| FR-DEMO-002 | Lọc danh sách | SHOULD | Một phần: thiếu test |

## Hướng phát triển

| ID | Nội dung |
|---|---|
| PR-DEMO-01 | Chạy mô hình trên máy |
"""

SPEC_06 = """# 06

Hợp đồng `contract_version`: **1.2.0**. Endpoint EP-thing_get. Lỗi theo API-02.
"""

CODE = "export function showSlice() { return 1 }\n"
TESTS_MJS = "test('T1 shows the slice', () => {})\ncheck('S9', true, 'smoke id')\n"
TESTS_PY = "def test_lists_things():\n    assert True\n"

CONTRACT = {"contract": "api_contract_11", "contract_version": "1.2.0",
            "endpoints": [{"id": "thing_get"}], "errors": [{"code": "THING_NOT_FOUND"}]}


def row(ident, **values):
    base = {"id": ident, "sub_item": "", "spec_doc": "02.md", "owner": "V1", "priority": "MUST", "status": "DONE",
            "action": "NONE", "text": "t", "code_refs": "src/app.mjs:showSlice",
            "test_refs": "test/app.test.mjs:T1 shows", "device_evidence": "no", "pending_branch": "", "gap": "",
            "source": "NEW"}
    base.update(values)
    return base


def default_rows():
    return [
        row("FR-DEMO-001"),
        row("FR-DEMO-002", priority="SHOULD", status="PARTIAL", action="IMPLEMENT", gap="no test", test_refs=""),
        row("PR-DEMO-01", priority="COULD", status="FUTURE_WORK", action="FUTURE_WORK", code_refs="", test_refs=""),
        row("EP-thing_get", spec_doc="06_api.md", test_refs="backend/test_api.py:test_lists_things"),
        row("API-02", spec_doc="06_api.md", test_refs="test/app.test.mjs:S9"),
        row("API-02", sub_item="THING_NOT_FOUND", spec_doc="06_api.md", test_refs="test/app.test.mjs:S9"),
    ]


class Repo:
    """A tiny repository in a temporary directory, with every file the check reads."""

    def __init__(self, rows=None, spec02=SPEC_02, spec06=SPEC_06, contract=None, pins=None):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        version = (contract or CONTRACT)["contract_version"]
        pins = pins or {}
        files = {
            "docs/spec/02.md": spec02,
            "docs/spec/06_api.md": spec06,
            "src/app.mjs": CODE,
            "test/app.test.mjs": TESTS_MJS,
            "backend/test_api.py": TESTS_PY,
            "contracts/api/contract.json": json.dumps(contract or CONTRACT),
            "contracts/api/schema.json": '{"contract_version": { "const": "%s" }}' % pins.get("schema", version),
            "backend/app/contract.py": 'EXPECTED_VERSION = "%s"\n' % pins.get("backend", version),
            "mobile/src/api/contract.mjs": "  contractVersion: '%s',\n" % pins.get("mobile", version),
            "contracts/api/validate_api_contract.py": 'EXPECTED_VERSION = "%s"\n' % pins.get("validator", version),
        }
        for rel, text in files.items():
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        matrix = self.root / tc.MATRIX
        matrix.parent.mkdir(parents=True, exist_ok=True)
        with matrix.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=tc.COLUMNS, lineterminator="\n")
            writer.writeheader()
            for item in (default_rows() if rows is None else rows):
                writer.writerow(item)

    def check(self, allowed=()):
        rep = tc.Report()
        tc.check_matrix(self.root, self.root, set(allowed), rep)
        return rep

    def close(self):
        self.tmp.cleanup()


class TraceCheckTest(unittest.TestCase):
    def run_repo(self, allowed=(), **kwargs):
        repo = Repo(**kwargs)
        self.addCleanup(repo.close)
        return repo.check(allowed)

    def assert_error(self, rep, fragment):
        self.assertTrue(any(fragment in line for line in rep.errors),
                        f"no error containing {fragment!r}; errors were: {rep.errors}")

    def test_clean_repo_passes(self):
        rep = self.run_repo()
        self.assertEqual(rep.errors, [])

    def test_spec_id_without_row_is_reported(self):
        rep = self.run_repo(spec02=SPEC_02 + "\nXem thêm FR-DEMO-099.\n")
        self.assert_error(rep, "FR-DEMO-099")
        self.assert_error(rep, "has no matrix row")

    def test_matrix_id_not_in_spec_is_reported(self):
        rep = self.run_repo(rows=default_rows() + [row("FR-DEMO-077")])
        self.assert_error(rep, "FR-DEMO-077 appears in no file")

    def test_must_done_without_test_is_reported(self):
        rows = default_rows()
        rows[0]["test_refs"] = ""
        rep = self.run_repo(rows=rows)
        self.assert_error(rep, "MUST marked DONE cites no test")

    def test_missing_symbol_or_file_is_reported(self):
        rows = default_rows()
        rows[0]["code_refs"] = "src/app.mjs:hideSlice; src/gone.mjs:x"
        rep = self.run_repo(rows=rows)
        self.assert_error(rep, "'src/app.mjs:hideSlice': symbol not in file")
        self.assert_error(rep, "'src/gone.mjs:x': file not found")

    def test_test_refs_must_name_a_real_test(self):
        rows = default_rows()
        rows[0]["test_refs"] = ("test/app.test.mjs:T1 shows; test/app.test.mjs:S9; backend/test_api.py:test_lists_things; "
                                "test/app.test.mjs:T2 missing; backend/test_api.py:test_absent")
        rep = self.run_repo(rows=rows)
        self.assertEqual(len([e for e in rep.errors if "test_refs" in e]), 2, rep.errors)
        self.assert_error(rep, "T2 missing")
        self.assert_error(rep, "test_absent': no def")

    def test_pending_ref_is_pending_only_when_allowed(self):
        rows = default_rows()
        rows[0]["code_refs"] = "src/later.mjs:fromBranch"
        rows[0]["pending_branch"] = "v2"
        strict = self.run_repo(rows=rows)
        self.assert_error(strict, "src/later.mjs:fromBranch")
        relaxed = self.run_repo(rows=rows, allowed={"v2"})
        self.assertEqual(relaxed.errors, [])
        self.assertTrue(any("pending v2" in line for line in relaxed.pending))
        other = self.run_repo(rows=rows, allowed={"v3"})
        self.assert_error(other, "src/later.mjs:fromBranch")

    def test_contract_pins_must_agree(self):
        rep = self.run_repo(pins={"mobile": "1.1.0"})
        self.assert_error(rep, "mobile/src/api/contract.mjs: pins contract 1.1.0")

    def test_spec_contract_version_must_match_unless_pending(self):
        older = dict(CONTRACT, contract_version="1.1.0")
        strict = self.run_repo(contract=older)
        self.assert_error(strict, "describes contract 1.2.0, the code pins 1.1.0")
        relaxed = self.run_repo(contract=older, allowed={"v4"})
        self.assertFalse(any("describes contract" in line for line in relaxed.errors))

    def test_endpoints_and_error_codes_must_match_the_contract(self):
        contract = dict(CONTRACT, endpoints=[{"id": "thing_get"}, {"id": "thing_put"}],
                        errors=[{"code": "THING_NOT_FOUND"}, {"code": "THING_STALE"}])
        rep = self.run_repo(contract=contract)
        self.assert_error(rep, "endpoint thing_put has no EP- row")
        self.assert_error(rep, "error code THING_STALE has no API-02 row")

    def test_status_and_level_cells_must_match_the_matrix(self):
        spec = SPEC_02.replace("| SHOULD | Một phần: thiếu test |", "| MUST | Đã có |")
        rep = self.run_repo(spec02=spec)
        self.assert_error(rep, "Mức 'MUST' but the matrix says SHOULD")
        self.assert_error(rep, "rolls up to 'Một phần'")

    def test_future_section_must_match_future_rows(self):
        spec = SPEC_02.replace("| PR-DEMO-01 | Chạy mô hình trên máy |", "| PR-DEMO-01, FR-DEMO-001 | x |")
        rep = self.run_repo(spec02=spec)
        self.assert_error(rep, "FR-DEMO-001 is listed under 'Hướng phát triển' but has no FUTURE_WORK row")
        moved = SPEC_02.replace("## Hướng phát triển", "## Khác")
        rep = self.run_repo(spec02=moved)
        self.assert_error(rep, "PR-DEMO-01 has FUTURE_WORK rows but is not listed")

    def test_status_action_rules(self):
        rows = default_rows()
        rows[0]["action"] = "IMPLEMENT"
        rows[1]["gap"] = ""
        rows[2]["action"] = "NONE"
        rows.append(row("FR-DEMO-001", sub_item="", status="DONE"))
        rep = self.run_repo(rows=rows)
        self.assert_error(rep, "a DONE row has action NONE")
        self.assert_error(rep, "an open row must say its gap")
        self.assert_error(rep, "FUTURE_WORK and action FUTURE_WORK go together")
        self.assert_error(rep, "duplicate (id, sub_item)")

    def test_main_exit_code_and_report(self):
        repo = Repo()
        self.addCleanup(repo.close)
        out = io.StringIO()
        with redirect_stdout(out):
            code = tc.main(["--root", str(repo.root), "--strict"])
        self.assertEqual(code, 0, out.getvalue())
        self.assertIn("OK: spec, matrix and code agree", out.getvalue())

    def test_repository_matrix_has_no_errors(self):
        """The real docs/spec + docs/trace/matrix.csv of this repository (pending branches allowed while listed)."""
        pending = REPO / "docs" / "trace" / "pending_branches.txt"
        rep = tc.Report()
        stats = tc.check_matrix(REPO, REPO, tc.read_allowed(str(pending) if pending.is_file() else None), rep)
        self.assertEqual(rep.errors, [])
        self.assertGreater(stats["rows"], 0)


if __name__ == "__main__":
    unittest.main()
