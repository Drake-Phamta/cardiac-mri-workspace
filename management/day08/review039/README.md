# Review #39 — Contract 2 experiment artifact, DRAFT v0

Adversarial pass by Project Control for Phạm Tuấn Anh, 2026-09-17. Same method as the #32 review: run
what the author shipped, then try to break it, starting every attack from a manifest **the author's own
`make_manifest()` considers valid** so only one thing changes at a time.

## Cách chạy lại

```bash
mkdir /tmp/c2 && cd /tmp/c2
git show origin/chore/day7-trung:contracts/ingestion/contract2_experiment_artifact/validate_contract2.py > validate_contract2.py
git show origin/chore/day7-trung:contracts/ingestion/contract2_experiment_artifact/test_contract2.py   > test_contract2.py
git show origin/chore/day7-trung:contracts/ingestion/contract2_experiment_artifact/schema.json         > schema.json
cp <repo>/management/day08/review039/*.py .

python test_contract2.py     # tác giả: 9 ca, PASS
python adversarial.py        # 11 đòn, 3 đối chứng
python divergence.py         # schema.json vs validate_contract2.py
```

`divergence.py` dùng `jsonschema` nếu có; không có thì nó tự hạ xuống một phép kiểm tối thiểu **đúng các
trường đang xét** và nói rõ là đã hạ.

## Kết quả

`test_contract2.py` của tác giả: **9/9 ca qua**. Ba đối chứng của tôi — checksum sai, path traversal,
`gate_ml_01=OPEN` — đều **bị chặn đúng mã lỗi**, nên bộ tấn công này là đáng tin chứ không phải gõ sai.

| # | Đòn | `schema.json` | `validate_contract2.py` |
|---|---|---|---|
| 1 | `media_type: 12345` | ❌ từ chối | ⚠ **nhận** |
| 2 | `training_fraction: true` | ❌ từ chối | ⚠ **nhận** |
| 3 | artifact **không ai tham chiếu**, `kind: "TOTALLY_MADE_UP_KIND"` | ❌ từ chối | ⚠ **nhận — `PASS`, 7 artifact** |
| 4 | `analysis_runs[0].metric_set_ids: null` | ❌ từ chối | 💥 **`TypeError`, không phải `FAIL`** |
| 5 | `analysis_runs[0].reconstruction_ids: null` | ❌ từ chối | 💥 **`TypeError`** |
| — | *(đối chứng)* checksum sai | — | ✅ `CHECKSUM_MISMATCH` |
| — | *(đối chứng)* `../../etc/passwd` | — | ✅ `SCHEMA_INVALID` |
| — | *(đối chứng)* `gate_ml_01: OPEN` | — | ✅ `GATE_ML_01_NOT_ACCEPTED` |

**Nguyên nhân chung của 1–5:** `validate_contract2.py` **không bao giờ nạp `schema.json`** —
`grep -n schema validate_contract2.py` không ra dòng nào. Hai tạo tác trong cùng một PR đang thực thi **hai
hợp đồng khác nhau**, và cái được gọi lúc nghiệm thu quyết định cái gì thật sự bị ràng buộc.

## Hai khoảng trống thuộc về thiết kế, không phải lỗi code

- **Cả hai cổng đều tự khai.** `gates.gate_split_01` và `gate_ml_01` được đọc **từ chính manifest đang bị
  kiểm**. Hôm nay cả hai đều chưa `ACCEPTED` trên thực tế, nhưng một manifest ghi `"ACCEPTED"` vẫn qua. Đây
  đúng lớp `F15` của QA-002 — phép kiểm không bao giờ `FAIL` được vì thứ bị kiểm do chính bên bị kiểm cung cấp.
- **`num_test_cases: 54` và `case_count: 54` cũng tự khai.** Checksum của manifest holdout được xác minh,
  nhưng **nội dung nó không bao giờ được đọc**, nên không gì xác nhận nó thật sự liệt kê 54 case.

## Những chỗ làm đúng, ghi lại để không bị sửa mất

`_safe_path` chặn traversal bằng `resolve()` + `relative_to()` **và** chặn ký tự Windows (`:`, `\`) trước đó ·
checksum đọc theo khối 1 MB nên file lớn không nổ bộ nhớ · `immutable is not True` là so sánh danh tính, không
phải truthiness · ngữ nghĩa `NEW`/`NO_OP`/`CHECKSUM_CONFLICT` khi nạp lại là đúng · đồ thị provenance
(run → raw → processed → metric/reconstruction) **thật sự bị ép**, không phải khai suông.
