# DAY 01 — END OF DAY REVIEW

**Ngày:** 2026-09-10
**Người điền:** Phạm Tuấn Anh — Team Leader
**Điền lúc:** cuối ngày, sau khi bốn spike dừng việc

> ### ⚠ TEMPLATE TRỐNG — ĐIỀN BẰNG SỰ KIỆN ĐÃ XẢY RA
>
> Không điền trước. Không điền giá trị dự kiến. Trường nào chưa xảy ra thì để trống hoặc ghi
> **`NOT MEASURED — <lý do>`**. `15` §1: *"Plan follows reality. Never mark reality as complete just to
> match the schedule."*

---

## 1 · Cutover

| Mục | Giá trị |
|---|---|
| Cutover đã xảy ra? | ☐ Có ☐ Không |
| Giờ cutover (local) | |
| `main` SHA tại cutover | |
| `DAY01_CUTOVER_RECORD.md` commit SHA | |
| Commit chuyển trạng thái SHA | |
| Commit cutover **đứng trước** commit chuyển trạng thái? | ☐ Có ☐ Không |

**Nếu cutover KHÔNG xảy ra** — mục nào của `R1`–`R9` đã chặn, và ai gỡ:

```
(để trống nếu cutover đã xảy ra)
```

---

## 2 · `started_at` từng spike

Mọi giá trị phải **≥ giờ cutover**. Không lùi ngày.

| Spike | Chủ sở hữu | Trạng thái cuối ngày | `started_at` thật | ≥ cutover? |
|---|---|---|---|---|
| **SPIKE_D** | Bế Quốc Khánh | | | ☐ |
| **SPIKE_A** | Phạm Tuấn Anh | | | ☐ |
| **SPIKE_B** | Vũ Hùng Anh | | | ☐ |
| **SPIKE_E** | Nguyễn Gia Đức Trung | | | ☐ |
| SPIKE_C0 | Bế Quốc Khánh | *kỳ vọng `PREPARED`* | *kỳ vọng `null`* | — |
| SPIKE_F | Vũ Hùng Anh | *kỳ vọng `PREPARED`* | *kỳ vọng `null`* | — |
| SPIKE_C1 | Bế Quốc Khánh | *kỳ vọng `BLOCKED`* | *kỳ vọng `null`* | — |

---

## 3 · Evidence đã land

Ghi **đường dẫn file đã commit**, không ghi mô tả suông.

| Spike | Evidence đã commit | Commit SHA | Có phân bố / dữ liệu thô đứng sau? |
|---|---|---|---|
| SPIKE_D | | | |
| SPIKE_A | | | |
| SPIKE_B | | | |
| SPIKE_E | | | |

**Artifact thô để ngoài git** — ghi định danh, checksum, lệnh sinh:

```
(để trống nếu không có)
```

**Số liệu prep bị loại trừ khỏi acceptance dataset** — ghi rõ cái nào:

```
(để trống nếu không có)
```

---

## 4 · Trigger DR-001 — **bắt buộc đánh giá**

> Nguyên văn: *nếu tới **cuối ngày execution đầu tiên**, **không có gói chính thức dùng được trên máy cục
> bộ**, **hoặc** validation gói/provenance lộ **một defect chặn việc nghiệm thu `GATE-DATA-01`** — thì
> **`RA-H01` leo lên BLOCKER** và **quy trình dự phòng dataset mở ra**.*

| Mục | Kết quả |
|---|---|
| Trigger đã được đánh giá? | ☐ Có ☐ **Không — đây là hỏng, ghi lý do** |
| Có gói chính thức dùng được trên máy cục bộ? | ☐ Có ☐ Không |
| Validation lộ defect chặn `GATE-DATA-01`? | ☐ Có ☐ Không ☐ Chưa đủ dữ liệu |
| **Kết luận** | ☐ Trigger **KHÔNG** nổ ☐ Trigger **NỔ** → `RA-H01` → BLOCKER, mở quy trình dự phòng |
| Người báo cáo | |
| Giờ báo cáo | |

