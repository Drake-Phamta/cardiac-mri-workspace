# CẨM NANG DAY 0 — NGUYỄN GIA ĐỨC TRUNG

**Ngày Day 0:** 2026-09-09
**Vai trò:** V4 Review/Findings · Backend/Persistence/Ingestion · Primary Owner Spike E
**Reviewer và người nhận blocker:** Phạm Tuấn Anh

> Đây là bản tổng hợp dễ đọc dành riêng cho Trung. Nó giúp chuẩn bị và tự kiểm tra Day 0, nhưng **không thay thế** tài liệu gốc, bài kiểm tra của leader hoặc `DAY0_SIGNOFF.md`. Nếu tài liệu này khác với frozen specification thì **frozen specification thắng** và phải báo leader.

## 1. Sau Day 0, tôi cần đạt được điều gì?

Tôi không cần viết xong backend hay chạy xong Spike E. Tôi cần chứng minh rằng mình:

1. Hiểu dự án end-to-end và giải thích được vì sao các luật quan trọng tồn tại.
2. Biết chính xác phần mình sở hữu, đầu vào nhận từ ai và đầu ra giao cho ai.
3. Biết Spike E phải kiểm chứng điều gì, nhưng chưa thực thi hay tạo bằng chứng trong Day 0.
4. Tự làm được quy trình Git: branch → commit → PR → `NEEDS_FIX` → sửa → `APPROVE`.
5. Truy cập được repository và chuẩn bị được tooling cần thiết.
6. Xác nhận Mac mini bật/truy cập được và ZeroTier có thể cài trên máy tính lẫn điện thoại.
7. Biết khi nào được tự quyết, khi nào phải phối hợp, mở Decision Request hoặc báo leader.
8. Hoàn thành cửa Shared Core và để người thật ghi trạng thái thật vào `DAY0_SIGNOFF.md`.

Day 0 thành công nghĩa là **sẵn sàng làm đúng từ Day 1**, không phải làm trước công việc của Day 1.

## 2. Role của tôi — hiểu trong một câu

> Tôi bảo đảm artifact từ dataset/ML/3D được kiểm tra và nhập đúng vào backend, được lưu và phục vụ an toàn cho mobile; sau đó tôi lưu Review, ReviewedMask và Finding của người dùng mà không phá dữ liệu nguồn.

Tôi là **Primary Owner thật** trên hai trục:

| Trục | Tôi sở hữu | Nghĩa thực tế |
|---|---|---|
| Mobile vertical | **V4 Review / Findings** | Trạng thái review, brush correction, draft/sync, commit `ReviewedMask`, tạo/mở `Finding` |
| Technical block | **Backend / Persistence / Ingestion** | API, lưu trữ, artifact store, hai hợp đồng ingestion, version/provenance, quyền truy cập artifact |
| Spike hiện tại | **Spike E — Artifact Transport** | Thu bằng chứng để đề xuất chiến lược truyền artifact, ngân sách first-load và fallback tối thiểu |

`Primary Owner` không có nghĩa tôi được tự đổi mọi thứ. Nó có nghĩa tôi phải hiểu sâu, chủ động thực hiện, kiểm thử, giải thích, báo blocker, phối hợp và sửa theo review trong **các biên đã duyệt**.

`Phạm Tuấn Anh` là reviewer và lưới an toàn của tôi, không phải người mặc định làm thay backend. Anti-bottleneck rule yêu cầu giữ ownership của tôi; khi cần thì ghép cặp để tôi vẫn nắm được công việc.

## 3. Tôi nằm ở đâu trong toàn hệ thống?

```text
Official Dataset
    ↓  Quốc Khánh audit, split, train và tạo artifact ML/metric
RawPrediction / Metrics ───────────────┐
                                      │
Mesh + geometry từ Hùng Anh ──────────┤
                                      ▼
                         TÔI: hai hợp đồng ingestion
                                      ↓
                         TÔI: backend + persistence
                                      ↓ API
                 Mobile 2D của Tuấn Anh + Mobile 3D của Hùng Anh
                                      ↓
                      TÔI: V4 Review / ReviewedMask / Finding
                                      ↓
                         TÔI: lưu lại vào persistence
```

