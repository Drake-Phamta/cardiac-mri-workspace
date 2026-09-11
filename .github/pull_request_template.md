<!--
Keep this short. It exists so a reviewer knows what to look at, not to make you
write an essay. Delete any section that does not apply to your PR.
-->

## Cái này làm gì

<!-- Một hoặc hai câu. -->

## Tiêu chí nghiệm thu nào bị đụng tới

<!-- Ví dụ: A6, B4, E12, C0-5 — hoặc "không cái nào, đây là dụng cụ/tài liệu". -->

## Bằng chứng

<!--
Nếu PR này CHỨA bằng chứng nghiệm thu, trỏ vào file thô:
  - file EVIDENCE_RAW nào
  - ai chạy phép đo, trên máy nào
  - điều kiện đo (build type, thermal, mạng, phần cứng)

Nếu PR này KHÔNG chứa bằng chứng, ghi thẳng: "dụng cụ / tài liệu, không có bằng chứng".
Nói rõ tốt hơn để người review tự đoán.
-->

## Tự kiểm

- [ ] **Không chạm `docs/specs/v1.0/**`** — nếu có chạm thì dừng lại, cần Decision Request theo `00` §13
- [ ] **Không commit dataset bytes, checkpoint, hay secret**
- [ ] Trường không đo được ghi **`NOT MEASURED — <lý do>`**, không bỏ trống và không đoán
- [ ] Không con số hiệu năng nào viết tay — mọi số truy được về một file thô
- [ ] Không chạm file thuộc sở hữu người khác (`15` §9 vùng integration-sensitive)
- [ ] Commit dưới tài khoản **của chính tôi**

## Người review

<!--
Reviewer theo ma trận trong SPIKE_PHASE_STATE.yaml. Một người chỉ giữ MỘT review
ở trạng thái REVIEWING tại một thời điểm (WIP-CONFLICT-01).

Nhắc cho người review: `15` §11 — im lặng KHÔNG phải là chấp thuận. Kết quả review
là một trong ba: APPROVE, NEEDS_FIX, hoặc BLOCKED/DECISION_REQUIRED.
-->
