# INC-001 — Ngày execution đầu tiên trôi qua với một người làm việc

| | |
|---|---|
| **Mã** | `INC-001` |
| **Ngày** | 2026-09-11 (Day 2) |
| **Loại** | Hỏng quy trình — khả dụng và báo cáo, **không phải hỏng kỹ thuật** |
| **Ghi bởi** | Project Control, theo chỉ đạo của Phạm Tuấn Anh |
| **Trạng thái** | `ĐÃ ĐÓNG` cho ngày 2026-09-11 · luật sinh ra từ đây có hiệu lực từ Day 3 |

> **Đây là biên bản quy trình, không phải bản kiểm điểm.** Nó chỉ chứa sự kiện có dấu vết truy được và
> điều khoản đã viết sẵn trong đặc tả. Không một dòng nào ở đây đánh giá con người, và nó không nên
> được đọc như vậy. Mục đích duy nhất: để tình huống này không lặp lại.

---

## 1 · Sự việc

Cutover execution được tuyên bố lúc **2026-09-11 12:00 +07:00** (`DAY01_CUTOVER_RECORD.md`). Từ thời
điểm đó, bốn spike `SPIKE_D` `SPIKE_A` `SPIKE_B` `SPIKE_E` chuyển sang `ACTIVE` và đồng hồ DR-001 bắt
đầu chạy.

**Hoạt động trên repository sau cutover**, lấy từ GitHub Events API, giờ UTC kèm giờ địa phương:

| Người | Spike | Event **sau** 12:00 | Event cuối trong ngày |
|---|---|---:|---|
| Phạm Tuấn Anh | `SPIKE_A` | **19** | 14:12 +07 |
| Bế Quốc Khánh | `SPIKE_D` — **P0** | **0** | 11:34:48 +07 *(25 phút trước cutover)* |
| Nguyễn Gia Đức Trung | `SPIKE_E` | **0** | 11:35:05 +07 *(25 phút trước cutover)* |
| Vũ Hùng Anh | `SPIKE_B` | **0** | **không có event nào cả ngày** |

Toàn bộ hoạt động của Khánh (1 event) và Trung (6 event) trong ngày đều nằm **trước** cutover và đều
thuộc phần việc practice Day-0, không phải spike.

**Trạng thái repository lúc lập biên bản (22:50 +07):**

```text
RESULT.md của spike        1 / 6     (chỉ SPIKE_A, và đang nằm trên PR #13 chưa merge)
DATASET_AUDIT.md           chưa có
data/manifests/            chưa có
tests/fixtures/geometry/   chưa có — thư mục tests/ chưa tồn tại
spikes/                    chỉ có spike_a_2d
PR #13                     mở từ 14:12, reviewer scalliontor, 0 review được submit
```

---

## 2 · Điều khoản đã có sẵn nhưng không được áp dụng

Vấn đề không phải là ba bạn bận — người ta có quyền bận. Vấn đề là **việc bận không được báo**, và đặc
tả đã nói trước về đúng chuyện này.

**`15` §13 — During day:**

> *"escalate blockers rather than hiding them until EOD"*

**`15` §5 — Daily planning contract**, `Member availability/capacity for the day` là **trường bắt buộc**
của kế hoạch ngày, và `15` §5 ghi *"Planning is based on **actual available hours**"*. Một kế hoạch lập
trên giả định bốn người có mặt, khi thực tế có một, thì không phải kế hoạch sai — nó là kế hoạch thiếu
đầu vào.

**`15` §13 — End of day**, mỗi thành viên phải nộp: nhiệm vụ được giao, trạng thái, link PR, kết quả
test, blocker mới, nhu cầu phụ thuộc cho ngày mai. **Không ai nộp.**

> **Rút gọn thành một câu:** *vắng mặt phải được **báo**, không phải để người khác **phát hiện**.*
> Một tin nhắn lúc 09:00 nói "hôm nay tôi bận, tôi làm được 2 tiếng buổi tối" có giá trị hơn nhiều một
> ngày im lặng — vì nó cho phép lập kế hoạch, còn im lặng thì không.

---

## 3 · Tác động — đo được, không phải cảm tính

