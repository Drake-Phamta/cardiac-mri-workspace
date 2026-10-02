# DAY 23 — Bế Quốc Khánh · 2026-10-02 (thứ Sáu)

**Gói này lập tối 01/10, sau override Day 22.** Hôm qua leader dùng override một ngày, cho agent làm thay
trong mọi khối, rồi merge sau khi có QA độc lập (CHAT E, một LLM, không phải người thứ hai). **Quyền sở hữu
không chuyển.** Từ sáng nay khối ML và V3 trở lại với bạn, nên việc đầu tiên là duyệt lại phần làm thay và
nhận nó.

## 📌 Quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng |
|---|---|
| **Sáng 02/10 leader đã chốt** (`OPEN_DECISIONS.md` Part 2b) | **DR-016b:** nếu Hùng Anh REJECT C1 vì công thức hoặc bằng chứng thì GATE-ML-01 mở lại và hàng đợi UNet dừng ở cuối epoch; REJECT vì tài liệu thì chỉ sửa tài liệu. **DR-002c:** **không** có danh sách độ nhạy thứ hai, chỉ hai slot báo cáo; che số r ở `management/spikes/SPIKE_D_DATASET/RESULT.md:29` theo F5. **DR-018:** exporter xuất được thí nghiệm có case lỗi (case lỗi không có run, nằm trong failures) và xuất được run PROCESSED (EXP-D-PP, ghi `postprocessing_config_sha256`), trước đợt export D24. **DR-017:** CASE_0001 tính vào số liệu cohort; PR của Trung sửa các test V3 đọc bundle, bạn duyệt phần đó. **DR-021:** V3 chuyển `useSnapshot.js` sang `useCall` sau khi leader sửa abort |
| **DR-016**: hai máy tính toán | Họ **DINOv2** chạy trên PC leader (RTX 3050 Ti), bắt đầu 14:30 ngày 01/10. Họ **UNet** chạy trên **RTX 4050 của bạn**, bắt đầu **09:00 hôm nay**. Công thức giữ nguyên trên cả hai máy; máy chạy được ghi lại trong manifest của từng run |
| **DR-016a** (ghi sau C1, leader **đã xác nhận** 21:17 ngày 01/10) | Có **tripwire** ở epoch 1 của EXP-U-025 (xem việc 2). Nếu 4050 không chạy được trước 12:00 hôm nay, hoặc trượt tripwire, thì **lịch trễ, công thức không đổi**: UNet vẫn E = 50, batch 8 |
| **ADR-ML-001 ACCEPTED**, **GATE-ML-01 ĐÃ ĐÓNG** (14:30 ngày 01/10, C1 QA PASS WITH NOTES, `management/day22/QA_REVIEW_C1_GATE_ML_01.md`) | 560×560, batch 8, **E = 50**, loss 0,5·BCE + 0,5·softDice, AdamW 1e-4, bf16, seed 2024, ngưỡng 0,5. Chọn checkpoint theo Dice validation tính mỗi epoch. **Không đổi dòng nào khi đã bắt đầu run.** SPIKE_C1 ACCEPTED theo override; Vũ Hùng Anh duyệt lại |
| **GATE-SPLIT-01 đóng** (QA-005) | 06 §6 được ghi là **lệch, có ngoại lệ theo DR-002b**, không phải "đạt" |
| **DR-010a = (b)** | `worst_slice_selection` nằm trong `analysis_run_metrics`; backend tự xếp hạng |
| **#54 vẫn giữ** | `dataset_manifest.json` đóng băng ở `f64d461f` tới Day 30 |

## 🔴 Việc 1 — duyệt lại và nhận phần làm thay *(sáng, ~1,5 h, làm trước mọi thứ)*

Mỗi PR dưới đây được merge dưới override, sau khi QA đạt. Với mỗi PR: đọc diff, chạy test, rồi ghi
**"nhận"** hoặc **"cần sửa: …"** vào `management/day22/POST_RECOVERY_REVALIDATION_DAY23.md`.

