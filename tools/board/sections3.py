"""Board sections added on Day 5: timeline, dependencies, spikes, milestones,
decisions, Spike E device, risks and requirements.

Same contract as sections.py: build_board.py gathers, these render. Every count
here is read from a state file or the GitHub API at build time; the Vietnamese
one-liners come from days.yaml.
"""

from __future__ import annotations

import datetime as dt
import re

from sections import BADGE, STATUS_ORDER, e, md

DAY0 = dt.date(2026, 9, 9)
LAST_DAY = 30


def _day_date(n):
    return DAY0 + dt.timedelta(days=n)


def _window(txt):
    """'Day 0' -> (0, 0); '4-6' -> (4, 6)."""
    nums = [int(x) for x in re.findall(r"\d+", str(txt))]
    if not nums:
        return None
    return (nums[0], nums[-1])


# --------------------------------------------------------------------------
# 30-day strip, rendered inside the header

def timeline(g):
    d, proj = g["d"], g["proj"]
    today = d["today"]["day"]
    hist = {h["day"]: h["status"] for h in d["history"]}
    cells = []
    for n in range(LAST_DAY + 1):
        if n == today:
            cls, tip = "now", "hôm nay"
        elif n in hist:
            cls = {"good": "good", "partial": "part", "missed": "miss"}.get(hist[n], "")
            tip = {"good": "đạt", "part": "một phần", "miss": "trượt"}.get(cls, "")
        else:
            cls, tip = "", "chưa tới"
        dd = _day_date(n)
        cells.append(f'<div class="tl-d {cls}" style="grid-column:{n + 1}" '
                     f'title="Day {n} · {dd:%d/%m} · {e(tip)}">'
                     f'<b>{n}</b><span>{dd:%d/%m}</span></div>')
    ms = []
    for mid, m in (proj.get("milestones") or {}).items():
        w = _window(m.get("days"))
        if not w:
            continue
        a, b = w
        stt = str(m.get("status", ""))
        done = stt in ("DONE", "CLOSED", "ACCEPTED", "COMPLETE", "MET")
        cls = "done" if done else ("late" if today > b else ("live" if a <= today <= b else ""))
        ms.append(f'<div class="tl-m {cls}" style="grid-column:{a + 1} / {b + 2}" '
                  f'title="{e(mid)} · Day {e(m.get("days"))} · {e(stt)}">{e(mid)}</div>')
    return f"""<div class="tlwrap"><div class="tl">{''.join(cells)}{''.join(ms)}</div></div>
  <div class="legend"><span><i class="lg good"></i>đạt</span><span><i class="lg part"></i>một phần</span>
    <span><i class="lg miss"></i>trượt</span><span><i class="lg now"></i>hôm nay</span>
    <span><i class="lg late"></i>mốc quá cửa sổ</span><span><i class="lg live"></i>mốc đang trong cửa sổ</span></div>"""


# --------------------------------------------------------------------------

def section_waits(g):
    d = g["d"]
    mem, waits = d["members"], d["today"].get("waits") or []
    if not waits:
        return ""
    count = {}
    for _, _, blocker, _ in waits:
        count[blocker] = count.get(blocker, 0) + 1
    chips = "".join(
        f'<span class="chip {"hot" if n >= 3 else ""}"><strong>{e(mem[k]["name"])}</strong> '
        f'giữ <b>{n}</b> việc của người khác</span>'
        for k, n in sorted(count.items(), key=lambda kv: -kv[1]))
    rows = "".join(
        f'<tr><td><strong>{e(mem[w]["name"])}</strong></td><td>{md(task)}</td>'
        f'<td class="arrow">⟵</td><td><strong>{e(mem[b]["name"])}</strong></td><td>{md(what)}</td></tr>'
        for w, task, b, what in waits)
    return f"""<section id="cho">
  <h2><span class="num">§</span> Ai đang chờ ai</h2>
  <p class="lede">Việc bên trái <strong>không bắt đầu được</strong> cho tới khi người bên phải xong
     phần của mình. Làm việc đang giữ người khác <strong>trước</strong> việc của riêng mình.</p>
  <div class="chips">{chips}</div>
  <div class="tblwrap"><table>
    <tr><th>Người chờ</th><th>Việc bị chặn</th><th></th><th>Chờ</th><th>Phải xong trước</th></tr>
    {rows}
  </table></div>
</section>"""


# --------------------------------------------------------------------------

STAGES = ["Chuẩn bị", "Đang làm", "Nộp bằng chứng", "Reviewer APPROVE", "QA PASS", "ACCEPTED"]


