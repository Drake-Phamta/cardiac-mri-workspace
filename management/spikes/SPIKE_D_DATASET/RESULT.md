# SPIKE_D — RESULT

**Owner:** Bế Quốc Khánh
**Secondary reviewer:** Vũ Hùng Anh
**Execution date:** 2026-09-14
**Evidence status:** Full-cohort measurements and owner verdicts complete; formal review pending.

## Measured result

The official `2018_UTAH_MICCAI.zip` archive was validated directly from the ZIP because the
14.2 GiB extracted package did not fit the available local disk. The accepted validator was
extended with a low-disk `--archive` input that extracts only one NRRD to a private temporary
directory at a time and produces the same manifest schema as `--root`.

```text
16 PASS · 0 FAIL · 1 NOT_RUN · 3 OWNER_VERDICTS_CONFIRMED
```

- 154 cases: 100 `Training Set`, 54 `Testing Set`.
- All 154 cases contain readable `lgemri.nrrd` and `laendo.nrrd` files.
- All 308 required volumes are 3D `uint8` and axis-aligned.
- MRI and mask geometry matches in all 154 cases; no resampling is required.
- In-plane dimensions vary: 69 cases are 576×576×88 and 85 are 640×640×88.
- Every mask contains exactly `{0, 255}`.
- Testing labels are physically present in 54/54 released test cases.
- No corruption, unreadable required volume, or direct-identifier header key was found.
- `A17` reports the unexpected non-NRRD sidecar `CASE_0097/desktop.ini` and passes
  only because the owner explicitly excludes it from ingestion/app metadata; the raw archive
  remains untouched.

## Owner verdicts confirmed through HITL

On 2026-09-14, Bế Quốc Khánh reviewed and confirmed these statements:

- `A10`: `0` is background and `255` is LA cavity foreground.
- `A11`: `laendo.nrrd` is the LA cavity target.
- `A12`: the 54/54 test-label finding is released-package file evidence; it does not claim
  that labels were available during the original challenge evaluation.
- `A13`: the measured label presence makes Path A technically feasible from a data-presence
  perspective; DR-002 and `GATE-SPLIT-01` still select the path and final split.
- `A17`: exclude `CASE_0097/desktop.ini` from ingestion/app metadata, preserve it unchanged
  in the raw archive, and record the exclusion.
- `A18`: the two official policy PDFs and their hashes are preserved, but raw or derived data
  must not be redistributed until the applicable DDA or permission is confirmed.

`A19` remains `NOT_RUN` in the machine table by design: the table is calculated before the
audit file is written. The generated audit exists and must be verified during review.

## Evidence index

- Human-readable audit: `management/DATASET_AUDIT.md`
- Machine-readable manifest: `data/manifests/dataset_manifest.json`
- Re-runnable validator: `tools/dataset_validate/validate.py`
- External official archive: `D:/cardiac-mri-workspace-data/lasc2018/2018_UTAH_MICCAI.zip`
- External acquisition record: `D:/cardiac-mri-workspace-data/lasc2018/acquisition.json`
- External policy archive: `D:/cardiac-mri-workspace-data/lasc2018/official_terms/`
- Archive SHA-256: `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0`

## Reproduction

```powershell
python tools/dataset_validate/validate.py `
  --archive "D:/cardiac-mri-workspace-data/lasc2018/2018_UTAH_MICCAI.zip" `
  --acquisition "D:/cardiac-mri-workspace-data/lasc2018/acquisition.json" `
  --write-manifest --write-audit
```

This result does not select the split and does not close `GATE-DATA-01`. Acceptance still
requires owner verdicts, Secondary Reviewer approval, QA PASS, and Project Control transition.
