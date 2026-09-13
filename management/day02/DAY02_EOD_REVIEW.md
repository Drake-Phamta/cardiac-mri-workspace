# DAY 02 — END OF DAY REVIEW

| | |
|---|---|
| **Ngày** | 2026-09-11 · **ngày execution đầu tiên** (cutover 12:00 +07:00) |
| **Ghi bởi** | Project Control, theo chỉ đạo của Phạm Tuấn Anh |
| **Artifact bắt buộc bởi** | `15` §15 — đây là bản EOD review **đầu tiên được điền** của dự án |
| **Màu trạng thái** | 🟠 **AMBER** — xem §12 |
| **Sự kiện kèm theo** | [`INC-001`](../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md) |

---

## 1 · Cutover

| Mục | Giá trị |
|---|---|
| Tuyên bố lúc | **2026-09-11 12:00:00 +07:00** |
| Bản ghi | [`../day01/DAY01_CUTOVER_RECORD.md`](../day01/DAY01_CUTOVER_RECORD.md) |
| `main` tại thời điểm cutover | `9cc1f55` |
| Đồng hồ DR-001 | **đang chạy** từ 12:00 |
| Bốn tu chính có hiệu lực | §D.3 một người ghi central state · thứ tự thiết bị `A → E → B` · bỏ NEEDS_FIX dàn dựng · hàng đợi review theo sự kiện |

---

## 2 · `started_at` từng spike

