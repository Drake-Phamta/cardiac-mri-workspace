# 07 — Giao diện

Giao diện theo hướng thiết kế A **"Clinical viewer"**: nền gần đen, ảnh MRI là trung tâm, một màu nhấn xanh cho thứ
đang chọn, đường kẻ 1 dp thay cho khung. Khung app và SCR-02, SCR-03, SCR-04 đã theo hướng này trên `main`; SCR-01 và
SCR-07 theo hướng này trên nhánh `v3/khanh-upgrades`; các màn hình còn lại đang được làm lại trên nhánh của từng người.
Trang này mô tả **thành phần, trạng thái, thao tác và điều hướng**, không mô tả màu hay bố cục pixel. Ở khung app và
SCR-01, SCR-02, SCR-03, SCR-04, SCR-07, chữ trong ngoặc kép là nhãn đúng như app hiện.
App chỉ chạy màn hình dọc. Mỗi màn hình có một dòng chừa sẵn cho đường dẫn ảnh chụp cuối cùng (chụp trên APK gộp).

## 1. Danh sách màn hình và điều hướng

| ID | Màn hình | Vào từ | Người phụ trách | Mức | Trạng thái |
|---|---|---|---|---|---|
| SCR-01 | Study Overview | Tab Study (gốc) | Bế Quốc Khánh | MUST | Đã có |
| SCR-02 | Case List (worklist) | Tab Cases, SCR-01 | Phạm Tuấn Anh | MUST | Đã có |
| SCR-03 | Case Explorer (xem MRI 2D) | SCR-02, SCR-01, SCR-07, SCR-05, SCR-08 | Phạm Tuấn Anh | MUST | Đã có |
| SCR-04 | Error Inspector | SCR-03 | Phạm Tuấn Anh | MUST | Đã có |
| SCR-05 | 3D Inspector | SCR-03, SCR-04 | Vũ Hùng Anh | MUST | Đã có |
| SCR-06 | Review / Correction | SCR-03, SCR-08 | Nguyễn Gia Đức Trung | MUST | Đã có |
| SCR-07 | Experiment Comparison | Tab Experiments, SCR-01, SCR-08 | Bế Quốc Khánh | MUST | Đã có |
| SCR-08 | Findings | Tab Findings, SCR-01, SCR-06 | Nguyễn Gia Đức Trung | MUST | Đã có |
| SCR-09 | Trạng thái lượt chạy phân tích | — | Cả nhóm | SHOULD | Hướng phát triển |

```mermaid
flowchart LR
  T1[Tab Study] --> S1[SCR-01]
  T2[Tab Cases] --> S2[SCR-02]
  T3[Tab Experiments] --> S7[SCR-07]
  T4[Tab Findings] --> S8[SCR-08]
  S1 --> S2 & S8
  S1 -->|một phép so sánh| S7
  S1 -->|ca Dice thấp| S3[SCR-03]
  S2 --> S3
  S7 -->|mở ca trong một run| S3
  S3 --> S4[SCR-04] & S5[SCR-05] & S6[SCR-06]
  S4 -->|lỗi 3D| S5
  S5 -->|Open in 2D| S3
  S6 -->|New finding here| S8
  S8 -->|Open evidence| S3
  S8 -->|Open evidence, finding chỉ gắn thí nghiệm| S7
  S8 -->|Review / correct| S6
```

Thành phần chung của mọi màn hình (khung app, Phạm Tuấn Anh):

- **Header** (56 dp): nút Back khi màn hình được mở từ màn hình khác; tên màn hình cho người đọc và dòng phụ
  "ca · run RUN · biến thể" (ở gốc một tab là "Study <mã study>"). Màn hình tự báo được tiêu đề, dòng phụ và nút riêng
  (`nav.setContext`); mã màn hình không hiện trên header. Bên phải: chỉ báo chế độ (một chấm và chữ "Live" hoặc
  "Fixture"), nút biểu tượng của màn hình (khiên privacy ở SCR-03, SCR-04), nút Info, và nút "more" khi màn hình có
  menu riêng.
- **Sheet Details** (nút Info): các mục của màn hình (mã, checksum, phiên bản, `z` của lát), rồi mục "This screen"
  ("Screen SCR-03 (V1)", "Mode LIVE · study …", "Contract …", "Build …") và nút "Clear cached images".
- **Chế độ FIXTURE**: chạm chữ "Fixture" mở bảng "Fixture scenarios" (chạm một endpoint để đổi kịch bản, "All default",
  "Close"); dưới header có banner "Generated contract fixtures: not patient data, not a backend. Tap Fixture to choose
  scenarios."
- **Khung viewer** (`CHROME.VIEWER`; trên `main` chỉ SCR-03 dùng): ảnh chiếm cả chiều cao, header nổi trên ảnh với một
  lớp tối phía trên, không có thanh tab. Ở LIVE header này không ghi chữ "Live"; ở FIXTURE vẫn ghi "Fixture" và không
  có banner.
