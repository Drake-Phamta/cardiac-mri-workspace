# -*- coding: utf-8 -*-
"""
Build APP_CONSULTATION_SCRIPT.docx - the full spoken script for the APP-course
consultation on 2026-09-23.

Content lives here (not in a second Markdown file) so that it is reviewable in
`git diff`: the .docx itself is binary and cannot be diffed.

Relationship to the other files in this folder:
  APP_CONSULTATION_SPEAKER_SCRIPT.md  bullet cues, for rehearsing
  APP_CONSULTATION_SCRIPT.docx        full sentences, for holding while speaking
  APP_CONSULTATION_QA.md              all 22 questions in full; this doc carries
                                      a shortened subset attached to each slide

Every fact here is already in the approved package (commit d742414). This script
adds no new facts.

Run:  python build_script_docx.py
"""

import re
import sys
import os

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# --------------------------------------------------------------------------
# Inline markup: **bold**.  A script paragraph starting with "~" is a sentence
# that can be dropped if the team is running out of time; it is rendered with a
# visible marker and excluded from the spoken word count.
# --------------------------------------------------------------------------

FONT = "Calibri"
INK = RGBColor(0x1A, 0x1A, 0x1A)
NAVY = RGBColor(0x14, 0x3D, 0x66)
MUTED = RGBColor(0x5A, 0x5A, 0x5A)
RULE = RGBColor(0x8A, 0x8A, 0x8A)

TITLE = "KỊCH BẢN THUYẾT TRÌNH"
SUBTITLE = "AI-assisted Cardiac MRI Research Workspace"
OCCASION = "Buổi tư vấn BTL môn APP · 09:00 ngày 23/09/2026 · 6 slide, khoảng 12 phút nói"

# Page ranges are read back from the built document with Word and pasted here;
# re-check them after any edit that changes length (see README).
TEAM = [
    ("Phạm Tuấn Anh", "Mở đầu · Slide 1 · Slide 2 · Slide 6 và chốt",
     "khoảng 5 phút 30", "trang 2–4, 12–14"),
    ("Bế Quốc Khánh", "Slide 3 — dữ liệu và câu hỏi nghiên cứu",
     "khoảng 2 phút 50", "trang 5–6"),
    ("Nguyễn Gia Đức Trung", "Slide 4 — ngăn xếp công nghệ",
     "khoảng 1 phút 40", "trang 7–8"),
    ("Vũ Hùng Anh", "Slide 4 phần 3D · Slide 5 — sản phẩm tham chiếu",
     "khoảng 2 phút 50", "trang 9–11"),
]

HOWTO = [
    "Mỗi phần bắt đầu ở một trang mới — in đúng dải trang của mình là đủ, không cần cả tập.",
    "Phần LỜI THOẠI đọc thẳng ra tiếng được. Chữ in đậm là chỗ không được nói sai; "
    "còn lại cứ nói bằng lời của mình.",
    "Hai mục NẾU THẦY HỎI NGAY và SỐ LIỆU DỰ PHÒNG chỉ dùng khi bị hỏi — không đọc trong lúc trình bày.",
    "Câu đánh dấu [bỏ được nếu thiếu giờ] là câu duy nhất trong phần đó được phép cắt "
    "mà không mất lập luận.",
]

# --------------------------------------------------------------------------
# The seven spoken blocks, in the order they are said.
# --------------------------------------------------------------------------

