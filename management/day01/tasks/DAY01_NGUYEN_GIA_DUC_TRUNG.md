# DAY 01 — NGUYỄN GIA ĐỨC TRUNG

> # 🔴 VIỆC ĐẦU TIÊN CỦA BẠN HÔM NAY KHÔNG PHẢI SPIKE E
>
> **Bạn đang chặn ba cột `B · Git Workflow`:** của Bế Quốc Khánh, của chính bạn, và gián tiếp cả tổng hợp
> 4/4 của nhóm. Cả đội không tuyên bố được Execution Day 1 cho tới khi phần Day-0 của bạn xong.
>
> **Làm ①–③ bên dưới trước.** Việc Spike E chạy song song **sau khi** ba việc đó đã bắt đầu.

**Trạng thái:** `PHASE A` · `READY: NO` · Spike E **chưa** `ACTIVE`, `started_at` = `null`.

---

## PHẦN I — NỢ DAY 0 · LÀM NGAY

### ① Điền file practice của bạn

File đã có sẵn trong repo, chỉ cần thay 6 chỗ `TODO` **bằng lời của chính bạn**, không chép từ brief:

```
management/onboarding/practice/PRACTICE_NGUYEN_GIA_DUC_TRUNG.md
```

Bảy field bắt buộc — danh sách đầy đủ ở
[`../../onboarding/practice/README.md`](../../onboarding/practice/README.md):

1. Role · 2. Mobile vertical (V4) · 3. Technical block · 4. Current spike · 5. Spikes I review, in
priority order · 6. Xung đột giữa hai file spec đóng băng — leo thang cho ai và phải mở cái gì ·
**7. `Reviewer:`** ← field này **không** in sẵn trong stub, đừng quên

### ② Nhánh → commit → push → PR

```powershell
cd <đường-dẫn-repo>
git switch main
git pull --ff-only origin main
git switch -c chore/practice-duc-trung
# sửa file ở bước ①, LƯU LẠI
git status --short          # phải thấy: M management/onboarding/practice/PRACTICE_NGUYEN_GIA_DUC_TRUNG.md
git add management/onboarding/practice/PRACTICE_NGUYEN_GIA_DUC_TRUNG.md
git commit -m "chore(practice): PRACTICE-01 add role summary"
git push -u origin chore/practice-duc-trung
gh pr create --base main --title "chore(practice): PRACTICE-01 add role summary" --body "Day-0 Git drill. Practice file only - diff stays inside management/onboarding/practice/. Reviewer @qkhanhbe."
```

> `git status --short` **phải** hiện dòng `M …`. Không thấy nghĩa là file chưa lưu — đừng chạy tiếp.

### ③ Review PR #4 của Bế Quốc Khánh — trung thực

```powershell
gh pr diff 4 --name-only    # kiểm biên: chỉ được nằm trong management/onboarding/practice/
gh pr view 4
```

Rồi quyết định thật:

| Tình huống | Làm gì |
|---|---|
| File đủ 7 field, nội dung hợp lý, diff đúng biên | **`gh pr review 4 --approve -b "APPROVE: du 7 field, diff nam trong practice/"`** |
| Có **lỗi thật** — thiếu field, sai vai trò, diff ra ngoài `practice/` | `gh pr review 4 --request-changes -b "NEEDS_FIX: <nêu đúng lỗi>"` |

> **Đừng đi tìm lỗi cho bằng được.** Luật đã đổi: reviewer **chỉ** từ chối khi có lỗi thật; PR đúng thì
> approve thẳng và đó là một lượt drill **hoàn chỉnh**. **Cấm cấy lỗi**, cấm push vào nhánh của Khánh.
> Toàn văn tu chính: [`../../onboarding/DAY0_SIGNOFF.md`](../../onboarding/DAY0_SIGNOFF.md) §0.

### ④ Nhận review của Khánh, sửa nếu có lỗi thật, rồi merge

Khánh review PR của bạn. Nếu bạn ấy nêu lỗi thật thì sửa và push tiếp; nếu bạn ấy approve thẳng thì cũng
hợp lệ. Sau khi approved:

```powershell
gh pr merge <số-PR-của-bạn> --squash --delete-branch
```

**Xong ①–④ là cột `B` và `I` của bạn đóng được, và Khánh cũng gỡ được nút thắt.**

---

## PHẦN II — SPIKE E · CHUẨN BỊ TRƯỚC CUTOVER

Chạy song song **sau khi** ①–③ đã bắt đầu. Phần này **không cần điện thoại**, nên làm được trong lúc
Tuấn Anh giữ máy.

**Nhánh:** `spike/SPIKE_E`

### Được làm, nhưng phải dán nhãn