- **Thanh 4 tab** dưới cùng: Study, Cases, Experiments, Findings, mỗi tab một biểu tượng và tên; tab đang chọn tô màu
  nhấn và có vạch ở mép trên. Nút Back (và phím back của Android) quay lại màn hình trước trong ngăn xếp.
- **7 trạng thái** dùng chung cho mọi vùng dữ liệu, tên trạng thái luôn viết thành chữ: đang tải (khung giữ chỗ,
  "Loading …"); đang xử lý ("Analysis is still running", không có phần trăm giả); thành công; không có dữ liệu
  ("Unavailable", nêu lý do); lỗi khôi phục được ("Something went wrong", nút "Retry"); dữ liệu sai bị chặn ("Cannot show
  this safely", kèm mã tham chiếu); bản cũ lệch phiên bản ("Version mismatch", nút "Refresh", không trộn dữ liệu hai
  run). Chi tiết thêm (mã HTTP, request id) gập dưới "Details (n)". Một màn hình lỗi khi vẽ chỉ chặn màn hình đó
  (`SCREEN_CRASHED`).
- **Lớp che phiên**: sau 5 phút ở nền hoặc 10 phút không chạm, màn hình bị che ("Screen hidden") và phím back không làm
  gì; nút "Show the screen" hiện lại, nút "Clear cached images" xoá cache.
- **Vùng chạm**: ở thành phần dùng chung, khung app và SCR-02, SCR-03, SCR-04, mọi nút, chip và dòng chạm được cao ít
  nhất 48 dp (`MIN_TOUCH`); phần nhìn thấy thấp hơn thì vùng chạm được nới thêm (`hitSlopFor`).

## 2. Từng màn hình

### SCR-01 — Study Overview (Bế Quốc Khánh)

- **Mục đích**: nhìn cả nghiên cứu trong một màn hình và đi xuống ca cần xem.
- **Thành phần** (từ trên xuống; chữ và đường kẻ, không có thẻ):
  - Dòng bộ dữ liệu: một hình vẽ 72 dp (hình minh hoạ, không phải ảnh MRI của ca nào), chữ "Dataset", tên bộ dữ liệu
    ("Dataset unavailable" khi server không nêu) và dòng nguồn "Atrial Segmentation Challenge, Cardiac Atlas Project" (ở
    FIXTURE là "Generated placeholder data"). Khi server trả study khác study app hỏi, phía trên có một dòng cảnh báo
    ("the server answered for … - shown, not relabelled").
  - Dòng "About this data" mở sheet cùng tên.
  - Dải ba ô: "Cases" (tổng số ca, chú thích "in this study"), "Findings" (số đang mở, chú thích "open"), "Resolved" (số
    đã xử lý, chú thích "findings"). Dưới dải là số ca theo chế độ ("1 evaluation", "1 inference & review").
  - Mục "Median Dice · UNet vs DINOv2", bên phải ghi "n of 3 comparable". Một dòng chú giải "0 to 1, higher is better"
    và khoá họ ("UNet" chấm tròn xanh, "DINOv2" tam giác cam). Ba dòng "25 % data", "50 % data", "100 % data", mỗi dòng
    có một thang 0 – 1 (vạch 0, 0.5, 1). Cặp mà server nói so sánh được thì thang có một chấm tròn UNet và một tam giác
    DINOv2 đặt ở Dice trung vị của mỗi bên, và bên phải ghi hai số ("0.655 · 0.685", UNet trước). Các cặp khác thì thang
    ghi "Not compared" và giá trị là "—", không có số. Dưới ba dòng có một câu: "No UNet vs DINOv2 pair is judged
    comparable yet." khi không cặp nào so sánh được, hoặc quần thể chung khi các cặp đã so sánh cùng một quần thể (ví dụ
    "Common population 5 cases").
  - Mục "Lowest Dice · <thí nghiệm>" (ví dụ "Lowest Dice · DINOv2 100 %"), bên phải ghi biến thể ("Raw"). Hàng chọn
    "Experiment" kèm tên thí nghiệm đang xem (chỉ có khi có hơn một thí nghiệm). Dưới đó là tối đa 3 dòng ca do server
    chọn, theo thứ tự của server: mã ca ẩn danh, một thanh dài bằng Dice (0 – 1), Dice 3 chữ số, mũi tên. Dice thiếu thì
    hiện "—" thay cho thanh; Dice ngoài 0 – 1 thì hiện số mà không vẽ thanh.
- **Mặc định**: danh sách "Lowest Dice" mở sẵn thí nghiệm DINOv2 ở tỉ lệ dữ liệu lớn nhất có danh sách, Raw trước
  Processed. Không có DINOv2 thì lấy thí nghiệm đầu tiên có danh sách; không thí nghiệm nào có danh sách thì lấy thí
  nghiệm đầu tiên và ghi lý do. Chạm hàng "Experiment" mở sheet "Lowest Dice of": mỗi thí nghiệm server liệt kê một dòng
  (thí nghiệm chưa có danh sách ghi "No lowest-Dice list"), dấu tích ở thí nghiệm đang xem; chọn một dòng thì đổi danh sách.