BLOCKS = [
    {
        "heading": "MỞ ĐẦU + SLIDE 1 — Vấn đề và mục đích",
        "speaker": "Phạm Tuấn Anh",
        "budget": "khoảng 2 phút",
        "script": [
            "Em chào thầy ạ. Nhóm em bốn thành viên, đề tài là một **workspace nghiên cứu ảnh MRI tim "
            "có hỗ trợ AI**. Em xin bắt đầu bằng vấn đề, vì chính nó quyết định hình hài cả sản phẩm.",

            "Khi huấn luyện xong một mô hình phân vùng, thứ nhận được ở cuối thường chỉ là **một con "
            "số** — ví dụ Dice trung bình 0,85. Con số đó cho biết mô hình tốt đến mức nào, "
            "nhưng **không cho biết nó sai ở đâu**: sai trên ca nào, lát cắt nào, sai kiểu gì. Muốn biết "
            "thì phải mở notebook, viết code vẽ lại, lục từng file — mỗi lần xem một ca là một lần làm "
            "thủ công, nên thực tế ít ai làm.",

            "Vì vậy sản phẩm của nhóm em **không phải một ứng dụng phân vùng MRI** — phân vùng chỉ là một "
            "mắt xích ở giữa. Cái nhóm em xây là một **không gian làm việc để điều tra**: từ kết quả thí "
            "nghiệm xuống tới từng pixel, xem lỗi nằm ở đâu, rồi cho sửa lại.",

            "Câu hỏi dẫn đường của cả sản phẩm là câu trên slide: **“Vì sao AI sai trên ca MRI này, và "
            "nhà nghiên cứu làm được gì với nó?”**",

            "Hai điều em xin nói rõ ngay. Thứ nhất, người dùng là **nhà nghiên cứu hoặc sinh viên nghiên "
            "cứu**; đặc tả ghi rõ không giả định họ là bác sĩ. Thứ hai, **đây không phải phần mềm chẩn "
            "đoán** — nó không đưa ra kết luận y khoa nào, và đó là ràng buộc ghi trong đặc tả.",
        ],
        "qa": [
            ("Người dùng của app này chính xác là ai?",
             "Nhà nghiên cứu hoặc sinh viên nghiên cứu đang làm về phân vùng ảnh y tế. Họ đã có mô hình "
             "và đã có kết quả, cái họ cần là hiểu mô hình sai ở đâu. Đặc tả của nhóm em ghi rõ người "
             "dùng không được giả định là bác sĩ có chứng chỉ hành nghề."),
            ("Đây có phải ứng dụng chẩn đoán không?",
             "Dạ không. Đặc tả ghi sản phẩm dành cho nghiên cứu và học tập, không dùng cho chẩn đoán hay "
             "quyết định điều trị, và giao diện không được đưa ra bất kỳ tuyên bố nào ngụ ý đã qua kiểm "
             "định lâm sàng. Chẩn đoán, khuyến nghị điều trị và tích hợp hệ thống bệnh viện đều nằm ngoài "
             "phạm vi ngay từ đầu."),
            ("Vì sao làm trên điện thoại chứ không phải desktop hay web?",
             "Vì bối cảnh dùng khác nhau. Huấn luyện và phân tích nặng vẫn ở máy tính; nhưng việc xem lại, "
             "đối chiếu và đánh dấu một ca thì thường xảy ra lúc không ngồi trước máy. Và về mặt môn học, "
             "làm mobile buộc nhóm em phải giải những bài toán thật: bộ nhớ có hạn, thao tác chạm, hiệu "
             "năng 3D trên GPU di động — những thứ trên desktop không lộ ra."),
        ],
        "facts": [
            ("Câu north-star, nguyên văn",
             "“Why did the AI fail on this MRI, and what can the researcher do about it?”"),
            ("Câu giá trị ngắn nhất", "“From MRI slices to understandable AI.”"),
            ("Người dùng, nguyên văn trong đặc tả",
             "Researcher / Research Student — “not assumed to be a licensed clinician”"),
            ("Câu miễn trừ, nguyên văn",
             "“The MVP is for research/education and model investigation. It is not intended for "
             "clinical diagnosis or treatment decisions.”"),
            ("Bài toán ảnh", "Phân vùng tâm nhĩ trái (left atrium) trên ảnh LGE MRI tim"),
        ],
    },

    {
        "heading": "SLIDE 2 — Luồng làm việc và năm nhóm tính năng",
        "speaker": "Phạm Tuấn Anh",
        "budget": "khoảng 1 phút 50",
        "script": [
            "Đây là luồng làm việc chính. Người dùng đi theo một chuỗi: **thí nghiệm → nhóm ca → một ca → "
            "một lát cắt → vùng lỗi → xem ở 3D → rồi sửa**.",

            "Cụ thể: từ bảng so sánh thí nghiệm, thấy một ca kém thì mở ra, lật tới lát cắt có vấn đề, bật "
            "lớp phủ xem AI sai chỗ nào so với nhãn thật, sang 3D xem lỗi nằm ở đâu, rồi quay lại 2D để "
            "sửa. Điểm quan trọng là **cả chuỗi nằm trong một ứng dụng**, không phải năm công cụ rời.",

            "Gom lại thì sản phẩm có **năm nhóm tính năng**.",

            "Một — **so sánh thí nghiệm và nhóm ca**: đặt UNet cạnh DINOv2, xem phân bố, lần xuống những "
            "ca kém nhất.",

            "Hai — **trình duyệt ảnh MRI 2D**: lật lát cắt, bật tắt lớp phủ dự đoán / nhãn thật / vùng lỗi, "
            "zoom và kéo ảnh.",

            "Ba — **liên kết 2D và 3D**: dựng lại tâm nhĩ trái ở dạng khối; chọn một vùng trên khối thì hệ "
            "thống đưa về **đúng lát cắt nguồn**. 3D ở đây để **phân tích**, không phải cho đẹp.",

            "Bốn — **con người xem lại và sửa**: chấp nhận, gắn cờ, hoặc dùng cọ sửa vùng sai; **dự đoán "
            "gốc của AI không bị ghi đè**.",

            "Năm — **ghi nhận phát hiện**: mỗi quan sát gắn với đúng thí nghiệm, ca, lát cắt và vùng, để "
            "sau mở lại vẫn truy được.",

            "Em xin chuyển sang phần nghiên cứu, bạn Khánh phụ trách ạ.",
        ],
        "qa": [
            ("Vì sao cần 3D, xem từng lát cắt 2D không đủ à?",
             "Vì lỗi phân vùng có cấu trúc không gian mà nhìn từng lát cắt không thấy được — ví dụ mô hình "
             "cắt cụt một đoạn thành nhĩ, trên mỗi lát chỉ thấy thiếu một ít, nhưng nhìn cả khối thì thấy rõ "
             "cả vùng bị mất. Và 3D ở đây có chiều ngược lại: chọn một vùng trên khối thì hệ thống đưa về "
             "đúng lát cắt nguồn để xem bằng chứng gốc."),
            ("Người dùng sửa tay thì kết quả gốc của AI có mất không?",
             "Không ạ. Dự đoán gốc của mô hình là bất biến — mỗi lần lưu bản sửa sẽ tạo ra một phiên bản mới "
             "chứ không ghi đè lên bản gốc. Nhờ vậy vẫn so được người sửa cái gì so với máy, và vẫn tính lại "
             "được chỉ số trên bản gốc."),
            ("Năm nhóm tính năng này có làm hết trong một kỳ không?",
             "Nhóm em phân rõ cái gì bắt buộc và cái gì chỉ là nên có. Năm nhóm này là phần bắt buộc, mỗi "
             "nhóm có một người chịu trách nhiệm chính. Những màn hình phụ ngoài năm nhóm đó nhóm em xếp "
             "mức thấp hơn và chỉ làm nếu còn thời gian."),
        ],
        "facts": [
            ("Chuỗi drill-down, nguyên văn trong đặc tả",
             "cohort → experiment → case → slice → pixel/region → 3D anatomy"),
            ("Nhóm 1 — Experiment & Cohort", "Bế Quốc Khánh"),
            ("Nhóm 2 — 2D MRI Case Explorer", "Phạm Tuấn Anh"),
            ("Nhóm 3 — Linked 2D ↔ 3D", "Vũ Hùng Anh"),
            ("Nhóm 4 — Review / Correction", "Nguyễn Gia Đức Trung"),
            ("Nhóm 5 — Findings / Evidence", "Nguyễn Gia Đức Trung"),
            ("Tổng số màn hình", "9 màn hình; màn hình thứ 9 chỉ ở mức “nên có”, chưa chắc làm"),
            ("Không đọc trên slide", "mã màn hình và mã yêu cầu nội bộ — chỉ dùng khi thầy hỏi thẳng"),
        ],
    },

    {
        "heading": "SLIDE 3 — Thành phần nghiên cứu: dữ liệu và câu hỏi",
        "speaker": "Bế Quốc Khánh",
        "budget": "khoảng 2 phút 50",
        "script": [
            "Em chào thầy ạ. Em phụ trách phần dữ liệu và mô hình.",

            "Ngoài phần làm phần mềm, nhóm em có đặt ra một **câu hỏi nghiên cứu** hẳn hoi: **khi giảm "
            "lượng dữ liệu có nhãn xuống, một mô hình dựa trên DINOv2 có suy giảm ít hơn một UNet thường "
            "hay không?**",

            "Câu hỏi này đáng hỏi vì chi phí gán nhãn. Ảnh y tế không nhờ người ngoài gán được — phải người "
            "có chuyên môn ngồi khoanh tay từng lát cắt. Nếu một mô hình nền tảng, đã học sẵn đặc trưng ảnh "
            "từ lượng dữ liệu rất lớn, giúp giảm được số nhãn cần thiết, thì đó là điều rất đáng biết.",

            "Cách nhóm em trả lời là một ma trận **sáu lần huấn luyện**: hai mô hình — UNet và DINOv2 — nhân "
            "ba mức dữ liệu **25%, 50% và 100%**. Mấu chốt là các tập con **lồng nhau**: 25% nằm trọn trong "
            "50%, 50% nằm trọn trong 100%, cùng một seed, và **hai mô hình dùng đúng cùng một tập**. Nhờ vậy "
            "khác biệt đo được là do **lượng nhãn**, không phải do may rủi khi chia dữ liệu.",

            "Dữ liệu là bộ **LASC 2018** của Cardiac Atlas Project — **154 ca**, mỗi ca gồm một khối ảnh LGE "
            "MRI và một nhãn tâm nhĩ trái. Nhóm em đã tải gói chính thức và kiểm từng file. **Giao thức chia "
            "dữ liệu đang được hoàn tất**: nguyên tắc đã quyết — khoá lại một phần dữ liệu cho tới cuối, và "
            "loại những ca trùng lặp để không rò rỉ — bản chia cuối đang chờ nghiệm thu.",

            "Một điểm em xin nói thẳng: **nhóm em không đặt mục tiêu DINOv2 phải thắng.** Đặc tả có một yêu "
            "cầu bắt buộc ghi rằng thành công của đồ án **không phụ thuộc vào việc DINOv2 tốt hơn UNet**, và "
            "cấm lọc hay chỉnh bằng chứng để ép ra kết quả mong muốn. **Kết quả âm, đo đúng giao thức, vẫn "
            "là kết quả hợp lệ.**",

            "~Còn một câu hỏi phụ: bước **hậu xử lý hình thái** sau khi mô hình chạy cải thiện hay làm hại "
            "kết quả. Cái này cũng để mở.",

            "Em xin chuyển cho bạn Trung nói phần công nghệ ạ.",
        ],
        "qa": [
            ("Đóng góp của AI ở đây là gì?",
             "Có hai phần. Một là mô hình phân vùng tâm nhĩ trái từ ảnh LGE MRI — phần tạo ra dự đoán. Hai là "
             "câu hỏi nghiên cứu: so sánh một mô hình dựa trên nền tảng thị giác DINOv2 với một UNet thường, "
             "xem cái nào chịu được việc giảm dữ liệu có nhãn tốt hơn. Phần hai mới là đóng góp nghiên cứu; "
             "phần một là công cụ."),
            ("Vì sao chọn DINOv2?",
             "Vì nó là mô hình nền tảng đã được huấn luyện tự giám sát trên lượng ảnh rất lớn, nên giả thuyết "
             "là đặc trưng nó học được giúp cần ít nhãn hơn cho tác vụ xuôi dòng. Trong ảnh y tế nhãn rất đắt, "
             "nên nếu giả thuyết đó đúng thì đáng biết. Nhóm em kiểm tra giả thuyết chứ không giả định nó đúng."),
            ("Nếu DINOv2 tệ hơn UNet thì sao?",
             "Thì nhóm em báo cáo đúng như vậy, và đó vẫn là kết quả hợp lệ. Trong đặc tả có một yêu cầu bắt "
             "buộc ghi rằng thành công của đồ án không được phụ thuộc vào việc DINOv2 thắng, và cấm chỉnh sửa "
             "hay lọc bằng chứng để ép ra kết quả mong muốn."),
            ("Dữ liệu lấy từ đâu, có bao nhiêu?",
             "Bộ LASC 2018 / Atria Segmentation Data, tải từ trang chính thức của Cardiac Atlas Project, gồm "
             "154 ca. Mỗi ca có một khối ảnh LGE MRI và một nhãn tâm nhĩ trái. Nhóm em đã tải gói chính thức, "
             "ghi lại mã băm của gói, và kiểm từng file trước khi dùng. Dữ liệu công khai và đã khử định danh."),
            ("Làm sao chống rò rỉ dữ liệu giữa train và test?",
             "Ba lớp, nguyên tắc đã quyết và bản chia cuối đang chờ nghiệm thu. Một, phần dữ liệu đánh giá được "
             "khoá lại, không dùng để chọn mô hình. Hai, nhóm em phát hiện hai ca thực chất là cùng một lần chụp "
             "xuất ra hai lần — nhãn trùng nhau từng byte — nên gộp làm một nhóm và ghim cả hai vào phía huấn "
             "luyện. Ba, gói dữ liệu không có bảng ánh xạ ca sang bệnh nhân, nên nhóm em không thể khẳng định "
             "tách theo bệnh nhân; thay vào đó chạy sàng lọc tương đồng ảnh và loại những ca giống nhau vượt "
             "ngưỡng ra khỏi tập huấn luyện. Giới hạn này được ghi rõ bên cạnh mọi con số đánh giá, không giấu."),
            ("Nhóm có tái lập được kết quả của bài báo gốc không?",
             "Không, và nhóm em không tuyên bố điều đó. Bài báo gốc dùng một bộ dữ liệu khác mà nhóm em không "
             "có quyền truy cập. Nhóm em lấy giả thuyết từ bài báo nhưng đo trên LASC 2018, nên kết quả phải "
             "được đọc là “kết quả trên LASC 2018 theo giao thức của nhóm”."),
            ("Dữ liệu bệnh nhân thật thì có vấn đề đạo đức không?",
             "Là dữ liệu bệnh nhân thật nhưng đã khử định danh và công bố công khai phục vụ nghiên cứu, thông "
             "qua một challenge khoa học. Nhóm em dùng đúng gói chính thức, không tự thu thập, không xử lý dữ "
             "liệu định danh, và không hiển thị thông tin nhận dạng nào trong ứng dụng."),
        ],
        "facts": [
            ("Câu hỏi nghiên cứu, nguyên văn",
             "“Does a DINOv2-based segmentation model degrade less than a conventional UNet baseline as the "
             "amount of labeled training data is reduced?”"),
            ("Bộ dữ liệu", "LASC 2018 / Atria Segmentation Data — Cardiac Atlas Project, 154 ca"),
            ("Mỗi ca gồm", "một khối ảnh LGE MRI và một nhãn tâm nhĩ trái, định dạng NRRD"),
            ("Ma trận thí nghiệm", "2 mô hình (UNet, DINOv2) × 3 mức nhãn (25% / 50% / 100%) = 6 lần chạy"),
            ("Điều kiện so sánh công bằng",
             "tập con lồng nhau, cùng seed, hai mô hình dùng đúng cùng một tập ca"),
            ("Câu chặn nói quá, nguyên văn trong đặc tả (yêu cầu bắt buộc)",
             "“Project success and reporting shall not require DINOv2 to outperform UNet… including a "
             "null/negative result, rather than tuning or filtering evidence to force the reference-paper "
             "direction.”"),
            ("Ca trùng lặp", "hai ca có nhãn trùng nhau từng byte → gộp một nhóm, ghim vào phía huấn luyện"),
            ("Giới hạn đã công bố",
             "gói dữ liệu không có bảng ánh xạ ca → bệnh nhân, nên không khẳng định được tách theo bệnh nhân; "
             "thay bằng sàng lọc tương đồng ảnh"),
            ("Câu hỏi phụ", "hậu xử lý hình thái cải thiện hay làm hại kết quả — để mở, không giả định"),
            ("⚠ Chưa được nói",
             "chưa có con số Dice nào — nhóm chưa chạy lần huấn luyện nào; và chưa nói tỉ lệ chia cụ thể vì "
             "bản chia cuối chưa nghiệm thu"),
        ],
    },

    {
        "heading": "SLIDE 4 — Ngăn xếp công nghệ (phần chính)",
        "speaker": "Nguyễn Gia Đức Trung",
        "budget": "khoảng 1 phút 40",
        "script": [
            "Em chào thầy ạ. Em phụ trách backend, lưu trữ và phần review. Em xin điểm nhanh công nghệ "
            "theo nhóm.",

            "**Ứng dụng** nhắm **Android**; ứng viên đang dựng thử là **React Native và Expo**, đã chạy "
            "được trên máy thật.",

            "**Phía học máy** là **Python** và **PyTorch** — một **UNet** làm mốc so sánh và một mô hình dựa "
            "trên **DINOv2**. Ảnh y tế ở định dạng **NRRD**.",

            "**Phần hiển thị** chia hai. 2D viết bằng **JavaScript thuần** trong React Native — zoom, kéo và "
            "cọ vẽ tự viết, vì cần kiểm soát chính xác một cú chạm rơi vào pixel nào. 3D dùng **WebGL2, "
            "không thư viện**.",

            "**Hạ tầng**: một **Mac mini M2 24 GB** làm máy chủ; điện thoại nối vào qua **Wi-Fi** và mạng "
            "riêng có xác thực dựng bằng **ZeroTier**. Mã nguồn và kiểm thử tự động trên **GitHub Actions**.",

            "Có **ba chỗ nhóm em chưa chốt**, em xin nói thẳng: **framework di động**, **framework backend** "
            "— hiện mới có hợp đồng API và công cụ dòng lệnh Python — và **thư viện 3D**. Cả ba chốt khi có "
            "đủ số đo trên máy thật.",

            "Cuối cùng, phần review em phụ trách: khi người dùng sửa bằng cọ, **dự đoán gốc của mô hình "
            "không bị ghi đè** — mỗi lần lưu tạo một phiên bản mới, truy vết được.",
        ],
        "qa": [
            ("App di động sẽ dùng công nghệ gì?",
             "Nhắm nền tảng Android. Ứng viên đang dựng thử là React Native + Expo, đã chạy thật trên máy "
             "Samsung Galaxy A17 5G. Phần hiển thị 2D — zoom, kéo, cọ vẽ — nhóm em tự viết bằng JavaScript "
             "thuần thay vì dùng thư viện, vì cần kiểm soát chính xác việc chạm nào rơi vào pixel nguồn nào. "
             "Framework cuối cùng chưa được chọn, sẽ chốt sau khi có đủ số đo của cả phần 2D và 3D."),
            ("Backend dùng framework gì?",
             "Nhóm em chưa chọn framework backend. Hiện có hai thứ đã tồn tại: một hợp đồng API viết bằng JSON "
             "Schema, và các công cụ dòng lệnh bằng Python để nạp dữ liệu và kiểm tính hợp lệ. Việc chọn "
             "framework web để lại tới khi bắt đầu hiện thực hoá API — chọn sớm mà chưa biết hình dạng dữ liệu "
             "thì dễ phải làm lại."),
            ("Lưu trữ bằng cơ sở dữ liệu gì?",
             "Hiện tại chưa dùng cơ sở dữ liệu. Dữ liệu và kết quả mô hình được mô tả bằng các tệp JSON manifest "
             "có đánh phiên bản, mỗi tệp ghi nguồn gốc và mã băm của thứ nó trỏ tới. Với quy mô 154 ca và một "
             "số ít lần chạy thí nghiệm thì cách này đủ và dễ kiểm chứng hơn. Nếu sau cần truy vấn phức tạp thì "
             "mới thêm cơ sở dữ liệu."),
            ("Vì sao chưa chọn xong framework?",
             "Vì hai yêu cầu quan trọng nhất đều là yêu cầu hiệu năng trên máy thật: lật lát cắt phải dưới một "
             "ngưỡng thời gian, và 3D phải giữ được khung hình tối thiểu. Chọn framework theo cảm tính rồi phát "
             "hiện không đạt thì phải làm lại từ đầu. Nên nhóm em dựng một ứng viên, đo trên máy thật, và chỉ "
             "chốt khi có số. Phần 2D đã có số đo, phần 3D đang đo nốt."),
            ("Điện thoại kết nối với backend thế nào?",
             "Điện thoại nối Internet qua Wi-Fi, vào một mạng riêng có xác thực dựng bằng ZeroTier, rồi mới tới "
             "Mac mini M2 24 GB đặt ở xa. Máy chủ không phơi ra Internet công cộng; chỉ thiết bị đã được cấp "
             "quyền vào mạng riêng mới gọi được API. Nhóm em có thử đường 4G/5G và đo được là quá chậm cho việc "
             "tải khối ảnh, nên đường chuẩn là Wi-Fi."),
            ("Nếu mất mạng lúc demo thì sao?",
             "Nhóm em coi đó là rủi ro phải chuẩn bị chứ không phải chuyện xui. Kiểm tra đường truyền tại chỗ "
             "trước buổi demo; dữ liệu và kết quả dùng cho demo là artifact đã tính sẵn, không phải chạy mô hình "
             "tại chỗ; và ứng dụng có trạng thái “không kết nối được, thử lại” rõ ràng thay vì treo hoặc hiện "
             "màn hình trắng. Nhóm em cũng giữ phương án trình bày bằng bản ghi màn hình nếu mạng tại chỗ không đạt."),
        ],
        "facts": [
            ("Ứng dụng", "Android · React Native + Expo 57 · React 19 — đang đánh giá, chưa chốt"),
            ("Học máy", "Python · PyTorch · NumPy · UNet · DINOv2"),
            ("Backbone DINOv2", "Hugging Face transformers (Dinov2Model) + safetensors"),
            ("Ảnh y tế", "định dạng NRRD, đọc bằng thư viện pynrrd 1.1.3"),
            ("Hiển thị 2D", "JavaScript thuần trong React Native; zoom / kéo / cọ tự viết, không thư viện"),
            ("Hiển thị 3D", "WebGL2 viết tay, không thư viện 3D; mesh xuất ra định dạng OBJ"),
            ("Backend", "chưa chốt framework — hiện có hợp đồng API bằng JSON Schema và CLI Python"),
            ("Lưu trữ", "JSON manifest có đánh phiên bản, ghi nguồn gốc và mã băm; chưa dùng cơ sở dữ liệu"),
            ("Máy chủ", "Mac mini M2, 24 GB RAM, đặt ở xa — không huấn luyện mô hình trên máy này"),
            ("Mạng", "Wi-Fi → mạng riêng có xác thực ZeroTier → Mac mini. Không phơi ra Internet công cộng."),
            ("Thiết bị demo", "Samsung Galaxy A17 5G (SM-A176B), Android 16, GPU Mali-G68"),
            ("Git / CI", "GitHub · GitHub Actions, chạy kiểm thử tự động mỗi lần có thay đổi"),
            ("⚠ Ba chỗ chưa chốt", "framework di động · framework backend · thư viện 3D"),
        ],
    },

    {
        "heading": "SLIDE 4 — Xen vào phần 3D",
        "speaker": "Vũ Hùng Anh",
        "budget": "khoảng 40 giây",
        "script": [
            "Em xin bổ sung dòng 3D ạ. Nhóm em dựng mesh từ mask rồi hiển thị bằng **WebGL2**. Ràng buộc khó "
            "nhất ở đây không phải là vẽ cho mượt, mà là: khi người dùng **chạm vào một điểm trên khối 3D**, "
            "hệ thống phải trả về **đúng lát cắt nguồn** của điểm đó, sai lệch cho phép **tối đa một lát**.",

            "~Muốn chạy mượt trên điện thoại thì phải giảm số tam giác của mesh, nhưng giảm nhiều quá thì vị "
            "trí lệch đi. **Ngưỡng giảm bao nhiêu là vừa thì nhóm em chưa chốt** — đang đo trên máy thật.",
        ],
        "qa": [
            ("Phần 3D dùng thư viện gì — Three.js à?",
             "Không dùng thư viện 3D nào. Hiện là WebGL2 viết tay, mesh xuất ra định dạng OBJ. Lý do là phần đo "
             "này cần biết chính xác chi phí vẽ và độ chính xác khi chạm vào mesh — một thư viện sẽ thêm một "
             "tầng mà nhóm em không kiểm soát được, làm số đo khó quy trách nhiệm. Có dùng thư viện hay không "
             "thì chưa chốt; nếu về sau cần tính năng phức tạp hơn thì cân nhắc lại."),
            ("Mesh dựng bằng thuật toán gì?",
             "Hiện nhóm em dựng mesh bằng cách trích mặt của các voxel thuộc vùng phân vùng, rồi giảm số tam "
             "giác xuống cho chạy được trên điện thoại. Đây là lựa chọn của giai đoạn đo, chưa phải quyết định "
             "cuối — cái nhóm em cần biết trước tiên là chi phí vẽ và sai số khi chạm."),
        ],
        "facts": [
            ("Công nghệ 3D", "WebGL2 viết tay, không thư viện; mesh định dạng OBJ"),
            ("Ràng buộc chính xác",
             "chạm vào khối 3D phải trả về đúng lát cắt nguồn — sai lệch cho phép tối đa 1 lát cắt"),
            ("Đánh đổi đang đo", "giảm tam giác để chạy mượt ↔ giảm nhiều thì lệch vị trí"),
            ("Chưa chốt", "ngân sách mesh (số tam giác tối đa) và việc có dùng thư viện 3D hay không"),
            ("Hệ toạ độ chung", "x = cột, y = hàng, z = lát cắt — đã chốt và có kiểm tra tự động trong CI"),
        ],
    },

    {
        "heading": "SLIDE 5 — Sản phẩm tham chiếu",
        "speaker": "Vũ Hùng Anh",
        "budget": "khoảng 2 phút 10",
        "script": [
            "Em xin nói tiếp phần sản phẩm tham chiếu. Nhóm em nghiên cứu hai sản phẩm, học từ mỗi cái một "
            "thứ khác nhau.",

            "**3D Slicer** là nền tảng mã nguồn mở để xem và phân tích ảnh y sinh, chạy trên desktop. Cái nhóm "
            "em học ở đây là **quy trình phân vùng** và **cách liên kết 2D với 3D** — người dùng làm việc trên "
            "từng lát cắt nhưng vẫn thấy được hình khối. Một điểm đáng chú ý: chính tài liệu của 3D Slicer ghi "
            "rằng phần mềm **không được duyệt cho sử dụng lâm sàng và dành cho mục đích nghiên cứu**. Sản phẩm "
            "của nhóm em cũng được giới hạn ở nghiên cứu/học tập, **nhưng nhóm không coi hai sản phẩm là tương "
            "đương về phạm vi, mức độ trưởng thành hay validation**.",

            "**cvi42** thì khác hẳn: phần mềm thương mại để đọc và báo cáo ảnh tim mạch, và là **thiết bị y tế "
            "được cơ quan quản lý cấp phép**, dùng theo kê đơn. Nhóm em **không** so mình với nó về năng lực y "
            "khoa. Cái nhóm em học từ cvi42 là **cách tổ chức thông tin**: lớp phủ đặt cạnh ảnh gốc thế nào để "
            "vẫn nhìn rõ ảnh, bảng số đặt ở đâu, và làm sao màn hình dày đặc thông tin mà người chuyên môn "
            "vẫn đọc được.",

            "Em xin nói rõ: đây là **tham khảo cách bố trí và quy trình**, không sao chép giao diện, không dùng "
            "thương hiệu của họ, và **không tuyên bố sản phẩm của mình tương đương về mặt lâm sàng**. Nhóm em "
            "cũng không nói họ thiếu tính năng nào — đó là điều không kiểm chứng được.",

            "Em xin trả lại cho bạn Tuấn Anh ạ.",
        ],
        "qa": [
            ("Sản phẩm của nhóm khác gì so với 3D Slicer hay cvi42?",
             "Nhóm em không nói họ thiếu gì — từng năng lực riêng lẻ họ đều có và thường tốt hơn. Khác biệt nằm "
             "ở cách ghép: một chuỗi liền mạch từ kết quả thí nghiệm xuống vùng lỗi trên lát cắt, qua 3D, rồi "
             "tới thao tác sửa, và chạy trên điện thoại. 3D Slicer là nền tảng desktop đa dụng; cvi42 là phần "
             "mềm lâm sàng chạy trên máy trạm và web. Sản phẩm của nhóm em là workspace điều tra lỗi AI, "
             "mobile-first, dùng cho nghiên cứu."),
            ("Vì sao không dùng luôn 3D Slicer rồi viết plugin?",
             "Đó là một hướng hợp lý cho môi trường desktop, và 3D Slicer có hơn 150 extension. Nhưng đề tài "
             "của nhóm em đặt ra là workspace trên điện thoại, mà 3D Slicer là phần mềm desktop. Ngoài ra nhóm "
             "em muốn tự giải bài toán liên kết 2D–3D và bài toán hiệu năng trên thiết bị di động — đó chính là "
             "phần học thuật của môn này."),
            ("Có công cụ nào so sánh thí nghiệm ML giống nhóm không?",
             "Có, nhưng ở mảng khác. MLflow hay Weights & Biases làm rất tốt việc ghi và so sánh các lần chạy; "
             "MONAI Label thì gắn mô hình y tế vào công cụ khoanh vùng như 3D Slicer. Điểm nhóm em làm khác là "
             "nối bảng so sánh thí nghiệm thẳng xuống bằng chứng ảnh của từng ca, trong cùng một ứng dụng — "
             "thường thì hai việc đó nằm ở hai công cụ rời nhau."),
        ],
        "facts": [
            ("3D Slicer — là gì",
             "nền tảng mã nguồn mở xem và phân tích ảnh y sinh; giấy phép BSD; chạy Linux / macOS / Windows"),
            ("3D Slicer — câu nguyên văn (nguồn: tài liệu chính thức, mục About)",
             "“NOT approved for clinical use and the distributed application is intended for research use.”"),
            ("cvi42 — là gì", "phần mềm thương mại đọc và báo cáo ảnh tim mạch, của Circle Cardiovascular Imaging"),
            ("cvi42 — nền tảng", "máy trạm desktop + web viewer; không có bản mobile được nêu"),
            ("cvi42 — hạng mục pháp lý (nguồn: cơ sở dữ liệu định danh thiết bị của FDA)",
             "thiết bị y tế được quản lý ở Mỹ; GUDID DI 00882916000028; mã sản phẩm LLZ / QIH; nhiều số 510(k); "
             "dùng theo kê đơn (Rx)"),
            ("cvi42 — các module (nguồn: trang sản phẩm Cardiac MR)",
             "Function, Flow, Tissue characterization (T1/T2/T2*), Strain, 4D Flow, Quantitative Perfusion, "
             "Reporting, contour bằng AI"),
            ("⚠ Giới hạn phát biểu",
             "chỉ nói đúng những dòng trên. Không phát biểu gì thêm về hai sản phẩm này, không so hiệu năng, "
             "không nói họ thiếu tính năng nào."),
        ],
    },

    {
        "heading": "SLIDE 6 — Khác biệt, phạm vi, và chốt",
        "speaker": "Phạm Tuấn Anh",
        "budget": "khoảng 1 phút 50",
        "script": [
            "Phần cuối là điểm khác biệt, và em xin nói thận trọng.",

            "Nhóm em **không** nói rằng chưa có sản phẩm nào làm được những việc này. Từng năng lực riêng lẻ — "
            "xem ảnh, phân vùng, dựng 3D, sửa mask — **đều đã tồn tại**, và thường tốt hơn những gì một đồ án "
            "môn học làm được.",

            "Cái nhóm em đặt ra là **cách ghép chúng lại**: một chuỗi liền mạch từ **kết quả thí nghiệm** "
            "xuống **vùng lỗi trên một lát cắt**, qua **3D**, tới **thao tác sửa của con người** — và tất "
            "cả **trên điện thoại**.",

            "Bốn điểm cụ thể ạ. Thứ nhất, đi từ **bảng kết quả xuống tận bằng chứng ảnh**, không dừng ở biểu "
            "đồ. Thứ hai, trọng tâm là **điều tra lỗi của mô hình**, không phải trình bày dự đoán cho đẹp. Thứ "
            "ba, liên kết **2D và 3D là xác định** — chọn trên khối ra đúng lát cắt nguồn, không áng chừng. "
            "Thứ tư, **sửa tay không xoá dấu vết của AI** — dự đoán gốc giữ nguyên, bản sửa là phiên bản mới.",

            "Và thí nghiệm khan hiếm dữ liệu bạn Khánh vừa trình bày **nằm trong chính workspace đó**, "
            "không phải một notebook rời bên ngoài.",

            "Về phạm vi, nhóm em giữ thực tế: một MVP chạy trên **một thiết bị đã khai báo**, dùng **dữ liệu "
            "công khai**, **không** tích hợp hệ thống bệnh viện, **không** quy trình bệnh nhân, **không** "
            "chẩn đoán.",

            "Nhóm em xin hết phần trình bày, mong nhận được góp ý của thầy ạ.",
        ],
        "qa": [
            ("Mỗi thành viên phụ trách chức năng gì?",
             "Bốn người, mỗi người một mảng dọc của sản phẩm và một mảng kỹ thuật ngang. Phạm Tuấn Anh: Case "
             "Explorer 2D và Error Inspector, kiêm tích hợp, CI và hợp đồng chung. Vũ Hùng Anh: 3D và điều tra "
             "lỗi không gian, kiêm ảnh học và hình học. Bế Quốc Khánh: so sánh thí nghiệm và nhóm ca, kiêm huấn "
             "luyện và đánh giá ML. Nguyễn Gia Đức Trung: review / sửa tay và Findings, kiêm backend và lưu trữ."),
            ("Từng người có tự bảo vệ được phần của mình không?",
             "Có ạ. Mỗi người có một gói bằng chứng riêng ghi: yêu cầu nào thuộc về mình, thiết kế màn hình, "
             "phần code mình viết, và kết quả kiểm thử của phần đó. Ngoài ra mọi thay đổi đều đi qua pull request "
             "và phải có người khác duyệt — nên mỗi người vừa hiểu phần mình, vừa đã đọc phần của người khác."),
            ("Phạm vi này có quá lớn cho một đồ án môn học không?",
             "Đó là rủi ro nhóm em nhận diện từ đầu, nên có hai biện pháp. Một, phạm vi được đóng băng bằng văn "
             "bản và có danh sách rõ những thứ nằm ngoài: không chẩn đoán, không tích hợp bệnh viện, không quy "
             "trình bệnh nhân, một thiết bị duy nhất. Hai, những quyết định kỹ thuật rủi ro cao được tách thành "
             "các phần đo riêng làm trước — nếu một hướng không khả thi thì nhóm em biết sớm và đổi, chứ không "
             "phát hiện vào tuần cuối."),
        ],
        "facts": [
            ("Bốn điểm khác biệt",
             "xuống tận bằng chứng ảnh · trọng tâm điều tra lỗi · liên kết 2D↔3D xác định · sửa tay không ghi "
             "đè dự đoán gốc"),
            ("Cách diễn đạt an toàn",
             "khác biệt nằm ở CÁCH TÍCH HỢP, không phải ở chỗ “chưa ai làm được”"),
            ("Provenance khi sửa tay",
             "dự đoán gốc là bất biến; mỗi lần lưu tạo một phiên bản mask mới, không ghi đè bản gốc"),
            ("Nằm ngoài phạm vi",
             "chẩn đoán lâm sàng · khuyến nghị điều trị · tích hợp PACS / hệ thống bệnh viện · quy trình bệnh "
             "nhân · nhiều thiết bị"),
            ("Phạm vi MVP", "một thiết bị đã khai báo, dữ liệu công khai đã khử định danh"),
        ],
    },
]

