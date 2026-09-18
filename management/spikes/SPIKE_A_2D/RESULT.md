# SPIKE_A — RESULT

> **`RESULT.md` ≠ `ACCEPTED`.** File này là bản ghi công việc của chủ sở hữu. Nghiệm thu cần đủ bốn bước:
> owner → `EVIDENCE_READY` → reviewer `APPROVE` → CHAT E QA `PASS` → CHAT A chuyển trạng thái → `ACCEPTED`.
> Hiện tại spike đang ở **`ACTIVE`**, chưa yêu cầu review.

| Mục | Giá trị |
|---|---|
| **Spike** | `SPIKE_A` — 2D scientific viewer / brush interaction |
| **Chủ sở hữu** | Phạm Tuấn Anh |
| **Reviewer** | Vũ Hùng Anh *(hàng đợi vị trí 2, sau Spike D — D là P0)* |
| **Ngày** | 2026-09-11 (Day 2) · bắt đầu 12:00 theo cutover record |
| **Ứng viên đang đánh giá** | **React Native / Expo** — ứng viên **thứ nhất trong nhiều ứng viên** |
| **Thiết bị** | SM-A176B, Android 16 — [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) |
| **Harness** | [`spikes/spike_a_2d/`](../../../spikes/spike_a_2d/) |

> ⚠ **Đây KHÔNG phải cơ sở để chọn framework.** `GATE-MOB-01` cần bằng chứng **cả Spike A và Spike B**,
> và mới có **một** ứng viên được dựng. Không có dòng nào dưới đây được đọc thành "RN thắng".

---

## Bảng tiêu chí A1–A12

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| **A1** | Slice render đúng, hiện `n / total` | **PASS một phần** | `n / total` hiển thị đúng, 16 slice điều hướng được, 30/30 lần load thành công. **Phần "exact match to fixture" CHƯA kiểm theo pixel** — xem ghi chú A1 |
| **A2** | **Zoom/pan không đổi geometry mask nguồn** | **ĐÃ ĐO — `OBSERVED`** (14/09, release) | checksum mask nguồn **16/16 khớp fixture** ở cả 3 lần kiểm: trước thao tác, sau **3 pinch + 1 kéo** thật, sau **13 bước zoom/pan tự động**. 0 lần khựng > 500 ms. Xem §Kết quả A2 |
| A3 | Brush ADD chỉ sửa pixel đúng ý | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| A4 | Brush ERASE chỉ sửa pixel đúng ý | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| **A5** | **Brush mapping đúng pixel sau zoom/pan** | `NOT MEASURED` | **60 ca kiểm đã sẵn** trong `fixtures/brush_cases.json`, chưa chạy được vì chưa có brush |
| A6 | Undo tái lập trạng thái trước | `NOT MEASURED` | chặng S5 |
| A7 | Redo tái lập trạng thái đã undo | `NOT MEASURED` | chặng S5 |
| A8 | Save/reload tái lập đúng nét sửa | `NOT MEASURED` | chặng S5 |
| **A9** | **Slice-switch đã cache, 30 bước, p95 ≤ 200 ms** | **ĐÃ ĐO NĂM LẦN — đạt ngưỡng ở cả năm** | `64×64×16`: **65,31 ms** · `576×576×16`: **50,23 ms** · **`576×576×88` (kích thước cohort thật, 17/09):** cache toàn bộ **98,72 ms**, cửa sổ ±3 **50,84 ms** trong cửa sổ / **102,73 ms** khi miss. Xem §Kết quả A9 và §Chặng S6 |
| A10 | Phản hồi brush ≤ 100 ms, 0 nét mất | `NOT MEASURED` | chưa dựng brush — chặng S5 |
| A11 | Tách gesture sửa vs điều hướng | `NOT MEASURED` | chặng S7 |
| A12 | Chi phí phát triển mỗi ứng viên | **một phần** | Xem §A12 |

