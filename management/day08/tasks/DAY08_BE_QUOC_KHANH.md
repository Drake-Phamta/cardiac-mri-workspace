# DAY 8 — Bế Quốc Khánh · 2026-09-17

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~9 h)* · hàng đợi dự phòng ~2 h · **hạn: 23:59**.

> **Đêm qua bạn làm đúng và làm nhiều.** `F5` thực hiện xong (manifest công khai rút 473 dòng, bảng checksum
> chuyển sang manifest hạn chế ngoài repo, validator **từ chối** ghi bản hạn chế vào repo); #34 chuyển ready với
> **7/7 phát hiện có câu trả lời riêng kèm file:dòng và lệnh kiểm lại**; `DR-002b` vào code trong vòng ba giờ sau
> khi leader quyết; và #40 vá **8 lỗi validator với 8 ca kiểm hồi quy**. Quan trọng hơn cả: #40 **tự phơi ra một
> phát hiện bất lợi cho chính bạn** — hai file lạ trong gói làm `A17` `FAIL` — thay vì lặng lẽ bỏ qua. Đó đúng là
> cách một người làm dữ liệu phải hành xử.
>
> **Vấn đề còn lại thuần tuý là thời điểm.** Tất cả land 00:08–00:36, **ngày thứ tư liên tiếp sau nửa đêm**
> (Day 4 03:10 · Day 5 00:44 · Day 6 00:19 · Day 7 00:08). Hệ quả không nằm ở luật mà ở lịch: Hùng Anh **không có
> gì để duyệt** suốt cả Day 7, nên `GATE-DATA-01` sang **ngày thứ tám**.
>
> **Mốc đẩy 12:00/18:00 đã thử ở Day 7 và không có tác dụng, nên hôm nay thay bằng một luật khác:**
> **việc đang chặn người khác phải làm trước việc của chính bạn.** Cụ thể: phần trả lời review #34 xếp trên mọi
> việc khác — kể cả việc bạn thấy thú vị hơn.

## 🔴 LÀM TRƯỚC

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **#40 hết nháp + đổi base sang `main`.** PR đang xếp chồng trên `codex/day6-khanh` (#34) — **đúng cái bẫy đã đóng #28 ngày 15/09**: nếu #34 merge và nhánh bị xoá thì #40 tự đóng. Làm: `gh pr edit 40 --base main` → `gh pr ready 40` → nhờ Hùng Anh review. Kiểm CI chạy lại 4/4 sau khi đổi base | ~30 ph | không | #40 nhắm `main`, hết nháp, có người review |
| **2** | **`A17` — hai file bạn vừa phát hiện.** Gói chính thức có `Unet.py` và `preprocess_data.py` ở thư mục gốc; bạn đang để `A17` `FAIL`, đúng. Việc hôm nay: **tuyên bố loại trừ của chủ spike** — chúng là gì (đọc nội dung), vì sao **không phải dữ liệu ca bệnh**, và vì sao loại trừ chúng không làm yếu `A17`; rồi thêm **luật loại trừ tường minh** vào validator (không phải allowlist ngầm) + một ca kiểm chứng minh luật đó có thể `FAIL` khi gặp file lạ khác | ~1 h | không | `A17` `PASS` có căn cứ, hoặc `FAIL` kèm lý do rõ — không để lửng |
| **3** | **Trả lời review #34 ngay khi Hùng Anh gửi.** Đây là việc **đang chặn cả critical path**; xếp trên mọi việc khác trong packet này. Nếu cậu ấy yêu cầu sửa, sửa và đẩy trong ngày, đừng gộp sang hôm sau | ~1,5 h | Hùng Anh duyệt (hẹn **trước 12:00**) | #34 được `APPROVE`, hoặc vòng sửa thứ hai đã đẩy xong trong ngày |

