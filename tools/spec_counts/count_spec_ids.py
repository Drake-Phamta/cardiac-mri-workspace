"""Count the identifiers defined by the FROZEN specification, mechanically.

Read-only. It never writes to docs/specs/v1.0 and never edits anything: it opens the frozen
files, extracts ids and prints counts. Run it from the repository root:

    python tools/spec_counts/count_spec_ids.py

Why this exists: the management documents carried 39 product requirements / 28 MUST /
69 acceptance tests from 2026-09-08 until 2026-09-16. Those figures came from id patterns that
were too narrow, and the frozen spec was correct all along. See
management/readiness/ERRATUM_COUNTS_2026_09_16.md.

Two rules learned the hard way, both encoded below:
  - a prefix may contain a DIGIT            -> PR-3D-01
  - a prefix may have SEVERAL segments      -> PR-MODEL-EXTRA-01, TC-MOBILE-STATE-001
A pattern that forbids either silently undercounts, and an undercounted MUST floor is a
de-scope nobody decided.
"""

import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

SPEC = "docs/specs/v1.0/"
PRD = SPEC + "03_PRODUCT_REQUIREMENTS_PRD.md"
TESTS = SPEC + "13_TEST_ACCEPTANCE_AND_TRACEABILITY.md"
FNSPEC = SPEC + "04_FUNCTIONAL_AND_NONFUNCTIONAL_SPEC.md"
USECASES = SPEC + "02_USER_AND_USE_CASE_MODEL.md"
SCREENS = SPEC + "10_MOBILE_UX_AND_INTERACTION_SPEC.md"

PR_ANY = re.compile(r"\bPR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}\b")
# Each product requirement is DEFINED by a bold heading: **PR-STUDY-01 — MUST**
PR_DEF = re.compile(r"^\*\*(PR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2})\s*[—-]\s*(MUST|SHOULD|COULD)\*\*", re.M)
TC_ANY = re.compile(r"\bTC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}\b")
FR_NFR = re.compile(r"\b(?:FR|NFR)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}\b")
UC_ANY = re.compile(r"\bUC-\d{2}\b")
SCR_ANY = re.compile(r"\bSCR-\d{2}\b")

EXPECTED = {"product_requirements": 44, "must": 33, "should": 6, "could": 5,
            "acceptance_tests": 70, "fr_plus_nfr": 79, "use_cases": 17, "screens": 9}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main() -> int:
    prd = read(PRD)
    defined = PR_DEF.findall(prd)
    by_id = dict(defined)
    if len(by_id) != len(defined):
        print("FAIL: a product-requirement id is defined twice")
        return 2
    referenced = set(PR_ANY.findall(prd))
    orphans = sorted(referenced - set(by_id))
    prio = Counter(by_id.values())

    got = {
        "product_requirements": len(by_id),
        "must": prio["MUST"],
        "should": prio["SHOULD"],
        "could": prio["COULD"],
        "acceptance_tests": len(set(TC_ANY.findall(read(TESTS)))),
        "fr_plus_nfr": len(set(FR_NFR.findall(read(FNSPEC)))),
        "use_cases": len(set(UC_ANY.findall(read(USECASES)))),
        "screens": len(set(SCR_ANY.findall(read(SCREENS)))),
    }

    width = max(len(k) for k in got)
    for k, v in got.items():
        flag = "ok " if v == EXPECTED[k] else "!! "
        print(f"  {flag}{k:<{width}} {v:>4}   (expected {EXPECTED[k]})")
    print(f"\n  product-requirement ids referenced in 03: {len(referenced)}; defined: {len(by_id)}; "
          f"referenced but never defined: {orphans or 'none'}")

    bad = {k: (got[k], EXPECTED[k]) for k in EXPECTED if got[k] != EXPECTED[k]}
    if bad or orphans:
        print("\nMISMATCH - do not publish a count until this is understood:", bad, orphans)
        return 1
    print("\nAll counts match management/readiness/ERRATUM_COUNTS_2026_09_16.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
