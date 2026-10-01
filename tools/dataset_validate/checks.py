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

import json
import re
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


EMPTY_MANIFEST_TITLES = [
    ("A1", "Acquisition record"), ("A2", "Case count by released partition"),
    ("A3", "Per-case presence of the required files"),
    ("A4", "Every NRRD loads; MRI is 3D; mask is 3D"),
    ("A5", "File format and dtype recorded per file"),
    ("A6", "Cohort shape distribution"), ("A7", "Spacing, origin and direction recorded"),
    ("A8", "MRI/mask shape and spacing compatibility"),
    ("A9", "Are masks already spatially aligned with the MRI?"),
    ("A10", "Mask unique values recorded"),
    ("A11", "laendo.nrrd verified as the LA cavity target"),
    ("A12", "Test-label presence and provenance"), ("A13", "Path A vs Path B evidence"),
    ("A14", "Axis-alignment verdict - DR-012 boundary"),
    ("A15", "Corrupted / missing / unreadable files listed"),
    ("A16", "Case IDs unique; de-identified IDs assigned"),
    ("A17", "Metadata audit against the privacy allowlist"),
    ("A18", "Licence / data-use terms preserved"),
    ("A19", "management/DATASET_AUDIT.md complete"),
    ("A20", "dataset_manifest machine-readable"),
]


def run_checks(manifest: dict) -> list[Result]:
    cases = manifest.get("cases", [])
    owner_verdicts = ((manifest.get("acquisition") or {}).get("owner_verdicts") or {})

    # An empty manifest must not produce a column of PASS. validate.py exits
    # before reaching here, but this function is the documented entry point for
    # re-running the judgement against a manifest someone else produced, and 8
    # of 20 criteria used to pass vacuously on an empty list - including "all
    # volumes across 0 cases loaded and are 3D".
    if not cases:
        return [Result(cid, title, NOT_RUN,
                       "manifest contains no cases - nothing was examined")
                for cid, title in EMPTY_MANIFEST_TITLES]

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
    out.append(_a10_mask_values(cases, owner_verdicts.get("a10_mapping")))
    out.append(Result("A11", "laendo.nrrd verified as the LA cavity target", OWNER,
                      "Requires the owner's written verdict citing specific files and values. "
                      "A script cannot establish what an annotation means."))
    out.append(_a12_test_labels(manifest))
    out.append(Result("A13", "Path A vs Path B evidence and reasoning", OWNER,
                      "This spike supplies evidence only; DR-002 / GATE-SPLIT-01 selects the "
                      "path. The manifest's partition summary is the input."))
    out.append(_a14_axis_aligned(cases))
    package_findings = manifest.get("package_findings") or []
    out.append(_a15_anomalies(cases, manifest.get("duplicate_evidence") or [],
                              package_findings))
    out.append(_a16_ids(cases))
    out.append(_a17_privacy(cases, owner_verdicts.get("a17_excluded_files") or [],
                            package_findings))
    out.append(Result("A18", "Licence / data-use terms preserved and archived", OWNER,
                      "Confirmed by the person who performed the download, against the "
                      "acquisition directory. Not derivable from the package contents."))
    out.append(Result("A19", "management/DATASET_AUDIT.md exists, covers 06 section 9.1", NOT_RUN,
                      "Produced by audit_report.py from this manifest; verify after generating it."))
    out.append(_a20_manifest(manifest))
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
    observed = manifest.get("source_package_observation")
    if isinstance(observed, dict):
        candidates = [item for item in files if isinstance(item, dict)
                      and item.get("name") == observed.get("name")]
        if len(candidates) != 1:
            return Result("A1", "Acquisition record: date, source URL, file names, checksums",
                          FAIL, "archive was hashed during scanning but acquisition.package_files "
                          "does not contain exactly one matching file name")
        claimed = candidates[0]
        mismatches = [field for field in ("size_bytes", "sha256")
                      if str(claimed.get(field, "")).lower()
                      != str(observed.get(field, "")).lower()]
        if mismatches:
            return Result("A1", "Acquisition record: date, source URL, file names, checksums",
                          FAIL, "scanned archive disagrees with acquisition record for: "
                          + ", ".join(mismatches))
        detail += "; archive size and SHA-256 independently recomputed during scan"
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
    no_mask = [c["case_id"] for c in cases if not c["files_present"][MASK]]
    # NOTE on what this can and cannot detect: discover_cases() only creates a
    # case for a directory that already contains lgemri.nrrd, so "no MRI" is
    # unreachable here by construction. Checking it would be a tautology, so it
    # is not checked and that is said out loud instead of being dressed up.
    # What A3 genuinely records is per-case MASK presence.
    detail = (f"{len(cases)} case(s) discovered by the presence of {MRI}; "
              f"{len(cases) - len(no_mask)} also carry {MASK}")
    if no_mask:
        detail += f"; {len(no_mask)} without a mask ({', '.join(no_mask[:5])})"
    detail += (". A case directory lacking " + MRI + " is not discovered at all and therefore "
               "cannot be reported here - a package whose layout differs is caught by A2.")
    # A missing mask is a recorded fact, not a failure: the test partition is
    # expected to lack labels. A12 answers that question.
    return Result("A3", f"Per-case presence of {MRI} and {MASK}", PASS, detail)


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
    return Result("A8", "MRI/mask shape, spacing, origin and direction compatibility; "
                        "resampling needed?",
                  PASS if ok or need_resample else FAIL, detail)


