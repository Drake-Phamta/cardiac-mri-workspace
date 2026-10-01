# `tools/dataset_validate` — Spike D dataset validator

> ### Who this is for
>
> **Spike D's Primary Owner is Bế Quốc Khánh.** This directory is the *harness*.
> `SPIKE_D_DATASET/TASK.md:198` permits Claude to write it:
>
> > *"Claude **may**: write the validation script, define the manifest schema, structure
> > `DATASET_AUDIT.md`, and analyse and interpret output the owner supplies."*
>
> The same file, two lines earlier, says who produces the evidence:
>
> > *"All of the above must be read from the actual downloaded package **by Bế Quốc Khánh**."*
>
> So: the tool was built for you; running it, reading the numbers and signing them is your work.
> The tool records who ran it and never fills that in on anyone's behalf.

---

## What it does

Reads an extracted 2018 Atria Segmentation Data (LASC 2018) package and produces the two
artifacts `GATE-DATA-01` needs (`06` §9.1):

```text
data/manifests/dataset_manifest.json     machine-readable, generated  (criterion A20)
management/DATASET_AUDIT.md              rendered from that manifest  (criterion A19)
```

It answers **16 of the 20** acceptance criteria mechanically. It refuses to answer the other
four, and says so out loud:

| # | Criterion | Why a script must not answer it |
|---|---|---|
| `A11` | Is `laendo.nrrd` the LA **cavity** target? | What an annotation *means* is not readable from bytes |
| `A13` | Path A vs Path B evidence | This spike supplies evidence; **`DR-002` selects the path** |
| `A18` | Licence / terms preserved | Known only to whoever performed the download |
| `A19` | Audit file exists and is complete | Verified after generating it |

---

## Install

```bash
pip install -r tools/dataset_validate/requirements.txt
```

One dependency: `pynrrd`. Its **exact version is recorded in every manifest**, because
`SPIKE_D_DATASET/TASK.md` lists the NRRD library and version as a required environment field.

---

## Use

```bash
# 1 · prove the harness works, with no real package at all
python tools/dataset_validate/validate.py --selftest

# 2 · look at the package, print the criteria table, write nothing
python tools/dataset_validate/validate.py --root "C:/cardiac-data/lasc2018/extracted"

# 3 · produce the acceptance artifacts
python tools/dataset_validate/validate.py \
    --root "C:/cardiac-data/lasc2018/extracted" \
    --acquisition C:/cardiac-data/lasc2018/acquisition.json \
    --write-manifest --write-audit
```

If the 14.2 GiB extracted package does not fit, stream the official ZIP instead.
The generated manifest and checks are identical; at most one NRRD is placed in
a temporary directory at a time:

```bash
python tools/dataset_validate/validate.py \
    --archive "D:/cardiac-mri-workspace-data/lasc2018/2018_UTAH_MICCAI.zip" \
    --acquisition "D:/cardiac-mri-workspace-data/lasc2018/acquisition.json" \
    --restricted-manifest-out "D:/cardiac-mri-workspace-data/lasc2018/dataset_manifest_restricted.json" \
    --write-manifest --write-audit
```

The public manifest contains no per-data-file SHA-256. Those hashes are written
to the deterministic restricted manifest outside the repository; only that
artifact's SHA-256 and the regeneration command are public. If the explicit
option is omitted, the restricted file is placed beside the private source.
The command refuses a restricted output path inside the repository.

Exit codes: `0` no `FAIL` · `1` at least one `FAIL` · `2` the run could not proceed.

### Start with `--selftest`

It builds seven synthetic cases in a temp directory — two partitions, two
unlabelled, one oblique, two with identical cavity and wall files — and
asserts that both `--root` and `--archive` detect the cross-case duplicates.
It must report the expected synthetic `A9 FAIL` and `A14 FAIL`.

The selftest writes nothing into the repository and measures nothing real.

### QA-002 hardening regressions

Run the eight reduced red-team scenarios for F6–F11, F14 and F15:

```powershell
python tools/dataset_validate/hardening_regression.py
```

They use only temporary synthetic NRRDs/ZIPs and cover complete-grid A9,
strict mask mapping, header allowlisting, independently recomputed archive
hashes, package-layout/ZIP-path inventory, invalid direction matrices,
controlled corrupt-ZIP refusal, and fallible A16/A20 checks. Expected result:
`hardening regression: 8/8 passed`.

Archive mode now hashes the ZIP it actually read and compares name, size and
SHA-256 with `acquisition.package_files`. It also refuses unsafe, duplicate or
case-variant member paths. Files outside direct case directories are recorded
in `package_findings`; every non-NRRD/layout path must be explicitly excluded
from ingestion/app metadata before A17 can pass.

