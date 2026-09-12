# DAY 4 — Phạm Tuấn Anh · 2026-09-13

> ## Trạng thái vào ngày: 🔴 **RED**, buffer **0**
>
> Day 3 **TRƯỢT**. `15` §18 **trigger 2 đã nổ** (buffer 1 → 0), chồng lên **trigger 3 đã nổ** từ Day 2
> và nay sống qua **chu kỳ EOD thứ ba**.
>
> Mọi bế tắc **bên ngoài** đã được gỡ: dataset trên đĩa, dụng cụ bốn spike đã dựng và sửa hết lỗi
> chặn, Mac mini tới được trên overlay, bảng tự sinh từ state file. **Critical path vẫn đứng yên sang
> ngày thứ năm.**
>
> Từ đây, vấn đề của dự án **không còn là công cụ hay dữ liệu**. Nó là **khả dụng của người**.

---

## PHẦN I — `NOW` · hai quyết định chỉ anh ra được

### ① Quyết recovery — nhưng **đọc `DAY03_EOD_REVIEW` §11 trước khi quyết**

`15` §414 nói de-scope là *“explicit leader decision”*. Danh sách đã soạn sẵn, chưa tuyên bố gì.

> ### ⚠ Phát hiện quan trọng nhất của Day 3: **de-scope `COULD` không mua thêm ngày nào**
>
> `03_PRODUCT_REQUIREMENTS_PRD.md` §3.1 nói về cả **11 mục `COULD`/`SHOULD`**:
>
> > *“They are not part of the critical-path acceptance floor unless promoted through Decision
> > Request.”*
>
> Chúng **chưa bao giờ** nằm trên critical path. Đóng băng hết 11 mục giải phóng **0 ngày**.
>
> Sàn nghiệm thu thật là **28 `MUST`**, và `MUST` chỉ de-scope được bằng **Decision Request + sửa
> spec** (`15` §414) — mà spec đang **đóng băng** ở v1.0.
>
> **Kết luận thẳng: thang recovery 5 mức không giải quyết được tình trạng hiện tại.** `INC-001` §4.1
> đã ghi khoảng trống này: thang đó **không có mức nào** cho tình huống ba trên bốn người không hoạt
> động. Thu hẹp scope là công cụ sai cho một bài toán về khả dụng.

Ba lựa chọn thật, không phải ba mức trên thang:

| | Làm gì | Đánh đổi |
|---|---|---|
| **A** | **Lập lại kế hoạch 30 ngày trên năng lực thật** — nếu thực tế là ~1,5 người thì kế hoạch phải nói thế | trung thực, và là thứ duy nhất bền |
| **B** | Giữ kế hoạch, chờ ba người quay lại | mỗi ngày chờ là một ngày buffer âm |
| **C** | Leader làm thay tiếp | **`TC-TEAM-001` chặn cứng** — xem ③ |

### ② Gán reviewer cho PR #18, rồi merge **có review**

```bash
gh pr view 18 --web
```

`chore/ci-guardrails` — workflow đã kiểm chứng là **chuyển RED khi cố tình sửa spec**. Nó đang chờ
một reviewer. `ci_configured: false` trong `PROJECT_STATE.yaml` là **đúng với `main`** và chỉ đóng khi
PR này merge kèm review.

> ⚠ **Anh không approve được PR nào cả.** Cả **5 PR đang mở đều do anh viết** — GitHub cấm tự approve.
> Hàng đợi review chỉ mở được **từ phía ba người kia**. Đây không phải việc anh làm nhanh hơn được
> bằng cách tự làm nhiều hơn.

---

## PHẦN II — `THEN`

### ③ Liên lạc trực tiếp Khánh và Hùng Anh — **gọi, không nhắn**

Bốn ngày, 0 commit, 0 review, 0 dòng khai báo khả dụng. Nhắn tin đã thử và không hiệu quả.

**Vì sao đây là việc P0 chứ không phải việc hành chính:**

`TC-TEAM-001` (`13` §361) đòi **bốn gói bằng chứng, mỗi thành viên một gói**, và nó là cổng nghiệm thu
MVP **mức `MUST`** — **không de-scope được**. `00` §14 dòng 261 nói thêm: mỗi thành viên phải bảo vệ
được một chức năng mà họ **“personally analyzed, designed, and implemented”**.

Nghĩa là: **dù anh làm hết mọi thứ còn lại, dự án vẫn không nghiệm thu được.** Không có con đường nào
mà leader một mình đi tới đích. Việc gọi điện cho hai người kia có giá trị cao hơn bất kỳ dòng code
nào anh viết hôm nay.