- **Sheet "About this data"**: chữ thường cho người đọc, gồm các mục "Where the data comes from" (bộ LASC 2018 tải từ
  trang Cardiac Atlas Project, kèm đường dẫn, câu "This is the LASC 2018 challenge data, not the later LAScarQS 2022
  data." và tên bộ dữ liệu của study), "Terms of use", "Case IDs" ("Cases are named CASE_0001 to CASE_0154 …"; app không
  nhận tên, ngày sinh hay số hồ sơ), "What these screens show" ("Counts and scores only … No image is shown here."),
  "Lowest-Dice list", "Use" (nghiên cứu và giảng dạy, "Not for diagnosis or treatment decisions"). Ở FIXTURE có thêm mục
  "This build" ("Fixture mode: every number on these screens is a generated placeholder, not a result."). Sheet không có
  phiên bản, mã thí nghiệm, tên capability hay checksum.
- **Sheet Details** (nút Info): "Server details" (bộ dữ liệu kèm phiên bản, dòng tóm tắt thí nghiệm của server,
  "Capabilities: …"), "Median Dice pairs" (mỗi cặp một dòng, ví dụ "25 % data: EXP-U-025, EXP-D-025 not available to
  compare": lý do không so sánh, hoặc quần thể chung), "Lowest-Dice lists" (luật chọn 3 ca, kể cả cách xếp khi bằng
  nhau), rồi mục "This screen".
- **Trạng thái**: 7 trạng thái chung cho cả màn hình (study không lấy được thì cả màn hình báo lỗi). Các phần còn lại
  lỗi riêng: danh sách finding lỗi thì ô "Findings" và "Resolved" hiện "—" kèm một dòng lý do, không bao giờ là 0; số ca
  không đọc được thì ô "Cases" hiện "—" kèm "case counts unavailable" hoặc "total unavailable"; chưa thí nghiệm nào được
  liệt kê thì mục "Lowest Dice" ghi "no listed experiment, so no lowest-Dice selection to show"; thí nghiệm không có danh
  sách thì lý do của nó nằm dưới hàng "Experiment". Dữ liệu thật chưa có UNet nên cả ba dòng Median Dice ghi "Not
  compared".
- **Thao tác**: chạm ô "Cases" hoặc "Findings"; chạm một dòng Median Dice; chọn thí nghiệm ở hàng "Experiment"; chạm một
  dòng ca Dice thấp; mở "About this data". Link không mở được (một thí nghiệm của cặp chưa có, hoặc ca không nêu run)
  thì hiện dòng "Cannot open: <lý do>", app không làm gì khác. Lý do viết bằng chữ thường: tên thí nghiệm thay cho mã
  ("Cannot open: UNet 25 %, DINOv2 25 % not available to compare"), không có mã luật, chỗ trỏ tới đặc tả hay tên trường.
  Câu đầy đủ của model vẫn nằm trong sheet Details. Ô "Resolved" chỉ để đọc.
- **Điều hướng**: SCR-02 (ô "Cases"), SCR-08 (ô "Findings"), SCR-07 (dòng Median Dice, kèm hai thí nghiệm của cặp),
  SCR-03 (dòng ca Dice thấp, kèm ca, run, biến thể và thí nghiệm do server nêu). Tab Experiments của thanh tab mở SCR-07
  cho cả ma trận.