## Việc Day 8

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **4** | **#35 — áp phán quyết `DR-002b` × `F5`.** Trung đòi danh sách case bị loại **kèm điểm**; bạn in `RESTRICTED_BY_F5` theo quyết định thu hẹp cùng ngày — hai quyết định của leader va nhau đúng chỗ này, leader phán trong sáng nay. Áp xong thì nhờ Trung duyệt lại. **Sau khi #34 merge:** sinh lại split theo SHA manifest mới trên `main`, cập nhật `SPLIT_RESULT.md`, bỏ nháp | ~1,5 h | leader (phán quyết) · #34 merge | #35 hết nháp, Trung duyệt lại |
| **5** | **Chuẩn bị `SPIKE_C1` — chỉ thiết kế, KHÔNG chạm dữ liệu thật.** `M4` bắt đầu hôm nay (Day 8–12) và cả 10 tiêu chí `C1-*` chưa đo; spike vẫn `BLOCKED` nên **không train, không đọc case thật, không mở nhãn holdout**. Việc được phép và cần làm: kế hoạch đo `C1-1`…`C1-10` — mỗi tiêu chí cần **bằng chứng gì**, lấy subset từ split **20/38/78** (nhớ `CASE_0133` và `CASE_0117` đã bị loại khỏi train), tái dùng `pipeline_bringup.py` của #37 làm khung, ghi rõ phụ thuộc `GATE-DATA-01` và `GATE-SPLIT-01`, và chỗ dành cho **phân tích độ nhạy** mà `DR-002b` (d) yêu cầu | ~2,5 h | không *(thiết kế không bị gate chặn)* | tài liệu kế hoạch trong `SPIKE_C_ML/`, PR nháp |
| **6** | **#37 hết nháp + nhờ review** — khung pipeline tổng hợp là nền cho việc 5, để nháp mãi thì không ai soát được | ~30 ph | không | #37 ready, có người review |
| **7** | **Gói bằng chứng cá nhân `TC-TEAM-001`** — vertical **V3 (Experiment/cohort)**. Đây là **một trong sáu test của sàn nghiệm thu cuối** (`13` §13) và **chưa ai trong nhóm bắt đầu**. Sáu hạng mục theo `10` §10: yêu cầu/use-case bạn sở hữu → artifact thiết kế UI → kiến trúc/API/dữ liệu → PR và commit đã làm → bằng chứng test → ghi chú demo và bảo vệ. Bạn đã có sẵn nguyên liệu: Spike D, C0, split | ~1,5 h | không | một file trong `management/` theo mẫu `10` §10 |

**Tổng phần chính: ~9 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md) *(v1, leader duyệt 16/09)*: **D2** *(mọi con số
> trên màn hình truy được về artifact sinh ra nó)* · **H1 / SCR-01** *(tổng quan dataset: số case kèm N)* ·
> **H10 / SCR-07** *(so sánh mô hình — kế hoạch `C1` việc 5 quyết định bảng này trông ra sao)* · **D3** *(cái gì
> chưa kiểm được thì hiện là **không khả dụng** — `A19` và `A17` của bạn đang làm đúng tinh thần đó)*.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **`C0-3` — tìm trần batch thật.** Bảng hiện ghi nhiều biến thể ở `16 (cap)`; đó là **chặn dưới**, không phải trần. Chạy lại tìm batch với cap cao hơn cho các biến thể chạm trần, cập nhật `RESULT.md` và ghi rõ giá trị nào là trần thật | ~1 h | commit trên nhánh C0 mới |
| **`C0-9` — phản biện `DR-011` sâu hơn**: ngưỡng percentile 0,5/99,5 ảnh hưởng gì tới biên khoang nhĩ trái | ~1 h | một mục trong `RESULT.md` C0 |

---

**Ranh giới không đổi:** `SPIKE_C1` còn `BLOCKED` — **không train, không đọc case thật, không mở nhãn 54 case
holdout**. Không commit byte dataset. Không tự chuyển `ACCEPTED`/`EVIDENCE_READY`. **Liên quan:** PR #34 · #35 ·
#37 · #40 · [`../../day07/DAY07_EOD_REVIEW.md`](../../day07/DAY07_EOD_REVIEW.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) → `DR-002b`