> ### The package is already on disk; choose the operator's private path
>
> Khánh's machine has the official ZIP, not a full 14.2 GiB extraction.
> Use `--archive` and a private `acquisition.json`; no expanded package is needed.
>
> The first two versions of this README pointed `--root` at
> `C:/cardiac-data/lasc2018/2018_UTAH_MICCAI`, **a directory that does not exist** — copy-pasting it
> returned exit 2 on the first command. It also showed a `LICENSE_TERMS.txt` that does not exist:
> the archive ships **no licence file at all**, only 462 NRRDs, two Python files and one stray
> `desktop.ini`. Criterion `A18` therefore means archiving the Cardiac Atlas page separately, not
> finding a file in the zip.

### The acquisition JSON

Criterion `A1` needs the download record, which the scanner cannot read off the disk. Supply it:

```json
{
  "source_url": "https://www.dropbox.com/scl/fi/.../2018_UTAH_MICCAI.zip?dl=1",
  "documented_source": "https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/",
  "download_started": "2026-09-11T23:12:06+07:00",
  "download_finished": "2026-09-11T23:48:31+07:00",
  "acquired_by": "Pham Tuan Anh",
  "extraction_location": "C:/cardiac-data/lasc2018/extracted",
  "license_terms_path": "NOT MEASURED - the archive contains no licence file; the terms live on the Cardiac Atlas page and must be archived separately (A18)",
  "package_files": [
    {"name": "2018_UTAH_MICCAI.zip", "size_bytes": 2200962438, "sha256": "..."}
  ],
  "attribution_note": "Acquired by the leader as a recovery action (INC-001). The A2-A20 audit is the owner's."
}
```

Fields left out are reported as missing. They are never guessed.
The generated **public** manifest replaces `package_root` and
`license_terms_path` with external/private references. It contains no
per-data-file checksum or pairwise linkage score. See `POLICY_EVIDENCE.md` for
the leader's 2026-09-16 narrow-publication decision.

Re-render a corrected audit from an already scanned manifest without reading
the 2.2 GB ZIP again:

```powershell
python tools/dataset_validate/validate.py `
  --render-from-manifest data/manifests/dataset_manifest.json --write-audit
```

---

## Design rules

1. **Reading and judging are separate files.** `dataset_scan.py` reads; `checks.py` judges.
   A reviewer can re-run the judgement against a manifest someone else produced.
2. **A check that could not run reports `NOT_RUN` with a reason — never `PASS`.** A checker
   that passes something it did not look at produces evidence that is not evidence.
3. **Nothing is assumed.** Mask foreground values are *recorded*, per `06` §9: *"the exact
   foreground/background value mapping is recorded rather than assumed"*.
4. **The package layout is discovered, not hardcoded.** Any directory containing `lgemri.nrrd`
   is a case. If the real layout differs, the manifest says so instead of silently finding nothing.
5. **Suspected identifiers are counted, never copied.** `A17` reports the header *key* that
   matched and the value's *length* — writing a suspected identifier into a tracked file is the
   leak the check exists to prevent (`NFR-SEC-005`, `12` §2).
6. **The audit is generated, not typed.** Editing `DATASET_AUDIT.md` by hand makes it disagree
   with the manifest, and the manifest is the artifact `GATE-DATA-01` accepts.

---

## What this tool cannot do

**It cannot accept Spike D.** `GATE-DATA-01` closes through the four-step workflow — owner
evidence → Secondary Reviewer `APPROVE` → CHAT E QA `PASS` → Project Control transition — and
for Spike D, QA must inspect **the actual recorded evidence**, not a summary. A script printing
`PASS` closes nothing.

**It cannot accept the split.** `DR-002` selected Path A and `DR-002b` records
that patient-level separation is **not verifiable** for this release. The split
PR must implement case-level disjointness plus correlation-screen grouping and
exclusion, never slice-level splitting, with seed 2024. `GATE-SPLIT-01` remains
open and training remains blocked until those exact IDs are reviewed.

**It must not be pointed at data under `data/`.** The raw package stays outside version control
(`06` §5). `.gitignore` blocks `*.nrrd` and `data/**`, but the package belongs outside the
workspace entirely.

**Related:** [`../../management/spikes/SPIKE_D_DATASET/TASK.md`](../../management/spikes/SPIKE_D_DATASET/TASK.md) ·
[`../../management/spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_D_DATASET/EVIDENCE_TEMPLATE.md) ·
[`../../docs/specs/v1.0/06_DATASET_CONTRACT.md`](../../docs/specs/v1.0/06_DATASET_CONTRACT.md)
