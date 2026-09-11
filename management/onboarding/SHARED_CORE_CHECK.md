# SHARED CORE CHECK

**Dùng lúc:** 16:45–17:30 Day 0 (2026-09-09)
**Hình thức:** hỏi miệng, xoay vòng — **không phải bài thi viết**
**Tải chuẩn:** **5 câu được chấm / người** (1 câu mỗi nhóm) · hỏi thêm khi cần — xem §Cách dùng
**Ngân hàng câu hỏi:** toàn bộ 15 câu shared-core + các câu theo vai trò — **giữ nguyên, không bỏ câu nào**
**Kết quả:** **`PASS`** hoặc **`NEEDS_CLARIFICATION`**
**Người chấm:** Phạm Tuấn Anh (Team Leader)

---

## Cách dùng — giao thức vận hành

**Tất cả 15 câu shared-core và các câu theo vai trò ở dưới là NGÂN HÀNG CÂU HỎI.**
Không phải ai cũng bị hỏi hết — 45 phút không đủ để bốn người lập luận qua 6–8 câu sâu mỗi người.

### Tải chuẩn: **5 câu được chấm / người**

Mỗi thành viên nhận **5 câu hỏi miệng được chấm**, mỗi câu lấy từ một nhóm:

| # | Nhóm | Rút từ ngân hàng |
|---:|---|---|
| **1** | **Tính hợp lệ khoa học / leakage** | Q1 · Q2 · **Q3** · Q7 · Q8 |
| **2** | **Ngữ nghĩa artifact** | **Q4** · **Q5** · Q6 · Q11 |
| **3** | **Toạ độ canonical / 2D↔3D** | **Q9** · Q10 |
| **4** | **Workflow / evidence / DR** | Q12 · **Q13** · **Q14** · Q15 |
| **5** | **Theo vai trò** | mục "CÂU HỎI THEO VAI TRÒ" ở cuối file |

**Câu in đậm là khuyến nghị mạnh** — chúng bắt những hiểu nhầm nguy hiểm nhất. Xoay các câu khác giữa
bốn người để không ai nghe trước câu trả lời của người khác cho đúng câu mình sẽ bị hỏi.

### Khi nào hỏi THÊM ngoài 5 câu

Facilitator **phải** hỏi thêm bất cứ khi nào:

| Dấu hiệu | Hành động |
|---|---|
| Câu trả lời **nghe như học thuộc** | Hỏi lại bằng tình huống khác: *"nếu thay X bằng Y thì sao?"* |
| **Lập luận không rõ** | Đào sâu một câu cùng nhóm |
| **Xuất hiện một hiểu nhầm nguy hiểm** | Hỏi thêm cho tới khi rõ đó là nhầm lẫn nhất thời hay hiểu sai thật |

Không có trần số câu. 5 là **tải chuẩn**, không phải giới hạn.

### Nguyên tắc chung

- Các câu này **kiểm tra lập luận**, không kiểm tra trí nhớ vụn.
- Đáp án "tối thiểu chấp nhận được" là **sàn**, không phải khuôn. Diễn đạt khác mà đúng bản chất thì vẫn đạt.
- **Tiêu chuẩn `PASS` KHÔNG ĐỔI** — vẫn đòi hiểu biết end-to-end đủ dùng. Giảm số câu **không** làm
  giảm chuẩn đạt.

> ### ⚠ Không chấp nhận học thuộc thay cho hiểu
>
> Nếu nghi ngờ ai đang đọc lại đáp án mẫu, **hỏi lại bằng tình huống khác**: *"nếu thay X bằng Y thì sao?"*, *"cho tôi một ví dụ cụ thể trong dự án này."*
>
> **`PASS` chỉ khi người đó thể hiện hiểu biết end-to-end đủ dùng — giải thích được VÌ SAO, không chỉ nhắc lại CÁI GÌ.**

---

## Q1 · Dự án này thực chất đang cố chứng minh điều gì?

**Đáp án tối thiểu phải có:**
RQ-A — *một mô hình phân vùng dựa trên DINOv2 có suy giảm **ít hơn** UNet baseline khi lượng dữ liệu có nhãn bị giảm không?* Phải nhận ra đây là câu hỏi về **tốc độ suy giảm / tương tác**, không phải "cái nào tốt hơn nói chung". Nêu được RQ-B (morphology xác định giúp hay hại) là điểm cộng.

