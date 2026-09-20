# INC-002 — Day 10 mất phần lớn vì một sự cố của cả nhóm

| Mục | Giá trị |
|---|---|
| **Mã** | INC-002 |
| **Ngày** | 2026-09-19 (Day 10) |
| **Loại** | Gián đoạn ngoài kỹ thuật ảnh hưởng cả nhóm — **không phải hỏng kỹ thuật, không phải bỏ việc** |
| **Ghi bởi** | Project Control, theo chỉ đạo của Phạm Tuấn Anh |
| **Trạng thái** | Ghi ngày 2026-09-20 · luật rút ra có hiệu lực **từ Day 12** |

> **Đây là biên bản quy trình, không phải bản kiểm điểm.** Không một dòng nào ở đây đánh giá con người.
> Mục đích duy nhất: để bản ghi Day 10 đọc đúng về sau, và để lần sau mất ít hơn.

---

## 1 · Sự việc

Day 10 chốt **`TRƯỢT` 1,25/4** ([`day10/DAY10_EOD_REVIEW.md`](../day10/DAY10_EOD_REVIEW.md)). Bản chốt đó
ghi đúng cái quan sát được và **chỉ** cái quan sát được:

| Thành viên | Hoạt động repo trong Day 10 |
|---|---|
| Nguyễn Gia Đức Trung | 6 commit · 3 PR · 1 `APPROVE` · 1 `CHANGES_REQUESTED` |
| Phạm Tuấn Anh | 6 commit (02:12–03:59) · 1 merge · phiên đo `S8` |
| **Vũ Hùng Anh** | **0 commit · 0 review · 0 comment** — commit cuối 18/09 15:12 |
| **Bế Quốc Khánh** | **0 commit · 0 review · 0 comment** — commit cuối 18/09 11:44 |

Bản chốt viết: *"Hai trên bốn thành viên không chạm vào repo… Đây là phát hiện quan trọng nhất của Day 10
và nó **không phải vấn đề kỹ thuật**."* Nó **không** suy đoán lý do, vì lúc đó Project Control không biết
lý do, và `INC-001` §7 đặt luật: *"không ghi thứ mình không biết vào bản ghi."*

**Ngày 2026-09-20, trưởng nhóm cho biết: cả nhóm gặp một sự cố trong ngày hôm đó.** Biên bản này ghi nhận
điều đó. Chi tiết của sự cố không được ghi ở đây — nó không cần thiết cho việc điều hành và không phải
thứ bản ghi công khai cần nắm.

---

## 2 · Verdict Day 10 **không** được sửa, và vì sao

`TRƯỢT 1,25/4` giữ nguyên. Ba lý do:

1. **Verdict đo kết quả, không đo nỗ lực.** Bốn điều kiện đặt ra để mở khoá mốc; hai cái không mở. Đổi
   verdict vì nguyên nhân là chính đáng sẽ làm mọi verdict khác mất nghĩa.
2. **Buffer là thứ có thật.** Ngày mất vẫn ăn vào buffer (**−2 → −3**) dù lý do là gì. `DAY_LOG` ghi
   *"Ngày mất ăn vào buffer, không đẩy hạn"* từ Day 1.
3. **`15` §18 đã nổ bằng số, không bằng cảm tính** — buffer dưới ngưỡng, blocker đường găng sống qua hai
   chu kỳ EOD, 10/30 ngày hết với `MUST` 0/33.

**Cái được thêm là NGUYÊN NHÂN**, ghi vào `day_10_verdict_basis` của `PROJECT_STATE.yaml` và trỏ tới biên
bản này. Người đọc sau sẽ thấy *"trượt vì một sự cố của cả nhóm"*, chứ không thấy *"hai người bỏ việc"* —
và đó là hai câu chuyện rất khác nhau về cùng một tập dữ liệu.

---

## 3 · Tác động — đo được

