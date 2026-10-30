# DANH MỤC VIỆC TỚI NGHIỆM THU 08/11/2026

| Mục | Giá trị |
|---|---|
| **Lập** | 30/10/2026 (Day 51), theo `management/day51/OPERATING_MODE_2026-10-30.md` (DR-023) |
| **Mục đích** | Một danh sách duy nhất, đủ từng việc còn lại tới nghiệm thu. Mỗi việc ghi nguồn, điều kiện xong (thấy được), cách kiểm và trạng thái. Không việc nào được đóng nếu chưa chạy phép kiểm và ghi bằng chứng |
| **Cơ sở** | `main` tại `cd76112`; `management/day40/ACCEPTANCE_TRACE.md` (33 MUST, 70 TC); `docs/specs/v1.0/16` (§3 góc nhìn từng môn, §5–§7); các file QA trong `management/day39/qa/`; `mobile/DEVICE_SESSION.md` |
| **Nhịp** | Chất lượng trước tốc độ. Tối đa 2 agent chạy song song, một việc nặng một lúc. Ngày ghi trong bảng là hạn muộn nhất, không phải mục tiêu chạy đua |

## 0 · Cách đọc

| Trạng thái | Nghĩa |
|---|---|
| `MỞ` | chưa bắt đầu |
| `ĐANG LÀM` | đang làm, ghi nhánh hoặc agent |
| `XONG` | đã chạy phép kiểm; ghi commit, PR hoặc tệp bằng chứng |
| `CHỜ LEADER` | cần anh quyết định hoặc thao tác |
| `CHỜ THIẾT BỊ` | cần phiên điện thoại (chỉ anh thao tác) |
| `CHỜ GPU` | cần Bế Quốc Khánh (RTX 4050) |
| `BỎ` | không làm, kèm lý do và người quyết |

Cách cập nhật: mỗi PR đóng việc nào thì sửa đúng dòng đó trong cùng PR. `XONG` không có nghĩa là `ACCEPTED`: chỉ anh mới chuyển một yêu cầu sang `ACCEPTED` (`13` §6).

---

## P1 · Hoàn thiện sản phẩm (30/10 → 02/11)

### P1-A · V2: bản đồ lỗi 3D và liên kết 2D↔3D

