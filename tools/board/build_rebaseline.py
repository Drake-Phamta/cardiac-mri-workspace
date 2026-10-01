#!/usr/bin/env python3
"""
Build the Day 20 rebaseline pages for the team board on GitHub Pages.

WHY THIS EXISTS BESIDE build_board.py
    build_board.py renders "today" from management/PROJECT_STATE.yaml, and that
    file stopped at Day 11. Running it now would publish a board that disagrees
    with the repository - the exact failure it was written to prevent. So the
    Day 20 rebaseline is rendered from its own committed source instead:

        management/day20/DAY20_REBASELINE.md

    Once PROJECT_STATE.yaml and tools/board/days.yaml are brought up to date,
    build_board.py takes docs/index.html back. The rebaseline page itself stays
    at docs/rebaseline/day-20.html.

USAGE
    python tools/board/build_rebaseline.py

OUTPUT
    docs/rebaseline/day-20.html    the full report
    docs/index.html                the Day 20 landing page (Vietnamese)

Only the markdown subset the report uses is converted: headings, pipe tables,
nested lists, blockquotes, fenced code, bold/italic/inline code. No dependency.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "management" / "day20" / "DAY20_REBASELINE.md"
OUT_REPORT = ROOT / "docs" / "rebaseline" / "day-20.html"
OUT_INDEX = ROOT / "docs" / "index.html"
REPO = "https://github.com/Drake-Phamta/cardiac-mri-workspace"

TOC = {
    "context": "Bối cảnh", "s1": "Ảnh chụp Day 20", "s2": "Đã thay đổi gì",
    "s3": "Sổ backlog", "s4": "Khoảng trống MUST", "s5": "Critical path",
    "s6": "Khả thi Day 30", "s7": "Kế hoạch phục hồi", "s8": "Phân việc từng ngày",
    "s9": "Ma trận review", "s10": "ML và compute", "s11": "Lịch máy Galaxy",
    "s12": "Kế hoạch merge", "s13": "Phân loại scope", "s14": "Trigger phục hồi",
    "s15": "24 giờ tới", "s16": "Brief từng người", "s17": "Prompt chat B–E",
    "s18": "Quyết định leader", "verdict": "Kết luận",
}


# --------------------------------------------------------------------------
# markdown -> html
# --------------------------------------------------------------------------

def inline(s: str) -> str:
    codes = []

    def keep_code(m):
        codes.append("<code>" + html.escape(m.group(1), quote=False) + "</code>")
        return "\x00%d\x00" % (len(codes) - 1)

    s = re.sub(r"`([^`]+)`", keep_code, s)
    s = html.escape(s, quote=False)
    s = re.sub(r"(https://[^\s<)]+)", r'<a href="\1">\1</a>', s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(^|[\s(])\*([A-Za-zÀ-ỹ\"][^*\n]*?)\*(?=[\s.,;:)]|$)", r"\1<em>\2</em>", s)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], s)


def split_row(line: str):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def render_table(head, body_lines):
    ncols = len(head)
    cls = "tablewrap" + (" wide" if ncols >= 12 else " mid" if ncols >= 7 else "")
    out = [f'<div class="{cls}"><table><thead><tr>']
    out += [f"<th>{inline(c)}</th>" for c in head]
    out.append("</tr></thead><tbody>")
    for r in body_lines:
        out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in split_row(r)) + "</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


def render_list(block):
    items = []
    for line in block:
        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            items.append([len(m.group(1)), m.group(2).endswith("."), m.group(3)])
        else:
            items[-1][2] += " " + line.strip()
    parts, stack = [], []
    for indent, ordered, text in items:
        tag = "ol" if ordered else "ul"
        while stack and indent < stack[-1][0]:
            parts.append("</li></%s>" % stack.pop()[1])
        if stack and indent == stack[-1][0]:
            parts.append("</li><li>" + inline(text))
        else:
            parts.append("<%s><li>" % tag + inline(text))
            stack.append((indent, tag))
    while stack:
        parts.append("</li></%s>" % stack.pop()[1])
    return "".join(parts)


def section_id(title: str) -> str:
    m = re.match(r"^(\d+)\s", title)
    if m:
        return "s" + m.group(1)
    if title.upper().startswith("VERDICT"):
        return "verdict"
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def convert(md: str) -> str:
    lines = md.split("\n")
    out, i, n = [], 0, len(lines)
    current, in_brief, brief_no = None, False, 0
    list_re = re.compile(r"^\s*([-*]|\d+\.)\s+")
    block_start = re.compile(r"^(#{1,3}\s|\||>|```|---\s*$)")

    def close_brief():
        nonlocal in_brief
        if in_brief:
            out.append("</div></div>")
            in_brief = False

    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped == "---":
            i += 1
            continue
        if stripped.startswith("```"):
            i += 1
            code = []
            while i < n and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            body = html.escape("\n".join(code), quote=False)
            if current == "s17":
                out.append('<div class="codeblock"><button type="button" class="copy" '
                           'data-label="Copy prompt">Copy prompt</button>'
                           f'<pre class="prompt"><code>{body}</code></pre></div>')
            else:
                out.append(f'<pre class="diagram"><code>{body}</code></pre>')
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            level, title = len(m.group(1)), m.group(2).strip()
            i += 1
            if level == 1:
                continue
            if level == 2:
                close_brief()
                if current:
                    out.append("</section>")
                current = section_id(title)
                num = re.match(r"^(\d+)\s·\s(.*)$", title)
                heading = (f'<span class="secnum">§{num.group(1)}</span>{inline(num.group(2))}'
                           if num else inline(title))
                out.append(f'<section id="{current}"><h2>{heading}</h2>')
            elif current == "s16":
                close_brief()
                brief_no += 1
                in_brief = True
                out.append(f'<div class="brief" lang="vi"><div class="brief-bar"><button type="button" '
                           f'class="copy" data-label="Chép brief">Chép brief</button></div>'
                           f'<div class="brief-body" id="brief-{brief_no}"><h3>{inline(title)}</h3>')
            else:
                out.append(f"<h3>{inline(title)}</h3>")
            continue
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|(\s*:?-{3,}:?\s*\|)+\s*$", lines[i + 1].strip()):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(render_table(split_row(rows[0]), rows[2:]))
            continue
        if stripped.startswith(">"):
            quote = []
            while i < n and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            out.append("<blockquote><p>" + inline(" ".join(q for q in quote if q)) + "</p></blockquote>")
            continue
        if list_re.match(line):
            block = []
            while i < n and lines[i].strip() and (list_re.match(lines[i]) or lines[i].startswith("  ")):
                block.append(lines[i])
                i += 1
            out.append(render_list(block))
            continue
        para = []
        while i < n and lines[i].strip() and not block_start.match(lines[i].strip()) and not list_re.match(lines[i]):
            para.append(lines[i].strip())
            i += 1
        out.append("<p>" + inline(" ".join(para)) + "</p>")
    close_brief()
    if current:
        out.append("</section>")
    return "\n".join(out)


def decorate(body: str) -> str:
    for word, cls in (("AMBER", "amber"), ("RED", "red"), ("GREEN", "green")):
        body = body.replace(f"<strong>{word}</strong>", f'<span class="pill {cls}">{word}</span>')
    for p, cls in (("P0", "p0"), ("P1", "p1"), ("P2", "p2"), ("P3", "p3")):
        body = body.replace(f"<td><strong>{p}</strong>", f'<td><span class="pill {cls}">{p}</span>')
        body = body.replace(f"<td>{p}</td>", f'<td><span class="pill {cls}">{p}</span></td>')
    states = {"IN_PROGRESS": "amber", "BLOCKED": "red", "NOT_STARTED": "neutral",
              "IMPLEMENTED_NOT_ACCEPTED": "p2", "ACCEPTED": "green"}
    for word, cls in states.items():
        body = re.sub(rf"<td>{word}\b", f'<td><span class="pill {cls}">{word}</span>', body)
    return body


# --------------------------------------------------------------------------
# shared page parts
# --------------------------------------------------------------------------

def day_strip() -> str:
    cells = []
    for d in range(1, 31):
        if d < 20:
            cls, tip = "past", "đã qua"
        elif d <= 22:
            cls, tip = "r1", "R1 gỡ critical path"
        elif d <= 25:
            cls, tip = "r2", "R2 làm song song sản phẩm và ML"
        elif d <= 28:
            cls, tip = "r3", "R3 hội tụ"
        else:
            cls, tip = "r4", "R4 ổn định"
        if d == 20:
            cls += " today"
            tip = "hôm nay, " + tip
        label = str(d) if d in (1, 5, 10, 15, 20, 25, 30) else ""
        cells.append(f'<li class="{cls}" title="Day {d}: {tip}"><span>{label}</span></li>')
    return "".join(cells)


FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700'
         '&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap">')

CSS = """
/* Layout: masthead summary, then a sticky section index beside one long report column; tables scroll in their own frames. */
:root {
  --bg: #F4F6F9; --surface: #FFFFFF; --fg: #17202B; --muted: #596574; --rule: #D6DCE4;
  --accent: #22598C; --accent-soft: #E2ECF6; --code-bg: #ECEFF4;
  --red: #B42318; --red-soft: #FCE7E4; --amber: #93560A; --amber-soft: #FDF0D5;
  --green: #1F7547; --green-soft: #DFF2E6; --neutral-soft: #E7EAEF;
  --ph-past: #CBD2DC; --ph1: #22598C; --ph2: #4F83B5; --ph3: #B7791F; --ph4: #2E8B57;
  --font-display: "Barlow Semi Condensed", "Arial Narrow", "Segoe UI", sans-serif;
  --font-body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0F141A; --surface: #161C24; --fg: #E2E7EE; --muted: #9AA6B5; --rule: #2B343F;
    --accent: #8DB9E6; --accent-soft: #1B2C3E; --code-bg: #1C2430;
    --red: #FF8F84; --red-soft: #3B1E1B; --amber: #F2BE5C; --amber-soft: #392B12;
    --green: #7FD2A1; --green-soft: #15301F; --neutral-soft: #242C36;
    --ph-past: #2E3844; --ph1: #6FA3D8; --ph2: #4B7BAA; --ph3: #C99035; --ph4: #4FAE78;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font-body); font-size: 15.5px; line-height: 1.55; }
.page { max-width: 1360px; margin: 0 auto; padding-inline: 20px; padding-block: 12px 72px; }
.topnav { display: flex; flex-wrap: wrap; gap: 4px 6px; padding-block: 10px; margin-bottom: 18px; border-bottom: 1px solid var(--rule); font-size: 14px; }
.topnav a { color: var(--fg); text-decoration: none; padding: 4px 10px; border-radius: 4px; }
.topnav a:hover { background: var(--accent-soft); color: var(--accent); }
.topnav a.on { background: var(--fg); color: var(--bg); }
.topnav .sep { flex: 1; }
.masthead { display: grid; gap: 18px; padding-bottom: 28px; border-bottom: 1px solid var(--rule); margin-bottom: 28px; }
.eyebrow { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: clamp(34px, 5vw, 52px); line-height: 1.05; letter-spacing: -.01em; text-wrap: balance; }
.sub { margin: 0; color: var(--muted); font-size: 16px; }
.verdict-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.verdict-row p { margin: 0; color: var(--muted); max-width: 72ch; }
.days ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(30, minmax(0, 1fr)); gap: 3px; }
.days li { height: 28px; border-radius: 3px; display: flex; align-items: flex-end; justify-content: center; }
.days li span { font-family: var(--font-mono); font-size: 10px; line-height: 1; color: var(--muted); transform: translateY(16px); }
.days .past { background: var(--ph-past); }
.days .r1 { background: var(--ph1); }
.days .r2 { background: var(--ph2); }
.days .r3 { background: var(--ph3); }
.days .r4 { background: var(--ph4); }
.days .today { outline: 2px solid var(--fg); outline-offset: 2px; }
.days .today span { color: var(--fg); font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 22px 0 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted); }
.legend li { display: flex; align-items: center; gap: 6px; }
.legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; }
.facts div { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; min-width: 0; }
.facts dt { font-size: 13px; color: var(--muted); }
.facts dd { margin: 2px 0 0; font-family: var(--font-display); font-weight: 700; font-size: 28px; font-variant-numeric: tabular-nums; }
.facts dd small { font-family: var(--font-body); font-weight: 400; font-size: 13px; color: var(--muted); }
.gate { background: var(--surface); border: 1px solid var(--rule); border-left: 4px solid var(--red); border-radius: 6px; padding: 14px 18px; }
.gate .gate-title { display: block; font-family: var(--font-display); font-weight: 600; font-size: 17px; margin-bottom: 6px; }
.gate ol { margin: 0; padding-left: 20px; display: grid; gap: 2px; }
.layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 40px; }
nav.toc { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow: auto; }
nav.toc p { margin: 0 0 8px; font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
nav.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
nav.toc a { display: flex; gap: 8px; padding: 4px 8px; border-radius: 4px; color: var(--fg); text-decoration: none; font-size: 14px; }
nav.toc a b { font-family: var(--font-mono); font-weight: 400; font-size: 12px; color: var(--muted); min-width: 22px; padding-top: 2px; }
nav.toc a:hover, nav.toc a.active { background: var(--accent-soft); color: var(--accent); }
main { min-width: 0; }
section { padding-top: 18px; margin-bottom: 36px; scroll-margin-top: 12px; }
h2 { font-family: var(--font-display); font-weight: 600; font-size: 25px; line-height: 1.2; letter-spacing: .01em; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid var(--fg); display: flex; gap: 12px; align-items: baseline; text-wrap: balance; }
.secnum { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--accent); }
h3 { font-family: var(--font-display); font-weight: 600; font-size: 19px; margin: 24px 0 8px; }
p, ul, ol, blockquote { max-width: 80ch; }
p { margin: 10px 0; }
ul, ol { padding-left: 22px; margin: 8px 0; }
li { margin: 3px 0; }
a { color: var(--accent); }
blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 6px 6px 0; }
blockquote p { margin: 0; }
code { font-family: var(--font-mono); font-size: .84em; background: var(--code-bg); padding: .08em .35em; border-radius: 4px; overflow-wrap: anywhere; }
pre { margin: 12px 0; background: var(--code-bg); border: 1px solid var(--rule); border-radius: 6px; padding: 14px 16px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; }
pre code { background: none; padding: 0; font-size: inherit; overflow-wrap: normal; }
pre.prompt { white-space: pre-wrap; max-height: 520px; overflow-y: auto; }
.tablewrap { overflow-x: auto; margin: 12px 0 16px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }
.tablewrap.mid table { min-width: 1080px; }
.tablewrap.wide table { min-width: 1900px; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; line-height: 1.45; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; text-align: left; }
tbody tr:last-child td { border-bottom: 0; }
th { font-family: var(--font-display); font-weight: 600; font-size: 12.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); background: var(--code-bg); white-space: nowrap; }
td { font-variant-numeric: tabular-nums; }
tbody tr:hover td { background: var(--accent-soft); }
.pill { display: inline-block; font-family: var(--font-display); font-weight: 600; font-size: 12.5px; letter-spacing: .05em; line-height: 1.5; padding: 0 8px; border-radius: 999px; white-space: nowrap; }
.pill.red, .pill.p0 { background: var(--red-soft); color: var(--red); }
.pill.amber, .pill.p1 { background: var(--amber-soft); color: var(--amber); }
.pill.green { background: var(--green-soft); color: var(--green); }
.pill.p2 { background: var(--accent-soft); color: var(--accent); }
.pill.p3, .pill.neutral { background: var(--neutral-soft); color: var(--muted); }
.pill.big { font-size: 15px; padding: 4px 14px; letter-spacing: .07em; }
.brief { border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); margin: 16px 0; }
.brief-bar { display: flex; justify-content: flex-end; padding: 8px 10px 0; }
.brief-body { padding: 0 18px 14px; }
.brief-body h3 { margin-top: 0; }
.codeblock { position: relative; }
.codeblock .copy { position: absolute; top: 8px; right: 10px; }
button.copy { font: 600 13px var(--font-body); color: var(--accent); background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
button.copy:hover { border-color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#verdict h2 { border-bottom-color: var(--red); }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 14px 16px; min-width: 0; display: grid; gap: 6px; align-content: start; }
.card h3 { margin: 0; font-size: 18px; }
.card .role { margin: 0; font-size: 13px; color: var(--muted); }
.card ul { margin: 0; }
.card .more { margin: 4px 0 0; font-size: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 8px 0 0; max-width: none; }
.chips a { display: inline-block; padding: 4px 10px; border: 1px solid var(--rule); border-radius: 999px; background: var(--surface); text-decoration: none; font-size: 14px; }
.note { font-size: 14px; color: var(--muted); }
@media (max-width: 980px) {
  .layout { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  nav.toc { position: static; max-height: none; }
  nav.toc ol { display: flex; flex-wrap: wrap; gap: 4px; }
  nav.toc a { border: 1px solid var(--rule); background: var(--surface); }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cards { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 520px) {
  .days ol { gap: 2px; }
  .days li { height: 22px; }
  .facts dd { font-size: 23px; }
  h2 { font-size: 21px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
"""

SCRIPT = """<script>
(function () {
  function reset(btn, ms) { setTimeout(function () { btn.textContent = btn.dataset.label; }, ms); }
  function selectNode(node, btn) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    btn.textContent = "Đã chọn, nhấn Ctrl+C";
    reset(btn, 2600);
  }
  document.querySelectorAll("button.copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var holder = btn.closest(".brief") || btn.closest(".codeblock");
      var node = holder.querySelector(".brief-body") || holder.querySelector("pre");
      var text = node.innerText.trim();
      try {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Đã chép";
          reset(btn, 1600);
        }, function () { selectNode(node, btn); });
      } catch (e) {
        selectNode(node, btn);
      }
    });
  });
  var links = {};
  document.querySelectorAll("nav.toc a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window && Object.keys(links).length) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && links[e.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove("active"); });
          links[e.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "0px 0px -75% 0px" });
    document.querySelectorAll("main section").forEach(function (s) { obs.observe(s); });
  }
})();
</script>"""


def page(lang, title, description, nav, body):
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{html.escape(description)}">
{FONTS}
<style>{CSS}</style>
</head>
<body>
<div class="page">
{nav}
{body}
</div>
{SCRIPT}
</body>
</html>
"""


