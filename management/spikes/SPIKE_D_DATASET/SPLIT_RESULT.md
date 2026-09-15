# Path A split result

**Owner:** Bế Quốc Khánh
**Decision:** `DR-002 = Path A`
**Duplicate rule:** `DR-002a`, CASE_0056 + CASE_0097 pinned as one train group
**Seed:** `2024`
**Generated artifact:** `data/manifests/split_manifest_path_a_seed2024.json`
**Gate status:** `BLOCKED_PATIENT_LINKAGE`; this result does not close `GATE-SPLIT-01`.

## Frozen membership

| Partition | Cases | Source/use |
|---|---:|---|
| Train | 80 (79 known distinct acquisitions) | Released `Training Set`; training and training-only subsets |
| Validation | 20 | Released `Training Set`; model/threshold/checkpoint selection |
| Final holdout | 54 | Exactly the released `Testing Set`; final evaluation only |

The training subsets are deterministic and nested; the duplicate pair is
either present **together** or absent in every subset:

```text
20 cases (25%) ⊂ 40 cases (50%) ⊂ 80 cases (100%)
```

No case appears in more than one partition. The 54-case holdout is never used for
preprocessing, post-processing, threshold, model, checkpoint, or hyperparameter selection.

## Patient-level provenance limitation

The obtained archive exposes one opaque source directory per case. It does not expose a
patient identifier or a mapping that can reveal whether one patient has multiple scans.
The challenge's own benchmark reports **154 MRI scans from 60 de-identified
patients** (Xiong et al., *Medical Image Analysis* 67, 2021, Methods §2.1;
https://www.sciencedirect.com/science/article/pii/S1361841520301961). Thus
the case-directory proxy is **not credible as proof of patient separation**.
Therefore:

- the script groups the known duplicate acquisition and uses all other
  source case directories as deterministic proxy groups;
- group/case overlap is proven absent;
- biological patient overlap is recorded as **`NOT VERIFIABLE`**, not `PASS`;
- `GATE-SPLIT-01` remains blocked until a trustworthy mapping or explicit
  leader decision resolves this patient-level requirement.

If a trustworthy case-to-patient mapping becomes available, the same tool accepts it through
`--patient-map`, refuses any patient crossing the released Training/Testing boundary, preserves
multi-scan groups, and does not persist source patient identifiers.

## Reproducibility

- Source dataset manifest SHA-256:
  `91bd617140103e7290580221e998995d61b0855afca48f6744461a2d4a8be0a6`
- Selection algorithm: whole-group subset-sum after seed-2024 SHA-256 ranking.
- Self-test: 11/11 checks pass, including DR-002a train pinning and nested-subset grouping.
- JSON Schema validation: PASS.

Re-run:

```powershell
python tools/dataset_split/split.py --selftest
python tools/dataset_split/split.py --operator "Bế Quốc Khánh"
```
