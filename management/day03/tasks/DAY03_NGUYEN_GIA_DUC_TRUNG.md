# DAY 3 — Nguyễn Gia Đức Trung · 2026-09-12

> ## Thứ chặn bạn KHÔNG phải cái điện thoại
>
> Cổng vào `GATE 2` viết là: *"backend stub tới được **VÀ** overlay đã lên"*.
>
> Hai ô này `NOT_CHECKED` từ Day 0, đã ba ngày, và **chỉ bạn đóng được**:
>
> ```text
> ☐  Mac mini bật được và truy cập được
> ☐  ZeroTier cài và chạy trên CẢ máy tính LẪN điện thoại
> ```
>
> Chừng nào hai ô đó chưa đóng thì Spike E không vào được cổng, **bất kể ai đang giữ máy**. Đây là
> việc đầu tiên của hôm nay và nó mất khoảng một tiếng.

---

## Đã dựng sẵn cho bạn đêm qua

`spikes/spike_e_transport/` — PR #16. Stub, client harness, retry harness, script tổng hợp. Tất cả
chạy thử end-to-end trên loopback: **98 request, 0 lỗi**.

`SPIKE_E_TRANSPORT/TASK.md:237` cho phép dựng những thứ đó hộ. Nhưng nó giữ **phép đo** lại cho bạn:

> *"**All network and device measurements are executed by Nguyễn Gia Đức Trung** over the real
> cellular + overlay path."*

Nên trong repo hiện **không có một con số transport nào**. Chúng là của bạn.

---

## PHẦN I — `NOW` · đóng hai ô phần cứng

### ① Mac mini

```bash
# tren Mac mini
uname -a && sw_vers
python3 --version
```

Báo lại: máy bật được không, bạn truy cập được không (tại chỗ hay từ xa), macOS phiên bản nào.

### ② ZeroTier trên **cả hai** máy

```bash
# Mac mini
zerotier-cli info
zerotier-cli listnetworks       # phai thay OK va mot dia chi 10.x hoac 172.x

# dien thoai: app ZeroTier -> join network -> ghi lai dia chi duoc cap
```

Rồi xác minh **điện thoại tới được Mac mini**:

```bash
# tu dien thoai, qua Termux hoac bat ky app HTTP nao
ping <zt-addr-cua-mac-mini>
```

> ⚠ **Chỗ dễ trượt nhất của bạn.** ZeroTier vừa kết nối thì phản xạ tự nhiên là chạy ngay một cái
> speed test. **Xác nhận tới được là DỪNG.** Con số nào ghi ở giai đoạn này đều mang nhãn `prep` và
> **bị loại trừ đích danh** khỏi tập nghiệm thu.

### ③ Báo Project Control để cập nhật sign-off

Hai ô đó nằm trong `DAY0_SIGNOFF.md` và **chỉ Project Control ghi**. Bạn báo, Project Control phản
chiếu vào.

---

## PHẦN II — Spike E, dựng đường thật

### ④ Sinh payload trên Mac mini

```bash
git pull
python spikes/spike_e_transport/payloads/generate.py --out payloads/out
```

> **Shape mặc định `576×576×88` giờ đã có căn cứ.** Đêm qua leader mở gói dataset thật và thấy slice
> là `576×576×88`, có case `640×640×88`. Trước đó nó chỉ là placeholder. Khi Khánh xong `A6`, dùng
> con số chính thức của cậu ấy.

### ⑤ Chạy stub, bind địa chỉ overlay

```bash
python spikes/spike_e_transport/stub/server.py \
    --payloads payloads/out --bind <zt-addr-cua-mac-mini>
```

Nó sẽ **in cảnh báo** khi bind khác loopback. Cảnh báo đó đúng — đọc nó. DR-003 và `12` §5 cấm
public endpoint, port forwarding, public domain. **Địa chỉ đó phải là địa chỉ overlay ZeroTier**,
không phải LAN, không phải public.

### ⑥ Đo từ điện thoại, trên **cellular thật**

```bash
python spikes/spike_e_transport/client/harness.py \
    --base http://<zt-addr>:8787 \
    --path cellular-overlay \
    --connection direct \
    --operator "Nguyễn Gia Đức Trung" \
    --repeats 5 \
    --note "4G Viettel, ngoài trời, 3 vạch, 14:30"
```

**Hai cờ bắt buộc, harness từ chối chạy nếu thiếu:**

| Cờ | Vì sao không có mặc định |
|---|---|
| `--path` | `E1` — LAN phải dán nhãn diagnostic. Một lần chạy LAN không nhãn trôi vào tập nghiệm thu thì **bằng chứng bị bác** |
| `--connection` | `E12` — direct hay relayed, ghi cho **MỌI** phép đo. Tìm bằng `zerotier-cli peers` |

**Tắt Wi-Fi trên điện thoại trước khi đo.** Venue Wi-Fi không được tin và không phải đường đo.

### ⑦ `E9` — reconnect

```bash
python spikes/spike_e_transport/client/retry.py \
    --base http://<zt-addr>:8787 --path cellular-overlay --connection direct \
    --operator "Nguyễn Gia Đức Trung" --duration 600
```

Rồi **tự tay cắt sóng** — tắt data, đi vào thang máy, ra khỏi vùng phủ. Harness **không giả lập được
outage và không nên giả lập**; nó đợi, phát hiện, và đóng dấu thời gian.

Không có outage nào thì nó báo **"no outage observed"**, không phải reconnect time = 0.

### ⑧ Tổng hợp

```bash
python spikes/spike_e_transport/analyze/aggregate.py \
    spikes/spike_e_transport/EVIDENCE_RAW/e_transport_*.jsonl --out summary.json
```

Nó **từ chối trộn** hai đường đo khác nhau, và **từ chối trộn** direct với relayed. Đó là cố ý — gộp
lại là xoá đúng thứ `E12` được ghi ra để nhìn.

---

## PHẦN III — nếu còn thời gian

### ⑨ Review PR #16 — dụng cụ dựng cho chính bạn

Bốn điểm tôi muốn bạn soi:

1. **Bốn strategy** lấy từ `TASK.md:82-85`, nhưng cách đóng gói `s4` (length-prefixed window) là tôi
   chọn. Bạn muốn framing khác thì đó là quyết định của bạn.
2. **Chính sách backoff** trong `retry.py` là **tham số**, không phải khuyến nghị. `E13` mới là chỗ
   bạn khuyến nghị.
3. **`E7` (bộ nhớ thiết bị) chưa có instrumentation** — nó phải đo từ phía app, không phải từ client
   harness. Tôi ghi ra thành khoảng trống thay vì lặng lẽ bỏ qua. Bạn tính sao?
4. Bạn chạy được không? README không đủ thì đó là lỗi README.

### ⑩ Review PR #14 hoặc #15 của đồng đội

Hàng đợi review đang **tắc hoàn toàn**: 5 PR mở, 0 review được submit.

---

## Acceptance hôm nay

```text
☐  hai ô NOT_CHECKED đã đóng, có bằng chứng thật (output lệnh, không phải lời nói)
☐  bản ghi reachability: điện thoại → cellular → overlay → Mac mini
☐  ít nhất MỘT lần chạy harness trên đường thật, đủ hai cờ, file trong EVIDENCE_RAW
☐  bảng direct-vs-relayed cho mọi phép đo đã chạy
```

**Hai dòng đầu là điều kiện tối thiểu.** Không có chúng thì `GATE 2` vẫn đóng và Spike E vẫn đứng yên.

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