Tôi đứng **ở giữa** pipeline vì mọi artifact đi qua ingestion/backend, và **ở cuối** pipeline vì mọi hành động review quay về persistence.

## 4. Tôi liên kết với công việc của ai?

### 4.1 Bế Quốc Khánh — Dataset, ML và metric

| Khánh giao cho tôi | Tôi làm gì với nó |
|---|---|
| Dataset đã audit + `dataset_manifest.*` | Kiểm bằng Contract 1 rồi mới ingest |
| `Experiment`, `AnalysisRun`, prediction mask, metric | Kiểm provenance/gate/checksum bằng Contract 2 rồi mới ingest |
| Kết quả kiểm tra axis alignment | Dùng để chấp nhận geometry hoặc trả `GEOMETRY_NOT_VALIDATED` |

Trong Day 0, tôi phải làm rõ với Khánh:

- Hai bên sẽ thống nhất manifest/schema qua giao diện nào.
- Contract 1 cần output gì từ Spike D.
- Contract 2 cần những ID/version/provenance nào từ output đánh giá.
- Tôi không được tự sửa output của Khánh để validator “pass”. Nếu không hợp lệ, phải từ chối và báo rõ lý do.

### 4.2 Vũ Hùng Anh — Geometry và 3D

| Hùng Anh giao cho tôi | Tôi làm gì với nó |
|---|---|
| `Reconstruction3D`/mesh | Ingest và phục vụ qua API |
| Geometry contract version | Giữ cùng artifact và trả đúng cho mobile |
| Canonical geometry fixture | Backend của tôi phải pass cùng quy ước với mobile |
| Các mức mesh decimation | Sau Day 0, Spike E đo chi phí truyền ở từng mức có được |

Trong Day 0, tôi phải hiểu và nhắc lại được:

```text
(x, y, z)
x = cột ảnh nguồn
y = hàng ảnh nguồn
z = source slice index
slice shape = [Ny, Nx]
(u, v) → (x=u, y=v, z=slice_index)
gốc ở trên-trái; +x sang phải; +y xuống dưới
```

Thứ tự trục/memory order của thư viện chỉ là chi tiết hiện thực. Adapter của backend phải chuyển về canonical trước khi dữ liệu đi qua biên API/artifact.

### 4.3 Phạm Tuấn Anh — 2D, Integration/CI và reviewer của tôi

| Tuấn Anh liên quan thế nào | Nghĩa vụ của tôi |
|---|---|
| Viewer 2D dùng API của tôi | Endpoint phải trả đúng slice, mask, version, trạng thái và lỗi |
| V4 dùng brush primitive của V1 | Tôi phải hiểu primitive đó trước khi thiết kế luồng Review |
| Reviewer Spike E và khối của tôi | Tôi đưa code, test và bằng chứng đủ để anh ấy chạy lại/phản biện |
| Team Leader | Tôi báo blocker, nhu cầu DR, xung đột integration-sensitive và nhu cầu slot thiết bị cho anh ấy |

Spike E có thứ tự review mặc định sau Spike B. Im lặng không có nghĩa là `APPROVE`.

### 4.4 Người dùng/nhà nghiên cứu

Người dùng cần mobile phản hồi brush ngay, thấy trạng thái sync trung thực, xem được prediction đúng variant, commit ra `ReviewedMask` mới và có thể tạo `Finding`. Họ không được bị dẫn dắt rằng sản phẩm này là công cụ chẩn đoán lâm sàng.

## 5. Kế hoạch hoàn thành Day 0

### Trước 08:30 — đọc bắt buộc, khoảng 45 phút

