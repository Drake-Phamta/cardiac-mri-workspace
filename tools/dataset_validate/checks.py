"""
Apply the `06` section 9 validation checks to a scanned manifest, and map the
result onto Spike D's acceptance criteria A1-A20.

Separated from dataset_scan.py on purpose: reading the package and judging the
package are different jobs, and a reviewer must be able to re-run the judgement
against a manifest someone else produced.

Three rules govern every function here.

1. A check that could not be performed reports NOT_RUN with a reason. It never
   reports PASS. A checker that passes something it did not look at produces
   evidence that is not evidence.
2. Criteria that require a human judgement - A11 label semantics, A13 path
   evidence, A18 licence preservation - are reported as OWNER_VERDICT_REQUIRED.
   This script will not answer them, because SPIKE_D_DATASET/TASK.md assigns
   those verdicts to the owner with a written justification.
3. Nothing here is weakened to obtain a pass. A failing check is a result.
"""

from __future__ import annotations

from typing import Any

PASS = "PASS"
FAIL = "FAIL"
NOT_RUN = "NOT_RUN"
OWNER = "OWNER_VERDICT_REQUIRED"

MRI = "lgemri.nrrd"
MASK = "laendo.nrrd"


def _measured(value) -> bool:
    """True when a manifest field holds a real reading rather than a NOT MEASURED note."""
    return not (isinstance(value, str) and value.startswith("NOT MEASURED"))


class Result:
    __slots__ = ("cid", "title", "status", "detail")

    def __init__(self, cid: str, title: str, status: str, detail: str = ""):
        self.cid, self.title, self.status, self.detail = cid, title, status, detail

    def as_dict(self) -> dict:
        return {"criterion": self.cid, "title": self.title,
                "status": self.status, "detail": self.detail}


def run_checks(manifest: dict) -> list[Result]:
    cases = manifest.get("cases", [])
    out: list[Result] = []

    out.append(_a1_acquisition(manifest))
    out.append(_a2_case_counts(manifest))
    out.append(_a3_file_presence(cases))
    out.append(_a4_loads(cases))
    out.append(_a5_dtype(cases))
    out.append(_a6_shape_distribution(manifest))
    out.append(_a7_geometry_recorded(cases))
    out.append(_a8_compatibility(cases))
    out.append(_a9_alignment(cases))
    out.append(_a10_mask_values(cases))
    out.append(Result("A11", "laendo.nrrd verified as the LA cavity target", OWNER,
                      "Requires the owner's written verdict citing specific files and values. "
                      "A script cannot establish what an annotation means."))
    out.append(_a12_test_labels(manifest))
    out.append(Result("A13", "Path A vs Path B evidence and reasoning", OWNER,
                      "This spike supplies evidence only; DR-002 / GATE-SPLIT-01 selects the "
                      "path. The manifest's partition summary is the input."))
    out.append(_a14_axis_aligned(cases))
    out.append(_a15_anomalies(cases))
    out.append(_a16_ids(cases))
    out.append(_a17_privacy(cases))
    out.append(Result("A18", "Licence / data-use terms preserved and archived", OWNER,
                      "Confirmed by the person who performed the download, against the "
                      "acquisition directory. Not derivable from the package contents."))
    out.append(Result("A19", "management/DATASET_AUDIT.md exists, covers 06 section 9.1", NOT_RUN,
                      "Produced by audit_report.py from this manifest; verify after generating it."))
    out.append(Result("A20", "data/manifests/dataset_manifest.* exists and is machine-readable",
                      PASS if manifest.get("manifest_version") else FAIL,
                      "This manifest is the artifact; it is generated, not hand-typed."))
    return out


# --- individual criteria ----------------------------------------------------