def topnav(prefix: str, on: str) -> str:
    items = [
        ("index.html", "Day 20 · hôm nay", "index"),
        ("rebaseline/day-20.html", "Bản rà soát đầy đủ", "report"),
        ("archive/day-09.html", "Bảng Day 9 (lưu trữ)", "day9"),
        ("archive/index.html", "Các ngày trước", "archive"),
    ]
    on_attr = ' class="on"'
    links = "".join(f'<a href="{prefix}{href}"{on_attr if key == on else ""}>{label}</a>'
                    for href, label, key in items)
    return (f'<nav class="topnav" aria-label="Trang">{links}<span class="sep"></span>'
            f'<a href="{REPO}">GitHub</a><a href="{REPO}/pulls">PR đang mở</a></nav>')


MASTHEAD_CORE = """
  <div class="verdict-row">
    <span class="pill red big">DAY30 OUTCOME AT RISK</span>
    <p>Rủi ro không kịp Day 30. Có một đường đi tới Day 30 nhưng không còn ngày dự phòng nào. Tái dựng chỉ-đọc từ git, GitHub API và hồ sơ quản lý, không merge hay sửa gì trong lúc làm.</p>
  </div>
  <div class="days" aria-label="Lịch 30 ngày thực thi">
    <ol>__DAYS__</ol>
    <ul class="legend">
      <li><i style="background:var(--ph-past)"></i>Day 1–19 đã qua</li>
      <li><i style="background:var(--ph1)"></i>R1 gỡ critical path, D20–22</li>
      <li><i style="background:var(--ph2)"></i>R2 làm song song, D23–25</li>
      <li><i style="background:var(--ph3)"></i>R3 hội tụ, D26–28</li>
      <li><i style="background:var(--ph4)"></i>R4 ổn định, D29–30</li>
    </ul>
  </div>
  <dl class="facts">
    <div><dt>MUST đã nghiệm thu</dt><dd>0 <small>trên 33</small></dd></div>
    <div><dt>Lượt train thật đã chạy</dt><dd>0 <small>trên 6 + ablation</small></dd></div>
    <div><dt>PR đang mở</dt><dd>15 <small>3 PR sẵn sàng merge</small></dd></div>
    <div><dt>Giờ làm tập trung D20–28</dt><dd>203 <small>cần · 175 có</small></dd></div>
  </dl>
  <div class="gate">
    <span class="gate-title">Chỉ chuyển sang RECOVERABLE nếu tới 17:00 thứ Tư 30/09:</span>
    <ol>
      <li>GATE-SPLIT-01 đã đóng (#35 được duyệt lại đúng head, QA đạt, đã merge).</li>
      <li>Một job GPU của Spike C1 đang chạy trên máy được duyệt.</li>
      <li>Spike A được ACCEPTED và #48–#53 đã lên <code>main</code>.</li>
      <li>Cả bốn người đều hoạt động và đã khai báo giờ làm tới Day 30.</li>
      <li>Backend trả lời <code>/health</code> khi gọi từ điện thoại.</li>
    </ol>
  </div>
"""


