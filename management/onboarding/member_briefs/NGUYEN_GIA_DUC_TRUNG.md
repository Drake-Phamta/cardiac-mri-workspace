# MEMBER BRIEF — NGUYỄN GIA ĐỨC TRUNG

**Vai trò:**

| # | Vai trò |
|---:|---|
| 1 | **V4 Review / Findings — Primary Owner** |
| 2 | **Backend / Persistence / Raw Dataset Ingestion / Experiment Artifact Ingestion — Primary Owner** |
| 3 | **Spike E — Primary Owner** |

> ### Bạn là Primary Owner thật, không phải người hỗ trợ
>
> **Anti-bottleneck rule là ràng buộc (DR-013 ✅):** ownership Backend **không được** chuyển sang Phạm Tuấn Anh vì lý do tốc độ ngắn hạn. Phạm Tuấn Anh là **reviewer và lưới an toàn** của bạn — dùng anh ấy đúng vai đó.
>
> Khối của bạn cũng gánh **`RISK-INGEST-01`** (HIGH, likelihood **H**) — đường tới hạn thật của demo là **artifact tiền tính toán**, không phải live inference, vì `PR-AN-01` chỉ là SHOULD.

---

## 1 · Tôi sở hữu gì

### V4 — Review / Findings (mobile vertical)

Trạng thái review · lưu trữ brush correction · version `ReviewedMask` · tạo và mở Finding.

**Requirement chính:** `PR-REV-01`/`02` · `PR-PROV-01` · `PR-FIND-01` · `FR-REV-001`…`011` · `FR-FIND-001`…`004` · `SCR-06` · `SCR-08` · `UC-13`…`15`
**Test sẽ kiểm:** `TC-REV-001`…`006` · `TC-FIND-001`/`002` · `TC-REL-002`

### Backend / Persistence / Ingestion (technical block)

Backend API · persistence · **hai hợp đồng ingestion riêng** · artifact store · phân giải đường dẫn/quyền artifact.

**Requirement chính:** `09` §3 (backend responsibilities) · `09` §4 (artifact strategy) · `11` toàn bộ (API contract) · `12` §5–§8
**Test sẽ kiểm:** `TC-EXP-002` · `TC-REL-001`/`002`/`003` · `TC-SEC-001`…`005` · `TC-MOBILE-STATE-001`

### Spike E — artifact transport trên đường demo thật

Chi tiết ở §Spike E bên dưới.

---

## 2 · Vị trí của tôi trong hệ thống end-to-end

```text
Artifact từ ML (Quốc Khánh) ──► [ TÔI: Ingestion — HAI hợp đồng ]
Mesh từ geometry (Hùng Anh) ──►            │
                                            ▼
                              [ TÔI: Backend / Persistence — Mac mini M2 24 GB, ở XA ]
                                            │
                                            │  cellular 4G/5G → Tailscale overlay xác thực
                                            ▼
                              Mobile app  ──► Tuấn Anh (2D) · Hùng Anh (3D)
                                            │
                                            ▼
                              [ TÔI: V4 Review / ReviewedMask / Finding ] ──► persistence
```

**Tôi ở giữa và ở cuối** — mọi artifact đi qua ingestion của tôi để vào backend, và mọi hành động review của người dùng quay về persistence của tôi.

---

## 3 · Đầu vào tôi nhận

| Từ ai | Cái gì |
|---|---|
| **Bế Quốc Khánh** | `dataset_manifest.*` + dataset đã kiểm định (**Contract 1**) · artifact experiment: `Experiment`, `AnalysisRun`, mask, metric (**Contract 2**) |
| **Vũ Hùng Anh** | Mesh `Reconstruction3D` + geometry contract version (**Contract 2**) · quy ước toạ độ canonical mà API của tôi phải trả đúng |
| **Phạm Tuấn Anh** | Brush primitive của V1 mà V4 review của tôi dựng lên; và yêu cầu tích hợp/CI |
| Spec đóng băng | `11` (API contract, 28 endpoint) · `05` (domain model) · `09` §3, §4 · `12` §5–§8 · **DR-003 ✅** · **DR-004 ✅** · **DR-009 ✅** · **SCQ-01**…**SCQ-03** |

