# Gói tư vấn BTL môn APP — họp 09:00, 2026-09-23

Buổi này là **tư vấn sơ bộ đề tài**, không phải bảo vệ. Giảng viên hỏi ba thứ: ứng dụng làm gì, công nghệ
dự kiến, và tham chiếu sản phẩm nào. Mỗi nhóm **10–15 phút**.

## Dùng file nào

| File | Ai đọc | Khi nào |
|---|---|---|
| [`APP_CONSULTATION_SCRIPT.docx`](APP_CONSULTATION_SCRIPT.docx) | **từng người, in dải trang của mình** | **Cầm trên tay lúc nói.** Câu đầy đủ đọc thẳng ra tiếng được, kèm Q&A và số liệu dự phòng của đúng slide đó |
| [`APP_CONSULTATION_ONE_PAGE.md`](APP_CONSULTATION_ONE_PAGE.md) | **cả bốn người** | **Mở sẵn trong lúc họp.** Một trang, không cuộn |
| [`APP_CONSULTATION_SPEAKER_SCRIPT.md`](APP_CONSULTATION_SPEAKER_SCRIPT.md) | từng người phần của mình | Đọc trước **tối nay**, tập nói một lượt — bản gạch đầu dòng, ngắn hơn bản `.docx` |
| [`APP_CONSULTATION_QA.md`](APP_CONSULTATION_QA.md) | cả bốn | Lướt trước khi họp; mở sẵn tab riêng lúc Q&A |
| [`slides.html`](slides.html) | người share màn hình | Mở bằng trình duyệt → F11 → share tab |
| [`APP_CONSULTATION_SLIDE_OUTLINE.md`](APP_CONSULTATION_SLIDE_OUTLINE.md) | ai chỉnh slide | Chỉ khi cần sửa nội dung slide |
| [`APP_CONSULTATION_VISUAL_PLAN.md`](APP_CONSULTATION_VISUAL_PLAN.md) | ai vẽ lại hình | Nếu muốn vẽ tay trên giấy/bảng thay vì chiếu |

Ghi chú tham chiếu thiết kế nằm riêng, **không** thuộc gói thuyết trình:
[`../../product_reference/CVI42_DESIGN_REFERENCE.md`](../../product_reference/CVI42_DESIGN_REFERENCE.md).

File `.docx` sinh ra từ [`build_script_docx.py`](build_script_docx.py) — nội dung nằm trong file `.py`
để còn diff được. Sửa nội dung thì sửa `.py` rồi chạy `python build_script_docx.py`, đừng sửa thẳng
`.docx`. Nếu sửa làm đổi độ dài thì **mở lại bằng Word và kiểm dải trang** ghi trên bìa.

## Phân vai

| Người | Nói phần | Khoảng |
|---|---|---|
| **Phạm Tuấn Anh** | mở đầu · mục đích · luồng làm việc · chốt | ~3 ph |
| **Bế Quốc Khánh** | dữ liệu · ML · thí nghiệm `RQ-A` | 1,5–2 ph |
| **Vũ Hùng Anh** | 2D ↔ 3D · sản phẩm tham chiếu | 1,5–2 ph |
| **Nguyễn Gia Đức Trung** | backend · review/correction · triển khai | 1,5–2 ph |

Tổng nói **8–10 phút**, chừa **2–5 phút** hỏi đáp.

## Ba luật của buổi này

1. **Không nói quá.** Cái gì chưa chốt thì nói "đang đánh giá, chốt sau khi có bằng chứng spike". Giảng
   viên hỏi lại được, và trả lời sai một lần thì mất tin cả buổi.
2. **Không phải phần mềm chẩn đoán.** Câu này phải xuất hiện sớm, không phải khi bị hỏi.
3. **Không chê sản phẩm tham chiếu.** Không nói "3D Slicer/cvi42 không có tính năng này" — nhóm không
   kiểm chứng được câu đó, và cũng không cần nó để nêu khác biệt.

Danh sách đầy đủ những câu **không được nói** nằm cuối `APP_CONSULTATION_ONE_PAGE.md`.

## Nguồn của mọi con số trong gói

Toàn bộ nội dung lấy từ spec đóng băng `docs/specs/v1.0/**`, quyết định đã duyệt trong
`management/readiness/OPEN_DECISIONS.md`, và trạng thái hiện tại trên `main`. Hai sản phẩm tham chiếu được
kiểm từ trang chính thức và từ cơ sở dữ liệu thiết bị của FDA — nguồn ghi ngay trong
`APP_CONSULTATION_QA.md`.

**Gói này không tạo ra yêu cầu mới và không sửa gì trong `docs/specs/v1.0/**`.**