def _stage(s):
    """Index of the CURRENT stage, from the state file's own fields."""
    stt = s.get("status")
    rv = (s.get("review") or {}).get("state")
    if stt == "ACCEPTED":
        return len(STAGES)
    if rv == "APPROVED":
        return 4
    if s.get("evidence_present") or rv in ("REVIEWING", "QUEUED_FOR_REVIEW", "NEEDS_FIX"):
        return 3
    if s.get("evidence_submitted"):
        return 2
    if stt == "ACTIVE":
        return 1
    return 0


def section_spikes(g):
    d, spikes = g["d"], g["spikes"]
    crit, notes = d["criteria"], d.get("spike_notes") or {}
    cards = []
    for sid in STATUS_ORDER:
        s = spikes.get(sid)
        if not s:
            continue
        cur = _stage(s)
        blocked = s.get("status") == "BLOCKED"
        track = "".join(
            f'<span class="stg {"done" if i < cur else ("now" if i == cur and not blocked else ("blk" if i == cur else ""))}">'
            f'{e(lbl)}</span>' for i, lbl in enumerate(STAGES))
        c = crit.get(sid, {})
        tot, meas, inpr = c.get("total", 0), c.get("measured", 0), c.get("in_pr", 0)
        pm = int(100 * meas / tot) if tot else 0
        pp = int(100 * inpr / tot) if tot else 0
        bar = (f'<span class="bar two"><i class="sm" style="width:{pm}%"></i>'
               f'<i class="sp" style="width:{pp}%"></i></span>')
        cnt = (f'<b>{meas}</b>/{tot} đã đo' + (f' · <b>+{inpr}</b> trong {e(c.get("in_pr_ref", "PR"))}'
                                               if inpr else ''))
        unb = "".join(f'<code>{e(x)}</code> ' for x in (s.get("unblocks") or [])[:5])
        # the queue's own order is authoritative (amended A -> E -> B on 2026-09-11)
        qslot = {x.get("spike"): x.get("slot") for x in (g["queue"].get("order") or [])}
        slot = qslot.get(sid, s.get("device_measurement_slot"))
        ev = s.get("evidence_submitted") or {}
        evs = (f'<a href="{e(d["repo"])}/pull/{ev["pr"]}">PR #{ev["pr"]}</a>' if ev.get("pr") else "—")
        stt = s.get("status", "?")
        nm = g.get("names") or {}
        cards.append(f"""<div class="spk {'blocked' if blocked else ''}">
    <div class="spk-hd"><span class="sid">{e(sid.replace('SPIKE_', ''))}</span>
      <span class="snm">{e(s.get('name', ''))}</span>
      <span class="tag {'p0' if s.get('priority') == 'P0' else ''}">{e(s.get('priority', ''))}</span>
      <span class="st {BADGE.get(stt, 'idle')}">{e(stt)}</span></div>
    <div class="spk-meta">Chủ: <strong>{e(nm.get(s.get('owner'), s.get('owner', '?')))}</strong> ·
      Review: <strong>{e(nm.get(s.get('reviewer'), s.get('reviewer', '?')))}</strong>
      · Bằng chứng: {evs}{f' · slot máy #{e(slot)}' if slot else ''}</div>
    <div class="track">{track}</div>
    <div class="spk-bar">{bar}<span class="n">{cnt} <span class="lbl">{e(c.get('label', ''))}</span></span></div>
    <p class="spk-note">{md(notes.get(sid, ''))}</p>
    {f'<div class="spk-unb">Mở khoá: {unb}</div>' if unb else ''}
  </div>""")
    return f"""<section id="spike">
  <h2><span class="num">§</span> Bảy spike — mỗi cái đang ở bước nào</h2>
  <p class="lede">Một spike chỉ tính là xong khi đi hết <strong>bốn bước nghiệm thu</strong>: chủ sở hữu nộp
     bằng chứng → reviewer <code>APPROVE</code> → QA <code>PASS</code> → Project Control
     <code>ACCEPTED</code>. Thanh: <span class="key sm"></span> đã đo trên <code>main</code> ·
     <span class="key sp"></span> số đo nằm trong PR chưa review.</p>
  <div class="spks">{''.join(cards)}</div>
</section>"""


# --------------------------------------------------------------------------

