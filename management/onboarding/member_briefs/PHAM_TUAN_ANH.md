# MEMBER BRIEF — PHẠM TUẤN ANH

**Vai trò:**

| # | Vai trò |
|---:|---|
| 1 | **Team Leader** |
| 2 | **V1 Case Explorer / 2D MRI — Primary Owner** |
| 3 | **Integration / CI / Cross-contract coordination — Primary Owner** |
| 4 | **Spike A — Primary Owner** |
| 5 | **Spike B — Secondary Reviewer** |
| 6 | **Spike E — Secondary Reviewer** |

> ### ⚠ Làm leader KHÔNG có nghĩa là làm việc thay người khác
>
> `14` §8: *"Leader sở hữu **kết quả tích hợp** và các quyết định phân bổ, **không phải từng dòng code**. Primary reviewer xử lý review kỹ thuật thường lệ; leader trực tiếp review critical-path, kiến trúc, giao thức khoa học, scope, và thay đổi milestone."*
>
> `14` §8 nói thêm: *"Leader **không nên** trở thành người review duy nhất cho mọi PR."*
>
> **Anti-bottleneck rule là ràng buộc (DR-013 ✅):** KHÔNG chuyển ownership Backend khỏi Nguyễn Gia Đức Trung, cũng không chuyển ML khỏi Bế Quốc Khánh, vì lý do tốc độ ngắn hạn. `15` §18 Level 2 **ghép cặp** — giữ ownership; **chuyển giao** thì phá ownership **và** phá chuỗi bằng chứng `TC-TEAM-001` của họ.

---

## 1 · Tôi sở hữu gì

### V1 — Case Explorer / 2D MRI (mobile vertical)

Điều hướng slice · overlay và opacity · zoom/pan · tích hợp API liên quan · giữ viewer đồng bộ với case/run đang active.

**Requirement chính:** `PR-MRI-01` · `PR-PRED-01` · `FR-MRI-001`…`007` · `FR-MASK-001`/`003`/`005` · `SCR-03`
**Test sẽ kiểm:** `TC-MRI-001`/`002`/`003` · `TC-MASK-001`/`003` · `TC-PERF-001`

### Integration / CI / Cross-contract coordination (technical block)

Giữ `main` xanh và tích hợp được · CI · phát hiện xung đột file integration-sensitive · đảm bảo backend và mobile khớp cùng một hợp đồng.

**Requirement chính:** `NFR-MAINT-001`/`002`/`003` · `09` §12 · `11` §11
**Test sẽ kiểm:** `TC-MAINT-001` · `TC-MAINT-002` · `TC-MAINT-003` · `TC-E2E-001`

### Spike A — 2D scientific viewer / brush interaction

Chi tiết ở §Spike A bên dưới.

---

## 2 · Vị trí của tôi trong hệ thống end-to-end

```text
Backend API ──► [ TÔI: V1 2D viewer · slice · overlay · brush primitive ] ──► người dùng
                                    │
                                    └──► V4 Review (Đức Trung) tiêu thụ brush primitive

Toàn tuyến ──► [ TÔI: Integration / CI / cross-contract ] ──► cả nhóm
```

**Tôi ở cuối chuỗi dữ liệu** — mọi thứ ML/geometry/backend tạo ra đều hiện ra trên viewer của tôi. Nghĩa là **tôi phát hiện lỗi hợp đồng của người khác sớm nhất**, và đó là một phần việc của tôi.

---

## 3 · Đầu vào tôi nhận

| Từ ai | Cái gì |
|---|---|
| **Nguyễn Gia Đức Trung** (Backend) | API endpoint: slice MRI, slice prediction, geometry, metric, review |
| **Vũ Hùng Anh** (Geometry) | **Bộ canonical geometry fixture** — `tests/fixtures/geometry/**`. Tôi **tiêu thụ**, anh ấy **sở hữu** |
| **Bế Quốc Khánh** (ML/Metrics) | Giá trị metric để hiển thị trong SCR-03 |
| Spec đóng băng | `PR-MRI-01`, `FR-MRI-*`, `FR-MASK-*`, `10` SCR-03, `NFR-PERF-001`/`003` |

---

## 4 · Đầu ra tôi tạo

| Cái gì | Cho ai |
|---|---|
| Màn hình 2D viewer chạy được (slice, overlay, zoom/pan, brush primitive) | Người dùng · V4 review của Đức Trung dựng trên brush primitive |
| **Bằng chứng Spike A** — `RESULT.md` với số đo trên thiết bị thật | `GATE-MOB-01` (cùng Spike B) · `TECH_STACK_ADR.md` |
| **Profile thiết bị DR-006** đã chụp từ máy | **Tiền đề cho CẢ Spike A, B VÀ E** |
| **Dung sai brush-mapping đề xuất** kèm bằng chứng | Hợp đồng geometry (spec **không** quy định giá trị này) |
| `main` xanh, CI hoạt động, hợp đồng khớp | Cả nhóm |
| Kế hoạch/trạng thái dự án, EOD, xử lý blocker | Cả nhóm + spec owner |

