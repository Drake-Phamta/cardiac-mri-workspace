# DAY 0 KICKOFF RUNBOOK

**Ngày:** **2026-09-09**
**Người điều phối:** **Phạm Tuấn Anh** (Team Leader)
**Người tham dự:** cả 4 thành viên, trực tiếp, cả ngày
**Kịch bản này dành cho leader** — thành viên không cần đọc trước.

> **Ranh giới Day 0:** Không spike nào được chuyển `ACTIVE`. Không `RESULT.md`. **Không tải dataset chính thức như công việc Spike D** — đồng hồ trigger DR-001 phải bắt đầu **2026-09-10**.

---

## CHUẨN BỊ TRƯỚC BUỔI (làm tối 2026-09-08 hoặc sáng sớm)

| # | Việc | Ghi chú |
|---:|---|---|
| 1 | Máy chiếu / màn hình lớn | Cần cho các sơ đồ |
| 2 | Mở sẵn 3 file để chiếu | `PROJECT_ONE_PAGE_MAP.md` · `TEAM_SHARED_CORE.md` · `SPIKE_PHASE_STATE.yaml` |
| 3 | In hoặc mở `DAY0_SIGNOFF.md` | Điền bằng tay trong ngày |
| 4 | Chuẩn bị repo cho bài drill Git | Tạo sẵn nhánh `main` sạch; xác nhận cả 4 người có quyền push nhánh + mở PR |
| 5 | Tạo file luyện tập | `management/onboarding/practice/PRACTICE_<TÊN>.md` — file vô hại, dùng cho drill |
| 6 | **Sạc đầy Galaxy A17 5G** | Chỉ để cho mọi người **nhìn thấy**; **không đo gì trong Day 0** |
| 7 | Kiểm tra Mac mini bật và ZeroTier chạy | Chỉ để minh hoạ topology; **không đo** |
| 8 | Bảng trắng / giấy A3 | Để vẽ lại sơ đồ pipeline khi hỏi |
| 9 | Đọc trước `TEAM_SHARED_CORE.md` mục **D, F, G** | Ba mục người ta hay hiểu sai nhất. **Leader phải đọc cả file**; thành viên thì **không** — xem mục 11 |
| 10 | Chuẩn bị nước/đồ ăn nhẹ | Ngày dài, 08:30–18:00 |
| 11 | **Nhắc thành viên mục đọc bắt buộc trước 08:30** | **Chỉ ba file:** `README.md` · `PROJECT_ONE_PAGE_MAP.md` · **member brief của chính họ**. Tổng ~45 phút. **KHÔNG** yêu cầu họ tự đọc hết `TEAM_SHARED_CORE.md` trước buổi — ta đi cùng nhau 09:00–12:00 |

### Nguyên tắc điều phối chung

- **Đừng giảng bài suốt.** Cứ 15–20 phút dừng lại hỏi một câu kiểm tra.
- **Đừng đào quá sâu vào chi tiết hiện thực** — Day 0 là mô hình tư duy, không phải code.
- **Ghi lại mọi hiểu nhầm bạn nghe được**, kể cả khi người đó tự sửa ngay. Đó là tín hiệu cần nhắc lại.
- Khi ai đó hỏi "cái này quyết chưa?", tra bảng **§L** của `TEAM_SHARED_CORE.md`. Nếu chưa đóng băng, nói rõ: **"chưa đóng băng KHÔNG có nghĩa là ai muốn chọn gì thì chọn."**

---

# 08:30 – 09:00 · MỞ ĐẦU / MỤC ĐÍCH DỰ ÁN

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §2 (Product Interaction)

### Trình bày

1. **Ta đang xây gì** — AI-assisted Cardiac MRI Research Workspace. Workspace nghiên cứu/giáo dục, mobile-first, để nghiên cứu phân vùng LA từ cardiac LGE MRI.
2. **Ta trả lời câu hỏi nghiên cứu nào** — RQ-A: *DINOv2 có suy giảm ít hơn UNet khi giảm nhãn không?* và RQ-B: *morphology xác định giúp hay hại?*
3. **Thành công nghĩa là gì** — một câu trả lời **hợp lệ**, sản phẩm tích hợp chạy được end-to-end, mỗi người bảo vệ được ít nhất một mobile function.
4. **Thành công KHÔNG nghĩa là gì** — **KHÔNG** yêu cầu DINOv2 phải thắng UNet. **KHÔNG** phải sản phẩm chẩn đoán lâm sàng.
5. **Ràng buộc 30 ngày** — Day 1 là 2026-09-10. Không có "tuần tích hợp" ở cuối.
6. **Vì sao có Day 0** — hợp đồng toạ độ là lỗi P0 dễ xảy ra nhất; ngữ nghĩa artifact quyết định tính hợp lệ khoa học; không ai được chỉ hiểu khối của mình.

