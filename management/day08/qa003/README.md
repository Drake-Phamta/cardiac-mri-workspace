# QA-003 scripts — Spike D, lượt soi lại độc lập 2026-09-17

Bản sao của [`../../day06/qa002/`](../../day06/qa002/) đã **thích ứng với `F5`**. Bản gốc QA-002 là **hồ sơ
của lượt đó** và không bị sửa; hai file ở đây khác bản gốc ở đúng phần được ghi bên dưới.

> ⚠ **Output của chúng chứa giá trị suy ra theo từng case và điểm tương quan từng cặp. KHÔNG BAO GIỜ commit
> output** — đó là dữ liệu **hạn chế** theo `F5` và ruling `DR-002b` × `F5` ngày 17/09. Bản ghi QA-003 chỉ
> mang **mã case bị loại, ngưỡng và số đếm**, đúng những gì ruling cho công khai.

| Script | Khác bản QA-002 ở đâu | Vì sao |
|---|---|---|
| `duplicate_mask_pair.py` | gom nhóm bằng **hash băm lại từ ZIP**, không đọc `sha256` của manifest | `F5` đã gỡ trường đó; bản gốc chết ở `KeyError: 'sha256'` |
| `verify_dr002b.py` | **mới** — liệt kê **mọi** cặp ≥ ngưỡng *(không phải top-N)*, gom thành **thành phần liên thông**, rồi đối chiếu tập loại trừ và số đếm với `DR-002b` | manifest công khai **khai** tập loại trừ nhưng **không chứng minh được** nó sau `F5` |

## Chạy

```bash
# cần: một worktree ở head của PR đang soát, và ZIP chính thức
git worktree add <SCR>/wt-qa-d34b <HEAD_CUA_PR>
cd <SCR>/qa003b
PYTHONDONTWRITEBYTECODE=1 PYTHONIOENCODING=utf-8 python duplicate_mask_pair.py
PYTHONDONTWRITEBYTECODE=1 PYTHONIOENCODING=utf-8 python verify_dr002b.py
```

Sửa `MAN` và `ARCHIVE` ở đầu file cho đúng máy. Cần `numpy`.

## Bài học đắt nhất của lượt này

**`F5` làm ba script QA không chạy hết được trên artifact công khai** — `recompute_manifest.py`,
`duplicate_mask_pair.py` và `independent_census.py` đều dừng ở `KeyError: 'sha256'`. Đây là **hệ quả đúng**
của quyết định thu hẹp, không phải lỗi. Cách xử lý đúng là **băm lại từ ZIP**, và nó còn tốt hơn bản cũ:
`F1` vốn đứng trên byte, hash trong manifest chỉ là bản sao đệm — băm lại **bỏ hẳn bản đệm khỏi chuỗi bằng
chứng**. Chi phí: 36,4 giây cho 308 volume.

**Và một lỗi QA tự mắc, ghi lại để không ai lặp:** lần đầu tôi so tập loại trừ với **100 case Training Set**
rồi tưởng con số train hiệu dụng bị lệch. Sai baseline — `DR-002` Path A chia 100 case phát triển đó thành
**80 train / 20 validation**, nên ngân sách `DR-002b` tiêu là **80**. Câu cảnh báo đó nằm trong chính
`verify_dr002b.py`.
