# Path A split manifest

This tool consumes the accepted Spike D dataset manifest and produces the exact
Path A membership required by `06_DATASET_CONTRACT.md` §6:

- 80 cases for training;
- 20 cases for validation;
- all 54 released `Testing Set` cases as a locked final holdout;
- deterministic seed `2024`;
- nested training subsets: 20 ⊂ 40 ⊂ 80 cases.
- `DR-002a`: `CASE_0056` and `CASE_0097` form one duplicated-acquisition
  group, are both pinned to train, and enter a subset together or not at all;
  the 80 train cases represent **79 known distinct acquisitions**.
- `DR-002b`: a private MRI-only screen is required; same-side pairs at
  Pearson `r >= 0.75` are grouped, development cases linked to holdout are
  excluded from effective training with their complete group, and exact pair
  scores remain outside the repository under F5.

Run the self-test first:

```powershell
python tools/dataset_split/split.py --selftest
```

Generate the project artifact:

```powershell
python tools/dataset_split/split.py `
  --operator "Bế Quốc Khánh" `
  --linkage-screen D:/private/lasc2018/linkage_screen_private_20260916.json
```

The obtained package has one opaque directory per case but no field linking
multiple scans to one patient. The known DR-002a duplicate is grouped; every
other directory remains a proxy. Biological patient overlap is still
`NOT VERIFIABLE`, not silently promoted to PASS. The challenge benchmark
reports **154 MRI scans from 60 de-identified patients** (Xiong et al.,
Methods §2.1,
https://www.sciencedirect.com/science/article/pii/S1361841520301961), so
these proxies cannot prove patient separation. The leader's documented
`DR-002b` exception permits review of the conservative grouped/excluded split;
the tool itself still cannot close `GATE-SPLIT-01`.

The linkage-screen JSON must be outside the repository. The generator verifies
its source-package hash and 11,781-pair census, requires the known duplicate to
clear the fixed threshold, and rejects a truncated top list that cannot prove
the complete above-threshold set. Public output contains the restricted input
hash, threshold, aggregate counts and affected case IDs—not exact pair scores.

Nominal Path A membership stays 80/20/54. `effective_training_case_ids` and
the effective 25/50/100% subset fields are the only IDs training may consume;
the current evidence yields 20/38/78 effective cases.

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

The script refuses a source audit with machine failures or outstanding owner verdicts,
wrong cohort counts, missing labels, duplicate case IDs,
missing/private-screen-inside-repo inputs, incomplete patient maps, a patient crossing the released Training/Testing
boundary, and group sizes that cannot produce exact 80/20 or nested 20/40/80
case counts. It creates evidence but never closes `GATE-SPLIT-01`.