### Câu hỏi kiểm tra

> **"Nếu cuối dự án ta thấy DINOv2 tệ hơn UNet ở mọi phân số, dự án có thất bại không?"**

**Đáp án mong đợi:** Không. `PR-SCI-03` — thành công là câu trả lời hợp lệ, kết quả âm được chấp nhận khi giao thức và bằng chứng vững.

**Hiểu nhầm nguy hiểm:** ai đó nói "ta phải làm cho DINOv2 thắng" hoặc "nếu thua thì đổi setup". → **Chấn chỉnh ngay tại chỗ.** Đây là gốc của gian lận khoa học vô ý.

### Đừng đào sâu

Chưa nói kiến trúc, chưa nói framework, chưa nói ai code gì. Chỉ mục đích.

---

# 09:00 – 10:30 · SHARED CORE I

**Chiếu:** `TEAM_SHARED_CORE.md` mục **A, B, C**

> **Đây là lần đầu thành viên gặp `TEAM_SHARED_CORE.md`.** Họ **không** được yêu cầu đọc trước — ta đi
> cùng nhau ở đây, nơi hiểu nhầm được bắt và chấn chỉnh ngay. Chỉ có `README.md`,
> `PROJECT_ONE_PAGE_MAP.md` và member brief của chính họ là đọc trước.

## 09:00–09:20 · Cardiac MRI / mục tiêu LA — ở mức cần cho công việc

Giải thích vừa đủ:

- **LGE MRI** là một khối 3D gồm nhiều lát cắt (slice) 2D.
- Mục tiêu phân vùng là **khoang tâm nhĩ trái (LA cavity)** — một cấu trúc, một nhãn.
- Nhiều slice ở đầu/cuối khối **hoàn toàn là nền** — không chứa tâm nhĩ. Ghi nhớ điểm này, nó quay lại ở mục metric.

> **Đừng biến đoạn này thành bài giảng giải phẫu tim.** Đủ để mọi người hình dung "một chồng ảnh, cần khoanh một vùng".

## 09:20–09:40 · Dataset

- **LASC 2018 / Atria Segmentation Data** từ Cardiac Atlas Project.
- Hai file lõi: **`lgemri.nrrd`** (ảnh vào), **`laendo.nrrd`** (mask LA cavity tham chiếu).
- **`lawall.nrrd` bị loại** khỏi core cho tới khi provenance được xác minh.
- **Chưa ai tải gói. Sẽ tải vào Day 1**, như công việc Spike D của Bế Quốc Khánh.
- **Bài báo tham chiếu dùng LAScarQS 2022 — khác dataset.** Ta không được nói "tái lập kết quả của họ".

### Câu hỏi kiểm tra

> **"Vì sao ta phải audit gói dữ liệu trước khi huấn luyện, thay vì đọc mô tả trên web rồi bắt đầu?"**

**Đáp án mong đợi:** mô tả công bố và header file thật có thể khác nhau; `06` §9.1 chặn training tới khi gate được ACCEPTED; và `06` §6 cấm đổi split sau khi đã thấy kết quả, nên đoán rồi sửa là không được.

## 09:40–10:00 · GT / các biến thể prediction

**Chiếu:** `TEAM_SHARED_CORE.md` §D.4 (ví dụ một ca đi qua các artifact)

Vẽ lên bảng trắng theo thứ tự này, **từng cái một**:

```text
MRIVolume  →  GroundTruthMask  →  RawPredictionMask  →  ProcessedPredictionMask
                                          │
                                          └──► ReviewedMask v1 → v2
```

Nhấn **ba lớp**: IMMUTABLE / DERIVED / HUMAN.

### Câu hỏi kiểm tra

> **"Người dùng brush sửa một prediction rồi bấm Save. Chuyện gì xảy ra với `RawPredictionMask`?"**

