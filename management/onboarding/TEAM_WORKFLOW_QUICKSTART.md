# TEAM WORKFLOW QUICKSTART

**Mức:** LEVEL 2 — **MỌI NGƯỜI**
**Mục tiêu:** biết chính xác phải làm gì từ lúc nhận task đến lúc task được `ACCEPTED`

> Đây là hướng dẫn thực dụng, không phải bài luận về quản trị. Nguồn: `15` §5–§15, `13` §5–§6, `17` §3.

---

## 1 · VÒNG ĐỜI MỘT TASK

```text
  Accepted task packet          ← leader phát, có requirement ID + acceptance criteria
        │
        ▼
  branch                        ← nhánh ngắn từ main mới nhất
        │
        ▼
  implementation
        │
        ▼
  local tests                   ← chạy TRƯỚC khi mở PR
        │
        ▼
  evidence                      ← số đo/log/screenshot thật
        │
        ▼
  PR                            ← mở SỚM đủ để review kịp trong ngày
        │
        ▼
  reviewer                      ← Secondary Reviewer đã định trước
        │
        ├──► NEEDS_FIX ────────┐
        │                      │  sửa rồi quay lại reviewer
        │    ◄─────────────────┘
        │
        └──► APPROVE
                │
                ▼
        QA Red Team (CHAT E)    ← bắt buộc với spike & việc rủi ro cao
                │
                ├──► REJECT ───► KHÔNG ACCEPTED (bất kể owner/reviewer nghĩ gì)
                │
                └──► PASS
                        │
                        ▼
                Project Control (CHAT A)
                        │
                        ▼
                    ACCEPTED     ← chỉ trạng thái này mới tính vào tiến độ
```

**MUST KNOW:** `15` §12 — *"Implementation complete" không phải trạng thái cuối. Chỉ công việc `ACCEPTED` được tính vào tiến độ dự án* (`NFR-AUDIT-002`).

---

## 2 · LUẬT GIT

| # | Luật | Nguồn |
|---:|---|---|
| 1 | **Không push trực tiếp vào `main`.** `main` được bảo vệ | `15` §8 |
| 2 | **Một task → một nhánh ngắn → một PR**, trừ khi được duyệt khác đi | `15` §8 |
| 3 | **Cần ít nhất một reviewer được chỉ định approve** mới merge được | `15` §8 |
| 4 | **Squash merge** là mặc định | `15` §8 |
| 5 | **Cấm force-push vào `main`** | `15` §8 |
| 6 | Title/description của PR đã merge **phải giữ task ID + requirement ID** để audit được | `15` §8 |
| 7 | **Branch từ `main` mới nhất đã accepted**; **sync với `main` mới nhất trước khi merge**, conflict-free, CI-green, test lại | `15` §9 |
| 8 | **Giải quyết conflict trên nhánh feature.** Không bao giờ để conflict trên `main` | `15` §9 |
| 9 | **Một nhánh một chủ.** Không commit vào nhánh feature của người khác trừ khi pair work đã lên kế hoạch | `15` §8 |

### Đặt tên nhánh (`15` §8)

```text
feat/FR-3D-005          tính năng gắn với một FR
fix/FR-REV-011          sửa lỗi gắn với một FR
exp/EXP-D-050           công việc thí nghiệm
spike/SPIKE_D           công việc spike
chore/...               việc phụ trợ
```

### File integration-sensitive — phải phối hợp

`15` §9 đánh dấu các vùng sau: **dependency manifest · shared API schema/types · routing/root navigation · database migration · central config · geometry contract · shared build file**.

> **Chỉ MỘT chủ sở hữu hoạt động trên một vùng integration-sensitive tại một thời điểm**, trừ khi đã phối hợp.
>
> Nếu hai task bất ngờ chạm cùng một file như vậy, **task thứ hai tạm dừng hoặc đổi thứ tự**, trừ khi leader chuyển thành pair work tường minh.