| PR → `main` | Nội dung | Kiểm |
|---|---|---|
| #59 → `0c3f847` | preflight C1 (hardlink root, kiểm đích liên kết), `verify_subsets` (union-find gồm cả links) | chạy `python spikes/spike_c_ml/c1/test_preflight.py` (43/43) |
| #60 → `b606295` | `ml/data.py` (CaseAllowlist, DR-011, cache), `ml/models.py` | chạy `pytest ml/tests -q` |
| #64 → `440dab1` | `ml/evaluate.py`, `ml/export_contract2.py` | xác nhận ngữ nghĩa ml-eval-1.0.0: mask GT rỗng tính là case lỗi (`REFERENCE_MASK_EMPTY`), CI là bootstrap phân vị 10.000 mẫu với seed 2024, độ lệch chuẩn dùng ddof=1 |
| #70 → `2f62923` | `ml/train.py`, `ml/queue.py`, `ml/infer.py`, ghim split đóng băng | đọc RECIPE; đối chiếu với ADR-ML-001 từng dòng |
| #79 → `3c02fd2` | Spike C1 RESULT, ADR-ML-001, DR-016/016a, bản ghi QA | đọc `RESULT_C1.md` §3–§4 và §5 của bản ghi QA; viết **ghi chú của chủ spike về C1-4** (xem bên dưới) |
| #61 → `d6441bc` | mô hình V3 trên contract 1.1.0; sửa B-1…B-4 | chạy `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` (155); đọc 3 bản QA trong `management/day22/qa/`. Xem việc 3 |

**Ghi chú C1-4 bạn cần viết, cho cả hai họ** (QA N-5). Ở cùng ngân sách 1.500 bước:
- Số lát panel có Dice dưới 0,5, theo thứ tự diện tích lớn / trung bình / nhỏ:
  - DINOv2: 1/4, 2/4, 4/4;
  - UNet: 0/4, 0/4, 3/4.
- Lát trống có dự đoán foreground: DINOv2 **147/148**, UNet 104/148.
- Dice fold-val của DINOv2 đạt đỉnh 0,429 ở bước 750 rồi giảm còn 0,349, trong khi loss vẫn giảm.

Đây là quan sát, **không** phải lý do đổi công thức (PR-SCI-03). Viết bạn đọc nó thế nào.

## 🔴 Việc 2 — chạy họ UNet trên RTX 4050 *(09:00, ngay sau việc 1 phần #70)*

1. `git pull` một checkout **sạch** của `main`.
   - `require_clean_code` chỉ kiểm thư mục `ml/`.
   - Split bị ghim theo sha256 `c5c65a09…396d`.
   - **Mã train phải đúng như lúc DINOv2 bắt đầu** (DR-016a mục 4). Lệnh sau phải không in gì:
     `git diff --stat c7a37e0 HEAD -- ml/train.py ml/data.py ml/models.py`. Nếu có in, dừng và báo leader.
2. Đặt `CARDIAC_DATA_ROOT` trỏ tới thư mục dữ liệu trên máy bạn (không có đường dẫn mặc định), rồi `pip install psutil`.
3. Tạo file queue **ngoài git**, ví dụ `<runs>\_queue_configs\d23-unet.json`:
   - EXP-U-025 → EXP-U-050 → EXP-U-100;
   - variant `unet_base32_depth4`, img 560, lr 1e-4, seed 2024, bf16, cuda, `num_workers` 0, `require_clean_code: true`;
   - cặp so sánh chỉ giữa các run U-vs-U.
