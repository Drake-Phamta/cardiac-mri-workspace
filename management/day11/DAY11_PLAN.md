# DAY 11 — 2026-09-20 · kế hoạch

| Mục | Giá trị |
|---|---|
| **Lập lúc** | **17:50** — ngày đã đi mất hai phần ba. Xem §0 |
| **Buffer** | 🔴 **−3** · `MUST` `ACCEPTED` **0/33** · còn **20 ngày** |
| **Recovery `15` §18** | 🔴 **đã nổ 3/5** từ Day 10 · Mức 1 **được leader cho phép** hôm nay, kèm ghi lý do |
| **Chẩn đoán Day 10** | không thiếu năng lực — **thiếu lượt duyệt**. Năm PR CI xanh chờ đúng hai review |

---

## 0 · Kế hoạch này lập lúc 17:50, và nói thẳng điều đó

Bản này **không** giả vờ là kế hoạch một ngày đầy đủ. Tới lúc viết, **không ai commit gì trong ngày hôm
nay**, và còn **~6 giờ** tới hạn 23:59. Đặt bốn điều kiện 8-giờ vào sáu tiếng là lặp lại đúng cái sai của
Day 10: hứa thay người khác.

Nên Day 11 được chia làm hai:

- **Tối nay (17:50 → 23:59)** — chỉ những việc **mở khoá người khác**, không việc mới nào. Mục tiêu duy
  nhất: đưa thứ **đã làm xong từ hôm qua** lên `main`.
- **Việc còn lại** chuyển sang Day 12 với hàng đợi đã sạch nút cổ chai, không phải với năm PR treo.

---

## 1 · Nút cổ chai, bằng số

| Đang chờ | PR | CI | Chờ ai | Mở khoá gì |
|---|---|---|---|---|
| `app/core` | **#48** | 7/7 ✅ | **Khánh** | **cả chồng #50 → #51 → #52** |
| generator fixture | #50 | 7/7 ✅ | anh (đã gắn) | mọi vertical có dữ liệu |
| mô hình V4 | #51 | 7/7 ✅ | anh (đã gắn) | V4 lên `main` |
| bằng chứng V4 | #52 | 7/7 ✅ | anh (đã gắn) | `TC-TEAM-001` |
| Spike A `S6` | **#41** | — | **Hùng Anh** | Spike A `ACCEPTED` |
| Spike A `S8` | **#49** | 5/5 ✅ | **Hùng Anh** | Spike A `ACCEPTED` |

**Chồng `#48 → #50 → #51 → #52` tuyến tính hoàn toàn**, `git merge-tree` báo **gộp sạch**.
**Đúng một lượt duyệt của Khánh mở khoá cả bốn.** Đó là đòn bẩy lớn nhất còn lại trong ngày.

---

## 2 · Tối nay — thứ tự, không phải danh sách

### Mọi người: **duyệt trước, việc mình sau**

| Ưu tiên | Ai | Việc | Vì sao đúng thứ tự này |
|---|---|---|---|
| **1** | **Khánh** | Duyệt **#48** *(~30 ph)* | Một lượt duyệt, bốn PR vào `main`. Không có việc nào trong dự án có tỉ lệ đòn bẩy như vậy tối nay |
| **1** | **Hùng Anh** | Duyệt **#41** và **#49** *(~1 h)* | Hai lượt này là tất cả những gì còn giữa Spike A và `EVIDENCE_READY` |
| **2** | **anh** | Merge #48 → đổi base #50 sang `main` → duyệt → merge → #51 → #52 | **M5 lần đầu có mã trên `main`** |
| **2** | **Trung** | **Chạy QA-004** khi #41 và #49 đã merge | Bước 3 `acceptance_workflow`. Xem §4 |
| **3** | **Hùng Anh** | **Diễn giải `B10`/`B11`** vào `RESULT.md` Spike B | Việc duy nhất **không ai làm thay được** — `DR-006a` rev 3 ràng b |
| **3** | **Khánh** | Sinh lại split → bỏ nháp **#35** | Đường găng, đứng yên **sang ngày thứ 5** |

### Nếu tới **21:00** lượt duyệt chưa có

Leader đã cho phép **Mức 1 `15` §18**. Người dự phòng:

| Review | Chính | Dự phòng từ 21:00 |
|---|---|---|
| #48 | Khánh | **Trung** |
| #41 · #49 | Hùng Anh | **Trung** |

**Ranh giới pháp lý, phải ghi đúng:** `SPIKE_PHASE_STATE.yaml` §`review_serialization` **cấm** đổi reviewer
*để né lịch* (`ownership_change_permitted: false`). `15` §18 Mức 1 chỉ mở khi **recovery đã kích hoạt kèm
lý do được ghi** — và nó đã kích hoạt từ Day 10. Nên mỗi lần dùng dự phòng **phải** ghi vào
`review_serialization.reassignments` đủ `date / spike / from / to / reason / basis`, `reason` là
**recovery Mức 1**, không phải *"cho nhanh"*. Không ghi lý do thì chính việc đó là một defect
(`commit_hygiene_note`). Và **quyền sở hữu không chuyển** — anti-bottleneck rule của `DR-013`.

---

## 3 · Đã làm xong trước khi bản này viết *(17:44 → 17:55, không chờ ai)*