Agent A, nhánh `feat/v2-error-map-and-linkage`, theo DR-005 (đã quyết 30/10: làm đầy đủ).

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| A1 | Artifact mesh lỗi: FP = dự đoán ∧ ¬GT, FN = GT ∧ ¬dự đoán; mỗi lớp một bề mặt mặt-voxel L0 (DR-008c); mỗi mặt mang lát nguồn và lớp; ghi một lần, khóa theo sha256 của hai mask cộng phiên bản định dạng | DR-005, FR-3D-007 | Test chứng minh lớp đúng và mọi mặt nằm trên voxel đúng lớp ở lát nguồn của nó; dựng lại cho ra cùng byte | `pytest backend/mesh/tests`; mutation phép gán lớp làm test đỏ | ĐANG LÀM |
| A2 | `build_cache` dựng mesh lỗi cho mọi run có GT, cả RAW và PROCESSED; bỏ qua case INFERENCE_REVIEW | DR-005, DR-017 | Số mesh lỗi bằng số cặp (run, variant) có GT; CASE_0001 không có mesh lỗi | test + đếm trên thư mục dữ liệu backend (ngoài git) | ĐANG LÀM |
| A3 | `error_reconstruction_get` trả đủ trường của contract; `GROUND_TRUTH_UNAVAILABLE` cho INT-12; `ARTIFACT_NOT_FOUND` chỉ khi thật sự thiếu; byte đi qua route theo nội dung, có checksum. Test cũ "honestly unavailable while DR-005 is open" được thay bằng test hành vi mới, không xóa im lặng | contract 1.1.0; FR-3D-007 | Test endpoint đạt; test contract API đạt | `pytest backend/tests`; `python contracts/api/test_api_contract.py` | ĐANG LÀM |
| A4 | SCR-05 có 4 lớp GT / dự đoán / FP / FN, nhãn chữ và chú giải (không chỉ dựa vào màu), bật/tắt từng lớp | PR-ERR-03, PR-3D-05, spec `10` | Render thấy đủ 4 nhãn và chú giải; mỗi lớp bật/tắt độc lập | `npm test`; `npm run test:render` | ĐANG LÀM |
| A5 | 2D→3D: dải "lát n / tổng" theo lát 2D lúc mở, lúc quay lại từ SCR-03/SCR-04 (QA_PR98 N-6) và khi kéo slider trong SCR-05 | PR-3D-03, TC-3D-003 | Test khứ hồi: đổi lát trong 2D rồi quay lại, dải nằm ở lát mới | `npm test` | ĐANG LÀM |
| A6 | 3D→2D: chạm, lấy mặt trúng đầu tiên, ra lát nguồn và lớp. "Mở 2D" sang SCR-03 đúng lát; mặt FP/FN có thêm "Mở lỗi" sang SCR-04 đúng lát | PR-3D-04, FR-3D-008, TC-3D-004/005 | Test điều hướng đạt | `npm test`; mutation ánh xạ chạm → lát làm test đỏ | ĐANG LÀM |
| A7 | Mỗi lớp có trạng thái riêng: đang tải / không khả dụng (lý do API) / lỗi / thành công. Thiếu mesh lỗi không làm hỏng các bề mặt khác | PR-MOBILE-02 | Mỗi trạng thái có một test | `npm test` | ĐANG LÀM |
| A8 | Viewer không gọi mạng (QA_PR98 N-4: thêm assertion) và không giải mã một mesh hai lần (N-5) | QA_PR98 | Hai test mới đạt | `npm test` | ĐANG LÀM |
| A9 | `MeshStore` tự từ chối sidecar có nguồn là GT của INT-12 | QA_PR98 N-9 | Test đạt | `pytest backend/tests` | ĐANG LÀM |
| A10 | E2E H6/H7 mở rộng: byte và checksum của mesh FP/FN; mặt FP được chọn nằm trên voxel dự đoán = 1, GT = 0 trong PNG phục vụ; FN tương tự | TC-3D-005, `DEMO_STANDARD` §3 | `hero_flow_api.py` PASS trên CASE_0042 và thêm một case | backend local; đầu ra lưu ngoài git | ĐANG LÀM |
| A11 | Dựng mesh lỗi vào thư mục dữ liệu backend (ngoài git), ghi kích thước và thời gian dựng | DR-005 | Có số kích thước và thời gian trong báo cáo của agent | — | ĐANG LÀM |
| A12 | Ghi lệch hợp đồng: route mesh và định dạng id mesh lỗi chỉ nằm trong `contracts/api/README.md`; không nâng phiên bản API trước nghiệm thu | QA_PR98 N-8 | README nêu rõ lệch và lý do | đọc lại | ĐANG LÀM |

### P1-B · Tồn đọng QA và PR của Khánh

