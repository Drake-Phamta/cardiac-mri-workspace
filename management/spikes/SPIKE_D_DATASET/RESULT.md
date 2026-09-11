# SPIKE_D — RESULT

**Owner:** Bế Quốc Khánh  
**Reviewer:** Vũ Hùng Anh  
**Execution date:** 2026-09-11  
**Evidence status:** Evidence collected; not yet `ACCEPTED`.  

## Verdict

The official `2018_UTAH_MICCAI.zip` package is usable for the core MRI/LA-mask audit:

- 100 training cases and 54 testing cases were found.
- All 154 cases contain readable `lgemri.nrrd` and `laendo.nrrd` files.
- All 308 core files were validated directly from the ZIP stream.
- All files are 3D, `unsigned char`, raw encoded, and axis-aligned.
- MRI/mask shapes, spacing, direction and origin match in all 154 cases.
- Every mask has values `{0,255}`.
- No direct-identifier fields were detected in inspected NRRD headers.

## Gate-relevant findings

1. `laendo.nrrd` is present in all 54 testing case directories. This is file-level package evidence.
2. The official web page contains contradictory descriptions of testing-label availability. The audit
   records the contradiction and does **not** choose Path A or Path B.
3. `GATE-DATA-01` and `GATE-SPLIT-01` remain leader/reviewer decisions.
4. No license/terms file was embedded in the downloaded archive. Official CAP policy PDFs were archived
   outside Git with SHA-256 hashes; the applicable study-specific DDA still needs confirmation.

## Evidence index

- Human-readable audit: `management/DATASET_AUDIT.md`
- Machine-readable manifest: `data/manifests/dataset_manifest.json`
- Re-runnable validator: `tools/dataset_validate/validate_zip.py`
- External raw archive: `D:\cardiac-mri-workspace-data\lasc2018\2018_UTAH_MICCAI.zip`
- External policy archive: `D:\cardiac-mri-workspace-data\lasc2018\official_terms\`
- Archive SHA-256: `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0`

## Review request

Please review especially:

- A11: `laendo.nrrd` target semantics;
- A12/A13: test-label provenance and Path A/B evidence;
- A14: axis-alignment verdict;
- A18: CAP policy archive and the applicable study-specific DDA.

This result does not transition the central spike state. Project Control must perform the reviewer,
QA Red Team and gate-state transitions.