4. Chạy `python -m ml.queue --queue <file> --epochs 50 --batch 8 --dry-run`, rồi chạy lại **không** có `--dry-run`.
5. Theo dõi `<run>\train_log.jsonl` và `_queue\<id>\queue_log.jsonl`.
   - Sự kiện `first_step` của UNet phải ghi `logits_dtype: torch.bfloat16`.
   - DINOv2 ghi `float32` là **bình thường**, vì phép upsample cuối chạy fp32 (#70 N-10).
6. **Tripwire DR-016a, ở epoch 1 của EXP-U-025:**
   - **Trước khi chạy:** ghi lại VRAM trống bằng `nvidia-smi --query-gpu=memory.used,memory.total --format=csv`.
   - **Trong epoch 1:** mở Task Manager → GPU. "Shared GPU memory" phải gần 0, và "Dedicated GPU memory" phải dưới mức trống đã ghi. Nếu Shared tăng lên, driver đang tràn bộ nhớ sang RAM.
   - **Sau epoch 1:** lấy sự kiện `epoch` đầu tiên trong `train_log.jsonl` và tính `wall_time_s.train / train_steps`. Kết quả phải **≤ 1,13 s**.
   - Trượt một trong hai điều kiện: **để run chạy tiếp và báo leader ngay**. Không đổi E hay batch.
7. Lịch C1 dùng tốc độ UNet đo trên 3050 Ti: khoảng 24,3 h, hạn **12:00 thứ Bảy 03/10**.
   - Con số này chỉ là ước lượng thận trọng **nếu 4050 chạy batch 8 mà không tràn bộ nhớ**. Nó **không** phải cận trên: trên 3050 Ti, UNet tràn bộ nhớ và mỗi bước mất 2,18 s.
   - Nếu chậm hơn dự kiến, báo leader; **không** đổi E hay batch.

Họ DINOv2 trên PC leader: EXP-D-025 → EXP-D-100 → EXP-D-050, EXP-D-025 xong 17:15. Epoch 1 của EXP-D-100: 0,59 s mỗi bước, ngưỡng hoà vốn 1,89 s. Sáng nay kiểm cả ba run đều COMPLETE. **Kết quả đêm 01/10:** cả ba run COMPLETE lúc 05:44, mỗi run có validation 20/20, ba phép so sánh validation đã chạy. Dice validation tốt nhất (chỉ để chọn checkpoint, chưa phải kết quả): EXP-D-025 0,570 (epoch 32), EXP-D-100 0,571 (epoch 6), EXP-D-050 0,587 (epoch 13). Nếu bị ngắt thì chạy lại đúng lệnh cũ, cùng E và B; nó tự tiếp tục.

**Ghi nhận tối 01/10 (không đổi công thức):**
- Hàng đợi dừng hai lần và chạy lại từ `last.pt`:
  - lần 1 khi PC khởi động lại, khoảng 20:42;
  - lần 2 do một Ctrl+C, khoảng 20:59.
- Mỗi lần resume khôi phục đúng `last_sha256` của epoch trước, với code `c7a37e0`.
- Cả hai run đều có đoạn train loss tăng và Dice validation tụt mạnh:
  - EXP-D-025, run chạy liền không resume: epoch 34–40, có epoch Dice 0,0;
  - EXP-D-100: loss tăng từ epoch 9, và epoch 12 chỉ còn 0,249.
- Vì vậy đây không phải lỗi do resume. Có thể nguyên nhân là lr hằng số 1e-4 khi fine-tune toàn bộ; bạn xem lại.
- Checkpoint được chọn theo Dice validation, nên bản tốt nhất không bị ảnh hưởng (EXP-D-100: epoch 6, 0,571).
- Ghi điều này thành giới hạn trong RESULT. **Không sửa công thức giữa ma trận** (DR-016a, ADR-ML-001).

## Việc 3 — V3: duyệt lại #61 và #69, rồi sửa các điểm QA *(chiều)*

- **#61 (mô hình V3) đã merge** tối 01/10 → `d6441bc`, sau ba vòng QA (QA-61 → 61b → 61c MERGE).
  - B-1, B-2, B-3 đã sửa ở `478002e`. QA-61b xác nhận cả ba, bằng probe hỏng ở head cũ và đúng ở head mới.
  - **B-4** (mới): một outlier có tên case WITHHELD/FAILED vẫn mang số. Leader đã sửa ở `279d0aa`: từ chối cả selection.
  - Bạn duyệt lại cả hai commit sửa.
  - Việc của bạn từ QA-61b:
    - **N-10:** RQ-B không được giữ nhãn "fair" từ một câu trả lời khác variant;
    - **N-11:** `delta()` chỉ cho cặp HEAD_TO_HEAD;
    - **N-13:** chỉ nhận đúng enum RAW/PROCESSED;
    - **N-14:** đã ghi trong README TODO 7;
    - **N-15:** từ chối selection có `case_id` trùng; hàng trùng `case_id` là drift.
  - **N-12 (liên khối):** `ml/evaluate.py` đang xuất khối outlier với `rule_id` và `selection_version` khác contract. Phải xuất đúng nguyên văn `selection_rules.outlier_selection`. Trung làm phần ingestion.
- **#69** (màn SCR-01/SCR-07) **đã merge** tối 01/10 → `f5d5384`, sau QA-069 delta MERGE tại `1272dd1`. Commit merge chỉ giải xung đột `mobile/test/render/smoke.mjs` với #78 (giữ cả hai phần: V3 là mục 5, SCR-04 là mục 6). Bạn duyệt lại (K11).
  - Đã restack lên `main` + #77, nhận model V3 trên `main`.
  - Đã sửa: một lỗi crash SCR-01 khi server trả comparison; QA-069 B-1 (bảng case của cell bị từ chối variant từng in số).
  - Bundle Android biên dịch được (781 module).
  - Việc của bạn từ QA-069:
    - **N-1:** SCR-01 chưa hiện số `summaries` dưới COMPARABLE; hiện số, hoặc sửa câu chữ;
    - **N-3:** model truyền lý do từ chối vào intent; null `value`/`plotted` khi variant chưa xác nhận;
    - **N-4:** mã lỗi contract chưa có câu chữ V3;
    - **N-6:** render V3 chưa vào CI; a11y của dòng headline.
  - Bằng chứng trên máy: TC-USAB-004, TC-MOBILE-STATE-001, ảnh chụp.
  - Map test sang TC-EXP-*, cập nhật TC-TEAM-001.

## ⚠ Đường găng D24: từ checkpoint tới gói Contract 2

Thử end-to-end tối 01/10 cho thấy chỉ gói **FINAL_HOLDOUT** đi được hết chuỗi export → validator → backend. Thứ tự D24:

1. GATE-IMG-01: cấu hình morphology, chỉ dựa trên dự đoán validation của EXP-D-100.
2. Đóng băng.
3. Inference holdout cho 6 run và EXP-D-PP, đi qua `holdout_authorization` có cấu trúc (#64 N-1).
4. `ml/evaluate` trên holdout.
5. `ml/export_contract2`.

**PR #81 (khoá chặn holdout, làm thay tối 01/10) đã merge** → `d907240` sau QA-081 MERGE (`management/day22/qa/QA_PR81_REVIEW.md`). Trước D24 cần thêm: NB-1/NB-4 (README: cờ cũ, lấy `checkpoint_sha256` chữ thường, lưu file UTF-8); NB-3 (`decision_ref` phải được track ở HEAD và có chữ GATE-IMG-01); NB-5 (nit). **Hôm nay (NB-2a):** kiểm không config nào của hàng đợi UNet đặt `allow_unfrozen_split`, và sau mỗi run `run_manifest.json` có `frozen_split.is_frozen: true`; chạy thử viết một bản ghi trên run tổng hợp.
- Chỉ nhận đúng split đóng băng.
- Bắt buộc một bản ghi `ml-holdout-authorization/1` cho GATE-IMG-01 trước mọi bước dự đoán hay đánh giá holdout. Định dạng ở `ml/README.md` § "The holdout lock".

Bạn quyết:
1. Bản ghi thật đặt ở đâu (ví dụ cạnh biên bản GATE-IMG-01) và ai ký `authorized_by`.
2. Không sửa một bản ghi đã dùng. Thêm run thì tạo bản ghi mới.
3. Có bỏ `allow_unfrozen_split` khỏi `ml/train.py` sau khi DR-016a hết hiệu lực không.
4. Producer của EXP-D-PP phải ghi `postprocessing_config_sha256`.
5. `compare --population final_holdout` có cần bản ghi không.

Hai việc cần chốt với Trung:
- **Exporter ghi vào thư mục run.** Chốt nơi ghi gói, và cách chuyển gói sang Mac mini (gói gồm cả `best.pt`).
- **N-12:** khối outlier của `ml/evaluate.py` phải dùng đúng literal của contract.

## Hàng đợi dự phòng

- **Trước lần đánh giá holdout đầu tiên** (GATE-IMG-01, D24):
  - `holdout_authorization` có cấu trúc (#64 N-1);
  - `--split-manifest` chỉ nhận đúng split đóng băng (đã làm trong #70);
  - #70 N-6/N-7: validator manifest, bí danh máy, đường dẫn tương đối.
- **QA-005** (split): N-1 (hash screen), N-3 (schema + self-test trong CI), N-4, N-5, N-6.
- **#60:** R1, N4, N5. **#70:** N-4, N-9c (`ml/tests` trong CI), N-10 (câu chữ bằng chứng precision).
- **C1 QA (#79), việc tiếp theo:**
  - N-4: thêm peak reserved và VRAM trống lúc đầu vào dòng C1-1 của `c1_report.py`.
  - N-5: dòng C1-4 hiển thị đủ ba panel và số lát trống có dự đoán, cho cả hai họ.
  - N-8: nhãn "READ" của `slices_per_case`. "Median" của 4 giá trị đang lấy giá trị giữa phía trên; nên ghi rõ, hoặc đổi sang trung bình hai giá trị giữa.
- **Chuẩn bị GATE-IMG-01:** cấu hình morphology **chỉ** từ bằng chứng validation của EXP-D-100.

---

**Ranh giới:**
- không đụng holdout trước GATE-IMG-01;
- không đổi công thức khi run đã bắt đầu;
- không commit byte dataset, checkpoint, giá trị từng case hay hash từng file;
- không sửa `docs/specs/v1.0/**`;
- không force-push `main`;
- không xoá file hay nhánh khi chưa hỏi leader.
