# Tham chiếu UI của Mole for Mac (Clean và Status)

Ticket: [#4](https://github.com/DiiKhanh/cleaner-app/issues/4). Ngày nghiên cứu: 2026-10-22. Phiên bản app hiện tại lúc nghiên cứu: v1.17.0 "Vega" (2026-10-18), theo [mole.fit/releases](https://mole.fit/releases.md).

Tài liệu này chỉ mô tả bố cục và tương tác bằng lời. Mọi ảnh và video đều được link về nguồn gốc của tác giả (tw93), không tải về hay commit vào repo. Burrow không được dùng lại bất kỳ asset nào của Mole for Mac: logo con chuột chũi, texture hành tinh, icon, ảnh, font riêng (nếu có), câu thơ.

## Tóm tắt

- Mole for Mac là app SwiftUI native, đóng nguồn, $19 trọn đời, macOS 14+ ([docs](https://mole.fit/docs.md), [mole.fit](https://mole.fit/)). Nó là một bản cài đặt riêng, không gọi Mole CLI ([index.md](https://mole.fit/index.md)).
- **Không có sidebar.** Điều hướng chính là một thanh tab dạng viên thuốc (pill/segmented control) nằm giữa phía trên cửa sổ: avatar logo, rồi `Clean`, `Apps`, `Optimize`, `Analyze`, `Status`. Tab đang chọn là viên trắng với chữ đen; tab khác là chữ xám nhạt trên nền trong suốt. Phím tắt ⌘1 đến ⌘5 chuyển tab ([releases v1.15.0](https://mole.fit/releases.md)). Bản v1.4.1 từng nhắc tới "sidebar badge", nên giao diện đời đầu có thể đã có sidebar, nhưng bản hiện tại thì không.
- **Chỉ có dark mode**, cố ý ([The Design of Mole](https://mole.fit/blog/the-design-of-mole)). Mỗi tab có một tông nền riêng gắn với "hành tinh" của tab: Clean là Trái Đất (navy xanh đậm), Status là Mặt Trời (nâu olive/hổ phách ấm).
- **Clean** là một màn hình "hero" tối giản: hành tinh xoay ở giữa, một con số lớn, một nút trắng dạng pill. Danh sách review mở ra như một overlay toàn cửa sổ, mỗi danh mục là một card có checkbox, mô tả, dung lượng bằng font monospace, chevron mở rộng, và footer cố định chứa nút hành động chính.
- **Status** là lưới bento 4x2 card (Health, CPU, GPU, Memory, Battery, Disk, Network, Fan) với sparkline 60 giây, bên dưới là bảng process có thể sort.
- Triết lý thiết kế: "quiet", không nhấp nháy, layout giữ chỗ trước khi có dữ liệu, chờ ngắn thì không hiện gì, chờ lâu mới hiện một trạng thái "working" duy nhất, tôn trọng Reduce Motion ([The Design of Mole](https://mole.fit/blog/the-design-of-mole)).

## Nguồn ảnh và video (chỉ link, không tải về repo)

Ảnh chụp chính thức trên trang chủ [mole.fit](https://mole.fit/) (2584x1741, có bản webp 828w/1400w/1980w cùng thư mục):

| Nội dung | URL | Alt text gốc |
|---|---|---|
| Clean, trạng thái scan xong | https://mole.fit/img/en/clean.jpg | "Clean tab showing Earth and the space a scan found, with a button to review the results" |
| Status dashboard | https://mole.fit/img/en/status.jpg | "Status dashboard with CPU, memory, GPU, disk, network, battery, and processes" |
| AI Cleanup & Care (trang con của Clean, cùng kiểu list review) | https://mole.fit/img/en/ai.jpg | "AI Cleanup & Care page listing AI tool caches, ..." |
| Menu bar panel (phiên bản thu nhỏ của Status) | https://mole.fit/img/en/menubar.jpg | "Menu bar panel showing runner animation, live metrics, ..." |
| About panel, 5 hành tinh | https://mole.fit/img/en/lore.jpg | "About panel showing Mole's five tools as Earth, Mars, Mercury, Jupiter, and the Sun" |
| Ảnh OG (Clean, khung thu nhỏ) | https://mole.fit/img/og-cover.jpg | (không có) |
| Thanh phân bổ dung lượng kiểu System Settings (minh hoạ System Data) | https://mole.fit/img/system-data/en.png | (không có) |

Ảnh và video trên blog của tác giả:

| Nội dung | URL | Nguồn |
|---|---|---|
| Overlay "Ready to clean" (bản dev của v1.16) | https://mole.fit/img/blog/mole-system-data-review.webp | [Revisiting Mole's Clean and Analyze Pages](https://mole.fit/blog/mole-clean-and-analyze-polish) |
| Video demo app 47 giây: Clean (idle, review, đang dọn, hoàn tất), Apps, Analyze, Status, process sheet, menu bar | https://mole.fit/img/blog/mole-mac-demo.mp4 | [The Story of Mole](https://mole.fit/blog/the-story-of-mole) |
| Video website mới (chủ yếu là site, ít UI app) | https://mole.fit/img/blog/new-mole.mp4 | [The Design of Mole](https://mole.fit/blog/the-design-of-mole) |
| Video About panel (hành trình qua 5 hành tinh) | https://cdn.tw93.fun/mole/journey.mp4 | trang chủ [mole.fit](https://mole.fit/) |
| Settings General (bản dev) | https://mole.fit/img/blog/mole-settings-general-final.webp | [Fewer Settings, Clearer Choices](https://mole.fit/blog/simplifying-mole-settings) |

Lưu ý: video demo được quay ở bản cũ hơn (nhãn tab viết thường `clean apps optimize analyze status`, health "95"), các ảnh trên trang chủ là bản mới (nhãn tab viết hoa chữ đầu). Bố cục giữa hai bản gần như giống nhau.

## Khung cửa sổ chung

Quan sát từ [clean.jpg](https://mole.fit/img/en/clean.jpg), [status.jpg](https://mole.fit/img/en/status.jpg) và video demo:

- Cửa sổ macOS bo góc lớn, không có title bar hiển thị: nút đèn giao thông nằm trực tiếp trên nền nội dung (full-size content view, titlebar trong suốt). Không có toolbar.
- Thanh tab pill căn giữa ngang, cách mép trên khoảng 60 px (ở kích thước ảnh 2000 px). Bên trái trong thanh là một avatar tròn (logo app, nền trắng); bấm vào nó có thể mở About panel (suy luận từ vị trí, chưa có nguồn xác nhận). Viền thanh là nền trắng mờ rất nhẹ trên nền tối.
- Nhãn tab dùng font **monospace đậm** (trông như SF Mono Semibold); phần nội dung còn lại dùng font sans hệ thống (SF Pro). Đây là quan sát từ ảnh, tác giả không công bố tên font.
- Nền cửa sổ là gradient dọc theo tông của tab: Clean navy xanh (khoảng `#2A3150` ở trên chuyển xuống `#1E2235` ở dưới, ước lượng bằng mắt), Apps nâu đỏ sẫm, Analyze nâu đất, Status olive/nâu hổ phách (khoảng `#4A3F22` xuống `#2E2A22`). Mã màu chỉ là ước lượng từ ảnh nén, không phải token chính thức.
- Mọi kích thước chữ và màu đến từ token dùng chung, "một type scale cho cả app" ([The Design of Mole](https://mole.fit/blog/the-design-of-mole)). Release v1.15 ghi "fonts, icons, menus and dialogs match across pages, and result details mark done, skipped and failed items with one set of colors" ([releases](https://mole.fit/releases.md)).
- Overlay (review list, AI page, process sheet, Settings, License) che toàn bộ hoặc một phần cửa sổ, đóng bằng nút X tròn xám ở góc phải trên, hoặc phím `Esc` ([help](https://mole.fit/help.md)).

## Màn hình Clean (Earth)

### Luồng

Ghép từ [docs](https://mole.fit/docs.md), [help](https://mole.fit/help.md), [releases](https://mole.fit/releases.md) và video demo:

1. **Idle (chưa scan):** hành tinh Trái Đất xoay chậm ở giữa. Bên dưới là hai dòng thơ ngắn căn giữa (font serif nghiêng nhỏ, màu xám sáng), rồi nút pill trắng "Scan your Mac" (video demo khoảng giây 1.5). Đây cũng chính là empty state: không có danh sách rỗng, chỉ có hành tinh và lời mời scan.
2. **Đang scan:** release v1.17 ghi "the scan progress keeps moving with an estimated percentage"; v1.x trước đó ghi "see the exact path and progress while scanning". Theo design post, "a scan completes before the screen enters its result state", và kết quả không hiện dần từng mảnh. Không tìm thấy ảnh chụp trạng thái scan của bản hiện tại.
3. **Scan xong:** ([clean.jpg](https://mole.fit/img/en/clean.jpg)) hành tinh vẫn ở giữa, phía dưới là tiêu đề lớn đậm "154.19 GB found", dòng phụ xám "136 items in 9 categories · Scan again" (với "Scan again" là link màu xanh nhạt), rồi nút pill trắng rộng "Review results" có bóng mờ. Nếu máy có dữ liệu AI tool, một Mặt Trăng nhỏ xuất hiện ở góc phải trên; bấm vào đó mở trang AI Cleanup & Care ([docs](https://mole.fit/docs.md)).
4. **Review (preview và chọn):** overlay toàn cửa sổ, che cả thanh tab ([mole-system-data-review.webp](https://mole.fit/img/blog/mole-system-data-review.webp), video demo giây 4.4). Chi tiết bên dưới.
5. **Xác nhận:** nút chính ở footer chính là hành động xác nhận, nhãn chứa động từ và dung lượng, ví dụ "Permanently clean · 29.7 GB" (hoặc dạng Move to Trash nếu Settings chọn như vậy). Không thấy dialog xác nhận thứ hai trong video demo; với các mục nguy hiểm hơn như unified log hay Parallels thì có bước review và confirm riêng ([docs](https://mole.fit/docs.md)).
6. **Đang dọn:** (video demo giây 7.4, suy luận là bước dọn vì nằm ngay sau review) quay về màn hero với hành tinh, con số dung lượng lớn dạng bộ đếm có hiệu ứng lăn chữ số (các chữ số đang đổi bị mờ dọc), một dòng tiến trình nhỏ có chấm xanh, tên mục hiện tại và bộ đếm "22/37", và bên dưới là một ô danh sách cuộn các mục vừa xong, mỗi dòng có dấu tick xanh, tên mục bằng font monospace và dung lượng căn phải, các dòng ở mép trên và dưới mờ dần (fade mask).
7. **Hoàn tất:** (video demo giây 10.3) hành tinh, con số lớn "1.07 GB", dòng phụ "≈ 4 min 4K · 1 skipped · Lifetime: 467.99 GB", rồi nút pill viền (outline, nền tối, chữ xanh) "Return to Earth". Bản hiện tại có thêm dòng kiểu "128 cleaned · $20 of Mac storage" (giá trị tương đương dung lượng SSD khi mua Mac, ẩn nếu dưới 1 GB) ([help](https://mole.fit/help.md)). Bấm vào summary mở "result details" liệt kê mục done, skipped, failed theo nhóm với cùng một bộ màu cho cả Clean, Uninstall và Optimize ([releases v1.12](https://mole.fit/releases.md)). Mỗi dòng failed có lý do ([help](https://mole.fit/help.md)).

### Overlay review "Ready to clean"

Mô tả từ [mole-system-data-review.webp](https://mole.fit/img/blog/mole-system-data-review.webp) (bản dev v1.16) và video demo:

- **Header:** tiêu đề lớn đậm "Ready to clean", căn trái. Dòng phụ xám: "29.7 GB cleanable · 114 items · 8 categories · Grok Bot, Helium, ... holding cache · Quit" (app đang giữ cache được nêu tên kèm link "Quit"). Góc phải: icon refresh (scan lại) và nút X tròn đóng overlay.
- **Danh sách:** các card bo góc, nền sáng hơn nền cửa sổ một chút, khoảng cách đều giữa các card. Mỗi card gồm:
  - Checkbox vuông bên trái có ba trạng thái: tick (chọn hết), gạch ngang (chọn một phần, ví dụ "58/70 selected"), trống. Có thêm trạng thái khoá (icon ổ khoá, khi danh mục không chọn được, ví dụ Browsers khi trình duyệt đang mở) và chấm tròn (nhóm chỉ để xem như "Other Storage", sau đổi tên thành "Manage Separately").
  - Bản demo cũ có thêm icon line nhỏ cho từng danh mục giữa checkbox và tên; bản dev v1.16 thì không.
  - Tên danh mục đậm (ví dụ "App Caches"), ngay sau là "36/36 selected" bằng font monospace xám nhỏ.
  - Dòng mô tả ngắn nói hậu quả khi xoá: "App temporary files. Regenerated next launch.", "Xcode / SwiftPM / node caches. First build will be slower.", "Empties your Trash permanently."
  - Bên phải: dung lượng bằng font monospace màu xanh nhạt, dạng "đã chọn / tổng" như "17 GB / 49.2 GB", và chevron để mở danh sách con (từng path, có thể bỏ chọn từng mục, có lệnh "Never Clean This" [help](https://mole.fit/help.md)).
- **Thứ tự nhóm:** app caches, developer, AI, communication, design tools, leftovers của app đã gỡ, System Data, rồi Trash cuối cùng; "Manage Separately" (backup, iCloud local, VM, model) chỉ xem, không chọn được, không tính vào tổng ([docs](https://mole.fit/docs.md), [blog polish](https://mole.fit/blog/mole-clean-and-analyze-polish)). Release cũ ghi "results sorted by deletion impact (regenerable caches first, user-visible state last)".
- **Mặc định chọn:** mục an toàn được tick sẵn; mục "review-only" (cache gói có chi phí build lại, build output, node_modules cũ) để trống cho đến khi người dùng xác nhận ([docs](https://mole.fit/docs.md)).
- **Footer cố định:** một dải nền tối hơn ở đáy. Bên trái: "114 selected" và các link nhanh "All · None · Recommended" (link đang không áp dụng được thì mờ). Bên phải: nút pill trắng lớn chữ đen đậm "Permanently clean · 29.7 GB". Release v1.15 ghi "Clean buttons stay visible on small screens".

Trang AI Cleanup & Care ([ai.jpg](https://mole.fit/img/en/ai.jpg)) dùng cùng ngôn ngữ nhưng có thêm **section header**: tiêu đề nhóm đậm kèm tổng dung lượng monospace (ví dụ "Sessions and worktrees 5.32 GB") và bên phải là câu cảnh báo xám ("Removed sessions cannot be resumed, review each item"). Các card trong cùng một section được ghép thành một khối có đường kẻ ngăn. Một số dòng có dropdown nhỏ dạng pill ("Older than 90 days ⌄"). Footer: "10 selected" và nút "Clean up · 34.41 GB".

### Trạng thái đặc biệt

- **Thiếu Full Disk Access:** app vẫn chạy nhưng scan nhỏ hơn nhiều; Doctor overlay cảnh báo và link tới help ([help](https://mole.fit/help.md), [docs](https://mole.fit/docs.md)). Không tìm thấy ảnh chụp banner hay màn hình cụ thể cho trạng thái này.
- **Không tìm thấy gì để dọn:** không tìm thấy ảnh hay mô tả chính thức.
- **Bản dùng thử:** scan và review luôn miễn phí, mỗi tool trả phí dùng được hai lần ([docs](https://mole.fit/docs.md)). Không tìm thấy ảnh của paywall.

## Màn hình Status (Sun)

Mô tả từ [status.jpg](https://mole.fit/img/en/status.jpg), video demo (giây 30 đến 47) và [docs](https://mole.fit/docs.md):

### Bố cục

- Thanh tab pill như mọi tab, `Status` được chọn.
- **Lưới bento 4 cột x 2 hàng**, card bo góc, nền hơi sáng hơn nền cửa sổ, viền mảnh. Cột Health và Battery rộng gấp khoảng 1.5 lần các cột khác.
  - Hàng 1: **Health** (rộng), **CPU**, **GPU**, **Memory**.
  - Hàng 2: **Battery** (rộng), **Disk**, **Network**, **Fan**.
  - Máy không có pin thì card Thermal thay Battery; máy không có quạt thì Thermal thay Fan ([docs](https://mole.fit/docs.md)).
- **Bảng process** chiếm phần dưới, nằm trong một card lớn.

### Cấu trúc một card (nhất quán cho mọi card)

- Dòng header: icon line nhỏ có màu + nhãn VIẾT HOA giãn chữ (letter-spacing rộng) như "CPU", "MEMORY"; bên phải là một badge dạng pill nền xám mờ chứa thông tin phụ ("47°C", "Pressure 28%", "995 GB", "Wi-Fi", "Load 0%", "100% Health").
- Giá trị chính rất lớn, đậm, số kiểu tabular ("16"), đơn vị nhỏ hơn và xám nằm sát bên ("%", "GB", "KB/s").
- Biểu đồ nhỏ ở giữa card:
  - CPU: biểu đồ cột (bar sparkline) màu xanh ngọc, cột thấp là gạch ngang mảnh.
  - GPU, Memory, Network: đường line mảnh; Memory có vùng fill gradient dưới đường (vàng hổ phách), Network màu xanh dương nhạt (bản demo có hai đường lên và xuống).
  - Disk: thanh tiến trình ngang dày bo tròn, fill gradient màu be/vàng cát.
  - Sparkline thể hiện 60 giây gần nhất ([index.md](https://mole.fit/index.md)).
- Dòng chú thích dưới cùng màu xám: "idle · Load 4.6 / 18 cores", "34.74 GB · 4.3 MB swap", "703 GB used · 71%", "↑ 9 KB/s · Wi-Fi", "Managed by macOS".

### Nội dung riêng của từng card

- **Health:** nhãn "HEALTH" màu xanh lá với icon mặt trời; các chip phần cứng ở góc phải ("M5 Pro", "48 GB", "macOS 27.0"); điểm "100 Excellent"; dòng trạng thái "All checks passed" (hoặc ví dụ "CPU Running warm" khi điểm 95 trong video demo); "up 13 hours · since Sep 27"; bên phải là hành tinh Mặt Trời xoay (asset của Mole, Burrow phải dùng hình riêng).
- **Battery:** "80% Plugged In ⚡60W", "52 cyc", ba vòng tròn tiến trình nhỏ viền xanh lá cho pin của thiết bị Bluetooth (laptop, điện thoại, tai nghe), và dòng "Top drain prl_vm_app · 128.4" bấm vào sẽ mở sheet giải thích process đó.
- **Fan:** "0 RPM", segmented control ba nút pill "Auto / Cool / Max" (nút chọn có nền nâu sáng hơn), chú thích "Managed by macOS".

### Bảng process

- Header cột VIẾT HOA xám giãn chữ: "NAME (153)", "MEM", "% CPU", "PWR", "PID"; bấm để sort, bấm lần nữa để đảo chiều; bản demo có mũi tên sort nhỏ cạnh tên cột.
- Mỗi dòng: một vạch màu mảnh ở mép trái (đỏ khi CPU rất cao, vàng khi cao, trống khi bình thường), icon app, tên app đậm (có thể kèm icon lửa khi tốn năng lượng), bộ nhớ, một mini progress bar ngang cho CPU kèm số (đỏ, vàng hoặc trắng tuỳ mức), power, PID màu xám, và nút "···" ở cuối.
- Cập nhật mỗi giây. Bấm dòng mở **sheet giải thích** (overlay giữa cửa sổ: icon và tên app, câu giải thích bằng ngôn ngữ thường như "launchd reports this process was started by launch job demand", bảng chi tiết Threads, Open Files, Disk I/O, Children, User, Working Directory, Executable, và các nút ở đáy "Copy Summary", "Reveal", "Terminate", "Force Quit" màu đỏ). Chuột phải: Pin/Unpin (giữ ở đầu danh sách), Terminate, Copy Executable Path ([docs](https://mole.fit/docs.md), video demo giây 33.8).

### Menu bar panel

Không thuộc v1 của Burrow nhưng là cùng ngôn ngữ thiết kế ([menubar.jpg](https://mole.fit/img/en/menubar.jpg)): panel dọc kiểu HUD kính tối, hero Health ở trên, lưới 2 cột các card CPU/GPU/MEM/Disk/Network/Fan thu nhỏ, card Battery rộng, "Top Processes" 5 dòng, hàng công cụ nhanh (camera/mic, Awake, Screen), và "Clean History" với ba số lớn (Cleaned, Uninstalled, Optimized).

## Màu sắc

Quan sát từ ảnh (không có bảng màu chính thức):

- Nền theo tab (gradient dọc, tối): Clean navy `~#2A3150 → #1E2235`; Status olive/nâu `~#4A3F22 → #2E2A22`; Apps nâu đỏ sẫm; Analyze nâu đất. Release cũ có dòng "Refined planet colors and accent palette", gợi ý mỗi hành tinh có accent riêng.
- Chữ chính: trắng ngà; chữ phụ: xám ấm khoảng 60 đến 70% độ sáng.
- Nút chính: pill trắng đặc, chữ đen đậm. Nút phụ: pill viền, chữ xanh nhạt ("Return to Earth"). Link nội dòng: xanh nhạt ("Scan again", "All · None").
- Dung lượng trong danh sách Clean: xanh dương nhạt pastel, monospace.
- Status: xanh lá cho trạng thái tốt (nhãn HEALTH, vòng pin), xanh ngọc cho cột CPU, vàng hổ phách cho Memory và mức cảnh báo, đỏ hồng cho mức nguy hiểm (process CPU cao), xanh dương nhạt cho Network, be/cát cho thanh Disk.
- Kết quả done/skipped/failed dùng "one set of colors" thống nhất ([releases v1.15](https://mole.fit/releases.md)), nhưng không tìm thấy giá trị màu cụ thể.

## Typography

- Sans hệ thống (SF Pro) cho tiêu đề, giá trị, mô tả. Tiêu đề màn và số lớn dùng weight Bold/Semibold.
- Monospace (trông như SF Mono) cho: nhãn tab, bộ đếm "x/y selected", dung lượng trong list, tên path và tên mục khi đang dọn.
- Nhãn card Status và header bảng: chữ hoa nhỏ, giãn chữ rộng.
- Số trong Status căn chiều rộng cố định; tác giả viết riêng về việc giữ chỗ cho độ rộng lớn nhất của mỗi số và căn theo nét chữ thật trên menu bar ([Making Mole's Menu Bar Numbers Fit In](https://mole.fit/blog/mole-menu-bar-redesign)).
- Câu thơ trên màn Clean idle và About panel dùng font serif nghiêng.
- Một type scale duy nhất cho cả app, không có kích thước riêng lẻ ([The Design of Mole](https://mole.fit/blog/the-design-of-mole)).

## Iconography

- Icon line mảnh, đơn sắc hoặc có màu nhạt, đặt trước nhãn card Status và trước danh mục Clean (bản demo). Bộ icon đã chuyển từ icon hệ thống sang một bộ phỏng theo Phosphor Icons (khoảng 70% dùng nguyên, 30% SVG tự vẽ), với một quy tắc optical size chung cho mọi icon ([A Careful Refresh of Mole's Icons](https://mole.fit/blog/mole-icon-refresh)). Phosphor có license MIT nên Burrow có thể dùng chính Phosphor hoặc SF Symbols, nhưng không được lấy 30% icon tự vẽ của Mole.
- Mỗi tool có một "hành tinh" 3D xoay làm hình hero: Clean là Trái Đất (texture NASA Blue Marble), Software là Sao Hoả, Optimize là Sao Thuỷ, Analyze là Sao Mộc, Status là Mặt Trời ([The Design of Mole](https://mole.fit/blog/the-design-of-mole)). Đây là asset và ý tưởng nhận diện của Mole; Burrow cần một biểu tượng hero riêng.
- Logo app (chuột chũi) nằm trong avatar tròn ở thanh tab. Không dùng lại.

## Animation và chuyển động

- Hành tinh xoay liên tục, chiều và tốc độ tương đối theo thiên thể thật, render theo refresh rate của màn hình; tạm dừng khi app ở background trên máy Intel hoặc máy yếu; tắt hẳn (static) khi bật Reduce Motion hoặc trên máy Intel dùng lớp tương thích Metal cũ ([The Design of Mole](https://mole.fit/blog/the-design-of-mole), [releases](https://mole.fit/releases.md)).
- Bộ đếm dung lượng lăn số (rolling digits) trong lúc dọn (video demo).
- Danh sách mục vừa xong cuộn lên với fade ở mép (video demo).
- Sparkline Status trượt theo thời gian thực, cập nhật mỗi giây.
- Nguyên tắc: không nhấp nháy ("the hero planet no longer blinks or lingers across scans and tab switches", v1.x), panel hoặc hiện đủ hoặc ẩn, chờ ngắn không hiện loading, chờ lâu hiện một trạng thái working duy nhất, layout hoàn tất giữ chỗ trước để cửa sổ không nhảy, đổi tab không làm chữ đổi weight (chỉ đổi màu) ([The Design of Mole](https://mole.fit/blog/the-design-of-mole), [blog polish](https://mole.fit/blog/mole-clean-and-analyze-polish)).
- Tên dài bị cắt được mở rộng tại chỗ trong dòng (cùng font, cùng nền), không dùng tooltip nổi ([blog polish](https://mole.fit/blog/mole-clean-and-analyze-polish)).

## Gợi ý cho Burrow (rút ra, không phải nguồn)

- Dùng thanh tab pill ở trên thay vì sidebar để bám sát layout. v1 chỉ có hai tab Clean và Status.
- Clean: một state machine rõ ràng `idle → scanning → scanned → reviewing → cleaning → done`, mỗi state là một layout ổn định; review là overlay có footer cố định với nút chứa động từ và dung lượng.
- Status: lưới bento 4x2 cùng một component card (header, badge, giá trị lớn, biểu đồ, chú thích), bảng process bên dưới.
- Tự thiết kế hình hero, màu tab, icon và chữ trang trí; chỉ học bố cục, nhịp chữ và hành vi.

## Những gì không tìm được

- Không có trang App Store (app phân phối trực tiếp qua DMG và Homebrew cask), nên không có ảnh listing chính thức nào khác.
- Không truy cập được bài đăng X/Twitter của tác giả (@HiTw93); tìm kiếm không trả về ảnh hay video từ đó.
- Không có ảnh hay video của **trạng thái đang scan** ở bản hiện tại (chỉ có mô tả "exact path and progress", "estimated percentage"). Bước "đang dọn" trong video demo được suy luận từ thứ tự khung hình.
- Không có ảnh của: danh sách con khi mở chevron trong review, màn result details (done/skipped/failed), dialog xác nhận riêng cho mục nguy hiểm, trạng thái "không có gì để dọn", banner thiếu Full Disk Access, paywall, trạng thái Status khi chưa có dữ liệu.
- Không có bảng màu, tên font, kích thước chữ, spacing hay thông số animation (thời lượng, easing) chính thức. Mọi mã màu ở trên là ước lượng từ ảnh JPEG.
- Kích thước cửa sổ mặc định và tối thiểu: không có nguồn.
- Có lệch nhỏ giữa nguồn: tài liệu gọi tab là "Software", nhưng ảnh chụp hiện tại hiển thị nhãn "Apps".
