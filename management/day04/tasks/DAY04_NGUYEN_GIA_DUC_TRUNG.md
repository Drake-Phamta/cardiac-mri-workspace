# DAY 4 — Nguyễn Gia Đức Trung · 2026-09-13

> ## Cập nhật 13/09 trưa — **`GATE 2` ĐÃ MỞ**
>
> Bạn chạy stub, và leader xác nhận từ peer của anh ấy lúc **12:35**: TCP qua interface ZeroTier,
> `GET /health` → **200**, `/mesh/0.obj` → **200, 7 429 byte, khớp đúng manifest** — tức bản sửa
> `meshes: []` của bạn chạy trên stub thật, không chỉ trên diff.
> Bản ghi: [`../gate2_verification_20260913.md`](../gate2_verification_20260913.md) *(DIAGNOSTIC, không
> phải bằng chứng nghiệm thu)*.
>
> | Việc bạn báo | Trạng thái |
> |---|---|
> | Stub trên Mac mini | ✅ **leader đã xác nhận** — `GATE 2` mở |
> | `--host` → `--bind` | ✅ bạn đúng, packet sai — **đã sửa** bên dưới |
> | Lỗi resampling PR #14 | ✅ **leader đã kiểm: lỗi thật** — `_compare` bỏ qua `origin` và hướng. **Đăng nó thành review trên GitHub** để nó có tên bạn; tác giả sửa sau khi bạn đăng |
> | `E12` | ⚠ **peer cần đọc là node của điện thoại**, không phải của leader — xem ② |
> | Remote adb | ✅ **đã dựng xong** `tools/remote_adb/`. Leader chạy một lệnh admin một lần, sau đó bạn chỉ cần `adb -H 10.134.129.145 -P 5037 devices` |
> | ZeroTier trên điện thoại | ☐ cần leader cầm máy — **việc tiếp theo** |
>
> **Việc còn thiếu:** push `DAY04_TRUNG_PROGRESS_20260913.md` và `AVD_DIAGNOSTIC_20260913.md` lên
> **nhánh riêng của bạn** rồi mở PR. Hiện hai file đó chỉ nằm trên máy bạn, và luật của `DAY_LOG` là
> *không có bằng chứng truy được thì chưa tính là xong.*

> ## Ghi nhận trước: Day 3 bạn là người **duy nhất** có việc thật land
>
> Day 3 đóng với kết quả **TRƯỢT** ở mức toàn nhóm. Trong ngày đó, đúng một thành viên hoạt động:
>
> | Việc | Bằng chứng |
> |---|---|
> | Review PR #16 — `CHANGES_REQUESTED` 16:54 → `APPROVED` 17:10, **ba phát hiện đúng** | API review |
> | `03147e3` — **141 dòng / 6 file**, tự sửa cả ba phát hiện | commit |
>
> Và một trong ba phát hiện là cái **luồng soi đối kháng của tôi đã bỏ sót**:
> `payloads/generate.py` sinh `meshes: []`, nên `/mesh/{level}.obj` trả **404** trong khi README mô tả
> bốn mức đã được phục vụ. Đó là review thật, có giá trị, không phải review hình thức.
>
> **PR #16 đã merge** — `6a36909`. Dụng cụ Spike E giờ nằm trên `main`, không cần switch nhánh nữa.

---

> ### ⚠ Một lưu ý quy trình, ghi lại để không thành tiền lệ
>
> Hai commit `b400c0d` và `03147e3` **đi thẳng vào nhánh của leader**. `15` §191 và
> `management/onboarding/practice/README.md:63` cấm đúng việc đó — và đó chính là luật đã được viện
> dẫn khi **leader** push vào nhánh của Vũ Hùng Anh ở PR #1. Luật áp cho cả hai chiều.
>
> Kèm theo: `APPROVED` của bạn xác nhận **commit do chính bạn viết** → nửa sau của review đó là tự
> review.
>
> **Không hoàn tác gì cả** — nội dung tốt và đã merge. Lần sau: nêu phát hiện **trong review** và để
> tác giả sửa. Đã ghi vào `DAY03_EOD_REVIEW` §3 và `DAY_LOG`, theo đúng khuôn `commit_hygiene_note`
> từng dùng cho lỗi của chính leader.

