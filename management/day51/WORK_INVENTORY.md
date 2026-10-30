# DANH MỤC VIỆC TỚI NGHIỆM THU 08/11/2026

| Mục | Giá trị |
|---|---|
| **Lập** | 30/10/2026 (Day 51), theo `management/day51/OPERATING_MODE_2026-10-30.md` (DR-023). Sửa cùng ngày theo QA LLM của PR #107 (`management/day51/qa/QA_PR107_PR108_D51.md`) và các xác nhận của leader lúc 21:55 |
| **Mục đích** | Một danh sách duy nhất, đủ từng việc còn lại tới nghiệm thu. Mỗi việc ghi nguồn, điều kiện xong (thấy được), cách kiểm và trạng thái. Không việc nào được đóng nếu chưa chạy phép kiểm và ghi bằng chứng |
| **Cơ sở** | `main` tại `565bf5e` (sau #108, #105 và #109); `management/day40/ACCEPTANCE_TRACE.md` (33 MUST, 70 TC); `docs/specs/v1.0/16` (§3 góc nhìn từng môn, §5–§7); các tệp QA; `mobile/DEVICE_SESSION.md` |
| **Tên tệp QA** | `QA_PRnn` là `management/day39/qa/QA_PRnn_D39.md`; `QA_PR100_103` là `management/day39/qa/QA_PR100_103_D39.md`. QA_PR95 và QA_PR96 đánh số mục 1…n, không có nhãn "NB-" |
| **Mã dòng** | Có tiền tố `W-` để không trùng với các mã đã có trong repo: kịch bản A9, ghi chú B15 của Spike B, điều kiện C1–C8, các pha C1–C4 của REPLAN, các dòng revalidation K1–K6 và T1–T4 |
| **Nhịp** | Chất lượng trước tốc độ. Tối đa 2 agent chạy song song; một việc nặng (build, train, dựng mesh) một lúc; giữ máy mát. Ngày ghi trong bảng là hạn muộn nhất, không phải mục tiêu chạy đua |

## 0 · Cách đọc

| Trạng thái | Nghĩa |
|---|---|
| `MỞ` | chưa bắt đầu |
| `ĐANG LÀM` | đang làm; ghi nhánh hoặc agent |
| `CHỜ QA` | đã làm và tự kiểm trên một nhánh; chờ QA LLM độc lập, rồi merge |
| `XONG` | đã chạy phép kiểm; ghi commit, PR hoặc tệp bằng chứng. Việc cài đặt trên máy, không có bằng chứng trong repo, ghi `XONG` kèm ngày kiểm |
| `CHỜ LEADER` | cần leader quyết định hoặc thao tác |
| `CHỜ THIẾT BỊ` | cần phiên điện thoại (chỉ leader thao tác, DR-006a) |
| `CHỜ GPU` | cần Bế Quốc Khánh (RTX 4050) |
| `BỎ` | không làm; ghi lý do và người quyết |

Cách cập nhật: PR đóng việc nào thì sửa đúng dòng đó trong cùng PR. `XONG` không có nghĩa là `ACCEPTED`. Project Control chỉ đề xuất, việc đánh dấu `ACCEPTED` là của leader (DR-023 mục 10).

---

## P1 · Hoàn thiện sản phẩm (30/10 → 02/11)

### P1-A · V2: bản đồ lỗi 3D và liên kết 2D↔3D

Agent A làm trên nhánh `feat/v2-error-map-and-linkage`. Vòng 1: `916b400`…`17a83eb`. Vòng 2: `739406a`…`3e3caec`, có gộp `main` sau #109. Đã đẩy lên origin, chưa có PR; QA LLM độc lập đang chạy.

Đây là ứng viên 1 của Spike F, chưa phải quyết định cuối. Nhánh này chỉ merge sau khi Spike F có bằng chứng (DR-005; leader quyết 21:55 "Chạy Spike F trước").

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-A1 | Artifact mesh lỗi. FP = dự đoán ∧ ¬GT, FN = GT ∧ ¬dự đoán; mỗi lớp là một bề mặt mặt-voxel L0 (DR-008c). Mỗi mặt mang lát nguồn và lớp. Ghi một lần, khóa theo sha256 của hai mask cộng phiên bản định dạng | DR-005, FR-3D-007 | Test chứng minh lớp đúng, mọi mặt nằm trên voxel đúng lớp ở lát nguồn của nó, và dựng lại cho ra cùng byte. Fixture TP/FP/FN theo `13` §11 là việc W-F1 | `pytest backend/mesh/tests`; mutation phép gán lớp làm test đỏ | CHỜ QA (vòng 1) |
| W-A2 | `build_cache` dựng mesh lỗi cho mọi run có GT, cả RAW và PROCESSED; bỏ qua case INFERENCE_REVIEW | DR-005, DR-017 | Số mesh lỗi bằng số cặp (run, variant) có GT; CASE_0001 không có mesh lỗi | test; đếm trên thư mục dữ liệu backend (ngoài git) | CHỜ QA (vòng 1) |
| W-A3 | `error_reconstruction_get` trả đủ trường của contract: `GROUND_TRUTH_UNAVAILABLE` cho INT-12, `ARTIFACT_NOT_FOUND` chỉ khi thật sự thiếu, byte đi qua route theo nội dung và có checksum. Test cũ "honestly unavailable while DR-005 is open" được thay bằng test hành vi mới, không xóa im lặng | contract 1.1.0; FR-3D-007 | Test endpoint và test contract API đạt | `pytest backend/tests`; `python contracts/api/test_api_contract.py` | CHỜ QA (vòng 1) |
| W-A4 | SCR-05 có 4 lớp GT / dự đoán / FP / FN, bật tắt từng lớp, có nhãn chữ và chú giải không chỉ dựa vào màu (`10` §7) | PR-ERR-03, PR-3D-05 | Render thấy đủ 4 nhãn và chú giải; mỗi lớp bật tắt độc lập | `npm test`; `npm run test:render` | CHỜ QA (vòng 1) |
| W-A5 | 2D→3D: dải "lát n / tổng" theo lát 2D lúc mở SCR-05, lúc quay lại từ SCR-03/SCR-04 (QA_PR98 N-6) và khi kéo slider trong SCR-05 | PR-3D-03, TC-3D-003 | Test khứ hồi: đổi lát trong 2D rồi quay lại, dải nằm ở lát mới | `npm test`; render V2N3/V2N4 | CHỜ QA (vòng 1) |
| W-A6 | 3D→2D: chạm thì lấy mặt trúng đầu tiên, ra lát nguồn và lớp. "Mở 2D" sang SCR-03 đúng lát; mặt FP/FN có thêm "Mở lỗi" sang SCR-04 đúng lát. Chạm vào nền không điều hướng đi đâu, và không vẽ điểm sáng chính xác hơn mức phép chiếu cho phép (`10` §6) | PR-3D-04, FR-3D-008, TC-3D-004/005 | Test điều hướng đạt, kể cả chạm nền | `npm test`; mutation ánh xạ chạm → lát làm test đỏ | CHỜ QA (vòng 1) |
| W-A7 | Mỗi lớp có trạng thái riêng theo PR-MOBILE-02: đang tải, đang xử lý (nếu có), không khả dụng (kèm lý do API), lỗi, thử lại, thành công. Thiếu mesh lỗi không làm hỏng các bề mặt khác | PR-MOBILE-02, TC-MOBILE-STATE-001 | Mỗi trạng thái có một test | `npm test`; render | CHỜ QA (vòng 1) |
| W-A8 | Viewer không gọi mạng (QA_PR98 N-4, thêm assertion) và không giải mã một mesh hai lần (N-5) | QA_PR98 N-4, N-5 | Hai test mới đạt | `npm test` | CHỜ QA (vòng 1) |
| W-A9 | `MeshStore` tự từ chối sidecar có nguồn là GT của INT-12 | QA_PR98 N-9 | Test đạt | `pytest backend/tests` | CHỜ QA (vòng 1) |
| W-A10 | E2E H6.e/H7.e: byte và checksum của mesh FP/FN; mặt FP được chọn nằm trên voxel có dự đoán = 1 và GT = 0 trong PNG được phục vụ; FN tương tự | TC-3D-005, `DEMO_STANDARD` §3 | `hero_flow_api.py` PASS trên CASE_0042 và hai case khác | backend local; đầu ra lưu ngoài git | CHỜ QA (vòng 1) |
| W-A11 | Kích thước và thời gian dựng mesh lỗi trên dữ liệu thật | DR-005; Spike F F1, F9 | Số liệu (min/median/max) được ghi trong mô tả PR và trong kết quả Spike F | đối chiếu với thư mục dữ liệu backend (ngoài git) | CHỜ QA (vòng 1) |
| W-A12 | Ghi rõ lệch hợp đồng: route mesh và định dạng id mesh lỗi chỉ nằm trong `contracts/api/README.md`; không nâng phiên bản API trước nghiệm thu | QA_PR98 N-8 | README nêu lệch và lý do | đọc lại | CHỜ QA (vòng 1) |
| W-A13 | Chạm vào FP/FN thì chọn cả vùng lỗi liên thông (26-liên thông như `backend/mesh/error_geometry.py`): hiện các lát đóng góp, bước qua từng lát, mở SCR-03/SCR-04 ở lát đã chọn | FR-3D-008, UC-09, `10` SCR-05 | Test Python so với scipy (có ca chéo góc 6 vs 26); test mobile; mutation; E2E flood-fill độc lập trên 3 case | `pytest`; `npm test`; E2E | CHỜ QA (vòng 2, `3e3caec`) |
| W-A14 | Từ pick 3D sang 2D: đánh dấu đúng điểm ảnh (cột, hàng) của voxel trúng; không đánh dấu khi vị trí không chắc | `10` §6 | Test marker đúng điểm ảnh; test không có marker khi vào từ SCR-02 | `npm test`; render | CHỜ QA (vòng 2, `3e3caec`) |
| W-A15 | Nút ◀ ▶ ở SCR-05 không bao giờ là nút chết khi chưa có mặt cắt | PR-MOBILE-02 | Test hành vi đã chọn | `npm test` | CHỜ QA (vòng 2, `3e3caec`) |
| W-A16 | Gửi mesh vào WebView theo khúc có giới hạn, kiểm độ dài và sha256 trước khi giải mã; lớp đang tắt (GT) không tải cho tới khi được bật | rủi ro thiết bị: mesh lỗi lớn nhất khoảng 9,8 MB trên dữ liệu thật (số đo vòng 2, ghi trong mô tả PR) | Test cho thiếu, trùng, sai thứ tự và quá cỡ khúc; test tải lười | `npm test` | CHỜ QA (vòng 2, `3e3caec`) |
| W-A17 | Việc nhỏ: chữ cũ trong `contract.json` (theo luật phiên bản của README), bảng màu FP/FN tách rõ, ghi cách hiểu UC-09 "overlap", ghi chú MAX_PATH | QA của vòng 1 | README và test cập nhật | đọc lại | CHỜ QA (vòng 2, `3e3caec`) |

### P1-B · Tồn đọng QA và PR của Khánh

Agent B làm trên nhánh `fix/qa-backlog-d51`, 19 commit, head `6a08de3`. QA LLM độc lập: MERGE, không có lỗi chặn. Đã merge qua #109 (`565bf5e`).

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-B1 | #106: nguyên nhân gốc của job CI đỏ "backend tests". Kết quả: `ubuntu-latest` đã sang Ubuntu 26.04, bản này không có CPython 3.9; #108 ghim job về `ubuntu-24.04` | #106 | Có nguyên nhân gốc kèm dòng log; job xanh | log CI | XONG (#108 · `5232f52`) |
| W-B2 | Rà #105 và #106. Kết quả trong `management/day51/qa/QA_PR105_PR106_D51.md`: #105 không có lỗi; #106 còn 4 việc phải sửa (W-B17) | #105, #106 | Danh sách lỗi, hoặc "không có lỗi" kèm phạm vi đã đọc | QA LLM | XONG (#105 merge `d325136`) |
| W-B3 | V4: Refresh khi phiên bản mới nhất đã đổi | QA_PR99 NB-2 | Có test cho nhánh có nguy cơ mất dữ liệu | `npm test` (`mobile/test/v4_review_screen.test.mjs`) | XONG (#109 · `2d440ff`) |
| W-B4 | V4 live: kiểm `prediction_mask_id` theo artifact id của run, như E2E H8 | QA_PR99 NB-3 | Test; README đúng với code | `npm test`; render | XONG (#109 · `e621213`) |
| W-B5 | V4: lệnh đọc dùng `client.call` hay `useCall` phải khớp README (DR-021 luật 2) | QA_PR99 NB-4 | README đúng; các lệnh đọc nhận tín hiệu hủy | `npm test` | XONG (#109 · `e49e043`) |
| W-B6 | V4 live: `caseId` của route phải khớp `case_id` của run | QA_PR99 NB-5 | Test | `npm test` | XONG (#109 · `e621213`) |
| W-B7 | `mobile/README.md` mô tả render smoke có V4 và số đếm mới | QA_PR99 NB-6 | README đúng | đọc lại | XONG (#109 · `846470c`) |
| W-B8 | Test tie-break của `latestVersion` | QA_PR99 NB-7 | Mutation `>=` → `>` làm test đỏ | mutation | XONG (#109 · `2d440ff`) |
| W-B9 | `record_path` không được trỏ ra ngoài repo | QA_PR94 NB-3 | Test từ chối `..`, ổ đĩa, đường dẫn gốc | `pytest backend/tests` | XONG (#109 · `8110e75`) |
| W-B10 | Hai câu đã cũ: `contracts/ingestion/contract2_experiment_artifact/README.md` dòng 96 và `backend/README.md` dòng 251 | QA_PR94 NB-4 | Chữ đúng với code | đọc lại | XONG (#109 · `f43afe6`) |
| W-B11 | `successful_n` khi ML ghi case INT-12 là failed | QA_PR94 NB-5 | Test ghim quy tắc | `pytest backend/tests` | XONG (#109 · `f43afe6`) |
| W-B12 | Validator kiểm nốt `experiment_id` của `outlier_selection` | QA_PR94 NB-6 | Test | `python contracts/api/test_api_contract.py` | XONG (#109 · `6a213b6`) |
| W-B13 | Dàn lại dòng dài trong validator | QA_PR94 NB-7 | Dòng đã dàn lại, test validator vẫn đạt | `python contracts/api/test_api_contract.py` | XONG (#109 · `6a213b6`) |
| W-B14 | `authorized_runs`: từ chối `experiment_id` trùng hoặc có khoảng trắng; run có trong bản ghi nhưng checkpoint khác thì bị từ chối. Phần run không có trong bản ghi chuyển sang W-C16 | QA_PR98 N-7 | Test | `pytest backend/tests` | XONG (#109 · `8110e75`) |
| W-B15a | #100: pipeline đòi bản ghi cho phép phải nằm trên `origin/main`; khoảng trắng `ROOT =Path`; README ML cũ | QA_PR100_103 #100 NB-1, NB-4, NB-5 | Test với repo git tạm | `pytest ml/tests` | XONG (#109 · `029936a`, `8ea50ec`) |
| W-B15b | #101: `-SkipData -ShipPackages` khi DataCache rỗng báo lỗi trước ssh; kiểm mã thoát của `tar -tzf`; quét `.nii`; README; nhãn biểu đồ không đè nhau | QA_PR100_103 #101 NB-1, NB-2, NB-4, NB-5 | 12 test chạy script thật với ssh/scp giả; test trang kết quả | `pytest backend/tests` (Windows); `pytest ml/tests` | XONG (#109 · `8ea50ec`, `06896e2`) |
| W-B15c | #102: quét rò rỉ trước khi ghi vào `--out` | QA_PR100_103 #102 NB-1 | Bản dựng lỗi không đụng `--out` | report self-test | XONG (#109 · `e1d576d`) |
| W-B15d | #103: câu hỏi SCR-06 mặc định "Không" khi bấm Enter; đường dẫn 8.3; fixture che IP nằm ngoài dải mặc định của ZeroTier | QA_PR100_103 #103 NB-1, NB-2 | Self-test 34/34; Pester | self-test; Pester | XONG (#109 · `67f0dfa`, `6a08de3`) |
| W-B16 | V1/V3/shell: QA_PR88 N-1 (returnParams SCR-06), N-2 (watchdog cho render smoke), N-3 (guard không dứt), N-4 (ghi rõ); QA_PR87 N-6; QA_PR90 N-1, N-2, N-3, N-4 | QA_PR87, QA_PR88, QA_PR90 | Mỗi mục có test hoặc ghi rõ lý do | `npm test`; render; `pytest` | XONG (#109 · `be9283c`, `59d37fb`, `1c09812`, `f75f19a`) |
| W-B17 | Sửa #106 ngay trên nhánh của Khánh (thêm commit, không viết lại lịch sử, ghi rõ do phiên leader sửa theo DR-023): test V3S10 phải kiểm thật; test cấp màn hình cho dòng tóm tắt SCR-01 (cả nhánh trung bình và "không có tóm tắt"); bỏ đường dẫn máy trong `TC_TEAM_001_BE_QUOC_KHANH.md`; thay `replaceAll` | QA_PR105_PR106 N-1, N-2, N-4, N-5; leader 21:55 | Mutation làm test đỏ; quét thấy không còn đường dẫn; QA phần sửa đạt; CI xanh; merge | `npm test`; render; QA LLM | MỞ |

### P1-C · Tích hợp, QA và các việc sản phẩm còn lại

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-C1 | QA LLM độc lập cho nhánh A (sau vòng 2); sửa các phát hiện; mở PR; CI xanh; merge sau khi Spike F có bằng chứng | DR-023, DR-005 | PR được merge; tệp QA nằm trong `management/day51/qa/` | CI + QA | MỞ |
| W-C2 | QA LLM cho nhánh B; sửa phát hiện; PR; merge. Kết quả QA: MERGE, không có lỗi chặn (`management/day51/qa/QA_BRANCH_QA_BACKLOG_D51.md`). #105 đã merge; #106 xem W-B17. Nhánh nháp `fix/pr106-ci` trùng với #108 nên không dùng | DR-023 | Nhánh B nằm trên `main` | CI + QA | XONG (#109 · `565bf5e`) |
| W-C3 | **Sổ QA**: liệt kê mọi phát hiện trong cả 58 tệp QA từ `management/day03/` tới `day39/` (`qa/`, `QA_REVIEW_*`, kể cả các tệp ngày 3, 6, 8, 9). Kiểm từng mục trên `main`: đã sửa (commit), còn mở, hay chấp nhận có lý do. Danh sách trích tự động có 708 dòng làm bảng kiểm; bảng trích nằm ngoài git cho tới khi sổ QA được commit | "đừng bỏ qua tiểu tiết" | `management/day51/QA_REGISTER.md` đủ từng mục; số mục mỗi tệp khớp với bảng trích, chỗ lệch có giải thích | đối chiếu code | MỞ |
| W-C4 | Sửa các mục còn mở trong sổ QA mà A và B không làm. Các mục đã biết là ứng viên cho W-C3: QA_PR92 NB-1 (run dẫn xuất tin manifest của chính nó), NB-2 (exporter đặt checkpoint trước khi kiểm bản ghi); QA_PR95 mục 1–7 (E2E, làm sau khi nhánh A merge vì cùng tệp); QA_PR100_103 #100 NB-2 (trạng thái `partial` không gắn với bản ghi), #103 NB-3. Đã đóng, không làm lại: QA_PR96 mục 1–5 (`06c1b2d`), QA_PR94 NB-1/NB-2 (#98) | W-C3 | Mỗi mục có test, hoặc lý do bỏ được leader duyệt | test | MỞ |
| W-C5 | PR-EXP-04 trên app: ở live mode SCR-07 hiện ô EXP-D-PP cạnh EXP-D-100, ghi rõ "ablation hậu xử lý, cùng checkpoint", không bao giờ gọi là so sánh giữa mô hình. Thêm kịch bản generator phục vụ EXP-D-PP là PROCESSED để test được | PR-EXP-04, PR-IMG-01, QA_PR94 NB-8, mục 2 trong danh sách "TODO for Khánh" của README V3 | Test render thấy ô ablation với nhãn đúng; ô so sánh RAW với PROCESSED vẫn là `comparable:false` | `npm run test:render`; test V3 | MỞ |
| W-C6 | PR-EXP-02 mức case: xác định phần so sánh cặp theo case còn thiếu (mục 3 trong "TODO for Khánh" của README V3), làm và test | PR-EXP-02, TC-EXP-006/007 | Chạm một điểm của cặp thì mở đúng case; có test | test V3; render | MỞ |
| W-C7 | Test opacity: đổi opacity không đổi hình học mask | TC-MASK-003 | Test đạt; mutation làm đỏ | `npm test` | MỞ |
| W-C8 | Client hiện trạng thái không khả dụng khi lệch phiên bản hình học | TC-REL-003 | Test đạt | `npm test` | MỞ |
| W-C9 | Quét bí mật toàn repo và bundle mobile (CI hiện chỉ quét các dòng thêm vào) | TC-SEC-004 | Job CI xanh và bắt được mẫu cài thử | CI | MỞ |
| W-C10 | Bản đồ module và ranh giới tích hợp, kèm danh sách tệp nhạy cảm khi tích hợp và cách kiểm va chạm | TC-MAINT-001 | Có tệp; mỗi module trỏ tới code và test; có danh sách tệp nhạy cảm và cách kiểm va chạm | đọc lại | MỞ |
| W-C11 | Code mobile chạy trực tiếp fixture hình học chuẩn | TC-MAINT-002, INT-13 | Test mobile đọc fixture chuẩn và khớp | `npm test` | MỞ |
| W-C12 | Mac mini: kiểm ssh và `/health`; deploy `-ShipPackages` có mesh lỗi định dạng 2, loại các tệp `*.err1.*` cũ và không gửi `checkpoints/best.pt` (QA_PR100_103 #101 NB-3); chạy E2E `--no-writes` lên Mac mini. Tối 30/10 Mac mini không trả lời qua mạng overlay, phía PC đã kiểm ổn; nguyên nhân phía Mac mini chưa rõ, leader cần kiểm máy (nguồn, chế độ ngủ, dịch vụ ZeroTier) | DR-022; `backend/scripts/deploy_macmini.ps1` | `/health` ok; E2E không FAIL; gói deploy không có tệp err1 | E2E | CHỜ LEADER |
| W-C13 | E2E đầy đủ ở local sau khi merge: mọi bước PASS, trừ bước UNet | `tools/e2e/hero_flow_api.py` | Cập nhật `E2E_EVIDENCE` mới, chỉ gồm số đếm và tóm tắt | E2E | MỞ |
| W-C14 | Build APK release live từ `main` cuối; ghi commit và sha256 trong `.build.txt` | `mobile/scripts/build-release.ps1` | APK và bản ghi build cho phiên 2 | `device_session.ps1 -DryRun` | MỞ |
| W-C15 | Kịch bản phiên 2, cùng danh sách với W-D3: mỗi TC thiết bị có các bước và tiêu chí PASS viết sẵn. Gồm TC-PERF-001/002/003, TC-3D-002…005 (có vùng FN mỏng và nhỏ), TC-REV-002…005, TC-USAB-001/002/003/004, TC-REL-002, TC-MOBILE-STATE-001, TC-MODE-001 / TC-CASE-002 / TC-MASK-002 trên CASE_0001, TC-SEC-003, TC-E2E-001, TC-USAB-005. Phần thiết bị của Spike F có phiên riêng (W-F3) | ACCEPTANCE_TRACE §3 | Kịch bản có bản tự kiểm không cần điện thoại (`-SelfTest`, điện thoại giả) | Pester + SelfTest | MỞ |
| W-C16 | Backend nhận nhiều bản ghi cho phép holdout (Day 39 cho DINOv2, sau này một bản cho UNet). Run không có trong bản ghi nào thì bị từ chối, đúng luật holdout: không truy cập ngoài bản ghi cho phép | QA_PR98 N-7; luật holdout | Test; dữ liệu thật vẫn nạp đủ (chỉ kiểm metadata) | `pytest backend/tests` | MỞ |
| W-C17 | CI: chú thích có điều kiện bỏ ghim 3.9 và sửa chú thích node đã sai (QA_PR107_108 #108 N-1, N-2); action Node 20 hết hạn (N-4); ghim node/python cho các job dùng bản có sẵn trên máy chạy (N-7); `--only-binary` cho scipy (QA_PR98 N-2); tên và chú thích job còn ghi "Contract 11 v1.0.0" (N-3); bộ quét IPv4 bỏ sót và `timeout-minutes` (QA_PR87 N-1…N-4, QA_PR88 N-2); dòng pip dài (QA_PR100_103 #100 NB-3) | các QA đã nêu | Mỗi mục có thay đổi hoặc lý do; CI xanh | CI | MỞ |
| W-C18 | Bảng tiến độ GitHub Pages cho Day 51: `docs/index.html` còn ghi "31/10" và "quy trình thường quay lại". Dựng lại bằng công cụ bảng sau khi tệp trạng thái đã cập nhật; chậm nhất 31/10, sau khi #107 merge | QA_PR107_108 N-13; luật chia sẻ cho nhóm | Trang Pages trả 200 và ghi đúng 08/11, DR-023 | mở trang | MỞ |
| W-C20 | Các điểm không chặn N-1…N-8 của QA nhánh B (#109): RS19 chạy được trong CI; `Add-Type` trong `device_ui.ps1` được bọc lỗi và `Test-OutsideGit` an toàn khi lỗi; thư mục tạm của test watchdog; câu README V4 về H8; biến thừa; ví dụ trong chú thích; tiêu đề README backend. N-5 (timeout CI) thuộc W-C17 | `management/day51/qa/QA_BRANCH_QA_BACKLOG_D51.md` | Mỗi mục có test hoặc thay đổi kiểm được; mutation làm đỏ | `npm test`; self-test; Pester | MỞ |
| W-C19 | Điều kiện C6: SPIKE_D đã ACCEPTED, nhưng mọi header mang hình học mặc định, nên tính thẳng trục chỉ đúng ở mức header. Đóng C6 kèm giới hạn này, hoặc để mở | `PROJECT_STATE.yaml` C6 | Leader quyết; trạng thái cập nhật | — | CHỜ LEADER |

---

## P1-F · Spike F: so sánh cách biểu diễn lỗi 3D (leader quyết 21:55: chạy trước khi merge bản đồ lỗi)

Theo `management/spikes/SPIKE_F_3D_ERROR/TASK.md`, 12 tiêu chí F1–F12. Agent không bịa số đo trên thiết bị và không tự đánh giá mức dễ đọc (TASK, "What Claude may NOT fabricate"). Chủ ghi trong hồ sơ là Vũ Hùng Anh (DR-013), không được hỏi vì không hoạt động từ 03/10. Review là một lượt QA LLM độc lập, vì leader thao tác thiết bị (DR-006a).

Thứ tự: W-F1 và W-F2 → W-F3 (phiên thiết bị riêng) → W-F4 (leader duyệt cách biểu diễn) → W-C1 (merge nhánh V2) → W-C14 (APK cuối) → W-D3 (phiên 2).

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-F1 | Phần không cần thiết bị. Fixture TP/FP/FN tổng hợp trong `tests/fixtures/error_masks/` (số đếm, Dice, IoU biết trước, theo `13` §11). Pipeline trong `spikes/spike_f_3d_error/` cho ba ứng viên: (1) mesh FP/FN riêng (cách của nhánh A); (2) một bề mặt LA phân lớp lỗi theo đỉnh (như TASK) hoặc theo mặt, agent nêu lý do; (3) bề mặt + điểm đánh dấu cho từng vùng FP/FN liên thông, mang dải lát. Đo F1, F3, F4, F5, F6, F9, F10 trên fixture và trên một case validation, chọn theo một luật viết ra (kèm giờ) trước khi dựng trên dữ liệu thật | TASK F1–F6, F9, F10 | Bảng chi phí máy đọc được; test tất định; giới hạn ±1 lát giữ nguyên | `pytest`; QA LLM | MỞ |
| W-F2 | Bộ đo trên thiết bị, loại dùng xong bỏ: một trang dựng từng ứng viên trong Chrome trên A17 qua `adb reverse`, không cần APK hay Mac mini. Đo FPS (F8) và tỉ lệ chọn vùng thành công (F7), chụp ảnh cho F2. Có bản tự kiểm không cần điện thoại | TASK F2, F7, F8 | Self-test đạt; script cho leader chạy | self-test | MỞ |
| W-F3 | Phiên thiết bị riêng của Spike F, chậm nhất 02/11 và trước khi merge nhánh V2 (kế hoạch của Project Control; TASK đòi F2, F7, F8 trên máy). Leader chạy W-F2 trong Chrome trên A17 qua cáp USB, không cần APK hay Mac mini, và tự đánh giá F2 (ghi nguyên văn). Chrome và WebView của Android cùng dùng nhân Chromium; F8 được đo lại trong WebView của app ở TC-PERF-002 (W-D3), nếu hai số khác nhau thì dùng số trong WebView | TASK F2, F7, F8 | Có tệp thô và ảnh; số đo là số thật | verdict của script | CHỜ THIẾT BỊ |
| W-F4 | `RESULT.md` theo F1–F12 và khuyến nghị cho DR-005 (F11), hoặc `NEGATIVE_RESULT` (F12). Leader duyệt cách biểu diễn; C4 đóng theo bằng chứng | TASK F11, F12; DR-005 | Leader quyết; `PROJECT_STATE` C4 cập nhật | QA LLM | MỞ |

---

## P2 · Bằng chứng thiết bị (leader thao tác điện thoại)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-D1 | **Phiên 1**, ngay khi Mac mini trả lời: `device_session.ps1` gồm TC-PERF-001 ×3 (MRI + GT, CASE_0061), tour SCR-01…SCR-08 (CASE_0042), chấm T1–T4. Điều kiện: Mac mini bật và `/health` ok, ZeroTier trên điện thoại DIRECT, có APK live | `mobile/DEVICE_SESSION.md`; `mobile/A9_TC_PERF_001_SCRIPT.md` | Có `SUMMARY.md` và PROVENANCE đã điền; các tệp ở cột "có" được commit | verdict của script; quét an toàn | CHỜ LEADER |
| W-D2 | Đối chiếu log server của phiên 1 (A9 §4.4: `requests.jsonl`, `uvicorn.log`, `summarize_request_log.py`) | A9 §4.4 | Số request khớp với log điện thoại | script tóm tắt | MỞ |
| W-D3 | **Phiên 2**, trên bản build cuối, chậm nhất 03/11, theo W-C15: ảnh mọi màn hình ở mọi trạng thái chính; TC-PERF-001 ×3; TC-PERF-002 (SCR-05 4 lớp, mesh case holdout); TC-PERF-003 (brush 576×576); TC-3D-002…005; TC-REV-002…005; TC-USAB-001/002/003/004; TC-REL-002 (ngắt mạng giữa lúc lưu); TC-MODE-001 / TC-CASE-002 / TC-MASK-002 trên CASE_0001; ma trận trạng thái từng màn hình (TC-MOBILE-STATE-001); kiểm log thật (TC-SEC-003). TC-PERF-002 cũng đo lại F8 của Spike F trong WebView của app | ACCEPTANCE_TRACE §3; DEMO_STANDARD D1, D5 | Mỗi TC có tệp thô và verdict; không lần đo nào bị loại | verdict của script | CHỜ THIẾT BỊ |
| W-D4 | TC-E2E-001: quay một video liên tục một lượt hero flow H1–H10 trên A17. TC-USAB-005: 5 lượt liên tiếp thành công trên cùng bản build, có log; log đã che được commit | `13` §13 | Video (ngoài git) và log đã che (trong git) | tiêu chí PASS của kịch bản | CHỜ THIẾT BỊ |

---

## P3 · Bằng chứng nghiệm thu (03/11 → 04/11)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-E1 | Cập nhật `ACCEPTANCE_TRACE.md` từng dòng (33 MUST, 70 TC) theo bằng chứng mới, kể cả các dòng còn ghi 31/10 và bốn môn. Phần môn học còn ML, Xử lý ảnh, Mobile; giữ một dòng ghi chú cho Khoa học dữ liệu | §1.2 của trace | Mỗi dòng đổi trạng thái trỏ tới một tệp hoặc commit | đối chiếu | MỞ |
| W-E2 | RTM thực thi ở mức FR/NFR: `management/REQUIREMENTS_TRACEABILITY_MATRIX.md` | TC-AUDIT-001 | Mọi FR/NFR MUST có TC và bằng chứng, hoặc ghi rõ thiếu | đối chiếu `13` §10 | MỞ |
| W-E3 | UI theo thiết kế so với UI đã cài đặt, cho 8 màn hình. Nguồn thiết kế: spec `10` (đóng băng trước khi cài đặt) và thiết kế trong các gói TC-TEAM; ảnh thật lấy từ W-D3 | `16` §5.1 CLO1/CLO2 | Bảng từng màn hình: khớp, hoặc lệch kèm lý do | ảnh W-D3 | MỞ |
| W-E4 | Bốn gói TC-TEAM-001, mỗi thành viên một chức năng theo DR-013 (V1 Phạm Tuấn Anh, V2 Vũ Hùng Anh, V3 Bế Quốc Khánh, V4 Nguyễn Gia Đức Trung). Mỗi gói có bằng chứng phân tích, thiết kế, UI, cài đặt, test, riêng tư và bảo vệ. Ghi trung thực phần thành viên tự làm (theo commit) và phần agent làm dưới tài khoản leader. Phần bảo vệ và lời của TC-TEAM-001 do thành viên tự viết. Thiếu phần tự cài đặt thì ghi là hạn chế của TC-TEAM-001 | TC-TEAM-001, PR-MOBILE-03, `16` §5.1 CLO3, DR-023 mục 4–5 | Mỗi gói đủ bảy phần và ghi đúng tác giả | đọc lại | MỞ |
| W-E5 | Biên bản truy nguồn cho mỗi bảng số trong báo cáo: bảng nào cũng truy được tới phiên bản dữ liệu, mã, split và cấu hình | TC-REP-001 | Mỗi bảng trỏ tới manifest, mã, split, cấu hình | đối chiếu | MỞ |
| W-E6 | Hồ sơ mạng tin cậy của `LOCAL_DEMO`: ZeroTier PRIVATE, cleartext chỉ có ở bản live | TC-SEC-002 | Có biên bản | đọc lại | MỞ |
| W-E7 | Rà P0/P1: không còn P0 mở, và không còn P1 làm hỏng demo chuẩn hay tính đúng khoa học | `13` §12–§13 | Danh sách rỗng, kèm phạm vi đã rà | sổ QA + issue | MỞ |
| W-E9 | Ghi chú B15 của Spike B (chi phí phát triển) do chủ là Vũ Hùng Anh viết, vẫn còn nợ. Phiên của leader không viết thay (DR-023 mục 5). Leader nhờ Hùng Anh viết, hoặc ghi là thiếu | `PROJECT_STATE.yaml` SPIKE_B; `management/adr/TECH_STACK_ADR.md` | Có ghi chú do Hùng Anh viết, hoặc leader ghi là thiếu (hạn chế) | đọc lại | CHỜ LEADER |
| W-E8 | Leader đánh dấu `ACCEPTED` từng yêu cầu đủ điều kiện; `PROJECT_STATE.yaml` cập nhật số `accepted` | DR-023 mục 10, TC-AUDIT-002 | Số trong tệp trạng thái khớp với trace | CI `state-parses` | CHỜ LEADER |

---

## P4 · Báo cáo và slide: ba môn (04/11 → 07/11)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-R0 | Thông tin từng môn: mẫu báo cáo, ngôn ngữ, độ dài, thời lượng trình bày, ngày bảo vệ, cá nhân hay nhóm | leader | Có đủ cho cả ba môn | — | CHỜ LEADER |
| W-R1 | **Báo cáo ML.** Câu hỏi lõi của `16` §3 ML. Bằng chứng: ma trận 25/50/100 % (DINOv2, và UNet nếu kịp), phân phối Dice/IoU, so sánh cặp theo case, giao thức tái lập. Giới hạn: không augmentation, lr hằng số, 2D, một seed mỗi tỉ lệ, không hiệu chỉnh đa so sánh, ngoại lệ DR-002b; UNet chưa có thì báo cáo và slide ML ghi RQ-A chưa trả lời được (DR-023 mục 8). Số lấy từ `management/day39/RESULTS_HOLDOUT_DINOV2.md` | `16` §3, PR-SCI-03, TC-SCI-003 | Leader duyệt bản cuối | danh sách tick W-R6 | MỞ |
| W-R2 | **Báo cáo Xử lý ảnh.** Chuẩn hóa và resize (DR-011); ablation raw → PP-4 (GATE-IMG-01), kèm cảnh báo PP-4 được chọn trên chính 20 case validation (QA_PR92 NB-3) và hiệu ứng lát biên (NB-4); hình thái học; dựng bề mặt L0; ánh xạ voxel/pixel/world (`GEOMETRY_NOT_VALIDATED`, không dùng mm); bản đồ lỗi 2D và 3D, kèm kết quả Spike F | `16` §3, TC-SCI-002 | Leader duyệt bản cuối | danh sách tick W-R6 | MỞ |
| W-R3 | **Báo cáo Mobile.** Đủ `16` §5 và rubric §5.1 (CLO1–CLO3): phân tích chức năng và phi chức năng, kiến trúc và ADR, UI thiết kế so với cài đặt (W-E3), cấu trúc dùng chung, tích hợp, riêng tư, chức năng của từng thành viên; số đo thiết bị lấy từ W-D1…W-D4 | `16` §3, §5, §5.1 | Leader duyệt bản cuối | danh sách tick W-R6 | MỞ |
| W-R4 | Ba bộ slide, mỗi môn một bộ. Bộ dựng của #102 và bản nháp 24 slide chỉ là nguồn; cập nhật hạn 08/11 và ba môn, bỏ "31/10" và bốn môn (QA_PR100_103 #102 NB-2…NB-4 xét ở đây) | DR-023 mục 7 | Leader duyệt | dựng lại từ artifact | MỞ |
| W-R5 | Bốn gói bảo vệ Mobile: phần lõi chung và phần chuyên sâu cá nhân, theo chuỗi yêu cầu → thiết kế UI → kiến trúc/API → commit → test → demo → riêng tư → giới hạn | `16` §6 | Mỗi thành viên có một gói | đọc lại | MỞ |
| W-R6 | Danh sách tick từ ngữ: ghi LASC 2018, không gọi là tái lập LAScarQS (TC-SCI-001); không mm/mL (TC-SCI-002); giữ thứ tự quan sát, có CI, không lọc case (TC-SCI-003); QA LLM không gọi là review người; phần agent làm ghi đúng; UNet chưa có kết quả thì ghi là hạn chế trong báo cáo và slide ML | `13` §13 | Mỗi báo cáo và slide có bảng tick đã điền | rà | MỞ |
| W-R7 | Lưu bằng chứng theo `16` §7: manifest, ảnh/video, sơ đồ kiến trúc, UML, PR/test tiêu biểu, RTM, đóng góp thành viên, thiết kế UI kèm ảnh màn hình, nhật ký quyết định | `16` §7 | Có danh mục trỏ tới từng mục | đối chiếu | MỞ |
| W-R8 | Tổng duyệt có bấm giờ, ít nhất một lần cho mỗi môn. Pha C4 của REPLAN đòi hai lần; số lần ở đây là kế hoạch của Project Control | kế hoạch Project Control | Ghi thời lượng và các sửa đổi | — | CHỜ LEADER |

---

## K · UNet (Bế Quốc Khánh, GPU)

UNet ở lại với Khánh. Ngày 27/10 leader đã từ chối phương án dự phòng của DR-016a, tức chạy trên PC của leader ("Để Khánh, không chạy").

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-K1 | Train EXP-U-025/050/100 theo ADR-ML-001, qua tripwire của DR-016a, bằng hàng đợi của #100 | PR-EXP-01/03 | Ba checkpoint và log train | `ml/tests` + tripwire | CHỜ GPU |
| W-K2 | Leader ký bản ghi cho phép holdout thứ hai cho EXP-U-* (`tools/ml/make_holdout_authorization.py`) | ACCEPTANCE_TRACE PR-EXP-03 | Bản ghi nằm trên `main` | `holdout_pipeline.py` kiểm bản ghi | CHỜ GPU |
| W-K3 | `tools/ml/holdout_pipeline.py`: chấm một lần, xuất Contract 2, chạy validator, nạp backend, chạy lại H10 | #100 | H10 so sánh UNet với DINOv2 không còn SKIP | E2E | CHỜ GPU |
| W-K4 | Hạn để kết quả UNet kịp vào báo cáo. Đề xuất 04/11 12:00. Quá hạn thì báo cáo ML ghi RQ-A chưa trả lời được và nêu lý do | PR-SCI-03; DR-023 mục 8 | Leader quyết | — | CHỜ LEADER |

---

## O · Vận hành

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| W-O1 | Mac mini bật và ssh được trước mỗi phiên điện thoại và mỗi lần deploy; tắt chế độ tự ngủ | W-C12, W-D1 | ssh và `/health` trả lời | `ssh`; `/health` | CHỜ LEADER |
| W-O2 | Thư mục `node_modules` dùng chung cho mọi worktree nằm ngoài repo và ngoài thư mục tạm, để không bị dọn mất lần nữa | lần mất trong đợt 02–17/10 | Các worktree trỏ tới thư mục dùng chung | kiểm trong phiên | XONG (máy leader, kiểm 30/10) |
| W-O3 | Máy chạy CI: job Python 3.9 ghim `ubuntu-24.04`. Các job khác chạy `ubuntu-latest` (26.04) và đang xanh; job nào đỏ ở bước setup thì kiểm ảnh máy chạy trước khi kiểm code | #108 | #108 merge, CI xanh trên `main` | CI | XONG (`5232f52`) |
