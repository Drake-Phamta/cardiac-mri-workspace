# Nguyên mẫu đo tải dữ liệu qua mạng

**Người làm chính:** Nguyễn Gia Đức Trung. Đây là mã thử nghiệm, không phải mã sản phẩm.

## Câu hỏi

Mở một case và tải lát MRI chưa có trong cache từ máy chủ về điện thoại mất bao lâu? Nên tải **từng lát** khi
cần, **tải trước theo cửa sổ** quanh lát đang xem, hay **tải cả khối** một lần?

## Kết luận

Chưa được chấp nhận đầy đủ: bộ nhớ app, mất/nối lại kết nối và đo theo nhiều khung giờ chưa xong. Nhưng số đo đủ
để chọn hướng cho app: **tải từng lát PNG khi cần**; không tải cả khối, không tải trước theo cửa sổ.

- Tải cả khối: p50 338 905 ms (576×576×88) và 121 447 ms (640×640×88), quá chậm.
- Tải trước theo cửa sổ chậm hơn tải từng lát: p95 28 606 ms so với 2 864 ms (576), 6 181 ms so với 1 844 ms (640).
- Mở case, lát đầu: p50 / p95 1 126 / 3 103 ms (576×576×88, tối 2026-09-16); 338 / 557 ms (chiều 2026-09-18).

Đo bằng dữ liệu giả đúng kích thước, không dùng byte dữ liệu thật. Chi tiết và nguồn: `docs/RESULTS.md`, mục 2.5.

## Chạy (trên một máy, qua loopback)

```powershell
python prototypes/transport/payloads/generate.py --out prototypes/transport/payloads/out   # dữ liệu giả, không commit
python prototypes/transport/stub/server.py --payloads prototypes/transport/payloads/out    # mặc định chỉ nghe 127.0.0.1
python prototypes/transport/client/harness.py --help                                      # các cờ bắt buộc của client đo
python prototypes/transport/analyze/aggregate.py <file .jsonl của các lần đo> --out summary.json
```

## Thư mục

- `payloads/` sinh dữ liệu giả 2 cỡ khối. `stub/` máy chủ thử phục vụ lát, cả khối, cửa sổ và lưới.
- `client/` client đo trên máy tính (`harness.py`, `retry.py`) và bản shell chạy trên Android (`android_toybox_harness.sh`).
- `analyze/` gộp các lần đo thành phân phối, không trộn các đường mạng khác nhau.

Log thô của các lần đo đã được bỏ khỏi cây; chúng vẫn còn trong lịch sử git.