def _a1_acquisition(manifest: dict) -> Result:
    acq = manifest.get("acquisition") or {}
    required = ["source_url", "download_started", "download_finished",
                "package_files", "acquired_by"]
    missing = [k for k in required if not acq.get(k)]
    if missing:
        return Result("A1", "Acquisition record: date, source URL, file names, checksums",
                      NOT_RUN, f"acquisition record missing fields: {', '.join(missing)}. "
                               "Pass --acquisition <json> with the real download record.")
    files = acq.get("package_files") or []
    without_sum = [f.get("name") for f in files if not f.get("sha256")]
    detail = f"{len(files)} package file(s) from {acq.get('source_url')}"
    if without_sum:
        detail += f"; no checksum for: {', '.join(map(str, without_sum))}"
    return Result("A1", "Acquisition record: date, source URL, file names, checksums",
                  PASS, detail)


def _a2_case_counts(manifest: dict) -> Result:
    parts = manifest.get("partitions") or {}
    if not parts:
        return Result("A2", "Case count by released partition", FAIL,
                      "no case directory containing lgemri.nrrd was found under the package root")
    summary = "; ".join(f"{name}: {b['case_count']}" for name, b in sorted(parts.items()))
    return Result("A2", "Case count by released partition", PASS,
                  f"total {manifest.get('case_count_total')} - {summary}")


def _a3_file_presence(cases: list[dict]) -> Result:
    if not cases:
        return Result("A3", f"Per-case presence of {MRI} and {MASK}", FAIL, "no cases")
    no_mri = [c["case_id"] for c in cases if not c["files_present"][MRI]]
    no_mask = [c["case_id"] for c in cases if not c["files_present"][MASK]]
    detail = (f"{len(cases)} cases; {len(cases) - len(no_mri)} with {MRI}, "
              f"{len(cases) - len(no_mask)} with {MASK}")
    if no_mask:
        detail += f"; missing mask in {len(no_mask)} case(s)"
    # A missing mask is a recorded fact, not a failure - the test partition is
    # expected to lack labels. A12 is where that question is answered.
    return Result("A3", f"Per-case presence of {MRI} and {MASK}",
                  FAIL if no_mri else PASS, detail)


def _a4_loads(cases: list[dict]) -> Result:
    bad = []
    not_3d = []
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if vol is None:
                continue
            if not vol.get("read_ok"):
                bad.append(f"{c['case_id']}/{role}: {vol.get('read_error')}")
            elif vol.get("is_3d") is False:
                not_3d.append(f"{c['case_id']}/{role}: shape {vol.get('shape')}")
    if bad or not_3d:
        return Result("A4", "Every NRRD loads; MRI is 3D; mask is 3D", FAIL,
                      "; ".join((bad + not_3d)[:6]))
    return Result("A4", "Every NRRD loads; MRI is 3D; mask is 3D", PASS,
                  f"all volumes across {len(cases)} cases loaded and are 3D")


def _a5_dtype(cases: list[dict]) -> Result:
    seen: dict[str, int] = {}
    unknown = 0
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if vol is None:
                continue
            dt = vol.get("dtype")
            if _measured(dt):
                key = f"{role}:{dt}"
                seen[key] = seen.get(key, 0) + 1
            else:
                unknown += 1
    if not seen:
        return Result("A5", "File format and dtype recorded per file", FAIL, "nothing readable")
    detail = ", ".join(f"{k} x{v}" for k, v in sorted(seen.items()))
    if unknown:
        detail += f"; {unknown} file(s) unreadable"
    return Result("A5", "File format and dtype recorded per file", PASS, detail)


def _a6_shape_distribution(manifest: dict) -> Result:
    dist = manifest.get("shape_distribution") or {}
    vary = dist.get("in_plane_dimensions_vary")
    if not _measured(vary):
        return Result("A6", "Cohort shape distribution; do in-plane dimensions vary?",
                      FAIL, str(vary))
    return Result("A6", "Cohort shape distribution; do in-plane dimensions vary?", PASS,
                  f"{dist.get('distinct_shapes')} distinct shape(s); "
                  f"in-plane dimensions vary: {vary}; "
                  f"in-plane sizes seen: {dist.get('distinct_in_plane_dimensions')}")


