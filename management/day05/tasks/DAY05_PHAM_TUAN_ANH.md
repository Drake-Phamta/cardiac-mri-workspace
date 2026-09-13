# DAY 5 — Phạm Tuấn Anh · 2026-09-14

> ## Trạng thái vào ngày: 🔴 RED
>
> Hôm qua hàng đợi review thông: 3 PR merge, 4 review thật, mọi PR còn lại đều có người được giao. Hai
> trên ba thành viên vắng đã quay lại. **Critical path vẫn đứng yên — một người.**

---

## PHẦN I — `NOW` · hai việc chỉ anh làm, cộng lại chưa tới 10 phút

### ① ~~Auth node điện thoại~~ — ✅ XONG 13/09 17:42, trên network MỚI

Không ai tìm được tài khoản quản trị network cũ `3b19b3a71652c5f0`, nên anh đã tạo **`b103a835d292ddb3`**
trong tài khoản của anh và duyệt cả ba máy. **Địa chỉ mới:** laptop `10.64.193.145` · Mac mini
**`10.64.193.115`** · điện thoại `10.64.193.140`. Stub thứ hai chạy ở `10.64.193.115:8787`.

**Lượt đo 1 (17:51) đã chạy** — E12 `RELAY`, 30/57 ok, 27 lỗi kết nối **phía điện thoại** dù ping 30/30.
Dữ liệu thô: nhánh `spike-e/evidence-20260913`. Trước lượt đo đủ 3 lần, **chờ Trung chẩn đoán lỗi đó** —
đo tiếp khi đường chưa ổn chỉ tốn data mà không ra số dùng được.

### ② Tắt SSH server trên laptop

```powershell
# PowerShell -> Run as administrator
powershell -ExecutionPolicy Bypass -File D:\cardiac-mri-workspace\tools\host_hardening\disable_sshd.ps1
```

Không ảnh hưởng việc anh SSH **ra** Mac mini. Đảo ngược: `Set-Service sshd -StartupType Automatic;
Start-Service sshd`.

---

## PHẦN II — `THEN` · buổi đo Spike E — anh là operator duy nhất

**Chờ kế hoạch đo của Trung** (packet của cậu ấy, mục 4) — anh chạy **đúng** thiết kế của chủ sở hữu.
Nếu cậu ấy chưa kịp viết, tham số trong `ANDROID_TOYBOX_HARNESS.md` của cậu ấy là mặc định.

**Trước khi đo — dừng nếu một mục sai:**

| Kiểm | Phải thấy |
|---|---|
| Wi-Fi điện thoại | **TẮT** |
| Điểm phát Wi-Fi (hotspot) | **TẮT** — hôm qua có lúc bật |
| ZeroTier app → **"Allow mobile data"** | **BẬT** — nếu tắt, ZeroTier ngừng gửi ngay khi rời Wi-Fi |
| Interface ZeroTier trên điện thoại | `tun0 10.64.193.140` |
| Route tới `10.64.193.115` | đi **`tun0`**, không phải `rmnet` / `wlan0` |
| Ping Mac mini từ điện thoại | có phản hồi |
| Stub | `/health` 200 |

**Trong buổi đo:**

1. `E12` — đọc dòng `078280bae8` trong `zerotier-cli peers` trên Mac mini, ghi **nguyên văn**. **Không
   cần sudo**: tài khoản `quant` có sẵn token, tôi đọc được qua SSH.
2. Harness Toybox của Trung, ghim SHA commit, `--operator "Pham Tuan Anh"` `--owner "Nguyen Gia Duc
   Trung"` `--path cellular-overlay` `--connection` theo bước 1.
3. Điều kiện mạng đọc từ máy (loại mạng, tín hiệu), giờ bắt đầu/kết thúc.
4. `adb pull` → raw log + provenance lên nhánh `spike-e/evidence-<ngày>`. **Không tổng hợp, không
   `RESULT.md`, không kết luận** — đó là của Trung.

Tôi chạy các lệnh trên máy anh theo lệnh anh; evidence ghi *operator: Phạm Tuấn Anh (thực thi qua Claude
Code trên máy operator)*.

---

## PHẦN III — `LATER`

### ③ Quyết đường thiết bị cho Spike B

`DR-006a` rev 2 chỉ phủ Spike E. `B10` `B11` `F7` cũng cần điện thoại. Quyết trước khi Hùng Anh dựng
xong app 3D — hỏi cậu ấy muốn tự đo từ xa (`tools/remote_adb/` đã dựng và kiểm) hay để anh bấm.

### ④ Khánh — nhắc, không làm hộ

Hạn cứng **23:59 hôm nay**. Trễ → anh báo giảng viên hướng dẫn, như đã quyết.

### ⑤ Spike A — phần của chính anh

`A2`–`A8` `A10` `A11` cần zoom/pan, brush, undo/redo, save/reload trong app — chặng S4–S7. Giờ đã có
hợp đồng hình học chính thức (`tests/fixtures/geometry/`) để Spike A bám.

---

**Liên quan:** [`../../day04/DAY04_EOD_REVIEW.md`](../../day04/DAY04_EOD_REVIEW.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) *(DR-006a rev 2)* ·
[`../../PROJECT_STATE.yaml`](../../PROJECT_STATE.yaml)