# --------------------------------------------------------------------------
# Closing page: only spoken if the lecturer asks.
# --------------------------------------------------------------------------

CLOSING = {
    "heading": "NẾU THẦY HỎI: “ĐÃ LÀM ĐƯỢC GÌ RỒI?”",
    "speaker": "Phạm Tuấn Anh",
    "budget": "30–60 giây · chỉ nói khi được hỏi, không có slide cho phần này",
    "script": [
        "Dạ, hiện tại nhóm em đã xong phần nền ạ.",

        "Đặc tả sản phẩm và các **hợp đồng dùng chung** giữa bốn người đã định nghĩa xong — hợp đồng API, "
        "định dạng dữ liệu, và hệ toạ độ chung cho cả 2D lẫn 3D — và có kiểm tra tự động chạy trong CI mỗi "
        "lần có thay đổi.",

        "**Cổng dữ liệu đã nghiệm thu**: 154 ca đã tải về, kiểm từng file, và nguyên tắc chia dữ liệu chống "
        "rò rỉ đã được quyết và kiểm chứng độc lập.",

        "Hai phần đo **2D và 3D trên điện thoại thật** đang chạy — phần 2D đã có số đo trên máy và sắp tới "
        "điểm quyết định nền tảng. Mã sản phẩm cho các màn hình đang được tích hợp dần.",

        "Bước then chốt tiếp theo là **kiểm tra khả thi huấn luyện trên dữ liệu thật**, rồi mới chạy bộ thí "
        "nghiệm đầy đủ ạ.",
    ],
    "qa": [
        ("Hiện đã làm được đến đâu?",
         "Đặc tả và các hợp đồng dùng chung đã xong và có kiểm tra tự động. Cổng dữ liệu đã nghiệm thu — 154 ca "
         "đã kiểm từng file, cách chia dữ liệu đã quyết và được kiểm chứng độc lập. Hai phần đo trên điện thoại "
         "thật đang chạy, phần 2D đã có số. Mã sản phẩm cho các màn hình đang được tích hợp. Bước tới là kiểm "
         "tra khả thi huấn luyện trên dữ liệu thật rồi chạy bộ thí nghiệm đầy đủ."),
        ("Nhóm quản lý tiến độ và chất lượng thế nào?",
         "Mọi thay đổi đi qua pull request và phải có người khác duyệt trước khi vào nhánh chính; không ai tự "
         "duyệt phần của mình. Có kiểm thử tự động chạy trên mỗi thay đổi. Những quyết định kỹ thuật quan trọng "
         "được ghi lại bằng văn bản kèm bằng chứng, để sau này đọc lại biết vì sao chọn như vậy."),
    ],
    "facts": [
        ("⚠ Không đọc ra",
         "số phần trăm hoàn thành · số ngày còn lại · số yêu cầu đã nghiệm thu · tên cổng hay mã quyết định "
         "nội bộ"),
        ("Nếu thầy hỏi sâu hơn", "mở APP_CONSULTATION_QA.md — bản đầy đủ 22 câu"),
    ],
}