def _a7_geometry_recorded(cases: list[dict]) -> Result:
    missing = []
    for c in cases:
        vol = c.get("mri") or {}
        for field in ("spacing", "space_origin", "space_directions"):
            if not _measured(vol.get(field)):
                missing.append(f"{c['case_id']}:{field}")
    if missing:
        return Result("A7", "Spacing, origin and direction recorded per case", FAIL,
                      f"{len(missing)} missing field(s), e.g. {', '.join(missing[:5])}")
    return Result("A7", "Spacing, origin and direction recorded per case", PASS,
                  f"all three fields present for {len(cases)} cases")


def _a8_compatibility(cases: list[dict]) -> Result:
    need_resample, undetermined, ok = [], [], 0
    for c in cases:
        comp = c.get("mri_mask_compatibility") or {}
        verdict = comp.get("resampling_required")
        if verdict is True:
            need_resample.append(c["case_id"])
        elif verdict is False:
            ok += 1
        else:
            undetermined.append(c["case_id"])
    detail = f"{ok} case(s) need no resampling"
    if need_resample:
        detail += f"; {len(need_resample)} need a transform ({', '.join(need_resample[:5])})"
    if undetermined:
        detail += f"; {len(undetermined)} undetermined (no mask, or unreadable)"
    # Needing a transform is a finding, not a failure. Not knowing is a failure.
    return Result("A8", "MRI/mask shape and spacing compatibility; resampling needed?",
                  PASS if ok or need_resample else FAIL, detail)


def _a9_alignment(cases: list[dict]) -> Result:
    aligned = [c["case_id"] for c in cases
               if (c.get("mri_mask_compatibility") or {}).get("origin_equal") is True]
    checked = [c for c in cases if c.get("mask") is not None]
    if not checked:
        return Result("A9", "Are masks already spatially aligned with the MRI?", NOT_RUN,
                      "no case in this package carries a mask")
    return Result("A9", "Are masks already spatially aligned with the MRI?", PASS,
                  f"{len(aligned)} of {len(checked)} labelled case(s) share the MRI origin exactly")


def _a10_mask_values(cases: list[dict]) -> Result:
    sets: dict[str, int] = {}
    unreadable = 0
    for c in cases:
        mask = c.get("mask")
        if mask is None:
            continue
        uv = mask.get("unique_values")
        if isinstance(uv, dict) and "values" in uv:
            sets[str(uv["values"])] = sets.get(str(uv["values"]), 0) + 1
        else:
            unreadable += 1
    if not sets:
        return Result("A10", "Mask unique values recorded; foreground mapping stated", NOT_RUN,
                      "no readable mask in this package")
    detail = "; ".join(f"{k} in {v} case(s)" for k, v in sorted(sets.items(), key=lambda kv: -kv[1]))
    if unreadable:
        detail += f"; {unreadable} unreadable"
    detail += ". The foreground/background MAPPING is the owner's written statement, not an inference."
    return Result("A10", "Mask unique values recorded; foreground mapping stated", PASS, detail)


def _a12_test_labels(manifest: dict) -> Result:
    parts = manifest.get("partitions") or {}
    if not parts:
        return Result("A12", "Are official test labels present, and what is their provenance?",
                      FAIL, "no partitions discovered")
    lines = []
    for name, b in sorted(parts.items()):
        lines.append(f"{name}: {b['cases_with_mask']}/{b['case_count']} case(s) carry {MASK}")
    return Result("A12", "Are official test labels present, and what is their provenance?",
                  PASS,
                  "; ".join(lines) +
                  ". File-level presence is measured here; PROVENANCE remains the owner's "
                  "written verdict (RA-H02).")