- **Vùng chạm**: mỗi dòng và hàng chạm được cao ít nhất 48 dp (dòng Median Dice và dòng ca Dice thấp cao 40 dp nên được
  nới `hitSlop`); ô của dải ba ô là thành phần dùng chung đã đo ở `touch_targets.mjs`. Đo từ style trong render smoke,
  chưa đo trên điện thoại.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-01.png` (chưa có).

### SCR-02 — Case List (Phạm Tuấn Anh)

- **Mục đích**: tìm ca, xếp ca theo Dice của một thí nghiệm và mở ca.
- **Thành phần**: ô tìm "Search case ID"; ba tab lọc "All", "Evaluation", "Inference & review", mỗi tab kèm số ca của
  trang đã tải; nút "Dice of" ghi thí nghiệm theo tên người đọc ("DINOv2 100 % · Raw"), chạm mở sheet "Dice of" với
  "None (no Dice)" và các thí nghiệm (mã thí nghiệm ở dòng phụ); nút thứ tự "Server" / "Worst first"; tiêu đề cột
  "Case" và "Dice". Mỗi dòng ca cao 52 dp: mã ẩn danh, một thẻ ("Outlier n/3" là lựa chọn của server; "Mode unclear" khi
  chế độ và cờ GT mâu thuẫn; tên chế độ khi ca không phải Evaluation), thanh Dice và giá trị 3 chữ số. Ca không có Dice
  ghi bằng chữ ("No GT", "Run failed", "Not in this experiment", "Excluded", "Dice not stated"), không bao giờ là 0. Với
  "Worst first", ca có Dice xếp từ thấp lên (bằng nhau thì nhiều FP + FN hơn trước, rồi theo mã ca), ca không có Dice
  nằm dưới tiêu đề "No Dice for this experiment" theo thứ tự server. Sheet Details: thí nghiệm, biến thể và phiên bản
  chỉ số của Dice, cách xếp "Worst first", nghĩa của "Outlier n/3", số ca của trang theo chế độ.
- **Mặc định**: khi người dùng chưa chọn, "Dice of" là thí nghiệm DINOv2 ở tỉ lệ dữ liệu lớn nhất server liệt kê, Raw
  trước Processed, và Details ghi "Chosen for you: …"; nếu câu trả lời của thí nghiệm đó không có Dice nào thì app chuyển
  sang thí nghiệm kế tiếp. "None (no Dice)" là lựa chọn riêng của người dùng. Thí nghiệm và thứ tự đã chọn giữ trong
  phiên.
- **Trạng thái**: 7 trạng thái chung cho danh sách ca. Một dòng ghi chú dưới nút khi không có Dice để hiện ("Choose an
  experiment to see each case's Dice.", "Loading the Dice of …", "Dice unavailable: …"); server trả giá trị của biến
  thể khác thì không hiện Dice ("Asked for …; the server answered with … values, so no Dice is shown."). Server còn trang
  sau thì cuối danh sách ghi "The server has more cases than this page (next_page is set). This build lists the first
  page only."; dòng không có `case_id` ghi "Row n: row has no case_id - not openable.".
- **Thao tác**: gõ tìm, chọn tab, chọn thí nghiệm, đổi thứ tự, kéo xuống để tải lại, chạm một ca; "Open <ID> directly"
  khi mã gõ vào không có trong trang đã tải.
- **Điều hướng**: SCR-03, kèm run và biến thể của thí nghiệm đang chọn khi ca có run trong thí nghiệm đó; không thì chỉ
  kèm mã ca.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-02.png` (chưa có).

### SCR-03 — Case Explorer (Phạm Tuấn Anh)