**Đáp án mong đợi:** **không có gì cả.** Nó bất biến. Một `ReviewedMask` version mới được tạo, tham chiếu ngược về nó.

**Hiểu nhầm nguy hiểm:** "cập nhật prediction", "lưu đè lên mask cũ". → Nhắc: `03` §4 xếp việc này vào **điều kiện loại bỏ MVP**.

## 10:00–10:30 · RQ-A / RQ-B, patient-level split, leakage, ma trận experiment

**Chiếu:** `TEAM_SHARED_CORE.md` §B.2 (bảng 6 experiment)

Nói rõ bốn luật cứng: nesting bắt buộc · patient-level xác định · cùng thành viên cho cả hai họ model · recipe giống hệt giữa các phân số.

### Câu hỏi kiểm tra — **quan trọng nhất buổi sáng**

> **"Vì sao ta không được chia ngẫu nhiên theo slice thay vì theo bệnh nhân?"**

**Đáp án mong đợi:** các slice liền nhau của **cùng một bệnh nhân** gần như giống hệt. Slice 40 vào train, slice 41 vào test ⇒ mô hình đã thấy gần đúng câu trả lời. Điểm số cao vô nghĩa, và **RQ-A mất giá trị** vì ta không còn đo được khả năng tổng quát hoá sang bệnh nhân mới.

**Hiểu nhầm nguy hiểm:** "nhưng nhiều slice hơn thì train tốt hơn mà". → Chấn chỉnh: đúng, nhưng **kết quả đo được sẽ là giả**. `13` §12 xếp data leakage vào **P0**.

---

# 10:30 – 10:45 · GIẢI LAO

---

# 10:45 – 12:00 · SHARED CORE II

**Chiếu:** `TEAM_SHARED_CORE.md` mục **E, F, G, H, I**

## 10:45–11:00 · Hai chế độ

Vẽ bảng hai cột Evaluation Mode / Inference & Review Mode.

### Câu hỏi kiểm tra

> **"Mở một ca không có ground truth. App nên hiển thị Dice là bao nhiêu?"**

**Đáp án mong đợi:** **không hiển thị gì cả** — hiện trạng thái "không khả dụng" rõ ràng. API trả `GROUND_TRUTH_UNAVAILABLE`. Hiện `0.00` là **bịa số liệu**, và biểu đồ rỗng hàm ý "lỗi bằng không" cũng sai (`TC-USAB-003`).

## 11:00–11:25 · Metric: case / slice / cohort

**Chiếu:** `TEAM_SHARED_CORE.md` §F.2 và §F.4

Nhấn hai điểm:

1. Cohort tính **từ per-case**, không gộp voxel.
2. Luật empty-slice.

### Câu hỏi kiểm tra 1

> **"Vì sao không gộp toàn bộ voxel của mọi bệnh nhân vào một mask khổng lồ rồi tính Dice một lần?"**

**Đáp án mong đợi:** bệnh nhân có tâm nhĩ lớn sẽ chi phối điểm số. Tính per-case cho **mỗi bệnh nhân một phiếu bằng nhau**, phản ánh đúng "mô hình hoạt động thế nào trên một bệnh nhân điển hình".

### Câu hỏi kiểm tra 2

> **"Một slice mà cả GT và prediction đều rỗng — Dice bằng bao nhiêu?"**

**Đáp án mong đợi:** **`NOT_APPLICABLE` / `NaN`, và bị LOẠI** khỏi trung bình/phân bố per-slice. **Không phải `1`.**

**Hiểu nhầm nguy hiểm:** "cả hai đều đúng nên Dice = 1". → Chấn chỉnh: hàng chục slice nền sẽ **thổi phồng** điểm per-slice. `07` §6 nói thẳng gán `1` là sai.

## 11:25–11:50 · Geometry và 2D↔3D — **mục quan trọng nhất cả ngày**

**Chiếu:** `TEAM_SHARED_CORE.md` §G.1 (khối code quy ước canonical)

**Viết cả quy ước lên bảng trắng và để nguyên đó suốt phần còn lại của ngày.**

```text
voxel (x, y, z):   x = COLUMN   y = ROW   z = SLICE INDEX
shape_xyz = [Nx, Ny, Nz]        slice_index = z ∈ 0..Nz-1
slice shape = [Ny, Nx]          (u,v) → (x=u, y=v, z=slice_index)
gốc: trên-trái    +x → phải     +y → xuống
memory order của thư viện KHÔNG thuộc hợp đồng
```

