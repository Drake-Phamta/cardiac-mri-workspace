"""Rendering for the execution board. build_board.py owns the data; this owns the HTML.

Section headings carry a placeholder number `§`; build_board.py numbers them A, B, C...
in page order, so reordering sections never leaves a stale letter behind.
"""

from __future__ import annotations

import datetime as dt
import html
import re

STATUS_ORDER = ["SPIKE_D", "SPIKE_A", "SPIKE_B", "SPIKE_E", "SPIKE_C0", "SPIKE_C1", "SPIKE_F"]
BADGE = {"ACTIVE": "wait", "ACCEPTED": "ok", "BLOCKED": "no", "PREPARED": "idle"}
MEMBER_ORDER = ["khanh", "trung", "hunganh", "tuananh"]
DAY30 = dt.date(2026, 10, 9)

# In-page anchors for the sticky nav: (id, label). Ids are set by each section.
ANCHORS = [("homnay", "Hôm nay"), ("nguoi", "Từng người"), ("cho", "Ai chờ ai"),
           ("pr", "PR"), ("path", "Critical path"), ("spike", "Spike"),
           ("quyet", "Quyết định"), ("thietbi", "Spike E"), ("ruiro", "Rủi ro"),
           ("lichsu", "Lịch sử")]


def e(x):
    return html.escape(str(x), quote=True)


def md(text):
    """The small subset of Markdown days.yaml uses: **bold**, *em*, `code`."""
    s = html.escape(str(text))
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def nav(active, depth=0, anchors=False):
    home = "../index.html" if depth else "index.html"
    arch = "index.html" if depth else "archive/index.html"
    out = ['<nav class="nav">']
    for href, label in [(home, "Hôm nay"), (arch, "Các ngày trước")]:
        cls = ' class="on"' if label == active else ""
        out.append(f'<a href="{e(href)}"{cls}>{e(label)}</a>')
    if anchors:
        out.append('<span class="sep"></span>')
        out += [f'<a class="jump" href="#{i}">{e(lbl)}</a>' for i, lbl in ANCHORS[1:]]
    out.append("</nav>")
    return "\n".join(out)


# --------------------------------------------------------------------------

def header_block(g, timeline_html=""):
    d, proj = g["d"], g["proj"]
    t = d["today"]
    colour = (proj.get("forecast", {}).get("status_colour") or "AMBER").lower()
    buf = proj.get("forecast", {}).get("remaining_buffer_days")
    accepted = sum(1 for s in g["spikes"].values() if s.get("status") == "ACCEPTED")
    dd = dt.date.fromisoformat(t["date"])
    left = (DAY30 - dd).days
    crit = d["criteria"]
    meas = sum(c["measured"] for c in crit.values())
    inpr = sum(c.get("in_pr", 0) for c in crit.values())
    tot = sum(c["total"] for c in crit.values())
    gates = proj.get("gates", {}) or {}
    gclosed = sum(1 for v in gates.values()
                  if str(v.get("status") if isinstance(v, dict) else v).upper() == "CLOSED")
    req = proj.get("requirements", {}) or {}
    nreq = (req.get("inventory") or {}).get("product_requirements") or "?"
    prs = g["prs"]
    waiting = sum(1 for p in prs if not p.get("_approved"))
    ci = g.get("ci") or {}
    ci_ok = ci.get("conclusion") == "success"
    ci_txt = "XANH" if ci_ok else (ci.get("conclusion") or "?").upper()
    spec = g.get("spec") or (None, None)
    spec_ok = spec[0] is not None and spec[0] == spec[1]

    def tile(k, v, cls="", sub=""):
        s = f'<span class="s">{sub}</span>' if sub else ""
        return f'<div class="m {cls}"><span class="k">{k}</span><span class="v">{v}</span>{s}</div>'

    tiles = "".join([
        tile("Ngày", f"{t['day']} / 30", "", f"{dd:%d/%m/%Y}"),
        tile("Còn tới Day 30", f"{left} ngày", "", f"{DAY30:%d/%m/%Y}"),
        tile("Buffer", f"{buf} ngày", "bad" if (buf or 0) <= 1 else ""),
        tile("Trạng thái", e(colour.upper()), "bad" if colour == "red" else "warn"),
        tile("Spike ACCEPTED", f"{accepted} / 7", "bad" if accepted == 0 else "ok"),
        tile("Tiêu chí có số đo", f"{meas} / {tot}", "warn", f"+{inpr} trong PR chờ review" if inpr else ""),
        tile("Gates đóng", f"{gclosed} / {len(gates)}", "warn"),
        tile("PR đang mở", f"{len(prs)}", "warn" if waiting else "ok", f"{waiting} chưa được approve"),
        tile("Yêu cầu ACCEPTED", f"{req.get('accepted', 0)} / {nreq}", "bad" if not req.get("accepted") else ""),
        tile("CI trên main", ci_txt, "ok" if ci_ok else "bad",
             f"spec {spec[0]}/{spec[1]}" + (" ✓" if spec_ok else " ✗") if spec[1] else ""),
    ])
    return f"""<header class="top {e(colour)}" id="homnay">
  <p class="eyebrow">AI-assisted Cardiac MRI Research Workspace · bảng điều phối</p>
  <h1><span class="day">DAY {t['day']}</span> — {e(dd.strftime('%d/%m/%Y'))}</h1>
  <div class="phase">{e(proj.get('phase', '?'))} · cutover 11/09 12:00 · hạn mỗi ngày 23:59</div>
  <p class="sub">{md(t['headline'])}</p>
  <div class="metrics">{tiles}</div>
  <h3 class="tl-h">30 ngày — kết quả từng ngày và cửa sổ các mốc</h3>
  {timeline_html}
</header>"""


