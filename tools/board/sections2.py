"""Board sections: history, incident, stop-list, footer, archive pages."""

from __future__ import annotations

import datetime as dt

from sections import e, md, nav

STATUS_LABEL = {"partial": ("MỘT PHẦN", "wait"), "missed": ("TRƯỢT", "no"),
                "open": ("ĐANG MỞ", "wait"), "good": ("ĐẠT", "ok")}


def section_history(g):
    d = g["d"]
    mem = d["members"]

    def who(x):
        k = x.get("who")
        return f'<span class="who-s">{e(mem[k]["name"]) if k in mem else "Cả nhóm"}</span> '

    cards = []
    for i, h in enumerate(d["history"]):
        lbl, cls = STATUS_LABEL.get(h["status"], ("?", "idle"))
        row = "missed" if h["status"] == "missed" else ""
        done = "".join(f"<li>{who(x)}{md(x['what'])}"
                       + (f' <code>{e(x["ref"])}</code>' if x.get("ref") else "")
                       + "</li>" for x in (h.get("done") or []))
        miss = "".join(f"<li>{who(x)}{md(x['what'])}</li>" for x in (h.get("missed") or []))
        dec = "".join(f"<li>{md(x)}</li>" for x in (h.get("decisions") or []))
        dd = dt.date.fromisoformat(h["date"])
        # The most recent day opens by default; older days fold so the page stays scannable.
        cards.append(f"""<details class="dayrow {row}"{' open' if i == 0 else ''}>
      <summary class="hd"><span class="dn">DAY {h['day']}</span>
        <span class="dd2">{e(dd.strftime('%d/%m/%Y'))}</span>
        <span class="st {cls}">{e(lbl)}</span>
        <span style="font-weight:650">{e(h['title'])}</span>
        <span class="dim cnt">{len(h.get('done') or [])} xong · {len(h.get('missed') or [])} tồn</span></summary>
      <p style="margin:0 0 6px;color:var(--ink-2);font-size:13.5px">{md(h['summary'])}</p>
      {'<h4>Đã xong</h4><ul>' + done + '</ul>' if done else ''}
      {'<h4>Còn tồn / trượt</h4><ul>' + miss + '</ul>' if miss else ''}
      {'<h4>Quyết định</h4><ul>' + dec + '</ul>' if dec else ''}
      <p class="more"><a href="archive/day-{h['day']:02d}.html">→ trang riêng của Day {h['day']}</a></p>
    </details>""")
    return f"""<section id="lichsu">
  <h2><span class="num">§</span> Các ngày trước — ai xong gì, còn tồn gì</h2>
  <p class="lede">Ô "đã xong" chỉ được ghi khi có commit SHA, số PR, hoặc đường dẫn file đã commit.
     Bấm vào một ngày để mở. <a href="archive/index.html">Toàn bộ lịch sử →</a></p>
  {''.join(cards)}
</section>"""