---

## 5 · Ai tiêu thụ đầu ra của tôi

- **Nguyễn Gia Đức Trung** — V4 review/correction UI dựng **trực tiếp** trên brush primitive của tôi.
- **Vũ Hùng Anh** — 3D view của anh ấy đồng bộ với slice đang active trong viewer của tôi (`FR-3D-004`, `FR-3D-006`).
- **Bế Quốc Khánh** — cohort UI của anh ấy nhảy vào case explorer của tôi (`FR-EXP-006`).
- **`GATE-MOB-01`** — cần bằng chứng Spike A **và** Spike B.
- **Cả nhóm** — profile thiết bị của tôi là tiền đề cho mọi phép đo.

---

## 6 · Requirement / test / gate quan trọng nhất với tôi

| Loại | ID |
|---|---|
| **Hiệu năng** | **`NFR-PERF-001`** — slice đã cache **p95 ≤ 200 ms** trong test 30 bước, **không** transfer full-volume mỗi gesture · **`NFR-PERF-003`** — phản hồi nét **≤ 100 ms**, **0** nét committed bị mất |
| **Độ chính xác toạ độ** | **`FR-MRI-005`** · **`FR-REV-011`** · `07` §8 invariant 2 và 3 |
| **Gesture** | `NFR-USAB-002` — gesture sửa không được vô tình gây điều hướng · `10` §5 |
| **Tích hợp** | `NFR-MAINT-002` · **`TC-MAINT-002`** — backend và mobile **cùng pass một bộ fixture** |
| **Gate** | **`GATE-MOB-01`** / `DR-G05` — **KHÔNG được đóng trước khi có bằng chứng cả Spike A và Spike B** |
| **E2E** | `TC-E2E-001` · `TC-USAB-005` — **5 lần smoke liên tiếp** trên thiết bị đã khai báo |

---

## 7 · File / module tôi làm việc quanh đó

**Trong Spike Phase:**

```text
spikes/spike_a_2d/**                        harness tạm - KHÔNG phải production code
management/spikes/SPIKE_A_2D/RESULT.md      chỉ khi có bằng chứng thật
management/spikes/SPIKE_PHASE_STATE.yaml    tôi là chủ file này (CHAT A - Project Control)
management/onboarding/**                    bộ onboarding
```

**Tiêu thụ, KHÔNG sở hữu:**

```text
tests/fixtures/geometry/**    ← Vũ Hùng Anh sở hữu (integration-sensitive, 15 §9)
```

**Sau này** — mobile module V1, cấu hình CI, shared contract. Chưa tồn tại; **không tạo module production trong phase này**.

---

## 8 · Tôi được TỰ quyết những gì

| Được |
|---|
| Cấu trúc nội bộ harness Spike A |
| Chọn fixture tổng hợp nào dùng trong harness của tôi |
| Cách bố trí instrumentation đo |
| Cách tổ chức nội bộ code viewer V1 (trong biên đã cho) |
| Lịch trình hằng ngày, thứ tự task, phân bổ — **với lý do ghi lại** |
| Cách trình bày kế hoạch/trạng thái, miễn đủ trường `15` §5 và §15 |

---

## 9 · Tôi KHÔNG được quyết ngầm

| Không được | Phải qua |
|---|---|
| **Chọn/đóng băng mobile framework** | `GATE-MOB-01` — cần bằng chứng Spike A **và** B |
| **Đổi quy ước toạ độ canonical** | DR-008a đã đóng băng — cần DR |
| **Nới dung sai brush-mapping** để "cho pass" | Phải báo cáo phân bố sai số thật và **đề xuất** dung sai |
| **Nới `NFR-PERF-001` / `NFR-PERF-003`** | Cần DR |
| Đổi API contract, metric semantics, geometry semantics, domain model, acceptance criteria | `00` §13 → DR |
| **Chuyển ownership khỏi Quốc Khánh hay Đức Trung vì tốc độ** | Anti-bottleneck rule — chỉ recovery có ghi lý do |
| **Đổi MUST scope** | Decision Request hình thức + cập nhật spec |
| Đổi phân công reviewer để né xung đột lịch | `WIP-CONFLICT-01` đã giải quyết bằng **tuần tự hoá**, không phải đổi người |