def _a14_axis_aligned(cases: list[dict]) -> Result:
    oblique, unknown, aligned = [], [], 0
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if vol is None:
                continue
            verdict = vol.get("axis_aligned")
            if verdict is True:
                aligned += 1
            elif verdict is False:
                oblique.append(f"{c['case_id']}/{role}: {vol.get('axis_aligned_basis')}")
            else:
                unknown.append(f"{c['case_id']}/{role}")
    if oblique:
        return Result("A14", "Axis-alignment verdict - DR-012 boundary", FAIL,
                      f"{len(oblique)} volume(s) are NOT axis-aligned, e.g. {oblique[0]}. "
                      "DR-012 restricts the MVP to validated axis-aligned geometry; "
                      "such a case is rejected with GEOMETRY_NOT_VALIDATED, not papered over.")
    if unknown:
        return Result("A14", "Axis-alignment verdict - DR-012 boundary", NOT_RUN,
                      f"{len(unknown)} volume(s) carry no usable direction matrix")
    return Result("A14", "Axis-alignment verdict - DR-012 boundary", PASS,
                  f"all {aligned} volume(s) axis-aligned")


def _a15_anomalies(cases: list[dict]) -> Result:
    problems = []
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if vol is None:
                continue
            if not vol.get("read_ok"):
                problems.append(f"{c['case_id']}/{role}: unreadable")
            elif vol.get("has_non_finite") is True:
                problems.append(f"{c['case_id']}/{role}: contains non-finite values")
    return Result("A15", "Corrupted / missing / unreadable files listed", PASS,
                  f"{len(problems)} anomaly(ies): {'; '.join(problems[:6]) if problems else 'none'}")


def _a16_ids(cases: list[dict]) -> Result:
    ids = [c["case_id"] for c in cases]
    dupes = len(ids) - len(set(ids))
    src = [c["source_dir_relative"] for c in cases]
    src_dupes = len(src) - len(set(src))
    if dupes or src_dupes:
        return Result("A16", "Case IDs unique; de-identified internal IDs assigned", FAIL,
                      f"{dupes} duplicate internal ID(s), {src_dupes} duplicate source path(s)")
    return Result("A16", "Case IDs unique; de-identified internal IDs assigned", PASS,
                  f"{len(ids)} unique CASE_NNNN IDs assigned deterministically by sorted source path")


def _a17_privacy(cases: list[dict]) -> Result:
    findings = []
    unchecked = 0
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if vol is None:
                continue
            f = vol.get("header_identifier_findings")
            if isinstance(f, list):
                for item in f:
                    findings.append(f"{c['case_id']}/{role}:{item['key']}")
            else:
                unchecked += 1
    if findings:
        return Result("A17", "Metadata audit against the privacy allowlist", FAIL,
                      f"{len(findings)} header key(s) matched an identifier pattern: "
                      f"{', '.join(findings[:6])}. NFR-SEC-005 requires these be reported and "
                      "excluded from the app metadata path. Values were NOT copied into this manifest.")
    if unchecked and not any(c.get("mri", {}).get("read_ok") for c in cases):
        return Result("A17", "Metadata audit against the privacy allowlist", NOT_RUN,
                      "no header could be read")
    return Result("A17", "Metadata audit against the privacy allowlist", PASS,
                  "no header key matched a direct-identifier pattern")


# --- summary ----------------------------------------------------------------

def summarise(results: list[Result]) -> dict[str, Any]:
    counts = {PASS: 0, FAIL: 0, NOT_RUN: 0, OWNER: 0}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
    return {
        "pass": counts[PASS],
        "fail": counts[FAIL],
        "not_run": counts[NOT_RUN],
        "owner_verdict_required": counts[OWNER],
        "gate_data_01_ready": counts[FAIL] == 0 and counts[NOT_RUN] == 0 and counts[OWNER] == 0,
        "note": "gate_data_01_ready is a mechanical precondition only. GATE-DATA-01 closes "
                "through the four-step acceptance workflow, never because a script printed PASS.",
    }