**Hiểu nhầm nguy hiểm:**
"Chứng minh DINOv2 tốt hơn UNet." — Đây là phát biểu **sai**, và là gốc của việc ép kết quả.

**Tiêu chí PASS:** phát biểu được RQ-A đúng chiều (suy giảm ít hơn), không biến nó thành "thắng".

---

## Q2 · DINOv2 có cần thắng UNet để dự án thành công?

**Đáp án tối thiểu phải có:**
**Không.** `PR-SCI-03` và `00` §14: thành công khoa học là **một câu trả lời hợp lệ**, kết quả null/âm được chấp nhận khi giao thức và bằng chứng vững. `TC-SCI-003` kiểm rằng bảng kết quả sinh từ artifact đã đóng băng, giữ thứ tự quan sát được, **không loại ca có chọn lọc hay tinh chỉnh để ép hướng của bài báo**.

**Điểm cộng:** nêu được mặt đối xứng — cũng **không** được trình bày kết quả null như bằng chứng "tương đương" nếu phép đo không đủ sức phân biệt; vì vậy **DR-014 ✅** yêu cầu **khoảng tin cậy 95%** và mục hạn chế.

**Hiểu nhầm nguy hiểm:**
"Nếu thua thì đổi setup / thử thêm cấu hình cho tới khi thắng."

**Tiêu chí PASS:** trả lời "không" và giải thích được vì sao ép kết quả là vi phạm, không chỉ là "không đẹp".

---

## Q3 · Vì sao không được chia ngẫu nhiên theo slice?

**Đáp án tối thiểu phải có:**
Các slice liền nhau của **cùng một bệnh nhân** gần như giống hệt nhau. Nếu slice 40 vào train và slice 41 vào test, mô hình đã thấy gần đúng câu trả lời ⇒ **data leakage**. Điểm số sẽ cao một cách vô nghĩa và **RQ-A mất giá trị**, vì ta không còn đo được khả năng tổng quát hoá sang **bệnh nhân mới**. Luật: chỉ split **patient-level**, không bệnh nhân nào xuyên partition (`06` §6, `NFR-REP-002`, `TC-EXP-008`).

**Hiểu nhầm nguy hiểm:**
"Chia theo slice thì có nhiều mẫu train hơn nên tốt hơn." — Đúng về số lượng, **nhưng kết quả đo được là giả**.

**Tiêu chí PASS:** giải thích được cơ chế (slice lân cận giống nhau) **và** hệ quả (metric giả, RQ-A vô giá trị). `13` §12 xếp leakage vào **P0**.

---

## Q4 · Phân biệt `GroundTruth`, `RawPrediction`, `ProcessedPrediction`, `ReviewedMask`

**Đáp án tối thiểu phải có:**

| Artifact | Là gì | Lớp |
|---|---|---|
| `GroundTruthMask` | Mask tham chiếu **do dataset cung cấp** (`laendo.nrrd`) | IMMUTABLE |
| `RawPredictionMask` | Đầu ra **trực tiếp của model** sau quy tắc threshold đã ghi rõ | IMMUTABLE |
| `ProcessedPredictionMask` | **Dẫn xuất** từ raw qua hậu xử lý xác định | DERIVED |
| `ReviewedMask` | Artifact **do người** tạo bằng brush correction | HUMAN, IMMUTABLE từng version |

**Điểm cộng:** nêu được `ProcessedPrediction` **không được âm thầm coi như** `RawPrediction`, và `ReviewedMask` **không bao giờ được gán nhãn là dataset ground truth** (`05` §4 invariant 6).

**Hiểu nhầm nguy hiểm:**
Gộp `ProcessedPrediction` với `RawPrediction`; hoặc coi `ReviewedMask` như "ground truth mới".

**Tiêu chí PASS:** phân biệt được cả bốn **và** xếp đúng vào ba lớp IMMUTABLE / DERIVED / HUMAN.

---

## Q5 · Vì sao sửa một prediction không được ghi đè `RawPrediction`?

**Đáp án tối thiểu phải có:**
Vì `RawPredictionMask` là **bằng chứng của experiment**. Ghi đè nó phá **tính tái lập** — không ai còn kiểm được mô hình thực sự đã dự đoán gì. `NFR-REL-001` và `FR-REV-009` bắt nó bất biến; **`03` §4 xếp "brush correction overwrites the original prediction" vào điều kiện LOẠI BỎ MVP**. Thay vào đó, commit tạo một **`ReviewedMask` version mới**, tham chiếu ngược source mask.