def _a9_alignment(cases: list[dict]) -> Result:
    """A9 asks a yes/no question, so the verdict has to depend on the answer.

    The first version computed `aligned`, printed it, and then returned PASS
    unconditionally. A package where NO mask shared its MRI origin reported
    "0 of 1 labelled case(s) share the MRI origin exactly" with an ok beside it.
    """
    title = "Are masks already spatially aligned with the MRI?"
    checked = [c for c in cases if c.get("mask") is not None]
    if not checked:
        return Result("A9", title, NOT_RUN, "no case in this package carries a mask")

    aligned, misaligned, undetermined = [], [], []
    for c in checked:
        compatibility = c.get("mri_mask_compatibility") or {}
        v = compatibility.get("resampling_required")
        (misaligned if v is True else aligned if v is False else undetermined).append(c["case_id"])

    if undetermined:
        return Result("A9", title, NOT_RUN,
                      f"{len(undetermined)} case(s) have incomplete shape/spacing/origin/"
                      f"direction evidence ({', '.join(undetermined[:5])}) - undetermined "
                      "is not aligned")
    if misaligned:
        # Not aligned is a real, recordable state - `06` section 4 asks whether
        # resampling is required - but it is not a PASS for a question asking
        # whether they ARE aligned.
        return Result("A9", title, FAIL,
                      f"{len(misaligned)} of {len(checked)} labelled case(s) do NOT share the "
                      f"MRI voxel grid (shape, spacing, origin and directions): "
                      f"{', '.join(misaligned[:5])}. A transform is required "
                      f"before use; see A8.")
    return Result("A9", title, PASS,
                  f"all {len(aligned)} labelled case(s) share the complete MRI voxel grid")


def _a10_mask_values(cases: list[dict], mapping: dict | None) -> Result:
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
        return Result("A10", "Mask unique values recorded; foreground mapping stated", FAIL,
                      detail + f"; {unreadable} unreadable or invalid mask value set(s)")
    if not isinstance(mapping, dict) or "background" not in mapping or "foreground" not in mapping:
        return Result("A10", "Mask unique values recorded; foreground mapping stated", NOT_RUN,
                      detail + "; owner foreground/background mapping is missing")
    expected = sorted([float(mapping["background"]), float(mapping["foreground"])])
    bad = []
    for c in cases:
        mask = c.get("mask")
        if mask is None:
            continue
        uv = mask.get("unique_values")
        values = uv.get("values") if isinstance(uv, dict) else None
        if not isinstance(values, list) or sorted(values) != expected:
            bad.append(c["case_id"])
    if bad:
        return Result("A10", "Mask unique values recorded; foreground mapping stated", FAIL,
                      detail + f"; {len(bad)} mask(s) do not contain exactly the owner mapping "
                      f"{expected}: {', '.join(bad[:5])}")
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


def _a15_anomalies(cases: list[dict], duplicate_evidence: list[dict] | None = None,
                   package_findings: list[dict] | None = None) -> Result:
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
    duplicates = duplicate_evidence or []
    for group in duplicates:
        problems.append(f"identical {group['file']} bytes: {', '.join(group['case_ids'])}")
    layout = package_findings or []
    for finding in layout:
        problems.append(f"{finding.get('kind')}: {finding.get('path_relative')}")
    # The criterion is that anomalies are LISTED, so finding some is not itself a
    # failure - but printing ok beside a list of corrupt files is. An anomaly is
    # surfaced as FAIL so it cannot be skimmed past.
    # A15 asks for an explicit inventory. Identical cross-case content is
    # recorded as an anomaly but, under DR-002a, the known pair is grouped in
    # train rather than silently excluded. Unreadable content remains fatal.
    fatal_layout = {
        "ORPHAN_REQUIRED_FILE", "NESTED_CASE_DIRECTORY", "DUPLICATE_CASEFOLD_PATH",
    }
    fatal = any("unreadable" in p or "non-finite" in p for p in problems) or any(
        finding.get("kind") in fatal_layout for finding in layout
    )
    status = FAIL if fatal else PASS
    return Result("A15", "Corrupted / missing / unreadable files listed", status,
                  f"{len(problems)} anomaly(ies): "
                  f"{'; '.join(problems[:6]) if problems else 'none'}"
                  + (" - exact cross-case duplicates are listed; grouping and"
                     " acceptance remain human decisions" if duplicates and not fatal else
                     " - affected cases must be excluded with a recorded reason" if fatal else ""))


