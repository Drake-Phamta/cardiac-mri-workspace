# SPIKE_E — transport harness

> # ⚠ ĐỌC TRƯỚC: chạy LAN chỉ là DIAGNOSTIC
>
> Topology nghiệm thu là **ràng buộc**, `SPIKE_E_TRANSPORT/TASK.md`:
>
> ```text
> Samsung Galaxy A17 5G
>         |  cellular 4G / 5G THẬT
>         v
> ZeroTier private overlay đã xác thực        (DR-003a)
>         |
>         v
> Mac mini M2, 24 GB RAM  — ở XA địa điểm demo
> ```
>
> > *"**DO NOT use same-LAN measurements as the acceptance evidence for this spike.**"*
> > *"Venue Wi-Fi is not trusted and not required."*
> > Điều kiện thất bại: *"LAN measurements presented as acceptance evidence → **Evidence rejected**"*
>
> Không điều khoản nào cho thay host khác. **Mac mini là máy của Nguyễn Gia Đức Trung**, và repo còn
> chưa xác nhận nó bật được. Nên `E1`–`E9` và `E12` **không thể đo bằng thư mục này một mình**.

---

## Đây là dụng cụ dựng hộ, không phải làm thay

**Chủ sở hữu Spike E là Nguyễn Gia Đức Trung.** `TASK.md` cho phép nguyên văn:

> *"Claude **may**: write the backend stub, build the client harness and instrumentation, write the
> aggregation scripts, prepare the result template, and analyse measurements the owner supplies."*

Và giữ phép đo lại cho chủ sở hữu. Theo DR-006a, **operator** là người trực tiếp cầm thiết bị
(có thể là Phạm Tuấn Anh); **owner** vẫn là Nguyễn Gia Đức Trung, người xác định tiêu chí và viết
kết luận. Nếu Trung trực tiếp chạy máy thì hai vai trò trùng nhau. Cả hai tên đều phải nằm trong
run header — thiếu một tên thì `aggregate.py` từ chối tổng hợp.

Dựng đêm 2026-09-11 — [`INC-001`](../../management/incidents/INC-001_DAY2_MEMBER_UNAVAILABILITY.md).
**Không có `RESULT.md`. Không con số nào trong repo là phép đo của bạn.**

---

## Cấu trúc

```text
spikes/spike_e_transport/
├── payloads/generate.py     payload tổng hợp đại diện — volume, PNG slice, mask bit, mesh
├── stub/server.py           backend stub, 4 strategy, log thời gian xử lý phía server
├── client/harness.py        client có instrumentation → JSONL thô
├── client/retry.py          E9 — đặc tả hành vi reconnect/retry
├── analyze/aggregate.py     p50/p95/max, không phải summary gõ tay
└── EVIDENCE_RAW/            phép đo của bạn, trên đường thật
```

Chỉ cần `numpy`. Server dùng `http.server` của stdlib.

---

## Bốn chiến lược — đúng danh sách `TASK.md`

| # | Chiến lược | Endpoint |
|---|---|---|
| 1 | per-slice image encoding, tải theo yêu cầu | `GET /s1/slice/{z}.png` |
| 2 | per-slice packed-binary mask | `GET /s2/mask/{z}.bin` |
| 3 | tải cả volume, client tự cắt slice | `GET /s3/volume.raw` |
| 4 | prefetch window quanh slice đang xem | `GET /s4/window?z=&radius=` |
| — | mesh artifact theo mức decimation | `GET /mesh/{level}.obj` |

Mọi response mang `X-Server-Handling-Ms` và `X-Payload-Bytes`, nên **tách được thời gian mạng khỏi
thời gian server** — `TASK.md` đòi đúng điều này.

---

## Chạy

```bash
# 1 · payload (trên Mac mini). Shape là PLACEHOLDER cho tới khi Spike D có A6
python payloads/generate.py --out payloads/out

# 2 · stub — mặc định CHỈ bind loopback
python stub/server.py --payloads payloads/out
#    trên overlay: --bind <địa chỉ ZeroTier của Mac mini>   (KHÔNG phải địa chỉ LAN)

# 3 · trên điện thoại / trên đường thật
python client/harness.py --base http://<zt-addr>:8787 \
    --path cellular-overlay --connection direct \
    --operator "Phạm Tuấn Anh" --owner "Nguyễn Gia Đức Trung" --repeats 5 \
    --note "4G Viettel, ngoài trời, 3 vạch"

# 4 · E9
python client/retry.py --base http://<zt-addr>:8787 \
    --path cellular-overlay --connection relayed \
    --operator "Phạm Tuấn Anh" --owner "Nguyễn Gia Đức Trung" --duration 600

# 5 · tổng hợp
python analyze/aggregate.py EVIDENCE_RAW/e_transport_*.jsonl --out summary.json
```

### Hai cờ **bắt buộc**, harness từ chối chạy nếu thiếu

```
--path        cellular-overlay | lan-diagnostic
--connection  direct | relayed
```

Không cờ nào suy ra được từ bên trong tiến trình, và cả hai đều là điều kiện nghiệm thu:

