# Cấu trúc slide — 6 slide, 8–10 phút nói

Chữ trên slide phải **ngắn**. Slide là chỗ bám, không phải chỗ đọc. Mỗi mục dưới đây ghi rõ **cái gì KHÔNG
được đưa lên** — phần đó quan trọng ngang phần nội dung.

## Sáu slide trả lời đúng ba câu thầy hỏi

| Câu hỏi của thầy | Slide |
|---|---|
| **1 · Xây ứng dụng gì?** | **1–2** |
| **2 · Dự kiến dùng công nghệ gì?** | **3–4** — slide 3 nói thành phần nghiên cứu ngắn gọn, **slide 4 nêu tên công nghệ cụ thể** |
| **3 · Tham chiếu sản phẩm nào, khác gì?** | **5–6** |

Không slide nào được để chuyện quản trị dự án lấn át nội dung.

| Slide | Nội dung | Ai | Phút |
|---|---|---|---|
| 1 | Vấn đề và mục đích | Tuấn Anh | 1,5 |
| 2 | Luồng làm việc + 5 nhóm tính năng | Tuấn Anh | 1,5 |
| 3 | Thành phần nghiên cứu (AI) | Khánh | 1,5–2 |
| 4 | Công nghệ dự kiến + triển khai | Trung, xen Hùng Anh | 2–2,5 |
| 5 | Sản phẩm tham chiếu | Hùng Anh | 1,5 |
| 6 | Khác biệt + phạm vi | Tuấn Anh | 1,5 |

---

## Slide 1 — Vấn đề và mục đích

**Tiêu đề:** AI-assisted Cardiac MRI Research Workspace

**Bullet trên slide (đúng 4 dòng):**
- Một chỉ số Dice trung bình **không cho biết mô hình sai ở đâu**
- Workspace **nghiên cứu / học tập** để điều tra hành vi mô hình phân vùng tâm nhĩ trái trên ảnh LGE MRI
- Người dùng: **nhà nghiên cứu / sinh viên nghiên cứu** — *không* phải bác sĩ chẩn đoán
- **Không phải phần mềm chẩn đoán y tế**

**Câu in to giữa slide (north-star):**
> *"Why did the AI fail on this MRI, and what can the researcher do about it?"*

**Hình:** không cần hình. Để câu north-star làm trung tâm.

**KHÔNG đưa lên slide:** tên môn, mã đề tài, danh sách yêu cầu, bất kỳ chữ "chẩn đoán" nào không đi kèm chữ
"không phải", logo bệnh viện, ảnh MRI của bệnh nhân thật.

**Thời lượng:** 1,5 phút.

---

## Slide 2 — Luồng làm việc và 5 nhóm tính năng

**Tiêu đề:** Người dùng đi từ kết quả thí nghiệm tới từng pixel, rồi quay lại

**Nửa trên — chuỗi drill-down (Hình B):**
```
Experiment → Cohort → Case → Slice → Error region ⇄ 3D → Review
```

**Nửa dưới — 5 nhóm tính năng, mỗi nhóm một dòng:**

| | Nhóm | Một câu |
|---|---|---|
| 1 | **Experiment & Cohort** | so sánh UNet vs DINOv2, xem phân bố, lần xuống case kém nhất |
| 2 | **2D MRI Case Explorer** | duyệt slice, overlay dự đoán / nhãn thật / lỗi, zoom–pan |
| 3 | **2D ⇄ 3D liên kết** | dựng lại tâm nhĩ trái 3D, chọn vùng trên 3D → nhảy đúng slice nguồn |
| 4 | **Review / Correction** | chấp nhận, gắn cờ, hoặc **sửa bằng cọ**; dự đoán gốc giữ nguyên |
| 5 | **Findings** | ghi nhận quan sát, gắn với thí nghiệm–case–slice–vùng |

**Hình:** Hình B (chuỗi drill-down) ở trên, bảng 5 dòng ở dưới.

**KHÔNG đưa lên slide:** mã màn hình `SCR-01`…`SCR-09`, mã yêu cầu `FR-*`/`PR-*`, `SCR-09` (nó là
`SHOULD`, chưa chắc làm).