> **`17` §15:** leader nên **từ chối/sửa** bất kỳ output nào của Claude mà: che blocker bằng phần trăm · phân công song song chồng file/module · bỏ reviewer/test · đổi MUST scope ngầm · làm yếu tính hợp lệ khoa học vì tiện lịch · coi raw prediction và reviewed mask là cùng một artifact · giả định có GT khi không có · dồn tích hợp về tuần cuối · không có đường recovery khi forecast trượt.

---

## 10 · Bằng chứng tôi phải tạo

### Spike A — chi tiết

**Thiết bị:** **Samsung Galaxy A17 5G**, máy thật. **Emulator KHÔNG chấp nhận** cho A9/A10.
**Slot đo:** **1 / 3** — tôi đo **trước**, rồi Hùng Anh (B), rồi Đức Trung (E).

#### Bước 0 — profile thiết bị DR-006 (tiền đề của cả ba spike dùng máy)

Chụp **từ chính máy**, **không suy diễn** bất cứ thông số nào:

```text
model identifier · Android version + build · RAM/performance profile
CPU info từ tooling · GPU info từ tooling · resolution + refresh
exact test configuration (build type, thermal, power mode, background load,
                          brightness, throttling observed)
```

#### Bước 1–12 — acceptance criteria (đầy đủ ở `../spikes/SPIKE_A_2D/TASK.md`)

| # | Phải chứng minh | Ràng buộc |
|---:|---|---|
| A1 | Slice render đúng, hiện `n / total` | khớp fixture |
| A2 | Zoom/pan **không** đổi geometry của source mask | **checksum source mask không đổi** |
| A3 | Brush **ADD** chỉ sửa pixel đúng ý | chính xác so fixture |
| A4 | Brush **ERASE** chỉ sửa pixel đúng ý | chính xác so fixture |
| **A5** | **Brush mapping đúng pixel SAU zoom và pan** | **báo cáo phân bố sai số + đề xuất dung sai** |
| A6 | **Undo** tái lập trạng thái trước | chính xác |
| A7 | **Redo** tái lập trạng thái đã undo | chính xác |
| A8 | **Save/reload** tái lập đúng các nét sửa | chính xác |
| **A9** | **Slice-switch đã cache**, test 30 bước | **p95 ≤ 200 ms**; **không** full-volume transfer mỗi gesture |
| **A10** | **Phản hồi brush** | **≤ 100 ms**; **0** nét committed bị mất |
| A11 | Tách gesture sửa vs điều hướng, kịch bản scripted | **0** lần sửa ngoài ý |
| A12 | Ghi nhận chi phí phát triển mỗi framework ứng viên | định tính, cho `09` §7 |

**A5 là câu hỏi phân biệt.** Một framework render đẹp mà **không** map được touch về đúng pixel source sau transform là **không dùng được**, bất kể tốc độ phát triển.

**Lưu ý về A5:** spec đóng băng **không** đặt dung sai pixel cho brush mapping (khác với luật ±1 slice của SCQ-06 cho picking 3D). **Vì vậy spike này phải báo cáo phân bố sai số quan sát được và ĐỀ XUẤT một dung sai** — nó thành đầu vào cho hợp đồng geometry. **Đừng âm thầm cho là "gần đủ".**

### Bằng chứng KHÔNG được bịa

> **Claude không được tạo:** độ trễ slice-switch · độ trễ phản hồi brush · frame rate · số nét bị mất · memory trên máy · hành vi nhiệt · độ chính xác touch · kết quả xung đột gesture · bất kỳ thông số phần cứng nào.
>
> **Mọi phép đo trên máy do CHÍNH TÔI thực hiện.**
>
> Claude **được** dựng harness, sinh fixture, viết conformance test và instrumentation, chuẩn bị template, và **phân tích số liệu tôi cung cấp**.

### Trường không đo được

Ghi **`NOT MEASURED — <lý do>`**. Đó là trung thực và được chấp nhận. **Bịa một giá trị hợp lý thì không.**

---

## 11 · Ai review tôi

| Việc của tôi | Reviewer |
|---|---|
| **Spike A** | **Vũ Hùng Anh** — ưu tiên **2**, sau Spike D (P0) trong hàng đợi của anh ấy |
| V1 2D vertical | **Vũ Hùng Anh** |
| Integration / CI | **Vũ Hùng Anh** |

### Tôi review ai

| Spike | Ưu tiên trong hàng đợi của tôi |
|---|---|
| **Spike B** (Vũ Hùng Anh) | **1** — B là P1, nạp trực tiếp `GATE-MOB-01` + DR-008c |
| **Spike E** (Nguyễn Gia Đức Trung) | **2** — E là P2 |
| Spike F (sau này) | 3 |

**Luật tuần tự hoá:** tôi giữ tối đa **MỘT** review ở `REVIEWING`. Cái thứ hai giữ `QUEUED_FOR_REVIEW`. Nếu Spike E sẵn sàng mà Spike B chưa, tôi **được** review E — nhưng khi B sẵn sàng, **B lấy slot kế tiếp**.