Dựng **Mac mini M2 backend stub** · cài và cấu hình **ZeroTier** trên **cả** Mac mini và điện thoại ·
kiểm Mac mini bật được và truy cập được · debug kết nối nếu cần · cài tooling backend · đọc kỹ
[`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md), đặc biệt **luật đo** và
**scope firewall**.

Mọi lần chạy kết nối trong giai đoạn này ghi kèm nhãn, **ngay lúc capture**:

```
PREP / DIAGNOSTIC ONLY — NOT ACCEPTANCE EVIDENCE
```

### Trước cutover KHÔNG được

Ghi con số latency / throughput **chính thức** · tính bất kỳ phép đo nào vào tiêu chí E · ghi `started_at`
· nói Spike E đang `ACTIVE`.

> ⚠ **Chỗ dễ trượt nhất của bạn.** ZeroTier vừa kết nối thì phản xạ tự nhiên là chạy ngay một cái ping
> hoặc speed test. **Xác nhận tới được là dừng.** Con số nào ghi lại ở giai đoạn này đều phải mang nhãn
> prep và **bị loại trừ đích danh** khỏi acceptance dataset.

---

## PHẦN III — SPIKE E · SAU CUTOVER

| # | Việc | Cổng | Output |
|---:|---|---|---|
| 1 | Nhận máy khi Tuấn Anh nhả (bạn là **GATE 2**, thứ 2 trong hàng `A → E → B`) | **vào chỉ khi** stub đã tới được **và** overlay đã lên | — |
| 2 | Xác minh điện thoại tới được stub qua **cellular thật** | 1 | bản ghi reachability |
| 3 | Đo **phân bố** latency theo từng strategy | 2 | phân bố, không phải một số |
| 4 | Ghi **direct vs relayed** cho **mọi** phép đo | 3 | bảng |
| 5 | Nhả máy cho Hùng Anh | 4 xong | bàn giao |

**Chưa đủ điều kiện vào GATE 2 thì đừng nhận máy** — nó sẽ nhảy sang người kế và bạn xếp lại hàng.

### Acceptance criteria — trích `SPIKE_E_TRANSPORT/TASK.md`

| # | Phải chứng minh |
|---:|---|
| **E1** | **Mọi phép đo acceptance thực hiện trên cellular thật + overlay.** Lần chạy LAN chỉ được xuất hiện nếu **dán nhãn diagnostic only** |
| E2–E3 | Thời gian tới slice MRI dùng được khi mở case nguội · latency slice chưa cache, theo từng strategy |
| E4 | Hành vi điều hướng liên tục với prefetch, đối chiếu **`NFR-PERF-001` p95 200 ms** |
| E5–E7 | Chi phí transport mask/overlay · mesh theo từng mức decimation · memory footprint theo strategy |
| **E8** | **Báo cáo độ tản của latency, không chỉ median** — hành vi dưới biến động cellular thường gặp |
| E9 | Hành vi reconnect/retry cho kịch bản demo canonical |
| E10 | **Đề xuất ngân sách first-load** có mục tiêu đo được, đủ để thành NFR + acceptance test qua `00` §13 |
| E11 | Bộ artifact fallback tối thiểu, kèm kích thước trên máy |
| **E12** | **Ghi direct hay relayed cho MỌI phép đo** |
| E13 | Đề xuất strategy cho `ADR-ART-001`, kèm đánh đổi |

> **`E1` là luật cứng.** Một ngân sách đo trên LAN sẽ đánh giá thấp latency, jitter và biến động, và **vô
> hiệu** với buổi demo thật. Venue Wi-Fi **không tin cậy và không cần thiết** (DR-003). `RISK-DEMO-NET-01`
> tồn tại đúng vì môi trường demo là cellular bị tranh chấp.

### Evidence phải commit

Bản ghi reachability · **phân bố** latency dạng CSV/JSON · bảng direct-vs-relayed · cấu hình stub và
overlay · bản ghi lệnh. Trường không đo được ghi **`NOT MEASURED — <lý do>`**.

### Reviewer

**Phạm Tuấn Anh** — hàng đợi vị trí **2**, sau Spike B.

### Spike E KHÔNG được

Dùng **LAN hay Wi-Fi trường** làm acceptance evidence · báo **một cái ping** thay cho phân bố · gộp **hai
hợp đồng ingestion** (DR-004) làm một · nới **scope firewall** trên fallback · mang số kết nối trước
cutover vào acceptance · chuyển Spike E sang `ACTIVE` (chỉ Project Control làm, sau cutover) · tạo
`RESULT.md` khi chưa có bằng chứng thật.

### Chuyển bước khi

**①–④ của Phần I xong.** Đó là điều kiện quan trọng nhất trong packet này.

---

**Liên quan:** [`../DAY01_RUNBOOK.md`](../DAY01_RUNBOOK.md) · [`../DAY01_STATUS.md`](../DAY01_STATUS.md) ·
[`../../spikes/SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../../spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md`](../../spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md)
· [`../../onboarding/member_briefs/NGUYEN_GIA_DUC_TRUNG.md`](../../onboarding/member_briefs/NGUYEN_GIA_DUC_TRUNG.md)
