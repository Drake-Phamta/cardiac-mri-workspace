# Cardiac MRI Workspace

App Android giúp người nghiên cứu **xem và rà soát kết quả phân vùng nhĩ trái (left atrium) trên ảnh MRI tim 3D**.
Người dùng là sinh viên, người nghiên cứu ảnh y tế: họ mở từng case, lướt từng lát MRI với mask dự đoán chồng lên,
so với ground truth, xem chỗ mô hình sai, xem mô hình 3D của nhĩ trái, so sánh các thí nghiệm (UNet và DINOv2,
25/50/100 % dữ liệu train, có hoặc không hậu xử lý), sửa mask bằng bút và ghi lại nhận xét (finding).

Dữ liệu là bộ LASC 2018 (154 ảnh MRI LGE 3D, đã ẩn danh). Kết quả mô hình được **tính sẵn** trên máy có GPU; điện
thoại không train và không chạy mô hình.

Đồ án môn Phát triển ứng dụng cho các thiết bị di động và môn Học máy. Tài liệu chính:

| Tài liệu | Nội dung |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | Các quyết định kỹ thuật quan trọng và lý do |
| [docs/RESULTS.md](docs/RESULTS.md) | Kết quả đo được: ML trên tập holdout, các thí nghiệm công nghệ |
| [docs/spec/](docs/spec/) | Đặc tả sản phẩm (tiếng Việt, 10 chương): yêu cầu, ai phụ trách, trạng thái, màn hình, API |
| [docs/trace/matrix.csv](docs/trace/matrix.csv) | Ma trận truy vết yêu cầu → mã → test, kiểm bằng `tools/trace_check.py` trong CI |

## Kiến trúc

App React Native (Expo) trên điện thoại gọi một backend FastAPI chạy trên máy tính của nhóm, qua cáp USB. Backend
đọc dữ liệu đã chuẩn bị sẵn ở một thư mục **ngoài git**: lát MRI và mask ground truth (nhập theo Contract 1), các gói
kết quả của pipeline ML (dự đoán và chỉ số đã tính sẵn, nhập theo Contract 2), lưới 3D dựng từ mask, và CSDL SQLite
lưu review và finding. `contracts/api/contract.json` định nghĩa API: backend, app và mọi bộ test đều kiểm theo nó,
và chế độ fixture của app dùng dữ liệu giả sinh từ chính hợp đồng này.

```text
 Điện thoại Android ── mobile/ (Expo / React Native)
   │   màn hình V1–V4 (mobile/src/screens), logic chung trong mobile/src/api và lib
   │   HTTP JSON + ảnh PNG từng lát, qua USB (adb reverse tcp:8000 tcp:8000)
   ▼
 Backend ── backend/ (FastAPI + SQLite, 127.0.0.1:8000, trên máy tính)
   │   đọc
   ▼
 Thư mục dữ liệu ngoài git (CARDIAC_BACKEND_DATA)
   data_cache/   lát MRI + ground truth       ◄── Contract 1 (backend.app.ingest)
   experiments/  dự đoán + chỉ số tính sẵn    ◄── Contract 2 (ml/export_contract2.py)
   derived_meshes/, var/backend.sqlite3
                                                    ▲
 Pipeline ML ── ml/ (PyTorch: train UNet / DINOv2, dự đoán, chấm điểm) ┘

 contracts/ ── định nghĩa API + 2 hợp đồng nhập liệu, dùng chung cho tất cả
```

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `mobile/` | App Expo / React Native. `src/api` (gọi API, 7 trạng thái màn hình, cache, tải byte có kiểm checksum), `src/lib` (toán zoom/pan, mask, SHA-256), `src/components`, `src/navigation`, `src/screens/` (mỗi người một thư mục); `test/` là test logic và render |
| `backend/` | API FastAPI + SQLite, nhập dữ liệu (Contract 1), dựng lưới 3D (`backend/mesh`) |
| `ml/` | Train, dự đoán, chấm điểm, hậu xử lý, xuất gói Contract 2; `ml/records/` giữ bản ghi chọn hậu xử lý và số tổng hợp |
| `contracts/` | Hợp đồng API (`contracts/api/contract.json`) và hai hợp đồng nhập liệu, kèm bộ kiểm |
| `data/` | Manifest của bộ dữ liệu và phép chia train/validation/holdout, báo cáo kiểm dữ liệu (không có ảnh) |
| `tests/` | Fixture hình học chuẩn dùng chung cho backend và CI |
| `tools/` | Công cụ: kiểm và chia dữ liệu, chạy luồng demo qua API (`e2e`), bộ chạy holdout (`ml`), phiên đo trên điện thoại (`device`) |
| `prototypes/` | Mã thử nghiệm trước khi làm sản phẩm: viewer 3D, đo khả năng train, đo tải qua mạng |
| `docs/` | Tài liệu trên, hình kết quả, đặc tả |
| `.github/` | CI (`workflows/guardrails.yml`) và mẫu pull request |

## Chạy backend

Cần Python 3.9 trở lên (máy nhóm dùng 3.12). Chạy từ thư mục gốc repo, PowerShell:

