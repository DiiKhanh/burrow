# Space chỉ Move to Trash, chỉ dưới `$HOME`, và chỉ item có trong lần Measure hiện tại

Space (v2) cho người dùng tự chọn file và thư mục bất kỳ để bỏ đi, không còn là junk do Mole đề xuất như Clean. Vì vậy Burrow quyết định: trong Space chỉ có **Move to Trash**, không bao giờ Delete; chỉ path dưới `$HOME` mới chọn được, path ngoài `$HOME` (ví dụ `/Applications`, `/Library`) chỉ có Reveal in Finder; engine chỉ nhận id của item có trong kết quả Measure hiện tại (không nhận path) và chạy lại đúng guard của ADR 0003, cộng thêm luật cấm chọn chính `$HOME` và các thư mục cấp một của nó (Documents, Desktop, Downloads...). Mỗi lần bỏ ghi vào `history.jsonl` như Clean.

## Considered Options

- **Chỉ đọc, Reveal in Finder**: an toàn nhất nhưng người dùng phải tự đi xóa, mất lý do chính để mở Space.
- **Cho cả Delete**: giải phóng ngay nhưng không hoàn tác được với dữ liệu người dùng tự chọn, thứ Burrow không biết có tạo lại được hay không.
- **Cho path ngoài `$HOME`**: cần admin với phần lớn path hệ thống, phá ràng buộc không sudo.

## Consequences

- Số GB trong Space sau khi bỏ là "moved to Trash", không phải "freed"; ổ chỉ trống khi người dùng dọn Trash (hoặc chạy Clean với nhóm Trash).
- Uninstall app trong `/Applications` không làm được qua Space; đó là tính năng riêng, cần mô hình an toàn riêng.