- **Mục đích**: xem MRI từng lát với lớp dự đoán và GT.
- **Trước khi xem**: khi ca có nhiều run mà đường dẫn chưa nêu run, hoặc chưa có biến thể, app hiện màn chọn: mục
  "Analysis run" (danh sách run; run được hỏi mà ca không có thì ghi "The requested run is not one of this case's runs.
  Choose one of these:") và mục "Prediction variant" ("No default: choose which prediction to inspect. It stays on
  screen and never changes by itself.", chọn "Raw" hoặc "Processed"). Ca chỉ có một run thì mở luôn run đó; biến thể đã
  chọn trước đó trong phiên được chọn sẵn.
- **Thành phần** (khung viewer): ảnh MRI tràn màn hình, mở ở 1,6 lần vừa khung và ở lát giữa nếu đường dẫn không nêu
  lát. Header nổi: Back, mã ca, dòng phụ "họ mô hình · thí nghiệm" (ca có nhiều run thì dòng phụ có mũi tên, chạm để
  chọn lại run), khiên privacy, Info, "more". Góc trái ghi "MRI" và chế độ ca ("Evaluation" / "Inference & review"); góc
  phải ghi "Slice Dice" và giá trị 3 chữ số hoặc một chữ ("Not applicable", "Unavailable"), "—" khi không có số. Chip
  lớp "Ground truth" (chỉ khi ca có GT) và "Prediction" (chỉ khi có run), cả hai bật sẵn; chip có biểu tượng mắt và ô
  màu, lớp mà lát này không có thì chip mờ đi. Thanh công cụ "Fill" / "Outline" / "Both" (mặc định "Fill"). Panel dưới:
  "Prediction" với "Raw" / "Processed" (không có run thì ghi "No analysis run"), số lát "Slice 45 / 88" (đếm từ 1),
  thanh trượt có vạch mỗi 10 lát, và năm nút: lùi 10 lát, lát trước, Play / Pause, lát sau, tiến 10 lát. Khi zoom khác
  vừa khung và khác lúc mở, góc ảnh ghi mức zoom ("×2.0").
- **Sheet Tools** (nút "more"): mục "Open" có "Error inspector", "3D view", "Review and correct", mỗi dòng ghi nó mở gì
  hoặc vì sao đang khoá ("no ground truth for this case (Inference & review)", "needs an analysis run - …", "needs a
  succeeded run with a reconstruction", "needs this slice's prediction", "this slice did not load"); mục "Display" có
  "Outline width" 1 / 2 / 3 px, "Fill opacity" 25 / 50 / 75 / 100 %, nút "Fit to screen" và "Refresh this slice".
- **Sheet Details** (nút Info): "This slice" ("Slice 45 / 88 · z 44", dòng Dice kèm biến thể và phiên bản chỉ số, mã và
  checksum của MRI, dự đoán và GT, toạ độ lần chạm cuối), "Run" (run, họ mô hình, thí nghiệm, tính sẵn hay chạy mới),
  "Case and layers" (chế độ ca, lớp nào đang hiện và vì sao ẩn, ghi chú hình học chưa kiểm định), "Privacy", "Scripted
  runs".
- **Trạng thái**: ca chưa có run → chỉ MRI (và GT nếu có), dòng phụ "No analysis run", ba lối mở trong Tools khoá kèm lý
  do; lát lỗi hay không có → bảng trạng thái thay cho ảnh, không giữ số hay lớp của lát trước (Retry / Refresh chỉ tải
  lại lát đó); run đang chạy → "Analysis is still running" với "Refresh"; run thất bại → nút "View failure reason"; dữ
  liệu sai → chặn kèm mã; ảnh khác kích thước hình học → không vẽ lớp mask và ghi lý do; ảnh không tải được → nút "Fetch
  the image again"; FIXTURE không có pixel → vẽ lưới thay ảnh và ghi chú.
- **Thao tác**: kéo thanh trượt; nút bước (giữ lát trước / lát sau để lặp); lùi / tiến 10 lát; Play (khoảng 5 lát mỗi
  giây, dừng ở lát cuối; bấm Play ở lát cuối thì chạy lại từ lát 1); chụm hai ngón để zoom (từ vừa khung tới 16 lần,
  chụm vào dừng ở vừa khung), kéo một ngón để di, chạm đúp để zoom 2x / về vừa khung; chạm ảnh ghi toạ độ pixel nguồn
  vào Details; bật / tắt chip lớp; đổi biến thể; nhấn giữ số lát mở kịch bản đo A9 / L4 (công cụ đo hiệu năng).
- **Điều hướng**: SCR-04, SCR-05 (mở tại lát hiện tại), SCR-06, đều qua sheet Tools. Back về SCR-03 mở lại đúng run,
  biến thể và lát đang xem.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-03.png` (chưa có).

### SCR-04 — Error Inspector (Phạm Tuấn Anh)

- **Mục đích**: xem dự đoán lệch GT ở đâu.
- **Thành phần**: header thường (tiêu đề "Error Inspector", dòng phụ "ca · biến thể", chỉ báo chế độ, khiên privacy,
  Info) và thanh tab. Ô ảnh vuông rộng hết màn hình: lát với lớp TP / FP / FN, mặc định vẽ cả phần tô và viền ("Both"),
  viền FP nét đứt; góc trái "Prediction" và "Raw vs ground truth" (hoặc "Processed …"); góc phải "Slice Dice"; chip
  "TP n px", "FP n px", "FN n px" (biểu tượng mắt, ô màu, ô của FP nét đứt), chạm để ẩn / hiện lớp; thanh "Fill" /
  "Outline" / "Both". Panel: "Errors of" và biến thể, "Slice 45 / 88", thanh trượt và năm nút như SCR-03. Mục "Legend"
  (kèm số lát): mỗi lớp một dòng ("TP - agree", "FP - over-segmentation", "FN - missed", số pixel, "(hidden)" khi đang
  ẩn); dòng "Matches the server for this slice (…)" hoặc "Differs from the server for this slice: …"; cảnh báo khi mask
  đang vẽ không phải mask mà số của server nói tới (khi đó không so); "Fill opacity" 40 / 60 / 80 / 100 % và "Outline
  width" 1 / 2 / 3 px. Mục "Worst slices": tối đa 5 lát theo thứ tự server, lát đầu là nút "Jump to the worst slice" kèm
  dòng "Slice 53 / 88 · Dice 0.620 · FP 120 · FN 340", các lát sau ghi "#2" … "#5"; lát server nêu mà nằm ngoài khối thì
  vẫn liệt kê nhưng không mở ("outside this volume (z 0..87) - not opened"). Mục "Error profile" ("FP + FN per slice"): mỗi lát có GT một cột, lát không có GT không có
  cột (không phải 0), lát đang xem có viền; chạm một cột để mở lát đó. Mục "Case metrics": Dice, IoU, "Volume error"
  (RVE, %) của cả ca và dòng "FP … · FN … voxels". Nút "3D error view".
- **Sheet Details**: "This slice" (số lát kèm `z`, dòng Dice, mã mask tham chiếu và dự đoán), "Run" (run và biến thể,
  phiên bản chỉ số ca, luật và phiên bản chọn lát tệ), "Where the numbers come from" (chỉ số ca, lát tệ và biểu đồ là của
  server; số pixel TP / FP / FN đếm trên điện thoại từ hai mask đang vẽ), "Privacy".
- **Trạng thái**: ca không có GT → bảng "Unavailable" và câu "… so there is no disagreement, metric or worst slice to
  show - not zero."; số của server cho biến thể khác → mục lát tệ ghi "Cannot show this safely", không có lát tệ, biểu
  đồ hay chỉ số ca; luật hoặc phiên bản chọn lát tệ khác bản mà hợp đồng ghim → không liệt kê lát nào, ghi lý do
  (`SELECTION_RULE_UNSUPPORTED`, `SELECTION_VERSION_UNSUPPORTED`); lát lỗi → bảng trạng thái thay ảnh, không giữ lớp,
  số hay mã của lát trước, nút "3D error view" khoá ("this slice did not load"); 7 trạng thái chung.
- **Thao tác**: chạm "Jump to the worst slice", một dòng lát tệ hoặc một cột biểu đồ để tới lát đó; chuyển lát, Play;
  ẩn / hiện lớp lỗi; đổi kiểu vẽ, độ mờ, độ dày viền; chụm để zoom, kéo để di, chạm đúp.
- **Điều hướng**: "3D error view" mở SCR-05 tại lát hiện tại, lớp lỗi bật sẵn.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-04.png` (chưa có).

### SCR-05 — 3D Inspector (Vũ Hùng Anh)

- **Mục đích**: xem hình 3D nhĩ trái, lỗi 3D, và nhảy về đúng lát 2D.
- **Thành phần**: dòng "Run … · prediction … · L0 surface (undecimated)"; WebView 3D với bề mặt dự đoán (đặc), bề mặt GT
  (trong suốt) và điểm lỗi (FN chấm tròn, FP ô vuông) kèm chú giải và số đếm; dải lát hiện tại; trục voxel ở góc; hàng
  công tắc từng lớp và độ mờ 30 / 60 / 100 % cho hai bề mặt, số tam giác mỗi lớp; nút ±X / ±Y / ±Z, Fit, "Cut at slice",
  Previous / Next; thẻ vùng chọn với "Open in 2D".
- **Trạng thái**: không có lưới → báo lý do; ca không GT → không có lớp GT và điểm lỗi; thiếu file lỗi → bề mặt vẫn hiện,
  hàng "Errors" ghi lý do; ghi chú hình học chưa kiểm định (không mm, không hướng giải phẫu).
- **Thao tác**: xoay, zoom, di; chạm bề mặt hoặc điểm lỗi để chọn; Previous / Next qua các vùng (hết FN rồi FP, vùng lớn
  trước); cắt tại lát; đổi góc nhìn.
- **Điều hướng**: "Open in 2D" → SCR-03 tại lát đã chọn (chỉ khi bấm).
- Ảnh chụp màn hình: `docs/figures/screens/SCR-05.png` (chưa có).

### SCR-06 — Review / Correction (Nguyễn Gia Đức Trung)

- **Mục đích**: chấp nhận, gắn cờ hoặc sửa mask dự đoán mà không ghi đè bản gốc.
- **Thành phần**: câu hỏi "Which prediction do you want to review?" khi đường dẫn chưa nêu biến thể (RAW / PROCESSED);
  trạng thái review và nguồn (mã mask, biến thể); nút Accept và Flag (hộp lý do bắt buộc, bộ đếm ký tự, cảnh báo riêng
  tư, nút "Flag anyway"); nút ‹ › chuyển lát với nhãn "slice z / tổng" (z đếm từ 0); vùng ảnh: mask nguồn vẽ thành
  viền, nét sửa trong suốt bên trên, vòng tròn bút ở ngón tay và dòng "Add · 5 px at x, y"; thanh công cụ Brush / Pan, Add / Erase, cỡ bút 1 / 3 / 5 / 7 / 11 px, Undo / Redo / Reset,
  − / Fit / +; nút giữ "Hold: source"; History; "Cancel edits", Save; "New finding here". Ở FIXTURE, mask thay thế ghi rõ
  SYNTHETIC.
- **Trạng thái**: đang lưu / đã lưu ("SAVED"); "Continuing from version …" khi review đã CORRECTED; bản cũ lệch revision
  → Refresh, không ghi đè; 7 trạng thái chung.
- **Thao tác**: một ngón vẽ; Pan hoặc ngón thứ hai để di; rời màn hình khi còn nét chưa lưu, Reset, Cancel đều hỏi xác
  nhận; Save hỏi "Save correction?" rồi tạo phiên bản mới.
- **Điều hướng**: SCR-08 (form finding đã điền ca, run, biến thể, lát); Back về màn hình trước.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-06.png` (chưa có).

### SCR-07 — Experiment Comparison (Bế Quốc Khánh)

- **Mục đích**: so sánh thí nghiệm theo đúng phán quyết của server.
- **Thành phần**: mở từ tab Experiments là cả ma trận (bảy thí nghiệm; thí nghiệm server chưa liệt kê ghi "Not listed by
  the server"); mở từ một dòng Median Dice của SCR-01 là hai thí nghiệm của cặp đó. Từ trên xuống:
  - Hai dòng "About this data" và "Metric definitions", mỗi dòng mở một sheet.
  - Hàng chọn "Metric" kèm tên chỉ số ("Dice"). Chạm mở sheet "Metric" liệt kê các chỉ số server nêu bằng tên người đọc
    ("Dice", "IoU", "False positives", "False negatives", "Relative volume error"), dấu tích ở chỉ số đang chọn.
  - Mục "Experiments", bên phải ghi "Dice · median". Mỗi thí nghiệm một dòng: khoá họ (UNet chấm tròn xanh, DINOv2 tam
    giác cam), tên ("UNet 25 %", "DINOv2 100 % post-processed"), dòng phụ "5 of 5 cases" (hoặc trạng thái bằng chữ khi
    thí nghiệm chưa tải bình thường, ví dụ "Not listed by the server"), thanh dài bằng trung vị (khi trung vị trong
    0 – 1) và trung vị 3 chữ số.
  - Mục "Distribution per case", bên phải ghi tên chỉ số. Biểu đồ chấm: mỗi thí nghiệm một cột (nhãn "25 %", "50 %",
    "100 %", "100 % PP", tên họ ở dưới), mỗi ca một chấm (UNet tròn, DINOv2 tam giác), một vòng quanh các ca Dice thấp
    nhất do server chọn. Dưới biểu đồ: khoá họ, dòng "One dot per case · a ring marks the 3 lowest-Dice cases · tap a
    dot", và mỗi thí nghiệm không vẽ được chấm có một dòng "<tên>: <lý do>" (trừ thí nghiệm không được liệt kê hay không
    được hỏi). Chạm một chấm hiện "CASE_0003 · 0.610", dòng "Dice · UNet 25 % · one of the 3 lowest-Dice cases" và dòng
    "Open this case".
  - Mục "Comparisons": mỗi phép so sánh một dòng ("UNet vs DINOv2 · 25 %", "UNet vs DINOv2 · 50 %", "UNet vs DINOv2 ·
    100 %", "DINOv2 100 % · raw vs post-processed") với hiệu số trung vị có dấu (DINOv2 trừ UNet, ví dụ "+0.030") hoặc
    chữ "Not compared" khi server không nói so sánh được. Dòng so sánh được mà không có hiệu số (chưa chọn chỉ số, hoặc
    thô vs hậu xử lý vì server giữ lại số) chỉ có tên.
  - Mục "Per-case differences": dòng "One dot per case, lowest difference on the left · tap a dot". Mỗi cặp UNet vs DINOv2
    có đủ dữ liệu là một khối: tên cặp, câu "DINOv2 25 % − UNet 25 % · 4 cases · median +0.065", biểu đồ (trục đối xứng
    quanh 0, đường đứt là 0, đường liền là trung vị, mỗi ca có giá trị ở cả hai run là một chấm, hiệu số thấp nhất ở bên
    trái), dòng "━ median difference ┄ no difference (0)" và, khi có, "1 case without a value in both runs is not
    drawn". Chạm một chấm hiện "CASE_0003: UNet 25 % 0.610, DINOv2 25 % 0.580, difference -0.030" cùng hai dòng "Open in
    UNet 25 %" và "Open in DINOv2 25 %". Cặp mà server không nói so sánh được, hoặc một run không có giá trị từng ca, thì
    không vẽ và ghi "Not shown: <lý do>". Chưa có cặp nào thì ghi "No UNet vs DINOv2 pair is loaded here: both runs of a
    pair must be listed by the server."
  - Mục "Trend over 25 → 50 → 100 %": mỗi họ một nhóm; mỗi run vẽ mọi ca (chấm nhỏ), một thanh q1 – q3 và một vạch trung
    vị. Khi server nói ba run của họ so sánh được thì có thêm một đường qua ba trung vị và một dải q1 – q3 (đường DINOv2
    nét đứt); không thì không có đường hay dải. Dưới biểu đồ: khoá họ và dòng "Dots: cases · bar: q1 to q3 · tick:
    median". Mỗi họ một dòng ("UNet 25 → 50 → 100 %", "DINOv2 25 → 50 → 100 %"), ghi "Not joined" khi không nối.
- **Mặc định**: SCR-07 mở sẵn "Dice" khi tóm tắt của server nêu Dice (chỉ số chính của nghiên cứu); đổi sang chỉ số khác
  bằng hàng "Metric". Trang chỉ hiện trung vị; mean, std, q1, q3 nằm trong sheet của thí nghiệm. Nếu server không nêu
  Dice thì app không tự chọn chỉ số khác: hàng "Metric" ghi "Choose" và có dòng "Pick a metric to see values.".
- **Sheet khi chạm một dòng**:
  - Dòng của "Experiments" mở sheet mang tên thí nghiệm. Mục "Run": "Experiment EXP-U-025", trạng thái, "N intended 5 · N
    successful 5", dòng tóm tắt "dice: median … · mean … · std … · q1 … · q3 … (server summary)", dòng ngữ cảnh (mô hình,
    biến thể, mức "COHORT", quần thể, N, phiên bản chỉ số). Mục "Comparability" (ví dụ "comparable with EXP-D-025
    (server)") và "Warnings". Rồi mục "Cases": số dòng ("5 row(s) returned, 4 plotted"), các ca Dice thấp nhất ("Outlier
    CASE_0005 · dice 0.400") và từng ca ("CASE_0001 · plotted · 0.910"; ca FAILED, EXCLUDED, WITHHELD ghi lý do và không
    có số). Mỗi ca là một dòng mở SCR-03 và đóng sheet.
  - Dòng của "Comparisons" mở sheet mang tên phép so sánh. Mục "Verdict" (ví dụ "comparable (server verdict)", lý do của
    server, "common population …"), "Difference" ("median dice: EXP-D-025 0.685 vs EXP-U-025 0.655, difference +0.030
    (server common-population summaries)" hoặc "no difference shown: …") và "Values".
  - Dòng của "Trend over 25 → 50 → 100 %" mở sheet mang tên dòng đó. Mục "Values" (giá trị từng mức), "Line"
    ("joined: the server judged these runs comparable" hoặc "not joined: <lý do>") và "Verdict".
  - "Metric definitions": nghĩa của từng chỉ số ("Dice: overlap of prediction and reference, 0 to 1; higher is better",
    …), chỉ số đang chọn sáng hơn; "HD95", "Volume (mL)", "Surface distance (mm)" ghi "locked" vì hình học chưa kiểm
    định. "About this data": cùng nội dung với SCR-01, trừ dòng tên bộ dữ liệu.
- **Sheet Details** (nút Info): mục "Run details": cách ma trận được lấp ("The experiment matrix, filled from the
  server's experiment list" hoặc "Comparing … (opened with explicit ids)"), "n experiment(s) listed by the server",
  thí nghiệm ngoài ma trận, và dòng ngữ cảnh của từng thí nghiệm; rồi mục "This screen". Mã thí nghiệm, mức tổng hợp,
  quần thể và phiên bản chỉ số chỉ nằm trong các sheet, không nằm trên trang (trên trang chỉ có số ca, ví dụ "5 of 5
  cases").
- **Trạng thái**: 7 trạng thái chung (server chưa liệt kê thí nghiệm nào thì "Unavailable" kèm "Refresh"). Server không
  nêu chỉ số nào thì không có hàng "Metric" và trang ghi "The server's summaries name no metric yet - nothing to plot.".
  Cặp không so sánh được thì dòng "Comparisons" ghi "Not compared", lý do nằm trong sheet, không vẽ hiệu số, hai dòng
  xu hướng ghi "Not joined", không có đường hay dải. Mở cho một cặp thì các thí nghiệm và phép so sánh không được hỏi
  không hiện.
- **Thao tác**: đổi chỉ số; chạm một chấm rồi "Open this case" hoặc "Open in <run>"; chạm một dòng của "Experiments",
  "Comparisons" hay xu hướng để mở sheet; mở "Metric definitions" và "About this data".
- **Điều hướng**: SCR-03 (ca, run, biến thể và thí nghiệm do server nêu). Link không mở được thì hiện lý do dưới dòng
  hoặc "Cannot open: <lý do>". Dòng "Cannot open" của SCR-07 viết lý do giống SCR-01 (cùng một hàm, `blockedText`).
- **Vùng chạm**: mỗi dòng và hàng chọn cao ít nhất 48 dp; một chấm trên biểu đồ (strip, hiệu số) chọn được khi chạm trong
  bán kính 24 dp quanh tâm, chấm gần nhất được chọn. Đo từ style và phép thử chạm trong test, chưa đo trên điện thoại.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-07.png` (chưa có).

### SCR-08 — Findings (Nguyễn Gia Đức Trung)

- **Mục đích**: ghi và quản lý phát hiện gắn bằng chứng.
- **Thành phần**: khi mở từ SCR-06: form tạo finding (loại, ghi chú tối đa 500 ký tự với bộ đếm và cảnh báo riêng tư,
  nút "Create anyway"); danh sách mới nhất trước ("n of m shown · newest first") với ca, lát, run, biến thể, loại, trạng
  thái; chip lọc trạng thái và loại có đếm; mỗi finding có "Open evidence", Resolve / Reopen, "Review / correct" (khi có
  run); nút "Export PDF".
- **Trạng thái**: 7 trạng thái chung; APK chưa có `expo-print` thì nút PDF tắt và nói rõ.
- **Thao tác**: tạo, lọc, đánh dấu đã xử lý / mở lại, mở bằng chứng, xuất PDF.
- **Điều hướng**: SCR-03 (bằng chứng ca / lát), SCR-07 (finding chỉ gắn thí nghiệm), SCR-06.
- Ảnh chụp màn hình: `docs/figures/screens/SCR-08.png` (chưa có).

### SCR-09 — Trạng thái lượt chạy phân tích

Không xây trong bản này (app không yêu cầu chạy phân tích mới); xem *Hướng phát triển* ở
[02_yeu-cau-chuc-nang.md](02_yeu-cau-chuc-nang.md).
