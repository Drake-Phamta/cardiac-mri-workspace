# DAY 5 — Nguyễn Gia Đức Trung · 2026-09-14

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

1. **Mở PR cho nhánh `docs/day4-avd-diagnostic`.** Đã push từ hôm qua nhưng chưa có PR, nên harness
   Toybox chưa ai review được — mà leader sắp dùng nó để đo.
2. **Review bản sửa PR #14** (`a1744e8`) — bạn tìm ra lỗi, bạn là người review hợp nhất.
3. **Review PR #18** (CI guardrails) — bạn được giao hôm qua.

## PHẦN II — `THEN`

4. **Viết kế hoạch đo cho leader chạy** — một file ngắn trên nhánh của bạn: lệnh chính xác, tham số
   (`--slices 88 --window-radius 2 --repeats 3` hay khác), bao nhiêu lần chạy, **vào những giờ nào** để
   `E8` thấy được biến động cellular. Leader chạy **đúng** cái đó.
5. Sau buổi đo: `aggregate.py` trên raw log → số của bạn → `E10` `E11` `E13`.

---

## Trạng thái đường truyền

```text
✅ Stub 10.134.129.115:8787          /health 200, /mesh/0.obj 200 đúng 7 429 byte
✅ ZeroTier trên điện thoại           đã cài · node 078280bae8 · v1.16.0
❌ Node điện thoại                    CHƯA Auth - leader đang xử lý
```

`E12` đọc dòng **`078280bae8`** trong `sudo zerotier-cli peers` trên Mac mini — leader sẽ ghi lại
nguyên văn trong buổi đo.

---

**Liên quan:** [`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) *(DR-006a rev 2)* ·
[`../../day04/gate2_verification_20260913.md`](../../day04/gate2_verification_20260913.md)
