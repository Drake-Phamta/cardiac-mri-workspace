# DAY 40 — Phạm Tuấn Anh · 2026-10-19 (Chủ nhật)

**Vai:** leader, chủ V1, người tích hợp. Quy trình thường quay lại đầy đủ. Override 18/10 đã hết hạn.

## 📌 Việc của riêng anh trong ngày

| Việc | Khi nào |
|---|---|
| **Nhắn từng người** (tin nhắn mẫu ở cuối). Ba bạn vắng từ 02/10; hôm nay là ngày nhận lại | 08:00 |
| **Xác nhận DR-022** (backend phục vụ 53 case holdout sau GATE-IMG-01) trong bảng revalidation, hàng P1 | sáng |
| Duyệt PR revalidation của từng người khi họ mở; khung duyệt **12:00** và **20:00** | trong ngày |
| **Phiên A17 bằng một lệnh** (#103): cắm máy, mở khoá, chạy `powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1` (hướng dẫn `mobile/DEVICE_SESSION.md`; đặt `EXPO_PUBLIC_API_BASE_URL` để kiểm backend). APK đã build 18/10: `mobile/release/cardiac-mri-workspace-live-20261018-092731.apk` (`fe74e06`, sha256 `7f9f0c88…858cdd`) | khi tiện |
| **Mac mini đã deploy 18/10 09:00** (`a3bc595`): 74 case, 4 thí nghiệm, 289 mesh; E2E `--no-writes` từ PC tới Mac mini: 20 PASS / 0 FAIL / 3 SKIP (H8/H9 không ghi lên máy demo; UNet). Hôm nay chỉ cần kiểm `/health` từ điện thoại qua overlay | sáng |
| Khi Khánh báo UNet xong: ký **bản ghi cho phép holdout thứ hai** (EXP-U-025/050/100) | khi có |

## Slide nháp

`management/presentation/final/CARDIAC_MRI_DECK_DRAFT.pptx` (24 slide, 4 môn) và `DECK_OUTLINE.md`, dựng lại bằng `python tools/report/build_all.py …` (#102). Khi có UNet: chạy lại, các khung "CHỜ KẾT QUẢ UNET" tự biến mất.

## Hàng đợi V1

- QA_PR88_D39 NB: dây `back()` của SCR-05 chưa có test; thêm `timeout-minutes: 15` cho job CI render.
- TC-TEAM-001 của anh: ghi phần agent làm thay; Vũ Hùng Anh duyệt.
- Chọn **DEMO_CASE_001** theo luật `13` §11 (đại diện, không chọn vì model trông tốt). CASE_0029 là outlier tệ nhất,
  không hợp làm case demo chính; E2E chạy tốt với `--case CASE_0042`.

## Tin nhắn mẫu cho nhóm (dán vào nhóm chat)

> **Kế hoạch mới tới nghiệm thu 31/10.** Bảng: https://drake-phamta.github.io/cardiac-mri-workspace/
>
> Hôm qua (18/10) mình dùng override một ngày để kéo dự án về đúng hướng:
> - GATE-IMG-01 đã đóng;
> - có **kết quả holdout thật** cho DINOv2 (25/50/100 % và hậu xử lý);
> - backend phục vụ 74 case;
> - E2E hero flow qua API: 20 PASS / 0 FAIL;
> - có khung màn 3D.
>
> **Hôm nay mỗi người:**
> 1. Duyệt lại phần làm thay trong khối mình, trong `management/day39/POST_RECOVERY_REVALIDATION_DAY40.md`, trước 12:00.
> 2. Làm việc 2 trong gói của mình (`management/day40/tasks/`):
>    - **Khánh:** chạy UNet trên 4050, báo tripwire.
>    - **Hùng Anh:** B15 và phán quyết C1, rồi nhận màn 3D.
>    - **Trung:** #72 V4 và deploy Mac mini.
>
> 13 ngày nữa là nghiệm thu, đường găng là UNet. Ai vướng gì nhắn mình ngay.
