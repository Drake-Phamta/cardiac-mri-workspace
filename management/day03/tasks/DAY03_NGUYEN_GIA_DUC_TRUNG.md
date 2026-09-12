# DAY 3 — Nguyễn Gia Đức Trung · 2026-09-12

> ## Cập nhật đêm 2026-09-12 — hai phần ba đường đã thông
>
> Leader kết nối ZeroTier cho Mac mini đêm qua. Project Control **kiểm chứng** thay vì tin lời:
>
> ```text
> ✅  10.134.129.115   TTL 64   ping 20/20, mất 0 gói, p50 38 ms   ← lần 1, 00:20
> ✅  cùng host        100 ping, mất 0%, p50 29 ms, p95 37, max 235  ← lần 2, 16:20
>     cổng mở: 22 SSH · 3283 Apple Remote Desktop · 5900 Screen Sharing · 5000 AirPlay
>     → ba cổng 3283 + 5900 + 5000 cùng mở là chữ ký macOS. Mac mini ĐANG SỐNG.
>
> ✅  ZeroTier trên máy tính — network 3b19b3a71652c5f0, đang chạy
> ☐  ZeroTier trên ĐIỆN THOẠI — chưa kiểm, không quan sát được từ máy tính
> ☐  stub chạy trên Mac mini — cổng 8787 ĐÓNG
> ```
>
> **`GATE 2` vẫn chưa mở**, vì cổng vào là *"stub **tới được**"*, không phải *"overlay đã lên"*.
> Nhưng việc còn lại giờ **ngắn hơn nhiều** so với hôm qua: chạy stub, và cài ZeroTier lên điện thoại.
>
> Chi tiết + lệnh tái lập: [`../overlay_reachability_20260912.md`](../overlay_reachability_20260912.md)

---

## Đã dựng sẵn cho bạn đêm qua

`spikes/spike_e_transport/` — PR #16. Stub, client harness, retry harness, script tổng hợp. Tất cả
chạy thử end-to-end trên loopback: **98 request, 0 lỗi**.

`SPIKE_E_TRANSPORT/TASK.md:237` cho phép dựng những thứ đó hộ. Nhưng nó giữ **phép đo** lại cho bạn:

> *"**All network and device measurements are executed by Nguyễn Gia Đức Trung** over the real
> cellular + overlay path."*

Nên trong repo hiện **không có một con số transport nào**. Chúng là của bạn.

---

> ### ⚠ Dụng cụ đang nằm trên nhánh PR, chưa lên `main`
>
> ```bash
> git fetch origin && git switch spike-e/stub-and-harness
> ```
>
> Review PR #16 rồi merge thì nó lên `main`. Cần chạy ngay thì cứ làm trên nhánh đó.
> **Bằng chứng đo của bạn đi trên nhánh riêng**, không trộn vào nhánh dụng cụ.

---

## PHẦN I — `NOW` · ba việc mở `GATE 2`, không việc nào cần điện thoại

> **Cập nhật 12/09 chiều — hai ô phần cứng của bạn ĐÃ ĐÓNG, không phải làm nữa.**
> Leader kết nối ZeroTier cho Mac mini và Project Control **kiểm chứng từ máy anh ấy**:
> `10.134.129.115` · **ping 100/100, mất 0%** · chữ ký cổng macOS (22 · 3283 · 5900 · 5000).
> **Bạn không cần set up ZeroTier gì thêm** — nó đang chạy.
>
> Và **không cần cài ZeroTier lên điện thoại nữa**: `DR-006a` revision 1 dùng **USB làm kênh điều
> khiển**, xem PHẦN II.
>
> Thứ duy nhất còn chặn `GATE 2` là **stub chưa chạy** — cổng `8787` đóng khi kiểm lúc 16:20.

### ① `zerotier-cli peers` — một giây, và nó trả lời `E12`

```bash
sudo zerotier-cli peers        # tren Mac mini
```

Tìm dòng của máy leader và xem cột cuối: **`DIRECT`** hay **`RELAY`**.

**Vì sao hỏi trước khi đo:** Project Control vừa đo chặng `máy leader → overlay → Mac mini`,
100 ping, **mất 0%**, **p50 29 ms · p95 37 ms · max 235 ms**, jitter 6,2 ms. Với một hop mà Mac mini
ở xa như DR-003 yêu cầu thì 29 ms hợp lý cho **relayed**; nếu hai máy ở gần nhau thì 29 ms
**quá cao cho direct** và có gì đó đáng xem. `E12` đòi direct-vs-relayed cho **mọi** phép đo.

### ② Sinh payload trên Mac mini

