#!/usr/bin/env python3
"""
Build the team board's landing page (docs/index.html) for one execution day.

The content of a day is data, not code: management/dayNN/board.yaml holds the headline, the
facts, what the previous day delivered (with links), the day's conditions, each person's tasks
(pointing at their task packet) and the leader's decisions. This script only renders it, with
the same page shell and stylesheet as the Day 20 rebaseline (tools/board/build_rebaseline.py).

Why not build_board.py: that generator renders from management/PROJECT_STATE.yaml and the GitHub
API, and it stays the long-term board. Until the state files are fully current again, the daily
landing is rendered from the day's own committed record so the board never disagrees with it.

USAGE
    python tools/board/build_day.py --day 23
"""

from __future__ import annotations

import argparse
import html
from pathlib import Path

import yaml

from build_rebaseline import ROOT, page, topnav, day_strip, inline

REPO = "https://github.com/Drake-Phamta/cardiac-mri-workspace"


def esc(s) -> str:
    return inline(str(s))


def link_or_text(item) -> str:
    if isinstance(item, str):
        return esc(item)
    text = esc(item.get("text", ""))
    href = item.get("link")
    return f'{text} <a href="{html.escape(href)}">→</a>' if href else text


def build(cfg: dict) -> str:
    day = int(cfg["day"])
    v = cfg["verdict"]
    facts = "".join(f'<div><dt>{esc(f["label"])}</dt><dd>{esc(f["value"])} <small>{esc(f.get("small", ""))}</small></dd></div>'
                    for f in cfg.get("facts", []))
    conditions = "".join(f"<li>{link_or_text(c)}</li>" for c in cfg["conditions"]["items"])
    yesterday = cfg.get("yesterday")
    yesterday_html = ""
    if yesterday:
        items = "".join(f"<li>{link_or_text(i)}</li>" for i in yesterday["items"])
        yesterday_html = f'<section id="homqua"><h2>{esc(yesterday["title"])}</h2><ul>{items}</ul></section>'
    cards = []
    for p in cfg["people"]:
        tasks = "".join(f"<li>{link_or_text(t)}</li>" for t in p["tasks"])
        packet = p.get("packet")
        more = (f'<p class="more"><a href="{REPO}/blob/main/{html.escape(packet)}">Mở gói việc đầy đủ →</a></p>'
                if packet else "")
        cards.append(f'<article class="card"><h3>{esc(p["name"])}</h3><p class="role">{esc(p["role"])}</p>'
                     f'<ul>{tasks}</ul>{more}</article>')
    decisions = cfg.get("decisions")
    decisions_html = ""
    if decisions:
        items = "".join(f"<li>{link_or_text(d)}</li>" for d in decisions["items"])
        decisions_html = f'<section id="quyet"><h2>{esc(decisions["title"])}</h2><ol>{items}</ol></section>'
    links = "".join(f'<li><a href="{html.escape(l["href"])}">{esc(l["label"])}</a></li>' for l in cfg.get("links", []))
    tone = v.get("tone", "red")
    body = f"""<header class="masthead">
  <p class="eyebrow">Cardiac MRI Workspace · bảng điều phối</p>
  <h1>{esc(cfg["title"])}</h1>
  <p class="sub">{esc(cfg["subtitle"])}</p>
  <div class="verdict-row"><span class="pill {tone} big">{esc(v["label"])}</span><p>{esc(v["text"])}</p></div>
  <div class="days" aria-label="Lịch 30 ngày thực thi"><ol>{day_strip(day)}</ol>
    <ul class="legend">
      <li><i style="background:var(--ph-past)"></i>đã qua</li>
      <li><i style="background:var(--ph1)"></i>R1 gỡ critical path, D20–22</li>
      <li><i style="background:var(--ph2)"></i>R2 làm song song, D23–25</li>
      <li><i style="background:var(--ph3)"></i>R3 hội tụ, D26–28</li>
      <li><i style="background:var(--ph4)"></i>R4 ổn định, D29–30</li>
    </ul></div>
  <dl class="facts">{facts}</dl>
  <div class="gate"><span class="gate-title">{esc(cfg["conditions"]["title"])}</span><ol>{conditions}</ol></div>
</header>
<main>
{yesterday_html}
<section id="viec"><h2>{esc(cfg.get("people_title", "Việc của từng người"))}</h2>
  <p>{esc(cfg.get("people_note", ""))}</p>
  <div class="cards">{"".join(cards)}</div></section>
{decisions_html}
<section id="doc"><h2>Tài liệu</h2><ul class="chips">{links}</ul></section>
</main>"""
    return page("vi", f"Day {day} · Cardiac MRI Workspace", cfg.get("description", f"Bảng điều phối Day {day}"),
                topnav("", "index"), body)


def main() -> int:
    ap = argparse.ArgumentParser(description="Render docs/index.html for one day from management/dayNN/board.yaml")
    ap.add_argument("--day", type=int, required=True)
    args = ap.parse_args()
    src = ROOT / "management" / f"day{args.day:02d}" / "board.yaml"
    cfg = yaml.safe_load(src.read_text(encoding="utf-8"))
    out = ROOT / "docs" / "index.html"
    out.write_text(build(cfg), encoding="utf-8", newline="\n")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes from {src.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