def section_today(g):
    t, mem = g["d"]["today"], g["d"]["members"]
    rows = []
    for i, c in enumerate(t["conditions"], 1):
        who = mem[c["who"]]["name"] if c.get("who") else "Cả ba thành viên"
        rows.append(
            f'<tr><td><span class="big">{i}</span></td><td><strong>{e(who)}</strong></td>'
            f'<td>{md(c["what"])}</td>'
            f'<td class="dim">{md(c["why"])}</td></tr>')
    n = len(t["conditions"])
    return f"""<section>
  <h2><span class="num">§</span> Điều kiện để hôm nay KHÔNG trượt <span class="st no">HẠN 23:59</span></h2>
  <p class="lede">{n} việc. Thiếu một là ngày này tính trượt, bất kể làm được gì khác.</p>
  <div class="tblwrap"><table>
    <tr><th></th><th>Ai</th><th>Việc</th><th>Vì sao là điều kiện</th></tr>
    {''.join(rows)}
  </table></div>
</section>"""


def _bar(measured, total, in_pr=0):
    pm = int(100 * measured / total) if total else 0
    pp = int(100 * in_pr / total) if total else 0
    kl = "zero" if measured == 0 and not in_pr else ("some" if pm < 50 else "")
    extra = f'<i class="sp" style="width:{pp}%"></i>' if in_pr else ""
    return (f'<span class="bar {"two" if in_pr else ""}"><i class="{kl if not in_pr else "sm"}" '
            f'style="width:{pm}%"></i>{extra}</span>')


_HRS = re.compile(r"~\s*(\d+(?:,\d+)?)\s*(h|ph)\b")


def _hours(items):
    """Sum the '(~2,5 h)' / '(~30 ph)' estimates written into days.yaml lines."""
    tot = 0.0
    for x in items or []:
        for num, unit in _HRS.findall(str(x)):
            v = float(num.replace(",", "."))
            tot += v if unit == "h" else v / 60
    return tot


def _fmt_h(v):
    return (f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",")) + " h"