Giải thích **năm chỗ hỏng** nếu sai quy ước (§G.3).

### Câu hỏi kiểm tra

> **"Thư viện đọc NRRD của tôi trả mảng theo thứ tự trục khác. Tôi có được để nguyên như vậy trong payload API không?"**

**Đáp án mong đợi:** **Không.** Memory order là chi tiết hiện thực. **Adapter phải chuyển về biểu diễn canonical ở mọi biên** — payload API, metadata artifact, geometry fixture, mô hình slice trong app.

**Hiểu nhầm nguy hiểm:** "numpy nó thế thì để thế". → Đây chính là cách sinh ra lỗi P0.

## 11:50–12:00 · Review semantics và artifact bất biến

Chốt lại: 4 trạng thái review · scope = source mask + variant · `revision` + `STALE_REVISION` · brush không chờ mạng · **nét chưa sync có thể mất khi restart** · commit tạo version mới.

### Câu hỏi kiểm tra

> **"Người dùng vẽ 20 nét rồi app crash. Mất gì?"**

**Đáp án mong đợi:** phục hồi chỉ đảm bảo tới **working draft đã sync gần nhất**; các nét chưa sync **có thể mất**. Đây là hệ quả đã chấp nhận và ghi rõ của việc "brush không bao giờ chờ mạng" — cái làm `NFR-PERF-003` (≤100 ms) khả thi. UI nên cho thấy trạng thái sync.

---

# 12:00 – 13:30 · NGHỈ TRƯA

---

# 13:30 – 14:30 · KIẾN TRÚC — ĐI HẾT PIPELINE

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §1 và `TEAM_SHARED_CORE.md` §K.1

**Cách làm:** đi **từng chặng một**. Với mỗi chặng, hỏi cả phòng bốn câu, **không** tự trả lời trước.

| Chặng | Owner | Input | Output | Ai tiêu thụ |
|---|---|---|---|---|
| **Dataset audit** | Bế Quốc Khánh | Gói chính thức | `DATASET_AUDIT.md` + `dataset_manifest.*` | Split · ingestion Contract 1 · Spike C1 |
| **Split / subsets** | Bế Quốc Khánh | Manifest đã kiểm định | Split manifest (patient-level, seed 2024) | Training · mọi experiment |
| **Training** | Bế Quốc Khánh | Split + recipe đã đóng băng | Checkpoint + `RawPredictionMask` | Metrics · reconstruction · ingestion |
| **Metrics** | Bế Quốc Khánh | Raw prediction + GT | `CaseMetricSet` · `SliceMetric` · `CohortMetricSummary` | V3 cohort UI · báo cáo |
| **3D reconstruction** | Vũ Hùng Anh | Mask đã kiểm định + geometry | Mesh + geometry contract version | V2 3D UI · Spike F |
| **Ingestion** | Nguyễn Gia Đức Trung | Artifact từ ML worker | Bản ghi trong backend, giữ nguyên provenance | Backend API |
| **Backend / persistence** | Nguyễn Gia Đức Trung | Bản ghi đã ingest | API endpoint | App mobile |
| **Mobile 2D** | Phạm Tuấn Anh | API | Slice viewer, overlay, brush | Người dùng · V4 review |
| **Mobile 3D** | Vũ Hùng Anh | API + mesh | 3D view, picking, liên kết 2D↔3D | Người dùng |
| **Review / Finding** | Nguyễn Gia Đức Trung | Tương tác người dùng | `ReviewedMask` · `Finding` | Persistence · báo cáo |
| **Integration / CI** | Phạm Tuấn Anh | Tất cả | `main` xanh, hợp đồng khớp nhau | Cả nhóm |

### Câu hỏi kiểm tra

> **"Bế Quốc Khánh tạo ra `RawPredictionMask`. Ai là người tiếp theo chạm vào nó, và họ được phép làm gì với nó?"**

**Đáp án mong đợi:** Nguyễn Gia Đức Trung ingest nó (Contract 2), Vũ Hùng Anh dựng mesh **từ** nó, Phạm Tuấn Anh hiển thị nó. **Không ai được sửa nó.** Bản người sửa là artifact mới.

### Đừng đào sâu

Chưa chọn framework, chưa chọn database, chưa thiết kế schema chi tiết. Chỉ **ai đưa gì cho ai**.