def build_report(md: str) -> str:
    body = decorate(convert(md))
    ids = re.findall(r'<section id="([^"]+)">', body)
    toc = "".join(
        f'<li><a href="#{sid}"><b>{sid[1:] if re.match(r"^s[0-9]+$", sid) else ""}</b>{html.escape(TOC.get(sid, sid))}</a></li>'
        for sid in ids)
    masthead = f"""<header class="masthead">
  <p class="eyebrow">Cardiac MRI Workspace · Project Control</p>
  <h1>Day 20 Rebaseline</h1>
  <p class="sub">Thứ Ba 29/09/2026 · Execution Day 20 / 30 · Day 30 là thứ Sáu 09/10/2026, không lùi</p>
  {MASTHEAD_CORE.replace("__DAYS__", day_strip())}
</header>"""
    content = (f'{masthead}<div class="layout"><nav class="toc" aria-label="Các mục"><p>Các mục</p>'
               f'<ol>{toc}</ol></nav><main lang="en">\n{body}\n</main></div>')
    return page("vi", "Day 20 Rebaseline",
                "Rà soát lại toàn dự án ở Day 20/30: trạng thái thật, backlog, critical path, kế hoạch bốn người tới Day 30, brief từng người và prompt cho các chat.",
                topnav("../", "report"), content), len(ids)


