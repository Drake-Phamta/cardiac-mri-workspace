# Nguyên mẫu viewer 3D (WebGL2)

**Người làm chính:** Vũ Hùng Anh (V2). Đây là mã thử nghiệm, không phải mã sản phẩm: app không import từ đây,
phần dùng lại được chép sang `mobile/src/screens/v2-3d/viewerHtml.mjs` và `backend/mesh/` kèm ghi chú nguồn gốc.

## Câu hỏi

Viewer 3D (WebGL2 chạy trong WebView của app React Native) có xoay/zoom lưới nhĩ trái mượt trên điện thoại
không, chạm vào lưới có nhảy đúng lát MRI nguồn không, và nên giảm số tam giác tới mức nào?

## Kết luận

Chấp nhận ngày 2026-10-01. Chọn mức **L0**: bề mặt mặt voxel, **không giảm tam giác**. `backend/mesh/` dựng
đúng mức này cho app.

- L0 có 61 424 tam giác; trên Galaxy A17 FPS trung vị 59,88, khung dài nhất 17 ms
  (ngưỡng: FPS trung vị ≥ 20, không khung nào quá 500 ms).
- Chạm → lát ở L0: sai tối đa 1 lát, 0 lần chạm trượt; trên máy 327 tia trúng mask, 264 đúng lát, 63 lệch 1 lát.
- Các mức giảm tam giác L1–L4 cũng đạt 59,88 FPS nhưng chạm sai tới 5–16 lát, nên bị loại.

Chi tiết và nguồn: `docs/RESULTS.md`, mục 2.2.

## Chạy

```powershell
python prototypes/3d-viewer/harness/conformance.py           # checker hình học chuẩn (CI và backend/mesh/tests dùng)
python prototypes/3d-viewer/mesh/build_mesh.py               # sinh lưới tổng hợp 5 mức vào mesh/out (.obj không commit)
node prototypes/3d-viewer/app/test_obj.mjs                   # cần chạy build_mesh.py trước
node prototypes/3d-viewer/app/test_picking.mjs               # cần chạy build_mesh.py trước
node prototypes/3d-viewer/app/test_performance.mjs
node prototypes/3d-viewer/s1/test_s1_core.mjs
python prototypes/3d-viewer/harness/test_real_mesh_frontier.py
```

Chỉ cần `numpy` (và Node cho các test `.mjs`).

## Thư mục

- `app/` viewer WebGL2, đọc OBJ, chạm → lát (Möller–Trumbore), đo khung hình.
- `mesh/` dựng bề mặt mặt voxel và các mức giảm tam giác. `harness/` checker hình học, sai số chạm, bảng các mức trên mask thật.
- `s1/`, `s1_app/` bản đo trên điện thoại trong WebView. `fixtures_proposal/` bản nháp fixture hình học (bản chính ở `tests/fixtures/geometry/`).
- `clinical_poc/` thử nghiệm xem MRI 3 mặt phẳng (MPR) liên kết với mô hình 3D, kèm bản xem dạng workstation (VTK).
- `volume_surface_poc/` so sánh dựng khối MRI (volume rendering) với bề mặt Marching Cubes, chạm bề mặt thì 3 mặt phẳng MPR nhảy theo.
  Hai thư mục này có README riêng.

Log thô của các phiên đo trên điện thoại đã được bỏ khỏi cây vì chứa serial thiết bị; chúng vẫn còn trong lịch sử git.