Agent B, nhánh `fix/qa-backlog-d51`.

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| B1 | #106: tìm nguyên nhân gốc của job CI đỏ "backend tests" và sửa trên nhánh `fix/pr106-ci` (từ head của #106) | #106 | Có nguyên nhân gốc kèm dòng log và test; job xanh khi chạy lại | `pytest backend/tests` trên bản merge với `main` | ĐANG LÀM |
| B2 | Rà diff của #106 (V3 app + mobile, evidence, che thông tin trong RESULT Spike D) và #105 (bảng revalidation) | #105, #106 | Danh sách lỗi, hoặc ghi "không có lỗi" kèm phạm vi đã đọc | đọc diff | ĐANG LÀM |
| B3 | V4: Refresh khi phiên bản mới nhất đã đổi | QA_PR99 NB-2 | Có test cho nhánh mất dữ liệu | `node app/verticals/v4_review_and_findings/test_*.mjs` | ĐANG LÀM |
| B4 | V4 live: kiểm `prediction_mask_id` theo artifact id của run (như E2E H8) | QA_PR99 NB-3 | Test; README đúng với code | như trên | ĐANG LÀM |
| B5 | V4: các lệnh đọc dùng `client.call` hay `useCall` phải khớp README (DR-021 rule 2) | QA_PR99 NB-4 | README đúng, hoặc lệnh đọc chuyển sang `useCall` | test + đọc lại | ĐANG LÀM |
| B6 | V4 live: `caseId` của route phải khớp `case_id` của run | QA_PR99 NB-5 | Test | `npm test` | ĐANG LÀM |
| B7 | `mobile/README.md` mô tả render smoke có V4 và số đếm mới | QA_PR99 NB-6 | README đúng | đọc lại | ĐANG LÀM |
| B8 | Test tie-break của `latestVersion` | QA_PR99 NB-7 | Mutation `>=` thành `>` làm test đỏ | mutation | ĐANG LÀM |
| B9 | `record_path` không được trỏ ra ngoài repo | QA_PR94 NB-3 | Test từ chối `..` | `pytest backend/tests` | ĐANG LÀM |
| B10 | Hai câu đã cũ (README Contract 2 dòng 96; exporter) | QA_PR94 NB-4 | Chữ đúng với code | đọc lại | ĐANG LÀM |
| B11 | `successful_n` khi ML ghi case INT-12 là failed | QA_PR94 NB-5 | Test hoặc ghi rõ quy tắc | `pytest` | ĐANG LÀM |
| B12 | Validator: kiểm nốt `experiment_id` của `outlier_selection` (N-c mới đóng một nửa) | QA_PR94 NB-6 | Test | `python contracts/api/test_api_contract.py` | ĐANG LÀM |
| B13 | Dàn lại dòng dài trong validator | QA_PR94 NB-7 | — | đọc lại | ĐANG LÀM |
| B14 | `authorized_runs`: từ chối `experiment_id` trùng; so run được phục vụ với `authorized_runs` | QA_PR98 N-7 | Test | `pytest backend/tests` | ĐANG LÀM |
| B15 | Công cụ: #100 pipeline kiểm bản ghi cho phép đã nằm trên `origin/main` (không chỉ ở máy); #101 deploy `-SkipData -ShipPackages` khi DataCache rỗng báo lỗi rõ, kiểm mã thoát của `tar -tzf`; #102 quét rò rỉ trước khi ghi file; #103 các mục còn lại | QA_PR100_103 | Mỗi mục có test hoặc phép kiểm PowerShell | test + parse `.ps1` | ĐANG LÀM |
| B16 | V1/V3: các mục không chặn còn lại (không thuộc V2) | QA_PR88, QA_PR90 | Mỗi mục có test hoặc lý do bỏ | test | ĐANG LÀM |