def section_path(g):
    """Critical path, gates and milestones in one place."""
    d, proj = g["d"], g["proj"]
    today = d["today"]["day"]
    steps = [tuple(s) for s in (d["today"].get("pipeline") or [])]
    pipe = "".join(
        f'<div class="step {st}"><span class="s1">{e(a)}</span><span class="s2">{e(b)}</span></div>'
        + ('<span class="parr">→</span>' if i < len(steps) - 1 else '')
        for i, (a, b, st) in enumerate(steps))

    gates = proj.get("gates", {}) or {}
    gne = g["spk"].get("gates_that_must_not_close_early") or {}
    grows = []
    for k, v in gates.items():
        stt = v.get("status") if isinstance(v, dict) else v
        how = (v.get("closes_on") or v.get("closed_by") or "") if isinstance(v, dict) else ""
        req = gne.get(k, {}).get("requires")
        grows.append(
            f'<tr><td><code>{e(k)}</code></td><td><span class="st '
            f'{"ok" if str(stt).upper() == "CLOSED" else "no"}">{e(stt)}</span></td>'
            f'<td>{e(how)}{(" · cần: " + ", ".join(e(x) for x in req)) if req else ""}</td></tr>')
    closed = sum(1 for v in gates.values()
                 if str(v.get("status") if isinstance(v, dict) else v).upper() == "CLOSED")

    mrows = []
    for mid, m in (proj.get("milestones") or {}).items():
        w = _window(m.get("days"))
        stt = str(m.get("status", ""))
        if w and today > w[1] and stt not in ("DONE", "CLOSED", "ACCEPTED", "COMPLETE", "MET"):
            flag = '<span class="st no">QUÁ CỬA SỔ</span>'
        elif w and w[0] <= today <= w[1]:
            flag = '<span class="st wait">ĐANG TRONG CỬA SỔ</span>'
        else:
            flag = '<span class="st idle">SẮP TỚI</span>'
        dates = (f'{_day_date(w[0]):%d/%m}–{_day_date(w[1]):%d/%m}' if w else "")
        mrows.append(f'<tr><td><strong>{e(mid)}</strong></td><td>{e(m.get("days"))}'
                     f'<br><span class="dim">{e(dates)}</span></td>'
                     f'<td><code>{e(stt)}</code></td><td>{flag}</td><td>{e(m.get("exit", ""))}</td></tr>')
    conds = proj.get("conditions") or {}
    ccls = {"CLOSED": "ok", "OPEN": "no", "PARTIALLY_RESOLVED": "wait"}
    cchips = "".join(
        f'<span class="st {ccls.get(str(v.get("status")), "idle")}" title="'
        f'{e(v.get("closed_by") or ("chờ " + str(v.get("waits_on", ""))))}">{e(k)} · '
        f'{e("đóng" if v.get("status") == "CLOSED" else ("một phần" if v.get("status") == "PARTIALLY_RESOLVED" else "mở"))}'
        f'{(" — chờ " + e(str(v.get("waits_on")).replace("SPIKE_", "Spike "))) if v.get("waits_on") else ""}</span> '
        for k, v in conds.items())
    cclosed = sum(1 for v in conds.values() if v.get("status") == "CLOSED")
    return f"""<section id="path">
  <h2><span class="num">§</span> Critical path, gates và mốc</h2>
  <p class="lede">Critical path quyết định Day 30. Mọi thứ khác có buffer riêng; cái này thì
     <strong>buffer = {e(proj.get('forecast', {}).get('remaining_buffer_days'))}</strong>.</p>
  <div class="pipe">{pipe}</div>

  <h3>Điều kiện readiness — {cclosed}/{len(conds)} đã đóng</h3>
  <div class="conds">{cchips}</div>
  <p class="dim" style="font-size:12.5px;margin:6px 0 0">Mốc <code>M0</code> chỉ xong khi readiness
     qua: còn <strong>{len(conds) - cclosed}</strong> điều kiện chưa đóng, chờ
     {e(", ".join(sorted({str(v.get("waits_on")).replace("SPIKE_", "Spike ") for v in conds.values() if v.get("status") != "CLOSED" and v.get("waits_on")})) or "—")}.</p>

  <h3>Gates — {closed}/{len(gates)} đã đóng</h3>
  <div class="tblwrap"><table><tr><th>Gate</th><th>Trạng thái</th><th>Đóng khi</th></tr>{''.join(grows)}</table></div>

  <h3>Mốc M0–M9</h3>
  <div class="tblwrap"><table><tr><th>Mốc</th><th>Cửa sổ</th><th>State file</th><th>So với Day {today}</th>
    <th>Điều kiện ra</th></tr>{''.join(mrows)}</table></div>
  <p class="dim" style="font-size:12.5px;margin-top:8px">Cột "State file" đọc nguyên văn từ
     <code>PROJECT_STATE.yaml</code>; cột so sánh do bảng tính từ cửa sổ ngày. Một mốc quá cửa sổ mà
     chưa đạt là trễ thật, không phải lỗi hiển thị.</p>
</section>"""


