# DAY 9 — Bế Quốc Khánh · 2026-09-18

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8,25 h)* · hàng đợi dự phòng ~2 h · **hạn: 23:59**.

> **Day 8 là ngày đầu tiên sau bốn ngày liên tiếp mà phần việc của bạn land trước nửa đêm, và land rất sớm:** #40 hết
> nháp và lên `main` (merge 11:37), tuyên bố loại trừ `A17` kèm `package_findings`, ba lần trả lời review #34, kế hoạch
> đo C1 và gói `TC-TEAM-001` V3, tất cả trong **11:01–11:40**. Luật *"việc chặn người khác đi trước"* có tác dụng ngay
> ngày đầu áp dụng.
>
> Và QA độc lập xác nhận công việc của bạn **từ byte, không phải từ lời**: đọc thẳng 462 header NRRD từ ZIP ra **85/69**
> case đúng như manifest; **0 trường `key:=value` tuỳ biến**; **tập loại trừ và train hiệu dụng 78 của `DR-002b`** được
> tính lại độc lập và khớp.

## 📌 Mới hôm nay — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **#34 đóng băng ở head `f118491`** | **Không đẩy thêm vào #34** cho tới khi merge. Hai việc nhỏ còn lại (`anomalies` trong `summary`, lệnh sinh lại thật) đi **PR riêng ngay sau merge**, việc 4. Lý do: mỗi lần #34 đổi head, lượt duyệt lại của Hùng Anh và lượt QA phải chạy lại từ đầu |
| **Review #37 và #42 chuyển sang leader** | Không còn chờ Hùng Anh; leader duyệt trong buổi sáng |
| **SCR-04 giao cho V1** | V3 của bạn giữ SCR-01, SCR-07 |

> **📌 Mới 14:05 — #37 và #42 đã merge** (`fae2b0b`, `abb45af`). Leader chạy lại #37 trên máy mình: bản bạn đẩy
> lúc 11:40 **khớp tới từng chữ số** với kết quả dự đoán, cách RTX 4050 của bạn 2,1e-5. Dòng preflight
> *"`pipeline_bringup.py` merged"* giờ đã đúng. Còn lại của bạn: việc 5 `c1_preflight.py`; #35 chờ #34 merge rồi
> sinh lại và nhờ Trung duyệt lại.

> **📌 Mới 21:40 — `GATE-DATA-01` ĐÃ ĐÓNG, Spike D `ACCEPTED`.** #34 merge lúc 21:30 (`7d49df4`), QA-003 chạy lại trên
> `main` và **`PASS`**: cả năm lỗi chặn F1–F5 của QA-002 đã được kiểm chứng trên `main`
> ([`../QA_REVIEW_003_SPIKE_D_FINAL.md`](../QA_REVIEW_003_SPIKE_D_FINAL.md)). **Việc của bạn mở khoá ngay:** ① **sinh lại
> split #35** trên manifest `main` rồi nhờ Trung duyệt lại — `GATE-SPLIT-01` đóng trên PR này · ② **PR follow-up #34**
> (việc 4): `anomalies` + `package_findings` vào `summary` (F13), lệnh sinh lại thật (F12), và QA đề nghị thêm phép đo
> *`laendo` không chồng `lawall`* vào verdict `A11` thay cho chỉ so SHA.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **Trả lời câu hỏi "4 nhóm hay 3 thành phần liên thông" trên #35.** QA tính lại độc lập ra **4 cặp** trên ngưỡng `r ≥ 0.75`, nhưng chúng gộp thành **3 thành phần liên thông** vì một case nằm trong hai cặp; bản ghi của bạn nói **4 nhóm**. Có thể phương pháp của bạn tìm ra cặp thứ tư, hoặc chữ "nhóm" đang được đếm theo cặp. Cả hai đều chính đáng, nhưng **nhóm phải bắc cầu**: nếu `A~B` và `B~C` thì tách `A` khỏi `C` vẫn là rò rỉ, mà `DR-002b` đòi nhóm **giữ nguyên qua mọi tập con**. Thống nhất một định nghĩa trong manifest và `SPLIT_RESULT.md` | ~1 h | không | Định nghĩa bắc cầu, số nhóm khớp giữa manifest, `SPLIT_RESULT.md` và `verify_dr002b.py` |
| **2** | **#35 hết nháp, rồi sinh lại split trên manifest mới** sau khi #34 merge (SHA manifest đổi). Cập nhật `SPLIT_RESULT.md`, nhờ Trung duyệt lại. `GATE-SPLIT-01` đóng trên PR này | ~1,5 h | #34 merge. Chưa merge thì làm việc 5 trước | #35 ready, Trung duyệt lại |
| **3** | **#42 hết nháp**, nhờ **leader** review (kế hoạch C1 + `TC-TEAM-001` V3) | ~15 ph | không | #42 ready |
| **4** | **PR follow-up #34** (tạo **sau khi #34 merge**): ① thêm `anomalies` và `package_findings` vào khối `summary`, vì số anomaly đã đi 0 → 2 → 4 qua ba bản manifest mà `summary` không đổi một chữ số (`F13`) · ② thay `<private ZIP path>` trong `restricted_manifest.regenerate` bằng **lệnh đã thật sự chạy**, đường dẫn riêng tư thì giữ ngoài repo (`F12`) | ~1 h | #34 merge. Chưa merge thì làm việc 5 trước | PR riêng, CI xanh |