### P1-C · Sau khi A và B xong

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| C1 | QA LLM độc lập cho nhánh A; sửa phát hiện; PR; CI xanh; merge | DR-023 | PR merge, có file QA trong `management/day51/qa/` | CI + QA | MỞ |
| C2 | QA LLM cho nhánh B; PR; merge. #106: đẩy `fix/pr106-ci` thành PR nối tiếp (hoặc nhờ Khánh lấy), rồi merge #106 sau QA; merge #105 | DR-023 | #105, #106 và nhánh B nằm trên `main` | CI + QA | MỞ |
| C3 | **Sổ QA**: liệt kê mọi phát hiện không chặn trong `management/day22/`…`day39/` (`qa/`, `QA_REVIEW_*`), kiểm từng mục trên `main`: đã sửa (commit), còn mở, hay chấp nhận có lý do | "đừng bỏ qua tiểu tiết" | `management/day51/QA_REGISTER.md` đủ từng mục | đối chiếu code | MỞ |
| C4 | Sửa các mục còn mở trong sổ QA mà A và B không làm. Đã biết: QA_PR92 NB-1 (run dẫn xuất tin manifest của chính nó), NB-2 (exporter đặt checkpoint trước khi kiểm bản ghi cho phép); QA_PR98 N-2 (`--only-binary` cho scipy), N-3 (chú thích job CI); QA_PR87 N-1 (bộ quét IPv4 bỏ sót), N-3 (`timeout-minutes`); QA_PR95 NB-1…NB-7 (E2E); QA_PR96 NB-1…NB-5 (chữ trong tài liệu kết quả); QA_PR94 NB-1, NB-2 | C3 | Mỗi mục có test, hoặc lý do bỏ được anh duyệt | test | MỞ |
| C5 | PR-EXP-04 trên app: ở live mode SCR-07 hiện ô EXP-D-PP cạnh EXP-D-100, ghi rõ "ablation hậu xử lý, cùng checkpoint", không bao giờ ghi là so sánh giữa mô hình. Thêm kịch bản generator phục vụ EXP-D-PP là PROCESSED để test được | PR-EXP-04, PR-IMG-01, QA_PR94 NB-8, V3 README mục 2 | Test render thấy ô ablation có nhãn đúng; ô so sánh RAW với PROCESSED vẫn là `comparable:false` | `npm run test:render`; V3 test | MỞ |
| C6 | PR-EXP-02 mức case: xác định phần so sánh cặp theo case còn thiếu (V3 README mục 3), làm và test | PR-EXP-02, TC-EXP-006/007 | Chạm một điểm của cặp mở đúng case; có test | V3 test + render | MỞ |
| C7 | Test opacity: đổi opacity không đổi hình học mask | TC-MASK-003 | Test đạt; mutation làm đỏ | `npm test` | MỞ |
| C8 | Client hiện trạng thái không khả dụng khi lệch phiên bản hình học | TC-REL-003 | Test đạt | `npm test` | MỞ |
| C9 | Quét bí mật toàn repo và bundle mobile (hiện CI chỉ quét tệp thêm vào) | TC-SEC-004 | Job CI xanh và bắt được mẫu cài thử | CI | MỞ |
| C10 | Bản đồ module và ranh giới tích hợp | TC-MAINT-001 | Có tệp, mỗi module trỏ tới code và test | đọc lại | MỞ |
| C11 | Code mobile chạy trực tiếp fixture hình học chuẩn | TC-MAINT-002, INT-13 | Test mobile đọc fixture chuẩn và khớp | `npm test` | MỞ |
| C12 | Mac mini: bật máy và kiểm ssh; deploy `-ShipPackages` có mesh lỗi; chạy E2E `--no-writes` lên Mac mini | DR-022; `backend/scripts/deploy_macmini.ps1` | `/health` ok; E2E không FAIL | E2E | CHỜ LEADER (máy đang tắt: ssh timeout 27/10 và 30/10) |
| C13 | E2E đầy đủ ở local sau khi merge: mọi bước PASS, trừ bước UNet | `tools/e2e/hero_flow_api.py` | Cập nhật `E2E_EVIDENCE` mới (chỉ số đếm và tóm tắt) | E2E | MỞ |
| C14 | Build APK release live từ `main` cuối, ghi commit và sha256 trong `.build.txt` | `mobile/scripts/build-release.ps1` | APK và bản ghi build cho phiên 2 | `device_session.ps1 -DryRun` | MỞ |
| C15 | Kịch bản phiên 2: mỗi TC thiết bị có các bước và tiêu chí PASS viết sẵn (mở rộng `device_session.ps1` hoặc tài liệu đi kèm): TC-PERF-002, TC-PERF-003, TC-3D-002…005, TC-REV-002…005, TC-REL-002, TC-MOBILE-STATE-001, TC-USAB-001/003/004, TC-MODE-001 trên INT-12, TC-SEC-003, TC-E2E-001, TC-USAB-005 | ACCEPTANCE_TRACE §3 | Kịch bản có bản tự kiểm không cần điện thoại (`-SelfTest`, điện thoại giả) | Pester + SelfTest | MỞ |

---

## P2 · Bằng chứng thiết bị (anh thao tác điện thoại)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| D1 | **Phiên 1 (tối 30/10)**: `device_session.ps1`, gồm TC-PERF-001 ×3 (MRI + GT, CASE_0061), tour SCR-01…SCR-08 (CASE_0042), chấm T1–T4. Điều kiện: Mac mini bật và `/health` ok; ZeroTier trên điện thoại DIRECT; APK live hiện có | `mobile/DEVICE_SESSION.md`; `mobile/A9_TC_PERF_001_SCRIPT.md` | Có `SUMMARY.md` và PROVENANCE đã điền; các file thuộc cột "có" được commit | verdict của script; quét an toàn | CHỜ LEADER |
| D2 | Đối chiếu log server của phiên 1 (A9 §4.4: `requests.jsonl`, `uvicorn.log`, `summarize_request_log.py`) | A9 §4.4 | Số request khớp với log điện thoại | script tóm tắt | MỞ |
| D3 | **Phiên 2 (bản build cuối, chậm nhất 03/11)**, theo C15: ảnh mọi màn hình ở mọi trạng thái chính; TC-PERF-001 ×3; TC-PERF-002 (SCR-05 4 lớp, mesh case holdout); TC-PERF-003 (brush 576×576); TC-3D-002…005; TC-REV-002…005; TC-USAB-002; TC-REL-002 (ngắt mạng giữa lúc lưu); TC-MODE-001 / TC-CASE-002 / TC-MASK-002 trên CASE_0001; ma trận trạng thái từng màn hình (TC-MOBILE-STATE-001); TC-USAB-001/003/004; kiểm log thật (TC-SEC-003) | ACCEPTANCE_TRACE §3; DEMO_STANDARD D1, D5 | Mỗi TC có tệp thô và verdict; không lần đo nào bị loại | verdict của script | CHỜ THIẾT BỊ |
| D4 | TC-E2E-001: một lượt hero flow H1–H10 quay liên tục trên A17. TC-USAB-005: 5 lượt liên tiếp thành công trên cùng bản build, log đã che được commit | `13` §13 | Video (ngoài git) và log đã che (trong git) | tiêu chí PASS của kịch bản | CHỜ THIẾT BỊ |

