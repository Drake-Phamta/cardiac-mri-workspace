# DAY 9 — Vũ Hùng Anh · 2026-09-18

**Khối lượng hôm nay:** phần chính **≥ 8 h** *(bảng dưới cộng ~8,5 h)* · hàng đợi dự phòng ~2,5 h · **hạn: 23:59**.

> **Hôm qua bạn làm đúng thứ quan trọng nhất và làm đúng giờ:** duyệt #34 lúc **11:07**, trước hạn 12:00, kèm một phát
> hiện chặn **sắc hơn cả lượt QA** (`scan_package`/`scan_archive` chỉ quét thư mục case trực tiếp, nên `A17 PASS` không
> phải audit toàn gói). Picking `B3`/`B4` xong, `geometry_contract_version` xong. #30 và #38 **đã merge** tối qua.
>
> **Chỗ critical path dừng lại là lượt duyệt lại.** Khánh sửa xong #34 lúc 11:40, nhưng tới lúc chốt ngày chưa ai duyệt
> lại, nên `GATE-DATA-01` sang **ngày thứ chín**. Đây là **ngày thứ hai liên tiếp** critical path dừng đúng ở một lượt
> review. Vì vậy điều kiện Day 9 ghi đích danh bước **duyệt lại**.

## 📌 Mới hôm nay — quyết định của leader chạm tới bạn

| Quyết định | Ảnh hưởng tới bạn |
|---|---|
| **#34 đóng băng ở head `f118491`** | Bạn duyệt lại đúng head này; Khánh **không đẩy thêm** cho tới khi merge. Hai việc nhỏ còn lại của cậu ấy đi PR riêng sau merge |
| **`GATE-MOB-01` đi hướng RN + WebGL2 trong WebView** | Viewer Spike B của bạn sẽ được đo **bên trong app React Native** (không phải Chrome) tối nay. Việc 4 bên dưới. Đây là **hướng đo**, chưa phải `TECH_STACK_ADR` |
| **Review #37, #42, #33 chuyển sang leader** | Bạn bớt ba lượt review để tập trung vào #34 và #43 |
| **SCR-04 (Error Inspector) giao cho V1** | V2 của bạn giữ nguyên SCR-05; bản đồ lỗi 3D vẫn là của bạn |

## 🟢 Có sẵn trước khi bạn mở máy — container WebView đã kiểm khói xong (01:16, PR nháp [#46](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/46))

Project Control dựng container trong app Spike A và đo thử ngay trong đêm, **trước hạn 16:00**. Bốn điều bạn cần biết:

| Điều | Đo được gì |
|---|---|
| **WebView của A17 có WebGL2 thật** | `webgl2: true`, `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, `UNMASKED_RENDERER_WEBGL` = **`Mali-G68`** (ARM), `MAX_TEXTURE_SIZE` 8192. **Không phải SwiftShader**, nên frame time trong WebView là số có nghĩa |
| **Viewer của bạn chạy nguyên trạng** | nạp xong sau **964 ms**; `level_0_cell1.obj`, 5.648 tam giác; xoay bằng `input swipe` và chạm chọn đều phản hồi (`pick: voxel 34, 24, 18 · slice 18`) |
| **Đường vào** | `http://127.0.0.1:8765/app/` qua `adb reverse tcp:8765 tcp:8765`. Đổi URL chỉ ở một chỗ: hằng `WEBVIEW_URL` trong `App.js` |
| **Cách gửi số ra** | **`window.ReactNativeWebView.postMessage(JSON.stringify(...))`** → logcat, tag cố định `SPIKE_B_WEBVIEW`. Nút *tải JSON* **không dùng được** trong WebView. `console.log/warn/error`, lỗi window và unhandled rejection cũng đã được chuyển tiếp sẵn |

Nghĩa là việc 4 của bạn **không còn rủi ro nền tảng**: chỉ còn viết protocol và probe. Màn WebView **thay thế hẳn** màn 2D
khi mở, nên cache ảnh và timer của Spike A không chạy dưới nền lúc đo 3D. Bằng chứng thô:
`spikes/spike_a_2d/EVIDENCE_RAW/s7_webview_env_20260918T011618+0700.*` (JSON + logcat + hai ảnh chụp).