---

## 4 · Đầu ra tôi tạo

| Cái gì | Cho ai |
|---|---|
| **Backend API endpoint** theo `11` | Tuấn Anh (2D) · Hùng Anh (3D) · Quốc Khánh (cohort UI) |
| **Hai validator ingestion + hai schema manifest + hai acceptance test** | Quốc Khánh (nạp dữ liệu) · Hùng Anh (nạp mesh) |
| Persistence cho `Review` / `ReviewedMask` / `Finding` | Người dùng · báo cáo |
| **Bằng chứng Spike E** — `RESULT.md` đo trên đường thật | **`ADR-ART-001`** · **ngân sách first-load (RA-H13)** · cơ chế fallback |
| **Ngân sách hiệu năng first-load đề xuất** | Trở thành NFR + acceptance test qua `00` §13 |
| **Tập artifact tối thiểu cho fallback kết nối demo** | Kế hoạch demo |
| V4 review/finding UI chạy được | Người dùng |

---

## 5 · Ai tiêu thụ đầu ra của tôi

- **Phạm Tuấn Anh** — mọi endpoint API của tôi nạp viewer 2D của anh ấy; anh ấy **review Spike E** của tôi.
- **Vũ Hùng Anh** — API của tôi trả geometry và mesh cho 3D view của anh ấy; **API của tôi phải trả đúng quy ước canonical của anh ấy**.
- **Bế Quốc Khánh** — hai validator ingestion của tôi quyết định output của anh ấy có được nhận hay không.
- **`ADR-ART-001`** — bằng chứng Spike E của tôi là đầu vào quyết định.
- **`RA-H13`** — ngân sách first-load của tôi là thứ đóng finding này.

---

## 6 · Requirement / test / gate quan trọng nhất với tôi