# --------------------------------------------------------------------------
# Rendering helpers
# --------------------------------------------------------------------------

def set_style_font(style, name=FONT, size=None, bold=None, color=None):
    if size is not None:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color
    style.font.name = name
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), name)


def add_runs(par, text):
    """Split **bold** markup into runs."""
    for i, chunk in enumerate(re.split(r"\*\*", text)):
        if not chunk:
            continue
        run = par.add_run(chunk)
        run.bold = (i % 2 == 1)


def spoken_words(text):
    """Word count of a script paragraph, markup stripped."""
    clean = text.lstrip("~").replace("**", "")
    return len(clean.split())


def make_styles(doc):
    styles = doc.styles
    set_style_font(styles["Normal"], size=10.5, color=INK)

    def new(name, size, **kw):
        st = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        st.base_style = styles["Normal"]
        set_style_font(st, size=size, bold=kw.get("bold"), color=kw.get("color", INK))
        pf = st.paragraph_format
        pf.space_before = Pt(kw.get("before", 0))
        pf.space_after = Pt(kw.get("after", 4))
        if "indent" in kw:
            pf.left_indent = Cm(kw["indent"])
        if "spacing" in kw:
            pf.line_spacing = kw["spacing"]
        pf.keep_together = kw.get("keep", False)
        # a heading or a question must never be the last line on a page
        pf.keep_with_next = kw.get("keep", False)
        return st

    new("XTitle", 26, bold=True, color=NAVY, after=2)
    new("XSubtitle", 14, color=MUTED, after=2)
    new("XMeta", 10.5, color=MUTED, after=14)
    new("XBlock", 15, bold=True, color=NAVY, before=0, after=2, keep=True)
    new("XWho", 10.5, color=MUTED, after=10, keep=True)
    new("XSection", 10, bold=True, color=NAVY, before=12, after=5, keep=True)
    new("XScript", 12, after=9, indent=0.35, spacing=1.35)
    new("XCut", 12, after=9, indent=0.35, spacing=1.35, color=MUTED)
    new("XQ", 10, bold=True, after=1, keep=True)
    new("XA", 10, after=7, indent=0.35)
    new("XCell", 9, after=0)
    new("XNote", 9.5, color=MUTED, before=6, after=2)