def section_incident(g):
    repo = g["d"]["repo"]
    return f"""<section>
  <h2><span class="num">§</span> Sự kiện và bài học</h2>

  <h3><a href="{e(repo)}/blob/main/management/incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md">
      INC-001</a> — ngày execution đầu tiên trôi qua với một người làm việc</h3>
  <div class="tblwrap"><table>
    <tr><th>Người</th><th>Spike</th><th>Hoạt động SAU cutover 12:00</th><th>Event cuối trong ngày</th></tr>
    <tr><td>Phạm Tuấn Anh</td><td><code>SPIKE_A</code></td><td><strong>19</strong></td><td>14:12</td></tr>
    <tr><td>Bế Quốc Khánh</td><td><code>SPIKE_D</code> · P0</td><td><span class="st no">0</span></td>
        <td>11:34 — 25 phút <em>trước</em> cutover</td></tr>
    <tr><td>Nguyễn Gia Đức Trung</td><td><code>SPIKE_E</code></td><td><span class="st no">0</span></td>
        <td>11:35 — 25 phút <em>trước</em> cutover</td></tr>
    <tr><td>Vũ Hùng Anh</td><td><code>SPIKE_B</code></td><td><span class="st no">0</span></td>
        <td>không có event nào cả ngày</td></tr>
  </table></div>
  <p style="font-size:13.5px;margin-top:10px">Điều khoản không được áp dụng:
     <code>15</code> §13 <em>"escalate blockers rather than hiding them until EOD"</em> ·
     <code>15</code> §5 — khả dụng của thành viên là <strong>trường bắt buộc</strong> của kế hoạch ngày.</p>

  <h3>Luật làm việc đang áp dụng</h3>
  <ul>
    <li><strong>~8 giờ mỗi ngày, hạn 23:59.</strong> Không cần khai báo giờ rảnh — việc xong trước
        nửa đêm là được <span class="dim">(leader, 14/09 — thay luật "khai báo trước 09:00" của Day 3)</span></li>
    <li><strong>Nợ tồn làm trước.</strong> Việc của ngày trước còn dở đứng đầu packet và xong trước
        khi bắt đầu việc mới <span class="dim">(leader, 13/09)</span></li>
    <li><strong>Blocker báo ngay khi gặp.</strong> Bị kẹt không phải lỗi; giấu chuyện bị kẹt mới là</li>
    <li><strong>Một ngày không commit thì phải nói tại sao.</strong> Im lặng bị đọc là không có tiến
        độ, vì không có cách nào khác để đọc nó</li>
  </ul>

  <h3><a href="{e(repo)}/blob/main/management/day03/QA_REVIEW_001.md">QA-REVIEW-001</a> —
      49 lỗi trong chính dụng cụ Project Control dựng</h3>
  <p style="font-size:13.5px">Bốn gói dụng cụ do một người viết trong một đêm được giao cho một luồng
     độc lập với đúng một nhiệm vụ: <strong>phá</strong>. Nó <strong>chạy thật</strong> trên input
     hỏng cố ý. Kết quả: <strong>49 lỗi, 8 CRITICAL</strong>, không gói nào sạch. Tất cả đã sửa, mỗi
     bản sửa kiểm lại bằng chính trigger của người review.</p>
  <div class="note stop"><b>⚠ Bài học quan trọng nhất, và nó áp cho cả nhóm:</b>
     <strong>một dòng comment khẳng định sự trung thực là một lời hứa phải kiểm được.</strong>
     Bảy trong 49 lỗi nằm đúng ở những chỗ tài liệu khoe rằng nó trung thực —
     <em>"a check that could not be performed never reports PASS"</em> rồi PASS;
     <em>"a p95 over only the successes is a lie with a decimal point"</em> rồi in đúng con số đó;
     một kiểm tra "tính đúng đắn" so mesh với <strong>chính nó</strong>.
     <strong>Viết ra rồi không kiểm còn tệ hơn không viết</strong>, vì người đọc sau sẽ tin nó thay
     vì tự soi.<br><br>
     Trong đó có một "phát hiện" Project Control <strong>đã báo cho Vũ Hùng Anh</strong> và hoá ra là
     tạo tác từ chính cách dựng tia. Đã rút lại công khai ở cả bốn nơi từng nói sai.</div>
</section>"""


def section_stop(g):
    items = [
        "<strong>Không nới ngưỡng đã đóng băng</strong> — <code>NFR-PERF-001</code> 200 ms · "
        "<code>±1 slice</code> SCQ-06 · tolerance fixture <strong>EXACT</strong>",
        "<strong>Không chạm <code>docs/specs/v1.0/**</code></strong> — CI sẽ chặn, và cần "
        "Decision Request <code>00</code> §13",
        "<strong>Không commit dataset bytes</strong> — chỉ manifest được track; CI chặn",
        "<strong>Không commit hay review dưới tài khoản người khác</strong> — chữ ký giả trong "
        "bản ghi công khai",
        "<strong>Không điền ô <code>[RECORD]</code> mang tên người vắng mặt</strong>",
        "<strong>Không split theo slice hay theo case</strong> — theo <strong>bệnh nhân</strong>, "
        "seed <code>2024</code>, không đổi sau khi thấy kết quả test",
        "<strong>Không chọn Path A/B trong Spike D</strong> — đó là <code>DR-002</code> của leader",
        "<strong>Không chốt <code>GATE-MOB-01</code> trên riêng Spike A</strong> — cần cả A và B",
        "<strong>Không chốt <code>GATE-ML-01</code> trên riêng C0</strong> — DR-007 cấm",
        "<strong>Không làm gì với dữ liệu thật cho C1</strong> khi <code>SPIKE_C1</code> còn "
        "<code>BLOCKED</code>",
        "<strong>Không ghi vào <code>tests/fixtures/geometry/</code></strong> nếu bạn không phải "
        "Vũ Hùng Anh",
        "<strong>Không gộp <code>wifi-overlay</code> với <code>cellular-overlay</code></strong>; số đo "
        "LAN chỉ để chẩn đoán, không bao giờ là bằng chứng Spike E",
        "<strong>Không ai ngoài Trung tính số liệu <code>E</code></strong> — <code>DR-006a</code> rev 2, "
        "ràng buộc (c)",
        "<strong>Không tạo <code>RESULT.md</code> khi chưa có bằng chứng thật</strong>; không tự đặt "
        "<code>EVIDENCE_READY</code> hay <code>ACCEPTED</code>",
    ]
    return ('<section class="stopsec" id="khonglam"><h2><span class="num">§</span> KHÔNG LÀM</h2>'
            '<ul class="stoplist">' + "".join(f"<li>{x}</li>" for x in items) + "</ul></section>")


