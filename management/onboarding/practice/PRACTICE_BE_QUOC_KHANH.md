# PRACTICE — Bế Quốc Khánh

> Day-0 Git drill practice file. See [README.md](README.md) for the required-field list.

- **Role:** Tôi chịu trách nhiệm chính cho V3 Experiment/Cohort và khối ML Training/Evaluation; trước mắt tôi giữ Spike D (P0), sau đó mới đến Spike C0/C1.
- **Mobile vertical:** V3 giúp so sánh các experiment theo họ model và lượng dữ liệu, xem thống kê cohort, tìm outlier rồi đi sâu sang case explorer để kiểm tra ca cụ thể.
- **Technical block:** Khối ML của tôi nằm ngay sau dataset audit và patient-level split. Nó tạo checkpoint, `RawPredictionMask` bất biến và các metric cấp case/slice/cohort cho geometry, ingestion, giao diện và báo cáo.
- **Current spike:** Spike D — lấy đúng gói LASC 2018 từ nguồn chính thức, kiểm tra provenance, inventory, NRRD, label semantics, privacy và geometry để tạo bằng chứng cho `GATE-DATA-01`; Day 0 chỉ chuẩn bị tooling, chưa tải gói hay chạy spike.
- **Spikes I review, in priority order:** Không có spike nào trong wave hiện tại; WIP của tôi dành cho Spike D P0. Vũ Hùng Anh là reviewer của Spike D và Spike C0/C1 của tôi.
- **A conflict between two frozen spec files — where I escalate, and what I must open:** Tôi dừng thay đổi, báo Phạm Tuấn Anh/spec owner, rồi mở Decision Request kèm phân tích ảnh hưởng; không tự chọn một cách hiểu hoặc sửa spec/code trước khi được duyệt.
- **Reviewer:** Nguyễn Gia Đức Trung.