def section_people(g):
    d = g["d"]
    t, crit = d["today"], d["criteria"]
    asked = g.get("review_asks") or {}
    authored = g.get("authored") or {}
    cards = []
    for key in MEMBER_ORDER:
        m, tk = d["members"][key], t["tasks"].get(key, {})
        tags = ['<span class="tag lead">LEADER</span>'] if key == "tuananh" else []
        for o in m["owns"]:
            if str(o).startswith("SPIKE"):
                p0 = " p0" if o == "SPIKE_D" else ""
                tags.append(f'<span class="tag{p0}">{e(o.replace("SPIKE_", ""))}</span>')

        prog = "".join(
            f'<div class="prog"><span class="nm">{e(o.replace("SPIKE_", ""))}</span>'
            f'{_bar(crit[o]["measured"], crit[o]["total"], crit[o].get("in_pr", 0))}'
            f'<span class="n">{crit[o]["measured"]}/{crit[o]["total"]}'
            f'{(" +" + str(crit[o]["in_pr"])) if crit[o].get("in_pr") else ""}</span></div>'
            for o in m["owns"] if o in crit)

        def blk(cls, label, items, ordered=False):
            if not items:
                return ""
            tag = "ol" if ordered else "ul"
            li = "".join(f"<li>{md(x)}</li>" for x in items)
            return (f'<div class="blk {cls}"><b>{e(label)}</b>'
                    f'<{tag}>{li}</{tag}></div>')

        note = (f'<div class="note go" style="margin:0 0 9px">{md(tk["note"])}</div>'
                if tk.get("note") else "")
        core = _hours((tk.get("debts") or []) + (tk.get("now") or []) + (tk.get("then") or []))
        extra = _hours(tk.get("later"))
        hrs = (f'<span class="hrs">ước tính <b>{_fmt_h(core)}</b> chính'
               + (f' + {_fmt_h(extra)} thêm' if extra else "") + "</span>") if core else ""
        load = (f'<div class="role"><b>Khối lượng:</b> {md(tk["load"])} {hrs}</div>'
                if tk.get("load") else "")
        rv = ", ".join(x.replace("SPIKE_", "") for x in m.get("reviews", [])) or "—"
        link = f'{d["repo"]}/blob/main/{m["packet"]}'
        ask = asked.get(m["github"], [])
        mine = authored.get(m["github"], [])
        prline = ""
        if ask or mine:
            a = " ".join(f'<a class="pill hot" href="{e(d["repo"])}/pull/{n}">#{n} chờ bạn review</a>'
                         for n in ask)
            b = " ".join(f'<a class="pill" href="{e(d["repo"])}/pull/{n}">#{n} của bạn</a>' for n in mine)
            prline = f'<div class="pills">{a} {b}</div>'
        # Leader rule (2026-09-13): carried-over debts are done FIRST, so they render first.
        cards.append(f"""<div class="card">
      <div class="who"><span class="nm"><a href="{e(link)}">{e(m['name'])}</a></span>{''.join(tags)}</div>
      <div class="role">{e(m['role'])} · review spike: <code>{e(rv)}</code> · GitHub <code>{e(m['github'])}</code></div>
      {load}{prline}{note}{prog}
      {blk('debt', '🔴 LÀM TRƯỚC — NỢ TỒN', tk.get('debts'), True)}
      {blk('now', 'NGAY BÂY GIỜ', tk.get('now'), True)}
      {blk('then', 'SAU ĐÓ', tk.get('then'), True)}
      {blk('later', 'NẾU CÒN THỜI GIAN', tk.get('later'))}
      <p style="margin:0;font-size:13px"><a href="{e(link)}">→ mở gói nhiệm vụ đầy đủ</a></p>
    </div>""")
    return f"""<section id="nguoi">
  <h2><span class="num">§</span> Việc của từng người hôm nay</h2>
  <p class="lede">Thành viên <strong>~8 h</strong>, hạn <strong>23:59</strong>, không cần khai báo giờ rảnh.
     Làm theo thứ tự: <span class="k-debt">nợ tồn</span> → <span class="k-now">ngay bây giờ</span> →
     <span class="k-then">sau đó</span>. Số giờ "ước tính" do bảng cộng từ các dòng việc. Bấm tên để mở gói đầy đủ.</p>
  <div class="cards">{''.join(cards)}</div>
</section>"""


def section_contrib(g):
    d, c = g["d"], g["contrib"]
    rows = []
    for key in MEMBER_ORDER:
        m = d["members"][key]
        s = c.get(m["github"], {})
        owned = [o for o in m["owns"] if o in d["criteria"]]
        meas = sum(d["criteria"][o]["measured"] for o in owned)
        inpr = sum(d["criteria"][o].get("in_pr", 0) for o in owned)
        tot = sum(d["criteria"][o]["total"] for o in owned)
        openi = len(d["today"]["tasks"].get(key, {}).get("debts") or [])
        rows.append(
            f'<tr><td><strong>{e(m["name"])}</strong><br>'
            f'<span class="dim" style="font-size:12px">{e(m["role"])}</span></td>'
            f'<td><span class="st {"no" if meas == 0 else "wait"}">{meas} / {tot}</span>'
            f'{f" <span class=dim>+{inpr} trong PR</span>" if inpr else ""}</td>'
            f'<td><span class="st no">0</span></td>'
            f'<td>{s.get("reviews", 0)}</td>'
            f'<td>{s.get("prs", 0)}</td>'
            f'<td><span class="st {"no" if openi else "ok"}">{openi}</span></td></tr>')
    return f"""<section id="donggop">
  <h2><span class="num">§</span> Đóng góp — và cách đọc bảng này cho đúng</h2>
  <p class="lede">Cột đầu là thứ duy nhất thực sự đo tiến độ dự án. Ba cột sau là
     <strong>hoạt động</strong>, không phải năng suất.</p>
  <div class="tblwrap"><table>
    <tr><th>Người</th><th>Tiêu chí có số đo</th><th>Tiêu chí ACCEPTED</th>
        <th>Review đã submit</th><th>PR đã mở</th><th>Nợ tồn hôm nay</th></tr>
    {''.join(rows)}
  </table></div>
  <div class="note"><b>⚠ Đừng đọc bảng này như bảng xếp hạng.</b>
     <code>15</code> §271 và <code>13</code> <code>TC-AUDIT-002</code> nói rõ: <strong>chỉ công việc
     <code>ACCEPTED</code> mới tính vào tiến độ</strong> — và cột đó đang là <strong>0 cho tất cả
     mọi người</strong>, kể cả leader.
     Số PR và số review <strong>không</strong> đo năng suất: một PR dụng cụ 400 dòng dễ hơn nhiều so
     với một verdict <code>A11</code> ba câu cần đọc hết gói dữ liệu. Bảng này dùng để thấy
     <strong>ai đang bị chặn và ai đang chặn người khác</strong>, không phải để so ai hơn ai.</div>
</section>"""


