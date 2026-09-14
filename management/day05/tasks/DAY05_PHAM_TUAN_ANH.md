# DAY 5 — Phạm Tuấn Anh · 2026-09-14

**Khối lượng hôm nay:** **không giới hạn giờ** — anh gánh thêm review và chốt tiến độ mỗi ngày (quyết định của
anh 14/09). Thành viên: ~8 h/ngày, hạn **23:59**, không cần khai báo giờ rảnh.

> **Day 4 đạt 3/3** — lần đầu kể từ Day 1. Critical path nhích lần đầu: Spike D có bằng chứng đầy đủ ở PR #25.
> Hôm nay nó có thể nhích **ba nấc**: #25 merge → **anh quyết `DR-002`** → Khánh chạy split.

## 🔴 LÀM TRƯỚC — nợ tồn

> **Quy tắc của anh:** nợ làm **trước**; việc Day 5 chỉ bắt đầu sau khi xong khối này.

| # | Nợ | Giờ |
|---|---|---|
| **1** | Chạy `tools/host_hardening/disable_sshd.ps1` trong PowerShell **Run as administrator** — cổng SSH vẫn mở cho mạng Wi-Fi | ~5 ph |

## Việc Day 5

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **2** | **Quyết `DR-002`** ngay khi #25 merge — phân tích ở dưới | ~30 ph | Hùng Anh (#25) | quyết định ghi vào `OPEN_DECISIONS.md` |
| **3** | **Sửa PR #17** theo **5** lỗi chặn Khánh nêu *(Claude viết, anh duyệt; packet ghi nhầm là 4)* | ~3 h | không | Khánh `APPROVE` |
| 4 | Merge theo thứ tự **#25 → #23 → #24** khi mỗi PR đủ review | Project Control | reviewer | CI xanh sau mỗi merge |
| 5 | ✅ **Đã quyết 14/09:** anh bấm cho Spike B như Spike E (`DR-006a` rev 3); reviewer Spike B → Trung; Hùng Anh và Trung được báo trong packet + tin nhắn | ~15 ph | không | `OPEN_DECISIONS.md` rev 3 |
| 6 | Đo lại Spike E khi PR payload của Trung merge — theo kế hoạch đo của Trung | ~30 ph | Trung | dữ liệu thô lên `spike-e/evidence-*` |

## Nếu còn thời gian

- Spike A chặng S4 — zoom/pan, bám fixture hình học chính thức *(~2 h)*.

---

## Phân tích `DR-002` — anh quyết, Project Control không quyết

`06` §6: **Path A** (80/20 phát triển trên 100 case + **54 case test khoá cứng**) nếu nhãn test **có và đã xác
minh nguồn gốc**; ngược lại **Path B** (70/15/15 trên 100 case).

| Bằng chứng từ PR #25 | |
|---|---|
| `A12` | nhãn có ở **54/54** case `Testing Set` trong gói chính thức đã tải |
| `A11` | Khánh xác nhận `laendo.nrrd` là LA cavity, dẫn mô tả chính thức của Cardiac Atlas |
| `A10` · hình học | mask `{0, 255}`; hình học MRI–mask khớp cả 154 case |
| Giới hạn Khánh tự ghi | đó là **bằng chứng mức file của gói phát hành** — **không** khẳng định nhãn có trong lúc chấm thi gốc. Nguồn chính thức mâu thuẫn ở điểm này (`DR-002`, [UNRESOLVED]) |

| | **Path A** | **Path B** |
|---|---|---|
| Tập test | **54 case** — lớn, chính là phân vùng phát hành | **15 case** |
| Độ tin của so sánh RQ-A | cao hơn nhiều | thấp — 15 case |
| Rủi ro | nếu sau này có người nói nhãn test "không chính thức", phải bảo vệ bằng mô tả phát hành hiện tại + bằng chứng file | an toàn về nguồn gốc, nhưng **bỏ phí 54 case có nhãn** |
| Lùi được không | `06` §6: **không đổi sau khi thấy kết quả test** — quyết một lần | như trên |

**Nhận định của Project Control:** bằng chứng nghiêng về **Path A** — nhãn có thật, đúng mục tiêu, do nguồn chính
thức phát hành, và tập test lớn gấp 3,6 lần. Điều kiện đi kèm nếu anh chọn A: bản quyết định ghi rõ **cơ sở
nguồn gốc** (mô tả phát hành hiện tại của Cardiac Atlas + bằng chứng file của PR #25 + trang chính sách đã lưu ở
`A18`), và ghi rằng câu hỏi "nhãn có trong lúc chấm thi gốc hay không" **không** ảnh hưởng tính hợp lệ của tập
test cho dự án này.

**Một câu Khánh phải trả lời trước khi `GATE-SPLIT-01` đóng:** mỗi bệnh nhân có một hay nhiều scan. Split theo
bệnh nhân là bất biến — packet của Khánh đã yêu cầu cậu ấy ghi rõ.

---

**Liên quan:** PR #25 · PR #17 · [`../../day04/DAY04_EOD_REVIEW.md`](../../day04/DAY04_EOD_REVIEW.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) → `DR-002`
