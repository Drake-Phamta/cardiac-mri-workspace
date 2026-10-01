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
`>` redirect, not of the committed file. The committed blob hashes to `c5c65a09…396d`. The JSON files below
keep the value as recorded on the day; the structural checks are unaffected because they parse the JSON.
Any re-pin must hash the committed bytes (on `main`, `data/manifests/**` is `-text`, so the working-tree file
is byte-identical to the blob).

No model was executed. No voxel was read. No training run was started.

| File | What it is |
|---|---|
| `c1prep_subset_verify.json` | 18 structural checks by SET CONTAINMENT on the candidate manifest |
| `preflight_negative_control.json` | the naive package root REFUSED: 20 validation and 54 holdout paths resolved |
| `preflight_dryrun.json` | allowlisted training-only root: 0 validation, 0 holdout paths resolved; measured environment |
| `forecast_*.json` | fraction-weighted calendar arithmetic; throughput input is C0 SYNTHETIC data on the owner's RTX 4050 |

In every `forecast_*.json`, `assumptions` (epochs, overhead, GPU hours/day) are NOT
measurements and are kept in a separate block from `measured_inputs` for that reason.