**Ví dụ ngay trong Spike Phase:** `tests/fixtures/geometry/**` là deliverable của **Vũ Hùng Anh** (Spike B) nhưng được **Spike A và Spike F tiêu thụ**. Vũ Hùng Anh công bố format cho Phạm Tuấn Anh **trước khi** Spike A phụ thuộc vào nó.

### CI trở thành cửa cứng khi nào (**SCQ-08**)

> CI là **cửa merge cứng từ lần merge production-code đầu tiên sau khi CI bootstrap được ACCEPTED**. Việc governance/tài liệu **trước** thời điểm đó có thể merge sau **manual review**.

Bộ onboarding này là việc governance, nằm trước cửa đó.

---

## 3 · LUẬT WIP — mỗi người, mỗi thời điểm

```text
✅  TỐI ĐA 1  primary implementation task đang IN_PROGRESS
✅  tuỳ chọn 1  review task
✅  tuỳ chọn 1  preparation task NHỎ (không được biến thành primary thứ hai)
```

`15` §7 cũng nói: **không bắt đầu primary task mới khi task trước còn chờ một sửa nhỏ mà chính bạn có thể đóng.**

### Áp dụng cụ thể trong Spike Phase

| Thành viên | Primary | Preparation nhỏ | Ràng buộc |
|---|---|---|---|
| **Bế Quốc Khánh** | Spike D | Spike C0 | C0 **chỉ** trong thời gian chờ tải/I-O. **Không** được thành primary thứ hai |
| **Vũ Hùng Anh** | Spike B | Spike F (chỉ dựng fixture tổng hợp) | Spike F **implementation** không được thành primary thứ hai |
| **Phạm Tuấn Anh** | Spike A | — | Thêm 2 review (B, E) — **tuần tự hoá**, xem §4 |
| **Nguyễn Gia Đức Trung** | Spike E | — | **Không chờ máy một cách vô ích** — xem §5 |

---

## 4 · TUẦN TỰ HOÁ REVIEW (`WIP-CONFLICT-01` — đã giải quyết)

**Phân công reviewer KHÔNG đổi.** Cửa sổ review được tuần tự hoá.

> **Mỗi người tối đa MỘT review ở trạng thái `REVIEWING`.** Review thứ hai giữ `QUEUED_FOR_REVIEW`.

| Reviewer | Review những gì | Ưu tiên mặc định | Lý do |
|---|---|---|---|
| **Vũ Hùng Anh** | **Spike D**, **Spike A** | **D → A** | Spike D là **P0** |
| **Phạm Tuấn Anh** | **Spike B**, **Spike E** | **B → E** | Spike B là P1 và nạp trực tiếp `GATE-MOB-01` + DR-008c; Spike E là P2 |

### Luật chiếm quyền

Nếu spike ưu tiên thấp `EVIDENCE_READY` mà spike ưu tiên cao **chưa** sẵn sàng → reviewer **được** review cái thấp.
Nhưng khi spike ưu tiên cao trở thành `EVIDENCE_READY` → nó nhận **slot review KẾ TIẾP**.

**Ví dụ:** Spike A sẵn sàng, Spike D chưa → Vũ Hùng Anh review Spike A. Spike D sẵn sàng giữa lúc đó → review Spike A **không bị ngắt**, nhưng Spike D lấy slot tiếp theo và **không** phải xếp sau bất kỳ thứ gì khác.

> **KHÔNG đổi quyền reviewer chỉ để né xung đột lịch.**

### Năm trạng thái review — khác với trạng thái thực thi spike

```text
NOT_REQUESTED  →  QUEUED_FOR_REVIEW  →  REVIEWING  →  APPROVED
                                                   └─►  NEEDS_FIX  → về owner
```

---

## 5 · TUẦN TỰ HOÁ THIẾT BỊ (`WIP-CONFLICT-02` — đã giải quyết)

**Dự án có ĐÚNG MỘT máy Samsung Galaxy A17 5G được cấp phép.**