| Việc | Vì sao làm ngay |
|---|---|
| **Gắn người duyệt cho #41, #50, #51, #52** | Bốn PR này **không có reviewer nào** — chúng vô hình trong hàng đợi của mọi người. Day 10 trượt một phần vì #47 cũng ở tình trạng đó |
| **Cập nhật `RESULT.md` Spike A** với kết quả `S8` | Bước 1 `acceptance_workflow`. File còn ghi `A8`/`A10`/`A11` là `NOT MEASURED` — **Hùng Anh sẽ không có gì để duyệt** |

---

## 4 · Xung đột vai ở Spike A — nêu ra, không đi vòng

Chủ sở hữu Spike A là **Phạm Tuấn Anh**, và anh cũng là **Project Control**. `acceptance_workflow`
(`SPIKE_PHASE_STATE.yaml` dòng 836) **không có điều khoản hồi tị** cho bước 3 (QA) hay bước 4.

Spike D không vướng: chủ (Khánh) ≠ reviewer (Hùng Anh), Project Control chỉ đeo thêm vai QA. Ở Spike A,
nếu chủ tự chạy QA thì `ACCEPTED` mang chữ ký **một người đeo ba vai**.

**Đề xuất:** **Trung chạy bước 3** — `python management/day10/qa004_spike_a/run_qa004.py`, script làm phần
nặng, Trung đọc bảng và ký verdict. Project Control chỉ làm **bước 4**. Như thế bước 2–3–4 là **ba người
khác nhau**, chặt hơn cả Spike D.

**Và một quyết định của anh ở bước 4:** Spike A sẽ `ACCEPTED` với **`A1` và `A12` còn "một phần"** —
`A1` chưa kiểm khớp fixture theo từng pixel (React Native `Image` nội suy bilinear, không có
nearest-neighbour; cần một cách kiểm ở tầng dữ liệu), `A12` mới có **một** ứng viên nên chưa so sánh được.
Nhận kèm hai hạn chế **ghi rõ**, hay giữ `EVIDENCE_READY`? Đây là câu hỏi cho anh, không phải chỗ để lặng
lẽ tính là đạt.

---

## 5 · Điều kiện — tách cam kết và cố gắng

Day 10 đặt bốn điều kiện ngang nhau và trượt ba. Lần này nói rõ cái nào phụ thuộc mấy người.

| # | Điều kiện | Loại | Phụ thuộc |
|---|---|---|---|
| **1** | **M5 có mã thật trên `main`** — #48 + #50 + #51 + #52 merged | 🔒 **cam kết** | **một** lượt duyệt |
| **2** | **Spike A `EVIDENCE_READY`** — #41 và #49 merged | 🔒 **cam kết** | **hai** lượt duyệt của một người |
| **3** | **Spike A `ACCEPTED`** đủ 4 bước, bước 3 do Trung | 🎯 cố gắng | điều kiện 2 + Trung còn giờ |
| **4** | **`GATE-SPLIT-01` `CLOSED`** | 🎯 cố gắng | Khánh sinh lại + Trung duyệt, trong 6 giờ |
| **5** | **`GATE-MOB-01` `CLOSED`** | ⏭ **chuyển Day 12** | cần Spike B `ACCEPTED`, mà `B10`/`B11` chưa ai diễn giải |

Điều kiện 5 chuyển sang Day 12 **không phải vì nó kém quan trọng** — nó là M2, quá hạn 5 ngày. Mà vì trong
sáu tiếng còn lại nó cần: một lượt diễn giải + sửa #44 + một lượt duyệt lại + QA + ADR. Hứa nó tối nay là
hứa thay người khác, đúng cái Day 10 đã làm.

---

## 6 · Verification

| Sau việc gì | Kiểm gì |
|---|---|
| mỗi merge | CI trên `main` xanh · `node app/core/tests/run_all.mjs` xanh · grep từ khoá đóng PR **trước** khi commit |
| QA-004 | `run_qa004.py` thoát 0 · bảng đọc từ **tệp bằng chứng thô**, không từ `RESULT.md` |
| đổi reviewer | `reassignments` có đủ `date/from/to/reason/basis` |
| `GATE-SPLIT-01` | `SPIKE_C1` rời `BLOCKED` **chỉ sau khi** cổng ghi `CLOSED` — job `state-parses` cưỡng chế |
| chốt ngày | `count_spec_ids.py` → 44/33/70 · `build_board.py` → 0 `<script>` · **`DAY11_EOD_REVIEW.md` trước 23:59** |

---

## 7 · Ranh giới

Không tính số `B` thay Hùng Anh, số `E` thay Trung · không chuyển `ACCEPTED` ngoài 4 bước · **không tự
duyệt PR của chính mình** · chuyển **lượt duyệt** thì được (Mức 1, có ghi lý do), chuyển **quyền sở hữu**
thì không · không sửa `docs/specs/v1.0/**` · không ghi `tests/fixtures/geometry/**` · không commit byte
dataset hay điểm tương quan từng cặp · không từ khoá đóng PR · **không lệnh xoá khi chưa được anh xác
nhận** — ranh giới này đã bị vượt **hai lần**, gần nhất hôm qua trong phiên `S8`.

**Liên quan:** [`DAY10_EOD_REVIEW.md`](../day10/DAY10_EOD_REVIEW.md) ·
[`INC-002_DAY10.md`](../incidents/INC-002_DAY10.md) · [`tasks/`](tasks/) ·
[`qa004_spike_a/`](../day10/qa004_spike_a/)
