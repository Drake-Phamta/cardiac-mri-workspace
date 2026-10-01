# QA-004 — bộ chạy lại cho Spike A

Bước 3 của `acceptance_workflow`. Chạy **trên `main`**, trong worktree sạch, **sau khi** `#31`/`#41`/`#49` đã
merge và **sau** phiên đo `S8`. Nó sinh ra cái bảng để viết `QA_REVIEW_004_SPIKE_A.md` — **nó không ra
verdict**; người viết verdict, và người ký không phải chủ spike.

```bash
python management/day10/qa004_spike_a/run_qa004.py
python management/day10/qa004_spike_a/run_qa004.py --json qa004.json
```

## Nó làm gì mà đọc `RESULT.md` không làm được

1. **Tự chạy lại** bốn kiểm offline (`check_conformance.py`, `test_viewer_math.mjs`, `test_brush.mjs`,
   `test_persist.mjs`) trên chính cây mã được trỏ tới, thay vì tin một chữ "ok" đã ghi.
2. **Dựng bảng `A1`–`A12` từ tệp bằng chứng thô** trong `spikes/spike_a_2d/EVIDENCE_RAW/`, không từ
   `README.md` hay `RESULT.md`. Tiêu chí không có tệp bằng chứng là `NOT MEASURED`, văn xuôi nói gì cũng vậy.
3. **`REJECTED`** với bằng chứng ghi trên bản debug, hoặc `build_type` còn nguyên chỗ trống mà extractor để
   lại. Đó là một hỏng hóc xuất xứ **làm hỏng chính con số**.
4. **Từ chối bản ghi `A8` không có vòng nạp lại NGUỘI**, đúng lý do `extract_a8.py` nêu.
5. **Suy `A9` từ `p95` đã ghi** so với 200 ms đóng băng của `NFR-PERF-001`, chứ không đọc kết luận đang bị
   soát.

**Thiếu `operator` / `device_profile` là `caveat`, không phải `REJECTED`.** Đó là lỗ hổng sổ sách thật và
phải vào ghi chú QA, nhưng nó không làm phép đo sai — tự đánh trượt một phép đo `release` lành lặn vì thiếu
một cái tên là checker tự bịa ra yêu cầu.

## Cái bẫy nó đã bắt được ngay khi viết

Bản đầu của script cho `A10`/`A11` là `OBSERVED`, vì tệp `a3_a7_brush_*.json` ghi `OBSERVED` ở cấp tệp. Nhưng
`extract_brush.py` **nói thẳng là nó không kết luận A10/A11** — bản đồ `criteria` của tệp chỉ có A3–A7.

Nên: **một tệp có bản đồ `criteria` thì tiêu chí không nằm trong bản đồ là không được bao phủ**, dù verdict
cấp tệp trông chắc chắn đến đâu. Kế thừa verdict cấp tệp đã gán `OBSERVED` cho hai tiêu chí mà chính tác giả
tệp từ chối kết luận — đúng kiểu sai mà bộ này sinh ra để bắt.

## Trạng thái lúc viết (19/09, trước phiên `S8`)

```
OBSERVED     8   A2 A3 A4 A5 A6 A7 A9 A10
NOT MEASURED 4   A1 (không có bằng chứng máy, theo thiết kế)
                 A8  (chờ phiên S8)
                 A11 (log 15/09 có trước S8, không mang kết cục nét)
                 A12 (là số giờ, lấy từ nhật ký công việc)
caveat           a9_slice_switch_20260912: operator không được ghi
```

Mã thoát khác 0 khi có bất cứ thứ gì chặn `ACCEPTED`: một tiêu chí `FAIL`, một tệp bằng chứng `REJECTED`,
hoặc một kiểm offline trượt — để bảng này không bị lướt qua.