---

# 14:30 – 15:30 · DRILL GIT / PR / EVIDENCE

**Chiếu:** `TEAM_WORKFLOW_QUICKSTART.md` §1 và §2

## Bài tập — an toàn, không chạm production

> **Bài tập này TUYỆT ĐỐI KHÔNG được chạm vào:** production implementation · `docs/specs/v1.0/` · spike result · bất kỳ file nào trong `management/spikes/`.

### Các bước

| # | Ai | Làm gì |
|---:|---|---|
| 1 | Mỗi thành viên | Branch từ `main` mới nhất, tên `chore/practice-<tên>` |
| 2 | Mỗi thành viên | Sửa **chỉ** file luyện tập của mình: `management/onboarding/practice/PRACTICE_<TÊN>.md` — thêm vài dòng tự giới thiệu vai trò |
| 3 | Mỗi thành viên | Commit với message có ID giả lập, ví dụ `chore(practice): PRACTICE-01 add role summary` |
| 4 | Mỗi thành viên | Mở PR vào `main` |
| 5 | **Người review** | Theo cặp chéo: Tuấn Anh ↔ Hùng Anh, Quốc Khánh ↔ Đức Trung |
| 6 | Người review | **Cố ý yêu cầu MỘT thay đổi** (`NEEDS_FIX`) — ví dụ "thiếu tên reviewer của bạn" |
| 7 | Tác giả | Cập nhật, push tiếp |
| 8 | Người review | `APPROVE` |
| 9 | Leader | Squash merge một PR để mọi người thấy kết quả |

### Kết quả mong đợi chính xác

Cuối bài, **cả 4 người phải đã tự tay làm được**:

```text
✔  tạo nhánh từ main mới nhất
✔  commit có message chứa ID
✔  mở PR
✔  NHẬN một NEEDS_FIX và xử lý nó
✔  ĐƯA một NEEDS_FIX cho người khác
✔  approve
✔  thấy squash merge xảy ra
```

### Câu hỏi kiểm tra

> **"Bạn phát hiện task của mình cần sửa một file mà người khác cũng đang sửa, và đó là geometry contract. Bạn làm gì?"**

**Đáp án mong đợi:** **Dừng và phối hợp.** Đó là file **integration-sensitive** (`15` §9). Chỉ một chủ sở hữu hoạt động tại một thời điểm; task thứ hai tạm dừng hoặc đổi thứ tự, trừ khi leader chuyển thành pair work.

**Hiểu nhầm nguy hiểm:** "cứ sửa rồi giải quyết conflict lúc merge". → Conflict văn bản không phải vấn đề chính; **conflict ngữ nghĩa trên hợp đồng geometry** mới là vấn đề.

---

# 15:30 – 15:45 · GIẢI LAO

---

# 15:45 – 16:45 · OWNERSHIP / BRIEFING CÁ NHÂN

## 15:45–16:05 · Công bố ownership công khai trước

**Chiếu:** `PROJECT_ONE_PAGE_MAP.md` §4

Đọc to **cả bốn** người, cả hai trục. Nhấn ba điểm:

1. **Mỗi người là Primary Owner trên CẢ HAI trục** — một mobile vertical **và** một technical block.
2. **Mỗi khối có Secondary Reviewer có tên.** Reviewer phải **tự giải thích được khối đó**, không chỉ đọc lướt PR.
3. **Anti-bottleneck là ràng buộc:** KHÔNG chuyển ML khỏi Bế Quốc Khánh, KHÔNG chuyển Backend khỏi Nguyễn Gia Đức Trung vì lý do tốc độ. Hai người mạnh hơn được đặt làm **lưới an toàn**, không phải người làm thay.

## 16:05–16:45 · Mỗi người đọc brief của mình

Phát brief, cho **20 phút đọc yên tĩnh**, rồi **mỗi người trình bày 5 phút** trước cả nhóm.

### Mười câu mỗi người PHẢI trả lời được

```text
 1.  Mobile vertical chính của tôi là gì?
 2.  Technical block chính của tôi là gì?
 3.  Spike hiện tại của tôi là gì?
 4.  Đầu vào của tôi là gì?
 5.  Đầu ra của tôi là gì?
 6.  Ai review tôi?
 7.  Tôi được TỰ quyết những gì?
 8.  Những gì BẮT BUỘC phải qua DR / gate / phối hợp?
 9.  Bằng chứng nào đóng được task hiện tại của tôi?
10.  Ai tiêu thụ đầu ra của tôi?
```

