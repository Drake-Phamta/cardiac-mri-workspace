# DAY 6 — Bế Quốc Khánh · 2026-09-15

**Khối lượng hôm nay:** phần chính **≥ 8 h** · hàng đợi dự phòng ~2 h · **hạn: 23:59 hôm nay**.

> **Đêm qua bạn làm được nhiều thứ có chất lượng:** PR #28 (split Path A, selftest 9/9, tự tìm và sửa lỗ hổng
> của chính mình), khai báo `C0-1`, và review lại #17 **trên chính RTX 4050** — tìm ra 2 lỗi runtime thật mà kiểm
> offline bỏ sót. Nhưng tất cả được đẩy lên từ **00:44**, sau hạn 23:59; hạn cứng của audit Spike D đã trượt
> 45 phút — leader **ghi nhận, không báo giảng viên** (`DAY05_EOD_REVIEW.md` §1).
>
> **Hôm nay:** mỗi việc xong là **đẩy lên ngay** (commit/PR/comment). Trung, Hùng Anh và leader cần review hoặc
> dùng kết quả của bạn **trong ngày** — việc đẩy lên sau nửa đêm thì không ai kịp dùng.
>
> ✅ **10:03 — audit Spike D của bạn đã lên `main`** (`a92892c`): Hùng Anh approve rồi merge.
>
> ❌ **11:52 — QA Red Team `REJECT`, Spike D chuyển `NEEDS_FIX`** — [`../QA_REVIEW_002_SPIKE_D.md`](../QA_REVIEW_002_SPIKE_D.md).
> **Mọi con số của bạn tái lập đúng** (chạy lại scanner trên bản ZIP cùng hash: manifest khác 0 trường). QA bác vì
> những gì bằng chứng có mà audit không báo. Quan trọng nhất: **`CASE_0056` và `CASE_0097` là một lần chụp bị xuất hai
> lần** (`laendo` và `lawall` giống hệt từng byte, MRI r = 0,9965) trong khi audit ghi *"Anomalies: 0"*, và split
> nháp ở #28 đặt một bản ở train, một bản ở validation. Việc sửa là **việc 0** ngay dưới — làm trước mọi việc khác.

## 🔴 LÀM TRƯỚC — nợ tồn