def footer_block(g, depth=0):
    d = g["d"]
    repo = d["repo"]
    up = "../" * depth
    day = d["today"]["day"]
    pk = "/".join(d["members"]["khanh"]["packet"].split("/")[:-1])
    last = d["history"][0]["day"] if d["history"] else None
    blob = f"{repo}/blob/main"
    spec = g.get("spec") or (None, None)
    spec_txt = (f"<strong>{spec[0]}/{spec[1]} OK</strong>" if spec[1] and spec[0] == spec[1]
                else f"<strong>{spec[0]}/{spec[1]} — LỆCH</strong>" if spec[1] else "không kiểm được")
    acc = sum(1 for s in g["spikes"].values() if s.get("status") == "ACCEPTED")
    evp = sum(1 for s in g["spikes"].values() if s.get("evidence_present"))
    c1 = g["spikes"].get("SPIKE_C1", {}).get("status", "?")
    groups = [
        ("Hôm nay", [(f"{repo}/tree/main/{pk}", f"gói nhiệm vụ Day {day}"),
                     (f"{blob}/management/DAY_LOG.md", "DAY_LOG"),
                     (f"{blob}/management/day{last:02d}/DAY{last:02d}_EOD_REVIEW.md" if last is not None
                      else f"{blob}/management/DAY_LOG.md", f"EOD Day {last}")]),
        ("State", [(f"{blob}/management/PROJECT_STATE.yaml", "PROJECT_STATE.yaml"),
                   (f"{blob}/management/spikes/SPIKE_PHASE_STATE.yaml", "SPIKE_PHASE_STATE.yaml"),
                   (f"{blob}/management/readiness/OPEN_DECISIONS.md", "OPEN_DECISIONS"),
                   (f"{blob}/management/readiness/RISK_REGISTER_INITIAL.md", "Risk register")]),
        ("Spike", [(f"{repo}/tree/main/management/spikes", "TASK.md từng spike"),
                   (f"{repo}/tree/spike-e/evidence-20260913/spikes/spike_e_transport/EVIDENCE_RAW",
                    "bằng chứng thô Spike E"),
                   (f"{repo}/tree/main/tests/fixtures/geometry", "fixture hình học")]),
        ("GitHub", [(repo, "Repository"), (f"{repo}/pulls", "PR đang mở"),
                    (f"{repo}/actions", "CI (Actions)"), (f"{up}archive/index.html", "lịch sử ngày")]),
    ]
    links = "".join(
        f'<div class="lg-g"><b>{e(t)}</b>' + " · ".join(f'<a href="{e(h)}">{e(l)}</a>' for h, l in items)
        + "</div>" for t, items in groups)
    return f"""<footer>
  <div class="links">{links}</div>
  <p class="inv">Bất biến lúc build: spec đóng băng {spec_txt} · <code>ACCEPTED = {acc}</code> ·
     <code>evidence_present = {evp}</code> · <code>SPIKE_C1</code> <code>{e(c1)}</code> ·
     sinh lúc {e(g['built_at'])} bằng <code>tools/board/build_board.py</code>.</p>
  <p class="disc"><strong>Bảng này được SINH RA từ state file của repo, không viết tay.</strong>
     Trạng thái spike, gates, mốc, buffer, rủi ro, ma trận reviewer đọc thẳng từ
     <code>PROJECT_STATE.yaml</code> và <code>SPIKE_PHASE_STATE.yaml</code>; PR, review và CI đọc từ
     GitHub API; checksum spec tính lại lúc build. Nếu một con số ở đây sai thì state file sai — kiểu
     hỏng dễ sửa hơn nhiều so với một đoạn văn cũ. Phần viết tay duy nhất là
     <code>tools/board/days.yaml</code>: việc của từng người và chuyện gì đã xảy ra trong ngày.</p>
</footer>"""

# --------------------------------------------------------------------------
# archive