def horizontal_rule(par):
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "B4C4D4")
    pbdr.append(bottom)
    par._p.get_or_add_pPr().append(pbdr)


def shade(cell, hexcolor):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hexcolor)
    tcpr.append(shd)


def add_footer(doc):
    par = doc.sections[0].footer.paragraphs[0]
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = par.add_run("Kịch bản thuyết trình — BTL môn APP — 23/09/2026 — trang ")
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    run.font.name = FONT
    fld = par.add_run()
    fld.font.size = Pt(8)
    fld.font.color.rgb = MUTED
    fld.font.name = FONT
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    fld._r.append(begin)
    fld._r.append(instr)
    fld._r.append(end)


def add_fact_table(doc, facts):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    table.autofit = False
    for label, value in facts:
        row = table.add_row()
        for cell, text, bold in ((row.cells[0], label, True), (row.cells[1], value, False)):
            cell.width = Cm(5.2) if bold else Cm(11.6)
            par = cell.paragraphs[0]
            par.style = doc.styles["XCell"]
            run = par.add_run(text)
            run.bold = bold
            if bold:
                run.font.color.rgb = NAVY
        shade(row.cells[0], "F2F5F9")
    for row in table.rows:
        row.cells[0].width = Cm(5.2)
        row.cells[1].width = Cm(11.6)
    return table