---

## Trạng thái đường truyền — đã kiểm chứng, không phải tin lời

```text
✅  10.134.129.115   100 ping, mất 0%, p50 29 ms, p95 37 ms, max 235 ms, MTU 1500
    cổng mở: 22 SSH · 3283 Apple Remote Desktop · 5900 Screen Sharing · 5000 AirPlay
    → ba cổng 3283 + 5900 + 5000 cùng mở là chữ ký macOS. Mac mini ĐANG SỐNG.
✅  ZeroTier trên máy tính — network 3b19b3a71652c5f0, đang chạy
☐   stub chạy trên Mac mini — cổng 8787 ĐÓNG (kiểm 16:20 và 23:05)
☐   ZeroTier trên ĐIỆN THOẠI — chưa có
```

**`GATE 2` vẫn chưa mở**, vì điều kiện vào là *“stub **tới được**”*, không phải *“overlay đã lên”*.
Thứ duy nhất còn chặn nó là **stub chưa chạy** — và việc đó **không cần điện thoại**.

> ### ⚠ Đính chính `DR-006a` revision 1 — bản packet cũ nói SAI
>
> Bản trước viết rằng có USB thì **không cần** ZeroTier trên điện thoại. **Sai.** USB chỉ là kênh
> **điều khiển**; đường **dữ liệu** vẫn đi `điện thoại → cellular → overlay → Mac mini`, và Mac mini
> không có endpoint công khai (`DR-003` cấm).
>
> Đã kiểm trên máy thật: điện thoại ping Mac mini **mất 100%**, **không có interface ZeroTier**,
> **không có route**. → **ZeroTier trên điện thoại VẪN BẮT BUỘC.** Sửa tại `91bd052`.

---

## PHẦN I — `NOW` · việc mở `GATE 2`, không cần điện thoại

### ① Chạy stub trên Mac mini, bind địa chỉ overlay

```bash
git pull origin main                      # dung cu da len main
python3 spikes/spike_e_transport/stub/server.py --payloads <thu-muc-payload> --bind <dia-chi-ZT-cua-Mac-mini> --port 8787
```

> **Đính chính 13/09:** bản đầu của packet này ghi `--host`. Stub nhận **`--bind`** (và bắt buộc
> `--payloads`). Trung phát hiện và tự sửa lệnh của mình; dòng trên đã sửa theo.

Bind **địa chỉ overlay**, không phải `127.0.0.1` — nếu bind loopback thì từ máy leader vẫn không tới
được và cổng vẫn coi như đóng. Kiểm từ phía bạn trước:

```bash
curl -s http://<dia-chi-ZT>:8787/health
```

**Cổng 8787 mở = `GATE 2` mở.** Đây là việc đơn lẻ đang chặn nhiều nhất trong toàn dự án hôm nay.

### ② `zerotier-cli peers` — một giây, và nó trả lời `E12`

```bash
sudo zerotier-cli peers        # tren Mac mini
```

> **Đính chính 13/09 — packet này chỉ sai peer.** Máy leader là node **`68efb4de07`**, nhưng peer đó
> chỉ trả lời cho đường **điều khiển** (remote adb). `E12` hỏi về **đường được đo**: *điện thoại →
> Mac mini*. Nên peer cần đọc là **node của Galaxy A17** — chưa tồn tại cho tới khi ZeroTier được cài
> lên máy. `E12` **không đóng được trước bước ③**.

Khi có node của điện thoại: tìm dòng có ID đó, xem cột cuối **`DIRECT`** hay **`RELAY`**. Relayed thì
mọi số latency phải đọc kèm chú thích.

---

## PHẦN II — `THEN`

### ③ Cài ZeroTier lên điện thoại

