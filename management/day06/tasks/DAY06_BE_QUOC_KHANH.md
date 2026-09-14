# DAY 6 — Bế Quốc Khánh · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> **Đêm qua bạn làm được nhiều thứ có chất lượng:** PR #28 (split Path A, selftest 9/9, tự tìm và sửa lỗ hổng
> của chính mình), khai báo `C0-1`, và review lại #17 **trên chính RTX 4050** — tìm ra 2 lỗi runtime thật mà kiểm
> offline bỏ sót. Nhưng tất cả được đẩy lên từ **00:44**, sau hạn 23:59; hạn cứng của audit Spike D đã trượt
> 45 phút — leader **ghi nhận, không báo giảng viên** (`DAY05_EOD_REVIEW.md` §1).
>
> **Hôm nay:** mỗi việc xong là **đẩy lên ngay** (commit/PR/comment). Trung, Hùng Anh và leader cần review hoặc
> dùng kết quả của bạn **trong ngày** — việc đẩy lên sau nửa đêm thì không ai kịp dùng.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **1** | **Bật pagefile Windows** trên máy của bạn (vd. System managed, hoặc ≥ 16 GB). Lý do: bạn đã ghi `WinError 1455` khi tải DINOv2 — probe C0 sẽ gặp lại lỗi này. Sau đó bổ sung một dòng vào comment `C0-1` trên #17 | ~15 ph | không | `Win32_PageFileUsage` trả về pagefile; comment bổ sung trên #17 |
| **2** | **Khi #25 merge: đổi base PR #28 sang `main`**, CI 4/4 xanh | ~15 ph | Hùng Anh review lại #25 → leader merge | #28 nhắm `main`, CI xanh. *Chưa merge thì làm việc 3 trước* |

## Việc Day 6

> ✅ **06:42 — leader đã đẩy bản sửa #17 (`08d7166`) — việc 4 không còn chờ ai.** Sửa đủ 2 lỗi runtime bạn tìm:
> `--find-batch` giờ **luôn chạy** kể cả khi batch dự định hỏng, rồi đo lại ở batch tìm được; `OSError` khi tải
> DINOv2 được ghi lại và probe chạy tiếp. Kiểm trên máy leader còn tìm thêm 2 lỗi, đã sửa: sau một lần hết bộ nhớ thật
> trên Windows **CUDA hỏng cho cả tiến trình** → trên CUDA mỗi lần đo và mỗi lần thử batch giờ chạy trong **tiến trình
> con riêng**; batch **tràn quá VRAM** không còn được ghi như số đo thật. `--selftest` 8/8 + 10/10.
> **Lưu ý thời gian:** mỗi lần thử là một tiến trình mới, nên chạy đủ 10 biến thể với `--find-batch` có thể mất
> **30–60 phút** — bắt đầu sớm, làm việc 5 trong lúc chờ. Chi tiết trong comment trên #17; nhờ bạn review lại #17.

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **3** | **Bằng chứng nối case ↔ bệnh nhân cho `GATE-SPLIT-01`** — xem chi tiết dưới. Đây là thứ **duy nhất** còn chặn gate split sau khi `DR-002` đã quyết | **~3 h** | không | `management/spikes/SPIKE_D_DATASET/PATIENT_LINKAGE_EVIDENCE.md` + script + selftest trên dữ liệu giả → PR, **trước 18:00** để leader quyết trong ngày |
| **4** | **Chạy probe C0 trên RTX 4050** với bản sửa #17 của leader: `probe.py --selftest` → `--operator "Bế Quốc Khánh" --img 560 --find-batch` (fp32) → thêm `--precision bf16` → `extrapolate.py <file> --train-cases 80 --gpu-hours-per-day <số giờ máy bạn thật sự chạy được>`. GPU chạy lâu — trong lúc chờ làm việc 5 | **~2,5 h** | leader sửa #17 (**hẹn trước 12:00**) | các file `c0_probe_*.json` + bảng ngoại suy commit **dưới tài khoản bạn** trên nhánh `spike-c0/evidence-khanh`. *#17 chưa sửa thì làm việc 5 và 6 trước* |
| **5** | **Khung pipeline C0 trên dữ liệu tổng hợp đúng hình dạng**: đọc manifest split theo đúng định dạng #28 (với mã case giả), chuẩn hoá DR-011, `uint8` 576/640 → 560, chạy **1 epoch** DINOv2-S/14 (frozen + progressive) và UNet trên ~8 volume tổng hợp, Dice trên tập validation giả, lưu và nạp lại checkpoint. **Không chạm dữ liệu thật** — `SPIKE_C1` còn `BLOCKED` | **~2 h** | không | PR nháp nhánh `spike-c0/pipeline-bringup` + log một lần chạy trọn |
| **6** | **Nháp `RESULT.md` Spike C0** (`management/spikes/SPIKE_C_ML/`): `C0-1` đã khai báo; `C0-2`…`C0-8` từ lượt chạy việc 4; `C0-9` — phản biện DR-011; `C0-10` — câu "C0 không đóng `GATE-ML-01`". Ô nào chưa có số ghi `NOT MEASURED — lý do` | **~1 h** | việc 4 | file nháp trong PR của việc 4 — **chưa** đánh dấu `EVIDENCE_READY` nếu còn ô trống |

