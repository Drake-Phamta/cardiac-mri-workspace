# DAY 23 — Vũ Hùng Anh · 2026-10-02 (thứ Sáu)

**Gói này lập tối 01/10, sau override Day 22.** Hôm qua agent làm thay trong khối 3D:
- dựng mesh thật và đo B5/B9/B12 offline;
- chuẩn bị gói phiên S-1;
- viết pipeline mesh cho backend.

Tối 01/10 leader cầm A17 chạy phiên S-1. Mọi merge đều qua QA độc lập (CHAT E, một LLM). **Quyền sở hữu không
chuyển.** Từ sáng nay khối 3D trở lại với bạn.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **Sáng 02/10 leader đã chốt** (`OPEN_DECISIONS.md` Part 2b) | **DR-016b:** khi duyệt lại Spike C1 (H2), nếu REJECT thì ghi rõ lý do thuộc loại *tài liệu* (chỉ sửa tài liệu, cổng vẫn đóng) hay *công thức hoặc bằng chứng* (GATE-ML-01 mở lại, UNet dừng). **DR-019:** B15 và mọi bằng chứng thiết bị mới dùng placeholder thay cho số serial và địa chỉ overlay. **DR-021:** SCR-05 gọi dữ liệu qua `useCall` của shell. **DR-013:** bạn là người duyệt V1; hôm nay leader sẽ xin bạn duyệt các PR sửa V1 |
| **Kết quả offline (#66, đã merge `e5ccd38`)** | Chỉ **L0** (mặt mask chưa decimate, 61.424 tam giác) nằm trong ±1 lát. Mọi mức vertex-clustering đều trượt B5. Lý do: lệch silhouette dưới-voxel và cấu trúc dày 1 voxel bị sụp, **không phải lỗ**. QA đã dựng lại khớp từng tia |
| **DR-008c** (luật khai trước: mức FPS cao nhất trong các mức có B5 ≤ ±1) | Chỉ có thể là **L0**, và chỉ khi B10 ≥ 20 FPS median và B11 đạt trên A17. Kết quả S-1: L0 đạt cả B10/B11 (59,9 FPS, khựng tối đa 17 ms) và B6/B7/B9 trên máy. L1–L4 trượt B6. Theo luật khai trước: **DR-008c = L0**, và **Spike B ACCEPTED** lúc 21:22 (#73 squash → `40b1316`, sau QA final của CHAT E). B15 là ngoại lệ được ghi: **bạn viết B15 trước 10:00** |
| **GATE-MOB-01** | **đã đóng** 21:17 tối 01/10 (leader nhận L5, #82). Module 3D (WebGL2 trong WebView) có điều kiện là Spike B ACCEPTED; điều kiện đó đã thoả. Nếu khi duyệt lại bạn hoặc reviewer không đồng ý, ghi vào bảng revalidation (H7) để leader quyết |
| **#44 đã merge** | Leader đã sửa dòng B10/B11 trong gói TC-TEAM-001 của bạn cho khớp với RESULT.md. **Bạn xác nhận hoặc sửa lại** |

## 🔴 Việc 1 — duyệt lại và nhận phần làm thay *(sáng)*

| Mục | Kiểm |
|---|---|
| #66 → `e5ccd38` (frontier mesh thật) | đọc README phần cơ chế; chạy `python spikes/spike_b_3d/harness/test_real_mesh_frontier.py` |
| #73 → `40b1316` (gói S-1, đã squash) | đọc phần S-1 trong RESULT và `PROVENANCE.md`. QA ghi ba điểm cần bạn: nhãn "verbatim" của ghi chú operator sai (đó là bản tóm tắt); nhãn `surface`/`background` của 24 tap ở L0 bị đảo (verdict tính theo mask, không theo nhãn), cần xác nhận với leader; `build_release.ps1` có giá trị mặc định là đường dẫn tuyệt đối |
| #74 → `be86cb1` (`backend/mesh`) | Đã merge sau QA-074 MERGE (`management/day22/qa/QA_PR74_REVIEW.md`): pick ở L0 khớp DDA chính xác trên 34.672 tia, B9 giữ. Chạy `python -m pytest backend/mesh/tests -q -p no:cacheprovider` (131). **Trước khi có endpoint nào dùng `backend.mesh`:** N-2 (test vào CI), N-4 (import được trên Python 3.9 không có scipy: import lười hoặc ghim scipy 1.13), N-5 (đề xuất contract 1.2.0 cho artifact mesh, `face_source_slice`, hệ toạ độ của transform). Thêm N-3, N-6…N-8 |
| #44, #41 | xác nhận dòng TC-TEAM-001 đã sửa thay bạn; duyệt lại #41 (Spike A S6) với vai reviewer của Spike A |
| #79 → `3c02fd2` (Spike C1) | Bạn là **reviewer của Spike C1**. Spike được ACCEPTED dưới override, với QA bằng LLM đứng thay APPROVE của bạn. Đọc `RESULT_C1.md` và `management/day22/QA_REVIEW_C1_GATE_ML_01.md`, rồi ghi **APPROVE** hoặc **REJECT + lý do** vào bảng revalidation. Nếu REJECT thì GATE-ML-01 mở lại |

## 🔴 Việc 2 — Spike B: B15 và xác nhận DR-008c

- Đọc `PROVENANCE.md` và kết quả trích xuất từ phiên S-1 tối qua (operator Phạm Tuấn Anh, owner bạn).
- Viết **B15**: nhận xét chi phí phát triển, bằng lời của chính bạn. Leader không viết thay được.
- Quyết định:
  1. `picking_error.py` có dùng phép đi voxel chính xác không;
  2. cách đọc B9 nghiêm ngặt;
  3. mặt voxel hay Marching Cubes cho V2-01;
  4. có thử decimation bảo toàn topology trước khi chốt DR-008c không;
  5. B5 có tính tia chỉ cắt silhouette dưới 1 voxel không (QA N-9). Câu này không đổi DR-008c.
- Spike B đã ACCEPTED với DR-008c = L0 theo luật khai trước. Nếu bạn không đồng ý, ghi lý do vào H7 để leader quyết. Các câu 1–5 là việc tiếp, không chặn V2.

## Việc 3 — V2 SCR-05 *(chiều)*

Màn sản phẩm SCR-05 (3D Inspector) chưa bắt đầu.
- Khung: một vertical trong `mobile/src/verticals/v2/`, theo screen contract của shell (#77, đã trên `main`). Dùng `runtime.content` và mesh L0 từ `backend/mesh` (#74).
- Liên kết hai chiều 2D↔3D. Tối qua chỉ có bằng chứng chiều 3D→2D; chưa được tuyên bố hai chiều.

## Hàng đợi dự phòng

- `backend/mesh`: đưa test vào CI.
- Đóng các nit README của #66 (QA ghi chú 3–5).

---

**Ranh giới:**
- mesh từ mask thật là **dữ liệu dẫn xuất**: không commit OBJ, không commit hash từng file dữ liệu (F5);
- không đụng holdout;
- không force-push `main`;
- không xoá khi chưa hỏi leader. Các thư mục tạm chứa mesh thật đang chờ leader quyết.
