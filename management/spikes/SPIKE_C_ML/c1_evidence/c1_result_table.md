| Criterion | What | Evidence (generated from JSON) |
|---|---|---|
| `C1-1` | Peak memory, both families, practical point | unet_base32_depth4 560/b8: 3387.3 MiB; dinov2_s14_full_progressive 560/b8: 3159.4 MiB |
| `C1-2` | Train / validation step time (real data, loading included) | unet_base32_depth4: 1010.67 / 121.84 ms; dinov2_s14_full_progressive: 485.95 / 123.08 ms |
| `C1-3` | Practical input resolution and batch | 560×560, batch 8 (first grid point where both fit) |
| `C1-4` | Decoder behaviour on real anatomy (fixed panel) | unet_base32_depth4: 3 small-area panel slices below Dice 0.5; dinov2_s14_full_progressive: 4 small-area panel slices below Dice 0.5 |
| `C1-5` | Thinnest structures vs decoder stride (voxels) | p5 thickness at model input 7.215 px; fraction thinner than stride: unet_full_resolution 0.0, dinov2_progressive 0.0, dinov2_linear 0.19786 |
| `C1-6` | Equal-budget convergence | unet_base32_depth4: CONVERGING (loss 0.74391 → 0.47806, fold-val Dice 0.78807); dinov2_s14_full_progressive: CONVERGING (loss 0.78194 → 0.49896, fold-val Dice 0.34948) |
| `C1-7` | DR-011 at runtime | per-volume statistics only; cohort statistics used: False |
| `C1-8` | Subset provenance | 20 ids from $.training_subsets.25_percent.effective_case_ids; split sha256 c5c65a0913b0…; validation and holdout never loaded |
| `C1-9` | Calendar verdict | E = 50 → FITS |
| `C1-10` | ADR-ML-001 fields evidenced | see the coverage table in ADR-ML-001 |