| Hạng mục | Trạng thái |
|---|---|
| **`15` §18 trigger 3** | **ĐÃ THOẢ** — *"a critical-path blocker survives two EOD cycles without credible resolution"*. `SPIKE_D` là P0 trên critical path, `evidence_present: false`, sang ngày thứ ba chưa chạy |
| **`15` §18 trigger 2** | Buffer phục hồi còn **1 ngày**. Mất thêm một ngày nữa là **0** và trigger 2 nổ |
| **Critical path** | `SPIKE_D → GATE-DATA-01 → GATE-SPLIT-01 → SPIKE_C1 → training → metrics`. Mọi thứ phía sau `SPIKE_D` vẫn đứng yên. `SPIKE_C1` vẫn `BLOCKED_BY_SPIKE_D` |
| **Trigger DR-001** | Tới hạn **cuối hôm nay**, và đây là **lần hoãn thứ hai** — DR-001a đã dời nó từ cuối Day 1 sang cuối Day 2 |
| **Hàng đợi review** | Trống hoàn toàn. PR #13 mở 8 tiếng, 0 review |

`DAY_LOG.md` mở đầu bằng đúng nguyên tắc mà hôm nay chạm phải:

> *"một ngày 'xong' mà không để lại dấu vết thì không phải là xong."*

---

## 4 · Recovery đã kích hoạt — và gọi đúng tên nó

Leader kích hoạt recovery theo `15` §18. Ghi lại trung thực, **kể cả chỗ không khớp với thang có sẵn**.

### 4.1 · Thang `15` §18 có năm mức

```text
Level 1  Reallocate            chuyển reviewer / secondary owner lên critical path
Level 2  Pair                  ghép hai thành viên vào một blocker rủi ro cao
Level 3  Parallelize safely    tách việc theo các contract không chồng nhau
Level 4  Simplify              giữ nguyên yêu cầu, chọn đường kỹ thuật đơn giản hơn
Level 5  De-scope              đóng băng/bỏ COULD, rồi SHOULD nếu cần
```

**Không mức nào trong năm mức cho phép một người thực thi phần việc thuộc sở hữu của người khác.**
Level 1 chuyển *reviewer* lên critical path. Level 2 *ghép cặp* — mà ghép cặp cần hai người có mặt.
Tình huống "ba trên bốn thành viên vắng" **không có điều khoản nào trong `14` điều chỉnh**; khoảng
trống đó là có thật trong đặc tả, và biên bản này ghi nhận nó thay vì gán một cái nhãn cho vừa.

### 4.2 · Đêm 2026-09-11 thực sự gồm ba thứ khác nhau

| Thành phần | Phân loại đúng |
|---|---|
| Leader **thu thập** gói dataset LASC 2018 | **Level 1** áp cho đúng một việc — leader lên critical path |
| Kế hoạch Day 2 bốn người bị thu về một người | **Level 5** — de-scope kế hoạch trong ngày |
| Leader dựng harness / stub / script cho D, B, E, C0 | **Không phải recovery.** Năm file `TASK.md` đều cho phép sẵn việc này cho bất kỳ ai |

### 4.3 · Ranh giới được giữ nguyên trong suốt đêm

**Đêm nay sinh ra dụng cụ, không sinh ra bằng chứng của người khác.**

| Đã làm | Không làm |
|---|---|
| harness, backend stub, script validate, fixture generator, instrumentation | `RESULT.md` cho Spike D, B, E, C |
| thu thập gói dataset, ghi đúng tên người thu thập | điền các ô `[RECORD]` dưới tên người vắng mặt |
| đánh giá trigger DR-001 với tư cách Project Control | đặt cờ `evidence_present: true` hay `EVIDENCE_READY` |
| commit dưới tài khoản của chính leader | commit hoặc review dưới tài khoản người khác |

Lý do của cột phải, dẫn nguyên văn:

- **`13` §361 — `TC-TEAM-001`:** *"**Four** member evidence packages each contain
  analysis/design/UI/implementation/test/privacy/defense proof for at least one mobile function plus
  shared-core readiness."* — và `13` §517 đặt nó là **điều kiện bắt buộc để nghiệm thu MVP cuối cùng**.
- **`16` §163** — chuỗi bằng chứng bảo vệ của mỗi người chạy qua `… → commits/PR → tests → …`. **Tác giả
  commit là bản ghi công khai và vĩnh viễn.** Nếu tối nay mọi commit mang một tên, ba người còn lại
  không còn gì để truy vết, và điều đó không mua lại được sau.
- **`00` §14** — định nghĩa thành công của dự án đòi mỗi thành viên bảo vệ được một chức năng
  *"they personally analyzed, designed, and implemented"*.

### 4.4 · Anti-bottleneck rule — quyền sở hữu KHÔNG chuyển

`OPEN_DECISIONS.md` §Ownership governance, nguyên văn:

> **Do not move ML ownership from Bế Quốc Khánh to Vũ Hùng Anh merely for short-term speed.**
> **Do not move Backend ownership from Nguyễn Gia Đức Trung to Phạm Tuấn Anh merely for short-term speed.**
>
> *"Pairing the stronger member onto a struggling block preserves ownership; transferring ownership
> does not."*

