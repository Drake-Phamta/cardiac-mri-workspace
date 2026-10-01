# -*- coding: utf-8 -*-
"""
Adversarial pass over PR #45's API Contract 11 validator.

Every attack starts from the contract.json the author shipped and changes exactly
one thing. It also runs the cross-contract check that belongs to the leader's
Integration / Cross-contract block under DR-013: does the geometry version this
API contract declares agree with the one PR #43's canonical fixture declares?
"""
import copy, json, io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from validate_api_contract import validate_contract, ContractError

base = json.load(io.open(os.path.join(HERE, "contract.json"), encoding="utf-8"))
try:
    import jsonschema
    SCHEMA = json.load(io.open(os.path.join(HERE, "schema.json"), encoding="utf-8"))
except Exception:
    jsonschema = None


def ep(c, eid):
    return [e for e in c["endpoints"] if e["id"] == eid][0]


def attempt(name, mut, expect):
    c = copy.deepcopy(base)
    mut(c)
    try:
        validate_contract(c)
        v = "ACCEPTED"
    except ContractError as e:
        v = "refused:" + e.code
    except Exception as e:
        v = "CRASH:" + type(e).__name__
    s = "-"
    if jsonschema:
        errs = list(jsonschema.Draft202012Validator(SCHEMA).iter_errors(c))
        s = "rejects" if errs else "accepts"
    bad = (expect == "refuse" and (v == "ACCEPTED" or v.startswith("CRASH"))) or (expect == "accept" and v != "ACCEPTED")
    print("%-62s %-34s schema=%-8s %s" % (name[:62], v[:34], s, "<-- LANDS" if bad else ""))
    return bad


rows = []
rows.append(attempt("CONTROL: contract as shipped", lambda c: None, "accept"))

# --- cross-contract: the geometry version -------------------------------
rows.append(attempt("geometry.version = 'dr008a-dr012/v1.0.0' (what #43 declares)",
                    lambda c: c["geometry_contract"].__setitem__("version", "dr008a-dr012/v1.0.0"), "accept"))
rows.append(attempt("geometry.version = null",
                    lambda c: c["geometry_contract"].__setitem__("version", None), "refuse"))
rows.append(attempt("geometry.version = 'GEOM_' (prefix only, no version)",
                    lambda c: c["geometry_contract"].__setitem__("version", "GEOM_"), "refuse"))

# --- per-endpoint error obligations the validator does not enforce -------
rows.append(attempt("mri_slice_get: drop SLICE_OUT_OF_RANGE",
                    lambda c: ep(c, "mri_slice_get")["errors"].remove("SLICE_OUT_OF_RANGE"), "refuse"))
rows.append(attempt("geometry_get: drop GEOMETRY_NOT_VALIDATED",
                    lambda c: ep(c, "geometry_get")["errors"].remove("GEOMETRY_NOT_VALIDATED"), "refuse"))
rows.append(attempt("case_get: drop CASE_NOT_FOUND",
                    lambda c: ep(c, "case_get")["errors"].remove("CASE_NOT_FOUND"), "refuse"))
rows.append(attempt("analysis_run_create: method GET instead of POST",
                    lambda c: ep(c, "analysis_run_create").__setitem__("method", "GET"), "refuse"))
rows.append(attempt("review_patch: path changed to /api/v2/...",
                    lambda c: ep(c, "review_patch").__setitem__("path", "/api/v2/reviews/{review_id}"), "refuse"))
rows.append(attempt("working_mask_put: drop geometry_contract_version from request",
                    lambda c: ep(c, "working_mask_put")["request_fields"].remove("geometry_contract_version"), "refuse"))
rows.append(attempt("error http_status: STALE_REVISION 409 -> 200",
                    lambda c: [e for e in c["errors"] if e["code"] == "STALE_REVISION"][0].__setitem__("http_status", 200), "refuse"))

# --- type robustness ----------------------------------------------------
rows.append(attempt("an endpoint's errors = 'UNAUTHORIZED' (string, not list)",
                    lambda c: ep(c, "study_get").__setitem__("errors", "UNAUTHORIZED"), "refuse"))
rows.append(attempt("artifact_rules = null",
                    lambda c: c.__setitem__("artifact_rules", None), "refuse"))

# --- spec says 'Core codes include' -------------------------------------
rows.append(attempt("add a 16th error code RATE_LIMITED (spec: 'core codes INCLUDE')",
                    lambda c: c["errors"].append({"code": "RATE_LIMITED", "http_status": 429, "message_template": "x"}),
                    "accept"))

# --- the controls that must be refused ----------------------------------
rows.append(attempt("CONTROL: review_commit revision_required = false",
                    lambda c: ep(c, "review_commit").__setitem__("revision_required", False), "refuse"))
rows.append(attempt("CONTROL: ground_truth_slice_get -> ZERO_PLACEHOLDER",
                    lambda c: ep(c, "ground_truth_slice_get").__setitem__("ground_truth_behavior", "ZERO_PLACEHOLDER"), "refuse"))
rows.append(attempt("CONTROL: last_write_wins_allowed = true",
                    lambda c: c["revision_rules"].__setitem__("last_write_wins_allowed", True), "refuse"))
print("-" * 120)
print("landed:", sum(rows), "| jsonschema available:", bool(jsonschema))