def _a16_ids(cases: list[dict]) -> Result:
    ids = [c["case_id"] for c in cases]
    dupes = len(ids) - len(set(ids))
    src = [c["source_dir_relative"] for c in cases]
    src_dupes = len(src) - len(set(src))
    names = [c.get("source_dir_name") for c in cases]
    name_dupes = len(names) - len(set(names))
    malformed = [case_id for case_id in ids if not re.fullmatch(r"CASE_[0-9]{4}", case_id)]
    deterministic = ids == [f"CASE_{i:04d}" for i in range(1, len(ids) + 1)] \
        and src == sorted(src)
    if dupes or src_dupes or name_dupes or malformed or not deterministic:
        return Result("A16", "Case IDs unique; de-identified internal IDs assigned", FAIL,
                      f"{dupes} duplicate internal ID(s), {src_dupes} duplicate source path(s), "
                      f"{name_dupes} duplicate case-directory name(s), {len(malformed)} malformed "
                      f"ID(s), deterministic order={deterministic}")
    return Result("A16", "Case IDs unique; de-identified internal IDs assigned", PASS,
                  f"{len(ids)} unique CASE_NNNN IDs assigned deterministically by sorted source path")


def _a17_privacy(cases: list[dict], excluded_files: list[str] | None = None,
                 package_findings: list[dict] | None = None) -> Result:
    """A17 - metadata audit. `TASK.md:130` says "headers OR SIDECARS".

    The first version scanned only lgemri and laendo headers. This package
    ships a lawall.nrrd in all 154 cases and a stray desktop.ini inside one
    Training Set case; neither was ever opened by a check whose entire purpose
    is noticing unexpected content.
    """
    findings = []
    sidecars = []
    unchecked = 0
    for c in cases:
        vols = [("mri", c.get("mri")), ("mask", c.get("mask"))]
        vols += [(f"companion:{n}", v) for n, v in (c.get("companion_volumes") or {}).items()]
        for role, vol in vols:
            if vol is None:
                continue
            f = vol.get("header_identifier_findings")
            if isinstance(f, list):
                for item in f:
                    findings.append(f"{c['case_id']}/{role}:{item['key']}")
            else:
                unchecked += 1
        for name in (c.get("non_nrrd_sidecars") or []):
            sidecars.append(f"{c['case_id']}/{name}")
    title = "Metadata audit against the privacy allowlist"
    if findings:
        return Result("A17", title, FAIL,
                      f"{len(findings)} header key(s) matched an identifier pattern: "
                      f"{', '.join(findings[:6])}. NFR-SEC-005 requires these be reported and "
                      "excluded from the app metadata path. Values were NOT copied here.")
    # ANY unreadable header means this audit did not cover the package. The old
    # version only said NOT_RUN when NO header at all was readable, so a single
    # unreadable mask among many still printed PASS - breaking this module's own
    # rule 1 about never passing what it did not look at.
    if unchecked:
        return Result("A17", title, NOT_RUN,
                      f"{unchecked} volume(s) could not be opened, so their headers were never "
                      f"scanned. Nothing was found in the ones that were, but this audit does "
                      f"not cover the package.")
    external_files = [item.get("path_relative") for item in (package_findings or [])
                      if item.get("kind") in {
                          "FILE_OUTSIDE_CASE_DIRECTORY", "ORPHAN_REQUIRED_FILE",
                          "NESTED_FILE_IN_CASE_DIRECTORY", "NESTED_CASE_DIRECTORY",
                          "DUPLICATE_CASEFOLD_PATH",
                      }]
    sidecars.extend(path for path in external_files if path not in sidecars)
    if sidecars:
        excluded = set(excluded_files or [])
        not_excluded = [path for path in sidecars if path not in excluded]
        if not_excluded:
            return Result("A17", title, FAIL,
                          f"{len(sidecars)} non-NRRD/layout file finding(s); "
                          f"{len(not_excluded)} lack an explicit app-metadata exclusion: "
                          f"{', '.join(not_excluded[:6])}. Content was NOT read; exclude the whole "
                          f"file or clear it before it can enter the app metadata path.")
        return Result("A17", title, PASS,
                      f"{len(sidecars)} non-NRRD/layout file finding(s) reported and explicitly excluded "
                      f"from ingestion/app metadata: {', '.join(sidecars[:6])}. Raw archive remains "
                      f"untouched; sidecar content was not propagated.")
    if not any(isinstance((c.get(r) or {}).get("header_identifier_findings"), list)
               for c in cases for r in ("mri", "mask")):
        return Result("A17", title, NOT_RUN, "no header was scanned")
    n_comp = sum(len(c.get("companion_volumes") or {}) for c in cases)
    return Result("A17", title, PASS,
                  f"every readable header scanned across required files and {n_comp} companion "
                  f"volume(s); no sidecars; none matched a direct-identifier pattern")