| # | Việc | Giờ | Chờ ai | Xong khi |
|---|---|---|---|---|
| **0** | **Sửa Spike D theo QA-002** — *critical path*: **(F1)** thêm phép kiểm trùng hash giữa các case và trùng ID thư mục vào `A15`/`A16`; ghi cặp `CASE_0056`/`CASE_0097` là bất thường, kèm **đề xuất xử lý của bạn**, trong manifest và audit · **(F2)** audit §4 ghi spacing/origin/direction thật (mặc định ở cả 462 header) và câu *"hình học vật lý chưa kiểm được — mm/mL tắt"* theo `06` §4; ghi độ phân giải công bố nếu tìm được · **(F3)** bảng `A19` đối chiếu từng mục `06` §9.1 — mục split theo quyết định Q2 của leader · **(F4)** verdict **Q4/`A14`** dẫn file và giá trị; verdict `A11` dẫn một phép kiểm trên chính gói · **(F5)** **bỏ đường dẫn tuyệt đối** (`package_root`, `license_terms_path`) và trích điều khoản CAP về phát tán siêu dữ liệu để leader phán · **(F12)** đính kèm log validator, môi trường, commit đã chạy · **(F13)** sửa lời lẽ. Sinh lại manifest và audit từ ZIP của bạn. F6–F11, F14–F15 (lỗi validator) ghi thành việc theo dõi, làm sau — script tái lập ở [`../qa002/`](../qa002/) | ~3,5 h | không — riêng mục split (Q1), `A19` (Q2) và F5 (Q3) chờ leader quyết | PR mới về `main`, trả lời từng phát hiện; Hùng Anh duyệt lại, QA soi lại |
| **1** | **Bật pagefile Windows** trên máy của bạn (vd. System managed, hoặc ≥ 16 GB). Lý do: bạn đã ghi `WinError 1455` khi tải DINOv2 — probe C0 sẽ gặp lại lỗi này. Sau đó bổ sung một dòng vào comment `C0-1` trên #17 | ~15 ph | không | `Win32_PageFileUsage` trả về pagefile; comment bổ sung trên #17 |
| **2** | ⏸ **Giữ tới khi leader quyết Q1** — cặp `CASE_0056`/`CASE_0097` phải nằm cùng một phía; split cũ đặt ở hai phía. **Mở lại PR split về `main`.** #25 đã merge 10:03 (`a92892c`, squash); nhánh base `spike/SPIKE_D` bị xoá khi merge nên **GitHub tự đóng #28 lúc 10:03:28** — không ai quyết đóng. Làm: `git fetch origin` → `git switch codex/path-a-split` → `git rebase --onto origin/main fdaf920` → `git push --force-with-lease` → `gh pr create --base main --draft`, ghi "thay #28" trong mô tả. *Project Control đã thử rebase trên bản sao cục bộ: sạch, còn đúng 5 file split* | ~20 ph | không | PR mới nhắm `main`, CI 4/4 xanh |

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
| **3** | **Bằng chứng nối case ↔ bệnh nhân cho `GATE-SPLIT-01`** *(QA-002 đã tìm ra một cặp trùng trong `Training Set` bằng tương quan MRI — phần b của bạn phải tìm lại được cặp này, như một phép kiểm chính phương pháp)* — xem chi tiết dưới. Đây là thứ **duy nhất** còn chặn gate split sau khi `DR-002` đã quyết | **~3 h** | không | `management/spikes/SPIKE_D_DATASET/PATIENT_LINKAGE_EVIDENCE.md` + script + selftest trên dữ liệu giả → PR, **trước 18:00** để leader quyết trong ngày |
| **4** | **Chạy probe C0 trên RTX 4050** với bản sửa #17 của leader: `probe.py --selftest` → `--operator "Bế Quốc Khánh" --img 560 --find-batch` (fp32) → thêm `--precision bf16` → `extrapolate.py <file> --train-cases 80 --gpu-hours-per-day <số giờ máy bạn thật sự chạy được>`. GPU chạy lâu — trong lúc chờ làm việc 5 | **~2,5 h** | leader sửa #17 (**hẹn trước 12:00**) | các file `c0_probe_*.json` + bảng ngoại suy commit **dưới tài khoản bạn** trên nhánh `spike-c0/evidence-khanh`. *#17 chưa sửa thì làm việc 5 và 6 trước* |
| **5** | *(xuống dự phòng 12:15 — sau việc 0)* **Khung pipeline C0 trên dữ liệu tổng hợp đúng hình dạng**: đọc manifest split theo đúng định dạng #28 (với mã case giả), chuẩn hoá DR-011, `uint8` 576/640 → 560, chạy **1 epoch** DINOv2-S/14 (frozen + progressive) và UNet trên ~8 volume tổng hợp, Dice trên tập validation giả, lưu và nạp lại checkpoint. **Không chạm dữ liệu thật** — `SPIKE_C1` còn `BLOCKED` | **~2 h** | không | PR nháp nhánh `spike-c0/pipeline-bringup` + log một lần chạy trọn |
| **6** | *(xuống dự phòng 12:15)* **Nháp `RESULT.md` Spike C0** (`management/spikes/SPIKE_C_ML/`): `C0-1` đã khai báo; `C0-2`…`C0-8` từ lượt chạy việc 4; `C0-9` — phản biện DR-011; `C0-10` — câu "C0 không đóng `GATE-ML-01`". Ô nào chưa có số ghi `NOT MEASURED — lý do` | **~1 h** | việc 4 | file nháp trong PR của việc 4 — **chưa** đánh dấu `EVIDENCE_READY` nếu còn ô trống |

**Tổng phần chính: ~10 h** sau khi thêm việc 0 (~3,5 h); việc 5 và 6 xuống dự phòng.

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
| **Bản đồ bằng chứng Spike D** — bảng `A1`–`A20` → file / dòng / lệnh tái chạy, **đưa vào PR sửa của việc 0** để lượt QA soi lại chạy nhanh | ~1 h | trong PR của việc 0 |
| ~~**Kiểm `A19`**~~ → gộp vào **việc 0** (F3 của QA-002) | — | — |

---

**Nhắc lại `DR-002` = Path A:** 80 train / 20 validation / 54 holdout khoá cứng · `--train-cases 80` là giá trị đã quyết ·
C1 chỉ lấy từ 80 case train. **Liên quan:** PR #25 · PR #28 · PR #17 · [`../../day05/DAY05_EOD_REVIEW.md`](../../day05/DAY05_EOD_REVIEW.md) ·
[`../../readiness/OPEN_DECISIONS.md`](../../readiness/OPEN_DECISIONS.md) → `DR-002`
