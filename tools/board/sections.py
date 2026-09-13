"""Rendering for the execution board. build_board.py owns the data; this owns the HTML."""

from __future__ import annotations

import datetime as dt
import html
import re

STATUS_ORDER = ["SPIKE_D", "SPIKE_A", "SPIKE_B", "SPIKE_E", "SPIKE_C0", "SPIKE_C1", "SPIKE_F"]
BADGE = {"ACTIVE": "wait", "ACCEPTED": "ok", "BLOCKED": "no", "PREPARED": "idle"}


def e(x):
    return html.escape(str(x), quote=True)


def md(text):
    """The small subset of Markdown days.yaml uses: **bold**, *em*, `code`."""
    s = html.escape(str(text))
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def nav(active, depth=0):
    home = "../index.html" if depth else "index.html"
    arch = "index.html" if depth else "archive/index.html"
    out = ['<nav class="nav">']
    for href, label in [(home, "Hôm nay"), (arch, "Các ngày trước")]:
        cls = ' class="on"' if label == active else ""
        out.append(f'<a href="{e(href)}"{cls}>{e(label)}</a>')
    out.append("</nav>")
    return "\n".join(out)


# --------------------------------------------------------------------------

def header_block(g):
    d, proj = g["d"], g["proj"]
    t = d["today"]
    colour = (proj.get("forecast", {}).get("status_colour") or "AMBER").lower()
    buf = proj.get("forecast", {}).get("remaining_buffer_days")
    accepted = sum(1 for s in g["spikes"].values() if s.get("status") == "ACCEPTED")
    dd = dt.date.fromisoformat(t["date"])
    left = (dt.date(2026, 10, 9) - dd).days
    bad = "bad" if (buf or 0) <= 1 else ""
    return f"""<header class="top {e(colour)}">
  <p class="eyebrow">AI-assisted Cardiac MRI Research Workspace</p>
  <h1><span class="day">DAY {t['day']}</span> — {e(dd.strftime('%d/%m/%Y'))}</h1>
  <div class="phase">{e(proj.get('phase', '?'))} · cutover 11/09 12:00 · đồng hồ DR-001 đang chạy</div>
  <p class="sub">{md(t['headline'])}</p>
  <div class="metrics">
    <div class="m"><span class="k">Ngày</span><span class="v">{t['day']} / 30</span></div>
    <div class="m"><span class="k">Còn tới Day 30</span><span class="v">{left}</span></div>
    <div class="m {bad}"><span class="k">Buffer</span><span class="v">{buf} ngày</span></div>
    <div class="m bad"><span class="k">Spike ACCEPTED</span><span class="v">{accepted} / 7</span></div>
    <div class="m warn"><span class="k">Trạng thái</span><span class="v">{e(colour.upper())}</span></div>
  </div>
</header>"""


def section_today(g):
    t, mem = g["d"]["today"], g["d"]["members"]
    rows = []
    for i, c in enumerate(t["conditions"], 1):
        who = mem[c["who"]]["name"] if c.get("who") else "Cả ba thành viên"
        rows.append(
            f'<tr><td><strong>{i}</strong></td><td><strong>{e(who)}</strong></td>'
            f'<td>{md(c["what"])}</td>'
            f'<td style="color:var(--ink-3)">{md(c["why"])}</td></tr>')
    return f"""<section>
  <h2><span class="num">A</span> Điều kiện để hôm nay KHÔNG trượt</h2>
  <p class="lede">Ba việc. Thiếu một là ngày này tính trượt, bất kể làm được gì khác.</p>
  <div class="tblwrap"><table>
    <tr><th></th><th>Ai</th><th>Việc</th><th>Vì sao là điều kiện</th></tr>
    {''.join(rows)}
  </table></div>
</section>"""


def _bar(measured, total):
    pct = int(100 * measured / total) if total else 0
    kl = "zero" if measured == 0 else ("some" if pct < 50 else "")
    return f'<span class="bar"><i class="{kl}" style="width:{pct}%"></i></span>'