| Loại | ID |
|---|---|
| **Bất biến** | **`NFR-REL-001`** — MRI/GT/RawPrediction bất biến sau ingestion · **`FR-REV-009`** — lưu correction **không bao giờ** mutate prediction gốc |
| **Concurrency** | **`11` §2** — ghi cũ phải bị từ chối; **cấm silent last-write-wins** · **`STALE_REVISION`** |
| **Không thay thế ngầm** | **`11` §6** — backend **không được** âm thầm thay processed cho raw · `TC-MASK-004` |
| **Chế độ** | **`PR-MODE-01`** — trả **`GROUND_TRUTH_UNAVAILABLE`**; **không bao giờ** trả mask toàn-0 như thể là reference, **không bao giờ** tổng hợp accuracy bằng 0 |
| **Hiệu năng** | `NFR-PERF-001` (slice cache p95 ≤200 ms) · `NFR-PERF-004` (tạo request async ≤2 s) · **ngân sách first-load hiện CHƯA CÓ — tôi phải đề xuất** |
| **Privacy** | `NFR-SEC-002`/`003`/`004`/**`005`** · `12` §5–§8 · `12` §8.1 acceptance gate |
| **Trạng thái** | `TC-MOBILE-STATE-001` · `10` §8 (loading/empty/processing/error/retry/stale-cache) |

---

## 7 · File / module tôi làm việc quanh đó

**Trong Spike Phase:**

```text
spikes/spike_e_transport/**                        stub + client harness tạm - KHÔNG production
management/spikes/SPIKE_E_TRANSPORT/RESULT.md      chỉ khi có bằng chứng thật
```

**BỊ CẤM trong phase này:**

- Viết `ADR-ART-001` — spike này **cấp bằng chứng** cho nó.
- Đóng băng API contract hay thiết kế artifact store.
- Tạo module production (`backend/`, …).
- **Phơi Mac mini ra công khai** — xem §9.

**Sau này** — backend module, ingestion CLI, persistence schema, V4 module. Chưa tồn tại.

---

## 8 · Tôi được TỰ quyết những gì

| Được |
|---|
| Cấu trúc nội bộ backend stub của Spike E |
| Cách bố trí instrumentation và script tổng hợp |
| Chọn **các chiến lược transport nào để thử** (không phải chọn cái cuối) |
| Payload artifact đại diện dùng trong đo |
| Thiết kế harness retry/reconnect |
| Tổ chức nội bộ code V4 review UI (trong biên đã cho) |
| Chi tiết hiện thực của validator ingestion (miễn phủ đủ check bắt buộc) |

---

## 9 · Tôi KHÔNG được quyết ngầm

| Không được | Phải qua |
|---|---|
| **Dùng số đo LAN làm bằng chứng nghiệm thu Spike E** | **DR-003 ✅ measurement rule** — xem §10 |
| **Chọn chiến lược artifact transport cuối cùng** | **`ADR-ART-001`** — tôi khuyến nghị, Architect/leader quyết |
| **Đóng băng API contract** | `11` §11.4 · cần ADR/DR |
| **Đổi API contract, domain model semantics, metric semantics** | `00` §13 → DR |
| **Thay thế processed cho raw** dù chỉ một lần | `11` §6 — cấm tuyệt đối |
| **Trả mask toàn-0 khi thiếu GT** | `11` §4 — phải trả `GROUND_TRUTH_UNAVAILABLE` |
| **Cho phép silent last-write-wins trên reviewed mask** | `11` §2 — cấm |
| **Mở rộng fallback thành offline mode đầy đủ** | Xem scope firewall §10 |
| **Phơi Mac mini ra public internet** | **DR-003 ✅** — xem bên dưới |

### Nghĩa vụ bảo mật vẫn giữ nguyên (DR-003 ✅)

Profile `LOCAL_DEMO — PRIVATE OVERLAY / CELLULAR ACCESS` **chỉ** miễn phần **xác thực công khai** và **phơi bày công khai**. **Mọi nghĩa vụ khác của `12` vẫn áp dụng và vẫn bị acceptance test kiểm:**

| Nghĩa vụ giữ nguyên | Nguồn |
|---|---|
| Bảo vệ secret; secret **không bao giờ** vào source control | `12` §6 · `NFR-SEC-004` · `TC-SEC-004` |
| **Không nhúng credential vào binary mobile** | `12` §6, §8.1 · `TC-SEC-004` |
| Logging an toàn — **không** dump ảnh/mask thô, **không** credential | `12` §7 · `NFR-SEC-003` · `TC-SEC-003` |
| **Metadata allowlist** cho dataset | `12` §2 · `NFR-SEC-005` · `TC-SEC-005` |
| **Không liệt kê thư mục artifact công khai** | `12` §5, §8.1 |
| **Quy gán ghi / reviewer identity** nơi lưu provenance review | `12` §5 · `05` Review · `FR-REV-010` |
| Hạn chế truy cập — **chỉ thiết bị overlay được cấp phép** | `12` §5 · DR-003 |
| **Backend KHÔNG tới được từ ngoài biên tin cậy** | `12` §8.1 · `TC-SEC-002` |

**Về `TC-SEC-002`:** nó viết *"REMOTE_DEMO uses TLS; LOCAL_DEMO exposure matches its approved trusted-network profile."* Mệnh đề thứ hai là mệnh đề áp dụng, và "approved trusted-network profile" nghĩa là **thành viên overlay**. Nên test phải kiểm backend **không tới được từ một thiết bị NGOÀI overlay, kể cả thiết bị đó đang ở cùng Wi-Fi vật lý.**

**Và `12` §3 vẫn nguyên:** giữ điều khoản license, **không redistribute ngoài phạm vi cho phép**, ghi source/acquisition/checksum. Điều này ràng buộc cách nhóm xử lý gói dữ liệu, bất kể topology triển khai.

---

## 10 · Bằng chứng tôi phải tạo

### SPIKE E — artifact transport

#### Topology canonical — ràng buộc

```text
Samsung Galaxy A17 5G
        │
        │  cellular 4G / 5G THẬT
        ▼
Tailscale private overlay xác thực
        │
        ▼
Mac mini M2, 24 GB RAM      (ở XA địa điểm demo)
```

> ## ⚠ LUẬT ĐO — quan trọng nhất với tôi
>
> **KHÔNG dùng số đo cùng-LAN làm bằng chứng nghiệm thu cho spike này.**
>
> Số đo LAN **chỉ được xuất hiện như diagnostic/control có nhãn rõ** — hữu ích để tách xem nghẽn ở mạng hay ở server, **không bao giờ** làm cơ sở cho ngân sách.
>
> **Wi-Fi hội trường không tin cậy và không cần** (DR-003 ✅). Nó **không được** là đường đo.

**Vì sao:** một ngân sách đo trên LAN sẽ **hạ thấp** độ trễ, jitter và độ biến động, và **vô giá trị** cho demo thật. `RISK-DEMO-NET-01` tồn tại chính vì địa điểm demo là môi trường cellular bị tranh chấp.

#### Slot đo thiết bị: **3 / 3** — nhưng TUYỆT ĐỐI KHÔNG NGỒI CHỜ

Chỉ có **MỘT** máy Galaxy A17 5G. Thứ tự đo: **A → B → E**. Trong lúc Tuấn Anh và Hùng Anh giữ máy, **việc của tôi chạy song song hoàn toàn**:

```text
✔  Mac mini backend stub
✔  xác minh kết nối Tailscale / private overlay
✔  payload artifact đại diện
✔  transport instrumentation
✔  logging phân bố độ trễ
✔  harness retry / reconnect
✔  script và template đo
```

**Bước setup gating:** xác nhận điện thoại tới được Mac mini qua cellular + Tailscale. **Làm việc này trước tiên** — nó là bước chưa biết trước thời lượng.

#### 13 acceptance criteria — tóm lược (đầy đủ ở `../spikes/SPIKE_E_TRANSPORT/TASK.md`)

| # | Phải chứng minh | Ràng buộc |
|---:|---|---|
| **E1** | **Mọi số đo nghiệm thu trên cellular + overlay thật** | LAN có nhãn diagnostic-only |
| E2 | Thời gian tới slice MRI dùng được đầu tiên khi mở case nguội, mỗi chiến lược | p50 **và p95** |
| E3 | Độ trễ request slice chưa cache, mỗi chiến lược | p50, p95, max |
| E4 | Hành vi điều hướng liên tục với prefetch, đối chiếu **p95 ≤ 200 ms** của `NFR-PERF-001` | và **không** full-volume transfer mỗi gesture |
| E5 | Chi phí transport mask/overlay đại diện | ms + bytes |
| E6 | Chi phí transport mesh đại diện, mỗi mức decimation có được | ms + bytes |
| E7 | Dấu chân memory trên máy mỗi chiến lược | MB |
| **E8** | **Báo cáo ĐỘ TRẢI của độ trễ, không chỉ trung vị** | **bắt buộc, không tuỳ chọn** |
| E9 | Đặc tính reconnect/retry liên quan demo canonical | ms/s |
| **E10** | **Ngân sách hiệu năng first-load đề xuất**, có mục tiêu đo được | phù hợp thành NFR + test qua `00` §13 |
| **E11** | **Tập artifact tối thiểu cho fallback**, kèm kích thước trên máy | MB |
| **E12** | **Kết nối overlay direct hay relayed — ghi cho MỌI số đo** | relay thêm độ trễ |
| E13 | Khuyến nghị chiến lược cho `ADR-ART-001` kèm trade-off | |

#### Bốn chiến lược để so sánh **[GIẢ ĐỊNH — phải kiểm, không mặc định]**

1. Per-slice image encoding, fetch theo yêu cầu.
2. Per-slice packed-binary mask.
3. Tải cả khối rồi slice ở client.
4. Cửa sổ prefetch quanh slice active, kết hợp với bất kỳ cái trên.

Trade-off là giữa **chi phí lần tải đầu** và **chi phí mỗi gesture**. `11` §2 cho phép trả trực tiếp, endpoint theo chunk/slice, hoặc artifact URL có version — tất cả để `ADR-ART-001` quyết.

#### Scope firewall trên fallback — ràng buộc

DR-003 ✅ yêu cầu kế hoạch phải giữ một **fallback TỐI THIỂU** cho hero demo khi mất kết nối. Spike này **báo cáo cái tối thiểu đó cần là gì**.

> **Nó KHÔNG được trở thành:** một product requirement offline mode đầy đủ · một kiến trúc ứng dụng thứ hai · yêu cầu chạy chức năng backend trên điện thoại.
>
> **`PR-CACHE-01` (offline-friendly caching) chỉ là SHOULD.** Fallback **không được** đẩy nó lên trần MUST bằng cửa sau. Mở rộng như vậy là đổi scope theo `00` §13 và `03` §5.

### Hai hợp đồng ingestion (DR-004 ✅) — phần bạn phải nắm sâu nhất

**Cơ chế dùng chung** (offline CLI + versioned manifest), **nhưng là HAI hợp đồng riêng**:

| | **Contract 1 — raw dataset / case** | **Contract 2 — precomputed experiment artifact** |
|---|---|---|
| **Nạp gì** | `MRICase` · `MRIVolume` · `GroundTruthMask` | `Experiment` · `AnalysisRun` · prediction mask · metric record · `Reconstruction3D` |
| **Nguồn chân lý** | Gói dataset đã kiểm định | Output đánh giá của ML worker |
| **Spec chi phối** | `06` §3/§9/§9.1 · `05` immutable source artifact | `08` §10 experiment manifest · `05` §4 provenance invariant |
| **Gate bởi** | **`GATE-DATA-01`** — từ chối nạp gói chưa kiểm định | **`GATE-SPLIT-01` + `GATE-ML-01`** — từ chối artifact có manifest tham chiếu split/recipe chưa đóng băng |
| **Check bắt buộc** | NRRD load được · tương thích shape+spacing MRI↔mask · **ghi ánh xạ nhãn foreground** · **chỉ axis-aligned, còn lại `GEOMETRY_NOT_VALIDATED`** (DR-012 ✅) · metadata allowlist (`NFR-SEC-005`) | **mọi field `08` §10** gồm split/subset/evaluation-population manifest ID và training/evaluation code + metric version (**SCQ-03**) · checksum · `05` §4 invariant · **cờ provenance `precomputed`** cho `10` SCR-03/SCR-09 |
| **Idempotency** | Nạp lại gói y hệt = no-op; checksum đổi = **lỗi**, không bao giờ ghi đè ngầm | Nạp lại sau khi sửa đánh giá tạo bản ghi **version MỚI**; không bao giờ mutate run đã tồn tại |
| **Tần suất** | **Một lần** mỗi gói đã kiểm định, trước mọi training | **Lặp lại** mỗi lần đánh giá, xuyên ma trận 7 experiment |

**Vì sao phải tách:** Contract 1 chạy một lần, chế độ hỏng của nó là **dataset không hợp lệ**. Contract 2 chạy lặp lại, chế độ hỏng của nó là **provenance bị phá hoặc một tuyên bố comparability bịa**. Gộp lại thì hoặc ta áp validation dataset lên output model, hoặc để artifact experiment **lách qua** GATE-SPLIT-01/GATE-ML-01.

**⇒ Mỗi hợp đồng cần schema manifest riêng, validator riêng, và acceptance test riêng. HAI test, không phải một.**

### Ngữ nghĩa review liên quan backend (DR-009 ✅)

| Điểm | Nghĩa vụ backend của tôi |
|---|---|
| **Review scope** | Gắn với **đúng `source_mask_id` + prediction variant tường minh**. Endpoint tạo review phải mang cả hai |
| **`revision` đơn điệu** | Lưu và tăng |
| **`expected_revision` / `STALE_REVISION`** | Từ chối ghi cũ; **cấm silent last-write-wins** |
| **Server có thể giữ working draft đồng bộ bất đồng bộ** | Endpoint working-mask `PUT` của `11` §8 là **kênh sync**, **không phải đường tương tác** |
| **Phục hồi restart** | Chỉ đảm bảo tới draft đã sync gần nhất; **nét chưa sync có thể mất** — đây là giới hạn đã chấp nhận, phải ghi rõ, và `TC-REL-002` viết theo biên này |
| **Commit** | Tạo `ReviewedMask` version **MỚI, bất biến**; **không bao giờ** ghi đè source prediction hay version trước |
| **Từ chối GT làm source** | `11` §8 — backend phải chặn việc dùng ground truth làm source prediction ẩn |
| **Ba aggregate độc lập** (SCQ-01) | `Review`, `ReviewedMask`, `Finding` — **không** khoá ngoại `finding_id` trên Review/ReviewedMask. Finding **không bắt buộc** cho mọi lần sửa |

### Bằng chứng KHÔNG được bịa

> **Claude không được tạo:** bất kỳ độ trễ · throughput · jitter · byte count trên đường truyền · memory trên máy · thời gian reconnect · điều kiện tín hiệu cellular · trạng thái direct-vs-relay · bất kỳ thông số phần cứng nào.
>
> **Mọi phép đo mạng và thiết bị do CHÍNH TÔI thực hiện, trên đường cellular + overlay thật.**
>
> Claude **được** viết backend stub, dựng client harness và instrumentation, viết script tổng hợp, chuẩn bị template, và **phân tích số liệu tôi cung cấp**.

### Trường không đo được

Ghi **`NOT MEASURED — <lý do>`**. Trung thực và được chấp nhận. **Bịa thì không.**

---

## 11 · Ai review tôi

| Việc của tôi | Reviewer |
|---|---|
| **Spike E** | **Phạm Tuấn Anh** — ưu tiên **2**, sau Spike B (P1) trong hàng đợi của anh ấy |
| V4 Review vertical | **Phạm Tuấn Anh** |
| Backend / Persistence / Ingestion block | **Phạm Tuấn Anh** |

**Phạm Tuấn Anh sẽ phản biện gì:** đặc biệt **E1 — số đo có thật sự trên cellular + overlay không**. Nếu tôi trình số đo LAN, **bằng chứng bị từ chối**. Hãy dán nhãn mọi run rõ ràng từ đầu.

**Sau đó:** **CHAT E — QA/Red Team** phản biện độc lập. **QA REJECT chặn nghiệm thu bất kể ý kiến tôi hay reviewer.**

**Tôi không review spike của ai trong wave này.**

---

## 12 · Hành động đầu tiên của tôi trên Execution Day 1 (2026-09-10)

```text
1.  Đặt Spike E → ACTIVE, ghi started_at THẬT (không lùi ngày).
2.  DỰNG MAC MINI BACKEND STUB và XÁC MINH điện thoại tới được nó
    qua cellular + Tailscale.
        ← đây là bước setup GATING và là việc chưa biết trước thời lượng.
          Làm trước tiên.
3.  Đăng ký slot đo thiết bị #3 với Tuấn Anh (sau A và B).
4.  Trong lúc chờ máy: payload artifact đại diện · instrumentation ·
    logging phân bố độ trễ · harness retry/reconnect · script đo.
        ← TUYỆT ĐỐI KHÔNG NGỒI CHỜ ĐIỆN THOẠI
5.  Xác nhận với Quốc Khánh về schema manifest, để Contract 1 và Contract 2
    khớp output của anh ấy.
```

---

## 13 · Tôi cần biết gì về việc của người khác

| Người | Tôi cần biết vì |
|---|---|
| **Bế Quốc Khánh** | Tôi ingest **cả hai** loại output của anh ấy. Manifest của anh ấy phải khớp schema của tôi. **Contract 1 gate bởi GATE-DATA-01 của anh ấy; Contract 2 gate bởi GATE-SPLIT-01 + GATE-ML-01.** Verdict axis-alignment của anh ấy quyết định check `GEOMETRY_NOT_VALIDATED` của tôi |
| **Vũ Hùng Anh** | **API của tôi phải trả geometry theo đúng quy ước canonical của anh ấy** (DR-008a). Tôi ingest mesh của anh ấy. Spike E của tôi đo transport mesh ở **các mức decimation của anh ấy** — nếu Spike B chưa có, tôi dùng mesh tổng hợp cùng cỡ triangle và **ghi rõ việc thay thế đó** |
| **Phạm Tuấn Anh** | Anh ấy **review tôi**. Mọi endpoint của tôi nạp viewer 2D của anh ấy. **V4 review UI của tôi dựng trực tiếp trên brush primitive của anh ấy** — nên tôi cần biết primitive đó làm được gì trước khi thiết kế luồng review |

---

## 14 · Cách leo thang blocker

| Tình huống | Làm gì |
|---|---|
| **Điện thoại không tới được Mac mini qua cellular + Tailscale** | Báo **Phạm Tuấn Anh** ngay — đây là bước setup gating của Spike E, không phải chi tiết nhỏ |
| **Không chiến lược nào đạt `NFR-PERF-001` khi điều hướng liên tục** | Leo thang; nạp vào `ADR-ART-001` và `RISK-DEMO-NET-01` |
| **Độ trải độ trễ làm hero demo không đáng tin** | Leo thang; fallback DR-003 ✅ trở thành thành phần chịu lực |
| **Đề xuất fallback đang phình thành offline mode** | **DỪNG.** Đó là vi phạm scope firewall — `00` §13 / `03` §5 |
| **Tôi bị áp lực dùng số đo LAN cho kịp** | **Từ chối.** DR-003 ✅ measurement rule; bằng chứng sẽ bị từ chối ở review |
| **Mesh Spike B chưa có khi tôi cần đo transport** | Dùng mesh tổng hợp cùng cỡ triangle và **ghi rõ việc thay thế** trong `RESULT.md` |
| Mâu thuẫn giữa hai file spec đóng băng | **DỪNG**, mở Decision Request (`00` §12) |
| Cần đổi API contract | **Decision Request** — đừng tự sửa dù tôi là chủ sở hữu khối |
| Bị chặn bởi việc của người khác | Báo **Phạm Tuấn Anh** ngay, đừng giấu tới EOD (`15` §13) |

---

## Nhắc lại ranh giới Day 0 (2026-09-09)

Hôm nay: **KHÔNG** đặt Spike E sang `ACTIVE` · **KHÔNG** `RESULT.md` · **KHÔNG** đo transport cellular · **KHÔNG** đo trên máy · **KHÔNG** dựng harness spike "thật".

Hôm nay **ĐƯỢC**: đọc `SPIKE_E_TRANSPORT/TASK.md` kỹ (đặc biệt luật đo và scope firewall) · đọc `11` API contract ở mức khái niệm · cài tooling backend · kiểm tra Mac mini bật được và Tailscale cài được · học Tailscale ở mức khái niệm · drill Git · hỏi mọi câu về hai hợp đồng ingestion.

**Nếu việc cài tooling phát hiện vướng mắc** (Tailscale không chạy, không truy cập được Mac mini, thiếu quyền) → ghi vào cột "Clarifications Required" của `DAY0_SIGNOFF.md` như **onboarding blocker**. Phát hiện hôm nay tốt hơn nhiều so với phát hiện ngày mai.
