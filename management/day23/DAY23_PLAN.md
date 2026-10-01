# DAY 23 — 2026-10-02 (thứ Sáu) · kế hoạch

| Mục | Giá trị |
|---|---|
| **Lập lúc** | tối 01/10, sau override Day 22 |
| **Còn lại** | **7 ngày** tới Day 30, thứ Sáu 09/10. Hạn không lùi |
| **Trạng thái sau Day 22** | Hai cổng hôm qua còn mở đã **đóng**: `GATE-SPLIT-01` (11:16) và `GATE-ML-01` (14:30). `GATE-MOB-01` **đủ bằng chứng** (L4 PASS trên app sản phẩm, Spike B đạt ở L0) và chỉ chờ leader nhận giới hạn L5 (#82). 28 PR đã merge, mỗi PR qua QA bằng LLM. Hàng đợi DINOv2 đang chạy |
| **Quy trình hôm nay** | **Bình thường, đầy đủ.** Override Day 22 đã hết hạn lúc 23:59. Mỗi PR cần một duyệt hợp lệ đúng SHA head, cộng CI xanh (CP-07). PR về split, C1, ADR-ML hoặc cổng do leader merge |

---

## 0 · Day 22 đã làm được gì *(có bằng chứng, trong `DAY_LOG.md`)*

| Mảng | Kết quả ngày 01/10 | Bằng chứng |
|---|---|---|
| **Cổng** | `GATE-SPLIT-01` **đóng** 11:16 · `GATE-ML-01` **đóng** 14:30 · `GATE-MOB-01`: **chưa đóng.** Đã có L4 PASS trên app sản phẩm và Spike B đạt ở L0; chỉ còn chờ leader quyết có nhận L5 không (PR #82) | `f5aa763`, `3c02fd2` |
| **ML** | Spike C1 xong; **ADR-ML-001 ACCEPTED**: 560, batch 8, E = 50. Hàng đợi DINOv2 chạy từ 14:30. **EXP-D-025 xong lúc 17:15**: Dice 3D validation trung bình 0,570 (số dùng để chọn mô hình, không phải kết quả). EXP-D-100 đang chạy | #79, `day22/qa/` |
| **Pipeline** | train / infer / evaluate / export Contract 2 đều trên `main`. Thử end-to-end với dữ liệu thật tới backend và API: đạt, khi nới luật quần thể | #60, #64, #70, `E2E_PROOF_EXP_D_025.md` |
| **Khoá holdout** | Chỉ nhận split đóng băng; bắt buộc bản ghi GATE-IMG-01 có cấu trúc | #81 → `d907240` |
| **Contract + backend** | API contract 1.1.0. Backend với metrics chạy trên Mac mini, redeploy lúc 15:07 | #62, #68, #71, #75 |
| **Mô hình vertical** | V1 (SCR-03, case chưa có run) · V3 (sau 3 vòng QA) · V4 (review, brush, findings) | #53, #80, #61, #63 |
| **Màn hình mobile** | Shell + V1 SCR-02/03/04 (#77, #78) và V3 SCR-01/07 (#69) **đã qua QA, chờ GATE-MOB-01**. APK live chạy trên A17 sau khi sửa lỗi văng `latin1` trên Hermes (`ffbf763`) | #77, #78, #69 |
| **3D** | Frontier mesh thật (chỉ L0 nằm trong ±1 lát) · pipeline mesh trong backend · phiên S-1: Spike B: 5 mức × 3 lượt đều 59,9 FPS, nhưng chỉ **L0** đạt B6 trên máy, nên **DR-008c = L0** (#73). L4 trên app: **PASS** | #66, #74 |

**Điều quan trọng nhất cần biết:** phần lớn công việc hôm qua do **agent làm thay**, rồi merge sau khi có
**QA bằng LLM** (CHAT E). Đó **không phải** duyệt của người thứ hai. Vì vậy **việc 1 của mỗi người hôm nay là
duyệt lại và nhận phần làm thay trong khối mình**. Danh sách và chỗ ghi kết quả nằm trong
[`../day22/POST_RECOVERY_REVALIDATION_DAY23.md`](../day22/POST_RECOVERY_REVALIDATION_DAY23.md).

---

## 1 · Điều kiện của ngày

| # | Điều kiện | Loại | Phụ thuộc |
|---|---|---|---|
| 1 | Bốn người **duyệt lại và nhận** phần làm thay, ghi vào bảng revalidation **trước 12:00** | 🔒 cam kết | mỗi người khoảng 1,5 h |
| 2 | Hàng đợi **UNet chạy trên RTX 4050** từ 09:00 và qua **tripwire DR-016a** ở epoch 1; hàng đợi **DINOv2** vẫn sống (EXP-D-100 → EXP-D-050) | 🔒 cam kết | Khánh |
| 3 | **Chuẩn bị GATE-IMG-01:** dự đoán validation của EXP-D-100; ứng viên cấu hình morphology **chỉ** trên validation; khoá chặn holdout (PR guardrail R-1/N-1) được Khánh nhận | 🎯 cố gắng | EXP-D-100 xong khoảng 02:00; Khánh |
| 4 | **N-a (INT-12 trong số liệu cohort)** do leader quyết và Trung sửa; script ingest 54 case holdout sẵn sàng, chạy sau GATE-IMG-01 | 🎯 cố gắng | leader, Trung |
| 5 | **Spike B:** chủ spike viết RESULT, B15 và đề xuất DR-008c từ kết quả S-1 | 🎯 cố gắng | Hùng Anh |
| 6 | Nếu GATE-MOB-01 đóng: merge #82 → #77 → #78 → #69, mỗi PR đúng SHA đã QA, rồi đóng #65. Mỗi chủ khối đo màn hình của mình trên A17 | 🎯 cố gắng | GATE-MOB-01 |

---

## 2 · Thứ tự việc từng người

| Người | Việc 1 (sáng) | Việc 2 | Việc 3+ |
|---|---|---|---|
| **Bế Quốc Khánh** | duyệt lại #59 #60 #64 #70 #79; viết ghi chú C1-4 | **09:00 chạy hàng đợi UNet** trên 4050 | sửa #61 (B-1/B-2/B-3) → merge; #69 sau GATE-MOB-01 |
| **Nguyễn Gia Đức Trung** | duyệt lại #62 #68 #71 (+ #50) | QA và merge #63, #75; redeploy Mac mini | nợ contract/backend N-a…N-h, N-14; generator |
| **Vũ Hùng Anh** | duyệt lại #66, #73, #74; xác nhận TC-TEAM-001 | **Spike B RESULT + B15 + DR-008c** | V2 SCR-05 |
| **Phạm Tuấn Anh** | quyết GATE-MOB-01; duyệt lại #53, #80 | merge chồng mobile nếu cổng đóng; theo dõi train | quyết định chờ (danh sách trong gói của anh) |

Gói chi tiết: [`tasks/`](tasks/).

---

## 3 · Máy và GPU

| Máy | Việc | Hạn |
|---|---|---|
| PC leader (RTX 3050 Ti 4 GiB) | DINOv2: EXP-D-025 (**xong** 17:15) → EXP-D-100 (chạy từ 17:15) → EXP-D-050, E = 50, batch 8. EXP-D-025 xong 17:15. Epoch 1 của EXP-D-100: 0,59 s mỗi bước, ngưỡng hoà vốn 1,89 s. Sáng nay kiểm cả ba run đều COMPLETE | EXP-D-100 xong khoảng 23:00–01:10 đêm 01/10; EXP-D-050 khoảng 02:00–05:30 sáng 02/10 |
| RTX 4050 6 GiB của Khánh | UNet: EXP-U-025 → EXP-U-050 → EXP-U-100, cùng công thức. Tripwire DR-016a ở epoch 1: mỗi bước ≤ 1,13 s, không tràn bộ nhớ | bắt đầu 09:00; khoảng 24,3 h nếu không tràn bộ nhớ; hạn 12:00 ngày 03/10 |
| Mac mini | backend 1.1.0, 21 case, 0 run | redeploy khi #75 merge |
| A17 | Phiên S-1 xong tối 01/10. Máy dùng cho TC-PERF/TC-REV khi GATE-MOB-01 đóng | — |

**Không ai** chạy job nặng song song trên máy đang train: tối đa 2 worker, mỗi lúc một bản build Gradle. Hôm qua
một pool 18 tiến trình làm cạn bộ nhớ commit và giết job C1.

---

## 4 · Ranh giới (không đổi)

- Không đụng holdout trước GATE-IMG-01.
- Không đổi công thức ADR-ML-001 khi run đã bắt đầu.
- Không bịa số đo: chưa đo thì ghi `NOT MEASURED`.
- Không commit byte dataset, checkpoint, giá trị từng case, hash từng file dữ liệu, địa chỉ máy hay đường dẫn máy.
- Không sửa `docs/specs/v1.0/**`.
- Không force-push `main`.
- Không xoá file hay nhánh khi chưa hỏi leader.
- `NEGATIVE_RESULT` là kết quả hợp lệ (PR-SCI-03).

**Liên quan:**
- [`../day22/RECOVERY_OVERRIDE_DAY22.md`](../day22/RECOVERY_OVERRIDE_DAY22.md)
- [`../day22/POST_RECOVERY_REVALIDATION_DAY23.md`](../day22/POST_RECOVERY_REVALIDATION_DAY23.md)
- [`../spikes/SPIKE_C_ML/RESULT_C1.md`](../spikes/SPIKE_C_ML/RESULT_C1.md)
- [`../adr/ADR_ML_001.md`](../adr/ADR_ML_001.md)
