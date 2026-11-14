# Nguyên mẫu đo khả năng train (ML probe)

**Người làm:** Phạm Tuấn Anh, Bế Quốc Khánh. Đây là mã thử nghiệm: `ml/` không import từ đây; phần dùng lại
(`UNet2D`, `DinoSeg`, cách resize, tham số chuẩn hoá) được chép sang `ml/models.py` và `ml/data.py` kèm ghi chú nguồn gốc.

## Câu hỏi

Máy của nhóm có đủ bộ nhớ và tốc độ để train cả UNet và DINOv2 kịp lịch không? Chọn cỡ ảnh, batch và decoder nào?

## Kết luận

Hai lần đo. **C0** (dữ liệu tổng hợp, RTX 4050 6 GiB) là đo sơ bộ. **C1** (20 case train thật, RTX 3050 Ti 4 GiB,
không nạp validation hay holdout) được chấp nhận ngày 2026-10-01 và đặt ra cấu hình train cố định trong `ml/`.

- Ảnh 560×560, batch 8 vừa GPU 4 GiB cho cả hai họ: bộ nhớ đỉnh UNet 3387,3 MiB, DINOv2 3159,4 MiB.
  Một bước train: UNet 1010,67 ms, DINOv2 485,95 ms.
- Decoder linear (stride 14) bỏ sót khoảng 1/5 cấu trúc mảnh (tỉ lệ 0,19786), decoder progressive (stride 1,75)
  và UNet (stride 1) bằng 0, nên chọn **decoder progressive**.
- 50 epoch kịp lịch (hàng đợi DINOv2 ước 12,35 giờ).
- C0: bf16 giảm bộ nhớ và tăng tốc ở mọi cấu hình fine-tune toàn bộ.

Chi tiết và nguồn: `docs/RESULTS.md`, mục 2.3.

## Chạy

```powershell
pip install -r prototypes/ml-probe/requirements.txt
python prototypes/ml-probe/harness/probe.py --selftest        # kiểm logic tìm batch, không cần GPU
python prototypes/ml-probe/c1/test_preflight.py               # tự kiểm của bước preflight C1
```

`dr011_normalization.json` là tham số chuẩn hoá ảnh theo từng khối (cắt p0,5/p99,5 rồi đưa về [0, 1]);
`ml/tests/test_data.py` kiểm `ml/data.py` dùng đúng các tham số này.

## Thư mục

- `harness/` probe đo bộ nhớ/tốc độ (`probe.py`), ngoại suy lịch (`extrapolate.py`), chạy thử pipeline tổng hợp.
- `c1/` các bước C1 trên dữ liệu thật: preflight, kiểm tập con, chạy thử, báo cáo. `synthetic/` sinh dữ liệu giả cho C0.

Kết quả thô của C0 đã được bỏ khỏi cây; chúng vẫn còn trong lịch sử git.