**Tổng phần chính: ~9 h.**

> **🎯 Chuẩn demo** *(leader, 15/09: sản phẩm cuối phải "wow" — mọi thứ giảng viên thấy, thử và đánh giá được)*:
> kết quả C0 sẽ lên báo cáo và màn hình kết quả thí nghiệm. Việc 6 xuất **bảng + biểu đồ sinh tự động từ JSON**
> (chi phí từng biến thể, batch tối đa, ngoại suy lịch) — không vẽ tay. Việc 5 in log huấn luyện đọc được, lỗi rõ
> nghĩa. Giảng viên phải tái chạy được bằng **một lệnh**.

### Việc 3 — chi tiết

Gói dữ liệu không có mã bệnh nhân (bạn đã ghi ở #28). `GATE-SPLIT-01` đòi *"patient-level split … no patient/case may
cross partitions"* (`06` §6). Leader phải quyết: chấp nhận giới hạn có ghi rõ, hay đòi thêm bằng chứng. Việc của bạn là
đưa cho leader **bằng chứng tốt nhất có thể có**:

| Phần | Làm gì | Giờ |
|---|---|---|
| **a · Nguồn chính thức** | Đọc mô tả bộ LASC 2018 và bài benchmark của challenge (Xiong et al., *Medical Image Analysis*, 2021), trang phát hành Cardiac Atlas. Trả lời: **154 scan là 154 bệnh nhân khác nhau không? Có cặp scan trước/sau triệt đốt (ablation) của cùng bệnh nhân không?** Trích nguyên văn + đường dẫn; lưu tài liệu theo quy tắc `A18` (không phát tán lại) | ~1 h |
| **b · Sàng lọc thực nghiệm** | Script `tools/dataset_split/linkage_screen.py` so **mọi cặp** trong 154 volume bằng đặc trưng **chỉ từ ảnh MRI** (vd. volume thu nhỏ đã chuẩn hoá DR-011 → tương quan; kích thước, spacing). Xếp hạng các cặp giống bất thường, **đặc biệt cặp vắt ngang Training ↔ Testing**. **Không dùng nhãn** — 54 case holdout không được dùng nhãn cho việc gì ngoài đánh giá cuối | ~2 h |

**Kết luận phải là một trong ba:** *có ánh xạ tin cậy* (→ đưa vào `--patient-map`) · *không có ánh xạ, sàng lọc không thấy
cặp nghi vấn* · *có cặp nghi vấn* (kèm danh sách mã case + điểm). **Chỉ commit mã case, điểm số và phương pháp — không byte
ảnh nào.** Kết quả sàng lọc **không** được dùng cho bất kỳ quyết định mô hình nào.

## Hàng đợi dự phòng — làm khi việc chính bị chặn hoặc xong sớm

| Việc | Giờ | Xong khi |
|---|---|---|
| **Bản đồ bằng chứng Spike D cho bước QA** — bảng `A1`–`A20` → file / dòng / lệnh tái chạy, để phiên QA Red Team (bước 3 nghiệm thu, sau khi #25 merge) soi nhanh | ~1 h | comment trên #25 hoặc file trong PR của việc 3 |
| **Kiểm `A19`**: `DATASET_AUDIT.md` phủ đủ từng mục `06` §9.1 — bảng đối chiếu mục → đoạn | ~1 h | như trên |

---

**Nhắc lại `DR-002` = Path A:** 80 train / 20 validation / 54 holdout khoá cứng · `--train-cases 80` là giá trị đã quyết ·
C1 chỉ lấy từ 80 case train. **Liên quan:** PR #25 · PR #28 · PR #17 · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) → `DR-002`