def render_block(doc, block, first=False):
    head = doc.add_paragraph(style=doc.styles["XBlock"])
    if not first:
        head.paragraph_format.page_break_before = True
    head.add_run(block["heading"])

    who = doc.add_paragraph(style=doc.styles["XWho"])
    who.add_run("Người nói: ")
    r = who.add_run(block["speaker"])
    r.bold = True
    who.add_run("   ·   Thời lượng: " + block["budget"])
    horizontal_rule(who)

    doc.add_paragraph("LỜI THOẠI", style=doc.styles["XSection"])
    for text in block["script"]:
        if text.startswith("~"):
            par = doc.add_paragraph(style=doc.styles["XCut"])
            mark = par.add_run("[bỏ được nếu thiếu giờ]  ")
            mark.italic = True
            mark.font.size = Pt(9)
            add_runs(par, text[1:].strip())
        else:
            par = doc.add_paragraph(style=doc.styles["XScript"])
            add_runs(par, text)

    doc.add_paragraph("NẾU THẦY HỎI NGAY Ở SLIDE NÀY", style=doc.styles["XSection"])
    for question, answer in block["qa"]:
        q = doc.add_paragraph(style=doc.styles["XQ"])
        q.add_run("— " + question)
        a = doc.add_paragraph(style=doc.styles["XA"])
        add_runs(a, answer)

    doc.add_paragraph("SỐ LIỆU DỰ PHÒNG — chỉ dùng khi bị hỏi", style=doc.styles["XSection"])
    add_fact_table(doc, block["facts"])


