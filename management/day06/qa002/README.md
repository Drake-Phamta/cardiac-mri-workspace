# QA-002 reproduction scripts — Spike D

These are the scripts the independent QA / Red Team pass ran on 2026-09-15 against Spike D at `a92892c`. The
record is [`../QA_REVIEW_002_SPIKE_D.md`](../QA_REVIEW_002_SPIKE_D.md). They are kept so the owner, the reviewer
and a later QA pass can reproduce each finding. They are not project tooling.

- They read the LASC 2018 archive and the committed manifest locally and **print diagnostics**. Anything they
  write goes under the `SCR` path set at the top of each script, never into the repository, and they delete
  nothing.
- Their printed output contains per-case derived values. **Never commit it** (finding F5).
- `near_duplicates.py` and `independent_census.py` read the masks of all 154 cases, including the 54 holdout cases,
  for data integrity only. Their output must not inform any model, threshold, post-processing or checkpoint
  decision (`06` §6).
- Paths are those of the QA machine. Before running, edit the constants at the top of each script (`SCR`, `WT`,
  `MAN`, `ARCHIVE`); `WT` is a checkout of `a92892c`.
- Run with `$env:PYTHONDONTWRITEBYTECODE = "1"; $env:PYTHONIOENCODING = "utf-8"`. They need `numpy`;
  `recompute_manifest.py` and `break_validator.py` also use `jsonschema`.

| Script | What it checks | Findings |
|---|---|---|
| `recompute_manifest.py` | schema; every aggregate recomputed from the committed manifest; re-check and re-render of the audit | aggregates, F2, F5, F13 |
| `rerun_tool_on_identical_archive.py` | re-runs the committed scanner on a byte-identical archive and deep-diffs the manifest | no hand edits |
| `independent_census.py` | reads every NRRD without pynrrd or the validator: hashes, header census, values, cavity-vs-wall structure | A4–A11, A14, A17, F2 |
| `duplicate_mask_pair.py` | volumes whose SHA-256 repeats across cases; MRI similarity; which wall the shared cavity fits | **F1** |
| `near_duplicates.py` | thumbnail correlation and mask Dice over every same-shape pair | F1 calibration |
| `break_validator.py` | 33 synthetic scenarios through `--root` and `--archive` | F6–F11, F14, F15 |
| `rejudge.py` | re-judges four scenarios whose first judge matched text inside `package_root` | break-test corrections |
| `misc_checks.py` | root-level files in the archive; how the manifest changed across PR #25 revisions | F10, no hand edits |