# --------------------------------------------------------------------------

def section_decisions(g):
    d, proj = g["d"], g["proj"]
    notes = d.get("decision_notes") or {}
    pend = "".join(
        f'<div class="dec pend"><div class="dec-hd"><code>{e(x["id"])}</code>'
        f'<span class="st wait">CHỜ {e(str(x.get("waits_on", "")).replace("SPIKE_", "Spike "))}</span></div>'
        f'<div class="dec-sub">{e(x.get("subject", ""))}</div>'
        f'<p>{md(notes.get(x["id"], ""))}</p></div>'
        for x in (proj.get("decisions_pending") or []))
    pol = []
    for p in d.get("policies") or []:
        ref = (f' <a href="{e(d["repo"])}/blob/main/{e(p["ref"])}">→</a>' if p.get("ref") else "")
        pol.append(f'<tr><td class="dim">{e(p["date"])}</td><td><strong>{e(p["id"])}</strong></td>'
                   f'<td>{md(p["text"])}{ref}</td></tr>')
    return f"""<section id="quyet">
  <h2><span class="num">§</span> Quyết định</h2>
  <p class="lede">Bên trái là việc còn chờ quyết; bên dưới là luật đang có hiệu lực — mọi người làm
     việc theo đúng những dòng này.</p>
  <div class="decs">{pend}</div>
  <h3>Đang có hiệu lực</h3>
  <div class="tblwrap"><table><tr><th>Ngày</th><th>Quyết định</th><th>Nội dung</th></tr>{''.join(pol)}</table></div>
</section>"""


# --------------------------------------------------------------------------

def section_device(g):
    d, q = g["d"], g["queue"]
    dev = d.get("device") or {}
    gs = q.get("gate_2_status", {}) or {}

    def tick(v):
        return '<span class="st ok">RỒI</span>' if v is True else '<span class="st no">CHƯA</span>'
    gate = "".join(
        f"<tr><td>{e(lbl)}</td><td>{tick(gs.get(k))}</td></tr>"
        for k, lbl in [("overlay_up", "Overlay ZeroTier lên"),
                       ("mac_mini_reachable", "Mac mini tới được"),
                       ("stub_running", "Stub chạy (cổng 8787)"),
                       ("zerotier_on_phone", "ZeroTier trên điện thoại"),
                       ("gate_open", "GATE 2 mở")])
    nodes = "".join(f'<tr><td><strong>{e(a)}</strong></td><td><code>{e(b)}</code></td>'
                    f'<td><code>{e(c)}</code></td><td>{md(x)}</td></tr>'
                    for a, b, c, x in dev.get("nodes") or [])
    runs = "".join(
        f'<tr><td><strong>{e(n)}</strong></td><td>{e(t)}</td><td>{md(p)}</td>'
        f'<td><span class="st {"ok" if e12 == "DIRECT" else "wait"}">{e(e12)}</span></td>'
        f'<td><span class="st {"ok" if ok == "ok" else "no"}">{"✓" if ok == "ok" else "✗"}</span> {md(res)}</td>'
        f'<td><a href="{e(d["repo"])}/commit/{e(ref)}"><code>{e(ref)}</code></a></td></tr>'
        for n, t, p, e12, res, ok, ref in dev.get("runs") or [])
    order = "".join(
        f'<tr><td>#{e(x.get("slot"))}</td><td><code>{e(x.get("spike", "").replace("SPIKE_", ""))}</code></td>'
        f'<td>{e((g.get("names") or {}).get(x.get("owner"), x.get("owner", "")))}</td>'
        f'<td><code>{e(x.get("status", ""))}</code></td></tr>'
        for x in q.get("order") or [])
    fnd = "".join(f"<li>{md(x)}</li>" for x in dev.get("findings") or [])
    return f"""<section id="thietbi">
  <h2><span class="num">§</span> 📱 Spike E — điện thoại, mạng và các lượt đo</h2>
  <p class="lede">Một máy duy nhất được phép đo: <strong>{e(q.get('model') or q.get('device') or 'Galaxy A17 5G')}</strong>,
     tài sản cá nhân của leader, không bàn giao.</p>
  <div class="note go"><b>Mô hình đang dùng — DR-006a rev 2 + DR-003b (13/09).</b>
     Leader là <strong>operator duy nhất</strong>: cắm máy, chạy harness, commit dữ liệu thô nguyên byte.
     Trung <strong>thiết kế</strong> phép đo, <strong>tự tổng hợp</strong> số bằng <code>aggregate.py</code>
     và viết <code>RESULT.md</code>; không ai khác tính số liệu <code>E</code>. Đường nghiệm thu là
     <strong>Wi-Fi → Internet → ZeroTier → Mac mini</strong> (<code>wifi-overlay</code>); cellular hợp lệ
     nhưng <strong>không gộp</strong>, LAN chỉ để chẩn đoán.</div>

  <div class="two">
    <div><h3>GATE 2</h3><div class="tblwrap"><table>{gate}</table></div></div>
    <div><h3>Hàng đợi thiết bị</h3><div class="tblwrap"><table>
      <tr><th>Slot</th><th>Spike</th><th>Chủ</th><th>Trạng thái</th></tr>{order}</table></div></div>
  </div>

  <h3>Mạng ZeroTier <code>b103a835d292ddb3</code></h3>
  <div class="tblwrap"><table><tr><th>Máy</th><th>Node</th><th>Địa chỉ</th><th>Vai trò</th></tr>{nodes}</table></div>

  <h3>Bốn lượt đo ngày 13/09 — dữ liệu thô, chưa tổng hợp</h3>
  <div class="tblwrap"><table><tr><th>Lượt</th><th>Giờ</th><th>Đường</th><th>E12</th><th>Kết quả (đếm, không thống kê)</th>
    <th>Commit</th></tr>{runs}</table></div>
  <p class="dim" style="font-size:12.5px;margin-top:8px">Nhánh bằng chứng:
     <a href="{e(d['repo'])}/tree/spike-e/evidence-20260913/spikes/spike_e_transport/EVIDENCE_RAW">
     <code>spike-e/evidence-20260913</code></a> — mỗi lượt có <code>PROVENANCE.md</code>, JSONL từ máy, log
     của stub. Không con số độ trễ nào được tính ở đây: đó là việc của Trung.</p>

  <h3>Phát hiện đổi cách đo</h3>
  <ul>{fnd}</ul>
</section>"""