- **`E1`** — mọi phép đo nghiệm thu phải trên cellular + overlay thật; LAN phải dán nhãn diagnostic
- **`E12`** — direct-vs-relayed ghi cho **MỌI** phép đo

Nếu để mặc định, một lần chạy LAN không nhãn sẽ trôi vào tập nghiệm thu, và `TASK.md` nói thẳng hậu
quả: **bằng chứng bị bác**. Tìm loại kết nối bằng `zerotier-cli peers`.

`aggregate.py` **từ chối trộn** hai đường đo khác nhau, và **từ chối trộn** direct với relayed — gộp
chúng lại là xoá đúng thứ `E12` được ghi ra để nhìn.

---

## Ba luật của thư mục này

1. **Không loại outlier.** Biến động cellular **chính là** phép đo; cắt đuôi là xoá câu trả lời của
   `E8`. Percentile nearest-rank, không nội suy — cùng định nghĩa với harness Spike A nên hai bên so
   được.
2. **Request thất bại được đếm và báo.** Một p95 tính trên riêng các request thành công, khi đường
   truyền rớt một phần ba, là một lời nói dối có dấu thập phân.
3. **Stub mặc định bind `127.0.0.1`.** Bind địa chỉ khác thì in cảnh báo kèm tên điều khoản — DR-003
   và `12` §5 cấm public endpoint, port forwarding, public domain, phơi bày không xác thực. Stub cũng
   từ chối path traversal và không cho liệt kê thư mục artifact.

---

## Smoke test đã chạy — và vì sao nó không nằm trong `EVIDENCE_RAW/`

Đêm 2026-09-11, toàn bộ pipeline được chạy thử trên **loopback** với payload 96×96×16: 98 request,
0 lỗi, cả 4 strategy cộng 4 mức mesh đều phục vụ được, `aggregate.py` in ra phân bố đầy đủ và tự dán
nhãn `DIAGNOSTIC ONLY`.

**Kết quả đó đã bị xoá khỏi `EVIDENCE_RAW/`.** Nó chứng minh dụng cụ chạy được, không chứng minh gì về
transport — không có mạng nào tham gia. `EVIDENCE_RAW/` là chỗ của bằng chứng chủ sở hữu; để một file
smoke test ở đó chỉ mời người ta đọc nhầm.

---

## Trạng thái tiêu chí

| # | Tiêu chí | Trạng thái |
|---|---|---|
| `E1` | Mọi phép đo nghiệm thu trên cellular + overlay thật | **chặn cứng** — cần Mac mini của bạn |
| `E2` `E3` `E4` `E5` `E6` `E7` `E8` `E9` `E12` | first-load, latency, prefetch, mask, mesh, bộ nhớ, phân bố, reconnect, direct-vs-relayed | `NOT MEASURED` — **dụng cụ đã sẵn**, chờ bạn chạy |
| `E10` | Đề xuất budget first-load | **kết luận của bạn** — script cấp đầu vào, không tự rút ra |
| `E11` | Bộ artifact fallback tối thiểu + kích thước on-device | `NOT MEASURED` |
| `E13` | Khuyến nghị chiến lược cho `ADR-ART-001` | **kết luận của bạn** |

`E7` (bộ nhớ trên thiết bị) chưa có instrumentation ở đây — nó cần đo từ phía app, không phải từ phía
client harness. Ghi ra để nó không bị quên chứ không giả vờ là đã có.

---

## Việc của bạn, theo thứ tự

1. **Xác nhận Mac mini bật được và truy cập được** — ô này vẫn `NOT_CHECKED` trong sign-off và nó là
   **cổng vào GATE 2**, không phải điện thoại.
2. **ZeroTier lên trên cả Mac mini lẫn điện thoại**, xác minh tới được. Xác nhận tới được là **dừng** —
   số nào ghi ở bước này đều mang nhãn prep và bị loại khỏi tập nghiệm thu.
3. `payloads/generate.py` trên Mac mini, rồi chạy stub bind địa chỉ overlay.
4. Chạy `harness.py` từ điện thoại trên **cellular thật**, nhiều lần, nhiều điều kiện sóng.
5. `retry.py` cho `E9` — tự cắt sóng bằng tay, harness không giả lập được và không nên giả lập.
6. `aggregate.py`, rồi **bạn** viết `E10` và `E13`.

> Shape payload mặc định `576×576×88` là **PLACEHOLDER**. Kích thước cohort thật là tiêu chí `A6` của
> Spike D, chưa ai đo. Mọi byte count phải tính lại khi `A6` có kết quả.

**Liên quan:** [`../../management/spikes/SPIKE_E_TRANSPORT/TASK.md`](../../management/spikes/SPIKE_E_TRANSPORT/TASK.md) ·
[`../../management/spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md`](../../management/spikes/SPIKE_E_TRANSPORT/EVIDENCE_TEMPLATE.md) ·
[`../../management/day01/tasks/DAY01_NGUYEN_GIA_DUC_TRUNG.md`](../../management/day01/tasks/DAY01_NGUYEN_GIA_DUC_TRUNG.md)
