#!/usr/bin/env python3
"""
One command: results tables + figures, then the draft deck.

    python tools/report/build_all.py --runs-root <CARDIAC_RUNS_ROOT> `
        --runs EXP-D-025 EXP-D-050 EXP-D-100 EXP-D-PP [EXP-U-025 EXP-U-050 EXP-U-100] `
        --comparisons <CARDIAC_RUNS_ROOT>/_holdout_d39/comparisons [--local-out <dir outside git>]

It takes exactly the arguments of build_report_assets.py (see its docstring), runs it, and, if that succeeded, runs
build_deck.py on what it wrote (same --out folder). Exit code: the first non-zero code of the two steps.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_deck  # noqa: E402
import build_report_assets as assets  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    probe = argparse.ArgumentParser(add_help=False)
    probe.add_argument("--out", type=Path, default=assets.DEFAULT_OUT)
    out = probe.parse_known_args(argv)[0].out
    out = out if out.is_absolute() else Path.cwd() / out
    rc = assets.main(argv)
    if rc != 0:
        print(f"build_report_assets.py failed (exit {rc}); the deck was not rebuilt")
        return rc
    return build_deck.main(["--assets", str(out), "--out", str(out)])


if __name__ == "__main__":
    raise SystemExit(main())