# --------------------------------------------------------------------------

def section_risks(g):
    proj, d = g["proj"], g["d"]
    rk = proj.get("risks") or {}
    titles, notes = g.get("risk_titles") or {}, d.get("risk_notes") or {}

    def col(key, label, cls):
        items = rk.get(key) or []
        li = "".join(
            f'<li><code>{e(r)}</code> {e(titles.get(r, ""))}'
            + (f'<div class="rn">↳ {md(notes[r])}</div>' if r in notes else "") + "</li>"
            for r in items)
        return (f'<div class="rk {cls}"><h4>{e(label)} · {len(items)}</h4><ul>{li}</ul></div>')

    req = proj.get("requirements") or {}
    inv = req.get("inventory") or {}
    tiles = [("Yêu cầu sản phẩm", inv.get("product_requirements")), ("MUST", inv.get("must")),
             ("SHOULD", inv.get("should")), ("COULD", inv.get("could")),
             ("FR + NFR", inv.get("fr_plus_nfr")), ("Use case", inv.get("use_cases")),
             ("Màn hình", inv.get("screens")), ("Acceptance test", inv.get("acceptance_tests"))]
    tl = "".join(f'<div class="m"><span class="k">{e(k)}</span><span class="v">{e(v)}</span></div>'
                 for k, v in tiles if v is not None)
    tests = proj.get("tests") or {}
    return f"""<section id="ruiro">
  <h2><span class="num">§</span> Rủi ro và phạm vi sản phẩm</h2>
  <p class="lede">Nhóm rủi ro đọc từ <code>PROJECT_STATE.yaml</code>, tên từ
     <a href="{e(d['repo'])}/blob/main/management/readiness/RISK_REGISTER_INITIAL.md">RISK_REGISTER_INITIAL.md</a>;
     dòng ↳ là tình hình tuần này.</p>
  <div class="rks">{col('high', 'CAO', 'high')}{col('medium', 'TRUNG BÌNH', 'med')}{col('closed', 'ĐÃ ĐÓNG', 'closed')}</div>

  <h3>Phạm vi phải giao ở Day 30</h3>
  <div class="metrics inv">{tl}</div>
  <div class="note stop"><b>Yêu cầu ACCEPTED: {e(req.get('accepted', 0))} / {e(inv.get('product_requirements', '?'))}
     · test sản phẩm pass: {e(tests.get('passed', 0))}.</b>
     Chưa có harness test sản phẩm — dụng cụ của spike cố ý không được đếm vào đây. Sàn nghiệm thu là
     <strong>{e(inv.get('must', '?'))} MUST</strong>; <code>COULD</code>/<code>SHOULD</code> nằm ngoài sàn (PRD §3.1).</div>
</section>"""