Nội dung cuộc gọi chỉ cần ba câu hỏi: hôm nay có bao nhiêu giờ · có vướng gì kỹ thuật không · có biết
`TC-TEAM-001` không de-scope được không.

### ④ Quyết cài gì lên Galaxy A17

| Mục | Trạng thái |
|---|---|
| **ZeroTier** | **BẮT BUỘC** — `DR-006a` rev 1. Đã kiểm: điện thoại ping Mac mini mất 100%, không interface, không route |
| **HTTP client** | Máy **không có Python, Termux, `curl`, `wget`**. Đường đã chọn: **binary `curl` tĩnh** qua `adb push` |

Cần làm **trước** buổi hẹn với Trung, không làm trong buổi hẹn được.

> ### ⚠ Còn một việc kỹ thuật chưa xử lý xong, và nó là quyết định của anh
>
> `adb` **không bind được một địa chỉ đơn** — trả về *“listening on specified hostname currently
> unsupported”*. Nghĩa là mở adb server cho Trung/Hùng Anh nối vào sẽ mở nó **rộng hơn** mức mong
> muốn trên máy anh. Tôi đã thử vô hiệu hai rule firewall cho `adb.exe` nhưng chúng **tự bật lại**,
> và tạo rule mới cần quyền admin — nên **máy anh hiện không bị thay đổi gì**.

### ⑤ Một phát hiện an ninh **có sẵn từ trước** trên máy anh — chưa ai chạm vào

Phát hiện trong lúc đo overlay, **không phải do dự án này gây ra**, và tôi **không thay đổi gì**:

```text
sshd đang lắng nghe 0.0.0.0:22
PasswordAuthentication  — không đặt tường minh, mặc định của sshd là YES
authorized_keys         — không có
rule firewall           — profile=Any, remote=Any
```

Máy đang ở trên một overlay có người khác. Ba việc đóng được trong 10 phút: đặt
`PasswordAuthentication no`, thêm khoá công khai, và giới hạn rule firewall về đúng subnet ZeroTier.
**Quyết định là của anh** — đó là máy cá nhân của anh.

---

## PHẦN III — `LATER`

### ⑥ Spike A — việc của chính anh

`A9` đã đo **hai lần**: 64×64 p95 **65,31 ms**, 576×576 p95 **50,23 ms** *(kích thước slice thật)*,
cộng phép ngoại suy **376 MB** graphics memory cho 88 slice. Còn mở: `A1` chưa verify exact-match,
`A12` mới có **một** candidate. Việc tiếp theo là đo với **cache có giới hạn**.

Nhưng `A1`–`A12` của anh **đang chờ Hùng Anh công bố format** — nên ⑥ đứng sau ③.

### ⑦ `DR-002` — chọn Path A hay Path B

Đang chặn **`A19`** của Khánh (2 trong 8 trường `06` §9.1 để trống). Và `DR-002` cần bằng chứng từ
audit của Khánh. Vòng phụ thuộc này **mở được từ phía Khánh**, không từ phía anh.

Dữ kiện đã biết và ảnh hưởng trực tiếp lựa chọn: **Testing Set CÓ nhãn** (54 case).

### ⑧ Hai khoảng trống quản trị nên vá khi hết RED

- **Thang recovery không có mức** cho tình huống đa số thành viên không hoạt động (`INC-001` §4.1).
- **Trigger 2 viết dựa trên một ngưỡng không tồn tại** — `MASTER_PLAN` nói buffer *“≥2 ngày”* nhưng
  **không đâu định nghĩa ngưỡng an toàn bằng số**.

---

## Ranh giới Project Control giữ nguyên hôm nay

**Ghi lại sự thật đã tồn tại. Không sinh ra bằng chứng của người khác.**

Ngoại lệ `INC-001` đã hết hiệu lực lúc 00:00 ngày 2026-09-12 và **không tự gia hạn** (§4.5). Nên hôm
nay, như hôm qua: **không** `RESULT.md` cho D/B/E/C · **không** `evidence_present: true` · **không**
`DATASET_AUDIT.md` · **không** ô `[RECORD]` mang tên người vắng mặt · **không** commit hay review dưới
tài khoản người khác · **không** chạm `docs/specs/v1.0/**` (19/19 SHA-256 khớp) hay
`tests/fixtures/geometry/**`.

---

**Liên quan:** [`../../day03/DAY03_EOD_REVIEW.md`](../../day03/DAY03_EOD_REVIEW.md) ·
[`../../PROJECT_STATE.yaml`](../../PROJECT_STATE.yaml) ·
[`../../DAY_LOG.md`](../../DAY_LOG.md) ·
[`../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
