# -*- coding: utf-8 -*-
"""
Adversarial pass over PR #39's Contract 2 validator.

Reuses the author's own make_manifest() so every attack starts from a manifest
HE considers valid, then changes exactly one thing. An attack "lands" when the
validator accepts something it should refuse, or crashes instead of failing
cleanly with a code.
"""
import copy, json, sys, tempfile, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import test_contract2 as T
from validate_contract2 import validate_manifest, ContractError

RESULTS = []

def attack(name, mutate, expect):
    """expect = 'REFUSE' (some ContractError) or a specific code."""
    root = Path(tempfile.mkdtemp())
    m = T.make_manifest(root)
    try:
        mutate(m, root)
    except Exception as e:
        RESULTS.append((name, "SETUP-ERROR", repr(e), expect)); return
    try:
        out = validate_manifest(copy.deepcopy(m), root)
        RESULTS.append((name, "ACCEPTED", out.get("status"), expect))
    except ContractError as e:
        RESULTS.append((name, "refused", e.code, expect))
    except Exception as e:
        RESULTS.append((name, "CRASHED", type(e).__name__ + ": " + str(e)[:60], expect))

# --- 1. gates are self-declared -------------------------------------------
# Both gates are OPEN in reality today. Nothing cross-checks the claim.
attack("gates self-declared ACCEPTED while really open",
       lambda m, r: None, "REFUSE (cannot: nothing to check against)")

# --- 2. boolean passes the numeric training_fraction check ----------------
attack("training_fraction = true (bool passes `in {0.25,0.5,1.0}`)",
       lambda m, r: m["experiment"].__setitem__("training_fraction", True), "REFUSE")

# --- 3. artifact kind is never validated against an allowed set -----------
def mutate_kind(m, r):
    for a in m["artifacts"]:
        if a["kind"] not in {"METRICS_SUMMARY", "PER_CASE_METRICS", "PER_SLICE_METRICS",
                             "RAW_PREDICTION_MASK", "PROCESSED_PREDICTION_MASK",
                             "RECONSTRUCTION_3D", "METRIC_SET"}:
            continue
    # add a brand-new artifact with a nonsense kind
    base = [a for a in m["artifacts"] if a["kind"] == "METRICS_SUMMARY"][0]
    extra = copy.deepcopy(base)
    extra["artifact_id"] = "ART_nonsense"
    extra["artifact_uri"] = "artifact://nonsense/thing"
    extra["kind"] = "TOTALLY_MADE_UP_KIND"
    m["artifacts"].append(extra)
attack("artifact kind = 'TOTALLY_MADE_UP_KIND'", mutate_kind, "REFUSE")

# --- 4. media_type is required but never type-checked ---------------------
def mutate_media(m, r):
    m["artifacts"][0]["media_type"] = 12345
attack("media_type = 12345 (an integer)", mutate_media, "REFUSE")

# --- 5. null list crashes instead of failing cleanly ----------------------
def mutate_null_list(m, r):
    m["analysis_runs"][0]["metric_set_ids"] = None
attack("analysis_runs[0].metric_set_ids = null", mutate_null_list, "REFUSE cleanly")

def mutate_null_recon(m, r):
    m["analysis_runs"][0]["reconstruction_ids"] = None
attack("analysis_runs[0].reconstruction_ids = null", mutate_null_recon, "REFUSE cleanly")

# --- 6. evaluation population count is self-declared ----------------------
def mutate_pop(m, r):
    # claim 54, but the referenced manifest file is whatever it is - nothing reads it
    m["experiment"]["evaluation_population_manifest"]["case_count"] = 54
    m["experiment"]["num_test_cases"] = 54
attack("num_test_cases=54 claimed; referenced manifest content never read",
       mutate_pop, "REFUSE (cannot: content not parsed)")

# --- 7. artifact_uri normalisation --------------------------------------
def mutate_uri_dots(m, r):
    a = m["artifacts"][0]
    a["artifact_uri"] = a["artifact_uri"].replace("artifact://", "artifact://x/../")
attack("artifact_uri contains '/../' (two URIs can alias one identity)",
       mutate_uri_dots, "REFUSE")

# --- 8. control: a genuinely bad checksum must be caught -----------------
def mutate_checksum(m, r):
    m["artifacts"][0]["checksum"]["value"] = "0" * 64
attack("CONTROL: wrong checksum must be caught", mutate_checksum, "CHECKSUM_MISMATCH")

# --- 9. control: path traversal must be caught ---------------------------
def mutate_traversal(m, r):
    m["artifacts"][0]["source_path"] = "../../etc/passwd"
attack("CONTROL: traversal must be caught", mutate_traversal, "SCHEMA_INVALID")

# --- 10. control: gate not accepted must be caught -----------------------
def mutate_gate(m, r):
    m["gates"]["gate_ml_01"] = "OPEN"
attack("CONTROL: gate_ml_01=OPEN must be caught", mutate_gate, "GATE_ML_01_NOT_ACCEPTED")

print("=" * 100)
print("%-58s %-10s %-28s" % ("ATTACK", "OUTCOME", "CODE / DETAIL"))
print("=" * 100)
landed = 0
for name, outcome, detail, expect in RESULTS:
    flag = ""
    if outcome in ("ACCEPTED", "CRASHED") and not expect.startswith("REFUSE (cannot"):
        flag = "  <-- LANDS"; landed += 1
    elif outcome == "ACCEPTED" and expect.startswith("REFUSE (cannot"):
        flag = "  <-- structural gap"
    print("%-58s %-10s %-28s%s" % (name[:58], outcome, str(detail)[:28], flag))
print("=" * 100)
print("attacks that landed (accepted or crashed when they should refuse): %d" % landed)