- [ ] Đọc [`README.md`](../README.md): hiểu mục tiêu và ranh giới Day 0.
- [ ] Đọc [`PROJECT_ONE_PAGE_MAP.md`](../PROJECT_ONE_PAGE_MAP.md): kể lại được pipeline và ownership.
- [ ] Đọc [`NGUYEN_GIA_DUC_TRUNG.md`](NGUYEN_GIA_DUC_TRUNG.md): biết input, output, quyền và giới hạn của mình.

Không đọc tuyến tính toàn bộ `docs/specs/v1.0/00` đến `17`. Chỉ tra đúng ID khi tài liệu onboarding dẫn tới.

### 08:30–12:00 — Shared Core

- [ ] Hiểu sản phẩm, câu hỏi nghiên cứu và ý nghĩa “kết quả âm vẫn hợp lệ”.
- [ ] Hiểu dataset, patient-level split và data leakage.
- [ ] Phân biệt các loại artifact và ba lớp `IMMUTABLE`/`DERIVED`/`HUMAN`.
- [ ] Phân biệt Evaluation Mode và Inference & Review Mode.
- [ ] Hiểu metric case/slice/cohort và empty-slice.
- [ ] Thuộc và giải thích được hợp đồng tọa độ canonical.
- [ ] Hiểu review scope, revision, sync draft và commit.

Đi theo [`TEAM_SHARED_CORE.md`](../TEAM_SHARED_CORE.md) cùng leader; mục tiêu là hiểu **vì sao**, không học thuộc câu chữ.

### 13:30–14:30 — kể lại pipeline

Tôi phải nói được theo mẫu:

```text
Ai tạo đầu vào? → artifact nào? → tôi kiểm bằng contract nào?
→ backend lưu/trả gì? → ai tiêu thụ? → review quay lại lưu thế nào?
```

### 14:30–15:30 — Git/PR drill

- [ ] Tạo branch `chore/practice-<tên>` từ `main` mới nhất.
- [ ] Chỉ sửa file practice của mình, không chạm spec/spike/production.
- [ ] Commit có task ID.
- [ ] Mở PR vào `main`.
- [ ] Nhận một `NEEDS_FIX`, sửa và push lại.
- [ ] Review chéo với Quốc Khánh: yêu cầu một thay đổi cụ thể rồi `APPROVE` khi đạt.
- [ ] Quan sát squash merge.

### 15:45–16:45 — ownership cá nhân

- [ ] Đọc lại brief trong 20 phút.
- [ ] Trình bày role trong 5 phút.
- [ ] Trả lời được 10 câu ở mục 11 của tài liệu này.

### 16:45–17:30 — cửa Shared Core

- [ ] Trả lời miệng 5 nhóm câu hỏi: khoa học/leakage, artifact, geometry, workflow/DR và câu theo role.
- [ ] Nếu chưa rõ, nhận `NEEDS_CLARIFICATION`, ghi rõ điểm cần học lại; không che giấu để lấy `PASS`.

### 17:30–18:00 — readiness và signoff

- [ ] Đã push branch và mở PR thật trong drill.
- [ ] Tooling backend local cần thiết đã cài và chạy thử.
- [ ] Mac mini bật và truy cập được.
- [ ] ZeroTier có thể cài/chạy trên máy tính và điện thoại.
- [ ] Nói được acceptance criteria và fail condition chính của Spike E.
- [ ] Nói đúng reviewer, hành động đầu Day 1 và cách báo blocker.
- [ ] Người thật cập nhật phần của Trung trong [`DAY0_SIGNOFF.md`](../DAY0_SIGNOFF.md).

## 6. Day 0 được làm gì và không được làm gì?

### Được làm