def archive_day(g, h):
    d = g["d"]
    lbl, cls = STATUS_LABEL.get(h["status"], ("?", "idle"))
    dd = dt.date.fromisoformat(h["date"])
    mem = d["members"]

    def who(x):
        return mem[x]["name"] if x and x in mem else "Cả nhóm"

    def lst(items, withref=False):
        if not items:
            return '<p style="color:var(--ink-3)">— không có —</p>'
        out = []
        for x in items:
            ref = f' <code>{e(x["ref"])}</code>' if withref and x.get("ref") else ""
            out.append(f'<li><strong>{e(who(x.get("who")))}</strong> — {md(x["what"])}{ref}</li>')
        return "<ul>" + "".join(out) + "</ul>"

    dec = "".join(f"<li>{md(x)}</li>" for x in (h.get("decisions") or []))
    fnd = "".join(f"<li>{md(x)}</li>" for x in (h.get("findings") or []))
    body = f"""{nav("Các ngày trước", depth=1)}
<header class="top {'red' if h['status'] == 'missed' else 'amber'}">
  <p class="eyebrow">AI-assisted Cardiac MRI Research Workspace · lưu trữ</p>
  <h1><span class="day">DAY {h['day']}</span> — {e(dd.strftime('%d/%m/%Y'))}</h1>
  <div class="phase" style="background:var(--panel-2);color:var(--ink-2);border-color:var(--line)">
    <span class="st {cls}">{e(lbl)}</span> &nbsp; {e(h['title'])}</div>
  <p class="sub">{md(h['summary'])}</p>
</header>

<section><h2><span class="num">1</span> Đã xong — có bằng chứng truy được</h2>
  {lst(h.get('done'), withref=True)}</section>

<section><h2><span class="num">2</span> Còn tồn hoặc trượt</h2>
  {lst(h.get('missed'))}</section>

{f'<section><h2><span class="num">3</span> Quyết định ghi trong ngày</h2><ul>{dec}</ul></section>' if dec else ''}
{f'<section><h2><span class="num">4</span> Phát hiện đổi kế hoạch</h2><ul>{fnd}</ul></section>' if fnd else ''}

{footer_block(g, depth=1)}"""
    return body


def archive_index(g):
    d = g["d"]
    rows = []
    for h in d["history"]:
        lbl, cls = STATUS_LABEL.get(h["status"], ("?", "idle"))
        dd = dt.date.fromisoformat(h["date"])
        nd = len(h.get("done") or [])
        nm = len(h.get("missed") or [])
        rows.append(
            f'<tr><td><a href="day-{h["day"]:02d}.html"><strong>Day {h["day"]}</strong></a></td>'
            f'<td>{e(dd.strftime("%d/%m/%Y"))}</td>'
            f'<td><span class="st {cls}">{e(lbl)}</span></td>'
            f'<td>{e(h["title"])}</td><td>{nd}</td><td>{nm}</td></tr>')
    cards = "".join(
        f'<div class="dayrow {"missed" if h["status"] == "missed" else ""}">'
        f'<div class="hd"><span class="dn">DAY {h["day"]}</span>'
        f'<span class="dd2">{e(dt.date.fromisoformat(h["date"]).strftime("%d/%m/%Y"))}</span>'
        f'<span class="st {STATUS_LABEL.get(h["status"], ("?", "idle"))[1]}">'
        f'{e(STATUS_LABEL.get(h["status"], ("?", ""))[0])}</span></div>'
        f'<p style="margin:0 0 8px;font-size:13.5px">{md(h["summary"])}</p>'
        f'<p class="more"><a href="day-{h["day"]:02d}.html">→ chi tiết Day {h["day"]}</a></p></div>'
        for h in d["history"])
    return f"""{nav("Các ngày trước", depth=1)}
<header class="top">
  <p class="eyebrow">AI-assisted Cardiac MRI Research Workspace</p>
  <h1>Lịch sử ngày</h1>
  <p class="sub">Mỗi ngày một trang: đã xong gì <strong>kèm bằng chứng</strong>, trượt gì,
     quyết định nào được ghi, và phát hiện nào đổi kế hoạch.</p>
</header>

<section><h2><span class="num">1</span> Tất cả các ngày</h2>
  <div class="tblwrap"><table>
    <tr><th>Ngày</th><th>Ngày tháng</th><th>Kết quả</th><th>Tóm tắt</th>
        <th>Việc xong</th><th>Việc tồn</th></tr>
    {''.join(rows)}
  </table></div>
</section>

<section><h2><span class="num">2</span> Chi tiết</h2>{cards}</section>

{footer_block(g, depth=1)}"""
