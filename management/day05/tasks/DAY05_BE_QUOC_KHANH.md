# DAY 5 — Bế Quốc Khánh · 2026-09-14

## 🔴 LÀM TRƯỚC — nợ tồn, theo thứ tự

> **Quy tắc của leader (13/09):** nợ tồn phải trả **trước**; nhiệm vụ Day 5 bên dưới chỉ bắt đầu sau khi xong khối này.

| # | Nợ | Từ | Vì sao phải làm trước |
|---|---|---|---|
| **1** | **Audit Spike D → `dataset_manifest.json` + `DATASET_AUDIT.md` trên `main`, commit dưới tài khoản bạn** | Day 2 | **P0, đầu critical path.** Điều kiện 1 của Day 4 — gia hạn tới **07:00 sáng 14/09**; hạn cứng **23:59 14/09** |
| 2 | Phán `A17` (`desktop.ini` trong `CASE_0097`) · verdict `A11` `A13` `A18` · mapping `A10` · provenance `A12` | Day 2 | nằm trong chính bản audit |
| 3 | Xác nhận đĩa trống + thư viện NRRD **trên máy bạn** | Day 0 | ô `NOT_CHECKED` từ Day 0 |
| 4 | Khai báo compute `C0-1` | Day 0 | `ml_compute.declared` là ô `UNVERIFIED` cuối cùng |
| 5 | Review **PR #17** | Day 0 *(cột `B`)* | chưa từng review PR thật nào của đồng đội |

Không có nhiệm vụ Day 5 mới nào cho bạn cho tới khi 5 dòng trên xong.

---

> ## ⛔ Hạn cứng: 23:59 hôm nay
>
> **Gia hạn cho Day 4 (leader quyết 13/09 tối):** nếu audit lên `main` **trước 07:00 sáng 14/09**, điều kiện
> 1 của Day 4 được tính là **đạt**. Sau 07:00, Day 4 chốt theo đúng những gì có trên `main`. Hạn cứng
> 23:59 ngày 14/09 bên dưới **không đổi**.
>
> Leader đã quyết định ngày 13/09, ghi trong `PROJECT_STATE.yaml` → `recovery.decision_2026_09_13`:
>
> | | |
> |---|---|
> | **Việc** | `DATASET_AUDIT.md` + `dataset_manifest.json` trên `main`, **commit dưới tài khoản bạn** |
> | **Hạn** | **23:59 ngày 14/09** |
> | **Nếu trễ** | **Leader báo giảng viên hướng dẫn** |
> | **Làm hộ** | **Không.** Chỉ thị của leader: bạn phải tự hoàn thành |
>
> Đây là **ngày thứ 6** Spike D — P0, đầu critical path — chưa có một commit nào. Hôm qua Trung và Hùng
> Anh đều quay lại với việc thật; **bạn là chỗ tắc duy nhất còn lại trên critical path.**
>
> `INC-001` §5: *"làm thay không xoá nghĩa vụ."* Mọi dòng nợ bên dưới vẫn là của bạn.

---

## Nợ còn mở — tất cả của bạn

| Nợ | Từ |
|---|---|
| Audit `A1`–`A20` → manifest + `DATASET_AUDIT.md` | Day 2 |
| Verdict `A11` `A13` `A18` · mapping `A10` · provenance `A12` | Day 2 |
| Đĩa trống + thư viện NRRD **trên máy bạn** | Day 0 |
| Khai báo compute `C0-1` | Day 0 |
| Review một PR thật — **PR #17 đang chờ đúng bạn** *(PR #14 đã merge nhờ Trung review)* | Day 0 |

---

## Dụng cụ đã sẵn — và hôm qua còn tốt hơn

PR #14, nhánh `tools/spike-d-validation`, giờ ở `a1744e8`:

- Hôm qua **Trung tìm ra một lỗi thật**: phán quyết resample (`A8`) chỉ xét shape và spacing, bỏ qua
  origin và hướng trục. **Đã sửa** — ghi công Trung.
- Selftest giờ có thêm hai ca đặt bẫy đúng lỗi đó, và **đã kiểm là nó thất bại với code cũ.**
- Chạy lại trên gói thật: **15 PASS · 1 FAIL · 1 NOT_RUN · 3 OWNER_VERDICT** — không đổi. Cả 154 mask
  cùng origin và cùng ma trận hướng với MRI.

---

## Làm theo thứ tự — cả buổi mất khoảng 2–3 giờ

```bash
git pull origin main          # dung cu Spike D da len main (PR #14, 726e09f)
pip install -r tools/dataset_validate/requirements.txt

# 1 - chung minh harness chay: phai bao A9 FAIL va A14 FAIL (ca hai la bay cai san)
python tools/dataset_validate/validate.py --selftest

# 2 - xem truoc tren goi that, khong ghi gi
python tools/dataset_validate/validate.py --root "C:/cardiac-data/lasc2018/extracted" \
    --acquisition C:/cardiac-data/lasc2018/acquisition.json

# 3 - sinh artifact, commit duoi tai khoan BAN
python tools/dataset_validate/validate.py --root "C:/cardiac-data/lasc2018/extracted" \
    --acquisition C:/cardiac-data/lasc2018/acquisition.json \
    --write-manifest --write-audit
```

> ⚠ Đĩa: gói giải nén là **14,2 GiB** (`15 235 201 656` byte), **không phải 6 GB** như packet Day 3 ghi sai.

**Rồi bốn việc chỉ bạn phán được:**

| Tiêu chí | Việc |
|---|---|
| `A17` | **Sẽ FAIL** vì `Training Set/CMPXO4J23G58J53Q98SZ/desktop.ini` *(nhãn scanner `CASE_0097`)*. Loại trừ như artefact hệ điều hành **có lý do**, hoặc giải trình. **Đừng xoá file rồi chạy lại** |
| `A11` | `laendo.nrrd` có đúng là LA **cavity** không — phán đoán về ý nghĩa nhãn |
| `A13` | Bằng chứng Path A vs Path B cho `DR-002`. Dữ kiện quan trọng: **Testing Set CÓ nhãn** (54/54) |
| `A18` | Gói **không có file licence** → lưu lại trang điều khoản Cardiac Atlas riêng |
| `A10` · `A12` | Mapping foreground (**mask là `0`/`255`**, không phải `0`/`1`) · provenance nhãn test |

`A19` **chưa đạt được** dù sinh file — hai trường `06` §9.1 chờ `DR-002`. Cứ sinh; nó là đầu vào cho
`DR-002`.

---

## Sau audit

1. Review **PR #17** (dụng cụ probe cho Spike C0 của chính bạn). *PR #14 đã merge tối 13/09 sau review của
   Trung — dụng cụ Spike D giờ nằm trên `main`.*
2. Khai báo compute `C0-1` rồi mới chạy probe — `probe.py` bắt buộc `--operator`.

---

**Chi tiết lệnh và bối cảnh:** [`../../day04/tasks/DAY04_BE_QUOC_KHANH.md`](../../day04/tasks/DAY04_BE_QUOC_KHANH.md) ·
`tools/dataset_validate/README.md` · [`../../day04/DAY04_EOD_REVIEW.md`](../../day04/DAY04_EOD_REVIEW.md)
