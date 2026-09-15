# GATE-SPLIT-01 — patient linkage evidence (Day 6)

**Finding:** the case directories in the obtained LASC 2018 package cannot be
treated as unique biological patients. The challenge's own benchmark reports
"154 independently acquired 3D LGE-MRIs from 60 de-identified patients"
([Xiong et al., *Medical Image Analysis* 67 (2021), Methods §2.1](https://www.sciencedirect.com/science/article/pii/S1361841520301961)).
The same section describes scans before and after ablation at Utah. Thus
multiple acquisitions per patient are a documented characteristic of this
challenge, not merely a theoretical possibility.

The [Cardiac Atlas release page](https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/)
describes 100 released training and 54 testing MRIs and mentions supporting
pre/post-ablation labels, but its wording that each file contains one patient's
data does **not** establish one **distinct** patient per case. The obtained
ZIP has no verified `CASE_NNNN → patient` map. The publisher's original
resolution (0.625 mm along each voxel axis) is not encoded by the default NRRD headers;
this is a separate physical-geometry caveat, not linkage evidence.

## MRI-only empirical screen

`tools/dataset_split/linkage_screen.py` reads **only `lgemri.nrrd`** from each
of the 154 ZIP case directories. It applies DR-011 per-volume intensity
z-score, samples a fixed 24×24×22 normalized grid, and computes Pearson
correlation for every unordered case pair (11,781 pairs). It ranks overall,
released Training↔Testing, and proposed train↔validation↔holdout crossings.
It never opens `laendo.nrrd`, `lawall.nrrd`, or a patient key.

The independent QA-002 screen already found one strong candidate:
`CASE_0056`/`CASE_0097` share byte-identical cavity and wall files and have
full-resolution MRI Pearson r ≈ 0.9965. `DR-002a` groups them and pins both
to training. The MRI-only screen is required to re-find this pair as a method
sanity check. A high MRI score **does not prove patient identity**, while a
low score cannot rule out pre/post-ablation scans of the same patient.

**Executed on the private ZIP (2026-09-16):** 154 MRI volumes, 11,781 pairs;
synthetic selftest 5/5 PASS. The MRI-only method ranked the known
`CASE_0056`/`CASE_0097` pair **first** with sampled-feature Pearson
`r=0.996141`, independently recovering QA-002's full-voxel `r≈0.9965`.
The highest correlation spanning the released Training↔Testing boundary
was `r=0.794344`; another proposed train↔validation crossing reached
`r=0.781772`. These are **screening candidates**, not proven repeat patients.
The complete ranked case-ID/score JSON is stored outside the repository in
the operator's private dataset directory pending the F5 publication decision.

```powershell
python tools/dataset_split/linkage_screen.py --selftest
python tools/dataset_split/linkage_screen.py `
  --archive <private path to official ZIP> `
  --dataset-manifest data/manifests/dataset_manifest.json `
  --split-manifest data/manifests/split_manifest_path_a_seed2024.json `
  --out <private path outside repository>/linkage_screen.json
```

**Publication restraint:** the private screen output holds only case IDs,
scores and method, never image bytes. Nevertheless those case-level
similarity scores are dataset-derived metadata, and QA-002 F5's public
publication question remains undecided. Do **not** commit that private JSON
until the project lead confirms the release/DDA permits this scope or chooses
a restricted manifest channel. Aggregate counts and the already disclosed
known pair may be reviewed without copying raw data.

## Gate conclusion and request

Conclusion category: **suspected repeated acquisition(s) and no trustworthy
complete mapping**. The known pair is handled; other repeat patient scans
cannot be mapped. The proposed 80/20/54 case membership therefore passes
case-level disjointness but records biological patient overlap as
`NOT VERIFIABLE`; `GATE-SPLIT-01` is `BLOCKED_PATIENT_LINKAGE`.

**Leader/organizer HITL:** obtain a trustworthy patient-level grouping for
all 154 scans, or explicitly decide a documented exception/change to the
patient-level requirement. Image correlation is a screening tool, not a
substitute for ground-truth patient linkage. Do not start Spike C1, train on
real cases, or use holdout labels while this gate remains open.