- Đọc, thảo luận, đặt câu hỏi và tra cứu spec theo ID.
- Cài đặt/cấu hình tooling và kiểm tra quyền repository.
- Kiểm tra Mac mini bật/truy cập được và ZeroTier cài được.
- Học ZeroTier và API contract ở mức khái niệm.
- Xem kỹ [`SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md), nhất là luật đo và scope firewall.
- Làm Git/PR drill trên file practice.
- Làm rõ ownership, interface, hai hợp đồng ingestion và blocker.

### Tuyệt đối không làm trong Day 0

- Không chuyển Spike E sang `ACTIVE`; mọi `started_at` phải còn `null`.
- Không dựng harness/backend stub Spike E “thật” như execution.
- Không đo transport cellular, LAN, thiết bị, memory hay reconnect.
- Không tạo `RESULT.md`.
- Không tạo module production.
- Không sửa `docs/specs/v1.0/`.
- Không viết `ADR-ART-001` hoặc tự đóng chiến lược transport.
- Không tạo `MASTER_PLAN_30_DAYS.md`.
- Không phơi Mac mini ra Internet công khai.

Nếu cài tooling làm lộ vấn đề, ghi nó là **onboarding blocker** trong `Clarifications Required`; không biến nó thành số liệu hoặc execution giả.

## 7. Kiến thức bắt buộc tôi phải giải thích được

### 7.1 Dự án và nghiên cứu

- Đây là **AI-assisted Cardiac MRI Research Workspace**, dùng cho nghiên cứu/giáo dục phân vùng khoang tâm nhĩ trái từ LGE MRI.
- Đây **không phải** sản phẩm chẩn đoán, điều trị hoặc chăm sóc bệnh nhân.
- Câu hỏi demo: “Vì sao AI sai trên ảnh MRI này, và nhà nghiên cứu có thể làm gì?”
- DINOv2 không bắt buộc thắng UNet. Kết quả âm/null vẫn hợp lệ nếu giao thức và bằng chứng đúng.
- Không có tự động huấn luyện lại sau khi người dùng sửa.

### 7.2 Dataset và leakage

- Một case có MRI volume và Ground Truth mask.
- Split phải ở **patient-level**, không theo slice. Các slice liền nhau của cùng bệnh nhân rất giống nhau; để chúng lọt qua train/test sẽ làm điểm số cao giả.
- Subset `25% ⊂ 50% ⊂ 100%`, seed `2024`, và cùng thành viên cho cả UNet/DINOv2.

### 7.3 Artifact

| Lớp | Artifact | Luật |
|---|---|---|
| `IMMUTABLE` | `MRIVolume`, `GroundTruthMask`, `RawPredictionMask` | Không bao giờ ghi đè |
| `DERIVED` | `ProcessedPredictionMask`, `Reconstruction3D`, metric | Tái tạo được từ nguồn + version |
| `HUMAN` | `Review`, `ReviewedMask`, `Finding` | Truy vết được; commit tạo version mới |

Các luật quan trọng:

- Không âm thầm dùng processed thay raw.
- `Review`, `ReviewedMask`, `Finding` là ba aggregate độc lập.
- Finding không bắt buộc cho mọi lần sửa.
- Ground Truth không bao giờ là source sửa mặc định và không được copy thành ReviewedMask giả.

### 7.4 Evaluation Mode và Inference & Review Mode

- Có GT: được tính Dice/IoU, FP/FN và metric dựa trên GT.
- Không có GT: vẫn được xem prediction, 2D/3D và review, nhưng API phải trả `GROUND_TRUTH_UNAVAILABLE` cho metric cần GT.
- Không trả mask toàn 0 hoặc accuracy 0 để giả rằng có reference.

### 7.5 Metric

- Metric chính là Dice/IoU 3D **cấp case**.
- Cohort summary dẫn xuất từ các giá trị per-case; không gộp voxel mọi bệnh nhân thành một mask lớn.
- Slice có GT rỗng và prediction rỗng là `NOT_APPLICABLE`/`NaN`, loại khỏi trung bình per-slice; không gán `1`.
- Mọi metric phải ghi rõ variant `RAW_PREDICTION` hoặc `PROCESSED_PREDICTION`.

### 7.6 Geometry 2D↔3D

- `(x,y,z)` là hợp đồng đóng băng; sai mapping là lỗi P0/Critical.
- Backend và mobile phải pass cùng canonical geometry fixture.
- Canonical synthetic fixture yêu cầu chính xác tuyệt đối.
- Picking trên mesh thật đã decimate chỉ cho sai tối đa `±1 source slice`.
- Không được nới tolerance để framework hoặc mesh “pass”.

### 7.7 Review semantics liên quan backend

- Review gắn với đúng `source_mask_id` và prediction variant tường minh.
- `revision` tăng đơn điệu; client gửi `expected_revision`.
- Ghi dựa trên revision cũ phải bị từ chối bằng `STALE_REVISION`; cấm silent last-write-wins.
- Brush chạy trên working buffer cục bộ và không chờ mạng.
- Server có thể sync draft bất đồng bộ; restart chỉ phục hồi tới draft đã sync gần nhất, nên nét chưa sync có thể mất.
- `Cancel` chỉ bỏ draft chưa commit, không xóa ReviewedMask cũ.
- `Reset-to-source` trở lại đúng source mask đã khai.
- `Commit` tạo `ReviewedMask` version mới, bất biến.

## 8. Hai hợp đồng ingestion — phần tôi phải nắm sâu nhất

Hai contract dùng chung ý tưởng offline CLI + versioned manifest, nhưng **không được gộp thành một contract**.

| | Contract 1 — raw dataset/case | Contract 2 — experiment artifact |
|---|---|---|
| Nạp gì | `MRICase`, MRI, Ground Truth | Experiment, run, prediction, metric, mesh |
| Nguồn | Gói dataset đã audit | Output đánh giá ML/geometry |
| Gate | `GATE-DATA-01` | `GATE-SPLIT-01` + `GATE-ML-01` |
| Tần suất | Một lần mỗi gói trước training | Lặp lại sau mỗi lần đánh giá |
| Nạp lại | Cùng checksum = no-op; checksum đổi = lỗi | Sửa đánh giá = version/run mới, không mutate run cũ |
| Cần tạo về sau | Schema + validator + acceptance test riêng | Schema + validator + acceptance test riêng |

Contract 1 thất bại khi dataset không hợp lệ. Contract 2 thất bại khi provenance/comparability bị phá. Gộp chúng có thể để artifact lách gate hoặc áp sai validation.

## 9. Quyền của tôi và giới hạn quyết định

### Tôi được tự quyết trong biên đã duyệt

- Cấu trúc nội bộ backend stub của Spike E.
- Bố trí instrumentation và script tổng hợp.
- Chọn các chiến lược transport để **thử**, không phải tự chọn chiến lược cuối.
- Payload đại diện dùng để đo.
- Thiết kế retry/reconnect harness.
- Tổ chức nội bộ V4 và chi tiết validator, miễn tuân thủ đủ contract/acceptance criteria.

Trong Day 0, tôi chỉ cần **biết** phạm vi quyền này; chưa thực thi Spike E.

### Tôi không được quyết ngầm

- Frozen requirement, metric semantics, geometry semantics, domain model hoặc API contract.
- Chiến lược artifact transport cuối cùng; tôi chỉ tạo bằng chứng và khuyến nghị cho `ADR-ART-001`.
- Thay processed cho raw hoặc dùng Ground Truth giả.
- Silent last-write-wins.
- Dùng LAN làm bằng chứng Spike E.
- Nới acceptance criteria/tolerance để cho kết quả pass.
- Mở rộng fallback thành full offline mode, kiến trúc thứ hai hoặc backend chạy trên điện thoại.
- Mở public endpoint/domain/port-forward cho Mac mini.

Nếu công việc đòi thay một mục đã đóng băng:

```text
DỪNG → báo Phạm Tuấn Anh → mở Decision Request
→ phân tích ảnh hưởng → chờ duyệt/cập nhật spec → mới hiện thực
```

## 10. Luật làm việc, bằng chứng và bảo mật

### Git/PR

- Không push/force-push trực tiếp vào `main`.
- Một task → một branch ngắn → một PR, trừ khi được duyệt khác.
- Branch từ `main` accepted mới nhất; sync lại trước merge.
- Chạy local test trước PR; PR giữ task ID + requirement ID.
- Một branch một owner; không commit vào branch người khác nếu chưa có pair work.
- File integration-sensitive như API schema, database migration, central config và geometry contract chỉ có một owner hoạt động tại một thời điểm; gặp chồng chéo thì dừng và phối hợp.

### WIP và review

- Tối đa một primary implementation task, tùy chọn một review và một preparation nhỏ.
- Với tôi, primary là Spike E; không có primary thứ hai.
- Mỗi reviewer chỉ có một việc ở `REVIEWING`; Spike E xếp sau Spike B trong hàng mặc định của Tuấn Anh.

### Bằng chứng

- `RESULT.md` tồn tại không đồng nghĩa spike đã `ACCEPTED`.
- Không bịa latency, throughput, jitter, byte count, memory, reconnect, tín hiệu, direct/relay hoặc phần cứng.
- Không đo được thì ghi `NOT MEASURED — <lý do>`.
- Kết quả âm là kết quả hợp lệ; không che test fail hay bỏ ca fail để làm kết quả đẹp.
- Spike chỉ `ACCEPTED` sau: owner tạo bằng chứng thật → reviewer `APPROVE` → QA/Red Team `PASS` → Project Control chuyển trạng thái.

### Bảo mật

- Secret không vào source control hoặc mobile binary.
- Log không dump MRI/mask thô hoặc credential.
- Metadata dataset dùng allowlist.
- Không public artifact-directory listing.
- Chỉ thiết bị thuộc private overlay được truy cập backend.
- Thiết bị ngoài overlay không được tới backend, kể cả đang cùng Wi-Fi vật lý.
- Giữ license, source, acquisition record và checksum của dataset.

## 11. Mười câu tôi phải trả lời được

### 1. Mobile vertical của tôi là gì?

V4 Review/Findings: quản lý review, brush correction, version ReviewedMask và Finding.

### 2. Technical block của tôi là gì?

Backend/Persistence/Ingestion: API, lưu trữ, artifact store và hai hợp đồng nhập dữ liệu.

### 3. Spike hiện tại của tôi là gì?

Spike E: đo transport artifact trên đường demo thật để cấp bằng chứng cho chiến lược transport, first-load budget và fallback tối thiểu.

### 4. Đầu vào của tôi là gì?

- Khánh: dataset/manifest, experiment, analysis run, prediction và metric.
- Hùng Anh: mesh và geometry contract.
- Tuấn Anh: brush primitive, nhu cầu tích hợp/CI.
- Frozen spec: API/domain/security/acceptance contract.

### 5. Đầu ra của tôi là gì?

- Backend API.
- Hai schema, hai validator và hai acceptance test ingestion.
- Persistence cho Review/ReviewedMask/Finding.
- V4 UI.
- Sau Day 0: bằng chứng Spike E, đề xuất first-load budget và fallback tối thiểu.

### 6. Ai review tôi?

Phạm Tuấn Anh review Spike E, V4 và Backend/Persistence/Ingestion. Sau đó Spike E còn qua QA/Red Team và Project Control.

### 7. Tôi được tự quyết gì?

Chi tiết nội bộ stub, instrumentation, harness, payload và các phương án để thử, miễn không đổi contract/requirement đã đóng.

### 8. Cái gì phải qua DR/gate/phối hợp?

Chiến lược transport cuối, API/domain/metric/geometry semantics, deployment, acceptance criteria và scope fallback. File/interface dùng chung phải phối hợp; thay mục đóng băng phải mở DR.

### 9. Bằng chứng nào đóng được task hiện tại?

Spike E cần số đo thật trên Galaxy A17 → cellular 4G/5G → ZeroTier → Mac mini ở xa; đủ acceptance criteria, môi trường được ghi nhận, recommendation/budget/fallback; rồi reviewer, QA và Project Control chấp nhận.

### 10. Ai tiêu thụ đầu ra của tôi?

Tuấn Anh dùng API cho 2D và review tôi; Hùng Anh dùng geometry/mesh API; Khánh dùng ingestion contract; mobile/người dùng dùng Review/Findings; `ADR-ART-001` và `RA-H13` dùng bằng chứng Spike E.

## 12. Câu hỏi tự kiểm Shared Core

Tôi phải trả lời được bằng lời của mình:

1. Nếu DINOv2 tệ hơn UNet, dự án có thất bại không? **Không; kết quả khoa học hợp lệ có thể âm.**
2. Vì sao không split theo slice? **Vì slice cùng bệnh nhân gần nhau, gây leakage và điểm giả.**
3. Người dùng sửa prediction thì RawPrediction thế nào? **Không đổi; commit tạo ReviewedMask mới.**
4. Ca không có GT hiển thị Dice bao nhiêu? **Không hiển thị; trả `GROUND_TRUTH_UNAVAILABLE`.**
5. GT và prediction cùng rỗng trên một slice thì Dice bao nhiêu? **`NOT_APPLICABLE`, loại khỏi trung bình per-slice.**
6. Thư viện trả trục khác canonical thì làm gì? **Adapter chuyển về canonical trước mọi biên.**
7. App crash sau 20 nét brush thì phục hồi tới đâu? **Draft sync gần nhất; nét chưa sync có thể mất.**
8. Cần đổi API contract để code dễ hơn thì làm gì? **Dừng, báo leader, mở DR; không tự sửa.**
9. Có `RESULT.md` là Spike E accepted chưa? **Chưa; còn reviewer, QA và Project Control.**
10. Đo Wi-Fi/LAN cùng Mac mini có nghiệm thu Spike E không? **Không; chỉ diagnostic có nhãn.**
11. Hai ingestion contract khác nhau thế nào? **Raw dataset một lần trước training qua DATA gate; experiment artifact lặp lại sau evaluation qua SPLIT+ML gates; mỗi bên có schema/validator/test riêng.**

## 13. Definition of Done cho Day 0 của tôi

Chỉ xem Day 0 của tôi hoàn tất khi người thật đã kiểm các mục sau:

- [ ] A — Shared Core: tôi hiểu end-to-end và qua cửa kiểm tra.
- [ ] B — Git Workflow: tôi tự hoàn thành drill.
- [ ] C — Project Pipeline: tôi kể đúng ai giao gì cho ai.
- [ ] D — Own Vertical: tôi giải thích được V4 Review/Findings.
- [ ] E — Own Technical Block: tôi giải thích được Backend/Persistence/Ingestion.
- [ ] F — Current Spike: tôi nói được acceptance criteria và fail conditions chính của Spike E.
- [ ] G — Evidence Workflow: tôi biết `RESULT.md ≠ ACCEPTED` và biết dùng `NOT MEASURED`.
- [ ] H — Blocker Escalation: tôi biết khi nào báo Tuấn Anh và khi nào mở DR.
- [ ] I — Repo Access: tôi đã push branch và mở PR thật trong drill.
- [ ] J — Environment Ready: tooling cần thiết đã cài/chạy thử.
- [ ] Tôi hiểu LAN không phải bằng chứng nghiệm thu Spike E.
- [ ] Tôi phân biệt được hai ingestion contract.
- [ ] Tôi hiểu fallback chỉ được tối thiểu, không phải full offline mode.
- [ ] Mac mini bật và truy cập được.
- [ ] ZeroTier cài được trên máy tính và điện thoại.
- [ ] Cột `Clarifications Required` ghi đúng mọi điểm còn chưa rõ/blocker.
- [ ] Leader/người thật cập nhật trạng thái thật; không điền sẵn `PASS`.
- [ ] Cuối Day 0: Spike E vẫn `PREPARED`, `started_at=null`, chưa có phép đo và chưa có `RESULT.md`.

Nếu một mục kiến thức là `NEEDS_CLARIFICATION`, tôi vẫn có thể làm việc theo cặp nhưng chưa nhận quyền sở hữu sâu độc lập cho tới khi được làm rõ.

## 14. Bài trình bày role trong khoảng 60 giây

> Tôi là Nguyễn Gia Đức Trung, Primary Owner của V4 Review/Findings và khối Backend/Persistence/Ingestion; Spike hiện tại của tôi là Spike E. Tôi nhận dataset và artifact ML từ Quốc Khánh, mesh và geometry contract từ Hùng Anh, rồi kiểm bằng hai ingestion contract riêng trước khi lưu và phục vụ qua API cho mobile. Phần V4 của tôi lưu Review, ReviewedMask version mới và Finding; không bao giờ ghi đè RawPrediction hoặc dùng Ground Truth làm bản sửa. Tuấn Anh dùng API cho viewer 2D, cung cấp brush primitive, đồng thời là reviewer và người tôi báo blocker. Trong Day 0 tôi chỉ học, chuẩn bị tooling, làm Git drill và chứng minh readiness; tôi chưa chạy Spike E, chưa đo và chưa tạo RESULT. Spike E về sau phải đo trên cellular thật qua ZeroTier tới Mac mini, không dùng LAN làm bằng chứng.

## 15. Chỉ sau khi Day 0 hoàn tất — việc đầu tiên của Day 1

Phần này để tôi biết trước, **không thực hiện trong Day 0**:

1. Chỉ bắt đầu khi leader tuyên bố Execution Day 1.
2. Khi thực sự bắt đầu, chuyển Spike E → `ACTIVE` và ghi `started_at` thật, không lùi ngày.
3. Dựng Mac mini backend stub và xác minh điện thoại tới được nó qua cellular + ZeroTier; đây là setup gating đầu tiên.
4. Đăng ký slot đo thiết bị số 3 với Tuấn Anh, sau A và B.
5. Trong lúc chờ máy, chuẩn bị payload, instrumentation, logging phân bố độ trễ, retry/reconnect và script đo; không ngồi chờ.
6. Xác nhận với Quốc Khánh để hai schema manifest khớp output của anh ấy.

## 16. Tài liệu nguồn cần dùng

Theo thứ tự sử dụng:

1. [`README.md`](../README.md) — mục tiêu và ranh giới Day 0.
2. [`PROJECT_ONE_PAGE_MAP.md`](../PROJECT_ONE_PAGE_MAP.md) — bản đồ pipeline, ownership và luật tra nhanh.
3. [`NGUYEN_GIA_DUC_TRUNG.md`](NGUYEN_GIA_DUC_TRUNG.md) — brief có thẩm quyền cho role của tôi.
4. [`TEAM_SHARED_CORE.md`](../TEAM_SHARED_CORE.md) — kiến thức chung đầy đủ, đi cùng leader.
5. [`TEAM_WORKFLOW_QUICKSTART.md`](../TEAM_WORKFLOW_QUICKSTART.md) — task/Git/PR/evidence/DR/EOD.
6. [`SHARED_CORE_CHECK.md`](../SHARED_CORE_CHECK.md) — ngân hàng câu hỏi kiểm tra.
7. [`SPIKE_E_TRANSPORT/TASK.md`](../../spikes/SPIKE_E_TRANSPORT/TASK.md) — mục tiêu, acceptance criteria và fail conditions của Spike E.
8. [`DAY0_SIGNOFF.md`](../DAY0_SIGNOFF.md) — người thật ghi trạng thái kiểm tra thực tế.