**Nếu trigger nổ** — hành động đã mở, và ai chủ trì:

```
(để trống nếu không nổ)
```

> **Không âm thầm thay dataset khác.** Thay dataset cần đủ chuỗi `00` §13.

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

Kết quả âm là kết quả hợp lệ. Ghi lại, đừng giấu.

| Spike | Tiêu chí | Quan sát được | Đã leo thang cho ai |
|---|---|---|---|
| | | | |

---

## 6 · Blocker mới

| # | Blocker | Chủ | Ảnh hưởng tới | Hành động kế tiếp | Hạn |
|---:|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## 7 · Review — có kẹt không

| Reviewer | Đã review gì | Còn `QUEUED` | Có item nào sẵn sàng mà nằm cả ngày không ai đụng? |
|---|---|---|---|
| Vũ Hùng Anh (`D → A`) | | | |
| Phạm Tuấn Anh (`B → E`) | | | |

---

## 8 · 📱 Galaxy A17 — nhật ký thực tế

| Thứ tự | Người giữ | Từ | Đến | Đo được gì | Nhả đúng điều kiện cổng? |
|---:|---|---|---|---|---|
| 1 | | | | | ☐ |
| 2 | | | | | ☐ |
| 3 | | | | | ☐ |

Có ai giữ máy mà không đo không? ☐ Không ☐ Có → ghi rõ:

```
(để trống nếu không)
```

---

## 9 · Kiểm invariant cuối ngày

| Mục | Kỳ vọng | Thực tế |
|---|---|---|
| `sha256sum -c SPEC_MANIFEST_SHA256.txt` | 19/19 OK | |
| Commit chạm `docs/specs/v1.0/` | 0 | |
| `SPIKE_C1` | `BLOCKED`, `blocked_by: SPIKE_D` | |
| `SPIKE_C0`, `SPIKE_F` | `PREPARED` | |
| `TECH_STACK_ADR.md` | không tồn tại | |
| `ADR-ML-001` | không tồn tại | |
| Dataset bytes / secret / binary lớn được track | không có | |
| PR nào trộn hai spike | không có | |
| Commit của thành viên chạm `SPIKE_PHASE_STATE.yaml` | không có | |

---

## 10 · Đối chiếu tiêu chí kết thúc Day 01

| # | Tiêu chí | Đạt? |
|---:|---|---|
| 1 | Nợ Day 0 đóng sạch, `DAY0_SIGNOFF.md` 4/4 đã ký | ☐ |
| 2 | Baseline 30 ngày tồn tại và được chấp nhận | ☐ |
| 3 | Cutover record tạo tại lúc tuyên bố, commit trước mọi thay đổi trạng thái | ☐ |
| 4 | D/A/B/E `ACTIVE` qua một commit của Project Control, `started_at` ≥ cutover | ☐ |
| 5 | Mỗi spike có bằng chứng thật đầu tiên | ☐ |
| 6 | **Trigger DR-001 đã đánh giá và báo cáo** | ☐ |
| 7 | Blocker mới ghi kèm chủ và hành động kế tiếp | ☐ |
| 8 | Không queue review nào kẹt | ☐ |
| 9 | Leader đủ dữ kiện quyết Day 2 | ☐ |

---

## 11 · Quyết định Day 2

**Ưu tiên cao nhất của Day 2:**

```

```

**Thay đổi phân công hoặc thứ tự, nếu có, kèm lý do:**

```

```

**Cần mở Decision Request nào không?**

```

```

**Có kích hoạt recovery trigger (`15` §18) không?** ☐ Không ☐ Có → lý do:

```

```

---

```
Phạm Tuấn Anh — Team Leader

Chữ ký: ______________________     Ngày: 2026-09-10     Giờ: ________
```
