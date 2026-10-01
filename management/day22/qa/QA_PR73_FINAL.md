# QA cuối — PR #73 (Spike B, phiên thiết bị S-1) · verdict **MERGE (squash) · Spike B ACCEPTED, DR-008c = L0**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Mục | Giá trị |
|---|---|
| Người soát | CHAT E. **Đây là một phiên LLM (Claude) chạy dưới tài khoản của team leader, không phải reviewer người thứ hai.** |
| Soát trên | head **`8fb577d`**, worktree của tôi detach tại đó. Ba commit sau `259b1e7`: `7217cab` (merge `d907240`), `eda3b1b` (evidence), `8fb577d` (RESULT). |
| Cách chạy | Chỉ đọc, chỉ CPU, mỗi lúc một process. Thư mục session (ngoài git) chỉ được đọc và băm. Không mở file dataset, không chạy lại extractor vì việc đó cần mask. |
| Không có trong báo cáo | serial, đường dẫn tuyệt đối, toạ độ hay dữ liệu bệnh nhân. |

## 1. Các kiểm tra

| # | Kiểm | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Merge resolution đúng là file của main | **PASS** | Năm file conflict (`EVIDENCE_RAW/20261001_real_mesh/*`, `real_mesh_frontier.py`, `test_real_mesh_frontier.py`) có `git diff d907240 7217cab` rỗng. Tree của merge đúng bằng main `d907240` cộng 18 file riêng của #73, toàn bộ là thêm mới. Các file riêng đó trùng byte với `259b1e7`. Không file nào main đổi sau `d907240` (tới `7411718`) trùng với 28 file của PR, nên squash lên main hiện tại sạch. CI 9/9 pass. |
| 2a | Leak gate | **PASS** | `--check <evidence> --session <S1>` cho exit 0: "clean (serial included)". |
| 2b | Byte commit khớp `hashes.json` | **PASS** | 7/7 file `copied` khớp blob git (sha và số byte). Bảng file trong PROVENANCE mang đúng 7 sha đó. 5/5 file `kept_outside_git` khớp file thật trong session. 3/3 `unredacted_originals` khớp. `installed_base.apk` có sha `212dd248…`, đúng APK build `956ff63`. `s1_per_pick.csv` commit trùng byte với bản trong session. |
| 2c | `s1_results.json` công khai so với bản riêng | **PASS** | Chỉ khác ở `device`, `installed_apk`, `per_pick_table`, `session_dir` (các trường đã làm sạch). `levels` trùng hoàn toàn. `extractor_commit` = `259b1e7` (mốc READY FOR EXTRACTION), `extractor_tree_clean` = true. Thiết bị thật: SM-A176B, Android 16, không phải emulator. |
| 3a | B10/B11, tính lại độc lập từ `frame_probes.jsonl` đã commit | **PASS** | Ở cả 5 level: 3/3 run complete, mỗi run 1.799–1.800 mẫu. Median theo nearest-rank là **59,88 FPS** (min qua các run), interval dài nhất **17 ms**, 0 frame > 500 ms. Tóm tắt của thiết bị khớp. Cả 5 level B10 PASS, B11 PASS, đúng bảng RESULT. |
| 3b | B6/B9, gộp lại độc lập từ `s1_per_pick.csv` | **PASS** | **L0:** 599 pick, 327 tia gặp mask, max error **1** (264 tia lỗi 0, 63 tia lỗi 1), **0 no-hit**; 272 tia không gặp mask, 0 tia đó điều hướng; code path 0. **L1:** 5·5, B9 1 → FAIL. **L2:** 13·6. **L3:** 11·20. **L4:** 16·34. Thiết bị so với re-intersection trên workstation: 0 lệch ở mọi level. Theo phase ở L0: grid 360/103, target 190/190, target ở camera của operator 25/25, tap 24/9, đều max ≤ 1. 84 pick trúng target, sai ≤ 1. Tất cả khớp RESULT. |
| 3c | B7, tính lại độc lập từ collector thô (chỉ in số đếm) | **PASS** | Mỗi level mở đúng 1 lần. Hiển thị đúng / yêu cầu: L0 327/327, L1 288/288, L2 286/286, L3 273/273, L4 260/260. 0 orphan. Latency median khoảng 41–42 ms; max 82 ms ở L0 và 437 ms ở L3, đúng RESULT. |
| 3d | Cột B5 offline (#66) | **PASS** | Bản trên nhánh trùng byte với `real_mesh_frontier.json` trên main. Mỗi level 33.085 tia. Max error · no-hit: L0 **1 · 0** (`WITHIN_BOUND`, cả 3 cohort), L1 29·211, L2 29·589, L3 37·1.103, L4 40·2.492. Khớp RESULT. |
| 3e | Hai đường bằng chứng | **PASS** | Primary là logcat, 5.678 khớp 5.678 với HTTP, 0 khác. Stream và dump đều có 5.873 dòng. 5 segment, không exclusion. |
| 4 | Các vế của luật override §4, dòng "Spike B ACCEPTED + DR-008c" (văn bản trên main) | **PASS** | B5 ≤ ±1: chỉ L0 đạt (offline). B6, B7, B9 tại level được chọn L0: PASS/PASS/PASS. B10 ≥ 20 FPS median và B11 tại L0: 59,88 FPS / 17 ms, đủ 3 run hợp lệ. Bảng B12 ≥ 3 level: có 5 level, mỗi level có số tam giác, median FPS và sai số pick (B5 offline và B6 thiết bị). DR-008c là level nhanh nhất có B5 ≤ ±1, tức **L0** vì L0 là level duy nhất đủ điều kiện. B15 là ngoại lệ đã ghi, Vũ Hùng Anh nộp trước 10:00 Day 23. |
| 5 | Các caveat tác giả đã ghi | **PASS** (không caveat nào đổi verdict) | Chi tiết ở §2. |
| 6 | Vệ sinh các dòng thêm vào | **PASS** | 0 serial (của phiên này và của 09-18) trong dòng thêm. 0 trường toạ độ trong evidence và RESULT. Cột của CSV không có toạ độ. Các hit đường dẫn chỉ nằm trong code: literal giả của self-test, định nghĩa pattern của leak gate, và mặc định của `build_release.ps1` đã nêu ở review đầu (N3). Hit "IPv4" là chuỗi phiên bản JDK, báo nhầm. |

## 2. Caveat: đã kiểm, không đổi verdict

- **Nhãn tap bị đảo.** Bản ghi có 24 tap ở L0: 9 tap nhãn `background` đều gặp mask, đều điều hướng, lỗi 0; sau đó 15 tap nhãn `surface` không gặp mask và không điều hướng. Verdict tính theo mask truth, không theo nhãn:
  - 9 tap đầu nằm trong B6 L0 (max 0).
  - 15 tap sau nằm trong B9 L0 (0 điều hướng).
  - B6 và B9 không đổi, và B9 "bằng ngón tay" vẫn có bằng chứng: 15 tap thật sự vào nền, không tap nào điều hướng.
  - Trường `operator_background_taps_navigated: 9` đếm theo nhãn, không được đọc là lỗi B9. RESULT đã ghi đúng như vậy.
- **Nhiệt độ NONE → MODERATE (2).** Chỉ đo ở hai snapshot (pin 35,5 → 38,0 °C, đang sạc). Không ai đo giữa phiên, nên stop rule "≥ 2" không được kích. L0 chạy trước (19:01–19:07). L4, đo cuối, vẫn ở mức trần frame. Không ảnh hưởng L0.
- **Trần 60 Hz** dù màn hình báo 90 Hz. Cả 5 level đều 59,88 FPS, nên cột FPS của B12 không phân biệt được các level. DR-008c không bị ảnh hưởng vì chỉ L0 đủ điều kiện B5, và L0 dư gấp khoảng 3 lần ngưỡng 20 FPS.
- **PROVENANCE ghi `None` ở giờ mở level.** Đây là lỗi hiển thị: exporter in `opened_at_utc`, trong khi nguồn primary là logcat. Giờ điện thoại có trong `segments` (19:01:28 / 19:07:43 / 19:10:17 / 19:13:51 / 19:17:20) và trong bảng RESULT.
- **Đồng hồ workstation chậm khoảng 66 phút sau lần khởi động lại.** Phiên chạy trước lần khởi động lại: stamp `start` 19:01:08 và các conditions lệch dưới 20 s so với bản ghi của điện thoại. Chỉ `computed_at` và giờ commit lấy từ đồng hồ chậm, RESULT đã ghi rõ. Không số liệu nào phụ thuộc vào chúng.
- **Extractor chạy ở `259b1e7`, trước merge.** Bản `real_mesh_frontier.json` của nhánh và của main giờ trùng byte. Hàm truth trên main tương đương bản cũ trên 30.000 tia tổng hợp, đã kiểm ở lần re-check trước.

## 3. Phát hiện

**BLOCKING: không có.**

**NON-BLOCKING** (có thể làm sau squash; người nhận ghi kèm):
1. **Mục "Deviations and re-runs (operator notes, verbatim)" trong PROVENANCE không phải ghi chú nguyên văn của operator.** Nó chứa giờ mở level "from the extractor", và ghi "5 surface + 5 background taps", trong khi bản ghi có 24 tap và 3 lần đổi nhãn. Nên gắn lại nhãn ("ghi chú tổng hợp sau extraction") và nhờ operator xác nhận chuỗi tap. RESULT đã ghi "to be confirmed with the operator". Người nhận: A4, Phạm Tuấn Anh xác nhận.
2. **Exporter nên in `opened_at_device_logcat` vào bảng page-load của PROVENANCE.** Người nhận: A4.
3. **`build_release.ps1` vẫn còn đường dẫn mặc định tuyệt đối** (build root và JDK), như N3 ở review đầu. Nên tham số hoá. Người nhận: A4.
4. **Serial trên main.** Serial ở `management/spikes/SPIKE_B_3D/RESULT.md` là dòng 73 trên main; ở head của PR nó thành dòng 231 vì có đoạn chèn. Đó **chính là handset của phiên tối nay**, nên việc redaction trong evidence tối nay không che thêm được gì. Đây không phải thay đổi của PR này; cần quyết định chính sách (N2). Người nhận: leader và Vũ Hùng Anh.
5. **QA không tự tính lại truth của B6 từ mask** (QA không được mở dữ liệu). Tôi gộp lại truth theo từng pick của extractor, và tính lại độc lập B10/B11 (frame thô) và B7 (collector thô). Vũ Hùng Anh tự tính lại vào Day 23, như kế hoạch.
6. **GitHub báo `mergeable: UNKNOWN` lúc tôi truy vấn.** Kiểm tra cục bộ cho thấy không có file nào trùng với các commit main mới hơn, nên squash sạch. Tag `s1-apk-956ff63` giữ commit build APK sau squash.

## 4. Verdict

**MERGE (squash).** Tôi re-derive bảng RESULT và verdict từ `s1_results.json` và evidence đã commit, đều khớp. Luật đặt trước tại override §4 thoả ở mọi vế. **Spike B ACCEPTED, DR-008c = L0** (bề mặt voxel-face không decimate, 61.424 tam giác). **B15** là ngoại lệ đã ghi, Vũ Hùng Anh nộp trước 10:00 Day 23. Theo quy trình, phiên của leader ghi trạng thái ACCEPTED sau QA này.

Không có gì trong repo bị sửa. Script tạm của tôi nằm trong scratchpad của phiên, thư mục `qa73\`.
