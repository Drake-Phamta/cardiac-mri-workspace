# QA-REVIEW-001 — soi đối kháng bốn gói dụng cụ dựng trong đêm

| | |
|---|---|
| **Ngày** | 2026-09-12, 01:00–01:30 +07:00 |
| **Đối tượng** | Dụng cụ Spike D, B, E, C0 dựng đêm 2026-09-11 (PR #14 #15 #16 #17) |
| **Người soi** | Một luồng độc lập, được giao nhiệm vụ **tìm lỗi chứ không khen** |
| **Tác giả bị soi** | Project Control — cùng một tác giả cho cả bốn gói, dựng trong một đêm |
| **Phương pháp** | **Chạy thật** trên input hỏng cố ý. Không review bằng đọc |

> **Vì sao có bản ghi này.** Bốn gói dụng cụ do **một người viết trong một đêm**, và chúng tồn tại để
> sinh ra **số đo đáng tin**. Một harness âm thầm cho số sai là lỗi tệ nhất có thể có ở đây — tệ hơn
> không có harness, vì nó tạo ra thứ trông như bằng chứng. Nên chúng được giao cho một luồng khác với
> đúng một nhiệm vụ: **phá**.
>
> Kết quả: **49 lỗi**. Bản ghi này giữ chúng lại, kể cả những lỗi làm tôi mất mặt, vì
> `DAY0_SIGNOFF.md` đã đặt luật — *"Sự kiện lịch sử giữ nguyên… Không bịa ngược."*

---

## 1 · Kết quả tổng

| Gói | Lỗi tìm được | CRITICAL | Trạng thái |
|---|---:|---:|---|
| **Spike D** — `tools/dataset_validate/` | 10 | 1 | ✅ đã sửa, kiểm lại bằng trigger gốc |
| **Spike B** — `spikes/spike_b_3d/` | 14 | 3 | ✅ đã sửa |
| **Spike E** — `spikes/spike_e_transport/` | 10 | 2 | ✅ đã sửa |
| **Spike C0** — `spikes/spike_c_ml/` | 15 | 2 | ✅ đã sửa |

**Không gói nào sạch.** Mọi lỗi CRITICAL đều thuộc cùng một loại: **sinh ra con số sai mà trông đúng.**

---

## 2 · Lỗi tệ nhất — và nó là lỗi tôi đã chủ động lan truyền

### `B14` — "phát hiện" tôi báo cho Vũ Hùng Anh là đồ giả

Tôi đã viết trong `FORMAT.md`, trong README, trong mô tả PR #15, và trong **gói nhiệm vụ Day 3 của
cậu ấy** rằng nhóm `interior` sai gấp ~7 lần nhóm `surface_tangent`, và gọi đó là phát hiện ngược
kỳ vọng của spec.

Người review đo lại từng tia:

| nhóm | \|d_z\| TB | slice lệch / mm dọc tia | góc tới so với **pháp tuyến** |
|---|---:|---:|---|
| `interior` | 0,984 | **0,787** | 0–15° |
| `surface_tangent` | 0,049 | **0,0395** | **11–17°** |

**Mọi tia tôi gắn nhãn `surface_tangent` đều đâm gần vuông góc với bề mặt** — ngược hẳn cái tên — và
**kém nhạy 20 lần** theo trục z. Với tỉ lệ đó, nhóm `interior` **buộc phải** ra số lớn hơn. Con số 7×
là **số học**, không phải hình học. `B14` khi đó **chưa được đo**.

### Và kiểm tra "tính đúng đắn" của chính harness là một tautology

Ground truth cũ là *ray-cast vào mesh mức 0*, rồi mức 0 được so **với chính nó**. Sai số 0 là một
đồng nhất thức. Người review **dịch mesh đi 5 slice** và nó **vẫn báo 0**. Dòng trong README nói
*"nếu nó khác 0 thì harness sai"* mô tả một thứ **không thể** khác 0.

**Cả hai đã sửa.** Ground truth giờ là **DDA ray-march trên mask voxel**, không chạm mesh nào; nhóm
tính **tại điểm chạm** theo góc tia–pháp tuyến. Mức 0 giờ báo sai số **khác 0** (mean 0,016) — đó là
chi phí thật của phương pháp trích bề mặt, đo được **chỉ vì** ground truth không còn là chính nó.
Và chênh lệch 7× **biến mất**: hai nhóm giờ gần như ngang nhau.

**Lời rút lại đã được đăng công khai** trong packet của Hùng Anh, `FORMAT.md`, README và PR #15.

---

## 3 · Bốn lỗi CRITICAL còn lại

| # | Gói | Lỗi | Bằng chứng người review đưa ra |
|---|---|---|---|
| 1 | **D** | `A9` **trả `PASS` vô điều kiện** — hàm tính danh sách case khớp, in ra, rồi return PASS bất kể | mask origin `[99,55,7]` vs MRI `[0,0,0]` → in *"0 of 1 share the MRI origin exactly"* kèm dấu **ok**, exit 0 |
| 2 | **E** | `aggregate.py` **nói đúng lời nói dối mà docstring của nó gọi tên** — *"a p95 computed only over the requests that succeeded… is a lie with a decimal point"* rồi làm đúng thế | 46/57 request hỏng → in `n=3 fail=10 p95 15.4`, **exit 0** |
| 3 | **C0** | `C0-3` **bịa trần batch** — coi *"không ném RuntimeError"* là *"vừa"*, trong khi driver Windows âm thầm tràn sang RAM hệ thống | cả 4 variant báo `batch 64` trên card **4 GB**, đỉnh ghi nhận **8135 MB** = 1,9× card, rồi in *"the true ceiling may be higher"* |
| 4 | **B** | `B13` có thể được đề xuất bởi mesh **trượt hoàn toàn khỏi khối** — `all([])` là `True` | dịch mức 3 đi 1000 mm → 78 nohit, vẫn in *"largest reduction still within ±1 slice"* |

---

## 4 · Một mẫu lặp lại đáng ghi hơn từng lỗi riêng lẻ

**Bảy lỗi thuộc loại "tài liệu nói một đằng, code làm một nẻo".** Chúng nguy hiểm hơn lỗi thường, vì
lời hứa trung thực làm người đọc **thôi kiểm tra**:

- `checks.py` rule 1: *"a check that could not be performed reports NOT_RUN… **never PASS**"* →
  `A17` PASS trong khi một header chưa hề mở.
- `aggregate.py` docstring gọi tên chính xác lời nói dối rồi nói nó.
- `README` Spike B gọi một tautology là *"kiểm tra tính đúng đắn"*.
- `conformance.py`: *"IT DOES NOT SHARE CODE WITH THE FIXTURE GENERATOR"* — đúng về mặt file, nhưng
  reference implementation viết lại **đúng công thức với đúng hằng số**, nên hai phép kiểm đầu là
  đồng nhất thức đại số.
- `synthetic/generate.py` docstring nói nó nuôi probe; **không gì đọc nó**.
- Nhóm `half_voxel` tồn tại để bắt lỗi làm tròn và **không bắt được** (dùng `z=6.5`, Python làm tròn
  về 6 = floor).
- `probe.py` **không chạy được với mặc định của chính nó**.

> **Bài học, ghi cho cả nhóm chứ không riêng tôi:** một dòng comment khẳng định sự trung thực là một
> **lời hứa phải kiểm được**. Viết nó ra rồi không kiểm còn tệ hơn không viết — vì người đọc sau sẽ
> tin nó thay vì tự soi.

---

## 5 · Những gì người review xác nhận là ĐÚNG

Ghi lại để bản này không chỉ là danh sách lỗi:

- **Spike D không crash với bất kỳ input hỏng nào** — thiếu mask, file 0 byte, NRRD 2D, mask một giá
  trị, file cắt dở, thư mục rỗng. Lỗi của nó toàn là lỗi **phán đoán**, không phải lỗi bền vững.
- `nearest_rank` trong Spike E **đúng** ở n = 1, 2, 20, 100 — không off-by-one.
- Hai cờ bắt buộc của Spike E **thật sự bắt buộc**; việc từ chối trộn `measurement_path` và
  `overlay_connection` **thật sự xảy ra**.
- Guard chống path-traversal của stub **đúng**.
- Xử lý thứ tự trục trong `payloads/generate.py` (`vol[:,:,z].T` → `[Ny,Nx]`) là **chỗ duy nhất
  trong cả bốn gói xử lý DR-008a tường minh và đúng**.

---

## 6 · Hệ quả quy trình

1. **Dụng cụ do một người viết trong một đêm phải được soi đối kháng trước khi ai đó tin số của nó.**
   Bốn PR này ban đầu được giao cho chính chủ sở hữu spike review — vẫn đúng, nhưng **không đủ**:
   chủ sở hữu review để *hiểu dụng cụ*, không phải để *phá nó*.
2. **Ưu tiên soi những chỗ tài liệu khoe sự trung thực.** Bảy trên 49 lỗi nằm đúng ở đó.
3. **Một phép kiểm chưa bao giờ thất bại thì chưa được chứng minh là biết thất bại.** Áp dụng cho CI
   guardrails (đã kiểm bằng nhánh âm) và cho mọi self-check trong harness.

---

**Liên quan:** PR [#14](../../../../pull/14) · [#15](../../../../pull/15) ·
[#16](../../../../pull/16) · [#17](../../../../pull/17) ·
[`../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md`](../incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md)