def render_cover(doc):
    doc.add_paragraph(TITLE, style=doc.styles["XTitle"])
    doc.add_paragraph(SUBTITLE, style=doc.styles["XSubtitle"])
    meta = doc.add_paragraph(OCCASION, style=doc.styles["XMeta"])
    horizontal_rule(meta)

    doc.add_paragraph("AI NÓI PHẦN NÀO", style=doc.styles["XSection"])
    table = doc.add_table(rows=0, cols=4)
    table.style = "Table Grid"
    for name, part, dur, pages in TEAM:
        row = table.add_row()
        for cell, text, bold, width in (
            (row.cells[0], name, True, 4.2),
            (row.cells[1], part, False, 6.6),
            (row.cells[2], dur, False, 3.2),
            (row.cells[3], pages, True, 3.0),
        ):
            cell.width = Cm(width)
            par = cell.paragraphs[0]
            par.style = doc.styles["XCell"]
            run = par.add_run(text)
            run.bold = bold
            if bold:
                run.font.color.rgb = NAVY
        shade(row.cells[0], "F2F5F9")

    doc.add_paragraph("CÁCH DÙNG TẬP NÀY", style=doc.styles["XSection"])
    for line in HOWTO:
        par = doc.add_paragraph(style=doc.styles["XA"])
        par.paragraph_format.left_indent = Cm(0.6)
        par.paragraph_format.first_line_indent = Cm(-0.35)
        add_runs(par, "•  " + line)

    doc.add_paragraph(
        "Tập này là bản đầy đủ để cầm lúc nói. Bản gạch đầu dòng để tập nằm ở "
        "APP_CONSULTATION_SPEAKER_SCRIPT.md; bản đầy đủ 22 câu hỏi nằm ở APP_CONSULTATION_QA.md; "
        "slide nằm ở slides.html và slides.pdf.",
        style=doc.styles["XNote"],
    )