| Spike | Chủ sở hữu | `status` | `started_at` | `evidence_present` |
|---|---|---|---|---|
| **SPIKE_D** | Bế Quốc Khánh | `ACTIVE` | 2026-09-11T12:00+07:00 | **false** |
| **SPIKE_A** | Phạm Tuấn Anh | `ACTIVE` | 2026-09-11T12:00+07:00 | **false** *(RESULT.md nằm trên PR #13 chưa merge)* |
| **SPIKE_B** | Vũ Hùng Anh | `ACTIVE` | 2026-09-11T12:00+07:00 | **false** |
| **SPIKE_E** | Nguyễn Gia Đức Trung | `ACTIVE` | 2026-09-11T12:00+07:00 | **false** |
| SPIKE_C0 | Bế Quốc Khánh | `PREPARED` | `null` | false |
| SPIKE_C1 | Bế Quốc Khánh | `BLOCKED` `[SPIKE_D]` | `null` | false |
| SPIKE_F | Vũ Hùng Anh | `PREPARED` | `null` | false |

**Không spike nào `EVIDENCE_READY`. `ACCEPTED = 0`.**

---

## 3 · Evidence đã land trong ngày

| Ai | Artifact | Bằng chứng | Loại |
|---|---|---|---|
| Phạm Tuấn Anh | **Profile thiết bị DR-006** chụp thật từ Galaxy A17 | `6d0ae77`, `9e1270c` trên `main` | bằng chứng thật |
| Phạm Tuấn Anh | **Spike A `A9` p95 = 65,31 ms** — phép đo hiệu năng đầu tiên của dự án | PR #13, `c9290b0` | bằng chứng thật, **chưa merge** |
| Phạm Tuấn Anh / PC | **Gói dataset LASC 2018 đã thu thập và giải nén** | §4 dưới | bằng chứng thật |
| Project Control | Dụng cụ validate Spike D | PR #14, `96c89f4` | **dụng cụ, không phải bằng chứng** |
| Project Control | Harness Spike B + đề xuất geometry fixture | PR #15, `c3a4719` | **dụng cụ** |
| Project Control | Stub + harness Spike E | PR #16, `a356772` | **dụng cụ** |
| Bế Quốc Khánh | — | — | **không có** |
| Nguyễn Gia Đức Trung | — | — | **không có** |
| Vũ Hùng Anh | — | — | **không có** |

---

## 4 · Trigger DR-001 — **ĐÃ ĐÁNH GIÁ**

> Nguyên văn: *nếu tới **cuối ngày execution đầu tiên**, **không có gói chính thức dùng được trên máy
> cục bộ**, **hoặc** validation gói/provenance lộ **một defect chặn việc nghiệm thu `GATE-DATA-01`** —
> thì **`RA-H01` leo lên BLOCKER** và **quy trình dự phòng dataset mở ra**.*

| Mục | Kết quả |
|---|---|
| Trigger đã được đánh giá? | ☑ **Có** — 2026-09-11 **23:44 +07:00**, trong hạn |
| Có gói chính thức dùng được trên máy cục bộ? | ☑ **CÓ** |
| Validation lộ defect chặn `GATE-DATA-01`? | ☑ **Chưa đủ dữ liệu** — audit đầy đủ là việc của chủ sở hữu |
| **Kết luận** | ☑ **Trigger KHÔNG nổ** |
| Người báo cáo | Project Control, theo chỉ đạo Phạm Tuấn Anh |
| Giờ báo cáo | 2026-09-11 23:44 +07:00 |

### 4.1 · Bằng chứng

| Mục | Giá trị |
|---|---|
| Nguồn chính thức | `https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/` (`06` §1) |
| File | `2018_UTAH_MICCAI.zip` |
| Kích thước | **2 200 962 438 byte** — khớp `Content-Length` |
| **SHA-256** | `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0` |
| Bắt đầu tải | 2026-09-11T23:12:06+07:00 |
| Xong | 2026-09-11T23:41:51+07:00 *(29 phút 45 giây)* |
| Giải nén | `C:\cardiac-data\lasc2018\extracted` — **ngoài repository** (`06` §5) |
| Probe khả dụng | [`dr001_usability_probe.json`](dr001_usability_probe.json) — **12/12 volume load được, tất cả 3D** |
| Case đếm được | **Training Set 100 · Testing Set 54** |

### 4.2 · Ai thu thập, và điều đó KHÔNG đổi quyền sở hữu

Gói do **Phạm Tuấn Anh** thu thập trên máy của anh, là **hành động recovery Level 1** ghi trong
`INC-001`. **Thu thập chuyển giao được; audit thì không.**

`SPIKE_D_DATASET/TASK.md:196`: *"All of the above must be read from the actual downloaded package
**by Bế Quốc Khánh**."* Các tiêu chí **`A2`–`A20` vẫn nguyên vẹn là việc của Khánh**, chạy trên chính
gói này bằng `tools/dataset_validate/`. Cái thay đổi duy nhất là cậu ấy **không còn phải chờ tải**.

### 4.3 · ⚠ Sáu quan sát phụ từ probe — **CHƯA phải câu trả lời tiêu chí**

Probe mở **4 trên 154 case**. Những gì nó thấy được ghi lại đây vì chúng quan trọng, **không** vì
chúng đóng tiêu chí nào. Câu trả lời toàn cohort thuộc về chủ sở hữu.

| # | Quan sát trên 4 case | Liên quan | Vì sao đáng chú ý |
|---|---|---|---|
| 1 | **Kích thước trong mặt phẳng KHÁC NHAU** — thấy cả `576×576×88` và `640×640×88` | `A6` | **Đây là câu hỏi của `A6`, và câu trả lời nghiêng về CÓ.** Hệ quả ở §4.4 |
| 2 | **Testing Set CÓ `laendo.nrrd`** | `A12`, `RA-H02` | Đây đúng là câu hỏi provenance nhãn test. Có file ≠ biết provenance — verdict vẫn của Khánh |
| 3 | **Giá trị mask là `0` và `255`**, không phải `0`/`1` | `A10` | Đúng lý do `06` §9 viết *"recorded rather than assumed"*. Ai code sẵn `==1` sẽ ra mask rỗng |
| 4 | **`lawall.nrrd` tồn tại** trong mọi case đã mở | `06` §2 | `06` §2: file không thuộc nhiệm vụ LA cavity chính thức **không được dùng làm target** khi chưa xác minh provenance |
| 5 | `space directions` là **ma trận đơn vị** `1.0/1.0/1.0` | `A7` | Spacing vật lý thật của LGE MRI không phải 1 mm đẳng hướng. Header có thể **không mang spacing thật** — Khánh phải xác định, và `06` §4 nói **metric thể tích tuyệt đối bị vô hiệu cho tới khi geometry được validate** |
| 6 | `lgemri.nrrd` có dtype **`uint8`** | `A5` | MRI lưu 8-bit. Đáng ghi vì nó ảnh hưởng dải động và chuẩn hoá (DR-011) |

Cả sáu đều **axis-aligned** trên các case đã mở → dấu hiệu tốt cho `A14` / DR-012, **chưa phải kết luận**.

### 4.4 · Hệ quả tức thì cho Spike A — phải ghi ngay

`RESULT.md` của Spike A ghi `A9` p95 = **65,31 ms**, đo trên fixture **64×64**, kèm giới hạn phạm vi
số 1: *"Kích thước slice LGE MRI thật CHƯA BIẾT… `A9` phải đo lại khi `A6` của Spike D có kết quả."*

**Bây giờ đã biết sơ bộ: 576×576 hoặc 640×640.** Tức là **nhiều hơn 81–100 lần số pixel mỗi slice.**

Con số 65,31 ms **không còn là ước lượng có ý nghĩa** cho thiết bị thật ở dữ liệu thật. Nó vẫn là một
phép đo đúng ở kích thước fixture, và giới hạn phạm vi đã viết sẵn — nhưng **việc đo lại giờ là ưu tiên
cao của Spike A**, không còn là việc "khi nào có dữ liệu".

---

## 5 · Kết quả âm (`NEGATIVE_RESULT`)

**Không có.** Không spike nào đạt tới điểm có thể kết luận âm.

---

## 6 · Blocker

| Trạng thái | Blocker | Ai gỡ được |
|---|---|---|
| **ĐÃ ĐÓNG** | Gói dataset chưa có trên máy — chặn bước 1 Spike D | đã tải xong |
| **ĐÃ ĐÓNG** | Không có dụng cụ validate dataset | PR #14 |
| **ĐÃ ĐÓNG** | Bộ geometry fixture chưa tồn tại — chặn Spike A và F | PR #15 (bản đề xuất) |
| **ĐÃ ĐÓNG** | Không có backend stub / harness cho Spike E | PR #16 |
| **MỞ** | **Đĩa trống + thư viện NRRD trên máy Khánh** vẫn `NOT_CHECKED` | **chỉ Bế Quốc Khánh** |
| **MỞ** | **Mac mini bật được + ZeroTier** vẫn `NOT_CHECKED` — **cổng vào GATE 2** | **chỉ Nguyễn Gia Đức Trung** |
| **MỞ** | **Compute ML chưa khai báo** (`C0-1`), `ml_compute.declared: UNVERIFIED` | **chỉ Bế Quốc Khánh** |
| **MỞ** | Hàng đợi review trống — 4 PR mở, **0 review submit** | ba thành viên |
| **MỞ** | `PRACTICE_VU_HUNG_ANH.md` trên `main` vẫn thiếu dòng `Reviewer:` | Vũ Hùng Anh |
| **MỞ** | Cột `B` sign-off của Khánh — chưa review PR thật nào của đồng đội | Bế Quốc Khánh |

**Mọi blocker còn mở đều là dữ kiện của một người cụ thể. Không cái nào leader gỡ hộ được.**

---

## 7 · Review — có kẹt không

| PR | Nhánh | Reviewer | Tuổi | Review đã submit |
|---|---|---|---|---|
| **#13** | `spike/SPIKE_A` | `scalliontor` | **9 giờ** | **0** |
| #14 | `tools/spike-d-validation` | `qkhanhbe` | 1,5 giờ | 0 |
| #15 | `spike-b/harness-and-fixture-proposal` | `scalliontor` | 1,3 giờ | 0 |
| #16 | `spike-e/stub-and-harness` | `TrungNGD195` | 1 giờ | 0 |

**Hàng đợi review hoàn toàn tắc.** `15` §11: *"silence is not approval"*.

Ghi chú thiết kế: PR #14/#15/#16 được gán reviewer là **chính chủ sở hữu spike** mà dụng cụ phục vụ,
chứ không theo ma trận reviewer thông thường. Lý do: ép họ đọc dụng cụ trước khi dùng — đúng `14` §6
*"A block is not considered healthy if only one person can explain/run/debug it."*

---

## 8 · 📱 Galaxy A17 5G — nhật ký thực tế

| Thời điểm | Sự kiện |
|---|---|
| trước cutover | `GATE 0` — cài tooling, mọi capture là `PREP / DIAGNOSTIC ONLY` |
| sau cutover | `GATE 1` Phạm Tuấn Anh — profile DR-006 chụp thật |
| 14:09 | Chạy bài `A9` 30 bước, release build, brightness manual 128, thermal 0 trước và sau |
| cuối ngày | **Máy vẫn ở chỗ Phạm Tuấn Anh** |

**Máy không bàn giao.** Leader tuyên bố đây là **tài sản cá nhân, không rời tay**. Mô hình "một máy một
người giữ, bàn giao theo cổng" của `WIP-CONFLICT-02` **không áp dụng được** với thiết bị không thuộc dự
án, và **chưa có tu chính nào được ghi**.

> **Món nợ quản trị mang sang Day 3.** `GATE 2` của Trung dù sao cũng **chưa mở** (Mac mini + ZeroTier
> chưa xác nhận), nên việc này **không chặn ai hôm nay**. Nhưng nó phải được ghi thành tu chính trước
> khi Trung đủ điều kiện vào cổng, nếu không hàng đợi thiết bị sẽ mâu thuẫn với thực tế.

---

## 9 · Kiểm invariant cuối ngày

| Invariant | Kết quả |
|---|---|
| Spec checksum | **19/19 OK** *(kiểm §13)* |
| Commit chạm `docs/specs/v1.0/**` | **0** |
| `RESULT.md` tồn tại | **1** — chỉ `SPIKE_A_2D`, và nằm trên PR chưa merge |
| `evidence_present: true` | **0** |
| `ACCEPTED` | **0** |
| `SPIKE_C1` | `BLOCKED` `[SPIKE_D]` — **không đổi** |
| `tests/fixtures/geometry/**` | **không tồn tại** — không ai ghi vào deliverable của Hùng Anh |
| `TECH_STACK_ADR.md` · `ADR-ML-001` | **không tồn tại** — framework và ML **chưa chốt** |
| Dataset bytes trong git | **0** — gói nằm ở `C:\cardiac-data\`, ngoài workspace |
| Commit dưới tài khoản người khác | **0** |
| Review submit dưới tài khoản người khác | **0** |

---

## 10 · `15` §15 — các trường bắt buộc

| Trường | Giá trị |
|---|---|
| Planned tasks | 4 gói nhiệm vụ (một mỗi người) |
| **Accepted** | **0** |
| Needs-fix | 0 |
| Blocked | 6 blocker mở, **tất cả** cần dữ kiện của một người cụ thể |
| **MUST accepted / total** | **0 / 28** |
| **SHOULD accepted / total** | **0 / 6** |
| Requirement completion | **0 / 39 accepted** · 39 not_started |
| Critical-path status | `SPIKE_D` **đã có dữ liệu**, chưa có audit. Vẫn là ràng buộc |
| **Critical-path blocker age** | **3 ngày** (Day 0, 1, 2) — `15` §18 trigger 3 **đã thoả** |
| Integration status | `branch_protection: false` · `ci_configured: false` — nợ Integration/CI |
| Tests passed / failed | conformance geometry **32/32** · dataset validator selftest **đạt** · smoke Spike E **98/98**. Tất cả là **test của dụng cụ**, không phải test sản phẩm |
| Canonical smoke | **`NOT_RUN`** — chưa có gì để chạy |
| New / changed risks | `RA-H01` **hạ nhiệt** (gói đã có) · **rủi ro mới**: `A9` của Spike A đo ở 64×64 trong khi thật là 576²/640² · **rủi ro mới**: mask `0/255` phá code giả định `==1` |
| Technical debt introduced | Fixture đề xuất có thể bị vứt · payload Spike E dùng shape placeholder · ViT trong C0 là stand-in, không phải DINOv2 thật |
| **Remaining recovery buffer** | **1 ngày** — không đổi |
| Actual vs baseline | Chậm **2 ngày** so với baseline; Day 30 giữ nguyên `2026-10-09` |
| Open PR age / bottleneck | **4 PR mở, 0 review.** PR #13 đã 9 giờ |

---

## 11 · Recovery — `15` §18

**Có kích hoạt recovery trigger không?** ☑ **CÓ**

- **Trigger 3 đã thoả:** *"a critical-path blocker survives two EOD cycles without credible
  resolution"* — Spike D P0, chủ sở hữu vắng hai ngày liên tiếp.
- **Trigger 2 cận kề:** buffer còn 1 ngày.

Mức áp dụng và lý do: **`INC-001` §4**. Tóm tắt — **Level 1** cho đúng một việc (leader lên critical
path để **thu thập** gói), **Level 5** de-scope kế hoạch Day 2, và phần dựng dụng cụ **không phải
recovery** mà là việc mọi `TASK.md` đã cho phép sẵn. **Quyền sở hữu không chuyển cho ai.**

---

## 12 · Màu trạng thái — 🟠 AMBER

`15` §16: **GREEN** cần forecast vừa deadline với buffer **không âm** và critical path khoẻ. **RED**
cần critical path **bị chặn** hoặc forecast **vượt** deadline mà không có recovery plan được duyệt.

**AMBER** vì cả hai đều không đúng:

- Critical path **không còn bị chặn** — gói dataset đã có, dụng cụ audit đã có. Nhưng nó **chưa nhúc
  nhích**: `evidence_present: false`.
- Buffer **1 ngày, dương** nhưng mỏng. Mất thêm một ngày là 0.
- Có recovery plan, **đã ghi**, và nó **đã giải quyết được blocker bên ngoài duy nhất** (tải dataset).
- Ba trên bốn thành viên **không sản xuất gì sau cutover** — đó là rủi ro năng lực chưa được xử lý, và
  `15` §16 nói *"Task-count completion alone cannot determine Green/Amber/Red status."*

**Không phải RED, vì hôm nay thực sự gỡ được bế tắc bên ngoài lớn nhất và có bằng chứng thật.
Không phải GREEN, vì không một tiêu chí nghiệm thu nào của bất kỳ spike nào được đóng.**

---

## 13 · Ưu tiên Day 3 — sơ bộ

| # | Việc | Ai | Vì sao xếp trước |
|---:|---|---|---|
| 1 | **Chạy `tools/dataset_validate` trên gói, sinh manifest + `DATASET_AUDIT.md`, trả lời `A11` `A13` `A18`** | **Bế Quốc Khánh** | P0 critical path. Gói và dụng cụ đều đã sẵn; còn lại là chạy và ký |
| 2 | **Xác nhận Mac mini + ZeroTier** | Nguyễn Gia Đức Trung | Cổng vào `GATE 2`, và **chỉ cậu ấy đóng được** |
| 3 | **Review 4 PR đang treo** | cả ba | Hàng đợi tắc hoàn toàn; `15` §11 |
| 4 | **Nhận hoặc thay bộ geometry fixture, công bố format** | Vũ Hùng Anh | Mở khoá Spike A và Spike F |
| 5 | **Đo lại `A9` ở 576×576** | Phạm Tuấn Anh | §4.4 — con số hiện tại không còn đại diện |
| 6 | **Khai báo compute ML** (`C0-1`) | Bế Quốc Khánh | `ml_compute.declared` vẫn `UNVERIFIED` |
| 7 | Tu chính hàng đợi thiết bị | Project Control | §8 — nợ quản trị |
| 8 | `.github/workflows/guardrails.yml` | Phạm Tuấn Anh | Nợ Integration/CI từ Day 1 |

Gói nhiệm vụ đầy đủ: [`../day03/tasks/`](../day03/tasks/)

---

**Liên quan:** [`../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md) ·
[`dr001_usability_probe.json`](dr001_usability_probe.json) · [`../DAY_LOG.md`](../DAY_LOG.md) ·
[`../PROJECT_STATE.yaml`](../PROJECT_STATE.yaml) · [`../day01/DAY01_CUTOVER_RECORD.md`](../day01/DAY01_CUTOVER_RECORD.md)
