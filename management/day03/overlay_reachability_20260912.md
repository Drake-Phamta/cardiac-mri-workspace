# Overlay reachability — quan sát ngày 2026-09-12, ~00:20 +07:00

| | |
|---|---|
| **Quan sát bởi** | Project Control, trên máy của Phạm Tuấn Anh, theo chỉ đạo của anh |
| **KHÔNG phải** | phép đo nghiệm thu Spike E · và **không phải** xác nhận của Nguyễn Gia Đức Trung |
| **Lý do ghi** | Leader báo *"Mac mini tôi đã kết nối ZeroTier rồi"*. Đây là kết quả **kiểm chứng** lời đó, không phải chép lại nó |

---

## 1 · Kết quả

### ✅ Đã xác minh — có bằng chứng quan sát được

| Mục | Giá trị đọc được |
|---|---|
| ZeroTier trên máy leader | service `ZeroTierOneService` = **Running** |
| Địa chỉ overlay của máy leader | **`10.134.129.145/24`** |
| Network ID | **`3b19b3a71652c5f0`** |
| **Host macOS trên overlay** | **`10.134.129.115`** — **sống, phản hồi** |
| Latency ICMP tới host đó | **n = 20/20, mất 0 gói** · min **28** · p50 **38** · p95 **57** · max **57** ms |

### Vì sao kết luận đó là một máy Mac — không phải phỏng đoán

```text
TTL = 64                    →  Unix-like (Windows trả 128)
cổng 22    MO               →  SSH / Remote Login
cổng 3283  MO               →  Apple Remote Desktop (net-assistant) — CHỈ macOS
cổng 5900  MO               →  Screen Sharing / VNC
cổng 5000  MO               →  AirPlay Receiver / ControlCenter
cổng 80 · 443 · 548 · 8787  đóng
```

Ba cổng `3283`, `5900`, `5000` cùng mở là chữ ký của một máy macOS bật Remote Management và
Screen Sharing. **Kết hợp với lời của leader, đây là Mac mini.**

### ❌ Chưa xác minh — không được ghi là đã xong

| Mục | Trạng thái |
|---|---|
| **ZeroTier trên điện thoại** | **chưa kiểm** — không quan sát được từ máy tính |
| **Đường cellular thật → overlay** | **chưa kiểm** — mọi thứ trên đây đi qua Wi-Fi/LAN của máy leader |
| **Backend stub chạy trên Mac mini** | **chưa** — cổng `8787` đóng |
| **direct hay relayed** (`E12`) | **chưa biết** — cần `zerotier-cli peers`, mà lệnh đó đòi quyền admin |

### Một host nữa, không phản hồi

`10.134.129.170` có trong bảng ARP ở trạng thái `Stale` — tức **đã từng** nói chuyện với máy này,
nhưng hiện **không trả lời ICMP và mọi cổng đã dò đều đóng**. Không kết luận nó là gì. Có thể là
điện thoại đã từng join rồi ngủ, có thể là một thiết bị khác.

---

## 2 · Điều này đóng và KHÔNG đóng được gì

### Đóng được

Ô **"Mac mini bật được, truy cập được"** trong `DAY0_SIGNOFF.md` giờ **có bằng chứng quan sát**, không
còn là suy đoán. Ba ngày qua nó là `NOT_CHECKED` vì *"không ai xác nhận"* — giờ có người xác nhận, và
kèm output lệnh chứ không phải lời nói.

> ⚠ **Nhưng người xác nhận là leader, không phải Trung.** Bản ghi phải nói đúng điều đó. Ô này nằm
> trong bảng của Trung vì Mac mini được ghi là máy của cậu ấy; việc leader truy cập được nó là một
> dữ kiện mới mà `DAY0_SIGNOFF.md` chưa lường tới.

### KHÔNG đóng được

**Cổng vào `GATE 2` vẫn chưa mở.** Điều kiện là *"backend stub **tới được** VÀ overlay đã lên"* —
overlay lên rồi, nhưng **stub chưa chạy** (cổng 8787 đóng).

Và **`E1`–`E9`, `E12` vẫn không đo được từ đây.** Topology nghiệm thu là ràng buộc:

```text
Galaxy A17 5G → cellular 4G/5G THẬT → ZeroTier overlay → Mac mini M2 24 GB
```

Cái vừa chứng minh là **máy tính leader → Wi-Fi → overlay → Mac mini**. Thiếu đúng hai mắt xích
quan trọng nhất: **điện thoại** và **cellular thật**. `SPIKE_E_TRANSPORT/TASK.md:197` ghi thẳng: đo
không đúng đường mà trình làm acceptance thì **bằng chứng bị bác**.

---

## 3 · Một quan sát đáng chú ý cho `E12`

p50 = **38 ms** trên đường `máy tính → overlay → Mac mini` **qua Wi-Fi trong cùng nhà**.

Nếu Mac mini thật sự ở xa địa điểm demo như DR-003 yêu cầu, 38 ms là hợp lý cho đường **relayed**
qua root server của ZeroTier. Nếu nó ở cùng mạng nội bộ thì con số này **quá cao cho một kết nối
direct** và đáng nghi.

**Đây là giả thuyết, không phải kết luận.** `zerotier-cli peers` trả lời được trong một giây, nhưng
lệnh đó cần quyền admin. Trung phải chạy nó và ghi lại — `E12` đòi direct-vs-relayed cho **mọi** phép
đo, và nếu đường này là relayed thì đó là dữ kiện định hình toàn bộ budget của `E10`.

---

## 4 · Còn thiếu gì để `GATE 2` mở

| # | Việc | Ai làm được |
|---|---|---|
| 1 | Chạy `stub/server.py` trên Mac mini, bind địa chỉ overlay | cần shell trên Mac mini |
| 2 | Cài ZeroTier trên **Galaxy A17**, join network `3b19b3a71652c5f0` | người giữ máy — hiện là leader |
| 3 | Xác minh điện thoại tới được Mac mini **qua cellular**, tắt Wi-Fi | người giữ máy |
| 4 | `zerotier-cli peers` → ghi direct-vs-relayed | trên máy có quyền admin |

**Project Control không tự SSH vào Mac mini.** Cổng 22 mở, nhưng đó là máy được ghi là của Nguyễn Gia
Đức Trung, và không có uỷ quyền nào cho việc đăng nhập vào đó. Bước 1 cần leader hoặc Trung tự làm.

---

## 5 · Lệnh đã chạy — để tái lập được

```powershell
Get-Service ZeroTierOneService
Get-NetIPAddress -InterfaceAlias "ZeroTier One*" -AddressFamily IPv4
Get-NetNeighbor -InterfaceIndex <idx> -AddressFamily IPv4

# quet /24, timeout 300 ms, song song
1..254 | % { (New-Object Net.NetworkInformation.Ping).SendPingAsync("10.134.129.$_", 300) }

# 20 lan ping lay phan bo
# TCP connect tren 22, 80, 443, 548, 3283, 5000, 5900, 8787
```

Không lệnh nào ghi gì lên host từ xa. Toàn bộ là dò chỉ-đọc trên overlay riêng của dự án.

---

**Liên quan:** [`../onboarding/DAY0_SIGNOFF.md`](../onboarding/DAY0_SIGNOFF.md) ·
[`../spikes/SPIKE_E_TRANSPORT/TASK.md`](../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../readiness/OPEN_DECISIONS.md`](../readiness/OPEN_DECISIONS.md) DR-003a ·
[`tasks/DAY03_NGUYEN_GIA_DUC_TRUNG.md`](tasks/DAY03_NGUYEN_GIA_DUC_TRUNG.md)