**Thời lượng:** 1,5 phút.

---

## Slide 3 — Thành phần nghiên cứu

**Tiêu đề:** Câu hỏi nghiên cứu: khi ít nhãn đi thì mô hình nào trụ tốt hơn?

**Bullet:**
- **`RQ-A`** — DINOv2-based **suy giảm ít hơn** hay nhiều hơn UNet khi **giảm dữ liệu có nhãn**?
- Ma trận **6 lần huấn luyện**: `UNet` và `DINOv2` × **25% / 50% / 100%**
- Cùng seed, cùng subset, subset nhỏ **lồng trong** subset lớn → khác biệt đến từ **lượng nhãn**, không
  phải từ việc chia dữ liệu
- Dữ liệu: **LASC 2018** (Cardiac Atlas Project) — **154 ca**; giao thức chia dữ liệu chống rò rỉ **đang hoàn tất**
- **Kết quả âm là kết quả hợp lệ.** Nhóm không đặt mục tiêu DINOv2 phải thắng

**Bảng nhỏ (nếu còn chỗ):**

| | 25% | 50% | 100% |
|---|---|---|---|
| UNet | ✓ | ✓ | ✓ |
| DINOv2 | ✓ | ✓ | ✓ |

**Hình:** bảng 2×3 ở trên. Không vẽ kiến trúc mạng.

**KHÔNG đưa lên slide:** bất kỳ con số Dice nào (**chưa huấn luyện lần nào**), tên bài báo tham chiếu như
thể nhóm tái lập nó, sơ đồ kiến trúc UNet/ViT, chữ "state-of-the-art".

**Thời lượng:** 1,5–2 phút.

---

## Slide 4 — Công nghệ

**Tiêu đề:** Ngăn xếp công nghệ dự kiến

> **Slide này trả lời thẳng câu hỏi số 2 của thầy.** Thầy nhìn 10 giây phải nắm được **tên công nghệ**,
> không phải tình trạng nội bộ của nhóm. Cột trạng thái chỉ có ba giá trị và **để trả lời khi bị hỏi**,
> không phải nội dung chính.

**Bảng — 8 hàng, đọc được trên Google Meet. Cột giữa là cột quan trọng nhất:**

| Mảng | Công nghệ | Trạng thái |
|---|---|---|
| Ứng dụng di động | **Android** · React Native + Expo | đang đánh giá |
| ML & mô hình | **Python** · **PyTorch** · **UNet** · **DINOv2** | đang dùng |
| Ảnh y tế | **NRRD** · `pynrrd` | đang dùng |
| Hiển thị 2D | React Native + JavaScript thuần | đang đánh giá |
| Hiển thị 3D | **WebGL2** — không thư viện | đang đánh giá |
| Backend & lưu trữ | hợp đồng API + CLI **Python** · **JSON manifest** | chưa chốt framework |
| Hạ tầng | **Mac mini M2 24 GB** · **ZeroTier** qua Wi-Fi | đã duyệt |
| Git / CI | **GitHub** · **GitHub Actions** | đang dùng |

**Chi tiết KHÔNG lên slide, để dành cho Q&A:** NumPy · Hugging Face `transformers` cho backbone DINOv2 ·
mesh định dạng OBJ · zoom/pan/cọ 2D tự viết · chưa dùng cơ sở dữ liệu. Đều có trong `QA` mục 11–11d.

**Sơ đồ triển khai (Hình C), vẽ ngang dưới bảng:**
```
Galaxy A17 5G  ──Wi-Fi──▶  ZeroTier (mạng riêng có xác thực)  ──▶  Mac mini M2 24 GB
```

**Ba chỗ phải nói "chưa chốt" bằng miệng, không để thầy tự suy ra:**
framework di động · framework backend · thư viện 3D.