## Việc Day 9

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **5** | **`c1_preflight.py`** theo §preflight trong `C1_MEASUREMENT_PLAN.md`: sinh `c1_preflight_<ts>.json` kiểm Spike D `ACCEPTED`, `GATE-DATA-01` và `GATE-SPLIT-01` đã đóng, manifest trên `main`, hash (manifest, màn sàng lọc hạn chế, code, preprocessing), subset **20/38/78**, `CASE_0117`/`CASE_0133` đã bị loại, không case validation/holdout nào với tới được. **Phải từ chối chạy khi gate còn mở**: kiểm bằng chính trạng thái hiện tại, ca kiểm đó phải `FAIL` | ~2 h | **máy RTX 4050 của bạn**, ZIP local. **Không cần Mac mini** | Script + ca kiểm `FAIL` khi gate mở, trên PR |
| **6** | **Thiết kế SCR-01 và SCR-07** (trung lập công nghệ, không vi phạm `GATE-MOB-01`): ma trận trạng thái theo `10` §8 (loading / không khả dụng / đang xử lý / lỗi thử lại được / dữ liệu hỏng); bảng so sánh UNet vs DINOv2 × 25/50/100 % **kèm N**; nhãn **"không so được"** cho run không cùng quần thể đánh giá, khớp endpoint `experiment_compare` của hợp đồng API (#45) | ~2 h | không | Artifact thiết kế, gộp vào gói V3 |
| **7** | **Phản hồi [review #37](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/37) — đã có lúc 01:05, `CHANGES_REQUESTED`, hai việc bắt buộc.** ① Trong `probe.DinoSeg.__init__`, nạp backbone **bên trong `torch.random.fork_rng(devices=[])`** (hoặc seed lại ngay trước khi dựng decoder): `Dinov2Model.from_pretrained` **tiêu RNG toàn cục** ở `transformers` 4.51.3, nên trọng số khởi tạo của decoder đổi theo phiên bản thư viện. Chạy lại độc lập trên GPU khác cho `loss 0,6431 · dice 0,2250` thay vì `0,7275 · 0,2885` của bạn; bọc `fork_rng` thì ra `0,7275 · 0,2884`, tức khớp lại. UNet tái lập bình thường, nên đây là đường DINOv2 · ② ghi `transformers`, `huggingface_hub` (và cuDNN khi chạy CUDA) vào `framework`, rồi **sinh lại** `EVIDENCE_RAW/c0_pipeline_bringup_20260916.json`. Không chặn merge: `selftest` in chuỗi cứng `5/5 PASS`. Trên máy bạn số **không được đổi** quá ~1e-5; đó chính là phép kiểm | ~45 ph | không (review đã có) | #37 `APPROVED` sau khi đẩy bản sửa |

**Tổng phần chính: ~8,5 h.**

> Bộ đòn của lượt review, ba JSON chạy lại và cách tái lập: [`../review037/`](../review037/). QA sẽ chạy lại đúng bộ này
> trên máy khác trước khi bất cứ thứ gì thành `ACCEPTED`, nên sửa xong là qua.

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H1, H2, H10 / SCR-01, SCR-07**: mọi con số trên màn
> hình có **N** và truy được về artifact sinh ra nó (**D2**); run không so được thì **hiện nhãn**, không lặng lẽ ẩn đi.
> Giảng viên sẽ bấm vào một outlier và muốn thấy nó đến từ đâu, và `DR-002b` là câu trả lời có thể bảo vệ được.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Nếu cả hai cổng đóng trong ngày:** chạy **preflight thật** và bắt đầu **`C1-1`** (xác nhận hoặc sửa lại C0 trên dữ liệu thật). Chỉ subset train; **không mở nhãn 54 case holdout** | ~1,5 h | `c1_preflight_<ts>.json` `PASS` + bản ghi `C1-1` |
| **`C0-3` — tìm trần batch thật** cho các biến thể đang ghi `16 (cap)` | ~1 h | commit trên nhánh C0 |

---

**Ranh giới không đổi:** `SPIKE_C1` còn `BLOCKED` cho tới khi **cả hai** cổng đóng: **không train, không đọc case thật
cho C1, không mở nhãn holdout** · không commit byte dataset · **không commit điểm tương quan từng cặp** (ruling
`DR-002b` × `F5`) · không tự chuyển `ACCEPTED`. **Liên quan:** PR #34 · #35 · #37 · #42 ·
[`../../day08/QA_REVIEW_003_SPIKE_D_PRELIM.md`](../../day08/QA_REVIEW_003_SPIKE_D_PRELIM.md) §9
