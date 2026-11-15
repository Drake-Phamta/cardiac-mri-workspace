"""Shared paths and constants for the GateFuse-LA project.

All large artefacts (raw data, encoder weights, cached features, run outputs)
live in WORK, which defaults to <repo>/work and can be overridden with the
LA_WORK environment variable.
"""
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("LA_WORK", REPO / "work")).resolve()

RAW_DIR = WORK / "data" / "uamt_src" / "data"          # UA-MT copy of the 2018 LA challenge data
PREP_DIR = WORK / "prep"                                 # normalised 2D slices on a fixed canvas
FEAT_DIR = WORK / "features"                             # cached frozen-encoder features
RUN_DIR = WORK / "runs"                                  # checkpoints and test predictions
WEIGHT_DIR = WORK / "weights"

RESULTS = REPO / "results"
TABLES = RESULTS / "tables"
FIGURES = RESULTS / "figures"

# Geometry -------------------------------------------------------------
CANVAS = 256        # every axial slice (<= 244 x 160) is zero-padded, never shrunk
ENC_SIZE = 512      # canvas is enlarged x2 (bilinear) before the ViT encoders
GRID = 32           # 512 / 16 -> 32 x 32 patch tokens for both ViT-B/16 encoders
FEAT_DIM = 768
SPACING_MM = 0.625  # isotropic voxel size of the Utah LGE-MRI volumes

# Intensity normalisation (chapter 3: contrast stretching) ---------------
CLIP_LOW, CLIP_HIGH = 0.5, 99.5     # per-slice percentile clipping before min-max
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

# Splits ---------------------------------------------------------------
N_VAL = 8           # last 8 volumes of the official 80-volume train list
N_FEW = 8           # "few labels": first 8 volumes of the train list (10 %)
SEEDS = (0, 1, 2)

ENCODERS = ("dinov3", "mricore")


def ensure_dirs():
    for d in (PREP_DIR, FEAT_DIR, RUN_DIR, TABLES, FIGURES):
        d.mkdir(parents=True, exist_ok=True)