**Điểm cộng:** nêu `TC-REV-006` kiểm checksum của source mask **không đổi** sau khi lưu correction.

**Hiểu nhầm nguy hiểm:**
"Lưu đè lên là gọn hơn" / "cập nhật prediction".

**Tiêu chí PASS:** nêu được lý do **tái lập/bằng chứng**, không chỉ "vì spec nói vậy".

---

## Q6 · Evaluation Mode vs Inference & Review Mode

**Đáp án tối thiểu phải có:**

- **Evaluation Mode** — có MRI **+ GT** + prediction ⇒ Dice/IoU, metric per-slice, bản đồ FP/FN, hình dung lỗi 2D/3D, so sánh experiment, phân tích outlier.
- **Inference & Review Mode** — có MRI + prediction, **không GT** ⇒ soi 2D, tái dựng 3D, review, flag, brush, finding.
- **Không** metric phụ thuộc GT nào được xuất hiện khi không có GT. API trả **`GROUND_TRUTH_UNAVAILABLE`**.

**Hiểu nhầm nguy hiểm:**
"Không có GT thì hiện Dice = 0" hoặc "hiện biểu đồ rỗng". Cả hai đều **bịa số liệu**: `0.00` hàm ý mô hình sai hoàn toàn; biểu đồ rỗng hàm ý lỗi bằng không (`TC-USAB-003`).

**Tiêu chí PASS:** phân biệt được hai chế độ **và** nói được hành vi đúng khi thiếu GT là **trạng thái "không khả dụng" rõ ràng**.

---

## Q7 · Vì sao dùng 3D Dice cấp ca làm metric chính, không gộp voxel toàn cohort?

**Đáp án tối thiểu phải có:**
Nếu gộp toàn bộ voxel của mọi bệnh nhân vào một mask khổng lồ, **bệnh nhân có tâm nhĩ lớn sẽ chi phối điểm số** — kết quả phản ánh vài ca lớn, không phản ánh "mô hình hoạt động thế nào trên một bệnh nhân điển hình". Tính per-case rồi tổng hợp cho **mỗi bệnh nhân một phiếu bằng nhau**. `07` §6 nói thẳng cohort summary **dẫn xuất từ giá trị per-case**, không phải từ voxel gộp.

**Điểm cộng:** nêu được ba entity `CaseMetricSet` / `SliceMetric` / `CohortMetricSummary` (SCQ-02).

**Hiểu nhầm nguy hiểm:**
"Gộp hết lại thì mẫu lớn hơn, chính xác hơn."

**Tiêu chí PASS:** nêu được cơ chế thiên lệch theo kích thước tâm nhĩ.

---

## Q8 · Slice mà cả GT và prediction đều rỗng thì Dice bằng bao nhiêu?

**Đáp án tối thiểu phải có:**
**`NOT_APPLICABLE` / `NaN`**, và **bị LOẠI** khỏi trung bình và phân bố per-slice. **Không phải `1`.**
Lý do: một khối MRI có rất nhiều slice hoàn toàn là nền; gán `1` sẽ **thổi phồng** điểm per-slice bằng hàng chục slice không chứa thông tin.

**Điểm cộng:** nêu đủ ba nhánh của luật — GT có/pred rỗng → `0`; GT rỗng/pred có → `0`; cả hai rỗng → `NOT_APPLICABLE`. Và: metric **3D cấp ca vẫn tính bình thường** trên toàn khối.

**Hiểu nhầm nguy hiểm:**
"Cả hai đều đúng là rỗng nên Dice = 1."

**Tiêu chí PASS:** trả lời `NOT_APPLICABLE`/loại trừ **và** giải thích được vì sao `1` là sai.

---

## Q9 · Giải thích `(x, y, z)` và `slice_index`

**Đáp án tối thiểu phải có:**

```text
x = source image COLUMN      y = source image ROW      z = source SLICE INDEX
shape_xyz = [Nx, Ny, Nz]     slice_index = z ∈ 0..Nz-1
slice shape = [Ny, Nx]       (u,v) → (x=u, y=v, z=slice_index)
gốc: pixel trên-trái = (0,0)   +x → phải   +y → xuống
```