```bash
git fetch origin && git switch spike-e/stub-and-harness
python spikes/spike_e_transport/payloads/generate.py --out payloads/out
```

Shape mặc định `576×576×88` **giờ có căn cứ** — đó là kích thước slice thật trong gói dataset leader
mở đêm qua, trước đó chỉ là placeholder. Khi Khánh xong `A6`, dùng con số chính thức của cậu ấy.

### ③ Chạy stub — **đây là thứ mở `GATE 2`**

```bash
python spikes/spike_e_transport/stub/server.py \
    --payloads payloads/out \
    --bind <dia-chi-ZeroTier-cua-Mac-mini> \
    --port 8787
```

Nó **in cảnh báo** khi bind khác loopback. Cảnh báo đó đúng — đọc nó. Địa chỉ phải là **địa chỉ
overlay**, không phải LAN, không phải public. DR-003 và `12` §5 cấm public endpoint và port
forwarding.

**Nhắn leader một câu là xong:** anh ấy kiểm từ máy mình trong 5 giây, và **`GATE 2` chính thức mở**.

---

## PHẦN II — Đo trên đường thật: bạn tự bấm, TỪ XA

> **Bạn KHÔNG cần cầm điện thoại của leader, và không cần ZeroTier trên điện thoại.**
> `DR-006a` revision 1:

```text
may CUA BAN  --ZeroTier-->  PC cua leader  --USB-->  Galaxy A17
                                                          |
                            traffic DO di ----------------+--> cellular THAT
```

Leader mở adb server trên địa chỉ ZeroTier của anh ấy; **bạn điều khiển từ máy bạn**:

```bash
export ANDROID_ADB_SERVER_ADDRESS=10.134.129.145
adb devices        # phai thay R5CY931SQ...  device
```

**Kênh điều khiển đi USB là có chủ ý** — nếu nó đi qua overlay thì nó nhiễm đúng đường `E1` đang đo.
Đi USB thì Wi-Fi điện thoại **tắt** và traffic đo đi cellular thật.

**Hệ quả:** luật *"executed by Nguyễn Gia Đức Trung"* **giữ nguyên**, `E10` `E11` `E13` vẫn của bạn,
và leader **không** phải rút khỏi vai reviewer. Không có gì bị nới lỏng.

**Hẹn buổi với leader** — cần máy anh ấy bật trong lúc bạn đo.

### ④ Đo trên cellular thật

```bash
python spikes/spike_e_transport/client/harness.py \
    --base http://<zt-addr-mac-mini>:8787 \
    --path cellular-overlay \
    --connection direct \
    --operator "Nguyễn Gia Đức Trung" \
    --repeats 5 \
    --note "4G Viettel, ngoai troi, 3 vach, 14:30"
```

**Hai cờ bắt buộc — harness từ chối chạy nếu thiếu:**

| Cờ | Vì sao không có mặc định |
|---|---|
| `--path` | `E1` — LAN phải dán nhãn diagnostic. Một lần chạy LAN không nhãn trôi vào tập nghiệm thu thì **bằng chứng bị bác** |
| `--connection` | `E12` — direct hay relayed, cho **MỌI** phép đo. Lấy từ bước ① |

**Tắt Wi-Fi trên điện thoại trước khi đo.**

### ⑤ `E9` — reconnect

```bash
python spikes/spike_e_transport/client/retry.py \
    --base http://<zt-addr-mac-mini>:8787 --path cellular-overlay --connection direct \
    --operator "Nguyễn Gia Đức Trung" --duration 600
```

Rồi **tự tay cắt sóng** — tắt data, vào thang máy, ra khỏi vùng phủ. Harness **không giả lập outage
và không nên giả lập**; nó đợi, phát hiện, đóng dấu thời gian.

> **Đã sửa sau review:** bản đầu báo reconnect time **sai 32%** vì tần suất dò bị chính backoff
> quyết định — outage 8,00 s được báo là 10,537 s, in tới ba chữ số thập phân. Giờ nó dò riêng ở
> `--outage-probe-interval` và báo một **khoảng** kèm độ phân giải. Availability cũng chuyển sang
> **tính theo thời gian** thay vì đếm mẫu (bản cũ báo 0,76 khi sự thật là 0,56).

### ⑥ Tổng hợp

```bash
python spikes/spike_e_transport/analyze/aggregate.py \
    spikes/spike_e_transport/EVIDENCE_RAW/e_transport_*.jsonl --out summary.json
```

Nó **từ chối trộn** hai đường đo khác nhau và **từ chối trộn** direct với relayed — gộp lại là xoá
đúng thứ `E12` sinh ra để nhìn. Nó cũng **thoát non-zero** nếu quá nhiều request hỏng, thay vì in
một p95 đẹp đẽ tính trên số ít sống sót.