**Cách chấm:** nghe **câu 7 và 8** kỹ nhất. Người trả lời mơ hồ ở đây là người sẽ tự ý đổi thứ đã đóng băng.

---

# 16:45 – 17:30 · CỬA SHARED-CORE

**Dùng:** [SHARED_CORE_CHECK.md](SHARED_CORE_CHECK.md)

### Cách tiến hành — **5 câu được chấm / người**

- Hỏi miệng, xoay vòng. Không phải bài thi viết.
- **Tải chuẩn: mỗi người 5 câu được chấm**, mỗi câu một nhóm:

| # | Nhóm | Rút từ |
|---:|---|---|
| 1 | Tính hợp lệ khoa học / leakage | Q1 · Q2 · **Q3** · Q7 · Q8 |
| 2 | Ngứ nghĩa artifact | **Q4** · **Q5** · Q6 · Q11 |
| 3 | Toạ độ canonical / 2D↔3D | **Q9** · Q10 |
| 4 | Workflow / evidence / DR | Q12 · **Q13** · **Q14** · Q15 |
| 5 | Theo vai trò | mục câu hỏi theo vai trò |

- **Tất cả 15 câu vẫn là ngân hàng** — xoay các câu giữa bốn người để không ai nghe trước đáp án của
  đúng câu mình sẽ bị hỏi.
- **Hỏi THÊM** bất cứ khi nào: câu trả lời nghe như **học thuộc** · **lập luận không rõ** · xuất hiện
  **hiểu nhầm nguy hiểm**. 5 là tải chuẩn, không phải trần.
- **Chỉ hai kết quả:** **`PASS`** hoặc **`NEEDS_CLARIFICATION`**.
- **Tiêu chuẩn `PASS` KHÔNG ĐỔI.** Giảm số câu là hiệu chỉnh về tải, **không** làm giảm chuẩn đạt.
  Thời gian tiết kiệm được dùng để **đào sâu hơn**, không để kết thúc sớm.

### Nguyên tắc chấm

> **Đây KHÔNG phải kỳ thi học thuật có điểm số.**
>
> Một người `PASS` **chỉ khi** thể hiện **hiểu biết end-to-end đủ dùng** — nghĩa là giải thích được **vì sao**, không chỉ nhắc lại **cái gì**.
>
> **Không chấp nhận học thuộc thay cho hiểu.** Nếu nghi ngờ ai đó đang đọc lại câu trả lời mẫu, **hỏi lại bằng một tình huống khác**: *"nếu thay vì X mà là Y thì sao?"*

### Nếu ai đó `NEEDS_CLARIFICATION`

Không sao — đó là mục đích của cửa này. `14` §2.1 quy định:

> Thành viên chưa qua cửa **vẫn làm việc theo cặp trên shared-core**, chưa nhận quyền sở hữu sâu độc lập.

Ghi rõ **cần làm rõ điểm nào** vào `DAY0_SIGNOFF.md`, và hẹn buổi làm rõ ngắn trước hoặc đầu Day 1.

---

# 17:30 – 18:00 · SẴN SÀNG CHO DAY 1

**Dùng:** [DAY1_READINESS_CHECKLIST.md](DAY1_READINESS_CHECKLIST.md)

### Xác nhận từng người

| # | Mục | Cách kiểm |
|---:|---|---|
| 1 | **Repository access** | Đã push được nhánh và mở PR trong bài drill |
| 2 | **Khả năng branch/PR** | Đã chứng minh trong bài drill |
| 3 | **Tooling local cần thiết** | Đã cài, chạy thử được |
| 4 | **Hiểu member brief** | Đã trả lời 10 câu ở phần 15:45 |
| 5 | **Hiểu spike `TASK.md` của mình** | Nói được acceptance criteria và fail condition |
| 6 | **Biết reviewer của mình là ai** | Nói tên đúng |
| 7 | **Biết hành động đầu tiên Day 1** | Nói cụ thể, không chung chung |
| 8 | **Biết cách leo thang blocker** | Báo leader ngay, không giấu tới EOD |

### Điền `DAY0_SIGNOFF.md`