**Và điều quan trọng nhất:** **memory order của thư viện KHÔNG thuộc hợp đồng.** Adapter phải chuyển về biểu diễn canonical **ở mọi biên** — payload API, metadata artifact, geometry fixture, mô hình slice trong app.

**Hiểu nhầm nguy hiểm:**
"Thư viện tôi dùng trả về thứ tự khác nên tôi để nguyên." → Đây chính là cách sinh lỗi **P0** mapping 2D/3D (`13` §12).

**Tiêu chí PASS:** nói đúng ba trục **và** nêu được luật memory-order-không-phải-hợp-đồng.

---

## Q10 · Vì sao 3D cần liên kết xác định về 2D?

**Đáp án tối thiểu phải có:**
Vì `03` §4 xếp **"3D is decorative only and cannot link back to MRI slices"** vào **điều kiện LOẠI BỎ MVP**. Giá trị của 3D là **điều tra lỗi không gian**: người dùng thấy một vùng lỗi trong 3D, chọn nó, và app phải mở **đúng** slice 2D chứa bằng chứng đó (`FR-3D-005/006`, `FR-3D-008`).
Luật độ chính xác đã đóng băng (SCQ-06): **fixture canonical → chính xác tuyệt đối**; **mesh thật đã decimate → sai số ≤ ±1 source slice**.

**Điểm cộng:** nêu được **DR-008c (ngân sách mesh) vẫn MỞ**, và mức decimation vượt ±1 slice là không chấp nhận được **bất kể frame rate**.

**Hiểu nhầm nguy hiểm:**
"3D chỉ để demo cho đẹp." / "Nới dung sao lên ±3 cho mượt."

**Tiêu chí PASS:** nêu được 3D là công cụ phân tích, và nhớ ràng buộc ±1 slice.

---

## Q11 · Chuyện gì xảy ra khi người dùng commit một brush correction?

**Đáp án tối thiểu phải có:**
Một **`ReviewedMask` version MỚI, bất biến** được tạo, tham chiếu **đúng source mask** đã khai. **`RawPrediction` không bị thay đổi.** Version `ReviewedMask` trước đó cũng **không** bị sửa — version mới trỏ về nó qua `parent_reviewed_mask_id`. Trạng thái review có thể thành `CORRECTED`, và `CORRECTED` **đòi ít nhất một `ReviewedMask` đã lưu thành công**.

**Điểm cộng:** nêu `Finding` **không bắt buộc** (SCQ-01); `Review` gắn với **source mask + variant tường minh** (DR-009); `revision` đơn điệu và `STALE_REVISION` chống ghi cũ; **không có huấn luyện lại tự động** sau đó.

**Hiểu nhầm nguy hiểm:**
"Nó cập nhật mask hiện có" / "phải tạo Finding kèm theo".

**Tiêu chí PASS:** nêu được "version mới bất biến" **và** "raw không đổi".

---

## Q12 · Còn điều gì CHƯA quyết về mobile framework?

**Đáp án tối thiểu phải có:**
**Chính framework chưa được chọn.** `GATE-MOB-01` / `DR-G05` **chỉ được đóng sau khi có bằng chứng của CẢ Spike A VÀ Spike B**. `09` §7 bắt lựa chọn phải được biện minh bằng **bằng chứng spike**, không phải bằng sự quen tay.

**Điểm cộng:** nêu thêm các mục chưa đóng băng khác — variant/decoder DINOv2 cuối (cần Spike C1, C0 **không đủ**), ngân sách mesh (DR-008c), biểu diễn lỗi 3D (DR-005), Path A/B thực tế (Spike D), transport/fallback (Spike E), ngân sách first-load.

**Hiểu nhầm nguy hiểm — quan trọng:**
"Chưa chốt nên tôi cứ chọn cái tôi thích." → **Sai.** "Chưa đóng băng" nghĩa là **chưa ai có quyền quyết, và nó sẽ được quyết bằng bằng chứng qua đúng cửa** (`TEAM_SHARED_CORE.md` §L.3).

**Tiêu chí PASS:** nêu được framework chưa chốt **và** hiểu đúng nghĩa "chưa đóng băng".

---

## Q13 · Nếu việc hiện thực của bạn đòi đổi một hợp đồng đã đóng băng thì làm gì?

**Đáp án tối thiểu phải có:**
**Dừng lại và mở Decision Request.** Không tự sửa. Quy trình `00` §13:

```text
Problem → Decision Request → impact analysis → leader/spec-owner approval
        → specification update → implementation
```

