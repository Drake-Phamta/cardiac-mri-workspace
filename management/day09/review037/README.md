# Review suite for PR #37: SPIKE_C0 synthetic pipeline bring-up

Reviewer: Project Control, on behalf of the leader (Phạm Tuấn Anh). Head reviewed: `8f1c6fe`. Date: 2026-09-18, 00:56–01:10 +07.

The PR was reviewed by re-running it, not by reading it. Every number below was produced by a script in this folder or by the PR's own harness. No value was typed by hand.

## Environment of the independent reruns

| Field | Value |
|---|---|
| GPU | NVIDIA GeForce RTX 3050 Ti Laptop GPU, 4 GB |
| Python / torch | 3.12.6 / 2.5.1+cu121, cuDNN 90100 |
| transformers / huggingface_hub | 4.51.3 / 0.36.2 |
| DINOv2 checkpoint | `facebook/dinov2-small` @ `ed25f3a3…`, weights SHA-256 `ae1e99fc…`. These are the **same** revision and hash as the committed evidence |
| Network | `HF_HUB_OFFLINE=1` for every run after the first download |

The committed evidence (`spikes/spike_c_ml/EVIDENCE_RAW/c0_pipeline_bringup_20260916.json`) comes from an RTX 4050 with Python 3.11.9 and torch 2.11.0+cu128. That file records no `transformers` version.

## 1. Cross-machine reproduction of the bring-up

Commands, run from `spikes/spike_c_ml` at the PR head:

```text
python harness/pipeline_bringup.py --operator "<label>" --img 560 --precision bf16 --device cuda \
    --checkpoint-dir <scratch> --output rerun_json/rerun1_unmodified.json             # and rerun2_…
python forkrng_driver.py <spike_c_ml> --operator "<label>" --img 560 --precision bf16 --device cuda \
    --checkpoint-dir <scratch> --output rerun_json/rerun3_forkrng.json
```

| Run | UNet loss | UNet Dice | DINOv2 loss | DINOv2 Dice |
|---|---|---|---|---|
| committed evidence (RTX 4050) | 0.8164493243 | 0.2228015230 | 0.7275491754 | 0.2885488123 |
| `rerun1_unmodified` | 0.8164619009 | 0.2228015230 | **0.6430924932** | **0.2250316054** |
| `rerun2_unmodified_same_machine` (control) | 0.8164619009 | 0.2228015230 | 0.6430936158 | 0.2250447993 |
| `rerun3_forkrng`: backbone load inside `torch.random.fork_rng()` | 0.8164619009 | 0.2228015230 | **0.7275285721** | **0.2883632567** |

Reading of the table:

- **UNet reproduces across machines.** The loss differs by 1.3e-5 and Dice is identical.
- **DINOv2 does not reproduce as written.** The gaps are 8.4e-2 in loss and 6.4e-2 in Dice.
- **The gap is not run-to-run noise on this machine.** Rerun 2 differs from rerun 1 by only 1.1e-6 in loss and 1.3e-5 in Dice.
- **The gap closes when the backbone load stops touching the global RNG.** Rerun 3 lands within 2.1e-5 in loss and 1.9e-4 in Dice of the committed values. That is the same order as the UNet's cross-machine difference.

## 2. Mechanism (`rng_check.py`)

```text
python rng_check.py
```

| Check | Result |
|---|---|
| control: `manual_seed(2024)` twice gives the same draw | `true` |
| `manual_seed(2024)`, then `Dinov2Model.from_pretrained(...)`, then a draw differs from the control draw | `true`: loading consumed the RNG |
| attention implementation | `sdpa` |

`run_variant` seeds once, and `probe.DinoSeg.__init__` then loads the backbone (`probe.py` L234/L237) **before** it builds the trainable decoder (L253–L262). Whether the decoder's initial weights equal the seed-2024 draw therefore depends on how `transformers` loads weights. The committed numbers match the case where loading does **not** consume the RNG. `probe.py` is identical on `main` and at the PR head, so the fix belongs in `DinoSeg` and covers every caller.

## 3. Manifest guard (`guard_attacks.py`)

```text
python guard_attacks.py <spike_c_ml/harness> <work dir>
```

A refusal only counts if the control loads first.

| Case | Expected | Got |
|---|---|---|
| control: committed synthetic manifest | LOAD | LOAD (train 6, validation 2) |
| real-looking id in train / in validation | REFUSE | REFUSE ×2 |
| train/validation overlap | REFUSE | REFUSE |
| duplicate id inside train | REFUSE | REFUSE |
| train `case_count` off by one | REFUSE | REFUSE |
| empty validation | REFUSE | REFUSE |
| `partitions` key missing | REFUSE | REFUSE |
| extra `holdout` partition with real ids | LOAD | LOAD. Only `train` and `validation` are read |

Result: the control loads, and **8/8** attacks behaved as expected. `--selftest` exits 0, but it prints the literal `5/5 PASS`, because the asserts abort on the first failure and nothing is counted.

## What this suite does not show

- It does not reproduce the RTX 4050 environment. Only the reported numbers and the rerun-3 counterfactual stand in for it.
- It says nothing about model quality. Synthetic Dice is a plumbing signal, as the PR's own `limitations` state.
- No checkpoint bytes are committed here. The `rerun_json/*.json` files carry checkpoint hashes only.
