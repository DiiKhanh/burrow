# Mole quét, Burrow xóa; Mole được bundle theo version cố định

Mole không có code Go import được (Clean là Bash, Status là `package main`), và `mo clean` không có JSON cũng không chọn được từng mục để xóa. Vì vậy Burrow gọi Mole như subprocess nhưng chia vai: Clean chạy `mo clean --dry-run` rồi parse `~/.config/mole/clean-list.txt` để lấy danh sách rác (Mole quyết định *cái gì là rác*), còn Burrow tự xóa những mục người dùng chọn (Burrow quyết định *xóa gì và xóa thế nào*); Status chạy binary `status` của Mole với `--watch` (NDJSON). Một version Mole cố định được bundle trong `Burrow.app`, không dùng `mo` người dùng tự cài, vì format `clean-list.txt` và schema JSON của Status không có versioning.

## Considered Options

- **Chạy `mo clean` thật, loại trừ bằng whitelist tạm**: bị loại vì ghi đè whitelist của người dùng và bỏ qua mục system-level khi không có TTY.
- **Port rule Clean sang Go**: bị loại, khoảng 23k dòng Bash và phải theo upstream mãi mãi.
- **Copy collector Status (`metrics*.go`) vào Burrow**: bị loại; collector vẫn shell-out tới tool hệ thống nên lợi ích nhỏ, đổi lại phải tự sync một fork.

## Consequences

- Mọi thứ Mole trả về đi qua một adapter, dịch sang type riêng của Burrow; UI không bao giờ thấy Mole. Mole đổi format thì chỉ sửa adapter.
- Size trong `clean-list.txt` là dạng human-readable nên Burrow tự tính lại byte.
- Burrow dùng chung `~/.config/mole/` với Mole người dùng tự cài: tôn trọng `whitelist` của họ và chấp nhận ghi đè `clean-list.txt`. Không chạy hai Scan cùng lúc.
- Guard an toàn lúc xóa của Mole (`safe_remove`, `validate_path_for_deletion`) không còn chạy; Burrow phải tự có (xem ticket mô hình an toàn của Clean).
