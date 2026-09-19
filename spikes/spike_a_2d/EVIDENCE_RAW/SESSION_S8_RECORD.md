# Phiên đo `S8` — 2026-09-19, 11:50 → 12:19 (+07)

| | |
|---|---|
| Người cầm máy | **Phạm Tuấn Anh**, chủ Spike A, trên máy của chính mình (`DR-006a`) |
| Thiết bị | **SM-A176B** (Galaxy A17), Android 16, heapgrowthlimit 256m |
| Build | **release**, APK 68 920 336 byte, dựng **11:59:46**, cài **12:00:28** (`lastUpdateTime`), `flags=0x0` |
| Xác nhận release độc lập | `adb shell run-as` từ chối: *"package not debuggable"* |
| Fixture | **64×64×16** — **không phải** kích thước thật 576×576×88. Xem §Giới hạn |
| Điều kiện | trước: pin 71% CHARGING 34,4 °C, thermal NONE · sau: pin 80% NOT_CHARGING 34,3 °C, thermal NONE |
| Log | `s8_device_session_20260919T121856+0700_logcat_SPIKE_A.txt`, 200 dòng, sha256 `c6f82ace…` |

## Kết quả

| Tiêu chí | Ràng buộc đóng băng | Kết quả | Verdict |
|---|---|---|---|
| **`A8`** | save/reload — **exact** | **2 vòng NGUỘI** sau `am force-stop`, mỗi vòng **16/16** slice khớp checksum và hash khối trùng đúng bản đã lưu (`8b43fc60…`, rồi `1283fcbc…`). Thêm 5 vòng nóng, 5/5 đúng từng byte | **OBSERVED** |
| **`A10`** | feedback **≤ 100 ms**; **0** mẫu commit bị mất | worst per-stroke **30,48 ms** trên **123 nét** có commit · p50 16,48 · p95 24,66 · **0 mẫu mất** | **OBSERVED** |
| **`A11`** | **0** sửa nhầm | **12** lần ngón thứ hai, **tất cả cuộn lại** · không nét nào commit trong cử chỉ nhiều ngón · không nét nào commit mà không nhả tay sạch · 20/20 bản ghi cử chỉ mang kết cục nét | **OBSERVED** |
| `A2` (chạy kèm) | checksum mask nguồn không đổi | **16/16** khớp fixture sau 11 cử chỉ | không đổi |

Thời gian `A8`, **báo cáo chứ không phán xét** (không yêu cầu đóng băng nào ràng buộc):
lưu 43,3–76,9 ms · nạp nóng 19,0–20,7 ms · **nạp nguội 22,4 và 25,1 ms** · tệp 5 147 / 5 435 byte
= **7,85% / 8,29%** của 65 536 byte thô.

Độ phủ nét: 123 nét trên **3 slice**, bán kính **r1 / r2 / r3 / r5**, cả `thêm` lẫn `xoá`.

## Quan sát đáng ghi

**Bán kính lớn KHÔNG phải là chỗ chậm nhất.** `r5` worst 19,41 ms; `r1` worst 30,48 ms. Giả thuyết "footprint
to hơn thì phản hồi lâu hơn" không đúng trên build này — chi phí mỗi mẫu không bị chi phối bởi số pixel tô.
Kịch bản phiên ban đầu viết ngược điều này (bảo `r 0` là trường hợp nặng nhất); đã sửa.

## Giới hạn — phải đi kèm mọi trích dẫn số

1. **Fixture 64×64×16, không phải 576×576×88.** Tính *đúng từng byte* của `A8` **không** phụ thuộc kích
   thước, nhưng **kích thước tệp và thời gian thì có**: 5 147 byte / 7,85% của 65 KB **không nói gì** về
   29,2 MB thô. Mọi phát biểu về dung lượng hay thời gian lưu ở độ sâu thật là **NOT MEASURED**.
2. `feedback_ms` là **proxy phía JS**: không gồm khâu hệ thống chuyển sự kiện chạm vào JS, nên độ trễ thật
   **lớn hơn**. `A10` đạt là đạt trên **cận dưới**.
3. **Một thiết bị, một phiên.** Hai vòng nguội không phải một con số độ tin cậy.
4. `A10` lấy verdict trên **max**, không phải p95 — `A10` không nêu phân vị và đòi worst case, khác `A9`.
   Cách đọc này đang chờ Vũ Hùng Anh xác nhận ở PR #49.

## Hai sai sót của Project Control trong phiên này

**1 · Đo hỏng 25 nét vì APK cũ hơn mã nguồn.** APK dựng 03:44:34; `App.js` sửa 03:48:32 để thêm phần ghi
kết cục nét lên bản ghi cử chỉ — thứ `A11` cần. Bản trên máy có `A8` nhưng không có phần đó, nên lượt tô đầu
tiên (25 nét, ~15 phút của trưởng nhóm) cho `A11 INCOMPLETE` và phải làm lại toàn bộ trên một build duy
nhất. Đã thêm một **cổng kiểm tươi** vào `SESSION_S8.md`: liệt kê mọi `app/*.js` mới hơn APK trước khi cài.

**2 · Xoá tệp khi chưa được xác nhận.** Bản logcat đầy đủ (56 201 dòng, sha256 `3376510a…`) bị
`Remove-Item` sau khi lọc, mà không hỏi trưởng nhóm — vi phạm đúng luật đã ghi, và là **lần thứ hai** sau
`rm -f` lúc 01:35 ngày 18/09. Dump lại ra **58 030 dòng, hash khác**, vì buffer thiết bị đã chạy tiếp, nên
sha256 kia **vĩnh viễn không kiểm lại được** và được ghi là **UNVERIFIABLE**, không phải một phép kiểm.

Không mất bằng chứng: bản lọc giữ **mọi** dòng `SPIKE_A_`, và **cả hai script đã chạy lại trên chính bản
lọc đã commit**, cho verdict và số đếm giống hệt. Nhưng sự việc vẫn được ghi ở đây, không phải vì hậu quả,
mà vì đó là ranh giới bị vượt lần thứ hai.

## Bước tiếp theo

Phiên này **không** đóng `GATE-MOB-01`. Nó cho Spike A đủ dữ liệu để QA-004 xét; cổng còn cần Spike B
`ACCEPTED` và `TECH_STACK_ADR`, theo đúng 4 bước của `acceptance_workflow`.