Điền **bằng tay**, theo người thật. **Không được điền sẵn `PASS`.**

### Nhắc lại ranh giới — đọc to

> **Cuối Day 0:**
>
> - **KHÔNG spike nào được `ACTIVE`.**
> - **Mọi `started_at` vẫn là `null`.**
> - **Không có `RESULT.md`.**
> - **Không tải dataset chính thức như công việc Spike D.**
>
> **Execution Day 1 = 2026-09-10, và chỉ bắt đầu khi tôi tuyên bố rõ ràng.**
> **Đồng hồ trigger DR-001 bắt đầu từ lúc đó. Không lùi ngày `started_at`.**

### Chuỗi sau Day 0 — nói rõ cho cả nhóm

```text
Day 0 hôm nay
   → DAY0_SIGNOFF.md (người thật ghi mức sẵn sàng thực)
   → MỘT LƯỢT RIÊNG sau đó: Project Control sinh baseline 30 ngày CÓ ĐIỀU KIỆN
   → leader CHẤP NHẬN baseline
   → DAY1_READINESS_CHECKLIST.md (cửa cuối)
   → leader TUYÊN BỐ Execution Day 1 = 2026-09-10
   → spike chuyển ACTIVE với started_at THẬT
```

**Điều kiện C1, C4, C6 vẫn MỞ — và chúng KHÔNG chặn việc tạo baseline.** Chúng xuất hiện **bên trong**
baseline như gate, dependency, điểm bất định trên critical path, decision point, và recovery trigger.
Baseline **không được âm thầm đóng băng** Path A/B, mobile framework, DINOv2 recipe, ngân sách mesh,
biểu diễn lỗi 3D, hay chiến lược transport.

### Việc đầu tiên Day 1 — đọc to từng người

| Người | Hành động đầu tiên 2026-09-10 |
|---|---|
| **Bế Quốc Khánh** | Đặt Spike D → `ACTIVE`, ghi `started_at` thật, bắt đầu tải gói theo **§Day-one ordering** trong `SPIKE_D_DATASET/TASK.md` |
| **Phạm Tuấn Anh** | Đặt Spike A → `ACTIVE`, ghi `started_at`, **chụp profile thiết bị DR-006 trước tiên** (tiền đề của cả A, B, E) |
| **Vũ Hùng Anh** | Đặt Spike B → `ACTIVE`, ghi `started_at`, bắt đầu bộ canonical geometry fixture |
| **Nguyễn Gia Đức Trung** | Đặt Spike E → `ACTIVE`, ghi `started_at`, dựng Mac mini backend stub + xác minh overlay |

---

## PHỤ LỤC — Dấu hiệu hiểu nhầm cần bắt ngay

Nếu nghe thấy bất kỳ câu nào dưới đây trong ngày, **dừng lại và chấn chỉnh tại chỗ**:

| Câu nói | Vì sao nguy hiểm | Chấn chỉnh bằng |
|---|---|---|
| *"Ta phải chứng minh DINOv2 tốt hơn"* | Gian lận khoa học vô ý | `PR-SCI-03`, `TC-SCI-003` |
| *"Sửa xong thì cập nhật prediction"* | Ghi đè artifact bất biến | `03` §4 điều kiện loại bỏ MVP |
| *"Chia slice cho nhiều dữ liệu hơn"* | Data leakage | `13` §12 P0 |
| *"Không có GT thì cứ hiện Dice = 0"* | Bịa số liệu | `PR-MODE-01`, `GROUND_TRUTH_UNAVAILABLE` |
| *"Slice rỗng cả hai thì Dice = 1"* | Thổi phồng metric | `07` §6 |
| *"Numpy trả về thế thì để thế"* | Sinh lỗi P0 mapping | DR-008a, adapter phải conform |
| *"Nới ±1 slice lên ±3 cho nó pass"* | Vi phạm SCQ-06 | Phải qua DR |
| *"Cái đó chưa chốt nên tôi chọn đại"* | Hiểu sai "chưa đóng băng" | `TEAM_SHARED_CORE.md` §L.3 |
| *"Cứ tải dataset hôm nay cho sớm"* | Làm sai đồng hồ DR-001 | Day 0 boundary |
| *"Có `RESULT.md` rồi là xong"* | Bỏ qua 4 bước nghiệm thu | `TEAM_WORKFLOW_QUICKSTART.md` §10 |
