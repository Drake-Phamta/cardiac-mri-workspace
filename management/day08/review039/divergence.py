# -*- coding: utf-8 -*-
"""
Does schema.json catch what validate_contract2.py misses?

If it does, the finding is not "the validator is weak" but "the two artifacts in
this PR enforce different contracts, and the validator - the acceptance tool -
never loads the schema". Whichever one an ingestion path calls decides what is
actually enforced.
"""
import copy, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import json
import test_contract2 as T
from validate_contract2 import validate_manifest, ContractError

try:
    import jsonschema
except ImportError:
    print("jsonschema not installed; installing is not my call. Falling back to a")
    print("minimal enum/type check for exactly the fields under test.")
    jsonschema = None

SCHEMA = json.load(open(Path(__file__).parent / "schema.json", encoding="utf-8"))


def schema_ok(m):
    if jsonschema:
        v = jsonschema.Draft202012Validator(SCHEMA)
        errs = sorted(v.iter_errors(m), key=lambda e: e.path)
        return (not errs), (errs[0].message[:70] if errs else "")
    # fallback: check only the three fields this script is about
    kinds = set(SCHEMA["$defs"]["artifact"]["properties"]["kind"]["enum"])
    for a in m.get("artifacts", []):
        if a.get("kind") not in kinds:
            return False, "kind not in enum"
        mt = a.get("media_type")
        if not isinstance(mt, str) or not mt:
            return False, "media_type not a non-empty string"
    tf = m.get("experiment", {}).get("training_fraction")
    # JSON Schema enum equality is JSON equality: true is not 1.0
    if isinstance(tf, bool) or tf not in (0.25, 0.5, 1.0):
        return False, "training_fraction not in enum"
    for r in m.get("analysis_runs", []):
        for f in ("metric_set_ids", "reconstruction_ids"):
            if f in r and not isinstance(r[f], list):
                return False, f + " is not an array"
    return True, ""


def validator_ok(m, root):
    try:
        validate_manifest(copy.deepcopy(m), root)
        return True, "PASS"
    except ContractError as e:
        return False, e.code
    except Exception as e:
        return False, "CRASH:" + type(e).__name__


CASES = [
    ("training_fraction = true",
     lambda m: m["experiment"].__setitem__("training_fraction", True)),
    ("artifact kind = 'TOTALLY_MADE_UP_KIND'",
     lambda m: [a for a in m["artifacts"] if a["kind"] == "METRICS_SUMMARY"][0]
     .__setitem__("kind", "TOTALLY_MADE_UP_KIND")),
    ("media_type = 12345",
     lambda m: m["artifacts"][0].__setitem__("media_type", 12345)),
    ("metric_set_ids = null",
     lambda m: m["analysis_runs"][0].__setitem__("metric_set_ids", None)),
    ("reconstruction_ids = null",
     lambda m: m["analysis_runs"][0].__setitem__("reconstruction_ids", None)),
]

print("jsonschema available:", bool(jsonschema))
print()
print("%-38s  %-22s  %-22s" % ("mutation", "schema.json", "validate_contract2.py"))
print("-" * 88)
diverge = 0
for name, mut in CASES:
    root = Path(tempfile.mkdtemp())
    m = T.make_manifest(root)
    mut(m)
    s_ok, s_why = schema_ok(m)
    v_ok, v_why = validator_ok(m, root)
    mark = ""
    if s_ok != v_ok:
        mark = "   <-- DIVERGE"; diverge += 1
    print("%-38s  %-22s  %-22s%s" % (
        name[:38],
        ("accepts" if s_ok else "REJECTS (%s)" % s_why[:12]),
        ("accepts" if v_ok else "rejects (%s)" % v_why[:12]),
        mark))
print("-" * 88)
print("cases where the two artifacts disagree: %d / %d" % (diverge, len(CASES)))
print()
print("validate_contract2.py loads schema.json:",
      "schema" in Path(Path(__file__).parent / "validate_contract2.py").read_text(encoding="utf-8"))
