# C1_PREP / NON-AUTHORITATIVE DRY RUN — evidence, Day 15 (2026-09-24)

Machine-generated outputs produced under `RECOVERY_OVERRIDE_DAY15`.
Read `management/day15/C1_BRINGUP.md` for the interpretation.

## THIS IS NOT SPIKE C1 EVIDENCE

1. It is NOT `SPIKE_C1 ACTIVE`. Spike C1's status is unchanged.
2. It is NOT accepted C1 evidence. Zero of ten C1 criteria are satisfied by it.
3. It CANNOT close `GATE-ML-01`. DR-007 requires real-data C1 evidence.
4. It is VOID and must be re-run if the split manifest changes when the split is frozen.

Input was the CANDIDATE manifest from PR #35, branch `codex/path-a-split`
@ `7b72ce83fe09520aefad4eb6f746ed665b9179f1`, NOT from `main`.
Candidate SHA-256 recorded on Day 15: `ff1517d00b8da4808e87bf6ab1325148fa3543031c0b5453d2dda11e0bbe3ce0`.

**Correction, 2026-10-01:** that value is the hash of a CRLF + UTF-8-BOM copy written by a PowerShell 5.1
`>` redirect, not of the committed file. The committed blob hashes to
`c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d`. The JSON files below keep the value as
recorded on the day; the structural checks are unaffected because they parse the JSON.

Any re-pin must hash the **git blob bytes**. Run
`git cat-file blob main:data/manifests/split_manifest_path_a_seed2024.json` and read its stdout into
`hashlib.sha256` in Python. Do not hash the working-tree file. *(The first version of this note said the
working-tree file is byte-identical to the blob because `data/manifests/**` is `-text`. That is wrong.
`.gitattributes` line 48, `*.json text eol=lf`, overrides line 40 for JSON files, and `git check-attr`
reports `text: set`, `eol: lf`. A fresh checkout is LF, but a copy re-saved with CRLF hashes differently
while `git diff` shows nothing.)*

No model was executed. No voxel was read. No training run was started.

**Day 22 note.** `preflight_dryrun.json` was certified by the Day 15 `check`, which verified entry
**names** only (QA BLOCKING 1). It remains a non-authoritative dry run. The Day 22 `check` verifies link
targets and file identities (`C1_BRINGUP.md` section 11).

**Redaction, 2026-10-01 (public repository).** In every JSON file below, the machine's hostname is
replaced by `<leader-pc>`, and absolute local paths are replaced by placeholders. `<scratch>` is the
session scratch directory, `<worktree>` the git worktree, and `<package-root>` the extracted dataset
package. Machine names and local directory layout are not evidence, and this repository is public.
Nothing else changed: every count, hash, check result, timestamp and dataset-relative path is as
recorded. `C1_BRINGUP.md` got the same redaction. Earlier commits on the PR branch still contain the
original strings, because history was not rewritten. No file in the repository pins the hashes of these
JSON files (searched at HEAD), so there were no pins to update.

| File | What it is |
|---|---|
| `c1prep_subset_verify.json` | 18 structural checks by SET CONTAINMENT on the candidate manifest |
| `preflight_negative_control.json` | the naive package root REFUSED: 20 validation and 54 holdout paths resolved (counts; the first 10 hits of each are listed) |
| `preflight_dryrun.json` | allowlisted training-only root: 0 validation, 0 holdout paths resolved; measured environment |
| `forecast_*.json` | fraction-weighted calendar arithmetic; throughput input is C0 SYNTHETIC data on the owner's RTX 4050 |

In every `forecast_*.json`, `assumptions` (epochs, overhead, GPU hours/day) are NOT
measurements and are kept in a separate block from `measured_inputs` for that reason.
