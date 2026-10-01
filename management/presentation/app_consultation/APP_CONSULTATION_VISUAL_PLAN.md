# Bốn sơ đồ — vẽ lại được trong 5 phút

Bốn hình này đã có sẵn trong [`slides.html`](slides.html). File này để **vẽ lại bằng tay** nếu muốn dùng
bảng trắng, hoặc dựng lại trong PowerPoint/Canva.

Nguyên tắc chung: **khối chữ nhật + mũi tên**, không gradient, không icon, không hơn 8 khối một hình. Thầy
phải hiểu hình trong 5 giây mà không cần nghe giải thích.

---

## Hình A — Pipeline sản phẩm *(slide 2, nền)*

```
┌──────────┐   ┌──────────┐   ┌────────────────────┐   ┌────────────────────┐   ┌──────────┐
│ Dataset  │──▶│    AI    │──▶│ Experiment/Metrics │──▶│  Mobile Workspace  │──▶│  Review  │
│ LASC2018 │   │ UNet ·   │   │  Dice, phân bố,    │   │  duyệt · overlay · │   │ sửa tay, │
│ 154 ca   │   │ DINOv2   │   │  so sánh           │   │  2D ⇄ 3D           │   │ findings │
└──────────┘   └──────────┘   └────────────────────┘   └────────────────────┘   └──────────┘
                                                                                      │
                                                        ReviewedMask (phiên bản mới) ◀─┘
                                                        RawPrediction giữ nguyên
```

**Điểm phải thấy:** mũi tên quay lại ở cuối — review **tạo artifact mới**, không ghi đè.

---

## Hình B — Chuỗi drill-down *(slide 2 và slide 6)*

```
Experiment ──▶ Cohort ──▶ Case ──▶ Slice ──▶ Error region
                                                  ▲   │
                                                  │   ▼
                                                  └─ 3D
                                                      │
                                                      ▼
                                                   Review
```

Vẽ ngang một hàng, riêng `Error region ⇄ 3D` có **mũi tên hai chiều**.

**Điểm phải thấy:** mũi tên hai chiều. Chọn trên 3D **quay lại đúng lát cắt nguồn** — đó là điểm kỹ thuật
khó nhất và cũng là điểm khác biệt.

Ở slide 6, **tô đậm** hai mắt xích `Error region ⇄ 3D` và `Review`.

---

## Hình C — Kiến trúc triển khai *(slide 4)*

```
   ┌─────────────────┐
   │  Máy huấn luyện │   (GPU rời — KHÔNG phải Mac mini)
   │  UNet · DINOv2  │
   └────────┬────────┘
            │ artifact: mask dự đoán, số liệu, mesh
            ▼
   ┌─────────────────────────┐
   │  Mac mini M2 · 24 GB    │   backend + lưu trữ
   │  (đặt ở xa)             │
   └────────▲────────────────┘
            │
   ╔════════╧═════════════════════════╗
   ║  ZeroTier — mạng riêng có xác thực ║
   ╚════════▲═════════════════════════╝
            │  Wi-Fi
   ┌────────┴────────────────┐
   │  Samsung Galaxy A17 5G  │   ứng dụng
   └─────────────────────────┘
```

**Ba điều phải đúng:**
- **ZeroTier**, không phải Tailscale
- **Wi-Fi**, không phải 4G/5G
- Huấn luyện **không** chạy trên Mac mini

**Không** vẽ thêm tầng nào: không load balancer, không database riêng, không CDN.

---

## Hình D — Bảng so sánh ba cột *(slide 5)*

| | **3D Slicer** | **cvi42** | **Dự án của nhóm** |
|---|---|---|---|
| **Là gì** | nền tảng mã nguồn mở để xem và phân tích ảnh y sinh | phần mềm đọc và báo cáo ảnh tim mạch | workspace nghiên cứu để **điều tra lỗi AI** |
| **Nền tảng** | desktop — Linux, macOS, Windows | máy trạm desktop + web viewer | **mobile-first — Android** |
| **Hạng mục** | **không được duyệt cho lâm sàng**, dành cho nghiên cứu | **thiết bị y tế được quản lý**, dùng theo kê đơn | nghiên cứu / học tập, **không lâm sàng** |
| **Nhóm học gì** | quy trình phân vùng · liên kết 2D–3D · trực quan hoá khoa học | **tổ chức thông tin** · overlay nằm cạnh ảnh gốc · vị trí bảng số | — |
| **Không sao chép** | — | giao diện, thương hiệu, tuyên bố năng lực | — |

**Quy tắc khi trình bày bảng này:** đọc **cột của mình cuối cùng**, và không nói câu nào so sánh chất
lượng. Bảng này để nói "nhóm học từ đâu", không phải để nói "nhóm hơn ai".

⚠ **Không** chụp màn hình giao diện cvi42 hay 3D Slicer đưa lên slide. Không dùng logo của họ.

---

## Bảng công nghệ *(slide 4, phần trên Hình C)*

Không phải sơ đồ, nhưng là phần hình quan trọng nhất của slide 4. Cột thứ ba **phải có màu khác** với hai
cột đầu — đó là cột thầy sẽ hỏi.

Quy ước màu: ✅ **xanh** = đã chốt · 🔶 **cam** = đang đánh giá.
Nếu in đen trắng thì dùng chữ **"đã chốt"** / **"chưa chốt"**, đừng dựa vào màu.

---

## Nếu chỉ kịp vẽ một hình

Vẽ **Hình B**. Nó nói được cả sản phẩm làm gì lẫn điểm khác biệt nằm ở đâu, chỉ bằng một hàng mũi tên.
