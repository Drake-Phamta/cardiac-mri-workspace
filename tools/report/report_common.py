"""
Shared constants and helpers for tools/report (assets builder and deck builder).

Nothing here reads experiment artifacts. It holds the palette, the Vietnamese number formatting and the small
vocabulary (family names, experiment-question names) that both builders must agree on.
"""

from __future__ import annotations

# --- palette -----------------------------------------------------------------
# Categorical slots 1-3 of the validated default palette (dataviz skill, references/palette.md), light mode.
# Checked with:  node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a" --mode light [--pairs all]
# -> all hard gates PASS; the aqua slot is below 3:1 on the light surface, so every chart carries visible
#    direct labels and a table twin (RESULTS_TABLES.md): the "relief rule".
BLUE = "#2a78d6"      # DINOv2, raw masks
ORANGE = "#eb6834"    # morphology post-processing (PP-4), processed masks
AQUA = "#1baf7a"      # UNet

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"

NBSP = " "
MINUS = "−"

# --- experiment vocabulary -----------------------------------------------------
EXPECTED_UNET = ("EXP-U-025", "EXP-U-050", "EXP-U-100")   # ADR-ML-001: the three UNet runs still to come
FAMILY_NAME = {"dinov2": "DINOv2", "unet": "UNet", "other": "Khác"}

QUESTION_NAME = {
    "data_scarcity": "Ít dữ liệu",
    "postprocessing": "Hậu xử lý (RQ-B)",
    "model_comparison": "UNet so với DINOv2 (RQ-A)",
    "other": "So sánh khác",
}


def vn(x: float | None, nd: int = 3) -> str:
    """Vietnamese decimal comma: 0.6590 -> '0,659'."""
    if x is None:
        return "n/a"
    return f"{x:.{nd}f}".replace(".", ",")


def sgn(x: float | None, nd: int = 3) -> str:
    """Signed, Vietnamese decimal comma, typographic minus: -0.0006 -> '−0,001' (rounded), 0.0572 -> '+0,057'."""
    if x is None:
        return "n/a"
    d = nd
    while x != 0 and float(f"{x:.{d}f}") == 0 and d < nd + 3:   # a tiny negative edge must not print as '−0,0000'
        d += 1
    s = f"{x:+.{d}f}".replace(".", ",")
    return s.replace("-", MINUS)


def pct(x: float | None, nd: int = 1, signed: bool = False) -> str:
    """Percent value that is already in percent units: 14.95 -> '14,9 %' (NBSP before the sign)."""
    if x is None:
        return "n/a"
    body = f"{x:+.{nd}f}" if signed else f"{x:.{nd}f}"
    return body.replace(".", ",").replace("-", MINUS) + NBSP + "%"


def thou(n: int | float | None) -> str:
    """Thousands separated by a no-break space: 95990 -> '95 990'."""
    if n is None:
        return "n/a"
    return f"{n:,.0f}".replace(",", NBSP)


def nb(text: str) -> str:
    """Keep a number and its percent sign together."""
    return text.replace(" %", NBSP + "%")


def ci_text(ci: list[float] | tuple[float, float] | None, nd: int = 3, signed: bool = False) -> str:
    if not ci:
        return "n/a"
    f = sgn if signed else vn
    return f"[{f(ci[0], nd)}; {f(ci[1], nd)}]"


def tint(hex_color: str, amount: float, surface: str = SURFACE) -> str:
    """Mix a series color toward the surface: amount 0 = the color itself, 1 = the surface."""
    h, s = hex_color.lstrip("#"), surface.lstrip("#")
    a = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    b = [int(s[i:i + 2], 16) for i in (0, 2, 4)]
    m = [round(x * (1 - amount) + y * amount) for x, y in zip(a, b)]
    return "#" + "".join(f"{v:02x}" for v in m)


def run_color(run: dict) -> str:
    """Color follows the entity: processed masks orange, UNet aqua, DINOv2 raw blue."""
    if str(run.get("variant", "")).startswith("PROCESSED"):
        return ORANGE
    if run.get("family") == "unet":
        return AQUA
    return BLUE


def fraction_tint(run: dict) -> float:
    """Ordinal shade inside one family: fewer training cases = lighter (only used where several runs of one
    family share a chart: per-slice profile, training curves)."""
    f = run.get("training_fraction")
    if str(run.get("variant", "")).startswith("PROCESSED") or f is None:
        return 0.0
    return {0.25: 0.55, 0.5: 0.28}.get(round(float(f), 2), 0.0)