| Thứ | Con số |
|---|---|
| PR CI xanh nằm chờ hết ngày | **5** (#48, #49, #50, #51, #52) |
| Lượt duyệt đáng ra mở khoá chúng | **2** |
| PR merge trong ngày | **1** (#31) |
| M3 đóng muộn | **1 ngày** — Trung `APPROVED` #47 lúc 21:40 *trong ngày*, merge 20/09 17:18 *ngoài ngày* |
| `GATE-SPLIT-01` đứng yên | sang **ngày thứ 4** |
| Buffer | **−2 → −3** |

**Điều đáng chú ý nhất:** Day 10 là ngày có **nhiều tiến bộ kỹ thuật nhất** từ đầu dự án — `app/` ra đời,
Spike A từ 8/12 lên 11/12 tiêu chí `OBSERVED`, generator khớp hợp đồng ngay lần đầu. Và **gần như không gì
lên được `main`**. Mất mát không nằm ở công việc; nó nằm ở **đường dẫn công việc tới `main`**.

---

## 4 · Cái này khác `INC-001` ở chỗ nào

`INC-001` (Day 2) là **vắng mặt không báo**: ba người 0 event, không ai biết vì sao, và bài học là *khai
báo khả dụng*.

`INC-002` là **một sự cố có thật, ảnh hưởng cả nhóm**. Khác biệt quan trọng cho việc điều hành:

| | INC-001 | INC-002 |
|---|---|---|
| Nguyên nhân | không rõ tại thời điểm ghi | sự cố của cả nhóm, trưởng nhóm xác nhận |
| Việc đã làm xong | hầu như không có | **rất nhiều** — chỉ không lên được `main` |
| Sửa gì thì hết | khai báo khả dụng | **rút ngắn đường từ "xong" tới `main`** |

Nên bài học của `INC-002` **không** phải "làm nhiều hơn". Nó là: **một ngày mất không được phép giữ năm PR
đã xong làm con tin.**

---

## 5 · Recovery — đã kích hoạt, mức áp dụng là quyết định của leader

`15` §18 nổ **3/5** điều kiện (ghi trong `PROJECT_STATE.yaml` `recovery.triggered_2026_09_20`). Ngày
2026-09-20 trưởng nhóm cho phép **Mức 1 — điều chuyển**, có điều kiện:

- **Chỉ chuyển lượt DUYỆT, không chuyển QUYỀN SỞ HỮU.** Anti-bottleneck rule của `DR-013` cấm chuyển sở
  hữu *"merely for short-term speed"*; `INC-001` §4.4 đã giữ đúng ranh giới này và biên bản này giữ tiếp.
- **Mỗi lần chuyển phải ghi** vào `SPIKE_PHASE_STATE.yaml` §`review_serialization.reassignments` đủ
  `date / spike / from / to / reason / basis`, với `reason` là **recovery Mức 1**, không phải *"cho nhanh"*.
  `SPIKE_PHASE_STATE.yaml` §`commit_hygiene_note`: chuyển mà không ghi lý do thì **chính việc đó là một
  defect**.
- **Hỏi trước khi chuyển.** Điều này được ghi vào `PROJECT_STATE.yaml` như một tiền đề, và nó đã được thực
  hiện: trưởng nhóm cho biết nguyên nhân trước khi bất kỳ lượt điều chuyển nào xảy ra.

---

## 6 · Luật từ Day 12 — hai điều, ngắn để nhớ được

| # | Luật | Gốc |
|---:|---|---|
| **1** | **Mọi PR mở phải có người duyệt được gắn ngay lúc mở.** Một PR không có reviewer thì không nằm trong hàng đợi của ai — nó chỉ tồn tại trong đầu người mở | Day 9: #47 không có PR nên M3 trượt. Day 10: #41, #50, #51, #52 **không có reviewer nào** cho tới 20/09 17:44 |
| **2** | **Lượt duyệt chặn người khác thì có giờ hạn và người dự phòng, đặt ra ngay từ đầu ngày.** Người dự phòng không phải lời trách — nó là cái phanh để một ngày mất không thành hai | `15` §18 Mức 1 · `INC-002` §3 |

Ba luật của `INC-001` §6 **vẫn còn hiệu lực** và hôm 19/09 không được áp dụng: khai báo khả dụng, blocker
báo ngay, một ngày không commit phải nói tại sao. Chúng không bị thay thế — `INC-002` thêm vào, không trừ đi.

---

## 7 · Vì sao biên bản này công khai

Cùng lý do `INC-001` §7: bản ghi dự án phải đọc được bởi người không có mặt. Một verdict `TRƯỢT` không có
nguyên nhân sẽ bị đọc thành điều tệ nhất có thể — và trong trường hợp này, điều tệ nhất có thể **không
đúng sự thật**. Hai người có 0 hoạt động hôm đó không bỏ việc; cả nhóm gặp sự cố.

Biên bản này cũng không giấu phần còn lại: Project Control **có hai sai sót trong Day 10**, ghi ở
[`SESSION_S8_RECORD.md`](../../spikes/spike_a_2d/EVIDENCE_RAW/SESSION_S8_RECORD.md) — làm hỏng 25 nét tô
của trưởng nhóm vì một APK cũ hơn mã nguồn, và **xoá một tệp khi chưa được xác nhận**, lần thứ hai. Sự cố
của nhóm không xoá những cái đó.

---

**Liên quan:** [`INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](INC-001_DAY2_MEMBER_UNAVAILABILITY.md) ·
[`day10/DAY10_EOD_REVIEW.md`](../day10/DAY10_EOD_REVIEW.md) · [`day11/DAY11_PLAN.md`](../day11/DAY11_PLAN.md) ·
[`PROJECT_STATE.yaml`](../PROJECT_STATE.yaml) · [`DAY_LOG.md`](../DAY_LOG.md)