**Điểm cộng:** liệt kê được các mục **không** được đổi ngầm dù là Primary Owner (DR-013): frozen product requirement · dataset protocol · split protocol · ML protocol · metric semantics · geometry semantics · domain-model semantics · API contract · deployment policy · acceptance criteria. Và `17` §15: **code không bao giờ được dùng để định nghĩa lại spec chỉ vì code đã tồn tại.**

**Hiểu nhầm nguy hiểm:**
"Tôi là Primary Owner nên tôi quyết được." / "Sửa trước, báo sau."

**Tiêu chí PASS:** nói "dừng và mở DR", và biết quyền owner không bao gồm việc này.

---

## Q14 · Điều gì làm một spike trở thành `ACCEPTED`?

**Đáp án tối thiểu phải có:**
**Không phải chỉ vì `RESULT.md` tồn tại.** Cần đủ bốn bước:

```text
Owner thực thi → EVIDENCE_READY
  → Secondary Reviewer  → APPROVE / NEEDS_FIX
  → CHAT E QA Red Team  → PASS / REJECT
  → CHAT A Project Control → ACCEPTED
```

**QA REJECT chặn nghiệm thu bất kể ý kiến của owner hay reviewer.** Với các gate dựa trên bằng chứng — **Spike D, B, F** — QA phải **soi bằng chứng thực tế**, không chỉ verdict tóm tắt.

**Điểm cộng:** nêu thêm — bằng chứng phải **thật**, do người thật ghi; không còn `[UNVERIFIED]` ở trường mà kết quả phụ thuộc; mọi acceptance criterion trả lời pass/fail; **ràng buộc đóng băng không bị nới**; và **`NEGATIVE_RESULT` là kết quả hợp lệ**, không được biến thành pass bằng cách nới ràng buộc.

**Hiểu nhầm nguy hiểm:**
"Viết `RESULT.md` là xong" / "reviewer approve là xong".

**Tiêu chí PASS:** nêu được cần cả reviewer **và** QA, và `RESULT.md` ≠ `ACCEPTED`.

---

## Q15 · Trách nhiệm của bạn vs trách nhiệm của reviewer?

**Đáp án tối thiểu phải có:**

**Primary Owner chịu trách nhiệm:** hiểu khối · hiện thực · tests · bằng chứng nghiệm thu · debug · chuyển giao kỹ thuật · tài liệu của khối · **giải thích và bảo vệ được công việc**.

**Secondary Reviewer phải có khả năng:** **tự giải thích khối đó độc lập** · review thiết kế · review PR/bằng chứng · **chạy lại hoặc tái tạo luồng quan trọng** · **giúp debug khi Primary bị chặn** (`14` §5).

**Và:** quyền Primary Owner **KHÔNG** cho phép đổi ngầm bất kỳ mục đã đóng băng nào.

**Điểm cộng:** nêu reviewer trả về đúng một trong `APPROVE` / `NEEDS_FIX` / `BLOCKED_DECISION_REQUIRED`, và **im lặng không phải approve** (`15` §11). Nêu **anti-bottleneck rule**: không chuyển ML khỏi Bế Quốc Khánh, không chuyển Backend khỏi Nguyễn Gia Đức Trung vì tốc độ ngắn hạn.

**Hiểu nhầm nguy hiểm:**
"Reviewer chỉ cần đọc diff." / "Khối của tôi thì chỉ tôi cần hiểu."

**Tiêu chí PASS:** nêu được reviewer phải **tự giải thích và chạy lại được**, không chỉ đọc lướt.

---

# CÂU HỎI THEO VAI TRÒ (tuỳ chọn — hỏi thêm nếu còn thời gian)

## Cho Bế Quốc Khánh — ML / Dataset

> **"Spike D của bạn xong. Bạn thấy trong partition test có file nhãn. Bạn có được chọn Path A luôn không?"**

**Đáp án mong đợi:** **Không.** Spike D tạo **bằng chứng**; việc **chọn** path là **DR-002 / GATE-SPLIT-01** — quyết định của leader/spec owner. Và Path A còn đòi **provenance xác minh được**, không chỉ "có file".

> **"Trigger DR-001 là gì và tính từ khi nào?"**