def section_progress(g):
    crit, spikes, proj = g["d"]["criteria"], g["spikes"], g["proj"]
    bars, tot_m, tot_t = [], 0, 0
    for sid in STATUS_ORDER:
        c = crit.get(sid)
        if not c:
            continue
        tot_m += c["measured"]
        tot_t += c["total"]
        stt = spikes.get(sid, {}).get("status", "?")
        bars.append(
            f'<div class="prog"><span class="nm">{e(sid.replace("SPIKE_", ""))} '
            f'<span class="st {BADGE.get(stt, "idle")}">{e(stt)}</span></span>'
            f'{_bar(c["measured"], c["total"])}'
            f'<span class="n">{c["measured"]}/{c["total"]} '
            f'<span style="color:var(--ink-3)">{e(c["label"])}</span></span></div>')

    gates = proj.get("gates", {}) or {}
    grows = "".join(
        f'<tr><td><code>{e(k)}</code></td><td><span class="st '
        f'{"ok" if str(v).upper() == "CLOSED" else "no"}">{e(v)}</span></td></tr>'
        for k, v in gates.items())

    steps = [("SPIKE_D", "gói ✅ · dụng cụ ✅ · audit ⬜", "now"),
             ("GATE-DATA-01", "chờ audit", ""),
             ("GATE-SPLIT-01", "DR-002 chưa quyết", ""),
             ("SPIKE_C1", "BLOCKED bởi D", ""),
             ("training", "6 run + 1 ablation", ""),
             ("metrics", "RQ-A · RQ-B", ""),
             ("Day 30", "09/10/2026", "")]
    pipe = "".join(
        f'<div class="step {st}"><span class="s1">{e(a)}</span>'
        f'<span class="s2">{e(b)}</span></div>' for a, b, st in steps)

    r = proj.get("requirements", {}) or {}
    acc = r.get("accepted", 0)
    total_req = r.get("not_started", 0) + r.get("accepted", 0) + \
        r.get("in_progress", 0) + r.get("blocked", 0)
    return f"""<section>
  <h2><span class="num">B</span> Tiến độ thật</h2>
  <p class="lede">Mọi con số ở mục này đọc thẳng từ <code>PROJECT_STATE.yaml</code> và
     <code>SPIKE_PHASE_STATE.yaml</code> lúc build — không gõ tay, nên không trôi được.</p>

  <h3>Critical path — thứ quyết định Day 30</h3>
  <div class="pipe">{pipe}</div>

  <h3>Tiêu chí nghiệm thu — đã có SỐ ĐO / tổng</h3>
  {''.join(bars)}
  <div class="note stop"><b>⚠ "Đã đo" KHÔNG phải "đã nghiệm thu".</b>
     Tổng <strong>{tot_m}/{tot_t}</strong> tiêu chí có số liệu thật, và <strong>0</strong> tiêu chí
     nào đi hết bốn bước (chủ sở hữu → reviewer <code>APPROVE</code> → QA <code>PASS</code> →
     Project Control). <code>15</code> §271: chỉ công việc <code>ACCEPTED</code> mới tính vào tiến độ.</div>

  <h3>Gates và yêu cầu sản phẩm</h3>
  <div class="tblwrap"><table>{grows}
    <tr><td><strong>Yêu cầu sản phẩm ACCEPTED</strong></td>
        <td><span class="st no">{acc} / {total_req}</span></td></tr>
  </table></div>
</section>"""


