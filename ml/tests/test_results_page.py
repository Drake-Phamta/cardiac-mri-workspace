"""The public results page (tools/board/build_results.py) is a pure function of the committed aggregate.

Synthetic edits of the committed aggregate only (the aggregate holds no per-case value); nothing is read from a run
directory. Run from the repository root:  python -m pytest ml/tests/test_results_page.py -q
"""

from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "board"))
import build_results as BR  # noqa: E402

AGGREGATE = ROOT / "management" / "day39" / "results_aggregate.json"
PAGE = ROOT / "docs" / "results" / "holdout-day39.html"
LABEL_HEIGHT = 14.0     # the value labels are 12.5 px text: two baselines closer than this print on top of each other


@pytest.fixture(scope="module")
def aggregate() -> dict:
    return json.loads(AGGREGATE.read_text(encoding="utf-8"))


def with_unet(aggregate: dict, delta: float) -> dict:
    """The aggregate with a UNet run next to every DINOv2 run, its Dice mean `delta` away from the DINOv2 one."""
    doc = copy.deepcopy(aggregate)
    for run in [r for r in aggregate["runs"] if r["experiment_id"] in ("EXP-D-025", "EXP-D-050", "EXP-D-100")]:
        twin = copy.deepcopy(run)
        twin["experiment_id"] = run["experiment_id"].replace("EXP-D-", "EXP-U-")
        twin["dice_mean"] = round(run["dice_mean"] + delta, 4)
        twin["dice_ci95"] = [round(value + delta, 4) for value in run["dice_ci95"]]
        doc["runs"].append(twin)
    return doc


def trend_labels(doc: dict) -> list:
    """(x, y, text) of every value label of the trend chart, which is the chart that carries the circles."""
    svg = BR.trend(doc["runs"])
    return [(float(x), float(y), text) for x, y, text in
            re.findall(r'<text class="lbl" x="([\d.]+)" y="([\d.]+)" text-anchor="\w+">(\d,\d{3})</text>', svg)]


def test_the_committed_page_is_what_the_committed_aggregate_renders(aggregate):
    """The page is generated, never edited by hand: rebuilding it from the aggregate reproduces it byte for byte."""
    assert BR.build(aggregate) == PAGE.read_text(encoding="utf-8")


def test_without_unet_every_label_stays_below_its_point(aggregate):
    svg = BR.trend(aggregate["runs"])
    circles = [(float(x), float(y)) for x, y in re.findall(r'<circle class="s1" cx="([\d.]+)" cy="([\d.]+)"', svg)]
    labels = trend_labels(aggregate)
    assert len(circles) == len(labels) == 3
    for (cx, cy), (_x, ly, _text) in zip(circles, labels):
        assert ly == pytest.approx(cy + 20, abs=0.11)


@pytest.mark.parametrize("delta", [0.0, 0.001, -0.001, 0.004, -0.004, 0.02, -0.02])
def test_two_close_means_never_print_their_labels_on_top_of_each_other(aggregate, delta):
    """QA_PR100_103_D39 #101 NB-5: both families used to put the label 20 px below the point, at the same x."""
    labels = trend_labels(with_unet(aggregate, delta))
    assert len(labels) == 6
    by_x = {}
    for x, y, text in labels:
        by_x.setdefault(round(x), []).append((y, text))
    assert len(by_x) == 3 and all(len(pair) == 2 for pair in by_x.values())
    for pair in by_x.values():
        (y1, _a), (y2, _b) = pair
        assert abs(y1 - y2) >= LABEL_HEIGHT, f"labels {pair} overlap at delta {delta}"


def chart_y(value: float) -> float:
    """The trend chart's y scale (build_results.trend: h 300, top 16, bottom 40, Dice 0.45 .. 0.75)."""
    top, bottom, h, lo, hi = 16, 40, 300, 0.45, 0.75
    return top + (hi - value) / (hi - lo) * (h - top - bottom)


def circles(svg: str, family_class: str) -> dict:
    return {round(float(x)): float(y) for x, y in re.findall(rf'<circle class="{family_class}" cx="([\d.]+)" cy="([\d.]+)"', svg)}


@pytest.mark.parametrize("delta", [0.05, -0.05])
def test_the_higher_mean_is_labelled_above_its_point_and_the_lower_below_its_own(aggregate, delta):
    """Each label is found by its own text (the family's Dice mean), so a swapped rule cannot pass."""
    doc = with_unet(aggregate, delta)
    svg = BR.trend(doc["runs"])
    dino, unet = circles(svg, "s1"), circles(svg, "s3")
    assert len(dino) == len(unet) == 3
    label_of = {text: y for _x, y, text in trend_labels(doc)}
    for run in doc["runs"]:
        if run["experiment_id"] not in ("EXP-D-025", "EXP-D-050", "EXP-D-100", "EXP-U-025", "EXP-U-050", "EXP-U-100"):
            continue
        twin_id = ("EXP-U-" if run["experiment_id"].startswith("EXP-D-") else "EXP-D-") + run["experiment_id"][6:]
        twin = next(r for r in doc["runs"] if r["experiment_id"] == twin_id)
        mine = unet if run["experiment_id"].startswith("EXP-U-") else dino
        # the column of this run: the circle whose y matches its Dice mean on the chart scale
        column = next(c for c, y in mine.items() if abs(y - chart_y(run["dice_mean"])) < 0.11)
        text = BR.f3(run["dice_mean"])
        expected = mine[column] + (-12 if run["dice_mean"] > twin["dice_mean"] else 20)
        assert label_of[text] == pytest.approx(expected, abs=0.11), (run["experiment_id"], text)


def test_a_tie_puts_the_unet_label_above_and_the_dinov2_label_below(aggregate):
    doc = with_unet(aggregate, 0.0)
    labels = trend_labels(doc)          # the families are drawn DINOv2 first, then UNet: within one x, in that order
    svg = BR.trend(doc["runs"])
    dino = circles(svg, "s1")
    assert len(labels) == 6
    by_x = {}
    for x, y, _text in labels:
        by_x.setdefault(round(x), []).append(y)
    for column, circle_y in dino.items():
        nearest = min(by_x, key=lambda lx: abs(lx - column))
        first, second = by_x[nearest]
        assert first == pytest.approx(circle_y + 20, abs=0.11), "the DINOv2 label stays below its point"
        assert second == pytest.approx(circle_y - 12, abs=0.11), "the UNet label goes above its point"