| Loại việc | Có song song được? |
|---|---|
| Dựng harness / code / fixture / instrumentation | **CÓ — song song hoàn toàn** |
| **Cửa sổ ĐO trên máy thật** | **KHÔNG — không được chồng nhau** |

```text
Thứ tự ĐO đã đặt trước:
   1.  Spike A   (Phạm Tuấn Anh)
   2.  Spike B   (Vũ Hùng Anh)
   3.  Spike E   (Nguyễn Gia Đức Trung)
```

**Việc chạy song song trong lúc người khác giữ máy:**

- **Vũ Hùng Anh** — dựng harness và bộ canonical geometry fixture trong lúc Spike A đang chuẩn bị **hoặc đang đo**.
- **Nguyễn Gia Đức Trung** — **tuyệt đối không ngồi chờ**: dựng Mac mini backend stub · xác minh kết nối Tailscale/overlay · tạo payload artifact đại diện · transport instrumentation · logging phân bố độ trễ · harness retry/reconnect · script và template đo.

**Spike E vẫn PHẢI đo nghiệm thu trên đường thật:**

```text
Galaxy A17 5G → cellular 4G/5G thật → Tailscale overlay xác thực → Mac mini M2 24 GB
```

**Kết quả LAN chỉ là diagnostic — KHÔNG BAO GIỜ là bằng chứng nghiệm thu.**

---

## 6 · BẰNG CHỨNG VÀ TRUNG THỰC

| # | Luật |
|---:|---|
| 1 | **`RESULT.md` tồn tại ≠ `ACCEPTED`.** Cần đủ 4 bước ở §1 |
| 2 | **Bằng chứng thất bại KHÔNG BAO GIỜ được che.** `15` §23 cấm hoãn test đang fail bằng cách gắn nhãn "known limitation" khi nó vi phạm một tiêu chí nghiệm thu MUST |
| 3 | **Ca thất bại KHÔNG được âm thầm loại.** `08` §8.1: mỗi ca thất bại ghi kèm lý do; kết quả tổng hợp báo **cả N dự kiến và N thành công**. Một mô hình không được trông tốt hơn chỉ vì các ca nó fail đã biến mất khỏi mẫu số |
| 4 | **Trường không đo được → ghi `NOT MEASURED — <lý do>`.** Đó là trung thực và được chấp nhận. **Bịa một giá trị hợp lý thì không** |
| 5 | **Kết quả âm (`NEGATIVE_RESULT`) là kết quả hợp lệ và có giá trị.** Không được biến nó thành pass bằng cách nới ràng buộc |
| 6 | **Không âm thầm đổi quyết định đã đóng băng.** Phải qua DR/gate (`00` §13) |
| 7 | **Báo blocker SỚM**, đừng giấu tới cuối ngày (`15` §13) |

---

## 7 · KHI NÀO PHẢI DÙNG DECISION REQUEST

Nếu việc hiện thực của bạn **đòi** đổi bất cứ thứ nào sau đây thì **DỪNG và báo leader** — đừng tự quyết:

frozen product requirement · dataset protocol · split protocol · ML protocol · **metric semantics** · **geometry semantics** · domain-model semantics · **API contract** · deployment policy · **acceptance criteria**

Quy trình (`00` §13):

```text
Problem → Decision Request → impact analysis → leader/spec-owner approval
        → specification update → implementation
```

**Quyền Primary Owner KHÔNG cho phép đổi ngầm những mục trên** (DR-013 ✅).

---

## 8 · BÁO CÁO CUỐI NGÀY (EOD)

Mỗi người gửi, mỗi ngày (`15` §13):

| Mục | Nội dung |
|---|---|
| **Task / Spike ID** | ví dụ `SPIKE_D`, `D03-T02` |
| **Trạng thái hiện tại** | `PREPARED` / `ACTIVE` / `EVIDENCE_READY` / `NEEDS_FIX` / `BLOCKED` / `ACCEPTED` |
| **Commit** | hash chính xác đã test |
| **PR** | link, và tuổi PR nếu đang chờ review |
| **Tests** | pass/fail — số thật, không phải "chạy ổn" |
| **Evidence** | đường dẫn tới log/số đo/screenshot |
| **Effort thực tế vs dự kiến** | thô, để hiệu chỉnh kế hoạch — **không phải để đánh giá cá nhân** (`15` §23) |
| **Blocker** | có/không, và bị chặn bởi cái gì |
| **Dependency** | cần gì từ ai để làm tiếp mai |
| **Next action** | việc tiếp theo cụ thể |