---

## P3 · Bằng chứng nghiệm thu (03/11 → 04/11)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| E1 | Cập nhật `ACCEPTANCE_TRACE.md` từng dòng (33 MUST, 70 TC) theo bằng chứng mới. Phần môn học còn ML, Xử lý ảnh, Mobile; giữ một dòng ghi chú cho Khoa học dữ liệu | §1.2 của trace | Mỗi dòng đổi trạng thái đều trỏ tới tệp hoặc commit | đối chiếu | MỞ |
| E2 | RTM thực thi ở mức FR/NFR: `management/REQUIREMENTS_TRACEABILITY_MATRIX.md` | TC-AUDIT-001 | Mọi FR/NFR MUST có TC và bằng chứng, hoặc ghi rõ thiếu | đối chiếu `13` §10 | MỞ |
| E3 | UI theo thiết kế so với UI đã cài đặt, cho 8 màn hình. Nguồn thiết kế: spec `10` (đóng băng trước khi cài đặt) và thiết kế trong các gói TC-TEAM; ảnh thật lấy từ D3 | `16` §5.1 CLO1/CLO2 | Bảng từng màn hình: khớp / lệch kèm lý do | ảnh D3 | MỞ |
| E4 | Bốn gói TC-TEAM-001 cập nhật theo code thực, ghi rõ phần agent làm dưới tài khoản leader; không viết thay phần bảo vệ cá nhân | `16` §5.1 CLO3, DR-023 mục 3 | Mỗi gói có PR, test, ảnh màn hình so với thiết kế, riêng tư, giới hạn | đọc lại | MỞ |
| E5 | Biên bản "truy được mọi phiên bản" cho mỗi bảng số trong báo cáo | TC-REP-001 | Mỗi bảng trỏ tới manifest, mã, split, cấu hình | đối chiếu | MỞ |
| E6 | Hồ sơ mạng tin cậy của `LOCAL_DEMO` (ZeroTier PRIVATE, cleartext chỉ ở bản live) | TC-SEC-002 | Có biên bản | đọc lại | MỞ |
| E7 | Rà P0/P1: không còn lỗi P0/P1 mở | `13` §6 | Danh sách rỗng, kèm phạm vi đã rà | sổ QA + issue | MỞ |
| E8 | Anh đánh dấu `ACCEPTED` từng yêu cầu đủ điều kiện; `PROJECT_STATE.yaml` cập nhật số `accepted` | `13` §6, TC-AUDIT-002 | Số trong state khớp với trace | CI `state-parses` | CHỜ LEADER |

---