def build(path):
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    for attr in ("top_margin", "bottom_margin"):
        setattr(section, attr, Cm(1.8))
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    make_styles(doc)
    add_footer(doc)

    render_cover(doc)
    for block in BLOCKS:
        render_block(doc, block)
    render_block(doc, CLOSING)

    doc.save(path)


def report():
    """ASCII-only console output - the Windows console is not UTF-8."""
    keys = {
        "Phạm Tuấn Anh": "TuanAnh",
        "Bế Quốc Khánh": "Khanh",
        "Nguyễn Gia Đức Trung": "Trung",
        "Vũ Hùng Anh": "HungAnh",
    }
    # Budget per block, measured from APP_CONSULTATION_SPEAKER_SCRIPT.md before
    # this document was written. The rewrite must stay within +/-10% of it.
    budget = [255, 237, 365, 216, 95, 298, 261]

    per_speaker = {}
    total = 0
    cuttable = 0
    print("%-42s %-8s %6s %6s %6s %s" % ("block", "speaker", "words", "sec", "budget", "ok"))
    for block, target in zip(BLOCKS, budget):
        words = sum(spoken_words(t) for t in block["script"])
        cut = sum(spoken_words(t) for t in block["script"] if t.startswith("~"))
        total += words
        cuttable += cut
        who = keys[block["speaker"]]
        per_speaker[who] = per_speaker.get(who, 0) + words
        tag = "".join(c for c in block["heading"] if ord(c) < 128).strip()
        ok = "OK" if abs(words - target) <= target * 0.10 else "OUT OF RANGE"
        print("%-42s %-8s %6d %6d %6d %s%s"
              % (tag[:42], who, words, round(words / 2.3), target, ok,
                 ("   (-%d if cut)" % cut) if cut else ""))
    print("-" * 78)
    for who, words in per_speaker.items():
        print("%-51s %6d %6d" % (who, words, round(words / 2.3)))
    print("-" * 78)
    print("TOTAL spoken %d words = %d sec = %.2f min at 2.3 w/s"
          % (total, round(total / 2.3), total / 2.3 / 60))
    print("             %d sec = %.2f min at 2.8 w/s"
          % (round(total / 2.8), total / 2.8 / 60))
    short = total - cuttable
    print("IF BOTH CUTTABLE LINES DROPPED: %d words = %d sec = %.2f min at 2.3 w/s"
          % (short, round(short / 2.3), short / 2.3 / 60))
    print("BUDGET 1650-1800 words: %s" % ("OK" if 1650 <= total <= 1800 else "OUT OF RANGE"))
    extra = sum(spoken_words(t) for t in CLOSING["script"])
    print("EXTRA  closing answer, only if asked: %d words = %d sec"
          % (extra, round(extra / 2.3)))
    qa = sum(len(b["qa"]) for b in BLOCKS) + len(CLOSING["qa"])
    facts = sum(len(b["facts"]) for b in BLOCKS) + len(CLOSING["facts"])
    print("Q&A entries: %d   backup-fact rows: %d" % (qa, facts))
    return total


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "APP_CONSULTATION_SCRIPT.docx")
    build(out)
    report()
    print("WROTE %s (%d bytes)" % (os.path.basename(out), os.path.getsize(out)))