**Đáp án mong đợi:** cuối **ngày execution đầu tiên** (2026-09-10) — nếu không có gói dùng được **cục bộ**, hoặc validation lộ defect chặn `GATE-DATA-01`, thì **RA-H01 leo lên BLOCKER** và mở quy trình dự phòng. **Không được âm thầm thay dataset khác.**

## Cho Vũ Hùng Anh — Geometry / 3D

> **"Bạn tìm được mức decimation cho 45 FPS nhưng picking sai 2 slice. Có dùng được không?"**

**Đáp án mong đợi:** **Không.** Ràng buộc SCQ-06 là **≤ ±1 source slice**, và mức vượt là **không chấp nhận được bất kể frame rate**. Nếu không mức nào thoả cả `NFR-PERF-002` và ±1 → ghi **`NEGATIVE_RESULT`** và leo thang. Độ chính xác thắng frame rate vì sai mapping là **P0**.

## Cho Nguyễn Gia Đức Trung — Backend / Transport

> **"Bạn đo transport trên Wi-Fi cùng mạng với Mac mini, số rất tốt. Có dùng làm bằng chứng nghiệm thu Spike E được không?"**

**Đáp án mong đợi:** **Không.** Bằng chứng nghiệm thu **phải** đo trên đường thật: Galaxy A17 5G → **cellular 4G/5G thật** → **ZeroTier overlay xác thực** → Mac mini ở xa. Kết quả LAN **chỉ là diagnostic**, có nhãn rõ. Wi-Fi hội trường **không tin cậy và không cần** cho demo.

> **"Hai hợp đồng ingestion khác nhau ở đâu?"**

**Đáp án mong đợi:** **Contract 1** nạp dataset thô/case (`MRICase`, `MRIVolume`, `GroundTruthMask`), chạy **một lần** trước training, gate bởi **GATE-DATA-01**. **Contract 2** nạp artifact experiment tiền tính toán (`Experiment`, `AnalysisRun`, mask, metric, mesh), chạy **lặp lại** sau mỗi lần đánh giá, gate bởi **GATE-SPLIT-01 + GATE-ML-01**. Dùng chung cơ chế (offline CLI + versioned manifest) nhưng là **hai hợp đồng riêng**, mỗi cái có schema, validator và acceptance test riêng.

## Cho Phạm Tuấn Anh — 2D / Integration / Leader

> **"Là leader, bạn có nên nhận thêm việc của người khác khi họ chậm không?"**

**Đáp án mong đợi:** **Không mặc định.** **Anti-bottleneck rule** là ràng buộc: không chuyển ML khỏi Bế Quốc Khánh, không chuyển Backend khỏi Nguyễn Gia Đức Trung vì tốc độ ngắn hạn. `15` §18 Level 2 **ghép cặp** — giữ ownership; **chuyển giao** thì phá ownership **và** phá chuỗi bằng chứng `TC-TEAM-001`. Reallocation là quyết định recovery có ghi lý do, không phải phản ứng mặc định với một ngày chậm.

---

# BẢNG CHẤM NHANH

| Q | Chủ đề | Tuấn Anh | Hùng Anh | Quốc Khánh | Đức Trung |
|---:|---|---|---|---|---|
| 1 | Mục tiêu nghiên cứu | | | | |
| 2 | Kết quả âm hợp lệ | | | | |
| 3 | Patient-level split / leakage | | | | |
| 4 | Bốn loại artifact | | | | |
| 5 | RawPrediction bất biến | | | | |
| 6 | Hai chế độ | | | | |
| 7 | Metric per-case | | | | |
| 8 | Empty-slice | | | | |
| 9 | Toạ độ canonical | | | | |
| 10 | 3D liên kết xác định | | | | |
| 11 | Commit correction | | | | |
| 12 | Chưa đóng băng ≠ tự chọn | | | | |
| 13 | Đổi hợp đồng → DR | | | | |
| 14 | Spike ACCEPTED | | | | |
| 15 | Owner vs Reviewer | | | | |
| | **KẾT QUẢ** | | | | |

Đánh dấu **5 câu đã chấm** cho mỗi người (mỗi nhóm một câu), để trống những câu không hỏi.
Ghi thêm các câu **hỏi bổ sung** nếu có, kèm lý do (nghe như học thuộc / lập luận không rõ / hiểu nhầm).

Ghi `PASS` / `NEEDS_CLARIFICATION` ở dòng cuối, và chuyển sang [DAY0_SIGNOFF.md](DAY0_SIGNOFF.md).