---

## 9 · KẾT QUẢ REVIEW — ba giá trị

`15` §11: reviewer trả về **đúng một** trong ba:

| Kết quả | Nghĩa |
|---|---|
| **`APPROVE`** | Đạt |
| **`NEEDS_FIX`** | Có vấn đề cụ thể, owner sửa rồi quay lại |
| **`BLOCKED / DECISION_REQUIRED`** | Cần quyết định của leader hoặc một DR |

> **Im lặng KHÔNG phải approve.**

Reviewer kiểm: khớp requirement · biên kiến trúc · dễ đọc/bảo trì · xử lý lỗi · tests · privacy/security · ảnh hưởng tích hợp · nợ kỹ thuật phát sinh.

---

## 10 · ĐIỀU KIỆN ĐỂ MỘT SPIKE ĐƯỢC `ACCEPTED`

Đủ **tất cả**:

1. `RESULT.md` tồn tại với **số đo hoặc inventory THẬT**, do **chính chủ sở hữu người thật** ghi.
2. Profile môi trường/thiết bị đã điền — **không còn `[UNVERIFIED]`** ở các trường mà kết quả phụ thuộc vào.
3. **Mọi** acceptance criterion trong `TASK.md` được trả lời pass/fail tường minh.
4. **Ràng buộc đã đóng băng được tôn trọng, không bị nới lỏng.**
5. **Secondary Reviewer** đã `APPROVE`.
6. **CHAT E — QA / Red Team** đã thử phản biện và cho **`PASS`**. Với các gate dựa trên bằng chứng — **Spike D, B, F** — QA phải **soi bằng chứng thực tế**, không chỉ verdict tóm tắt.
7. **CHAT A — Project Control** thực hiện chuyển trạng thái cuối.

---

## 11 · ĐỊNH TUYẾN CLAUDE CHAT (`17` §3–§4)

**Chỉ leader vận hành các Claude chat** (`17` §16). Thành viên nhận task packet từ leader, không cần tự duy trì context Claude.

| Việc | Chat |
|---|---|
| Kế hoạch, trạng thái, blocker, critical path, EOD | **CHAT A — Project Control** |
| Kiến trúc, ADR, hợp đồng, tích hợp | **CHAT B — Technical Architect** |
| Dataset, ML, preprocessing, metric, geometry khoa học | **CHAT C — ML / Imaging Research** |
| Thay đổi repo theo task đã duyệt | **CHAT D — Implementation** |
| Phản biện độc lập trước khi ACCEPTED | **CHAT E — QA / Red Team** |

| Spike | Chat dẫn |
|---|---|
| **D** | CHAT C |
| **A** | CHAT D |
| **B** | CHAT D |
| **C0 / C1** | CHAT C |
| **E** | CHAT B |
| **F** | CHAT C |

---

## 12 · CHECKLIST DÁN CẠNH MÀN HÌNH

```text
□  Branch từ main mới nhất?
□  Đúng 1 primary task đang làm?
□  Task có requirement ID + acceptance criteria rõ?
□  Có chạm file integration-sensitive? → đã phối hợp chưa?
□  Test local đã chạy?
□  Evidence là số THẬT, không phải phỏng đoán?
□  Trường không đo được đã ghi NOT MEASURED + lý do?
□  Ràng buộc đóng băng có bị nới để "cho pass" không?  → PHẢI LÀ KHÔNG
□  PR mở đủ sớm để review kịp trong ngày?
□  Có cần đổi thứ gì đã đóng băng?  → DỪNG, báo leader, mở DR
□  EOD report đủ 10 mục?
```