**4 tiêu chí có dữ liệu · 8 tiêu chí `NOT MEASURED`.** Không ô nào bỏ trống và không ô nào được đoán.
*(`A2` thêm ngày 14/09; bằng chứng nằm trên nhánh `spike-a/s4-zoom-pan`, PR #27, chưa review.)*

---

## Kết quả A9 — slice-switch đã cache

**Đã đo HAI LẦN, ở hai kích thước slice.** Lần thứ hai là lần có ý nghĩa.

| Lần | Fixture | Ngày | p50 | **p95** | max | Ngưỡng 200 ms |
|---|---|---|---:|---:|---:|---|
| 1 | `64×64×16` | 2026-09-11 14:09 | 34,21 | **65,31** | 65,41 | đạt |
| **2** | **`576×576×16`** — kích thước slice **THẬT** | 2026-09-12 00:52 | 35,68 | **50,23** | 50,45 | **đạt** |

Dữ liệu thô: [`EVIDENCE_RAW/`](../../../spikes/spike_a_2d/EVIDENCE_RAW/) · 30 mẫu mỗi lần, chuỗi 30
bước cố định, percentile **nearest-rank**, **không loại outlier**.

### Vì sao lần 2 quan trọng

`RESULT.md` bản đầu ghi giới hạn phạm vi số 1: *"Kích thước slice LGE MRI thật CHƯA BIẾT… `A9` phải
đo lại khi `A6` của Spike D có kết quả."* Gói dataset mở đêm 2026-09-11 cho thấy **`576×576×88`**
(có case `640×640`). Fixture cũ nhỏ hơn **81 lần** về số pixel.

Đã đo lại. **Chỉ MỘT biến thay đổi:** `Nz` giữ nguyên 16 để chuỗi 30 bước giống hệt.

### ⚠ Kết quả ngược trực giác — và cách đọc nó cho đúng

**Ở 81 lần số pixel, p95 KHÔNG tăng. Nó giảm, 65,31 → 50,23 ms.**

Lời giải thích khả dĩ, và nó là điều quan trọng nhất trong mục này: **`A9` đo việc chuyển giữa các
slice ĐÃ CACHE.** Toàn bộ 16 slice được decode một lần ở bước prewarm trước khi bài đo bắt đầu. Chi
phí mỗi bước chuyển là **bridge JS + compositing của React Native**, cộng việc GPU thu nhỏ một bitmap
đã decode sẵn — **không phải chi phí theo số pixel**.

Nếu đúng thì đây là dữ kiện có giá trị cho `GATE-MOB-01`: với kiến trúc nạp sẵn, `NFR-PERF-001`
**không nhạy với kích thước slice**.

> **Nhưng đây KHÔNG phải một thí nghiệm có kiểm soát, và tôi không trình bày nó như vậy.**
> Ba điều kiện khác nhau giữa hai lần chạy:
>
> | | Lần 1 | Lần 2 |
> |---|---|---|
> | Brightness | 128 | **255** |
> | Pin | 80%, `NOT_CHARGING` | **19%, đang sạc** |
> | Nhiệt độ pin | 35,0 °C | **36,6 °C** |
>
> Chiều của chênh lệch (thấp hơn ở 81 lần pixel) không được giải thích bởi bất kỳ điều nào ở trên,
> nhưng **độ lớn của chúng so được với độ lớn của chênh lệch**. Nên đây là **một quan sát**, không
> phải một kết luận. Muốn kết luận thì chạy lại cả hai kích thước trong cùng một điều kiện.

### 🔴 Phát hiện quan trọng hơn cả con số p95 — bộ nhớ

| Thời điểm | Graphics | TOTAL PSS |
|---|---:|---:|
| Trước bài đo | 268 KB | 79,6 MB |
| **Sau bài đo** | **69 994 KB ≈ 68 MB** | **186 MB** |

**≈ 4,3 MB graphics mỗi slice** (volume + mask overlay, đã decode sang bitmap).

**Ngoại suy tới độ sâu THẬT của cohort — 88 slice, ghi ngày 12/09:**

```text
4,3 MB/slice × 88 slice  ≈  376 MB graphics memory
```

> ### ❌ Con số 376 MB này SAI. Đã thay bằng số đo thật ngày 17/09 — xem §Chặng S6.
>
> Thực đo ở `576×576×88`: **135,90 MB bitmap** cho cả volume, tức **1,54 MB/slice**, không phải
> 4,3 MB/slice. Ngoại suy lệch **2,8 lần**. Đoạn trên giữ nguyên để thấy bản ghi đã nói gì và sai
> ở đâu, không xoá dấu vết.
>
> Hai nguyên nhân của sai số, cả hai đều là **lỗi phương pháp chứ không phải lỗi thiết bị**:
> ① lần đo 12/09 lấy `Graphics` thô, mà `Graphics` **còn tính cả surface cửa sổ** của màn hình
> 1080×2340 — ngày 17/09 đo được nền đó là **23,03 MB** khi app chưa nạp slice nào, và phải trừ đi;
> ② nhân một chi phí đo ở 16 slice lên 88 slice giả định chi phí mỗi slice không đổi, mà nó có đổi.
>
> Điều phần trên nói **đúng** và vẫn đứng: *một viewer thật không thể prewarm cả volume*. Chỉ là lý
> do đúng hơn không phải "376 MB quá lớn" — xem §Chặng S6 để biết lý do thật.

### Định nghĩa đang đo là gì

- `ms_to_frame` = từ lúc state đổi đến **frame đầu tiên vẽ xong sau khi ảnh decode**. Spec nói
  *"update the **visible** slice"* nên đây là con số trung thực.
- `ms_to_load` = tới lúc decode xong. Giữ lại để thấy tách bạch decode và paint.
- Percentile **nearest-rank**, không nội suy, **không loại outlier**.

### Điều kiện lần đo thứ hai

Build **RELEASE** — cài lúc 00:37:03, `flags=0x0`, APK 82 888 384 byte (so với 68 815 824 byte của
bản 64×64; chênh lệch đúng bằng fixture). Thermal status **0 trước và sau**. Pin 19→20%, **đang
sạc**. Brightness **manual 255**. `low_power = 0`. Governor `energy_aware`. Refresh **60 Hz** suốt
bài. Màn hình ghim sáng bằng `svc power stayon usb` để không khoá giữa chừng.

**Ai vận hành:** Project Control bấm nút qua `adb input tap`, **theo chỉ đạo của leader**, trên máy do
chính anh cắm và mở khoá. Chủ sở hữu Spike A là Phạm Tuấn Anh; theo **DR-006a** operator và owner
được ghi tách bạch. **Không con số nào do Project Control sinh ra** — tất cả đến từ thiết bị.

### Ba giới hạn phạm vi còn lại

1. **Nửa sau của `A9` — *"không full-volume transfer mỗi gesture"* — vẫn `NOT MEASURED`.** Fixture
   nằm local, chưa có đường mạng nào. Nửa đó thuộc Spike E.
2. **Mỗi kích thước chạy một lần.** Chuỗi 30 bước đúng yêu cầu tiêu chí, nhưng một lần chạy không mô
   tả được biến động giữa các lần.
3. **`Nz = 16`, độ sâu thật là 88.** Giữ cố định có chủ ý để cô lập biến kích thước slice — nhưng nó
   chính là lý do con số bộ nhớ ở trên phải **ngoại suy** thay vì đo trực tiếp.

---

## Chặng S6 — cache có giới hạn, đo ở kích thước cohort thật *(17/09, 10:22–10:41)*

`576×576×88` — **lần đầu `A9` được đo ở cả kích thước trong mặt phẳng lẫn độ sâu thật.** Ba lượt đo trên
**hai bản build release**: lượt 1 và lượt 2 chạy trên cùng một build; lượt 3 chạy sau khi app được sửa để khởi
động **không chọn chính sách** (`POLICY_NONE`) và **build lại**, để có một lần khởi đầu nguội thật.

> **⚠ Đính chính 18/09, theo review của Vũ Hùng Anh trên #41.** Bản trước ghi *"một build release, chỉ một biến
> đổi giữa các lượt: chính sách cache"*. **Sai.** Giữa lượt 1 và lượt 3 có **hai** biến: chính sách cache **và** bản
> build cùng trạng thái khởi động. Vì vậy mọi so sánh trực tiếp giữa hai chính sách dưới đây là **quan sát trên hai
> build khác nhau**, không phải hiệu quả đã được cô lập của chính sách cache. Commit của từng build **không được ghi
> lại** lúc đo; đó là một khoảng trống của bản ghi này. Từng số `A9` riêng lẻ vẫn đúng — reviewer đã tính lại độc lập
> cả ba p95 (98,72 · 51,05 · 50,84 ms).

Mọi trường trong bản ghi đều
do máy sinh: `build_type` suy từ `__DEV__` **do chính app báo**, bộ nhớ và điều kiện do
`harness/capture_conditions.py` đọc thẳng từ máy, chính sách và `nx/ny/nz` đọc từ dòng
`SPIKE_A_TIMING_RUN_START` của app. **Không trường nào gõ tay.**

| Lượt | Chính sách | Cache lúc bắt đầu | p95 mọi bước | p50 | **p95 trong cửa sổ** | p95 khi **miss** | graphics sau | TOTAL PSS sau |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | `toàn bộ` (88) | nguội *(app vừa khởi động)* | **98,72 ms** | 50,45 | 98,72 *(30/30)* | — | 158,93 MB | 507,32 MB |
| 2 | `cửa sổ ±3` | ⚠ **ấm** — lượt 1 đã nạp cả 88 | 115,21 ms | 34,79 | 51,05 *(22/30)* | 115,26 *(8/30)* | 101,34 MB | 408,39 MB |
| 3 | `cửa sổ ±3` | **nguội thật** | 100,74 ms | 49,40 | **50,84** *(22/30)* | **102,73** *(8/30)* | 107,72 MB | 411,19 MB |

Nền so sánh: app vừa mở, **chưa chọn chính sách, chưa nạp slice nào** — `Graphics` **23,03 MB**,
`TOTAL PSS` **239,82 MB**. Đó là surface cửa sổ + UI, phải trừ khỏi mọi con số `Graphics`.

### `A9` đạt ở kích thước thật, cả hai chính sách

98,72 ms và 50,84 ms so với trần **200 ms**. Trước hôm nay `A9` mới chỉ đo ở **16** slice, nên câu hỏi
"có đạt khi stack sâu thật không" chưa ai trả lời được.

**Độ lặp lại tốt:** p95 trong cửa sổ của lượt 2 và lượt 3 — hai lần chạy độc lập, khởi đầu khác hẳn nhau,
và **trên hai build khác nhau** — lệch **0,21 ms** (51,05 và 50,84).

### Chi phí bitmap thật, và vì sao 376 MB sai

| | `Graphics` sau | trừ nền 23,03 | số slice thực nạp | **MB/slice** |
|---|---:|---:|---:|---:|
| cửa sổ ±3, vừa nạp xong *(z=0 → 4 slice)* | 30,42 MB | **7,39 MB** | 4 | **1,85** |
| toàn bộ volume | 158,93 MB | **135,90 MB** | 88 | **1,54** |

Hai phép đo **độc lập** đồng ý nhau quanh **1,5–1,9 MB/slice**, và khớp mức lý thuyết của một bitmap
`576×576` ARGB_8888 (**1,27 MB**) cộng phần phụ. Con số **4,3 MB/slice** của bản ghi 12/09 cao gấp hơn ba
lần mức lý thuyết — dấu hiệu rõ là nó đã tính cả surface cửa sổ vào.

### 🔴 Phát hiện chính, và nó ngược với điều tôi kết luận vội sau lượt 2

> **Cửa sổ ±3 KHÔNG chặn được bộ nhớ.**

Lượt 3 nói điều đó không thể chối: bắt đầu **nguội**, cửa sổ chỉ giữ **4 slice** (7,39 MB bitmap). Sau
bài 30 bước, bitmap lên **84,69 MB** — tương đương **~46 slice**, trong khi cửa sổ **chưa bao giờ giữ quá
7**. Fresco giữ lại **mọi** bitmap nó từng decode, bất kể React đã unmount component hay chưa.

> **⚠ Đính chính trong ngày.** Sau lượt 2 tôi ghi *"cửa sổ ±3 nhả thật, chỉ nhả muộn"*, vì graphics tụt
> 158,93 → 101,34 MB trong lúc chạy. **Sai.** Đó không phải chính sách cửa sổ nhả — đó là Fresco **tự
> hạ** từ mức 158,93 MB mà lượt prewarm-toàn-bộ đã tích lại. Bằng chứng: lượt 3 đi **ngược chiều**, từ
> 29,71 MB **lên** 107,72 MB. Hai lượt cửa sổ hội tụ về **101–108 MB dù xuất phát trái ngược nhau** —
> đó là điểm cân bằng của cache Fresco, không phải tác dụng của chính sách.

**Cửa sổ ±3 mua được gì** — *quan sát giữa lượt 1 và lượt 3, tức giữa hai build; không phải hiệu quả đã cô lập
của chính sách (xem đính chính ở đầu chặng S6):*

| | toàn bộ | cửa sổ ±3 | chênh |
|---|---:|---:|---:|
| bitmap | 135,90 MB | 84,69 MB | **−38%** |
| TOTAL PSS | 507,32 MB | 411,19 MB | **−19%** |
| p50 | 50,45 ms | 49,40 ms | ≈ 0 |

**Và không mua được gì:** một cận trên cho bộ nhớ. Bộ nhớ vẫn tăng theo **số slice khác nhau đã đi qua**.
Người dùng lướt đủ lâu thì nó vẫn tiến về mức của cache toàn bộ.

### Chi phí cache miss là thật nhưng nhỏ — và cảnh báo của tôi hoá ra không đổi con số

Lượt 2 chạy trên cache Fresco đang ấm, nên 8 "miss" của nó có thể được phục vụ lại chứ không decode lại;
tôi đã ghi rõ **115,26 ms là cận dưới, không phải chi phí thật**, và dựng lại app để đo cho sạch.

Kết quả: miss **thật sự nguội** là **102,73 ms** — **thấp hơn** con số bị nghi là lạc quan. Nêu cảnh báo
là đúng phương pháp; câu trả lời là nó **không đổi kết luận nào**. Và cả hai đều **dưới trần 200 ms**,
dù `NFR-PERF-001` vốn không quản bước miss.

### Hệ quả cho V1 và cho `GATE-MOB-01`

1. **Cửa sổ ở tầng component là cần nhưng CHƯA ĐỦ.** Muốn chặn bộ nhớ thì phải chặn **chính cache ảnh**
   — cấu hình bitmap cache của Fresco, hoặc một thư viện ảnh có chính sách cache tường minh
   *(ví dụ `expo-image` với `cachePolicy` và `recyclingKey`)*. Đây là dữ kiện trực tiếp cho
   `GATE-MOB-01`, và **không** phải lý do nới `NFR-PERF-001`.
2. **Prewarm toàn bộ volume ở kích thước thật tốn 507 MB `TOTAL PSS`** — sống được vì bitmap nằm ngoài
   heap Java, nhưng gấp đôi trần `heapgrowthlimit = 256 MB` của máy.
3. ⛔ **Không kết luận nào ở đây nâng `PR-CACHE-01` từ `SHOULD` lên `MUST`.** Đây là số đo của một spike,
   không phải một yêu cầu mới.

### Giới hạn phạm vi của chặng S6

- Payload là fixture **tổng hợp** đúng hình dạng, không phải ảnh MRI thật — kích thước và số slice thật,
  nội dung thì không. Ảnh thật nén khác, nhưng **bitmap sau decode thì cùng kích thước**, nên con số bộ
  nhớ không phụ thuộc nội dung; con số thời gian **decode** thì có thể.
- Một máy, một phiên, một lượt mỗi chính sách. Pin **80% `NOT_CHARGING`** cả ba lượt *(máy tự ngắt sạc
  để bảo vệ pin)*, nhiệt `NONE`, 32,2–32,9 °C. Chưa có khoảng tin cậy.
- Fixture nạp bằng `import` tĩnh nên **78 MB JSON nằm trong bundle** — riêng nó đã tốn ~91 MB native
  heap lúc app mở, trước khi decode slice nào. Ứng dụng thật sẽ tải qua mạng, nên phần này **không** áp
  thẳng sang V1; nó là chi phí của giàn đo.
- `mask` chỉ decode cho slice đang xem, không prewarm. Một viewer bật overlay liên tục sẽ tốn hơn.

### Tái lập

```bash
cd spikes/spike_a_2d
python fixtures/generate.py --nx 576 --ny 576 --nz 88   # 78 MB, .gitignore không theo dõi
python harness/check_conformance.py                      # F1–F4
cd app && npx expo run:android --variant release
cd .. && python harness/measure_a9.py --policy all
      && python harness/measure_a9.py --policy window
```

Bằng chứng: `EVIDENCE_RAW/a9_slice_switch_20260917T*_{all,window}.json` và ba thư mục
`EVIDENCE_RAW/a9_conditions_*` kèm **bản `dumpsys meminfo` nguyên văn**, để ai muốn thì tự phân tích lại
thay vì tin bộ phân tích của tôi.

---

## Kết quả A2 — zoom/pan không đổi mask nguồn *(chặng S4, 2026-09-14 21:24–21:25)*

**Tiêu chí (`TASK.md` A2):** *"Pinch-zoom and pan work, and provably do not alter source-mask geometry —
checksum of source mask unchanged."*

**Cách đo.** Zoom/pan chỉ đổi transform hiển thị `{zoom, panX, panY}`; mask nguồn được giải mã một lần và
không đoạn code transform nào nhận nó. Nút "kiểm A2" băm SHA-256 cả 16 slice mask nguồn **trên máy**;
`harness/extract_a2.py` **tự tính lại** hash kỳ vọng từ fixture bằng `hashlib` và so từng slice — không tin
con số "khớp" app tự báo.

| Lần kiểm | Thời điểm | Thao tác trước đó | Checksum khớp fixture (tính lại độc lập) |
|---|---|---|---|
| 0 | 21:24:32 | **không có** — trước mọi thao tác | **16/16** |
| 1 | 21:25:00 | **4 thao tác tay thật**: 1 kéo · 3 pinch (zoom ×1,00 → ×0,56 → ×0,96 → ×0,65) · kèm 4 lần chạm | **16/16** |
| 2 | 21:25:04 | **13 bước zoom/pan tự động** qua nhiều slice, kết thúc ở fit | **16/16** |

**Kết luận từ log thô: `OBSERVED`** — checksum mask nguồn không đổi qua zoom/pan thật và tự động.

| Đo kèm | Kết quả |
|---|---|
| Ánh xạ chạm → pixel của app, trên máy | **60/60** ca `brush_cases.json` *(tiền đề cho `A5`, **chưa phải** `A5` — chưa có brush)* |
| 4 lần chạm, kiểm tay một ca | chạm `(223,3; 279,1)`, zoom 3,128, pan `(75,5; 104,8)` → `floor((223,3−75,5)/3,128) = 47`, `floor((279,1−104,8)/3,128) = 55` → app báo **`[47, 55]`** ✓ |
| Khoảng hở frame lớn nhất mỗi thao tác | 18,7 · 44,9 · 20,0 · 18,8 ms — **0 lần khựng > 500 ms** *(nhịp `requestAnimationFrame` phía JS, không phải trace compositor; 1 frame ở 60 Hz = 16,7 ms)* |
| Nhận xét cảm quan của người bấm (`TASK.md`) | **không thấy khựng** khi pinch hay kéo — nguyên văn: *"tôi không thấy khựng"* |

**Điều kiện:** bản **release** từ `1b362e8`, SM-A176B Android 16, màn hình chạy 60 Hz, cắm USB đang sạc
(pin 45 → 48 %), nhiệt độ pin 33,0 → 34,5 °C, thermal status 0. Người bấm: **Phạm Tuấn Anh**, chủ Spike A,
trên máy của chính mình.

**Bằng chứng:** `spikes/spike_a_2d/EVIDENCE_RAW/a2_zoom_pan_20260914T212552+0700.json` và
`…_logcat.txt` (14 dòng logcat mang tag `SPIKE_A_`, nguyên byte).

**Giới hạn, ghi rõ:** fixture 64×64 — mask nguồn là dữ liệu tổng hợp của Spike A, chưa phải cohort thật; một
lượt đo; mới 1 lần kéo trong 4 thao tác tay (3 pinch).
`A2` là **đã đo**, chưa **nghiệm thu** — cần reviewer `APPROVE` → QA `PASS` → `ACCEPTED`.

---

## Ghi chú A1

`n / total` hiển thị đúng và 16 slice điều hướng được — phần đó đạt. Nhưng tiêu chí còn vế **"exact match
to fixture"**, và vế đó **chưa kiểm theo pixel**.

Lý do không chỉ là chưa làm: **React Native `Image` nội suy bilinear và không expose tuỳ chọn
nearest-neighbour.** Fixture 64×64 phóng lên ~1000 px hiện ra mượt chứ không thấy ô pixel vuông. Một phép
so pixel ngây thơ giữa ảnh hiển thị và fixture sẽ **trượt**, nhưng trượt vì bộ lọc hiển thị chứ không phải
vì dữ liệu sai. Cần một cách kiểm khác — so ở tầng dữ liệu, không ở tầng ảnh đã render.

Marker định hướng trong **fixture** đã được `check_conformance.py` F3 xác minh đủ 16/16 slice. Việc **app
render đúng hướng** thì mới chỉ xác nhận bằng mắt, chưa bằng test.

---

## A12 — chi phí phát triển, ứng viên React Native / Expo

| Mục | Ghi nhận |
|---|---|
| **Phiên bản** | Expo SDK `57.0.21` · React Native `0.86.3` · React `19.2.3` · Node `24.14.0` · JDK 17 |
| Scaffold tới app trắng | nhanh — `create-expo-app` + `npm install`, **~2 phút**, 464 gói |
| **Build release đầu tiên** | **6 phút 44 giây** *(sau khi cache Gradle đã ấm)*. Lần đầu **thất bại vì timeout mạng** khi tải `react-android-0.86.3-release.aar` 161 MB và `hermes-android` 78 MB; tổng cache Gradle 653 MB |
| Kích thước APK release | **68,8 MB** cho một viewer hiển thị ảnh 64×64 |
| Viewer + instrumentation | thẳng thắn mà nói là **dễ** — JSX, state, `Image`, đo thời gian bằng `performance.now()` |
| **Điểm trừ đã gặp** | **Không có nearest-neighbour** trên `Image`. Với viewer khoa học đây là vấn đề thật: biên mask hiển thị mượt hơn biên dữ liệu, người review sẽ thấy một đường biên không tồn tại |
| **Xử lý gesture** *(14/09, chặng S4)* | `PanResponder` **có sẵn trong React Native đủ cho pinch + kéo + chạm** — không cần thêm thư viện gesture nào, nên không phải build lại phần native. Khoảng **120 dòng** trong `App.js`, toán transform tách ra `viewerMath.js` để test được bằng Node. Build release tăng dần **38 giây**. Điểm cần làm tay: phải tự tính toạ độ ngón tay theo trang (`pageX − gốc viewport`), vì `locationX` đổi theo phần tử con dưới ngón tay |
| Chưa đánh giá | brush latency, tách gesture sửa/điều hướng (`A11`), bộ nhớ ở kích thước slice thật |

**Chưa so sánh được với ứng viên nào khác** — mới dựng một ứng viên. Native Kotlin và Flutter chưa chạm
tới; Flutter còn chưa cài trên máy.

---

## Điều kiện thất bại — chưa cái nào kích hoạt

| Điều kiện | Trạng thái |
|---|---|
| `A5` sai mapping sau transform → ứng viên **không dùng được** | chưa đo |
| `A9` hoặc `A10` trượt trên thiết bị đã khai báo → không dùng được | **`A9` đạt** ở kích thước fixture · `A10` chưa đo |
| Mất nét committed → không dùng được (`NFR-PERF-003` cấm) | chưa đo |
| Không ứng viên nào đạt → `NEGATIVE_RESULT`, leo thang | chưa tới bước đó |

---

## Việc tiếp theo

1. ~~**Zoom/pan** → `A2`~~ ✅ 14/09 · tiếp: **brush** → `A3` `A4` `A6` `A7` `A8` `A10`
2. **Chạy 60 ca `brush_cases.json`** → `A5`, xuất **phân bố sai số** và **đề xuất dung sai** — spec đóng
   băng không đặt dung sai cho brush mapping, spike này phải đề xuất
3. **Đo lại `A9` ở kích thước slice thật** khi Spike D `A6` có kết quả
4. Dựng ứng viên thứ hai để `A12` so sánh được
5. Nhả Galaxy A17 cho Nguyễn Gia Đức Trung — profile DR-006 và baseline `A9` đã xong, phần còn lại là
   việc desktop

**Liên quan:** [`TASK.md`](TASK.md) · [`DR006_DEVICE_PROFILE.md`](DR006_DEVICE_PROFILE.md) ·
[`EVIDENCE_TEMPLATE.md`](EVIDENCE_TEMPLATE.md) · [`../../../spikes/spike_a_2d/`](../../../spikes/spike_a_2d/)
