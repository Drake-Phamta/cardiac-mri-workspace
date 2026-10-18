# DAY 40 — 2026-10-19 (Chủ nhật) · kế hoạch

| Mục | Giá trị |
|---|---|
| **Lập lúc** | tối 18/10, sau override một ngày (Day 39) |
| **Hạn mới** | **31/10/2026** (Day 52), nghiệm thu và thuyết trình. Còn 13 ngày. Kế hoạch tổng: [`REPLAN_TO_2026-10-31.md`](REPLAN_TO_2026-10-31.md) |
| **Chặng** | C1 · Nhận lại và khởi động (19–20/10) |
| **Quy trình hôm nay** | **Bình thường, đầy đủ** (CP-07): mỗi PR một duyệt hợp lệ đúng SHA head + CI xanh. Override 18/10 đã hết hạn |

---

## 0 · Ngày 18/10 đã làm được gì *(có bằng chứng trên `main`)*

| Mảng | Kết quả | Bằng chứng |
|---|---|---|
| PR tồn đọng | #85–#90 lên `main` (3 PR có approval của Hùng Anh, 3 PR qua QA LLM) | `RECOVERY_OVERRIDE_DAY39.md` §6 |
| **GATE-IMG-01** | **đóng** theo luật khai trước: PP-4 (3D opening, rồi thành phần liên thông lớn nhất) thắng trên validation (+0,022 Dice) | #92, #93 |
| **Kết quả holdout thật** | DINOv2 25 % 0,559 · 50 % 0,616 · 100 % 0,639 · **PP-4 0,659** Dice 3D trung bình (n = 54, CI 95 %) | `management/day39/RESULTS_HOLDOUT_DINOV2.md` (#96) |
| So sánh | 25 → 100 %: +0,081 [+0,047; +0,118] · 50 → 100 %: +0,023 (CI chạm 0) · PP-4: +0,020 [+0,015; +0,026], 45/54 case tốt hơn | như trên |
| Contract + backend | DR-017 (CASE_0001 tính vào cohort), validator DR-018, DR-022: backend phục vụ **74 case** gồm 53 case holdout | #94 |
| **E2E** | hero flow H1–H10 mức API trên dữ liệu thật: **22 PASS / 0 FAIL / 1 SKIP** (bước SKIP: UNet) | `tools/e2e/` (#95, #98) |
| 3D | khung V2 SCR-05: 289 mesh L0 từ backend, chạm 3D → mở lát 2D (H6/H7 PASS) | #98 |

**Điều quan trọng nhất:** phần lớn việc 18/10 do **agent làm thay**, merge sau **QA bằng LLM**, không phải duyệt của
người. **Việc 1 của mỗi người hôm nay là duyệt lại và nhận phần làm thay trong khối mình**:
[`../day39/POST_RECOVERY_REVALIDATION_DAY40.md`](../day39/POST_RECOVERY_REVALIDATION_DAY40.md).

---

## 1 · Điều kiện của ngày

| # | Điều kiện | Loại | Ai |
|---|---|---|---|
| 1 | Bốn người duyệt lại phần làm thay, ghi vào bảng revalidation **trước 12:00** | 🔒 cam kết | cả nhóm |
| 2 | **Hàng đợi UNet chạy trên RTX 4050** (EXP-U-025 → 050 → 100, E = 50, batch 8) và qua **tripwire** ở epoch 1 | 🔒 cam kết | Khánh |
| 3 | **B15** (Spike B) và **phán quyết Spike C1** (APPROVE/REJECT + loại lý do, DR-016b) | 🔒 cam kết | Hùng Anh |
| 4 | ✅ Backend thật đã lên Mac mini 18/10 (74 case, 4 gói, 289 mesh; E2E qua overlay 20 PASS / 0 FAIL). Hôm nay: `/health` từ A17 | 🎯 cố gắng | leader |
| 5 | V4 #72 rebase lên `main`, thôi nháp; V2 nhận khung SCR-05 | 🎯 cố gắng | Trung, Hùng Anh |

## 2 · Thứ tự việc từng người

| Người | Việc 1 (sáng) | Việc 2 | Việc 3+ |
|---|---|---|---|
| **Bế Quốc Khánh** | duyệt lại K1–K5 | **chạy UNet** trên 4050, báo tripwire | V3: hiển thị kết quả thật trên SCR-01/07; TC-TEAM-001 |
| **Nguyễn Gia Đức Trung** | duyệt lại T1–T3 | #72 V4 thôi nháp | deploy Mac mini cùng leader; nợ QA-094 |
| **Vũ Hùng Anh** | duyệt lại H1–H2; **B15**; **phán quyết C1** | nhận khung SCR-05 | đo 3D trên A17 (TC-3D-*, TC-PERF-002) |
| **Phạm Tuấn Anh** | xác nhận DR-022; duyệt PR revalidation của nhóm | phiên A17: TC-PERF-001 theo script A9 | deploy Mac mini; nhắc từng người |

Gói chi tiết: [`tasks/`](tasks/).

## 3 · Máy

| Máy | Việc |
|---|---|
| RTX 4050 của Khánh | UNet EXP-U-025 → 050 → 100 (DR-016a), tripwire ở epoch 1 |
| PC leader (3050 Ti) | trống; dự phòng UNet nếu 4050 không chạy |
| Mac mini | backend 74 case + 4 gói Contract 2 |
| A17 | TC-PERF-001 (leader) và đo 3D (Hùng Anh), mỗi lúc một người |

## 4 · Ranh giới (không đổi)

- Không đụng holdout ngoài bản ghi cho phép. UNet chỉ được đánh giá holdout khi có bản ghi cho phép mới của leader.
- Không đổi công thức ADR-ML-001. Không bịa số đo: chưa đo thì ghi `NOT MEASURED`.
- Không commit dữ liệu, checkpoint, giá trị từng case, IP, serial hay đường dẫn máy.
- Không sửa `docs/specs/v1.0/**`. Không force-push `main`. Không xoá file hay nhánh khi chưa hỏi leader.
