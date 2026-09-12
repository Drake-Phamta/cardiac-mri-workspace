# DAY 03 — END OF DAY REVIEW

| Mục | Giá trị |
|---|---|
| **Ngày** | 2026-09-12 (Day 3 / 30) |
| **Ghi bởi** | Project Control (leader vận hành) |
| **Artifact bắt buộc bởi** | `15` §15 — 18 trường, đối chiếu ở §10 |
| **Màu trạng thái** | 🔴 **RED** — xem §12 |
| **Kết quả ngày** | **TRƯỢT** theo đúng luật đã viết trước, xem §1 |

---

## 1 · Kết quả ngày — trượt theo đúng luật của chính mình

`DAY_LOG.md` đặt ba điều kiện **từ đầu ngày**, kèm câu: *"Không đủ ba thì ngày này tính là trượt,
bất kể làm được gì khác."*

| # | Điều kiện | Ai | Kết quả |
|---|---|---|---|
| 1 | `DATASET_AUDIT.md` + `dataset_manifest.json` land trên `main`, **do Khánh commit** | Bế Quốc Khánh | ❌ **KHÔNG ĐẠT** — cả hai file không tồn tại |
| 2 | Chạy stub trên Mac mini → cổng 8787 mở | Nguyễn Gia Đức Trung | ❌ **KHÔNG ĐẠT** — cổng đóng lúc 16:20 và lại lúc 23:05 |
| 3 | 6 PR đang treo có review thật | cả ba | ⚠ **1/6** — Trung review PR #16 |

**Hai trên ba không đạt. Day 3 trượt.** Ghi đúng như vậy, không làm tròn lên.

---

## 2 · `started_at` từng spike