## P4 · Báo cáo và slide: ba môn (04/11 → 07/11)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| R0 | Thông tin từng môn: mẫu báo cáo, ngôn ngữ, độ dài, thời lượng trình bày, ngày bảo vệ, cá nhân hay nhóm | anh | Có đủ cho cả ba môn | — | CHỜ LEADER |
| R1 | **Báo cáo ML.** Câu hỏi lõi của `16` §3 ML. Bằng chứng: ma trận 25/50/100 % (DINOv2; UNet nếu kịp), phân phối Dice/IoU, so sánh cặp theo case, giao thức tái lập. Giới hạn: không augmentation, lr hằng số, 2D, một seed mỗi tỉ lệ, không hiệu chỉnh đa so sánh, ngoại lệ DR-002b. Số lấy từ `management/day39/RESULTS_HOLDOUT_DINOV2.md` | `16` §3, PR-SCI-03, TC-SCI-003 | Anh duyệt bản cuối | danh sách tick R6 | MỞ |
| R2 | **Báo cáo Xử lý ảnh.** Chuẩn hóa và resize (DR-011); ablation raw → PP-4 (GATE-IMG-01), kèm cảnh báo PP-4 được chọn trên chính 20 case validation (QA_PR92 NB-3) và hiệu ứng lát biên (NB-4); hình thái học; dựng bề mặt L0; ánh xạ voxel/pixel/world (`GEOMETRY_NOT_VALIDATED`, không mm); bản đồ lỗi 2D và 3D | `16` §3, TC-SCI-002 | Anh duyệt bản cuối | danh sách tick R6 | MỞ |
| R3 | **Báo cáo Mobile.** Đủ `16` §5 và rubric §5.1 (CLO1–CLO3): phân tích chức năng/phi chức năng, kiến trúc và ADR, UI thiết kế so với cài đặt (E3), cấu trúc dùng chung, tích hợp, riêng tư, chức năng của từng thành viên; số đo thiết bị lấy từ D1–D4 | `16` §3, §5, §5.1 | Anh duyệt bản cuối | danh sách tick R6 | MỞ |
| R4 | Ba bộ slide, mỗi môn một bộ. Bộ dựng của #102 và bản nháp 24 slide chỉ là nguồn | quyết định 30/10 | Anh duyệt | dựng lại từ artifact | MỞ |
| R5 | Bốn gói bảo vệ Mobile: phần lõi chung và phần chuyên sâu cá nhân, theo chuỗi yêu cầu → thiết kế UI → kiến trúc/API → commit → test → demo → riêng tư → giới hạn | `16` §6 | Mỗi thành viên có một gói | đọc lại | MỞ |
| R6 | Danh sách tick từ ngữ: ghi LASC 2018, không gọi là tái lập LAScarQS (TC-SCI-001); không mm/mL (TC-SCI-002); giữ thứ tự quan sát, có CI, không lọc case (TC-SCI-003); QA LLM không gọi là review người; phần agent làm ghi đúng | `13` §13 | Mỗi báo cáo và slide có bảng tick đã điền | rà | MỞ |
| R7 | Lưu bằng chứng theo `16` §7: manifest, ảnh/video, sơ đồ kiến trúc, UML, PR/test tiêu biểu, RTM, đóng góp thành viên, thiết kế UI kèm ảnh màn hình, nhật ký quyết định | `16` §7 | Có danh mục trỏ tới từng mục | đối chiếu | MỞ |
| R8 | Tổng duyệt có bấm giờ, ít nhất một lần cho mỗi môn | REPLAN C4 | Ghi thời lượng và sửa đổi | — | CHỜ LEADER |

---

## K · UNet (Bế Quốc Khánh, GPU)

| ID | Việc | Nguồn | Xong khi | Kiểm bằng | Trạng thái |
|---|---|---|---|---|---|
| K1 | Train EXP-U-025/050/100 theo ADR-ML-001, qua tripwire DR-016a, bằng hàng đợi của #100 | PR-EXP-01/03 | Ba checkpoint và log train | `ml/tests` + tripwire | CHỜ GPU |
| K2 | Anh ký bản ghi cho phép holdout thứ hai cho EXP-U-* (`tools/ml/make_holdout_authorization.py`) | ACCEPTANCE_TRACE PR-EXP-03 | Bản ghi nằm trên `main` | `holdout_pipeline.py` kiểm bản ghi | CHỜ GPU |
| K3 | `tools/ml/holdout_pipeline.py`: chấm một lần, xuất Contract 2, validator, nạp backend, chạy lại H10 | #100 | H10 so sánh UNet với DINOv2 không còn SKIP | E2E | CHỜ GPU |
| K4 | Hạn để kết quả UNet vào báo cáo. Đề xuất: 04/11 12:00. Quá hạn thì báo cáo ML ghi RQ-A chưa trả lời được, nêu lý do | PR-SCI-03 | Anh quyết | — | CHỜ LEADER |

---

## O · Vận hành

| ID | Việc | Trạng thái |
|---|---|---|
| O1 | Mac mini bật và ssh được trước mỗi phiên điện thoại và mỗi lần deploy | CHỜ LEADER |
| O2 | Tối đa 2 agent; một việc nặng (build, train, dựng mesh) một lúc; giữ máy mát | áp dụng |
| O3 | Bản cài `node_modules` dùng chung nằm ngoài repo và ngoài thư mục tạm, để không bị dọn mất lần nữa | XONG (30/10) |
