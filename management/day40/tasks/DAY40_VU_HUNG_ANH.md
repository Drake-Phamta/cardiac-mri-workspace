# DAY 40 — Vũ Hùng Anh · 2026-10-19 (Chủ nhật)

**Vai:** chủ khối V2 / 3D, reviewer của Spike A, Spike C1 và người duyệt V1. Hôm qua agent của leader dựng **khung**
màn SCR-05 dưới override. Từ sáng nay khối 3D trở lại với bạn: bạn hoàn thiện, đo và bảo vệ nó (PR-MOBILE-03,
TC-TEAM-001).

## 📌 Quyết định chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **DR-008c = L0** (Spike B ACCEPTED 01/10) | SCR-05 dùng mặt voxel chưa decimate (L0). Khung hôm qua theo đúng luật này |
| **DR-016b** | khi ghi phán quyết Spike C1, nói rõ REJECT (nếu có) thuộc loại *tài liệu* hay *công thức hoặc bằng chứng* |
| **DR-019** | B15 và bằng chứng thiết bị mới dùng placeholder thay cho serial và địa chỉ overlay |
| **DR-021** | SCR-05 gọi dữ liệu qua `useCall` của shell |

## 🔴 Việc 1 — ba việc chỉ bạn làm được *(sáng)*

1. **B15** (Spike B): nhận xét chi phí phát triển bằng lời của chính bạn. Quá hạn từ 02/10. Leader không viết thay được.
2. **Phán quyết Spike C1** (hàng H2 cũ, `management/day22/POST_RECOVERY_REVALIDATION_DAY23.md`): APPROVE hoặc REJECT + lý do.
3. Duyệt lại hàng H1–H2 trong [`../../day39/POST_RECOVERY_REVALIDATION_DAY40.md`](../../day39/POST_RECOVERY_REVALIDATION_DAY40.md).

## 🔴 Việc 2 — nhận khung V2 SCR-05

Xem PR khung V2 (tiêu đề bắt đầu bằng `feat(v2)`):
- **Backend:** mesh L0 dựng từ mask (dự đoán RAW/PROCESSED và ground truth), lưu ngoài git theo sha256 của mask nguồn;
  `reconstruction_get` trả tham chiếu mesh, `mesh_to_world_transform` là ma trận đơn vị trong hệ chỉ số voxel.
- **App:** SCR-05 dựng WebGL2 trong WebView (lấy từ Spike B, có header nguồn gốc); xoay, zoom, pan; chạm một mặt →
  lát nguồn → "Open in 2D" mở SCR-03 đúng lát (H7).
- **Việc của bạn:** đọc và chạy test, sửa những gì bạn không đồng ý, rồi đo trên A17: TC-3D-001…005, TC-PERF-002 (FPS
  khi xoay, dùng probe FPS của Spike B), và ghi bằng chứng.
- Liên kết 2D → 3D (mặt phẳng 3D theo lát 2D) chưa có trong khung; đó là phần hoàn thiện của bạn.

## Hàng đợi dự phòng

- Duyệt #87, #88 với vai người duyệt V1 (đã merge dưới override, cần bạn xác nhận).
- QA-074 N-3, N-5…N-8 còn lại trong `backend/mesh`.
- TC-TEAM-001 của bạn, ghi phần agent làm thay ngày 01/10 và 18/10.
