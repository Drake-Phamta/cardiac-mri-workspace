# Path A split manifest

This tool consumes the accepted Spike D dataset manifest and produces the exact
Path A membership required by `06_DATASET_CONTRACT.md` §6:

- 80 cases for training;
- 20 cases for validation;
- all 54 released `Testing Set` cases as a locked final holdout;
- deterministic seed `2024`;
- nested training subsets: 20 ⊂ 40 ⊂ 80 cases.

Run the self-test first:

```powershell
python tools/dataset_split/split.py --selftest
```

Generate the project artifact:

```powershell
python tools/dataset_split/split.py --operator "Bế Quốc Khánh"
```

The obtained package has one opaque directory per case but no field linking
multiple scans to one patient. Without more provenance, the output therefore
uses each case directory as a proxy group and records patient-level separation
as `NOT VERIFIABLE`. It does not silently turn that limitation into a PASS.

If a trustworthy mapping becomes available, provide every case exactly once:

```json
{
  "case_to_patient": {
    "CASE_0001": "source-patient-key-1",
    "CASE_0002": "source-patient-key-2"
  }
}
```

Then run with `--patient-map path/to/map.json`. Source patient keys are used
only for grouping and are not persisted; the manifest stores sequential
`PATIENT_GROUP_NNNN` identifiers.

The script refuses wrong cohort counts, missing labels, duplicate case IDs,
incomplete patient maps, a patient crossing the released Training/Testing
boundary, and group sizes that cannot produce exact 80/20 or nested 20/40/80
case counts. It creates evidence but never closes `GATE-SPLIT-01`.