PEOPLE = [
    ("Phạm Tuấn Anh", "V1 Case Explorer · Tích hợp/CI · Điều phối", 1, [
        "Tối nay: merge #49 → #48 → #26 (đã có duyệt hợp lệ đúng head); đẩy commit C1-prep thành PR cho Khánh; sửa conflict <code>RESULT.md</code> của #41.",
        "20:30 QA #35 cùng CHAT E, merge và đóng GATE-SPLIT-01 nếu đạt.",
        "Chốt tối nay: DR-016 (máy train), CP-07 (tác giả tự merge), quyền Mac mini cho Trung, giữ #54.",
        "D21: quyết DR-010a và case chỉ-suy-luận trước 10:00; soạn TECH_STACK_ADR; cầm máy Galaxy slot S-1 lúc 18:00.",
    ]),
    ("Vũ Hùng Anh", "V2 3D / lỗi không gian · Hình ảnh / Hình học", 2, [
        "Tối nay: duyệt lại #41 sau rebase; duyệt PR C1-prep; dựng mesh GT thật ở 3 mức decimation (code #55).",
        "D21: hoàn tất Spike B — B5, B6, B7, B9, B12, B13 (đề xuất DR-008c), B15; thiết kế phiên máy S-1 lúc 18:00.",
        "Duyệt #53 (09:00) và loader C1 của Khánh (13:00–15:00).",
        "Không bao giờ nới ngưỡng ±1 lát; B5 trượt mọi mức thì ghi NEGATIVE_RESULT và báo ngay.",
    ]),
    ("Bế Quốc Khánh", "V3 Experiment / Cohort · Huấn luyện / Đánh giá ML", 3, [
        "Tối nay: xác nhận head #35 là cuối; <strong>khai báo RTX 4050</strong> (chạy qua đêm D21–D24 được không); ghi môi trường; bắt đầu loader dữ liệu thật.",
        "D21: C1 đầy đủ — preflight trên <code>main</code> (băm đúng blob git), <code>run_feasibility</code>, thử hội tụ cho cả hai họ; job GPU chạy trước 14:00; RESULT trước 22:00.",
        "D22: ADR-ML-001 trước 10:00 (frozen hay full DINOv2 theo PR-SCI-03) để leader đóng GATE-ML-01 lúc 12:00.",
        "Không chạm holdout trước khi checkpoint và morphology đã đóng băng; không merge #54 ở dạng hiện tại.",
    ]),
    ("Nguyễn Gia Đức Trung", "V4 Review / Findings · Backend / Lưu trữ / Nạp dữ liệu", 4, [
        "Tối nay 19:00–20:30: <strong>duyệt lại #35 ở head <code>7b72ce8</code></strong> (chạy <code>verify_subsets</code> + <code>preflight</code> trên blob). Sau đó chạy QA-004 cho Spike A nếu #41 và #49 đã merge.",
        "D21 10:00: duyệt lại #44 (Spike B B10/B11).",
        "D21: contract v1.0 (DR-010a + enum review NOT_REVIEWED/ACCEPTED/FLAGGED/CORRECTED + cờ case chỉ-suy-luận).",
        "D21: backend Python trên Mac mini, <code>/health</code> gọi được từ điện thoại trước cuối ngày.",
    ]),
]