**Bế Quốc Khánh vẫn là Primary Owner của `SPIKE_D` và `SPIKE_C`. Nguyễn Gia Đức Trung vẫn là Primary
Owner của `SPIKE_E`. Vũ Hùng Anh vẫn là Primary Owner của `SPIKE_B`, `SPIKE_F` và của bộ canonical
geometry fixture (DR-013).** Không dòng nào trong đêm nay đổi điều đó.

### 4.5 · Hiệu lực

**Ngoại lệ này áp dụng cho đúng ngày 2026-09-11 và hết hiệu lực khi Day 3 bắt đầu.** Nó không tự gia
hạn. Muốn áp dụng lại cần một quyết định mới của leader, có ghi lý do mới.

---

## 5 · Nghĩa vụ VẪN CÒN MỞ — không ai được giảm việc

Dự án đã có tiền lệ cho đúng điểm này. Ngày 2026-09-11 leader review thay PR #8 vì Khánh vắng, và
`DAY_LOG.md` vẫn ghi nghĩa vụ của Khánh ở cột **"Còn tồn"**:

> `| Bế Quốc Khánh | Review PR thật của một đồng đội | Vắng cả 10/09 và 11/09 | đóng cột B khi làm |`

Nguyên tắc giữ nguyên: **làm thay không xoá nghĩa vụ.**

| Người | Việc vẫn thuộc về bạn |
|---|---|
| **Bế Quốc Khánh** | Toàn bộ audit `A1`–`A20` của Spike D trên gói đã có sẵn · xác nhận đĩa trống + thư viện NRRD **trên máy bạn** · khai báo compute thật cho `C0-1` · review một PR thật của đồng đội *(cột `B` sign-off vẫn mở)* |
| **Nguyễn Gia Đức Trung** | Xác nhận Mac mini bật và truy cập được · ZeroTier lên trên **cả** máy tính và điện thoại · toàn bộ phép đo `E1`–`E9`, `E12` trên đường cellular + overlay thật |
| **Vũ Hùng Anh** | Bộ canonical geometry fixture `tests/fixtures/geometry/**` — **quyền quyết format là của bạn** · đo `B5` `B10` `B11` trên máy thật · review PR #13 · PR nhỏ thêm dòng `Reviewer:` vào `PRACTICE_VU_HUNG_ANH.md` |

**Dụng cụ đã dựng sẵn không làm giảm việc của ai — nó chỉ bỏ bớt phần dựng khung.** Việc còn lại là chạy,
đọc số, và ký tên mình dưới con số đó.

---

## 6 · Luật từ Day 3 — ba điều, ngắn để nhớ được

| # | Luật | Gốc |
|---:|---|---|
| **1** | **Khai báo khả dụng trước 09:00 mỗi ngày.** Một dòng là đủ: hôm nay tôi có mấy tiếng. "Hôm nay tôi bận cả ngày" là câu trả lời hợp lệ và hữu ích | `15` §5 — `Member availability/capacity for the day` là trường bắt buộc |
| **2** | **Blocker báo ngay khi gặp, không để tới cuối ngày.** Bị kẹt không phải lỗi; giấu chuyện bị kẹt mới là | `15` §13 — *"escalate blockers rather than hiding them until EOD"* |
| **3** | **Một ngày không có commit thì phải nói tại sao.** Im lặng bị đọc là không có tiến độ, vì không có cách nào khác để đọc nó | `15` §13 End of day · `DAY_LOG.md` |

**Và một điều cho leader:** kế hoạch ngày không được lập trên giả định bốn người có mặt khi chưa ai xác
nhận. Đó là lý do luật 1 tồn tại.

---

## 7 · Vì sao biên bản này công khai

Bảng theo dõi của dự án nằm trên GitHub Pages công khai, và leader quyết định biên bản này hiện ở đó.

Nó được viết để chịu được việc đọc công khai: **chỉ có timestamp, số event, và điều khoản đặc tả.** Không
suy đoán lý do vắng mặt của ai — vì Project Control không biết, và không ghi thứ mình không biết vào bản
ghi. Ai bận vì lý do gì là chuyện của người đó; cái dự án cần chỉ là **được biết trước**.

---

**Liên quan:** [`../DAY_LOG.md`](../DAY_LOG.md) · [`../day02/DAY02_EOD_REVIEW.md`](../day02/DAY02_EOD_REVIEW.md) ·
[`../day01/DAY01_CUTOVER_RECORD.md`](../day01/DAY01_CUTOVER_RECORD.md) ·
[`../readiness/OPEN_DECISIONS.md`](../readiness/OPEN_DECISIONS.md) · [`../PROJECT_STATE.yaml`](../PROJECT_STATE.yaml)