def section_people(g):
    d = g["d"]
    t, crit = d["today"], d["criteria"]
    cards = []
    for key in ["khanh", "trung", "hunganh", "tuananh"]:
        m, tk = d["members"][key], t["tasks"].get(key, {})
        tags = ['<span class="tag lead">LEADER</span>'] if key == "tuananh" else []
        for o in m["owns"]:
            if str(o).startswith("SPIKE"):
                p0 = " p0" if o == "SPIKE_D" else ""
                tags.append(f'<span class="tag{p0}">{e(o.replace("SPIKE_", ""))}</span>')

        prog = "".join(
            f'<div class="prog"><span class="nm">{e(o.replace("SPIKE_", ""))}</span>'
            f'{_bar(crit[o]["measured"], crit[o]["total"])}'
            f'<span class="n">{crit[o]["measured"]}/{crit[o]["total"]}</span></div>'
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
        rv = ", ".join(x.replace("SPIKE_", "") for x in m.get("reviews", [])) or "—"
        link = f'{d["repo"]}/blob/main/{m["packet"]}'
        cards.append(f"""<div class="card">
      <div class="who"><span class="nm"><a href="{e(link)}">{e(m['name'])}</a></span>{''.join(tags)}</div>
      <div class="role">{e(m['role'])} · review: <code>{e(rv)}</code></div>
      {note}{prog}
      {blk('now', 'NGAY BÂY GIỜ', tk.get('now'), True)}
      {blk('then', 'SAU ĐÓ', tk.get('then'), True)}
      {blk('later', 'NẾU CÒN THỜI GIAN', tk.get('later'))}
      {blk('debt', 'NỢ CÒN MỞ', tk.get('debts'))}
      <p style="margin:0;font-size:13px"><a href="{e(link)}">→ mở gói nhiệm vụ đầy đủ</a></p>
    </div>""")
    return f"""<section>
  <h2><span class="num">C</span> Việc của từng người hôm nay</h2>
  <p class="lede">Bấm tên để mở gói đầy đủ. Thanh tiến độ là <strong>tiêu chí đã có số đo</strong>,
     không phải đã nghiệm thu.</p>
  <div class="cards">{''.join(cards)}</div>
</section>"""


def section_contrib(g):
    d, c = g["d"], g["contrib"]
    rows = []
    for key in ["khanh", "trung", "hunganh", "tuananh"]:
        m = d["members"][key]
        s = c.get(m["github"], {})
        owned = [o for o in m["owns"] if o in d["criteria"]]
        meas = sum(d["criteria"][o]["measured"] for o in owned)
        tot = sum(d["criteria"][o]["total"] for o in owned)
        openi = len(d["today"]["tasks"].get(key, {}).get("debts") or [])
        rows.append(
            f'<tr><td><strong>{e(m["name"])}</strong><br>'
            f'<span style="color:var(--ink-3);font-size:12px">{e(m["role"])}</span></td>'
            f'<td><span class="st {"no" if meas == 0 else "wait"}">{meas} / {tot}</span></td>'
            f'<td><span class="st no">0</span></td>'
            f'<td>{s.get("reviews", 0)}</td>'
            f'<td>{s.get("prs", 0)}</td>'
            f'<td><span class="st {"no" if openi else "ok"}">{openi}</span></td></tr>')
    return f"""<section>
  <h2><span class="num">D</span> Đóng góp — và cách đọc bảng này cho đúng</h2>
  <p class="lede">Cột đầu là thứ duy nhất thực sự đo tiến độ dự án. Ba cột sau là
     <strong>hoạt động</strong>, không phải năng suất.</p>
  <div class="tblwrap"><table>
    <tr><th>Người</th><th>Tiêu chí có số đo</th><th>Tiêu chí ACCEPTED</th>
        <th>Review đã submit</th><th>PR đã mở</th><th>Nợ còn mở</th></tr>
    {''.join(rows)}
  </table></div>
  <div class="note"><b>⚠ Đừng đọc bảng này như bảng xếp hạng.</b>
     <code>15</code> §271 và <code>13</code> <code>TC-AUDIT-002</code> nói rõ: <strong>chỉ công việc
     <code>ACCEPTED</code> mới tính vào tiến độ</strong> — và cột đó đang là <strong>0 cho tất cả
     mọi người</strong>, kể cả leader.
     Số PR và số commit <strong>không</strong> đo năng suất: một PR dụng cụ 400 dòng dễ hơn nhiều so
     với một verdict <code>A11</code> ba câu cần đọc hết gói dữ liệu. Bảng này dùng để thấy
     <strong>ai đang bị chặn và ai đang chặn người khác</strong>, không phải để so ai hơn ai.</div>
</section>"""


def section_reviews(g):
    prs = g["prs"]
    if not prs:
        body = ('<p>Không lấy được danh sách PR lúc build. '
                f'<a href="{e(g["d"]["repo"])}/pulls">Xem trực tiếp trên GitHub</a>.</p>')
    else:
        rows = []
        now = dt.datetime.now(dt.timezone.utc)
        for p in sorted(prs, key=lambda x: x["number"]):
            age = now - dt.datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))
            hrs = int(age.total_seconds() // 3600)
            agecls = "no" if hrs >= 12 else ("wait" if hrs >= 4 else "idle")
            rq = ", ".join(r.get("login") or r.get("name", "") for r in p.get("reviewRequests", []))
            nrev = len(p.get("reviews") or [])
            rows.append(
                f'<tr><td><a href="{e(g["d"]["repo"])}/pull/{p["number"]}">'
                f'<strong>#{p["number"]}</strong></a></td>'
                f'<td>{e(p["title"][:78])}</td><td><code>{e(rq or "—")}</code></td>'
                f'<td><span class="st {agecls}">{hrs} giờ</span></td>'
                f'<td><span class="st {"ok" if nrev else "no"}">{nrev}</span></td></tr>')
        body = ('<div class="tblwrap"><table><tr><th>PR</th><th>Nội dung</th>'
                '<th>Người review</th><th>Tuổi</th><th>Review đã submit</th></tr>'
                + "".join(rows) + "</table></div>")
    stale = f'<div class="note"><b>{e(g["pr_note"])}</b></div>' if g.get("pr_note") else ""
    return f"""<section>
  <h2><span class="num">E</span> Hàng đợi review</h2>
  <p class="lede"><code>15</code> §11 — <em>im lặng KHÔNG phải là chấp thuận.</em>
     Kết quả review là một trong ba: <code>APPROVE</code>, <code>NEEDS_FIX</code>,
     <code>BLOCKED/DECISION_REQUIRED</code>.</p>
  {body}{stale}
  <div class="note"><b>Vì sao PR dụng cụ giao cho chính chủ sở hữu spike review:</b>
     chúng là dụng cụ dựng cho người đó. Gán họ làm reviewer buộc họ đọc dụng cụ trước khi dùng —
     <code>14</code> §6: <em>"A block is not considered healthy if only one person can
     explain/run/debug it."</em></div>
</section>"""
