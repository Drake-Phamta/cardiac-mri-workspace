#!/usr/bin/env python3
"""
Build the execution board at docs/ from the repository's own state.

WHY A GENERATOR AND NOT A HAND-WRITTEN PAGE
    The board was hand-written for three days and drifted every single time. It
    showed A -> B -> E after that ordering was amended, listed NOT_CHECKED cells
    that had already been closed, said "5 PR" when there were 6, and carried
    zero hyperlinks so nobody could reach their own task packet from it.

    A dashboard that disagrees with the repository is worse than no dashboard,
    because people act on it.

    Everything countable now comes from the state files:

        management/PROJECT_STATE.yaml
        management/spikes/SPIKE_PHASE_STATE.yaml

    and the pull-request rows come from the GitHub API at build time. The only
    hand-written input is tools/board/days.yaml, which holds what no state file
    knows: what each person is being asked to do, and what happened on a day.

    If a number on the board is wrong, the state file is wrong - and that is a
    far better failure than a stale paragraph nobody notices.

USAGE
    python tools/board/build_board.py            # build, fetching PRs via gh
    python tools/board/build_board.py --no-gh    # skip the API, mark PRs stale

OUTPUT
    docs/board.css             one stylesheet for every page
    docs/index.html            today
    docs/archive/index.html    index of every past day
    docs/archive/day-NN.html   one page per past day
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DOCS = os.path.join(ROOT, "docs")
ARCHIVE = os.path.join(DOCS, "archive")
sys.path.insert(0, HERE)

import re                     # noqa: E402

import sections as S          # noqa: E402
import sections2 as S2        # noqa: E402
import sections3 as S3        # noqa: E402

# The state file spells names without diacritics; days.yaml uses the real ones.
PLAIN_TO_LOGIN = {
    "Vu Hung Anh": "scalliontor", "Pham Tuan Anh": "Drake-Phamta",
    "Be Quoc Khanh": "qkhanhbe", "Nguyen Gia Duc Trung": "TrungNGD195",
}


def load_yaml(path):
    import yaml
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _gh_json(args, default):
    try:
        # encoding is explicit: PR titles carry Vietnamese, and Python's default
        # on Windows is cp1252, which throws on the first non-Latin-1 byte and
        # silently leaves the board with an empty PR table.
        out = subprocess.run(["gh"] + args, capture_output=True, text=True,
                             encoding="utf-8", errors="replace",
                             cwd=ROOT, timeout=90)
        if out.returncode == 0 and out.stdout.strip():
            return json.loads(out.stdout)
    except Exception:
        pass
    return default


def gather(use_gh: bool) -> dict:
    d = load_yaml(os.path.join(HERE, "days.yaml"))
    proj = load_yaml(os.path.join(ROOT, "management", "PROJECT_STATE.yaml"))
    spk = load_yaml(os.path.join(ROOT, "management", "spikes", "SPIKE_PHASE_STATE.yaml"))

    spikes = {s["id"]: s for s in spk.get("spikes", [])}

    # reviewer matrix, straight from the state file - never retyped here
    reviews_by_login = {}
    for who, info in (spk.get("review_serialization", {}).get("reviewers", {}) or {}).items():
        login = PLAIN_TO_LOGIN.get(who)
        if login:
            reviews_by_login[login] = info.get("reviews", [])
    for m in d["members"].values():
        m["reviews"] = reviews_by_login.get(m["github"], [])

    prs, pr_note, contrib, ci = [], None, {}, {}
    if use_gh:
        prs = _gh_json(["pr", "list", "--state", "open", "--limit", "50", "--json",
                        "number,title,headRefName,createdAt,author,reviewRequests,reviews,"
                        "reviewDecision,additions,deletions,statusCheckRollup"], [])
        if not prs:
            pr_note = "Không lấy được danh sách PR lúc build; bảng có thể cũ."
        runs = _gh_json(["run", "list", "--branch", "main", "--workflow", "guardrails",
                         "--limit", "1", "--json", "conclusion,status,headSha,createdAt"], [])
        ci = runs[0] if runs else {}
        # contribution counters, over EVERY pull request, open or closed
        allp = _gh_json(["pr", "list", "--state", "all", "--limit", "100", "--json",
                         "number,author,reviews"], [])
        for m in d["members"].values():
            contrib[m["github"]] = {"prs": 0, "reviews": 0}
        for p in allp:
            a = (p.get("author") or {}).get("login")
            if a in contrib:
                contrib[a]["prs"] += 1
            for r in (p.get("reviews") or []):
                u = (r.get("author") or {}).get("login")
                if u in contrib:
                    contrib[u]["reviews"] += 1
    else:
        pr_note = "Build với --no-gh; bảng PR và số đóng góp có thể cũ."
        for m in d["members"].values():
            contrib[m["github"]] = {"prs": 0, "reviews": 0}

    # Per PR: each reviewer's latest decisive state. A later COMMENTED does not
    # erase an earlier APPROVE or CHANGES_REQUESTED - GitHub reads it the same way.
    review_asks, authored = {}, {}
    for p in prs:
        latest = {}
        for r in sorted(p.get("reviews") or [], key=lambda r: r.get("submittedAt") or ""):
            u, s = (r.get("author") or {}).get("login"), r.get("state")
            if not u:
                continue
            if s == "COMMENTED" and latest.get(u) in ("APPROVED", "CHANGES_REQUESTED"):
                continue
            latest[u] = s
        p["_latest"] = latest
        p["_approved"] = p.get("reviewDecision") == "APPROVED"
        for rq in p.get("reviewRequests") or []:
            if rq.get("login"):
                review_asks.setdefault(rq["login"], []).append(p["number"])
        a = (p.get("author") or {}).get("login")
        if a:
            authored.setdefault(a, []).append(p["number"])

    # plain state-file spelling -> the member's real name, for display only
    by_login = {m["github"]: m["name"] for m in d["members"].values()}
    names = {plain: by_login.get(login, plain) for plain, login in PLAIN_TO_LOGIN.items()}

    return {
        "d": d, "proj": proj, "spk": spk, "spikes": spikes, "names": names,
        "queue": spk.get("device_measurement_queue", {}) or {},
        "prs": prs, "pr_note": pr_note, "contrib": contrib, "ci": ci,
        "review_asks": review_asks, "authored": authored,
        "spec": spec_check(), "risk_titles": risk_titles(),
        "built_at": dt.datetime.now().astimezone().strftime("%d/%m/%Y %H:%M"),
    }


def spec_check():
    """Re-hash the frozen spec at build time: (files matching, files listed).

    Hashes the committed blob via `git show`, not the working copy, so a CRLF
    checkout cannot make it pass or fail for a reason unrelated to the file.
    """
    import hashlib
    base = os.path.join(ROOT, "docs", "specs", "v1.0")
    try:
        with open(os.path.join(base, "SPEC_MANIFEST_SHA256.txt"), encoding="utf-8") as f:
            rows = [ln.split(None, 1) for ln in f if ln.strip()]
    except OSError:
        return (None, None)
    ok = 0
    for want, name in rows:
        name = name.strip().lstrip("*")
        blob = subprocess.run(["git", "show", f"HEAD:docs/specs/v1.0/{name}"],
                              capture_output=True, cwd=ROOT).stdout
        ok += hashlib.sha256(blob).hexdigest() == want.lower()
    return (ok, len(rows))


def risk_titles():
    """RISK-ID -> title, from the '### RISK-X — title' headings of the register."""
    import re
    out = {}
    try:
        with open(os.path.join(ROOT, "management", "readiness", "RISK_REGISTER_INITIAL.md"),
                  encoding="utf-8") as f:
            for ln in f:
                m = re.match(r"^#{2,4}\s+(RISK-[A-Z0-9-]+)\s+[—-]+\s+(.+?)\s*$", ln)
                if m:
                    out[m.group(1)] = m.group(2)
    except OSError:
        pass
    return out


def page(title, desc, body, depth=0):
    up = "../" * depth
    return (f'<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{S.e(title)}</title>\n'
            f'<meta name="description" content="{S.e(desc)}">\n'
            f'<link rel="stylesheet" href="{up}board.css">\n</head>\n<body>\n'
            f'<div class="wrap">\n{body}\n</div>\n</body>\n</html>\n')


CSS_PATH = os.path.join(HERE, "board.css")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-gh", action="store_true", help="skip the GitHub API")
    args = ap.parse_args()

    g = gather(not args.no_gh)
    t = g["d"]["today"]
    os.makedirs(ARCHIVE, exist_ok=True)

    with open(CSS_PATH, encoding="utf-8") as f:
        css = f.read()
    for p in (os.path.join(DOCS, "board.css"),):
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(css)

    body = "\n".join([
        S.nav("Hôm nay", anchors=True),
        S.header_block(g, S3.timeline(g)),
        S.section_today(g),
        S.section_people(g),
        S3.section_waits(g),
        S.section_reviews(g),
        S3.section_path(g),
        S3.section_spikes(g),
        S3.section_decisions(g),
        S3.section_device(g),
        S3.section_risks(g),
        S.section_contrib(g),
        S2.section_history(g),
        S2.section_incident(g),
        S2.section_stop(g),
        S2.footer_block(g),
    ])
    # Number the section headings A, B, C... in page order (sections write a `§` placeholder).
    letters = iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    body = re.sub(r'<span class="num">§</span>',
                  lambda _m: f'<span class="num">{next(letters)}</span>', body)
    idx = page(f"DAY {t['day']} · EXECUTION · Cardiac MRI Workspace",
               f"Bảng điều phối Day {t['day']}, {t['date']}. Nhiệm vụ từng người, tiến độ "
               f"tiêu chí nghiệm thu, hàng đợi review, và lịch sử các ngày trước.",
               body)
    with open(os.path.join(DOCS, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(idx)

    n = 0
    for h in g["d"]["history"]:
        out = page(f"Day {h['day']} · {h['date']} · Cardiac MRI Workspace",
                   f"Lưu trữ Day {h['day']}: {h['title']}",
                   S2.archive_day(g, h), depth=1)
        with open(os.path.join(ARCHIVE, f"day-{h['day']:02d}.html"), "w",
                  encoding="utf-8", newline="\n") as f:
            f.write(out)
        n += 1
    with open(os.path.join(ARCHIVE, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page("Lịch sử ngày · Cardiac MRI Workspace",
                     "Mỗi ngày một trang: đã xong gì kèm bằng chứng, trượt gì, quyết định nào.",
                     S2.archive_index(g), depth=1))

    print(f"  docs/index.html           Day {t['day']}")
    print(f"  docs/archive/index.html   {n} ngày")
    for h in g["d"]["history"]:
        print(f"  docs/archive/day-{h['day']:02d}.html")
    print(f"  docs/board.css")
    if g.get("pr_note"):
        print(f"\n  ! {g['pr_note']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
