# DAY 5 — Nguyễn Gia Đức Trung · 2026-09-14

## 🔴 LÀM TRƯỚC — nợ tồn từ Day 4

> **Quy tắc của leader (13/09):** nợ tồn phải trả **trước**; nhiệm vụ Day 5 bên dưới chỉ bắt đầu sau khi xong khối này.

| # | Nợ | Từ | Vì sao phải làm trước |
|---|---|---|---|
| **1** | **Review lại PR #23** — tôi đã sửa đúng điểm bạn yêu cầu (`2ed3c64`) | tối 13/09 | công cụ `aggregate.py` phải nhận `wifi-overlay` **trước khi** bạn tổng hợp lượt 4 — nếu không, số Wi-Fi bị hạ thành "diagnostic" |

Xong dòng này rồi mới sang nhiệm vụ Day 5: **tổng hợp lượt 4** và viết `E10` `E11` `E13`.

---

> ## Hôm qua: điều kiện của bạn ĐẠT, và hai phát hiện của bạn là lỗi thật
>
> | | |
> |---|---|
> | Stub → `GATE 2` | ✅ leader xác nhận 12:35 |
> | Lỗi resample PR #14 | ✅ **lỗi thật** — đã sửa `a1744e8`, **ghi công bạn**. Selftest mới thất bại với code cũ đúng ở hai ca bạn mô tả |
> | `--host` → `--bind` | ✅ bạn đúng, packet sai |
> | Harness Toybox | ✅ **chạy được trên máy thật** — `toybox nc` 0.8.12 có sẵn trên Galaxy A17 |

---

## ⚠ Thay đổi lớn: bạn KHÔNG cần đụng điện thoại nữa — `DR-006a` revision 2

Leader và bạn rảnh vào giờ khác nhau, nên mỗi buổi đo từ xa thành một cuộc hẹn hai lịch. Leader quyết:
**anh ấy là operator duy nhất của Spike E**, đo khi anh ấy rảnh.

**Bạn vẫn là chủ sở hữu Spike E** — và phần của chủ sở hữu giờ rõ hơn:

| Phần của bạn | Vì sao nó là của bạn |
|---|---|
| **Thiết kế phép đo** — kịch bản, số lần lặp, đo lúc nào để thấy biến động cellular (`E8`) | operator chỉ bấm theo thiết kế của bạn |
| **Diễn giải** + `E10` budget · `E11` fallback set · `E13` khuyến nghị | `00` §14 — chức năng bạn bảo vệ được |
| **Tự chạy `aggregate.py` trên raw log của leader và ra đúng số** | ràng buộc (c) mới — thay cho "tự chạy lại trên máy" |
| Phán `ms_to_first_byte: null` của harness Toybox có đủ không | giới hạn bạn đã tự ghi |

Chi tiết và cái giá: `OPEN_DECISIONS.md` → **DR-006a · REVISION 2**. Leader cũng **rút khỏi vai reviewer
Spike E** → **Vũ Hùng Anh review Spike E.**

---

## PHẦN I — `NOW`

> **Tối 13/09 bạn đã làm xong phần lớn mục này:** mở **PR #24**, approve #14 · #18 · #22 (cả ba đã merge
> — #18 đưa CI lên `main`), và yêu cầu sửa #23 — đúng, đã sửa ở `2ed3c64`.

0. **Review lại PR #23** — việc duy nhất còn lại ở phần review.
1. ~~**Mở PR cho nhánh `docs/day4-avd-diagnostic`.**~~ ✅ PR #24. Đã push từ hôm qua nhưng chưa có PR, nên harness
   Toybox chưa ai review được — mà leader sắp dùng nó để đo.
2. ~~**Review bản sửa PR #14**~~ ✅ approve 22:56, đã merge `726e09f`.
3. ~~**Review PR #18**~~ ✅ approve 22:56, đã merge `3077d46` — CI guardrails chạy xanh trên `main`.

## PHẦN II — `THEN`

4. **Viết kế hoạch đo cho leader chạy** — một file ngắn trên nhánh của bạn: lệnh chính xác, tham số
   (`--slices 88 --window-radius 2 --repeats 3` hay khác), bao nhiêu lần chạy, **vào những giờ nào** để
   `E8` thấy được biến động cellular. Leader chạy **đúng** cái đó.
5. Sau buổi đo: `aggregate.py` trên raw log → số của bạn → `E10` `E11` `E13`.

---

## ⚠ Overlay đã ĐỔI sang network mới — và lượt đo đầu tiên đã chạy

Không ai tìm được tài khoản quản trị network cũ `3b19b3a71652c5f0`, nên leader tạo **`b103a835d292ddb3`**:

```text
laptop leader   68efb4de07   10.64.193.145
Mac mini        e202ffbfe4   10.64.193.115   <- stub thu hai chay o day, PID 32227, log rieng
dien thoai      078280bae8   10.64.193.140
```

Stub gốc của bạn (PID 60294, `10.134.129.115`) **vẫn chạy nguyên**, không ai đụng.

**Lượt đo 1 — 17:51, 1 lượt, nhánh `spike-e/evidence-20260913` (`bd5e931`), đọc `PROVENANCE.md` trước:**

| | |
|---|---|
| `E12` | **`RELAY`** trước và sau lượt đo |
| Kết quả thô | 57 mẫu: **30 ok, 27 lỗi `nc: connect: Network is unreachable`**, xen kẽ suốt lượt |
| Phía server | stub ghi đúng 30 request thành công — **27 request lỗi chưa rời điện thoại** |
| Chẩn đoán kèm theo | ping 30/30 không mất gói; 20 lần `nc` liên tiếp lỗi 7/20, có hay không `-4` |

> **⚠ `DR-003b` (13/09, quyết định của leader): đường nghiệm thu đổi từ 4G/5G sang Wi-Fi + ZeroTier.**
> Lý do là số đo của chính lượt 1–2: cellular Viettel chỉ `RELAY` và tải file lớn không nổi; Wi-Fi nhà
> leader thì `DIRECT`. Nhãn mới `wifi-overlay` — **PR #23** (công cụ Python) và **PR #22** (Toybox) chờ bạn
> review. `DR-003b` ghi rõ **quyền của bạn đề xuất quay lại cellular** bất cứ lúc nào, và cái giá: hôm
> demo cần một đường Wi-Fi đã kiểm là `DIRECT` tại chỗ.

> **✅ Tối 13/09 đã có bộ dữ liệu đầu tiên chạy trọn trên đường nghiệm thu mới** — lượt 4, Wi-Fi +
> ZeroTier `DIRECT`, **đúng thiết kế mặc định của bạn (88 slice, radius 2, 3 lượt lặp): 171/171 ok**, file
> 58 MB tải trọn cả 3 lần. **Việc chính của bạn:** review PR #23 rồi **tự chạy `aggregate.py` trên
> `20260913_run4/e_transport_20260913_run4.jsonl`** — đó là ràng buộc (c) của `DR-006a` rev 2 — và viết
> `E10` `E11` `E13`. Leader không tính con số nào.

**Đây là việc đầu tiên của bạn hôm nay:** lỗi nằm ở bước mở kết nối TCP qua VPN trên Android, không ở
relay hay stub. Là chính sách retry của harness, là hành vi của ZeroTier trên Android, hay thứ khác —
chủ sở hữu phán. Leader sẽ **không** chạy lượt 3 lần cho tới khi bạn có câu trả lời.

---

**Liên quan:** [`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) *(DR-006a rev 2)* ·
[`../../day04/gate2_verification_20260913.md`](../../day04/gate2_verification_20260913.md)