def _a20_manifest(manifest: dict) -> Result:
    title = "data/manifests/dataset_manifest.* exists and is machine-readable"
    required = ("manifest_version", "generated_at", "generated_by", "package_root",
                "nrrd_library", "acquisition", "case_count_total", "partitions",
                "shape_distribution", "cases")
    missing = [key for key in required if key not in manifest]
    if missing:
        return Result("A20", title, FAIL,
                      "manifest is missing required fields: " + ", ".join(missing))
    cases = manifest.get("cases")
    if not isinstance(cases, list) or manifest.get("case_count_total") != len(cases):
        return Result("A20", title, FAIL,
                      "case_count_total does not equal the number of case records")
    partition_total = sum(block.get("case_count", -1)
                          for block in (manifest.get("partitions") or {}).values()
                          if isinstance(block, dict))
    if partition_total != len(cases):
        return Result("A20", title, FAIL,
                      "partition case counts do not sum to case_count_total")
    try:
        json.dumps(manifest, allow_nan=False)
    except (TypeError, ValueError) as exc:
        return Result("A20", title, FAIL, f"manifest is not strict JSON: {exc}")
    return Result("A20", title, PASS,
                  "required fields, cross-counts and strict JSON serialization validated")


# --- summary ----------------------------------------------------------------

def anomaly_counts(manifest: dict[str, Any]) -> dict[str, int]:
    """Count the same anomaly classes inventoried by A15 and the audit renderer."""
    unreadable_or_non_finite = sum(
        1 for case in manifest.get("cases") or []
        for role in ("mri", "mask")
        for volume in [case.get(role)]
        if isinstance(volume, dict) and
        (not volume.get("read_ok") or volume.get("has_non_finite") is True)
    )
    duplicates = len(manifest.get("duplicate_evidence") or [])
    package_findings = len(manifest.get("package_findings") or [])
    return {
        "anomalies": unreadable_or_non_finite + duplicates + package_findings,
        "duplicate_evidence_groups": duplicates,
        "package_findings": package_findings,
    }


def summarise(results: list[Result], owner_verdicts: dict[str, Any] | None = None,
              manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    counts = {PASS: 0, FAIL: 0, NOT_RUN: 0, OWNER: 0}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
    owner_verdicts = owner_verdicts or {}
    required_owner_fields = (
        "a11_label_semantics",
        "a13_split_evidence",
        "a18_terms",
    )
    confirmed = sum(bool(str(owner_verdicts.get(field, "")).strip())
                    for field in required_owner_fields)
    return {
        **(anomaly_counts(manifest) if manifest is not None else {}),
        "pass": counts[PASS],
        "fail": counts[FAIL],
        "not_run": counts[NOT_RUN],
        "owner_verdict_required": counts[OWNER],
        # The old `gate_data_01_ready` required owner_verdict_required == 0, but
        # A11/A13/A18 are unconditionally OWNER and A19 unconditionally NOT_RUN,
        # so it was structurally always False and carried no information.
        # What a script CAN state is the machine-checkable half.
        "machine_checks_clean": counts[FAIL] == 0 and counts[NOT_RUN] == 0,
        "owner_verdicts_confirmed": confirmed,
        "owner_verdicts_outstanding": max(0, counts[OWNER] - confirmed),
        "note": "machine_checks_clean covers only what a script can decide. GATE-DATA-01 also "
                "needs the owner verdicts (A11, A13, A18), the rendered audit (A19), and the "
                "four-step acceptance workflow. No script closes that gate.",
    }