REVIEW_VI = {"APPROVED": ("APPROVE", "ok"), "CHANGES_REQUESTED": ("YÊU CẦU SỬA", "no"),
             "COMMENTED": ("GÓP Ý", "idle"), "DISMISSED": ("BỊ HUỶ", "idle")}


def section_reviews(g):
    prs, d = g["prs"], g["d"]
    order = d.get("merge_order") or []
    if not prs:
        body = ('<p>Không lấy được danh sách PR lúc build. '
                f'<a href="{e(d["repo"])}/pulls">Xem trực tiếp trên GitHub</a>.</p>')
    else:
        rows = []
        now = dt.datetime.now(dt.timezone.utc)
        key = (lambda p: (order.index(p["number"]) if p["number"] in order else 99, p["number"]))
        for p in sorted(prs, key=key):
            age = now - dt.datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))
            hrs = int(age.total_seconds() // 3600)
            agecls = "no" if hrs >= 24 else ("wait" if hrs >= 8 else "idle")
            rq = ", ".join(r.get("login") or r.get("name", "") for r in p.get("reviewRequests", []))
            latest = p.get("_latest") or {}
            if not rq and "CHANGES_REQUESTED" in latest.values():
                rq = "— chờ tác giả sửa"
            rv = " ".join(
                f'<span class="st {REVIEW_VI.get(s, (s, "idle"))[1]}">{e(u)}: {e(REVIEW_VI.get(s, (s, ""))[0])}</span>'
                for u, s in latest.items()) or '<span class="st no">CHƯA AI</span>'
            checks = p.get("statusCheckRollup") or []
            okc = sum(1 for c in checks if (c.get("conclusion") or "").upper() == "SUCCESS")
            ci = (f'<span class="st {"ok" if okc == len(checks) else "no"}">{okc}/{len(checks)}</span>'
                  if checks else '<span class="st idle">không có</span>')
            pos = (f'<span class="ord">{order.index(p["number"]) + 1}</span>'
                   if p["number"] in order else "")
            hot = " hotrow" if order and p["number"] == order[0] else ""
            rows.append(
                f'<tr class="{hot}"><td>{pos}</td><td><a href="{e(d["repo"])}/pull/{p["number"]}">'
                f'<strong>#{p["number"]}</strong></a></td>'
                f'<td>{e(p["title"][:84])}<br><span class="dim" style="font-size:12px">'
                f'<code>{e(p.get("headRefName", ""))}</code> · +{p.get("additions", 0)} / −{p.get("deletions", 0)}</span></td>'
                f'<td><span class="login">{e((p.get("author") or {}).get("login", ""))}</span></td>'
                f'<td>{f"<span class=dim>{e(rq)}</span>" if rq.startswith("—") else f"<span class=login>{e(rq or chr(8212))}</span>"}</td>'
                f'<td>{rv}</td><td>{ci}</td>'
                f'<td><span class="st {agecls}">{hrs} giờ</span></td></tr>')
        body = ('<div class="tblwrap"><table><tr><th>Thứ tự merge</th><th>PR</th><th>Nội dung</th>'
                '<th>Tác giả</th><th>Đang chờ review từ</th><th>Review mới nhất</th><th>CI</th><th>Tuổi</th></tr>'
                + "".join(rows) + "</table></div>")
    stale = f'<div class="note"><b>{e(g["pr_note"])}</b></div>' if g.get("pr_note") else ""
    return f"""<section id="pr">
  <h2><span class="num">§</span> PR và hàng đợi review</h2>
  <p class="lede">Sắp theo <strong>thứ tự merge</strong> Project Control sẽ đi. <code>15</code> §11 —
     <em>im lặng KHÔNG phải là chấp thuận.</em> Kết quả review là một trong ba: <code>APPROVE</code>,
     <code>NEEDS_FIX</code>, <code>BLOCKED/DECISION_REQUIRED</code>. Tác giả không tự review PR của mình.</p>
  {body}{stale}
</section>"""
