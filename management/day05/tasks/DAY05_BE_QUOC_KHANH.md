# DAY 5 — Bế Quốc Khánh · 2026-09-14

**Khối lượng hôm nay:** phần chính **~7 h** · thêm ~1 h nếu còn thời gian · **hạn: 23:59 hôm nay**.

> **Đêm qua bạn đã làm cho Day 4 đạt.** PR #25 là audit Spike D đầy đủ — 16 PASS, 0 FAIL, 154 case — và chế độ
> `--archive` bạn tự viết để đọc thẳng file zip khi máy không đủ 14,2 GiB là một lời giải tốt. Review của bạn
> ở PR #17 có **5** lỗi chặn thật *(bản đầu packet ghi nhầm là 4)*; đó là review thật đầu tiên của bạn và đóng cột `B` nợ từ Day 0.
> Hạn cứng của audit: phần của bạn **đã nộp**; audit lên `main` khi Hùng Anh review xong.

## 🔴 LÀM TRƯỚC — nợ tồn, theo thứ tự

> **Quy tắc của leader:** nợ làm **trước**; việc Day 5 chỉ bắt đầu sau khi xong khối này.

| # | Nợ | Giờ | Xong khi |
|---|---|---|---|
| **1** | Khai báo compute **`C0-1`**: GPU (RTX 4050), VRAM, **driver NVIDIA**, bản CUDA/PyTorch, RAM, OS — đọc từ máy, không ước lượng | ~15 ph | một comment hoặc commit ghi đủ các trường |
| **2** | Sửa theo review PR #25 khi Hùng Anh gửi | ~1 h | Hùng Anh `APPROVE` |

## Việc Day 5

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **3** | **Script split theo bệnh nhân, seed `2024` — viết cho CẢ Path A và Path B**, để chạy được ngay khi leader quyết `DR-002` | ~2,5 h | không — viết trước khi có quyết định | script + selftest trên dữ liệu giả, PR |
| **4** | Chạy split theo path đã quyết → manifest split, commit dưới tài khoản bạn | ~30 ph | leader (`DR-002`) | manifest split — đầu vào `GATE-SPLIT-01` |
| **5** | Review bản sửa **PR #17** khi leader đẩy lên | ~30 ph | leader | `APPROVE` hoặc yêu cầu sửa tiếp |
| **6** | **Chạy probe `C0`** trên RTX 4050 với **hình dạng thật** của cohort (`uint8`, 576×576×88 và 640×640×88 — số đo của chính bạn ở PR #25). `--operator` là bắt buộc | ~2 h | #17 merge | log thô + bảng batch lớn nhất vừa VRAM, trên nhánh `spike-c0/...` |

**Nếu #17 chưa sửa xong lúc bạn tới việc 6:** làm phần "nếu còn thời gian" trước, rồi quay lại việc 6.

> **✅ Mới, 14/09 tối — leader đã quyết `DR-002` = PATH A** (`OPEN_DECISIONS.md` → DR-002, dựa trên bằng chứng
> PR #25 của bạn mà Hùng Anh đã review nội dung). Việc 4 **không còn chờ ai**: 80/20 trên 100 case `Training
> Set` theo bệnh nhân, seed `2024`, 54 case `Testing Set` khoá cứng. Script cho Path B không cần nữa.
> `GATE-SPLIT-01` đóng khi manifest split của bạn có trên `main` và câu hỏi một bệnh nhân nhiều scan được trả
> lời. **Việc gấp nhất vẫn là xoá khoảng trắng cuối dòng 3 `RESULT.md` ở #25** để audit lên `main`.

**Hai phương án split theo `06` §6** *(Path A đã được chọn)*:

| | Path A | Path B |
|---|---|---|
| Phát triển | 100 case `Training Set`, chia 80/20 | 100 case `Training Set`, chia 70/15/15 |
| Test | **54 case `Testing Set`, khoá cứng** | 15 case lấy từ 100 |

**Một câu phải trả lời trước khi chạy, và ghi vào PR:** split theo **bệnh nhân**, không theo case. Nếu gói cho
biết một bệnh nhân có nhiều scan (ví dụ trước và sau can thiệp) thì mọi scan của bệnh nhân đó phải cùng một
phía. Nếu gói **không** cho biết điều đó, ghi rõ là không xác định được — đó là câu hỏi nguồn gốc mà
`GATE-SPLIT-01` đòi giải quyết, và leader phải biết trước khi đóng gate.

**Bất biến:** seed `2024`; split **không đổi** sau khi đã thấy kết quả test (`06` §6).

## Nếu còn thời gian

- Dựng khung **pipeline C0 trên volume tổng hợp đúng hình dạng** (`next_action` của `SPIKE_C0`): đọc `uint8`
  576/640 × 88, chuẩn hoá, đưa qua mô hình *(~1 h)*. **Không** đụng dữ liệu thật cho C1 — `SPIKE_C1` còn `BLOCKED`
  tới khi Spike D được nghiệm thu.

---

**Liên quan:** PR #25 · PR #17 · [`../../spikes/SPIKE_D_DATASET/TASK.md`](../../spikes/SPIKE_D_DATASET/TASK.md) ·
[`../../spikes/SPIKE_C_ML/`](../../spikes/SPIKE_C_ML/) · `OPEN_DECISIONS.md` → `DR-002`