| Spike | Chủ sở hữu | Status | `started_at` | `evidence_present` |
|---|---|---|---|---|
| `SPIKE_D` **P0** | Bế Quốc Khánh | `ACTIVE` | 2026-09-11T12:00+07 | **`false`** — **ngày thứ 4** |
| `SPIKE_A` | Phạm Tuấn Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` *(`RESULT.md` có, còn trên nhánh PR #13)* |
| `SPIKE_B` | Vũ Hùng Anh | `ACTIVE` | 2026-09-11T12:00+07 | `false` |
| `SPIKE_E` | Nguyễn Gia Đức Trung | `ACTIVE` | 2026-09-11T12:00+07 | `false` |
| `SPIKE_C0` | Bế Quốc Khánh | `PREPARED` | `null` | `false` |
| `SPIKE_C1` | Bế Quốc Khánh | **`BLOCKED`** `[SPIKE_D]` | `null` | `false` |
| `SPIKE_F` | Vũ Hùng Anh | `PREPARED` | `null` | `false` |

**`ACCEPTED = 0`.** Không spike nào đi được bước 1 của quy trình bốn bước.

---

## 3 · Việc đã land trong ngày

| Ai | Artifact | Bằng chứng | Loại |
|---|---|---|---|
| **Nguyễn Gia Đức Trung** | **Review PR #16** — `CHANGES_REQUESTED` 16:54 → `APPROVED` 17:10 | API review | **review thật** |
| **Nguyễn Gia Đức Trung** | `03147e3` fix(spike-e) — 141 dòng / 6 file, sửa cả ba phát hiện của chính mình | commit | **code thật** |
| Phạm Tuấn Anh | `DR-006a` revision 1 — sửa lỗi nhầm kênh điều khiển với đường dữ liệu | `91bd052` | quản trị |
| Phạm Tuấn Anh | Bảng sinh tự động từ state file + kho lưu trữ theo ngày | `888c4e1` | dụng cụ |
| Phạm Tuấn Anh | Đo chặng overlay: 100 ping, p50 29 ms, **max 235 ms**, mất 0% | `day03/` | **DIAGNOSTIC** |
| Phạm Tuấn Anh | **4 lỗi trong dụng cụ Spike D** — `--root` sai, BOM, licence bịa, `A17` không quét sidecar | `3bf2a80` | dụng cụ |
| Project Control | 9 mục state hygiene | `2ba21cc` | quản trị |
| Project Control | Merge PR #16 | `6a36909` | tích hợp |

### ⚠ Về hai commit của Trung — ghi, không bỏ qua

`b400c0d` và `03147e3` đi **thẳng vào nhánh của leader**. Repo cấm đúng việc này:

> `15` §191 — *"parallel members do not commit into each other's feature branches"*
> `practice/README.md:63` — *"Never push into another member's branch to create or fix a finding"*

Đây **chính xác** là luật đã viện dẫn khi **leader** push vào nhánh Vũ Hùng Anh ở PR #1. Và
`APPROVED` của cậu ấy xác nhận **commit do chính cậu ấy viết** — nửa sau là tự review.

**Không hoàn tác.** Nội dung tốt, ba phát hiện đều đúng, và **một trong số đó luồng review đối kháng
đã bỏ sót**. Đây là lần đầu một thành viên thực sự tham gia vào công việc thật. Nhưng ghi lại, theo
đúng khuôn `commit_hygiene_note` đã dùng cho lỗi của chính leader.

---

## 4 · Bốn lỗi chặn Khánh — tìm và sửa tối nay

Khánh quay lại, copy lệnh trong README, và **hỏng hai lần trước khi làm được gì**:

| # | Lỗi | Hậu quả |
|---|---|---|
| 1 | `--root` chỉ vào `.../2018_UTAH_MICCAI` — **thư mục không tồn tại** | `exit 2` ngay lệnh đầu |
| 2 | `acquisition.json` có **UTF-8 BOM** (PowerShell `Out-File`), `json.load` từ chối | traceback ở lệnh thứ hai |
| 3 | README dạy `LICENSE_TERMS.txt` — **gói không có file licence nào** | dạy chủ sở hữu bịa một đường dẫn |
| 4 | `A17` **không quét sidecar**, dù `TASK.md:130` đòi *"headers **or sidecars**"* | `desktop.ini` và `lawall.nrrd` (154 case) vô hình |

**Đã sửa và kiểm bằng cách chạy thật trên gói 154 case** — chạy trọn vẹn, và `A17` mới **bắt được
`desktop.ini` thật** trong `CASE_0097`.

> **Lần chạy đó KHÔNG ghi gì.** Không `--write-manifest`, không `--write-audit`, không
> `DATASET_AUDIT.md`, không `data/manifests/`. `TASK.md:196` gắn 16 tiêu chí đó **đích danh Bế Quốc
> Khánh**, và ngoại lệ cho phép thay thế đã **hết hiệu lực lúc 00:00 hôm nay** (`INC-001` §4.5).

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

Không có. Chưa tiêu chí nghiệm thu nào được chạy tới mức có thể âm.

---

## 6 · Blocker

| Trạng thái | Blocker | Ai gỡ được |
|---|---|---|
| **Mở, ngày 4** | `SPIKE_D` audit — gói và dụng cụ **đều sẵn trên đĩa** | **chỉ Khánh** (`TASK.md:196`) |
| **Mở** | Đĩa trống + thư viện NRRD trên máy Khánh | **chỉ Khánh** |
| **Mở** | Khai báo compute `C0-1` | **chỉ Khánh** |
| **Mở** | Bộ canonical geometry fixture — chặn Spike A và F | **chỉ Hùng Anh** (DR-013) |
| **Mở** | Review PR #13 *(33 giờ)* và #15 | **chỉ Hùng Anh** — leader là tác giả |
| **Mở** | Stub trên Mac mini → `GATE 2` | **chỉ Trung** |
| **Mở** | ZeroTier trên điện thoại | **chỉ Trung** |
| Đã đóng | 4 lỗi chặn trong dụng cụ Spike D | Project Control, `3bf2a80` |

> **Mọi blocker còn mở đều là dữ kiện hoặc phán đoán của một người cụ thể. Không cái nào leader gỡ
> hộ được** — và ngoại lệ cho phép thử đã hết hạn sáng nay.

---

## 7 · Review — hàng đợi

| PR | Nhánh | Reviewer | Tuổi | Review submit |
|---|---|---|---:|---|
| **#13** | `spike/SPIKE_A` | Vũ Hùng Anh | **33 giờ** | **0** |
| #14 | `tools/spike-d-validation` | Bế Quốc Khánh | 24 giờ | 0 |
| #15 | `spike-b/...` | Vũ Hùng Anh | 24 giờ | 0 |
| ~~#16~~ | ~~`spike-e/...`~~ | Trung | — | ✅ **2 review** → **merged** |
| #17 | `spike-c0/compute-probe` | Bế Quốc Khánh | 23 giờ | 0 |
| #18 | `chore/ci-guardrails` | **không ai** | 23 giờ | 0 |

**Cả sáu PR đều do leader viết, nên anh không approve được cái nào** — GitHub cấm tự approve, và
`SPIKE_PHASE_PLAN.md` bước 2 đòi reviewer khác người với owner.

> `15` §7: *"If review capacity is unavailable, Project Control must treat that as a **planning
> constraint** rather than allowing a large queue of unreviewed 'done' work."* **Bốn PR chưa review
> chính là hàng đợi đó**, và nó đã tồn tại sang ngày thứ hai.

**PR #18 không có reviewer nào được gán** — tự nó đã là vi phạm `15` §2.8. **Không tự merge**: PR
#1, #3, #5 đã merge không có `APPROVED` và `R2` vẫn chưa thoả vì thế.

---

## 8 · 📱 Galaxy A17 5G

| | |
|---|---|
| Người giữ | Phạm Tuấn Anh — máy cá nhân, **không bàn giao** (DR-006a) |
| Dùng hôm nay | không có phép đo nào |
| Profile DR-006 | ✅ đã chụp, §9 **đã ký** 00:25, **đã phản chiếu vào state file tối nay** |
| ZeroTier trên máy | ❌ **chưa cài** — xác minh: ping Mac mini mất 100%, không interface, không route |
| Client HTTP trên máy | ❌ **không có Python, Termux, curl hay wget** — chỉ `toybox` và `sh` |

> ⚠ **Hai khoảng trống mới phát hiện tối nay, cả hai đều chặn phần đo của Spike E.**
> Harness Spike E viết bằng Python và `docstring` ghi *"runs on the Galaxy A17"* — **máy không chạy
> được nó**. Và `DR-006a` revision 1 ban đầu viết sai rằng không cần ZeroTier trên điện thoại nữa;
> đã đính chính cùng ngày.

---

## 9 · Kiểm invariant cuối ngày

| # | Invariant | Kết quả |
|---:|---|---|
| 1 | Spec đóng băng `19/19 OK` | ✅ |
| 2 | 0 commit chạm `docs/specs/v1.0/` | ✅ |
| 3 | `ACCEPTED = 0` | ✅ |
| 4 | `evidence_present: true` ở đâu đó | ✅ **0** |
| 5 | `SPIKE_C1` vẫn `BLOCKED [SPIKE_D]` | ✅ |
| 6 | `SPIKE_C0.started_at` vẫn `null` | ✅ |
| 7 | 0 dataset byte trong git | ✅ |
| 8 | `DATASET_AUDIT.md` / `data/manifests/` **không tồn tại** | ✅ *(cố ý)* |
| 9 | `tests/fixtures/geometry/**` không bị ai khác ghi vào | ✅ |
| 10 | Không `TECH_STACK_ADR.md`, không `ADR-ML-001` | ✅ |
| 11 | Mọi commit hôm nay: tác giả thật | ✅ Drake-Phamta 20, Trung 2 |
| 12 | Không review nào submit dưới tài khoản người khác | ✅ |

---

## 10 · `15` §15 — 18 trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 3 điều kiện + 8 ưu tiên mang từ Day 2 |
| **Accepted** | **0** |
| Needs-fix | 1 *(PR #16, đã giải quyết và approve)* |
| Blocked | 7 blocker mở, §6 |
| **Critical-path status** | **ĐỨNG YÊN** — `SPIKE_D` ngày thứ 4, `evidence_present: false` |
| Integration status | `main` xanh; `ci_configured: false`; `branch_protection: false` |
| Tests passed/failed | không có test suite dự án; selftest dụng cụ đạt |
| Requirement completion | **0 / 39** `ACCEPTED` |
| **New/changed risks** | 4 lỗi chặn trong dụng cụ Spike D *(đã sửa)* · **không có Python trên điện thoại** — mới · `recovery.active` sai một ngày |
| **Technical debt introduced** | không mới. Nợ cũ: không `.github/` trên `main`, không branch protection, `PRACTICE_VU_HUNG_ANH.md` thiếu `Reviewer:` |
| Actual vs baseline | **chậm 3 ngày** so với baseline |
| **Proposed corrective actions** | §11 *(trường này `DAY02` thiếu)* |
| Next-day priorities | §13 |
| **MUST / SHOULD accepted** | **MUST 0/28 · SHOULD 0/6 · COULD 0/5** |
| **Critical-path blocker age** | **4 ngày** *(`SPIKE_D` từ 2026-09-09)* |
| **Remaining buffer** | **1 → 0** khi ngày này đóng |
| Open PR age | 4 PR chưa review, cũ nhất **33 giờ** |
| Canonical smoke | `NOT_RUN` — chưa có gì để chạy |

---

## 11 · Recovery — `15` §18 · trigger đã nổ, quyết định để leader

**Có kích hoạt trigger không?** ☑ **CÓ — hai cái cùng lúc.**

| Trigger | Trạng thái |
|---|---|
| **3** · *blocker critical-path sống qua hai chu kỳ EOD* | **ĐÃ NỔ từ Day 2**, giờ sống qua **chu kỳ thứ ba** |
| **2** · *buffer xuống dưới ngưỡng an toàn* | **NỔ khi ngày này đóng** — buffer 1 → 0 |

> ⚠ **Khoảng trống quản trị:** `MASTER_PLAN` đặt buffer *"≥2 ngày"* nhưng **không đâu định nghĩa
> ngưỡng an toàn bằng số**. Trigger 2 đang viết dựa trên một ngưỡng không tồn tại. Ghi ra thay vì
> bịa một con số.

### Đã chuẩn bị cho Level 5 — và một kết luận khó chịu

`15` §414: de-scope là **"explicit leader decision"**. Project Control **không tự tuyên bố**.

**5 yêu cầu `COULD`:** `PR-MODEL-EXTRA-01` · `PR-COLLAB-01` · `PR-ANN-ADV-01` ·
`PR-STUDY-CREATE-01` · `PR-EXP-SCHED-01`

**6 yêu cầu `SHOULD`:** `PR-AN-01` · `PR-COMP-01` · `PR-METRIC-01` · `PR-REVAN-01` ·
`PR-FILTER-01` · `PR-CACHE-01`

> ### 🔴 Level 5 gần như không mua được gì, và đó mới là điều đáng lo
>
> `03_PRODUCT_REQUIREMENTS_PRD.md` §3.1 nói thẳng về cả 11 mục này:
>
> > *"They are **not** part of the critical-path acceptance floor unless promoted through Decision
> > Request."*
>
> **Đóng băng chúng không giải phóng ngày nào**, vì chưa ai từng lên lịch cho chúng. Sàn nghiệm thu
> là **28 yêu cầu `MUST`**, và `15` §414 nói `MUST` chỉ de-scope được qua Decision Request **kèm
> sửa spec đóng băng**.
>
> **Nghĩa là vấn đề của dự án này không phải phạm vi.** Thang recovery năm mức được thiết kế cho
> một nhóm làm việc mà chậm. Ở đây ba trên bốn người **không hoạt động** — và `INC-001` §4.1 đã ghi
> rằng **không mức nào trong năm mức điều chỉnh được tình huống đó**:
>
> > *"Tình huống 'ba trên bốn thành viên vắng' **không có điều khoản nào trong `14` điều chỉnh**."*

### Hành động khắc phục đề xuất — leader quyết

1. **Trước hết là liên lạc, không phải de-scope.** Ba ngày dữ liệu cho thấy vấn đề là khả dụng.
   Luật *"khai báo khả dụng trước 09:00"* ra đời từ `INC-001` và **chưa ai thực hiện, kể cả để nói
   là bận**.
2. **Nếu năng lực thật là một người rưỡi, hãy lập lại kế hoạch 30 ngày trên con số đó** — chứ không
   trên `4 × 8h` của điều kiện `C8`. Đó là việc thật, và nó trung thực hơn de-scope một thứ chưa ai
   lên lịch.
3. **Gán reviewer cho PR #18**, rồi merge có review. CI guardrails đã chứng minh biết báo đỏ.
4. **De-scope `COULD` chỉ khi muốn dọn bảng cho gọn** — ghi rõ nó **không** mua thêm thời gian.

---

## 12 · Màu trạng thái — 🔴 RED

`15` §16 định nghĩa **RED** là *"critical path blocked … or current forecast exceeds deadline
without an approved recovery plan."*

Day 2 để **AMBER** vì bế tắc là bên ngoài và có đường gỡ. **Hôm nay không còn lý do đó.** Gói dữ
liệu đã về, dụng cụ đã dựng và đã sửa, Mac mini đã tới được, và critical path **vẫn đứng yên** sang
ngày thứ tư. Buffer về 0 và **chưa có recovery plan nào được duyệt**.

> `15` §16 cũng ghi: *"Task-count completion alone cannot determine Green/Amber/Red status."*
> Đêm nay có nhiều việc hoàn thành, và màu vẫn là đỏ — vì **không việc nào trong số đó là tiêu chí
> nghiệm thu**, và không việc nào tôi làm được thay cho ba người.

---

## 13 · Ưu tiên Day 4

| # | Việc | Ai |
|---:|---|---|
| 1 | **Khai báo khả dụng trước 09:00** — một dòng. *"Hôm nay tôi bận"* là câu trả lời hợp lệ | **cả bốn** |
| 2 | Chạy validator → manifest + `DATASET_AUDIT.md`, **commit dưới tài khoản của bạn**. Lệnh giờ chạy được | Khánh |
| 3 | Verdict `A11` `A13` `A18` + mapping `A10` + provenance `A12` — mỗi cái dẫn file và giá trị cụ thể | Khánh |
| 4 | **Chạy stub trên Mac mini** → cổng 8787 → `GATE 2` mở. Không cần điện thoại | Trung |
| 5 | Nhận / sửa / thay bộ geometry fixture + **công bố format** | Hùng Anh |
| 6 | **Review PR #13** *(33 giờ)* và #15 | Hùng Anh |
| 7 | Review PR #14 và #17 — dụng cụ dựng cho chính bạn | Khánh |
| 8 | Gán reviewer cho PR #18, rồi merge có review | leader + một người |
| 9 | **Quyết recovery** — xem §11, gồm cả kết luận rằng de-scope không mua thêm ngày | leader |
| 10 | Cài ZeroTier + một HTTP client lên Galaxy A17 *(quyết định của leader — máy cá nhân)* | leader |

---

**Liên quan:** [`../DAY_LOG.md`](../DAY_LOG.md) ·
[`../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md) ·
[`QA_REVIEW_001.md`](QA_REVIEW_001.md) · [`overlay_reachability_20260912.md`](overlay_reachability_20260912.md) ·
[`../day02/DAY02_EOD_REVIEW.md`](../day02/DAY02_EOD_REVIEW.md) · [`../PROJECT_STATE.yaml`](../PROJECT_STATE.yaml)