> **📌 Mới 21:40 — hai việc chặn của bạn đã đi hết đường.** Approve #34 của bạn lúc 14:50 → leader merge → QA-003
> `PASS` → **`GATE-DATA-01` ĐÃ ĐÓNG**. **#43 đã approve và merge** (`f2e78bb`): 0/14 đòn lọt, ray lệch 1 bị từ chối, chạy
> khác ổ đĩa không còn sập — **lối ra geometry của M3 đã lên `main`**. Còn của bạn: **#41** và **#31** của leader đang
> chờ phản hồi của leader (không phải của bạn); **#44** đang chờ Trung duyệt.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **1** | **Duyệt lại #34 ở head `f118491`, trước 11:00.** Kiểm đúng những gì review 11:07 của bạn đòi: `package_findings` có mặt, `A17` liệt kê đủ ba đường dẫn (`CASE_0097/desktop.ini`, `Unet.py`, `preprocess_data.py`) kèm xử trí tường minh, manifest công khai không còn hash từng file. Chạy lại `validate.py --selftest`. **Hẹn 11:00 chứ không phải 12:00**, vì `GATE-SPLIT-01` phải sinh lại split sau khi #34 merge, và việc đó cần thời gian trong ngày | ~1,5 h | không | `APPROVE`, hoặc yêu cầu sửa có nội dung cụ thể |
| **2** | **Sửa #43** theo [review 11:47](https://github.com/Drake-Phamta/cardiac-mri-workspace/pull/43): ① bọc `os.path.relpath` ở dòng 282 bằng `try/except ValueError`, rơi về đường dẫn nguyên dạng (hiện checker **sập** khi fixture khác ổ đĩa) · ② thêm `slice_of_ray(origin, direction)` vào giao diện implementation và cho `check_fixture` **tính lại** `expected_slice_index` của từng ray, đúng khuôn đã làm với `points` · ③ **xác nhận chuỗi `dr008a-dr012/v1.0.0` với Trung trên #45**: theo `DR-013` chuỗi gốc thuộc khối của bạn | ~2 h | không | CI xanh; đòn "ray lệch đúng 1" trong `management/day08/review043/` bị **từ chối** |
| **3** | **Duyệt lại #26.** Trung đã sửa nhãn `NFR-PERF-001` lúc 22:19 (`097fdee`): hai câu sai cũ đã được thay. Soát **cách tổng hợp**, không soát giùm kết luận | ~30 ph | không | `APPROVE` / yêu cầu sửa |

## Việc Day 9

| # | Việc | Giờ | Chờ ai / cần quyền gì | Xong khi |
|---|---|---|---|---|
| **4** | **Đóng gói viewer Spike B để chạy trong WebView của app RN**, phục vụ hướng `GATE-MOB-01` leader vừa chọn. Cần: một **URL vào cố định** (tham số mesh, mức decimate); probe `performance.js` **gửi kết quả qua `window.ReactNativeWebView.postMessage`**, có dự phòng gửi HTTP về máy trạm; **viết lại `MEASUREMENT_B10_B11.md`** cho lượt chạy **trong app** (không phải Chrome). Viết protocol **giả định bạn không ở cạnh máy**: người khác đọc file là chạy được, mọi số do script bắt. Khuôn dùng lại được: `spikes/spike_a_2d/harness/measure_a9.py` và `capture_conditions.py`. **Hẹn 18:00** để leader đo lúc ~20:00 | ~2,5 h | **không cần máy**: leader là operator duy nhất (`DR-006a`). Container WebView **đã xong lúc 01:16**, PR nháp #46 — xem mục 🟢 ở trên | Viewer + protocol trên PR; leader chạy được mà không cần hỏi lại |
| **5** | **Diễn giải `B10`/`B11`** sau phiên đo tối của leader. Cập nhật `RESULT.md` Spike B: số, điều kiện, nhãn `OBSERVED` / `NOT MEASURED`. **Số là của bạn**, không ai tính hộ | ~1 h | leader đo (~20:00). Nếu trễ, làm việc 6 trước | Mục `B10`/`B11` trong `RESULT.md` kèm JSON thô |
| **6** | **Gói `TC-TEAM-001` V2** theo `10` §10 (6 hạng mục) cho **SCR-05** (UC-06…09): yêu cầu/UC → artifact thiết kế UI → kiến trúc/API/dữ liệu → PR và commit → bằng chứng test → ghi chú demo và bảo vệ. Nguyên liệu có sẵn: #30, #38, #43, `B14`. Đây là **một trong sáu test sàn nghiệm thu cuối** (`13` §13) | ~1 h | không | File `management/evidence/TC_TEAM_001_VU_HUNG_ANH.md`, PR |

**Tổng phần chính: ~8,5 h.**

> **🎯 Chuẩn demo** — [`DEMO_STANDARD.md`](../../DEMO_STANDARD.md): **H6–H7 / SCR-05**: xoay, zoom, pan mượt **trên chính
> máy demo**; chạm vùng lỗi thì nhảy đúng lát cắt 2D. `TC-PERF-002` (≥ 20 FPS median) phải là **số đo trong app**, không
> phải số trên Chrome desktop. Đó là lý do việc 4 tồn tại.

## Hàng đợi dự phòng

| Việc | Giờ | Xong khi |
|---|---|---|
| **Duyệt #41** (Spike A `S6`: `A9` ở `576×576×88`) + **duyệt lại #31** (tiêu đề đã sửa). Cả hai nằm trên đường `GATE-MOB-01`, vì Spike A chỉ `ACCEPTED` khi reviewer duyệt | ~1,5 h | review có nội dung trên cả hai |
| **Fixture TP/FP/FN error-mask tổng hợp** ở `tests/fixtures/error_masks/`. `13` §11 đòi bộ này độc lập với Spike F, và `SPIKE_PHASE_STATE` cho phép làm ngay | ~1 h | fixture + checksum + README |

---

**Ranh giới không đổi:** không viết `TECH_STACK_ADR.md` (`GATE-MOB-01` còn mở; WebView là **cách đo**, không phải quyết
định) · không tự vận hành điện thoại · không tính số `E` thay Trung · `tests/fixtures/geometry/**` là của bạn, không ai
khác được ghi · không tự chuyển `ACCEPTED`. **Liên quan:** PR #26 · #34 · #41 · #43 · #44 · #45 ·
[`../../day08/DAY08_EOD_REVIEW.md`](../../day08/DAY08_EOD_REVIEW.md)