Bắt buộc (xem hộp đính chính ở trên). Máy là Galaxy A17 của leader, nên việc này cần **một buổi hẹn**
— không tự làm một mình được.

> ### ⚠ Dữ kiện phải biết trước buổi hẹn: điện thoại **không chạy được harness Python của bạn**
>
> Đã kiểm trên máy thật: điện thoại **không có Python, không có Termux, không có `curl`, không có
> `wget`**. Còn `client/harness.py` thì viết bằng Python và docstring của nó ghi *“runs on the Galaxy
> A17”*. **Câu đó không đúng với máy này.**
>
> Đường đã chọn: **đưa một binary `curl` tĩnh** lên máy qua `adb push` và chạy qua `adb shell`. Việc
> đó cần chuẩn bị trước, không làm ngay trong buổi hẹn được.

### ④ Hẹn buổi đo từ xa — **bạn bấm, không phải leader bấm**

```text
máy CỦA BẠN  --ZeroTier overlay-->  PC của leader  --USB-->  Galaxy A17
                                                              |
                                 traffic ĐO đi ----------------+--> cellular THẬT
```

```bash
# tren may BAN, sau khi leader da mo adb server
export ANDROID_ADB_SERVER_ADDRESS=10.134.129.145
export ANDROID_ADB_SERVER_PORT=5037
adb devices          # phai thay R5CY931SQ... device
```

Vì sao kênh điều khiển đi **USB** chứ không đi overlay: nếu điều khiển cũng đi qua cellular+overlay
thì nó **làm nhiễm đúng đường mà `E1` đang đo**. Đi USB thì Wi-Fi điện thoại **tắt**, và traffic đo đi
cellular thật.

`SPIKE_E_TRANSPORT/TASK.md` giữ nguyên: *“**All network and device measurements are executed by
Nguyễn Gia Đức Trung** over the real cellular + overlay path.”* Nên trong repo hiện **không có một
con số transport nào** — chúng là của bạn.

> **Cập nhật 13/09 — đã xử lý.** `adb` không bind được một địa chỉ đơn, nên `tools/remote_adb/` chặn
> cổng 5037 bằng firewall với **mọi địa chỉ ngoài overlay** trước khi mở. Phía bạn chỉ cần:
>
> ```bash
> adb -H 10.134.129.145 -P 5037 devices -l
> ```
>
> Dùng platform-tools gần bản của leader (`36.0.0`, adb `1.0.41`). Chi tiết:
> `tools/remote_adb/README.md`.

### ⑤ `E1`–`E9` và `E12`

Sau khi stub chạy và buổi đo diễn ra. Bằng chứng đo của bạn đi trên **nhánh riêng**, không trộn vào
nhánh dụng cụ. `analyze/aggregate.py` đã sửa lỗi mà chính docstring của nó tự tố — nó từng báo một con
số khác với con số nó nói là đang báo.

---

## PHẦN III — `LATER`

### ⑥ Review một PR của đồng đội — #14 hoặc #15

Hàng đợi đang **5 PR mở, 0 review**, và **cả 5 đều do leader viết** nên anh ấy không approve được cái
nào. `15` §7 gọi đúng tình trạng này là *“a large queue of unreviewed ‘done’ work”*. Bạn vừa chứng
minh review của bạn có chất lượng — đây là chỗ cần nó nhất.

---

## Ràng buộc không đổi

- `DR-003a` — Mac mini **không có endpoint công khai**; mọi thứ đi qua overlay `3b19b3a71652c5f0`.
- Bằng chứng đo **do bạn chạy**, trên đường **cellular thật**, không phải Wi-Fi.
- Không commit byte dataset.

---

**Liên quan:** [`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
`spikes/spike_e_transport/README.md` *(đã trên `main`)* ·
[`../../day03/overlay_reachability_20260912.md`](../../day03/overlay_reachability_20260912.md) ·
[`../../day03/DAY03_EOD_REVIEW.md`](../../day03/DAY03_EOD_REVIEW.md)
