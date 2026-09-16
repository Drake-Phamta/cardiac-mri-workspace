# Path A split result

**Owner:** Bế Quốc Khánh
**Decision:** `DR-002 = Path A`
**Duplicate rule:** `DR-002a`, CASE_0056 + CASE_0097 pinned as one train group
**Patient-linkage exception:** `DR-002b = (c) + (d)`, threshold declared before training
**Seed:** `2024`
**Generated artifact:** `data/manifests/split_manifest_path_a_seed2024.json`
**Gate status:** `EVIDENCE_READY_FOR_REVIEW`; this result does not close
`GATE-SPLIT-01`. Review approval and Project Control transition are still required.

## Frozen membership

| Partition | Nominal cases | Effective training cases | Source/use |
|---|---:|---:|---|
| Train | 80 (79 known distinct acquisitions) | **78** after DR-002b exclusion | Released `Training Set`; training and training-only subsets |
| Validation | 20 | n/a | Released `Training Set`; model/threshold/checkpoint selection |
| Final holdout | 54 | n/a | Exactly the released `Testing Set`; final evaluation only |

The training subsets are deterministic and nested; the duplicate pair is
either present **together** or absent in every subset:

```text
20 cases (25%) ⊂ 40 cases (50%) ⊂ 80 cases (100%) — nominal membership
20 effective ⊂ 38 effective ⊂ 78 effective after DR-002b exclusion
```

No case appears in more than one partition. The 54-case holdout is never used for
preprocessing, post-processing, threshold, model, checkpoint, or hyperparameter selection.

## DR-002b threshold, grouping and holdout protection

The fixed threshold is **sampled-feature Pearson `r >= 0.75`**, declared in
code and this manifest on 2026-09-17, before any real-data training run. It was
chosen at the upper-tail break after rank 5 in the 11,781-pair private screen.
At this threshold there are **5 pairs affecting 9 case IDs**, including the
known `CASE_0056`/`CASE_0097` duplicate at rank 1.

Same-side candidate groups kept whole in every nominal partition/subset:

- `CASE_0056` + `CASE_0097`
- `CASE_0057` + `CASE_0128`
- `CASE_0081` + `CASE_0095`
- `CASE_0117` + `CASE_0133`

Holdout protection found one above-threshold crossing:

| Development case | Holdout case | Public score statement | Training action |
|---|---|---|---|
| `CASE_0133` | `CASE_0027` | `r >= 0.75`; exact score restricted by F5 | exclude `CASE_0133`; also exclude grouped `CASE_0117` |

Thus the nominal train partition remains 80 as required by Path A, while the
actual trainable set is **78**. Propagating the exclusion to `CASE_0117` keeps
the similarity group intact. Exact pair scores remain in the private screen;
the public manifest records its SHA-256
`bf8d99f20eca3c93d2bf3c1af65071f8696fc5953d58c895f031187ffc3d8022`.

## Patient-level provenance limitation

The obtained archive exposes one opaque source directory per case. It does not expose a
patient identifier or a mapping that can reveal whether one patient has multiple scans.
The challenge's own benchmark reports **154 MRI scans from 60 de-identified
patients** (Xiong et al., *Medical Image Analysis* 67, 2021, Methods §2.1;
https://www.sciencedirect.com/science/article/pii/S1361841520301961). Thus
the case-directory proxy is **not credible as proof of patient separation**.
Therefore:

- the script groups every same-side above-threshold candidate component and
  uses the remaining source case directories as deterministic proxy groups;
- group/case overlap is proven absent;
- biological patient overlap is recorded as **`NOT VERIFIABLE`**, not `PASS`;
- the leader's `DR-002b` documented exception allows the evidence to proceed
  to review without claiming that patient separation was verified.

**Shared limitation sentence:** Patient-level separation is **NOT VERIFIABLE**
for this release; the implemented safeguard is case-level disjointness plus
correlation-screen grouping and exclusion.

If a trustworthy case-to-patient mapping becomes available before the split is
frozen, the same tool accepts it through
`--patient-map`, refuses any patient crossing the released Training/Testing boundary, preserves
multi-scan groups, and does not persist source patient identifiers.

## Sensitivity analysis placeholder (Spike C1)

- **Primary metric:** `PENDING_SPIKE_C1` on all 54 locked holdout cases.
- **Sensitivity metric:** `PENDING_SPIKE_C1` after excluding suspected holdout
  case `CASE_0027`.
- Both values and their interpretation must be reported together; this split
  document does not invent either metric before C1 runs.

## Reproducibility

- Source dataset manifest SHA-256:
  `91bd617140103e7290580221e998995d61b0855afca48f6744461a2d4a8be0a6`
- Selection algorithm: whole-group subset-sum after seed-2024 SHA-256 ranking.
- Restricted screen SHA-256:
  `bf8d99f20eca3c93d2bf3c1af65071f8696fc5953d58c895f031187ffc3d8022`.
- Self-test: 16/16 checks pass, including threshold declaration, grouping,
  holdout exclusion, F5 score restriction and the sensitivity placeholder.
- JSON Schema validation: PASS.

Re-run:

```powershell
python tools/dataset_split/split.py --selftest
python tools/dataset_split/split.py `
  --operator "Bế Quốc Khánh" `
  --linkage-screen <private path outside repository>/linkage_screen_private_20260916.json
```

The source manifest hash above is the current `main` input. After PR #34
merges, this artifact must be regenerated once so the source hash references
the narrowed public manifest before `GATE-SPLIT-01` can close.