def build_index() -> str:
    cards = []
    for name, role, n, lines in PEOPLE:
        items = "".join(f"<li>{t}</li>" for t in lines)
        cards.append(f'<article class="card"><h3>{name}</h3><p class="role">{role}</p><ul>{items}</ul>'
                     f'<p class="more"><a href="rebaseline/day-20.html#brief-{n}">Mở brief đầy đủ →</a></p></article>')
    chips = "".join(f'<li><a href="rebaseline/day-20.html#{sid}">{html.escape(label)}</a></li>' for sid, label in TOC.items())
    body = f"""<header class="masthead">
  <p class="eyebrow">Cardiac MRI Workspace · bảng điều phối</p>
  <h1>Day 20 — rà soát lại toàn dự án</h1>
  <p class="sub">Thứ Ba 29/09/2026 · còn 10 ngày tới Day 30 (thứ Sáu 09/10/2026, không lùi)</p>
  {MASTHEAD_CORE.replace("__DAYS__", day_strip())}
</header>
<main>
<section id="viec">
  <h2>Việc của từng người: tối nay → 17:00 mai</h2>
  <p>Duyệt chặn người khác thì làm <strong>trước</strong> việc của mình. Duyệt chỉ tính trên đúng SHA head. Khai báo giờ làm trước 09:00 mỗi ngày.</p>
  <div class="cards">{''.join(cards)}</div>
</section>
<section id="quyet">
  <h2>Leader cần chốt tối nay</h2>
  <ol>
    <li><strong>DR-016 — máy train:</strong> RTX 4050 của Khánh là máy chính; có thêm PC của leader (RTX 3050 Ti 4 GiB) làm máy thứ hai sau khi đo lại bộ nhớ hay không.</li>
    <li><strong>Merge:</strong> merge ngay #49, #48, #26; áp CP-07 (tác giả tự merge khi có duyệt hợp lệ đúng head + CI xanh; PR split / C1 / ADR-ML / gate do leader merge sau QA).</li>
    <li><strong>GATE-SPLIT-01:</strong> Trung duyệt lại #35 → CHAT E QA → merge → ghi cổng đóng.</li>
    <li><strong>Hồ sơ phục hồi:</strong> đóng override Day 15, ghi quyết định §18 (Level 1–4, không đổi MUST), hỏi từng người trước khi ghi INC-003 cho Day 16–19.</li>
    <li><strong>Giữ #54:</strong> nó đổi hash <code>dataset_manifest.json</code> mà #35 đang ghim; đóng băng manifest ở <code>f64d461f</code> tới Day 30.</li>
  </ol>
  <p class="more"><a href="rebaseline/day-20.html#s18">Đủ 10 quyết định trong bản rà soát →</a></p>
</section>
<section id="doc">
  <h2>Đọc bản rà soát đầy đủ</h2>
  <p>Báo cáo viết bằng tiếng Anh; brief từng người (§16) bằng tiếng Việt, có nút chép để dán vào nhóm chat.</p>
  <ul class="chips">{chips}</ul>
</section>
<section id="bang">
  <h2>Về bảng điều phối</h2>
  <p class="note">Bảng tự động (<code>tools/board/build_board.py</code>) dừng ở Day 9, vì <code>PROJECT_STATE.yaml</code> chưa cập nhật từ Day 11. Để bảng không nói sai với repository, trang này thay trang "hôm nay" cho tới khi các file trạng thái được cập nhật. Bảng Day 9 được giữ nguyên ở <a href="archive/day-09.html">archive/day-09.html</a>. Nguồn của trang này: <a href="{REPO}/blob/main/management/day20/DAY20_REBASELINE.md">management/day20/DAY20_REBASELINE.md</a>, dựng bằng <code>tools/board/build_rebaseline.py</code>.</p>
</section>
</main>"""
    return page("vi", "Day 20 · Cardiac MRI Workspace",
                "Bảng điều phối Day 20, 29/09/2026: kết luận rà soát, việc từng người tối nay và ngày mai, quyết định leader cần chốt.",
                topnav("", "index"), body)


def main():
    md = SRC.read_text(encoding="utf-8")
    report, nsec = build_report(md)
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(report, encoding="utf-8", newline="\n")
    OUT_INDEX.write_text(build_index(), encoding="utf-8", newline="\n")
    print(f"{OUT_REPORT.relative_to(ROOT)}: {OUT_REPORT.stat().st_size:,} bytes, {nsec} sections")
    print(f"{OUT_INDEX.relative_to(ROOT)}: {OUT_INDEX.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