---

## PHẦN III — Review

### ⑦ Review PR #16 — dụng cụ dựng cho chính bạn

Nó **vừa bị soi ra 10 lỗi, 2 CRITICAL**, trong đó script tổng hợp *nói đúng lời nói dối mà docstring
của nó gọi tên*. Đã sửa, nhưng đáng để bạn tự soi. Bốn điểm tôi muốn bạn phán:

1. **Bốn strategy** lấy từ `TASK.md:82-85`, nhưng cách đóng gói `s4` (length-prefixed window) là tôi
   chọn. Muốn framing khác thì đó là quyết định của bạn.
2. **Chính sách backoff** trong `retry.py` là **tham số**, không phải khuyến nghị. `E13` mới là chỗ
   bạn khuyến nghị.
3. **`E7` (bộ nhớ thiết bị) chưa có instrumentation** — phải đo từ phía app, không phải từ client
   harness. Tôi ghi thành khoảng trống thay vì lặng lẽ bỏ qua. Bạn tính sao?
4. **Bạn chạy được không?** README không đủ thì đó là lỗi README.

### ⑧ Review PR #14 hoặc #15 của đồng đội

Hàng đợi đang **tắc hoàn toàn**: **6 PR mở, 0 review được submit**.

---

## Số liệu Project Control đã đo sẵn cho bạn

Chặng `máy leader → overlay → Mac mini`, đo 12/09 16:20:

| | n | p50 | p95 | max | |
|---|---:|---:|---:|---:|---|
| ICMP | 100 | **29,0 ms** | 37,0 | **235,0** | mất **0%** · jitter 6,2 ms · stdev 20,7 ms |
| TCP connect | 40 | 42,6 ms | 51,8 | — | 0 lỗi |
| HTTP TTFB | 30 | 71,4 ms | — | — | payload 7 459 byte |
| Path MTU | — | — | — | — | **1500 byte** |

> ⚠ **DIAGNOSTIC — KHÔNG phải bằng chứng `E1`.** Đường này là *máy tính → Wi-Fi → overlay*, thiếu
> **điện thoại** và thiếu **cellular**. `TASK.md:197` bác thẳng bằng chứng đo sai đường. Nó **không
> thay thế** lần đo của bạn.
>
> **Nhưng nó tách sẵn chi phí mạng khỏi chi phí backend** — đúng thứ `TASK.md:183` muốn. Và cái
> đáng chú ý không phải p50 mà là **cái đuôi**: max 235 ms với 0% mất gói, stdev 20,7 ms. Đường này
> **ổn định về kết nối nhưng tản mạnh về thời gian**, nên `E10` đừng dựng budget trên median.

---

## Acceptance hôm nay

```text
☑  Mac mini bat va toi duoc            — DA DONG 12/09, leader xac minh tu may anh ay
☑  ZeroTier tren may tinh              — DA DONG 12/09
☐  zerotier-cli peers -> direct hay relayed          <- E12, mot giay
☐  STUB DANG CHAY, cong 8787 mo tren dia chi overlay <- DAY LA THU MO GATE 2
☐  it nhat MOT lan chay harness tren duong that, du hai co, file trong EVIDENCE_RAW
☐  bang direct-vs-relayed cho moi phep do da chay
```

**Dòng thứ tư là điều kiện tối thiểu của hôm nay.** Ba việc ở PHẦN I mất khoảng 15 phút và
**không việc nào cần điện thoại**. Chưa có nó thì `GATE 2` vẫn đóng và Spike E vẫn đứng yên.

## Spike E KHÔNG được

| Việc | Vì sao |
|---|---|
| **Đo trên LAN rồi trình làm acceptance** | `TASK.md:197` — **bằng chứng bị bác thẳng** |
| **Dùng venue Wi-Fi làm đường đo** | DR-003 — không tin cậy, không cần thiết |
| **Thay Mac mini bằng host khác** | Topology là **ràng buộc** và gọi đích danh máy |
| **Báo một con số median thay vì phân bố** | `E8` đòi **spread**, không chỉ median |
| **Chạy harness thiếu `--path` hoặc `--connection`** | Nó sẽ từ chối chạy. Đó là tính năng |
| Phơi Mac mini ra public | DR-003 / `12` §5 — vi phạm quản trị |
| Mang số prep vào acceptance | `GATE 0` capture bị loại trừ đích danh |
| Tạo `RESULT.md` khi chưa có bằng chứng thật | — |

---

**Liên quan:** [`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../../spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md) ·
`spikes/spike_e_transport/README.md` · [`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
