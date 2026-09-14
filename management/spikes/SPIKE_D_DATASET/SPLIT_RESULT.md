# Path A split result

**Owner:** Bế Quốc Khánh
**Decision:** `DR-002 = Path A`
**Seed:** `2024`
**Generated artifact:** `data/manifests/split_manifest_path_a_seed2024.json`
**Gate status:** Evidence ready with an unresolved patient-linkage limitation; this result does not close `GATE-SPLIT-01`.

## Frozen membership

| Partition | Cases | Source/use |
|---|---:|---|
| Train | 80 | Released `Training Set`; training and training-only subsets |
| Validation | 20 | Released `Training Set`; model/threshold/checkpoint selection |
| Final holdout | 54 | Exactly the released `Testing Set`; final evaluation only |

The training subsets are deterministic and nested:

```text
20 cases (25%) ⊂ 40 cases (50%) ⊂ 80 cases (100%)
```

No case appears in more than one partition. The 54-case holdout is never used for
preprocessing, post-processing, threshold, model, checkpoint, or hyperparameter selection.

## Patient-level provenance limitation

The obtained archive exposes one opaque source directory per case. It does not expose a
patient identifier or a mapping that can reveal whether one patient has multiple scans.
Therefore:

- the script uses each source case directory as a deterministic proxy group;
- group/case overlap is proven absent;
- biological patient overlap is recorded as **`NOT VERIFIABLE`**, not `PASS`;
- `GATE-SPLIT-01` must review this limitation before closing.

If a trustworthy case-to-patient mapping becomes available, the same tool accepts it through
`--patient-map`, refuses any patient crossing the released Training/Testing boundary, preserves
multi-scan groups, and does not persist source patient identifiers.

## Reproducibility

- Source dataset manifest SHA-256:
  `91bd617140103e7290580221e998995d61b0855afca48f6744461a2d4a8be0a6`
- Selection algorithm: whole-group subset-sum after seed-2024 SHA-256 ranking.
- Self-test: 8/8 checks pass, including deterministic output, exact 80/20/54 counts,
  nested subsets, holdout identity, explicit unknown-linkage status, and paired-scan grouping.
- JSON Schema validation: PASS.

Re-run:

```powershell
python tools/dataset_split/split.py --selftest
python tools/dataset_split/split.py --operator "Bế Quốc Khánh"
```