**Là reviewer tôi phải làm được** (`14` §5): tự giải thích khối đó độc lập · review thiết kế · review PR và bằng chứng · **chạy lại hoặc tái tạo luồng quan trọng** · **giúp debug khi Primary bị chặn**.

---

## 12 · Hành động đầu tiên của tôi trên Execution Day 1 (2026-09-10)

```text
1.  Tuyên bố Execution Day 1 bắt đầu.
2.  Đặt Spike A → ACTIVE trong SPIKE_PHASE_STATE.yaml, ghi started_at THẬT.
    (Xác nhận 3 người còn lại cũng làm cho spike của mình.)
3.  CHỤP PROFILE THIẾT BỊ DR-006 từ Galaxy A17 5G.
        ← đây là việc đầu tiên thực chất, vì nó là tiền đề cho CẢ A, B VÀ E
4.  Bắt đầu dựng harness Spike A với fixture tổng hợp.
5.  Xác nhận với Vũ Hùng Anh về format bộ geometry fixture trước khi phụ thuộc vào nó.
```

**Không lùi ngày `started_at`.** Đồng hồ trigger DR-001 của Spike D bắt đầu hôm nay.

---

## 13 · Tôi cần biết gì về việc của người khác

| Người | Tôi cần biết vì |
|---|---|
| **Vũ Hùng Anh** | Tôi **review Spike B** → phải hiểu quy ước canonical, bộ fixture, luật picking ±1 slice, frontier decimation. Tôi cũng **tiêu thụ** bộ fixture của anh ấy trong Spike A |
| **Nguyễn Gia Đức Trung** | Tôi **review Spike E** → phải hiểu topology cellular+overlay, vì sao LAN không hợp lệ làm bằng chứng, hai hợp đồng ingestion. V4 review của anh ấy dựng trên brush primitive của tôi |
| **Bế Quốc Khánh** | Metric của anh ấy hiện trong SCR-03 của tôi; cohort UI nhảy vào case explorer của tôi. Trigger DR-001 của anh ấy là mục blocker nóng nhất Day 1 |

**Là leader, thêm:** `RISK-CAP-01` là **về chính tôi**. Tôi đồng thời gánh Leader + V1 + Integration/CI + 2 review. Availability khai báo là **8 h/ngày gross** — và `4 × 8h = 32h/ngày` **không** phải năng lực phát triển tính năng. **Tôi phải dành riêng thời gian** cho Project Control, phối hợp tích hợp, review, xử lý EOD, điều phối Claude, xử lý blocker, phối hợp cross-contract — **trừ ra trước** khi nhận task hiện thực. **Chưa có con số năng lực hiệu dụng nào được tính; tôi phải tự đặt và ghi lại.**

---

## 14 · Cách leo thang blocker

**Tôi là điểm đến của mọi leo thang.** Nhưng tôi cũng cần leo thang:

| Loại | Đi đâu |
|---|---|
| Mâu thuẫn giữa hai file spec đã đóng băng | **DỪNG** và mở **Decision Request** — `00` §12 cấm đoán file nào thắng |
| Cần đổi thứ đã đóng băng | **Decision Request** → spec owner |
| Vấn đề khoa học/dataset/metric | **CHAT C — ML/Imaging Research**, rồi DR nếu cần |
| Vấn đề kiến trúc/hợp đồng | **CHAT B — Technical Architect** |
| Phản biện trước khi ACCEPTED | **CHAT E — QA/Red Team** |
| Trạng thái/kế hoạch/blocker | **CHAT A — Project Control** (tôi vận hành) |

**`17` §16:** định tuyến Claude chat là hệ thống điều khiển **của riêng leader**. Thành viên **không** cần duy trì context Claude — **tôi** dịch output đã accepted thành task packet cho họ.

**Trigger recovery (`15` §18)** — kích hoạt **trước khi** Day 30 thành bất khả thi: forecast vượt Day 30 · buffer xuống dưới ngưỡng · một blocker critical-path sống qua 2 vòng EOD không có giải pháp đáng tin · canonical smoke fail lặp lại sau merge accepted · một gate khoa học bắt buộc còn mở ở ngày bắt đầu an toàn cuối cùng.

---

## Nhắc lại ranh giới Day 0 (2026-09-09)

Hôm nay: **KHÔNG** đặt spike sang `ACTIVE` · **KHÔNG** `RESULT.md` · **KHÔNG** đo trên máy · **KHÔNG** tải dataset như công việc Spike D. Chỉ đọc, thảo luận, cài tooling, drill Git, và hoàn thành cửa onboarding.