**KHÔNG đưa lên slide:**
- ❌ **"Tailscale"** — đã đổi sang ZeroTier; ❌ **"4G/5G"** làm đường chính — đường chuẩn là **Wi-Fi**
- ❌ số lượng endpoint, số mã lỗi, số job CI — đó là chi tiết nội bộ, không phải tên công nghệ
- ❌ nhãn `DRAFT`, tên cổng, tên quyết định, tên spike, trạng thái nghiệm thu
- ❌ tình trạng đo mm/mL, chi tiết acceptance test
- ❌ bất kỳ câu nào kiểu "nhóm đã chọn framework X"
- ❌ sơ đồ kiến trúc nhiều tầng

**Thời lượng:** ~2 phút — Trung **90 giây** đọc tên công nghệ theo nhóm, **Hùng Anh xen 20 giây** cho dòng 3D.

---

## Slide 5 — Sản phẩm tham chiếu

**Tiêu đề:** Nhóm học từ đâu

**Bảng ba cột:**

| | **3D Slicer** | **cvi42** | **Dự án của nhóm** |
|---|---|---|---|
| Là gì | nền tảng mã nguồn mở xem & phân tích ảnh y sinh | phần mềm đọc và báo cáo ảnh tim mạch | workspace nghiên cứu **điều tra lỗi AI** |
| Nền tảng | desktop (Linux/macOS/Windows) | máy trạm desktop + web viewer | **mobile-first (Android)** |
| Hạng mục | **không** được duyệt cho lâm sàng, dùng cho nghiên cứu | **thiết bị y tế được quản lý**, dùng theo kê đơn | nghiên cứu / học tập, **không lâm sàng** |
| Nhóm học gì | quy trình phân vùng, liên kết 2D–3D, trực quan hoá khoa học | **tổ chức thông tin**: overlay nằm cạnh ảnh gốc thế nào, bảng số đặt ở đâu | — |

**Một dòng dưới bảng:**
> Nhóm học **cách tổ chức thông tin và quy trình**, không sao chép giao diện, không sao chép thương hiệu,
> và không tuyên bố năng lực tương đương.

**KHÔNG đưa lên slide:** ảnh chụp giao diện cvi42 hay 3D Slicer, logo của họ, câu "họ không có tính năng
này", so sánh hiệu năng, bất kỳ claim nào về độ chính xác lâm sàng của họ.

**Thời lượng:** 1,5 phút.

---

## Slide 6 — Khác biệt và phạm vi

**Tiêu đề:** Điểm khác biệt nằm ở **luồng tích hợp**, không ở từng tính năng

**Bullet:**
- Từng năng lực riêng lẻ **có thể đã tồn tại** ở sản phẩm khác — nhóm không tuyên bố ngược lại
- Cái nhóm đặt ra là **ghép chúng thành một chuỗi liền mạch trên điện thoại**:
  `experiment → cohort → case → slice → vùng lỗi ⇄ 3D → review`
- Bốn điểm nhấn:
  - đi từ **kết quả thí nghiệm xuống tận bằng chứng ảnh**, không dừng ở biểu đồ
  - trọng tâm là **điều tra lỗi của AI**, không phải trình bày dự đoán
  - liên kết **2D ⇄ 3D xác định**, chọn trên 3D là ra đúng slice nguồn
  - **sửa tay không ghi đè dự đoán gốc** — mỗi lần lưu tạo một phiên bản mới, truy vết được
- Thí nghiệm khan hiếm dữ liệu **nằm trong cùng workspace**, không phải một notebook rời

**Hình:** lặp lại Hình B (chuỗi drill-down), lần này tô đậm hai mắt xích `vùng lỗi ⇄ 3D` và `review`.

**Dòng cuối, cỡ nhỏ:** phạm vi môn học: MVP trên **một** thiết bị đã khai báo, dữ liệu công khai, không
tích hợp PACS, không quy trình bệnh nhân.

**KHÔNG đưa lên slide:** số ngày còn lại, trạng thái mốc, phần trăm hoàn thành, số liệu quản trị.

**Thời lượng:** 1,5 phút.

---

## Nếu giảng viên hỏi "đã làm được gì rồi?"

**Không có slide cho câu này.** Trả lời miệng, 30–60 giây — lời thoại nằm trong
[`APP_CONSULTATION_SPEAKER_SCRIPT.md`](APP_CONSULTATION_SPEAKER_SCRIPT.md) mục cuối.
