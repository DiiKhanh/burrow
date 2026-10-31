# Space chỉ Move to Trash, chỉ dưới `$HOME`, và chỉ item có trong lần Measure hiện tại

Space (v2) cho người dùng tự chọn file và thư mục bất kỳ để bỏ đi, không còn là junk do Mole đề xuất như Clean. Vì vậy Burrow quyết định: trong Space chỉ có **Move to Trash**, không bao giờ Delete; chỉ path dưới `$HOME` mới chọn được, path ngoài `$HOME` (ví dụ `/Applications`, `/Library`) chỉ có Reveal in Finder; engine chỉ nhận id của item có trong kết quả Measure hiện tại (không nhận path) và chạy lại đúng guard của ADR 0003, cộng thêm luật cấm chọn chính `$HOME` và mọi file, thư mục cấp một của nó (Documents, Desktop, Downloads...) và luật cấm chọn vùng Clean dọn, vì mỗi loại rác chỉ có một nơi để bỏ. Mỗi lần bỏ ghi vào `history.jsonl` như Clean.

Danh sách cấm của Clean chặn cả những gì nằm trong Desktop, Documents, Downloads, Movies, Music, Pictures và Public; Space chỉ chặn chính bảy thư mục đó và cho chọn phần bên trong, vì đó là chỗ người dùng tự giữ file và là lý do chính để mở Space (Old Downloads, một file phim lớn). Lý do khác với Clean: item ở đây do người dùng tự chọn và chỉ vào Trash, còn Clean xóa theo đề xuất của Mole, có khi xóa hẳn, nên guard của Clean giữ nguyên. Mọi path khác trong danh sách cấm (`.ssh`, `.gnupg`, `Library/Mail`, Keychains, iCloud, dữ liệu của Burrow) vẫn bị chặn cả phần bên trong.

## Considered Options

- **Chỉ đọc, Reveal in Finder**: an toàn nhất nhưng người dùng phải tự đi xóa, mất lý do chính để mở Space.
- **Cho cả Delete**: giải phóng ngay nhưng không hoàn tác được với dữ liệu người dùng tự chọn, thứ Burrow không biết có tạo lại được hay không.
- **Cho path ngoài `$HOME`**: cần admin với phần lớn path hệ thống, phá ràng buộc không sudo.

## Consequences

- Số GB trong Space sau khi bỏ là "moved to Trash", không phải "freed"; ổ chỉ trống khi người dùng dọn Trash (hoặc chạy Clean với nhóm Trash).
- Một số thư mục có checkbox nhưng guard luôn bỏ qua với lý do `protected` (ví dụ `Library/Application Support`, vì chứa dữ liệu của Burrow): `blocked` chỉ nêu ba lý do theo path, không lặp lại cả danh sách cấm.
- Uninstall app trong `/Applications` không làm được qua Space; đó là tính năng riêng, cần mô hình an toàn riêng.