```powershell
pip install -r backend/requirements-dev.txt
$env:CARDIAC_BACKEND_DATA = "<thư mục dữ liệu, ngoài git>"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health
```

Thư mục dữ liệu rỗng thì backend vẫn chạy, `/health` báo `"data_ready": false`. Cách nhập dữ liệu thật (LASC) và gói
kết quả ML: [backend/README.md](backend/README.md) và [tools/e2e/README.md](tools/e2e/README.md).

## Chạy app

Cần Node 22.15 trở lên (máy nhóm dùng Node 24) và Android SDK để build. Chi tiết: [mobile/README.md](mobile/README.md).

**Chế độ fixture** (không cần backend; mọi màn hình dùng dữ liệu giả sinh từ hợp đồng API, có badge FIXTURE):

```powershell
cd mobile
npm ci
npm run android          # = node scripts/prepare.mjs (mặc định fixture) rồi expo run:android, điện thoại cắm USB
```

Hoặc build APK release rồi cài: `powershell -ExecutionPolicy Bypass -File mobile\scripts\build-release.ps1 -Mode fixture`.

**Chế độ live** (dữ liệu thật từ backend trên máy tính): chạy backend như trên, cắm điện thoại, rồi

```powershell
adb reverse tcp:8000 tcp:8000
$env:EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"   # hoặc ghi vào mobile\.env.local (không commit)
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-release.ps1 -Mode live
```

## Chạy test

Tất cả chạy từ thư mục gốc repo, không cần điện thoại hay GPU. Số trong ngoặc là kết quả lần chạy gần nhất.

```powershell
# mobile: test logic (273 test, tự sinh bundle fixture bằng Python; 16 test cần fast-png bị bỏ qua nếu chưa chạy
# npm ci) và render smoke (217 kiểm, cần npm ci)
node --test mobile/test/*.test.mjs
cd mobile; npm ci; npm run test:render; cd ..

# backend (125 test) và lưới 3D (141 test)
python -m pytest backend/tests -q -p no:cacheprovider
python -m pytest backend/mesh/tests -q -p no:cacheprovider

# hợp đồng
cd contracts/ingestion/contract1_raw_dataset; python test_contract1.py; cd ../../..
cd contracts/ingestion/contract2_experiment_artifact; python test_contract2.py; cd ../../..
cd contracts/api; python test_api_contract.py; cd ../..

# fixture hình học chuẩn
python prototypes/3d-viewer/harness/conformance.py --fixture tests/fixtures/geometry/geometry_fixture_v0.json --expect-contract-version dr008a-dr012/v1.0.0

# ML trên CPU, dữ liệu tổng hợp (khoảng 3 phút; cần torch, numpy, scipy, pynrrd, psutil, jsonschema, pytest)
$env:CUDA_VISIBLE_DEVICES = '-1'; $env:HF_HUB_OFFLINE = '1'
python -m pytest ml/tests -q -p no:cacheprovider
```

CI (`.github/workflows/guardrails.yml`) chạy cùng các bộ test này cho mỗi pull request, chạy backend trên Python 3.9,
kiểm checksum của đặc tả, và chặn commit ảnh y tế, checkpoint, secret hay địa chỉ IP nội bộ.

## Nhóm

| Phần | Màn hình | Thư mục | Người phụ trách |
|---|---|---|---|
| **V1** Case Explorer + Error Inspector | SCR-02, SCR-03, SCR-04 | `mobile/src/screens/v1-cases/` | **Phạm Tuấn Anh** (nhóm trưởng; kiêm khung app, tích hợp, CI) |
| **V2** 3D Inspector | SCR-05 | `mobile/src/screens/v2-3d/` | **Vũ Hùng Anh** (kiêm `backend/mesh`) |
| **V3** Study overview + Experiment comparison | SCR-01, SCR-07 | `mobile/src/screens/v3-study/` | **Bế Quốc Khánh** (kiêm pipeline ML `ml/`) |
| **V4** Review/Correction + Findings | SCR-06, SCR-08 | `mobile/src/screens/v4-review/` | **Nguyễn Gia Đức Trung** (kiêm backend API) |

Mỗi người giải thích được mã trong thư mục của mình: file `.js` vẽ màn hình, file `.mjs` cạnh nó quyết định (test
bằng `node --test`), và README ngắn trong thư mục nói file nào làm gì. Phần kiêm nhiệm ghi trong ngoặc.

## Trạng thái (2026-11-14)

Có: app chạy hai chế độ fixture và live, đủ khung các màn hình V1–V4; backend có route cho đủ 28 endpoint của hợp đồng;
kết quả DINOv2 trên 54 case holdout (Dice 3D trung bình 0,6390, sau hậu xử lý 0,6590); luồng demo H1–H10 chạy được qua
API (trừ bước so sánh UNet). Chưa có: UNet
chưa train nên chưa so sánh được UNet với DINOv2; biểu diễn lỗi trên mô hình 3D chưa làm; phần lớn yêu cầu còn thiếu
bằng chứng chạy trên điện thoại. Chưa yêu cầu MUST nào được nghiệm thu chính thức (trạng thái từng yêu cầu: [docs/spec/02_yeu-cau-chuc-nang.md](docs/spec/02_yeu-cau-chuc-nang.md)).
